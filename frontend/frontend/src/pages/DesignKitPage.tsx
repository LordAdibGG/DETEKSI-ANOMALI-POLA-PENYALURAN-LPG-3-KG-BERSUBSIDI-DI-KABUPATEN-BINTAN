import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFilterBulan } from '../context/FilterBulanContext';
import { useTheme } from '../context/ThemeContext';
import { AppShell } from '../components/layout/AppShell';
import {
  CountUp,
  Reveal,
  Stagger,
  StaggerItem,
  usePrefersReducedMotion,
} from '../components/motion/Primitives';
import { Angka } from '../components/ui/Angka';
import { AturanGaris } from '../components/ui/AturanGaris';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { TagKategori, type KategoriPangkalan } from '../components/ui/TagKategori';
import { useToast } from '../components/ui/Toast';

interface KitTableRow {
  kode: string;
  nama: string;
  kategori: KategoriPangkalan;
  bulanValid: number;
  bulanDitandai: number;
  proporsi: number;
  maksLof: number;
  flagAturan: string;
  alasan: string;
}

const KIT_TABLE_DATA: KitTableRow[] = [
  {
    kode: 'P01',
    nama: 'Pangkalan KJP Kijang Kota I',
    kategori: 'Sporadis',
    bulanValid: 10,
    bulanDitandai: 2,
    proporsi: 0.2,
    maksLof: 3.11,
    flagAturan: 'Melebihi alokasi, Fakultatif',
    alasan: 'Variasi harian jauh di atas pangkalan lain (z 5,65)',
  },
  {
    kode: 'P02',
    nama: 'Pangkalan KJP Tanjung Uban Selatan',
    kategori: 'Sporadis',
    bulanValid: 10,
    bulanDitandai: 3,
    proporsi: 0.3,
    maksLof: 2.48,
    flagAturan: 'Lonjakan harian',
    alasan: 'Total penyaluran jauh di bawah pangkalan lain (z -3,42)',
  },
  {
    kode: 'P07',
    nama: 'Pangkalan KJP Toapaya Asri',
    kategori: 'Berulang',
    bulanValid: 10,
    bulanDitandai: 5,
    proporsi: 0.5,
    maksLof: 2.34,
    flagAturan: 'Melebihi alokasi',
    alasan: 'Porsi nilai harian tunggal mendominasi bulan berjalan (z 2,91)',
  },
  {
    kode: 'P10',
    nama: 'Pangkalan KJP Seri Kuala Lobam',
    kategori: 'Konsisten tinggi',
    bulanValid: 10,
    bulanDitandai: 8,
    proporsi: 0.8,
    maksLof: 2.67,
    flagAturan: '>2x alokasi, Fakultatif',
    alasan: 'Total penyaluran jauh di atas pangkalan lain (z 3,18)',
  },
  {
    kode: 'P15',
    nama: 'Pangkalan KJP Teluk Sebong',
    kategori: 'Normal',
    bulanValid: 10,
    bulanDitandai: 0,
    proporsi: 0.0,
    maksLof: 1.03,
    flagAturan: 'Tidak ada',
    alasan: 'Pola penyaluran berada di sekitar median kabupaten',
  },
  {
    kode: 'P29',
    nama: 'Pangkalan KJP Mantang Baru',
    kategori: 'Data kurang',
    bulanValid: 3,
    bulanDitandai: 0,
    proporsi: 0.0,
    maksLof: 1.12,
    flagAturan: 'Nol bulanan (7 bln)',
    alasan: 'Bulan aktif kurang dari syarat minimum 4 bulan valid',
  },
  {
    kode: 'P30',
    nama: 'Pangkalan KJP Tambelan',
    kategori: 'Tidak dinilai',
    bulanValid: 0,
    bulanDitandai: 0,
    proporsi: 0.0,
    maksLof: Number.NaN,
    flagAturan: 'Nol bulanan (10 bln)',
    alasan: 'Volume penyaluran nol sepanjang periode Jan–Okt 2026',
  },
];

const TOKEN_SWATCHES = [
  {
    nama: 'Kertas (Latar Terang)',
    token: '--color-kertas',
    hex: '#F3EFE4',
    peran: 'Permukaan utama buku besar mode terang',
    kontras: '14,8 : 1 thd Tinta #17211C (AAA)',
    sampleStyle: 'bg-[#F3EFE4] text-[#17211C] border-[#17211C]',
  },
  {
    nama: 'Tinta (Teks Utama)',
    token: '--color-tinta',
    hex: '#17211C',
    peran: 'Teks editorial, garis tegas, tombol utama',
    kontras: '14,8 : 1 thd Kertas #F3EFE4 (AAA)',
    sampleStyle: 'bg-[#17211C] text-[#F3EFE4] border-[#17211C]',
  },
  {
    nama: 'Garis (Pemisah Tipis)',
    token: '--color-garis',
    hex: '#D9D2BF',
    peran: 'Garis kolom/baris buku besar & pembatas bagian',
    kontras: 'Pemisah struktural non-teks',
    sampleStyle: 'bg-[#D9D2BF] text-[#17211C] border-[#17211C]',
  },
  {
    nama: 'Aksen Anomali (Oranye Karat)',
    token: '--color-anomali',
    hex: '#D9480F',
    peran: 'Khusus anomali LOF ≥ 1,50 & kategori Sporadis',
    kontras: '4,6 : 1 (AA) / Mode gelap #FF6B35 (6,9 : 1)',
    sampleStyle: 'bg-[#D9480F] text-[#F3EFE4] border-[#17211C]',
  },
  {
    nama: 'Mustard (Berulang)',
    token: '--color-mustard',
    hex: '#C98A00',
    peran: 'Penanda kategori Berulang (>30% s.d. <70% bulan)',
    kontras: 'Teks adaptif AA (>= 4,7 : 1)',
    sampleStyle: 'bg-[#C98A00] text-[#17211C] border-[#17211C]',
  },
  {
    nama: 'Biru Baja (Konsisten Tinggi)',
    token: '--color-biru-baja',
    hex: '#3B6E8F',
    peran: 'Penanda kategori Konsisten tinggi (≥70% bulan)',
    kontras: '5,1 : 1 (AA) / Mode gelap #6BA3C7 (6,4 : 1)',
    sampleStyle: 'bg-[#3B6E8F] text-[#F3EFE4] border-[#17211C]',
  },
  {
    nama: 'Hijau Melon LPG (Merek)',
    token: '--color-hijau-melon',
    hex: '#86B817',
    peran: 'HANYA untuk titik penanda merek di kop buku besar',
    kontras: 'Penanda identitas merek',
    sampleStyle: 'bg-[#86B817] text-[#17211C] border-[#17211C]',
  },
  {
    nama: 'Latar Mode Gelap',
    token: '--color-latar-gelap',
    hex: '#0F1814',
    peran: 'Latar utama mode malam dengan tinta terang #F3EFE4',
    kontras: '15,6 : 1 thd Tinta Terang #F3EFE4 (AAA)',
    sampleStyle: 'bg-[#0F1814] text-[#F3EFE4] border-[#F3EFE4]',
  },
];

export function DesignKitPage() {
  const { theme, setTheme } = useTheme();
  const { bulanAktif, infoBulanAktif } = useFilterBulan();
  const { user, loginDemo } = useAuth();
  const { pushToast } = useToast();
  const reducedMotion = usePrefersReducedMotion();

  const [replayKey, setReplayKey] = useState(1);
  const [filterKategori, setFilterKategori] = useState<string>('SEMUA');
  const [simulasiLoading, setSimulasiLoading] = useState(false);

  const filteredRows =
    filterKategori === 'SEMUA'
      ? KIT_TABLE_DATA
      : KIT_TABLE_DATA.filter((r) => r.kategori === filterKategori);

  const columns: DataTableColumn<KitTableRow>[] = [
    {
      id: 'kode',
      header: 'Kode',
      tabular: true,
      sortable: true,
      sortValue: (r) => r.kode,
      widthClass: 'w-20',
      cell: (r) => <span className="font-semibold">{r.kode}</span>,
    },
    ...(user?.role === 'admin'
      ? [
          {
            id: 'nama',
            header: 'Nama Pangkalan (Khusus Admin)',
            sortable: true,
            sortValue: (r: KitTableRow) => r.nama,
            cell: (r: KitTableRow) => <span>{r.nama}</span>,
          },
        ]
      : []),
    {
      id: 'kategori',
      header: 'Kategori',
      sortable: true,
      sortValue: (r) => r.kategori,
      cell: (r) => <TagKategori kategori={r.kategori} compact />,
    },
    {
      id: 'bulanDitandai',
      header: 'Ditandai / Valid',
      align: 'right',
      tabular: true,
      sortable: true,
      sortValue: (r) => r.bulanDitandai,
      cell: (r) => (
        <span>
          {r.bulanDitandai} / {r.bulanValid}
        </span>
      ),
    },
    {
      id: 'maksLof',
      header: 'LOF Maks',
      align: 'right',
      tabular: true,
      sortable: true,
      sortValue: (r) => (Number.isNaN(r.maksLof) ? -1 : r.maksLof),
      cell: (r) => <Angka value={r.maksLof} decimals={2} animate={false} thresholdAnomali={1.5} />,
    },
    {
      id: 'flagAturan',
      header: 'Flag Aturan Pendamping',
      cell: (r) => <span className="font-tabular text-xs">{r.flagAturan}</span>,
    },
    {
      id: 'alasan',
      header: 'Alasan Penandaan (Server)',
      cell: (r) => <span className="text-xs text-[var(--text-muted)]">{r.alasan}</span>,
    },
  ];

  return (
    <AppShell>
      <div data-testid="design-kit-page" className="space-y-12">
        {/* Kop Lembar Spesimen */}
        <section className="border-b-2 border-[var(--border-strong)] pb-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <div className="font-tabular text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">
                Lembar Spesimen Sistem Desain · Rute Pemeriksaan /__kit
              </div>
              <h1 className="font-editorial text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--text-ink)]">
                Fondasi Visual “Lembar Pantau”
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-2 max-w-3xl leading-relaxed">
                Buku besar pengawasan bergaya editorial dan kartografis. Menggunakan ruang putih
                kertas hangat (<span className="font-tabular">#F3EFE4</span>), tinta hijau gelap (
                <span className="font-tabular">#17211C</span>), pemisah garis tipis (
                <span className="font-tabular">#D9D2BF</span>), dan satu aksen oranye karat (
                <span className="font-tabular">#D9480F</span>) khusus anomali.
              </p>
            </div>

            {/* Panel Kendali Cepat Spesimen */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <Button
                variant={theme === 'terang' ? 'utama' : 'sekunder'}
                size="sm"
                onClick={() => setTheme('terang')}
                data-testid="kit-btn-terang"
              >
                Kertas (#F3EFE4)
              </Button>
              <Button
                variant={theme === 'gelap' ? 'utama' : 'sekunder'}
                size="sm"
                onClick={() => setTheme('gelap')}
                data-testid="kit-btn-gelap"
              >
                Mode Gelap (#0F1814)
              </Button>
              <Button
                variant="sekunder"
                size="sm"
                onClick={() => setReplayKey((k) => k + 1)}
                data-testid="kit-btn-replay"
              >
                Putar Ulang Gerak & CountUp
              </Button>
            </div>
          </div>

          {/* Bilah Diagnostik Konteks Aktif */}
          <div className="mt-5 pt-3 border-t border-[var(--border-rule)] flex flex-wrap items-center justify-between gap-3 font-tabular text-xs text-[var(--text-muted)]">
            <div className="flex flex-wrap items-center gap-4">
              <span>
                Tema Aktif:{' '}
                <strong className="text-[var(--text-ink)] uppercase">{theme}</strong>
              </span>
              <span>·</span>
              <span>
                Filter Pita Bulan:{' '}
                <strong className="text-[var(--text-ink)]">
                  {infoBulanAktif
                    ? `${infoBulanAktif.nama} (Bulan ${bulanAktif})`
                    : 'Semua Bulan (Jan–Okt)'}
                </strong>
              </span>
              <span>·</span>
              <span>
                Peran Aktif:{' '}
                <strong className="text-[var(--text-ink)] uppercase">
                  {user?.role ?? 'petugas'}
                </strong>
              </span>
            </div>
            <div>
              <span>
                prefers-reduced-motion:{' '}
                <strong className="text-[var(--text-ink)]">
                  {reducedMotion ? 'AKTIF (Tanpa Animasi)' : 'NORMAL (150–400ms)'}
                </strong>
              </span>
            </div>
          </div>
        </section>

        {/* BAGIAN 01: PALET WARNA & TOKEN @theme */}
        <section aria-labelledby="sec-palet">
          <AturanGaris
            varian="tegas"
            label="01 · Token Warna @theme & Kontras AA"
            metaRight="Tailwind CSS v4"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {TOKEN_SWATCHES.map((sw) => (
              <div
                key={sw.token}
                className="border border-[var(--border-rule)] bg-[var(--surface-subtle)]/35 p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`inline-block px-2.5 py-1 text-xs font-tabular font-semibold border ${sw.sampleStyle}`}
                    >
                      {sw.hex}
                    </span>
                    <span className="font-tabular text-[11px] text-[var(--text-soft)]">
                      {sw.token}
                    </span>
                  </div>
                  <h3 className="font-editorial text-lg font-bold text-[var(--text-ink)]">
                    {sw.nama}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                    {sw.peran}
                  </p>
                </div>
                <div className="mt-4 pt-2.5 border-t border-[var(--border-rule)] font-tabular text-[11px] text-[var(--text-soft)]">
                  Kontras: {sw.kontras}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* BAGIAN 02: SKALA TIPOGRAFI (@fontsource) */}
        <section aria-labelledby="sec-tipografi">
          <AturanGaris
            varian="tegas"
            label="02 · Skala Tipografi Mandiri (@fontsource)"
            metaRight="Newsreader · IBM Plex Sans · IBM Plex Mono"
          />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-4 items-start">
            <div className="lg:col-span-5 border-r-0 lg:border-r border-[var(--border-rule)] lg:pr-6 space-y-3">
              <div className="font-tabular text-xs uppercase tracking-widest text-[var(--text-muted)]">
                Newsreader (Serif Editorial — Judul & Penekanan)
              </div>
              <p className="font-editorial text-4xl font-bold leading-tight">
                Buku Besar Pengawasan Pangkalan LPG 3 kg
              </p>
              <p className="font-editorial italic text-xl text-[var(--text-muted)]">
                “Indikasi awal untuk memprioritaskan pemeriksaan, bukan vonis pelanggaran.”
              </p>
            </div>

            <div className="lg:col-span-4 border-r-0 lg:border-r border-[var(--border-rule)] lg:pr-6 space-y-3">
              <div className="font-tabular text-xs uppercase tracking-widest text-[var(--text-muted)]">
                IBM Plex Sans (Antarmuka & Penjelasan Alasan)
              </div>
              <p className="text-base font-medium text-[var(--text-ink)]">
                Pangkalan P01 memiliki variasi penyaluran harian jauh di atas median pangkalan lain
                pada bulan September 2026.
              </p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Teks antarmuka menggunakan kalimat bahasa Indonesia yang lugas, jujur, dan bebas
                dari jargon pemasaran.
              </p>
            </div>

            <div className="lg:col-span-3 space-y-3">
              <div className="font-tabular text-xs uppercase tracking-widest text-[var(--text-muted)]">
                IBM Plex Mono (Angka Tabular)
              </div>
              <div className="space-y-1 font-tabular text-sm border-t border-b border-[var(--border-rule)] py-2">
                <div className="flex justify-between">
                  <span>P01 · Sep 2026</span>
                  <span className="text-[var(--accent-anomali-teks)] font-semibold">LOF 3,110</span>
                </div>
                <div className="flex justify-between">
                  <span>P07 · Mei 2026</span>
                  <span className="text-[var(--accent-anomali-teks)] font-semibold">LOF 2,340</span>
                </div>
                <div className="flex justify-between">
                  <span>Median Kab.</span>
                  <span>LOF 1,030</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* BAGIAN 03: KOMPONEN BUTTON, TAG KATEGORI, ANGKA (COUNT-UP), ATURAN GARIS */}
        <section aria-labelledby="sec-komponen-inti">
          <AturanGaris
            varian="tegas"
            label="03 · Komponen Inti: Button, Tag Kategori, Angka Count-Up, Aturan Garis"
            metaRight="Tanpa Sudut Membulat Generik"
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-4">
            {/* Subkolom Button & Aturan Garis */}
            <div className="lg:col-span-6 space-y-6">
              <div>
                <h3 className="font-editorial text-xl font-bold mb-3">Varian Tombol (Button)</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="utama" size="md">
                    Utama (Tinta)
                  </Button>
                  <Button variant="sekunder" size="md">
                    Sekunder (Garis)
                  </Button>
                  <Button variant="anomali" size="md">
                    Anomali (#D9480F)
                  </Button>
                  <Button variant="teks" size="md">
                    Tautan Teks Editorial
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <Button variant="sekunder" size="sm">
                    Ukuran Kecil (SM)
                  </Button>
                  <Button variant="sekunder" size="md">
                    Ukuran Sedang (MD)
                  </Button>
                  <Button variant="sekunder" size="lg">
                    Ukuran Besar (LG)
                  </Button>
                  <Button variant="utama" size="sm" loading>
                    Memproses...
                  </Button>
                  <Button variant="sekunder" size="sm" disabled>
                    Nonaktif
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-editorial text-xl font-bold mb-3">
                  Varian Pemisah (Aturan Garis)
                </h3>
                <div className="space-y-2">
                  <AturanGaris varian="tipis" label="Garis Tipis (#D9D2BF)" />
                  <AturanGaris varian="tegas" label="Garis Tegas (#17211C)" />
                  <AturanGaris varian="ganda" label="Garis Ganda Buku Besar" />
                  <AturanGaris varian="putus" label="Garis Putus Ambang LOF 1,50" />
                  <AturanGaris varian="anomali" label="Garis Aksen Anomali (#D9480F)" />
                </div>
              </div>
            </div>

            {/* Subkolom Tag Kategori & Angka Acuan Count-Up */}
            <div className="lg:col-span-6 space-y-6">
              <div>
                <h3 className="font-editorial text-xl font-bold mb-3">
                  Tag Kategori Konsistensi (6 Kategori Acuan)
                </h3>
                <div className="flex flex-wrap items-center gap-2.5">
                  <TagKategori kategori="Normal" count={18} />
                  <TagKategori kategori="Sporadis" count={6} />
                  <TagKategori kategori="Berulang" count={3} />
                  <TagKategori kategori="Konsisten tinggi" count={1} />
                  <TagKategori kategori="Data kurang" count={1} />
                  <TagKategori kategori="Tidak dinilai" count={1} />
                </div>
              </div>

              <div>
                <h3 className="font-editorial text-xl font-bold mb-3">
                  Komponen Angka (Tabular & Count-Up)
                </h3>
                <div
                  key={`angka-${replayKey}`}
                  className="border-t border-b border-[var(--border-strong)] py-4 grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6"
                >
                  <div>
                    <span className="font-tabular text-xs uppercase text-[var(--text-muted)] block">
                      Total Pangkalan
                    </span>
                    <Angka value={30} size="xl" />
                  </div>
                  <div>
                    <span className="font-tabular text-xs uppercase text-[var(--text-muted)] block">
                      Pangkalan-Bulan
                    </span>
                    <Angka value={293} size="xl" />
                  </div>
                  <div>
                    <span className="font-tabular text-xs uppercase text-[var(--text-muted)] block">
                      Masuk Model LOF
                    </span>
                    <Angka value={282} size="xl" />
                  </div>
                  <div>
                    <span className="font-tabular text-xs uppercase text-[var(--text-muted)] block">
                      Ditandai (LOF ≥ 1,5)
                    </span>
                    <Angka value={28} size="xl" anomali />
                  </div>
                  <div>
                    <span className="font-tabular text-xs uppercase text-[var(--text-muted)] block">
                      LOF Median Kab.
                    </span>
                    <Angka value={1.03} decimals={2} size="xl" />
                  </div>
                  <div>
                    <span className="font-tabular text-xs uppercase text-[var(--text-muted)] block">
                      LOF Maksimum
                    </span>
                    <Angka value={3.11} decimals={2} size="xl" anomali />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* BAGIAN 04: DATATABLE DASAR */}
        <section aria-labelledby="sec-datatable">
          <AturanGaris
            varian="tegas"
            label="04 · DataTable Dasar Buku Besar (Pengurutan, Saringan & Peran)"
            metaRight="Klik header kolom untuk mengurutkan"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {['SEMUA', 'Sporadis', 'Berulang', 'Konsisten tinggi', 'Normal', 'Data kurang'].map(
                (kat) => (
                  <button
                    key={kat}
                    type="button"
                    onClick={() => setFilterKategori(kat)}
                    className={`px-2.5 py-1 font-tabular text-xs uppercase tracking-wider border cursor-pointer ${
                      filterKategori === kat
                        ? 'border-[var(--border-strong)] bg-[var(--text-ink)] text-[var(--surface-paper)] font-semibold'
                        : 'border-[var(--border-rule)] text-[var(--text-ink)] hover:bg-[var(--surface-subtle)]'
                    }`}
                  >
                    {kat}
                  </button>
                )
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="sekunder"
                size="sm"
                onClick={() => loginDemo(user?.role === 'admin' ? 'petugas' : 'admin')}
              >
                Uji Peran: {user?.role === 'admin' ? 'Admin (Nama Tampil)' : 'Petugas (Kode Saja)'}
              </Button>
              <Button
                variant="sekunder"
                size="sm"
                onClick={() => setSimulasiLoading((v) => !v)}
              >
                {simulasiLoading ? 'Tampilkan Isi Tabel' : 'Simulasikan Skeleton Tabel'}
              </Button>
            </div>
          </div>

          <DataTable
            columns={columns}
            data={filteredRows}
            rowKey={(r) => r.kode}
            isRowFlagged={(r) => r.maksLof >= 1.5}
            loading={simulasiLoading}
            defaultSortId="maksLof"
            defaultSortDir="desc"
          />
        </section>

        {/* BAGIAN 05: SKELETON, EMPTYSTATE, ERRORSTATE, TOAST */}
        <section aria-labelledby="sec-status-komponen">
          <AturanGaris
            varian="tegas"
            label="05 · Komponen Keadaan: Skeleton, EmptyState, ErrorState & Toast"
            metaRight="Jujur & Jelas dalam Bahasa Indonesia"
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4">
            <div className="lg:col-span-4 space-y-3">
              <div className="font-tabular text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Komponen Skeleton (Blok & Baris)
              </div>
              <Skeleton varian="blok" />
              <Skeleton varian="baris" baris={3} />
            </div>

            <div className="lg:col-span-4 space-y-3">
              <div className="font-tabular text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Komponen EmptyState
              </div>
              <EmptyState
                judul="Tidak ditemukan pangkalan pada saringan ini"
                deskripsi="Tidak ada pangkalan dengan kombinasi kecamatan dan kategori yang diminta pada bulan berjalan."
                labelAksi="Atur Ulang Saringan"
                onAksi={() => setFilterKategori('SEMUA')}
              />
            </div>

            <div className="lg:col-span-4 space-y-3">
              <div className="font-tabular text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Komponen Toast (Pemberitahuan)
              </div>
              <div className="border border-[var(--border-rule)] p-5 space-y-3">
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Uji pemberitahuan pojok buku besar untuk berbagai situasi operasional:
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="sekunder"
                    size="sm"
                    onClick={() =>
                      pushToast({
                        judul: 'Saringan bulan diperbarui',
                        deskripsi: 'Menampilkan data penyaluran untuk bulan terpilih.',
                        nada: 'info',
                      })
                    }
                  >
                    Toast Info
                  </Button>
                  <Button
                    variant="sekunder"
                    size="sm"
                    onClick={() =>
                      pushToast({
                        judul: 'Catatan tindak lanjut disimpan',
                        deskripsi: 'Status verifikasi lapangan P01 berhasil diperbarui.',
                        nada: 'berhasil',
                      })
                    }
                  >
                    Toast Berhasil
                  </Button>
                  <Button
                    variant="anomali"
                    size="sm"
                    onClick={() =>
                      pushToast({
                        judul: 'Layanan Python LOF tidak merespons (503)',
                        deskripsi: 'Menampilkan hasil analisis terakhir dari basis data MySQL.',
                        nada: 'anomali',
                      })
                    }
                  >
                    Toast Anomali / 503
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="font-tabular text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Komponen ErrorState (Ketahanan Saat Layanan Python Mati)
            </div>
            <ErrorState
              pesan="Permintaan perhitungan ulang LOF k=10 tidak dapat dijalankan karena layanan Python pada port 8001 sedang dimatikan."
              onCobaLagi={() =>
                pushToast({
                  judul: 'Memeriksa ulang layanan Python LOF...',
                  deskripsi: 'Menghubungi endpoint kesehatan 127.0.0.1:8001/health.',
                  nada: 'peringatan',
                })
              }
            />
          </div>
        </section>

        {/* BAGIAN 06: PRIMITIF GERAK & HALAMAN LOGIN TIPOGRAFIS */}
        <section aria-labelledby="sec-gerak-dan-login">
          <AturanGaris
            varian="tegas"
            label="06 · Primitif Gerak (Reveal, Stagger, CountUp) & Halaman Login Tipografis"
            metaRight="150–400 ms · cubic-bezier(0.2, 0.7, 0.2, 1)"
          />

          <div key={`motion-${replayKey}`} className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-4">
            <div className="lg:col-span-6">
              <Reveal>
                <h3 className="font-editorial text-xl font-bold mb-2">
                  Staggered Strip: Ditandai per Bulan (Jan–Okt 2026)
                </h3>
                <p className="text-xs text-[var(--text-muted)] mb-4">
                  Angka acuan ditandai per bulan: 2, 4, 3, 3, 2, 2, 2, 2, 5, 3 (Total = 28).
                </p>
              </Reveal>

              <Stagger className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {[
                  { bln: 'Jan', val: 2 },
                  { bln: 'Feb', val: 4 },
                  { bln: 'Mar', val: 3 },
                  { bln: 'Apr', val: 3 },
                  { bln: 'Mei', val: 2 },
                  { bln: 'Jun', val: 2 },
                  { bln: 'Jul', val: 2 },
                  { bln: 'Agu', val: 2 },
                  { bln: 'Sep', val: 5 },
                  { bln: 'Okt', val: 3 },
                ].map((m) => (
                  <StaggerItem
                    key={m.bln}
                    className={`border p-2.5 text-center ${
                      m.val >= 4
                        ? 'border-[#D9480F] bg-[var(--accent-anomali-bg)]'
                        : 'border-[var(--border-rule)] bg-[var(--surface-subtle)]/40'
                    }`}
                  >
                    <span className="font-tabular text-[11px] text-[var(--text-muted)] block">
                      {m.bln}
                    </span>
                    <CountUp
                      value={m.val}
                      className={`text-lg font-semibold ${
                        m.val >= 4 ? 'text-[var(--accent-anomali-teks)]' : 'text-[var(--text-ink)]'
                      }`}
                    />
                  </StaggerItem>
                ))}
              </Stagger>
            </div>

            <div className="lg:col-span-6 border border-[var(--border-strong)] p-5 flex flex-col justify-between">
              <div>
                <div className="font-tabular text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] mb-1">
                  Halaman Login Tipografis
                </div>
                <h3 className="font-editorial text-2xl font-bold text-[var(--text-ink)]">
                  Lembar Pengesahan Akses (/masuk)
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
                  Dirancang menyerupai sampul buku besar pengawasan dengan kolofon parameter riset,
                  pernyataan kehati-hatian, dan autentikasi Sanctum Bearer token tanpa dekorasi
                  kartu generik.
                </p>
              </div>
              <div className="mt-5 pt-4 border-t border-[var(--border-rule)] flex flex-wrap items-center justify-between gap-3">
                <span className="font-tabular text-xs text-[var(--text-muted)]">
                  Rute: <strong className="text-[var(--text-ink)]">/masuk</strong>
                </span>
                <Link to="/masuk">
                  <Button variant="utama" size="sm">
                    Buka Halaman Login Tipografis →
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
