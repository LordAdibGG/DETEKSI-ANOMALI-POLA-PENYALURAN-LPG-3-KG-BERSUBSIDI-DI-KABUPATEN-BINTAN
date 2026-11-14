<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProfilPangkalanResource extends JsonResource
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
            'agen' => $this->resource['agen'],
            'kecamatan' => $this->resource['kecamatan'],
            'kelurahan' => $this->resource['kelurahan'],
            'sumber_kecamatan' => $this->resource['sumber_kecamatan'],
            'non_reguler' => $this->resource['non_reguler'],
            'klasifikasi' => $this->resource['klasifikasi'],
            'alasan_utama' => $this->resource['alasan_utama'],
            'flag_aturan_ringkasan' => $this->resource['flag_aturan_ringkasan'],
            'laporan_bulanan' => $this->resource['laporan_bulanan'],
            'tindak_lanjut' => $this->resource['tindak_lanjut'],
        ];
    }
}
