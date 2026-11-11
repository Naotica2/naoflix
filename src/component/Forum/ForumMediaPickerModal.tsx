import MaterialIcons from '@react-native-vector-icons/material-icons';
import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../misc/LanguageContext';
import { ForumLinkedMedia, ForumMediaType, normalizeMediaKey } from '../../types/forum';
import AnimeAPI from '../../utils/AnimeAPI';
import { FilmAPI } from '../../utils/FilmAPI';
import { loadLocalWatchedAndSavedMedia } from '../../utils/forumApi';
import { comicsSearch } from '../../utils/scrapers/comicsv2';
import ForumImage from './ForumImage';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (media: ForumLinkedMedia) => void;
}

function ForumMediaPickerModal({ visible, onClose, onSelect }: Props) {
  const { t } = useLanguage();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<'local' | 'search'>('local');
  const [searchType, setSearchType] = useState<ForumMediaType>('anime');
  const [query, setQuery] = useState('');
  const [localItems, setLocalItems] = useState<ForumLinkedMedia[]>([]);
  const [searchItems, setSearchItems] = useState<ForumLinkedMedia[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    loadLocalWatchedAndSavedMedia()
      .then(items => {
        if (!cancelled) setLocalItems(items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setLoading(true);
    try {
      if (searchType === 'anime') {
        const res = await AnimeAPI.search(q);
        const mapped: ForumLinkedMedia[] = (res?.result || []).slice(0, 20).map(item => ({
          media_key: normalizeMediaKey('anime', item.animeUrl || item.title),
          type: 'anime',
          title: item.title,
          poster_url: item.thumbnailUrl || null,
          link: item.animeUrl,
        }));
        setSearchItems(mapped);
      } else if (searchType === 'film') {
        const res = await FilmAPI.search(q, 0);
        const mapped: ForumLinkedMedia[] = (res?.items || []).slice(0, 20).map(item => ({
          media_key: normalizeMediaKey('film', `${item.source || 'lk21'}:${item.id}`),
          type: 'film',
          title: item.title,
          poster_url: item.poster || null,
          link: `film://${item.id}`,
          source: item.source,
          film_item: {
            id: item.id,
            title: item.title,
            poster: item.poster,
            type: item.type,
            source: item.source,
            subjectType: item.subjectType,
            releaseDate: item.releaseDate,
            rating: item.rating,
            description: item.description,
          },
        }));
        setSearchItems(mapped);
      } else {
        const res = await comicsSearch(q);
        const mapped: ForumLinkedMedia[] = (res || []).slice(0, 20).map(item => ({
          media_key: normalizeMediaKey('comics', item.detailUrl || item.title),
          type: 'comics',
          title: item.title,
          poster_url: item.thumbnailUrl || null,
          link: item.detailUrl,
          source: item.source,
        }));
        setSearchItems(mapped);
      }
    } catch {
      setSearchItems([]);
    } finally {
      setLoading(false);
    }
  }, [query, searchType]);

  const activeData = mode === 'local' ? localItems : searchItems;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? '#0a0a0c' : '#f4f4f5',
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 8,
          },
        ]}>
        <View style={[styles.header, { borderBottomColor: isDark ? '#1e1e24' : '#e4e4e7' }]}>
          <Text style={[styles.headerTitle, { color: isDark ? '#f4f4f5' : '#09090b' }]}>
            {t('forumFeed.mediaPickerTitle')}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <MaterialIcons name="close" size={24} color={isDark ? '#a1a1aa' : '#52525b'} />
          </TouchableOpacity>
        </View>

        <View style={styles.segmentRow}>
          {(['local', 'search'] as const).map(tab => {
            const active = mode === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setMode(tab)}
                style={[
                  styles.segmentBtn,
                  {
                    backgroundColor: active ? '#3b82f6' : isDark ? '#141418' : '#ffffff',
                    borderColor: active ? '#3b82f6' : isDark ? '#27272a' : '#e4e4e7',
                  },
                ]}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: active ? '#ffffff' : isDark ? '#a1a1aa' : '#52525b',
                  }}>
                  {tab === 'local'
                    ? t('forumFeed.mediaPickerRecent')
                    : t('forumFeed.mediaPickerSearch')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {mode === 'search' && (
          <View style={styles.searchSection}>
            <View style={styles.typeChipRow}>
              {(['anime', 'film', 'comics'] as ForumMediaType[]).map(kind => {
                const active = searchType === kind;
                const label =
                  kind === 'anime'
                    ? t('forumFeed.mediaTypeAnime')
                    : kind === 'film'
                      ? t('forumFeed.mediaTypeFilm')
                      : t('forumFeed.mediaTypeComics');
                return (
                  <TouchableOpacity
                    key={kind}
                    onPress={() => {
                      setSearchType(kind);
                      setSearchItems([]);
                    }}
                    style={[
                      styles.typeChip,
                      {
                        backgroundColor: active
                          ? isDark
                            ? 'rgba(59,130,246,0.18)'
                            : '#dbeafe'
                          : isDark
                            ? '#141418'
                            : '#ffffff',
                        borderColor: active ? '#3b82f6' : isDark ? '#27272a' : '#e4e4e7',
                      },
                    ]}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: active ? '#3b82f6' : isDark ? '#a1a1aa' : '#52525b',
                      }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View
              style={[
                styles.searchInputWrap,
                {
                  backgroundColor: isDark ? '#141418' : '#ffffff',
                  borderColor: isDark ? '#27272a' : '#e4e4e7',
                },
              ]}>
              <MaterialIcons name="search" size={18} color={isDark ? '#71717a' : '#a1a1aa'} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={runSearch}
                returnKeyType="search"
                placeholder={t('forumFeed.mediaPickerSearchPlaceholder')}
                placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
                style={[styles.searchInput, { color: isDark ? '#f4f4f5' : '#09090b' }]}
              />
              <TouchableOpacity onPress={runSearch} style={styles.searchGoBtn}>
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>
                  {t('common.search')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : (
          <FlatList
            data={activeData}
            keyExtractor={item => item.media_key}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}
            ListEmptyComponent={
              <View style={styles.centerBox}>
                <MaterialIcons
                  name="movie-filter"
                  size={38}
                  color={isDark ? '#3f3f46' : '#d4d4d8'}
                />
                <Text
                  style={{
                    color: isDark ? '#71717a' : '#71717a',
                    fontSize: 13,
                    textAlign: 'center',
                    marginTop: 10,
                    paddingHorizontal: 24,
                  }}>
                  {mode === 'local'
                    ? t('forumFeed.mediaPickerEmptyLocal')
                    : t('forumFeed.mediaPickerEmptySearch')}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const typeLabel =
                item.type === 'anime'
                  ? t('forumFeed.mediaTypeAnime')
                  : item.type === 'film'
                    ? t('forumFeed.mediaTypeFilm')
                    : t('forumFeed.mediaTypeComics');
              return (
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  style={[
                    styles.itemRow,
                    {
                      backgroundColor: isDark ? '#111115' : '#ffffff',
                      borderColor: isDark ? '#1e1e24' : '#e4e4e7',
                    },
                  ]}>
                  {item.poster_url ? (
                    <ForumImage uri={item.poster_url} style={styles.posterThumb} />
                  ) : (
                    <View
                      style={[
                        styles.posterThumb,
                        {
                          backgroundColor: isDark ? '#1e1e24' : '#e4e4e7',
                          alignItems: 'center',
                          justifyContent: 'center',
                        },
                      ]}>
                      <MaterialIcons name="movie" size={18} color="#71717a" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: isDark ? '#f4f4f5' : '#09090b',
                        fontSize: 14,
                        fontWeight: '600',
                      }}
                      numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <View
                        style={[
                          styles.typePill,
                          { backgroundColor: isDark ? '#1e293b' : '#eff6ff' },
                        ]}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#3b82f6' }}>
                          {typeLabel}
                        </Text>
                      </View>
                      {item.episode_label ? (
                        <Text
                          style={{ fontSize: 11.5, color: isDark ? '#a1a1aa' : '#52525b' }}
                          numberOfLines={1}>
                          {item.episode_label}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <MaterialIcons name="add-circle-outline" size={22} color="#3b82f6" />
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  typeChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  searchGoBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
  },
  posterThumb: {
    width: 44,
    height: 62,
    borderRadius: 6,
  },
  typePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
});

export default memo(ForumMediaPickerModal);
