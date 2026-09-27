/**
 * Outbound HTTP for the provider cascades (canvas + lyrics).
 *
 * Every call gets an AbortController timeout and swallows its own failure,
 * returning null instead of throwing. That is what keeps a cascade alive: one
 * dead provider must never stop the next one from being tried.
 */

// Short on purpose: cascades call several providers in a row.
export const DEFAULT_TIMEOUT_MS = 8_000;

export interface RequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Aborts together with the internal timeout, e.g. when the song changes. */
  signal?: AbortSignal;
}

export const buildUrl = (base: string, params: Record<string, string | number | undefined | null>): string => {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  if (!query) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${query}`;
};

const request = async (url: string, options: RequestOptions, init: { method?: string; body?: string } = {}): Promise<Response | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onOuterAbort);
  try {
    const res = await fetch(url, { ...init, headers: options.headers, signal: controller.signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }
};

export const fetchJson = async <T>(url: string, options: RequestOptions = {}): Promise<T | null> => {
  const res = await request(url, {
    ...options,
    headers: { Accept: 'application/json', ...options.headers },
  });
  if (!res) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

export const postJson = async <T>(url: string, body: unknown, options: RequestOptions = {}): Promise<T | null> => {
  const res = await request(
    url,
    { ...options, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...options.headers } },
    { method: 'POST', body: JSON.stringify(body) },
  );
  if (!res) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

export const fetchText = async (url: string, options: RequestOptions = {}): Promise<string | null> => {
  const res = await request(url, options);
  if (!res) return null;
  try {
    return await res.text();
  } catch {
    return null;
  }
};

/** A small TTL cache so re-opening the player never refetches the same song. */
export class TtlCache<V> {
  private store = new Map<string, { value: V; expiresAt: number }>();

  constructor(private ttlMs: number, private maxEntries = 200) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  set(key: string, value: V): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
  }
}

export const cacheKey = (...parts: (string | number | boolean | undefined | null)[]): string =>
  parts.map(p => String(p ?? '').trim().toLowerCase()).join('|');
