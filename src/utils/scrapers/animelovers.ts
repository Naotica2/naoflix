import { AniDetail, AniStreaming, EpisodeBaruHome, NewAnimeList, SearchAnime } from '../../types/anime';
import deviceUserAgent from '../deviceUserAgent';
import { setWebViewOpen } from '../CFBypass';

const API_BASE = 'https://api.fruatre.my.id/api/anime';

async function apiPost(endpoint: string, body: any, signal?: AbortSignal) {
  const url = `${API_BASE}/${endpoint}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': deviceUserAgent,
      },
      body: JSON.stringify(body),
      signal,
    });
    let data;
    try {
      data = await res.json();
    } catch (e) {
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      throw new Error('Gagal membaca data dari server.');
    }
    
    if (data.status === false) {
      if (data.error && data.error.includes('captcha')) {
        setWebViewOpen.openWebViewCF(true, url);
        throw new Error('Silahkan selesaikan captcha');
      }
      throw new Error(data.error || 'Unknown API error');
    }
    return data.result;
  } catch (error: any) {
    if (error.message.includes('Aborted') || error.name === 'AbortError') {
      throw new Error('canceled');
    }
    throw error;
  }
}

export async function latestAnime(page: number = 1, signal?: AbortSignal): Promise<NewAnimeList[]> {
  const result = await apiPost('animelovers-latest', { page }, signal);
  if (!Array.isArray(result)) return [];
  return result.map((item: any) => ({
    title: item.judul,
    episode: item.lastch || '',
    thumbnailUrl: item.cover,
    streamingLink: `al-detail-${item.url}`,
    releaseDate: item.lastup || '',
    releaseDay: '',
  }));
}

export async function scheduleAnime(signal?: AbortSignal): Promise<Record<string, any[]>> {
  const result = await apiPost('animelovers-schedule', {}, signal);
  if (!Array.isArray(result)) return {};
  
  const schedule: Record<string, any[]> = {};
  for (const dayObj of result) {
    if (dayObj.day && Array.isArray(dayObj.animeList)) {
      schedule[dayObj.day] = dayObj.animeList.map((item: any) => ({
        id: item.link,
        title: item.anime_name,
        thumbnailUrl: item.cover,
        link: `al-detail-${item.link}`,
      }));
    }
  }
  return schedule;
}

export async function home(signal?: AbortSignal): Promise<EpisodeBaruHome> {
  const [newAnime, jadwalAnime] = await Promise.all([
    latestAnime(1, signal).catch(() => []),
    scheduleAnime(signal).catch(() => ({}))
  ]);
  return { newAnime, jadwalAnime };
}

async function getRomajiTitle(query: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: `query ($search: String) { Media(search: $search, type: ANIME) { title { romaji } } }`,
        variables: { search: query }
      }),
      signal,
    });
    const data = await res.json();
    return data?.data?.Media?.title?.romaji || null;
  } catch {
    return null;
  }
}

export async function search(query: string, signal?: AbortSignal): Promise<SearchAnime> {
  let result = await apiPost('animelovers-search', { query }, signal).catch(() => null);
  
  let searchData = result && result.data && Array.isArray(result.data) && result.data.length > 0 ? result.data[0].result : null;

  if (!searchData || !Array.isArray(searchData) || searchData.length === 0) {
    const romajiTitle = await getRomajiTitle(query, signal);
    if (romajiTitle && romajiTitle.toLowerCase() !== query.toLowerCase()) {
      const romajiResult = await apiPost('animelovers-search', { query: romajiTitle }, signal).catch(() => null);
      if (romajiResult && romajiResult.data && Array.isArray(romajiResult.data) && romajiResult.data.length > 0) {
        searchData = romajiResult.data[0].result;
      } else {
        const partialRomaji = romajiTitle.split(' ').slice(0, 2).join(' ');
        const partialResult = await apiPost('animelovers-search', { query: partialRomaji }, signal).catch(() => null);
        if (partialResult && partialResult.data && Array.isArray(partialResult.data) && partialResult.data.length > 0) {
          searchData = partialResult.data[0].result;
        }
      }
    }
  }

  if (!searchData || !Array.isArray(searchData) || searchData.length === 0) {
    return { result: [] };
  }
  
  return {
    result: searchData.map((item: any) => ({
      title: item.judul,
      thumbnailUrl: item.cover,
      status: item.status || '',
      rating: item.score ? item.score.toString() : '',
      animeUrl: `al-detail-${item.url}`,
      genres: item.genre || [],
    })),
  };
}

export async function detail(slug: string, signal?: AbortSignal): Promise<AniDetail> {
  const actualSlug = slug.replace('al-detail-', '');
  const result = await apiPost('animelovers-detail', { slug: actualSlug }, signal);
  
  const episodes = result.chapter && Array.isArray(result.chapter) ? result.chapter.map((ch: any) => ({
    title: `Episode ${ch.ch}`,
    link: `al-stream::${ch.url}::${actualSlug}`,
    releaseDate: ch.date || '',
  })) : [];
  episodes.reverse();

  return {
    type: 'animeDetail',
    title: result.judul,
    thumbnailUrl: result.cover || '',
    alternativeTitle: '',
    rating: result.rating || '',
    status: result.status || '',
    epsTotal: '',
    minutesPerEp: '',
    studio: result.author || '',
    genres: result.genre || [],
    releaseYear: result.published || '',
    synopsis: result.sinopsis || '',
    episodeList: episodes,
    detailOnly: false,
    animeType: result.type || 'Anime',
  };
}

export async function streaming(streamId: string, signal?: AbortSignal): Promise<AniStreaming> {
  const parts = streamId.replace('al-stream::', '').split('::');
  const postId = parts[0];
  const slug = parts[1];

  const result = await apiPost('animelovers-stream', { postId, slug }, signal);
  
  const resolutions = Object.keys(result);
  if (resolutions.length === 0) throw new Error('No streaming data found');

  const resolutionRaw = [];
  for (const reso of resolutions) {
    const arr = result[reso];
    if (Array.isArray(arr) && arr.length > 0) {
      const url = arr[0].link;
      const type = 'direct_url';
      resolutionRaw.push({
        resolution: reso,
        dataContent: `${type}::${url}`,
      });
    }
  }

  const defaultResObj = resolutionRaw.length > 0 ? resolutionRaw[0] : null;
  const defaultLink = defaultResObj ? defaultResObj.dataContent.replace(/^(direct_url|embed_url)::/, '') : '';

  let previous: string | undefined = undefined;
  let next: string | undefined = undefined;
  
  try {
    const detailData = await detail(slug);
    const epsList = detailData.episodeList;
    const currentIndex = epsList.findIndex((ep: any) => ep.link === streamId);
    if (currentIndex !== -1) {
      if (currentIndex > 0) previous = epsList[currentIndex - 1].link;
      if (currentIndex < epsList.length - 1) next = epsList[currentIndex + 1].link;
    }
  } catch(e) {}

  return {
    type: 'animeStreaming',
    title: `Episode`,
    streamingLink: defaultLink,
    streamingType: 'raw',
    downloadLink: '',
    thumbnailUrl: '',
    resolution: defaultResObj ? defaultResObj.resolution : undefined,
    resolutionRaw,
    reqNonceAction: '',
    reqResolutionWithNonceAction: '',
    episodeData: {
      animeDetail: `al-detail-${slug}`,
      previous,
      next
    }
  };
}
