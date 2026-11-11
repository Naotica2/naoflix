import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../../config/supabaseClient';
import ImageLoading from '../misc/ImageLoading';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackNavigator } from '../../types/navigation';
import {
  cleanAnimeTitle,
  getCanonicalAnimeContentId,
  getWatchHistoryGridCache,
  setWatchHistoryGridCache,
} from '../../utils/watchHistorySync';
import { useLanguage } from '../../misc/LanguageContext';

interface WatchHistoryItem {
  id: string;
  content_type: string;
  content_id: string;
  title: string;
  thumbnail_url: string | null;
  episode: string | null;
  source: string;
  last_watched_at: string;
}

interface Props {
  userId: string;
  refreshTrigger?: boolean;
}

function WatchHistoryGrid({ userId, refreshTrigger }: Props) {
  const isDark = useColorScheme() === 'dark';
  const { t } = useLanguage();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const { width } = useWindowDimensions();

  const [initialCached] = useState<WatchHistoryItem[] | null>(
    () => getWatchHistoryGridCache(userId) as WatchHistoryItem[] | null,
  );
  const [history, setHistory] = useState<WatchHistoryItem[]>(() => initialCached || []);
  const [loading, setLoading] = useState(() => initialCached === null);
  const cleanedDuplicateIdsRef = useRef<Set<string>>(new Set());
  const prevRefreshTriggerRef = useRef<boolean>(!!refreshTrigger);
  const lastFetchedUserIdRef = useRef<string | null>(null);

  const horizontalPad = width < 360 ? 24 : 32;
  const gridGap = width < 360 ? 8 : 10;
  const cardWidth = Math.max(60, Math.floor((width - horizontalPad - gridGap * 3) / 4));

  const fetchHistory = useCallback(
    async (force = false) => {
      if (!userId) return;
      if (!force) {
        const cached = getWatchHistoryGridCache(userId) as WatchHistoryItem[] | null;
        if (cached) {
          setHistory(cached);
          setLoading(false);
          return;
        }
      }

      if (getWatchHistoryGridCache(userId) === null) {
        setLoading(true);
      }
      try {
        const { data, error } = await supabase
          .from('watch_history')
          .select('id, content_type, content_id, title, thumbnail_url, episode, source, last_watched_at')
          .eq('user_id', userId)
          .in('content_type', ['anime', 'film'])
          .order('last_watched_at', { ascending: false })
          .limit(24);

        if (error) throw error;
        const rows = data || [];
        setWatchHistoryGridCache(userId, rows);
        setHistory(rows);
      } catch (e) {
        console.warn('Failed to fetch public history:', e);
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    const userChanged = lastFetchedUserIdRef.current !== userId;
    const triggerActivated = !prevRefreshTriggerRef.current && !!refreshTrigger;
    prevRefreshTriggerRef.current = !!refreshTrigger;

    if (!userChanged && !triggerActivated) {
      return;
    }

    lastFetchedUserIdRef.current = userId;
    fetchHistory(triggerActivated);
  }, [fetchHistory, refreshTrigger, userId]);

  const { animeHistory, filmHistory, duplicateIdsToDelete } = useMemo(() => {
    const rawAnime = history.filter(h => h.content_type === 'anime');
    const seenAnime = new Set<string>();
    const dedupAnime: WatchHistoryItem[] = [];
    const dupIds: string[] = [];

    for (const item of rawAnime) {
      const clean = cleanAnimeTitle(item.title).toLowerCase().trim();
      const canonicalCid = getCanonicalAnimeContentId(item.content_id, undefined, item.title)
        .toLowerCase()
        .trim();
      const groupKey = clean || canonicalCid;

      if (!seenAnime.has(groupKey)) {
        seenAnime.add(groupKey);
        if (canonicalCid) seenAnime.add(canonicalCid);
        if (clean) seenAnime.add(clean);
        dedupAnime.push({
          ...item,
          title: cleanAnimeTitle(item.title) || item.title,
        });
      } else {
        dupIds.push(item.id);
      }
    }

    const rawFilm = history.filter(h => h.content_type === 'film');
    const seenFilm = new Set<string>();
    const dedupFilm: WatchHistoryItem[] = [];

    for (const item of rawFilm) {
      const key = (item.content_id || item.title).toLowerCase().trim().split('?')[0];
      if (!seenFilm.has(key)) {
        seenFilm.add(key);
        dedupFilm.push(item);
      } else {
        dupIds.push(item.id);
      }
    }

    return {
      animeHistory: dedupAnime.slice(0, 4),
      filmHistory: dedupFilm.slice(0, 4),
      duplicateIdsToDelete: dupIds,
    };
  }, [history]);

  useEffect(() => {
    const pendingDelete = duplicateIdsToDelete.filter(
      id => !cleanedDuplicateIdsRef.current.has(id),
    );
    if (pendingDelete.length === 0) return;

    pendingDelete.forEach(id => cleanedDuplicateIdsRef.current.add(id));
    supabase
      .from('watch_history')
      .delete()
      .in('id', pendingDelete)
      .then(() => {}, () => {});
  }, [duplicateIdsToDelete]);

  const handlePress = useCallback(
    (item: WatchHistoryItem) => {
      if (
        item.content_id &&
        (item.content_id.startsWith('http') ||
          item.content_id.startsWith('film://') ||
          item.content_id.startsWith('al-'))
      ) {
        navigation.navigate('FromUrl', {
          link: item.content_id,
          title: item.title,
          thumbnailUrl: item.thumbnail_url || undefined,
          type: item.content_type === 'anime' ? 'anime' : 'movie',
        });
      } else {
        navigation.navigate('Home', {
          screen: 'Browse',
          params: { autoSearch: item.title, type: item.content_type },
        } as any);
      }
    },
    [navigation],
  );

  const renderGrid = (data: WatchHistoryItem[], title: string, emptyMsg: string) => (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#111' }]}>{title}</Text>
      {data.length > 0 ? (
        <View style={[styles.gridRow, { gap: gridGap }]}>
          {data.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.card,
                {
                  width: cardWidth,
                  borderColor: isDark ? '#222' : '#eee',
                  borderWidth: 1,
                },
              ]}
              activeOpacity={0.8}
              onPress={() => handlePress(item)}>
              <ImageLoading
                source={{ uri: item.thumbnail_url || undefined }}
                fallbackSearchTitle={
                  item.content_type === 'anime' ? cleanAnimeTitle(item.title) : undefined
                }
                style={styles.poster}
                resizeMode="cover"
              />
              {item.episode ? (
                <View style={styles.episodeBadge}>
                  <Text style={styles.episodeText} numberOfLines={1}>
                    {item.episode}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={[styles.emptyBox, { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' }]}>
          <Text style={[styles.emptyText, { color: isDark ? '#555' : '#999' }]}>{emptyMsg}</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { padding: 32 }]}>
        <ActivityIndicator size="small" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderGrid(animeHistory, t('profile.recentAnimeHistory'), t('profile.noAnimeWatched'))}
      {renderGrid(filmHistory, t('profile.recentFilmHistory'), t('profile.noFilmWatched'))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gridRow: {
    flexDirection: 'row',
  },
  card: {
    aspectRatio: 2 / 3,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  episodeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  episodeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  emptyBox: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
});

export default memo(WatchHistoryGrid);
