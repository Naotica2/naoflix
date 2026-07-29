import MaterialIcon from '@react-native-vector-icons/material-icons';
import Icon from '@react-native-vector-icons/fontawesome';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { Button, useTheme } from 'react-native-paper';
import Reanimated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import useGlobalStyles from '../../assets/style';
import { RootStackNavigator } from '../../types/navigation';
import { TouchableOpacity } from '../misc/TouchableOpacityRNGH';
import ImageLoading from '../misc/ImageLoading';
import { StackActions } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { HistoryItemKey } from '../../types/databaseTarget';
import { HistoryJSON } from '../../types/historyJSON';
import { DatabaseManager, useModifiedKeyValueIfFocused } from '../../utils/DatabaseManager';
import controlWatchLater from '../../utils/watchLaterControl';
import watchLaterJSON from '../../types/watchLaterJSON';
import { ToastAndroid } from 'react-native';

type Props = NativeStackScreenProps<RootStackNavigator, 'NovelDetail'>;

type ChapterItem = {
  chapter: string;
  chapterUrl: string;
  releaseDate: string;
};

export default function NovelDetail(props: Props) {
  const { data } = props.route.params;
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const dimensions = useWindowDimensions();
  const [showFullSynopsis, setShowFullSynopsis] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);

  const historyListsJson = useModifiedKeyValueIfFocused(
    'historyKeyCollectionsOrder',
    state => JSON.parse(state) as HistoryItemKey[],
  );
  const lastReaded = useMemo(() => {
    let historyKey = historyListsJson.find(
      z => z === `historyItem:${data.title.trim()}:false:false`,
    );
    if (!historyKey) {
      const titlePrefix = `historyItem:${data.title.trim().slice(0, 20)}`;
      historyKey = historyListsJson.find(
        z => z.startsWith(titlePrefix) && z.endsWith(':false:false'),
      );
    }
    if (historyKey) {
      return JSON.parse(DatabaseManager.getSync(historyKey)!) as HistoryJSON;
    } else return undefined;
  }, [historyListsJson, data.title]);

  const lastReadChapterNum = useMemo(() => {
    if (!lastReaded?.episode) return -1;
    const match = lastReaded.episode.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : -1;
  }, [lastReaded]);

  const watchLaterListsJson = useModifiedKeyValueIfFocused(
    'watchLater',
    state => JSON.parse(state) as watchLaterJSON[],
  );
  const isInList = useMemo(
    () => watchLaterListsJson.some(item => item.title === data.title && !item.isComics && item.rating === 'Novel'),
    [data.title, watchLaterListsJson],
  );

  useEffect(() => {
    props.navigation.setOptions({
      headerShown: true,
      headerTitle: data.title,
      header: headerProps => (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isDark ? '#0f0f0f' : '#fafafa',
          paddingTop: 40,
          paddingBottom: 10,
          paddingHorizontal: 8,
        }}>
          {headerProps.back && (
            <TouchableOpacity onPress={() => headerProps.navigation.goBack()} style={{ padding: 8 }}>
              <MaterialIcon name="arrow-back" size={24} color={isDark ? '#fff' : '#000'} />
            </TouchableOpacity>
          )}
          <Text numberOfLines={1} style={[globalStyles.text, { fontWeight: '700', fontSize: 18, flex: 1, marginLeft: 8 }]}>
            {data.title}
          </Text>
        </View>
      ),
    });
  }, [data.title, isDark, globalStyles.text, props.navigation]);

  const chapters = useMemo(
    () => (sortAsc ? [...data.chapters].reverse() : data.chapters),
    [sortAsc, data.chapters],
  );

  const navigateToChapter = useCallback(
    (chapterUrl: string, historyData?: { lastDuration?: number }) => {
      props.navigation.dispatch(
        StackActions.push('FromUrl', {
          title: data.title,
          link: chapterUrl,
          type: 'novel',
          historyData,
        }),
      );
    },
    [data.title, props.navigation],
  );

  const renderChapter = useCallback(
    ({ item: ch }: { item: ChapterItem }) => {
      const chapterNumMatch = ch.chapter.match(/(\d+\.?\d*)/);
      const chapterNum = chapterNumMatch ? parseFloat(chapterNumMatch[1]) : -1;
      const isRead = lastReadChapterNum >= 0 && chapterNum >= 0 && chapterNum <= lastReadChapterNum;
      const isLastReadedChapter = lastReaded?.link === ch.chapterUrl;
      return (
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? '#1a1a1a' : '#f0f0f0',
            opacity: isRead ? 0.5 : 1,
          }}
          onPress={() =>
            navigateToChapter(
              ch.chapterUrl,
              isLastReadedChapter ? { lastDuration: lastReaded?.lastDuration ?? 0 } : undefined,
            )
          }>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={[
                globalStyles.text,
                {
                  fontSize: 15,
                  fontWeight: '500',
                  color: isRead ? (isDark ? '#666' : '#999') : (isDark ? '#ddd' : '#333'),
                },
              ]}>
              {ch.chapter}
            </Text>
            {ch.releaseDate ? (
              <Text style={[globalStyles.text, { fontSize: 11, color: isDark ? '#666' : '#999', marginTop: 2 }]}>
                {ch.releaseDate}
              </Text>
            ) : null}
          </View>
          {isRead && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
              {isLastReadedChapter && <Icon name="book" size={12} color="#3b82f6" style={{ marginRight: 4 }} />}
              <Text style={{ fontSize: 11, color: '#888', fontWeight: '500' }}>Dibaca</Text>
            </View>
          )}
          <MaterialIcon
            name="chevron-right"
            size={20}
            color={isRead ? (isDark ? '#333' : '#ddd') : (isDark ? '#555' : '#ccc')}
          />
        </TouchableOpacity>
      );
    },
    [isDark, globalStyles.text, lastReadChapterNum, lastReaded, navigateToChapter],
  );

  const ListHeader = useMemo(
    () => (
      <View>
        {/* BLURRED HERO HEADER */}
        <View style={{ height: 180, overflow: 'hidden' }}>
          <ImageLoading
            source={{ uri: data.thumbnailUrl }}
            style={{ width: '100%', height: '100%', opacity: isDark ? 0.4 : 0.8 }}
            blurRadius={10}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', isDark ? '#0f0f0f' : '#fafafa']}
            style={{ position: 'absolute', bottom: 0, width: '100%', height: 80 }}
          />
        </View>

        {/* COVER + INFO */}
        <Reanimated.View entering={FadeInUp.duration(400)}>
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginTop: -80, gap: 16 }}>
            <ImageLoading
              resizeMode="cover"
              source={{ uri: data.thumbnailUrl }}
              style={{ width: dimensions.width * 0.32, aspectRatio: 1 / 1.45, borderRadius: 8 }}
            />
            <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 4 }}>
              <View
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.9)',
                  alignSelf: 'flex-start',
                  borderRadius: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  marginBottom: 8,
                }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Novel</Text>
              </View>
              <Text
                style={[
                  globalStyles.text,
                  { fontWeight: '800', fontSize: 22, color: isDark ? '#e0e0e0' : '#222', marginBottom: 4 },
                ]}>
                {data.title}
              </Text>
              {data.alternativeTitle ? (
                <Text style={[globalStyles.text, { fontSize: 13, color: isDark ? '#aaa' : '#666', marginBottom: 4 }]}>
                  {data.alternativeTitle}
                </Text>
              ) : null}
            </View>
          </View>
        </Reanimated.View>

        {/* META INFO */}
        <View style={{ paddingHorizontal: 16, marginTop: 12, gap: 4 }}>
          {data.author ? (
            <Text style={[globalStyles.text, { fontSize: 13, color: isDark ? '#aaa' : '#666' }]}>{data.author}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcon name="info-outline" size={14} color={isDark ? '#aaa' : '#666'} />
              <Text style={[globalStyles.text, { fontSize: 13, marginLeft: 4, color: isDark ? '#aaa' : '#666' }]}>
                {data.status || 'Unknown'}
              </Text>
            </View>
            {data.rating ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="star" size={12} color="#3b82f6" />
                <Text style={[globalStyles.text, { fontSize: 13, marginLeft: 4, color: '#3b82f6' }]}>{data.rating}</Text>
              </View>
            ) : null}
            <Text style={[globalStyles.text, { fontSize: 13, color: isDark ? '#666' : '#999' }]}>
              {data.chapters.length} Chapter
            </Text>
          </View>
        </View>

        {/* GENRES */}
        {data.genres.length > 0 && (
          <Reanimated.View entering={FadeInDown.delay(100)} style={{ marginTop: 12 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
              {data.genres.map((genre: string, i: number) => (
                <View
                  key={i}
                  style={{
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                    borderRadius: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}>
                  <Text style={{ color: isDark ? '#ccc' : '#444', fontSize: 12, fontWeight: '600' }}>{genre}</Text>
                </View>
              ))}
            </ScrollView>
          </Reanimated.View>
        )}

        {/* SYNOPSIS */}
        <Reanimated.View entering={FadeInDown.delay(200)} style={{ marginHorizontal: 16, marginTop: 16 }}>
          <Text style={[globalStyles.text, { fontWeight: '700', fontSize: 16, marginBottom: 8, color: isDark ? '#fff' : '#111' }]}>
            Sinopsis
          </Text>
          <Text
            numberOfLines={showFullSynopsis ? undefined : 5}
            style={[globalStyles.text, { fontSize: 14, lineHeight: 22, color: isDark ? '#bbb' : '#444' }]}>
            {data.synopsis || 'Sinopsis tidak tersedia.'}
          </Text>
          {data.synopsis.length > 200 && (
            <TouchableOpacity onPress={() => setShowFullSynopsis(!showFullSynopsis)} style={{ marginTop: 4 }}>
              <Text style={{ color: '#3b82f6', fontSize: 13, fontWeight: '600' }}>
                {showFullSynopsis ? 'Sembunyikan' : 'Selengkapnya'}
              </Text>
            </TouchableOpacity>
          )}
        </Reanimated.View>

        {/* CHAPTER LIST HEADER */}
        <View style={{ marginTop: 20, paddingHorizontal: 16 }}>
          <Button
            buttonColor="rgba(59, 130, 246, 0.15)"
            textColor="#3b82f6"
            mode="contained-tonal"
            icon="playlist-plus"
            style={{ borderRadius: 6, marginBottom: 16 }}
            onPress={() => {
              if (!data.chapters[0]) {
                ToastAndroid.show('Data chapter tidak ditemukan', ToastAndroid.SHORT);
                return;
              }
              const watchLaterJson: watchLaterJSON = {
                title: data.title,
                link: props.route.params.link || '',
                rating: 'Novel',
                releaseYear: (data as any).releaseYear || 'Data tidak tersedia',
                thumbnailUrl: data.thumbnailUrl,
                genre: data.genres || [],
                date: Date.now(),
                isComics: false,
              };
              controlWatchLater('add', watchLaterJson);
              ToastAndroid.show('Ditambahkan ke tonton nanti', ToastAndroid.SHORT);
            }}>
            {isInList ? 'Sudah Ditambahkan' : 'Baca Nanti'}
          </Button>
          <View style={{ flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {lastReaded && lastReaded.episode && (
              <Button
                mode="contained"
                buttonColor="#3b82f6"
                textColor="#fff"
                icon="book-open"
                style={{ borderRadius: 6 }}
                onPress={() => {
                  navigateToChapter(lastReaded.link, { lastDuration: lastReaded.lastDuration ?? 0 });
                }}>
                Lanjutkan Membaca ({lastReaded.episode})
              </Button>
            )}
            <Button
              onPress={() => {
                const chapterData = data.chapters[data.chapters.length - 1]; // Novel chapters usually oldest to newest or newest to oldest?
                const firstCh = [...data.chapters].reverse()[0];
                if (!firstCh?.chapterUrl) {
                  ToastAndroid.show('Chapter tidak ditemukan', ToastAndroid.SHORT);
                  return;
                }
                navigateToChapter(firstCh.chapterUrl);
              }}
              mode="contained-tonal"
              buttonColor={isDark ? '#2a2a2a' : '#e0e0e0'}
              textColor={isDark ? '#fff' : '#000'}
              style={{ borderRadius: 6 }}>
              Baca Chapter Pertama
            </Button>
            <Button
              onPress={() => {
                const lastCh = data.chapters[0];
                if (!lastCh?.chapterUrl) {
                  ToastAndroid.show('Chapter tidak ditemukan', ToastAndroid.SHORT);
                  return;
                }
                navigateToChapter(lastCh.chapterUrl);
              }}
              mode="contained-tonal"
              buttonColor={isDark ? '#2a2a2a' : '#e0e0e0'}
              textColor={isDark ? '#fff' : '#000'}
              style={{ borderRadius: 6 }}>
              Baca Chapter Terbaru
            </Button>
          </View>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: 8,
              borderBottomWidth: 1,
              borderBottomColor: isDark ? '#2a2a2a' : '#eee',
              marginBottom: 4,
            }}>
            <Text style={[globalStyles.text, { fontWeight: '700', fontSize: 18, color: isDark ? '#fff' : '#111' }]}>
              Daftar Chapter
            </Text>
            <TouchableOpacity onPress={() => setSortAsc(!sortAsc)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MaterialIcon name={sortAsc ? 'arrow-upward' : 'arrow-downward'} size={16} color="#3b82f6" />
              <Text style={[globalStyles.text, { fontSize: 12, color: '#3b82f6', fontWeight: '600' }]}>
                {sortAsc ? 'Terlama' : 'Terbaru'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    ),
    [data, isDark, globalStyles.text, dimensions.width, showFullSynopsis, lastReaded, navigateToChapter, sortAsc],
  );

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0f0f0f' : '#fafafa' }}>
      <FlashList
        // @ts-ignore
        estimatedItemSize={200}
        data={chapters}
        renderItem={renderChapter}
        keyExtractor={(item: ChapterItem, index: number) => item.chapterUrl || `ch-${index}`}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <Text style={[globalStyles.text, { color: isDark ? '#666' : '#999' }]}>
              Tidak ada chapter
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
