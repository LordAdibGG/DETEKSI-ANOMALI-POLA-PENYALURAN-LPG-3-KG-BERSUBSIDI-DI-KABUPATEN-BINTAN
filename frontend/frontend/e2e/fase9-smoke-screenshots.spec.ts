import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/screenshots');

test.describe('Fase 9 & Tahap 6: Uji Alur Ujung ke Ujung (E2E), Responsivitas, Aksesibilitas & Tangkapan Layar Laporan', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test('1. Alur E2E 7 langkah: (1) login & ganti bulan -> (2) Prioritas Berulang & P07 -> (3) Peta Panas P10 April -> (4) Metode stepper -> (5) Playground seret q -> (6) ekspor CSV -> (7) logout', async ({
    page,
  }) => {
    // =========================================================================
    // LANGKAH (1): Login, lihat Ringkasan, ganti bulan
    // =========================================================================
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/masuk');
    await expect(page.getByTestId('typographic-login-page')).toBeVisible();

    await page.getByRole('button', { name: /Isi Akun Admin/i }).click();
    await page.getByRole('button', { name: /Buka Buku Besar Pengawasan/i }).click();

    await expect(page.getByTestId('ringkasan-page')).toBeVisible();
    await expect(page.getByTestId('ringkasan-editorial-headline')).toContainText('28');
    await expect(page.getByTestId('lof-strip-plot')).toBeVisible();

    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-ringkasan-gambar-vi-1a.png'),
      fullPage: true,
    });

    // Ganti bulan ke Maret (03 Mar) -> pastikan kalimat & data berubah ke Maret 2026 (3 dari 28)
    await page.getByTestId('pita-bulan-3').click();
    await expect(page.getByTestId('ringkasan-editorial-headline')).toContainText('Maret 2026');
    await page.waitForTimeout(250);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01b-ringkasan-maret.png'),
      fullPage: true,
    });

    // Kembalikan Pita Bulan ke JAN-OKT
    await page.getByTestId('pita-bulan-semua').click();
    await expect(page.getByTestId('ringkasan-editorial-headline')).toContainText('282');

    const mainNav = page.getByRole('navigation', { name: /Navigasi utama/i });

    // =========================================================================
    // LANGKAH (2): Prioritas, filter Berulang, buka P07
    // =========================================================================
    await mainNav.getByRole('link', { name: /Prioritas/i }).click();
    await expect(page.getByTestId('prioritas-page')).toBeVisible();
    await expect(page.getByTestId('tabel-prioritas')).toBeVisible();
    await expect(page.getByTestId('prioritas-row-P10')).toBeVisible();

    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02-prioritas-gambar-vi-1b.png'),
      fullPage: true,
    });

    // Filter kategori Berulang -> 3 baris (P07, P08, P09)
    await page.getByTestId('chip-kategori-Berulang').click();
    await expect(page.locator('[data-testid^="prioritas-row-"]')).toHaveCount(3);
    await expect(page.getByTestId('prioritas-row-P07')).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02b-prioritas-filter-berulang.png'),
      fullPage: true,
    });

    // Buka profil P07
    await page.getByTestId('prioritas-row-P07').click();
    await expect(page.getByTestId('profil-pangkalan-page')).toBeVisible();
    await expect(page.getByTestId('profil-pangkalan-page')).toContainText('P07');
    await expect(page.getByTestId('profil-blok-1-harian')).toBeVisible();
    await expect(page.getByTestId('profil-blok-2-lof-10-bulan')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02c-profil-p07.png'),
      fullPage: true,
    });

    // =========================================================================
    // LANGKAH (3): Peta Panas, klik sel P10 April
    // =========================================================================
    await mainNav.getByRole('link', { name: /Peta Panas/i }).click();
    await expect(page.getByTestId('peta-panas-page')).toBeVisible();
    await expect(page.getByTestId('heatmap-svg')).toBeVisible();
    await expect(page.getByTestId('heatmap-sr-table')).toBeAttached();

    // Hover pada sel P10 April (bulan 4) untuk menampilkan garis silang & 4 z-score
    const cellP10Apr = page.getByTestId('heatmap-cell-P10-4');
    await cellP10Apr.hover();
    await expect(page.getByTestId('heatmap-crosshair')).toBeVisible();

    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '04-peta-panas-gambar-vi-1d.png'),
      fullPage: true,
    });

    // Klik sel P10 April -> membuka Profil Pangkalan P10 (/pangkalan/P10)
    await cellP10Apr.click();
    await expect(page.getByTestId('profil-pangkalan-page')).toBeVisible();
    await expect(page.getByTestId('profil-pangkalan-page')).toContainText('P10');
    await expect(page.getByTestId('profil-blok-1-harian')).toBeVisible();
    await expect(page.getByTestId('profil-blok-2-lof-10-bulan')).toBeVisible();
    await expect(page.getByTestId('profil-blok-3-lollipop-z')).toBeVisible();
    await expect(page.getByTestId('profil-blok-4-alokasi')).toBeVisible();

    // Kembalikan Pita Bulan ke JAN-OKT untuk tangkapan layar profil penuh
    await page.getByTestId('pita-bulan-semua').click();
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03-profil-p10-gambar-vi-1c.png'),
      fullPage: true,
    });

    // =========================================================================
    // LANGKAH (4): Metode, gerakkan stepper 5 langkah
    // =========================================================================
    await page.setViewportSize({ width: 1366, height: 768 });
    await mainNav.getByRole('link', { name: /Metode/i }).click();
    await expect(page.getByTestId('metode-page')).toBeVisible();

    for (let s = 1; s <= 5; s++) {
      await page.getByTestId(`stepper-step-${s}`).click();
    }
    await expect(page.getByTestId('metode-page')).toContainText('7,186');
    await page.waitForTimeout(200);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '04b-metode-stepper-langkah5.png'),
    });

    // =========================================================================
    // LANGKAH (5): Playground, seret q ke luar klaster dan pastikan skor naik
    // =========================================================================
    const playground = page.getByTestId('lof-playground');
    await expect(playground).toBeVisible();
    await playground.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -64));

    // Tempatkan q di dalam klaster padat terlebih dahulu -> catat skor LOF awal (< 1,5)
    await page.getByTestId('preset-q-dalam-padat').click();
    await page.waitForTimeout(200);
    const lofBefore = Number.parseFloat(
      (await page.getByTestId('playground-q-lof').innerText()).replace(',', '.')
    );
    expect(lofBefore).toBeLessThan(1.5);

    // Seret titik q keluar klaster padat menggunakan pointer/mouse drag pada kanvas SVG
    const pointQ = page.getByTestId('playground-point-Q');
    const qBox = await pointQ.boundingBox();
    expect(qBox).not.toBeNull();
    if (qBox) {
      const startX = qBox.x + qBox.width / 2;
      const startY = qBox.y + qBox.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 95, startY + 30, { steps: 8 });
      await page.mouse.up();
    }
    await page.waitForTimeout(250);
    const lofAfterDrag = Number.parseFloat(
      (await page.getByTestId('playground-q-lof').innerText()).replace(',', '.')
    );
    expect(lofAfterDrag).toBeGreaterThan(lofBefore);
    expect(lofAfterDrag).toBeGreaterThan(1.5);

    // Klik preset 3 (Pencilan Jauh dari Padat 4,4 ; 1,8) untuk tangkapan layar standar Lampiran
    await page.getByTestId('preset-q-jauh-padat').click();
    await expect(page.getByTestId('playground-loupe')).toBeVisible();
    await page.waitForTimeout(300);

    // Uji otomatis di 1366x768: pastikan tidak ada dua label pada plot utama yang saling menimpa
    const overlapCountFull = await page.evaluate(() => {
      const labels = Array.from(
        document.querySelectorAll('[data-testid="playground-labels-layer"] [data-testid^="playground-label-"]')
      );
      const rects = labels.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute('data-label-id') ?? '',
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
        };
      });
      let overlaps = 0;
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          const intersects = !(
            a.right <= b.left + 0.5 ||
            a.left >= b.right - 0.5 ||
            a.bottom <= b.top + 0.5 ||
            a.top >= b.bottom - 0.5
          );
          if (intersects) overlaps++;
        }
      }
      return overlaps;
    });
    expect(overlapCountFull).toBe(0);

    // Tangkap layar Sesudah (Tampilan Penuh + Loupe)
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="lof-playground"]');
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 68);
    });
    await page.waitForTimeout(150);
    await playground.screenshot({
      path: path.join(SCREENSHOT_DIR, '05-lof-playground-lampiran.png'),
    });
    await playground.screenshot({
      path: path.join(SCREENSHOT_DIR, '05b-lof-playground-sesudah-penuh.png'),
    });

    // Klik "Perbesar Klaster Padat" (Zoom 4,0x) -> pastikan seluruh A1-A8 tampil dengan label lengkap tanpa tumpang tindih
    await page.getByTestId('btn-zoom-klaster-padat').click();
    await page.waitForTimeout(550);
    await expect(page.getByTestId('playground-zoom-indicator')).toContainText('4,0×');

    const overlapCountZoom = await page.evaluate(() => {
      const labels = Array.from(
        document.querySelectorAll('[data-testid="playground-labels-layer"] [data-testid^="playground-label-C"]')
      );
      if (labels.length !== 8) return 999;
      const rects = labels.map((el) => el.getBoundingClientRect());
      let overlaps = 0;
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          const intersects = !(
            a.right <= b.left + 0.5 ||
            a.left >= b.right - 0.5 ||
            a.bottom <= b.top + 0.5 ||
            a.top >= b.bottom - 0.5
          );
          if (intersects) overlaps++;
        }
      }
      return overlaps;
    });
    expect(overlapCountZoom).toBe(0);

    // Tangkap layar Sesudah (Zoom 4x Klaster Padat)
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="lof-playground"]');
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 68);
    });
    await page.waitForTimeout(150);
    await playground.screenshot({
      path: path.join(SCREENSHOT_DIR, '05c-lof-playground-sesudah-zoom4x.png'),
    });

    // =========================================================================
    // LANGKAH (6): Ekspor CSV dari halaman Prioritas
    // =========================================================================
    await mainNav.getByRole('link', { name: /Prioritas/i }).click();
    await expect(page.getByTestId('prioritas-page')).toBeVisible();
    await page.getByTestId('chip-kategori-Semua').click();
    await expect(page.locator('[data-testid^="prioritas-row-"]')).toHaveCount(30);

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('btn-export-csv-prioritas').click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    if (downloadPath) {
      const csvContent = fs.readFileSync(downloadPath, 'utf-8');
      expect(csvContent.charCodeAt(0)).toBe(0xfeff);
      const lines = csvContent.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
      expect(lines.length).toBe(31);
    }
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '06-ekspor-csv-prioritas.png'),
    });

    // =========================================================================
    // LANGKAH (7): Logout dan kembali ke halaman masuk
    // =========================================================================
    await page.getByTestId('btn-logout').click();
    await expect(page.getByTestId('typographic-login-page')).toBeVisible();
    const tokenAfterLogout = await page.evaluate(() =>
      window.localStorage.getItem('lembar_pantau_token')
    );
    expect(tokenAfterLogout).toBeNull();
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '07-logout-kembali-masuk.png'),
    });
  });

  test('2. Uji responsif (1366x768, 1920x1080 proyektor, 768x1024 tablet) & prefers-reduced-motion + navigasi keyboard', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/masuk');
    await page.getByRole('button', { name: /Isi Akun Petugas/i }).click();
    await page.getByRole('button', { name: /Buka Buku Besar Pengawasan/i }).click();
    await expect(page.getByTestId('ringkasan-page')).toBeVisible();

    const viewports = [
      { label: 'laptop-1366x768', width: 1366, height: 768 },
      { label: 'proyektor-1920x1080', width: 1920, height: 1080 },
      { label: 'tablet-768x1024', width: 768, height: 1024 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/ringkasan');
      await expect(page.getByTestId('ringkasan-page')).toBeVisible();
      await expect(page.getByTestId('pita-bulan-global')).toBeVisible();
    }

    // Uji navigasi keyboard (Tab ke skip-link & sel Peta Panas)
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/peta-panas');
    await page.keyboard.press('Tab');
    const skipLink = page.getByTestId('lompat-ke-konten');
    await expect(skipLink).toBeFocused();

    // Uji navigasi panah pada sel Peta Panas
    const firstCell = page.getByTestId('heatmap-cell-P10-1');
    await firstCell.focus();
    await expect(firstCell).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('heatmap-cell-P10-2')).toBeFocused();

    // Uji Mode Gelap pada V. Metode: pastikan judul & teks kontras terang (#F3EFE4) di atas latar gelap (#0F1814)
    await page.goto('/metode');
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    const headingMetode = page.getByRole('heading', {
      name: /Mengapa Kepadatan Lokal Dipilih untuk Memprioritaskan Pengawasan Pangkalan LPG 3 kg/i,
    });
    await expect(headingMetode).toHaveCSS('color', 'rgb(243, 239, 228)');
  });
});
