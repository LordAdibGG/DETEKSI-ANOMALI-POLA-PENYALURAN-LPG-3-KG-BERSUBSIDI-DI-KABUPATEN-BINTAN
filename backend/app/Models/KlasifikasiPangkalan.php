<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KlasifikasiPangkalan extends Model
{
    protected $table = 'klasifikasi_pangkalan';

    protected $fillable = [
        'run_id',
        'pangkalan_id',
        'kategori',
        'kategori_label',
        'bulan_valid',
        'bulan_flag',
        'proporsi_flag',
        'rerata_lof',
        'maks_lof',
        'bulan_maks',
        'bulan_yang_ditandai',
        'run_terpanjang',
    ];

    protected function casts(): array
    {
        return [
            'bulan_valid' => 'integer',
            'bulan_flag' => 'integer',
            'proporsi_flag' => 'float',
            'rerata_lof' => 'float',
            'maks_lof' => 'float',
            'run_terpanjang' => 'integer',
        ];
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(AnalysisRun::class, 'run_id');
    }

    public function pangkalan(): BelongsTo
    {
        return $this->belongsTo(Pangkalan::class, 'pangkalan_id');
    }
}
