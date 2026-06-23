import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import Icon from '@react-native-vector-icons/material-design-icons';
import moment from 'moment';
import { useAuth } from '../../misc/AuthContext';
import { supabase } from '../../config/supabaseClient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackNavigator } from '../../types/navigation';
import { getRank, getRankColor } from '../../utils/LevelSystem';

interface CommentRow {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  parent_id: string | null;
  profiles: { username: string; avatar_url: string | null; level: number | null } | null;
}

interface CommentSectionProps {
  contentId: string;
  contentType: 'anime' | 'movie';
}

const COOLDOWN_SECONDS = 30;

function CommentSection({ contentId, contentType }: CommentSectionProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user, profile } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchComments = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('comments')
        .select('id, user_id, text, created_at, parent_id, profiles(username, avatar_url, level)')
        .eq('content_id', contentId)
        .eq('content_type', contentType)
        .order('created_at', { ascending: false })
        .limit(100);
      setComments((data as unknown as CommentRow[]) ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [contentId, contentType]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    if (lastSent === 0) return;
    setCooldown(COOLDOWN_SECONDS);
    cooldownRef.current = setInterval(() => {
      const remaining = Math.max(0, COOLDOWN_SECONDS - Math.floor((Date.now() - lastSent) / 1000));
      setCooldown(remaining);
      if (remaining <= 0 && cooldownRef.current) clearInterval(cooldownRef.current);
    }, 1000);
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [lastSent]);

  const handleSend = useCallback(async () => {
    if (!user || !profile || !text.trim() || cooldown > 0) return;
    setSending(true);
    try {
      const { error } = await supabase.from('comments').insert({
        user_id: user.id,
        content_id: contentId,
        content_type: contentType,
        parent_id: replyTo?.id ?? null,
        text: text.trim(),
      });
      if (error) {
        ToastAndroid.show('Gagal mengirim komentar', ToastAndroid.SHORT);
      } else {
        setText('');
        setReplyTo(null);
        setLastSent(Date.now());
        await fetchComments();
      }
    } catch {
      ToastAndroid.show('Gagal mengirim komentar', ToastAndroid.SHORT);
    } finally {
      setSending(false);
    }
  }, [user, profile, text, cooldown, contentId, contentType, replyTo, fetchComments]);

  const handleDelete = useCallback(
    async (commentId: string) => {
      const { error } = await supabase.from('comments').delete().eq('id', commentId);
      if (!error) await fetchComments();
    },
    [fetchComments],
  );

  const topLevel = useMemo(
    () => comments.filter(c => c.parent_id === null),
    [comments],
  );

  const repliesMap = useMemo(() => {
    const map = new Map<string, CommentRow[]>();
    for (const c of comments) {
      if (c.parent_id) {
        const arr = map.get(c.parent_id) ?? [];
        arr.push(c);
        map.set(c.parent_id, arr);
      }
    }
    return map;
  }, [comments]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { paddingHorizontal: 16, paddingVertical: 20 },
        title: { fontSize: 18, fontWeight: '700', color: isDark ? '#fff' : '#111', marginBottom: 16 },
        loginPrompt: { 
          fontSize: 14, 
          color: '#fff', 
          fontWeight: '600',
        },
        loginPromptContainer: {
          backgroundColor: '#6366f1',
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: 20,
          alignSelf: 'flex-start',
          marginBottom: 16,
        },
        inputRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12, gap: 8 },
        input: {
          flex: 1, backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0', borderRadius: 20,
          paddingHorizontal: 16, paddingVertical: 10, color: isDark ? '#fff' : '#111',
          fontSize: 14, maxHeight: 100, borderWidth: 1, borderColor: isDark ? '#333' : '#ddd',
        },
        sendBtn: {
          width: 40, height: 40, borderRadius: 20, backgroundColor: '#6366f1',
          justifyContent: 'center', alignItems: 'center',
        },
        sendBtnDisabled: { backgroundColor: isDark ? '#333' : '#ccc' },
        cooldownText: { fontSize: 11, color: '#888', marginBottom: 8 },
        replyBar: {
          flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0',
          borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8, gap: 8,
        },
        replyBarText: { flex: 1, fontSize: 12, color: '#888' },
        commentItem: { marginBottom: 16 },
        commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
        commentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#333' },
        commentUsername: { fontSize: 13, fontWeight: '700', color: isDark ? '#e0e0e0' : '#333' },
        commentLevel: { fontSize: 10, fontWeight: 'bold', marginLeft: 4 },
        commentTime: { fontSize: 11, color: '#666' },
        commentText: { fontSize: 14, color: isDark ? '#ccc' : '#333', lineHeight: 20, marginLeft: 36 },
        commentActions: { flexDirection: 'row', gap: 16, marginLeft: 36, marginTop: 4 },
        actionText: { fontSize: 12, color: '#6366f1', fontWeight: '600' },
        deleteText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },
        replyItem: {
          marginLeft: 36, marginTop: 8, paddingLeft: 12,
          borderLeftWidth: 2, borderLeftColor: isDark ? '#333' : '#ddd',
        },
        emptyText: { fontSize: 13, color: '#666', textAlign: 'center', marginVertical: 20 },
      }),
    [isDark],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Komentar ({topLevel.length})</Text>

      {!user || !profile ? (
        <TouchableOpacity 
          style={styles.loginPromptContainer} 
          onPress={() => navigation.navigate('LoginScreen')}
          activeOpacity={0.8}
        >
          <Text style={styles.loginPrompt}>Masuk untuk berkomentar</Text>
        </TouchableOpacity>
      ) : (
        <>
          {replyTo && (
            <View style={styles.replyBar}>
              <Text style={styles.replyBarText}>Membalas @{replyTo.username}</Text>
              <TouchableOpacity onPress={() => setReplyTo(null)}>
                <Icon name="close" size={16} color="#888" />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={replyTo ? 'Tulis balasan...' : 'Tulis komentar...'}
              placeholderTextColor="#666"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!text.trim() || cooldown > 0 || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!text.trim() || cooldown > 0 || sending}>
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Icon name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
          {cooldown > 0 && (
            <Text style={styles.cooldownText}>Tunggu {cooldown}s sebelum komentar lagi</Text>
          )}
        </>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginVertical: 20 }} />
      ) : topLevel.length === 0 ? (
        <Text style={styles.emptyText}>Belum ada komentar. Jadilah yang pertama!</Text>
      ) : (
        topLevel.map(comment => (
          <View key={comment.id} style={styles.commentItem}>
            <View style={styles.commentHeader}>
              {comment.profiles?.avatar_url ? (
                <Image source={{ uri: comment.profiles.avatar_url }} style={styles.commentAvatar} />
              ) : (
                <View style={styles.commentAvatar} />
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.commentUsername}>@{comment.profiles?.username ?? '?'}</Text>
                <Text style={[styles.commentLevel, { color: getRankColor(getRank(comment.profiles?.level || 1)) }]}>
                  Lv. {comment.profiles?.level || 1}
                </Text>
              </View>
              <Text style={styles.commentTime}>
                {moment(comment.created_at).fromNow()}
              </Text>
            </View>
            <Text style={styles.commentText}>{comment.text}</Text>
            <View style={styles.commentActions}>
              {user && profile && (
                <TouchableOpacity
                  onPress={() =>
                    setReplyTo({ id: comment.id, username: comment.profiles?.username ?? '?' })
                  }>
                  <Text style={styles.actionText}>Balas</Text>
                </TouchableOpacity>
              )}
              {user && comment.user_id === user.id && (
                <TouchableOpacity onPress={() => handleDelete(comment.id)}>
                  <Text style={styles.deleteText}>Hapus</Text>
                </TouchableOpacity>
              )}
            </View>

            {repliesMap.get(comment.id)?.map(reply => (
              <View key={reply.id} style={styles.replyItem}>
                <View style={styles.commentHeader}>
                  {reply.profiles?.avatar_url ? (
                    <Image source={{ uri: reply.profiles.avatar_url }} style={styles.commentAvatar} />
                  ) : (
                    <View style={styles.commentAvatar} />
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.commentUsername}>@{reply.profiles?.username ?? '?'}</Text>
                    <Text style={[styles.commentLevel, { color: getRankColor(getRank(reply.profiles?.level || 1)) }]}>
                      Lv. {reply.profiles?.level || 1}
                    </Text>
                  </View>
                  <Text style={styles.commentTime}>{moment(reply.created_at).fromNow()}</Text>
                </View>
                <Text style={styles.commentText}>{reply.text}</Text>
                {user && reply.user_id === user.id && (
                  <View style={styles.commentActions}>
                    <TouchableOpacity onPress={() => handleDelete(reply.id)}>
                      <Text style={styles.deleteText}>Hapus</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

export default memo(CommentSection);
