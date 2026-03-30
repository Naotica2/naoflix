import axios from 'axios';
import cheerio from 'cheerio';
import {
  AniDetail,
  AniStreaming,
  EpisodeBaruHome,
  JadwalAnime,
  NewAnimeList,
  SearchAnime,
} from '../types/anime';
import deviceUserAgent from './deviceUserAgent';

// Sanka API Base URL for Nimegami
const BASE_URL = 'https://www.sankavollerei.com/anime/nimegami';

// --- In-memory cache to avoid wasteful API requests ---
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const apiCache = new Map<string, { data: any; timestamp: number }>();

function getCached(key: string): any | undefined {
  const entry = apiCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    apiCache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCache(key: string, data: any): void {
  apiCache.set(key, { data, timestamp: Date.now() });
  // Prune old entries if cache gets too large (max 50 entries)
  if (apiCache.size > 50) {
    const oldest = apiCache.keys().next().value;
    if (oldest) apiCache.delete(oldest);
  }
}

// Custom Error Error for Sanka 429 Rate Limit
export class SankaRateLimitError extends Error {
  constructor(message = 'Server NaoFlix sedang antre, coba lagi dalam beberapa saat.') {
    super(message);
    this.name = 'SankaRateLimitError';
  }
}

/**
 * Extract direct raw video URL from Nimegami streaming embed pages.
 * Supports berkasdrive.com and dlgan.space hosting services.
 *
 * These embed pages wrap the actual video behind a JavaScript player (Plyr).
 * We call the internal APIs directly to get the raw .mp4 URL.
 */
async function getNimegamiStreamLink(
  embedUrl: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  try {
    const urlObj = new URL(embedUrl);
    const id = urlObj.searchParams.get('id');

    if (!id) return undefined;

    // Handle berkasdrive.com
    // Strategy 1: Fetch embed page HTML and parse <source src="..."> or data-url="..."
    // Strategy 2: API Fallbacks (stream-worker and download-worker)
    if (embedUrl.includes('berkasdrive.com')) {
      // Nimegami servers block requests to the stream API without proper headers.
      // But scraping <source src="..."> is ALSO broken because the hotlink protection
      // causes 404 errors for the raw mp4 outside the webview.
      // We must just rely on the API or fail gracefully to trigger the WebView fallback.

      // Try stream-worker
      const apiBase = `${urlObj.protocol}//${urlObj.host}/new/streaming.php`;

      // Try stream-worker
      try {
        const streamRes = await fetch(`${apiBase}?action=stream-worker&id=${encodeURIComponent(id)}`, {
          signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': deviceUserAgent,
          },
        });
        const streamData = await streamRes.json();
        if (streamData.ok && streamData.url) {
          return streamData.url;
        }
      } catch {}

      // Fallback to download-worker
      try {
        const dlRes = await fetch(`${apiBase}?action=download-worker&id=${encodeURIComponent(id)}`, {
          signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': deviceUserAgent,
          },
        });
        const dlData = await dlRes.json();
        if (dlData.ok && dlData.url) {
          return dlData.url;
        }
      } catch {}

      return undefined;
    }

    // Handle dlgan.space
    // API: /streaming.php?proxy=1&id=XXX&name=YYY
    // The response contains { ok: true, data: { stream_url, direct_url } }
    if (embedUrl.includes('dlgan.space') || embedUrl.includes('dlgan.my.id')) {
      const name = urlObj.searchParams.get('name') || '';

      // Try proxy API first (returns JSON directly)
      try {
        const proxyUrl = `${urlObj.protocol}//${urlObj.host}/streaming.php?proxy=1&id=${encodeURIComponent(id)}${name ? `&name=${encodeURIComponent(name)}` : ''}`;
        const proxyRes = await fetch(proxyUrl, {
          signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': deviceUserAgent,
          },
        });
        const proxyData = await proxyRes.json();
        if (proxyData.ok && proxyData.data) {
          const streamUrl = proxyData.data.stream_url || proxyData.data.direct_url;
          if (streamUrl) return streamUrl;
        }
        // Sometimes the data is flat (not nested in .data)
        if (proxyData.stream_url || proxyData.direct_url) {
          return proxyData.stream_url || proxyData.direct_url;
        }
      } catch {}

      // Fallback: parse PRELOAD JSON from the HTML page
      try {
        const pageRes = await fetch(embedUrl, {
          signal,
          headers: { 'User-Agent': deviceUserAgent },
        });
        const html = await pageRes.text();
        const preloadMatch = html.match(/const\s+PRELOAD\s*=\s*(\{[\s\S]*?\});/);
        if (preloadMatch) {
          const preloadData = JSON.parse(preloadMatch[1]);
          if (preloadData.ok && preloadData.data) {
            return preloadData.data.stream_url || preloadData.data.direct_url;
          }
        }
      } catch {}

      return undefined;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

class sankaAnimeApi {
  /**
   * Helper function to fetch data and handle 429
   */
  private static async fetchSanka(endpoint: string, signal?: AbortSignal) {
    try {
      const cachedData = getCached(endpoint);
      if (cachedData) {
        return cachedData;
      }

      const response = await fetch(`${BASE_URL}${endpoint}`, {
        signal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.status === 429) {
        throw new SankaRateLimitError();
      }

      if (!response.ok) {
        throw new Error(`NaoFlix API Error: ${response.status}`);
      }

      const json = await response.json();
      // sanka nimegami uses status "success" instead of "ok" sometimes
      if (json.status !== 'success' && !json.ok && !json.anime_list && !json.detail) {
        throw new Error(json.message || 'Unknown NaoFlix API Error');
      }

      setCache(endpoint, json);
      return json;
    } catch (e: any) {
      if (e.name === 'AbortError') {
        throw e;
      }
      throw e;
    }
  }

  static async home(signal?: AbortSignal): Promise<EpisodeBaruHome> {
    const data = await this.fetchSanka('/home', signal);

    // Map nimegami anime_list to NewAnimeList
    const newAnime: NewAnimeList[] = Array.isArray(data.anime_list)
      ? data.anime_list.map((item: any) => ({
        title: item.title,
        episode: item.episode ? `${item.episode}` : '?',
        thumbnailUrl: item.poster,
        streamingLink: `sanka://detail/${item.slug}`,
        releaseDate: 'Unknown',
        releaseDay: 'Unknown',
      }))
      : [];

    // Scrape jadwal anime from Nimegami
    let jadwalAnime: JadwalAnime = {};
    try {
      jadwalAnime = await this.scrapeJadwalAnime(signal);
    } catch (e) {
      // If jadwal scrape fails, continue with empty schedule
      console.warn('Failed to scrape jadwal anime:', e);
    }

    return {
      newAnime,
      jadwalAnime,
    };
  }

  static async newAnime(page: number, signal?: AbortSignal): Promise<NewAnimeList[]> {
    try {
      // Don't use cache for paginated requests to avoid stale data
      const endpoint = `/home?page=${page}`;
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        signal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.status === 429) {
        throw new SankaRateLimitError();
      }

      if (!response.ok) {
        throw new Error(`NaoFlix API Error: ${response.status}`);
      }

      const data = await response.json();

      return Array.isArray(data.anime_list) ? data.anime_list.map((item: any) => ({
        title: item.title,
        episode: item.episode ? `${item.episode}` : '?',
        thumbnailUrl: item.poster,
        streamingLink: `sanka://detail/${item.slug}`,
        releaseDate: 'Unknown',
        releaseDay: 'Unknown',
      })) : [];
    } catch (e) {
      if (e instanceof SankaRateLimitError) throw e;
      return [];
    }
  }

  static async search(query: string, signal?: AbortSignal): Promise<SearchAnime> {
    // encode query
    const encodedQuery = encodeURIComponent(query);
    const data = await this.fetchSanka(`/search/${encodedQuery}`, signal);

    if (!data.anime_list || !Array.isArray(data.anime_list)) {
      return { result: [] };
    }

    return {
      result: data.anime_list.map((item: any) => ({
        title: item.title,
        genres: [], // Nimegami search doesn't return genres list
        status: item.status || '?',
        animeUrl: `sanka://detail/${item.slug}`, // Used for fromUrl
        thumbnailUrl: item.poster,
        rating: '?',
      })),
    };
  }

  static async detail(animeId: string, signal?: AbortSignal): Promise<AniDetail> {
    const data = await this.fetchSanka(`/detail/${animeId}`, signal);

    const synopsis = data.detail?.synopsis || '';
    const genres = Array.isArray(data.detail?.genres) ? data.detail.genres.map((g: any) => g.name || g.slug || g) : [];

    const episodeList: { title: string; link: string; releaseDate: string }[] = [];
    if (data.streams_by_episode) {
      const epNames = Object.keys(data.streams_by_episode);
      // reverse it to put newest at the top by default (or just keep Nimegami's original order)
      epNames.forEach(epName => {
        // Encode both animeId (slug) and episodeName into the id
        const encodedEpId = encodeURIComponent(animeId) + '|' + encodeURIComponent(epName);
        episodeList.push({
          title: epName,
          link: `sanka://episode/${encodedEpId}`,
          releaseDate: 'Unknown',
        });
      });
      // Optionally reverse if we want oldest at bottom
      episodeList.reverse();
    }

    return {
      type: 'animeDetail',
      title: data.detail?.title || data.detail?.info?.judul || 'Unknown',
      genres,
      synopsis,
      detailOnly: true,
      episodeList,
      epsTotal: data.detail?.info?.episode || '?',
      minutesPerEp: data.detail?.info?.durasi_per_episode || '?',
      thumbnailUrl: data.detail?.poster || '',
      alternativeTitle: data.detail?.info?.judul_alternatif || '',
      rating: data.detail?.info?.rating || '?',
      releaseYear: data.detail?.info?.musim__rilis || '?',
      status: data.detail?.info?.status || '?',
      studio: data.detail?.info?.studio || '',
      animeType: data.detail?.info?.type || 'TV',
    };
  }

  static async getResolution(serverId: string, signal?: AbortSignal): Promise<string> {
    // Nimegami resolution handler: extract raw video URL from embed page
    if (serverId.startsWith('NIMEGAMI_RAW_LINK:')) {
      const embedUrl = serverId.substring('NIMEGAMI_RAW_LINK:'.length);

      // Use the dedicated Nimegami stream link extractor
      const rawLink = await getNimegamiStreamLink(embedUrl, signal);
      if (rawLink) {
        return rawLink;
      }

      // If extraction failed, return the embed URL as-is (will fall back to WebView)
      return embedUrl;
    }

    // Fallback if needed
    return serverId;
  }

  static async streaming(episodeId: string, signal?: AbortSignal): Promise<AniStreaming> {
    // The episodeId is actually `slug|epName`
    const parts = episodeId.split('|');
    if (parts.length < 2) {
      throw new Error('Invalid NaoFlix Episode ID format');
    }
    const slug = decodeURIComponent(parts[0]);
    const epName = decodeURIComponent(parts[1]);

    // Fetch detail again to get the video links 
    const data = await this.fetchSanka(`/detail/${slug}`, signal);

    // Safety check
    if (!data.streams_by_episode) throw new Error('No streams found');
    const epStreams = data.streams_by_episode[epName];
    if (!epStreams || epStreams.length === 0) {
      throw new Error('Episode stream not found');
    }

    const resolutionRaw: { resolution: string; dataContent: string }[] = [];
    const streamsSorted = [...epStreams].sort((a: any, b: any) => {
      // e.g. "360p", "480p". Put lowest res at first, or highest
      return a.resolution.localeCompare(b.resolution);
    });

    streamsSorted.forEach((stream: any) => {
      resolutionRaw.push({
        resolution: stream.name, // "360p - Server 1"
        dataContent: `sanka-server:NIMEGAMI_RAW_LINK:${stream.url}`
      });
    });

    const defaultStreamEmbed = streamsSorted[0]?.url || '';
    const defaultResolution = streamsSorted[0]?.name || undefined;

    // Extract the raw video URL from the embed page
    let rawLink: string | undefined;
    if (defaultStreamEmbed) {
      try {
        rawLink = await getNimegamiStreamLink(defaultStreamEmbed, signal);
      } catch (e) {
        rawLink = undefined;
      }
    }

    // Determine prev/next episodes for the UI backward/forward logic
    let prevEp: string | undefined;
    let nextEp: string | undefined;
    if (data.streams_by_episode) {
      const epNames = Object.keys(data.streams_by_episode);
      const currentIndex = epNames.indexOf(epName);
      if (currentIndex > 0) {
        // Previous ep chronologically (Assuming epNames are Episode 1, Episode 2)
        prevEp = `sanka://episode/${encodeURIComponent(slug)}|${encodeURIComponent(epNames[currentIndex - 1])}`;
      }
      if (currentIndex < epNames.length - 1) {
        nextEp = `sanka://episode/${encodeURIComponent(slug)}|${encodeURIComponent(epNames[currentIndex + 1])}`;
      }
    }

    return {
      type: 'animeStreaming',
      title: `${data.detail?.title || slug} - ${epName}`,
      streamingLink: rawLink || defaultStreamEmbed,
      streamingType: rawLink ? 'raw' : 'embed',
      downloadLink: '',
      resolution: defaultResolution,
      resolutionRaw,
      thumbnailUrl: data.detail?.poster || '',
      episodeData: {
        previous: prevEp,
        animeDetail: `sanka://detail/${slug}`,
        next: nextEp,
      },
      reqNonceAction: 'sanka-mock-nonce',
      reqResolutionWithNonceAction: 'sanka-mock-nonce',
      detailOnly: false,
    } as any;
  }

  /**
   * Scrape jadwal (schedule) anime from Nimegami's jadwal-rilis page.
   * Since the Sanka API doesn't provide a schedule endpoint,
   * we scrape the HTML page directly.
   */
  private static async scrapeJadwalAnime(signal?: AbortSignal): Promise<JadwalAnime> {
    const cacheKey = '__jadwal_anime__';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const response = await axios.get('https://nimegami.id/jadwal-rilis/', {
      headers: {
        'User-Agent': deviceUserAgent,
      },
      timeout: 40_000,
      signal,
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const jadwal: JadwalAnime = {};

    // Nimegami jadwal page uses div.jadwal with h2 for day names
    // and ul > li > a for anime entries
    // Structure: .kglist321 elements, each containing h2 (day) and ul > li > a (anime links)
    const listBlocks = $('div.kglist321');

    listBlocks.each((_i, el) => {
      const block = $(el);
      const dayName = block.find('h2').text().trim();
      if (!dayName) return;

      const animeList: { title: string; link: string }[] = [];
      block.find('ul li > a').each((_j, a) => {
        const title = $(a).text().trim();
        const rawLink = $(a).attr('href') || '';
        if (title && rawLink) {
          // Convert nimegami URL to sanka detail link
          // Extract slug from nimegami URL: https://nimegami.id/xxx-sub-indo/ -> xxx-sub-indo
          const slugMatch = rawLink.match(/nimegami\.id\/([^/]+)\/?$/);
          const slug = slugMatch ? slugMatch[1] : '';
          const link = slug ? `sanka://detail/${slug}` : rawLink;
          animeList.push({ title, link });
        }
      });

      if (animeList.length > 0) {
        jadwal[dayName] = animeList;
      }
    });

    setCache(cacheKey, jadwal);
    return jadwal;
  }
}

export default sankaAnimeApi;

