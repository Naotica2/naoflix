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
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackNavigator } from '../../types/navigation';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../misc/AuthContext';
import { subscribeToPresence } from '../../utils/presenceSystem';

interface DMChannelItem {
  id: string;
  partner_id: string;
  partner_username: string;
  partner_display_name: string | null;
  partner_avatar: string | null;
  partner_is_vip?: boolean;
  status: string;
  is_sender: boolean;
  updated_at: string;
  last_message?: string;
  unread_count?: number;
}

function MessagesPage() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'Messages' | 'Requests'>('Messages');
  const [channels, setChannels] = useState<DMChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [presences, setPresences] = useState<Record<string, string>>({});

  const fetchChannels = useCallback(async () => {
    if (!user) return;
    try {
      // Get all channels where user is sender or receiver
      const { data, error } = await supabase
        .from('dm_channels')
        .select(`
          id, status, updated_at, sender_id, receiver_id,
          sender:profiles!dm_channels_sender_id_fkey(id, username, display_name, avatar_url, is_vip),
          receiver:profiles!dm_channels_receiver_id_fkey(id, username, display_name, avatar_url, is_vip)
        `)
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const formattedChannels: DMChannelItem[] = await Promise.all((data || []).map(async (ch: any) => {
        const isSender = ch.sender_id === user.id;
        const partner = isSender ? ch.receiver : ch.sender;
        
        let last_message = undefined;
        let unread_count = 0;
        
        try {
          const { data: msgData } = await supabase
            .from('dm_messages')
            .select('text, user_id, is_read')
            .eq('channel_id', ch.id)
            .order('created_at', { ascending: false })
            .limit(50);
            
          if (msgData && msgData.length > 0) {
            last_message = msgData[0].text;
            // Count unread in the last 50 messages
            // If is_read column doesn't exist yet, this will just be undefined.
            unread_count = msgData.filter(m => m.user_id !== user.id && m.is_read === false).length;
          }
        } catch (e) {
          // ignore if dm_messages fails or is_read column doesn't exist
        }

        return {
          id: ch.id,
          partner_id: partner.id,
          partner_username: partner.username,
          partner_display_name: partner.display_name,
          partner_avatar: partner.avatar_url,
          partner_is_vip: partner.is_vip,
          status: ch.status,
          is_sender: isSender,
          updated_at: ch.updated_at,
          last_message,
          unread_count,
        };
      }));

      const supportChannel: DMChannelItem = {
        id: 'naoflix-support',
        partner_id: 'naoflix-support',
        partner_username: 'naoflix_support',
        partner_display_name: 'NaoFlix Support',
        partner_avatar: null,
        partner_is_vip: false,
        status: 'accepted',
        is_sender: true,
        updated_at: new Date().toISOString(), // Always at the top
        last_message: 'Halo! Ada yang bisa kami bantu?',
        unread_count: 0,
      };

      setChannels([supportChannel, ...formattedChannels]);
    } catch (e) {
      console.warn('Failed to fetch DMs:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchChannels();
    }, [fetchChannels])
  );

  useEffect(() => {
    setLoading(true);
    fetchChannels();
    
    // Subscribe to changes in dm_channels
    if (!user) return;
    const channelSub = supabase
      .channel('public:dm_channels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_channels' }, () => {
        fetchChannels();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages' }, () => {
        fetchChannels();
      })
      .subscribe();

    const unsubscribePresence = subscribeToPresence((state) => {
      const currentPresences: Record<string, string> = {};
      for (const key in state) {
        const userPresences = state[key] as any[];
        if (userPresences.length > 0) {
          currentPresences[key] = userPresences[0].activity;
        }
      }
      setPresences(currentPresences);
    });

    return () => {
      supabase.removeChannel(channelSub);
      unsubscribePresence();
    };
  }, [fetchChannels, user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchChannels();
  };

  const acceptRequest = async (channelId: string) => {
    try {
      const { error } = await supabase
        .from('dm_channels')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', channelId);
      if (error) throw error;
      fetchChannels();
    } catch (e) {
      console.warn('Error accepting request:', e);
    }
  };

  const filteredChannels = channels.filter((ch) => {
    if (activeTab === 'Messages') {
      return ch.status === 'accepted' || (ch.status === 'pending' && ch.is_sender);
    } else {
      // Requests tab: pending and we are the receiver
      return ch.status === 'pending' && !ch.is_sender;
    }
  });

  if (!user) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: isDark ? '#000' : '#f8f9fa' }]}>
        <MaterialIcons name="lock-outline" size={64} color={isDark ? '#444' : '#ccc'} />
        <Text style={[styles.loginText, { color: isDark ? '#fff' : '#111' }]}>
          Silakan login untuk menggunakan DM
        </Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: DMChannelItem }) => {
    return (
      <TouchableOpacity 
        style={[styles.userCard, { borderBottomColor: isDark ? '#222' : '#eee' }]}
        activeOpacity={0.7}
        onPress={() => {
          navigation.navigate('DMChat', {
            channelId: item.id,
            receiverId: item.partner_id,
            username: item.partner_display_name || item.partner_username,
            isPending: item.status === 'pending' && !item.is_sender,
          });
        }}>
        
        <View style={[styles.avatar, { backgroundColor: isDark ? '#1a1a1a' : '#ddd', borderWidth: item.partner_is_vip ? 2 : 0, borderColor: '#f59e0b' }]}>
          {item.id === 'naoflix-support' ? (
            <MaterialIcons name="support-agent" size={28} color={isDark ? '#fff' : '#111'} />
          ) : item.partner_avatar ? (
            <Image source={{ uri: item.partner_avatar }} style={styles.avatarImg} />
          ) : (
            <Text style={[styles.avatarText, { color: isDark ? '#fff' : '#333' }]}>
              {(item.partner_display_name || item.partner_username || '?').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>

        <View style={styles.userInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.displayName, { color: item.partner_is_vip ? '#f59e0b' : (isDark ? '#fff' : '#111'), flexShrink: 1 }]} numberOfLines={1}>
              {item.partner_display_name || item.partner_username}
            </Text>
            {item.id === 'naoflix-support' && <MaterialIcons name="verified" size={14} color="#F59E0B" style={{ marginLeft: 4 }} />}
            {item.partner_is_vip && <MaterialIcons name="verified" size={14} color="#F59E0B" style={{ marginLeft: 4 }} />}
            {item.partner_is_vip && <MaterialIcons name="workspace-premium" size={14} color="#f59e0b" style={{ marginLeft: 4 }} />}
            {presences[item.partner_id] && (
              <Text style={{ fontSize: 10, color: '#3b82f6', fontWeight: 'bold', marginLeft: 6, flexShrink: 1 }} numberOfLines={1}>
                • {presences[item.partner_id]}
              </Text>
            )}
          </View>
          <Text style={[styles.username, { color: isDark ? '#888' : '#666' }]} numberOfLines={1}>
            {item.last_message ? item.last_message : `@${item.partner_username}`}
          </Text>
        </View>

        {activeTab === 'Messages' && item.status === 'accepted' && (item.unread_count || 0) > 0 && (
          <View style={{ backgroundColor: '#ef4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 }}>
            <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>{item.unread_count}</Text>
          </View>
        )}

        {activeTab === 'Requests' && !item.is_sender && (
          <TouchableOpacity 
            style={[styles.acceptBtn, { backgroundColor: '#3b82f6' }]}
            onPress={() => acceptRequest(item.id)}>
            <Text style={styles.acceptBtnText}>Terima</Text>
          </TouchableOpacity>
        )}
        {activeTab === 'Messages' && item.status === 'pending' && item.is_sender && (
          <Text style={{ fontSize: 12, color: '#f59e0b', fontWeight: 'bold' }}>Menunggu</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#f8f9fa' }]}>
      <View style={[styles.header, { 
        paddingTop: insets.top + 14,
        borderBottomColor: isDark ? '#222' : '#eee', 
        backgroundColor: isDark ? '#111' : '#fff' 
      }]}>
        <Text style={[styles.headerTitle, { color: isDark ? '#fff' : '#111' }]}>Direct Messages</Text>
      </View>

      <View style={[styles.tabs, { borderBottomColor: isDark ? '#222' : '#eee', backgroundColor: isDark ? '#111' : '#fff' }]}>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'Messages' && { borderBottomColor: isDark ? '#fff' : '#111' }]} 
          onPress={() => setActiveTab('Messages')}>
          <Text style={[
            styles.tabText, 
            { color: isDark ? '#888' : '#666' },
            activeTab === 'Messages' && { color: isDark ? '#fff' : '#111', fontWeight: '700' }
          ]}>Pesan</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'Requests' && { borderBottomColor: isDark ? '#fff' : '#111' }]} 
          onPress={() => setActiveTab('Requests')}>
          <Text style={[
            styles.tabText, 
            { color: isDark ? '#888' : '#666' },
            activeTab === 'Requests' && { color: isDark ? '#fff' : '#111', fontWeight: '700' }
          ]}>
            Permintaan {channels.filter(c => c.status === 'pending' && !c.is_sender).length > 0 && `(${channels.filter(c => c.status === 'pending' && !c.is_sender).length})`}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : (
        <FlatList
          data={filteredChannels}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
          }
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={[styles.emptyText, { color: isDark ? '#555' : '#999' }]}>
                {activeTab === 'Messages' ? 'Belum ada obrolan.' : 'Tidak ada permintaan pesan.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '800' },
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
  username: {
    fontSize: 14,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
  loginText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  },
  acceptBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  acceptBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  }
});

export default memo(MessagesPage);
