import MaterialIcon from '@react-native-vector-icons/material-icons';
import Icon from '@react-native-vector-icons/fontawesome';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  NavigationProp,
  StackActions,
  useFocusEffect,
  useIsFocused,
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
import { ComicsListContext } from '../../misc/context';
import { HomeNavigator, RootStackNavigator } from '../../types/navigation';
import { getLatestComicsReleases, LatestComicsRelease, comicsSearch, ComicsSearch, getPopularComicsReleases } from '../../utils/scrapers/comicsv2';
import { __ALIAS as KomikuAlias, KomikuSearch, komikuSearch, getLatestKomikuReleases, LatestKomikuRelease } from '../../utils/scrapers/komiku';
import { ListAnimeComponent } from '../misc/ListAnimeComponent';
import ImageLoading from '../misc/ImageLoading';
import DarkOverlay from '../misc/DarkOverlay';
import { TouchableOpacity } from '../misc/TouchableOpacityRNGH';
import { ShowSkeletonLoading, RenderScrollComponent } from './AnimePage';
import DialogManager from '../../utils/dialogManager';
import { DatabaseManager, useModifiedKeyValueIfFocused } from '../../utils/DatabaseManager';
import HeaderInfo from './HeaderInfo';

type ComicPageProps = BottomTabScreenProps<HomeNavigator, 'HomePage'>;

type SectionHeader = { type: 'header'; title: string };
type ComicItem = (ComicsSearch | KomikuSearch) & { source?: string };
type ComicsComboSearch = ComicItem | SectionHeader;

const TouchableOpacityAnimated = Reanimated.createAnimatedComponent(TouchableOpacity);

const ComicPage = memo(ComicPageComponent);
export default ComicPage;

function ComicPageComponent(props: ComicPageProps) {
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackNavigator>>();

  // ============ SEARCH STATE ============
  const [searchText, setSearchText] = useState('');
  const [comicsSearchData, setComicsSearchData] = useState<null | ComicsComboSearch[]>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [currentSearchQuery, setCurrentSearchQuery] = useState('');
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const textInputRef = useRef<TextInputType>(null);
  const abortController = useRef<AbortController | null>(null);
  abortController.current ??= new AbortController();
  const isFocus = useRef(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const searchHistory = useModifiedKeyValueIfFocused(
    'searchHistory',
    result => JSON.parse(result) as string[],
  );

  const clearSearch = useCallback(() => {
    setComicsSearchData(null);
    setShowSearchHistory(false);
    setSearchText('');
  }, []);

  // Search only triggers on submit (Enter key or search icon press)

  const submitSearch = useCallback(() => {
    if (searchText === '') return;
    setShowSearchHistory(false);
    setSearchLoading(true);
    textInputRef.current?.blur();

    Promise.allSettled([
      comicsSearch(searchText, abortController.current?.signal),
      komikuSearch(searchText, abortController.current?.signal),
    ])
      .then(([comicsResponse, komikuResponse]) => {
        if (comicsResponse.status === 'rejected' && komikuResponse.status === 'rejected') {
          if (!abortController.current?.signal.aborted) {
            DialogManager.alert('Error', 'Gagal mencari komik');
          }
          return;
        }
        const comicsResult = comicsResponse.status === 'fulfilled' ? comicsResponse.value : [];
        const komikuResult = komikuResponse.status === 'fulfilled' ? komikuResponse.value : [];

        const allItems: ComicItem[] = [
          ...comicsResult,
          ...komikuResult.map(res => ({ ...res, source: KomikuAlias })),
        ];

        const grouped: { [key: string]: ComicItem[] } = {};
        allItems.forEach(item => {
          const src = item.source || 'Lainnya';
          if (!grouped[src]) grouped[src] = [];
          grouped[src].push(item);
        });

        const sectionedData: ComicsComboSearch[] = [];
        Object.keys(grouped).forEach(key => {
          sectionedData.push({ type: 'header', title: key });
          sectionedData.push(...grouped[key]);
        });

        setComicsSearchData(sectionedData);
        setCurrentSearchQuery(searchText);
      })
      .finally(() => {
        if (searchHistory.includes(searchText)) {
          searchHistory.splice(searchHistory.indexOf(searchText), 1);
        }
        searchHistory.unshift(searchText);
        DatabaseManager.set('searchHistory', JSON.stringify(searchHistory));
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

  const hasSearchResults = comicsSearchData && comicsSearchData.length > 0;
  const isSearchEmpty = !hasSearchResults && comicsSearchData !== null;

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
              placeholder="Cari komik..."
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

      {/* GENRE BUTTON */}
      {!showSearchHistory && !hasSearchResults && !isSearchEmpty && !searchLoading && (
        <TouchableOpacityReactNative
          onPress={() => (props.navigation as any).navigate('GenreSelectionScreen', { type: 'comics' })}
          style={{
            marginHorizontal: 12,
            marginBottom: 8,
            backgroundColor: colorScheme === 'dark' ? '#1a1208' : '#fff8f0',
            paddingVertical: 10,
            borderRadius: 10,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colorScheme === 'dark' ? '#3d2a10' : '#f4d4a8',
          }}>
          <Icon name="tags" size={13} color="#F47521" style={{ marginRight: 8 }} />
          <Text style={{ fontWeight: '700', color: '#F47521', fontSize: 13 }}>
            Jelajahi Berdasarkan Genre
          </Text>
        </TouchableOpacityReactNative>
      )}

      <View style={{ flex: 1 }}>

      {searchLoading && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, padding: 8 }}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={[globalStyles.text, { opacity: 0.8 }]}>Mencari komik...</Text>
        </View>
      )}

      {hasSearchResults && !searchLoading && (
        <View style={{ flex: 1 }}>
          <Text style={[globalStyles.text, { fontWeight: 'bold', fontSize: 13, textAlign: 'center', marginVertical: 4 }]}>
            Hasil pencarian untuk: {currentSearchQuery}
          </Text>
          <FlashList
        estimatedItemSize={200}
            data={comicsSearchData}
            getItemType={item => {
              if ('type' in item && item.type === 'header') return 'sectionHeader';
              return 'row';
            }}
            keyExtractor={(item, index) => {
              if ('type' in item && item.type === 'header') return `header-${item.title}-${index}`;
              return String(index);
            }}
            renderItem={({ item }) => <ComicSearchItem item={item} navigation={navigation} />}
            contentContainerStyle={{ paddingBottom: 20 }}
            ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          />
          <TouchableOpacityAnimated
            style={comicStyles.closeSearchResult}
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
          <Text style={[globalStyles.text, { fontSize: 20, fontWeight: 'bold', marginBottom: 8 }]}>Komik tidak ditemukan</Text>
          <Text style={[globalStyles.text, { fontSize: 14, opacity: 0.6, textAlign: 'center', paddingHorizontal: 40 }]}>
            Coba kata kunci lain.
          </Text>
          <TouchableOpacityAnimated style={comicStyles.closeSearchResult} onPress={clearSearch} entering={ZoomIn} exiting={ZoomOut}>
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
          <ComicLatestList key={'comiclist' + refreshKey} />
          <KomikuLatestList key={'komikulist' + refreshKey} />
        </ScrollView>
      )}

      {showSearchHistory && (
        <Reanimated.View
          entering={ZoomIn.springify().withInitialValues({ transform: [{ scale: 0.5 }] })}
          exiting={ZoomOut.springify()}
          style={comicStyles.searchHistoryContainer}>
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
              <View style={comicStyles.searchHistoryHeader}>
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

// ============ SUB-COMPONENTS ============

const ComicLatestList = memo(ComicLatestListComponent);
function ComicLatestListComponent() {
  const styles = useStyles();
  const [isError, setIsError] = useState(false);
  const navigation = useNavigation<NavigationProp<RootStackNavigator, 'AnimeDetail'>>();
  const { paramsState: data, setParamsState: setData } = useContext(ComicsListContext);

  useEffect(() => {
    if (data && data.length > 0) return;
    queueMicrotask(() => {
      getLatestComicsReleases()
        .then(z => setData?.(z))
        .catch(() => setIsError(true));
    });
  }, [setData, data]);

  const renderComics = useCallback(
    ({ item }: ListRenderItemInfo<LatestComicsRelease>) => (
      <ListAnimeComponent
        gap
        newAnimeData={item}
        type="comics"
        key={'btn' + item.title}
        // @ts-expect-error
        navigationProp={navigation}
      />
    ),
    [navigation],
  );

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Komik Terbaru</Text>
        <TouchableOpacity
          style={styles.seeMoreButton}
          disabled={data?.length === 0}
          onPress={() => {
            navigation.dispatch(StackActions.push('SeeMore', { type: 'ComicsList' }));
          }}>
          <Text style={styles.seeMoreText}>Lihat Semua</Text>
          <MaterialIcon name="chevron-right" style={styles.seeMoreText} />
        </TouchableOpacity>
      </View>

      {isError && (
        <View>
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
          data={data.slice(0, 24)}
          renderItem={renderComics}
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

function ComicSearchItem({ item, navigation }: { item: ComicsComboSearch; navigation: any }) {
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();

  if ('type' in item && item.type === 'header') {
    return (
      <View style={comicStyles.sectionHeaderContainer}>
        <View style={comicStyles.sectionHeaderLine} />
        <Text style={[globalStyles.text, comicStyles.sectionHeaderText]}>
          <Icon name="globe" size={14} color={theme.colors.secondary} /> {item.title.toUpperCase()}
        </Text>
        <View style={comicStyles.sectionHeaderLine} />
      </View>
    );
  }

  const comic = item as ComicItem;

  return (
    <TouchableOpacityAnimated
      entering={FadeInRight}
      style={[comicStyles.listContainer, { backgroundColor: colorScheme === 'dark' ? '#333' : '#fff' }]}
      onPress={() => {
        navigation.dispatch(
          StackActions.push('FromUrl', { title: comic.title, link: comic.detailUrl, type: 'comics' }),
        );
      }}>
      <ImageLoading resizeMode="cover" source={{ uri: comic.thumbnailUrl }}
        style={[comicStyles.listImage, { width: 140, height: 200 }]} >
        <View style={{ position: 'absolute', top: 5, right: 5, backgroundColor: '#0000009d', padding: 5, borderRadius: 8 }}>
          <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
            {comic.latestChapter}
          </Text>
        </View>
      </ImageLoading>
      <ImageLoading displayLoading={false} source={{ uri: comic.thumbnailUrl }} blurRadius={5} style={{ flex: 1 }}>
        <DarkOverlay transparent={0.8} />
        <View style={{ flexDirection: 'row', flex: 1 }}>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'column', marginRight: 5, marginTop: 5 }}>
            <View style={[comicStyles.statusInfo, { backgroundColor: '#006600' }]}>
              <Text style={[globalStyles.text, { fontWeight: 'bold', color: 'white' }]}>{comic.type}</Text>
            </View>
          </View>
        </View>
        <View style={{ flexShrink: 1, paddingHorizontal: 5, justifyContent: 'center', flex: 1, marginLeft: 5 }}>
          <Text numberOfLines={4} style={[globalStyles.text, { fontWeight: 'bold', color: 'white', flexShrink: 1 }]}>
            {comic.title}
          </Text>
        </View>
        <View style={{ justifyContent: 'flex-end', flex: 1 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {'concept' in comic && (
              <View style={{ backgroundColor: 'rgba(0,0,0,0.445)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 }}>
                <Text style={[globalStyles.text, { fontWeight: 'bold', color: 'white', fontSize: 14 }]} numberOfLines={1}>
                  <Icon name="tags" color="white" /> {comic.concept}
                </Text>
              </View>
            )}
            <View style={{ backgroundColor: 'rgba(0,0,0,0.445)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 }}>
              <Text style={[globalStyles.text, { fontWeight: 'bold', color: 'white', fontSize: 14 }]} numberOfLines={1}>
                <Icon name="info" color="white" /> {comic.additionalInfo}
              </Text>
            </View>
            {comic.source && (
              <View style={{ backgroundColor: theme.colors.tertiaryContainer, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 }}>
                <Text style={[globalStyles.text, { fontWeight: 'bold', fontSize: 12, color: theme.colors.onTertiaryContainer }]} numberOfLines={1}>
                  <Icon name="globe" color={theme.colors.onTertiaryContainer} /> {comic.source.toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ImageLoading>
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
              'searchHistory',
              JSON.stringify(
                (JSON.parse((await DatabaseManager.get('searchHistory')) ?? '[]') as string[]).filter((_, i) => i !== index),
              ),
            );
          }}>
          <Icon name="times" size={25} color="#ff0f0f" />
        </TouchableOpacityReactNative>
      </TouchableOpacityReactNative>
    </View>
  );
}

// ============ STYLES ============
const comicStyles = StyleSheet.create({
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
    minHeight: 100,
  },
  listImage: {
    width: 80,
    height: 150,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  statusInfo: {
    padding: 4,
    borderRadius: 6,
  },
  sectionHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginHorizontal: 10,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
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
        seeMoreButton: {
          flexDirection: 'row',
          alignItems: 'center',
        },
        seeMoreText: {
          fontSize: 13,
          fontWeight: '600',
          color: '#F47521',
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
      }),
    [isDark, theme.colors.primary],
  );
}

const KomikuLatestList = memo(KomikuLatestListComponent);
function KomikuLatestListComponent() {
  const styles = useStyles();
  const [isError, setIsError] = useState(false);
  const navigation = useNavigation<NavigationProp<RootStackNavigator, 'AnimeDetail'>>();
  const [data, setData] = useState<LatestComicsRelease[] | null>(null);

  useEffect(() => {
    if (data && data.length > 0) return;
    queueMicrotask(() => {
      getPopularComicsReleases()
        .then(z => setData(z))
        .catch(() => setIsError(true));
    });
  }, [data]);

  const renderComics = useCallback(
    ({ item }: ListRenderItemInfo<LatestComicsRelease>) => (
      <ListAnimeComponent
        gap
        newAnimeData={item}
        type="comics"
        key={'popular' + item.title}
        navigationProp={navigation as any}
      />
    ),
    [navigation],
  );

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Komik Populer</Text>
        <TouchableOpacity
          style={styles.seeMoreButton}
          disabled={!data || data.length === 0}
          onPress={() => {
            navigation.dispatch(StackActions.push('SeeMore', { type: 'ComicsPopular' }));
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
          data={data.slice(0, 24)}
          renderItem={renderComics}
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
