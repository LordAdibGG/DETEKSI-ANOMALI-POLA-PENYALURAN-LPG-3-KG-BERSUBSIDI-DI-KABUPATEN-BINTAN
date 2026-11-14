<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FiturBulanan extends Model
{
    protected $table = 'fitur_bulanan';

    protected $fillable = [
        'run_id',
        'laporan_id',
        'log_total',
        'cv_harian',
        'rasio_hari_aktif',
        'porsi_nilai_dominan',
        'z_log_total',
        'z_cv_harian',
        'z_rasio_hari_aktif',
        'z_porsi_nilai_dominan',
    ];

    protected function casts(): array
    {
        return [
            'log_total' => 'float',
            'cv_harian' => 'float',
            'rasio_hari_aktif' => 'float',
            'porsi_nilai_dominan' => 'float',
            'z_log_total' => 'float',
            'z_cv_harian' => 'float',
            'z_rasio_hari_aktif' => 'float',
            'z_porsi_nilai_dominan' => 'float',
        ];
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(AnalysisRun::class, 'run_id');
    }

    public function laporan(): BelongsTo
    {
        return $this->belongsTo(LaporanBulanan::class, 'laporan_id');
    }
}
