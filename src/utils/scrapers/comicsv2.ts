import * as comics2 from './komiku';
import * as mynimeku from './mynimeku';
import * as bacakomik from './bacakomik';
import * as mangadex from './mangadex';
import * as shinigami from './shinigami';
import * as komikcast from './komikcast';
import { getSourcePreferences, isSourceActive } from '../sourcePreferences';

export type LatestComicsRelease = comics2.LatestKomikuRelease;
export type ComicsDetail = comics2.KomikuDetail;
export type ComicsReading = comics2.KomikuReading;
export type ComicsSearch = comics2.KomikuSearch & { source: string };

async function getActiveComicSource(): Promise<'komiku' | 'mynimeku' | 'bacakomik' | 'mangadex' | 'shinigami' | 'komikcast'> {
  const prefs = await getSourcePreferences();
  if (isSourceActive(prefs, 'komiku')) return 'komiku';
  if (isSourceActive(prefs, 'bacakomik')) return 'bacakomik';
  if (isSourceActive(prefs, 'mynimeku')) return 'mynimeku';
  if (isSourceActive(prefs, 'mangadex')) return 'mangadex';
  if (isSourceActive(prefs, 'shinigami')) return 'shinigami';
  if (isSourceActive(prefs, 'komikcast')) return 'komikcast';
  return 'komiku'; // default fallback
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
  if (source === 'mangadex') {
    return await mangadex.getMangadexLatest(page, signal);
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
  if (source === 'komikcast') {
    return await komikcast.getLatestComicsReleases(page, signal);
  }
  return await comics2.getLatestKomikuReleases(page, signal);
}

export async function getPopularComicsReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const source = await getActiveComicSource();
  if (source === 'mynimeku') {
    const res = await mynimeku.getLatestMynimekuReleases(page + 1, signal);
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
  if (source === 'mangadex') {
    return await mangadex.getMangadexPopular(page, signal);
  }
  if (source === 'bacakomik') {
    return await bacakomik.getLatestBacakomikReleases(page + 1, signal);
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
  if (source === 'komikcast') {
    return await komikcast.getPopularComicsReleases(page, signal);
  }
  return await comics2.getLatestKomikuReleases(page + 1, signal);
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
  if (source === 'mangadex') {
    return await mangadex.getMangadexLatest(page, signal);
  }
  if (source === 'bacakomik') {
    return await bacakomik.getBacakomikByGenre(genre, page, signal);
  }
  if (source === 'shinigami') {
    return await shinigami.getComicsByGenre(genre, page, signal);
  }
  if (source === 'komikcast') {
    const data = await komikcast.getComicsSearchWithGenre(genre, page, signal);
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
  return await comics2.getKomikuByGenre(genre, page, signal);
}

export async function getComicsDetailFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<ComicsDetail> {
  if (url.startsWith('shinigami://')) {
    return await shinigami.getComicsDetail(url, signal);
  }
  if (url.startsWith('komikcast://')) {
    return await komikcast.getComicsDetail(url, signal);
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
  if (source === 'mangadex') {
    const res = await mangadex.getMangadexDetail(url, signal);
    return {
      title: res.title,
      indonesianTitle: '',
      type: 'Manga',
      author: '',
      status: res.status,
      minAge: '',
      concept: '',
      readingDirection: '',
      headerImageUrl: res.thumbnailUrl,
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
  if (source === 'komikcast') {
    return await komikcast.getComicsDetail(url, signal);
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
  if (url.startsWith('komikcast://')) {
    return await komikcast.getComicsReading(url, signal);
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
  if (source === 'mangadex') {
    const res = await mangadex.getMangadexReading(url, signal);
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
  if (source === 'komikcast') {
    return await komikcast.getComicsReading(url, signal);
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
  if (source === 'mangadex') {
    return await mangadex.mangadexSearch(query, signal);
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
  if (source === 'komikcast') {
    const searchRes = await komikcast.getComicsSearch(query, signal);
    return searchRes as unknown as ComicsSearch[];
  }
  const res = await comics2.komikuSearch(query, signal);
  return res.map(r => ({ ...r, source: 'Komiku' }));
}
