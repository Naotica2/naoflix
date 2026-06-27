export const __ALIAS = 'komikcast';

import {
  ComicsDetail,
  ComicsReading,
  ComicsSearch,
  LatestComicsRelease,
} from './comicsv2';

const KOMIKCAST_BASE = 'https://be.komikcast.cc';

async function apiGet(path: string, signal?: AbortSignal): Promise<any> {
  try {
    const res = await fetch(`${KOMIKCAST_BASE}${path}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        Accept: 'application/json',
      },
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data || null;
  } catch (error) {
    console.error(`[Komikcast] Error fetching ${path}:`, error);
    return null;
  }
}

function mapListItem(item: any): LatestComicsRelease {
  const d = item.data || {};
  const chapters = item.chapters || [];
  const latestCh = chapters[0];

  return {
    title: d.title || '',
    detailUrl: `komikcast://detail/${d.slug || ''}`,
    type: capitalize(d.format || 'Manga') as 'Manga' | 'Manhwa' | 'Manhua',
    latestChapter: latestCh?.data?.title || `Ch ${latestCh?.data?.index || latestCh?.chapterIndex || ''}`,
    thumbnailUrl: d.coverImage || '',
    concept: '',
    shortDescription: d.synopsis ? d.synopsis.substring(0, 80) : '',
    additionalInfo: d.author || '',
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function getLatestComicsReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const data = await apiGet(
    `/series?preset=rilisan_terbaru&take=24&takeChapter=1&page=${page}`,
    signal,
  );
  if (!Array.isArray(data)) return [];
  return data.map(mapListItem);
}

export async function getPopularComicsReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const data = await apiGet(
    `/series?preset=popular_all&take=24&takeChapter=1&page=${page}`,
    signal,
  );
  if (!Array.isArray(data)) return [];
  return data.map(mapListItem);
}

export async function getComicsSearch(
  query: string,
  signal?: AbortSignal,
): Promise<ComicsSearch[]> {
  const data = await apiGet(
    `/series?title=${encodeURIComponent(query)}&take=24&page=1`,
    signal,
  );
  if (!Array.isArray(data)) return [];

  return data.map((item: any) => {
    const mapped = mapListItem(item);
    return {
      ...mapped,
      source: 'Komikcast',
    } as ComicsSearch;
  });
}

export async function getComicsDetail(
  urlRaw: string,
  signal?: AbortSignal,
): Promise<ComicsDetail> {
  const slug = urlRaw.replace('komikcast://detail/', '').replace('komikcast://detail', '');
  if (!slug) throw new Error('Invalid komikcast detail URL');

  // Fetch series detail + chapters with images in one call
  const listData = await apiGet(`/series?slug=${encodeURIComponent(slug)}&takeChapter=500`, signal);
  if (!Array.isArray(listData) || listData.length === 0) throw new Error('Gagal memuat detail komik');

  const series = listData[0];
  const d = series.data || {};
  const chaptersRaw = series.chapters || [];

  // Genres are objects: {id, data: {name, description}}
  const genres = Array.isArray(d.genres)
    ? d.genres.map((g: any) => g?.data?.name || g?.name || '').filter(Boolean)
    : [];

  // Map chapters - use data.index as chapter number
  const chapters = chaptersRaw.map((ch: any) => ({
    chapter: ch.data?.title || `Chapter ${ch.data?.index ?? ch.chapterIndex ?? ''}`,
    chapterUrl: `komikcast://chapter/${slug}/${ch.data?.index ?? ch.chapterIndex ?? ch.id}`,
    releaseDate: ch.createdAt || '',
    views: ch.views?.total?.toString() || '',
  }));

  return {
    title: d.title || '',
    indonesianTitle: d.nativeTitle || '',
    type: capitalize(d.format || 'Manga') as 'Manga' | 'Manhwa' | 'Manhua' | 'Data tidak tersedia',
    author: d.author || 'Unknown',
    status: d.status === 'ongoing' ? 'Ongoing' : d.status === 'completed' ? 'End' : 'Data tidak tersedia',
    minAge: '',
    concept: '',
    readingDirection: '',
    headerImageUrl: d.backgroundImage || d.coverImage || '',
    thumbnailUrl: d.coverImage || '',
    genres,
    synopsis: d.synopsis || '',
    chapters,
  };
}

export async function getComicsReading(
  urlRaw: string,
  signal?: AbortSignal,
): Promise<ComicsReading> {
  // URL format: komikcast://chapter/{slug}/{chapterIndex}
  const clean = urlRaw.replace('komikcast://chapter/', '');
  const lastSlash = clean.lastIndexOf('/');
  const slug = clean.substring(0, lastSlash);
  const chapterIndex = clean.substring(lastSlash + 1);

  if (!slug) throw new Error('Gagal memuat chapter');

  // Fetch the series with all chapters (includes dataImages)
  const listData = await apiGet(`/series?slug=${encodeURIComponent(slug)}&takeChapter=1000`, signal);
  if (!Array.isArray(listData) || listData.length === 0) throw new Error('Gagal memuat chapter');

  const series = listData[0];
  const chaptersRaw = series.chapters || [];

  // Find the chapter by index (data.index or chapterIndex or id)
  const chapter = chaptersRaw.find(
    (ch: any) => String(ch.data?.index ?? ch.chapterIndex ?? ch.id ?? '') === String(chapterIndex),
  );

  if (!chapter) throw new Error('Chapter tidak ditemukan');

  const dataImages = chapter.dataImages || {};
  const sortedKeys = Object.keys(dataImages).sort((a, b) => Number(a) - Number(b));
  const images = sortedKeys.map(k => dataImages[k]).filter(Boolean);

  // Find prev/next chapter by position in the sorted array
  const chapterPos = chaptersRaw.indexOf(chapter);
  const prevCh = chapterPos < chaptersRaw.length - 1 ? chaptersRaw[chapterPos + 1] : null;
  const nextCh = chapterPos > 0 ? chaptersRaw[chapterPos - 1] : null;

  return {
    title: chapter.data?.title || `Chapter ${chapter.data?.index ?? chapter.chapterIndex ?? chapter.id ?? ''}`,
    chapter: String(chapter.data?.index ?? chapter.chapterIndex ?? chapter.id ?? ''),
    thumbnailUrl: images[0] || '',
    releaseDate: chapter.createdAt || '',
    comicImages: images,
    nextChapter: nextCh ? `komikcast://chapter/${slug}/${nextCh.data?.index ?? nextCh.chapterIndex ?? nextCh.id ?? ''}` : undefined,
    prevChapter: prevCh ? `komikcast://chapter/${slug}/${prevCh.data?.index ?? prevCh.chapterIndex ?? prevCh.id ?? ''}` : undefined,
  };
}

// Common Komikcast genre IDs
const KC_GENRES: Record<string, number> = {
  '4-koma': 11, 'action': 19, 'adventure': 16, 'comedy': 22, 'cooking': 7,
  'demons': 40, 'drama': 29, 'ecchi': 47, 'fantasy': 28, 'game': 17,
  'gender-bender': 41, 'gore': 15, 'harem': 34, 'historical': 10, 'horror': 18,
  'isekai': 6, 'josei': 23, 'magic': 35, 'martial-arts': 46, 'mature': 37,
  'mecha': 20, 'medical': 9, 'military': 36, 'music': 44, 'mystery': 39,
  'one-shot': 33, 'police': 43, 'psychological': 4, 'reincarnation': 14,
  'romance': 26, 'school': 42, 'school-life': 2, 'sci-fi': 32, 'seinen': 1,
  'shoujo': 31, 'shoujo-ai': 27, 'shounen': 30, 'shounen-ai': 25,
  'slice-of-life': 13, 'sports': 12, 'super-power': 45, 'supernatural': 24,
  'thriller': 5, 'tragedy': 38, 'vampire': 21, 'webtoons': 8, 'yuri': 3
};

export async function getComicsSearchWithGenre(
  genre: string,
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  throw new Error('Komikcast tidak mendukung pencarian berdasarkan genre.');
}
