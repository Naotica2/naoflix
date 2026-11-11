import React, { useState, useRef } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@react-native-vector-icons/fontawesome';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { useAuth } from '../../misc/AuthContext';
import { tSync, useLanguage } from '../../misc/LanguageContext';
import { WatchPartyParticipant } from '../../hooks/useWatchParty';

const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/u;
function isEmojiOnly(text: string): boolean {
  return EMOJI_RE.test(text) && text.replace(EMOJI_RE, '').trim().length === 0;
}

interface ChatMessage {
  id: string;
  senderId?: string;
  sender: string;
  text: string;
  isSystem?: boolean;
  replyTo?: {
    senderId?: string;
    sender: string;
    text: string;
  };
}

export interface Props {
  roomId: string;
  isHost: boolean;
  isFullscreen: boolean;
  isDark: boolean;
  participants: WatchPartyParticipant[];
  chatMessages: ChatMessage[];
  broadcastChat: (msg: ChatMessage) => void;
  onInvitePress?: () => void;
  onLeaveRoom?: () => void;
}

export default function NobarChatSection({
  roomId,
  isHost,
  isFullscreen,
  isDark,
  participants,
  chatMessages,
  broadcastChat,
  onInvitePress,
  onLeaveRoom,
}: Props) {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = () => {
    if (!inputText.trim()) return;

    const newMsg: ChatMessage = {
      id: Math.random().toString(),
      senderId: user?.id,
      sender: profile?.display_name || profile?.username || user?.user_metadata?.username || t('common.guest'),
      text: inputText.trim(),
      replyTo: replyingTo
        ? {
            senderId: replyingTo.senderId,
            sender: replyingTo.sender,
            text: replyingTo.text,
          }
        : undefined,
    };

    broadcastChat(newMsg);

    setInputText('');
    setReplyingTo(null);
  };

  const confirmLeaveRoom = () => {
    if (!onLeaveRoom) return;
    Alert.alert(
      t('nobar.leaveConfirmTitle'),
      isHost ? t('nobar.closeRoomConfirmDesc') : t('nobar.leaveConfirmDesc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: isHost ? t('nobar.closeRoomBtnShort') : t('nobar.leaveBtnShort'),
          style: 'destructive',
          onPress: onLeaveRoom,
        },
      ],
    );
  };

  if (isFullscreen) {
    const recentMessages = chatMessages.slice(-5);
    if (recentMessages.length === 0) return null;

    return (
      <View style={styles.overlayContainer} pointerEvents="none">
        {recentMessages.map(item => (
          <View key={item.id} style={styles.overlayMsg}>
            {item.isSystem ? (
              <Text style={styles.overlaySystemText}>{item.text}</Text>
            ) : (
              <Text style={styles.overlayText}>
                <Text style={{ fontWeight: 'bold' }}>{item.sender}: </Text>
                {item.text}
              </Text>
            )}
          </View>
        ))}
      </View>
    );
  }

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    if (item.isSystem) {
      return (
        <View style={styles.systemBubble}>
          <Text style={{ color: isDark ? '#ffd700' : '#d97706', fontSize: 12, fontStyle: 'italic' }}>
            {item.text}
          </Text>
        </View>
      );
    }

    const isMe = item.senderId === user?.id;
    const emojiOnly = isEmojiOnly(item.text);
    const participant = participants.find(p => p.id === item.senderId);
    const prevMsg = index > 0 ? chatMessages[index - 1] : null;
    const showAvatar = !isMe && (!prevMsg || prevMsg.senderId !== item.senderId || prevMsg.isSystem);

    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowThem]}>
        {!isMe && (
          <View style={styles.avatarSlot}>
            {showAvatar ? (
              <View style={{ position: 'relative' }}>
                {participant?.avatar_url ? (
                  <Image source={{ uri: participant.avatar_url }} style={styles.miniAvatar} />
                ) : (
                  <View
                    style={[
                      styles.miniAvatar,
                      styles.miniAvatarPlaceholder,
                      { backgroundColor: isDark ? '#333' : '#ddd' },
                    ]}
                  >
                    <Text style={{ color: isDark ? '#aaa' : '#666', fontSize: 11, fontWeight: '700' }}>
                      {(item.sender || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>
        )}

        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={() => {
            if (isMe) {
              Alert.alert(t('common.confirm'), undefined, [
                { text: t('comments.reply'), onPress: () => setReplyingTo(item) },
                { text: t('common.cancel'), style: 'cancel' },
              ]);
            } else {
              setReplyingTo(item);
            }
          }}
          style={[
            styles.messageBubble,
            isMe
              ? { backgroundColor: '#3b82f6', borderBottomRightRadius: 4 }
              : { backgroundColor: isDark ? '#1c1c1e' : '#e5e7eb', borderBottomLeftRadius: 4 },
            emojiOnly && { backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 },
          ]}
        >
          {!isMe && !emojiOnly && showAvatar && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
              <Text style={[styles.senderName, { color: isDark ? '#a78bfa' : '#6d28d9', marginBottom: 0 }]}>
                {item.sender}
              </Text>
            </View>
          )}

          {item.replyTo && !emojiOnly && (
            <View
              style={[
                styles.replyBox,
                {
                  backgroundColor: isMe
                    ? 'rgba(0,0,0,0.15)'
                    : isDark
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(0,0,0,0.05)',
                },
              ]}
            >
              <Text style={[styles.replyUser, { color: isMe ? 'rgba(255,255,255,0.8)' : '#3b82f6' }]} numberOfLines={1}>
                {item.replyTo.sender}
              </Text>
              <Text
                style={[styles.replyText, { color: isMe ? 'rgba(255,255,255,0.7)' : isDark ? '#999' : '#555' }]}
                numberOfLines={1}
              >
                {item.replyTo.text}
              </Text>
            </View>
          )}

          {emojiOnly ? (
            <Text
              style={[
                styles.messageText,
                { color: isMe ? '#fff' : isDark ? '#f0f0f0' : '#111' },
                { fontSize: 40, lineHeight: 48 },
              ]}
            >
              {item.text}
            </Text>
          ) : (
            <Text style={[styles.messageText, { color: isMe ? '#fff' : isDark ? '#f0f0f0' : '#111' }]}>
              {item.text.split(/(https?:\/\/[^\s]+|(?:naoflix|aniflix):\/\/[^\s]+)/g).map((part, i) => {
                if (part.match(/^(?:https?:\/\/|(?:naoflix|aniflix):\/\/)[^\s]+/)) {
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
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0f0f0f' : '#fafafa' }]}>
      <View
        style={[
          styles.participantHeader,
          { borderBottomColor: isDark ? '#27272a' : '#e5e7eb' },
        ]}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.headerLeftGroup}>
            <MaterialIcons name="groups" size={18} color={isDark ? '#fff' : '#000'} />
            <Text style={[styles.roomCodeText, { color: isDark ? '#fff' : '#000' }]}>
              {roomId}
            </Text>
            <View
              style={[
                styles.countPill,
                { backgroundColor: isDark ? '#27272a' : '#e5e7eb' },
              ]}
            >
              <Icon name="user" size={10} color={isDark ? '#d4d4d8' : '#4b5563'} />
              <Text style={[styles.countPillText, { color: isDark ? '#d4d4d8' : '#4b5563' }]}>
                {t('nobar.participantsCount', { count: participants.length })}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            {isHost && onInvitePress && (
              <TouchableOpacity onPress={onInvitePress} style={styles.inviteBtn} activeOpacity={0.8}>
                <Icon name="user-plus" size={12} color="#fff" />
                <Text style={styles.inviteBtnText}>{t('nobar.inviteFriendsBtn')}</Text>
              </TouchableOpacity>
            )}
            {onLeaveRoom && (
              <TouchableOpacity
                onPress={confirmLeaveRoom}
                style={[
                  styles.leaveBtn,
                  {
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.16)' : '#fee2e2',
                    borderColor: isDark ? 'rgba(239, 68, 68, 0.45)' : '#fca5a5',
                  },
                ]}
                activeOpacity={0.8}
              >
                <MaterialIcons name="exit-to-app" size={13} color="#ef4444" />
                <Text style={styles.leaveBtnText}>
                  {isHost ? t('nobar.closeRoomBtnShort') : t('nobar.leaveBtnShort')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {participants.length > 0 && (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={participants}
            keyExtractor={p => p.id}
            style={{ marginTop: 8 }}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.participantChip,
                  { backgroundColor: isDark ? '#18181b' : '#f3f4f6' },
                ]}
              >
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitial}>
                      {(item.username?.[0] || '?').toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text
                  style={[styles.participantName, { color: isDark ? '#e4e4e7' : '#1f2937' }]}
                  numberOfLines={1}
                >
                  {item.username}
                </Text>
                {item.isHost && (
                  <View style={styles.hostBadge}>
                    <Text style={styles.hostBadgeText}>{t('nobar.hostBadge')}</Text>
                  </View>
                )}
              </View>
            )}
          />
        )}

        {!isHost && (
          <Text style={[styles.syncNoteText, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
            {t('nobar.hostSyncNote')}
          </Text>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={chatMessages}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.chatList,
          chatMessages.length === 0 && { flexGrow: 1, justifyContent: 'center' },
        ]}
        onContentSizeChange={() => {
          if (chatMessages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: true });
          }
        }}
        ListEmptyComponent={
          <Text style={[styles.emptyChatText, { color: isDark ? '#71717a' : '#9ca3af' }]}>
            {t('nobar.emptyChat')}
          </Text>
        }
        renderItem={renderMessage}
      />

      {replyingTo && (
        <View
          style={[
            styles.replyBanner,
            {
              backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
              borderTopColor: isDark ? '#222' : '#e0e0e0',
            },
          ]}
        >
          <View style={styles.replyBannerContent}>
            <Text style={[styles.replyUser, { color: '#3b82f6' }]}>
              {t('comments.replyingTo', { username: replyingTo.sender })}
            </Text>
            <Text style={[styles.replyText, { color: isDark ? '#aaa' : '#555' }]} numberOfLines={1}>
              {replyingTo.text}
            </Text>
          </View>
          <TouchableOpacity style={styles.closeReplyBtn} onPress={() => setReplyingTo(null)}>
            <MaterialIcons name="close" size={20} color={isDark ? '#888' : '#666'} />
          </TouchableOpacity>
        </View>
      )}

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: isDark ? '#1a1a1a' : '#fff',
            borderTopColor: isDark ? '#27272a' : '#eee',
            borderTopWidth: 1,
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            { color: isDark ? '#fff' : '#111', backgroundColor: isDark ? '#1c1c1e' : '#f3f4f6' },
          ]}
          placeholder={t('nobar.chatPlaceholder')}
          placeholderTextColor={isDark ? '#666' : '#999'}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, inputText.trim() ? styles.sendBtnActive : { opacity: 0.4 }]}
          disabled={!inputText.trim()}
          onPress={sendMessage}
        >
          <MaterialIcons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  participantHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  roomCodeText: {
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.4,
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 5,
  },
  inviteBtnText: {
    color: '#fff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  leaveBtnText: {
    color: '#ef4444',
    fontSize: 11.5,
    fontWeight: '700',
  },
  participantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    paddingLeft: 3,
    paddingVertical: 3,
    borderRadius: 16,
    gap: 5,
  },
  avatar: { width: 22, height: 22, borderRadius: 11 },
  avatarPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontWeight: 'bold', fontSize: 11 },
  participantName: {
    fontSize: 11.5,
    fontWeight: '600',
    maxWidth: 90,
  },
  hostBadge: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  hostBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  syncNoteText: {
    fontSize: 11,
    marginTop: 6,
    fontWeight: '500',
  },

  chatList: { padding: 12, paddingBottom: 20 },
  emptyChatText: {
    textAlign: 'center',
    fontSize: 13,
    paddingHorizontal: 24,
    lineHeight: 19,
  },

  messageRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end', width: '100%' },
  messageRowMe: { justifyContent: 'flex-end' },
  messageRowThem: { justifyContent: 'flex-start' },

  avatarSlot: { width: 28, marginRight: 8, alignItems: 'center' },
  miniAvatar: { width: 28, height: 28, borderRadius: 14 },
  miniAvatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },

  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  systemBubble: { backgroundColor: 'transparent', alignSelf: 'center', marginVertical: 4 },

  senderName: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  messageText: { fontSize: 15, lineHeight: 20 },

  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  replyBannerContent: { flex: 1, borderLeftWidth: 3, borderLeftColor: '#3b82f6', paddingLeft: 8 },
  closeReplyBtn: { padding: 4 },
  replyBox: {
    marginBottom: 6,
    padding: 6,
    borderRadius: 4,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.3)',
  },
  replyUser: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  replyText: { fontSize: 12 },

  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 42,
    maxHeight: 100,
    marginRight: 8,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: { backgroundColor: '#3b82f6' },

  overlayContainer: {
    position: 'absolute',
    bottom: 64,
    left: 16,
    maxWidth: '48%',
    justifyContent: 'flex-end',
    zIndex: 999,
  },
  overlayMsg: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  overlayText: {
    color: '#fff',
    fontSize: 12.5,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  overlaySystemText: {
    color: '#ffd700',
    fontSize: 11.5,
    fontStyle: 'italic',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});
