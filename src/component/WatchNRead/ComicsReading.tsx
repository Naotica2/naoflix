import { useFocusEffect } from '@react-navigation/core';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, View, ToastAndroid } from 'react-native';
import { SystemBars } from 'react-native-edge-to-edge';
import {
  Appbar,
  Button,
  IconButton,
  Portal,
  ProgressBar,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import { useBackHandler } from '../../hooks/useBackHandler';
import { RootStackNavigator } from '../../types/navigation';
import DialogManager from '../../utils/dialogManager';
import setHistory from '../../utils/historyControl';
import { getComicsReading } from '../../utils/scrapers/comicsv2';
import { getKomikuReading } from '../../utils/scrapers/komiku';
// Source-aware routing: use getComicsReading for komikindo/softkomik/mynimeku, getKomikuReading for komiku
import { useLevel } from '../../misc/LevelContext';
import { EXP_REWARDS } from '../../utils/LevelSystem';
import { useTimeTracker } from '../../utils/UserTracker';

type Props = NativeStackScreenProps<RootStackNavigator, 'ComicsReading'>;

export default function ComicsReading(props: Props) {
  const theme = useTheme();
  const webViewRef = useRef<WebView>(null);
  useTimeTracker('comic');
  const { addExp } = useLevel();
  const awardedChaptersRef = useRef<Set<string>>(new Set());

  const abortController = useRef<AbortController>(null);
  const imageFetchOnRNAbortController = useRef<AbortController>(null);

  useFocusEffect(
    useCallback(() => {
      abortController.current = new AbortController();
      imageFetchOnRNAbortController.current = new AbortController();
      const appState = AppState.addEventListener('blur', () => {
        webViewRef.current?.injectJavaScript(`window.stopAutoScroll(); true;`);
        setIsAutoScrolling(false);
      });
      return () => {
        appState.remove();
        abortController.current?.abort();
      };
    }, []),
  );

  const [isSnackBarOpen, setIsSnackBarOpen] = useState(false);
  const [snackBarText, setSnackBarText] = useState('');

  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentlyVisibleImageId, setCurrentlyVisibleImageId] = useState(0);

  // --- Layout & Handlers ---

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
        abortController.current?.abort();
        imageFetchOnRNAbortController.current?.abort();
      };
    }, []),
  );

  useBackHandler(
    useCallback(() => {
      if (isFullscreen) {
        setIsFullscreen(false);
        return true;
      } else return false;
    }, [isFullscreen]),
  );
  const comicsDownloadLoading = useRef(false);
  const startComicsDownload = useCallback(() => {
    if (comicsDownloadLoading.current) return;
    comicsDownloadLoading.current = true;
    fetch('https://vortexdownloader.rwbcode.com/api/requestComicsDownloadId', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: props.route.params.data.title + ' - ' + props.route.params.data.chapter,
        comicImages: props.route.params.data.comicImages,
        sourceLink: props.route.params.link,
      }),
      signal: abortController.current?.signal,
    })
      .then(res => res.json())
      .then(res => {
        Linking.openURL(`https://vortexdownloader.rwbcode.com/api/getComicsDownload/${res.id}`);
      })
      .finally(() => {
        setIsSnackBarOpen(false);
        comicsDownloadLoading.current = false;
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        DialogManager.alert('Gagal memulai unduhan', err.message);
      });
    setSnackBarText('Menyiapkan unduhan...');
    setIsSnackBarOpen(true);
  }, [
    props.route.params.data.chapter,
    props.route.params.data.comicImages,
    props.route.params.data.title,
    props.route.params.link,
  ]);
  useEffect(() => {
    props.navigation.setOptions({
      headerTitle: props.route.params.link.includes('softkomik')
        ? 'Chapter ' + props.route.params.data.chapter
        : props.route.params.data.chapter,
      headerShown: !isFullscreen,
      header: headerProps => (
        <Appbar.Header>
          {headerProps.back && (
            <Appbar.BackAction
              onPress={() => {
                headerProps.navigation.goBack();
              }}
            />
          )}
          <Appbar.Content
            titleStyle={{ fontWeight: 'bold' }}
            title={
              typeof headerProps.options.headerTitle === 'string'
                ? headerProps.options.headerTitle
                : ''
            }
          />
          <Appbar.Action icon={'download'} onPress={startComicsDownload} />
        </Appbar.Header>
      ),
    });
  }, [
    isFullscreen,
    props.navigation,
    props.route.params.data.chapter,
    props.route.params.data.comicImages,
    props.route.params.data.title,
    props.route.params.link,
    startComicsDownload,
  ]);


  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'SCROLL_UPDATE') {
        const visibleImageId = Number(data.id);
        if (!isNaN(visibleImageId)) {
          if (visibleImageId !== currentlyVisibleImageId) {
            setCurrentlyVisibleImageId(visibleImageId);
            setHistory(
              props.route.params.data,
              props.route.params.link,
              true,
              { 
                lastDuration: visibleImageId,
                thumbnailUrl: props.route.params.thumbnailUrl
              },
              false,
              true,
              props.route.params.title,
            );
          }
        }
      } else if (data.type === 'END_REACHED') {
        setIsAutoScrolling(false);
      } else if (data.type === 'TOGGLE_FULLSCREEN') {
        setIsFullscreen(f => !f);
      }
    } catch (e) {
      if (event.nativeEvent.data === 'endReached') {
        setIsAutoScrolling(false);
      }
    }
  };

  const toggleAutoScroll = useCallback(() => {
    const newState = !isAutoScrolling;
    setIsAutoScrolling(newState);

    if (newState) {
      webViewRef.current?.injectJavaScript(`
        window.updateScrollSpeed(${scrollSpeed});
        window.startAutoScroll();
        true;
      `);
    } else {
      webViewRef.current?.injectJavaScript(`window.stopAutoScroll(); true;`);
    }
  }, [isAutoScrolling, scrollSpeed]);

  const changeSpeed = (delta: number) => {
    setScrollSpeed(prev => {
      const newSpeed = Math.max(0.2, parseFloat((prev + delta).toFixed(1)));
      if (isAutoScrolling) {
        webViewRef.current?.injectJavaScript(`window.updateScrollSpeed(${newSpeed}); true;`);
      }
      return newSpeed;
    });
  };
  const moveChapter = useCallback(
    (url: string) => {
      if (isSnackBarOpen) return;
      if (isAutoScrolling) toggleAutoScroll();

      setSnackBarText('Mengambil data...');
      setIsSnackBarOpen(true);
      (url.includes('komikindo') || url.includes('softkomik') || url.includes('mynimeku') || url.includes('bacakomik') || url.includes('page=chapter') || url.includes('fruatre.my.id') || url.startsWith('shinigami://') || url.startsWith('komikcast://')
        ? getComicsReading
        : getKomikuReading)(url, abortController.current?.signal)
        .then(res => {
          imageFetchOnRNAbortController.current?.abort();
          imageFetchOnRNAbortController.current = new AbortController();
          props.navigation.setParams({
            data: res,
            link: url,
            historyData: undefined,
          });
          setHistory(res, url, false, { thumbnailUrl: props.route.params.thumbnailUrl }, false, true, props.route.params.title);
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
          DialogManager.alert('Gagal mengambil data', err.message);
        })
        .finally(() => setIsSnackBarOpen(false));
    },
    [isSnackBarOpen, isAutoScrolling, toggleAutoScroll, props.navigation],
  );

  const { data } = props.route.params;
  const comicImages = props.route.params.data.comicImages;

  useEffect(() => {
    const link = props.route.params.link;
    if (link && !awardedChaptersRef.current.has(link)) {
      awardedChaptersRef.current.add(link);
      addExp(EXP_REWARDS.READ_CHAPTER);
      ToastAndroid.show(`+${EXP_REWARDS.READ_CHAPTER} EXP`, ToastAndroid.SHORT);
    }
  }, [props.route.params.link, addExp]);

  // --- HTML Generation ---

  const bgColor = theme.dark ? '#121212' : '#ffffff';
  const shimmerBase = theme.dark ? '#333333' : '#e0e0e0';
  const shimmerHighlight = theme.dark ? '#444444' : '#f0f0f0';
  const errorTextColor = theme.dark ? '#ffb4ab' : '#ba1a1a';

  const errorSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${errorTextColor}"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
  const errorIconUrl = `data:image/svg+xml;base64,${btoa(errorSvg)}`;

  const styles = `
    <style>
      body {
        margin: 0;
        background-color: ${bgColor};
        overflow-anchor: auto;
      }
      
      .img-wrapper {
        min-height: 50vh;
        width: 100%;
        position: relative;
        background-color: ${shimmerBase};
        overflow: hidden;
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .img-wrapper::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, ${shimmerBase} 25%, ${shimmerHighlight} 50%, ${shimmerBase} 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        z-index: 1;
      }

      @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      img {
        width: 100%;
        height: auto;
        display: block;
        opacity: 0;
        transition: opacity 0.2s ease-in; 
        position: relative;
        z-index: 2;
        min-height: 50px;
      }

      img.loaded {
        opacity: 1;
        min-height: auto;
      }

      .img-wrapper.has-loaded {
        min-height: auto;
        background: none;
      }
      .img-wrapper.has-loaded::before {
        display: none;
      }

      /* Error Styles */
      .img-wrapper.is-error {
        min-height: 250px;
        background-color: ${theme.dark ? '#2a2a2a' : '#ffebee'};
        cursor: pointer;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
      }
      .img-wrapper.is-error::before { display: none; }
      
      .img-wrapper.is-error::after {
        content: "Gagal memuat gambar. Ketuk untuk ulangi.";
        font-family: sans-serif;
        color: ${errorTextColor};
        margin-top: 12px;
        font-size: 14px;
        font-weight: 500;
      }

      .img-wrapper.is-error .error-icon {
        width: 48px;
        height: 48px;
        background-image: url('${errorIconUrl}');
        background-repeat: no-repeat;
        background-position: center;
        display: block;
      }
      .img-wrapper.is-error img { display: none; }
    </style>
  `;

  const body = comicImages
    .map((link, index) => {
      return `
        <div class="img-wrapper" id="wrap-${index}">
           <div class="error-icon" style="display:none"></div>
           <img 
              data-src="${link}" 
              id="${index}"
           />
        </div>
      `;
    })
    .join('\n');

  const linkStr = props.route.params.link || '';
  const needsReferrer = linkStr.includes('komiku') || linkStr.includes('komikcast');
  const referrerMeta = needsReferrer 
    ? '<meta name="referrer" content="origin" />' 
    : '<meta name="referrer" content="no-referrer" />';

  const html = `<head><meta name="viewport" content="width=device-width, initial-scale=1.0" />${referrerMeta}${styles}</head><body>${body}</body>`;

  const injectedJavaScript = `
    // --- Communication ---
    function sendToRN(data) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
    }

    // --- Auto Scroll ---
    const PIXELS_PER_SECOND = 60;
    window.autoScrollFrame = null;
    window.scrollSpeed = PIXELS_PER_SECOND;

    window.updateScrollSpeed = (speed) => {
      window.scrollSpeed = speed * PIXELS_PER_SECOND;
    };

    window.startAutoScroll = () => {
      if (window.autoScrollFrame) cancelAnimationFrame(window.autoScrollFrame);
      let lastTime = null;

      function step(timestamp) {
        if (!lastTime) lastTime = timestamp;
        const deltaTime = (timestamp - lastTime) / 1000;
        lastTime = timestamp;
        
        const pixelsToScroll = window.scrollSpeed * deltaTime;

        if (pixelsToScroll > 0) {
            window.scrollBy(0, pixelsToScroll);
        }

        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 1) {
             window.stopAutoScroll();
             sendToRN({ type: 'END_REACHED' });
        } else {
           window.autoScrollFrame = requestAnimationFrame(step);
        }
      }
      window.autoScrollFrame = requestAnimationFrame(step);
    };

    window.stopAutoScroll = () => {
      if (window.autoScrollFrame) cancelAnimationFrame(window.autoScrollFrame);
      window.autoScrollFrame = null;
    };

    // --- Restore History ---
    ${
      props.route.params.historyData
        ? `
          setTimeout(() => {
             const lastDuration = '${props.route.params.historyData.lastDuration}';
             const target = document.getElementById(lastDuration);
             if (target) {
               target.scrollIntoView({ behavior: 'instant', block: 'end' });
               setTimeout(() => {
                 target.scrollIntoView({ behavior: 'smooth', block: 'end' });
               }, 500);
             };
          }, 300);
          `
        : ''
    }

    // --- OBSERVERS ---
    const sendScrollUpdate = (id) => {
        sendToRN({ type: 'SCROLL_UPDATE', id: id });
    }

    const historyOptions = {
      root: null,
      rootMargin: '20% 0px -50% 0px',
      threshold: 0
    };

    const historyObserver = new IntersectionObserver((entries) => {
      const visibleEntry = entries.find(e => e.isIntersecting);
      if (visibleEntry) {
         sendScrollUpdate(visibleEntry.target.id);
      }
    }, historyOptions);

    // 2. Fetch Observer (Direct Load)
    const fetchOptions = {
      root: null,
      rootMargin: '250% 0px 250% 0px',
      threshold: 0.01
    };

    window.fetchObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const img = entry.target;
        if (entry.isIntersecting && !img.src) {
           const wrapper = document.getElementById('wrap-' + img.id);
           img.onload = () => {
             img.classList.add('loaded');
             wrapper.classList.add('has-loaded');
             wrapper.classList.remove('is-error'); 
           };
           img.onerror = () => {
             wrapper.classList.add('is-error');
             const icon = wrapper.querySelector('.error-icon');
             if(icon) icon.style.display = 'block';
           };
           img.src = img.dataset.src;
           window.fetchObserver.unobserve(img);
        }
      });
    }, fetchOptions);

    // Retry Listener & Fullscreen Toggle
    document.addEventListener('click', (e) => {
      const wrapper = e.target.closest('.img-wrapper.is-error');
      if (wrapper) {
        const img = wrapper.querySelector('img');
        if (img) {
          wrapper.classList.remove('is-error');
          const icon = wrapper.querySelector('.error-icon');
          if(icon) icon.style.display = 'none';
          img.src = img.dataset.src + "?retry=" + new Date().getTime();
        }
      } else {
        sendToRN({ type: 'TOGGLE_FULLSCREEN' });
      }
    });

    // Init Observers
    const allImages = document.querySelectorAll('img');
    allImages.forEach(img => {
      historyObserver.observe(img);
      window.fetchObserver.observe(img);
    });
  `;

  return (
    <View style={{ flex: 1 }}>
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

      <WebView
        ref={webViewRef}
        style={{ flex: 1, backgroundColor: bgColor }}
        overScrollMode="never"
        source={{ html, baseUrl: props.route.params.link.startsWith('komikcast://') ? 'https://komikcast.cc/' : props.route.params.link }}
        injectedJavaScript={injectedJavaScript}
        onMessage={handleMessage}
        showsVerticalScrollIndicator={false}
        androidLayerType="hardware"
        userAgent="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      />

      <View>
        <View
          style={{
            backgroundColor: theme.colors.elevation.level1,
            justifyContent: 'space-around',
            display: isFullscreen ? 'none' : 'flex',
          }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Button
              mode={isAutoScrolling ? 'contained-tonal' : 'text'}
              icon={isAutoScrolling ? 'pause' : 'play'}
              onPress={toggleAutoScroll}
              compact>
              {isAutoScrolling ? 'Stop' : 'Auto Scroll'}
            </Button>

            <View style={{ width: 16 }} />

            <IconButton
              icon="minus"
              size={20}
              onPress={() => changeSpeed(-0.2)}
              disabled={scrollSpeed <= 0.2}
            />
            <Text variant="labelLarge" style={{ marginHorizontal: 4 }}>
              {scrollSpeed.toFixed(1)}x
            </Text>
            <IconButton
              icon="plus"
              size={20}
              onPress={() => changeSpeed(0.2)}
              disabled={scrollSpeed >= 10}
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-around',
            }}>
            {data.prevChapter && (
              <Button
                icon="arrow-left"
                onPress={() => {
                  moveChapter(data.prevChapter!);
                }}>
                Sebelumnya
              </Button>
            )}
            {data.nextChapter && (
              <Button
                icon="arrow-right"
                onPress={() => {
                  moveChapter(data.nextChapter!);
                }}
                contentStyle={{ flexDirection: 'row-reverse' }}>
                Selanjutnya
              </Button>
            )}
          </View>
        </View>

        <ProgressBar
          style={{
            marginBottom: isFullscreen ? 4 : 0,
            height: 4,
          }}
          progress={currentlyVisibleImageId / (comicImages.length - 1)}
        />
      </View>
    </View>
  );
}
