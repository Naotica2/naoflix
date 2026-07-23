import Icon from '@react-native-vector-icons/fontawesome';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import moment from 'moment';
import { useMemo } from 'react';
import { StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import useGlobalStyles from '../../assets/style';
import { NewAnimeList } from '../../types/anime';
import { HomeNavigator, RootStackNavigator } from '../../types/navigation';
import { LatestComicsRelease } from '../../utils/scrapers/comicsv2';
import { LatestNovel } from '../../utils/scrapers/meionovel';
import { MIN_IMAGE_HEIGHT, MIN_IMAGE_WIDTH } from '../Home/AnimePage';
import ImageLoading from './ImageLoading';
import { TouchableOpacity } from './TouchableOpacityRNGH';
import DarkOverlay from './DarkOverlay';

export function ListAnimeComponent(
  props: (
    | {
        newAnimeData: NewAnimeList;
        type?: 'anime';
      }

    | { newAnimeData: LatestComicsRelease | any; type: 'comics' }
    | { newAnimeData: LatestNovel; type: 'novel' }
  ) & {
    navigationProp:
      | NativeStackNavigationProp<HomeNavigator, 'HomePage', undefined>
      | NativeStackNavigationProp<RootStackNavigator, 'SeeMore', undefined>
      | BottomTabNavigationProp<HomeNavigator, 'HomePage', undefined>
      | BottomTabNavigationProp<RootStackNavigator, 'SeeMore', undefined>;
  } & { gap?: boolean; isGrid?: boolean; fromSeeMore?: boolean },
) {
  const styles = useStyles();
  const z = props.newAnimeData;
  const navigation = props.navigationProp;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const episodeOrChapter = useMemo(() => {
    if (props.type === 'comics') {
      return 'Ch. ' + props.newAnimeData.latestChapter;
    } else if (props.type === 'novel') {
      return props.newAnimeData.latestChapter || 'Novel';
    } else {
      return props.newAnimeData.episode;
    }
  }, [props.newAnimeData, props.type]);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        props.gap ? { marginRight: 10 } : {},
        props.isGrid ? { width: '100%', flex: 1, margin: 6 } : {},
      ]}
      onPress={() => {
        navigation.dispatch(
          StackActions.push('FromUrl', {
            title: props.newAnimeData.title,
            link:
              props.type === 'comics'
                ? props.newAnimeData.detailUrl
                : props.type === 'novel'
                  ? props.newAnimeData.detailUrl
                  : props.newAnimeData.streamingLink,
            type: props.type,
            thumbnailUrl: props.newAnimeData.thumbnailUrl,
            synopsis: props.newAnimeData.synopsis || props.newAnimeData.shortDescription,
          }),
        );
      }}>
      <ImageLoading
        resizeMode="cover"
        key={z.thumbnailUrl}
        source={{ uri: z.thumbnailUrl }}
        fallbackSearchTitle={z.title}
        style={[styles.poster, props.isGrid ? { width: '100%', height: undefined, aspectRatio: 1 / 1.5 } : {}]}>
        {/* Bottom gradient overlay */}
        <View style={styles.gradientOverlay} />
        {/* Episode/Chapter badge */}
        <View style={styles.badgeContainer}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{episodeOrChapter}</Text>
          </View>
          {'rating' in z && z.rating && (
            <View style={[styles.badge, styles.ratingBadge]}>
              <Icon name="star" size={9} color="#FFD700" />
              <Text style={[styles.badgeText, { marginLeft: 3 }]}>{z.rating}</Text>
            </View>
          )}
        </View>
      </ImageLoading>
      <View style={styles.titleContainer}>
        <Text numberOfLines={2} style={styles.title}>
          {z.title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function useStyles() {
  const dimensions = useWindowDimensions();
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const CARD_WIDTH = Math.max((dimensions.width - 48) / 3, MIN_IMAGE_WIDTH);
  const POSTER_HEIGHT = CARD_WIDTH * 1.5;
  return useMemo(
    () =>
      StyleSheet.create({
        card: {
          width: CARD_WIDTH,
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: isDark ? '#1a1a1a' : '#fff',
        },
        poster: {
          width: CARD_WIDTH,
          height: POSTER_HEIGHT,
          borderRadius: 8,
          overflow: 'hidden',
        },
        gradientOverlay: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40%',
          backgroundColor: 'transparent',
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
        },
        ratingBadge: {
          backgroundColor: 'rgba(0,0,0,0.75)',
          flexDirection: 'row',
          alignItems: 'center',
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
          color: isDark ? '#e0e0e0' : '#222',
          fontWeight: '600',
          lineHeight: 16,
        },
      }),
    [isDark, CARD_WIDTH, POSTER_HEIGHT, globalStyles.text.color],
  );
}
