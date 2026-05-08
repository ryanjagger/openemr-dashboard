/**
 * In-memory token store keyed by session id.
 *
 * Why this exists: OpenEMR issues long opaque encrypted tokens (the
 * `def502…` blobs) that, combined with refresh + id token, exceed the
 * 4 KB browser cookie limit even after iron-session compression. We
 * keep only the random session id in the cookie and look up the actual
 * tokens here.
 *
 * Phase-1 limitations: tokens live in process memory, so a server
 * restart logs every user out and a multi-instance deploy needs sticky
 * routing or a shared store. Phase 2+ should swap this for Redis.
 */

export type StoredTokens = {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: number;
  userId?: string;
  fhirUser?: string;
};

type Entry = { data: StoredTokens; lastTouchedAt: number };

// 8h matches the iron-session cookie TTL.
const TTL_MS = 8 * 60 * 60 * 1000;

// Pin the Map on globalThis so it survives Next.js dev HMR module reloads
// AND is shared between middleware and route handler module instances
// (Turbopack loads them independently, so a plain `const store = new Map()`
// becomes two different Maps that never see each other's writes).
declare global {
  var __openemrSessionStore: Map<string, Entry> | undefined;
}

const store: Map<string, Entry> =
  globalThis.__openemrSessionStore ??
  (globalThis.__openemrSessionStore = new Map());

function sweep(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of store) {
    if (v.lastTouchedAt < cutoff) store.delete(k);
  }
}

export function readTokens(sid: string): StoredTokens | undefined {
  sweep();
  const entry = store.get(sid);
  if (!entry) return undefined;
  entry.lastTouchedAt = Date.now();
  return entry.data;
}

export function writeTokens(sid: string, data: StoredTokens): void {
  store.set(sid, { data, lastTouchedAt: Date.now() });
}

export function deleteTokens(sid: string): void {
  store.delete(sid);
}
