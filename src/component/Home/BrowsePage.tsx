import MaterialIcon from '@react-native-vector-icons/material-icons';
import Icon from '@react-native-vector-icons/fontawesome';
import { StackActions, useFocusEffect } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import React, { memo, useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput as TextInputType,
  TouchableOpacity as TouchableOpacityReactNative,
  useColorScheme,
  View,
} from 'react-native';
import { Searchbar, useTheme } from 'react-native-paper';
import Reanimated, { FadeInRight, FadeInUp, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useGlobalStyles from '../../assets/style';
import { RootStackNavigator } from '../../types/navigation';
import { SearchAnime, SearchAnimeList } from '../../types/anime';
import AnimeAPI from '../../utils/AnimeAPI';
import { DatabaseManager, useModifiedKeyValueIfFocused } from '../../utils/DatabaseManager';
import {
  ComicsSearch,
  comicsSearch,
} from '../../utils/scrapers/comicsv2';
import { novelSearch, NovelSearch } from '../../utils/scrapers/meionovel';
import { searchMoviebox, MovieboxSearchItem, hasIndonesian } from '../../utils/scrapers/moviebox';
import ImageLoading from '../misc/ImageLoading';
import DarkOverlay from '../misc/DarkOverlay';
import { TouchableOpacity } from '../misc/TouchableOpacityRNGH';
import DialogManager from '../../utils/dialogManager';

type ContentType = 'anime' | 'manga' | 'novel' | 'film';

const CONTENT_TYPES = [
  { key: 'anime' as ContentType, label: 'Anime', icon: 'play-circle-filled' as const },
  { key: 'manga' as ContentType, label: 'Komik', icon: 'menu-book' as const },
  { key: 'novel' as ContentType, label: 'Novel', icon: 'auto-stories' as const },
  { key: 'film' as ContentType, label: 'Film', icon: 'movie' as const },
];

const ANIME_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Game',
  'Harem', 'Historical', 'Horror', 'Isekai', 'Josei', 'Magic', 'Martial Arts',
  'Mecha', 'Military', 'Music', 'Mystery', 'Psychological', 'Romance',
  'School', 'Sci-Fi', 'Seinen', 'Shoujo', 'Shounen', 'Slice of Life',
  'Sports', 'Super Power', 'Supernatural', 'Thriller',
];

const TouchableOpacityAnimated = Reanimated.createAnimatedComponent(TouchableOpacity);

// ============ SEARCH RESULT ITEM COMPONENTS ============
function AnimeSearchItem({ item, navigation }: { item: SearchAnimeList; navigation: any }) {
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  return (
    <TouchableOpacityAnimated
      entering={FadeInRight}
      style={[resultStyles.listContainer, { backgroundColor: colorScheme === 'dark' ? '#333' : '#fff' }]}
      onPress={() => navigation.dispatch(StackActions.push('FromUrl', { title: item.title, link: item.animeUrl, type: 'anime' }))}>
      <ImageLoading resizeMode="cover" source={{ uri: item.thumbnailUrl }} style={resultStyles.listImage} />
      <ImageLoading displayLoading={false} source={{ uri: item.thumbnailUrl }} blurRadius={5} style={{ flex: 1 }}>
        <DarkOverlay transparent={0.8} />
        <View style={{ flexShrink: 1, paddingHorizontal: 8, justifyContent: 'center', flex: 1, marginLeft: 5 }}>
          <Text numberOfLines={3} style={[globalStyles.text, { fontWeight: 'bold', color: 'white', flexShrink: 1 }]}>{item.title}</Text>
        </View>
        <View style={{ justifyContent: 'flex-end', flex: 1 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.445)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 }}>
              <Text style={[globalStyles.text, { fontWeight: 'bold', color: 'white', fontSize: 12 }]} numberOfLines={1}>
                <Icon name="tags" color="white" /> {item.genres.join(', ')}
              </Text>
            </View>
          </View>
        </View>
      </ImageLoading>
    </TouchableOpacityAnimated>
  );
}

function MangaSearchItem({ item, navigation }: { item: ComicsSearch; navigation: any }) {
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  return (
    <TouchableOpacityAnimated
      entering={FadeInRight}
      style={[resultStyles.listContainer, { backgroundColor: colorScheme === 'dark' ? '#333' : '#fff' }]}
      onPress={() => navigation.dispatch(StackActions.push('FromUrl', { title: item.title, link: item.detailUrl, type: 'comics' }))}>
      <ImageLoading resizeMode="cover" source={{ uri: item.thumbnailUrl }} style={[resultStyles.listImage, { width: 100, height: 150 }]}>
        <View style={{ position: 'absolute', top: 5, right: 5, backgroundColor: '#0000009d', padding: 5, borderRadius: 8 }}>
          <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>{item.latestChapter}</Text>
        </View>
      </ImageLoading>
      <View style={{ flex: 1, padding: 8, justifyContent: 'space-between' }}>
        <Text numberOfLines={3} style={[globalStyles.text, { fontWeight: 'bold', fontSize: 14 }]}>{item.title}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {'concept' in item && (
            <View style={{ backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
              <Text style={[globalStyles.text, { fontSize: 11, color: 'white' }]}>{item.concept}</Text>
            </View>
          )}
          {item.source && (
            <View style={{ backgroundColor: '#3b82f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
              <Text style={{ fontSize: 11, color: '#fff', fontWeight: 'bold' }}>{item.source}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacityAnimated>
  );
}

function NovelSearchItem({ item, navigation }: { item: NovelSearch; navigation: any }) {
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  return (
    <TouchableOpacityAnimated
      entering={FadeInRight}
      style={[resultStyles.listContainer, { backgroundColor: colorScheme === 'dark' ? '#333' : '#fff' }]}
      onPress={() => navigation.dispatch(StackActions.push('FromUrl', { title: item.title, link: item.detailUrl, type: 'novel' }))}>
      <ImageLoading resizeMode="cover" source={{ uri: item.thumbnailUrl }} style={[resultStyles.listImage, { width: 100, height: 150 }]} />
      <View style={{ flex: 1, padding: 8, justifyContent: 'space-between' }}>
        <Text numberOfLines={2} style={[globalStyles.text, { fontWeight: 'bold', fontSize: 14 }]}>{item.title}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {item.genres.slice(0, 3).map((genre, i) => (
            <View key={i} style={{ backgroundColor: '#3b82f630', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ color: '#3b82f6', fontSize: 11, fontWeight: 'bold' }}>{genre}</Text>
            </View>
          ))}
        </View>
      </View>
    </TouchableOpacityAnimated>
  );
}

function FilmSearchItem({ item, navigation }: { item: MovieboxSearchItem; navigation: any }) {
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  const isTV = item.subjectType === 2;
  return (
    <TouchableOpacityAnimated
      entering={FadeInRight}
      style={[resultStyles.listContainer, { backgroundColor: colorScheme === 'dark' ? '#333' : '#fff' }]}
      onPress={() => navigation.dispatch(StackActions.push('FilmDetail', { data: item }))}>
      <ImageLoading resizeMode="cover" source={{ uri: item.cover?.url }} style={[resultStyles.listImage, { width: 100, height: 150 }]} />
      <View style={{ flex: 1, padding: 8, justifyContent: 'space-between' }}>
        <View>
          <Text numberOfLines={2} style={[globalStyles.text, { fontWeight: 'bold', fontSize: 14 }]}>{item.title}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'center' }}>
            <View style={{ backgroundColor: isTV ? '#f59e0b' : '#3b82f6', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{isTV ? 'TV' : 'Movie'}</Text>
            </View>
            {hasIndonesian(item) && (
              <View style={{ backgroundColor: '#ef4444', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>🇮🇩 ID</Text>
              </View>
            )}
            {item.releaseDate ? <Text style={{ fontSize: 12, color: '#888' }}>{item.releaseDate.slice(0, 4)}</Text> : null}
            {item.imdbRatingValue ? (
              <Text style={{ fontSize: 12, color: '#f5c518', fontWeight: '600' }}>
                <Icon name="star" size={10} color="#f5c518" /> {item.imdbRatingValue}
              </Text>
            ) : null}
          </View>
        </View>
        <Text numberOfLines={2} style={{ color: '#888', fontSize: 12 }}>{item.description}</Text>
      </View>
    </TouchableOpacityAnimated>
  );
}

const resultStyles = StyleSheet.create({
  listContainer: { flexDirection: 'row', borderRadius: 16, elevation: 4, minHeight: 100, overflow: 'hidden' },
  listImage: { width: 80, height: 150, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
});

// ============ HISTORY ITEM ============
function SearchHistoryItem({ item, index, onSelect }: { item: string; index: number; onSelect: (t: string) => void }) {
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
            DatabaseManager.set('searchHistory', JSON.stringify(
              (JSON.parse((await DatabaseManager.get('searchHistory')) ?? '[]') as string[]).filter((_, i) => i !== index),
            ));
          }}>
          <Icon name="times" size={25} color="#ff0f0f" />
        </TouchableOpacityReactNative>
      </TouchableOpacityReactNative>
    </View>
  );
}

// ============ MAIN BROWSE PAGE ============
function BrowsePage({ navigation }: { navigation: any }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const insets = useSafeAreaInsets();

  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState<ContentType>('anime');
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [currentQuery, setCurrentQuery] = useState('');

  // Search results state (union type)
  const [animeResults, setAnimeResults] = useState<SearchAnimeList[] | null>(null);
  const [mangaResults, setMangaResults] = useState<ComicsSearch[] | null>(null);
  const [novelResults, setNovelResults] = useState<NovelSearch[] | null>(null);
  const [filmResults, setFilmResults] = useState<MovieboxSearchItem[] | null>(null);

  const textInputRef = useRef<TextInputType>(null);
  const abortController = useRef<AbortController | null>(null);
  abortController.current ??= new AbortController();
  const isFocus = useRef(true);

  const searchHistory = useModifiedKeyValueIfFocused(
    'searchHistory',
    result => JSON.parse(result) as string[],
  );

  const clearSearch = useCallback(() => {
    setAnimeResults(null);
    setMangaResults(null);
    setNovelResults(null);
    setFilmResults(null);
    setShowSearchHistory(false);
    setSearchText('');
    setCurrentQuery('');
  }, []);

  const submitSearch = useCallback(() => {
    if (searchText.trim() === '') return;
    setShowSearchHistory(false);
    setSearchLoading(true);
    textInputRef.current?.blur();

    // Clear previous results
    setAnimeResults(null);
    setMangaResults(null);
    setNovelResults(null);
    setFilmResults(null);

    const signal = abortController.current?.signal;

    let searchPromise: Promise<void>;

    switch (selectedType) {
      case 'anime':
        searchPromise = AnimeAPI.search(searchText, signal)
          .then(res => { setAnimeResults(res.result); setCurrentQuery(searchText); })
          .catch(e => { if (e.name !== 'AbortError') DialogManager.alert('Error', e.message || 'Gagal mencari anime'); });
        break;
      case 'manga':
        searchPromise = comicsSearch(searchText, signal)
          .then(comics => {
            setMangaResults(comics);
            setCurrentQuery(searchText);
          })
          .catch(e => { if (e.name !== 'AbortError') DialogManager.alert('Error', e.message || 'Gagal mencari komik'); });
        break;
      case 'novel':
        searchPromise = novelSearch(searchText, signal)
          .then(res => { setNovelResults(res); setCurrentQuery(searchText); })
          .catch(e => { if (e.name !== 'AbortError') DialogManager.alert('Error', 'Gagal mencari novel'); });
        break;
      case 'film':
        searchPromise = searchMoviebox(searchText, 0, signal)
          .then(res => { setFilmResults(res.items); setCurrentQuery(searchText); })
          .catch(e => { if (e.name !== 'AbortError') DialogManager.alert('Error', e.message || 'Gagal mencari film'); });
        break;
      default:
        searchPromise = Promise.resolve();
    }

    searchPromise.finally(() => {
      if (searchHistory.includes(searchText)) {
        searchHistory.splice(searchHistory.indexOf(searchText), 1);
      }
      searchHistory.unshift(searchText);
      DatabaseManager.set('searchHistory', JSON.stringify(searchHistory));
      setSearchLoading(false);
    });
  }, [searchHistory, searchText, selectedType]);

  useFocusEffect(
    useCallback(() => {
      const timeout = setTimeout(() => { isFocus.current = true; }, 200);
      const kbEvent = Keyboard.addListener('keyboardDidHide', () => textInputRef.current?.blur());
      return () => { isFocus.current = false; kbEvent.remove(); clearTimeout(timeout); clearSearch(); };
    }, [clearSearch]),
  );

  useFocusEffect(
    useCallback(() => {
      if (showSearchHistory) {
        const handler = BackHandler.addEventListener('hardwareBackPress', () => {
          setShowSearchHistory(false);
          textInputRef.current?.blur();
          return true;
        });
        return () => handler.remove();
      }
    }, [showSearchHistory]),
  );

  const onTextInputFocus = useCallback(() => {
    if (!isFocus.current) { textInputRef.current?.blur(); isFocus.current = true; return; }
    setShowSearchHistory(true);
  }, []);

  const hasResults = (animeResults?.length ?? 0) > 0 || (mangaResults?.length ?? 0) > 0 ||
    (novelResults?.length ?? 0) > 0 || (filmResults?.length ?? 0) > 0;
  const isSearchEmpty = !hasResults && (animeResults !== null || mangaResults !== null || novelResults !== null || filmResults !== null);

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0f0f0f' : '#fafafa' }}>
      {/* Search Bar */}
      <View style={{ paddingTop: insets.top, paddingHorizontal: 12, paddingBottom: 8, backgroundColor: isDark ? '#0f0f0f' : '#fafafa' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {showSearchHistory && (
            <TouchableOpacityReactNative hitSlop={15} onPress={() => { setShowSearchHistory(false); textInputRef.current?.blur(); }} style={{ padding: 4 }}>
              <Icon name="angle-left" size={26} color="#3b82f6" />
            </TouchableOpacityReactNative>
          )}
          <View style={{ flex: 1, height: 42 }}>
            <Searchbar
              onSubmitEditing={submitSearch}
              onIconPress={submitSearch}
              onChangeText={setSearchText}
              onFocus={onTextInputFocus}
              placeholder="Cari anime, komik, novel, film..."
              value={searchText}
              autoCorrect={false}
              ref={textInputRef}
              style={{ height: 42, borderRadius: 12, backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0', elevation: 0 }}
              inputStyle={{ minHeight: 0, fontSize: 14 }}
              iconColor={isDark ? '#666' : '#999'}
            />
          </View>
        </View>
      </View>

      {/* Content Type Chips */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 12, gap: 8, paddingBottom: 8 }}>
        {CONTENT_TYPES.map(ct => (
          <TouchableOpacityReactNative
            key={ct.key}
            onPress={() => setSelectedType(ct.key)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
              backgroundColor: selectedType === ct.key ? '#3b82f6' : (isDark ? '#1a1a1a' : '#f0f0f0'),
              borderWidth: 1, borderColor: selectedType === ct.key ? '#3b82f6' : (isDark ? '#333' : '#ddd'),
            }}>
            <MaterialIcon name={ct.icon} size={16} color={selectedType === ct.key ? '#fff' : (isDark ? '#888' : '#666')} />
            <Text style={{ fontWeight: '700', fontSize: 13, color: selectedType === ct.key ? '#fff' : (isDark ? '#aaa' : '#555') }}>
              {ct.label}
            </Text>
          </TouchableOpacityReactNative>
        ))}
      </View>

      {/* Genre Chips (only show when not searching) */}
      {!showSearchHistory && !hasResults && !isSearchEmpty && !searchLoading && selectedType !== 'novel' && selectedType !== 'film' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingBottom: 10 }}>
          {ANIME_GENRES.slice(0, 15).map(genre => (
            <TouchableOpacityReactNative
              key={genre}
              onPress={() => navigation.dispatch(StackActions.push('SeeMore', {
                type: selectedType === 'manga' ? 'ComicsGenre' : 'AnimeGenre',
                genre: genre.toLowerCase().replace(/ /g, '-'),
              }))}
              style={{
                paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                backgroundColor: isDark ? '#1a1a1a' : '#e8e8e8',
                borderWidth: 1, borderColor: isDark ? '#2a2a2a' : '#ddd',
              }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#aaa' : '#555' }}>{genre}</Text>
            </TouchableOpacityReactNative>
          ))}
        </ScrollView>
      )}

      <View style={{ flex: 1 }}>
        {/* Loading */}
        {searchLoading && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, padding: 16 }}>
            <ActivityIndicator size="small" color="#3b82f6" />
            <Text style={[globalStyles.text, { opacity: 0.8 }]}>Mencari...</Text>
          </View>
        )}

        {/* Search Results */}
        {hasResults && !searchLoading && (
          <View style={{ flex: 1 }}>
            <Text style={[globalStyles.text, { fontWeight: 'bold', fontSize: 13, textAlign: 'center', marginVertical: 4 }]}>
              Hasil untuk: {currentQuery}
            </Text>
            <FlashList
        estimatedItemSize={200}
              data={
                selectedType === 'anime' ? animeResults ?? [] :
                selectedType === 'manga' ? mangaResults ?? [] :
                selectedType === 'film' ? filmResults ?? [] :
                novelResults ?? []
              }
              keyExtractor={(item: any, i: number) => `${selectedType}-${i}`}
              renderItem={({ item }: any) => {
                if (selectedType === 'anime') return <AnimeSearchItem item={item} navigation={navigation} />;
                if (selectedType === 'manga') return <MangaSearchItem item={item} navigation={navigation} />;
                if (selectedType === 'film') return <FilmSearchItem item={item} navigation={navigation} />;
                return <NovelSearchItem item={item} navigation={navigation} />;
              }}
              contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 12 }}
              ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
            />
            <TouchableOpacityAnimated
              style={browseStyles.closeBtn}
              onPress={clearSearch}
              entering={ZoomIn}
              exiting={ZoomOut}>
              <Icon name="times" size={30} style={{ alignSelf: 'center' }} color="#dadada" />
            </TouchableOpacityAnimated>
          </View>
        )}

        {/* Empty */}
        {isSearchEmpty && !searchLoading && (
          <Reanimated.View entering={FadeInUp} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Icon name="search-minus" size={60} color={theme.colors.outline} style={{ marginBottom: 15 }} />
            <Text style={[globalStyles.text, { fontSize: 20, fontWeight: 'bold', marginBottom: 8 }]}>Tidak ditemukan</Text>
            <Text style={[globalStyles.text, { fontSize: 14, opacity: 0.6, textAlign: 'center', paddingHorizontal: 40 }]}>
              Coba kata kunci lain.
            </Text>
            <TouchableOpacityAnimated style={browseStyles.closeBtn} onPress={clearSearch} entering={ZoomIn} exiting={ZoomOut}>
              <Icon name="times" size={30} style={{ alignSelf: 'center' }} color="#dadada" />
            </TouchableOpacityAnimated>
          </Reanimated.View>
        )}

        {/* Default Browse Content (when not searching) */}
        {!hasResults && !isSearchEmpty && !searchLoading && !showSearchHistory && selectedType !== 'novel' && selectedType !== 'film' && (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={[globalStyles.text, { fontSize: 16, fontWeight: '700', marginBottom: 12 }]}>
              Jelajahi Genre
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ANIME_GENRES.map(genre => (
                <TouchableOpacityReactNative
                  key={genre}
                  onPress={() => navigation.dispatch(StackActions.push('SeeMore', {
                    type: selectedType === 'manga' ? 'ComicsGenre' : 'AnimeGenre',
                    genre: genre.toLowerCase().replace(/ /g, '-'),
                  }))}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                    backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0',
                    borderWidth: 1, borderColor: isDark ? '#2a2a2a' : '#e0e0e0',
                  }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#ccc' : '#444' }}>{genre}</Text>
                </TouchableOpacityReactNative>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Search History Overlay */}
        {showSearchHistory && (
          <Reanimated.View
            entering={ZoomIn.springify().withInitialValues({ transform: [{ scale: 0.5 }] })}
            exiting={ZoomOut.springify()}
            style={browseStyles.historyContainer}>
            <FlashList
        estimatedItemSize={200}
              drawDistance={250}
              keyboardShouldPersistTaps="always"
              data={searchHistory}
              keyExtractor={(name, index) => name + String(index)}
              renderItem={({ item, index }) => (
                <SearchHistoryItem item={item} index={index} onSelect={setSearchText} />
              )}
              ItemSeparatorComponent={() => (
                <View style={{ borderBottomWidth: 0.5, borderColor: colorScheme === 'dark' ? 'gray' : 'black', width: '100%' }} />
              )}
              ListHeaderComponent={
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 7, marginBottom: 5 }}>
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

const browseStyles = StyleSheet.create({
  closeBtn: {
    position: 'absolute', backgroundColor: '#dd0d0dd3', borderRadius: 20,
    padding: 10, paddingHorizontal: 12, bottom: 20, right: 10, zIndex: 1,
  },
  historyContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10,
    padding: 10, elevation: 5, backgroundColor: 'rgba(0,0,0,0.95)',
  },
});

export default memo(BrowsePage);
