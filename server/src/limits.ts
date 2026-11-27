// Rate limiting. Keeps people from spamming sign-in emails or guessing codes.

/**
 * Counts hits per key inside a rolling window, in memory. Good for one server.
 * A restart forgets the counts, which only ever errs on the side of letting people in.
 */
export class WindowLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Records a hit. Returns false when this key has used up its allowance. */
  allow(key: string, now: number): boolean {
    this.sweep(now);
    const since = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }

  /** Throws away keys that have gone quiet so the map can't grow without end. */
  private sweep(now: number) {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    const since = now - this.windowMs;
    for (const [key, list] of this.hits) {
      if (!list.some((t) => t > since)) this.hits.delete(key);
    }
  }

  get size() {
    return this.hits.size;
  }
}

/**
 * The caller's address, as seen by the proxy in front of us. Each proxy appends
 * to X-Forwarded-For, so the entries a client can fake are at the start. We
 * count back from the end by the number of proxies we trust.
 */
export function clientIp(forwardedFor: string | undefined, trustedHops: number): string | null {
  const parts = (forwardedFor ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null; // no proxy header: we can't tell callers apart, so don't pretend to
  const index = Math.max(0, parts.length - Math.max(1, trustedHops));
  return parts[index]!;
}

export function forwardedCount(forwardedFor: string | undefined): number {
  return (forwardedFor ?? "").split(",").filter((p) => p.trim()).length;
}
