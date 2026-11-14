<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Pangkalan extends Model
{
    protected $table = 'pangkalan';

    protected $fillable = [
        'agen_id',
        'kode',
        'id_registrasi',
        'nama',
        'kecamatan',
        'kelurahan',
        'sumber_kecamatan',
        'non_reguler',
    ];

    protected function casts(): array
    {
        return [
            'non_reguler' => 'boolean',
        ];
    }

    public function agen(): BelongsTo
    {
        return $this->belongsTo(Agen::class, 'agen_id');
    }

    public function laporanBulanan(): HasMany
    {
        return $this->hasMany(LaporanBulanan::class, 'pangkalan_id');
    }

    public function klasifikasi(): HasMany
    {
        return $this->hasMany(KlasifikasiPangkalan::class, 'pangkalan_id');
    }

    public function tindakLanjut(): HasMany
    {
        return $this->hasMany(TindakLanjut::class, 'pangkalan_id');
    }
}
