import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { memo, useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { List, Switch, useTheme } from 'react-native-paper';
import { useLanguage } from '../../../misc/LanguageContext';
import { UtilsStackNavigator } from '../../../types/navigation';
import { DatabaseManager, useModifiedKeyValueIfFocused } from '../../../utils/DatabaseManager';

type Props = NativeStackScreenProps<UtilsStackNavigator, 'HomePreferences'>;

function HomePreferences(_props: Props) {
  const theme = useTheme();
  const { t } = useLanguage();

  const showAnime = useModifiedKeyValueIfFocused('homeShowAnime', res => res !== 'false', true);
  const showComics = useModifiedKeyValueIfFocused('homeShowComics', res => res !== 'false', true);
  const showFilms = useModifiedKeyValueIfFocused('homeShowFilms', res => res !== 'false', true);

  const toggleHandler = useCallback((key: string, currentValue: boolean) => {
    DatabaseManager.set(key, String(!currentValue));
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <List.Section>
        <List.Subheader>{t('homePrefs.header')}</List.Subheader>
        <List.Item
          title={t('homePrefs.showAnime')}
          description={t('homePrefs.showAnimeDesc')}
          left={props => <List.Icon {...props} icon="television-play" />}
          right={() => (
            <Switch
              value={showAnime}
              onValueChange={() => toggleHandler('homeShowAnime', showAnime)}
              color={theme.colors.primary}
            />
          )}
        />
        <List.Item
          title={t('homePrefs.showComics')}
          description={t('homePrefs.showComicsDesc')}
          left={props => <List.Icon {...props} icon="book-open-page-variant" />}
          right={() => (
            <Switch
              value={showComics}
              onValueChange={() => toggleHandler('homeShowComics', showComics)}
              color={theme.colors.primary}
            />
          )}
        />
        <List.Item
          title={t('homePrefs.showFilms')}
          description={t('homePrefs.showFilmsDesc')}
          left={props => <List.Icon {...props} icon="movie-open" />}
          right={() => (
            <Switch
              value={showFilms}
              onValueChange={() => toggleHandler('homeShowFilms', showFilms)}
              color={theme.colors.primary}
            />
          )}
        />
      </List.Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
  },
});

export default memo(HomePreferences);
