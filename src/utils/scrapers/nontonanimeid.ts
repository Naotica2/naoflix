   import { load } from 'cheerio';
import {
  AniDetail,
  AniStreaming,
  EpisodeBaruHome,
  NewAnimeList,
  SearchAnime,
} from '../../types/anime';
import deviceUserAgent from '../deviceUserAgent';

export const __ALIAS = 'nontonanimeid';
export const BASE = 'https://s13.nontonanimeid.boats';

const headers = {
  'user-agent': deviceUserAgent || 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'referer': BASE + '/'
};

async function fetchPage(url: string, signal?: AbortSignal) {
  const res = await fetch(url, { headers, signal });
  if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
    const loc = res.headers.get('location');
    return fetchPage(loc!.startsWith('http') ? loc! : BASE + loc, signal);
  }
  return await res.text();
}

async function postAjax(url: string, body: string, postUrl: string, signal?: AbortSignal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'user-agent': headers['user-agent'],
      'accept': '*/*',
      'origin': BASE,
      'referer': postUrl || BASE + '/',
      'x-requested-with': 'XMLHttpRequest',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body,
    signal
  });
  return await res.text();
}

export async function latestAnime(page = 1, signal?: AbortSignal): Promise<NewAnimeList[]> {
  try {
    const url = page === 1 ? BASE + '/' : BASE + '/page/' + page + '/';
    const html = await fetchPage(url, signal);
    const $ = load(html);
    const episodes: NewAnimeList[] = [];
    $('article.animeseries').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a').first().attr('href') || '';
      const epNum = $el.find('.episodes').text().replace(/\D/g, '').trim();
      const title = $el.find('.title span').attr('data-title-default') || $el.find('.title').text().trim();
      let img = $el.find('img').attr('src') || '';
      if (img.startsWith('//')) img = 'https:' + img;
      episodes.push({ 
        title, 
        episode: epNum, 
        streamingLink: link, 
        thumbnailUrl: img,
        releaseDate: '',
        releaseDay: ''
      });
    });
    return episodes;
  } catch (e) {
    return [];
  }
}

export async function home(signal?: AbortSignal): Promise<EpisodeBaruHome> {
  try {
    const newAnimes = await latestAnime(1, signal);

    const html = await fetchPage(BASE + '/jadwal-rilis/', signal);
    const $ = load(html);
    const schedule: Record<string, any[]> = {};
    $('.as-tab-content').each((_, el) => {
      const $el = $(el);
      const dayRaw = $el.attr('id') || ''; // e.g. "sunday", "monday"
      let day = 'Minggu';
      if (dayRaw.includes('monday')) day = 'Senin';
      else if (dayRaw.includes('tuesday')) day = 'Selasa';
      else if (dayRaw.includes('wednesday')) day = 'Rabu';
      else if (dayRaw.includes('thursday')) day = 'Kamis';
      else if (dayRaw.includes('friday')) day = 'Jumat';
      else if (dayRaw.includes('saturday')) day = 'Sabtu';
      
      const animeList: any[] = [];
      $el.find('.as-anime-card').each((_, card) => {
        const $card = $(card);
        animeList.push({ 
          title: $card.find('.as-anime-title').text().trim(), 
          link: $card.attr('href') || '' 
        });
      });
      if (animeList.length) schedule[day] = animeList;
    });

    return {
      newAnime: newAnimes,
      jadwalAnime: schedule
    };
  } catch (e) {
    return { newAnime: [], jadwalAnime: {} };
  }
}

export async function search(query: string, signal?: AbortSignal): Promise<SearchAnime> {
  try {
    const url = BASE + '/?s=' + encodeURIComponent(query);
    const html = await fetchPage(url, signal);
    const $ = load(html);
    const results: any[] = [];
    $('.as-anime-card').each((_, el) => {
      const $el = $(el);
      const link = $el.attr('href') || '';
      const title = $el.find('.as-anime-title').attr('data-title-default') || $el.find('.as-anime-title').text().trim();
      let img = $el.find('img').attr('src') || '';
      if (img.startsWith('//')) img = 'https:' + img;
      const rating = $el.find('.as-rating').text().replace(/[^\d.]/g, '').trim();
      if (title) results.push({ title, animeUrl: link, thumbnailUrl: img, rating, genres: [], status: '' });
    });
    return { result: results };
  } catch (e) {
    return { result: [] };
  }
}

export async function getAnimeByGenre(genreSlug: string, page = 1, signal?: AbortSignal): Promise<NewAnimeList[]> {
  try {
    const url = page === 1 ? BASE + '/genres/' + genreSlug + '/' : BASE + '/genres/' + genreSlug + '/page/' + page + '/';
    const html = await fetchPage(url, signal);
    const $ = load(html);
    const anime: NewAnimeList[] = [];
    $('.as-anime-card').each((_, el) => {
      const $el = $(el);
      const link = $el.attr('href') || '';
      const title = $el.find('.as-anime-title').attr('data-title-default') || $el.find('.as-anime-title').text().trim();
      let img = $el.find('img').attr('src') || '';
      if (img.startsWith('//')) img = 'https:' + img;
      if (title) anime.push({ title, streamingLink: link, thumbnailUrl: img, episode: '', releaseDate: '', releaseDay: '' });
    });
    return anime;
  } catch (e) {
    return [];
  }
}

export async function detail(animeUrl: string, signal?: AbortSignal): Promise<AniDetail> {
  const html = await fetchPage(animeUrl, signal);
  const $ = load(html);
  const titleEl = $('.entry-title span').first();
  const title = titleEl.attr('data-title-default') || $('.entry-title').text().replace(/Nonton|Sub Indo/g, '').trim();
  const score = $('.anime-card__score .value').text().trim();
  const type = $('.anime-card__score .type').text().trim();
  const synopsis = $('.synopsis-prose p').text().trim() || $('.synopsis-prose').text().trim();
  
  let img = $('.anime-card__poster img').attr('src') || $('.poster img').attr('src') || '';
  if (img.startsWith('//')) img = 'https:' + img;

  const genres: string[] = [];
  $('.anime-card__genres .genre-tag').each((_, el) => { genres.push($(el).text().trim()); });
  
  const info: any = {};
  $('.details-list li').each((_, el) => {
    const text = $(el).text().trim();
    const m = text.match(/^([\w\s]+):\s*(.+)$/);
    if (m) info[m[1].trim()] = m[2].trim();
  });
  const quickInfo = $('.anime-card__quick-info').text().trim();
  const statusMatch = quickInfo.match(/(Finished Airing|Currently Airing|Not yet aired)/i);
  const epMatch = quickInfo.match(/(\d+)\s*Episodes?/i);
  const durMatch = quickInfo.match(/([\d.]+)\s*min/i);
  
  const episodes: any[] = [];
  $('.episode-list-items .episode-item').each((_, el) => {
    const $el = $(el);
    episodes.push({ 
      title: $el.find('.ep-title').text().trim(), 
      releaseDate: $el.find('.ep-date').text().trim(), 
      link: $el.attr('data-episode-url') || $el.attr('href') || '' 
    });
  });

  return {
    type: 'animeDetail',
    title,
    genres,
    synopsis,
    detailOnly: false,
    episodeList: episodes,
    epsTotal: epMatch ? epMatch[1] : '',
    minutesPerEp: durMatch ? durMatch[1] + ' min' : '',
    thumbnailUrl: img,
    alternativeTitle: '',
    rating: score || info['Rating'] || '',
    releaseYear: info['Aired'] || '',
    status: statusMatch ? statusMatch[1] : '',
    studio: info['Studios'] || '',
    animeType: type || 'TV',
  };
}

export async function streaming(episodeUrl: string, signal?: AbortSignal): Promise<AniStreaming> {
  const html = await fetchPage(episodeUrl, signal);
  const $ = load(html);
  const titleEl = $('.entry-title span').first();
  const epTitle = (titleEl.attr('data-title-default') || titleEl.text().trim()) + ' Episode ' + ($('.entry-title').text().match(/Episode\s+(\d+)/i)?.[1] || '');
  
  let nonce = '';
  let postId = '';
  const b64Matches = html.match(/data:text\/javascript;base64,([A-Za-z0-9+/=]+)/g) || [];
  for (const match of b64Matches) {
    const encoded = match.split('base64,')[1];
    if (!encoded) continue;
    try {
      // Decode base64 string manually to avoid Buffer in RN
      const decodedStr = atob(encoded);
      const m = decodedStr.match(/"nonce"\s*:\s*"([^"]+)"/);
      if (m) nonce = m[1];
    } catch (e) {}
  }
  $('script').each((_, el) => {
    const text = $(el).html() || '';
    if (!nonce) { const m = text.match(/"nonce"\s*:\s*"([^"]+)"/); if (m) nonce = m[1]; }
  });
  
  const firstOption = $('#player-option-1');
  postId = firstOption.attr('data-post') || '';
  
  const servers: any[] = [];
  $('.kotak_player_option').each((_, el) => {
    const $el = $(el);
    servers.push({ 
      name: $el.find('span').text().trim(), 
      type: $el.attr('data-type') || '', 
      nume: $el.attr('data-nume') || '', 
      post: $el.attr('data-post') || '' 
    });
  });

  let prevLink = '';
  let nextLink = '';
  $('.nvs').each((_, el) => {
    const $el = $(el);
    const a = $el.find('a');
    const text = $el.text().toLowerCase();
    if (a.length > 0) {
      const href = a.attr('href') || '';
      if (text.includes('prev')) prevLink = href;
      if (text.includes('next')) nextLink = href;
    }
  });
  const allEpLink = $('.nvsc a').attr('href') || '';

  let defaultRes = '';
  let defaultResData = '';
  let resolvedEmbedUrl = '';
  if (servers.length > 0) {
    const nontonServer = servers.find(s => s.name.toLowerCase().includes('nonton')) || servers[0];
    defaultRes = nontonServer.name;
    defaultResData = 'nontonanimeid::' + JSON.stringify({ post: nontonServer.post || postId, nume: nontonServer.nume, type: nontonServer.type, nonce });

    // Auto-resolve embed URL so video plays immediately instead of opening website
    try {
      const resolved = await getResolution(episodeUrl, '', JSON.stringify({ post: nontonServer.post || postId, nume: nontonServer.nume, type: nontonServer.type, nonce }), signal);
      if (resolved.embedUrl) {
        resolvedEmbedUrl = resolved.embedUrl;
      }
    } catch (e) {
      // If resolve fails, leave empty — user can still manually pick a server
      console.error('NontonAnimeID auto-resolve failed', e);
    }
  }
  const thumbnail = $('meta[property="og:image"]').attr('content') || '';

  return {
    type: 'animeStreaming',
    title: epTitle,
    streamingLink: resolvedEmbedUrl || episodeUrl,
    streamingType: 'embed',
    downloadLink: '',
    resolution: defaultRes || undefined,
    resolutionRaw: servers.map(s => ({
      resolution: s.name,
      dataContent: 'nontonanimeid::' + JSON.stringify({ post: s.post || postId, nume: s.nume, type: s.type, nonce })
    })),
    thumbnailUrl: thumbnail,
    episodeData: {
      previous: prevLink,
      next: nextLink,
      animeDetail: allEpLink
    },
    reqNonceAction: 'nontonanimeid',
    reqResolutionWithNonceAction: defaultResData || ''
  };
}

export async function getResolution(url: string, type: string, reqOpt?: string, signal?: AbortSignal) {
  try {
    const data = JSON.parse(reqOpt || '{}');
    const ajaxUrl = BASE + '/wp-admin/admin-ajax.php';
    const body = `action=player_ajax&post=${encodeURIComponent(data.post)}&nume=${encodeURIComponent(data.nume)}&serverName=${encodeURIComponent(data.type)}&nonce=${encodeURIComponent(data.nonce)}`;
    const html = await postAjax(ajaxUrl, body, url, signal);
    const $ = load(html);
    let src = $('iframe').attr('data-src') || $('iframe').attr('src') || '';
    if (src.startsWith('//')) src = 'https:' + src;
    return { server: data.type, embedUrl: src };
  } catch (e) {
    return { server: '', embedUrl: '' };
  }
}
