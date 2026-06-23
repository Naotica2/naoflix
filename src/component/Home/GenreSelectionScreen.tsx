import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Appbar, useTheme, Surface, Text, TextInput } from 'react-native-paper';
import { RootStackNavigator } from '../../types/navigation';
import useGlobalStyles from '../../assets/style';

const ANIME_GENRES = ['Action', 'Adventure', 'Comedy', 'Demons', 'Drama', 'Ecchi', 'Fantasy', 'Game', 'Harem', 'Historical', 'Horror', 'Isekai', 'Josei', 'Magic', 'Martial Arts', 'Mecha', 'Military', 'Music', 'Mystery', 'Psychological', 'Romance', 'Samurai', 'School', 'Sci-Fi', 'Seinen', 'Shoujo', 'Shoujo Ai', 'Shounen', 'Slice of Life', 'Space', 'Sports', 'Super Power', 'Supernatural', 'Thriller', 'Vampire'];
const COMIC_GENRES = ['Action', 'Adventure', 'Comedy', 'Crime', 'Drama', 'Fantasy', 'Historical', 'Horror', 'Isekai', 'Magic', 'Martial Arts', 'Mecha', 'Medical', 'Mystery', 'Psychological', 'Romance', 'School Life', 'Sci-Fi', 'Slice of Life', 'Sports', 'Superhero', 'Thriller', 'Tragedy'];

type Props = NativeStackScreenProps<RootStackNavigator, 'GenreSelectionScreen'>;

export default function GenreSelectionScreen({ navigation, route }: Props) {
  const { type } = route.params;
  const theme = useTheme();
  const globalStyles = useGlobalStyles();
  const [searchQuery, setSearchQuery] = useState('');

  const genres = type === 'anime' ? ANIME_GENRES : COMIC_GENRES;
  const title = type === 'anime' ? 'Genre Anime' : 'Genre Komik';

  const filteredGenres = genres.filter(g => g.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleSelectGenre = useCallback((genre: string) => {
    navigation.navigate('SeeMore', {
      type: type === 'anime' ? 'AnimeGenre' : 'ComicsGenre',
      genre: genre.toLowerCase().replace(/ /g, '-'),
    });
  }, [navigation, type]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={title} titleStyle={{ fontWeight: 'bold' }} />
      </Appbar.Header>
      
      <View style={styles.searchContainer}>
        <TextInput
          mode="outlined"
          placeholder="Cari genre..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          left={<TextInput.Icon icon="magnify" />}
          style={{ backgroundColor: theme.colors.elevation.level1 }}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.grid}>
          {filteredGenres.map(genre => (
            <TouchableOpacity
              key={genre}
              style={styles.gridItem}
              onPress={() => handleSelectGenre(genre)}>
              <Surface elevation={2} style={[styles.surface, { backgroundColor: theme.colors.secondaryContainer }]}>
                <Text style={[globalStyles.text, styles.genreText, { color: theme.colors.onSecondaryContainer }]}>
                  {genre}
                </Text>
              </Surface>
            </TouchableOpacity>
          ))}
          {filteredGenres.length === 0 && (
            <Text style={[globalStyles.text, { marginTop: 20, opacity: 0.7 }]}>Genre tidak ditemukan.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  gridItem: {
    width: '46%',
  },
  surface: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genreText: {
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
});
