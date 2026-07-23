import MaterialIcon from '@react-native-vector-icons/material-icons';
import Icon from '@react-native-vector-icons/fontawesome';
import { StackActions, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback, useRef, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useGlobalStyles from '../../assets/style';
import AnimeAPI from '../../utils/AnimeAPI';
import { DatabaseManager } from '../../utils/DatabaseManager';
import { comicsSearch, ComicsSearch } from '../../utils/scrapers/comicsv2';
import { novelSearch, NovelSearch } from '../../utils/scrapers/meionovel';
import { searchMoviebox, MovieboxSearchItem, hasIndonesian } from '../../utils/scrapers/moviebox';
import ImageLoading from '../misc/ImageLoading';
import DialogManager from '../../utils/dialogManager';
import { supabase } from '../../config/supabaseClient';
import { getLevelColor } from '../../utils/LevelSystem';
import { SearchAnimeList } from '../../types/anime';

type ContentType = 'anime' | 'film' | 'manga' | 'novel' | 'akun';

const TABS: { key: ContentType; label: string }[] = [
  { key: 'anime', label: 'Anime' },
  { key: 'film', label: 'Film' },
  { key: 'manga', label: 'Komik' },
  { key: 'novel', label: 'Novel' },
  { key: 'akun', label: 'Akun' },
];

const ANIME_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Isekai',
  'Mecha', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports',
];

function BrowsePage({ navigation }: { navigation: any }) {
  const isDark = useColorScheme() === 'dark';
  const globalStyles = useGlobalStyles();
  const route = useRoute<any>();

  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<ContentType>('anime');
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Results
  const [animeResults, setAnimeResults] = useState<SearchAnimeList[]>([]);
  const [filmResults, setFilmResults] = useState<MovieboxSearchItem[]>([]);
  const [mangaResults, setMangaResults] = useState<ComicsSearch[]>([]);
  const [novelResults, setNovelResults] = useState<NovelSearch[]>([]);
  const [accountResults, setAccountResults] = useState<any[]>([]);

  const abortController = useRef<AbortController | null>(null);

  // Auto search if navigated from WatchHistoryGrid
  useEffect(() => {
    if (route.params?.autoSearch) {
      setSearchText(route.params.autoSearch);
      if (route.params.type === 'anime' || route.params.type === 'film') {
        setActiveTab(route.params.type);
      }
      executeSearch(route.params.autoSearch, route.params.type || activeTab);
      // Clear params so it doesn't trigger again on tab switch
      navigation.setParams({ autoSearch: undefined, type: undefined });
    }
  }, [route.params]);

  // Debounced search for accounts only, OR we can just rely on manual search submission for all.
  // For Netflix/Letterboxd feel, manual search on enter is fine for media, but accounts is better debounced.
  // We'll stick to onSubmitEditing for media, and debounce for accounts.
  useEffect(() => {
    if (activeTab === 'akun' && searchText.trim().length > 1) {
      const timer = setTimeout(() => {
        executeSearch(searchText, 'akun');
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [searchText, activeTab]);

  const executeSearch = async (query: string, type: ContentType) => {
    if (!query.trim()) return;
    
    setLoading(true);
    setHasSearched(true);
    
    if (abortController.current) {
      abortController.current.abort();
    }
    abortController.current = new AbortController();
    const signal = abortController.current.signal;

    try {
      if (type === 'anime') {
        const res = await AnimeAPI.search(query, signal);
        setAnimeResults(res.result || []);
      } else if (type === 'film') {
        const res = await searchMoviebox(query, 0, signal);
        setFilmResults(res.items || []);
      } else if (type === 'manga') {
        const res = await comicsSearch(query, signal);
        setMangaResults(res || []);
      } else if (type === 'novel') {
        const res = await novelSearch(query, signal);
        setNovelResults(res || []);
      } else if (type === 'akun') {
        const { data } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, level, is_vip')
          .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
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
  };

  const onSubmit = () => {
    if (activeTab !== 'akun') {
      executeSearch(searchText, activeTab);
    }
    Keyboard.dismiss();
  };

  const clearSearch = () => {
    setSearchText('');
    setHasSearched(false);
    setAnimeResults([]);
    setFilmResults([]);
    setMangaResults([]);
    setNovelResults([]);
    setAccountResults([]);
    Keyboard.dismiss();
  };

  const onTabChange = (tab: ContentType) => {
    setActiveTab(tab);
    if (searchText.trim()) {
      executeSearch(searchText, tab);
    }
  };

  // Renderers
  const renderAnime = ({ item }: { item: SearchAnimeList }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => navigation.dispatch(StackActions.push('FromUrl', { title: item.title, link: item.animeUrl, type: 'anime' }))}>
      <ImageLoading source={{ uri: item.thumbnailUrl }} style={styles.cardImage} resizeMode="cover" />
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: isDark ? '#fff' : '#111' }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[styles.cardSub, { color: '#888' }]} numberOfLines={1}>{item.genres.join(', ')}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderFilm = ({ item }: { item: MovieboxSearchItem }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => navigation.dispatch(StackActions.push('FilmDetail', { data: item }))}>
      <ImageLoading source={{ uri: item.cover?.url }} style={styles.cardImage} resizeMode="cover" />
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: isDark ? '#fff' : '#111' }]} numberOfLines={2}>{item.title}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          <View style={{ backgroundColor: item.subjectType === 2 ? '#f59e0b' : '#3b82f6', paddingHorizontal: 4, borderRadius: 4 }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{item.subjectType === 2 ? 'TV' : 'MOV'}</Text>
          </View>
          {item.imdbRatingValue && <Text style={{ color: '#f5c518', fontSize: 11, fontWeight: '700' }}><Icon name="star" /> {item.imdbRatingValue}</Text>}
        </View>
        <Text style={[styles.cardSub, { color: '#888', marginTop: 4 }]} numberOfLines={2}>{item.description}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderManga = ({ item }: { item: ComicsSearch }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => navigation.dispatch(StackActions.push('FromUrl', { title: item.title, link: item.detailUrl, type: 'comics' }))}>
      <ImageLoading source={{ uri: item.thumbnailUrl }} style={styles.cardImage} resizeMode="cover" />
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: isDark ? '#fff' : '#111' }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[styles.cardSub, { color: '#3b82f6', fontWeight: '700' }]}>{item.latestChapter}</Text>
        <Text style={[styles.cardSub, { color: '#888' }]} numberOfLines={1}>Source: {item.source}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderNovel = ({ item }: { item: NovelSearch }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => navigation.dispatch(StackActions.push('FromUrl', { title: item.title, link: item.detailUrl, type: 'novel' }))}>
      <ImageLoading source={{ uri: item.thumbnailUrl }} style={styles.cardImage} resizeMode="cover" />
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: isDark ? '#fff' : '#111' }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[styles.cardSub, { color: '#888' }]} numberOfLines={2}>{item.genres.join(', ')}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderAccount = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.accountCard}
      onPress={() => navigation.dispatch(StackActions.push('UserProfile', { userId: item.id }))}>
      <View style={[styles.accountAvatar, { backgroundColor: isDark ? '#1a1a1a' : '#ddd', borderWidth: item.is_vip ? 2 : 0, borderColor: '#f59e0b' }]}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Text style={{ fontSize: 20, fontWeight: '700', color: isDark ? '#fff' : '#333' }}>
            {(item.display_name || item.username || '?').charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.accountInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[styles.accountName, { color: item.is_vip ? '#f59e0b' : (isDark ? '#fff' : '#111') }]}>
            {item.display_name || item.username}
          </Text>
          {item.is_vip && <MaterialIcon name="verified" size={14} color="#F59E0B" />}
          {item.is_vip && <MaterialIcon name="workspace-premium" size={16} color="#f59e0b" />}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: isDark ? '#888' : '#666', fontSize: 13 }}>@{item.username}</Text>
          <Text style={{ color: getLevelColor(item.level), fontSize: 11, fontWeight: '700' }}>Lv. {item.level}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const currentData = 
    activeTab === 'anime' ? animeResults :
    activeTab === 'film' ? filmResults :
    activeTab === 'manga' ? mangaResults :
    activeTab === 'novel' ? novelResults :
    accountResults;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      
      {/* Search Header */}
      <View style={styles.header}>
        <View style={[styles.searchBox, { backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0' }]}>
          <MaterialIcon name="search" size={22} color={isDark ? '#666' : '#999'} style={{ marginLeft: 12 }} />
          <TextInput
            style={[styles.input, { color: isDark ? '#fff' : '#111' }]}
            placeholder={`Cari ${TABS.find(t => t.key === activeTab)?.label.toLowerCase()}...`}
            placeholderTextColor={isDark ? '#666' : '#999'}
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={onSubmit}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={clearSearch} style={{ padding: 12 }}>
              <MaterialIcon name="close" size={20} color={isDark ? '#666' : '#999'} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabScroll, { borderBottomColor: isDark ? '#222' : '#eee', borderBottomWidth: 1 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 24 }}>
          {TABS.map(tab => (
            <TouchableOpacity 
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}>
              <Text style={[
                styles.tabText, 
                { color: isDark ? '#888' : '#666' },
                activeTab === tab.key && { color: isDark ? '#fff' : '#111', fontWeight: '700' }
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        ) : hasSearched ? (
          <FlashList<any>
            data={currentData}
            // @ts-expect-error - FlashList typings issue
            estimatedItemSize={120}
            contentContainerStyle={{ padding: 16 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.center}>
                <MaterialIcon name="search-off" size={64} color={isDark ? '#333' : '#ddd'} />
                <Text style={{ color: isDark ? '#888' : '#666', marginTop: 16 }}>Tidak ada hasil ditemukan.</Text>
              </View>
            }
            renderItem={(
              activeTab === 'anime' ? renderAnime :
              activeTab === 'film' ? renderFilm :
              activeTab === 'manga' ? renderManga :
              activeTab === 'novel' ? renderNovel :
              renderAccount
            ) as any}
          />
        ) : (
          /* Default Discover View when not searching */
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {activeTab === 'akun' ? (
              <View style={styles.center}>
                <MaterialIcon name="people" size={64} color={isDark ? '#222' : '#eee'} />
                <Text style={{ color: isDark ? '#666' : '#999', marginTop: 16 }}>Cari teman atau pengguna lain.</Text>
              </View>
            ) : (activeTab === 'anime' || activeTab === 'manga') ? (
              <View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? '#fff' : '#111', marginBottom: 12 }}>
                  Jelajahi Genre {activeTab === 'anime' ? 'Anime' : 'Komik'}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {ANIME_GENRES.map(genre => (
                    <TouchableOpacity 
                      key={genre}
                      onPress={() => navigation.dispatch(StackActions.push('SeeMore', {
                        type: activeTab === 'manga' ? 'ComicsGenre' : 'AnimeGenre',
                        genre: genre.toLowerCase().replace(/ /g, '-'),
                      }))}
                      style={[styles.genreChip, { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' }]}>
                      <Text style={{ color: isDark ? '#ccc' : '#444', fontSize: 13, fontWeight: '600' }}>{genre}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.center}>
                <MaterialIcon name="search" size={64} color={isDark ? '#222' : '#eee'} />
                <Text style={{ color: isDark ? '#666' : '#999', marginTop: 16 }}>Cari judul {activeTab} favoritmu.</Text>
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    height: 44,
  },
  input: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 12,
    fontSize: 15,
  },
  tabScroll: {
    height: 48,
  },
  tabBtn: {
    height: 48,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#6366f1',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 300,
  },
  card: {
    flexDirection: 'row',
    marginBottom: 16,
    height: 110,
  },
  cardImage: {
    width: 76,
    height: 110,
    borderRadius: 8,
    backgroundColor: '#222',
  },
  cardContent: {
    flex: 1,
    paddingLeft: 12,
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 12,
    lineHeight: 18,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  accountAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountInfo: {
    marginLeft: 12,
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '700',
  },
  genreChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
});

export default memo(BrowsePage);
