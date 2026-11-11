import React, { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  InteractionManager,
  useColorScheme,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackNavigator } from '../../types/navigation';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../misc/AuthContext';
import { tSync, useLanguage } from '../../misc/LanguageContext';
import { subscribeToPresence } from '../../utils/presenceSystem';
import {
  DMChannelItem,
  DM_INBOX_STALE_MS,
  getDmInboxCache,
  setDmInboxCache,
} from '../../utils/dmCache';
import ForumImage from '../Forum/ForumImage';

let previewRpcUnavailable = false;

function buildSupportChannel(): DMChannelItem {
  return {
    id: 'naoflix-support',
    partner_id: 'naoflix-support',
    partner_username: 'naoflix_support',
    partner_display_name: 'NaoFlix Support',
    partner_avatar: null,
    status: 'accepted',
    is_sender: true,
    updated_at: new Date().toISOString(),
    last_message: tSync('messages.supportDefaultLastMsg'),
    unread_count: 0,
  };
}

const DMChannelRow = memo(function DMChannelRow({
  item,
  presence,
  activeTab,
  isDark,
  acceptLabel,
  waitingLabel,
  onPressItem,
  onAcceptRequest,
}: {
  item: DMChannelItem;
  presence?: string;
  activeTab: 'Messages' | 'Requests';
  isDark: boolean;
  acceptLabel: string;
  waitingLabel: string;
  onPressItem: (item: DMChannelItem) => void;
  onAcceptRequest: (channelId: string) => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.userCard, { borderBottomColor: isDark ? '#222' : '#eee' }]}
      activeOpacity={0.7}
      onPress={() => onPressItem(item)}>
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: isDark ? '#1a1a1a' : '#ddd',
          },
        ]}>
        {item.id === 'naoflix-support' ? (
          <MaterialIcons name="support-agent" size={28} color={isDark ? '#fff' : '#111'} />
        ) : item.partner_avatar ? (
          <ForumImage
            uri={item.partner_avatar}
            recyclingKey={item.partner_avatar}
            style={styles.avatarImg}
          />
        ) : (
          <Text style={[styles.avatarText, { color: isDark ? '#fff' : '#333' }]}>
            {(item.partner_display_name || item.partner_username || '?').charAt(0).toUpperCase()}
          </Text>
        )}
      </View>

      <View style={styles.userInfo}>
        <View style={styles.nameRow}>
          <Text
            style={[
              styles.displayName,
              {
                color: isDark ? '#fff' : '#111',
                flexShrink: 1,
              },
            ]}
            numberOfLines={1}>
            {item.partner_display_name || item.partner_username}
          </Text>
          {item.id === 'naoflix-support' && (
            <MaterialIcons name="verified" size={14} color="#3b82f6" style={{ marginLeft: 4 }} />
          )}
          {presence ? (
            <Text style={styles.presenceText} numberOfLines={1}>
              • {presence}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.username, { color: isDark ? '#888' : '#666' }]} numberOfLines={1}>
          {item.last_message ? item.last_message : `@${item.partner_username}`}
        </Text>
      </View>

      {activeTab === 'Messages' && item.status === 'accepted' && (item.unread_count || 0) > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
        </View>
      )}

      {activeTab === 'Requests' && !item.is_sender && (
        <TouchableOpacity
          style={[styles.acceptBtn, { backgroundColor: '#3b82f6' }]}
          onPress={() => onAcceptRequest(item.id)}>
          <Text style={styles.acceptBtnText}>{acceptLabel}</Text>
        </TouchableOpacity>
      )}
      {activeTab === 'Messages' && item.status === 'pending' && item.is_sender && (
        <Text style={styles.pendingLabel}>{waitingLabel}</Text>
      )}
    </TouchableOpacity>
  );
});

function MessagesPage() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const isFocused = useIsFocused();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<'Messages' | 'Requests'>('Messages');
  const [channels, setChannels] = useState<DMChannelItem[]>(() =>
    user?.id ? getDmInboxCache(user.id)?.items || [] : [],
  );
  const [loading, setLoading] = useState(() =>
    user?.id ? !getDmInboxCache(user.id) : false,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [presences, setPresences] = useState<Record<string, string>>({});

  const fetchingRef = useRef(false);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchChannels = useCallback(
    async (force = false) => {
      if (!user) return;
      const cached = getDmInboxCache(user.id);
      if (!force && cached && !cached.dirty && Date.now() - cached.fetchedAt < DM_INBOX_STALE_MS) {
        setChannels(prev => (prev === cached.items ? prev : cached.items));
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (fetchingRef.current) return;
      fetchingRef.current = true;
      try {
        let formattedChannels: DMChannelItem[] | null = null;

        if (!previewRpcUnavailable) {
          try {
            const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)(
              'get_dm_channel_previews',
            );
            if (rpcErr) {
              const msg = String(rpcErr.message || '').toLowerCase();
              if (
                rpcErr.code === '42883' ||
                rpcErr.code === 'PGRST202' ||
                msg.includes('get_dm_channel_previews')
              ) {
                previewRpcUnavailable = true;
              }
            } else if (Array.isArray(rpcData)) {
              formattedChannels = rpcData.map((row: any) => ({
                id: row.id,
                partner_id: row.partner_id,
                partner_username: row.partner_username,
                partner_display_name: row.partner_display_name,
                partner_avatar: row.partner_avatar,
                status: row.status,
                is_sender: Boolean(row.is_sender),
                updated_at: row.updated_at,
                last_message: row.last_message ?? undefined,
                unread_count: Number(row.unread_count) || 0,
              }));
            }
          } catch {}
        }

        if (formattedChannels === null) {
          const { data, error } = await supabase
            .from('dm_channels')
            .select(`
              id, status, updated_at, sender_id, receiver_id,
              sender:profiles!dm_channels_sender_id_fkey(id, username, display_name, avatar_url),
              receiver:profiles!dm_channels_receiver_id_fkey(id, username, display_name, avatar_url)
            `)
            .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
            .order('updated_at', { ascending: false })
            .limit(50);

          if (error) throw error;

          const rawList = data || [];
          const channelIds = rawList.map((ch: any) => ch.id).filter(Boolean);
          const lastMsgByChannel = new Map<string, string>();
          const unreadByChannel = new Map<string, number>();

          if (channelIds.length > 0) {
            const batchLimit = Math.min(Math.max(channelIds.length * 4, 40), 200);
            const [unreadRes, recentMsgsRes] = await Promise.all([
              supabase
                .from('dm_messages')
                .select('channel_id')
                .in('channel_id', channelIds)
                .eq('is_read', false)
                .neq('user_id', user.id)
                .limit(500),
              supabase
                .from('dm_messages')
                .select('channel_id, text, created_at')
                .in('channel_id', channelIds)
                .order('created_at', { ascending: false })
                .limit(batchLimit),
            ]);

            if (!unreadRes.error && unreadRes.data) {
              for (const row of unreadRes.data) {
                unreadByChannel.set(
                  row.channel_id,
                  (unreadByChannel.get(row.channel_id) || 0) + 1,
                );
              }
            }

            const recentRows =
              !recentMsgsRes.error && recentMsgsRes.data ? recentMsgsRes.data : [];
            for (const row of recentRows) {
              if (!lastMsgByChannel.has(row.channel_id)) {
                lastMsgByChannel.set(row.channel_id, row.text);
              }
            }

            if (recentRows.length >= batchLimit) {
              const missingIds = channelIds
                .filter((id: string) => !lastMsgByChannel.has(id))
                .slice(0, 5);
              if (missingIds.length > 0) {
                await Promise.all(
                  missingIds.map(async (cid: string) => {
                    try {
                      const { data: singleMsg } = await supabase
                        .from('dm_messages')
                        .select('text')
                        .eq('channel_id', cid)
                        .order('created_at', { ascending: false })
                        .limit(1);
                      if (singleMsg && singleMsg[0]) {
                        lastMsgByChannel.set(cid, singleMsg[0].text);
                      }
                    } catch {}
                  }),
                );
              }
            }
          }

          formattedChannels = rawList
            .map((ch: any) => {
              const isSender = ch.sender_id === user.id;
              const partner = isSender ? ch.receiver : ch.sender;
              if (!partner) return null;

              return {
                id: ch.id,
                partner_id: partner.id,
                partner_username: partner.username,
                partner_display_name: partner.display_name,
                partner_avatar: partner.avatar_url,
                status: ch.status,
                is_sender: isSender,
                updated_at: ch.updated_at,
                last_message: lastMsgByChannel.get(ch.id),
                unread_count: unreadByChannel.get(ch.id) || 0,
              } as DMChannelItem;
            })
            .filter(Boolean) as DMChannelItem[];
        }

        const nextList = [buildSupportChannel(), ...formattedChannels];
        setDmInboxCache(user.id, nextList);
        setChannels(nextList);
      } catch (e) {
        console.warn('Failed to fetch DMs:', e);
      } finally {
        fetchingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (!user || !isFocused) {
      if (realtimeTimerRef.current) {
        clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let channelSub: ReturnType<typeof supabase.channel> | null = null;
    let unsubscribePresence: (() => void) | null = null;

    const scheduleRefresh = () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = setTimeout(() => {
        fetchChannels(true);
      }, 500);
    };

    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      fetchChannels(false);

      channelSub = supabase
        .channel(`dm_inbox_${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'dm_channels', filter: `sender_id=eq.${user.id}` },
          scheduleRefresh,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'dm_channels', filter: `receiver_id=eq.${user.id}` },
          scheduleRefresh,
        )
        .subscribe();

      unsubscribePresence = subscribeToPresence(state => {
        const currentPresences: Record<string, string> = {};
        for (const key in state) {
          const userPresences = state[key] as any[];
          if (userPresences.length > 0) {
            currentPresences[key] = userPresences[0].activity;
          }
        }
        setPresences(currentPresences);
      });
    });

    return () => {
      cancelled = true;
      task.cancel();
      if (realtimeTimerRef.current) {
        clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = null;
      }
      if (channelSub) supabase.removeChannel(channelSub);
      if (unsubscribePresence) unsubscribePresence();
    };
  }, [fetchChannels, user, isFocused]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchChannels(true);
  }, [fetchChannels]);

  const acceptRequest = useCallback(
    async (channelId: string) => {
      try {
        const { error } = await supabase
          .from('dm_channels')
          .update({ status: 'accepted', updated_at: new Date().toISOString() })
          .eq('id', channelId);
        if (error) throw error;
        fetchChannels(true);
      } catch (e) {
        console.warn('Error accepting request:', e);
      }
    },
    [fetchChannels],
  );

  const handlePressItem = useCallback(
    (item: DMChannelItem) => {
      navigation.navigate('DMChat', {
        channelId: item.id,
        receiverId: item.partner_id,
        username: item.partner_display_name || item.partner_username,
        partnerAvatar: item.partner_avatar,
        isPending: item.status === 'pending' && !item.is_sender,
      });
    },
    [navigation],
  );

  const requestCount = useMemo(
    () => channels.filter(c => c.status === 'pending' && !c.is_sender).length,
    [channels],
  );

  const filteredChannels = useMemo(
    () =>
      channels.filter(ch => {
        if (activeTab === 'Messages') {
          return ch.status === 'accepted' || (ch.status === 'pending' && ch.is_sender);
        }
        return ch.status === 'pending' && !ch.is_sender;
      }),
    [channels, activeTab],
  );

  const acceptLabel = t('messages.accept');
  const waitingLabel = t('messages.pending');

  const keyExtractor = useCallback((item: DMChannelItem) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: DMChannelItem }) => (
      <DMChannelRow
        item={item}
        presence={presences[item.partner_id]}
        activeTab={activeTab}
        isDark={isDark}
        acceptLabel={acceptLabel}
        waitingLabel={waitingLabel}
        onPressItem={handlePressItem}
        onAcceptRequest={acceptRequest}
      />
    ),
    [presences, activeTab, isDark, acceptLabel, waitingLabel, handlePressItem, acceptRequest],
  );

  if (!user) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: isDark ? '#000' : '#f8f9fa' }]}>
        <MaterialIcons name="lock-outline" size={64} color={isDark ? '#444' : '#ccc'} />
        <Text style={[styles.loginText, { color: isDark ? '#fff' : '#111', textAlign: 'center' }]}>
          {t('messages.loginRequired')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#f8f9fa' }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 14,
            borderBottomColor: isDark ? '#222' : '#eee',
            backgroundColor: isDark ? '#111' : '#fff',
          },
        ]}>
        <Text style={[styles.headerTitle, { color: isDark ? '#fff' : '#111' }]}>
          {t('messages.title')}
        </Text>
      </View>

      <View
        style={[
          styles.tabs,
          { borderBottomColor: isDark ? '#222' : '#eee', backgroundColor: isDark ? '#111' : '#fff' },
        ]}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'Messages' && { borderBottomColor: isDark ? '#fff' : '#111' }]}
          onPress={() => setActiveTab('Messages')}>
          <Text
            style={[
              styles.tabText,
              { color: isDark ? '#888' : '#666' },
              activeTab === 'Messages' && { color: isDark ? '#fff' : '#111', fontWeight: '700' },
            ]}>
            {t('messages.title')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'Requests' && { borderBottomColor: isDark ? '#fff' : '#111' }]}
          onPress={() => setActiveTab('Requests')}>
          <Text
            style={[
              styles.tabText,
              { color: isDark ? '#888' : '#666' },
              activeTab === 'Requests' && { color: isDark ? '#fff' : '#111', fontWeight: '700' },
            ]}>
            {t('messages.tabRequests')} {requestCount > 0 ? `(${requestCount})` : ''}
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
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={5}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
          }
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={[styles.emptyText, { color: isDark ? '#555' : '#999' }]}>
                {activeTab === 'Messages'
                  ? t('messages.noConversations')
                  : t('messages.noRequests')}
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  displayName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  presenceText: {
    fontSize: 10,
    color: '#3b82f6',
    fontWeight: 'bold',
    marginLeft: 6,
    flexShrink: 1,
  },
  username: {
    fontSize: 14,
  },
  unreadBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  pendingLabel: {
    fontSize: 12,
    color: '#f59e0b',
    fontWeight: 'bold',
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
  },
});

export default memo(MessagesPage);
