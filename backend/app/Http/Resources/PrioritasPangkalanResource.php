<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PrioritasPangkalanResource extends JsonResource
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
            'id_registrasi' => $this->when($isAdmin, $this->resource['id_registrasi']),
            'kecamatan' => $this->resource['kecamatan'],
            'kelurahan' => $this->resource['kelurahan'],
            'non_reguler' => $this->resource['non_reguler'],
            'kategori' => $this->resource['kategori'],
            'kategori_label' => $this->resource['kategori_label'],
            'bulan_valid' => $this->resource['bulan_valid'],
            'bulan_flag' => $this->resource['bulan_flag'],
            'proporsi_flag' => $this->resource['proporsi_flag'],
            'rerata_lof' => $this->resource['rerata_lof'],
            'maks_lof' => $this->resource['maks_lof'],
            'bulan_maks' => $this->resource['bulan_maks'],
            'run_terpanjang' => $this->resource['run_terpanjang'],
            'lof_bulan_dipilih' => $this->resource['lof_bulan_dipilih'],
            'flag_bulan_dipilih' => $this->resource['flag_bulan_dipilih'],
            'strip_10_bulan' => $this->resource['strip_10_bulan'],
            'flag_aturan' => $this->resource['flag_aturan'],
            'alasan' => $this->resource['alasan'],
            'alasan_detail' => $this->resource['alasan_detail'],
            'tindak_lanjut_status' => $this->resource['tindak_lanjut_status'],
        ];
    }
}
