import { Dropdown } from '@pirles/react-native-element-dropdown';
import Icon from '@react-native-vector-icons/fontawesome';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  useColorScheme,
  View,
} from 'react-native';
import { ActivityIndicator, Button, useTheme } from 'react-native-paper';
import { useKeepAwake } from 'expo-keep-awake';
import { SystemBars } from 'react-native-edge-to-edge';
import Orientation, { OrientationType } from 'react-native-orientation-locker';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/core';
import useGlobalStyles from '../../assets/style';
import { RootStackNavigator } from '../../types/navigation';
import { FilmStream, FilmSeason } from '../../types/film';
import { FilmAPI } from '../../utils/FilmAPI';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useLevel } from '../../misc/LevelContext';
import { EXP_REWARDS } from '../../utils/LevelSystem';
import setHistory from '../../utils/historyControl';
import { usePresenceActivity } from '../../utils/presenceSystem';
import CommentSection from '../Comments/CommentSection';
import { KeyboardAwareScrollView, KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useTimeTracker } from '../../utils/UserTracker';
import NobarInviteSheet from './NobarInviteSheet';
import NobarChatSection from './NobarChatSection';
import { useWatchParty, WatchPartyState } from '../../hooks/useWatchParty';
import { useAuth } from '../../misc/AuthContext';
import { useLanguage } from '../../misc/LanguageContext';
import { WebView } from 'react-native-webview';
import { TouchableOpacity } from '../misc/TouchableOpacityRNGH';
import { normalizeMediaKey } from '../../types/forum';
import {
  buildNobarWebViewCommandScript,
  NOBAR_WEBVIEW_BRIDGE_SCRIPT,
} from '../../utils/nobarWebViewSync';

type Props = NativeStackScreenProps<RootStackNavigator, 'FilmPlayer'>;

// Script to inject into WebView to block popups, ads, and clickjack overlays
const AD_BLOCK_SCRIPT = `
  (function() {
    // Block window.open (pop-ups / pop-unders)
    window.open = function() { return null; };

    // Block target="_blank" links
    document.addEventListener('click', function(e) {
      var a = e.target.closest ? e.target.closest('a') : null;
      if (a && a.target === '_blank') {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // Remove clickjack ad overlays that cover the player
    // These are full-screen invisible anchors linking to ad URLs
    function removeAdOverlays() {
      var overlays = document.querySelectorAll('#overlay, #uyeouyeo, a[href*="yellowishgather"], a[href*="gather.com"]');
      for (var i = 0; i < overlays.length; i++) {
        overlays[i].parentNode && overlays[i].parentNode.removeChild(overlays[i]);
      }
      // Also remove any full-screen positioned anchor that covers the player
      var allAnchors = document.querySelectorAll('a');
      for (var j = 0; j < allAnchors.length; j++) {
        var style = window.getComputedStyle(allAnchors[j]);
        if (style.position === 'absolute' && style.top === '0px' && style.left === '0px' &&
            (style.width === '100%' || parseInt(style.width) > window.innerWidth * 0.9) &&
            (style.height === '100%' || parseInt(style.height) > window.innerHeight * 0.9)) {
          allAnchors[j].parentNode && allAnchors[j].parentNode.removeChild(allAnchors[j]);
        }
      }
      // Remove message-box overlays (the "click to play" ad interstitial)
      var msgBoxes = document.querySelectorAll('.message-box');
      for (var k = 0; k < msgBoxes.length; k++) {
        msgBoxes[k].parentNode && msgBoxes[k].parentNode.removeChild(msgBoxes[k]);
      }
      // Remove spinner overlay (loading is handled by our own indicator)
      var spinner = document.getElementById('loading-spinner');
      if (spinner) spinner.parentNode && spinner.parentNode.removeChild(spinner);
    }

    // Remove overlays immediately and keep checking (page may add them dynamically)
    removeAdOverlays();
    var overlayInterval = setInterval(removeAdOverlays, 300);
    setTimeout(function() { clearInterval(overlayInterval); }, 10000);

    // Observe DOM changes to catch dynamically injected ad overlays
    if (window.MutationObserver) {
      new MutationObserver(function() { removeAdOverlays(); })
        .observe(document.documentElement, { childList: true, subtree: true });
    }

    // Prevent adding ad iframes — only keep known player iframes
    var PLAYER_DOMAINS = ['videonode', 'playcdn', 'emturbovid', 'abyssplayer', 'gn1r5n', 'hydrax', 'turbovip', 'cast'];
    var origCreateElement = document.createElement.bind(document);
    document.createElement = function(tag) {
      var el = origCreateElement(tag);
      if (tag.toLowerCase() === 'iframe') {
        setTimeout(function() {
          if (el.parentNode) {
            var src = (el.src || '').toLowerCase();
            var isPlayer = PLAYER_DOMAINS.some(function(d) { return src.includes(d); });
            // Remove tiny hidden iframes (Cloudflare challenge, ad trackers)
            if (!isPlayer && (el.width <= 1 || el.height <= 1 ||
                el.style.visibility === 'hidden' || el.style.display === 'none')) {
              el.parentNode.removeChild(el);
            }
          }
        }, 100);
      }
      return el;
    };

    // Block devtools detection (the debugger trap and timer check)
    // Override debugger statement effect by neutering the detection function
    window.devtoolIsOpening = function() {};

    // Handle tap on player to toggle controls visibility
    document.addEventListener('click', function(e) {
      var btn = e.target.closest ? e.target.closest('button, .jw-button-color, .jw-slider-time, .jw-settings-menu, input, a, .vjs-control, .plyr__controls') : null;
      if (btn) return;
      var jw = document.querySelector('.jwplayer');
      if (jw) {
        if (jw.classList.contains('jw-flag-user-inactive')) {
          jw.classList.remove('jw-flag-user-inactive');
        } else {
          jw.classList.add('jw-flag-user-inactive');
        }
      }
      var vjs = document.querySelector('.video-js');
      if (vjs) {
        if (vjs.classList.contains('vjs-user-inactive')) {
          vjs.classList.remove('vjs-user-inactive');
          vjs.classList.add('vjs-user-active');
        } else {
          vjs.classList.remove('vjs-user-active');
          vjs.classList.add('vjs-user-inactive');
        }
      }
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'TOGGLE_CONTROLS' }));
        }
      } catch(err) {}
    }, true);

    true;
  })();
`;


function FilmPlayer(props: Props) {
  const { streams, title, subjectId, detailPath, type, poster, language } = props.route.params;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = useTheme();
  const { profile, user } = useAuth();
  const { t } = useLanguage();
  const globalStyles = useGlobalStyles();
  const styles = useStyles(isDark);

  const isTV = type === 'tv';
  const initialSeason = props.route.params.season || 1;
  const initialEpisode = props.route.params.episode || 1;

  useTimeTracker('movie');
  useKeepAwake();

  const [currentStreams, setCurrentStreams] = useState<FilmStream[]>(
    props.route.params.streams,
  );
  const [selectedStream, setSelectedStream] = useState<FilmStream | null>(
    props.route.params.streams[0] || null,
  );
  const [seasons] = useState<FilmSeason[]>(props.route.params.seasons || []);

  const [fullscreen, setFullscreen] = useState(false);
  const [showFullscreenControls, setShowFullscreenControls] = useState(false);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const fullscreenRef = useRef(fullscreen);
  fullscreenRef.current = fullscreen;

  const startAutoHideTimer = useCallback(() => {
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }
    hideControlsTimer.current = setTimeout(() => {
      setShowFullscreenControls(false);
    }, 3500);
  }, []);

  const cancelAutoHideTimer = useCallback(() => {
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
      hideControlsTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, []);

  const [isLoadingEp, setIsLoadingEp] = useState(false);
  const [season, setSeason] = useState(initialSeason);
  const [episode, setEpisode] = useState(initialEpisode);
  const [webViewLoading, setWebViewLoading] = useState(true);

  const isGuest = Boolean((props.route.params as any).isGuest);
  const isHost = !isGuest;
  const initialRoomId = (props.route.params as any).roomId || null;
  const [inviteVisible, setInviteVisible] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(initialRoomId);
  const [nobarPortraitTab, setNobarPortraitTab] = useState<'chat' | 'controls'>('chat');
  const isNobarGuest = !!roomId && isGuest;

  const watchPartyMetadata = useMemo(
    () => ({
      ...props.route.params,
      streams: currentStreams,
      season,
      episode,
      title,
    }),
    [props.route.params, currentStreams, season, episode, title],
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
  } = useWatchParty(roomId || null, isHost, watchPartyMetadata);

  usePresenceActivity(t('player.presenceWatching', { title: `${title}${isTV ? ` S${season} E${episode}` : ''}` }));

  const { addExp } = useLevel();
  const awardedExpRef = useRef(new Set<string>());
  const historyData = props.route.params.historyData;
  const lastWebViewPlaybackRef = useRef<{
    playerState: 'PLAYING' | 'PAUSED';
    currentTime: number;
    timestamp: number;
  } | null>(null);
  const latestRemoteStateRef = useRef<WatchPartyState | null>(null);
  latestRemoteStateRef.current = remoteState;

  const handleLeaveNobar = useCallback(async () => {
    await closeRoom();
    setRoomId(null);
    setInviteVisible(false);
    setNobarPortraitTab('chat');
  }, [closeRoom]);

  useEffect(() => {
    if (syncRequestCount > 0 && isHost && roomId && selectedStream) {
      broadcastMediaChange(`${season}-${episode}|${selectedStream.url}`);
      if (lastWebViewPlaybackRef.current) {
        broadcastState(
          lastWebViewPlaybackRef.current.playerState,
          lastWebViewPlaybackRef.current.currentTime,
        );
      } else {
        broadcastState('PAUSED', 0);
      }
    }
  }, [
    syncRequestCount,
    isHost,
    roomId,
    season,
    episode,
    selectedStream,
    broadcastMediaChange,
    broadcastState,
  ]);

  useEffect(() => {
    if (roomId) {
      if (isRoomClosed && isGuest) {
        ToastAndroid.show(t('nobar.roomClosedByHost'), ToastAndroid.LONG);
        setRoomId(null);
        setInviteVisible(false);
        setNobarPortraitTab('chat');
      } else if (connectionStatus === 'DISCONNECTED') {
        ToastAndroid.show(t('nobar.disconnectedToast'), ToastAndroid.LONG);
        setRoomId(null);
        setInviteVisible(false);
        setNobarPortraitTab('chat');
      } else if (isHostMissing && isGuest) {
        ToastAndroid.show(t('nobar.hostLeftToast'), ToastAndroid.LONG);
        setRoomId(null);
        setInviteVisible(false);
        setNobarPortraitTab('chat');
      }
    }
  }, [roomId, isRoomClosed, connectionStatus, isHostMissing, isGuest, t]);

  useEffect(() => {
    if (isNobarGuest && remoteState && webviewRef.current) {
      webviewRef.current.injectJavaScript(
        buildNobarWebViewCommandScript(remoteState),
      );
    }
  }, [isNobarGuest, remoteState]);

  const filmLink = useMemo(() =>
    isTV
      ? `film://${subjectId}/${detailPath}?se=${season}&ep=${episode}`
      : `film://${subjectId}/${detailPath}`,
    [subjectId, detailPath, isTV, season, episode],
  );

  // Award EXP and record history when WebView loads
  const handleWebViewLoad = useCallback(() => {
    setWebViewLoading(false);
    const expKey = isTV ? `${subjectId}-S${season}E${episode}` : subjectId;
    if (!awardedExpRef.current.has(expKey)) {
      awardedExpRef.current.add(expKey);
      const amount = EXP_REWARDS.WATCH_MOVIE;
      addExp(amount);
      ToastAndroid.show(`+${amount} EXP`, ToastAndroid.SHORT);
    }

    const episodeStr = isTV ? `S${season}E${episode}` : null;
    setHistory(
      { title, thumbnailUrl: poster || '' } as any,
      filmLink,
      false,
      { thumbnailUrl: poster || '', episode: episodeStr } as any,
      !isTV,
    );

    if (isNobarGuest) {
      if (latestRemoteStateRef.current) {
        webviewRef.current?.injectJavaScript(
          buildNobarWebViewCommandScript(latestRemoteStateRef.current),
        );
        setTimeout(() => {
          if (latestRemoteStateRef.current) {
            webviewRef.current?.injectJavaScript(
              buildNobarWebViewCommandScript(latestRemoteStateRef.current),
            );
          }
        }, 1200);
      } else {
        requestSync();
      }
    }
  }, [addExp, episode, isTV, season, subjectId, title, poster, filmLink, isNobarGuest, requestSync]);

  const insets = useSafeAreaInsets();
  const webviewRef = useRef<any>(null);

  const enterFullscreen = useCallback((landscape?: OrientationType) => {
    if (landscape === undefined) Orientation.lockToLandscape();
    else {
      switch (landscape) {
        case 'LANDSCAPE-LEFT': Orientation.lockToLandscapeLeft(); break;
        case 'LANDSCAPE-RIGHT': Orientation.lockToLandscapeRight(); break;
        default: Orientation.lockToLandscape();
      }
    }
    StatusBar.setHidden(true);
    SystemBars.setHidden(true);
    SystemNavigationBar.navigationHide();
    SystemNavigationBar.stickyImmersive(true);
    SystemNavigationBar.fullScreen(true);
    setFullscreen(true);
    setShowFullscreenControls(true);
    startAutoHideTimer();
    try {
      webviewRef.current?.injectJavaScript("try { var v = document.querySelector('video') || document.querySelector('iframe'); if (v && v.requestFullscreen) v.requestFullscreen(); } catch(e) {} true;");
    } catch (e) {}
  }, [startAutoHideTimer]);

  const exitFullscreen = useCallback(() => {
    cancelAutoHideTimer();
    setShowFullscreenControls(false);
    Orientation.lockToPortrait();
    StatusBar.setHidden(false);
    SystemBars.setHidden(false);
    SystemNavigationBar.navigationShow();
    SystemNavigationBar.fullScreen(false);
    setFullscreen(false);
    try {
      webviewRef.current?.injectJavaScript("try { if (document.exitFullscreen) document.exitFullscreen(); } catch(e) {} true;");
    } catch (e) {}
  }, [cancelAutoHideTimer]);

  const orientationDidChange = useCallback(
    (orientation: OrientationType) => {
      Orientation.getAutoRotateState(state => {
        if (!state) return;
        if (fullscreenRef.current) {
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
    [enterFullscreen, exitFullscreen],
  );

  useFocusEffect(useCallback(() => {
    Orientation.addDeviceOrientationListener(orientationDidChange);
    return () => {
      Orientation.removeAllListeners();
      Orientation.lockToPortrait();
      StatusBar.setHidden(false);
      SystemBars.setHidden(false);
      SystemNavigationBar.navigationShow();
      SystemNavigationBar.fullScreen(false);
    };
  }, [orientationDidChange]));

  useBackHandler(useCallback(() => {
    if (fullscreen) { exitFullscreen(); return true; }
    return false;
  }, [exitFullscreen, fullscreen]));

  const serverData = useMemo(() =>
    currentStreams.map(s => ({
      label: s.codecName || s.resolutions || t('player.server'),
      value: s.id,
    })),
    [currentStreams, t],
  );

  const handleServerChange = useCallback((serverId: string) => {
    if (isNobarGuest) return;
    const stream = currentStreams.find(s => s.id === serverId);
    if (stream) {
      setSelectedStream(stream);
      setWebViewLoading(true);
      lastWebViewPlaybackRef.current = null;
      if (isHost && roomId) {
        broadcastMediaChange(`${season}-${episode}|${stream.url}`);
        broadcastState('PAUSED', 0);
      }
    }
  }, [isNobarGuest, currentStreams, isHost, roomId, season, episode, broadcastMediaChange, broadcastState]);

  const loadEpisode = useCallback(async (s: number, e: number, fromHostSync = false) => {
    if (!fromHostSync && isNobarGuest) return;
    setIsLoadingEp(true);
    try {
      const source = props.route.params.source || 'lk21';
      const newStreams = await FilmAPI.getPlayStreams(source, subjectId, detailPath, s, e);
      if (newStreams.length > 0) {
        setCurrentStreams(newStreams);
        setSelectedStream(newStreams[0]);
        setSeason(s);
        setEpisode(e);
        setWebViewLoading(true);
        lastWebViewPlaybackRef.current = null;

        const epLink = `film://${subjectId}/${detailPath}?se=${s}&ep=${e}`;
        setHistory(
          { title, thumbnailUrl: poster || '' } as any,
          epLink,
          false,
          { thumbnailUrl: poster || '', episode: `S${s}E${e}` } as any,
          !isTV,
        );

        if (isHost && roomId) {
          broadcastMediaChange(`${s}-${e}|${newStreams[0].url}`);
          broadcastState('PAUSED', 0);
        }
      } else {
        ToastAndroid.show(t('player.episodeUnavailable'), ToastAndroid.SHORT);
      }
    } catch {
      ToastAndroid.show(t('player.failedLoadEpisode'), ToastAndroid.SHORT);
    } finally {
      setIsLoadingEp(false);
    }
  }, [isNobarGuest, props.route.params.source, subjectId, detailPath, title, poster, isHost, roomId, broadcastMediaChange, broadcastState, isTV, t]);

  // Handle nobar media change from host
  const lastMediaChangeRef = useRef<string | null>(null);

  useEffect(() => {
    if (roomId && mediaChangeLink && isGuest && mediaChangeLink !== lastMediaChangeRef.current) {
      lastMediaChangeRef.current = mediaChangeLink;
      const sepIndex = mediaChangeLink.indexOf('|');
      const epPart = sepIndex >= 0 ? mediaChangeLink.slice(0, sepIndex) : mediaChangeLink;
      const targetUrl = sepIndex >= 0 ? mediaChangeLink.slice(sepIndex + 1) : '';
      const epParts = epPart.split('-');

      if (epParts.length === 2) {
        const s = parseInt(epParts[0], 10);
        const e = parseInt(epParts[1], 10);
        if (!isNaN(s) && !isNaN(e)) {
          if (s !== season || e !== episode) {
            loadEpisode(s, e, true);
          } else if (targetUrl) {
            const stream = currentStreams.find(st => st.url === targetUrl);
            if (stream && stream.id !== selectedStream?.id) {
              setSelectedStream(stream);
              setWebViewLoading(true);
            }
          }
        }
      }
    }
  }, [roomId, mediaChangeLink, isGuest, loadEpisode, season, episode, currentStreams, selectedStream]);

  const currentSeasonData = useMemo(() => {
    return seasons.find(s => (s.seasonNumber ?? s.se) === season);
  }, [seasons, season]);

  const maxEpisodeInSeason = useMemo(() => {
    if (currentSeasonData?.episodes && currentSeasonData.episodes.length > 0) {
      return Math.max(...currentSeasonData.episodes);
    }
    return currentSeasonData?.maxEp || 999;
  }, [currentSeasonData]);

  const hasPrevEpisode = isTV && episode > 1;
  const hasNextEpisode = isTV && (maxEpisodeInSeason === 999 || episode < maxEpisodeInSeason);

  const goNextEp = useCallback(() => {
    if (isNobarGuest) return;
    if (!hasNextEpisode) {
      ToastAndroid.show(t('player.noNextEp'), ToastAndroid.SHORT);
      return;
    }
    if (isLoadingEp) return;
    const next = episode + 1;
    loadEpisode(season, next);
  }, [isNobarGuest, hasNextEpisode, isLoadingEp, episode, loadEpisode, season, t]);

  const goPrevEp = useCallback(() => {
    if (isNobarGuest) return;
    if (!hasPrevEpisode) {
      ToastAndroid.show(t('player.noPrevEp'), ToastAndroid.SHORT);
      return;
    }
    if (isLoadingEp) return;
    const prev = episode - 1;
    loadEpisode(season, prev);
  }, [isNobarGuest, hasPrevEpisode, isLoadingEp, episode, loadEpisode, season, t]);

  
  const webViewSource = useMemo(() => ({
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background-color: #000;
            overflow: hidden;
          }
          iframe {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: 0;
          }
        </style>
      </head>
      <body data-season="${season}" data-episode="${episode}">
        <iframe src="${selectedStream?.url || ''}" width="100%" height="100%" frameborder="0" allowfullscreen webkitallowfullscreen mozallowfullscreen allow="autoplay; fullscreen"></iframe>
        <script>
          document.addEventListener('click', function(e) {
            var btn = e.target.closest ? e.target.closest('button, .jw-button-color, .jw-slider-time, .jw-settings-menu, input, a, .vjs-control, .plyr__controls, video') : null;
            if (btn) return;
            try {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'TOGGLE_CONTROLS' }));
            } catch(err) {}
          }, true);

          document.addEventListener('fullscreenchange', function() {
            if (document.fullscreenElement) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'FULLSCREEN_ENTER' }));
            } else {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'FULLSCREEN_EXIT' }));
            }
          });
          document.addEventListener('webkitfullscreenchange', function() {
            if (document.webkitFullscreenElement) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'FULLSCREEN_ENTER' }));
            } else {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'FULLSCREEN_EXIT' }));
            }
          });
        </script>
      </body>
      </html>
    `,
    baseUrl: selectedStream?.headers?.Referer || 'https://tv2.lk21official.info/'
  }), [selectedStream?.url, selectedStream?.headers?.Referer, season, episode]);

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
                {title}
              </Text>
              <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '500' }} numberOfLines={1}>
                {isTV ? `${t('player.season')} ${season} • ${t('common.episode')} ${episode}` : t('player.fullMovie')}
              </Text>
            </View>
          </View>
        </View>
      )}

      <View style={fullscreen ? styles.fullscreen : styles.notFullscreen}>
        {selectedStream?.url ? (
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <WebView
              ref={webviewRef}
              source={webViewSource}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data.type === 'FULLSCREEN_ENTER') {
                    enterFullscreen();
                  } else if (data.type === 'FULLSCREEN_EXIT') {
                    exitFullscreen();
                  } else if (data.type === 'TOGGLE_CONTROLS') {
                    setShowFullscreenControls(prev => {
                      const next = !prev;
                      if (next) startAutoHideTimer();
                      else cancelAutoHideTimer();
                      return next;
                    });
                  } else if (data.type === 'NOBAR_WEBVIEW_STATE') {
                    const nextState = data.playerState === 'PLAYING' ? 'PLAYING' : 'PAUSED';
                    const nextTime = Number(data.currentTime) || 0;
                    lastWebViewPlaybackRef.current = {
                      playerState: nextState,
                      currentTime: nextTime,
                      timestamp: Number(data.timestamp) || Date.now(),
                    };
                    if (roomId && isHost) {
                      broadcastState(nextState, nextTime);
                    }
                  }
                } catch (e) {}
              }}
              injectedJavaScriptForMainFrameOnly={false}
              injectedJavaScript={`${AD_BLOCK_SCRIPT}\n${NOBAR_WEBVIEW_BRIDGE_SCRIPT}\ntrue;`}
              injectedJavaScriptBeforeContentLoaded={`
                (function() {
                  // Block popups immediately
                  window.open = function() { return null; };

                  // Kill devtools detection before it fires
                  // videonode/playcdn use a debugger-based timing trap
                  window.devtoolIsOpening = function() {};

                  function isBadUrl(url) {
                    if (typeof url !== 'string') return false;
                    var u = url.toLowerCase();
                    return u.includes('lk21') || u.includes('nontondrama') ||
                           u.includes('intent:') || u.includes('shopee') ||
                           u.includes('tokopedia') || u.includes('yellowishgather') ||
                           u.includes('gather.com') || u.includes('google.com');
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

                  var locDescriptor = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
                  if (locDescriptor && locDescriptor.set) {
                    var origSet = locDescriptor.set;
                    Object.defineProperty(Location.prototype, 'href', {
                      configurable: true,
                      set: function(url) {
                        if (isBadUrl(url)) return;
                        return origSet.call(this, url);
                      },
                      get: locDescriptor.get
                    });
                  }

                  // Remove ad overlays as early as possible
                  document.addEventListener('DOMContentLoaded', function() {
                    var overlays = document.querySelectorAll('#overlay, #uyeouyeo, a[href*="yellowishgather"], a[href*="gather.com"], .message-box');
                    for (var i = 0; i < overlays.length; i++) {
                      overlays[i].parentNode && overlays[i].parentNode.removeChild(overlays[i]);
                    }
                  });
                })();
                true;
              `}
              userAgent="Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36"
              javaScriptCanOpenWindowsAutomatically={false}
              setSupportMultipleWindows={false}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo={true}
              style={{ flex: 1, backgroundColor: '#000' }}
              onLoad={handleWebViewLoad}
              onLoadStart={() => setWebViewLoading(true)}
              onShouldStartLoadWithRequest={(request) => {
                const url = request.url.toLowerCase();
                const mainUrl = selectedStream?.url.toLowerCase() || '';

                // Block non-web URLs (intent://, market://, etc.) to prevent Android logo error screen
                if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:')) {
                  return false;
                }

                // Always allow the main URL
                if (url === mainUrl) return true;
                if (url === 'https://tv2.lk21official.info/' || url === 'about:blank') return true;

                // Allow known player/CDN domains
                const ALLOWED_DOMAINS = [
                  'playcdn.de', 'videonode.de', 'emturbovid.com', 'abyssplayer.com',
                  'gn1r5n.org', 'p2p-cdn', 'hlsjs', 'jwplayer', 'cloudflare', 'cdn-cgi',
                ];
                if (ALLOWED_DOMAINS.some(d => url.includes(d))) return true;

                // Block redirects to LK21 website
                if (request.isTopFrame !== false && (url.includes('lk21') || url.includes('nontondrama'))) {
                  return false;
                }

                // Block known ad / popup domains globally
                if (url.includes('yellowishgather') || url.includes('gather.com') ||
                    url.includes('shopee') || url.includes('tokopedia') ||
                    url.includes('lazada') || url.includes('bet') || url.includes('slot') ||
                    url.includes('redirect') || url.includes('popunder')) {
                  return false;
                }

                const normalizedUrl = url.replace(/\/$/, '');
                const normalizedMainUrl = mainUrl.replace(/\/$/, '');

                if (request.isTopFrame) {
                  // Only allow the initial injected HTML to load in the top frame
                  if (normalizedUrl === normalizedMainUrl || url === 'https://tv2.lk21official.info' || url === 'about:blank') {
                    return true;
                  }
                  // Block any other top-frame navigation (ads trying to hijack the page)
                  return false;
                } else {
                  // If it's an iframe navigation (not XHR/fetch, but actual frame navigation)
                  // We only allow known domains to prevent ads from hijacking the iframe
                  const ALLOWED_IFRAME_DOMAINS = [
                    'playcdn.de', 'videonode.de', 'emturbovid.com', 'abyssplayer.com',
                    'gn1r5n.org', 'p2p-cdn', 'hlsjs', 'jwplayer', 'cloudflare', 'cdn-cgi',
                    'google.com/recaptcha'
                  ];
                  
                  // Allow if it matches the main stream URL
                  if (normalizedUrl === normalizedMainUrl) return true;
                  
                  // Allow if it is in the whitelist
                  if (ALLOWED_IFRAME_DOMAINS.some(d => url.includes(d))) return true;

                  // Block any other iframe navigation (like ads replacing the video player)
                  return false;
                }
              }}
            />
            {webViewLoading && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)' }}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={{ color: '#fff', marginTop: 10, fontSize: 13 }}>{t('player.loadingStream')}</Text>
              </View>
            )}

            {fullscreen && (
              <View
                pointerEvents={showFullscreenControls ? 'box-none' : 'none'}
                style={[
                  StyleSheet.absoluteFill,
                  {
                    zIndex: 50,
                    opacity: showFullscreenControls ? 1 : 0,
                  },
                ]}>
                <View
                  pointerEvents="auto"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    paddingHorizontal: 16,
                    paddingTop: 12,
                    paddingBottom: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
                    <TouchableOpacity
                      onPress={exitFullscreen}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: 'rgba(255, 255, 255, 0.15)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}>
                      <Icon name="compress" size={15} color="#FFFFFF" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                        {title}
                      </Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '500', marginTop: 1 }}>
                        {isTV ? `${t('player.season')} ${season} • ${t('common.episode')} ${episode}` : t('player.fullMovie')}
                      </Text>
                    </View>
                  </View>

                  {isTV && !isNobarGuest && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity
                        onPress={goPrevEp}
                        disabled={!hasPrevEpisode || isLoadingEp}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: hasPrevEpisode && !isLoadingEp ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.06)',
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                          opacity: hasPrevEpisode && !isLoadingEp ? 1 : 0.5,
                        }}>
                        <Icon name="backward" size={11} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>{t('player.prev')}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={goNextEp}
                        disabled={!hasNextEpisode || isLoadingEp}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: hasNextEpisode && !isLoadingEp ? 'rgba(59, 130, 246, 0.85)' : 'rgba(255, 255, 255, 0.06)',
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                          opacity: hasNextEpisode && !isLoadingEp ? 1 : 0.5,
                        }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600', marginRight: 6 }}>{t('player.next')}</Text>
                        <Icon name="forward" size={11} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}

            {!fullscreen && (
              <TouchableOpacity
                onPress={() => enterFullscreen()}
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                }}>
                <Icon name="arrows-alt" size={13} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={{ flex: 1, zIndex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Icon name="exclamation-circle" color="#ff5252" size={48} />
            <Text style={{ color: '#fff', marginTop: 10, fontSize: 15 }}>{t('player.videoUnavailable')}</Text>
          </View>
        )}
      </View>

      {!fullscreen &&
        (roomId && (isGuest || nobarPortraitTab === 'chat') ? (
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
          <View style={{ flex: 1, backgroundColor: isDark ? '#0f0f0f' : '#fafafa' }}>
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
            <KeyboardAwareScrollView bottomOffset={80} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
              <View style={{ flex: 1 }}>
              <View style={styles.headerSection}>
                <Text style={styles.mainTitle} numberOfLines={2}>
                  {title}
                </Text>
                <Text style={styles.epSubhead}>
                  {isTV ? `${t('player.season')} ${season} • ${t('common.episode')} ${episode}` : t('player.fullMovie')}
                </Text>
                <View style={styles.metaBadgeRow}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>{(isTV ? t('player.tvSeriesBadge') : t('player.movieBadge')).toUpperCase()}</Text>
                  </View>
                  {language && (
                    <View style={styles.langBadge}>
                      <Text style={styles.langBadgeText}>{language}</Text>
                    </View>
                  )}
                  {selectedStream && (
                    <View style={styles.serverBadge}>
                      <Text style={styles.serverBadgeText}>
                        {(selectedStream.codecName || selectedStream.resolutions || 'HD').toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.actionBar}>
                <TouchableOpacity style={styles.actionItem} onPress={() => enterFullscreen()}>
                  <View style={styles.actionIconWrap}>
                    <Icon name="arrows-alt" size={16} color={isDark ? '#fff' : '#111827'} />
                  </View>
                  <Text style={styles.actionLabel}>{t('player.fullscreen')}</Text>
                </TouchableOpacity>

                {!isGuest && (
                  <TouchableOpacity
                    style={styles.actionItem}
                    onPress={async () => {
                      if (roomId) {
                        setInviteVisible(true);
                        return;
                      }
                      if (!profile || !user) {
                        ToastAndroid.show(t('auth.loginRequiredNobar'), ToastAndroid.SHORT);
                        return;
                      }

                      const newRoomId = Math.random().toString(36).substring(2, 10).toUpperCase();
                      setRoomId(newRoomId);
                      const pauseCmd = {
                        playerState: 'PAUSED' as const,
                        currentTime: lastWebViewPlaybackRef.current?.currentTime || 0,
                        timestamp: Date.now(),
                      };
                      lastWebViewPlaybackRef.current = pauseCmd;
                      webviewRef.current?.injectJavaScript(
                        buildNobarWebViewCommandScript(pauseCmd),
                      );
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

                {detailPath ? (
                  <TouchableOpacity
                    style={styles.actionItem}
                    onPress={() => {
                      (props.navigation as any).push('FilmDetail', {
                        item: {
                          id: subjectId,
                          title,
                          poster,
                          type: type || 'movie',
                          detailPath,
                        },
                      });
                    }}>
                    <View style={styles.actionIconWrap}>
                      <Icon name="info-circle" size={16} color={isDark ? '#fff' : '#111827'} />
                    </View>
                    <Text style={styles.actionLabel}>{t('player.detail')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {currentStreams.length > 1 && (
                <View style={styles.serverStrip}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="server" size={13} color={isDark ? '#9ca3af' : '#6b7280'} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#d1d5db' : '#374151' }}>{t('player.server')}</Text>
                  </View>
                  <View style={{ minWidth: 150 }}>
                    <Dropdown
                      data={serverData}
                      labelField="label"
                      valueField="value"
                      value={selectedStream?.id}
                      onChange={(item) => handleServerChange(item.value)}
                      style={styles.dropdownStyle}
                      selectedTextStyle={{ color: isDark ? '#fff' : '#000', fontSize: 12, fontWeight: '600' }}
                      placeholderStyle={{ color: isDark ? '#888' : '#666', fontSize: 12 }}
                      itemTextStyle={{ color: isDark ? '#fff' : '#000', fontSize: 13 }}
                      containerStyle={styles.dropdownContainerStyle}
                      activeColor={isDark ? '#333' : '#e0e0e0'}
                    />
                  </View>
                </View>
              )}

              {isTV && seasons && seasons.length > 0 && (
                <View style={styles.tvSection}>
                  <Text style={styles.tvSectionTitle}>{t('player.season')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {seasons.map(s => {
                      const active = season === s.se;
                      return (
                        <Button
                          key={s.se}
                          mode={active ? 'contained' : 'outlined'}
                          compact
                          style={{ borderRadius: 8 }}
                          buttonColor={active ? '#3b82f6' : undefined}
                          onPress={() => loadEpisode(s.se ?? 1, 1)}>
                          {t('player.season')} {s.se}
                        </Button>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {isTV && (
                <View style={styles.tvSection}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={styles.tvSectionTitle}>{t('common.episode')}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Button
                        mode="contained-tonal"
                        onPress={goPrevEp}
                        disabled={episode <= 1 || isLoadingEp}
                        style={{ borderRadius: 8 }}
                        icon="arrow-left"
                        compact>
                        {t('player.prev')}
                      </Button>
                      <Button
                        mode="contained-tonal"
                        onPress={goNextEp}
                        disabled={isLoadingEp}
                        style={{ borderRadius: 8 }}
                        contentStyle={{ flexDirection: 'row-reverse' }}
                        icon="arrow-right"
                        compact>
                        {t('player.next')}
                      </Button>
                    </View>
                  </View>

                  {seasons && seasons.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                      {Array.from({ length: seasons.find(s => s.se === season)?.maxEp || 0 }, (_, i) => i + 1).map(ep => {
                        const active = episode === ep;
                        return (
                          <Button
                            key={ep}
                            mode={active ? 'contained' : 'outlined'}
                            compact
                            style={{ borderRadius: 8, minWidth: 48 }}
                            buttonColor={active ? '#3b82f6' : undefined}
                            onPress={() => loadEpisode(season, ep)}>
                            {ep}
                          </Button>
                        );
                      })}
                    </ScrollView>
                  )}

                  {isLoadingEp && (
                    <ActivityIndicator size="small" color="#3b82f6" style={{ marginTop: 8 }} />
                  )}
                </View>
              )}

              <View style={{ marginVertical: 8 }}>
                <CommentSection
                  contentId={detailPath}
                  contentType={'movie'}
                />
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      ))}

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

      <NobarInviteSheet
        visible={inviteVisible}
        onDismiss={() => {
          setInviteVisible(false);
        }}
        roomId={roomId || ''}
        nobarTitle={isTV ? `${title} (S${season} E${episode})` : title}
        onPromoteToForum={() => {
          setInviteVisible(false);
          if (fullscreen) exitFullscreen();
          const filmSource = props.route.params.source || 'lk21';
          const epTag = isTV ? `S${season} E${episode}` : null;
          props.navigation.navigate('ForumComposer', {
            defaultCategory: 'nobar',
            nobarRoomId: roomId || '',
            nobarTitle: epTag ? `${title} (${epTag})` : title,
            linkedMedia: {
              media_key: normalizeMediaKey('film', `${filmSource}:${subjectId}`),
              type: 'film',
              title,
              poster_url: poster || null,
              link: `film://${subjectId}`,
              episode_label: epTag,
              source: filmSource,
              film_item: {
                id: subjectId,
                title,
                poster: poster || '',
                type: isTV ? 'TV' : 'Movie',
                source: filmSource,
              },
            },
          });
        }}
        isDark={isDark}
      />
    </View>
  );
}

const useStyles = (isDark: boolean) => useMemo(() => StyleSheet.create({
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
    paddingBottom: 6,
  },
  mainTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: isDark ? '#FFFFFF' : '#111827',
    marginBottom: 4,
  },
  epSubhead: {
    fontSize: 13,
    color: isDark ? '#9CA3AF' : '#4B5563',
    marginBottom: 8,
    fontWeight: '500',
  },
  metaBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  typeBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: '#3B82F6',
    fontSize: 11,
    fontWeight: '700',
  },
  langBadge: {
    backgroundColor: isDark ? '#262626' : '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  langBadgeText: {
    color: isDark ? '#D1D5DB' : '#374151',
    fontSize: 11,
    fontWeight: '600',
  },
  serverBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  serverBadgeText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: isDark ? '#171717' : '#F3F4F6',
    marginHorizontal: 16,
    marginTop: 6,
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
    backgroundColor: isDark ? '#262626' : '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: isDark ? '#D1D5DB' : '#374151',
    textAlign: 'center',
  },
  serverStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? '#1F1F1F' : '#F3F4F6',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  dropdownStyle: {
    backgroundColor: isDark ? '#2B2B2B' : '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? '#404040' : '#E0E0E0',
  },
  dropdownContainerStyle: {
    width: 160,
    borderRadius: 8,
    backgroundColor: isDark ? '#2B2B2B' : '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? '#404040' : '#E0E0E0',
    elevation: 5,
  },
  tvSection: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  tvSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
    color: isDark ? '#FFFFFF' : '#111827',
  },
  nobarTabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: isDark ? '#141416' : '#f3f4f6',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? '#27272a' : '#e5e7eb',
  },
  nobarTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: isDark ? '#1f1f23' : '#e5e7eb',
  },
  nobarTabBtnActive: {
    backgroundColor: '#6366f1',
  },
  nobarTabText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: isDark ? '#9CA3AF' : '#4B5563',
  },
  nobarTabTextActive: {
    color: '#FFFFFF',
  },
}), [isDark]);

export default memo(FilmPlayer);
