import Icon from '@react-native-vector-icons/fontawesome';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { ActivityIndicator, Button } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackNavigator } from '../../types/navigation';
import {
  getLanguageOptions,
  getPlayStreams,
  getSeasonInfo,
  hasIndonesian,
  MovieboxSeason,
} from '../../utils/scrapers/moviebox';
import controlWatchLater from '../../utils/watchLaterControl';
import { DatabaseManager } from '../../utils/DatabaseManager';
import ImageLoading from '../misc/ImageLoading';

type Props = NativeStackScreenProps<RootStackNavigator, 'FilmDetail'>;

function FilmDetail(props: Props) {
  const { data } = props.route.params;
  const styles = useStyles();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isTV = data.subjectType === 2;

  // Watch Later state
  const [inWatchLater, setInWatchLater] = useState(false);

  // Check if already in watch later
  useEffect(() => {
    const checkWatchLater = async () => {
      try {
        const wlStr = await DatabaseManager.get('watchLater');
        if (wlStr) {
          const wl: any[] = JSON.parse(wlStr);
          const found = wl.some(item => item.link?.includes(data.subjectId));
          setInWatchLater(found);
        }
      } catch {}
    };
    checkWatchLater();
  }, [data.subjectId]);

  // Language selection
  const langOptions = useMemo(() => getLanguageOptions(data), [data]);
  const [selectedLang, setSelectedLang] = useState(() => {
    // Auto-select Indonesian if available
    const id = langOptions.find(l => l.isIndonesian);
    return id || langOptions[0];
  });

  // Season/episode for TV
  const [seasons, setSeasons] = useState<MovieboxSeason[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<MovieboxSeason | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch season info on mount / language change for TV series
  useEffect(() => {
    if (!isTV) return;
    let cancelled = false;
    (async () => {
      setLoadingSeasons(true);
      try {
        const dp = selectedLang?.detailPath || data.detailPath;
        const result = await getSeasonInfo(data.subjectId, dp);
        if (cancelled) return;
        setSeasons(result);
        if (result.length > 0) {
          setSelectedSeason(result[0]);
          setSelectedEpisode(1);
        }
      } catch {}
      if (!cancelled) setLoadingSeasons(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [data.subjectId, data.detailPath, selectedLang, isTV]);

  // Reset episode when season changes
  useEffect(() => {
    setSelectedEpisode(1);
  }, [selectedSeason]);

  const posterWidth = width * 0.35;
  const posterHeight = posterWidth * 1.5;

  // Parse genres
  const genres = data.genre
    ? data.genre
        .split(',')
        .map(g => g.trim())
        .filter(Boolean)
    : [];

  // Toggle Watch Later
  const handleToggleWatchLater = useCallback(() => {
    if (inWatchLater) {
      // Remove from watch later - find index
      const wlStr = DatabaseManager.getSync('watchLater');
      if (wlStr) {
        const wl: any[] = JSON.parse(wlStr);
        const idx = wl.findIndex(item => item.link?.includes(data.subjectId));
        if (idx >= 0) {
          controlWatchLater('delete', idx);
          setInWatchLater(false);
          ToastAndroid.show('Dihapus dari Tonton Nanti', ToastAndroid.SHORT);
        }
      }
    } else {
      // Add to watch later
      controlWatchLater('add', {
        link: `film://${data.subjectId}/${data.detailPath || ''}`,
        title: data.title,
        rating: data.imdbRatingValue || '',
        releaseYear: data.releaseDate?.slice(0, 4) || '',
        thumbnailUrl: data.cover?.url || '',
        date: Date.now(),
        genre: genres,
        isMovie: !isTV,
      });
      setInWatchLater(true);
      ToastAndroid.show('Ditambahkan ke Tonton Nanti', ToastAndroid.SHORT);
    }
  }, [data, genres, inWatchLater, isTV]);

  // Play handler: fetch stream URLs then navigate to player
  const handlePlay = useCallback(async () => {
    setIsLoading(true);
    const s = selectedSeason?.se ?? 1;
    const e = selectedEpisode;
    try {
      const detailPath = selectedLang?.detailPath || data.detailPath;
      const streams = await getPlayStreams(
        data.subjectId,
        detailPath,
        isTV ? s : undefined,
        isTV ? e : undefined,
      );

      if (!streams.length) {
        if (detailPath !== data.detailPath) {
          const fallbackStreams = await getPlayStreams(
            data.subjectId,
            data.detailPath,
            isTV ? s : undefined,
            isTV ? e : undefined,
          );
          if (fallbackStreams.length) {
            props.navigation.navigate('FilmPlayer', {
              streams: fallbackStreams,
              title: isTV ? `${data.title} S${s}E${e}` : data.title,
              subjectId: data.subjectId,
              detailPath: data.detailPath,
              type: isTV ? 'tv' : 'movie',
              season: isTV ? s : undefined,
              episode: isTV ? e : undefined,
              seasons: isTV ? seasons : undefined,
              poster: data.cover?.url,
              language: selectedLang?.label,
            });
            setIsLoading(false);
            return;
          }
        }
        ToastAndroid.show('Video tidak tersedia untuk episode ini', ToastAndroid.LONG);
        setIsLoading(false);
        return;
      }

      props.navigation.navigate('FilmPlayer', {
        streams,
        title: isTV ? `${data.title} S${s}E${e}` : data.title,
        subjectId: data.subjectId,
        detailPath,
        type: isTV ? 'tv' : 'movie',
        season: isTV ? s : undefined,
        episode: isTV ? e : undefined,
        seasons: isTV ? seasons : undefined,
        poster: data.cover?.url,
        language: selectedLang?.label,
      });
    } catch (e: any) {
      ToastAndroid.show(e.message || 'Gagal memuat video', ToastAndroid.LONG);
    } finally {
      setIsLoading(false);
    }
  }, [data, selectedSeason, selectedEpisode, isTV, props.navigation, selectedLang, seasons]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: isDark ? '#0f0f0f' : '#fafafa' }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}>
      {/* Backdrop Header */}
      <View style={{ width: '100%', height: 220 }}>
        <ImageLoading
          source={{ uri: data.cover?.url }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', isDark ? '#0f0f0f' : '#fafafa']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 }}
        />
      </View>

      {/* Content */}
      <View style={{ paddingHorizontal: 16, marginTop: -60, flexDirection: 'row', gap: 14 }}>
        {/* Poster */}
        <View
          style={{
            width: posterWidth,
            height: posterHeight,
            borderRadius: 10,
            elevation: 6,
            overflow: 'hidden',
            backgroundColor: isDark ? '#1a1a1a' : '#ddd',
          }}>
          <ImageLoading
            source={{ uri: data.cover?.url }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>

        {/* Info */}
        <View style={{ flex: 1, paddingTop: 64 }}>
          {/* Type badge */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <View
              style={{
                backgroundColor: isTV ? '#f59e0b' : '#3b82f6',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 4,
              }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>
                {isTV ? 'TV Series' : 'Movie'}
              </Text>
            </View>
            {hasIndonesian(data) && (
              <View
                style={{
                  backgroundColor: '#ef4444',
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 4,
                }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>Indonesian</Text>
              </View>
            )}
          </View>

          <Text style={[styles.title, { color: isDark ? '#f0f0f0' : '#111' }]} numberOfLines={3}>
            {data.title}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              marginTop: 6,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}>
            {data.releaseDate ? (
              <Text style={[styles.meta, { color: isDark ? '#aaa' : '#666' }]}>
                <Icon name="calendar" size={12} color={isDark ? '#aaa' : '#666'} />{' '}
                {data.releaseDate.slice(0, 4)}
              </Text>
            ) : null}
            {data.imdbRatingValue ? (
              <Text style={[styles.meta, { color: '#f5c518' }]}>
                <Icon name="star" size={12} color="#f5c518" /> {data.imdbRatingValue}
              </Text>
            ) : null}
            {data.countryName ? (
              <Text style={[styles.meta, { color: isDark ? '#888' : '#999', fontSize: 11 }]}>
                {data.countryName}
              </Text>
            ) : null}
          </View>

          {/* Genres */}
          {genres.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
              {genres.slice(0, 4).map(g => (
                <View
                  key={g}
                  style={{
                    backgroundColor: isDark ? '#222' : '#eee',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                  }}>
                  <Text style={{ fontSize: 10, color: isDark ? '#aaa' : '#666' }}>{g}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Synopsis */}
      {data.description ? (
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#f0f0f0' : '#111' }]}>
            Synopsis
          </Text>
          <Text style={[styles.synopsis, { color: isDark ? '#bbb' : '#444' }]}>
            {data.description}
          </Text>
        </View>
      ) : null}

      {/* Language Picker */}
      {langOptions.length > 1 && (
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#f0f0f0' : '#111' }]}>Bahasa</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {langOptions.map(lang => (
              <TouchableOpacity
                key={lang.detailPath}
                onPress={() => setSelectedLang(lang)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor:
                    selectedLang?.detailPath === lang.detailPath
                      ? '#3b82f6'
                      : isDark
                        ? '#1a1a1a'
                        : '#f0f0f0',
                  borderWidth: 1,
                  borderColor:
                    selectedLang?.detailPath === lang.detailPath
                      ? '#3b82f6'
                      : isDark
                        ? '#333'
                        : '#ddd',
                }}>
                <Text
                  style={{
                    fontWeight: '600',
                    fontSize: 13,
                    color:
                      selectedLang?.detailPath === lang.detailPath
                        ? '#fff'
                        : isDark
                          ? '#ccc'
                          : '#444',
                  }}>
                  {lang.isIndonesian ? '🇮🇩 ' : ''}
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* TV Season/Episode Picker */}
      {isTV && (
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#f0f0f0' : '#111' }]}>
            Season & Episode
          </Text>

          {loadingSeasons ? (
            <ActivityIndicator size="small" color="#3b82f6" style={{ marginVertical: 12 }} />
          ) : seasons.length === 0 ? (
            <Text style={{ color: isDark ? '#666' : '#999', fontSize: 13 }}>
              Gagal memuat daftar episode
            </Text>
          ) : (
            <>
              {/* Season Pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {seasons.map(s => {
                  const active = selectedSeason?.se === s.se;
                  return (
                    <TouchableOpacity
                      key={s.se}
                      onPress={() => setSelectedSeason(s)}
                      style={[
                        styles.seasonPill,
                        {
                          backgroundColor: active ? '#3b82f6' : isDark ? '#1a1a1a' : '#f0f0f0',
                          borderColor: active ? '#3b82f6' : isDark ? '#333' : '#ddd',
                        },
                      ]}>
                      <Text
                        style={[
                          styles.seasonPillText,
                          {
                            color: active ? '#fff' : isDark ? '#ccc' : '#444',
                          },
                        ]}>
                        S{s.se}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Episode Grid */}
              <View style={{ marginTop: 10 }}>
                <EpisodeGrid
                  maxEp={selectedSeason?.maxEp ?? 1}
                  selectedEp={selectedEpisode}
                  onSelect={setSelectedEpisode}
                  isDark={isDark}
                />
              </View>
            </>
          )}
        </View>
      )}

      {/* Play + Watch Later Buttons */}
      <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 10 }}>
        <Button
          mode="contained"
          buttonColor="#3b82f6"
          textColor="#fff"
          icon="play"
          style={{ borderRadius: 10, paddingVertical: 4 }}
          labelStyle={{ fontSize: 16, fontWeight: '700' }}
          onPress={handlePlay}
          disabled={isLoading}>
          {isLoading
            ? 'Memuat...'
            : isTV
              ? `Tonton S${selectedSeason?.se ?? 1} E${selectedEpisode}`
              : 'Tonton Sekarang'}
        </Button>

        <Button
          mode={inWatchLater ? 'contained-tonal' : 'outlined'}
          icon={inWatchLater ? 'check' : 'bookmark-plus-outline'}
          style={{ borderRadius: 10 }}
          labelStyle={{ fontSize: 14, fontWeight: '600' }}
          onPress={handleToggleWatchLater}>
          {inWatchLater ? 'Tersimpan di Tonton Nanti' : 'Tonton Nanti'}
        </Button>

        {isLoading && <ActivityIndicator size="small" color="#3b82f6" style={{ marginTop: 4 }} />}
      </View>

      {/* Subtitles info */}
      {data.subtitles && (
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <Text style={[styles.meta, { color: isDark ? '#666' : '#999', fontSize: 11 }]}>
            <Icon name="language" size={10} color={isDark ? '#666' : '#999'} /> Subtitle:{' '}
            {data.subtitles}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function useStyles() {
  const { width } = useWindowDimensions();
  return useMemo(
    () =>
      StyleSheet.create({
        title: { fontSize: 20, fontWeight: '800', lineHeight: 26 },
        meta: { fontSize: 13, fontWeight: '500' },
        sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
        synopsis: { fontSize: 14, lineHeight: 22 },
        seasonPill: {
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 8,
          borderWidth: 1,
        },
        seasonPillText: { fontSize: 14, fontWeight: '700' },
        episodeBox: {
          borderRadius: 8,
          justifyContent: 'center',
          alignItems: 'center',
          aspectRatio: 1,
        },
        episodeBoxText: { fontSize: 14, fontWeight: '700' },
      }),
    [width],
  );
}

// ─── Episode Grid ──────────────────────────────────────────────────────

const EpisodeGrid = memo(
  ({
    maxEp,
    selectedEp,
    onSelect,
    isDark,
  }: {
    maxEp: number;
    selectedEp: number;
    onSelect: (ep: number) => void;
    isDark: boolean;
  }) => {
    const { width: screenWidth } = useWindowDimensions();
    const cols = screenWidth < 400 ? 5 : screenWidth < 600 ? 6 : 7;
    const gap = 8;
    const padding = 32;
    const boxSize = (screenWidth - padding - (cols - 1) * gap) / cols;

    const data = useMemo(() => {
      const arr: number[] = [];
      for (let i = 1; i <= maxEp; i++) arr.push(i);
      return arr;
    }, [maxEp]);

    const renderItem = useCallback(
      ({ item }: { item: number }) => {
        const active = item === selectedEp;
        return (
          <TouchableOpacity
            onPress={() => onSelect(item)}
            style={{
              width: boxSize,
              height: boxSize,
              borderRadius: 8,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: active ? '#3b82f6' : isDark ? '#1a1a1a' : '#f0f0f0',
              borderWidth: active ? 2 : 1,
              borderColor: active ? '#3b82f6' : isDark ? '#333' : '#ddd',
            }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: active ? '#fff' : isDark ? '#ccc' : '#444',
              }}>
              {item}
            </Text>
          </TouchableOpacity>
        );
      },
      [selectedEp, onSelect, boxSize, isDark],
    );

    return (
      <FlatList
        data={data}
        numColumns={cols}
        key={cols}
        renderItem={renderItem}
        keyExtractor={item => String(item)}
        columnWrapperStyle={{ gap }}
        scrollEnabled={false}
        removeClippedSubviews={true}
      />
    );
  },
);

export default memo(FilmDetail);
