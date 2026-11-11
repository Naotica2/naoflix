import FontAwesomeIcon from '@react-native-vector-icons/fontawesome';
import Icon from '@react-native-vector-icons/material-design-icons';
import { StackActions, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FlashList,
  FlashListRef,
  ListRenderItemInfo,
  useRecyclingState,
} from '@shopify/flash-list';
import moment from 'moment';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { useTheme } from 'react-native-paper';
import Animated, {
  useAnimatedProps,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import URL from 'url';
import useGlobalStyles, { darkText } from '../../assets/style';
import { TranslationKey, useLanguage } from '../../misc/LanguageContext';
import { HistoryItemKey } from '../../types/databaseTarget';
import { HistoryJSON } from '../../types/historyJSON';
import { RootStackNavigator } from '../../types/navigation';
import { DatabaseManager, useModifiedKeyValueIfFocused } from '../../utils/DatabaseManager';
import DialogManager from '../../utils/dialogManager';
import ImageLoading from '../misc/ImageLoading';
import watchLaterJSON from '../../types/watchLaterJSON';
import controlWatchLater from '../../utils/watchLaterControl';
import DownloadsTab from './DownloadsTab';
import offlineDownloadManager from '../../utils/offlineDownloadManager';

type TabKey = 'history' | 'watchlater' | 'downloads';
type ContentCategory = 'all' | 'anime' | 'film' | 'comics';

function getHistoryItemCategory(key: HistoryItemKey): 'anime' | 'film' | 'comics' {
  if (!key || typeof key !== 'string') return 'anime';
  const parts = key.split(':');
  if (parts.length >= 3) {
    const isMovie = parts[parts.length - 1] === 'true';
    const isComics = parts[parts.length - 2] === 'true';
    if (isComics) return 'comics';
    if (isMovie) return 'film';
  }
  return 'anime';
}

function getHistoryItemTitle(key: HistoryItemKey): string {
  if (!key || typeof key !== 'string') return '';
  const parts = key.split(':');
  if (parts.length >= 4) {
    return parts.slice(1, -2).join(':');
  }
  return parts.slice(1).join(':');
}

function getWatchLaterCategory(item: watchLaterJSON): 'anime' | 'film' | 'comics' {
  if (item.isComics || (item as any).type === 'comics') return 'comics';
  if (
    item.isMovie ||
    (item as any).type === 'movie' ||
    item.rating === 'Film' ||
    item.link?.startsWith('film://') ||
    item.link?.includes('lk21') ||
    item.link?.includes('idlix')
  ) {
    return 'film';
  }
  return 'anime';
}

const CATEGORY_ITEMS: { key: ContentCategory; labelKey: TranslationKey; icon: string }[] = [
  { key: 'all', labelKey: 'lists.filterAll', icon: 'layers-outline' },
  { key: 'anime', labelKey: 'lists.filterAnime', icon: 'television-play' },
  { key: 'film', labelKey: 'lists.filterFilms', icon: 'movie-open-outline' },
  { key: 'comics', labelKey: 'lists.filterComics', icon: 'book-open-page-variant-outline' },
];

const CategoryFilterBar = memo(function CategoryFilterBar({
  selected,
  onSelect,
  counts,
}: {
  selected: ContentCategory;
  onSelect: (category: ContentCategory) => void;
  counts: { all: number; anime: number; film: number; comics: number };
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useLanguage();

  return (
    <View style={{ marginBottom: 8 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, flexDirection: 'row' }}>
        {CATEGORY_ITEMS.map(cat => {
          const isActive = selected === cat.key;
          const count = counts[cat.key];

          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => onSelect(cat.key)}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: 20,
                backgroundColor: isActive
                  ? '#3b82f6'
                  : isDark
                  ? '#1f1f1f'
                  : '#f1f3f5',
                borderWidth: 1,
                borderColor: isActive
                  ? '#2563eb'
                  : isDark
                  ? '#2e2e2e'
                  : '#e2e8f0',
              }}>
              <Icon
                name={cat.icon as any}
                size={16}
                color={isActive ? '#ffffff' : isDark ? '#9ca3af' : '#64748b'}
                style={{ marginRight: 6 }}
              />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? '700' : '500',
                  color: isActive ? '#ffffff' : isDark ? '#d1d5db' : '#334155',
                }}>
                {t(cat.labelKey)}
              </Text>
              <View
                style={{
                  marginLeft: 6,
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 10,
                  backgroundColor: isActive
                    ? 'rgba(255, 255, 255, 0.25)'
                    : isDark
                    ? '#2d2d2d'
                    : '#e2e8f0',
                }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: isActive ? '#ffffff' : isDark ? '#9ca3af' : '#64748b',
                  }}>
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
});

const ActiveDownloadCountBadge = memo(function ActiveDownloadCountBadge() {
  const [activeDownloadCount, setActiveDownloadCount] = useState(0);

  useEffect(() => {
    return offlineDownloadManager.subscribeProgress(activeMap => {
      const next = activeMap.size;
      setActiveDownloadCount(prev => (prev === next ? prev : next));
    });
  }, []);

  if (activeDownloadCount === 0) return null;

  return (
    <View
      style={{
        backgroundColor: '#3b82f6',
        borderRadius: 9,
        minWidth: 18,
        height: 18,
        paddingHorizontal: 5,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '700' }}>
        {activeDownloadCount}
      </Text>
    </View>
  );
});

const SegmentTabs = memo(function SegmentTabs({
  activeTab,
  onTabChange,
  offlineCount = 0,
}: {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  offlineCount?: number;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useLanguage();

  return (
    <View style={{ flexDirection: 'row', marginHorizontal: 14, marginTop: 8, marginBottom: 4, backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0', borderRadius: 12, padding: 4 }}>
      <TouchableOpacity
        onPress={() => onTabChange('history')}
        style={{
          flex: 1, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
          backgroundColor: activeTab === 'history' ? (isDark ? '#2a2a2a' : '#fff') : 'transparent',
          elevation: activeTab === 'history' ? 2 : 0,
        }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={{ fontWeight: '700', fontSize: 13, color: activeTab === 'history' ? '#3b82f6' : (isDark ? '#888' : '#666') }}>
          {t('lists.tabHistory')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onTabChange('watchlater')}
        style={{
          flex: 1, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
          backgroundColor: activeTab === 'watchlater' ? (isDark ? '#2a2a2a' : '#fff') : 'transparent',
          elevation: activeTab === 'watchlater' ? 2 : 0,
        }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={{ fontWeight: '700', fontSize: 13, color: activeTab === 'watchlater' ? '#3b82f6' : (isDark ? '#888' : '#666') }}>
          {t('lists.tabWatchLater')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onTabChange('downloads')}
        style={{
          flex: 1, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center',
          flexDirection: 'row', justifyContent: 'center', gap: 4,
          backgroundColor: activeTab === 'downloads' ? (isDark ? '#2a2a2a' : '#fff') : 'transparent',
          elevation: activeTab === 'downloads' ? 2 : 0,
        }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={{ fontWeight: '700', fontSize: 13, flexShrink: 1, color: activeTab === 'downloads' ? '#3b82f6' : (isDark ? '#888' : '#666') }}>
          {t('lists.tabDownloads')}{offlineCount > 0 ? ` (${offlineCount})` : ''}
        </Text>
        <ActiveDownloadCountBadge />
      </TouchableOpacity>
    </View>
  );
});

const HistoryDatabaseCache = new Map<HistoryItemKey, HistoryJSON>();
const HistoryRawCache = new Map<HistoryItemKey, string>();
export function clearMyListsHistoryCache() {
  HistoryDatabaseCache.clear();
  HistoryRawCache.clear();
}

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList as typeof FlashList<HistoryItemKey>);

function HistoryTab() {
  const styles = useHistoryStyles();
  const globalStyles = useGlobalStyles();
  const navigation = useNavigation<NavigationProp<RootStackNavigator>>();
  const { t } = useLanguage();

  const data = useModifiedKeyValueIfFocused(
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

  const [selectedCategory, setSelectedCategory] = useState<ContentCategory>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const searchKeywordDeferred = useDeferredValue(searchKeyword);

  const categoryCounts = useMemo(() => {
    let anime = 0;
    let film = 0;
    let comics = 0;
    for (const key of data) {
      const cat = getHistoryItemCategory(key);
      if (cat === 'anime') anime++;
      else if (cat === 'film') film++;
      else if (cat === 'comics') comics++;
    }
    return {
      all: data.length,
      anime,
      film,
      comics,
    };
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      if (!item || typeof item !== 'string') return false;
      if (selectedCategory !== 'all') {
        const cat = getHistoryItemCategory(item);
        if (cat !== selectedCategory) return false;
      }
      if (searchKeywordDeferred.trim() !== '') {
        const title = getHistoryItemTitle(item);
        return title.toLowerCase().includes(searchKeywordDeferred.toLowerCase());
      }
      return true;
    });
  }, [data, selectedCategory, searchKeywordDeferred]);

  const flatListRef = useRef<FlashListRef<HistoryItemKey>>(null);
  const scrollLastValue = useSharedValue(0);
  const scrollToTopButtonState = useSharedValue<'hide' | 'show'>('hide');
  const scrollToTopButtonScale = useSharedValue(0);

  const scrollToTopButtonProps = useAnimatedProps(() => ({
    pointerEvents: scrollToTopButtonScale.get() <= 0.3 ? ('none' as const) : ('auto' as const),
  }));

  const buttonTransformStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scrollToTopButtonScale.get() }],
  }));

  const showScrollToTopButton = useCallback(() => { 'worklet'; scrollToTopButtonScale.set(withSpring(1)); }, [scrollToTopButtonScale]);
  const hideScrollToTopButton = useCallback(() => { 'worklet'; scrollToTopButtonScale.set(withSpring(0)); }, [scrollToTopButtonScale]);

  const scrollHandler = useAnimatedScrollHandler(
    event => {
      const value = event.contentOffset.y;
      if (value <= 100) {
        if (scrollToTopButtonState.get() === 'show') hideScrollToTopButton();
        scrollToTopButtonState.set('hide');
      } else if (value < scrollLastValue.get() && scrollToTopButtonState.get() === 'hide') {
        showScrollToTopButton();
        scrollToTopButtonState.set('show');
      } else if (value > scrollLastValue.get() && scrollToTopButtonState.get() === 'show') {
        hideScrollToTopButton();
        scrollToTopButtonState.set('hide');
      }
      scrollLastValue.set(value);
    },
    [hideScrollToTopButton, scrollLastValue, scrollToTopButtonState, showScrollToTopButton],
  );

  const deleteHistory = useCallback(async (key: HistoryItemKey) => {
    let keyOrder: HistoryItemKey[] = [];
    try {
      const parsed = JSON.parse(DatabaseManager.getSync('historyKeyCollectionsOrder') ?? '[]');
      if (Array.isArray(parsed)) keyOrder = parsed;
    } catch {}
    const keyIndex = keyOrder.findIndex(z => z === key);
    if (keyIndex !== -1) {
      keyOrder.splice(keyIndex, 1);
      DatabaseManager.set('historyKeyCollectionsOrder', JSON.stringify(keyOrder));
      DatabaseManager.delete(key);
      HistoryDatabaseCache.delete(key);
      HistoryRawCache.delete(key);
    }
  }, []);

  const renderFlatList = useCallback(
    ({ item }: ListRenderItemInfo<HistoryItemKey>) => (
      <HistoryRenderItem
        keyItem={item}
        deleteHistory={deleteHistory}
        globalStyles={globalStyles}
        navigation={navigation}
        styles={styles}
      />
    ),
    [deleteHistory, globalStyles, navigation, styles],
  );

  const scrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ animated: true, offset: 0 });
  }, []);

  const selectedCategorySuffix = useMemo(() => {
    if (selectedCategory === 'anime') return t('lists.filterAnime').toLowerCase();
    if (selectedCategory === 'film') return t('lists.filterFilms').toLowerCase();
    if (selectedCategory === 'comics') return t('lists.filterComics').toLowerCase();
    return '';
  }, [selectedCategory, t]);

  const historyHeaderComponent = useMemo(
    () =>
      filteredData.length > 0 ? (
        <View style={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 }}>
          {searchKeywordDeferred.trim() !== '' && (
            <Text style={[globalStyles.text, { opacity: 0.8, fontStyle: 'italic', marginBottom: 4 }]}>
              {t('lists.resultsFor', { query: searchKeywordDeferred, count: filteredData.length })}
            </Text>
          )}
          <Text style={[globalStyles.text, { fontSize: 13, opacity: 0.75 }]}>
            {t('lists.showingHistory', { count: filteredData.length })}
            {selectedCategorySuffix ? ` (${selectedCategorySuffix})` : ''}
          </Text>
        </View>
      ) : null,
    [filteredData.length, globalStyles.text, searchKeywordDeferred, selectedCategorySuffix, t],
  );

  const historyEmptyComponent = useMemo(
    () => (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 }}>
        <Icon
          name={
            selectedCategory === 'comics'
              ? 'book-open-page-variant-outline'
              : selectedCategory === 'film'
              ? 'movie-open-outline'
              : selectedCategory === 'anime'
              ? 'television-play'
              : 'history'
          }
          size={48}
          color="#888"
        />
        <Text style={[globalStyles.text, { marginTop: 12, textAlign: 'center', fontWeight: '500' }]}>
          {searchKeywordDeferred.trim() !== ''
            ? t('lists.noMatchSearch', { query: searchKeywordDeferred })
            : selectedCategory === 'anime'
            ? t('lists.emptyHistoryAnime')
            : selectedCategory === 'film'
            ? t('lists.emptyHistoryFilm')
            : selectedCategory === 'comics'
            ? t('lists.emptyHistoryComics')
            : t('lists.emptyHistory')}
        </Text>
      </View>
    ),
    [globalStyles.text, searchKeywordDeferred, selectedCategory, t],
  );

  const historyKeyExtractor = useCallback((item: HistoryItemKey) => item, []);
  const listExtraData = useMemo(() => ({ styles, t }), [styles, t]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchInputView}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('lists.searchPlaceholder')}
          placeholderTextColor={globalStyles.text.color}
          value={searchKeyword}
          onChangeText={setSearchKeyword}
        />
        {searchKeyword !== searchKeywordDeferred && <ActivityIndicator color={globalStyles.text.color} />}
        {searchKeyword !== '' && (
          <TouchableOpacity style={{ alignSelf: 'center', padding: 4 }} onPress={() => setSearchKeyword('')}>
            <FontAwesomeIcon name="times" size={18} color={globalStyles.text.color} />
          </TouchableOpacity>
        )}
      </View>

      <CategoryFilterBar
        selected={selectedCategory}
        onSelect={setSelectedCategory}
        counts={categoryCounts}
      />

      <View style={styles.historyContainer}>
        <AnimatedFlashList
          data={filteredData}
          ref={flatListRef}
          drawDistance={350}
          keyExtractor={historyKeyExtractor}
          onScroll={scrollHandler}
          extraData={listExtraData}
          renderItem={renderFlatList}
          ListHeaderComponent={historyHeaderComponent}
          ListEmptyComponent={historyEmptyComponent}
        />
        <Animated.View style={[styles.scrollToTopView, buttonTransformStyle]} animatedProps={scrollToTopButtonProps}>
          <TouchableOpacity style={styles.scrollToTop} onPress={scrollToTop}>
            <View style={styles.scrollToTopIcon}>
              <Icon name="arrow-up" color={darkText} size={25} />
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

function formatTimeFromSeconds(seconds: number) {
  const duration = moment.duration(seconds, 'seconds');
  return `${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
}

const HistoryRenderItem = memo(function HistoryRenderItem({
  keyItem, styles, globalStyles, navigation, deleteHistory,
}: {
  keyItem: HistoryItemKey;
  navigation: NavigationProp<RootStackNavigator>;
  styles: ReturnType<typeof useHistoryStyles>;
  globalStyles: ReturnType<typeof useGlobalStyles>;
  deleteHistory: (key: HistoryItemKey) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [item, setItem] = useRecyclingState<HistoryJSON | undefined>(
    () => HistoryDatabaseCache.get(keyItem),
    [keyItem],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      DatabaseManager.get(keyItem).then(value => {
        if (cancelled) return;
        const raw = value ?? '';
        const cachedObj = HistoryDatabaseCache.get(keyItem);
        if (cachedObj && raw === HistoryRawCache.get(keyItem)) {
          setItem(prev => (prev === cachedObj ? prev : cachedObj));
          return;
        }
        try {
          const historyDb = JSON.parse(raw || '{}');
          HistoryRawCache.set(keyItem, raw);
          HistoryDatabaseCache.set(keyItem, historyDb);
          setItem(historyDb);
        } catch {}
      });
      return () => {
        cancelled = true;
      };
    }, [keyItem, setItem]),
  );

  const itemCategory = item?.isComics ? 'comics' : item?.isMovie ? 'film' : getHistoryItemCategory(keyItem);

  const relativeDateText = useMemo(() => {
    if (!item?.date) return '';
    const dur = moment.duration(moment(Date.now()).diff(item.date, 'seconds'), 'seconds').humanize();
    return `${dur}${t('lists.agoFormat')}\n${moment(item.date).format(`DD-MMMM-YYYY [${t('lists.atClock')}] HH:mm`)}`;
  }, [item?.date, t]);

  return (
    <TouchableOpacity
      style={styles.listContainerButton}
      disabled={!item}
      onPress={() => {
        const parsedHostname = URL.parse(item?.link ?? '').hostname || '';
        navigation.dispatch(StackActions.push('FromUrl', {
          title: item?.title,
          link: item?.link,
          historyData: item,
          thumbnailUrl: item?.thumbnailUrl,
          type: parsedHostname.includes('meionovel')
            ? 'novel'
            : item?.isMovie
              ? 'movie'
              : item?.isComics
                ? 'comics'
                : 'anime',
        }));
      }}>
      <ImageLoading resizeMode="cover" source={{ uri: item?.thumbnailUrl }} style={styles.listImage} />
      <View style={styles.listInfoContainer}>
        <View style={{ flexDirection: 'row' }}>
          <View style={styles.listWatchTime}>
            <Text style={[globalStyles.text, styles.listDateText]}>
              {relativeDateText}
            </Text>
          </View>
          <View style={styles.deleteContainer}>
            <TouchableOpacity
              disabled={!item}
              style={styles.deleteButton}
              hitSlop={5}
              onPress={() => {
                DialogManager.alert(
                  t('lists.removeHistoryTitle'),
                  t('lists.removeHistoryQuestion', { title: item?.title?.trim() || '' }),
                  [
                    { text: t('common.no'), onPress: () => null },
                    { text: t('common.yes'), onPress: () => deleteHistory(keyItem) },
                  ],
                );
              }}>
              <Icon name="delete-forever" size={21} style={styles.deleteIcon} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.listTitle}>
          <Text style={[{ flexShrink: 1, fontWeight: '600' }, globalStyles.text]} numberOfLines={2}>
            {item?.title || getHistoryItemTitle(keyItem)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <View style={styles.listEpisodeAndPart}>
            {itemCategory === 'comics' ? (
              <View style={{ backgroundColor: '#059669', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginRight: 6 }}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>{t('lists.filterComics')}</Text>
              </View>
            ) : itemCategory === 'film' ? (
              <View style={{ backgroundColor: '#ea580c', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginRight: 6 }}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>{t('lists.filterFilms')}</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: '#2563eb', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginRight: 6 }}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>{t('lists.filterAnime')}</Text>
              </View>
            )}
            {item?.episode && (
              <Text style={{ color: '#3b82f6', fontSize: 12, fontWeight: 'bold' }} numberOfLines={1}>
                {item?.episode}
              </Text>
            )}
          </View>
          {item?.lastDuration !== undefined && (
            <View style={styles.lastDuration}>
              <Text style={[globalStyles.text, styles.lastDurationText]}>
                <FontAwesomeIcon name={itemCategory === 'comics' ? 'book' : 'clock-o'} size={14} color={globalStyles.text.color} />{' '}
                {itemCategory === 'comics'
                  ? t('lists.pageLabel', { page: item?.lastDuration + 1 })
                  : formatTimeFromSeconds(item?.lastDuration)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

function useHistoryStyles() {
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  return useMemo(() => StyleSheet.create({
    historyContainer: { overflow: 'hidden', flex: 1 },
    scrollToTopView: { position: 'absolute', bottom: 40, right: 10, zIndex: 1 },
    scrollToTop: { height: 50, width: 50, borderRadius: 100, backgroundColor: 'rgb(0, 47, 109)', elevation: 3 },
    scrollToTopIcon: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    listContainerButton: {
      flexDirection: 'row', marginVertical: 4, marginHorizontal: 12,
      backgroundColor: isDark ? '#1a1a1a' : '#fff', borderWidth: 1, borderColor: isDark ? '#2a2a2a' : '#e0e0e0',
      borderRadius: 12, padding: 8,
    },
    listImage: { width: 80, height: 120, borderRadius: 8, marginRight: 10 },
    listInfoContainer: { flexDirection: 'column', flex: 1, justifyContent: 'space-between' },
    listTitle: { flexShrink: 1, marginVertical: 4 },
    listEpisodeAndPart: { justifyContent: 'flex-start', flexDirection: 'row', alignItems: 'center', flex: 1 },
    listWatchTime: { flex: 1 },
    listDateText: { color: theme.colors.onSecondaryContainer, opacity: 0.8, fontSize: 11, fontWeight: 'bold' },
    deleteContainer: {},
    deleteButton: { backgroundColor: '#ff4d4d', borderRadius: 6, padding: 4 },
    deleteIcon: { color: '#ffffff' },
    lastDuration: { justifyContent: 'flex-end', marginLeft: 4 },
    lastDurationText: { fontSize: 12, fontStyle: 'italic' },
    searchInputView: {
      height: 42, backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0', borderRadius: 21,
      marginHorizontal: 12, marginTop: 8, marginBottom: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center',
    },
    searchInput: { color: globalStyles.text.color, flex: 1, paddingVertical: 0, fontSize: 14 },
  }), [globalStyles.text.color, theme, isDark]);
}

function WatchLaterTab() {
  const styles = useWatchLaterStyles();
  const globalStyles = useGlobalStyles();
  const navigation = useNavigation<NavigationProp<RootStackNavigator>>();
  const { t } = useLanguage();

  const watchLaterLists = useModifiedKeyValueIfFocused<watchLaterJSON[]>(
    'watchLater',
    result => {
      try {
        const parsed = JSON.parse(result);
        return Array.isArray(parsed) ? (parsed as watchLaterJSON[]) : [];
      } catch {
        return [] as watchLaterJSON[];
      }
    },
    [] as watchLaterJSON[],
  );

  const [selectedCategory, setSelectedCategory] = useState<ContentCategory>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const searchKeywordDeferred = useDeferredValue(searchKeyword);

  const categoryCounts = useMemo(() => {
    let anime = 0;
    let film = 0;
    let comics = 0;
    for (const item of watchLaterLists) {
      const cat = getWatchLaterCategory(item);
      if (cat === 'anime') anime++;
      else if (cat === 'film') film++;
      else if (cat === 'comics') comics++;
    }
    return {
      all: watchLaterLists.length,
      anime,
      film,
      comics,
    };
  }, [watchLaterLists]);

  const filteredWatchLater = useMemo(() => {
    return watchLaterLists
      .map((item, originalIndex) => ({ item, originalIndex }))
      .filter(({ item }) => {
        if (selectedCategory !== 'all') {
          const cat = getWatchLaterCategory(item);
          if (cat !== selectedCategory) return false;
        }
        if (searchKeywordDeferred.trim() !== '') {
          return item.title?.toLowerCase().includes(searchKeywordDeferred.toLowerCase());
        }
        return true;
      });
  }, [watchLaterLists, selectedCategory, searchKeywordDeferred]);

  const renderItem = useCallback(
    ({ item: wrappedItem }: { item: { item: watchLaterJSON; originalIndex: number } }) => {
      const { item, originalIndex } = wrappedItem;
      const category = getWatchLaterCategory(item);

      return (
        <TouchableOpacity
          style={styles.listContainer}
          onPress={() => {
            if (item.link?.startsWith('film://')) {
              const filmRaw = item.link.replace('film://', '');
              const [filmPath] = filmRaw.split('?');
              const parts = filmPath.split('/');
              const subjectId = parts[0];
              const detailPath = parts.slice(1).join('/');
              navigation.dispatch(StackActions.push('FilmDetail', {
                data: {
                  subjectId,
                  detailPath,
                  title: item.title,
                  cover: { url: item.thumbnailUrl },
                  imdbRatingValue: item.rating || '',
                  releaseDate: item.releaseYear || '',
                  genre: item.genre?.join(', ') || '',
                  subjectType: item.isMovie ? 1 : 2,
                  subtitles: '',
                  dubs: [],
                  hasResource: true,
                  description: '',
                  countryName: '',
                },
              }));
              return;
            }
            const parsedHost = URL.parse(item.link || '').hostname || '';
            navigation.dispatch(StackActions.push('FromUrl', {
              title: item.title,
              link: item.link,
              thumbnailUrl: item.thumbnailUrl,
              type: parsedHost.includes('idlix')
                ? 'movie'
                : item.isMovie ? 'movie' : item.isComics ? 'comics' : 'anime',
            }));
          }}>
          <View style={styles.thumbnailWrapper}>
            <ImageLoading source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
            <View
              style={[
                styles.typeBadge,
                {
                  backgroundColor:
                    category === 'comics' ? '#059669' : category === 'film' ? '#ea580c' : '#2563eb',
                },
              ]}>
              <Text style={styles.typeBadgeText}>
                {category === 'comics'
                  ? t('lists.filterComics')
                  : category === 'film'
                    ? t('lists.filterFilms')
                    : t('lists.filterAnime')}
              </Text>
            </View>
          </View>

          <View style={styles.listInfoContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[globalStyles.text, styles.listDateText]}>
                {moment(item.date).format('DD MMM YYYY, HH:mm')}
              </Text>
              {item.rating && item.rating !== 'Film' && (
                <View style={styles.ratingBadge}>
                  <Icon name="star" size={12} color="#fbbf24" style={{ marginRight: 2 }} />
                  <Text style={styles.ratingText}>{item.rating}</Text>
                </View>
              )}
            </View>

            <View style={styles.titleContainer}>
              <Text style={[globalStyles.text, { fontWeight: '600', fontSize: 14 }]} numberOfLines={2}>
                {item.title}
              </Text>
            </View>

            <View style={styles.listBottom}>
              <View style={styles.listGenreContainer}>
                <Text style={styles.listGenreText} numberOfLines={1}>
                  {Array.isArray(item.genre) ? item.genre.join(', ') : String((item as any).genre || '')}
                </Text>
              </View>
              <TouchableOpacity
                hitSlop={6}
                onPress={() => {
                  DialogManager.alert(
                    t('lists.removeWatchLaterTitle'),
                    t('lists.removeWatchLaterQuestion', { title: item.title }),
                    [
                      { text: t('common.cancel'), onPress: () => {} },
                      { text: t('common.delete'), onPress: () => controlWatchLater('delete', originalIndex) },
                    ],
                  );
                }}
                style={styles.listDeleteContainer}>
                <Icon name="delete-forever" size={19} style={styles.listDeleteIcon} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [globalStyles.text, navigation, styles, t],
  );

  const selectedCategorySuffix = useMemo(() => {
    if (selectedCategory === 'anime') return t('lists.filterAnime').toLowerCase();
    if (selectedCategory === 'film') return t('lists.filterFilms').toLowerCase();
    if (selectedCategory === 'comics') return t('lists.filterComics').toLowerCase();
    return '';
  }, [selectedCategory, t]);

  const watchLaterHeaderComponent = useMemo(
    () => (
      <View style={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 }}>
        {searchKeywordDeferred.trim() !== '' && (
          <Text style={[globalStyles.text, { opacity: 0.8, fontStyle: 'italic', marginBottom: 4 }]}>
            {t('lists.resultsFor', { query: searchKeywordDeferred, count: filteredWatchLater.length })}
          </Text>
        )}
        <Text style={[globalStyles.text, { fontSize: 13, opacity: 0.75 }]}>
          {t('lists.showingWatchLater', { count: filteredWatchLater.length })}
          {selectedCategorySuffix ? ` (${selectedCategorySuffix})` : ''}
        </Text>
      </View>
    ),
    [filteredWatchLater.length, globalStyles.text, searchKeywordDeferred, selectedCategorySuffix, t],
  );

  const watchLaterKeyExtractor = useCallback(
    (wrapped: { item: watchLaterJSON; originalIndex: number }) =>
      `${wrapped.item.link || wrapped.item.title}-${wrapped.originalIndex}`,
    [],
  );
  const watchLaterExtraData = useMemo(() => ({ styles, t }), [styles, t]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchInputView}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('lists.searchPlaceholder')}
          placeholderTextColor={globalStyles.text.color}
          value={searchKeyword}
          onChangeText={setSearchKeyword}
        />
        {searchKeyword !== searchKeywordDeferred && <ActivityIndicator color={globalStyles.text.color} />}
        {searchKeyword !== '' && (
          <TouchableOpacity style={{ alignSelf: 'center', padding: 4 }} onPress={() => setSearchKeyword('')}>
            <FontAwesomeIcon name="times" size={18} color={globalStyles.text.color} />
          </TouchableOpacity>
        )}
      </View>

      <CategoryFilterBar
        selected={selectedCategory}
        onSelect={setSelectedCategory}
        counts={categoryCounts}
      />

      {filteredWatchLater.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 }}>
          <Icon
            name={
              selectedCategory === 'comics'
                ? 'book-open-page-variant-outline'
                : selectedCategory === 'film'
                ? 'movie-open-outline'
                : selectedCategory === 'anime'
                ? 'television-play'
                : 'bookmark-outline'
            }
            size={48}
            color="#888"
          />
          <Text style={[globalStyles.text, { marginTop: 12, textAlign: 'center', fontWeight: '500' }]}>
            {searchKeywordDeferred.trim() !== ''
              ? t('lists.noMatchSearch', { query: searchKeywordDeferred })
              : selectedCategory === 'anime'
              ? t('lists.emptyWatchLaterAnime')
              : selectedCategory === 'film'
              ? t('lists.emptyWatchLaterFilm')
              : selectedCategory === 'comics'
              ? t('lists.emptyWatchLaterComics')
              : t('lists.emptyWatchLater')}
          </Text>
        </View>
      ) : (
        <FlashList
          data={filteredWatchLater}
          drawDistance={350}
          extraData={watchLaterExtraData}
          renderItem={renderItem}
          keyExtractor={watchLaterKeyExtractor}
          ListHeaderComponent={watchLaterHeaderComponent}
        />
      )}
    </View>
  );
}

function useWatchLaterStyles() {
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  return useMemo(() => StyleSheet.create({
    listContainer: {
      flexDirection: 'row', marginVertical: 4, marginHorizontal: 12,
      backgroundColor: isDark ? '#1a1a1a' : '#fff', borderWidth: 1, borderColor: isDark ? '#2a2a2a' : '#e0e0e0',
      borderRadius: 12, padding: 8,
    },
    thumbnailWrapper: { position: 'relative', marginRight: 10 },
    thumbnail: { height: 120, width: 80, borderRadius: 8 },
    typeBadge: {
      position: 'absolute', top: 4, left: 4, borderRadius: 4,
      paddingHorizontal: 5, paddingVertical: 2,
    },
    typeBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
    ratingBadge: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#262626' : '#f1f5f9',
      paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    },
    ratingText: { fontSize: 11, fontWeight: '700', color: isDark ? '#e2e8f0' : '#1e293b' },
    listInfoContainer: { flex: 1, flexDirection: 'column', justifyContent: 'space-between' },
    titleContainer: { marginVertical: 4 },
    listGenreText: { color: '#3b82f6', fontWeight: '500', fontSize: 12 },
    listBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    listGenreContainer: { justifyContent: 'flex-start', flex: 1, marginRight: 6 },
    listDateText: { color: isDark ? '#9ca3af' : '#64748b', fontSize: 11, fontWeight: '500' },
    listDeleteContainer: { backgroundColor: '#ff4d4d', borderRadius: 6, padding: 5 },
    listDeleteIcon: { color: '#fff' },
    searchInputView: {
      height: 42, backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0', borderRadius: 21,
      marginHorizontal: 12, marginTop: 8, marginBottom: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center',
    },
    searchInput: { color: globalStyles.text.color, flex: 1, paddingVertical: 0, fontSize: 14 },
  }), [globalStyles.text.color, isDark]);
}

function MyListsPage() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<TabKey>(route?.params?.initialTab || 'history');
  const [offlineCount, setOfflineCount] = useState(() => offlineDownloadManager.getOfflineAnimeList().length);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const targetTab = route?.params?.initialTab;
    if (targetTab) {
      setActiveTab(targetTab);
      navigation.setParams({ initialTab: undefined });
    }
  }, [route?.params?.initialTab, navigation]);

  useEffect(() => {
    return offlineDownloadManager.subscribeList(list => {
      setOfflineCount(list.length);
    });
  }, []);

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <SegmentTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        offlineCount={offlineCount}
      />
      {activeTab === 'history' ? (
        <HistoryTab />
      ) : activeTab === 'watchlater' ? (
        <WatchLaterTab />
      ) : (
        <DownloadsTab />
      )}
    </View>
  );
}

export default memo(MyListsPage);
