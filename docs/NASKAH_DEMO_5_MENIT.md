# Naskah Demo 5 Menit — Lembar Pantau (Pengawasan LPG 3 kg Kab. Bintan)

**Total Durasi:** 5 Menit (300 detik)  
**Mode Presentasi:** Satu Origin (`http://127.0.0.1:8000` atau `http://localhost:5173`), berjalan 100% tanpa koneksi internet.

---

## Menit 0:00 – 0:45 | Pembukaan & Halaman Masuk Tipografis (`/masuk`)

- **Tindakan di Layar:**
  1. Buka `/masuk` pada layar proyektor (`1920×1080` atau `1366×768`).
  2. Tunjukkan kolofon riset di sisi kiri: **30 pangkalan**, **293 pangkalan-bulan**, **282 masuk model**, **28 ditandai** (`k=10`, batas `1,50`).
  3. Klik tombol **Isi Akun Admin** lalu klik **Buka Buku Besar Pengawasan**.
- **Narasi:**
  > *"Lembar Pantau dirancang sebagai buku besar pengawasan untuk membantu Bagian Perekonomian Setda Kabupaten Bintan dan Tim Monev menyusun prioritas pemeriksaan lapangan pangkalan LPG 3 kg. Prinsip utamanya tegas: skor LOF adalah **indikasi awal** untuk memprioritaskan kunjungan, bukan bukti pelanggaran. Kami memisahkan peran Petugas (hanya melihat kode P01–P30) dan Admin Setda (melihat identitas lengkap pangkalan)."*

---

## Menit 0:45 – 1:45 | Ringkasan Editorial & Daftar Prioritas (`/ringkasan` → `/prioritas`)

- **Tindakan di Layar:**
  1. Di `/ringkasan`, tunjukkan kalimat editorial utama Jan–Okt (`28 dari 282 pengamatan pangkalan-bulan`).
  2. Klik tombol **Maret (`03 Mar`)** pada **Pita Bulan** di atas. Tunjukkan kalimat berubah menjadi *"Pada Maret 2026, 3 dari 28 pangkalan yang dinilai polanya menyimpang dari pangkalan lain"* dan titik-titik pada *strip-plot* bergeser mulus dengan animasi pegas.
  3. Klik tombol **Reset** pada Pita Bulan, lalu buka menu **II. Prioritas** (`/prioritas`).
  4. Klik chip kategori **Konsisten tinggi (1)** dan **Berulang (3)** untuk melihat baris berpindah halus. Tunjukkan kolom **Strip 10 Bulan** dan **Alasan Utama** berbahasa Indonesia.
- **Narasi:**
  > *"Alih-alih menampilkan banyak kartu angka generik, halaman Ringkasan langsung merangkum temuan dalam satu kalimat editorial, didampingi strip-plot sebaran LOF dan satu bar bertumpuk komposisi kategori. Di halaman Daftar Prioritas, petugas langsung membaca strip 10 bulan dan alasan terjemahan fitur dengan |z| terbesar—misalnya variasi harian atau porsi nilai dominan yang jauh di atas pangkalan lain."*

---

## Menit 1:45 – 3:00 | Peta Panas & Bedah Profil Pangkalan (`/peta-panas` → `/pangkalan/P10`)

- **Tindakan di Layar:**
  1. Buka **III. Peta Panas** (`/peta-panas`). Tunjukkan matriks 30 pangkalan × 10 bulan yang dikelompokkan menurut kategori, dengan `P10` ditandai 7 bulan dan `P07` ditandai beruntun Juni–Oktober.
  2. Arahkan kursor (*hover*) ke sel **P10 · Sep** (`LOF 2,40`) untuk menampilkan garis silang dan keempat nilai *z-score* di panel kanan. Geser slider **"Lihat dengan batas lain"** sejenak untuk memperlihatkan sensitivitas bingkai sel, lalu kembalikan ke `1,50`.
  3. Klik sel **P10** untuk membuka **Profil Pangkalan** (`/pangkalan/P10`). Tunjukkan 4 blok visualisasi beserta kalimat *"Cara membaca"* di tiap blok, termasuk pengecualian Februari 2026 pada blok Alokasi vs Realisasi.
- **Narasi:**
  > *"Pada Peta Panas, 300 sel dikelompokkan per kategori konsistensi; sel penyaluran nol diarsir dan sel LOF ≥ 1,50 diberi bingkai tegas. Saat kita membuka profil P10, kita melihat 4 bukti berdampingan: batang volume harian (Minggu abu-abu), kurva LOF 10 bulan, grafik lollipop 4 fitur z-score dibandingkan median pangkalan lain, serta perbandingan alokasi vs realisasi."*

---

## Menit 3:00 – 4:00 | Temuan Aturan, Metode & LOF Playground (`/temuan-aturan` → `/metode`)

- **Tindakan di Layar:**
  1. Buka **IV. Temuan Aturan** (`/temuan-aturan`), tunjukkan mengapa aturan deterministik dipisahkan dari LOF (hanya **11%** tumpang tindih; 33 kejadian melebihi alokasi tanpa Februari, 69 fakultatif).
  2. Buka **V. Metode** (`/metode`), gulir singkat melewati **Stepper 5 Langkah Tabel IV.1 (`k=2`)** dan grafik evaluasi Bab V, lalu berhenti di **LOF Playground**.
  3. Klik tombol preset **1. Dalam Klaster Padat** (`LOF ≈ 1,01`) lalu seret titik **q** menjauhi klaster padat (atau klik preset **3. Pencilan Jauh dari Padat**) hingga lingkaran *k-distance* membesar dan `LOF(q)` melonjak melewati `3,00`.
- **Narasi:**
  > *"Mengapa kami memakai Local Outlier Factor? Di LOF Playground ini, seluruh 5 langkah rumus LOF dihitung langsung di peramban. Ketika titik q berada di dalam klaster renggang, skornya tetap normal karena tetangganya sama-sama renggang. Namun begitu titik q digeser menjauhi klaster padat, kepadatan lokalnya anjlok dibanding tetangga padatnya dan skor LOF langsung naik."*

---

## Menit 4:00 – 5:00 | Siklus Operasional: Unggah Bulan Fiktif, Top-N & Ekspor (`/operasional`)

- **Tindakan di Layar:**
  1. Buka **VI. Operasional** (`/operasional`).
  2. Klik **Muat Contoh Bulan Fiktif (Nov 2026)** — tunjukkan **4 Cek Validasi LULUS** (`Harian = Normal`, `Normal + Fakultatif = Grand Total`, `Sisa = Alokasi − Grand Total`, `Total Agen`).
  3. Klik **Konfirmasi & Jalankan Analisis** -> tunjukkan *run* baru `unggah-bln11-k10` tercipta dan `P11` serta `P12` masuk ke daftar prioritas pada panel perbandingan Jaccard.
  4. Simpan satu catatan **Tindak Lanjut** untuk `P10`, lalu klik **Lihat Daftar Prioritas →** untuk menunjukkan perubahan daftar dan tombol **Cetak Daftar / Unduh CSV**.
- **Narasi:**
  > *"Terakhir, untuk operasional rutin setiap bulan: staf cukup mengunggah CSV laporan agen, sistem memeriksa 4 cek aritmetika secara otomatis, lalu menjalankan analisis ulang dan membandingkan hasilnya terhadap baseline menggunakan indeks Jaccard. Hasil pemeriksaan lapangan dicatat sebagai label awal evaluasi berikutnya, dan daftar prioritas siap diekspor ke CSV atau dicetak A4 untuk surat tugas lapangan. Terima kasih."*
