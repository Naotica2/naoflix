import MD5 from 'crypto-js/md5';
import ReactNativeBlobUtil from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const __ALIAS = 'moviebox';

const API_BASE = 'https://h5-api.aoneroom.com';
const SITE_BASE = 'https://movie-box.co';
const API_PREFIX = '/wefeed-h5api-bff';
const UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const JWT_STORAGE_KEY = 'moviebox_jwt';

// ─── Types ──────────────────────────────────────────────────────────────────

export type MovieboxCover = { url: string; width: number; height: number };
export type MovieboxDub = {
  lanName: string;
  lanCode: string;
  original: boolean;
  type: number;
  detailPath: string;
};
export type MovieboxSearchItem = {
  subjectId: string;
  subjectType: number;
  title: string;
  description: string;
  releaseDate: string;
  genre: string;
  cover: MovieboxCover;
  countryName: string;
  imdbRatingValue: string;
  subtitles: string;
  dubs: MovieboxDub[];
  detailPath: string;
  hasResource: boolean;
};
export type MovieboxSeason = {
  se: number;
  maxEp: number;
  resolutions: { resolution: number; epNum: number }[];
};
export type MovieboxStream = {
  format: string;
  id: string;
  url: string;
  resolutions: string;
  size: string;
  duration: number;
  codecName: string;
};
export type MovieboxCaption = {
  id: string;
  lan: string;
  lanName: string;
  url: string;
  size: string;
  delay: number;
};

// ─── Auth (X-Client-Token based — same as the website) ─────────────────────

let cachedJwt: string | null = null;
let jwtLoadedFromStorage = false;

// ─── Season Info Cache ───────────────────────────────────────────────────────
// Two-layer cache to avoid re-fetching season/episode data on every open:
//   1. sessionCache (Map) — in-memory, instant, lives until app restart
//   2. AsyncStorage      — persists across restarts, TTL = 6 hours
const SEASON_CACHE_PREFIX = 'moviebox_seasons_';
const SEASON_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const sessionSeasonCache = new Map<string, MovieboxSeason[]>();

/** Clear season cache for a specific show or all shows */
export async function clearSeasonCache(subjectId?: string): Promise<void> {
  if (subjectId) {
    // Clear specific show
    for (const key of sessionSeasonCache.keys()) {
      if (key.includes(subjectId)) sessionSeasonCache.delete(key);
    }
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const matching = allKeys.filter(k => k.startsWith(SEASON_CACHE_PREFIX) && k.includes(subjectId));
      if (matching.length) await AsyncStorage.multiRemove(matching);
    } catch {}
  } else {
    // Clear all
    sessionSeasonCache.clear();
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const matching = allKeys.filter(k => k.startsWith(SEASON_CACHE_PREFIX));
      if (matching.length) await AsyncStorage.multiRemove(matching);
    } catch {}
  }
}

/** Generate guest fingerprint: "<timestamp>,<MD5(reversed_timestamp)>" */
function clientToken(): string {
  const ts = String(Math.floor(Date.now() / 1000));
  return `${ts},${MD5(ts.split('').reverse().join('')).toString()}`;
}

/** Build request headers with auto-generated X-Client-Token */
function headers(opts?: {
  json?: boolean;
  proxy?: boolean;
  referer?: string;
}): Record<string, string> {
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
  } catch {
    return 0;
  }
}

/** Check if JWT is still valid (1 hour safety margin) */
function isJwtValid(jwt: string | null): boolean {
  if (!jwt) return false;
  const exp = getJwtExpiry(jwt);
  return exp > 0 && Date.now() / 1000 < exp - 3600;
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
  try {
    await AsyncStorage.setItem(JWT_STORAGE_KEY, jwt);
  } catch {}
}

/** Try to grab JWT from x-user response header and persist it */
function grabJwt(res: Response): void {
  try {
    let xUser: string | null = null;
    res.headers.forEach((v, k) => {
      if (k.toLowerCase() === 'x-user') xUser = v;
    });
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
      try {
        s = JSON.parse(s);
      } catch {}
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
      const raw =
        hdrs['x-user'] ||
        hdrs['X-User'] ||
        hdrs['X-USER'] ||
        hdrs['x-User'] ||
        hdrs['X-user'] ||
        hdrs.x_user;
      const fromXUser = extractJwt(raw);
      if (fromXUser) {
        await saveJwt(fromXUser);
        return;
      }

      // Try Set-Cookie header (server sends: Set-Cookie: token=eyJ...)
      const setCookie = hdrs['set-cookie'] || hdrs['Set-Cookie'] || hdrs['Set-cookie'];
      if (setCookie) {
        const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
        const match = cookieStr.match(/token=(eyJ[^;]+)/);
        if (match && match[1]) {
          await saveJwt(match[1]);
          return;
        }
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
      if (token) {
        await saveJwt(token);
        return;
      }
    } catch {}
  }
}

// ─── API helpers ────────────────────────────────────────────────────────────

async function api(
  path: string,
  opts?: { body?: any; proxy?: boolean; referer?: string; signal?: AbortSignal },
): Promise<any> {
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
  if (
    json.code !== 0 &&
    (json.reason === 'PARAMS_ERROR' || /invalid.?token|unauthorized|auth/i.test(json.message || ''))
  ) {
    cachedJwt = null;
    jwtLoadedFromStorage = false; // Force reload from AsyncStorage
    try {
      await AsyncStorage.removeItem(JWT_STORAGE_KEY);
    } catch {}
    await ensureJwt();
    json = await doFetch();
    // If still failing, try one more time with completely fresh state
    if (
      json.code !== 0 &&
      (json.reason === 'PARAMS_ERROR' || /invalid.?token|unauthorized|auth/i.test(json.message || ''))
    ) {
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
  keyword: string,
  page: number = 0,
  signal?: AbortSignal,
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
export async function getTrending(
  page: number = 0,
  signal?: AbortSignal,
): Promise<MovieboxSearchItem[]> {
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
  subjectId: string,
  detailPath: string,
  season?: number,
  episode?: number,
  signal?: AbortSignal,
): Promise<MovieboxStream[]> {
  const params = new URLSearchParams({ subjectId, detailPath });
  if (season != null) params.set('se', String(season));
  if (episode != null) params.set('ep', String(episode));

  await ensureJwt();

  const data = await api(`/subject/play?${params}`, {
    proxy: true,
    referer: `/movies/${detailPath}`,
    signal,
  });
  return (data?.streams || []) as MovieboxStream[];
}

/**
 * Get season & episode info for a TV series.
 * Discovers available seasons and their max episodes from the play API.
 *
 * Strategy 1 : Call play endpoint without se/ep — API may return seasons/episodeList directly.
 * Strategy 1.5: Call the dedicated /subject/episode endpoint.
 * Strategy 2 : Sequential season discovery using raw fetch (no throw) so API
 *              "episode not found" errors (code≠0) are treated as "season absent".
 * Strategy 3 : Parallel max-episode binary search for all discovered seasons.
 */
export async function getSeasonInfo(
  subjectId: string,
  detailPath: string,
  signal?: AbortSignal,
): Promise<MovieboxSeason[]> {
  const cacheKey = `${SEASON_CACHE_PREFIX}${subjectId}_${detailPath}`;

  // ── Layer 1: session cache (instant, no I/O) ──────────────────────────────
  if (sessionSeasonCache.has(cacheKey)) {
    return sessionSeasonCache.get(cacheKey)!;
  }

  // ── Layer 2: AsyncStorage cache with 6h TTL ───────────────────────────────
  try {
    const stored = await AsyncStorage.getItem(cacheKey);
    if (stored) {
      const { data, ts } = JSON.parse(stored);
      if (Date.now() - ts < SEASON_CACHE_TTL_MS && Array.isArray(data) && data.length > 0) {
        sessionSeasonCache.set(cacheKey, data);
        return data as MovieboxSeason[];
      }
    }
  } catch {}

  // Ensure we have a valid JWT before firing any requests.
  // Without this, every request silently fails with an auth error and
  // getSeasonInfo returns [] — which shows "Gagal memuat daftar episode".
  await ensureJwt();

  /** Persist result to both caches and return it */
  const saveToCache = async (result: MovieboxSeason[]): Promise<MovieboxSeason[]> => {
    if (result.length === 0) return result; // don't cache empty results
    sessionSeasonCache.set(cacheKey, result);
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ data: result, ts: Date.now() }));
    } catch {}
    return result;
  };
  // Helper: check if season data looks complete (not just 1-2 eps per season)
  const looksComplete = (seasons: MovieboxSeason[]): boolean => {
    if (seasons.length === 0) return false;
    // If ANY season has more than 2 episodes, we trust the data
    return seasons.some(s => s.maxEp > 2);
  };

  // We'll collect season hints from Strategy 1/1.5 for use in Strategy 2
  let seasonHints: number[] | null = null;

  // ── Strategy 1: call play without se/ep ──────────────────────────────────
  try {
    const plain = new URLSearchParams({ subjectId, detailPath });
    const plainData = await api(`/subject/play?${plain}`, {
      proxy: true,
      referer: `/movies/${detailPath}`,
      signal,
    });
    if (plainData?.seasons?.length) {
      const seasons = plainData.seasons as MovieboxSeason[];
      if (looksComplete(seasons)) {
        return saveToCache(seasons);
      }
      // Save season numbers as hints even if episode counts are wrong
      seasonHints = seasons.map((s: MovieboxSeason) => s.se);
    }
    if (plainData?.episodeList?.length) {
      const map = new Map<number, number>();
      for (const ep of plainData.episodeList) {
        const s = ep.se || 1;
        map.set(s, Math.max(map.get(s) || 0, ep.ep || 1));
      }
      const result = Array.from(map.entries())
        .sort(([a], [b]) => a - b)
        .map(([se, maxEp]) => ({ se, maxEp, resolutions: [] }));
      if (looksComplete(result)) {
        return saveToCache(result);
      }
      // Save season numbers as hints
      if (!seasonHints) seasonHints = result.map(s => s.se);
    }
  } catch {}

  // ── Strategy 1.5: dedicated episode-list endpoint ────────────────────────
  try {
    const epParams = new URLSearchParams({ subjectId, detailPath });
    const epData = await api(`/subject/episode?${epParams}`, {
      proxy: true,
      referer: `/movies/${detailPath}`,
      signal,
    });
    const list: any[] = epData?.list || epData?.items || epData?.episodes || [];
    if (list.length) {
      const map = new Map<number, number>();
      for (const ep of list) {
        const s = ep.se ?? ep.season ?? 1;
        const e = ep.ep ?? ep.episode ?? ep.num ?? 1;
        map.set(s, Math.max(map.get(s) || 0, e));
      }
      if (map.size > 0) {
        const result = Array.from(map.entries())
          .sort(([a], [b]) => a - b)
          .map(([se, maxEp]) => ({ se, maxEp, resolutions: [] }));
        if (looksComplete(result)) {
          return saveToCache(result);
        }
        if (!seasonHints) seasonHints = result.map(s => s.se);
      }
    }
  } catch {}

  // ── Strategy 2: sequential season discovery (raw fetch — no throw) ────────
  //
  // IMPORTANT: api() throws when code !== 0. When a season doesn't exist the
  // server returns a non-zero code, which previously caused an exception that
  // was caught and treated as "connection failure", rapidly filling emptyCount
  // and aborting discovery before any season was confirmed.
  //
  // We now do a raw fetch so we can inspect the response ourselves.
  const rawPlay = async (params: URLSearchParams): Promise<any | null> => {
    const doRequest = async (): Promise<any | null> => {
      const url = `${SITE_BASE}${API_PREFIX}/subject/play?${params}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: headers({ proxy: true, referer: `/movies/${detailPath}` }),
        signal,
      });
      grabJwt(res);
      return res.json();
    };

    try {
      let json = await doRequest();

      // If we get an auth error, refresh JWT and retry once
      if (
        json?.code !== 0 &&
        (json?.reason === 'PARAMS_ERROR' || /invalid.?token|unauthorized|auth/i.test(json?.message || ''))
      ) {
        cachedJwt = null;
        jwtLoadedFromStorage = false;
        await ensureJwt();
        json = await doRequest();
      }

      // code === 0 → success with data; anything else → season absent
      if (json?.code === 0) return json.data ?? null;
      return null;
    } catch {
      // Network-level failure — return null so this season is skipped
      return null;
    }
  };

  const findAvailableSeasons = async (): Promise<number[]> => {
    // If Strategy 1/1.5 already told us which seasons exist, skip scanning
    if (seasonHints && seasonHints.length > 0) return seasonHints;

    const MAX_SEASONS = 8;
    const results: number[] = [];

    // Probe in parallel batches of 4 for speed
    for (let start = 1; start <= MAX_SEASONS; start += 4) {
      const end = Math.min(start + 3, MAX_SEASONS);
      const batch: Promise<{ se: number; ok: boolean }>[] = [];
      for (let se = start; se <= end; se++) {
        const p = new URLSearchParams({ subjectId, detailPath, se: String(se), ep: '1' });
        batch.push(
          rawPlay(p)
            .then(d => ({ se, ok: !!(d?.streams?.length) }))
            .catch(() => ({ se, ok: false }))
        );
      }
      const batchResults = await Promise.all(batch);
      for (const r of batchResults) {
        if (r.ok) results.push(r.se);
      }
      // Small delay between batches
      if (end < MAX_SEASONS) await new Promise(r => setTimeout(r, 250));
    }
    return results;
  };

  const seasonNumbers = await findAvailableSeasons();
  if (seasonNumbers.length === 0) return [];

  // ── Strategy 3: exponential probe + binary search episode discovery ─────────
  // Instead of linear scanning (1,2,3,4...) which takes O(n) requests per season,
  // we use exponential probing (1,8,16,32) to find the upper bound, then binary
  // search between last hit and first miss. This reduces requests from ~12 to ~6
  // for a 10-episode season, and from ~26 to ~8 for a 25-episode season.
  // Seasons are scanned in parallel with concurrency limit of 2.
  const BASE_DELAY = 350; // ms between probes
  const JITTER = 150;     // random extra delay

  const probeDelay = () =>
    new Promise(r => setTimeout(r, BASE_DELAY + Math.floor(Math.random() * JITTER)));

  const probeEp = async (se: number, ep: number): Promise<boolean> => {
    const mp = new URLSearchParams({ subjectId, detailPath, se: String(se), ep: String(ep) });
    const md = await rawPlay(mp);
    return !!(md?.streams?.length);
  };

  const findMaxEp = async (se: number): Promise<number> => {
    // Phase 1: Confirm ep 1 exists
    const ep1 = await probeEp(se, 1);
    if (!ep1) return 1; // fallback

    // Phase 2: Exponential probe to find upper bound
    // Probe 8, 16, 32, 50 — find where episodes stop existing
    const PROBES = [8, 16, 32, 50];
    let lastHit = 1;
    let firstMiss = -1;

    for (const ep of PROBES) {
      await probeDelay();
      const exists = await probeEp(se, ep).catch(() => false);
      if (exists) {
        lastHit = ep;
      } else {
        firstMiss = ep;
        break;
      }
    }

    // If all probes hit (even 50), cap at 50
    if (firstMiss === -1) return lastHit;

    // Phase 3: Binary search between lastHit and firstMiss
    let lo = lastHit;
    let hi = firstMiss;

    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      await probeDelay();
      const exists = await probeEp(se, mid).catch(() => false);
      if (exists) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    return Math.max(lo, 1);
  };

  // Scan seasons in PARALLEL with concurrency limit of 2
  const CONCURRENCY = 2;
  const maxEpResults: number[] = new Array(seasonNumbers.length).fill(1);

  for (let i = 0; i < seasonNumbers.length; i += CONCURRENCY) {
    const batch = seasonNumbers.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(se => findMaxEp(se).catch(() => 1))
    );
    results.forEach((maxEp, j) => {
      maxEpResults[i + j] = maxEp;
    });
  }

  const finalResult = seasonNumbers.map((se, i) => ({
    se,
    maxEp: maxEpResults[i],
    resolutions: [],
  }));
  return saveToCache(finalResult);
}

/** Get available subtitle/caption files for a stream */
export async function getCaptions(
  streamId: string,
  subjectId: string,
  detailPath: string,
  signal?: AbortSignal,
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
export function getLanguageOptions(
  item: MovieboxSearchItem,
): { label: string; detailPath: string; isIndonesian: boolean }[] {
  if (!item.dubs?.length)
    return [{ label: 'Original', detailPath: item.detailPath, isIndonesian: false }];
  return item.dubs.map(d => ({
    label: d.lanName || d.lanCode,
    detailPath: d.detailPath,
    isIndonesian: d.lanCode === 'id',
  }));
}
