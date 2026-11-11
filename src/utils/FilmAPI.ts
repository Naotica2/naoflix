import { getActiveFilmSource } from './sourcePreferences';
import * as lk21 from './scrapers/lk21';
import { FilmSearchItem, FilmSeason, FilmStream } from '../types/film';

export class FilmAPI {
  /** Search films by keyword on the active source. */
  static async search(
    keyword: string,
    page: number = 0,
    signal?: AbortSignal,
  ): Promise<{ items: FilmSearchItem[]; totalCount: number; hasMore: boolean }> {
    const source = await getActiveFilmSource();
    
    if (source === 'lk21') {
      return lk21.searchFilm(keyword, page, signal);
    }

    return { items: [], totalCount: 0, hasMore: false };
  }

  /** Fetch trending films on the active source. */
  static async getTrending(
    page: number = 0,
    signal?: AbortSignal,
  ): Promise<FilmSearchItem[]> {
    const source = await getActiveFilmSource();

    if (source === 'lk21') {
      try {
        return await lk21.getTrending(page, signal);
      } catch (err) {
        console.warn('FilmAPI: lk21 getTrending error', err);
      }
    }

    return [];
  }

  /** Fetch stream/iframe URLs; requires the item's origin `source`. */
  static async getPlayStreams(
    source: string,
    subjectId: string,
    detailPath: string,
    season?: number,
    episode?: number,
    signal?: AbortSignal,
  ): Promise<FilmStream[]> {
    if (source === 'lk21') {
      return lk21.getPlayStreams(subjectId, detailPath, season, episode, signal);
    }

    return [];
  }

  /** Fetch season metadata for TV series. */
  static async getSeasonInfo(
    source: string,
    subjectId: string,
    detailPath: string,
    signal?: AbortSignal,
  ): Promise<FilmSeason[]> {
    if (source === 'lk21') {
      return lk21.getSeasonInfo(subjectId, detailPath, signal);
    }

    return [];
  }

  /** Fetch film details (e.g., synopsis when omitted from search). */
  static async getFilmDetails(
    source: string,
    subjectId: string,
    detailPath: string,
    signal?: AbortSignal,
  ): Promise<{ description: string } | null> {
    if (source === 'lk21') {
      return lk21.getFilmDetails(subjectId, detailPath, signal);
    }
    return null;
  }
}
