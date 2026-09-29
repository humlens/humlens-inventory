// Sliding-window limits kept in this server process: a brake on password
// guessing, sign-up floods and runaway assistant loops, not a billing control.
// Behind several server processes each keeps its own count, so the effective
// limit is higher; put a shared limiter (e.g. at the proxy) in front if that
// matters.

const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

// Drops keys whose hits have all expired, so the map doesn't grow without end.
function sweep(now: number, windowMs: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, hits] of buckets) if (!hits.length || now - hits[hits.length - 1]! > windowMs) buckets.delete(key);
}

/**
 * Counts one hit for `key` and returns 0 if it's within `limit` per
 * `windowMs`, or the seconds to wait if not (the hit isn't counted then).
 */
export function hit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  sweep(now, windowMs);
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return Math.max(1, Math.ceil((hits[0]! + windowMs - now) / 1000));
  }
  hits.push(now);
  buckets.set(key, hits);
  return 0;
}

/** Whether `key` has used up its limit, without counting a hit. */
export function isLimited(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  return (buckets.get(key) ?? []).filter((t) => now - t < windowMs).length >= limit;
}

export const reset = (key: string) => buckets.delete(key);

/** The client's address: the first X-Forwarded-For hop when behind a proxy, else the socket's. */
export function clientAddress(headers: Record<string, string | string[] | undefined> | undefined, fallback?: string | null) {
  const forwarded = headers?.['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || fallback || 'unknown';
}
