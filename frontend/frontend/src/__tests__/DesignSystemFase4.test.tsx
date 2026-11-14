import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { ToastProvider } from '../components/ui/Toast';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

function renderRoute(initialEntry = '/__kit') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

describe('Fase 4 — Design System, Shell Editorial, Pita Bulan & Mode Gelap', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
  });

  it('menampilkan rute /__kit lengkap dengan header teks, pita bulan Jan-Okt, palet warna, dan 6 kategori', () => {
    renderRoute('/__kit');

    expect(screen.getByTestId('design-kit-page')).toBeInTheDocument();

    // Navigasi header teks: Ringkasan, Prioritas, Peta Panas, Temuan Aturan, Metode
    expect(screen.getByRole('link', { name: /Ringkasan/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Prioritas/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Peta Panas/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Temuan Aturan/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Metode/i })).toBeInTheDocument();

    // Pita bulan Jan-Okt selalu tampak
    expect(screen.getByTestId('pita-bulan-global')).toBeInTheDocument();
    expect(screen.getByTestId('pita-bulan-semua')).toHaveAttribute('aria-pressed', 'true');
    for (let m = 1; m <= 10; m++) {
      expect(screen.getByTestId(`pita-bulan-${m}`)).toBeInTheDocument();
    }

    // Token warna utama tampil
    expect(screen.getAllByText('#F3EFE4').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('#17211C').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('#D9D2BF').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('#D9480F').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('#C98A00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('#3B6E8F').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('#86B817').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('#0F1814').length).toBeGreaterThanOrEqual(1);
  });

  it('mengaktifkan Mode Gelap (#0F1814) dan memperbarui atribut root HTML', () => {
    renderRoute('/__kit');

    expect(document.documentElement.classList.contains('dark')).toBe(false);

    const darkButton = screen.getByTestId('kit-btn-gelap');
    fireEvent.click(darkButton);

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    const lightButton = screen.getByTestId('kit-btn-terang');
    fireEvent.click(lightButton);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('memfilter bulan secara global saat tombol bulan pada Pita Bulan diklik', () => {
    renderRoute('/__kit');

    const sepButton = screen.getByTestId('pita-bulan-9');
    fireEvent.click(sepButton);

    expect(sepButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/September \(Bulan 9\)/i)).toBeInTheDocument();
  });

  it('membedakan tampilan DataTable antara peran Petugas (tanpa nama pangkalan) dan Admin (dengan nama pangkalan)', () => {
    renderRoute('/__kit');

    // Default adalah petugas: kolom Nama Pangkalan tidak ditampilkan
    expect(screen.queryByText('Pangkalan KJP Kijang Kota I')).not.toBeInTheDocument();
    expect(screen.getByText('P01')).toBeInTheDocument();

    // Beralih ke peran Admin
    const roleSwitcher = screen.getByTestId('role-switcher');
    fireEvent.click(roleSwitcher);

    expect(screen.getByText('Pangkalan KJP Kijang Kota I')).toBeInTheDocument();
  });

  it('menampilkan halaman login tipografis di /masuk dengan kolofon riset dan pengisi cepat', () => {
    renderRoute('/masuk');

    expect(screen.getByTestId('typographic-login-page')).toBeInTheDocument();
    expect(screen.getByText(/Pengesahan Akses/i)).toBeInTheDocument();
    expect(screen.getAllByText(/30 Pangkalan/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/293 Bulan/i)).toBeInTheDocument();

    const btnPetugas = screen.getByRole('button', { name: /Isi Akun Petugas/i });
    fireEvent.click(btnPetugas);

    const emailInput = screen.getByLabelText(/Alamat Surel/i) as HTMLInputElement;
    expect(emailInput.value).toBe('petugas@bintankab.go.id');
  });
});
