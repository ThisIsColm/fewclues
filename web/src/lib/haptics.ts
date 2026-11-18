import { WebHaptics } from 'web-haptics';

/**
 * Best-effort haptics. Android Chrome uses the Vibration API; iOS Safari
 * relies on web-haptics' switch-input workaround. Anything unsupported or
 * blocked fails silently — the game never depends on it.
 */
let instance: WebHaptics | null = null;
let last = 0;

function get(): WebHaptics | null {
  if (instance) return instance;
  try {
    instance = new WebHaptics();
  } catch {
    instance = null;
  }
  return instance;
}

export type Haptic = 'light' | 'medium' | 'heavy' | 'success' | 'error';

export function haptic(kind: Haptic, minGapMs = 30) {
  // Browsers refuse vibration before the first tap; don't even try (it logs an intervention).
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  const now = performance.now();
  if (now - last < minGapMs) return;
  last = now;
  try {
    void get()?.trigger(kind).catch(() => {});
  } catch {
    /* unsupported — ignore */
  }
}

/** Which haptic, if any, to fire when the value moves from `prev` to `next` (integers). */
export function tickFor(prev: number, next: number): Haptic | null {
  if (prev === next) return null;
  const lo = Math.min(prev, next);
  const hi = Math.max(prev, next);
  let kind: Haptic | null = null;
  for (let m = Math.ceil(lo / 10) * 10; m <= hi; m += 10) {
    if (m === prev) continue; // leaving a mark isn't crossing it
    if (m === 0 || m === 50 || m === 100) return 'heavy';
    kind = 'light';
  }
  return kind;
}
