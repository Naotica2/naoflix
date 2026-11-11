import React, { memo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackNavigator } from '../types/navigation';
import { supabase } from '../config/supabaseClient';
import { getLevelColor } from '../utils/LevelSystem';
import { useLanguage } from '../misc/LanguageContext';
import ForumImage from '../component/Forum/ForumImage';

interface UserSearchResult {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  level: number;
}

function SearchUsersScreen() {
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const { t } = useLanguage();
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      searchUsers(trimmed);
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  const searchUsers = async (searchTerm: string) => {
    if (searchTerm.trim().length < 2) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, level')
        .or(`username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
        .limit(20);

      if (error) throw error;
      setResults(data || []);
    } catch (e) {
      console.warn('Failed to search users:', e);
    } finally {
      setLoading(false);
    }
  };

  const keyExtractor = useCallback((item: UserSearchResult) => item.id, []);

  const renderItem = useCallback(({ item }: { item: UserSearchResult }) => {
    const levelColor = getLevelColor(item.level);

    return (
      <TouchableOpacity 
        style={[styles.userCard, { borderBottomColor: isDark ? '#222' : '#eee' }]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('UserProfile', { userId: item.id })}>
        
        <View style={[styles.avatar, { backgroundColor: isDark ? '#1a1a1a' : '#ddd' }]}>
          {item.avatar_url ? (
            <ForumImage uri={item.avatar_url} recyclingKey={item.avatar_url} style={styles.avatarImg} />
          ) : (
            <Text style={[styles.avatarText, { color: isDark ? '#fff' : '#333' }]}>
              {(item.display_name || item.username || '?').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>

        <View style={styles.userInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 10 }}>
            <Text style={[styles.displayName, { color: isDark ? '#fff' : '#111' }]} numberOfLines={1}>
              {item.display_name || item.username}
            </Text>
          </View>
          <View style={styles.usernameRow}>
            <Text style={[styles.username, { color: isDark ? '#888' : '#666' }]} numberOfLines={1}>
              @{item.username}
            </Text>
            <View style={styles.dot} />
            <Text style={[styles.level, { color: levelColor }]}>Lv. {item.level}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [isDark, navigation]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <View style={[styles.header, { borderBottomColor: isDark ? '#222' : '#eee' }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={isDark ? '#fff' : '#111'} />
        </TouchableOpacity>
        
        <View style={[styles.searchBox, { backgroundColor: isDark ? '#111' : '#f0f0f0' }]}>
          <MaterialIcons name="search" size={20} color={isDark ? '#555' : '#888'} />
          <TextInput
            style={[styles.input, { color: isDark ? '#fff' : '#111' }]}
            placeholder={t('profile.searchUsersPlaceholder')}
            placeholderTextColor={isDark ? '#555' : '#888'}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <MaterialIcons name="close" size={18} color={isDark ? '#555' : '#888'} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading && results.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            query.trim().length === 1 && !loading ? (
              <View style={styles.centerContainer}>
                <Text style={[styles.emptyText, { color: isDark ? '#777' : '#666' }]}>
                  {t('profile.searchUsersPrompt')}
                </Text>
              </View>
            ) : query.trim().length >= 2 && !loading ? (
              <View style={styles.centerContainer}>
                <Text style={[styles.emptyText, { color: isDark ? '#555' : '#999' }]}>
                  {t('profile.searchUsersEmpty')}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 4 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 20,
    gap: 8,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 15,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontSize: 20, fontWeight: '700' },
  userInfo: {
    marginLeft: 12,
    flex: 1,
  },
  displayName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  username: {
    fontSize: 14,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#888',
    marginHorizontal: 6,
  },
  level: {
    fontSize: 12,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});

export default memo(SearchUsersScreen);
