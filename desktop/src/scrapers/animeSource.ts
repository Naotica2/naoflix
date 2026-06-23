import type { AnimeSource, AnimeSourceId } from './animeTypes';
import { otakudesu } from './otakudesu';
import { animelovers } from './animelovers';

const STORAGE_KEY = 'naoflix_anime_source';
const sources: Record<AnimeSourceId, AnimeSource> = { otakudesu, animelovers };

export function getActiveAnimeSource(): AnimeSource {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as AnimeSourceId | null;
    if (saved && sources[saved]) return sources[saved];
  } catch {}
  return sources.otakudesu; // default
}

export function setActiveAnimeSource(id: AnimeSourceId) {
  localStorage.setItem(STORAGE_KEY, id);
}

export function getAnimeSourceId(): AnimeSourceId {
  try {
    return (localStorage.getItem(STORAGE_KEY) as AnimeSourceId) || 'otakudesu';
  } catch {
    return 'otakudesu';
  }
}

export function getAllAnimeSources(): { id: AnimeSourceId; name: string }[] {
  return Object.values(sources).map(s => ({ id: s.id, name: s.name }));
}
