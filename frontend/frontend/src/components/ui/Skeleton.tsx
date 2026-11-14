export interface SkeletonProps {
  varian?: 'baris' | 'blok' | 'tabel';
  baris?: number;
  className?: string;
}

export function Skeleton({
  varian = 'baris',
  baris = 3,
  className = '',
}: SkeletonProps) {
  if (varian === 'tabel') {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Memuat baris buku besar"
        className={`w-full border-t border-b border-[var(--border-rule)] divide-y divide-[var(--border-rule)] ${className}`.trim()}
      >
        {Array.from({ length: baris }).map((_, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-4 py-3.5 px-3 items-center">
            <div className="col-span-2 h-3.5 bg-[var(--border-rule)] animate-pulse" />
            <div className="col-span-3 h-3.5 bg-[var(--border-rule)] animate-pulse" />
            <div className="col-span-4 h-3.5 bg-[var(--border-rule)]/70 animate-pulse" />
            <div className="col-span-3 h-3.5 bg-[var(--border-rule)] animate-pulse justify-self-end w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (varian === 'blok') {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Memuat penampang data"
        className={`border border-[var(--border-rule)] bg-[var(--surface-subtle)]/60 p-5 ${className}`.trim()}
      >
        <div className="h-3 w-24 bg-[var(--border-rule)] animate-pulse mb-3" />
        <div className="h-7 w-40 bg-[var(--border-rule)] animate-pulse mb-4" />
        <div className="space-y-2 border-t border-[var(--border-rule)] pt-3">
          <div className="h-3 w-full bg-[var(--border-rule)]/80 animate-pulse" />
          <div className="h-3 w-2/3 bg-[var(--border-rule)]/60 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Memuat teks"
      className={`space-y-2.5 ${className}`.trim()}
    >
      {Array.from({ length: baris }).map((_, idx) => (
        <div
          key={idx}
          className={`h-3.5 bg-[var(--border-rule)] animate-pulse ${
            idx === baris - 1 ? 'w-3/5' : 'w-full'
          }`}
        />
      ))}
    </div>
  );
}
