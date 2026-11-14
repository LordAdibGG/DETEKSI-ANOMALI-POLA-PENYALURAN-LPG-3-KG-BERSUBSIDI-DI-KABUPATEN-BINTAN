import snapshotRaw from '../api/baselineSnapshot.json';
import type {
  PrioritasItem,
  ProfilPangkalanData,
  StripBulanItem,
} from '../api/pantau';
import type { UserRole } from '../context/AuthContext';
import { computeLofFull } from './lofEngine';

export type TindakLanjutStatus =
  | 'belum_diperiksa'
  | 'perlu_klarifikasi'
  | 'wajar_dengan_alasan'
  | 'ditindaklanjuti';

export const STATUS_TINDAK_LANJUT_LABELS: Record<TindakLanjutStatus, string> = {
  belum_diperiksa: 'Belum diperiksa',
  perlu_klarifikasi: 'Perlu klarifikasi',
  wajar_dengan_alasan: 'Wajar dengan alasan',
  ditindaklanjuti: 'Ditindaklanjuti',
};

export interface CekItemDetail {
  nama: string;
  rumus: string;
  lulus: boolean;
  jumlah_cocok: number;
  total_baris: number;
  selisih_baris: Array<Record<string, unknown>>;
}

export interface CekTotalAgenDetail {
  nama: string;
  rumus: string;
  lulus: boolean;
  total_alokasi: number;
  total_normal: number;
  total_fakultatif: number;
  grand_total: number;
  sisa_alokasi: number;
  target_grand_total: number;
  galat: string[];
}

export interface BarisValidasiUnggah {
  kode: string;
  pangkalan_id: number;
  id_registrasi?: string;
  nama?: string;
  kecamatan: string | null;
  bulan: number;
  label_bulan: string;
  alokasi: number;
  jumlah_harian: number;
  total_normal: number;
  total_fakultatif: number;
  grand_total: number;
  sisa_alokasi: number;
  harian: Record<number, number>;
  cek_1_harian_vs_normal: boolean;
  cek_2_normal_fakultatif_vs_grand: boolean;
  cek_3_sisa_alokasi: boolean;
  lulus_baris: boolean;
}

export interface ValidasiUnggahResponse {
  valid: boolean;
  bulan: number;
  label_bulan: string;
  nama_bulan: string;
  empat_cek: {
    jumlah_harian_vs_normal: CekItemDetail;
    normal_fakultatif_vs_grand: CekItemDetail;
    sisa_alokasi: CekItemDetail;
    total_agen: CekTotalAgenDetail;
  };
  ringkasan: {
    bulan: number;
    label_bulan: string;
    nama_bulan: string;
    jumlah_baris: number;
    total_alokasi: number;
    total_normal: number;
    total_fakultatif: number;
    grand_total: number;
    sisa_alokasi: number;
  };
  baris: BarisValidasiUnggah[];
}

export interface PangkalanPerbandinganItem {
  kode: string;
  nama?: string;
  kecamatan: string | null;
  kategori_baseline: string;
  kategori_baru: string;
  bulan_flag_baseline: number;
  bulan_flag_baru: number;
  maks_lof_baseline: number | null;
  maks_lof_baru: number | null;
}

export interface PerbandinganBaselineData {
  baseline_nama: string;
  jaccard_observasi: number;
  jaccard_pangkalan: number;
  jumlah_prioritas_baseline: number;
  jumlah_prioritas_baru: number;
  pangkalan_masuk: PangkalanPerbandinganItem[];
  pangkalan_keluar: PangkalanPerbandinganItem[];
  pangkalan_tetap: PangkalanPerbandinganItem[];
}

export interface AnalysisRunSummaryItem {
  id: number;
  nama: string;
  k: number;
  threshold: number;
  top_n?: number | null;
  catatan: string | null;
  dibuat: string;
  aktif: boolean;
  perbandingan_baseline: PerbandinganBaselineData;
}

export interface RiwayatTindakLanjutItem {
  id: number;
  status: TindakLanjutStatus;
  label_status: string;
  catatan: string | null;
  oleh: string;
  updated_at: string;
}

export interface TindakLanjutPangkalanRow {
  kode: string;
  nama?: string;
  kecamatan: string | null;
  kategori: string;
  bulan_flag: number;
  maks_lof: number | null;
  status: TindakLanjutStatus;
  label_status: string;
  catatan: string | null;
  oleh: string | null;
  updated_at: string | null;
  jumlah_riwayat: number;
  riwayat: RiwayatTindakLanjutItem[];
}

export interface AuditLogItem {
  id: number;
  aksi: string;
  entitas: string | null;
  entitas_id: number | null;
  detail: Record<string, unknown> | null;
  oleh: string;
  role: string;
  ip_address: string;
  created_at: string;
}

const NAMA_BULAN_SINGKAT: Record<number, string> = {
  1: 'Jan',
  2: 'Feb',
  3: 'Mar',
  4: 'Apr',
  5: 'Mei',
  6: 'Jun',
  7: 'Jul',
  8: 'Agu',
  9: 'Sep',
  10: 'Okt',
  11: 'Nov',
  12: 'Des',
};

const NAMA_BULAN_LENGKAP: Record<number, string> = {
  1: 'Januari',
  2: 'Februari',
  3: 'Maret',
  4: 'April',
  5: 'Mei',
  6: 'Juni',
  7: 'Juli',
  8: 'Agustus',
  9: 'September',
  10: 'Oktober',
  11: 'November',
  12: 'Desember',
};

const HARI_PER_BULAN: Record<number, number> = {
  1: 31,
  2: 28,
  3: 31,
  4: 30,
  5: 31,
  6: 30,
  7: 31,
  8: 31,
  9: 30,
  10: 31,
  11: 30,
  12: 31,
};

const snapshot = snapshotRaw as unknown as {
  prioritas: Record<string, PrioritasItem[]>;
  profil: Record<string, ProfilPangkalanData>;
};

// State Operasional di Memori Klien
let runtimePrioritasOverride: PrioritasItem[] | null = null;
let runtimeTindakLanjutMap: Record<string, RiwayatTindakLanjutItem[]> = {};
let runtimeRuns: AnalysisRunSummaryItem[] = [];
let runtimeAuditLogs: AuditLogItem[] = [
  {
    id: 1,
    aksi: 'import.baseline',
    entitas: 'analysis_runs',
    entitas_id: 1,
    detail: { nama: 'baseline-k10', k: 10, threshold: 1.5, ditandai: 28 },
    oleh: 'Sistem / CLI',
    role: 'system',
    ip_address: '127.0.0.1',
    created_at: '2026-11-13T10:00:00.000Z',
  },
];
let nextRunId = 2;
let nextLogId = 2;
let nextTlId = 1;

function getMasterPangkalanList(): Array<{
  kode: string;
  pangkalan_id: number;
  id_registrasi: string;
  nama: string;
  kecamatan: string | null;
}> {
  const baseAll = snapshot.prioritas.all ?? [];
  return baseAll.map((item, idx) => ({
    kode: item.kode,
    pangkalan_id: idx + 1,
    id_registrasi: item.id_registrasi ?? snapshot.profil?.[item.kode]?.id_registrasi ?? `REG-${item.kode}`,
    nama: item.nama ?? snapshot.profil?.[item.kode]?.nama ?? item.kode,
    kecamatan: item.kecamatan,
  }));
}

function isSunday2026(bulan: number, hari: number): boolean {
  const dt = new Date(Date.UTC(2026, bulan - 1, hari));
  return dt.getUTCDay() === 0;
}

export function resetOperasionalRuntime(): void {
  runtimePrioritasOverride = null;
  runtimeTindakLanjutMap = {};
  runtimeRuns = [];
  runtimeAuditLogs = [
    {
      id: 1,
      aksi: 'import.baseline',
      entitas: 'analysis_runs',
      entitas_id: 1,
      detail: { nama: 'baseline-k10', k: 10, threshold: 1.5, ditandai: 28 },
      oleh: 'Sistem / CLI',
      role: 'system',
      ip_address: '127.0.0.1',
      created_at: '2026-11-13T10:00:00.000Z',
    },
  ];
  nextRunId = 2;
  nextLogId = 2;
  nextTlId = 1;
}

export function recordRuntimeAuditLog(
  aksi: string,
  entitas: string | null,
  entitasId: number | null,
  detail: Record<string, unknown>,
  role: UserRole = 'admin'
): void {
  runtimeAuditLogs = [
    {
      id: nextLogId++,
      aksi,
      entitas,
      entitas_id: entitasId,
      detail,
      oleh: role === 'admin' ? 'admin@bintankab.go.id' : 'petugas@bintankab.go.id',
      role,
      ip_address: '127.0.0.1',
      created_at: new Date().toISOString(),
    },
    ...runtimeAuditLogs,
  ];
}

export function getRuntimePrioritasOverride(): PrioritasItem[] | null {
  return runtimePrioritasOverride;
}

export function getRuntimeTindakLanjutStatus(kode: string): TindakLanjutStatus {
  const list = runtimeTindakLanjutMap[kode.toUpperCase()];
  if (list && list.length > 0) {
    return list[0].status;
  }
  return 'belum_diperiksa';
}

export function getRuntimeTindakLanjutHistory(kode: string): RiwayatTindakLanjutItem[] {
  return runtimeTindakLanjutMap[kode.toUpperCase()] ?? [];
}

/**
 * Buat contoh CSV laporan bulanan fiktif (November 2026 / bulan = 11) berformat lebar seperti kjp_2026_wide.csv.
 * Lulus 100% pada keempat cek validasi, dan membuat P11 serta P12 (sebelumnya Normal) mengalami anomali
 * sehingga masuk ke daftar prioritas.
 */
export function generateContohBulanFiktifCsv(bulan = 11): string {
  const master = getMasterPangkalanList();
  const headers = ['bulan', 'id_pangkalan', 'nama_pangkalan', 'alokasi'];
  for (let d = 1; d <= 31; d++) {
    headers.push(`d${String(d).padStart(2, '0')}`);
  }
  headers.push('total_normal', 'total_fakultatif', 'sisa_alokasi', 'grand_total');

  const lines: string[] = [headers.join(',')];

  master.forEach((p, idx) => {
    const dVals: number[] = new Array(32).fill(0);
    let alokasi = 800;
    let fakultatif = 0;

    if (p.kode === 'P29') {
      alokasi = 1200;
      fakultatif = 0;
    } else if (p.kode === 'P11') {
      // P11 (sebelumnya Normal 0 flag) mengalami lonjakan ekstrem satu hari (520 dari 560 tabung pada 2 hari aktif)
      alokasi = 560;
      dVals[3] = 520;
      dVals[18] = 40;
      fakultatif = 0;
    } else if (p.kode === 'P12') {
      // P12 (sebelumnya Normal 0 flag) mengalami pola seragam 24 hari kerja penuh @ 55 tabung
      alokasi = 700;
      for (let d = 2; d <= 28; d++) {
        if (!isSunday2026(bulan, d)) {
          dVals[d] = 55;
        }
      }
      fakultatif = 50;
    } else {
      alokasi = 800;
      const activeDays = [2, 5, 9, 12, 16, 19, 23, 26, 30];
      const pattern = [65, 80, 70, 90, 60, 85, 75, 95, 70];
      activeDays.forEach((dayNum, i) => {
        dVals[dayNum] = pattern[i] + (((idx + 1) * 3 + i * 5) % 25);
      });
      fakultatif = (idx + 1) % 3 === 0 ? 40 : 0;
    }

    const totalNormal = dVals.reduce((acc, v) => acc + v, 0);
    const grandTotal = totalNormal + fakultatif;
    const sisaAlokasi = alokasi - grandTotal;

    const cols: Array<string | number> = [
      bulan,
      p.id_registrasi,
      `"${p.nama.replace(/"/g, '""')}"`,
      alokasi,
    ];
    for (let d = 1; d <= 31; d++) {
      cols.push(dVals[d]);
    }
    cols.push(totalNormal, fakultatif, sisaAlokasi, grandTotal);
    lines.push(cols.join(','));
  });

  return lines.join('\n');
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Validasi 4 cek pada CSV format lebar di klien.
 */
export function validasiLaporanBulananClient(
  csvContent: string,
  expectedTotalAgen?: number | null,
  role: UserRole = 'admin'
): ValidasiUnggahResponse {
  const rawLines = csvContent
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length < 2) {
    return {
      valid: false,
      bulan: 11,
      label_bulan: 'Nov',
      nama_bulan: 'November',
      empat_cek: {
        jumlah_harian_vs_normal: {
          nama: 'Cek 1: Jumlah Harian = Total Normal',
          rumus: 'Σ(d01..d31) = total_normal',
          lulus: false,
          jumlah_cocok: 0,
          total_baris: 0,
          selisih_baris: [],
        },
        normal_fakultatif_vs_grand: {
          nama: 'Cek 2: Normal + Fakultatif = Grand Total',
          rumus: 'total_normal + total_fakultatif = grand_total',
          lulus: false,
          jumlah_cocok: 0,
          total_baris: 0,
          selisih_baris: [],
        },
        sisa_alokasi: {
          nama: 'Cek 3: Sisa = Alokasi − Grand Total',
          rumus: 'sisa_alokasi = alokasi − grand_total',
          lulus: false,
          jumlah_cocok: 0,
          total_baris: 0,
          selisih_baris: [],
        },
        total_agen: {
          nama: 'Cek 4: Konsistensi Total Agen (PT. Kurnia Jaya Pratama)',
          rumus: 'Σ grand_total pangkalan = total penyaluran agen',
          lulus: false,
          total_alokasi: 0,
          total_normal: 0,
          total_fakultatif: 0,
          grand_total: 0,
          sisa_alokasi: 0,
          target_grand_total: 0,
          galat: ['Berkas CSV kosong atau tidak memiliki baris data.'],
        },
      },
      ringkasan: {
        bulan: 11,
        label_bulan: 'Nov',
        nama_bulan: 'November',
        jumlah_baris: 0,
        total_alokasi: 0,
        total_normal: 0,
        total_fakultatif: 0,
        grand_total: 0,
        sisa_alokasi: 0,
      },
      baris: [],
    };
  }

  const headerLine = rawLines[0].replace(/^\uFEFF/, '');
  const delimiter =
    (headerLine.match(/;/g) ?? []).length > (headerLine.match(/,/g) ?? []).length ? ';' : ',';
  const headers = parseCsvLine(headerLine, delimiter).map((h) => h.toLowerCase());

  const master = getMasterPangkalanList();
  const byReg = new Map(master.map((m) => [m.id_registrasi, m]));
  const byKode = new Map(master.map((m) => [m.kode.toUpperCase(), m]));

  const baris: BarisValidasiUnggah[] = [];
  const cek1Failures: Array<Record<string, unknown>> = [];
  const cek2Failures: Array<Record<string, unknown>> = [];
  const cek3Failures: Array<Record<string, unknown>> = [];
  const cek4Errors: string[] = [];
  const seenKeys = new Set<string>();

  let sumAlokasi = 0;
  let sumNormal = 0;
  let sumFakultatif = 0;
  let sumGrandTotal = 0;
  let sumSisa = 0;
  let detectedBulan: number | null = null;
  let summaryRow: {
    alokasi: number;
    total_normal: number;
    total_fakultatif: number;
    sisa_alokasi: number;
    grand_total: number;
  } | null = null;

  for (let i = 1; i < rawLines.length; i++) {
    const cols = parseCsvLine(rawLines[i], delimiter);
    const assoc: Record<string, string> = {};
    headers.forEach((h, cIdx) => {
      assoc[h] = cols[cIdx] ?? '';
    });

    const rawId = (assoc.id_pangkalan ?? '').trim();
    const rawNama = (assoc.nama_pangkalan ?? '').trim();

    if (
      ['TOTAL', 'TOTAL AGEN', 'JUMLAH'].includes(rawId.toUpperCase()) ||
      ['TOTAL', 'TOTAL AGEN', 'JUMLAH'].includes(rawNama.toUpperCase())
    ) {
      summaryRow = {
        alokasi: Math.round(Number(assoc.alokasi || 0)),
        total_normal: Math.round(Number(assoc.total_normal || 0)),
        total_fakultatif: Math.round(Number(assoc.total_fakultatif || 0)),
        sisa_alokasi: Math.round(Number(assoc.sisa_alokasi || 0)),
        grand_total: Math.round(Number(assoc.grand_total || 0)),
      };
      continue;
    }

    const bulan = Number.parseInt(assoc.bulan || '0', 10);
    if (!Number.isFinite(bulan) || bulan < 1 || bulan > 12) {
      cek4Errors.push(`Baris ke-${i}: nilai bulan '${assoc.bulan}' tidak valid.`);
      continue;
    }
    if (detectedBulan === null) {
      detectedBulan = bulan;
    }

    const pangkalan = byReg.get(rawId) ?? byKode.get(rawId.toUpperCase());
    if (!pangkalan) {
      cek4Errors.push(`Baris ke-${i}: pangkalan '${rawId}' tidak terdaftar.`);
      continue;
    }

    const uKey = `${pangkalan.kode}#${bulan}`;
    if (seenKeys.has(uKey)) {
      cek4Errors.push(`Duplikasi baris untuk pangkalan ${pangkalan.kode} pada bulan ${bulan}.`);
    }
    seenKeys.add(uKey);

    const alokasi = Math.round(Number(assoc.alokasi || 0));
    const totalNormal = Math.round(Number(assoc.total_normal || 0));
    const totalFakultatif = Math.round(Number(assoc.total_fakultatif || 0));
    const sisaAlokasi = Math.round(Number(assoc.sisa_alokasi || 0));
    const grandTotal = Math.round(Number(assoc.grand_total || 0));

    const harian: Record<number, number> = {};
    let sumHarianFloat = 0;
    for (let d = 1; d <= 31; d++) {
      const colKey = `d${String(d).padStart(2, '0')}`;
      const val = Number(assoc[colKey] || 0);
      const cleanVal = Number.isFinite(val) ? val : 0;
      harian[d] = Math.round(cleanVal);
      sumHarianFloat += cleanVal;
    }
    const jumlahHarian = Math.round(sumHarianFloat);

    const cek1Ok = jumlahHarian === totalNormal;
    if (!cek1Ok) {
      cek1Failures.push({
        kode: pangkalan.kode,
        bulan,
        jumlah_harian: jumlahHarian,
        total_normal: totalNormal,
        selisih: jumlahHarian - totalNormal,
      });
    }

    const expectedGrand = totalNormal + totalFakultatif;
    const cek2Ok = expectedGrand === grandTotal;
    if (!cek2Ok) {
      cek2Failures.push({
        kode: pangkalan.kode,
        bulan,
        normal_plus_fakultatif: expectedGrand,
        grand_total: grandTotal,
        selisih: expectedGrand - grandTotal,
      });
    }

    const expectedSisa = alokasi - grandTotal;
    const cek3Ok = expectedSisa === sisaAlokasi;
    if (!cek3Ok) {
      cek3Failures.push({
        kode: pangkalan.kode,
        bulan,
        alokasi_minus_grand: expectedSisa,
        sisa_alokasi: sisaAlokasi,
        selisih: expectedSisa - sisaAlokasi,
      });
    }

    sumAlokasi += alokasi;
    sumNormal += totalNormal;
    sumFakultatif += totalFakultatif;
    sumGrandTotal += grandTotal;
    sumSisa += sisaAlokasi;

    const item: BarisValidasiUnggah = {
      kode: pangkalan.kode,
      pangkalan_id: pangkalan.pangkalan_id,
      id_registrasi: role === 'admin' ? pangkalan.id_registrasi : undefined,
      nama: role === 'admin' ? pangkalan.nama : undefined,
      kecamatan: pangkalan.kecamatan,
      bulan,
      label_bulan: NAMA_BULAN_SINGKAT[bulan] ?? String(bulan),
      alokasi,
      jumlah_harian: jumlahHarian,
      total_normal: totalNormal,
      total_fakultatif: totalFakultatif,
      grand_total: grandTotal,
      sisa_alokasi: sisaAlokasi,
      harian,
      cek_1_harian_vs_normal: cek1Ok,
      cek_2_normal_fakultatif_vs_grand: cek2Ok,
      cek_3_sisa_alokasi: cek3Ok,
      lulus_baris: cek1Ok && cek2Ok && cek3Ok,
    };

    baris.push(item);
  }

  const totalRows = baris.length;
  const targetGrandTotal =
    expectedTotalAgen !== undefined && expectedTotalAgen !== null
      ? expectedTotalAgen
      : summaryRow?.grand_total ?? sumGrandTotal;

  if (sumGrandTotal !== targetGrandTotal) {
    cek4Errors.push(
      `Total realisasi agen (${sumGrandTotal}) tidak cocok dengan target agen (${targetGrandTotal}).`
    );
  }
  if (sumNormal + sumFakultatif !== sumGrandTotal) {
    cek4Errors.push('Akumulasi tingkat agen: total_normal + total_fakultatif != grand_total.');
  }
  if (sumAlokasi - sumGrandTotal !== sumSisa) {
    cek4Errors.push('Akumulasi tingkat agen: alokasi - grand_total != sisa_alokasi.');
  }

  const cek1Pass = cek1Failures.length === 0 && totalRows > 0;
  const cek2Pass = cek2Failures.length === 0 && totalRows > 0;
  const cek3Pass = cek3Failures.length === 0 && totalRows > 0;
  const cek4Pass = cek4Errors.length === 0 && totalRows > 0 && sumGrandTotal > 0;
  const bulanFinal = detectedBulan ?? 11;

  return {
    valid: cek1Pass && cek2Pass && cek3Pass && cek4Pass,
    bulan: bulanFinal,
    label_bulan: NAMA_BULAN_SINGKAT[bulanFinal] ?? String(bulanFinal),
    nama_bulan: NAMA_BULAN_LENGKAP[bulanFinal] ?? `Bulan ${bulanFinal}`,
    empat_cek: {
      jumlah_harian_vs_normal: {
        nama: 'Cek 1: Jumlah Harian = Total Normal',
        rumus: 'Σ(d01..d31) = total_normal',
        lulus: cek1Pass,
        jumlah_cocok: totalRows - cek1Failures.length,
        total_baris: totalRows,
        selisih_baris: cek1Failures,
      },
      normal_fakultatif_vs_grand: {
        nama: 'Cek 2: Normal + Fakultatif = Grand Total',
        rumus: 'total_normal + total_fakultatif = grand_total',
        lulus: cek2Pass,
        jumlah_cocok: totalRows - cek2Failures.length,
        total_baris: totalRows,
        selisih_baris: cek2Failures,
      },
      sisa_alokasi: {
        nama: 'Cek 3: Sisa = Alokasi − Grand Total',
        rumus: 'sisa_alokasi = alokasi − grand_total',
        lulus: cek3Pass,
        jumlah_cocok: totalRows - cek3Failures.length,
        total_baris: totalRows,
        selisih_baris: cek3Failures,
      },
      total_agen: {
        nama: 'Cek 4: Konsistensi Total Agen (PT. Kurnia Jaya Pratama)',
        rumus: 'Σ grand_total pangkalan = total penyaluran agen',
        lulus: cek4Pass,
        total_alokasi: sumAlokasi,
        total_normal: sumNormal,
        total_fakultatif: sumFakultatif,
        grand_total: sumGrandTotal,
        sisa_alokasi: sumSisa,
        target_grand_total: targetGrandTotal,
        galat: cek4Errors,
      },
    },
    ringkasan: {
      bulan: bulanFinal,
      label_bulan: NAMA_BULAN_SINGKAT[bulanFinal] ?? String(bulanFinal),
      nama_bulan: NAMA_BULAN_LENGKAP[bulanFinal] ?? `Bulan ${bulanFinal}`,
      jumlah_baris: totalRows,
      total_alokasi: sumAlokasi,
      total_normal: sumNormal,
      total_fakultatif: sumFakultatif,
      grand_total: sumGrandTotal,
      sisa_alokasi: sumSisa,
    },
    baris,
  };
}

function medianNum(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function robustZArray(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const med = medianNum(values);
  const absDevs = values.map((v) => Math.abs(v - med));
  let mad = medianNum(absDevs) * 1.4826;
  if (mad === 0) {
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
    mad = Math.sqrt(variance);
  }
  if (mad === 0) return new Array(n).fill(0);
  return values.map((v) => (v - med) / mad);
}

/**
 * Hitung dampak unggahan bulan baru atau perubahan parameter (k, threshold, top_n)
 * di klien dan perbarui runtimePrioritasOverride serta daftar analysis_runs.
 */
export function applyClientOperasionalRun(options: {
  uploadedValidation?: ValidasiUnggahResponse | null;
  k?: number;
  threshold?: number;
  topN?: number | null;
  namaRun?: string | null;
  catatan?: string | null;
  role?: UserRole;
}): {
  run: AnalysisRunSummaryItem;
  perbandingan_baseline: PerbandinganBaselineData;
  prioritas_terbaru: PrioritasItem[];
} {
  const k = options.k ?? 10;
  const threshold = options.threshold ?? 1.5;
  const topN = options.topN ?? null;
  const role = options.role ?? 'admin';

  const baseAll = snapshot.prioritas.all.map((p) => ({
    ...p,
    strip_10_bulan: p.strip_10_bulan.map((s) => ({ ...s })),
    flag_aturan: {
      ...p.flag_aturan,
      jenis_aktif: [...p.flag_aturan.jenis_aktif],
      per_jenis: { ...p.flag_aturan.per_jenis },
    },
  }));

  // Jika ada unggahan bulan baru (mis. bulan 11), hitung 4 fitur, robust z-score, dan LOF bulan tersebut
  const uploadedMonthLofByKode = new Map<
    string,
    {
      bulan: number;
      label: string;
      lof: number | null;
      flag: boolean;
      nol: boolean;
      alasan?: string;
    }
  >();

  if (options.uploadedValidation && options.uploadedValidation.valid) {
    const val = options.uploadedValidation;
    const nHariBulan = HARI_PER_BULAN[val.bulan] ?? 30;

    interface UploadedFeatRow {
      kode: string;
      nol: boolean;
      log_total: number;
      cv_harian: number;
      rasio_hari_aktif: number;
      porsi_nilai_dominan: number;
    }

    const featRows: UploadedFeatRow[] = val.baris.map((b) => {
      const kerjaVals: number[] = [];
      for (let d = 1; d <= nHariBulan; d++) {
        if (!isSunday2026(val.bulan, d)) {
          kerjaVals.push(b.harian[d] ?? 0);
        }
      }
      const total = kerjaVals.reduce((acc, v) => acc + v, 0);
      const nz = kerjaVals.filter((v) => v > 0);
      if (nz.length === 0 || total <= 0) {
        return {
          kode: b.kode,
          nol: true,
          log_total: 0,
          cv_harian: 0,
          rasio_hari_aktif: 0,
          porsi_nilai_dominan: 0,
        };
      }
      const mean = nz.reduce((a, v) => a + v, 0) / nz.length;
      const variance = nz.reduce((a, v) => a + (v - mean) ** 2, 0) / nz.length;
      const cv = nz.length > 1 && mean > 0 ? Math.sqrt(variance) / mean : 0;
      const counts = new Map<number, number>();
      nz.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
      const maxFreq = Math.max(...Array.from(counts.values()));

      return {
        kode: b.kode,
        nol: false,
        log_total: Math.log1p(total),
        cv_harian: cv,
        rasio_hari_aktif: nz.length / kerjaVals.length,
        porsi_nilai_dominan: maxFreq / nz.length,
      };
    });

    const activeFeats = featRows.filter((f) => !f.nol);
    const zLog = robustZArray(activeFeats.map((f) => f.log_total));
    const zCv = robustZArray(activeFeats.map((f) => f.cv_harian));
    const zRasio = robustZArray(activeFeats.map((f) => f.rasio_hari_aktif));
    const zDominan = robustZArray(activeFeats.map((f) => f.porsi_nilai_dominan));

    const pts4D = activeFeats.map((_, idx) => [zLog[idx], zCv[idx], zRasio[idx], zDominan[idx]]);
    const lofRes = computeLofFull(pts4D, Math.min(k, Math.max(1, pts4D.length - 1)));

    activeFeats.forEach((f, idx) => {
      const score = Math.round(lofRes.lof[idx] * 100) / 100;
      const isFlag = score >= threshold;
      uploadedMonthLofByKode.set(f.kode, {
        bulan: val.bulan,
        label: val.label_bulan,
        lof: score,
        flag: isFlag,
        nol: false,
        alasan: isFlag
          ? `pola penyaluran ${val.nama_bulan} 2026 menyimpang tajam dari pangkalan lain (LOF ${score.toFixed(2).replace('.', ',')})`
          : undefined,
      });
    });

    featRows
      .filter((f) => f.nol)
      .forEach((f) => {
        uploadedMonthLofByKode.set(f.kode, {
          bulan: val.bulan,
          label: val.label_bulan,
          lof: null,
          flag: false,
          nol: true,
        });
      });

    recordRuntimeAuditLog(
      'laporan.unggah',
      'laporan_bulanan',
      val.bulan,
      {
        bulan: val.bulan,
        nama_bulan: val.nama_bulan,
        jumlah_pangkalan: val.ringkasan.jumlah_baris,
        grand_total_agen: val.ringkasan.grand_total,
      },
      role
    );
  }

  // Hitung ulang strip, bulan_flag, maks_lof, dan kategori untuk setiap pangkalan
  let updatedList: PrioritasItem[] = baseAll.map((item) => {
    const strip: StripBulanItem[] = item.strip_10_bulan.map((cell) => {
      if (cell.nol || cell.lof === null) return { ...cell };
      const flag = cell.lof >= threshold;
      return {
        ...cell,
        flag,
        status: flag ? 'ditandai' : 'tidak',
      };
    });

    const extra = uploadedMonthLofByKode.get(item.kode);
    if (extra) {
      const existingIdx = strip.findIndex((s) => s.bulan === extra.bulan);
      const newCell: StripBulanItem = {
        bulan: extra.bulan,
        label: extra.label,
        status: extra.nol ? 'nol' : extra.flag ? 'ditandai' : 'tidak',
        lof: extra.lof,
        flag: extra.flag,
        nol: extra.nol,
      };
      if (existingIdx >= 0) {
        strip[existingIdx] = newCell;
      } else {
        strip.push(newCell);
      }
    }

    const validCells = strip.filter((c) => !c.nol && c.lof !== null);
    const flaggedCells = validCells.filter((c) => c.flag);
    const bulanValid = validCells.length;
    const bulanFlag = flaggedCells.length;
    const proporsi = bulanValid > 0 ? Math.round((bulanFlag / bulanValid) * 100) / 100 : null;

    let maksLof: number | null = null;
    let bulanMaks: string | null = item.bulan_maks;
    validCells.forEach((c) => {
      if (c.lof !== null && (maksLof === null || c.lof > maksLof)) {
        maksLof = c.lof;
        bulanMaks = c.label;
      }
    });

    let kategori = 'Normal';
    let kategoriLabel = 'Normal';
    if (bulanValid === 0) {
      kategori = 'Tidak dinilai';
      kategoriLabel = 'Tidak dinilai (nol sepanjang waktu)';
    } else if (bulanValid < 4) {
      kategori = 'Data kurang';
      kategoriLabel = 'Data kurang (<4 bulan valid)';
    } else if (bulanFlag === 0) {
      kategori = 'Normal';
      kategoriLabel = 'Normal';
    } else if (bulanFlag / bulanValid <= 0.3) {
      kategori = 'Sporadis';
      kategoriLabel = 'Sporadis (anomali)';
    } else if (bulanFlag / bulanValid < 0.7) {
      kategori = 'Berulang';
      kategoriLabel = 'Berulang (sedang)';
    } else {
      kategori = 'Konsisten tinggi';
      kategoriLabel = 'Konsisten tinggi (profil khusus)';
    }

    return {
      ...item,
      kategori,
      kategori_label: kategoriLabel,
      bulan_valid: bulanValid,
      bulan_flag: bulanFlag,
      proporsi_flag: proporsi,
      maks_lof: maksLof,
      bulan_maks: bulanMaks,
      strip_10_bulan: strip,
      alasan: extra?.alasan ?? item.alasan,
      tindak_lanjut_status: getRuntimeTindakLanjutStatus(item.kode),
    };
  });

  // Jika mode Top-N diaktifkan, batasi pangkalan yang ditandai menjadi tepat Top-N berdasarkan maks_lof
  if (topN !== null && topN > 0) {
    const validSorted = [...updatedList]
      .filter((p) => p.maks_lof !== null && p.bulan_valid >= 4)
      .sort((a, b) => (b.maks_lof ?? -1) - (a.maks_lof ?? -1));
    const selectedCodes = new Set(validSorted.slice(0, topN).map((p) => p.kode));

    updatedList = updatedList.map((item) => {
      if (item.bulan_valid === 0 || item.bulan_valid < 4) return item;
      if (selectedCodes.has(item.kode)) {
        const nextFlag = Math.max(1, item.bulan_flag);
        const nextKat =
          nextFlag / item.bulan_valid <= 0.3
            ? 'Sporadis'
            : nextFlag / item.bulan_valid < 0.7
              ? 'Berulang'
              : 'Konsisten tinggi';
        return {
          ...item,
          bulan_flag: nextFlag,
          kategori: nextKat,
          kategori_label: nextKat,
        };
      }
      return {
        ...item,
        bulan_flag: 0,
        proporsi_flag: 0,
        kategori: 'Normal',
        kategori_label: 'Normal',
      };
    });
  }

  // Hitung perbandingan terhadap baseline-k10
  const baseByKode = new Map(snapshot.prioritas.all.map((p) => [p.kode, p]));
  const masuk: PangkalanPerbandinganItem[] = [];
  const keluar: PangkalanPerbandinganItem[] = [];
  const tetap: PangkalanPerbandinganItem[] = [];

  const baseFlaggedSet = new Set<string>();
  const newFlaggedSet = new Set<string>();
  const baseObsSet = new Set<string>();
  const newObsSet = new Set<string>();

  updatedList.forEach((nItem) => {
    const bItem = baseByKode.get(nItem.kode);
    const wasPrioritas = (bItem?.bulan_flag ?? 0) > 0;
    const isPrioritas = nItem.bulan_flag > 0;

    if (wasPrioritas) baseFlaggedSet.add(nItem.kode);
    if (isPrioritas) newFlaggedSet.add(nItem.kode);

    bItem?.strip_10_bulan.forEach((c) => {
      if (c.flag) baseObsSet.add(`${nItem.kode}#${c.bulan}`);
    });
    nItem.strip_10_bulan.forEach((c) => {
      if (c.flag) newObsSet.add(`${nItem.kode}#${c.bulan}`);
    });

    const comp: PangkalanPerbandinganItem = {
      kode: nItem.kode,
      nama: role === 'admin' ? nItem.nama : undefined,
      kecamatan: nItem.kecamatan,
      kategori_baseline: bItem?.kategori ?? 'Normal',
      kategori_baru: nItem.kategori,
      bulan_flag_baseline: bItem?.bulan_flag ?? 0,
      bulan_flag_baru: nItem.bulan_flag,
      maks_lof_baseline: bItem?.maks_lof ?? null,
      maks_lof_baru: nItem.maks_lof,
    };

    if (!wasPrioritas && isPrioritas) {
      masuk.push(comp);
    } else if (wasPrioritas && !isPrioritas) {
      keluar.push(comp);
    } else if (wasPrioritas && isPrioritas) {
      tetap.push(comp);
    }
  });

  const interP = Array.from(baseFlaggedSet).filter((c) => newFlaggedSet.has(c)).length;
  const unionP = new Set([...Array.from(baseFlaggedSet), ...Array.from(newFlaggedSet)]).size;
  const jaccardPangkalan = unionP > 0 ? Math.round((interP / unionP) * 10000) / 10000 : 1;

  const interObs = Array.from(baseObsSet).filter((c) => newObsSet.has(c)).length;
  const unionObs = new Set([...Array.from(baseObsSet), ...Array.from(newObsSet)]).size;
  const jaccardObs = unionObs > 0 ? Math.round((interObs / unionObs) * 10000) / 10000 : 1;

  const perbandingan_baseline: PerbandinganBaselineData = {
    baseline_nama: 'baseline-k10',
    jaccard_observasi: jaccardObs,
    jaccard_pangkalan: jaccardPangkalan,
    jumlah_prioritas_baseline: baseFlaggedSet.size,
    jumlah_prioritas_baru: newFlaggedSet.size,
    pangkalan_masuk: masuk,
    pangkalan_keluar: keluar,
    pangkalan_tetap: tetap,
  };

  const runName =
    options.namaRun && options.namaRun.trim().length > 0
      ? options.namaRun.trim()
      : options.uploadedValidation
        ? `unggah-bln${options.uploadedValidation.bulan}-k${k}`
        : topN
          ? `run-k${k}-top${topN}`
          : `run-k${k}-thr${threshold.toFixed(2).replace('.', '_')}`;

  const newRun: AnalysisRunSummaryItem = {
    id: nextRunId++,
    nama: runName,
    k,
    threshold,
    top_n: topN,
    catatan:
      options.catatan ??
      (options.uploadedValidation
        ? `Analisis otomatis pasca-unggah laporan ${options.uploadedValidation.nama_bulan} 2026.`
        : topN
          ? `Mode kapasitas pemeriksa Top-${topN} pangkalan (k=${k}).`
          : `Run parameter k=${k}, batas LOF >= ${threshold.toFixed(2)}.`),
    dibuat: new Date().toISOString(),
    aktif: true,
    perbandingan_baseline,
  };

  runtimeRuns = [
    newRun,
    ...runtimeRuns.map((r) => ({ ...r, aktif: false })),
  ];
  runtimePrioritasOverride = updatedList;

  recordRuntimeAuditLog(
    'analysis.run',
    'analysis_runs',
    newRun.id,
    {
      nama: newRun.nama,
      k,
      threshold,
      top_n: topN,
      jaccard_pangkalan: jaccardPangkalan,
      masuk: masuk.map((m) => m.kode),
      keluar: keluar.map((m) => m.kode),
    },
    role
  );

  return {
    run: newRun,
    perbandingan_baseline,
    prioritas_terbaru: updatedList,
  };
}

export function saveRuntimeTindakLanjut(
  kode: string,
  status: TindakLanjutStatus,
  catatan: string | null,
  role: UserRole = 'petugas'
): TindakLanjutPangkalanRow {
  const norm = kode.trim().toUpperCase();
  const entry: RiwayatTindakLanjutItem = {
    id: nextTlId++,
    status,
    label_status: STATUS_TINDAK_LANJUT_LABELS[status] ?? status,
    catatan: catatan && catatan.trim().length > 0 ? catatan.trim() : null,
    oleh: role === 'admin' ? 'admin@bintankab.go.id' : 'petugas@bintankab.go.id',
    updated_at: new Date().toISOString(),
  };

  const prev = runtimeTindakLanjutMap[norm] ?? [];
  runtimeTindakLanjutMap[norm] = [entry, ...prev];

  if (runtimePrioritasOverride) {
    runtimePrioritasOverride = runtimePrioritasOverride.map((p) =>
      p.kode === norm ? { ...p, tindak_lanjut_status: status } : p
    );
  }

  recordRuntimeAuditLog(
    'tindak_lanjut.simpan',
    'pangkalan',
    null,
    {
      kode: norm,
      status,
      label_status: entry.label_status,
      catatan: entry.catatan,
    },
    role
  );

  const allRows = getRuntimeDaftarTindakLanjut(role).items;
  return (
    allRows.find((r) => r.kode === norm) ?? {
      kode: norm,
      kecamatan: null,
      kategori: 'Normal',
      bulan_flag: 0,
      maks_lof: null,
      status,
      label_status: entry.label_status,
      catatan: entry.catatan,
      oleh: entry.oleh,
      updated_at: entry.updated_at,
      jumlah_riwayat: runtimeTindakLanjutMap[norm].length,
      riwayat: runtimeTindakLanjutMap[norm],
    }
  );
}

export function getRuntimeDaftarTindakLanjut(role: UserRole = 'petugas'): {
  ringkasan_status: Record<TindakLanjutStatus, number>;
  items: TindakLanjutPangkalanRow[];
} {
  const source = runtimePrioritasOverride ?? snapshot.prioritas.all;
  const ringkasan_status: Record<TindakLanjutStatus, number> = {
    belum_diperiksa: 0,
    perlu_klarifikasi: 0,
    wajar_dengan_alasan: 0,
    ditindaklanjuti: 0,
  };

  const items: TindakLanjutPangkalanRow[] = source.map((p) => {
    const riwayat = runtimeTindakLanjutMap[p.kode] ?? [];
    const latest = riwayat[0];
    const status: TindakLanjutStatus =
      latest?.status ?? ((p.tindak_lanjut_status as TindakLanjutStatus) || 'belum_diperiksa');
    ringkasan_status[status] = (ringkasan_status[status] ?? 0) + 1;

    return {
      kode: p.kode,
      nama: role === 'admin' ? p.nama : undefined,
      kecamatan: p.kecamatan,
      kategori: p.kategori,
      bulan_flag: p.bulan_flag,
      maks_lof: p.maks_lof,
      status,
      label_status: STATUS_TINDAK_LANJUT_LABELS[status] ?? status,
      catatan: latest?.catatan ?? null,
      oleh: latest?.oleh ?? null,
      updated_at: latest?.updated_at ?? null,
      jumlah_riwayat: riwayat.length,
      riwayat,
    };
  });

  return {
    ringkasan_status,
    items,
  };
}

export function getRuntimeRuns(role: UserRole = 'admin'): AnalysisRunSummaryItem[] {
  const baselineRun: AnalysisRunSummaryItem = {
    id: 1,
    nama: 'baseline-k10',
    k: 10,
    threshold: 1.5,
    top_n: null,
    catatan: 'Run acuan hasil riset Jan–Okt 2026 (k=10, threshold=1,50).',
    dibuat: '2026-11-13T10:00:00.000Z',
    aktif: runtimeRuns.length === 0,
    perbandingan_baseline: {
      baseline_nama: 'baseline-k10',
      jaccard_observasi: 1.0,
      jaccard_pangkalan: 1.0,
      jumlah_prioritas_baseline: 10,
      jumlah_prioritas_baru: 10,
      pangkalan_masuk: [],
      pangkalan_keluar: [],
      pangkalan_tetap: snapshot.prioritas.all
        .filter((p) => p.bulan_flag > 0)
        .map((p) => ({
          kode: p.kode,
          nama: role === 'admin' ? p.nama : undefined,
          kecamatan: p.kecamatan,
          kategori_baseline: p.kategori,
          kategori_baru: p.kategori,
          bulan_flag_baseline: p.bulan_flag,
          bulan_flag_baru: p.bulan_flag,
          maks_lof_baseline: p.maks_lof,
          maks_lof_baru: p.maks_lof,
        })),
    },
  };

  return [...runtimeRuns, baselineRun];
}

export function getRuntimeAuditLogs(): AuditLogItem[] {
  return runtimeAuditLogs;
}
