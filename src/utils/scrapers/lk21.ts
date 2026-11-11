/**
 * LK21 Scraper for NaoFlix.
 * Base URLs can be overridden via Remote Config when LK21 changes domains.
 */

import { parse as parseHTML } from 'node-html-parser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRemoteConfig } from '../remoteConfig';
import { setWebViewOpen } from '../CFBypass';

export const __ALIAS = 'lk21';

// Default URLs, overridden by Github Remote Config when available
let BASE = 'https://tv12.lk21official.cc';
let DRAMAMU = 'https://tv7.nontondrama.my';
let SEARCH_API = 'https://gudangvape.com';
const COVER_PREFIX = 'https://cover.showcdnx.com/wp-content/uploads/';

async function fetchRemoteConfig() {
  const config = getRemoteConfig();
  if (config.lk21_base_url) BASE = config.lk21_base_url;
  if (config.lk21_dramamu_url) DRAMAMU = config.lk21_dramamu_url;
  if (config.lk21_search_api) SEARCH_API = config.lk21_search_api;
}

const UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

function getHeaders() {
  return {
    'User-Agent': UA,
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
    Referer: `${BASE}/`,
  };
}

import { FilmSearchItem, FilmSeason, FilmStream, FilmCaption } from '../../types/film';

const SEASON_CACHE_PREFIX = 'lk21_seasons_v2_';
const SEASON_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const sessionSeasonCache = new Map<string, FilmSeason[]>();

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

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { headers: getHeaders(), signal });
  if (res.status === 403 || res.status === 503) {
    setWebViewOpen.openWebViewCF(true, url);
    throw new Error('Silahkan selesaikan captcha');
  }
  const text = await res.text();
  // Cloudflare sometimes returns 200 with a challenge page
  if (text.includes('Just a moment') && text.includes('challenge-platform')) {
    setWebViewOpen.openWebViewCF(true, url);
    throw new Error('Silahkan selesaikan captcha');
  }
  return text;
}

async function fetchJSON(url: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, {
    headers: {
      ...getHeaders(),
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
    },
    signal,
  });
  if (res.status === 403 || res.status === 503) {
    setWebViewOpen.openWebViewCF(true, url);
    throw new Error('Silahkan selesaikan captcha');
  }
  return res.json();
}

function parseArticle(el: any): FilmSearchItem {
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
    id: slug,
    title: el.querySelector('.poster-title')?.text?.trim() || '',
    poster: poster,
    type: episodeText || seasonText ? 'TV' : 'Movie',
    quality: el.querySelector('.quality')?.text?.trim() || '',
    rating: el.querySelector('.poster .rating [itemprop="ratingValue"]')?.text?.trim() ||
      (el.querySelector('.poster .rating')?.text?.match(/\d+(\.\d+)?/) || [''])[0] || '',
    year: el.querySelector('.year')?.text?.trim() || '',
    genres: (el.querySelector('meta[itemprop="genre"]')?.getAttribute('content') || '').split(',').map((s: string) => s.trim()).filter(Boolean),
    source: 'lk21',
  };
}

function normaliseSearchPoster(raw: string | undefined): string {
  if (!raw) return '';
  if (raw.startsWith('http')) return raw;
  return COVER_PREFIX + raw;
}

/**
 * Search films/series on LK21.
 */
export async function searchFilm(
  keyword: string,
  page: number = 1,
  signal?: AbortSignal,
): Promise<{ items: FilmSearchItem[]; totalCount: number; hasMore: boolean }> {
  await fetchRemoteConfig();
  const url = `${SEARCH_API}/search.php?s=${encodeURIComponent(keyword)}&page=${page}`;

  try {
    const res = await fetch(url, { headers: getHeaders(), signal });
    if (!res.ok) throw new Error(`lk21 search returned ${res.status}`);
    const json = await res.json();
    
    const items: FilmSearchItem[] = [];
    const dataList = json.data || json.items || [];
    
    for (const item of dataList) {
      if (!item.title) continue;
      items.push({
        id: item.slug || item.id,
        title: item.title,
        poster: normaliseSearchPoster(item.poster),
        type: item.type === 'series' || item.season ? 'TV' : 'Movie',
        quality: item.quality || '',
        rating: String(item.rating || ''),
        year: String(item.year || ''),
        genres: [], // JSON doesn't provide genres in search
        source: 'lk21',
      });
    }

    const totalPages = Number(json.totalPages || json.total_pages || 1);
    const hasMore = page < totalPages;

    return {
      items,
      totalCount: items.length,
      hasMore,
    };
  } catch (e) {
    console.error('lk21 search error:', e);
    return { items: [], totalCount: 0, hasMore: false };
  }
}

/**
 * Get trending/latest films from LK21 homepage.
 */
export async function getTrending(
  page: number = 0,
  signal?: AbortSignal,
): Promise<FilmSearchItem[]> {
  await fetchRemoteConfig();
  let url: string;
  if (page <= 0) {
    url = `${BASE}/`;
  } else {
    url = `${BASE}/latest/page/${page + 1}`;
  }

  const html = await fetchText(url, signal);
  const root = parseHTML(html);

  const items: FilmSearchItem[] = [];
  const articles = root.querySelectorAll(
    '#post-container article, .gallery-grid article',
  );
  for (const el of articles) {
    items.push(parseArticle(el));
  }

  if (page <= 0) {
    const sliders = root.querySelectorAll('.widget[data-type] li.slider');
    for (const el of sliders) {
      const item = parseArticle(el);
      if (item.title && !items.some(i => i.id === item.id)) {
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
 */
export async function getPlayStreams(
  subjectId: string,
  detailPath: string,
  season?: number,
  episode?: number,
  signal?: AbortSignal,
): Promise<FilmStream[]> {
  await fetchRemoteConfig();
  let url: string;

  if (season != null && episode != null) {
    url = `${DRAMAMU}/${detailPath}`;
    const detailHtml = await fetchText(url, signal);
    const detailRoot = parseHTML(detailHtml);

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
          const epHtml = await fetchText(`${DRAMAMU}/${targetEp.slug}`, signal);
          return await parsePlayerUrls(epHtml, `${DRAMAMU}/${targetEp.slug}`, signal);
        }
      } catch {}
    }

    return await parsePlayerUrls(detailHtml, url, signal);
  }

  url = `${BASE}/${detailPath}`;
  const html = await fetchText(url, signal);

  // Check if this is a redirect page (series at tv12 redirects to dramamu)
  const root = parseHTML(html);
  const openNow = root.querySelector('#openNow');
  if (openNow) {
    const redirectUrl = openNow.getAttribute('href') || '';
    if (redirectUrl) {
      const redirectHtml = await fetchText(redirectUrl, signal);
      return await parsePlayerUrls(redirectHtml, redirectUrl, signal);
    }
  }

  return await parsePlayerUrls(html, url, signal);
}

/**
 * Resolve a videonode.de wrapper URL to its real inner player URL.
 * videonode.de pages contain an ad overlay + a nested iframe with the actual player.
 * We fetch the videonode HTML and extract the real iframe src from .embed-container.
 */
async function resolveVideonodeUrl(videonodeUrl: string, signal?: AbortSignal): Promise<string> {
  try {
    const html = await fetchText(videonodeUrl, signal);
    // Extract iframe src from: <div class="embed-container"><iframe src="https://playcdn.de/...">
    const iframeMatch = html.match(
      /class=["']embed-container["'][^>]*>\s*<iframe[^>]+src=["']([^"']+)["']/i,
    );
    if (iframeMatch?.[1]) {
      return iframeMatch[1].replace(/&amp;/g, '&');
    }
  } catch {}
  return videonodeUrl;
}

async function parsePlayerUrls(html: string, sourceUrl: string, signal?: AbortSignal): Promise<FilmStream[]> {
  const root = parseHTML(html);
  const streams: FilmStream[] = [];
  const resolvePromises: { stream: FilmStream; videonodeUrl: string }[] = [];

  const mainPlayer = root.querySelector('#main-player');
  const src = mainPlayer?.getAttribute('src');
  if (src) {
    const stream: FilmStream = {
      id: 'server-0',
      url: src,
      headers: { Referer: sourceUrl },
      resolutions: 'Default',
      codecName: 'Default',
    };
    streams.push(stream);
    if (src.includes('videonode')) {
      resolvePromises.push({ stream, videonodeUrl: src });
    }
  }

  const playerLinks = root.querySelectorAll('#player-list a[data-url]');
  for (const a of playerLinks) {
    const server = a.getAttribute('data-server') || a.text?.trim().toLowerCase() || 'unknown';
    const playerUrl = a.getAttribute('data-url') || '';
    if (playerUrl && playerUrl !== '#' && playerUrl !== src) {
      if (playerUrl.includes('embed') || !playerUrl.includes('lk21')) {
        const stream: FilmStream = {
          id: `${server}-${streams.length}`,
          url: playerUrl,
          headers: { Referer: sourceUrl },
          resolutions: server,
          codecName: server,
        };
        streams.push(stream);
        if (playerUrl.includes('videonode')) {
          resolvePromises.push({ stream, videonodeUrl: playerUrl });
        }
      }
    }
  }

  // Resolve videonode wrapper URLs to real player URLs in parallel
  if (resolvePromises.length > 0) {
    const resolved = await Promise.allSettled(
      resolvePromises.map(({ videonodeUrl }) => resolveVideonodeUrl(videonodeUrl, signal)),
    );
    for (let i = 0; i < resolvePromises.length; i++) {
      const result = resolved[i];
      if (result.status === 'fulfilled' && result.value !== resolvePromises[i].videonodeUrl) {
        resolvePromises[i].stream.url = result.value;
        if (result.value.includes('playcdn')) {
          resolvePromises[i].stream.headers = { Referer: 'https://videonode.de/' };
        }
      }
    }
  }

  return streams;
}

/**
 * Get season/episode info for a TV series.
 */
export async function getSeasonInfo(
  subjectId: string,
  detailPath: string,
  signal?: AbortSignal,
): Promise<FilmSeason[]> {
  await fetchRemoteConfig();
  const cacheKey = `${SEASON_CACHE_PREFIX}${subjectId}`;

  if (sessionSeasonCache.has(cacheKey)) {
    return sessionSeasonCache.get(cacheKey)!;
  }

  try {
    const stored = await AsyncStorage.getItem(cacheKey);
    if (stored) {
      const { data, ts } = JSON.parse(stored);
      if (Date.now() - ts < SEASON_CACHE_TTL_MS && Array.isArray(data) && data.length > 0) {
        sessionSeasonCache.set(cacheKey, data);
        return data as FilmSeason[];
      }
    }
  } catch {}

  let seriesUrl = `${BASE}/${detailPath}`;
  let html = await fetchText(seriesUrl, signal);
  let root = parseHTML(html);

  // Series on main domain redirect to dramamu/nontondrama via #openNow
  const openNow = root.querySelector('#openNow');
  if (openNow) {
    const redirectUrl = openNow.getAttribute('href') || '';
    if (redirectUrl) {
      html = await fetchText(redirectUrl, signal);
      root = parseHTML(html);
    }
  }

  const seasons: FilmSeason[] = [];

  const seasonDataEl = root.querySelector('#season-data');
  if (seasonDataEl) {
    try {
      const parsed = JSON.parse(seasonDataEl.text);
      for (const [seasonKey, eps] of Object.entries(parsed)) {
        const epArray = eps as any[];
        const seasonNum = parseInt(seasonKey, 10) || 1;
        seasons.push({
          seasonNumber: seasonNum,
          episodes: Array.from({ length: epArray.length }, (_, i) => i + 1),
          se: seasonNum,
          maxEp: epArray.length,
        });
      }
    } catch {}
  }

  // If no season data found, check if movie-action links indicate a single season
  if (seasons.length === 0) {
    const epLinks = root.querySelectorAll('.movie-action a');
    if (epLinks.length > 0) {
      seasons.push({ seasonNumber: 1, episodes: [1], se: 1, maxEp: 1 });
    }
  }

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

export async function getFilmDetails(
  subjectId: string,
  detailPath: string,
  signal?: AbortSignal,
): Promise<{ description: string }> {
  await fetchRemoteConfig();
  const url = `${BASE}/${detailPath}`;
  try {
    const html = await fetchText(url, signal);
    const root = parseHTML(html);

    const openNow = root.querySelector('#openNow');
    if (openNow) {
      const redirectUrl = openNow.getAttribute('href') || '';
      if (redirectUrl) {
        const redirectHtml = await fetchText(redirectUrl, signal);
        const redirectRoot = parseHTML(redirectHtml);
        const desc = redirectRoot.querySelector('blockquote')?.text?.trim() || redirectRoot.querySelector('.content-post p')?.text?.trim() || redirectRoot.querySelector('[itemprop="description"]')?.text?.trim() || '';
        return { description: desc };
      }
    }

    const desc = root.querySelector('blockquote')?.text?.trim() || root.querySelector('.content-post p')?.text?.trim() || root.querySelector('[itemprop="description"]')?.text?.trim() || '';
    return { description: desc };
  } catch {
    return { description: '' };
  }
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
): Promise<FilmCaption[]> {
  return [];
}

/**
 * LK21 content is always Indonesian, so this always returns true.
 */
export function hasIndonesian(_item: FilmSearchItem): boolean {
  return true;
}

/**
 * Returns the detailPath as-is (no Indonesian-specific path for LK21).
 */
export function getIndonesianDetailPath(item: FilmSearchItem): string {
  return item.id;
}

/**
 * Language options — LK21 only has one language per film.
 */
export function getLanguageOptions(
  item: FilmSearchItem,
): { label: string; detailPath: string; isIndonesian: boolean }[] {
  return [
    { label: 'Original', detailPath: item.id, isIndonesian: true },
  ];
}
