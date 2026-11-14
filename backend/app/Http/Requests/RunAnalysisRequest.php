<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RunAnalysisRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->isAdmin();
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'k' => ['nullable', 'integer', 'min:2', 'max:28'],
            'threshold' => ['nullable', 'numeric', 'min:0.5', 'max:10.0'],
            'top_n' => ['nullable', 'integer', 'min:1', 'max:30'],
            'fallback_local' => ['nullable', 'boolean'],
            'nama' => ['nullable', 'string', 'max:100'],
            'catatan' => ['nullable', 'string', 'max:500'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'k.integer' => 'Parameter k harus berupa bilangan bulat.',
            'k.min' => 'Nilai tetangga k minimal 2.',
            'k.max' => 'Nilai tetangga k maksimal 28.',
            'threshold.numeric' => 'Ambang penandaan (threshold) harus berupa angka.',
            'threshold.min' => 'Ambang penandaan minimal 0,5.',
        ];
    }
}
