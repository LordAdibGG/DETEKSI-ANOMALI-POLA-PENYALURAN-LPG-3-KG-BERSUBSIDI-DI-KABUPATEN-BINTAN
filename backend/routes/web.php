<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Rute web: menyajikan SPA React hasil `npm run build` (disalin ke public/)
|--------------------------------------------------------------------------
| Demo satu origin: Laravel melayani /api/* dan antarmuka dari port yang sama,
| sehingga tidak perlu CORS dan tidak butuh internet. Berkas statis (assets/*,
| favicon, dll.) dilayani langsung oleh server; rute di bawah hanya menangani
| tautan dalam (mis. /prioritas, /pangkalan/P10) agar tetap memuat SPA.
*/
$sajikanSpa = function () {
    $berkas = public_path('index.html');

    if (! is_file($berkas)) {
        return response(
            'Antarmuka belum dibangun. Jalankan "npm run build" di folder frontend, '
            .'lalu salin isi frontend/dist ke backend/public (atau jalankan skrip scripts/build-demo.ps1).',
            503
        )->header('Content-Type', 'text/plain; charset=UTF-8');
    }

    return response()->file($berkas, ['Content-Type' => 'text/html; charset=UTF-8']);
};

Route::get('/', $sajikanSpa);

Route::get('/{jalur}', $sajikanSpa)
    ->where('jalur', '^(?!api(/|$)|assets/|storage/|up$)[^.]*$');
