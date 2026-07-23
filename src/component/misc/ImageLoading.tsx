import Icon from '@react-native-vector-icons/fontawesome';
import { useIsFocused } from '@react-navigation/native';
import React, { memo, useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Image, ImageProps, ImageSourcePropType, StyleSheet, View } from 'react-native';
import URL from 'url';
import { generateUrlWithLatestDomain } from '../../utils/domainChanger';
import { BASE } from '../../utils/scrapers/animeSeries';
import LoadingIndicator from '../misc/LoadingIndicator';

const ImageLoading = (
  props: ImageProps & { children?: React.ReactNode; displayLoading?: boolean; fallbackSearchTitle?: string },
) => {
  const { source, style, children, displayLoading = true, fallbackSearchTitle, ...restProps } = props;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const onLoadStart = useCallback(() => setLoading(true), []);
  const onLoadEnd = useCallback(() => setLoading(false), []);
  const onError = useCallback(() => {
    setError(true);
    setLoading(false);
  }, []);

  const [overrideUri, setOverrideUri] = useState<string | undefined>();

  useLayoutEffect(() => {
    setLoading(false);
    setError(false);
    setOverrideUri(undefined);
  }, [source]);

  const isFocused = useIsFocused();

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
      if (typeof source === 'object' && !Array.isArray(source)) {
        try {
          // fix invalid url crash
          baseSourceObj.uri = generateUrlWithLatestDomain(baseSourceObj.uri);
        } catch {}
      }
    }

    let computedHeaders: Record<string, string> = { ...baseSourceObj.headers };

    // Inject Referer to bypass hotlink protection
    if (baseSourceObj.uri && typeof baseSourceObj.uri === 'string' && !computedHeaders['Referer']) {
      const uri = baseSourceObj.uri.toLowerCase();
      // 1. Specific CDNs that require a specific site's Referer
      if (uri.includes('.hdslb.com') || uri.includes('bilibili')) {
        computedHeaders['Referer'] = 'https://www.bilibili.tv/';
      } else if (uri.includes('komiku')) {
        computedHeaders['Referer'] = 'https://komiku.id/';
      } else if (uri.includes('komikcast')) {
        computedHeaders['Referer'] = 'https://komikcast.ch/';
      } else if (uri.includes('movie-box') || uri.includes('tmdb')) {
        computedHeaders['Referer'] = 'https://movie-box.co/';
      } else if (uri.includes('otakudesu') || uri.includes('oploverz') || uri.includes('desudrive') || uri.includes('hares') || uri.includes('hare.my.id') || uri.includes('odpass')) {
        computedHeaders['Referer'] = BASE.url + '/';
      } else if (uri.includes('myanimelist.net')) {
        computedHeaders['Referer'] = 'https://myanimelist.net/';
        computedHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      }
    }

    if (Object.keys(computedHeaders).length > 0) {
      baseSourceObj.headers = computedHeaders;
    } else {
      delete baseSourceObj.headers;
    }

    return baseSourceObj as ImageSourcePropType;
  }, [source]);

  React.useEffect(() => {
    const src = Array.isArray(resolvedSource) ? resolvedSource[0] : resolvedSource;
    if (src && typeof src === 'object' && 'uri' in src && typeof src.uri === 'string' && fallbackSearchTitle) {
      const lowerUri = src.uri.toLowerCase();
      if (lowerUri.includes('otaku-desu') || lowerUri.includes('hare') || lowerUri.includes('desudrive') || lowerUri.includes('odpass') || lowerUri.includes('myanimelist.net')) {
        const fetchAnilist = async () => {
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
              body: JSON.stringify({ query, variables: { search: fallbackSearchTitle } })
            });
            const json = await res.json();
            if (json?.data?.Media?.coverImage?.large) {
              setOverrideUri(json.data.Media.coverImage.large);
            }
          } catch (e) {}
        };
        fetchAnilist();
      }
    }
  }, [resolvedSource, fallbackSearchTitle]);

  const finalSource = useMemo(() => {
    if (overrideUri && resolvedSource && typeof resolvedSource === 'object') {
      return { ...resolvedSource, uri: overrideUri };
    }
    return resolvedSource;
  }, [overrideUri, resolvedSource]);

  return (
    <View style={[style, styles.imageBackground]}>
      {isFocused && (
        <Image
          fadeDuration={200}
          {...restProps}
          source={finalSource}
          style={[StyleSheet.absoluteFill]}
          onLoadStart={onLoadStart}
          onLoadEnd={onLoadEnd}
          onError={onError}
        />
      )}
      {children}
      {isFocused && (
        <View style={styles.overlay}>
          {loading && displayLoading && <LoadingIndicator size={15} />}
          {error && <Icon name="exclamation-circle" color="red" size={18} />}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  imageBackground: {
    overflow: 'hidden',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
});

export default memo(ImageLoading);
