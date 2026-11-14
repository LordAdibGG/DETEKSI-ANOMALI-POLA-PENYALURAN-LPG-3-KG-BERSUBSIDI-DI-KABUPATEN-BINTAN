# Draf Bab II.3 – Exploratory Data Analysis

> Draf kerangka temuan. Angka diambil dari `ringkasan_per_agen.csv`, `ringkasan_per_kecamatan.csv`, dan `statistik_ringkas.csv`. Tulis ulang dengan bahasa tim dan sisipkan gambar `g1`–`g7`.

## 1. Gambaran umum data

Data terdiri atas 350 pangkalan dari 4 agen. Tiga agen (KPG, KJP, BGJS; 194 pangkalan) mencatat April 2024. Agen MCAM (156 pangkalan) memiliki periode yang belum terkonfirmasi, sehingga dianalisis terpisah.

| Agen | Pangkalan | Total tabung | Median/pangkalan | Alokasi | Utilisasi agen | Nol sebulan | Median hari aktif |
|---|---|---|---|---|---|---|---|
| KPG | 74 | 43.680 | 540 | 45.030 | 0,97 | 2 | 13 |
| KJP | 26 | 12.880 | 495 | 7.900 | 1,63 | 0 | 9 |
| BGJS | 94 | 46.480 | 407,5 | 45.430 | 1,02 | 4 | 9 |
| MCAM | 156 | 86.240 | 428,5 | – | – | 6 | 9 |

## 2. Temuan utama dan implikasinya bagi pemodelan

**a. Sebaran total sangat miring ke kanan (g1).** Skewness total per pangkalan: MCAM 2,04; BGJS 1,15. Sebanyak 15 pangkalan melewati batas outlier IQR (1.308 tabung). Implikasi: gunakan normalisasi yang tahan outlier, dan jangan buang outlier karena itulah target deteksi.

**b. Utilisasi kuota bervariasi lebar (g2).** Realisasi melebihi alokasi pada 50 dari 94 pangkalan BGJS, 21 dari 26 KJP, dan 36 dari 74 KPG. Lebih dari 2 kali alokasi: 13 BGJS, 7 KJP, 3 KPG. Kasus ekstrem: JULINDA (alokasi 100, realisasi 899) dan PANGKALAN KEMBAR (alokasi 50, realisasi 280).
Catatan penting untuk menjawab masukan dosen: alokasi tampak **tidak berbasis kebutuhan**. Nilai modus alokasi adalah 500, dan seluruh pangkalan KJP hanya beralokasi 300 atau 400. Jadi utilisasi tinggi belum tentu penyimpangan, bisa juga alokasinya yang terlalu kecil. Utilisasi hanya satu sinyal di antara beberapa.

**c. Jadwal penyaluran berbeda antar agen (g3, g4).** Median hari aktif KPG 13 hari, sedangkan KJP, BGJS, dan MCAM 9 hari. Pola jadwalnya juga berbeda (selang-seling vs siklus tiga hari). Implikasi: fitur frekuensi dan variasi harus dibandingkan **di dalam agen** atau dinormalkan per agen, supaya perbedaan jadwal agen tidak terbaca sebagai anomali pangkalan.

**d. Pola angka seragam sangat dominan di KPG (g6).** Pada pangkalan dengan minimal 8 hari aktif, 31 pangkalan KPG menyalurkan angka yang sama (≥90% hari aktif), dibandingkan hanya 1 di BGJS. Ini bisa menandakan praktik pembulatan atau pencatatan berdasarkan kuota tetap, bukan transaksi riil. Perlu klarifikasi ke narasumber. Sebanyak 38% total pangkalan berkelipatan 5, indikasi kecenderungan angka bulat.

**e. Lonjakan satu hari dan pangkalan tidur.** Ada 13 pangkalan dengan satu hari menyumbang lebih dari 40% total (hari aktif ≤3), misalnya TUGINO (208 tabung dalam satu hari) dan MAJU BERSAMA di MCAM (560 tabung dalam satu hari). Sebanyak 12 pangkalan tidak menyalurkan apa pun selama sebulan (KPG 2, BGJS 4, MCAM 6). Beberapa di antaranya berupa SPBU, koperasi, atau pertashop yang jenis usahanya berbeda dari pangkalan biasa, jadi periksa sebelum menyimpulkan.

**f. Sebaran wilayah.** Dari 250 pangkalan yang kecamatannya diketahui, Bintan Utara menyumbang porsi terbesar (23,1% dari total), diikuti Bintan Timur (19,3%) dan Teluk Sebong (16,7%). Kecamatan Tambelan, Mantang, dan Bintan Pesisir jumlah pangkalannya sedikit (4–6), sehingga statistik per kecamatan di sana kurang stabil. Seratus pangkalan (KPG dan KJP) belum memiliki kecamatan.

**g. Keterbatasan.** Satu bulan data, tidak ada data musiman; periode MCAM belum pasti; alokasi MCAM tidak tersedia; total harian KJP tepat 560 tabung hampir tiap hari aktif (perlu klarifikasi).

## 3. Rancangan fitur untuk Bab III–IV (hasil EDA)

Fitur yang sudah dihitung di `fitur_eksplorasi_pangkalan.csv`: total, hari aktif dan rasionya, rerata pada hari aktif, koefisien variasi, maksimum harian, porsi hari puncak, rasio puncak/rerata, porsi nilai dominan, jumlah nilai unik, dan utilisasi. Cek korelasinya di `g7` dan buang fitur yang terlalu berkorelasi sebelum K-Means.

## 4. Pertanyaan untuk narasumber Dinas

1. Berapa bulan periode data MCAM?
2. Bagaimana alokasi per pangkalan ditetapkan, dan mengapa banyak yang bernilai 500 atau 300?
3. Mengapa total harian KJP seragam 560 tabung?
4. Apakah pencatatan angka sama berulang (mis. 50/50/50) di KPG lazim?
5. Apakah SPBU, koperasi, dan pertashop diperlakukan berbeda dari pangkalan biasa?
