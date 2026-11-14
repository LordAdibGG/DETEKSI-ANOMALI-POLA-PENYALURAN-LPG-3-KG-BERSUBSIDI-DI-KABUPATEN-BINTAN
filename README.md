# Lembar Pantau — Buku Besar Pengawasan Penyaluran LPG 3 kg Kabupaten Bintan

**Lembar Pantau** adalah aplikasi web bergaya editorial dan kartografis untuk memprioritaskan pemeriksaan lapangan pangkalan LPG 3 kg bersubsidi di Kabupaten Bintan menggunakan deteksi anomali *Local Outlier Factor* (LOF). Sistem ini dibangun untuk mata kuliah Penambangan Data (UMRAH) dengan sasaran pengguna **Bagian Perekonomian Setda Kabupaten Bintan** dan **Tim Monitoring & Evaluasi (Monev)**.

> **Prinsip Produk:** Skor LOF dan penandaan pada sistem ini merupakan **indikasi awal** untuk menyusun urutan prioritas pemeriksaan lapangan, **bukan bukti pelanggaran** hukum maupun administratif. Skor LOF disajikan berdampingan (tidak digabung) dengan temuan aturan deterministik.

---

## Lokasi Direktori Proyek (Untuk Dibuka di VS Code)

Folder utama (*root monorepo*) berada di:

```text
C:\Users\ASUS\.gemini\antigravity\scratch\lembar-pantau
```

Untuk membuka langsung di **Visual Studio Code**, buka terminal/PowerShell lalu jalankan:

```powershell
code "C:\Users\ASUS\.gemini\antigravity\scratch\lembar-pantau"
```

### Struktur Monorepo

```text
C:\Users\ASUS\.gemini\antigravity\scratch\lembar-pantau\
├── backend/                  # API REST Laravel 12 + Sanctum Bearer Token + public/ build SPA (Port 8000)
├── frontend/                 # Antarmuka React 18 + Vite + Tailwind CSS v4 + Motion + D3 SVG (Port 5173)
│   └── e2e/                  # Pengujian asap Playwright & penangkap layar otomatis (/docs/screenshots)
├── ml-service/               # Layanan Perhitungan LOF FastAPI + scikit-learn (Port 8001)
├── data/                     # Berkas sumber CSV KJP 2026 & skrip referensi lof_kjp_2026.py
├── docs/                     # Bukti laporan Bab VI & Lampiran:
│   ├── screenshots/          # Tangkapan layar otomatis (Ringkasan, Prioritas, Profil, Peta Panas, Playground)
│   ├── CHECKLIST_UAT_NARASUMBER.md
│   ├── Naskah Demo: NASKAH_DEMO_5_MENIT.md
│   └── Audit Fase 9: TINJAUAN_ANTI_SLOP_DAN_AUDIT_FASE9.md
├── CLAUDE.md                 # Spesifikasi produk, arsitektur, dan angka acuan
└── start-all.bat             # Peluncur satu klik untuk menyalakan ketiga layanan sekaligus di Windows
```

---

## Cara Menjalankan di VS Code (3 Pilihan Mode)

### Cara 1 — Tercepat untuk Mencoba Antarmuka Web Saja (Tanpa XAMPP / Tanpa Internet)

Antarmuka frontend sudah dilengkapi *snapshot* acuan `baseline-k10` (293 pangkalan-bulan) dan mesin LOF TypeScript di klien, sehingga dapat langsung dijalankan mandiri di Terminal VS Code (`Ctrl + `` `):

```powershell
cd C:\Users\ASUS\.gemini\antigravity\scratch\lembar-pantau\frontend
npm run dev
```

Lalu buka **`http://localhost:5173`** di peramban.

---

### Cara 2 — Mode Demo Produksi Satu Origin (`backend/public`, Tanpa CORS & Tanpa Internet)

Hasil `npm run build` dari `frontend/dist` telah disalin ke `backend/public`. Anda dapat menyajikan aplikasi penuh (Frontend + REST API Laravel) dari **satu origin (`http://127.0.0.1:8000`)**:

1. Nyalakan modul **MySQL** di **XAMPP Control Panel** (Port `3306`).
2. Di Terminal VS Code:
   ```powershell
   cd C:\Users\ASUS\.gemini\antigravity\scratch\lembar-pantau\backend
   php artisan serve --port=8000
   ```
3. Buka **`http://127.0.0.1:8000`** di peramban.

*(Jika Anda mengubah kode frontend dan ingin memperbarui isi `backend/public`, jalankan `cd frontend && npm run build` lalu `Copy-Item -Path dist\* -Destination ..\backend\public -Recurse -Force`).*

---

### Cara 3 — Mode Pengembangan Lengkap 3 Layanan (Frontend 5173 + Laravel 8000 + FastAPI 8001)

1. Pastikan **MySQL** di XAMPP sudah berstatus **Running (Port 3306)** dan basis data `lpg_lof` telah diimpor:
   ```powershell
   cd C:\Users\ASUS\.gemini\antigravity\scratch\lembar-pantau\backend
   php artisan import:kjp2026 --fresh
   ```
2. Dari direktori utama `C:\Users\ASUS\.gemini\antigravity\scratch\lembar-pantau`, jalankan:
   ```bat
   .\start-all.bat
   ```
   Atau buka 3 tab Terminal di VS Code:
   - **Terminal 1 (FastAPI LOF — Port 8001):**
     ```powershell
     cd C:\Users\ASUS\.gemini\antigravity\scratch\lembar-pantau\ml-service
     python -m uvicorn main:app --host 127.0.0.1 --port 8001
     ```
   - **Terminal 2 (Laravel API — Port 8000):**
     ```powershell
     cd C:\Users\ASUS\.gemini\antigravity\scratch\lembar-pantau\backend
     php artisan serve --port=8000
     ```
   - **Terminal 3 (Vite React — Port 5173):**
     ```powershell
     cd C:\Users\ASUS\.gemini\antigravity\scratch\lembar-pantau\frontend
     npm run dev
     ```

---

## Akun Uji Coba (Login `/masuk`)

| Peran | Surel | Kata Sandi | Hak Akses |
| :--- | :--- | :--- | :--- |
| **Admin Setda** | `admin@bintankab.go.id` | `admin123` | Melihat kode `P01–P30` **beserta nama asli pangkalan**, mengunggah laporan bulanan, menjalankan analisis parameter/`Top-N`, melihat *Audit Log*. |
| **Petugas Monev** | `petugas@bintankab.go.id` | `petugas123` | Hanya melihat kode `P01–P30` (nama pangkalan disamarkan untuk menjaga objektivitas), mencatat status tindak lanjut, mengunduh CSV tanpa nama. |

---

## Daftar Rute Halaman

- `/masuk` — Halaman masuk tipografis dengan kolofon angka acuan riset dan pengisi akun cepat.
- `/ringkasan` (atau `/`) — **I. Ringkasan**: kalimat editorial dinamis, *strip-plot* sebaran LOF, dan 1 bar bertumpuk komposisi kategori.
- `/prioritas` — **II. Daftar Prioritas**: tabel interaktif 30 pangkalan, saringan chip kategori, strip 10 bulan, alasan fitur $|z|$ terbesar, status tindak lanjut, ekspor CSV, dan cetak A4.
- `/peta-panas` — **III. Peta Panas**: matriks SVG 30 pangkalan × 10 bulan dikelompokkan per kategori, *hover crosshair* 4 *z-score*, slider simulasi ambang LOF, navigasi panah keyboard, dan tabel alternatif pembaca layar (`sr-only`).
- `/pangkalan/:kode` — **Profil Pangkalan**: 4 blok visualisasi (batang harian Minggu abu-abu, garis LOF 10 bulan, *lollipop* 4 *z-score* vs median pangkalan lain, alokasi vs realisasi dengan pengecualian Februari).
- `/temuan-aturan` — **IV. Temuan Aturan**: halaman khusus 6 jenis aturan deterministik beserta alasan pemisahan dari LOF (hanya 11% tumpang tindih).
- `/metode` (atau `/playground`) — **V. Metode & LOF Playground**: penjelasan lokalitas LOF, Stepper 5 langkah Tabel IV.1 (`k=2`), grafik evaluasi Bab V, dan simulasi *scatter* 2D titik `q` yang dapat digeser langsung.
- `/operasional` — **VI. Operasional**: unggah CSV laporan bulanan dengan Validasi 4 Cek, panel parameter Admin (`k`, ambang LOF, mode kapasitas `Top-N`) + perbandingan Jaccard, tindak lanjut + riwayat, dan *Audit Log*.
- `/__kit` — Spesimen lengkap *design system* "Lembar Pantau".
- `/status-fondasi` — Pemeriksaan kesehatan 3 layanan (Frontend, API & MySQL, Layanan Python LOF).

---

## Menjalankan Seluruh Pengujian Otomatis

1. **Unit & Component Tests Frontend (Vitest — 6 berkas, 18 tes):**
   ```powershell
   cd C:\Users\ASUS\.gemini\antigravity\scratch\lembar-pantau\frontend
   npm test
   ```
2. **Feature & Parity Tests Backend (Pest / PHPUnit — 28 tes, 269 assertions):**
   ```powershell
   cd C:\Users\ASUS\.gemini\antigravity\scratch\lembar-pantau\backend
   php artisan test
   ```
3. **Unit & Parity Tests Layanan Python LOF (Pytest — Tabel IV.1 & Reproduksi 28 Flag):**
   ```powershell
   cd C:\Users\ASUS\.gemini\antigravity\scratch\lembar-pantau\ml-service
   python -m pytest -v
   ```
4. **End-to-End Smoke Test & Generator Tangkapan Layar Laporan (Playwright):**
   ```powershell
   cd C:\Users\ASUS\.gemini\antigravity\scratch\lembar-pantau\frontend
   npx playwright test
   ```
   *(Menghasilkan tangkapan layar ke `docs/screenshots/` untuk Gambar VI.1 dan Lampiran).*
