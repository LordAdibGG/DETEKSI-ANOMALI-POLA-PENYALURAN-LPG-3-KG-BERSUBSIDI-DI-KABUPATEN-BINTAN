import type { HTMLAttributes } from 'react';

export type KategoriPangkalan =
  | 'Sporadis'
  | 'Berulang'
  | 'Konsisten tinggi'
  | 'Normal'
  | 'Data kurang'
  | 'Tidak dinilai';

export interface TagKategoriProps extends HTMLAttributes<HTMLSpanElement> {
  kategori: KategoriPangkalan | string;
  compact?: boolean;
  count?: number;
}

interface KategoriStyle {
  kode: string;
  label: string;
  wrapperClass: string;
  dotClass: string;
}

function resolveKategoriStyle(kategori: string): KategoriStyle {
  const lower = kategori.toLowerCase();

  if (lower.includes('sporadis')) {
    return {
      kode: 'SPO',
      label: 'Sporadis',
      wrapperClass:
        'border-[#D9480F] bg-[var(--accent-anomali-bg)] text-[var(--accent-anomali-teks)] font-semibold',
      dotClass: 'bg-[#D9480F]',
    };
  }

  if (lower.includes('berulang')) {
    return {
      kode: 'BER',
      label: 'Berulang',
      wrapperClass:
        'border-[#C98A00] bg-[var(--accent-mustard-bg)] text-[var(--accent-mustard)] font-semibold',
      dotClass: 'bg-[#C98A00]',
    };
  }

  if (lower.includes('konsisten')) {
    return {
      kode: 'KON',
      label: 'Konsisten tinggi',
      wrapperClass:
        'border-[#3B6E8F] bg-[var(--accent-biru-baja-bg)] text-[var(--accent-biru-baja)] font-semibold',
      dotClass: 'bg-[#3B6E8F]',
    };
  }

  if (lower.includes('data kurang')) {
    return {
      kode: 'DKR',
      label: 'Data kurang',
      wrapperClass:
        'border-dashed border-[var(--text-muted)] bg-transparent text-[var(--text-muted)]',
      dotClass: 'bg-[var(--text-muted)]',
    };
  }

  if (lower.includes('tidak dinilai')) {
    return {
      kode: 'TDN',
      label: 'Tidak dinilai',
      wrapperClass:
        'border-dotted border-[var(--text-soft)] bg-transparent text-[var(--text-soft)] italic',
      dotClass: 'bg-[var(--text-soft)]',
    };
  }

  return {
    kode: 'NRM',
    label: 'Normal',
    wrapperClass:
      'border-[var(--border-rule)] bg-[var(--surface-subtle)] text-[var(--text-ink)]',
    dotClass: 'bg-[var(--text-ink)]',
  };
}

export function TagKategori({
  kategori,
  compact = false,
  count,
  className = '',
  ...rest
}: TagKategoriProps) {
  const style = resolveKategoriStyle(kategori);

  return (
    <span
      data-kategori={style.label}
      className={`inline-flex items-center gap-1.5 border rounded-none font-tabular uppercase tracking-wider ${
        compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${style.wrapperClass} ${className}`.trim()}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={`inline-block w-1.5 h-1.5 ${style.dotClass}`}
      />
      <span>{style.label}</span>
      {typeof count === 'number' && (
        <span className="ml-1 pl-1.5 border-l border-current/30 font-semibold">
          {count}
        </span>
      )}
    </span>
  );
}
