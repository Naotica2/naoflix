export const __ALIAS = 'vidbox';

const BASE = 'https://api.fruatre.my.id';

export type VidboxServer = {
  name: string;
  flag: string;
  url: string;
};

export type VidboxResult = {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  year: number | null;
  description: string;
  rating: number;
  votes: number;
  popularity: number;
  imdb: string;
  poster: string;
  backdrop: string;
  url: string;
  embed: string;
  servers: VidboxServer[];
};

async function apiCall(
  endpoint: string,
  body: Record<string, any>,
  signal?: AbortSignal,
): Promise<any> {
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json();
  if (!json.status) {
    throw new Error(json.error || 'Unknown API Error');
  }
  return json.result;
}

/**
 * Search for films/TV series via vidbox API.
 * @param query  Search query (required)
 * @param limit  Max results (default 15)
 * @param season TV season number (default 1)
 * @param episode TV episode number (default 1)
 */
export async function searchFilm(
  query: string,
  limit: number = 15,
  season: number = 1,
  episode: number = 1,
  signal?: AbortSignal,
): Promise<VidboxResult[]> {
  const result = await apiCall(
    '/api/film/vidbox',
    { query, limit, season, episode },
    signal,
  );
  const items: any[] = result?.results || [];
  return items.map((item: any) => ({
    id: item.id,
    type: item.type === 'tv' ? 'tv' : 'movie',
    title: item.title || 'Unknown',
    year: item.year || null,
    description: item.description || '',
    rating: item.rating || 0,
    votes: item.votes || 0,
    popularity: item.popularity || 0,
    imdb: item.imdb || '',
    poster: item.poster || '',
    backdrop: item.backdrop || '',
    url: item.url || '',
    embed: item.embed || '',
    servers: (item.servers || []).map((s: any) => ({
      name: s.name || '?',
      flag: s.flag || '',
      url: s.url || '',
    })),
  }));
}
