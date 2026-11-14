<?php

use App\Models\AnalysisRun;
use App\Models\FiturBulanan;
use App\Models\FlagAturan;
use App\Models\HasilLof;
use App\Models\KlasifikasiPangkalan;
use App\Models\LaporanBulanan;
use App\Models\Pangkalan;
use App\Models\PenyaluranHarian;
use App\Models\User;
use Illuminate\Support\Facades\DB;

test('command import:kjp2026 --fresh berjalan di bawah 30 detik dan bersifat idempoten', function () {
    $start = microtime(true);

    $this->artisan('import:kjp2026', ['--fresh' => true])
        ->assertExitCode(0);

    $elapsed = microtime(true) - $start;
    expect($elapsed)->toBeLessThan(30.0);

    // Jalankan kembali tanpa --fresh untuk menguji idempotensi
    $this->artisan('import:kjp2026')
        ->assertExitCode(0);

    expect(Pangkalan::count())->toBe(30)
        ->and(LaporanBulanan::count())->toBe(293)
        ->and(FiturBulanan::count())->toBe(293)
        ->and(HasilLof::count())->toBe(293)
        ->and(KlasifikasiPangkalan::count())->toBe(30)
        ->and(FlagAturan::count())->toBe(125);
});

test('seeder membuat 1 admin dan 1 petugas', function () {
    expect(User::where('role', 'admin')->count())->toBe(1)
        ->and(User::where('role', 'petugas')->count())->toBe(1);
});

test('run baseline-k10 tersimpan dengan parameter model yang tepat', function () {
    $run = AnalysisRun::where('nama', 'baseline-k10')->first();

    expect($run)->not->toBeNull()
        ->and($run->k)->toBe(10)
        ->and($run->threshold)->toBe(1.5)
        ->and($run->fitur)->toBe([
            'log_total',
            'cv_harian',
            'rasio_hari_aktif',
            'porsi_nilai_dominan',
        ]);
});

test('kode P01 sampai P30 sesuai urutan baris kjp_2026_klasifikasi_pangkalan.csv', function () {
    expect(Pangkalan::count())->toBe(30);

    $p01 = Pangkalan::where('kode', 'P01')->first();
    $p10 = Pangkalan::where('kode', 'P10')->first();
    $p29 = Pangkalan::where('kode', 'P29')->first();
    $p30 = Pangkalan::where('kode', 'P30')->first();

    expect($p01)->not->toBeNull()
        ->and($p01->id_registrasi)->toBe('1291501020032007')
        ->and($p01->nama)->toBe('A SING')
        ->and($p10->id_registrasi)->toBe('1291521020032015')
        ->and($p10->nama)->toBe('TASLIM')
        ->and($p29->id_registrasi)->toBe('1291521020032031')
        ->and($p29->nama)->toBe('KDMP Kuala Sempang')
        ->and($p30->id_registrasi)->toBe('1291551020032033')
        ->and($p30->nama)->toBe('Borang sukamulya');
});

test('angka acuan pangkalan-bulan, masuk model, ditandai, dan sebaran LOF cocok persis', function () {
    $run = AnalysisRun::where('nama', 'baseline-k10')->firstOrFail();

    // 293 pangkalan-bulan; hari Minggu (is_minggu = true) bernilai total 0 tabung
    expect(LaporanBulanan::count())->toBe(293);
    $totalMinggu = (int) PenyaluranHarian::where('is_minggu', true)->sum('volume');
    expect($totalMinggu)->toBe(0);

    // 282 masuk model (lof tidak null), 11 dikecualikan (lof null)
    $masukModel = HasilLof::where('run_id', $run->id)->whereNotNull('lof')->count();
    $dikecualikan = HasilLof::where('run_id', $run->id)->whereNull('lof')->count();
    expect($masukModel)->toBe(282)
        ->and($dikecualikan)->toBe(11);

    // 28 ditandai secara total
    $ditandai = HasilLof::where('run_id', $run->id)->where('flag', true)->count();
    expect($ditandai)->toBe(28);

    // Ditandai per bulan Jan-Okt = 2,4,3,3,2,2,2,2,5,3
    $perBulan = DB::table('hasil_lof')
        ->join('laporan_bulanan', 'laporan_bulanan.id', '=', 'hasil_lof.laporan_id')
        ->where('hasil_lof.run_id', $run->id)
        ->groupBy('laporan_bulanan.bulan')
        ->orderBy('laporan_bulanan.bulan')
        ->selectRaw('laporan_bulanan.bulan, SUM(CASE WHEN hasil_lof.flag = 1 THEN 1 ELSE 0 END) as jumlah_flag')
        ->pluck('jumlah_flag')
        ->map(fn ($v) => (int) $v)
        ->values()
        ->all();

    expect($perBulan)->toBe([2, 4, 3, 3, 2, 2, 2, 2, 5, 3]);

    // LOF min 0,92, median 1,03, maks 3,11
    $scores = HasilLof::where('run_id', $run->id)
        ->whereNotNull('lof')
        ->orderBy('lof')
        ->pluck('lof')
        ->map(fn ($v) => (float) $v)
        ->values()
        ->all();

    $n = count($scores);
    $minLof = round($scores[0], 2);
    $maxLof = round($scores[$n - 1], 2);
    $medianLof = round(
        ($n % 2 === 0)
            ? (($scores[($n / 2) - 1] + $scores[$n / 2]) / 2.0)
            : $scores[(int) floor($n / 2)],
        2
    );

    expect($minLof)->toBe(0.92)
        ->and($medianLof)->toBe(1.03)
        ->and($maxLof)->toBe(3.11);
});

test('angka acuan kategori klasifikasi pangkalan cocok persis', function () {
    $run = AnalysisRun::where('nama', 'baseline-k10')->firstOrFail();

    $kategoriCounts = KlasifikasiPangkalan::where('run_id', $run->id)
        ->selectRaw('kategori, COUNT(*) as total')
        ->groupBy('kategori')
        ->pluck('total', 'kategori')
        ->map(fn ($v) => (int) $v)
        ->all();

    expect($kategoriCounts['Normal'] ?? 0)->toBe(18)
        ->and($kategoriCounts['Sporadis'] ?? 0)->toBe(6)
        ->and($kategoriCounts['Berulang'] ?? 0)->toBe(3)
        ->and($kategoriCounts['Konsisten tinggi'] ?? 0)->toBe(1)
        ->and($kategoriCounts['Data kurang'] ?? 0)->toBe(1)
        ->and($kategoriCounts['Tidak dinilai'] ?? 0)->toBe(1);
});

test('angka acuan seluruh flag aturan cocok persis', function () {
    $flagCounts = FlagAturan::query()
        ->selectRaw('jenis, COUNT(*) as total')
        ->groupBy('jenis')
        ->pluck('total', 'jenis')
        ->map(fn ($v) => (int) $v)
        ->all();

    expect($flagCounts['melebihi_alokasi'] ?? 0)->toBe(33)
        ->and($flagCounts['gt_2x_alokasi'] ?? 0)->toBe(9)
        ->and($flagCounts['nol'] ?? 0)->toBe(11)
        ->and($flagCounts['lonjakan'] ?? 0)->toBe(2)
        ->and($flagCounts['seragam'] ?? 0)->toBe(1)
        ->and($flagCounts['fakultatif'] ?? 0)->toBe(69);

    // Pastikan flag melebihi_alokasi dan gt_2x_alokasi tidak ada pada bulan Februari (bulan = 2)
    $febAlokasiFlags = DB::table('flag_aturan')
        ->join('laporan_bulanan', 'laporan_bulanan.id', '=', 'flag_aturan.laporan_id')
        ->where('laporan_bulanan.bulan', 2)
        ->whereIn('flag_aturan.jenis', ['melebihi_alokasi', 'gt_2x_alokasi'])
        ->count();

    expect($febAlokasiFlags)->toBe(0);
});
