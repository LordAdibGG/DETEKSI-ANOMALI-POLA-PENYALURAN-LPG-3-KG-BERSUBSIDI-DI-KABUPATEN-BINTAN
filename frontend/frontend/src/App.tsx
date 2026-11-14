import { Suspense, lazy, type ComponentProps, type ComponentType, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Skeleton } from './components/ui/Skeleton';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './context/AuthContext';
import { FilterBulanProvider } from './context/FilterBulanContext';
import { ThemeProvider } from './context/ThemeContext';

const routePreloaders: Array<() => Promise<unknown>> = [];

/**
 * Pembungkus pemecahan bundel per rute (Fase 9):
 * - Saat build produksi Vite, setiap `import('./pages/...')` dipecah menjadi chunk terpisah.
 * - Setelah chunk pertama kali dimuat (atau dipramuat di lingkungan uji), komponen
 *   dirender langsung tanpa kedipan Suspense berulang.
 */
function buatKomponenRute<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>
): ComponentType<ComponentProps<T>> {
  let Terpecahkan: T | null = null;
  const LazyComp = lazy(async () => {
    const mod = await loader();
    Terpecahkan = mod.default;
    return mod;
  });

  routePreloaders.push(async () => {
    const mod = await loader();
    Terpecahkan = mod.default;
  });

  return function KomponenRuteTerpecah(props: ComponentProps<T>) {
    if (Terpecahkan) {
      return <Terpecahkan {...props} />;
    }
    return <LazyComp {...props} />;
  };
}

export async function preloadAllRoutes(): Promise<void> {
  await Promise.all(routePreloaders.map((fn) => fn()));
}

const DesignKitPage = buatKomponenRute(() =>
  import('./pages/DesignKitPage').then((m) => ({ default: m.DesignKitPage }))
);
const LoginPage = buatKomponenRute(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const MetodePage = buatKomponenRute(() =>
  import('./pages/MetodePage').then((m) => ({ default: m.MetodePage }))
);
const OperasionalPage = buatKomponenRute(() =>
  import('./pages/OperasionalPage').then((m) => ({ default: m.OperasionalPage }))
);
const PetaPanasPage = buatKomponenRute(() =>
  import('./pages/PetaPanasPage').then((m) => ({ default: m.PetaPanasPage }))
);
const PrioritasPage = buatKomponenRute(() =>
  import('./pages/PrioritasPage').then((m) => ({ default: m.PrioritasPage }))
);
const ProfilPangkalanPage = buatKomponenRute(() =>
  import('./pages/ProfilPangkalanPage').then((m) => ({ default: m.ProfilPangkalanPage }))
);
const RingkasanPage = buatKomponenRute(() =>
  import('./pages/RingkasanPage').then((m) => ({ default: m.RingkasanPage }))
);
const SystemStatusPage = buatKomponenRute(() =>
  import('./pages/SystemStatusPage').then((m) => ({ default: m.SystemStatusPage }))
);
const TemuanAturanPage = buatKomponenRute(() =>
  import('./pages/TemuanAturanPage').then((m) => ({ default: m.TemuanAturanPage }))
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

function HalamanMemuat() {
  return (
    <div className="py-6" data-testid="halaman-memuat">
      <Skeleton varian="blok" />
    </div>
  );
}

/** Cangkang + batas Suspense: header dan pita bulan tetap tampil saat chunk halaman diunduh. */
function Halaman({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<HalamanMemuat />}>{children}</Suspense>
    </AppShell>
  );
}

function TanpaCangkang({ children }: { children: ReactNode }) {
  return <Suspense fallback={<HalamanMemuat />}>{children}</Suspense>;
}

export function AppRoutes() {
  return (
    <FilterBulanProvider>
      <Routes>
        {/* Rute tersembunyi spesimen design system */}
        <Route
          path="/__kit"
          element={
            <TanpaCangkang>
              <DesignKitPage />
            </TanpaCangkang>
          }
        />

        {/* Halaman login tipografis */}
        <Route
          path="/masuk"
          element={
            <TanpaCangkang>
              <LoginPage />
            </TanpaCangkang>
          }
        />
        <Route
          path="/login"
          element={
            <TanpaCangkang>
              <LoginPage />
            </TanpaCangkang>
          }
        />

        {/* Pemeriksaan status layanan */}
        <Route
          path="/status-fondasi"
          element={
            <TanpaCangkang>
              <SystemStatusPage />
            </TanpaCangkang>
          }
        />

        {/* I. Ringkasan */}
        <Route
          path="/"
          element={
            <Halaman>
              <RingkasanPage />
            </Halaman>
          }
        />
        <Route
          path="/ringkasan"
          element={
            <Halaman>
              <RingkasanPage />
            </Halaman>
          }
        />

        {/* II. Daftar Prioritas */}
        <Route
          path="/prioritas"
          element={
            <Halaman>
              <PrioritasPage />
            </Halaman>
          }
        />

        {/* III. Peta Panas */}
        <Route
          path="/peta-panas"
          element={
            <Halaman>
              <PetaPanasPage />
            </Halaman>
          }
        />

        {/* Profil pangkalan */}
        <Route
          path="/pangkalan/:kode"
          element={
            <Halaman>
              <ProfilPangkalanPage />
            </Halaman>
          }
        />

        {/* IV. Temuan Aturan */}
        <Route
          path="/temuan-aturan"
          element={
            <Halaman>
              <TemuanAturanPage />
            </Halaman>
          }
        />

        {/* V. Metode, evaluasi, dan LOF Playground */}
        <Route
          path="/metode"
          element={
            <Halaman>
              <MetodePage />
            </Halaman>
          }
        />
        <Route
          path="/playground"
          element={
            <Halaman>
              <MetodePage />
            </Halaman>
          }
        />

        {/* VI. Operasional */}
        <Route
          path="/operasional"
          element={
            <Halaman>
              <OperasionalPage />
            </Halaman>
          }
        />
      </Routes>
    </FilterBulanProvider>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AppRoutes />
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
