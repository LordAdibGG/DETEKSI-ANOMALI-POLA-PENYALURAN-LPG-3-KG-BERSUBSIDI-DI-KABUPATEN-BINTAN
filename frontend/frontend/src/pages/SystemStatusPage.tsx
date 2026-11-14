import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { RefreshCw, CheckCircle2, AlertTriangle, Server, Database, Cpu } from 'lucide-react';
import { fetchSystemHealth } from '../api/health';

interface StatusNode {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  endpoint: string;
  healthy: boolean;
  statusLabel: string;
  detailText: string;
  meta: Array<{ label: string; value: string }>;
}

function StatusSkeleton() {
  return (
    <motion.div
      key="skeleton"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      data-testid="health-skeleton"
      aria-busy="true"
      aria-label="Memuat status layanan"
      className="grid grid-cols-1 md:grid-cols-3 gap-6"
    >
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="border border-[#17211C]/20 bg-[#EAE4D3]/60 p-6 flex flex-col justify-between min-h-[240px]"
        >
          <div>
            <div className="flex items-center justify-between border-b border-[#17211C]/15 pb-3 mb-4">
              <div className="h-4 w-16 bg-[#17211C]/15 animate-pulse" />
              <div className="h-5 w-24 bg-[#17211C]/15 animate-pulse" />
            </div>
            <div className="h-6 w-3/4 bg-[#17211C]/15 animate-pulse mb-2" />
            <div className="h-4 w-1/2 bg-[#17211C]/10 animate-pulse mb-6" />
          </div>
          <div className="space-y-2 border-t border-[#17211C]/15 pt-4">
            <div className="h-3 w-full bg-[#17211C]/10 animate-pulse" />
            <div className="h-3 w-2/3 bg-[#17211C]/10 animate-pulse" />
          </div>
        </div>
      ))}
    </motion.div>
  );
}

export function SystemStatusPage() {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    refetchInterval: 5000,
    retry: false,
  });

  const apiHealthy = !isError && data?.db?.status === 'ok';
  const mlHealthy = !isError && data?.ml?.status === 'ok';

  const nodes: StatusNode[] = [
    {
      id: 'frontend',
      code: 'SIMPUL 01',
      title: 'Antarmuka',
      subtitle: 'Aplikasi Web Lembar Pantau',
      endpoint: 'http://localhost:5173',
      healthy: true,
      statusLabel: 'TERHUBUNG (HIJAU)',
      detailText: 'Antarmuka editorial aktif dan siap menampilkan buku besar pengawasan.',
      meta: [
        { label: 'Kerangka', value: 'React 18 + Vite' },
        { label: 'Gaya & Gerak', value: 'Tailwind v4 + Motion' },
        { label: 'Versi UI', value: 'v0.1.0 (Fase 0)' },
      ],
    },
    {
      id: 'api',
      code: 'SIMPUL 02',
      title: 'API & Basis Data',
      subtitle: 'Laravel 12 REST + MySQL XAMPP',
      endpoint: 'http://127.0.0.1:8000/api/health',
      healthy: apiHealthy,
      statusLabel: apiHealthy ? 'TERHUBUNG (HIJAU)' : 'TERPUTUS (MERAH)',
      detailText: isError
        ? `Gagal menghubungi server API Laravel (${error instanceof Error ? error.message : 'Koneksi ditolak'}).`
        : data?.db?.message || 'Koneksi MySQL aktif dan siap melayani pembacaan data pangkalan.',
      meta: [
        { label: 'Basis Data', value: data?.db?.database || 'lpg_lof' },
        { label: 'Status DB', value: data?.db?.status === 'ok' ? 'Aktif (utf8mb4)' : 'Tidak Terjangkau' },
        { label: 'Versi API', value: data?.version ? `v${data.version}` : '-' },
      ],
    },
    {
      id: 'ml',
      code: 'SIMPUL 03',
      title: 'Layanan LOF',
      subtitle: 'Mesin Perhitungan FastAPI Python',
      endpoint: 'http://127.0.0.1:8001/health',
      healthy: mlHealthy,
      statusLabel: mlHealthy ? 'TERHUBUNG (HIJAU)' : 'TERPUTUS (MERAH)',
      detailText: mlHealthy
        ? `Mesin perhitungan siap (${data?.ml?.engine || 'LOF k=10, batas 1,5'}).`
        : data?.ml?.message || 'Layanan Python tidak merespons. API utama tetap berjalan normal.',
      meta: [
        { label: 'Otentikasi', value: 'Header X-ML-KEY' },
        { label: 'Berkas CSV', value: data?.ml?.data_ready ? 'Lengkap (6 berkas)' : 'Belum Terverifikasi' },
        { label: 'Versi ML', value: data?.ml?.version ? `v${data.ml.version}` : '-' },
      ],
    },
  ];

  const allGreen = nodes.every((n) => n.healthy);

  return (
    <Tooltip.Provider delayDuration={200}>
      <div className="min-h-screen bg-[var(--surface-paper)] text-[var(--text-ink)] flex flex-col justify-between">
        {/* Header Buku Besar */}
        <header className="border-b-2 border-[var(--border-strong)] px-6 py-5 md:px-12">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 text-xs font-tabular tracking-widest uppercase text-[var(--text-muted)] mb-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full bg-[#86B817] border border-[var(--border-strong)]"
                  aria-hidden="true"
                />
                <span>Bagian Perekonomian Setda Kabupaten Bintan · Tim Monev LPG 3 kg</span>
              </div>
              <h1 className="font-editorial text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-ink)]">
                Lembar Pantau
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-1 max-w-2xl">
                Buku besar pengawasan penyaluran LPG 3 kg bersubsidi berbasis deteksi anomali{' '}
                <span className="italic font-editorial">Local Outlier Factor (LOF)</span>. Hasil merupakan{' '}
                <strong className="font-semibold underline decoration-[var(--border-rule)] underline-offset-4">
                  indikasi awal
                </strong>{' '}
                untuk prioritas pemeriksaan lapangan, bukan bukti pelanggaran.
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end gap-2 font-tabular text-xs">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-[var(--border-strong)] bg-[var(--surface-subtle)]">
                <span className="uppercase tracking-wider font-medium">Fase 0: Pemeriksaan Fondasi</span>
              </div>
              <span className="text-[var(--text-muted)]">
                Pembaruan terakhir:{' '}
                {dataUpdatedAt
                  ? new Date(dataUpdatedAt).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : 'Memuat...'}
              </span>
            </div>
          </div>
        </header>

        {/* Konten Utama */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 md:px-12 md:py-10">
          {/* Pita Ringkasan & Tombol Segarkan */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-8 border-b border-[var(--border-rule)]">
            <div className="flex items-center gap-3">
              {isLoading ? (
                <span className="inline-flex items-center gap-2 text-sm font-tabular text-[var(--text-muted)]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--text-muted)]" aria-hidden="true" />
                  Memeriksa sambungan ketiga layanan...
                </span>
              ) : allGreen ? (
                <div
                  data-testid="overall-status-banner"
                  className="inline-flex items-center gap-2.5 px-3.5 py-1.5 border border-[var(--border-strong)] bg-[#86B817]/20 text-[var(--text-ink)] text-sm font-medium"
                >
                  <CheckCircle2 className="w-4 h-4 text-[var(--text-ink)]" />
                  <span>Ketiga layanan terhubung dan beroperasi normal (3/3 Hijau)</span>
                </div>
              ) : (
                <div
                  data-testid="overall-status-banner"
                  className="inline-flex items-center gap-2.5 px-3.5 py-1.5 border border-[#D9480F] bg-[var(--accent-anomali-bg)] text-[var(--accent-anomali-teks)] text-sm font-medium"
                >
                  <AlertTriangle className="w-4 h-4 text-[var(--accent-anomali-teks)]" />
                  <span>
                    Gangguan terdeteksi pada salah satu layanan — API utama tetap berjalan tanpa henti paksa
                  </span>
                </div>
              )}
            </div>

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-strong)] bg-[var(--surface-paper)] hover:bg-[var(--text-ink)] hover:text-[var(--surface-paper)] transition-colors text-xs font-tabular uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                  <span>{isFetching ? 'Memeriksa...' : 'Periksa Ulang Status'}</span>
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  sideOffset={6}
                  className="bg-[var(--text-ink)] text-[var(--surface-paper)] px-3 py-1.5 text-xs font-tabular border border-[var(--border-strong)] shadow-sm"
                >
                  Memanggil GET /api/health secara langsung
                  <Tooltip.Arrow className="fill-[var(--text-ink)]" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>

          {/* Kartu Tiga Layanan: Skeleton -> Hasil */}
          <AnimatePresence mode="wait">
            {isLoading ? (
              <StatusSkeleton />
            ) : (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                data-testid="health-results"
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
              >
                {nodes.map((node) => {
                  const IconComponent =
                    node.id === 'frontend' ? Server : node.id === 'api' ? Database : Cpu;

                  return (
                    <article
                      key={node.id}
                      data-testid={`status-card-${node.id}`}
                      data-healthy={node.healthy ? 'true' : 'false'}
                      className={`border-2 p-6 flex flex-col justify-between transition-colors ${
                        node.healthy
                          ? 'border-[var(--border-strong)] bg-[var(--surface-paper)]'
                          : 'border-[#D9480F] bg-[var(--accent-anomali-bg)]'
                      }`}
                    >
                      <div>
                        {/* Baris Kode & Lencana Status */}
                        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-rule)] pb-3 mb-4">
                          <span className="font-tabular text-xs uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-1.5">
                            <IconComponent className="w-3.5 h-3.5" />
                            {node.code}
                          </span>
                          <span
                            data-testid={`badge-${node.id}`}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-tabular font-semibold tracking-wider uppercase border ${
                              node.healthy
                                ? 'border-[#17211C] bg-[#86B817] text-[#17211C]'
                                : 'border-[#D9480F] bg-[#D9480F] text-[#F3EFE4]'
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                node.healthy ? 'bg-[#17211C]' : 'bg-[#F3EFE4]'
                              }`}
                            />
                            {node.statusLabel}
                          </span>
                        </div>

                        {/* Nama Layanan */}
                        <h2 className="font-editorial text-2xl font-bold text-[var(--text-ink)]">
                          {node.title}
                        </h2>
                        <p className="text-xs font-tabular text-[var(--text-muted)] mt-0.5">
                          {node.subtitle}
                        </p>

                        {/* Penjelasan Status */}
                        <p
                          className={`mt-4 text-sm leading-relaxed ${
                            node.healthy ? 'text-[var(--text-ink)]' : 'text-[var(--accent-anomali-teks)] font-medium'
                          }`}
                        >
                          {node.detailText}
                        </p>
                      </div>

                      {/* Tabel Spesifikasi Teknis */}
                      <div className="mt-6 pt-4 border-t border-[var(--border-rule)]">
                        <dl className="space-y-1.5 text-xs font-tabular">
                          <div className="flex justify-between gap-2">
                            <dt className="text-[var(--text-muted)]">Titik Akses</dt>
                            <dd className="text-[var(--text-ink)] font-medium truncate">{node.endpoint}</dd>
                          </div>
                          {node.meta.map((m) => (
                            <div key={m.label} className="flex justify-between gap-2">
                              <dt className="text-[var(--text-muted)]">{m.label}</dt>
                              <dd className="text-[var(--text-ink)] font-medium">{m.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    </article>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Catatan Kaki Arsitektur Fase 0 */}
          <section className="mt-10 border border-[var(--border-rule)] bg-[var(--surface-subtle)]/50 p-5">
            <h3 className="font-editorial text-base font-bold text-[var(--text-ink)] mb-1">
              Catatan Ketahanan Arsitektur (Prinsip Baca-Cepat)
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Perhitungan skor <span className="font-tabular">Local Outlier Factor (LOF)</span> dijalankan
              secara terpisah melalui layanan Python FastAPI (<span className="font-tabular">127.0.0.1:8001</span>)
              dan hasilnya disimpan ke MySQL (<span className="font-tabular">lpg_lof</span>). Apabila layanan
              Python sedang dimatikan atau mengalami gangguan, indikator <strong>Layanan LOF</strong> di atas
              akan berubah menjadi <strong>TERPUTUS (MERAH)</strong>, namun server API Laravel tetap merespons
              normal dan buku besar pengawasan tetap dapat diakses.
            </p>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t border-[var(--border-rule)] px-6 py-4 md:px-12 text-xs font-tabular text-[var(--text-muted)]">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between gap-2">
            <span>Lembar Pantau · Proyek Penambangan Data UMRAH (Data KJP 2026)</span>
            <span>30 Pangkalan · 293 Pangkalan-Bulan · LOF k=10 (Batas 1,5)</span>
          </div>
        </footer>
      </div>
    </Tooltip.Provider>
  );
}
