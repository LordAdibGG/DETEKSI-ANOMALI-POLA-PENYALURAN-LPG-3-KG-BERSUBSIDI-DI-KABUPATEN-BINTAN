<?php

namespace App\Console\Commands;

use App\Models\Agen;
use App\Models\AnalysisRun;
use App\Models\AuditLog;
use App\Models\Pangkalan;
use App\Models\TindakLanjut;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class ImportKjp2026Command extends Command
{
    protected $signature = 'import:kjp2026 {--fresh : Kosongkan tabel domain dan muat ulang seluruh data dari awal}';

    protected $description = 'Impor data riset KJP 2026 dari /data ke MySQL dan buat run baseline-k10 secara idempoten.';

    /**
     * Jumlah hari kalender per bulan (Januari - Oktober 2026).
     *
     * @var array<int, int>
     */
    private const HARI_PER_BULAN = [
        1 => 31,
        2 => 28,
        3 => 31,
        4 => 30,
        5 => 31,
        6 => 30,
        7 => 31,
        8 => 31,
        9 => 30,
        10 => 31,
    ];

    public function handle(): int
    {
        $startedAt = microtime(true);
        $dataDir = realpath(base_path('../data')) ?: base_path('../data');

        $klasifikasiPath = $dataDir . DIRECTORY_SEPARATOR . 'kjp_2026_klasifikasi_pangkalan.csv';
        $lofBulananPath = $dataDir . DIRECTORY_SEPARATOR . 'kjp_2026_lof_per_bulan.csv';
        $widePath = $dataDir . DIRECTORY_SEPARATOR . 'kjp_2026_wide.csv';
        $kecamatanPath = $dataDir . DIRECTORY_SEPARATOR . 'usulan_pemetaan_kecamatan.csv';

        foreach ([$klasifikasiPath, $lofBulananPath, $widePath, $kecamatanPath] as $file) {
            if (!is_file($file)) {
                $this->error("Berkas sumber tidak ditemukan: {$file}");
                return self::FAILURE;
            }
        }

        if (!Schema::hasTable('pangkalan') || !Schema::hasTable('analysis_runs')) {
            $this->info('Tabel belum lengkap, menjalankan migrasi terlebih dahulu...');
            $this->call('migrate', ['--force' => true]);
        }

        if ($this->option('fresh')) {
            $this->info('Opsi --fresh aktif: mengosongkan tabel domain...');
            Schema::disableForeignKeyConstraints();
            foreach ([
                'audit_log',
                'tindak_lanjut',
                'flag_aturan',
                'klasifikasi_pangkalan',
                'hasil_lof',
                'fitur_bulanan',
                'analysis_runs',
                'penyaluran_harian',
                'laporan_bulanan',
                'pangkalan',
                'agen',
            ] as $table) {
                DB::table($table)->truncate();
            }
            Schema::enableForeignKeyConstraints();
        }

        // Pastikan seeder pengguna (1 admin, 1 petugas) sudah terisi
        $this->callSilent(DatabaseSeeder::class);

        $klasifikasiRows = $this->readCsv($klasifikasiPath);
        $lofBulananRows = $this->readCsv($lofBulananPath);
        $wideRows = $this->readCsv($widePath);
        $kecamatanRows = $this->readCsv($kecamatanPath);

        // Indeks pemetaan kecamatan berdasarkan id_pangkalan (khusus KJP atau umum)
        $kecMap = [];
        foreach ($kecamatanRows as $row) {
            $idReg = trim((string) ($row['id_pangkalan'] ?? ''));
            if ($idReg === '' || isset($kecMap[$idReg])) {
                continue;
            }
            $rawKec = trim((string) ($row['kecamatan'] ?? ''));
            $subKec = trim((string) ($row['kecamatan_sub'] ?? ''));
            $subKel = trim((string) ($row['kelurahan_sub'] ?? ''));

            $kecFinal = null;
            $sumber = 'tidak tersedia';
            if ($rawKec !== '') {
                $kecFinal = $this->normalizeKecamatan($rawKec);
                $sumber = 'berkas sumber';
            } elseif ($subKec !== '') {
                $kecFinal = $this->normalizeKecamatan($subKec);
                $sumber = 'daftar subpenyalur Sep 2025 (perlu verifikasi)';
            }

            $kecMap[$idReg] = [
                'kecamatan' => $kecFinal,
                'kelurahan' => $subKel !== '' ? $subKel : null,
                'sumber_kecamatan' => $sumber,
            ];
        }

        // Indeks baris kjp_2026_lof_per_bulan.csv berdasarkan (id_pangkalan, bulan)
        $lofMap = [];
        foreach ($lofBulananRows as $row) {
            $key = trim((string) $row['id_pangkalan']) . '#' . (int) $row['bulan'];
            $lofMap[$key] = $row;
        }

        // Indeks baris kjp_2026_wide.csv berdasarkan (id_pangkalan, bulan)
        $wideMap = [];
        foreach ($wideRows as $row) {
            $key = trim((string) $row['id_pangkalan']) . '#' . (int) $row['bulan'];
            $wideMap[$key] = $row;
        }

        $now = now();

        DB::transaction(function () use ($klasifikasiRows, $lofMap, $wideMap, $kecMap, $now) {
            // 1. Agen KJP
            $agen = Agen::updateOrCreate(
                ['kode' => 'KJP'],
                [
                    'nama' => 'PT Kijang Jaya Perkasa (KJP)',
                    'alamat' => 'Kabupaten Bintan, Kepulauan Riau',
                ]
            );

            // 2. Pangkalan (P01 - P30 sesuai nomor urut baris kjp_2026_klasifikasi_pangkalan.csv)
            $pangkalanIdByReg = [];
            foreach ($klasifikasiRows as $index => $row) {
                $nomorUrut = $index + 1;
                $kode = sprintf('P%02d', $nomorUrut);
                $idReg = trim((string) $row['id_pangkalan']);
                $nama = trim((string) $row['nama_pangkalan']);
                $metaKec = $kecMap[$idReg] ?? [
                    'kecamatan' => null,
                    'kelurahan' => null,
                    'sumber_kecamatan' => 'tidak tersedia',
                ];

                $nonReguler = (bool) preg_match(
                    '/SPBU|KOPERASI|PERTASHOP|^PT[ .]|^CV[ .]|APMS|BUMDES|KDMP/i',
                    $nama
                );

                // Pastikan kode unik tidak bentrok bila urutan berubah
                $pangkalan = Pangkalan::updateOrCreate(
                    ['id_registrasi' => $idReg],
                    [
                        'agen_id' => $agen->id,
                        'kode' => $kode,
                        'nama' => $nama,
                        'kecamatan' => $metaKec['kecamatan'],
                        'kelurahan' => $metaKec['kelurahan'],
                        'sumber_kecamatan' => $metaKec['sumber_kecamatan'],
                        'non_reguler' => $nonReguler,
                    ]
                );

                $pangkalanIdByReg[$idReg] = $pangkalan->id;

                // Buat catatan tindak_lanjut awal bila belum ada untuk pangkalan ini
                TindakLanjut::firstOrCreate(
                    ['pangkalan_id' => $pangkalan->id],
                    [
                        'status' => 'belum_diperiksa',
                        'catatan' => 'Indikasi awal dari impor baseline KJP 2026.',
                        'user_id' => null,
                    ]
                );
            }

            // 3. Analysis Run "baseline-k10"
            $run = AnalysisRun::updateOrCreate(
                ['nama' => 'baseline-k10'],
                [
                    'k' => 10,
                    'threshold' => 1.5,
                    'fitur' => [
                        'log_total',
                        'cv_harian',
                        'rasio_hari_aktif',
                        'porsi_nilai_dominan',
                    ],
                    'catatan' => 'Run dasar KJP Januari-Oktober 2026 (z-score robust per bulan, LOF k=10, batas 1,5, hari Minggu dikeluarkan).',
                    'dibuat' => $now,
                ]
            );

            // 4. Laporan Bulanan (293 baris)
            $laporanRowsToUpsert = [];
            foreach ($wideMap as $key => $wRow) {
                $idReg = trim((string) $wRow['id_pangkalan']);
                $bulan = (int) $wRow['bulan'];
                $pangkalanId = $pangkalanIdByReg[$idReg] ?? null;
                if (!$pangkalanId) {
                    throw new RuntimeException("Pangkalan dengan ID registrasi {$idReg} tidak ditemukan di tabel klasifikasi.");
                }

                $lRow = $lofMap[$key] ?? null;
                $hariAktif = $lRow ? (int) $lRow['hari_aktif'] : 0;
                $nHariKerja = $lRow ? (int) $lRow['n_hari_kerja'] : 26;

                $laporanRowsToUpsert[] = [
                    'pangkalan_id' => $pangkalanId,
                    'bulan' => $bulan,
                    'tahun' => 2026,
                    'alokasi' => (int) $wRow['alokasi'],
                    'total_normal' => (int) $wRow['total_normal'],
                    'fakultatif' => (int) $wRow['total_fakultatif'],
                    'grand_total' => (int) $wRow['grand_total'],
                    'sisa_alokasi' => (int) $wRow['sisa_alokasi'],
                    'hari_aktif' => $hariAktif,
                    'n_hari_kerja' => $nHariKerja,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            DB::table('laporan_bulanan')->upsert(
                $laporanRowsToUpsert,
                ['pangkalan_id', 'bulan'],
                ['tahun', 'alokasi', 'total_normal', 'fakultatif', 'grand_total', 'sisa_alokasi', 'hari_aktif', 'n_hari_kerja', 'updated_at']
            );

            // Ambil pemetaan (pangkalan_id#bulan) -> laporan_id
            $laporanIdByKey = [];
            $allLaporan = DB::table('laporan_bulanan')->select('id', 'pangkalan_id', 'bulan')->get();
            foreach ($allLaporan as $lap) {
                $laporanIdByKey[$lap->pangkalan_id . '#' . $lap->bulan] = $lap->id;
            }

            // Bersihkan data turunan sebelum diisi ulang agar idempoten penuh
            $allLaporanIds = array_values($laporanIdByKey);
            DB::table('penyaluran_harian')->whereIn('laporan_id', $allLaporanIds)->delete();
            DB::table('flag_aturan')->whereIn('laporan_id', $allLaporanIds)->delete();
            DB::table('fitur_bulanan')->where('run_id', $run->id)->delete();
            DB::table('hasil_lof')->where('run_id', $run->id)->delete();
            DB::table('klasifikasi_pangkalan')->where('run_id', $run->id)->delete();

            // 5. Penyaluran Harian, Fitur Bulanan, Hasil LOF, dan Flag Aturan
            $harianBatch = [];
            $fiturBatch = [];
            $lofBatch = [];
            $flagAturanBatch = [];

            foreach ($wideMap as $key => $wRow) {
                $idReg = trim((string) $wRow['id_pangkalan']);
                $bulan = (int) $wRow['bulan'];
                $pangkalanId = $pangkalanIdByReg[$idReg];
                $laporanId = $laporanIdByKey[$pangkalanId . '#' . $bulan];
                $lRow = $lofMap[$key];

                // Penyaluran harian untuk setiap tanggal valid di bulan tersebut (d01..dN)
                $jumlahHari = self::HARI_PER_BULAN[$bulan] ?? 30;
                for ($d = 1; $d <= $jumlahHari; $d++) {
                    $col = sprintf('d%02d', $d);
                    $valRaw = $wRow[$col] ?? '0';
                    $volume = ($valRaw === '' || $valRaw === null) ? 0 : (int) round((float) $valRaw);
                    $tanggal = sprintf('2026-%02d-%02d', $bulan, $d);
                    $dayOfWeek = (int) date('w', strtotime($tanggal)); // 0 = Minggu

                    $harianBatch[] = [
                        'laporan_id' => $laporanId,
                        'tanggal' => $tanggal,
                        'hari' => $d,
                        'is_minggu' => $dayOfWeek === 0,
                        'volume' => $volume,
                    ];
                }

                // 4 fitur mentah + 4 z-score
                $fiturBatch[] = [
                    'run_id' => $run->id,
                    'laporan_id' => $laporanId,
                    'log_total' => $this->toNullableFloat($lRow['log_total'] ?? null),
                    'cv_harian' => $this->toNullableFloat($lRow['cv_harian'] ?? null),
                    'rasio_hari_aktif' => $this->toNullableFloat($lRow['rasio_hari_aktif'] ?? null),
                    'porsi_nilai_dominan' => $this->toNullableFloat($lRow['porsi_nilai_dominan'] ?? null),
                    'z_log_total' => $this->toNullableFloat($lRow['z_log_total'] ?? null),
                    'z_cv_harian' => $this->toNullableFloat($lRow['z_cv_harian'] ?? null),
                    'z_rasio_hari_aktif' => $this->toNullableFloat($lRow['z_rasio_hari_aktif'] ?? null),
                    'z_porsi_nilai_dominan' => $this->toNullableFloat($lRow['z_porsi_nilai_dominan'] ?? null),
                    'created_at' => $now,
                    'updated_at' => $now,
                ];

                // Hasil LOF (lof nullable untuk 11 baris nol sebulan, terisi untuk 282 baris masuk model)
                $lofBatch[] = [
                    'run_id' => $run->id,
                    'laporan_id' => $laporanId,
                    'lof' => $this->toNullableFloat($lRow['lof'] ?? null),
                    'flag' => $this->toBool($lRow['flag_lof'] ?? false),
                    'created_at' => $now,
                    'updated_at' => $now,
                ];

                // Flag Aturan (6 jenis sesuai angka acuan)
                $aturanMapping = [
                    'r_realisasi_gt_alokasi' => 'melebihi_alokasi',
                    'r_gt_2x_alokasi' => 'gt_2x_alokasi',
                    'r_nol_sebulan' => 'nol',
                    'r_lonjakan_satu_hari' => 'lonjakan',
                    'r_pola_seragam' => 'seragam',
                    'r_fakultatif' => 'fakultatif',
                ];

                foreach ($aturanMapping as $csvCol => $jenisFlag) {
                    if ($this->toBool($lRow[$csvCol] ?? false)) {
                        $flagAturanBatch[] = [
                            'laporan_id' => $laporanId,
                            'jenis' => $jenisFlag,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ];
                    }
                }
            }

            foreach (array_chunk($harianBatch, 1000) as $chunk) {
                DB::table('penyaluran_harian')->insert($chunk);
            }

            foreach (array_chunk($fiturBatch, 300) as $chunk) {
                DB::table('fitur_bulanan')->insert($chunk);
            }

            foreach (array_chunk($lofBatch, 300) as $chunk) {
                DB::table('hasil_lof')->insert($chunk);
            }

            if (!empty($flagAturanBatch)) {
                DB::table('flag_aturan')->insert($flagAturanBatch);
            }

            // 6. Klasifikasi Pangkalan (30 baris)
            $klasifikasiBatch = [];
            foreach ($klasifikasiRows as $row) {
                $idReg = trim((string) $row['id_pangkalan']);
                $pangkalanId = $pangkalanIdByReg[$idReg];
                $rawKategori = trim((string) $row['kategori_lof']);

                $klasifikasiBatch[] = [
                    'run_id' => $run->id,
                    'pangkalan_id' => $pangkalanId,
                    'kategori' => $this->normalizeKategori($rawKategori),
                    'kategori_label' => $rawKategori,
                    'bulan_valid' => (int) $row['bulan_valid'],
                    'bulan_flag' => (int) $row['bulan_flag_lof'],
                    'proporsi_flag' => $this->toNullableFloat($row['proporsi_flag'] ?? null),
                    'rerata_lof' => $this->toNullableFloat($row['rerata_lof'] ?? null),
                    'maks_lof' => $this->toNullableFloat($row['maks_lof'] ?? null),
                    'bulan_maks' => ($row['bulan_maks'] ?? '') !== '' ? trim((string) $row['bulan_maks']) : null,
                    'bulan_yang_ditandai' => ($row['bulan_yang_ditandai'] ?? '') !== '' ? trim((string) $row['bulan_yang_ditandai']) : null,
                    'run_terpanjang' => (int) ($row['run_bulan_berurutan_terpanjang'] ?? 0),
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            DB::table('klasifikasi_pangkalan')->insert($klasifikasiBatch);

            // 7. Catat pada audit_log
            $adminUser = User::where('role', 'admin')->first();
            AuditLog::create([
                'user_id' => $adminUser?->id,
                'aksi' => 'import:kjp2026',
                'entitas' => 'analysis_runs',
                'entitas_id' => $run->id,
                'detail' => [
                    'run_nama' => 'baseline-k10',
                    'fresh' => (bool) $this->option('fresh'),
                    'pangkalan' => count($klasifikasiRows),
                    'laporan_bulanan' => count($laporanRowsToUpsert),
                    'penyaluran_harian' => count($harianBatch),
                    'flag_aturan' => count($flagAturanBatch),
                ],
                'ip_address' => '127.0.0.1',
            ]);
        });

        $elapsed = round(microtime(true) - $startedAt, 2);
        $this->info("Impor KJP 2026 (run: baseline-k10) selesai dalam {$elapsed} detik.");

        return self::SUCCESS;
    }

    /**
     * @return array<int, array<string, string>>
     */
    private function readCsv(string $path): array
    {
        $handle = fopen($path, 'r');
        if ($handle === false) {
            throw new RuntimeException("Tidak dapat membuka berkas CSV: {$path}");
        }

        $headers = fgetcsv($handle);
        if ($headers === false) {
            fclose($handle);
            return [];
        }

        $headers = array_map(fn ($h) => trim((string) $h, "\xEF\xBB\xBF \t\n\r\0\x0B"), $headers);
        $rows = [];

        while (($data = fgetcsv($handle)) !== false) {
            if (count($data) === 1 && ($data[0] === null || trim($data[0]) === '')) {
                continue;
            }
            $row = [];
            foreach ($headers as $i => $colName) {
                $row[$colName] = isset($data[$i]) ? (string) $data[$i] : '';
            }
            $rows[] = $row;
        }

        fclose($handle);
        return $rows;
    }

    private function toNullableFloat(mixed $value): ?float
    {
        if ($value === null) {
            return null;
        }
        $trimmed = trim((string) $value);
        if ($trimmed === '' || strtolower($trimmed) === 'nan' || strtolower($trimmed) === 'null') {
            return null;
        }
        return (float) $trimmed;
    }

    private function toBool(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        $trimmed = strtolower(trim((string) $value));
        return in_array($trimmed, ['true', '1', 'yes'], true);
    }

    private function normalizeKecamatan(string $raw): string
    {
        $upper = strtoupper(trim($raw));
        if (in_array($upper, ['TELOK SEBONG', 'TELUK SEBONG', 'TELUK SEBUNG'], true)) {
            return 'Teluk Sebong';
        }
        if ($upper === 'BINTANUTARA') {
            return 'Bintan Utara';
        }
        return ucwords(strtolower($upper));
    }

    private function normalizeKategori(string $rawKategori): string
    {
        $lower = strtolower($rawKategori);
        return match (true) {
            str_starts_with($lower, 'normal') => 'Normal',
            str_starts_with($lower, 'sporadis') => 'Sporadis',
            str_starts_with($lower, 'berulang') => 'Berulang',
            str_starts_with($lower, 'konsisten tinggi') => 'Konsisten tinggi',
            str_starts_with($lower, 'data kurang') => 'Data kurang',
            str_starts_with($lower, 'tidak dinilai') => 'Tidak dinilai',
            default => $rawKategori,
        };
    }
}
