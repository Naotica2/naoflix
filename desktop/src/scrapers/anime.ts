import { fetch } from '@tauri-apps/plugin-http';

const API_BASE = 'https://api.fruatre.my.id';

export type AnimeLatest = {
  title: string;
  episode: string;
  released: string;
  img: string;
  url: string;
};

export type AnimeSearch = {
  title: string;
  url: string;
  img: string;
  score: string;
  type: string;
  status: string;
  synopsis: string;
  genres: string[];
};

async function api<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.status ? json.result : null;
  } catch {
    return null;
  }
}

export async function getLatestAnime(): Promise<AnimeLatest[]> {
  const data = await api<AnimeLatest[]>('/api/anime/samehadaku-latest');
  return data || [];
}

export async function searchAnime(query: string): Promise<AnimeSearch[]> {
  const data = await api<AnimeSearch[]>(`/api/anime/samehadaku-search?q=${encodeURIComponent(query)}`);
  return data || [];
}
