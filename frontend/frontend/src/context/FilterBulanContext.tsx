import { createContext, useContext, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface BulanMeta {
  bulan: number;
  kode: string;
  singkat: string;
  nama: string;
  ditandai: number;
  masukModel: number;
}

/**
 * Angka acuan KJP 2026 Jan-Okt:
 * Ditandai per bulan: 2, 4, 3, 3, 2, 2, 2, 2, 5, 3 (Total 28 dari 282 pangkalan-bulan masuk model)
 */
export const DAFTAR_BULAN_ACUAN: BulanMeta[] = [
  { bulan: 1, kode: '01', singkat: 'Jan', nama: 'Januari', ditandai: 2, masukModel: 29 },
  { bulan: 2, kode: '02', singkat: 'Feb', nama: 'Februari', ditandai: 4, masukModel: 28 },
  { bulan: 3, kode: '03', singkat: 'Mar', nama: 'Maret', ditandai: 3, masukModel: 28 },
  { bulan: 4, kode: '04', singkat: 'Apr', nama: 'April', ditandai: 3, masukModel: 28 },
  { bulan: 5, kode: '05', singkat: 'Mei', nama: 'Mei', ditandai: 2, masukModel: 28 },
  { bulan: 6, kode: '06', singkat: 'Jun', nama: 'Juni', ditandai: 2, masukModel: 28 },
  { bulan: 7, kode: '07', singkat: 'Jul', nama: 'Juli', ditandai: 2, masukModel: 28 },
  { bulan: 8, kode: '08', singkat: 'Agu', nama: 'Agustus', ditandai: 2, masukModel: 28 },
  { bulan: 9, kode: '09', singkat: 'Sep', nama: 'September', ditandai: 5, masukModel: 28 },
  { bulan: 10, kode: '10', singkat: 'Okt', nama: 'Oktober', ditandai: 3, masukModel: 29 },
];

interface FilterBulanContextValue {
  bulanAktif: number | null;
  setBulanAktif: (bulan: number | null) => void;
  infoBulanAktif: BulanMeta | null;
  daftarBulan: BulanMeta[];
}

const FilterBulanContext = createContext<FilterBulanContextValue | undefined>(undefined);

export function FilterBulanProvider({
  children,
  defaultBulan = null,
}: {
  children: ReactNode;
  defaultBulan?: number | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramBulan = searchParams.get('bulan');
  const parsedParam = paramBulan ? Number.parseInt(paramBulan, 10) : Number.NaN;
  const validParam =
    !Number.isNaN(parsedParam) && parsedParam >= 1 && parsedParam <= 10 ? parsedParam : null;

  const [internalBulan, setInternalBulan] = useState<number | null>(validParam ?? defaultBulan);

  const bulanAktif = validParam !== null ? validParam : internalBulan;

  const setBulanAktif = (bulan: number | null) => {
    setInternalBulan(bulan);
    const next = new URLSearchParams(searchParams);
    if (bulan === null) {
      next.delete('bulan');
    } else {
      next.set('bulan', String(bulan));
    }
    setSearchParams(next, { replace: true });
  };

  const infoBulanAktif =
    bulanAktif !== null ? DAFTAR_BULAN_ACUAN.find((b) => b.bulan === bulanAktif) ?? null : null;

  return (
    <FilterBulanContext.Provider
      value={{
        bulanAktif,
        setBulanAktif,
        infoBulanAktif,
        daftarBulan: DAFTAR_BULAN_ACUAN,
      }}
    >
      {children}
    </FilterBulanContext.Provider>
  );
}

export function useFilterBulan(): FilterBulanContextValue {
  const ctx = useContext(FilterBulanContext);
  if (!ctx) {
    throw new Error('useFilterBulan harus digunakan di dalam FilterBulanProvider');
  }
  return ctx;
}
