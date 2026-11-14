<?php

use App\Models\AnalysisRun;
use App\Models\AuditLog;
use App\Models\LaporanBulanan;
use App\Models\TindakLanjut;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;

test('Fase 8: validasi 4 cek laporan bulanan CSV mendeteksi selisih dan meluluskan CSV bulan fiktif yang valid', function () {
    $admin = User::where('role', 'admin')->firstOrFail();
    Sanctum::actingAs($admin);

    // 1. Ambil contoh CSV bulan fiktif (November 2026 / bulan 11)
    $contohRes = $this->getJson('/api/operasional/contoh-bulan-fiktif?bulan=11');
    $contohRes->assertStatus(200);
    $validCsv = $contohRes->json('data.csv');
    expect($validCsv)->toBeString()->toContain('1291501020032007');

    // 2. Uji validasi 4 cek pada CSV valid -> keempat cek lulus
    $valRes = $this->postJson('/api/operasional/unggah/validasi', [
        'csv' => $validCsv,
    ]);

    $valRes->assertStatus(200)
        ->assertJsonPath('data.valid', true)
        ->assertJsonPath('data.bulan', 11)
        ->assertJsonPath('data.empat_cek.jumlah_harian_vs_normal.lulus', true)
        ->assertJsonPath('data.empat_cek.normal_fakultatif_vs_grand.lulus', true)
        ->assertJsonPath('data.empat_cek.sisa_alokasi.lulus', true)
        ->assertJsonPath('data.empat_cek.total_agen.lulus', true)
        ->assertJsonPath('data.ringkasan.jumlah_baris', 30);

    // 3. Uji validasi ketika target total agen tidak cocok -> cek 4 gagal
    $badAgenRes = $this->postJson('/api/operasional/unggah/validasi', [
        'csv' => $validCsv,
        'expected_total_agen' => 999999,
    ]);
    $badAgenRes->assertStatus(200)
        ->assertJsonPath('data.valid', false)
        ->assertJsonPath('data.empat_cek.total_agen.lulus', false);
});

test('Fase 8: unggah bulan fiktif -> run baru tercipta -> daftar prioritas ikut berubah + perbandingan baseline & mode top-N', function () {
    $admin = User::where('role', 'admin')->firstOrFail();
    Sanctum::actingAs($admin);

    try {
        // Pastikan sebelum unggah, P11 berstatus Normal (0 bulan ditandai)
        $prioSebelum = collect($this->getJson('/api/prioritas')->json('data'))->keyBy('kode');
        expect($prioSebelum['P11']['kategori'])->toBe('Normal')
            ->and($prioSebelum['P11']['bulan_flag'])->toBe(0);

        $validCsv = $this->getJson('/api/operasional/contoh-bulan-fiktif?bulan=11')->json('data.csv');

        // Konfirmasi unggah bulan fiktif (bulan 11) -> membuat analysis_run baru
        $konfirmasiRes = $this->postJson('/api/operasional/unggah/konfirmasi', [
            'csv' => $validCsv,
            'k' => 10,
            'threshold' => 1.5,
            'nama_run' => 'test-unggah-bln11',
        ]);

        $konfirmasiRes->assertStatus(201)
            ->assertJsonPath('data.unggah.bulan', 11)
            ->assertJsonPath('data.analisis.run.nama', 'test-unggah-bln11');

        // Pastikan P11 masuk daftar prioritas pada perbandingan baseline
        $masukCodes = collect($konfirmasiRes->json('data.analisis.perbandingan_baseline.pangkalan_masuk'))
            ->pluck('kode')
            ->all();
        expect($masukCodes)->toContain('P11');

        // Pastikan GET /api/prioritas ikut berubah (P11 kini Sporadis dengan bulan_flag >= 1)
        $prioSesudah = collect($this->getJson('/api/prioritas')->json('data'))->keyBy('kode');
        expect($prioSesudah['P11']['kategori'])->toBe('Sporadis')
            ->and($prioSesudah['P11']['bulan_flag'])->toBeGreaterThanOrEqual(1);

        // Uji Panel Parameter Admin dengan mode Top-N (misal Top-5 sesuai kapasitas pemeriksa)
        $topNRes = $this->postJson('/api/analisis/run', [
            'k' => 10,
            'threshold' => 1.5,
            'top_n' => 5,
            'fallback_local' => true,
            'nama' => 'test-top5-kapasitas',
        ]);

        $topNRes->assertStatus(201)
            ->assertJsonPath('data.run.nama', 'test-top5-kapasitas')
            ->assertJsonPath('data.perbandingan_baseline.jumlah_prioritas_baru', 5);

        expect(count($topNRes->json('data.perbandingan_baseline.pangkalan_keluar')))
            ->toBeGreaterThanOrEqual(5);
    } finally {
        // Bersihkan data bulan 11 dan run pengujian agar database kembali ke baseline-k10 murni
        LaporanBulanan::where('bulan', 11)->delete();
        AnalysisRun::whereIn('nama', ['test-unggah-bln11', 'test-top5-kapasitas'])->delete();
        Cache::flush();
    }
});

test('Fase 8: tindak lanjut per pangkalan menyimpan status, catatan, riwayat, serta mencatat audit log', function () {
    $admin = User::where('role', 'admin')->firstOrFail();
    Sanctum::actingAs($admin);

    try {
        $res1 = $this->postJson('/api/pangkalan/P10/tindak-lanjut', [
            'status' => 'perlu_klarifikasi',
            'catatan' => 'Perlu verifikasi logbook penyaluran April dan Oktober 2026.',
        ]);

        $res1->assertStatus(201)
            ->assertJsonPath('data.kode', 'P10')
            ->assertJsonPath('data.status_terkini', 'perlu_klarifikasi')
            ->assertJsonPath('data.label_status', 'Perlu klarifikasi');

        $res2 = $this->postJson('/api/pangkalan/P10/tindak-lanjut', [
            'status' => 'ditindaklanjuti',
            'catatan' => 'Tim Monev telah melakukan kunjungan lapangan.',
        ]);

        $res2->assertStatus(201)
            ->assertJsonPath('data.status_terkini', 'ditindaklanjuti');
        expect(count($res2->json('data.riwayat')))->toBeGreaterThanOrEqual(2);

        // Cek daftar tindak lanjut
        $listRes = $this->getJson('/api/tindak-lanjut');
        $listRes->assertStatus(200)
            ->assertJsonPath('meta.total', 30);

        // Cek audit log memuat aksi tindak_lanjut.simpan
        $auditRes = $this->getJson('/api/audit-log');
        $auditRes->assertStatus(200);
        $aksiList = collect($auditRes->json('data'))->pluck('aksi')->all();
        expect($aksiList)->toContain('tindak_lanjut.simpan');
    } finally {
        TindakLanjut::query()->delete();
        AuditLog::whereIn('aksi', ['tindak_lanjut.simpan', 'laporan.unggah'])->delete();
        Cache::flush();
    }
});
