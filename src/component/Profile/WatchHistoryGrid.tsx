import React, { memo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, useColorScheme, ActivityIndicator } from 'react-native';
import { supabase } from '../../config/supabaseClient';
import ImageLoading from '../misc/ImageLoading';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackNavigator } from '../../types/navigation';
import moment from 'moment';
import URL from 'url';
import { useAuth } from '../../misc/AuthContext';

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

const TABS = ['Semua', 'Anime', 'Film'];
type TabType = typeof TABS[number];

function WatchHistoryGrid({ userId, refreshTrigger }: Props) {
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const { user } = useAuth();
  
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [userId, refreshTrigger]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('watch_history')
        .select('*')
        .eq('user_id', userId)
        .in('content_type', ['anime', 'film'])
        .order('last_watched_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setHistory(data || []);
    } catch (e) {
      console.warn('Failed to fetch public history:', e);
    } finally {
      setLoading(false);
    }
  };

  const animeHistory = history.filter(h => h.content_type === 'anime').slice(0, 4);
  const filmHistory = history.filter(h => h.content_type === 'film').slice(0, 4);

  const handlePress = (item: WatchHistoryItem) => {
    if (item.content_id && (item.content_id.startsWith('http') || item.content_id.startsWith('film://') || item.content_id.startsWith('al-'))) {
      navigation.navigate('FromUrl', {
        link: item.content_id,
        title: item.title,
        thumbnailUrl: item.thumbnail_url || undefined,
        type: item.content_type === 'anime' ? 'anime' : 'movie'
      });
    } else {
      navigation.navigate('Home', { screen: 'Browse', params: { autoSearch: item.title, type: item.content_type } } as any);
    }
  };

  const renderGrid = (data: WatchHistoryItem[], title: string, emptyMsg: string) => (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#111' }]}>{title}</Text>
      {data.length > 0 ? (
        <View style={styles.gridRow}>
          {data.map(item => (
            <TouchableOpacity 
              key={item.id} 
              style={[styles.card, { borderColor: isDark ? '#222' : '#eee', borderWidth: 1 }]}
              activeOpacity={0.8}
              onPress={() => handlePress(item)}>
              <ImageLoading 
                source={{ uri: item.thumbnail_url || undefined }} 
                fallbackSearchTitle={item.content_type === 'anime' ? item.title : undefined}
                style={styles.poster}
                resizeMode="cover"
              />
              {item.episode && (
                <View style={styles.episodeBadge}>
                  <Text style={styles.episodeText} numberOfLines={1}>{item.episode}</Text>
                </View>
              )}
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
      <View style={[styles.container, { padding: 40 }]}>
        <ActivityIndicator size="small" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderGrid(animeHistory, 'Riwayat Anime Terbaru', 'Belum ada anime yang ditonton')}
      {renderGrid(filmHistory, 'Riwayat Film Terbaru', 'Belum ada film yang ditonton')}
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
    gap: 12,
  },
  card: {
    width: '22%', // Roughly 4 items per row with gap
    aspectRatio: 2/3,
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
