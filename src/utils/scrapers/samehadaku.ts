import cheerio from 'cheerio';
import {
  AniDetail,
  AniStreaming,
  EpisodeBaruHome,
  NewAnimeList,
  SearchAnime,
} from '../../types/anime';
import deviceUserAgent from '../deviceUserAgent';
import { setWebViewOpen } from '../CFBypass';

export const __ALIAS = 'samehadaku';
export const DOMAIN = 'v2.samehadaku.how';
const BASE = () => `https://${DOMAIN}`;

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

export async function home(signal?: AbortSignal): Promise<EpisodeBaruHome> {
  const [newAnime, jadwalAnime] = await Promise.all([
    latestAnime(1, signal).catch(() => []),
    scheduleAnime(signal).catch(() => ({})),
  ]);
  return { newAnime, jadwalAnime };
}

export async function latestAnime(page: number = 1, signal?: AbortSignal): Promise<NewAnimeList[]> {
  const url = page === 1 ? BASE() : `${BASE()}/page/${page}/`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);
  
  const results: NewAnimeList[] = [];
  $('h2.entry-title').each((i, el) => {
    const a = $(el).find('a').first();
    const title = $(el).text().trim();
    let link = a.attr('href') || '';
    if (!link.startsWith('http')) link = `${BASE()}${link}`;
    
    const li = $(el).closest('li');
    let image = li.find('.thumb img').attr('src') || li.find('img').first().attr('src') || '';
    if (image.startsWith('//')) image = `https:${image}`;
    
    const episode = li.find('.dtla span').first().text().trim() || '';
    const releasedOn = li.find('.dtla span').last().text().trim() || '';
    
    if (title && link) {
      results.push({
        title,
        episode,
        thumbnailUrl: image,
        streamingLink: link,
        releaseDate: releasedOn,
        releaseDay: '',
      });
    }
  });
  
  return results;
}

export async function scheduleAnime(signal?: AbortSignal): Promise<Record<string, any[]>> {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayNames: Record<string, string> = { 
    monday: 'Senin', tuesday: 'Selasa', wednesday: 'Rabu', 
    thursday: 'Kamis', friday: 'Jumat', saturday: 'Sabtu', sunday: 'Minggu' 
  };
  
  const result: Record<string, any[]> = {};

  const fetchPromises = days.map(async (day) => {
    try {
      const url = `${BASE()}/wp-json/custom/v1/all-schedule?perpage=20&day=${day}`;
      const html = await fetchPage(url, signal);
      const $ = cheerio.load(html);
      const jsonStr = $('pre').text() || html;
      const data = JSON.parse(jsonStr);
      
      const dayName = dayNames[day];
      result[dayName] = data.map((item: any) => ({
        id: item.url,
        title: item.title,
        link: item.url,
        time: item.east_time || '',
        thumbnailUrl: item.featured_img_src || '',
        score: item.east_score || '',
        type: item.east_type || '',
        genres: item.genre || ''
      }));
    } catch {
      result[dayNames[day]] = [];
    }
  });

  await Promise.all(fetchPromises);
  return result;
}

export async function search(query: string, signal?: AbortSignal): Promise<SearchAnime> {
  const url = `${BASE()}/?s=${encodeURIComponent(query)}`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);
  
  const results: any[] = [];
  $('.animepost').each((i, el) => {
    const a = $(el).find('a').first();
    const title = $(el).find('.title h2, h2, .title').first().text().trim() || a.attr('title') || '';
    let link = a.attr('href') || '';
    if (!link.startsWith('http')) link = `${BASE()}${link}`;
    
    let image = $(el).find('img').attr('src') || '';
    if (image.startsWith('//')) image = `https:${image}`;
    
    const genres: string[] = [];
    $(el).find('.genres a, a[rel="tag"]').each((j, g) => {
      genres.push($(g).text().trim());
    });
    
    const rating = $(el).find('.score').text().trim() || '';
    const status = $(el).find('.type').text().trim() || '';

    if (title && link) {
      results.push({
        title,
        thumbnailUrl: image,
        status,
        rating,
        animeUrl: link,
        genres,
      });
    }
  });
  
  return { result: results };
}

export async function searchMovies(page: number = 1, signal?: AbortSignal): Promise<SearchAnime> {
  const url = page === 1 ? `${BASE()}/anime-movie/` : `${BASE()}/anime-movie/page/${page}/`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);
  
  const results: any[] = [];
  $('.animepost').each((i, el) => {
    const a = $(el).find('a').first();
    const title = $(el).find('.title h2, h2, .title').first().text().trim() || a.attr('title') || '';
    let link = a.attr('href') || '';
    if (!link.startsWith('http')) link = `${BASE()}${link}`;
    
    let image = $(el).find('img').attr('src') || '';
    if (image.startsWith('//')) image = `https:${image}`;
    
    const genres: string[] = [];
    $(el).find('.genres a, a[rel="tag"]').each((j, g) => {
      genres.push($(g).text().trim());
    });
    
    const rating = $(el).find('.score').text().trim() || '';

    if (title && link) {
      results.push({
        title,
        thumbnailUrl: image,
        status: 'Movie',
        rating,
        animeUrl: link,
        genres,
      });
    }
  });
  
  return { result: results };
}

export async function detail(url: string, signal?: AbortSignal): Promise<AniDetail> {
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  let title = $('h1.titless, .animetitle-episode, h1').first().text().trim() || '';
  title = title.replace(/^(Tonton|Watch|Streaming|List Episode)\s+/i, '').trim();

  let image = $('.thumb img.anmsa, .infoanime .thumb img').first().attr('src') || '';
  if (!image) {
    image = $('.infoanime img[itemprop="image"], .widget_senction img[itemprop="image"]').first().attr('src') || '';
  }
  if (image.startsWith('//')) image = `https:${image}`;
  
  const synopsis = $('.series-synopsis, .desc, .sinopsis, .entry-content').first().text().trim() || '';

  const info: Record<string, string> = {};
  $('.infox .spe span, .spe span, .seriestuinfo span').each((i, el) => {
    const text = $(el).text().trim();
    if (text.includes(':')) {
      const parts = text.split(':');
      const k = parts[0].trim().toLowerCase();
      const v = parts.slice(1).join(':').trim();
      info[k] = v;
    }
  });

  const genres: string[] = [];
  $('a[href*="genre"], .seriestugenre a').each((i, el) => {
    genres.push($(el).text().trim());
  });

  const episodes: { title: string; link: string; releaseDate: string }[] = [];
  const seenUrls = new Set();
  $('.epsleft, .eplister ul li, .episodelist ul li, .lstep').each((i, el) => {
    const a = $(el).find('a').first();
    let epUrl = a.attr('href') || '';
    if (!epUrl) return;
    if (!epUrl.startsWith('http')) epUrl = `${BASE()}${epUrl}`;
    
    if (seenUrls.has(epUrl)) return;
    seenUrls.add(epUrl);
    
    const epTitle = $(el).find('.lchx a, .epl-title, .epl-num').text().trim() || a.text().trim();
    const releaseDate = $(el).find('.date, .epl-date').text().trim() || '';
    
    episodes.push({ title: epTitle, link: epUrl, releaseDate });
  });

  // Reverse so episode 1 is at index 0 (page lists newest first)
  episodes.reverse();

  return {
    type: 'animeDetail',
    title,
    thumbnailUrl: image,
    alternativeTitle: info['japanese'] || info['synonyms'] || '',
    rating: info['score'] || '',
    status: info['status'] || '',
    epsTotal: info['total episode'] || info['episodes'] || '',
    minutesPerEp: info['duration'] || '',
    studio: info['studio'] || info['studios'] || '',
    genres,
    releaseYear: info['released'] || info['season'] || '',
    synopsis,
    episodeList: episodes,
    detailOnly: false,
    animeType: info['type'] || 'Anime',
  };
}

async function getIframeFromAjax(post: string, nume: string, type: string, refererUrl: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const params = new URLSearchParams();
    params.set('action', 'player_ajax');
    params.set('post', post);
    params.set('nume', nume);
    params.set('type', type);

    const res = await fetch(`${BASE()}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': deviceUserAgent,
        Referer: refererUrl || BASE(),
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: params.toString(),
      signal,
    });
    
    const html = await res.text();
    // WordPress returns '0' for failed AJAX calls
    if (html === '0' || html.trim() === '0') return null;
    const $ = cheerio.load(html);
    let iframeSrc = $('iframe').attr('src');
    if (iframeSrc?.startsWith('//')) iframeSrc = `https:${iframeSrc}`;
    return iframeSrc || null;
  } catch {
    return null;
  }
}

export async function streaming(url: string, signal?: AbortSignal): Promise<AniStreaming> {
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim() || '';
  const animeDetailUrl = $('a').filter(function() { return $(this).text().trim() === 'All Episode'; }).attr('href') || '';
  const thumbnailUrl = $('meta[property="og:image"]').attr('content') || '';

  const resolutionRaw: { resolution: string; dataContent: string }[] = [];
  
  // 1. Find directly embedded iframes (skip social/ad iframes)
  $('iframe[src*="embed"], iframe[src*="player"]').each((i, el) => {
    let src = $(el).attr('src') || '';
    if (src && !src.includes('facebook.com') && !src.includes('google.com')) {
      if (src.startsWith('//')) src = `https:${src}`;
      resolutionRaw.push({
        resolution: `Server ${i + 1}`,
        dataContent: `embed_url::${src}`,
      });
    }
  });

  // 2. Resolve AJAX players (.east_player_option)
  const ajaxPlayers: { name: string; post: string; nume: string; type: string }[] = [];
  $('.east_player_option').each((i, el) => {
    const $el = $(el);
    const post = $el.attr('data-post');
    const nume = $el.attr('data-nume');
    const type = $el.attr('data-type');
    if (post && nume && type) {
      ajaxPlayers.push({
        name: $el.find('span').text().trim() || $el.text().trim() || `Player ${i + 1}`,
        post, nume, type
      });
    }
  });

  if (ajaxPlayers.length > 0) {
    const resolvedIframes = await Promise.allSettled(
      ajaxPlayers.map(p => getIframeFromAjax(p.post, p.nume, p.type, url, signal))
    );
    
    ajaxPlayers.forEach((p, i) => {
      const res = resolvedIframes[i];
      if (res.status === 'fulfilled' && res.value) {
        resolutionRaw.push({
          resolution: p.name,
          dataContent: `samehadaku::${res.value}`, // Prefix so AnimeAPI knows it's a direct iframe
        });
      }
    });
  }

  const finalResolutionRaw: { resolution: string; dataContent: string }[] = [];
  resolutionRaw.forEach(item => {
    finalResolutionRaw.push(item);
  });

  const defaultResObj = finalResolutionRaw.length > 0 ? finalResolutionRaw[0] : null;
  const defaultLink = defaultResObj ? defaultResObj.dataContent.replace(/^(embed_url|samehadaku)::/, '') : '';

  let previous: string | undefined = undefined;
  let next: string | undefined = undefined;
  
  const navLinks = $('.naveps .nvs a');
  navLinks.each((i, el) => {
    const text = $(el).text().trim().toLowerCase();
    const href = $(el).attr('href');
    if (href) {
      if (text.includes('prev')) previous = href.startsWith('http') ? href : `${BASE()}${href}`;
      if (text.includes('next')) next = href.startsWith('http') ? href : `${BASE()}${href}`;
    }
  });

  return {
    type: 'animeStreaming',
    title,
    streamingLink: defaultLink,
    streamingType: 'embed',
    downloadLink: '',
    thumbnailUrl,
    resolution: defaultResObj ? defaultResObj.resolution : undefined,
    resolutionRaw: finalResolutionRaw,
    reqNonceAction: 'samehadaku-api',
    reqResolutionWithNonceAction: 'samehadaku-api',
    episodeData: {
      animeDetail: animeDetailUrl.startsWith('http') ? animeDetailUrl : (animeDetailUrl ? `${BASE()}${animeDetailUrl}` : ''),
      previous,
      next
    }
  };
}
