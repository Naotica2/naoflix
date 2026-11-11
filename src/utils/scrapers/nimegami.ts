import cheerio from 'cheerio';
import {
  AniDetail,
  AniDetailEpsList,
  AniStreaming,
  CarouselItem,
  EpisodeBaruHome,
  NewAnimeList,
  SearchAnime,
  SearchAnimeList,
  listAnimeTypeList,
} from '../../types/anime';
import deviceUserAgent from '../deviceUserAgent';
import cleanSynopsis from '../cleanSynopsis';
import { DatabaseManager } from '../DatabaseManager';
import {
  extractFiledonVideoUrl,
  extractVideoFromEmbed,
  normalizeDirectDownloadUrl,
} from './animeindo';

export const __ALIAS = 'nimegami';
export const BASE_URL = 'https://nimegami.id';

const CACHE_TTL_SHORT = 5 * 60 * 1000;
const CACHE_TTL_LONG = 60 * 60 * 1000;

const memoryCache = new Map<string, { data: any; expiry: number }>();

interface RscStreamItem {
  episodeKey: string;
  quality: string;
  playUrl: string;
  mode: string;
  host: string;
  provider: string;
  label: string;
}

interface SeriesStreamMeta {
  title: string;
  thumbnailUrl: string;
  sortedEpKeys: string[];
  episodesMap: Map<string, RscStreamItem[]>;
}

const seriesStreamCache = new Map<string, { meta: SeriesStreamMeta; expiry: number }>();

function getCached<T>(key: string): T | null {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    memoryCache.delete(key);
    return null;
  }
  return item.data as T;
}

function setCache<T>(key: string, data: T, ttl: number = CACHE_TTL_SHORT): void {
  memoryCache.set(key, { data, expiry: Date.now() + ttl });
}

export function flushCache(): void {
  memoryCache.clear();
}

const DEFAULT_HEADERS = {
  'User-Agent': deviceUserAgent,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: 'https://nimegami.id/',
};

async function fetchHtml(url: string, signal?: AbortSignal, timeoutMs: number = 10000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort);

  try {
    const res = await fetch(url, {
      headers: DEFAULT_HEADERS,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} on ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Normalizes poster URLs from Next.js image proxy to direct clean URLs
 */
export function normalizePoster(rawUrl?: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();

  url = url.replace(/&amp;/g, '&');

  // Unwrap Next.js optimized image proxy URLs (/ _next/image/?url=...)
  if (url.includes('/_next/image') && url.includes('url=')) {
    try {
      const match = url.match(/[?&]url=([^&]+)/);
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1]);
        if (decoded.startsWith('http')) return decoded;
        if (decoded.startsWith('/')) return `${BASE_URL}${decoded}`;
      }
    } catch {}
  }

  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${BASE_URL}${url}`;
  return url;
}

/**
 * Extracts and unescapes React Server Components (RSC) push payload from Next.js App Router HTML
 * using a linear scanner safe for Hermes (avoids lazy multiline regex truncation on nested quotes).
 */
function extractRscText(html: string): string {
  const parts: string[] = [];
  const marker = 'self.__next_f.push(';
  let pos = 0;

  while (pos < html.length) {
    const idx = html.indexOf(marker, pos);
    if (idx === -1) break;
    const i = idx + marker.length;
    const prefix = html.slice(i, i + 24).match(/^\[\s*\d+\s*,\s*"/);
    if (!prefix) {
      pos = i;
      continue;
    }

    const qStart = i + prefix[0].length - 1;
    let j = qStart + 1;
    let escaped = false;
    while (j < html.length) {
      const ch = html[j];
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        break;
      }
      j++;
    }

    if (j < html.length) {
      const literal = html.slice(qStart, j + 1);
      try {
        const decoded = JSON.parse(literal);
        if (typeof decoded === 'string') {
          parts.push(decoded);
        }
      } catch {
        parts.push(
          html
            .slice(qStart + 1, j)
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\\\/g, '\\'),
        );
      }
      pos = j + 1;
    } else {
      break;
    }
  }

  return parts.join('\n');
}

function normalizeQualityLabel(raw?: string): string {
  const q = (raw || '').trim();
  const match = q.match(/(360|480|720|1080)p?/i);
  if (match) return `${match[1]}p`;
  return q || 'Original';
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts all episode/movie stream objects from Next.js RSC flight payload.
 * Uses brace-balanced JSON parsing and strict slug scoping so sidebar/recommendation
 * anime streams can never leak into the current anime's episode list.
 */
function extractRscStreamObjects(rscText: string, expectedSlug: string): RscStreamItem[] {
  const results: RscStreamItem[] = [];
  if (!rscText) return results;

  const expectedPrefix = `/${expectedSlug.toLowerCase()}/streaming/`;
  let searchPos = 0;

  while (searchPos < rscText.length) {
    const playIdx = rscText.indexOf('"playUrl"', searchPos);
    if (playIdx === -1) break;
    searchPos = playIdx + 9;

    const minStart = Math.max(0, playIdx - 900);
    let parsedObj: any = null;

    // Scan backward from playIdx for candidate '{' starts, closest first
    for (let s = playIdx - 1; s >= minStart; s--) {
      if (rscText[s] !== '{') continue;

      let depth = 0;
      let inStr = false;
      let esc = false;
      let endIdx = -1;
      const limit = Math.min(rscText.length, playIdx + 1200);

      for (let k = s; k < limit; k++) {
        const ch = rscText[k];
        if (inStr) {
          if (esc) {
            esc = false;
          } else if (ch === '\\') {
            esc = true;
          } else if (ch === '"') {
            inStr = false;
          }
        } else {
          if (ch === '"') {
            inStr = true;
          } else if (ch === '{') {
            depth++;
          } else if (ch === '}') {
            depth--;
            if (depth === 0) {
              endIdx = k;
              break;
            }
          }
        }
      }

      if (endIdx !== -1 && endIdx > playIdx) {
        try {
          const obj = JSON.parse(rscText.slice(s, endIdx + 1));
          if (obj && typeof obj === 'object' && 'playUrl' in obj) {
            parsedObj = obj;
            break;
          }
        } catch {}
      }
    }

    if (!parsedObj) continue;

    const kind = String(parsedObj.kind || '').toLowerCase();
    if (kind === 'batch') continue;

    const rawPlayUrl = String(parsedObj.playUrl || parsedObj.url || '').trim();
    if (!rawPlayUrl) continue;

    // Strict slug guard for internal /streaming/ paths
    if (rawPlayUrl.startsWith('/') && rawPlayUrl.toLowerCase().includes('/streaming/')) {
      if (!rawPlayUrl.toLowerCase().startsWith(expectedPrefix)) {
        continue;
      }
    }

    let episodeKey = '';
    if (kind === 'movie') {
      const mNum = parsedObj.episode != null ? String(parsedObj.episode).trim() : '1';
      episodeKey = `movie_${mNum || '1'}`;
    } else if (parsedObj.episode != null && String(parsedObj.episode).trim() !== '') {
      episodeKey = String(parsedObj.episode).trim();
    } else {
      const tokenEp = rawPlayUrl.match(/\/streaming\/(\d+|movie_\d+)\//i);
      if (tokenEp?.[1]) {
        episodeKey = tokenEp[1].toLowerCase();
      }
    }

    if (!episodeKey) continue;

    results.push({
      episodeKey,
      quality: normalizeQualityLabel(parsedObj.quality),
      playUrl: rawPlayUrl,
      mode: String(parsedObj.mode || '').toLowerCase(),
      host: String(parsedObj.host || '').toLowerCase(),
      provider: String(parsedObj.provider || ''),
      label: String(parsedObj.label || parsedObj.provider || ''),
    });
  }

  return results;
}

function getStreamHostPriority(item: RscStreamItem): number {
  const u = item.playUrl.toLowerCase();
  const h = item.host.toLowerCase();
  if (u.includes('berkasdrive.com') || u.includes('stream-stor') || h.includes('workers.dev') || u.endsWith('.mp4')) {
    return 1;
  }
  if (u.includes('filedon.co') || h.includes('filedon')) {
    return 2;
  }
  if (u.includes('blogger.com/video') || h.includes('blogger')) {
    return 3;
  }
  if (u.includes('desustream') || u.includes('desudrive')) {
    return 4;
  }
  if (u.includes('odvidhide') || u.includes('vidhide')) {
    return 5;
  }
  if (u.includes('mp4upload.com')) {
    return 7;
  }
  if (u.includes('/streaming/') || h === 'nimegami.id') {
    return 8;
  }
  if (
    u.includes('mega.nz') ||
    u.includes('krakenfiles') ||
    u.includes('terabox') ||
    u.includes('send.now') ||
    u.includes('letsupload') ||
    u.includes('files.im') ||
    u.includes('mega4upload') ||
    u.includes('acefile.co') ||
    u.includes('gofile.io') ||
    u.includes('vikingfile')
  ) {
    return 50;
  }
  return 20;
}

/**
 * Parses article.anime-card blocks from HTML into structured items
 */
function parseCards(html: string): Array<{
  title: string;
  slug: string;
  link: string;
  thumbnail: string;
  rating: string;
  episode: string;
  epRaw: string;
  releaseDate: string;
  dateTimeIso: string;
  status: string;
  type: string;
  genre: string;
}> {
  const results: Array<{
    title: string;
    slug: string;
    link: string;
    thumbnail: string;
    rating: string;
    episode: string;
    epRaw: string;
    releaseDate: string;
    dateTimeIso: string;
    status: string;
    type: string;
    genre: string;
  }> = [];

  const $ = cheerio.load(html);
  $('article.anime-card').each((_, el) => {
    const $card = $(el);
    const titleA = $card.find('a.card-title').first();
    const posterA = $card.find('a.poster-link').first();

    const rawTitle = titleA.text().trim() || posterA.attr('aria-label')?.replace(/^Lihat\s+/i, '').trim() || '';
    const href = posterA.attr('href') || titleA.attr('href') || '';
    const slug = href.replace(/^\/|\/$/g, '');
    if (!slug) return;

    const img = $card.find('img').first();
    const imgSrc = img.attr('src') || img.attr('srcset')?.split(/[\s,]+/)[0] || '';
    const thumbnail = normalizePoster(imgSrc);

    const scoreText = $card.find('.score-badge').text().replace(/[\s\n]+/g, '').trim();
    const epText = $card.find('.card-last-episode strong').text().trim();
    const $time = $card.find('time').first();
    const timeText = $time.text().trim();
    const dateTimeIso = $time.attr('datetime') || $time.attr('dateTime') || '';
    const statusText = $card.find('.ongoing-badge').text().replace(/[\s\n]+/g, ' ').trim();
    const formatText = $card.find('.format-badge').text().trim();
    const metaText = $card.find('.card-meta').text().replace(/[\s\n]+/g, ' ').trim();

    results.push({
      title: rawTitle,
      slug,
      link: `nimegami://detail/${slug}`,
      thumbnail,
      rating: scoreText || '',
      episode: epText ? `Episode ${epText}` : '',
      epRaw: epText,
      releaseDate: timeText || '',
      dateTimeIso,
      status: statusText || 'Ongoing',
      type: formatText || 'SERIES',
      genre: metaText || '',
    });
  });

  return results;
}

/**
 * Home - Latest updates + featured carousel
 */
export async function home(signal?: AbortSignal): Promise<EpisodeBaruHome> {
  const cacheKey = 'nimegami_home';
  const cached = getCached<EpisodeBaruHome>(cacheKey);
  if (cached) return cached;

  try {
    const html = await fetchHtml(BASE_URL, signal);
    const cards = parseCards(html);
    const $ = cheerio.load(html);

    // Parse Carousel / Featured Anime from hero slides
    const carousel: CarouselItem[] = [];
    const seenHeroSlugs = new Set<string>();
    $('.hero-slide').each((_, el) => {
      const $slide = $(el);
      const $h = $slide.find('h1, h2').first();
      const rawBannerTitle = ($h.attr('title') || $h.text() || '').replace(/\.$/, '').trim();
      const href = $slide.find('a[href*="-sub-indo"]').first().attr('href') || $slide.find('a').first().attr('href') || '';
      const cleanHref = href.split('#')[0].split('?')[0];
      const bannerSlug = cleanHref.replace(/^\/|\/$/g, '');
      if (!bannerSlug || seenHeroSlugs.has(bannerSlug)) return;

      const rawImg = $slide.find('img.hero-image').attr('src') || $slide.find('img').first().attr('src') || '';
      const matchingCard = cards.find(c => c.slug === bannerSlug);
      const bannerTitle = rawBannerTitle || matchingCard?.title || bannerSlug;
      const thumbnailUrl = normalizePoster(rawImg) || matchingCard?.thumbnail || '';

      seenHeroSlugs.add(bannerSlug);
      carousel.push({
        title: bannerTitle,
        thumbnailUrl,
        streamingLink: `nimegami://detail/${bannerSlug}`,
        rating: matchingCard?.rating,
      });
    });

    const newAnime: NewAnimeList[] = cards.slice(0, 24).map(c => ({
      title: c.title,
      episode: c.episode || 'Latest',
      thumbnailUrl: c.thumbnail,
      streamingLink: c.link,
      releaseDate: c.releaseDate,
      releaseDay: '',
    }));

    const result: EpisodeBaruHome = {
      newAnime,
      jadwalAnime: {},
      carousel: carousel.length > 0 ? carousel : undefined,
    };

    setCache(cacheKey, result, CACHE_TTL_SHORT);
    return result;
  } catch (err) {
    return { newAnime: [], jadwalAnime: {} };
  }
}

export async function latestAnime(page: number = 1, signal?: AbortSignal): Promise<NewAnimeList[]> {
  const cacheKey = `nimegami_latest_${page}`;
  const cached = getCached<NewAnimeList[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = page <= 1 ? `${BASE_URL}/anime/` : `${BASE_URL}/anime/?page=${page}`;
    const html = await fetchHtml(url, signal);
    const cards = parseCards(html);

    const list: NewAnimeList[] = cards.map(c => ({
      title: c.title,
      episode: c.episode || 'Ongoing',
      thumbnailUrl: c.thumbnail,
      streamingLink: c.link,
      releaseDate: c.releaseDate,
      releaseDay: '',
    }));

    setCache(cacheKey, list, CACHE_TTL_SHORT);
    return list;
  } catch {
    return [];
  }
}

export async function search(query: string, signal?: AbortSignal): Promise<SearchAnime> {
  const q = query.trim();
  if (!q) return { result: [] };

  const cacheKey = `nimegami_search_${q.toLowerCase()}`;
  const cached = getCached<SearchAnime>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${BASE_URL}/anime/?q=${encodeURIComponent(q)}`;
    const html = await fetchHtml(url, signal);
    const cards = parseCards(html);

    const result: SearchAnimeList[] = cards.map(c => ({
      title: c.title,
      genres: c.genre ? c.genre.split(/\s+/).filter(Boolean) : [],
      status: c.status || 'Ongoing',
      animeUrl: c.link,
      thumbnailUrl: c.thumbnail,
      rating: c.rating || 'N/A',
    }));

    const output: SearchAnime = { result };
    setCache(cacheKey, output, CACHE_TTL_SHORT);
    return output;
  } catch {
    return { result: [] };
  }
}

export async function searchMovies(page: number = 1, signal?: AbortSignal): Promise<SearchAnime> {
  const cacheKey = `nimegami_movies_${page}`;
  const cached = getCached<SearchAnime>(cacheKey);
  if (cached) return cached;

  try {
    const url = page <= 1 ? `${BASE_URL}/movie/` : `${BASE_URL}/movie/?page=${page}`;
    const html = await fetchHtml(url, signal);
    const cards = parseCards(html);

    const result: SearchAnimeList[] = cards.map(c => ({
      title: c.title,
      genres: c.genre ? c.genre.split(/\s+/).filter(Boolean) : ['Movie'],
      status: c.status || 'Completed',
      animeUrl: c.link,
      thumbnailUrl: c.thumbnail,
      rating: c.rating || 'N/A',
    }));

    const output: SearchAnime = { result };
    setCache(cacheKey, output, CACHE_TTL_SHORT);
    return output;
  } catch {
    return { result: [] };
  }
}

async function fetchAnilistSynopsis(searchTitle: string, signal?: AbortSignal): Promise<string> {
  try {
    const clean = searchTitle
      .replace(/\s*Subtitle Indonesia.*$/i, '')
      .replace(/\s*Sub Indo.*$/i, '')
      .replace(/Season\s*\d+/gi, '')
      .replace(/S\d+/gi, '')
      .replace(/Part\s*\d+/gi, '')
      .trim();

    if (!clean) return '';

    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          description(asHtml: false)
        }
      }
    `;

    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { search: clean },
      }),
    });

    if (!res.ok) return '';
    const json = await res.json();
    const desc = json.data?.Media?.description;
    if (desc && typeof desc === 'string') {
      return desc.replace(/<[^>]+>/g, '').trim();
    }
  } catch {}
  return '';
}

/**
 * Anime Detail (Synopsis, Info, Episodes list)
 */
export async function detail(urlOrSlug: string, signal?: AbortSignal): Promise<AniDetail> {
  let slug = urlOrSlug.trim();
  if (slug.startsWith('nimegami://detail/')) {
    slug = slug.replace('nimegami://detail/', '');
  } else if (slug.startsWith('nimegami://ep/')) {
    slug = slug.replace('nimegami://ep/', '').split('/')[0];
  } else if (slug.includes('nimegami.id/')) {
    slug = slug.replace(/https?:\/\/[^/]+\//, '');
  }
  slug = slug.split('#')[0].split('?')[0].split('/')[0].replace(/^\/|\/$/g, '');

  const cacheKey = `nimegami_detail_${slug}`;
  const cached = getCached<AniDetail>(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}/${slug}/`;
  const html = await fetchHtml(url, signal);
  const $ = cheerio.load(html);
  const rscText = extractRscText(html);

  // 1. Parse JSON-LD metadata (prefer TVSeason over parent TVSeries for sequels like Season 3!)
  let ldPrimary: any = null;
  let ldSeries: any = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html() || '{}');
      const items = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed];
      for (const item of items) {
        if (!item) continue;
        if (item['@type'] === 'TVSeason' || item['@type'] === 'Movie') {
          if (!ldPrimary) ldPrimary = item;
        } else if (item['@type'] === 'TVSeries' || item['@type'] === 'VisualArtwork') {
          if (!ldSeries) ldSeries = item;
        }
      }
    } catch {}
  });
  const ldJson = ldPrimary || ldSeries;

  // Clean title and guard against literal "null" or parent-season mismatch
  const ldName =
    ldJson?.name && String(ldJson.name).trim().toLowerCase() !== 'null'
      ? String(ldJson.name).trim()
      : '';
  const rawH1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
  const cleanH1 = rawH1
    .replace(/^Nonton\s+/i, '')
    .replace(/\s+Episode\s+\d+(?:\s*-\s*\d+)?\s*(?:Subtitle\s+Indonesia|Sub\s+Indo).*$/i, '')
    .replace(/\s*(?:Subtitle\s+Indonesia|Sub\s+Indo)\s*$/i, '')
    .trim();
  const title = ldName || cleanH1 || slug;

  let alternativeTitle = '';
  const altSource = ldSeries?.alternateName || ldJson?.alternateName;
  if (Array.isArray(altSource)) {
    alternativeTitle = altSource.filter((x: any) => x && String(x).toLowerCase() !== 'null').join(', ');
  } else if (typeof altSource === 'string' && altSource.toLowerCase() !== 'null') {
    alternativeTitle = altSource.trim();
  }

  // Prefer .detail-poster img first before falling back to open graph meta tags
  const rawPoster =
    $('.detail-poster img').first().attr('src') ||
    $('.poster img').first().attr('src') ||
    $('meta[property="og:image"]').attr('content') ||
    $('link[rel="preload"][as="image"]').first().attr('href') ||
    '';
  const thumbnailUrl = normalizePoster(rawPoster);

  let rawSynopsis = $('.rich-content').first().text().replace(/\s+/g, ' ').trim();
  if (!rawSynopsis) {
    rawSynopsis = $('.synopsis-block')
      .first()
      .text()
      .replace(/DI BALIK CERITANYA|Sinopsis/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (!rawSynopsis && ldJson?.description && String(ldJson.description).toLowerCase() !== 'null') {
    rawSynopsis = String(ldJson.description).trim();
  }
  let synopsis = cleanSynopsis(rawSynopsis);
  if (!synopsis || synopsis.length < 15 || synopsis.includes('Lihat informasi anime, sinopsis')) {
    const fallbackSynopsis = await fetchAnilistSynopsis(title, signal);
    if (fallbackSynopsis) {
      synopsis = cleanSynopsis(fallbackSynopsis);
    }
  }

  // Genres scoped strictly to this detail block (not header/footer nav links)
  const genreSet = new Set<string>();
  $('.post-genres a[href*="/category/"], .genres a[href*="/category/"]').each((_, el) => {
    const g = $(el).text().trim();
    if (g) genreSet.add(g);
  });
  const genres = Array.from(genreSet);

  const scoreRaw = $('.post-meta .score-badge, .detail-meta .score-badge, .score-badge')
    .first()
    .text()
    .replace(/[^\d.]/g, '')
    .trim();
  const rating =
    scoreRaw ||
    (ldJson?.aggregateRating?.ratingValue ? String(ldJson.aggregateRating.ratingValue) : 'N/A');

  // Status scoped strictly to post kicker/header status badge
  const rawStatus = $('.post-kicker .status-badge, .detail-header .status-badge, .status-badge')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  const upperStatus = rawStatus.toUpperCase();
  const status =
    upperStatus.includes('SELESAI') || upperStatus.includes('COMPLETE')
      ? 'Completed'
      : upperStatus.includes('ONGOING')
      ? 'Ongoing'
      : 'Ongoing';

  let releaseYear = '';
  const startDate = ldJson?.startDate || ldSeries?.startDate;
  if (typeof startDate === 'string') {
    const ym = startDate.match(/\b(19\d\d|20\d\d)\b/);
    if (ym) releaseYear = ym[0];
  }
  if (!releaseYear) {
    const metaText = $('.post-meta, .detail-meta, .hero-meta').text();
    const ym = metaText.match(/\b(19\d\d|20\d\d)\b/);
    if (ym) releaseYear = ym[0];
  }

  let studio = '';
  const prod = ldJson?.productionCompany || ldSeries?.productionCompany;
  if (Array.isArray(prod) && prod.length > 0) {
    studio = prod[0]?.name || '';
  }

  let epsTotal =
    ldJson?.numberOfEpisodes && String(ldJson.numberOfEpisodes).toLowerCase() !== 'null'
      ? String(ldJson.numberOfEpisodes)
      : '';

  // Parse all episodes from Next.js RSC stream objects + slug-scoped /streaming/ tokens
  const episodesMap = new Map<string, RscStreamItem[]>();
  const addStreamItem = (item: RscStreamItem) => {
    if (!episodesMap.has(item.episodeKey)) {
      episodesMap.set(item.episodeKey, []);
    }
    const existing = episodesMap.get(item.episodeKey)!;
    if (!existing.some(x => x.playUrl === item.playUrl && x.quality === item.quality)) {
      existing.push(item);
    }
  };

  for (const obj of extractRscStreamObjects(rscText, slug)) {
    addStreamItem(obj);
  }

  // Merge slug-scoped /streaming/ paths from HTML/RSC (never accept foreign anime slugs)
  const slugPattern = new RegExp(
    `/${escapeRegExp(slug)}/streaming/(\\d+|movie_\\d+)/([^/"']+)/([a-zA-Z0-9_-]+)/?`,
    'gi',
  );
  const combinedSource = `${html}\n${rscText}`;
  for (const m of combinedSource.matchAll(slugPattern)) {
    const epStr = m[1];
    const quality = normalizeQualityLabel(m[2]);
    const uuid = m[3];
    const fullPath = `/${slug}/streaming/${epStr}/${m[2]}/${uuid}/`;
    const epKey = epStr.toLowerCase();
    addStreamItem({
      episodeKey: epKey,
      quality,
      playUrl: fullPath,
      mode: 'embed',
      host: 'nimegami.id',
      provider: 'Nimegami',
      label: 'Nimegami Player',
    });
  }

  // Sort episode keys numerically (1, 2, ..., 24) with movie entries after numbered episodes
  const sortedEpKeys = [...episodesMap.keys()].sort((a, b) => {
    const numA = Number(a.replace('movie_', ''));
    const numB = Number(b.replace('movie_', ''));
    const isMovA = a.startsWith('movie_');
    const isMovB = b.startsWith('movie_');
    if (isMovA !== isMovB) return isMovA ? 1 : -1;
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });

  // Store full episode map for instant resolution in streaming()
  seriesStreamCache.set(slug, {
    meta: {
      title,
      thumbnailUrl,
      sortedEpKeys,
      episodesMap,
    },
    expiry: Date.now() + CACHE_TTL_LONG,
  });

  const episodeList: AniDetailEpsList[] = sortedEpKeys.map(epKey => {
    const isMovieKey = epKey.startsWith('movie_');
    const epLabel = isMovieKey
      ? sortedEpKeys.length === 1
        ? 'Full Movie'
        : `Movie ${epKey.replace('movie_', '')}`
      : `Episode ${epKey}`;

    return {
      title: epLabel,
      link: `nimegami://ep/${slug}/${epKey}`,
      releaseDate: '',
    };
  });

  if (!epsTotal && episodeList.length > 0) {
    epsTotal = String(episodeList.length);
  }

  const isMovie =
    ldJson?.['@type'] === 'Movie' ||
    html.includes('format-badge">MOVIE') ||
    (episodeList.length > 0 && episodeList.every(e => e.title.includes('Movie')));

  const result: AniDetail = {
    type: 'animeDetail',
    title,
    genres,
    synopsis,
    detailOnly: false,
    episodeList,
    epsTotal: epsTotal ? `${epsTotal} Eps` : '?',
    minutesPerEp: isMovie ? 'Movie' : '24 min',
    thumbnailUrl,
    alternativeTitle,
    rating,
    releaseYear,
    status,
    studio,
    animeType: isMovie ? 'Movie' : 'TV Series',
  };

  setCache(cacheKey, result, CACHE_TTL_LONG);
  return result;
}

async function resolveNimegamiPlayableUrl(
  rawPlayUrl: string,
  signal?: AbortSignal,
): Promise<{ url: string; isDirect: boolean; isHls: boolean }> {
  let target = (rawPlayUrl || '').trim().replace(/&amp;/g, '&');
  if (!target) return { url: '', isDirect: false, isHls: false };

  // 1. Internal /streaming/ route on nimegami.id -> extract data-src or iframe src from page
  if (target.startsWith('/') || target.includes('nimegami.id/')) {
    const fullStreamUrl = target.startsWith('http')
      ? target
      : `${BASE_URL}${target.startsWith('/') ? '' : '/'}${target}`;
    try {
      const html = await fetchHtml(fullStreamUrl, signal);
      const dataSrcMatch = html.match(/data-src="([^"]+)"/i) || html.match(/<iframe[^>]+src="([^"]+)"/i);
      if (dataSrcMatch?.[1]) {
        target = dataSrcMatch[1].replace(/&amp;/g, '&').trim();
      } else {
        return { url: '', isDirect: false, isHls: false };
      }
    } catch {
      return { url: '', isDirect: false, isHls: false };
    }
  }

  // 2. Rewrite BerkashDrive worker URLs to /download/ so they serve direct video/mp4
  target = normalizeDirectDownloadUrl(target);

  // 3. Unwrap Filedon embed/view pages to direct R2 MP4
  if (target.includes('filedon.co/')) {
    const extracted = await extractFiledonVideoUrl(target, signal);
    if (extracted) {
      target = normalizeDirectDownloadUrl(extracted);
    }
  }

  // 4. Unwrap vidhide / blogger / desustream embeds when possible
  if (
    target.includes('odvidhide') ||
    target.includes('vidhide') ||
    target.includes('blogger.com/video.g') ||
    (target.includes('desustream') && !target.includes('berkasdrive.com/download/'))
  ) {
    const extracted = await extractVideoFromEmbed(target, signal);
    if (extracted?.url) {
      const normalized = normalizeDirectDownloadUrl(extracted.url);
      return {
        url: normalized,
        isDirect: true,
        isHls: extracted.type === 'hls' || normalized.includes('.m3u8') || normalized.includes('is_hls=1'),
      };
    }
  }

  const lower = target.toLowerCase();
  const isHls = lower.includes('.m3u8') || lower.includes('is_hls=1');
  const isDirect =
    isHls ||
    lower.includes('.mp4') ||
    lower.includes('workers-anime.berkasdrive.com/download/') ||
    lower.includes('stream-stor.berkasdrive.com') ||
    lower.includes('berkasdrive.com/dl/') ||
    lower.includes('r2.cloudflarestorage.com') ||
    lower.includes('r2.dev/') ||
    lower.includes('googlevideo.com') ||
    lower.includes('googleusercontent.com') ||
    lower.includes('pixeldrain.com/api/file/') ||
    lower.includes('odcloud');

  return { url: target, isDirect, isHls };
}

/**
 * Streaming - Extracts direct native MP4 video stream or clean embed from Nimegami
 */
export async function streaming(
  urlOrPath: string,
  signal?: AbortSignal,
  targetResolution?: string,
): Promise<AniStreaming> {
  let input = urlOrPath.trim();
  if (input.startsWith('nimegami://stream/')) {
    input = input.replace('nimegami://stream/', `${BASE_URL}/`);
  }

  let slug = '';
  let epKey = '';
  let explicitStreamingUrl = '';

  if (input.startsWith('nimegami://ep/')) {
    const parts = input.replace('nimegami://ep/', '').split('/');
    slug = (parts[0] || '').trim();
    epKey = (parts[1] || '1').trim();
  } else {
    const fullUrl = input.startsWith('http') ? input : `${BASE_URL}${input.startsWith('/') ? '' : '/'}${input}`;
    const streamingMatch = fullUrl.match(/https?:\/\/[^/]+\/([a-zA-Z0-9_-]+)\/streaming\/(\d+|movie_\d+)\//i);
    if (streamingMatch) {
      slug = streamingMatch[1];
      epKey = streamingMatch[2].toLowerCase();
      explicitStreamingUrl = fullUrl;
    } else {
      const hashEpMatch = fullUrl.match(/https?:\/\/[^/]+\/([a-zA-Z0-9_-]+)\/?#episode_(\d+)/i);
      if (hashEpMatch) {
        slug = hashEpMatch[1];
        epKey = hashEpMatch[2];
      }
    }
  }

  let metaEntry = slug ? seriesStreamCache.get(slug) : undefined;
  if (slug && (!metaEntry || Date.now() > metaEntry.expiry)) {
    await detail(`nimegami://detail/${slug}`, signal).catch(() => null);
    metaEntry = seriesStreamCache.get(slug);
  }

  const meta = metaEntry?.meta;
  const epStreams = meta?.episodesMap.get(epKey) || [];

  // Fallback for direct legacy /streaming/ URLs if not present in episodesMap
  if (epStreams.length === 0 && explicitStreamingUrl) {
    epStreams.push({
      episodeKey: epKey || '1',
      quality: '720p',
      playUrl: explicitStreamingUrl,
      mode: 'embed',
      host: 'nimegami.id',
      provider: 'Nimegami',
      label: 'Nimegami Player',
    });
  }

  // Group stream candidates per quality sorted by host priority (never pick external download-only hosts if streaming exists)
  const candidatesByQuality = new Map<string, RscStreamItem[]>();
  const bestByQuality = new Map<string, RscStreamItem>();
  for (const s of epStreams) {
    if (getStreamHostPriority(s) >= 50) continue; // skip unplayable mega/gofile/acefile/terabox
    const q = s.quality || 'Original';
    const arr = candidatesByQuality.get(q) || [];
    arr.push(s);
    candidatesByQuality.set(q, arr);
  }
  // Fallback if episode ONLY had priority >= 50 links
  if (candidatesByQuality.size === 0) {
    for (const s of epStreams) {
      const q = s.quality || 'Original';
      const arr = candidatesByQuality.get(q) || [];
      arr.push(s);
      candidatesByQuality.set(q, arr);
    }
  }
  for (const [q, arr] of candidatesByQuality.entries()) {
    arr.sort((a, b) => getStreamHostPriority(a) - getStreamHostPriority(b));
    if (arr.length > 0) bestByQuality.set(q, arr[0]);
  }

  // Also extract quality buttons from explicitStreamingUrl page if we only had 1 legacy entry
  if (bestByQuality.size <= 1 && explicitStreamingUrl) {
    try {
      const html = await fetchHtml(explicitStreamingUrl, signal);
      const qualityButtons = [...html.matchAll(/data-quality-url="([^"]+)"[\s\S]*?<span>([^<]+)<\/span>/gi)];
      for (const btn of qualityButtons) {
        const qText = normalizeQualityLabel(btn[2]);
        const qUrl = btn[1].trim();
        if (qText && qUrl && !bestByQuality.has(qText)) {
          const item: RscStreamItem = {
            episodeKey: epKey || '1',
            quality: qText,
            playUrl: qUrl,
            mode: 'embed',
            host: 'nimegami.id',
            provider: 'Nimegami',
            label: 'Nimegami Player',
          };
          bestByQuality.set(qText, item);
          candidatesByQuality.set(qText, [item]);
        }
      }
    } catch {}
  }

  // Sort qualities with 360p first (default) -> 480p -> 720p -> 1080p
  const nimegamiResOrder: Record<string, number> = {
    '360p': 1,
    '480p': 2,
    '720p': 3,
    '1080p': 4,
    HD: 5,
    Original: 6,
  };
  const resolutionRaw = Array.from(bestByQuality.entries())
    .sort(([qa], [qb]) => (nimegamiResOrder[qa] || 99) - (nimegamiResOrder[qb] || 99))
    .map(([res, item]) => ({
      resolution: res,
      dataContent: `nimegami_rsc::${item.playUrl}`,
    }));

  const desiredRes = targetResolution || '360p';
  const activeResEntry =
    resolutionRaw.find(r => r.resolution === desiredRes || r.resolution.includes(desiredRes)) ||
    resolutionRaw[0];
  let currentQuality = activeResEntry?.resolution || desiredRes;

  let resolvedActive: { url: string; isDirect: boolean; isHls: boolean } = {
    url: '',
    isDirect: false,
    isHls: false,
  };

  // Try all candidates in the selected quality first; if all fail (e.g. 404 /streaming/), try other qualities
  const tryQualities = [
    currentQuality,
    ...resolutionRaw.map(r => r.resolution).filter(q => q !== currentQuality),
  ];
  for (const q of tryQualities) {
    const cands = candidatesByQuality.get(q) || [];
    for (const cand of cands) {
      const attempt = await resolveNimegamiPlayableUrl(cand.playUrl, signal);
      if (attempt.url) {
        resolvedActive = attempt;
        currentQuality = q;
        break;
      }
    }
    if (resolvedActive.url) break;
  }

  // Build direct download options + pick best directly downloadable MP4 link
  const downloadOptions: { resolution: string; server: string; url: string }[] = [];
  for (const s of epStreams) {
    if (getStreamHostPriority(s) >= 50) continue; // skip unplayable mega/terabox/send.now
    if (s.playUrl.startsWith('/') || s.playUrl.includes('nimegami.id/') || s.playUrl.includes('workers-anime.berkasdrive.com') || s.playUrl.includes('filedon.co')) {
      const fullOptUrl = s.playUrl.startsWith('/') ? `${BASE_URL}${s.playUrl}` : s.playUrl;
      downloadOptions.push({
        resolution: s.quality,
        server: s.provider || s.host || 'Server',
        url: normalizeDirectDownloadUrl(fullOptUrl),
      });
    }
  }

  let downloadLink = '';
  if (resolvedActive.isDirect && !resolvedActive.isHls && resolvedActive.url) {
    downloadLink = resolvedActive.url;
  } else {
    // Fallback to another stream of same/closest quality on berkasdrive/filedon/streaming
    const dlCandidate =
      epStreams.find(
        s =>
          s.quality === currentQuality &&
          (s.playUrl.includes('berkasdrive.com') || s.playUrl.includes('filedon.co')),
      ) ||
      epStreams.find(
        s => s.playUrl.includes('berkasdrive.com') || s.playUrl.includes('filedon.co'),
      );
    if (dlCandidate) {
      const resolvedDl = await resolveNimegamiPlayableUrl(dlCandidate.playUrl, signal);
      if (resolvedDl.isDirect && !resolvedDl.isHls && resolvedDl.url) {
        downloadLink = resolvedDl.url;
      }
    }
  }

  // Bounded Prev / Next using actual episode list order
  let prevEpLink: string | undefined;
  let nextEpLink: string | undefined;
  if (slug && meta?.sortedEpKeys && meta.sortedEpKeys.length > 0) {
    const idx = meta.sortedEpKeys.indexOf(epKey);
    if (idx > 0) {
      prevEpLink = `nimegami://ep/${slug}/${meta.sortedEpKeys[idx - 1]}`;
    }
    if (idx !== -1 && idx < meta.sortedEpKeys.length - 1) {
      nextEpLink = `nimegami://ep/${slug}/${meta.sortedEpKeys[idx + 1]}`;
    }
  }

  const epDisplayTitle = epKey.startsWith('movie_')
    ? 'Movie'
    : `Episode ${epKey}`;
  const fullDisplayTitle = meta?.title ? `${meta.title} ${epDisplayTitle}` : epDisplayTitle;

  return {
    type: 'animeStreaming',
    title: fullDisplayTitle,
    streamingLink: resolvedActive.url || explicitStreamingUrl || `${BASE_URL}/${slug}/`,
    streamingType: resolvedActive.isDirect ? 'raw' : 'embed',
    headers: {
      'User-Agent': deviceUserAgent,
      Referer: 'https://nimegami.id/',
    },
    downloadLink,
    downloadOptions,
    isHls: resolvedActive.isHls,
    resolution: currentQuality,
    resolutionRaw,
    thumbnailUrl: meta?.thumbnailUrl || '',
    episodeData: {
      previous: prevEpLink,
      animeDetail: slug ? `nimegami://detail/${slug}` : urlOrPath,
      next: nextEpLink,
    },
    reqNonceAction: '',
    reqResolutionWithNonceAction: '',
  };
}

export async function getResolution(requestData: string, signal?: AbortSignal): Promise<string | undefined> {
  let raw = requestData.trim();
  if (raw.startsWith('nimegami_rsc::')) {
    raw = raw.replace('nimegami_rsc::', '');
    const resolved = await resolveNimegamiPlayableUrl(raw, signal);
    return resolved.url || undefined;
  }

  let path = raw.replace('nimegami::', '').trim();
  const resolved = await resolveNimegamiPlayableUrl(path, signal);
  return resolved.url || undefined;
}

export async function getAllGenres(signal?: AbortSignal): Promise<{ name: string; slug: string }[]> {
  const cacheKey = 'nimegami_all_genres';
  const cached = getCached<{ name: string; slug: string }[]>(cacheKey);
  if (cached) return cached;

  try {
    const saved = await DatabaseManager.get('nimegami_genres_cache_v1' as any);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setCache(cacheKey, parsed, CACHE_TTL_LONG);
        return parsed;
      }
    }
  } catch {}

  try {
    const url = `${BASE_URL}/genre/`;
    const html = await fetchHtml(url, signal);
    const catMatches = [...html.matchAll(/href="\/category\/([^"/]+)\/"[^>]*>([\s\S]*?)<\/a>/gi)];

    const genres: { name: string; slug: string }[] = [];
    for (const m of catMatches) {
      const slug = m[1].trim();
      let rawName = m[2].replace(/<[^>]+>/g, '').trim();
      // Remove leading digits or trailing post counts (e.g. "01Action1.462 post anime#" -> "Action")
      rawName = rawName.replace(/^\d+/, '').replace(/\d[\d.,]*\s*post.*$/i, '').replace(/#$/, '').trim();
      if (slug && rawName && !genres.some(g => g.slug === slug)) {
        genres.push({ name: rawName, slug });
      }
    }

    if (genres.length > 0) {
      DatabaseManager.set('nimegami_genres_cache_v1', JSON.stringify(genres));
      setCache(cacheKey, genres, CACHE_TTL_LONG);
    }
    return genres;
  } catch {
    return [];
  }
}

export async function getAnimeByGenre(
  genre: string,
  page: number = 1,
  signal?: AbortSignal
): Promise<NewAnimeList[]> {
  const cleanGenre = genre.replace(/^\/category\/|\/$/g, '').toLowerCase().trim();
  const cacheKey = `nimegami_genre_${cleanGenre}_${page}`;
  const cached = getCached<NewAnimeList[]>(cacheKey);
  if (cached) return cached;

  try {
    const pagePath = page > 1 ? `page/${page}/` : '';
    const url = `${BASE_URL}/category/${encodeURIComponent(cleanGenre)}/${pagePath}`;
    const html = await fetchHtml(url, signal);
    const cards = parseCards(html);

    const list: NewAnimeList[] = cards.map(c => ({
      title: c.title,
      episode: c.episode || 'Ongoing',
      thumbnailUrl: c.thumbnail,
      streamingLink: c.link,
      releaseDate: c.releaseDate,
      releaseDay: '',
    }));

    setCache(cacheKey, list, CACHE_TTL_SHORT);
    return list;
  } catch {
    return [];
  }
}

export async function listAnime(
  signal?: AbortSignal,
  streamingCallback?: (data: listAnimeTypeList[]) => void
): Promise<listAnimeTypeList[]> {
  const cacheKey = 'nimegami_list_anime';
  const cached = getCached<listAnimeTypeList[]>(cacheKey);
  if (cached) {
    streamingCallback?.(cached);
    return cached;
  }

  try {
    const url = `${BASE_URL}/anime/?sort=title`;
    const html = await fetchHtml(url, signal);
    const cards = parseCards(html);

    const list: listAnimeTypeList[] = cards.map(c => ({
      title: c.title,
      streamingLink: c.link,
    }));

    if (list.length > 0) {
      streamingCallback?.(list);
      setCache(cacheKey, list, CACHE_TTL_LONG);
    }
    return list;
  } catch {
    return [];
  }
}

/**
 * Anime release schedule built from ongoing Nimegami updates converted to WIB (UTC+7).
 */
export async function jadwalAnime(
  signal?: AbortSignal,
): Promise<
  Record<
    string,
    {
      title: string;
      link: string;
      thumbnailUrl?: string;
      estimatedTime?: string;
      estimatedEpisode?: string;
    }[]
  >
> {
  const cacheKey = 'nimegami_jadwal';
  const cached = getCached<Record<string, any[]>>(cacheKey);
  if (cached) return cached;

  const INDO_DAYS_BY_UTC = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const jadwal: Record<
    string,
    {
      title: string;
      link: string;
      thumbnailUrl?: string;
      estimatedTime?: string;
      estimatedEpisode?: string;
    }[]
  > = {
    Senin: [],
    Selasa: [],
    Rabu: [],
    Kamis: [],
    Jumat: [],
    Sabtu: [],
    Minggu: [],
  };

  const pages = [
    BASE_URL,
    `${BASE_URL}/anime/`,
    `${BASE_URL}/anime/?page=2`,
    `${BASE_URL}/anime/?page=3`,
  ];

  const htmlResults = await Promise.allSettled(pages.map(u => fetchHtml(u, signal)));
  const seenSlugs = new Set<string>();

  for (const res of htmlResults) {
    if (res.status !== 'fulfilled' || !res.value) continue;
    const cards = parseCards(res.value);
    for (const c of cards) {
      if (!c.slug || seenSlugs.has(c.slug)) continue;
      if (!c.status.toLowerCase().includes('ongoing')) continue;
      if (!c.dateTimeIso) continue;

      const parsedMs = Date.parse(c.dateTimeIso);
      if (isNaN(parsedMs)) continue;

      seenSlugs.add(c.slug);
      const wibDate = new Date(parsedMs + 7 * 3600 * 1000);
      const dayName = INDO_DAYS_BY_UTC[wibDate.getUTCDay()];
      const hh = String(wibDate.getUTCHours()).padStart(2, '0');
      const mm = String(wibDate.getUTCMinutes()).padStart(2, '0');
      const epNum = parseInt(c.epRaw || '0', 10);

      jadwal[dayName].push({
        title: c.title,
        link: c.link,
        thumbnailUrl: c.thumbnail || undefined,
        estimatedTime: `${hh}:${mm}`,
        estimatedEpisode: epNum > 0 ? `Episode ${epNum}` : c.episode || 'Update',
      });
    }
  }

  for (const day of Object.keys(jadwal)) {
    jadwal[day].sort((a, b) => (a.estimatedTime || '').localeCompare(b.estimatedTime || ''));
  }

  setCache(cacheKey, jadwal, CACHE_TTL_SHORT);
  return jadwal;
}
