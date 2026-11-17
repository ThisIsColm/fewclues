import type { CreateTypes } from 'canvas-confetti';

/**
 * Confetti is lazy-loaded: only a bullseye or a perfect day pays for it.
 * We create our own canvas with useWorker:false, because canvas-confetti's
 * default worker comes from a blob: URL that our CSP (script-src 'self') blocks.
 */
let fire: CreateTypes | null = null;

export async function celebrate(big = false) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!fire) {
    const { default: confetti } = await import('canvas-confetti');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '50' });
    document.body.append(canvas);
    fire = confetti.create(canvas, { resize: true, useWorker: false, disableForReducedMotion: true });
  }
  const colors = ['#FF6B2C', '#39D3F2', '#F4F1EA'];
  const base = { colors, ticks: 160, scalar: 0.9 };
  void fire({ ...base, particleCount: big ? 140 : 80, spread: 70, startVelocity: 38, origin: { y: 0.55 } });
  if (big) {
    void fire({ ...base, particleCount: 60, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } });
    void fire({ ...base, particleCount: 60, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } });
  }
}
