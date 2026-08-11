/**
 * LK21 Scraper for Naoflix — drop-in replacement for moviebox.ts
 *
 * Re-exports all types and functions using the same names as moviebox
 * so existing UI components don't need any import changes.
 *
 * BASE URL is easy to update when LK21 changes domain.
 */

import { parse as parseHTML } from 'node-html-parser';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Configuration ───────────────────────────────────────────────────
export const __ALIAS = 'lk21';

// Default URLs, will be overridden by Github Remote Config if available
let BASE = 'https://tv12.lk21official.cc';
let DRAMAMU = 'https://tv7.nontondrama.my';
let SEARCH_API = 'https://gudangvape.com/search.php';
const COVER_PREFIX = 'https://cover.showcdnx.com/wp-content/uploads/';

const GITHUB_CONFIG_URL = 'https://raw.githubusercontent.com/Naotica2/naoflix/main/scraper_config.json';
let configFetched = false;

async function fetchRemoteConfig() {
  if (configFetched) return;
  try {
    const res = await fetch(GITHUB_CONFIG_URL + '?t=' + Date.now());
    if (res.ok) {
      const config = await res.json();
      if (config.lk21_base_url) BASE = config.lk21_base_url;
      if (config.lk21_dramamu_url) DRAMAMU = config.lk21_dramamu_url;
      if (config.lk21_search_api) SEARCH_API = config.lk21_search_api;
    }
  } catch (err) {
    console.log('Failed to fetch LK21 remote config, using defaults');
  }
  configFetched = true;
}

const UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

const hdrs: Record<string, string> = {
  'User-Agent': UA,
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
  Referer: `${BASE}/`,
};

// ─── Moviebox-compatible types ───────────────────────────────────────

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
  subjectType: number; // 1 = movie, 2 = tv/series
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

// ─── Caching ─────────────────────────────────────────────────────────

const SEASON_CACHE_PREFIX = 'lk21_seasons_';
const SEASON_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const sessionSeasonCache = new Map<string, MovieboxSeason[]>();

export async function clearSeasonCache(subjectId?: string): Promise<void> {
  if (subjectId) {
    for (const key of sessionSeasonCache.keys()) {
      if (key.includes(subjectId)) sessionSeasonCache.delete(key);
    }
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const matching = allKeys.filter(
        k => k.startsWith(SEASON_CACHE_PREFIX) && k.includes(subjectId),
      );
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

// ─── Internal HTTP helpers ───────────────────────────────────────────

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { headers: hdrs, signal });
  return res.text();
}

async function fetchJSON(url: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, {
    headers: {
      ...hdrs,
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
    },
    signal,
  });
  return res.json();
}

// ─── Internal parsers ────────────────────────────────────────────────

function parseArticle(el: any): MovieboxSearchItem {
  const aEl = el.querySelector('a[itemprop="url"], a');
  const imgEl = el.querySelector('img');
  const rawPoster = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';
  const poster = rawPoster.startsWith('http')
    ? rawPoster
    : rawPoster
      ? COVER_PREFIX + rawPoster
      : '';

  const href = aEl?.getAttribute('href') || '';
  const slug = href.replace(/^\//, '').replace(/\/$/, '');
  const episodeText = el.querySelector('.episode strong')?.text?.trim() || '';
  const seasonText = (el.querySelector('.duration:not([itemprop])')?.text?.trim() || '').replace('S.', '');

  return {
    subjectId: slug,
    subjectType: episodeText || seasonText ? 2 : 1, // has episode = series
    title: el.querySelector('.poster-title')?.text?.trim() || '',
    description: '',
    releaseDate: el.querySelector('.year')?.text?.trim() || '',
    genre:
      el.querySelector('meta[itemprop="genre"]')?.getAttribute('content') || '',
    cover: { url: poster, width: 300, height: 450 },
    countryName: '',
    imdbRatingValue:
      el.querySelector('.poster .rating [itemprop="ratingValue"]')?.text?.trim() ||
      (el.querySelector('.poster .rating')?.text?.match(/\d+(\.\d+)?/) || [''])[0],
    subtitles: '',
    dubs: [],
    detailPath: slug,
    hasResource: true,
  };
}

function normaliseSearchPoster(raw: string | undefined): string {
  if (!raw) return '';
  if (raw.startsWith('http')) return raw;
  return COVER_PREFIX + raw;
}

// ─── Public API (Moviebox-compatible function signatures) ─────────

/**
 * Search films/series on LK21 (via gudangvape JSON API).
 * Drop-in replacement for `searchMoviebox`.
 */
export async function searchMoviebox(
  keyword: string,
  page: number = 0,
  signal?: AbortSignal,
): Promise<{ items: MovieboxSearchItem[]; totalCount: number; hasMore: boolean }> {
  await fetchRemoteConfig();
  const url = `${SEARCH_API}?s=${encodeURIComponent(keyword)}&page=${page + 1}`;
  const data = await fetchJSON(url, signal);
  const rawItems: any[] = data?.data || data?.items || [];

  const items: MovieboxSearchItem[] = rawItems.map(it => {
    const isSeries = !!(it.episode || it.season);
    return {
      subjectId: it.slug || '',
      subjectType: isSeries ? 2 : 1,
      title: it.title || '',
      description: '',
      releaseDate: it.year || '',
      genre: it.genre || '',
      cover: {
        url: normaliseSearchPoster(it.poster),
        width: 300,
        height: 450,
      },
      countryName: '',
      imdbRatingValue: it.rating || '',
      subtitles: '',
      dubs: [],
      detailPath: it.slug || '',
      hasResource: true,
    };
  });

  const totalPages = data?.totalPages || data?.total_pages || 1;

  return {
    items,
    totalCount: items.length * totalPages,
    hasMore: (page + 1) < totalPages,
  };
}

/**
 * Get trending/latest films from LK21 homepage.
 * Drop-in replacement for `getTrending`.
 */
export async function getTrending(
  page: number = 0,
  signal?: AbortSignal,
): Promise<MovieboxSearchItem[]> {
  await fetchRemoteConfig();
  let url: string;
  if (page <= 0) {
    url = `${BASE}/`;
  } else {
    url = `${BASE}/latest/page/${page + 1}`;
  }

  const html = await fetchText(url, signal);
  const root = parseHTML(html);

  const items: MovieboxSearchItem[] = [];
  const articles = root.querySelectorAll(
    '#post-container article, .gallery-grid article',
  );
  for (const el of articles) {
    items.push(parseArticle(el));
  }

  // On the homepage (page=0), also grab slider items
  if (page <= 0) {
    const sliders = root.querySelectorAll('.widget[data-type] li.slider');
    for (const el of sliders) {
      const item = parseArticle(el);
      // Avoid duplicates
      if (item.title && !items.some(i => i.subjectId === item.subjectId)) {
        items.push(item);
      }
    }
  }

  return items;
}

/**
 * Search suggest — LK21 doesn't have this, returns empty.
 */
export async function searchSuggest(
  _keyword: string,
  _signal?: AbortSignal,
): Promise<string[]> {
  return [];
}

/**
 * Get streaming player URLs for a film/episode.
 * Returns iframe URLs from videonode as "streams".
 * Drop-in replacement for `getPlayStreams`.
 */
export async function getPlayStreams(
  subjectId: string,
  detailPath: string,
  season?: number,
  episode?: number,
  signal?: AbortSignal,
): Promise<MovieboxStream[]> {
  await fetchRemoteConfig();
  let url: string;

  if (season != null && episode != null) {
    // Series episode — use dramamu/nontondrama
    url = `${DRAMAMU}/${detailPath}`;
    // Try to get the episode page
    // First we need to get the detail page to find episode URLs
    const detailHtml = await fetchText(url, signal);
    const detailRoot = parseHTML(detailHtml);

    // Check for season data JSON
    const seasonDataEl = detailRoot.querySelector('#season-data');
    if (seasonDataEl) {
      try {
        const seasonData = JSON.parse(seasonDataEl.text);
        const seasonKey = String(season);
        const episodes = seasonData[seasonKey] || [];
        const targetEp = episodes.find(
          (e: any) => e.episode_no === episode || e.episode_no === String(episode),
        );
        if (targetEp?.slug) {
          // Load the episode page for player URLs
          const epHtml = await fetchText(`${DRAMAMU}/${targetEp.slug}`, signal);
          return parsePlayerUrls(epHtml, `${DRAMAMU}/${targetEp.slug}`);
        }
      } catch {}
    }

    // Fallback: try parsing player list from current page
    return parsePlayerUrls(detailHtml, url);
  }

  // Movie — use main LK21 domain
  url = `${BASE}/${detailPath}`;
  const html = await fetchText(url, signal);

  // Check if this is a redirect page (series at tv12 redirects to dramamu)
  const root = parseHTML(html);
  const openNow = root.querySelector('#openNow');
  if (openNow) {
    const redirectUrl = openNow.getAttribute('href') || '';
    if (redirectUrl) {
      const redirectHtml = await fetchText(redirectUrl, signal);
      return parsePlayerUrls(redirectHtml, redirectUrl);
    }
  }

  return parsePlayerUrls(html, url);
}

function parsePlayerUrls(html: string, sourceUrl: string): MovieboxStream[] {
  const root = parseHTML(html);
  const players: MovieboxStream[] = [];

  // Method 1: player-list with data-url
  const playerLinks = root.querySelectorAll(
    '#player-list a[data-url], #player-list li a',
  );
  for (const a of playerLinks) {
    const server =
      a.getAttribute('data-server') || a.text?.trim().toLowerCase() || 'unknown';
    const playerUrl = a.getAttribute('data-url') || a.getAttribute('href') || '';
    if (playerUrl && playerUrl !== '#') {
      players.push({
        format: 'IFRAME',
        id: `${server}-${players.length}`,
        url: playerUrl,
        resolutions: server,
        size: '0',
        duration: 0,
        codecName: server,
      });
    }
  }

  // Method 2: fallback — main-player iframe src
  if (players.length === 0) {
    const mainPlayer = root.querySelector('#main-player');
    const src = mainPlayer?.getAttribute('src');
    if (src) {
      players.push({
        format: 'IFRAME',
        id: 'p2p-0',
        url: src,
        resolutions: 'p2p',
        size: '0',
        duration: 0,
        codecName: 'p2p',
      });
    }
  }

  return players;
}

/**
 * Get season/episode info for a TV series.
 * Drop-in replacement for `getSeasonInfo`.
 */
export async function getSeasonInfo(
  subjectId: string,
  detailPath: string,
  signal?: AbortSignal,
): Promise<MovieboxSeason[]> {
  await fetchRemoteConfig();
  const cacheKey = `${SEASON_CACHE_PREFIX}${subjectId}`;

  // Check session cache
  if (sessionSeasonCache.has(cacheKey)) {
    return sessionSeasonCache.get(cacheKey)!;
  }

  // Check AsyncStorage cache
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

  // Fetch from LK21
  // First, try the main LK21 page (might redirect for series)
  let seriesUrl = `${BASE}/${detailPath}`;
  let html = await fetchText(seriesUrl, signal);
  let root = parseHTML(html);

  // Check for redirect to dramamu/nontondrama
  const openNow = root.querySelector('#openNow');
  if (openNow) {
    const redirectUrl = openNow.getAttribute('href') || '';
    if (redirectUrl) {
      html = await fetchText(redirectUrl, signal);
      root = parseHTML(html);
    }
  }

  const seasons: MovieboxSeason[] = [];

  // Parse #season-data JSON
  const seasonDataEl = root.querySelector('#season-data');
  if (seasonDataEl) {
    try {
      const parsed = JSON.parse(seasonDataEl.text);
      for (const [seasonKey, eps] of Object.entries(parsed)) {
        const epArray = eps as any[];
        seasons.push({
          se: parseInt(seasonKey, 10) || 1,
          maxEp: epArray.length,
          resolutions: [],
        });
      }
    } catch {}
  }

  // If no season data found, check if movie-action links indicate a single season
  if (seasons.length === 0) {
    // Try to find episode links in the page
    const epLinks = root.querySelectorAll('.movie-action a');
    if (epLinks.length > 0) {
      seasons.push({ se: 1, maxEp: 1, resolutions: [] });
    }
  }

  // Cache results
  if (seasons.length > 0) {
    sessionSeasonCache.set(cacheKey, seasons);
    try {
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({ data: seasons, ts: Date.now() }),
      );
    } catch {}
  }

  return seasons;
}

/**
 * Get captions — LK21 doesn't have a separate subtitle API.
 * Returns empty array.
 */
export async function getCaptions(
  _streamId: string,
  _subjectId: string,
  _detailPath: string,
  _signal?: AbortSignal,
): Promise<MovieboxCaption[]> {
  return [];
}

// ─── Utility functions ───────────────────────────────────────────────

/**
 * LK21 content is always Indonesian, so this always returns true.
 */
export function hasIndonesian(_item: MovieboxSearchItem): boolean {
  return true;
}

/**
 * Returns the detailPath as-is (no Indonesian-specific path for LK21).
 */
export function getIndonesianDetailPath(item: MovieboxSearchItem): string {
  return item.detailPath;
}

/**
 * Language options — LK21 only has one language per film.
 */
export function getLanguageOptions(
  item: MovieboxSearchItem,
): { label: string; detailPath: string; isIndonesian: boolean }[] {
  return [
    { label: 'Original', detailPath: item.detailPath, isIndonesian: true },
  ];
}
