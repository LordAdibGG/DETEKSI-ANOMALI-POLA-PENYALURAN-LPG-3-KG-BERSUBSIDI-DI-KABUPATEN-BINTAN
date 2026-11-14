import { Button } from './Button';

export interface ErrorStateProps {
  kode?: string;
  judul?: string;
  pesan: string;
  catatanKetahanan?: string;
  labelCobaLagi?: string;
  onCobaLagi?: () => void;
  className?: string;
}

export function ErrorState({
  kode = 'GANGGUAN SAMBUNGAN · 503',
  judul = 'Layanan Perhitungan Tidak Dapat Dihubungi',
  pesan,
  catatanKetahanan = 'Data hasil perhitungan terakhir di MySQL tetap utuh dan dapat dibaca seperti biasa.',
  labelCobaLagi = 'Muat Ulang Permintaan',
  onCobaLagi,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-testid="error-state"
      className={`border-l-4 border-l-[#D9480F] border-t border-r border-b border-[var(--border-rule)] bg-[var(--accent-anomali-bg)] p-6 ${className}`.trim()}
    >
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="font-tabular text-[11px] uppercase tracking-[0.16em] text-[var(--accent-anomali-teks)] font-semibold mb-1.5">
            {kode}
          </div>
          <h3 className="font-editorial text-xl font-bold text-[var(--text-ink)] mb-1.5">
            {judul}
          </h3>
          <p className="text-sm text-[var(--text-ink)] leading-relaxed">
            {pesan}
          </p>
          {catatanKetahanan && (
            <p className="text-xs font-tabular text-[var(--text-muted)] mt-2.5 pt-2.5 border-t border-[var(--border-rule)]">
              Catatan ketahanan: {catatanKetahanan}
            </p>
          )}
        </div>
        {onCobaLagi && (
          <div className="shrink-0">
            <Button variant="anomali" size="sm" onClick={onCobaLagi}>
              {labelCobaLagi}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
