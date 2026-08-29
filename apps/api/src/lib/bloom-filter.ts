/**
 * Bloom Filter — Probabilistic duplicate detection.
 *
 * DSA: O(k) per add/check where k = number of hash functions.
 * Used to detect duplicate complaint submissions within a time window.
 * False positives are acceptable (we do an exact DB check on "might exist");
 * false negatives never happen.
 */
export class BloomFilter {
  private bits: Uint8Array;
  private readonly hashCount: number;
  private readonly size: number;

  constructor(size = 4096, hashCount = 5) {
    this.size = size;
    this.hashCount = hashCount;
    this.bits = new Uint8Array(size);
  }

  /** FNV-1a inspired hash with a per-round seed. */
  private hash(value: string, seed: number): number {
    let h = seed ^ 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = (h * 0x01000193) & 0x7fffffff;
    }
    return h % this.size;
  }

  add(value: string): void {
    for (let i = 0; i < this.hashCount; i++) {
      this.bits[this.hash(value, i + 1)] = 1;
    }
  }

  /** Returns true if the value MIGHT have been added; false means definitely not. */
  mightContain(value: string): boolean {
    for (let i = 0; i < this.hashCount; i++) {
      if (!this.bits[this.hash(value, i + 1)]) return false;
    }
    return true;
  }

  /** Reset — call periodically (e.g. every 5 minutes) to bound the false-positive rate. */
  clear(): void {
    this.bits = new Uint8Array(this.size);
  }
}

/**
 * Time-windowed bloom filter that auto-resets after `windowMs`.
 * Key pattern: `${driverId}:${normalizedTitle}`.
 */
export class TimedBloomFilter {
  private filter: BloomFilter;
  private lastReset: number;
  private readonly windowMs: number;

  constructor(windowMs = 5 * 60_000, size = 4096, hashCount = 5) {
    this.windowMs = windowMs;
    this.filter = new BloomFilter(size, hashCount);
    this.lastReset = Date.now();
  }

  private maybeReset(): void {
    if (Date.now() - this.lastReset > this.windowMs) {
      this.filter.clear();
      this.lastReset = Date.now();
    }
  }

  add(value: string): void {
    this.maybeReset();
    this.filter.add(value);
  }

  mightContain(value: string): boolean {
    this.maybeReset();
    return this.filter.mightContain(value);
  }
}
