import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { EDITORIAL_EASE, usePrefersReducedMotion } from '../motion/Primitives';

export type ToastTone = 'info' | 'berhasil' | 'peringatan' | 'anomali';

export interface ToastItem {
  id: string;
  judul: string;
  deskripsi?: string;
  nada?: ToastTone;
}

interface ToastContextValue {
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, 'id'> & { durasiMs?: number }) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const TONE_STYLES: Record<ToastTone, { kode: string; border: string; badge: string }> = {
  info: {
    kode: 'CATATAN',
    border: 'border-l-4 border-l-[var(--border-strong)]',
    badge: 'text-[var(--text-muted)]',
  },
  berhasil: {
    kode: 'TERSIMPAN',
    border: 'border-l-4 border-l-[#86B817]',
    badge: 'text-[var(--text-ink)]',
  },
  peringatan: {
    kode: 'PERHATIAN',
    border: 'border-l-4 border-l-[#C98A00]',
    badge: 'text-[var(--accent-mustard)]',
  },
  anomali: {
    kode: 'ANOMALI / GALAT',
    border: 'border-l-4 border-l-[#D9480F]',
    badge: 'text-[var(--accent-anomali-teks)]',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const reduced = usePrefersReducedMotion();

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    ({
      judul,
      deskripsi,
      nada = 'info',
      durasiMs = 4500,
    }: Omit<ToastItem, 'id'> & { durasiMs?: number }) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, judul, deskripsi, nada }]);
      if (durasiMs > 0 && typeof window !== 'undefined') {
        window.setTimeout(() => {
          dismissToast(id);
        }, durasiMs);
      }
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, pushToast, dismissToast }}>
      {children}
      <div
        aria-live="polite"
        aria-label="Pemberitahuan sistem"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 w-full max-w-sm pointer-events-none px-4 sm:px-0"
      >
        <AnimatePresence>
          {toasts.map((t) => {
            const tone = TONE_STYLES[t.nada ?? 'info'];
            return (
              <motion.div
                key={t.id}
                role="status"
                initial={reduced ? { opacity: 1 } : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                transition={{ duration: 0.2, ease: EDITORIAL_EASE }}
                className={`pointer-events-auto border border-[var(--border-strong)] ${tone.border} bg-[var(--surface-paper)] text-[var(--text-ink)] p-4`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div
                      className={`font-tabular text-[10px] uppercase tracking-[0.16em] font-semibold mb-1 ${tone.badge}`}
                    >
                      {tone.kode}
                    </div>
                    <p className="font-editorial text-base font-bold leading-snug">
                      {t.judul}
                    </p>
                    {t.deskripsi && (
                      <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                        {t.deskripsi}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissToast(t.id)}
                    aria-label="Tutup pemberitahuan"
                    className="font-tabular text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-ink)] px-1.5 py-0.5 border border-transparent hover:border-[var(--border-rule)] cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast harus digunakan di dalam ToastProvider');
  }
  return ctx;
}
