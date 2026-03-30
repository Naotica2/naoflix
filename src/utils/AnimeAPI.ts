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
import sankaAnimeApi from './sankaAnimeApi';
import {
  BASE,
  fetchStreamingResolution,
  fromUrl,
  jadwalAnime,
  listAnime,
  newAnime,
  searchAnime,
} from './scrapers/animeSeries';

class AnimeAPI {
  private static base_url = 'https://aniflix.pirles.ix.tc/v5/';

  static async home(signal?: AbortSignal): Promise<EpisodeBaruHome> {
    return await sankaAnimeApi.home(signal);
  }

  static async newAnime(
    page: number | undefined = 1,
    signal?: AbortSignal,
  ): Promise<NewAnimeList[]> {
    if (page === 1 || page === undefined) {
      return (await sankaAnimeApi.home(signal)).newAnime;
    }
    return await sankaAnimeApi.newAnime(page, signal);
  }

  static async search(query: string, signal?: AbortSignal): Promise<SearchAnime> {
    return await sankaAnimeApi.search(query, signal);
  }

  static async fromUrl(
    link: string,
    resolution?: string,
    skipAutoRes?: boolean,
    detailOnly?: boolean,
    signal?: AbortSignal,
  ): Promise<fromUrlJSON | 'Unsupported'> {
    if (link.startsWith('sanka://detail/')) {
      const id = link.split('/').pop()!;
      return await sankaAnimeApi.detail(id, signal);
    }
    if (link.startsWith('sanka://episode/')) {
      const id = link.split('/').pop()!;
      return await sankaAnimeApi.streaming(id, signal);
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
        ToastAndroid.show('Silahkan selesaikan captcha', ToastAndroid.SHORT);
        throw e;
      } else if (
        e.message !== 'Network Error' ||
        e.name !== 'AbortError' ||
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
    // const data = await fetch(
    //   this.base_url +
    //     'listAnime',
    //     {
    //       signal,
    //       headers: {
    //         'User-Agent': deviceUserAgent,
    //       }
    //     }
    // ).then(a => a.json()) as listAnimeTypeList[];
    // return data;
    return await listAnime(signal, streamingCallback);
  }

  static async reqResolution(
    requestData: string,
    reqNonceAction: string,
    reqResolutionWithNonceAction: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    if (requestData.startsWith('sanka-server:')) {
      return await sankaAnimeApi.getResolution(requestData.replace('sanka-server:', ''), signal);
    }
    return await fetchStreamingResolution(
      requestData,
      reqNonceAction,
      reqResolutionWithNonceAction,
      undefined,
      signal,
    );
  }
}

type fromUrlJSON = AniStreaming | AniDetail;

export default AnimeAPI;
