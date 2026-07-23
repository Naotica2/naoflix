import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ToastAndroid, ScrollView } from 'react-native';
import { Avatar, Switch, Text, useTheme } from 'react-native-paper';
import { DatabaseManager } from '../../../utils/DatabaseManager';
import { invalidateSourceCache } from '../../../utils/sourcePreferences';

interface SourceConfig {
  id: string;
  name: string;
  type: 'Anime' | 'Comics';
  language: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;
}

const INITIAL_SOURCES: SourceConfig[] = [
  {
    id: 'komiku',
    name: 'Komiku',
    type: 'Comics',
    language: 'ID',
    description: 'Sumber komik default dengan koleksi manga, manhwa, dan manhua.',
    isDefault: true,
    isActive: true,
  },
  {
    id: 'mynimeku',
    name: 'MyNimeku',
    type: 'Comics',
    language: 'ID',
    description: 'Sumber komik dari MyNimeku.',
    isDefault: false,
    isActive: false,
  },
  {
    id: 'bacakomik',
    name: 'Bacakomik',
    type: 'Comics',
    language: 'ID',
    description: 'Sumber komik dari Bacakomik.',
    isDefault: false,
    isActive: false,
  },
  {
    id: 'mangadex',
    name: 'MangaDex',
    type: 'Comics',
    language: 'EN / GL',
    description: 'Sumber baca komik global dari MangaDex.',
    isDefault: false,
    isActive: false,
  },
  {
    id: 'shinigami',
    name: 'Shinigami',
    type: 'Comics',
    language: 'ID',
    description: 'Sumber komik dengan koleksi Manhwa, dan Manhua terlengkap.',
    isDefault: false,
    isActive: false,
  },
  {
    id: 'komikcast',
    name: 'Komikcast',
    type: 'Comics',
    language: 'ID',
    description: 'Sumber baca komik dari komikcast',
    isDefault: false,
    isActive: false,
  },
  {
    id: 'otakudesu',
    name: 'OtakuDesu',
    type: 'Anime',
    language: 'ID',
    description: 'Sumber streaming anime terbesar dengan koleksi terlengkap.',
    isDefault: true,
    isActive: true,
  },
  {
    id: 'animelovers',
    name: 'Animelovers',
    type: 'Anime',
    language: 'ID',
    description: 'Sumber alternatif streaming anime dari animelovers.',
    isDefault: false,
    isActive: false,
  },
];

function ExtensionManager() {
  const theme = useTheme();
  const [sources, setSources] = useState<SourceConfig[]>(INITIAL_SOURCES);

  // Load saved preferences from database
  useEffect(() => {
    DatabaseManager.get('extensionPreferences').then((savedStr) => {
      if (savedStr) {
        try {
          const savedPrefs: Partial<SourceConfig>[] = JSON.parse(savedStr);
          // Merge with initial so new sources appear automatically
          const merged = INITIAL_SOURCES.map(initial => {
            const saved = savedPrefs.find(s => s.id === initial.id);
            if (saved) {
              return { ...initial, isActive: saved.isActive ?? initial.isActive };
            }
            return initial;
          });
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
      // Trying to deactivate - ensure at least one source of this type stays active
      const sameTypeActive = sources.filter(s => s.type === targetSource.type && s.id !== id && s.isActive);
      if (sameTypeActive.length === 0) {
        ToastAndroid.show(`Minimal 1 sumber ${targetSource.type} harus aktif!`, ToastAndroid.SHORT);
        return;
      }
    }

    const updatedSources = sources.map(s => {
      if (s.id === id) {
        // Toggle the clicked source
        return { ...s, isActive: newActive };
      }
      // If activating a source, deactivate all others of the same type
      if (newActive && s.type === targetSource.type) {
        return { ...s, isActive: false };
      }
      return s;
    });

    savePreferences(updatedSources);
  };

  const animeSources = sources.filter(s => s.type === 'Anime');
  const comicsSources = sources.filter(s => s.type === 'Comics');

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Avatar.Icon size={36} icon="film" style={{ backgroundColor: theme.colors.primaryContainer }} />
            <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>Anime</Text>
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
                      <Text style={[styles.defaultText, { color: theme.colors.onTertiaryContainer }]}>Default</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.sourceDesc, { color: theme.colors.onSurfaceVariant }]}>{source.description}</Text>
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
            <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>Comics</Text>
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
                      <Text style={[styles.defaultText, { color: theme.colors.onTertiaryContainer }]}>Default</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.sourceDesc, { color: theme.colors.onSurfaceVariant }]}>{source.description}</Text>
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
