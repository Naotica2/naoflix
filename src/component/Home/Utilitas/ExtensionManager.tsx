import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ToastAndroid, ScrollView } from 'react-native';
import { Avatar, Switch, Text, useTheme } from 'react-native-paper';
import { DatabaseManager } from '../../../utils/DatabaseManager';
import { invalidateSourceCache } from '../../../utils/sourcePreferences';
import { setWebViewOpen } from '../../../utils/CFBypass';
import DialogManager from '../../../utils/dialogManager';
import { tSync, TranslationKey, useLanguage } from '../../../misc/LanguageContext';

interface SourceConfig {
  id: string;
  name: string;
  type: 'Anime' | 'Comics' | 'Movies';
  language: string;
  descKey: TranslationKey;
  isDefault: boolean;
  isActive: boolean;
}

const INITIAL_SOURCES: SourceConfig[] = [
  {
    id: 'komiku',
    name: 'Komiku',
    type: 'Comics',
    language: 'ID',
    descKey: 'utils.extDescKomiku',
    isDefault: true,
    isActive: true,
  },
  {
    id: 'mynimeku',
    name: 'MyNimeku',
    type: 'Comics',
    language: 'ID',
    descKey: 'utils.extDescMynimeku',
    isDefault: false,
    isActive: false,
  },
  {
    id: 'bacakomik',
    name: 'Bacakomik',
    type: 'Comics',
    language: 'ID',
    descKey: 'utils.extDescBacakomik',
    isDefault: false,
    isActive: false,
  },
  {
    id: 'shinigami',
    name: 'Shinigami',
    type: 'Comics',
    language: 'ID',
    descKey: 'utils.extDescShinigami',
    isDefault: false,
    isActive: false,
  },
  {
    id: 'komikindo',
    name: 'Komikindo',
    type: 'Comics',
    language: 'ID',
    descKey: 'utils.extDescKomikindo',
    isDefault: false,
    isActive: false,
  },
  {
    id: 'luvyaa',
    name: 'Luvyaa (NSFW)',
    type: 'Comics',
    language: 'ID',
    descKey: 'utils.extDescLuvyaa',
    isDefault: false,
    isActive: false,
  },
  {
    id: 'voratoon',
    name: 'Voratoon',
    type: 'Comics',
    language: 'ID',
    descKey: 'utils.extDescVoratoon',
    isDefault: false,
    isActive: false,
  },
  {
    id: 'otakudesu',
    name: 'OtakuDesu',
    type: 'Anime',
    language: 'ID',
    descKey: 'utils.extDescOtakudesu',
    isDefault: true,
    isActive: true,
  },
  {
    id: 'nimegami',
    name: 'Nimegami',
    type: 'Anime',
    language: 'ID',
    descKey: 'utils.extDescNimegami',
    isDefault: false,
    isActive: false,
  },
  {
    id: 'lk21',
    name: 'LK21',
    type: 'Movies',
    language: 'ID / EN',
    descKey: 'utils.extDescLk21',
    isDefault: true,
    isActive: true,
  },
];

function ExtensionManager() {
  const theme = useTheme();
  const { t } = useLanguage();
  const [sources, setSources] = useState<SourceConfig[]>(INITIAL_SOURCES);

  useEffect(() => {
    DatabaseManager.get('extensionPreferences').then((savedStr) => {
      if (savedStr) {
        try {
          const savedPrefs: Partial<SourceConfig>[] = JSON.parse(savedStr);
          const merged = INITIAL_SOURCES.map(initial => {
            const saved = savedPrefs.find(s => s.id === initial.id);
            if (saved) {
              return { ...initial, isActive: saved.isActive ?? initial.isActive };
            }
            return initial;
          });
          if (!merged.some(s => s.type === 'Movies' && s.isActive)) {
            const lk21Idx = merged.findIndex(s => s.id === 'lk21');
            if (lk21Idx >= 0) merged[lk21Idx] = { ...merged[lk21Idx], isActive: true };
          }
          if (!merged.some(s => s.type === 'Anime' && s.isActive)) {
            const otakuIdx = merged.findIndex(s => s.id === 'otakudesu');
            if (otakuIdx >= 0) merged[otakuIdx] = { ...merged[otakuIdx], isActive: true };
          }
          setSources(merged);
        } catch (e) {
          console.error('Failed to parse saved preferences', e);
        }
      }
    });
  }, []);

  const savePreferences = async (updatedSources: SourceConfig[]) => {
    setSources(updatedSources);
    const toSave = updatedSources.map(s => ({ id: s.id, isActive: s.isActive }));
    await DatabaseManager.set('extensionPreferences', JSON.stringify(toSave));
    invalidateSourceCache();
  };

  const toggleSource = (id: string) => {
    const targetSource = sources.find(s => s.id === id);
    if (!targetSource) return;

    const newActive = !targetSource.isActive;

    if (!newActive) {
      const sameTypeActive = sources.filter(s => s.type === targetSource.type && s.id !== id && s.isActive);
      if (sameTypeActive.length === 0) {
        ToastAndroid.show(tSync('utils.extMinOneActive'), ToastAndroid.SHORT);
        return;
      }
    }

    const performToggle = () => {
      const updatedSources = sources.map(s => {
        if (s.id === id) {
          return { ...s, isActive: newActive };
        }
        if (newActive && s.type === targetSource.type) {
          return { ...s, isActive: false };
        }
        return s;
      });
      savePreferences(updatedSources);
    };

    if (id === 'luvyaa' && newActive) {
      DialogManager.alert(
        tSync('utils.extLuvyaaTitle'),
        tSync('utils.extLuvyaaDesc'),
        [
          { text: tSync('utils.extLuvyaaLater'), onPress: performToggle },
          { 
            text: tSync('utils.extLuvyaaLoginNow'), 
            onPress: () => {
              performToggle();
              setWebViewOpen.openWebViewCF(true, 'https://v5.luvyaa.co/login/', true);
            }
          }
        ]
      );
      return;
    }

    performToggle();
  };

  const animeSources = sources.filter(s => s.type === 'Anime');
  const comicsSources = sources.filter(s => s.type === 'Comics');
  const moviesSources = sources.filter(s => s.type === 'Movies');

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Avatar.Icon size={36} icon="movie-open" style={{ backgroundColor: theme.colors.primaryContainer }} />
            <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>{t('utils.extMoviesHeader')}</Text>
          </View>
          {moviesSources.map(source => (
            <View key={source.id} style={[styles.sourceItem, { borderBottomColor: theme.colors.outlineVariant }]}>
              <View style={styles.sourceInfo}>
                <View style={styles.sourceNameRow}>
                  <Text style={[styles.sourceName, { color: theme.colors.onBackground }]}>{source.name}</Text>
                  <View style={[styles.langBadge, { backgroundColor: theme.colors.secondaryContainer }]}>
                    <Text style={[styles.langText, { color: theme.colors.onSecondaryContainer }]}>{source.language}</Text>
                  </View>
                  {source.isDefault && (
                    <View style={[styles.defaultBadge, { backgroundColor: theme.colors.tertiaryContainer }]}>
                      <Text style={[styles.defaultText, { color: theme.colors.onTertiaryContainer }]}>{t('utils.extDefaultBadge')}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.sourceDesc, { color: theme.colors.onSurfaceVariant }]}>{t(source.descKey)}</Text>
              </View>
              <Switch
                value={source.isActive}
                onValueChange={() => toggleSource(source.id)}
                color={theme.colors.primary}
              />
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Avatar.Icon size={36} icon="film" style={{ backgroundColor: theme.colors.primaryContainer }} />
            <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>{t('utils.extAnimeHeader')}</Text>
          </View>
          {animeSources.map(source => (
            <View key={source.id} style={[styles.sourceItem, { borderBottomColor: theme.colors.outlineVariant }]}>
              <View style={styles.sourceInfo}>
                <View style={styles.sourceNameRow}>
                  <Text style={[styles.sourceName, { color: theme.colors.onBackground }]}>{source.name}</Text>
                  <View style={[styles.langBadge, { backgroundColor: theme.colors.secondaryContainer }]}>
                    <Text style={[styles.langText, { color: theme.colors.onSecondaryContainer }]}>{source.language}</Text>
                  </View>
                  {source.isDefault && (
                    <View style={[styles.defaultBadge, { backgroundColor: theme.colors.tertiaryContainer }]}>
                      <Text style={[styles.defaultText, { color: theme.colors.onTertiaryContainer }]}>{t('utils.extDefaultBadge')}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.sourceDesc, { color: theme.colors.onSurfaceVariant }]}>{t(source.descKey)}</Text>
              </View>
              <Switch
                value={source.isActive}
                onValueChange={() => toggleSource(source.id)}
                color={theme.colors.primary}
              />
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Avatar.Icon size={36} icon="book-open-variant" style={{ backgroundColor: theme.colors.primaryContainer }} />
            <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>{t('utils.extComicsHeader')}</Text>
          </View>
          {comicsSources.map(source => (
            <View key={source.id} style={[styles.sourceItem, { borderBottomColor: theme.colors.outlineVariant }]}>
              <View style={styles.sourceInfo}>
                <View style={styles.sourceNameRow}>
                  <Text style={[styles.sourceName, { color: theme.colors.onBackground }]}>{source.name}</Text>
                  <View style={[styles.langBadge, { backgroundColor: theme.colors.secondaryContainer }]}>
                    <Text style={[styles.langText, { color: theme.colors.onSecondaryContainer }]}>{source.language}</Text>
                  </View>
                  {source.isDefault && (
                    <View style={[styles.defaultBadge, { backgroundColor: theme.colors.tertiaryContainer }]}>
                      <Text style={[styles.defaultText, { color: theme.colors.onTertiaryContainer }]}>{t('utils.extDefaultBadge')}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.sourceDesc, { color: theme.colors.onSurfaceVariant }]}>{t(source.descKey)}</Text>
              </View>
              <Switch
                value={source.isActive}
                onValueChange={() => toggleSource(source.id)}
                color={theme.colors.primary}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sourceInfo: {
    flex: 1,
    marginRight: 12,
  },
  sourceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sourceName: {
    fontSize: 16,
    fontWeight: '500',
  },
  langBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  langText: {
    fontSize: 11,
    fontWeight: '600',
  },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sourceDesc: {
    fontSize: 13,
  },
});

export default ExtensionManager;
