import MD5 from 'crypto-js/md5';
import ReactNativeBlobUtil from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const __ALIAS = 'moviebox';

const API_BASE = 'https://h5-api.aoneroom.com';
const SITE_BASE = 'https://movie-box.co';
const API_PREFIX = '/wefeed-h5api-bff';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const JWT_STORAGE_KEY = 'moviebox_jwt';

// ─── Types ──────────────────────────────────────────────────────────────────

export type MovieboxCover = { url: string; width: number; height: number };
export type MovieboxDub = { lanName: string; lanCode: string; original: boolean; type: number; detailPath: string };
export type MovieboxSearchItem = {
  subjectId: string; subjectType: number; title: string; description: string;
  releaseDate: string; genre: string; cover: MovieboxCover; countryName: string;
  imdbRatingValue: string; subtitles: string; dubs: MovieboxDub[];
  detailPath: string; hasResource: boolean;
};
export type MovieboxSeason = { se: number; maxEp: number; resolutions: { resolution: number; epNum: number }[] };
export type MovieboxStream = { format: string; id: string; url: string; resolutions: string; size: string; duration: number; codecName: string };
export type MovieboxCaption = { id: string; lan: string; lanName: string; url: string; size: string; delay: number };

// ─── Auth (X-Client-Token based — same as the website) ─────────────────────

let cachedJwt: string | null = null;
let jwtLoadedFromStorage = false;

/** Generate guest fingerprint: "<timestamp>,<MD5(reversed_timestamp)>" */
function clientToken(): string {
  const ts = String(Math.floor(Date.now() / 1000));
  return `${ts},${MD5(ts.split('').reverse().join('')).toString()}`;
}

/** Build request headers with auto-generated X-Client-Token */
function headers(opts?: { json?: boolean; proxy?: boolean; referer?: string }): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'X-Client-Token': clientToken(),
  };
  if (opts?.proxy) {
    h.Referer = `${SITE_BASE}${opts.referer || '/'}`;
  } else {
    h.Referer = `${SITE_BASE}/`;
    h.Origin = SITE_BASE;
  }
  if (opts?.json) h['Content-Type'] = 'application/json';
  if (cachedJwt && isJwtValid(cachedJwt)) {
    h.Authorization = `Bearer ${cachedJwt}`;
    h.Cookie = `token=${cachedJwt}`;
  }
  return h;
}

/** Decode JWT payload to check expiry */
function getJwtExpiry(jwt: string): number {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return 0;
    const payload = JSON.parse(atob(parts[1]));
    return payload.exp || 0;
  } catch { return 0; }
}

/** Check if JWT is still valid (1 hour safety margin) */
function isJwtValid(jwt: string | null): boolean {
  if (!jwt) return false;
  const exp = getJwtExpiry(jwt);
  return exp > 0 && Date.now() / 1000 < (exp - 3600);
}

/** Load JWT from AsyncStorage on first use */
async function loadJwtFromStorage(): Promise<void> {
  if (jwtLoadedFromStorage) return;
  jwtLoadedFromStorage = true;
  try {
    const stored = await AsyncStorage.getItem(JWT_STORAGE_KEY);
    if (stored && isJwtValid(stored)) cachedJwt = stored;
  } catch {}
}

/** Save JWT to AsyncStorage for persistence across app restarts */
async function saveJwt(jwt: string): Promise<void> {
  cachedJwt = jwt;
  try { await AsyncStorage.setItem(JWT_STORAGE_KEY, jwt); } catch {}
}

/** Try to grab JWT from x-user response header and persist it */
function grabJwt(res: Response): void {
  try {
    let xUser: string | null = null;
    res.headers.forEach((v, k) => { if (k.toLowerCase() === 'x-user') xUser = v; });
    if (!xUser) xUser = res.headers.get('x-user');
    if (xUser) {
      const p = JSON.parse(xUser);
      if (p.token) saveJwt(p.token);
    }
  } catch {}
}

/** Try to extract JWT from x-user header value (handles string, object, URL-encoded, double-JSON) */
function extractJwt(xUserVal: any): string | null {
  if (!xUserVal) return null;
  try {
    // Already an object
    if (typeof xUserVal === 'object' && xUserVal.token) return xUserVal.token;
    // String — might be plain JSON, URL-encoded, or double-encoded
    let s = String(xUserVal);
    // URL-encoded: %22eyJ...%22
    if (s.includes('%22') || s.includes('%7B')) s = decodeURIComponent(s);
    // Double-JSON: '"{\\\" token\\\"...}"'
    if (s.startsWith('"') && s.endsWith('"')) {
      try { s = JSON.parse(s); } catch {}
    }
    if (typeof s === 'string' && s.startsWith('{')) {
      const p = JSON.parse(s);
      if (p.token) return p.token;
    }
  } catch {}
  return null;
}

/** Ensure we have a valid JWT before making requests that require it.
 *  1. Check memory cache (with expiry validation)
 *  2. Load from AsyncStorage (persists across app restarts)
 *  3. Acquire from server via ReactNativeBlobUtil (x-user header + Set-Cookie)
 *  4. Fallback to standard fetch */
async function ensureJwt(): Promise<void> {
  // Already have a valid token in memory
  if (isJwtValid(cachedJwt)) return;

  // Try loading from persistent storage
  await loadJwtFromStorage();
  if (isJwtValid(cachedJwt)) return;

  const commonHeaders: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'X-Client-Token': clientToken(),
    Referer: `${SITE_BASE}/`,
    Origin: SITE_BASE,
  };

  const urls = [
    `${API_BASE}${API_PREFIX}/subject/trending?page=0&perPage=1`,
    `${SITE_BASE}${API_PREFIX}/subject/trending?page=0&perPage=1`,
    `${API_BASE}${API_PREFIX}/home?host=movie-box.co`,
  ];

  // Strategy 1: ReactNativeBlobUtil — try x-user header AND Set-Cookie header
  for (const url of urls) {
    try {
      const resp = await ReactNativeBlobUtil.fetch('GET', url, commonHeaders);
      const hdrs = resp.respInfo.headers || {};

      // Try x-user header (all casing variants)
      const raw = hdrs['x-user'] || hdrs['X-User'] || hdrs['X-USER']
        || hdrs['x-User'] || hdrs['X-user'] || hdrs['x_user'];
      const fromXUser = extractJwt(raw);
      if (fromXUser) { await saveJwt(fromXUser); return; }

      // Try Set-Cookie header (server sends: Set-Cookie: token=eyJ...)
      const setCookie = hdrs['set-cookie'] || hdrs['Set-Cookie'] || hdrs['Set-cookie'];
      if (setCookie) {
        const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
        const match = cookieStr.match(/token=(eyJ[^;]+)/);
        if (match && match[1]) { await saveJwt(match[1]); return; }
      }
    } catch {}
  }

  // Strategy 2: Standard fetch fallback
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'GET', headers: commonHeaders });
      let raw = res.headers.get('x-user');
      if (!raw) {
        res.headers.forEach((v, k) => {
          if (k.toLowerCase() === 'x-user') raw = v;
        });
      }
      const token = extractJwt(raw);
      if (token) { await saveJwt(token); return; }
    } catch {}
  }
}

// ─── API helpers ────────────────────────────────────────────────────────────

async function api(path: string, opts?: { body?: any; proxy?: boolean; referer?: string; signal?: AbortSignal }): Promise<any> {
  const url = `${opts?.proxy ? SITE_BASE : API_BASE}${API_PREFIX}${path}`;

  const doFetch = async (): Promise<any> => {
    const res = await fetch(url, {
      method: opts?.body ? 'POST' : 'GET',
      headers: headers({ json: !!opts?.body, proxy: opts?.proxy, referer: opts?.referer }),
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      signal: opts?.signal,
    });
    grabJwt(res);
    const json = await res.json();
    return json;
  };

  let json = await doFetch();

  // Auto-retry on invalid/expired token: clear JWT, get fresh one, retry
  if (json.code !== 0 && (json.reason === 'PARAMS_ERROR' || /invalid.?token/i.test(json.message || ''))) {
    cachedJwt = null;
    jwtLoadedFromStorage = false; // Force reload from AsyncStorage
    try { await AsyncStorage.removeItem(JWT_STORAGE_KEY); } catch {}
    await ensureJwt();
    json = await doFetch();
    // If still failing, try one more time with completely fresh state
    if (json.code !== 0 && (json.reason === 'PARAMS_ERROR' || /invalid.?token/i.test(json.message || ''))) {
      cachedJwt = null;
      jwtLoadedFromStorage = false;
      await ensureJwt();
      json = await doFetch();
    }
  }

  if (json.code !== 0) throw new Error(json.message || json.reason || 'API Error');
  return json.data;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Search for films/TV series */
export async function searchMoviebox(
  keyword: string, page: number = 0, signal?: AbortSignal,
): Promise<{ items: MovieboxSearchItem[]; totalCount: number; hasMore: boolean }> {
  // Search requires a JWT — ensure we have one first
  await ensureJwt();
  const data = await api('/subject/search', {
    body: { keyword, page, perPage: 18, subjectType: null },
    signal,
  });
  return {
    items: (data.items || []) as MovieboxSearchItem[],
    totalCount: data.pager?.totalCount || 0,
    hasMore: data.pager?.hasMore || false,
  };
}

/** Get trending content */
export async function getTrending(page: number = 0, signal?: AbortSignal): Promise<MovieboxSearchItem[]> {
  const data = await api(`/subject/trending?page=${page}&perPage=12`, { signal });
  return (data.subjectList || []) as MovieboxSearchItem[];
}

/** Get search suggestions */
export async function searchSuggest(keyword: string, signal?: AbortSignal): Promise<string[]> {
  const data = await api('/subject/search-suggest', { body: { keyword }, signal });
  return (data.items || []).map((i: any) => i.word || '').filter(Boolean);
}

/** Get streaming URLs for a movie/episode (uses site proxy for direct MP4) */
export async function getPlayStreams(
  subjectId: string, detailPath: string, season?: number, episode?: number, signal?: AbortSignal,
): Promise<MovieboxStream[]> {
  const params = new URLSearchParams({ subjectId, detailPath });
  if (season != null) params.set('se', String(season));
  if (episode != null) params.set('ep', String(episode));

  const data = await api(`/subject/play?${params}`, {
    proxy: true,
    referer: `/movies/${detailPath}`,
    signal,
  });
  return (data?.streams || []) as MovieboxStream[];
}

/** Get available subtitle/caption files for a stream */
export async function getCaptions(
  streamId: string, subjectId: string, detailPath: string, signal?: AbortSignal,
): Promise<MovieboxCaption[]> {
  const params = new URLSearchParams({ format: 'MP4', id: streamId, subjectId, detailPath });
  const data = await api(`/subject/caption?${params}`, { signal });
  return (data?.captions || []) as MovieboxCaption[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Check if a search result has Indonesian language support */
export function hasIndonesian(item: MovieboxSearchItem): boolean {
  if (item.subtitles && /indonesian/i.test(item.subtitles)) return true;
  if (item.dubs?.some(d => d.lanCode === 'id')) return true;
  if (/\[indonesian\]/i.test(item.title)) return true;
  return false;
}

/** Get the best detail path for Indonesian viewing */
export function getIndonesianDetailPath(item: MovieboxSearchItem): string {
  const idDub = item.dubs?.find(d => d.lanCode === 'id' && d.type === 0);
  if (idDub) return idDub.detailPath;
  const idSub = item.dubs?.find(d => d.lanCode === 'id' && d.type === 1);
  if (idSub) return idSub.detailPath;
  return item.detailPath;
}

/** Get available language options from dubs array */
export function getLanguageOptions(item: MovieboxSearchItem): { label: string; detailPath: string; isIndonesian: boolean }[] {
  if (!item.dubs?.length) return [{ label: 'Original', detailPath: item.detailPath, isIndonesian: false }];
  return item.dubs.map(d => ({ label: d.lanName || d.lanCode, detailPath: d.detailPath, isIndonesian: d.lanCode === 'id' }));
}
