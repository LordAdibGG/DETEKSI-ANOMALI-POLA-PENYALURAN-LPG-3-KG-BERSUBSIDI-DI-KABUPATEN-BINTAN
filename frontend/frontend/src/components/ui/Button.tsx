import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'utama' | 'sekunder' | 'anomali' | 'teks';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  utama:
    'border border-[var(--border-strong)] bg-[var(--text-ink)] text-[var(--surface-paper)] hover:opacity-90 active:opacity-80',
  sekunder:
    'border border-[var(--border-strong)] bg-transparent text-[var(--text-ink)] hover:bg-[var(--text-ink)] hover:text-[var(--surface-paper)]',
  anomali:
    'border border-[var(--accent-anomali-teks)] bg-[var(--accent-anomali-teks)] text-[var(--surface-paper)] hover:opacity-90 active:opacity-80',
  teks:
    'border-b border-[var(--border-strong)] bg-transparent text-[var(--text-ink)] px-0.5 py-0.5 hover:border-[var(--accent-anomali)] hover:text-[var(--accent-anomali-teks)]',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs tracking-wider uppercase font-tabular',
  md: 'px-4 py-2 text-xs tracking-wider uppercase font-tabular font-medium',
  lg: 'px-6 py-3 text-sm tracking-wider uppercase font-tabular font-semibold',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'utama',
    size = 'md',
    loading = false,
    disabled,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref
) {
  const isTextVariant = variant === 'teks';
  const sizeClass = isTextVariant ? 'text-xs font-tabular uppercase tracking-wider' : SIZE_CLASSES[size];

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-none transition-colors duration-150 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${sizeClass} ${className}`.trim()}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="inline-block w-2 h-2 bg-current animate-pulse"
        />
      )}
      <span>{children}</span>
    </button>
  );
});
