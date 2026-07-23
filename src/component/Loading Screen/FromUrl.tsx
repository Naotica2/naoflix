import { StackActions, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useRef } from 'react';
import { Text, ToastAndroid, View } from 'react-native';
import randomTipsArray from '../../assets/loadingTips.json';
import useGlobalStyles from '../../assets/style';
import { RootStackNavigator } from '../../types/navigation';
import watchLaterJSON from '../../types/watchLaterJSON';
import AnimeAPI from '../../utils/AnimeAPI';
import setHistory from '../../utils/historyControl';
import controlWatchLater from '../../utils/watchLaterControl';

import URL from 'url';
import { DatabaseManager } from '../../utils/DatabaseManager';
import DialogManager from '../../utils/dialogManager';
import { generateUrlWithLatestDomain } from '../../utils/domainChanger';
import { replaceLast } from '../../utils/replaceLast';
import {
  ComicsDetail,
  getComicsDetailFromUrl,
  getComicsReading,
} from '../../utils/scrapers/comicsv2';
import { getNovelDetail, getNovelReading } from '../../utils/scrapers/meionovel';
import {
  getKomikuDetailFromUrl,
  getKomikuReading,
  KomikuDetail,
} from '../../utils/scrapers/komiku';
import { getPlayStreams, searchMoviebox } from '../../utils/scrapers/moviebox';
import LoadingIndicator from '../misc/LoadingIndicator';

type Props = NativeStackScreenProps<RootStackNavigator, 'FromUrl'>;

function FromUrl(props: Props) {
  const globalStyles = useGlobalStyles();

  const randomTips = useRef<string>(
    // eslint-disable-next-line no-bitwise
    randomTipsArray[~~(Math.random() * randomTipsArray.length)],
  ).current;


  const handleError = useCallback(
    (err: Error) => {
      if (err.message === 'Silahkan selesaikan captcha') {
        props.navigation.goBack();
        return;
      }
      if (err.message === 'canceled' || err.message === 'Aborted') {
        return;
      }
      const errMessage =
        err.message === 'Network Error' || err.message === 'Network request failed'
          ? 'Permintaan gagal: Jaringan Error / Akses Diblokir ISP\\nPastikan internet stabil atau coba gunakan VPN / Private DNS (seperti 1.1.1.1)'
          : 'Error tidak diketahui: ' + err.message;
      DialogManager.alert('Error', errMessage);
      props.navigation.goBack();
    },
    [props.navigation],
  );
  useFocusEffect(
    useCallback(() => {
      props.navigation.setOptions({ headerTitle: props.route.params.title });
      const abort: AbortController = new AbortController();
      let link: string;
      if (props.route.params.link.startsWith('shinigami://')) {
        link = props.route.params.link;
      } else {
        try {
          // fix invalid url crash
          link = generateUrlWithLatestDomain(props.route.params.link);
        } catch {
          link = props.route.params.link;
        }
      }
      const resolution = props.route.params.historyData?.resolution; // only if FromUrl is called from history component
      if (link.includes('nanimex')) {
        props.navigation.goBack();
        DialogManager.alert(
          'Perhatian!',
          'Dikarenakan data yang digunakan berbeda, history lama tidak didukung, sehingga sebagai solusi, kamu harus mencari anime ini secara manual di menu pencarian dan pilih episode yang sesuai.',
        );
        return;
      }
      // Handle film:// links from history/watch later (moviebox films)
      if (link.startsWith('film://')) {
        const filmRaw = link.replace('film://', '');
        // Parse query params from film link (e.g., film://subjectId/path?se=1&ep=2)
        const [filmPath, filmQuery] = filmRaw.split('?');
        const filmParts = filmPath.split('/');
        const subjectId = filmParts[0];
        const detailPath = filmParts.slice(1).join('/');

        // Extract season and episode from link query params first, then fallback to title
        let se: number | undefined = undefined;
        let ep: number | undefined = undefined;
        let type: 'movie' | 'tv' = 'movie';

        if (filmQuery) {
          const params = new URLSearchParams(filmQuery);
          const seParam = params.get('se');
          const epParam = params.get('ep');
          if (seParam) se = parseInt(seParam);
          if (epParam) ep = parseInt(epParam);
          if (se != null && ep != null) type = 'tv';
        }
        // Fallback: parse from title "Show S1E2"
        if (se == null || ep == null) {
          const titleMatch = props.route.params.title?.match(/ S(\d+)E(\d+)$/);
          if (titleMatch) {
            se = parseInt(titleMatch[1]);
            ep = parseInt(titleMatch[2]);
            type = 'tv';
          }
        }

        getPlayStreams(subjectId, detailPath, se, ep, abort.signal)
          .then(streams => {
            if (abort.signal.aborted || props.navigation.getState().routes.length === 1) return;
            if (streams.length === 0) {
              DialogManager.alert('Error', 'Video tidak tersedia untuk film ini.');
              props.navigation.goBack();
              return;
            }
            props.navigation.dispatch(
              StackActions.replace('FilmPlayer', {
                streams,
                title: props.route.params.title || 'Film',
                subjectId,
                detailPath,
                type,
                season: se,
                episode: ep,
                poster: props.route.params.thumbnailUrl,
                historyData: props.route.params.historyData,
              }),
            );
          })
          .catch(handleError);
        return () => { abort.abort(); };
      }
      if (props.route.params.type === 'anime' || props.route.params.type === 'movie' || props.route.params.type === undefined) {
        AnimeAPI.fromUrl(link, resolution, !!resolution, undefined, abort.signal)
          .then(async result => {
            if (result === 'Unsupported') {
              DialogManager.alert(
                'Tidak didukung!',
                'Anime yang kamu tuju tidak memiliki data yang didukung!',
              );
              props.navigation.goBack();
              return;
            }
            try {
              if (result.type === 'animeDetail') {
                if (result.genres.includes('')) {
                  DialogManager.alert(
                    'Perhatian!',
                    'Anime ini mengandung genre ecchi. Mohon bijak dalam menonton.',
                  );
                }
                if (abort.signal.aborted || props.navigation.getState().routes.length === 1) return;
                props.navigation.dispatch(
                  StackActions.replace('AnimeDetail', {
                    data: result,
                    link: link,
                  }),
                );
              } else if (result.type === 'animeStreaming') {
                if (abort.signal.aborted || props.navigation.getState().routes.length === 1) return;
                props.navigation.dispatch(
                  StackActions.replace('Video', {
                    data: result,
                    link: link,
                    historyData: props.route.params.historyData,
                  }),
                );

                // History
                setHistory(result, link, false, props.route.params.historyData);

                const episodeIndex = result.title.toLowerCase().indexOf(' episode');
                const title =
                  episodeIndex >= 0 ? result.title.slice(0, episodeIndex) : result.title;
                const watchLater: watchLaterJSON[] = JSON.parse(
                  (await DatabaseManager.get('watchLater'))!,
                );
                const normalizeWatchLaterTitle = (str: string) => {
                  let resultString = str.split('(Episode')[0].trim();
                  if (resultString.endsWith('BD')) {
                    return replaceLast(resultString, 'BD', '');
                  }
                  return resultString;
                };
                const watchLaterIndex = watchLater.findIndex(
                  z =>
                    (z.link === result.episodeData.animeDetail ||
                      normalizeWatchLaterTitle(z.title.trim()) === title.trim()) &&
                    !z.isMovie &&
                    !z.isComics,
                );
                if (watchLaterIndex >= 0) {
                  controlWatchLater('delete', watchLaterIndex);
                  ToastAndroid.show(
                    `${title} dihapus dari daftar tonton nanti`,
                    ToastAndroid.SHORT,
                  );
                }
              }
            } catch (e: any) {
              DialogManager.alert('Error', e.message);
              props.navigation.goBack();
            }
          })
          .catch(handleError);
      } else if (props.route.params.type === 'novel') {
        const isChapter = link.includes('/chapter-') || link.includes('-chapter-');
        if (!isChapter) {
          getNovelDetail(link, abort.signal)
            .then(result => {
              if (abort.signal.aborted || props.navigation.getState().routes.length === 1) return;
              props.navigation.dispatch(
                StackActions.replace('NovelDetail', {
                  data: result,
                  link: link,
                }),
              );
            })
            .catch(handleError);
        } else {
          getNovelReading(link, abort.signal)
            .then(result => {
              if (abort.signal.aborted || props.navigation.getState().routes.length === 1) return;
              props.navigation.dispatch(
                StackActions.replace('NovelReading', {
                  data: result,
                  link: link,
                  historyData: props.route.params.historyData,
                }),
              );
            })
            .catch(handleError);
        }
      } else {
        const isKomiku = link.includes('komiku');
        const isBacakomik = link.includes('page=manga') || link.includes('page=chapter') || link.includes('fruatre.my.id');
        const isKomikindo = link.includes('komikindo') || link.includes('bacakomik') || isBacakomik;
        const isKomikcast = link.startsWith('komikcast://');
        const isSoftkomik = link.includes('softkomik');
        const isMynimeku = link.includes('mynimeku');
        const isMangadex = link.startsWith('/title/') || link.startsWith('/chapter/');
        const isShinigami = link.startsWith('shinigami://');
        const isSoftkomikGoToDetail = isSoftkomik && !link.includes('/chapter/');
        const isKomikuGoToDetail = isKomiku && link.includes('/manga/');
        const isKomikindoGoToDetail =
          isKomikindo && !(link.includes('-chapter-') || link.includes('-chapte-') || link.includes('page=chapter') || link.includes('/api/manga/bacakomik-chapter'));
        const isMynimekuGoToDetail = isMynimeku && link.includes('/komik/');
        const isMangadexGoToDetail = isMangadex && link.startsWith('/title/');
        const isShinigamiGoToDetail = isShinigami && link.startsWith('shinigami://detail/');
        const isKomikcastGoToDetail = isKomikcast && link.startsWith('komikcast://detail/');
        const goToDetail = isKomikuGoToDetail || isKomikindoGoToDetail || isSoftkomikGoToDetail || isMynimekuGoToDetail || isMangadexGoToDetail || isShinigamiGoToDetail || isKomikcastGoToDetail;
        if (goToDetail) {
          const fetchComicsPromise = (
            isKomikindo || link.includes('softkomik') || isMynimeku || isMangadex || isShinigami || isKomikcast
              ? getComicsDetailFromUrl(link, abort.signal)
              : getKomikuDetailFromUrl(link, abort.signal)
          ) as Promise<ComicsDetail | KomikuDetail>;
          fetchComicsPromise
            .then(result => {
              if (abort.signal.aborted || props.navigation.getState().routes.length === 1) return;
              if (result.genres.includes('Ecchi')) {
                DialogManager.alert(
                  'Perhatian!',
                  'Komik ini mengandung genre ecchi. Mohon bijak dalam membaca.',
                );
              }
              props.navigation.dispatch(
                StackActions.replace('ComicsDetail', {
                  data: result,
                  link: link,
                }),
              );
            })
            .catch(handleError);
        } else {
          (isKomikindo || link.includes('softkomik') || isMynimeku || isMangadex || isShinigami || isKomikcast
            ? getComicsReading
            : getKomikuReading)(link, abort.signal)
            .then(async result => {
              if (abort.signal.aborted || props.navigation.getState().routes.length === 1) return;
              props.navigation.dispatch(
                StackActions.replace('ComicsReading', {
                  data: result,
                  historyData: props.route.params.historyData,
                  link: link,
                  title: props.route.params.title,
                  thumbnailUrl: props.route.params.thumbnailUrl,
                }),
              );
              setHistory(result, link, false, { ...props.route.params.historyData, thumbnailUrl: props.route.params.thumbnailUrl }, false, true, props.route.params.title);
              const chapterIndex = result.title.toLowerCase().indexOf(' chapter');
              const title = chapterIndex >= 0 ? result.title.slice(0, chapterIndex) : result.title;
              const watchLater: watchLaterJSON[] = JSON.parse(
                (await DatabaseManager.get('watchLater'))!,
              );
              const watchLaterIndex = watchLater.findIndex(
                z => z.title.trim() === title.trim() && z.isComics === true,
              );
              if (watchLaterIndex >= 0) {
                controlWatchLater('delete', watchLaterIndex);
                ToastAndroid.show(`${title} dihapus dari daftar tonton nanti`, ToastAndroid.SHORT);
              }
            })
            .catch(handleError);
        }
      }
      return () => {
        abort.abort();
      };
    }, [
      handleError,
      props.navigation,
      props.route.params.historyData,
      props.route.params.title,
      props.route.params.type,
      props.route.params.link,
    ]),
  );

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          flex: 1,
          paddingHorizontal: 24,
        }}>
        <LoadingIndicator size={15} />
        <Text style={[globalStyles.text, { fontWeight: 'bold', marginBottom: 20 }]}>
          Mengambil data... Mohon tunggu sebentar!
        </Text>
      </View>
      <View style={{ alignItems: 'center' }}>
        <View style={{ position: 'absolute', bottom: 10 }}>
          <Text style={[{ textAlign: 'center' }, globalStyles.text]}>{randomTips}</Text>
        </View>
      </View>
    </View>
  );
}

export default FromUrl;
