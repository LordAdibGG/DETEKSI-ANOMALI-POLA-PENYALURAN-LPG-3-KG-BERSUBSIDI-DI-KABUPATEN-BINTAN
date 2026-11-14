/**
 * Mesin perhitungan Local Outlier Factor (LOF) murni di klien (TypeScript).
 * Menghitung secara lengkap 5 tahap Breunig et al. (2000):
 * 1. Matriks jarak Euclidean d(p, o)
 * 2. k-distance(p) dan himpunan tetangga N_k(p) (mendukung tie / jarak seri)
 * 3. Reachability distance: reach-dist_k(p, o) = max(k-distance(o), d(p, o))
 * 4. Local Reachability Density: lrd_k(p) = |N_k(p)| / sum_{o in N_k(p)} reach-dist_k(p, o)
 * 5. Local Outlier Factor: LOF_k(p) = (sum_{o in N_k(p)} lrd_k(o) / |N_k(p)|) / lrd_k(p)
 */

export interface Point2D {
  id: string;
  label: string;
  x: number;
  y: number;
  cluster?: 'padat' | 'renggang' | 'uji';
  draggable?: boolean;
}

export interface LofComputationResult {
  k: number;
  n: number;
  /** Matriks jarak Euclidean N x N */
  distMatrix: number[][];
  /** k-distance untuk setiap titik (panjang N) */
  kDistances: number[];
  /** Daftar indeks tetangga N_k(p) untuk setiap titik (termasuk tie bila jarak sama) */
  neighbors: number[][];
  /** Matriks reachability distance N x N: reach-dist_k(i, j) = max(k-distance(j), dist(i, j)) */
  reachDistMatrix: number[][];
  /** Rata-rata reachability distance ke tetangga N_k(p) */
  avgReachDist: number[];
  /** Local Reachability Density (lrd) untuk setiap titik */
  lrd: number[];
  /** Skor LOF mentah untuk setiap titik */
  lof: number[];
  /** Skor LOF dibulatkan 3 desimal */
  lofRounded: number[];
}

const TIE_EPSILON = 1e-12;
const LRD_EPSILON = 1e-10;

/**
 * Fixture 6 titik Tabel IV.1 (k = 2) yang menghasilkan skor LOF:
 * 0,945; 0,945; 1,124; 1,365; 1,365; 7,186 (identik dengan /lof/raw scikit-learn).
 */
export const TABEL_IV_1_POINTS: Array<[number, number]> = [
  [-3.696, -8.464],
  [-2.023, -9.850],
  [-2.070, -8.937],
  [1.736, -9.612],
  [0.883, -9.557],
  [0.729, 5.525],
];

export const TABEL_IV_1_LABELS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'] as const;

export const TABEL_IV_1_EXPECTED_LOF_K2 = [0.945, 0.945, 1.124, 1.365, 1.365, 7.186] as const;

export function euclideanDistance(a: readonly number[], b: readonly number[]): number {
  let sumSq = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = a[i] - b[i];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

/**
 * Hitung seluruh tahapan LOF pada kumpulan titik koordinat.
 */
export function computeLofFull(
  points: ReadonlyArray<ReadonlyArray<number>>,
  kInput = 2
): LofComputationResult {
  const n = points.length;
  if (n === 0) {
    return {
      k: kInput,
      n: 0,
      distMatrix: [],
      kDistances: [],
      neighbors: [],
      reachDistMatrix: [],
      avgReachDist: [],
      lrd: [],
      lof: [],
      lofRounded: [],
    };
  }

  if (n === 1) {
    return {
      k: 1,
      n: 1,
      distMatrix: [[0]],
      kDistances: [0],
      neighbors: [[]],
      reachDistMatrix: [[0]],
      avgReachDist: [0],
      lrd: [1],
      lof: [1],
      lofRounded: [1],
    };
  }

  const k = Math.max(1, Math.min(Math.floor(kInput), n - 1));

  // Langkah 1: Matriks jarak Euclidean N x N
  const distMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = euclideanDistance(points[i], points[j]);
      distMatrix[i][j] = d;
      distMatrix[j][i] = d;
    }
  }

  // Langkah 2: k-distance(p) dan N_k(p) dengan dukungan tie (jarak seri)
  const kDistances: number[] = new Array(n).fill(0);
  const neighbors: number[][] = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    const otherDists: Array<{ idx: number; dist: number }> = [];
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        otherDists.push({ idx: j, dist: distMatrix[i][j] });
      }
    }
    otherDists.sort((a, b) => a.dist - b.dist || a.idx - b.idx);

    const kDist = otherDists[k - 1].dist;
    kDistances[i] = kDist;

    // Masukkan semua titik j != i yang berjarak <= k-distance(i) + TIE_EPSILON
    const nk: number[] = [];
    for (const item of otherDists) {
      if (item.dist <= kDist + TIE_EPSILON) {
        nk.push(item.idx);
      } else {
        break;
      }
    }
    neighbors[i] = nk;
  }

  // Langkah 3: Reachability distance reach-dist_k(i, j) = max(k-distance(j), dist(i, j))
  const reachDistMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        reachDistMatrix[i][j] = Math.max(kDistances[j], distMatrix[i][j]);
      }
    }
  }

  // Langkah 4: Local Reachability Density (lrd)
  const avgReachDist: number[] = new Array(n).fill(0);
  const lrd: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const nk = neighbors[i];
    let sumReach = 0;
    for (const oIdx of nk) {
      sumReach += reachDistMatrix[i][oIdx];
    }
    const meanReach = nk.length > 0 ? sumReach / nk.length : 0;
    avgReachDist[i] = meanReach;
    lrd[i] = 1.0 / (meanReach + LRD_EPSILON);
  }

  // Langkah 5: Skor Local Outlier Factor (LOF)
  const lof: number[] = new Array(n).fill(1);
  const lofRounded: number[] = new Array(n).fill(1);

  for (let i = 0; i < n; i++) {
    const nk = neighbors[i];
    if (nk.length === 0 || lrd[i] <= 0) {
      lof[i] = 1.0;
      lofRounded[i] = 1.0;
      continue;
    }
    let sumNeighborLrd = 0;
    for (const oIdx of nk) {
      sumNeighborLrd += lrd[oIdx];
    }
    const meanNeighborLrd = sumNeighborLrd / nk.length;
    const score = meanNeighborLrd / lrd[i];
    lof[i] = score;
    lofRounded[i] = Math.round(score * 1000) / 1000;
  }

  return {
    k,
    n,
    distMatrix,
    kDistances,
    neighbors,
    reachDistMatrix,
    avgReachDist,
    lrd,
    lof,
    lofRounded,
  };
}

/**
 * Buat dataset awal LOF Playground:
 * - Klaster Padat (8 titik rapat di kiri bawah)
 * - Klaster Renggang (7 titik menyebar di kanan atas)
 * - Titik Uji q (1 titik yang dapat diseret bebas oleh pengguna)
 */
export function createDefaultPlaygroundPoints(): Point2D[] {
  return [
    // Klaster Padat (kiri bawah, sekitar x=2.2, y=2.5, jarak antartitik ~0.35 - 0.55)
    { id: 'C1', label: 'A1', x: 1.9, y: 2.2, cluster: 'padat' },
    { id: 'C2', label: 'A2', x: 2.3, y: 2.1, cluster: 'padat' },
    { id: 'C3', label: 'A3', x: 2.1, y: 2.5, cluster: 'padat' },
    { id: 'C4', label: 'A4', x: 2.5, y: 2.5, cluster: 'padat' },
    { id: 'C5', label: 'A5', x: 1.8, y: 2.7, cluster: 'padat' },
    { id: 'C6', label: 'A6', x: 2.2, y: 2.9, cluster: 'padat' },
    { id: 'C7', label: 'A7', x: 2.6, y: 2.8, cluster: 'padat' },
    { id: 'C8', label: 'A8', x: 2.0, y: 2.4, cluster: 'padat' },

    // Klaster Renggang (kanan atas, sekitar x=7.2, y=6.5, jarak antartitik ~1.3 - 1.8)
    { id: 'S1', label: 'B1', x: 5.8, y: 5.4, cluster: 'renggang' },
    { id: 'S2', label: 'B2', x: 7.3, y: 5.1, cluster: 'renggang' },
    { id: 'S3', label: 'B3', x: 8.6, y: 5.8, cluster: 'renggang' },
    { id: 'S4', label: 'B4', x: 6.4, y: 6.8, cluster: 'renggang' },
    { id: 'S5', label: 'B5', x: 7.8, y: 6.9, cluster: 'renggang' },
    { id: 'S6', label: 'B6', x: 6.9, y: 8.1, cluster: 'renggang' },
    { id: 'S7', label: 'B7', x: 8.5, y: 7.9, cluster: 'renggang' },

    // Titik Uji q yang dapat digeser (awalnya dekat pinggir klaster padat)
    { id: 'Q', label: 'q', x: 3.1, y: 2.6, cluster: 'uji', draggable: true },
  ];
}
