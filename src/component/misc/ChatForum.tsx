import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Icon from '@react-native-vector-icons/fontawesome';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../misc/AuthContext';
import { navigationRef } from '../../misc/NavigationService';
import { DatabaseManager } from '../../utils/DatabaseManager';
import { RealtimeChannel } from '@supabase/supabase-js';

type ChatMessage = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  text: string;
  created_at: string;
  profiles?: { is_vip: boolean };
};

const COOLDOWN_MS = 5000;
const MAX_MESSAGES = 100;
const LOAD_COUNT = 50;

const HIDDEN_SCREENS = new Set([
  'Video', 'FilmPlayer', 'ComicsReading', 'NovelReading', 'CbzReader',
]);

const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/u;

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function hasEmoji(text: string): boolean {
  return EMOJI_RE.test(text);
}


const ChatItem = React.memo(function ChatItem({ msg, isMe }: { msg: ChatMessage; isMe: boolean }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const emojiOnly = useMemo(
    () => hasEmoji(msg.text) && msg.text.replace(EMOJI_RE, '').trim().length === 0,
    [msg.text],
  );

  const fallbackColor = useMemo(() => {
    const colors = ['#e57373', '#64b5f6', '#81c784', '#ffb74d', '#ba68c8', '#4db6ac', '#f06292', '#7986cb'];
    let hash = 0;
    for (let i = 0; i < (msg.username || '').length; i++) hash = msg.username.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }, [msg.username]);

  const isUserVip = msg.profiles?.is_vip === true;

  const avatar = msg.avatar_url ? (
    <View style={styles.avatarContainer}>
      <Image source={{ uri: msg.avatar_url }} style={[styles.avatar, isUserVip && styles.avatarVIP]} />
      {isUserVip && (
        <View style={styles.vipBadgeContainerSmall}>
          <MaterialIcons name="workspace-premium" size={10} color="#FFD700" />
        </View>
      )}
    </View>
  ) : (
    <View style={styles.avatarContainer}>
      <View style={[styles.avatar, { backgroundColor: fallbackColor }, isUserVip && styles.avatarVIP]}>
        <Text style={styles.avatarFallback}>
          {(msg.username || '?')[0].toUpperCase()}
        </Text>
      </View>
      {isUserVip && (
        <View style={styles.vipBadgeContainerSmall}>
          <MaterialIcons name="workspace-premium" size={10} color="#FFD700" />
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
      {/* Avatar for others (left side) */}
      {!isMe && avatar}
      <View style={[styles.msgContent, isMe && styles.msgContentMe]}>
        {!isMe && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
            <Text style={[styles.msgUser, { color: isDark ? '#8ab4f8' : '#1a73e8' }, isUserVip && styles.usernameVIP]}>
              {msg.username}
            </Text>
            {isUserVip && <MaterialIcons name="verified" size={12} color="#F59E0B" style={{ marginLeft: 4 }} />}
          </View>
        )}
        <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
          {emojiOnly ? (
            <Text style={[styles.msgText, styles.msgEmojiOnly]}>
              {msg.text}
            </Text>
          ) : (
            <Text style={styles.msgText}>
              {msg.text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
                if (part.match(/(https?:\/\/[^\s]+)/)) {
                  return (
                    <Text 
                      key={i} 
                      style={{ textDecorationLine: 'underline', color: isMe ? '#e0e0e0' : '#3b82f6' }}
                      onPress={() => {
                        import('react-native').then(({ Linking, ToastAndroid }) => {
                          Linking.openURL(part).catch(() => ToastAndroid.show('Tidak dapat membuka link', ToastAndroid.SHORT));
                        });
                      }}
                    >
                      {part}
                    </Text>
                  );
                }
                return <Text key={i}>{part}</Text>;
              })}
            </Text>
          )}
        </View>
        <Text style={[styles.msgTime, { color: isDark ? '#666' : '#999' }, isMe && styles.msgTimeMe]}>
          {formatTime(msg.created_at)}
        </Text>
      </View>
      {/* Avatar for me (right side) */}
      {isMe && avatar}
    </View>
  );
});


export default function ChatForum() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isSending, setIsSending] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSendTime = useRef(0);

  const [isForumEnabled, setIsForumEnabled] = useState(() => DatabaseManager.getSync('enableForumChat') !== 'false');

  useEffect(() => {
    const listener = DatabaseManager.listenOnValueChanged((key) => {
      if (key === 'enableForumChat') {
        setIsForumEnabled(DatabaseManager.getSync('enableForumChat') !== 'false');
      }
    });
    return () => listener.remove();
  }, []);

  const hideForum = useCallback(() => {
    setIsOpen(false);
    DatabaseManager.set('enableForumChat', 'false');
    ToastAndroid.show('Forum disembunyikan. Kamu bisa membukanya kembali di Pengaturan.', ToastAndroid.LONG);
  }, []);

  const panelHeight = useSharedValue(0);
  const panelStyle = useAnimatedStyle(() => ({
    height: panelHeight.value,
  }));

  const togglePanel = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev;
      panelHeight.value = withTiming(next ? 420 : 0, { duration: 250 });
      if (next) setUnreadCount(0);
      return next;
    });
  }, [panelHeight]);

  useEffect(() => {
    if (!user) return;

    supabase
      .from('chat_messages')
      .select('*, profiles(is_vip)')
      .order('created_at', { ascending: false })
      .limit(LOAD_COUNT)
      .then(({ data }) => {
        if (data) setMessages(data.reverse() as ChatMessage[]);
      });

    const channel = supabase
      .channel('chat_forum')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          if (newMsg.user_id === user.id) {
            newMsg.profiles = { is_vip: profile?.is_vip || false };
          }
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            
            const updated = [...prev, newMsg];
            if (updated.length > MAX_MESSAGES) updated.shift();
            return updated;
          });
          if (!isOpen && newMsg.user_id !== user.id) {
            setUnreadCount(prev => prev + 1);
          }
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (isOpen) setUnreadCount(0);
  }, [isOpen]);

  const startCooldown = useCallback(() => {
    lastSendTime.current = Date.now();
    setCooldownLeft(COOLDOWN_MS / 1000);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      const elapsed = Date.now() - lastSendTime.current;
      const remaining = Math.max(0, COOLDOWN_MS - elapsed);
      setCooldownLeft(Math.ceil(remaining / 1000));
      if (remaining <= 0 && cooldownTimer.current) {
        clearInterval(cooldownTimer.current);
        cooldownTimer.current = null;
      }
    }, 200);
  }, []);

  const handleSend = useCallback(async () => {
    if (!user || !profile || !inputText.trim()) return;
    if (Date.now() - lastSendTime.current < COOLDOWN_MS) return;
    if (isSending) return;

    setIsSending(true);
    const { data, error } = await supabase.from('chat_messages').insert({
      user_id: user.id,
      username: profile.username,
      avatar_url: profile.avatar_url,
      text: inputText.trim().slice(0, 500), // max 500 chars
    }).select('*, profiles(is_vip)').single();

    if (!error && data) {
      setMessages(prev => {
        if (prev.some(m => m.id === data.id)) return prev;
        const updated = [...prev, data as ChatMessage];
        if (updated.length > MAX_MESSAGES) updated.shift();
        return updated;
      });
      setInputText('');
      startCooldown();
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
    setIsSending(false);
  }, [user, profile, inputText, isSending, startCooldown]);

  const canSend = inputText.trim().length > 0 && cooldownLeft === 0 && !isSending;

  const [currentScreen, setCurrentScreen] = useState('');
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const FAB_SIZE = 50;
  const fabX = useRef(new Animated.Value(screenWidth - FAB_SIZE - 16)).current;
  const fabY = useRef(new Animated.Value(screenHeight - insets.bottom - 120)).current;
  const didDragRef = useRef(false);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
    onPanResponderGrant: () => {
      didDragRef.current = false;
      fabX.setOffset((fabX as any)._value);
      fabY.setOffset((fabY as any)._value);
      fabX.setValue(0);
      fabY.setValue(0);
    },
    onPanResponderMove: (_e, g) => {
      if (Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5) didDragRef.current = true;
      fabX.setValue(g.dx);
      fabY.setValue(g.dy);
    },
    onPanResponderRelease: (_e, g) => {
      fabX.flattenOffset();
      fabY.flattenOffset();

      if (!didDragRef.current) {
        togglePanel();
        return;
      }

      const currentX = (fabX as any)._value;
      const currentY = (fabY as any)._value;
      const targetX = currentX < screenWidth / 2 ? 8 : screenWidth - FAB_SIZE - 8;
      const clampedY = Math.max(insets.top + 40, Math.min(currentY, screenHeight - insets.bottom - FAB_SIZE - 16));

      Animated.parallel([
        Animated.spring(fabX, { toValue: targetX, useNativeDriver: true, friction: 7 }),
        Animated.spring(fabY, { toValue: clampedY, useNativeDriver: true, friction: 7 }),
      ]).start();
    },
  }), [screenWidth, screenHeight, insets.top, insets.bottom, togglePanel, fabX, fabY]);

  useEffect(() => {
    const unsubscribe = navigationRef.addListener?.('state', () => {
      const route = navigationRef.getCurrentRoute?.();
      setCurrentScreen(route?.name || '');
    });
    const route = navigationRef.getCurrentRoute?.();
    setCurrentScreen(route?.name || '');
    return () => { unsubscribe?.(); };
  }, []);

  const isHiddenScreen = HIDDEN_SCREENS.has(currentScreen);

  useEffect(() => {
    if (isHiddenScreen && isOpen) {
      setIsOpen(false);
      panelHeight.value = withTiming(0, { duration: 150 });
    }
  }, [isHiddenScreen, isOpen, panelHeight]);

  if (!user || !profile || isHiddenScreen || !isForumEnabled) return null;

  return (
    <>
      {/* Draggable Floating Chat Button */}
      {!isOpen && (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.fab,
            {
              left: fabX,
              top: fabY,
              right: undefined,
              bottom: undefined,
              backgroundColor: isDark ? '#1a73e8' : '#3b82f6',
            },
          ]}>
          <Icon name="comment" size={22} color="#fff" />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </Animated.View>
      )}

      {/* Chat Panel Overlay */}
      {isOpen && (
        <View style={styles.overlay} pointerEvents="box-none">
          {/* Backdrop */}
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={togglePanel}
          />

          {/* Panel */}
          <Reanimated.View
            style={[
              styles.panel,
              panelStyle,
              {
                bottom: insets.bottom + 60,
                backgroundColor: isDark ? '#1a1a1a' : '#fff',
                borderColor: isDark ? '#333' : '#ddd',
              },
            ]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              {/* Header */}
              <View style={[styles.panelHeader, { borderBottomColor: isDark ? '#333' : '#eee' }]}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="comments" size={16} color={isDark ? '#e0e0e0' : '#111'} style={{ marginRight: 6 }} />
                  <Text style={[styles.panelTitle, { color: isDark ? '#fff' : '#111' }]}>Live Forum</Text>
                </View>
                
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={hideForum} style={styles.closeBtn}>
                    <MaterialIcons name="visibility-off" size={20} color={isDark ? '#888' : '#666'} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={togglePanel} style={styles.closeBtn}>
                    <Icon name="chevron-down" size={20} color={isDark ? '#888' : '#666'} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Messages */}
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <ChatItem msg={item} isMe={item.user_id === user.id} />
                )}
                style={{ flex: 1, paddingHorizontal: 10 }}
                contentContainerStyle={{ paddingVertical: 8 }}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                showsVerticalScrollIndicator={false}
                maxToRenderPerBatch={10}
                windowSize={7}
              />

              {/* Input */}
              <View style={[styles.inputRow, { borderTopColor: isDark ? '#333' : '#eee', backgroundColor: isDark ? '#1a1a1a' : '#fff' }]}>
                <TextInput
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder={cooldownLeft > 0 ? `Tunggu ${cooldownLeft}s...` : 'Ketik pesan...'}
                  placeholderTextColor={isDark ? '#666' : '#999'}
                  editable={cooldownLeft === 0}
                  maxLength={500}
                  multiline
                  style={[
                    styles.textInput,
                    {
                      color: isDark ? '#eee' : '#222',
                      backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
                      borderColor: isDark ? '#444' : '#ddd',
                    },
                  ]}
                />
                <TouchableOpacity
                  onPress={handleSend}
                  disabled={!canSend}
                  style={[styles.sendBtn, { backgroundColor: canSend ? '#3b82f6' : (isDark ? '#333' : '#ccc') }]}>
                  <Icon name="send" size={16} color={canSend ? '#fff' : '#888'} />
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </Reanimated.View>
        </View>
      )}
    </>
  );
}


const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    zIndex: 999,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  panel: {
    position: 'absolute',
    left: 8,
    right: 8,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 10,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  panelTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 8,
    maxWidth: '90%',
    alignItems: 'flex-end',
    gap: 6,
  },
  msgRowMe: {
    alignSelf: 'flex-end',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallback: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  msgContent: {
    flexShrink: 1,
  },
  msgContentMe: {
    alignItems: 'flex-end',
  },
  msgUser: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
    marginLeft: 4,
  },
  msgBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  msgBubbleOther: {
    backgroundColor: '#f0f0f0',
    borderBottomLeftRadius: 4,
  },
  msgBubbleMe: {
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 4,
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#222',
  },
  msgEmojiOnly: {
    fontSize: 28,
    lineHeight: 34,
  },
  msgTime: {
    fontSize: 10,
    marginTop: 2,
    marginLeft: 4,
  },
  msgTimeMe: {
    marginRight: 4,
    marginLeft: 0,
    textAlign: 'right',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 80,
    borderWidth: 1,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarVIP: {
    borderColor: '#F59E0B',
    borderWidth: 1.5,
  },
  vipBadgeContainerSmall: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#111',
    borderRadius: 6,
    padding: 2,
    borderWidth: 0.5,
    borderColor: '#F59E0B',
  },
  usernameVIP: {
    color: '#F59E0B',
    fontWeight: '800',
  }
});
