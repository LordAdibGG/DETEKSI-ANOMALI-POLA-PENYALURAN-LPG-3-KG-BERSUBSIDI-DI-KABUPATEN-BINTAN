import { useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Kurva easing editorial Lembar Pantau: cubic-bezier(0.2, 0.7, 0.2, 1)
 * Durasi wajib di rentang 150-400 ms (0.15s - 0.40s).
 */
export const EDITORIAL_EASE: [number, number, number, number] = [0.2, 0.7, 0.2, 1];

export function usePrefersReducedMotion(): boolean {
  const motionReduced = useReducedMotion();
  const [mediaReduced, setMediaReduced] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setMediaReduced(e.matches);
    setMediaReduced(mq.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  return Boolean(motionReduced || mediaReduced);
}

/**
 * Evaluasi nilai kurva cubic-bezier(0.2, 0.7, 0.2, 1) secara analitik untuk CountUp.
 */
function cubicBezierEditorial(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // Aproksimasi halus monotonik yang cocok dengan cubic-bezier(0.2, 0.7, 0.2, 1)
  const inv = 1 - t;
  return 3 * inv * inv * t * 0.7 + 3 * inv * t * t * 1.0 + t * t * t;
}

export function formatIndonesianNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export interface RevealProps {
  children: ReactNode;
  delayMs?: number;
  durationMs?: number;
  offsetY?: number;
  className?: string;
}

export function Reveal({
  children,
  delayMs = 0,
  durationMs = 260,
  offsetY = 8,
  className,
}: RevealProps) {
  const reduced = usePrefersReducedMotion();
  const clampedDuration = Math.min(400, Math.max(150, durationMs)) / 1000;

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: offsetY }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: clampedDuration,
        delay: delayMs / 1000,
        ease: EDITORIAL_EASE,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export interface StaggerProps {
  children: ReactNode;
  staggerMs?: number;
  delayChildrenMs?: number;
  className?: string;
}

export function Stagger({
  children,
  staggerMs = 45,
  delayChildrenMs = 0,
  className,
}: StaggerProps) {
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerMs / 1000,
            delayChildren: delayChildrenMs / 1000,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  durationMs = 240,
  className,
}: {
  children: ReactNode;
  durationMs?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const clampedDuration = Math.min(400, Math.max(150, durationMs)) / 1000;

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 6 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: clampedDuration,
            ease: EDITORIAL_EASE,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export interface CountUpProps {
  value: number;
  from?: number;
  decimals?: number;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function CountUp({
  value,
  from = 0,
  decimals = 0,
  durationMs = 350,
  prefix = '',
  suffix = '',
  className = '',
}: CountUpProps) {
  const reduced = usePrefersReducedMotion();
  const clampedDuration = Math.min(400, Math.max(150, durationMs));
  const [displayValue, setDisplayValue] = useState<number>(reduced ? value : from);

  useEffect(() => {
    if (reduced) {
      setDisplayValue(value);
      return;
    }

    let rafId: number | null = null;
    const startTime = performance.now();
    const startVal = from;
    const delta = value - startVal;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / clampedDuration);
      const eased = cubicBezierEditorial(progress);
      setDisplayValue(startVal + delta * eased);

      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        setDisplayValue(value);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [value, from, clampedDuration, reduced]);

  const formatted = formatIndonesianNumber(displayValue, decimals);

  return (
    <span className={`font-tabular ${className}`.trim()}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

export function PageTransition({
  children,
  pageKey,
  durationMs = 220,
  className,
}: {
  children: ReactNode;
  pageKey?: string;
  durationMs?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const clampedDuration = Math.min(400, Math.max(150, durationMs)) / 1000;

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  // Fungsi gerak: memberi tanda bahwa halaman berganti. Cukup memudar singkat;
  // tanpa geser vertikal dan tanpa exit (exit tidak pernah berjalan tanpa AnimatePresence).
  return (
    <motion.div
      key={pageKey}
      initial={{ opacity: 0.001 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: clampedDuration,
        ease: EDITORIAL_EASE,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
