import * as comics2 from './komiku';
import * as mynimeku from './mynimeku';
import * as bacakomik from './bacakomik';
import * as shinigami from './shinigami';
import * as komikindo from './komikindo';
import * as luvyaa from './luvyaa';
import * as voratoon from './voratoon';
import { getSourcePreferences, isSourceActive } from '../sourcePreferences';

export type LatestComicsRelease = comics2.LatestKomikuRelease;
export type ComicsDetail = comics2.KomikuDetail;
export type ComicsReading = comics2.KomikuReading;
export type ComicsSearch = comics2.KomikuSearch & { source: string };

export async function getActiveComicSource(): Promise<
  'komiku' | 'mynimeku' | 'bacakomik' | 'shinigami' | 'komikindo' | 'luvyaa' | 'voratoon'
> {
  const prefs = await getSourcePreferences();
  if (isSourceActive(prefs, 'komiku')) return 'komiku';
  if (isSourceActive(prefs, 'bacakomik')) return 'bacakomik';
  if (isSourceActive(prefs, 'mynimeku')) return 'mynimeku';
  if (isSourceActive(prefs, 'shinigami')) return 'shinigami';
  if (isSourceActive(prefs, 'komikindo')) return 'komikindo';
  if (isSourceActive(prefs, 'luvyaa')) return 'luvyaa';
  if (isSourceActive(prefs, 'voratoon')) return 'voratoon';
  return 'komiku';
}

export async function getLatestComicsReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const source = await getActiveComicSource();
  if (source === 'mynimeku') {
    const res = await mynimeku.getLatestMynimekuReleases(page, signal);
    return res.map(r => ({
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      detailUrl: r.detailUrl,
      type: r.type,
      latestChapter: r.latestChapter,
      concept: r.concept,
      shortDescription: r.shortDescription,
      additionalInfo: r.additionalInfo,
    }));
  }
  if (source === 'bacakomik') {
    return await bacakomik.getLatestBacakomikReleases(page, signal);
  }
  if (source === 'shinigami') {
    const res = await shinigami.getLatestComicsReleases(page, signal);
    return res.map(r => ({
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      detailUrl: r.detailUrl,
      type: r.type,
      latestChapter: r.latestChapter,
      concept: '',
      shortDescription: '',
      additionalInfo: '',
    }));
  }
  if (source === 'komikindo') {
    return await komikindo.getLatestComicsReleases(page, signal);
  }
  if (source === 'luvyaa') {
    return await luvyaa.getLatestComicsReleases(page, signal);
  }
  if (source === 'voratoon') {
    const res = await voratoon.getLatestComicsReleases(page, signal);
    return res.map(r => ({
      title: r.title,
      thumbnailUrl: r.img,
      detailUrl: 'voratoon://detail' + r.link,
      type: r.type || 'Manga',
      latestChapter: r.chapter,
      concept: '',
      shortDescription: '',
      additionalInfo: '',
    }));
  }
  return await comics2.getLatestKomikuReleases(page, signal);
}

export async function getPopularComicsReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const source = await getActiveComicSource();
  if (source === 'mynimeku') {
    const res = await mynimeku.getPopularMynimekuReleases(page, signal);
    return res.map(r => ({
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      detailUrl: r.detailUrl,
      type: r.type,
      latestChapter: r.latestChapter,
      concept: r.concept,
      shortDescription: r.shortDescription,
      additionalInfo: r.additionalInfo,
    }));
  }
  if (source === 'bacakomik') {
    return await bacakomik.getPopularBacakomikReleases(page, signal);
  }
  if (source === 'shinigami') {
    const res = await shinigami.getPopularComicsReleases(page, signal);
    return res.map(r => ({
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      detailUrl: r.detailUrl,
      type: r.type,
      latestChapter: r.latestChapter,
      concept: '',
      shortDescription: '',
      additionalInfo: '',
    }));
  }
  if (source === 'komikindo') {
    return await komikindo.getPopularComicsReleases(page, signal);
  }
  if (source === 'luvyaa') {
    return await luvyaa.getPopularComicsReleases(page, signal);
  }
  if (source === 'voratoon') {
    const res = await voratoon.getPopularComicsReleases(page, signal);
    return res.map(r => ({
      title: r.title,
      thumbnailUrl: r.img,
      detailUrl: 'voratoon://detail' + r.link,
      type: r.type || 'Manga',
      latestChapter: r.chapter,
      concept: '',
      shortDescription: '',
      additionalInfo: '',
    }));
  }
  return await comics2.getPopularKomikuReleases(page, signal);
}

export async function getManhwaWebtoonReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const source = await getActiveComicSource();
  if (source === 'mynimeku') {
    const res = await mynimeku.getManhwaMynimekuReleases(page, signal);
    return res.map(r => ({
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      detailUrl: r.detailUrl,
      type: r.type,
      latestChapter: r.latestChapter,
      concept: r.concept,
      shortDescription: r.shortDescription,
      additionalInfo: r.additionalInfo,
    }));
  }
  if (source === 'bacakomik') {
    return await bacakomik.getManhwaBacakomikReleases(page, signal);
  }
  if (source === 'shinigami') {
    return await shinigami.getManhwaComicsReleases(page, signal);
  }
  if (source === 'komikindo') {
    return await komikindo.getManhwaComicsReleases(page, signal);
  }
  if (source === 'luvyaa') {
    return await luvyaa.getManhwaComicsReleases(page, signal);
  }
  if (source === 'voratoon') {
    const res = await voratoon.getManhwaComicsReleases(page, signal);
    return res.map(r => ({
      title: r.title,
      thumbnailUrl: r.img,
      detailUrl: 'voratoon://detail' + r.link,
      type: r.type || 'Manhwa',
      latestChapter: r.chapter,
      concept: '',
      shortDescription: '',
      additionalInfo: '',
    }));
  }
  return await comics2.getManhwaKomikuReleases(page, signal);
}

export async function getComicsByGenre(
  genre: string,
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const source = await getActiveComicSource();
  if (source === 'mynimeku') {
    const res = await mynimeku.getMynimekuByGenre(genre, page, signal);
    return res.map(r => ({
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      detailUrl: r.detailUrl,
      type: r.type,
      latestChapter: r.latestChapter,
      concept: r.concept,
      shortDescription: r.shortDescription,
      additionalInfo: r.additionalInfo,
    }));
  }
  if (source === 'bacakomik') {
    return await bacakomik.getBacakomikByGenre(genre, page, signal);
  }
  if (source === 'shinigami') {
    return await shinigami.getComicsByGenre(genre, page, signal);
  }
  if (source === 'komikindo') {
    const data = await komikindo.getComicsSearchWithGenre(genre, page, signal);
    return data.map(r => ({
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      detailUrl: r.detailUrl,
      type: r.type,
      latestChapter: r.latestChapter,
      concept: '',
      shortDescription: '',
      additionalInfo: '',
    }));
  }
  if (source === 'luvyaa') {
    return await luvyaa.getComicsSearch(genre, page, signal);
  }
  if (source === 'voratoon') {
    const res = await voratoon.getComicsSearchWithGenre(genre, page, signal);
    return res.map(r => ({
      title: r.title,
      thumbnailUrl: r.img,
      detailUrl: 'voratoon://detail' + r.link,
      type: r.type || 'Manga',
      latestChapter: r.chapter,
      concept: '',
      shortDescription: '',
      additionalInfo: '',
    }));
  }
  return await comics2.getKomikuByGenre(genre, page, signal);
}

export async function getComicsDetailFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<ComicsDetail> {
  if (url.startsWith('shinigami://')) {
    return await shinigami.getComicsDetail(url, signal);
  }
  if (url.startsWith('komikindo://') || url.includes('komikindo.')) {
    if (url.startsWith('komikindo://')) {
      return await komikindo.getComicsDetail(url, signal);
    }
    const cleanPath = url.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
    const segs = cleanPath.split('/').filter(Boolean);
    if (segs.length >= 2 && segs[0].toLowerCase() === 'komik') {
      return await komikindo.getComicsDetail(`komikindo://detail/${segs[1]}`, signal);
    }
    return await komikindo.getComicsDetail(url, signal);
  }
  if (url.startsWith('luvyaa://')) {
    return await luvyaa.getComicsDetail(url, signal);
  }
  if (url.startsWith('voratoon://') || url.startsWith('voratoon:/') || url.includes('voratoon.')) {
    let cleanUrl = url;
    if (url.startsWith('voratoon://detail')) cleanUrl = url.replace('voratoon://detail', '');
    else if (url.startsWith('voratoon://')) cleanUrl = url.replace('voratoon://', '');
    else if (url.startsWith('voratoon:/')) cleanUrl = url.replace('voratoon:/', '');
    const res = await voratoon.getComicsDetail(cleanUrl, signal);
    if (!res) throw new Error('Not found');
    return {
      title: res.title,
      indonesianTitle: res.metadata['Title'] || '',
      type: (res.metadata['Type'] || 'Manga') as any,
      author: res.metadata['Author'] || '',
      status: (res.metadata['Status'] || 'Ongoing') as any,
      minAge: '',
      concept: '',
      readingDirection: '',
      headerImageUrl: res.img,
      thumbnailUrl: res.img,
      genres: (res as any).genres || [],
      synopsis: res.synopsis,
      chapters: res.chapters.map(c => ({
        chapter: c.title,
        chapterUrl: c.link.startsWith('voratoon://')
          ? c.link
          : 'voratoon://' + c.link.replace(/^\/+/, ''),
        releaseDate: c.time,
        views: '',
      })),
    };
  }
  if (url.includes('bacakomik.')) {
    return await bacakomik.getBacakomikDetailFromUrl(url, signal);
  }
  if (url.includes('mynimeku.com')) {
    return await mynimeku.getMynimekuDetailFromUrl(url, signal);
  }
  if (url.includes('komiku.org')) {
    return await comics2.getKomikuDetailFromUrl(url, signal);
  }
  const source = await getActiveComicSource();
  if (source === 'mynimeku') {
    const res = await mynimeku.getMynimekuDetailFromUrl(url, signal);
    return {
      title: res.title,
      indonesianTitle: res.indonesianTitle,
      type: res.type,
      author: res.author,
      status: res.status,
      minAge: res.minAge,
      concept: res.concept,
      readingDirection: res.readingDirection,
      headerImageUrl: res.headerImageUrl,
      thumbnailUrl: res.thumbnailUrl,
      genres: res.genres,
      synopsis: res.synopsis,
      chapters: res.chapters,
    };
  }
  if (source === 'bacakomik') {
    return await bacakomik.getBacakomikDetailFromUrl(url, signal);
  }
  if (source === 'shinigami') {
    return await shinigami.getComicsDetail(url, signal);
  }
  if (source === 'komikindo') {
    return await komikindo.getComicsDetail(url, signal);
  }
  if (source === 'luvyaa') {
    return await luvyaa.getComicsDetail(url, signal);
  }
  if (source === 'voratoon') {
    const res = await voratoon.getComicsDetail(url, signal);
    if (!res) throw new Error('Not found');
    return {
      title: res.title,
      indonesianTitle: res.metadata['Title'] || '',
      type: (res.metadata['Type'] || 'Manga') as any,
      author: res.metadata['Author'] || '',
      status: (res.metadata['Status'] || 'Ongoing') as any,
      minAge: '',
      concept: '',
      readingDirection: '',
      headerImageUrl: res.img,
      thumbnailUrl: res.img,
      genres: (res as any).genres || [],
      synopsis: res.synopsis,
      chapters: res.chapters.map(c => ({
        chapter: c.title,
        chapterUrl: c.link.startsWith('voratoon://')
          ? c.link
          : 'voratoon://' + c.link.replace(/^\/+/, ''),
        releaseDate: c.time,
        views: '',
      })),
    };
  }
  return await comics2.getKomikuDetailFromUrl(url, signal);
}

export async function getComicsReading(url: string, signal?: AbortSignal): Promise<ComicsReading> {
  if (url.startsWith('shinigami://')) {
    const res = await shinigami.getComicsReading(url, signal);
    return {
      title: res.title,
      chapter: res.chapter,
      thumbnailUrl: res.thumbnailUrl,
      releaseDate: '',
      comicImages: res.comicImages,
      nextChapter: res.nextChapter,
      prevChapter: res.prevChapter,
    };
  }
  if (url.startsWith('komikindo://')) {
    return await komikindo.getComicsReading(url, signal);
  }
  if (url.startsWith('luvyaa://')) {
    return await luvyaa.getComicsReading(url, signal);
  }
  if (url.startsWith('voratoon://') || url.startsWith('voratoon:/') || url.includes('voratoon.')) {
    const res = await voratoon.getComicsReading(url, signal);
    if (!res) throw new Error('Not found');
    return {
      title: res.title || 'Chapter',
      chapter: res.chapter || 'Reading',
      thumbnailUrl: res.thumbnailUrl || '',
      releaseDate: '',
      comicImages: res.images,
      nextChapter: res.nextChapter || '',
      prevChapter: res.prevChapter || '',
    };
  }
  if (url.includes('bacakomik.')) {
    return await bacakomik.getBacakomikReading(url, signal);
  }
  if (url.includes('mynimeku.com')) {
    return await mynimeku.getMynimekuReading(url, signal);
  }
  if (url.includes('komiku.org')) {
    return await comics2.getKomikuReading(url, signal);
  }
  const source = await getActiveComicSource();
  if (source === 'mynimeku') {
    const res = await mynimeku.getMynimekuReading(url, signal);
    return {
      title: res.title,
      chapter: res.chapter,
      thumbnailUrl: res.thumbnailUrl,
      releaseDate: res.releaseDate,
      comicImages: res.comicImages,
      nextChapter: res.nextChapter,
      prevChapter: res.prevChapter,
    };
  }
  if (source === 'bacakomik') {
    return await bacakomik.getBacakomikReading(url, signal);
  }
  if (source === 'shinigami') {
    const res = await shinigami.getComicsReading(url, signal);
    return {
      title: res.title,
      chapter: res.chapter,
      thumbnailUrl: res.thumbnailUrl,
      releaseDate: '',
      comicImages: res.comicImages,
      nextChapter: res.nextChapter,
      prevChapter: res.prevChapter,
    };
  }
  if (source === 'komikindo') {
    return await komikindo.getComicsReading(url, signal);
  }
  if (source === 'luvyaa') {
    return await luvyaa.getComicsReading(url, signal);
  }
  if (source === 'voratoon') {
    const res = await voratoon.getComicsReading(url, signal);
    if (!res) throw new Error('Not found');
    return {
      title: res.title || 'Chapter',
      chapter: res.chapter || 'Reading',
      thumbnailUrl: res.thumbnailUrl || '',
      releaseDate: '',
      comicImages: res.images,
      nextChapter: res.nextChapter || '',
      prevChapter: res.prevChapter || '',
    };
  }
  return await comics2.getKomikuReading(url, signal);
}

export async function comicsSearch(query: string, signal?: AbortSignal): Promise<ComicsSearch[]> {
  const source = await getActiveComicSource();
  if (source === 'mynimeku') {
    const res = await mynimeku.mynimekuSearch(query, signal);
    return res.map(r => ({
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      detailUrl: r.detailUrl,
      type: r.type,
      latestChapter: r.latestChapter,
      concept: r.concept,
      additionalInfo: r.additionalInfo,
      source: 'MyNimeku',
    }));
  }
  if (source === 'bacakomik') {
    const res = await bacakomik.bacakomikSearch(query, signal);
    return res.map(r => ({ ...r, source: 'Bacakomik' }));
  }
  if (source === 'shinigami') {
    const res = await shinigami.getComicsSearch(query, 1, signal);
    return res.map(r => ({
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      detailUrl: r.detailUrl,
      type: r.type,
      latestChapter: r.latestChapter,
      concept: '',
      additionalInfo: '',
      source: 'Shinigami',
    }));
  }
  if (source === 'komikindo') {
    const searchRes = await komikindo.getComicsSearch(query, signal);
    return searchRes.map(r => ({ ...r, source: 'Komikindo' }));
  }
  if (source === 'luvyaa') {
    const searchRes = await luvyaa.getComicsSearch(query, 1, signal);
    return searchRes.map(r => ({ ...r, source: 'Luvyaa' }));
  }
  if (source === 'voratoon') {
    const res = await voratoon.getComicsSearch(query, 1, signal);
    return res.map(r => ({
      title: r.title,
      thumbnailUrl: r.img,
      detailUrl: 'voratoon://detail' + r.link,
      type: r.type || 'Manga',
      latestChapter: r.chapter,
      concept: '',
      additionalInfo: '',
      source: 'Voratoon',
    }));
  }
  const res = await comics2.komikuSearch(query, signal);
  return res.map(r => ({ ...r, source: 'Komiku' }));
}

export const ALL_SOURCES = [
  'komiku',
  'mynimeku',
  'bacakomik',
  'shinigami',
  'komikindo',
  'luvyaa',
  'voratoon',
];

export const COMICS_GENRES: { name: string; slug: string }[] = [
  { name: 'Action', slug: 'action' },
  { name: 'Adventure', slug: 'adventure' },
  { name: 'Comedy', slug: 'comedy' },
  { name: 'Cultivation', slug: 'cultivation' },
  { name: 'Drama', slug: 'drama' },
  { name: 'Fantasy', slug: 'fantasy' },
  { name: 'Harem', slug: 'harem' },
  { name: 'Historical', slug: 'historical' },
  { name: 'Horror', slug: 'horror' },
  { name: 'Isekai', slug: 'isekai' },
  { name: 'Josei', slug: 'josei' },
  { name: 'Magic', slug: 'magic' },
  { name: 'Martial Arts', slug: 'martial-arts' },
  { name: 'Mecha', slug: 'mecha' },
  { name: 'Mystery', slug: 'mystery' },
  { name: 'Psychological', slug: 'psychological' },
  { name: 'Reincarnation', slug: 'reincarnation' },
  { name: 'Romance', slug: 'romance' },
  { name: 'School Life', slug: 'school-life' },
  { name: 'Sci-Fi', slug: 'sci-fi' },
  { name: 'Seinen', slug: 'seinen' },
  { name: 'Shoujo', slug: 'shoujo' },
  { name: 'Shounen', slug: 'shounen' },
  { name: 'Slice of Life', slug: 'slice-of-life' },
  { name: 'Sports', slug: 'sports' },
  { name: 'Supernatural', slug: 'supernatural' },
  { name: 'Tragedy', slug: 'tragedy' },
];

export async function getComicsGenres(
  _signal?: AbortSignal,
): Promise<{ name: string; slug: string }[]> {
  return COMICS_GENRES;
}

export function inferComicDetailUrlSync(rawUrl: string): string | null {
  const url = (rawUrl || '').trim();
  if (!url) return null;

  if (url.startsWith('voratoon://') || url.startsWith('voratoon:/') || url.includes('voratoon')) {
    if (url.startsWith('voratoon://detail')) return url;
    const mSeriesChapter = url.match(/\/series\/([^/?#]+)\/chapter(?:\/|$)/i);
    if (mSeriesChapter?.[1]) {
      return `voratoon://detail/series/${mSeriesChapter[1]}`;
    }
    const mSeriesRoot = url.match(/\/series\/([^/?#]+)\/?$/i);
    if (mSeriesRoot?.[1]) {
      return `voratoon://detail/series/${mSeriesRoot[1]}`;
    }
    return null;
  }

  if (url.includes('mynimeku')) {
    const clean = url.split(/[?#]/)[0];
    const mChapter = clean.match(/^(https?:\/\/[^/]+\/komik\/[^/?#]+)\/chapter(?:\/|$)/i);
    if (mChapter?.[1]) {
      return `${mChapter[1]}/`;
    }
    if (/\/komik\/[^/?#]+\/?$/i.test(clean) && !/\/komik\/page\/?$/i.test(clean)) {
      return clean.endsWith('/') ? clean : `${clean}/`;
    }
    return null;
  }

  if (url.includes('softkomik') && url.includes('/chapter/')) {
    return url.split('/chapter/')[0];
  }

  if (url.startsWith('shinigami://detail/')) return url;
  if (url.startsWith('komikindo://detail/')) return url;
  if (url.startsWith('luvyaa://detail/')) return url;

  if (url.includes('komiku') && !url.includes('komikindo')) {
    const cleanPath = url.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
    const segs = cleanPath.split('/').filter(Boolean);
    if (
      segs.length === 2 &&
      segs[0].toLowerCase() === 'manga' &&
      !['page', 'hot', 'genre', 'genres', 'populer'].includes(segs[1].toLowerCase())
    ) {
      return url;
    }
    return null;
  }

  if (
    (url.includes('komikindo') || url.includes('bacakomik') || url.includes('fruatre.my.id')) &&
    !url.startsWith('komikindo://')
  ) {
    const clean = url.split(/[?#]/)[0];
    const isChap =
      clean.includes('-chapter-') ||
      clean.includes('-chapte-') ||
      clean.includes('/chapter/') ||
      url.includes('page=chapter') ||
      url.includes('/api/manga/bacakomik-chapter') ||
      /-(?:chapter|ch)[-_]?\d+/i.test(clean);
    if (!isChap && (clean.includes('/komik/') || url.includes('page=manga'))) {
      if (url.includes('komikindo')) {
        const cleanPath = clean.replace(/^https?:\/\/[^/]+/i, '');
        const segs = cleanPath.split('/').filter(Boolean);
        if (
          segs.length === 2 &&
          segs[0].toLowerCase() === 'komik' &&
          !['page', 'hot', 'popular', 'genre', 'genres', 'daftar-komik'].includes(
            segs[1].toLowerCase(),
          )
        ) {
          return `komikindo://detail/${segs[1]}`;
        }
        return null;
      }
      return url;
    }
  }

  return null;
}

function cleanComicSearchTitle(rawTitle?: string): string {
  if (!rawTitle) return '';
  return rawTitle
    .replace(/^Baca\s+/i, '')
    .replace(/^Komik\s+/i, '')
    .replace(/\s*(?:[-–|:]?\s*)(?:Chapter|Ch\.?|Bab|Ep\.?|Episode)\s*\d+.*$/i, '')
    .replace(/\s+Bahasa Indonesia$/i, '')
    .replace(/\s+Sub Indo$/i, '')
    .trim();
}

export async function resolveComicDetailUrl(
  url: string,
  title?: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const cleanUrl = (url || '').trim();
  if (!cleanUrl) return null;

  const syncResolved = inferComicDetailUrlSync(cleanUrl);
  if (syncResolved) return syncResolved;

  let resolved: string | null = null;
  const searchers: Array<(q: string) => Promise<Array<{ title: string; detailUrl: string }>>> = [];
  let directFetcher: (() => Promise<string | null>) | null = null;

  if (cleanUrl.startsWith('shinigami://')) {
    searchers.push(q => shinigami.getComicsSearch(q, 1, signal));
    directFetcher = () => shinigami.getShinigamiDetailUrlFromChapter(cleanUrl, signal);
  } else if (cleanUrl.startsWith('komikindo://') || cleanUrl.includes('komikindo')) {
    searchers.push(q => komikindo.getComicsSearch(q, signal));
    directFetcher = () => komikindo.getKomikindoDetailUrlFromChapter(cleanUrl, signal);
  } else if (cleanUrl.startsWith('luvyaa://')) {
    searchers.push(q => luvyaa.getComicsSearch(q, 1, signal));
    directFetcher = () => luvyaa.getLuvyaaDetailUrlFromChapter(cleanUrl, signal);
  } else if (
    cleanUrl.startsWith('voratoon://') ||
    cleanUrl.startsWith('voratoon:/') ||
    cleanUrl.includes('voratoon')
  ) {
    searchers.push(async q => {
      const list = await voratoon.getComicsSearch(q, 1, signal);
      return list.map(r => ({
        title: r.title,
        detailUrl: r.link.startsWith('voratoon://') ? r.link : 'voratoon://detail' + r.link,
      }));
    });
    directFetcher = () => voratoon.getVoratoonDetailUrlFromChapter(cleanUrl, signal);
  } else if (
    cleanUrl.includes('bacakomik') ||
    cleanUrl.includes('page=chapter') ||
    cleanUrl.includes('fruatre.my.id')
  ) {
    searchers.push(q => bacakomik.bacakomikSearch(q, signal));
    directFetcher = () => bacakomik.getBacakomikDetailUrlFromChapter(cleanUrl, signal);
  } else if (cleanUrl.includes('mynimeku')) {
    searchers.push(q => mynimeku.mynimekuSearch(q, signal));
    directFetcher = () => mynimeku.getMynimekuDetailUrlFromChapter(cleanUrl, signal);
  } else if (cleanUrl.includes('komiku')) {
    searchers.push(q => comics2.komikuSearch(q, signal));
    directFetcher = () => comics2.getKomikuDetailUrlFromChapter(cleanUrl, signal);
  }

  if (directFetcher) {
    try {
      resolved = await directFetcher();
    } catch (err: any) {
      if (signal?.aborted || err?.message === 'Silahkan selesaikan captcha') {
        throw err;
      }
    }
  }

  if (resolved && resolved !== cleanUrl) {
    return resolved;
  }
  if (signal?.aborted) return null;

  const cleanedTitle = cleanComicSearchTitle(title);
  if (cleanedTitle.length >= 2) {
    searchers.push(
      q => comicsSearch(q, signal),
      q => comics2.komikuSearch(q, signal),
    );
    const targetNorm = cleanedTitle.toLowerCase();
    for (const runSearch of searchers) {
      if (signal?.aborted) return null;
      try {
        const items = await runSearch(cleanedTitle);
        if (!Array.isArray(items) || items.length === 0) continue;
        const exact = items.find(
          it => it.title?.trim().toLowerCase() === targetNorm && it.detailUrl,
        );
        const picked = exact || items.find(it => Boolean(it.detailUrl));
        if (picked?.detailUrl && picked.detailUrl !== cleanUrl) {
          return picked.detailUrl;
        }
      } catch (err: any) {
        if (signal?.aborted || err?.message === 'Silahkan selesaikan captcha') {
          throw err;
        }
      }
    }
  }

  return null;
}
