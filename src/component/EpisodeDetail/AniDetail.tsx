import Icon from '@react-native-vector-icons/fontawesome';
import MaterialIcon from '@react-native-vector-icons/material-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Button, Searchbar, useTheme } from 'react-native-paper';
import Reanimated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from 'react-native-reanimated';
import useGlobalStyles from '../../assets/style';
import { RootStackNavigator } from '../../types/navigation';
import watchLaterJSON from '../../types/watchLaterJSON';
import controlWatchLater from '../../utils/watchLaterControl';

import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../misc/LanguageContext';
import { AniDetailEpsList } from '../../types/anime';
import { HistoryItemKey } from '../../types/databaseTarget';
import { HistoryJSON } from '../../types/historyJSON';
import { DatabaseManager, useModifiedKeyValueIfFocused } from '../../utils/DatabaseManager';
import { replaceLast } from '../../utils/replaceLast';
import ImageLoading from '../misc/ImageLoading';
import EpisodeBox from '../misc/EpisodeBox';
import cleanSynopsis from '../../utils/cleanSynopsis';
import offlineDownloadManager from '../../utils/offlineDownloadManager';
import { ActiveDownloadItem } from '../../types/offlineAnime';
import { normalizeMediaKey } from '../../types/forum';
import MediaForumSection from '../Forum/MediaForumSection';

const AnimatedFlatList = Reanimated.createAnimatedComponent(FlatList as typeof FlatList<AniDetailEpsList>);

const EpisodeItem = memo(({ ep, epNum, isLastEp, onPress, width }: {
  ep: AniDetailEpsList; epNum: number; isLastEp: boolean;
  onPress: (ep: AniDetailEpsList, epNum: number) => void; width: number;
}) => {
  const handlePress = useCallback(() => onPress(ep, epNum), [onPress, ep, epNum]);
  return (
    <EpisodeBox
      number={epNum}
      isActive={false}
      isLastWatched={isLastEp}
      onPress={handlePress}
      width={width}
    />
  );
});

type Props = NativeStackScreenProps<RootStackNavigator, 'AnimeDetail'>;

const IMG_HEADER_HEIGHT = 220;

function AniDetail(props: Props) {
  const styles = useStyles();
  const globalStyles = useGlobalStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useLanguage();

  const data = props.route.params.data;

  const watchLaterListsJson = useModifiedKeyValueIfFocused(
    'watchLater',
    state => {
      try {
        const parsed = JSON.parse(state);
        return Array.isArray(parsed) ? (parsed as watchLaterJSON[]) : [];
      } catch {
        return [];
      }
    },
    [],
  );
  const isInList = useMemo(
    () =>
      (watchLaterListsJson || []).some(
        item =>
          item.title === data.title.replace(/Subtitle Indonesia|Sub Indo/, '') &&
          !item.isComics &&
          !item.isMovie,
      ),
    [data.title, watchLaterListsJson],
  );

  const historyListsJson = useModifiedKeyValueIfFocused(
    'historyKeyCollectionsOrder',
    state => {
      try {
        const parsed = JSON.parse(state);
        return Array.isArray(parsed) ? (parsed as HistoryItemKey[]) : [];
      } catch {
        return [];
      }
    },
    [],
  );
  let historyTitle = data.title
    .replace(/Subtitle Indonesia|Sub Indo/, '')
    .split('(Episode')[0]
    .trim();
  if (historyTitle.endsWith('BD') && !data.episodeList.at(-1)?.title.endsWith('BD')) {
    historyTitle = replaceLast(historyTitle, 'BD', '').trim();
  }
  const lastWatched = useMemo(() => {
    const list = historyListsJson || [];
    const exactKey = list.find(z => z === `historyItem:${historyTitle}:false:false`);
    if (exactKey) {
      try {
        const parsed = JSON.parse(DatabaseManager.getSync(exactKey) || 'null') as HistoryJSON | null;
        if (parsed) return parsed;
      } catch {}
    }
    const targetLink = (props.route.params.link || '').replace(/\/$/, '').toLowerCase();
    if (targetLink) {
      for (const k of list) {
        if (!k.endsWith(':false:false')) continue;
        try {
          const parsed = JSON.parse(DatabaseManager.getSync(k) || 'null') as HistoryJSON | null;
          const savedSeriesLink = ((parsed as any)?.seriesLink || '').replace(/\/$/, '').toLowerCase();
          if (parsed && savedSeriesLink && savedSeriesLink === targetLink) {
            return parsed;
          }
        } catch {}
      }
    }
    return undefined;
  }, [historyListsJson, historyTitle, props.route.params.link]);

  const scrollRef = useAnimatedRef<FlatList<AniDetailEpsList>>();
  const scrollOffset = useScrollOffset(scrollRef as any);
  const headerImageStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scrollOffset.value,
            [0, IMG_HEADER_HEIGHT * 2],
            [0, IMG_HEADER_HEIGHT],
            'clamp',
          ),
        },
      ],
      opacity: interpolate(scrollOffset.value, [0, IMG_HEADER_HEIGHT], [1, 0.2], 'clamp'),
    };
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [showFullSynopsis, setShowFullSynopsis] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownloadItem[]>([]);
  const { width: screenWidth } = useWindowDimensions();

  useEffect(() => {
    return offlineDownloadManager.subscribeProgress(activeMap => {
      setActiveDownloads(Array.from(activeMap.values()));
    });
  }, []);

  // Responsive column calculation for phones, foldables, and tablets
  const cols = screenWidth < 380 ? 5 : screenWidth < 520 ? 6 : screenWidth < 768 ? 7 : 9;
  const gap = 8;
  const horizontalPadding = 32;
  const boxWidth = useMemo(
    () => Math.floor((screenWidth - horizontalPadding - (cols - 1) * gap) / cols),
    [screenWidth, cols],
  );

  const episodeNumbers = useMemo(() => {
    return data.episodeList.map((eps, idx) => {
      const epMatch = eps.title.match(/[Ee]pisode\s*(\d+)/);
      if (epMatch) return parseInt(epMatch[1], 10);
      const epShort = eps.title.match(/[Ee][Pp]\s*(\d+)/);
      if (epShort) return parseInt(epShort[1], 10);
      const allNums = eps.title.match(/\d+/g);
      if (allNums && allNums.length > 0) return parseInt(allNums[allNums.length - 1], 10);
      return idx + 1;
    });
  }, [data.episodeList]);

  const isDescending = useMemo(() => {
    if (episodeNumbers.length < 2) return false;
    return episodeNumbers[0] > episodeNumbers[episodeNumbers.length - 1];
  }, [episodeNumbers]);

  const lastWatchedEpNum = useMemo(() => {
    if (!lastWatched?.episode) return -1;
    const match = lastWatched.episode.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : -1;
  }, [lastWatched]);

  const filteredEpisodes = useMemo(() => {
    if (!searchQuery) return data.episodeList;
    const q = searchQuery.toLowerCase().trim();
    return data.episodeList.filter((eps, idx) => {
      const num = episodeNumbers[idx];
      return String(num).includes(q) || eps.title.toLowerCase().includes(q);
    });
  }, [data.episodeList, searchQuery, episodeNumbers]);

  const cleanedSynopsisText = useMemo(() => {
    return cleanSynopsis(data.synopsis);
  }, [data.synopsis]);

  const handleToggleWatchLater = useCallback(() => {
    if (isInList) {
      const wlStr = DatabaseManager.getSync('watchLater');
      if (wlStr) {
        try {
          const wl: any[] = JSON.parse(wlStr);
          if (Array.isArray(wl)) {
            const idx = wl.findIndex(item => item.title === data.title.replace(/Subtitle Indonesia|Sub Indo/, ''));
            if (idx >= 0) {
              controlWatchLater('delete', idx);
              ToastAndroid.show(t('detail.removedWatchLater'), ToastAndroid.SHORT);
            }
          }
        } catch {}
      }
    } else {
      const watchLaterJson: watchLaterJSON = {
        title: data.title.replace(/Subtitle Indonesia|Sub Indo/, ''),
        link: props.route.params.link,
        rating: data.rating,
        releaseYear: data.releaseYear,
        thumbnailUrl: data.thumbnailUrl,
        genre: data.genres,
        date: Date.now(),
      };
      controlWatchLater('add', watchLaterJson);
      ToastAndroid.show(t('detail.addedWatchLater'), ToastAndroid.SHORT);
    }
  }, [data, isInList, props.route.params.link, t]);

  const handleStartWatch = useCallback(() => {
    if (data.episodeList.length === 0) {
      ToastAndroid.show(t('detail.noEpisodeToWatch'), ToastAndroid.SHORT);
      return;
    }
    if (lastWatched && lastWatched.episode) {
      props.navigation.navigate('FromUrl', {
        title: props.route.params.data.title,
        link: lastWatched.link,
        historyData: {
          lastDuration: lastWatched.lastDuration ?? 0,
          resolution: lastWatched.resolution ?? '',
        },
      });
    } else {
      const firstEpLink = isDescending
        ? data.episodeList[data.episodeList.length - 1].link
        : data.episodeList[0].link;
      props.navigation.navigate('FromUrl', {
        title: props.route.params.data.title,
        link: firstEpLink,
      });
    }
  }, [data.episodeList, isDescending, lastWatched, props.navigation, props.route.params.data.title, t]);

  const posterWidth = Math.min(130, screenWidth * 0.32);
  const posterHeight = posterWidth * 1.48;

  const headerContent = useMemo(() => {
    return (
      <View style={styles.mainContainer}>
        <View style={{ width: '100%', height: IMG_HEADER_HEIGHT, overflow: 'hidden' }}>
          <Reanimated.View style={[{ width: '100%', height: '100%' }, headerImageStyle]}>
            <ImageLoading
              source={{ uri: data.thumbnailUrl }}
              fallbackSearchTitle={data.title}
              style={{ width: '100%', height: '100%' }}
              blurRadius={14}
              resizeMode="cover"
            />
          </Reanimated.View>
          <LinearGradient
            colors={['rgba(11,14,20,0.1)', 'rgba(11,14,20,0.7)', isDark ? '#0B0E14' : '#F8FAFC']}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        <View style={[styles.heroRow, { marginTop: -posterHeight * 0.45 }]}>
          <View style={[styles.posterWrapper, { width: posterWidth, height: posterHeight }]}>
            <ImageLoading
              source={{ uri: data.thumbnailUrl }}
              fallbackSearchTitle={data.title}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          </View>

          <View style={styles.heroDetails}>
            <View style={styles.badgeRow}>
              {data.animeType ? (
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{data.animeType}</Text>
                </View>
              ) : null}
              {data.status ? (
                <View style={styles.statusBadge}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: data.status.toLowerCase().includes('complete')
                          ? '#22c55e'
                          : '#eab308',
                      },
                    ]}
                  />
                  <Text style={styles.statusBadgeText}>{data.status}</Text>
                </View>
              ) : null}
              {data.rating ? (
                <View style={styles.ratingBadge}>
                  <Icon name="star" size={11} color="#EAB308" />
                  <Text style={styles.ratingBadgeText}>{data.rating}</Text>
                </View>
              ) : null}
            </View>

            <Text style={[globalStyles.text, styles.heroTitle]} numberOfLines={3}>
              {historyTitle}
            </Text>

            {data.alternativeTitle && data.alternativeTitle !== historyTitle ? (
              <Text style={styles.altTitle} numberOfLines={1}>
                {data.alternativeTitle}
              </Text>
            ) : null}

            {data.studio ? (
              <Text style={styles.studioText} numberOfLines={1}>
                <Icon name="building-o" size={11} color={isDark ? '#94A3B8' : '#64748B'} /> {data.studio}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.infoCapsuleRow}>
          <View style={styles.infoCapsule}>
            <Icon name="calendar" size={12} color={isDark ? '#94A3B8' : '#64748B'} />
            <Text style={styles.infoCapsuleText}>{data.releaseYear || '-'}</Text>
          </View>
          <View style={styles.infoCapsule}>
            <Icon name="clock-o" size={12} color={isDark ? '#94A3B8' : '#64748B'} />
            <Text style={styles.infoCapsuleText}>{data.minutesPerEp || t('detail.defaultDuration')}</Text>
          </View>
          <View style={styles.infoCapsule}>
            <Icon name="tv" size={12} color={isDark ? '#94A3B8' : '#64748B'} />
            <Text style={styles.infoCapsuleText}>
              {t('detail.epProgressTotal', {
                current: data.episodeList.length,
                total: data.epsTotal || data.episodeList.length,
              })}
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.primaryPlayButton}
            activeOpacity={0.8}
            onPress={handleStartWatch}>
            <Icon name="play" size={14} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.primaryPlayButtonText}>
              {lastWatched?.episode
                ? t('detail.continueWatchBtn', { ep: lastWatchedEpNum > 0 ? lastWatchedEpNum : '' }).trim()
                : t('detail.startWatchEp1')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryActionButton, isInList && styles.secondaryActionButtonActive]}
            activeOpacity={0.8}
            onPress={handleToggleWatchLater}>
            <Icon
              name={isInList ? 'check' : 'bookmark-o'}
              size={14}
              color={isInList ? '#3B82F6' : (isDark ? '#E2E8F0' : '#1E293B')}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.secondaryActionText, isInList && { color: '#3B82F6', fontWeight: '700' }]}>
              {isInList ? t('detail.savedBtn') : t('detail.laterBtn')}
            </Text>
          </TouchableOpacity>
        </View>

        {activeDownloads.length > 0 && (() => {
          const downloadingItem = activeDownloads.find(d => d.status === 'downloading');
          const networkPausedCount = activeDownloads.filter(
            d => d.status === 'paused' && d.pauseReason === 'network',
          ).length;
          const isAllPaused = !downloadingItem;
          const primaryDl = downloadingItem || activeDownloads[0];
          const pillColor = isAllPaused ? '#F59E0B' : '#3B82F6';
          const pillLabel = !isAllPaused
            ? t('home.bannerDownloading', {
                count: activeDownloads.length,
                percent: primaryDl.progressPercent,
              })
            : networkPausedCount > 0
            ? t('home.bannerNetworkPaused', { count: networkPausedCount })
            : t('home.bannerPaused', { count: activeDownloads.length });

          return (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                (props.navigation as any).navigate('Home', {
                  screen: 'MyListsPage',
                  params: { initialTab: 'downloads' },
                })
              }
              style={[
                styles.activeDlPill,
                isAllPaused && {
                  backgroundColor: isDark ? 'rgba(245, 158, 11, 0.14)' : '#FFFBEB',
                  borderColor: isDark ? '#78350F' : '#FDE68A',
                },
              ]}>
              <View style={styles.activeDlPillRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
                  <Icon name={isAllPaused ? 'pause' : 'download'} size={13} color={pillColor} />
                  <Text
                    style={[
                      styles.activeDlPillText,
                      isAllPaused && { color: isDark ? '#FCD34D' : '#B45309' },
                    ]}
                    numberOfLines={1}>
                    {pillLabel}
                  </Text>
                </View>
                <Icon name="chevron-right" size={11} color={pillColor} />
              </View>
              <View
                style={[
                  styles.activeDlPillTrack,
                  isAllPaused && {
                    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
                  },
                ]}>
                <View
                  style={[
                    styles.activeDlPillFill,
                    {
                      width: `${Math.max(4, primaryDl.progressPercent)}%`,
                      backgroundColor: pillColor,
                    },
                  ]}
                />
              </View>
            </TouchableOpacity>
          );
        })()}

        {data.genres && data.genres.length > 0 && (
          <View style={styles.genreRow}>
            {data.genres.map(genre => (
              <View key={genre} style={styles.genrePill}>
                <Text style={styles.genrePillText}>{genre}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.synopsisCard}>
          <Text style={[globalStyles.text, styles.sectionTitle]}>{t('detail.synopsis')}</Text>
          <Text
            style={styles.synopsisParagraph}
            numberOfLines={showFullSynopsis ? undefined : 3}>
            {cleanedSynopsisText}
          </Text>
          {cleanedSynopsisText.length > 130 && (
            <TouchableOpacity
              onPress={() => setShowFullSynopsis(!showFullSynopsis)}
              style={styles.expandSynopsisBtn}
              activeOpacity={0.7}>
              <Text style={styles.expandSynopsisText}>
                {showFullSynopsis ? t('detail.showLess') : t('detail.showMore')}
              </Text>
              <Icon
                name={showFullSynopsis ? 'angle-up' : 'angle-down'}
                size={14}
                color={isDark ? '#60A5FA' : '#2563EB'}
                style={{ marginLeft: 4 }}
              />
            </TouchableOpacity>
          )}
        </View>

        <MediaForumSection
          navigation={props.navigation}
          defaultCategory="anime"
          linkedMedia={{
            media_key: normalizeMediaKey('anime', props.route.params.link || data.title),
            type: 'anime',
            title: historyTitle,
            poster_url: data.thumbnailUrl,
            link: props.route.params.link,
          }}
        />

        <View style={styles.episodeHeaderRow}>
          <View style={styles.sectionHeaderLine}>
            <Text style={[globalStyles.text, styles.sectionTitle]}>
              {t('detail.episodes')}
            </Text>
            <View style={styles.epCountBadge}>
              <Text style={styles.epCountBadgeText}>
                {t('detail.epCountShort', { count: data.episodeList.length })}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }, [
    styles,
    headerImageStyle,
    data.thumbnailUrl,
    data.title,
    data.animeType,
    data.status,
    data.rating,
    data.alternativeTitle,
    data.studio,
    data.releaseYear,
    data.minutesPerEp,
    data.episodeList.length,
    data.epsTotal,
    data.genres,
    posterWidth,
    posterHeight,
    globalStyles.text,
    historyTitle,
    handleStartWatch,
    lastWatched?.episode,
    lastWatchedEpNum,
    isInList,
    handleToggleWatchLater,
    isDark,
    cleanedSynopsisText,
    showFullSynopsis,
    activeDownloads,
    props.navigation,
    props.route.params.link,
    t,
  ]);

  const ListHeaderComponent = (
    <View>
      {headerContent}
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <Searchbar
          style={styles.searchbar}
          inputStyle={styles.searchbarInput}
          iconColor={isDark ? '#64748B' : '#94A3B8'}
          placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
          keyboardType="number-pad"
          placeholder={t('detail.searchEpisodePlaceholder')}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
    </View>
  );

  const handleEpisodePress = useCallback(
    (eps: { link: string; title: string }, epNum: number) => {
      const isLastEp = epNum === lastWatchedEpNum;
      props.navigation.navigate('FromUrl', {
        title: props.route.params.data.title,
        link: eps.link,
        historyData: isLastEp
          ? {
              lastDuration: lastWatched?.lastDuration ?? 0,
              resolution: lastWatched?.resolution ?? '',
            }
          : undefined,
      });
    },
    [lastWatchedEpNum, lastWatched, props.navigation, props.route.params.data.title],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: AniDetailEpsList; index: number }) => {
      const originalIdx = data.episodeList.indexOf(item);
      const epNum = episodeNumbers[originalIdx];
      const isLastEp = epNum === lastWatchedEpNum && lastWatchedEpNum >= 0;
      return (
        <EpisodeItem
          ep={item}
          epNum={epNum}
          isLastEp={isLastEp}
          onPress={handleEpisodePress}
          width={boxWidth}
        />
      );
    },
    [data.episodeList, episodeNumbers, lastWatchedEpNum, handleEpisodePress, boxWidth],
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: isDark ? '#0B0E14' : '#F8FAFC' }} behavior="height">
      <AnimatedFlatList
        extraData={showFullSynopsis}
        key={cols}
        ref={scrollRef as any}
        data={filteredEpisodes}
        numColumns={cols}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={{
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 16,
          gap: 8,
        }}
        renderItem={renderItem}
        keyExtractor={(item, idx) => item.title + idx}
        ListHeaderComponent={ListHeaderComponent}
        ListHeaderComponentStyle={{ marginHorizontal: -16 }}
        ListEmptyComponent={
          <View style={{ marginVertical: 32, alignItems: 'center' }}>
            <Icon name="search" size={28} color={isDark ? '#334155' : '#CBD5E1'} style={{ marginBottom: 8 }} />
            <Text style={[globalStyles.text, { opacity: 0.6, fontSize: 13 }]}>
              {searchQuery ? t('detail.episodeNotFound') : t('detail.noEpisodesAvailable')}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        initialNumToRender={cols * 3}
        maxToRenderPerBatch={cols * 2}
        windowSize={5}
        updateCellsBatchingPeriod={50}
      />
    </KeyboardAvoidingView>
  );
}

function useStyles() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  return useMemo(
    () =>
      StyleSheet.create({
        mainContainer: {
          flex: 1,
          backgroundColor: isDark ? '#0B0E14' : '#F8FAFC',
        },
        heroRow: {
          flexDirection: 'row',
          paddingHorizontal: 16,
          gap: 14,
        },
        posterWrapper: {
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: isDark ? '#161A23' : '#E2E8F0',
          borderWidth: 1.5,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)',
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
        },
        heroDetails: {
          flex: 1,
          justifyContent: 'flex-end',
          paddingBottom: 4,
          gap: 4,
        },
        badgeRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
          marginBottom: 4,
        },
        typeBadge: {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
        },
        typeBadgeText: {
          color: isDark ? '#E2E8F0' : '#1E293B',
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
        statusBadge: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
        },
        statusDot: {
          width: 6,
          height: 6,
          borderRadius: 3,
        },
        statusBadgeText: {
          color: isDark ? '#CBD5E1' : '#334155',
          fontSize: 11,
          fontWeight: '500',
        },
        ratingBadge: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
        },
        ratingBadgeText: {
          color: isDark ? '#F1F5F9' : '#0F172A',
          fontSize: 11,
          fontWeight: '700',
        },
        heroTitle: {
          fontSize: 18,
          fontWeight: '700',
          lineHeight: 24,
          color: isDark ? '#F8FAFC' : '#0F172A',
          letterSpacing: -0.2,
        },
        altTitle: {
          fontSize: 12,
          color: isDark ? '#94A3B8' : '#64748B',
          fontWeight: '500',
        },
        studioText: {
          fontSize: 11.5,
          color: isDark ? '#94A3B8' : '#64748B',
          fontWeight: '500',
          marginTop: 1,
        },
        infoCapsuleRow: {
          flexDirection: 'row',
          paddingHorizontal: 16,
          gap: 8,
          marginTop: 14,
        },
        infoCapsule: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.03)',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
          borderRadius: 8,
          paddingVertical: 8,
        },
        infoCapsuleText: {
          fontSize: 11.5,
          fontWeight: '600',
          color: isDark ? '#CBD5E1' : '#334155',
        },
        actionRow: {
          flexDirection: 'row',
          paddingHorizontal: 16,
          gap: 10,
          marginTop: 14,
        },
        primaryPlayButton: {
          flex: 2,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#2563EB',
          borderRadius: 10,
          paddingVertical: 12,
          elevation: 2,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
        },
        primaryPlayButtonText: {
          color: '#FFFFFF',
          fontSize: 14,
          fontWeight: '700',
        },
        secondaryActionButton: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
          borderRadius: 10,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
        },
        secondaryActionButtonActive: {
          backgroundColor: isDark ? 'rgba(37, 99, 235, 0.18)' : 'rgba(37, 99, 235, 0.1)',
          borderColor: 'rgba(37, 99, 235, 0.4)',
        },
        secondaryActionText: {
          fontSize: 13,
          fontWeight: '600',
          color: isDark ? '#E2E8F0' : '#1E293B',
        },
        genreRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          paddingHorizontal: 16,
          marginTop: 14,
        },
        genrePill: {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.035)',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          borderRadius: 14,
          paddingHorizontal: 10,
          paddingVertical: 4,
        },
        genrePillText: {
          fontSize: 11,
          fontWeight: '600',
          color: isDark ? '#94A3B8' : '#475569',
        },
        synopsisCard: {
          marginHorizontal: 16,
          marginTop: 14,
          padding: 14,
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.025)' : '#FFFFFF',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
          borderRadius: 10,
        },
        sectionHeaderLine: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        },
        sectionTitle: {
          fontSize: 15,
          fontWeight: '700',
          color: isDark ? '#F1F5F9' : '#0F172A',
          marginBottom: 8,
        },
        synopsisParagraph: {
          fontSize: 13,
          lineHeight: 20,
          color: isDark ? '#94A3B8' : '#475569',
        },
        expandSynopsisBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 6,
        },
        expandSynopsisText: {
          color: isDark ? '#60A5FA' : '#2563EB',
          fontSize: 12.5,
          fontWeight: '700',
        },
        episodeHeaderRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          marginTop: 18,
          marginBottom: 8,
        },
        epCountBadge: {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 10,
        },
        epCountBadgeText: {
          fontSize: 11,
          fontWeight: '600',
          color: isDark ? '#94A3B8' : '#64748B',
        },
        searchbar: {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#FFFFFF',
          borderRadius: 8,
          height: 42,
          elevation: 0,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : '#E2E8F0',
        },
        searchbarInput: {
          minHeight: 0,
          color: isDark ? '#F8FAFC' : '#0F172A',
          fontSize: 13,
        },
        activeDlPill: {
          marginHorizontal: 16,
          marginTop: 10,
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderRadius: 10,
          backgroundColor: isDark ? '#121D33' : '#EFF6FF',
          borderWidth: 1,
          borderColor: isDark ? '#1E3A8A' : '#BFDBFE',
        },
        activeDlPillRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        },
        activeDlPillText: {
          fontSize: 12,
          fontWeight: '700',
          color: isDark ? '#93C5FD' : '#1E40AF',
          flex: 1,
        },
        activeDlPillTrack: {
          height: 3,
          borderRadius: 2,
          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.25)' : '#DBEAFE',
          marginTop: 6,
          overflow: 'hidden',
        },
        activeDlPillFill: {
          height: '100%',
          backgroundColor: '#3B82F6',
          borderRadius: 2,
        },
      }),
    [isDark],
  );
}

export default memo(AniDetail);
