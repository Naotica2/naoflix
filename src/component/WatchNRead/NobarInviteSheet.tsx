import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { Modal, Portal, Button } from 'react-native-paper';
import Icon from '@react-native-vector-icons/fontawesome';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../misc/AuthContext';
import { supabase } from '../../config/supabaseClient';
import { useLanguage } from '../../misc/LanguageContext';
import { markDmInboxDirty } from '../../utils/dmCache';
import ForumImage from '../Forum/ForumImage';

interface DMContact {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  channelId?: string;
}

interface Props {
  visible: boolean;
  onDismiss: () => void;
  roomId: string;
  nobarTitle?: string;
  onInviteDM?: () => void;
  onPromoteToForum?: () => void;
  isDark: boolean;
}

export default function NobarInviteSheet({
  visible,
  onDismiss,
  roomId,
  nobarTitle,
  onInviteDM,
  onPromoteToForum,
  isDark,
}: Props) {
  const { t } = useLanguage();
  const { user } = useAuth();

  const [mode, setMode] = useState<'main' | 'dm'>('main');
  const [contacts, setContacts] = useState<DMContact[]>([]);
  const [searchResults, setSearchResults] = useState<DMContact[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [sendingToId, setSendingToId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!visible) {
      setMode('main');
      setSearchQuery('');
      setSearchResults(null);
      setSendingToId(null);
    }
  }, [visible]);

  const loadContacts = useCallback(async () => {
    if (!user?.id) return;
    setLoadingContacts(true);
    try {
      const [channelsRes, followsRes] = await Promise.all([
        supabase
          .from('dm_channels')
          .select(
            `
            id, status, sender_id, receiver_id,
            sender:profiles!dm_channels_sender_id_fkey(id, username, display_name, avatar_url),
            receiver:profiles!dm_channels_receiver_id_fkey(id, username, display_name, avatar_url)
          `,
          )
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .neq('status', 'rejected')
          .order('updated_at', { ascending: false })
          .limit(30),
        supabase
          .from('follows')
          .select('profiles!follows_following_id_fkey(id, username, display_name, avatar_url)')
          .eq('follower_id', user.id)
          .limit(40),
      ]);

      const merged = new Map<string, DMContact>();

      for (const ch of (channelsRes.data as any[]) || []) {
        const partner = ch.sender_id === user.id ? ch.receiver : ch.sender;
        if (partner?.id && partner.id !== user.id) {
          merged.set(partner.id, {
            id: partner.id,
            username: partner.username,
            display_name: partner.display_name,
            avatar_url: partner.avatar_url,
            channelId: ch.id,
          });
        }
      }

      for (const f of (followsRes.data as any[]) || []) {
        const prof = f.profiles;
        if (prof?.id && prof.id !== user.id && !merged.has(prof.id)) {
          merged.set(prof.id, {
            id: prof.id,
            username: prof.username,
            display_name: prof.display_name,
            avatar_url: prof.avatar_url,
          });
        }
      }

      setContacts(Array.from(merged.values()));
    } catch (e) {
      console.warn('[NobarInviteSheet] loadContacts error:', e);
    } finally {
      setLoadingContacts(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (visible && mode === 'dm') {
      loadContacts();
    }
  }, [visible, mode, loadContacts]);

  useEffect(() => {
    if (mode !== 'dm' || !user?.id) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
          .neq('id', user.id)
          .limit(20);
        setSearchResults((data as DMContact[]) || []);
      } catch {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, mode, user?.id]);

  const handleOpenDM = () => {
    if (onInviteDM) {
      onInviteDM();
      return;
    }
    if (!user) {
      ToastAndroid.show(t('auth.loginRequiredNobar'), ToastAndroid.SHORT);
      return;
    }
    setMode('dm');
  };

  const handleSendInviteDM = async (target: DMContact) => {
    if (!user || sendingToId) return;
    setSendingToId(target.id);
    try {
      let channelId = target.channelId;

      if (!channelId) {
        const { data: existingChannel, error: checkErr } = await supabase
          .from('dm_channels')
          .select('id')
          .or(
            `and(sender_id.eq.${user.id},receiver_id.eq.${target.id}),and(sender_id.eq.${target.id},receiver_id.eq.${user.id})`,
          )
          .maybeSingle();

        if (checkErr && checkErr.code !== 'PGRST116') throw checkErr;

        if (existingChannel?.id) {
          channelId = existingChannel.id;
        } else {
          const { data: newChannel, error: createErr } = await supabase
            .from('dm_channels')
            .insert({
              sender_id: user.id,
              receiver_id: target.id,
              status: 'pending',
            })
            .select('id')
            .single();
          if (createErr) throw createErr;
          channelId = newChannel.id;
        }
      }

      const displayTitle = nobarTitle?.trim() || t('nobar.title');
      const link = `naoflix://nobar?room=${roomId}`;
      const inviteMessage = t('nobar.inviteShareText', {
        title: displayTitle,
        roomId,
        link,
      });

      const { error: msgErr } = await supabase.from('dm_messages').insert({
        channel_id: channelId,
        user_id: user.id,
        text: inviteMessage,
        media_type: 'text',
        media_metadata: {
          nobarInvite: {
            roomId,
            title: displayTitle,
          },
        },
      });
      if (msgErr) throw msgErr;

      await supabase
        .from('dm_channels')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', channelId);

      markDmInboxDirty(user.id);
      setSentIds(prev => ({ ...prev, [target.id]: true }));
      ToastAndroid.show(
        t('nobar.dmInviteSentToast', { name: target.display_name || target.username }),
        ToastAndroid.SHORT,
      );
    } catch (e) {
      console.warn('[NobarInviteSheet] send invite DM error:', e);
      ToastAndroid.show(t('nobar.dmInviteSendFailed'), ToastAndroid.SHORT);
    } finally {
      setSendingToId(null);
    }
  };

  const shareLink = async () => {
    try {
      const link = `naoflix://nobar?room=${roomId}`;
      await Clipboard.setStringAsync(roomId);
      ToastAndroid.show(t('nobar.codeCopied'), ToastAndroid.SHORT);
      await Share.share({
        message:
          t('nobar.inviteShareText', {
            title: nobarTitle?.trim() || t('nobar.title'),
            roomId,
            link,
          }) + `\n(${t('nobar.joinRoomShare')})`,
      });
    } catch (error) {
      console.warn('Share error:', error);
    }
  };

  const copyOnly = async () => {
    await Clipboard.setStringAsync(roomId);
    ToastAndroid.show(t('nobar.codeCopied'), ToastAndroid.SHORT);
  };

  const displayedList =
    searchResults !== null
      ? searchResults
      : searchQuery.trim().length > 0
      ? contacts.filter(c => {
          const q = searchQuery.trim().toLowerCase();
          return (
            c.username.toLowerCase().includes(q) ||
            (c.display_name || '').toLowerCase().includes(q)
          );
        })
      : contacts;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modalContent,
          { backgroundColor: isDark ? '#1a1a1a' : '#fff', maxHeight: '86%' },
        ]}
      >
        {mode === 'dm' ? (
          <View style={{ maxHeight: 460 }}>
            <View style={styles.dmHeaderRow}>
              <TouchableOpacity
                style={styles.backIconBtn}
                onPress={() => setMode('main')}
                hitSlop={10}
              >
                <Icon name="arrow-left" size={16} color={isDark ? '#fff' : '#111'} />
              </TouchableOpacity>
              <Text style={[styles.dmHeaderTitle, { color: isDark ? '#fff' : '#000' }]}>
                {t('nobar.dmPickerTitle')}
              </Text>
            </View>

            <View
              style={[
                styles.searchWrap,
                {
                  backgroundColor: isDark ? '#27272a' : '#f3f4f6',
                  borderColor: isDark ? '#3f3f46' : '#e5e7eb',
                },
              ]}
            >
              <Icon name="search" size={14} color={isDark ? '#a1a1aa' : '#6b7280'} />
              <TextInput
                style={[styles.searchInput, { color: isDark ? '#fff' : '#111' }]}
                placeholder={t('nobar.dmSearchPlaceholder')}
                placeholderTextColor={isDark ? '#71717a' : '#9ca3af'}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
              />
            </View>

            {loadingContacts ? (
              <View style={styles.dmCenterState}>
                <ActivityIndicator size="small" color="#6366f1" />
              </View>
            ) : displayedList.length === 0 ? (
              <View style={styles.dmCenterState}>
                <Text style={{ color: isDark ? '#9ca3af' : '#6b7280', fontSize: 13 }}>
                  {t('nobar.dmNoContacts')}
                </Text>
              </View>
            ) : (
              <FlatList
                data={displayedList}
                keyExtractor={item => item.id}
                style={{ maxHeight: 300 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const isSent = !!sentIds[item.id];
                  const isSending = sendingToId === item.id;
                  const displayName = item.display_name || item.username;
                  return (
                    <View
                      style={[
                        styles.contactRow,
                        { borderBottomColor: isDark ? '#27272a' : '#f1f5f9' },
                      ]}
                    >
                      {item.avatar_url ? (
                        <ForumImage
                          uri={item.avatar_url}
                          recyclingKey={item.avatar_url}
                          style={styles.contactAvatar}
                        />
                      ) : (
                        <View
                          style={[
                            styles.contactAvatar,
                            styles.contactAvatarFallback,
                            { backgroundColor: isDark ? '#27272a' : '#e5e7eb' },
                          ]}
                        >
                          <Text
                            style={{
                              color: isDark ? '#f4f4f6' : '#374151',
                              fontWeight: '700',
                              fontSize: 13,
                            }}
                          >
                            {displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}

                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.contactName, { color: isDark ? '#fff' : '#111' }]}
                          numberOfLines={1}
                        >
                          {displayName}
                        </Text>
                        <Text
                          style={[styles.contactHandle, { color: isDark ? '#9ca3af' : '#6b7280' }]}
                          numberOfLines={1}
                        >
                          @{item.username}
                        </Text>
                      </View>

                      <TouchableOpacity
                        disabled={isSent || isSending}
                        onPress={() => handleSendInviteDM(item)}
                        style={[
                          styles.sendDmChip,
                          {
                            backgroundColor: isSent
                              ? isDark
                                ? '#14532d'
                                : '#dcfce7'
                              : '#6366f1',
                          },
                        ]}
                      >
                        {isSending ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text
                            style={{
                              color: isSent ? (isDark ? '#86efac' : '#166534') : '#fff',
                              fontSize: 12,
                              fontWeight: '700',
                            }}
                          >
                            {isSent ? t('nobar.dmInviteSent') : t('nobar.inviteFriendsBtn')}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}

            <Button
              mode="text"
              onPress={onDismiss}
              textColor={isDark ? '#aaa' : '#666'}
              style={{ marginTop: 8 }}
            >
              {t('common.close')}
            </Button>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Icon name="television" size={22} color="#6366f1" />
              <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
                {t('nobar.inviteTitle')}
              </Text>
            </View>

            <Text style={[styles.subtitle, { color: isDark ? '#aaa' : '#666' }]}>
              {t('nobar.inviteSubtitle')}
            </Text>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#6366f1' }]}
              onPress={handleOpenDM}
              activeOpacity={0.8}
            >
              <Icon name="send" size={16} color="#fff" />
              <Text style={styles.btnText}>{t('nobar.sendViaDM')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#25D366', marginTop: 10 }]}
              onPress={shareLink}
              activeOpacity={0.8}
            >
              <Icon name="share-alt" size={16} color="#fff" />
              <Text style={styles.btnText}>{t('nobar.shareLink')}</Text>
            </TouchableOpacity>

            {onPromoteToForum && (
              <TouchableOpacity
                style={[
                  styles.btn,
                  {
                    backgroundColor: isDark ? 'rgba(59,130,246,0.16)' : '#eff6ff',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(59,130,246,0.45)' : '#93c5fd',
                    marginTop: 10,
                  },
                ]}
                onPress={onPromoteToForum}
                activeOpacity={0.8}
              >
                <Icon name="bullhorn" size={16} color="#3b82f6" />
                <Text style={[styles.btnText, { color: '#3b82f6' }]}>
                  {t('forumFeed.promoteNobarBtn')}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: isDark ? '#333' : '#eee', marginTop: 10 }]}
              onPress={copyOnly}
              activeOpacity={0.8}
            >
              <Icon name="copy" size={16} color={isDark ? '#fff' : '#000'} />
              <Text style={[styles.btnText, { color: isDark ? '#fff' : '#000' }]}>
                {t('nobar.copyCode')} ({roomId})
              </Text>
            </TouchableOpacity>

            <Button
              mode="text"
              onPress={onDismiss}
              textColor={isDark ? '#aaa' : '#666'}
              style={{ marginTop: 12 }}
            >
              {t('common.close')}
            </Button>
          </ScrollView>
        )}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    margin: 20,
    padding: 20,
    borderRadius: 16,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  title: {
    fontSize: 19,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 13.5,
    marginBottom: 18,
    lineHeight: 19,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 13,
    borderRadius: 10,
    gap: 10,
  },
  btnText: {
    color: '#fff',
    fontSize: 14.5,
    fontWeight: '600',
  },
  dmHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  backIconBtn: {
    padding: 4,
  },
  dmHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    height: 38,
    fontSize: 13.5,
  },
  dmCenterState: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  contactAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
  },
  contactHandle: {
    fontSize: 12,
  },
  sendDmChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 68,
    alignItems: 'center',
  },
});
