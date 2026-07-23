import Icon from '@react-native-vector-icons/fontawesome';
import MaterialIcon from '@react-native-vector-icons/material-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, StackActions, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TextInput as TextInputType,
  ToastAndroid,
  TouchableOpacity as TouchableOpacityReactNative,
  View,
  ScrollView,
  useColorScheme,
  Modal,
} from 'react-native';
import { Searchbar, SegmentedButtons, Snackbar, useTheme, FAB } from 'react-native-paper';
import Reanimated, {
  FadeInRight,
  FadeInUp,
  LinearTransition,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import proTips from '../../assets/proTips.json';
import useGlobalStyles from '../../assets/style';
import { SearchAnime, listAnimeTypeList } from '../../types/anime';
import { HomeNavigator, RootStackNavigator } from '../../types/navigation';
import AnimeAPI from '../../utils/AnimeAPI';
import { DatabaseManager, useModifiedKeyValueIfFocused } from '../../utils/DatabaseManager';
import DialogManager from '../../utils/dialogManager';
import { ComicsSearch, comicsSearch } from '../../utils/scrapers/comicsv2';
import { __ALIAS as KomikuAlias, KomikuSearch, komikuSearch } from '../../utils/scrapers/komiku';
import DarkOverlay from '../misc/DarkOverlay';
import ImageLoading from '../misc/ImageLoading';
import { TouchableOpacity } from '../misc/TouchableOpacityRNGH';
import { RenderScrollComponent } from './AnimeList';
type SectionHeader = { type: 'header'; title: string };
type ComicItem = (ComicsSearch | KomikuSearch) & { source?: string };
type ComicsComboSearch = ComicItem | SectionHeader;

type AnySearchItem = SearchAnimeResult | ComicsComboSearch;

type SearchRowItem = Exclude<AnySearchItem, SectionHeader>;

const TouchableOpacityAnimated = Reanimated.createAnimatedComponent(TouchableOpacity);
const Reanimated_KeyboardAvoidingView = Reanimated.createAnimatedComponent(KeyboardAvoidingView);

type Props = CompositeScreenProps<
  BottomTabScreenProps<HomeNavigator, 'HomePage'>,
  NativeStackScreenProps<RootStackNavigator>
>;



function Search(props: Props) {
  const [isPending, startTransition] = useTransition();
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  const styles = useStyles();
  const theme = useTheme();

  const [searchType, setSearchType] = useState<'anime' | 'comics'>('anime');
  const [searchedSearchType, setSearchedSearchType] = useState(searchType);
  const textInputRef = useRef<TextInputType>(null);

  const isFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      const timeout = setTimeout(() => {
        isFocus.current = true;
      }, 200);
      const keyboardEvent = Keyboard.addListener('keyboardDidHide', () => {
        if (textInputRef.current) {
          textInputRef.current.blur();
        }
      });
      return () => {
        isFocus.current = false;
        keyboardEvent.remove();
        clearTimeout(timeout);
        setShowSearchHistory(false);
      };
    }, []),
  );

  const [searchText, setSearchText] = useState<string>('');
  const [listAnime, setListAnime] = useState<listAnimeTypeList[] | null>(null);
  const [listAnimeLoading, setListAnimeLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isRateLimit, setIsRateLimit] = useState(false);
  const [data, setData] = useState<null | SearchAnime>(null);
  const [comicsData, setComicsData] = useState<null | ComicsComboSearch[]>(null);
  const [loading, setLoading] = useState(false);
  const [currentSearchQuery, setCurrentSearchQuery] = useState<string>('');
  const [showSearchHistory, setShowSearchHistory] = useState(false);


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

  const searchHistory = useModifiedKeyValueIfFocused(
    'searchHistory',
    result => JSON.parse(result) as string[],
  );

  const abortController = useRef<AbortController | null>(null);
  abortController.current ??= new AbortController();

  const loadAnimeList = useCallback(() => {
    setListAnimeLoading(true);
    setIsError(false);
    setListAnime([]);

    AnimeAPI.listAnime(undefined, animeData => {
      startTransition(() => {
        setListAnime(animeData);
      });
    })
      .then(animeData => {
        setListAnime(animeData);
      })
      .catch(() => {
        setListAnime(null);
        setIsError(true);
        ToastAndroid.show('Gagal memuat daftar anime', ToastAndroid.SHORT);
      })
      .finally(() => {
        setListAnimeLoading(false);
      });
  }, []);

  const onChangeText = useCallback((text: string) => {
    setSearchText(text);
  }, []);

  useEffect(() => {
    if (searchType !== 'anime' || searchText.trim() === '') return;

    const timeoutId = setTimeout(() => {
      submit();
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [searchText, searchType]);

  const submit = useCallback(() => {
    const handleError = (err: Error) => {
      if (err.message.includes('Aborted') || err.message.includes('canceled')) {
        return;
      }
      if (err.message === 'Silahkan selesaikan captcha') {
        return ToastAndroid.show('Silahkan selesaikan captcha', ToastAndroid.SHORT);
      }
      const errMessage =
        err.message === 'Network Error'
          ? 'Permintaan gagal.\nPastikan kamu terhubung dengan internet'
          : 'Error tidak diketahui: ' + err.message;
      DialogManager.alert('Error', errMessage);
    };
    if (searchText === '') {
      return;
    }

    setShowSearchHistory(false);
    setLoading(true);
    textInputRef.current?.blur();

    if (searchType === 'anime') {
      Promise.allSettled([
        AnimeAPI.search(searchText, abortController.current?.signal),
      ])
        .then(([animeResponse]) => {
          setIsRateLimit(false);
          setCurrentSearchQuery(searchText);
          setComicsData(null);

          if (animeResponse.status === 'rejected') {
            if (animeResponse.reason?.name === 'SankaRateLimitError') {
              setIsRateLimit(true);
            } else {
              handleError(animeResponse.reason);
            }
          } else {
            setData(animeResponse.value);
          }
        })
        .finally(() => {
          setSearchedSearchType(searchType);
          if (searchHistory.includes(searchText)) {
            searchHistory.splice(searchHistory.indexOf(searchText), 1);
          }
          searchHistory.unshift(searchText);
          DatabaseManager.set('searchHistory', JSON.stringify(searchHistory));
          setLoading(false);
        });
    } else {
      Promise.allSettled([
        comicsSearch(searchText, abortController.current?.signal),
        komikuSearch(searchText, abortController.current?.signal),
      ])
        .then(([comicsResponse, komikuResponse]) => {
          if (comicsResponse.status === 'rejected' && komikuResponse.status === 'rejected') {
            if (abortController.current?.signal.aborted) {
              throw new Error(comicsResponse.reason);
            }
            throw new Error(comicsResponse.reason);
          }
          const comicsResult = comicsResponse.status === 'fulfilled' ? comicsResponse.value : [];
          const komikuResult = komikuResponse.status === 'fulfilled' ? komikuResponse.value : [];

          setData(null);

          const allItems: ComicItem[] = [
            ...comicsResult,
            ...komikuResult.map(res => ({ ...res, source: KomikuAlias })),
          ];

          const grouped: { [key: string]: ComicItem[] } = {};
          allItems.forEach(item => {
            const src = item.source || 'Lainnya';
            if (!grouped[src]) {
              grouped[src] = [];
            }
            grouped[src].push(item);
          });

          const sectionedData: ComicsComboSearch[] = [];
          Object.keys(grouped).forEach(key => {
            sectionedData.push({ type: 'header', title: key });
            sectionedData.push(...grouped[key]);
          });

          setComicsData(sectionedData);
        })
        .catch(handleError)
        .finally(() => {
          setSearchedSearchType(searchType);
          if (searchHistory.includes(searchText)) {
            searchHistory.splice(searchHistory.indexOf(searchText), 1);
          }
          searchHistory.unshift(searchText);
          DatabaseManager.set('searchHistory', JSON.stringify(searchHistory));
          setCurrentSearchQuery(searchText);
          setLoading(false);
        });
    }
  }, [searchHistory, searchText, searchType]);

  function renderSearchHistory({ item, index }: ListRenderItemInfo<string>) {
    const onSelectHistory = (text: string) => {
      onChangeText(text);
    };
    return <HistoryList index={index} item={item} onChangeTextFunction={onSelectHistory} />;
  }

  const listAnimeRenderer = useCallback(
    ({ index, item }: ListRenderItemInfo<listAnimeTypeList>) => {
      return (
        <TouchableOpacity
          onPress={() => {
            props.navigation.dispatch(
              StackActions.push('FromUrl', {
                title: item.title,
                link: item.streamingLink,
              }),
            );
          }}
          style={styles.animeList}>
          <Text style={[globalStyles.text, styles.animeListIndex]}>{index + 1}.</Text>
          <Text
            numberOfLines={1}
            style={[globalStyles.text, { textAlign: 'center', flex: 1, fontWeight: 'bold' }]}>
            {item?.title}
          </Text>
        </TouchableOpacity>
      );
    },
    [globalStyles.text, props.navigation, styles],
  );

  const onTextInputFocus = useCallback(() => {
    if (!isFocus.current) {
      textInputRef.current?.blur();
      isFocus.current = true;
      return;
    }
    setShowSearchHistory(true);
  }, []);

  const hasSearchResults =
    (data?.result?.length ?? 0) > 0 ||
    (comicsData && comicsData.length > 0);
  const isSearchEmpty =
    !hasSearchResults && (data !== null || comicsData !== null);
  const isLoading = listAnimeLoading || isPending;
  const showDefaultList =
    !hasSearchResults && !isSearchEmpty && listAnime !== null && listAnime.length > 0;
  const shouldShowManualLoad =
    !hasSearchResults &&
    !isLoading &&
    (listAnime === null || listAnime.length === 0) &&
    data === null &&
    comicsData === null;

  const flashListData: AnySearchItem[] = [
    ...(data?.result ?? []),
    ...(comicsData ?? []),
  ];

  return (
    <View style={[{ flex: 1 }]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          width: '100%',
        }}>
        {showSearchHistory && (
          <TouchableOpacityReactNative
            hitSlop={15}
            onPress={() => {
              setShowSearchHistory(false);
              textInputRef.current?.blur();
            }}
            style={{ paddingHorizontal: 10 }}>
            <Icon name="angle-left" size={30} color={theme.colors.primary} />
          </TouchableOpacityReactNative>
        )}
        <Reanimated.View layout={LinearTransition.springify()} style={{ flex: 1, height: 60 }}>
          <Searchbar
            onSubmitEditing={submit}
            onIconPress={submit}
            onChangeText={onChangeText}
            onFocus={onTextInputFocus}
            placeholder="Cari disini"
            value={searchText}
            autoCorrect={false}
            ref={textInputRef}
          />
        </Reanimated.View>
      </View>

      <SegmentedButtons
        style={{ marginTop: 6 }}
        value={searchType}
        onValueChange={setSearchType}
        buttons={[
          {
            value: 'anime',
            label: 'Cari anime/movie',
            icon: 'movie-search',
          },
          {
            value: 'comics',
            label: 'Cari komik',
            icon: 'book-search',
          },
        ]}
      />

      {(searchType === 'anime' || searchType === 'comics') && (
        <View style={{ marginTop: 15, marginBottom: 10, paddingHorizontal: 10 }}>
          <TouchableOpacityReactNative
            onPress={() => props.navigation.navigate('GenreSelectionScreen', { type: searchType })}
            style={{
              backgroundColor: theme.colors.elevation.level3,
              paddingVertical: 12,
              borderRadius: 12,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: theme.colors.primary,
            }}>
            <Icon name="tags" size={16} color={theme.colors.primary} style={{ marginRight: 8 }} />
            <Text style={[globalStyles.text, { fontWeight: 'bold', color: theme.colors.primary }]}>
              Jelajahi Berdasarkan Genre
            </Text>
          </TouchableOpacityReactNative>
        </View>
      )}

      {isLoading && (
        <View
          style={[
            styles.center,
            {
              flex: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 10,
            },
          ]}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={[globalStyles.text, { opacity: 0.8 }]}>Sedang mengambil data...</Text>
        </View>
      )}

      {shouldShowManualLoad && !isRateLimit && (
        <Reanimated.View entering={FadeInUp} style={styles.center}>
          <View style={styles.emptyStateContainer}>
            <Icon
              name={isError ? 'warning' : 'list-alt'}
              size={60}
              color={isError ? theme.colors.error : theme.colors.outline}
              style={{ marginBottom: 15 }}
            />
            <Text style={[globalStyles.text, styles.emptyStateTitle]}>
              {isError ? 'Gagal Memuat Data' : 'Jelajahi Anime'}
            </Text>
            <Text style={[globalStyles.text, styles.emptyStateSubtitle]}>
              {isError
                ? 'Terjadi kesalahan koneksi. Silahkan coba lagi.'
                : 'Tekan tombol di bawah untuk melihat daftar anime terbaru.'}
            </Text>

            <TouchableOpacityReactNative
              onPress={loadAnimeList}
              activeOpacity={0.7}
              style={[
                styles.loadButton,
                {
                  backgroundColor: isError
                    ? theme.colors.errorContainer
                    : theme.colors.primaryContainer,
                },
              ]}>
              <Icon
                name={isError ? 'refresh' : 'cloud-download'}
                size={18}
                color={isError ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer}
              />
              <Text
                style={[
                  globalStyles.text,
                  styles.loadButtonText,
                  {
                    color: isError
                      ? theme.colors.onErrorContainer
                      : theme.colors.onPrimaryContainer,
                  },
                ]}>
                {isError ? 'Coba Lagi' : 'Muat Daftar Anime'}
              </Text>
            </TouchableOpacityReactNative>
          </View>
        </Reanimated.View>
      )}

      {isRateLimit && (
        <Reanimated.View entering={FadeInUp} style={styles.center}>
          <TouchableOpacityReactNative
             onPress={submit}
             style={{ alignItems: 'center', backgroundColor: '#f39c1225', padding: 25, borderRadius: 15, marginHorizontal: 20 }}>
            <MaterialIcon name="hourglass-empty" size={50} color="#f39c12" />
            <Text style={[globalStyles.text, styles.emptyStateTitle, { color: '#f39c12', marginTop: 15 }]}>
              Server Sedang Antre
            </Text>
            <Text style={[globalStyles.text, styles.emptyStateSubtitle, { color: '#f39c12' }]}>
              Banyak pengguna yang sedang mengakses server. Santai sejenak lalu ketuk kotak ini untuk mencoba lagi.
            </Text>
          </TouchableOpacityReactNative>
        </Reanimated.View>
      )}

      {showDefaultList && (
        <View style={{ flex: 1 }}>
          <Text
            style={[globalStyles.text, { textAlign: 'center', marginTop: 10, fontWeight: 'bold' }]}>
            Total anime: {listAnime?.length} (belum termasuk movie)
          </Text>

          <FlashList
        estimatedItemSize={200}
            data={listAnime}
            renderItem={listAnimeRenderer}
            ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
            keyExtractor={item => item.title}
            extraData={styles}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        </View>
      )}

      {(hasSearchResults || isSearchEmpty) && (
        <>
          <Text
            style={[
              globalStyles.text,
              { fontWeight: 'bold', fontSize: 13, marginVertical: 2, textAlign: 'center' },
            ]}>
            {isSearchEmpty
              ? 'Tidak ada hasil pencarian yang ditemukan!'
              : `Hasil pencarian untuk: ${currentSearchQuery}`}
          </Text>

          {isSearchEmpty && (
            <Reanimated.View entering={FadeInUp} style={styles.center}>
              <View style={styles.emptyStateContainer}>
                <Icon
                  name="search-minus"
                  size={60}
                  color={theme.colors.outline}
                  style={{ marginBottom: 15 }}
                />
                <Text style={[globalStyles.text, styles.emptyStateTitle]}>
                  Hasil tidak ditemukan
                </Text>
                <Text style={[globalStyles.text, styles.emptyStateSubtitle]}>
                  Coba periksa kembali kata kunci pencarianmu atau gunakan kata kunci lain yang
                  lebih umum.
                </Text>
                <View style={{ alignItems: 'flex-start' }}>
                  {proTips[searchedSearchType].map(proTip => (
                    <Text style={[globalStyles.text, styles.proTip]} key={proTip}>
                      <Icon name="lightbulb-o" size={12} color={theme.colors.primary} /> {proTip}
                    </Text>
                  ))}
                </View>
              </View>
            </Reanimated.View>
          )}

          {hasSearchResults && (
            <FlashList
        estimatedItemSize={200}
              renderScrollComponent={RenderScrollComponent}
              ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
              data={flashListData}
              getItemType={item => {
                if ('type' in item && item.type === 'header') {
                  return 'sectionHeader';
                }
                return 'row';
              }}
              keyExtractor={(item, index) => {
                if ('type' in item && item.type === 'header') {
                  return `header-${item.title}-${index}`;
                }
                return String(index);
              }}
              renderItem={({ item: z }) => <SearchList item={z} parentProps={props} />}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          )}
        </>
      )}

      {showSearchHistory && (
        <Reanimated_KeyboardAvoidingView
          behavior="height"
          entering={ZoomIn.springify().withInitialValues({ transform: [{ scale: 0.5 }] })}
          exiting={ZoomOut.springify()}
          style={styles.searchHistoryContainer}>
          <View style={{ flex: 1 }}>
            <SegmentedButtons
              value={searchType}
              onValueChange={setSearchType}
              buttons={[
                {
                  value: 'anime',
                  label: 'Cari anime/movie',
                  icon: 'movie-search',
                },
                {
                  value: 'comics',
                  label: 'Cari komik',
                  icon: 'book-search',
                },
              ]}
            />
            <FlashList
        estimatedItemSize={200}
              drawDistance={250}
              keyboardShouldPersistTaps="always"
              contentContainerStyle={styles.searchHistoryScrollBox}
              data={searchHistory}
              keyExtractor={searchHistoryKeyExtractor}
              extraData={styles}
              renderItem={renderSearchHistory}
              ItemSeparatorComponent={() => (
                <View
                  pointerEvents="none"
                  style={{
                    borderBottomWidth: 0.5,
                    borderColor: colorScheme === 'dark' ? 'gray' : 'black',
                    width: '100%',
                  }}
                />
              )}
              ListHeaderComponent={() => (
                <View>
                  <View style={styles.searchHistoryHeader}>
                    <Text
                      style={[
                        globalStyles.text,
                        { fontWeight: 'bold', flex: 1, textAlign: 'center', marginRight: 25 },
                      ]}>
                      Riwayat Pencarian: {searchHistory.length}
                    </Text>
                  </View>
                </View>
              )}
            />
          </View>
        </Reanimated_KeyboardAvoidingView>
      )}
      {(data !== null || comicsData !== null) && !loading && (
        <TouchableOpacityAnimated
          style={styles.closeSearchResult}
          onPress={() => {
            setData(null);
            setComicsData(null);
          }}
          entering={ZoomIn}
          exiting={ZoomOut}>
          <Icon name="times" size={30} style={{ alignSelf: 'center' }} color="#dadada" />
        </TouchableOpacityAnimated>
      )}
      <Snackbar
        style={{ zIndex: 2, position: 'absolute', bottom: 0, alignSelf: 'center' }}
        visible={loading}
        onDismiss={() => {
          setLoading(false);
        }}
        action={{
          label: 'Batal',
          onPress: () => {
            abortController.current?.abort();
            abortController.current = new AbortController();
          },
        }}
        duration={Infinity}>
        Memuat data...
      </Snackbar>
    </View>
  );
}

function HistoryList({
  index,
  item,
  onChangeTextFunction,
}: {
  index: number;
  item: string;
  onChangeTextFunction: (text: string) => void;
}) {
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const styles = useStyles();
  return (
    <View
      style={styles.searchHistoryItemContainer}
      pointerEvents="box-none"
      onStartShouldSetResponder={() => true}>
      <TouchableOpacityReactNative
        style={[
          {
            padding: 6,
            flexDirection: 'row',
            justifyContent: 'space-between',
            minHeight: 40,
          },
        ]}
        onPress={() => {
          onChangeTextFunction(item);
        }}>
        <View
          style={{ justifyContent: 'center', alignItems: 'center', flex: 1, flexDirection: 'row' }}>
          <Icon name="history" size={20} color={theme.colors.tertiary} />
          <Text style={[globalStyles.text, { fontWeight: 'bold', flex: 1, textAlign: 'center' }]}>
            {item}
          </Text>
        </View>
        <TouchableOpacityReactNative
          hitSlop={14}
          onPress={async () => {
            DatabaseManager.set(
              'searchHistory',
              JSON.stringify(
                (
                  JSON.parse((await DatabaseManager.get('searchHistory')) ?? '[]') as string[]
                ).filter((_, i) => i !== index),
              ),
            );
          }}>
          <Icon name="times" size={25} color="#ff0f0f" />
        </TouchableOpacityReactNative>
      </TouchableOpacityReactNative>
    </View>
  );
}

type SearchAnimeResult = SearchAnime['result'][number];

function SearchList({ item: z, parentProps: props }: { item: AnySearchItem; parentProps: Props }) {
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const styles = useStyles();

  if ('type' in z && z.type === 'header') {
    return (
      <View style={styles.sectionHeaderContainer}>
        <View style={styles.sectionHeaderLine} />
        <Text style={[globalStyles.text, styles.sectionHeaderText]}>
          <Icon name="globe" size={14} color={theme.colors.secondary} /> {z.title.toUpperCase()}
        </Text>
        <View style={styles.sectionHeaderLine} />
      </View>
    );
  }
  const item = z as SearchRowItem;

  const isComic = (data: SearchRowItem): data is ComicItem => {
    return 'additionalInfo' in data;
  };

  const isAnime = (data: SearchRowItem): data is SearchAnimeResult => {
    return 'animeUrl' in data;
  };

  return (
    <TouchableOpacityAnimated
      entering={FadeInRight}
      style={[styles.listContainer, { minHeight: 100 }]}
      onPress={() => {
        if (!isComic(item) && !isAnime(item)) return;

        props.navigation.dispatch(
          StackActions.push('FromUrl', {
            title: item.title,
            link: isComic(item)
                  ? item.detailUrl
                  : item.animeUrl,
            type: isComic(item)
                  ? 'comics'
                  : 'anime',
          }),
        );
      }}>
      <ImageLoading
        resizeMode="cover"
        source={{ uri: item.thumbnailUrl }}
        style={[
          styles.listImage,
          isComic(item) && 'concept' in item ? { width: 150, height: 'auto' } : undefined,
        ]}>
        {isComic(item) && (
          <View
            style={{
              position: 'absolute',
              top: 5,
              right: 5,
              backgroundColor: '#0000009d',
              padding: 5,
              borderRadius: 8,
            }}>
            <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
              {item.latestChapter}
            </Text>
          </View>
        )}
      </ImageLoading>

      <ImageLoading
        displayLoading={false}
        source={{ uri: item.thumbnailUrl }}
        blurRadius={5}
        style={{ flex: 1 }}>
        <DarkOverlay transparent={0.8} />
        <View style={{ flexDirection: 'row', flex: 1 }}>
          <View style={styles.ratingInfo}>
            {isAnime(item) && (
                <Text style={[globalStyles.text, styles.animeSearchListDetailText]}>
                  <Icon name="star" color="gold" /> {item.rating}
                </Text>
              )}
          </View>
          <View style={{ flexDirection: 'column', marginRight: 5, marginTop: 5 }}>
            <View
              style={[
                styles.statusInfo,
                {
                  backgroundColor:
                    isAnime(item) && item.status === 'Ongoing'
                      ? '#920000'
                      : '#006600',
                },
              ]}>
              <Text style={[globalStyles.text, styles.animeSearchListDetailText]}>
                {isComic(item) ? item.type : item.status}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.listTitle]}>
          <Text
            numberOfLines={4}
            style={[{ flexShrink: 1 }, [globalStyles.text, styles.animeSearchListDetailText]]}>
            {item?.title}
          </Text>
        </View>

        <View style={styles.releaseInfo}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              <View
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.445)',
                  paddingHorizontal: 6,
                  paddingVertical: 3,
                  borderRadius: 5,
                }}>
                <Text
                  style={[
                    globalStyles.text,
                    styles.animeSearchListDetailText,
                    {
                      fontSize: 14,
                    },
                  ]}
                  numberOfLines={1}>
                  <Icon name="tags" color={styles.animeSearchListDetailText.color} />{' '}
                  {isAnime(item)
                    ? item.genres.join(', ')
                    : (item as any).concept || (item as any).status}
                </Text>
              </View>
            {isComic(item) && (
              <View
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.445)',
                  paddingHorizontal: 6,
                  paddingVertical: 3,
                  borderRadius: 5,
                }}>
                <Text
                  style={[
                    globalStyles.text,
                    styles.animeSearchListDetailText,
                    {
                      fontSize: 14,
                    },
                  ]}
                  numberOfLines={1}>
                  <Icon name="info" color={styles.animeSearchListDetailText.color} />{' '}
                  {item.additionalInfo}
                </Text>
              </View>
            )}

            {isComic(item) && item.source && (
              <View
                style={{
                  backgroundColor: theme.colors.tertiaryContainer,
                  paddingHorizontal: 6,
                  paddingVertical: 3,
                  borderRadius: 5,
                }}>
                <Text
                  style={[
                    globalStyles.text,
                    styles.animeSearchListDetailText,
                    {
                      fontSize: 12,
                      color: theme.colors.onTertiaryContainer,
                    },
                  ]}
                  numberOfLines={1}>
                  <Icon name="globe" color={theme.colors.onTertiaryContainer} />{' '}
                  {item.source.toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ImageLoading>
    </TouchableOpacityAnimated>
  );
}

function searchHistoryKeyExtractor(name: string, index: number) {
  return name + String(index);
}

function useStyles() {
  const globalStyles = useGlobalStyles();
  const theme = useTheme();
  const colorScheme = useColorScheme();
  return useMemo(
    () =>
      StyleSheet.create({
        center: {
          justifyContent: 'center',
          alignItems: 'center',
          flex: 1,
        },
        emptyStateContainer: {
          alignItems: 'center',
          paddingHorizontal: 40,
        },
        emptyStateTitle: {
          fontSize: 20,
          fontWeight: 'bold',
          marginBottom: 8,
          textAlign: 'center',
        },
        emptyStateSubtitle: {
          fontSize: 14,
          textAlign: 'center',
          opacity: 0.6,
          marginBottom: 24,
        },
        proTip: {
          fontSize: 13,
          fontStyle: 'italic',
          opacity: 0.8,
          marginBottom: 4,
        },
        loadButton: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 24,
          borderRadius: 25,
          elevation: 2,
        },
        loadButtonText: {
          fontWeight: 'bold',
          marginLeft: 10,
          fontSize: 15,
        },
        nullDataText: {
          color: globalStyles.text.color,
          fontWeight: 'bold',
          fontSize: 17,
        },
        loadingView: {
          position: 'absolute',
          bottom: 10,
          left: 0,
          right: 0,
          justifyContent: 'center',
          alignItems: 'center',
        },
        loadingText: {
          fontWeight: 'bold',
          color: colorScheme === 'dark' ? '#53c412' : 'black',
          backgroundColor: colorScheme === 'dark' ? '#1d1d1d' : '#f0f0f0',
          padding: 12,
          zIndex: 2,
          borderRadius: 12,
          borderColor: colorScheme === 'dark' ? '#53c412' : 'black',
          borderWidth: 1.3,
        },
        animeList: {
          justifyContent: 'center',
          paddingVertical: 10,
          flexDirection: 'row',
          backgroundColor: colorScheme === 'dark' ? '#1d1d1d' : '#f5f5f5',
          marginHorizontal: 16,
          borderRadius: 12,
          elevation: 2,
        },
        animeListIndex: {
          marginLeft: 4,
          fontWeight: 'bold',
          fontSize: 12,
          color: theme.colors.onPrimaryContainer,
        },
        animeSearchListDetailText: {
          fontWeight: 'bold',
          color: 'white',
        },
        listContainer: {
          flexDirection: 'row',
          backgroundColor: colorScheme === 'dark' ? '#333' : '#fff',
          borderRadius: 16,
          elevation: 4,
        },
        listImage: {
          width: 80,
          height: 150,
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 16,
        },
        listTitle: {
          flexShrink: 1,
          paddingHorizontal: 5,
          justifyContent: 'center',
          flex: 1,
          marginLeft: 5,
        },
        ratingInfo: {
          flex: 1,
        },
        statusInfo: {
          padding: 4,
          borderRadius: 6,
        },
        synopsisFilmText: {
          color: 'gray',
          fontWeight: 'bold',
        },
        releaseInfo: {
          justifyContent: 'flex-end',
          flex: 1,
        },
        searchHistoryHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          padding: 8,
          backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f0f0f0',
          borderRadius: 7,
          marginBottom: 5,
        },
        searchHistoryContainer: {
          position: 'absolute',
          top: 60,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10,
          backgroundColor: colorScheme === 'dark' ? '#121212' : '#fafafa',
          padding: 10,
          elevation: 5,
        },
        searchHistoryScrollBox: {
          backgroundColor: colorScheme === 'dark' ? '#1e1e1e' : '#f8f8f8',
          padding: 4,
        },
        searchHistoryItemContainer: {
          backgroundColor: colorScheme === 'light' ? '#e3e5e6' : '#252525',
          borderRadius: 9,
          marginVertical: 3,
        },
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
          color: theme.colors.primary,
        },
        sectionHeaderLine: {
          flex: 1,
          height: 1,
          backgroundColor: theme.colors.outlineVariant,
        },
      }),
    [globalStyles.text.color, colorScheme, theme],
  );
}

export default memo(Search);
