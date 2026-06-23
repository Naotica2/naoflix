import Icon from '@react-native-vector-icons/fontawesome';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { RecyclerViewProps } from '@shopify/flash-list/dist/recyclerview/RecyclerViewProps';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Button, Divider, Searchbar, Surface, useTheme } from 'react-native-paper';
import Reanimated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useGlobalStyles from '../../assets/style';
import { HistoryItemKey } from '../../types/databaseTarget';
import { HistoryJSON } from '../../types/historyJSON';
import { RootStackNavigator } from '../../types/navigation';
import watchLaterJSON from '../../types/watchLaterJSON';
import { DatabaseManager, useModifiedKeyValueIfFocused } from '../../utils/DatabaseManager';
import { ComicsDetail as ComicsDetailTypeData } from '../../utils/scrapers/comicsv2';
import { __ALIAS as KomikuAlias, KomikuDetail } from '../../utils/scrapers/komiku';
import { __ALIAS as MynimekuAlias } from '../../utils/scrapers/mynimeku';
import { __ALIAS as ShinigamiAlias } from '../../utils/scrapers/shinigami';
import controlWatchLater from '../../utils/watchLaterControl';
import ImageLoading from '../misc/ImageLoading';

type RecyclerViewType = (
  props: RecyclerViewProps<KomikuDetail['chapters'][0] | ComicsDetailTypeData['chapters'][0]> & {
    ref?: React.Ref<
      FlashListRef<KomikuDetail['chapters'][0] | ComicsDetailTypeData['chapters'][0]>
    >;
  },
) => React.JSX.Element;
const ReanimatedImage = Reanimated.createAnimatedComponent(ImageLoading);
const ReanimatedFlashList = Reanimated.createAnimatedComponent<RecyclerViewType>(FlashList);

type Props = NativeStackScreenProps<RootStackNavigator, 'ComicsDetail'>;
const IMG_HEIGHT = 200;
export default function ComicsDetail(props: Props) {
  const colorScheme = useColorScheme();
  const globalStyles = useGlobalStyles();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useStyles();
  const scrollRef =
    useAnimatedRef<
      FlashListRef<KomikuDetail['chapters'][0] | ComicsDetailTypeData['chapters'][0]>
    >();
  const scrollOffset = useScrollOffset(scrollRef as any);
  const imageStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scrollOffset.value,
            [0, IMG_HEIGHT * 2],
            [0, IMG_HEIGHT],
            'clamp',
          ),
        },
      ],
      opacity: interpolate(scrollOffset.value, [0, IMG_HEIGHT], [1, 0], 'clamp'),
    };
  });
  const { data } = props.route.params;

  const [searchQuery, setSearchQuery] = useState('');
  const filteredChapters = useMemo(() => {
    if (!searchQuery) return data.chapters;
    return data.chapters.toReversed().filter(chapter => {
      return chapter.chapter.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [data.chapters, searchQuery]);

  const watchLaterListsJson = useModifiedKeyValueIfFocused(
    'watchLater',
    state => JSON.parse(state) as watchLaterJSON[],
  );
  const isInList = useMemo(
    () => watchLaterListsJson.some(item => item.title === data.title && item.isComics),
    [data.title, watchLaterListsJson],
  );

  const historyListsJson = useModifiedKeyValueIfFocused(
    'historyKeyCollectionsOrder',
    state => JSON.parse(state) as HistoryItemKey[],
  );
  const lastReaded = useMemo(() => {
    // Try exact match first
    let historyKey = historyListsJson.find(
      z => z === `historyItem:${data.title.trim()}:true:false`,
    );
    // Fallback: fuzzy match by title prefix (for cross-source compatibility)
    if (!historyKey) {
      const titlePrefix = `historyItem:${data.title.trim().slice(0, 20)}`;
      historyKey = historyListsJson.find(
        z => z.startsWith(titlePrefix) && z.endsWith(':true:false'),
      );
    }
    if (historyKey) {
      return JSON.parse(DatabaseManager.getSync(historyKey)!) as HistoryJSON;
    } else return undefined;
  }, [historyListsJson, data.title]);

  // Extract last read chapter number for read indicator (works across all comic sources)
  const lastReadChapterNum = useMemo(() => {
    if (!lastReaded?.episode) return -1;
    const match = lastReaded.episode.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : -1;
  }, [lastReaded]);

  // Helper to extract chapter number from a chapter string
  const getChapterNum = useCallback((chapterStr: string): number => {
    const match = chapterStr.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : -1;
  }, []);

  const readComic = useCallback(
    (url: string, fromHistory?: HistoryJSON) => {
      let link = url;
      const currentScraper = [KomikuAlias, MynimekuAlias, ShinigamiAlias].find(alias =>
        link.includes(alias),
      );
      const isSameScraper = currentScraper && props.route.params.link.includes(currentScraper);
      if (!isSameScraper && lastReaded?.episode) {
        // Use number-based comparison for cross-source chapter matching
        const lastReadNum = getChapterNum(lastReaded.episode);
        const matchedChapter = lastReadNum >= 0
          ? data.chapters.find(item => getChapterNum(item.chapter) === lastReadNum)
          : data.chapters.find(item =>
              item.chapter
                .toLowerCase()
                .replace('chapter ', '')
                .trim() ===
              lastReaded?.episode
                ?.toLowerCase()
                .replace('chapter ', '')
                .trim()
            );
        if (matchedChapter?.chapterUrl) {
          link = matchedChapter.chapterUrl;
        }
      }
      props.navigation.navigate('FromUrl', {
        title: props.route.params.data.title,
        link,
        type: 'comics',
        historyData: fromHistory
          ? {
              lastDuration: fromHistory.lastDuration ?? 0,
              resolution: fromHistory.resolution ?? '',
            }
          : undefined,
      });
    },
    [data, lastReaded, props.navigation, props.route.params.data.title, props.route.params.link, getChapterNum],
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
      <ReanimatedFlashList
        maintainVisibleContentPosition={{
          disabled: true,
        }}
        ref={scrollRef}
        data={filteredChapters}
        ListEmptyComponent={() => (
          <View style={[styles.mainContainer, { marginVertical: 6 }]}>
            <Text style={globalStyles.text}>Tidak ada chapter</Text>
          </View>
        )}
        renderItem={({ item }) => {
          if (!item) return null;
          const currentChapterNum = getChapterNum(item.chapter);
          // Number-based comparison for "currently reading" indicator (works across all sources)
          const isLastReaded = lastReadChapterNum >= 0 && currentChapterNum >= 0 && currentChapterNum === lastReadChapterNum;
          // Also check by link as fallback
          const isLastReadedByLink = !isLastReaded && lastReaded?.link === item.chapterUrl;
          // Check if chapter has been read (chapter number <= last read chapter number)
          const isRead = lastReadChapterNum >= 0 && currentChapterNum >= 0 && currentChapterNum <= lastReadChapterNum;
          return (
            <TouchableOpacity
              style={[styles.chapterItem, isRead ? { opacity: 0.5 } : {}]}
              onPress={() => readComic(item.chapterUrl, (isLastReaded || isLastReadedByLink) ? lastReaded : undefined)}>
              <View style={styles.chapterTitleContainer}>
                <Text style={[globalStyles.text, styles.chapterText, isRead ? { color: colorScheme === 'dark' ? '#666' : '#999' } : {}]}>
                  {item.chapter.includes('Chapter') ? item.chapter : `Chapter ${item.chapter}`}
                </Text>
              </View>
              <View style={styles.chapterDetailsContainer}>
                {'releaseDate' in item && (
                  <>
                    <Text style={[globalStyles.text, styles.chapterDetailText]}>
                      <Icon color={styles.chapterDetailText.color} name="calendar" size={12} />{' '}
                      {item.releaseDate}
                    </Text>
                    <Text style={[globalStyles.text, styles.chapterDetailText]}>
                      <Icon color={styles.chapterDetailText.color} name="eye" size={12} />{' '}
                      {item.views}x dilihat
                    </Text>
                  </>
                )}
                {(isLastReaded || isLastReadedByLink) && (
                  <Text
                    style={[globalStyles.text, styles.chapterDetailText, styles.lastReadedText]}>
                    <Icon color={styles.lastReadedText.color} name="book" size={12} /> Terakhir
                    dibaca
                  </Text>
                )}
                {isRead && !isLastReaded && !isLastReadedByLink && (
                  <Text style={[globalStyles.text, styles.chapterDetailText, { color: '#888' }]}>
                    <Icon color="#888" name="check" size={12} /> Sudah dibaca
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <Divider />}
        keyExtractor={(item, index) => item.chapter + index}
        contentContainerStyle={{
          backgroundColor: styles.mainContainer.backgroundColor,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: insets.bottom,
        }}
        ListHeaderComponentStyle={[styles.mainContainer, { marginBottom: 12 }]}
        ListHeaderComponent={
          <>
            {'headerImageUrl' in data ? (
              <ReanimatedImage
                style={[{ width: '100%', height: IMG_HEIGHT }, imageStyle]}
                source={{ uri: data.headerImageUrl }}
              />
            ) : (
              <Reanimated.View
                style={[
                  { width: '100%', height: IMG_HEIGHT },
                  imageStyle,
                  {
                    backgroundColor: colorScheme === 'dark' ? '#0f0f0f' : '#fafafa',
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'hidden',
                  },
                ]}>
                <ImageLoading
                  source={{ uri: data.thumbnailUrl }}
                  style={{ width: '100%', height: '100%', opacity: colorScheme === 'dark' ? 0.4 : 0.8 }}
                  blurRadius={10}
                  resizeMode="cover"
                />
              </Reanimated.View>
            )}
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
            <View style={[styles.mainContainer, styles.mainContent]}>
              <View style={{ flexDirection: 'column', alignItems: 'center' }}>
                <ImageLoading source={{ uri: data.thumbnailUrl }} style={styles.thumbnail} resizeMode="cover" />
                <Surface
                  elevation={0}
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.9)',
                    transform: styles.thumbnail.transform,
                    flexDirection: 'row',
                    gap: 5,
                    marginTop: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 4,
                  }}>
                  <Text style={[globalStyles.text, styles.type]}>{data.type}</Text>
                </Surface>
                <Surface
                  elevation={0}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    transform: styles.thumbnail.transform,
                    marginTop: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 4,
                  }}>
                  <Text style={[globalStyles.text, styles.status]}>{data.status}</Text>
                </Surface>
              </View>
              <View style={styles.infoContainer}>
                <Text style={[globalStyles.text, styles.title]}>{data.title}</Text>
                <Text
                  style={[globalStyles.text, styles.title, styles.indonesianTitle]}
                  numberOfLines={4}>
                  {'indonesianTitle' in data ? data.indonesianTitle : (data as any).altTitle}
                </Text>
                <Text style={[globalStyles.text, styles.author]}>{data.author || '-'}</Text>
                <View style={styles.genreContainer}>
                  {data.genres.map(z => {
                    return (
                      <View
                        key={z}
                        style={{
                          borderRadius: 4,
                          backgroundColor:
                            z === 'Ecchi' ? 'rgba(255, 0, 0, 0.5)' : (colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'),
                        }}>
                        <Text style={styles.genre} key={z}>
                          {z}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'column', flex: 1, marginTop: 10, paddingHorizontal: 16 }}>
              <View style={styles.secondaryInfoContainer}>
                <View style={styles.additionalInfo}>
                  {'indonesianTitle' in data ? (
                    <>
                      <View style={styles.additionalInfoItem}>
                        <Text style={[globalStyles.text, styles.additionalInfoText]}>
                          <Icon color={styles.additionalInfoText.color} name="check-circle" />{' '}
                          {data.minAge}
                        </Text>
                      </View>
                      <View style={styles.additionalInfoItem}>
                        <Text style={[globalStyles.text, styles.additionalInfoText]}>
                          <Icon color={styles.additionalInfoText.color} name="map-signs" />{' '}
                          {data.readingDirection}
                        </Text>
                      </View>
                      <View style={styles.additionalInfoItem}>
                        <Text style={[globalStyles.text, styles.additionalInfoText]}>
                          <Icon color={styles.additionalInfoText.color} name="tag" /> {data.concept}
                        </Text>
                      </View>
                    </>
                  ) : undefined}
                  {'releaseYear' in data && (
                    <View style={styles.additionalInfoItem}>
                      <Text style={[globalStyles.text, styles.additionalInfoText]}>
                        <Icon color={styles.additionalInfoText.color} name="calendar" />{' '}
                        {(data as any).releaseYear}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.synopsisContainer}>
                  <Text style={[globalStyles.text, styles.synopsisTitle]}>Sinopsis</Text>
                  <Text style={[globalStyles.text, styles.synopsisText]}>{data.synopsis}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'column', flex: 1, marginTop: 16 }}>
                <Button
                  buttonColor="rgba(59, 130, 246, 0.15)"
                  textColor="#3b82f6"
                  mode="contained-tonal"
                  icon="playlist-plus"
                  style={{ borderRadius: 6, marginBottom: 16 }}
                  onPress={() => {
                    if (!data.chapters[data.chapters.length - 1]) {
                      ToastAndroid.show('Data chapter tidak ditemukan', ToastAndroid.SHORT);
                      return;
                    }
                    const lastData = data.chapters[data.chapters.length - 1];
                    const watchLaterJson: watchLaterJSON = {
                      title: data.title,
                      link: props.route.params.link,
                      rating: 'Komik',
                      releaseYear:
                        'releaseDate' in lastData
                          ? lastData.releaseDate
                          : 'releaseYear' in data
                            ? ((data as any).releaseYear ?? 'Data tidak tersedia')
                            : 'Data tidak tersedia',
                      thumbnailUrl: data.thumbnailUrl,
                      genre: data.genres,
                      date: Date.now(),
                      isComics: true,
                    };
                    controlWatchLater('add', watchLaterJson);
                    ToastAndroid.show('Ditambahkan ke tonton nanti', ToastAndroid.SHORT);
                  }}>
                  {isInList ? 'Sudah Ditambahkan' : 'Baca Nanti'}
                </Button>
                <View style={styles.listChapterTextContainer}>
                  <Text style={[globalStyles.text, styles.listChapterText]}>Daftar Chapter</Text>
                </View>
                <View style={styles.chapterButtonsContainer}>
                  {lastReaded && lastReaded.episode && (
                    <Button
                      mode="contained"
                      buttonColor="#3b82f6"
                      textColor="#fff"
                      icon="book-open"
                      style={{ borderRadius: 6 }}
                      onPress={() => {
                        readComic(lastReaded.link, lastReaded);
                      }}>
                      Lanjutkan Membaca ({lastReaded.episode})
                    </Button>
                  )}
                  <Button
                    onPress={() => {
                      const chapterData = data.chapters[data.chapters.length - 1];
                      if (!chapterData?.chapterUrl) {
                        ToastAndroid.show('Chapter tidak ditemukan', ToastAndroid.SHORT);
                        return;
                      }
                      readComic(chapterData.chapterUrl);
                    }}
                    mode="contained-tonal"
                    buttonColor={colorScheme === 'dark' ? '#2a2a2a' : '#e0e0e0'}
                    textColor={colorScheme === 'dark' ? '#fff' : '#000'}
                    style={{ borderRadius: 6 }}>
                    Baca Chapter Pertama
                  </Button>
                  <Button
                    onPress={() => {
                      const chapterData = data.chapters[0];
                      if (!chapterData?.chapterUrl) {
                        ToastAndroid.show('Chapter tidak ditemukan', ToastAndroid.SHORT);
                        return;
                      }
                      readComic(chapterData?.chapterUrl);
                    }}
                    mode="contained-tonal"
                    buttonColor={colorScheme === 'dark' ? '#2a2a2a' : '#e0e0e0'}
                    textColor={colorScheme === 'dark' ? '#fff' : '#000'}
                    style={{ borderRadius: 6 }}>
                    Baca Chapter Terakhir
                  </Button>
                </View>
                <Searchbar
                  style={styles.searchbar}
                  inputStyle={styles.searchbarInput}
                  iconColor="#3b82f6"
                  placeholderTextColor={colorScheme === 'dark' ? '#888' : '#aaa'}
                  onChangeText={setSearchQuery}
                  value={searchQuery}
                  placeholder="Cari chapter..."
                  keyboardType="number-pad"
                  elevation={0}
                />
              </View>
            </View>
          </>
        }
        showsVerticalScrollIndicator={false}
      />
    </KeyboardAvoidingView>
  );
}

function useStyles() {
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  const dimensions = useWindowDimensions();
  return useMemo(
    () =>
      StyleSheet.create({
        mainContainer: {
          flex: 1,
          backgroundColor: colorScheme === 'dark' ? '#0f0f0f' : '#fafafa',
        },
        mainContent: {
          gap: 16,
          flex: 1,
          flexWrap: 'wrap',
          flexDirection: 'row',
          paddingHorizontal: 16,
        },
        infoContainer: {
          gap: 6,
          flex: 1,
          flexDirection: 'column',
          marginTop: 20,
        },
        thumbnail: {
          width: dimensions.width * 0.32,
          aspectRatio: 1 / 1.45,
          borderRadius: 8,
          transform: [{ translateY: -60 }],
        },
        type: {
          color: '#fff',
          fontSize: 12,
          fontWeight: '700',
        },
        status: {
          fontSize: 12,
          color: colorScheme === 'dark' ? '#fff' : '#000',
        },
        title: {
          flexShrink: 1,
          fontSize: 24,
          fontWeight: '800',
          color: colorScheme === 'dark' ? '#e0e0e0' : '#222',
        },
        indonesianTitle: {
          fontSize: 14,
          fontWeight: '500',
          color: colorScheme === 'dark' ? '#aaa' : '#666',
        },
        author: {
          color: colorScheme === 'dark' ? '#aaa' : '#666',
          fontSize: 13,
          marginTop: 2,
        },
        secondaryInfoContainer: {
          width: '100%',
        },
        genreContainer: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          marginTop: 8,
        },
        genre: {
          color: colorScheme === 'dark' ? '#ccc' : '#444',
          fontSize: 12,
          fontWeight: '600',
          paddingHorizontal: 8,
          paddingVertical: 4,
        },
        additionalInfo: {
          flexDirection: 'row',
          flexWrap: 'wrap',
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
          color: colorScheme === 'dark' ? '#aaa' : '#666',
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
          color: colorScheme === 'dark' ? '#fff' : '#111',
        },
        synopsisText: {
          fontSize: 14,
          lineHeight: 22,
          color: colorScheme === 'dark' ? '#bbb' : '#444',
        },
        listChapterTextContainer: {
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: colorScheme === 'dark' ? '#2a2a2a' : '#eee',
          marginBottom: 8,
        },
        listChapterText: {
          fontWeight: '700',
          fontSize: 18,
          color: colorScheme === 'dark' ? '#fff' : '#111',
        },
        chapterButtonsContainer: {
          flexDirection: 'column',
          gap: 8,
        },
        searchbar: {
          backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f0f0f0',
          borderRadius: 8,
          height: 44,
          marginTop: 8,
          marginBottom: 8,
        },
        searchbarInput: {
          minHeight: 0,
          color: colorScheme === 'dark' ? '#fff' : '#000',
          fontSize: 14,
        },
        chapterItem: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: 16,
          paddingHorizontal: 16,
          backgroundColor: colorScheme === 'dark' ? '#121212' : '#fff',
        },
        chapterTitleContainer: {
          flex: 2,
        },
        chapterText: {
          fontSize: 15,
          fontWeight: '500',
          color: colorScheme === 'dark' ? '#ddd' : '#333',
        },
        chapterDetailsContainer: {
          flex: 1,
          alignItems: 'flex-end',
        },
        chapterDetailText: {
          fontSize: 12,
          color: colorScheme === 'dark' ? '#888' : '#666',
          marginBottom: 3,
        },
        lastReadedText: {
          color: '#3b82f6',
          fontWeight: 'bold',
        },
        chapterDivider: {
          backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#eee',
          height: 1,
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
