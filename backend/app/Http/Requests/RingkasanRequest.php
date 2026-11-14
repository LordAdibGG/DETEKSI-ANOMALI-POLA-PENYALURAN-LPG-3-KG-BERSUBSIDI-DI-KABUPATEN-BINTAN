<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RingkasanRequest extends FormRequest
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
        ];
    }
}
