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
import cleanSynopsis from '../cleanSynopsis';
import getStreamHeaders from '../streamHeaders';

export const __ALIAS = 'otakudesu';
export let DOMAIN = 'otakudesu.blog';
const BASE = () => `https://${DOMAIN}`;

const LEGACY_DOMAINS = ['anime-indo.lol', 'anime-indo.org'];

export async function fetchLatestAnimeIndoDomain(signal?: AbortSignal) {
  const remoteUrls = [
    'https://raw.githubusercontent.com/FightFarewellFearless/AniFlix/master/SCRAPE_DOMAIN.txt',
    'https://raw.githubusercontent.com/Naotica2/naoflix/main/SCRAPE_DOMAIN_OTAKUDESU.txt',
  ];
  for (const url of remoteUrls) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) continue;
      const text = await response.text();
      const domain = text.trim();
      if (domain && domain.includes('.') && !domain.includes('404')) {
        DOMAIN = domain;
        break;
      }
    } catch {
    }
  }
}

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

let cachedNonce: string | null = null;
let nonceTimestamp = 0;
const NONCE_TTL = 300000;

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

export async function extractVideoFromEmbed(
  embedUrl: string,
  signal?: AbortSignal,
  preferredQuality: string = '360',
): Promise<{ url: string; type: 'mp4' | 'hls'; resolutions?: { resolution: string; url: string }[] } | null> {
  try {
    const html = await fetchPage(embedUrl, signal, 8000);

    if (embedUrl.includes('vidhide') || embedUrl.includes('odvidhide')) {
      const unpacked = unpackJS(html);
      if (unpacked) {
        const linksMatch = unpacked.match(/var\s+links\s*=\s*(\{[^}]+\})/);
        if (linksMatch) {
          try {
            const linksStr = linksMatch[1].replace(/\\'/g, "'");
            const m3u8Urls = linksStr.match(/https?:\/\/[^\s'"\\}]+\.m3u8[^\s'"\\}]*/g);
            if (m3u8Urls && m3u8Urls.length > 0) {
              const cdnUrl = m3u8Urls.find(u => u.includes('cdn') || u.includes('hls2'));
              const finalUrl = cdnUrl || m3u8Urls[0];
              const appendedUrl = finalUrl.includes('?')
                ? `${finalUrl}&is_hls=1`
                : `${finalUrl}?is_hls=1`;
              return { url: appendedUrl, type: 'hls' };
            }
          } catch {}
        }

        const m3u8Match = unpacked.match(/https?:\/\/[^\s'"\\]+\.m3u8[^\s'"\\]*/);
        if (m3u8Match) {
          const url = m3u8Match[0];
          return { url: url.includes('?') ? `${url}&is_hls=1` : `${url}?is_hls=1`, type: 'hls' };
        }
      }
    }

    if (embedUrl.includes('desustream') || embedUrl.includes('ondesu')) {
      const qNum = preferredQuality.replace(/[^0-9]/g, '') || '360';
      const bloggerMatch = html.match(/src="(https?:\/\/www\.blogger\.com\/video\.g[^"]+)"/i);
      if (bloggerMatch?.[1]) {
        const bloggerResult = await getBloggerVideo(bloggerMatch[1], qNum, signal);
        if (bloggerResult) {
          return { url: bloggerResult.url, type: 'mp4', resolutions: bloggerResult.resolutions };
        }
      }
      const iframeMatch = html.match(/<iframe[^>]+src="([^"]*blogger[^"]*)"/i);
      if (iframeMatch?.[1]) {
        const bloggerResult = await getBloggerVideo(iframeMatch[1], qNum, signal);
        if (bloggerResult) {
          return { url: bloggerResult.url, type: 'mp4', resolutions: bloggerResult.resolutions };
        }
      }

      // Check for direct videoURL in Desustream lazy player
      const videoUrlMatch = html.match(/(?:const|var|let)?\s*videoURL\s*=\s*["']([^"']+)["']/i);
      if (videoUrlMatch?.[1]) {
        return { url: videoUrlMatch[1], type: videoUrlMatch[1].includes('.m3u8') ? 'hls' : 'mp4' };
      }
    }

    if (embedUrl.includes('filedon')) {
      const dataPageMatch = html.match(/data-page="([^"]+)"/);
      if (dataPageMatch) {
        try {
          const pageData = JSON.parse(dataPageMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
          const fileUrl = pageData?.props?.url || pageData?.props?.file?.url || pageData?.props?.files?.url;
          if (typeof fileUrl === 'string' && fileUrl.startsWith('http')) {
            return { url: normalizeDirectDownloadUrl(fileUrl), type: 'mp4' };
          }
        } catch {}
      }
    }

    // Direct MP4 / M3U8 in PlayerJS or script objects
    const jwFileMatch = html.match(/["']?file["']?\s*:\s*["']([^"']+)["']/i);
    if (jwFileMatch?.[1]) {
      const fileUrl = jwFileMatch[1];
      if (fileUrl.includes('.m3u8')) {
        return { url: fileUrl.includes('?') ? `${fileUrl}&is_hls=1` : `${fileUrl}?is_hls=1`, type: 'hls' };
      }
      if (fileUrl.includes('.mp4') || fileUrl.includes('video') || fileUrl.includes('archive.org')) {
        return { url: fileUrl, type: 'mp4' };
      }
    }

    // Video tag or Source tag
    const sourceMatch = html.match(/<source\s+[^>]*src=["']([^"']+)["']/i) || html.match(/<video\s+[^>]*src=["']([^"']+)["']/i);
    if (sourceMatch?.[1]) {
      const videoUrl = sourceMatch[1];
      if (videoUrl.includes('.m3u8')) {
        return { url: videoUrl.includes('?') ? `${videoUrl}&is_hls=1` : `${videoUrl}?is_hls=1`, type: 'hls' };
      }
      if (videoUrl.endsWith('.mp4') || videoUrl.includes('video')) {
        return { url: videoUrl, type: 'mp4' };
      }
    }

    return null;
  } catch {
    return null;
  }
}

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
        let firstPart = l.split('",')[0].split('"}')[0].split('\\\\\",')[0].split('"]')[0];
        firstPart = firstPart.replace(/\\+$/, '');
        let decoded = firstPart
          .replace(/\\u0026/g, '&')
          .replace(/\\u003d/g, '=')
          .replace(/\\\\/g, '\\')
          .replace(/\\/g, '');
        const clean = `https://rr${decoded}`.split('"}')[0].split('",')[0].split('"')[0];
        return clean;
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

export async function home(signal?: AbortSignal): Promise<EpisodeBaruHome> {
  const html = await fetchPage(BASE(), signal);
  const $ = cheerio.load(html);

  const newAnime: NewAnimeList[] = [];

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

  const [mainHtml, romajiTitle] = await Promise.all([
    fetchPage(`${BASE()}/?s=${encodeURIComponent(query)}&post_type=anime`, signal).catch(() => ''),
    translateToRomaji(query),
  ]);

  const mainResults = parseSearchResults(mainHtml);
  addResults(mainResults);

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
  
  const searchResults = parseSearchResults(html);
  if (searchResults.length > 0) {
    return { result: searchResults };
  }

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

  const genres: string[] = [];
  $('a[href*="/genres/"]').each((_, el) => {
    const genre = $(el).text().trim();
    if (genre) genres.push(genre);
  });

  let thumbnailUrl =
    $('meta[property="og:image"]').attr('content') ||
    $('.fotoanime img').attr('src') ||
    '';

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

  episodeList.reverse();

  return {
    type: 'animeDetail',
    title,
    genres,
    synopsis: cleanSynopsis(synopsis),
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

export function normalizeDirectDownloadUrl(rawUrl: string): string {
  const url = (rawUrl || '').trim();
  if (!url) return '';
  if (
    url.includes('workers-anime.berkasdrive.com/') &&
    !url.includes('workers-anime.berkasdrive.com/download/')
  ) {
    return url.replace(
      'workers-anime.berkasdrive.com/',
      'workers-anime.berkasdrive.com/download/',
    );
  }
  return url;
}

async function extractFiledonSinglePage(
  pageUrl: string,
  signal?: AbortSignal,
): Promise<{ videoUrl: string | null; embedUrl: string | null }> {
  const html = await fetchPage(pageUrl, signal, 6500);
  let embedUrl: string | null = null;

  const dataPageMatch = html.match(/data-page="([^"]+)"/);
  if (dataPageMatch?.[1]) {
    try {
      const pageData = JSON.parse(
        dataPageMatch[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&#039;/g, "'"),
      );
      if (typeof pageData?.props?.embed_url === 'string' && pageData.props.embed_url.startsWith('http')) {
        embedUrl = pageData.props.embed_url;
      }
      const fileUrl =
        pageData?.props?.url ||
        pageData?.props?.file?.url ||
        pageData?.props?.files?.url ||
        pageData?.props?.file?.download_url ||
        pageData?.props?.downloadUrl;
      if (typeof fileUrl === 'string' && fileUrl.startsWith('http')) {
        return { videoUrl: normalizeDirectDownloadUrl(fileUrl), embedUrl };
      }
    } catch {}
  }

  const r2Match = html.match(/https?:\/\/[^"'\s<>]*(?:r2\.dev|cloudflarestorage\.com)[^"'\s<>]*/i);
  if (r2Match?.[0]) {
    return {
      videoUrl: r2Match[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&'),
      embedUrl,
    };
  }

  const mp4Match = html.match(/https?:\/\/[^"'\s<>]+\.mp4(?:[?#][^"'\s<>]*)?/i);
  if (mp4Match?.[0]) {
    return {
      videoUrl: mp4Match[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&'),
      embedUrl,
    };
  }

  return { videoUrl: null, embedUrl };
}

export async function extractFiledonVideoUrl(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    // Filedon /embed/<slug> includes direct R2 presigned props.url directly, whereas /view/<slug> omits props.url
    if (url.includes('filedon.co/view/')) {
      const embedUrl = url.replace('/view/', '/embed/');
      const embedRes = await extractFiledonSinglePage(embedUrl, signal).catch(() => ({
        videoUrl: null,
        embedUrl: null,
      }));
      if (embedRes.videoUrl) return embedRes.videoUrl;
    }

    const first = await extractFiledonSinglePage(url, signal);
    if (first.videoUrl) return first.videoUrl;

    if (first.embedUrl && first.embedUrl !== url) {
      const second = await extractFiledonSinglePage(first.embedUrl, signal).catch(() => ({
        videoUrl: null,
        embedUrl: null,
      }));
      if (second.videoUrl) return second.videoUrl;
    }
  } catch {}
  return null;
}

export async function probeDirectVideoUrl(
  url: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<boolean> {
  const cleanUrl = normalizeDirectDownloadUrl(url);
  if (!cleanUrl || !cleanUrl.startsWith('http') || cleanUrl.toLowerCase().includes('.m3u8')) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort);

  try {
    const reqHeaders: Record<string, string> = {
      'User-Agent': deviceUserAgent,
      Range: 'bytes=0-15',
      ...(headers || {}),
    };
    const res = await fetch(cleanUrl, {
      method: 'GET',
      headers: reqHeaders,
      redirect: 'follow',
      signal: controller.signal,
    });

    const status = res.status;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const contentRange = res.headers.get('content-range');

    // React Native whatwg-fetch lacks ReadableStream cancel(), so abort immediately after headers arrive
    try {
      await res.body?.cancel?.();
    } catch {}
    controller.abort();

    if (status < 200 || status >= 400) {
      return false;
    }

    if (
      contentType.includes('text/html') ||
      contentType.includes('application/json') ||
      contentType.includes('application/xhtml') ||
      contentType.includes('mpegurl') ||
      contentType.includes('text/plain')
    ) {
      return false;
    }

    if (
      contentType.includes('video/') ||
      contentType.includes('application/octet-stream') ||
      contentType.includes('binary/octet-stream')
    ) {
      return true;
    }

    return status === 206 || Boolean(contentRange);
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export async function resolveOtakudesuDownloadUrl(
  linkUrl: string,
  signal?: AbortSignal,
  refererUrl?: string,
): Promise<string> {
  if (!linkUrl) return '';
  const normalized = normalizeDirectDownloadUrl(linkUrl);
  if (normalized.includes('pixeldrain.com/api/file/')) return normalized;
  if (normalized.includes('pixeldrain.com/u/')) {
    const id = normalized.split('/u/')[1]?.split(/[?#]/)[0];
    return id ? `https://pixeldrain.com/api/file/${id}` : normalized;
  }
  if (normalized.includes('filedon.co/')) {
    const extracted = await extractFiledonVideoUrl(normalized, signal);
    return extracted || '';
  }

  const isShortlink =
    normalized.includes('link.desustream.com') ||
    normalized.includes('desustream') ||
    normalized.includes('desudrive') ||
    normalized.includes('desuarchive') ||
    normalized.includes('otakudesu.cloud') ||
    normalized.includes('otakudesu.blog');

  if (isShortlink) {
    const referer = refererUrl || `${BASE()}/`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5500);
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onAbort);

    try {
      const res = await fetch(normalized, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': deviceUserAgent,
          Referer: referer,
        },
        redirect: 'follow',
      });

      const finalUrl = res.url || '';
      const loc = res.headers.get('location') || res.headers.get('Location') || '';
      const ctype = (res.headers.get('content-type') || '').toLowerCase();

      const resolveDirectTarget = async (targetUrl: string): Promise<string | null> => {
        if (!targetUrl) return null;
        if (targetUrl.includes('pixeldrain.com/api/file/')) return targetUrl;
        if (targetUrl.includes('pixeldrain.com/u/')) {
          const id = targetUrl.split('/u/')[1]?.split(/[?#]/)[0];
          return id ? `https://pixeldrain.com/api/file/${id}` : null;
        }
        if (targetUrl.includes('filedon.co/')) {
          return await extractFiledonVideoUrl(targetUrl, signal);
        }
        return null;
      };

      const directFromFinal = await resolveDirectTarget(finalUrl);
      if (directFromFinal !== null) {
        try { await res.body?.cancel?.(); } catch {}
        controller.abort();
        return directFromFinal;
      }

      const directFromLoc = await resolveDirectTarget(loc);
      if (directFromLoc !== null) {
        try { await res.body?.cancel?.(); } catch {}
        controller.abort();
        return directFromLoc;
      }

      // Never read binary stream into res.text() (React Native would buffer an entire video file and hang)
      if (ctype.includes('video/') || ctype.includes('octet-stream')) {
        try { await res.body?.cancel?.(); } catch {}
        controller.abort();
        return finalUrl;
      }

      if (!ctype.includes('text/') && !ctype.includes('html') && !ctype.includes('javascript') && !ctype.includes('json')) {
        try { await res.body?.cancel?.(); } catch {}
        controller.abort();
        return finalUrl && finalUrl !== normalized ? finalUrl : '';
      }

      const bodyText = await res.text().catch(() => '');

      const pdMatch =
        bodyText.match(/content="https?:\/\/pixeldrain\.com\/(?:u|api\/file)\/([a-zA-Z0-9_-]+)"/i) ||
        bodyText.match(/https?:\/\/pixeldrain\.com\/(?:u|api\/file)\/([a-zA-Z0-9_-]+)/i);
      if (pdMatch && pdMatch[1]) {
        return `https://pixeldrain.com/api/file/${pdMatch[1]}`;
      }

      const filedonMatch = bodyText.match(/https?:\/\/filedon\.co\/(?:embed|view)\/[a-zA-Z0-9_-]+/i);
      if (filedonMatch?.[0]) {
        const extracted = await extractFiledonVideoUrl(filedonMatch[0], signal);
        return extracted || '';
      }

      const match =
        bodyText.match(/href="([^"]*(?:pixeldrain|filedon|googlevideo|googleusercontent|odcloud|desustream)[^"]*)"/i) ||
        bodyText.match(/window\.location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i) ||
        bodyText.match(/url=([^"'>\s]+)/i);
      if (match && match[1]) {
        const target = match[1].replace(/&amp;/g, '&');
        const directTarget = await resolveDirectTarget(target);
        if (directTarget !== null) return directTarget;
        return normalizeDirectDownloadUrl(target);
      }
      return '';
    } catch {
      return '';
    } finally {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }
  return normalized;
}

async function firstResolvedValidUrl(tasks: Promise<string>[]): Promise<string> {
  if (tasks.length === 0) return '';
  return await new Promise<string>(resolve => {
    let remaining = tasks.length;
    let settled = false;

    for (const task of tasks) {
      task
        .then(url => {
          if (!settled && url) {
            settled = true;
            resolve(url);
            return;
          }
          remaining -= 1;
          if (!settled && remaining <= 0) resolve('');
        })
        .catch(() => {
          remaining -= 1;
          if (!settled && remaining <= 0) resolve('');
        });
    }
  });
}

export async function resolveBestOtakudesuDownload(
  downloadOptions: { resolution: string; server: string; url: string }[],
  preferredResolution: string = '360p',
  refererUrl?: string,
  fallbackStreamUrl?: string,
  signal?: AbortSignal,
): Promise<string> {
  const candidates: string[] = [];

  if (fallbackStreamUrl && !fallbackStreamUrl.toLowerCase().includes('.m3u8')) {
    if (
      fallbackStreamUrl.includes('googlevideo.com') ||
      fallbackStreamUrl.includes('googleusercontent.com') ||
      fallbackStreamUrl.includes('odcloud') ||
      fallbackStreamUrl.includes('stream-stor') ||
      fallbackStreamUrl.includes('berkasdrive') ||
      fallbackStreamUrl.includes('r2.cloudflarestorage') ||
      fallbackStreamUrl.includes('.mp4')
    ) {
      candidates.push(normalizeDirectDownloadUrl(fallbackStreamUrl));
    }
  }

  const raceController = new AbortController();
  const overallTimer = setTimeout(() => raceController.abort(), 9500);
  const onParentAbort = () => raceController.abort();
  if (signal) signal.addEventListener('abort', onParentAbort);

  const raceSignal = raceController.signal;

  const targetRes = preferredResolution || '360p';
  const resWeight: Record<string, number> = { '360p': 1, '480p': 2, '720p': 3, '1080p': 4 };

  const viableOpts = (downloadOptions || [])
    .map((opt, idx) => ({ opt, idx }))
    .filter(({ opt }) => {
      const lowerSrv = (opt.server || '').toLowerCase();
      return !(
        lowerSrv.includes('mega') ||
        lowerSrv.includes('acefile') ||
        lowerSrv.includes('gofile') ||
        lowerSrv.includes('kfiles') ||
        lowerSrv.includes('viking') ||
        lowerSrv.includes('zippy') ||
        lowerSrv.includes('mediafire') ||
        lowerSrv.includes('kraken') ||
        lowerSrv.includes('terabox')
      );
    })
    .sort((a, b) => {
      const aMatch = a.opt.resolution === targetRes ? 0 : 1;
      const bMatch = b.opt.resolution === targetRes ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;

      const aResW = resWeight[a.opt.resolution] || 99;
      const bResW = resWeight[b.opt.resolution] || 99;
      if (aResW !== bResW) return aResW - bResW;

      const scoreServer = (s: string) => {
        const lower = s.toLowerCase();
        // Filedon R2 CDN works cleanly across Indonesian ISPs alongside Pdrain
        if (lower.includes('filedon')) return 1;
        if (lower.includes('pdrain') || lower.includes('pixeldrain')) return 2;
        if (lower.includes('odfiles') || lower.includes('desu')) return 3;
        return 10;
      };
      const srvDiff = scoreServer(a.opt.server) - scoreServer(b.opt.server);
      if (srvDiff !== 0) return srvDiff;
      return a.idx - b.idx;
    })
    .map(x => x.opt);

  try {
    // Batch 1: Race direct stream URL + top 4 matching resolution download links in parallel
    const firstBatchOpts = viableOpts.slice(0, 4);
    const batch1Tasks: Promise<string>[] = [];

    for (const candidate of candidates) {
      batch1Tasks.push(
        (async () => {
          if (raceSignal.aborted) return '';
          const ok = await probeDirectVideoUrl(
            candidate,
            getStreamHeaders(candidate),
            raceSignal,
          );
          return ok ? candidate : '';
        })(),
      );
    }

    for (const opt of firstBatchOpts) {
      batch1Tasks.push(
        (async () => {
          if (raceSignal.aborted) return '';
          const resolved = await resolveOtakudesuDownloadUrl(opt.url, raceSignal, refererUrl);
          if (!resolved || resolved.toLowerCase().includes('.m3u8')) return '';
          const probeHeaders = {
            Referer: refererUrl || `${BASE()}/`,
            ...(getStreamHeaders(resolved) || {}),
          };
          const ok = await probeDirectVideoUrl(resolved, probeHeaders, raceSignal);
          return ok ? resolved : '';
        })(),
      );
    }

    const winner1 = await firstResolvedValidUrl(batch1Tasks);
    if (winner1) {
      raceController.abort();
      return winner1;
    }

    // Batch 2: Try next 4 backup options if batch 1 all failed and deadline still remains
    if (!raceSignal.aborted && viableOpts.length > 4) {
      const secondBatchOpts = viableOpts.slice(4, 8);
      const batch2Tasks = secondBatchOpts.map(opt =>
        (async () => {
          if (raceSignal.aborted) return '';
          const resolved = await resolveOtakudesuDownloadUrl(opt.url, raceSignal, refererUrl);
          if (!resolved || resolved.toLowerCase().includes('.m3u8')) return '';
          const probeHeaders = {
            Referer: refererUrl || `${BASE()}/`,
            ...(getStreamHeaders(resolved) || {}),
          };
          const ok = await probeDirectVideoUrl(resolved, probeHeaders, raceSignal);
          return ok ? resolved : '';
        })(),
      );
      const winner2 = await firstResolvedValidUrl(batch2Tasks);
      if (winner2) {
        raceController.abort();
        return winner2;
      }
    }

    return candidates[0] || '';
  } finally {
    clearTimeout(overallTimer);
    if (signal) signal.removeEventListener('abort', onParentAbort);
  }
}

export async function streaming(
  episodeUrl: string,
  signal?: AbortSignal,
  preferredResolution?: string,
): Promise<AniStreaming> {
  episodeUrl = normalizeUrl(episodeUrl);

  const html = await fetchPage(episodeUrl, signal);
  const $ = cheerio.load(html);

  const title = $('title')
    .text()
    .replace(/\s*\|.*$/, '')
    .replace(/Subtitle Indonesia/i, '')
    .trim();

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

  // Extract direct download box links (Pdrain, Acefile, Mega, Gofile, etc.)
  const downloadOptions: { resolution: string; server: string; url: string }[] = [];
  $('.download ul li, .download-eps ul li, .smokeurl ul li, .smokedl ul li').each((_, el) => {
    const rawQuality = $(el).find('strong, b, h4').text().trim();
    let resClean = '720p';
    if (rawQuality.includes('360')) resClean = '360p';
    else if (rawQuality.includes('480')) resClean = '480p';
    else if (rawQuality.includes('720')) resClean = '720p';
    else if (rawQuality.includes('1080')) resClean = '1080p';

    $(el).find('a').each((_, a) => {
      const server = $(a).text().trim();
      const href = $(a).attr('href');
      if (href) {
        downloadOptions.push({ resolution: resClean, server, url: href });
      }
    });
  });

  const serverPriority: Record<string, number> = {
    ondesu2hd: 1,
    ondesuhd: 2,
    ondesu: 3,
    odstream: 4,
    odcdn: 5,
    blogs: 6,
    mega: 7,
    vidhide: 80, // Deprioritize vidhide because of anti-hotlink block
    filedon: 99,
  };

  const defaultTargetRes = preferredResolution || '360p';
  const sortedMirrors = [...mirrors].sort((a, b) => {
    const aMatch = a.quality === defaultTargetRes ? 0 : 1;
    const bMatch = b.quality === defaultTargetRes ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    const aP = serverPriority[a.serverName.toLowerCase()] || 50;
    const bP = serverPriority[b.serverName.toLowerCase()] || 50;
    return aP - bP;
  });

  let primaryStreamUrl = '';
  let streamIsHls = false;
  let streamResolutions: { resolution: string; dataContent: string }[] = [];

  // 1. If a non-vidhide/non-filedon mirror exists for the requested default resolution (360p), try it FIRST
  //    so 360p default actually streams 360p instead of inheriting a 720p default iframe.
  const hasPreferredMirror = sortedMirrors.some(
    m =>
      m.quality === defaultTargetRes &&
      m.serverName.toLowerCase() !== 'filedon' &&
      m.serverName.toLowerCase() !== 'mega' &&
      !m.serverName.toLowerCase().includes('vidhide'),
  );

  const defaultIframeSrc = $('.responsive-embed-stream iframe, .player-embed iframe, #pembed iframe').attr('src');
  if (!hasPreferredMirror && defaultIframeSrc) {
    const extracted = await extractVideoFromEmbed(defaultIframeSrc, signal, defaultTargetRes);
    if (extracted) {
      primaryStreamUrl = extracted.url;
      streamIsHls = extracted.type === 'hls';
      if (extracted.resolutions && extracted.resolutions.length > 0) {
        streamResolutions = extracted.resolutions.map(r => ({
          resolution: r.resolution,
          dataContent: `direct_url::${r.url}`,
        }));
      }
    }
  }

  // 2. Try sorted mirrors (prefers requested resolution & non-vidhide native MP4 hosts)
  if (!primaryStreamUrl) {
    const nonce = await getNonce(signal);
    for (const mirror of sortedMirrors) {
      if (signal?.aborted) break;
      const lowerName = mirror.serverName.toLowerCase();
      if (lowerName === 'filedon' || lowerName === 'mega') continue;

      const iframeSrc = await getIframeFromMirror(mirror.decoded, nonce, episodeUrl, signal);
      if (!iframeSrc) continue;

      const extracted = await extractVideoFromEmbed(iframeSrc, signal, mirror.quality || defaultTargetRes);
      if (extracted) {
        primaryStreamUrl = extracted.url;
        streamIsHls = extracted.type === 'hls';

        if (extracted.resolutions && extracted.resolutions.length > 0) {
          streamResolutions = extracted.resolutions.map(r => ({
            resolution: r.resolution,
            dataContent: `direct_url::${r.url}`,
          }));
        }
        break;
      }
    }
  }

  // 2b. Fallback to defaultIframeSrc if sortedMirrors failed
  if (!primaryStreamUrl && defaultIframeSrc) {
    const extracted = await extractVideoFromEmbed(defaultIframeSrc, signal, defaultTargetRes);
    if (extracted) {
      primaryStreamUrl = extracted.url;
      streamIsHls = extracted.type === 'hls';
      if (extracted.resolutions && extracted.resolutions.length > 0) {
        streamResolutions = extracted.resolutions.map(r => ({
          resolution: r.resolution,
          dataContent: `direct_url::${r.url}`,
        }));
      }
    }
  }

  // 3. Fallback: use default iframe or first mirror as embed
  if (!primaryStreamUrl) {
    if (defaultIframeSrc) {
      primaryStreamUrl = defaultIframeSrc;
    } else {
      const nonce = await getNonce(signal);
      for (const mirror of sortedMirrors) {
        const iframeSrc = await getIframeFromMirror(mirror.decoded, nonce, episodeUrl, signal);
        if (iframeSrc) {
          primaryStreamUrl = iframeSrc;
          break;
        }
      }
    }
  }

  if (streamResolutions.length === 0) {
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

  // Prioritize 360p > 480p > 720p > 1080p by default
  const resOrder: Record<string, number> = { '360p': 1, '480p': 2, '720p': 3, '1080p': 4 };
  streamResolutions.sort((a, b) => (resOrder[a.resolution] || 99) - (resOrder[b.resolution] || 99));

  // Determine active resolution: default to 360p unless preferredResolution is explicitly passed
  let activeRes = preferredResolution || '360p';
  if (!streamResolutions.some(r => r.resolution === activeRes)) {
    activeRes = streamResolutions.length > 0 ? streamResolutions[0].resolution : '360p';
  }

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

  if (!episodeData.animeDetail) {
    const breadcrumbLink = $('.flir a, .breadcum a, .breadcrumbs a, .cukder a, .naveps a, .venser a')
      .filter((_, el) => {
        const href = $(el).attr('href') || '';
        return href.includes('/anime/') && !href.includes('anime-list');
      })
      .first()
      .attr('href');
    if (breadcrumbLink) {
      episodeData.animeDetail = breadcrumbLink.startsWith('/') ? `${BASE()}${breadcrumbLink}` : breadcrumbLink;
    }
  }

  const thumbnailUrl = $('meta[property="og:image"]').attr('content') || '';

  const isNativePlayable =
    primaryStreamUrl.includes('googlevideo.com') ||
    primaryStreamUrl.includes('googleusercontent.com') ||
    primaryStreamUrl.includes('pixeldrain.com/api/file/') ||
    primaryStreamUrl.includes('odcloud') ||
    primaryStreamUrl.includes('desustream') ||
    primaryStreamUrl.includes('filedon') ||
    primaryStreamUrl.includes('berkasdrive') ||
    primaryStreamUrl.includes('.mp4') ||
    primaryStreamUrl.includes('.m3u8') ||
    streamIsHls;

  // Keep initial episode opening fast; direct MP4 stream can be used right away, while box links resolve on demand
  let downloadLink = '';
  if (
    primaryStreamUrl &&
    !primaryStreamUrl.toLowerCase().includes('.m3u8') &&
    (primaryStreamUrl.includes('googlevideo.com') ||
      primaryStreamUrl.includes('googleusercontent.com') ||
      primaryStreamUrl.includes('pixeldrain.com/api/file/') ||
      primaryStreamUrl.includes('odcloud') ||
      (primaryStreamUrl.includes('.mp4') && !primaryStreamUrl.includes('.php?')))
  ) {
    downloadLink = normalizeDirectDownloadUrl(primaryStreamUrl);
  }

  return {
    type: 'animeStreaming',
    title,
    streamingLink: primaryStreamUrl || '',
    streamingType: isNativePlayable ? 'raw' : 'embed',
    downloadLink,
    downloadOptions,
    isHls: streamIsHls,
    resolution: activeRes,
    resolutionRaw: streamResolutions,
    thumbnailUrl,
    episodeData,
    reqNonceAction: 'otakudesu-api',
    reqResolutionWithNonceAction: 'otakudesu-api',
  };
}

export async function getResolution(
  resId: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (!resId.includes('::')) return resId;
  const parts = resId.split('::');
  const prefix = parts[0];
  const data = parts.slice(1).join('::');

  if (prefix === 'direct_url') {
    return data;
  }

  if (prefix === 'otakudesu') {
    try {
      const mirrorData = JSON.parse(data);
      const nonce = await getNonce(signal);
      const iframeSrc = await getIframeFromMirror(mirrorData, nonce, `${BASE()}/`, signal);

      if (iframeSrc) {
        const extracted = await extractVideoFromEmbed(iframeSrc, signal);
        if (extracted) {
          return extracted.url;
        }
        return iframeSrc;
      }
    } catch {}
  }

  return data;
}

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

export async function jadwalAnime(
  signal?: AbortSignal,
): Promise<
  Record<
    string,
    { title: string; link: string; thumbnailUrl?: string; estimatedEpisode?: string }[]
  >
> {
  const [html, ongoingHtml1, ongoingHtml2] = await Promise.all([
    fetchPage(`${BASE()}/jadwal-rilis/`, signal).catch(() => ''),
    fetchPage(`${BASE()}/ongoing-anime/`, signal).catch(() => ''),
    fetchPage(`${BASE()}/ongoing-anime/page/2/`, signal).catch(() => ''),
  ]);

  const normalizeHrefKey = (u: string) => u.replace(/\/$/, '').toLowerCase();
  const metaMap: Record<string, { img: string; ep?: string }> = {};
  const parseOngoing = (pageHtml: string) => {
    if (!pageHtml) return;
    const $og = cheerio.load(pageHtml);
    $og('.venz ul li').each((_, el) => {
      let link = $og(el).find('.thumb a').first().attr('href') || '';
      if (link.startsWith('/')) link = `${BASE()}${link}`;
      const img = $og(el).find('.thumb img').first().attr('src') || '';
      const ep = $og(el).find('.epz').first().text().replace(/[\s\n]+/g, ' ').trim();
      const title = $og(el).find('.jdlflm').first().text().trim().toLowerCase();
      const linkKey = link ? normalizeHrefKey(link) : '';
      if (linkKey && (img || ep)) metaMap[linkKey] = { img, ep: ep || undefined };
      if (title && (img || ep)) metaMap[title] = { img, ep: ep || undefined };
    });
  };

  parseOngoing(ongoingHtml1);
  parseOngoing(ongoingHtml2);

  const $ = cheerio.load(html);
  const list = $('div.kglist321');
  const jadwal: Record<
    string,
    { title: string; link: string; thumbnailUrl?: string; estimatedEpisode?: string }[]
  > = {};

  list.each((_, el) => {
    const $el = $(el);
    const day = $el.find('h2').text().trim();
    const arr: {
      title: string;
      link: string;
      thumbnailUrl?: string;
      estimatedEpisode?: string;
    }[] = [];
    $el.find('ul li > a').each((_, a) => {
      let href = $(a).attr('href') || '';
      if (href.startsWith('/')) href = `${BASE()}${href}`;
      const title = $(a).text().trim();
      const lowerTitle = title.toLowerCase();
      const meta = metaMap[normalizeHrefKey(href)] || metaMap[lowerTitle];
      arr.push({
        title,
        link: href,
        thumbnailUrl: meta?.img || undefined,
        estimatedEpisode: meta?.ep || undefined,
      });
    });
    if (day) {
      jadwal[day] = arr;
    }
  });

  return jadwal;
}

export const OTAKUDESU_GENRES: { name: string; slug: string }[] = [
  { name: 'Action', slug: 'action' },
  { name: 'Adventure', slug: 'adventure' },
  { name: 'Comedy', slug: 'comedy' },
  { name: 'Demons', slug: 'demons' },
  { name: 'Drama', slug: 'drama' },
  { name: 'Ecchi', slug: 'ecchi' },
  { name: 'Fantasy', slug: 'fantasy' },
  { name: 'Game', slug: 'game' },
  { name: 'Harem', slug: 'harem' },
  { name: 'Historical', slug: 'historical' },
  { name: 'Horror', slug: 'horror' },
  { name: 'Isekai', slug: 'isekai' },
  { name: 'Josei', slug: 'josei' },
  { name: 'Magic', slug: 'magic' },
  { name: 'Martial Arts', slug: 'martial-arts' },
  { name: 'Mecha', slug: 'mecha' },
  { name: 'Military', slug: 'military' },
  { name: 'Music', slug: 'music' },
  { name: 'Mystery', slug: 'mystery' },
  { name: 'Parody', slug: 'parody' },
  { name: 'Psychological', slug: 'psychological' },
  { name: 'Romance', slug: 'romance' },
  { name: 'Samurai', slug: 'samurai' },
  { name: 'School', slug: 'school' },
  { name: 'Sci-Fi', slug: 'sci-fi' },
  { name: 'Seinen', slug: 'seinen' },
  { name: 'Shoujo', slug: 'shoujo' },
  { name: 'Shounen', slug: 'shounen' },
  { name: 'Slice of Life', slug: 'slice-of-life' },
  { name: 'Space', slug: 'space' },
  { name: 'Sports', slug: 'sports' },
  { name: 'Super Power', slug: 'super-power' },
  { name: 'Supernatural', slug: 'supernatural' },
  { name: 'Thriller', slug: 'thriller' },
  { name: 'Vampire', slug: 'vampire' },
];

export async function getOtakudesuGenres(
  signal?: AbortSignal,
): Promise<{ name: string; slug: string }[]> {
  try {
    const html = await fetchPage(`${BASE()}/genre-list/`, signal);
    const $ = cheerio.load(html);
    const genres: { name: string; slug: string }[] = [];
    $('.genres li a, ul.genre li a, .genre-list li a, a[href*="/genres/"]').each((_, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href') || '';
      const match = href.match(/\/genres\/([^\/]+)/);
      const slug = match ? match[1].trim() : name.toLowerCase().replace(/\s+/g, '-');
      if (name && slug && !genres.some(g => g.slug === slug)) {
        genres.push({ name, slug });
      }
    });
    if (genres.length > 0) return genres;
  } catch {}
  return OTAKUDESU_GENRES;
}
