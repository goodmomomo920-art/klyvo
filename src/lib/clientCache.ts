type CacheEntry = { value: unknown; expiresAt: number };

const entries = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = entries.get(key);
  if (existing && existing.expiresAt > now) return existing.value as T;
  const value = await fn();
  // Never keep a failed result: a temporary error must not stick for 30 seconds.
  const failed =
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    (value as { success?: unknown }).success === false;
  if (!failed) {
    entries.set(key, { value, expiresAt: Date.now() + TTL_MS });
  }
  return value;
}

export function clearClientCache(): void {
  entries.clear();
}
