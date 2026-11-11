import MaterialIcon from '@react-native-vector-icons/material-icons';
import Icon from '@react-native-vector-icons/fontawesome';
import { StackActions, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  StyleSheet,
  Text,
  TouchableOpacity as TouchableOpacityReactNative,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { RefreshControl, ScrollView } from 'react-native-gesture-handler';
import { Button, Dialog, Portal, TextInput } from 'react-native-paper';
import {
  EpisodeBaruHomeContext,
  ComicsListContext,
} from '../../misc/context';
import { TranslationKey, useLanguage } from '../../misc/LanguageContext';
import { AnimeSchedule, NewAnimeList } from '../../types/anime';
import { HistoryItemKey } from '../../types/databaseTarget';
import { HistoryJSON } from '../../types/historyJSON';
import AnimeAPI from '../../utils/AnimeAPI';
import { fetchLatestAnimeIndoDomain } from '../../utils/scrapers/animeindo';
import { DatabaseManager, useModifiedKeyValueIfFocused } from '../../utils/DatabaseManager';
import { getSourceVersion } from '../../utils/sourcePreferences';
import offlineDownloadManager from '../../utils/offlineDownloadManager';
import { ActiveDownloadItem } from '../../types/offlineAnime';
import {
  LatestComicsRelease,
  getLatestComicsReleases,
  getPopularComicsReleases,
  getManhwaWebtoonReleases,
} from '../../utils/scrapers/comicsv2';
import { getTrending } from '../../utils/scrapers/lk21';
import { FilmSearchItem } from '../../types/film';

import Announcment from '../misc/Announcement';
import { ListAnimeComponent } from '../misc/ListAnimeComponent';
import ImageLoading from '../misc/ImageLoading';
import DarkOverlay from '../misc/DarkOverlay';
import { TouchableOpacity } from '../misc/TouchableOpacityRNGH';
import { MIN_IMAGE_WIDTH, ShowSkeletonLoading, RenderScrollComponent } from './AnimePage';

type CategoryFilter = 'all' | 'anime' | 'film' | 'comics';

const CATEGORY_TABS: { key: CategoryFilter; labelKey: TranslationKey }[] = [
  { key: 'all', labelKey: 'lists.filterAll' },
  { key: 'anime', labelKey: 'lists.filterAnime' },
  { key: 'film', labelKey: 'lists.filterFilms' },
  { key: 'comics', labelKey: 'lists.filterComics' },
];

const HERO_ITEM_COUNT = 5;

const HorizontalSeparator8 = () => <View style={{ width: 8 }} />;
const HorizontalSeparator10 = () => <View style={{ width: 10 }} />;

interface HeroItem {
  id: string;
  title: string;
  thumbnailUrl: string;
  badge: string;
  subtitle?: string;
  actionText: string;
  onPress: () => void;
  onDetailPress?: () => void;
}

const HeroCarousel = memo(function HeroCarousel({
  items,
  isDark,
  screenWidth,
}: {
  items: HeroItem[];
  isDark: boolean;
  screenWidth: number;
}) {
  const isFocused = useIsFocused();
  const { t } = useLanguage();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAppActive, setIsAppActive] = useState(() => AppState.currentState === 'active');
  const flatListRef = useRef<any>(null);
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const heroData = useMemo(() => items.slice(0, HERO_ITEM_COUNT), [items]);
  const HERO_HEIGHT = useMemo(() => Math.min(Math.round(screenWidth * 0.58), 280), [screenWidth]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      setIsAppActive(nextState === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
    if (!isFocused || !isAppActive || heroData.length <= 1) return;

    autoScrollRef.current = setInterval(() => {
      setActiveIndex(prev => {
        const next = (prev + 1) % heroData.length;
        flatListRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 4500);

    return () => {
      if (autoScrollRef.current) {
        clearInterval(autoScrollRef.current);
        autoScrollRef.current = null;
      }
    };
  }, [heroData.length, isFocused, isAppActive]);

  useEffect(() => {
    setActiveIndex(0);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [items]);

  const renderItem = useCallback(
    ({ item }: { item: HeroItem }) => (
      <View style={[heroStyles.slide, { width: screenWidth, height: HERO_HEIGHT }]}>
        <ImageLoading
          resizeMode="cover"
          source={{ uri: item.thumbnailUrl }}
          fallbackSearchTitle={item.title}
          style={[heroStyles.image, { width: screenWidth, height: HERO_HEIGHT }]}>
          <View style={heroStyles.gradientTop} />
          <View style={heroStyles.gradientBottom} />

          <View style={heroStyles.overlayContent}>
            <View style={heroStyles.badgeRow}>
              <View style={heroStyles.typeBadge}>
                <Text style={heroStyles.typeBadgeText}>{item.badge}</Text>
              </View>
              {item.subtitle ? (
                <Text style={heroStyles.episodeText} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>

            <Text numberOfLines={2} style={heroStyles.title}>
              {item.title}
            </Text>

            <View style={heroStyles.actionsRow}>
              <TouchableOpacityReactNative
                activeOpacity={0.8}
                onPress={item.onPress}
                style={heroStyles.playButton}>
                <Icon name="play" size={13} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={heroStyles.playButtonText}>{item.actionText}</Text>
              </TouchableOpacityReactNative>

              {item.onDetailPress && (
                <TouchableOpacityReactNative
                  activeOpacity={0.8}
                  onPress={item.onDetailPress}
                  style={heroStyles.detailButton}>
                  <Text style={heroStyles.detailButtonText}>{t('player.detail')}</Text>
                </TouchableOpacityReactNative>
              )}
            </View>
          </View>
        </ImageLoading>
      </View>
    ),
    [screenWidth, HERO_HEIGHT, t],
  );

  if (heroData.length === 0) return null;

  return (
    <View style={[heroStyles.container, { height: HERO_HEIGHT }]}>
      <FlashList
        ref={flatListRef}
        data={heroData}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        horizontal
        pagingEnabled
        drawDistance={screenWidth}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
          setActiveIndex(idx);
        }}
      />

      <View style={heroStyles.dotsContainer}>
        {heroData.map((_, i) => (
          <View
            key={i}
            style={[
              heroStyles.dot,
              {
                backgroundColor:
                  i === activeIndex
                    ? '#3b82f6'
                    : isDark
                    ? 'rgba(255,255,255,0.3)'
                    : 'rgba(0,0,0,0.2)',
                width: i === activeIndex ? 16 : 5,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
});

const heroStyles = StyleSheet.create({
  container: { marginBottom: 8 },
  slide: { width: '100%' },
  image: { width: '100%' },
  gradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '25%',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  gradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '65%',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  overlayContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 22,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  typeBadge: { backgroundColor: '#3b82f6', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  episodeText: { color: '#e2e8f0', fontSize: 12, fontWeight: '500' },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 22,
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 6,
  },
  playButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  detailButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  detailButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    gap: 5,
  },
  dot: { height: 4, borderRadius: 2 },
});

const ContinueWatchingRow = memo(function ContinueWatchingRow({
  navigation,
  category,
  isDark,
}: {
  navigation: any;
  category: CategoryFilter;
  isDark: boolean;
}) {
  const { t } = useLanguage();

  const historyKeys = useModifiedKeyValueIfFocused(
    'historyKeyCollectionsOrder',
    state => {
      try {
        const parsed = JSON.parse(state);
        return Array.isArray(parsed) ? (parsed as HistoryItemKey[]) : [];
      } catch {
        return [] as HistoryItemKey[];
      }
    },
    [] as HistoryItemKey[],
  );

  const [historyItems, setHistoryItems] = useState<(HistoryJSON & { contentType: string })[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadItems = async () => {
      if (category === 'comics') {
        if (!cancelled) setHistoryItems([]);
        return;
      }

      const candidates: { key: HistoryItemKey; isMovie: boolean }[] = [];
      for (const key of historyKeys.slice(0, 20)) {
        const parts = key.split(':');
        const isComics = parts[parts.length - 2] === 'true';
        const isMovie = parts[parts.length - 1] === 'true';
        if (isComics) continue;
        if (category === 'film' && !isMovie) continue;
        if (category === 'anime' && isMovie) continue;
        candidates.push({ key, isMovie });
        if (candidates.length >= 12) break;
      }

      if (candidates.length === 0) {
        if (!cancelled) {
          setHistoryItems(prev => (prev.length === 0 ? prev : []));
        }
        return;
      }

      const rawList = await Promise.all(
        candidates.map(c => DatabaseManager.get(c.key).catch(() => null)),
      );
      if (cancelled) return;

      const items: (HistoryJSON & { contentType: string })[] = [];
      for (let i = 0; i < rawList.length; i++) {
        const raw = rawList[i];
        if (!raw) continue;
        try {
          const parsed: HistoryJSON = JSON.parse(raw);
          if (parsed.link?.includes('meionovel')) continue;
          if (parsed.title && parsed.link) {
            const contentType =
              candidates[i].isMovie || parsed.link.startsWith('film://') || parsed.isMovie
                ? 'movie'
                : 'anime';
            items.push({ ...parsed, contentType });
          }
          if (items.length >= 8) break;
        } catch {}
      }
      setHistoryItems(items);
    };
    loadItems();
    return () => {
      cancelled = true;
    };
  }, [historyKeys, category]);

  const renderCwItem = useCallback(
    ({ item }: ListRenderItemInfo<HistoryJSON & { contentType: string }>) => (
      <TouchableOpacityReactNative
        style={cwStyles.card}
        activeOpacity={0.8}
        onPress={() => {
          navigation.dispatch(
            StackActions.push('FromUrl', {
              title: item.title,
              link: item.link,
              type: item.contentType,
              historyData: item,
              thumbnailUrl: item.thumbnailUrl,
            }),
          );
        }}>
        <ImageLoading
          resizeMode="cover"
          source={{ uri: item.thumbnailUrl }}
          fallbackSearchTitle={item.contentType === 'anime' ? item.title : undefined}
          style={cwStyles.thumbnail}>
          <DarkOverlay transparent={0.35} />
          <View style={cwStyles.playIconCircle}>
            <Icon name="play" size={11} color="#ffffff" style={{ marginLeft: 2 }} />
          </View>
          {(item.lastDuration ?? 0) > 0 && (
            <View style={cwStyles.progressBarContainer}>
              <View
                style={[
                  cwStyles.progressBarFill,
                  { width: `${Math.min(100, ((item.lastDuration || 0) / 1440) * 100)}%` },
                ]}
              />
            </View>
          )}
        </ImageLoading>
        <Text
          numberOfLines={1}
          style={[cwStyles.title, { color: isDark ? '#f3f4f6' : '#1f2937' }]}>
          {item.title}
        </Text>
        {item.episode ? (
          <Text numberOfLines={1} style={cwStyles.subtitle}>
            {item.episode}
          </Text>
        ) : null}
      </TouchableOpacityReactNative>
    ),
    [isDark, navigation],
  );

  if (category === 'comics' || historyItems.length === 0) return null;

  return (
    <View style={sectionStyles.container}>
      <View style={sectionStyles.header}>
        <Text style={[sectionStyles.title, { color: isDark ? '#f3f4f6' : '#111827' }]}>
          {t('home.continueWatching')}
        </Text>
      </View>
      <FlashList
        data={historyItems}
        horizontal
        drawDistance={260}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={cwStyles.listPadding}
        ItemSeparatorComponent={HorizontalSeparator10}
        renderItem={renderCwItem}
        keyExtractor={(item, i) => item.link || `${item.title}-${i}`}
      />
    </View>
  );
});

const cwStyles = StyleSheet.create({
  listPadding: { paddingHorizontal: 16 },
  card: { width: 144 },
  thumbnail: {
    width: 144,
    height: 84,
    borderRadius: 8,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: 'hidden',
  },
  progressBarFill: { height: 3, backgroundColor: '#3b82f6' },
  title: { fontSize: 12, fontWeight: '600', marginTop: 5 },
  subtitle: { fontSize: 11, color: '#888888', marginTop: 1 },
});

const sectionStyles = StyleSheet.create({
  container: { paddingVertical: 6, marginBottom: 6 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  seeMoreBtn: { flexDirection: 'row', alignItems: 'center' },
  seeMoreText: { fontSize: 12, fontWeight: '600', color: '#3b82f6' },
  listPadding: { paddingHorizontal: 16 },
});

const filmCardStyles = StyleSheet.create({
  container: { width: 116 },
  poster: { width: 116, height: 164, borderRadius: 8 },
  title: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 4, marginTop: 2, alignItems: 'center' },
  badge: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  badgeText: { color: '#ffffff', fontSize: 9, fontWeight: '700' },
  imdb: { fontSize: 10, color: '#f59e0b', fontWeight: '600' },
});

const FilmCard = memo(function FilmCard({
  item,
  navigation,
  isDark,
}: {
  item: FilmSearchItem;
  navigation: any;
  isDark: boolean;
}) {
  const onPress = useCallback(() => {
    navigation.dispatch(StackActions.push('FilmDetail', { data: item }));
  }, [item, navigation]);

  return (
    <TouchableOpacity style={filmCardStyles.container} onPress={onPress}>
      <ImageLoading
        resizeMode="cover"
        source={{ uri: item.cover || item.poster }}
        style={filmCardStyles.poster}
      />
      <Text numberOfLines={2} style={[filmCardStyles.title, { color: isDark ? '#f3f4f6' : '#1f2937' }]}>
        {item.title}
      </Text>
      <View style={filmCardStyles.metaRow}>
        <View
          style={[
            filmCardStyles.badge,
            { backgroundColor: item.subjectType === 2 ? '#f59e0b' : '#3b82f6' },
          ]}>
          <Text style={filmCardStyles.badgeText}>{item.subjectType === 2 ? 'TV' : 'Movie'}</Text>
        </View>
        {item.imdbRatingValue ? <Text style={filmCardStyles.imdb}>{item.imdbRatingValue}</Text> : null}
      </View>
    </TouchableOpacity>
  );
});

const ScheduleCard = memo(function ScheduleCard({
  item,
  navigation,
  isDark,
}: {
  item: AnimeSchedule;
  navigation: any;
  isDark: boolean;
}) {
  const { t } = useLanguage();
  const onPress = useCallback(() => {
    navigation.dispatch(
      StackActions.push('FromUrl', {
        title: item.title,
        link: item.link,
        thumbnailUrl: item.thumbnailUrl,
        type: 'anime',
      }),
    );
  }, [item.link, item.thumbnailUrl, item.title, navigation]);

  return (
    <TouchableOpacityReactNative
      activeOpacity={0.8}
      style={scheduleCardStyles.container}
      onPress={onPress}>
      <View
        style={[
          scheduleCardStyles.posterWrap,
          { backgroundColor: isDark ? '#18181b' : '#e2e8f0' },
        ]}>
        <ImageLoading
          resizeMode="cover"
          source={{ uri: item.thumbnailUrl || '' }}
          fallbackSearchTitle={item.title}
          style={scheduleCardStyles.poster}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.78)']}
          style={scheduleCardStyles.gradientOverlay}
          pointerEvents="none"
        />
        <View style={scheduleCardStyles.badgeContainer} pointerEvents="none">
          <View style={scheduleCardStyles.badge}>
            <Text style={scheduleCardStyles.badgeText} numberOfLines={1}>
              {item.estimatedEpisode || t('common.today')}
            </Text>
          </View>
          {item.estimatedTime ? (
            <View style={scheduleCardStyles.timeBadge}>
              <Text style={scheduleCardStyles.timeBadgeText}>{item.estimatedTime}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text
        numberOfLines={2}
        style={[scheduleCardStyles.title, { color: isDark ? '#e0e0e0' : '#222222' }]}>
        {item.title}
      </Text>
    </TouchableOpacityReactNative>
  );
});

const scheduleCardStyles = StyleSheet.create({
  container: { width: 116 },
  posterWrap: {
    width: 116,
    height: 174,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  poster: { width: '100%', height: '100%' },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '45%',
  },
  badgeContainer: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
  },
  badge: {
    backgroundColor: 'rgba(59, 130, 246, 0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 1,
  },
  badgeText: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  timeBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  timeBadgeText: { color: '#f8fafc', fontSize: 9, fontWeight: '700' },
  title: { fontSize: 12, fontWeight: '600', lineHeight: 16, marginTop: 6, paddingHorizontal: 2 },
});

function SectionRowInner<T>({
  title,
  data,
  renderItem,
  navigation,
  isDark,
  seeMoreType,
  onCustomSeeMorePress,
  customSeeMoreLabel,
}: {
  title: string;
  data: T[] | null | undefined;
  renderItem: (info: ListRenderItemInfo<T>) => React.ReactElement;
  navigation: any;
  isDark: boolean;
  seeMoreType?: string;
  onCustomSeeMorePress?: () => void;
  customSeeMoreLabel?: string;
}) {
  const { t } = useLanguage();
  const slicedData = useMemo(() => data?.slice(0, 20), [data]);

  const keyExtractor = useCallback(
    (item: any, i: number) =>
      `${title}-${item?.streamingLink || item?.detailUrl || item?.link || item?.id || item?.title || i}`,
    [title],
  );

  return (
    <View style={sectionStyles.container}>
      <View style={sectionStyles.header}>
        <Text style={[sectionStyles.title, { color: isDark ? '#f3f4f6' : '#111827' }]}>{title}</Text>
        {onCustomSeeMorePress ? (
          <TouchableOpacity style={sectionStyles.seeMoreBtn} onPress={onCustomSeeMorePress}>
            <Text style={sectionStyles.seeMoreText}>{customSeeMoreLabel || t('common.seeMore')}</Text>
            <MaterialIcon name="chevron-right" size={16} color="#3b82f6" />
          </TouchableOpacity>
        ) : seeMoreType ? (
          <TouchableOpacity
            style={sectionStyles.seeMoreBtn}
            disabled={!data || data.length === 0}
            onPress={() => navigation.dispatch(StackActions.push('SeeMore', { type: seeMoreType }))}>
            <Text style={sectionStyles.seeMoreText}>{t('common.seeMore')}</Text>
            <MaterialIcon name="chevron-right" size={16} color="#3b82f6" />
          </TouchableOpacity>
        ) : null}
      </View>
      {!data ? (
        <ShowSkeletonLoading />
      ) : slicedData && slicedData.length > 0 ? (
          <FlashList
          renderScrollComponent={RenderScrollComponent}
          contentContainerStyle={sectionStyles.listPadding}
          horizontal
          drawDistance={300}
          data={slicedData}
          extraData={isDark}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          showsHorizontalScrollIndicator={false}
          ItemSeparatorComponent={HorizontalSeparator8}
        />
      ) : (
        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
          <Text style={{ color: isDark ? '#6b7280' : '#9ca3af', fontSize: 12, fontStyle: 'italic' }}>
            {t('home.emptyOrOffline')}
          </Text>
        </View>
      )}
    </View>
  );
}

const SectionRow = memo(SectionRowInner) as typeof SectionRowInner;

const ActiveDownloadBanner = memo(function ActiveDownloadBanner({
  navigation,
  isDark,
}: {
  navigation: any;
  isDark: boolean;
}) {
  const { t } = useLanguage();
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownloadItem[]>([]);

  useEffect(() => {
    return offlineDownloadManager.subscribeProgress(activeMap => {
      setActiveDownloads(Array.from(activeMap.values()));
    });
  }, []);

  if (activeDownloads.length === 0) return null;

  const downloadingItem = activeDownloads.find(d => d.status === 'downloading');
  const networkPausedCount = activeDownloads.filter(
    d => d.status === 'paused' && d.pauseReason === 'network',
  ).length;
  const isAllPaused = !downloadingItem;
  const primaryItem = downloadingItem || activeDownloads[0];

  const bannerText = downloadingItem
    ? t('home.bannerDownloading', {
        count: activeDownloads.length,
        percent: downloadingItem.progressPercent,
      })
    : networkPausedCount > 0
      ? t('home.bannerNetworkPaused', { count: networkPausedCount })
      : t('home.bannerPaused', { count: activeDownloads.length });

  return (
    <TouchableOpacityReactNative
      activeOpacity={0.8}
      onPress={() => navigation.navigate('MyListsPage', { initialTab: 'downloads' })}
      style={[
        styles.activeDlStrip,
        {
          backgroundColor: isAllPaused
            ? isDark
              ? '#241e12'
              : '#fffbeb'
            : isDark
              ? '#121D33'
              : '#EFF6FF',
          borderColor: isAllPaused
            ? isDark
              ? '#b45309'
              : '#fcd34d'
            : isDark
              ? '#1E3A8A'
              : '#BFDBFE',
        },
      ]}>
      <View style={styles.activeDlStripTop}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <MaterialIcon
            name={isAllPaused ? 'pause-circle-outline' : 'download'}
            size={16}
            color={isAllPaused ? '#f59e0b' : '#3B82F6'}
          />
          <Text
            style={[
              styles.activeDlStripText,
              {
                color: isAllPaused
                  ? isDark
                    ? '#fcd34d'
                    : '#b45309'
                  : isDark
                    ? '#93C5FD'
                    : '#1E40AF',
              },
            ]}
            numberOfLines={1}>
            {bannerText}
          </Text>
        </View>
        <Icon
          name="chevron-right"
          size={11}
          color={isAllPaused ? '#f59e0b' : '#3B82F6'}
        />
      </View>
      <View
        style={[
          styles.activeDlTrack,
          {
            backgroundColor: isAllPaused
              ? 'rgba(245, 158, 11, 0.25)'
              : isDark
                ? 'rgba(59, 130, 246, 0.25)'
                : '#DBEAFE',
          },
        ]}>
        <View
          style={[
            styles.activeDlFill,
            {
              width: `${Math.max(4, primaryItem.progressPercent)}%`,
              backgroundColor: isAllPaused ? '#f59e0b' : '#3B82F6',
            },
          ]}
        />
      </View>
    </TouchableOpacityReactNative>
  );
});

function HomePage({ navigation }: { navigation: any }) {
  const isDark = useColorScheme() === 'dark';
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = useMemo(
    () => Math.max((windowWidth - 48) / 3, MIN_IMAGE_WIDTH),
    [windowWidth],
  );
  const { t } = useLanguage();

  const { paramsState: animeData, setParamsState: setAnimeData } = useContext(EpisodeBaruHomeContext);
  const { paramsState: comicsData, setParamsState: setComicsData } = useContext(ComicsListContext);

  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [refresh, setRefresh] = useState(false);
  const [filmData, setFilmData] = useState<FilmSearchItem[] | null>(null);
  const [offlineCount, setOfflineCount] = useState(
    () => offlineDownloadManager.getOfflineAnimeList().length,
  );

  const [popularComics, setPopularComics] = useState<LatestComicsRelease[] | null>(null);
  const [latestFilms, setLatestFilms] = useState<FilmSearchItem[] | null>(null);
  const [animeMovies, setAnimeMovies] = useState<NewAnimeList[] | null>(null);
  const [manhwaList, setManhwaList] = useState<LatestComicsRelease[] | null>(null);
  const [scheduleData, setScheduleData] = useState<Record<string, AnimeSchedule[]> | null>(null);

  const [joinDialogVisible, setJoinDialogVisible] = useState(false);
  const [roomIdInput, setRoomIdInput] = useState('');

  const lastSourceVersionRef = useRef(getSourceVersion());

  useEffect(() => {
    return offlineDownloadManager.subscribeList(list => {
      setOfflineCount(list.length);
    });
  }, []);

  // Automatically refresh anime & comic feeds whenever active source changes in ExtensionManager
  useFocusEffect(
    useCallback(() => {
      const currentVersion = getSourceVersion();
      if (currentVersion !== lastSourceVersionRef.current) {
        lastSourceVersionRef.current = currentVersion;
        setAnimeMovies(null);
        setScheduleData(null);
        setComicsData?.(undefined);
        setPopularComics(null);
        setManhwaList(null);
        setRefresh(true);
        AnimeAPI.home()
          .then(data => {
            if (data) setAnimeData?.(data);
          })
          .catch(() => {})
          .finally(() => setRefresh(false));
      }
    }, [setAnimeData, setComicsData]),
  );

  useEffect(() => {
    if (filmData !== null) return;
    const controller = new AbortController();
    getTrending(0, controller.signal)
      .then(res => setFilmData(res))
      .catch(() => setFilmData([]));
    return () => controller.abort();
  }, [filmData]);

  useEffect(() => {
    if (comicsData !== undefined) return;
    const controller = new AbortController();
    getLatestComicsReleases(1, controller.signal)
      .then(res => setComicsData?.(res))
      .catch(() => setComicsData?.([]));
    return () => controller.abort();
  }, [comicsData, setComicsData]);

  useEffect(() => {
    if ((selectedCategory === 'all' || selectedCategory === 'comics') && popularComics === null) {
      const controller = new AbortController();
      getPopularComicsReleases(1, controller.signal)
        .then(res => setPopularComics(res || []))
        .catch(() => setPopularComics([]));
      return () => controller.abort();
    }
  }, [selectedCategory, popularComics]);

  useEffect(() => {
    if (selectedCategory === 'comics' && manhwaList === null) {
      const controller = new AbortController();
      getManhwaWebtoonReleases(1, controller.signal)
        .then(res => setManhwaList(res || []))
        .catch(() => setManhwaList([]));
      return () => controller.abort();
    }
  }, [selectedCategory, manhwaList]);

  useEffect(() => {
    if ((selectedCategory === 'all' || selectedCategory === 'film') && latestFilms === null) {
      const controller = new AbortController();
      getTrending(1, controller.signal)
        .then(res => setLatestFilms(res || []))
        .catch(() => setLatestFilms([]));
      return () => controller.abort();
    }
  }, [selectedCategory, latestFilms]);

  useEffect(() => {
    if (selectedCategory === 'anime' && animeMovies === null) {
      const controller = new AbortController();
      AnimeAPI.searchMovies(1, controller.signal)
        .then(res => {
          const list: NewAnimeList[] = (res.result || []).map(r => ({
            title: r.title,
            thumbnailUrl: r.thumbnailUrl,
            episode: 'Movie',
            streamingLink: r.animeUrl,
            releaseDate: '',
            releaseDay: '',
          }));
          setAnimeMovies(list);
        })
        .catch(() => setAnimeMovies([]));
      return () => controller.abort();
    }
  }, [selectedCategory, animeMovies]);

  useEffect(() => {
    if (selectedCategory === 'anime' && scheduleData === null) {
      const controller = new AbortController();
      AnimeAPI.jadwalAnime(controller.signal)
        .then(res => setScheduleData(res || {}))
        .catch(() => setScheduleData({}));
      return () => controller.abort();
    }
  }, [selectedCategory, scheduleData]);

  const todayIndo = useMemo(() => {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return days[new Date().getDay()];
  }, []);

  const todayDisplay = t(`schedule.dayFull.${todayIndo}` as TranslationKey);

  const todayAnime = useMemo(() => {
    if (scheduleData && scheduleData[todayIndo]?.length) {
      return scheduleData[todayIndo];
    }
    if (!animeData?.jadwalAnime) return [];
    return animeData.jadwalAnime[todayIndo] || [];
  }, [scheduleData, animeData?.jadwalAnime, todayIndo]);

  const heroItems: HeroItem[] = useMemo(() => {
    if (selectedCategory === 'comics') {
      return (comicsData || []).slice(0, 5).map((item, idx) => ({
        id: `hero-comic-${idx}`,
        title: item.title,
        thumbnailUrl: item.thumbnailUrl,
        badge: t('home.heroBadgeComic'),
        subtitle: item.latestChapter || t('home.heroBadgeLatestEp'),
        actionText: t('home.actionRead'),
        onPress: () => {
          navigation.dispatch(
            StackActions.push('FromUrl', {
              title: item.title,
              link: item.detailUrl,
              type: 'comics',
            }),
          );
        },
        onDetailPress: () => {
          navigation.dispatch(
            StackActions.push('FromUrl', {
              title: item.title,
              link: item.detailUrl,
              type: 'comics',
              forceDetail: true,
            }),
          );
        },
      }));
    }

    if (selectedCategory === 'film') {
      return (filmData || []).slice(0, 5).map((item, idx) => ({
        id: `hero-film-${idx}`,
        title: item.title,
        thumbnailUrl: item.cover || item.poster,
        badge: item.subjectType === 2 ? t('home.heroBadgeSeries') : t('home.heroBadgeMovie'),
        subtitle: item.imdbRatingValue ? `Rating: ${item.imdbRatingValue}` : item.year || '',
        actionText: t('home.actionWatch'),
        onPress: () => {
          navigation.dispatch(StackActions.push('FilmDetail', { data: item }));
        },
        onDetailPress: () => {
          navigation.dispatch(StackActions.push('FilmDetail', { data: item }));
        },
      }));
    }

    return (animeData?.newAnime || []).slice(0, 5).map((item, idx) => ({
      id: `hero-anime-${idx}`,
      title: item.title,
      thumbnailUrl: item.thumbnailUrl,
      badge: t('home.heroBadgeAnime'),
      subtitle: item.episode,
      actionText: t('home.actionWatch'),
      onPress: () => {
        navigation.dispatch(
          StackActions.push('FromUrl', {
            title: item.title,
            link: item.streamingLink,
            type: 'anime',
          }),
        );
      },
      onDetailPress: () => {
        navigation.dispatch(
          StackActions.push('FromUrl', {
            title: item.title,
            link: item.streamingLink,
            type: 'anime',
            forceDetail: true,
          }),
        );
      },
    }));
  }, [selectedCategory, comicsData, filmData, animeData, navigation, t]);

  const onRefresh = useCallback(() => {
    setRefresh(true);
    setAnimeData?.(val => (val ? { ...val, newAnime: [] } : { newAnime: [], jadwalAnime: {} }));
    setComicsData?.(undefined);
    setFilmData(null);
    setPopularComics(null);
    setLatestFilms(null);
    setAnimeMovies(null);
    setScheduleData(null);
    setManhwaList(null);

    Promise.all([
      fetchLatestAnimeIndoDomain().catch(() => {}).then(() => AnimeAPI.home()).then(data => setAnimeData?.(data)).catch(() => {}),
      getLatestComicsReleases(1).then(z => setComicsData?.(z)).catch(() => setComicsData?.([])),
      getTrending(0).then(z => setFilmData(z)).catch(() => setFilmData([])),
    ]).finally(() => {
      setRefresh(false);
    });
  }, [setAnimeData, setComicsData]);

  const renderAnimeItem = useCallback(
    ({ item }: ListRenderItemInfo<NewAnimeList>) => (
      <ListAnimeComponent
        newAnimeData={item}
        type="anime"
        navigationProp={navigation}
        isDark={isDark}
        cardWidth={cardWidth}
      />
    ),
    [cardWidth, isDark, navigation],
  );

  const renderComicItem = useCallback(
    ({ item }: ListRenderItemInfo<LatestComicsRelease>) => (
      <ListAnimeComponent
        newAnimeData={item}
        type="comics"
        navigationProp={navigation}
        isDark={isDark}
        cardWidth={cardWidth}
      />
    ),
    [cardWidth, isDark, navigation],
  );

  const renderFilmItem = useCallback(
    ({ item }: ListRenderItemInfo<FilmSearchItem>) => (
      <FilmCard item={item} navigation={navigation} isDark={isDark} />
    ),
    [isDark, navigation],
  );

  const renderScheduleItem = useCallback(
    ({ item }: ListRenderItemInfo<AnimeSchedule>) => (
      <ScheduleCard item={item} navigation={navigation} isDark={isDark} />
    ),
    [isDark, navigation],
  );

  const openSchedule = useCallback(() => {
    navigation.dispatch(StackActions.push('AnimeSchedule'));
  }, [navigation]);

  const isAppearingOffline =
    (animeData?.newAnime?.length ?? 0) === 0 && filmData !== null && filmData.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0a0a0a' : '#f8fafc' }}>
      <Announcment />

      <ActiveDownloadBanner navigation={navigation} isDark={isDark} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refresh}
            onRefresh={onRefresh}
            progressBackgroundColor={isDark ? '#121212' : '#ffffff'}
            colors={['#3b82f6']}
          />
        }>
        {heroItems.length > 0 && (
          <HeroCarousel items={heroItems} isDark={isDark} screenWidth={windowWidth} />
        )}

        <View style={styles.categoryPillsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryPillsContent}>
            {CATEGORY_TABS.map(tab => {
              const isActive = selectedCategory === tab.key;
              return (
                <TouchableOpacityReactNative
                  key={tab.key}
                  onPress={() => setSelectedCategory(tab.key)}
                  activeOpacity={0.7}
                  style={[
                    styles.pillButton,
                    {
                      backgroundColor: isActive
                        ? '#3b82f6'
                        : isDark
                        ? '#171717'
                        : '#f1f5f9',
                      borderColor: isActive ? '#2563eb' : isDark ? '#262626' : '#e2e8f0',
                    },
                  ]}>
                  <Text
                    style={[
                      styles.pillText,
                      {
                        color: isActive ? '#ffffff' : isDark ? '#9ca3af' : '#475569',
                        fontWeight: isActive ? '700' : '500',
                      },
                    ]}>
                    {t(tab.labelKey)}
                  </Text>
                </TouchableOpacityReactNative>
              );
            })}
          </ScrollView>
        </View>

        {isAppearingOffline && (
          <View style={styles.offlineCardWrap}>
            <View
              style={[
                styles.offlineCard,
                {
                  backgroundColor: isDark ? '#141417' : '#ffffff',
                  borderColor: isDark ? '#27272a' : '#e2e8f0',
                },
              ]}>
              <View style={styles.offlineHeader}>
                <Icon name="wifi" size={16} color="#3b82f6" />
                <Text style={[styles.offlineTitle, { color: isDark ? '#f4f4f6' : '#0f172a' }]}>
                  {t('home.offlineBannerTitle')}
                </Text>
              </View>
              <Text style={[styles.offlineDesc, { color: isDark ? '#9ca3af' : '#64748b' }]}>
                {t('home.offlineBannerDesc')}
              </Text>
              <View style={styles.offlineActions}>
                {offlineCount > 0 ? (
                  <TouchableOpacityReactNative
                    activeOpacity={0.8}
                    style={styles.offlinePrimaryBtn}
                    onPress={() => navigation.navigate('MyListsPage', { initialTab: 'downloads' })}>
                    <MaterialIcon name="download-done" size={16} color="#ffffff" />
                    <Text style={styles.offlinePrimaryText}>
                      {t('home.openOfflineVideos', { count: offlineCount })}
                    </Text>
                  </TouchableOpacityReactNative>
                ) : null}
                <TouchableOpacityReactNative
                  activeOpacity={0.8}
                  style={[
                    styles.offlineSecondaryBtn,
                    { borderColor: isDark ? '#3f3f46' : '#cbd5e1' },
                  ]}
                  onPress={onRefresh}>
                  <MaterialIcon
                    name="refresh"
                    size={16}
                    color={isDark ? '#e4e4e7' : '#334155'}
                  />
                  <Text
                    style={[
                      styles.offlineSecondaryText,
                      { color: isDark ? '#e4e4e7' : '#334155' },
                    ]}>
                    {t('player.retry')}
                  </Text>
                </TouchableOpacityReactNative>
              </View>
            </View>
          </View>
        )}

        {selectedCategory !== 'comics' && (
          <View style={{ paddingHorizontal: 16, marginBottom: 8, flexDirection: 'row', gap: 8 }}>
            <TouchableOpacityReactNative
              onPress={() => navigation.dispatch(StackActions.push('AnimeSchedule'))}
              activeOpacity={0.8}
              style={[
                styles.nobarBar,
                {
                  flex: 1,
                  backgroundColor: isDark ? '#141417' : '#ffffff',
                  borderColor: isDark ? '#27272a' : '#e2e8f0',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                },
              ]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Icon name="calendar" size={13} color="#3b82f6" />
                <Text
                  style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#f4f4f6' : '#0f172a' }}>
                  {t('home.animeSchedule')}
                </Text>
              </View>
              <MaterialIcon name="chevron-right" size={16} color="#3b82f6" />
            </TouchableOpacityReactNative>

            <TouchableOpacityReactNative
              onPress={() => setJoinDialogVisible(true)}
              activeOpacity={0.8}
              style={[
                styles.nobarBar,
                {
                  backgroundColor: isDark ? '#141417' : '#ffffff',
                  borderColor: isDark ? '#27272a' : '#e2e8f0',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                },
              ]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="users" size={12} color="#3b82f6" />
                <Text
                  style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#f4f4f6' : '#0f172a' }}>
                  {t('player.nobar')}
                </Text>
              </View>
            </TouchableOpacityReactNative>
          </View>
        )}

        <ContinueWatchingRow navigation={navigation} category={selectedCategory} isDark={isDark} />

        {selectedCategory === 'all' && (
          <>
            <SectionRow
              title={t('home.sectionAnimeNew')}
              data={animeData?.newAnime}
              renderItem={renderAnimeItem}
              navigation={navigation}
              isDark={isDark}
              seeMoreType="AnimeList"
            />
            <SectionRow
              title={t('home.sectionFilmTrending')}
              data={filmData}
              renderItem={renderFilmItem}
              navigation={navigation}
              isDark={isDark}
              seeMoreType="FilmList"
            />
            <SectionRow
              title={t('home.sectionComicsNew')}
              data={comicsData}
              renderItem={renderComicItem}
              navigation={navigation}
              isDark={isDark}
              seeMoreType="ComicsList"
            />
            <SectionRow
              title={t('home.sectionFilmCinema')}
              data={latestFilms}
              renderItem={renderFilmItem}
              navigation={navigation}
              isDark={isDark}
              seeMoreType="FilmList"
            />
            <SectionRow
              title={t('home.sectionComicsPopular')}
              data={popularComics}
              renderItem={renderComicItem}
              navigation={navigation}
              isDark={isDark}
              seeMoreType="ComicsPopular"
            />
          </>
        )}

        {selectedCategory === 'anime' && (
          <>
            <SectionRow
              title={t('home.sectionLatestEp')}
              data={animeData?.newAnime}
              renderItem={renderAnimeItem}
              navigation={navigation}
              isDark={isDark}
              seeMoreType="AnimeList"
            />
            {todayAnime.length > 0 && (
              <SectionRow
                title={t('home.sectionTodayRelease', { day: todayDisplay })}
                data={todayAnime}
                renderItem={renderScheduleItem}
                navigation={navigation}
                isDark={isDark}
                onCustomSeeMorePress={openSchedule}
                customSeeMoreLabel={t('home.fullSchedule')}
              />
            )}
            <SectionRow
              title={t('home.sectionAnimeMovies')}
              data={animeMovies}
              renderItem={renderAnimeItem}
              navigation={navigation}
              isDark={isDark}
              seeMoreType="AnimeList"
            />
          </>
        )}

        {selectedCategory === 'film' && (
          <>
            <SectionRow
              title={t('home.sectionFilmTrending')}
              data={filmData}
              renderItem={renderFilmItem}
              navigation={navigation}
              isDark={isDark}
              seeMoreType="FilmList"
            />
            <SectionRow
              title={t('home.sectionFilmCinema')}
              data={latestFilms}
              renderItem={renderFilmItem}
              navigation={navigation}
              isDark={isDark}
              seeMoreType="FilmList"
            />
          </>
        )}

        {selectedCategory === 'comics' && (
          <>
            <SectionRow
              title={t('home.sectionLatestChapters')}
              data={comicsData}
              renderItem={renderComicItem}
              navigation={navigation}
              isDark={isDark}
              seeMoreType="ComicsList"
            />
            <SectionRow
              title={t('home.sectionComicsPopular')}
              data={popularComics}
              renderItem={renderComicItem}
              navigation={navigation}
              isDark={isDark}
              seeMoreType="ComicsPopular"
            />
            <SectionRow
              title={t('home.sectionManhwa')}
              data={manhwaList}
              renderItem={renderComicItem}
              navigation={navigation}
              isDark={isDark}
              seeMoreType="ComicsManhwa"
            />
          </>
        )}

        <View style={{ height: 28 }} />
      </ScrollView>

      {joinDialogVisible && (
        <Portal>
          <Dialog
            visible
            onDismiss={() => setJoinDialogVisible(false)}
            style={{ backgroundColor: isDark ? '#1a1a1a' : '#ffffff', borderRadius: 12 }}>
            <Dialog.Title style={{ color: isDark ? '#ffffff' : '#111827', fontSize: 16 }}>
              {t('home.joinRoomDialogTitle')}
            </Dialog.Title>
            <Dialog.Content>
              <Text style={{ color: isDark ? '#9ca3af' : '#64748b', fontSize: 13, marginBottom: 12 }}>
                {t('home.joinRoomDialogDesc')}
              </Text>
              <TextInput
                label={t('home.joinRoomIdLabel')}
                value={roomIdInput}
                onChangeText={setRoomIdInput}
                mode="outlined"
                autoCapitalize="none"
                textColor={isDark ? '#ffffff' : '#000000'}
                style={{ backgroundColor: isDark ? '#121212' : '#ffffff' }}
                activeOutlineColor="#3b82f6"
              />
            </Dialog.Content>
            <Dialog.Actions>
              <Button
                onPress={() => setJoinDialogVisible(false)}
                textColor={isDark ? '#9ca3af' : '#64748b'}>
                {t('common.cancel')}
              </Button>
              <Button
                onPress={() => {
                  const raw = roomIdInput.trim();
                  if (!raw) return;
                  const queryMatch = raw.match(/[?&](?:room|roomId)=([A-Za-z0-9_-]+)/i);
                  const pathMatch = raw.match(/(?:naoflix|aniflix):\/\/nobar\/([A-Za-z0-9_-]+)/i);
                  const cleanRoomId = (
                    queryMatch?.[1] ||
                    pathMatch?.[1] ||
                    raw.replace(/[^A-Za-z0-9_-]/g, '')
                  ).toUpperCase();
                  if (cleanRoomId) {
                    setJoinDialogVisible(false);
                    setRoomIdInput('');
                    navigation.dispatch(StackActions.push('JoinNobar', { roomId: cleanRoomId }));
                  }
                }}
                textColor="#3b82f6">
                {t('home.joinBtn')}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  categoryPillsContainer: { marginVertical: 4 },
  categoryPillsContent: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  pillButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  pillText: { fontSize: 13 },
  nobarBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  offlineCardWrap: { paddingHorizontal: 16, marginTop: 4, marginBottom: 8 },
  offlineCard: { borderRadius: 10, borderWidth: 1, padding: 14 },
  offlineHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  offlineTitle: { fontSize: 14, fontWeight: '700' },
  offlineDesc: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  offlineActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  offlinePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  offlinePrimaryText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  offlineSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  offlineSecondaryText: { fontSize: 12, fontWeight: '600' },
  activeDlStrip: {
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  activeDlStripTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  activeDlStripText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  activeDlTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 6,
  },
  activeDlFill: {
    height: '100%',
    borderRadius: 2,
  },
});

export default memo(HomePage);
