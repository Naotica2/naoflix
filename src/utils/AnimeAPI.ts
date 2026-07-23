import { ToastAndroid } from 'react-native';
import {
  AniDetail,
  AniStreaming,
  EpisodeBaruHome,
  listAnimeTypeList,
  NewAnimeList,
  SearchAnime,
} from '../types/anime';
import { setWebViewOpen } from './CFBypass';
import deviceUserAgent from './deviceUserAgent';
import * as animeindo from './scrapers/animeindo';
import * as animelovers from './scrapers/animelovers';
import {
  BASE,
  fetchStreamingResolution,
  fromUrl,
  jadwalAnime,
  listAnime,
  newAnime,
  searchAnime,
} from './scrapers/animeSeries';
import { getSourcePreferences, isSourceActive } from './sourcePreferences';

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

/** Ordered list of all 7 days in Indonesian */
const WEEKDAYS_ID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

/**
 * Normalize day names from various formats (English, Indonesian, abbreviations)
 * to standard Indonesian full day names (Senin, Selasa, ..., Minggu).
 */
function normalizeDay(day: string): string {
  const d = day.trim().toLowerCase();
  // Monday / Senin / Mon / Sen
  if (d === 'monday' || d === 'senin' || d === 'mon' || d === 'sen') return 'Senin';
  // Tuesday / Selasa / Tue / Sel
  if (d === 'tuesday' || d === 'selasa' || d === 'tue' || d === 'sel') return 'Selasa';
  // Wednesday / Rabu / Wed / Rab
  if (d === 'wednesday' || d === 'rabu' || d === 'wed' || d === 'rab') return 'Rabu';
  // Thursday / Kamis / Thu / Kam
  if (d === 'thursday' || d === 'kamis' || d === 'thu' || d === 'kam') return 'Kamis';
  // Friday / Jumat / Fri / Jum
  if (d === 'friday' || d === 'jumat' || d === 'fri' || d === 'jum' || d === "jum'at") return 'Jumat';
  // Saturday / Sabtu / Sat / Sab
  if (d === 'saturday' || d === 'sabtu' || d === 'sat' || d === 'sab') return 'Sabtu';
  // Sunday / Minggu / Sun / Min
  if (d === 'sunday' || d === 'minggu' || d === 'sun' || d === 'min') return 'Minggu';
  // Fallback: return original
  return day;
}

/**
 * Merge a raw jadwal dict into a normalized one (all day keys standardized to Indonesian),
 * and ensure all 7 weekdays are present (empty array if no data).
 */
function mergeJadwal(raw: Record<string, any[]>, target: Record<string, any[]>) {
  for (const day in raw) {
    const normalized = normalizeDay(day);
    if (!target[normalized]) target[normalized] = [];
    target[normalized].push(...raw[day]);
  }
  // Ensure all 7 days exist
  for (const day of WEEKDAYS_ID) {
    if (!target[day]) target[day] = [];
  }
}

class AnimeAPI {
  private static base_url = 'https://aniflix.pirles.ix.tc/v5/';

  static async home(signal?: AbortSignal): Promise<EpisodeBaruHome> {
    const prefs = await getSourcePreferences();
    const promises: Promise<EpisodeBaruHome>[] = [];

    if (isSourceActive(prefs, 'animelovers')) {
      promises.push(withTimeout(animelovers.home(signal).catch(() => ({ newAnime: [], jadwalAnime: {} })), 8000, { newAnime: [], jadwalAnime: {} }));
    } else {
      if (isSourceActive(prefs, 'otakudesu')) promises.push(withTimeout(animeindo.home(signal).catch(() => ({ newAnime: [], jadwalAnime: {} })), 8000, { newAnime: [], jadwalAnime: {} }));
    }

    const homeDataList = await Promise.all(promises);
    const results: EpisodeBaruHome = { newAnime: [], jadwalAnime: {} };

    for (const homeData of homeDataList) {
      results.newAnime.push(...homeData.newAnime);
      mergeJadwal(homeData.jadwalAnime, results.jadwalAnime);
    }
    return results;
  }

  static async newAnime(
    page: number | undefined = 1,
    signal?: AbortSignal,
  ): Promise<NewAnimeList[]> {
    const prefs = await getSourcePreferences();
    const promises: Promise<NewAnimeList[]>[] = [];

    if (isSourceActive(prefs, 'animelovers')) {
      promises.push(withTimeout(animelovers.latestAnime(page || 1, signal).catch(() => []), 8000, []));
    } else {
      if (isSourceActive(prefs, 'otakudesu')) promises.push(withTimeout(animeindo.latestAnime(page || 1, signal).catch(() => []), 8000, []));
    }

    const results = await Promise.all(promises);
    return results.flat();
  }

  static async getAnimeByGenre(
    genre: string,
    page: number = 1,
    signal?: AbortSignal,
  ): Promise<NewAnimeList[]> {
    const prefs = await getSourcePreferences();
    const promises: Promise<NewAnimeList[]>[] = [];

    if (isSourceActive(prefs, 'animelovers')) {
      // Animelovers tak ada by genre, biarkan kosong atau tambah manual di masa depan
    } else {
      if (isSourceActive(prefs, 'otakudesu')) promises.push(withTimeout(animeindo.getAnimeByGenre(genre, page, signal).catch(() => []), 8000, []));
    }

    const results = await Promise.all(promises);
    return results.flat();
  }

  static async search(query: string, signal?: AbortSignal): Promise<SearchAnime> {
    const prefs = await getSourcePreferences();
    const promises: Promise<SearchAnime>[] = [];

    if (isSourceActive(prefs, 'animelovers')) {
      promises.push(withTimeout(animelovers.search(query, signal).catch(() => ({ result: [] })), 8000, { result: [] }));
    } else {
      if (isSourceActive(prefs, 'otakudesu')) promises.push(withTimeout(animeindo.search(query, signal).catch(() => ({ result: [] })), 8000, { result: [] }));
    }

    const resultsList = await Promise.all(promises);
    const mergedResults = resultsList.flatMap(r => r.result);
    return { result: mergedResults };
  }

  static async searchMovies(page: number = 1, signal?: AbortSignal): Promise<SearchAnime> {
    const prefs = await getSourcePreferences();
    const promises: Promise<SearchAnime>[] = [];

    if (isSourceActive(prefs, 'animelovers')) {
      // Animelovers tak ada fitur searchMovies (hanya query string)
    } else {
      if (isSourceActive(prefs, 'otakudesu')) promises.push(withTimeout(animeindo.searchMovies(page, signal).catch(() => ({ result: [] })), 8000, { result: [] }));
    }

    const resultsList = await Promise.all(promises);
    const mergedResults = resultsList.flatMap(r => r.result);
    return { result: mergedResults };
  }

  static async fromUrl(
    link: string,
    resolution?: string,
    skipAutoRes?: boolean,
    detailOnly?: boolean,
    signal?: AbortSignal,
  ): Promise<fromUrlJSON | 'Unsupported'> {
    // Otakudesu detail page: /anime/slug/
    if ((link.includes('otakudesu') || link.includes('anime-indo')) && link.includes('/anime/') && !link.includes('/episode/')) {
      return await animeindo.detail(link, signal);
    }

    // Otakudesu episode page: /episode/slug-episode-N/
    if ((link.includes('otakudesu') || link.includes('anime-indo')) && link.includes('/episode/')) {
      return await animeindo.streaming(link, signal);
    }

    // Legacy AnimeIndo episode page: /slug-episode-N/ (no /episode/ prefix)
    if (link.includes('anime-indo') && link.includes('-episode-')) {
      return await animeindo.streaming(link, signal);
    }



    // Animelovers links
    if (link.startsWith('al-detail-')) {
      return await animelovers.detail(link, signal);
    }
    if (link.startsWith('al-stream::')) {
      return await animelovers.streaming(link, signal);
    }

    // Sanka legacy links (from old watch later / history)
    if (link.startsWith('sanka://detail/')) {
      const id = link.split('/').pop()!;
      const slug = decodeURIComponent(id).split('|').pop()!;
      return await animeindo.detail(`https://${animeindo.DOMAIN}/anime/${slug}/`, signal);
    }
    if (link.startsWith('sanka://episode/')) {
      const id = link.split('/').pop()!;
      const slug = decodeURIComponent(id).split('|').pop()!;
      return await animeindo.streaming(`https://${animeindo.DOMAIN}/${slug}/`, signal);
    }

    // OtakuDesu links (legacy fallback)
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
        ToastAndroid.show('Silahkan selesaikan captcha', ToastAndroid.SHORT);
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
    const prefs = await getSourcePreferences();
    const promises: Promise<listAnimeTypeList[]>[] = [];

    if (isSourceActive(prefs, 'animelovers')) {
      // Tidak didukung di animelovers
    } else {
      if (isSourceActive(prefs, 'otakudesu')) promises.push(withTimeout(animeindo.animeList(signal, streamingCallback).catch(() => []), 8000, []));
    }

    const results = await Promise.all(promises);
    return results.flat();
  }

  static async reqResolution(
    requestData: string,
    reqNonceAction: string,
    reqResolutionWithNonceAction: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    // Direct URL return (Nimegami and other embedded sources)
    if (requestData.startsWith('direct_url::')) {
      return requestData.replace('direct_url::', '');
    }
    if (requestData.startsWith('embed_url::')) {
      return requestData.replace('embed_url::', '');
    }

    // Otakudesu resolution switching
    if (requestData.startsWith('otakudesu::')) {
      return await animeindo.getResolution(requestData, signal);
    }

    // Legacy AnimeIndo resolution switching
    if (requestData.startsWith('animeindo::')) {
      return await animeindo.getResolution(requestData, signal);
    }

    // Legacy Sanka resolution switching
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

  static async jadwalAnime(signal?: AbortSignal) {
    const prefs = await getSourcePreferences();
    const promises: Promise<any>[] = [];

    if (isSourceActive(prefs, 'animelovers')) {
      promises.push(withTimeout(animelovers.scheduleAnime(signal).catch(() => ({})), 8000, {}));
    } else {
      if (isSourceActive(prefs, 'otakudesu')) {
        await animeindo.fetchLatestAnimeIndoDomain(signal);
        promises.push(withTimeout(jadwalAnime(signal).catch(() => ({})), 8000, {}));
      }
    }

    const resultsList = await Promise.all(promises);
    // Merge jadwals with normalized day names and all 7 days present
    const mergedDict: Record<string, any[]> = {};
    for (const jadwal of resultsList) {
      mergeJadwal(jadwal, mergedDict);
    }

    return mergedDict;
  }
}

type fromUrlJSON = AniStreaming | AniDetail;

export default AnimeAPI;
