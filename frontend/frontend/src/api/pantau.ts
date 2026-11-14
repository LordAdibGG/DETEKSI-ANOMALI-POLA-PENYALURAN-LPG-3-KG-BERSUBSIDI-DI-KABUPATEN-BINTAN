import snapshotRaw from './baselineSnapshot.json';
import profilSnapshotRaw from './baselineProfilSnapshot.json';
import { API_BASE as API_BASE_URL } from './base';
import type { UserRole } from '../context/AuthContext';
import {
  applyClientOperasionalRun,
  generateContohBulanFiktifCsv,
  getRuntimeAuditLogs,
  getRuntimeDaftarTindakLanjut,
  getRuntimePrioritasOverride,
  getRuntimeRuns,
  getRuntimeTindakLanjutHistory,
  getRuntimeTindakLanjutStatus,
  recordRuntimeAuditLog,
  resetOperasionalRuntime,
  saveRuntimeTindakLanjut,
  STATUS_TINDAK_LANJUT_LABELS,
  validasiLaporanBulananClient,
  type AnalysisRunSummaryItem,
  type AuditLogItem,
  type PerbandinganBaselineData,
  type TindakLanjutPangkalanRow,
  type TindakLanjutStatus,
  type ValidasiUnggahResponse,
} from '../lib/operasionalRuntime';

export {
  applyClientOperasionalRun,
  generateContohBulanFiktifCsv,
  getRuntimeAuditLogs,
  getRuntimeDaftarTindakLanjut,
  getRuntimeRuns,
  getRuntimeTindakLanjutHistory,
  getRuntimeTindakLanjutStatus,
  resetOperasionalRuntime,
  saveRuntimeTindakLanjut,
  STATUS_TINDAK_LANJUT_LABELS,
  validasiLaporanBulananClient,
  type AnalysisRunSummaryItem,
  type AuditLogItem,
  type PerbandinganBaselineData,
  type TindakLanjutPangkalanRow,
  type TindakLanjutStatus,
  type ValidasiUnggahResponse,
};

export interface TitikSebaranLof {
  kode: string;
  bulan: number;
  label_bulan: string;
  lof: number;
  flag: boolean;
}

export interface SebaranLofData {
  min: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  maks: number | null;
  max: number | null;
  rerata: number | null;
  threshold: number;
  titik: TitikSebaranLof[];
}

export interface DitandaiPerBulanItem {
  bulan: number;
  label_bulan: string;
  observasi: number;
  dinilai: number;
  nol: number;
  ditandai: number;
  total_normal: number;
  fakultatif: number;
  grand_total: number;
  alokasi: number;
}

export interface RingkasanData {
  bulan: number | null;
  label_bulan: string;
  jumlah_pangkalan: number;
  jumlah_observasi: number;
  jumlah_dinilai: number;
  jumlah_tidak_dinilai: number;
  jumlah_ditandai: number;
  per_kategori: {
    Normal: number;
    Sporadis: number;
    Berulang: number;
    'Konsisten tinggi': number;
    'Data kurang': number;
    'Tidak dinilai': number;
  };
  sebaran_lof: SebaranLofData;
  ditandai_per_bulan: DitandaiPerBulanItem[];
  flag_aturan: {
    melebihi_alokasi: number;
    gt_2x_alokasi: number;
    nol: number;
    lonjakan: number;
    seragam: number;
    fakultatif: number;
  };
}

export interface StripBulanItem {
  bulan: number;
  label: string;
  status: 'ditandai' | 'tidak' | 'nol' | 'tidak_ada';
  lof: number | null;
  flag: boolean;
  nol: boolean;
}

export interface FlagAturanPangkalan {
  total: number;
  jenis_aktif: string[];
  per_jenis: {
    melebihi_alokasi: number;
    gt_2x_alokasi: number;
    nol: number;
    lonjakan: number;
    seragam: number;
    fakultatif: number;
  };
}

export interface AlasanDetail {
  kalimat: string;
  fitur: string | null;
  z: number | null;
  bulan: number | null;
  label_bulan: string | null;
}

export interface PrioritasItem {
  kode: string;
  nama?: string;
  id_registrasi?: string;
  kecamatan: string | null;
  kelurahan: string | null;
  non_reguler: boolean;
  kategori: string;
  kategori_label: string;
  bulan_valid: number;
  bulan_flag: number;
  proporsi_flag: number | null;
  rerata_lof: number | null;
  maks_lof: number | null;
  bulan_maks: string | null;
  run_terpanjang: number;
  lof_bulan_dipilih: number | null;
  flag_bulan_dipilih: boolean | null;
  strip_10_bulan: StripBulanItem[];
  flag_aturan: FlagAturanPangkalan;
  alasan: string;
  alasan_detail: AlasanDetail;
  tindak_lanjut_status: string;
}

export interface PrioritasQueryParams {
  bulan?: number | null;
  kategori?: string | null;
  q?: string;
  sort?: string;
  role?: UserRole;
  token?: string | null;
}

export interface HeatmapZScore {
  log_total: number | null;
  cv_harian: number | null;
  rasio_hari_aktif: number | null;
  porsi_nilai_dominan: number | null;
}

export interface HeatmapCell {
  bulan: number;
  label: string;
  lof: number | null;
  flag: boolean;
  nol: boolean;
  ada_laporan: boolean;
  grand_total: number | null;
  alokasi: number | null;
  z_score?: HeatmapZScore | null;
}

export interface HeatmapRow {
  kode: string;
  nama?: string;
  kecamatan: string | null;
  non_reguler: boolean;
  kategori: string;
  kategori_label: string;
  urutan_kategori?: number;
  bulan_valid: number;
  bulan_flag: number;
  maks_lof: number | null;
  run_terpanjang: number;
  sel: HeatmapCell[];
}

export interface VolumeHarianItem {
  hari: number;
  tanggal: string;
  is_minggu: boolean;
  volume: number;
}

export interface FiturProfilItem {
  nilai: number | null;
  z_score: number | null;
  median_pangkalan_lain: number | null;
}

export interface LaporanBulananProfil {
  bulan: number;
  label_bulan: string;
  nama_bulan: string;
  ada_laporan: boolean;
  lof: number | null;
  flag: boolean;
  nol: boolean;
  alasan: string;
  alasan_detail?: AlasanDetail;
  alokasi_vs_realisasi: {
    alokasi: number;
    total_normal: number;
    fakultatif: number;
    grand_total: number;
    sisa_alokasi: number;
    hari_aktif: number;
    n_hari_kerja: number;
    rasio_utilisasi: number | null;
    alokasi_tidak_reliabel: boolean;
  } | null;
  fitur: {
    log_total: FiturProfilItem;
    cv_harian: FiturProfilItem;
    rasio_hari_aktif: FiturProfilItem;
    porsi_nilai_dominan: FiturProfilItem;
  } | null;
  median_pangkalan_lain: {
    log_total: number | null;
    cv_harian: number | null;
    rasio_hari_aktif: number | null;
    porsi_nilai_dominan: number | null;
  };
  flag_aturan: Array<{ jenis: string; label: string }>;
  volume_harian: VolumeHarianItem[];
}

export interface ProfilPangkalanData {
  kode: string;
  nama?: string;
  id_registrasi?: string;
  agen: string;
  kecamatan: string | null;
  kelurahan: string | null;
  sumber_kecamatan: string | null;
  non_reguler: boolean;
  klasifikasi: {
    kategori: string;
    kategori_label: string;
    bulan_valid: number;
    bulan_flag: number;
    proporsi_flag: number | null;
    rerata_lof: number | null;
    maks_lof: number | null;
    bulan_maks: string | null;
    bulan_yang_ditandai: string | null;
    run_terpanjang: number;
  };
  alasan_utama: AlasanDetail;
  flag_aturan_ringkasan: Record<string, number>;
  laporan_bulanan: LaporanBulananProfil[];
  tindak_lanjut: Array<{
    id: number;
    status: string;
    catatan: string | null;
    oleh: string | null;
    updated_at: string | null;
  }>;
}

export interface TemuanAturanItem {
  id: number;
  jenis: string;
  label_jenis: string;
  bulan: number;
  label_bulan: string;
  kode: string;
  nama?: string;
  kecamatan: string | null;
  kategori: string;
  alokasi: number;
  total_normal: number;
  fakultatif: number;
  grand_total: number;
  sisa_alokasi: number;
  hari_aktif: number;
  lof: number | null;
  flag_lof: boolean;
  penjelasan: string;
}

export interface TemuanAturanData {
  items: TemuanAturanItem[];
  ringkasan: {
    melebihi_alokasi: number;
    gt_2x_alokasi: number;
    nol: number;
    lonjakan: number;
    seragam: number;
    fakultatif: number;
  };
}

export interface EvaluasiLofRow {
  uji: string;
  ukuran: string;
  nilai: number;
}

export interface MetodeData {
  parameter: {
    run_nama: string;
    algoritma: string;
    k: number;
    threshold: number;
    metrik_jarak: string;
    normalisasi: string;
    hari_minggu_dikecualikan: boolean;
    minimal_bulan_valid_klasifikasi: number;
    fitur: Array<{
      kode: string;
      nama: string;
      rumus: string;
      tujuan: string;
    }>;
  };
  aturan_klasifikasi: Array<{
    kategori: string;
    kriteria: string;
    jumlah_pangkalan: number;
  }>;
  definisi_flag_aturan: Array<{
    jenis: string;
    kriteria: string;
    jumlah_kejadian: number;
  }>;
  keterbatasan: string[];
  evaluasi_lof: EvaluasiLofRow[];
}

interface SnapshotStructure {
  ringkasan: Record<string, RingkasanData>;
  prioritas: Record<string, PrioritasItem[]>;
  heatmap: HeatmapRow[];
  profil: Record<string, ProfilPangkalanData>;
  temuan_aturan: TemuanAturanData;
  metode: MetodeData;
}

function hydrateSnapshot(): SnapshotStructure {
  const rawMain = snapshotRaw as unknown as Omit<SnapshotStructure, 'profil'>;
  const rawProfil = profilSnapshotRaw as unknown as Record<string, ProfilPangkalanData>;

  const baseAllMap = new Map<string, PrioritasItem>(
    (rawMain.prioritas.all ?? []).map((item) => [item.kode, item])
  );
  const hydratedPrioritas: Record<string, PrioritasItem[]> = {
    all: rawMain.prioritas.all ?? [],
  };
  for (let m = 1; m <= 10; m++) {
    const key = String(m);
    const list = (rawMain.prioritas[key] ?? []) as Array<Partial<PrioritasItem> & { kode: string }>;
    hydratedPrioritas[key] = list.map((partial) => {
      const base = baseAllMap.get(partial.kode);
      return {
        ...(base ?? ({} as PrioritasItem)),
        ...partial,
      };
    });
  }

  const hydratedProfil: Record<string, ProfilPangkalanData> = {};
  for (const [kode, prof] of Object.entries(rawProfil)) {
    hydratedProfil[kode] = {
      ...prof,
      laporan_bulanan: (prof.laporan_bulanan ?? []).map((lb) => {
        const m = lb.bulan;
        const mm = String(m).padStart(2, '0');
        const rawVh = lb.volume_harian as unknown as Array<number | VolumeHarianItem>;
        const vh: VolumeHarianItem[] = rawVh.map((entry, idx) => {
          if (typeof entry === 'number') {
            const hari = idx + 1;
            const dd = String(hari).padStart(2, '0');
            const dt = new Date(Date.UTC(2026, m - 1, hari));
            return {
              hari,
              tanggal: `2026-${mm}-${dd}`,
              is_minggu: dt.getUTCDay() === 0,
              volume: entry,
            };
          }
          return entry;
        });
        return {
          ...lb,
          volume_harian: vh,
        };
      }),
    };
  }

  return {
    ringkasan: rawMain.ringkasan,
    prioritas: hydratedPrioritas,
    heatmap: rawMain.heatmap,
    profil: hydratedProfil,
    temuan_aturan: rawMain.temuan_aturan,
    metode: rawMain.metode,
  };
}

const snapshot = hydrateSnapshot();

// Dev: API Laravel di port 8000. Produksi (build disalin ke backend/public): satu origin, tanpa CORS.
const API_BASE = API_BASE_URL;

let cachedSanctumTokens: Partial<Record<UserRole, string>> = {};

async function resolveBearerToken(role: UserRole, existingToken?: string | null): Promise<string | null> {
  if (existingToken && !existingToken.startsWith('demo-token-')) {
    return existingToken;
  }
  if (import.meta.env.MODE === 'test') {
    return null;
  }
  try {
    const stored =
      typeof window !== 'undefined' ? window.localStorage.getItem('lembar_pantau_token') : null;
    if (stored && !stored.startsWith('demo-token-')) {
      return stored;
    }
  } catch {
    // Abaikan kendala localStorage
  }
  if (cachedSanctumTokens[role]) {
    return cachedSanctumTokens[role]!;
  }

  const credentials =
    role === 'admin'
      ? { email: 'admin@bintankab.go.id', password: 'admin123' }
      : { email: 'petugas@bintankab.go.id', password: 'petugas123' };

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(credentials),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const realToken = json?.data?.token;
    if (typeof realToken === 'string' && realToken.length > 0) {
      cachedSanctumTokens[role] = realToken;
      return realToken;
    }
    return null;
  } catch {
    return null;
  }
}

export function getSnapshotRingkasan(bulan?: number | null): RingkasanData {
  const key = bulan && bulan >= 1 && bulan <= 10 ? String(bulan) : 'all';
  return snapshot.ringkasan[key] ?? snapshot.ringkasan.all;
}

export function getSnapshotPrioritas(params: PrioritasQueryParams): PrioritasItem[] {
  const {
    bulan = null,
    kategori = null,
    q = '',
    sort = 'prioritas',
    role = 'petugas',
  } = params;

  const isAdmin = role === 'admin';
  const runtimeOverride = getRuntimePrioritasOverride();
  const key = bulan && bulan >= 1 && bulan <= 10 ? String(bulan) : 'all';
  const baseList = runtimeOverride ?? snapshot.prioritas[key] ?? snapshot.prioritas.all;

  // Masking nama & id_registrasi sesuai role + sinkronisasi status tindak lanjut runtime
  let items: PrioritasItem[] = baseList.map((item) => {
    const tlStatus = getRuntimeTindakLanjutStatus(item.kode);
    const cellMonth =
      bulan !== null ? item.strip_10_bulan.find((c) => c.bulan === bulan) : undefined;
    const withRuntime: PrioritasItem = {
      ...item,
      tindak_lanjut_status:
        tlStatus !== 'belum_diperiksa' ? tlStatus : item.tindak_lanjut_status,
      ...(runtimeOverride && bulan !== null
        ? {
            lof_bulan_dipilih: cellMonth?.lof ?? null,
            flag_bulan_dipilih: cellMonth ? cellMonth.flag : null,
          }
        : {}),
    };
    if (isAdmin) {
      return withRuntime;
    }
    const clone = { ...withRuntime };
    delete clone.nama;
    delete clone.id_registrasi;
    return clone;
  });

  if (kategori && kategori.toLowerCase() !== 'semua') {
    const target = kategori.toLowerCase();
    items = items.filter((item) => item.kategori.toLowerCase() === target);
  }

  const query = q.trim().toLowerCase();
  if (query.length > 0) {
    items = items.filter((item) => {
      if (item.kode.toLowerCase().includes(query)) return true;
      if (item.kecamatan && item.kecamatan.toLowerCase().includes(query)) return true;
      if (item.kategori.toLowerCase().includes(query)) return true;
      if (isAdmin) {
        if (item.nama && item.nama.toLowerCase().includes(query)) return true;
        if (item.id_registrasi && item.id_registrasi.toLowerCase().includes(query)) return true;
      }
      return false;
    });
  }

  items.sort((a, b) => {
    switch (sort) {
      case 'maks_lof':
      case 'maks_lof_desc':
        return (b.maks_lof ?? -1) - (a.maks_lof ?? -1) || a.kode.localeCompare(b.kode);
      case 'maks_lof_asc':
        return (a.maks_lof ?? 999) - (b.maks_lof ?? 999) || a.kode.localeCompare(b.kode);
      case 'bulan_flag':
      case 'bulan_flag_desc':
        return (
          b.bulan_flag - a.bulan_flag ||
          (b.maks_lof ?? -1) - (a.maks_lof ?? -1) ||
          a.kode.localeCompare(b.kode)
        );
      case 'kode':
      case 'kode_asc':
        return a.kode.localeCompare(b.kode);
      case 'kode_desc':
        return b.kode.localeCompare(a.kode);
      case 'lof_bulan_desc':
        return (
          (b.lof_bulan_dipilih ?? -1) - (a.lof_bulan_dipilih ?? -1) ||
          a.kode.localeCompare(b.kode)
        );
      default:
        if (bulan !== null) {
          const flagDiff = Number(Boolean(b.flag_bulan_dipilih)) - Number(Boolean(a.flag_bulan_dipilih));
          if (flagDiff !== 0) return flagDiff;
          const lofDiff = (b.lof_bulan_dipilih ?? -1) - (a.lof_bulan_dipilih ?? -1);
          if (lofDiff !== 0) return lofDiff;
          return a.kode.localeCompare(b.kode);
        }
        return a.kode.localeCompare(b.kode);
    }
  });

  return items;
}

export async function fetchRingkasan(
  bulan?: number | null,
  role: UserRole = 'petugas',
  token?: string | null
): Promise<RingkasanData> {
  try {
    const bearer = await resolveBearerToken(role, token);
    if (bearer) {
      const url = new URL(`${API_BASE}/api/ringkasan`, window.location.origin);
      if (bulan && bulan >= 1 && bulan <= 10) {
        url.searchParams.set('bulan', String(bulan));
      }
      const res = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          return json.data as RingkasanData;
        }
      }
    }
  } catch {
    // Gunakan snapshot acuan bila layanan API sedang tidak berjalan
  }

  return getSnapshotRingkasan(bulan);
}

export async function fetchPrioritas(params: PrioritasQueryParams): Promise<PrioritasItem[]> {
  const { bulan = null, kategori = null, q = '', sort = 'prioritas', role = 'petugas', token } = params;

  try {
    const bearer = await resolveBearerToken(role, token);
    if (bearer) {
      const url = new URL(`${API_BASE}/api/prioritas`, window.location.origin);
      if (bulan && bulan >= 1 && bulan <= 10) {
        url.searchParams.set('bulan', String(bulan));
      }
      if (kategori && kategori.toLowerCase() !== 'semua') {
        url.searchParams.set('kategori', kategori);
      }
      if (q.trim().length > 0) {
        url.searchParams.set('q', q.trim());
      }
      if (sort) {
        url.searchParams.set('sort', sort);
      }

      const res = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data)) {
          return json.data as PrioritasItem[];
        }
      }
    }
  } catch {
    // Gunakan snapshot acuan bila layanan API sedang tidak berjalan
  }

  return getSnapshotPrioritas(params);
}

export function getSnapshotHeatmap(role: UserRole = 'petugas'): HeatmapRow[] {
  const isAdmin = role === 'admin';
  return (snapshot.heatmap ?? []).map((row) => {
    if (isAdmin) return { ...row };
    const clone = { ...row };
    delete clone.nama;
    return clone;
  });
}

export async function fetchHeatmap(
  role: UserRole = 'petugas',
  token?: string | null
): Promise<HeatmapRow[]> {
  try {
    const bearer = await resolveBearerToken(role, token);
    if (bearer) {
      const res = await fetch(`${API_BASE}/api/heatmap`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data)) {
          return json.data as HeatmapRow[];
        }
      }
    }
  } catch {
    // Gunakan snapshot acuan bila layanan API sedang tidak berjalan
  }

  return getSnapshotHeatmap(role);
}

export function getSnapshotProfilPangkalan(
  kode: string,
  role: UserRole = 'petugas'
): ProfilPangkalanData | null {
  const normalized = kode.trim().toUpperCase();
  const raw = snapshot.profil?.[normalized];
  if (!raw) return null;
  const runtimeHist = getRuntimeTindakLanjutHistory(normalized);
  const mergedTl = [
    ...runtimeHist.map((h) => ({
      id: h.id,
      status: h.status,
      catatan: h.catatan,
      oleh: h.oleh,
      updated_at: h.updated_at,
    })),
    ...(raw.tindak_lanjut ?? []),
  ];
  const withTl: ProfilPangkalanData = {
    ...raw,
    tindak_lanjut: mergedTl,
  };
  if (role === 'admin') return withTl;
  const clone = { ...withTl };
  delete clone.nama;
  delete clone.id_registrasi;
  return clone;
}

export async function fetchProfilPangkalan(
  kode: string,
  role: UserRole = 'petugas',
  token?: string | null
): Promise<ProfilPangkalanData | null> {
  const normalized = kode.trim().toUpperCase();
  try {
    const bearer = await resolveBearerToken(role, token);
    if (bearer) {
      const res = await fetch(`${API_BASE}/api/pangkalan/${encodeURIComponent(normalized)}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          return json.data as ProfilPangkalanData;
        }
      }
    }
  } catch {
    // Gunakan snapshot acuan bila layanan API sedang tidak berjalan
  }

  return getSnapshotProfilPangkalan(normalized, role);
}

export function getSnapshotTemuanAturan(
  jenis?: string | null,
  bulan?: number | null,
  role: UserRole = 'petugas'
): TemuanAturanData {
  const isAdmin = role === 'admin';
  const base = snapshot.temuan_aturan ?? {
    items: [],
    ringkasan: {
      melebihi_alokasi: 33,
      gt_2x_alokasi: 9,
      nol: 11,
      lonjakan: 2,
      seragam: 1,
      fakultatif: 69,
    },
  };

  let items = base.items.map((item) => {
    if (isAdmin) return { ...item };
    const clone = { ...item };
    delete clone.nama;
    return clone;
  });

  if (jenis && jenis !== 'semua') {
    items = items.filter((i) => i.jenis === jenis);
  }
  if (bulan && bulan >= 1 && bulan <= 10) {
    items = items.filter((i) => i.bulan === bulan);
  }

  return {
    items,
    ringkasan: base.ringkasan,
  };
}

export async function fetchTemuanAturan(
  jenis?: string | null,
  bulan?: number | null,
  role: UserRole = 'petugas',
  token?: string | null
): Promise<TemuanAturanData> {
  try {
    const bearer = await resolveBearerToken(role, token);
    if (bearer) {
      const url = new URL(`${API_BASE}/api/temuan-aturan`, window.location.origin);
      if (jenis && jenis !== 'semua') {
        url.searchParams.set('jenis', jenis);
      }
      if (bulan && bulan >= 1 && bulan <= 10) {
        url.searchParams.set('bulan', String(bulan));
      }
      const res = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data)) {
          return {
            items: json.data as TemuanAturanItem[],
            ringkasan: json?.meta?.ringkasan_jenis ?? getSnapshotTemuanAturan().ringkasan,
          };
        }
      }
    }
  } catch {
    // Gunakan snapshot acuan bila layanan API sedang tidak berjalan
  }

  return getSnapshotTemuanAturan(jenis, bulan, role);
}

export function getSnapshotMetode(): MetodeData {
  return snapshot.metode;
}

export async function fetchMetode(
  role: UserRole = 'petugas',
  token?: string | null
): Promise<MetodeData> {
  try {
    const bearer = await resolveBearerToken(role, token);
    if (bearer) {
      const res = await fetch(`${API_BASE}/api/metode`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          return json.data as MetodeData;
        }
      }
    }
  } catch {
    // Gunakan snapshot acuan bila layanan API sedang tidak berjalan
  }

  return getSnapshotMetode();
}

export async function fetchValidasiUnggah(
  csvContent: string,
  expectedTotalAgen?: number | null,
  role: UserRole = 'admin',
  token?: string | null
): Promise<ValidasiUnggahResponse> {
  try {
    const bearer = await resolveBearerToken(role, token);
    if (bearer) {
      const res = await fetch(`${API_BASE}/api/operasional/unggah/validasi`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({
          csv: csvContent,
          expected_total_agen: expectedTotalAgen ?? null,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          return json.data as ValidasiUnggahResponse;
        }
      }
    }
  } catch {
    // Gunakan mesin validasi klien bila API sedang tidak berjalan
  }

  return validasiLaporanBulananClient(csvContent, expectedTotalAgen, role);
}

export async function postKonfirmasiUnggah(params: {
  csvContent: string;
  k?: number;
  threshold?: number;
  topN?: number | null;
  namaRun?: string | null;
  role?: UserRole;
  token?: string | null;
}): Promise<{
  run: AnalysisRunSummaryItem;
  perbandingan_baseline: PerbandinganBaselineData;
  prioritas_terbaru: PrioritasItem[];
}> {
  const {
    csvContent,
    k = 10,
    threshold = 1.5,
    topN = null,
    namaRun = null,
    role = 'admin',
    token,
  } = params;

  const clientVal = validasiLaporanBulananClient(csvContent, null, role);
  const localResult = applyClientOperasionalRun({
    uploadedValidation: clientVal,
    k,
    threshold,
    topN,
    namaRun,
    role,
  });

  try {
    const bearer = await resolveBearerToken(role, token);
    if (bearer) {
      const res = await fetch(`${API_BASE}/api/operasional/unggah/konfirmasi`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({
          csv: csvContent,
          k,
          threshold,
          top_n: topN,
          nama_run: namaRun,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data?.analisis) {
          return {
            run: {
              ...localResult.run,
              ...(json.data.analisis.run ?? {}),
              aktif: true,
              perbandingan_baseline:
                json.data.analisis.perbandingan_baseline ?? localResult.perbandingan_baseline,
            },
            perbandingan_baseline:
              json.data.analisis.perbandingan_baseline ?? localResult.perbandingan_baseline,
            prioritas_terbaru: json.data.prioritas_terbaru ?? localResult.prioritas_terbaru,
          };
        }
      }
    }
  } catch {
    // State runtime klien telah diperbarui
  }

  return localResult;
}

export async function postRunAnalisisParameter(params: {
  k: number;
  threshold: number;
  topN?: number | null;
  nama?: string | null;
  catatan?: string | null;
  role?: UserRole;
  token?: string | null;
}): Promise<{
  run: AnalysisRunSummaryItem;
  perbandingan_baseline: PerbandinganBaselineData;
  prioritas_terbaru: PrioritasItem[];
}> {
  const { k, threshold, topN = null, nama = null, catatan = null, role = 'admin', token } = params;

  const localResult = applyClientOperasionalRun({
    uploadedValidation: null,
    k,
    threshold,
    topN,
    namaRun: nama,
    catatan,
    role,
  });

  try {
    const bearer = await resolveBearerToken(role, token);
    if (bearer) {
      const res = await fetch(`${API_BASE}/api/analisis/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({
          k,
          threshold,
          top_n: topN,
          fallback_local: true,
          nama,
          catatan,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          return {
            run: {
              ...localResult.run,
              ...(json.data.run ?? {}),
              aktif: true,
              perbandingan_baseline:
                json.data.perbandingan_baseline ?? localResult.perbandingan_baseline,
            },
            perbandingan_baseline:
              json.data.perbandingan_baseline ?? localResult.perbandingan_baseline,
            prioritas_terbaru: localResult.prioritas_terbaru,
          };
        }
      }
    }
  } catch {
    // Gunakan hasil runtime klien bila API sedang tidak berjalan
  }

  return localResult;
}

export async function fetchDaftarTindakLanjut(
  role: UserRole = 'petugas',
  token?: string | null
): Promise<{
  ringkasan_status: Record<TindakLanjutStatus, number>;
  items: TindakLanjutPangkalanRow[];
}> {
  try {
    const bearer = await resolveBearerToken(role, token);
    if (bearer) {
      const res = await fetch(`${API_BASE}/api/tindak-lanjut`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data)) {
          return {
            ringkasan_status:
              json?.meta?.ringkasan_status ?? getRuntimeDaftarTindakLanjut(role).ringkasan_status,
            items: json.data as TindakLanjutPangkalanRow[],
          };
        }
      }
    }
  } catch {
    // Fallback ke runtime klien
  }

  return getRuntimeDaftarTindakLanjut(role);
}

export async function postSimpanTindakLanjut(params: {
  kode: string;
  status: TindakLanjutStatus;
  catatan?: string | null;
  role?: UserRole;
  token?: string | null;
}): Promise<TindakLanjutPangkalanRow> {
  const { kode, status, catatan = null, role = 'petugas', token } = params;
  const localRow = saveRuntimeTindakLanjut(kode, status, catatan, role);

  try {
    const bearer = await resolveBearerToken(role, token);
    if (bearer) {
      await fetch(`${API_BASE}/api/pangkalan/${encodeURIComponent(kode)}/tindak-lanjut`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({ status, catatan }),
      });
    }
  } catch {
    // State runtime klien sudah tersimpan
  }

  return localRow;
}

export async function fetchAuditLogs(
  role: UserRole = 'admin',
  token?: string | null
): Promise<AuditLogItem[]> {
  try {
    const bearer = await resolveBearerToken(role, token);
    if (bearer) {
      const res = await fetch(`${API_BASE}/api/audit-log`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data)) {
          return json.data as AuditLogItem[];
        }
      }
    }
  } catch {
    // Fallback ke log runtime
  }

  return getRuntimeAuditLogs();
}

export function buildPrioritasCsvString(items: PrioritasItem[], role: UserRole = 'petugas'): string {
  const isAdmin = role === 'admin';
  const headers = ['kode'];
  if (isAdmin) {
    headers.push('id_registrasi', 'nama_pangkalan');
  }
  headers.push(
    'kecamatan',
    'non_reguler',
    'kategori',
    'status_tindak_lanjut',
    'bulan_valid',
    'bulan_flag_lof',
    'proporsi_flag',
    'rerata_lof',
    'maks_lof',
    'bulan_maks',
    'run_terpanjang',
    'flag_melebihi_alokasi',
    'flag_gt_2x_alokasi',
    'flag_nol',
    'flag_lonjakan',
    'flag_seragam',
    'flag_fakultatif',
    'alasan_penandaan'
  );

  const escapeCsv = (val: unknown): string => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [headers.join(',')];
  for (const item of items) {
    const row: unknown[] = [item.kode];
    if (isAdmin) {
      row.push(item.id_registrasi ?? '', item.nama ?? '');
    }
    const perJenis = item.flag_aturan.per_jenis;
    row.push(
      item.kecamatan ?? '',
      item.non_reguler ? 'Ya' : 'Tidak',
      item.kategori,
      STATUS_TINDAK_LANJUT_LABELS[(item.tindak_lanjut_status as TindakLanjutStatus)] ??
        item.tindak_lanjut_status,
      item.bulan_valid,
      item.bulan_flag,
      item.proporsi_flag ?? '',
      item.rerata_lof ?? '',
      item.maks_lof ?? '',
      item.bulan_maks ?? '',
      item.run_terpanjang,
      perJenis.melebihi_alokasi ?? 0,
      perJenis.gt_2x_alokasi ?? 0,
      perJenis.nol ?? 0,
      perJenis.lonjakan ?? 0,
      perJenis.seragam ?? 0,
      perJenis.fakultatif ?? 0,
      item.alasan
    );
    rows.push(row.map(escapeCsv).join(','));
  }

  recordRuntimeAuditLog(
    'prioritas.export_csv',
    'prioritas',
    null,
    { jumlah_baris: items.length, role },
    role
  );

  return '\uFEFF' + rows.join('\n');
}


