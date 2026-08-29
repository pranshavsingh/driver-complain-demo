/**
 * Sliding Window Log rate limiter.
 *
 * DSA: O(log n) per check via binary search on sorted timestamps.
 * Unlike fixed-window counters, this prevents burst spikes at window boundaries.
 *
 * This is the in-memory implementation; for multi-instance deployments, replace
 * with a Redis-backed sliding window (e.g. `rate-limit-redis`).
 */
export class SlidingWindowRateLimiter {
  /** Map<key, sorted timestamp array>. */
  private windows = new Map<string, number[]>();
  /** Periodic cleanup to prevent memory leaks from stale keys. */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly cleanupIntervalMs = 60_000) {
    this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
    this.cleanupTimer.unref(); // Don't keep process alive.
  }

  /**
   * Check if a request with the given key is allowed.
   * @returns `true` if within the limit; `false` if rate-limited.
   */
  isAllowed(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;

    let timestamps = this.windows.get(key) ?? [];

    // Binary search to find first timestamp >= cutoff — O(log n).
    let lo = 0;
    let hi = timestamps.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (timestamps[mid]! < cutoff) lo = mid + 1;
      else hi = mid;
    }

    // Trim expired entries.
    timestamps = timestamps.slice(lo);

    if (timestamps.length >= maxRequests) {
      this.windows.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);
    return true;
  }

  /** How many requests remain in the window for a given key. */
  remaining(key: string, maxRequests: number, windowMs: number): number {
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = this.windows.get(key) ?? [];
    const active = timestamps.filter((t) => t >= cutoff).length;
    return Math.max(0, maxRequests - active);
  }

  /** Remove keys that have no recent timestamps. */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.windows) {
      const latest = timestamps[timestamps.length - 1];
      // If the newest timestamp is older than 2 minutes, drop the key entirely.
      if (!latest || now - latest > 120_000) {
        this.windows.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.windows.clear();
  }
}
