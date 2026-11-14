import { useMemo, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { motion } from 'motion/react';
import type { TitikSebaranLof } from '../../api/pantau';
import { formatIndonesianNumber, usePrefersReducedMotion } from '../motion/Primitives';

export interface LofStripPlotProps {
  titik: TitikSebaranLof[];
  threshold?: number;
  median?: number | null;
  labelPeriode: string;
  isRentangPenuh?: boolean;
  onSelectPangkalan?: (kode: string) => void;
}

interface PlottedPoint {
  kode: string;
  bulan: number;
  label_bulan: string;
  lof: number;
  flag: boolean;
  cx: number;
  cy: number;
  labelOffsetY: number;
}

/**
 * Strip-plot sebaran LOF buatan sendiri dengan SVG + d3-scale.
 * Satu titik per pangkalan (key = kode), garis batas 1,50, titik yang ditandai berlabel kode.
 * Saat pindah bulan, titik bergeser horizontal dengan animasi pegas.
 */
export function LofStripPlot({
  titik,
  threshold = 1.5,
  median = null,
  labelPeriode,
  isRentangPenuh = false,
  onSelectPangkalan,
}: LofStripPlotProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [hoveredPoint, setHoveredPoint] = useState<PlottedPoint | null>(null);

  const width = 920;
  const height = 220;
  const padLeft = 48;
  const padRight = 48;
  const centerY = 118;

  // Pastikan satu titik unik per pangkalan (bila rentang penuh Jan-Okt, ambil LOF tertinggi tiap pangkalan)
  const uniquePoints = useMemo(() => {
    const byKode = new Map<string, TitikSebaranLof>();
    for (const item of titik) {
      const prev = byKode.get(item.kode);
      if (!prev || item.lof > prev.lof) {
        byKode.set(item.kode, item);
      }
    }
    return Array.from(byKode.values()).sort((a, b) => a.kode.localeCompare(b.kode));
  }, [titik]);

  const maxLofData = useMemo(() => {
    if (uniquePoints.length === 0) return 3.2;
    const highest = Math.max(...uniquePoints.map((p) => p.lof), 3.11);
    return Math.max(3.2, Math.ceil(highest * 10) / 10 + 0.1);
  }, [uniquePoints]);

  const xScale = useMemo(
    () => scaleLinear().domain([0.85, maxLofData]).range([padLeft, width - padRight]).clamp(true),
    [maxLofData]
  );

  // Hitung koordinat cx, cy deterministik per pangkalan agar tidak saling menumpuk di sekitar median ~1,03
  const plottedPoints: PlottedPoint[] = useMemo(() => {
    // Urutkan sementara menurut LOF untuk mengatur offset label titik yang ditandai
    const sortedByLof = [...uniquePoints].sort((a, b) => a.lof - b.lof || a.kode.localeCompare(b.kode));
    const labelTiers = new Map<string, number>();
    let flaggedIdx = 0;

    for (const pt of sortedByLof) {
      if (pt.flag) {
        // Selang-seling posisi label di atas dan di bawah titik agar kode tidak bertabrakan
        const tier = flaggedIdx % 3 === 0 ? -18 : flaggedIdx % 3 === 1 ? 24 : -32;
        labelTiers.set(pt.kode, tier);
        flaggedIdx++;
      }
    }

    return uniquePoints.map((pt) => {
      const numCode = Number.parseInt(pt.kode.replace(/\D/g, ''), 10) || 1;
      // Sebaran vertikal deterministik halus untuk titik normal, sedangkan titik ditandai berada dekat sumbu utama
      const rowOffset = pt.flag
        ? ((numCode % 3) - 1) * 7
        : (((numCode * 7) % 11) - 5) * 5.2;

      return {
        ...pt,
        cx: xScale(pt.lof),
        cy: centerY + rowOffset,
        labelOffsetY: labelTiers.get(pt.kode) ?? -16,
      };
    });
  }, [uniquePoints, xScale]);

  const ticks = [0.9, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
  const thresholdX = xScale(threshold);
  const medianX = median !== null ? xScale(median) : null;

  return (
    <div
      data-testid="lof-strip-plot"
      className="border border-[var(--border-strong)] bg-[var(--surface-paper)] p-4 sm:p-6"
    >
      {/* Kepala Grafik */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-3 mb-3 border-b border-[var(--border-rule)]">
        <div>
          <h2 className="font-editorial text-xl font-bold text-[var(--text-ink)]">
            Sebaran Skor LOF per Pangkalan ({labelPeriode})
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {isRentangPenuh
              ? 'Satu titik mewakili skor LOF tertinggi masing-masing pangkalan sepanjang Jan–Okt 2026. Pilih bulan pada Pita Bulan di atas untuk melihat pergeseran tiap bulan.'
              : 'Satu titik mewakili satu pangkalan aktif yang dinilai pada bulan terpilih. Titik di kanan garis 1,50 ditandai untuk prioritas verifikasi.'}
          </p>
        </div>

        {/* Legenda Ringkas */}
        <div className="flex flex-wrap items-center gap-4 font-tabular text-xs shrink-0">
          <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--text-ink)] opacity-65" />
            <span>Normal (&lt; 1,50)</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[var(--accent-anomali-teks)] font-semibold">
            <span className="inline-block w-3 h-3 rounded-full bg-[#D9480F] border border-[var(--border-strong)]" />
            <span>Ditandai (≥ 1,50)</span>
          </span>
        </div>
      </div>

      {/* Kanvas SVG Strip-Plot */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Strip-plot sebaran skor LOF untuk ${labelPeriode}`}
          className="w-full h-auto min-w-[640px] select-none"
        >
          {/* Zona Latar Anomali (Kanan dari Garis 1,50) */}
          <rect
            x={thresholdX}
            y={28}
            width={width - padRight - thresholdX}
            height={height - 68}
            fill="#D9480F"
            fillOpacity={0.06}
          />

          {/* Garis Sumbu Horizontal Utama */}
          <line
            x1={padLeft}
            y1={centerY}
            x2={width - padRight}
            y2={centerY}
            stroke="var(--border-rule)"
            strokeWidth={1}
          />

          {/* Garis Vertikal & Angka Skala Sumbu X */}
          {ticks.map((t) => {
            const tx = xScale(t);
            const isThresholdTick = Math.abs(t - threshold) < 0.001;
            return (
              <g key={t}>
                <line
                  x1={tx}
                  y1={28}
                  x2={tx}
                  y2={height - 40}
                  stroke={isThresholdTick ? '#D9480F' : 'var(--border-rule)'}
                  strokeWidth={isThresholdTick ? 1.5 : 1}
                  strokeDasharray={isThresholdTick ? '5 3' : '2 3'}
                />
                <text
                  x={tx}
                  y={height - 20}
                  textAnchor="middle"
                  fill={isThresholdTick ? 'var(--accent-anomali-teks)' : 'var(--text-muted)'}
                  className="font-tabular text-[11px]"
                  fontWeight={isThresholdTick ? 600 : 400}
                >
                  {formatIndonesianNumber(t, 2)}
                </text>
              </g>
            );
          })}

          {/* Penanda Median Bulan Ini */}
          {medianX !== null && median !== null && (
            <g>
              <line
                x1={medianX}
                y1={34}
                x2={medianX}
                y2={height - 42}
                stroke="var(--text-ink)"
                strokeWidth={1}
                strokeOpacity={0.45}
              />
              <text
                x={medianX}
                y={22}
                textAnchor="middle"
                fill="var(--text-muted)"
                className="font-tabular text-[10px]"
              >
                Median {formatIndonesianNumber(median, 2)}
              </text>
            </g>
          )}

          {/* Label Garis Batas Penandaan 1,50 */}
          <g>
            <text
              x={thresholdX + 6}
              y={42}
              textAnchor="start"
              fill="var(--accent-anomali-teks)"
              className="font-tabular text-[11px] font-semibold"
            >
              Batas Penandaan 1,50 →
            </text>
          </g>

          {/* Titik-Titik Pangkalan (Normal digambar lebih dulu, Ditandai di lapisan atas) */}
          {[...plottedPoints]
            .sort((a, b) => Number(a.flag) - Number(b.flag))
            .map((pt) => {
              const springTransition = reducedMotion
                ? { duration: 0 }
                : {
                    type: 'spring' as const,
                    stiffness: 260,
                    damping: 26,
                    mass: 0.8,
                  };

              return (
                <motion.g
                  key={pt.kode}
                  initial={false}
                  animate={{ x: pt.cx, y: pt.cy }}
                  transition={springTransition}
                  onMouseEnter={() => setHoveredPoint(pt)}
                  onMouseLeave={() => setHoveredPoint((prev) => (prev?.kode === pt.kode ? null : prev))}
                  onClick={() => onSelectPangkalan?.(pt.kode)}
                  data-testid={`strip-point-${pt.kode}`}
                  data-flagged={pt.flag ? 'true' : 'false'}
                  className="cursor-pointer"
                >
                  {/* Lingkaran Titik */}
                  <circle
                    cx={0}
                    cy={0}
                    r={pt.flag ? 6 : 4.2}
                    fill={pt.flag ? '#D9480F' : 'var(--text-ink)'}
                    fillOpacity={pt.flag ? 0.95 : 0.55}
                    stroke={pt.flag ? 'var(--surface-paper)' : 'none'}
                    strokeWidth={pt.flag ? 1.5 : 0}
                  />

                  {/* Garis penghubung tipis & Label Kode untuk semua titik yang ditandai */}
                  {pt.flag && (
                    <>
                      <line
                        x1={0}
                        y1={pt.labelOffsetY < 0 ? -6 : 6}
                        x2={0}
                        y2={pt.labelOffsetY < 0 ? pt.labelOffsetY + 9 : pt.labelOffsetY - 10}
                        stroke="#D9480F"
                        strokeWidth={1}
                        strokeOpacity={0.65}
                      />
                      <text
                        x={0}
                        y={pt.labelOffsetY}
                        textAnchor="middle"
                        fill="var(--accent-anomali-teks)"
                        className="font-tabular text-[11px] font-semibold"
                      >
                        {pt.kode}
                      </text>
                    </>
                  )}
                </motion.g>
              );
            })}
        </svg>
      </div>

      {/* Baris Keterangan Interaktif di Bawah Strip-Plot */}
      <div className="mt-2 pt-2.5 border-t border-[var(--border-rule)] flex flex-wrap items-center justify-between gap-2 font-tabular text-xs text-[var(--text-muted)]">
        {hoveredPoint ? (
          <div>
            Sorotan:{' '}
            <strong className="text-[var(--text-ink)]">{hoveredPoint.kode}</strong> · Bulan{' '}
            <strong className="text-[var(--text-ink)]">{hoveredPoint.label_bulan} 2026</strong> ·
            Skor LOF{' '}
            <strong
              className={
                hoveredPoint.flag ? 'text-[var(--accent-anomali-teks)]' : 'text-[var(--text-ink)]'
              }
            >
              {formatIndonesianNumber(hoveredPoint.lof, 2)}
            </strong>{' '}
            ({hoveredPoint.flag ? 'Ditandai ≥ 1,50' : 'Normal < 1,50'}) — klik titik untuk melihat
            profil pangkalan.
          </div>
        ) : (
          <div>
            Arahkan kursor pada titik untuk melihat detail skor LOF, atau klik titik berlabel kode
            untuk membuka profil pangkalan.
          </div>
        )}
        <div>Sumbu X: Skor Local Outlier Factor (k=10, metrik Euclidean)</div>
      </div>
    </div>
  );
}
