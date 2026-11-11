import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StackActions } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ComicsListContext,
  EpisodeBaruHomeContext,
  MovieListHomeContext,
} from '../../misc/context';
import { tSync, useLanguage } from '../../misc/LanguageContext';
import { NewAnimeList } from '../../types/anime';
import { RootStackNavigator } from '../../types/navigation';
import AnimeAPI from '../../utils/AnimeAPI';
import {
  getLatestComicsReleases,
  getPopularComicsReleases,
  getManhwaWebtoonReleases,
  getComicsByGenre,
  LatestComicsRelease,
} from '../../utils/scrapers/comicsv2';
import { getLatestNovels, getPopularNovels, LatestNovel } from '../../utils/scrapers/meionovel';
import { FilmAPI } from '../../utils/FilmAPI';
import { FilmSearchItem } from '../../types/film';
import * as anichin from '../../utils/scrapers/anichin';
import { ListAnimeComponent } from '../misc/ListAnimeComponent';
import ImageLoading from '../misc/ImageLoading';
import { MIN_IMAGE_WIDTH } from './AnimePage';

function mergeUniqueBy<T>(prev: T[], next: T[], getKey: (item: T) => string): T[] {
  if (!next || next.length === 0) return prev;
  const seen = new Set<string>();
  const result: T[] = [];
  for (let i = 0; i < prev.length; i++) {
    const item = prev[i];
    const key = getKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  for (let i = 0; i < next.length; i++) {
    const item = next[i];
    const key = getKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

const getTitleKey = (item: { title?: string }) => (item.title || '').trim().toLowerCase();
const getFilmKey = (item: { id?: string; title?: string }) => String(item.id || item.title || '');

const filmItemStyles = StyleSheet.create({
  container: { margin: 4 },
  title: { fontSize: 12, fontWeight: '600', marginTop: 4 },
});

const FilmGridItem = memo(
  function FilmGridItem({
    item,
    isDark,
    navigation,
    itemWidth,
  }: {
    item: FilmSearchItem;
    isDark: boolean;
    navigation: any;
    itemWidth: number;
  }) {
    const imageHeight = Math.round(itemWidth / 0.7);
    const onPress = useCallback(() => {
      navigation.dispatch(StackActions.push('FilmDetail', { data: item }));
    }, [item, navigation]);

    return (
      <TouchableOpacity style={[filmItemStyles.container, { width: itemWidth }]} onPress={onPress}>
        <ImageLoading
          resizeMode="cover"
          source={{ uri: item.poster }}
          style={{ width: itemWidth, height: imageHeight, borderRadius: 8 }}
        />
        <Text numberOfLines={2} style={[filmItemStyles.title, { color: isDark ? '#e0e0e0' : '#222' }]}>
          {item.title}
        </Text>
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.isDark === next.isDark &&
    prev.itemWidth === next.itemWidth,
);

type Props = NativeStackScreenProps<RootStackNavigator, 'SeeMore'>;
type ItemType = NewAnimeList | LatestComicsRelease | LatestNovel | FilmSearchItem;

interface SeeMoreUIProps {
  data: ItemType[];
  type:
    | 'AnimeList'
    | 'MovieList'
    | 'ComicsList'
    | 'ComicsPopular'
    | 'ComicsManhwa'
    | 'NovelsList'
    | 'NovelsPopular'
    | 'AnimeGenre'
    | 'ComicsGenre'
    | 'FilmList'
    | 'DonghuaList';
  genreName?: string;
  onLoadMore: () => Promise<void>;
  navigation: Props['navigation'];
}

const SeeMoreUI = memo(
  ({
    data,
    type,
    genreName,
    onLoadMore,
    navigation,
    initialLoading,
  }: SeeMoreUIProps & { initialLoading?: boolean }) => {
    const [isLoading, setIsLoading] = useState(false);
    const dimensions = useWindowDimensions();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();
    const { t } = useLanguage();

    const numColumns = useMemo(() => {
      const columnWidth = Math.max((dimensions.width * 120) / 200 / 1.9, MIN_IMAGE_WIDTH);
      return Math.max(2, Math.floor(dimensions.width / columnWidth));
    }, [dimensions.width]);

    const filmItemWidth = useMemo(() => {
      const availableWidth = dimensions.width - insets.left - insets.right - 16;
      return Math.max(80, Math.floor(availableWidth / numColumns) - 8);
    }, [dimensions.width, insets.left, insets.right, numColumns]);

    useEffect(() => {
      let headerTitle = t('lists.headerLatestAnime');
      if (type === 'MovieList') headerTitle = t('lists.headerLatestMovies');
      else if (type === 'ComicsList') headerTitle = t('lists.headerLatestComics');
      else if (type === 'ComicsPopular') headerTitle = t('lists.headerPopularComics');
      else if (type === 'ComicsManhwa') headerTitle = t('lists.headerManhwaWebtoon');
      else if (type === 'NovelsList') headerTitle = t('lists.headerLatestNovels');
      else if (type === 'NovelsPopular') headerTitle = t('lists.headerPopularNovels');
      else if (type === 'AnimeGenre' || type === 'ComicsGenre') {
        headerTitle = t('lists.headerGenrePrefix', { genre: genreName || t('common.all') });
      }
      else if (type === 'FilmList') headerTitle = t('lists.headerLatestFilms');
      else if (type === 'DonghuaList') headerTitle = t('lists.headerLatestDonghua');

      navigation.setOptions({ headerTitle });
    }, [navigation, type, genreName, t]);

    const handlePressLoadMore = useCallback(async () => {
      if (isLoading) return;
      setIsLoading(true);
      try {
        await onLoadMore();
      } catch {
        ToastAndroid.show(tSync('lists.loadMoreError'), ToastAndroid.SHORT);
      } finally {
        setIsLoading(false);
      }
    }, [isLoading, onLoadMore]);

    const keyExtractor = useCallback((item: any, index: number) => {
      return (
        item.streamingLink ||
        item.detailUrl ||
        item.id ||
        item.title ||
        String(index)
      );
    }, []);

    const renderItem = useCallback(
      ({ item }: { item: ItemType }) => {
        if (type === 'MovieList' || type === 'DonghuaList') {
          return (
            <ListAnimeComponent
              isGrid={true}
              isDark={isDark}
              type="anime"
              newAnimeData={item as NewAnimeList}
              navigationProp={navigation}
            />
          );
        }
        if (
          type === 'ComicsList' ||
          type === 'ComicsPopular' ||
          type === 'ComicsManhwa' ||
          type === 'ComicsGenre'
        ) {
          return (
            <ListAnimeComponent
              isGrid={true}
              isDark={isDark}
              fromSeeMore
              type="comics"
              newAnimeData={item as LatestComicsRelease}
              navigationProp={navigation}
            />
          );
        }
        if (type === 'NovelsList' || type === 'NovelsPopular') {
          return (
            <ListAnimeComponent
              isGrid={true}
              isDark={isDark}
              type="novel"
              newAnimeData={item as LatestNovel}
              navigationProp={navigation}
            />
          );
        }
        if (type === 'FilmList') {
          return (
            <FilmGridItem
              item={item as FilmSearchItem}
              isDark={isDark}
              navigation={navigation}
              itemWidth={filmItemWidth}
            />
          );
        }
        return (
          <ListAnimeComponent
            isGrid={true}
            isDark={isDark}
            type="anime"
            newAnimeData={item as NewAnimeList}
            navigationProp={navigation}
          />
        );
      },
      [type, navigation, isDark, filmItemWidth],
    );

    const contentContainerStyle = useMemo(
      () => ({
        paddingLeft: insets.left + 8,
        paddingRight: insets.right + 8,
        paddingBottom: insets.bottom + 16,
        paddingTop: 8,
      }),
      [insets.left, insets.right, insets.bottom],
    );

    const footerComponent = useMemo(
      () => (
        <View style={footerStyles.wrapper}>
          {isLoading ? <ActivityIndicator style={footerStyles.spinner} /> : null}
          <Button
            mode="contained-tonal"
            style={footerStyles.button}
            onPress={handlePressLoadMore}
            disabled={isLoading}>
            {t('lists.seeMoreBtn')}
          </Button>
        </View>
      ),
      [isLoading, handlePressLoadMore, t],
    );

    if (initialLoading && data.length === 0) {
      return (
        <View style={footerStyles.loadingCenter}>
          <ActivityIndicator size="large" />
        </View>
      );
    }

    return (
      <View style={footerStyles.flex}>
        <FlashList
          key={numColumns}
          contentContainerStyle={contentContainerStyle}
          data={data}
          extraData={colorScheme}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          numColumns={numColumns}
          drawDistance={350}
          ListFooterComponent={footerComponent}
        />
      </View>
    );
  },
);

const footerStyles = StyleSheet.create({
  flex: { flex: 1 },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  wrapper: { paddingVertical: 8 },
  spinner: { marginTop: 10 },
  button: { marginTop: 6 },
});

const AnimeContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const { paramsState, setParamsState } = useContext(EpisodeBaruHomeContext);
  const data = paramsState?.newAnime || [];
  const pageRef = useRef(1);

  const handleLoadMore = useCallback(async () => {
    pageRef.current += 1;
    const newData = await AnimeAPI.newAnime(pageRef.current);

    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show(tSync('lists.noMoreAllAnime'), ToastAndroid.SHORT);
      return;
    }

    if (setParamsState) {
      setParamsState(prev => ({
        ...prev,
        newAnime: mergeUniqueBy(prev.newAnime, newData, getTitleKey),
      }));
    }
  }, [setParamsState]);

  return (
    <SeeMoreUI data={data} type="AnimeList" onLoadMore={handleLoadMore} navigation={navigation} />
  );
};

const MovieContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const { paramsState, setParamsState } = useContext(MovieListHomeContext);
  const data = (paramsState as unknown as NewAnimeList[]) || [];
  const pageRef = useRef(1);

  const handleLoadMore = useCallback(async () => {
    pageRef.current += 1;
    const res = await AnimeAPI.searchMovies(pageRef.current);
    if (!res.result || res.result.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show(tSync('lists.noMoreAllMovies'), ToastAndroid.SHORT);
      return;
    }
    const mappedMovies: NewAnimeList[] = res.result.map(item => ({
      title: item.title,
      episode: 'Movie',
      thumbnailUrl: item.thumbnailUrl,
      streamingLink: item.animeUrl,
      releaseDate: '',
      releaseDay: '',
    }));
    if (setParamsState) {
      setParamsState(prev =>
        mergeUniqueBy((prev as unknown as NewAnimeList[]) || [], mappedMovies, getTitleKey) as any,
      );
    }
  }, [setParamsState]);

  return (
    <SeeMoreUI data={data} type="MovieList" onLoadMore={handleLoadMore} navigation={navigation} />
  );
};

const ComicsContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const { paramsState, setParamsState } = useContext(ComicsListContext);
  const data = paramsState || [];
  const pageRef = useRef(Math.max(1, Math.floor((data.length ?? 0) / 10)));

  const handleLoadMore = useCallback(async () => {
    pageRef.current += 1;
    const newData = await getLatestComicsReleases(pageRef.current);

    if ('isError' in newData) {
      pageRef.current -= 1;
      throw new Error('API Error');
    }

    if (setParamsState) {
      setParamsState(prev =>
        mergeUniqueBy(prev || [], (newData || []) as LatestComicsRelease[], getTitleKey),
      );
    }
  }, [setParamsState]);

  return (
    <SeeMoreUI data={data} type="ComicsList" onLoadMore={handleLoadMore} navigation={navigation} />
  );
};

const ComicsPopularContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const [data, setData] = useState<LatestComicsRelease[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const pageRef = useRef(1);

  useEffect(() => {
    const controller = new AbortController();
    setInitialLoading(true);
    getPopularComicsReleases(1, controller.signal)
      .then(d => setData(d))
      .catch(() => ToastAndroid.show(tSync('lists.loadPopularComicsFailed'), ToastAndroid.SHORT))
      .finally(() => setInitialLoading(false));
    return () => controller.abort();
  }, []);

  const handleLoadMore = useCallback(async () => {
    pageRef.current += 1;
    const newData = await getPopularComicsReleases(pageRef.current);
    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show(tSync('lists.noMoreAllComics'), ToastAndroid.SHORT);
      return;
    }
    setData(prev => mergeUniqueBy(prev, newData, getTitleKey));
  }, []);

  return (
    <SeeMoreUI
      data={data}
      type="ComicsPopular"
      onLoadMore={handleLoadMore}
      navigation={navigation}
      initialLoading={initialLoading}
    />
  );
};

const ComicsManhwaContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const [data, setData] = useState<LatestComicsRelease[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const pageRef = useRef(1);

  useEffect(() => {
    const controller = new AbortController();
    setInitialLoading(true);
    getManhwaWebtoonReleases(1, controller.signal)
      .then(d => setData(d))
      .catch(() => ToastAndroid.show(tSync('lists.loadManhwaFailed'), ToastAndroid.SHORT))
      .finally(() => setInitialLoading(false));
    return () => controller.abort();
  }, []);

  const handleLoadMore = useCallback(async () => {
    pageRef.current += 1;
    const newData = await getManhwaWebtoonReleases(pageRef.current);
    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show(tSync('lists.noMoreAllComics'), ToastAndroid.SHORT);
      return;
    }
    setData(prev => mergeUniqueBy(prev, newData, getTitleKey));
  }, []);

  return (
    <SeeMoreUI
      data={data}
      type="ComicsManhwa"
      onLoadMore={handleLoadMore}
      navigation={navigation}
      initialLoading={initialLoading}
    />
  );
};

const NovelsContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const [data, setData] = useState<LatestNovel[]>([]);
  const pageRef = useRef(1);

  useEffect(() => {
    getLatestNovels(1).then(d => setData(d)).catch(() => {});
  }, []);

  const handleLoadMore = useCallback(async () => {
    pageRef.current += 1;
    const newData = await getLatestNovels(pageRef.current);
    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show(tSync('lists.noMoreAllNovels'), ToastAndroid.SHORT);
      return;
    }
    setData(prev => mergeUniqueBy(prev, newData, getTitleKey));
  }, []);

  return (
    <SeeMoreUI data={data} type="NovelsList" onLoadMore={handleLoadMore} navigation={navigation} />
  );
};

const NovelsPopularContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const [data, setData] = useState<LatestNovel[]>([]);
  const pageRef = useRef(1);

  useEffect(() => {
    getPopularNovels(1).then(d => setData(d)).catch(() => {});
  }, []);

  const handleLoadMore = useCallback(async () => {
    pageRef.current += 1;
    const newData = await getPopularNovels(pageRef.current);
    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show(tSync('lists.noMoreAllNovels'), ToastAndroid.SHORT);
      return;
    }
    setData(prev => mergeUniqueBy(prev, newData, getTitleKey));
  }, []);

  return (
    <SeeMoreUI data={data} type="NovelsPopular" onLoadMore={handleLoadMore} navigation={navigation} />
  );
};

const AnimeGenreContainer = ({ navigation, genre }: { navigation: Props['navigation']; genre: string }) => {
  const [data, setData] = useState<NewAnimeList[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const pageRef = useRef(1);

  const genreName = genre.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  useEffect(() => {
    pageRef.current = 1;
    setInitialLoading(true);
    AnimeAPI.getAnimeByGenre(genre, 1)
      .then(d => setData(d))
      .catch(() => ToastAndroid.show(tSync('lists.loadAnimeGenreFailed'), ToastAndroid.SHORT))
      .finally(() => setInitialLoading(false));
  }, [genre]);

  const handleLoadMore = useCallback(async () => {
    pageRef.current += 1;
    const newData = await AnimeAPI.getAnimeByGenre(genre, pageRef.current);
    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show(tSync('lists.noMoreAllAnime'), ToastAndroid.SHORT);
      return;
    }
    setData(prev => mergeUniqueBy(prev, newData, getTitleKey));
  }, [genre]);

  return (
    <SeeMoreUI
      data={data}
      type="AnimeGenre"
      genreName={genreName}
      onLoadMore={handleLoadMore}
      navigation={navigation}
      initialLoading={initialLoading}
    />
  );
};

const ComicsGenreContainer = ({ navigation, genre }: { navigation: Props['navigation']; genre: string }) => {
  const [data, setData] = useState<LatestComicsRelease[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const pageRef = useRef(1);

  const genreName = genre.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  useEffect(() => {
    pageRef.current = 1;
    setInitialLoading(true);
    getComicsByGenre(genre, 1)
      .then(d => setData(d))
      .catch(() => ToastAndroid.show(tSync('lists.loadComicsGenreFailed'), ToastAndroid.SHORT))
      .finally(() => setInitialLoading(false));
  }, [genre]);

  const handleLoadMore = useCallback(async () => {
    pageRef.current += 1;
    const newData = await getComicsByGenre(genre, pageRef.current);
    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show(tSync('lists.noMoreAllComics'), ToastAndroid.SHORT);
      return;
    }
    setData(prev => mergeUniqueBy(prev, newData, getTitleKey));
  }, [genre]);

  return (
    <SeeMoreUI
      data={data}
      type="ComicsGenre"
      genreName={genreName}
      onLoadMore={handleLoadMore}
      navigation={navigation}
      initialLoading={initialLoading}
    />
  );
};

const FilmContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const [data, setData] = useState<FilmSearchItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const pageRef = useRef(1);

  useEffect(() => {
    setInitialLoading(true);
    FilmAPI.getTrending(1)
      .then(d => setData(d))
      .catch(() => ToastAndroid.show(tSync('lists.loadFilmFailed'), ToastAndroid.SHORT))
      .finally(() => setInitialLoading(false));
  }, []);

  const handleLoadMore = useCallback(async () => {
    pageRef.current += 1;
    const newData = await FilmAPI.getTrending(pageRef.current);
    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show(tSync('lists.noMoreAllMovies'), ToastAndroid.SHORT);
      return;
    }
    setData(prev => mergeUniqueBy(prev, newData, getFilmKey));
  }, []);

  return (
    <SeeMoreUI
      data={data}
      type="FilmList"
      onLoadMore={handleLoadMore}
      navigation={navigation}
      initialLoading={initialLoading}
    />
  );
};

const DonghuaContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const [data, setData] = useState<NewAnimeList[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const pageRef = useRef(1);

  useEffect(() => {
    setInitialLoading(true);
    anichin
      .latestAnime(1)
      .then(d => setData(d))
      .catch(() => ToastAndroid.show(tSync('lists.loadDonghuaFailed'), ToastAndroid.SHORT))
      .finally(() => setInitialLoading(false));
  }, []);

  const handleLoadMore = useCallback(async () => {
    pageRef.current += 1;
    const newData = await anichin.latestAnime(pageRef.current);
    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show(tSync('lists.noMoreAllDonghua'), ToastAndroid.SHORT);
      return;
    }
    setData(prev => mergeUniqueBy(prev, newData, getTitleKey));
  }, []);

  return (
    <SeeMoreUI
      data={data}
      type="DonghuaList"
      onLoadMore={handleLoadMore}
      navigation={navigation}
      initialLoading={initialLoading}
    />
  );
};

function SeeMore(props: Props) {
  const { type, genre } = props.route.params;
  switch (type) {
    case 'AnimeGenre':
      return <AnimeGenreContainer navigation={props.navigation} genre={genre || ''} />;
    case 'ComicsGenre':
      return <ComicsGenreContainer navigation={props.navigation} genre={genre || ''} />;
    case 'MovieList':
      return <MovieContainer navigation={props.navigation} />;
    case 'ComicsList':
      return <ComicsContainer navigation={props.navigation} />;
    case 'ComicsPopular':
      return <ComicsPopularContainer navigation={props.navigation} />;
    case 'ComicsManhwa':
      return <ComicsManhwaContainer navigation={props.navigation} />;
    case 'NovelsList':
      return <NovelsContainer navigation={props.navigation} />;
    case 'NovelsPopular':
      return <NovelsPopularContainer navigation={props.navigation} />;
    case 'FilmList':
      return <FilmContainer navigation={props.navigation} />;
    case 'DonghuaList':
      return <DonghuaContainer navigation={props.navigation} />;
    case 'AnimeList':
    default:
      return <AnimeContainer navigation={props.navigation} />;
  }
}

export default memo(SeeMore);
