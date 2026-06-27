import MaterialIcon from '@react-native-vector-icons/material-icons';
import Icon from '@react-native-vector-icons/fontawesome';
import { StackActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import React, { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity as TouchableOpacityReactNative,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { RefreshControl, ScrollView } from 'react-native-gesture-handler';
import { useTheme } from 'react-native-paper';
import Reanimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useGlobalStyles from '../../assets/style';
import {
  EpisodeBaruHomeContext,
  ComicsListContext,
  NovelListContext,
} from '../../misc/context';
import { RootStackNavigator } from '../../types/navigation';
import { EpisodeBaruHome, NewAnimeList, JadwalAnime } from '../../types/anime';
import { HistoryItemKey } from '../../types/databaseTarget';
import { HistoryJSON } from '../../types/historyJSON';
import AnimeAPI from '../../utils/AnimeAPI';
import { DatabaseManager, useModifiedKeyValueIfFocused } from '../../utils/DatabaseManager';
import {
  LatestComicsRelease,
  getLatestComicsReleases,
} from '../../utils/scrapers/comicsv2';
import { LatestNovel, getLatestNovels } from '../../utils/scrapers/meionovel';
import { getTrending, MovieboxSearchItem } from '../../utils/scrapers/moviebox';

import Announcment from '../misc/Announcement';
import { ListAnimeComponent } from '../misc/ListAnimeComponent';
import ImageLoading from '../misc/ImageLoading';
import DarkOverlay from '../misc/DarkOverlay';
import { TouchableOpacity } from '../misc/TouchableOpacityRNGH';
import { ShowSkeletonLoading, RenderScrollComponent } from './AnimePage';
import { LegendList } from '@legendapp/list';

// ============ HERO CAROUSEL ============
const HERO_ITEM_COUNT = 5;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

function HeroCarousel({ data, navigation }: { data: NewAnimeList[]; navigation: any }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<any>(null);
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const heroData = useMemo(() => data.slice(0, HERO_ITEM_COUNT), [data]);
  const HERO_HEIGHT = Math.round(SCREEN_WIDTH * 0.55);

  const startAutoScroll = useCallback(() => {
    if (autoScrollRef.current) clearInterval(autoScrollRef.current);
    autoScrollRef.current = setInterval(() => {
      setActiveIndex(prev => {
        const next = (prev + 1) % heroData.length;
        flatListRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 4000);
  }, [heroData.length]);

  useEffect(() => {
    if (heroData.length > 1) startAutoScroll();
    return () => { if (autoScrollRef.current) clearInterval(autoScrollRef.current); };
  }, [heroData.length, startAutoScroll]);

  if (heroData.length === 0) return null;

  const renderItem = ({ item }: { item: NewAnimeList }) => (
    <TouchableOpacityReactNative
      activeOpacity={0.9}
      onPress={() => {
        navigation.dispatch(StackActions.push('FromUrl', {
          title: item.title,
          link: item.streamingLink,
          type: 'anime',
        }));
      }}
      style={[heroStyles.slide, { height: HERO_HEIGHT }]}>
      <ImageLoading
        resizeMode="cover"
        source={{ uri: item.thumbnailUrl }}
        style={[heroStyles.image, { height: HERO_HEIGHT }]}>
        <View style={heroStyles.gradientTop} />
        <View style={heroStyles.gradientBottom} />
        <View style={heroStyles.overlay}>
          <View style={heroStyles.infoContainer}>
            <Text numberOfLines={2} style={heroStyles.title}>{item.title}</Text>
            <Text numberOfLines={1} style={heroStyles.episode}>{item.episode}</Text>
            <View style={heroStyles.ctaButton}>
              <Icon name="play" size={14} color="#fff" />
              <Text style={heroStyles.ctaText}>Tonton</Text>
            </View>
          </View>
        </View>
      </ImageLoading>
    </TouchableOpacityReactNative>
  );

  return (
    <View style={[heroStyles.container, { height: HERO_HEIGHT }]}>
      <FlashList
        estimatedItemSize={200}
        ref={flatListRef}
        data={heroData}
        renderItem={renderItem}
        keyExtractor={(item, i) => `hero-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setActiveIndex(idx);
        }}
      />
      {/* Dot indicators */}
      <View style={heroStyles.dotsContainer}>
        {heroData.map((_, i) => (
          <View
            key={i}
            style={[
              heroStyles.dot,
              {
                backgroundColor: i === activeIndex ? '#3b82f6' : (isDark ? '#444' : '#ccc'),
                width: i === activeIndex ? 18 : 6,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const heroStyles = StyleSheet.create({
  container: { marginBottom: 12 },
  slide: { width: SCREEN_WIDTH },
  image: { width: SCREEN_WIDTH },
  gradientBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  gradientTop: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '20%',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16 },
  infoContainer: {},
  title: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },
  episode: { fontSize: 13, color: '#ddd', marginBottom: 10, fontWeight: '500' },
  ctaButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b82f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start', gap: 6 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  dotsContainer: { flexDirection: 'row', justifyContent: 'center', gap: 5, position: 'absolute', bottom: 8, left: 0, right: 0 },
  dot: { height: 6, borderRadius: 3 },
});

// ============ CONTINUE WATCHING ROW ============
function ContinueWatchingRow({ navigation }: { navigation: any }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const globalStyles = useGlobalStyles();

  const historyKeys = useModifiedKeyValueIfFocused(
    'historyKeyCollectionsOrder',
    state => JSON.parse(state) as HistoryItemKey[],
    [] as HistoryItemKey[],
  );

  const [historyItems, setHistoryItems] = useState<(HistoryJSON & { contentType: string })[]>([]);

  useEffect(() => {
    const loadItems = async () => {
      const items: (HistoryJSON & { contentType: string })[] = [];
      // History keys are ordered most-recent-first
      // Key format: historyItem:title:isComics:isMovie
      for (const key of historyKeys.slice(0, 20)) {
        try {
          const parts = key.split(':');
          const isComics = parts[parts.length - 2] === 'true';
          const isMovie = parts[parts.length - 1] === 'true';
          // Only show video content (anime + film), exclude comics and novels
          if (isComics) continue;
          const raw = await DatabaseManager.get(key);
          if (raw) {
            const parsed: HistoryJSON = JSON.parse(raw);
            if (parsed.link?.includes('meionovel')) continue; // Exclude novels
            if (parsed.title && parsed.link) {
              // Determine content type for correct navigation
              let contentType = 'anime';
              if (parsed.link.startsWith('film://')) {
                contentType = 'movie';
              } else if (isMovie || parsed.isMovie) {
                contentType = 'movie';
              }
              items.push({ ...parsed, contentType });
            }
          }
        } catch {}
        if (items.length >= 10) break;
      }
      setHistoryItems(items);
    };
    loadItems();
  }, [historyKeys]);

  if (historyItems.length === 0) return null;

  return (
    <View style={sectionStyles.container}>
      <View style={sectionStyles.header}>
        <Text style={[sectionStyles.title, { color: isDark ? '#f0f0f0' : '#1a1a1a' }]}>
          Lanjutkan Menonton
        </Text>
      </View>
      <FlashList
        estimatedItemSize={200}
        data={historyItems}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
        removeClippedSubviews={true}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        renderItem={({ item }) => (
          <TouchableOpacityReactNative
            style={{ width: 140 }}
            onPress={() => {
              navigation.dispatch(StackActions.push('FromUrl', {
                title: item.title,
                link: item.link,
                type: item.contentType,
                historyData: item,
                thumbnailUrl: item.thumbnailUrl,
              }));
            }}>
            <ImageLoading
              resizeMode="cover"
              source={{ uri: item.thumbnailUrl }}
              style={{ width: 140, height: 80, borderRadius: 8 }}>
              <DarkOverlay transparent={0.4} />
              {(item.lastDuration ?? 0) > 0 && (
                <View style={{ position: 'absolute', bottom: 4, left: 4, right: 4 }}>
                  <View style={{ height: 3, backgroundColor: '#333', borderRadius: 2 }}>
                    <View style={{ height: 3, backgroundColor: '#3b82f6', borderRadius: 2, width: `${Math.min(100, ((item.lastDuration || 0) / 1440) * 100)}%` }} />
                  </View>
                </View>
              )}
            </ImageLoading>
            <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#e0e0e0' : '#222', marginTop: 4 }}>
              {item.title}
            </Text>
            {item.episode && (
              <Text numberOfLines={1} style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                {item.episode}
              </Text>
            )}
          </TouchableOpacityReactNative>
        )}
        keyExtractor={(item, i) => `cw-${i}`}
      />
    </View>
  );
}

// ============ SECTION ROW STYLES (shared) ============
const sectionStyles = StyleSheet.create({
  container: { paddingVertical: 4, marginBottom: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  seeMoreBtn: { flexDirection: 'row', alignItems: 'center' },
  seeMoreText: { fontSize: 13, fontWeight: '600', color: '#3b82f6' },
});

// ============ MEMOIZED FILM CARD ============
const filmCardStyles = StyleSheet.create({
  container: { width: 120 },
  poster: { width: 120, height: 170, borderRadius: 8 },
  title: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 4, marginTop: 2, alignItems: 'center' },
  badge: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  imdb: { fontSize: 10, color: '#f5c518', fontWeight: '600' },
});

const FilmCard = memo(({ item, navigation }: { item: MovieboxSearchItem; navigation: any }) => {
  const isDark = useColorScheme() === 'dark';
  return (
    <TouchableOpacity
      style={filmCardStyles.container}
      onPress={() => navigation.dispatch(StackActions.push('FilmDetail', { data: item }))}>
      <ImageLoading
        resizeMode="cover"
        source={{ uri: item.cover?.url }}
        style={filmCardStyles.poster}
      />
      <Text numberOfLines={2} style={[filmCardStyles.title, { color: isDark ? '#e0e0e0' : '#222' }]}>
        {item.title}
      </Text>
      <View style={filmCardStyles.metaRow}>
        <View style={[filmCardStyles.badge, { backgroundColor: item.subjectType === 2 ? '#f59e0b' : '#3b82f6' }]}>
          <Text style={filmCardStyles.badgeText}>{item.subjectType === 2 ? 'TV' : 'Movie'}</Text>
        </View>
        {item.imdbRatingValue ? (
          <Text style={filmCardStyles.imdb}>★ {item.imdbRatingValue}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

// ============ SECTION ROW WRAPPER ============
function SectionRow<T>({
  title, data, renderItem, navigation, seeMoreType, seeMoreLabel,
}: {
  title: string;
  data: T[] | null | undefined;
  renderItem: (info: ListRenderItemInfo<T>) => React.ReactElement;
  navigation: any;
  seeMoreType?: string;
  seeMoreLabel?: string;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const slicedData = useMemo(() => data?.slice(0, 25), [data]);

  return (
    <View style={sectionStyles.container}>
      <View style={sectionStyles.header}>
        <Text style={[sectionStyles.title, { color: isDark ? '#f0f0f0' : '#1a1a1a' }]}>{title}</Text>
        {seeMoreType && (
          <TouchableOpacity
            style={sectionStyles.seeMoreBtn}
            disabled={!data || data.length === 0}
            onPress={() => navigation.dispatch(StackActions.push('SeeMore', { type: seeMoreType }))}>
            <Text style={sectionStyles.seeMoreText}>{seeMoreLabel || 'Lihat Semua'}</Text>
            <MaterialIcon name="chevron-right" size={16} color="#3b82f6" />
          </TouchableOpacity>
        )}
      </View>
      {!data ? (
        <ShowSkeletonLoading />
      ) : slicedData && slicedData.length > 0 ? (
        <FlashList
          estimatedItemSize={200}
          renderScrollComponent={RenderScrollComponent}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          horizontal
          data={slicedData}
          renderItem={renderItem}
          keyExtractor={(item: any, i: number) => `${title}-${i}`}
          showsHorizontalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
          removeClippedSubviews={true}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
        />
      ) : (
        <View style={{ paddingHorizontal: 16, paddingVertical: 20 }}>
          <Text style={{ color: isDark ? '#777' : '#999', fontSize: 13, fontStyle: 'italic' }}>
            Data tidak ditemukan atau gagal memuat. Tarik ke bawah untuk memuat ulang.
          </Text>
        </View>
      )}
    </View>
  );
}

// ============ JADWAL RILIS SECTION ============
const WEEKDAYS_ORDER = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

function getTodayIndonesian(): string {
  // JS getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
  const jsDay = new Date().getDay();
  // Map to Indonesian: Monday=0 → Senin, ..., Sunday=6 → Minggu
  return WEEKDAYS_ORDER[jsDay === 0 ? 6 : jsDay - 1];
}

function JadwalRilisSection({ navigation }: { navigation: any }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [jadwalData, setJadwalData] = useState<JadwalAnime | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    AnimeAPI.jadwalAnime()
      .then(res => {
        setJadwalData(res);
        if (res && Object.keys(res).length > 0) {
          // Auto-select today
          const today = getTodayIndonesian();
          setSelectedDay(res[today] ? today : Object.keys(res)[0]);
        }
      })
      .catch(() => ToastAndroid.show('Gagal memuat jadwal rilis', ToastAndroid.SHORT))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading && !jadwalData) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <ActivityIndicator size="small" color="#3b82f6" />
      </View>
    );
  }

  if (!jadwalData || Object.keys(jadwalData).length === 0) return null;

  // Sort days in weekday order (Senin → Minggu)
  const days = WEEKDAYS_ORDER.filter(d => jadwalData[d] !== undefined);
  const currentDayData = selectedDay ? jadwalData[selectedDay] || [] : [];

  return (
    <View style={[sectionStyles.container, { marginHorizontal: 16, backgroundColor: isDark ? '#151515' : '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: isDark ? '#222' : '#eee' }]}>
      <Text style={[sectionStyles.title, { color: isDark ? '#f0f0f0' : '#1a1a1a', marginBottom: 12 }]}>
        Jadwal Rilis Minggu Ini
      </Text>
      {/* Day tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
        {days.map(day => (
          <TouchableOpacityReactNative
            key={day}
            onPress={() => setSelectedDay(day)}
            style={{
              paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
              backgroundColor: day === selectedDay ? '#3b82f6' : (isDark ? '#222' : '#f0f0f0'),
            }}>
            <Text style={{ fontWeight: '700', fontSize: 12, color: day === selectedDay ? '#fff' : (isDark ? '#aaa' : '#666') }}>
              {day}
            </Text>
          </TouchableOpacityReactNative>
        ))}
      </ScrollView>
      {/* Anime list for selected day */}
      {currentDayData.length > 0 ? (
        currentDayData.slice(0, 10).map((anime, idx) => (
          <TouchableOpacity
            key={anime.title}
            style={{
              paddingVertical: 10, paddingHorizontal: 12,
              backgroundColor: isDark ? (idx % 2 === 0 ? '#1a1a1a' : '#151515') : (idx % 2 === 0 ? '#f9f9f9' : '#fff'),
              borderRadius: 6, marginBottom: 2,
            }}
            onPress={() => {
              navigation.dispatch(StackActions.push('FromUrl', {
                title: anime.title,
                link: anime.link,
                type: 'anime',
              }));
            }}>
            <Text numberOfLines={1} style={{ color: isDark ? '#ccc' : '#333', fontSize: 13, fontWeight: '500' }}>
              {anime.title}
            </Text>
          </TouchableOpacity>
        ))
      ) : (
        <Text style={{ color: '#888', fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
          Tidak ada jadwal untuk hari ini
        </Text>
      )}
    </View>
  );
}

// ============ MAIN HOME PAGE ============
function HomePage({ navigation }: { navigation: any }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  // ---- Contexts ----
  const { paramsState: animeData, setParamsState: setAnimeData } = useContext(EpisodeBaruHomeContext);
  const { paramsState: comicsData, setParamsState: setComicsData } = useContext(ComicsListContext);
  const { paramsState: novelData, setParamsState: setNovelData } = useContext(NovelListContext);

  // ---- Additional data states ----

  const [refresh, setRefresh] = useState(false);
  const [filmData, setFilmData] = useState<MovieboxSearchItem[] | null>(null);

  // Helper: create AbortSignal with timeout
  const withTimeout = useCallback((ms: number): AbortSignal => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  }, []);

  // Load comics data (with 20s timeout)
  useEffect(() => {
    if (comicsData !== undefined) return;
    const signal = withTimeout(20000);
    getLatestComicsReleases(1, signal).then(z => setComicsData?.(z)).catch(() => setComicsData?.([]));
  }, [setComicsData, comicsData, withTimeout]);

  // Load novel data (with 20s timeout)
  useEffect(() => {
    if (novelData !== undefined) return;
    const signal = withTimeout(20000);
    getLatestNovels(1, signal).then(z => setNovelData?.(z)).catch(() => setNovelData?.([]));
  }, [setNovelData, novelData, withTimeout]);

  // Load film trending data (with 20s timeout)
  useEffect(() => {
    if (filmData !== null) return;
    const signal = withTimeout(20000);
    getTrending(0, signal).then(z => setFilmData(z)).catch(() => setFilmData([]));
  }, [filmData, withTimeout]);

  const onRefresh = useCallback(() => {
    setRefresh(true);
    setAnimeData?.(val => (val ? { ...val, newAnime: [] } : { newAnime: [], jadwalAnime: {} }));
    setComicsData?.(undefined);
    setNovelData?.(undefined);
    setFilmData(null);
    AnimeAPI.home()
      .then(data => { setAnimeData?.(data); setRefresh(false); })
      .catch(() => { ToastAndroid.show('Gagal terhubung ke server.', ToastAndroid.SHORT); setRefresh(false); });
    // Reload other data
    getLatestComicsReleases().then(z => setComicsData?.(z)).catch(() => setComicsData?.([]));
    getLatestNovels().then(z => setNovelData?.(z)).catch(() => setNovelData?.([]));
    getTrending().then(z => setFilmData(z)).catch(() => setFilmData([]));
  }, [setAnimeData, setComicsData, setNovelData]);

  // ---- Render item helpers ----
  const renderAnimeItem = useCallback(
    ({ item }: ListRenderItemInfo<NewAnimeList>) => (
      <ListAnimeComponent newAnimeData={item} key={'ep' + item.title + item.episode} navigationProp={navigation} />
    ), [navigation],
  );

  const renderComicItem = useCallback(
    ({ item }: ListRenderItemInfo<LatestComicsRelease>) => (
      <ListAnimeComponent newAnimeData={item} type="comics" key={'comic' + item.title} navigationProp={navigation} />
    ), [navigation],
  );

  const renderNovelItem = useCallback(
    ({ item }: ListRenderItemInfo<LatestNovel>) => (
      <ListAnimeComponent
        newAnimeData={item}
        type="novel"
        key={'novel' + item.title}
        navigationProp={navigation}
      />
    ), [navigation],
  );

  const renderFilmItem = useCallback(
    ({ item }: ListRenderItemInfo<MovieboxSearchItem>) => (
      <FilmCard item={item} navigation={navigation} />
    ), [navigation],
  );

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0f0f0f' : '#fafafa' }}>
      <Announcment />
      <LegendList
        recycleItems
        renderScrollComponent={(p: any) => <ScrollView {...p} />}
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refresh}
            onRefresh={onRefresh}
            progressBackgroundColor={isDark ? '#0f0f0f' : '#fafafa'}
            colors={['#3b82f6', '#ff9a56']}
          />
        }
        ListHeaderComponent={
          <>
            {/* Hero Carousel */}
            {animeData && animeData.newAnime.length > 0 && (
              <HeroCarousel data={animeData.newAnime} navigation={navigation} />
            )}

            {/* Continue Watching */}
            <ContinueWatchingRow navigation={navigation} />

            {/* Episode Terbaru */}
            <SectionRow
              title="Episode Terbaru"
              data={animeData?.newAnime}
              renderItem={renderAnimeItem}
              navigation={navigation}
              seeMoreType="AnimeList"
            />

            {/* Komik Terbaru */}
            <SectionRow
              title="Komik Terbaru"
              data={comicsData}
              renderItem={renderComicItem}
              navigation={navigation}
              seeMoreType="ComicsList"
            />

            {/* Novel Terbaru */}
            <SectionRow
              title="Novel Terbaru"
              data={novelData}
              renderItem={renderNovelItem}
              navigation={navigation}
              seeMoreType="NovelsList"
            />

            {/* Film Terbaru */}
            <SectionRow
              title="Film Terbaru"
              data={filmData}
              renderItem={renderFilmItem}
              navigation={navigation}
              seeMoreType="FilmList"
            />
          </>
        }
        data={[]}
        keyExtractor={(_, i) => String(i)}
        renderItem={() => <View />}
        ListFooterComponent={
          <View style={{ paddingBottom: 20 }}>
            {/* Jadwal Rilis */}
            <JadwalRilisSection navigation={navigation} />
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

export default memo(HomePage);
