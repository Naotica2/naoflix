import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  InteractionManager,
  KeyboardAvoidingView,
  Linking,
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
import { tSync, useLanguage } from '../../misc/LanguageContext';
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
};

const COOLDOWN_MS = 5000;
const MAX_MESSAGES = 80;
const LOAD_COUNT = 40;
const FORUM_CACHE_TTL_MS = 25_000;
const CHAT_MESSAGE_COLUMNS = 'id, user_id, username, avatar_url, text, created_at';

const HIDDEN_SCREENS = new Set([
  'Video',
  'FilmPlayer',
  'ComicsReading',
  'NovelReading',
  'CbzReader',
  'ForumPage',
  'ForumComposer',
  'ForumPostDetail',
  'ForumUserFeed',
  'OfflineVideoPlayer',
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

  const avatar = msg.avatar_url ? (
    <View style={styles.avatarContainer}>
      <Image source={{ uri: msg.avatar_url }} style={styles.avatar} />
    </View>
  ) : (
    <View style={styles.avatarContainer}>
      <View style={[styles.avatar, { backgroundColor: fallbackColor }]}>
        <Text style={styles.avatarFallback}>
          {(msg.username || '?')[0].toUpperCase()}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
      {!isMe && avatar}
      <View style={[styles.msgContent, isMe && styles.msgContentMe]}>
        {!isMe && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
            <Text style={[styles.msgUser, { color: isDark ? '#8ab4f8' : '#1a73e8' }]}>
              {msg.username}
            </Text>
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
                        Linking.openURL(part).catch(() =>
                          ToastAndroid.show(tSync('common.cannotOpenLink'), ToastAndroid.SHORT),
                        );
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
      {isMe && avatar}
    </View>
  );
});


function ChatForum() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { user, profile } = useAuth();
  const { t } = useLanguage();

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
  const lastFetchedAtRef = useRef(0);

  const [isForumEnabled, setIsForumEnabled] = useState(() => DatabaseManager.getSync('enableForumChat') !== 'false');
  const [currentScreen, setCurrentScreen] = useState('');
  const currentScreenRef = useRef('');
  const revealTaskRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    const listener = DatabaseManager.listenOnValueChanged((key) => {
      if (key === 'enableForumChat') {
        setIsForumEnabled(DatabaseManager.getSync('enableForumChat') !== 'false');
      }
    });
    return () => listener.remove();
  }, []);

  useEffect(() => {
    const syncRoute = () => {
      const nextName = navigationRef.getCurrentRoute?.()?.name || '';
      if (nextName === currentScreenRef.current) return;
      const wasHidden = HIDDEN_SCREENS.has(currentScreenRef.current);
      currentScreenRef.current = nextName;
      revealTaskRef.current?.cancel();
      revealTaskRef.current = null;

      if (HIDDEN_SCREENS.has(nextName)) {
        setCurrentScreen(nextName);
      } else if (wasHidden) {
        revealTaskRef.current = InteractionManager.runAfterInteractions(() => {
          revealTaskRef.current = null;
          if (currentScreenRef.current === nextName) {
            setCurrentScreen(nextName);
          }
        });
      } else {
        setCurrentScreen(nextName);
      }
    };

    const unsubscribe = navigationRef.addListener?.('state', syncRoute);
    syncRoute();
    return () => {
      unsubscribe?.();
      revealTaskRef.current?.cancel();
      revealTaskRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) {
        clearInterval(cooldownTimer.current);
        cooldownTimer.current = null;
      }
    };
  }, []);

  const isHiddenScreen = HIDDEN_SCREENS.has(currentScreen);

  const hideForum = useCallback(() => {
    setIsOpen(false);
    DatabaseManager.set('enableForumChat', 'false');
    ToastAndroid.show(tSync('forum.hiddenToast'), ToastAndroid.LONG);
  }, []);

  const expandedPanelHeight = useMemo(
    () => Math.min(340, Math.round(screenHeight * 0.48)),
    [screenHeight],
  );

  const panelHeight = useSharedValue(0);
  const panelStyle = useAnimatedStyle(() => ({
    height: panelHeight.value,
  }));

  const togglePanel = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev;
      panelHeight.value = withTiming(next ? expandedPanelHeight : 0, { duration: 220 });
      if (next) setUnreadCount(0);
      return next;
    });
  }, [expandedPanelHeight, panelHeight]);

  useEffect(() => {
    if (!user) {
      setMessages([]);
      lastFetchedAtRef.current = 0;
      setIsOpen(false);
      panelHeight.value = 0;
    }
  }, [user, panelHeight]);

  useEffect(() => {
    if (!user || !profile || !isForumEnabled || !isOpen || isHiddenScreen) {
      return;
    }

    let cancelled = false;

    const now = Date.now();
    if (lastFetchedAtRef.current === 0 || now - lastFetchedAtRef.current >= FORUM_CACHE_TTL_MS) {
      supabase
        .from('chat_messages')
        .select(CHAT_MESSAGE_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(LOAD_COUNT)
        .then(({ data }) => {
          if (!cancelled && data) {
            lastFetchedAtRef.current = Date.now();
            setMessages((data as ChatMessage[]).slice().reverse());
          }
        });
    }

    const channel = supabase
      .channel('chat_forum')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            const updated = [...prev, newMsg];
            if (updated.length > MAX_MESSAGES) updated.shift();
            return updated;
          });
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user, profile, isForumEnabled, isOpen, isHiddenScreen]);

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
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: user.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        text: inputText.trim().slice(0, 500),
      })
      .select(CHAT_MESSAGE_COLUMNS)
      .single();

    if (!error && data) {
      lastFetchedAtRef.current = Date.now();
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

  const FAB_SIZE = 38;
  const fabX = useRef(new Animated.Value(screenWidth - FAB_SIZE - 14)).current;
  const fabY = useRef(new Animated.Value(screenHeight - insets.bottom - 122)).current;
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
    onPanResponderRelease: (_e, _g) => {
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
    if (isHiddenScreen && isOpen) {
      setIsOpen(false);
      panelHeight.value = withTiming(0, { duration: 150 });
    }
  }, [isHiddenScreen, isOpen, panelHeight]);

  const userId = user?.id ?? null;
  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);
  const renderMessageItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <ChatItem msg={item} isMe={item.user_id === userId} />
    ),
    [userId],
  );

  if (!user || !profile || isHiddenScreen || !isForumEnabled) return null;

  return (
    <>
      {!isOpen && (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.fab,
            {
              transform: [{ translateX: fabX }, { translateY: fabY }],
              backgroundColor: isDark ? '#1a73e8' : '#3b82f6',
            },
          ]}>
          <Icon name="comment" size={16} color="#fff" />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </Animated.View>
      )}

      {isOpen && (
        <View style={styles.overlay} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={togglePanel}
          />

          <Reanimated.View
            style={[
              styles.panel,
              panelStyle,
              {
                bottom: insets.bottom + 56,
                left: screenWidth > 456 ? undefined : 8,
                right: 8,
                width: screenWidth > 456 ? 440 : undefined,
                backgroundColor: isDark ? '#141418' : '#fff',
                borderColor: isDark ? '#27272f' : '#e4e4e7',
              },
            ]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <View style={[styles.panelHeader, { borderBottomColor: isDark ? '#27272f' : '#eee' }]}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="comments" size={14} color={isDark ? '#e0e0e0' : '#111'} style={{ marginRight: 6 }} />
                  <Text style={[styles.panelTitle, { color: isDark ? '#fff' : '#111' }]} numberOfLines={1}>
                    {t('forum.title')}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setIsOpen(false);
                      panelHeight.value = 0;
                      (navigationRef as any).navigate('Home', { screen: 'ForumPage' });
                    }}
                    accessibilityLabel={t('forum.openFullForum')}
                    style={styles.closeBtn}>
                    <MaterialIcons name="forum" size={18} color="#3b82f6" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={hideForum} style={styles.closeBtn}>
                    <MaterialIcons name="visibility-off" size={18} color={isDark ? '#888' : '#666'} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={togglePanel} style={styles.closeBtn}>
                    <Icon name="chevron-down" size={17} color={isDark ? '#888' : '#666'} />
                  </TouchableOpacity>
                </View>
              </View>

              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={keyExtractor}
                renderItem={renderMessageItem}
                style={{ flex: 1, paddingHorizontal: 10 }}
                contentContainerStyle={{ paddingVertical: 8 }}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                showsVerticalScrollIndicator={false}
                maxToRenderPerBatch={10}
                windowSize={7}
              />

              <View style={[styles.inputRow, { borderTopColor: isDark ? '#333' : '#eee', backgroundColor: isDark ? '#1a1a1a' : '#fff' }]}>
                <TextInput
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder={cooldownLeft > 0 ? t('forum.rateLimit', { seconds: cooldownLeft }) : t('forum.placeholder')}
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
    left: 0,
    top: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    zIndex: 999,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#ef4444',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9.5,
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
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 10,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  panelTitle: {
    flex: 1,
    fontSize: 13.5,
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
});

export default React.memo(ChatForum);
