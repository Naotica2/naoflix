import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Platform, Image, Alert, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@react-native-vector-icons/fontawesome';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { useAuth } from '../../misc/AuthContext';
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
}

export default function NobarChatSection({ roomId, isHost, isFullscreen, isDark, participants, chatMessages, broadcastChat, onInvitePress }: Props) {
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const roomHost = participants.find(p => p.isHost);
  const isRoomVip = isHost ? profile?.is_vip : roomHost?.is_vip;

  // chatMessages now contains both user chats and chronological system messages.
  const sendMessage = () => {
    if (!inputText.trim()) return;

    const newMsg: ChatMessage = {
      id: Math.random().toString(),
      senderId: user?.id,
      sender: profile?.display_name || profile?.username || user?.user_metadata?.username || 'Me',
      text: inputText.trim(),
      replyTo: replyingTo ? {
        senderId: replyingTo.senderId,
        sender: replyingTo.sender,
        text: replyingTo.text,
      } : undefined,
    };

    broadcastChat(newMsg);

    setInputText('');
    setReplyingTo(null);
  };


  if (isFullscreen) {
    // Overlay transparan untuk Landscape
    return (
      <View style={styles.overlayContainer} pointerEvents="box-none">
        <FlatList
          ref={flatListRef}
          data={chatMessages.slice(-5)} // Hanya tampilkan 5 pesan terakhir
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.overlayMsg}>
              {item.isSystem ? (
                <Text style={styles.overlaySystemText}>{item.text}</Text>
              ) : (
                <Text style={styles.overlayText}>
                  <Text style={{ fontWeight: 'bold' }}>{item.sender}: </Text>
                  {item.text}
                </Text>
              )}
            </View>
          )}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', padding: 10 }}
        />
      </View>
    );
  }

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    if (item.isSystem) {
      return (
        <View style={styles.systemBubble}>
          <Text style={{ color: isDark ? '#ffd700' : '#d97706', fontSize: 12, fontStyle: 'italic' }}>{item.text}</Text>
        </View>
      );
    }

    const isMe = item.senderId === user?.id;
    const emojiOnly = isEmojiOnly(item.text);

    // Find participant for avatar
    const participant = participants.find(p => p.id === item.senderId);

    // Only show avatar if it's not me, and it's the first message in a group from this sender
    const prevMsg = index > 0 ? chatMessages[index - 1] : null;
    const showAvatar = !isMe && (!prevMsg || prevMsg.senderId !== item.senderId || prevMsg.isSystem);

    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowThem]}>
        {!isMe && (
          <View style={styles.avatarSlot}>
            {showAvatar ? (
              <View style={{ position: 'relative' }}>
                {participant?.avatar_url ? (
                  <Image source={{ uri: participant.avatar_url }} style={[styles.miniAvatar, participant.is_vip && styles.avatarVIP]} />
                ) : (
                  <View style={[styles.miniAvatar, styles.miniAvatarPlaceholder, { backgroundColor: isDark ? '#333' : '#ddd' }, participant?.is_vip && styles.avatarVIP]}>
                    <Text style={{ color: isDark ? '#aaa' : '#666', fontSize: 11, fontWeight: '700' }}>
                      {(item.sender || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                {participant?.is_vip && (
                  <View style={styles.vipBadgeContainerSmall}>
                    <MaterialIcons name="workspace-premium" size={8} color="#FFD700" />
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
              Alert.alert('Opsi Pesan', 'Pilih aksi untuk pesan ini', [
                { text: 'Balas', onPress: () => setReplyingTo(item) },
                { text: 'Batal', style: 'cancel' }
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
            emojiOnly && { backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 }
          ]}
        >
          {!isMe && !emojiOnly && showAvatar && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
              <Text style={[styles.senderName, { color: isDark ? '#a78bfa' : '#6d28d9', marginBottom: 0 }, participant?.is_vip && styles.usernameVIP]}>
                {item.sender}
              </Text>
              {participant?.is_vip && <MaterialIcons name="verified" size={10} color="#F59E0B" style={{ marginLeft: 4 }} />}
            </View>
          )}

          {item.replyTo && !emojiOnly && (
            <View style={[styles.replyBox, { backgroundColor: isMe ? 'rgba(0,0,0,0.15)' : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
              <Text style={[styles.replyUser, { color: isMe ? 'rgba(255,255,255,0.8)' : '#3b82f6' }]} numberOfLines={1}>
                {item.replyTo.senderId === user?.id ? 'Kamu' : item.replyTo.sender}
              </Text>
              <Text style={[styles.replyText, { color: isMe ? 'rgba(255,255,255,0.7)' : isDark ? '#999' : '#555' }]} numberOfLines={1}>
                {item.replyTo.text}
              </Text>
            </View>
          )}

          {emojiOnly ? (
            <Text style={[
              styles.messageText,
              { color: isMe ? '#fff' : isDark ? '#f0f0f0' : '#111' },
              { fontSize: 40, lineHeight: 48 }
            ]}>
              {item.text}
            </Text>
          ) : (
            <Text style={[
              styles.messageText,
              { color: isMe ? '#fff' : isDark ? '#f0f0f0' : '#111' }
            ]}>
              {item.text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
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
        </TouchableOpacity>
      </View>
    );
  };

  // Tampilan Potret (Berdiri)
  return (
    <View
      style={[styles.container, { backgroundColor: isDark ? '#0f0f0f' : '#fafafa' }]}
    >
      {/* Participant List */}
      <View style={[styles.participantHeader, { borderBottomColor: isDark ? '#333' : '#ddd' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 'auto' }}>
          <Text style={{ fontWeight: 'bold', fontSize: 16, color: isDark ? '#fff' : '#000' }}>
            👥 Room: {roomId}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#333' : '#eee', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 }}>
            <Icon name="user" size={10} color={isDark ? '#aaa' : '#666'} style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 11, fontWeight: 'bold', color: isDark ? '#aaa' : '#666' }}>
              {participants.length}/
            </Text>
            {isRoomVip ? (
              <MaterialIcons name="all-inclusive" size={12} color="#F59E0B" />
            ) : (
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: isDark ? '#aaa' : '#666' }}>
                5
              </Text>
            )}
          </View>
        </View>
        {isHost && (
          <TouchableOpacity onPress={onInvitePress} style={styles.inviteBtn}>
            <Icon name="user-plus" size={14} color="#fff" />
            <Text style={styles.inviteBtnText}>Invite</Text>
          </TouchableOpacity>
        )}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={participants}
          keyExtractor={p => p.id}
          renderItem={({ item }) => (
            <View style={styles.avatarWrap}>
              <View style={{ position: 'relative' }}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={[styles.avatar, item.is_vip && styles.avatarVIP]} />
                ) : (
                  <View style={[styles.avatarPlaceholder, item.is_vip && styles.avatarVIP]}>
                    <Text style={styles.avatarInitial}>{item.username[0]?.toUpperCase()}</Text>
                  </View>
                )}
                {item.is_vip && (
                  <View style={[styles.vipBadgeContainerSmall, { bottom: -2, right: -2 }]}>
                    <MaterialIcons name="workspace-premium" size={10} color="#FFD700" />
                  </View>
                )}
              </View>
            </View>
          )}
        />
      </View>

      {/* Chat Messages */}
      <FlatList
        ref={flatListRef}
        data={chatMessages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.chatList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={renderMessage}
      />

      {replyingTo && (
        <View style={[styles.replyBanner, { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5', borderTopColor: isDark ? '#222' : '#e0e0e0' }]}>
          <View style={styles.replyBannerContent}>
            <Text style={[styles.replyUser, { color: '#3b82f6' }]}>
              Membalas {replyingTo.senderId === user?.id ? 'Kamu' : replyingTo.sender}
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

      {/* Input Box */}
      <View style={[
        styles.inputContainer,
        {
          backgroundColor: isDark ? '#1a1a1a' : '#fff',
          borderTopColor: isDark ? '#1a1a1a' : '#eee',
          borderTopWidth: 1,
          paddingBottom: Math.max(insets.bottom, 10), // Aman dari Home Indicator iOS / Navigation Bar Android
        }
      ]}>
        <TextInput
          style={[styles.input, { color: isDark ? '#fff' : '#111', backgroundColor: isDark ? '#1c1c1e' : '#f3f4f6' }]}
          placeholder="Ketik pesan..."
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
    padding: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
  },
  headerTitle: {
    fontWeight: 'bold',
    marginRight: 10,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginRight: 10,
  },
  inviteBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  avatarWrap: { marginRight: 6 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarPlaceholder: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#6366f1',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontWeight: 'bold' },

  chatList: { padding: 12, paddingBottom: 20 },

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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1,
  },
  replyBannerContent: { flex: 1, borderLeftWidth: 3, borderLeftColor: '#3b82f6', paddingLeft: 8 },
  closeReplyBtn: { padding: 4 },
  replyBox: {
    marginBottom: 6, padding: 6, borderRadius: 4,
    borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.3)'
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
    width: 42, height: 42,
    borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnActive: { backgroundColor: '#3b82f6' },

  // Overlay styles
  overlayContainer: {
    position: 'absolute',
    bottom: 60, // Di atas progress bar
    left: 20,
    width: '40%',
    height: '50%',
    zIndex: 999,
  },
  overlayMsg: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 6, paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  overlayText: { color: '#fff', fontSize: 13, textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  overlaySystemText: { color: '#ffd700', fontSize: 12, fontStyle: 'italic', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  avatarVIP: {
    borderColor: '#F59E0B',
    borderWidth: 1.5,
  },
  vipBadgeContainerSmall: {
    position: 'absolute',
    bottom: -2,
    right: -4,
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
