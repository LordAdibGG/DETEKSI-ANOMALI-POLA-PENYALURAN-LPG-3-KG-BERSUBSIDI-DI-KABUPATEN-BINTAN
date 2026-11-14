<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LaporanBulanan extends Model
{
    protected $table = 'laporan_bulanan';

    protected $fillable = [
        'pangkalan_id',
        'bulan',
        'tahun',
        'alokasi',
        'total_normal',
        'fakultatif',
        'grand_total',
        'sisa_alokasi',
        'hari_aktif',
        'n_hari_kerja',
    ];

    public function pangkalan(): BelongsTo
    {
        return $this->belongsTo(Pangkalan::class, 'pangkalan_id');
    }

    public function penyaluranHarian(): HasMany
    {
        return $this->hasMany(PenyaluranHarian::class, 'laporan_id');
    }

    public function fiturBulanan(): HasMany
    {
        return $this->hasMany(FiturBulanan::class, 'laporan_id');
    }

    public function hasilLof(): HasMany
    {
        return $this->hasMany(HasilLof::class, 'laporan_id');
    }

    public function flagAturan(): HasMany
    {
        return $this->hasMany(FlagAturan::class, 'laporan_id');
    }
}
