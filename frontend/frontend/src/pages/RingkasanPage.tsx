import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { fetchRingkasan, getSnapshotRingkasan } from '../api/pantau';
import { KategoriStackedBar } from '../components/charts/KategoriStackedBar';
import { LofStripPlot } from '../components/charts/LofStripPlot';
import { Angka } from '../components/ui/Angka';
import { AturanGaris } from '../components/ui/AturanGaris';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useFilterBulan } from '../context/FilterBulanContext';

export function RingkasanPage() {
  const { bulanAktif, setBulanAktif } = useFilterBulan();
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['ringkasan', bulanAktif, user?.role],
    queryFn: () => fetchRingkasan(bulanAktif, user?.role ?? 'petugas', token),
    initialData: () => getSnapshotRingkasan(bulanAktif),
  });

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton varian="blok" />
        <Skeleton varian="tabel" baris={6} />
      </div>
    );
  }

  const ringkasan = data ?? getSnapshotRingkasan(bulanAktif);
  const isSingleMonth = ringkasan.bulan !== null;
  const labelPeriode = isSingleMonth ? `${ringkasan.label_bulan} 2026` : 'Januari–Oktober 2026';

  return (
    <div data-testid="ringkasan-page" className="space-y-8">
      {/* Kalimat Editorial Besar dari Data */}
      <section
        aria-label="Pernyataan ringkasan pengawasan"
        data-testid="ringkasan-editorial-headline"
        className="border-b-2 border-[var(--border-strong)] pb-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 font-tabular text-xs uppercase tracking-[0.15em] text-[var(--text-muted)] mb-3">
          <span>
            Bagian I · Ringkasan Pengawasan ·{' '}
            <strong className="text-[var(--text-ink)]">{labelPeriode}</strong>
          </span>
          <span>Model: LOF k=10 · Ambang 1,50 · 4 Fitur Robust Z-Score</span>
        </div>

        {isSingleMonth ? (
          <h1
            key={`headline-bulan-${ringkasan.bulan}`}
            className="font-editorial text-3xl sm:text-4xl lg:text-[42px] font-bold leading-[1.18] tracking-tight text-[var(--text-ink)] max-w-5xl"
          >
            Pada <span className="underline decoration-[#D9480F] decoration-2 underline-offset-8">{labelPeriode}</span>,{' '}
            <Angka
              value={ringkasan.jumlah_ditandai}
              size="xl"
              anomali
              className="text-3xl sm:text-4xl lg:text-[42px] px-1"
            />{' '}
            dari{' '}
            <Angka
              value={ringkasan.jumlah_dinilai}
              size="xl"
              className="text-3xl sm:text-4xl lg:text-[42px] px-1"
            />{' '}
            pangkalan yang dinilai polanya menyimpang dari pangkalan lain.
          </h1>
        ) : (
          <h1
            key="headline-all"
            className="font-editorial text-3xl sm:text-4xl lg:text-[42px] font-bold leading-[1.18] tracking-tight text-[var(--text-ink)] max-w-5xl"
          >
            Sepanjang <span className="underline decoration-[var(--border-strong)] decoration-2 underline-offset-8">Januari–Oktober 2026</span>,{' '}
            <Angka
              value={ringkasan.jumlah_ditandai}
              size="xl"
              anomali
              className="text-3xl sm:text-4xl lg:text-[42px] px-1"
            />{' '}
            dari{' '}
            <Angka
              value={ringkasan.jumlah_dinilai}
              size="xl"
              className="text-3xl sm:text-4xl lg:text-[42px] px-1"
            />{' '}
            pangkalan-bulan yang dinilai pada{' '}
            <Angka
              value={ringkasan.jumlah_pangkalan}
              size="xl"
              className="text-3xl sm:text-4xl lg:text-[42px] px-1"
            />{' '}
            pangkalan polanya menyimpang dari pangkalan lain.
          </h1>
        )}

        {/* Narasi Kontekstual Wajar (Prinsip Indikasi Awal) */}
        <div className="mt-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <p className="text-sm text-[var(--text-muted)] max-w-3xl leading-relaxed">
            Skor <span className="font-editorial italic">Local Outlier Factor</span> membandingkan
            kepadatan empat fitur penyaluran harian tiap pangkalan terhadap rekan sebulan di
            Kabupaten Bintan. Penandaan ini berfungsi sebagai{' '}
            <strong className="text-[var(--text-ink)] font-semibold">
              indikasi awal, bukan bukti pelanggaran
            </strong>
            , guna membantu Tim Monev menentukan urutan kunjungan verifikasi lapangan.
          </p>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link to="/prioritas">
              <Button variant="utama" size="sm">
                Buka Daftar Prioritas →
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Strip-Plot Sebaran LOF Bulan Terpilih */}
      <section aria-label="Strip-plot sebaran LOF">
        <LofStripPlot
          titik={ringkasan.sebaran_lof.titik}
          threshold={ringkasan.sebaran_lof.threshold}
          median={ringkasan.sebaran_lof.median}
          labelPeriode={labelPeriode}
          isRentangPenuh={!isSingleMonth}
          onSelectPangkalan={(kode) => navigate(`/pangkalan/${kode}`)}
        />

        {/* Baris Statistik Sebaran LOF & Jejak Bulanan */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4 pt-4 border-t border-[var(--border-rule)] items-start">
          {/* Kuartil Sebaran LOF */}
          <div className="lg:col-span-5 lg:border-r border-[var(--border-rule)] lg:pr-6">
            <div className="font-tabular text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] mb-2">
              Ringkasan Statistik Skor LOF ({labelPeriode})
            </div>
            <div className="grid grid-cols-5 gap-2 border-t border-b border-[var(--border-rule)] py-2.5 font-tabular">
              <div>
                <span className="text-[11px] text-[var(--text-soft)] block">Minimum</span>
                <Angka value={ringkasan.sebaran_lof.min} decimals={2} size="md" />
              </div>
              <div>
                <span className="text-[11px] text-[var(--text-soft)] block">Kuartil 1</span>
                <Angka value={ringkasan.sebaran_lof.q1} decimals={2} size="md" />
              </div>
              <div>
                <span className="text-[11px] text-[var(--text-soft)] block">Median</span>
                <Angka value={ringkasan.sebaran_lof.median} decimals={2} size="md" />
              </div>
              <div>
                <span className="text-[11px] text-[var(--text-soft)] block">Kuartil 3</span>
                <Angka value={ringkasan.sebaran_lof.q3} decimals={2} size="md" />
              </div>
              <div>
                <span className="text-[11px] text-[var(--text-soft)] block">Maksimum</span>
                <Angka value={ringkasan.sebaran_lof.maks} decimals={2} size="md" anomali />
              </div>
            </div>
          </div>

          {/* Klik Cepat Ditandai per Bulan Jan-Okt (2, 4, 3, 3, 2, 2, 2, 2, 5, 3) */}
          <div className="lg:col-span-7">
            <div className="flex items-baseline justify-between mb-2">
              <span className="font-tabular text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Ditandai per Bulan (Jan–Okt 2026) — Klik bulan untuk menggeser titik LOF
              </span>
              {isSingleMonth && (
                <button
                  type="button"
                  onClick={() => setBulanAktif(null)}
                  className="font-tabular text-xs underline underline-offset-4 text-[var(--text-ink)] hover:text-[var(--accent-anomali-teks)] cursor-pointer"
                >
                  Tampilkan Semua (Jan–Okt)
                </button>
              )}
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
              {ringkasan.ditandai_per_bulan.map((m) => {
                const active = bulanAktif === m.bulan;
                return (
                  <button
                    key={m.bulan}
                    type="button"
                    onClick={() => setBulanAktif(active ? null : m.bulan)}
                    data-testid={`ringkasan-bulan-btn-${m.bulan}`}
                    className={`p-2 border text-center font-tabular transition-colors cursor-pointer ${
                      active
                        ? 'border-[var(--border-strong)] bg-[var(--text-ink)] text-[var(--surface-paper)] font-semibold'
                        : m.ditandai >= 4
                          ? 'border-[#D9480F]/60 bg-[var(--accent-anomali-bg)] text-[var(--text-ink)] hover:border-[#D9480F]'
                          : 'border-[var(--border-rule)] bg-[var(--surface-subtle)]/35 text-[var(--text-ink)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <span className="text-[10px] opacity-75 block">{m.label_bulan}</span>
                    <span
                      className={`text-sm font-semibold ${
                        active
                          ? 'opacity-95'
                          : m.ditandai >= 4
                            ? 'text-[var(--accent-anomali-teks)]'
                            : ''
                      }`}
                    >
                      {m.ditandai}
                    </span>
                    <span className="text-[10px] opacity-65 block">/{m.dinilai}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <AturanGaris
        varian="tegas"
        label="Komposisi Kategori Konsistensi Pangkalan"
        metaRight="Klasifikasi Lintas 10 Bulan"
      />

      {/* Komposisi Kategori sebagai SATU Bar Bertumpuk Berlabel */}
      <section aria-label="Komposisi kategori pangkalan">
        <KategoriStackedBar
          perKategori={ringkasan.per_kategori}
          onSelectKategori={(kat) => navigate(`/prioritas?kategori=${encodeURIComponent(kat)}`)}
        />
      </section>

      {/* Baris Pendamping: Ringkasan Flag Aturan Deterministik (Berdampingan, Tidak Digabung) */}
      <section
        aria-label="Ikhtisar aturan deterministik pendamping"
        className="border-t border-b border-[var(--border-rule)] py-5"
      >
        <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-2 mb-4">
          <div>
            <h3 className="font-editorial text-lg font-bold text-[var(--text-ink)]">
              Tanda Aturan Administratif Pendamping ({labelPeriode})
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Dihitung terpisah dan disajikan berdampingan dengan skor LOF (tidak digabung ke dalam
              skor anomali).
            </p>
          </div>
          <Link
            to="/temuan-aturan"
            className="font-tabular text-xs uppercase tracking-wider underline underline-offset-4 text-[var(--text-ink)] hover:text-[var(--accent-anomali-teks)]"
          >
            Rincian Temuan Aturan →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-tabular">
          {[
            {
              key: 'melebihi_alokasi',
              label: 'Melebihi Alokasi',
              catatan: 'Tanpa Februari',
              val: ringkasan.flag_aturan.melebihi_alokasi,
            },
            {
              key: 'gt_2x_alokasi',
              label: '> 2× Alokasi',
              catatan: 'Tanpa Februari',
              val: ringkasan.flag_aturan.gt_2x_alokasi,
            },
            {
              key: 'nol',
              label: 'Nol Sebulan',
              catatan: 'Tidak masuk model',
              val: ringkasan.flag_aturan.nol,
            },
            {
              key: 'lonjakan',
              label: 'Lonjakan 1 Hari',
              catatan: '>40% pd ≤3 hr aktif',
              val: ringkasan.flag_aturan.lonjakan,
            },
            {
              key: 'seragam',
              label: 'Pola Seragam',
              catatan: '≥90% nilai identik',
              val: ringkasan.flag_aturan.seragam,
            },
            {
              key: 'fakultatif',
              label: 'Ada Fakultatif',
              catatan: 'Dropping tambahan',
              val: ringkasan.flag_aturan.fakultatif,
            },
          ].map((item) => (
            <div
              key={item.key}
              className="border border-[var(--border-rule)] bg-[var(--surface-subtle)]/30 p-3"
            >
              <span className="text-xs text-[var(--text-ink)] font-medium block">{item.label}</span>
              <span className="text-[10px] text-[var(--text-soft)] block mb-1.5">
                {item.catatan}
              </span>
              <Angka value={item.val} size="lg" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
