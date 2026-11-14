<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('users') && !Schema::hasColumn('users', 'role')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('role', 20)->default('petugas')->after('email')->index();
            });
        }

        Schema::create('agen', function (Blueprint $table) {
            $table->id();
            $table->string('kode', 20)->unique();
            $table->string('nama');
            $table->string('alamat')->nullable();
            $table->timestamps();
        });

        Schema::create('pangkalan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agen_id')->nullable()->constrained('agen')->nullOnDelete();
            $table->string('kode', 10)->unique(); // P01 - P30
            $table->string('id_registrasi', 32)->unique();
            $table->string('nama');
            $table->string('kecamatan', 100)->nullable()->index();
            $table->string('kelurahan', 100)->nullable();
            $table->string('sumber_kecamatan', 100)->nullable();
            $table->boolean('non_reguler')->default(false)->index();
            $table->timestamps();
        });

        Schema::create('laporan_bulanan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pangkalan_id')->constrained('pangkalan')->cascadeOnDelete();
            $table->unsignedTinyInteger('bulan'); // 1..10 (Jan..Okt)
            $table->unsignedSmallInteger('tahun')->default(2026);
            $table->integer('alokasi');
            $table->integer('total_normal');
            $table->integer('fakultatif')->default(0);
            $table->integer('grand_total');
            $table->integer('sisa_alokasi');
            $table->unsignedTinyInteger('hari_aktif')->default(0);
            $table->unsignedTinyInteger('n_hari_kerja')->default(26);
            $table->timestamps();

            $table->unique(['pangkalan_id', 'bulan'], 'uq_laporan_pangkalan_bulan');
            $table->index(['bulan', 'pangkalan_id'], 'idx_bulan_pangkalan');
        });

        Schema::create('penyaluran_harian', function (Blueprint $table) {
            $table->id();
            $table->foreignId('laporan_id')->constrained('laporan_bulanan')->cascadeOnDelete();
            $table->date('tanggal');
            $table->unsignedTinyInteger('hari'); // 1..31
            $table->boolean('is_minggu')->default(false);
            $table->integer('volume')->default(0);

            $table->unique(['laporan_id', 'tanggal'], 'uq_harian_laporan_tanggal');
            $table->index(['laporan_id', 'hari'], 'idx_harian_laporan_hari');
        });

        Schema::create('analysis_runs', function (Blueprint $table) {
            $table->id();
            $table->string('nama', 100)->unique(); // e.g. baseline-k10
            $table->unsignedSmallInteger('k')->default(10);
            $table->double('threshold')->default(1.5);
            $table->json('fitur');
            $table->text('catatan')->nullable();
            $table->timestamp('dibuat')->useCurrent();
            $table->timestamps();
        });

        Schema::create('fitur_bulanan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('run_id')->constrained('analysis_runs')->cascadeOnDelete();
            $table->foreignId('laporan_id')->constrained('laporan_bulanan')->cascadeOnDelete();
            // 4 fitur mentah
            $table->double('log_total')->nullable();
            $table->double('cv_harian')->nullable();
            $table->double('rasio_hari_aktif')->nullable();
            $table->double('porsi_nilai_dominan')->nullable();
            // 4 z-score robust per bulan
            $table->double('z_log_total')->nullable();
            $table->double('z_cv_harian')->nullable();
            $table->double('z_rasio_hari_aktif')->nullable();
            $table->double('z_porsi_nilai_dominan')->nullable();
            $table->timestamps();

            $table->unique(['run_id', 'laporan_id'], 'uq_fitur_run_laporan');
        });

        Schema::create('hasil_lof', function (Blueprint $table) {
            $table->id();
            $table->foreignId('run_id')->constrained('analysis_runs')->cascadeOnDelete();
            $table->foreignId('laporan_id')->constrained('laporan_bulanan')->cascadeOnDelete();
            $table->double('lof')->nullable()->index();
            $table->boolean('flag')->default(false)->index();
            $table->timestamps();

            $table->unique(['run_id', 'laporan_id'], 'uq_lof_run_laporan');
        });

        Schema::create('klasifikasi_pangkalan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('run_id')->constrained('analysis_runs')->cascadeOnDelete();
            $table->foreignId('pangkalan_id')->constrained('pangkalan')->cascadeOnDelete();
            $table->string('kategori', 64)->index(); // Normal | Sporadis | Berulang | Konsisten tinggi | Data kurang | Tidak dinilai
            $table->string('kategori_label', 100)->nullable(); // label asli dari CSV
            $table->unsignedTinyInteger('bulan_valid')->default(0);
            $table->unsignedTinyInteger('bulan_flag')->default(0);
            $table->double('proporsi_flag')->nullable();
            $table->double('rerata_lof')->nullable();
            $table->double('maks_lof')->nullable();
            $table->string('bulan_maks', 16)->nullable();
            $table->string('bulan_yang_ditandai')->nullable();
            $table->unsignedTinyInteger('run_terpanjang')->default(0);
            $table->timestamps();

            $table->unique(['run_id', 'pangkalan_id'], 'uq_klasifikasi_run_pangkalan');
        });

        Schema::create('flag_aturan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('laporan_id')->constrained('laporan_bulanan')->cascadeOnDelete();
            $table->string('jenis', 50)->index(); // melebihi_alokasi | gt_2x_alokasi | nol | lonjakan | seragam | fakultatif
            $table->timestamps();

            $table->unique(['laporan_id', 'jenis'], 'uq_flag_aturan_laporan_jenis');
        });

        Schema::create('tindak_lanjut', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pangkalan_id')->constrained('pangkalan')->cascadeOnDelete();
            $table->string('status', 50)->default('belum_diperiksa')->index();
            $table->text('catatan')->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['pangkalan_id', 'status']);
        });

        Schema::create('audit_log', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('aksi', 100)->index();
            $table->string('entitas', 100)->nullable();
            $table->unsignedBigInteger('entitas_id')->nullable();
            $table->json('detail')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('audit_log');
        Schema::dropIfExists('tindak_lanjut');
        Schema::dropIfExists('flag_aturan');
        Schema::dropIfExists('klasifikasi_pangkalan');
        Schema::dropIfExists('hasil_lof');
        Schema::dropIfExists('fitur_bulanan');
        Schema::dropIfExists('analysis_runs');
        Schema::dropIfExists('penyaluran_harian');
        Schema::dropIfExists('laporan_bulanan');
        Schema::dropIfExists('pangkalan');
        Schema::dropIfExists('agen');
    }
};
