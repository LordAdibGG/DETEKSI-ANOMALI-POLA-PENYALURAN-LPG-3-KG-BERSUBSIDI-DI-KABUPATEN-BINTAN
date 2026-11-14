<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MetodeResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'parameter' => $this->resource['parameter'],
            'aturan_klasifikasi' => $this->resource['aturan_klasifikasi'],
            'definisi_flag_aturan' => $this->resource['definisi_flag_aturan'],
            'keterbatasan' => $this->resource['keterbatasan'],
            'evaluasi_lof' => $this->resource['evaluasi_lof'],
            'ringkasan_per_bulan' => $this->resource['ringkasan_per_bulan'],
        ];
    }
}
