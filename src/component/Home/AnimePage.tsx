import { OTAJSVersion, version } from '../../../package.json';
import Announcment from '../misc/Announcement';
import HeaderInfo from './HeaderInfo';
import { runOnJS } from 'react-native-worklets';
import MaterialIcon from '@react-native-vector-icons/material-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  NavigationProp,
  StackActions,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import { FlashList, ListRenderItemInfo, useMappingHelper } from '@shopify/flash-list';
import React, {
  memo,
  use,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  StyleSheet,
  Text,
  TextInput as TextInputType,
  ToastAndroid,
  TouchableOpacity as TouchableOpacityReactNative,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { RefreshControl, ScrollView } from 'react-native-gesture-handler';
import { Searchbar, useTheme } from 'react-native-paper';
import Reanimated, { ZoomIn, ZoomOut, FadeInRight, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@react-native-vector-icons/fontawesome';
import useGlobalStyles from '../../assets/style';
import {
  EpisodeBaruHomeContext,
} from '../../misc/context';
import { EpisodeBaruHome as EpisodeBaruType, JadwalAnime, NewAnimeList, SearchAnime, listAnimeTypeList, CarouselItem } from '../../types/anime';
import { HomeNavigator, RootStackNavigator } from '../../types/navigation';
import AnimeAPI from '../../utils/AnimeAPI';

import { ListAnimeComponent } from '../misc/ListAnimeComponent';
import Skeleton from '../misc/Skeleton';
import { TouchableOpacity } from '../misc/TouchableOpacityRNGH';
import ImageLoading from '../misc/ImageLoading';
import DarkOverlay from '../misc/DarkOverlay';
import DialogManager from '../../utils/dialogManager';
import { DatabaseManager, useModifiedKeyValueIfFocused } from '../../utils/DatabaseManager';
import { LegendList, LegendListRef } from '@legendapp/list';

export const MIN_IMAGE_HEIGHT = 200;
export const MIN_IMAGE_WIDTH = 100;


type AnimePageProps = BottomTabScreenProps<HomeNavigator, 'HomePage'>;

const AnimePage = memo(AnimePageComponent);
export default AnimePage;

type SearchAnimeResult = SearchAnime['result'][number];
type AnySearchItem = SearchAnimeResult;
type SearchRowItem = AnySearchItem;

const TouchableOpacityAnimated = Reanimated.createAnimatedComponent(TouchableOpacity);

function AnimePageComponent(props: AnimePageProps) {
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { paramsState: data, setParamsState: setData } = useContext(EpisodeBaruHomeContext);
  const [refresh, setRefresh] = useState(false);
  const [isRateLimit, setIsRateLimit] = useState(false);
  const [refreshingKey, setRefreshingKey] = useState(0);


  const [searchText, setSearchText] = useState('');
  const [searchData, setSearchData] = useState<null | SearchAnime>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [currentSearchQuery, setCurrentSearchQuery] = useState('');
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const textInputRef = useRef<TextInputType>(null);
  const abortController = useRef<AbortController | null>(null);
  abortController.current ??= new AbortController();
  const isFocus = useRef(true);

  const searchHistory = useModifiedKeyValueIfFocused(
    'searchHistory',
    result => JSON.parse(result) as string[],
  );

  const clearSearch = useCallback(() => {
    setSearchData(null);
    setShowSearchHistory(false);
    setSearchText('');
  }, []);


  const submitSearch = useCallback(() => {
    if (searchText === '') return;
    setShowSearchHistory(false);
    setSearchLoading(true);
    textInputRef.current?.blur();

    Promise.allSettled([
      AnimeAPI.search(searchText, abortController.current?.signal),
    ])
      .then(([animeResponse]) => {
        setIsRateLimit(false);
        setCurrentSearchQuery(searchText);

        if (animeResponse.status === 'rejected') {
          if (animeResponse.reason?.name === 'SankaRateLimitError') {
            setIsRateLimit(true);
          } else {
            const err = animeResponse.reason;
            if (!err.message?.includes('Aborted') && !err.message?.includes('canceled')) {
              DialogManager.alert('Error', err.message || 'Unknown error');
            }
          }
        } else {
          setSearchData(animeResponse.value);
        }
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

  const refreshing = useCallback(() => {
    setRefresh(true);
    setIsRateLimit(false);
    setData?.(val => ({ ...val, newAnime: [] }));
    setRefreshingKey(val => val + 1);

    setTimeout(() => {
      AnimeAPI.home()
        .then(async jsondata => {
          setData?.(jsondata);
          setRefresh(false);
        })
        .catch(e => {
          if (e.name === 'SankaRateLimitError') {
            setIsRateLimit(true);
          } else {
            ToastAndroid.show('Gagal terhubung ke server.', ToastAndroid.SHORT);
          }
          setRefresh(false);
        });
    }, 0);
  }, [setData]);


  const hasSearchResults = (searchData?.result?.length ?? 0) > 0;
  const isSearchEmpty = !hasSearchResults && searchData !== null;
  const flashListData: AnySearchItem[] = searchData?.result ?? [];

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
              placeholder="Cari anime / movie..."
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
          onPress={() => (props.navigation as any).navigate('GenreSelectionScreen', { type: 'anime' })}
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

      {/* REMAINDER OF CONTENT WRAPPED SO ABSOLUTE POSITIONING OFFSETS AFTER SEARCH BAR */}
      <View style={{ flex: 1 }}>
        {/* SEARCH LOADING */}
      {searchLoading && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, padding: 8 }}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={[globalStyles.text, { opacity: 0.8 }]}>Mencari...</Text>
        </View>
      )}

      {/* SEARCH RESULTS */}
      {hasSearchResults && !searchLoading && (
        <View style={{ flex: 1 }}>
          <Text style={[globalStyles.text, { fontWeight: 'bold', fontSize: 13, textAlign: 'center', marginVertical: 4 }]}>
            Hasil pencarian untuk: {currentSearchQuery}
          </Text>
          <FlashList
        estimatedItemSize={200}
            data={flashListData}
            keyExtractor={(item, index) => String(index)}
            renderItem={({ item: z }) => <AnimeSearchList item={z} navigation={props.navigation} />}
            contentContainerStyle={{ paddingBottom: 20 }}
            ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          />
          <TouchableOpacityAnimated
            style={searchStyles.closeSearchResult}
            onPress={clearSearch}
            entering={ZoomIn}
            exiting={ZoomOut}>
            <Icon name="times" size={30} style={{ alignSelf: 'center' }} color="#dadada" />
          </TouchableOpacityAnimated>
        </View>
      )}

      {/* SEARCH EMPTY */}
      {isSearchEmpty && !searchLoading && (
        <Reanimated.View entering={FadeInUp} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Icon name="search-minus" size={60} color={theme.colors.outline} style={{ marginBottom: 15 }} />
          <Text style={[globalStyles.text, { fontSize: 20, fontWeight: 'bold', marginBottom: 8 }]}>Hasil tidak ditemukan</Text>
          <Text style={[globalStyles.text, { fontSize: 14, opacity: 0.6, textAlign: 'center', paddingHorizontal: 40 }]}>
            Coba periksa kembali kata kunci pencarianmu atau gunakan kata kunci lain.
          </Text>
          <TouchableOpacityAnimated
            style={searchStyles.closeSearchResult}
            onPress={clearSearch}
            entering={ZoomIn}
            exiting={ZoomOut}>
            <Icon name="times" size={30} style={{ alignSelf: 'center' }} color="#dadada" />
          </TouchableOpacityAnimated>
        </Reanimated.View>
      )}

      {/* RATE LIMIT */}
      {isRateLimit && !searchLoading && !hasSearchResults && (
        <Reanimated.View entering={FadeInUp} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacityReactNative
            onPress={submitSearch}
            style={{ alignItems: 'center', backgroundColor: '#f39c1225', padding: 25, borderRadius: 15, marginHorizontal: 20 }}>
            <MaterialIcon name="hourglass-empty" size={50} color="#f39c12" />
            <Text style={[globalStyles.text, { fontSize: 20, fontWeight: 'bold', color: '#f39c12', marginTop: 15 }]}>
              Server Sedang Antre
            </Text>
            <Text style={[globalStyles.text, { fontSize: 14, color: '#f39c12', textAlign: 'center' }]}>
              Ketuk untuk mencoba lagi.
            </Text>
          </TouchableOpacityReactNative>
        </Reanimated.View>
      )}

      {/* MAIN CONTENT (hidden when search results are shown) */}
      {!hasSearchResults && !isSearchEmpty && !isRateLimit && (
        <LegendList
          recycleItems
          renderScrollComponent={(renderProps) => <ScrollView {...renderProps} />}
          style={styles.container}
          refreshControl={
            <RefreshControl
              style={{ zIndex: 1 }}
              refreshing={refresh}
              onRefresh={refreshing}
              progressBackgroundColor={colorScheme === 'dark' ? '#0f0f0f' : '#fafafa'}
              colors={['#F47521', '#ff9a56']}
            />
          }
          ListHeaderComponent={
            <>
              <Announcment />
              <HeaderInfo />

              <TouchableOpacity style={styles.refreshButton} onPress={refreshing} disabled={refresh}>
                <MaterialIcon name="refresh" size={20} color="#FFFFFF" style={styles.refreshIcon} />
                <Text style={styles.refreshText}>Refresh Data</Text>
              </TouchableOpacity>

              <AnimeCarousel data={data?.carousel} navigation={props.navigation} />

              <EpisodeBaru
                isRefreshing={refresh}
                styles={styles}
                globalStyles={globalStyles}
                data={data}
                navigation={props.navigation}
                isRateLimit={isRateLimit}
                onRetry={refreshing}
              />

            </>
          }
          data={[]}
          keyExtractor={z => String(z)}
          renderItem={({ item }) => <View />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* SEARCH HISTORY OVERLAY */}
      {showSearchHistory && (
        <Reanimated.View
          entering={ZoomIn.springify().withInitialValues({ transform: [{ scale: 0.5 }] })}
          exiting={ZoomOut.springify()}
          style={searchStyles.searchHistoryContainer}>
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
              <View style={searchStyles.searchHistoryHeader}>
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


const EpisodeBaru = memo(EpisodeBaruComponent);
function EpisodeBaruComponent({
  styles,
  data,
  navigation,
  isRefreshing,
  isRateLimit,
  onRetry,
  globalStyles,
}: {
  data: EpisodeBaruType | undefined;
  navigation: any;
  isRefreshing?: boolean;
  isRateLimit?: boolean;
  onRetry?: () => void;
  styles: ReturnType<typeof useStyles>;
  globalStyles: ReturnType<typeof useGlobalStyles>;
}) {
  const renderNewAnime = useCallback(
    ({ item }: ListRenderItemInfo<NewAnimeList>) => (
      <ListAnimeComponent
        gap
        newAnimeData={item}
        key={'btn' + item.title + item.episode}
        navigationProp={navigation}
      />
    ),
    [navigation],
  );

  const [showJadwal, setShowJadwal] = useState(false);
  const [jadwalData, setJadwalData] = useState<{ [key: string]: { title: string; link: string }[] } | null>(null);
  const [isLoadingJadwal, setIsLoadingJadwal] = useState(false);
  const colorScheme = useColorScheme();

  const openJadwal = useCallback(async () => {
    setShowJadwal(true);
    if (!jadwalData) {
      setIsLoadingJadwal(true);
      try {
        const res = await AnimeAPI.jadwalAnime();
        setJadwalData(res);
      } catch (e) {
        ToastAndroid.show('Gagal memuat jadwal rilis', ToastAndroid.SHORT);
      } finally {
        setIsLoadingJadwal(false);
      }
    }
  }, [jadwalData]);

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Episode Terbaru</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            style={[styles.seeMoreButton, { backgroundColor: '#F47521', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 }]}
            onPress={openJadwal}>
            <MaterialIcon name="calendar-today" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12, marginLeft: 4 }}>Jadwal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.seeMoreButton}
            onPress={() => {
              navigation.dispatch(StackActions.push('SeeMore', { type: 'AnimeList' }));
            }}>
            <Text style={styles.seeMoreText}>Lihat Semua</Text>
            <MaterialIcon name="chevron-right" size={16} color="#F47521" />
          </TouchableOpacity>
        </View>
      </View>

      {/* JADWAL RILIS MODAL - Crunchyroll style */}
      {showJadwal && (
        <View style={{ position: 'absolute', top: 50, left: 0, right: 0, backgroundColor: colorScheme === 'dark' ? '#141414' : '#fff', zIndex: 100, borderRadius: 12, padding: 0, maxHeight: 420, borderWidth: 1, borderColor: colorScheme === 'dark' ? '#2a2a2a' : '#e0e0e0', elevation: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colorScheme === 'dark' ? '#222' : '#eee' }}>
            <Text style={{ color: colorScheme === 'dark' ? '#f0f0f0' : '#111', fontSize: 17, fontWeight: '700' }}>Jadwal Rilis</Text>
            <TouchableOpacity onPress={() => setShowJadwal(false)} style={{ padding: 4 }}>
              <MaterialIcon name="close" size={22} color={colorScheme === 'dark' ? '#888' : '#666'} />
            </TouchableOpacity>
          </View>
          {isLoadingJadwal ? (
            <ActivityIndicator size="large" color="#F47521" style={{ marginTop: 30, marginBottom: 30 }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              {jadwalData && Object.keys(jadwalData).map(hari => (
                <View key={hari} style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <View style={{ width: 4, height: 18, backgroundColor: '#F47521', borderRadius: 2, marginRight: 10 }} />
                    <Text style={{ color: '#F47521', fontWeight: '700', fontSize: 15 }}>{hari}</Text>
                  </View>
                  {jadwalData[hari].map((anime, idx) => (
                    <TouchableOpacity
                      key={anime.title}
                      style={{ paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colorScheme === 'dark' ? (idx % 2 === 0 ? '#1a1a1a' : '#141414') : (idx % 2 === 0 ? '#f9f9f9' : '#fff'), borderRadius: 6, marginBottom: 2 }}
                      onPress={() => {
                        setShowJadwal(false);
                        navigation.navigate('FromUrl', {
                          title: anime.title,
                          link: anime.link,
                          type: 'anime',
                        });
                      }}
                    >
                      <Text style={{ color: colorScheme === 'dark' ? '#ccc' : '#333', fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                        {anime.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {(data?.newAnime.length || 0) > 0 ? (
        <FlashList
        estimatedItemSize={200}
          renderScrollComponent={(p) => <ScrollView {...p} />}
          contentContainerStyle={{ gap: 3 }}
          horizontal
          data={(data?.newAnime ?? []).slice(0, 25)}
          keyExtractor={z => z.title}
          renderItem={renderNewAnime}
          extraData={styles}
          showsHorizontalScrollIndicator={false}
        />
      ) : isRefreshing ? (
        <ShowSkeletonLoading />
      ) : isRateLimit ? (
        <TouchableOpacity style={styles.errorContainer} onPress={onRetry}>
          <MaterialIcon name="hourglass-empty" size={24} color="#f39c12" />
          <Text style={styles.errorText}>
            Server Sanka sedang antre. Ketuk untuk mencoba ulang.
          </Text>
        </TouchableOpacity>
      ) : (
        <View>
          <MaterialIcon name="error-outline" size={24} color="#d80000" />
          <Text style={styles.errorText}>
            Error mendapatkan data. Silahkan refresh untuk mencoba lagi
          </Text>
        </View>
      )}
    </View>
  );
}


function HistoryItem({ item, index, onSelect }: { item: string; index: number; onSelect: (t: string) => void }) {
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  return (
    <View
      style={{ backgroundColor: colorScheme === 'light' ? '#e3e5e6' : '#252525', borderRadius: 9, marginVertical: 3 }}>
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
                (JSON.parse((await DatabaseManager.get('searchHistory')) ?? '[]') as string[]).filter(
                  (_, i) => i !== index,
                ),
              ),
            );
          }}>
          <Icon name="times" size={25} color="#ff0f0f" />
        </TouchableOpacityReactNative>
      </TouchableOpacityReactNative>
    </View>
  );
}

function AnimeSearchList({ item: z, navigation }: { item: AnySearchItem; navigation: any }) {
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();

  return (
    <TouchableOpacityAnimated
      entering={FadeInRight}
      style={[searchStyles.listContainer, { backgroundColor: colorScheme === 'dark' ? '#333' : '#fff' }]}
      onPress={() => {
        navigation.dispatch(
          StackActions.push('FromUrl', {
            title: z.title,
            link: z.animeUrl,
            type: 'anime',
          }),
        );
      }}>
      <ImageLoading
        resizeMode="cover"
        source={{ uri: z.thumbnailUrl }}
        style={searchStyles.listImage}
      />
      <ImageLoading
        displayLoading={false}
        source={{ uri: z.thumbnailUrl }}
        blurRadius={5}
        style={{ flex: 1 }}>
        <DarkOverlay transparent={0.8} />
        <View style={{ flexDirection: 'row', flex: 1 }}>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'column', marginRight: 5, marginTop: 5 }}>
            <View style={[searchStyles.statusInfo, {
              backgroundColor: z.status === 'Ongoing' ? '#920000' : '#006600',
            }]}>
              <Text style={[globalStyles.text, { fontWeight: 'bold', color: 'white' }]}>
                {z.status}
              </Text>
            </View>
          </View>
        </View>
        <View style={{ flexShrink: 1, paddingHorizontal: 5, justifyContent: 'center', flex: 1, marginLeft: 5 }}>
          <Text numberOfLines={4} style={[globalStyles.text, { fontWeight: 'bold', color: 'white', flexShrink: 1 }]}>
            {z.title}
          </Text>
        </View>
        <View style={{ justifyContent: 'flex-end', flex: 1 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.445)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 }}>
              <Text style={[globalStyles.text, { fontWeight: 'bold', color: 'white', fontSize: 14 }]} numberOfLines={1}>
                <Icon name="tags" color="white" /> {z.genres.join(', ')}
              </Text>
            </View>
          </View>
        </View>
      </ImageLoading>
    </TouchableOpacityAnimated>
  );
}

export function ShowSkeletonLoading() {
  const dimensions = useWindowDimensions();
  let LIST_BACKGROUND_HEIGHT = (dimensions.height * 120) / 200 / 2.5;
  let LIST_BACKGROUND_WIDTH = (dimensions.width * 120) / 200 / 2;
  LIST_BACKGROUND_HEIGHT = Math.max(LIST_BACKGROUND_HEIGHT, MIN_IMAGE_HEIGHT);
  LIST_BACKGROUND_WIDTH = Math.max(LIST_BACKGROUND_WIDTH, MIN_IMAGE_WIDTH);
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {[1, 2, 3].map((_, index) => (
        <View key={index} style={{ gap: 3 }}>
          <Skeleton key={index + 'image'} width={LIST_BACKGROUND_WIDTH} height={LIST_BACKGROUND_HEIGHT} style={{ borderRadius: 8 }} />
          <Skeleton key={index + 'title'} width={LIST_BACKGROUND_WIDTH} height={20} />
        </View>
      ))}
    </View>
  );
}

export function RenderScrollComponent(renderProps: any) {
  return <ScrollView {...renderProps} />;
}

const AnimeCarousel = memo(AnimeCarouselComponent);
function AnimeCarouselComponent({ data, navigation }: { data: CarouselItem[] | undefined; navigation: any }) {
  const dimensions = useWindowDimensions();
  const colorScheme = useColorScheme();
  const globalStyles = useGlobalStyles();
  
  if (!data || data.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <FlashList
        estimatedItemSize={200}
        data={data || []}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, index) => item.streamingLink + index}
        renderItem={({ item }: { item: CarouselItem }) => (
          <TouchableOpacityReactNative
            activeOpacity={0.9}
            style={{ width: dimensions.width, paddingHorizontal: 16 }}
            onPress={() => {
              navigation.navigate('FromUrl', {
                title: item.title,
                link: item.streamingLink,
                type: 'anime',
              });
            }}>
            <View style={{ 
               width: '100%', 
               height: dimensions.width * 0.45, 
               borderRadius: 12, 
               overflow: 'hidden', 
               backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#e0e0e0' 
            }}>
              <ImageLoading 
                source={{ uri: item.thumbnailUrl }} 
                style={{ width: '100%', height: '100%' }} 
                resizeMode="cover" 
              />
              <DarkOverlay transparent={0.4} />
              
              <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
                 {item.rating ? (
                   <View style={{ alignSelf: 'flex-start', backgroundColor: '#F47521', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginBottom: 4 }}>
                     <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}><Icon name="star" size={10} color="#fff" /> {item.rating}</Text>
                   </View>
                 ) : null}
                 <Text style={[globalStyles.text, { color: '#fff', fontSize: 16, fontWeight: 'bold' }]} numberOfLines={2}>
                   {item.title}
                 </Text>
              </View>
            </View>
          </TouchableOpacityReactNative>
        )}
      />
    </View>
  );
}

const searchStyles = StyleSheet.create({
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
    top: 0, // Now cleanly relative to the container BELOW the searchbar
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    padding: 10,
    elevation: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.95)', // fully opaque back panel
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
});

function useStyles() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  const isDark = colorScheme === 'dark';

  return useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: isDark ? '#0f0f0f' : '#fafafa',
        },
        headerCard: {
          backgroundColor: 'transparent',
          padding: 0,
          margin: 0,
        },
        headerInfo: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 4,
        },
        timeText: {
          fontSize: 12,
          color: '#F47521',
          fontWeight: '600',
        },
        batteryText: {
          fontSize: 12,
          color: '#F47521',
          fontWeight: '600',
        },
        appInfo: {
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'center',
          marginBottom: 8,
        },
        appName: {
          fontSize: 22,
          fontWeight: '800',
          color: '#F47521',
          marginRight: 8,
          letterSpacing: -0.5,
        },
        appVersion: {
          fontSize: 11,
          color: isDark ? '#555' : '#bbb',
        },
        socialButtons: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-around',
          gap: 12,
        },
        runningText: {
          color: '#F47521',
          fontWeight: '600',
          fontSize: 13,
        },
        refreshButton: {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
          paddingVertical: 6,
          borderRadius: 8,
          marginHorizontal: 16,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: isDark ? '#2a2a2a' : '#e0e0e0',
        },
        refreshIcon: {
          color: isDark ? '#888' : '#666',
          marginRight: 8,
        },
        refreshText: {
          color: isDark ? '#888' : '#666',
          fontWeight: '600',
          fontSize: 13,
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
        scheduleSection: {
          backgroundColor: isDark ? '#151515' : '#fff',
          borderRadius: 12,
          padding: 16,
          marginHorizontal: 16,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: isDark ? '#222' : '#eee',
        },
        scheduleContainer: {
          marginBottom: 16,
        },
        scheduleDay: {
          fontSize: 15,
          fontWeight: '700',
          color: '#F47521',
          marginBottom: 8,
          textAlign: 'center',
        },
        scheduleItem: {
          paddingVertical: 10,
          paddingHorizontal: 16,
        },
        scheduleItemEven: {
          backgroundColor: isDark ? '#1a1a1a' : '#f9f9f9',
        },
        scheduleItemOdd: {
          backgroundColor: isDark ? '#141414' : '#fff',
        },
        scheduleTitle: {
          fontSize: 13,
          color: isDark ? '#ccc' : '#444',
          textAlign: 'center',
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
    [isDark, theme.colors.primary, theme.colors.surfaceVariant, theme.colors.secondaryContainer, theme.colors.onSecondaryContainer],
  );
}
