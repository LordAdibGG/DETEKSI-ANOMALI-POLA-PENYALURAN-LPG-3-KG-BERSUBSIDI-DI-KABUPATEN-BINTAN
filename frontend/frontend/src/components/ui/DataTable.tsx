import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { EDITORIAL_EASE, usePrefersReducedMotion } from '../motion/Primitives';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

export interface DataTableColumn<T> {
  id: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  tabular?: boolean;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  widthClass?: string;
  cell: (row: T, index: number) => ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  isRowFlagged?: (row: T) => boolean;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  defaultSortId?: string;
  defaultSortDir?: 'asc' | 'desc';
  caption?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  isRowFlagged,
  onRowClick,
  loading = false,
  emptyTitle = 'Tidak ada pangkalan yang cocok dengan kriteria saringan',
  emptyDescription = 'Ubah pilihan pada Pita Bulan di atas atau hapus kata kunci pencarian untuk menampilkan seluruh buku besar.',
  defaultSortId,
  defaultSortDir = 'desc',
  caption,
  className = '',
}: DataTableProps<T>) {
  const [sortId, setSortId] = useState<string | undefined>(defaultSortId);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);
  const reduced = usePrefersReducedMotion();

  const sortedData = useMemo(() => {
    if (!sortId) return data;
    const col = columns.find((c) => c.id === sortId);
    if (!col || !col.sortable || !col.sortValue) return data;

    const copy = [...data];
    copy.sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb), 'id-ID')
        : String(vb).localeCompare(String(va), 'id-ID');
    });
    return copy;
  }, [data, columns, sortId, sortDir]);

  const handleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable) return;
    if (sortId === col.id) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortId(col.id);
      setSortDir('desc');
    }
  };

  if (loading) {
    return <Skeleton varian="tabel" baris={5} className={className} />;
  }

  if (sortedData.length === 0) {
    return (
      <EmptyState
        judul={emptyTitle}
        deskripsi={emptyDescription}
        className={className}
      />
    );
  }

  return (
    <div className={`w-full overflow-x-auto ${className}`.trim()}>
      <table className="w-full border-collapse text-left">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-t-2 border-b border-[var(--border-strong)] bg-[var(--surface-subtle)]/50">
            {columns.map((col) => {
              const alignClass =
                col.align === 'right'
                  ? 'text-right'
                  : col.align === 'center'
                    ? 'text-center'
                    : 'text-left';
              const isSorted = sortId === col.id;

              return (
                <th
                  key={col.id}
                  scope="col"
                  className={`py-2.5 px-3 font-tabular text-[11px] uppercase tracking-[0.12em] font-semibold text-[var(--text-muted)] select-none ${alignClass} ${col.widthClass ?? ''}`}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col)}
                      className={`inline-flex items-center gap-1.5 uppercase tracking-[0.12em] hover:text-[var(--text-ink)] cursor-pointer ${
                        isSorted ? 'text-[var(--text-ink)] underline underline-offset-4' : ''
                      }`}
                    >
                      <span>{col.header}</span>
                      <span aria-hidden="true" className="text-[10px]">
                        {isSorted ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-rule)] border-b border-[var(--border-strong)]">
          {sortedData.map((row, idx) => {
            const key = rowKey(row, idx);
            const flagged = isRowFlagged ? isRowFlagged(row) : false;

            return (
              <motion.tr
                key={key}
                layout={!reduced}
                transition={{ duration: 0.22, ease: EDITORIAL_EASE }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`transition-colors duration-150 ${
                  flagged
                    ? 'bg-[var(--accent-anomali-bg)] hover:bg-[#D9480F]/15'
                    : 'hover:bg-[var(--surface-subtle)]/70'
                } ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((col, colIdx) => {
                  const alignClass =
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left';
                  const tabularClass = col.tabular ? 'font-tabular' : '';
                  const firstColFlagBorder =
                    colIdx === 0 && flagged
                      ? 'border-l-2 border-l-[#D9480F]'
                      : colIdx === 0
                        ? 'border-l-2 border-l-transparent'
                        : '';

                  return (
                    <td
                      key={col.id}
                      className={`py-3 px-3 text-sm ${alignClass} ${tabularClass} ${firstColFlagBorder} ${col.widthClass ?? ''}`}
                    >
                      {col.cell(row, idx)}
                    </td>
                  );
                })}
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
