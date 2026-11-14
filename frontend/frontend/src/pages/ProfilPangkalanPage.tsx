import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scaleLinear } from 'd3-scale';
import { motion } from 'motion/react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchProfilPangkalan,
  getSnapshotProfilPangkalan,
  type LaporanBulananProfil,
} from '../api/pantau';
import {
  EDITORIAL_EASE,
  formatIndonesianNumber,
  usePrefersReducedMotion,
} from '../components/motion/Primitives';
import { Angka } from '../components/ui/Angka';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { TagKategori } from '../components/ui/TagKategori';
import { useAuth } from '../context/AuthContext';
import { useFilterBulan } from '../context/FilterBulanContext';

const BULAN_MAP: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  Mei: 5,
  Jun: 6,
  Jul: 7,
  Agu: 8,
  Sep: 9,
  Okt: 10,
};

export function ProfilPangkalanPage() {
  const { kode = 'P01' } = useParams<{ kode: string }>();
  const normalizedKode = kode.trim().toUpperCase();

  const { user, token } = useAuth();
  const { bulanAktif, setBulanAktif } = useFilterBulan();
  const reducedMotion = usePrefersReducedMotion();

  const isAdmin = user?.role === 'admin';

  const { data: profil } = useQuery({
    queryKey: ['profil-pangkalan', normalizedKode, user?.role],
    queryFn: () => fetchProfilPangkalan(normalizedKode, user?.role ?? 'petugas', token),
    initialData: () => getSnapshotProfilPangkalan(normalizedKode, user?.role ?? 'petugas'),
  });

  if (!profil) {
    return (
      <EmptyState
        kode="404 · PANGKALAN TIDAK DITEMUKAN"
        judul={`Kode pangkalan ${normalizedKode} tidak terdaftar`}
        deskripsi="Kode pangkalan yang valid berada pada rentang P01 sampai P30 sesuai urutan klasifikasi KJP 2026."
      >
        <Link to="/prioritas">
          <Button variant="utama" size="sm">
            Kembali ke Daftar Prioritas
          </Button>
        </Link>
      </EmptyState>
    );
  }

  // Tentukan bulan yang sedang dilihat pada profil: bulanAktif dari Pita Bulan/URL, atau bulan_maks pangkalan, atau Januari
  const defaultMonth =
    (profil.klasifikasi.bulan_maks && BULAN_MAP[profil.klasifikasi.bulan_maks]) || 1;
  const selectedMonth = bulanAktif ?? defaultMonth;

  const laporanBulanIni: LaporanBulananProfil =
    profil.laporan_bulanan.find((l) => l.bulan === selectedMonth) ?? profil.laporan_bulanan[0];

  // Navigasi Pangkalan Sebelumnya / Berikutnya (P01..P30)
  const numIdx = Number.parseInt(normalizedKode.replace(/\D/g, ''), 10) || 1;
  const prevKode = numIdx > 1 ? `P${String(numIdx - 1).padStart(2, '0')}` : null;
  const nextKode = numIdx < 30 ? `P${String(numIdx + 1).padStart(2, '0')}` : null;

  return (
    <div data-testid="profil-pangkalan-page" className="space-y-8">
      {/* Bilah Navigasi Atas Lembar Profil */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-rule)] pb-3 font-tabular text-xs">
        <div className="flex items-center gap-4">
          <Link
            to="/prioritas"
            className="underline underline-offset-4 text-[var(--text-ink)] hover:text-[var(--accent-anomali-teks)]"
          >
            ← Daftar Prioritas
          </Link>
          <span className="text-[var(--text-soft)]">·</span>
          <Link
            to="/peta-panas"
            className="underline underline-offset-4 text-[var(--text-ink)] hover:text-[var(--accent-anomali-teks)]"
          >
            ← Peta Panas
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {prevKode && (
            <Link
              to={`/pangkalan/${prevKode}${bulanAktif ? `?bulan=${bulanAktif}` : ''}`}
              className="px-2 py-0.5 border border-[var(--border-rule)] hover:border-[var(--border-strong)]"
            >
              ← {prevKode}
            </Link>
          )}
          <span className="text-[var(--text-muted)]">Profil {profil.kode} dari 30</span>
          {nextKode && (
            <Link
              to={`/pangkalan/${nextKode}${bulanAktif ? `?bulan=${bulanAktif}` : ''}`}
              className="px-2 py-0.5 border border-[var(--border-rule)] hover:border-[var(--border-strong)]"
            >
              {nextKode} →
            </Link>
          )}
        </div>
      </div>

      {/* Header Profil yang Berpindah dari Baris Prioritas via layoutId */}
      <header className="border-b-2 border-[var(--border-strong)] pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-8">
            <div className="font-tabular text-xs uppercase tracking-[0.15em] text-[var(--text-muted)] mb-2">
              Lembar Profil Pangkalan · Agen {profil.agen} ·{' '}
              {profil.kecamatan ?? 'Kecamatan Belum Dipetakan'}
              {profil.kelurahan ? ` (${profil.kelurahan})` : ''}
            </div>

            <motion.div
              layoutId={!reducedMotion ? `pangkalan-header-${profil.kode}` : undefined}
              transition={{ duration: 0.28, ease: EDITORIAL_EASE }}
              data-testid="profil-shared-header"
              className="flex flex-wrap items-baseline gap-3"
            >
              <h1 className="font-editorial text-4xl sm:text-5xl font-bold text-[var(--text-ink)]">
                {profil.kode}
              </h1>
              <TagKategori kategori={profil.klasifikasi.kategori} />
              {profil.non_reguler && (
                <span className="font-tabular text-xs uppercase px-2 py-0.5 border border-[var(--border-strong)] text-[var(--text-ink)]">
                  Profil Non-Reguler
                </span>
              )}
            </motion.div>

            {isAdmin && profil.nama && (
              <div className="mt-1.5 font-tabular text-sm text-[var(--text-ink)]">
                Identitas Pangkalan (Admin): <strong>{profil.nama}</strong>
                {profil.id_registrasi ? ` · ID Reg. ${profil.id_registrasi}` : ''}
              </div>
            )}

            {/* Kalimat Alasan Utama & Prinsip Kehati-hatian */}
            <p
              data-testid="profil-header-alasan"
              className="mt-3 text-sm text-[var(--text-ink)] leading-relaxed max-w-3xl border-l-2 border-[#D9480F] pl-3.5 py-0.5"
            >
              <strong className="font-semibold">
                Alasan penandaan ({laporanBulanIni.label_bulan} 2026):
              </strong>{' '}
              {laporanBulanIni.alasan}.{' '}
              <span className="text-[var(--text-muted)]">
                Hasil ini merupakan <strong>indikasi awal, bukan bukti pelanggaran</strong>.
              </span>
            </p>
          </div>

          {/* Ringkasan Metrik Konsistensi 10 Bulan */}
          <div className="lg:col-span-4 border border-[var(--border-rule)] bg-[var(--surface-subtle)]/40 p-4 font-tabular text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="text-[10px] text-[var(--text-soft)] uppercase block">
                  Bulan Ditandai
                </span>
                <span
                  data-testid="profil-bulan-ditandai"
                  className="text-xl font-bold text-[var(--accent-anomali-teks)]"
                >
                  {profil.klasifikasi.bulan_flag}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {' '}
                  / {profil.klasifikasi.bulan_valid} bln
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-soft)] uppercase block">
                  LOF Maksimum
                </span>
                <Angka
                  value={profil.klasifikasi.maks_lof}
                  decimals={2}
                  animate={false}
                  thresholdAnomali={1.5}
                  size="lg"
                />
                {profil.klasifikasi.bulan_maks && (
                  <span className="block text-[10px] text-[var(--text-soft)]">
                    ({profil.klasifikasi.bulan_maks})
                  </span>
                )}
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-soft)] uppercase block">
                  Beruntun Maks
                </span>
                <span className="text-xl font-bold text-[var(--text-ink)]">
                  {profil.klasifikasi.run_terpanjang}
                </span>
                <span className="text-xs text-[var(--text-muted)]"> bln</span>
              </div>
            </div>
            {profil.klasifikasi.bulan_yang_ditandai && (
              <div
                data-testid="profil-daftar-bulan-ditandai"
                className="mt-2.5 pt-2 border-t border-[var(--border-rule)] text-[11px] text-[var(--text-muted)]"
              >
                Bulan ditandai:{' '}
                <strong className="text-[var(--text-ink)]">
                  {profil.klasifikasi.bulan_yang_ditandai}
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* Pemilih Bulan Profil (Jan - Okt) */}
        <div className="mt-5 pt-4 border-t border-[var(--border-rule)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Pilih bulan rincian profil">
            <span className="font-tabular text-xs uppercase tracking-wider text-[var(--text-muted)] mr-1">
              Bulan Rincian:
            </span>
            {profil.laporan_bulanan.map((lap) => {
              const active = lap.bulan === selectedMonth;
              return (
                <button
                  key={lap.bulan}
                  type="button"
                  onClick={() => setBulanAktif(lap.bulan)}
                  aria-pressed={active}
                  data-testid={`profil-pilih-bulan-${lap.bulan}`}
                  className={`px-2.5 py-1 font-tabular text-xs border transition-colors cursor-pointer flex items-baseline gap-1 ${
                    active
                      ? 'border-[var(--border-strong)] bg-[var(--text-ink)] text-[var(--surface-paper)] font-semibold'
                      : lap.flag
                        ? 'border-[#D9480F] bg-[var(--accent-anomali-bg)] text-[var(--accent-anomali-teks)] font-semibold'
                        : 'border-[var(--border-rule)] bg-[var(--surface-subtle)]/35 text-[var(--text-ink)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <span>{lap.label_bulan}</span>
                  <span className="text-[10px] opacity-80">
                    {lap.nol
                      ? '(Nol)'
                      : lap.lof !== null
                        ? formatIndonesianNumber(lap.lof, 2)
                        : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* EMPAT BLOK VISUALISASI PROFIL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* BLOK (1): Volume Harian Satu Bulan sebagai Batang, Minggu Abu-Abu, Pemilih Bulan */}
        <section
          aria-labelledby="blok-1-judul"
          data-testid="profil-blok-1-harian"
          className="lg:col-span-7 border border-[var(--border-strong)] bg-[var(--surface-paper)] p-5 flex flex-col justify-between"
        >
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border-rule)] pb-3 mb-4">
              <div>
                <span className="font-tabular text-[11px] uppercase tracking-wider text-[var(--text-muted)] block">
                  Blok 01 · Penyaluran Harian ({laporanBulanIni.nama_bulan} 2026)
                </span>
                <h2 id="blok-1-judul" className="font-editorial text-xl font-bold text-[var(--text-ink)]">
                  Volume Harian Satu Bulan & Penanda Hari Minggu
                </h2>
              </div>
              <div className="font-tabular text-xs text-[var(--text-muted)]">
                Hari aktif:{' '}
                <strong className="text-[var(--text-ink)]">
                  {laporanBulanIni.alokasi_vs_realisasi?.hari_aktif ?? 0}
                </strong>{' '}
                / {laporanBulanIni.alokasi_vs_realisasi?.n_hari_kerja ?? 26} hari kerja
              </div>
            </div>

            <BlokVolumeHarianSvg laporan={laporanBulanIni} />
          </div>

          <p className="mt-4 pt-3 border-t border-[var(--border-rule)] text-xs text-[var(--text-muted)] leading-relaxed">
            <strong className="text-[var(--text-ink)] font-tabular uppercase">
              Cara membaca:
            </strong>{' '}
            Setiap batang vertikal menunjukkan volume tabung 3 kg pada tanggal terkait. Kolom
            berlatar abu-abu bertanda <strong>M</strong> adalah hari Minggu yang dikeluarkan dari
            perhitungan model LOF. Sebaran tinggi batang pada hari kerja membentuk fitur variasi
            harian (<span className="font-tabular">cv_harian</span>) dan porsi nilai dominan.
          </p>
        </section>

        {/* BLOK (2): LOF 10 Bulan sebagai Garis yang Tergambar (pathLength) dengan Pita Batas 1,5 */}
        <section
          aria-labelledby="blok-2-judul"
          data-testid="profil-blok-2-lof-10-bulan"
          className="lg:col-span-5 border border-[var(--border-strong)] bg-[var(--surface-paper)] p-5 flex flex-col justify-between"
        >
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border-rule)] pb-3 mb-4">
              <div>
                <span className="font-tabular text-[11px] uppercase tracking-wider text-[var(--text-muted)] block">
                  Blok 02 · Lintasan Skor LOF (Jan–Okt 2026)
                </span>
                <h2 id="blok-2-judul" className="font-editorial text-xl font-bold text-[var(--text-ink)]">
                  Garis LOF 10 Bulan & Pita Batas 1,50
                </h2>
              </div>
              <span className="font-tabular text-xs text-[var(--accent-anomali-teks)] font-semibold">
                {profil.klasifikasi.bulan_flag} bln ≥ 1,50
              </span>
            </div>

            <BlokGarisLof10BulanSvg
              laporanList={profil.laporan_bulanan}
              selectedMonth={selectedMonth}
              onSelectMonth={(m) => setBulanAktif(m)}
              reducedMotion={reducedMotion}
            />
          </div>

          <p className="mt-4 pt-3 border-t border-[var(--border-rule)] text-xs text-[var(--text-muted)] leading-relaxed">
            <strong className="text-[var(--text-ink)] font-tabular uppercase">
              Cara membaca:
            </strong>{' '}
            Garis tergambar menghubungkan skor LOF pangkalan dari Januari hingga Oktober 2026. Pita
            berwarna di atas garis putus-putus <strong>1,50</strong> adalah zona penandaan anomali;
            klik salah satu titik bulan untuk memeriksa volume harian dan z-score bulan tersebut.
          </p>
        </section>

        {/* BLOK (3): Z-Score 4 Fitur vs Median Pangkalan Lain sebagai Lollipop di Sekitar 0 */}
        <section
          aria-labelledby="blok-3-judul"
          data-testid="profil-blok-3-lollipop-z"
          className="lg:col-span-6 border border-[var(--border-strong)] bg-[var(--surface-paper)] p-5 flex flex-col justify-between"
        >
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border-rule)] pb-3 mb-4">
              <div>
                <span className="font-tabular text-[11px] uppercase tracking-wider text-[var(--text-muted)] block">
                  Blok 03 · Decomposisi Fitur ({laporanBulanIni.nama_bulan} 2026)
                </span>
                <h2 id="blok-3-judul" className="font-editorial text-xl font-bold text-[var(--text-ink)]">
                  Z-Score 4 Fitur vs Median Pangkalan Lain
                </h2>
              </div>
              <span className="font-tabular text-xs text-[var(--text-muted)]">
                Pusat 0,00 = Median Kabupaten
              </span>
            </div>

            <BlokLollipopZScoreSvg laporan={laporanBulanIni} />
          </div>

          <p className="mt-4 pt-3 border-t border-[var(--border-rule)] text-xs text-[var(--text-muted)] leading-relaxed">
            <strong className="text-[var(--text-ink)] font-tabular uppercase">
              Cara membaca:
            </strong>{' '}
            Garis vertikal tengah (<span className="font-tabular">z = 0</span>) mewakili median
            pangkalan lain pada bulan {laporanBulanIni.nama_bulan} 2026. Tangkai lollipop ke kanan
            berarti nilai fitur lebih tinggi dari median rekan sebulan, sedangkan ke kiri berarti
            lebih rendah; tangkai terjauh dari nol merupakan penyumbang terbesar skor LOF.
          </p>
        </section>

        {/* BLOK (4): Alokasi vs Realisasi dengan Catatan bahwa Februari Dikecualikan */}
        <section
          aria-labelledby="blok-4-judul"
          data-testid="profil-blok-4-alokasi"
          className="lg:col-span-6 border border-[var(--border-strong)] bg-[var(--surface-paper)] p-5 flex flex-col justify-between"
        >
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border-rule)] pb-3 mb-4">
              <div>
                <span className="font-tabular text-[11px] uppercase tracking-wider text-[var(--text-muted)] block">
                  Blok 04 · Kuota Kontrak vs Penyaluran ({laporanBulanIni.nama_bulan} 2026)
                </span>
                <h2 id="blok-4-judul" className="font-editorial text-xl font-bold text-[var(--text-ink)]">
                  Alokasi vs Realisasi & Pengecualian Februari
                </h2>
              </div>
              <span className="font-tabular text-xs text-[var(--text-muted)]">
                Satuan: Tabung LPG 3 kg
              </span>
            </div>

            <BlokAlokasiVsRealisasi
              laporan={laporanBulanIni}
              semuaLaporan={profil.laporan_bulanan}
              selectedMonth={selectedMonth}
              onSelectMonth={(m) => setBulanAktif(m)}
            />
          </div>

          <p className="mt-4 pt-3 border-t border-[var(--border-rule)] text-xs text-[var(--text-muted)] leading-relaxed">
            <strong className="text-[var(--text-ink)] font-tabular uppercase">
              Cara membaca:
            </strong>{' '}
            Bandingkan batang realisasi (penyaluran normal ditambah dropping fakultatif) terhadap
            batas alokasi kontrak bulanan. Khusus <strong>bulan Februari dikecualikan</strong> dari
            aturan pelampauan alokasi karena angka alokasi pada tabel sumber Februari tidak
            reliabel.
          </p>
        </section>
      </div>
    </div>
  );
}

/**
 * Sub-komponen Blok (1): SVG Batang Volume Harian dengan Hari Minggu Abu-Abu.
 */
function BlokVolumeHarianSvg({ laporan }: { laporan: LaporanBulananProfil }) {
  const harian = laporan.volume_harian ?? [];
  const width = 620;
  const height = 210;
  const padLeft = 40;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 34;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxVol = useMemo(() => {
    const highest = harian.reduce((acc, d) => Math.max(acc, d.volume), 0);
    return Math.max(60, Math.ceil(highest / 20) * 20);
  }, [harian]);

  const yScale = useMemo(
    () => scaleLinear().domain([0, maxVol]).range([padTop + chartH, padTop]),
    [maxVol, chartH]
  );

  if (harian.length === 0) {
    return (
      <div className="py-12 text-center font-tabular text-xs text-[var(--text-soft)]">
        Tidak ada catatan penyaluran harian pada bulan {laporan.nama_bulan} 2026.
      </div>
    );
  }

  const slotWidth = chartW / harian.length;
  const yTicks = [0, Math.round(maxVol / 2), maxVol];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Grafik batang volume penyaluran harian bulan ${laporan.nama_bulan} 2026`}
        className="w-full h-auto min-w-[480px]"
      >
        {/* Garis bantu horizontal */}
        {yTicks.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="var(--border-rule)"
                strokeDasharray={tick === 0 ? undefined : '2 3'}
              />
              <text
                x={padLeft - 6}
                y={y + 3.5}
                textAnchor="end"
                fill="var(--text-muted)"
                className="font-tabular text-[10px]"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* Batang per Tanggal (1..31) */}
        {harian.map((d, idx) => {
          const x = padLeft + idx * slotWidth;
          const barW = Math.max(4, slotWidth - 4);
          const barY = yScale(d.volume);
          const barH = Math.max(0, padTop + chartH - barY);

          return (
            <g key={d.hari}>
              {/* Kolom Abu-Abu Penuh untuk Hari Minggu */}
              {d.is_minggu && (
                <rect
                  x={x + 0.5}
                  y={padTop}
                  width={slotWidth - 1}
                  height={chartH}
                  fill="var(--text-soft)"
                  fillOpacity={0.18}
                  data-sunday="true"
                />
              )}

              {/* Batang Volume */}
              {d.volume > 0 && (
                <rect
                  x={x + 2}
                  y={barY}
                  width={barW}
                  height={barH}
                  fill={d.is_minggu ? 'var(--text-soft)' : 'var(--text-ink)'}
                >
                  <title>
                    Tanggal {d.hari} {laporan.label_bulan}: {d.volume} tabung
                    {d.is_minggu ? ' (Minggu — dikeluarkan dari LOF)' : ''}
                  </title>
                </rect>
              )}

              {/* Label Tanggal atau Huruf M untuk Minggu */}
              <text
                x={x + slotWidth / 2}
                y={height - 14}
                textAnchor="middle"
                fill={d.is_minggu ? 'var(--accent-anomali-teks)' : 'var(--text-muted)'}
                className="font-tabular text-[9px]"
                fontWeight={d.is_minggu ? 700 : 400}
              >
                {d.is_minggu ? 'M' : d.hari % 2 === 1 ? d.hari : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Sub-komponen Blok (2): SVG Garis LOF 10 Bulan yang Tergambar (pathLength) dengan Pita Batas 1,50.
 */
function BlokGarisLof10BulanSvg({
  laporanList,
  selectedMonth,
  onSelectMonth,
  reducedMotion,
}: {
  laporanList: LaporanBulananProfil[];
  selectedMonth: number;
  onSelectMonth: (bulan: number) => void;
  reducedMotion: boolean;
}) {
  const width = 460;
  const height = 210;
  const padLeft = 40;
  const padRight = 22;
  const padTop = 22;
  const padBottom = 34;

  const maxLof = useMemo(() => {
    const highest = laporanList.reduce((acc, l) => Math.max(acc, l.lof ?? 0), 2.2);
    return Math.max(2.4, Math.ceil(highest * 10) / 10 + 0.15);
  }, [laporanList]);

  const xScale = useMemo(
    () => scaleLinear().domain([1, 10]).range([padLeft, width - padRight]),
    []
  );
  const yScale = useMemo(
    () => scaleLinear().domain([0.85, maxLof]).range([height - padBottom, padTop]).clamp(true),
    [maxLof]
  );

  const validPoints = laporanList
    .filter((l) => !l.nol && l.lof !== null)
    .map((l) => ({
      bulan: l.bulan,
      label: l.label_bulan,
      lof: l.lof as number,
      flag: l.flag,
      x: xScale(l.bulan),
      y: yScale(l.lof as number),
    }));

  const pathD = validPoints
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');

  const thresholdY = yScale(1.5);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Grafik garis skor LOF 10 bulan dengan pita batas 1,50"
        className="w-full h-auto min-w-[360px]"
      >
        {/* Pita Batas Anomali (LOF >= 1,50) */}
        <rect
          x={padLeft}
          y={padTop}
          width={width - padLeft - padRight}
          height={Math.max(0, thresholdY - padTop)}
          fill="#D9480F"
          fillOpacity={0.11}
        />
        <line
          x1={padLeft}
          y1={thresholdY}
          x2={width - padRight}
          y2={thresholdY}
          stroke="#D9480F"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <text
          x={width - padRight - 4}
          y={thresholdY - 5}
          textAnchor="end"
          fill="var(--accent-anomali-teks)"
          className="font-tabular text-[10px] font-semibold"
        >
          Batas 1,50
        </text>

        {/* Garis Sumbu Dasar */}
        <line
          x1={padLeft}
          y1={height - padBottom}
          x2={width - padRight}
          y2={height - padBottom}
          stroke="var(--border-rule)"
        />

        {/* Label Sumbu Y */}
        {[1.0, 1.5, 2.0, 3.0]
          .filter((v) => v <= maxLof)
          .map((v) => (
            <text
              key={v}
              x={padLeft - 6}
              y={yScale(v) + 3.5}
              textAnchor="end"
              fill={v === 1.5 ? 'var(--accent-anomali-teks)' : 'var(--text-muted)'}
              className="font-tabular text-[10px]"
            >
              {formatIndonesianNumber(v, 2)}
            </text>
          ))}

        {/* Garis LOF yang Tergambar dengan pathLength */}
        {validPoints.length > 1 && (
          <motion.path
            d={pathD}
            fill="none"
            stroke="var(--text-ink)"
            strokeWidth={2}
            initial={reducedMotion ? false : { pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: reducedMotion ? 0 : 0.38, ease: EDITORIAL_EASE }}
            data-testid="profil-lof-line-path"
          />
        )}

        {/* Titik dan Label Sumbu Bulan Jan-Okt */}
        {laporanList.map((lap) => {
          const x = xScale(lap.bulan);
          const isSelected = lap.bulan === selectedMonth;
          const hasLof = !lap.nol && lap.lof !== null;
          const y = hasLof ? yScale(lap.lof!) : height - padBottom;

          return (
            <g
              key={lap.bulan}
              onClick={() => onSelectMonth(lap.bulan)}
              className="cursor-pointer"
            >
              {/* Garis Vertikal Bulan yang Sedang Dipilih */}
              {isSelected && (
                <line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={height - padBottom}
                  stroke="var(--border-strong)"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
              )}

              {hasLof ? (
                <>
                  <circle
                    cx={x}
                    cy={y}
                    r={lap.flag ? 5.5 : 4}
                    fill={lap.flag ? '#D9480F' : 'var(--text-ink)'}
                    stroke="var(--surface-paper)"
                    strokeWidth={1.5}
                  />
                  {lap.flag && (
                    <text
                      x={x}
                      y={y - 8}
                      textAnchor="middle"
                      fill="var(--accent-anomali-teks)"
                      className="font-tabular text-[9px] font-semibold"
                    >
                      {formatIndonesianNumber(lap.lof!, 2)}
                    </text>
                  )}
                </>
              ) : (
                <rect
                  x={x - 3}
                  y={height - padBottom - 3}
                  width={6}
                  height={6}
                  fill="none"
                  stroke="var(--text-soft)"
                />
              )}

              <text
                x={x}
                y={height - 14}
                textAnchor="middle"
                fill={isSelected ? 'var(--accent-anomali-teks)' : 'var(--text-muted)'}
                className="font-tabular text-[10px]"
                fontWeight={isSelected ? 700 : 400}
              >
                {lap.label_bulan}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Sub-komponen Blok (3): Lollipop Z-Score 4 Fitur di Sekitar 0 (Median Pangkalan Lain).
 */
function BlokLollipopZScoreSvg({ laporan }: { laporan: LaporanBulananProfil }) {
  const fitur = laporan.fitur;
  if (!fitur || laporan.nol) {
    return (
      <div className="py-10 text-center font-tabular text-xs text-[var(--text-soft)]">
        Bulan {laporan.nama_bulan} 2026 memiliki penyaluran nol sehingga nilai z-score keempat
        fitur tidak dihitung.
      </div>
    );
  }

  const items = [
    {
      key: 'log_total',
      nama: 'Log Total Volume',
      z: fitur.log_total.z_score ?? 0,
      nilai: fitur.log_total.nilai,
      medianLain: fitur.log_total.median_pangkalan_lain,
      decimals: 2,
    },
    {
      key: 'cv_harian',
      nama: 'Variasi Harian (CV)',
      z: fitur.cv_harian.z_score ?? 0,
      nilai: fitur.cv_harian.nilai,
      medianLain: fitur.cv_harian.median_pangkalan_lain,
      decimals: 3,
    },
    {
      key: 'rasio_hari_aktif',
      nama: 'Rasio Hari Aktif',
      z: fitur.rasio_hari_aktif.z_score ?? 0,
      nilai: fitur.rasio_hari_aktif.nilai,
      medianLain: fitur.rasio_hari_aktif.median_pangkalan_lain,
      decimals: 3,
    },
    {
      key: 'porsi_nilai_dominan',
      nama: 'Porsi Nilai Dominan',
      z: fitur.porsi_nilai_dominan.z_score ?? 0,
      nilai: fitur.porsi_nilai_dominan.nilai,
      medianLain: fitur.porsi_nilai_dominan.median_pangkalan_lain,
      decimals: 3,
    },
  ];

  const maxAbsZ = Math.max(3.5, ...items.map((i) => Math.abs(i.z) + 0.5));
  const width = 540;
  const height = 195;
  const leftLabelW = 155;
  const rightMetaW = 135;
  const plotLeft = leftLabelW;
  const plotRight = width - rightMetaW;
  const xScale = scaleLinear().domain([-maxAbsZ, maxAbsZ]).range([plotLeft, plotRight]).clamp(true);
  const zeroX = xScale(0);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Grafik lollipop z-score 4 fitur bulan ${laporan.nama_bulan} 2026`}
        className="w-full h-auto min-w-[460px]"
      >
        {/* Header Kolom Kanan */}
        <text
          x={plotLeft}
          y={16}
          fill="var(--text-soft)"
          className="font-tabular text-[10px]"
        >
          -{formatIndonesianNumber(maxAbsZ, 1)}
        </text>
        <text
          x={zeroX}
          y={16}
          textAnchor="middle"
          fill="var(--text-ink)"
          className="font-tabular text-[10px] font-semibold"
        >
          0 (Median Lain)
        </text>
        <text
          x={plotRight}
          y={16}
          textAnchor="end"
          fill="var(--text-soft)"
          className="font-tabular text-[10px]"
        >
          +{formatIndonesianNumber(maxAbsZ, 1)}
        </text>
        <text
          x={width - 6}
          y={16}
          textAnchor="end"
          fill="var(--text-muted)"
          className="font-tabular text-[10px] uppercase"
        >
          z · (Nilai / Med)
        </text>

        {/* Garis Tengah z = 0 */}
        <line
          x1={zeroX}
          y1={24}
          x2={zeroX}
          y2={height - 12}
          stroke="var(--border-strong)"
          strokeWidth={1.25}
        />

        {items.map((item, idx) => {
          const rowY = 44 + idx * 38;
          const targetX = xScale(item.z);
          const isExtreme = Math.abs(item.z) >= 2.0;

          return (
            <g key={item.key}>
              {/* Garis Dasar Tipis */}
              <line
                x1={plotLeft}
                y1={rowY}
                x2={plotRight}
                y2={rowY}
                stroke="var(--border-rule)"
                strokeDasharray="2 2"
              />

              {/* Nama Fitur */}
              <text
                x={6}
                y={rowY + 4}
                fill="var(--text-ink)"
                className="text-xs font-medium"
              >
                {item.nama}
              </text>

              {/* Tangkai Lollipop dari 0 ke z */}
              <line
                x1={zeroX}
                y1={rowY}
                x2={targetX}
                y2={rowY}
                stroke={isExtreme ? '#D9480F' : 'var(--text-ink)'}
                strokeWidth={2.5}
              />

              {/* Kepala Lollipop */}
              <circle
                cx={targetX}
                cy={rowY}
                r={5.5}
                fill={isExtreme ? '#D9480F' : 'var(--text-ink)'}
                stroke="var(--surface-paper)"
                strokeWidth={1.5}
              />

              {/* Nilai z dan Perbandingan Nilai vs Median */}
              <text
                x={width - 6}
                y={rowY + 4}
                textAnchor="end"
                fill={isExtreme ? 'var(--accent-anomali-teks)' : 'var(--text-ink)'}
                className="font-tabular text-[11px] font-semibold"
              >
                {item.z > 0 ? '+' : ''}
                {formatIndonesianNumber(item.z, 2)}{' '}
                <tspan fill="var(--text-muted)" fontWeight={400} className="text-[10px]">
                  ({item.nilai !== null ? formatIndonesianNumber(item.nilai, 2) : '—'} vs{' '}
                  {item.medianLain !== null ? formatIndonesianNumber(item.medianLain, 2) : '—'})
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Sub-komponen Blok (4): Alokasi vs Realisasi dengan Catatan bahwa Februari Dikecualikan.
 */
function BlokAlokasiVsRealisasi({
  laporan,
  semuaLaporan,
  selectedMonth,
  onSelectMonth,
}: {
  laporan: LaporanBulananProfil;
  semuaLaporan: LaporanBulananProfil[];
  selectedMonth: number;
  onSelectMonth: (bulan: number) => void;
}) {
  const avr = laporan.alokasi_vs_realisasi;
  const maxBarVal = Math.max(1, avr?.alokasi ?? 0, avr?.grand_total ?? 0);

  return (
    <div className="space-y-4">
      {avr ? (
        <>
          {/* Bar Perbandingan Bulan Terpilih */}
          <div className="space-y-2.5 font-tabular text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[var(--text-muted)]">
                  Alokasi Kontrak ({laporan.nama_bulan} 2026)
                </span>
                <span className="font-semibold">
                  {formatIndonesianNumber(avr.alokasi)} tabung
                </span>
              </div>
              <div className="w-full h-4 border border-[var(--border-rule)] bg-[var(--surface-subtle)]">
                <div
                  style={{ width: `${Math.min(100, (avr.alokasi / maxBarVal) * 100)}%` }}
                  className="h-full bg-[var(--text-ink)] opacity-45"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[var(--text-muted)]">
                  Realisasi Total (Normal {formatIndonesianNumber(avr.total_normal)} + Fakultatif{' '}
                  {formatIndonesianNumber(avr.fakultatif)})
                </span>
                <span
                  className={`font-semibold ${
                    !avr.alokasi_tidak_reliabel && avr.grand_total > avr.alokasi
                      ? 'text-[var(--accent-anomali-teks)]'
                      : 'text-[var(--text-ink)]'
                  }`}
                >
                  {formatIndonesianNumber(avr.grand_total)} tabung
                </span>
              </div>
              <div className="w-full h-4 border border-[var(--border-strong)] bg-[var(--surface-subtle)] flex overflow-hidden">
                <div
                  style={{ width: `${Math.min(100, (avr.total_normal / maxBarVal) * 100)}%` }}
                  className="h-full bg-[var(--text-ink)]"
                  title={`Normal: ${avr.total_normal}`}
                />
                {avr.fakultatif > 0 && (
                  <div
                    style={{ width: `${Math.min(100, (avr.fakultatif / maxBarVal) * 100)}%` }}
                    className="h-full bg-[#C98A00]"
                    title={`Fakultatif: ${avr.fakultatif}`}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Catatan Eksplisit bahwa Februari Dikecualikan */}
          <div
            data-testid="catatan-februari-dikecualikan"
            className={`p-2.5 border text-xs font-tabular ${
              laporan.bulan === 2
                ? 'border-[#C98A00] bg-[var(--accent-mustard-bg)] text-[var(--text-ink)]'
                : 'border-[var(--border-rule)] bg-[var(--surface-subtle)]/40 text-[var(--text-muted)]'
            }`}
          >
            <strong>Catatan Februari dikecualikan:</strong> Kolom alokasi pada sumber data bulan
            Februari 2026 tidak reliabel sehingga Februari dikecualikan dari aturan{' '}
            <em>Melebihi Alokasi</em> dan <em>&gt; 2× Alokasi</em>.
          </div>

          {/* Tabel Ringkas 10 Bulan Alokasi vs Realisasi */}
          <div className="overflow-x-auto border-t border-[var(--border-rule)] pt-2">
            <table className="w-full text-left font-tabular text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-rule)] text-[var(--text-muted)]">
                  <th className="py-1 pr-2">Bln</th>
                  <th className="py-1 px-2 text-right">Alokasi</th>
                  <th className="py-1 px-2 text-right">Normal</th>
                  <th className="py-1 px-2 text-right">Fakultatif</th>
                  <th className="py-1 pl-2 text-right">Grand Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-rule)]/60">
                {semuaLaporan.map((l) => {
                  const a = l.alokasi_vs_realisasi;
                  const isActive = l.bulan === selectedMonth;
                  const isOver = a && l.bulan !== 2 && a.grand_total > a.alokasi;
                  return (
                    <tr
                      key={l.bulan}
                      onClick={() => onSelectMonth(l.bulan)}
                      className={`cursor-pointer ${
                        isActive ? 'bg-[var(--surface-subtle)] font-semibold' : 'hover:bg-[var(--surface-subtle)]/50'
                      }`}
                    >
                      <td className="py-1 pr-2">
                        {l.label_bulan}
                        {l.bulan === 2 ? '*' : ''}
                      </td>
                      <td className="py-1 px-2 text-right">
                        {a ? formatIndonesianNumber(a.alokasi) : '—'}
                      </td>
                      <td className="py-1 px-2 text-right">
                        {a ? formatIndonesianNumber(a.total_normal) : '—'}
                      </td>
                      <td className="py-1 px-2 text-right">
                        {a ? formatIndonesianNumber(a.fakultatif) : '—'}
                      </td>
                      <td
                        className={`py-1 pl-2 text-right ${
                          isOver ? 'text-[var(--accent-anomali-teks)] font-semibold' : ''
                        }`}
                      >
                        {a ? formatIndonesianNumber(a.grand_total) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="py-8 text-center font-tabular text-xs text-[var(--text-soft)]">
          Data alokasi vs realisasi tidak tersedia untuk bulan ini.
        </div>
      )}
    </div>
  );
}
