<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AnalysisRun extends Model
{
    protected $table = 'analysis_runs';

    protected $fillable = [
        'nama',
        'k',
        'threshold',
        'fitur',
        'catatan',
        'dibuat',
    ];

    protected function casts(): array
    {
        return [
            'k' => 'integer',
            'threshold' => 'float',
            'fitur' => 'array',
            'dibuat' => 'datetime',
        ];
    }

    public function fiturBulanan(): HasMany
    {
        return $this->hasMany(FiturBulanan::class, 'run_id');
    }

    public function hasilLof(): HasMany
    {
        return $this->hasMany(HasilLof::class, 'run_id');
    }

    public function klasifikasiPangkalan(): HasMany
    {
        return $this->hasMany(KlasifikasiPangkalan::class, 'run_id');
    }
}
