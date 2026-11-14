import { CountUp, formatIndonesianNumber } from '../motion/Primitives';

export interface AngkaProps {
  value: number | null | undefined;
  decimals?: number;
  animate?: boolean;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
  anomali?: boolean;
  thresholdAnomali?: number;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  className?: string;
}

const SIZE_MAP: Record<NonNullable<AngkaProps['size']>, string> = {
  sm: 'text-xs font-bold',
  md: 'text-sm font-bold',
  lg: 'text-lg font-bold',
  xl: 'text-2xl md:text-3xl font-bold tracking-tight',
  hero: 'text-4xl md:text-5xl font-bold tracking-tight',
};

export function Angka({
  value,
  decimals = 0,
  animate = true,
  durationMs = 350,
  prefix = '',
  suffix = '',
  anomali,
  thresholdAnomali,
  placeholder = '—',
  size = 'md',
  className = '',
}: AngkaProps) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <span className={`font-tabular text-[var(--text-soft)] ${SIZE_MAP[size]} ${className}`.trim()}>
        {placeholder}
      </span>
    );
  }

  const isFlagged =
    typeof anomali === 'boolean'
      ? anomali
      : typeof thresholdAnomali === 'number'
        ? value >= thresholdAnomali
        : false;

  const colorClass = isFlagged ? 'text-[var(--accent-anomali-teks)] font-bold' : 'font-bold';
  const combinedClass = `font-tabular font-bold ${SIZE_MAP[size]} ${colorClass} ${className}`.trim();

  if (animate) {
    return (
      <CountUp
        value={value}
        decimals={decimals}
        durationMs={durationMs}
        prefix={prefix}
        suffix={suffix}
        className={combinedClass}
      />
    );
  }

  return (
    <span className={combinedClass}>
      {prefix}
      {formatIndonesianNumber(value, decimals)}
      {suffix}
    </span>
  );
}
