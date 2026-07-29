import { ToastAndroid } from 'react-native';
import {
  KomikuDetail,
  KomikuReading,
  KomikuSearch,
  LatestKomikuRelease,
} from './komiku';

export const __ALIAS = 'bacakomik';
export const DOMAIN = 'api.fruatre.my.id';
const BASE_URL = `https://${DOMAIN}`;

async function apiCall(endpoint: string, body: any, signal?: AbortSignal) {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    if (response.status === 404) throw new Error('Data tidak ditemukan (404)');
    throw new Error(`HTTP ${response.status} on ${url}`);
  }

  const json = await response.json();
  if (!json.status) {
    throw new Error(json.error || 'Unknown API Error');
  }
  return json.result;
}

export async function getLatestBacakomikReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestKomikuRelease[]> {
  if (page > 1) return []; // The API does not support pagination for latest
  const result = await apiCall('/api/manga/bacakomik-latest', { page }, signal);
  if (!result || !result.data) return [];
  
  return result.data.map((item: any) => ({
    title: item.title,
    thumbnailUrl: item.image,
    detailUrl: item.url,
    type: item.type || 'Manga',
    latestChapter: item.latestChapter ? item.latestChapter.chapter : '',
    concept: item.status || '',
    shortDescription: `Score: ${item.score} | Views: ${item.views || '?'}`,
    additionalInfo: item.latestChapter ? item.latestChapter.time : '',
  }));
}

export async function getBacakomikByGenre(
  genre: string,
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestKomikuRelease[]> {
  const result = await apiCall('/api/manga/bacakomik-search', { keyword: genre, page }, signal);
  if (!result || !result.data) return [];
  
  return result.data.map((item: any) => ({
    title: item.title,
    thumbnailUrl: item.image,
    detailUrl: item.url,
    type: item.type || 'Manga',
    latestChapter: item.chapter || '',
    concept: item.genres ? item.genres.join(', ') : '',
    shortDescription: `Score: ${item.score}`,
    additionalInfo: '',
  }));
}

export async function getBacakomikDetailFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<KomikuDetail> {
  let id = '';
  try {
    id = new URL(url).searchParams.get('id') || '';
  } catch (e) {
    id = url.split('id=')[1]?.split('&')[0] || '';
  }

  if (!id) throw new Error('Invalid URL for Bacakomik');

  let result: any;
  try {
    result = await apiCall('/api/manga/bacakomik-detail', { id }, signal);
  } catch (e: any) {
    throw new Error('Manga detail tidak ditemukan');
  }

  return {
    title: result.title || 'Data tidak tersedia',
    indonesianTitle: result.title || 'Data tidak tersedia',
    type: 'Manga',
    author: result.author ? result.author.join(', ') : 'Unknown',
    status: result.status === 'Completed' ? 'End' : (result.status === 'Ongoing' ? 'Ongoing' : 'Data tidak tersedia'),
    minAge: result.score ? `Score ${result.score}` : 'Data tidak tersedia',
    concept: result.theme ? result.theme.join(', ') : 'Data tidak tersedia',
    readingDirection: 'Data tidak tersedia',
    headerImageUrl: result.cover || result.thumbnail || '',
    thumbnailUrl: result.thumbnail || result.cover || '',
    genres: result.genre || [],
    synopsis: result.synopsis || '',
    chapters: (result.chapters || []).map((ch: any) => ({
      chapter: ch.chapter,
      chapterUrl: ch.url,
      releaseDate: '',
      views: '',
    })),
  };
}

export async function getBacakomikReading(url: string, signal?: AbortSignal): Promise<KomikuReading> {
  let id = '';
  try {
    id = new URL(url).searchParams.get('id') || '';
  } catch (e) {
    id = url.split('id=')[1]?.split('&')[0] || '';
  }

  if (!id) throw new Error('Invalid URL for Bacakomik Chapter');

  const result = await apiCall('/api/manga/bacakomik-chapter', { id }, signal);

  return {
    title: result.title || 'Chapter',
    chapter: result.chapter || 'Unknown',
    thumbnailUrl: result.thumbnail || '',
    releaseDate: '',
    comicImages: result.images || [],
    nextChapter: result.next ? result.next : undefined,
    prevChapter: undefined,
  };
}

export async function bacakomikSearch(query: string, signal?: AbortSignal): Promise<KomikuSearch[]> {
  const result = await apiCall('/api/manga/bacakomik-search', { keyword: query, page: 1 }, signal);
  if (!result || !result.data) return [];

  return result.data.map((item: any) => ({
    title: item.title,
    thumbnailUrl: item.image,
    detailUrl: item.url,
    type: item.type || 'Manga',
    latestChapter: item.chapter || '',
    concept: item.genres ? item.genres.join(', ') : '',
    additionalInfo: `Score: ${item.score}`,
  }));
}
