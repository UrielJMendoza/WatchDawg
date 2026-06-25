/**
 * Tiny in-memory TTL cache used by the route handlers so the client can poll
 * the OSINT endpoints frequently without hammering the upstream APIs.
 *
 * Lives on the Node server process (route handlers run server-side). It also
 * doubles as a "last known good" store: on upstream failure we can serve the
 * stale entry instead of going dark.
 */

interface Entry<T> {
  value: T;
  expires: number;
  stored: number;
}

const store = new Map<string, Entry<unknown>>();

export function getFresh<T>(key: string): T | null {
  const hit = store.get(key) as Entry<T> | undefined;
  if (!hit) return null;
  if (Date.now() > hit.expires) return null;
  return hit.value;
}

/** Return a value even if expired (last-known-good). */
export function getStale<T>(key: string): T | null {
  const hit = store.get(key) as Entry<T> | undefined;
  return hit ? hit.value : null;
}

export function setCache<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expires: Date.now() + ttlMs, stored: Date.now() });
}

/**
 * Memoise an async producer behind the TTL cache. On producer failure, falls
 * back to the last-known-good entry (if any) rather than throwing.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  producer: () => Promise<T>,
): Promise<{ value: T | null; fresh: boolean; stale: boolean }> {
  const fresh = getFresh<T>(key);
  if (fresh !== null) return { value: fresh, fresh: true, stale: false };

  try {
    const value = await producer();
    setCache(key, value, ttlMs);
    return { value, fresh: true, stale: false };
  } catch {
    const stale = getStale<T>(key);
    return { value: stale, fresh: false, stale: stale !== null };
  }
}
