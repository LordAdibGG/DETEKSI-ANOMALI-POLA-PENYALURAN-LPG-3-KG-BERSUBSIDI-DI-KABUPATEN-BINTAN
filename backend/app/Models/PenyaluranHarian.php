<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PenyaluranHarian extends Model
{
    protected $table = 'penyaluran_harian';

    public $timestamps = false;

    protected $fillable = [
        'laporan_id',
        'tanggal',
        'hari',
        'is_minggu',
        'volume',
    ];

    protected function casts(): array
    {
        return [
            'tanggal' => 'date:Y-m-d',
            'is_minggu' => 'boolean',
        ];
    }

    public function laporan(): BelongsTo
    {
        return $this->belongsTo(LaporanBulanan::class, 'laporan_id');
    }
}
