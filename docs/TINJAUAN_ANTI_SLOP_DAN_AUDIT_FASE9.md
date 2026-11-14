# Tinjauan Anti-Slop, Audit Animasi, Aksesibilitas & Performa (Fase 9)

Dokumen ini mencatat hasil audit menyeluruh Fase 9 pada aplikasi **Lembar Pantau** untuk memastikan antarmuka bebas dari kesan templat generik (*AI slop*), seluruh gerak memiliki fungsi yang jelas, memenuhi standar aksesibilitas WCAG AA, serta memiliki performa produksi yang cepat dan mandiri tanpa internet.

---

## 1. Tinjauan Anti-Slop (Daftar Elemen yang Diperbaiki)

| No | Temuan Elemen yang Terasa Templat / Generik | Perbaikan Editorial & Kartografis yang Diterapkan | Lokasi Berkas |
| :-: | :--- | :--- | :--- |
| 1 | **Animasi masuk ganda (*double entrance fade+slide*)** pada pembungkus halaman: `<PageTransition>` di `AppShell` sudah melakukan *fade*, tetapi setiap halaman masih membungkus seluruh isinya dengan `<Reveal>` yang menggeser seluruh halaman ke atas (`y: 8 -> 0`) setiap pindah menu. | Dihapus `<Reveal>` tingkat halaman di `RingkasanPage`, `PrioritasPage`, `PetaPanasPage`, `ProfilPangkalanPage`, `TemuanAturanPage`, `MetodePage`, dan `OperasionalPage`. `<PageTransition>` disederhanakan menjadi *fade* murni tanpa geser vertikal. | `src/components/motion/Primitives.tsx`, `src/pages/*.tsx` |
| 2 | **Titik berdenyut dekoratif (`animate-ping`) dan stagger kartu status** pada halaman pemeriksaan layanan yang terasa seperti *dashboard SaaS* generik. | Dihapus `animate-ping` dan `motion.article` ber-*stagger* pada kartu status; diganti indikator statis yang tegas. | `src/pages/SystemStatusPage.tsx` |
| 3 | **Label pengalih tema teknis (`Mode: Kertas (#F3EFE4)`)** di bilah kolofon atas yang menampilkan kode heksadesimal mentah kepada pengguna dinas. | Disederhanakan menjadi `Mode: Terang` / `Mode: Gelap` di kolofon atas (spesimen kode hex tetap berada di `/__kit`). | `src/components/layout/AppShell.tsx` |
| 4 | **Penghapusan garis fokus (`focus:outline-none`)** pada kotak input login dan filter pencarian tabel prioritas yang menyulitkan pengguna papan ketik (*keyboard*). | Dihapus `focus:outline-none` pada kontrol form dan diterapkan cincin fokus `:focus-visible` bergaya buku besar (`outline: 3px solid var(--accent-anomali)` dengan *halo* kertas). | `src/index.css`, `src/pages/LoginPage.tsx`, `src/pages/PrioritasPage.tsx` |
| 5 | **Kontras teks oranye karat (`#D9480F`) di atas kertas hangat (`#F3EFE4`)** sebesar `3,74:1` (cukup untuk elemen grafis/bingkai $\ge 3:1$, namun belum mencapai $\ge 4,5:1$ untuk teks kecil). | Dipisahkan menjadi dua token semantik: `--accent-anomali: #D9480F` untuk isian titik, garis ambang, dan bingkai sel; serta `--accent-anomali-teks: #A93509` (kontras **`5,71:1`** di atas kertas `#F3EFE4`, lulus WCAG AA) untuk seluruh teks dan angka anomali. | `src/index.css`, seluruh komponen & halaman |
| 6 | **Berkas *placeholder/stub* sisa pengembangan fase awal** (`ShellPlaceholderPage.tsx` dan `ProfilStubPage.tsx`) yang tidak lagi dirutekan. | Dihapus sepenuhnya dari kode sumber agar repositori bersih. | `src/pages/` |

---

## 2. Audit Animasi & Dukungan `prefers-reduced-motion`

Setiap gerak di dalam aplikasi telah diaudit agar **memiliki fungsi pembacaan data** (bukan hiasan) dan berada di rentang durasi `150–400 ms` dengan kurva `cubic-bezier(0.2, 0.7, 0.2, 1)`:

1. **Pita Bulan (`layoutId="pita-bulan-aktif-bar"`)**: Menunjukkan perpindahan cakupan waktu pengawasan secara kontinu.
2. **Strip-Plot Sebaran LOF (animasi pegas `x/y`)**: Memperlihatkan pergeseran posisi skor LOF tiap pangkalan ketika bulan diganti.
3. **Baris Tabel Prioritas (`layout` + `layoutId="pangkalan-header-{kode}"`)**: Menjaga orientasi mata saat daftar disaring per kategori dan menghubungkan baris tabel dengan kepala halaman Profil Pangkalan.
4. **Peta Panas (gelombang diagonal $\le 640\text{ ms}$ + bingkai sel dinamis `180 ms`)**: Memandu mata membaca matriks dari kiri-atas ke kanan-bawah serta memperlihatkan sel mana yang masuk/keluar saat batas ambang digeser.
5. **Kurva LOF 10 Bulan (`pathLength: 0 -> 1`, `380 ms`)**: Menunjukkan perjalanan kronologis skor LOF dari Januari hingga Oktober.
6. **LOF Playground (pegas pada lingkaran `k-distance` dan titik `q`)**: Memperlihatkan secara langsung hubungan antara jarak ke klaster padat dan lonjakan skor LOF.
7. **Dukungan `prefers-reduced-motion: reduce`**: Seluruh komponen membaca hook `usePrefersReducedMotion()` dan aturan CSS `@media (prefers-reduced-motion: reduce)` yang mematikan seluruh animasi/transisi menjadi instan (`0 ms`).

---

## 3. Audit Aksesibilitas (WCAG AA & Navigasi Papan Ketik)

- **Kontras Warna (Lulus WCAG AA $\ge 4,5:1$)**:
  - Mode Terang (`#F3EFE4`): Tinta utama `#17211C` (**`14,38:1`**), Teks redup `#435049` (**`7,36:1`**), Teks lembut `#52615A` (**`5,68:1`**), Teks anomali `#A93509` (**`5,71:1`**), Teks berulang `#7F5600` (**`5,65:1`**), Teks konsisten tinggi `#2B5470` (**`7,02:1`**).
  - Mode Gelap (`#0F1814`): Tinta terang `#F3EFE4` (**`15,74:1`**), Teks redup `#C2BCB0` (**`9,57:1`**), Teks lembut `#9CA69F` (**`7,21:1`**), Aksen anomali `#FF6B35` (**`6,38:1`**), Aksen berulang `#F0B429` (**`9,70:1`**), Aksen biru baja `#6BA3C7` (**`6,62:1`**).
- **Navigasi Papan Ketik & *Focus Ring***:
  - Tersedia tautan **Lompat ke isi halaman** (`.lompat-ke-konten`) saat menekan `Tab` pertama kali.
  - Sel matriks **Peta Panas** mendukung *roving tabindex* (`Tab` masuk ke matriks, tombol panah `ArrowRight/Left/Down/Up` berpindah antarsel, `Enter`/`Space` membuka profil bulan tersebut).
  - Titik uji **`q` pada LOF Playground** dapat difokuskan dengan `Tab` dan digeser menggunakan tombol panah (`Shift + Panah` untuk langkah besar).
- **Tabel Alternatif Pembaca Layar**:
  - Halaman Peta Panas menyediakan `<table className="sr-only" data-testid="heatmap-sr-table">` lengkap dengan `<caption>`, `<th scope="col">`, dan `<th scope="row">` untuk seluruh 30 pangkalan × 10 bulan.

---

## 4. Performa & Pemecahan Bundel per Rute

- **Pemecahan Bundel per Rute (`React.lazy` + `manualChunks`)**:
  - `index.js` utama: **25,38 kB** (*gzip*: **7,98 kB**)
  - `LoginPage.js`: **8,78 kB** (*gzip*: **2,73 kB**)
  - `TemuanAturanPage.js`: **9,72 kB** (*gzip*: **3,41 kB**)
  - `PrioritasPage.js`: **14,43 kB** (*gzip*: **4,70 kB**)
  - `PetaPanasPage.js`: **16,76 kB** (*gzip*: **5,71 kB**)
  - `RingkasanPage.js`: **18,11 kB** (*gzip*: **5,56 kB**)
  - `ProfilPangkalanPage.js`: **24,23 kB** (*gzip*: **6,54 kB**)
  - `OperasionalPage.js`: **31,32 kB** (*gzip*: **7,01 kB**)
  - `MetodePage.js`: **44,97 kB** (*gzip*: **11,96 kB**)
- **Font Self-Host Subset Latin**: Menggunakan subset `latin` dari `@fontsource/newsreader`, `@fontsource/ibm-plex-sans`, dan `@fontsource/ibm-plex-mono` sehingga berjalan 100% luring (*offline*) tanpa memanggil Google Fonts CDN.
- **Satu Origin Produksi (`backend/public`)**: Hasil `npm run build` disalin langsung ke `backend/public` dan dilayani oleh rute SPA Laravel (`backend/routes/web.php`) tanpa kendala CORS.
