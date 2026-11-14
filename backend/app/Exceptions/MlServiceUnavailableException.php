<?php

namespace App\Exceptions;

use RuntimeException;

class MlServiceUnavailableException extends RuntimeException
{
    public function __construct(
        string $message = 'Layanan perhitungan LOF (Python) sedang tidak dapat dihubungi. Data hasil analisis sebelumnya tetap tersedia dan dapat dibaca.',
        int $code = 503,
        ?\Throwable $previous = null
    ) {
        parent::__construct($message, $code, $previous);
    }
}
