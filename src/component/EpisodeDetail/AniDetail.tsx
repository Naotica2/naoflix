import Icon from '@react-native-vector-icons/fontawesome';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Button, Searchbar, Surface, useTheme } from 'react-native-paper';
import Reanimated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from 'react-native-reanimated';
import useGlobalStyles from '../../assets/style';
import { RootStackNavigator } from '../../types/navigation';
import watchLaterJSON from '../../types/watchLaterJSON';
import controlWatchLater from '../../utils/watchLaterControl';

import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AniDetailEpsList } from '../../types/anime';
import { HistoryItemKey } from '../../types/databaseTarget';
import { HistoryJSON } from '../../types/historyJSON';
import { DatabaseManager, useModifiedKeyValueIfFocused } from '../../utils/DatabaseManager';
import { replaceLast } from '../../utils/replaceLast';
import ImageLoading from '../misc/ImageLoading';
import EpisodeBox from '../misc/EpisodeBox';

const AnimatedFlatList = Reanimated.createAnimatedComponent(FlatList as typeof FlatList<AniDetailEpsList>);

const EpisodeItem = memo(({ ep, epNum, isLastEp, onPress, width }: {
  ep: AniDetailEpsList; epNum: number; isLastEp: boolean;
  onPress: (ep: AniDetailEpsList, epNum: number) => void; width: number;
}) => {
  const handlePress = useCallback(() => onPress(ep, epNum), [onPress, ep, epNum]);
  return (
    <EpisodeBox
      number={epNum}
      isActive={false}
      isLastWatched={isLastEp}
      onPress={handlePress}
      width={width}
    />
  );
});

type Props = NativeStackScreenProps<RootStackNavigator, 'AnimeDetail'>;

const IMG_HEADER_HEIGHT = 200;

function AniDetail(props: Props) {
  const styles = useStyles();
  const globalStyles = useGlobalStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const data = props.route.params.data;

  const watchLaterListsJson = useModifiedKeyValueIfFocused(
    'watchLater',
    state => JSON.parse(state) as watchLaterJSON[],
  );
  const isInList = useMemo(
    () =>
      watchLaterListsJson.some(
        item =>
          item.title === data.title.replace(/Subtitle Indonesia|Sub Indo/, '') &&
          !item.isComics &&
          !item.isMovie,
      ),
    [data.title, watchLaterListsJson],
  );

  const historyListsJson = useModifiedKeyValueIfFocused(
    'historyKeyCollectionsOrder',
    state => JSON.parse(state) as HistoryItemKey[],
  );
  let historyTitle = data.title
    .replace(/Subtitle Indonesia|Sub Indo/, '')
    .split('(Episode')[0]
    .trim();
  if (historyTitle.endsWith('BD') && !data.episodeList.at(-1)?.title.endsWith('BD')) {
    historyTitle = replaceLast(historyTitle, 'BD', '').trim();
  }
  const lastWatched = useMemo(() => {
    let isLastWatched = historyListsJson.find(
      z => z === `historyItem:${historyTitle}:false:false`,
    );
    if (!isLastWatched) {
      const titlePrefix = `historyItem:${historyTitle.slice(0, 20)}`;
      isLastWatched = historyListsJson.find(
        z => z.startsWith(titlePrefix) && z.endsWith(':false:false'),
      );
    }
    if (isLastWatched) {
      return JSON.parse(DatabaseManager.getSync(isLastWatched)!) as HistoryJSON;
    } else return undefined;
  }, [historyListsJson, historyTitle]);

  const scrollRef = useAnimatedRef<FlatList<AniDetailEpsList>>();
  const scrollOffset = useScrollOffset(scrollRef as any);
  const headerImageStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scrollOffset.value,
            [0, IMG_HEADER_HEIGHT * 2],
            [0, IMG_HEADER_HEIGHT],
            'clamp',
          ),
        },
      ],
      opacity: interpolate(scrollOffset.value, [0, IMG_HEADER_HEIGHT], [1, 0], 'clamp'),
    };
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [showFullSynopsis, setShowFullSynopsis] = useState(false);
  const { width: screenWidth } = useWindowDimensions();

  const cols = screenWidth < 400 ? 5 : screenWidth < 600 ? 6 : 7;
  const gap = 8;
  const padding = 32; // 16px each side
  const boxWidth = useMemo(
    () => (screenWidth - padding - (cols - 1) * gap) / cols,
    [screenWidth, cols],
  );

  const episodeNumbers = useMemo(() => {
    return data.episodeList.map((eps, idx) => {
      const epMatch = eps.title.match(/[Ee]pisode\s*(\d+)/);
      if (epMatch) return parseInt(epMatch[1], 10);
      const epShort = eps.title.match(/[Ee][Pp]\s*(\d+)/);
      if (epShort) return parseInt(epShort[1], 10);
      const allNums = eps.title.match(/\d+/g);
      if (allNums && allNums.length > 0) return parseInt(allNums[allNums.length - 1], 10);
      return idx + 1;
    });
  }, [data.episodeList]);

  const lastWatchedEpNum = useMemo(() => {
    if (!lastWatched?.episode) return -1;
    const match = lastWatched.episode.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : -1;
  }, [lastWatched]);

  const filteredEpisodes = useMemo(() => {
    if (!searchQuery) return data.episodeList;
    const q = searchQuery.toLowerCase();
    return data.episodeList.filter((eps, idx) => {
      const num = episodeNumbers[idx];
      return String(num).includes(q) || eps.title.toLowerCase().includes(q);
    });
  }, [data.episodeList, searchQuery, episodeNumbers]);

  const headerContent = useMemo(() => {
    return (
      <View style={styles.mainContainer}>
        <Reanimated.View
          style={[
            { width: '100%', height: IMG_HEADER_HEIGHT },
            headerImageStyle,
            {
              backgroundColor: isDark ? '#0f0f0f' : '#fafafa',
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'hidden',
            },
          ]}>
          <ImageLoading
            source={{ uri: data.thumbnailUrl }}
            fallbackSearchTitle={data.title}
            style={{ width: '100%', height: '100%', opacity: isDark ? 0.4 : 0.8 }}
            blurRadius={10}
            resizeMode="cover"
          />
        </Reanimated.View>

        <LinearGradient
          colors={['transparent', 'black']}
          style={{
            width: '100%',
            height: 60,
            position: 'absolute',
            transform: [
              {
                translateY: 155,
              },
            ],
          }}
        />

        <View
          style={[styles.mainContent, { backgroundColor: styles.mainContainer.backgroundColor }]}>
          <View style={{ flexDirection: 'column', alignItems: 'center' }}>
            <ImageLoading
              source={{ uri: data.thumbnailUrl }}
              fallbackSearchTitle={data.title}
              style={styles.thumbnail}
              resizeMode="cover"
            />
            <View
              style={{
                transform: styles.thumbnail.transform,
                flexDirection: 'row',
                gap: 5,
                marginTop: 8,
              }}>
              <Surface
                elevation={0}
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.9)',
                  borderRadius: 4,
                }}>
                <Text style={[globalStyles.text, styles.type]}>{data.animeType}</Text>
              </Surface>
              <Surface
                elevation={0}
                style={{
                  borderRadius: 4,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                }}>
                <Text style={[globalStyles.text, styles.status]}>{data.status}</Text>
              </Surface>
            </View>
          </View>

          <View style={styles.infoContainer}>
            <Text style={[globalStyles.text, styles.title]}>{historyTitle}</Text>
            {data.alternativeTitle && (
              <Text style={[globalStyles.text, styles.title, styles.indonesianTitle]}>
                {data.alternativeTitle}
              </Text>
            )}
            <Text style={[globalStyles.text, styles.author]}>
              {data.studio}
            </Text>
            <View style={styles.genreContainer}>
              {data.genres.map(genre => (
                <View
                  key={genre}
                  style={{
                    borderRadius: 4,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                  }}>
                  <Text style={styles.genre}>{genre}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.secondaryInfoContainer}>
            <View style={styles.additionalInfo}>
              <View style={styles.additionalInfoItem}>
                <Text style={[globalStyles.text, styles.additionalInfoText]}>
                  <Icon color={styles.additionalInfoText.color} name="star" />{' '}
                  {data.rating === '' ? '-' : data.rating}
                </Text>
              </View>
              <View style={styles.additionalInfoItem}>
                <Text style={[globalStyles.text, styles.additionalInfoText]}>
                  <Icon color={styles.additionalInfoText.color} name="calendar" />{' '}
                  {data.releaseYear}
                </Text>
              </View>
              <View style={styles.additionalInfoItem}>
                <Text style={[globalStyles.text, styles.additionalInfoText]}>
                  <Icon color={styles.additionalInfoText.color} name="play-circle" />{' '}
                  {data.minutesPerEp}
                </Text>
              </View>
              <View style={styles.additionalInfoItem}>
                <Text style={[globalStyles.text, styles.additionalInfoText]}>
                  <Icon color={styles.additionalInfoText.color} name="eye" />{' '}
                  {data.episodeList.length + '/' + data.epsTotal + ' Eps'}
                </Text>
              </View>
            </View>

            <View style={styles.synopsisContainer}>
              <Text style={[globalStyles.text, styles.synopsisTitle]}>Sinopsis</Text>
              <View style={styles.synopsisView}>
                <Text 
                  style={[globalStyles.text, styles.synopsisText]} 
                  numberOfLines={showFullSynopsis ? undefined : 3}
                >
                  {data.synopsis === '' ? 'Tidak ada sinopsis yang tersedia.' : data.synopsis}
                </Text>
                {data.synopsis !== '' && data.synopsis.length > 150 && (
                  <TouchableOpacity onPress={() => setShowFullSynopsis(!showFullSynopsis)} style={{ marginTop: 4 }}>
                    <Text style={{ color: '#3b82f6', fontSize: 13, fontWeight: 'bold' }}>
                      {showFullSynopsis ? 'Sembunyikan' : 'Selengkapnya...'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Button
              buttonColor="rgba(59, 130, 246, 0.15)"
              textColor="#3b82f6"
              mode="contained-tonal"
              icon="playlist-plus"
              style={{ borderRadius: 6 }}
              disabled={isInList}
              onPress={() => {
                const watchLaterJson: watchLaterJSON = {
                  title: data.title.replace(/Subtitle Indonesia|Sub Indo/, ''),
                  link: props.route.params.link,
                  rating: data.rating,
                  releaseYear: data.releaseYear,
                  thumbnailUrl: data.thumbnailUrl,
                  genre: data.genres,
                  date: Date.now(),
                };
                controlWatchLater('add', watchLaterJson);
                ToastAndroid.show('Ditambahkan ke tonton nanti', ToastAndroid.SHORT);
              }}>
              {isInList ? 'Sudah Ditambahkan' : 'Tonton Nanti'}
            </Button>

            <View style={styles.listChapterTextContainer}>
              <Text style={[globalStyles.text, styles.listChapterText]}>Daftar Episode</Text>
            </View>

            <View style={styles.chapterButtonsContainer}>
              {lastWatched && lastWatched.episode && (
                <Button
                  mode="contained"
                  buttonColor="#3b82f6"
                  textColor="#fff"
                  icon="play"
                  style={{ borderRadius: 6 }}
                  onPress={() => {
                    if (data.episodeList.length > 0) {
                      props.navigation.navigate('FromUrl', {
                        title: props.route.params.data.title,
                        link: lastWatched.link,
                        historyData: lastWatched
                          ? {
                              lastDuration: lastWatched.lastDuration ?? 0,
                              resolution: lastWatched.resolution ?? '',
                            }
                          : undefined,
                      });
                    } else {
                      ToastAndroid.show('Tidak ada episode untuk ditonton', ToastAndroid.SHORT);
                    }
                  }}>
                  Lanjutkan Menonton ({lastWatched.episode.replace(/Subtitle Indonesia|Sub Indo/, '').trim()})
                </Button>
              )}
              <Button
                mode="contained-tonal"
                buttonColor={isDark ? '#2a2a2a' : '#e0e0e0'}
                textColor={isDark ? '#fff' : '#000'}
                style={{ borderRadius: 6 }}
                onPress={() => {
                  if (data.episodeList.length > 0) {
                    props.navigation.navigate('FromUrl', {
                      title: props.route.params.data.title,
                      link: data.episodeList[0].link,
                    });
                  } else {
                    ToastAndroid.show('Tidak ada episode untuk ditonton', ToastAndroid.SHORT);
                  }
                }}>
                Mulai dari Episode 1
              </Button>
              <Button
                mode="contained-tonal"
                buttonColor={isDark ? '#2a2a2a' : '#e0e0e0'}
                textColor={isDark ? '#fff' : '#000'}
                style={{ borderRadius: 6 }}
                onPress={() => {
                  if (data.episodeList.length > 0) {
                    props.navigation.navigate('FromUrl', {
                      title: props.route.params.data.title,
                      link: data.episodeList[data.episodeList.length - 1].link,
                    });
                  } else {
                    ToastAndroid.show('Tidak ada episode untuk ditonton', ToastAndroid.SHORT);
                  }
                }}>
                Tonton Episode Terbaru
              </Button>
            </View>
          </View>
        </View>
      </View>
    );
  }, [
    styles.mainContainer,
    styles.mainContent,
    styles.thumbnail,
    styles.type,
    styles.status,
    styles.infoContainer,
    styles.title,
    styles.indonesianTitle,
    styles.author,
    styles.genreContainer,
    styles.secondaryInfoContainer,
    styles.additionalInfo,
    styles.additionalInfoText,
    styles.synopsisContainer,
    styles.synopsisTitle,
    styles.synopsisView,
    styles.synopsisText,
    styles.listChapterTextContainer,
    styles.listChapterText,
    styles.chapterButtonsContainer,
    styles.genre,
    headerImageStyle,
    data.thumbnailUrl,
    data.animeType,
    data.status,
    data.alternativeTitle,
    data.studio,
    data.genres,
    data.rating,
    data.releaseYear,
    data.minutesPerEp,
    data.episodeList,
    data.epsTotal,
    data.synopsis,
    data.title,
    colorScheme,
    globalStyles.text,
    historyTitle,
    isInList,
    lastWatched,
    props.route.params.link,
    props.route.params.data.title,
    props.navigation,
    showFullSynopsis,
  ]);

  const ListHeaderComponent = (
    <View>
      {headerContent}
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Searchbar
          style={styles.searchbar}
          inputStyle={styles.searchbarInput}
          iconColor="#3b82f6"
          placeholderTextColor={isDark ? '#888' : '#aaa'}
          keyboardType="number-pad"
          placeholder="Cari Episode..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
    </View>
  );

  const handleEpisodePress = useCallback(
    (eps: { link: string; title: string }, epNum: number) => {
      const isLastEp = epNum === lastWatchedEpNum;
      props.navigation.navigate('FromUrl', {
        title: props.route.params.data.title,
        link: eps.link,
        historyData: isLastEp
          ? {
              lastDuration: lastWatched?.lastDuration ?? 0,
              resolution: lastWatched?.resolution ?? '',
            }
          : undefined,
      });
    },
    [lastWatchedEpNum, lastWatched, props.navigation, props.route.params.data.title],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: AniDetailEpsList; index: number }) => {
      const originalIdx = data.episodeList.indexOf(item);
      const epNum = episodeNumbers[originalIdx];
      const isLastEp = epNum === lastWatchedEpNum && lastWatchedEpNum >= 0;
      return (
        <EpisodeItem
          ep={item}
          epNum={epNum}
          isLastEp={isLastEp}
          onPress={handleEpisodePress}
          width={boxWidth}
        />
      );
    },
    [data.episodeList, episodeNumbers, lastWatchedEpNum, handleEpisodePress, boxWidth],
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
      <AnimatedFlatList
        extraData={showFullSynopsis}
        key={cols}
        ref={scrollRef as any}
        data={filteredEpisodes}
        numColumns={cols}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={{
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: insets.bottom,
          paddingHorizontal: 16,
          gap: 8,
        }}
        renderItem={renderItem}
        keyExtractor={(item, idx) => item.title + idx}
        ListHeaderComponent={ListHeaderComponent}
        ListHeaderComponentStyle={{ marginHorizontal: -16 }}
        ListEmptyComponent={
          <View style={{ marginVertical: 20, alignItems: 'center' }}>
            <Text style={[globalStyles.text, { opacity: 0.5 }]}>
              {searchQuery ? 'Episode tidak ditemukan.' : 'Tidak ada episode ditemukan.'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        initialNumToRender={cols * 3}
        maxToRenderPerBatch={cols * 2}
        windowSize={5}
        updateCellsBatchingPeriod={50}
      />
    </KeyboardAvoidingView>
  );
}

function useStyles() {
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const dimensions = useWindowDimensions();
  return useMemo(
    () =>
      StyleSheet.create({
        mainContainer: {
          flex: 1,
          backgroundColor: isDark ? '#0f0f0f' : '#fafafa',
        },

        mainContent: {
          gap: 16,
          flex: 1,
          flexWrap: 'wrap',
          flexDirection: 'row',
          paddingHorizontal: 16,
          paddingVertical: 16,
        },
        infoContainer: {
          gap: 6,
          flex: 1,
          flexDirection: 'column',
          marginTop: 20,
        },
        thumbnail: {
          width: 0.32 * dimensions.width,
          aspectRatio: 1 / 1.45,
          borderRadius: 8,
          transform: [{ translateY: -60 }],
        },
        type: {
          color: '#fff',
          fontSize: 12,
          fontWeight: '700',
          paddingHorizontal: 8,
          paddingVertical: 3,
        },
        status: {
          fontSize: 12,
          paddingHorizontal: 8,
          paddingVertical: 3,
          color: isDark ? '#fff' : '#000',
        },
        title: {
          flexShrink: 1,
          fontSize: 24,
          fontWeight: '800',
          color: isDark ? '#e0e0e0' : '#222',
        },
        indonesianTitle: {
          fontSize: 14,
          fontWeight: '500',
          color: isDark ? '#aaa' : '#666',
        },
        author: {
          color: isDark ? '#aaa' : '#666',
          fontSize: 13,
          marginTop: 2,
        },
        secondaryInfoContainer: {
          width: '100%',
          gap: 15,
        },
        genreContainer: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          marginTop: 8,
        },
        genre: {
          color: isDark ? '#ccc' : '#444',
          fontSize: 12,
          fontWeight: '600',
          paddingHorizontal: 8,
          paddingVertical: 4,
        },
        additionalInfo: {
          flexDirection: 'row',
          gap: 12,
          justifyContent: 'flex-start',
          alignItems: 'center',
          paddingVertical: 8,
        },
        additionalInfoItem: {
          flexDirection: 'row',
          alignItems: 'center',
        },
        additionalInfoText: {
          color: isDark ? '#aaa' : '#666',
          fontSize: 13,
          fontWeight: '500',
        },
        synopsisContainer: {
          marginTop: 8,
        },
        synopsisTitle: {
          fontSize: 16,
          fontWeight: '700',
          marginBottom: 8,
          color: isDark ? '#fff' : '#111',
        },
        synopsisView: {
          paddingBottom: 8,
        },
        synopsisText: {
          fontSize: 14,
          lineHeight: 22,
          color: isDark ? '#bbb' : '#444',
        },
        listChapterTextContainer: {
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: isDark ? '#2a2a2a' : '#eee',
          marginBottom: 8,
        },
        listChapterText: {
          fontWeight: '700',
          fontSize: 18,
          color: isDark ? '#fff' : '#111',
        },
        chapterButtonsContainer: {
          gap: 8,
        },
        searchbar: {
          backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0',
          borderRadius: 8,
          height: 44,
          elevation: 0,
        },
        searchbarInput: {
          minHeight: 0,
          color: isDark ? '#fff' : '#000',
          fontSize: 14,
        },
      }),
    [
      colorScheme,
      dimensions.width,
      globalStyles.text.color,
      theme.colors.onPrimaryContainer,
      theme.colors.onSecondaryContainer,
      theme.colors.secondaryContainer,
    ],
  );
}

export default memo(AniDetail);
