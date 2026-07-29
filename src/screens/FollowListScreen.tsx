import React, { memo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackNavigator } from '../types/navigation';
import { supabase } from '../config/supabaseClient';
import { getLevelColor } from '../utils/LevelSystem';

type FollowListRouteProp = RouteProp<RootStackNavigator, 'FollowList'>;

interface FollowListItem {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  level: number;
}

function FollowListScreen() {
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const route = useRoute<FollowListRouteProp>();
  const { userId, initialTab } = route.params;

  const [activeTab, setActiveTab] = useState<'Followers' | 'Following'>(initialTab);
  const [users, setUsers] = useState<FollowListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, [activeTab, userId]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      if (activeTab === 'Followers') {
        const { data, error } = await supabase
          .from('follows')
          .select('profiles!follows_follower_id_fkey(id, username, display_name, avatar_url, level)')
          .eq('following_id', userId);
          
        if (error) throw error;
        setUsers(data?.map((d: any) => d.profiles).filter(Boolean) || []);
      } else {
        const { data, error } = await supabase
          .from('follows')
          .select('profiles!follows_following_id_fkey(id, username, display_name, avatar_url, level)')
          .eq('follower_id', userId);
          
        if (error) throw error;
        setUsers(data?.map((d: any) => d.profiles).filter(Boolean) || []);
      }
    } catch (e) {
      console.warn(`Failed to fetch ${activeTab}:`, e);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = useCallback(({ item }: { item: FollowListItem }) => {
    const levelColor = getLevelColor(item.level);

    return (
      <TouchableOpacity 
        style={[styles.userCard, { borderBottomColor: isDark ? '#222' : '#eee' }]}
        activeOpacity={0.7}
        onPress={() => navigation.push('UserProfile', { userId: item.id })}>
        
        <View style={[styles.avatar, { backgroundColor: isDark ? '#1a1a1a' : '#ddd' }]}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
          ) : (
            <Text style={[styles.avatarText, { color: isDark ? '#fff' : '#333' }]}>
              {(item.display_name || item.username || '?').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>

        <View style={styles.userInfo}>
          <Text style={[styles.displayName, { color: isDark ? '#fff' : '#111' }]} numberOfLines={1}>
            {item.display_name || item.username}
          </Text>
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
        <Text style={[styles.headerTitle, { color: isDark ? '#fff' : '#111' }]}>
          {activeTab === 'Followers' ? 'Pengikut' : 'Mengikuti'}
        </Text>
      </View>

      <View style={[styles.tabs, { borderBottomColor: isDark ? '#222' : '#eee' }]}>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'Followers' && { borderBottomColor: isDark ? '#fff' : '#111' }]} 
          onPress={() => setActiveTab('Followers')}>
          <Text style={[
            styles.tabText, 
            { color: isDark ? '#888' : '#666' },
            activeTab === 'Followers' && { color: isDark ? '#fff' : '#111', fontWeight: '700' }
          ]}>Pengikut</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'Following' && { borderBottomColor: isDark ? '#fff' : '#111' }]} 
          onPress={() => setActiveTab('Following')}>
          <Text style={[
            styles.tabText, 
            { color: isDark ? '#888' : '#666' },
            activeTab === 'Following' && { color: isDark ? '#fff' : '#111', fontWeight: '700' }
          ]}>Mengikuti</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={[styles.emptyText, { color: isDark ? '#555' : '#999' }]}>
                Tidak ada {activeTab === 'Followers' ? 'pengikut' : 'yang diikuti'}.
              </Text>
            </View>
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
    gap: 16,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
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
  }
});

export default memo(FollowListScreen);
