import { DrawerScreenProps } from '@react-navigation/drawer';
import { StackActions } from '@react-navigation/native';
import { FlashList, FlashListRef, ListRenderItem } from '@shopify/flash-list';
import moment from 'moment';
import { memo, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { useTheme } from 'react-native-paper';
import Icon from '@react-native-vector-icons/material-design-icons';
import URL from 'url';
import useGlobalStyles from '../../../assets/style';
import { SayaDrawerNavigator } from '../../../types/navigation';
import watchLaterJSON from '../../../types/watchLaterJSON';
import { useModifiedKeyValueIfFocused } from '../../../utils/DatabaseManager';
import DialogManager from '../../../utils/dialogManager';
import controlWatchLater from '../../../utils/watchLaterControl';
import ImageLoading from '../../misc/ImageLoading';

type Props = DrawerScreenProps<SayaDrawerNavigator, 'WatchLater'>;

function WatchLater(props: Props) {
  const styles = useStyles();
  const globalStyles = useGlobalStyles();

  const watchLaterLists = useModifiedKeyValueIfFocused<watchLaterJSON[]>(
    'watchLater',
    result => JSON.parse(result) as watchLaterJSON[],
    [] as watchLaterJSON[],
  );

  const flashlistRef = useRef<FlashListRef<watchLaterJSON>>(null);

  const renderItem = useCallback<ListRenderItem<watchLaterJSON>>(
    ({ item, index }) => {
      return (
        <TouchableOpacity
          // entering={FadeInRight}
          // exiting={FadeOutLeft}
          // layout={LinearTransition}
          style={styles.listContainer}
          onPress={() => {
            if (item.link?.startsWith('film://')) {
              const filmRaw = item.link.replace('film://', '');
              const [filmPath] = filmRaw.split('?');
              const parts = filmPath.split('/');
              const subjectId = parts[0];
              const detailPath = parts.slice(1).join('/');
              props.navigation.dispatch(
                StackActions.push('FilmDetail', {
                  data: {
                    subjectId,
                    detailPath,
                    title: item.title,
                    cover: { url: item.thumbnailUrl },
                    imdbRatingValue: item.rating || '',
                    releaseDate: item.releaseYear || '',
                    genre: item.genre?.join(', ') || '',
                    subjectType: item.isMovie ? 1 : 2,
                    subtitles: '',
                    dubs: [],
                    hasResource: true,
                    description: '',
                    countryName: '',
                  },
                }),
              );
              return;
            }
            props.navigation.dispatch(
              StackActions.push('FromUrl', {
                title: item.title,
                link: item.link,
                thumbnailUrl: item.thumbnailUrl,
                type: item.isMovie
                    ? 'movie'
                    : item.isComics
                      ? 'comics'
                      : 'anime',
              }),
            );
          }}>
          <ImageLoading source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
          <View style={styles.ratingContainer}>
            <Text
              style={[
                globalStyles.text,
                styles.listRatingText,
                item.rating === 'Film'
                  ? { backgroundColor: '#ff5252' }
                  : item.isComics
                    ? { backgroundColor: '#3e8bff' }
                    : undefined,
              ]}>
              <Icon name={item.rating === 'Film' ? 'movie' : item.isComics ? 'book' : 'star'} />{' '}
              {item.rating}
            </Text>
          </View>
          <View style={styles.listInfoContainer}>
            <Text style={[globalStyles.text, styles.listDateText]}>
              {moment(item.date).format('dddd DD-MM-YYYY [Pukul] HH:mm')}
            </Text>

            <View style={styles.titleContainer}>
              <Text style={[globalStyles.text]}>{item.title}</Text>
            </View>

            <View style={styles.listBottom}>
              <View style={styles.listGenreContainer}>
                <Text style={styles.listGenreText} numberOfLines={1}>
                  {item.genre.toString()}
                </Text>
              </View>
              <TouchableOpacity
                hitSlop={4}
                onPress={() => {
                  DialogManager.alert(
                    'Hapus daftar tonton nanti',
                    `Apakah kamu yakin ingin menghapus "${item.title}" dari daftar tonton nanti?`,
                    [
                      {
                        text: 'Batal',
                        onPress: () => {},
                      },
                      {
                        text: 'Hapus',
                        onPress: () => {
                          controlWatchLater('delete', index);
                        },
                      },
                    ],
                  );
                }}
                style={styles.listDeleteContainer}>
                <Icon name="delete-forever" size={20} style={styles.listDeleteIcon} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [
      globalStyles.text,
      props.navigation,
      styles.listBottom,
      styles.listContainer,
      styles.listDateText,
      styles.listDeleteContainer,
      styles.listDeleteIcon,
      styles.listGenreContainer,
      styles.listGenreText,
      styles.listInfoContainer,
      styles.listRatingText,
      styles.ratingContainer,
      styles.thumbnail,
      styles.titleContainer,
    ],
  );

  return (
    <View style={{ flex: 1 }}>
      {watchLaterLists.length === 0 ? (
        <View style={styles.emptyList}>
          <Text style={[globalStyles.text]}>Belum ada daftar tonton nanti</Text>
        </View>
      ) : (
        <FlashList
          drawDistance={250}
          ref={flashlistRef}
          data={watchLaterLists}
          extraData={styles}
          estimatedItemSize={170}
          renderItem={renderItem}
          keyExtractor={extractKey}
          ListHeaderComponent={() => (
            <View>
              <Text style={[globalStyles.text, { margin: 10 }]}>
                Jumlah daftar tonton nanti kamu:{' '}
                <Text style={{ fontWeight: 'bold' }}>{watchLaterLists.length}</Text>
                {'\n'}
                <Text
                  style={[
                    globalStyles.text,
                    { margin: 10, fontWeight: 'bold', fontSize: 12, color: 'gray' },
                  ]}>
                  Sejak {moment(watchLaterLists.at(-1)!.date).format('DD MMMM YYYY')}
                </Text>
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const extractKey = (item: watchLaterJSON) => item.date.toString();

function useStyles() {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  return useMemo(
    () =>
      StyleSheet.create({
        listContainer: {
          flexDirection: 'row',
          marginVertical: 4,
          marginHorizontal: 12,
          backgroundColor: isDark ? '#1a1a1a' : '#fff',
          borderWidth: 1,
          borderColor: isDark ? '#2a2a2a' : '#e0e0e0',
          borderRadius: 12,
          elevation: 0,
          height: 160,
          overflow: 'hidden',
        },
        listInfoContainer: {
          flex: 1,
          flexDirection: 'column',
          padding: 8,
        },
        thumbnail: {
          height: 160,
          width: 80,
          borderTopLeftRadius: 12,
          borderBottomLeftRadius: 12,
          marginRight: 7,
        },
        ratingContainer: {
          position: 'absolute',
          left: 4,
          top: 4,
        },
        listRatingText: {
          backgroundColor: '#F47521',
          color: '#fff',
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 8,
          fontWeight: '700',
          fontSize: 11,
        },
        titleContainer: {
          justifyContent: 'center',
          flex: 1,
        },
        listGenreText: {
          color: '#F47521',
          fontWeight: '600',
          fontSize: 12,
        },
        emptyList: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        },
        listBottom: {
          flexDirection: 'row',
          alignItems: 'center',
        },
        listGenreContainer: {
          justifyContent: 'flex-start',
          flex: 1,
        },
        listDateText: {
          color: isDark ? '#888' : '#666',
          fontSize: 11,
          fontWeight: '500',
        },
        listDeleteContainer: {
          justifyContent: 'flex-end',
          backgroundColor: '#ff4d4d',
          borderRadius: 6,
          padding: 6,
          marginHorizontal: 2,
        },
        listDeleteIcon: {
          color: '#fff',
        },
      }),
    [theme, isDark],
  );
}

export default memo(WatchLater);
