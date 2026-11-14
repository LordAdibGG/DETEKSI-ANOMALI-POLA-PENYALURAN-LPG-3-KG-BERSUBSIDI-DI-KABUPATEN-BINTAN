<?php

use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        //
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (\Throwable $e, Request $request) {
            if (!$request->is('api/*') && !$request->expectsJson()) {
                return null;
            }

            if ($e instanceof ValidationException) {
                return response()->json([
                    'message' => 'Data permintaan tidak valid.',
                    'errors' => $e->errors(),
                    'error' => [
                        'code' => 'VALIDATION_ERROR',
                        'message' => 'Data permintaan tidak valid.',
                        'details' => $e->errors(),
                    ],
                    'meta' => [
                        'status' => 422,
                        'timestamp' => now()->toIso8601String(),
                    ],
                ], 422);
            }

            if ($e instanceof AuthenticationException) {
                return response()->json([
                    'message' => 'Otentikasi diperlukan. Sertakan Bearer token yang valid.',
                    'error' => [
                        'code' => 'UNAUTHENTICATED',
                        'message' => 'Otentikasi diperlukan. Sertakan Bearer token yang valid.',
                    ],
                    'meta' => [
                        'status' => 401,
                        'timestamp' => now()->toIso8601String(),
                    ],
                ], 401);
            }

            if ($e instanceof AccessDeniedHttpException) {
                return response()->json([
                    'message' => 'Akses ditolak untuk peran pengguna saat ini.',
                    'error' => [
                        'code' => 'FORBIDDEN',
                        'message' => 'Akses ditolak untuk peran pengguna saat ini.',
                    ],
                    'meta' => [
                        'status' => 403,
                        'timestamp' => now()->toIso8601String(),
                    ],
                ], 403);
            }

            if ($e instanceof ModelNotFoundException || $e instanceof NotFoundHttpException) {
                return response()->json([
                    'message' => 'Data atau titik akses yang diminta tidak ditemukan.',
                    'error' => [
                        'code' => 'NOT_FOUND',
                        'message' => 'Data atau titik akses yang diminta tidak ditemukan.',
                    ],
                    'meta' => [
                        'status' => 404,
                        'timestamp' => now()->toIso8601String(),
                    ],
                ], 404);
            }

            if ($e instanceof ThrottleRequestsException) {
                return response()->json([
                    'message' => 'Terlalu banyak percobaan. Silakan tunggu beberapa saat sebelum mencoba kembali.',
                    'error' => [
                        'code' => 'TOO_MANY_REQUESTS',
                        'message' => 'Terlalu banyak percobaan. Silakan tunggu beberapa saat sebelum mencoba kembali.',
                    ],
                    'meta' => [
                        'status' => 429,
                        'timestamp' => now()->toIso8601String(),
                    ],
                ], 429);
            }

            if ($e instanceof \App\Exceptions\MlServiceUnavailableException) {
                return response()->json([
                    'message' => $e->getMessage(),
                    'error' => [
                        'code' => 'ML_SERVICE_UNAVAILABLE',
                        'message' => $e->getMessage(),
                    ],
                    'meta' => [
                        'status' => 503,
                        'timestamp' => now()->toIso8601String(),
                    ],
                ], 503);
            }

            return null;
        });
    })->create();
