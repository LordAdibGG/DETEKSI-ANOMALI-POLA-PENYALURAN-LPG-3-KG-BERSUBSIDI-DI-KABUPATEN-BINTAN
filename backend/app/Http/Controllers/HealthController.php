<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $dbStatus = $this->checkDatabase();
        $mlStatus = $this->checkMlService();

        $overallOk = ($dbStatus['status'] === 'ok') && ($mlStatus['status'] === 'ok');

        return response()->json([
            'status' => $overallOk ? 'ok' : 'degraded',
            'service' => 'lembar-pantau-api',
            'version' => config('app.version', env('APP_VERSION', '0.1.0')),
            'timestamp' => now()->toIso8601String(),
            'db' => $dbStatus,
            'ml' => $mlStatus,
        ], 200);
    }

    /**
     * @return array<string, mixed>
     */
    private function checkDatabase(): array
    {
        try {
            $pdo = DB::connection()->getPdo();
            DB::select('SELECT 1');

            return [
                'status' => 'ok',
                'database' => DB::connection()->getDatabaseName(),
                'driver' => $pdo->getAttribute(\PDO::ATTR_DRIVER_NAME),
                'message' => 'Koneksi MySQL aktif dan siap melayani buku besar pengawasan.',
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'error',
                'database' => config('database.connections.mysql.database', 'lpg_lof'),
                'message' => 'Gagal terhubung ke MySQL: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function checkMlService(): array
    {
        $mlUrl = rtrim((string) config('services.ml.url', 'http://127.0.0.1:8001'), '/');
        $mlKey = (string) config('services.ml.key', '');
        $timeout = (int) config('services.ml.timeout', 3);

        try {
            $response = Http::timeout($timeout)
                ->acceptJson()
                ->withHeaders([
                    'X-ML-KEY' => $mlKey,
                ])
                ->get("{$mlUrl}/health");

            if ($response->successful()) {
                $payload = $response->json();

                return [
                    'status' => ($payload['status'] ?? 'ok') === 'ok' ? 'ok' : 'error',
                    'service' => $payload['service'] ?? 'lembar-pantau-ml',
                    'version' => $payload['version'] ?? '0.1.0',
                    'engine' => $payload['engine'] ?? 'scikit-learn LOF',
                    'data_ready' => (bool) ($payload['data_ready'] ?? false),
                    'message' => 'Layanan LOF aktif dan terotentikasi.',
                ];
            }

            return [
                'status' => 'error',
                'http_code' => $response->status(),
                'message' => 'Layanan LOF menolak permintaan atau mengembalikan kode HTTP ' . $response->status() . '.',
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'error',
                'message' => 'Layanan LOF tidak dapat dihubungi pada ' . $mlUrl . '. API utama tetap beroperasi.',
            ];
        }
    }
}
