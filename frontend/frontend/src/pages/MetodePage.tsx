import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scaleLinear } from 'd3-scale';
import { fetchMetode, getSnapshotMetode } from '../api/pantau';
import { LofPlayground } from '../components/charts/LofPlayground';
import { CountUp } from '../components/motion/Primitives';
import { Angka } from '../components/ui/Angka';
import { AturanGaris } from '../components/ui/AturanGaris';
import { Button } from '../components/ui/Button';
import { TagKategori } from '../components/ui/TagKategori';
import { useAuth } from '../context/AuthContext';
import {
  computeLofFull,
  TABEL_IV_1_LABELS,
  TABEL_IV_1_POINTS,
} from '../lib/lofEngine';

const STEP_DEFINITIONS = [
  {
    step: 1,
    kode: 'LANGKAH 01',
    judul: 'Matriks Jarak Euclidean d(p, o)',
    rumus: 'd(p, o) = √( (z₁p − z₁o)² + (z₂p − z₂o)² )',
    penjelasan:
      'Menghitung jarak pasangan antartitik pada ruang fitur yang telah dinormalisasi dengan robust z-score bulanan.',
  },
  {
    step: 2,
    kode: 'LANGKAH 02',
    judul: 'Jarak Tetangga ke-k (k-distance) & Himpunan N_k(p)',
    rumus: 'k-distance(p) = d(p, o) untuk tetangga terdekat ke-k (k = 2)',
    penjelasan:
      'Menentukan radius bola terkecil di sekitar titik p yang memuat sedikitnya k = 2 tetangga terdekat (termasuk seluruh titik yang berjarak sama/tie).',
  },
  {
    step: 3,
    kode: 'LANGKAH 03',
    judul: 'Jarak Keterjangkauan (Reachability Distance)',
    rumus: 'reach-dist_k(p, o) = max{ k-distance(o), d(p, o) }',
    penjelasan:
      'Meredam fluktuasi statistik jarak yang terlalu dekat: jarak dari p ke tetangga o dipagari minimal sebesar k-distance milik tetangga o tersebut.',
  },
  {
    step: 4,
    kode: 'LANGKAH 04',
    judul: 'Kepadatan Keterjangkauan Lokal (lrd_k)',
    rumus: 'lrd_k(p) = 1 / ( Σ_{o ∈ N_k(p)} reach-dist_k(p, o) / |N_k(p)| )',
    penjelasan:
      'Kebalikan dari rata-rata jarak keterjangkauan p terhadap seluruh tetangga N_k(p). Nilai lrd tinggi berarti titik berada di lingkungan padat.',
  },
  {
    step: 5,
    kode: 'LANGKAH 05',
    judul: 'Skor Local Outlier Factor (LOF_k)',
    rumus: 'LOF_k(p) = ( Σ_{o ∈ N_k(p)} ( lrd_k(o) / lrd_k(p) ) ) / |N_k(p)|',
    penjelasan:
      'Rasio rata-rata kepadatan tetangga terhadap kepadatan titik itu sendiri. Nilai ≈ 1,00 berarti sepadan dengan tetangga; nilai ≥ 1,50 menandakan kepadatan lokal jauh lebih rendah (pencilan).',
  },
] as const;

export function MetodePage() {
  const { user, token } = useAuth();
  const role = user?.role ?? 'petugas';

  const [activeStep, setActiveStep] = useState<number>(5);

  const initialData = useMemo(() => getSnapshotMetode(), []);

  const { data: metode = initialData } = useQuery({
    queryKey: ['metode', role],
    queryFn: () => fetchMetode(role, token),
    initialData,
    staleTime: 60_000,
  });

  // Perhitungan penuh 6 titik Tabel IV.1 (k = 2) di klien
  const tabelIv1Result = useMemo(() => computeLofFull(TABEL_IV_1_POINTS, 2), []);

  // Ekstraksi data Bab V dari evaluasi_lof
  const sensitivitasK = useMemo(() => {
    const kList = [5, 8, 10, 15];
    return kList.map((kVal) => {
      const ujiKey = `Sensitivitas k=${kVal}`;
      const rows = metode.evaluasi_lof.filter((r) => r.uji === ujiKey);
      const getVal = (ukuran: string, fallback: number) =>
        rows.find((r) => r.ukuran === ukuran)?.nilai ?? fallback;

      return {
        k: kVal,
        jumlah_flag: getVal('jumlah_flag', kVal === 15 ? 24 : kVal === 5 ? 29 : 28),
        spearman: getVal(
          'spearman_vs_k10',
          kVal === 5 ? 0.83 : kVal === 8 ? 0.95 : kVal === 10 ? 1.0 : 0.88
        ),
        jaccard: getVal(
          'jaccard_vs_k10',
          kVal === 5 ? 0.83 : kVal === 8 ? 0.93 : kVal === 10 ? 1.0 : 0.79
        ),
      };
    });
  }, [metode.evaluasi_lof]);

  const recallSintetis = useMemo(() => {
    const rows = metode.evaluasi_lof.filter((r) => r.uji.startsWith('Injeksi sintetis'));
    const findVal = (ukuran: string, fallback: number) =>
      rows.find((r) => r.ukuran === ukuran)?.nilai ?? fallback;

    return {
      keseluruhan: findVal('recall keseluruhan', 0.74),
      items: [
        {
          kode: 'lonjakan_satu_hari',
          label: 'Lonjakan Satu Hari',
          deskripsi: 'Satu hari kerja menyalurkan porsi ekstrem dibanding hari lain',
          recall: findVal('recall lonjakan_satu_hari', 1.0),
          catatan: 'Tertangkap penuh oleh fitur CV harian (z-score variasi tajam).',
        },
        {
          kode: 'pola_seragam',
          label: 'Pola Seragam / Konstan',
          deskripsi: 'Angka penyaluran harian nyaris identik sepanjang bulan',
          recall: findVal('recall pola_seragam', 0.87),
          catatan: 'Tertangkap kuat oleh porsi nilai dominan tinggi & CV mendekati nol.',
        },
        {
          kode: 'volume_x3',
          label: 'Volume ×3 (Skala Murni)',
          deskripsi: 'Seluruh volume harian dikalikan tiga tanpa mengubah bentuk kurva harian',
          recall: findVal('recall volume_x3', 0.35),
          catatan:
            'Hanya menggeser 1 dari 4 fitur (log_total); 3 fitur pola harian tetap normal. Inilah alasan aturan alokasi wajib mendampingi LOF.',
        },
      ],
    };
  }, [metode.evaluasi_lof]);

  // Skala SVG untuk grafik sensitivitas k (Bab V)
  const kChartWidth = 520;
  const kChartHeight = 250;
  const kPad = { top: 24, right: 32, bottom: 44, left: 48 };
  const xScaleK = scaleLinear()
    .domain([4.5, 15.5])
    .range([kPad.left, kChartWidth - kPad.right]);
  const yScaleMetric = scaleLinear()
    .domain([0.65, 1.05])
    .range([kChartHeight - kPad.bottom, kPad.top]);

  const spearmanPath = sensitivitasK
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScaleK(d.k)} ${yScaleMetric(d.spearman)}`)
    .join(' ');
  const jaccardPath = sensitivitasK
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScaleK(d.k)} ${yScaleMetric(d.jaccard)}`)
    .join(' ');

  // Geometri Diagram Perbandingan Klaster Padat (C1) vs Klaster Renggang (C2)
  const diagramC1 = { cx: 102, cy: 104, r: 36 };
  const diagramP1 = { cx: 152, cy: 132, r: 7 };
  const diagramC2 = { cx: 382, cy: 112, r: 74 };
  const diagramP1LabelX = diagramP1.cx - diagramP1.r * 2;
  const diagramP1LabelY = diagramP1.cy + diagramP1.r + 17;
  const diagramP2LabelY = diagramC2.cy + diagramC2.r + 28;
  const svgLabelHaloStyle = {
    paintOrder: 'stroke',
    stroke: 'var(--color-kertas-terang)',
    strokeWidth: 4,
    strokeLinejoin: 'round' as const,
  };

  return (
    <div data-testid="metode-page">
      <div className="space-y-12">
        {/* HEADER EDITORIAL */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-tinta-redup">
              BAGIAN V · METODOLOGI, EVALUASI BAB V &amp; SIMULASI INTERAKTIF
            </p>
            <p className="font-mono text-xs text-tinta-redup">
              RUN ACUAN: <span className="font-medium text-tinta">{metode.parameter.run_nama}</span> ·{' '}
              k = {metode.parameter.k} · BATAS LOF ≥{' '}
              {metode.parameter.threshold.toFixed(2).replace('.', ',')}
            </p>
          </div>

          <h2 className="max-w-4xl font-serif text-3xl font-semibold leading-[1.18] tracking-tight text-tinta sm:text-4xl">
            Mengapa Kepadatan Lokal Dipilih untuk Memprioritaskan Pengawasan Pangkalan LPG 3 kg.
          </h2>

          <p className="max-w-3xl font-sans text-base leading-relaxed text-tinta-lembut">
            Berbeda dari batas ambang tunggal yang menilai pangkalan hanya dari besar kecilnya angka
            tabung, <span className="font-medium text-tinta">Local Outlier Factor (Breunig dkk., 2000)</span>{' '}
            mengukur derajat keterpencilan suatu pangkalan relatif terhadap kepadatan tetangga terdekatnya
            pada bulan yang sama. Halaman ini mendokumentasikan alasan pemilihan metode, penurunan rumus
            langkah demi langkah, evaluasi sensitivitas Bab V, serta keterbatasan operasionalnya.
          </p>
        </section>

        <AturanGaris />

        {/* (a) MENGAPA "LOKAL": KLASTER PADAT VS RENGGANG */}
        <section
          aria-labelledby="heading-mengapa-lokal"
          data-testid="section-mengapa-lokal"
          className="space-y-6"
        >
          <div className="space-y-1.5">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-tinta-redup">
              (A) LANDASAN KONSEPTUAL · KEPADATAN LOKAL VS JARAK GLOBAL
            </span>
            <h3
              id="heading-mengapa-lokal"
              className="font-serif text-2xl font-semibold text-tinta"
            >
              Mengapa &ldquo;Lokal&rdquo;: Klaster Padat vs Klaster Renggang
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-4 font-sans text-sm leading-relaxed text-tinta-lembut lg:col-span-6">
              <p>
                Di Kabupaten Bintan, pangkalan LPG 3 kg tidak berasal dari satu kelompok yang seragam.
                Sebagian besar pangkalan reguler berada dalam{' '}
                <strong className="font-semibold text-tinta">klaster padat</strong> dengan pola harian
                yang sangat mirip, sedangkan sejumlah pangkalan di wilayah kepulauan atau berkuota khusus
                membentuk <strong className="font-semibold text-tinta">klaster renggang</strong> dengan
                variasi alami yang lebih lebar.
              </p>
              <p>
                Pendekatan deteksi pencilan berbasis jarak global (seperti ambang jarak tunggal terhadap
                pusat data) mengalami dilema klasik:
              </p>
              <ul className="space-y-2 border-l-2 border-garis pl-4">
                <li>
                  <span className="font-semibold text-tinta">Jika ambang jarak dibuat sempit:</span>{' '}
                  seluruh anggota klaster renggang keliru ditandai sebagai anomali, padahal jarak
                  antartitik di dalam klaster tersebut memang secara alami renggang.
                </li>
                <li>
                  <span className="font-semibold text-tinta">Jika ambang jarak dibuat longgar:</span>{' '}
                  titik <span className="font-mono font-semibold text-anomali">p₁</span> yang baru saja
                  menyimpang keluar dari pinggiran klaster padat akan lolos dari deteksi karena jarak
                  absolutnya masih lebih kecil daripada jarak antartitik di klaster renggang.
                </li>
              </ul>
              <p>
                LOF menyelesaikan masalah ini dengan membandingkan kepadatan lokal titik{' '}
                <span className="font-mono text-tinta">p</span> (<span className="font-mono">lrd(p)</span>)
                terhadap rata-rata kepadatan <span className="font-mono">k</span> tetangga terdekatnya.
                Titik di tepi klaster padat memiliki tetangga yang sangat rapat sehingga rasio{' '}
                <span className="font-mono font-semibold text-anomali">LOF(p₁) &gt; 1,50</span> langsung
                meningkat tajam.
              </p>
            </div>

            {/* Ilustrasi SVG Kartografis Klaster Padat vs Renggang */}
            <div className="border border-garis bg-kertas-terang p-5 lg:col-span-6">
              <div className="mb-3 flex items-center justify-between border-b border-garis pb-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-tinta-redup">
                  DIAGRAM PERBANDINGAN · KLASTER PADAT VS KLASTER RENGGANG
                </span>
                <span className="font-mono text-[11px] text-tinta-redup">BREUNIG DKK. (2000)</span>
              </div>

              <svg
                viewBox="0 0 520 244"
                className="h-auto w-full"
                role="img"
                aria-label="Diagram perbandingan klaster padat dan klaster renggang pada Local Outlier Factor"
                data-testid="diagram-klaster-lokal-svg"
              >
                {[60, 120, 180].map((y) => (
                  <line
                    key={y}
                    x1={16}
                    y1={y}
                    x2={504}
                    y2={y}
                    stroke="var(--color-garis)"
                    strokeDasharray="2 4"
                    strokeOpacity={0.7}
                  />
                ))}

                {/* Klaster Padat C1 */}
                <circle
                  cx={diagramC1.cx}
                  cy={diagramC1.cy}
                  r={diagramC1.r}
                  fill="none"
                  stroke="var(--color-tinta)"
                  strokeDasharray="3 3"
                  strokeOpacity={0.45}
                  data-testid="diagram-circle-c1"
                />
                <text
                  x={diagramC1.cx}
                  y={diagramC1.cy - diagramC1.r - 12}
                  textAnchor="middle"
                  style={svgLabelHaloStyle}
                  className="fill-tinta font-mono text-[12px] font-semibold uppercase"
                  data-testid="diagram-label-c1"
                >
                  Klaster Padat (C₁)
                </text>
                {[
                  [90, 97],
                  [104, 93],
                  [114, 103],
                  [97, 109],
                  [108, 113],
                  [86, 107],
                  [101, 101],
                ].map(([cx, cy], idx) => (
                  <circle
                    key={`c1-${idx}`}
                    cx={cx}
                    cy={cy}
                    r={4.5}
                    fill="var(--color-tinta)"
                  />
                ))}

                {/* Titik p1: pencilan lokal di dekat klaster padat */}
                <line
                  x1={114}
                  y1={103}
                  x2={diagramP1.cx}
                  y2={diagramP1.cy}
                  stroke="var(--color-anomali)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                <circle
                  cx={diagramP1.cx}
                  cy={diagramP1.cy}
                  r={diagramP1.r}
                  fill="var(--color-anomali)"
                  stroke="var(--color-kertas)"
                  strokeWidth={1.5}
                  data-testid="diagram-point-p1"
                />

                {/* Klaster Renggang C2 */}
                <circle
                  cx={diagramC2.cx}
                  cy={diagramC2.cy}
                  r={diagramC2.r}
                  fill="none"
                  stroke="var(--color-tinta-redup)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                  data-testid="diagram-circle-c2"
                />
                <text
                  x={diagramC2.cx}
                  y={diagramC2.cy - diagramC2.r - 12}
                  textAnchor="middle"
                  style={svgLabelHaloStyle}
                  className="fill-tinta font-mono text-[12px] font-semibold uppercase"
                  data-testid="diagram-label-c2"
                >
                  Klaster Renggang (C₂)
                </text>
                {[
                  [336, 82],
                  [392, 66],
                  [428, 98],
                  [362, 126],
                  [420, 148],
                  [342, 156],
                ].map(([cx, cy], idx) => (
                  <circle
                    key={`c2-${idx}`}
                    cx={cx}
                    cy={cy}
                    r={4.5}
                    fill="var(--color-kertas)"
                    stroke="var(--color-tinta)"
                    strokeWidth={1.75}
                  />
                ))}
                <line
                  x1={362}
                  y1={126}
                  x2={392}
                  y2={66}
                  stroke="var(--color-tinta-redup)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />

                {/* Blok label p1 di bawah titik p1 dan di kiri lingkaran C2 */}
                <text
                  x={diagramP1LabelX}
                  y={diagramP1LabelY}
                  textAnchor="start"
                  style={svgLabelHaloStyle}
                  className="text-[12px]"
                  data-testid="diagram-label-p1"
                >
                  <tspan x={diagramP1LabelX} className="fill-anomali font-mono font-bold">
                    p₁ (LOF = 2,45)
                  </tspan>
                  <tspan x={diagramP1LabelX} dy="1.3em" className="fill-tinta-redup font-sans">
                    Jarak pendek, tetapi jauh
                  </tspan>
                  <tspan x={diagramP1LabelX} dy="1.3em" className="fill-tinta-redup font-sans">
                    lebih renggang dari C₁
                  </tspan>
                </text>

                {/* Label p2 di bawah lingkaran C2 dengan jarak >= 16px dari garis lingkaran */}
                <text
                  x={diagramC2.cx}
                  y={diagramP2LabelY}
                  textAnchor="middle"
                  style={svgLabelHaloStyle}
                  className="fill-tinta font-mono text-[12px]"
                  data-testid="diagram-label-p2"
                >
                  p₂ di dalam C₂ → LOF ≈ 1,02 (Normal Lokal)
                </text>
              </svg>
            </div>
          </div>
        </section>

        <AturanGaris />

        {/* (b) STEPPER 5 LANGKAH CONTOH 6 TITIK TABEL IV.1 (k=2) */}
        <section
          aria-labelledby="heading-stepper-tabel-iv1"
          data-testid="section-stepper-tabel-iv1"
          className="space-y-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1.5">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-tinta-redup">
                (B) PENURUNAN RUMUS · CONTOH 6 TITIK TABEL IV.1 (k = 2)
              </span>
              <h3
                id="heading-stepper-tabel-iv1"
                className="font-serif text-2xl font-semibold text-tinta"
              >
                Stepper 5 Langkah Perhitungan LOF (Tabel IV.1, k = 2)
              </h3>
              <p className="max-w-3xl font-sans text-sm text-tinta-lembut">
                Klik tiap langkah untuk menelusuri bagaimana 6 titik contoh pada Tabel IV.1 dihitung
                secara bertahap mulai dari matriks jarak Euclidean hingga menghasilkan skor LOF akhir{' '}
                <span className="font-mono font-semibold text-tinta">
                  0,945; 0,945; 1,124; 1,365; 1,365; 7,186
                </span>
                .
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="sekunder"
                size="sm"
                onClick={() => setActiveStep((prev) => Math.max(1, prev - 1))}
                disabled={activeStep <= 1}
                data-testid="stepper-prev-btn"
              >
                ← Langkah Sebelumnya
              </Button>
              <Button
                variant="sekunder"
                size="sm"
                onClick={() => setActiveStep((prev) => Math.min(5, prev + 1))}
                disabled={activeStep >= 5}
                data-testid="stepper-next-btn"
              >
                Langkah Berikutnya →
              </Button>
            </div>
          </div>

          {/* Pemilih 5 Langkah */}
          <div
            className="grid grid-cols-1 gap-2 sm:grid-cols-5"
            role="tablist"
            aria-label="Langkah perhitungan LOF Tabel IV.1"
          >
            {STEP_DEFINITIONS.map((item) => {
              const isCurrent = activeStep === item.step;
              const isUnlocked = activeStep >= item.step;
              return (
                <button
                  key={item.step}
                  type="button"
                  role="tab"
                  aria-selected={isCurrent}
                  data-testid={`stepper-step-${item.step}`}
                  onClick={() => setActiveStep(item.step)}
                  className={`flex flex-col justify-between border p-3.5 text-left transition-colors cursor-pointer ${
                    isCurrent
                      ? 'border-tinta bg-tinta text-kertas'
                      : isUnlocked
                        ? 'border-garis-tegas bg-kertas-terang text-tinta hover:border-tinta'
                        : 'border-garis bg-kertas text-tinta-redup hover:border-tinta-redup'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em]">
                      {item.kode}
                    </span>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        isCurrent
                          ? 'text-kertas'
                          : isUnlocked
                            ? 'text-anomali'
                            : 'text-tinta-redup'
                      }`}
                    >
                      {isUnlocked ? 'AKTIF' : 'TERKUNCI'}
                    </span>
                  </div>
                  <p className="mt-2 font-serif text-sm font-semibold leading-snug">
                    {item.judul}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Kartu Penjelasan Langkah Aktif */}
          <div className="border border-garis bg-kertas-terang p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-garis pb-3">
              <div>
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-anomali">
                  {STEP_DEFINITIONS[activeStep - 1].kode} DARI 05
                </span>
                <h4 className="font-serif text-xl font-semibold text-tinta">
                  {STEP_DEFINITIONS[activeStep - 1].judul}
                </h4>
              </div>
              <code className="border border-garis bg-kertas px-3 py-1.5 font-mono text-xs text-tinta">
                {STEP_DEFINITIONS[activeStep - 1].rumus}
              </code>
            </div>
            <p className="mt-3 font-sans text-sm leading-relaxed text-tinta-lembut">
              {STEP_DEFINITIONS[activeStep - 1].penjelasan}
            </p>
          </div>

          {/* Tabel Bertahap (Langkah 1 s.d. 5) */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            {/* Matriks Jarak Euclidean (Langkah 1) */}
            <div className="border border-garis bg-kertas-terang p-5 xl:col-span-5">
              <div className="mb-3 flex items-center justify-between border-b border-garis pb-2">
                <span className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-tinta">
                  1. Matriks Jarak Euclidean d(p, o)
                </span>
                <span className="font-mono text-[11px] text-tinta-redup">6 × 6 TITIK</span>
              </div>
              <div className="overflow-x-auto">
                <table
                  className="w-full border-collapse font-mono text-xs tabular-nums"
                  data-testid="tabel-iv1-distance-matrix"
                >
                  <thead>
                    <tr className="border-b border-garis text-left text-[11px] text-tinta-redup">
                      <th className="py-1.5 pr-2">Titik</th>
                      {TABEL_IV_1_LABELS.map((lbl) => (
                        <th key={lbl} className="px-1.5 py-1.5 text-right">
                          {lbl}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-garis/60">
                    {tabelIv1Result.distMatrix.map((row, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-2 font-semibold text-tinta">
                          {TABEL_IV_1_LABELS[i]}{' '}
                          <span className="font-normal text-tinta-redup">
                            ({TABEL_IV_1_POINTS[i][0].toFixed(2).replace('.', ',')};{' '}
                            {TABEL_IV_1_POINTS[i][1].toFixed(2).replace('.', ',')})
                          </span>
                        </td>
                        {row.map((val, j) => {
                          const isNeighbor = tabelIv1Result.neighbors[i]?.includes(j);
                          return (
                            <td
                              key={j}
                              className={`px-1.5 py-1.5 text-right ${
                                i === j
                                  ? 'text-tinta-lembut'
                                  : isNeighbor && activeStep >= 2
                                    ? 'bg-[var(--accent-anomali-bg)] font-semibold text-anomali'
                                    : 'text-tinta'
                              }`}
                            >
                              {val.toFixed(2).replace('.', ',')}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2.5 font-sans text-[11px] text-tinta-redup">
                Sel berwarna oranye karat menandakan 2 tetangga terdekat{' '}
                <span className="font-mono">N₂(p)</span> bagi masing-masing baris.
              </p>
            </div>

            {/* Tabel Muncul Bertahap: Langkah 2 (k-distance), Langkah 3 (reach-dist), Langkah 4 (lrd), Langkah 5 (LOF) */}
            <div className="border border-garis bg-kertas-terang p-5 xl:col-span-7">
              <div className="mb-3 flex items-center justify-between border-b border-garis pb-2">
                <span className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-tinta">
                  2–5. Tabel Hasil Bertahap (Tabel IV.1 · k = 2)
                </span>
                <span className="font-mono text-[11px] text-tinta-redup">
                  LANGKAH AKTIF: {activeStep} / 5
                </span>
              </div>

              <div className="overflow-x-auto">
                <table
                  className="w-full border-collapse text-left text-xs"
                  data-testid="tabel-iv1-progressive-table"
                >
                  <thead>
                    <tr className="border-b border-garis font-mono text-[11px] uppercase tracking-wider text-tinta-redup">
                      <th className="py-2 pr-3">Titik Contoh</th>
                      <th className="px-2 py-2 text-right">
                        Langkah 2: k-dist(p)
                      </th>
                      <th className="px-2 py-2">Langkah 2: N₂(p)</th>
                      <th className="px-2 py-2 text-right">
                        Langkah 3: Rerata reach-dist
                      </th>
                      <th className="px-2 py-2 text-right">
                        Langkah 4: lrd₂(p)
                      </th>
                      <th className="py-2 pl-2 text-right">
                        Langkah 5: LOF₂(p)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-garis/70 font-mono tabular-nums">
                    {TABEL_IV_1_LABELS.map((lbl, idx) => {
                      const kDist = tabelIv1Result.kDistances[idx] ?? 0;
                      const nk = tabelIv1Result.neighbors[idx] ?? [];
                      const avgReach = tabelIv1Result.avgReachDist[idx] ?? 0;
                      const lrdVal = tabelIv1Result.lrd[idx] ?? 0;
                      const lofRound = tabelIv1Result.lofRounded[idx] ?? 1;
                      const isAnomaly = lofRound >= 1.5;

                      return (
                        <tr
                          key={lbl}
                          className={isAnomaly && activeStep >= 5 ? 'bg-[var(--accent-anomali-bg)]' : ''}
                        >
                          <td className="py-2.5 pr-3 font-sans text-xs font-medium text-tinta">
                            {lbl}
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            {activeStep >= 2 ? (
                              <span className="text-tinta">
                                {kDist.toFixed(3).replace('.', ',')}
                              </span>
                            ) : (
                              <span className="text-tinta-lembut">···</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-[11px]">
                            {activeStep >= 2 ? (
                              <span className="text-tinta-lembut">
                                {'{'}
                                {nk.map((nIdx) => TABEL_IV_1_LABELS[nIdx]).join(', ')}
                                {'}'}
                              </span>
                            ) : (
                              <span className="text-tinta-lembut">···</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            {activeStep >= 3 ? (
                              <span className="text-tinta">
                                {avgReach.toFixed(3).replace('.', ',')}
                              </span>
                            ) : (
                              <span className="text-tinta-lembut">···</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            {activeStep >= 4 ? (
                              <span className="text-tinta">
                                {lrdVal.toFixed(3).replace('.', ',')}
                              </span>
                            ) : (
                              <span className="text-tinta-lembut">···</span>
                            )}
                          </td>
                          <td
                            className="py-2.5 pl-2 text-right font-semibold"
                            data-testid={`tabel-iv1-lof-${idx + 1}`}
                          >
                            {activeStep >= 5 ? (
                              <span className={isAnomaly ? 'text-anomali' : 'text-tinta'}>
                                {lofRound.toFixed(3).replace('.', ',')}
                              </span>
                            ) : (
                              <span className="text-tinta-lembut">···</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-garis pt-2.5 font-sans text-xs text-tinta-lembut">
                <span>
                  Titik <strong>T6 (0,73; 5,53)</strong> terpisah jauh di utara sehingga memiliki{' '}
                  <span className="font-mono">lrd₂ = 0,065</span> dan skor akhir{' '}
                  <span className="font-mono font-semibold text-anomali">LOF = 7,186</span>.
                </span>
                <span className="font-mono text-[11px] text-tinta-redup">
                  PARITAS SKLEARN /LOF/RAW: IDENTIK 3 DESIMAL
                </span>
              </div>
            </div>
          </div>
        </section>

        <AturanGaris />

        {/* (c) PARAMETER k=10 DAN BATAS 1,50 BESERTA ALASANNYA */}
        <section
          aria-labelledby="heading-parameter-lof"
          data-testid="section-parameter-lof"
          className="space-y-6"
        >
          <div className="space-y-1.5">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-tinta-redup">
              (C) SPESIFIKASI PARAMETER &amp; EMPAT FITUR PERILAKU
            </span>
            <h3
              id="heading-parameter-lof"
              className="font-serif text-2xl font-semibold text-tinta"
            >
              Parameter k = 10, Batas Ambang 1,50, dan Normalisasi Robust Bulanan
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="border border-garis bg-kertas-terang p-5">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-tinta-redup">
                PARAMETER TETANGGA TERDEKAT
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-serif text-4xl font-semibold text-tinta">
                  k = <CountUp value={metode.parameter.k} decimals={0} />
                </span>
                <span className="font-mono text-xs text-tinta-redup">tetangga lokal / bulan</span>
              </div>
              <p className="mt-3 font-sans text-sm leading-relaxed text-tinta-lembut">
                Setiap bulan terdapat rata-rata <strong>27–28 pangkalan aktif</strong> yang dinilai.
                Nilai <span className="font-mono text-tinta">k = 10</span> (~35% populasi bulanan)
                mengikuti anjuran Breunig dkk. (2000) agar himpunan tetangga mewakili mayoritas
                pangkalan normal tanpa meredam variasi lokal menjadi rata-rata global.
              </p>
            </div>

            <div className="border border-garis bg-kertas-terang p-5">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-tinta-redup">
                AMBANG PENANDAAN ANOMALI
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-serif text-4xl font-semibold text-anomali">
                  LOF ≥ <Angka value={metode.parameter.threshold} decimals={2} />
                </span>
                <span className="font-mono text-xs text-tinta-redup">28 dari 282 obs (9,9%)</span>
              </div>
              <p className="mt-3 font-sans text-sm leading-relaxed text-tinta-lembut">
                Titik di dalam klaster homogen memiliki <span className="font-mono">LOF ≈ 1,00</span>.
                Batas <span className="font-mono text-tinta">1,50</span> berarti kepadatan lokal suatu
                pangkalan sedikitnya <strong>33% lebih renggang</strong> dibanding rata-rata 10 tetangga
                terdekatnya—memisahkan ekor distribusi (10% teratas) untuk prioritas inspeksi lapangan.
              </p>
            </div>

            <div className="border border-garis bg-kertas-terang p-5">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-tinta-redup">
                NORMALISASI ROBUST PER BULAN
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-serif text-2xl font-semibold text-tinta">
                  Median &amp; MAD × 1,4826
                </span>
              </div>
              <p className="mt-3 font-sans text-sm leading-relaxed text-tinta-lembut">
                Keempat fitur distandardisasi secara terpisah di tiap bulan menggunakan{' '}
                <span className="font-mono text-tinta">
                  z = (x − median) / (1,4826 × MAD)
                </span>{' '}
                (dengan fallback simpangan baku bila <span className="font-mono">MAD = 0</span>) agar
                satu pangkalan ekstrem tidak menarik pusat skala dan perbedaan jumlah hari kerja
                antarbulan tidak mencemari skor.
              </p>
            </div>
          </div>

          {/* Tabel 4 Fitur Perilaku */}
          <div className="border border-garis bg-kertas-terang p-5">
            <h4 className="font-serif text-lg font-semibold text-tinta">
              Empat Fitur Perilaku Penyaluran Bulanan (Hari Minggu Dikecualikan)
            </h4>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-garis font-mono text-xs uppercase tracking-wider text-tinta-redup">
                    <th className="py-2 pr-4">Kode Fitur</th>
                    <th className="px-3 py-2">Nama Fitur</th>
                    <th className="px-3 py-2">Rumus Matematis</th>
                    <th className="py-2 pl-3">Tujuan Deteksi Pola</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-garis/70">
                  {metode.parameter.fitur.map((f) => (
                    <tr key={f.kode}>
                      <td className="py-2.5 pr-4 font-mono text-xs font-semibold text-tinta">
                        {f.kode}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-tinta">{f.nama}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-tinta-lembut">{f.rumus}</td>
                      <td className="py-2.5 pl-3 text-tinta-lembut">{f.tujuan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <AturanGaris />

        {/* (d) EVALUASI BAB V SEBAGAI GRAFIK SVG */}
        <section
          aria-labelledby="heading-evaluasi-bab5"
          data-testid="section-evaluasi-bab5"
          className="space-y-6"
        >
          <div className="space-y-1.5">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-tinta-redup">
              (D) EVALUASI TANPA LABEL KEBENARAN LAPANGAN (BAB V)
            </span>
            <h3
              id="heading-evaluasi-bab5"
              className="font-serif text-2xl font-semibold text-tinta"
            >
              Sensitivitas Parameter k dan Recall Injeksi Anomali Sintetis
            </h3>
            <p className="max-w-3xl font-sans text-sm text-tinta-lembut">
              Karena data historis hasil berita acara pemeriksaan lapangan belum tersedia sebagai
              label terawasi, evaluasi Bab V dilakukan melalui dua pengujian kuantitatif: (1)
              kestabilan peringkat dan himpunan flag terhadap variasi <span className="font-mono">k</span>,
              serta (2) daya tangkap (recall) terhadap tiga jenis anomali sintetis yang disuntikkan
              sebanyak 30 pengulangan per bulan.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Grafik 1: Sensitivitas k (Spearman & Jaccard terhadap k=10) */}
            <div
              className="border border-garis bg-kertas-terang p-5 lg:col-span-6"
              data-testid="chart-sensitivitas-k"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-garis pb-2.5">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-tinta-redup">
                    GRAFIK V.1 · STABILITAS PARAMETER TETANGGA
                  </span>
                  <h4 className="font-serif text-lg font-semibold text-tinta">
                    Korelasi Spearman &amp; Indeks Jaccard terhadap k = 10
                  </h4>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="inline-flex items-center gap-1.5 text-tinta">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-tinta" />
                    Spearman (ρ)
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-anomali">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-anomali" />
                    Jaccard Flag
                  </span>
                </div>
              </div>

              <svg
                viewBox={`0 0 ${kChartWidth} ${kChartHeight}`}
                className="h-auto w-full"
                role="img"
                aria-label="Grafik korelasi Spearman dan indeks Jaccard terhadap variasi parameter k=5, 8, 10, dan 15"
              >
                {[0.7, 0.8, 0.9, 1.0].map((tick) => {
                  const y = yScaleMetric(tick);
                  return (
                    <g key={tick}>
                      <line
                        x1={kPad.left}
                        y1={y}
                        x2={kChartWidth - kPad.right}
                        y2={y}
                        stroke="var(--color-garis)"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={kPad.left - 8}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-tinta-redup font-mono text-[10px]"
                      >
                        {tick.toFixed(2).replace('.', ',')}
                      </text>
                    </g>
                  );
                })}

                <line
                  x1={xScaleK(10)}
                  y1={kPad.top}
                  x2={xScaleK(10)}
                  y2={kChartHeight - kPad.bottom}
                  stroke="var(--color-tinta-redup)"
                  strokeDasharray="2 3"
                />

                <path
                  d={spearmanPath}
                  fill="none"
                  stroke="var(--color-tinta)"
                  strokeWidth={2.25}
                />
                <path
                  d={jaccardPath}
                  fill="none"
                  stroke="var(--color-anomali)"
                  strokeWidth={2.25}
                  strokeDasharray="5 3"
                />

                {sensitivitasK.map((d) => {
                  const cx = xScaleK(d.k);
                  const ySp = yScaleMetric(d.spearman);
                  const yJc = yScaleMetric(d.jaccard);
                  return (
                    <g key={d.k}>
                      <text
                        x={cx}
                        y={kChartHeight - 18}
                        textAnchor="middle"
                        className="fill-tinta font-mono text-[11px] font-semibold"
                      >
                        k = {d.k}
                      </text>
                      <text
                        x={cx}
                        y={kChartHeight - 5}
                        textAnchor="middle"
                        className="fill-tinta-redup font-mono text-[9px]"
                      >
                        ({d.jumlah_flag} flag)
                      </text>

                      <circle
                        cx={cx}
                        cy={yJc}
                        r={4.5}
                        fill="var(--color-anomali)"
                        stroke="var(--color-kertas)"
                        strokeWidth={1.5}
                      />
                      <text
                        x={cx}
                        y={yJc + 16}
                        textAnchor="middle"
                        className="fill-anomali font-mono text-[10px] font-semibold"
                      >
                        {d.jaccard.toFixed(2).replace('.', ',')}
                      </text>

                      <circle
                        cx={cx}
                        cy={ySp}
                        r={4.5}
                        fill="var(--color-tinta)"
                        stroke="var(--color-kertas)"
                        strokeWidth={1.5}
                      />
                      <text
                        x={cx}
                        y={ySp - 9}
                        textAnchor="middle"
                        className="fill-tinta font-mono text-[10px] font-semibold"
                      >
                        {d.spearman.toFixed(2).replace('.', ',')}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <p className="mt-2 font-sans text-xs leading-relaxed text-tinta-lembut">
                <strong>Cara membaca:</strong> Pada rentang <span className="font-mono">k = 8</span>{' '}
                hingga <span className="font-mono">k = 10</span>, korelasi peringkat Spearman mencapai{' '}
                <span className="font-mono font-semibold text-tinta">0,95</span> dan kesamaan himpunan
                pangkalan yang ditandai (Jaccard) mencapai{' '}
                <span className="font-mono font-semibold text-anomali">0,93</span>. Artinya, hasil
                prioritas tidak sensitif terhadap perubahan kecil parameter <span className="font-mono">k</span>.
              </p>
            </div>

            {/* Grafik 2: Recall Sintetis per Jenis Anomali */}
            <div
              className="recall-card border border-garis bg-kertas-terang p-5 lg:col-span-6"
              data-testid="chart-recall-sintetis"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-garis pb-2.5">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-tinta-redup">
                    GRAFIK V.2 · UJI INJEKSI SINTETIS (30 PENGULANGAN × 10 BULAN)
                  </span>
                  <h4 className="font-serif text-lg font-semibold text-tinta">
                    Recall Deteksi per Jenis Anomali Sintetis
                  </h4>
                </div>
                <TagKategori kategori="Berulang" compact />
              </div>

              <div className="flex flex-col gap-5 pt-2">
                {recallSintetis.items.map((item) => {
                  const widthPct = Math.round(item.recall * 100);
                  const fillWidthPct = Math.min(100, Math.max(0, item.recall * 100));
                  const isLow = item.recall < 0.5;
                  return (
                    <div
                      key={item.kode}
                      className="recall-row"
                      data-testid={`recall-item-${item.kode}`}
                    >
                      <div className="min-w-0 flex flex-col gap-1.5">
                        <div className="truncate font-serif text-base font-semibold leading-snug text-tinta">
                          {item.label}
                        </div>
                        <p className="line-clamp-2 font-sans text-xs leading-snug text-tinta-redup">
                          {item.deskripsi}
                        </p>
                        <div
                          className="h-4 w-full border border-garis bg-kertas overflow-hidden"
                          role="img"
                          aria-label={`Recall ${item.label}: ${item.recall.toFixed(2).replace('.', ',')}`}
                          data-testid={`recall-bar-track-${item.kode}`}
                        >
                          <div
                            className="h-full"
                            data-testid={`recall-bar-fill-${item.kode}`}
                            style={{
                              width: `${fillWidthPct}%`,
                              backgroundColor: isLow
                                ? 'var(--color-berulang)'
                                : 'var(--color-anomali)',
                            }}
                          />
                        </div>
                        <p className="font-sans text-xs leading-relaxed text-tinta-lembut">
                          {item.catatan}
                        </p>
                      </div>

                      <span
                        data-testid={`recall-value-${item.kode}`}
                        className={`recall-row-value font-mono text-base font-bold tabular-nums leading-snug ${
                          isLow ? 'text-berulang' : 'text-anomali'
                        }`}
                      >
                        {item.recall.toFixed(2).replace('.', ',')} ({widthPct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <AturanGaris />

        {/* PLAYGROUND LOF INTERAKTIF */}
        <section
          aria-labelledby="heading-lof-playground"
          id="playground"
          data-testid="section-lof-playground"
          className="space-y-6"
        >
          <div className="space-y-1.5">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-anomali">
              SIMULASI INTERAKTIF · PEMBEDA UTAMA PRESENTASI
            </span>
            <h3
              id="heading-lof-playground"
              className="font-serif text-2xl font-semibold text-tinta"
            >
              LOF Playground: Geser Titik Uji q dan Amati Perubahan Skor Langsung
            </h3>
            <p className="max-w-3xl font-sans text-sm text-tinta-lembut">
              Seret titik <span className="font-mono font-semibold text-anomali">q</span> di kanvas
              dua dimensi atau gunakan tombol posisi preset. Seluruh tahapan perhitungan (matriks
              jarak, <span className="font-mono">k-distance</span>, tetangga{' '}
              <span className="font-mono">N_k</span> dengan penanganan jarak seri/tie,{' '}
              <span className="font-mono">reach-dist</span>, <span className="font-mono">lrd</span>,
              hingga <span className="font-mono">LOF</span>) dihitung secara langsung di peramban
              menggunakan mesin TypeScript yang identik dengan <span className="font-mono">scikit-learn</span>.
            </p>
          </div>

          <LofPlayground />
        </section>

        <AturanGaris />

        {/* (e) KETERBATASAN, JUJUR DAN RINGKAS */}
        <section
          aria-labelledby="heading-keterbatasan"
          data-testid="section-keterbatasan"
          className="space-y-5"
        >
          <div className="space-y-1.5">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-tinta-redup">
              (E) BATAS INTERPRETASI &amp; ETIKA PENGAWASAN
            </span>
            <h3
              id="heading-keterbatasan"
              className="font-serif text-2xl font-semibold text-tinta"
            >
              Lima Keterbatasan Metode yang Wajib Diperhatikan Tim Monev
            </h3>
            <p className="max-w-3xl font-sans text-sm text-tinta-lembut">
              Agar hasil pemeringkatan digunakan secara proporsional dan bertanggung jawab, setiap
              petugas pengawasan wajib memahami batas kemampuan model berikut:
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {metode.keterbatasan.map((butir, idx) => (
              <div
                key={idx}
                className="flex flex-col justify-between border border-garis bg-kertas-terang p-4"
                data-testid={`keterbatasan-item-${idx + 1}`}
              >
                <div>
                  <span className="font-mono text-xs font-semibold text-anomali">
                    BATAS 0{idx + 1}
                  </span>
                  <p className="mt-2 font-sans text-sm leading-relaxed text-tinta">
                    {butir}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
