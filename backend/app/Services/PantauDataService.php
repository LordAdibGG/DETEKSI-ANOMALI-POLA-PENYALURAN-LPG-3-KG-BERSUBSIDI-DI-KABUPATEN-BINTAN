<?php

namespace App\Services;

use App\Models\AnalysisRun;
use App\Models\FiturBulanan;
use App\Models\FlagAturan;
use App\Models\HasilLof;
use App\Models\KlasifikasiPangkalan;
use App\Models\LaporanBulanan;
use App\Models\Pangkalan;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class PantauDataService
{
    public const CACHE_TTL_SECONDS = 300; // 5 menit

    public const NAMA_BULAN = [
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

    public const NAMA_BULAN_LENGKAP = [
        1 => 'Januari',
        2 => 'Februari',
        3 => 'Maret',
        4 => 'April',
        5 => 'Mei',
        6 => 'Juni',
        7 => 'Juli',
        8 => 'Agustus',
        9 => 'September',
        10 => 'Oktober',
        11 => 'November',
        12 => 'Desember',
    ];

    public const LABEL_FLAG_ATURAN = [
        'melebihi_alokasi' => 'Realisasi melebihi alokasi (tanpa Februari)',
        'gt_2x_alokasi' => 'Realisasi lebih dari 2x alokasi (tanpa Februari)',
        'nol' => 'Tidak ada penyaluran sepanjang bulan (nol)',
        'lonjakan' => 'Lonjakan satu hari (>40% volume pada <=3 hari aktif)',
        'seragam' => 'Pola angka harian seragam (>=90% nilai sama pada >=8 hari aktif)',
        'fakultatif' => 'Terdapat penyaluran fakultatif',
    ];

    public function __construct(
        private readonly AlasanPenandaanService $alasanService
    ) {}

    public function getActiveRun(?int $runId = null): AnalysisRun
    {
        if ($runId !== null) {
            return AnalysisRun::findOrFail($runId);
        }

        return AnalysisRun::orderByDesc('id')->first()
            ?? AnalysisRun::where('nama', 'baseline-k10')->firstOrFail();
    }

    /**
     * Data untuk GET /api/ringkasan?bulan= (di-cache 5 menit).
     *
     * @return array<string, mixed>
     */
    public function getRingkasan(?int $bulan = null): array
    {
        $run = $this->getActiveRun();
        $cacheKey = "pantau:ringkasan:run:{$run->id}:bulan:" . ($bulan ?? 'all');

        return Cache::remember($cacheKey, self::CACHE_TTL_SECONDS, function () use ($run, $bulan) {
            $lofQuery = DB::table('hasil_lof')
                ->join('laporan_bulanan', 'laporan_bulanan.id', '=', 'hasil_lof.laporan_id')
                ->join('pangkalan', 'pangkalan.id', '=', 'laporan_bulanan.pangkalan_id')
                ->where('hasil_lof.run_id', $run->id);

            if ($bulan !== null) {
                $lofQuery->where('laporan_bulanan.bulan', $bulan);
            }

            $rows = $lofQuery->select([
                'pangkalan.kode',
                'laporan_bulanan.bulan',
                'hasil_lof.lof',
                'hasil_lof.flag',
            ])->orderBy('laporan_bulanan.bulan')->orderBy('pangkalan.kode')->get();

            $jumlahObservasi = $rows->count();
            $validRows = $rows->filter(fn ($r) => $r->lof !== null)->values();
            $jumlahDinilai = $validRows->count();
            $jumlahTidakDinilai = $jumlahObservasi - $jumlahDinilai;
            $jumlahDitandai = $rows->filter(fn ($r) => (bool) $r->flag)->count();

            $scores = $validRows->pluck('lof')->map(fn ($v) => (float) $v)->sort()->values()->all();
            $sebaranLof = [
                'min' => !empty($scores) ? round($scores[0], 2) : null,
                'q1' => !empty($scores) ? round($this->quantile($scores, 0.25), 2) : null,
                'median' => !empty($scores) ? round($this->quantile($scores, 0.50), 2) : null,
                'q3' => !empty($scores) ? round($this->quantile($scores, 0.75), 2) : null,
                'maks' => !empty($scores) ? round($scores[count($scores) - 1], 2) : null,
                'max' => !empty($scores) ? round($scores[count($scores) - 1], 2) : null,
                'rerata' => !empty($scores) ? round(array_sum($scores) / count($scores), 2) : null,
                'threshold' => (float) $run->threshold,
                'titik' => $validRows->map(fn ($r) => [
                    'kode' => $r->kode,
                    'bulan' => (int) $r->bulan,
                    'label_bulan' => self::NAMA_BULAN[(int) $r->bulan] ?? (string) $r->bulan,
                    'lof' => round((float) $r->lof, 2),
                    'flag' => (bool) $r->flag,
                ])->all(),
            ];

            // Jumlah per kategori pangkalan (selalu 30 pangkalan pada run aktif)
            $kategoriRaw = KlasifikasiPangkalan::where('run_id', $run->id)
                ->selectRaw('kategori, COUNT(*) as total')
                ->groupBy('kategori')
                ->pluck('total', 'kategori')
                ->map(fn ($v) => (int) $v)
                ->all();

            $perKategori = [
                'Normal' => $kategoriRaw['Normal'] ?? 0,
                'Sporadis' => $kategoriRaw['Sporadis'] ?? 0,
                'Berulang' => $kategoriRaw['Berulang'] ?? 0,
                'Konsisten tinggi' => $kategoriRaw['Konsisten tinggi'] ?? 0,
                'Data kurang' => $kategoriRaw['Data kurang'] ?? 0,
                'Tidak dinilai' => $kategoriRaw['Tidak dinilai'] ?? 0,
            ];

            // Ringkasan ditandai per bulan Jan-Okt (1..10)
            $bulananAgg = DB::table('laporan_bulanan')
                ->join('hasil_lof', function ($join) use ($run) {
                    $join->on('hasil_lof.laporan_id', '=', 'laporan_bulanan.id')
                        ->where('hasil_lof.run_id', '=', $run->id);
                })
                ->groupBy('laporan_bulanan.bulan')
                ->orderBy('laporan_bulanan.bulan')
                ->selectRaw('
                    laporan_bulanan.bulan,
                    COUNT(*) as observasi,
                    SUM(CASE WHEN hasil_lof.lof IS NOT NULL THEN 1 ELSE 0 END) as dinilai,
                    SUM(CASE WHEN hasil_lof.lof IS NULL THEN 1 ELSE 0 END) as nol,
                    SUM(CASE WHEN hasil_lof.flag = 1 THEN 1 ELSE 0 END) as ditandai,
                    SUM(laporan_bulanan.total_normal) as total_normal,
                    SUM(laporan_bulanan.fakultatif) as fakultatif,
                    SUM(laporan_bulanan.grand_total) as grand_total,
                    SUM(laporan_bulanan.alokasi) as alokasi
                ')
                ->get();

            $ditandaiPerBulan = $bulananAgg->map(fn ($b) => [
                'bulan' => (int) $b->bulan,
                'label_bulan' => self::NAMA_BULAN[(int) $b->bulan] ?? (string) $b->bulan,
                'observasi' => (int) $b->observasi,
                'dinilai' => (int) $b->dinilai,
                'nol' => (int) $b->nol,
                'ditandai' => (int) $b->ditandai,
                'total_normal' => (int) $b->total_normal,
                'fakultatif' => (int) $b->fakultatif,
                'grand_total' => (int) $b->grand_total,
                'alokasi' => (int) $b->alokasi,
            ])->values()->all();

            // Flag aturan (filter per bulan bila parameter bulan diisi)
            $flagQuery = DB::table('flag_aturan')
                ->join('laporan_bulanan', 'laporan_bulanan.id', '=', 'flag_aturan.laporan_id');
            if ($bulan !== null) {
                $flagQuery->where('laporan_bulanan.bulan', $bulan);
            }
            $flagCounts = $flagQuery
                ->selectRaw('flag_aturan.jenis, COUNT(*) as total')
                ->groupBy('flag_aturan.jenis')
                ->pluck('total', 'flag_aturan.jenis')
                ->map(fn ($v) => (int) $v)
                ->all();

            $flagAturan = [
                'melebihi_alokasi' => $flagCounts['melebihi_alokasi'] ?? 0,
                'gt_2x_alokasi' => $flagCounts['gt_2x_alokasi'] ?? 0,
                'nol' => $flagCounts['nol'] ?? 0,
                'lonjakan' => $flagCounts['lonjakan'] ?? 0,
                'seragam' => $flagCounts['seragam'] ?? 0,
                'fakultatif' => $flagCounts['fakultatif'] ?? 0,
            ];

            return [
                'bulan' => $bulan,
                'label_bulan' => $bulan ? (self::NAMA_BULAN_LENGKAP[$bulan] ?? (string) $bulan) : 'Januari–Oktober 2026',
                'jumlah_pangkalan' => Pangkalan::count(),
                'jumlah_observasi' => $jumlahObservasi,
                'jumlah_dinilai' => $jumlahDinilai,
                'jumlah_tidak_dinilai' => $jumlahTidakDinilai,
                'jumlah_ditandai' => $jumlahDitandai,
                'per_kategori' => $perKategori,
                'sebaran_lof' => $sebaranLof,
                'ditandai_per_bulan' => $ditandaiPerBulan,
                'flag_aturan' => $flagAturan,
            ];
        });
    }

    /**
     * Data dasar 30 pangkalan (di-cache 5 menit) lalu difilter dan diurutkan untuk /api/prioritas & /api/export/prioritas.csv.
     *
     * @param array<string, mixed> $filters
     * @return array<int, array<string, mixed>>
     */
    public function getPrioritas(array $filters, bool $isAdmin): array
    {
        $run = $this->getActiveRun();
        $bulanFilter = isset($filters['bulan']) && $filters['bulan'] !== '' ? (int) $filters['bulan'] : null;
        $kategoriFilter = isset($filters['kategori']) && $filters['kategori'] !== '' ? trim((string) $filters['kategori']) : null;
        $qFilter = isset($filters['q']) && $filters['q'] !== '' ? mb_strtolower(trim((string) $filters['q'])) : null;
        $sortFilter = isset($filters['sort']) && $filters['sort'] !== '' ? (string) $filters['sort'] : 'prioritas';

        $baseCacheKey = "pantau:prioritas:base:run:{$run->id}:bulan:" . ($bulanFilter ?? 'all');

        $items = Cache::remember($baseCacheKey, self::CACHE_TTL_SECONDS, function () use ($run, $bulanFilter) {
            $pangkalanList = Pangkalan::with([
                'klasifikasi' => fn ($q) => $q->where('run_id', $run->id),
                'tindakLanjut' => fn ($q) => $q->latest('id'),
                'laporanBulanan' => fn ($q) => $q->orderBy('bulan')->with([
                    'hasilLof' => fn ($hq) => $hq->where('run_id', $run->id),
                    'fiturBulanan' => fn ($fq) => $fq->where('run_id', $run->id),
                    'flagAturan',
                ]),
            ])->orderBy('kode')->get();

            $maxBulanDb = max(10, (int) (LaporanBulanan::max('bulan') ?? 10));
            $result = [];

            foreach ($pangkalanList as $p) {
                $klas = $p->klasifikasi->first();
                $tindak = $p->tindakLanjut->first();

                $laporanByBulan = $p->laporanBulanan->keyBy('bulan');
                $strip10Bulan = [];
                $perJenisFlag = [
                    'melebihi_alokasi' => 0,
                    'gt_2x_alokasi' => 0,
                    'nol' => 0,
                    'lonjakan' => 0,
                    'seragam' => 0,
                    'fakultatif' => 0,
                ];

                $bestLaporanForAlasan = null;
                $bestLofValue = -1.0;

                for ($m = 1; $m <= $maxBulanDb; $m++) {
                    $lap = $laporanByBulan->get($m);
                    if (!$lap) {
                        $strip10Bulan[] = [
                            'bulan' => $m,
                            'label' => self::NAMA_BULAN[$m],
                            'status' => 'tidak_ada',
                            'lof' => null,
                            'flag' => false,
                            'nol' => false,
                        ];
                        continue;
                    }

                    $hl = $lap->hasilLof->first();
                    $lofVal = $hl?->lof !== null ? round((float) $hl->lof, 2) : null;
                    $isFlag = (bool) ($hl?->flag ?? false);
                    $isNol = ($lap->total_normal === 0) || ($hl?->lof === null);

                    $statusStrip = $isNol ? 'nol' : ($isFlag ? 'ditandai' : 'tidak');

                    $strip10Bulan[] = [
                        'bulan' => $m,
                        'label' => self::NAMA_BULAN[$m],
                        'status' => $statusStrip,
                        'lof' => $lofVal,
                        'flag' => $isFlag,
                        'nol' => $isNol,
                    ];

                    if ($bulanFilter === null || $bulanFilter === $m) {
                        foreach ($lap->flagAturan as $fa) {
                            if (isset($perJenisFlag[$fa->jenis])) {
                                $perJenisFlag[$fa->jenis]++;
                            }
                        }
                    }

                    if ($hl?->lof !== null && (float) $hl->lof > $bestLofValue) {
                        $bestLofValue = (float) $hl->lof;
                        $bestLaporanForAlasan = $lap;
                    }
                }

                // Tentukan laporan rujukan untuk kalimat alasan
                $laporanRujukan = $bulanFilter !== null
                    ? $laporanByBulan->get($bulanFilter)
                    : $bestLaporanForAlasan;

                if ($laporanRujukan !== null) {
                    $fiturRujukan = $laporanRujukan->fiturBulanan->first();
                    $hlRujukan = $laporanRujukan->hasilLof->first();
                    $nolRujukan = ($laporanRujukan->total_normal === 0) || ($hlRujukan?->lof === null);
                    $alasanData = $this->alasanService->buatAlasan($fiturRujukan, (int) $laporanRujukan->bulan, $nolRujukan);
                } else {
                    $alasanData = [
                        'kalimat' => $klas?->kategori === 'Tidak dinilai'
                            ? 'tidak ada penyaluran sepanjang periode pengamatan (nol sepanjang waktu)'
                            : 'tidak ada laporan penyaluran pada bulan yang dipilih',
                        'fitur' => null,
                        'z' => null,
                        'bulan' => $bulanFilter,
                        'label_bulan' => $bulanFilter ? self::NAMA_BULAN[$bulanFilter] : null,
                    ];
                }

                $lapDipilih = $bulanFilter !== null ? $laporanByBulan->get($bulanFilter) : null;
                $hlDipilih = $lapDipilih?->hasilLof->first();

                $jenisAktif = array_keys(array_filter($perJenisFlag, fn ($cnt) => $cnt > 0));

                $result[] = [
                    'kode' => $p->kode,
                    'nama' => $p->nama,
                    'id_registrasi' => $p->id_registrasi,
                    'kecamatan' => $p->kecamatan,
                    'kelurahan' => $p->kelurahan,
                    'non_reguler' => (bool) $p->non_reguler,
                    'kategori' => $klas?->kategori ?? 'Normal',
                    'kategori_label' => $klas?->kategori_label ?? 'Normal',
                    'bulan_valid' => (int) ($klas?->bulan_valid ?? 0),
                    'bulan_flag' => (int) ($klas?->bulan_flag ?? 0),
                    'proporsi_flag' => $klas?->proporsi_flag !== null ? round((float) $klas->proporsi_flag, 2) : null,
                    'rerata_lof' => $klas?->rerata_lof !== null ? round((float) $klas->rerata_lof, 2) : null,
                    'maks_lof' => $klas?->maks_lof !== null ? round((float) $klas->maks_lof, 2) : null,
                    'bulan_maks' => $klas?->bulan_maks,
                    'run_terpanjang' => (int) ($klas?->run_terpanjang ?? 0),
                    'lof_bulan_dipilih' => $hlDipilih?->lof !== null ? round((float) $hlDipilih->lof, 2) : null,
                    'flag_bulan_dipilih' => $lapDipilih !== null ? (bool) ($hlDipilih?->flag ?? false) : null,
                    'strip_10_bulan' => $strip10Bulan,
                    'flag_aturan' => [
                        'total' => array_sum($perJenisFlag),
                        'jenis_aktif' => $jenisAktif,
                        'per_jenis' => $perJenisFlag,
                    ],
                    'alasan' => $alasanData['kalimat'],
                    'alasan_detail' => $alasanData,
                    'tindak_lanjut_status' => $tindak?->status ?? 'belum_diperiksa',
                ];
            }

            return $result;
        });

        // Filter kategori
        if ($kategoriFilter !== null && strtolower($kategoriFilter) !== 'semua') {
            $items = array_values(array_filter(
                $items,
                fn (array $item) => mb_strtolower($item['kategori']) === mb_strtolower($kategoriFilter)
            ));
        }

        // Filter pencarian q (nama & id_registrasi hanya dicocokkan untuk admin!)
        if ($qFilter !== null) {
            $items = array_values(array_filter($items, function (array $item) use ($qFilter, $isAdmin) {
                if (str_contains(mb_strtolower($item['kode']), $qFilter)) {
                    return true;
                }
                if ($item['kecamatan'] && str_contains(mb_strtolower($item['kecamatan']), $qFilter)) {
                    return true;
                }
                if (str_contains(mb_strtolower($item['kategori']), $qFilter)) {
                    return true;
                }
                if ($isAdmin) {
                    if (str_contains(mb_strtolower($item['nama']), $qFilter)) {
                        return true;
                    }
                    if (str_contains(mb_strtolower($item['id_registrasi']), $qFilter)) {
                        return true;
                    }
                }
                return false;
            }));
        }

        // Pengurutan
        usort($items, function (array $a, array $b) use ($sortFilter, $bulanFilter) {
            return match ($sortFilter) {
                'maks_lof', 'maks_lof_desc' => ($b['maks_lof'] ?? -1) <=> ($a['maks_lof'] ?? -1) ?: ($a['kode'] <=> $b['kode']),
                'maks_lof_asc' => ($a['maks_lof'] ?? 999) <=> ($b['maks_lof'] ?? 999) ?: ($a['kode'] <=> $b['kode']),
                'bulan_flag', 'bulan_flag_desc' => ($b['bulan_flag'] <=> $a['bulan_flag']) ?: (($b['maks_lof'] ?? -1) <=> ($a['maks_lof'] ?? -1)),
                'kode', 'kode_asc' => $a['kode'] <=> $b['kode'],
                'kode_desc' => $b['kode'] <=> $a['kode'],
                'lof_bulan_desc' => ($b['lof_bulan_dipilih'] ?? -1) <=> ($a['lof_bulan_dipilih'] ?? -1) ?: ($a['kode'] <=> $b['kode']),
                default => $bulanFilter !== null
                    ? (((int) ($b['flag_bulan_dipilih'] ?? false)) <=> ((int) ($a['flag_bulan_dipilih'] ?? false))
                        ?: (($b['lof_bulan_dipilih'] ?? -1) <=> ($a['lof_bulan_dipilih'] ?? -1))
                        ?: ($a['kode'] <=> $b['kode']))
                    : ($a['kode'] <=> $b['kode']),
            };
        });

        return $items;
    }

    /**
     * Profil detail satu pangkalan: GET /api/pangkalan/{kode}
     *
     * @return array<string, mixed>
     */
    public function getProfilPangkalan(string $kode): array
    {
        $normalizedKode = strtoupper(trim($kode));
        $run = $this->getActiveRun();

        $pangkalan = Pangkalan::with([
            'agen',
            'klasifikasi' => fn ($q) => $q->where('run_id', $run->id),
            'tindakLanjut' => fn ($q) => $q->with('user:id,name,role')->latest('id'),
            'laporanBulanan' => fn ($q) => $q->orderBy('bulan')->with([
                'penyaluranHarian' => fn ($hq) => $hq->orderBy('hari'),
                'hasilLof' => fn ($lq) => $lq->where('run_id', $run->id),
                'fiturBulanan' => fn ($fq) => $fq->where('run_id', $run->id),
                'flagAturan',
            ]),
        ])->where('kode', $normalizedKode)->first();

        if (!$pangkalan) {
            throw (new ModelNotFoundException())->setModel(Pangkalan::class, [$normalizedKode]);
        }

        // Ambil semua fitur_bulanan valid pada run ini untuk menghitung median pangkalan lain per bulan
        $allFiturByBulan = Cache::remember(
            "pantau:fitur_per_bulan:run:{$run->id}",
            self::CACHE_TTL_SECONDS,
            function () use ($run) {
                $rows = DB::table('fitur_bulanan')
                    ->join('laporan_bulanan', 'laporan_bulanan.id', '=', 'fitur_bulanan.laporan_id')
                    ->join('hasil_lof', function ($join) use ($run) {
                        $join->on('hasil_lof.laporan_id', '=', 'laporan_bulanan.id')
                            ->where('hasil_lof.run_id', '=', $run->id);
                    })
                    ->where('fitur_bulanan.run_id', $run->id)
                    ->whereNotNull('hasil_lof.lof')
                    ->select([
                        'laporan_bulanan.bulan',
                        'laporan_bulanan.pangkalan_id',
                        'fitur_bulanan.log_total',
                        'fitur_bulanan.cv_harian',
                        'fitur_bulanan.rasio_hari_aktif',
                        'fitur_bulanan.porsi_nilai_dominan',
                    ])
                    ->get();

                $grouped = [];
                foreach ($rows as $r) {
                    $grouped[(int) $r->bulan][] = $r;
                }
                return $grouped;
            }
        );

        $klas = $pangkalan->klasifikasi->first();
        $laporanByBulan = $pangkalan->laporanBulanan->keyBy('bulan');

        $bulananOutput = [];
        $bestLaporan = null;
        $bestLof = -1.0;

        $flagRingkasan = [
            'melebihi_alokasi' => 0,
            'gt_2x_alokasi' => 0,
            'nol' => 0,
            'lonjakan' => 0,
            'seragam' => 0,
            'fakultatif' => 0,
        ];

        for ($m = 1; $m <= 10; $m++) {
            $lap = $laporanByBulan->get($m);
            $otherRows = array_values(array_filter(
                $allFiturByBulan[$m] ?? [],
                fn ($r) => (int) $r->pangkalan_id !== (int) $pangkalan->id
            ));

            $medianLain = [
                'log_total' => $this->medianFromObjects($otherRows, 'log_total'),
                'cv_harian' => $this->medianFromObjects($otherRows, 'cv_harian'),
                'rasio_hari_aktif' => $this->medianFromObjects($otherRows, 'rasio_hari_aktif'),
                'porsi_nilai_dominan' => $this->medianFromObjects($otherRows, 'porsi_nilai_dominan'),
            ];

            if (!$lap) {
                $bulananOutput[] = [
                    'bulan' => $m,
                    'label_bulan' => self::NAMA_BULAN[$m],
                    'nama_bulan' => self::NAMA_BULAN_LENGKAP[$m],
                    'ada_laporan' => false,
                    'lof' => null,
                    'flag' => false,
                    'nol' => false,
                    'alasan' => 'Pangkalan belum memiliki catatan penyaluran pada bulan ini.',
                    'alokasi_vs_realisasi' => null,
                    'fitur' => null,
                    'median_pangkalan_lain' => $medianLain,
                    'flag_aturan' => [],
                    'volume_harian' => [],
                ];
                continue;
            }

            $hl = $lap->hasilLof->first();
            $fb = $lap->fiturBulanan->first();
            $isNol = ($lap->total_normal === 0) || ($hl?->lof === null);
            $alasanBulan = $this->alasanService->buatAlasan($fb, $m, $isNol);

            if ($hl?->lof !== null && (float) $hl->lof > $bestLof) {
                $bestLof = (float) $hl->lof;
                $bestLaporan = $lap;
            }

            $flagsBulan = [];
            foreach ($lap->flagAturan as $fa) {
                if (isset($flagRingkasan[$fa->jenis])) {
                    $flagRingkasan[$fa->jenis]++;
                }
                $flagsBulan[] = [
                    'jenis' => $fa->jenis,
                    'label' => self::LABEL_FLAG_ATURAN[$fa->jenis] ?? $fa->jenis,
                ];
            }

            $bulananOutput[] = [
                'bulan' => $m,
                'label_bulan' => self::NAMA_BULAN[$m],
                'nama_bulan' => self::NAMA_BULAN_LENGKAP[$m],
                'ada_laporan' => true,
                'lof' => $hl?->lof !== null ? round((float) $hl->lof, 2) : null,
                'flag' => (bool) ($hl?->flag ?? false),
                'nol' => $isNol,
                'alasan' => $alasanBulan['kalimat'],
                'alasan_detail' => $alasanBulan,
                'alokasi_vs_realisasi' => [
                    'alokasi' => (int) $lap->alokasi,
                    'total_normal' => (int) $lap->total_normal,
                    'fakultatif' => (int) $lap->fakultatif,
                    'grand_total' => (int) $lap->grand_total,
                    'sisa_alokasi' => (int) $lap->sisa_alokasi,
                    'hari_aktif' => (int) $lap->hari_aktif,
                    'n_hari_kerja' => (int) $lap->n_hari_kerja,
                    'rasio_utilisasi' => $lap->alokasi > 0 ? round($lap->grand_total / $lap->alokasi, 2) : null,
                    'alokasi_tidak_reliabel' => $m === 2,
                ],
                'fitur' => [
                    'log_total' => [
                        'nilai' => $fb?->log_total !== null ? round((float) $fb->log_total, 4) : null,
                        'z_score' => $fb?->z_log_total !== null ? round((float) $fb->z_log_total, 2) : null,
                        'median_pangkalan_lain' => $medianLain['log_total'],
                    ],
                    'cv_harian' => [
                        'nilai' => $fb?->cv_harian !== null ? round((float) $fb->cv_harian, 4) : null,
                        'z_score' => $fb?->z_cv_harian !== null ? round((float) $fb->z_cv_harian, 2) : null,
                        'median_pangkalan_lain' => $medianLain['cv_harian'],
                    ],
                    'rasio_hari_aktif' => [
                        'nilai' => $fb?->rasio_hari_aktif !== null ? round((float) $fb->rasio_hari_aktif, 4) : null,
                        'z_score' => $fb?->z_rasio_hari_aktif !== null ? round((float) $fb->rasio_hari_aktif, 2) : null,
                        'median_pangkalan_lain' => $medianLain['rasio_hari_aktif'],
                    ],
                    'porsi_nilai_dominan' => [
                        'nilai' => $fb?->porsi_nilai_dominan !== null ? round((float) $fb->porsi_nilai_dominan, 4) : null,
                        'z_score' => $fb?->z_porsi_nilai_dominan !== null ? round((float) $fb->z_porsi_nilai_dominan, 2) : null,
                        'median_pangkalan_lain' => $medianLain['porsi_nilai_dominan'],
                    ],
                ],
                'median_pangkalan_lain' => $medianLain,
                'flag_aturan' => $flagsBulan,
                'volume_harian' => $lap->penyaluranHarian->map(fn ($ph) => [
                    'hari' => (int) $ph->hari,
                    'tanggal' => $ph->tanggal instanceof \DateTimeInterface
                        ? $ph->tanggal->format('Y-m-d')
                        : (string) $ph->tanggal,
                    'is_minggu' => (bool) $ph->is_minggu,
                    'volume' => (int) $ph->volume,
                ])->values()->all(),
            ];
        }

        $alasanUtama = $bestLaporan
            ? $this->alasanService->buatAlasan($bestLaporan->fiturBulanan->first(), (int) $bestLaporan->bulan, false)
            : [
                'kalimat' => 'tidak ada penyaluran sepanjang periode pengamatan',
                'fitur' => null,
                'z' => null,
                'bulan' => null,
                'label_bulan' => null,
            ];

        return [
            'kode' => $pangkalan->kode,
            'nama' => $pangkalan->nama,
            'id_registrasi' => $pangkalan->id_registrasi,
            'agen' => $pangkalan->agen?->kode ?? 'KJP',
            'kecamatan' => $pangkalan->kecamatan,
            'kelurahan' => $pangkalan->kelurahan,
            'sumber_kecamatan' => $pangkalan->sumber_kecamatan,
            'non_reguler' => (bool) $pangkalan->non_reguler,
            'klasifikasi' => [
                'kategori' => $klas?->kategori ?? 'Normal',
                'kategori_label' => $klas?->kategori_label ?? 'Normal',
                'bulan_valid' => (int) ($klas?->bulan_valid ?? 0),
                'bulan_flag' => (int) ($klas?->bulan_flag ?? 0),
                'proporsi_flag' => $klas?->proporsi_flag !== null ? round((float) $klas->proporsi_flag, 2) : null,
                'rerata_lof' => $klas?->rerata_lof !== null ? round((float) $klas->rerata_lof, 2) : null,
                'maks_lof' => $klas?->maks_lof !== null ? round((float) $klas->maks_lof, 2) : null,
                'bulan_maks' => $klas?->bulan_maks,
                'bulan_yang_ditandai' => $klas?->bulan_yang_ditandai,
                'run_terpanjang' => (int) ($klas?->run_terpanjang ?? 0),
            ],
            'alasan_utama' => $alasanUtama,
            'flag_aturan_ringkasan' => $flagRingkasan,
            'laporan_bulanan' => $bulananOutput,
            'tindak_lanjut' => $pangkalan->tindakLanjut->map(fn ($tl) => [
                'id' => $tl->id,
                'status' => $tl->status,
                'catatan' => $tl->catatan,
                'oleh' => $tl->user?->name,
                'updated_at' => $tl->updated_at?->toIso8601String(),
            ])->values()->all(),
        ];
    }

    /**
     * Matriks pangkalan x bulan untuk GET /api/heatmap (urut menurut kategori, di-cache 5 menit).
     *
     * @return array<int, array<string, mixed>>
     */
    public function getHeatmap(): array
    {
        $run = $this->getActiveRun();
        $cacheKey = "pantau:heatmap:run:{$run->id}";

        return Cache::remember($cacheKey, self::CACHE_TTL_SECONDS, function () use ($run) {
            $pangkalanList = Pangkalan::with([
                'klasifikasi' => fn ($q) => $q->where('run_id', $run->id),
                'laporanBulanan' => fn ($q) => $q->orderBy('bulan')->with([
                    'hasilLof' => fn ($lq) => $lq->where('run_id', $run->id),
                    'fiturBulanan' => fn ($fq) => $fq->where('run_id', $run->id),
                ]),
            ])->orderBy('kode')->get();

            $urutanKategori = [
                'Konsisten tinggi' => 1,
                'Berulang' => 2,
                'Sporadis' => 3,
                'Data kurang' => 4,
                'Tidak dinilai' => 5,
                'Normal' => 6,
            ];

            $rows = [];
            foreach ($pangkalanList as $p) {
                $klas = $p->klasifikasi->first();
                $laporanByBulan = $p->laporanBulanan->keyBy('bulan');
                $sel = [];

                for ($m = 1; $m <= 10; $m++) {
                    $lap = $laporanByBulan->get($m);
                    if (!$lap) {
                        $sel[] = [
                            'bulan' => $m,
                            'label' => self::NAMA_BULAN[$m],
                            'lof' => null,
                            'flag' => false,
                            'nol' => false,
                            'ada_laporan' => false,
                            'grand_total' => null,
                            'alokasi' => null,
                            'z_score' => null,
                        ];
                        continue;
                    }

                    $hl = $lap->hasilLof->first();
                    $fb = $lap->fiturBulanan->first();
                    $isNol = ($lap->total_normal === 0) || ($hl?->lof === null);

                    $sel[] = [
                        'bulan' => $m,
                        'label' => self::NAMA_BULAN[$m],
                        'lof' => $hl?->lof !== null ? round((float) $hl->lof, 2) : null,
                        'flag' => (bool) ($hl?->flag ?? false),
                        'nol' => $isNol,
                        'ada_laporan' => true,
                        'grand_total' => (int) $lap->grand_total,
                        'alokasi' => (int) $lap->alokasi,
                        'z_score' => $isNol || !$fb ? null : [
                            'log_total' => $fb->z_log_total !== null ? round((float) $fb->z_log_total, 2) : null,
                            'cv_harian' => $fb->z_cv_harian !== null ? round((float) $fb->z_cv_harian, 2) : null,
                            'rasio_hari_aktif' => $fb->z_rasio_hari_aktif !== null ? round((float) $fb->z_rasio_hari_aktif, 2) : null,
                            'porsi_nilai_dominan' => $fb->z_porsi_nilai_dominan !== null ? round((float) $fb->z_porsi_nilai_dominan, 2) : null,
                        ],
                    ];
                }

                $kategori = $klas?->kategori ?? 'Normal';
                $rows[] = [
                    'kode' => $p->kode,
                    'nama' => $p->nama,
                    'kecamatan' => $p->kecamatan,
                    'non_reguler' => (bool) $p->non_reguler,
                    'kategori' => $kategori,
                    'kategori_label' => $klas?->kategori_label ?? 'Normal',
                    'urutan_kategori' => $urutanKategori[$kategori] ?? 99,
                    'bulan_valid' => (int) ($klas?->bulan_valid ?? 0),
                    'bulan_flag' => (int) ($klas?->bulan_flag ?? 0),
                    'maks_lof' => $klas?->maks_lof !== null ? round((float) $klas->maks_lof, 2) : null,
                    'run_terpanjang' => (int) ($klas?->run_terpanjang ?? 0),
                    'sel' => $sel,
                ];
            }

            usort($rows, function (array $a, array $b) {
                return ($a['urutan_kategori'] <=> $b['urutan_kategori'])
                    ?: (($b['maks_lof'] ?? -1) <=> ($a['maks_lof'] ?? -1))
                    ?: ($a['kode'] <=> $b['kode']);
            });

            return $rows;
        });
    }

    /**
     * Daftar temuan flag aturan untuk GET /api/temuan-aturan?jenis=&bulan=
     *
     * @return array{items: array<int, array<string, mixed>>, ringkasan: array<string, int>}
     */
    public function getTemuanAturan(?string $jenis = null, ?int $bulan = null): array
    {
        $run = $this->getActiveRun();

        $query = DB::table('flag_aturan')
            ->join('laporan_bulanan', 'laporan_bulanan.id', '=', 'flag_aturan.laporan_id')
            ->join('pangkalan', 'pangkalan.id', '=', 'laporan_bulanan.pangkalan_id')
            ->leftJoin('hasil_lof', function ($join) use ($run) {
                $join->on('hasil_lof.laporan_id', '=', 'laporan_bulanan.id')
                    ->where('hasil_lof.run_id', '=', $run->id);
            })
            ->leftJoin('klasifikasi_pangkalan', function ($join) use ($run) {
                $join->on('klasifikasi_pangkalan.pangkalan_id', '=', 'pangkalan.id')
                    ->where('klasifikasi_pangkalan.run_id', '=', $run->id);
            });

        if ($jenis !== null && $jenis !== '') {
            $query->where('flag_aturan.jenis', $jenis);
        }

        if ($bulan !== null) {
            $query->where('laporan_bulanan.bulan', $bulan);
        }

        $rows = $query->select([
            'flag_aturan.id',
            'flag_aturan.jenis',
            'laporan_bulanan.bulan',
            'laporan_bulanan.alokasi',
            'laporan_bulanan.total_normal',
            'laporan_bulanan.fakultatif',
            'laporan_bulanan.grand_total',
            'laporan_bulanan.sisa_alokasi',
            'laporan_bulanan.hari_aktif',
            'pangkalan.kode',
            'pangkalan.nama',
            'pangkalan.kecamatan',
            'klasifikasi_pangkalan.kategori',
            'hasil_lof.lof',
            'hasil_lof.flag as flag_lof',
        ])->orderBy('laporan_bulanan.bulan')->orderBy('pangkalan.kode')->get();

        $items = $rows->map(function ($r) {
            $jenisFlag = (string) $r->jenis;
            return [
                'id' => (int) $r->id,
                'jenis' => $jenisFlag,
                'label_jenis' => self::LABEL_FLAG_ATURAN[$jenisFlag] ?? $jenisFlag,
                'bulan' => (int) $r->bulan,
                'label_bulan' => self::NAMA_BULAN[(int) $r->bulan] ?? (string) $r->bulan,
                'kode' => $r->kode,
                'nama' => $r->nama,
                'kecamatan' => $r->kecamatan,
                'kategori' => $r->kategori ?? 'Normal',
                'alokasi' => (int) $r->alokasi,
                'total_normal' => (int) $r->total_normal,
                'fakultatif' => (int) $r->fakultatif,
                'grand_total' => (int) $r->grand_total,
                'sisa_alokasi' => (int) $r->sisa_alokasi,
                'hari_aktif' => (int) $r->hari_aktif,
                'lof' => $r->lof !== null ? round((float) $r->lof, 2) : null,
                'flag_lof' => (bool) $r->flag_lof,
                'penjelasan' => $this->buatPenjelasanFlagAturan($jenisFlag, (int) $r->grand_total, (int) $r->alokasi, (int) $r->fakultatif, (int) $r->hari_aktif),
            ];
        })->values()->all();

        $countsRaw = FlagAturan::query()
            ->selectRaw('jenis, COUNT(*) as total')
            ->groupBy('jenis')
            ->pluck('total', 'jenis')
            ->map(fn ($v) => (int) $v)
            ->all();

        $ringkasan = [
            'melebihi_alokasi' => $countsRaw['melebihi_alokasi'] ?? 0,
            'gt_2x_alokasi' => $countsRaw['gt_2x_alokasi'] ?? 0,
            'nol' => $countsRaw['nol'] ?? 0,
            'lonjakan' => $countsRaw['lonjakan'] ?? 0,
            'seragam' => $countsRaw['seragam'] ?? 0,
            'fakultatif' => $countsRaw['fakultatif'] ?? 0,
        ];

        return [
            'items' => $items,
            'ringkasan' => $ringkasan,
        ];
    }

    /**
     * Parameter metodologi, keterbatasan, dan isi evaluasi_lof.csv (Bab V) untuk GET /api/metode.
     *
     * @return array<string, mixed>
     */
    public function getMetode(): array
    {
        $run = $this->getActiveRun();

        return Cache::remember("pantau:metode:run:{$run->id}", self::CACHE_TTL_SECONDS, function () use ($run) {
            $dataDir = realpath(base_path('../data')) ?: base_path('../data');
            $evaluasiPath = $dataDir . DIRECTORY_SEPARATOR . 'evaluasi_lof.csv';
            $ringkasanBulanPath = $dataDir . DIRECTORY_SEPARATOR . 'ringkasan_per_bulan.csv';

            $evaluasiRows = [];
            if (is_file($evaluasiPath) && ($fh = fopen($evaluasiPath, 'r')) !== false) {
                $headers = fgetcsv($fh);
                while (($line = fgetcsv($fh)) !== false) {
                    if (count($line) < 3) {
                        continue;
                    }
                    $evaluasiRows[] = [
                        'uji' => trim((string) $line[0]),
                        'ukuran' => trim((string) $line[1]),
                        'nilai' => is_numeric($line[2]) ? (float) $line[2] : $line[2],
                    ];
                }
                fclose($fh);
            }

            $ringkasanBulanRows = [];
            if (is_file($ringkasanBulanPath) && ($fh = fopen($ringkasanBulanPath, 'r')) !== false) {
                $headers = fgetcsv($fh);
                while (($line = fgetcsv($fh)) !== false) {
                    if (count($line) < 11) {
                        continue;
                    }
                    $ringkasanBulanRows[] = [
                        'bulan' => trim((string) $line[0]),
                        'pangkalan' => (int) $line[1],
                        'total_normal' => (int) $line[2],
                        'fakultatif' => (int) $line[3],
                        'grand_total' => (int) $line[4],
                        'alokasi' => (int) $line[5],
                        'minus' => (int) $line[6],
                        'aktif_median' => (float) $line[7],
                        'nol' => (int) $line[8],
                        'rit_normal' => (float) $line[9],
                        'utilisasi' => (float) $line[10],
                    ];
                }
                fclose($fh);
            }

            return [
                'parameter' => [
                    'run_nama' => $run->nama,
                    'algoritma' => 'Local Outlier Factor (LOF)',
                    'k' => (int) $run->k,
                    'threshold' => (float) $run->threshold,
                    'metrik_jarak' => 'Euclidean pada ruang z-score robust 4 dimensi',
                    'normalisasi' => 'z-score robust per bulan: (x - median) / (1,4826 × MAD)',
                    'hari_minggu_dikecualikan' => true,
                    'minimal_bulan_valid_klasifikasi' => 4,
                    'fitur' => [
                        [
                            'kode' => 'log_total',
                            'nama' => 'Logaritma Volume Bulanan',
                            'rumus' => 'ln(1 + total_normal)',
                            'tujuan' => 'Menangkap skala volume penyaluran bulanan sekaligus meredam kemencengan kanan.',
                        ],
                        [
                            'kode' => 'cv_harian',
                            'nama' => 'Koefisien Variasi Harian',
                            'rumus' => 'std(volume_hari_aktif) / mean(volume_hari_aktif)',
                            'tujuan' => 'Mengukur fluktuasi antarhari aktif (membedakan penyaluran rata vs melonjak).',
                        ],
                        [
                            'kode' => 'rasio_hari_aktif',
                            'nama' => 'Rasio Hari Aktif',
                            'rumus' => 'hari_aktif / jumlah_hari_kerja_non_minggu',
                            'tujuan' => 'Mengukur frekuensi keaktifan penyaluran dalam satu bulan kerja.',
                        ],
                        [
                            'kode' => 'porsi_nilai_dominan',
                            'nama' => 'Porsi Nilai Harian Dominan',
                            'rumus' => 'frekuensi_angka_terbanyak / hari_aktif',
                            'tujuan' => 'Mendeteksi kecenderungan pengulangan angka bulat yang sama terus-menerus.',
                        ],
                    ],
                ],
                'aturan_klasifikasi' => [
                    ['kategori' => 'Normal', 'kriteria' => 'Minimal 4 bulan valid dan tidak pernah ditandai LOF >= 1,5 (0%).', 'jumlah_pangkalan' => 18],
                    ['kategori' => 'Sporadis', 'kriteria' => 'Minimal 4 bulan valid dan proporsi bulan ditandai <= 30%.', 'jumlah_pangkalan' => 6],
                    ['kategori' => 'Berulang', 'kriteria' => 'Minimal 4 bulan valid dan proporsi bulan ditandai > 30% hingga < 70%.', 'jumlah_pangkalan' => 3],
                    ['kategori' => 'Konsisten tinggi', 'kriteria' => 'Minimal 4 bulan valid dan proporsi bulan ditandai >= 70%.', 'jumlah_pangkalan' => 1],
                    ['kategori' => 'Data kurang', 'kriteria' => 'Jumlah bulan aktif valid antara 1 hingga 3 bulan (< 4 bulan valid).', 'jumlah_pangkalan' => 1],
                    ['kategori' => 'Tidak dinilai', 'kriteria' => 'Volume penyaluran 0 tabung sepanjang seluruh bulan pengamatan.', 'jumlah_pangkalan' => 1],
                ],
                'definisi_flag_aturan' => [
                    ['jenis' => 'melebihi_alokasi', 'kriteria' => 'Grand total > alokasi bulanan (bulan Februari dikecualikan karena pencatatan alokasi seragam 300).', 'jumlah_kejadian' => 33],
                    ['jenis' => 'gt_2x_alokasi', 'kriteria' => 'Grand total > 2 × alokasi bulanan (tanpa Februari).', 'jumlah_kejadian' => 9],
                    ['jenis' => 'nol', 'kriteria' => 'Total penyaluran normal = 0 tabung selama sebulan penuh.', 'jumlah_kejadian' => 11],
                    ['jenis' => 'lonjakan', 'kriteria' => 'Satu hari puncak menyumbang > 40% volume bulanan dengan hari aktif <= 3 hari.', 'jumlah_kejadian' => 2],
                    ['jenis' => 'seragam', 'kriteria' => 'Porsi nilai harian dominan >= 90% dengan minimal 8 hari aktif.', 'jumlah_kejadian' => 1],
                    ['jenis' => 'fakultatif', 'kriteria' => 'Terdapat penyaluran fakultatif (total_fakultatif > 0).', 'jumlah_kejadian' => 69],
                ],
                'keterbatasan' => [
                    'Skor LOF dan flag aturan adalah indikasi awal untuk memprioritaskan pemeriksaan lapangan oleh Tim Monev, bukan bukti pelanggaran.',
                    'Skor LOF bukan nilai probabilitas; nilai di sekitar 1,0 menunjukkan kemiripan dengan tetangga terdekat, sedangkan nilai >= 1,5 menunjukkan penyimpangan pola relatif pada bulan tersebut.',
                    'Data deret waktu Januari–Oktober 2026 mencakup 1 agen (KJP, 30 pangkalan) sehingga perbandingan dilakukan antar-pangkalan dalam bulan yang sama.',
                    'Pada bulan Februari 2026, kolom alokasi di laporan sumber tercatat seragam 300 tabung untuk mayoritas pangkalan sehingga aturan kelebihan alokasi tidak diberlakukan pada bulan Februari.',
                    'Pangkalan dengan volume 0 tabung sebulan penuh tidak dimasukkan ke perhitungan jarak LOF karena fitur variasi harian tidak terdefinisi, namun tetap ditandai melalui aturan "nol".',
                ],
                'evaluasi_lof' => $evaluasiRows,
                'ringkasan_per_bulan' => $ringkasanBulanRows,
            ];
        });
    }

    /**
     * @param array<int, float> $sorted
     */
    private function quantile(array $sorted, float $q): float
    {
        $n = count($sorted);
        if ($n === 0) {
            return 0.0;
        }
        if ($n === 1) {
            return $sorted[0];
        }
        $pos = ($n - 1) * $q;
        $base = (int) floor($pos);
        $rest = $pos - $base;
        if (isset($sorted[$base + 1])) {
            return $sorted[$base] + $rest * ($sorted[$base + 1] - $sorted[$base]);
        }
        return $sorted[$base];
    }

    /**
     * @param array<int, object> $rows
     */
    private function medianFromObjects(array $rows, string $field): ?float
    {
        $vals = [];
        foreach ($rows as $r) {
            if (isset($r->{$field}) && $r->{$field} !== null) {
                $vals[] = (float) $r->{$field};
            }
        }
        if (empty($vals)) {
            return null;
        }
        sort($vals);
        return round($this->quantile($vals, 0.50), 4);
    }

    private function buatPenjelasanFlagAturan(
        string $jenis,
        int $grandTotal,
        int $alokasi,
        int $fakultatif,
        int $hariAktif
    ): string {
        return match ($jenis) {
            'melebihi_alokasi' => "Realisasi ({$grandTotal} tabung) melebihi kuota alokasi ({$alokasi} tabung).",
            'gt_2x_alokasi' => "Realisasi ({$grandTotal} tabung) melampaui dua kali lipat alokasi ({$alokasi} tabung).",
            'nol' => 'Tidak tercatat penyaluran sepanjang bulan (0 tabung).',
            'lonjakan' => "Penyaluran terkonsentrasi tajam pada {$hariAktif} hari aktif (>40% pada satu hari puncak).",
            'seragam' => "Angka penyaluran harian berulang seragam (>=90% nilai identik pada {$hariAktif} hari aktif).",
            'fakultatif' => "Tercatat penyaluran tambahan fakultatif sebesar {$fakultatif} tabung.",
            default => $jenis,
        };
    }
}
