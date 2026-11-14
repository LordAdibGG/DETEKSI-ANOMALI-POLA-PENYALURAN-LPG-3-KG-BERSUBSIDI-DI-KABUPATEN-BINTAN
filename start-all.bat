@echo off
setlocal
title Lembar Pantau - Peluncur Layanan (Fase 0)

echo ============================================================================
echo  LEMBAR PANTAU - Sistem Pengawasan Penyaluran LPG 3 kg Kabupaten Bintan
echo ============================================================================
echo.
echo Pastikan modul MySQL pada XAMPP Control Panel sudah berstatus Running (Port 3306)
echo dan basis data "lpg_lof" telah tersedia.
echo.

echo [1/3] Menjalankan Layanan LOF (FastAPI Python) pada http://127.0.0.1:8001 ...
start "Lembar Pantau - Layanan LOF (8001)" /D "%~dp0ml-service" cmd /k "python -m uvicorn main:app --host 127.0.0.1 --port 8001"

echo [2/3] Menjalankan Backend API (Laravel 12) pada http://127.0.0.1:8000 ...
start "Lembar Pantau - Backend API (8000)" /D "%~dp0backend" cmd /k "php artisan serve --host=127.0.0.1 --port=8000"

echo [3/3] Menjalankan Antarmuka Web (Vite React) pada http://localhost:5173 ...
start "Lembar Pantau - Frontend (5173)" /D "%~dp0frontend" cmd /k "npm run dev"

echo.
echo Ketiga layanan telah dijalankan di jendela terminal masing-masing.
echo Buka peramban pada alamat: http://localhost:5173
echo ============================================================================
endlocal
