import { fetch } from '@tauri-apps/plugin-http';
import type { AnimeEpisode, AnimeSource } from './animeTypes';

const API_BASE = 'https://api.fruatre.my.id';
const DOMAIN = 'api.fruatre.my.id';

async function apiCall(endpoint: string, body: any): Promise<any> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.status) throw new Error(json.error || 'API error');
  return json.result;
}

export const animelovers: AnimeSource = {
  id: 'animelovers',
  name: 'Animelovers',

  async home(): Promise<AnimeEpisode[]> {
    try {
      const result = await apiCall('/api/anime/animelovers-latest', { page: 1 });
      if (!Array.isArray(result)) return [];
      return result.map((item: any) => ({
        title: item.judul,
        thumbnailUrl: item.cover,
        episode: item.lastch || 'Unknown',
        streamingLink: `https://${DOMAIN}/anime/${item.url}/`,
        releaseDate: '',
        releaseDay: item.type || 'Terbaru',
      }));
    } catch (e) {
      console.error('[Animelovers] home FAILED:', e);
      throw e;
    }
  },

  async search(query: string): Promise<AnimeEpisode[]> {
    try {
      const result = await apiCall('/api/anime/animelovers-search', { query, type: 'title', page: 1 });
      if (!result?.data?.[0]?.result) return [];
      return result.data[0].result.map((item: any) => ({
        title: item.judul,
        thumbnailUrl: item.cover,
        episode: item.lastch || 'Search Result',
        streamingLink: `https://${DOMAIN}/anime/${item.url}/`,
        releaseDate: '',
      }));
    } catch (e) {
      console.error('[Animelovers] search FAILED:', e);
      throw e;
    }
  },
};
