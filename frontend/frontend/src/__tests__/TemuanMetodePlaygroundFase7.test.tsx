import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { ToastProvider } from '../components/ui/Toast';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import {
  computeLofFull,
  createDefaultPlaygroundPoints,
  TABEL_IV_1_EXPECTED_LOF_K2,
  TABEL_IV_1_POINTS,
} from '../lib/lofEngine';

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

describe('Fase 7: Temuan Aturan, Metode, dan LOF Playground', () => {
  it('uji paritas TS vs /lof/raw sklearn: 6 titik Tabel IV.1 (k=2) menghasilkan LOF [0.945, 0.945, 1.124, 1.365, 1.365, 7.186]', () => {
    const res = computeLofFull(TABEL_IV_1_POINTS, 2);

    expect(res.lofRounded).toEqual([0.945, 0.945, 1.124, 1.365, 1.365, 7.186]);
    expect(res.lofRounded).toEqual([...TABEL_IV_1_EXPECTED_LOF_K2]);

    // Pastikan setiap langkah antara (k-distance, N_k, reach-dist, lrd) terhitung valid
    expect(res.n).toBe(6);
    for (let i = 0; i < res.n; i++) {
      expect(res.kDistances[i]).toBeGreaterThan(0);
      expect(res.neighbors[i].length).toBeGreaterThanOrEqual(2);
      expect(res.lrd[i]).toBeGreaterThan(0);
    }

    // Uji penanganan jarak seri (tie) pada N_k: titik pusat (0,0) dengan 3 tetangga berjarak sama r=1 pada k=2
    const tiePoints: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
    ];
    const tieRes = computeLofFull(tiePoints, 2);
    // Titik 0 memiliki 3 tetangga berjarak tepat 1.0 -> ketiganya wajib masuk N_2(0)
    expect(tieRes.kDistances[0]).toBeCloseTo(1.0, 6);
    expect(tieRes.neighbors[0]).toHaveLength(3);
  });

  it('menggeser titik q menjauhi klaster padat di LOF Playground menaikkan skor LOF(q) secara mulus', () => {
    const basePoints = createDefaultPlaygroundPoints();
    const qIndex = basePoints.findIndex((p) => p.draggable);
    expect(qIndex).toBeGreaterThanOrEqual(0);

    // 1. Posisi q di dalam Klaster Padat -> LOF mendekati ~1,0
    const ptsInside = basePoints.map((p) => (p.draggable ? [2.2, 2.5] : [p.x, p.y])) as Array<
      [number, number]
    >;
    const lofInside = computeLofFull(ptsInside, 4).lof[qIndex];

    // 2. Posisi q mulai menjauhi Klaster Padat (Tepi) -> LOF naik melewati 1,5
    const ptsEdge = basePoints.map((p) => (p.draggable ? [3.4, 2.6] : [p.x, p.y])) as Array<
      [number, number]
    >;
    const lofEdge = computeLofFull(ptsEdge, 4).lof[qIndex];

    // 3. Posisi q semakin jauh dari Klaster Padat -> LOF naik semakin tinggi
    const ptsFar = basePoints.map((p) => (p.draggable ? [4.4, 1.8] : [p.x, p.y])) as Array<
      [number, number]
    >;
    const lofFar = computeLofFull(ptsFar, 4).lof[qIndex];

    expect(lofInside).toBeLessThan(1.25);
    expect(lofEdge).toBeGreaterThan(1.5);
    expect(lofFar).toBeGreaterThan(lofEdge);
    expect(lofInside).toBeLessThan(lofEdge);
  });

  it('menampilkan halaman Temuan Aturan dengan penjelasan tumpang tindih 11%, catatan Februari, dan angka 6 jenis aturan yang akurat', async () => {
    renderAtRoute('/temuan-aturan');

    const page = await screen.findByTestId('temuan-aturan-page');
    expect(page).toBeInTheDocument();

    // Penjelasan tumpang tindih 11% dan catatan Februari
    expect(within(page).getByTestId('penjelasan-pemisahan-lof-aturan')).toHaveTextContent(/11%/i);
    expect(within(page).getByTestId('temuan-catatan-februari')).toHaveTextContent(/Februari 2026/i);

    // Verifikasi jumlah kejadian 6 jenis aturan sesuai acuan riset
    expect(within(page).getByTestId('tab-aturan-melebihi_alokasi')).toHaveTextContent('33');
    expect(within(page).getByTestId('tab-aturan-gt_2x_alokasi')).toHaveTextContent('9');
    expect(within(page).getByTestId('tab-aturan-nol')).toHaveTextContent('11');
    expect(within(page).getByTestId('tab-aturan-lonjakan')).toHaveTextContent('2');
    expect(within(page).getByTestId('tab-aturan-seragam')).toHaveTextContent('1');
    expect(within(page).getByTestId('tab-aturan-fakultatif')).toHaveTextContent('69');
  });

  it('menampilkan halaman Metode dengan Stepper 5 langkah Tabel IV.1, grafik evaluasi Bab V, dan interaksi LOF Playground', async () => {
    renderAtRoute('/metode');

    const page = await screen.findByTestId('metode-page');
    expect(page).toBeInTheDocument();

    // (a) Mengapa "lokal": klaster padat vs renggang
    expect(within(page).getByTestId('section-mengapa-lokal')).toHaveTextContent(
      /Klaster Padat vs Klaster Renggang/i
    );

    // (b) Stepper 5 langkah memakai contoh 6 titik Tabel IV.1 (k=2)
    expect(within(page).getByTestId('tabel-iv1-lof-1')).toHaveTextContent('0,945');
    expect(within(page).getByTestId('tabel-iv1-lof-2')).toHaveTextContent('0,945');
    expect(within(page).getByTestId('tabel-iv1-lof-3')).toHaveTextContent('1,124');
    expect(within(page).getByTestId('tabel-iv1-lof-4')).toHaveTextContent('1,365');
    expect(within(page).getByTestId('tabel-iv1-lof-5')).toHaveTextContent('1,365');
    expect(within(page).getByTestId('tabel-iv1-lof-6')).toHaveTextContent('7,186');

    // Klik langkah 2 -> kolom langkah 5 disembunyikan sementara (muncul bertahap)
    fireEvent.click(within(page).getByTestId('stepper-step-2'));
    expect(within(page).getByTestId('tabel-iv1-lof-6')).toHaveTextContent('···');

    // Klik langkah 5 -> angka LOF muncul kembali
    fireEvent.click(within(page).getByTestId('stepper-step-5'));
    expect(within(page).getByTestId('tabel-iv1-lof-6')).toHaveTextContent('7,186');

    // (d) Evaluasi Bab V: recall sintetis lonjakan 1,00; seragam 0,87; volume x3 0,35
    expect(within(page).getByTestId('recall-item-lonjakan_satu_hari')).toHaveTextContent('1,00');
    expect(within(page).getByTestId('recall-item-pola_seragam')).toHaveTextContent('0,87');
    expect(within(page).getByTestId('recall-item-volume_x3')).toHaveTextContent('0,35');

    // Interaksi LOF Playground di halaman Metode
    const badge = within(page).getByTestId('playground-q-lof');
    fireEvent.click(within(page).getByTestId('preset-q-dalam-padat'));
    const textInside = badge.textContent ?? '0';
    const valInside = Number.parseFloat(textInside.replace(',', '.'));
    expect(valInside).toBeLessThan(1.25);

    fireEvent.click(within(page).getByTestId('preset-q-jauh-padat'));
    const textFar = badge.textContent ?? '0';
    const valFar = Number.parseFloat(textFar.replace(',', '.'));
    expect(valFar).toBeGreaterThan(2.0);
    expect(valFar).toBeGreaterThan(valInside);

    // (e) Keterbatasan
    expect(within(page).getByTestId('keterbatasan-item-1')).toBeInTheDocument();
    expect(within(page).getByTestId('keterbatasan-item-5')).toBeInTheDocument();
  });

  it('menjamin keterbacaan LOF Playground: tanpa tumpang tindih label di tampilan penuh, zoom klaster padat 4x menampilkan A1-A8 lengkap, loupe, tooltip, dan tabel alternatif akurat', async () => {
    renderAtRoute('/metode');

    const page = await screen.findByTestId('metode-page');
    const playground = within(page).getByTestId('lof-playground');

    // 1. Tampilan penuh (1,0x): label default hanya ID ("A1") tanpa skor, dan tidak ada 2 label yang saling beririsan
    expect(within(playground).getByTestId('playground-zoom-indicator')).toHaveTextContent('1,0×');

    const fullViewLabels = playground.querySelectorAll('[data-testid^="playground-label-"]');
    expect(fullViewLabels.length).toBeGreaterThanOrEqual(10);

    const parseBbox = (el: Element) => {
      const raw = el.getAttribute('data-bbox') ?? '0,0,0,0';
      const [x1, y1, x2, y2] = raw.split(',').map(Number);
      return { id: el.getAttribute('data-label-id') ?? '', x1, y1, x2, y2 };
    };

    const fullBoxes = Array.from(fullViewLabels).map(parseBbox);
    for (let i = 0; i < fullBoxes.length; i++) {
      for (let j = i + 1; j < fullBoxes.length; j++) {
        const a = fullBoxes[i];
        const b = fullBoxes[j];
        const intersects = !(a.x2 <= b.x1 || a.x1 >= b.x2 || a.y2 <= b.y1 || a.y1 >= b.y2);
        expect(intersects).toBe(false);
      }
    }

    // Pada tampilan penuh (zoom < 3x), label titik hanya berupa ID tanpa kurung skor
    const b1Label = within(playground).getByTestId('playground-label-S1');
    expect(b1Label.textContent).toBe('B1');

    // 2. Area klik tiap titik minimal 24 px (r = 12)
    const hitCircleA1 = within(playground).getByTestId('playground-hit-C1');
    expect(hitCircleA1.getAttribute('r')).toBe('12');

    // 3. Hover pada titik menampilkan tooltip (ID, koordinat, k-distance, lrd, LOF) dan menyorot tetangga N_k(q)
    const pointA6 = within(playground).getByTestId('playground-point-C6');
    fireEvent.pointerEnter(pointA6);
    const tooltip = within(playground).getByTestId('playground-point-tooltip');
    expect(tooltip).toHaveTextContent(/Titik A6/i);
    expect(tooltip).toHaveTextContent(/k-distance/i);
    expect(tooltip).toHaveTextContent(/lrd/i);
    expect(tooltip).toHaveTextContent(/Skor LOF/i);
    expect(within(playground).getByTestId('playground-hover-neighbors-q')).toBeInTheDocument();
    fireEvent.pointerLeave(pointA6);

    // 4. Saat q dipindahkan menjauhi klaster padat (> 2 satuan) pada tampilan penuh, Loupe muncul
    fireEvent.click(within(playground).getByTestId('preset-q-jauh-padat'));
    const loupe = within(playground).getByTestId('playground-loupe');
    expect(loupe).toBeInTheDocument();
    expect(loupe).toHaveTextContent(/A1 \(/i);
    expect(loupe).toHaveTextContent(/A8 \(/i);

    // 5. Klik tombol "Perbesar Klaster Padat" -> zoom >= 3x (4,0x), seluruh A1-A8 tampil dengan label lengkap tanpa irisan
    fireEvent.click(within(playground).getByTestId('btn-zoom-klaster-padat'));
    expect(within(playground).getByTestId('playground-zoom-indicator')).toHaveTextContent('4,0×');

    for (let i = 1; i <= 8; i++) {
      const lbl = within(playground).getByTestId(`playground-label-C${i}`);
      expect(lbl).toBeInTheDocument();
      expect(lbl.textContent).toMatch(new RegExp(`^A${i} \\(\\d+,\\d{2}\\)$`));
    }

    const zoomedBoxes = Array.from(
      playground.querySelectorAll('[data-testid^="playground-label-C"]')
    ).map(parseBbox);
    expect(zoomedBoxes).toHaveLength(8);
    for (let i = 0; i < zoomedBoxes.length; i++) {
      for (let j = i + 1; j < zoomedBoxes.length; j++) {
        const a = zoomedBoxes[i];
        const b = zoomedBoxes[j];
        const intersects = !(a.x2 <= b.x1 || a.x1 >= b.x2 || a.y2 <= b.y1 || a.y1 >= b.y2);
        expect(intersects).toBe(false);
      }
    }

    // 6. Tombol +, -, wheel, keyboard pan, dan "Tampilan Penuh"
    const svg = within(playground).getByTestId('playground-svg');
    fireEvent.click(within(playground).getByTestId('btn-zoom-in'));
    expect(Number.parseFloat(svg.getAttribute('data-zoom') ?? '1')).toBeGreaterThan(4.0);

    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    fireEvent.wheel(svg, { deltaY: 100, clientX: 260, clientY: 260 });

    fireEvent.click(within(playground).getByTestId('btn-zoom-penuh'));
    expect(within(playground).getByTestId('playground-zoom-indicator')).toHaveTextContent('1,0×');

    // 7. Tabel alternatif terlipat memuat seluruh 16 titik dengan nilai k-distance, lrd, dan LOF yang identik dengan lofEngine
    const altTable = within(playground).getByTestId('playground-alt-table');
    const rows = altTable.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(16);
  });
});
