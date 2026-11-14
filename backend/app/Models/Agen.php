<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Agen extends Model
{
    protected $table = 'agen';

    protected $fillable = [
        'kode',
        'nama',
        'alamat',
    ];

    public function pangkalan(): HasMany
    {
        return $this->hasMany(Pangkalan::class, 'agen_id');
    }
}
