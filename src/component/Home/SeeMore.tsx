import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StackActions } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
import { NewAnimeList } from '../../types/anime';
import { RootStackNavigator } from '../../types/navigation';
import AnimeAPI from '../../utils/AnimeAPI';
import { getLatestComicsReleases, getPopularComicsReleases, getComicsByGenre, LatestComicsRelease } from '../../utils/scrapers/comicsv2';
import { getLatestNovels, getPopularNovels, LatestNovel } from '../../utils/scrapers/meionovel';
import { getTrending, MovieboxSearchItem } from '../../utils/scrapers/moviebox';
import { ListAnimeComponent } from '../misc/ListAnimeComponent';
import ImageLoading from '../misc/ImageLoading';
import { MIN_IMAGE_WIDTH, RenderScrollComponent } from './AnimePage';

const filmItemStyles = StyleSheet.create({
  container: { margin: 4 },
  title: { fontSize: 12, fontWeight: '600', marginTop: 4 },
});

const FilmGridItem = memo(function FilmGridItem({ item, isDark, navigation, itemWidth }: { item: MovieboxSearchItem; isDark: boolean; navigation: any; itemWidth: number }) {
  const imageHeight = Math.round(itemWidth / 0.7);
  return (
    <TouchableOpacity
      style={[filmItemStyles.container, { width: itemWidth }]}
      onPress={() => navigation.dispatch(StackActions.push('FilmDetail', { data: item }))}>
      <ImageLoading
        resizeMode="cover"
        source={{ uri: item.cover?.url }}
        style={{ width: itemWidth, height: imageHeight, borderRadius: 8 }}
      />
      <Text numberOfLines={2} style={[filmItemStyles.title, { color: isDark ? '#e0e0e0' : '#222' }]}>
        {item.title}
      </Text>
    </TouchableOpacity>
  );
}, (prev, next) => prev.item.subjectId === next.item.subjectId && prev.isDark === next.isDark);

type Props = NativeStackScreenProps<RootStackNavigator, 'SeeMore'>;
type ItemType = NewAnimeList | LatestComicsRelease | LatestNovel | MovieboxSearchItem;

interface SeeMoreUIProps {
  data: ItemType[];
  type: 'AnimeList' | 'MovieList' | 'ComicsList' | 'ComicsPopular' | 'NovelsList' | 'NovelsPopular' | 'AnimeGenre' | 'ComicsGenre' | 'FilmList';
  genreName?: string;
  onLoadMore: () => Promise<void>;
  navigation: Props['navigation'];
}

const SeeMoreUI = memo(({ data, type, genreName, onLoadMore, navigation, initialLoading }: SeeMoreUIProps & { initialLoading?: boolean }) => {
  const [isLoading, setIsLoading] = useState(false);
  const dimensions = useWindowDimensions();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  let columnWidth = (dimensions.width * 120) / 200 / 1.9;
  columnWidth = Math.max(columnWidth, MIN_IMAGE_WIDTH);
  const numColumns = Math.floor(dimensions.width / columnWidth);

  useEffect(() => {
    let headerTitle = 'Anime terbaru';
    if (type === 'MovieList') headerTitle = 'Movie terbaru';
    else if (type === 'ComicsList') headerTitle = 'Komik terbaru';
    else if (type === 'ComicsPopular') headerTitle = 'Komik populer';
    else if (type === 'NovelsList') headerTitle = 'Novel terbaru';
    else if (type === 'NovelsPopular') headerTitle = 'Novel populer';
    else if (type === 'AnimeGenre' || type === 'ComicsGenre') headerTitle = `Genre: ${genreName || 'Semua'}`;
    else if (type === 'FilmList') headerTitle = 'Film Terbaru';

    navigation.setOptions({
      headerTitle,
    });
  }, [navigation, type, genreName]);

  const handlePressLoadMore = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await onLoadMore();
    } catch (e) {
      ToastAndroid.show('Error saat memuat item', ToastAndroid.SHORT);
    } finally {
      setIsLoading(false);
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: ItemType }) => {
      if (type === 'MovieList') {
        return (
          <ListAnimeComponent
            isGrid={true}
            type="anime"
            newAnimeData={item as NewAnimeList}
            navigationProp={navigation}
          />
        );
      }
      if (type === 'ComicsList' || type === 'ComicsPopular' || type === 'ComicsGenre') {
        return (
          <ListAnimeComponent
            isGrid={true}
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
            type="novel"
            newAnimeData={item as LatestNovel}
            navigationProp={navigation}
          />
        );
      }
      if (type === 'FilmList') {
        const availableWidth = dimensions.width - insets.left - insets.right - 16;
        const filmItemWidth = Math.floor(availableWidth / numColumns) - 8;
        return (
          <FilmGridItem
            item={item as MovieboxSearchItem}
            isDark={isDark}
            navigation={navigation}
            itemWidth={filmItemWidth}
          />
        );
      }
      return (
        <ListAnimeComponent
          isGrid={true}
          type="anime"
          newAnimeData={item as NewAnimeList}
          navigationProp={navigation}
        />
      );
    },
    [type, navigation, isDark],
  );

  if (initialLoading && data.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlashList
        key={numColumns}
        estimatedItemSize={180}
        contentContainerStyle={{
          paddingLeft: insets.left + 8,
          paddingRight: insets.right + 8,
          paddingBottom: insets.bottom + 16,
          paddingTop: 8,
        }}
        data={data}
        extraData={colorScheme}
        keyExtractor={(item: any, index: number) => item.subjectId || item.title || String(index)}
        renderItem={renderItem}
        numColumns={numColumns}
        removeClippedSubviews
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={3}
        ListFooterComponent={
          <>
            {isLoading && <ActivityIndicator style={{ marginTop: 10 }} />}
            <Button
              mode="contained-tonal"
              style={{ marginTop: 6 }}
              onPress={handlePressLoadMore}
              disabled={isLoading}>
              Lihat lebih banyak
            </Button>
          </>
        }
      />
    </View>
  );
});

const AnimeContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const { paramsState, setParamsState } = useContext(EpisodeBaruHomeContext);
  const data = paramsState?.newAnime || [];
  const pageRef = useRef(1);

  const handleLoadMore = async () => {
    pageRef.current += 1;
    const newData = await AnimeAPI.newAnime(pageRef.current);

    if (newData.length === 0) {
      pageRef.current -= 1;
      return;
    }

    if (setParamsState) {
      setParamsState(prev => {
        const combined = [...prev.newAnime, ...newData];
        const unique = combined.filter(
          (item, index, self) => index === self.findIndex(a => a.title === item.title),
        );
        return { ...prev, newAnime: unique };
      });
    }
  };

  return (
    <SeeMoreUI data={data} type="AnimeList" onLoadMore={handleLoadMore} navigation={navigation} />
  );
};

const MovieContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const { paramsState, setParamsState } = useContext(MovieListHomeContext);
  const data = (paramsState as unknown as NewAnimeList[]) || [];
  const pageRef = useRef(1);

  const handleLoadMore = async () => {
    pageRef.current += 1;
    const res = await AnimeAPI.searchMovies(pageRef.current);
    if (!res.result || res.result.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show('Semua movie sudah ditampilkan', ToastAndroid.SHORT);
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
      setParamsState(prev => {
        const combined = [...(prev as unknown as NewAnimeList[]), ...mappedMovies];
        return combined.filter(
          (item, index, self) => index === self.findIndex(a => a.title === item.title),
        ) as any;
      });
    }
  };

  return (
    <SeeMoreUI data={data} type="MovieList" onLoadMore={handleLoadMore} navigation={navigation} />
  );
};

const ComicsContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const { paramsState, setParamsState } = useContext(ComicsListContext);
  const data = paramsState || [];

  const pageRef = useRef(Math.max(1, Math.floor((data.length ?? 0) / 10)));

  const handleLoadMore = async () => {
    pageRef.current += 1;
    const newData = await getLatestComicsReleases(pageRef.current);

    if ('isError' in newData) {
      pageRef.current -= 1;
      throw new Error('API Error');
    }

    if (setParamsState) {
      setParamsState(prev => {
        const combined = [...prev, ...newData];
        return combined.filter(
          (item, index, self) => index === self.findIndex(a => a.title === item.title),
        );
      });
    }
  };

  return (
    <SeeMoreUI data={data} type="ComicsList" onLoadMore={handleLoadMore} navigation={navigation} />
  );
};

const ComicsPopularContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const [data, setData] = useState<LatestComicsRelease[]>([]);
  const pageRef = useRef(1);

  useEffect(() => {
    getPopularComicsReleases(1).then(d => setData(d)).catch(() => {});
  }, []);

  const handleLoadMore = async () => {
    pageRef.current += 1;
    const newData = await getPopularComicsReleases(pageRef.current);
    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show('Semua komik sudah ditampilkan', ToastAndroid.SHORT);
      return;
    }
    setData(prev => {
      const combined = [...prev, ...newData];
      return combined.filter(
        (item, index, self) => index === self.findIndex(a => a.title === item.title),
      );
    });
  };

  return (
    <SeeMoreUI data={data} type="ComicsPopular" onLoadMore={handleLoadMore} navigation={navigation} />
  );
};

const NovelsContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const [data, setData] = useState<LatestNovel[]>([]);
  const pageRef = useRef(1);

  useEffect(() => {
    getLatestNovels(1).then(d => setData(d)).catch(() => {});
  }, []);

  const handleLoadMore = async () => {
    pageRef.current += 1;
    const newData = await getLatestNovels(pageRef.current);
    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show('Semua novel sudah ditampilkan', ToastAndroid.SHORT);
      return;
    }
    setData(prev => {
      const combined = [...prev, ...newData];
      return combined.filter(
        (item, index, self) => index === self.findIndex(a => a.title === item.title),
      );
    });
  };

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

  const handleLoadMore = async () => {
    pageRef.current += 1;
    const newData = await getPopularNovels(pageRef.current);
    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show('Semua novel sudah ditampilkan', ToastAndroid.SHORT);
      return;
    }
    setData(prev => {
      const combined = [...prev, ...newData];
      return combined.filter(
        (item, index, self) => index === self.findIndex(a => a.title === item.title),
      );
    });
  };

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
    setInitialLoading(true);
    AnimeAPI.getAnimeByGenre(genre, 1)
      .then(d => setData(d))
      .catch(() => ToastAndroid.show('Gagal memuat genre anime', ToastAndroid.SHORT))
      .finally(() => setInitialLoading(false));
  }, [genre]);

  const handleLoadMore = async () => {
    pageRef.current += 1;
    const newData = await AnimeAPI.getAnimeByGenre(genre, pageRef.current);
    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show('Semua anime sudah ditampilkan', ToastAndroid.SHORT);
      return;
    }
    setData(prev => {
      const combined = [...prev, ...newData];
      return combined.filter(
        (item, index, self) => index === self.findIndex(a => a.title === item.title),
      );
    });
  };

  return (
    <SeeMoreUI data={data} type="AnimeGenre" genreName={genreName} onLoadMore={handleLoadMore} navigation={navigation} initialLoading={initialLoading} />
  );
};

const ComicsGenreContainer = ({ navigation, genre }: { navigation: Props['navigation']; genre: string }) => {
  const [data, setData] = useState<LatestComicsRelease[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const pageRef = useRef(1);

  const genreName = genre.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  useEffect(() => {
    setInitialLoading(true);
    getComicsByGenre(genre, 1)
      .then(d => setData(d))
      .catch(() => ToastAndroid.show('Gagal memuat genre komik', ToastAndroid.SHORT))
      .finally(() => setInitialLoading(false));
  }, [genre]);

  const handleLoadMore = async () => {
    pageRef.current += 1;
    const newData = await getComicsByGenre(genre, pageRef.current);
    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show('Semua komik sudah ditampilkan', ToastAndroid.SHORT);
      return;
    }
    setData(prev => {
      const combined = [...prev, ...newData];
      return combined.filter(
        (item, index, self) => index === self.findIndex(a => a.title === item.title),
      );
    });
  };

  return (
    <SeeMoreUI data={data} type="ComicsGenre" genreName={genreName} onLoadMore={handleLoadMore} navigation={navigation} initialLoading={initialLoading} />
  );
};

const FilmContainer = ({ navigation }: { navigation: Props['navigation'] }) => {
  const [data, setData] = useState<MovieboxSearchItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const pageRef = useRef(0);

  useEffect(() => {
    setInitialLoading(true);
    getTrending(0)
      .then(d => setData(d))
      .catch(() => ToastAndroid.show('Gagal memuat film', ToastAndroid.SHORT))
      .finally(() => setInitialLoading(false));
  }, []);

  const handleLoadMore = async () => {
    pageRef.current += 1;
    const newData = await getTrending(pageRef.current);
    if (newData.length === 0) {
      pageRef.current -= 1;
      ToastAndroid.show('Semua film sudah ditampilkan', ToastAndroid.SHORT);
      return;
    }
    setData(prev => {
      const combined = [...prev, ...newData];
      return combined.filter(
        (item, index, self) => index === self.findIndex(a => a.subjectId === item.subjectId),
      );
    });
  };

  return (
    <SeeMoreUI data={data} type="FilmList" onLoadMore={handleLoadMore} navigation={navigation} initialLoading={initialLoading} />
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
    case 'NovelsList':
      return <NovelsContainer navigation={props.navigation} />;
    case 'NovelsPopular':
      return <NovelsPopularContainer navigation={props.navigation} />;
    case 'FilmList':
      return <FilmContainer navigation={props.navigation} />;
    case 'AnimeList':
    default:
      return <AnimeContainer navigation={props.navigation} />;
  }
}

export default memo(SeeMore);
