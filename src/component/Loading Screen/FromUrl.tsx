import { StackActions, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useRef } from 'react';
import { Text, ToastAndroid, View } from 'react-native';
import useGlobalStyles from '../../assets/style';
import { tSync, useLanguage } from '../../misc/LanguageContext';
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
  resolveComicDetailUrl,
} from '../../utils/scrapers/comicsv2';
import { getNovelDetail, getNovelReading } from '../../utils/scrapers/meionovel';
import {
  getKomikuDetailFromUrl,
  getKomikuReading,
  KomikuDetail,
} from '../../utils/scrapers/komiku';
import { FilmAPI } from '../../utils/FilmAPI';
import LoadingIndicator from '../misc/LoadingIndicator';

type Props = NativeStackScreenProps<RootStackNavigator, 'FromUrl'>;

function FromUrl(props: Props) {
  const globalStyles = useGlobalStyles();
  const { t } = useLanguage();

  const tipIndex = useRef<number>(Math.floor(Math.random() * 6)).current;
  const randomTips = t(`loadingTips.${tipIndex}` as any);


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
          ? tSync('utils.fromUrlNetworkBlocked')
          : tSync('player.unknownError', { message: err.message });
      DialogManager.alert(tSync('common.error'), errMessage);
      props.navigation.goBack();
    },
    [props.navigation],
  );
  useFocusEffect(
    useCallback(() => {
      props.navigation.setOptions({ headerTitle: props.route.params.title });
      const abort: AbortController = new AbortController();
      let link: string;
      if (!/^https?:\/\//i.test(props.route.params.link)) {
        link = props.route.params.link;
      } else {
        try {
          link = generateUrlWithLatestDomain(props.route.params.link);
        } catch {
          link = props.route.params.link;
        }
      }
      const resolution = props.route.params.historyData?.resolution; // only if FromUrl is called from history component
      if (link.includes('nanimex')) {
        props.navigation.goBack();
        DialogManager.alert(
          tSync('utils.fromUrlOldNanimexTitle'),
          tSync('utils.fromUrlOldNanimexDesc'),
        );
        return;
      }
      if (link.startsWith('film://')) {
        const filmRaw = link.replace('film://', '');
        const [filmPath, filmQuery] = filmRaw.split('?');
        const filmParts = filmPath.split('/');
        const subjectId = filmParts[0];
        const detailPath = filmParts.slice(1).join('/');

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
        if (se == null || ep == null) {
          const titleMatch = props.route.params.title?.match(/ S(\d+)E(\d+)$/);
          if (titleMatch) {
            se = parseInt(titleMatch[1]);
            ep = parseInt(titleMatch[2]);
            type = 'tv';
          }
        }

        FilmAPI.getPlayStreams('lk21', subjectId, detailPath, se, ep, abort.signal)
          .then((streams: any[]) => {
            if (abort.signal.aborted || props.navigation.getState().routes.length === 1) return;
            if (streams.length === 0) {
              DialogManager.alert(tSync('common.error'), tSync('utils.fromUrlFilmUnavailable'));
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
                tSync('player.unsupportedTitle'),
                tSync('player.unsupportedAnime'),
              );
              props.navigation.goBack();
              return;
            }
            try {
              if (result.type === 'animeDetail') {
                if (result.genres.includes('')) {
                  DialogManager.alert(
                    tSync('common.warning'),
                    tSync('player.ecchiWarning'),
                  );
                }
                
                // Use passed thumbnail if scraper couldn't find one
                if (props.route.params.thumbnailUrl && !result.thumbnailUrl) {
                  result.thumbnailUrl = props.route.params.thumbnailUrl;
                }

                if (abort.signal.aborted || props.navigation.getState().routes.length === 1) return;
                props.navigation.dispatch(
                  StackActions.replace('AnimeDetail', {
                    data: result,
                    link: link,
                  }),
                );
              } else if (result.type === 'animeStreaming') {
                if (
                  props.route.params.forceDetail &&
                  result.episodeData?.animeDetail &&
                  result.episodeData.animeDetail !== link
                ) {
                  props.navigation.dispatch(
                    StackActions.replace('FromUrl', {
                      title: props.route.params.title,
                      link: result.episodeData.animeDetail,
                      type: props.route.params.type,
                      thumbnailUrl: props.route.params.thumbnailUrl,
                      historyData: props.route.params.historyData,
                      seriesLink: result.episodeData.animeDetail,
                      forceDetail: false,
                    }),
                  );
                  return;
                }
                if (abort.signal.aborted || props.navigation.getState().routes.length === 1) return;
                props.navigation.dispatch(
                  StackActions.replace('Video', {
                    data: result,
                    link: link,
                    historyData: props.route.params.historyData,
                  }),
                );

                setHistory(result, link, false, {
                  ...props.route.params.historyData,
                  seriesLink: result.episodeData?.animeDetail,
                });

                const episodeIndex = result.title.toLowerCase().indexOf(' episode');
                const title =
                  episodeIndex >= 0 ? result.title.slice(0, episodeIndex) : result.title;
                let watchLater: watchLaterJSON[] = [];
                try {
                  const parsed = JSON.parse((await DatabaseManager.get('watchLater')) ?? '[]');
                  if (Array.isArray(parsed)) watchLater = parsed;
                } catch {}
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
                    `${title} - ${tSync('detail.removedWatchLater')}`,
                    ToastAndroid.SHORT,
                  );
                }
              }
            } catch (e: any) {
              DialogManager.alert(tSync('common.error'), e.message);
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
        const isKomikcast = link.startsWith('komikindo://');
        const isKomiku =
          link.includes('komiku') &&
          !isKomikcast &&
          !link.includes('komikindo') &&
          !link.includes('bacakomik') &&
          !link.includes('mynimeku') &&
          !link.includes('voratoon') &&
          !link.includes('softkomik');
        const isBacakomik =
          link.includes('page=manga') ||
          link.includes('page=chapter') ||
          link.includes('fruatre.my.id');
        const isKomikindo =
          (link.includes('komikindo') && !isKomikcast) ||
          link.includes('bacakomik') ||
          isBacakomik;
        const isLuvyaa = link.startsWith('luvyaa://');
        const isVoratoon =
          link.startsWith('voratoon://') ||
          link.startsWith('voratoon:/') ||
          link.includes('voratoon');
        const isSoftkomik = link.includes('softkomik');
        const isMynimeku = link.includes('mynimeku');
        const isShinigami = link.startsWith('shinigami://');
        const isSoftkomikGoToDetail = isSoftkomik && !link.includes('/chapter/');
        const isKomikuGoToDetail = isKomiku && link.includes('/manga/');
        const isKomikindoChapterLike =
          link.includes('-chapter-') ||
          link.includes('-chapte-') ||
          link.includes('/chapter/') ||
          link.includes('page=chapter') ||
          link.includes('/api/manga/bacakomik-chapter') ||
          /-(?:chapter|ch)[-_]?\d+/i.test(link);
        const isKomikindoGoToDetail = isKomikindo && !isKomikindoChapterLike;
        const isMynimekuGoToDetail =
          isMynimeku &&
          link.includes('/komik/') &&
          !/\/komik\/[^/?#]+\/chapter/i.test(link) &&
          !link.includes('/chapter/');
        const isShinigamiGoToDetail = isShinigami && link.startsWith('shinigami://detail/');
        const isKomikcastGoToDetail = isKomikcast && link.startsWith('komikindo://detail/');
        const isLuvyaaGoToDetail = isLuvyaa && link.startsWith('luvyaa://detail/');
        const isVoratoonGoToDetail =
          isVoratoon &&
          (link.startsWith('voratoon://detail') ||
            (link.includes('/series/') && !link.includes('/chapter/')));
        const goToDetail =
          isKomikuGoToDetail ||
          isKomikindoGoToDetail ||
          isSoftkomikGoToDetail ||
          isMynimekuGoToDetail ||
          isShinigamiGoToDetail ||
          isKomikcastGoToDetail ||
          isLuvyaaGoToDetail ||
          isVoratoonGoToDetail;

        const isNonKomikuTarget = (target: string) =>
          target.includes('komikindo') ||
          target.includes('bacakomik') ||
          target.includes('page=manga') ||
          target.includes('page=chapter') ||
          target.includes('fruatre.my.id') ||
          target.includes('softkomik') ||
          target.includes('mynimeku') ||
          target.startsWith('shinigami://') ||
          target.startsWith('komikindo://') ||
          target.startsWith('luvyaa://') ||
          target.startsWith('voratoon://') ||
          target.startsWith('voratoon:/') ||
          target.includes('voratoon');

        const openComicDetail = (targetLink: string) => {
          const fetchComicsPromise = (
            isNonKomikuTarget(targetLink)
              ? getComicsDetailFromUrl(targetLink, abort.signal)
              : getKomikuDetailFromUrl(targetLink, abort.signal)
          ) as Promise<ComicsDetail | KomikuDetail>;
          return fetchComicsPromise
            .then(result => {
              if (abort.signal.aborted || props.navigation.getState().routes.length === 1) return;
              if (props.route.params.thumbnailUrl && !result.thumbnailUrl) {
                result.thumbnailUrl = props.route.params.thumbnailUrl;
              }
              if (result.genres.includes('Ecchi')) {
                DialogManager.alert(
                  tSync('common.warning'),
                  tSync('utils.fromUrlComicEcchiWarning'),
                );
              }
              props.navigation.dispatch(
                StackActions.replace('ComicsDetail', {
                  data: result,
                  link: targetLink,
                }),
              );
            })
            .catch(handleError);
        };

        const resolvedSeriesLink =
          props.route.params.seriesLink ?? (props.route.params.historyData as any)?.seriesLink;

        if (goToDetail) {
          openComicDetail(link);
        } else if (props.route.params.forceDetail) {
          resolveComicDetailUrl(link, props.route.params.title, abort.signal)
            .then(resolvedDetailUrl => {
              if (abort.signal.aborted || props.navigation.getState().routes.length === 1) return;
              if (resolvedDetailUrl && resolvedDetailUrl !== link) {
                return openComicDetail(resolvedDetailUrl);
              }
              throw new Error('Detail komik tidak ditemukan untuk link chapter ini.');
            })
            .catch(handleError);
        } else {
          (isNonKomikuTarget(link) ? getComicsReading : getKomikuReading)(link, abort.signal)
            .then(async result => {
              if (abort.signal.aborted || props.navigation.getState().routes.length === 1) return;
              props.navigation.dispatch(
                StackActions.replace('ComicsReading', {
                  data: result,
                  historyData: props.route.params.historyData,
                  link: link,
                  seriesLink: resolvedSeriesLink,
                  title: props.route.params.title,
                  thumbnailUrl: props.route.params.thumbnailUrl,
                }),
              );
              setHistory(
                result,
                link,
                false,
                {
                  ...props.route.params.historyData,
                  thumbnailUrl: props.route.params.thumbnailUrl,
                  ...(resolvedSeriesLink ? { seriesLink: resolvedSeriesLink } : {}),
                },
                false,
                true,
                props.route.params.title,
              );
              const chapterIndex = result.title.toLowerCase().indexOf(' chapter');
              const title = chapterIndex >= 0 ? result.title.slice(0, chapterIndex) : result.title;
              let watchLater: watchLaterJSON[] = [];
              try {
                const parsed = JSON.parse((await DatabaseManager.get('watchLater')) ?? '[]');
                if (Array.isArray(parsed)) watchLater = parsed;
              } catch {}
              const watchLaterIndex = watchLater.findIndex(
                z => z.title.trim() === title.trim() && z.isComics === true,
              );
              if (watchLaterIndex >= 0) {
                controlWatchLater('delete', watchLaterIndex);
                ToastAndroid.show(
                  `${title} - ${tSync('detail.removedWatchLater')}`,
                  ToastAndroid.SHORT,
                );
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
      props.route.params.forceDetail,
      props.route.params.historyData,
      props.route.params.seriesLink,
      props.route.params.thumbnailUrl,
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
          {t('utils.fromUrlFetchingData')}
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
