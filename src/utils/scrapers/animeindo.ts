import cheerio from 'cheerio';
import {
  AniDetail,
  AniDetailEpsList,
  AniStreaming,
  EpisodeBaruHome,
  NewAnimeList,
  SearchAnime,
  listAnimeTypeList,
} from '../../types/anime';
import deviceUserAgent from '../deviceUserAgent';
import { setWebViewOpen } from '../CFBypass';

// ─── Domain Management ────────────────────────────────────────────────────────
export const __ALIAS = 'otakudesu';
export let DOMAIN = 'otakudesu.blog';
const BASE = () => `https://${DOMAIN}`;

// Legacy domain for history fallback
const LEGACY_DOMAINS = ['anime-indo.lol', 'anime-indo.org'];

export async function fetchLatestAnimeIndoDomain(signal?: AbortSignal) {
  try {
    const response = await fetch(
      'https://raw.githubusercontent.com/Naotica2/naoflix/main/SCRAPE_DOMAIN_OTAKUDESU.txt',
      { signal },
    );
    if (!response.ok) return;
    const text = await response.text();
    const domain = text.trim();
    if (domain && domain.includes('.')) {
      DOMAIN = domain;
    }
  } catch {
    // Use fallback domain
  }
}

// ─── Fetch Helpers ────────────────────────────────────────────────────────────
async function fetchPage(url: string, signal?: AbortSignal, customTimeout: number = 10000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), customTimeout);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': deviceUserAgent,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
      },
    });

    if (response.status === 403 || response.status === 503) {
      setWebViewOpen.openWebViewCF(true, url);
      throw new Error('Silahkan selesaikan captcha');
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} on ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

// ─── URL Normalization (Legacy History Fallback) ──────────────────────────────
function normalizeUrl(inputUrl: string): string {
  for (const legacy of LEGACY_DOMAINS) {
    if (inputUrl.includes(legacy)) {
      try {
        const urlObj = new URL(inputUrl);
        return `${BASE()}${urlObj.pathname}`;
      } catch {}
    }
  }
  if (inputUrl.includes('otakudesu')) {
    try {
      const urlObj = new URL(inputUrl);
      return `${BASE()}${urlObj.pathname}`;
    } catch {}
  }
  return inputUrl;
}

// ─── Nonce Management ─────────────────────────────────────────────────────────
let cachedNonce: string | null = null;
let nonceTimestamp = 0;
const NONCE_TTL = 300000; // 5 minutes

async function getNonce(signal?: AbortSignal): Promise<string> {
  if (cachedNonce && Date.now() - nonceTimestamp < NONCE_TTL) {
    return cachedNonce;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort);

  try {
    const res = await fetch(`${BASE()}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': deviceUserAgent,
        Referer: `${BASE()}/`,
      },
      body: 'action=aa1208d27f29ca340c92c66d1926f13f',
    });
    const json = await res.json();
    cachedNonce = json.data;
    nonceTimestamp = Date.now();
    return cachedNonce!;
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

async function getIframeFromMirror(
  mirrorData: { id: number; i: number; q: string },
  nonce: string,
  referer: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort);

  try {
    const params = new URLSearchParams();
    params.set('id', String(mirrorData.id));
    params.set('i', String(mirrorData.i));
    params.set('q', mirrorData.q);
    params.set('nonce', nonce);
    params.set('action', '2a3505c93b0035d3f455df82bf976b84');

    const res = await fetch(`${BASE()}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': deviceUserAgent,
        Referer: referer,
      },
      body: params.toString(),
    });
    const json = await res.json();
    if (json.data) {
      const decoded = atob(json.data);
      const $ = cheerio.load(decoded);
      let iframeSrc = $('iframe').attr('src');
      if (iframeSrc?.startsWith('//')) iframeSrc = `https:${iframeSrc}`;
      return iframeSrc || null;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

// ─── Video Extraction ─────────────────────────────────────────────────────────

// Unpack eval(function(p,a,c,k,e,d){...}) packed JavaScript
function unpackJS(packed: string): string | null {
  const match = packed.match(
    /eval\(function\(p,a,c,k,e,[dr]\)\{.*?\}\('((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']*)'/s,
  );
  if (!match) return null;

  const payload = match[1];
  const radix = parseInt(match[2]);
  const count = parseInt(match[3]);
  const keywords = match[4].split('|');

  function encode(num: number, base: number): string {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (num === 0) return '0';
    let result = '';
    let n = num;
    while (n > 0) {
      result = chars[n % base] + result;
      n = Math.floor(n / base);
    }
    return result;
  }

  let unpacked = payload;
  for (let i = count - 1; i >= 0; i--) {
    const encoded = encode(i, radix);
    if (keywords[i]) {
      unpacked = unpacked.replace(new RegExp('\\b' + encoded + '\\b', 'g'), keywords[i]);
    }
  }
  return unpacked;
}

// Extract direct video URL from various embed servers
async function extractVideoFromEmbed(
  embedUrl: string,
  signal?: AbortSignal,
): Promise<{ url: string; type: 'mp4' | 'hls'; resolutions?: { resolution: string; url: string }[] } | null> {
  try {
    const html = await fetchPage(embedUrl, signal, 8000);

    // === VIDHIDE: Packed JS with HLS links ===
    if (embedUrl.includes('vidhide') || embedUrl.includes('odvidhide')) {
      const unpacked = unpackJS(html);
      if (unpacked) {
        // Extract HLS URLs from unpacked JS
        // Priority: hls4 (relative/internal) > hls2 (CDN with token) > hls3
        const linksMatch = unpacked.match(/var\s+links\s*=\s*(\{[^}]+\})/);
        if (linksMatch) {
          try {
            // Clean up escaped quotes
            const linksStr = linksMatch[1].replace(/\\'/g, "'");
            const m3u8Urls = linksStr.match(/https?:\/\/[^\s'"\\}]+\.m3u8[^\s'"\\}]*/g);
            if (m3u8Urls && m3u8Urls.length > 0) {
              // Prefer the CDN URL (hls2 with acek-cdn or similar)
              const cdnUrl = m3u8Urls.find(u => u.includes('cdn') || u.includes('hls2'));
              const finalUrl = cdnUrl || m3u8Urls[0];
              const appendedUrl = finalUrl.includes('?')
                ? `${finalUrl}&is_hls=1`
                : `${finalUrl}?is_hls=1`;
              return { url: appendedUrl, type: 'hls' };
            }
          } catch {}
        }

        // Fallback: any m3u8 in unpacked
        const m3u8Match = unpacked.match(/https?:\/\/[^\s'"\\]+\.m3u8[^\s'"\\]*/);
        if (m3u8Match) {
          const url = m3u8Match[0];
          return { url: url.includes('?') ? `${url}&is_hls=1` : `${url}?is_hls=1`, type: 'hls' };
        }
      }
    }

    // === ONDESU / BLOGGER: Follow iframe to blogger video, extract MP4 ===
    if (embedUrl.includes('desustream') || embedUrl.includes('ondesu')) {
      // Ondesu wraps a blogger.com/video.g iframe
      const bloggerMatch = html.match(/src="(https?:\/\/www\.blogger\.com\/video\.g[^"]+)"/i);
      if (bloggerMatch?.[1]) {
        const bloggerResult = await getBloggerVideo(bloggerMatch[1], '720', signal);
        if (bloggerResult) {
          return { url: bloggerResult.url, type: 'mp4', resolutions: bloggerResult.resolutions };
        }
      }
      // Also check for direct iframe src to blogger
      const iframeMatch = html.match(/<iframe[^>]+src="([^"]*blogger[^"]*)"/i);
      if (iframeMatch?.[1]) {
        const bloggerResult = await getBloggerVideo(iframeMatch[1], '720', signal);
        if (bloggerResult) {
          return { url: bloggerResult.url, type: 'mp4', resolutions: bloggerResult.resolutions };
        }
      }
    }

    // === FILEDON: Check for direct video link ===
    if (embedUrl.includes('filedon')) {
      // Filedon is a file hosting service, check data-page for video info
      const dataPageMatch = html.match(/data-page="([^"]+)"/);
      if (dataPageMatch) {
        try {
          const pageData = JSON.parse(dataPageMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
          if (pageData?.props?.file?.url) {
            return { url: pageData.props.file.url, type: 'mp4' };
          }
        } catch {}
      }
    }

    // === GENERIC: <source src="..."> ===
    const sourceMatch = html.match(/<source\s+src="([^"]+)"/i);
    if (sourceMatch?.[1]) {
      const videoUrl = sourceMatch[1];
      if (videoUrl.endsWith('.mp4') || videoUrl.includes('video')) {
        return { url: videoUrl, type: 'mp4' };
      }
    }

    // === GENERIC: JWPlayer "file" key ===
    const jwFileMatch = html.match(/"file"\s*:\s*"([^"]+)"/);
    if (jwFileMatch?.[1]) {
      const fileUrl = jwFileMatch[1];
      if (fileUrl.includes('.m3u8')) {
        return { url: fileUrl.includes('?') ? `${fileUrl}&is_hls=1` : `${fileUrl}?is_hls=1`, type: 'hls' };
      }
      if (fileUrl.includes('.mp4') || fileUrl.includes('video')) {
        return { url: fileUrl, type: 'mp4' };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Blogger Video Extraction ─────────────────────────────────────────────────
let requestCounter = 0;
function getReqId() {
  const now = new Date();
  const secondsSinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const reqid = 1 + secondsSinceMidnight + requestCounter * 100000;
  requestCounter++;
  return reqid;
}

interface BloggerResult {
  url: string;
  resolutions: { resolution: string; url: string }[];
}

async function getBloggerVideo(
  url: string,
  quality: string = '720',
  signal?: AbortSignal,
): Promise<BloggerResult | null> {
  const text = await fetchPage(url, signal);
  try {
    const streamsMatch = text.match(/"streams":(\[.*?\])/);
    if (streamsMatch?.[1]) {
      const streamsArr = JSON.parse(streamsMatch[1]);
      const formatMap: Record<number, string> = { 18: '360p', 59: '480p', 22: '720p', 37: '1080p' };

      const resolutions: { resolution: string; url: string }[] = [];
      for (const s of streamsArr) {
        const resName = formatMap[s.format_id];
        if (resName && s.play_url) resolutions.push({ resolution: resName, url: s.play_url });
      }
      if (resolutions.length > 0) {
        const mainUrl = resolutions.find(r => r.resolution === `${quality}p`)?.url || resolutions[0].url;
        return { url: mainUrl, resolutions };
      }
    }
  } catch {}

  try {
    const tokenMatch = url.match(/[?&]token=([^&]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;
    if (!token) throw new Error('Token Blogger tidak ditemukan');
    const f_sid = text.split('FdrFJe":"')[1].split('"')[0];
    const bl = text.split('cfb2h":"')[1].split('"')[0];
    const response = await fetch(
      `https://www.blogger.com/_/BloggerVideoPlayerUi/data/batchexecute?rpcids=WcwnYd&source-path=%2Fvideo.g&f.sid=${f_sid}&bl=${bl}&hl=en-US&_reqid=${getReqId()}&rt=c`,
      {
        signal,
        headers: {
          accept: '*/*',
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': deviceUserAgent,
          'x-same-domain': '1',
          Referer: 'https://www.blogger.com/',
        },
        body: `f.req=%5B%5B%5B%22WcwnYd%22%2C%22%5B%5C%22${token}%5C%22%2C%5C%22%5C%22%2C0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&`,
        method: 'POST',
      },
    );
    const apiText = await response.text();
    const links = apiText.split('https://rr');
    if (links.length > 1) {
      links.shift();
      const cleanedLinks = links.map(l => {
        let firstPart = l.split('",')[0].split('\\\\\",')[0].split('"]')[0];
        firstPart = firstPart.replace(/\\+$/, '');
        let decoded = firstPart
          .replace(/\\u0026/g, '&')
          .replace(/\\u003d/g, '=')
          .replace(/\\\\/g, '\\')
          .replace(/\\/g, '');
        return `https://rr${decoded}`;
      });

      const resolutions: { resolution: string; url: string }[] = [];
      if (cleanedLinks.length === 1) {
        resolutions.push({ resolution: '360p', url: cleanedLinks[0] });
      } else if (cleanedLinks.length === 2) {
        resolutions.push({ resolution: '360p', url: cleanedLinks[0] });
        resolutions.push({ resolution: '720p', url: cleanedLinks[1] });
      } else if (cleanedLinks.length >= 3) {
        resolutions.push({ resolution: '360p', url: cleanedLinks[0] });
        resolutions.push({ resolution: '720p', url: cleanedLinks[1] });
        resolutions.push({ resolution: '1080p', url: cleanedLinks[2] });
      }

      if (resolutions.length > 0) {
        const mainUrl =
          resolutions.find(r => r.resolution === `${quality}p`)?.url ||
          resolutions[resolutions.length - 1].url;
        return { url: mainUrl, resolutions };
      }
    }
  } catch {}
  return null;
}

// ─── Home (Latest + Popular) ─────────────────────────────────────────────────
export async function home(signal?: AbortSignal): Promise<EpisodeBaruHome> {
  const html = await fetchPage(BASE(), signal);
  const $ = cheerio.load(html);

  const newAnime: NewAnimeList[] = [];

  // Otakudesu homepage: .venz ul li .detpost
  $('.venz ul li').each((_, el) => {
    const $li = $(el);
    const detpost = $li.find('.detpost');
    if (detpost.length === 0) return;

    const episode = detpost.find('.epz').text().replace(/[\s\n]+/g, ' ').trim();
    const day = detpost.find('.epztipe').text().trim();
    const date = detpost.find('.newnime').text().trim();

    const a = detpost.find('.thumb a').first();
    let link = a.attr('href') || '';
    if (link.startsWith('/')) link = `${BASE()}${link}`;

    const title = detpost.find('.jdlflm').text().trim() ||
                  detpost.find('.thumbz img').attr('alt') || '';
    const poster = detpost.find('.thumbz img').attr('src') || '';

    if (title && link) {
      newAnime.push({
        title,
        thumbnailUrl: poster,
        episode: episode || '',
        streamingLink: link,
        releaseDate: date,
        releaseDay: day || 'Terbaru',
      });
    }
  });

  return {
    newAnime,
    jadwalAnime: {},
  };
}

// ─── Latest (paginated) ──────────────────────────────────────────────────────
export async function getAnimeByGenre(
  genre: string,
  page: number = 1,
  signal?: AbortSignal,
): Promise<NewAnimeList[]> {
  const url = `${BASE()}/genres/${genre}/page/${page}/`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  const results: NewAnimeList[] = [];

  $('.col-anime-con').each((_, el) => {
    const $el = $(el);
    const title = $el.find('.col-anime-title').text().trim();
    const link = $el.find('a').attr('href') || '';
    const poster = $el.find('img').attr('src') || '';
    const episode = $el.find('.col-anime-eps').text().trim();
    const studio = $el.find('.col-anime-studio').text().trim();
    
    if (title && link) {
      results.push({
        title,
        thumbnailUrl: poster,
        episode: episode || 'Unknown Eps',
        streamingLink: link.startsWith('/') ? `${BASE()}${link}` : link,
        releaseDate: '',
        releaseDay: studio || 'Unknown Studio',
      });
    }
  });

  return results;
}

export async function latestAnime(
  page: number = 1,
  signal?: AbortSignal,
): Promise<NewAnimeList[]> {
  const url = page <= 1 ? BASE() : `${BASE()}/page/${page}/`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  const results: NewAnimeList[] = [];

  $('.venz ul li').each((_, el) => {
    const $li = $(el);
    const detpost = $li.find('.detpost');
    if (detpost.length === 0) return;

    const episode = detpost.find('.epz').text().replace(/[\s\n]+/g, ' ').trim();
    const day = detpost.find('.epztipe').text().trim();
    const date = detpost.find('.newnime').text().trim();

    const a = detpost.find('.thumb a').first();
    let link = a.attr('href') || '';
    if (link.startsWith('/')) link = `${BASE()}${link}`;

    const title = detpost.find('.jdlflm').text().trim() ||
                  detpost.find('.thumbz img').attr('alt') || '';
    const poster = detpost.find('.thumbz img').attr('src') || '';

    if (title && link) {
      results.push({
        title,
        thumbnailUrl: poster,
        episode: episode || '',
        streamingLink: link,
        releaseDate: date,
        releaseDay: day || 'Terbaru',
      });
    }
  });

  return results;
}

// ─── Search ──────────────────────────────────────────────────────────────────

// Helper: translate English title to Romaji using Anilist GraphQL
async function translateToRomaji(query: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const graphql = `
    query ($search: String) {
      Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
        title {
          romaji
        }
      }
    }`;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: graphql, variables: { search: query } }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const anilistJson = await res.json();
    if (anilistJson?.data?.Media?.title?.romaji) {
      return anilistJson.data.Media.title.romaji;
    }
    return null;
  } catch {
    return null;
  }
}

function parseSearchResults(html: string): SearchAnime['result'] {
  const $ = cheerio.load(html);
  const results: SearchAnime['result'] = [];

  // Otakudesu search: li with img + h2 a[href*="/anime/"]
  $('ul.chi_anime li, .page li').each((_, el) => {
    const $li = $(el);
    const a = $li.find('a[href*="/anime/"]').first();
    if (a.length === 0) return;

    let link = a.attr('href') || '';
    if (link.startsWith('/')) link = `${BASE()}${link}`;

    const title = $li.find('h2').text().trim() || a.text().trim();
    const poster = $li.find('img').attr('src') || '';

    const genres: string[] = [];
    $li.find('a[href*="/genres/"]').each((_, ge) => {
      const g = $(ge).text().trim();
      if (g) genres.push(g);
    });

    const fullText = $li.text();
    const statusMatch = fullText.match(/Status\s*:\s*(\w+)/i);
    const ratingMatch = fullText.match(/Rating\s*:\s*([\d.]+)/i);

    if (title && link) {
      results.push({
        title: title.replace(/Subtitle Indonesia/i, '').trim(),
        thumbnailUrl: poster,
        animeUrl: link,
        status: statusMatch?.[1] || 'Unknown',
        genres,
        rating: ratingMatch?.[1] || '',
      });
    }
  });

  return results;
}

export async function search(query: string, signal?: AbortSignal): Promise<SearchAnime> {
  const addedUrls = new Set<string>();
  const allResults: SearchAnime['result'] = [];

  const addResults = (items: SearchAnime['result'], prepend = false) => {
    for (const item of items) {
      if (addedUrls.has(item.animeUrl)) continue;
      addedUrls.add(item.animeUrl);
      if (prepend) allResults.unshift(item);
      else allResults.push(item);
    }
  };

  // Run main search + Anilist translation in parallel
  const [mainHtml, romajiTitle] = await Promise.all([
    fetchPage(`${BASE()}/?s=${encodeURIComponent(query)}&post_type=anime`, signal).catch(() => ''),
    translateToRomaji(query),
  ]);

  const mainResults = parseSearchResults(mainHtml);
  addResults(mainResults);

  // If Anilist returned a different (Romaji) title, search with that too
  if (romajiTitle && romajiTitle.toLowerCase() !== query.toLowerCase()) {
    try {
      const romajiHtml = await fetchPage(
        `${BASE()}/?s=${encodeURIComponent(romajiTitle)}&post_type=anime`,
        signal,
      );
      const romajiResults = parseSearchResults(romajiHtml);
      addResults(romajiResults, true);
    } catch {}
  }

  return { result: allResults };
}

export async function searchMovies(page: number = 1, signal?: AbortSignal): Promise<SearchAnime> {
  const pagePath = page <= 1 ? '' : `/page/${page}/`;
  const html = await fetchPage(
    `${BASE()}/anime-movie${pagePath}`,
    signal,
  ).catch(() => '');
  
  // Try to parse using both parsers since layout might match either search or home
  const searchResults = parseSearchResults(html);
  if (searchResults.length > 0) {
    return { result: searchResults };
  }

  // Fallback to parseLatestAnime
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  const result: SearchAnime['result'] = [];

  $('.venz ul li').each((_: number, el: any) => {
    const title = $(el).find('h2.jdlflm').text().trim();
    const animeUrl = $(el).find('div.thumb > a').attr('href') || '';
    const thumbnailUrl = $(el).find('div.thumbz > img').attr('src') || '';
    const rating = $(el).find('.epztipe').text().trim() || '?';

    if (title && animeUrl) {
      result.push({
        title,
        animeUrl: normalizeUrl(animeUrl),
        thumbnailUrl: normalizeUrl(thumbnailUrl),
        rating,
        status: 'Completed',
        genres: [],
      });
    }
  });

  return { result };
}

// ─── Detail ──────────────────────────────────────────────────────────────────
export async function detail(animeUrl: string, signal?: AbortSignal): Promise<AniDetail> {
  animeUrl = normalizeUrl(animeUrl);

  const html = await fetchPage(animeUrl, signal);
  const $ = cheerio.load(html);

  const title = $('h1.entry-title')
    .text()
    .replace(/Subtitle Indonesia/i, '')
    .trim() ||
    $('title')
      .text()
      .replace(/\s*\|.*$/, '')
      .replace(/Subtitle Indonesia/i, '')
      .trim();

  // Parse info from .infozingle spans
  let synopsis = '';
  let rating = '';
  let releaseYear = '';
  let status = 'Unknown';
  let studio = 'Unknown';
  let animeType = 'TV';
  let epsTotal = '?';
  let minutesPerEp = '24 min';

  $('.infozingle span, .infozin span').each((_, el) => {
    const text = $(el).text().trim();
    if (text.startsWith('Skor:')) rating = text.replace('Skor:', '').trim();
    else if (text.startsWith('Status:')) status = text.replace('Status:', '').trim();
    else if (text.startsWith('Studio:')) studio = text.replace('Studio:', '').trim();
    else if (text.startsWith('Tipe:')) animeType = text.replace('Tipe:', '').trim();
    else if (text.startsWith('Total Episode:')) epsTotal = text.replace('Total Episode:', '').trim();
    else if (text.startsWith('Durasi:')) minutesPerEp = text.replace('Durasi:', '').trim();
    else if (text.startsWith('Tanggal Rilis:')) releaseYear = text.replace('Tanggal Rilis:', '').trim();
  });

  // Synopsis
  const sinopsisSelectors = ['.sinopc', '.sino498', '.sino'];
  for (const selector of sinopsisSelectors) {
    const el = $(selector);
    if (el.length) {
      synopsis = el.text().trim();
      if (synopsis) break;
    }
  }

  if (!synopsis) {
    synopsis =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';
  }

  // Genres
  const genres: string[] = [];
  $('a[href*="/genres/"]').each((_, el) => {
    const genre = $(el).text().trim();
    if (genre) genres.push(genre);
  });

  // Thumbnail
  let thumbnailUrl =
    $('meta[property="og:image"]').attr('content') ||
    $('.fotoanime img').attr('src') ||
    '';

  // Episode list
  const episodeList: AniDetailEpsList[] = [];
  const seenEpLinks = new Set<string>();
  $('.episodelist ul li').each((_, el) => {
    const $li = $(el);
    const a = $li.find('a').first();
    let link = a.attr('href') || '';
    if (link.startsWith('/')) link = `${BASE()}${link}`;

    if (!link || seenEpLinks.has(link)) return;
    seenEpLinks.add(link);

    const epText = a.text().trim();
    const dateSpan = $li.find('.zemark').text().trim();

    if (epText && link.includes('/episode/')) {
      let cleanedEp = epText.replace(/Subtitle Indonesia/i, '').trim();
      const epMatch = cleanedEp.match(/Episode\s*\d+(\.\d+)?/i) || cleanedEp.match(/OVA/i);
      if (epMatch) {
        cleanedEp = epMatch[0];
      }
      
      episodeList.push({
        title: cleanedEp,
        link,
        releaseDate: dateSpan,
      });
    }
  });

  // Reverse to show oldest first
  episodeList.reverse();

  return {
    type: 'animeDetail',
    title,
    genres,
    synopsis,
    detailOnly: false,
    episodeList,
    epsTotal,
    minutesPerEp,
    thumbnailUrl,
    alternativeTitle: title,
    rating,
    releaseYear,
    status,
    studio,
    animeType,
  };
}

// ─── Streaming ───────────────────────────────────────────────────────────────
export async function streaming(episodeUrl: string, signal?: AbortSignal): Promise<AniStreaming> {
  episodeUrl = normalizeUrl(episodeUrl);

  const html = await fetchPage(episodeUrl, signal);
  const $ = cheerio.load(html);

  const title = $('title')
    .text()
    .replace(/\s*\|.*$/, '')
    .replace(/Subtitle Indonesia/i, '')
    .trim();

  // Parse mirror buttons: .mirrorstream a[data-content]
  interface MirrorButton {
    serverName: string;
    quality: string;
    decoded: { id: number; i: number; q: string };
    raw: string;
  }

  const mirrors: MirrorButton[] = [];
  $('.mirrorstream a[data-content]').each((_, el) => {
    const dataContent = $(el).attr('data-content');
    const serverName = $(el).text().trim();
    if (dataContent) {
      try {
        const decoded = JSON.parse(atob(dataContent));
        mirrors.push({
          serverName,
          quality: decoded.q || '480p',
          decoded,
          raw: dataContent,
        });
      } catch {}
    }
  });

  // Get nonce
  const nonce = await getNonce(signal);

  // Strategy: prioritize native-playable servers
  // 1. ondesu/ondesuhd → Blogger MP4 (native, multi-resolution)
  // 2. vidhide → HLS m3u8 (native HLS)
  // 3. filedon/mega → embed fallback

  // Sort mirrors by preference
  const serverPriority: Record<string, number> = {
    ondesuhd: 1,
    ondesu: 2,
    vidhide: 3,
    filedon: 4,
    mega: 5,
  };

  const sortedMirrors = [...mirrors].sort((a, b) => {
    const aP = serverPriority[a.serverName.toLowerCase()] || 99;
    const bP = serverPriority[b.serverName.toLowerCase()] || 99;
    return aP - bP;
  });

  let primaryStreamUrl = '';
  let streamIsHls = false;
  let streamResolutions: { resolution: string; dataContent: string }[] = [];

  // Try to extract native video from best server
  for (const mirror of sortedMirrors) {
    if (signal?.aborted) break;

    const iframeSrc = await getIframeFromMirror(mirror.decoded, nonce, episodeUrl, signal);
    if (!iframeSrc) continue;

    const extracted = await extractVideoFromEmbed(iframeSrc, signal);
    if (extracted) {
      primaryStreamUrl = extracted.url;
      streamIsHls = extracted.type === 'hls';

      if (extracted.resolutions && extracted.resolutions.length > 0) {
        // Got multi-resolution (blogger) → use as resolution list
        streamResolutions = extracted.resolutions.map(r => ({
          resolution: r.resolution,
          dataContent: `direct_url::${r.url}`,
        }));
      }
      break; // Got a native URL!
    }
  }

  // If no native extraction worked, build resolution list from mirrors for embed mode
  if (!primaryStreamUrl) {
    // Use first available mirror as embed
    for (const mirror of sortedMirrors) {
      const iframeSrc = await getIframeFromMirror(mirror.decoded, nonce, episodeUrl, signal);
      if (iframeSrc) {
        primaryStreamUrl = iframeSrc;
        break;
      }
    }
  }

  // Build server resolution list if we don't have direct resolutions
  if (streamResolutions.length === 0) {
    // Group mirrors by quality
    const qualityMap = new Map<string, MirrorButton>();
    for (const mirror of sortedMirrors) {
      const key = mirror.quality;
      if (!qualityMap.has(key)) {
        qualityMap.set(key, mirror);
      }
    }
    for (const [quality, mirror] of qualityMap) {
      streamResolutions.push({
        resolution: quality,
        dataContent: `otakudesu::${JSON.stringify(mirror.decoded)}`,
      });
    }
  }

  // Sort resolutions
  const resOrder: Record<string, number> = { '360p': 1, '480p': 2, '720p': 3, '1080p': 4 };
  streamResolutions.sort((a, b) => (resOrder[a.resolution] || 99) - (resOrder[b.resolution] || 99));

  // Navigation: prev/next episode
  const episodeData: { previous?: string; animeDetail: string; next?: string } = {
    animeDetail: '',
  };

  $('a').each((_, el) => {
    const a = $(el);
    const text = a.text().trim().toLowerCase();
    let href = a.attr('href') || '';
    if (href.startsWith('/')) href = `${BASE()}${href}`;

    if (text.includes('prev') || text.includes('sebelum')) {
      episodeData.previous = href;
    }
    if (text.includes('next') || text.includes('selanjut')) {
      episodeData.next = href;
    }
    if ((text.includes('see all') || text.includes('semua episode')) && href.includes('/anime/')) {
      episodeData.animeDetail = href;
    }
  });

  // Fallback: derive anime detail from episode URL
  if (!episodeData.animeDetail) {
    const detailLink = $('a[href*="/anime/"]')
      .filter((_, el) => !$(el).attr('href')?.includes('anime-list'))
      .first()
      .attr('href');
    if (detailLink) {
      episodeData.animeDetail = detailLink.startsWith('/') ? `${BASE()}${detailLink}` : detailLink;
    }
  }

  const thumbnailUrl = $('meta[property="og:image"]').attr('content') || '';

  const isNativePlayable =
    primaryStreamUrl.includes('googlevideo.com') ||
    primaryStreamUrl.includes('googleusercontent.com') ||
    primaryStreamUrl.includes('.m3u8') ||
    streamIsHls;

  // Download link
  let downloadLink = '';
  if (primaryStreamUrl.includes('.mp4') && !primaryStreamUrl.includes('.php?')) {
    downloadLink = primaryStreamUrl;
  }

  return {
    type: 'animeStreaming',
    title,
    streamingLink: primaryStreamUrl || '',
    streamingType: isNativePlayable ? 'raw' : 'embed',
    downloadLink,
    isHls: streamIsHls,
    resolution: streamResolutions.length > 0 ? streamResolutions[0].resolution : undefined,
    resolutionRaw: streamResolutions,
    thumbnailUrl,
    episodeData,
    reqNonceAction: 'otakudesu-api',
    reqResolutionWithNonceAction: 'otakudesu-api',
  };
}

// ─── Resolution Switcher ─────────────────────────────────────────────────────
export async function getResolution(
  resId: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (!resId.includes('::')) return resId;
  const parts = resId.split('::');
  const prefix = parts[0];
  const data = parts.slice(1).join('::');

  // Direct URL (already extracted)
  if (prefix === 'direct_url') {
    return data;
  }

  // Otakudesu mirror switch: data is JSON of {id, i, q}
  if (prefix === 'otakudesu') {
    try {
      const mirrorData = JSON.parse(data);
      const nonce = await getNonce(signal);
      const iframeSrc = await getIframeFromMirror(mirrorData, nonce, `${BASE()}/`, signal);

      if (iframeSrc) {
        // Try to extract native video
        const extracted = await extractVideoFromEmbed(iframeSrc, signal);
        if (extracted) {
          return extracted.url;
        }
        // Fallback: return iframe as embed
        return iframeSrc;
      }
    } catch {}
  }

  return data;
}

// ─── Anime List ──────────────────────────────────────────────────────────────
export async function animeList(
  signal?: AbortSignal,
  streamingCallback?: (data: listAnimeTypeList[]) => void,
): Promise<listAnimeTypeList[]> {
  const html = await fetchPage(`${BASE()}/anime-list/`, signal);
  const $ = cheerio.load(html);

  const results: listAnimeTypeList[] = [];

  $('a[href*="/anime/"]').each((_, el) => {
    const a = $(el);
    let link = a.attr('href') || '';
    if (link.startsWith('/')) link = `${BASE()}${link}`;
    const title = a.text().trim();

    if (title && link && link.includes('/anime/') && !link.includes('anime-list')) {
      results.push({ title, streamingLink: link });
      if (streamingCallback && results.length % 100 === 0) {
        streamingCallback(results);
      }
    }
  });

  return results;
}
