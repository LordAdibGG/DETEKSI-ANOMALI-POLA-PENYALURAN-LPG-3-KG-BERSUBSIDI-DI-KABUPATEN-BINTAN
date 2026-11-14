<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HasilLof extends Model
{
    protected $table = 'hasil_lof';

    protected $fillable = [
        'run_id',
        'laporan_id',
        'lof',
        'flag',
    ];

    protected function casts(): array
    {
        return [
            'lof' => 'float',
            'flag' => 'boolean',
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
