<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PrioritasRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'bulan' => ['nullable', 'integer', 'min:1', 'max:12'],
            'kategori' => [
                'nullable',
                'string',
                Rule::in([
                    'Normal',
                    'Sporadis',
                    'Berulang',
                    'Konsisten tinggi',
                    'Data kurang',
                    'Tidak dinilai',
                    'semua',
                ]),
            ],
            'q' => ['nullable', 'string', 'max:100'],
            'sort' => [
                'nullable',
                'string',
                Rule::in([
                    'prioritas',
                    'maks_lof',
                    'maks_lof_desc',
                    'maks_lof_asc',
                    'bulan_flag',
                    'bulan_flag_desc',
                    'kode',
                    'kode_asc',
                    'kode_desc',
                    'lof_bulan_desc',
                ]),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'bulan.integer' => 'Parameter bulan harus berupa angka bulat (1 sampai 10).',
            'bulan.min' => 'Bulan minimal bernilai 1 (Januari).',
            'bulan.max' => 'Bulan maksimal bernilai 10 (Oktober).',
            'kategori.in' => 'Kategori tidak dikenal. Pilih: Normal, Sporadis, Berulang, Konsisten tinggi, Data kurang, atau Tidak dinilai.',
            'sort.in' => 'Parameter pengurutan tidak valid.',
        ];
    }
}
