<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\OperasionalController;
use App\Http\Controllers\PantauController;
use Illuminate\Support\Facades\Route;

// Fase 0: Health check publik
Route::get('/health', HealthController::class)->name('api.health');

// Fase 2: Otentikasi Sanctum Bearer Token (dengan rate limit pada login)
Route::post('/auth/login', [AuthController::class, 'login'])
    ->middleware('throttle:login')
    ->name('api.auth.login');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout'])->name('api.auth.logout');
    Route::get('/me', [AuthController::class, 'me'])->name('api.me');

    Route::get('/ringkasan', [PantauController::class, 'ringkasan'])->name('api.ringkasan');
    Route::get('/prioritas', [PantauController::class, 'prioritas'])->name('api.prioritas');
    Route::get('/pangkalan/{kode}', [PantauController::class, 'profilPangkalan'])->name('api.pangkalan.show');
    Route::get('/heatmap', [PantauController::class, 'heatmap'])->name('api.heatmap');
    Route::get('/temuan-aturan', [PantauController::class, 'temuanAturan'])->name('api.temuan-aturan');
    Route::get('/metode', [PantauController::class, 'metode'])->name('api.metode');
    Route::get('/export/prioritas.csv', [PantauController::class, 'exportPrioritasCsv'])->name('api.export.prioritas');
    Route::post('/analisis/run', [PantauController::class, 'runAnalisis'])->name('api.analisis.run');
    Route::get('/analisis/runs', [OperasionalController::class, 'daftarRuns'])->name('api.analisis.runs');

    // Fase 8: Operasional (unggah laporan bulanan, tindak lanjut, audit log)
    Route::get('/operasional/contoh-bulan-fiktif', [OperasionalController::class, 'contohBulanFiktif'])->name('api.operasional.contoh');
    Route::post('/operasional/unggah/validasi', [OperasionalController::class, 'validasiUnggah'])->name('api.operasional.validasi');
    Route::post('/operasional/unggah/konfirmasi', [OperasionalController::class, 'konfirmasiUnggah'])->name('api.operasional.konfirmasi');

    Route::get('/tindak-lanjut', [OperasionalController::class, 'daftarTindakLanjut'])->name('api.tindak-lanjut.index');
    Route::post('/pangkalan/{kode}/tindak-lanjut', [OperasionalController::class, 'simpanTindakLanjut'])->name('api.tindak-lanjut.store');
    Route::get('/audit-log', [OperasionalController::class, 'auditLog'])->name('api.audit-log.index');
});
