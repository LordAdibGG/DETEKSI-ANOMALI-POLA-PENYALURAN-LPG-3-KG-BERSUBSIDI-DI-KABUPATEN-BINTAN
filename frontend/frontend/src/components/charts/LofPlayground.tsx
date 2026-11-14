import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { scaleLinear } from 'd3-scale';
import { motion } from 'motion/react';
import {
  computeLofFull,
  createDefaultPlaygroundPoints,
  euclideanDistance,
  type Point2D,
} from '../../lib/lofEngine';
import { formatIndonesianNumber, usePrefersReducedMotion } from '../motion/Primitives';
import { Button } from '../ui/Button';
import { useTheme } from '../../context/ThemeContext';

export interface ViewBoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PlacedLabel {
  id: string;
  pointLabel: string;
  text: string;
  visible: boolean;
  displaced: boolean;
  dirIndex: number;
  /** Posisi pusat kotak label relatif terhadap titik (dalam piksel layar) */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  /** Kotak pembatas dalam ruang piksel layar 520x520 untuk deteksi irisan */
  screenBox: { x1: number; y1: number; x2: number; y2: number };
}

/** 8 arah mata angin di sekitar titik: N, NE, E, SE, S, SW, W, NW */
const EIGHT_DIRECTIONS: ReadonlyArray<{ readonly dx: number; readonly dy: number; readonly name: string }> = [
  { dx: 0, dy: -1, name: 'N' },
  { dx: Math.SQRT1_2, dy: -Math.SQRT1_2, name: 'NE' },
  { dx: 1, dy: 0, name: 'E' },
  { dx: Math.SQRT1_2, dy: Math.SQRT1_2, name: 'SE' },
  { dx: 0, dy: 1, name: 'S' },
  { dx: -Math.SQRT1_2, dy: Math.SQRT1_2, name: 'SW' },
  { dx: -1, dy: 0, name: 'W' },
  { dx: -Math.SQRT1_2, dy: -Math.SQRT1_2, name: 'NW' },
];

function boxesOverlap(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
  margin = 2.5
): boolean {
  return !(
    a.x2 + margin <= b.x1 ||
    a.x1 - margin >= b.x2 ||
    a.y2 + margin <= b.y1 ||
    a.y1 - margin >= b.y2
  );
}

function boxHitsCircle(
  box: { x1: number; y1: number; x2: number; y2: number },
  cx: number,
  cy: number,
  r: number
): boolean {
  const closestX = Math.max(box.x1, Math.min(cx, box.x2));
  const closestY = Math.max(box.y1, Math.min(cy, box.y2));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < r * r;
}

export function LofPlayground() {
  const reducedMotion = usePrefersReducedMotion();
  const { isDark } = useTheme();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [points, setPoints] = useState<Point2D[]>(() => createDefaultPlaygroundPoints());
  // Titik untuk perhitungan tata letak label: hanya diperbarui saat drag selesai atau titik di-reset
  const [layoutPoints, setLayoutPoints] = useState<Point2D[]>(() => createDefaultPlaygroundPoints());
  const [k, setK] = useState<number>(3);
  const [focusedId, setFocusedId] = useState<string>('Q');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [keyboardFocusedId, setKeyboardFocusedId] = useState<string | null>(null);
  const [isDraggingQ, setIsDraggingQ] = useState<boolean>(false);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [loupeDismissed, setLoupeDismissed] = useState<boolean>(false);

  // Dimensi SVG persegi agar lingkaran k-distance memiliki skala piksel yang seragam pada sumbu X & Y
  const svgSize = 520;
  const pad = 44;
  const plotSize = svgSize - pad * 2; // 432 px untuk domain 0..10 (43,2 px per 1 satuan koordinat)
  const pxPerUnit = plotSize / 10;

  // ViewBox terkontrol {x, y, w, h} + state animasi pegas
  const [viewBox, setViewBox] = useState<ViewBoxRect>({ x: 0, y: 0, w: svgSize, h: svgSize });
  const [animViewBox, setAnimViewBox] = useState<ViewBoxRect>({
    x: 0,
    y: 0,
    w: svgSize,
    h: svgSize,
  });

  // Ref untuk animasi pegas viewBox, rAF drag 60fps, pan latar, dan pinch zoom
  const springRafRef = useRef<number | null>(null);
  const animVbRef = useRef<ViewBoxRect>({ x: 0, y: 0, w: svgSize, h: svgSize });
  const velVbRef = useRef<ViewBoxRect>({ x: 0, y: 0, w: 0, h: 0 });
  const dragRafRef = useRef<number | null>(null);
  const pendingDragDomainRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    startVb: ViewBoxRect;
  } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{
    dist: number;
    midX: number;
    midY: number;
    startVb: ViewBoxRect;
  } | null>(null);

  const xScale = useMemo(() => scaleLinear().domain([0, 10]).range([pad, svgSize - pad]), []);
  const yScale = useMemo(() => scaleLinear().domain([0, 10]).range([svgSize - pad, pad]), []);

  // Sinkronisasi layoutPoints saat tidak sedang drag q
  useEffect(() => {
    if (!isDraggingQ) {
      setLayoutPoints(points);
    }
  }, [points, isDraggingQ]);

  // Animasi pegas untuk viewBox {x, y, w, h} (hormati prefers-reduced-motion & lingkungan uji)
  useEffect(() => {
    const isJsdom =
      typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent ?? '');

    if (reducedMotion || isPanning || isJsdom) {
      if (springRafRef.current !== null) {
        cancelAnimationFrame(springRafRef.current);
        springRafRef.current = null;
      }
      animVbRef.current = viewBox;
      velVbRef.current = { x: 0, y: 0, w: 0, h: 0 };
      setAnimViewBox(viewBox);
      return;
    }

    let lastTime = performance.now();
    const stiffness = 260;
    const damping = 28;

    const tick = (now: number) => {
      const dt = Math.min(0.032, Math.max(0.004, (now - lastTime) / 1000));
      lastTime = now;

      const cur = animVbRef.current;
      const vel = velVbRef.current;

      const keys: Array<keyof ViewBoxRect> = ['x', 'y', 'w', 'h'];
      let maxDelta = 0;
      const nextVb: ViewBoxRect = { ...cur };
      const nextVel: ViewBoxRect = { ...vel };

      for (const key of keys) {
        const disp = cur[key] - viewBox[key];
        const force = -stiffness * disp - damping * vel[key];
        const vNext = vel[key] + force * dt;
        const pNext = cur[key] + vNext * dt;
        nextVel[key] = vNext;
        nextVb[key] = pNext;
        maxDelta = Math.max(maxDelta, Math.abs(viewBox[key] - pNext), Math.abs(vNext) * 0.05);
      }

      if (maxDelta < 0.15) {
        animVbRef.current = viewBox;
        velVbRef.current = { x: 0, y: 0, w: 0, h: 0 };
        setAnimViewBox(viewBox);
        springRafRef.current = null;
        return;
      }

      animVbRef.current = nextVb;
      velVbRef.current = nextVel;
      setAnimViewBox(nextVb);
      springRafRef.current = requestAnimationFrame(tick);
    };

    if (springRafRef.current !== null) {
      cancelAnimationFrame(springRafRef.current);
    }
    springRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (springRafRef.current !== null) {
        cancelAnimationFrame(springRafRef.current);
        springRafRef.current = null;
      }
    };
  }, [viewBox, reducedMotion, isPanning]);

  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
      }
    };
  }, []);

  const coords = useMemo(() => points.map((p) => [p.x, p.y] as const), [points]);
  const lofResult = useMemo(() => computeLofFull(coords, k), [coords, k]);

  const layoutCoords = useMemo(
    () => layoutPoints.map((p) => [p.x, p.y] as const),
    [layoutPoints]
  );
  const layoutLofResult = useMemo(
    () => computeLofFull(layoutCoords, k),
    [layoutCoords, k]
  );

  const colorScale = useMemo(
    () =>
      scaleLinear<string>()
        .domain([0.95, 1.35, 1.5, 3.0])
        .range(
          isDark
            ? ['#F3EFE4', '#6BA3C7', '#F0B429', '#FF6B35']
            : ['#17211C', '#3B6E8F', '#C98A00', '#D9480F']
        )
        .clamp(true),
    [isDark]
  );

  const focusedIdx = useMemo(() => {
    const idx = points.findIndex((p) => p.id === focusedId);
    return idx >= 0 ? idx : points.length - 1;
  }, [points, focusedId]);

  const qIdx = useMemo(() => points.findIndex((p) => p.id === 'Q'), [points]);
  const qPoint = points[qIdx] ?? points[points.length - 1];
  const qLof = lofResult.lof[qIdx] ?? 1;
  const qNeighbors = useMemo(() => lofResult.neighbors[qIdx] ?? [], [lofResult.neighbors, qIdx]);

  const focusedPoint = points[focusedIdx];
  const focusedKDist = lofResult.kDistances[focusedIdx] ?? 0;
  const focusedNeighbors = lofResult.neighbors[focusedIdx] ?? [];
  const focusedLrd = lofResult.lrd[focusedIdx] ?? 0;
  const focusedLof = lofResult.lof[focusedIdx] ?? 1;

  // Tingkat zoom saat ini (1x .. 10x) dan faktor counter-scale agar elemen tetap berukuran piksel layar
  const targetZoom = useMemo(() => svgSize / viewBox.w, [viewBox.w]);
  const renderZoom = useMemo(() => svgSize / animViewBox.w, [animViewBox.w]);
  const invScale = useMemo(() => animViewBox.w / svgSize, [animViewBox.w]);
  const isFullView = targetZoom < 1.08;

  // Hitung pusat dan bounding box Klaster Padat (A1-A8) langsung dari data (tanpa hardcode koordinat)
  const denseClusterStats = useMemo(() => {
    const densePts = points.filter((p) => p.cluster === 'padat' || p.label.startsWith('A'));
    if (densePts.length === 0) {
      return {
        centerX: 2.2,
        centerY: 2.5,
        minX: 1.8,
        maxX: 2.6,
        minY: 2.1,
        maxY: 2.9,
        targetVb: { x: 0, y: 0, w: svgSize, h: svgSize },
      };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let sumX = 0;
    let sumY = 0;

    for (const p of densePts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      sumX += p.x;
      sumY += p.y;
    }

    const centerX = sumX / densePts.length;
    const centerY = sumY / densePts.length;

    const svgMinX = xScale(minX);
    const svgMaxX = xScale(maxX);
    const svgMinY = yScale(maxY);
    const svgMaxY = yScale(minY);

    const rawW = Math.max(1, svgMaxX - svgMinX);
    const rawH = Math.max(1, svgMaxY - svgMinY);
    const rawSpan = Math.max(rawW, rawH);

    // Bounding box A1-A8 + ruang label tepi + padding 25% di sekelilingnya (menghasilkan zoom ~4,0x)
    const labelMarginSvg = rawSpan * 2.009259;
    const paddedSpan = (rawSpan + labelMarginSvg) * 1.25;
    const w = Math.max(svgSize / 10, Math.min(svgSize, Math.round(paddedSpan * 10) / 10));
    const h = w;
    const cx = (svgMinX + svgMaxX) / 2;
    const cy = (svgMinY + svgMaxY) / 2;
    const x = Math.max(0, Math.min(svgSize - w, cx - w / 2));
    const y = Math.max(0, Math.min(svgSize - h, cy - h / 2));

    return {
      centerX,
      centerY,
      minX,
      maxX,
      minY,
      maxY,
      targetVb: { x, y, w, h },
    };
  }, [points, xScale, yScale]);

  const distQToDenseCenter = useMemo(
    () =>
      euclideanDistance(
        [qPoint.x, qPoint.y],
        [denseClusterStats.centerX, denseClusterStats.centerY]
      ),
    [qPoint.x, qPoint.y, denseClusterStats.centerX, denseClusterStats.centerY]
  );

  // Loupe tampil saat tampilan penuh dan jarak q ke pusat klaster padat > 2 satuan
  const showLoupe = isFullView && distQToDenseCenter > 2.0 && !loupeDismissed;

  // Fungsi utilitas zoom & pan terkontrol (1x - 10x)
  const applyZoomAtRatio = useCallback(
    (factor: number, rx = 0.5, ry = 0.5) => {
      const clampedRx = Math.max(0, Math.min(1, rx));
      const clampedRy = Math.max(0, Math.min(1, ry));
      setViewBox((prev) => {
        const minW = svgSize / 10; // maks zoom 10x
        const maxW = svgSize; // min zoom 1x
        const nextW = Math.max(minW, Math.min(maxW, prev.w / factor));
        const nextH = nextW;
        const focusSvgX = prev.x + clampedRx * prev.w;
        const focusSvgY = prev.y + clampedRy * prev.h;
        const nextX = Math.max(0, Math.min(svgSize - nextW, focusSvgX - clampedRx * nextW));
        const nextY = Math.max(0, Math.min(svgSize - nextH, focusSvgY - clampedRy * nextH));
        return { x: nextX, y: nextY, w: nextW, h: nextH };
      });
    },
    [svgSize]
  );

  const panByRatio = useCallback(
    (dxRatio: number, dyRatio: number) => {
      setViewBox((prev) => {
        const nextX = Math.max(0, Math.min(svgSize - prev.w, prev.x + dxRatio * prev.w));
        const nextY = Math.max(0, Math.min(svgSize - prev.h, prev.y + dyRatio * prev.h));
        return { ...prev, x: nextX, y: nextY };
      });
    },
    [svgSize]
  );

  const handleZoomDenseCluster = useCallback(() => {
    setViewBox(denseClusterStats.targetVb);
  }, [denseClusterStats.targetVb]);

  const handleZoomFull = useCallback(() => {
    setViewBox({ x: 0, y: 0, w: svgSize, h: svgSize });
  }, [svgSize]);

  // Wheel zoom berpusat pada kursor (1x - 10x)
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svgEl.getBoundingClientRect();
      const rx = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
      const ry = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5;
      const factor = e.deltaY < 0 ? 1.25 : 1 / 1.25;
      applyZoomAtRatio(factor, rx, ry);
    };

    svgEl.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      svgEl.removeEventListener('wheel', onWheel);
    };
  }, [applyZoomAtRatio]);

  const movePointQ = useCallback(
    (nextX: number, nextY: number, immediateLayout = true) => {
      const clampedX = Math.round(Math.min(9.6, Math.max(0.4, nextX)) * 100) / 100;
      const clampedY = Math.round(Math.min(9.6, Math.max(0.4, nextY)) * 100) / 100;
      setPoints((prev) => {
        const next = prev.map((p) => (p.id === 'Q' ? { ...p, x: clampedX, y: clampedY } : p));
        if (immediateLayout) {
          setLayoutPoints(next);
        }
        return next;
      });
      setFocusedId('Q');
    },
    []
  );

  const scheduleMovePointQ = useCallback(
    (domainX: number, domainY: number) => {
      pendingDragDomainRef.current = { x: domainX, y: domainY };
      if (dragRafRef.current !== null) return;
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = null;
        const pending = pendingDragDomainRef.current;
        if (!pending) return;
        movePointQ(pending.x, pending.y, false);
      });
    },
    [movePointQ]
  );

  const clientToDomain = useCallback(
    (clientX: number, clientY: number) => {
      const svgEl = svgRef.current;
      if (!svgEl) return null;
      const rect = svgEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const vb = animVbRef.current;
      const svgX = vb.x + ((clientX - rect.left) / rect.width) * vb.w;
      const svgY = vb.y + ((clientY - rect.top) / rect.height) * vb.h;
      return {
        domainX: xScale.invert(svgX),
        domainY: yScale.invert(svgY),
      };
    },
    [xScale, yScale]
  );

  const handlePointerDownQ = (e: PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setIsDraggingQ(true);
    setFocusedId('Q');
  };

  const handlePointerDownSvgBackground = (e: PointerEvent<SVGSVGElement>) => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Jika 2 jari menyentuh layar -> inisialisasi pinch zoom
    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      pinchStartRef.current = {
        dist: Math.max(10, dist),
        midX,
        midY,
        startVb: viewBox,
      };
      panStartRef.current = null;
      setIsPanning(true);
      return;
    }

    // Drag latar untuk menggeser viewBox (pan)
    if (e.target === svgEl || (e.target as Element).getAttribute('data-pan-surface') === 'true') {
      svgEl.setPointerCapture?.(e.pointerId);
      panStartRef.current = {
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        startVb: viewBox,
      };
      setIsPanning(true);
    }
  };

  const handlePointerMoveSvg = (e: PointerEvent<SVGSVGElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (isDraggingQ) {
      const dom = clientToDomain(e.clientX, e.clientY);
      if (dom) {
        scheduleMovePointQ(dom.domainX, dom.domainY);
      }
      return;
    }

    // Pinch zoom 2 jari
    if (activePointersRef.current.size === 2 && pinchStartRef.current && svgRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const newDist = Math.max(10, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
      const scaleFactor = newDist / pinchStartRef.current.dist;
      const rect = svgRef.current.getBoundingClientRect();
      const rx =
        rect.width > 0 ? (pinchStartRef.current.midX - rect.left) / rect.width : 0.5;
      const ry =
        rect.height > 0 ? (pinchStartRef.current.midY - rect.top) / rect.height : 0.5;
      const startVb = pinchStartRef.current.startVb;
      const nextW = Math.max(svgSize / 10, Math.min(svgSize, startVb.w / scaleFactor));
      const nextH = nextW;
      const focusX = startVb.x + rx * startVb.w;
      const focusY = startVb.y + ry * startVb.h;
      const nextX = Math.max(0, Math.min(svgSize - nextW, focusX - rx * nextW));
      const nextY = Math.max(0, Math.min(svgSize - nextH, focusY - ry * nextH));
      setViewBox({ x: nextX, y: nextY, w: nextW, h: nextH });
      return;
    }

    // Geser latar (pan)
    if (panStartRef.current && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const widthPx = rect.width > 0 ? rect.width : svgSize;
      const heightPx = rect.height > 0 ? rect.height : svgSize;
      const dxClient = e.clientX - panStartRef.current.clientX;
      const dyClient = e.clientY - panStartRef.current.clientY;
      const startVb = panStartRef.current.startVb;
      const dxSvg = (dxClient / widthPx) * startVb.w;
      const dySvg = (dyClient / heightPx) * startVb.h;
      const nextX = Math.max(0, Math.min(svgSize - startVb.w, startVb.x - dxSvg));
      const nextY = Math.max(0, Math.min(svgSize - startVb.h, startVb.y - dySvg));
      setViewBox({ ...startVb, x: nextX, y: nextY });
    }
  };

  const handlePointerUpSvg = (e: PointerEvent<SVGSVGElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchStartRef.current = null;
    }
    if (isDraggingQ) {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      if (pendingDragDomainRef.current) {
        movePointQ(pendingDragDomainRef.current.x, pendingDragDomainRef.current.y, true);
        pendingDragDomainRef.current = null;
      } else {
        setLayoutPoints(points);
      }
      setIsDraggingQ(false);
    }
    if (panStartRef.current || isPanning) {
      panStartRef.current = null;
      setIsPanning(false);
    }
  };

  // Sumbu dan grid dinamis menyesuaikan viewBox & tingkat zoom (1 desimal saat zoom tinggi)
  const axisTicks = useMemo(() => {
    const domX0 = Math.max(0, Math.min(10, xScale.invert(animViewBox.x)));
    const domX1 = Math.max(0, Math.min(10, xScale.invert(animViewBox.x + animViewBox.w)));
    const domY0 = Math.max(0, Math.min(10, yScale.invert(animViewBox.y + animViewBox.h)));
    const domY1 = Math.max(0, Math.min(10, yScale.invert(animViewBox.y)));

    const step = renderZoom >= 5 ? 0.2 : renderZoom >= 2.2 ? 0.5 : renderZoom >= 1.4 ? 1 : 2;
    const decimals = step < 1 || renderZoom >= 2.2 ? 1 : 0;

    const xTicks: number[] = [];
    const startX = Math.ceil((Math.min(domX0, domX1) - 1e-6) / step) * step;
    const endX = Math.max(domX0, domX1) + 1e-6;
    for (let v = startX; v <= endX; v += step) {
      const rounded = Math.round(v * 100) / 100;
      if (rounded >= 0 && rounded <= 10) {
        xTicks.push(rounded);
      }
    }

    const yTicks: number[] = [];
    const startY = Math.ceil((Math.min(domY0, domY1) - 1e-6) / step) * step;
    const endY = Math.max(domY0, domY1) + 1e-6;
    for (let v = startY; v <= endY; v += step) {
      const rounded = Math.round(v * 100) / 100;
      if (rounded >= 0 && rounded <= 10) {
        yTicks.push(rounded);
      }
    }

    return { xTicks, yTicks, decimals };
  }, [animViewBox, renderZoom, xScale, yScale]);

  // Algoritma penempatan label cerdas (8 arah + collision avoidance + leader line)
  // Hanya dihitung ulang saat viewBox/zoom berubah atau drag selesai (layoutPoints)
  const labelPlacements = useMemo(() => {
    const showFullScore = targetZoom >= 3.0;
    const vb = viewBox;

    const toScreenX = (domX: number) => ((xScale(domX) - vb.x) / vb.w) * svgSize;
    const toScreenY = (domY: number) => ((yScale(domY) - vb.y) / vb.h) * svgSize;

    const screenPts = layoutPoints.map((pt, idx) => {
      const score = layoutLofResult.lof[idx] ?? 1;
      const isQ = pt.id === 'Q';
      const radius = isQ ? 9 : Math.min(10, Math.max(5, 4 + (score - 0.9) * 2.2));
      return {
        pt,
        idx,
        score,
        isQ,
        radius,
        sx: toScreenX(pt.x),
        sy: toScreenY(pt.y),
      };
    });

    const denseCx = toScreenX(denseClusterStats.centerX);
    const denseCy = toScreenY(denseClusterStats.centerY);

    // Urutan prioritas penempatan: 1. Titik Q (wajib di atas & tak tertutup), 2. Titik fokus, 3. Klaster renggang & tepi luar klaster padat
    const priorityOrder = [...screenPts].sort((a, b) => {
      if (a.isQ) return -1;
      if (b.isQ) return 1;
      if (a.pt.id === focusedId) return -1;
      if (b.pt.id === focusedId) return 1;
      const distA = Math.hypot(a.sx - denseCx, a.sy - denseCy);
      const distB = Math.hypot(b.sx - denseCx, b.sy - denseCy);
      return distB - distA;
    });

    const placedBoxes: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    // Jika Loupe aktif di pojok kiri bawah pada tampilan penuh, daftarkan area Loupe agar label plot utama tidak bertabrakan dengan bingkai Loupe
    if (showLoupe) {
      placedBoxes.push({
        x1: 0,
        y1: svgSize - 248,
        x2: 248,
        y2: svgSize,
      });
    }
    const resultMap = new Map<string, PlacedLabel>();

    for (const item of priorityOrder) {
      const { pt, score, radius, sx, sy } = item;
      const text = showFullScore
        ? `${pt.label} (${formatIndonesianNumber(score, 2)})`
        : pt.label;

      // Lebar & tinggi kotak latar label dalam piksel layar (font 10,5px monospace + padding)
      const boxW = Math.ceil(text.length * 6.8 + 10);
      const boxH = 17;

      // Jika titik berada di luar jendela viewBox aktif, sembunyikan labelnya
      if (sx < -20 || sx > svgSize + 20 || sy < -20 || sy > svgSize + 20) {
        resultMap.set(pt.id, {
          id: pt.id,
          pointLabel: pt.label,
          text,
          visible: false,
          displaced: false,
          dirIndex: 0,
          offsetX: 0,
          offsetY: -radius - 11,
          width: boxW,
          height: boxH,
          screenBox: { x1: sx, y1: sy, x2: sx, y2: sy },
        });
        continue;
      }

      // Untuk titik klaster padat, prioritaskan arah yang menjauhi pusat klaster agar leader line rapi
      const isDense = pt.cluster === 'padat' || pt.label.startsWith('A');
      const outwardAngle = Math.atan2(sy - denseCy, sx - denseCx);

      const dirCandidates = EIGHT_DIRECTIONS.map((d, dirIdx) => {
        const dirAngle = Math.atan2(d.dy, d.dx);
        let angleDiff = Math.abs(dirAngle - outwardAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        // Untuk titik biasa yang tidak berdesakan, arah N (atas, dirIdx=0) diutamakan
        const preferenceScore = isDense && !showFullScore ? angleDiff : dirIdx === 0 ? -1 : dirIdx * 0.2 + angleDiff * 0.3;
        return { ...d, dirIdx, preferenceScore };
      }).sort((a, b) => a.preferenceScore - b.preferenceScore);

      // Coba jarak dekat (tanpa/minim leader line) lalu jarak sedikit lebih jauh (dengan leader line)
      const radialSteps = isDense ? [6, 17, 29] : [6, 16];

      let chosen: PlacedLabel | null = null;

      for (const gap of radialSteps) {
        if (chosen) break;
        for (const cand of dirCandidates) {
          const halfDiag =
            Math.abs(cand.dx) * (boxW / 2) + Math.abs(cand.dy) * (boxH / 2);
          const distCenter = radius + gap + halfDiag;
          const offX = cand.dx * distCenter;
          const offY = cand.dy * distCenter;
          const cxBox = sx + offX;
          const cyBox = sy + offY;

          const screenBox = {
            x1: cxBox - boxW / 2,
            y1: cyBox - boxH / 2,
            x2: cxBox + boxW / 2,
            y2: cyBox + boxH / 2,
          };

          // Pastikan berada di dalam kanvas SVG
          if (
            screenBox.x1 < 6 ||
            screenBox.x2 > svgSize - 6 ||
            screenBox.y1 < 6 ||
            screenBox.y2 > svgSize - 6
          ) {
            continue;
          }

          // Cek tumpang tindih dengan seluruh titik (terutama titik q tidak boleh tertutup label)
          let hitsPoint = false;
          for (const otherPt of screenPts) {
            const safeRadius = otherPt.isQ ? otherPt.radius + 5 : otherPt.radius + 2.5;
            if (boxHitsCircle(screenBox, otherPt.sx, otherPt.sy, safeRadius)) {
              hitsPoint = true;
              break;
            }
          }
          if (hitsPoint) continue;

          // Cek tumpang tindih dengan label lain yang sudah ditempatkan
          let hitsLabel = false;
          for (const existing of placedBoxes) {
            if (boxesOverlap(screenBox, existing, 3)) {
              hitsLabel = true;
              break;
            }
          }
          if (hitsLabel) continue;

          chosen = {
            id: pt.id,
            pointLabel: pt.label,
            text,
            visible: true,
            displaced: gap > 8 || cand.dirIdx !== 0,
            dirIndex: cand.dirIdx,
            offsetX: offX,
            offsetY: offY,
            width: boxW,
            height: boxH,
            screenBox,
          };
          break;
        }
      }

      if (chosen) {
        placedBoxes.push(chosen.screenBox);
        resultMap.set(pt.id, chosen);
      } else {
        // Tidak ada ruang bebas tumpang tindih di 8 arah -> sembunyikan label (tampil saat hover)
        resultMap.set(pt.id, {
          id: pt.id,
          pointLabel: pt.label,
          text,
          visible: false,
          displaced: false,
          dirIndex: 0,
          offsetX: 0,
          offsetY: -radius - 12,
          width: boxW,
          height: boxH,
          screenBox: {
            x1: sx - boxW / 2,
            y1: sy - radius - 12 - boxH / 2,
            x2: sx + boxW / 2,
            y2: sy - radius - 12 + boxH / 2,
          },
        });
      }
    }

    return resultMap;
  }, [layoutPoints, layoutLofResult.lof, viewBox, targetZoom, denseClusterStats.centerX, denseClusterStats.centerY, focusedId, showLoupe, xScale, yScale]);

  // Titik untuk ditampilkan di tooltip saat hover atau fokus keyboard
  const activeTooltipId = hoveredId ?? keyboardFocusedId;
  const tooltipData = useMemo(() => {
    if (!activeTooltipId) return null;
    const idx = points.findIndex((p) => p.id === activeTooltipId);
    if (idx < 0) return null;
    const pt = points[idx];
    return {
      pt,
      idx,
      kDist: lofResult.kDistances[idx] ?? 0,
      lrd: lofResult.lrd[idx] ?? 0,
      lof: lofResult.lof[idx] ?? 1,
      neighbors: lofResult.neighbors[idx] ?? [],
      isNeighborOfQ: qNeighbors.includes(idx),
    };
  }, [activeTooltipId, points, lofResult, qNeighbors]);

  // Urutan penggambaran titik: titik non-Q terlebih dahulu, titik Q selalu paling atas
  const orderedPointsForRender = useMemo(() => {
    const nonQ = points
      .map((pt, idx) => ({ pt, idx }))
      .filter((item) => item.pt.id !== 'Q');
    const qItem = points
      .map((pt, idx) => ({ pt, idx }))
      .find((item) => item.pt.id === 'Q');
    return qItem ? [...nonQ, qItem] : nonQ;
  }, [points]);

  // Skala dan penempatan untuk Loupe (kaca pembesar klaster padat 220x180 px)
  const loupeConfig = useMemo(() => {
    const width = 220;
    const height = 148;
    const padX = 24;
    const padY = 18;
    const domMinX = denseClusterStats.minX - 0.35;
    const domMaxX = denseClusterStats.maxX + 0.35;
    const domMinY = denseClusterStats.minY - 0.35;
    const domMaxY = denseClusterStats.maxY + 0.35;

    const lx = scaleLinear()
      .domain([domMinX, domMaxX])
      .range([padX, width - padX]);
    const ly = scaleLinear()
      .domain([domMinY, domMaxY])
      .range([height - padY, padY]);

    const denseItems = points
      .map((pt, idx) => ({ pt, idx, score: lofResult.lof[idx] ?? 1 }))
      .filter((item) => item.pt.cluster === 'padat' || item.pt.label.startsWith('A'));

    const qInLoupe =
      qPoint.x >= domMinX &&
      qPoint.x <= domMaxX &&
      qPoint.y >= domMinY &&
      qPoint.y <= domMaxY;

    return {
      width,
      height,
      lx,
      ly,
      denseItems,
      qInLoupe,
    };
  }, [denseClusterStats, points, lofResult.lof, qPoint]);

  return (
    <div
      data-testid="lof-playground"
      className="border-2 border-[var(--border-strong)] bg-[var(--surface-paper)] p-5 sm:p-6"
    >
      {/* Kepala Playground */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-[var(--border-rule)] pb-4 mb-5">
        <div>
          <div className="font-tabular text-xs uppercase tracking-[0.15em] text-[var(--accent-anomali-teks)] font-semibold mb-1">
            Simulasi Interaktif di Klien (TypeScript) · Tanpa Beban Server
          </div>
          <h3 className="font-editorial text-2xl sm:text-3xl font-bold text-[var(--text-ink)]">
            LOF Playground: Dua Klaster Berbeda Kepadatan & Titik Uji <em>q</em>
          </h3>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1 max-w-3xl leading-relaxed">
            Geser titik <strong className="font-tabular text-[var(--text-ink)]">q</strong> pada
            bidang 2D atau gunakan tombol posisi uji untuk mengamati perubahan lingkaran{' '}
            <span className="font-tabular">k-distance</span>, tetangga{' '}
            <span className="font-tabular">N_k(q)</span>, kepadatan lokal{' '}
            <span className="font-tabular">lrd</span>, dan skor{' '}
            <span className="font-tabular">LOF</span> secara langsung.
          </p>
        </div>

        {/* Kontrol Slider k & Reset */}
        <div className="flex flex-wrap items-center gap-4 font-tabular text-xs shrink-0">
          <div className="border border-[var(--border-strong)] bg-[var(--surface-subtle)]/50 px-3.5 py-2">
            <div className="flex items-center justify-between gap-4 mb-1">
              <label htmlFor="playground-slider-k" className="uppercase font-semibold">
                Tetangga (k):
              </label>
              <strong data-testid="playground-k-value" className="text-sm text-[var(--accent-anomali-teks)]">
                k = {k}
              </strong>
            </div>
            <input
              id="playground-slider-k"
              data-testid="playground-slider-k"
              type="range"
              min={2}
              max={8}
              step={1}
              value={k}
              onChange={(e) => setK(Number.parseInt(e.target.value, 10))}
              className="w-36 accent-[#D9480F] cursor-pointer"
            />
          </div>

          <Button
            variant="sekunder"
            size="sm"
            onClick={() => {
              const defaults = createDefaultPlaygroundPoints();
              setPoints(defaults);
              setLayoutPoints(defaults);
              setK(3);
              setFocusedId('Q');
              setViewBox({ x: 0, y: 0, w: svgSize, h: svgSize });
              setLoupeDismissed(false);
            }}
          >
            Reset Titik
          </Button>
        </div>
      </div>

      {/* Tombol Posisi Uji Cepat untuk Demonstrasi Argumentasi LOF */}
      <div className="flex flex-wrap items-center gap-2 mb-5 font-tabular text-xs">
        <span className="text-[var(--text-muted)] uppercase tracking-wider mr-1">
          Pindahkan titik q ke:
        </span>
        <button
          type="button"
          data-testid="preset-q-dalam-padat"
          onClick={() => movePointQ(2.2, 2.5)}
          className="px-2.5 py-1 border border-[var(--border-rule)] bg-[var(--surface-subtle)]/40 hover:border-[var(--border-strong)] cursor-pointer"
        >
          1. Dalam Klaster Padat (2,2 ; 2,5)
        </button>
        <button
          type="button"
          data-testid="preset-q-pinggir-padat"
          onClick={() => movePointQ(3.4, 2.6)}
          className="px-2.5 py-1 border border-[var(--border-rule)] bg-[var(--surface-subtle)]/40 hover:border-[var(--border-strong)] cursor-pointer"
        >
          2. Menjauhi Klaster Padat (3,4 ; 2,6)
        </button>
        <button
          type="button"
          data-testid="preset-q-jauh-padat"
          onClick={() => movePointQ(4.4, 1.8)}
          className="px-2.5 py-1 border border-[#D9480F] bg-[var(--accent-anomali-bg)] text-[var(--accent-anomali-teks)] font-semibold cursor-pointer"
        >
          3. Pencilan Jauh dari Padat (4,4 ; 1,8)
        </button>
        <button
          type="button"
          data-testid="preset-q-dalam-renggang"
          onClick={() => movePointQ(7.2, 6.4)}
          className="px-2.5 py-1 border border-[var(--border-rule)] bg-[var(--surface-subtle)]/40 hover:border-[var(--border-strong)] cursor-pointer"
        >
          4. Dalam Klaster Renggang (7,2 ; 6,4)
        </button>
      </div>

      {/* Grid Utama: Kanvas Scatter 2D (Kiri) + Rincian Matematika Titik Terpilih (Kanan) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Kolom Kiri: Kontrol Zoom/Pan + Kanvas SVG + Tabel Ringkas & Tabel Alternatif */}
        <div className="lg:col-span-7 space-y-3">
          <div className="border border-[var(--border-strong)] bg-[var(--surface-subtle)]/25 p-3">
            {/* Bilah Kontrol Zoom & Pan */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[var(--border-rule)] font-tabular text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-testid="btn-zoom-klaster-padat"
                  onClick={handleZoomDenseCluster}
                  className="px-2.5 py-1 border border-[var(--border-strong)] bg-[var(--surface-paper)] hover:bg-[var(--text-ink)] hover:text-[var(--surface-paper)] font-semibold cursor-pointer transition-colors"
                >
                  Perbesar Klaster Padat
                </button>
                <button
                  type="button"
                  data-testid="btn-zoom-penuh"
                  onClick={handleZoomFull}
                  disabled={isFullView}
                  className="px-2.5 py-1 border border-[var(--border-rule)] bg-[var(--surface-paper)] hover:border-[var(--border-strong)] disabled:opacity-45 cursor-pointer transition-colors"
                >
                  Tampilan Penuh
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <span
                  data-testid="playground-zoom-indicator"
                  className="px-2 py-0.5 border border-[var(--border-rule)] bg-[var(--surface-paper)] text-[11px] text-[var(--text-muted)]"
                >
                  Zoom: <strong className="text-[var(--text-ink)]">{formatIndonesianNumber(targetZoom, 1)}×</strong>
                </span>
                <button
                  type="button"
                  data-testid="btn-zoom-in"
                  aria-label="Perbesar plot (+)"
                  onClick={() => applyZoomAtRatio(1.4, 0.5, 0.5)}
                  disabled={targetZoom >= 9.9}
                  className="w-7 h-7 flex items-center justify-center border border-[var(--border-rule)] bg-[var(--surface-paper)] hover:border-[var(--border-strong)] font-bold cursor-pointer disabled:opacity-40"
                >
                  +
                </button>
                <button
                  type="button"
                  data-testid="btn-zoom-out"
                  aria-label="Perkecil plot (-)"
                  onClick={() => applyZoomAtRatio(1 / 1.4, 0.5, 0.5)}
                  disabled={isFullView}
                  className="w-7 h-7 flex items-center justify-center border border-[var(--border-rule)] bg-[var(--surface-paper)] hover:border-[var(--border-strong)] font-bold cursor-pointer disabled:opacity-40"
                >
                  −
                </button>
              </div>
            </div>

            {/* Pembungkus Relatif untuk SVG, Tooltip Hover/Fokus, dan Loupe Inset */}
            <div className="relative">
              <svg
                ref={svgRef}
                viewBox={`${animViewBox.x} ${animViewBox.y} ${animViewBox.w} ${animViewBox.h}`}
                data-viewbox={`${viewBox.x.toFixed(1)} ${viewBox.y.toFixed(1)} ${viewBox.w.toFixed(1)} ${viewBox.h.toFixed(1)}`}
                data-zoom={targetZoom.toFixed(2)}
                role="group"
                tabIndex={0}
                aria-label="Bidang scatter 2D LOF Playground dengan dua klaster berbeda kepadatan dan titik q yang dapat digeser. Gunakan scroll atau tombol + dan - untuk zoom, tombol panah untuk menggeser tampilan, atau Tab ke titik q untuk menggeser titik uji."
                onPointerDown={handlePointerDownSvgBackground}
                onPointerMove={handlePointerMoveSvg}
                onPointerUp={handlePointerUpSvg}
                onPointerLeave={handlePointerUpSvg}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === '+' || e.key === '=') {
                    e.preventDefault();
                    applyZoomAtRatio(1.35, 0.5, 0.5);
                  } else if (e.key === '-' || e.key === '_') {
                    e.preventDefault();
                    applyZoomAtRatio(1 / 1.35, 0.5, 0.5);
                  } else if (e.key === '0') {
                    e.preventDefault();
                    handleZoomFull();
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    panByRatio(-0.15, 0);
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    panByRatio(0.15, 0);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    panByRatio(0, -0.15);
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    panByRatio(0, 0.15);
                  }
                }}
                data-testid="playground-svg"
                className={`w-full max-w-[520px] mx-auto h-auto select-none touch-none ${
                  isPanning ? 'cursor-grabbing' : !isFullView ? 'cursor-grab' : ''
                }`}
              >
                {/* Latar Penangkap Drag Pan */}
                <rect
                  x={0}
                  y={0}
                  width={svgSize}
                  height={svgSize}
                  fill="transparent"
                  data-pan-surface="true"
                />

                {/* Grid Kartografis Dinamis & Sumbu (Counter-scaled) */}
                {axisTicks.xTicks.map((val) => {
                  const gx = xScale(val);
                  const labelY = Math.min(
                    svgSize - pad + 18 * invScale,
                    animViewBox.y + animViewBox.h - 8 * invScale
                  );
                  return (
                    <g key={`gx-${val}`} pointerEvents="none">
                      <line
                        x1={gx}
                        y1={pad}
                        x2={gx}
                        y2={svgSize - pad}
                        stroke="var(--border-rule)"
                        strokeWidth={1 * invScale}
                        strokeDasharray={
                          val === 0 || val === 10
                            ? undefined
                            : `${2 * invScale} ${3 * invScale}`
                        }
                      />
                      <text
                        x={gx}
                        y={labelY}
                        textAnchor="middle"
                        fill="var(--text-muted)"
                        fontSize={10 * invScale}
                        className="font-tabular"
                      >
                        {formatIndonesianNumber(val, axisTicks.decimals)}
                      </text>
                    </g>
                  );
                })}

                {axisTicks.yTicks.map((val) => {
                  const gy = yScale(val);
                  const labelX = Math.max(
                    pad - 10 * invScale,
                    animViewBox.x + 28 * invScale
                  );
                  return (
                    <g key={`gy-${val}`} pointerEvents="none">
                      <line
                        x1={pad}
                        y1={gy}
                        x2={svgSize - pad}
                        y2={gy}
                        stroke="var(--border-rule)"
                        strokeWidth={1 * invScale}
                        strokeDasharray={
                          val === 0 || val === 10
                            ? undefined
                            : `${2 * invScale} ${3 * invScale}`
                        }
                      />
                      <text
                        x={labelX}
                        y={gy + 3.5 * invScale}
                        textAnchor="end"
                        fill="var(--text-muted)"
                        fontSize={10 * invScale}
                        className="font-tabular"
                      >
                        {formatIndonesianNumber(val, axisTicks.decimals)}
                      </text>
                    </g>
                  );
                })}

                {/* Keterangan Wilayah Klaster */}
                <text
                  x={xScale(2.2)}
                  y={yScale(1.1)}
                  textAnchor="middle"
                  fill="var(--text-muted)"
                  fontSize={10 * invScale}
                  pointerEvents="none"
                  className="font-tabular uppercase tracking-wider"
                >
                  Klaster Padat (A1–A8)
                </text>
                <text
                  x={xScale(7.3)}
                  y={yScale(8.8)}
                  textAnchor="middle"
                  fill="var(--text-muted)"
                  fontSize={10 * invScale}
                  pointerEvents="none"
                  className="font-tabular uppercase tracking-wider"
                >
                  Klaster Renggang (B1–B7)
                </text>

                {/* Lingkaran k-distance Titik yang Difokuskan */}
                {focusedPoint && (
                  <g pointerEvents="none" data-testid="playground-k-distance-circle">
                    <motion.circle
                      initial={false}
                      animate={{
                        cx: xScale(focusedPoint.x),
                        cy: yScale(focusedPoint.y),
                        r: focusedKDist * pxPerUnit,
                      }}
                      transition={
                        reducedMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 280, damping: 28 }
                      }
                      fill="#D9480F"
                      fillOpacity={0.07}
                      stroke="#D9480F"
                      strokeWidth={1.5 * invScale}
                      strokeDasharray={`${5 * invScale} ${3 * invScale}`}
                    />

                    {/* Garis Penghubung ke Tetangga N_k */}
                    {focusedNeighbors.map((nIdx) => {
                      const nb = points[nIdx];
                      if (!nb) return null;
                      return (
                        <line
                          key={`edge-${focusedPoint.id}-${nb.id}`}
                          x1={xScale(focusedPoint.x)}
                          y1={yScale(focusedPoint.y)}
                          x2={xScale(nb.x)}
                          y2={yScale(nb.y)}
                          stroke="#D9480F"
                          strokeWidth={1.2 * invScale}
                          strokeOpacity={0.65}
                        />
                      );
                    })}
                  </g>
                )}

                {/* Sorotan Tetangga N_k(q) saat Titik Dihover */}
                {hoveredId && (
                  <g pointerEvents="none" data-testid="playground-hover-neighbors-q">
                    {qNeighbors.map((nIdx) => {
                      const nb = points[nIdx];
                      if (!nb) return null;
                      return (
                        <g key={`q-nb-highlight-${nb.id}`}>
                          <line
                            x1={xScale(qPoint.x)}
                            y1={yScale(qPoint.y)}
                            x2={xScale(nb.x)}
                            y2={yScale(nb.y)}
                            stroke="#D9480F"
                            strokeWidth={1.6 * invScale}
                            strokeDasharray={`${3 * invScale} ${2 * invScale}`}
                          />
                          <circle
                            cx={xScale(nb.x)}
                            cy={yScale(nb.y)}
                            r={11 * invScale}
                            fill="none"
                            stroke="#D9480F"
                            strokeWidth={1.5 * invScale}
                          />
                        </g>
                      );
                    })}
                  </g>
                )}

                {/* Garis Penghubung Tipis (Leader Lines) untuk Label yang Digeser */}
                <g pointerEvents="none" data-testid="playground-leader-lines">
                  {points.map((pt) => {
                    const placement = labelPlacements.get(pt.id);
                    if (!placement || !placement.visible || !placement.displaced) return null;
                    return (
                      <line
                        key={`leader-${pt.id}`}
                        data-testid={`playground-leader-${pt.id}`}
                        x1={xScale(pt.x)}
                        y1={yScale(pt.y)}
                        x2={xScale(pt.x) + placement.offsetX * invScale}
                        y2={yScale(pt.y) + placement.offsetY * invScale}
                        stroke="var(--text-muted)"
                        strokeWidth={0.9 * invScale}
                        strokeOpacity={0.75}
                      />
                    );
                  })}
                </g>

                {/* Lapisan Label Cerdas (Anti-Tumpuk) dengan Latar Kertas Semi-Transparan (Opasitas 0,85) */}
                <g pointerEvents="none" data-testid="playground-labels-layer">
                  {points.map((pt, idx) => {
                    const score = lofResult.lof[idx] ?? 1;
                    const placement = labelPlacements.get(pt.id);
                    const isHoveredOrFocused =
                      hoveredId === pt.id || keyboardFocusedId === pt.id;
                    if (!placement) return null;
                    if (!placement.visible && !isHoveredOrFocused) return null;

                    const displayText =
                      targetZoom >= 3.0 || isHoveredOrFocused
                        ? `${pt.label} (${formatIndonesianNumber(score, 2)})`
                        : placement.text;
                    const boxW =
                      targetZoom >= 3.0 || isHoveredOrFocused
                        ? Math.ceil(displayText.length * 6.8 + 10)
                        : placement.width;
                    const boxH = placement.height;

                    return (
                      <g
                        key={`label-${pt.id}`}
                        data-testid={`playground-label-${pt.id}`}
                        data-label-id={pt.label}
                        data-visible={placement.visible ? 'true' : 'hover-only'}
                        data-bbox={`${placement.screenBox.x1.toFixed(1)},${placement.screenBox.y1.toFixed(1)},${placement.screenBox.x2.toFixed(1)},${placement.screenBox.y2.toFixed(1)}`}
                        transform={`translate(${xScale(pt.x)}, ${yScale(pt.y)}) scale(${invScale}) translate(${placement.offsetX}, ${placement.offsetY})`}
                      >
                        <rect
                          x={-boxW / 2}
                          y={-boxH / 2}
                          width={boxW}
                          height={boxH}
                          rx={2}
                          fill="var(--surface-paper)"
                          fillOpacity={0.85}
                          stroke={isHoveredOrFocused ? '#D9480F' : 'var(--border-rule)'}
                          strokeWidth={isHoveredOrFocused ? 1 : 0.6}
                        />
                        <text
                          x={0}
                          y={3.5}
                          textAnchor="middle"
                          fill={score >= 1.5 ? 'var(--accent-anomali-teks)' : 'var(--text-ink)'}
                          className="font-tabular text-[10.5px] font-semibold"
                        >
                          {displayText}
                        </text>
                      </g>
                    );
                  })}
                </g>

                {/* Titik-Titik Scatter (Titik q digambar paling akhir/atas agar tidak pernah tertutup) */}
                {orderedPointsForRender.map(({ pt, idx }) => {
                  const score = lofResult.lof[idx] ?? 1;
                  const isQ = pt.id === 'Q';
                  const isFocused = pt.id === focusedId;
                  const isHovered = pt.id === hoveredId;
                  const isQNeighbor = qNeighbors.includes(idx);
                  const fill = colorScale(score);
                  const baseRadius = isQ
                    ? 9
                    : Math.min(10, Math.max(5, 4 + (score - 0.9) * 2.2));
                  const visualRadius = isHovered ? baseRadius + 1.75 : baseRadius;

                  return (
                    <motion.g
                      key={pt.id}
                      initial={false}
                      animate={{
                        x: xScale(pt.x),
                        y: yScale(pt.y),
                      }}
                      transition={
                        reducedMotion || (isQ && isDraggingQ)
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 300, damping: 26 }
                      }
                      onPointerDown={
                        isQ
                          ? handlePointerDownQ
                          : (e) => {
                              e.stopPropagation();
                              setFocusedId(pt.id);
                            }
                      }
                      onPointerEnter={() => setHoveredId(pt.id)}
                      onPointerLeave={() =>
                        setHoveredId((prev) => (prev === pt.id ? null : prev))
                      }
                      onFocus={() => {
                        setKeyboardFocusedId(pt.id);
                        setFocusedId(pt.id);
                      }}
                      onBlur={() =>
                        setKeyboardFocusedId((prev) => (prev === pt.id ? null : prev))
                      }
                      role="button"
                      tabIndex={0}
                      aria-roledescription={
                        isQ ? 'titik uji yang dapat digeser' : 'titik pengamatan klaster'
                      }
                      aria-label={
                        isQ
                          ? `Titik q pada koordinat ${formatIndonesianNumber(pt.x, 1)} ; ${formatIndonesianNumber(pt.y, 1)}, skor LOF ${formatIndonesianNumber(score, 2)}. Gunakan tombol panah untuk menggeser, Shift untuk langkah besar.`
                          : `Titik ${pt.label} pada koordinat ${formatIndonesianNumber(pt.x, 2)} ; ${formatIndonesianNumber(pt.y, 2)}, k-distance ${formatIndonesianNumber(lofResult.kDistances[idx] ?? 0, 3)}, lrd ${formatIndonesianNumber(lofResult.lrd[idx] ?? 0, 3)}, skor LOF ${formatIndonesianNumber(score, 3)}.`
                      }
                      onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
                        if (!isQ) {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setFocusedId(pt.id);
                          }
                          return;
                        }
                        const langkah = e.shiftKey ? 1 : 0.2;
                        const arah: Record<string, [number, number]> = {
                          ArrowLeft: [-langkah, 0],
                          ArrowRight: [langkah, 0],
                          ArrowUp: [0, langkah],
                          ArrowDown: [0, -langkah],
                        };
                        const d = arah[e.key];
                        if (!d) return;
                        e.preventDefault();
                        movePointQ(pt.x + d[0], pt.y + d[1]);
                      }}
                      data-testid={`playground-point-${pt.id}`}
                      data-lof={score.toFixed(3)}
                      className={isQ ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
                    >
                      {/* Grup Counter-Scale: ukuran titik & area klik tetap dalam piksel layar saat zoom */}
                      <g transform={`scale(${invScale})`}>
                        {/* Area klik transparan minimal 24 px (radius 12 px) agar mudah dipilih di klaster padat */}
                        <circle
                          cx={0}
                          cy={0}
                          r={12}
                          fill="transparent"
                          data-testid={`playground-hit-${pt.id}`}
                        />

                        {/* Lingkaran Luar Penegas untuk Titik q, Titik Fokus, atau Tetangga N_k(q) saat Hover */}
                        {(isQ || isFocused || (hoveredId && isQNeighbor)) && (
                          <circle
                            cx={0}
                            cy={0}
                            r={visualRadius + 4}
                            fill="none"
                            stroke={isQ || isQNeighbor ? '#D9480F' : 'var(--border-strong)'}
                            strokeWidth={1.5}
                          />
                        )}

                        <circle
                          cx={0}
                          cy={0}
                          r={visualRadius}
                          fill={fill}
                          stroke="var(--surface-paper)"
                          strokeWidth={1.5}
                        />
                      </g>
                    </motion.g>
                  );
                })}
              </svg>

              {/* Tooltip Titik saat Hover atau Fokus Keyboard */}
              {tooltipData && (
                <div
                  data-testid="playground-point-tooltip"
                  className="pointer-events-none absolute top-3 right-3 z-20 w-56 border border-[var(--border-strong)] bg-[var(--surface-paper)]/95 p-2.5 font-tabular text-[11px] shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-[var(--border-rule)] pb-1 mb-1.5">
                    <strong className="text-[var(--text-ink)] uppercase">
                      Titik {tooltipData.pt.label}
                    </strong>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      ({formatIndonesianNumber(tooltipData.pt.x, 2)} ;{' '}
                      {formatIndonesianNumber(tooltipData.pt.y, 2)})
                    </span>
                  </div>
                  <div className="space-y-0.5 text-[var(--text-muted)]">
                    <div className="flex justify-between">
                      <span>k-distance:</span>
                      <strong className="text-[var(--text-ink)]">
                        {formatIndonesianNumber(tooltipData.kDist, 3)}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>lrd:</span>
                      <strong className="text-[var(--text-ink)]">
                        {formatIndonesianNumber(tooltipData.lrd, 3)}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Skor LOF:</span>
                      <strong
                        className={
                          tooltipData.lof >= 1.5
                            ? 'text-[var(--accent-anomali-teks)]'
                            : 'text-[var(--text-ink)]'
                        }
                      >
                        {formatIndonesianNumber(tooltipData.lof, 3)}
                      </strong>
                    </div>
                    {tooltipData.isNeighborOfQ && (
                      <div className="pt-1 mt-1 border-t border-[var(--border-rule)] text-[10px] text-[var(--accent-anomali-teks)] font-semibold">
                        Anggota tetangga N_k(q)
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Loupe (Kaca Pembesar Klaster Padat 220x180 px di Pojok Kiri Bawah Plot) */}
              {showLoupe && (
                <div
                  data-testid="playground-loupe"
                  role="region"
                  aria-label="Loupe kaca pembesar otomatis Klaster Padat A1 sampai A8"
                  onClick={handleZoomDenseCluster}
                  className="
                    absolute bottom-3 left-3 z-20 w-[220px] h-[180px]
                    border-2 border-[var(--border-strong)] bg-[var(--surface-paper)]/95
                    flex flex-col justify-between cursor-pointer shadow-sm
                  "
                >
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1 border-b border-[var(--border-rule)] bg-[var(--surface-subtle)]/60 font-tabular text-[10px]">
                    <span className="font-semibold uppercase tracking-wider text-[var(--text-ink)] whitespace-nowrap">
                      Loupe · Klaster Padat
                    </span>
                    <button
                      type="button"
                      data-testid="loupe-close-btn"
                      aria-label="Tutup kaca pembesar klaster padat"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLoupeDismissed(true);
                      }}
                      className="px-1.5 py-0.5 text-[var(--text-muted)] hover:text-[var(--text-ink)] font-bold cursor-pointer"
                    >
                      ×
                    </button>
                  </div>

                  <svg
                    viewBox={`0 0 ${loupeConfig.width} ${loupeConfig.height}`}
                    className="w-full h-[148px] block"
                  >
                    {/* Titik Klaster Padat A1-A8 dengan Label Lengkap di dalam Loupe */}
                    {loupeConfig.denseItems.map(({ pt, score }, idx) => {
                      const cx = loupeConfig.lx(pt.x);
                      const cy = loupeConfig.ly(pt.y);
                      // Arah penempatan label tetap bersih tanpa tumpang tindih di dalam inset 220x148
                      const labelOffsets: ReadonlyArray<[number, number]> = [
                        [-18, 14],  // A1 (bawah-kiri)
                        [18, 13],   // A2 (bawah-kanan)
                        [6, -12],   // A3 (atas-tengah)
                        [22, 10],   // A4 (kanan-bawah)
                        [-18, -12], // A5 (atas-kiri)
                        [0, -13],   // A6 (atas)
                        [20, -12],  // A7 (atas-kanan)
                        [-32, 0],   // A8 (kiri)
                      ];
                      const [ox, oy] = labelOffsets[idx] ?? [0, -10];
                      const txt = `${pt.label} (${formatIndonesianNumber(score, 2)})`;
                      return (
                        <g key={`loupe-${pt.id}`} transform={`translate(${cx}, ${cy})`}>
                          <line
                            x1={0}
                            y1={0}
                            x2={ox}
                            y2={oy}
                            stroke="var(--text-muted)"
                            strokeWidth={0.75}
                            strokeOpacity={0.7}
                          />
                          <circle
                            cx={0}
                            cy={0}
                            r={4.2}
                            fill={colorScale(score)}
                            stroke="var(--surface-paper)"
                            strokeWidth={1.2}
                          />
                          <rect
                            x={ox - 23}
                            y={oy - 6.5}
                            width={46}
                            height={12}
                            rx={1.5}
                            fill="var(--surface-paper)"
                            fillOpacity={0.88}
                            stroke="var(--border-rule)"
                            strokeWidth={0.5}
                          />
                          <text
                            x={ox}
                            y={oy + 2.5}
                            textAnchor="middle"
                            fill="var(--text-ink)"
                            className="font-tabular text-[8.5px] font-semibold"
                          >
                            {txt}
                          </text>
                        </g>
                      );
                    })}

                    {/* Titik q hanya digambar di Loupe bila berada di dalam jendela Loupe */}
                    {loupeConfig.qInLoupe && (
                      <g
                        data-testid="loupe-point-q"
                        transform={`translate(${loupeConfig.lx(qPoint.x)}, ${loupeConfig.ly(qPoint.y)})`}
                      >
                        <circle
                          cx={0}
                          cy={0}
                          r={6}
                          fill={colorScale(qLof)}
                          stroke="#D9480F"
                          strokeWidth={1.5}
                        />
                        <text
                          x={0}
                          y={-9}
                          textAnchor="middle"
                          fill="var(--accent-anomali-teks)"
                          className="font-tabular text-[9px] font-bold"
                        >
                          q ({formatIndonesianNumber(qLof, 2)})
                        </text>
                      </g>
                    )}
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Tabel Ringkas Skor LOF di Bawah Plot */}
          <div
            data-testid="playground-summary-strip"
            className="border border-[var(--border-rule)] bg-[var(--surface-paper)] p-3 font-tabular text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">
                Ringkasan Skor LOF Seluruh Titik (Klik atau Hover untuk Sorot)
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                Label lengkap tampil otomatis saat Zoom ≥ 3,0×
              </span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
              {points.map((pt, idx) => {
                const score = lofResult.lof[idx] ?? 1;
                const isSelected = pt.id === focusedId;
                return (
                  <button
                    key={`chip-${pt.id}`}
                    type="button"
                    onClick={() => setFocusedId(pt.id)}
                    onMouseEnter={() => setHoveredId(pt.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`px-1.5 py-1 border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-[var(--border-strong)] bg-[var(--surface-subtle)] font-semibold'
                        : score >= 1.5
                          ? 'border-[#D9480F]/60 bg-[var(--accent-anomali-bg)] text-[var(--accent-anomali-teks)]'
                          : 'border-[var(--border-rule)] bg-[var(--surface-paper)]'
                    }`}
                  >
                    <span className="block text-[10px] text-[var(--text-muted)]">{pt.label}</span>
                    <span className="text-[11px] font-semibold">
                      {formatIndonesianNumber(score, 2)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tabel Alternatif Terlipat (ID, x, y, k-distance, lrd, LOF) untuk Pembaca Layar & Aksesibilitas */}
          <details
            data-testid="playground-alt-table-details"
            className="border border-[var(--border-rule)] bg-[var(--surface-paper)] px-3.5 py-2.5 font-tabular text-xs"
          >
            <summary className="cursor-pointer font-semibold text-[var(--text-ink)] select-none">
              Tabel Alternatif Data Titik Playground (ID, x, y, k-distance, lrd, LOF)
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table
                data-testid="playground-alt-table"
                className="w-full border-collapse text-left text-xs"
              >
                <thead>
                  <tr className="border-b border-[var(--border-strong)] text-[10px] uppercase text-[var(--text-muted)]">
                    <th className="py-1.5 pr-2">ID</th>
                    <th className="py-1.5 px-2 text-right">x</th>
                    <th className="py-1.5 px-2 text-right">y</th>
                    <th className="py-1.5 px-2 text-right">k-distance</th>
                    <th className="py-1.5 px-2 text-right">lrd</th>
                    <th className="py-1.5 pl-2 text-right">LOF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-rule)]">
                  {points.map((pt, idx) => {
                    const kDist = lofResult.kDistances[idx] ?? 0;
                    const lrdVal = lofResult.lrd[idx] ?? 0;
                    const lofVal = lofResult.lof[idx] ?? 1;
                    return (
                      <tr key={`alt-row-${pt.id}`}>
                        <td className="py-1.5 pr-2 font-semibold text-[var(--text-ink)]">
                          {pt.label}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {formatIndonesianNumber(pt.x, 2)}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {formatIndonesianNumber(pt.y, 2)}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {formatIndonesianNumber(kDist, 3)}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {formatIndonesianNumber(lrdVal, 3)}
                        </td>
                        <td
                          className={`py-1.5 pl-2 text-right font-semibold ${
                            lofVal >= 1.5
                              ? 'text-[var(--accent-anomali-teks)]'
                              : 'text-[var(--text-ink)]'
                          }`}
                        >
                          {formatIndonesianNumber(lofVal, 3)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        {/* Panel Kanan: Kontrol Koordinat q & Perhitungan Penuh 5 Langkah */}
        <div className="lg:col-span-5 space-y-4">
          {/* Kartu Skor LOF Titik Uji q */}
          <div className="border border-[var(--border-strong)] bg-[var(--surface-subtle)]/40 p-4">
            <div className="flex items-baseline justify-between border-b border-[var(--border-rule)] pb-2 mb-3">
              <span className="font-tabular text-xs uppercase tracking-wider font-semibold text-[var(--text-ink)]">
                Titik Uji yang Dapat Digerakkan (q)
              </span>
              <span className="font-tabular text-xs text-[var(--text-muted)]">
                ({formatIndonesianNumber(qPoint.x, 2)} ; {formatIndonesianNumber(qPoint.y, 2)})
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-4 mb-3">
              <div>
                <span className="font-tabular text-[11px] uppercase text-[var(--text-muted)] block">
                  Skor LOF(q) Saat Ini
                </span>
                <span
                  data-testid="playground-q-lof"
                  className={`font-tabular text-3xl font-bold ${
                    qLof >= 1.5 ? 'text-[var(--accent-anomali-teks)]' : 'text-[var(--text-ink)]'
                  }`}
                >
                  {formatIndonesianNumber(qLof, 3)}
                </span>
              </div>
              <span
                className={`px-2.5 py-1 font-tabular text-xs uppercase font-semibold border ${
                  qLof >= 1.5
                    ? 'border-[#D9480F] bg-[var(--accent-anomali-bg)] text-[var(--accent-anomali-teks)]'
                    : 'border-[var(--border-rule)] bg-[var(--surface-paper)] text-[var(--text-ink)]'
                }`}
              >
                {qLof >= 1.5 ? 'Anomali Lokal (≥ 1,50)' : 'Normal Lokal (< 1,50)'}
              </span>
            </div>

            {/* Slider Koordinat X & Y Titik q (Memudahkan Eksperimen Presisi & Aksesibilitas) */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border-rule)] font-tabular text-xs">
              <div>
                <label htmlFor="slider-q-x" className="block text-[11px] text-[var(--text-muted)]">
                  Posisi X (q): {formatIndonesianNumber(qPoint.x, 2)}
                </label>
                <input
                  id="slider-q-x"
                  data-testid="slider-q-x"
                  type="range"
                  min={0.5}
                  max={9.5}
                  step={0.1}
                  value={qPoint.x}
                  onChange={(e) => movePointQ(Number.parseFloat(e.target.value), qPoint.y)}
                  className="w-full accent-[#D9480F] cursor-pointer"
                />
              </div>
              <div>
                <label htmlFor="slider-q-y" className="block text-[11px] text-[var(--text-muted)]">
                  Posisi Y (q): {formatIndonesianNumber(qPoint.y, 2)}
                </label>
                <input
                  id="slider-q-y"
                  data-testid="slider-q-y"
                  type="range"
                  min={0.5}
                  max={9.5}
                  step={0.1}
                  value={qPoint.y}
                  onChange={(e) => movePointQ(qPoint.x, Number.parseFloat(e.target.value))}
                  className="w-full accent-[#D9480F] cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Rincian Perhitungan 5 Tahap untuk Titik Fokus */}
          <div className="border border-[var(--border-rule)] bg-[var(--surface-paper)] p-4 font-tabular text-xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-[var(--border-rule)] pb-2">
              <span className="uppercase tracking-wider font-semibold text-[var(--text-ink)]">
                Bedah Rumus Titik: {focusedPoint.label}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                |N_k| = {focusedNeighbors.length} tetangga
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">1. k-distance({focusedPoint.label}):</span>
              <strong className="text-[var(--text-ink)]">
                {formatIndonesianNumber(focusedKDist, 3)}
              </strong>
            </div>

            <div>
              <span className="text-[var(--text-muted)] block mb-1">
                2. Tetangga N_k({focusedPoint.label}) & reach-dist:
              </span>
              <div className="space-y-1 pl-2 border-l-2 border-[var(--border-rule)]">
                {focusedNeighbors.map((nIdx) => {
                  const nb = points[nIdx];
                  const dRaw = lofResult.distMatrix[focusedIdx][nIdx];
                  const rDist = lofResult.reachDistMatrix[focusedIdx][nIdx];
                  const nbLrd = lofResult.lrd[nIdx];
                  return (
                    <div key={nb.id} className="flex justify-between text-[11px]">
                      <span>
                        ke <strong>{nb.label}</strong> (d={formatIndonesianNumber(dRaw, 2)}, k-dist=
                        {formatIndonesianNumber(lofResult.kDistances[nIdx], 2)})
                      </span>
                      <span>
                        rd=<strong>{formatIndonesianNumber(rDist, 2)}</strong> · lrd=
                        {formatIndonesianNumber(nbLrd, 2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-between pt-1 border-t border-[var(--border-rule)]">
              <span className="text-[var(--text-muted)]">
                3. Kepadatan lokal lrd({focusedPoint.label}):
              </span>
              <strong className="text-[var(--text-ink)]">
                {formatIndonesianNumber(focusedLrd, 3)}
              </strong>
            </div>

            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">
                4. Rasio thd rerata lrd tetangga → LOF({focusedPoint.label}):
              </span>
              <strong
                className={
                  focusedLof >= 1.5 ? 'text-[var(--accent-anomali-teks)]' : 'text-[var(--text-ink)]'
                }
              >
                {formatIndonesianNumber(focusedLof, 3)}
              </strong>
            </div>
          </div>

          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            <strong>Inti konsep lokal:</strong> Saat titik <span className="font-tabular">q</span>{' '}
            ditempatkan sedikit di luar <strong>Klaster Padat</strong> (misal di{' '}
            <span className="font-tabular">3,4 ; 2,6</span>), jaraknya ke tetangga sebenarnya lebih
            kecil dibandingkan jarak antartitik di dalam <strong>Klaster Renggang</strong>. Namun
            karena tetangga <span className="font-tabular">A1–A8</span> sangat padat (
            <span className="font-tabular">lrd</span> tinggi), <span className="font-tabular">q</span>{' '}
            langsung menghasilkan skor LOF tinggi (&gt; 2,0).
          </p>
        </div>
      </div>
    </div>
  );
}
