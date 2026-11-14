<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class HeatmapRowResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $isAdmin = (bool) $request->user()?->isAdmin();

        return [
            'kode' => $this->resource['kode'],
            'nama' => $this->when($isAdmin, $this->resource['nama']),
            'kecamatan' => $this->resource['kecamatan'],
            'non_reguler' => $this->resource['non_reguler'],
            'kategori' => $this->resource['kategori'],
            'kategori_label' => $this->resource['kategori_label'],
            'bulan_valid' => $this->resource['bulan_valid'],
            'bulan_flag' => $this->resource['bulan_flag'],
            'maks_lof' => $this->resource['maks_lof'],
            'run_terpanjang' => $this->resource['run_terpanjang'],
            'sel' => $this->resource['sel'],
        ];
    }
}
