<?php

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->validated();

        $user = User::where('email', $credentials['email'])->first();

        if (!$user || !Hash::check($credentials['password'], $user->password)) {
            return response()->json([
                'message' => 'Surel atau kata sandi tidak sesuai.',
                'error' => [
                    'code' => 'INVALID_CREDENTIALS',
                    'message' => 'Surel atau kata sandi tidak sesuai.',
                ],
                'meta' => [
                    'status' => 401,
                    'timestamp' => now()->toIso8601String(),
                ],
            ], 401);
        }

        $token = $user->createToken('lembar-pantau-token', [$user->role])->plainTextToken;

        AuditLog::create([
            'user_id' => $user->id,
            'aksi' => 'auth.login',
            'entitas' => 'users',
            'entitas_id' => $user->id,
            'detail' => ['role' => $user->role],
            'ip_address' => $request->ip(),
        ]);

        return response()->json([
            'data' => [
                'token' => $token,
                'token_type' => 'Bearer',
                'user' => (new UserResource($user))->resolve($request),
            ],
            'meta' => [
                'message' => 'Berhasil masuk ke Lembar Pantau.',
                'timestamp' => now()->toIso8601String(),
            ],
        ], 200);
    }

    public function logout(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $user->currentAccessToken()?->delete();

        AuditLog::create([
            'user_id' => $user->id,
            'aksi' => 'auth.logout',
            'entitas' => 'users',
            'entitas_id' => $user->id,
            'detail' => ['role' => $user->role],
            'ip_address' => $request->ip(),
        ]);

        return response()->json([
            'data' => [
                'logged_out' => true,
            ],
            'meta' => [
                'message' => 'Sesi pengawasan telah diakhiri.',
                'timestamp' => now()->toIso8601String(),
            ],
        ], 200);
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => (new UserResource($user))->resolve($request),
            'meta' => [
                'role' => $user->role,
                'timestamp' => now()->toIso8601String(),
            ],
        ], 200);
    }
}
