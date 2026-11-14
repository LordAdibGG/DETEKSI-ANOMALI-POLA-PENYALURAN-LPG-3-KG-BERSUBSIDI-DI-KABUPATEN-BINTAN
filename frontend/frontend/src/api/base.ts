/**
 * Alamat dasar API Laravel.
 * - Pengembangan (`npm run dev`): API di port 8000 (atau nilai VITE_API_BASE_URL).
 * - Produksi (hasil build disalin ke backend/public): satu origin, sehingga
 *   panggilan memakai jalur relatif `/api/...` dan tidak membutuhkan CORS.
 */
export const API_BASE: string = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000')
).replace(/\/$/, '');
