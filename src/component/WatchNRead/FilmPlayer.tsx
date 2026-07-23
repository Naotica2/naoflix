import Icon from '@react-native-vector-icons/fontawesome';
import { VideoView } from 'expo-video';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  ToastAndroid,
  useColorScheme,
  View,
} from 'react-native';
import { ActivityIndicator, Button, useTheme } from 'react-native-paper';
import { SystemBars } from 'react-native-edge-to-edge';
import Orientation, { OrientationType } from 'react-native-orientation-locker';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { useFocusEffect } from '@react-navigation/core';
import { Dropdown } from '@pirles/react-native-element-dropdown';
import useGlobalStyles from '../../assets/style';
import { RootStackNavigator } from '../../types/navigation';
import { getPlayStreams, getCaptions, MovieboxStream, MovieboxCaption } from '../../utils/scrapers/moviebox';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useLevel } from '../../misc/LevelContext';
import { EXP_REWARDS } from '../../utils/LevelSystem';
import setHistory from '../../utils/historyControl';
import { throttle } from '../../utils/throttle';
import { usePresenceActivity } from '../../utils/presenceSystem';
import VideoPlayer, { PlayerRef } from '../VideoPlayer';
import CommentSection from '../Comments/CommentSection';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTimeTracker } from '../../utils/UserTracker';
import NobarInviteSheet from './NobarInviteSheet';
import NobarChatSection from './NobarChatSection';
import { useWatchParty } from '../../hooks/useWatchParty';
import { useAuth } from '../../misc/AuthContext';
import { supabase } from '../../config/supabaseClient';
import VIPOfferModal from './VIPOfferModal';

type Props = NativeStackScreenProps<RootStackNavigator, 'FilmPlayer'>;

function FilmPlayer(props: Props) {
  const { streams, title, subjectId, detailPath, type, poster, language } = props.route.params;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = useTheme();
  const { profile, user } = useAuth();
  const globalStyles = useGlobalStyles();
  const styles = useStyles();

  const isTV = type === 'tv';
  const initialSeason = props.route.params.season || 1;
  const initialEpisode = props.route.params.episode || 1;

  useTimeTracker(isTV ? 'series' : 'movie');

  // Stream/resolution state
  const [currentStreams, setCurrentStreams] = useState<MovieboxStream[]>(streams);
  const [selectedStream, setSelectedStream] = useState<MovieboxStream>(() => {
    // Pick highest resolution available
    const sorted = [...streams].sort((a, b) => parseInt(b.resolutions) - parseInt(a.resolutions));
    return sorted[0] || streams[0];
  });

  const [fullscreen, setFullscreen] = useState(false);
  const [isLoadingEp, setIsLoadingEp] = useState(false);
  const [season, setSeason] = useState(initialSeason);
  const [episode, setEpisode] = useState(initialEpisode);

  // Nobar State
  const isGuest = (props.route.params as any).isGuest || false;
  const initialRoomId = (props.route.params as any).roomId || '';
  const [inviteVisible, setInviteVisible] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(initialRoomId);
  const [showVIPModal, setShowVIPModal] = useState(false);
  const [isPaused, setIsPaused] = useState(!!roomId && isGuest);

  const { participants, remoteState, broadcastState, chatMessages, broadcastChat, broadcastMediaChange, mediaChangeLink, isActive, connectionStatus, isHostMissing } = useWatchParty(
    roomId || null,
    !isGuest,
    { ...props.route.params, title: isTV ? `${title} - S${season}E${episode}` : title }
  );

  usePresenceActivity(`Sedang menonton ${title}${isTV ? ` S${season} E${episode}` : ''}`);

  // Subtitle state
  const [captions, setCaptions] = useState<MovieboxCaption[]>([]);
  const [subtitleUrl, setSubtitleUrl] = useState<string | undefined>(undefined);
  const [selectedCaptionLan, setSelectedCaptionLan] = useState<string>('');

  // User preferences refs to retain selections across episodes
  const preferredCaptionLan = useRef<string | null>(null);
  const preferredResolution = useRef<string | null>(null);

  // Position to seek to after a stream/resolution change (preserves playback position)
  const pendingSeekRef = useRef<number | null>(null);

  // AsyncStorage keys for persisting user preferences
  const PREF_RES_KEY = `film_pref_res_${subjectId}`;
  const PREF_SUB_KEY = `film_pref_sub_${subjectId}`;

  // Load persisted preferences on mount, then apply to initial stream selection
  useEffect(() => {
    AsyncStorage.multiGet([PREF_RES_KEY, PREF_SUB_KEY]).then(([[, savedRes], [, savedSub]]) => {
      if (savedRes) {
        preferredResolution.current = savedRes;
        // Re-select stream matching persisted resolution
        const match = streams.find(s => s.resolutions === savedRes);
        if (match) setSelectedStream(match);
      }
      if (savedSub) {
        preferredCaptionLan.current = savedSub;
      }
    }).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const videoRef = useRef<VideoView>(null);
  const playerRef = useRef<PlayerRef>(null);

  const { addExp } = useLevel();
  const awardedExpRef = useRef(new Set<string>());
  const firstTimeLoad = useRef(true);
  const historyData = props.route.params.historyData;
  // Host re-broadcasts media state when a new guest joins
  const participantsCount = participants.length;
  useEffect(() => {
    if (!isGuest && roomId && selectedStream) {
      broadcastMediaChange(`${season}-${episode}|${selectedStream.resolutions}|${preferredCaptionLan.current || 'off'}`);
      broadcastState(isPaused ? 'PAUSED' : 'PLAYING', playerRef.current?.getCurrentTime() || 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantsCount, isGuest, roomId]);

  // Handle Sync for Guests
  useEffect(() => {
    if (roomId && remoteState && playerRef.current) {
      const timeDiff = Math.abs(remoteState.currentTime - playerRef.current.getCurrentTime());
      if (remoteState.playerState === 'PLAYING') {
        if (timeDiff > 2) playerRef.current.skipTo(remoteState.currentTime);
        playerRef.current.play();
        setIsPaused(false);
      } else if (remoteState.playerState === 'PAUSED') {
        playerRef.current.pause();
        setIsPaused(true);
        if (timeDiff > 2) playerRef.current.skipTo(remoteState.currentTime);
      }
    }
  }, [remoteState, roomId]);

  // Handle Nobar Disconnects
  useEffect(() => {
    if (roomId) {
      if (connectionStatus === 'DISCONNECTED') {
        import('react-native').then(({ ToastAndroid }) => ToastAndroid.show('Koneksi terputus dari room', ToastAndroid.LONG));
        setRoomId(null);
        setInviteVisible(false);
      } else if (isHostMissing && isGuest) {
        import('react-native').then(({ ToastAndroid }) => ToastAndroid.show('Host telah meninggalkan room', ToastAndroid.LONG));
        setRoomId(null);
        setInviteVisible(false);
      }
    }
  }, [roomId, connectionStatus, isHostMissing, isGuest]);

  // Build film link with se/ep for TV series (so history can be resumed properly)
  const filmLink = useMemo(() =>
    isTV
      ? `film://${subjectId}/${detailPath}?se=${season}&ep=${episode}`
      : `film://${subjectId}/${detailPath}`,
    [subjectId, detailPath, isTV, season, episode],
  );

  // Throttled progress tracking — saves lastDuration to history every 2s
  // Also broadcasts state if we are the Host in a Watch Party
  const updateHistory = useMemo(
    () =>
      throttle(
        (currentTime: number) => {
          if (Math.floor(currentTime) === 0) return;

          const episodeStr = isTV ? `S${season}E${episode}` : null;
          setHistory(
            { title, thumbnailUrl: poster || '' } as any,
            filmLink,
            true, // skipUpdateDate on progress ticks
            { thumbnailUrl: poster || '', lastDuration: currentTime, episode: episodeStr } as any,
            !isTV, // isMovie
          );
        },
        2000,
      ),
    [title, poster, filmLink, isTV, season, episode],
  );

  const handlePlayingChange = useCallback(
    (isPlaying: boolean, currentTime: number) => {
      if (roomId && !isGuest) {
        broadcastState(isPlaying ? 'PLAYING' : 'PAUSED', currentTime);
      }
    },
    [roomId, isGuest, broadcastState],
  );

  // Award EXP + save history on video load:
  // - Movies: once per movie (keyed by subjectId)
  // - Series: once per episode (keyed by subjectId-S#E#)
  // Uses base title (no S#E#) so all episodes of a series share ONE history entry
  const handleVideoLoad = useCallback(() => {
    const expKey = isTV ? `${subjectId}-S${season}E${episode}` : subjectId;
    if (!awardedExpRef.current.has(expKey)) {
      awardedExpRef.current.add(expKey);
      const amount = EXP_REWARDS.WATCH_MOVIE;
      addExp(amount);
      ToastAndroid.show(`+${amount} EXP`, ToastAndroid.SHORT);
    }

    // Save to history (base title = show title, no S#E# suffix)
    const episodeStr = isTV ? `S${season}E${episode}` : null;
    setHistory(
      { title, thumbnailUrl: poster || '' } as any,
      filmLink,
      false,
      { thumbnailUrl: poster || '', episode: episodeStr } as any,
      !isTV, // isMovie
    );

    // Resume from last duration if coming from history
    if (firstTimeLoad.current && historyData?.lastDuration && historyData.lastDuration > 0) {
      firstTimeLoad.current = false;
      pendingSeekRef.current = historyData.lastDuration;
    }
    // Also handle resume from resolution switch
    if (pendingSeekRef.current !== null && pendingSeekRef.current > 0) {
      const seekTo = pendingSeekRef.current;
      pendingSeekRef.current = null;
      setTimeout(() => {
        playerRef.current?.skipTo(seekTo);
        if (historyData?.lastDuration && seekTo === historyData.lastDuration && firstTimeLoad.current === false) {
          ToastAndroid.show('Otomatis kembali ke durasi terakhir', ToastAndroid.SHORT);
        }
      }, 500);
    }
    firstTimeLoad.current = false;
  }, [addExp, episode, isTV, season, subjectId, title, poster, filmLink, historyData]);

  // Fetch captions for current stream
  const fetchCaptions = useCallback(async (streamId: string) => {
    try {
      const caps = await getCaptions(streamId, subjectId, detailPath);
      setCaptions(caps);

      const targetLan = preferredCaptionLan.current || 'id';

      if (targetLan === 'off') {
        setSubtitleUrl(undefined);
        setSelectedCaptionLan('off');
        return;
      }

      // Auto-select preferred language (or Indonesian) if available
      const targetCap = caps.find(c => c.lan === targetLan);
      if (targetCap) {
        setSubtitleUrl(targetCap.url);
        setSelectedCaptionLan(targetLan);
      } else if (caps.length > 0) {
        // Fall back to first available caption if preferred is not found
        setSubtitleUrl(caps[0].url);
        setSelectedCaptionLan(caps[0].lan);
      }
    } catch {
      // Captions are optional, don't show error
    }
  }, [subjectId, detailPath]);

  // Fetch captions on initial load and when stream changes
  useEffect(() => {
    if (selectedStream?.id) fetchCaptions(selectedStream.id);
  }, [selectedStream?.id, fetchCaptions]);

  // Caption dropdown data
  const captionData = useMemo(() => {
    const items = [{ label: 'Off', value: 'off' }];
    captions.forEach(c => items.push({ label: c.lanName, value: c.lan }));
    return items;
  }, [captions]);

  // Switch caption
  const handleCaptionChange = useCallback((val: any) => {
    const lan = typeof val === 'string' ? val : val?.value || 'off';
    setSelectedCaptionLan(lan);
    preferredCaptionLan.current = lan;
    AsyncStorage.setItem(PREF_SUB_KEY, lan).catch(() => { });
    if (lan === 'off') {
      setSubtitleUrl(undefined);
    } else {
      const cap = captions.find(c => c.lan === lan);
      if (cap) setSubtitleUrl(cap.url);
    }
    if (!isGuest && roomId) {
      broadcastMediaChange(`${season}-${episode}|${preferredResolution.current || ''}|${lan}`);
    }
  }, [captions, PREF_SUB_KEY, isGuest, roomId, season, episode, broadcastMediaChange]);

  // Header title
  useEffect(() => {
    props.navigation.setOptions({ headerTitle: title, headerShown: !fullscreen });
  }, [title, fullscreen, props.navigation]);

  // Fullscreen handlers
  const enterFullscreen = useCallback((landscape?: OrientationType) => {
    if (landscape === undefined) Orientation.lockToLandscape();
    else {
      switch (landscape) {
        case 'LANDSCAPE-LEFT': Orientation.lockToLandscapeLeft(); break;
        case 'LANDSCAPE-RIGHT': Orientation.lockToLandscapeRight(); break;
        default: Orientation.lockToLandscape();
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
          if (orientation === 'PORTRAIT') exitFullscreen();
          else if (orientation !== 'UNKNOWN') enterFullscreen(orientation);
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
      SystemBars.setHidden(false);
      SystemNavigationBar.navigationShow();
      SystemNavigationBar.fullScreen(false);
    };
  }, [orientationDidChange]));

  useBackHandler(useCallback(() => {
    if (fullscreen) { exitFullscreen(); return true; }
    return false;
  }, [exitFullscreen, fullscreen]));

  // Resolution dropdown data
  const resolutionData = useMemo(() =>
    currentStreams.map(s => ({
      label: `${s.resolutions}p (${(parseInt(s.size) / 1024 / 1024).toFixed(0)} MB)`,
      value: s.id,
    })),
    [currentStreams],
  );

  const selectedResId = selectedStream?.id || '';

  // Switch resolution — preserves current playback position
  const handleResChange = useCallback((val: any) => {
    const id = typeof val === 'string' ? val : val?.value || '';
    const stream = currentStreams.find(s => s.id === id);
    if (stream) {
      const currentTime = playerRef.current?.getCurrentTime?.() ?? 0;
      if (currentTime > 1) {
        pendingSeekRef.current = currentTime;
      }
      setSelectedStream(stream);
      preferredResolution.current = stream.resolutions;
      AsyncStorage.setItem(PREF_RES_KEY, stream.resolutions).catch(() => { });
      if (!isGuest && roomId) {
        broadcastMediaChange(`${season}-${episode}|${stream.resolutions}|${preferredCaptionLan.current || 'off'}`);
      }
    }
  }, [currentStreams, PREF_RES_KEY, isGuest, roomId, season, episode, broadcastMediaChange]);

  // Load different episode (TV only)
  const loadEpisode = useCallback(async (s: number, e: number, forceRes?: string, forceSub?: string) => {
    setIsLoadingEp(true);
    try {
      const newStreams = await getPlayStreams(subjectId, detailPath, s, e);
      if (newStreams.length > 0) {
        setCurrentStreams(newStreams);

        const targetRes = forceRes || preferredResolution.current || selectedStream?.resolutions;
        const matchRes = newStreams.find(ns => ns.resolutions === targetRes);
        const sorted = [...newStreams].sort((a, b) => parseInt(b.resolutions) - parseInt(a.resolutions));
        const finalStream = matchRes || sorted[0];
        setSelectedStream(finalStream);

        setSeason(s);
        setEpisode(e);

        if (forceSub) preferredCaptionLan.current = forceSub;

        const newStreamId = finalStream?.id;
        if (newStreamId) fetchCaptions(newStreamId);

        const epLink = `film://${subjectId}/${detailPath}?se=${s}&ep=${e}`;
        setHistory(
          { title, thumbnailUrl: poster || '' } as any,
          epLink,
          false,
          { thumbnailUrl: poster || '', episode: `S${s}E${e}` } as any,
          !isTV,
        );

        if (!isGuest && roomId) {
          const finalRes = finalStream?.resolutions || '';
          const finalSub = forceSub || preferredCaptionLan.current || 'off';
          broadcastMediaChange(`${s}-${e}|${finalRes}|${finalSub}`);
        }
      } else {
        ToastAndroid.show('Episode tidak tersedia', ToastAndroid.SHORT);
      }
    } catch {
      ToastAndroid.show('Gagal memuat episode', ToastAndroid.SHORT);
    } finally {
      setIsLoadingEp(false);
    }
  }, [subjectId, detailPath, selectedStream?.resolutions, title, poster, fetchCaptions, isGuest, roomId, broadcastMediaChange, isTV]);

  const lastMediaChangeRef = useRef<string | null>(null);

  // Sync Watch Party Media Change
  useEffect(() => {
    if (mediaChangeLink && isGuest && mediaChangeLink !== lastMediaChangeRef.current) {
      lastMediaChangeRef.current = mediaChangeLink;
      setIsPaused(true);
      const parts = mediaChangeLink.split('|');
      const epParts = parts[0].split('-');
      const targetRes = parts[1];
      const targetSub = parts[2];

      if (epParts.length === 2) {
        const s = parseInt(epParts[0], 10);
        const e = parseInt(epParts[1], 10);
        if (!isNaN(s) && !isNaN(e)) {
          if (s !== season || e !== episode) {
            loadEpisode(s, e, targetRes, targetSub);
          } else {
            if (targetRes) {
              const stream = currentStreams.find(st => st.resolutions === targetRes);
              if (stream && stream.id !== selectedStream?.id) {
                setSelectedStream(stream);
                preferredResolution.current = targetRes;
              }
            }
            if (targetSub) {
              setSelectedCaptionLan(targetSub);
              preferredCaptionLan.current = targetSub;
              if (targetSub === 'off') setSubtitleUrl(undefined);
              else {
                const cap = captions.find(c => c.lan === targetSub);
                if (cap) setSubtitleUrl(cap.url);
              }
            }
          }
        }
      }
    }
  }, [mediaChangeLink, isGuest, loadEpisode, season, episode, currentStreams, captions, selectedStream]);

  const checkNobarLimit = useCallback(() => {
    if (!roomId || isGuest || !profile || !user) return true;
    if (profile.is_vip) return true;

    const now = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    let currentCount = profile.last_nobar_date === today ? (profile.nobar_count || 0) : 0;

    if (currentCount >= 3) {
      setShowVIPModal(true);
      return false;
    }

    supabase.from('profiles').update({
      nobar_count: currentCount + 1,
      last_nobar_date: today
    }).eq('id', user.id).then();

    profile.nobar_count = currentCount + 1;
    profile.last_nobar_date = today;

    import('react-native').then(({ ToastAndroid }) => {
      ToastAndroid.show(`Limit terpakai (${Math.max(0, 2 - currentCount)} tersisa)`, ToastAndroid.SHORT);
    });
    return true;
  }, [roomId, isGuest, profile, user]);

  const goNextEp = useCallback(() => {
    if (!isGuest && roomId && !checkNobarLimit()) return;
    const next = episode + 1;
    if (roomId) setIsPaused(true);
    loadEpisode(season, next);
  }, [episode, loadEpisode, season, isGuest, roomId, checkNobarLimit]);

  const goPrevEp = useCallback(() => {
    if (episode <= 1) return;
    if (!isGuest && roomId && !checkNobarLimit()) return;
    const prev = episode - 1;
    if (roomId) setIsPaused(true);
    loadEpisode(season, prev);
  }, [episode, loadEpisode, season, isGuest, roomId, checkNobarLimit]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Native Video Player */}
      <View style={fullscreen ? styles.fullscreen : styles.notFullscreen}>
        {selectedStream?.url ? (
          <VideoPlayer
            title={isTV ? `${title} - S${season} E${episode}` : title}
            thumbnailURL={poster}
            streamingURL={selectedStream.url}
            subtitleURL={subtitleUrl}
            style={{ flex: 1, zIndex: 1 }}
            videoRef={videoRef}
            ref={playerRef}
            isPaused={isPaused}
            disableControls={!!roomId && isGuest}
            fullscreen={fullscreen}
            onFullscreenUpdate={(fs) => fs ? enterFullscreen() : exitFullscreen()}
            onDurationChange={updateHistory}
            onPlayingChange={handlePlayingChange}
            onLoad={handleVideoLoad}
            isHls={false}
            headers={{ Referer: 'https://movie-box.co/' }}
            showNextPrevButtons={isTV}
            onNextEp={goNextEp}
            onPrevEp={goPrevEp}
            disableNextEp={isLoadingEp}
            disablePrevEp={episode <= 1 || isLoadingEp}
          />
        ) : (
          <View style={{ flex: 1, zIndex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Icon name="exclamation-circle" color="#ff5252" size={48} />
            <Text style={{ color: '#fff', marginTop: 10, fontSize: 15 }}>Video tidak tersedia</Text>
          </View>
        )}
      </View>

      {/* Controls / Chat Section */}
      {!fullscreen && (
        <KeyboardAwareScrollView bottomOffset={80} style={{ flex: 1, backgroundColor: isDark ? '#0f0f0f' : '#fafafa' }} contentContainerStyle={{ flexGrow: 1 }}>
          {roomId ? (
            <NobarChatSection
              roomId={roomId}
              isHost={!isGuest}
              isFullscreen={false}
              isDark={isDark}
              participants={participants}
              chatMessages={chatMessages}
              broadcastChat={broadcastChat}
              onInvitePress={() => setInviteVisible(true)}
            />
          ) : (
            <View style={{ flex: 1 }}>
              {/* Fullscreen + Language info */}
              <View style={{ paddingHorizontal: 12, paddingTop: 8, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Button mode="contained-tonal" icon="fullscreen"
                  onPress={() => enterFullscreen()} style={{ borderRadius: 8, flex: 1 }} compact>
                  Fullscreen
                </Button>
                {!isGuest && (
                  <Button mode="contained" icon="account-group" buttonColor="#6366f1"
                    onPress={async () => {
                      if (!profile || !user) {
                        import('react-native').then(({ ToastAndroid }) => {
                          ToastAndroid.show('Kamu harus login untuk membuat Room Nobar', ToastAndroid.SHORT);
                        });
                        return;
                      }

                      // VIP Logic Check
                      const now = new Date();
                      const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
                      let currentCount = profile.nobar_count || 0;

                      if (!profile.is_vip) {
                        if (profile.last_nobar_date !== today) {
                          currentCount = 0;
                        }

                        if (currentCount >= 3) {
                          setShowVIPModal(true);
                          return; // Stop here, limit reached
                        }

                        // Increment usage in background
                        supabase.from('profiles').update({
                          nobar_count: currentCount + 1,
                          last_nobar_date: today
                        }).eq('id', user.id).then();
                        // Ideally we refresh profile, but doing this locally is fine for now
                        profile.nobar_count = currentCount + 1;
                        profile.last_nobar_date = today;
                      }

                      const newRoomId = Math.random().toString(36).substring(2, 10);
                      setRoomId(newRoomId);
                      playerRef.current?.pause(); // Force pause video when starting invite
                      setInviteVisible(true);
                    }} style={{ borderRadius: 8, flex: 1 }} compact>
                    {(() => {
                      if (!profile) return 'Mulai Nobar';
                      if (profile.is_vip) return 'Mulai Nobar (∞)';
                      const now = new Date();
                      const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
                      const currentCount = profile.last_nobar_date === today ? (profile.nobar_count || 0) : 0;
                      const left = Math.max(0, 3 - currentCount);
                      return `Mulai Nobar (${left}/3)`;
                    })()}
                  </Button>
                )}
                {language && (
                  <View style={{ backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                    <Text style={{ fontSize: 12, color: isDark ? '#aaa' : '#666', fontWeight: '600' }}>
                      {language.includes('Indonesian') ? '🇮🇩 ' : ''}{language}
                    </Text>
                  </View>
                )}
              </View>

              {/* Subtitle Picker */}
              {captions.length > 0 && (
                <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
                  <Text style={[globalStyles.text, { fontSize: 14, fontWeight: '700', marginBottom: 6, color: isDark ? '#eee' : '#222' }]}>Subtitle</Text>
                  <Dropdown
                    value={selectedCaptionLan || 'off'}
                    data={captionData}
                    labelField="label"
                    valueField="value"
                    onChange={val => handleCaptionChange(val)}
                    style={{
                      backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0',
                      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                      borderWidth: 1, borderColor: isDark ? '#333' : '#ddd',
                    }}
                    selectedTextStyle={{ color: isDark ? '#eee' : '#222', fontSize: 13, fontWeight: '600' }}
                    containerStyle={{ borderRadius: 8, backgroundColor: isDark ? '#1a1a1a' : '#fff', borderWidth: 1, borderColor: isDark ? '#333' : '#ddd' }}
                    itemTextStyle={{ color: isDark ? '#ddd' : '#333', fontSize: 13 }}
                    itemContainerStyle={{ backgroundColor: isDark ? '#1a1a1a' : '#fff' }}
                    activeColor={isDark ? '#333' : '#e0e0e0'}
                    maxHeight={250}
                    placeholder="Pilih subtitle..."
                    placeholderStyle={{ color: isDark ? '#888' : '#999' }}
                  />
                </View>
              )}

              {/* Resolution Switcher */}
              {currentStreams.length > 1 && (
                <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
                  <Text style={[globalStyles.text, { fontSize: 14, fontWeight: '700', marginBottom: 6, color: isDark ? '#eee' : '#222' }]}>Resolusi</Text>
                  <Dropdown
                    value={selectedResId}
                    data={resolutionData}
                    labelField="label"
                    valueField="value"
                    onChange={val => handleResChange(val)}
                    style={{
                      backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0',
                      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                      borderWidth: 1, borderColor: isDark ? '#333' : '#ddd',
                    }}
                    selectedTextStyle={{ color: isDark ? '#eee' : '#222', fontSize: 13, fontWeight: '600' }}
                    containerStyle={{ borderRadius: 8, backgroundColor: isDark ? '#1a1a1a' : '#fff', borderWidth: 1, borderColor: isDark ? '#333' : '#ddd' }}
                    itemTextStyle={{ color: isDark ? '#ddd' : '#333', fontSize: 13 }}
                    itemContainerStyle={{ backgroundColor: isDark ? '#1a1a1a' : '#fff' }}
                    activeColor={isDark ? '#333' : '#e0e0e0'}
                    maxHeight={200}
                    placeholder="Pilih resolusi..."
                    placeholderStyle={{ color: isDark ? '#888' : '#999' }}
                  />
                </View>
              )}

              {/* TV Episode Navigation */}
              {isTV && (
                <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
                  <Text style={[globalStyles.text, { fontSize: 14, fontWeight: '700', marginBottom: 8, color: isDark ? '#eee' : '#222' }]}>Episode</Text>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Button mode="outlined" onPress={goPrevEp} disabled={episode <= 1 || isLoadingEp}
                      style={{ borderRadius: 8 }} icon="arrow-left" compact>Prev</Button>

                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={[globalStyles.text, { fontSize: 16, fontWeight: '800', color: isDark ? '#eee' : '#222' }]}>
                        S{season} E{episode}
                      </Text>
                    </View>

                    <Button mode="outlined" onPress={goNextEp} disabled={isLoadingEp}
                      style={{ borderRadius: 8 }} icon="arrow-right" compact>Next</Button>
                  </View>

                  {isLoadingEp && (
                    <ActivityIndicator size="small" color="#3b82f6" style={{ marginTop: 8 }} />
                  )}
                </View>
              )}

              {/* Stream info */}
              {selectedStream && (
                <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
                  <Text style={[globalStyles.text, { fontSize: 11, color: isDark ? '#555' : '#aaa' }]}>
                    {selectedStream.format} • {selectedStream.resolutions}p • {selectedStream.codecName}
                    {selectedStream.duration ? ` • ${Math.floor(selectedStream.duration / 60)} min` : ''}
                  </Text>
                </View>
              )}

              {/* Comments */}
              <View style={{ marginVertical: 10 }}>
                <CommentSection
                  contentId={detailPath}
                  contentType={'movie'}
                />
              </View>
            </View>
          )}
        </KeyboardAwareScrollView>
      )}

      {/* Landscape Chat Overlay */}
      {fullscreen && roomId && (
        <NobarChatSection
          roomId={roomId}
          isHost={!isGuest}
          isFullscreen={true}
          isDark={isDark}
          participants={participants}
          chatMessages={chatMessages}
          broadcastChat={broadcastChat}
          onInvitePress={() => setInviteVisible(true)}
        />
      )}

      <NobarInviteSheet
        visible={inviteVisible}
        onDismiss={() => {
          setInviteVisible(false);
          if (roomId) playerRef.current?.play();
        }}
        roomId={roomId || ''}
        onInviteDM={() => {
          setInviteVisible(false);
          import('react-native').then(({ ToastAndroid }) => {
            ToastAndroid.show('Fitur kirim DM Nobar segera hadir!', ToastAndroid.SHORT);
          });
        }}
        isDark={isDark}
      />
      <VIPOfferModal
        visible={showVIPModal}
        onDismiss={() => setShowVIPModal(false)}
      />
    </View>
  );
}

const useStyles = () => useMemo(() => StyleSheet.create({
  fullscreen: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  notFullscreen: { position: 'relative', aspectRatio: 16 / 9, backgroundColor: '#000' },
}), []);

export default memo(FilmPlayer);
