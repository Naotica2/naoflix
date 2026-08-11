import Icon from '@react-native-vector-icons/fontawesome';
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
import useGlobalStyles from '../../assets/style';
import { RootStackNavigator } from '../../types/navigation';
import { getPlayStreams, MovieboxStream } from '../../utils/scrapers/moviebox';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useLevel } from '../../misc/LevelContext';
import { EXP_REWARDS } from '../../utils/LevelSystem';
import setHistory from '../../utils/historyControl';
import { usePresenceActivity } from '../../utils/presenceSystem';
import CommentSection from '../Comments/CommentSection';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTimeTracker } from '../../utils/UserTracker';
import NobarInviteSheet from './NobarInviteSheet';
import NobarChatSection from './NobarChatSection';
import { useWatchParty } from '../../hooks/useWatchParty';
import { useAuth } from '../../misc/AuthContext';
import { supabase } from '../../config/supabaseClient';
import VIPOfferModal from './VIPOfferModal';
import { WebView } from 'react-native-webview';

type Props = NativeStackScreenProps<RootStackNavigator, 'FilmPlayer'>;

// Script to inject into WebView to block popups and ads
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

    // Block common ad-related redirects
    var origAssign = Object.getOwnPropertyDescriptor(Location.prototype, 'assign');
    var origReplace = Object.getOwnPropertyDescriptor(Location.prototype, 'replace');

    // Prevent adding new iframes (ad containers)
    var origCreateElement = document.createElement.bind(document);
    document.createElement = function(tag) {
      var el = origCreateElement(tag);
      if (tag.toLowerCase() === 'iframe') {
        setTimeout(function() {
          if (el.parentNode && !el.src.includes('videonode') && !el.src.includes('hydrax') && !el.src.includes('turbovip') && !el.src.includes('cast')) {
            el.parentNode.removeChild(el);
          }
        }, 100);
      }
      return el;
    };

    true;
  })();
`;

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

  const [currentStreams, setCurrentStreams] = useState<MovieboxStream[]>(streams);
  const [selectedStream, setSelectedStream] = useState<MovieboxStream>(() => {
    // Prefer the first stream (usually p2p which is most reliable)
    return streams[0] || { format: 'IFRAME', id: '', url: '', resolutions: '', size: '0', duration: 0, codecName: '' };
  });

  const [fullscreen, setFullscreen] = useState(false);
  const [isLoadingEp, setIsLoadingEp] = useState(false);
  const [season, setSeason] = useState(initialSeason);
  const [episode, setEpisode] = useState(initialEpisode);
  const [webViewLoading, setWebViewLoading] = useState(true);

  const isGuest = (props.route.params as any).isGuest || false;
  const initialRoomId = (props.route.params as any).roomId || '';
  const [inviteVisible, setInviteVisible] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(initialRoomId);
  const [showVIPModal, setShowVIPModal] = useState(false);

  const { participants, remoteState, broadcastState, chatMessages, broadcastChat, broadcastMediaChange, mediaChangeLink, isActive, connectionStatus, isHostMissing } = useWatchParty(
    roomId || null,
    !isGuest,
    { ...props.route.params, title: isTV ? `${title} - S${season}E${episode}` : title }
  );

  usePresenceActivity(`Sedang menonton ${title}${isTV ? ` S${season} E${episode}` : ''}`);

  const { addExp } = useLevel();
  const awardedExpRef = useRef(new Set<string>());
  const historyData = props.route.params.historyData;
  const participantsCount = participants.length;

  useEffect(() => {
    if (!isGuest && roomId && selectedStream) {
      broadcastMediaChange(`${season}-${episode}|${selectedStream.url}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantsCount, isGuest, roomId]);

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
      !isTV, // isMovie
    );
  }, [addExp, episode, isTV, season, subjectId, title, poster, filmLink]);

  useEffect(() => {
    props.navigation.setOptions({ headerTitle: title, headerShown: !fullscreen });
  }, [title, fullscreen, props.navigation]);

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

  // Server picker data
  const serverData = useMemo(() =>
    currentStreams.map(s => ({
      label: s.codecName || s.resolutions || 'Server',
      value: s.id,
    })),
    [currentStreams],
  );

  const handleServerChange = useCallback((serverId: string) => {
    const stream = currentStreams.find(s => s.id === serverId);
    if (stream) {
      setSelectedStream(stream);
      setWebViewLoading(true);
      if (!isGuest && roomId) {
        broadcastMediaChange(`${season}-${episode}|${stream.url}`);
      }
    }
  }, [currentStreams, isGuest, roomId, season, episode, broadcastMediaChange]);

  const loadEpisode = useCallback(async (s: number, e: number) => {
    setIsLoadingEp(true);
    try {
      const newStreams = await getPlayStreams(subjectId, detailPath, s, e);
      if (newStreams.length > 0) {
        setCurrentStreams(newStreams);
        setSelectedStream(newStreams[0]);
        setSeason(s);
        setEpisode(e);
        setWebViewLoading(true);

        const epLink = `film://${subjectId}/${detailPath}?se=${s}&ep=${e}`;
        setHistory(
          { title, thumbnailUrl: poster || '' } as any,
          epLink,
          false,
          { thumbnailUrl: poster || '', episode: `S${s}E${e}` } as any,
          !isTV,
        );

        if (!isGuest && roomId) {
          broadcastMediaChange(`${s}-${e}|${newStreams[0].url}`);
        }
      } else {
        ToastAndroid.show('Episode tidak tersedia', ToastAndroid.SHORT);
      }
    } catch {
      ToastAndroid.show('Gagal memuat episode', ToastAndroid.SHORT);
    } finally {
      setIsLoadingEp(false);
    }
  }, [subjectId, detailPath, title, poster, isGuest, roomId, broadcastMediaChange, isTV]);

  // Handle nobar media change from host
  const lastMediaChangeRef = useRef<string | null>(null);

  useEffect(() => {
    if (mediaChangeLink && isGuest && mediaChangeLink !== lastMediaChangeRef.current) {
      lastMediaChangeRef.current = mediaChangeLink;
      const parts = mediaChangeLink.split('|');
      const epParts = parts[0].split('-');
      const targetUrl = parts[1];

      if (epParts.length === 2) {
        const s = parseInt(epParts[0], 10);
        const e = parseInt(epParts[1], 10);
        if (!isNaN(s) && !isNaN(e)) {
          if (s !== season || e !== episode) {
            loadEpisode(s, e);
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
  }, [mediaChangeLink, isGuest, loadEpisode, season, episode, currentStreams, selectedStream]);

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
    loadEpisode(season, next);
  }, [episode, loadEpisode, season, isGuest, roomId, checkNobarLimit]);

  const goPrevEp = useCallback(() => {
    if (episode <= 1) return;
    if (!isGuest && roomId && !checkNobarLimit()) return;
    const prev = episode - 1;
    loadEpisode(season, prev);
  }, [episode, loadEpisode, season, isGuest, roomId, checkNobarLimit]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* WebView Player */}
      <View style={fullscreen ? styles.fullscreen : styles.notFullscreen}>
        {selectedStream?.url ? (
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <WebView
              source={{ uri: selectedStream.url }}
              injectedJavaScript={AD_BLOCK_SCRIPT}
              javaScriptCanOpenWindowsAutomatically={false}
              setSupportMultipleWindows={false}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo={true}
              style={{ flex: 1, backgroundColor: '#000' }}
              onLoad={handleWebViewLoad}
              onLoadStart={() => setWebViewLoading(true)}
              onShouldStartLoadWithRequest={(request) => {
                // Allow only the video player URLs, block ad redirects
                const url = request.url;
                if (
                  url.includes('videonode') ||
                  url.includes('hydrax') ||
                  url.includes('turbovip') ||
                  url.includes('cast') ||
                  url.includes('lk21') ||
                  url.includes('nontondrama') ||
                  url.startsWith('about:blank')
                ) {
                  return true;
                }
                // Block everything else (ad redirects)
                return false;
              }}
            />
            {webViewLoading && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)' }}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={{ color: '#fff', marginTop: 10, fontSize: 13 }}>Memuat video...</Text>
              </View>
            )}

            {/* Floating Navigation Overlay in Fullscreen */}
            {fullscreen && isTV && (
              <View style={{ position: 'absolute', top: 20, right: 20, flexDirection: 'row', gap: 10, zIndex: 10 }}>
                <Button 
                  mode="contained" 
                  onPress={goPrevEp} 
                  disabled={episode <= 1 || isLoadingEp}
                  style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8 }} 
                  icon="arrow-left" 
                  compact>
                  Prev
                </Button>
                <Button 
                  mode="contained" 
                  onPress={goNextEp} 
                  disabled={isLoadingEp}
                  style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8 }} 
                  icon="arrow-right" 
                  compact>
                  Next
                </Button>
              </View>
            )}
          </View>
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
              {/* Fullscreen + Nobar buttons */}
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

                        supabase.from('profiles').update({
                          nobar_count: currentCount + 1,
                          last_nobar_date: today
                        }).eq('id', user.id).then();
                        profile.nobar_count = currentCount + 1;
                        profile.last_nobar_date = today;
                      }

                      const newRoomId = Math.random().toString(36).substring(2, 10);
                      setRoomId(newRoomId);
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

              {/* Server Picker */}
              {currentStreams.length > 1 && (
                <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
                  <Text style={[globalStyles.text, { fontSize: 14, fontWeight: '700', marginBottom: 6, color: isDark ? '#eee' : '#222' }]}>Server</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {currentStreams.map(s => {
                      const active = s.id === selectedStream?.id;
                      return (
                        <Button
                          key={s.id}
                          mode={active ? 'contained' : 'outlined'}
                          compact
                          style={{ borderRadius: 8 }}
                          buttonColor={active ? '#3b82f6' : undefined}
                          onPress={() => handleServerChange(s.id)}>
                          {(s.codecName || s.resolutions || 'Server').toUpperCase()}
                        </Button>
                      );
                    })}
                  </View>
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
                    Server: {(selectedStream.codecName || selectedStream.resolutions || 'default').toUpperCase()} • LK21
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
