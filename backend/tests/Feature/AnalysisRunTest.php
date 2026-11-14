<?php

use App\Models\AnalysisRun;
use App\Models\FiturBulanan;
use App\Models\HasilLof;
use App\Models\KlasifikasiPangkalan;
use App\Models\LaporanBulanan;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

/**
 * Helper untuk membuat respons mock /analyze yang mereproduksi hasil baseline-k10 dari DB.
 *
 * @return array<string, mixed>
 */
function buildMockAnalyzePayloadFromBaseline(): array
{
    $baseline = AnalysisRun::where('nama', 'baseline-k10')->firstOrFail();

    $laporans = LaporanBulanan::with([
        'pangkalan',
        'fiturBulanan' => fn ($q) => $q->where('run_id', $baseline->id),
        'hasilLof' => fn ($q) => $q->where('run_id', $baseline->id),
        'flagAturan',
    ])->get();

    $items = [];
    foreach ($laporans as $lap) {
        $fb = $lap->fiturBulanan->first();
        $hl = $lap->hasilLof->first();
        $flags = $lap->flagAturan->pluck('jenis')->all();

        $items[] = [
            'id_pangkalan' => $lap->pangkalan->id_registrasi,
            'nama_pangkalan' => $lap->pangkalan->nama,
            'bulan' => (int) $lap->bulan,
            'alokasi' => (int) $lap->alokasi,
            'total' => (float) $lap->total_normal,
            'total_fakultatif' => (int) $lap->fakultatif,
            'grand_total' => (int) $lap->grand_total,
            'sisa_alokasi' => (int) $lap->sisa_alokasi,
            'hari_aktif' => (int) $lap->hari_aktif,
            'n_hari_kerja' => (int) $lap->n_hari_kerja,
            'fitur' => [
                'log_total' => $fb?->log_total,
                'cv_harian' => $fb?->cv_harian,
                'rasio_hari_aktif' => $fb?->rasio_hari_aktif,
                'porsi_nilai_dominan' => $fb?->porsi_nilai_dominan,
            ],
            'z' => [
                'z_log_total' => $fb?->z_log_total,
                'z_cv_harian' => $fb?->z_cv_harian,
                'z_rasio_hari_aktif' => $fb?->z_rasio_hari_aktif,
                'z_porsi_nilai_dominan' => $fb?->z_porsi_nilai_dominan,
            ],
            'lof' => $hl?->lof,
            'flag' => (bool) ($hl?->flag ?? false),
            'aturan' => [
                'melebihi_alokasi' => in_array('melebihi_alokasi', $flags, true),
                'gt_2x_alokasi' => in_array('gt_2x_alokasi', $flags, true),
                'nol' => in_array('nol', $flags, true),
                'lonjakan' => in_array('lonjakan', $flags, true),
                'seragam' => in_array('seragam', $flags, true),
                'fakultatif' => in_array('fakultatif', $flags, true),
            ],
        ];
    }

    $klasRows = KlasifikasiPangkalan::with('pangkalan')
        ->where('run_id', $baseline->id)
        ->get();

    $klasifikasi = [];
    foreach ($klasRows as $kr) {
        $klasifikasi[] = [
            'id_pangkalan' => $kr->pangkalan->id_registrasi,
            'nama_pangkalan' => $kr->pangkalan->nama,
            'kategori' => $kr->kategori,
            'kategori_lof' => $kr->kategori_label,
            'bulan_valid' => (int) $kr->bulan_valid,
            'bulan_flag' => (int) $kr->bulan_flag,
            'proporsi_flag' => $kr->proporsi_flag,
            'rerata_lof' => $kr->rerata_lof,
            'maks_lof' => $kr->maks_lof,
            'bulan_maks' => $kr->bulan_maks,
            'bulan_yang_ditandai' => $kr->bulan_yang_ditandai,
            'run_terpanjang' => (int) $kr->run_terpanjang,
        ];
    }

    return [
        'k' => 10,
        'threshold' => 1.5,
        'fitur_names' => ['log_total', 'cv_harian', 'rasio_hari_aktif', 'porsi_nilai_dominan'],
        'items' => $items,
        'klasifikasi' => $klasifikasi,
        'ringkasan' => [
            'total_observasi' => 293,
            'masuk_model' => 282,
            'ditandai' => 28,
            'per_kategori' => [
                'Normal' => 18,
                'Sporadis' => 6,
                'Berulang' => 3,
                'Konsisten tinggi' => 1,
                'Data kurang' => 1,
                'Tidak dinilai' => 1,
            ],
        ],
    ];
}

test('POST /api/analisis/run menolak petugas (403) dan hanya mengizinkan admin', function () {
    $petugas = User::where('role', 'petugas')->firstOrFail();
    Sanctum::actingAs($petugas);

    $this->postJson('/api/analisis/run', [
        'k' => 10,
        'threshold' => 1.5,
    ])
        ->assertStatus(403)
        ->assertJsonPath('error.code', 'FORBIDDEN');
});

test('POST /api/analisis/run mengembalikan 503 saat layanan Python mati dan data lama tetap terbaca', function () {
    $admin = User::where('role', 'admin')->firstOrFail();
    Sanctum::actingAs($admin);

    $attempts = 0;
    Http::fake([
        '*/analyze' => function () use (&$attempts) {
            $attempts++;
            throw new ConnectionException('Connection refused');
        },
    ]);

    $this->postJson('/api/analisis/run', [
        'k' => 10,
        'threshold' => 1.5,
        'nama' => 'run-gagal-503',
    ])
        ->assertStatus(503)
        ->assertJsonPath('error.code', 'ML_SERVICE_UNAVAILABLE')
        ->assertJsonPath('meta.status', 503);

    expect($attempts)->toBe(2);

    // Pastikan data lama (baseline-k10) tetap dapat dibaca tanpa gangguan
    $this->getJson('/api/ringkasan')
        ->assertStatus(200)
        ->assertJsonPath('data.jumlah_ditandai', 28)
        ->assertJsonPath('data.jumlah_dinilai', 282);
});

test('POST /api/analisis/run dan command analysis:run menyimpan run baru k=10 identik (Jaccard 1,0) dengan baseline', function () {
    $admin = User::where('role', 'admin')->firstOrFail();
    Sanctum::actingAs($admin);

    $mockPayload = buildMockAnalyzePayloadFromBaseline();

    Http::fake([
        '*/analyze' => Http::response($mockPayload, 200),
    ]);

    // 1. Uji via endpoint POST /api/analisis/run
    $response = $this->postJson('/api/analisis/run', [
        'k' => 10,
        'threshold' => 1.5,
        'nama' => 'verifikasi-k10',
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('data.run.nama', 'verifikasi-k10')
        ->assertJsonPath('data.run.k', 10)
        ->assertJsonPath('data.ringkasan.ditandai', 28)
        ->assertJsonPath('data.jaccard_vs_baseline', 1);

    $newRun = AnalysisRun::where('nama', 'verifikasi-k10')->firstOrFail();
    expect(FiturBulanan::where('run_id', $newRun->id)->count())->toBe(293)
        ->and(HasilLof::where('run_id', $newRun->id)->where('flag', true)->count())->toBe(28)
        ->and(KlasifikasiPangkalan::where('run_id', $newRun->id)->count())->toBe(30);

    // 2. Uji via Artisan command analysis:run
    $this->artisan('analysis:run', [
        '--k' => 10,
        '--thr' => 1.5,
        '--nama' => 'cli-k10',
    ])->assertExitCode(0);

    $cliRun = AnalysisRun::where('nama', 'cli-k10')->firstOrFail();
    expect(HasilLof::where('run_id', $cliRun->id)->where('flag', true)->count())->toBe(28);

    // Bersihkan run pengujian agar hanya baseline-k10 yang tersisa
    AnalysisRun::whereIn('nama', ['verifikasi-k10', 'cli-k10'])->delete();
});
