import { fetch } from '@tauri-apps/plugin-http';
import MD5 from 'crypto-js/md5';

const API_BASE = 'https://h5-api.aoneroom.com';
const API_PREFIX = '/wefeed-h5api-bff';
const SITE_BASE = 'https://movie-box.co';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Types
export type MovieboxCover = { url: string; width: number; height: number };
export type MovieboxSearchItem = {
  subjectId: string; subjectType: number; title: string; description: string;
  releaseDate: string; genre: string; cover: MovieboxCover; countryName: string;
  imdbRatingValue: string; subtitles: string; detailPath: string; hasResource: boolean;
};

// X-Client-Token generation (same as mobile)
function clientToken(): string {
  const ts = String(Math.floor(Date.now() / 1000));
  return `${ts},${MD5(ts.split('').reverse().join('')).toString()}`;
}

function buildHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'X-Client-Token': clientToken(),
    Referer: `${SITE_BASE}/`,
    Origin: SITE_BASE,
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function apiGet(path: string): Promise<any> {
  console.log('[MovieBox] GET:', path);
  const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, { headers: buildHeaders() });
  console.log('[MovieBox] Response:', res.status);
  if (!res.ok) throw new Error(`MovieBox API error: ${res.status}`);
  const json = await res.json();
  console.log('[MovieBox] Data keys:', Object.keys(json));
  if (!json.data) throw new Error('MovieBox: no data field in response');
  return json.data;
}

async function apiPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
    method: 'POST',
    headers: buildHeaders(true),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return json.data;
}

// Public API
export async function getTrending(page = 0): Promise<MovieboxSearchItem[]> {
  const data = await apiGet(`/subject/trending?page=${page}&perPage=12`);
  return (data?.subjectList || []) as MovieboxSearchItem[];
}

export async function searchMoviebox(
  keyword: string, page = 0
): Promise<{ items: MovieboxSearchItem[]; totalCount: number; hasMore: boolean }> {
  const data = await apiPost('/subject/search', { keyword, page, perPage: 18, subjectType: null });
  return {
    items: (data?.items || []) as MovieboxSearchItem[],
    totalCount: data?.pager?.totalCount || 0,
    hasMore: data?.pager?.hasMore || false,
  };
}

export async function getPlayStreams(
  subjectId: string, detailPath: string, season?: number, episode?: number
): Promise<any[]> {
  const params = new URLSearchParams({ subjectId, detailPath });
  if (season != null) params.set('se', String(season));
  if (episode != null) params.set('ep', String(episode));
  const data = await apiGet(`/subject/play?${params}`);
  return data?.playStreams || [];
}

export async function getCaptions(
  subjectId: string, detailPath: string, season?: number, episode?: number
): Promise<any[]> {
  const params = new URLSearchParams({ subjectId, detailPath });
  if (season != null) params.set('se', String(season));
  if (episode != null) params.set('ep', String(episode));
  const data = await apiGet(`/subject/play?${params}`);
  return data?.captions || [];
}
