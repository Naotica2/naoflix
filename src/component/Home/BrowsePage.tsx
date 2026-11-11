import MaterialIcon from '@react-native-vector-icons/material-icons';
import { StackActions, useFocusEffect, useRoute } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnimeAPI from '../../utils/AnimeAPI';
import { OTAKUDESU_GENRES } from '../../utils/scrapers/animeindo';
import { comicsSearch, ComicsSearch, COMICS_GENRES, getComicsGenres } from '../../utils/scrapers/comicsv2';
import { FilmAPI } from '../../utils/FilmAPI';
import { FilmSearchItem } from '../../types/film';
import ImageLoading from '../misc/ImageLoading';
import ForumImage from '../Forum/ForumImage';
import { supabase } from '../../config/supabaseClient';
import { getLevelColor } from '../../utils/LevelSystem';
import { SearchAnimeList } from '../../types/anime';
import { DatabaseManager } from '../../utils/DatabaseManager';
import { getActiveAnimeSource, getSourceVersion } from '../../utils/sourcePreferences';
import { useLanguage } from '../../misc/LanguageContext';

type ContentType = 'anime' | 'film' | 'manga' | 'akun';

interface GenreItem {
  name: string;
  slug: string;
}

const QUICK_TAGS: Record<ContentType, string[]> = {
  anime: ['Ongoing', 'Completed', 'Action', 'Romance', 'Fantasy', 'Isekai', 'School'],
  film: ['Box Office', 'TV Series', 'Action', 'Horror', 'Drama', 'Sci-Fi'],
  manga: ['Manga', 'Manhwa', 'Manhua', 'Action', 'Romance', 'Fantasy', 'Isekai'],
  akun: [],
};

const SOURCE_LABELS: Record<'otakudesu' | 'nimegami', string> = {
  otakudesu: 'Otakudesu',
  nimegami: 'Nimegami',
};

function loadRecentSearches(): string[] {
  try {
    const raw = DatabaseManager.getSync('searchHistory');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistRecentSearches(list: string[]) {
  try {
    DatabaseManager.set('searchHistory', JSON.stringify(list.slice(0, 8)));
  } catch {}
}

const BrowseAnimeCard = memo(function BrowseAnimeCard({
  item,
  isDark,
  navigation,
}: {
  item: SearchAnimeList;
  isDark: boolean;
  navigation: any;
}) {
  const { t } = useLanguage();
  const isCompleted =
    (item.status || '').toLowerCase().includes('complete') ||
    (item.status || '').toLowerCase().includes('tamat');

  const onPress = useCallback(() => {
    navigation.dispatch(
      StackActions.push('FromUrl', {
        title: item.title,
        link: item.animeUrl,
        type: 'anime',
        thumbnailUrl: item.thumbnailUrl,
      }),
    );
  }, [item.animeUrl, item.thumbnailUrl, item.title, navigation]);

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      style={[
        styles.resultCard,
        { backgroundColor: isDark ? '#121215' : '#ffffff', borderColor: isDark ? '#222228' : '#e5e7eb' },
      ]}
      onPress={onPress}>
      <ImageLoading
        source={{ uri: item.thumbnailUrl }}
        fallbackSearchTitle={item.title}
        style={styles.cardImage}
        resizeMode="cover"
      />
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: isDark ? '#f4f4f6' : '#111216' }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.badgeRow}>
          {item.status ? (
            <View
              style={[
                styles.tagBadge,
                {
                  backgroundColor: isCompleted
                    ? isDark
                      ? '#142a22'
                      : '#dcfce7'
                    : isDark
                    ? '#172554'
                    : '#dbeafe',
                },
              ]}>
              <Text
                style={[
                  styles.tagBadgeText,
                  {
                    color: isCompleted
                      ? isDark
                        ? '#34d399'
                        : '#166534'
                      : isDark
                      ? '#60a5fa'
                      : '#1e40af',
                  },
                ]}>
                {item.status}
              </Text>
            </View>
          ) : null}
          {item.rating ? (
            <View style={[styles.tagBadge, { backgroundColor: isDark ? '#2a2415' : '#fef3c7' }]}>
              <Text style={[styles.tagBadgeText, { color: isDark ? '#fbbf24' : '#b45309' }]}>
                {t('browse.scoreBadge', { score: item.rating })}
              </Text>
            </View>
          ) : null}
        </View>
        {item.genres && item.genres.length > 0 ? (
          <Text style={[styles.cardSub, { color: isDark ? '#71717a' : '#888990' }]} numberOfLines={1}>
            {item.genres.join(' • ')}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

const BrowseFilmCard = memo(function BrowseFilmCard({
  item,
  isDark,
  navigation,
}: {
  item: FilmSearchItem;
  isDark: boolean;
  navigation: any;
}) {
  const { t } = useLanguage();
  const isTV = item.subjectType === 2 || item.type === 'TV';
  const posterUrl = item.poster || (item.cover as any)?.url;

  const onPress = useCallback(() => {
    navigation.dispatch(StackActions.push('FilmDetail', { data: item }));
  }, [item, navigation]);

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      style={[
        styles.resultCard,
        { backgroundColor: isDark ? '#121215' : '#ffffff', borderColor: isDark ? '#222228' : '#e5e7eb' },
      ]}
      onPress={onPress}>
      <ImageLoading source={{ uri: posterUrl }} style={styles.cardImage} resizeMode="cover" />
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: isDark ? '#f4f4f6' : '#111216' }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.tagBadge,
              {
                backgroundColor: isTV
                  ? isDark
                    ? '#2e1c0c'
                    : '#ffedd5'
                  : isDark
                  ? '#142036'
                  : '#dbeafe',
              },
            ]}>
            <Text
              style={[
                styles.tagBadgeText,
                { color: isTV ? (isDark ? '#fb923c' : '#c2410c') : isDark ? '#60a5fa' : '#1d4ed8' },
              ]}>
              {isTV ? t('browse.tvSeriesTag') : t('browse.filmTag')}
            </Text>
          </View>
          {item.imdbRatingValue ? (
            <View style={[styles.tagBadge, { backgroundColor: isDark ? '#2a2415' : '#fef3c7' }]}>
              <Text style={[styles.tagBadgeText, { color: isDark ? '#fbbf24' : '#b45309' }]}>
                IMDb {item.imdbRatingValue}
              </Text>
            </View>
          ) : null}
          {item.releaseDate ? (
            <Text style={[styles.metaText, { color: isDark ? '#71717a' : '#888990' }]}>
              {item.releaseDate}
            </Text>
          ) : null}
        </View>
        {item.description ? (
          <Text
            style={[styles.cardSub, { color: isDark ? '#71717a' : '#888990', marginTop: 4 }]}
            numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

const BrowseMangaCard = memo(function BrowseMangaCard({
  item,
  isDark,
  navigation,
}: {
  item: ComicsSearch;
  isDark: boolean;
  navigation: any;
}) {
  const { t } = useLanguage();
  const onPress = useCallback(() => {
    navigation.dispatch(
      StackActions.push('FromUrl', { title: item.title, link: item.detailUrl, type: 'comics' }),
    );
  }, [item.detailUrl, item.title, navigation]);

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      style={[
        styles.resultCard,
        { backgroundColor: isDark ? '#121215' : '#ffffff', borderColor: isDark ? '#222228' : '#e5e7eb' },
      ]}
      onPress={onPress}>
      <ImageLoading source={{ uri: item.thumbnailUrl }} style={styles.cardImage} resizeMode="cover" />
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: isDark ? '#f4f4f6' : '#111216' }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.badgeRow}>
          {item.type ? (
            <View style={[styles.tagBadge, { backgroundColor: isDark ? '#1d1930' : '#ede9fe' }]}>
              <Text style={[styles.tagBadgeText, { color: isDark ? '#a78bfa' : '#6d28d9' }]}>
                {item.type}
              </Text>
            </View>
          ) : null}
          {item.latestChapter ? (
            <View style={[styles.tagBadge, { backgroundColor: isDark ? '#132822' : '#dcfce7' }]}>
              <Text style={[styles.tagBadgeText, { color: isDark ? '#34d399' : '#15803d' }]}>
                {item.latestChapter}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[styles.cardSub, { color: isDark ? '#71717a' : '#888990', marginTop: 4 }]}
          numberOfLines={1}>
          {t('browse.sourceLabel', { source: item.source || t('lists.comicTag') })}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const BrowseAccountCard = memo(function BrowseAccountCard({
  item,
  isDark,
  navigation,
}: {
  item: any;
  isDark: boolean;
  navigation: any;
}) {
  const onPress = useCallback(() => {
    navigation.dispatch(StackActions.push('UserProfile', { userId: item.id }));
  }, [item.id, navigation]);

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      style={[styles.accountCard, { borderColor: isDark ? '#222228' : '#e5e7eb' }]}
      onPress={onPress}>
      <View
        style={[
          styles.accountAvatar,
          {
            backgroundColor: isDark ? '#1e1e24' : '#e2e8f0',
          },
        ]}>
        {item.avatar_url ? (
          <ForumImage
            uri={item.avatar_url}
            recyclingKey={item.avatar_url}
            style={styles.accountAvatarImg}
          />
        ) : (
          <Text style={{ fontSize: 18, fontWeight: '700', color: isDark ? '#f4f4f6' : '#18181b' }}>
            {(item.display_name || item.username || '?').charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.accountInfo}>
        <Text
          style={[styles.accountName, { color: isDark ? '#f4f4f6' : '#18181b' }]}
          numberOfLines={1}>
          {item.display_name || item.username}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <Text style={{ color: '#71717a', fontSize: 13 }}>@{item.username}</Text>
          <Text style={{ color: getLevelColor(item.level), fontSize: 11, fontWeight: '700' }}>
            Lv. {item.level || 1}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

function BrowsePage({ navigation }: { navigation: any }) {
  const isDark = useColorScheme() === 'dark';
  const route = useRoute<any>();
  const { t } = useLanguage();

  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<ContentType>('anime');
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);
  const [activeAnimeSource, setActiveAnimeSource] = useState<'otakudesu' | 'nimegami'>('otakudesu');

  const [animeGenres, setAnimeGenres] = useState<GenreItem[]>(OTAKUDESU_GENRES);
  const [comicsGenres, setComicsGenres] = useState<GenreItem[]>(COMICS_GENRES);
  const [trendingFilms, setTrendingFilms] = useState<FilmSearchItem[]>([]);

  const [animeResults, setAnimeResults] = useState<SearchAnimeList[]>([]);
  const [filmResults, setFilmResults] = useState<FilmSearchItem[]>([]);
  const [mangaResults, setMangaResults] = useState<ComicsSearch[]>([]);
  const [accountResults, setAccountResults] = useState<any[]>([]);

  const abortController = useRef<AbortController | null>(null);
  const lastSourceVersionRef = useRef(getSourceVersion());

  useEffect(() => {
    let isMounted = true;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!isMounted) return;
      getActiveAnimeSource().then(src => {
        if (isMounted) setActiveAnimeSource(src);
      });
      AnimeAPI.getAllGenres()
        .then(genres => {
          if (isMounted && genres && genres.length > 0) setAnimeGenres(genres);
        })
        .catch(() => {});

      getComicsGenres()
        .then(genres => {
          if (isMounted && genres && genres.length > 0) setComicsGenres(genres);
        })
        .catch(() => {});

      FilmAPI.getTrending(1)
        .then(items => {
          if (isMounted && items && items.length > 0) setTrendingFilms(items.slice(0, 8));
        })
        .catch(() => {});
    });

    return () => {
      isMounted = false;
      task.cancel();
    };
  }, []);

  const executeSearch = useCallback(async (query: string, type: ContentType) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setHasSearched(true);

    if (type !== 'akun') {
      setRecentSearches(prev => {
        const next = [trimmed, ...prev.filter(item => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
        persistRecentSearches(next);
        return next;
      });
    }

    if (abortController.current) {
      abortController.current.abort();
    }
    abortController.current = new AbortController();
    const signal = abortController.current.signal;

    try {
      if (type === 'anime') {
        const res = await AnimeAPI.search(trimmed, signal);
        setAnimeResults(res.result || []);
      } else if (type === 'film') {
        const res = await FilmAPI.search(trimmed, 1, signal);
        setFilmResults(res.items || []);
      } else if (type === 'manga') {
        const res = await comicsSearch(trimmed, signal);
        setMangaResults(res || []);
      } else if (type === 'akun') {
        if (trimmed.length < 2) {
          setAccountResults([]);
          setLoading(false);
          return;
        }
        const { data } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, level')
          .or(`username.ilike.%${trimmed}%,display_name.ilike.%${trimmed}%`)
          .limit(20);
        setAccountResults(data || []);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.warn('Search Error:', e);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const currentVersion = getSourceVersion();
      if (currentVersion !== lastSourceVersionRef.current) {
        lastSourceVersionRef.current = currentVersion;
        getActiveAnimeSource().then(setActiveAnimeSource);
        AnimeAPI.getAllGenres()
          .then(genres => {
            if (genres && genres.length > 0) setAnimeGenres(genres);
          })
          .catch(() => {});
        setAnimeResults([]);
        if (activeTab === 'anime' && hasSearched && searchText.trim()) {
          executeSearch(searchText, 'anime');
        }
      }
    }, [activeTab, executeSearch, hasSearched, searchText]),
  );

  useEffect(() => {
    if (route.params?.autoSearch) {
      const q = route.params.autoSearch;
      setSearchText(q);
      const targetType =
        route.params.type === 'anime' || route.params.type === 'film' || route.params.type === 'manga'
          ? route.params.type
          : activeTab;
      if (targetType !== activeTab) {
        setActiveTab(targetType);
      }
      executeSearch(q, targetType);
      navigation.setParams({ autoSearch: undefined, type: undefined });
    }
  }, [route.params, activeTab, executeSearch, navigation]);

  useEffect(() => {
    if (activeTab === 'akun') {
      const trimmed = searchText.trim();
      if (trimmed.length >= 2) {
        const timer = setTimeout(() => {
          executeSearch(trimmed, 'akun');
        }, 500);
        return () => clearTimeout(timer);
      } else {
        setAccountResults([]);
        setHasSearched(false);
        setLoading(false);
      }
    }
  }, [searchText, activeTab, executeSearch]);

  const removeRecentSearch = useCallback((itemToRemove: string) => {
    setRecentSearches(prev => {
      const next = prev.filter(item => item !== itemToRemove);
      persistRecentSearches(next);
      return next;
    });
  }, []);

  const clearAllRecentSearches = useCallback(() => {
    setRecentSearches([]);
    persistRecentSearches([]);
  }, []);

  const onSubmit = useCallback(() => {
    if (activeTab !== 'akun') {
      executeSearch(searchText, activeTab);
    } else if (searchText.trim().length >= 2) {
      executeSearch(searchText, 'akun');
    }
    Keyboard.dismiss();
  }, [activeTab, executeSearch, searchText]);

  const clearSearch = useCallback(() => {
    setSearchText('');
    setHasSearched(false);
    setAnimeResults([]);
    setFilmResults([]);
    setMangaResults([]);
    setAccountResults([]);
    Keyboard.dismiss();
  }, []);

  const onTabChange = useCallback(
    (tab: ContentType) => {
      setActiveTab(tab);
      const trimmed = searchText.trim();
      if (trimmed) {
        if (tab === 'akun' && trimmed.length < 2) {
          setAccountResults([]);
          setHasSearched(false);
          setLoading(false);
          return;
        }
        executeSearch(trimmed, tab);
      }
    },
    [executeSearch, searchText],
  );

  const onGenrePress = useCallback(
    (genre: GenreItem, type: 'AnimeGenre' | 'ComicsGenre') => {
      navigation.dispatch(
        StackActions.push('SeeMore', {
          type,
          genre: genre.slug,
          genreName: genre.name,
        }),
      );
    },
    [navigation],
  );

  const onQuickTagPress = useCallback(
    (tag: string) => {
      if (activeTab === 'anime') {
        const matched = animeGenres.find(g => g.name.toLowerCase() === tag.toLowerCase());
        if (matched) {
          return onGenrePress(matched, 'AnimeGenre');
        }
      } else if (activeTab === 'manga') {
        const matched = comicsGenres.find(g => g.name.toLowerCase() === tag.toLowerCase());
        if (matched) {
          return onGenrePress(matched, 'ComicsGenre');
        }
      }
      setSearchText(tag);
      executeSearch(tag, activeTab);
    },
    [activeTab, animeGenres, comicsGenres, executeSearch, onGenrePress],
  );

  const renderAnime = useCallback(
    ({ item }: { item: SearchAnimeList }) => (
      <BrowseAnimeCard item={item} isDark={isDark} navigation={navigation} />
    ),
    [isDark, navigation],
  );

  const renderFilm = useCallback(
    ({ item }: { item: FilmSearchItem }) => (
      <BrowseFilmCard item={item} isDark={isDark} navigation={navigation} />
    ),
    [isDark, navigation],
  );

  const renderManga = useCallback(
    ({ item }: { item: ComicsSearch }) => (
      <BrowseMangaCard item={item} isDark={isDark} navigation={navigation} />
    ),
    [isDark, navigation],
  );

  const renderAccount = useCallback(
    ({ item }: { item: any }) => (
      <BrowseAccountCard item={item} isDark={isDark} navigation={navigation} />
    ),
    [isDark, navigation],
  );

  const keyExtractor = useCallback((item: any, index: number) => {
    return item.animeUrl || item.detailUrl || item.id || item.username || item.title || String(index);
  }, []);

  const currentData = useMemo(
    () =>
      activeTab === 'anime'
        ? animeResults
        : activeTab === 'film'
          ? filmResults
          : activeTab === 'manga'
            ? mangaResults
            : accountResults,
    [activeTab, animeResults, filmResults, mangaResults, accountResults],
  );

  const tabs = useMemo<{ key: ContentType; label: string }[]>(
    () => [
      { key: 'anime', label: t('search.categoryAnime') },
      { key: 'film', label: t('search.categoryFilms') },
      { key: 'manga', label: t('search.categoryComics') },
      { key: 'akun', label: t('browse.tabAccounts') },
    ],
    [t],
  );

  const placeholderText = useMemo(() => {
    switch (activeTab) {
      case 'anime':
        return t('search.placeholder', { category: t('search.categoryAnime') });
      case 'film':
        return t('search.placeholder', { category: t('search.categoryFilms') });
      case 'manga':
        return t('search.placeholder', { category: t('search.categoryComics') });
      case 'akun':
        return t('profile.searchUsersPlaceholder');
      default:
        return t('common.search') + '...';
    }
  }, [activeTab, t]);

  const emptyComponent = useMemo(
    () => (
      <View style={styles.centerContainer}>
        <Text style={[styles.emptyTitle, { color: isDark ? '#f4f4f6' : '#18181b' }]}>
          {t('search.noResults')}
        </Text>
        <Text style={[styles.emptySubtitle, { color: isDark ? '#71717a' : '#888990' }]}>
          {t('search.noResultsDesc')}
        </Text>
      </View>
    ),
    [isDark, t],
  );

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.container, { backgroundColor: isDark ? '#09090b' : '#f8fafc' }]}>
      <View style={styles.header}>
        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: isDark ? '#141417' : '#ffffff',
              borderColor: isDark ? '#27272a' : '#e2e8f0',
            },
          ]}>
          <MaterialIcon
            name="search"
            size={20}
            color={isDark ? '#71717a' : '#94a3b8'}
            style={{ marginLeft: 12 }}
          />
          <TextInput
            style={[styles.input, { color: isDark ? '#f4f4f6' : '#0f172a' }]}
            placeholder={placeholderText}
            placeholderTextColor={isDark ? '#71717a' : '#94a3b8'}
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={onSubmit}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={clearSearch} style={{ padding: 10 }}>
              <MaterialIcon name="close" size={18} color={isDark ? '#a1a1aa' : '#64748b'} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={[styles.tabBar, { borderBottomColor: isDark ? '#1e1e24' : '#e2e8f0' }]}>
        <View style={styles.tabRow}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => onTabChange(tab.key)}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                activeOpacity={0.7}>
                <Text
                  style={[
                    styles.tabText,
                    { color: isDark ? '#71717a' : '#64748b' },
                    isActive && { color: '#3b82f6', fontWeight: '700' },
                  ]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color="#3b82f6" />
          </View>
        ) : hasSearched ? (
          <FlashList<any>
            data={currentData}
            drawDistance={350}
            keyExtractor={keyExtractor}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={emptyComponent}
            renderItem={
              (activeTab === 'anime'
                ? renderAnime
                : activeTab === 'film'
                ? renderFilm
                : activeTab === 'manga'
                ? renderManga
                : renderAccount) as any
            }
          />
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {recentSearches.length > 0 && (
              <View style={styles.recentSection}>
                <View style={styles.recentHeader}>
                  <Text style={[styles.sectionTitle, { color: isDark ? '#f4f4f6' : '#0f172a' }]}>
                    {t('search.recentTitle')}
                  </Text>
                  <TouchableOpacity onPress={clearAllRecentSearches}>
                    <Text style={styles.clearRecentText}>{t('search.clearRecent')}</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recentRow}>
                  {recentSearches.map((s, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.recentChip,
                        {
                          backgroundColor: isDark ? '#141417' : '#ffffff',
                          borderColor: isDark ? '#27272a' : '#e2e8f0',
                        },
                      ]}>
                      <TouchableOpacity
                        onPress={() => {
                          setSearchText(s);
                          executeSearch(s, activeTab);
                        }}>
                        <Text style={[styles.recentText, { color: isDark ? '#e4e4e7' : '#334155' }]}>
                          {s}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeRecentSearch(s)} style={{ marginLeft: 6 }}>
                        <MaterialIcon
                          name="close"
                          size={13}
                          color={isDark ? '#71717a' : '#94a3b8'}
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {QUICK_TAGS[activeTab].length > 0 && (
              <View style={styles.quickTagsSection}>
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: isDark ? '#f4f4f6' : '#0f172a', marginBottom: 10 },
                  ]}>
                  {t('browse.quickCategories')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}>
                  {QUICK_TAGS[activeTab].map((tag, idx) => (
                    <TouchableOpacity
                      key={idx}
                      activeOpacity={0.7}
                      onPress={() => onQuickTagPress(tag)}
                      style={[
                        styles.quickTagChip,
                        {
                          backgroundColor: isDark ? '#141417' : '#ffffff',
                          borderColor: isDark ? '#27272a' : '#e2e8f0',
                        },
                      ]}>
                      <Text
                        style={[styles.quickTagText, { color: isDark ? '#e4e4e7' : '#334155' }]}>
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {activeTab === 'anime' && (
              <View style={{ marginTop: 6 }}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: isDark ? '#f4f4f6' : '#09090b' }]}>
                    {t('browse.browseAnimeGenres')}
                  </Text>
                  <Text style={[styles.sectionSub, { color: isDark ? '#71717a' : '#64748b' }]}>
                    {t('browse.genreCatalogSource', { source: SOURCE_LABELS[activeAnimeSource] })}
                  </Text>
                </View>
                <View style={styles.genreGrid}>
                  {animeGenres.map(g => (
                    <TouchableOpacity
                      key={g.slug}
                      activeOpacity={0.7}
                      onPress={() => onGenrePress(g, 'AnimeGenre')}
                      style={[
                        styles.genreChip,
                        {
                          backgroundColor: isDark ? '#141417' : '#ffffff',
                          borderColor: isDark ? '#27272a' : '#e2e8f0',
                        },
                      ]}>
                      <Text style={[styles.genreText, { color: isDark ? '#e4e4e7' : '#334155' }]}>
                        {g.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {activeTab === 'manga' && (
              <View style={{ marginTop: 6 }}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: isDark ? '#f4f4f6' : '#09090b' }]}>
                    {t('browse.browseComicGenres')}
                  </Text>
                  <Text style={[styles.sectionSub, { color: isDark ? '#71717a' : '#64748b' }]}>
                    {t('browse.genreCatalogComicsDesc')}
                  </Text>
                </View>
                <View style={styles.genreGrid}>
                  {comicsGenres.map(g => (
                    <TouchableOpacity
                      key={g.slug}
                      activeOpacity={0.7}
                      onPress={() => onGenrePress(g, 'ComicsGenre')}
                      style={[
                        styles.genreChip,
                        {
                          backgroundColor: isDark ? '#141417' : '#ffffff',
                          borderColor: isDark ? '#27272a' : '#e2e8f0',
                        },
                      ]}>
                      <Text style={[styles.genreText, { color: isDark ? '#e4e4e7' : '#334155' }]}>
                        {g.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {activeTab === 'film' && (
              <View style={{ marginTop: 6 }}>
                <View
                  style={[
                    styles.infoBanner,
                    {
                      backgroundColor: isDark ? '#141417' : '#ffffff',
                      borderColor: isDark ? '#27272a' : '#e2e8f0',
                    },
                  ]}>
                  <Text style={[styles.infoBannerTitle, { color: isDark ? '#f4f4f6' : '#09090b' }]}>
                    {t('browse.filmSearchBannerTitle')}
                  </Text>
                  <Text style={[styles.infoBannerDesc, { color: isDark ? '#a1a1aa' : '#64748b' }]}>
                    {t('browse.filmSearchBannerDesc')}
                  </Text>
                </View>

                {trendingFilms.length > 0 && (
                  <View style={{ marginTop: 20 }}>
                    <View style={styles.sectionHeader}>
                      <Text style={[styles.sectionTitle, { color: isDark ? '#f4f4f6' : '#09090b' }]}>
                        {t('home.trendingFilms')}
                      </Text>
                      <Text style={[styles.sectionSub, { color: isDark ? '#71717a' : '#64748b' }]}>
                        {t('browse.trendingFilmsDesc')}
                      </Text>
                    </View>
                    <View style={{ gap: 10 }}>
                      {trendingFilms.map(film => (
                        <BrowseFilmCard
                          key={film.id}
                          item={film}
                          isDark={isDark}
                          navigation={navigation}
                        />
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}

            {activeTab === 'akun' && (
              <View
                style={[
                  styles.infoBanner,
                  {
                    backgroundColor: isDark ? '#141417' : '#ffffff',
                    borderColor: isDark ? '#27272a' : '#e2e8f0',
                  },
                ]}>
                <Text style={[styles.infoBannerTitle, { color: isDark ? '#f4f4f6' : '#09090b' }]}>
                  {t('profile.searchUsersTitle')}
                </Text>
                <Text style={[styles.infoBannerDesc, { color: isDark ? '#a1a1aa' : '#64748b' }]}>
                  {searchText.trim().length === 1
                    ? t('profile.searchUsersPrompt')
                    : t('browse.searchUsersBannerDesc')}
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    height: 44,
    borderWidth: 1,
  },
  input: { flex: 1, height: '100%', paddingHorizontal: 10, fontSize: 14 },
  tabBar: { borderBottomWidth: 1, paddingHorizontal: 16 },
  tabRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tabBtn: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#3b82f6' },
  tabText: { fontSize: 13, fontWeight: '600' },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 240,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18, maxWidth: 280 },
  recentSection: { marginBottom: 18 },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  clearRecentText: { fontSize: 12, color: '#3b82f6', fontWeight: '600' },
  recentRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  recentText: { fontSize: 12, fontWeight: '500' },
  quickTagsSection: { marginBottom: 18 },
  quickTagChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  quickTagText: { fontSize: 12, fontWeight: '600' },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  sectionSub: { fontSize: 12, marginTop: 2 },
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  genreText: { fontSize: 12, fontWeight: '600' },
  infoBanner: { padding: 16, borderRadius: 10, borderWidth: 1 },
  infoBannerTitle: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  infoBannerDesc: { fontSize: 13, lineHeight: 19 },
  resultCard: {
    flexDirection: 'row',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  cardImage: { width: 70, height: 98, borderRadius: 6, backgroundColor: '#18181b' },
  cardContent: { flex: 1, paddingLeft: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  tagBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagBadgeText: { fontSize: 10, fontWeight: '700' },
  metaText: { fontSize: 11 },
  cardSub: { fontSize: 12, lineHeight: 16, marginTop: 4 },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  accountAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountAvatarImg: { width: '100%', height: '100%' },
  accountInfo: { marginLeft: 12, flex: 1 },
  accountName: { fontSize: 14, fontWeight: '700' },
});

export default memo(BrowsePage);
