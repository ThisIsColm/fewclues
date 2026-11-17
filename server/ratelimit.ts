/**
 * Token bucket per key (client IP). Each key holds up to `capacity` tokens,
 * refilled evenly over `windowMs`. In-memory only — fine for one small instance.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  private lastSweep = 0;

  constructor(
    private capacity: number,
    private windowMs = 60_000,
    private now: () => number = Date.now,
  ) {}

  /** Returns true if the request is allowed. */
  take(key: string): boolean {
    if (this.capacity <= 0) return true;
    const now = this.now();
    this.sweep(now);
    const rate = this.capacity / this.windowMs;
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    b.tokens = Math.min(this.capacity, b.tokens + (now - b.at) * rate);
    b.at = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    return ok;
  }

  /** Drop buckets that have fully refilled so the map can't grow forever. */
  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, b] of this.buckets) if (now - b.at > this.windowMs) this.buckets.delete(k);
  }
}
