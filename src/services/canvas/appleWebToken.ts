/**
 * The token Apple's own web player (music.apple.com) uses for catalog reads,
 * fetched the way Echo Music does (applecanvas/AppleMusicTokenProvider.kt):
 * load the web player's page, find its index-*.js bundle, and read the JWT
 * embedded in it. Nothing is hard-coded — when Apple rotates the token or
 * reshapes the page, this follows (and a fix in Echo can be mirrored here).
 *
 * Used only for public catalog metadata (album motion artwork). A token the
 * listener pastes in Settings always wins over this one.
 */
import { fetchText } from '../net/fetchWithTimeout';
import { diag } from '../../utils/diag';

const WEB_PLAYER = 'https://beta.music.apple.com';
const BUNDLE_RE = /src="(\/assets\/index[~.-][^"]+\.js)"/;
const JWT_RE = /eyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+/;
/** Re-read at least this often even if the JWT claims to live longer. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

let cached: { token: string; expiresAt: number } | null = null;
let inFlight: Promise<string | null> | null = null;

/** JWT `exp` in ms, if readable. */
export const jwtExpiry = (token: string): number | null => {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
};

/** Pulls the bundle path and then the token out of the web player (pure, for tests). */
export const findBundlePath = (html: string): string | null => BUNDLE_RE.exec(html)?.[1] ?? null;
export const findToken = (js: string): string | null => JWT_RE.exec(js)?.[0] ?? null;

export const getAppleWebToken = async (): Promise<string | null> => {
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const html = await fetchText(WEB_PLAYER, { timeoutMs: 12_000 });
    const path = html ? findBundlePath(html) : null;
    if (!path) {
      diag('apple', `web player page ${html ? 'had no index bundle' : 'unreachable'}`);
      return null;
    }
    const js = await fetchText(`${WEB_PLAYER}${path}`, { timeoutMs: 15_000 });
    const token = js ? findToken(js) : null;
    diag('apple', token ? `web token read from ${path}` : `no token in ${path}`);
    if (!token) return null;
    const exp = jwtExpiry(token);
    cached = { token, expiresAt: Math.min(exp ?? Infinity, Date.now() + MAX_AGE_MS) };
    return token;
  })().finally(() => { inFlight = null; });
  return inFlight;
};

/** Drop the cached token (Apple rejected it); the next call re-reads the page. */
export const invalidateAppleWebToken = (): void => { cached = null; };
