import { Dropdown, IDropdownRef } from '@pirles/react-native-element-dropdown';
import Icon from '@react-native-vector-icons/fontawesome';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
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
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  useColorScheme,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
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

import useGlobalStyles, { darkText, lightText } from '../../assets/style';
import useDownloadAnimeFunction from '../../utils/downloadAnime';
import setHistory from '../../utils/historyControl';

import { useFocusEffect } from '@react-navigation/core';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Button, useTheme } from 'react-native-paper';
import WebView from 'react-native-webview';
import { useBackHandler } from '../../hooks/useBackHandler';
import { AniDetail } from '../../types/anime';
import { RootStackNavigator } from '../../types/navigation';
import AnimeAPI from '../../utils/AnimeAPI';
import { useKeyValueIfFocused } from '../../utils/DatabaseManager';
import deviceUserAgent from '../../utils/deviceUserAgent';
import DialogManager from '../../utils/dialogManager';
import { throttle } from '../../utils/throttle';
import Skeleton from '../misc/Skeleton';
import EpisodeBox from '../misc/EpisodeBox';
import VideoPlayer, { PlayerRef } from '../VideoPlayer';
import CommentSection from '../Comments/CommentSection';
import { useLevel } from '../../misc/LevelContext';
import { EXP_REWARDS } from '../../utils/LevelSystem';

type Props = NativeStackScreenProps<RootStackNavigator, 'Video'>;

const defaultLoadingGif =
  'https://cdn.dribbble.com/users/2973561/screenshots/5757826/loading__.gif';

function Video(props: Props) {
  const colorScheme = useColorScheme();

  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const styles = useStyles();

  const enableBatteryTimeInfo = useKeyValueIfFocused('enableBatteryTimeInfo');

  const historyData = useRef(props.route.params.historyData);

  const [batteryLevel, setBatteryLevel] = useState(0);
  // const [showBatteryLevel, setShowBatteryLevel] = useState(false);
  const [showSynopsis, setShowSynopsis] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(props.route.params.data);

  // Sync data state when route params change (episode navigation via StackActions.replace)
  useEffect(() => {
    const newData = props.route.params.data;
    if (newData && newData !== data && newData.streamingLink !== data.streamingLink) {
      // Reset player state for new episode
      abortController.current?.abort();
      abortController.current = new AbortController();
      setData(newData);
      setLoading(false);
      setAnimeDetail(undefined);
      firstTimeLoad.current = true;
      historyData.current = props.route.params.historyData;
      currentLink.current = props.route.params.link;
    }
  }, [props.route.params.data, props.route.params.link, props.route.params.historyData]);
  const [batteryTimeEnable, setBatteryTimeEnable] = useState(false);

  const downloadSource = useRef<string[]>([]);
  const currentLink = useRef(props.route.params.link);
  const firstTimeLoad = useRef(true);
  const videoRef = useRef<VideoView>(null);
  const playerRef = useRef<PlayerRef>(null);
  const webviewRef = useRef<WebView>(null);
  const dropdownResolutionRef = useRef<IDropdownRef>(null);
  const embedInformationRef = useRef<View>(null);
  const { addExp } = useLevel();
  const awardedExpRef = useRef(new Set<string>());

  const synopsisTextRef = useAnimatedRef<Text>();

  const [animeDetail, setAnimeDetail] = useState<AniDetail | undefined>(undefined);

  // Current episode index in the episode list (for highlighting in grid)
  const extractEpNum = useCallback((title: string): string | undefined => {
    // Try "Episode X" first, then "Ep X", then last number
    const epMatch = title.match(/[Ee]pisode\s*(\d+)/);
    if (epMatch) return epMatch[1];
    const epShort = title.match(/[Ee][Pp]\s*(\d+)/);
    if (epShort) return epShort[1];
    const allNums = title.match(/\d+/g);
    return allNums ? allNums[allNums.length - 1] : undefined;
  }, []);

  const currentEpisodeIndex = useMemo(() => {
    if (!animeDetail?.episodeList) return -1;
    const currentNum = extractEpNum(data.title);
    if (!currentNum) return -1;
    return animeDetail.episodeList.findIndex(eps => {
      return extractEpNum(eps.title) === currentNum;
    });
  }, [animeDetail, data.title, extractEpNum]);

  // Auto-scroll episode grid to current episode
  const episodeListRef = useRef<FlatList>(null);
  useEffect(() => {
    if (currentEpisodeIndex >= 0 && episodeListRef.current) {
      episodeListRef.current.scrollToIndex({ index: currentEpisodeIndex, animated: true, viewOffset: 100 });
    }
  }, [currentEpisodeIndex]);


  useEffect(() => {
    AnimeAPI.fromUrl(data.episodeData.animeDetail, undefined, undefined, true).then(detail => {
      if (detail === 'Unsupported') return;
      if (detail.type === 'animeDetail') {
        if (detail.genres.includes('')) {
          DialogManager.alert(
            'Perhatian!',
            'Anime ini mengandung genre ecchi. Mohon bijak dalam menonton.',
          );
        }
        setAnimeDetail(detail);
        setData(prev => ({ ...prev, thumbnailUrl: detail.thumbnailUrl }));
      }
    });
  }, [data.episodeData.animeDetail, props.navigation]);

  const downloadAnimeFunction = useDownloadAnimeFunction();

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
            resolution: stateData.resolution,
            lastDuration: currentTime,
          };
          setHistory(stateData, currentLink.current, true, additionalData, false);
          historyData.current = additionalData;
        },
        2000,
      ),
    [],
  );

  const abortController = useRef<AbortController | null>(null);

  const [isPaused, setIsPaused] = useState(false);

  const initialInfoContainerHeight = useRef<number>(null);
  const isInfoPressed = useRef(false);
  const [synopsisTextLength, setSynopsisTextLength] = useState(0);
  const [hadSynopsisMeasured, setHadSynopsisMeasured] = useState(false);
  const synopsisHeight = useRef(0);
  const infoContainerHeight = useSharedValue(0);
  const infoContainerOpacity = useSharedValue(1);
  const infoContainerStyle = useAnimatedStyle(() => {
    return {
      opacity: infoContainerOpacity.get(),
      height: infoContainerHeight.get() === 0 ? 'auto' : infoContainerHeight.get(),
    };
  });

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
    SystemNavigationBar.fullScreen(true);
    SystemBars.setHidden(true);
    SystemNavigationBar.navigationHide();
    setFullscreen(true);
  }, []);

  const exitFullscreen = useCallback(() => {
    SystemNavigationBar.fullScreen(false);
    SystemBars.setHidden(false);
    SystemNavigationBar.navigationShow();
    Orientation.lockToPortrait();
    setFullscreen(false);
  }, []);

  const orientationDidChange = useCallback(
    (orientation: OrientationType) => {
      Orientation.getAutoRotateState(state => {
        if (state) {
          if (orientation === 'PORTRAIT') {
            exitFullscreen();
          } else if (orientation !== 'UNKNOWN') {
            enterFullscreen(orientation);
          }
        }
      });
    },
    [enterFullscreen, exitFullscreen],
  );

  const willUnmountHandler = useCallback(() => {
    Orientation.lockToPortrait();
    SystemBars.setHidden(false);
    SystemNavigationBar.navigationShow();
  }, []);

  // didMount and willUnmount
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

  // set header title
  useLayoutEffect(() => {
    props.navigation.setOptions({
      headerTitle: data.title,
      headerShown: !fullscreen,
    });
  }, [data, fullscreen, props.navigation]);

  // Battery level
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

  // BackHandler event
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
              ? 'Permintaan gagal.\nPastikan kamu terhubung dengan internet'
              : 'Error tidak diketahui: ' + err.message;
          DialogManager.alert('Error', errMessage);
          setLoading(false);
          return { error: true };
        });
      }
      if (resultData === undefined) {
        setLoading(false);
        DialogManager.alert('Ganti resolusi gagal', 'Gagal mengganti resolusi karena data kosong!');
        return;
      }
      if (typeof resultData !== 'string' && ('canceled' in resultData || 'error' in resultData)) {
        return;
      }
      const isKnownRawVideoHost = (videoUrl: string) =>
        videoUrl.includes('storage') && (videoUrl.includes('berkasdrive') || videoUrl.includes('dlgan')) ||
        videoUrl.includes('berkasdrive.com/dl/') ||
        videoUrl.includes('dlgan.space/st/') ||
        videoUrl.includes('dlgan.space/dl/') ||
        videoUrl.includes('dlgan.my.id') ||
        videoUrl.includes('googlevideo.com') ||
        videoUrl.includes('googleusercontent.com') ||
        (videoUrl.endsWith('.mp4') && !videoUrl.includes('.php?')) ||
        videoUrl.includes('is_hls=1') ||
        (videoUrl.includes('.m3u8') && !videoUrl.includes('.php?'));
      let isHlsNew = isKnownRawVideoHost(resultData) ? (resultData.includes('.m3u8') || resultData.includes('is_hls=1')) : false;
      const isWebviewNeeded = isKnownRawVideoHost(resultData)
        ? false
        : await fetch(resultData, {
            headers: {
              'User-Agent': deviceUserAgent,
              ...(resultData.includes('mp4upload') ? { Referer: 'https://www.mp4upload.com/' } : {}),
            },
            method: 'HEAD',
            signal,
          })
            .catch(() => {})
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
      setData(old => {
        return {
          ...old,
          streamingType: isWebviewNeeded ? 'embed' : 'raw',
          streamingLink: resultData,
          resolution,
          isHls: isHlsNew,
        };
      });
      setLoading(false);
      firstTimeLoad.current = true;
    },
    [data, loading],
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

  const downloadAnime = useCallback(async () => {
    if (data.streamingType === 'embed') {
      return ToastAndroid.show(
        'Jenis format ini tidak mendukung fitur download',
        ToastAndroid.SHORT,
      );
    }
    let source = data.streamingLink;
    const isHls = 'isHls' in data ? data.isHls : false;
    const downloadLink = 'downloadLink' in data ? data.downloadLink : undefined;
    
    if (isHls && downloadLink) {
      source = downloadLink;
    }
    if (!source || isHls && !downloadLink) {
      return ToastAndroid.show(
        'Maaf, server ini tidak mendukung download langsung.',
        ToastAndroid.SHORT,
      );
    }
    const resolution = data.resolution;
    await downloadAnimeFunction(
      source,
      downloadSource.current,
      data.title,
      resolution ?? '',
      undefined,
      () => {
        downloadSource.current = [...downloadSource.current, source];
        ToastAndroid.show('Sedang mendownload...', ToastAndroid.SHORT);
      },
    );
  }, [data, downloadAnimeFunction]);

  const handleProgress = useCallback(
    (currentTime: number) => {
      updateHistory(currentTime, data);
    },
    [updateHistory, data],
  );

  const episodeDataControl = useCallback(
    async (dataLink: string) => {
      if (loading) {
        return;
      }
      setLoading(true);
      const result = await AnimeAPI.fromUrl(
        dataLink,
        undefined,
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
            ? 'Permintaan gagal.\nPastikan kamu terhubung dengan internet'
            : 'Error tidak diketahui: ' + err.message;
        DialogManager.alert('Error', errMessage);
        setLoading(false);
      });
      if (result === undefined) {
        return;
      }
      if (result === 'Unsupported') {
        DialogManager.alert(
          'Tidak didukung!',
          'Anime yang kamu tuju tidak memiliki data yang didukung!',
        );
        setLoading(false);
        return;
      }

      if (result.type !== 'animeStreaming') {
        setLoading(false);
        DialogManager.alert(
          'Kesalahan!!',
          'Hasil perminataan tampaknya bukan data yang diharapkan, sepertinya ada kesalahan yang tidak diketahui.',
        );
        return;
      }

      setData(result);
      setHistory(result, dataLink, undefined, undefined);
      setLoading(false);
      firstTimeLoad.current = false;
      historyData.current = undefined;
      currentLink.current = dataLink;
    },
    [loading],
  );

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
    if (!animeDetail?.episodeList || currentEpisodeIndex === -1 || animeDetail.episodeList.length < 2) return;
    const firstEpNum = Number(extractEpNum(animeDetail.episodeList[0].title) || 0);
    const lastEpNum = Number(extractEpNum(animeDetail.episodeList[animeDetail.episodeList.length - 1].title) || 0);
    const isReversed = firstEpNum < lastEpNum;
    const nextIndex = isReversed ? currentEpisodeIndex + 1 : currentEpisodeIndex - 1;
    if (nextIndex >= 0 && nextIndex < animeDetail.episodeList.length) {
      episodeDataControl(animeDetail.episodeList[nextIndex].link);
    } else {
      ToastAndroid.show('Episode terakhir', ToastAndroid.SHORT);
    }
  }, [animeDetail, currentEpisodeIndex, episodeDataControl, extractEpNum]);

  const goPrevEp = useCallback(() => {
    if (!animeDetail?.episodeList || currentEpisodeIndex === -1 || animeDetail.episodeList.length < 2) return;
    const firstEpNum = Number(extractEpNum(animeDetail.episodeList[0].title) || 0);
    const lastEpNum = Number(extractEpNum(animeDetail.episodeList[animeDetail.episodeList.length - 1].title) || 0);
    const isReversed = firstEpNum < lastEpNum;
    const prevIndex = isReversed ? currentEpisodeIndex - 1 : currentEpisodeIndex + 1;
    if (prevIndex >= 0 && prevIndex < animeDetail.episodeList.length) {
      episodeDataControl(animeDetail.episodeList[prevIndex].link);
    } else {
      ToastAndroid.show('Episode pertama', ToastAndroid.SHORT);
    }
  }, [animeDetail, currentEpisodeIndex, episodeDataControl, extractEpNum]);

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
    ToastAndroid.show('Otomatis kembali ke durasi terakhir', ToastAndroid.SHORT);

    // DialogManager.alert('Perhatian', `
    // Fitur "lanjut menonton dari durasi terakhir" memiliki bug atau masalah.
    // Dan dinonaktifkan untuk sementara waktu, untuk melanjutkan menonton kamu bisa geser slider ke menit ${moment(historyData.current.lastDuration * 1000).format('mm:ss')}
    // `)
  }, [addExp, data.streamingLink]);

  useEffect(() => {
    if (isPaused) {
      videoRef.current?.props.player.pause();
    } else {
      videoRef.current?.props.player.play();
    }
  }, [isPaused]);

  const fullscreenUpdate = useCallback(
    (isFullscreen: boolean) => {
      if (isFullscreen) {
        exitFullscreen();
      } else {
        enterFullscreen();
      }
    },
    [enterFullscreen, exitFullscreen],
  );

  const measureAndUpdateSynopsisLayout = useCallback(
    (fromFullscreen = false) => {
      if (fromFullscreen) {
        if (hadSynopsisMeasured && initialInfoContainerHeight.current === null) {
          synopsisTextRef.current?.measure((_x, _y, _width, height, _pageX, _pageY) => {
            initialInfoContainerHeight.current = height;
          });
        } else if (!hadSynopsisMeasured) {
          // delay the measurement because if the layout is from fullscreen the width would be wrong
          return setTimeout(() => {
            synopsisTextRef.current?.measure((_x, _y, _width, height, _pageX, _pageY) => {
              setSynopsisTextLength(height / 20); // 20: lineheight
              synopsisHeight.current = height;
              setHadSynopsisMeasured(true);
            });
          }, 1000);
        }
      } else {
        if (hadSynopsisMeasured && initialInfoContainerHeight.current === null) {
          synopsisTextRef.current?.measure((_x, _y, _width, height, _pageX, _pageY) => {
            initialInfoContainerHeight.current = height;
          });
        } else if (!hadSynopsisMeasured) {
          synopsisTextRef.current?.measure((_x, _y, _width, height, _pageX, _pageY) => {
            setSynopsisTextLength(height / 20); // 20: lineheight
            synopsisHeight.current = height;
            setHadSynopsisMeasured(true);
          });
        }
      }
    },
    [hadSynopsisMeasured, synopsisTextRef],
  );
  const initialRender = useRef(true);
  useFocusEffect(
    useCallback(() => {
      fullscreen; // fix for react hooks deps. This is need because we need to call the code below when changing fullscreen state
      if (initialRender.current) {
        initialRender.current = false;
        return;
      }
      const mightBeTimeoutID = measureAndUpdateSynopsisLayout(true);
      return () => {
        clearTimeout(mightBeTimeoutID);
      };
    }, [fullscreen, measureAndUpdateSynopsisLayout]),
  );
  useLayoutEffect(() => {
    measureAndUpdateSynopsisLayout();
  }, [
    animeDetail?.synopsis,
    animeDetail?.rating,
    animeDetail?.genres,
    measureAndUpdateSynopsisLayout,
  ]);

  const onSynopsisPress = useCallback(async () => {
    if (!isInfoPressed.current) {
      infoContainerHeight.set(initialInfoContainerHeight.current!);

      /* 
      wait for the next event loop,
      make sure the infoContainerHeight is set to initialInfoContainerHeight before starting animation.
      This is to prevent jumping animation in react-native-reanimated
      */
      await new Promise(res => setTimeout(res, 0));
    }
    isInfoPressed.current = true;
    if (showSynopsis) {
      infoContainerHeight.set(
        withTiming(initialInfoContainerHeight.current as number, { duration: 350 }, () => {
          runOnJS(setShowSynopsis)(false);
        }),
      );
    } else {
      setShowSynopsis(true);
      queueMicrotask(() => {
        infoContainerHeight.set(withTiming(synopsisHeight.current, { duration: 350 }));
      });
    }
  }, [infoContainerHeight, showSynopsis]);

  const onSynopsisPressIn = useCallback(() => {
    infoContainerOpacity.set(withTiming(0.4, { duration: 100 }));
  }, [infoContainerOpacity]);

  const onSynopsisPressOut = useCallback(() => {
    infoContainerOpacity.set(withTiming(1, { duration: 100 }));
  }, [infoContainerOpacity]);

  const batteryAndClock = (
    <>
      {/* info baterai */}
      {fullscreen && batteryTimeEnable && (
        <View style={[styles.batteryInfo]} pointerEvents="none">
          {getBatteryIconComponent()}
          <Text style={{ color: darkText }}> {Math.round(batteryLevel * 100)}%</Text>
        </View>
      )}

      {/* info waktu/jam */}
      {fullscreen && batteryTimeEnable && (
        <View style={[styles.timeInfo]} pointerEvents="none">
          <TimeInfo />
        </View>
      )}
    </>
  );

  const resolutionDropdownData = useMemo(() => {
    return Object.entries(data.resolutionRaw)
      .filter(z => z[1] !== undefined)
      .map(z => {
        return { label: z[1].resolution, value: z[1] };
      });
  }, [data.resolutionRaw]);

  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      {/* Loading modal */}
      <LoadingModal setIsPaused={setIsPaused} isLoading={loading} cancelLoading={cancelLoading} />
      {/* VIDEO ELEMENT */}
      <View style={[fullscreen ? styles.fullscreen : styles.notFullscreen]}>
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
          // mengecek apakah video tersedia
          !data.streamingLink ? (
            <View style={{ flex: 1, zIndex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Icon name="exclamation-circle" color="#ff5252" size={48} />
              <Text style={{ color: 'white', marginTop: 10, fontSize: 16, fontWeight: '600' }}>Video tidak tersedia</Text>
              <Text style={{ color: '#aaa', marginTop: 4, fontSize: 13 }}>Server mungkin sedang mengalami masalah atau data tidak ditemukan.</Text>
            </View>
          ) : data.streamingType === 'raw' ? (
            <VideoPlayer
              // key={data.streamingLink}
              title={data.title}
              thumbnailURL={data.thumbnailUrl}
              streamingURL={data.streamingLink}
              style={{ flex: 1, zIndex: 1 }}
              videoRef={videoRef}
              ref={playerRef}
              fullscreen={fullscreen}
              onFullscreenUpdate={fullscreenUpdate}
              onDurationChange={handleProgress}
              onLoad={handleVideoLoad}
              isHls={('isHls' in data ? data.isHls : undefined) ?? data.streamingLink.includes('.m3u8')}
              headers={
                data.streamingLink.includes('mp4upload')
                  ? { Referer: 'https://www.mp4upload.com/' }
                  : undefined
              }
              batteryAndClock={batteryAndClock}
              showNextPrevButtons={true}
              onNextEp={goNextEp}
              onPrevEp={goPrevEp}
              disableNextEp={!hasNextEp || loading}
              disablePrevEp={!hasPrevEp || loading}
            />
          ) : data.streamingType === 'embed' ? (
            // <>
            //   {/* TEMP|TODO|WORKAROUND: Temporary fix for webview layout not working properly when using native-stack */}
            //   <VideoPlayer title="" streamingURL="" style={{ display: 'none' }} />
            <WebView
              style={{ flex: 1, zIndex: 1 }}
              ref={webviewRef}
              key={data.streamingLink}
              setSupportMultipleWindows={false}
              onShouldStartLoadWithRequest={navigator => {
                const parsedHost = url.parse(data.streamingLink).host as string;
                const isApprovedHost = parsedHost ? navigator.url.includes(parsedHost) : true;
                const res =
                  isApprovedHost ||
                  navigator.url.includes(defaultLoadingGif) ||
                  navigator.url.includes('archive.org') ||
                  navigator.url.includes('zencdn.net') || // video.js
                  navigator.url.includes('.mp4') ||
                  navigator.url.includes('.m3u8') ||
                  navigator.url.includes('.ts');
                if (!res && navigator.isTopFrame) {
                  // Only stop loading if it's a top-frame HTML redirect to unknown site
                  webviewRef.current?.stopLoading();
                }
                return true; // Return true to allow internal media fetches in WebViews
              }}
              source={{
                ...(data.resolution?.includes('lokal')
                  ? {
                      html: `
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Document</title>
</head>
<body>
  <iframe
    src="${data.streamingLink}"
    style="width: 100vw; height: 100vh;"
    allowFullScreen
  ></iframe>
</body>`,
                    }
                  : { uri: data.streamingLink }),
                baseUrl: `https://${url.parse(data.streamingLink).host}`,
              }}
              userAgent={data.resolution?.includes('lokal') ? undefined : deviceUserAgent}
              originWhitelist={['*']}
              allowsFullscreenVideo={true}
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback={true}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              onLoadEnd={handleVideoLoad}
              injectedJavaScript={`
                window.alert = function() {}; // Disable alerts
                window.confirm = function() {}; // Disable confirms
                window.prompt = function() {}; // Disable prompts
                window.open = function() { return window; }; // Disable opening new windows but return window to avoid breaking click-to-play scripts
                
                try {
                  var style = document.createElement('style');
                  style.innerHTML = '.pilih_server { opacity: 0.25 !important; transform: scale(0.6) !important; transform-origin: top right !important; transition: all 0.3s ease !important; } .pilih_server:active, .pilih_server:hover { opacity: 1 !important; transform: scale(0.9) !important; }';
                  document.head.appendChild(style);
                } catch(e) {}
              `}
            />
          ) : (
            // </>
            <Text style={{ color: 'white' }}>Video tidak tersedia</Text>
          )
        }
        {data.streamingType === 'embed' && batteryAndClock}
      </View>
      {/* END OF VIDEO ELEMENT */}
      {/* 
        mengecek apakah sedang dalam keadaan fullscreen atau tidak
        jika ya, maka hanya menampilkan video saja 
       */}
      <KeyboardAwareScrollView
        bottomOffset={80}
        style={{ flex: 1, display: fullscreen ? 'none' : 'flex' }}
        contentContainerStyle={{ paddingBottom: insets.bottom }}>
        {/* movie information */}

        {/* acefile embed information */}
        {(data.resolution?.includes('acefile') || data.resolution?.includes('video')) &&
          data.streamingType === 'embed' && (
            <View style={{ backgroundColor: theme.colors.tertiaryContainer, marginVertical: 5 }}>
              <Icon
                name="server"
                color={theme.colors.onTertiaryContainer}
                size={26}
                style={{ alignSelf: 'center' }}
              />
              <Text
                style={{
                  color: theme.colors.onTertiaryContainer,
                  textAlign: 'center',
                  fontSize: 14,
                  fontWeight: 'bold',
                }}>
                AceFile
              </Text>
              <Text style={{ color: theme.colors.onTertiaryContainer }}>
                Tampaknya server AceFile untuk resolusi ini mengalami masalah. Terkadang server
                membutuhkan beberapa waktu untuk memproses data, silahkan coba lagi. Jika masalah
                berlanjut silahkan ganti server atau resolusi lain.
              </Text>
            </View>
          )}
        {/* We no longer show the embed 'Pihak Ketiga' warning because old anime natively require WebView */}
        {/* embed reload button */}
        {data.streamingType === 'embed' && (
          <TouchableOpacity
            style={styles.reloadPlayer}
            onPress={async () => {
              if (data.streamingLink === '') return;
              const streamingLink = data.streamingLink;
              setData(datas => {
                return {
                  ...datas,
                  streamingLink: '',
                };
              });
              await new Promise(res => setTimeout(res, 500));
              setData(datas => {
                return {
                  ...datas,
                  streamingLink,
                };
              });
            }}>
            <Icon
              name="refresh"
              color={theme.colors.onSecondaryContainer}
              size={15}
              style={{ alignSelf: 'center' }}
            />
            <Text style={{ color: theme.colors.onSecondaryContainer }}>Reload video player</Text>
          </TouchableOpacity>
        )}
        <Pressable
          style={[styles.container]}
          onPressIn={onSynopsisPressIn}
          onPressOut={onSynopsisPressOut}
          // onLayout={onSynopsisLayout}
          onPress={onSynopsisPress}
          disabled={synopsisTextLength < 3}>
          <Text style={[globalStyles.text, styles.infoTitle]}>{data.title}</Text>

          {animeDetail !== undefined ? (
            <ReAnimated.Text
              ref={synopsisTextRef}
              style={[
                globalStyles.text,
                styles.infoSinopsis,
                infoContainerStyle,
                {
                  position: hadSynopsisMeasured ? 'relative' : 'absolute',
                  opacity: hadSynopsisMeasured ? undefined : 0,
                },
              ]}
              numberOfLines={!showSynopsis && hadSynopsisMeasured ? 2 : undefined}>
              {animeDetail?.synopsis || 'Tidak ada sinopsis'}
            </ReAnimated.Text>
          ) : (
            <Skeleton stopOnBlur={false} width={150} height={20} />
          )}
          {!hadSynopsisMeasured && animeDetail !== undefined && (
            <Skeleton stopOnBlur={false} width={150} height={20} />
          )}

          <View style={[styles.infoGenre]}>
            {animeDetail === undefined ? (
              <View style={{ gap: 5, flexDirection: 'row' }}>
                <Skeleton stopOnBlur={false} width={50} height={20} />
                <Skeleton stopOnBlur={false} width={50} height={20} />
                <Skeleton stopOnBlur={false} width={50} height={20} />
              </View>
            ) : (
              animeDetail.genres.map(genre => (
                <Text key={genre} style={[globalStyles.text, styles.genre]}>
                  {genre}
                </Text>
              ))
            )}
          </View>

          <View style={styles.infoData}>
            <Text
              style={[
                globalStyles.text,
                styles.status,
                {
                  backgroundColor:
                    animeDetail?.status === 'Completed' || animeDetail?.status === 'Movie'
                      ? 'green'
                      : 'red',
                },
              ]}>
              {animeDetail?.status}
            </Text>
            <Text style={[{ color: lightText }, styles.releaseYear]}>
              <Icon name="calendar" color={styles.releaseYear.color} /> {animeDetail?.releaseYear}
            </Text>
            <Text style={[globalStyles.text, styles.rating]}>
              <Icon name="star" color="black" /> {animeDetail?.rating}
            </Text>
          </View>

          {synopsisTextLength >= 3 && (
            <View style={{ alignItems: 'center', marginTop: 3 }}>
              {showSynopsis ? (
                <Icon
                  name="chevron-up"
                  size={20}
                  color={colorScheme === 'dark' ? 'white' : 'black'}
                />
              ) : (
                <Icon
                  name="chevron-down"
                  size={20}
                  color={colorScheme === 'dark' ? 'white' : 'black'}
                />
              )}
            </View>
          )}
        </Pressable>

        <Button
          mode="contained-tonal"
          icon="information"
          style={{ marginTop: 5, marginHorizontal: 10 }}
          onPress={() => {
            props.navigation.push('AnimeDetail', {
              data: animeDetail as any,
              link: data.episodeData.animeDetail,
            });
          }}
          disabled={!animeDetail}
        >
          Buka Halaman Detail Anime
        </Button>

        <View style={[styles.container, { marginTop: 10, gap: 10 }]}>
          {data.episodeData && (
            <View style={[styles.episodeDataControl]}>
              <Button
                mode="contained-tonal"
                icon="arrow-left"
                key="prev"
                disabled={!data.episodeData.previous}
                style={[styles.episodeDataControlButton]}
                onPress={async () => {
                  await episodeDataControl(data.episodeData?.previous as string); // ignoring the undefined type because we already have the button disabled
                }}>
                Sebelumnya
              </Button>

              <Button
                mode="contained-tonal"
                icon="arrow-right"
                key="next"
                disabled={!data.episodeData.next}
                style={[styles.episodeDataControlButton]}
                contentStyle={{ flexDirection: 'row-reverse' }}
                onPress={async () => {
                  await episodeDataControl(data.episodeData?.next as string); // ignoring the undefined type because we already have the button disabled
                }}>
                Selanjutnya
              </Button>
            </View>
          )}

          {/* Horizontal Episode Grid */}
          {animeDetail?.episodeList && animeDetail.episodeList.length > 1 && (
            <View style={{ marginTop: 4 }}>
              <Text style={[globalStyles.text, { fontSize: 13, fontWeight: '600', marginBottom: 6, paddingHorizontal: 16, color: colorScheme === 'dark' ? '#ccc' : '#333' }]}>
                Episode
              </Text>
              <FlatList
                ref={episodeListRef}
                horizontal
                data={animeDetail.episodeList}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 4 }}
                keyExtractor={(item, idx) => item.link + idx}
                getItemLayout={(_data, index) => ({
                  length: 48, offset: (48 + 8) * index, index,
                })}
                onScrollToIndexFailed={(info) => {
                  // Fallback: scroll to nearest available index
                  const wait = new Promise(resolve => setTimeout(resolve, 500));
                  wait.then(() => {
                    episodeListRef.current?.scrollToIndex({ index: info.highestMeasuredFrameIndex, animated: true });
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
                      onPress={() => episodeDataControl(item.link)}
                      width={48}
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

          <TouchableOpacity
            style={{ maxWidth: '50%' }}
            onPress={() => {
              dropdownResolutionRef.current?.open();
            }}>
            <View pointerEvents="box-only">
              <Dropdown
                ref={dropdownResolutionRef}
                value={{
                  label: data.resolution,
                  value:
                    data.resolutionRaw?.[
                      data.resolutionRaw.findIndex(e => e.resolution === data.resolution)
                    ],
                }}
                placeholder="Pilih resolusi"
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
                activeColor="#16687c"
                selectedTextStyle={styles.dropdownSelectedTextStyle}
                placeholderStyle={{ color: globalStyles.text.color }}
                autoScroll
                dropdownPosition="top"
              />
            </View>
          </TouchableOpacity>
        </View>

        {data.resolution?.includes('pogo') && (
          <Text style={[globalStyles.text, { color: '#ff6600', fontWeight: 'bold' }]}>
            Kamu menggunakan server pogo!, sangat tidak disarankan untuk skip/seek/menggeser menit
            dikarenakan akan menyebabkan loading yang sangat lama dan kemungkinan akan menghabiskan
            kuota data kamu. Disarankan untuk mengunduh/download video ini lewat tombol dibawah dan
            menontonnya saat proses download sudah selesai secara offline!
          </Text>
        )}

        {data.resolution?.includes('lokal') && (
          <Text style={[globalStyles.text, { color: '#ff6600', fontWeight: 'bold' }]}>
            Kamu menggunakan server "lokal". Perlu di ingat server ini tidak mendukung pemutaran
            melalui aplikasi dan akan menggunakan WebView untuk memutar video melalui server ini,
            jadi fitur download dan "lanjut dari histori" tidak akan bekerja ketika kamu menggunakan
            server "lokal".{'\n'}
            Harap gunakan server ini sebagai alternatif akhir jika server lain tidak berfungsi.
          </Text>
        )}

        <Button
          mode="contained"
          style={{ marginTop: 12, marginHorizontal: 10 }}
          onPress={downloadAnime}>
          <Icon name="download" size={23} /> Download
        </Button>
        <View style={{ marginVertical: 10 }}>
          <CommentSection
            contentId={data.episodeData?.animeDetail}
            contentType={'anime'} 
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

function LoadingModal({
  isLoading,
  cancelLoading,
  setIsPaused,
}: {
  isLoading: boolean;
  cancelLoading: () => void;
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const globalStyles = useGlobalStyles();
  const styles = useStyles();
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
      setIsPaused(() => false);
    }
  }, [isLoading, setIsPaused]);

  const entering = useMemo(() => FadeInUp.duration(300), []);
  const exiting = useMemo(() => FadeOutDown.duration(300), []);

  return (
    isLoading && (
      <View style={styles.modalContainer}>
        <ReAnimated.View entering={entering} exiting={exiting} style={styles.modalContent}>
          <TouchableOpacity
            onPress={cancelLoading}
            style={{ position: 'absolute', top: 5, right: 5 }} //rngh
          >
            <Icon name="close" size={28} color="red" />
          </TouchableOpacity>
          <ActivityIndicator size={28} />
          <Text style={globalStyles.text}>Tunggu sebentar, sedang mengambil data...</Text>
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
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
        notFullscreen: {
          position: 'relative',
          aspectRatio: 16 / 9,
          backgroundColor: '#000',
        },
        container: {
          backgroundColor: colorScheme === 'dark' ? '#1F1F1F' : '#FFFFFF',
          padding: 15,
          borderRadius: 12,
          marginHorizontal: 10,
          marginVertical: 5,
          elevation: 2,
        },
        infoTitle: {
          fontSize: 20,
          fontWeight: '600',
          color: colorScheme === 'dark' ? '#FFFFFF' : '#1A1A1A',
          marginBottom: 10,
        },
        infoSinopsis: {
          fontSize: 14,
          lineHeight: 20,
          color: colorScheme === 'dark' ? '#A0A0A0' : '#666666',
        },
        infoGenre: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          marginVertical: 10,
          gap: 8,
          alignContent: 'center',
          alignItems: 'center',
        },
        genre: {
          backgroundColor: colorScheme === 'dark' ? '#333333' : '#F0F0F0',
          paddingVertical: 4,
          paddingHorizontal: 10,
          borderRadius: 15,
          fontSize: 12,
          color: colorScheme === 'dark' ? '#D0D0D0' : '#555555',
        },
        infoData: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-around',
          alignContent: 'center',
          alignItems: 'center',
          marginTop: 10,
        },
        status: {
          paddingVertical: 4,
          paddingHorizontal: 10,
          borderRadius: 15,
          fontSize: 12,
          fontWeight: '600',
          color: '#FFFFFF',
          backgroundColor: '#4CAF50',
        },
        releaseYear: {
          backgroundColor: colorScheme === 'dark' ? '#333333' : '#F0F0F0',
          paddingVertical: 4,
          paddingHorizontal: 10,
          borderRadius: 15,
          fontSize: 12,
          color: colorScheme === 'dark' ? '#D0D0D0' : '#555555',
        },
        rating: {
          backgroundColor: '#FFD700',
          paddingVertical: 4,
          paddingHorizontal: 10,
          borderRadius: 15,
          fontSize: 12,
          color: '#1A1A1A',
          fontWeight: '600',
        },
        episodeDataControl: {
          flexDirection: 'row',
          gap: 10,
          justifyContent: 'center',
          marginBottom: 15,
        },
        episodeDataControlButton: {
          flex: 1,
          alignItems: 'center',
        },
        dropdownStyle: {
          backgroundColor: colorScheme === 'dark' ? '#333333' : '#F5F5F5',
          padding: 10,
          borderRadius: 8,
          borderWidth: 0,
        },
        dropdownContainerStyle: {
          width: 200,
          borderRadius: 8,
          backgroundColor: colorScheme === 'dark' ? '#333333' : '#F5F5F5',
          borderWidth: 0,
          elevation: 5,
        },
        dropdownItemTextStyle: {
          color: globalStyles.text.color,
          fontSize: 14,
        },
        dropdownItemContainerStyle: {
          borderRadius: 6,
          backgroundColor: colorScheme === 'dark' ? '#333333' : '#F5F5F5',
        },
        dropdownSelectedTextStyle: {
          color: globalStyles.text.color,
          fontSize: 14,
        },
        reloadPlayer: {
          backgroundColor: theme.colors.secondaryContainer,
          borderRadius: 8,
          padding: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginHorizontal: 10,
          marginVertical: 10,
        },
        warningContainer: {
          backgroundColor: colorScheme === 'dark' ? '#333333' : '#FFF3E0',
          borderRadius: 8,
          padding: 15,
          marginHorizontal: 10,
          marginVertical: 5,
          borderLeftWidth: 4,
          borderLeftColor: '#FF9800',
        },
        warningText: {
          color: colorScheme === 'dark' ? '#FFB300' : '#E65100',
          fontSize: 13,
          lineHeight: 18,
        },
      }),
    [colorScheme, globalStyles.text.color, theme],
  );
}
export default memo(Video);
