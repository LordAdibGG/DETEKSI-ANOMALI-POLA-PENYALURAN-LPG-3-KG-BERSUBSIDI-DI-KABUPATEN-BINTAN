<?php

namespace Tests\Feature;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class HealthEndpointTest extends TestCase
{
    public function test_health_endpoint_returns_green_when_db_and_ml_are_healthy(): void
    {
        config([
            'services.ml.url' => 'http://127.0.0.1:8001',
            'services.ml.key' => 'lembar-pantau-ml-secret-2026',
        ]);

        Http::fake([
            '127.0.0.1:8001/health' => Http::response([
                'status' => 'ok',
                'service' => 'lembar-pantau-ml',
                'version' => '0.1.0',
                'engine' => 'scikit-learn LOF (k=10, threshold=1.5)',
                'data_ready' => true,
            ], 200),
        ]);

        $response = $this->getJson('/api/health');

        $response->assertStatus(200)
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('version', '0.1.0')
            ->assertJsonPath('db.status', 'ok')
            ->assertJsonPath('ml.status', 'ok')
            ->assertJsonPath('ml.version', '0.1.0');

        Http::assertSent(function (Request $request) {
            return $request->url() === 'http://127.0.0.1:8001/health'
                && $request->hasHeader('X-ML-KEY', 'lembar-pantau-ml-secret-2026');
        });
    }

    public function test_health_endpoint_marks_ml_red_without_crashing_when_python_service_is_down(): void
    {
        config([
            'services.ml.url' => 'http://127.0.0.1:8001',
            'services.ml.key' => 'lembar-pantau-ml-secret-2026',
        ]);

        Http::fake([
            '127.0.0.1:8001/health' => function () {
                throw new ConnectionException('Connection refused');
            },
        ]);

        $response = $this->getJson('/api/health');

        $response->assertStatus(200)
            ->assertJsonPath('status', 'degraded')
            ->assertJsonPath('db.status', 'ok')
            ->assertJsonPath('ml.status', 'error');
    }

    public function test_health_endpoint_marks_ml_red_when_x_ml_key_is_rejected(): void
    {
        Http::fake([
            '127.0.0.1:8001/health' => Http::response([
                'detail' => 'Header X-ML-KEY tidak valid atau tidak disertakan.',
            ], 401),
        ]);

        $response = $this->getJson('/api/health');

        $response->assertStatus(200)
            ->assertJsonPath('status', 'degraded')
            ->assertJsonPath('db.status', 'ok')
            ->assertJsonPath('ml.status', 'error');
    }
}
