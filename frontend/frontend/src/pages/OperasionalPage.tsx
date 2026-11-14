import { useState, type ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  buildPrioritasCsvString,
  fetchAuditLogs,
  fetchDaftarTindakLanjut,
  fetchValidasiUnggah,
  generateContohBulanFiktifCsv,
  getRuntimeAuditLogs,
  getRuntimeDaftarTindakLanjut,
  getRuntimeRuns,
  getSnapshotPrioritas,
  postKonfirmasiUnggah,
  postRunAnalisisParameter,
  postSimpanTindakLanjut,
  resetOperasionalRuntime,
  STATUS_TINDAK_LANJUT_LABELS,
  validasiLaporanBulananClient,
  type AnalysisRunSummaryItem,
  type PerbandinganBaselineData,
  type TindakLanjutStatus,
  type ValidasiUnggahResponse,
} from '../api/pantau';
import { formatIndonesianNumber } from '../components/motion/Primitives';
import { Angka } from '../components/ui/Angka';
import { AturanGaris } from '../components/ui/AturanGaris';
import { Button } from '../components/ui/Button';
import { TagKategori } from '../components/ui/TagKategori';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';

export function OperasionalPage() {
  const { user, token } = useAuth();
  const role = user?.role ?? 'admin';
  const isAdmin = role === 'admin';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  // 1. State Unggah & Validasi 4 Cek
  const [csvText, setCsvText] = useState<string>('');
  const [expectedTotalAgenInput, setExpectedTotalAgenInput] = useState<string>('');
  const [validasiResult, setValidasiResult] = useState<ValidasiUnggahResponse | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);

  // 2. State Panel Parameter Admin (k, threshold, atau mode Top-N)
  const [paramMode, setParamMode] = useState<'threshold' | 'top_n'>('threshold');
  const [paramK, setParamK] = useState<number>(10);
  const [paramThreshold, setParamThreshold] = useState<number>(1.5);
  const [paramTopN, setParamTopN] = useState<number>(5);
  const [paramNamaRun, setParamNamaRun] = useState<string>('');
  const [isRunningParam, setIsRunningParam] = useState<boolean>(false);

  const [runsList, setRunsList] = useState<AnalysisRunSummaryItem[]>(() => getRuntimeRuns(role));
  const activeRun = runsList[0];
  const activeComparison: PerbandinganBaselineData = activeRun.perbandingan_baseline;

  // 3. State Tindak Lanjut
  const [selectedKodeTl, setSelectedKodeTl] = useState<string>('P10');
  const [selectedStatusTl, setSelectedStatusTl] =
    useState<TindakLanjutStatus>('perlu_klarifikasi');
  const [catatanTl, setCatatanTl] = useState<string>('');
  const [isSavingTl, setIsSavingTl] = useState<boolean>(false);

  const { data: tindakLanjutData, refetch: refetchTindakLanjut } = useQuery({
    queryKey: ['tindak-lanjut', role],
    queryFn: () => fetchDaftarTindakLanjut(role, token),
    initialData: () => getRuntimeDaftarTindakLanjut(role),
  });

  const { data: auditLogs = getRuntimeAuditLogs(), refetch: refetchAuditLogs } = useQuery({
    queryKey: ['audit-log', role],
    queryFn: () => fetchAuditLogs(role, token),
    initialData: () => getRuntimeAuditLogs(),
  });

  const syncRuntimeQueries = () => {
    setRunsList(getRuntimeRuns(role));
    queryClient.setQueryData(['tindak-lanjut', role], getRuntimeDaftarTindakLanjut(role));
    queryClient.setQueryData(['audit-log', role], getRuntimeAuditLogs());
  };

  const handleLoadContohFiktif = () => {
    const sample = generateContohBulanFiktifCsv(11);
    setCsvText(sample);
    const val = validasiLaporanBulananClient(sample, null, role);
    setValidasiResult(val);
    pushToast({
      judul: 'Contoh Bulan Fiktif Dimuat',
      deskripsi:
        'Data fiktif November 2026 (30 pangkalan) dimuat dan lulus keempat cek validasi.',
      nada: 'info',
    });
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      setCsvText(content);
      const expected =
        expectedTotalAgenInput.trim().length > 0
          ? Number.parseInt(expectedTotalAgenInput, 10)
          : null;
      const val = validasiLaporanBulananClient(content, expected, role);
      setValidasiResult(val);
    };
    reader.readAsText(file);
  };

  const handleRunValidasi = async () => {
    if (!csvText.trim()) {
      pushToast({
        judul: 'Berkas CSV Kosong',
        deskripsi: 'Pilih berkas CSV atau klik Muat Contoh Bulan Fiktif terlebih dahulu.',
        nada: 'anomali',
      });
      return;
    }
    setIsValidating(true);
    try {
      const expected =
        expectedTotalAgenInput.trim().length > 0
          ? Number.parseInt(expectedTotalAgenInput, 10)
          : null;
      const res = await fetchValidasiUnggah(csvText, expected, role, token);
      setValidasiResult(res);
    } finally {
      setIsValidating(false);
    }
  };

  const handleKonfirmasiUnggah = async () => {
    if (!validasiResult || !validasiResult.valid) return;
    setIsConfirming(true);
    try {
      const res = await postKonfirmasiUnggah({
        csvContent: csvText,
        k: paramK,
        threshold: paramThreshold,
        topN: paramMode === 'top_n' ? paramTopN : null,
        namaRun: paramNamaRun.trim() || `unggah-bln${validasiResult.bulan}-k${paramK}`,
        role,
        token,
      });

      syncRuntimeQueries();
      await queryClient.invalidateQueries({ queryKey: ['prioritas'] });
      await queryClient.invalidateQueries({ queryKey: ['ringkasan'] });
      await refetchTindakLanjut();
      await refetchAuditLogs();

      pushToast({
        judul: `Analisis ${validasiResult.nama_bulan} 2026 Selesai`,
        deskripsi: `Run baru "${res.run.nama}" tercipta. ${res.perbandingan_baseline.pangkalan_masuk.length} pangkalan baru masuk daftar prioritas.`,
        nada: 'berhasil',
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleRunParameter = async () => {
    setIsRunningParam(true);
    try {
      const res = await postRunAnalisisParameter({
        k: paramK,
        threshold: paramThreshold,
        topN: paramMode === 'top_n' ? paramTopN : null,
        nama: paramNamaRun.trim() || null,
        role,
        token,
      });

      syncRuntimeQueries();
      await queryClient.invalidateQueries({ queryKey: ['prioritas'] });
      await queryClient.invalidateQueries({ queryKey: ['ringkasan'] });
      await refetchTindakLanjut();
      await refetchAuditLogs();

      pushToast({
        judul: 'Run Analisis Baru Tercipta',
        deskripsi: `Run "${res.run.nama}" aktif (Jaccard pangkalan: ${formatIndonesianNumber(
          res.perbandingan_baseline.jaccard_pangkalan,
          2
        )}).`,
        nada: 'berhasil',
      });
    } finally {
      setIsRunningParam(false);
    }
  };

  const handleResetBaseline = async () => {
    resetOperasionalRuntime();
    syncRuntimeQueries();
    setValidasiResult(null);
    await queryClient.invalidateQueries({ queryKey: ['prioritas'] });
    await queryClient.invalidateQueries({ queryKey: ['ringkasan'] });
    await refetchTindakLanjut();
    await refetchAuditLogs();
    pushToast({
      judul: 'Kembali ke Baseline Acuan',
      deskripsi: 'Run aktif dikembalikan ke baseline-k10 (k=10, batas LOF 1,50).',
      nada: 'info',
    });
  };

  const handleSaveTindakLanjut = async () => {
    setIsSavingTl(true);
    try {
      await postSimpanTindakLanjut({
        kode: selectedKodeTl,
        status: selectedStatusTl,
        catatan: catatanTl,
        role,
        token,
      });
      setCatatanTl('');
      syncRuntimeQueries();
      await refetchTindakLanjut();
      await refetchAuditLogs();
      await queryClient.invalidateQueries({ queryKey: ['prioritas'] });
      await queryClient.invalidateQueries({ queryKey: ['profil-pangkalan'] });

      pushToast({
        judul: `Tindak Lanjut ${selectedKodeTl} Disimpan`,
        deskripsi: `Status diubah menjadi "${STATUS_TINDAK_LANJUT_LABELS[selectedStatusTl]}".`,
        nada: 'berhasil',
      });
    } finally {
      setIsSavingTl(false);
    }
  };

  const handleExportCsv = () => {
    const items = getSnapshotPrioritas({ sort: 'maks_lof_desc', role });
    const csvContent = buildPrioritasCsvString(items, role);
    syncRuntimeQueries();
    void refetchAuditLogs();

    if (typeof window !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prioritas-pemeriksaan-kjp-2026-${activeRun.nama}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    pushToast({
      judul: 'CSV Prioritas Diunduh',
      deskripsi: `Mengekspor ${items.length} baris pangkalan dan mencatat aksi ke Audit Log.`,
      nada: 'info',
    });
  };

  const selectedTlRow =
    tindakLanjutData.items.find((r) => r.kode === selectedKodeTl) ?? tindakLanjutData.items[0];

  return (
    <div data-testid="operasional-page">
      <div className="space-y-10">
        {/* KEPALA HALAMAN OPERASIONAL */}
        <header className="border-b-2 border-[var(--border-strong)] pb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 font-tabular text-xs uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1.5">
            <span>BAGIAN VI · OPERASIONAL PENGAWASAN &amp; SIKLUS EVALUASI</span>
            <span>
              RUN AKTIF:{' '}
              <strong data-testid="active-run-badge" className="text-[var(--accent-anomali-teks)]">
                {activeRun.nama}
              </strong>{' '}
              (k={activeRun.k}, batas={formatIndonesianNumber(activeRun.threshold, 2)})
            </span>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-[var(--text-ink)]">
                Meja Kerja Operasional: Unggah, Parameter, Tindak Lanjut &amp; Audit
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-1.5 max-w-3xl leading-relaxed">
                Kelola siklus bulanan pengawasan LPG 3 kg: validasi 4 cek laporan agen, jalankan
                analisis ulang dengan parameter kustom atau mode kapasitas Top-N, catat hasil
                pemeriksaan lapangan sebagai label evaluasi berikutnya, dan ekspor lembar kerja.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant="sekunder"
                size="sm"
                data-testid="btn-export-csv-operasional"
                onClick={handleExportCsv}
              >
                Unduh CSV Prioritas
              </Button>
              <Button
                variant="sekunder"
                size="sm"
                data-testid="btn-goto-prioritas"
                onClick={() => navigate('/prioritas')}
              >
                Lihat Daftar Prioritas →
              </Button>
            </div>
          </div>
        </header>

        {/* 1. UNGGAH LAPORAN BULANAN & VALIDASI 4 CEK */}
        <section
          aria-labelledby="heading-unggah-laporan"
          data-testid="section-unggah-laporan"
          className="space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <span className="font-tabular text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                1. UNGGAH LAPORAN BULANAN (FORMAT LEBAR KJP_2026_WIDE.CSV)
              </span>
              <h2
                id="heading-unggah-laporan"
                className="font-editorial text-2xl font-bold text-[var(--text-ink)]"
              >
                Validasi 4 Cek Aritmetika &amp; Konfirmasi Analisis Bulanan
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="sekunder"
                size="sm"
                data-testid="btn-muat-bulan-fiktif"
                onClick={handleLoadContohFiktif}
              >
                Muat Contoh Bulan Fiktif (Nov 2026)
              </Button>
              <Button
                variant="utama"
                size="sm"
                data-testid="btn-validasi-unggah"
                loading={isValidating}
                onClick={handleRunValidasi}
              >
                Periksa 4 Cek Validasi
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 border border-[var(--border-strong)] bg-[var(--surface-subtle)]/35 p-5">
            <div className="lg:col-span-5 space-y-3">
              <div>
                <label
                  htmlFor="file-upload-csv"
                  className="block font-tabular text-xs uppercase tracking-wider font-semibold text-[var(--text-ink)] mb-1"
                >
                  Pilih Berkas CSV / Excel (Format Lebar d01..d31)
                </label>
                <input
                  id="file-upload-csv"
                  data-testid="input-file-csv"
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="w-full text-xs font-tabular border border-[var(--border-rule)] bg-[var(--surface-paper)] p-2"
                />
              </div>

              <div>
                <label
                  htmlFor="input-expected-agen"
                  className="block font-tabular text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1"
                >
                  Target Grand Total Agen (Opsional untuk Cek 4):
                </label>
                <input
                  id="input-expected-agen"
                  data-testid="input-expected-agen"
                  type="number"
                  value={expectedTotalAgenInput}
                  onChange={(e) => setExpectedTotalAgenInput(e.target.value)}
                  placeholder="Kosongkan bila mengikuti akumulasi baris CSV"
                  className="w-full px-3 py-1.5 border border-[var(--border-rule)] bg-[var(--surface-paper)] font-tabular text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor="textarea-csv-content"
                  className="block font-tabular text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1"
                >
                  Isi Mentah CSV (Dapat Disunting untuk Uji Selisih):
                </label>
                <textarea
                  id="textarea-csv-content"
                  data-testid="textarea-csv-content"
                  rows={5}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="bulan,id_pangkalan,nama_pangkalan,alokasi,d01..d31,total_normal,total_fakultatif,sisa_alokasi,grand_total"
                  className="w-full p-2.5 border border-[var(--border-rule)] bg-[var(--surface-paper)] font-tabular text-[11px] leading-relaxed"
                />
              </div>
            </div>

            {/* Panel Hasil 4 Cek Validasi */}
            <div className="lg:col-span-7 space-y-4">
              {!validasiResult ? (
                <div className="h-full flex flex-col justify-center border border-dashed border-[var(--border-rule)] bg-[var(--surface-paper)] p-6 text-center">
                  <p className="font-editorial text-lg font-semibold text-[var(--text-ink)]">
                    Belum Ada Berkas yang Divalidasi
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1 max-w-md mx-auto">
                    Klik tombol <strong>Muat Contoh Bulan Fiktif (Nov 2026)</strong> di kanan atas
                    atau unggah berkas CSV untuk menjalankan 4 cek validasi sebelum analisis.
                  </p>
                </div>
              ) : (
                <div data-testid="hasil-validasi-container" className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Cek 1 */}
                    <div
                      data-testid="cek-1-card"
                      className={`border p-3 ${
                        validasiResult.empat_cek.jumlah_harian_vs_normal.lulus
                          ? 'border-[var(--border-strong)] bg-[var(--surface-paper)]'
                          : 'border-[#D9480F] bg-[var(--accent-anomali-bg)]'
                      }`}
                    >
                      <div className="flex items-center justify-between font-tabular text-xs">
                        <span className="font-semibold">1. Harian = Total Normal</span>
                        <strong
                          className={
                            validasiResult.empat_cek.jumlah_harian_vs_normal.lulus
                              ? 'text-[var(--accent-lulus)]'
                              : 'text-[var(--accent-anomali-teks)]'
                          }
                        >
                          {validasiResult.empat_cek.jumlah_harian_vs_normal.lulus
                            ? 'LULUS'
                            : 'GAGAL'}
                        </strong>
                      </div>
                      <p className="font-tabular text-[11px] text-[var(--text-muted)] mt-1">
                        {validasiResult.empat_cek.jumlah_harian_vs_normal.jumlah_cocok}/
                        {validasiResult.empat_cek.jumlah_harian_vs_normal.total_baris} baris cocok (
                        {validasiResult.empat_cek.jumlah_harian_vs_normal.rumus})
                      </p>
                    </div>

                    {/* Cek 2 */}
                    <div
                      data-testid="cek-2-card"
                      className={`border p-3 ${
                        validasiResult.empat_cek.normal_fakultatif_vs_grand.lulus
                          ? 'border-[var(--border-strong)] bg-[var(--surface-paper)]'
                          : 'border-[#D9480F] bg-[var(--accent-anomali-bg)]'
                      }`}
                    >
                      <div className="flex items-center justify-between font-tabular text-xs">
                        <span className="font-semibold">2. Normal + Fak = Grand Total</span>
                        <strong
                          className={
                            validasiResult.empat_cek.normal_fakultatif_vs_grand.lulus
                              ? 'text-[var(--accent-lulus)]'
                              : 'text-[var(--accent-anomali-teks)]'
                          }
                        >
                          {validasiResult.empat_cek.normal_fakultatif_vs_grand.lulus
                            ? 'LULUS'
                            : 'GAGAL'}
                        </strong>
                      </div>
                      <p className="font-tabular text-[11px] text-[var(--text-muted)] mt-1">
                        {validasiResult.empat_cek.normal_fakultatif_vs_grand.jumlah_cocok}/
                        {validasiResult.empat_cek.normal_fakultatif_vs_grand.total_baris} baris
                        cocok ({validasiResult.empat_cek.normal_fakultatif_vs_grand.rumus})
                      </p>
                    </div>

                    {/* Cek 3 */}
                    <div
                      data-testid="cek-3-card"
                      className={`border p-3 ${
                        validasiResult.empat_cek.sisa_alokasi.lulus
                          ? 'border-[var(--border-strong)] bg-[var(--surface-paper)]'
                          : 'border-[#D9480F] bg-[var(--accent-anomali-bg)]'
                      }`}
                    >
                      <div className="flex items-center justify-between font-tabular text-xs">
                        <span className="font-semibold">3. Sisa = Alokasi − Grand Total</span>
                        <strong
                          className={
                            validasiResult.empat_cek.sisa_alokasi.lulus
                              ? 'text-[var(--accent-lulus)]'
                              : 'text-[var(--accent-anomali-teks)]'
                          }
                        >
                          {validasiResult.empat_cek.sisa_alokasi.lulus ? 'LULUS' : 'GAGAL'}
                        </strong>
                      </div>
                      <p className="font-tabular text-[11px] text-[var(--text-muted)] mt-1">
                        {validasiResult.empat_cek.sisa_alokasi.jumlah_cocok}/
                        {validasiResult.empat_cek.sisa_alokasi.total_baris} baris cocok (
                        {validasiResult.empat_cek.sisa_alokasi.rumus})
                      </p>
                    </div>

                    {/* Cek 4 */}
                    <div
                      data-testid="cek-4-card"
                      className={`border p-3 ${
                        validasiResult.empat_cek.total_agen.lulus
                          ? 'border-[var(--border-strong)] bg-[var(--surface-paper)]'
                          : 'border-[#D9480F] bg-[var(--accent-anomali-bg)]'
                      }`}
                    >
                      <div className="flex items-center justify-between font-tabular text-xs">
                        <span className="font-semibold">4. Total Agen PT. KJP</span>
                        <strong
                          className={
                            validasiResult.empat_cek.total_agen.lulus
                              ? 'text-[var(--accent-lulus)]'
                              : 'text-[var(--accent-anomali-teks)]'
                          }
                        >
                          {validasiResult.empat_cek.total_agen.lulus ? 'LULUS' : 'GAGAL'}
                        </strong>
                      </div>
                      <p className="font-tabular text-[11px] text-[var(--text-muted)] mt-1">
                        Grand Total:{' '}
                        <strong>
                          {formatIndonesianNumber(validasiResult.empat_cek.total_agen.grand_total)}
                        </strong>{' '}
                        tabung · Alokasi:{' '}
                        {formatIndonesianNumber(validasiResult.empat_cek.total_agen.total_alokasi)}
                      </p>
                    </div>
                  </div>

                  {/* Baris Konfirmasi */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--border-strong)] bg-[var(--surface-paper)] p-3.5">
                    <div className="font-tabular text-xs">
                      <span className="uppercase tracking-wider text-[var(--text-muted)]">
                        Pratinjau Bulan:{' '}
                      </span>
                      <strong className="text-[var(--text-ink)]">
                        {validasiResult.nama_bulan} 2026 ({validasiResult.ringkasan.jumlah_baris}{' '}
                        pangkalan)
                      </strong>
                      <span className="mx-2">·</span>
                      <span
                        data-testid="status-empat-cek-badge"
                        className={
                          validasiResult.valid
                            ? 'font-semibold text-[var(--accent-lulus)]'
                            : 'font-semibold text-[var(--accent-anomali-teks)]'
                        }
                      >
                        {validasiResult.valid
                          ? 'Keempat Cek Valid — Siap Dikonfirmasi'
                          : 'Terdapat Selisih Validasi'}
                      </span>
                    </div>

                    <Button
                      variant="anomali"
                      size="sm"
                      data-testid="btn-konfirmasi-unggah"
                      disabled={!validasiResult.valid || !isAdmin}
                      loading={isConfirming}
                      onClick={handleKonfirmasiUnggah}
                    >
                      Konfirmasi &amp; Jalankan Analisis
                    </Button>
                  </div>

                  {/* Tabel Pratinjau Baris Validasi */}
                  <div className="max-h-56 overflow-y-auto border border-[var(--border-rule)] bg-[var(--surface-paper)]">
                    <table
                      data-testid="tabel-pratinjau-validasi"
                      className="w-full border-collapse text-left font-tabular text-xs"
                    >
                      <thead>
                        <tr className="border-b border-[var(--border-strong)] bg-[var(--surface-subtle)] text-[10px] uppercase text-[var(--text-muted)]">
                          <th className="py-1.5 px-2.5">Kode</th>
                          <th className="py-1.5 px-2.5 text-right">Alokasi</th>
                          <th className="py-1.5 px-2.5 text-right">Σ Harian</th>
                          <th className="py-1.5 px-2.5 text-right">Normal</th>
                          <th className="py-1.5 px-2.5 text-right">Fakultatif</th>
                          <th className="py-1.5 px-2.5 text-right">Grand Total</th>
                          <th className="py-1.5 px-2.5 text-right">Sisa</th>
                          <th className="py-1.5 px-2.5 text-center">Status 4 Cek</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-rule)]">
                        {validasiResult.baris.slice(0, 15).map((r) => (
                          <tr key={r.kode}>
                            <td className="py-1.5 px-2.5 font-semibold">
                              {r.kode}
                              {isAdmin && r.nama ? ` · ${r.nama}` : ''}
                            </td>
                            <td className="py-1.5 px-2.5 text-right">
                              {formatIndonesianNumber(r.alokasi)}
                            </td>
                            <td className="py-1.5 px-2.5 text-right">
                              {formatIndonesianNumber(r.jumlah_harian)}
                            </td>
                            <td className="py-1.5 px-2.5 text-right">
                              {formatIndonesianNumber(r.total_normal)}
                            </td>
                            <td className="py-1.5 px-2.5 text-right">
                              {formatIndonesianNumber(r.total_fakultatif)}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-semibold">
                              {formatIndonesianNumber(r.grand_total)}
                            </td>
                            <td className="py-1.5 px-2.5 text-right">
                              {formatIndonesianNumber(r.sisa_alokasi)}
                            </td>
                            <td className="py-1.5 px-2.5 text-center">
                              <span
                                className={
                                  r.lulus_baris
                                    ? 'text-[var(--accent-lulus)] font-semibold'
                                    : 'text-[var(--accent-anomali-teks)] font-semibold'
                                }
                              >
                                {r.lulus_baris ? 'COCOK' : 'SELISIH'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <AturanGaris />

        {/* 2. PANEL PARAMETER (ADMIN) & PERBANDINGAN TERHADAP BASELINE */}
        <section
          aria-labelledby="heading-panel-parameter"
          data-testid="section-panel-parameter"
          className="space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <span className="font-tabular text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                2. PANEL PARAMETER ANALISIS (KHUSUS ADMIN) &amp; PERBANDINGAN BASELINE
              </span>
              <h2
                id="heading-panel-parameter"
                className="font-editorial text-2xl font-bold text-[var(--text-ink)]"
              >
                Eksperimen Parameter k, Batas LOF, atau Mode Kapasitas Pemeriksa (Top-N)
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="sekunder"
                size="sm"
                data-testid="btn-reset-baseline"
                onClick={handleResetBaseline}
              >
                Kembalikan ke Baseline (k=10)
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Kontrol Parameter */}
            <div className="lg:col-span-5 border border-[var(--border-strong)] bg-[var(--surface-subtle)]/35 p-5 space-y-4">
              <div className="flex items-center gap-2 font-tabular text-xs">
                <button
                  type="button"
                  data-testid="mode-threshold-btn"
                  onClick={() => setParamMode('threshold')}
                  className={`flex-1 py-2 px-3 border text-center uppercase tracking-wider cursor-pointer ${
                    paramMode === 'threshold'
                      ? 'border-[var(--border-strong)] bg-[var(--text-ink)] text-[var(--surface-paper)] font-semibold'
                      : 'border-[var(--border-rule)] bg-[var(--surface-paper)] text-[var(--text-ink)]'
                  }`}
                >
                  Mode Batas LOF
                </button>
                <button
                  type="button"
                  data-testid="mode-topn-btn"
                  onClick={() => setParamMode('top_n')}
                  className={`flex-1 py-2 px-3 border text-center uppercase tracking-wider cursor-pointer ${
                    paramMode === 'top_n'
                      ? 'border-[var(--border-strong)] bg-[var(--text-ink)] text-[var(--surface-paper)] font-semibold'
                      : 'border-[var(--border-rule)] bg-[var(--surface-paper)] text-[var(--text-ink)]'
                  }`}
                >
                  Mode Top-N Pemeriksa
                </button>
              </div>

              <div className="space-y-3 font-tabular text-xs">
                <div>
                  <div className="flex justify-between mb-1">
                    <label htmlFor="slider-param-k" className="uppercase font-semibold">
                      Tetangga Terdekat (k):
                    </label>
                    <strong>k = {paramK}</strong>
                  </div>
                  <input
                    id="slider-param-k"
                    data-testid="slider-param-k"
                    type="range"
                    min={3}
                    max={20}
                    step={1}
                    value={paramK}
                    onChange={(e) => setParamK(Number.parseInt(e.target.value, 10))}
                    className="w-full accent-[#D9480F] cursor-pointer"
                  />
                </div>

                {paramMode === 'threshold' ? (
                  <div>
                    <div className="flex justify-between mb-1">
                      <label htmlFor="slider-param-threshold" className="uppercase font-semibold">
                        Batas Ambang LOF:
                      </label>
                      <strong>≥ {formatIndonesianNumber(paramThreshold, 2)}</strong>
                    </div>
                    <input
                      id="slider-param-threshold"
                      data-testid="slider-param-threshold"
                      type="range"
                      min={1.15}
                      max={2.2}
                      step={0.05}
                      value={paramThreshold}
                      onChange={(e) => setParamThreshold(Number.parseFloat(e.target.value))}
                      className="w-full accent-[#D9480F] cursor-pointer"
                    />
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between mb-1">
                      <label htmlFor="slider-param-topn" className="uppercase font-semibold">
                        Kapasitas Tim Pemeriksa (Top-N Pangkalan):
                      </label>
                      <strong className="text-[var(--accent-anomali-teks)]">
                        Top-{paramTopN} Pangkalan
                      </strong>
                    </div>
                    <input
                      id="slider-param-topn"
                      data-testid="slider-param-topn"
                      type="range"
                      min={3}
                      max={18}
                      step={1}
                      value={paramTopN}
                      onChange={(e) => setParamTopN(Number.parseInt(e.target.value, 10))}
                      className="w-full accent-[#D9480F] cursor-pointer"
                    />
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      Memilih tepat {paramTopN} pangkalan dengan skor LOF puncak tertinggi sesuai
                      kuota kunjungan lapangan.
                    </p>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="input-nama-run"
                    className="block uppercase text-[var(--text-muted)] mb-1"
                  >
                    Nama Run Analisis (Opsional):
                  </label>
                  <input
                    id="input-nama-run"
                    data-testid="input-nama-run"
                    type="text"
                    value={paramNamaRun}
                    onChange={(e) => setParamNamaRun(e.target.value)}
                    placeholder="Mis. evaluasi-kapasitas-5-pangkalan"
                    className="w-full px-3 py-1.5 border border-[var(--border-rule)] bg-[var(--surface-paper)] text-xs"
                  />
                </div>

                <Button
                  variant="utama"
                  size="md"
                  className="w-full"
                  data-testid="btn-jalankan-parameter"
                  disabled={!isAdmin}
                  loading={isRunningParam}
                  onClick={handleRunParameter}
                >
                  Buat Analysis Run Baru &amp; Bandingkan
                </Button>
              </div>
            </div>

            {/* Panel Perbandingan terhadap Baseline (Jaccard, Masuk, Keluar) */}
            <div
              data-testid="panel-perbandingan-baseline"
              className="lg:col-span-7 border border-[var(--border-strong)] bg-[var(--surface-paper)] p-5 space-y-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border-rule)] pb-3">
                <div>
                  <span className="font-tabular text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    PERBANDINGAN RUN AKTIF ({activeRun.nama}) VS ACUAN ({activeComparison.baseline_nama})
                  </span>
                  <h3 className="font-editorial text-xl font-bold text-[var(--text-ink)]">
                    Indeks Kemiripan Jaccard &amp; Pergeseran Daftar Prioritas
                  </h3>
                </div>
                <div className="flex items-center gap-4 font-tabular text-xs">
                  <div>
                    <span className="text-[var(--text-muted)]">Jaccard Pangkalan: </span>
                    <strong
                      data-testid="jaccard-pangkalan-val"
                      className="text-base text-[var(--accent-anomali-teks)]"
                    >
                      {formatIndonesianNumber(activeComparison.jaccard_pangkalan, 2)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)]">Jaccard Obs: </span>
                    <strong className="text-base text-[var(--text-ink)]">
                      {formatIndonesianNumber(activeComparison.jaccard_observasi, 2)}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Pangkalan yang MASUK daftar prioritas */}
                <div
                  data-testid="daftar-pangkalan-masuk"
                  className="border border-[var(--border-rule)] bg-[var(--surface-subtle)]/30 p-3.5"
                >
                  <div className="flex items-center justify-between font-tabular text-xs mb-2">
                    <span className="uppercase font-semibold text-[var(--accent-anomali-teks)]">
                      + Masuk Daftar Prioritas
                    </span>
                    <span className="font-bold">
                      {activeComparison.pangkalan_masuk.length} pangkalan
                    </span>
                  </div>
                  {activeComparison.pangkalan_masuk.length === 0 ? (
                    <p className="text-xs text-[var(--text-soft)]">
                      Tidak ada pangkalan baru yang masuk dibanding baseline-k10.
                    </p>
                  ) : (
                    <ul className="space-y-1.5 font-tabular text-xs">
                      {activeComparison.pangkalan_masuk.map((p) => (
                        <li
                          key={p.kode}
                          className="flex items-center justify-between border-b border-[var(--border-rule)] pb-1"
                        >
                          <span>
                            <strong>{p.kode}</strong>
                            {isAdmin && p.nama ? ` (${p.nama})` : ''}
                          </span>
                          <span className="text-[var(--accent-anomali-teks)]">
                            {p.kategori_baseline} → <strong>{p.kategori_baru}</strong> (Maks{' '}
                            {formatIndonesianNumber(p.maks_lof_baru ?? 0, 2)})
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Pangkalan yang KELUAR dari daftar prioritas */}
                <div
                  data-testid="daftar-pangkalan-keluar"
                  className="border border-[var(--border-rule)] bg-[var(--surface-subtle)]/30 p-3.5"
                >
                  <div className="flex items-center justify-between font-tabular text-xs mb-2">
                    <span className="uppercase font-semibold text-[var(--text-ink)]">
                      − Keluar dari Daftar Prioritas
                    </span>
                    <span className="font-bold">
                      {activeComparison.pangkalan_keluar.length} pangkalan
                    </span>
                  </div>
                  {activeComparison.pangkalan_keluar.length === 0 ? (
                    <p className="text-xs text-[var(--text-soft)]">
                      Tidak ada pangkalan prioritas baseline yang keluar daftar.
                    </p>
                  ) : (
                    <ul className="space-y-1.5 font-tabular text-xs">
                      {activeComparison.pangkalan_keluar.map((p) => (
                        <li
                          key={p.kode}
                          className="flex items-center justify-between border-b border-[var(--border-rule)] pb-1"
                        >
                          <span>
                            <strong>{p.kode}</strong>
                            {isAdmin && p.nama ? ` (${p.nama})` : ''}
                          </span>
                          <span className="text-[var(--text-muted)]">
                            {p.kategori_baseline} → <strong>{p.kategori_baru}</strong>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <AturanGaris />

        {/* 3. TINDAK LANJUT PEMERIKSAAN PER PANGKALAN & RIWAYAT */}
        <section
          aria-labelledby="heading-tindak-lanjut"
          data-testid="section-tindak-lanjut"
          className="space-y-5"
        >
          <div>
            <span className="font-tabular text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
              3. TINDAK LANJUT LAPANGAN &amp; LABEL AWAL EVALUASI BERIKUTNYA
            </span>
            <h2
              id="heading-tindak-lanjut"
              className="font-editorial text-2xl font-bold text-[var(--text-ink)]"
            >
              Pencatatan Status Pemeriksaan &amp; Riwayat per Pangkalan
            </h2>
          </div>

          {/* Ringkasan 4 Status Tindak Lanjut */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                'belum_diperiksa',
                'perlu_klarifikasi',
                'wajar_dengan_alasan',
                'ditindaklanjuti',
              ] as const
            ).map((st) => (
              <div
                key={st}
                data-testid={`ringkasan-tl-${st}`}
                className="border border-[var(--border-rule)] bg-[var(--surface-subtle)]/35 p-3.5"
              >
                <span className="font-tabular text-[11px] uppercase tracking-wider text-[var(--text-muted)] block">
                  {STATUS_TINDAK_LANJUT_LABELS[st]}
                </span>
                <span className="font-tabular text-2xl font-bold text-[var(--text-ink)] mt-1 block">
                  {tindakLanjutData.ringkasan_status[st] ?? 0}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Formulir Simpan Tindak Lanjut */}
            <div className="lg:col-span-5 border border-[var(--border-strong)] bg-[var(--surface-paper)] p-5 space-y-4">
              <h3 className="font-editorial text-lg font-bold text-[var(--text-ink)]">
                Perbarui Status Tindak Lanjut Pangkalan
              </h3>

              <div className="space-y-3 font-tabular text-xs">
                <div>
                  <label htmlFor="select-kode-tl" className="block uppercase text-[var(--text-muted)] mb-1">
                    Pilih Pangkalan:
                  </label>
                  <select
                    id="select-kode-tl"
                    data-testid="select-kode-tl"
                    value={selectedKodeTl}
                    onChange={(e) => setSelectedKodeTl(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border-strong)] bg-[var(--surface-paper)]"
                  >
                    {tindakLanjutData.items.map((item) => (
                      <option key={item.kode} value={item.kode}>
                        {item.kode}
                        {isAdmin && item.nama ? ` — ${item.nama}` : ''} ({item.kategori} ·{' '}
                        {item.label_status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="select-status-tl" className="block uppercase text-[var(--text-muted)] mb-1">
                    Status Hasil Pemeriksaan:
                  </label>
                  <select
                    id="select-status-tl"
                    data-testid="select-status-tl"
                    value={selectedStatusTl}
                    onChange={(e) => setSelectedStatusTl(e.target.value as TindakLanjutStatus)}
                    className="w-full px-3 py-2 border border-[var(--border-strong)] bg-[var(--surface-paper)]"
                  >
                    <option value="belum_diperiksa">Belum diperiksa</option>
                    <option value="perlu_klarifikasi">Perlu klarifikasi</option>
                    <option value="wajar_dengan_alasan">Wajar dengan alasan</option>
                    <option value="ditindaklanjuti">Ditindaklanjuti</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="input-catatan-tl" className="block uppercase text-[var(--text-muted)] mb-1">
                    Catatan Pemeriksaan / Berita Acara Singkat:
                  </label>
                  <textarea
                    id="input-catatan-tl"
                    data-testid="input-catatan-tindak-lanjut"
                    rows={3}
                    value={catatanTl}
                    onChange={(e) => setCatatanTl(e.target.value)}
                    placeholder="Contoh: Telah diklarifikasi bersama agen, lonjakan terjadi saat penyaluran tambahan menjelang hari besar."
                    className="w-full p-2.5 border border-[var(--border-rule)] bg-[var(--surface-paper)] font-sans text-xs"
                  />
                </div>

                <Button
                  variant="utama"
                  size="md"
                  className="w-full"
                  data-testid="btn-simpan-tindak-lanjut"
                  loading={isSavingTl}
                  onClick={handleSaveTindakLanjut}
                >
                  Simpan Status &amp; Catat Riwayat
                </Button>
              </div>

              {/* Riwayat Tindak Lanjut Pangkalan Terpilih */}
              {selectedTlRow && (
                <div
                  data-testid="riwayat-tindak-lanjut-box"
                  className="border-t border-[var(--border-rule)] pt-3 space-y-2"
                >
                  <div className="font-tabular text-xs uppercase font-semibold text-[var(--text-ink)]">
                    Riwayat {selectedTlRow.kode} ({selectedTlRow.riwayat.length} catatan):
                  </div>
                  {selectedTlRow.riwayat.length === 0 ? (
                    <p className="text-xs text-[var(--text-soft)]">
                      Belum ada riwayat perubahan status untuk {selectedTlRow.kode}.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-xs">
                      {selectedTlRow.riwayat.map((r) => (
                        <li
                          key={r.id}
                          className="border border-[var(--border-rule)] bg-[var(--surface-subtle)]/35 p-2.5"
                        >
                          <div className="flex justify-between font-tabular text-[11px]">
                            <strong>{r.label_status}</strong>
                            <span className="text-[var(--text-soft)]">{r.oleh}</span>
                          </div>
                          {r.catatan && (
                            <p className="mt-1 text-[var(--text-ink)]">{r.catatan}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Tabel Status Tindak Lanjut Pangkalan */}
            <div className="lg:col-span-7 border border-[var(--border-rule)] bg-[var(--surface-paper)] overflow-x-auto max-h-[460px] overflow-y-auto">
              <table
                data-testid="tabel-tindak-lanjut"
                className="w-full border-collapse text-left text-xs"
              >
                <thead>
                  <tr className="border-b border-[var(--border-strong)] bg-[var(--surface-subtle)] font-tabular text-[11px] uppercase text-[var(--text-muted)]">
                    <th className="py-2 px-3">Kode</th>
                    <th className="py-2 px-3">Kategori LOF</th>
                    <th className="py-2 px-3 text-right">Maks LOF</th>
                    <th className="py-2 px-3">Status Tindak Lanjut</th>
                    <th className="py-2 px-3">Catatan Terakhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-rule)]">
                  {tindakLanjutData.items.map((item) => (
                    <tr
                      key={item.kode}
                      onClick={() => setSelectedKodeTl(item.kode)}
                      data-testid={`tl-row-${item.kode}`}
                      className="cursor-pointer hover:bg-[var(--surface-subtle)]/60"
                    >
                      <td className="py-2 px-3 font-tabular font-semibold">
                        {item.kode}
                        {isAdmin && item.nama ? (
                          <span className="block font-sans font-normal text-[11px] text-[var(--text-muted)]">
                            {item.nama}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 px-3">
                        <TagKategori kategori={item.kategori} compact />
                      </td>
                      <td className="py-2 px-3 text-right font-tabular">
                        <Angka value={item.maks_lof} decimals={2} animate={false} />
                      </td>
                      <td className="py-2 px-3 font-tabular">
                        <span
                          className={`inline-block px-2 py-0.5 border text-[11px] ${
                            item.status === 'ditindaklanjuti'
                              ? 'border-[#D9480F] bg-[var(--accent-anomali-bg)] text-[var(--accent-anomali-teks)] font-semibold'
                              : item.status === 'perlu_klarifikasi'
                                ? 'border-[#C98A00] bg-[var(--accent-mustard-bg)] text-[var(--accent-mustard)] font-semibold'
                                : 'border-[var(--border-rule)] bg-[var(--surface-subtle)] text-[var(--text-ink)]'
                          }`}
                        >
                          {item.label_status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[var(--text-muted)]">
                        {item.catatan ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <AturanGaris />

        {/* 4. AUDIT LOG AKSI PENTING */}
        <section
          aria-labelledby="heading-audit-log"
          data-testid="section-audit-log"
          className="space-y-4"
        >
          <div className="flex items-end justify-between">
            <div>
              <span className="font-tabular text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                4. JEJAK AUDIT OPERASIONAL (AUDIT LOG)
              </span>
              <h2
                id="heading-audit-log"
                className="font-editorial text-2xl font-bold text-[var(--text-ink)]"
              >
                Catatan Aksi Penting Sistem ({auditLogs.length} Entri)
              </h2>
            </div>
          </div>

          <div className="border border-[var(--border-strong)] bg-[var(--surface-paper)] overflow-x-auto">
            <table
              data-testid="tabel-audit-log"
              className="w-full border-collapse text-left font-tabular text-xs"
            >
              <thead>
                <tr className="border-b border-[var(--border-strong)] bg-[var(--surface-subtle)] text-[11px] uppercase text-[var(--text-muted)]">
                  <th className="py-2 px-3">ID</th>
                  <th className="py-2 px-3">Aksi</th>
                  <th className="py-2 px-3">Pelaku</th>
                  <th className="py-2 px-3">Entitas</th>
                  <th className="py-2 px-3">Rincian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-rule)]">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 px-3 text-[var(--text-muted)]">#{log.id}</td>
                    <td className="py-2 px-3 font-semibold text-[var(--accent-anomali-teks)]">
                      {log.aksi}
                    </td>
                    <td className="py-2 px-3">{log.oleh}</td>
                    <td className="py-2 px-3">{log.entitas ?? '—'}</td>
                    <td className="py-2 px-3 font-sans text-[var(--text-muted)]">
                      {log.detail ? JSON.stringify(log.detail) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
