import { useFocusEffect } from '@react-navigation/core';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { SystemBars } from 'react-native-edge-to-edge';
import {
  Appbar,
  Button,
  IconButton,
  Portal,
  ProgressBar,
  Snackbar,
  useTheme,
} from 'react-native-paper';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { LegendList } from '@legendapp/list';
import { useBackHandler } from '../../hooks/useBackHandler';
import { RootStackNavigator } from '../../types/navigation';
import DialogManager from '../../utils/dialogManager';
import setHistory from '../../utils/historyControl';
import { getNovelReading } from '../../utils/scrapers/meionovel';
import { useLevel } from '../../misc/LevelContext';
import { EXP_REWARDS } from '../../utils/LevelSystem';
import { useTimeTracker } from '../../utils/UserTracker';

type Props = NativeStackScreenProps<RootStackNavigator, 'NovelReading'>;

const FONT_SIZES = [14, 16, 18, 20, 22];
const FONT_SIZE_LABELS = ['XS', 'S', 'M', 'L', 'XL'];

export default function NovelReading(props: Props) {
  const theme = useTheme();
  useTimeTracker('novel');
  const { addExp } = useLevel();
  const awardedChaptersRef = useRef<Set<string>>(new Set());
  const abortController = useRef<AbortController>(null);
  const scrollViewRef = useRef<GHScrollView>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSnackBarOpen, setIsSnackBarOpen] = useState(false);
  const [snackBarText, setSnackBarText] = useState('');
  const [fontSizeIndex, setFontSizeIndex] = useState(2); // Default: Medium (18)
  const [scrollProgress, setScrollProgress] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);

  const fontSize = FONT_SIZES[fontSizeIndex];
  const isDark = theme.dark;

  useFocusEffect(
    useCallback(() => {
      abortController.current = new AbortController();
      return () => {
        abortController.current?.abort();
      };
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      SystemNavigationBar.fullScreen(isFullscreen);
      if (isFullscreen) {
        SystemNavigationBar.navigationHide();
        SystemBars.setHidden(true);
      } else {
        SystemNavigationBar.navigationShow();
        SystemBars.setHidden(false);
      }
    }, [isFullscreen]),
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        SystemNavigationBar.fullScreen(false);
        SystemNavigationBar.navigationShow();
        SystemBars.setHidden(false);
      };
    }, []),
  );

  useBackHandler(
    useCallback(() => {
      if (isFullscreen) {
        setIsFullscreen(false);
        return true;
      }
      return false;
    }, [isFullscreen]),
  );

  useEffect(() => {
    props.navigation.setOptions({
      headerTitle: props.route.params.data.chapter,
      headerShown: !isFullscreen,
      header: headerProps => (
        <Appbar.Header>
          {headerProps.back && (
            <Appbar.BackAction onPress={() => headerProps.navigation.goBack()} />
          )}
          <Appbar.Content
            titleStyle={{ fontWeight: 'bold' }}
            title={
              typeof headerProps.options.headerTitle === 'string'
                ? headerProps.options.headerTitle
                : ''
            }
          />
        </Appbar.Header>
      ),
    });
  }, [isFullscreen, props.navigation, props.route.params.data.chapter]);

  useEffect(() => {
    const link = props.route.params.link;
    if (link && !awardedChaptersRef.current.has(link)) {
      awardedChaptersRef.current.add(link);
      addExp(EXP_REWARDS.READ_CHAPTER);
      ToastAndroid.show(`+${EXP_REWARDS.READ_CHAPTER} EXP`, ToastAndroid.SHORT);
    }
  }, [props.route.params.link, addExp]);

  useEffect(() => {
    setHistory(
      {
        title: props.route.params.data.title,
        chapter: props.route.params.data.chapter,
        thumbnailUrl: props.route.params.data.thumbnailUrl,
        comicImages: [],
        nextChapter: props.route.params.data.nextChapter,
        prevChapter: props.route.params.data.prevChapter,
      } as any,
      props.route.params.link,
      false,
      undefined,
      false,
      false, // isComics = false, handled correctly by domain checking
    );
  }, [props.route.params]);

  const moveChapter = useCallback(
    (url: string) => {
      if (isSnackBarOpen) return;
      setSnackBarText('Mengambil data...');
      setIsSnackBarOpen(true);

      getNovelReading(url, abortController.current?.signal)
        .then(res => {
          props.navigation.setParams({
            data: res,
            link: url,
            historyData: undefined,
          });
          scrollViewRef.current?.scrollTo({ y: 0, animated: false } as any);
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
          DialogManager.alert('Gagal mengambil data', err.message);
        })
        .finally(() => setIsSnackBarOpen(false));
    },
    [isSnackBarOpen, props.navigation],
  );

  const handleScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const progress = contentSize.height - layoutMeasurement.height > 0
      ? contentOffset.y / (contentSize.height - layoutMeasurement.height)
      : 0;
    setScrollProgress(Math.min(Math.max(progress, 0), 1));
  }, []);

  const { data } = props.route.params;

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#1a1a1a' : '#faf8f5' }}>
      <Portal>
        <Snackbar
          duration={Infinity}
          onDismiss={() => setIsSnackBarOpen(false)}
          visible={isSnackBarOpen}
          action={{
            label: 'Batal',
            onPress: () => {
              abortController.current?.abort();
              abortController.current = new AbortController();
            },
          }}>
          {snackBarText}
        </Snackbar>
      </Portal>

      <LegendList
        key={fontSizeIndex}
        ref={scrollViewRef as any}
        style={{ flex: 1 }}
        contentContainerStyle={styles.contentContainer}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        recycleItems
        data={data.content}
        keyExtractor={(_: string, index: number) => `p-${index}`}
        renderItem={({ item: paragraph, index }: { item: string; index: number }) => (
          index === 0 ? (
            <>
              <Text style={[styles.chapterTitle, { color: isDark ? '#e0e0e0' : '#333' }]}>
                {data.chapter}
              </Text>
              <Text
                style={[
                  styles.paragraph,
                  { fontSize, lineHeight: fontSize * 1.8, color: isDark ? '#d4d4d4' : '#2a2a2a' },
                ]}
                onPress={() => setIsFullscreen(f => !f)}>
                {paragraph}
              </Text>
            </>
          ) : (
            <Text
              style={[
                styles.paragraph,
                { fontSize, lineHeight: fontSize * 1.8, color: isDark ? '#d4d4d4' : '#2a2a2a' },
              ]}
              onPress={() => setIsFullscreen(f => !f)}>
              {paragraph}
            </Text>
          )
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 40 }}>
            <Text style={{ color: isDark ? '#888' : '#666', fontSize: 16 }}>
              Konten tidak tersedia
            </Text>
          </View>
        }
      />

      {/* Bottom controls */}
      <View style={{ display: isFullscreen ? 'none' : 'flex' }}>
        <View
          style={[
            styles.controls,
            { backgroundColor: theme.colors.elevation.level1 },
          ]}>
          {/* Font size controls */}
          <View style={styles.fontSizeRow}>
            <IconButton
              icon="format-font-size-decrease"
              size={18}
              onPress={() => setFontSizeIndex(i => Math.max(0, i - 1))}
              disabled={fontSizeIndex <= 0}
            />
            <Text style={{ color: isDark ? '#ccc' : '#333', fontSize: 12, fontWeight: 'bold' }}>
              {FONT_SIZE_LABELS[fontSizeIndex]}
            </Text>
            <IconButton
              icon="format-font-size-increase"
              size={18}
              onPress={() => setFontSizeIndex(i => Math.min(FONT_SIZES.length - 1, i + 1))}
              disabled={fontSizeIndex >= FONT_SIZES.length - 1}
            />
          </View>

          {/* Nav buttons */}
          <View style={styles.navRow}>
            {data.prevChapter && (
              <Button
                icon="arrow-left"
                onPress={() => moveChapter(data.prevChapter!)}
                compact>
                Sebelumnya
              </Button>
            )}
            {data.nextChapter && (
              <Button
                icon="arrow-right"
                onPress={() => moveChapter(data.nextChapter!)}
                contentStyle={{ flexDirection: 'row-reverse' }}
                compact>
                Selanjutnya
              </Button>
            )}
          </View>
        </View>

        <ProgressBar
          style={{ height: 3 }}
          progress={scrollProgress}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  chapterTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  paragraph: {
    marginBottom: 16,
    textAlign: 'justify',
  },
  controls: {
    paddingVertical: 4,
  },
  fontSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
});
