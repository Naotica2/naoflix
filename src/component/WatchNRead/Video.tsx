import { Dropdown, IDropdownRef } from '@pirles/react-native-element-dropdown';
import Icon from '@react-native-vector-icons/fontawesome';
import { Buffer } from 'buffer/';
import cheerio from 'cheerio';
import { VideoView } from 'expo-video';
import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BackHandler,
  FlatList,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  useColorScheme,
  View,
} from 'react-native';
import { KeyboardAwareScrollView, KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SystemBars } from 'react-native-edge-to-edge';
import { DeviceInfoModule } from 'react-native-nitro-device-info';
import Orientation, { OrientationType } from 'react-native-orientation-locker';
import ReAnimated, {
  FadeInUp,
  FadeOutDown,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { runOnJS } from 'react-native-worklets';
import url from 'url';
import { TouchableOpacity } from '../misc/TouchableOpacityRNGH';
import { usePresenceActivity } from '../../utils/presenceSystem';

import useGlobalStyles, { darkText, lightText } from '../../assets/style';
import offlineDownloadManager from '../../utils/offlineDownloadManager';
import { ActiveDownloadItem, OfflineAnimeItem } from '../../types/offlineAnime';
import {
  formatSourceLabel,
  getCanonicalSeriesKey,
  getEpisodeSlotKey,
} from '../../utils/offlineHelpers';
import setHistory from '../../utils/historyControl';
import getStreamHeaders from '../../utils/streamHeaders';
import cleanSynopsis from '../../utils/cleanSynopsis';

import { useFocusEffect } from '@react-navigation/core';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Button, useTheme } from 'react-native-paper';
import WebView from 'react-native-webview';
import { useBackHandler } from '../../hooks/useBackHandler';
import { AniDetail } from '../../types/anime';
import { RootStackNavigator } from '../../types/navigation';
import AnimeAPI from '../../utils/AnimeAPI';
import {
  extractFiledonVideoUrl,
  normalizeDirectDownloadUrl,
  resolveBestOtakudesuDownload,
  resolveOtakudesuDownloadUrl,
} from '../../utils/scrapers/animeindo';
import { useKeyValueIfFocused } from '../../utils/DatabaseManager';
import deviceUserAgent from '../../utils/deviceUserAgent';
import DialogManager from '../../utils/dialogManager';
import { throttle } from '../../utils/throttle';
import Skeleton from '../misc/Skeleton';
import { useAuth } from '../../misc/AuthContext';
import { useLanguage } from '../../misc/LanguageContext';
import { useWatchParty, WatchPartyState } from '../../hooks/useWatchParty';
import {
  buildNobarWebViewCommandScript,
  NOBAR_WEBVIEW_BRIDGE_SCRIPT,
} from '../../utils/nobarWebViewSync';
import NobarChatSection from './NobarChatSection';
import NobarInviteSheet from './NobarInviteSheet';
import EpisodeBox from '../misc/EpisodeBox';
import VideoPlayer, { PlayerRef } from '../VideoPlayer';
import CommentSection from '../Comments/CommentSection';
import { useLevel } from '../../misc/LevelContext';
import { EXP_REWARDS } from '../../utils/LevelSystem';
import { useTimeTracker } from '../../utils/UserTracker';
import { normalizeMediaKey } from '../../types/forum';

type Props = NativeStackScreenProps<RootStackNavigator, 'Video'>;

const defaultLoadingGif =
  'https://cdn.dribbble.com/users/2973561/screenshots/5757826/loading__.gif';

function Video(props: Props) {
  const colorScheme = useColorScheme();

  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const styles = useStyles();
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const isGuest = !user;

  useTimeTracker('anime');

  const enableBatteryTimeInfo = useKeyValueIfFocused('enableBatteryTimeInfo');

  const historyData = useRef(props.route.params.historyData);

  const [batteryLevel, setBatteryLevel] = useState(0);
  const [showSynopsis, setShowSynopsis] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(props.route.params.data);

  const [roomId, setRoomId] = useState<string | null>(props.route.params.roomId || null);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [nobarPortraitTab, setNobarPortraitTab] = useState<'chat' | 'controls'>('chat');
  const [activeLink, setActiveLink] = useState(props.route.params.link);
  const [isPreparingDownload, setIsPreparingDownload] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownloadItem[]>([]);
  const [offlineItems, setOfflineItems] = useState<OfflineAnimeItem[]>(() =>
    offlineDownloadManager.getOfflineAnimeList(),
  );
  const isPreparingDownloadRef = useRef(false);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const isDark = colorScheme === 'dark';
  const isHost = !props.route.params.roomId;
  const isNobarGuest = !!roomId && !isHost;

  useEffect(() => {
    const unsubProgress = offlineDownloadManager.subscribeProgress(activeMap => {
      setActiveDownloads(Array.from(activeMap.values()));
    });
    const unsubList = offlineDownloadManager.subscribeList(list => {
      setOfflineItems([...list]);
    });
    return () => {
      unsubProgress();
      unsubList();
    };
  }, []);

  usePresenceActivity(
    data.title
      ? t('player.presenceWatching', { title: data.title })
      : t('player.presenceBrowsingAnime'),
  );

  const watchPartyMetadata = useMemo(
    () => ({
      type: 'anime',
      title: data.title,
      link: activeLink,
    }),
    [data.title, activeLink],
  );

  const {
    participants,
    remoteState,
    broadcastState,
    chatMessages,
    broadcastChat,
    broadcastMediaChange,
    mediaChangeLink,
    connectionStatus,
    isHostMissing,
    isRoomClosed,
    syncRequestCount,
    requestSync,
    closeRoom,
  } = useWatchParty(roomId, isHost, watchPartyMetadata);

  const [batteryTimeEnable, setBatteryTimeEnable] = useState(false);

  const downloadSource = useRef<string[]>([]);
  const currentLink = useRef(props.route.params.link);
  const firstTimeLoad = useRef(true);
  const videoRef = useRef<VideoView>(null);
  const playerRef = useRef<PlayerRef>(null);
  const webviewRef = useRef<WebView>(null);
  const dropdownResolutionRef = useRef<IDropdownRef>(null);
  const currentResolutionRef = useRef<string | undefined>(data.resolution);
  const actualIsPlayingRef = useRef(!props.route.params.roomId);
  const lastHeartbeatAtRef = useRef(0);
  const lastWebViewStateRef = useRef<{ playerState: 'PLAYING' | 'PAUSED'; currentTime: number } | null>(null);
  const latestRemoteStateRef = useRef<WatchPartyState | null>(null);
  latestRemoteStateRef.current = remoteState;

  const [isPaused, setIsPaused] = useState(!!props.route.params.roomId);

  const handleLeaveNobar = useCallback(async () => {
    await closeRoom();
    setRoomId(null);
    setInviteVisible(false);
    setNobarPortraitTab('chat');
  }, [closeRoom]);

  useEffect(() => {
    if (roomId) {
      if (isRoomClosed && !isHost) {
        ToastAndroid.show(t('nobar.roomClosedByHost'), ToastAndroid.LONG);
        setRoomId(null);
        setInviteVisible(false);
        setNobarPortraitTab('chat');
      } else if (connectionStatus === 'DISCONNECTED') {
        ToastAndroid.show(t('nobar.disconnectedToast'), ToastAndroid.LONG);
        setRoomId(null);
        setInviteVisible(false);
        setNobarPortraitTab('chat');
      } else if (isHostMissing && !isHost) {
        ToastAndroid.show(t('nobar.hostLeftToast'), ToastAndroid.LONG);
        setRoomId(null);
        setInviteVisible(false);
        setNobarPortraitTab('chat');
      }
    }
  }, [roomId, isRoomClosed, connectionStatus, isHostMissing, isHost, t]);

  useEffect(() => {
    const newData = props.route.params.data;
    if (newData && newData !== data && newData.streamingLink !== data.streamingLink) {
      abortController.current?.abort();
      abortController.current = new AbortController();
      setData(newData);
      setLoading(false);
      setAnimeDetail(undefined);
      firstTimeLoad.current = true;
      historyData.current = props.route.params.historyData;
      currentLink.current = props.route.params.link;
      setActiveLink(props.route.params.link);
    }
  }, [props.route.params.data, props.route.params.link, props.route.params.historyData]);

  const applyRemotePlaybackState = useCallback(
    (state: WatchPartyState) => {
      if (!state) return;
      let targetTime = state.currentTime;
      if (state.playerState === 'PLAYING' && state.timestamp) {
        const elapsed = (Date.now() - state.timestamp) / 1000;
        if (elapsed > 0 && elapsed < 8) {
          targetTime += elapsed;
        }
      }

      if (data.streamingType === 'raw' && playerRef.current) {
        const timeDiff = Math.abs(targetTime - playerRef.current.getCurrentTime());
        if (state.playerState === 'PLAYING') {
          if (timeDiff > 2) playerRef.current.skipTo(targetTime);
          playerRef.current.play();
          setIsPaused(false);
          actualIsPlayingRef.current = true;
        } else if (state.playerState === 'PAUSED') {
          playerRef.current.pause();
          setIsPaused(true);
          actualIsPlayingRef.current = false;
          if (timeDiff > 2) playerRef.current.skipTo(targetTime);
        }
      } else if (data.streamingType === 'embed' && webviewRef.current) {
        webviewRef.current.injectJavaScript(
          buildNobarWebViewCommandScript({
            playerState: state.playerState,
            currentTime: state.currentTime,
            timestamp: state.timestamp,
          }),
        );
        const playing = state.playerState === 'PLAYING';
        setIsPaused(!playing);
        actualIsPlayingRef.current = playing;
      }
    },
    [data.streamingType],
  );

  useEffect(() => {
    if (roomId && !isHost && remoteState) {
      applyRemotePlaybackState(remoteState);
    }
  }, [remoteState, roomId, isHost, applyRemotePlaybackState]);

  useEffect(() => {
    if (syncRequestCount > 0 && isHost && roomId) {
      broadcastMediaChange(currentLink.current);
      if (data.streamingType === 'raw' && playerRef.current) {
        broadcastState(
          actualIsPlayingRef.current ? 'PLAYING' : 'PAUSED',
          playerRef.current.getCurrentTime(),
        );
      } else if (data.streamingType === 'embed' && lastWebViewStateRef.current) {
        broadcastState(
          lastWebViewStateRef.current.playerState,
          lastWebViewStateRef.current.currentTime,
        );
      } else {
        broadcastState(actualIsPlayingRef.current ? 'PLAYING' : 'PAUSED', 0);
      }
    }
  }, [syncRequestCount, isHost, roomId, data.streamingType, broadcastMediaChange, broadcastState]);


  const embedInformationRef = useRef<View>(null);
  const { addExp } = useLevel();
  const awardedExpRef = useRef(new Set<string>());

  const synopsisTextRef = useAnimatedRef<Text>();

  const [animeDetail, setAnimeDetail] = useState<AniDetail | undefined>(undefined);

  const extractEpNum = useCallback((title: string): string | undefined => {
    const epMatch = title.match(/[Ee]pisode\s*(\d+)/);
    if (epMatch) return epMatch[1];
    const epShort = title.match(/[Ee][Pp]\s*(\d+)/);
    if (epShort) return epShort[1];
    const allNums = title.match(/\d+/g);
    return allNums ? allNums[allNums.length - 1] : undefined;
  }, []);

  const currentEpisodeIndex = useMemo(() => {
    if (!animeDetail?.episodeList) return -1;

    const exactMatch = animeDetail.episodeList.findIndex(eps => eps.link === currentLink.current);
    if (exactMatch !== -1) return exactMatch;

    const currentNum = extractEpNum(data.title);
    if (!currentNum) return -1;
    return animeDetail.episodeList.findIndex(eps => {
      return extractEpNum(eps.title) === currentNum;
    });
  }, [animeDetail, data, extractEpNum]);

  const episodeListRef = useRef<FlatList>(null);
  useEffect(() => {
    if (currentEpisodeIndex >= 0 && episodeListRef.current) {
      episodeListRef.current.scrollToIndex({ index: currentEpisodeIndex, animated: true, viewOffset: 100 });
    }
  }, [currentEpisodeIndex]);


  useEffect(() => {
    if (!data.episodeData?.animeDetail) return;
    AnimeAPI.fromUrl(data.episodeData.animeDetail, undefined, undefined, true).then(detail => {
      if (detail === 'Unsupported') return;
      if (detail.type === 'animeDetail') {
        if (detail.genres.includes('')) {
          DialogManager.alert(
            t('common.warning'),
            t('player.ecchiWarning'),
          );
        }
        setAnimeDetail(detail);
        if (detail.thumbnailUrl) {
          setData(prev => ({ ...prev, thumbnailUrl: detail.thumbnailUrl }));
        }
      }
    }).catch(() => {});
  }, [data.episodeData?.animeDetail, props.navigation, t]);

  const openDownloadsTab = useCallback(() => {
    setIsPaused(true);
    playerRef.current?.pause();
    (props.navigation as any).navigate('Home', {
      screen: 'MyListsPage',
      params: { initialTab: 'downloads' },
    });
  }, [props.navigation]);

  const updateHistory = useMemo(
    () =>
      throttle(
        (
          currentTime: number,
          stateData: RootStackNavigator['Video']['data'],
        ) => {
          if (Math.floor(currentTime) === 0) {
            return;
          }
          const additionalData = {
            ...historyData.current,
            resolution: stateData.resolution,
            lastDuration: currentTime,
            seriesLink: stateData.episodeData?.animeDetail,
            seriesTitle: animeDetail?.title || (historyData.current as any)?.seriesTitle,
          };
          const currentEp = animeDetail?.episodeList?.find(e => e.link === currentLink.current);
          setHistory(stateData, currentLink.current, true, {
            ...additionalData,
            episode: currentEp?.title,
            thumbnailUrl: stateData.thumbnailUrl || props.route.params.thumbnailUrl || animeDetail?.thumbnailUrl || '',
          }, false, false, additionalData.seriesTitle);
          historyData.current = additionalData;
        },
        2000,
      ),
    [animeDetail],
  );

  const abortController = useRef<AbortController | null>(null);

  const handleReloadEmbed = useCallback(async () => {
    if (!data.streamingLink) return;
    const streamingLink = data.streamingLink;
    setData(datas => ({ ...datas, streamingLink: '' }));
    await new Promise(res => setTimeout(res, 400));
    setData(datas => ({ ...datas, streamingLink }));
  }, [data.streamingLink]);

  const enterFullscreen = useCallback((landscape?: OrientationType) => {
    dropdownResolutionRef.current?.close();
    if (landscape === undefined) {
      Orientation.lockToLandscape();
    } else {
      switch (landscape) {
        case 'LANDSCAPE-LEFT':
          Orientation.lockToLandscapeLeft();
          break;
        case 'LANDSCAPE-RIGHT':
          Orientation.lockToLandscapeRight();
          break;
        default:
          Orientation.lockToLandscape();
      }
    }
    StatusBar.setHidden(true);
    SystemBars.setHidden(true);
    SystemNavigationBar.navigationHide();
    SystemNavigationBar.stickyImmersive(true);
    SystemNavigationBar.fullScreen(true);
    setFullscreen(true);
  }, []);

  const exitFullscreen = useCallback(() => {
    StatusBar.setHidden(false);
    SystemBars.setHidden(false);
    SystemNavigationBar.navigationShow();
    SystemNavigationBar.fullScreen(false);
    Orientation.lockToPortrait();
    setFullscreen(false);
  }, []);

  const orientationDidChange = useCallback(
    (orientation: OrientationType) => {
      Orientation.getAutoRotateState(state => {
        if (!state) return;
        if (fullscreen) {
          // Locked in fullscreen: only allow flipping landscape left/right
          if (orientation === 'LANDSCAPE-LEFT') {
            Orientation.lockToLandscapeLeft();
          } else if (orientation === 'LANDSCAPE-RIGHT') {
            Orientation.lockToLandscapeRight();
          } else if (orientation === 'PORTRAIT') {
            exitFullscreen();
          }
        } else {
          if (orientation === 'LANDSCAPE-LEFT' || orientation === 'LANDSCAPE-RIGHT') {
            enterFullscreen(orientation);
          }
        }
      });
    },
    [fullscreen, enterFullscreen, exitFullscreen],
  );

  const willUnmountHandler = useCallback(() => {
    Orientation.lockToPortrait();
    StatusBar.setHidden(false);
    SystemBars.setHidden(false);
    SystemNavigationBar.navigationShow();
    SystemNavigationBar.fullScreen(false);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (fullscreen) {
        exitFullscreen();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [fullscreen, exitFullscreen]);

  useFocusEffect(
    useCallback(() => {
      abortController.current = new AbortController();
      Orientation.addDeviceOrientationListener(orientationDidChange);

      return () => {
        Orientation.removeDeviceOrientationListener(orientationDidChange);
        willUnmountHandler();
        abortController.current?.abort();
      };
    }, [orientationDidChange, willUnmountHandler]),
  );

  useFocusEffect(
    useCallback(() => {
      let _batteryEvent: NodeJS.Timeout | null;
      if (enableBatteryTimeInfo === 'true') {
        const updateLevel = () => {
          const currentLevel = DeviceInfoModule.getBatteryLevel();
          setBatteryLevel(prev => (prev === currentLevel ? prev : currentLevel));
        };
        updateLevel();
        _batteryEvent = setInterval(updateLevel, 5000);
        setBatteryTimeEnable(true);
      }
      return () => {
        _batteryEvent && clearInterval(_batteryEvent);
        _batteryEvent = null;
      };
    }, [enableBatteryTimeInfo]),
  );

  useBackHandler(
    useCallback(() => {
      if (!fullscreen) {
        willUnmountHandler();
        return false;
      } else {
        exitFullscreen();
        return true;
      }
    }, [exitFullscreen, fullscreen, willUnmountHandler]),
  );

  const setResolution = useCallback(
    async (res: string, resolution: string) => {
      if (loading) {
        return;
      }
      setLoading(true);
      let resultData: string | undefined | { canceled: boolean } | { error: boolean };
      const signal = abortController.current?.signal;
      if ('type' in data) {
        resultData = await AnimeAPI.reqResolution(
          res,
          data.reqNonceAction,
          data.reqResolutionWithNonceAction,
          signal,
        ).catch(err => {
          if (err.message === 'canceled') {
            return { canceled: true };
          }
          const errMessage =
            err.message === 'Network Error'
              ? t('player.networkErrorDesc')
              : t('player.unknownError', { message: err.message });
          DialogManager.alert(t('common.error'), errMessage);
          setLoading(false);
          return { error: true };
        });
      }
      if (resultData === undefined) {
        setLoading(false);
        DialogManager.alert(t('player.resolutionFailedTitle'), t('player.resolutionFailedEmpty'));
        return;
      }
      if (typeof resultData !== 'string' && ('canceled' in resultData || 'error' in resultData)) {
        return;
      }
      const isKnownRawVideoHost = (videoUrl: string) => {
        const clean = videoUrl.split('?')[0].split('#')[0].toLowerCase();
        return (
          clean.endsWith('.mp4') ||
          clean.endsWith('.m3u8') ||
          clean.endsWith('.mkv') ||
          videoUrl.includes('odcloud') ||
          videoUrl.includes('archive.org') ||
          videoUrl.includes('r2.cloudflarestorage') ||
          videoUrl.includes('r2.dev') ||
          videoUrl.includes('pixeldrain.com/api/file/') ||
          videoUrl.includes('googlevideo.com') ||
          videoUrl.includes('googleusercontent.com') ||
          videoUrl.includes('is_hls=1') ||
          videoUrl.includes('workers-anime.berkasdrive.com/download/') ||
          videoUrl.includes('stream-stor.berkasdrive.com') ||
          (videoUrl.includes('storage') && (videoUrl.includes('berkasdrive') || videoUrl.includes('dlgan'))) ||
          videoUrl.includes('berkasdrive.com/dl/') ||
          videoUrl.includes('dlgan.space/st/') ||
          videoUrl.includes('dlgan.space/dl/') ||
          videoUrl.includes('dlgan.my.id')
        );
      };
      let isHlsNew = isKnownRawVideoHost(resultData) ? (resultData.includes('.m3u8') || resultData.includes('is_hls=1')) : false;
      const isWebviewNeeded = isKnownRawVideoHost(resultData)
        ? false
        : await fetch(resultData, {
          headers: {
            'User-Agent': deviceUserAgent,
            ...(getStreamHeaders(resultData) || {}),
          },
          method: 'HEAD',
          signal,
        })
          .catch(() => { })
          .then(response => {
            const contentType = response?.headers.get('content-type') || '';
            if (contentType.includes('mpegurl') || contentType.includes('hls')) {
              isHlsNew = true;
            }
            return !(
              contentType.includes('video') ||
              contentType.includes('octet-stream') ||
              contentType.includes('mpegurl') ||
              resultData.includes('filedon')
            );
          });
      if (signal?.aborted) return;
      currentResolutionRef.current = resolution;
      let newDownloadLink = resultData;
      if ((isWebviewNeeded || isHlsNew) && data.downloadOptions && data.downloadOptions.length > 0) {
        const opt =
          data.downloadOptions.find(d => d.resolution === resolution && /berkasdrive|filedon|pdrain|pixeldrain/i.test(d.server + d.url)) ||
          data.downloadOptions.find(d => d.resolution === resolution);
        if (opt) {
          newDownloadLink = opt.url;
        }
      }
      setData(old => {
        return {
          ...old,
          streamingType: isWebviewNeeded ? 'embed' : 'raw',
          streamingLink: resultData,
          downloadLink: newDownloadLink,
          resolution,
          isHls: isHlsNew,
        };
      });
      setLoading(false);
      firstTimeLoad.current = true;
    },
    [data, loading, t],
  );

  const getBatteryIconComponent = useCallback(() => {
    let iconName = 'battery-';
    const batteryLevelPercentage = Math.round(batteryLevel * 100);
    if (batteryLevelPercentage > 75) {
      iconName += '4';
    } else if (batteryLevelPercentage > 50) {
      iconName += '3';
    } else if (batteryLevelPercentage > 30) {
      iconName += '2';
    } else if (batteryLevelPercentage > 15) {
      iconName += '1';
    } else {
      iconName += '0';
    }
    type BattNumber = '0' | '1' | '2' | '3' | '4';
    return (
      <Icon
        name={iconName as `battery-${BattNumber}`}
        color={iconName === 'battery-0' ? 'red' : darkText}
      />
    );
  }, [batteryLevel]);

  useEffect(() => {
    return () => {
      downloadAbortRef.current?.abort();
    };
  }, []);

  const downloadAnime = useCallback(async () => {
    if (isPreparingDownloadRef.current) {
      ToastAndroid.show(t('offline.fetchingLink'), ToastAndroid.SHORT);
      return;
    }

    isPreparingDownloadRef.current = true;
    setIsPreparingDownload(true);

    downloadAbortRef.current?.abort();
    const dlController = new AbortController();
    downloadAbortRef.current = dlController;
    const signal = dlController.signal;

    try {
      const isHls = 'isHls' in data ? data.isHls : false;
      const downloadLink = 'downloadLink' in data ? data.downloadLink : undefined;
      const sourcePlatform = currentLink.current.includes('nimegami')
        ? 'nimegami'
        : 'otakudesu';

      const isDirectPlayable =
        data.streamingType === 'raw' &&
        Boolean(data.streamingLink) &&
        !data.streamingLink.startsWith('javascript:') &&
        !data.streamingLink.includes('iframe') &&
        !data.streamingLink.toLowerCase().includes('.m3u8') &&
        (data.streamingLink.includes('.mp4') ||
          data.streamingLink.includes('workers-anime.berkasdrive.com/download/') ||
          data.streamingLink.includes('stream-stor') ||
          data.streamingLink.includes('dlgan') ||
          data.streamingLink.includes('odcloud') ||
          data.streamingLink.includes('archive.org') ||
          data.streamingLink.includes('r2.cloudflarestorage') ||
          data.streamingLink.includes('r2.dev') ||
          data.streamingLink.includes('googlevideo.com') ||
          data.streamingLink.includes('googleusercontent.com') ||
          data.streamingLink.includes('pixeldrain.com/api/file/'));

      ToastAndroid.show(t('player.preparingBestLink'), ToastAndroid.SHORT);

      let source = '';
      if (sourcePlatform === 'otakudesu') {
        const candidates = data.downloadOptions || [];
        const fallbackRaw =
          (isDirectPlayable ? data.streamingLink : '') ||
          (downloadLink && !downloadLink.includes('iframe') ? downloadLink : '');
        source = await resolveBestOtakudesuDownload(
          candidates,
          data.resolution || '360p',
          currentLink.current,
          fallbackRaw,
          signal,
        );
      } else {
        if (isDirectPlayable) {
          source = data.streamingLink;
        } else if (downloadLink && downloadLink.trim().length > 0 && !downloadLink.includes('iframe') && !downloadLink.startsWith('javascript:')) {
          source = downloadLink;
        } else if (data.downloadOptions && data.downloadOptions.length > 0) {
          const opt =
            data.downloadOptions.find(d => d.resolution === data.resolution && /berkasdrive|filedon|pdrain|pixeldrain/i.test(d.server + d.url)) ||
            data.downloadOptions.find(d => /berkasdrive|filedon|pdrain|pixeldrain/i.test(d.server + d.url)) ||
            data.downloadOptions[0];
          if (opt?.url) {
            source = opt.url;
          }
        } else {
          source = data.streamingLink;
        }

        source = normalizeDirectDownloadUrl(source);
        if (source.startsWith('/')) {
          source = `https://nimegami.id${source}`;
        }
        if (source.includes('nimegami.id/') && source.includes('/streaming/')) {
          const resolvedNime = await AnimeAPI.reqResolution(`nimegami_rsc::${source}`, '', '', signal).catch(() => undefined);
          source = resolvedNime ? normalizeDirectDownloadUrl(resolvedNime) : '';
        }
        if (source.includes('filedon.co/')) {
          const extracted = await extractFiledonVideoUrl(source, signal);
          if (extracted) source = extracted;
        }
        if (
          source.includes('link.desustream.com') ||
          source.includes('desustream') ||
          source.includes('desudrive') ||
          source.includes('desuarchive') ||
          source.includes('pixeldrain.com/u/')
        ) {
          const resolved = await resolveOtakudesuDownloadUrl(source, signal, currentLink.current);
          if (resolved) source = resolved;
        }
      }

      if (signal.aborted) return;

      if (
        !source ||
        source.startsWith('javascript:') ||
        source === 'about:blank' ||
        source.includes('vidhide') ||
        source.includes('odvidhide') ||
        source.includes('mega.nz') ||
        source.includes('terabox') ||
        source.toLowerCase().includes('.m3u8') ||
        source.toLowerCase().includes('is_hls=1') ||
        (isHls && source === data.streamingLink)
      ) {
        ToastAndroid.show(
          t('player.mp4NotFound'),
          ToastAndroid.LONG,
        );
        return;
      }

      const rawTitle = data.title || '';
      const cleanMain = rawTitle.replace(/Subtitle Indonesia|Sub Indo/gi, '').trim();
      let animeTitle = animeDetail?.title?.replace(/Subtitle Indonesia|Sub Indo/gi, '').trim() || cleanMain;
      let episodeTitle = cleanMain;

      const epMatch = cleanMain.match(/(.*?)\s+((?:Episode|Eps|Ep|Part)\s*\d+.*)/i);
      if (epMatch) {
        if (!animeDetail?.title) animeTitle = epMatch[1].trim();
        episodeTitle = epMatch[2].trim();
      } else if (animeDetail?.title && cleanMain.startsWith(animeDetail.title)) {
        episodeTitle = cleanMain.replace(animeDetail.title, '').trim() || cleanMain;
      }

      const resolution = data.resolution || '360p';

      DialogManager.alert(
        t('player.downloadPromptTitle'),
        t('player.downloadPromptDesc', { anime: animeTitle, episode: episodeTitle, resolution }),
        [
          { text: t('common.cancel'), onPress: () => {} },
          {
            text: t('player.startDownload'),
            onPress: async () => {
              await offlineDownloadManager.startDownload({
                animeTitle,
                episodeTitle,
                source: sourcePlatform,
                sourceUrl: currentLink.current,
                streamUrl: source,
                resolution,
                thumbnailUrl: data.thumbnailUrl || animeDetail?.thumbnailUrl || '',
              });
            },
          },
        ],
      );
    } catch {
      if (!signal.aborted) {
        ToastAndroid.show(
          t('player.prepareLinkFailed'),
          ToastAndroid.LONG,
        );
      }
    } finally {
      isPreparingDownloadRef.current = false;
      setIsPreparingDownload(false);
    }
  }, [data, animeDetail, t]);

  const handleProgress = useCallback(
    (currentTime: number) => {
      updateHistory(currentTime, data);
      if (roomId && isHost && actualIsPlayingRef.current) {
        const now = Date.now();
        if (now - lastHeartbeatAtRef.current >= 5000) {
          lastHeartbeatAtRef.current = now;
          broadcastState('PLAYING', currentTime);
        }
      }
    },
    [updateHistory, data, roomId, isHost, broadcastState],
  );

  const handlePlayingChange = useCallback(
    (isPlaying: boolean, currentTime: number) => {
      actualIsPlayingRef.current = isPlaying;
      if (roomId && isHost) {
        lastHeartbeatAtRef.current = Date.now();
        broadcastState(isPlaying ? 'PLAYING' : 'PAUSED', currentTime);
      }
    },
    [roomId, isHost, broadcastState],
  );

  const episodeDataControl = useCallback(
    async (dataLink: string) => {
      if (loading) {
        return;
      }
      setLoading(true);
      const preferredRes = currentResolutionRef.current || data.resolution;
      const result = await AnimeAPI.fromUrl(
        dataLink,
        preferredRes,
        undefined,
        undefined,
        abortController.current?.signal,
      ).catch(err => {
        if (err.message === 'Silahkan selesaikan captcha') {
          setLoading(false);
          return;
        }
        if (err.message === 'canceled') {
          return;
        }
        const errMessage =
          err.message === 'Network Error'
            ? t('player.networkErrorDesc')
            : t('player.unknownError', { message: err.message });
        DialogManager.alert(t('common.error'), errMessage);
        setLoading(false);
      });
      if (result === undefined) {
        return;
      }
      if (result === 'Unsupported') {
        DialogManager.alert(
          t('player.unsupportedTitle'),
          t('player.unsupportedAnime'),
        );
        setLoading(false);
        return;
      }

      if (result.type !== 'animeStreaming') {
        setLoading(false);
        DialogManager.alert(
          t('common.error'),
          t('player.invalidDataDesc'),
        );
        return;
      }

      if (isHost && roomId) {
        setIsPaused(true);
        actualIsPlayingRef.current = false;
        broadcastMediaChange(dataLink);
        broadcastState('PAUSED', 0);
      }

      setData(result);
      if (result.resolution) {
        currentResolutionRef.current = result.resolution;
      }
      const currentEp = animeDetail?.episodeList?.find(e => e.link === dataLink);
      setHistory(result, dataLink, undefined, {
        episode: currentEp?.title,
        seriesLink: result.episodeData?.animeDetail,
        thumbnailUrl: result.thumbnailUrl || props.route.params.thumbnailUrl || animeDetail?.thumbnailUrl || '',
      }, false, false, animeDetail?.title || (historyData.current as any)?.seriesTitle);
      props.navigation.setParams({ data: result, link: dataLink });
      setLoading(false);
      firstTimeLoad.current = false;
      historyData.current = undefined;
      currentLink.current = dataLink;
      setActiveLink(dataLink);
      lastWebViewStateRef.current = null;
    },
    [loading, props.navigation, animeDetail, isHost, roomId, broadcastMediaChange, broadcastState, data.resolution, props.route.params.thumbnailUrl, t],
  );

  const lastMediaChangeLink = useRef<string | null>(props.route.params.link || null);

  useEffect(() => {
    const normalizeUrl = (val?: string | null) => (val || '').trim().replace(/\/+$/, '');
    if (
      roomId &&
      mediaChangeLink &&
      !isHost &&
      normalizeUrl(mediaChangeLink) !== normalizeUrl(lastMediaChangeLink.current)
    ) {
      lastMediaChangeLink.current = mediaChangeLink;
      if (normalizeUrl(mediaChangeLink) !== normalizeUrl(currentLink.current)) {
        setIsPaused(true);
        actualIsPlayingRef.current = false;
        episodeDataControl(mediaChangeLink);
      }
    }
  }, [roomId, mediaChangeLink, isHost, episodeDataControl]);

  const hasNextEp = useMemo(() => {
    if (!animeDetail?.episodeList || currentEpisodeIndex === -1 || animeDetail.episodeList.length < 2) return false;
    const firstEpNum = Number(extractEpNum(animeDetail.episodeList[0].title) || 0);
    const lastEpNum = Number(extractEpNum(animeDetail.episodeList[animeDetail.episodeList.length - 1].title) || 0);
    const isReversed = firstEpNum < lastEpNum; // If index 0 is smaller than last index, list is Oldest to Newest
    const nextIndex = isReversed ? currentEpisodeIndex + 1 : currentEpisodeIndex - 1;
    return nextIndex >= 0 && nextIndex < animeDetail.episodeList.length;
  }, [animeDetail, currentEpisodeIndex, extractEpNum]);

  const hasPrevEp = useMemo(() => {
    if (!animeDetail?.episodeList || currentEpisodeIndex === -1 || animeDetail.episodeList.length < 2) return false;
    const firstEpNum = Number(extractEpNum(animeDetail.episodeList[0].title) || 0);
    const lastEpNum = Number(extractEpNum(animeDetail.episodeList[animeDetail.episodeList.length - 1].title) || 0);
    const isReversed = firstEpNum < lastEpNum;
    const prevIndex = isReversed ? currentEpisodeIndex - 1 : currentEpisodeIndex + 1;
    return prevIndex >= 0 && prevIndex < animeDetail.episodeList.length;
  }, [animeDetail, currentEpisodeIndex, extractEpNum]);

  const goNextEp = useCallback(() => {
    if (roomId && !isHost) return;
    if (!animeDetail?.episodeList || currentEpisodeIndex === -1 || animeDetail.episodeList.length < 2) return;
    const firstEpNum = Number(extractEpNum(animeDetail.episodeList[0].title) || 0);
    const lastEpNum = Number(extractEpNum(animeDetail.episodeList[animeDetail.episodeList.length - 1].title) || 0);
    const isReversed = firstEpNum < lastEpNum;
    const nextIndex = isReversed ? currentEpisodeIndex + 1 : currentEpisodeIndex - 1;
    if (nextIndex >= 0 && nextIndex < animeDetail.episodeList.length) {
      if (roomId) {
        setIsPaused(true);
        actualIsPlayingRef.current = false;
        if (isHost) broadcastState('PAUSED', 0);
      }
      const newLink = animeDetail.episodeList[nextIndex].link;
      episodeDataControl(newLink);
    } else {
      ToastAndroid.show(t('player.noNextEp'), ToastAndroid.SHORT);
    }
  }, [animeDetail, currentEpisodeIndex, episodeDataControl, extractEpNum, roomId, t, isHost, broadcastState]);

  const goPrevEp = useCallback(() => {
    if (roomId && !isHost) return;
    if (!animeDetail?.episodeList || currentEpisodeIndex === -1 || animeDetail.episodeList.length < 2) return;
    const firstEpNum = Number(extractEpNum(animeDetail.episodeList[0].title) || 0);
    const lastEpNum = Number(extractEpNum(animeDetail.episodeList[animeDetail.episodeList.length - 1].title) || 0);
    const isReversed = firstEpNum < lastEpNum;
    const prevIndex = isReversed ? currentEpisodeIndex - 1 : currentEpisodeIndex + 1;
    if (prevIndex >= 0 && prevIndex < animeDetail.episodeList.length) {
      if (roomId) {
        setIsPaused(true);
        actualIsPlayingRef.current = false;
        if (isHost) broadcastState('PAUSED', 0);
      }
      const newLink = animeDetail.episodeList[prevIndex].link;
      episodeDataControl(newLink);
    } else {
      ToastAndroid.show(t('player.noPrevEp'), ToastAndroid.SHORT);
    }
  }, [animeDetail, currentEpisodeIndex, episodeDataControl, extractEpNum, roomId, t, isHost, broadcastState]);

  const cancelLoading = useCallback(() => {
    abortController.current?.abort();
    setLoading(false);
    abortController.current = new AbortController();
  }, []);

  const handleVideoLoad = useCallback(() => {
    const streamUrl = data.streamingLink;
    if (streamUrl && !awardedExpRef.current.has(streamUrl)) {
      awardedExpRef.current.add(streamUrl);
      const amount = EXP_REWARDS.WATCH_ANIME;
      addExp(amount);
      ToastAndroid.show(`+${amount} EXP`, ToastAndroid.SHORT);
    }

    if (roomId && !isHost) {
      firstTimeLoad.current = false;
      if (latestRemoteStateRef.current) {
        applyRemotePlaybackState(latestRemoteStateRef.current);
        if (data.streamingType === 'embed') {
          setTimeout(() => {
            if (latestRemoteStateRef.current) {
              applyRemotePlaybackState(latestRemoteStateRef.current);
            }
          }, 1200);
        }
      } else {
        requestSync();
      }
      return;
    }

    if (firstTimeLoad.current === false) {
      return;
    }
    firstTimeLoad.current = false;
    if (historyData.current === undefined || historyData.current.lastDuration === undefined) {
      return;
    }
    if (videoRef.current && videoRef.current.props.player) {
      playerRef.current?.skipTo(historyData.current.lastDuration);
    }
    ToastAndroid.show(t('player.autoResumePosition'), ToastAndroid.SHORT);
  }, [addExp, data.streamingLink, data.streamingType, t, roomId, isHost, applyRemotePlaybackState, requestSync]);

  useEffect(() => {
    if (isPaused) {
      videoRef.current?.props.player.pause();
    } else {
      videoRef.current?.props.player.play();
    }
  }, [isPaused]);

  const fullscreenUpdate = useCallback(
    (enterFull: boolean) => {
      if (enterFull) {
        enterFullscreen();
      } else {
        exitFullscreen();
      }
    },
    [enterFullscreen, exitFullscreen],
  );



  const batteryAndClock = undefined;

  const resolutionDropdownData = useMemo(() => {
    return Object.entries(data.resolutionRaw)
      .filter(z => z[1] !== undefined)
      .map(z => {
        return { label: z[1].resolution, value: z[1] };
      });
  }, [data.resolutionRaw]);

  const currentSeriesKey = useMemo(
    () => getCanonicalSeriesKey(animeDetail?.title || data.title || ''),
    [animeDetail?.title, data.title],
  );
  const currentEpisodeSlotKey = useMemo(
    () => getEpisodeSlotKey(data.title || ''),
    [data.title],
  );

  const currentActiveDownload = useMemo(() => {
    return activeDownloads.find(
      d =>
        getCanonicalSeriesKey(d.animeTitle) === currentSeriesKey &&
        getEpisodeSlotKey(d.episodeTitle) === currentEpisodeSlotKey,
    );
  }, [activeDownloads, currentSeriesKey, currentEpisodeSlotKey]);

  const currentSavedOffline = useMemo(() => {
    return (
      offlineItems.find(item => item.sourceUrl && item.sourceUrl === currentLink.current) ||
      offlineItems.find(
        item =>
          getCanonicalSeriesKey(item.animeTitle) === currentSeriesKey &&
          getEpisodeSlotKey(item.episodeTitle) === currentEpisodeSlotKey,
      )
    );
  }, [offlineItems, currentSeriesKey, currentEpisodeSlotKey, data.streamingLink]);

  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden={fullscreen} barStyle="light-content" />
      <SystemBars hidden={fullscreen} style="light" />

      {!fullscreen && (
        <View style={{ paddingTop: insets.top, backgroundColor: '#000' }}>
          <View
            style={{
              height: 48,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 8,
              backgroundColor: '#000',
            }}>
            <TouchableOpacity
              onPress={() => props.navigation.goBack()}
              hitSlop={8}
              style={{
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 20,
              }}>
              <Icon name="arrow-left" size={18} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 8, marginRight: 12 }}>
              <Text
                style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}
                numberOfLines={1}>
                {animeDetail?.title || data.title}
              </Text>
              {data.title && animeDetail?.title && data.title !== animeDetail.title ? (
                <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '500' }} numberOfLines={1}>
                  {data.title}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      )}

      <LoadingModal
        setIsPaused={setIsPaused}
        isLoading={loading}
        cancelLoading={cancelLoading}
        autoPlay={!roomId}
      />
      <View style={fullscreen ? styles.fullscreen : styles.notFullscreen}>
        <View
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'black',
            zIndex: 0,
            position: 'absolute',
          }}
        />
        {
          !data.streamingLink ? (
            <View style={{ flex: 1, zIndex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Icon name="exclamation-circle" color="#ff5252" size={48} />
              <Text style={{ color: 'white', marginTop: 10, fontSize: 16, fontWeight: '600' }}>{t('player.videoUnavailable')}</Text>
              <Text style={{ color: '#aaa', marginTop: 4, fontSize: 13 }}>{t('player.videoUnavailableDesc')}</Text>
            </View>
          ) : data.streamingType === 'raw' ? (
            <VideoPlayer
              title={data.title}
              thumbnailURL={data.thumbnailUrl}
              streamingURL={data.streamingLink}
              style={{ flex: 1, zIndex: 1 }}
              videoRef={videoRef}
              ref={playerRef}
              fullscreen={fullscreen}
              onFullscreenUpdate={fullscreenUpdate}
              onDurationChange={handleProgress}
              onPlayingChange={handlePlayingChange}
              onLoad={handleVideoLoad}
              isHls={('isHls' in data ? data.isHls : undefined) ?? data.streamingLink.includes('.m3u8')}
              headers={getStreamHeaders(data.streamingLink)}
              batteryAndClock={batteryAndClock}
              showNextPrevButtons={true}
              onNextEp={goNextEp}
              onPrevEp={goPrevEp}
              disableNextEp={!hasNextEp || loading}
              disablePrevEp={!hasPrevEp || loading}
              isPaused={isPaused}
              disableControls={isNobarGuest}
            />
          ) : data.streamingType === 'embed' ? (
            <>
              {/* @ts-ignore */}
              <WebView
                style={{ flex: 1, zIndex: 1 }}
              ref={webviewRef}
              key={data.streamingLink}
              setSupportMultipleWindows={false}
              injectedJavaScriptForMainFrameOnly={false}
              onMessage={(event: any) => {
                try {
                  const msg = JSON.parse(event.nativeEvent.data);
                  if (msg?.type === 'NOBAR_WEBVIEW_STATE') {
                    const nextState = msg.playerState === 'PLAYING' ? 'PLAYING' : 'PAUSED';
                    const nextTime = Number(msg.currentTime) || 0;
                    lastWebViewStateRef.current = { playerState: nextState, currentTime: nextTime };
                    actualIsPlayingRef.current = nextState === 'PLAYING';
                    if (roomId && isHost) {
                      broadcastState(nextState, nextTime);
                    }
                  }
                } catch {}
              }}
              onShouldStartLoadWithRequest={(navigator: any) => {
                const url = navigator.url.toLowerCase();
                const mainUrl = data.streamingLink.toLowerCase();

                // Block known ad / popup domains globally
                if (url.includes('yellowishgather') || url.includes('gather.com') ||
                    url.includes('shopee') || url.includes('tokopedia') ||
                    url.includes('lazada') || url.includes('bet') || url.includes('slot') ||
                    url.includes('redirect') || url.includes('popunder')) {
                  return false;
                }

                const normalizedUrl = url.replace(/\/$/, '');
                const normalizedMainUrl = mainUrl.replace(/\/$/, '');

                if (navigator.isTopFrame) {
                  // Only allow the initial URL or local HTML to load in the top frame
                  if (normalizedUrl === normalizedMainUrl || url === 'about:blank') {
                    return true;
                  }
                  // Allow navigation/redirects within trusted video/file hosting domains
                  const TRUSTED_DOMAINS = [
                    'pixeldrain.com', 'acefile.co', '1024terabox.com', 'terabox.com',
                    'drive.google.com', 'mega.nz', 's.id', 'akirabox.com', 'gofile.io',
                    'vikingfile.com', 'filedon.co', 'desustream.net', 'odcloud.net', 'vidhide',
                    'odvidhide.com', 'mp4upload.com', 'berkasdrive.com', 'desudrive.com',
                    'nimegami.id', 'blogger.com'
                  ];
                  if (TRUSTED_DOMAINS.some(d => url.includes(d))) {
                    return true;
                  }
                  // Block any other top-frame navigation (ads trying to hijack the page)
                  return false;
                } else {
                  // Allow if it matches the main stream URL
                  if (normalizedUrl === normalizedMainUrl) return true;

                  const ALLOWED_IFRAME_DOMAINS = [
                    'playcdn', 'videonode', 'dutrag', 'fembed', 'streamtape',
                    'anichin', 'rumble.com', 'abyssplayer', 'rubyvid', 'ok.ru',
                    'vk.com', 'bilibili', 'youtube', 'dailymotion', 'cloudflare', 'cdn-cgi',
                    'pixeldrain', 'acefile', 'terabox', '1024terabox', 'drive.google',
                    'mega.nz', 's.id', 'akirabox', 'gofile', 'vikingfile', 'filedon',
                    'desustream', 'odcloud', 'vidhide', 'odvidhide', 'mp4upload',
                    'berkasdrive', 'desudrive', 'nimegami', 'blogger'
                  ];

                  if (ALLOWED_IFRAME_DOMAINS.some(d => url.includes(d))) return true;

                  // Allow explicit media assets
                  if (url.includes('.mp4') || url.includes('.m3u8') || url.includes('.ts')) return true;

                  // Block any other iframe navigation
                  return false;
                }
              }}
              source={
                (data.resolution?.includes('lokal')
                  ? {
                    html: `
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Document</title>
</head>
<body style="margin: 0; padding: 0;">
  <iframe
    src="${data.streamingLink}"
    style="width: 100vw; height: 100vh; border: none; margin: 0; padding: 0;"
    allowFullScreen
  ></iframe>
</body>`,
                    baseUrl: `https://${url.parse(data.streamingLink).host}`,
                  }
                  : { uri: data.streamingLink })
              }
              userAgent={data.resolution?.includes('lokal') ? undefined : deviceUserAgent}
              originWhitelist={['*']}
              allowsFullscreenVideo={true}
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback={true}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              onLoadEnd={handleVideoLoad}
              injectedJavaScript={`
                window.alert = function() {};
                window.confirm = function() {};
                window.prompt = function() {};
                window.open = function() { return window; }; // Disable opening new windows but return window to avoid breaking click-to-play scripts
                
                try {
                  var style = document.createElement('style');
                  style.innerHTML = '.pilih_server { opacity: 0.25 !important; transform: scale(0.6) !important; transform-origin: top right !important; transition: all 0.3s ease !important; } .pilih_server:active, .pilih_server:hover { opacity: 1 !important; transform: scale(0.9) !important; }';
                  style.innerHTML += '\\n a[href*="bet"], a[href*="slot"], a[target="_blank"]>img, div[id*="ad_"], div[class*="ad_"], .mgbox, #container-pop, a[href^="http"]:not([href*="' + window.location.hostname + '"]) { display: none !important; opacity: 0 !important; pointer-events: none !important; }';
                  document.head.appendChild(style);

                  var iframes = document.getElementsByTagName('iframe');
                  for (var i = 0; i < iframes.length; i++) {
                    iframes[i].setAttribute('allowfullscreen', 'true');
                    iframes[i].setAttribute('webkitallowfullscreen', 'true');
                    iframes[i].setAttribute('mozallowfullscreen', 'true');
                    iframes[i].setAttribute('allow', 'autoplay; fullscreen');
                  }

                  // Interval to remove transparent click-hijacking overlays
                  setInterval(function() {
                      var els = document.querySelectorAll('div, a');
                      for (var j = 0; j < els.length; j++) {
                          var el = els[j];
                          var style = window.getComputedStyle(el);
                          var z = parseInt(style.zIndex);
                          if (z > 9000 && style.position === 'absolute' && style.opacity < 0.1 && el.innerHTML.indexOf('<video') === -1 && el.innerHTML.indexOf('<iframe') === -1) {
                              el.style.display = 'none';
                              el.style.pointerEvents = 'none';
                          }
                          if (el.tagName === 'DIV') {
                              var txt = el.textContent ? el.textContent.toLowerCase() : '';
                              if (txt.indexOf('close ad') > -1 || (txt.indexOf('konfirmasi') > -1 && txt.indexOf('melanjutkan') > -1)) {
                                  if (el.innerHTML.indexOf('<video') === -1 && el.innerHTML.indexOf('<iframe') === -1) {
                                      el.style.display = 'none';
                                      el.style.pointerEvents = 'none';
                                      el.style.opacity = '0';
                                  }
                              }
                          }
                      }
                  }, 1000);
                } catch(e) {}
                ${NOBAR_WEBVIEW_BRIDGE_SCRIPT}
                true;
              `}
              injectedJavaScriptBeforeContentLoaded={`
                (function() {
                  // Block popups immediately
                  window.open = function() { return null; };
                  
                  // Kill devtools detection before it fires
                  window.devtoolIsOpening = function() {};

                  function isBadUrl(url) {
                    if (typeof url !== 'string') return false;
                    var u = url.toLowerCase();
                    return u.includes('intent:') || u.includes('shopee') ||
                           u.includes('tokopedia') || u.includes('yellowishgather') ||
                           u.includes('gather.com');
                  }

                  // Block location.replace and assign for redirect hijacking
                  var origReplace = Location.prototype.replace;
                  Object.defineProperty(Location.prototype, 'replace', {
                    configurable: true,
                    value: function(url) {
                      if (isBadUrl(url)) return;
                      return origReplace.call(this, url);
                    }
                  });

                  var origAssign = Location.prototype.assign;
                  Object.defineProperty(Location.prototype, 'assign', {
                    configurable: true,
                    value: function(url) {
                      if (isBadUrl(url)) return;
                      return origAssign.call(this, url);
                    }
                  });
                })();
              `}
              />
            </>
          ) : (
            <Text style={{ color: 'white' }}>{t('player.videoUnavailable')}</Text>
          )
        }
        {data.streamingType === 'embed' && batteryAndClock}
        {data.streamingType === 'embed' && (
          <TouchableOpacity
            onPress={() => (fullscreen ? exitFullscreen() : enterFullscreen())}
            style={{
              position: 'absolute',
              top: fullscreen ? 12 : 10,
              right: fullscreen ? 16 : 10,
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
            }}>
            <Icon name={fullscreen ? 'compress' : 'arrows-alt'} size={14} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        {fullscreen && roomId && (
          <NobarChatSection
            roomId={roomId}
            isHost={isHost}
            isFullscreen={true}
            isDark={isDark}
            participants={participants}
            chatMessages={chatMessages}
            broadcastChat={broadcastChat}
            onInvitePress={() => setInviteVisible(true)}
            onLeaveRoom={handleLeaveNobar}
          />
        )}
      </View>
      {!fullscreen &&
        (roomId && (!isHost || nobarPortraitTab === 'chat') ? (
          <KeyboardAvoidingView
            behavior="padding"
            style={{ flex: 1, backgroundColor: isDark ? '#0f0f0f' : '#fafafa' }}>
            {isHost && (
              <View style={styles.nobarTabBar}>
                <TouchableOpacity
                  onPress={() => setNobarPortraitTab('chat')}
                  style={[styles.nobarTabBtn, styles.nobarTabBtnActive]}>
                  <Icon name="comments" size={13} color="#FFFFFF" />
                  <Text style={[styles.nobarTabText, styles.nobarTabTextActive]}>
                    {t('nobar.tabChat')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNobarPortraitTab('controls')}
                  style={styles.nobarTabBtn}>
                  <Icon name="sliders" size={13} color={isDark ? '#9CA3AF' : '#4B5563'} />
                  <Text style={styles.nobarTabText}>{t('nobar.tabControls')}</Text>
                </TouchableOpacity>
              </View>
            )}
            <NobarChatSection
              roomId={roomId}
              isHost={isHost}
              isFullscreen={false}
              isDark={isDark}
              participants={participants}
              chatMessages={chatMessages}
              broadcastChat={broadcastChat}
              onInvitePress={() => setInviteVisible(true)}
              onLeaveRoom={handleLeaveNobar}
            />
          </KeyboardAvoidingView>
        ) : (
          <View style={{ flex: 1 }}>
            {roomId && isHost && (
              <View style={styles.nobarTabBar}>
                <TouchableOpacity
                  onPress={() => setNobarPortraitTab('chat')}
                  style={styles.nobarTabBtn}>
                  <Icon name="comments" size={13} color={isDark ? '#9CA3AF' : '#4B5563'} />
                  <Text style={styles.nobarTabText}>{t('nobar.tabChat')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNobarPortraitTab('controls')}
                  style={[styles.nobarTabBtn, styles.nobarTabBtnActive]}>
                  <Icon name="sliders" size={13} color="#FFFFFF" />
                  <Text style={[styles.nobarTabText, styles.nobarTabTextActive]}>
                    {t('nobar.tabControls')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            <KeyboardAwareScrollView
              bottomOffset={80}
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom }}>
              <View style={{ flex: 1 }}>
              <View style={styles.headerSection}>
                <Text style={styles.mainTitle} numberOfLines={2}>
                  {animeDetail?.title || data.title}
                </Text>
                {data.title && animeDetail?.title && data.title !== animeDetail.title && (
                  <Text style={styles.epSubhead} numberOfLines={1}>
                    {data.title}
                  </Text>
                )}
                <View style={styles.metaBadgeRow}>
                  {animeDetail?.rating ? (
                    <View style={styles.ratingBadge}>
                      <Icon name="star" size={11} color="#f59e0b" />
                      <Text style={styles.ratingText}>{animeDetail.rating}</Text>
                    </View>
                  ) : null}
                  {animeDetail?.status ? (
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            animeDetail.status === 'Completed' || animeDetail.status === 'Movie'
                              ? '#10b981'
                              : '#ef4444',
                        },
                      ]}>
                      <Text style={styles.statusBadgeText}>{animeDetail.status}</Text>
                    </View>
                  ) : null}
                  {animeDetail?.releaseYear ? (
                    <View style={styles.metaChip}>
                      <Icon name="calendar" size={11} color={isDark ? '#9ca3af' : '#6b7280'} />
                      <Text style={styles.metaChipText}>{animeDetail.releaseYear}</Text>
                    </View>
                  ) : null}
                  {data.resolution ? (
                    <View style={styles.resBadge}>
                      <Text style={styles.resBadgeText}>{data.resolution}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.actionBar}>
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={() => {
                    if (currentActiveDownload) {
                      if (currentActiveDownload.status === 'paused') {
                        offlineDownloadManager.resumeDownload(currentActiveDownload.id);
                      } else {
                        offlineDownloadManager.pauseDownload(currentActiveDownload.id, 'manual');
                      }
                      return;
                    }
                    downloadAnime();
                  }}
                  disabled={isPreparingDownload}>
                  <View
                    style={[
                      styles.actionIconWrap,
                      currentActiveDownload
                        ? {
                            backgroundColor:
                              currentActiveDownload.status === 'paused'
                                ? 'rgba(245, 158, 11, 0.2)'
                                : 'rgba(59, 130, 246, 0.2)',
                          }
                        : currentSavedOffline
                        ? { backgroundColor: 'rgba(16, 185, 129, 0.18)' }
                        : undefined,
                    ]}>
                    {isPreparingDownload ? (
                      <ActivityIndicator size={16} color={isDark ? '#fff' : '#111827'} />
                    ) : currentActiveDownload ? (
                      currentActiveDownload.status === 'paused' ? (
                        <Icon name="play-circle" size={16} color="#F59E0B" />
                      ) : (
                        <Icon name="pause-circle" size={16} color="#3B82F6" />
                      )
                    ) : (
                      <Icon
                        name={currentSavedOffline ? 'check-circle' : 'download'}
                        size={16}
                        color={currentSavedOffline ? '#10B981' : (isDark ? '#fff' : '#111827')}
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.actionLabel,
                      currentActiveDownload
                        ? {
                            color: currentActiveDownload.status === 'paused' ? '#F59E0B' : '#3B82F6',
                            fontWeight: '700',
                          }
                        : currentSavedOffline
                        ? { color: '#10B981', fontWeight: '700' }
                        : undefined,
                    ]}>
                    {isPreparingDownload
                      ? t('player.preparingBtn')
                      : currentActiveDownload
                      ? currentActiveDownload.status === 'paused'
                        ? t('offline.progressBadgePaused', { percent: currentActiveDownload.progressPercent })
                        : t('player.downloadingBtn', { percent: currentActiveDownload.progressPercent })
                      : currentSavedOffline
                      ? t('player.savedBtn')
                      : t('player.download')}
                  </Text>
                </TouchableOpacity>

                {!isGuest && (
                  <TouchableOpacity
                    style={styles.actionItem}
                    onPress={async () => {
                      if (roomId) {
                        setInviteVisible(true);
                        return;
                      }
                      if (!profile) {
                        ToastAndroid.show(t('auth.loginRequiredNobar'), ToastAndroid.SHORT);
                        return;
                      }

                      const newRoomId = Math.random().toString(36).substring(2, 10).toUpperCase();
                      setRoomId(newRoomId);
                      setIsPaused(true);
                      actualIsPlayingRef.current = false;
                      playerRef.current?.pause();
                      if (data.streamingType === 'embed') {
                        webviewRef.current?.injectJavaScript(
                          buildNobarWebViewCommandScript({
                            playerState: 'PAUSED',
                            currentTime: lastWebViewStateRef.current?.currentTime || 0,
                            timestamp: Date.now(),
                          }),
                        );
                      }
                      setNobarPortraitTab('chat');
                      setInviteVisible(true);
                    }}>
                    <View style={[styles.actionIconWrap, roomId ? { backgroundColor: 'rgba(99, 102, 241, 0.2)' } : undefined]}>
                      <Icon name="users" size={16} color={roomId ? '#6366f1' : (isDark ? '#fff' : '#111827')} />
                    </View>
                    <Text style={[styles.actionLabel, roomId ? { color: '#6366f1', fontWeight: '700' } : undefined]}>
                      {roomId ? `Room ${roomId}` : t('player.nobar')}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={() => enterFullscreen()}>
                  <View style={styles.actionIconWrap}>
                    <Icon name="arrows-alt" size={16} color={isDark ? '#fff' : '#111827'} />
                  </View>
                  <Text style={styles.actionLabel}>{t('player.fullscreen')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={() => {
                    if (!animeDetail) return;
                    props.navigation.push('AnimeDetail', {
                      data: animeDetail as any,
                      link: data.episodeData.animeDetail,
                    });
                  }}>
                  <View style={styles.actionIconWrap}>
                    <Icon name="info-circle" size={16} color={isDark ? '#fff' : '#111827'} />
                  </View>
                  <Text style={styles.actionLabel}>{t('player.detail')}</Text>
                </TouchableOpacity>

                {data.streamingType === 'embed' && (
                  <TouchableOpacity style={styles.actionItem} onPress={handleReloadEmbed}>
                    <View style={styles.actionIconWrap}>
                      <Icon name="refresh" size={16} color={isDark ? '#fff' : '#111827'} />
                    </View>
                    <Text style={styles.actionLabel}>{t('player.reload')}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {activeDownloads.length > 0 ? (
                <View style={styles.downloadBannerCard}>
                  <View style={styles.downloadBannerTopRow}>
                    <View style={styles.downloadBannerTitleRow}>
                      {activeDownloads.some(d => d.status === 'downloading') ? (
                        <ActivityIndicator size={14} color="#3B82F6" />
                      ) : (
                        <Icon name="pause-circle" size={14} color="#F59E0B" />
                      )}
                      <Text style={styles.downloadBannerTitle}>
                        {t('player.downloadsBannerHeader', { count: activeDownloads.length })}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.downloadBannerJumpBtn}
                      onPress={openDownloadsTab}>
                      <Text style={styles.downloadBannerJumpText}>{t('player.viewDownloadProgress')}</Text>
                      <Icon name="chevron-right" size={10} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  {activeDownloads.slice(0, 2).map(dl => {
                    const isDlPaused = dl.status === 'paused';
                    return (
                      <View key={dl.id} style={styles.downloadBannerItem}>
                        <View style={styles.downloadBannerItemHeader}>
                          <Text style={styles.downloadBannerItemName} numberOfLines={1}>
                            {dl.animeTitle} - {dl.episodeTitle} ({dl.resolution} / {formatSourceLabel(dl.source)})
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <TouchableOpacity
                              onPress={() =>
                                isDlPaused
                                  ? offlineDownloadManager.resumeDownload(dl.id)
                                  : offlineDownloadManager.pauseDownload(dl.id, 'manual')
                              }
                              hitSlop={8}
                              style={{ paddingHorizontal: 4 }}>
                              <Icon
                                name={isDlPaused ? 'play' : 'pause'}
                                size={12}
                                color={isDlPaused ? '#10B981' : '#F59E0B'}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => offlineDownloadManager.cancelDownload(dl.id)}
                              hitSlop={8}>
                              <Icon name="close" size={13} color="#EF4444" />
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={styles.downloadBannerTrack}>
                          <View
                            style={[
                              styles.downloadBannerFill,
                              {
                                width: `${Math.max(4, dl.progressPercent)}%`,
                                backgroundColor: isDlPaused ? '#F59E0B' : '#3B82F6',
                              },
                            ]}
                          />
                        </View>
                        <View style={styles.downloadBannerStatsRow}>
                          <Text
                            style={[
                              styles.downloadBannerPercent,
                              isDlPaused ? { color: '#F59E0B' } : undefined,
                            ]}>
                            {isDlPaused
                              ? dl.pauseReason === 'network'
                                ? t('offline.statusPausedNetwork', { percent: dl.progressPercent })
                                : t('offline.statusPausedManual', { percent: dl.progressPercent })
                              : t('offline.statusDownloading', { percent: dl.progressPercent })}
                          </Text>
                          <Text style={styles.downloadBannerBytes}>
                            {offlineDownloadManager.formatBytes(dl.receivedBytes)} /{' '}
                            {dl.totalBytes > 0 ? offlineDownloadManager.formatBytes(dl.totalBytes) : '...'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}

                  {activeDownloads.length > 2 && (
                    <Text style={styles.downloadBannerMoreText}>
                      {t('player.moreDownloadsBg', { count: activeDownloads.length - 2 })}
                    </Text>
                  )}

                  <Text style={styles.downloadBannerHint}>
                    {t('player.downloadsBannerHint')}
                  </Text>
                </View>
              ) : currentSavedOffline ? (
                <View style={styles.offlineReadyCard}>
                  <View style={styles.offlineReadyLeft}>
                    <Icon name="check-circle" size={15} color="#10B981" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.offlineReadyTitle} numberOfLines={1}>
                        {t('player.savedOfflineCardTitle', {
                          res: currentSavedOffline.resolution,
                          size: offlineDownloadManager.formatBytes(currentSavedOffline.fileSize),
                        })}
                      </Text>
                      <Text style={styles.offlineReadySub} numberOfLines={1}>
                        {t('player.savedOfflineCardSub')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.offlineReadyActions}>
                    <TouchableOpacity
                      style={styles.offlineReadyPlayBtn}
                      onPress={() => {
                        setIsPaused(true);
                        playerRef.current?.pause();
                        props.navigation.navigate('OfflineVideoPlayer', {
                          item: currentSavedOffline,
                        });
                      }}>
                      <Icon name="play" size={10} color="#FFFFFF" />
                      <Text style={styles.offlineReadyPlayText}>{t('player.play')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.offlineReadyListBtn}
                      onPress={openDownloadsTab}>
                      <Text style={styles.offlineReadyListText}>{t('lists.tabDownloads')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {resolutionDropdownData.length > 0 && (
                <View style={styles.qualityStrip}>
                  <View style={styles.qualityLeft}>
                    <Icon name="sliders" size={13} color={isDark ? '#9ca3af' : '#6b7280'} />
                    <Text style={styles.qualityLabel}>{t('player.quality')}</Text>
                  </View>
                  <View style={styles.dropdownWrap}>
                    <Dropdown
                      ref={dropdownResolutionRef}
                      value={{
                        label: data.resolution,
                        value:
                          data.resolutionRaw?.[
                          data.resolutionRaw.findIndex(e => e.resolution === data.resolution)
                          ],
                      }}
                      placeholder={t('player.resolutionPlaceholder')}
                      data={resolutionDropdownData}
                      valueField="value"
                      labelField="label"
                      onChange={async val => {
                        await setResolution(val.value.dataContent, val.label);
                      }}
                      style={styles.dropdownStyle}
                      containerStyle={styles.dropdownContainerStyle}
                      itemTextStyle={styles.dropdownItemTextStyle}
                      itemContainerStyle={styles.dropdownItemContainerStyle}
                      activeColor={isDark ? '#3b82f6' : '#2563eb'}
                      selectedTextStyle={styles.dropdownSelectedTextStyle}
                      placeholderStyle={{ color: isDark ? '#aaa' : '#666', fontSize: 13 }}
                      autoScroll
                      dropdownPosition="bottom"
                    />
                  </View>
                </View>
              )}

              {animeDetail?.episodeList && animeDetail.episodeList.length > 0 && (
                <View style={styles.epSection}>
                  <View style={styles.epHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.epSectionTitle}>{t('common.episode')}</Text>
                      <View style={styles.epCountBadge}>
                        <Text style={styles.epCountText}>{animeDetail.episodeList.length}</Text>
                      </View>
                    </View>
                    <View style={styles.epNavGroup}>
                      <TouchableOpacity
                        onPress={goPrevEp}
                        disabled={!hasPrevEp || loading}
                        style={[styles.epNavBtn, (!hasPrevEp || loading) && { opacity: 0.35 }]}>
                        <Icon name="step-backward" size={10} color={isDark ? '#fff' : '#111827'} />
                        <Text style={styles.epNavBtnText}>{t('player.prev')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={goNextEp}
                        disabled={!hasNextEp || loading}
                        style={[styles.epNavBtn, (!hasNextEp || loading) && { opacity: 0.35 }]}>
                        <Text style={styles.epNavBtnText}>{t('player.next')}</Text>
                        <Icon name="step-forward" size={10} color={isDark ? '#fff' : '#111827'} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <FlatList
                    ref={episodeListRef}
                    horizontal
                    data={animeDetail.episodeList}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 4 }}
                    keyExtractor={(item, idx) => item.link + idx}
                    getItemLayout={(_data, index) => ({
                      length: 50,
                      offset: (50 + 8) * index,
                      index,
                    })}
                    onScrollToIndexFailed={info => {
                      const wait = new Promise(resolve => setTimeout(resolve, 500));
                      wait.then(() => {
                        episodeListRef.current?.scrollToIndex({
                          index: info.highestMeasuredFrameIndex,
                          animated: true,
                        });
                      });
                    }}
                    renderItem={({ item, index }) => {
                      const epNumStr = extractEpNum(item.title);
                      const epNum = epNumStr ? parseInt(epNumStr, 10) : index + 1;
                      const isCurrent = index === currentEpisodeIndex;
                      return (
                        <EpisodeBox
                          number={epNum}
                          isActive={isCurrent}
                          isLastWatched={false}
                          onPress={() => {
                            if (roomId && !isHost) return;
                            episodeDataControl(item.link);
                          }}
                          width={50}
                        />
                      );
                    }}
                    initialNumToRender={8}
                    maxToRenderPerBatch={8}
                    windowSize={5}
                    removeClippedSubviews={true}
                  />
                </View>
              )}

              {animeDetail && (
                <View style={styles.synopsisCard}>
                  <Text style={styles.synopsisHeader}>{t('detail.synopsis')}</Text>
                  <Text
                    style={styles.synopsisBody}
                    numberOfLines={showSynopsis ? undefined : 3}>
                    {cleanSynopsis(animeDetail.synopsis || t('common.empty'))}
                  </Text>
                  <TouchableOpacity
                    style={styles.expandBtn}
                    onPress={() => setShowSynopsis(!showSynopsis)}>
                    <Text style={styles.expandBtnText}>
                      {showSynopsis ? t('common.readLess') : t('common.readMore')}
                    </Text>
                    <Icon
                      name={showSynopsis ? 'chevron-up' : 'chevron-down'}
                      size={10}
                      color="#3b82f6"
                    />
                  </TouchableOpacity>

                  {animeDetail.genres && animeDetail.genres.length > 0 && (
                    <View style={styles.genreWrap}>
                      {animeDetail.genres.map(genre => (
                        <View key={genre} style={styles.genrePill}>
                          <Text style={styles.genrePillText}>{genre}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {data.resolution?.includes('pogo') && (
                <View style={styles.noticeBanner}>
                  <Icon name="exclamation-triangle" size={14} color="#f59e0b" style={{ marginTop: 2 }} />
                  <Text style={styles.noticeText}>
                    {t('player.pogoWarning')}
                  </Text>
                </View>
              )}

              {data.resolution?.includes('lokal') && (
                <View style={styles.noticeBanner}>
                  <Icon name="info-circle" size={14} color="#3b82f6" style={{ marginTop: 2 }} />
                  <Text style={styles.noticeText}>
                    {t('player.lokalWarning')}
                  </Text>
                </View>
              )}

              <View style={{ marginVertical: 8 }}>
                <CommentSection
                  contentId={data.episodeData?.animeDetail}
                  contentType={'anime'}
                />
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      ))}

      <NobarInviteSheet
        visible={inviteVisible}
        onDismiss={() => setInviteVisible(false)}
        roomId={roomId || ''}
        nobarTitle={animeDetail?.title || data.title}
        isDark={isDark}
        onPromoteToForum={() => {
          setInviteVisible(false);
          setIsPaused(true);
          playerRef.current?.pause();
          if (fullscreen) exitFullscreen();
          const seriesLink = data.episodeData?.animeDetail || currentLink.current;
          const cleanTitle = (animeDetail?.title || data.title)
            .replace(/Subtitle Indonesia|Sub Indo/i, '')
            .split('(Episode')[0]
            .trim();
          const epNum = extractEpNum(data.title);
          props.navigation.navigate('ForumComposer', {
            defaultCategory: 'nobar',
            nobarRoomId: roomId || '',
            nobarTitle: cleanTitle,
            linkedMedia: {
              media_key: normalizeMediaKey('anime', seriesLink || cleanTitle),
              type: 'anime',
              title: cleanTitle,
              poster_url:
                data.thumbnailUrl ||
                props.route.params.thumbnailUrl ||
                animeDetail?.thumbnailUrl ||
                null,
              link: seriesLink,
              episode_label: epNum ? `Ep ${epNum}` : null,
            },
          });
        }}
      />
    </View>
  );
}

function LoadingModal({
  isLoading,
  cancelLoading,
  setIsPaused,
  autoPlay = true,
}: {
  isLoading: boolean;
  cancelLoading: () => void;
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
  autoPlay?: boolean;
}) {
  const globalStyles = useGlobalStyles();
  const styles = useStyles();
  const { t } = useLanguage();
  useBackHandler(
    useCallback(() => {
      if (isLoading) {
        cancelLoading();
      }
      return isLoading;
    }, [isLoading, cancelLoading]),
  );

  useEffect(() => {
    if (isLoading) {
      setIsPaused(() => true);
    } else {
      if (autoPlay) {
        setIsPaused(() => false);
      }
    }
  }, [isLoading, setIsPaused, autoPlay]);

  const entering = useMemo(() => FadeInUp.duration(300), []);
  const exiting = useMemo(() => FadeOutDown.duration(300), []);

  return (
    isLoading && (
      <View style={styles.modalContainer}>
        <ReAnimated.View entering={entering} exiting={exiting} style={styles.modalContent}>
          <TouchableOpacity
            onPress={cancelLoading}
            style={{ position: 'absolute', top: 0, right: 0, zIndex: 9999, padding: 15 }}
            hitSlop={20}
          >
            <Icon name="close" size={28} color="red" />
          </TouchableOpacity>
          <ActivityIndicator size={28} />
          <Text style={globalStyles.text}>{t('player.loadingData')}</Text>
        </ReAnimated.View>
      </View>
    )
  );
}

function TimeInfo() {
  const [time, setTime] = useState<string>();

  const changeTime = useCallback(() => {
    const currentDate = new Date();
    const hours = currentDate.getHours();
    const minutes = currentDate.getMinutes();
    const newDate = `${hours < 10 ? '0' + hours : hours}:${minutes < 10 ? '0' + minutes : minutes}`;
    if (time !== newDate) {
      setTime(newDate);
    }
  }, [time]);

  useFocusEffect(
    useCallback(() => {
      changeTime();
      const interval = setInterval(changeTime, 1_000);
      return () => {
        clearInterval(interval);
      };
    }, [changeTime]),
  );
  return <Text style={{ color: '#dadada' }}>{time}</Text>;
}

function useStyles() {
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();

  return useMemo(
    () =>
      StyleSheet.create({
        modalContainer: {
          position: 'absolute',
          width: '100%',
          height: '100%',
          zIndex: 100,
          backgroundColor: 'rgba(0,0,0,0.7)',
          justifyContent: 'center',
          alignItems: 'center',
        },
        modalContent: {
          flex: 0.15,
          minWidth: 300,
          minHeight: 80,
          backgroundColor: colorScheme === 'dark' ? '#2A2A2A' : '#FFFFFF',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colorScheme === 'dark' ? '#404040' : '#E0E0E0',
          alignItems: 'center',
          alignSelf: 'center',
          justifyContent: 'center',
          elevation: 5,
        },
        batteryInfo: {
          position: 'absolute',
          right: 15,
          top: 15,
          flexDirection: 'row',
          alignItems: 'center',
          padding: 6,
          borderRadius: 20,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 1,
        },
        timeInfo: {
          position: 'absolute',
          left: 15,
          top: 15,
          padding: 6,
          borderRadius: 20,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 1,
        },
        fullscreen: {
          ...StyleSheet.absoluteFillObject,
          zIndex: 9999,
          elevation: 9999,
          width: '100%',
          height: '100%',
          backgroundColor: '#000',
        },
        notFullscreen: {
          width: '100%',
          aspectRatio: 16 / 9,
          backgroundColor: '#000',
        },
        headerSection: {
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 8,
        },
        mainTitle: {
          fontSize: 18,
          fontWeight: '700',
          letterSpacing: -0.3,
          color: colorScheme === 'dark' ? '#FFFFFF' : '#111827',
          marginBottom: 4,
        },
        epSubhead: {
          fontSize: 13,
          color: colorScheme === 'dark' ? '#9CA3AF' : '#4B5563',
          marginBottom: 8,
          fontWeight: '500',
        },
        metaBadgeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
          marginTop: 2,
        },
        ratingBadge: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
        },
        ratingText: {
          color: '#F59E0B',
          fontSize: 12,
          fontWeight: '700',
        },
        statusBadge: {
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
        },
        statusBadgeText: {
          color: '#FFFFFF',
          fontSize: 11,
          fontWeight: '700',
          textTransform: 'uppercase',
        },
        metaChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: colorScheme === 'dark' ? '#262626' : '#E5E7EB',
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
        },
        metaChipText: {
          color: colorScheme === 'dark' ? '#D1D5DB' : '#374151',
          fontSize: 11,
          fontWeight: '500',
        },
        resBadge: {
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
        },
        resBadgeText: {
          color: '#3B82F6',
          fontSize: 11,
          fontWeight: '700',
        },
        actionBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          backgroundColor: colorScheme === 'dark' ? '#171717' : '#F3F4F6',
          marginHorizontal: 16,
          marginTop: 10,
          marginBottom: 12,
          paddingVertical: 10,
          paddingHorizontal: 6,
          borderRadius: 14,
        },
        actionItem: {
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          paddingVertical: 4,
        },
        actionIconWrap: {
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: colorScheme === 'dark' ? '#262626' : '#E5E7EB',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        },
        actionLabel: {
          fontSize: 11,
          fontWeight: '600',
          color: colorScheme === 'dark' ? '#D1D5DB' : '#374151',
          textAlign: 'center',
        },
        downloadBannerCard: {
          marginHorizontal: 16,
          marginBottom: 12,
          padding: 12,
          borderRadius: 12,
          backgroundColor: colorScheme === 'dark' ? '#121D33' : '#EFF6FF',
          borderWidth: 1,
          borderColor: colorScheme === 'dark' ? '#1E3A8A' : '#BFDBFE',
        },
        downloadBannerTopRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        },
        downloadBannerTitleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          flex: 1,
        },
        downloadBannerTitle: {
          fontSize: 12.5,
          fontWeight: '700',
          color: colorScheme === 'dark' ? '#93C5FD' : '#1E40AF',
        },
        downloadBannerJumpBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: '#2563EB',
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 8,
        },
        downloadBannerJumpText: {
          color: '#FFFFFF',
          fontSize: 11,
          fontWeight: '700',
        },
        downloadBannerItem: {
          marginBottom: 8,
        },
        downloadBannerItemHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        },
        downloadBannerItemName: {
          flex: 1,
          fontSize: 11.5,
          fontWeight: '600',
          color: colorScheme === 'dark' ? '#E5E7EB' : '#1E293B',
        },
        downloadBannerTrack: {
          height: 6,
          borderRadius: 3,
          backgroundColor: colorScheme === 'dark' ? 'rgba(59, 130, 246, 0.25)' : '#DBEAFE',
          overflow: 'hidden',
        },
        downloadBannerFill: {
          height: '100%',
          backgroundColor: '#3B82F6',
          borderRadius: 3,
        },
        downloadBannerStatsRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 4,
        },
        downloadBannerPercent: {
          fontSize: 11,
          fontWeight: '700',
          color: '#3B82F6',
        },
        downloadBannerBytes: {
          fontSize: 11,
          color: colorScheme === 'dark' ? '#9CA3AF' : '#64748B',
        },
        downloadBannerMoreText: {
          fontSize: 11,
          fontWeight: '600',
          color: colorScheme === 'dark' ? '#93C5FD' : '#2563EB',
          marginBottom: 4,
        },
        downloadBannerHint: {
          fontSize: 11,
          lineHeight: 15,
          color: colorScheme === 'dark' ? '#93C5FD' : '#1D4ED8',
          opacity: 0.9,
        },
        offlineReadyCard: {
          marginHorizontal: 16,
          marginBottom: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: colorScheme === 'dark' ? '#0F241D' : '#ECFDF5',
          borderWidth: 1,
          borderColor: colorScheme === 'dark' ? '#065F46' : '#A7F3D0',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        },
        offlineReadyLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          flex: 1,
        },
        offlineReadyTitle: {
          fontSize: 12,
          fontWeight: '700',
          color: colorScheme === 'dark' ? '#6EE7B7' : '#065F46',
        },
        offlineReadySub: {
          fontSize: 10.5,
          color: colorScheme === 'dark' ? '#A7F3D0' : '#047857',
          marginTop: 1,
        },
        offlineReadyActions: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        offlineReadyPlayBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: '#10B981',
          paddingHorizontal: 9,
          paddingVertical: 5,
          borderRadius: 7,
        },
        offlineReadyPlayText: {
          color: '#FFFFFF',
          fontSize: 11,
          fontWeight: '700',
        },
        offlineReadyListBtn: {
          paddingHorizontal: 8,
          paddingVertical: 5,
          borderRadius: 7,
          borderWidth: 1,
          borderColor: colorScheme === 'dark' ? '#059669' : '#6EE7B7',
        },
        offlineReadyListText: {
          fontSize: 11,
          fontWeight: '600',
          color: colorScheme === 'dark' ? '#6EE7B7' : '#065F46',
        },
        qualityStrip: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colorScheme === 'dark' ? '#1F1F1F' : '#F3F4F6',
          marginHorizontal: 16,
          marginBottom: 12,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 10,
        },
        qualityLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        qualityLabel: {
          fontSize: 12,
          fontWeight: '600',
          color: colorScheme === 'dark' ? '#D1D5DB' : '#374151',
        },
        dropdownWrap: {
          minWidth: 120,
        },
        dropdownStyle: {
          backgroundColor: colorScheme === 'dark' ? '#2B2B2B' : '#FFFFFF',
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 8,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colorScheme === 'dark' ? '#404040' : '#E0E0E0',
        },
        dropdownContainerStyle: {
          width: 160,
          borderRadius: 8,
          backgroundColor: colorScheme === 'dark' ? '#2B2B2B' : '#FFFFFF',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colorScheme === 'dark' ? '#404040' : '#E0E0E0',
          elevation: 5,
        },
        dropdownItemTextStyle: {
          color: colorScheme === 'dark' ? '#FFFFFF' : '#111827',
          fontSize: 13,
        },
        dropdownItemContainerStyle: {
          borderRadius: 6,
          backgroundColor: colorScheme === 'dark' ? '#2B2B2B' : '#FFFFFF',
        },
        dropdownSelectedTextStyle: {
          color: colorScheme === 'dark' ? '#FFFFFF' : '#111827',
          fontSize: 12,
          fontWeight: '600',
        },
        epSection: {
          marginBottom: 14,
        },
        epHeaderRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          marginBottom: 8,
        },
        epSectionTitle: {
          fontSize: 14,
          fontWeight: '700',
          color: colorScheme === 'dark' ? '#FFFFFF' : '#111827',
        },
        epCountBadge: {
          backgroundColor: colorScheme === 'dark' ? '#262626' : '#E5E7EB',
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 10,
        },
        epCountText: {
          fontSize: 11,
          fontWeight: '600',
          color: colorScheme === 'dark' ? '#9CA3AF' : '#4B5563',
        },
        epNavGroup: {
          flexDirection: 'row',
          gap: 6,
        },
        epNavBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: colorScheme === 'dark' ? '#262626' : '#E5E7EB',
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 8,
        },
        epNavBtnText: {
          fontSize: 11,
          fontWeight: '600',
          color: colorScheme === 'dark' ? '#FFFFFF' : '#111827',
        },
        synopsisCard: {
          backgroundColor: colorScheme === 'dark' ? '#171717' : '#F9FAFB',
          marginHorizontal: 16,
          padding: 14,
          borderRadius: 14,
          marginBottom: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colorScheme === 'dark' ? '#262626' : '#E5E7EB',
        },
        synopsisHeader: {
          fontSize: 12,
          fontWeight: '700',
          color: colorScheme === 'dark' ? '#9CA3AF' : '#6B7280',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 6,
        },
        synopsisBody: {
          fontSize: 13,
          lineHeight: 20,
          color: colorScheme === 'dark' ? '#D1D5DB' : '#374151',
        },
        expandBtn: {
          alignSelf: 'flex-start',
          marginTop: 6,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        },
        expandBtnText: {
          fontSize: 12,
          fontWeight: '600',
          color: '#3B82F6',
        },
        genreWrap: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          marginTop: 10,
        },
        genrePill: {
          backgroundColor: colorScheme === 'dark' ? '#262626' : '#E5E7EB',
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 6,
        },
        genrePillText: {
          fontSize: 11,
          color: colorScheme === 'dark' ? '#9CA3AF' : '#4B5563',
          fontWeight: '500',
        },
        noticeBanner: {
          marginHorizontal: 16,
          padding: 10,
          borderRadius: 10,
          marginBottom: 8,
          flexDirection: 'row',
          gap: 8,
          alignItems: 'flex-start',
          backgroundColor: colorScheme === 'dark' ? '#252014' : '#FFFBEB',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colorScheme === 'dark' ? '#453818' : '#FDE68A',
        },
        noticeText: {
          fontSize: 12,
          lineHeight: 17,
          color: colorScheme === 'dark' ? '#FDE68A' : '#92400E',
          flex: 1,
        },
        nobarTabBar: {
          flexDirection: 'row',
          paddingHorizontal: 12,
          paddingVertical: 8,
          gap: 8,
          backgroundColor: colorScheme === 'dark' ? '#141416' : '#f3f4f6',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colorScheme === 'dark' ? '#27272a' : '#e5e7eb',
        },
        nobarTabBtn: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingVertical: 8,
          borderRadius: 10,
          backgroundColor: colorScheme === 'dark' ? '#1f1f23' : '#e5e7eb',
        },
        nobarTabBtnActive: {
          backgroundColor: '#6366f1',
        },
        nobarTabText: {
          fontSize: 12.5,
          fontWeight: '700',
          color: colorScheme === 'dark' ? '#9CA3AF' : '#4B5563',
        },
        nobarTabTextActive: {
          color: '#FFFFFF',
        },
      }),
    [colorScheme, globalStyles.text.color, theme],
  );
}
export default memo(Video);
