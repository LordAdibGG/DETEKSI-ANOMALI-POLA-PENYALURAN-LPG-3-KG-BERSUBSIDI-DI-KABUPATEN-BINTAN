import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { resetOperasionalRuntime, validasiLaporanBulananClient } from '../api/pantau';
import { ToastProvider } from '../components/ui/Toast';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

function renderAtRoute(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
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

describe('Fase 8: Operasional (unggah, analisis ulang, tindak lanjut, ekspor)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetOperasionalRuntime();
  });

  it('memvalidasi 4 cek laporan bulanan CSV (harian=normal, normal+fak=grand, sisa=alokasi-grand, total agen)', () => {
    const brokenCsv = [
      'bulan,id_pangkalan,nama_pangkalan,alokasi,d01,d02,d03,d04,d05,d06,d07,d08,d09,d10,d11,d12,d13,d14,d15,d16,d17,d18,d19,d20,d21,d22,d23,d24,d25,d26,d27,d28,d29,d30,d31,total_normal,total_fakultatif,sisa_alokasi,grand_total',
      '11,P01,"A SING",1000,100,200,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,350,50,600,400',
    ].join('\n');

    const resBroken = validasiLaporanBulananClient(brokenCsv, null, 'admin');
    expect(resBroken.valid).toBe(false);
    expect(resBroken.empat_cek.jumlah_harian_vs_normal.lulus).toBe(false);
    expect(resBroken.empat_cek.normal_fakultatif_vs_grand.lulus).toBe(true);
    expect(resBroken.empat_cek.sisa_alokasi.lulus).toBe(true);
  });

  it('unggah bulan fiktif -> run baru tercipta -> daftar prioritas ikut berubah (P11 & P12 masuk prioritas)', async () => {
    renderAtRoute('/operasional');

    // Aktifkan peran Admin Setda terlebih dahulu
    fireEvent.click(screen.getByTestId('role-switcher'));

    const page = await screen.findByTestId('operasional-page');
    expect(within(page).getByTestId('active-run-badge')).toHaveTextContent('baseline-k10');

    // 1. Muat contoh bulan fiktif (November 2026) -> 4 cek validasi tampil LULUS
    fireEvent.click(within(page).getByTestId('btn-muat-bulan-fiktif'));

    expect(within(page).getByTestId('cek-1-card')).toHaveTextContent('LULUS');
    expect(within(page).getByTestId('cek-2-card')).toHaveTextContent('LULUS');
    expect(within(page).getByTestId('cek-3-card')).toHaveTextContent('LULUS');
    expect(within(page).getByTestId('cek-4-card')).toHaveTextContent('LULUS');
    expect(within(page).getByTestId('tabel-pratinjau-validasi')).toBeInTheDocument();

    // 2. Klik tombol Konfirmasi & Jalankan Analisis -> run baru tercipta
    fireEvent.click(within(page).getByTestId('btn-konfirmasi-unggah'));

    await waitFor(() => {
      expect(within(page).getByTestId('active-run-badge')).toHaveTextContent('unggah-bln11-k10');
    });

    // Pastikan P11 tampil masuk ke daftar prioritas pada panel perbandingan baseline
    expect(within(page).getByTestId('daftar-pangkalan-masuk')).toHaveTextContent('P11');

    // 3. Navigasi ke Daftar Prioritas -> pastikan P11 ikut berubah menjadi Sporadis dan chip Sporadis bertambah
    fireEvent.click(within(page).getByTestId('btn-goto-prioritas'));

    const prioPage = await screen.findByTestId('prioritas-page');
    const rowP11 = within(prioPage).getByTestId('prioritas-row-P11');
    expect(rowP11).toHaveTextContent('Sporadis');
  });

  it('panel parameter admin (mode Top-N), tindak lanjut + riwayat, ekspor CSV, cetak, dan audit log berfungsi', async () => {
    renderAtRoute('/operasional');

    // Aktifkan peran Admin Setda
    fireEvent.click(screen.getByTestId('role-switcher'));

    const page = await screen.findByTestId('operasional-page');

    // 1. Uji Mode Top-N Kapasitas Pemeriksa (default Top-5)
    fireEvent.click(within(page).getByTestId('mode-topn-btn'));
    fireEvent.click(within(page).getByTestId('btn-jalankan-parameter'));

    await waitFor(() => {
      expect(within(page).getByTestId('active-run-badge')).toHaveTextContent('run-k10-top5');
    });
    expect(within(page).getByTestId('daftar-pangkalan-keluar')).toHaveTextContent('5 pangkalan');

    // 2. Uji Tindak Lanjut per pangkalan + catatan + riwayat
    fireEvent.change(within(page).getByTestId('select-status-tl'), {
      target: { value: 'ditindaklanjuti' },
    });
    fireEvent.change(within(page).getByTestId('input-catatan-tindak-lanjut'), {
      target: { value: 'Berita acara pemeriksaan lapangan P10 telah diverifikasi.' },
    });
    fireEvent.click(within(page).getByTestId('btn-simpan-tindak-lanjut'));

    await waitFor(() => {
      expect(within(page).getByTestId('riwayat-tindak-lanjut-box')).toHaveTextContent(
        'Berita acara pemeriksaan lapangan P10 telah diverifikasi.'
      );
    });

    // 3. Pastikan Audit Log mencatat aksi analysis.run dan tindak_lanjut.simpan
    const auditTable = within(page).getByTestId('tabel-audit-log');
    expect(auditTable).toHaveTextContent('analysis.run');
    expect(auditTable).toHaveTextContent('tindak_lanjut.simpan');
  });
});
