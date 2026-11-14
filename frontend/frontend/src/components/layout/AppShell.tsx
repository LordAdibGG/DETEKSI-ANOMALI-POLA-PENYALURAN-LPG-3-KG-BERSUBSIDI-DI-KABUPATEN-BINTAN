import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { API_BASE } from '../../api/base';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { PageTransition } from '../motion/Primitives';
import { ErrorState } from '../ui/ErrorState';
import { PitaBulan } from './PitaBulan';

export interface NavItem {
  label: string;
  to: string;
  nomor: string;
}

export const NAV_ITEMS: NavItem[] = [
  { nomor: 'I', label: 'Ringkasan', to: '/ringkasan' },
  { nomor: 'II', label: 'Prioritas', to: '/prioritas' },
  { nomor: 'III', label: 'Peta Panas', to: '/peta-panas' },
  { nomor: 'IV', label: 'Temuan Aturan', to: '/temuan-aturan' },
  { nomor: 'V', label: 'Metode', to: '/metode' },
  { nomor: 'VI', label: 'Operasional', to: '/operasional' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const { user, token, loginDemo, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
  const prevPathname = useRef(location.pathname);
  const isTestEnv = import.meta.env.MODE === 'test';
  const [apiOffline, setApiOffline] = useState(false);

  const checkApiHealth = useCallback(async () => {
    if (isTestEnv) return;
    try {
      const res = await fetch(`${API_BASE}/api/health`, {
        headers: { Accept: 'application/json' },
      });
      if (res.status === 200 || res.status === 503) {
        setApiOffline(false);
      } else {
        setApiOffline(true);
      }
    } catch {
      setApiOffline(true);
    }
  }, [isTestEnv]);

  useEffect(() => {
    void checkApiHealth();
  }, [location.pathname, checkApiHealth]);

  // Pindahkan fokus ke isi halaman saat rute berganti (pembaca layar dan keyboard
  // tidak tertinggal di menu). Dilewati pada muat pertama agar tidak menggeser fokus awal.
  useEffect(() => {
    if (prevPathname.current === location.pathname) {
      return;
    }
    prevPathname.current = location.pathname;
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  if (!token && !isTestEnv) {
    return <Navigate to="/masuk" replace />;
  }

  const handleLogout = async () => {
    await logout();
    navigate('/masuk', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-paper)] text-[var(--text-ink)]">
      <a href="#konten" className="lompat-ke-konten" data-testid="lompat-ke-konten">
        Lompat ke isi halaman
      </a>
      {/* Baris Kolofon Atas */}
      <div className="border-b border-[var(--border-rule)] bg-[var(--surface-subtle)]/50 px-5 md:px-10 py-1.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2 font-tabular text-[11px] text-[var(--text-muted)]">
          <div className="flex items-center gap-2.5">
            {/* Hijau melon #86B817 khusus untuk penanda merek */}
            <span
              aria-hidden="true"
              className="inline-block w-2.5 h-2.5 bg-[#86B817] border border-[var(--border-strong)]"
            />
            <span className="uppercase tracking-[0.12em] font-medium text-[var(--text-ink)]">
              Lembar Pantau LPG 3 kg · Kab. Bintan
            </span>
            <span className="hidden sm:inline text-[var(--text-soft)]">|</span>
            <span className="hidden sm:inline">
              Indikasi awal pemeriksaan lapangan — bukan bukti pelanggaran
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Pengalih Peran Cepat untuk Evaluasi Petugas vs Admin */}
            <div className="flex items-center gap-1.5">
              <span>Peran:</span>
              <button
                type="button"
                onClick={() => loginDemo(user?.role === 'admin' ? 'petugas' : 'admin')}
                data-testid="role-switcher"
                className="uppercase font-semibold text-[var(--text-ink)] underline underline-offset-4 hover:text-[var(--accent-anomali-teks)] cursor-pointer"
                title="Klik untuk beralih tampilan antara Admin (nama pangkalan tampil) dan Petugas (hanya kode P01-P30)"
              >
                {user?.role === 'admin' ? 'Admin Setda' : 'Petugas Monev'}
              </button>
            </div>

            <span className="text-[var(--text-soft)]">·</span>

            {/* Pengalih Mode Terang / Gelap */}
            <button
              type="button"
              onClick={toggleTheme}
              data-testid="theme-toggle"
              aria-label={`Ubah ke mode ${theme === 'terang' ? 'gelap' : 'terang'}`}
              className="uppercase tracking-wider font-semibold text-[var(--text-ink)] hover:text-[var(--accent-anomali-teks)] cursor-pointer"
            >
              Mode: {theme === 'terang' ? 'Terang' : 'Gelap'}
            </button>

            <span className="text-[var(--text-soft)]">·</span>

            <Link
              to="/masuk"
              className="uppercase tracking-wider hover:text-[var(--text-ink)] underline underline-offset-4"
            >
              Lembar Masuk
            </Link>

            <span className="text-[var(--text-soft)]">·</span>

            <button
              type="button"
              onClick={handleLogout}
              data-testid="btn-logout"
              className="uppercase tracking-wider font-semibold text-[var(--accent-anomali-teks)] hover:underline underline-offset-4 cursor-pointer"
            >
              Keluar
            </button>
          </div>
        </div>
      </div>

      {/* Header Teks Utama (Tanpa Sidebar Ikon) */}
      <header className="border-b-2 border-[var(--border-strong)] px-5 md:px-10 py-4">
        <div className="max-w-[1440px] mx-auto flex flex-col lg:flex-row lg:items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-4">
            <Link to="/ringkasan" className="group inline-flex items-baseline gap-2.5">
              <span className="font-editorial text-2xl md:text-3xl font-bold tracking-tight text-[var(--text-ink)]">
                Lembar Pantau
              </span>
              <span className="font-tabular text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                KJP 2026 · LOF k=10
              </span>
            </Link>
          </div>

          {/* Navigasi Teks Editorial (Ringkasan, Prioritas, Peta Panas, Temuan Aturan, Metode) */}
          <nav aria-label="Navigasi utama buku besar" className="flex flex-wrap items-center gap-1 sm:gap-2">
            {NAV_ITEMS.map((item) => {
              const isHomeAlias =
                location.pathname === '/' && item.to === '/ringkasan';

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => {
                    const active = isActive || isHomeAlias;
                    return `px-3 py-1.5 text-sm transition-colors border-b-2 ${
                      active
                        ? 'border-[var(--accent-anomali)] text-[var(--text-ink)] font-semibold bg-[var(--surface-subtle)]/70'
                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:border-[var(--border-rule)]'
                    }`;
                  }}
                >
                  <span className="font-tabular text-[11px] text-[var(--text-soft)] mr-1.5">
                    {item.nomor}.
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Pita Bulan Jan-Okt (Filter Global yang Selalu Tampak) */}
      <PitaBulan />

      {/* Ruang Isi Halaman dengan PageTransition */}
      <main
        id="konten"
        ref={mainRef}
        tabIndex={-1}
        className="flex-1 w-full max-w-[1440px] mx-auto px-5 md:px-10 py-8 focus:outline-none focus-visible:shadow-none"
      >
        {apiOffline && (
          <div className="mb-6" data-testid="api-offline-banner">
            <ErrorState
              kode="GANGGUAN SAMBUNGAN API · LURING"
              judul="Server API Backend Tidak Dapat Dihubungi"
              pesan="Sambungan ke server API Laravel (127.0.0.1:8000) terputus atau belum dinyalakan. Halaman tetap menyajikan salinan data acuan terakhir agar pemeriksaan tidak berhenti pada layar putih."
              catatanKetahanan="Nyalakan kembali layanan backend lalu klik Muat Ulang Permintaan untuk menyambung ulang ke MySQL."
              labelCobaLagi="Muat Ulang Permintaan"
              onCobaLagi={() => void checkApiHealth()}
            />
          </div>
        )}
        <PageTransition pageKey={location.pathname}>{children}</PageTransition>
      </main>

      {/* Kaki Buku Besar */}
      <footer className="border-t border-[var(--border-rule)] px-5 md:px-10 py-4 mt-12 font-tabular text-xs text-[var(--text-muted)]">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span>Bagian Perekonomian Setda Kabupaten Bintan · Tim Monev LPG 3 kg</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span>30 Pangkalan (P01–P30) · 293 Pangkalan-Bulan · 28 Ditandai</span>
            <Link
              to="/__kit"
              className="underline underline-offset-4 hover:text-[var(--text-ink)]"
            >
              Spesimen Desain (/__kit)
            </Link>
            <Link
              to="/status-fondasi"
              className="underline underline-offset-4 hover:text-[var(--text-ink)]"
            >
              Status Layanan
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
