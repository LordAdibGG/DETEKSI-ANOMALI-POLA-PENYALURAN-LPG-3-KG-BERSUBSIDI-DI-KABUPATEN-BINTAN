<?php

namespace App\Services;

use App\Models\FiturBulanan;

class AlasanPenandaanService
{
    private const NAMA_BULAN = [
        1 => 'Jan',
        2 => 'Feb',
        3 => 'Mar',
        4 => 'Apr',
        5 => 'Mei',
        6 => 'Jun',
        7 => 'Jul',
        8 => 'Agu',
        9 => 'Sep',
        10 => 'Okt',
    ];

    /**
     * Hasilkan kalimat alasan berbahasa Indonesia berdasarkan fitur dengan |z| terbesar.
     *
     * Contoh format: "variasi harian jauh di atas pangkalan lain (z 5,65)"
     *
     * @return array{kalimat: string, fitur: string|null, z: float|null, bulan: int|null, label_bulan: string|null}
     */
    public function buatAlasan(?FiturBulanan $fitur, ?int $bulan = null, bool $nolSebulan = false): array
    {
        $labelBulan = $bulan ? (self::NAMA_BULAN[$bulan] ?? (string) $bulan) : null;

        if ($nolSebulan || $fitur === null) {
            return [
                'kalimat' => $nolSebulan
                    ? 'tidak ada penyaluran sepanjang bulan (volume 0 tabung)'
                    : 'tidak dinilai dalam model LOF',
                'fitur' => null,
                'z' => null,
                'bulan' => $bulan,
                'label_bulan' => $labelBulan,
            ];
        }

        $kandidat = [
            'cv_harian' => $fitur->z_cv_harian,
            'log_total' => $fitur->z_log_total,
            'rasio_hari_aktif' => $fitur->z_rasio_hari_aktif,
            'porsi_nilai_dominan' => $fitur->z_porsi_nilai_dominan,
        ];

        $fiturTerbesar = null;
        $zTerbesar = null;
        $absMaks = -1.0;

        foreach ($kandidat as $namaFitur => $nilaiZ) {
            if ($nilaiZ === null) {
                continue;
            }
            $abs = abs((float) $nilaiZ);
            if ($abs > $absMaks) {
                $absMaks = $abs;
                $fiturTerbesar = $namaFitur;
                $zTerbesar = (float) $nilaiZ;
            }
        }

        if ($fiturTerbesar === null || $zTerbesar === null) {
            return [
                'kalimat' => 'tidak ada simpangan fitur yang menonjol',
                'fitur' => null,
                'z' => null,
                'bulan' => $bulan,
                'label_bulan' => $labelBulan,
            ];
        }

        return [
            'kalimat' => self::formatKalimatFitur($fiturTerbesar, $zTerbesar),
            'fitur' => $fiturTerbesar,
            'z' => round($zTerbesar, 2),
            'bulan' => $bulan,
            'label_bulan' => $labelBulan,
        ];
    }

    public static function formatKalimatFitur(string $fitur, float $z): string
    {
        $zFormatted = number_format($z, 2, ',', '.');
        $arah = $z >= 0 ? 'jauh di atas' : 'jauh di bawah';

        $deskripsiFitur = match ($fitur) {
            'cv_harian' => 'variasi harian',
            'log_total' => 'volume penyaluran bulanan',
            'rasio_hari_aktif' => 'frekuensi hari aktif',
            'porsi_nilai_dominan' => 'pengulangan angka penyaluran harian',
            default => $fitur,
        };

        return "{$deskripsiFitur} {$arah} pangkalan lain (z {$zFormatted})";
    }
}
