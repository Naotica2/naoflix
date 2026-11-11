import { ToastAndroid } from 'react-native';
import {
  AniDetail,
  AniStreaming,
  EpisodeBaruHome,
  listAnimeTypeList,
  NewAnimeList,
  SearchAnime,
} from '../types/anime';
import { tSync } from '../misc/LanguageContext';
import { setWebViewOpen } from './CFBypass';
import deviceUserAgent from './deviceUserAgent';
import * as animeindo from './scrapers/animeindo';
import * as nimegami from './scrapers/nimegami';
import {
  BASE,
  fetchStreamingResolution,
  fromUrl,
  jadwalAnime,
  listAnime,
  newAnime,
  searchAnime,
} from './scrapers/animeSeries';
import { getSourcePreferences, isSourceActive, getActiveAnimeSource } from './sourcePreferences';

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

const WEEKDAYS_ID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

function normalizeDay(day: string): string {
  const d = day.trim().toLowerCase();
  if (d === 'monday' || d === 'senin' || d === 'mon' || d === 'sen') return 'Senin';
  if (d === 'tuesday' || d === 'selasa' || d === 'tue' || d === 'sel') return 'Selasa';
  if (d === 'wednesday' || d === 'rabu' || d === 'wed' || d === 'rab') return 'Rabu';
  if (d === 'thursday' || d === 'kamis' || d === 'thu' || d === 'kam') return 'Kamis';
  if (d === 'friday' || d === 'jumat' || d === 'fri' || d === 'jum' || d === "jum'at") return 'Jumat';
  if (d === 'saturday' || d === 'sabtu' || d === 'sat' || d === 'sab') return 'Sabtu';
  if (d === 'sunday' || d === 'minggu' || d === 'sun' || d === 'min') return 'Minggu';
  return day;
}

function mergeJadwal(raw: Record<string, any[]>, target: Record<string, any[]>) {
  const seenPerDay = new Map<string, Set<string>>();
  for (const day in raw) {
    const normalized = normalizeDay(day);
    if (!target[normalized]) target[normalized] = [];
    if (!seenPerDay.has(normalized)) {
      seenPerDay.set(
        normalized,
        new Set(target[normalized].map(it => (it.link || it.title || '').toLowerCase())),
      );
    }
    const seen = seenPerDay.get(normalized)!;
    for (const item of raw[day] || []) {
      const key = (item?.link || item?.title || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      target[normalized].push(item);
    }
  }
  for (const day of WEEKDAYS_ID) {
    if (!target[day]) target[day] = [];
  }
}

class AnimeAPI {
  private static base_url = 'https://aniflix.pirles.ix.tc/v5/';

  static async home(signal?: AbortSignal): Promise<EpisodeBaruHome> {
    const source = await getActiveAnimeSource();
    if (source === 'nimegami') {
      return await withTimeout(nimegami.home(signal).catch(() => ({ newAnime: [], jadwalAnime: {} })), 8000, { newAnime: [], jadwalAnime: {} });
    }
    return await withTimeout(animeindo.home(signal).catch(() => ({ newAnime: [], jadwalAnime: {} })), 8000, { newAnime: [], jadwalAnime: {} });
  }

  static async newAnime(
    page: number | undefined = 1,
    signal?: AbortSignal,
  ): Promise<NewAnimeList[]> {
    const source = await getActiveAnimeSource();
    if (source === 'nimegami') {
      return await withTimeout(nimegami.latestAnime(page || 1, signal).catch(() => []), 8000, []);
    }
    return await withTimeout(animeindo.latestAnime(page || 1, signal).catch(() => []), 8000, []);
  }

  static async getAnimeByGenre(
    genre: string,
    page: number = 1,
    signal?: AbortSignal,
  ): Promise<NewAnimeList[]> {
    const source = await getActiveAnimeSource();
    if (source === 'nimegami') {
      return await withTimeout(nimegami.getAnimeByGenre(genre, page, signal).catch(() => []), 8000, []);
    }
    return await withTimeout(animeindo.getAnimeByGenre(genre, page, signal).catch(() => []), 8000, []);
  }

  static async getAllGenres(signal?: AbortSignal): Promise<{ name: string; slug: string }[]> {
    const source = await getActiveAnimeSource();
    if (source === 'nimegami') {
      const genres = await nimegami.getAllGenres(signal).catch(() => []);
      if (genres.length > 0) return genres;
    }
    return await animeindo.getOtakudesuGenres(signal);
  }

  static async search(query: string, signal?: AbortSignal): Promise<SearchAnime> {
    const source = await getActiveAnimeSource();
    if (source === 'nimegami') {
      return await withTimeout(nimegami.search(query, signal).catch(() => ({ result: [] })), 8000, { result: [] });
    }
    return await withTimeout(animeindo.search(query, signal).catch(() => ({ result: [] })), 8000, { result: [] });
  }

  static async searchMovies(page: number = 1, signal?: AbortSignal): Promise<SearchAnime> {
    const source = await getActiveAnimeSource();
    if (source === 'nimegami') {
      return await withTimeout(nimegami.searchMovies(page, signal).catch(() => ({ result: [] })), 8000, { result: [] });
    }
    return await withTimeout(animeindo.searchMovies(page, signal).catch(() => ({ result: [] })), 8000, { result: [] });
  }

  static async fromUrl(
    link: string,
    resolution?: string,
    skipAutoRes?: boolean,
    detailOnly?: boolean,
    signal?: AbortSignal,
  ): Promise<fromUrlJSON | 'Unsupported'> {
    if (link.startsWith('nimegami://') || link.includes('nimegami.id')) {
      if (
        !detailOnly &&
        (link.includes('/streaming/') ||
          link.includes('nimegami://stream/') ||
          link.includes('nimegami://ep/') ||
          link.includes('#episode_'))
      ) {
        return await nimegami.streaming(link, signal, resolution);
      }
      return await nimegami.detail(link, signal);
    }

    if (link.includes('otakudesu') || link.includes('anime-indo')) {
      if (link.includes('/episode/') || link.includes('-episode-')) {
        return await animeindo.streaming(link, signal, resolution);
      }
      return await animeindo.detail(link, signal);
    }

    if (link.startsWith('sanka://detail/')) {
      const id = link.split('/').pop()!;
      const slug = decodeURIComponent(id).split('|').pop()!;
      return await animeindo.detail(`https://${animeindo.DOMAIN}/anime/${slug}/`, signal);
    }
    if (link.startsWith('sanka://episode/')) {
      const id = link.split('/').pop()!;
      const slug = decodeURIComponent(id).split('|').pop()!;
      return await animeindo.streaming(`https://${animeindo.DOMAIN}/${slug}/`, signal, resolution);
    }

    try {
      const statusCode = await fetch(link, {
        headers: {
          'User-Agent': deviceUserAgent,
        },
        method: 'HEAD',
        signal,
      }).catch(err => {
        if (err instanceof Error && err.message.includes('Aborted')) throw new Error('canceled');
        else return err as Error;
      });
      if (statusCode instanceof Error) {
        throw statusCode;
      }
      if (statusCode.status === 403) {
        setWebViewOpen.openWebViewCF(true, link);
        throw new Error('Silahkan selesaikan captcha');
      }
      return (await fromUrl(link, resolution, skipAutoRes, detailOnly, signal)) as fromUrlJSON;
    } catch (e: any) {
      if (e.message === 'Silahkan selesaikan captcha') {
        ToastAndroid.show(tSync('search.solveCaptcha'), ToastAndroid.SHORT);
        throw e;
      } else if (
        e.message !== 'Network Error' &&
        e.name !== 'AbortError' &&
        e.message !== 'canceled'
      ) {
        throw e;
      }
      return 'Unsupported';
    }
  }

  static async listAnime(
    signal?: AbortSignal,
    streamingCallback?: (data: listAnimeTypeList[]) => void,
  ): Promise<listAnimeTypeList[]> {
    const source = await getActiveAnimeSource();
    if (source === 'nimegami') {
      return await withTimeout(nimegami.listAnime(signal, streamingCallback).catch(() => []), 8000, []);
    }
    return await withTimeout(animeindo.animeList(signal, streamingCallback).catch(() => []), 8000, []);
  }

  static async reqResolution(
    requestData: string,
    reqNonceAction: string,
    reqResolutionWithNonceAction: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    if (requestData.startsWith('nimegami::') || requestData.startsWith('nimegami_rsc::')) {
      return await nimegami.getResolution(requestData, signal);
    }
    if (requestData.startsWith('direct_url::')) {
      return requestData.replace('direct_url::', '');
    }
    if (requestData.startsWith('embed_url::')) {
      return requestData.replace('embed_url::', '');
    }

    if (requestData.startsWith('otakudesu::')) {
      return await animeindo.getResolution(requestData, signal);
    }

    if (requestData.startsWith('animeindo::')) {
      return await animeindo.getResolution(requestData, signal);
    }

    if (requestData.startsWith('sanka-server:')) {
      const parts = requestData.replace('sanka-server:', '').split('::');
      const serverPageUrl = parts.slice(1).join('::');
      return await animeindo.getResolution(`otakudesu::${serverPageUrl}`, signal);
    }

    return await fetchStreamingResolution(
      requestData,
      reqNonceAction,
      reqResolutionWithNonceAction,
      undefined,
      signal,
    );
  }

  static async jadwalAnime(signal?: AbortSignal): Promise<Record<string, any[]>> {
    const source = await getActiveAnimeSource();
    let raw: Record<string, any[]> = {};
    if (source === 'nimegami') {
      raw = await withTimeout(nimegami.jadwalAnime(signal).catch(() => ({})), 10000, {});
    } else {
      raw = await withTimeout(animeindo.jadwalAnime(signal).catch(() => ({})), 10000, {});
    }
    const mergedDict: Record<string, any[]> = {};
    mergeJadwal(raw, mergedDict);
    return mergedDict;
  }
}

type fromUrlJSON = AniStreaming | AniDetail;

export default AnimeAPI;
