import {
  AniDetail,
  AniDetailEpsList,
  AniStreaming,
  EpisodeBaruHome,
  NewAnimeList,
  SearchAnime,
  listAnimeTypeList,
} from '../../types/anime';
import { setWebViewOpen } from '../CFBypass';

export const __ALIAS = 'animelovers';
export let DOMAIN = 'api.fruatre.my.id';
const BASE = () => `https://${DOMAIN}`;

export async function fetchLatestAnimeloversDomain(signal?: AbortSignal) {
  // Not needed for now
}

async function apiCall(endpoint: string, body: any, signal?: AbortSignal) {
  const url = `${BASE()}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    if (response.status === 403 || response.status === 503) {
      setWebViewOpen.openWebViewCF(true, url);
      throw new Error('Silahkan selesaikan captcha');
    }
    if (response.status === 404) {
      throw new Error('Data tidak ditemukan (404)');
    }
    throw new Error(`HTTP ${response.status} on ${url}`);
  }

  const json = await response.json();
  if (!json.status) {
    throw new Error(json.error || 'Unknown API Error');
  }
  return json.result;
}

export async function home(signal?: AbortSignal): Promise<EpisodeBaruHome> {
  const [latestRes, scheduleRes] = await Promise.all([
    apiCall('/api/anime/animelovers-latest', { page: 1 }, signal).catch(() => []),
    apiCall('/api/anime/animelovers-schedule', {}, signal).catch(() => []),
  ]);

  const newAnime: NewAnimeList[] = latestRes.map((item: any) => ({
    title: item.judul,
    thumbnailUrl: item.cover,
    episode: item.lastch || 'Unknown',
    streamingLink: `https://${DOMAIN}/anime/${item.url}/`,
    releaseDate: '',
    releaseDay: item.type || 'Terbaru',
  }));

  const jadwalAnime: { [hari: string]: any[] } = {};
  scheduleRes.forEach((dayData: any) => {
    const hari = dayData.day;
    if (!jadwalAnime[hari]) jadwalAnime[hari] = [];
    dayData.animeList.forEach((anime: any) => {
      jadwalAnime[hari].push({
        title: anime.anime_name,
        link: `https://${DOMAIN}/anime/${anime.link}/`,
        releaseDate: anime.updated ? new Date(anime.updated * 1000).toLocaleDateString('id-ID') : '',
      });
    });
  });

  return { newAnime, jadwalAnime };
}

export async function latestAnime(page: number = 1, signal?: AbortSignal): Promise<NewAnimeList[]> {
  const result = await apiCall('/api/anime/animelovers-latest', { page }, signal);
  return result.map((item: any) => ({
    title: item.judul,
    thumbnailUrl: item.cover,
    episode: item.lastch || 'Unknown',
    streamingLink: `https://${DOMAIN}/anime/${item.url}/`,
    releaseDate: '',
    releaseDay: item.type || 'Terbaru',
  }));
}

export async function getAnimeByGenre(genre: string, page: number = 1, signal?: AbortSignal): Promise<NewAnimeList[]> {
  // Animelovers API does not support genre filtering natively.
  // The search endpoint with type: 'genre' is broken and searches the keyword in the synopsis/title.
  throw new Error('Animelovers tidak mendukung filter genre.');
}

export async function search(query: string, signal?: AbortSignal): Promise<SearchAnime> {
  const result = await apiCall('/api/anime/animelovers-search', { query, page: 1 }, signal);
  if (!result.data || result.data.length === 0) return { result: [] };

  return {
    result: result.data[0].result.map((item: any) => ({
      title: item.judul,
      thumbnailUrl: item.cover,
      animeUrl: `https://${DOMAIN}/anime/${item.url}/`,
      status: item.status || 'Unknown',
      genres: [],
      rating: item.rating || '?',
    })),
  };
}

export async function searchMovies(page: number = 1, signal?: AbortSignal): Promise<SearchAnime> {
  // Animelovers API doesn't seem to have a movies endpoint out of the box that we found,
  // we can mock it by searching for "movie"
  const result = await apiCall('/api/anime/animelovers-search', { query: 'movie', type: 'genre', page }, signal);
  if (!result.data || result.data.length === 0) return { result: [] };

  return {
    result: result.data[0].result.map((item: any) => ({
      title: item.judul,
      thumbnailUrl: item.cover,
      animeUrl: `https://${DOMAIN}/anime/${item.url}/`,
      status: 'Movie',
      genres: [],
      rating: '?',
    })),
  };
}

export async function detail(url: string, signal?: AbortSignal): Promise<AniDetail> {
  // url format expected: https://api.fruatre.my.id/anime/{slug}/
  const urlObj = new URL(url);
  const parts = urlObj.pathname.split('/').filter(Boolean);
  // anime / slug 
  const slug = parts[1];
  if (!slug) throw new Error('Invalid URL');

  let result: any;
  try {
    result = await apiCall('/api/anime/animelovers-detail', { slug }, signal);
  } catch (e: any) {
    // If slug from old source doesn't match animelovers, try searching it
    if (e.message.includes('404')) {
      const searchRes = await search(slug, signal);
      if (searchRes.result.length > 0) {
        // use the first search result's slug
        const newSlug = new URL(searchRes.result[0].animeUrl).pathname.split('/').filter(Boolean)[1];
        if (newSlug) {
          result = await apiCall('/api/anime/animelovers-detail', { slug: newSlug }, signal);
        } else {
          throw new Error('Anime detail tidak ditemukan');
        }
      } else {
        throw new Error('Anime detail tidak ditemukan');
      }
    } else {
      throw e;
    }
  }

  const episodeList: AniDetailEpsList[] = (result.chapter || []).map((ep: any) => ({
    title: `Episode ${ep.ch}`,
    link: `https://${DOMAIN}/anime/${slug}/episode/${ep.url}`, // ep.url is actually the postId
    releaseDate: ep.date,
  }));
  episodeList.reverse(); // Reverse if needed to match oldest to newest or newest to oldest.

  return {
    type: 'animeDetail',
    title: result.judul,
    genres: result.genre || [],
    synopsis: result.sinopsis || '',
    detailOnly: false,
    episodeList,
    epsTotal: (result.chapter || []).length.toString(),
    minutesPerEp: '?',
    thumbnailUrl: result.cover,
    alternativeTitle: result.judul,
    rating: result.rating || '?',
    releaseYear: result.published || '?',
    status: result.status || 'Unknown',
    studio: result.author || 'Unknown',
    animeType: result.type || 'TV',
  };
}

export async function streaming(url: string, signal?: AbortSignal): Promise<AniStreaming> {
  // url format expected: https://api.fruatre.my.id/anime/{slug}/episode/{postId}
  const urlObj = new URL(url);
  const parts = urlObj.pathname.split('/').filter(Boolean);
  const slug = parts[1];
  const postId = parts[3];

  if (!slug || !postId) throw new Error('Invalid URL');

  // get detail first to find the episodes list and current ep
  const detailRes = await apiCall('/api/anime/animelovers-detail', { slug }, signal);
  
  const epsList = detailRes.chapter || [];
  let chName = '';
  const resolutionRaw: { resolution: string; dataContent: string }[] = [];

  const streamRes = await apiCall('/api/anime/animelovers-stream', { slug, postId }, signal);
  
  // Format streamRes
  for (const reso in streamRes) {
    if (streamRes[reso] && streamRes[reso].length > 0) {
      streamRes[reso].forEach((server: any, idx: number) => {
        resolutionRaw.push({
          resolution: `${reso} - Server ${idx + 1}`,
          dataContent: `direct_url::${server.link}`,
        });
      });
    }
  }

  const episodeList: AniDetailEpsList[] = epsList.map((ep: any) => ({
    title: `Episode ${ep.ch}`,
    link: `https://${DOMAIN}/anime/${slug}/episode/${ep.url}`,
    releaseDate: ep.date,
  }));
  episodeList.reverse();

  // find index
  let prevEp = '';
  let nextEp = '';
  const currentIdx = episodeList.findIndex(e => e.link.endsWith(postId));
  if (currentIdx !== -1) {
    chName = episodeList[currentIdx].title;
    if (currentIdx > 0) prevEp = episodeList[currentIdx - 1].link;
    if (currentIdx < episodeList.length - 1) nextEp = episodeList[currentIdx + 1].link;
  }

  const firstLink = resolutionRaw.length > 0 ? resolutionRaw[0].dataContent.replace('direct_url::', '') : '';

  return {
    type: 'animeStreaming',
    title: chName || `Episode`,
    streamingLink: firstLink,
    streamingType: 'raw',
    downloadLink: firstLink,
    isHls: false,
    resolution: resolutionRaw.length > 0 ? resolutionRaw[0].resolution : undefined,
    resolutionRaw,
    thumbnailUrl: detailRes.cover || '',
    episodeData: {
      previous: prevEp || undefined,
      animeDetail: `https://${DOMAIN}/anime/${slug}/`,
      next: nextEp || undefined,
    },
    reqNonceAction: 'animelovers',
    reqResolutionWithNonceAction: 'animelovers',
  };
}

export async function getResolution(requestData: string, signal?: AbortSignal): Promise<string | undefined> {
  // requestData is just the raw link for Animelovers since we extract MP4 direct links!
  if (requestData.startsWith('animelovers::')) {
    return requestData.replace('animelovers::', '');
  }
  return requestData;
}

export async function jadwalAnime(signal?: AbortSignal): Promise<{ [hari: string]: any[] }> {
  const scheduleRes = await apiCall('/api/anime/animelovers-schedule', {}, signal).catch(() => []);
  const jadwalAnime: { [hari: string]: any[] } = {};
  scheduleRes.forEach((dayData: any) => {
    const hari = dayData.day;
    if (!jadwalAnime[hari]) jadwalAnime[hari] = [];
    dayData.animeList.forEach((anime: any) => {
      jadwalAnime[hari].push({
        title: anime.anime_name,
        link: `https://${DOMAIN}/anime/${anime.link}/`,
        releaseDate: anime.updated ? new Date(anime.updated * 1000).toLocaleDateString('id-ID') : '',
      });
    });
  });
  return jadwalAnime;
}

export async function animeList(signal?: AbortSignal): Promise<listAnimeTypeList[]> {
  return [];
}
