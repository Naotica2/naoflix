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


let cachedJwt: string | null = null;
let jwtLoadedFromStorage = false;

const SEASON_CACHE_PREFIX = 'moviebox_seasons_';
const SEASON_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const sessionSeasonCache = new Map<string, MovieboxSeason[]>();

export async function clearSeasonCache(subjectId?: string): Promise<void> {
  if (subjectId) {
    for (const key of sessionSeasonCache.keys()) {
      if (key.includes(subjectId)) sessionSeasonCache.delete(key);
    }
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const matching = allKeys.filter(k => k.startsWith(SEASON_CACHE_PREFIX) && k.includes(subjectId));
      if (matching.length) await AsyncStorage.multiRemove(matching);
    } catch {}
  } else {
    sessionSeasonCache.clear();
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const matching = allKeys.filter(k => k.startsWith(SEASON_CACHE_PREFIX));
      if (matching.length) await AsyncStorage.multiRemove(matching);
    } catch {}
  }
}

function clientToken(): string {
  const ts = String(Math.floor(Date.now() / 1000));
  return `${ts},${MD5(ts.split('').reverse().join('')).toString()}`;
}

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

function isJwtValid(jwt: string | null): boolean {
  if (!jwt) return false;
  const exp = getJwtExpiry(jwt);
  return exp > 0 && Date.now() / 1000 < exp - 3600;
}

async function loadJwtFromStorage(): Promise<void> {
  if (jwtLoadedFromStorage) return;
  jwtLoadedFromStorage = true;
  try {
    const stored = await AsyncStorage.getItem(JWT_STORAGE_KEY);
    if (stored && isJwtValid(stored)) cachedJwt = stored;
  } catch {}
}

async function saveJwt(jwt: string): Promise<void> {
  cachedJwt = jwt;
  try {
    await AsyncStorage.setItem(JWT_STORAGE_KEY, jwt);
  } catch {}
}

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

function extractJwt(xUserVal: any): string | null {
  if (!xUserVal) return null;
  try {
    if (typeof xUserVal === 'object' && xUserVal.token) return xUserVal.token;
    let s = String(xUserVal);
    if (s.includes('%22') || s.includes('%7B')) s = decodeURIComponent(s);
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

async function ensureJwt(): Promise<void> {
  if (isJwtValid(cachedJwt)) return;

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

  for (const url of urls) {
    try {
      const resp = await ReactNativeBlobUtil.fetch('GET', url, commonHeaders);
      const hdrs = resp.respInfo.headers || {};

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


export async function searchMoviebox(
  keyword: string,
  page: number = 0,
  signal?: AbortSignal,
): Promise<{ items: MovieboxSearchItem[]; totalCount: number; hasMore: boolean }> {
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

export async function getTrending(
  page: number = 0,
  signal?: AbortSignal,
): Promise<MovieboxSearchItem[]> {
  const data = await api(`/subject/trending?page=${page}&perPage=12`, { signal });
  return (data.subjectList || []) as MovieboxSearchItem[];
}

export async function searchSuggest(keyword: string, signal?: AbortSignal): Promise<string[]> {
  const data = await api('/subject/search-suggest', { body: { keyword }, signal });
  return (data.items || []).map((i: any) => i.word || '').filter(Boolean);
}

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

export async function getSeasonInfo(
  subjectId: string,
  detailPath: string,
  signal?: AbortSignal,
): Promise<MovieboxSeason[]> {
  const cacheKey = `${SEASON_CACHE_PREFIX}${subjectId}_${detailPath}`;

  if (sessionSeasonCache.has(cacheKey)) {
    return sessionSeasonCache.get(cacheKey)!;
  }

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

  await ensureJwt();

  const saveToCache = async (result: MovieboxSeason[]): Promise<MovieboxSeason[]> => {
    if (result.length === 0) return result; // don't cache empty results
    sessionSeasonCache.set(cacheKey, result);
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ data: result, ts: Date.now() }));
    } catch {}
    return result;
  };
  const looksComplete = (seasons: MovieboxSeason[]): boolean => {
    if (seasons.length === 0) return false;
    return seasons.some(s => s.maxEp > 2);
  };

  let seasonHints: number[] | null = null;

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
      if (!seasonHints) seasonHints = result.map(s => s.se);
    }
  } catch {}

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
      return null;
    }
  };

  const findAvailableSeasons = async (): Promise<number[]> => {
    if (seasonHints && seasonHints.length > 0) return seasonHints;

    const MAX_SEASONS = 8;
    const results: number[] = [];

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
      if (end < MAX_SEASONS) await new Promise(r => setTimeout(r, 250));
    }
    return results;
  };

  const seasonNumbers = await findAvailableSeasons();
  if (seasonNumbers.length === 0) return [];

  // for a 10-episode season, and from ~26 to ~8 for a 25-episode season.
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
    const ep1 = await probeEp(se, 1);
    if (!ep1) return 1; // fallback

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

    if (firstMiss === -1) return lastHit;

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


export function hasIndonesian(item: MovieboxSearchItem): boolean {
  if (item.subtitles && /indonesian/i.test(item.subtitles)) return true;
  if (item.dubs?.some(d => d.lanCode === 'id')) return true;
  if (/\[indonesian\]/i.test(item.title)) return true;
  return false;
}

export function getIndonesianDetailPath(item: MovieboxSearchItem): string {
  const idDub = item.dubs?.find(d => d.lanCode === 'id' && d.type === 0);
  if (idDub) return idDub.detailPath;
  const idSub = item.dubs?.find(d => d.lanCode === 'id' && d.type === 1);
  if (idSub) return idSub.detailPath;
  return item.detailPath;
}

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
