import MaterialIcons from '@react-native-vector-icons/material-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ForumImage from '../component/Forum/ForumImage';
import ForumImageLightbox from '../component/Forum/ForumImageLightbox';
import ForumReportModal from '../component/Forum/ForumReportModal';
import NestedCommentItem from '../component/Forum/NestedCommentItem';
import PostCard from '../component/Forum/PostCard';
import { useAuth } from '../misc/AuthContext';
import { useLanguage } from '../misc/LanguageContext';
import { useLevel } from '../misc/LevelContext';
import {
  buildCommentTree,
  findCommentSubtree,
  ForumComment,
  ForumCommentSort,
  ForumMediaItem,
  ForumPost,
  sortCommentTree,
} from '../types/forum';
import { RootStackNavigator } from '../types/navigation';
import {
  createForumComment,
  fetchForumThread,
  getForumBlurNsfwPref,
  parseFriendlyForumError,
  softDeleteForumComment,
  softDeleteForumPost,
  toggleForumBookmark,
  toggleUserBlock,
  voteForumComment,
  voteForumPoll,
  voteForumPost,
} from '../utils/forumApi';
import {
  compressForumImage,
  formatBytesShort,
  pickForumImages,
  PreparedForumImage,
  uploadForumImages,
} from '../utils/forumMediaStorage';
import { awardForumExpWithCap } from '../utils/LevelSystem';

type Props = NativeStackScreenProps<RootStackNavigator, 'ForumPostDetail'>;

interface ReplyComposerDockProps {
  postId: string;
  rootCommentId?: string;
  replyState: { target: ForumComment; seq: number } | null;
  autoFocusOnMount: boolean;
  isDark: boolean;
  bottomInset: number;
  surface: string;
  borderCol: string;
  textCol: string;
  mutedCol: string;
  onClearReplyTarget: () => void;
  onRequireAuth: () => boolean;
  onCommentCreated: (newComment: ForumComment) => void;
}

const ReplyComposerDock = memo(function ReplyComposerDock({
  postId,
  rootCommentId,
  replyState,
  autoFocusOnMount,
  isDark,
  bottomInset,
  surface,
  borderCol,
  textCol,
  mutedCol,
  onClearReplyTarget,
  onRequireAuth,
  onCommentCreated,
}: ReplyComposerDockProps) {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const { addExp } = useLevel();

  const [replyText, setReplyText] = useState('');
  const [replySpoiler, setReplySpoiler] = useState(false);
  const [replyImage, setReplyImage] = useState<PreparedForumImage | null>(null);
  const [processingReplyImg, setProcessingReplyImg] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (autoFocusOnMount) {
      const timer = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(timer);
    }
  }, [autoFocusOnMount]);

  useEffect(() => {
    if (replyState) {
      const timer = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
  }, [replyState]);

  const handlePickCommentImage = useCallback(async () => {
    if (!onRequireAuth()) return;
    try {
      const picked = await pickForumImages(1);
      if (picked.length === 0) return;
      setProcessingReplyImg(true);
      let prepared = await compressForumImage(picked[0], false);
      if (prepared.exceedsLimit && prepared.isAnimatedGif) {
        prepared = await compressForumImage(picked[0], true);
      }
      if (prepared.exceedsLimit) {
        Alert.alert(
          t('forumFeed.overSizeTitle'),
          t('forumFeed.overSizeDesc', {
            size: formatBytesShort(prepared.compressedBytes),
            name: prepared.fileName,
          }),
        );
        return;
      }
      setReplyImage(prepared);
    } catch (err: any) {
      if (err?.message === 'PERMISSION_DENIED') {
        ToastAndroid.show(t('downloadAnime.permissionDeniedDesc'), ToastAndroid.SHORT);
      } else {
        ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
      }
    } finally {
      setProcessingReplyImg(false);
    }
  }, [onRequireAuth, t]);

  const handleSendComment = useCallback(async () => {
    if (!onRequireAuth() || sendingComment) return;
    const trimmed = replyText.trim();
    if (!trimmed && !replyImage) return;

    setSendingComment(true);
    try {
      let uploadedItem: ForumMediaItem | null = null;
      if (replyImage) {
        const uploaded = await uploadForumImages([replyImage]);
        uploadedItem = uploaded[0] || null;
      }

      const targetId = replyState?.target.id || rootCommentId || null;
      const commentId = await createForumComment({
        postId,
        parentId: targetId,
        body: trimmed,
        imageItem: uploadedItem,
        isSpoiler: replySpoiler,
      });

      const newComment: ForumComment = {
        id: commentId,
        post_id: postId,
        author_id: user!.id,
        author_username: profile!.username,
        author_display_name: profile!.display_name,
        author_avatar_url: profile!.avatar_url,
        author_level: profile!.level || 1,
        parent_id: targetId,
        depth: replyState?.target ? replyState.target.depth + 1 : 0,
        body: trimmed,
        image_item: uploadedItem,
        is_spoiler: replySpoiler,
        status: 'active',
        score: 1,
        created_at: new Date().toISOString(),
        my_vote: 1,
      };

      onCommentCreated(newComment);
      setReplyText('');
      setReplyImage(null);
      setReplySpoiler(false);
      onClearReplyTarget();

      const expAwarded = await awardForumExpWithCap('comment', addExp);
      if (expAwarded > 0) {
        ToastAndroid.show(t('forumFeed.expEarnedToast', { exp: expAwarded }), ToastAndroid.SHORT);
      }
    } catch (err) {
      ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.LONG);
    } finally {
      setSendingComment(false);
    }
  }, [
    addExp,
    onClearReplyTarget,
    onCommentCreated,
    onRequireAuth,
    postId,
    profile,
    replyImage,
    replySpoiler,
    replyState,
    replyText,
    rootCommentId,
    sendingComment,
    t,
    user,
  ]);

  const replyTarget = replyState?.target || null;

  return (
    <View
      style={[
        styles.replyDock,
        {
          backgroundColor: surface,
          borderTopColor: borderCol,
          paddingBottom: Math.max(bottomInset, 8),
        },
      ]}>
      {replyTarget && (
        <View style={[styles.replyingRow, { borderBottomColor: borderCol }]}>
          <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#3b82f6' }}>
            {t('forumFeed.replyToUser', { username: replyTarget.author_username })}
          </Text>
          <TouchableOpacity onPress={onClearReplyTarget}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: mutedCol }}>
              {t('forumFeed.cancelReply')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {replyImage && (
        <View style={styles.replyImgPreviewRow}>
          <ForumImage uri={replyImage.localUri} style={styles.replyThumb} />
          <Text style={{ flex: 1, fontSize: 11.5, color: mutedCol }}>
            {formatBytesShort(replyImage.compressedBytes)} WebP
          </Text>
          <TouchableOpacity onPress={() => setReplyImage(null)} hitSlop={8}>
            <MaterialIcons name="close" size={18} color="#ef4444" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.replyInputRow}>
        <TouchableOpacity
          onPress={handlePickCommentImage}
          disabled={processingReplyImg}
          style={styles.dockIconBtn}
          hitSlop={6}>
          {processingReplyImg ? (
            <ActivityIndicator size="small" color="#3b82f6" />
          ) : (
            <MaterialIcons name="add-photo-alternate" size={20} color={mutedCol} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setReplySpoiler(s => !s)}
          style={[
            styles.spoilerToggleBtn,
            replySpoiler && {
              backgroundColor: 'rgba(234,179,8,0.16)',
              borderColor: '#eab308',
            },
          ]}>
          <MaterialIcons
            name="visibility-off"
            size={15}
            color={replySpoiler ? '#eab308' : mutedCol}
          />
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          value={replyText}
          onChangeText={setReplyText}
          placeholder={t('forumFeed.replyPlaceholder')}
          placeholderTextColor="#71717a"
          multiline
          maxLength={2000}
          style={[
            styles.replyInput,
            {
              backgroundColor: isDark ? '#16161c' : '#f4f4f5',
              color: textCol,
            },
          ]}
        />

        <TouchableOpacity
          disabled={sendingComment || (!replyText.trim() && !replyImage)}
          onPress={handleSendComment}
          style={[
            styles.sendBtn,
            (!replyText.trim() && !replyImage) || sendingComment ? { opacity: 0.45 } : null,
          ]}>
          {sendingComment ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <MaterialIcons name="send" size={18} color="#ffffff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
});

function ForumPostDetailScreen({ navigation, route }: Props) {
  const { postId, initialPost, focusComment, rootCommentId } = route.params;
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 720;
  const isCompact = width < 360;

  const [post, setPost] = useState<ForumPost | null>(initialPost || null);
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [loading, setLoading] = useState(!initialPost);
  const [refreshing, setRefreshing] = useState(false);
  const [commentSort, setCommentSort] = useState<ForumCommentSort>('best');
  const [blurNsfw] = useState(() => getForumBlurNsfwPref());

  const [replyState, setReplyState] = useState<{ target: ForumComment; seq: number } | null>(null);

  const [lightbox, setLightbox] = useState<{
    visible: boolean;
    images: ForumMediaItem[];
    index: number;
  }>({ visible: false, images: [], index: 0 });

  const [reportTarget, setReportTarget] = useState<{
    visible: boolean;
    targetType: 'post' | 'comment';
    targetId: string | null;
  }>({ visible: false, targetType: 'post', targetId: null });

  const postRef = useRef<ForumPost | null>(post);
  const commentsRef = useRef<ForumComment[]>(comments);

  useEffect(() => {
    postRef.current = post;
  }, [post]);

  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  const loadThread = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else if (!postRef.current) setLoading(true);
      try {
        const res = await fetchForumThread(postId);
        setPost(res.post);
        setComments(res.comments);
      } catch (err) {
        ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [postId],
  );

  useEffect(() => {
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) {
        loadThread(false);
      }
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [loadThread]);

  const requireAuth = useCallback(() => {
    if (user && profile) return true;
    ToastAndroid.show(t('forumFeed.loginToVote'), ToastAndroid.SHORT);
    navigation.navigate(user ? 'UsernameSetupScreen' : 'LoginScreen');
    return false;
  }, [navigation, profile, t, user]);

  const commentTree = useMemo(() => {
    const built = buildCommentTree(comments);
    const sorted = sortCommentTree(built, commentSort);
    if (rootCommentId) {
      const sub = findCommentSubtree(sorted, rootCommentId);
      return sub ? [sub] : sorted;
    }
    return sorted;
  }, [commentSort, comments, rootCommentId]);

  const handleVotePost = useCallback(
    async (pid: string, nextValue: -1 | 0 | 1) => {
      const curPost = postRef.current;
      if (!requireAuth() || !curPost) return;
      const prevPost = curPost;
      const oldVote = curPost.my_vote || 0;
      setPost({
        ...curPost,
        my_vote: nextValue,
        score: curPost.score + (nextValue - oldVote),
      });
      try {
        const res = await voteForumPost(pid, nextValue);
        setPost(cur =>
          cur
            ? {
                ...cur,
                score: res.score,
                upvotes_count: res.upvotes_count,
                downvotes_count: res.downvotes_count,
                my_vote: res.my_vote,
              }
            : null,
        );
      } catch (err) {
        setPost(prevPost);
        ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
      }
    },
    [requireAuth],
  );

  const handleVotePoll = useCallback(
    async (pid: string, optionIndex: number) => {
      if (!requireAuth()) return;
      try {
        const res = await voteForumPoll(pid, optionIndex);
        setPost(cur =>
          cur
            ? {
                ...cur,
                poll_tallies: res.poll_tallies,
                my_poll_option: res.my_poll_option,
              }
            : null,
        );
      } catch (err) {
        ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
      }
    },
    [requireAuth],
  );

  const handleToggleBookmark = useCallback(
    async (pid: string) => {
      const curPost = postRef.current;
      if (!requireAuth() || !curPost) return;
      const prev = curPost;
      setPost({ ...curPost, is_bookmarked: !curPost.is_bookmarked });
      try {
        const saved = await toggleForumBookmark(pid);
        setPost(cur => (cur ? { ...cur, is_bookmarked: saved } : null));
      } catch (err) {
        setPost(prev);
        ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
      }
    },
    [requireAuth],
  );

  const handleDeletePost = useCallback(
    (target: ForumPost) => {
      Alert.alert(t('forumFeed.menuDelete'), t('forumFeed.deletePostConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await softDeleteForumPost(target.id);
              navigation.goBack();
            } catch (err) {
              ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
            }
          },
        },
      ]);
    },
    [navigation, t],
  );

  const handleBlockAuthor = useCallback(
    (authorId: string, username: string) => {
      if (!requireAuth()) return;
      Alert.alert(t('forumFeed.blockConfirmTitle', { username }), t('forumFeed.blockConfirmDesc'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('forumFeed.menuBlockUser', { username }),
          style: 'destructive',
          onPress: async () => {
            try {
              await toggleUserBlock(authorId);
              ToastAndroid.show(t('forumFeed.blockedToast', { username }), ToastAndroid.SHORT);
              if (postRef.current?.author_id === authorId) {
                navigation.goBack();
              } else {
                setComments(prev => prev.filter(c => c.author_id !== authorId));
              }
            } catch (err) {
              ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
            }
          },
        },
      ]);
    },
    [navigation, requireAuth, t],
  );

  const handleVoteComment = useCallback(
    async (commentId: string, nextValue: -1 | 0 | 1) => {
      if (!requireAuth()) return;
      const snapshot = commentsRef.current;
      setComments(prev =>
        prev.map(c =>
          c.id === commentId
            ? { ...c, my_vote: nextValue, score: c.score + (nextValue - (c.my_vote || 0)) }
            : c,
        ),
      );
      try {
        const res = await voteForumComment(commentId, nextValue);
        setComments(prev =>
          prev.map(c =>
            c.id === commentId ? { ...c, score: res.score, my_vote: res.my_vote } : c,
          ),
        );
      } catch (err) {
        setComments(snapshot);
        ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
      }
    },
    [requireAuth],
  );

  const handleDeleteComment = useCallback(
    (comment: ForumComment) => {
      Alert.alert(t('forumFeed.menuDelete'), t('forumFeed.deleteCommentConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await softDeleteForumComment(comment.id);
              setComments(prev =>
                prev.map(c =>
                  c.id === comment.id ? { ...c, status: 'deleted', body: '', image_item: null } : c,
                ),
              );
            } catch (err) {
              ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
            }
          },
        },
      ]);
    },
    [t],
  );

  const handleOpenLightbox = useCallback((images: ForumMediaItem[], index: number) => {
    setLightbox({ visible: true, images, index });
  }, []);

  const handleCloseLightbox = useCallback(() => {
    setLightbox(prev => ({ ...prev, visible: false }));
  }, []);

  const handleReportPost = useCallback(
    (pid: string) => {
      if (!requireAuth()) return;
      setReportTarget({ visible: true, targetType: 'post', targetId: pid });
    },
    [requireAuth],
  );

  const handleReportComment = useCallback(
    (cid: string) => {
      if (!requireAuth()) return;
      setReportTarget({ visible: true, targetType: 'comment', targetId: cid });
    },
    [requireAuth],
  );

  const handleCloseReport = useCallback(() => {
    setReportTarget(prev => ({ ...prev, visible: false }));
  }, []);

  const handleReply = useCallback(
    (comment: ForumComment) => {
      if (!requireAuth()) return;
      setReplyState(prev => ({ target: comment, seq: (prev?.seq || 0) + 1 }));
    },
    [requireAuth],
  );

  const handleClearReplyTarget = useCallback(() => {
    setReplyState(null);
  }, []);

  const handleCommentCreated = useCallback((newComment: ForumComment) => {
    setComments(prev => [...prev, newComment]);
    setPost(cur => (cur ? { ...cur, comments_count: cur.comments_count + 1 } : null));
  }, []);

  const handleContinueThread = useCallback(
    (cid: string) => {
      const curPost = postRef.current;
      if (!curPost) return;
      navigation.push('ForumPostDetail', {
        postId: curPost.id,
        initialPost: curPost,
        rootCommentId: cid,
      });
    },
    [navigation],
  );

  const handleOpenImage = useCallback((img: ForumMediaItem) => {
    setLightbox({ visible: true, images: [img], index: 0 });
  }, []);

  const bg = isDark ? '#0a0a0c' : '#f4f4f5';
  const surface = isDark ? '#0f0f12' : '#ffffff';
  const borderCol = isDark ? '#1e1e24' : '#e4e4e7';
  const textCol = isDark ? '#f4f4f5' : '#09090b';
  const mutedCol = isDark ? '#a1a1aa' : '#52525b';

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: surface,
            borderBottomColor: borderCol,
          },
        ]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={textCol} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textCol }]} numberOfLines={1}>
          {t('forumFeed.detailTitle')}
        </Text>
        <TouchableOpacity onPress={() => loadThread(true)} hitSlop={10} style={styles.backBtn}>
          <MaterialIcons name="refresh" size={20} color={mutedCol} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {loading && !post ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : !post ? (
          <View style={styles.centerBox}>
            <MaterialIcons name="forum" size={44} color={isDark ? '#3f3f46' : '#d4d4d8'} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: textCol, marginTop: 10 }}>
              {t('forumFeed.notFoundTitle')}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: mutedCol,
                textAlign: 'center',
                paddingHorizontal: 32,
                marginTop: 4,
              }}>
              {t('forumFeed.notFoundDesc')}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadThread(true)}
                tintColor="#3b82f6"
                colors={['#3b82f6']}
              />
            }
            keyboardShouldPersistTaps="handled">
            <PostCard
              post={post}
              currentUserId={user?.id}
              blurNsfw={blurNsfw}
              isDetail
              isDark={isDark}
              isTablet={isTablet}
              navigation={navigation}
              onVotePost={handleVotePost}
              onVotePoll={handleVotePoll}
              onToggleBookmark={handleToggleBookmark}
              onOpenLightbox={handleOpenLightbox}
              onReportPost={handleReportPost}
              onBlockAuthor={handleBlockAuthor}
              onDeletePost={handleDeletePost}
            />

            {rootCommentId && (
              <View
                style={[
                  styles.subthreadBanner,
                  {
                    backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : '#eff6ff',
                    borderColor: isDark ? 'rgba(59,130,246,0.35)' : '#bfdbfe',
                  },
                ]}>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 12.5,
                    fontWeight: '600',
                    color: isDark ? '#93c5fd' : '#1e40af',
                  }}>
                  {t('forumFeed.viewingSubthread')}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    navigation.replace('ForumPostDetail', {
                      postId: post.id,
                      initialPost: post,
                    })
                  }>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#3b82f6' }}>
                    {t('forumFeed.backToFullThread')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View
              style={[
                styles.commentsSectionContainer,
                {
                  backgroundColor: surface,
                  borderColor: borderCol,
                },
              ]}>
              <View style={[styles.commentsHeader, { borderBottomColor: borderCol }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: textCol }}>
                  {t('forumFeed.commentsHeader', { count: post.comments_count })}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['best', 'new'] as ForumCommentSort[]).map(s => {
                    const active = commentSort === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        onPress={() => setCommentSort(s)}
                        style={[
                          styles.sortPill,
                          active && {
                            backgroundColor: isDark
                              ? 'rgba(59,130,246,0.18)'
                              : 'rgba(59,130,246,0.1)',
                          },
                        ]}>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: active ? '700' : '600',
                            color: active ? '#3b82f6' : mutedCol,
                          }}>
                          {s === 'best'
                            ? t('forumFeed.commentSortBest')
                            : t('forumFeed.commentSortNew')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {commentTree.length === 0 ? (
                <Text
                  style={{
                    fontSize: 13,
                    color: mutedCol,
                    textAlign: 'center',
                    paddingVertical: 28,
                  }}>
                  {t('comments.noComments')}
                </Text>
              ) : (
                <View style={{ paddingHorizontal: 14 }}>
                  {commentTree.map(node => (
                    <NestedCommentItem
                      key={node.id}
                      node={node}
                      visualDepth={0}
                      currentUserId={user?.id}
                      isDark={isDark}
                      isCompact={isCompact}
                      navigation={navigation}
                      onVoteComment={handleVoteComment}
                      onReply={handleReply}
                      onReportComment={handleReportComment}
                      onBlockAuthor={handleBlockAuthor}
                      onDeleteComment={handleDeleteComment}
                      onContinueThread={handleContinueThread}
                      onOpenImage={handleOpenImage}
                    />
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        )}

        {/* Bottom Reply Composer Dock (Isolated from comment tree re-renders while typing) */}
        {post && (
          <ReplyComposerDock
            postId={post.id}
            rootCommentId={rootCommentId}
            replyState={replyState}
            autoFocusOnMount={Boolean(focusComment)}
            isDark={isDark}
            bottomInset={insets.bottom}
            surface={surface}
            borderCol={borderCol}
            textCol={textCol}
            mutedCol={mutedCol}
            onClearReplyTarget={handleClearReplyTarget}
            onRequireAuth={requireAuth}
            onCommentCreated={handleCommentCreated}
          />
        )}
      </KeyboardAvoidingView>

      {lightbox.visible && (
        <ForumImageLightbox
          visible
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={handleCloseLightbox}
        />
      )}

      {reportTarget.visible && (
        <ForumReportModal
          visible
          targetType={reportTarget.targetType}
          targetId={reportTarget.targetId}
          onClose={handleCloseReport}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16.5,
    fontWeight: '700',
    marginLeft: 4,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subthreadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 680,
    width: '94%',
    alignSelf: 'center',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
  },
  commentsSectionContainer: {
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
  },
  replyDock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  replyingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  replyImgPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  replyThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
  },
  replyInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  dockIconBtn: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spoilerToggleBtn: {
    width: 30,
    height: 34,
    marginBottom: 2,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyInput: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
    fontSize: 13.5,
    maxHeight: 90,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(ForumPostDetailScreen);
