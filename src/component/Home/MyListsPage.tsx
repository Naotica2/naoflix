import FontAwesomeIcon from '@react-native-vector-icons/fontawesome';
import Icon from '@react-native-vector-icons/material-design-icons';
import { StackActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FlashList,
  FlashListRef,
  ListRenderItemInfo,
  useRecyclingState,
} from '@shopify/flash-list';
import moment from 'moment';
import { memo, useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { HistoryItemKey } from '../../types/databaseTarget';
import { HistoryJSON } from '../../types/historyJSON';
import { RootStackNavigator } from '../../types/navigation';
import { DatabaseManager, useModifiedKeyValueIfFocused } from '../../utils/DatabaseManager';
import DialogManager from '../../utils/dialogManager';
import ImageLoading from '../misc/ImageLoading';
import watchLaterJSON from '../../types/watchLaterJSON';
import controlWatchLater from '../../utils/watchLaterControl';

type TabKey = 'history' | 'watchlater';

function SegmentTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 8, marginBottom: 4, backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0', borderRadius: 12, padding: 4 }}>
      <TouchableOpacity
        onPress={() => onTabChange('history')}
        style={{
          flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
          backgroundColor: activeTab === 'history' ? (isDark ? '#2a2a2a' : '#fff') : 'transparent',
          elevation: activeTab === 'history' ? 2 : 0,
        }}>
        <Text style={{ fontWeight: '700', fontSize: 14, color: activeTab === 'history' ? '#3b82f6' : (isDark ? '#888' : '#666') }}>
          Riwayat
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onTabChange('watchlater')}
        style={{
          flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
          backgroundColor: activeTab === 'watchlater' ? (isDark ? '#2a2a2a' : '#fff') : 'transparent',
          elevation: activeTab === 'watchlater' ? 2 : 0,
        }}>
        <Text style={{ fontWeight: '700', fontSize: 14, color: activeTab === 'watchlater' ? '#3b82f6' : (isDark ? '#888' : '#666') }}>
          Daftar Saya
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const HistoryDatabaseCache = new Map<HistoryItemKey, HistoryJSON>();
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList as typeof FlashList<HistoryItemKey>);

function HistoryTab() {
  const styles = useHistoryStyles();
  const globalStyles = useGlobalStyles();
  const navigation = useNavigation<NavigationProp<RootStackNavigator>>();

  const data = useModifiedKeyValueIfFocused(
    'historyKeyCollectionsOrder',
    state => JSON.parse(state) as HistoryItemKey[],
    [] as HistoryItemKey[],
  );

  const [searchKeyword, setSearchKeyword] = useState('');
  const searchKeywordDeferred = useDeferredValue(searchKeyword);

  const filteredData = useMemo(
    () => data.filter(item =>
      item && typeof item === 'string' && item.split(':').slice(1, -2).join(':').toLowerCase().includes(searchKeywordDeferred.toLowerCase()),
    ),
    [searchKeywordDeferred, data],
  );

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
    const keyOrder: HistoryItemKey[] = JSON.parse(
      DatabaseManager.getSync('historyKeyCollectionsOrder') ?? '[]',
    );
    const keyIndex = keyOrder.findIndex(z => z === key);
    if (keyIndex !== -1) {
      keyOrder.splice(keyIndex, 1);
      DatabaseManager.set('historyKeyCollectionsOrder', JSON.stringify(keyOrder));
      DatabaseManager.delete(key);
      HistoryDatabaseCache.delete(key);
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

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchInputView}>
        <TextInput
          style={styles.searchInput}
          placeholder="Cari judul..."
          placeholderTextColor={globalStyles.text.color}
          value={searchKeyword}
          onChangeText={setSearchKeyword}
        />
        {searchKeyword !== searchKeywordDeferred && <ActivityIndicator color={globalStyles.text.color} />}
        <TouchableOpacity style={{ alignSelf: 'center' }} onPress={() => setSearchKeyword('')}>
          <FontAwesomeIcon name="times" size={20} color={globalStyles.text.color} />
        </TouchableOpacity>
      </View>
      <View style={styles.historyContainer}>
        <AnimatedFlashList
          data={filteredData}
          key={searchKeywordDeferred}
          ref={flatListRef}
          keyExtractor={(item) => item}
          onScroll={scrollHandler}
          removeClippedSubviews={true}
          extraData={styles}
          estimatedItemSize={150}
          renderItem={renderFlatList}
          ListHeaderComponent={() =>
            data.length > 0 ? (
              <View>
                {searchKeywordDeferred !== '' && (
                  <Text style={[globalStyles.text, { opacity: 0.8, fontStyle: 'italic', textDecorationLine: 'underline', margin: 10 }]}>
                    Hasil untuk: {searchKeywordDeferred} ({filteredData.length})
                  </Text>
                )}
                <Text style={[globalStyles.text, { margin: 10 }]}>
                  Jumlah riwayat: <Text style={{ fontWeight: 'bold' }}>{data.length}</Text>
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={() => (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 }}>
              <Icon name="history" size={48} color="#888" />
              <Text style={[globalStyles.text, { marginTop: 12 }]}>Tidak ada riwayat</Text>
            </View>
          )}
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
  const currentItem = useRef(keyItem);
  currentItem.current = keyItem;
  const [item, setItem] = useRecyclingState<HistoryJSON | undefined>(
    () => HistoryDatabaseCache.get(keyItem),
    [keyItem],
  );

  useFocusEffect(
    useCallback(() => {
      DatabaseManager.get(keyItem).then(value => {
        if (currentItem.current !== keyItem) return;
        const historyDb = JSON.parse(value ?? '{}');
        HistoryDatabaseCache.set(keyItem, historyDb);
        setItem(historyDb);
      });
    }, [keyItem, setItem]),
  );

  return (
    <TouchableOpacity
      style={styles.listContainerButton}
      disabled={!item}
      onPress={() => {
        navigation.dispatch(StackActions.push('FromUrl', {
          title: item?.title,
          link: item?.link,
          historyData: item,
          thumbnailUrl: item?.thumbnailUrl,
          type: URL.parse(item?.link ?? '').hostname!?.includes('meionovel')
              ? 'novel'
              : item?.isMovie ? 'movie' : item?.isComics ? 'comics' : 'anime',
        }));
      }}>
      <ImageLoading resizeMode="cover" source={{ uri: item?.thumbnailUrl }} style={styles.listImage} />
      <View style={styles.listInfoContainer}>
        <View style={{ flexDirection: 'row' }}>
          <View style={styles.listWatchTime}>
            <Text style={[globalStyles.text, styles.listDateText]}>
              {item?.date && moment.duration(moment(Date.now()).diff(item.date, 'seconds'), 'seconds').humanize() +
                moment(item.date).format('[ yang lalu]\nDD-MMMM-YYYY [pukul] HH:mm')}
            </Text>
          </View>
          <View style={styles.deleteContainer}>
            <TouchableOpacity
              disabled={!item}
              style={styles.deleteButton}
              hitSlop={5}
              onPress={() => {
                DialogManager.alert('Yakin?', 'Yakin ingin menghapus "' + item?.title?.trim() + '" dari riwayat?', [
                  { text: 'Tidak', onPress: () => null },
                  { text: 'Ya', onPress: () => deleteHistory(keyItem) },
                ]);
              }}>
              <Icon name="delete-forever" size={21} style={styles.deleteIcon} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.listTitle}>
          <Text style={[{ flexShrink: 1 }, globalStyles.text]}>{item?.title}</Text>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <View style={styles.listEpisodeAndPart}>
            {item?.isComics && (
              <View style={{ backgroundColor: '#00586e', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4 }}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>Komik</Text>
              </View>
            )}
            {item?.isMovie && (
              <View style={{ backgroundColor: '#ff7300', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4 }}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>Movie</Text>
              </View>
            )}
            <Text style={{ color: '#3b82f6', fontSize: 13, fontWeight: 'bold' }}>{item?.episode}</Text>
          </View>
          {item?.lastDuration !== undefined && (
            <View style={styles.lastDuration}>
              <Text style={[globalStyles.text, styles.lastDurationText]}>
                <FontAwesomeIcon name={item?.isComics ? 'book' : 'clock-o'} size={16} color={globalStyles.text.color} />{' '}
                {item?.isComics ? 'Halaman ' + (item?.lastDuration + 1) : formatTimeFromSeconds(item?.lastDuration)}
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
      borderRadius: 12,
    },
    listImage: { width: 80, height: 140, borderTopLeftRadius: 16, borderBottomLeftRadius: 16, marginRight: 7 },
    listInfoContainer: { flexDirection: 'column', flex: 1 },
    listTitle: { flexShrink: 1, justifyContent: 'center', flex: 1 },
    listEpisodeAndPart: { justifyContent: 'flex-start', flexDirection: 'row', gap: 5, flex: 1, flexShrink: 1, alignItems: 'center' },
    listWatchTime: { flex: 1 },
    listDateText: { color: theme.colors.onSecondaryContainer, opacity: 0.8, fontSize: 12, fontWeight: 'bold' },
    deleteContainer: {},
    deleteButton: { backgroundColor: '#ff4d4d', borderRadius: 6, padding: 4 },
    deleteIcon: { color: theme.colors.onErrorContainer },
    lastDuration: { justifyContent: 'flex-end', marginRight: 4 },
    lastDurationText: { fontSize: 13, fontStyle: 'italic' },
    searchInputView: {
      height: 44, backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0', borderRadius: 22,
      margin: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center',
    },
    searchInput: { color: globalStyles.text.color, flex: 1 },
  }), [globalStyles.text.color, theme, isDark]);
}

function WatchLaterTab() {
  const styles = useWatchLaterStyles();
  const globalStyles = useGlobalStyles();
  const navigation = useNavigation<NavigationProp<RootStackNavigator>>();

  const watchLaterLists = useModifiedKeyValueIfFocused<watchLaterJSON[]>(
    'watchLater',
    result => JSON.parse(result) as watchLaterJSON[],
    [] as watchLaterJSON[],
  );

  const renderItem = useCallback(({ item, index }: { item: watchLaterJSON; index: number }) => (
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
        navigation.dispatch(StackActions.push('FromUrl', {
          title: item.title,
          link: item.link,
          thumbnailUrl: item.thumbnailUrl,
          type: URL.parse(item.link).hostname!?.includes('idlix')
            ? 'movie'
            : item.isMovie ? 'movie' : item.isComics ? 'comics' : 'anime',
        }));
      }}>
      <ImageLoading source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
      <View style={styles.ratingContainer}>
        <Text style={[globalStyles.text, styles.listRatingText,
          item.rating === 'Film' ? { backgroundColor: '#ff5252' } : item.isComics ? { backgroundColor: '#3e8bff' } : undefined,
        ]}>
          <Icon name={item.rating === 'Film' ? 'movie' : item.isComics ? 'book' : 'star'} /> {item.rating}
        </Text>
      </View>
      <View style={styles.listInfoContainer}>
        <Text style={[globalStyles.text, styles.listDateText]}>
          {moment(item.date).format('dddd DD-MM-YYYY [Pukul] HH:mm')}
        </Text>
        <View style={styles.titleContainer}>
          <Text style={[globalStyles.text]}>{item.title}</Text>
        </View>
        <View style={styles.listBottom}>
          <View style={styles.listGenreContainer}>
            <Text style={styles.listGenreText} numberOfLines={1}>{item.genre.toString()}</Text>
          </View>
          <TouchableOpacity
            hitSlop={4}
            onPress={() => {
              DialogManager.alert(
                'Hapus daftar tonton nanti',
                `Hapus "${item.title}" dari daftar tonton nanti?`,
                [
                  { text: 'Batal', onPress: () => {} },
                  { text: 'Hapus', onPress: () => controlWatchLater('delete', index) },
                ],
              );
            }}
            style={styles.listDeleteContainer}>
            <Icon name="delete-forever" size={20} style={styles.listDeleteIcon} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  ), [globalStyles.text, navigation, styles]);

  return (
    <View style={{ flex: 1 }}>
      {watchLaterLists.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 }}>
          <Icon name="bookmark-outline" size={48} color="#888" />
          <Text style={[globalStyles.text, { marginTop: 12 }]}>Belum ada daftar tonton nanti</Text>
        </View>
      ) : (
        <FlashList
          data={watchLaterLists}
          extraData={styles}
          estimatedItemSize={170}
          renderItem={renderItem as any}
          keyExtractor={(item: watchLaterJSON) => item.date.toString()}
          ListHeaderComponent={() => (
            <View>
              <Text style={[globalStyles.text, { margin: 10 }]}>
                Jumlah daftar: <Text style={{ fontWeight: 'bold' }}>{watchLaterLists.length}</Text>
                {'\n'}
                <Text style={[globalStyles.text, { margin: 10, fontWeight: 'bold', fontSize: 12, color: 'gray' }]}>
                  Sejak {moment(watchLaterLists.at(-1)!.date).format('DD MMMM YYYY')}
                </Text>
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function useWatchLaterStyles() {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  return useMemo(() => StyleSheet.create({
    listContainer: {
      flexDirection: 'row', marginVertical: 4, marginHorizontal: 12,
      backgroundColor: isDark ? '#1a1a1a' : '#fff', borderWidth: 1, borderColor: isDark ? '#2a2a2a' : '#e0e0e0',
      borderRadius: 12, height: 160, overflow: 'hidden',
    },
    listInfoContainer: { flex: 1, flexDirection: 'column', padding: 8 },
    thumbnail: { height: 160, width: 80, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, marginRight: 7 },
    ratingContainer: { position: 'absolute', left: 4, top: 4 },
    listRatingText: { backgroundColor: '#3b82f6', color: '#fff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, fontWeight: '700', fontSize: 11 },
    titleContainer: { justifyContent: 'center', flex: 1 },
    listGenreText: { color: '#3b82f6', fontWeight: '600', fontSize: 12 },
    listBottom: { flexDirection: 'row', alignItems: 'center' },
    listGenreContainer: { justifyContent: 'flex-start', flex: 1 },
    listDateText: { color: isDark ? '#888' : '#666', fontSize: 11, fontWeight: '500' },
    listDeleteContainer: { justifyContent: 'flex-end', backgroundColor: '#ff4d4d', borderRadius: 6, padding: 6, marginHorizontal: 2 },
    listDeleteIcon: { color: '#fff' },
  }), [theme, isDark]);
}

function MyListsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('history');
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <SegmentTabs activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === 'history' ? <HistoryTab /> : <WatchLaterTab />}
    </View>
  );
}

export default memo(MyListsPage);
