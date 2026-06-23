export const __ALIAS = 'mangadex';

import {
  ComicsDetail,
  ComicsReading,
  ComicsSearch,
  LatestComicsRelease,
} from './comicsv2';

export const MANGADEX_BASE = 'https://mangadex.org';

async function apiCall(endpoint: string, body: any, signal?: AbortSignal) {
  try {
    const res = await fetch(`https://api.fruatre.my.id${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const json = await res.json();
    return json.result || json.data || [];
  } catch (error) {
    console.error(`Error fetching ${endpoint}:`, error);
    return null;
  }
}

function getProxiedUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('http')) {
    return `https://spring-night-57a1.3540746063.workers.dev/${url}`;
  }
  return url;
}

export async function getMangadexLatest(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const result = await apiCall('/api/manga/mangadex-home', { page }, signal);
  if (!result || (!result.recentlyAdded && !result.latestUploads)) return [];

  const items = result.recentlyAdded || result.latestUploads || [];
  return items.map((item: any) => ({
    title: item.title,
    thumbnailUrl: getProxiedUrl(item.coverUrl),
    detailUrl: `/title/${item.id}`,
    latestChapter: item.status || 'Ongoing',
  }));
}

export async function getMangadexPopular(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const result = await apiCall('/api/manga/mangadex-home', { page }, signal);
  if (!result || !result.popularManga) return [];

  return result.popularManga.map((item: any) => ({
    title: item.title,
    thumbnailUrl: getProxiedUrl(item.coverUrl),
    detailUrl: `/title/${item.id}`,
    latestChapter: item.status || 'Ongoing',
  }));
}

export async function mangadexSearch(
  query: string,
  signal?: AbortSignal,
): Promise<ComicsSearch[]> {
  const result = await apiCall('/api/manga/mangadex-search', { query, page: 1 }, signal);
  if (!result || !Array.isArray(result)) return [];

  return result.map((item: any) => ({
    title: item.title,
    thumbnailUrl: getProxiedUrl(item.coverUrl),
    detailUrl: `/title/${item.id}`,
    type: item.contentRating || 'Manga',
    latestChapter: item.status || '',
    concept: item.tags ? item.tags.join(', ') : '',
    additionalInfo: `Year: ${item.year || '?'}`,
    source: 'MangaDex',
  }));
}

export async function getMangadexDetail(
  url: string,
  signal?: AbortSignal,
): Promise<ComicsDetail> {
  const parts = url.split('/').filter(Boolean);
  const id = parts[parts.length - 1];

  const [result, chaptersResult] = await Promise.all([
    apiCall('/api/manga/mangadex-detail', { id }, signal),
    apiCall('/api/manga/mangadex-chapters', { id, languages: ['id', 'en'] }, signal)
  ]);

  if (!result || !result.title) throw new Error('Detail MangaDex tidak ditemukan');

  const chaptersArray = Array.isArray(chaptersResult) ? chaptersResult : [];

  const chapters = chaptersArray.map((ch: any) => ({
    chapter: `Chapter ${ch.chapter || '?'} [${(ch.language || 'en').toUpperCase()}] ${ch.title ? '- ' + ch.title : ''}`.trim(),
    chapterUrl: `/chapter/${id}/${ch.id}`,
    releaseDate: ch.readableAt ? new Date(ch.readableAt).toLocaleDateString() : '',
    views: '',
  }));

  return {
    title: result.title,
    indonesianTitle: '',
    type: result.contentRating === 'safe' ? 'Manga' : 'Data tidak tersedia',
    author: result.authors ? result.authors.join(', ') : 'Data tidak tersedia',
    status: result.status === 'ongoing' ? 'Ongoing' : result.status === 'completed' ? 'End' : 'Data tidak tersedia',
    minAge: 'Data tidak tersedia',
    concept: 'Data tidak tersedia',
    readingDirection: 'Data tidak tersedia',
    headerImageUrl: getProxiedUrl(result.coverUrl),
    thumbnailUrl: getProxiedUrl(result.coverUrl),
    synopsis: result.description || 'Tidak ada sinopsis',
    genres: result.tags || [],
    chapters,
  };
}

export async function getMangadexReading(
  url: string,
  signal?: AbortSignal,
): Promise<ComicsReading> {
  const parts = url.split('/').filter(Boolean);
  const mangaId = parts[parts.length - 2];
  const chapterId = parts[parts.length - 1];

  const [result, chaptersResult] = await Promise.all([
    apiCall('/api/manga/mangadex-pages', { id: chapterId }, signal),
    mangaId ? apiCall('/api/manga/mangadex-chapters', { id: mangaId, languages: ['id', 'en'] }, signal) : Promise.resolve(null)
  ]);

  if (!result || !result.pages) throw new Error('Data halaman tidak tersedia');

  // To get next and prev chapter, we parse the chaptersResult
  let nextChapterUrl: string | undefined;
  let prevChapterUrl: string | undefined;
  let currentChapterName = 'Chapter ?';

  if (Array.isArray(chaptersResult)) {
    const idx = chaptersResult.findIndex((c: any) => c.id === chapterId);
    if (idx !== -1) {
      const currentChapter = chaptersResult[idx];
      currentChapterName = `Chapter ${currentChapter.chapter || '?'} [${(currentChapter.language || 'en').toUpperCase()}] ${currentChapter.title ? '- ' + currentChapter.title : ''}`.trim();
      
      const currentLang = currentChapter.language;
      const currentNum = parseFloat(currentChapter.chapter || '0');

      // Find Next Chapter (same lang, greater number)
      for (let i = idx - 1; i >= 0; i--) {
        const c = chaptersResult[i];
        if (c.language === currentLang && parseFloat(c.chapter || '0') > currentNum) {
          nextChapterUrl = `/chapter/${mangaId}/${c.id}`;
          break;
        }
      }

      // Fallback: If no same language next chapter, find any language greater number
      if (!nextChapterUrl) {
        for (let i = idx - 1; i >= 0; i--) {
          const c = chaptersResult[i];
          if (parseFloat(c.chapter || '0') > currentNum) {
            nextChapterUrl = `/chapter/${mangaId}/${c.id}`;
            break;
          }
        }
      }

      // Find Prev Chapter (same lang, smaller number)
      for (let i = idx + 1; i < chaptersResult.length; i++) {
        const c = chaptersResult[i];
        if (c.language === currentLang && parseFloat(c.chapter || '0') < currentNum) {
          prevChapterUrl = `/chapter/${mangaId}/${c.id}`;
          break;
        }
      }

      // Fallback: If no same language prev chapter, find any language smaller number
      if (!prevChapterUrl) {
        for (let i = idx + 1; i < chaptersResult.length; i++) {
          const c = chaptersResult[i];
          if (parseFloat(c.chapter || '0') < currentNum) {
            prevChapterUrl = `/chapter/${mangaId}/${c.id}`;
            break;
          }
        }
      }
    }
  }

  const rawImages = result.highResPages || result.pages || [];
  const proxyPrefix = 'https://spring-night-57a1.3540746063.workers.dev/';
  
  return {
    title: currentChapterName,
    chapter: currentChapterName,
    thumbnailUrl: '',
    releaseDate: '',
    comicImages: rawImages.map((url: string) => (url.startsWith('http') ? proxyPrefix + url : url)),
    nextChapter: nextChapterUrl,
    prevChapter: prevChapterUrl,
  };
}
