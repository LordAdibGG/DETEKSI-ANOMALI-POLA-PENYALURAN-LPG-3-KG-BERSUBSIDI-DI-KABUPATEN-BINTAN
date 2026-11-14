import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { ToastProvider } from '../components/ui/Toast';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

function renderApp(initialEntry = '/peta-panas') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

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

describe('Fase 6 — Peta Panas dan Profil Pangkalan', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('menampilkan P10 ditandai 7 bulan dan P07 ditandai Juni-Oktober pada Peta Panas, lengkap dengan hover 4 z-score, slider batas, dan tabel pembaca layar', () => {
    renderApp('/peta-panas');

    expect(screen.getByTestId('peta-panas-page')).toBeInTheDocument();

    // P10 tampil ditandai 7 bulan (Feb, Apr, Mei, Jun, Jul, Sep, Okt)
    expect(screen.getByTestId('heatmap-count-P10')).toHaveTextContent('7/10');
    const p10FlaggedMonths = [2, 4, 5, 6, 7, 9, 10];
    for (let m = 1; m <= 10; m++) {
      const cell = screen.getByTestId(`heatmap-cell-P10-${m}`);
      expect(cell).toHaveAttribute('data-flagged', p10FlaggedMonths.includes(m) ? 'true' : 'false');
    }

    // P07 tampil ditandai Juni-Oktober (bulan 6, 7, 8, 9, 10)
    expect(screen.getByTestId('heatmap-count-P07')).toHaveTextContent('5/10');
    for (let m = 1; m <= 10; m++) {
      const cell = screen.getByTestId(`heatmap-cell-P07-${m}`);
      const shouldBeFlagged = m >= 6 && m <= 10;
      expect(cell).toHaveAttribute('data-flagged', shouldBeFlagged ? 'true' : 'false');
    }

    // Hover pada sel P10 bulan April (bulan 4) menampilkan garis silang dan tooltip 4 z-score
    const cellP10Apr = screen.getByTestId('heatmap-cell-P10-4');
    fireEvent.mouseEnter(cellP10Apr);

    expect(screen.getByTestId('heatmap-crosshair')).toBeInTheDocument();
    const tooltip = screen.getByTestId('heatmap-tooltip-panel');
    expect(tooltip).toHaveTextContent('P10');
    expect(tooltip).toHaveTextContent('3,11');
    expect(tooltip).toHaveTextContent('1. Log Total Volume');
    expect(tooltip).toHaveTextContent('2. Variasi Harian (CV)');
    expect(tooltip).toHaveTextContent('3. Rasio Hari Aktif');
    expect(tooltip).toHaveTextContent('4. Porsi Nilai Dominan');

    // Slider "lihat dengan batas lain" memperbarui jumlah sel terbingkai secara reaktif di klien
    expect(screen.getByTestId('heatmap-dynamic-flag-total')).toHaveTextContent('28');
    const slider = screen.getByTestId('slider-batas-lof');
    fireEvent.change(slider, { target: { value: '2.0' } });
    expect(screen.getByTestId('heatmap-threshold-display')).toHaveTextContent('LOF ≥ 2,00');
    const newCount = Number.parseInt(
      screen.getByTestId('heatmap-dynamic-flag-total').textContent || '0',
      10
    );
    expect(newCount).toBeLessThan(28);
    expect(newCount).toBeGreaterThan(0);

    // Tabel alternatif pembaca layar tersedia dengan 30 baris pangkalan
    const srTable = screen.getByTestId('heatmap-sr-table');
    expect(within(srTable).getAllByRole('row').length).toBe(31); // 1 header + 30 baris

    // Klik sel P07 bulan Juni (6) -> membuka profil P07 pada bulan Juni
    fireEvent.click(screen.getByTestId('heatmap-cell-P07-6'));
    expect(screen.getByTestId('profil-pangkalan-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'P07' })).toBeInTheDocument();
    expect(screen.getByTestId('profil-pilih-bulan-6')).toHaveAttribute('aria-pressed', 'true');
  });

  it('menampilkan halaman Profil Pangkalan (/pangkalan/P10 dan /pangkalan/P07) dengan 4 blok visualisasi dan kalimat cara membaca', () => {
    renderApp('/pangkalan/P10');

    expect(screen.getByTestId('profil-pangkalan-page')).toBeInTheDocument();
    expect(screen.getByTestId('profil-bulan-ditandai')).toHaveTextContent('7');
    expect(screen.getByTestId('profil-daftar-bulan-ditandai')).toHaveTextContent(
      'Feb, Apr, Mei, Jun, Jul, Sep, Okt'
    );

    // Keempat blok profil wajib tampil
    const blok1 = screen.getByTestId('profil-blok-1-harian');
    const blok2 = screen.getByTestId('profil-blok-2-lof-10-bulan');
    const blok3 = screen.getByTestId('profil-blok-3-lollipop-z');
    const blok4 = screen.getByTestId('profil-blok-4-alokasi');

    expect(blok1).toHaveTextContent(/Cara membaca:/i);
    expect(blok2).toHaveTextContent(/Cara membaca:/i);
    expect(blok3).toHaveTextContent(/Cara membaca:/i);
    expect(blok4).toHaveTextContent(/Cara membaca:/i);

    // Catatan Februari dikecualikan tampil di Blok 4
    expect(screen.getByTestId('catatan-februari-dikecualikan')).toHaveTextContent(
      /Februari dikecualikan/i
    );

    // Garis LOF 10 bulan tergambar
    expect(screen.getByTestId('profil-lof-line-path')).toBeInTheDocument();
  });
});
