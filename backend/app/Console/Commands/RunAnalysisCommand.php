<?php

namespace App\Console\Commands;

use App\Exceptions\MlServiceUnavailableException;
use App\Services\AnalysisService;
use Illuminate\Console\Command;

class RunAnalysisCommand extends Command
{
    protected $signature = 'analysis:run {--k=10 : Jumlah tetangga terdekat LOF} {--thr=1.5 : Ambang batas penandaan LOF} {--nama= : Nama unik analysis_run}';

    protected $description = 'Jalankan perhitungan LOF melalui ml-service Python dan simpan analysis_run baru di MySQL.';

    public function handle(AnalysisService $analysisService): int
    {
        $k = (int) $this->option('k');
        $thr = (float) $this->option('thr');
        $nama = $this->option('nama') ? (string) $this->option('nama') : null;

        $this->info("Menghubungi ml-service untuk menjalankan LOF (k={$k}, threshold={$thr})...");

        try {
            $result = $analysisService->executeRun(
                k: $k,
                threshold: $thr,
                nama: $nama,
            );
        } catch (MlServiceUnavailableException $e) {
            $this->error($e->getMessage());
            return self::FAILURE;
        }

        $runInfo = $result['run'];
        $ringkasan = $result['ringkasan'];
        $jaccard = $result['jaccard_vs_baseline'];

        $this->info("Run '{$runInfo['nama']}' (ID: {$runInfo['id']}) berhasil disimpan.");
        $this->line(" - Masuk model : " . ($ringkasan['masuk_model'] ?? '-'));
        $this->line(" - Ditandai    : " . ($ringkasan['ditandai'] ?? '-'));
        $this->line(" - Jaccard vs baseline-k10 : " . ($jaccard !== null ? number_format($jaccard, 2, ',', '.') : '-'));

        return self::SUCCESS;
    }
}
