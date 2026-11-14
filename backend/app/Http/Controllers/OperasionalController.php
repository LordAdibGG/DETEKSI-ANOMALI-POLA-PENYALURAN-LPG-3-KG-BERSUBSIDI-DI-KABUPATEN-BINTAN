<?php

namespace App\Http\Controllers;

use App\Services\OperasionalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OperasionalController extends Controller
{
    public function __construct(
        private readonly OperasionalService $operasionalService
    ) {}

    public function contohBulanFiktif(Request $request): JsonResponse
    {
        $bulan = (int) $request->query('bulan', 11);
        if ($bulan < 1 || $bulan > 12) {
            $bulan = 11;
        }

        $csv = $this->operasionalService->generateContohBulanFiktifCsv($bulan);

        return response()->json([
            'data' => [
                'bulan' => $bulan,
                'filename' => sprintf('kjp_2026_fiktif_bulan_%02d.csv', $bulan),
                'csv' => $csv,
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
        ], 200);
    }

    public function validasiUnggah(Request $request): JsonResponse
    {
        $csvContent = $this->extractCsvContent($request);
        $expectedTotalAgen = $request->filled('expected_total_agen')
            ? (int) $request->input('expected_total_agen')
            : null;
        $isAdmin = (bool) $request->user()?->isAdmin();

        $hasil = $this->operasionalService->validasiLaporanBulanan(
            csvContent: $csvContent,
            expectedTotalAgen: $expectedTotalAgen,
            isAdmin: $isAdmin
        );

        return response()->json([
            'data' => $hasil,
            'meta' => [
                'valid' => $hasil['valid'],
                'timestamp' => now()->toIso8601String(),
            ],
        ], 200);
    }

    public function konfirmasiUnggah(Request $request): JsonResponse
    {
        if (!$request->user()?->isAdmin()) {
            return response()->json([
                'error' => [
                    'code' => 'FORBIDDEN',
                    'message' => 'Hanya administrator yang diizinkan mengonfirmasi unggahan dan menjalankan analisis ulang.',
                ],
                'meta' => [
                    'status' => 403,
                    'timestamp' => now()->toIso8601String(),
                ],
            ], 403);
        }

        $request->validate([
            'k' => ['nullable', 'integer', 'min:2', 'max:28'],
            'threshold' => ['nullable', 'numeric', 'min:0.5', 'max:10.0'],
            'top_n' => ['nullable', 'integer', 'min:1', 'max:30'],
            'nama_run' => ['nullable', 'string', 'max:100'],
        ]);

        $csvContent = $this->extractCsvContent($request);
        $k = $request->filled('k') ? (int) $request->input('k') : 10;
        $threshold = $request->filled('threshold') ? (float) $request->input('threshold') : 1.5;
        $topN = $request->filled('top_n') ? (int) $request->input('top_n') : null;
        $namaRun = $request->input('nama_run');

        $hasil = $this->operasionalService->konfirmasiDanSimpanLaporan(
            csvContent: $csvContent,
            k: $k,
            threshold: $threshold,
            topN: $topN,
            namaRun: $namaRun,
            userId: $request->user()?->id,
            isAdmin: true,
            ip: $request->ip() ?? '127.0.0.1'
        );

        return response()->json([
            'data' => $hasil,
            'meta' => [
                'message' => 'Laporan bulanan berhasil disimpan dan analisis LOF baru telah dijalankan.',
                'timestamp' => now()->toIso8601String(),
            ],
        ], 201);
    }

    public function daftarRuns(Request $request): JsonResponse
    {
        $isAdmin = (bool) $request->user()?->isAdmin();
        $runs = $this->operasionalService->getDaftarRuns($isAdmin);

        return response()->json([
            'data' => $runs,
            'meta' => [
                'total' => count($runs),
                'timestamp' => now()->toIso8601String(),
            ],
        ], 200);
    }

    public function daftarTindakLanjut(Request $request): JsonResponse
    {
        $isAdmin = (bool) $request->user()?->isAdmin();
        $result = $this->operasionalService->getDaftarTindakLanjut($isAdmin);

        return response()->json([
            'data' => $result['items'],
            'meta' => [
                'total' => count($result['items']),
                'ringkasan_status' => $result['ringkasan_status'],
                'pilihan_status' => OperasionalService::STATUS_TINDAK_LANJUT,
                'timestamp' => now()->toIso8601String(),
            ],
        ], 200);
    }

    public function simpanTindakLanjut(Request $request, string $kode): JsonResponse
    {
        $validated = $request->validate([
            'status' => [
                'required',
                'string',
                Rule::in(array_keys(OperasionalService::STATUS_TINDAK_LANJUT)),
            ],
            'catatan' => ['nullable', 'string', 'max:1000'],
        ], [
            'status.required' => 'Status tindak lanjut wajib dipilih.',
            'status.in' => 'Status tindak lanjut tidak valid. Pilih: belum_diperiksa, perlu_klarifikasi, wajar_dengan_alasan, atau ditindaklanjuti.',
        ]);

        $hasil = $this->operasionalService->simpanTindakLanjut(
            kode: $kode,
            status: $validated['status'],
            catatan: $validated['catatan'] ?? null,
            userId: $request->user()?->id,
            ip: $request->ip() ?? '127.0.0.1'
        );

        return response()->json([
            'data' => $hasil,
            'meta' => [
                'message' => 'Status tindak lanjut pangkalan berhasil diperbarui.',
                'timestamp' => now()->toIso8601String(),
            ],
        ], 201);
    }

    public function auditLog(Request $request): JsonResponse
    {
        $limit = min(100, max(5, (int) $request->query('limit', 40)));
        $logs = $this->operasionalService->getAuditLogs($limit);

        return response()->json([
            'data' => $logs,
            'meta' => [
                'total' => count($logs),
                'timestamp' => now()->toIso8601String(),
            ],
        ], 200);
    }

    private function extractCsvContent(Request $request): string
    {
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            if ($file && $file->isValid()) {
                return (string) file_get_contents($file->getRealPath());
            }
        }

        return (string) $request->input('csv', '');
    }
}
