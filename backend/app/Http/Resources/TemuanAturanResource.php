<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TemuanAturanResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $isAdmin = (bool) $request->user()?->isAdmin();

        return [
            'id' => $this->resource['id'],
            'jenis' => $this->resource['jenis'],
            'label_jenis' => $this->resource['label_jenis'],
            'bulan' => $this->resource['bulan'],
            'label_bulan' => $this->resource['label_bulan'],
            'kode' => $this->resource['kode'],
            'nama' => $this->when($isAdmin, $this->resource['nama']),
            'kecamatan' => $this->resource['kecamatan'],
            'kategori' => $this->resource['kategori'],
            'alokasi' => $this->resource['alokasi'],
            'total_normal' => $this->resource['total_normal'],
            'fakultatif' => $this->resource['fakultatif'],
            'grand_total' => $this->resource['grand_total'],
            'sisa_alokasi' => $this->resource['sisa_alokasi'],
            'hari_aktif' => $this->resource['hari_aktif'],
            'lof' => $this->resource['lof'],
            'flag_lof' => $this->resource['flag_lof'],
            'penjelasan' => $this->resource['penjelasan'],
        ];
    }
}
