import MaterialIcon from '@react-native-vector-icons/material-icons';
import Icon from '@react-native-vector-icons/fontawesome';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  NavigationProp,
  StackActions,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import React, { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  StyleSheet,
  Text,
  TextInput as TextInputType,
  TouchableOpacity as TouchableOpacityReactNative,
  useColorScheme,
  View,
} from 'react-native';
import { RefreshControl, ScrollView } from 'react-native-gesture-handler';
import { Searchbar, useTheme } from 'react-native-paper';
import Reanimated, {
  FadeInRight,
  FadeInUp,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useGlobalStyles from '../../assets/style';
import { NovelListContext } from '../../misc/context';
import { HomeNavigator, RootStackNavigator } from '../../types/navigation';
import {
  getLatestNovels,
  getPopularNovels,
  LatestNovel,
  novelSearch,
  NovelSearch,
} from '../../utils/scrapers/meionovel';
import ImageLoading from '../misc/ImageLoading';
import DarkOverlay from '../misc/DarkOverlay';
import { TouchableOpacity } from '../misc/TouchableOpacityRNGH';
import { ShowSkeletonLoading, RenderScrollComponent } from './AnimePage';
import DialogManager from '../../utils/dialogManager';
import { DatabaseManager, useModifiedKeyValueIfFocused } from '../../utils/DatabaseManager';
import HeaderInfo from './HeaderInfo';

type NovelPageProps = BottomTabScreenProps<HomeNavigator, 'HomePage'>;

const TouchableOpacityAnimated = Reanimated.createAnimatedComponent(TouchableOpacity);

const NovelPage = memo(NovelPageComponent);
export default NovelPage;

function NovelPageComponent(_props: NovelPageProps) {
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackNavigator>>();

  const [searchText, setSearchText] = useState('');
  const [novelSearchData, setNovelSearchData] = useState<null | NovelSearch[]>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [currentSearchQuery, setCurrentSearchQuery] = useState('');
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const textInputRef = useRef<TextInputType>(null);
  const abortController = useRef<AbortController | null>(null);
  abortController.current ??= new AbortController();
  const isFocus = useRef(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const searchHistory = useModifiedKeyValueIfFocused<string[]>(
    'novelSearchHistory',
    result => JSON.parse(result) as string[],
  );

  const clearSearch = useCallback(() => {
    setNovelSearchData(null);
    setShowSearchHistory(false);
    setSearchText('');
  }, []);


  const submitSearch = useCallback(() => {
    if (searchText === '') return;
    setShowSearchHistory(false);
    setSearchLoading(true);
    textInputRef.current?.blur();

    novelSearch(searchText, abortController.current?.signal)
      .then(results => {
        if (results.length === 0) {
          setNovelSearchData([]);
          return;
        }
        setNovelSearchData(results);
        setCurrentSearchQuery(searchText);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        DialogManager.alert('Error', 'Gagal mencari novel');
      })
      .finally(() => {
        if (searchHistory.includes(searchText)) {
          searchHistory.splice(searchHistory.indexOf(searchText), 1);
        }
        searchHistory.unshift(searchText);
        DatabaseManager.set('novelSearchHistory', JSON.stringify(searchHistory));
        setSearchLoading(false);
      });
  }, [searchHistory, searchText]);

  useFocusEffect(
    useCallback(() => {
      const timeout = setTimeout(() => {
        isFocus.current = true;
      }, 200);
      const keyboardEvent = Keyboard.addListener('keyboardDidHide', () => {
        textInputRef.current?.blur();
      });
      return () => {
        isFocus.current = false;
        keyboardEvent.remove();
        clearTimeout(timeout);
        clearSearch();
      };
    }, [clearSearch]),
  );

  useFocusEffect(
    useCallback(() => {
      if (showSearchHistory) {
        const backAction = () => {
          setShowSearchHistory(false);
          textInputRef.current?.blur();
          return true;
        };
        const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
        return () => backHandler.remove();
      }
    }, [showSearchHistory]),
  );

  const onTextInputFocus = useCallback(() => {
    if (!isFocus.current) {
      textInputRef.current?.blur();
      isFocus.current = true;
      return;
    }
    setShowSearchHistory(true);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey(k => k + 1);
    setTimeout(() => setRefreshing(false), 1500);
  }, []);

  const hasSearchResults = novelSearchData && novelSearchData.length > 0;
  const isSearchEmpty = !hasSearchResults && novelSearchData !== null;

  return (
    <View style={{ flex: 1, backgroundColor: styles.container.backgroundColor }}>
      {/* SEARCH BAR */}
      <View style={{ paddingTop: insets.top, paddingHorizontal: 12, paddingBottom: 6, backgroundColor: styles.container.backgroundColor }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {showSearchHistory && (
            <TouchableOpacityReactNative
              hitSlop={15}
              onPress={() => {
                setShowSearchHistory(false);
                textInputRef.current?.blur();
              }}
              style={{ paddingHorizontal: 10 }}>
              <Icon name="angle-left" size={28} color="#F47521" />
            </TouchableOpacityReactNative>
          )}
          <View style={{ flex: 1, height: 44 }}>
            <Searchbar
              onSubmitEditing={submitSearch}
              onIconPress={submitSearch}
              onChangeText={setSearchText}
              onFocus={onTextInputFocus}
              placeholder="Cari novel..."
              value={searchText}
              autoCorrect={false}
              ref={textInputRef}
              style={{ height: 44, borderRadius: 22, backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f0f0f0', elevation: 0 }}
              inputStyle={{ minHeight: 0, fontSize: 14 }}
              iconColor={colorScheme === 'dark' ? '#666' : '#999'}
              placeholderTextColor={colorScheme === 'dark' ? '#555' : '#aaa'}
            />
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>

      {searchLoading && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, padding: 8 }}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={[globalStyles.text, { opacity: 0.8 }]}>Mencari novel...</Text>
        </View>
      )}

      {hasSearchResults && !searchLoading && (
        <View style={{ flex: 1 }}>
          <Text style={[globalStyles.text, { fontWeight: 'bold', fontSize: 13, textAlign: 'center', marginVertical: 4 }]}>
            Hasil pencarian untuk: {currentSearchQuery}
          </Text>
          <FlashList
        estimatedItemSize={200}
            data={novelSearchData}
            keyExtractor={(item, index) => `novel-search-${index}`}
            renderItem={({ item }) => <NovelSearchItem item={item} navigation={navigation} />}
            contentContainerStyle={{ paddingBottom: 20 }}
            ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          />
          <TouchableOpacityAnimated
            style={novelStyles.closeSearchResult}
            onPress={clearSearch}
            entering={ZoomIn}
            exiting={ZoomOut}>
            <Icon name="times" size={30} style={{ alignSelf: 'center' }} color="#dadada" />
          </TouchableOpacityAnimated>
        </View>
      )}

      {isSearchEmpty && !searchLoading && (
        <Reanimated.View entering={FadeInUp} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Icon name="search-minus" size={60} color={theme.colors.outline} style={{ marginBottom: 15 }} />
          <Text style={[globalStyles.text, { fontSize: 20, fontWeight: 'bold', marginBottom: 8 }]}>Novel tidak ditemukan</Text>
          <Text style={[globalStyles.text, { fontSize: 14, opacity: 0.6, textAlign: 'center', paddingHorizontal: 40 }]}>
            Coba kata kunci lain.
          </Text>
          <TouchableOpacityAnimated style={novelStyles.closeSearchResult} onPress={clearSearch} entering={ZoomIn} exiting={ZoomOut}>
            <Icon name="times" size={30} style={{ alignSelf: 'center' }} color="#dadada" />
          </TouchableOpacityAnimated>
        </Reanimated.View>
      )}

      {!hasSearchResults && !isSearchEmpty && (
        <ScrollView
          style={styles.container}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              progressBackgroundColor={colorScheme === 'dark' ? '#0f0f0f' : '#fafafa'}
              colors={['#F47521', '#ff9a56']}
            />
          }>
          <HeaderInfo />
          <NovelLatestList key={'novellist' + refreshKey} />
          <NovelPopularList key={'novelpop' + refreshKey} />
        </ScrollView>
      )}

      {showSearchHistory && (
        <Reanimated.View
          entering={ZoomIn.springify().withInitialValues({ transform: [{ scale: 0.5 }] })}
          exiting={ZoomOut.springify()}
          style={novelStyles.searchHistoryContainer}>
          <FlashList
        estimatedItemSize={200}
            drawDistance={250}
            keyboardShouldPersistTaps="always"
            data={searchHistory}
            keyExtractor={(name, index) => name + String(index)}
            renderItem={({ item, index }) => (
              <HistoryItem item={item} index={index} onSelect={setSearchText} />
            )}
            ItemSeparatorComponent={() => (
              <View style={{ borderBottomWidth: 0.5, borderColor: colorScheme === 'dark' ? 'gray' : 'black', width: '100%' }} />
            )}
            ListHeaderComponent={
              <View style={novelStyles.searchHistoryHeader}>
                <Text style={[globalStyles.text, { fontWeight: 'bold', flex: 1, textAlign: 'center' }]}>
                  Riwayat Pencarian: {searchHistory.length}
                </Text>
              </View>
            }
          />
        </Reanimated.View>
      )}
      </View>
    </View>
  );
}


const NovelLatestList = memo(NovelLatestListComponent);
function NovelLatestListComponent() {
  const styles = useStyles();
  const [isError, setIsError] = useState(false);
  const navigation = useNavigation<NavigationProp<RootStackNavigator>>();
  const { paramsState: data, setParamsState: setData } = useContext(NovelListContext);

  useEffect(() => {
    if (data && data.length > 0) return;
    queueMicrotask(() => {
      getLatestNovels()
        .then(z => setData?.(z))
        .catch(() => setIsError(true));
    });
  }, [setData, data]);

  const renderNovel = useCallback(
    ({ item }: ListRenderItemInfo<LatestNovel>) => (
      <TouchableOpacity
        style={novelStyles.novelCard}
        onPress={() => {
          navigation.dispatch(
            StackActions.push('FromUrl', { title: item.title, link: item.detailUrl, type: 'novel' }),
          );
        }}>
        <ImageLoading
          resizeMode="cover"
          source={{ uri: item.thumbnailUrl }}
          style={novelStyles.novelThumbnail}>
          <DarkOverlay transparent={0.4} />
          <View style={novelStyles.novelCardOverlay}>
            {item.rating ? (
              <View style={novelStyles.ratingBadge}>
                <Icon name="star" size={10} color="#FFD700" />
                <Text style={novelStyles.ratingText}>{item.rating}</Text>
              </View>
            ) : null}
          </View>
        </ImageLoading>
        <View style={novelStyles.novelCardInfo}>
          <Text numberOfLines={2} style={[styles.sectionTitle, { fontSize: 13 }]}>
            {item.title}
          </Text>
          {item.latestChapter ? (
            <Text numberOfLines={1} style={novelStyles.chapterText}>
              {item.latestChapter}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    ),
    [navigation, styles.sectionTitle],
  );

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Novel Terbaru</Text>
        <TouchableOpacity
          style={styles.seeMoreButton}
          disabled={!data || data.length === 0}
          onPress={() => {
            navigation.dispatch(StackActions.push('SeeMore', { type: 'NovelsList' }));
          }}>
          <Text style={styles.seeMoreText}>Lihat Semua</Text>
          <MaterialIcon name="chevron-right" style={styles.seeMoreText} />
        </TouchableOpacity>
      </View>

      {isError && (
        <View style={styles.errorContainer}>
          <MaterialIcon name="error-outline" size={24} color="#d80000" />
          <Text style={styles.errorText}>Error mendapatkan data. Silahkan refresh untuk mencoba lagi</Text>
        </View>
      )}

      {data && data?.length !== 0 ? (
        <FlashList
        estimatedItemSize={200}
          renderScrollComponent={RenderScrollComponent}
          contentContainerStyle={{ gap: 3 }}
          horizontal
          data={data}
          renderItem={renderNovel}
          keyExtractor={z => z.title}
          extraData={styles}
          showsHorizontalScrollIndicator={false}
        />
      ) : (
        !isError && <ShowSkeletonLoading />
      )}
    </View>
  );
}

const NovelPopularList = memo(NovelPopularListComponent);
function NovelPopularListComponent() {
  const styles = useStyles();
  const [isError, setIsError] = useState(false);
  const [data, setData] = useState<LatestNovel[] | null>(null);
  const navigation = useNavigation<NavigationProp<RootStackNavigator>>();

  useEffect(() => {
    if (data && data.length > 0) return;
    queueMicrotask(() => {
      getPopularNovels()
        .then(z => setData(z))
        .catch(() => setIsError(true));
    });
  }, [data]);

  const renderNovel = useCallback(
    ({ item }: ListRenderItemInfo<LatestNovel>) => (
      <TouchableOpacity
        style={novelStyles.novelCard}
        onPress={() => {
          navigation.dispatch(
            StackActions.push('FromUrl', { title: item.title, link: item.detailUrl, type: 'novel' }),
          );
        }}>
        <ImageLoading
          resizeMode="cover"
          source={{ uri: item.thumbnailUrl }}
          style={novelStyles.novelThumbnail}>
          <DarkOverlay transparent={0.4} />
          <View style={novelStyles.novelCardOverlay}>
            {item.rating ? (
              <View style={novelStyles.ratingBadge}>
                <Icon name="star" size={10} color="#FFD700" />
                <Text style={novelStyles.ratingText}>{item.rating}</Text>
              </View>
            ) : null}
          </View>
        </ImageLoading>
        <View style={novelStyles.novelCardInfo}>
          <Text numberOfLines={2} style={[styles.sectionTitle, { fontSize: 13 }]}>
            {item.title}
          </Text>
          {item.latestChapter ? (
            <Text numberOfLines={1} style={novelStyles.chapterText}>
              {item.latestChapter}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    ),
    [navigation, styles.sectionTitle],
  );

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Novel Populer</Text>
        <TouchableOpacity
          style={styles.seeMoreButton}
          disabled={!data || data.length === 0}
          onPress={() => {
            navigation.dispatch(StackActions.push('SeeMore', { type: 'NovelsPopular' }));
          }}>
          <Text style={styles.seeMoreText}>Lihat Semua</Text>
          <MaterialIcon name="chevron-right" style={styles.seeMoreText} />
        </TouchableOpacity>
      </View>

      {isError && (
        <View style={styles.errorContainer}>
          <MaterialIcon name="error-outline" size={24} color="#d80000" />
          <Text style={styles.errorText}>Error mendapatkan data. Silahkan refresh untuk mencoba lagi</Text>
        </View>
      )}

      {data && data.length !== 0 ? (
        <FlashList
        estimatedItemSize={200}
          renderScrollComponent={RenderScrollComponent}
          contentContainerStyle={{ gap: 3 }}
          horizontal
          data={data}
          renderItem={renderNovel}
          keyExtractor={z => z.title + '_pop'}
          extraData={styles}
          showsHorizontalScrollIndicator={false}
        />
      ) : (
        !isError && <ShowSkeletonLoading />
      )}
    </View>
  );
}

function NovelSearchItem({ item, navigation }: { item: NovelSearch; navigation: any }) {
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();

  return (
    <TouchableOpacityAnimated
      entering={FadeInRight}
      style={[novelStyles.listContainer, { backgroundColor: colorScheme === 'dark' ? '#333' : '#fff' }]}
      onPress={() => {
        navigation.dispatch(
          StackActions.push('FromUrl', { title: item.title, link: item.detailUrl, type: 'novel' }),
        );
      }}>
      <ImageLoading resizeMode="cover" source={{ uri: item.thumbnailUrl }}
        style={[novelStyles.listImage, { width: 100, height: 150 }]} />
      <View style={{ flex: 1, padding: 10, justifyContent: 'space-between' }}>
        <View>
          <Text numberOfLines={2} style={[globalStyles.text, { fontWeight: 'bold', fontSize: 16 }]}>
            {item.title}
          </Text>
          {item.latestChapter ? (
            <Text numberOfLines={1} style={[globalStyles.text, { fontSize: 12, opacity: 0.7, marginTop: 4 }]}>
              <Icon name="book" size={11} color={theme.colors.secondary} /> {item.latestChapter}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {item.genres.slice(0, 3).map((genre, i) => (
            <View key={i} style={{ backgroundColor: theme.colors.secondaryContainer, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ color: theme.colors.onSecondaryContainer, fontSize: 11, fontWeight: 'bold' }}>{genre}</Text>
            </View>
          ))}
          {item.rating ? (
            <View style={{ backgroundColor: '#FFD70033', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name="star" size={10} color="#FFD700" />
              <Text style={{ color: '#FFD700', fontSize: 11, fontWeight: 'bold' }}>{item.rating}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacityAnimated>
  );
}

function HistoryItem({ item, index, onSelect }: { item: string; index: number; onSelect: (t: string) => void }) {
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  return (
    <View style={{ backgroundColor: colorScheme === 'light' ? '#e3e5e6' : '#252525', borderRadius: 9, marginVertical: 3 }}>
      <TouchableOpacityReactNative
        style={{ padding: 6, flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 }}
        onPress={() => onSelect(item)}>
        <View style={{ justifyContent: 'center', alignItems: 'center', flex: 1, flexDirection: 'row' }}>
          <Icon name="history" size={20} color={theme.colors.tertiary} />
          <Text style={[globalStyles.text, { fontWeight: 'bold', flex: 1, textAlign: 'center' }]}>{item}</Text>
        </View>
        <TouchableOpacityReactNative
          hitSlop={14}
          onPress={async () => {
            DatabaseManager.set(
              'novelSearchHistory',
              JSON.stringify(
                (JSON.parse((await DatabaseManager.get('novelSearchHistory')) ?? '[]') as string[]).filter((_, i) => i !== index),
              ),
            );
          }}>
          <Icon name="times" size={25} color="#ff0f0f" />
        </TouchableOpacityReactNative>
      </TouchableOpacityReactNative>
    </View>
  );
}

const novelStyles = StyleSheet.create({
  closeSearchResult: {
    position: 'absolute',
    backgroundColor: '#dd0d0dd3',
    borderRadius: 20,
    padding: 10,
    paddingHorizontal: 12,
    bottom: 20,
    right: 10,
    zIndex: 1,
  },
  searchHistoryContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    padding: 10,
    elevation: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  searchHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 7,
    marginBottom: 5,
  },
  listContainer: {
    flexDirection: 'row',
    borderRadius: 16,
    elevation: 4,
    marginHorizontal: 6,
    overflow: 'hidden',
  },
  listImage: {
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  novelCard: {
    width: 140,
    marginHorizontal: 4,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 3,
  },
  novelThumbnail: {
    width: 140,
    height: 190,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  novelCardOverlay: {
    position: 'absolute',
    top: 5,
    right: 5,
  },
  novelCardInfo: {
    padding: 6,
    minHeight: 50,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#0000009d',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ratingText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: 'bold',
  },
  chapterText: {
    fontSize: 11,
    opacity: 0.6,
    marginTop: 2,
    color: '#999',
  },
});

function useStyles() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  const isDark = colorScheme === 'dark';

  return React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: isDark ? '#0f0f0f' : '#fafafa',
        },
        sectionContainer: {
          backgroundColor: 'transparent',
          paddingVertical: 4,
          marginHorizontal: 0,
          marginBottom: 8,
        },
        sectionHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          marginBottom: 10,
        },
        sectionTitle: {
          fontSize: 18,
          fontWeight: '700',
          color: isDark ? '#f0f0f0' : '#1a1a1a',
          letterSpacing: -0.3,
        },
        errorContainer: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          backgroundColor: isDark ? '#1a1010' : '#fff5f5',
          borderRadius: 8,
          marginHorizontal: 16,
          borderWidth: 1,
          borderColor: isDark ? '#331a1a' : '#ffdddd',
        },
        errorText: {
          fontSize: 13,
          color: '#e04040',
          marginLeft: 8,
          textAlign: 'center',
          fontWeight: '500',
        },
        seeMoreButton: {
          flexDirection: 'row',
          alignItems: 'center',
        },
        seeMoreText: {
          fontSize: 13,
          color: '#F47521',
          fontWeight: '600',
        },
      }),
    [isDark, theme.colors.primary],
  );
}
