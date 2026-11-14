import { memo, useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scaleLinear } from 'd3-scale';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  fetchHeatmap,
  getSnapshotHeatmap,
  type HeatmapCell,
  type HeatmapRow,
} from '../api/pantau';
import {
  EDITORIAL_EASE,
  formatIndonesianNumber,
  usePrefersReducedMotion,
} from '../components/motion/Primitives';
import { Angka } from '../components/ui/Angka';
import { Button } from '../components/ui/Button';
import { TagKategori } from '../components/ui/TagKategori';
import { useAuth } from '../context/AuthContext';
import { useFilterBulan } from '../context/FilterBulanContext';
import { useTheme } from '../context/ThemeContext';

const BULAN_HEADERS = [
  { bulan: 1, label: 'Jan' },
  { bulan: 2, label: 'Feb' },
  { bulan: 3, label: 'Mar' },
  { bulan: 4, label: 'Apr' },
  { bulan: 5, label: 'Mei' },
  { bulan: 6, label: 'Jun' },
  { bulan: 7, label: 'Jul' },
  { bulan: 8, label: 'Agu' },
  { bulan: 9, label: 'Sep' },
  { bulan: 10, label: 'Okt' },
];

interface PositionedRow {
  row: HeatmapRow;
  rowIndex: number;
  y: number;
  groupHeader?: {
    kategori: string;
    count: number;
    y: number;
  };
}

interface HoveredCellState {
  row: HeatmapRow;
  cell: HeatmapCell;
  rowIndex: number;
  colIndex: number;
  cellX: number;
  cellY: number;
}

interface HeatmapMatrixLayerProps {
  positionedRows: PositionedRow[];
  threshold: number;
  isDark: boolean;
  isAdmin: boolean;
  reducedMotion: boolean;
  bulanAktif: number | null;
  leftWidth: number;
  rightSummaryX: number;
  cellWidth: number;
  cellHeight: number;
  onHoverCell: (state: HoveredCellState | null) => void;
  onSelectCell: (kode: string, bulan: number) => void;
}

/**
 * Lapisan 300 sel matriks yang di-memoize agar pergerakan hover (garis silang + tooltip)
 * berjalan 60 fps tanpa me-re-render seluruh sel SVG.
 */
const HeatmapMatrixLayer = memo(function HeatmapMatrixLayer({
  positionedRows,
  threshold,
  isDark,
  isAdmin,
  reducedMotion,
  bulanAktif,
  leftWidth,
  rightSummaryX,
  cellWidth,
  cellHeight,
  onHoverCell,
  onSelectCell,
}: HeatmapMatrixLayerProps) {
  // Skala satu warna: Kertas -> Oranye Karat (#D9480F)
  const colorScale = useMemo(() => {
    if (isDark) {
      return scaleLinear<string>()
        .domain([0.92, 1.25, 1.5, 3.11])
        .range(['#16221C', '#3A281E', '#8F3613', '#D9480F'])
        .clamp(true);
    }
    return scaleLinear<string>()
      .domain([0.92, 1.25, 1.5, 3.11])
      .range(['#F3EFE4', '#EFE1CF', '#E89B78', '#D9480F'])
      .clamp(true);
  }, [isDark]);

  // Gelombang diagonal total <= 700 ms: maxDelay (38/38 * 0.42s = 420ms) + duration (220ms) = 640ms <= 700ms
  const maxDiagonal = Math.max(1, positionedRows.length - 1 + 9);

  // Navigasi keyboard (roving tabindex): satu perhentian Tab untuk seluruh matriks,
  // panah memindahkan sel, Enter/Spasi membuka profil.
  const [fokus, setFokus] = useState<{ baris: number; kolom: number }>({ baris: 0, kolom: 0 });

  const pindahFokus = (baris: number, kolom: number) => {
    const target = positionedRows[baris]?.row;
    const sel = target?.sel[kolom];
    if (!target || !sel) return;
    setFokus({ baris, kolom });
    window.requestAnimationFrame(() => {
      const el = document.querySelector<SVGElement>(
        `[data-testid="heatmap-cell-${target.kode}-${sel.bulan}"]`
      );
      el?.focus();
    });
  };

  const tanganiTombol = (
    e: KeyboardEvent<SVGGElement>,
    kode: string,
    bulan: number,
    baris: number,
    kolom: number
  ) => {
    const maksBaris = positionedRows.length - 1;
    const maksKolom = (positionedRows[baris]?.row.sel.length ?? 1) - 1;
    switch (e.key) {
      case 'ArrowRight':
        pindahFokus(baris, Math.min(maksKolom, kolom + 1));
        break;
      case 'ArrowLeft':
        pindahFokus(baris, Math.max(0, kolom - 1));
        break;
      case 'ArrowDown':
        pindahFokus(Math.min(maksBaris, baris + 1), kolom);
        break;
      case 'ArrowUp':
        pindahFokus(Math.max(0, baris - 1), kolom);
        break;
      case 'Home':
        pindahFokus(baris, 0);
        break;
      case 'End':
        pindahFokus(baris, maksKolom);
        break;
      case 'Enter':
      case ' ':
        onSelectCell(kode, bulan);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <g>
      {positionedRows.map(({ row, rowIndex, y, groupHeader }) => {
        const dynamicFlagCount = row.sel.filter(
          (c) => !c.nol && c.lof !== null && c.lof >= threshold
        ).length;

        return (
          <g key={row.kode} data-testid={`heatmap-row-${row.kode}`}>
            {/* Sub-header Kelompok Kategori */}
            {groupHeader && (
              <g>
                <line
                  x1={12}
                  y1={groupHeader.y - 4}
                  x2={rightSummaryX + 76}
                  y2={groupHeader.y - 4}
                  stroke="var(--border-strong)"
                  strokeWidth={1}
                />
                <text
                  x={12}
                  y={groupHeader.y + 11}
                  fill="var(--text-ink)"
                  className="font-tabular text-[11px] font-semibold uppercase tracking-wider"
                >
                  Kelompok: {groupHeader.kategori} ({groupHeader.count} Pangkalan)
                </text>
              </g>
            )}

            {/* Label Baris Kiri (Kode + Nama Admin) */}
            <g
              onClick={() => onSelectCell(row.kode, bulanAktif ?? 1)}
              className="cursor-pointer"
            >
              <text
                x={12}
                y={y + cellHeight / 2 + 4}
                fill="var(--text-ink)"
                className="font-tabular text-xs font-semibold"
              >
                {row.kode}
              </text>
              <text
                x={52}
                y={y + cellHeight / 2 + 4}
                fill="var(--text-muted)"
                className="text-[11px]"
              >
                {isAdmin && row.nama
                  ? row.nama.length > 22
                    ? `${row.nama.slice(0, 22)}…`
                    : row.nama
                  : row.kategori}
              </text>
            </g>

            {/* 10 Sel Bulan Jan-Okt */}
            {row.sel.map((cell, colIndex) => {
              const cellX = leftWidth + colIndex * cellWidth;
              const isFlaggedDynamic =
                !cell.nol && cell.lof !== null && cell.lof >= threshold;
              const fill = cell.nol || cell.lof === null
                ? 'url(#heatmap-arsir-nol)'
                : colorScale(cell.lof);

              // kontras teks di dalam sel yang berangka
              const textFill =
                cell.lof !== null && cell.lof >= 1.95
                  ? '#F3EFE4'
                  : isDark
                    ? '#F3EFE4'
                    : '#17211C';

              const diagDelay = reducedMotion
                ? 0
                : ((rowIndex + colIndex) / maxDiagonal) * 0.42;

              return (
                <motion.g
                  key={cell.bulan}
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.22,
                    delay: diagDelay,
                    ease: EDITORIAL_EASE,
                  }}
                  style={{
                    transformOrigin: `${cellX + cellWidth / 2}px ${y + cellHeight / 2}px`,
                  }}
                  data-testid={`heatmap-cell-${row.kode}-${cell.bulan}`}
                  data-flagged={isFlaggedDynamic ? 'true' : 'false'}
                  data-nol={cell.nol ? 'true' : 'false'}
                  role="button"
                  tabIndex={fokus.baris === rowIndex && fokus.kolom === colIndex ? 0 : -1}
                  aria-label={`${row.kode}, ${cell.label} 2026: ${
                    cell.nol || cell.lof === null
                      ? 'penyaluran nol, tidak dinilai'
                      : `LOF ${formatIndonesianNumber(cell.lof, 2)}${
                          isFlaggedDynamic ? ', ditandai' : ', tidak ditandai'
                        }`
                  }. Enter untuk membuka profil.`}
                  onKeyDown={(e) => tanganiTombol(e, row.kode, cell.bulan, rowIndex, colIndex)}
                  onFocus={() => {
                    setFokus({ baris: rowIndex, kolom: colIndex });
                    onHoverCell({
                      row,
                      cell,
                      rowIndex,
                      colIndex,
                      cellX,
                      cellY: y,
                    });
                  }}
                  onMouseEnter={() =>
                    onHoverCell({
                      row,
                      cell,
                      rowIndex,
                      colIndex,
                      cellX,
                      cellY: y,
                    })
                  }
                  onClick={() => onSelectCell(row.kode, cell.bulan)}
                  className="cursor-pointer"
                >
                  {/* Kotak Dasar Sel */}
                  <rect
                    x={cellX + 2}
                    y={y + 2}
                    width={cellWidth - 4}
                    height={cellHeight - 4}
                    fill={fill}
                    stroke="var(--border-rule)"
                    strokeWidth={0.75}
                  />

                  {/* Bingkai Tegas Teranimasi untuk Sel LOF >= Batas */}
                  <motion.rect
                    x={cellX + 2.5}
                    y={y + 2.5}
                    width={cellWidth - 5}
                    height={cellHeight - 5}
                    fill="none"
                    initial={false}
                    animate={{
                      opacity: isFlaggedDynamic ? 1 : 0,
                      strokeWidth: isFlaggedDynamic ? 2 : 0,
                    }}
                    transition={{
                      duration: reducedMotion ? 0 : 0.18,
                      ease: EDITORIAL_EASE,
                    }}
                    stroke={isDark ? '#F3EFE4' : '#17211C'}
                  />

                  {/* Angka LOF pada Sel yang Melewati Batas (atau Label NOL pada sel diarsir) */}
                  {isFlaggedDynamic && cell.lof !== null ? (
                    <text
                      x={cellX + cellWidth / 2}
                      y={y + cellHeight / 2 + 4}
                      textAnchor="middle"
                      fill={textFill}
                      className="font-tabular text-[11px] font-semibold pointer-events-none"
                    >
                      {formatIndonesianNumber(cell.lof, 2)}
                    </text>
                  ) : cell.nol ? (
                    <text
                      x={cellX + cellWidth / 2}
                      y={y + cellHeight / 2 + 3.5}
                      textAnchor="middle"
                      fill="var(--text-soft)"
                      className="font-tabular text-[9px] uppercase pointer-events-none"
                    >
                      Nol
                    </text>
                  ) : null}
                </motion.g>
              );
            })}

            {/* Ringkasan Kanan per Baris (Jumlah Bulan Ditandai / Bulan Valid) */}
            <text
              x={rightSummaryX + 36}
              y={y + cellHeight / 2 + 4}
              textAnchor="end"
              fill={dynamicFlagCount > 0 ? 'var(--accent-anomali-teks)' : 'var(--text-muted)'}
              data-testid={`heatmap-count-${row.kode}`}
              className="font-tabular text-xs font-semibold"
            >
              {dynamicFlagCount}/{row.bulan_valid}
            </text>
            <text
              x={rightSummaryX + 74}
              y={y + cellHeight / 2 + 4}
              textAnchor="end"
              fill="var(--text-muted)"
              className="font-tabular text-xs"
            >
              {row.maks_lof !== null ? formatIndonesianNumber(row.maks_lof, 2) : '—'}
            </text>
          </g>
        );
      })}
    </g>
  );
});

export function PetaPanasPage() {
  const { user, token } = useAuth();
  const { isDark } = useTheme();
  const { bulanAktif, setBulanAktif } = useFilterBulan();
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();

  const [customThreshold, setCustomThreshold] = useState<number>(1.5);
  const [hoveredCell, setHoveredCell] = useState<HoveredCellState | null>(null);

  const isAdmin = user?.role === 'admin';

  const { data: rows = [] } = useQuery({
    queryKey: ['heatmap', user?.role],
    queryFn: () => fetchHeatmap(user?.role ?? 'petugas', token),
    initialData: () => getSnapshotHeatmap(user?.role ?? 'petugas'),
  });

  // Dimensi tata letak SVG
  const leftWidth = 225;
  const cellWidth = 64;
  const cellHeight = 30;
  const topHeaderHeight = 46;
  const groupHeaderHeight = 24;
  const rightSummaryX = leftWidth + 10 * cellWidth + 12;
  const svgWidth = rightSummaryX + 86;

  // Hitung posisi vertikal tiap baris dengan pemisah per kelompok kategori
  const { positionedRows, svgHeight, totalFlaggedDynamic } = useMemo(() => {
    const out: PositionedRow[] = [];
    let currentY = topHeaderHeight;
    let lastKategori = '';
    let flagCounter = 0;

    // Hitung jumlah pangkalan per kategori
    const countsByKategori = new Map<string, number>();
    for (const r of rows) {
      countsByKategori.set(r.kategori, (countsByKategori.get(r.kategori) ?? 0) + 1);
      for (const c of r.sel) {
        if (!c.nol && c.lof !== null && c.lof >= customThreshold) {
          flagCounter++;
        }
      }
    }

    rows.forEach((row, idx) => {
      let groupHeader: PositionedRow['groupHeader'] | undefined;
      if (row.kategori !== lastKategori) {
        if (idx > 0) {
          currentY += 8;
        }
        groupHeader = {
          kategori: row.kategori,
          count: countsByKategori.get(row.kategori) ?? 0,
          y: currentY,
        };
        currentY += groupHeaderHeight;
        lastKategori = row.kategori;
      }

      out.push({
        row,
        rowIndex: idx,
        y: currentY,
        groupHeader,
      });

      currentY += cellHeight;
    });

    return {
      positionedRows: out,
      svgHeight: currentY + 18,
      totalFlaggedDynamic: flagCounter,
    };
  }, [rows, customThreshold]);

  const handleHoverCell = useCallback((state: HoveredCellState | null) => {
    setHoveredCell(state);
  }, []);

  const handleSelectCell = useCallback(
    (kode: string, bulan: number) => {
      setBulanAktif(bulan);
      navigate(`/pangkalan/${kode}?bulan=${bulan}`);
    },
    [navigate, setBulanAktif]
  );

  return (
    <div data-testid="peta-panas-page">
      <div className="space-y-6">
        {/* Kepala Halaman Peta Panas */}
        <header className="border-b-2 border-[var(--border-strong)] pb-5">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <div className="font-tabular text-xs uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1.5">
                Bagian III · Matriks Pangkalan × Bulan · Januari–Oktober 2026
              </div>
              <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-[var(--text-ink)]">
                Peta Panas Kepadatan Lokal (30 Pangkalan × 10 Bulan)
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-1.5 max-w-3xl leading-relaxed">
                Baris dikelompokkan menurut kategori konsistensi pangkalan. Sel yang melewati batas
                penandaan diberi bingkai tegas dan angka skor LOF; sel dengan penyaluran nol
                diarsir. Penandaan ini merupakan{' '}
                <strong className="text-[var(--text-ink)] font-semibold">
                  indikasi awal, bukan bukti pelanggaran
                </strong>
                .
              </p>
            </div>

            {/* Kontrol Slider "Lihat dengan Batas Lain" (Hanya Klien) */}
            <div className="border border-[var(--border-strong)] bg-[var(--surface-subtle)]/45 p-3.5 min-w-[290px]">
              <div className="flex items-center justify-between gap-3 font-tabular text-xs mb-1.5">
                <label
                  htmlFor="slider-batas-lof"
                  className="uppercase tracking-wider font-semibold text-[var(--text-ink)]"
                >
                  Lihat dengan batas lain:
                </label>
                <span
                  data-testid="heatmap-threshold-display"
                  className="px-2 py-0.5 border border-[#D9480F] bg-[var(--accent-anomali-bg)] text-[var(--accent-anomali-teks)] font-bold"
                >
                  LOF ≥ {formatIndonesianNumber(customThreshold, 2)}
                </span>
              </div>

              <input
                id="slider-batas-lof"
                data-testid="slider-batas-lof"
                type="range"
                min={1.1}
                max={2.5}
                step={0.05}
                value={customThreshold}
                onChange={(e) => setCustomThreshold(Number.parseFloat(e.target.value))}
                className="w-full accent-[#D9480F] cursor-pointer"
              />

              <div className="flex items-center justify-between font-tabular text-[11px] text-[var(--text-muted)] mt-1">
                <span>
                  Terbingkai:{' '}
                  <strong
                    data-testid="heatmap-dynamic-flag-total"
                    className="text-[var(--accent-anomali-teks)]"
                  >
                    {totalFlaggedDynamic}
                  </strong>{' '}
                  / 282 sel aktif
                </span>
                {Math.abs(customThreshold - 1.5) > 0.001 ? (
                  <button
                    type="button"
                    onClick={() => setCustomThreshold(1.5)}
                    className="underline text-[var(--text-ink)] hover:text-[var(--accent-anomali-teks)] cursor-pointer"
                  >
                    Kembalikan 1,50 (Acuan)
                  </button>
                ) : (
                  <span>Batas acuan riset: 1,50</span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Legenda Skala Satu Warna Kertas -> Oranye Karat & Petunjuk Baca */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-rule)] pb-3 font-tabular text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">Skala LOF:</span>
              <span className="text-[11px]">0,92</span>
              <span
                aria-hidden="true"
                className="inline-block w-28 h-3 border border-[var(--border-rule)]"
                style={{
                  background: isDark
                    ? 'linear-gradient(90deg, #16221C 0%, #3A281E 35%, #8F3613 60%, #D9480F 100%)'
                    : 'linear-gradient(90deg, #F3EFE4 0%, #EFE1CF 35%, #E89B78 60%, #D9480F 100%)',
                }}
              />
              <span className="text-[11px] font-semibold text-[var(--accent-anomali-teks)]">3,11</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-3.5 border-2 border-[var(--border-strong)] bg-[#D9480F] text-[#F3EFE4] text-[9px] text-center leading-3 font-bold">
                #
              </span>
              <span className="text-[var(--text-muted)]">
                Sel ≥ {formatIndonesianNumber(customThreshold, 2)} (Berangka & Berbingkai)
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-4 h-3.5 border border-[var(--border-rule)]"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(120,120,110,0.35) 2px, rgba(120,120,110,0.35) 4px)',
                }}
              />
              <span className="text-[var(--text-muted)]">Sel Nol (Diarsir)</span>
            </div>
          </div>

          <span className="text-[var(--text-muted)]">
            Klik sel mana pun untuk membuka profil pangkalan pada bulan tersebut.
          </span>
        </div>

        {/* Kanvas SVG Peta Panas + Panel Tooltip 4 Z-Score */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-9 border border-[var(--border-strong)] bg-[var(--surface-paper)] p-3 sm:p-4 overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              role="group"
              aria-label="Matriks Peta Panas skor LOF 30 pangkalan terhadap 10 bulan. Gunakan tombol panah untuk berpindah sel dan Enter untuk membuka profil. Tabel alternatif tersedia di bawah."
              onMouseLeave={() => setHoveredCell(null)}
              data-testid="heatmap-svg"
              className="w-full h-auto min-w-[760px] select-none"
            >
              <defs>
                {/* Pola Arsir Diagonal untuk Sel Penyaluran Nol */}
                <pattern
                  id="heatmap-arsir-nol"
                  width={6}
                  height={6}
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width={6} height={6} fill="var(--surface-subtle)" />
                  <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={6}
                    stroke="var(--text-soft)"
                    strokeWidth={1.6}
                    strokeOpacity={0.55}
                  />
                </pattern>
              </defs>

              {/* Header Kolom Bulan (Jan - Okt) */}
              <g>
                <text
                  x={12}
                  y={28}
                  fill="var(--text-muted)"
                  className="font-tabular text-[11px] uppercase tracking-wider font-semibold"
                >
                  Pangkalan / Kategori
                </text>

                {BULAN_HEADERS.map((bh, colIdx) => {
                  const colX = leftWidth + colIdx * cellWidth;
                  const isFilteredCol = bulanAktif === bh.bulan;
                  const isHoveredCol = hoveredCell?.colIndex === colIdx;

                  return (
                    <g key={bh.bulan}>
                      <text
                        x={colX + cellWidth / 2}
                        y={28}
                        textAnchor="middle"
                        fill={
                          isFilteredCol || isHoveredCol
                            ? 'var(--accent-anomali)'
                            : 'var(--text-ink)'
                        }
                        className="font-tabular text-xs font-semibold uppercase"
                      >
                        {bh.label}
                      </text>
                      {isFilteredCol && (
                        <line
                          x1={colX + 4}
                          y1={34}
                          x2={colX + cellWidth - 4}
                          y2={34}
                          stroke="#D9480F"
                          strokeWidth={2}
                        />
                      )}
                    </g>
                  );
                })}

                <text
                  x={rightSummaryX + 36}
                  y={28}
                  textAnchor="end"
                  fill="var(--text-muted)"
                  className="font-tabular text-[11px] uppercase font-semibold"
                >
                  Flag
                </text>
                <text
                  x={rightSummaryX + 74}
                  y={28}
                  textAnchor="end"
                  fill="var(--text-muted)"
                  className="font-tabular text-[11px] uppercase font-semibold"
                >
                  Maks
                </text>
              </g>

              {/* Lapisan Matriks 300 Sel (Memoized untuk 60 fps) */}
              <HeatmapMatrixLayer
                positionedRows={positionedRows}
                threshold={customThreshold}
                isDark={isDark}
                isAdmin={isAdmin}
                reducedMotion={reducedMotion}
                bulanAktif={bulanAktif}
                leftWidth={leftWidth}
                rightSummaryX={rightSummaryX}
                cellWidth={cellWidth}
                cellHeight={cellHeight}
                onHoverCell={handleHoverCell}
                onSelectCell={handleSelectCell}
              />

              {/* Lapisan Garis Silang (Crosshair) saat Hover — Ringan & Tanpa Re-render Sel */}
              {hoveredCell && (
                <g pointerEvents="none" data-testid="heatmap-crosshair">
                  {/* Sorot Baris Horizontal */}
                  <rect
                    x={8}
                    y={hoveredCell.cellY}
                    width={rightSummaryX + 70}
                    height={cellHeight}
                    fill="none"
                    stroke="#D9480F"
                    strokeWidth={1.25}
                    strokeDasharray="3 2"
                  />
                  {/* Sorot Kolom Vertikal */}
                  <rect
                    x={hoveredCell.cellX}
                    y={14}
                    width={cellWidth}
                    height={svgHeight - 24}
                    fill="none"
                    stroke="#D9480F"
                    strokeWidth={1.25}
                    strokeDasharray="3 2"
                  />
                  {/* Penegas Sel Aktif */}
                  <rect
                    x={hoveredCell.cellX + 1}
                    y={hoveredCell.cellY + 1}
                    width={cellWidth - 2}
                    height={cellHeight - 2}
                    fill="none"
                    stroke="#D9480F"
                    strokeWidth={2.5}
                  />
                </g>
              )}
            </svg>
          </div>

          {/* Panel Tooltip Inspeksi Sel & 4 Z-Score */}
          <aside
            aria-live="polite"
            data-testid="heatmap-tooltip-panel"
            className="xl:col-span-3 border border-[var(--border-strong)] bg-[var(--surface-subtle)]/40 p-4 sticky top-16"
          >
            <div className="font-tabular text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] pb-2 mb-3 border-b border-[var(--border-rule)]">
              Rincian Sel & 4 Nilai Z-Score
            </div>

            {hoveredCell ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <span className="font-editorial text-2xl font-bold text-[var(--text-ink)]">
                      {hoveredCell.row.kode}
                    </span>
                    <span className="font-tabular text-xs text-[var(--text-muted)] ml-2">
                      · {hoveredCell.cell.label} 2026
                    </span>
                  </div>
                  <TagKategori kategori={hoveredCell.row.kategori} compact />
                </div>

                {isAdmin && hoveredCell.row.nama && (
                  <p className="text-xs font-medium text-[var(--text-ink)]">
                    {hoveredCell.row.nama}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 border-t border-b border-[var(--border-rule)] py-2.5 font-tabular text-xs">
                  <div>
                    <span className="text-[10px] text-[var(--text-soft)] block uppercase">
                      Skor LOF Bulan Ini
                    </span>
                    {hoveredCell.cell.nol || hoveredCell.cell.lof === null ? (
                      <span className="text-sm font-semibold text-[var(--text-soft)]">
                        Nol (Tidak Dinilai)
                      </span>
                    ) : (
                      <Angka
                        value={hoveredCell.cell.lof}
                        decimals={2}
                        animate={false}
                        thresholdAnomali={customThreshold}
                        size="lg"
                      />
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-soft)] block uppercase">
                      Realisasi / Alokasi
                    </span>
                    <span className="text-sm font-semibold">
                      {hoveredCell.cell.grand_total !== null
                        ? `${formatIndonesianNumber(hoveredCell.cell.grand_total)} / ${formatIndonesianNumber(hoveredCell.cell.alokasi ?? 0)}`
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* 4 Z-Score Robust Bulan Ini */}
                <div>
                  <div className="font-tabular text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
                    4 Fitur Z-Score Robust ({hoveredCell.cell.label} 2026)
                  </div>
                  {hoveredCell.cell.z_score ? (
                    <dl className="space-y-1.5 font-tabular text-xs">
                      {[
                        {
                          key: 'log_total',
                          label: '1. Log Total Volume',
                          val: hoveredCell.cell.z_score.log_total,
                        },
                        {
                          key: 'cv_harian',
                          label: '2. Variasi Harian (CV)',
                          val: hoveredCell.cell.z_score.cv_harian,
                        },
                        {
                          key: 'rasio_hari_aktif',
                          label: '3. Rasio Hari Aktif',
                          val: hoveredCell.cell.z_score.rasio_hari_aktif,
                        },
                        {
                          key: 'porsi_nilai_dominan',
                          label: '4. Porsi Nilai Dominan',
                          val: hoveredCell.cell.z_score.porsi_nilai_dominan,
                        },
                      ].map((zf) => {
                        const absZ = Math.abs(zf.val ?? 0);
                        const isExtreme = absZ >= 2.0;
                        return (
                          <div
                            key={zf.key}
                            className="flex items-center justify-between py-1 px-2 border border-[var(--border-rule)] bg-[var(--surface-paper)]"
                          >
                            <dt className="text-[var(--text-muted)]">{zf.label}</dt>
                            <dd
                              className={`font-semibold ${
                                isExtreme
                                  ? 'text-[var(--accent-anomali-teks)]'
                                  : 'text-[var(--text-ink)]'
                              }`}
                            >
                              {zf.val !== null
                                ? `${zf.val > 0 ? '+' : ''}${formatIndonesianNumber(zf.val, 2)}`
                                : '—'}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  ) : (
                    <p className="text-xs text-[var(--text-soft)] italic">
                      Tidak ada nilai z-score karena volume penyaluran bulan ini nol.
                    </p>
                  )}
                </div>

                <Button
                  variant="utama"
                  size="sm"
                  className="w-full"
                  onClick={() => handleSelectCell(hoveredCell.row.kode, hoveredCell.cell.bulan)}
                >
                  Buka Profil {hoveredCell.row.kode} ({hoveredCell.cell.label}) →
                </Button>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-[var(--text-muted)] leading-relaxed">
                <p>
                  Arahkan kursor pada salah satu sel di matriks untuk menampilkan garis silang dan
                  keempat nilai <span className="font-tabular">z-score</span> fitur bulan tersebut.
                </p>
                <div className="border-t border-[var(--border-rule)] pt-3 font-tabular space-y-1">
                  <div>
                    • <strong>P10</strong> (Konsisten tinggi): ditandai <strong>7 bulan</strong>
                  </div>
                  <div>
                    • <strong>P07</strong> (Berulang): ditandai beruntun{' '}
                    <strong>Juni–Oktober</strong> (5 bulan)
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>

        {/* Tabel Alternatif Tersembunyi untuk Pembaca Layar (Screen Reader) */}
        <div className="sr-only">
          <table
            data-testid="heatmap-sr-table"
            aria-label="Tabel alternatif peta panas skor LOF 30 pangkalan Januari sampai Oktober 2026"
          >
            <caption>
              Matriks skor Local Outlier Factor 30 pangkalan LPG 3 kg Kabupaten Bintan dari Januari
              hingga Oktober 2026
            </caption>
            <thead>
              <tr>
                <th scope="col">Kode Pangkalan</th>
                <th scope="col">Kategori</th>
                {BULAN_HEADERS.map((bh) => (
                  <th key={bh.bulan} scope="col">
                    {bh.label} 2026
                  </th>
                ))}
                <th scope="col">Jumlah Bulan Ditandai</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.kode}>
                  <th scope="row">{row.kode}</th>
                  <td>{row.kategori}</td>
                  {row.sel.map((cell) => (
                    <td key={cell.bulan}>
                      {cell.nol
                        ? 'Volume nol (tidak dinilai)'
                        : cell.lof !== null
                          ? `${formatIndonesianNumber(cell.lof, 2)}${
                              cell.lof >= customThreshold ? ' (Ditandai)' : ''
                            }`
                          : 'Tidak ada data'}
                    </td>
                  ))}
                  <td>
                    {row.bulan_flag} dari {row.bulan_valid} bulan
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
