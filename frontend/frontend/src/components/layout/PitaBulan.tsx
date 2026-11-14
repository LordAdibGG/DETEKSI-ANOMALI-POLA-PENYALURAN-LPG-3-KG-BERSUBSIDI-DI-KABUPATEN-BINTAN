import { motion } from 'motion/react';
import { useFilterBulan } from '../../context/FilterBulanContext';
import { EDITORIAL_EASE, usePrefersReducedMotion } from '../motion/Primitives';

export function PitaBulan() {
  const { bulanAktif, setBulanAktif, infoBulanAktif, daftarBulan } = useFilterBulan();
  const reduced = usePrefersReducedMotion();

  return (
    <section
      aria-label="Pita Bulan Filter Global Jan sampai Okt 2026"
      data-testid="pita-bulan-global"
      className="sticky top-0 z-30 border-b border-[var(--border-strong)] bg-[var(--surface-paper)]/95"
    >
      <div className="max-w-[1440px] mx-auto px-5 md:px-10 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 overflow-x-auto pb-1 lg:pb-0">
          <span className="font-tabular text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] shrink-0 pr-2 border-r border-[var(--border-rule)]">
            Pita Bulan 2026
          </span>

          <div
            role="group"
            aria-label="Pilih bulan pengawasan"
            className="inline-flex items-stretch border border-[var(--border-rule)] bg-[var(--surface-subtle)]/50 divide-x divide-[var(--border-rule)]"
          >
            {/* Tombol Semua Bulan (Jan-Okt) */}
            <button
              type="button"
              onClick={() => setBulanAktif(null)}
              aria-pressed={bulanAktif === null}
              data-testid="pita-bulan-semua"
              className={`relative px-3 py-1.5 font-tabular text-xs uppercase tracking-wider transition-colors cursor-pointer shrink-0 ${
                bulanAktif === null
                  ? 'bg-[var(--text-ink)] text-[var(--surface-paper)] font-semibold'
                  : 'text-[var(--text-ink)] hover:bg-[var(--surface-subtle)]'
              }`}
            >
              <span>Jan–Okt</span>
              <span
                className={`ml-1.5 text-[10px] ${
                  bulanAktif === null ? 'opacity-90' : 'text-[var(--accent-anomali-teks)] font-semibold'
                }`}
              >
                28
              </span>
              {bulanAktif === null && !reduced && (
                <motion.span
                  layoutId="pita-bulan-aktif-bar"
                  transition={{ duration: 0.22, ease: EDITORIAL_EASE }}
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D9480F]"
                />
              )}
            </button>

            {/* 10 Bulan Jan-Okt */}
            {daftarBulan.map((item) => {
              const aktif = bulanAktif === item.bulan;
              return (
                <button
                  key={item.bulan}
                  type="button"
                  onClick={() => setBulanAktif(item.bulan)}
                  aria-pressed={aktif}
                  data-testid={`pita-bulan-${item.bulan}`}
                  title={`${item.nama} 2026: ${item.ditandai} ditandai dari ${item.masukModel} pangkalan aktif`}
                  className={`relative px-2.5 py-1.5 font-tabular text-xs transition-colors cursor-pointer shrink-0 flex items-baseline gap-1 ${
                    aktif
                      ? 'bg-[var(--text-ink)] text-[var(--surface-paper)] font-semibold'
                      : 'text-[var(--text-ink)] hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  <span className="text-[10px] opacity-60">{item.kode}</span>
                  <span>{item.singkat}</span>
                  <span
                    className={`text-[10px] ${
                      aktif
                        ? 'opacity-90 font-semibold'
                        : item.ditandai >= 4
                          ? 'text-[var(--accent-anomali-teks)] font-semibold'
                          : 'text-[var(--text-muted)]'
                    }`}
                  >
                    ({item.ditandai})
                  </span>
                  {aktif && !reduced && (
                    <motion.span
                      layoutId="pita-bulan-aktif-bar"
                      transition={{ duration: 0.22, ease: EDITORIAL_EASE }}
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D9480F]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ringkasan Konteks Pita Bulan di Kanan */}
        <div className="flex items-center justify-between lg:justify-end gap-3 font-tabular text-xs text-[var(--text-muted)] shrink-0">
          {infoBulanAktif ? (
            <div className="flex items-center gap-2">
              <span>
                Fokus:{' '}
                <strong className="text-[var(--text-ink)] uppercase">
                  {infoBulanAktif.nama} 2026
                </strong>{' '}
                · {infoBulanAktif.masukModel} dinilai ·{' '}
                <strong className="text-[var(--accent-anomali-teks)]">
                  {infoBulanAktif.ditandai} ditandai
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setBulanAktif(null)}
                className="underline underline-offset-4 text-[var(--text-ink)] hover:text-[var(--accent-anomali-teks)] cursor-pointer"
              >
                Reset
              </button>
            </div>
          ) : (
            <span>
              Cakupan: <strong className="text-[var(--text-ink)]">10 Bulan (Jan–Okt)</strong> · 282
              dinilai · <strong className="text-[var(--accent-anomali-teks)]">28 ditandai</strong>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
