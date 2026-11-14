<?php

namespace App\Services;

use App\Exceptions\MlServiceUnavailableException;
use App\Models\AnalysisRun;
use App\Models\AuditLog;
use App\Models\HasilLof;
use App\Models\KlasifikasiPangkalan;
use App\Models\LaporanBulanan;
use App\Models\Pangkalan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class AnalysisService
{
    public const BULAN_LABELS = [
        1 => 'Jan',
        2 => 'Feb',
        3 => 'Mar',
        4 => 'Apr',
        5 => 'Mei',
        6 => 'Jun',
        7 => 'Jul',
        8 => 'Agu',
        9 => 'Sep',
        10 => 'Okt',
        11 => 'Nov',
        12 => 'Des',
    ];

    /**
     * Panggil layanan Python FastAPI (POST /analyze) dengan timeout 30 detik & retry 1x,
     * simpan analysis_run baru di MySQL, dan kembalikan ringkasan serta perbandingan lengkap terhadap baseline.
     * Bila $fallbackLocal = true dan layanan Python tidak aktif, gunakan mesin LOF internal yang identik.
     *
     * @return array<string, mixed>
     */
    public function executeRun(
        int $k = 10,
        float $threshold = 1.5,
        ?string $nama = null,
        ?string $catatan = null,
        ?int $userId = null,
        ?int $topN = null,
        bool $fallbackLocal = false,
        bool $isAdmin = true
    ): array {
        $mlUrl = rtrim((string) config('services.ml.url', 'http://127.0.0.1:8001'), '/');
        $mlKey = (string) config('services.ml.key', '');

        $availableMonths = LaporanBulanan::query()
            ->select('bulan')
            ->distinct()
            ->orderBy('bulan')
            ->pluck('bulan')
            ->map(fn ($b) => (int) $b)
            ->all();

        if (empty($availableMonths)) {
            $availableMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        }

        $hasExtraMonths = count(array_diff($availableMonths, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])) > 0;
        $records = $hasExtraMonths ? $this->buildRecordsFromDatabase() : null;

        $payload = null;

        try {
            $reqBody = [
                'bulan' => $availableMonths,
                'k' => $k,
                'threshold' => $threshold,
            ];
            if ($records !== null) {
                $reqBody['records'] = $records;
            }

            $response = Http::timeout(30)
                ->retry(2, 200, null, false)
                ->acceptJson()
                ->withHeaders([
                    'X-ML-KEY' => $mlKey,
                ])
                ->post("{$mlUrl}/analyze", $reqBody);

            if ($response->successful()) {
                $decoded = $response->json();
                if (is_array($decoded) && !empty($decoded['items']) && !empty($decoded['klasifikasi'])) {
                    $payload = $decoded;
                }
            }

            if ($payload === null && !$fallbackLocal) {
                throw new MlServiceUnavailableException(
                    'Layanan perhitungan LOF mengembalikan galat HTTP ' . $response->status() . '. Data hasil analisis sebelumnya tetap tersedia dan dapat dibaca.',
                    503
                );
            }
        } catch (MlServiceUnavailableException $e) {
            throw $e;
        } catch (\Throwable $e) {
            if (!$fallbackLocal) {
                throw new MlServiceUnavailableException(
                    'Layanan perhitungan LOF (Python) sedang tidak dapat dihubungi pada ' . $mlUrl . '. Data hasil analisis sebelumnya tetap tersedia dan dapat dibaca.',
                    503,
                    $e
                );
            }
        }

        if ($payload === null) {
            $payload = $this->computePayloadLocally($k, $threshold);
        }

        // Jika mode Top-N diaktifkan, sesuaikan penandaan & klasifikasi agar memilih Top-N pangkalan tertinggi
        $effectiveThreshold = $threshold;
        if ($topN !== null && $topN > 0) {
            [$payload, $effectiveThreshold] = $this->applyTopNSelection($payload, $topN, $threshold);
        }

        $runName = ($nama !== null && trim($nama) !== '')
            ? trim($nama)
            : ($topN !== null && $topN > 0
                ? sprintf('run-k%d-top%d-%s', $k, $topN, now()->format('YmdHis'))
                : sprintf('run-k%d-thr%s-%s', $k, str_replace('.', '_', (string) $threshold), now()->format('YmdHis')));

        $now = now();

        $run = DB::transaction(function () use ($payload, $k, $effectiveThreshold, $topN, $runName, $catatan, $userId, $now) {
            $defaultNote = $topN !== null && $topN > 0
                ? "Run analisis LOF mode kapasitas Top-{$topN} pangkalan (k={$k}, batas efektif=" . round($effectiveThreshold, 2) . ")."
                : "Run analisis LOF via ml-service (k={$k}, threshold={$effectiveThreshold}).";

            $run = AnalysisRun::updateOrCreate(
                ['nama' => $runName],
                [
                    'k' => $k,
                    'threshold' => round($effectiveThreshold, 4),
                    'fitur' => $payload['fitur_names'] ?? [
                        'log_total',
                        'cv_harian',
                        'rasio_hari_aktif',
                        'porsi_nilai_dominan',
                    ],
                    'catatan' => $catatan ?? $defaultNote,
                    'dibuat' => $now,
                ]
            );

            $pangkalanByReg = Pangkalan::pluck('id', 'id_registrasi')->all();
            $pangkalanByKode = Pangkalan::pluck('id', 'kode')->all();
            $laporanRows = DB::table('laporan_bulanan')->select('id', 'pangkalan_id', 'bulan')->get();
            $laporanIdByKey = [];
            foreach ($laporanRows as $lap) {
                $laporanIdByKey[$lap->pangkalan_id . '#' . $lap->bulan] = $lap->id;
            }

            DB::table('fitur_bulanan')->where('run_id', $run->id)->delete();
            DB::table('hasil_lof')->where('run_id', $run->id)->delete();
            DB::table('klasifikasi_pangkalan')->where('run_id', $run->id)->delete();

            $fiturBatch = [];
            $lofBatch = [];

            foreach ($payload['items'] as $item) {
                $idReg = trim((string) ($item['id_pangkalan'] ?? ''));
                $bulan = (int) ($item['bulan'] ?? 0);
                $pangkalanId = $pangkalanByReg[$idReg] ?? ($pangkalanByKode[$idReg] ?? null);
                if (!$pangkalanId) {
                    continue;
                }
                $laporanId = $laporanIdByKey[$pangkalanId . '#' . $bulan] ?? null;
                if (!$laporanId) {
                    continue;
                }

                $fitur = $item['fitur'] ?? $item;
                $z = $item['z'] ?? $item;

                $fiturBatch[] = [
                    'run_id' => $run->id,
                    'laporan_id' => $laporanId,
                    'log_total' => $fitur['log_total'] ?? null,
                    'cv_harian' => $fitur['cv_harian'] ?? null,
                    'rasio_hari_aktif' => $fitur['rasio_hari_aktif'] ?? null,
                    'porsi_nilai_dominan' => $fitur['porsi_nilai_dominan'] ?? null,
                    'z_log_total' => $z['z_log_total'] ?? null,
                    'z_cv_harian' => $z['z_cv_harian'] ?? null,
                    'z_rasio_hari_aktif' => $z['z_rasio_hari_aktif'] ?? null,
                    'z_porsi_nilai_dominan' => $z['z_porsi_nilai_dominan'] ?? null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];

                $lofBatch[] = [
                    'run_id' => $run->id,
                    'laporan_id' => $laporanId,
                    'lof' => $item['lof'] ?? null,
                    'flag' => (bool) ($item['flag'] ?? $item['flag_lof'] ?? false),
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            foreach (array_chunk($fiturBatch, 300) as $chunk) {
                DB::table('fitur_bulanan')->insert($chunk);
            }

            foreach (array_chunk($lofBatch, 300) as $chunk) {
                DB::table('hasil_lof')->insert($chunk);
            }

            $klasBatch = [];
            foreach ($payload['klasifikasi'] as $kItem) {
                $idReg = trim((string) ($kItem['id_pangkalan'] ?? ''));
                $pangkalanId = $pangkalanByReg[$idReg] ?? ($pangkalanByKode[$idReg] ?? null);
                if (!$pangkalanId) {
                    continue;
                }

                $klasBatch[] = [
                    'run_id' => $run->id,
                    'pangkalan_id' => $pangkalanId,
                    'kategori' => $kItem['kategori'] ?? 'Normal',
                    'kategori_label' => $kItem['kategori_lof'] ?? ($kItem['kategori'] ?? 'Normal'),
                    'bulan_valid' => (int) ($kItem['bulan_valid'] ?? 0),
                    'bulan_flag' => (int) ($kItem['bulan_flag'] ?? 0),
                    'proporsi_flag' => $kItem['proporsi_flag'] ?? null,
                    'rerata_lof' => $kItem['rerata_lof'] ?? null,
                    'maks_lof' => $kItem['maks_lof'] ?? null,
                    'bulan_maks' => $kItem['bulan_maks'] ?? null,
                    'bulan_yang_ditandai' => $kItem['bulan_yang_ditandai'] ?? null,
                    'run_terpanjang' => (int) ($kItem['run_terpanjang'] ?? 0),
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            if (!empty($klasBatch)) {
                DB::table('klasifikasi_pangkalan')->insert($klasBatch);
            }

            AuditLog::create([
                'user_id' => $userId,
                'aksi' => 'analysis.run',
                'entitas' => 'analysis_runs',
                'entitas_id' => $run->id,
                'detail' => [
                    'nama' => $run->nama,
                    'k' => $k,
                    'threshold' => round($effectiveThreshold, 4),
                    'top_n' => $topN,
                    'ditandai' => $payload['ringkasan']['ditandai'] ?? count(array_filter($lofBatch, fn ($r) => $r['flag'])),
                ],
                'ip_address' => '127.0.0.1',
            ]);

            return $run;
        });

        Cache::flush();

        $jaccard = $this->computeJaccardAgainstBaseline($run->id);
        $perbandingan = $this->computeComparisonAgainstBaseline($run->id, $isAdmin);

        return [
            'run' => [
                'id' => $run->id,
                'nama' => $run->nama,
                'k' => $run->k,
                'threshold' => $run->threshold,
                'top_n' => $topN,
                'fitur' => $run->fitur,
                'catatan' => $run->catatan,
                'dibuat' => $run->dibuat?->toIso8601String(),
            ],
            'ringkasan' => $payload['ringkasan'] ?? [],
            'jaccard_vs_baseline' => $jaccard,
            'perbandingan_baseline' => $perbandingan,
        ];
    }

    public function computeJaccardAgainstBaseline(int $newRunId): ?float
    {
        $baseline = AnalysisRun::where('nama', 'baseline-k10')->first();
        if (!$baseline) {
            return null;
        }

        $baseFlags = HasilLof::where('run_id', $baseline->id)
            ->where('flag', true)
            ->pluck('laporan_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $newFlags = HasilLof::where('run_id', $newRunId)
            ->where('flag', true)
            ->pluck('laporan_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $intersection = count(array_intersect($baseFlags, $newFlags));
        $union = count(array_unique(array_merge($baseFlags, $newFlags)));

        if ($union === 0) {
            return 1.0;
        }

        return round($intersection / $union, 4);
    }

    /**
     * Hitung perbandingan rinci run baru terhadap baseline-k10:
     * Jaccard observasi, Jaccard pangkalan prioritas, daftar pangkalan yang MASUK dan KELUAR daftar prioritas.
     *
     * @return array<string, mixed>
     */
    public function computeComparisonAgainstBaseline(int $newRunId, bool $isAdmin = false): array
    {
        $baseline = AnalysisRun::where('nama', 'baseline-k10')->first();
        if (!$baseline) {
            return [
                'baseline_nama' => 'baseline-k10',
                'jaccard_observasi' => 1.0,
                'jaccard_pangkalan' => 1.0,
                'pangkalan_masuk' => [],
                'pangkalan_keluar' => [],
                'pangkalan_tetap' => [],
            ];
        }

        $jaccardObs = $this->computeJaccardAgainstBaseline($newRunId) ?? 1.0;

        $pangkalanMap = Pangkalan::all()->keyBy('id');
        $baseKlas = KlasifikasiPangkalan::where('run_id', $baseline->id)->get()->keyBy('pangkalan_id');
        $newKlas = KlasifikasiPangkalan::where('run_id', $newRunId)->get()->keyBy('pangkalan_id');

        $masuk = [];
        $keluar = [];
        $tetap = [];

        $baseFlaggedIds = [];
        $newFlaggedIds = [];

        foreach ($pangkalanMap as $pId => $p) {
            $b = $baseKlas->get($pId);
            $n = $newKlas->get($pId);

            $wasPrioritas = $b && ((int) $b->bulan_flag > 0);
            $isPrioritas = $n && ((int) $n->bulan_flag > 0);

            if ($wasPrioritas) {
                $baseFlaggedIds[] = $pId;
            }
            if ($isPrioritas) {
                $newFlaggedIds[] = $pId;
            }

            $info = [
                'kode' => $p->kode,
                'kecamatan' => $p->kecamatan,
                'kategori_baseline' => $b?->kategori ?? 'Normal',
                'kategori_baru' => $n?->kategori ?? 'Normal',
                'bulan_flag_baseline' => (int) ($b?->bulan_flag ?? 0),
                'bulan_flag_baru' => (int) ($n?->bulan_flag ?? 0),
                'maks_lof_baseline' => $b?->maks_lof !== null ? round((float) $b->maks_lof, 2) : null,
                'maks_lof_baru' => $n?->maks_lof !== null ? round((float) $n->maks_lof, 2) : null,
            ];
            if ($isAdmin) {
                $info['nama'] = $p->nama;
            }

            if (!$wasPrioritas && $isPrioritas) {
                $masuk[] = $info;
            } elseif ($wasPrioritas && !$isPrioritas) {
                $keluar[] = $info;
            } elseif ($wasPrioritas && $isPrioritas) {
                $tetap[] = $info;
            }
        }

        $interP = count(array_intersect($baseFlaggedIds, $newFlaggedIds));
        $unionP = count(array_unique(array_merge($baseFlaggedIds, $newFlaggedIds)));
        $jaccardPangkalan = $unionP > 0 ? round($interP / $unionP, 4) : 1.0;

        return [
            'baseline_nama' => 'baseline-k10',
            'jaccard_observasi' => $jaccardObs,
            'jaccard_pangkalan' => $jaccardPangkalan,
            'jumlah_prioritas_baseline' => count($baseFlaggedIds),
            'jumlah_prioritas_baru' => count($newFlaggedIds),
            'pangkalan_masuk' => array_values($masuk),
            'pangkalan_keluar' => array_values($keluar),
            'pangkalan_tetap' => array_values($tetap),
        ];
    }

    /**
     * Bangun daftar rekaman laporan bulanan beserta volume harian dari MySQL untuk dikirim ke ml-service.
     *
     * @return array<int, array<string, mixed>>
     */
    public function buildRecordsFromDatabase(): array
    {
        $laporans = LaporanBulanan::with(['pangkalan', 'penyaluranHarian' => fn ($q) => $q->orderBy('hari')])
            ->orderBy('bulan')
            ->orderBy('pangkalan_id')
            ->get();

        $records = [];
        foreach ($laporans as $lap) {
            if (!$lap->pangkalan) {
                continue;
            }

            $row = [
                'bulan' => (int) $lap->bulan,
                'id_pangkalan' => $lap->pangkalan->id_registrasi,
                'nama_pangkalan' => $lap->pangkalan->nama,
                'alokasi' => (int) $lap->alokasi,
                'total_normal' => (int) $lap->total_normal,
                'total_fakultatif' => (int) $lap->fakultatif,
                'sisa_alokasi' => (int) $lap->sisa_alokasi,
                'grand_total' => (int) $lap->grand_total,
            ];

            for ($d = 1; $d <= 31; $d++) {
                $row[sprintf('d%02d', $d)] = 0.0;
            }

            foreach ($lap->penyaluranHarian as $ph) {
                $d = (int) $ph->hari;
                if ($d >= 1 && $d <= 31) {
                    $row[sprintf('d%02d', $d)] = (float) $ph->volume;
                }
            }

            $records[] = $row;
        }

        return $records;
    }

    /**
     * Terapkan mode pemilihan Top-N pangkalan sesuai kapasitas pemeriksa lapangan.
     *
     * @param array<string, mixed> $payload
     * @return array{0: array<string, mixed>, 1: float}
     */
    private function applyTopNSelection(array $payload, int $topN, float $baseThreshold): array
    {
        // Hitung maks_lof per pangkalan
        $maxLofByPangkalan = [];
        foreach ($payload['items'] as $item) {
            $id = (string) ($item['id_pangkalan'] ?? '');
            $lof = $item['lof'] ?? null;
            if ($lof !== null) {
                $val = (float) $lof;
                if (!isset($maxLofByPangkalan[$id]) || $val > $maxLofByPangkalan[$id]) {
                    $maxLofByPangkalan[$id] = $val;
                }
            }
        }

        arsort($maxLofByPangkalan);
        $sortedPangkalanIds = array_keys($maxLofByPangkalan);
        $selectedPangkalanIds = array_slice($sortedPangkalanIds, 0, max(1, min($topN, count($sortedPangkalanIds))));
        $selectedSet = array_flip($selectedPangkalanIds);

        $lastSelectedId = end($selectedPangkalanIds);
        $effectiveThreshold = $lastSelectedId !== false && isset($maxLofByPangkalan[$lastSelectedId])
            ? (float) $maxLofByPangkalan[$lastSelectedId]
            : $baseThreshold;

        // Tandai observasi milik pangkalan Top-N yang memiliki LOF >= max(effectiveThreshold, min(baseThreshold, maks_lof_pangkalan))
        $ditandaiCount = 0;
        foreach ($payload['items'] as &$item) {
            $id = (string) ($item['id_pangkalan'] ?? '');
            $lof = $item['lof'] ?? null;
            if ($lof !== null && isset($selectedSet[$id])) {
                $pMax = $maxLofByPangkalan[$id];
                $cutoff = min($baseThreshold, $pMax);
                $isFlag = ((float) $lof) >= max($effectiveThreshold, $cutoff) || abs((float) $lof - $pMax) < 1e-9;
            } else {
                $isFlag = false;
            }
            $item['flag'] = $isFlag;
            $item['flag_lof'] = $isFlag;
            if ($isFlag) {
                $ditandaiCount++;
            }
        }
        unset($item);

        // Re-klasifikasi konsistensi berdasarkan flag yang telah disesuaikan Top-N
        $payload['klasifikasi'] = $this->reclassifyFromItems($payload['items']);
        $perKategori = [];
        foreach ($payload['klasifikasi'] as $kRow) {
            $kat = $kRow['kategori'];
            $perKategori[$kat] = ($perKategori[$kat] ?? 0) + 1;
        }

        $payload['ringkasan']['ditandai'] = $ditandaiCount;
        $payload['ringkasan']['per_kategori'] = $perKategori;

        return [$payload, $effectiveThreshold];
    }

    /**
     * Hitung fitur, robust z-score, LOF, dan klasifikasi secara lokal di PHP dari tabel MySQL
     * (digunakan sebagai fallback bila layanan Python sedang tidak berjalan saat konfirmasi unggah).
     *
     * @return array<string, mixed>
     */
    public function computePayloadLocally(int $k = 10, float $threshold = 1.5): array
    {
        $laporans = LaporanBulanan::with(['pangkalan', 'penyaluranHarian' => fn ($q) => $q->orderBy('hari')])
            ->orderBy('bulan')
            ->orderBy('pangkalan_id')
            ->get();

        $items = [];
        foreach ($laporans as $lap) {
            if (!$lap->pangkalan) {
                continue;
            }

            $kerjaVals = [];
            foreach ($lap->penyaluranHarian as $ph) {
                if (!$ph->is_minggu) {
                    $kerjaVals[] = (float) $ph->volume;
                }
            }

            $total = array_sum($kerjaVals);
            $nz = array_values(array_filter($kerjaVals, fn ($v) => $v > 0));
            $hariAktif = count($nz);
            $nKerja = count($kerjaVals) > 0 ? count($kerjaVals) : (int) $lap->n_hari_kerja;
            $rasioAktif = $nKerja > 0 ? $hariAktif / $nKerja : 0.0;

            if ($hariAktif > 0) {
                $meanNz = array_sum($nz) / $hariAktif;
                $varSum = 0.0;
                foreach ($nz as $val) {
                    $varSum += ($val - $meanNz) ** 2;
                }
                $stdNz = sqrt($varSum / $hariAktif);
                $cvHarian = ($hariAktif > 1 && $meanNz > 0) ? ($stdNz / $meanNz) : 0.0;

                $counts = [];
                foreach ($nz as $val) {
                    $key = (string) round($val, 4);
                    $counts[$key] = ($counts[$key] ?? 0) + 1;
                }
                $porsiDominan = max($counts) / $hariAktif;
                $porsiPuncak = $total > 0 ? (max($kerjaVals) / $total) : 0.0;
            } else {
                $cvHarian = null;
                $porsiDominan = null;
                $porsiPuncak = null;
            }

            $logTotal = log(1.0 + $total);

            $items[] = [
                'id_pangkalan' => $lap->pangkalan->id_registrasi,
                'nama_pangkalan' => $lap->pangkalan->nama,
                'bulan' => (int) $lap->bulan,
                'alokasi' => (int) $lap->alokasi,
                'total' => $total,
                'total_fakultatif' => (int) $lap->fakultatif,
                'grand_total' => (int) $lap->grand_total,
                'sisa_alokasi' => (int) $lap->sisa_alokasi,
                'hari_aktif' => $hariAktif,
                'n_hari_kerja' => $nKerja,
                'porsi_hari_puncak' => $porsiPuncak,
                'fitur' => [
                    'log_total' => $logTotal,
                    'cv_harian' => $cvHarian,
                    'rasio_hari_aktif' => $rasioAktif,
                    'porsi_nilai_dominan' => $porsiDominan,
                ],
                'z' => [
                    'z_log_total' => null,
                    'z_cv_harian' => null,
                    'z_rasio_hari_aktif' => null,
                    'z_porsi_nilai_dominan' => null,
                ],
                'lof' => null,
                'flag' => false,
                'flag_lof' => false,
            ];
        }

        // Kelompokkan indeks item aktif (total > 0) per bulan
        $activeByMonth = [];
        foreach ($items as $idx => $it) {
            if ($it['total'] > 0 && $it['fitur']['cv_harian'] !== null) {
                $activeByMonth[$it['bulan']][] = $idx;
            }
        }

        $featureKeys = ['log_total', 'cv_harian', 'rasio_hari_aktif', 'porsi_nilai_dominan'];

        foreach ($activeByMonth as $bulan => $indices) {
            $mCount = count($indices);
            if ($mCount === 0) {
                continue;
            }

            // 1. Hitung robust z-score per fitur pada bulan ini
            foreach ($featureKeys as $fKey) {
                $vals = array_map(fn ($i) => (float) $items[$i]['fitur'][$fKey], $indices);
                $zVals = $this->computeRobustZArray($vals);
                foreach ($indices as $pos => $itemIdx) {
                    $items[$itemIdx]['z']['z_' . $fKey] = $zVals[$pos];
                }
            }

            // 2. Hitung LOF Euclidean pada vektor 4 z-score
            $points = [];
            foreach ($indices as $itemIdx) {
                $points[] = [
                    (float) $items[$itemIdx]['z']['z_log_total'],
                    (float) $items[$itemIdx]['z']['z_cv_harian'],
                    (float) $items[$itemIdx]['z']['z_rasio_hari_aktif'],
                    (float) $items[$itemIdx]['z']['z_porsi_nilai_dominan'],
                ];
            }

            $lofScores = $this->computeLofRawPhp($points, min($k, max(1, $mCount - 1)));
            foreach ($indices as $pos => $itemIdx) {
                $score = $lofScores[$pos];
                $items[$itemIdx]['lof'] = $score;
                $isFlag = $score >= $threshold;
                $items[$itemIdx]['flag'] = $isFlag;
                $items[$itemIdx]['flag_lof'] = $isFlag;
            }
        }

        $klasifikasi = $this->reclassifyFromItems($items);
        $perKategori = [];
        foreach ($klasifikasi as $kRow) {
            $kat = $kRow['kategori'];
            $perKategori[$kat] = ($perKategori[$kat] ?? 0) + 1;
        }

        $masukModel = count(array_filter($items, fn ($it) => $it['lof'] !== null));
        $ditandai = count(array_filter($items, fn ($it) => $it['flag']));

        return [
            'k' => $k,
            'threshold' => $threshold,
            'fitur_names' => $featureKeys,
            'items' => $items,
            'klasifikasi' => $klasifikasi,
            'ringkasan' => [
                'total_observasi' => count($items),
                'masuk_model' => $masukModel,
                'ditandai' => $ditandai,
                'per_kategori' => $perKategori,
            ],
        ];
    }

    /**
     * @param array<int, float> $values
     * @return array<int, float>
     */
    private function computeRobustZArray(array $values): array
    {
        $n = count($values);
        if ($n === 0) {
            return [];
        }
        $med = $this->median($values);
        $absDevs = array_map(fn ($v) => abs($v - $med), $values);
        $mad = $this->median($absDevs) * 1.4826;
        if ($mad == 0.0) {
            $mean = array_sum($values) / $n;
            $var = 0.0;
            foreach ($values as $v) {
                $var += ($v - $mean) ** 2;
            }
            $mad = sqrt($var / $n);
        }
        if ($mad == 0.0) {
            return array_fill(0, $n, 0.0);
        }
        return array_map(fn ($v) => ($v - $med) / $mad, $values);
    }

    /**
     * @param array<int, float> $arr
     */
    private function median(array $arr): float
    {
        sort($arr);
        $n = count($arr);
        $mid = intdiv($n, 2);
        if ($n % 2 === 1) {
            return (float) $arr[$mid];
        }
        return ((float) $arr[$mid - 1] + (float) $arr[$mid]) / 2.0;
    }

    /**
     * @param array<int, array<int, float>> $points
     * @return array<int, float>
     */
    private function computeLofRawPhp(array $points, int $k): array
    {
        $n = count($points);
        if ($n < 2) {
            return array_fill(0, $n, 1.0);
        }
        $kk = max(1, min($k, $n - 1));
        $dist = array_fill(0, $n, array_fill(0, $n, 0.0));

        for ($i = 0; $i < $n; $i++) {
            for ($j = $i + 1; $j < $n; $j++) {
                $sumSq = 0.0;
                foreach ($points[$i] as $dim => $v) {
                    $diff = $v - $points[$j][$dim];
                    $sumSq += $diff * $diff;
                }
                $d = sqrt($sumSq);
                $dist[$i][$j] = $d;
                $dist[$j][$i] = $d;
            }
        }

        $kDist = array_fill(0, $n, 0.0);
        $neighbors = array_fill(0, $n, []);

        for ($i = 0; $i < $n; $i++) {
            $others = [];
            for ($j = 0; $j < $n; $j++) {
                if ($i !== $j) {
                    $others[] = ['idx' => $j, 'd' => $dist[$i][$j]];
                }
            }
            usort($others, fn ($a, $b) => ($a['d'] <=> $b['d']) ?: ($a['idx'] <=> $b['idx']));
            $kd = $others[$kk - 1]['d'];
            $kDist[$i] = $kd;

            foreach ($others as $o) {
                if ($o['d'] <= $kd + 1e-12) {
                    $neighbors[$i][] = $o['idx'];
                } else {
                    break;
                }
            }
        }

        $lrd = array_fill(0, $n, 1.0);
        for ($i = 0; $i < $n; $i++) {
            $nk = $neighbors[$i];
            $sumReach = 0.0;
            foreach ($nk as $oIdx) {
                $sumReach += max($kDist[$oIdx], $dist[$i][$oIdx]);
            }
            $meanReach = count($nk) > 0 ? ($sumReach / count($nk)) : 0.0;
            $lrd[$i] = 1.0 / ($meanReach + 1e-10);
        }

        $lof = array_fill(0, $n, 1.0);
        for ($i = 0; $i < $n; $i++) {
            $nk = $neighbors[$i];
            $sumLrd = 0.0;
            foreach ($nk as $oIdx) {
                $sumLrd += $lrd[$oIdx];
            }
            $meanLrd = count($nk) > 0 ? ($sumLrd / count($nk)) : $lrd[$i];
            $lof[$i] = $meanLrd / $lrd[$i];
        }

        return $lof;
    }

    /**
     * @param array<int, array<string, mixed>> $items
     * @return array<int, array<string, mixed>>
     */
    private function reclassifyFromItems(array $items): array
    {
        $byPangkalan = [];
        $maxBulanGlobal = 10;
        foreach ($items as $it) {
            $id = (string) $it['id_pangkalan'];
            $byPangkalan[$id][] = $it;
            if ((int) $it['bulan'] > $maxBulanGlobal) {
                $maxBulanGlobal = (int) $it['bulan'];
            }
        }

        $klas = [];
        foreach ($byPangkalan as $id => $rows) {
            usort($rows, fn ($a, $b) => $a['bulan'] <=> $b['bulan']);
            $nama = $rows[0]['nama_pangkalan'] ?? '';

            $validRows = array_values(array_filter($rows, fn ($r) => $r['lof'] !== null));
            $nValid = count($validRows);
            $flaggedRows = array_values(array_filter($rows, fn ($r) => (bool) ($r['flag'] ?? false)));
            $nFlag = count($flaggedRows);
            $proporsi = $nValid > 0 ? round($nFlag / $nValid, 2) : null;

            $flagByMonth = [];
            foreach ($rows as $r) {
                $flagByMonth[(int) $r['bulan']] = (bool) ($r['flag'] ?? false);
            }

            $run = 0;
            $mxRun = 0;
            for ($m = 1; $m <= $maxBulanGlobal; $m++) {
                if (!empty($flagByMonth[$m])) {
                    $run++;
                    if ($run > $mxRun) {
                        $mxRun = $run;
                    }
                } else {
                    $run = 0;
                }
            }

            if ($nValid === 0) {
                $label = 'Tidak dinilai (nol sepanjang waktu)';
                $short = 'Tidak dinilai';
            } elseif ($nValid < 4) {
                $label = 'Data kurang (<4 bulan valid)';
                $short = 'Data kurang';
            } elseif ($nFlag === 0) {
                $label = 'Normal';
                $short = 'Normal';
            } elseif (($nFlag / $nValid) <= 0.30) {
                $label = 'Sporadis (anomali)';
                $short = 'Sporadis';
            } elseif (($nFlag / $nValid) < 0.70) {
                $label = 'Berulang (sedang)';
                $short = 'Berulang';
            } else {
                $label = 'Konsisten tinggi (profil khusus)';
                $short = 'Konsisten tinggi';
            }

            $rerataLof = null;
            $maksLof = null;
            $bulanMaks = null;

            if ($nValid > 0) {
                $lofs = array_map(fn ($r) => (float) $r['lof'], $validRows);
                $rerataLof = round(array_sum($lofs) / $nValid, 2);
                $maxVal = -1.0;
                $maxM = 1;
                foreach ($validRows as $vr) {
                    if ((float) $vr['lof'] > $maxVal) {
                        $maxVal = (float) $vr['lof'];
                        $maxM = (int) $vr['bulan'];
                    }
                }
                $maksLof = round($maxVal, 2);
                $bulanMaks = self::BULAN_LABELS[$maxM] ?? (string) $maxM;
            }

            $flaggedMonthsLabels = array_map(
                fn ($r) => self::BULAN_LABELS[(int) $r['bulan']] ?? (string) $r['bulan'],
                $flaggedRows
            );

            $klas[] = [
                'id_pangkalan' => $id,
                'nama_pangkalan' => $nama,
                'kategori' => $short,
                'kategori_lof' => $label,
                'bulan_valid' => $nValid,
                'bulan_flag' => $nFlag,
                'proporsi_flag' => $proporsi,
                'rerata_lof' => $rerataLof,
                'maks_lof' => $maksLof,
                'bulan_maks' => $bulanMaks,
                'bulan_yang_ditandai' => implode(', ', $flaggedMonthsLabels),
                'run_terpanjang' => $mxRun,
            ];
        }

        return $klas;
    }
}
