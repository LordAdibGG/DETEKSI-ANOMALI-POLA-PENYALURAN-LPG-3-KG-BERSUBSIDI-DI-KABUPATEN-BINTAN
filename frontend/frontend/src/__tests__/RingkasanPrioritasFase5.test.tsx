import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { ToastProvider } from '../components/ui/Toast';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

function renderApp(initialEntry = '/ringkasan') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // Aktifkan prefers-reduced-motion pada pengujian agar CountUp langsung merender nilai akhir
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={[initialEntry]}>
              <AppRoutes />
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe('Fase 5 — Ringkasan dan Daftar Prioritas (Angka Acuan KJP 2026)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('menampilkan kalimat editorial Ringkasan Jan-Okt (28 dari 282) dan berubah menjadi "Pada Maret 2026, 3 dari 28 pangkalan..." saat Maret dipilih', () => {
    renderApp('/ringkasan');

    const headlineSection = screen.getByTestId('ringkasan-editorial-headline');
    expect(headlineSection).toHaveTextContent(/Sepanjang/i);
    expect(headlineSection).toHaveTextContent(/Januari–Oktober 2026/i);
    expect(headlineSection).toHaveTextContent(/28/);
    expect(headlineSection).toHaveTextContent(/282/);
    expect(headlineSection).toHaveTextContent(/indikasi awal, bukan bukti pelanggaran/i);

    // Pilih bulan Maret (bulan = 3) lewat Pita Bulan
    const btnMaret = screen.getByTestId('pita-bulan-3');
    fireEvent.click(btnMaret);

    expect(headlineSection).toHaveTextContent(
      /Pada Maret 2026, 3 dari 28 pangkalan yang dinilai polanya menyimpang dari pangkalan lain\./i
    );

    // Strip-plot bulan Maret menampilkan tepat 3 titik yang ditandai (flag = true)
    const stripPlot = screen.getByTestId('lof-strip-plot');
    const flaggedCircles = stripPlot.querySelectorAll('[data-flagged="true"]');
    expect(flaggedCircles.length).toBe(3);

    // Komposisi kategori satu bar bertumpuk menampilkan 18/6/3/1/1/1
    const stackedBar = screen.getByTestId('kategori-stacked-bar');
    expect(within(stackedBar).getByTestId('stacked-seg-Normal')).toHaveTextContent('Normal (18)');
    expect(within(stackedBar).getByTestId('stacked-seg-Sporadis')).toHaveTextContent('Sporadis (6)');
    expect(within(stackedBar).getByTestId('stacked-seg-Berulang')).toHaveTextContent('Berulang (3)');
  });

  it('menampilkan Daftar Prioritas dengan 30 pangkalan, chip kategori, pencarian kode, dan navigasi ke profil saat baris diklik', () => {
    renderApp('/prioritas');

    const table = screen.getByTestId('tabel-prioritas');
    const initialRows = table.querySelectorAll('tbody tr');
    expect(initialRows.length).toBe(30);

    // Filter menggunakan chip kategori Sporadis (harus 6 pangkalan)
    fireEvent.click(screen.getByTestId('chip-kategori-Sporadis'));
    expect(table.querySelectorAll('tbody tr').length).toBe(6);

    // Filter menggunakan chip kategori Berulang (harus 3 pangkalan)
    fireEvent.click(screen.getByTestId('chip-kategori-Berulang'));
    expect(table.querySelectorAll('tbody tr').length).toBe(3);

    // Kembalikan ke Semua lalu cari kode P01
    fireEvent.click(screen.getByTestId('chip-kategori-Semua'));
    const searchInput = screen.getByTestId('input-cari-prioritas');
    fireEvent.change(searchInput, { target: { value: 'P01' } });
    expect(table.querySelectorAll('tbody tr').length).toBe(1);

    // Klik baris P01 -> navigasi ke halaman profil /pangkalan/P01
    const rowP01 = screen.getByTestId('prioritas-row-P01');
    fireEvent.click(rowP01);

    expect(screen.getByTestId('profil-pangkalan-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'P01' })).toBeInTheDocument();
  });
});
