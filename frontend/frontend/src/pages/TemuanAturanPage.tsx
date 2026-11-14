import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  fetchTemuanAturan,
  getSnapshotTemuanAturan,
  type TemuanAturanItem,
} from '../api/pantau';
import { formatIndonesianNumber } from '../components/motion/Primitives';
import { Angka } from '../components/ui/Angka';
import { AturanGaris } from '../components/ui/AturanGaris';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { TagKategori } from '../components/ui/TagKategori';
import { useAuth } from '../context/AuthContext';
import { useFilterBulan } from '../context/FilterBulanContext';

const JENIS_ATURAN_TABS = [
  {
    key: 'semua',
    label: 'Semua Temuan',
    kriteria: 'Seluruh 6 aturan administratif pendamping sepanjang Jan–Okt 2026.',
  },
  {
    key: 'melebihi_alokasi',
    label: 'Melebihi Alokasi',
    kriteria: 'Grand total > alokasi kontrak bulanan (bulan Februari dikecualikan).',
  },
  {
    key: 'gt_2x_alokasi',
    label: '> 2× Alokasi',
    kriteria: 'Grand total > 2 × alokasi kontrak bulanan (bulan Februari dikecualikan).',
  },
  {
    key: 'nol',
    label: 'Nol Sebulan',
    kriteria: 'Volume penyaluran normal = 0 tabung sepanjang bulan kerja (dikeluarkan dari model LOF).',
  },
  {
    key: 'lonjakan',
    label: 'Lonjakan Satu Hari',
    kriteria: 'Satu hari puncak menyumbang > 40% volume bulanan dengan hari aktif ≤ 3 hari.',
  },
  {
    key: 'seragam',
    label: 'Pola Seragam',
    kriteria: 'Porsi nilai harian dominan ≥ 90% dengan minimal 8 hari aktif.',
  },
  {
    key: 'fakultatif',
    label: 'Ada Fakultatif',
    kriteria: 'Terdapat penyaluran fakultatif tambahan (fakultatif > 0 tabung).',
  },
] as const;

export function TemuanAturanPage() {
  const { bulanAktif, infoBulanAktif, setBulanAktif } = useFilterBulan();
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [jenisAktif, setJenisAktif] = useState<string>('semua');
  const isAdmin = user?.role === 'admin';

  const { data, isLoading } = useQuery({
    queryKey: ['temuan-aturan', jenisAktif, bulanAktif, user?.role],
    queryFn: () =>
      fetchTemuanAturan(
        jenisAktif === 'semua' ? null : jenisAktif,
        bulanAktif,
        user?.role ?? 'petugas',
        token
      ),
    initialData: () =>
      getSnapshotTemuanAturan(
        jenisAktif === 'semua' ? null : jenisAktif,
        bulanAktif,
        user?.role ?? 'petugas'
      ),
  });

  const temuanData = data ?? getSnapshotTemuanAturan(
    jenisAktif === 'semua' ? null : jenisAktif,
    bulanAktif,
    user?.role ?? 'petugas'
  );

  const ringkasan = temuanData.ringkasan;
  const totalSemuaAturan =
    ringkasan.melebihi_alokasi +
    ringkasan.gt_2x_alokasi +
    ringkasan.nol +
    ringkasan.lonjakan +
    ringkasan.seragam +
    ringkasan.fakultatif;

  const activeTabInfo =
    JENIS_ATURAN_TABS.find((t) => t.key === jenisAktif) ?? JENIS_ATURAN_TABS[0];

  const columns: DataTableColumn<TemuanAturanItem>[] = [
    {
      id: 'kode',
      header: 'Kode',
      tabular: true,
      sortable: true,
      sortValue: (r) => r.kode,
      widthClass: 'w-24',
      cell: (r) => (
        <div>
          <span className="font-semibold text-[var(--text-ink)]">{r.kode}</span>
          {r.kecamatan && (
            <span className="block text-[11px] text-[var(--text-soft)]">{r.kecamatan}</span>
          )}
        </div>
      ),
    },
    ...(isAdmin
      ? [
          {
            id: 'nama',
            header: 'Nama Pangkalan (Admin)',
            sortable: true,
            sortValue: (r: TemuanAturanItem) => r.nama ?? '',
            widthClass: 'w-44',
            cell: (r: TemuanAturanItem) => <span>{r.nama}</span>,
          },
        ]
      : []),
    {
      id: 'bulan',
      header: 'Bulan',
      tabular: true,
      sortable: true,
      sortValue: (r) => r.bulan,
      widthClass: 'w-20',
      cell: (r) => <span className="font-semibold">{r.label_bulan} 2026</span>,
    },
    {
      id: 'jenis',
      header: 'Jenis Aturan',
      sortable: true,
      sortValue: (r) => r.jenis,
      widthClass: 'w-48',
      cell: (r) => (
        <span className="inline-block px-2 py-0.5 border border-[var(--border-strong)] bg-[var(--surface-subtle)] font-tabular text-xs font-medium">
          {r.label_jenis}
        </span>
      ),
    },
    {
      id: 'kategori',
      header: 'Kategori LOF',
      sortable: true,
      sortValue: (r) => r.kategori,
      widthClass: 'w-36',
      cell: (r) => <TagKategori kategori={r.kategori} compact />,
    },
    {
      id: 'realisasi',
      header: 'Realisasi / Alokasi',
      align: 'right',
      tabular: true,
      sortable: true,
      sortValue: (r) => r.grand_total,
      widthClass: 'w-40',
      cell: (r) => (
        <div>
          <span className="font-semibold">{formatIndonesianNumber(r.grand_total)}</span>
          <span className="text-[var(--text-muted)]">
            {' '}
            / {formatIndonesianNumber(r.alokasi)}
          </span>
          {r.fakultatif > 0 && (
            <span className="block text-[10px] text-[var(--text-soft)]">
              (Fak: +{formatIndonesianNumber(r.fakultatif)})
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'lof',
      header: 'LOF Pendamping',
      align: 'right',
      tabular: true,
      sortable: true,
      sortValue: (r) => r.lof ?? -1,
      widthClass: 'w-32',
      cell: (r) =>
        r.lof !== null ? (
          <div>
            <Angka value={r.lof} decimals={2} animate={false} thresholdAnomali={1.5} />
            <span className="block text-[10px] text-[var(--text-soft)]">
              {r.flag_lof ? 'Ditandai LOF' : 'Normal LOF'}
            </span>
          </div>
        ) : (
          <span className="text-xs text-[var(--text-soft)]">Nol (Di luar LOF)</span>
        ),
    },
    {
      id: 'penjelasan',
      header: 'Rincian Keterangan',
      cell: (r) => <span className="text-xs text-[var(--text-muted)]">{r.penjelasan}</span>,
    },
  ];

  return (
    <div data-testid="temuan-aturan-page">
      <div className="space-y-7">
        {/* Kepala Halaman Temuan Aturan */}
        <header className="border-b-2 border-[var(--border-strong)] pb-6">
          <div className="font-tabular text-xs uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1.5">
            Bagian IV · Pemeriksaan Aturan Deterministik ·{' '}
            <strong className="text-[var(--text-ink)]">
              {infoBulanAktif ? `${infoBulanAktif.nama} 2026` : 'Januari–Oktober 2026'}
            </strong>
          </div>
          <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-[var(--text-ink)]">
            Temuan Aturan Administratif Pendamping LOF
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1.5 max-w-3xl leading-relaxed">
            Daftar pangkalan-bulan yang memenuhi kriteria ambang batas administratif tetap. Seluruh
            temuan ini disajikan sebagai{' '}
            <strong className="text-[var(--text-ink)] font-semibold">
              indikasi awal, bukan bukti pelanggaran
            </strong>
            .
          </p>
        </header>

        {/* Penjelasan Mengapa Aturan Dipisah dari LOF (Tumpang Tindih 11%) & Catatan Februari */}
        <section
          aria-label="Alasan pemisahan LOF dan aturan deterministik"
          data-testid="penjelasan-pemisahan-lof-aturan"
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 border border-[var(--border-strong)] bg-[var(--surface-subtle)]/40 p-5"
        >
          <div className="lg:col-span-7 lg:border-r border-[var(--border-rule)] lg:pr-6 space-y-2">
            <div className="font-tabular text-xs uppercase tracking-wider text-[var(--accent-anomali-teks)] font-semibold">
              Mengapa LOF dan Aturan Disajikan Terpisah? (Tumpang Tindih Hanya 11%)
            </div>
            <h2 className="font-editorial text-xl font-bold text-[var(--text-ink)]">
              Deteksi Kepadatan Relatif vs Ambang Batas Mutlak
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-ink)] leading-relaxed">
              Berdasarkan evaluasi Bab V (<span className="font-tabular">evaluasi_lof.csv</span>),
              hanya <strong className="font-tabular">11% (0,11)</strong> dari observasi yang
              ditandai oleh <span className="font-editorial italic">Local Outlier Factor</span> yang
              sekaligus memiliki tanda aturan pola ekstrem (&gt;2× alokasi, lonjakan satu hari, atau
              pola seragam). LOF mendeteksi pangkalan yang kombinasi 4 fiturnya menyimpang dari
              rekan sebulan, tetapi tidak dirancang memeriksa kuota kontrak absolut atau bulan
              bernilai nol. Karena itu, keduanya disajikan berdampingan dan tidak digabung menjadi
              satu skor campuran.
            </p>
          </div>

          <div
            data-testid="temuan-catatan-februari"
            className="lg:col-span-5 flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="font-tabular text-xs uppercase tracking-wider text-[var(--accent-mustard)] font-semibold">
                Catatan Khusus Data Februari 2026
              </div>
              <h3 className="font-editorial text-lg font-bold text-[var(--text-ink)] mt-0.5">
                Pengecualian Februari pada Aturan Alokasi
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                Pada tabel sumber Februari 2026, kolom alokasi tercatat seragam{' '}
                <strong className="font-tabular text-[var(--text-ink)]">300 tabung</strong> untuk
                hampir seluruh pangkalan (padahal alokasi normal berkisar 660–2.400 tabung). Agar
                tidak menimbulkan tanda semu massal, bulan Februari dikecualikan dari aturan{' '}
                <strong>Melebihi Alokasi (33 kejadian)</strong> dan{' '}
                <strong>&gt; 2× Alokasi (9 kejadian)</strong>.
              </p>
            </div>

            <div className="pt-2 border-t border-[var(--border-rule)] font-tabular text-xs flex items-center justify-between text-[var(--text-muted)]">
              <span>Irisan LOF ≥ 1,50 vs Aturan Ekstrem:</span>
              <strong className="text-sm text-[var(--accent-anomali-teks)]">11,0% (0,11)</strong>
            </div>
          </div>
        </section>

        {/* Pita Ringkasan & Pemilih per Jenis Aturan (Angka Acuan: 33, 9, 11, 2, 1, 69) */}
        <section aria-label="Pilih jenis aturan">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {JENIS_ATURAN_TABS.map((tab) => {
              const count =
                tab.key === 'semua'
                  ? totalSemuaAturan
                  : ringkasan[tab.key as keyof typeof ringkasan] ?? 0;
              const active = jenisAktif === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setJenisAktif(tab.key)}
                  aria-pressed={active}
                  data-testid={`tab-aturan-${tab.key}`}
                  className={`p-3 border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                    active
                      ? 'border-[var(--border-strong)] bg-[var(--text-ink)] text-[var(--surface-paper)]'
                      : 'border-[var(--border-rule)] bg-[var(--surface-subtle)]/35 text-[var(--text-ink)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <span className="font-tabular text-[11px] uppercase tracking-wider opacity-80 block">
                    {tab.label}
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="font-tabular text-2xl font-bold">{count}</span>
                    <span className="font-tabular text-[10px] opacity-70">kejadian</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-rule)] pb-3 text-xs">
            <div>
              <strong className="font-tabular uppercase text-[var(--text-ink)]">
                Definisi ({activeTabInfo.label}):
              </strong>{' '}
              <span className="text-[var(--text-muted)]">{activeTabInfo.kriteria}</span>
            </div>
            <div className="font-tabular text-[var(--text-muted)] shrink-0">
              Menampilkan <strong>{temuanData.items.length}</strong> baris
              {bulanAktif !== null ? ` pada ${infoBulanAktif?.nama} 2026` : ' (Jan–Okt 2026)'}
            </div>
          </div>
        </section>

        <AturanGaris
          varian="tegas"
          label={`Daftar Kejadian: ${activeTabInfo.label}`}
          metaRight="Klik baris untuk membuka Profil Pangkalan"
        />

        <DataTable
          columns={columns}
          data={temuanData.items}
          rowKey={(r) => `${r.id}-${r.kode}-${r.bulan}-${r.jenis}`}
          isRowFlagged={(r) => r.flag_lof}
          onRowClick={(r) => {
            setBulanAktif(r.bulan);
            navigate(`/pangkalan/${r.kode}?bulan=${r.bulan}`);
          }}
          loading={isLoading && temuanData.items.length === 0}
          defaultSortId="bulan"
          defaultSortDir="asc"
        />
      </div>
    </div>
  );
}
