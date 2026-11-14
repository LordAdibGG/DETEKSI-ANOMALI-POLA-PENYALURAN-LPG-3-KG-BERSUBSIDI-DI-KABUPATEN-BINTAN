import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  buildPrioritasCsvString,
  fetchPrioritas,
  getRuntimeRuns,
  getSnapshotPrioritas,
  getSnapshotRingkasan,
  STATUS_TINDAK_LANJUT_LABELS,
  type PrioritasItem,
  type TindakLanjutStatus,
} from '../api/pantau';
import {
  EDITORIAL_EASE,
  formatIndonesianNumber,
  usePrefersReducedMotion,
} from '../components/motion/Primitives';
import { Angka } from '../components/ui/Angka';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { TagKategori } from '../components/ui/TagKategori';
import { useAuth } from '../context/AuthContext';
import { useFilterBulan } from '../context/FilterBulanContext';

const KATEGORI_CHIPS = [
  { key: 'Semua', label: 'Semua', count: 30 },
  { key: 'Sporadis', label: 'Sporadis', count: 6 },
  { key: 'Berulang', label: 'Berulang', count: 3 },
  { key: 'Konsisten tinggi', label: 'Konsisten tinggi', count: 1 },
  { key: 'Normal', label: 'Normal', count: 18 },
  { key: 'Data kurang', label: 'Data kurang', count: 1 },
  { key: 'Tidak dinilai', label: 'Tidak dinilai', count: 1 },
] as const;

const SORT_OPTIONS = [
  { value: 'maks_lof_desc', label: 'LOF Tertinggi (Maks ↓)' },
  { value: 'bulan_flag_desc', label: 'Bulan Ditandai Terbanyak (↓)' },
  { value: 'prioritas', label: 'Urutan Buku Besar / Bulan Aktif' },
  { value: 'kode_asc', label: 'Kode Pangkalan (P01 → P30)' },
  { value: 'maks_lof_asc', label: 'LOF Terendah (↑)' },
] as const;

const SHORT_RULE_LABELS: Record<string, string> = {
  melebihi_alokasi: '> Alokasi',
  gt_2x_alokasi: '> 2× Alokasi',
  nol: 'Nol Bulanan',
  lonjakan: 'Lonjakan 1 Hari',
  seragam: 'Pola Seragam',
  fakultatif: 'Fakultatif',
};

export function PrioritasPage() {
  const { bulanAktif, infoBulanAktif } = useFilterBulan();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const reducedMotion = usePrefersReducedMotion();

  const kategoriParam = searchParams.get('kategori') || 'Semua';
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get('q') || '');
  const [sortBy, setSortBy] = useState<string>(searchParams.get('sort') || 'maks_lof_desc');
  const [hanyaDitandaiBulanIni, setHanyaDitandaiBulanIni] = useState<boolean>(false);

  const isAdmin = user?.role === 'admin';
  const ringkasanAcuan = useMemo(() => getSnapshotRingkasan(bulanAktif), [bulanAktif]);
  const activeRunInfo = useMemo(() => getRuntimeRuns(user?.role ?? 'petugas')[0], [user?.role]);
  const allActiveItems = useMemo(
    () => getSnapshotPrioritas({ bulan: bulanAktif, role: user?.role ?? 'petugas' }),
    [bulanAktif, user?.role, activeRunInfo?.id]
  );

  const dynamicKategoriChips = useMemo(() => {
    const counts: Record<string, number> = {
      Semua: allActiveItems.length || 30,
      Sporadis: 0,
      Berulang: 0,
      'Konsisten tinggi': 0,
      Normal: 0,
      'Data kurang': 0,
      'Tidak dinilai': 0,
    };
    allActiveItems.forEach((it) => {
      counts[it.kategori] = (counts[it.kategori] ?? 0) + 1;
    });
    return KATEGORI_CHIPS.map((c) => ({
      ...c,
      count: counts[c.key] ?? c.count,
    }));
  }, [allActiveItems]);

  const handleExportCsv = () => {
    const csvContent = buildPrioritasCsvString(rows, user?.role ?? 'petugas');
    if (typeof window !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prioritas-pemeriksaan-kjp-2026.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  };

  const setKategoriChip = (kat: string) => {
    const next = new URLSearchParams(searchParams);
    if (kat === 'Semua') {
      next.delete('kategori');
    } else {
      next.set('kategori', kat);
    }
    setSearchParams(next, { replace: true });
  };

  const { data, isLoading } = useQuery({
    queryKey: [
      'prioritas',
      bulanAktif,
      kategoriParam,
      searchQuery,
      sortBy,
      user?.role,
      activeRunInfo?.id,
    ],
    queryFn: () =>
      fetchPrioritas({
        bulan: bulanAktif,
        kategori: kategoriParam === 'Semua' ? null : kategoriParam,
        q: searchQuery,
        sort: sortBy,
        role: user?.role ?? 'petugas',
        token,
      }),
    initialData: () =>
      getSnapshotPrioritas({
        bulan: bulanAktif,
        kategori: kategoriParam === 'Semua' ? null : kategoriParam,
        q: searchQuery,
        sort: sortBy,
        role: user?.role ?? 'petugas',
      }),
  });

  const rows: PrioritasItem[] = useMemo(() => {
    const list = data ?? [];
    if (bulanAktif !== null && hanyaDitandaiBulanIni) {
      return list.filter((r) => Boolean(r.flag_bulan_dipilih));
    }
    return list;
  }, [data, bulanAktif, hanyaDitandaiBulanIni]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setHanyaDitandaiBulanIni(false);
    setKategoriChip('Semua');
  };

  return (
    <div data-testid="prioritas-page">
      <div className="space-y-6">
      {/* Kepala Halaman Daftar Prioritas */}
      <header className="border-b-2 border-[var(--border-strong)] pb-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="font-tabular text-xs uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1.5">
              Bagian II · Daftar Prioritas Pemeriksaan ·{' '}
              <strong className="text-[var(--text-ink)]">
                {infoBulanAktif ? `${infoBulanAktif.nama} 2026` : 'Januari–Oktober 2026'}
              </strong>
            </div>
            <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-[var(--text-ink)]">
              Prioritas Pemeriksaan Lapangan (P01–P30)
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1.5 max-w-3xl leading-relaxed">
              Urutan pemeriksaan disusun sebagai{' '}
              <strong className="text-[var(--text-ink)] font-semibold">
                indikasi awal, bukan bukti pelanggaran
              </strong>
              . Skor LOF disajikan berdampingan dengan tanda aturan administratif dan kalimat alasan
              berdasarkan fitur <span className="font-tabular">|z|</span> terbesar.
            </p>
          </div>

          {/* Ringkasan Singkat Konteks Bulan Aktif + Aksi Ekspor CSV & Cetak */}
          <div className="flex flex-col items-start lg:items-end gap-2.5 shrink-0">
            <div className="font-tabular text-xs border border-[var(--border-rule)] bg-[var(--surface-subtle)]/40 px-4 py-2.5">
              <div className="text-[var(--text-muted)] uppercase tracking-wider">
                {infoBulanAktif ? `Status ${infoBulanAktif.nama} 2026` : 'Status Jan–Okt 2026'} · Run:{' '}
                <strong>{activeRunInfo?.nama ?? 'baseline-k10'}</strong>
              </div>
              <div className="mt-1 text-sm">
                <strong className="text-[var(--accent-anomali-teks)] font-semibold">
                  {ringkasanAcuan.jumlah_ditandai} ditandai
                </strong>{' '}
                dari <strong>{ringkasanAcuan.jumlah_dinilai}</strong> dinilai · Menampilkan{' '}
                <strong>{rows.length}</strong> pangkalan
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 print-hidden">
              <Button
                variant="sekunder"
                size="sm"
                data-testid="btn-export-csv-prioritas"
                onClick={handleExportCsv}
              >
                Unduh CSV Prioritas
              </Button>
              <Button
                variant="sekunder"
                size="sm"
                data-testid="btn-cetak-prioritas"
                onClick={handlePrint}
              >
                Cetak Lembar Prioritas
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Kop Cetak Resmi (Hanya Tampil Saat Cetak / @media print) */}
      <div
        data-testid="print-header-prioritas"
        className="print-only border-b-2 border-black pb-3 mb-4"
      >
        <div className="font-tabular text-xs uppercase tracking-widest">
          PEMERINTAH KABUPATEN BINTAN · BAGIAN PEREKONOMIAN SETDA &amp; TIM MONEV LPG 3 KG
        </div>
        <div className="font-editorial text-2xl font-bold mt-1">
          Lembar Prioritas Pemeriksaan Lapangan Pangkalan LPG 3 kg (Run: {activeRunInfo?.nama})
        </div>
        <div className="font-tabular text-xs mt-1">
          Catatan: Urutan prioritas merupakan indikasi awal pemeriksaan lapangan, bukan bukti
          pelanggaran administratif.
        </div>
      </div>

      {/* Bilah Saringan: Chip Kategori, Pencarian Kode, dan Sort */}
      <section
        aria-label="Saringan dan pengurutan daftar prioritas"
        className="space-y-3 border-b border-[var(--border-rule)] pb-4"
      >
        {/* Baris 1: Chip Kategori */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter kategori pangkalan">
          <span className="font-tabular text-[11px] uppercase tracking-wider text-[var(--text-muted)] mr-1.5">
            Kategori:
          </span>
          {dynamicKategoriChips.map((chip) => {
            const active = kategoriParam.toLowerCase() === chip.key.toLowerCase();
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setKategoriChip(chip.key)}
                aria-pressed={active}
                data-testid={`chip-kategori-${chip.key}`}
                className={`px-3 py-1 font-tabular text-xs uppercase tracking-wider border transition-colors cursor-pointer ${
                  active
                    ? 'border-[var(--border-strong)] bg-[var(--text-ink)] text-[var(--surface-paper)] font-semibold'
                    : 'border-[var(--border-rule)] bg-[var(--surface-subtle)]/35 text-[var(--text-ink)] hover:border-[var(--border-strong)]'
                }`}
              >
                <span>{chip.label}</span>
                <span className="ml-1.5 opacity-75">({chip.count})</span>
              </button>
            );
          })}

          {bulanAktif !== null && (
            <button
              type="button"
              onClick={() => setHanyaDitandaiBulanIni((v) => !v)}
              aria-pressed={hanyaDitandaiBulanIni}
              data-testid="chip-hanya-ditandai-bulan-ini"
              className={`ml-auto px-3 py-1 font-tabular text-xs uppercase tracking-wider border transition-colors cursor-pointer ${
                hanyaDitandaiBulanIni
                  ? 'border-[#D9480F] bg-[#D9480F] text-[#F3EFE4] font-semibold'
                  : 'border-[#D9480F] text-[var(--accent-anomali-teks)] hover:bg-[var(--accent-anomali-bg)]'
              }`}
            >
              Hanya Ditandai Bulan {infoBulanAktif?.singkat} ({ringkasanAcuan.jumlah_ditandai})
            </button>
          )}
        </div>

        {/* Baris 2: Pencarian Kode & Pengurutan */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="relative flex-1 max-w-md">
            <label htmlFor="cari-prioritas" className="sr-only">
              Cari kode pangkalan atau kecamatan
            </label>
            <input
              id="cari-prioritas"
              data-testid="input-cari-prioritas"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isAdmin
                  ? 'Cari kode (mis. P01), nama pangkalan, atau kecamatan...'
                  : 'Cari kode pangkalan (mis. P01–P30) atau kecamatan...'
              }
              className="w-full px-3 py-1.5 border border-[var(--border-strong)] bg-[var(--surface-paper)] font-tabular text-xs text-[var(--text-ink)] placeholder:text-[var(--text-soft)] focus:border-[#D9480F]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 font-tabular text-xs">
            <label htmlFor="urut-prioritas" className="text-[var(--text-muted)] uppercase tracking-wider">
              Urutkan:
            </label>
            <select
              id="urut-prioritas"
              data-testid="select-sort-prioritas"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-1.5 border border-[var(--border-strong)] bg-[var(--surface-paper)] font-tabular text-xs text-[var(--text-ink)] cursor-pointer focus:border-[#D9480F]"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Tabel Buku Besar Prioritas */}
      {isLoading && rows.length === 0 ? (
        <Skeleton varian="tabel" baris={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          judul="Tidak ada pangkalan yang sesuai dengan saringan"
          deskripsi="Coba ubah chip kategori, kosongkan kotak pencarian kode, atau pilih seluruh rentang bulan pada Pita Bulan."
          labelAksi="Atur Ulang Saringan"
          onAksi={handleResetFilters}
        />
      ) : (
        <div className="w-full overflow-x-auto">
          <table
            data-testid="tabel-prioritas"
            className="w-full border-collapse text-left"
          >
            <thead>
              <tr className="border-t-2 border-b border-[var(--border-strong)] bg-[var(--surface-subtle)]/55 font-tabular text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                <th scope="col" className="py-2.5 px-3 w-44">
                  Kode {isAdmin ? '& Nama Pangkalan' : 'Pangkalan'}
                </th>
                <th scope="col" className="py-2.5 px-3 w-40">
                  Kategori
                </th>
                <th scope="col" className="py-2.5 px-3 w-64">
                  Strip 10 Bulan (Jan–Okt)
                </th>
                <th scope="col" className="py-2.5 px-3 text-right w-28">
                  <button
                    type="button"
                    onClick={() =>
                      setSortBy((prev) =>
                        prev === 'maks_lof_desc' ? 'maks_lof_asc' : 'maks_lof_desc'
                      )
                    }
                    className="inline-flex items-center justify-end gap-1 uppercase tracking-[0.12em] hover:text-[var(--text-ink)] cursor-pointer"
                  >
                    <span>LOF Tertinggi</span>
                    <span aria-hidden="true">
                      {sortBy === 'maks_lof_desc' ? '↓' : sortBy === 'maks_lof_asc' ? '↑' : '↕'}
                    </span>
                  </button>
                </th>
                <th scope="col" className="py-2.5 px-3 w-52">
                  Tanda Aturan
                </th>
                <th scope="col" className="py-2.5 px-3">
                  Alasan Penandaan ({infoBulanAktif ? infoBulanAktif.singkat : 'Puncak |z|'})
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-rule)] border-b border-[var(--border-strong)]">
              {rows.map((row) => {
                const isFlaggedRow =
                  bulanAktif !== null
                    ? Boolean(row.flag_bulan_dipilih)
                    : (row.maks_lof ?? 0) >= 1.5;

                const activeRuleBadges = Object.entries(row.flag_aturan.per_jenis).filter(
                  ([, count]) => count > 0
                );

                return (
                  <motion.tr
                    key={row.kode}
                    layout={!reducedMotion}
                    transition={{ duration: 0.24, ease: EDITORIAL_EASE }}
                    onClick={() => navigate(`/pangkalan/${row.kode}`)}
                    data-testid={`prioritas-row-${row.kode}`}
                    data-flagged={isFlaggedRow ? 'true' : 'false'}
                    className={`group cursor-pointer transition-colors duration-150 ${
                      isFlaggedRow
                        ? 'bg-[var(--accent-anomali-bg)] hover:bg-[#D9480F]/15'
                        : 'hover:bg-[var(--surface-subtle)]/70'
                    }`}
                  >
                    {/* Kolom 1: Kode (dengan layoutId untuk transisi ke profil di Fase 6) */}
                    <td
                      className={`py-3 px-3 align-top ${
                        isFlaggedRow
                          ? 'border-l-2 border-l-[#D9480F]'
                          : 'border-l-2 border-l-transparent'
                      }`}
                    >
                      <motion.div
                        layoutId={!reducedMotion ? `pangkalan-header-${row.kode}` : undefined}
                        className="inline-flex items-baseline gap-2"
                      >
                        <span className="font-tabular text-sm font-semibold text-[var(--text-ink)] group-hover:underline underline-offset-4">
                          {row.kode}
                        </span>
                        {row.non_reguler && (
                          <span className="font-tabular text-[10px] uppercase px-1 py-0.2 border border-[var(--border-rule)] text-[var(--text-muted)]">
                            Non-Reg
                          </span>
                        )}
                      </motion.div>

                      {isAdmin && row.nama && (
                        <div className="text-xs font-medium text-[var(--text-ink)] mt-0.5 leading-snug">
                          {row.nama}
                        </div>
                      )}
                      {row.kecamatan && (
                        <div className="font-tabular text-[11px] text-[var(--text-soft)] mt-0.5">
                          {row.kecamatan}
                        </div>
                      )}
                    </td>

                    {/* Kolom 2: Kategori (Tag) & Status Tindak Lanjut */}
                    <td className="py-3 px-3 align-top space-y-1">
                      <TagKategori kategori={row.kategori} compact />
                      <span
                        data-testid={`prioritas-tl-status-${row.kode}`}
                        className="block font-tabular text-[10px] text-[var(--text-muted)]"
                      >
                        {STATUS_TINDAK_LANJUT_LABELS[
                          (row.tindak_lanjut_status as TindakLanjutStatus) || 'belum_diperiksa'
                        ] ?? row.tindak_lanjut_status}
                      </span>
                    </td>

                    {/* Kolom 3: Strip 10 Sel (Bulan Ditandai Jan-Okt) */}
                    <td className="py-3 px-3 align-top">
                      <div className="flex items-center gap-2">
                        <div
                          role="img"
                          aria-label={`Strip 10 bulan untuk ${row.kode}: ${row.bulan_flag} bulan ditandai dari ${row.bulan_valid} bulan aktif`}
                          className="inline-grid grid-cols-10 gap-1"
                        >
                          {row.strip_10_bulan.map((cell) => {
                            const isSelectedMonth = bulanAktif === cell.bulan;
                            const cellStyle =
                              cell.status === 'ditandai'
                                ? 'bg-[#D9480F] border-[#D9480F] text-[#F3EFE4]'
                                : cell.status === 'nol'
                                  ? 'bg-transparent border-dashed border-[var(--text-soft)] text-[var(--text-soft)]'
                                  : 'bg-[var(--surface-subtle)] border-[var(--border-rule)] text-[var(--text-muted)]';

                            return (
                              <span
                                key={cell.bulan}
                                title={`${cell.label} 2026: ${
                                  cell.status === 'nol'
                                    ? 'Volume nol (tidak dinilai)'
                                    : `LOF ${formatIndonesianNumber(cell.lof ?? 0, 2)}${
                                        cell.flag ? ' (Ditandai)' : ''
                                      }`
                                }`}
                                data-status={cell.status}
                                className={`w-4 h-5 border flex items-center justify-center font-tabular text-[9px] leading-none ${cellStyle} ${
                                  isSelectedMonth
                                    ? 'ring-1 ring-[var(--border-strong)] underline font-bold'
                                    : ''
                                }`}
                              >
                                {cell.status === 'ditandai'
                                  ? '!'
                                  : cell.status === 'nol'
                                    ? '0'
                                    : '·'}
                              </span>
                            );
                          })}
                        </div>
                        <span className="font-tabular text-xs text-[var(--text-muted)] shrink-0">
                          {row.bulan_flag}/{row.bulan_valid}
                        </span>
                      </div>
                    </td>

                    {/* Kolom 4: LOF Tertinggi */}
                    <td className="py-3 px-3 align-top text-right font-tabular">
                      <div>
                        <Angka
                          value={row.maks_lof}
                          decimals={2}
                          animate={false}
                          thresholdAnomali={1.5}
                          size="md"
                        />
                        {row.bulan_maks && (
                          <span className="block text-[11px] text-[var(--text-soft)]">
                            Puncak: {row.bulan_maks}
                          </span>
                        )}
                        {bulanAktif !== null && (
                          <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                            {infoBulanAktif?.singkat}:{' '}
                            {row.lof_bulan_dipilih !== null
                              ? formatIndonesianNumber(row.lof_bulan_dipilih, 2)
                              : 'Nol'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Kolom 5: Tanda Aturan */}
                    <td className="py-3 px-3 align-top">
                      {activeRuleBadges.length === 0 ? (
                        <span className="font-tabular text-xs text-[var(--text-soft)]">
                          Tidak ada flag aturan
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {activeRuleBadges.map(([jenis, count]) => (
                            <span
                              key={jenis}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-[var(--border-rule)] bg-[var(--surface-paper)] font-tabular text-[11px] text-[var(--text-ink)]"
                            >
                              <span>{SHORT_RULE_LABELS[jenis] ?? jenis}</span>
                              {count > 1 && (
                                <strong className="text-[var(--text-muted)]">×{count}</strong>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Kolom 6: Alasan */}
                    <td className="py-3 px-3 align-top">
                      <p className="text-xs text-[var(--text-ink)] leading-relaxed">
                        {row.alasan}
                      </p>
                      {row.alasan_detail.label_bulan && (
                        <span className="font-tabular text-[11px] text-[var(--text-soft)] block mt-0.5">
                          Rujukan: {row.alasan_detail.label_bulan} 2026
                        </span>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
