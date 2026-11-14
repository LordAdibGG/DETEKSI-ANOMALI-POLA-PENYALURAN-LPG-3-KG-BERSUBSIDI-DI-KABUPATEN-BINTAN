<?php

use App\Models\User;
use App\Services\AlasanPenandaanService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    Cache::flush();
    RateLimiter::clear('admin@bintankab.go.id|127.0.0.1');
    RateLimiter::clear('salah@bintankab.go.id|127.0.0.1');
});

test('endpoint terproteksi menolak akses tanpa Bearer token dengan error JSON seragam', function () {
    $endpoints = [
        '/api/me',
        '/api/ringkasan',
        '/api/prioritas',
        '/api/pangkalan/P01',
        '/api/heatmap',
        '/api/temuan-aturan',
        '/api/metode',
        '/api/export/prioritas.csv',
    ];

    foreach ($endpoints as $uri) {
        $this->getJson($uri)
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'UNAUTHENTICATED')
            ->assertJsonPath('meta.status', 401);
    }
});

test('login, me, dan logout berfungsi dengan Sanctum Bearer token serta rate limit aktif', function () {
    // Login gagal
    $this->postJson('/api/auth/login', [
        'email' => 'admin@bintankab.go.id',
        'password' => 'salah-sandi',
    ])
        ->assertStatus(401)
        ->assertJsonPath('error.code', 'INVALID_CREDENTIALS');

    // Login berhasil sebagai admin
    $loginRes = $this->postJson('/api/auth/login', [
        'email' => 'admin@bintankab.go.id',
        'password' => 'admin123',
    ]);

    $loginRes->assertStatus(200)
        ->assertJsonPath('data.token_type', 'Bearer')
        ->assertJsonPath('data.user.role', 'admin')
        ->assertJsonPath('data.user.can_view_real_name', true)
        ->assertJsonStructure([
            'data' => ['token', 'token_type', 'user'],
            'meta' => ['message', 'timestamp'],
        ]);

    $token = $loginRes->json('data.token');

    // GET /api/me menggunakan Bearer token
    $this->withHeader('Authorization', 'Bearer ' . $token)
        ->getJson('/api/me')
        ->assertStatus(200)
        ->assertJsonPath('data.email', 'admin@bintankab.go.id')
        ->assertJsonPath('meta.role', 'admin');

    // POST /api/auth/logout
    $this->withHeader('Authorization', 'Bearer ' . $token)
        ->postJson('/api/auth/logout')
        ->assertStatus(200)
        ->assertJsonPath('data.logged_out', true);

    // Rate limit: 5 percobaan per menit untuk email+IP yang sama
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/auth/login', [
            'email' => 'salah@bintankab.go.id',
            'password' => '123456',
        ])->assertStatus(401);
    }

    $this->postJson('/api/auth/login', [
        'email' => 'salah@bintankab.go.id',
        'password' => '123456',
    ])
        ->assertStatus(429)
        ->assertJsonPath('error.code', 'TOO_MANY_REQUESTS');
});

test('GET /api/ringkasan mengembalikan angka acuan keseluruhan maupun per bulan', function () {
    $petugas = User::where('role', 'petugas')->firstOrFail();
    Sanctum::actingAs($petugas);

    // Tanpa parameter bulan (keseluruhan Jan-Okt)
    $resAll = $this->getJson('/api/ringkasan');
    $resAll->assertStatus(200)
        ->assertJsonPath('data.jumlah_pangkalan', 30)
        ->assertJsonPath('data.jumlah_observasi', 293)
        ->assertJsonPath('data.jumlah_dinilai', 282)
        ->assertJsonPath('data.jumlah_tidak_dinilai', 11)
        ->assertJsonPath('data.jumlah_ditandai', 28)
        ->assertJsonPath('data.per_kategori.Normal', 18)
        ->assertJsonPath('data.per_kategori.Sporadis', 6)
        ->assertJsonPath('data.per_kategori.Berulang', 3)
        ->assertJsonPath('data.per_kategori.Konsisten tinggi', 1)
        ->assertJsonPath('data.per_kategori.Data kurang', 1)
        ->assertJsonPath('data.per_kategori.Tidak dinilai', 1)
        ->assertJsonPath('data.sebaran_lof.min', 0.92)
        ->assertJsonPath('data.sebaran_lof.median', 1.03)
        ->assertJsonPath('data.sebaran_lof.maks', 3.11)
        ->assertJsonPath('meta.run', 'baseline-k10');

    // Dengan parameter bulan=9 (September: 5 ditandai)
    $resSep = $this->getJson('/api/ringkasan?bulan=9');
    $resSep->assertStatus(200)
        ->assertJsonPath('data.bulan', 9)
        ->assertJsonPath('data.jumlah_ditandai', 5)
        ->assertJsonPath('data.jumlah_dinilai', 29);

    // Parameter bulan di luar rentang -> 422 seragam
    $this->getJson('/api/ringkasan?bulan=13')
        ->assertStatus(422)
        ->assertJsonPath('error.code', 'VALIDATION_ERROR');
});

test('pemetaan alasan penandaan menghasilkan kalimat Indonesia yang presisi', function () {
    expect(AlasanPenandaanService::formatKalimatFitur('cv_harian', 5.65))
        ->toBe('variasi harian jauh di atas pangkalan lain (z 5,65)')
        ->and(AlasanPenandaanService::formatKalimatFitur('rasio_hari_aktif', -2.02))
        ->toBe('frekuensi hari aktif jauh di bawah pangkalan lain (z -2,02)');
});

test('GET /api/prioritas membedakan visibilitas nama antara admin dan petugas serta mendukung filter', function () {
    $admin = User::where('role', 'admin')->firstOrFail();
    $petugas = User::where('role', 'petugas')->firstOrFail();

    // Akses sebagai Petugas: nama dan id_registrasi TIDAK boleh ada
    Sanctum::actingAs($petugas);
    $resPetugas = $this->getJson('/api/prioritas');
    $resPetugas->assertStatus(200)
        ->assertJsonPath('meta.total', 30)
        ->assertJsonPath('meta.role', 'petugas');

    $firstPetugasItem = $resPetugas->json('data.0');
    expect($firstPetugasItem)->toHaveKey('kode')
        ->and($firstPetugasItem)->not->toHaveKey('nama')
        ->and($firstPetugasItem)->not->toHaveKey('id_registrasi')
        ->and($firstPetugasItem['strip_10_bulan'])->toHaveCount(10)
        ->and($firstPetugasItem['alasan'])->toBeString();

    // Petugas mencari berdasarkan nama asli "TASLIM" -> tidak boleh bocor (0 hasil)
    $this->getJson('/api/prioritas?q=TASLIM')
        ->assertStatus(200)
        ->assertJsonPath('meta.total', 0);

    // Akses sebagai Admin: nama dan id_registrasi tampil lengkap
    Sanctum::actingAs($admin);
    $resAdmin = $this->getJson('/api/prioritas?kategori=Sporadis&sort=maks_lof_desc');
    $resAdmin->assertStatus(200)
        ->assertJsonPath('meta.total', 6)
        ->assertJsonPath('data.0.kode', 'P01')
        ->assertJsonPath('data.0.nama', 'A SING')
        ->assertJsonPath('data.0.id_registrasi', '1291501020032007');

    // Admin mencari berdasarkan nama asli "TASLIM" -> menemukan P10
    $this->getJson('/api/prioritas?q=TASLIM')
        ->assertStatus(200)
        ->assertJsonPath('meta.total', 1)
        ->assertJsonPath('data.0.kode', 'P10');
});

test('GET /api/pangkalan/{kode} mengembalikan profil lengkap beserta volume harian dan median pangkalan lain', function () {
    $admin = User::where('role', 'admin')->firstOrFail();
    $petugas = User::where('role', 'petugas')->firstOrFail();

    // Sebagai Admin
    Sanctum::actingAs($admin);
    $resAdmin = $this->getJson('/api/pangkalan/P10');
    $resAdmin->assertStatus(200)
        ->assertJsonPath('data.kode', 'P10')
        ->assertJsonPath('data.nama', 'TASLIM')
        ->assertJsonPath('data.klasifikasi.kategori', 'Konsisten tinggi')
        ->assertJsonPath('data.klasifikasi.maks_lof', 3.11)
        ->assertJsonCount(10, 'data.laporan_bulanan');

    $bulanApr = $resAdmin->json('data.laporan_bulanan.3'); // indeks 3 = bulan 4 (April)
    expect($bulanApr['bulan'])->toBe(4)
        ->and($bulanApr['lof'])->toBe(3.11)
        ->and($bulanApr['flag'])->toBeTrue()
        ->and($bulanApr['fitur']['cv_harian'])->toHaveKeys(['nilai', 'z_score', 'median_pangkalan_lain'])
        ->and($bulanApr['alokasi_vs_realisasi'])->toHaveKeys(['alokasi', 'total_normal', 'fakultatif', 'grand_total', 'sisa_alokasi'])
        ->and($bulanApr['volume_harian'])->toHaveCount(30);

    // Sebagai Petugas: nama disembunyikan
    Sanctum::actingAs($petugas);
    $resPetugas = $this->getJson('/api/pangkalan/P10');
    $resPetugas->assertStatus(200)
        ->assertJsonPath('data.kode', 'P10');
    expect($resPetugas->json('data'))->not->toHaveKey('nama');

    // Kode tidak ditemukan -> 404 seragam
    $this->getJson('/api/pangkalan/P99')
        ->assertStatus(404)
        ->assertJsonPath('error.code', 'NOT_FOUND');
});

test('GET /api/heatmap mengembalikan matriks 30 pangkalan x 10 bulan urut menurut kategori', function () {
    $petugas = User::where('role', 'petugas')->firstOrFail();
    Sanctum::actingAs($petugas);

    $res = $this->getJson('/api/heatmap');
    $res->assertStatus(200)
        ->assertJsonPath('meta.total_pangkalan', 30)
        ->assertJsonPath('data.0.kode', 'P10') // Konsisten tinggi berada di urutan pertama
        ->assertJsonPath('data.0.kategori', 'Konsisten tinggi')
        ->assertJsonCount(10, 'data.0.sel');

    expect($res->json('data.0'))->not->toHaveKey('nama');
});

test('GET /api/temuan-aturan mengembalikan daftar flag aturan berdampingan dengan skor LOF', function () {
    $admin = User::where('role', 'admin')->firstOrFail();
    Sanctum::actingAs($admin);

    $resAll = $this->getJson('/api/temuan-aturan');
    $resAll->assertStatus(200)
        ->assertJsonPath('meta.total', 125)
        ->assertJsonPath('meta.ringkasan_per_jenis.melebihi_alokasi', 33)
        ->assertJsonPath('meta.ringkasan_per_jenis.gt_2x_alokasi', 9)
        ->assertJsonPath('meta.ringkasan_per_jenis.nol', 11)
        ->assertJsonPath('meta.ringkasan_per_jenis.lonjakan', 2)
        ->assertJsonPath('meta.ringkasan_per_jenis.seragam', 1)
        ->assertJsonPath('meta.ringkasan_per_jenis.fakultatif', 69);

    $resGt2x = $this->getJson('/api/temuan-aturan?jenis=gt_2x_alokasi');
    $resGt2x->assertStatus(200)
        ->assertJsonPath('meta.total', 9)
        ->assertJsonPath('data.0.kode', 'P04')
        ->assertJsonPath('data.0.nama', 'SUARMAN');
});

test('GET /api/metode mengembalikan parameter model, keterbatasan, dan seluruh baris evaluasi_lof.csv', function () {
    $petugas = User::where('role', 'petugas')->firstOrFail();
    Sanctum::actingAs($petugas);

    $res = $this->getJson('/api/metode');
    $res->assertStatus(200)
        ->assertJsonPath('data.parameter.k', 10)
        ->assertJsonPath('data.parameter.threshold', 1.5)
        ->assertJsonPath('meta.jumlah_uji_evaluasi', 21)
        ->assertJsonCount(21, 'data.evaluasi_lof')
        ->assertJsonCount(10, 'data.ringkasan_per_bulan');
});

test('GET /api/export/prioritas.csv mengekspor CSV sesuai hak akses role', function () {
    $admin = User::where('role', 'admin')->firstOrFail();
    $petugas = User::where('role', 'petugas')->firstOrFail();

    // Ekspor oleh Admin memuat nama_pangkalan
    Sanctum::actingAs($admin);
    $csvAdmin = $this->get('/api/export/prioritas.csv');
    $csvAdmin->assertStatus(200)
        ->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
    expect($csvAdmin->getContent())->toContain('nama_pangkalan')
        ->and($csvAdmin->getContent())->toContain('TASLIM');

    // Ekspor oleh Petugas TIDAK memuat nama_pangkalan maupun nama asli
    Sanctum::actingAs($petugas);
    $csvPetugas = $this->get('/api/export/prioritas.csv');
    $csvPetugas->assertStatus(200);
    expect($csvPetugas->getContent())->not->toContain('nama_pangkalan')
        ->and($csvPetugas->getContent())->not->toContain('TASLIM')
        ->and($csvPetugas->getContent())->toContain('P10');
});
