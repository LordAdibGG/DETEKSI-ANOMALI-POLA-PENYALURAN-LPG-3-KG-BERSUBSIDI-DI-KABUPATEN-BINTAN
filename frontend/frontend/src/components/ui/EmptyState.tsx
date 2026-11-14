import type { ReactNode } from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  kode?: string;
  judul: string;
  deskripsi: string;
  labelAksi?: string;
  onAksi?: () => void;
  children?: ReactNode;
  className?: string;
}

export function EmptyState({
  kode = 'CATATAN KOSONG · 0 BARIS',
  judul,
  deskripsi,
  labelAksi,
  onAksi,
  children,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      role="region"
      data-testid="empty-state"
      aria-label={judul}
      className={`border-t border-b border-[var(--border-rule)] bg-[var(--surface-subtle)]/40 py-10 px-6 text-left ${className}`.trim()}
    >
      <div className="max-w-xl">
        <div className="font-tabular text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">
          {kode}
        </div>
        <h3 className="font-editorial text-xl font-bold text-[var(--text-ink)] mb-1.5">
          {judul}
        </h3>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          {deskripsi}
        </p>
        {(labelAksi && onAksi) || children ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {labelAksi && onAksi && (
              <Button variant="sekunder" size="sm" onClick={onAksi}>
                {labelAksi}
              </Button>
            )}
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
