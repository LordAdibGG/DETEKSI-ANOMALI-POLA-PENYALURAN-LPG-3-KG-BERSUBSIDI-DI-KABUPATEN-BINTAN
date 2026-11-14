<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database (1 admin dan 1 petugas, idempoten).
     */
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'admin@bintankab.go.id'],
            [
                'name' => 'Admin Bagian Perekonomian Setda Bintan',
                'role' => 'admin',
                'password' => Hash::make('admin123'),
                'email_verified_at' => now(),
            ]
        );

        User::updateOrCreate(
            ['email' => 'petugas@bintankab.go.id'],
            [
                'name' => 'Petugas Tim Monev LPG Bintan',
                'role' => 'petugas',
                'password' => Hash::make('petugas123'),
                'email_verified_at' => now(),
            ]
        );
    }
}
