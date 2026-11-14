<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RingkasanResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'bulan' => $this->resource['bulan'],
            'label_bulan' => $this->resource['label_bulan'],
            'jumlah_pangkalan' => $this->resource['jumlah_pangkalan'],
            'jumlah_observasi' => $this->resource['jumlah_observasi'],
            'jumlah_dinilai' => $this->resource['jumlah_dinilai'],
            'jumlah_tidak_dinilai' => $this->resource['jumlah_tidak_dinilai'],
            'jumlah_ditandai' => $this->resource['jumlah_ditandai'],
            'per_kategori' => $this->resource['per_kategori'],
            'sebaran_lof' => $this->resource['sebaran_lof'],
            'ditandai_per_bulan' => $this->resource['ditandai_per_bulan'],
            'flag_aturan' => $this->resource['flag_aturan'],
        ];
    }
}
