# Dokumentasi REST API — Lembar Pantau (Fase 2)

Seluruh endpoint berada di bawah prefix `/api` dan mengembalikan amplop JSON seragam `{ "data": ..., "meta": ... }` (kecuali `/api/export/prioritas.csv` yang mengembalikan berkas CSV). Seluruh endpoint selain `/api/health` dan `/api/auth/login` wajib menyertakan header `Authorization: Bearer <token>`.

## Kerahasiaan Nama Pangkalan (Role-Based Visibility)
- **`petugas`**: Hanya menerima kode `P01`–`P30`. Field `nama` dan `id_registrasi` disembunyikan dari seluruh JSON dan ekspor CSV, serta pencarian `?q=` tidak mencocokkan nama asli.
- **`admin`**: Menerima kode `P01`–`P30` beserta `nama` pangkalan asli dan `id_registrasi`.

## Daftar Endpoint

| Metode | Endpoint | Deskripsi |
| :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Masuk dengan `email` & `password` (dibatasi *rate limit* 5 percobaan/menit). |
| `POST` | `/api/auth/logout` | Mencabut Bearer token sesi saat ini. |
| `GET` | `/api/me` | Mengambil profil pengguna aktif beserta hak akses `can_view_real_name`. |
| `GET` | `/api/ringkasan?bulan=` | Ringkasan jumlah dinilai, ditandai, distribusi per kategori, sebaran LOF, dan flag aturan (di-cache 5 menit). |
| `GET` | `/api/prioritas?bulan=&kategori=&q=&sort=` | Daftar pangkalan beserta strip 10 bulan, `maks_lof`, ringkasan flag aturan, dan kalimat alasan dari fitur dengan `|z|` terbesar. |
| `GET` | `/api/pangkalan/{kode}` | Profil lengkap satu pangkalan (`P01`–`P30`): volume harian per bulan, LOF per bulan, 4 fitur mentah & z-score beserta median pangkalan lain per bulan, alokasi vs realisasi, dan flag aturan. |
| `GET` | `/api/heatmap` | Matriks 30 pangkalan × 10 bulan (`lof`, `flag`, `nol`) diurutkan menurut prioritas kategori (di-cache 5 menit). |
| `GET` | `/api/temuan-aturan?jenis=&bulan=` | Daftar kejadian flag aturan berdampingan dengan skor LOF pada bulan terkait. |
| `GET` | `/api/metode` | Parameter model LOF, aturan klasifikasi, keterbatasan metodologis, dan isi `evaluasi_lof.csv` (Bab V). |
| `GET` | `/api/export/prioritas.csv` | Unduh daftar prioritas dalam format CSV (kolom nama pangkalan disesuaikan menurut role). |
