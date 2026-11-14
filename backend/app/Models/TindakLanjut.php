<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TindakLanjut extends Model
{
    protected $table = 'tindak_lanjut';

    protected $fillable = [
        'pangkalan_id',
        'status',
        'catatan',
        'user_id',
    ];

    public function pangkalan(): BelongsTo
    {
        return $this->belongsTo(Pangkalan::class, 'pangkalan_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
