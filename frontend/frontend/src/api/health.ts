import { API_BASE } from './base';

export interface ServiceCheckDetail {
  status: 'ok' | 'error';
  message?: string;
  database?: string;
  service?: string;
  version?: string;
  engine?: string;
  data_ready?: boolean;
  latency_ms?: number;
}

export interface ApiHealthResponse {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  version: string;
  timestamp: string;
  db: ServiceCheckDetail;
  ml: ServiceCheckDetail;
}

const API_BASE_URL = API_BASE;

export async function fetchSystemHealth(): Promise<ApiHealthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/health`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  const data = (await response.json()) as ApiHealthResponse;
  return data;
}
