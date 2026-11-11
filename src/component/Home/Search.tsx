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
import { tSync, useLanguage } from '../../misc/LanguageContext';
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

const ListSeparator10 = () => <View style={{ height: 10 }} />;
const ListSeparator4 = () => <View style={{ height: 4 }} />;

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
  const { t } = useLanguage();

  const [searchType, setSearchType] = useState<'anime' | 'comics' | 'donghua'>('anime');
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
  const isDark = colorScheme === 'dark';

  const searchHistory = useModifiedKeyValueIfFocused(
    'searchHistory',
    result => {
      try {
        const parsed = JSON.parse(result);
        return Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        return [];
      }
    },
    [] as string[],
  );

  const proTipKeys = useMemo(() => {
    if (searchedSearchType === 'comics') {
      return ['search.proTipComics0'] as const;
    }
    if (searchedSearchType === 'donghua') {
      return ['search.proTipDonghua0', 'search.proTipDonghua1'] as const;
    }
    return ['search.proTipAnime0', 'search.proTipAnime1'] as const;
  }, [searchedSearchType]);

  const handleQuickSearch = useCallback((keyword: string) => {
    setSearchText(keyword);
    textInputRef.current?.blur();
  }, []);

  const clearAllHistory = useCallback(async () => {
    await DatabaseManager.set('searchHistory', JSON.stringify([]));
  }, []);

  const removeHistoryItem = useCallback(
    async (index: number) => {
      const updated = (searchHistory || []).filter((_, i) => i !== index);
      await DatabaseManager.set('searchHistory', JSON.stringify(updated));
    },
    [searchHistory],
  );

  const popularSuggestions = useMemo(() => {
    if (searchType === 'comics') {
      return [
        'Solo Leveling',
        'Lookism',
        'Omniscient Reader',
        'Magic Emperor',
        'Return of Mount Hua',
        'Tower of God',
        'Wind Breaker',
      ];
    }
    return [
      'One Piece',
      'Solo Leveling',
      'Jujutsu Kaisen',
      'Demon Slayer',
      'Naruto',
      'Bleach',
      'Wind Breaker',
      'Chainsaw Man',
      'Kaiju No. 8',
    ];
  }, [searchType]);

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
      .catch(e => {
        setListAnime(null);
        setIsError(true);
        ToastAndroid.show(
          tSync('search.loadListFailed', { message: e?.message || tSync('common.unknown') }),
          ToastAndroid.SHORT,
        );
      })
      .finally(() => {
        setListAnimeLoading(false);
      });
  }, []);

  const onChangeText = useCallback((text: string) => {
    setSearchText(text);
  }, []);

  useEffect(() => {
    if (searchText.trim() === '') return;

    const timeoutId = setTimeout(() => {
      submit();
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [searchText, searchType]);

  const submit = useCallback(() => {
    const handleError = (err: any) => {
      const msg = err?.message ? err.message : (typeof err === 'string' ? err : String(err));
      if (msg.includes('Aborted') || msg.includes('canceled')) {
        return;
      }
      if (msg === 'Silahkan selesaikan captcha') {
        return ToastAndroid.show(tSync('search.solveCaptcha'), ToastAndroid.SHORT);
      }
      const errMessage =
        msg === 'Network Error'
          ? tSync('settings.errorNetwork')
          : tSync('player.unknownError', { message: msg });
      DialogManager.alert(tSync('common.error'), errMessage);
    };
    if (searchText === '') {
      return;
    }

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
          const nextHistory = [
            searchText,
            ...(searchHistory || []).filter(item => item !== searchText),
          ];
          DatabaseManager.set('searchHistory', JSON.stringify(nextHistory));
          setLoading(false);
        });
    } else if (searchType === 'donghua') {
      Promise.allSettled([
        Promise.resolve({ result: [] as any }),
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
          const nextHistory = [
            searchText,
            ...(searchHistory || []).filter(item => item !== searchText),
          ];
          DatabaseManager.set('searchHistory', JSON.stringify(nextHistory));
          setLoading(false);
        });
    } else {
      Promise.allSettled([
        comicsSearch(searchText, abortController.current?.signal),
        komikuSearch(searchText, abortController.current?.signal),
      ])
        .then(([comicsResponse, komikuResponse]) => {
          if (comicsResponse.status === 'rejected' && komikuResponse.status === 'rejected') {
            throw new Error(comicsResponse.reason?.message || String(comicsResponse.reason || 'Error'));
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
            const src = item.source || tSync('search.othersGroup');
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
          const nextHistory = [
            searchText,
            ...(searchHistory || []).filter(item => item !== searchText),
          ];
          DatabaseManager.set('searchHistory', JSON.stringify(nextHistory));
          setCurrentSearchQuery(searchText);
          setLoading(false);
        });
    }
  }, [searchHistory, searchText, searchType]);

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
    }
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
    <View style={[{ flex: 1, backgroundColor: isDark ? '#09090b' : '#f8fafc' }]}>
      <View style={styles.searchHeaderWrap}>
        <View style={styles.searchBarRow}>
          <View style={{ flex: 1 }}>
            <Searchbar
              onSubmitEditing={submit}
              onIconPress={submit}
              onChangeText={onChangeText}
              onFocus={onTextInputFocus}
              onClearIconPress={() => {
                setSearchText('');
                setData(null);
                setComicsData(null);
              }}
              placeholder={searchType === 'comics' ? t('search.placeholderComics') : t('search.placeholderAnime')}
              value={searchText}
              autoCorrect={false}
              ref={textInputRef}
              style={styles.searchbarStyle}
              inputStyle={styles.searchbarInputStyle}
              iconColor={isDark ? '#a1a1aa' : '#64748b'}
              placeholderTextColor={isDark ? '#71717a' : '#94a3b8'}
            />
          </View>
        </View>

        <View style={styles.filterPillsRow}>
          <TouchableOpacityReactNative
            style={[styles.filterPill, searchType === 'anime' && styles.filterPillActive]}
            onPress={() => setSearchType('anime')}>
            <Icon
              name="film"
              size={12}
              color={searchType === 'anime' ? '#fff' : isDark ? '#9ca3af' : '#6b7280'}
            />
            <Text
              style={[
                styles.filterPillText,
                searchType === 'anime' && styles.filterPillTextActive,
              ]}>
              {t('search.filterAnime')}
            </Text>
          </TouchableOpacityReactNative>

          <TouchableOpacityReactNative
            style={[styles.filterPill, searchType === 'comics' && styles.filterPillActive]}
            onPress={() => setSearchType('comics')}>
            <Icon
              name="book"
              size={12}
              color={searchType === 'comics' ? '#fff' : isDark ? '#9ca3af' : '#6b7280'}
            />
            <Text
              style={[
                styles.filterPillText,
                searchType === 'comics' && styles.filterPillTextActive,
              ]}>
              {t('search.filterComics')}
            </Text>
          </TouchableOpacityReactNative>

          <TouchableOpacityReactNative
            style={styles.genreFilterPill}
            onPress={() => props.navigation.navigate('GenreSelectionScreen', { type: searchType === 'comics' ? 'comics' : 'anime' })}>
            <Icon name="tags" size={12} color="#3b82f6" />
            <Text style={styles.genreFilterPillText}>{t('search.filterGenre')}</Text>
          </TouchableOpacityReactNative>
        </View>
      </View>

      {isLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={[globalStyles.text, { fontSize: 13, opacity: 0.8 }]}>
            {t('search.loadingData')}
          </Text>
        </View>
      )}

      {shouldShowManualLoad && !isRateLimit && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled">
          {searchHistory.length > 0 && (
            <View style={styles.idleSection}>
              <View style={styles.idleSectionHeader}>
                <Text style={styles.idleSectionTitle}>{t('search.recentTitle')}</Text>
                <TouchableOpacityReactNative onPress={clearAllHistory} hitSlop={10}>
                  <Text style={styles.clearAllText}>{t('search.clearRecent')}</Text>
                </TouchableOpacityReactNative>
              </View>
              <View style={styles.chipsWrap}>
                {searchHistory.slice(0, 8).map((keyword, idx) => (
                  <View key={keyword + idx} style={styles.historyChip}>
                    <TouchableOpacityReactNative
                      onPress={() => handleQuickSearch(keyword)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Icon name="history" size={11} color={isDark ? '#9ca3af' : '#6b7280'} />
                      <Text style={styles.historyChipText} numberOfLines={1}>{keyword}</Text>
                    </TouchableOpacityReactNative>
                    <TouchableOpacityReactNative
                      onPress={() => removeHistoryItem(idx)}
                      hitSlop={8}
                      style={{ marginLeft: 6 }}>
                      <Icon name="times" size={12} color={isDark ? '#6b7280' : '#9ca3af'} />
                    </TouchableOpacityReactNative>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.idleSection}>
            <View style={styles.idleSectionHeader}>
              <Text style={styles.idleSectionTitle}>{t('search.popularTrending')}</Text>
            </View>
            <View style={styles.chipsWrap}>
              {popularSuggestions.map(title => (
                <TouchableOpacityReactNative
                  key={title}
                  style={styles.trendingChip}
                  onPress={() => handleQuickSearch(title)}>
                  <Icon name="fire" size={12} color="#f59e0b" />
                  <Text style={styles.trendingChipText}>{title}</Text>
                </TouchableOpacityReactNative>
              ))}
            </View>
          </View>

          <View style={styles.idleSection}>
            <View style={styles.browseBanner}>
              <Icon name={isError ? 'exclamation-circle' : 'compass'} size={24} color="#3b82f6" />
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <Text style={styles.browseBannerTitle}>
                  {isError ? t('search.loadErrorTitle') : t('search.browseCatalogTitle')}
                </Text>
                <Text style={styles.browseBannerSub}>
                  {isError ? t('search.loadErrorSub') : t('search.browseCatalogSub')}
                </Text>
              </View>
              <TouchableOpacityReactNative
                style={styles.browseButton}
                onPress={loadAnimeList}>
                <Text style={styles.browseButtonText}>{isError ? t('common.retry') : t('common.open')}</Text>
              </TouchableOpacityReactNative>
            </View>
          </View>
        </ScrollView>
      )}

      {isRateLimit && (
        <Reanimated.View entering={FadeInUp} style={styles.center}>
          <TouchableOpacityReactNative
            onPress={submit}
            style={styles.rateLimitCard}>
            <MaterialIcon name="hourglass-empty" size={44} color="#f59e0b" />
            <Text style={styles.rateLimitTitle}>
              {t('search.rateLimitTitle')}
            </Text>
            <Text style={styles.rateLimitSub}>
              {t('search.rateLimitSub')}
            </Text>
          </TouchableOpacityReactNative>
        </Reanimated.View>
      )}

      {showDefaultList && (
        <View style={{ flex: 1 }}>
          <View style={styles.resultCounterBar}>
            <Text style={styles.resultCounterText}>
              {t('search.totalAnimeAvailable', { count: listAnime?.length ?? 0 })}
            </Text>
          </View>

          <FlashList
            data={listAnime}
            drawDistance={350}
            renderItem={listAnimeRenderer}
            ItemSeparatorComponent={ListSeparator4}
            keyExtractor={(item, idx) => item.streamingLink || item.title || String(idx)}
            extraData={styles}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        </View>
      )}

      {(hasSearchResults || isSearchEmpty) && (
        <>
          <View style={styles.resultCounterBar}>
            <Text style={styles.resultCounterText} numberOfLines={1}>
              {isSearchEmpty
                ? t('search.noResultsFor', { query: currentSearchQuery })
                : t('search.resultsForCount', { count: flashListData.length, query: currentSearchQuery })}
            </Text>
            <TouchableOpacityReactNative
              onPress={() => {
                setData(null);
                setComicsData(null);
                setSearchText('');
              }}
              style={styles.clearResultButton}>
              <Icon name="times-circle" size={13} color={isDark ? '#a1a1aa' : '#64748b'} />
              <Text style={styles.clearResultText}>{t('common.reset')}</Text>
            </TouchableOpacityReactNative>
          </View>

          {isSearchEmpty && (
            <Reanimated.View entering={FadeInUp} style={styles.center}>
              <View style={styles.emptyStateContainer}>
                <Icon
                  name="search-minus"
                  size={50}
                  color={theme.colors.outline}
                  style={{ marginBottom: 12 }}
                />
                <Text style={[globalStyles.text, styles.emptyStateTitle]}>
                  {t('search.noResultsTitle')}
                </Text>
                <Text style={[globalStyles.text, styles.emptyStateSubtitle]}>
                  {t('search.noResultsHint')}
                </Text>
                <View style={{ alignItems: 'flex-start' }}>
                  {proTipKeys.map(tipKey => (
                    <Text style={[globalStyles.text, styles.proTip]} key={tipKey}>
                      <Icon name="lightbulb-o" size={12} color="#3b82f6" /> {t(tipKey)}
                    </Text>
                  ))}
                </View>
              </View>
            </Reanimated.View>
          )}

          {hasSearchResults && (
            <FlashList
              renderScrollComponent={RenderScrollComponent}
              ItemSeparatorComponent={ListSeparator10}
              drawDistance={350}
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
                if ('animeUrl' in item && item.animeUrl) {
                  return item.animeUrl;
                }
                if ('detailUrl' in item && item.detailUrl) {
                  return item.detailUrl;
                }
                return `${item.title || 'item'}-${index}`;
              }}
              renderItem={({ item: z }) => (
                <SearchList
                  item={z}
                  navigation={props.navigation}
                  styles={styles}
                  primaryColor={theme.colors.primary}
                />
              )}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 30 }}
            />
          )}
        </>
      )}

      {(data !== null || comicsData !== null) && !loading && (
        <TouchableOpacityAnimated
          style={styles.closeSearchResult}
          onPress={() => {
            setData(null);
            setComicsData(null);
            setSearchText('');
          }}
          entering={ZoomIn}
          exiting={ZoomOut}>
          <Icon name="times" size={20} style={{ alignSelf: 'center' }} color="#ffffff" />
        </TouchableOpacityAnimated>
      )}
      <Snackbar
        style={{ zIndex: 2, position: 'absolute', bottom: 0, alignSelf: 'center' }}
        visible={loading}
        onDismiss={() => {
          setLoading(false);
        }}
        action={{
          label: t('common.cancel'),
          onPress: () => {
            abortController.current?.abort();
            abortController.current = new AbortController();
          },
        }}
        duration={Infinity}>
        {t('common.loading')}
      </Snackbar>
    </View>
  );
}

type SearchAnimeResult = SearchAnime['result'][number];

const SearchList = memo(function SearchList({
  item: z,
  navigation,
  styles,
  primaryColor,
}: {
  item: AnySearchItem;
  navigation: Props['navigation'];
  styles: ReturnType<typeof useStyles>;
  primaryColor: string;
}) {
  if ('type' in z && z.type === 'header') {
    return (
      <View style={styles.sectionHeaderContainer}>
        <View style={styles.sectionHeaderLine} />
        <Text style={styles.sectionHeaderText}>
          <Icon name="globe" size={13} color={primaryColor} /> {z.title.toUpperCase()}
        </Text>
        <View style={styles.sectionHeaderLine} />
      </View>
    );
  }
  const item = z as SearchRowItem;

  const isComic = (dataItem: SearchRowItem): dataItem is ComicItem => {
    return 'additionalInfo' in dataItem;
  };

  const isAnime = (dataItem: SearchRowItem): dataItem is SearchAnimeResult => {
    return 'animeUrl' in dataItem;
  };

  const isOngoing = isAnime(item) && item.status?.toLowerCase().includes('ongoing');

  return (
    <TouchableOpacity
      style={styles.cardContainer}
      onPress={() => {
        if (!isComic(item) && !isAnime(item)) return;

        navigation.dispatch(
          StackActions.push('FromUrl', {
            title: item.title,
            link: isComic(item) ? item.detailUrl : item.animeUrl,
            type: isComic(item) ? 'comics' : 'anime',
            thumbnailUrl: item.thumbnailUrl,
          }),
        );
      }}>
      <View style={styles.cardPosterWrap}>
        <ImageLoading
          resizeMode="cover"
          source={{ uri: item.thumbnailUrl }}
          fallbackSearchTitle={item.title}
          style={styles.cardPoster}
        />
        {isComic(item) && item.latestChapter ? (
          <View style={styles.chapterBadge}>
            <Text style={styles.chapterBadgeText}>{item.latestChapter}</Text>
          </View>
        ) : null}
        {isAnime(item) && item.rating && item.rating !== '?' && item.rating !== 'N/A' && (
          <View style={styles.cardRatingBadge}>
            <Icon name="star" size={10} color="#f59e0b" style={{ marginRight: 3 }} />
            <Text style={styles.cardRatingText}>{item.rating}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardContent}>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {item.title}
        </Text>

        <View style={styles.cardBadgesRow}>
          {isAnime(item) && item.status ? (
            <View
              style={[
                styles.cardStatusBadge,
                {
                  backgroundColor: isOngoing
                    ? 'rgba(59, 130, 246, 0.15)'
                    : 'rgba(34, 197, 94, 0.15)',
                },
              ]}>
              <Text
                style={[
                  styles.cardStatusText,
                  { color: isOngoing ? '#3b82f6' : '#22c55e' },
                ]}>
                {item.status}
              </Text>
            </View>
          ) : isComic(item) && item.type ? (
            <View style={[styles.cardStatusBadge, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
              <Text style={[styles.cardStatusText, { color: '#3b82f6' }]}>{item.type}</Text>
            </View>
          ) : null}

          {isComic(item) && item.source ? (
            <View style={styles.cardSourceBadge}>
              <Text style={styles.cardSourceText}>{item.source.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardTagsRow}>
          {isAnime(item) && item.genres && item.genres.length > 0 ? (
            item.genres.slice(0, 3).map(genre => (
              <View key={genre} style={styles.cardTagPill}>
                <Text style={styles.cardTagText} numberOfLines={1}>
                  {genre}
                </Text>
              </View>
            ))
          ) : isComic(item) && (item as any).concept ? (
            <View style={styles.cardTagPill}>
              <Text style={styles.cardTagText} numberOfLines={1}>
                {(item as any).concept}
              </Text>
            </View>
          ) : null}
        </View>

        {isComic(item) && item.additionalInfo ? (
          <Text style={styles.cardAdditionalInfo} numberOfLines={1}>
            {item.additionalInfo}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

function useStyles() {
  const globalStyles = useGlobalStyles();
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return useMemo(
    () =>
      StyleSheet.create({
        center: {
          justifyContent: 'center',
          alignItems: 'center',
          flex: 1,
        },
        searchHeaderWrap: {
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: isDark ? '#09090b' : '#ffffff',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: isDark ? '#27272a' : '#e2e8f0',
        },
        searchBarRow: {
          flexDirection: 'row',
          alignItems: 'center',
        },
        searchbarStyle: {
          borderRadius: 12,
          backgroundColor: isDark ? '#18181b' : '#f1f5f9',
          elevation: 0,
          height: 46,
        },
        searchbarInputStyle: {
          minHeight: 0,
          fontSize: 14,
          alignSelf: 'center',
          color: isDark ? '#f4f4f6' : '#0f172a',
        },
        filterPillsRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 10,
        },
        filterPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 7,
          borderRadius: 20,
          backgroundColor: isDark ? '#18181b' : '#f1f5f9',
          borderWidth: 1,
          borderColor: isDark ? '#27272a' : '#e2e8f0',
        },
        filterPillActive: {
          backgroundColor: '#3b82f6',
          borderColor: '#3b82f6',
        },
        filterPillText: {
          fontSize: 12,
          fontWeight: '600',
          color: isDark ? '#a1a1aa' : '#64748b',
        },
        filterPillTextActive: {
          color: '#ffffff',
        },
        genreFilterPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 7,
          borderRadius: 20,
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          borderWidth: 1,
          borderColor: 'rgba(59, 130, 246, 0.3)',
        },
        genreFilterPillText: {
          fontSize: 12,
          fontWeight: '700',
          color: '#3b82f6',
        },
        loadingRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 14,
        },
        idleSection: {
          marginBottom: 22,
        },
        idleSectionHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        },
        idleSectionTitle: {
          fontSize: 13,
          fontWeight: '700',
          color: isDark ? '#a1a1aa' : '#64748b',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        clearAllText: {
          fontSize: 12,
          fontWeight: '600',
          color: '#ef4444',
        },
        chipsWrap: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        historyChip: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isDark ? '#18181b' : '#ffffff',
          borderWidth: 1,
          borderColor: isDark ? '#27272a' : '#e2e8f0',
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 20,
        },
        historyChipText: {
          fontSize: 12,
          color: isDark ? '#f4f4f6' : '#0f172a',
          maxWidth: 160,
        },
        trendingChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: isDark ? '#18181b' : '#ffffff',
          borderWidth: 1,
          borderColor: isDark ? '#27272a' : '#e2e8f0',
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 20,
        },
        trendingChipText: {
          fontSize: 12,
          fontWeight: '500',
          color: isDark ? '#f4f4f6' : '#0f172a',
        },
        browseBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isDark ? '#18181b' : '#ffffff',
          padding: 16,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isDark ? '#27272a' : '#e2e8f0',
        },
        browseBannerTitle: {
          fontSize: 14,
          fontWeight: '700',
          color: isDark ? '#f4f4f6' : '#0f172a',
        },
        browseBannerSub: {
          fontSize: 12,
          color: isDark ? '#a1a1aa' : '#64748b',
          marginTop: 2,
        },
        browseButton: {
          backgroundColor: '#3b82f6',
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 8,
        },
        browseButtonText: {
          color: '#ffffff',
          fontSize: 12,
          fontWeight: '700',
        },
        rateLimitCard: {
          alignItems: 'center',
          backgroundColor: isDark ? '#252014' : '#fffbeb',
          padding: 22,
          borderRadius: 16,
          marginHorizontal: 20,
          borderWidth: 1,
          borderColor: isDark ? '#453818' : '#fde68a',
        },
        rateLimitTitle: {
          fontSize: 16,
          fontWeight: '700',
          color: '#f59e0b',
          marginTop: 10,
        },
        rateLimitSub: {
          fontSize: 13,
          textAlign: 'center',
          color: isDark ? '#fde68a' : '#92400e',
          marginTop: 4,
          lineHeight: 18,
        },
        resultCounterBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 10,
        },
        resultCounterText: {
          fontSize: 13,
          fontWeight: '600',
          color: isDark ? '#a1a1aa' : '#64748b',
          flex: 1,
        },
        clearResultButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 6,
          backgroundColor: isDark ? '#27272a' : '#e2e8f0',
        },
        clearResultText: {
          fontSize: 11,
          fontWeight: '600',
          color: isDark ? '#a1a1aa' : '#64748b',
        },
        cardContainer: {
          flexDirection: 'row',
          backgroundColor: isDark ? '#18181b' : '#ffffff',
          borderRadius: 12,
          overflow: 'hidden',
          elevation: 2,
          borderWidth: 1,
          borderColor: isDark ? '#27272a' : '#e2e8f0',
        },
        cardPosterWrap: {
          width: 95,
          height: 135,
          position: 'relative',
          backgroundColor: isDark ? '#27272a' : '#e2e8f0',
        },
        cardPoster: {
          width: '100%',
          height: '100%',
        },
        chapterBadge: {
          position: 'absolute',
          bottom: 6,
          left: 6,
          backgroundColor: 'rgba(0,0,0,0.75)',
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 4,
        },
        chapterBadgeText: {
          color: '#ffffff',
          fontSize: 10,
          fontWeight: '700',
        },
        cardRatingBadge: {
          position: 'absolute',
          top: 6,
          left: 6,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.75)',
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 4,
        },
        cardRatingText: {
          color: '#f59e0b',
          fontSize: 10,
          fontWeight: '700',
        },
        cardContent: {
          flex: 1,
          padding: 10,
          justifyContent: 'space-between',
        },
        cardTitle: {
          fontSize: 14,
          fontWeight: '700',
          color: isDark ? '#f4f4f6' : '#0f172a',
          lineHeight: 18,
        },
        cardBadgesRow: {
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
          marginTop: 4,
        },
        cardStatusBadge: {
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 4,
        },
        cardStatusText: {
          fontSize: 10,
          fontWeight: '700',
          textTransform: 'uppercase',
        },
        cardSourceBadge: {
          backgroundColor: 'rgba(99, 102, 241, 0.15)',
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 4,
        },
        cardSourceText: {
          color: '#6366f1',
          fontSize: 10,
          fontWeight: '700',
        },
        cardTagsRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 4,
          marginTop: 6,
        },
        cardTagPill: {
          backgroundColor: isDark ? '#27272a' : '#f1f5f9',
          paddingHorizontal: 7,
          paddingVertical: 3,
          borderRadius: 4,
        },
        cardTagText: {
          fontSize: 10,
          color: isDark ? '#a1a1aa' : '#64748b',
          fontWeight: '500',
        },
        cardAdditionalInfo: {
          fontSize: 11,
          color: isDark ? '#71717a' : '#94a3b8',
          marginTop: 2,
        },
        emptyStateContainer: {
          alignItems: 'center',
          paddingHorizontal: 40,
        },
        emptyStateTitle: {
          fontSize: 18,
          fontWeight: 'bold',
          marginBottom: 6,
          textAlign: 'center',
        },
        emptyStateSubtitle: {
          fontSize: 13,
          textAlign: 'center',
          opacity: 0.6,
          marginBottom: 20,
        },
        proTip: {
          fontSize: 12,
          fontStyle: 'italic',
          opacity: 0.8,
          marginBottom: 4,
        },
        animeList: {
          justifyContent: 'center',
          paddingVertical: 10,
          flexDirection: 'row',
          backgroundColor: isDark ? '#18181b' : '#f1f5f9',
          marginHorizontal: 16,
          borderRadius: 12,
          elevation: 1,
        },
        animeListIndex: {
          marginLeft: 4,
          fontWeight: 'bold',
          fontSize: 12,
          color: theme.colors.onPrimaryContainer,
        },
        closeSearchResult: {
          position: 'absolute',
          backgroundColor: 'rgba(239, 68, 68, 0.9)',
          borderRadius: 24,
          width: 44,
          height: 44,
          justifyContent: 'center',
          alignItems: 'center',
          bottom: 24,
          right: 18,
          elevation: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          zIndex: 10,
        },
        sectionHeaderContainer: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 10,
          paddingHorizontal: 16,
          justifyContent: 'center',
        },
        sectionHeaderText: {
          fontSize: 14,
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
    [globalStyles.text.color, isDark, theme],
  );
}

export default memo(Search);
