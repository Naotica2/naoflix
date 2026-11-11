import Icon from '@react-native-vector-icons/fontawesome';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ImageProps, ImageSourcePropType, StyleSheet, UIManager, View } from 'react-native';
import { DatabaseManager } from '../../utils/DatabaseManager';
import { generateUrlWithLatestDomain } from '../../utils/domainChanger';
import { BASE } from '../../utils/scrapers/animeSeries';
import { BASE as getVoratoonBase } from '../../utils/scrapers/voratoon';

const hasExpoImageView = (() => {
  try {
    return Boolean(UIManager.getViewManagerConfig('ExpoImage'));
  } catch {
    return false;
  }
})();

const ExpoImageComponent: React.ComponentType<any> | null = (() => {
  if (!hasExpoImageView) return null;
  try {
    return require('expo-image').Image as React.ComponentType<any>;
  } catch {
    return null;
  }
})();

const anilistPosterCache = new Map<string, string>();
const anilistDbMissCache = new Set<string>();
const anilistMissCache = new Set<string>();
const anilistInFlight = new Map<string, Promise<string | null>>();

const MAX_CONCURRENT_ANILIST = 2;
let activeAnilistRequests = 0;
const anilistQueue: Array<() => void> = [];

function scheduleAnilistTask<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeAnilistRequests += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeAnilistRequests = Math.max(0, activeAnilistRequests - 1);
          const next = anilistQueue.shift();
          if (next) next();
        });
    };
    if (activeAnilistRequests < MAX_CONCURRENT_ANILIST) {
      run();
    } else {
      anilistQueue.push(run);
    }
  });
}

function cleanTitleForAnilist(raw: string): string {
  return raw
    .replace(/Subtitle Indonesia|Sub Indo/gi, '')
    .replace(/\s*[-:]?\s*Episode\s*\d+.*/gi, '')
    .trim();
}

function lookupCachedPoster(cleanTitle: string): string | undefined {
  if (!cleanTitle) return undefined;
  if (anilistPosterCache.has(cleanTitle)) {
    return anilistPosterCache.get(cleanTitle);
  }
  if (anilistDbMissCache.has(cleanTitle)) {
    return undefined;
  }
  try {
    const stored = DatabaseManager.getSync(`anilist_poster_${cleanTitle}` as any);
    if (stored) {
      anilistPosterCache.set(cleanTitle, stored);
      return stored;
    }
    anilistDbMissCache.add(cleanTitle);
  } catch {}
  return undefined;
}

function fetchAnilistCover(cleanTitle: string): Promise<string | null> {
  const existing = anilistInFlight.get(cleanTitle);
  if (existing) return existing;

  const promise = scheduleAnilistTask(async () => {
    try {
      const query = `
        query ($search: String) {
          Media (search: $search, type: ANIME) {
            coverImage {
              large
            }
          }
        }
      `;
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { search: cleanTitle } }),
      });
      if (!res.ok) {
        return null;
      }
      const json = await res.json();
      const cover = json?.data?.Media?.coverImage?.large;
      if (cover && typeof cover === 'string') {
        anilistDbMissCache.delete(cleanTitle);
        anilistPosterCache.set(cleanTitle, cover);
        DatabaseManager.setSilent(`anilist_poster_${cleanTitle}`, cover).catch(() => {});
        return cover;
      }
      anilistMissCache.add(cleanTitle);
      return null;
    } catch {
      return null;
    } finally {
      anilistInFlight.delete(cleanTitle);
    }
  });

  anilistInFlight.set(cleanTitle, promise);
  return promise;
}

const ImageLoading = (
  props: ImageProps & { children?: React.ReactNode; displayLoading?: boolean; fallbackSearchTitle?: string },
) => {
  const { source, style, children, displayLoading = true, fallbackSearchTitle, ...restProps } = props;
  const {
    resizeMode,
    fadeDuration,
    onError: propOnError,
    ...expoSafeProps
  } = restProps as any;

  const sourceKey = useMemo(() => {
    if (!source) return '';
    if (typeof source === 'number') return String(source);
    if (typeof source === 'string') return source;
    if (Array.isArray(source)) return (source[0] as any)?.uri || '';
    return (source as any)?.uri || '';
  }, [source]);

  const cleanFallbackTitle = useMemo(() => {
    return fallbackSearchTitle ? cleanTitleForAnilist(fallbackSearchTitle) : '';
  }, [fallbackSearchTitle]);

  const [fetchedOverride, setFetchedOverride] = useState<{ title: string; uri: string } | null>(
    null,
  );
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const cachedOverride = useMemo(
    () => lookupCachedPoster(cleanFallbackTitle),
    [cleanFallbackTitle],
  );
  const effectiveOverrideUri =
    cachedOverride ||
    (fetchedOverride && fetchedOverride.title === cleanFallbackTitle
      ? fetchedOverride.uri
      : undefined);

  const errorIdentity = `${effectiveOverrideUri || sourceKey}|${cleanFallbackTitle}`;
  const error = failedKey === errorIdentity;

  const onError = useCallback(
    (e: any) => {
      setFailedKey(errorIdentity);
      propOnError?.(e);
    },
    [errorIdentity, propOnError],
  );

  const resolvedSource = useMemo<ImageSourcePropType | undefined>(() => {
    if (!source) return source;
    if (typeof source === 'number') return source;

    const activeSource = Array.isArray(source) ? source[0] : source;
    let baseSourceObj: any = {};

    if (typeof activeSource === 'string') {
      baseSourceObj = { uri: activeSource };
    } else if (typeof activeSource === 'object' && activeSource !== null) {
      baseSourceObj = { ...activeSource };
    } else {
      return source as ImageSourcePropType;
    }

    if (typeof baseSourceObj.uri === 'string') {
      if (!baseSourceObj.uri.trim()) {
        return undefined;
      }
      if (typeof source === 'object' && !Array.isArray(source)) {
        try {
          baseSourceObj.uri = generateUrlWithLatestDomain(baseSourceObj.uri);
        } catch {}
      }
    }

    const computedHeaders: Record<string, string> = { ...baseSourceObj.headers };

    if (baseSourceObj.uri && typeof baseSourceObj.uri === 'string' && !computedHeaders['Referer']) {
      const uri = baseSourceObj.uri.toLowerCase();
      if (uri.includes('.hdslb.com') || uri.includes('bilibili')) {
        computedHeaders['Referer'] = 'https://www.bilibili.tv/';
      } else if (uri.includes('komiku')) {
        computedHeaders['Referer'] = 'https://komiku.id/';
      } else if (uri.includes('komikindo')) {
        computedHeaders['Referer'] = 'https://komikindo.ch/';
      } else if (uri.includes('cdn-nyaa') || uri.includes('luvyaa')) {
        computedHeaders['Referer'] = 'https://v5.luvyaa.co/';
      } else if (uri.includes('voratoon')) {
        computedHeaders['Referer'] = getVoratoonBase() + '/';
      } else if (uri.includes('movie-box') || uri.includes('tmdb')) {
        computedHeaders['Referer'] = 'https://movie-box.co/';
      } else if (uri.includes('nimegami')) {
        computedHeaders['Referer'] = 'https://nimegami.id/';
      } else if (
        uri.includes('otakudesu') ||
        uri.includes('oploverz') ||
        uri.includes('desudrive') ||
        uri.includes('hares') ||
        uri.includes('hare.my.id') ||
        uri.includes('odpass')
      ) {
        computedHeaders['Referer'] = BASE.url + '/';
      } else if (uri.includes('myanimelist.net')) {
        computedHeaders['Referer'] = 'https://myanimelist.net/';
        computedHeaders['User-Agent'] =
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      }
    }

    if (Object.keys(computedHeaders).length > 0) {
      baseSourceObj.headers = computedHeaders;
    } else {
      delete baseSourceObj.headers;
    }

    return baseSourceObj as ImageSourcePropType;
  }, [source]);

  useEffect(() => {
    if (!cleanFallbackTitle || effectiveOverrideUri) return;

    const cached = anilistPosterCache.get(cleanFallbackTitle);
    if (cached) {
      setFetchedOverride(prev =>
        prev && prev.title === cleanFallbackTitle && prev.uri === cached
          ? prev
          : { title: cleanFallbackTitle, uri: cached },
      );
      return;
    }

    if (anilistMissCache.has(cleanFallbackTitle)) return;

    const src = Array.isArray(resolvedSource) ? resolvedSource[0] : resolvedSource;
    const uriStr =
      src && typeof src === 'object' && 'uri' in src && typeof src.uri === 'string' ? src.uri : '';
    const lowerUri = uriStr.toLowerCase().trim();

    const needsAnilist =
      !lowerUri ||
      error ||
      lowerUri.includes('otaku-desu') ||
      lowerUri.includes('hare') ||
      lowerUri.includes('desudrive') ||
      lowerUri.includes('odpass') ||
      lowerUri.includes('myanimelist.net');

    if (!needsAnilist) return;

    let isMounted = true;
    fetchAnilistCover(cleanFallbackTitle).then(cover => {
      if (cover && isMounted) {
        setFetchedOverride({ title: cleanFallbackTitle, uri: cover });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [cleanFallbackTitle, effectiveOverrideUri, resolvedSource, error]);

  const finalSource = useMemo(() => {
    if (effectiveOverrideUri) {
      return { uri: effectiveOverrideUri };
    }
    return resolvedSource;
  }, [effectiveOverrideUri, resolvedSource]);

  const finalUri =
    finalSource && typeof finalSource === 'object' && !Array.isArray(finalSource) && 'uri' in finalSource
      ? (finalSource as { uri?: string }).uri
      : undefined;

  const contentFit =
    resizeMode === 'contain'
      ? 'contain'
      : resizeMode === 'stretch'
        ? 'fill'
        : resizeMode === 'center'
          ? 'none'
          : 'cover';

  return (
    <View
      style={[
        displayLoading ? styles.loadingSurface : null,
        style,
        styles.imageBackground,
      ]}>
      {finalSource ? (
        ExpoImageComponent && finalUri && resizeMode !== 'repeat' ? (
          <ExpoImageComponent
            {...expoSafeProps}
            source={finalSource}
            contentFit={contentFit}
            cachePolicy="memory-disk"
            recyclingKey={finalUri}
            transition={100}
            style={StyleSheet.absoluteFill}
            onError={onError}
          />
        ) : (
          <Image
            fadeDuration={fadeDuration ?? 120}
            {...restProps}
            source={finalSource}
            style={StyleSheet.absoluteFill}
            onError={onError}
          />
        )
      ) : null}
      {children}
      {error && !cleanFallbackTitle && !effectiveOverrideUri ? (
        <View style={styles.overlay} pointerEvents="none">
          <Icon name="exclamation-circle" color="red" size={18} />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  imageBackground: {
    overflow: 'hidden',
  },
  loadingSurface: {
    backgroundColor: 'rgba(128, 128, 128, 0.12)',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default memo(ImageLoading);
