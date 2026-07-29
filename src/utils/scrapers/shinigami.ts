export const __ALIAS = 'shinigami';

import {
  ComicsDetail,
  ComicsReading,
  ComicsSearch,
  LatestComicsRelease,
} from './comicsv2';

const SHINIGAMI_API = 'https://api.shngm.io';
const SHINIGAMI_ORIGIN = 'https://g.shinigami.asia';

async function apiGet(path: string, signal?: AbortSignal): Promise<any> {
  try {
    const res = await fetch(`${SHINIGAMI_API}${path}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        Accept: 'application/json',
        Origin: SHINIGAMI_ORIGIN,
        Referer: `${SHINIGAMI_ORIGIN}/`,
      },
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.retcode !== 0) throw new Error(json.message || 'API error');
    return json.data || null;
  } catch (error) {
    console.error(`[Shinigami] Error fetching ${path}:`, error);
    return null;
  }
}

export async function getLatestComicsReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const data = await apiGet(
    `/v1/manga/list?type=project&page=${page}&page_size=24&is_update=true&sort=latest&sort_order=desc`,
    signal,
  );
  if (!Array.isArray(data)) return [];

  return data.map((item: any) => ({
    title: item.title || '',
    detailUrl: `shinigami://detail/${item.manga_id || ''}`,
    type: (item.taxonomy?.Format?.[0]?.name || 'Manhwa') as 'Manga' | 'Manhwa' | 'Manhua',
    latestChapter: item.latest_chapter_number?.toString() || '',
    thumbnailUrl: item.cover_portrait_url || item.cover_image_url || '',
    concept: '',
    shortDescription: item.description ? item.description.substring(0, 80) : '',
    additionalInfo: item.country_id || '',
  }));
}

export async function getPopularComicsReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const data = await apiGet(
    `/v1/manga/top?filter=daily&page=${page}&page_size=24`,
    signal,
  );
  if (!Array.isArray(data)) return [];

  return data.map((item: any) => ({
    title: item.title || '',
    detailUrl: `shinigami://detail/${item.manga_id || ''}`,
    type: (item.taxonomy?.Format?.[0]?.name || 'Manhwa') as 'Manga' | 'Manhwa' | 'Manhua',
    latestChapter: item.latest_chapter_number?.toString() || '',
    thumbnailUrl: item.cover_portrait_url || item.cover_image_url || '',
    concept: '',
    shortDescription: item.description ? item.description.substring(0, 80) : '',
    additionalInfo: item.country_id || '',
  }));
}

export async function getComicsSearch(
  query: string,
  page: number = 1,
  signal?: AbortSignal,
): Promise<ComicsSearch[]> {
  const data = await apiGet(
    `/v1/manga/list?q=${encodeURIComponent(query)}&page=${page}&page_size=24&sort=latest&sort_order=desc`,
    signal,
  );
  if (!Array.isArray(data)) return [];

  return data.map((item: any) => ({
    title: item.title || '',
    detailUrl: `shinigami://detail/${item.manga_id || ''}`,
    type: (item.taxonomy?.Format?.[0]?.name || 'Manhwa') as 'Manga' | 'Manhwa' | 'Manhua',
    latestChapter: item.latest_chapter_number?.toString() || '',
    thumbnailUrl: item.cover_portrait_url || item.cover_image_url || '',
    concept: '',
    shortDescription: '',
    additionalInfo: item.country_id || '',
    source: 'Shinigami',
  }));
}

export async function getComicsDetail(
  mangaIdRaw: string,
  signal?: AbortSignal,
): Promise<ComicsDetail> {
  const mangaId = mangaIdRaw.replace('shinigami://detail/', '');
  if (!mangaId) throw new Error('Invalid shinigami detail URL');

  const [detailData, chaptersData] = await Promise.all([
    apiGet(`/v1/manga/detail/${mangaId}`, signal),
    fetchAllChapters(mangaId, signal),
  ]);

  if (!detailData) throw new Error('Failed to fetch detail');

  const genres = detailData.taxonomy?.Genre?.map((g: any) => g.name) || [];

  return {
    title: detailData.title || '',
    indonesianTitle: detailData.alternative_title || '',
    type: (detailData.taxonomy?.Format?.[0]?.name || 'Manhwa') as 'Manga' | 'Manhwa' | 'Manhua' | 'Data tidak tersedia',
    author: detailData.taxonomy?.Author?.[0]?.name || 'Unknown',
    status: detailData.status === 1 ? 'Ongoing' : detailData.status === 2 ? 'End' : 'Data tidak tersedia',
    minAge: '',
    concept: '',
    readingDirection: '',
    headerImageUrl: detailData.cover_image_url || '',
    thumbnailUrl: detailData.cover_portrait_url || detailData.cover_image_url || '',
    genres,
    synopsis: detailData.description || '',
    chapters: chaptersData,
  };
}

async function fetchAllChapters(
  mangaId: string,
  signal?: AbortSignal,
): Promise<{ chapter: string; chapterUrl: string; releaseDate: string; views: string }[]> {
  const allChapters: any[] = [];
  let page = 1;

  while (true) {
    if (signal?.aborted) break;
    const data = await apiGet(
      `/v1/chapter/${mangaId}/list?page=${page}&page_size=50&sort_by=chapter_number&sort_order=asc`,
      signal,
    );
    if (!Array.isArray(data) || data.length === 0) break;
    allChapters.push(...data);
    if (data.length < 50) break;
    page++;
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  return allChapters.reverse().map((ch: any) => ({
    chapter: `Chapter ${ch.chapter_number || ''}${ch.chapter_title ? ` - ${ch.chapter_title}` : ''}`,
    chapterUrl: `shinigami://chapter/${ch.chapter_id || ''}`,
    releaseDate: ch.release_date || '',
    views: ch.view_count?.toString() || '',
  }));
}

export async function getComicsByGenre(
  genre: string,
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const genreSlug = genre.toLowerCase().replace(/\s+/g, '-');
  const data = await apiGet(
    `/v1/manga/list?page=${page}&page_size=24&genre=${encodeURIComponent(genreSlug)}&sort=latest&sort_order=desc`,
    signal,
  );
  if (!Array.isArray(data)) return [];

  return data.map((item: any) => ({
    title: item.title || '',
    detailUrl: `shinigami://detail/${item.manga_id || ''}`,
    type: (item.taxonomy?.Format?.[0]?.name || 'Manhwa') as 'Manga' | 'Manhwa' | 'Manhua',
    latestChapter: item.latest_chapter_number?.toString() || '',
    thumbnailUrl: item.cover_portrait_url || item.cover_image_url || '',
    concept: '',
    shortDescription: item.description ? item.description.substring(0, 80) : '',
    additionalInfo: item.country_id || '',
  }));
}

export async function getComicsReading(
  chapterIdRaw: string,
  signal?: AbortSignal,
): Promise<ComicsReading> {
  const chapterId = chapterIdRaw.replace('shinigami://chapter/', '');
  if (!chapterId) throw new Error('Invalid chapter URL');

  const data = await apiGet(`/v1/chapter/detail/${chapterId}`, signal);
  if (!data) throw new Error('Failed to fetch chapter images');

  const baseUrl = data.base_url || '';
  const chapterPath = data.chapter?.path || '';
  const imageFiles: string[] = data.chapter?.data || [];

  const comicImages = imageFiles.map((file: string) => `${baseUrl}${chapterPath}${file}`);

  let nextChapter: string | undefined;
  let prevChapter: string | undefined;
  const mangaId = data.manga_id;
  if (mangaId) {
    try {
      const chapters = await fetchAllChapters(String(mangaId), signal);
      const currentIdx = chapters.findIndex(
        ch => ch.chapterUrl === `shinigami://chapter/${chapterId}`,
      );
      if (currentIdx >= 0) {
        if (currentIdx > 0) {
          nextChapter = chapters[currentIdx - 1].chapterUrl;
        }
        if (currentIdx < chapters.length - 1) {
          prevChapter = chapters[currentIdx + 1].chapterUrl;
        }
      }
    } catch (e) {
    }
  }

  return {
    title: `Chapter ${data.chapter_number || ''}${data.chapter_title ? ` - ${data.chapter_title}` : ''}`,
    chapter: data.chapter_number?.toString() || '',
    thumbnailUrl: data.thumbnail_image_url || comicImages[0] || '',
    releaseDate: '',
    comicImages,
    nextChapter,
    prevChapter,
  };
}
