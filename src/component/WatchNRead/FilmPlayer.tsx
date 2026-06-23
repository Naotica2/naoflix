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
import VideoPlayer, { PlayerRef } from '../VideoPlayer';
import CommentSection from '../Comments/CommentSection';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

type Props = NativeStackScreenProps<RootStackNavigator, 'FilmPlayer'>;

function FilmPlayer(props: Props) {
  const { streams, title, subjectId, detailPath, type, poster, language } = props.route.params;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const globalStyles = useGlobalStyles();
  const styles = useStyles();

  const isTV = type === 'tv';
  const initialSeason = props.route.params.season || 1;
  const initialEpisode = props.route.params.episode || 1;

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

  // Subtitle state
  const [captions, setCaptions] = useState<MovieboxCaption[]>([]);
  const [subtitleUrl, setSubtitleUrl] = useState<string | undefined>(undefined);
  const [selectedCaptionLan, setSelectedCaptionLan] = useState<string>('');

  const videoRef = useRef<VideoView>(null);
  const playerRef = useRef<PlayerRef>(null);
  const { addExp } = useLevel();
  const awardedExpRef = useRef(new Set<string>());
  const firstTimeLoad = useRef(true);
  const historyData = props.route.params.historyData;

  // Build film link with se/ep for TV series (so history can be resumed properly)
  const filmLink = useMemo(() =>
    isTV
      ? `film://${subjectId}/${detailPath}?se=${season}&ep=${episode}`
      : `film://${subjectId}/${detailPath}`,
    [subjectId, detailPath, isTV, season, episode],
  );

  // Throttled progress tracking — saves lastDuration to history every 2s
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
      setTimeout(() => {
        playerRef.current?.skipTo(historyData.lastDuration!);
        ToastAndroid.show('Otomatis kembali ke durasi terakhir', ToastAndroid.SHORT);
      }, 500);
    }
    firstTimeLoad.current = false;
  }, [addExp, episode, isTV, season, subjectId, title, poster, filmLink, historyData]);

  // Fetch captions for current stream
  const fetchCaptions = useCallback(async (streamId: string) => {
    try {
      const caps = await getCaptions(streamId, subjectId, detailPath);
      setCaptions(caps);
      // Auto-select Indonesian if available
      const idCap = caps.find(c => c.lan === 'id');
      if (idCap) {
        setSubtitleUrl(idCap.url);
        setSelectedCaptionLan('id');
      } else if (caps.length > 0) {
        // Fall back to first available caption
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
    if (lan === 'off') {
      setSubtitleUrl(undefined);
    } else {
      const cap = captions.find(c => c.lan === lan);
      if (cap) setSubtitleUrl(cap.url);
    }
  }, [captions]);

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

  // Switch resolution
  const handleResChange = useCallback((val: any) => {
    const id = typeof val === 'string' ? val : val?.value || '';
    const stream = currentStreams.find(s => s.id === id);
    if (stream) setSelectedStream(stream);
  }, [currentStreams]);

  // Load different episode (TV only)
  const loadEpisode = useCallback(async (s: number, e: number) => {
    setIsLoadingEp(true);
    try {
      const newStreams = await getPlayStreams(subjectId, detailPath, s, e);
      if (newStreams.length > 0) {
        setCurrentStreams(newStreams);
        const matchRes = newStreams.find(ns => ns.resolutions === selectedStream?.resolutions);
        const sorted = [...newStreams].sort((a, b) => parseInt(b.resolutions) - parseInt(a.resolutions));
        setSelectedStream(matchRes || sorted[0]);
        // Fetch captions for new stream
        const newStreamId = (matchRes || sorted[0])?.id;
        if (newStreamId) fetchCaptions(newStreamId);
        // Update history with new episode link
        const epLink = `film://${subjectId}/${detailPath}?se=${s}&ep=${e}`;
        setHistory(
          { title, thumbnailUrl: poster || '' } as any,
          epLink,
          false,
          { thumbnailUrl: poster || '', episode: `S${s}E${e}` } as any,
          !isTV,
        );
      } else {
        ToastAndroid.show('Episode tidak tersedia', ToastAndroid.SHORT);
      }
    } catch {
      ToastAndroid.show('Gagal memuat episode', ToastAndroid.SHORT);
    } finally {
      setIsLoadingEp(false);
    }
  }, [subjectId, detailPath, selectedStream?.resolutions, title, poster, fetchCaptions]);

  const goNextEp = useCallback(() => {
    const next = episode + 1;
    setEpisode(next);
    loadEpisode(season, next);
  }, [episode, loadEpisode, season]);

  const goPrevEp = useCallback(() => {
    if (episode <= 1) return;
    const prev = episode - 1;
    setEpisode(prev);
    loadEpisode(season, prev);
  }, [episode, loadEpisode, season]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Native Video Player */}
      <View style={fullscreen ? styles.fullscreen : styles.notFullscreen}>
        {selectedStream?.url ? (
          <VideoPlayer
            title={title}
            thumbnailURL={poster}
            streamingURL={selectedStream.url}
            subtitleURL={subtitleUrl}
            style={{ flex: 1, zIndex: 1 }}
            videoRef={videoRef}
            ref={playerRef}
            fullscreen={fullscreen}
            onFullscreenUpdate={(fs) => fs ? enterFullscreen() : exitFullscreen()}
            onDurationChange={updateHistory}
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

      {/* Controls */}
      {!fullscreen && (
        <KeyboardAwareScrollView bottomOffset={80} style={{ flex: 1, backgroundColor: isDark ? '#0f0f0f' : '#fafafa' }}>
          {/* Fullscreen + Language info */}
          <View style={{ paddingHorizontal: 12, paddingTop: 8, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Button mode="contained-tonal" icon="fullscreen"
              onPress={() => enterFullscreen()} style={{ borderRadius: 8, flex: 1 }} compact>
              Fullscreen
            </Button>
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
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = () => useMemo(() => StyleSheet.create({
  fullscreen: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  notFullscreen: { position: 'relative', aspectRatio: 16 / 9, backgroundColor: '#000' },
}), []);

export default memo(FilmPlayer);
