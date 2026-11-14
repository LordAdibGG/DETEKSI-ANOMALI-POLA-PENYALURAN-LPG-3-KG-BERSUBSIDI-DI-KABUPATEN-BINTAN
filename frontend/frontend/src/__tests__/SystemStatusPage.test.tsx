import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemStatusPage } from '../pages/SystemStatusPage';
import * as healthApi from '../api/health';

function renderWithQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemStatusPage />
    </QueryClientProvider>
  );
}

describe('SystemStatusPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('menampilkan skeleton saat memuat lalu menampilkan 3 status hijau ketika semua layanan sehat', async () => {
    vi.spyOn(healthApi, 'fetchSystemHealth').mockResolvedValue({
      status: 'ok',
      service: 'lembar-pantau-api',
      version: '0.1.0',
      timestamp: '2026-11-13T10:00:00Z',
      db: {
        status: 'ok',
        database: 'lpg_lof',
        message: 'Koneksi MySQL aktif.',
      },
      ml: {
        status: 'ok',
        service: 'lembar-pantau-ml',
        version: '0.1.0',
        engine: 'scikit-learn LOF (k=10, threshold=1.5)',
        data_ready: true,
      },
    });

    renderWithQueryClient();

    expect(screen.getByTestId('health-skeleton')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('health-results')).toBeInTheDocument();
    });

    expect(screen.getByTestId('status-card-frontend')).toHaveAttribute('data-healthy', 'true');
    expect(screen.getByTestId('status-card-api')).toHaveAttribute('data-healthy', 'true');
    expect(screen.getByTestId('status-card-ml')).toHaveAttribute('data-healthy', 'true');
  });

  it('menampilkan status Layanan LOF merah tanpa crash ketika layanan Python mati', async () => {
    vi.spyOn(healthApi, 'fetchSystemHealth').mockResolvedValue({
      status: 'degraded',
      service: 'lembar-pantau-api',
      version: '0.1.0',
      timestamp: '2026-11-13T10:00:00Z',
      db: {
        status: 'ok',
        database: 'lpg_lof',
        message: 'Koneksi MySQL aktif.',
      },
      ml: {
        status: 'error',
        message: 'Layanan LOF tidak dapat dihubungi.',
      },
    });

    renderWithQueryClient();

    await waitFor(() => {
      expect(screen.getByTestId('health-results')).toBeInTheDocument();
    });

    expect(screen.getByTestId('status-card-frontend')).toHaveAttribute('data-healthy', 'true');
    expect(screen.getByTestId('status-card-api')).toHaveAttribute('data-healthy', 'true');
    expect(screen.getByTestId('status-card-ml')).toHaveAttribute('data-healthy', 'false');
    expect(screen.getByTestId('badge-ml')).toHaveTextContent('TERPUTUS (MERAH)');
  });
});
