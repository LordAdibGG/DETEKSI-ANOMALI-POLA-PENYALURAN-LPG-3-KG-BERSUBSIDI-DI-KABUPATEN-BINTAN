export type VarianGaris = 'tipis' | 'tegas' | 'ganda' | 'putus' | 'anomali';

export interface AturanGarisProps {
  varian?: VarianGaris;
  label?: string;
  metaRight?: string;
  className?: string;
}

export function AturanGaris({
  varian = 'tipis',
  label,
  metaRight,
  className = '',
}: AturanGarisProps) {
  if (label || metaRight) {
    return (
      <div
        role="separator"
        className={`flex items-center gap-3 w-full my-4 ${className}`.trim()}
      >
        {label && (
          <span className="font-tabular text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] shrink-0">
            {label}
          </span>
        )}
        <div
          className={`flex-1 ${
            varian === 'tegas'
              ? 'border-t border-[var(--border-strong)]'
              : varian === 'ganda'
                ? 'border-t-2 border-b border-[var(--border-strong)] h-1'
                : varian === 'putus'
                  ? 'border-t border-dashed border-[var(--border-strong)]/60'
                  : varian === 'anomali'
                    ? 'border-t border-[#D9480F]'
                    : 'border-t border-[var(--border-rule)]'
          }`}
        />
        {metaRight && (
          <span className="font-tabular text-[11px] text-[var(--text-soft)] shrink-0">
            {metaRight}
          </span>
        )}
      </div>
    );
  }

  if (varian === 'ganda') {
    return (
      <div
        role="separator"
        className={`w-full border-t-2 border-b border-[var(--border-strong)] h-1.5 my-4 ${className}`.trim()}
      />
    );
  }

  const borderStyle =
    varian === 'tegas'
      ? 'border-t border-[var(--border-strong)]'
      : varian === 'putus'
        ? 'border-t border-dashed border-[var(--border-strong)]/60'
        : varian === 'anomali'
          ? 'border-t border-[#D9480F]'
          : 'border-t border-[var(--border-rule)]';

  return <hr className={`w-full border-0 ${borderStyle} my-4 ${className}`.trim()} />;
}
