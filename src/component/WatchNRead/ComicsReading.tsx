import { useFocusEffect } from '@react-navigation/core';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import RNFetchBlob from 'react-native-blob-util';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import { useBackHandler } from '../../hooks/useBackHandler';
import { RootStackNavigator } from '../../types/navigation';
import deviceUserAgent from '../../utils/deviceUserAgent';
import DialogManager from '../../utils/dialogManager';
import setHistory from '../../utils/historyControl';
import { getComicsReading } from '../../utils/scrapers/comicsv2';
import { getKomikuReading } from '../../utils/scrapers/komiku';
import { BASE as getVoratoonBase } from '../../utils/scrapers/voratoon';
import { useLevel } from '../../misc/LevelContext';
import { EXP_REWARDS } from '../../utils/LevelSystem';
import { useTimeTracker } from '../../utils/UserTracker';
import { tSync, useLanguage } from '../../misc/LanguageContext';

type Props = NativeStackScreenProps<RootStackNavigator, 'ComicsReading'>;

export default function ComicsReading(props: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const webViewRef = useRef<WebView>(null);
  useTimeTracker('comic');
  const { addExp } = useLevel();
  const awardedChaptersRef = useRef<Set<string>>(new Set());

  const abortController = useRef<AbortController>(null);
  const imageFetchOnRNAbortController = useRef<AbortController>(null);
  const rnImageQueueRef = useRef<Array<() => void>>([]);
  const activeRnImageCountRef = useRef(0);
  const activeRnTasksRef = useRef<Set<{ cancel?: () => void }>>(new Set());

  const cancelPendingRNImages = useCallback(() => {
    rnImageQueueRef.current = [];
    activeRnTasksRef.current.forEach(t => {
      try {
        t.cancel?.();
      } catch {}
    });
    activeRnTasksRef.current.clear();
    imageFetchOnRNAbortController.current?.abort();
    imageFetchOnRNAbortController.current = new AbortController();
  }, []);

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
        cancelPendingRNImages();
      };
    }, [cancelPendingRNImages]),
  );

  const [isSnackBarOpen, setIsSnackBarOpen] = useState(false);
  const [snackBarText, setSnackBarText] = useState('');

  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentlyVisibleImageId, setCurrentlyVisibleImageId] = useState(0);
  const historyTimeout = useRef<NodeJS.Timeout | null>(null);
  const fullscreenDebounce = useRef<NodeJS.Timeout | null>(null);
  const lastFullscreenToggleTime = useRef(0);


  useEffect(() => {
    if (fullscreenDebounce.current) clearTimeout(fullscreenDebounce.current);
    fullscreenDebounce.current = setTimeout(() => {
      SystemNavigationBar.fullScreen(isFullscreen);
      if (isFullscreen) {
        SystemNavigationBar.navigationHide();
        SystemBars.setHidden(true);
      } else {
        SystemNavigationBar.navigationShow();
        SystemBars.setHidden(false);
      }
    }, 150);
  }, [isFullscreen]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (fullscreenDebounce.current) clearTimeout(fullscreenDebounce.current);
        if (historyTimeout.current) clearTimeout(historyTimeout.current);
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
        DialogManager.alert(tSync('reader.downloadStartFailed'), err.message);
      });
    setSnackBarText(tSync('offline.preparing'));
    setIsSnackBarOpen(true);
  }, [
    props.route.params.data.chapter,
    props.route.params.data.comicImages,
    props.route.params.data.title,
    props.route.params.link,
  ]);
  const headerChapterTitle = useMemo(() => {
    const rawChapter = (props.route.params.data.chapter || '').trim();
    const rawTitle = (props.route.params.data.title || '').trim();
    const link = props.route.params.link || '';

    if (link.includes('softkomik') && rawChapter) {
      return /^chapter\b/i.test(rawChapter) ? rawChapter : `Chapter ${rawChapter}`;
    }

    const looksOnlyLikeSeriesTitle =
      !rawChapter ||
      rawChapter === 'Data tidak tersedia' ||
      (rawTitle &&
        rawChapter.toLowerCase() === rawTitle.toLowerCase() &&
        !/(?:chapter|ch\.?\s*\d)/i.test(rawChapter));

    if (looksOnlyLikeSeriesTitle) {
      const fromTitle = rawTitle.match(/(?:Chapter|Ch\.?)\s*\d+(?:[.,]\d+)?/i);
      if (fromTitle) {
        return fromTitle[0].replace(/^ch\.?\s*/i, 'Chapter ').replace(',', '.').trim();
      }
      const fromLink =
        link.match(/\/chapter\/(?:chapter[-_]?)?(\d+(?:[-.]\d+)?)/i) ||
        link.match(/chapter[-_](\d+(?:[-.]\d+)?)/i);
      if (fromLink?.[1]) {
        return `Chapter ${fromLink[1].replace('-', '.')}`;
      }
    }

    return rawChapter || rawTitle || 'Chapter';
  }, [props.route.params.data.chapter, props.route.params.data.title, props.route.params.link]);

  useEffect(() => {
    props.navigation.setOptions({
      headerTitle: headerChapterTitle,
      headerShown: !isFullscreen,
      headerTransparent: true,
      header: headerProps => (
        <Appbar.Header elevated style={{ backgroundColor: theme.colors.elevation.level2 }}>
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
    headerChapterTitle,
    isFullscreen,
    props.navigation,
    startComicsDownload,
    theme.colors.elevation.level2,
  ]);


  const fetchImageViaRN = useCallback(
    (id: string, url: string) => {
      const signal = imageFetchOnRNAbortController.current?.signal;
      if (signal?.aborted || !url.startsWith('http')) return;

      const executeTask = async () => {
        if (signal?.aborted) {
          const next = rnImageQueueRef.current.shift();
          if (next) next();
          return;
        }
        activeRnImageCountRef.current += 1;
        const linkStr = props.route.params.link || '';
        const isVoratoon = url.includes('voratoon') || linkStr.includes('voratoon');
        const referer = isVoratoon
          ? `${getVoratoonBase()}/`
          : url.includes('komikcast') || linkStr.startsWith('komikcast://')
            ? 'https://komikcast.cc/'
            : url.includes('komiku') || linkStr.includes('komiku')
              ? 'https://komiku.id/'
              : url.includes('komikindo') || linkStr.includes('komikindo')
                ? 'https://komikindo.ch/'
                : linkStr.startsWith('http')
                  ? linkStr
                  : '';

        const task = RNFetchBlob.fetch('GET', url, {
          'User-Agent': deviceUserAgent,
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          ...(referer ? { Referer: referer } : {}),
        });
        activeRnTasksRef.current.add(task);

        try {
          const res = await task;
          if (signal?.aborted) return;
          const info = res.info();
          const status = info.status;
          if (status >= 200 && status < 300) {
            const headers = info.headers || {};
            const ctHeader =
              headers['Content-Type'] || headers['content-type'] || headers['Content-type'] || '';
            let mime = String(ctHeader).split(';')[0].trim();
            if (!mime.startsWith('image/')) {
              const lowerUrl = url.toLowerCase();
              if (lowerUrl.includes('.avif')) mime = 'image/avif';
              else if (lowerUrl.includes('.webp')) mime = 'image/webp';
              else if (lowerUrl.includes('.png')) mime = 'image/png';
              else if (lowerUrl.includes('.gif')) mime = 'image/gif';
              else mime = 'image/jpeg';
            }
            const b64 = res.base64();
            if (b64 && b64.length > 0 && !signal?.aborted) {
              const dataUri = `data:${mime};base64,${b64}`;
              webViewRef.current?.injectJavaScript(
                `window.__onRNImageFetched && window.__onRNImageFetched(${JSON.stringify(id)}, ${JSON.stringify(dataUri)}); true;`,
              );
              return;
            }
          }
          if (!signal?.aborted) {
            webViewRef.current?.injectJavaScript(
              `window.__onRNImageError && window.__onRNImageError(${JSON.stringify(id)}); true;`,
            );
          }
        } catch {
          if (!signal?.aborted) {
            webViewRef.current?.injectJavaScript(
              `window.__onRNImageError && window.__onRNImageError(${JSON.stringify(id)}); true;`,
            );
          }
        } finally {
          activeRnTasksRef.current.delete(task);
          activeRnImageCountRef.current = Math.max(0, activeRnImageCountRef.current - 1);
          const next = rnImageQueueRef.current.shift();
          if (next) next();
        }
      };

      if (activeRnImageCountRef.current < 4) {
        executeTask();
      } else {
        rnImageQueueRef.current.push(executeTask);
      }
    },
    [props.route.params.link],
  );

  const resolvedSeriesLink =
    props.route.params.seriesLink ?? (props.route.params.historyData as any)?.seriesLink;

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'SCROLL_UPDATE') {
        const visibleImageId = Number(data.id);
        if (!isNaN(visibleImageId)) {
          if (visibleImageId !== currentlyVisibleImageId) {
            setCurrentlyVisibleImageId(visibleImageId);
            if (historyTimeout.current) clearTimeout(historyTimeout.current);
            historyTimeout.current = setTimeout(() => {
              setHistory(
                props.route.params.data,
                props.route.params.link,
                true,
                {
                  lastDuration: visibleImageId,
                  thumbnailUrl: props.route.params.thumbnailUrl,
                  ...(resolvedSeriesLink ? { seriesLink: resolvedSeriesLink } : {}),
                },
                false,
                true,
                props.route.params.title,
              );
            }, 1000);
          }
        }
      } else if (data.type === 'END_REACHED') {
        setIsAutoScrolling(false);
      } else if (data.type === 'TOGGLE_FULLSCREEN') {
        const now = Date.now();
        if (now - lastFullscreenToggleTime.current > 400) {
          lastFullscreenToggleTime.current = now;
          setIsFullscreen(f => !f);
        }
      } else if (data.type === 'FETCH_IMAGE' && data.id !== undefined && data.url) {
        fetchImageViaRN(String(data.id), String(data.url));
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

      setSnackBarText(tSync('search.loadingData'));
      setIsSnackBarOpen(true);
      (url.includes('komikindo') ||
        url.includes('softkomik') ||
        url.includes('mynimeku') ||
        url.includes('bacakomik') ||
        url.includes('page=chapter') ||
        url.includes('fruatre.my.id') ||
        url.startsWith('shinigami://') ||
        url.startsWith('komikcast://') ||
        url.startsWith('luvyaa://') ||
        url.startsWith('voratoon://') ||
        url.startsWith('voratoon:/') ||
        url.includes('voratoon.')
        ? getComicsReading
        : getKomikuReading)(url, abortController.current?.signal)
        .then(res => {
          cancelPendingRNImages();
          props.navigation.setParams({
            data: res,
            link: url,
            historyData: undefined,
            ...(resolvedSeriesLink ? { seriesLink: resolvedSeriesLink } : {}),
          });
          setHistory(
            res,
            url,
            false,
            {
              thumbnailUrl: props.route.params.thumbnailUrl,
              ...(resolvedSeriesLink ? { seriesLink: resolvedSeriesLink } : {}),
            },
            false,
            true,
            props.route.params.title,
          );
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
          DialogManager.alert(tSync('reader.fetchFailed'), err.message);
        })
        .finally(() => setIsSnackBarOpen(false));
    },
    [
      isSnackBarOpen,
      isAutoScrolling,
      toggleAutoScroll,
      props.navigation,
      cancelPendingRNImages,
      props.route.params.thumbnailUrl,
      props.route.params.title,
      resolvedSeriesLink,
    ],
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


  const bgColor = theme.dark ? '#121212' : '#ffffff';
  const shimmerBase = theme.dark ? '#333333' : '#e0e0e0';
  const shimmerHighlight = theme.dark ? '#444444' : '#f0f0f0';
  const errorTextColor = theme.dark ? '#ffb4ab' : '#ba1a1a';

  const errorSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${errorTextColor}"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
  const errorIconUrl = `data:image/svg+xml;base64,${btoa(errorSvg)}`;
  const imageLoadFailedText = t('reader.imageLoadFailed');

  const styles = useMemo(
    () => `
    <style>
      body {
        margin: 0;
        background-color: ${bgColor};
        overflow-anchor: auto;
        touch-action: manipulation;
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
        content: ${JSON.stringify(imageLoadFailedText)};
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
  `,
    [bgColor, shimmerBase, shimmerHighlight, theme.dark, imageLoadFailedText, errorTextColor, errorIconUrl],
  );

  const htmlSource = useMemo(() => {
    const body = comicImages
      .map((link, index) => {
        const safeLink = (link || '').replace(/"/g, '&quot;');
        return `
          <div class="img-wrapper" id="wrap-${index}">
             <div class="error-icon" style="display:none"></div>
             <img 
                data-src="${safeLink}" 
                id="${index}"
             />
          </div>
        `;
      })
      .join('\n');

    const linkStr = props.route.params.link || '';
    const isVoratoon =
      linkStr.includes('voratoon') || comicImages.some(u => (u || '').includes('voratoon'));
    const needsReferrer =
      linkStr.includes('komiku') || linkStr.includes('komikcast') || isVoratoon;
    const referrerMeta = needsReferrer
      ? '<meta name="referrer" content="origin" />'
      : '<meta name="referrer" content="no-referrer" />';

    const html = `<head><meta name="viewport" content="width=device-width, initial-scale=1.0" />${referrerMeta}${styles}</head><body>${body}</body>`;
    return {
      html,
      baseUrl: linkStr.startsWith('komikcast://')
        ? 'https://komikcast.cc/'
        : isVoratoon
          ? `${getVoratoonBase()}/`
          : linkStr,
    };
  }, [comicImages, props.route.params.link, styles]);

  const injectedJS = useMemo(() => {
    return `
      function sendToRN(data) {
          window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }

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

      const fetchOptions = {
        root: null,
        rootMargin: '150% 0px 150% 0px',
        threshold: 0.01
      };

      function markImageError(img) {
        const wrapper = document.getElementById('wrap-' + img.id);
        if (!wrapper) return;
        wrapper.classList.add('is-error');
        const icon = wrapper.querySelector('.error-icon');
        if (icon) icon.style.display = 'block';
      }

      window.__onRNImageFetched = function(id, dataUri) {
        const img = document.getElementById(String(id));
        if (!img) return;
        img.src = dataUri;
      };

      window.__onRNImageError = function(id) {
        const img = document.getElementById(String(id));
        if (!img) return;
        const rawSrc = img.dataset.src || '';
        if (
          rawSrc &&
          rawSrc.startsWith('http') &&
          !rawSrc.includes('wsrv.nl') &&
          !rawSrc.includes('voratoon') &&
          !img.dataset.proxyFallback
        ) {
          img.dataset.proxyFallback = '1';
          img.src = 'https://wsrv.nl/?url=' + encodeURIComponent(rawSrc);
          return;
        }
        markImageError(img);
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
               const rawSrc = img.dataset.src || '';
               const attempt = Number(img.dataset.attempt || '0');
               if (rawSrc && !rawSrc.includes('voratoon') && attempt < 1) {
                 img.dataset.attempt = String(attempt + 1);
                 const sep = rawSrc.includes('?') ? '&' : '?';
                 setTimeout(() => {
                   img.src = rawSrc + sep + 'retry=' + Date.now();
                 }, 250);
                 return;
               }
               if (rawSrc && rawSrc.startsWith('http') && !img.dataset.rnFetchAttempted) {
                 img.dataset.rnFetchAttempted = '1';
                 sendToRN({ type: 'FETCH_IMAGE', id: img.id, url: rawSrc });
                 return;
               }
               if (
                 rawSrc &&
                 rawSrc.startsWith('http') &&
                 !rawSrc.includes('wsrv.nl') &&
                 !rawSrc.includes('voratoon') &&
                 !img.dataset.proxyFallback
               ) {
                 img.dataset.proxyFallback = '1';
                 img.src = 'https://wsrv.nl/?url=' + encodeURIComponent(rawSrc);
                 return;
               }
               markImageError(img);
             };
             img.src = img.dataset.src;
             window.fetchObserver.unobserve(img);
          }
        });
      }, fetchOptions);

      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartTime = 0;
      let isDragging = false;

      document.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          touchStartTime = Date.now();
          isDragging = false;
        } else {
          isDragging = true;
        }
      }, { passive: true });

      document.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches.length === 1) {
          const dx = Math.abs(e.touches[0].clientX - touchStartX);
          const dy = Math.abs(e.touches[0].clientY - touchStartY);
          if (dx > 12 || dy > 12) {
            isDragging = true;
          }
        }
      }, { passive: true });

      document.addEventListener('touchend', (e) => {
        const duration = Date.now() - touchStartTime;
        // Ignore drags, scrolls, long presses, or micro-glitches
        if (isDragging || duration > 280 || duration < 50) {
          return;
        }

        const target = e.target;
        const wrapper = target && target.closest ? target.closest('.img-wrapper.is-error') : null;
        if (wrapper) {
          const img = wrapper.querySelector('img');
          if (img) {
            wrapper.classList.remove('is-error');
            const icon = wrapper.querySelector('.error-icon');
            if (icon) icon.style.display = 'none';
            const rawSrc = img.dataset.src || '';
            img.dataset.attempt = '0';
            img.dataset.rnFetchAttempted = '';
            img.dataset.proxyFallback = '';
            const sep = rawSrc.includes('?') ? '&' : '?';
            img.src = rawSrc + sep + 'retry=' + Date.now();
          }
          return;
        }

        // Only toggle if tap is within the central reading zone (between 25% and 75% height)
        // to prevent accidental toggle when scrolling near top or bottom
        const clientY = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : touchStartY;
        const screenH = window.innerHeight;
        if (clientY >= screenH * 0.25 && clientY <= screenH * 0.75) {
          sendToRN({ type: 'TOGGLE_FULLSCREEN' });
        }
      }, { passive: true });

      const allImages = document.querySelectorAll('img');
      allImages.forEach(img => {
        historyObserver.observe(img);
        window.fetchObserver.observe(img);
      });
    `;
  }, [props.route.params.historyData]);


  return (
    <View style={{ flex: 1 }}>
      <Portal>
        <Snackbar
          duration={Infinity}
          onDismiss={() => setIsSnackBarOpen(false)}
          visible={isSnackBarOpen}
          action={{
            label: t('common.cancel'),
            onPress: () => {
              abortController.current?.abort();
              abortController.current = new AbortController();
              comicsDownloadLoading.current = false;
              setIsSnackBarOpen(false);
            },
          }}>
          {snackBarText}
        </Snackbar>
      </Portal>

      {comicImages.length === 0 ? (
        <View
          style={{
            flex: 1,
            backgroundColor: bgColor,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 24,
          }}>
          <Text
            style={{
              color: theme.colors.onBackground,
              fontSize: 15,
              fontWeight: '600',
              textAlign: 'center',
              marginBottom: 12,
            }}>
            {t('reader.imagesLoadError')}
          </Text>
          <Button
            mode="contained"
            icon="refresh"
            onPress={() => moveChapter(props.route.params.link)}>
            {t('reader.tryReload')}
          </Button>
        </View>
      ) : (
        /* @ts-ignore */
        <WebView
          ref={webViewRef}
          style={{ flex: 1, backgroundColor: bgColor }}
          overScrollMode="never"
          originWhitelist={['*']}
          source={htmlSource}
          injectedJavaScript={injectedJS}
          onMessage={handleMessage}
          showsVerticalScrollIndicator={false}
          androidLayerType="hardware"
          userAgent="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        />
      )}

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: theme.colors.elevation.level2,
          paddingVertical: 12,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          justifyContent: 'space-around',
          display: isFullscreen ? 'none' : 'flex',
        }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}>
            <Button
              mode={isAutoScrolling ? 'contained-tonal' : 'text'}
              icon={isAutoScrolling ? 'pause' : 'play'}
              onPress={toggleAutoScroll}
              compact>
              {isAutoScrolling ? t('reader.stop') : t('reader.autoScroll')}
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
                {t('reader.prev')}
              </Button>
            )}
            {data.nextChapter && (
              <Button
                icon="arrow-right"
                onPress={() => {
                  moveChapter(data.nextChapter!);
                }}
                contentStyle={{ flexDirection: 'row-reverse' }}>
                {t('reader.next')}
              </Button>
            )}
          </View>
        </View>

        <ProgressBar
          style={{
            height: 4,
            backgroundColor: theme.colors.surfaceVariant,
          }}
          color={theme.colors.primary}
          progress={currentlyVisibleImageId / Math.max(1, comicImages.length - 1)}
        />
    </View>
  );
}
