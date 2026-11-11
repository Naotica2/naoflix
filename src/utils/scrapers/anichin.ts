import cheerio from 'cheerio';
import { Buffer } from 'buffer';
import {
  AniDetail,
  AniStreaming,
  EpisodeBaruHome,
  NewAnimeList,
  SearchAnime,
} from '../../types/anime';
import deviceUserAgent from '../deviceUserAgent';
import { setWebViewOpen } from '../CFBypass';
import { getRemoteConfig } from '../remoteConfig';

export const __ALIAS = 'anichin';

// Default domain, can be updated via remote config
let DOMAIN = 'anichin.cafe';
const BASE = () => `https://${DOMAIN}`;

export async function fetchRemoteConfig() {
  const config = getRemoteConfig();
  if (config.anichin_domain) DOMAIN = config.anichin_domain.replace(/^https?:\/\//, '');
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

    const text = await response.text();
    if (text.includes('Just a moment') && text.includes('challenge-platform')) {
      setWebViewOpen.openWebViewCF(true, url);
      throw new Error('Silahkan selesaikan captcha');
    }
    return text;
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export async function home(signal?: AbortSignal): Promise<EpisodeBaruHome> {
  await fetchRemoteConfig();
  const newAnime = await latestAnime(1, signal).catch(() => []);
  return { newAnime, jadwalAnime: {} }; // Anichin rarely uses schedules like JP Anime
}

export async function latestAnime(page: number = 1, signal?: AbortSignal): Promise<NewAnimeList[]> {
  await fetchRemoteConfig();
  const url = page === 1 ? BASE() : `${BASE()}/page/${page}/`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);
  
  const results: NewAnimeList[] = [];
  $('.bixbox').first().find('.bs').each((i, el) => {
    const a = $(el).find('a').first();
    const title = $(el).find('.tt').text().trim();
    let link = a.attr('href') || '';
    
    let image = $(el).find('img').attr('src') || '';
    if (image.startsWith('//')) image = `https:${image}`;
    
    const episode = $(el).find('.epx').text().trim() || '';
    
    if (title && link) {
      results.push({
        title,
        episode,
        thumbnailUrl: image,
        streamingLink: link,
        releaseDate: '',
        releaseDay: '',
      });
    }
  });
  
  return results;
}

export async function search(query: string, signal?: AbortSignal): Promise<SearchAnime> {
  await fetchRemoteConfig();
  const url = `${BASE()}/?s=${encodeURIComponent(query)}`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);
  
  const results: any[] = [];
  $('.bs').each((i, el) => {
    const a = $(el).find('a').first();
    const title = $(el).find('.tt').text().trim() || a.attr('title') || '';
    let link = a.attr('href') || '';
    
    let image = $(el).find('img').attr('src') || '';
    if (image.startsWith('//')) image = `https:${image}`;
    
    const status = $(el).find('.epx').text().trim() || '';

    if (title && link) {
      results.push({
        title,
        thumbnailUrl: image,
        status,
        rating: '',
        animeUrl: link,
        genres: [],
      });
    }
  });
  
  return { result: results };
}

export async function detail(url: string, signal?: AbortSignal): Promise<AniDetail> {
  await fetchRemoteConfig();
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  const title = $('.entry-title, h1').first().text().trim() || '';
  
  let image = $('.thumb img').first().attr('src') || '';
  if (image.startsWith('//')) image = `https:${image}`;
  
  const synopsis = $('.entry-content[itemprop="description"]').text().trim() || '';

  const info: Record<string, string> = {};
  $('.infox .spe span').each((i, el) => {
    const text = $(el).text().trim();
    if (text.includes(':')) {
      const parts = text.split(':');
      const k = parts[0].trim().toLowerCase();
      const v = parts.slice(1).join(':').trim();
      info[k] = v;
    }
  });

  const genres: string[] = [];
  $('.genxed a').each((i, el) => {
    genres.push($(el).text().trim());
  });

  const episodes: { title: string; link: string; releaseDate: string }[] = [];
  $('.eplister ul li').each((i, el) => {
    const a = $(el).find('a').first();
    let epUrl = a.attr('href') || '';
    if (!epUrl) return;
    
    const epTitle = $(el).find('.epl-num').text().trim() || $(el).find('.epl-title').text().trim() || a.text().trim();
    const releaseDate = $(el).find('.epl-date').text().trim() || '';
    
    episodes.push({ title: epTitle, link: epUrl, releaseDate });
  });

  return {
    type: 'animeDetail',
    title,
    thumbnailUrl: image,
    alternativeTitle: info['alter'] || '',
    rating: info['score'] || '',
    status: info['status'] || '',
    epsTotal: '',
    minutesPerEp: '',
    studio: info['studio'] || '',
    genres,
    releaseYear: info['released'] || '',
    synopsis,
    episodeList: episodes,
    detailOnly: false,
    animeType: 'Donghua',
  };
}

export async function streaming(url: string, signal?: AbortSignal): Promise<AniStreaming> {
  await fetchRemoteConfig();
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  const title = $('.entry-title').first().text().trim() || '';
  const animeDetailUrl = $('.nvs a:contains("All Episodes")').attr('href') || $('.ts-breadcrumb a').eq(1).attr('href') || '';
  const thumbnailUrl = $('meta[property="og:image"]').attr('content') || '';

  const resolutionRaw: { resolution: string; dataContent: string }[] = [];
  
  $('.mirror option, .mobius select option').each((i, el) => {
    const val = $(el).attr('value');
    if (val && val.length > 20) { // Base64 encoded iframe
      try {
        const decodedHtml = Buffer.from(val, 'base64').toString('utf8');
        const iframeMatch = decodedHtml.match(/src=["']([^"']+)["']/i);
        if (iframeMatch && iframeMatch[1]) {
          const resName = $(el).text().trim() || `Server ${i}`;
          if (!resName.toLowerCase().includes('ads')) {
            resolutionRaw.push({
              resolution: resName,
              dataContent: `embed_url::${iframeMatch[1]}`,
            });
          }
        }
      } catch (e) {}
    }
  });

  // Fallback to directly embedded iframes if dropdown isn't used
  if (resolutionRaw.length === 0) {
    $('iframe').each((i, el) => {
      let src = $(el).attr('src') || '';
      if (src && !src.includes('facebook') && !src.includes('google')) {
        resolutionRaw.push({
          resolution: `Server ${i + 1}`,
          dataContent: `embed_url::${src}`,
        });
      }
    });
  }

  const defaultResObj = resolutionRaw.length > 0 ? resolutionRaw[0] : null;
  const defaultLink = defaultResObj ? defaultResObj.dataContent.replace(/^embed_url::/, '') : '';

  let previous: string | undefined = undefined;
  let next: string | undefined = undefined;
  
  $('.nvs a').each((i, el) => {
    const text = $(el).text().trim().toLowerCase();
    const href = $(el).attr('href');
    if (href) {
      if (text.includes('prev')) previous = href;
      if (text.includes('next')) next = href;
    }
  });

  return {
    type: 'animeStreaming',
    title,
    streamingLink: defaultLink,
    streamingType: 'embed', // Use embed so it loads in WebView properly and safely!
    downloadLink: '',
    thumbnailUrl,
    resolution: defaultResObj ? defaultResObj.resolution : undefined,
    resolutionRaw,
    reqNonceAction: 'anichin',
    reqResolutionWithNonceAction: 'anichin',
    episodeData: {
      animeDetail: animeDetailUrl,
      previous,
      next
    }
  };
}

