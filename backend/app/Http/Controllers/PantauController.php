<?php

namespace App\Http\Controllers;

use App\Http\Requests\PrioritasRequest;
use App\Http\Requests\RingkasanRequest;
use App\Http\Requests\RunAnalysisRequest;
use App\Http\Requests\TemuanAturanRequest;
use App\Http\Resources\HeatmapRowResource;
use App\Http\Resources\MetodeResource;
use App\Http\Resources\PrioritasPangkalanResource;
use App\Http\Resources\ProfilPangkalanResource;
use App\Http\Resources\RingkasanResource;
use App\Http\Resources\TemuanAturanResource;
use App\Services\AnalysisService;
use App\Services\PantauDataService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class PantauController extends Controller
{
    public function __construct(
        private readonly PantauDataService $dataService
    ) {}

    public function ringkasan(RingkasanRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $bulan = isset($validated['bulan']) ? (int) $validated['bulan'] : null;

        $ringkasan = $this->dataService->getRingkasan($bulan);

        return response()->json([
            'data' => (new RingkasanResource($ringkasan))->resolve($request),
            'meta' => [
                'run' => 'baseline-k10',
                'bulan' => $bulan,
                'cache_ttl_seconds' => PantauDataService::CACHE_TTL_SECONDS,
                'timestamp' => now()->toIso8601String(),
            ],
        ], 200);
    }

    public function prioritas(PrioritasRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $isAdmin = (bool) $request->user()?->isAdmin();

        $items = $this->dataService->getPrioritas($validated, $isAdmin);
        $resolved = array_map(
            fn (array $item) => (new PrioritasPangkalanResource($item))->resolve($request),
            $items
        );

        return response()->json([
            'data' => $resolved,
            'meta' => [
                'total' => count($resolved),
                'filters' => [
                    'bulan' => isset($validated['bulan']) ? (int) $validated['bulan'] : null,
                    'kategori' => $validated['kategori'] ?? null,
                    'q' => $validated['q'] ?? null,
                    'sort' => $validated['sort'] ?? 'prioritas',
                ],
                'role' => $request->user()?->role,
                'timestamp' => now()->toIso8601String(),
            ],
        ], 200);
    }

    public function profilPangkalan(Request $request, string $kode): JsonResponse
    {
        $profil = $this->dataService->getProfilPangkalan($kode);

        return response()->json([
            'data' => (new ProfilPangkalanResource($profil))->resolve($request),
            'meta' => [
                'kode' => $profil['kode'],
                'run' => 'baseline-k10',
                'role' => $request->user()?->role,
                'timestamp' => now()->toIso8601String(),
            ],
        ], 200);
    }

    public function heatmap(Request $request): JsonResponse
    {
        $rows = $this->dataService->getHeatmap();
        $resolved = array_map(
            fn (array $row) => (new HeatmapRowResource($row))->resolve($request),
            $rows
        );

        return response()->json([
            'data' => $resolved,
            'meta' => [
                'total_pangkalan' => count($resolved),
                'bulan_labels' => array_values(PantauDataService::NAMA_BULAN),
                'threshold' => 1.5,
                'role' => $request->user()?->role,
                'timestamp' => now()->toIso8601String(),
            ],
        ], 200);
    }

    public function temuanAturan(TemuanAturanRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $jenis = $validated['jenis'] ?? null;
        $bulan = isset($validated['bulan']) ? (int) $validated['bulan'] : null;

        $result = $this->dataService->getTemuanAturan($jenis, $bulan);
        $resolved = array_map(
            fn (array $item) => (new TemuanAturanResource($item))->resolve($request),
            $result['items']
        );

        return response()->json([
            'data' => $resolved,
            'meta' => [
                'total' => count($resolved),
                'ringkasan_per_jenis' => $result['ringkasan'],
                'filters' => [
                    'jenis' => $jenis,
                    'bulan' => $bulan,
                ],
                'role' => $request->user()?->role,
                'timestamp' => now()->toIso8601String(),
            ],
        ], 200);
    }

    public function metode(Request $request): JsonResponse
    {
        $metode = $this->dataService->getMetode();

        return response()->json([
            'data' => (new MetodeResource($metode))->resolve($request),
            'meta' => [
                'run' => 'baseline-k10',
                'jumlah_uji_evaluasi' => count($metode['evaluasi_lof']),
                'cache_ttl_seconds' => PantauDataService::CACHE_TTL_SECONDS,
                'timestamp' => now()->toIso8601String(),
            ],
        ], 200);
    }

    public function exportPrioritasCsv(PrioritasRequest $request): Response
    {
        $validated = $request->validated();
        $isAdmin = (bool) $request->user()?->isAdmin();
        $items = $this->dataService->getPrioritas($validated, $isAdmin);

        $handle = fopen('php://temp', 'r+');

        $headers = ['kode'];
        if ($isAdmin) {
            $headers[] = 'id_registrasi';
            $headers[] = 'nama_pangkalan';
        }
        $headers = array_merge($headers, [
            'kecamatan',
            'non_reguler',
            'kategori',
            'bulan_valid',
            'bulan_flag_lof',
            'proporsi_flag',
            'rerata_lof',
            'maks_lof',
            'bulan_maks',
            'run_terpanjang',
            'flag_melebihi_alokasi',
            'flag_gt_2x_alokasi',
            'flag_nol',
            'flag_lonjakan',
            'flag_seragam',
            'flag_fakultatif',
            'alasan_penandaan',
        ]);

        fputcsv($handle, $headers);

        foreach ($items as $item) {
            $row = [$item['kode']];
            if ($isAdmin) {
                $row[] = $item['id_registrasi'];
                $row[] = $item['nama'];
            }
            $perJenis = $item['flag_aturan']['per_jenis'] ?? [];
            $row = array_merge($row, [
                $item['kecamatan'] ?? '',
                $item['non_reguler'] ? 'Ya' : 'Tidak',
                $item['kategori'],
                $item['bulan_valid'],
                $item['bulan_flag'],
                $item['proporsi_flag'] ?? '',
                $item['rerata_lof'] ?? '',
                $item['maks_lof'] ?? '',
                $item['bulan_maks'] ?? '',
                $item['run_terpanjang'],
                $perJenis['melebihi_alokasi'] ?? 0,
                $perJenis['gt_2x_alokasi'] ?? 0,
                $perJenis['nol'] ?? 0,
                $perJenis['lonjakan'] ?? 0,
                $perJenis['seragam'] ?? 0,
                $perJenis['fakultatif'] ?? 0,
                $item['alasan'],
            ]);

            fputcsv($handle, $row);
        }

        rewind($handle);
        $csvContent = stream_get_contents($handle);
        fclose($handle);

        \App\Models\AuditLog::create([
            'user_id' => $request->user()?->id,
            'aksi' => 'prioritas.export_csv',
            'entitas' => 'prioritas',
            'entitas_id' => null,
            'detail' => [
                'jumlah_baris' => count($items),
                'filters' => $validated,
            ],
            'ip_address' => $request->ip() ?? '127.0.0.1',
        ]);

        return response($csvContent, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="prioritas-pemeriksaan-kjp-2026.csv"',
        ]);
    }

    public function runAnalisis(RunAnalysisRequest $request, AnalysisService $analysisService): JsonResponse
    {
        $validated = $request->validated();
        $k = isset($validated['k']) ? (int) $validated['k'] : 10;
        $threshold = isset($validated['threshold']) ? (float) $validated['threshold'] : 1.5;
        $topN = isset($validated['top_n']) && $validated['top_n'] !== '' ? (int) $validated['top_n'] : null;
        $fallbackLocal = (bool) ($validated['fallback_local'] ?? false);
        $nama = $validated['nama'] ?? null;
        $catatan = $validated['catatan'] ?? null;

        $result = $analysisService->executeRun(
            k: $k,
            threshold: $threshold,
            nama: $nama,
            catatan: $catatan,
            userId: $request->user()?->id,
            topN: $topN,
            fallbackLocal: $fallbackLocal,
            isAdmin: (bool) $request->user()?->isAdmin(),
        );

        return response()->json([
            'data' => $result,
            'meta' => [
                'message' => 'Perhitungan analisis LOF berhasil dijalankan dan disimpan.',
                'timestamp' => now()->toIso8601String(),
            ],
        ], 201);
    }
}
