<?php

namespace App\Services;

use App\Models\AnalysisRun;
use App\Models\AuditLog;
use App\Models\FlagAturan;
use App\Models\LaporanBulanan;
use App\Models\Pangkalan;
use App\Models\TindakLanjut;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OperasionalService
{
    public const STATUS_TINDAK_LANJUT = [
        'belum_diperiksa' => 'Belum diperiksa',
        'perlu_klarifikasi' => 'Perlu klarifikasi',
        'wajar_dengan_alasan' => 'Wajar dengan alasan',
        'ditindaklanjuti' => 'Ditindaklanjuti',
    ];

    public const HARI_PER_BULAN = [
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
        11 => 30,
        12 => 31,
    ];

    public function __construct(
        private readonly AnalysisService $analysisService,
        private readonly PantauDataService $pantauDataService
    ) {}

    /**
     * Validasi 4 cek pada isi CSV format lebar (seperti kjp_2026_wide.csv):
     * 1. Jumlah harian (d01..d31) = total_normal
     * 2. total_normal + total_fakultatif = grand_total
     * 3. sisa_alokasi = alokasi - grand_total
     * 4. Konsistensi total tingkat agen (PT. Kurnia Jaya Pratama)
     *
     * @return array<string, mixed>
     */
    public function validasiLaporanBulanan(
        string $csvContent,
        ?int $expectedTotalAgen = null,
        bool $isAdmin = false
    ): array {
        $lines = preg_split('/\r\n|\r|\n/', trim($csvContent)) ?: [];
        $lines = array_values(array_filter($lines, fn ($l) => trim($l) !== ''));

        if (count($lines) < 2) {
            throw ValidationException::withMessages([
                'csv' => ['Berkas CSV kosong atau tidak memiliki baris data.'],
            ]);
        }

        $headerLine = $lines[0];
        $delimiter = substr_count($headerLine, ';') > substr_count($headerLine, ',') ? ';' : ',';
        $headers = array_map(
            fn ($h) => strtolower(trim((string) preg_replace('/^\xEF\xBB\xBF/', '', $h))),
            str_getcsv($headerLine, $delimiter)
        );

        $requiredCols = ['bulan', 'id_pangkalan', 'alokasi', 'total_normal', 'total_fakultatif', 'sisa_alokasi', 'grand_total'];
        foreach ($requiredCols as $req) {
            if (!in_array($req, $headers, true)) {
                throw ValidationException::withMessages([
                    'csv' => ["Kolom wajib '{$req}' tidak ditemukan pada header CSV."],
                ]);
            }
        }

        $pangkalanByReg = Pangkalan::all()->keyBy('id_registrasi');
        $pangkalanByKode = Pangkalan::all()->keyBy(fn ($p) => strtoupper($p->kode));

        $parsedRows = [];
        $cek1Failures = [];
        $cek2Failures = [];
        $cek3Failures = [];
        $cek4Errors = [];

        $seenKeys = [];
        $summaryRowFromCsv = null;

        $sumAlokasi = 0;
        $sumNormal = 0;
        $sumFakultatif = 0;
        $sumGrandTotal = 0;
        $sumSisa = 0;
        $detectedBulan = null;

        for ($idx = 1; $idx < count($lines); $idx++) {
            $cols = str_getcsv($lines[$idx], $delimiter);
            if (count($cols) < count($headers)) {
                $cols = array_pad($cols, count($headers), '');
            }
            $assoc = array_combine($headers, array_slice($cols, 0, count($headers)));
            if (!is_array($assoc)) {
                continue;
            }

            $rawId = trim((string) ($assoc['id_pangkalan'] ?? ''));
            $rawNama = trim((string) ($assoc['nama_pangkalan'] ?? ''));

            // Deteksi baris ringkasan TOTAL AGEN bila ada di bagian bawah CSV
            if (
                in_array(strtoupper($rawId), ['TOTAL', 'TOTAL AGEN', 'JUMLAH'], true) ||
                in_array(strtoupper($rawNama), ['TOTAL', 'TOTAL AGEN', 'JUMLAH'], true)
            ) {
                $summaryRowFromCsv = [
                    'alokasi' => (int) round((float) ($assoc['alokasi'] ?? 0)),
                    'total_normal' => (int) round((float) ($assoc['total_normal'] ?? 0)),
                    'total_fakultatif' => (int) round((float) ($assoc['total_fakultatif'] ?? 0)),
                    'sisa_alokasi' => (int) round((float) ($assoc['sisa_alokasi'] ?? 0)),
                    'grand_total' => (int) round((float) ($assoc['grand_total'] ?? 0)),
                ];
                continue;
            }

            $bulan = (int) ($assoc['bulan'] ?? 0);
            if ($bulan < 1 || $bulan > 12) {
                $cek4Errors[] = "Baris ke-{$idx}: nilai bulan '{$bulan}' di luar rentang 1..12.";
                continue;
            }
            if ($detectedBulan === null) {
                $detectedBulan = $bulan;
            }

            $pangkalan = $pangkalanByReg->get($rawId) ?? $pangkalanByKode->get(strtoupper($rawId));
            if (!$pangkalan) {
                $cek4Errors[] = "Baris ke-{$idx}: pangkalan '{$rawId}' tidak terdaftar di master pangkalan.";
                continue;
            }

            $uniqKey = $pangkalan->kode . '#' . $bulan;
            if (isset($seenKeys[$uniqKey])) {
                $cek4Errors[] = "Duplikasi laporan untuk pangkalan {$pangkalan->kode} pada bulan {$bulan}.";
            }
            $seenKeys[$uniqKey] = true;

            $alokasi = (int) round((float) ($assoc['alokasi'] ?? 0));
            $totalNormal = (int) round((float) ($assoc['total_normal'] ?? 0));
            $totalFakultatif = (int) round((float) ($assoc['total_fakultatif'] ?? 0));
            $sisaAlokasi = (int) round((float) ($assoc['sisa_alokasi'] ?? 0));
            $grandTotal = (int) round((float) ($assoc['grand_total'] ?? 0));

            $dailyVolumes = [];
            $sumHarianFloat = 0.0;
            for ($d = 1; $d <= 31; $d++) {
                $colName = sprintf('d%02d', $d);
                $val = isset($assoc[$colName]) && $assoc[$colName] !== '' ? (float) $assoc[$colName] : 0.0;
                $dailyVolumes[$d] = (int) round($val);
                $sumHarianFloat += $val;
            }
            $jumlahHarian = (int) round($sumHarianFloat);

            // Cek 1: jumlah harian == total_normal
            $cek1Ok = ($jumlahHarian === $totalNormal);
            if (!$cek1Ok) {
                $cek1Failures[] = [
                    'kode' => $pangkalan->kode,
                    'bulan' => $bulan,
                    'jumlah_harian' => $jumlahHarian,
                    'total_normal' => $totalNormal,
                    'selisih' => $jumlahHarian - $totalNormal,
                ];
            }

            // Cek 2: total_normal + total_fakultatif == grand_total
            $expectedGrand = $totalNormal + $totalFakultatif;
            $cek2Ok = ($expectedGrand === $grandTotal);
            if (!$cek2Ok) {
                $cek2Failures[] = [
                    'kode' => $pangkalan->kode,
                    'bulan' => $bulan,
                    'normal_plus_fakultatif' => $expectedGrand,
                    'grand_total' => $grandTotal,
                    'selisih' => $expectedGrand - $grandTotal,
                ];
            }

            // Cek 3: sisa_alokasi == alokasi - grand_total
            $expectedSisa = $alokasi - $grandTotal;
            $cek3Ok = ($expectedSisa === $sisaAlokasi);
            if (!$cek3Ok) {
                $cek3Failures[] = [
                    'kode' => $pangkalan->kode,
                    'bulan' => $bulan,
                    'alokasi_minus_grand' => $expectedSisa,
                    'sisa_alokasi' => $sisaAlokasi,
                    'selisih' => $expectedSisa - $sisaAlokasi,
                ];
            }

            $sumAlokasi += $alokasi;
            $sumNormal += $totalNormal;
            $sumFakultatif += $totalFakultatif;
            $sumGrandTotal += $grandTotal;
            $sumSisa += $sisaAlokasi;

            $rowOut = [
                'kode' => $pangkalan->kode,
                'pangkalan_id' => $pangkalan->id,
                'id_registrasi' => $pangkalan->id_registrasi,
                'nama' => $pangkalan->nama,
                'kecamatan' => $pangkalan->kecamatan,
                'bulan' => $bulan,
                'label_bulan' => PantauDataService::NAMA_BULAN[$bulan] ?? (string) $bulan,
                'alokasi' => $alokasi,
                'jumlah_harian' => $jumlahHarian,
                'total_normal' => $totalNormal,
                'total_fakultatif' => $totalFakultatif,
                'grand_total' => $grandTotal,
                'sisa_alokasi' => $sisaAlokasi,
                'harian' => $dailyVolumes,
                'cek_1_harian_vs_normal' => $cek1Ok,
                'cek_2_normal_fakultatif_vs_grand' => $cek2Ok,
                'cek_3_sisa_alokasi' => $cek3Ok,
                'lulus_baris' => $cek1Ok && $cek2Ok && $cek3Ok,
            ];

            if (!$isAdmin) {
                unset($rowOut['nama'], $rowOut['id_registrasi']);
            }

            $parsedRows[] = $rowOut;
        }

        $totalRows = count($parsedRows);
        if ($totalRows === 0) {
            $cek4Errors[] = 'Tidak ada baris pangkalan valid yang dapat diproses.';
        }

        // Cek 4: Konsistensi Total Agen
        $targetGrandTotal = $expectedTotalAgen
            ?? ($summaryRowFromCsv['grand_total'] ?? $sumGrandTotal);

        if ($sumGrandTotal !== $targetGrandTotal) {
            $cek4Errors[] = "Total realisasi agen ({$sumGrandTotal} tabung) tidak cocok dengan target ringkasan agen ({$targetGrandTotal} tabung).";
        }
        if ($summaryRowFromCsv !== null) {
            if ($sumNormal !== $summaryRowFromCsv['total_normal']) {
                $cek4Errors[] = "Total normal agen ({$sumNormal}) tidak cocok dengan baris TOTAL AGEN ({$summaryRowFromCsv['total_normal']}).";
            }
            if ($sumAlokasi !== $summaryRowFromCsv['alokasi']) {
                $cek4Errors[] = "Total alokasi agen ({$sumAlokasi}) tidak cocok dengan baris TOTAL AGEN ({$summaryRowFromCsv['alokasi']}).";
            }
        }
        if (($sumNormal + $sumFakultatif) !== $sumGrandTotal) {
            $cek4Errors[] = 'Akumulasi tingkat agen: total_normal + total_fakultatif != grand_total.';
        }
        if (($sumAlokasi - $sumGrandTotal) !== $sumSisa) {
            $cek4Errors[] = 'Akumulasi tingkat agen: alokasi - grand_total != sisa_alokasi.';
        }

        $cek1Pass = empty($cek1Failures) && $totalRows > 0;
        $cek2Pass = empty($cek2Failures) && $totalRows > 0;
        $cek3Pass = empty($cek3Failures) && $totalRows > 0;
        $cek4Pass = empty($cek4Errors) && $totalRows > 0 && $sumGrandTotal > 0;

        $bulanFinal = $detectedBulan ?? 11;

        return [
            'valid' => $cek1Pass && $cek2Pass && $cek3Pass && $cek4Pass,
            'bulan' => $bulanFinal,
            'label_bulan' => PantauDataService::NAMA_BULAN[$bulanFinal] ?? (string) $bulanFinal,
            'nama_bulan' => PantauDataService::NAMA_BULAN_LENGKAP[$bulanFinal] ?? "Bulan {$bulanFinal}",
            'empat_cek' => [
                'jumlah_harian_vs_normal' => [
                    'nama' => 'Cek 1: Jumlah Harian = Total Normal',
                    'rumus' => 'Σ(d01..d31) = total_normal',
                    'lulus' => $cek1Pass,
                    'jumlah_cocok' => $totalRows - count($cek1Failures),
                    'total_baris' => $totalRows,
                    'selisih_baris' => $cek1Failures,
                ],
                'normal_fakultatif_vs_grand' => [
                    'nama' => 'Cek 2: Normal + Fakultatif = Grand Total',
                    'rumus' => 'total_normal + total_fakultatif = grand_total',
                    'lulus' => $cek2Pass,
                    'jumlah_cocok' => $totalRows - count($cek2Failures),
                    'total_baris' => $totalRows,
                    'selisih_baris' => $cek2Failures,
                ],
                'sisa_alokasi' => [
                    'nama' => 'Cek 3: Sisa = Alokasi − Grand Total',
                    'rumus' => 'sisa_alokasi = alokasi − grand_total',
                    'lulus' => $cek3Pass,
                    'jumlah_cocok' => $totalRows - count($cek3Failures),
                    'total_baris' => $totalRows,
                    'selisih_baris' => $cek3Failures,
                ],
                'total_agen' => [
                    'nama' => 'Cek 4: Konsistensi Total Agen (PT. Kurnia Jaya Pratama)',
                    'rumus' => 'Σ grand_total pangkalan = total penyaluran agen',
                    'lulus' => $cek4Pass,
                    'total_alokasi' => $sumAlokasi,
                    'total_normal' => $sumNormal,
                    'total_fakultatif' => $sumFakultatif,
                    'grand_total' => $sumGrandTotal,
                    'sisa_alokasi' => $sumSisa,
                    'target_grand_total' => $targetGrandTotal,
                    'galat' => $cek4Errors,
                ],
            ],
            'ringkasan' => [
                'bulan' => $bulanFinal,
                'label_bulan' => PantauDataService::NAMA_BULAN[$bulanFinal] ?? (string) $bulanFinal,
                'nama_bulan' => PantauDataService::NAMA_BULAN_LENGKAP[$bulanFinal] ?? "Bulan {$bulanFinal}",
                'jumlah_baris' => $totalRows,
                'total_alokasi' => $sumAlokasi,
                'total_normal' => $sumNormal,
                'total_fakultatif' => $sumFakultatif,
                'grand_total' => $sumGrandTotal,
                'sisa_alokasi' => $sumSisa,
            ],
            'baris' => $parsedRows,
        ];
    }

    /**
     * Konfirmasi hasil validasi unggah laporan bulanan, simpan ke MySQL, jalankan run analisis LOF baru,
     * dan kembalikan perbandingan dengan baseline beserta daftar prioritas terbaru.
     *
     * @return array<string, mixed>
     */
    public function konfirmasiDanSimpanLaporan(
        string $csvContent,
        int $k = 10,
        float $threshold = 1.5,
        ?int $topN = null,
        ?string $namaRun = null,
        ?int $userId = null,
        bool $isAdmin = true,
        string $ip = '127.0.0.1'
    ): array {
        $validasi = $this->validasiLaporanBulanan($csvContent, null, true);

        if (!$validasi['valid']) {
            throw ValidationException::withMessages([
                'csv' => ['Data laporan bulanan belum lulus keempat cek validasi aritmetika dan keutuhan agen.'],
            ]);
        }

        $bulan = (int) $validasi['bulan'];
        $nHariBulan = self::HARI_PER_BULAN[$bulan] ?? 30;
        $now = now();

        DB::transaction(function () use ($validasi, $bulan, $nHariBulan, $userId, $ip, $now) {
            foreach ($validasi['baris'] as $row) {
                $pangkalanId = (int) $row['pangkalan_id'];
                $harian = $row['harian'];

                $hariAktif = 0;
                $nHariKerja = 0;
                $kerjaVals = [];
                $dailyInserts = [];

                for ($d = 1; $d <= $nHariBulan; $d++) {
                    $dateObj = Carbon::createFromDate(2026, $bulan, $d);
                    $isMinggu = $dateObj->isSunday();
                    $vol = (int) ($harian[$d] ?? 0);

                    if (!$isMinggu) {
                        $nHariKerja++;
                        $kerjaVals[] = $vol;
                        if ($vol > 0) {
                            $hariAktif++;
                        }
                    }

                    $dailyInserts[] = [
                        'tanggal' => $dateObj->format('Y-m-d'),
                        'hari' => $d,
                        'is_minggu' => $isMinggu,
                        'volume' => $vol,
                    ];
                }

                $laporan = LaporanBulanan::updateOrCreate(
                    [
                        'pangkalan_id' => $pangkalanId,
                        'bulan' => $bulan,
                    ],
                    [
                        'tahun' => 2026,
                        'alokasi' => (int) $row['alokasi'],
                        'total_normal' => (int) $row['total_normal'],
                        'fakultatif' => (int) $row['total_fakultatif'],
                        'grand_total' => (int) $row['grand_total'],
                        'sisa_alokasi' => (int) $row['sisa_alokasi'],
                        'hari_aktif' => $hariAktif,
                        'n_hari_kerja' => $nHariKerja,
                    ]
                );

                DB::table('penyaluran_harian')->where('laporan_id', $laporan->id)->delete();
                foreach ($dailyInserts as &$di) {
                    $di['laporan_id'] = $laporan->id;
                }
                unset($di);
                DB::table('penyaluran_harian')->insert($dailyInserts);

                // Evaluasi 6 flag aturan untuk laporan ini
                DB::table('flag_aturan')->where('laporan_id', $laporan->id)->delete();
                $flags = [];
                if ($bulan !== 2 && $laporan->grand_total > $laporan->alokasi) {
                    $flags[] = 'melebihi_alokasi';
                }
                if ($bulan !== 2 && $laporan->grand_total > 2 * $laporan->alokasi) {
                    $flags[] = 'gt_2x_alokasi';
                }
                if ($laporan->total_normal === 0) {
                    $flags[] = 'nol';
                }
                if ($laporan->fakultatif > 0) {
                    $flags[] = 'fakultatif';
                }

                $nz = array_values(array_filter($kerjaVals, fn ($v) => $v > 0));
                if (count($nz) > 0 && $laporan->total_normal > 0) {
                    $maxDay = max($kerjaVals);
                    $porsiPuncak = $maxDay / $laporan->total_normal;
                    if ($porsiPuncak > 0.40 && $hariAktif <= 3) {
                        $flags[] = 'lonjakan';
                    }

                    $counts = array_count_values($nz);
                    $porsiDominan = max($counts) / count($nz);
                    if ($porsiDominan >= 0.90 && $hariAktif >= 8) {
                        $flags[] = 'seragam';
                    }
                }

                foreach ($flags as $jenis) {
                    FlagAturan::create([
                        'laporan_id' => $laporan->id,
                        'jenis' => $jenis,
                    ]);
                }
            }

            AuditLog::create([
                'user_id' => $userId,
                'aksi' => 'laporan.unggah',
                'entitas' => 'laporan_bulanan',
                'entitas_id' => $bulan,
                'detail' => [
                    'bulan' => $bulan,
                    'nama_bulan' => $validasi['nama_bulan'],
                    'jumlah_pangkalan' => $validasi['ringkasan']['jumlah_baris'],
                    'grand_total_agen' => $validasi['ringkasan']['grand_total'],
                ],
                'ip_address' => $ip,
            ]);
        });

        $runName = $namaRun ?: sprintf('unggah-bln%02d-k%d-%s', $bulan, $k, $now->format('His'));
        $catatan = sprintf(
            'Analisis otomatis pasca-unggah laporan %s 2026 (%d pangkalan, grand total %d tabung).',
            $validasi['nama_bulan'],
            $validasi['ringkasan']['jumlah_baris'],
            $validasi['ringkasan']['grand_total']
        );

        $hasilRun = $this->analysisService->executeRun(
            k: $k,
            threshold: $threshold,
            nama: $runName,
            catatan: $catatan,
            userId: $userId,
            topN: $topN,
            fallbackLocal: true,
            isAdmin: $isAdmin
        );

        $prioritasTerbaru = $this->pantauDataService->getPrioritas(['sort' => 'bulan_flag_desc'], $isAdmin);

        return [
            'unggah' => $validasi['ringkasan'],
            'empat_cek' => $validasi['empat_cek'],
            'analisis' => $hasilRun,
            'prioritas_terbaru' => $prioritasTerbaru,
        ];
    }

    /**
     * Buat contoh CSV laporan bulanan fiktif (November 2026 / bulan = 11) yang valid pada keempat cek,
     * di mana pangkalan P02 (sebelumnya Normal) mengalami lonjakan ekstrem satu hari sehingga masuk daftar prioritas.
     */
    public function generateContohBulanFiktifCsv(int $bulan = 11): string
    {
        $pangkalanList = Pangkalan::orderBy('kode')->get();
        $headers = ['bulan', 'id_pangkalan', 'nama_pangkalan', 'alokasi'];
        for ($d = 1; $d <= 31; $d++) {
            $headers[] = sprintf('d%02d', $d);
        }
        $headers = array_merge($headers, ['total_normal', 'total_fakultatif', 'sisa_alokasi', 'grand_total']);

        $lines = [implode(',', $headers)];

        foreach ($pangkalanList as $p) {
            $dVals = array_fill(1, 31, 0);

            if ($p->kode === 'P29') {
                // P29 tetap nol sepanjang waktu
                $alokasi = 1200;
                $fakultatif = 0;
            } elseif ($p->kode === 'P11') {
                // P11 (sebelumnya Normal 0 flag) mengalami lonjakan ekstrem pada bulan 11 (2 hari aktif, 1 hari 520 tabung)
                $alokasi = 560;
                $dVals[3] = 520;
                $dVals[18] = 40;
                $fakultatif = 0;
            } elseif ($p->kode === 'P12') {
                // P12 (sebelumnya Normal 0 flag) mengalami pola seragam 24 hari kerja penuh @ 55 tabung
                $alokasi = 700;
                for ($d = 2; $d <= 28; $d++) {
                    $dateObj = Carbon::createFromDate(2026, $bulan, min($d, 30));
                    if (!$dateObj->isSunday()) {
                        $dVals[$d] = 55;
                    }
                }
                $fakultatif = 50;
            } else {
                // Pangkalan lainnya berpola normal reguler (9-11 hari kerja aktif berfluktuasi wajar)
                $alokasi = 800;
                $activeDays = [2, 5, 9, 12, 16, 19, 23, 26, 30];
                $pattern = [65, 80, 70, 90, 60, 85, 75, 95, 70];
                foreach ($activeDays as $i => $dayNum) {
                    $dVals[$dayNum] = $pattern[$i] + (($p->id * 3 + $i * 5) % 25);
                }
                $fakultatif = ($p->id % 3 === 0) ? 40 : 0;
            }

            $totalNormal = array_sum($dVals);
            $grandTotal = $totalNormal + $fakultatif;
            $sisaAlokasi = $alokasi - $grandTotal;

            $rowCols = [
                $bulan,
                $p->id_registrasi,
                '"' . str_replace('"', '""', $p->nama) . '"',
                $alokasi,
            ];
            for ($d = 1; $d <= 31; $d++) {
                $rowCols[] = $dVals[$d];
            }
            $rowCols[] = $totalNormal;
            $rowCols[] = $fakultatif;
            $rowCols[] = $sisaAlokasi;
            $rowCols[] = $grandTotal;

            $lines[] = implode(',', $rowCols);
        }

        return implode("\n", $lines);
    }

    /**
     * Simpan status & catatan tindak lanjut pangkalan beserta riwayat dan audit log.
     *
     * @return array<string, mixed>
     */
    public function simpanTindakLanjut(
        string $kode,
        string $status,
        ?string $catatan,
        ?int $userId,
        string $ip = '127.0.0.1'
    ): array {
        $normalizedKode = strtoupper(trim($kode));
        $pangkalan = Pangkalan::where('kode', $normalizedKode)->first();
        if (!$pangkalan) {
            throw (new ModelNotFoundException())->setModel(Pangkalan::class, [$normalizedKode]);
        }

        $record = DB::transaction(function () use ($pangkalan, $status, $catatan, $userId, $ip) {
            $tl = TindakLanjut::create([
                'pangkalan_id' => $pangkalan->id,
                'status' => $status,
                'catatan' => $catatan,
                'user_id' => $userId,
            ]);

            AuditLog::create([
                'user_id' => $userId,
                'aksi' => 'tindak_lanjut.simpan',
                'entitas' => 'pangkalan',
                'entitas_id' => $pangkalan->id,
                'detail' => [
                    'kode' => $pangkalan->kode,
                    'status' => $status,
                    'label_status' => self::STATUS_TINDAK_LANJUT[$status] ?? $status,
                    'catatan' => $catatan,
                ],
                'ip_address' => $ip,
            ]);

            return $tl->load('user');
        });

        Cache::flush();

        $riwayat = TindakLanjut::with('user')
            ->where('pangkalan_id', $pangkalan->id)
            ->orderByDesc('id')
            ->get()
            ->map(fn ($t) => [
                'id' => $t->id,
                'status' => $t->status,
                'label_status' => self::STATUS_TINDAK_LANJUT[$t->status] ?? $t->status,
                'catatan' => $t->catatan,
                'oleh' => $t->user?->email ?? 'Sistem',
                'role' => $t->user?->role ?? 'petugas',
                'updated_at' => $t->updated_at?->toIso8601String(),
            ])->values()->all();

        return [
            'kode' => $pangkalan->kode,
            'status_terkini' => $record->status,
            'label_status' => self::STATUS_TINDAK_LANJUT[$record->status] ?? $record->status,
            'catatan_terkini' => $record->catatan,
            'oleh' => $record->user?->email ?? 'Sistem',
            'updated_at' => $record->updated_at?->toIso8601String(),
            'riwayat' => $riwayat,
        ];
    }

    /**
     * Daftar ringkasan tindak lanjut seluruh pangkalan beserta riwayatnya.
     *
     * @return array<string, mixed>
     */
    public function getDaftarTindakLanjut(bool $isAdmin = false): array
    {
        $run = $this->pantauDataService->getActiveRun();
        $pangkalanList = Pangkalan::with([
            'klasifikasi' => fn ($q) => $q->where('run_id', $run->id),
            'tindakLanjut' => fn ($q) => $q->with('user')->orderByDesc('id'),
        ])->orderBy('kode')->get();

        $ringkasanStatus = [
            'belum_diperiksa' => 0,
            'perlu_klarifikasi' => 0,
            'wajar_dengan_alasan' => 0,
            'ditindaklanjuti' => 0,
        ];

        $items = [];
        foreach ($pangkalanList as $p) {
            $klas = $p->klasifikasi->first();
            $latest = $p->tindakLanjut->first();
            $status = $latest?->status ?? 'belum_diperiksa';
            if (isset($ringkasanStatus[$status])) {
                $ringkasanStatus[$status]++;
            }

            $riwayat = $p->tindakLanjut->map(fn ($t) => [
                'id' => $t->id,
                'status' => $t->status,
                'label_status' => self::STATUS_TINDAK_LANJUT[$t->status] ?? $t->status,
                'catatan' => $t->catatan,
                'oleh' => $t->user?->email ?? 'Sistem',
                'updated_at' => $t->updated_at?->toIso8601String(),
            ])->values()->all();

            $row = [
                'kode' => $p->kode,
                'kecamatan' => $p->kecamatan,
                'kategori' => $klas?->kategori ?? 'Normal',
                'bulan_flag' => (int) ($klas?->bulan_flag ?? 0),
                'maks_lof' => $klas?->maks_lof !== null ? round((float) $klas->maks_lof, 2) : null,
                'status' => $status,
                'label_status' => self::STATUS_TINDAK_LANJUT[$status] ?? $status,
                'catatan' => $latest?->catatan,
                'oleh' => $latest?->user?->email,
                'updated_at' => $latest?->updated_at?->toIso8601String(),
                'jumlah_riwayat' => count($riwayat),
                'riwayat' => $riwayat,
            ];

            if ($isAdmin) {
                $row['nama'] = $p->nama;
            }

            $items[] = $row;
        }

        return [
            'ringkasan_status' => $ringkasanStatus,
            'items' => $items,
        ];
    }

    /**
     * Daftar analysis_runs beserta perbandingannya terhadap baseline.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getDaftarRuns(bool $isAdmin = false): array
    {
        $runs = AnalysisRun::orderByDesc('id')->limit(15)->get();
        $activeRunId = $this->pantauDataService->getActiveRun()->id;

        return $runs->map(function (AnalysisRun $r) use ($activeRunId, $isAdmin) {
            return [
                'id' => $r->id,
                'nama' => $r->nama,
                'k' => (int) $r->k,
                'threshold' => round((float) $r->threshold, 2),
                'catatan' => $r->catatan,
                'dibuat' => $r->dibuat?->toIso8601String(),
                'aktif' => $r->id === $activeRunId,
                'perbandingan_baseline' => $this->analysisService->computeComparisonAgainstBaseline($r->id, $isAdmin),
            ];
        })->values()->all();
    }

    /**
     * Ambil daftar audit log aksi penting terbaru.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getAuditLogs(int $limit = 40): array
    {
        return AuditLog::with('user')
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn (AuditLog $log) => [
                'id' => $log->id,
                'aksi' => $log->aksi,
                'entitas' => $log->entitas,
                'entitas_id' => $log->entitas_id,
                'detail' => $log->detail,
                'oleh' => $log->user?->email ?? 'Sistem / CLI',
                'role' => $log->user?->role ?? 'system',
                'ip_address' => $log->ip_address,
                'created_at' => $log->created_at?->toIso8601String(),
            ])->values()->all();
    }
}
