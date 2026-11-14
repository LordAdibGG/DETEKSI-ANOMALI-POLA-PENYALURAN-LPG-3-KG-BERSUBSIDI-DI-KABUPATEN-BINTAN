<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FlagAturan extends Model
{
    protected $table = 'flag_aturan';

    protected $fillable = [
        'laporan_id',
        'jenis',
    ];

    public function laporan(): BelongsTo
    {
        return $this->belongsTo(LaporanBulanan::class, 'laporan_id');
    }
}
