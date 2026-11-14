import { scaleLinear } from 'd3-scale';
import { Angka } from '../ui/Angka';
import { TagKategori, type KategoriPangkalan } from '../ui/TagKategori';

export interface KategoriStackedBarProps {
  perKategori: {
    Normal: number;
    Sporadis: number;
    Berulang: number;
    'Konsisten tinggi': number;
    'Data kurang': number;
    'Tidak dinilai': number;
  };
  onSelectKategori?: (kategori: KategoriPangkalan) => void;
}

interface KategoriSegment {
  key: KategoriPangkalan;
  label: string;
  count: number;
  aturan: string;
  barClass: string;
}

/**
 * Komposisi kategori 30 pangkalan sebagai SATU bar bertumpuk berlabel (bukan donat).
 */
export function KategoriStackedBar({
  perKategori,
  onSelectKategori,
}: KategoriStackedBarProps) {
  const segments: KategoriSegment[] = [
    {
      key: 'Sporadis',
      label: 'Sporadis',
      count: perKategori.Sporadis ?? 6,
      aturan: '≤ 30% bulan valid ditandai',
      barClass: 'bg-[#D9480F] text-[#F3EFE4]',
    },
    {
      key: 'Berulang',
      label: 'Berulang',
      count: perKategori.Berulang ?? 3,
      aturan: '> 30% s.d. < 70% bulan valid',
      barClass: 'bg-[#C98A00] text-[#17211C]',
    },
    {
      key: 'Konsisten tinggi',
      label: 'Konsisten tinggi',
      count: perKategori['Konsisten tinggi'] ?? 1,
      aturan: '≥ 70% bulan valid ditandai',
      barClass: 'bg-[#3B6E8F] text-[#F3EFE4]',
    },
    {
      key: 'Normal',
      label: 'Normal',
      count: perKategori.Normal ?? 18,
      aturan: 'Tidak pernah ditandai (≥ 4 bln)',
      barClass: 'bg-[var(--text-ink)] text-[var(--surface-paper)]',
    },
    {
      key: 'Data kurang',
      label: 'Data kurang',
      count: perKategori['Data kurang'] ?? 1,
      aturan: 'Kurang dari 4 bulan aktif',
      barClass: 'bg-[var(--border-rule)] text-[var(--text-ink)]',
    },
    {
      key: 'Tidak dinilai',
      label: 'Tidak dinilai',
      count: perKategori['Tidak dinilai'] ?? 1,
      aturan: 'Volume nol sepanjang waktu',
      barClass: 'bg-[var(--surface-subtle)] text-[var(--text-muted)]',
    },
  ];

  const totalPangkalan = segments.reduce((acc, s) => acc + s.count, 0) || 30;
  const pctScale = scaleLinear().domain([0, totalPangkalan]).range([0, 100]);

  return (
    <div
      data-testid="kategori-stacked-bar"
      className="border border-[var(--border-strong)] bg-[var(--surface-paper)] p-4 sm:p-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-3 mb-4 border-b border-[var(--border-rule)]">
        <div>
          <h2 className="font-editorial text-xl font-bold text-[var(--text-ink)]">
            Komposisi Konsistensi 30 Pangkalan (Jan–Okt 2026)
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Proporsi klasifikasi lintas bulan dalam satu batang bertumpuk utuh ({totalPangkalan}{' '}
            pangkalan). Klik salah satu segmen atau label untuk menyaring Daftar Prioritas.
          </p>
        </div>
        <span className="font-tabular text-xs text-[var(--text-muted)]">
          100% = {totalPangkalan} Pangkalan (P01–P30)
        </span>
      </div>

      {/* SATU Bar Bertumpuk Utuh */}
      <div
        role="img"
        aria-label="Satu bar bertumpuk komposisi kategori 30 pangkalan"
        className="w-full h-11 flex border border-[var(--border-strong)] overflow-hidden divide-x divide-[var(--surface-paper)]"
      >
        {segments.map((seg) => {
          const widthPct = pctScale(seg.count);
          if (widthPct <= 0) return null;

          return (
            <button
              key={seg.key}
              type="button"
              onClick={() => onSelectKategori?.(seg.key)}
              style={{ width: `${widthPct}%` }}
              title={`${seg.label}: ${seg.count} pangkalan (${widthPct.toFixed(1)}%) — ${seg.aturan}`}
              data-testid={`stacked-seg-${seg.key}`}
              className={`h-full flex items-center justify-center px-1 font-tabular text-xs font-semibold transition-opacity hover:opacity-85 cursor-pointer overflow-hidden ${seg.barClass}`}
            >
              {widthPct >= 9 ? (
                <span className="truncate">
                  {seg.label} ({seg.count})
                </span>
              ) : (
                <span>{seg.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Daftar Label Terstruktur di Bawah Bar Bertumpuk */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 pt-4 border-t border-[var(--border-rule)]">
        {segments.map((seg) => {
          const pct = pctScale(seg.count);
          return (
            <button
              key={seg.key}
              type="button"
              onClick={() => onSelectKategori?.(seg.key)}
              className="text-left p-2.5 border border-[var(--border-rule)] hover:border-[var(--border-strong)] bg-[var(--surface-subtle)]/30 transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <TagKategori kategori={seg.key} compact />
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <Angka value={seg.count} size="xl" />
                  <span className="font-tabular text-xs text-[var(--text-muted)]">
                    {pct.toFixed(1).replace('.', ',')}%
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5 leading-snug">
                {seg.aturan}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
