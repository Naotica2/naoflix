import Icon from '@react-native-vector-icons/fontawesome';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { memo, useCallback, useMemo } from 'react';
import { Appearance, Dimensions, StyleSheet, Text, View } from 'react-native';
import { NewAnimeList } from '../../types/anime';
import { HomeNavigator, RootStackNavigator } from '../../types/navigation';
import { LatestComicsRelease } from '../../utils/scrapers/comicsv2';
import { LatestNovel } from '../../utils/scrapers/meionovel';
import { MIN_IMAGE_WIDTH } from '../Home/AnimePage';
import ImageLoading from './ImageLoading';
import { TouchableOpacity } from './TouchableOpacityRNGH';

type CardProps = (
  | {
      newAnimeData: NewAnimeList;
      type?: 'anime' | 'donghua';
    }
  | { newAnimeData: LatestComicsRelease | any; type: 'comics' }
  | { newAnimeData: LatestNovel; type: 'novel' }
) & {
  navigationProp:
    | NativeStackNavigationProp<HomeNavigator, 'HomePage', undefined>
    | NativeStackNavigationProp<RootStackNavigator, 'SeeMore', undefined>
    | BottomTabNavigationProp<HomeNavigator, 'HomePage', undefined>
    | BottomTabNavigationProp<RootStackNavigator, 'SeeMore', undefined>;
} & {
  gap?: boolean;
  isGrid?: boolean;
  fromSeeMore?: boolean;
  isDark?: boolean;
  cardWidth?: number;
};

function ListAnimeComponentInner(props: CardProps) {
  const z = props.newAnimeData;
  const navigation = props.navigationProp;
  const isDark = props.isDark ?? Appearance.getColorScheme() === 'dark';

  const cardWidth = useMemo(
    () =>
      props.cardWidth ?? Math.max((Dimensions.get('window').width - 48) / 3, MIN_IMAGE_WIDTH),
    [props.cardWidth],
  );
  const posterHeight = useMemo(() => Math.round(cardWidth * 1.5), [cardWidth]);

  const episodeOrChapter = useMemo(() => {
    if (props.type === 'comics') {
      if (!z.latestChapter || z.latestChapter === '?') return '';
      return /^ch/i.test(String(z.latestChapter).trim())
        ? String(z.latestChapter).trim()
        : 'Ch. ' + z.latestChapter;
    }
    if (props.type === 'novel') {
      return z.latestChapter || 'Novel';
    }
    return z.episode;
  }, [z.latestChapter, z.episode, props.type]);

  const handlePress = useCallback(() => {
    navigation.dispatch(
      StackActions.push('FromUrl', {
        title: z.title,
        link:
          props.type === 'comics'
            ? z.detailUrl
            : props.type === 'novel'
              ? z.detailUrl
              : (z as any).detailUrl || z.streamingLink || (z as any).link,
        type: props.type === 'donghua' ? 'anime' : props.type,
        thumbnailUrl: z.thumbnailUrl,
        synopsis: z.synopsis || z.shortDescription,
        forceDetail: props.type === 'anime' || props.type === 'donghua',
      }),
    );
  }, [navigation, props.type, z]);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          width: props.isGrid ? undefined : cardWidth,
          backgroundColor: isDark ? '#1a1a1a' : '#fff',
        },
        props.gap ? styles.cardGap : null,
        props.isGrid ? styles.cardGrid : null,
      ]}
      onPress={handlePress}>
      <ImageLoading
        resizeMode="cover"
        source={{ uri: z.thumbnailUrl }}
        fallbackSearchTitle={z.title}
        style={
          props.isGrid
            ? [styles.poster, styles.posterGrid]
            : [styles.poster, { width: cardWidth, height: posterHeight }]
        }>
        <View style={styles.badgeContainer}>
          {episodeOrChapter ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText} numberOfLines={1}>
                {episodeOrChapter}
              </Text>
            </View>
          ) : (
            <View />
          )}
          {'rating' in z && z.rating ? (
            <View style={[styles.badge, styles.ratingBadge]}>
              <Icon name="star" size={9} color="#FFD700" />
              <Text style={[styles.badgeText, styles.ratingText]}>{z.rating}</Text>
            </View>
          ) : null}
        </View>
      </ImageLoading>
      <View style={styles.titleContainer}>
        <Text numberOfLines={2} style={[styles.title, { color: isDark ? '#e0e0e0' : '#222' }]}>
          {z.title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export const ListAnimeComponent = memo(ListAnimeComponentInner);

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardGap: {
    marginRight: 10,
  },
  cardGrid: {
    flex: 1,
    margin: 4,
  },
  poster: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  posterGrid: {
    width: '100%',
    aspectRatio: 1 / 1.5,
  },
  badgeContainer: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  badge: {
    backgroundColor: 'rgba(59, 130, 246, 0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: '72%',
  },
  ratingBadge: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    marginLeft: 3,
  },
  badgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
  },
  titleContainer: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
});
