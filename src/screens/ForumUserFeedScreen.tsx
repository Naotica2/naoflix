import MaterialIcons from '@react-native-vector-icons/material-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ForumImageLightbox from '../component/Forum/ForumImageLightbox';
import ForumReportModal from '../component/Forum/ForumReportModal';
import PostCard from '../component/Forum/PostCard';
import { useAuth } from '../misc/AuthContext';
import { useLanguage } from '../misc/LanguageContext';
import { ForumMediaItem, ForumPost } from '../types/forum';
import { RootStackNavigator } from '../types/navigation';
import {
  fetchForumFeed,
  getForumBlurNsfwPref,
  getForumCacheGeneration,
  parseFriendlyForumError,
  peekForumFeedCache,
  softDeleteForumPost,
  toggleForumBookmark,
  toggleUserBlock,
  voteForumPoll,
  voteForumPost,
} from '../utils/forumApi';

type Props = NativeStackScreenProps<RootStackNavigator, 'ForumUserFeed'>;

const PAGE_SIZE = 15;

function FeedSkeletonCard({ isDark, width }: { isDark: boolean; width: number }) {
  const bg = isDark ? '#18181f' : '#e4e4e7';
  const cardBg = isDark ? '#0f0f12' : '#ffffff';
  const border = isDark ? '#1e1e24' : '#e4e4e7';
  return (
    <View
      style={{
        width: '100%',
        maxWidth: 680,
        alignSelf: 'center',
        backgroundColor: cardBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderRadius: width >= 720 ? 12 : 0,
        borderColor: border,
        paddingHorizontal: 14,
        paddingVertical: 14,
        marginBottom: width >= 720 ? 10 : 0,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: bg }} />
        <View style={{ width: 110, height: 12, borderRadius: 6, backgroundColor: bg }} />
      </View>
      <View
        style={{ width: '82%', height: 16, borderRadius: 6, backgroundColor: bg, marginBottom: 8 }}
      />
      <View
        style={{ width: '58%', height: 12, borderRadius: 6, backgroundColor: bg, marginBottom: 12 }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ width: 72, height: 28, borderRadius: 14, backgroundColor: bg }} />
        <View style={{ width: 54, height: 28, borderRadius: 14, backgroundColor: bg }} />
      </View>
    </View>
  );
}

function ForumUserFeedScreen({ navigation, route }: Props) {
  const { mode, userId, username } = route.params;
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const targetAuthorId = useMemo(
    () => (mode === 'user_posts' ? userId || user?.id || null : null),
    [mode, user?.id, userId],
  );
  const feedKey = `${mode}:${targetAuthorId || ''}:${user?.id || ''}`;
  const isTablet = width >= 720;

  const [initialCachedPosts] = useState<ForumPost[] | null>(() =>
    peekForumFeedCache({
      category: 'all',
      sort: 'new',
      authorId: targetAuthorId,
      bookmarkedOnly: mode === 'bookmarks',
      limit: PAGE_SIZE,
    }),
  );

  const [posts, setPosts] = useState<ForumPost[]>(() => initialCachedPosts ?? []);
  const [loading, setLoading] = useState(() => initialCachedPosts === null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() =>
    initialCachedPosts ? initialCachedPosts.length >= PAGE_SIZE : true,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [blurNsfw, setBlurNsfw] = useState(() => getForumBlurNsfwPref());

  const [lightbox, setLightbox] = useState<{
    visible: boolean;
    images: ForumMediaItem[];
    index: number;
  }>({ visible: false, images: [], index: 0 });
  const [reportPostId, setReportPostId] = useState<string | null>(null);

  const loadingMoreRef = useRef(false);
  const requestSeqRef = useRef(0);
  const postsRef = useRef<ForumPost[]>(posts);
  const hasMoreRef = useRef(hasMore);
  const loadedKeyRef = useRef<string | null>(
    initialCachedPosts !== null ? feedKey : null,
  );
  const loadedGenRef = useRef<number>(
    initialCachedPosts !== null ? getForumCacheGeneration() : -1,
  );

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const screenTitle = useMemo(() => {
    if (mode === 'bookmarks') {
      return t('forumFeed.accountSavedPosts');
    }
    if (username) {
      return `@${username} \u00b7 ${t('forumFeed.accountMyPosts')}`;
    }
    return t('forumFeed.accountMyPosts');
  }, [mode, t, username]);

  const loadFeed = useCallback(
    async (opts?: { forceRefresh?: boolean; append?: boolean }) => {
      const append = Boolean(opts?.append);
      const forceRefresh = Boolean(opts?.forceRefresh);
      if (append && (loadingMoreRef.current || !hasMoreRef.current)) return;

      if (mode === 'bookmarks' && !user) {
        setPosts([]);
        setLoading(false);
        hasMoreRef.current = false;
        setHasMore(false);
        return;
      }
      if (mode === 'user_posts' && !targetAuthorId) {
        setPosts([]);
        setLoading(false);
        hasMoreRef.current = false;
        setHasMore(false);
        return;
      }

      const seq = ++requestSeqRef.current;
      if (append) {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        hasMoreRef.current = true;
        setHasMore(true);
        if (!forceRefresh) {
          setLoading(true);
          setErrorMsg(null);
        }
      }

      try {
        const currentPosts = postsRef.current;
        const lastPost =
          append && currentPosts.length > 0 ? currentPosts[currentPosts.length - 1] : null;
        const cursor = lastPost
          ? {
              isPinned: lastPost.is_pinned,
              numCursor: null,
              tsCursor: lastPost.created_at,
              id: lastPost.id,
            }
          : null;

        const fetched = await fetchForumFeed({
          category: 'all',
          sort: 'new',
          authorId: targetAuthorId,
          bookmarkedOnly: mode === 'bookmarks',
          limit: PAGE_SIZE,
          cursor,
          forceRefresh: forceRefresh && !append,
        });

        if (seq !== requestSeqRef.current) return;
        const nextHasMore = fetched.length >= PAGE_SIZE;
        hasMoreRef.current = nextHasMore;
        setHasMore(nextHasMore);
        setErrorMsg(null);
        loadedKeyRef.current = feedKey;
        loadedGenRef.current = getForumCacheGeneration();

        if (append) {
          setPosts(prev => {
            const seen = new Set(prev.map(p => p.id));
            return [...prev, ...fetched.filter(p => !seen.has(p.id))];
          });
        } else {
          setPosts(fetched);
        }
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        if (!append) {
          setErrorMsg(parseFriendlyForumError(err));
        } else {
          ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
        }
      } finally {
        if (seq === requestSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    },
    [feedKey, mode, targetAuthorId, user],
  );

  useFocusEffect(
    useCallback(() => {
      const nextBlur = getForumBlurNsfwPref();
      setBlurNsfw(prev => (prev === nextBlur ? prev : nextBlur));

      const currentGen = getForumCacheGeneration();
      if (loadedKeyRef.current === feedKey && loadedGenRef.current === currentGen) {
        return;
      }

      const cached = peekForumFeedCache({
        category: 'all',
        sort: 'new',
        authorId: targetAuthorId,
        bookmarkedOnly: mode === 'bookmarks',
        limit: PAGE_SIZE,
      });

      if (cached !== null) {
        loadedKeyRef.current = feedKey;
        loadedGenRef.current = currentGen;
        const nextHasMore = cached.length >= PAGE_SIZE;
        hasMoreRef.current = nextHasMore;
        setHasMore(nextHasMore);
        setPosts(prev => (prev === cached ? prev : cached));
        setLoading(false);
        return;
      }

      let cancelled = false;
      const task = InteractionManager.runAfterInteractions(() => {
        if (!cancelled) {
          loadFeed({ forceRefresh: false, append: false });
        }
      });
      return () => {
        cancelled = true;
        task.cancel();
      };
    }, [feedKey, loadFeed, mode, targetAuthorId]),
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setHasMore(true);
    loadFeed({ forceRefresh: true, append: false });
  }, [loadFeed]);

  const requireAuth = useCallback(() => {
    if (user && profile) return true;
    ToastAndroid.show(t('forumFeed.loginToVote'), ToastAndroid.SHORT);
    navigation.navigate(user ? 'UsernameSetupScreen' : 'LoginScreen');
    return false;
  }, [navigation, profile, t, user]);

  const handleVotePost = useCallback(
    async (postId: string, nextValue: -1 | 0 | 1) => {
      if (!requireAuth()) return;
      const snapshot = postsRef.current;
      setPosts(prev =>
        prev.map(p => {
          if (p.id !== postId) return p;
          const oldVote = p.my_vote || 0;
          const diff = nextValue - oldVote;
          return {
            ...p,
            my_vote: nextValue,
            score: p.score + diff,
            upvotes_count: p.upvotes_count + (nextValue === 1 ? 1 : 0) - (oldVote === 1 ? 1 : 0),
            downvotes_count:
              p.downvotes_count + (nextValue === -1 ? 1 : 0) - (oldVote === -1 ? 1 : 0),
          };
        }),
      );
      try {
        const res = await voteForumPost(postId, nextValue);
        loadedGenRef.current = getForumCacheGeneration();
        setPosts(prev =>
          prev.map(p =>
            p.id === postId
              ? {
                  ...p,
                  score: res.score,
                  upvotes_count: res.upvotes_count,
                  downvotes_count: res.downvotes_count,
                  my_vote: res.my_vote,
                }
              : p,
          ),
        );
      } catch (err) {
        setPosts(snapshot);
        ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
      }
    },
    [requireAuth],
  );

  const handleVotePoll = useCallback(
    async (postId: string, optionIndex: number) => {
      if (!requireAuth()) return;
      try {
        const res = await voteForumPoll(postId, optionIndex);
        loadedGenRef.current = getForumCacheGeneration();
        setPosts(prev =>
          prev.map(p =>
            p.id === postId
              ? { ...p, poll_tallies: res.poll_tallies, my_poll_option: res.my_poll_option }
              : p,
          ),
        );
      } catch (err) {
        ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
      }
    },
    [requireAuth],
  );

  const handleToggleBookmark = useCallback(
    async (postId: string) => {
      if (!requireAuth()) return;
      const snapshot = postsRef.current;
      setPosts(prev =>
        prev.map(p => (p.id === postId ? { ...p, is_bookmarked: !p.is_bookmarked } : p)),
      );
      try {
        const saved = await toggleForumBookmark(postId);
        loadedGenRef.current = getForumCacheGeneration();
        setPosts(prev => {
          const next = prev.map(p => (p.id === postId ? { ...p, is_bookmarked: saved } : p));
          return mode === 'bookmarks' ? next.filter(p => p.is_bookmarked) : next;
        });
      } catch (err) {
        setPosts(snapshot);
        ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
      }
    },
    [mode, requireAuth],
  );

  const handleBlockAuthor = useCallback(
    (authorId: string, authorUsername: string) => {
      if (!requireAuth()) return;
      Alert.alert(
        t('forumFeed.blockConfirmTitle', { username: authorUsername }),
        t('forumFeed.blockConfirmDesc'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('forumFeed.menuBlockUser', { username: authorUsername }),
            style: 'destructive',
            onPress: async () => {
              try {
                await toggleUserBlock(authorId);
                loadedGenRef.current = getForumCacheGeneration();
                setPosts(prev => prev.filter(p => p.author_id !== authorId));
                ToastAndroid.show(
                  t('forumFeed.blockedToast', { username: authorUsername }),
                  ToastAndroid.SHORT,
                );
              } catch (err) {
                ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
              }
            },
          },
        ],
      );
    },
    [requireAuth, t],
  );

  const handleDeletePost = useCallback(
    (post: ForumPost) => {
      Alert.alert(t('forumFeed.menuDelete'), t('forumFeed.deletePostConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await softDeleteForumPost(post.id);
              loadedGenRef.current = getForumCacheGeneration();
              setPosts(prev => prev.filter(p => p.id !== post.id));
            } catch (err) {
              ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
            }
          },
        },
      ]);
    },
    [t],
  );

  const handlePressPost = useCallback(
    (post: ForumPost) => {
      navigation.navigate('ForumPostDetail', {
        postId: post.id,
        initialPost: post,
      });
    },
    [navigation],
  );

  const handleFilterMedia = useCallback(
    (mediaKey: string, title: string) => {
      navigation.navigate('Home', {
        screen: 'ForumPage',
        params: { filterMediaKey: mediaKey, filterMediaTitle: title },
      });
    },
    [navigation],
  );

  const handleOpenLightbox = useCallback((images: ForumMediaItem[], index: number) => {
    setLightbox({ visible: true, images, index });
  }, []);

  const handleCloseLightbox = useCallback(() => {
    setLightbox(prev => ({ ...prev, visible: false }));
  }, []);

  const handleReportPost = useCallback(
    (postId: string) => {
      if (!requireAuth()) return;
      setReportPostId(postId);
    },
    [requireAuth],
  );

  const handleCloseReport = useCallback(() => {
    setReportPostId(null);
  }, []);

  const keyExtractor = useCallback((item: ForumPost) => item.id, []);

  const handleEndReached = useCallback(() => {
    if (!loading && !refreshing && hasMore) {
      loadFeed({ append: true });
    }
  }, [hasMore, loadFeed, loading, refreshing]);

  const renderPost = useCallback(
    ({ item }: { item: ForumPost }) => (
      <PostCard
        post={item}
        currentUserId={user?.id}
        blurNsfw={blurNsfw}
        isDark={isDark}
        isTablet={isTablet}
        navigation={navigation}
        onPressPost={handlePressPost}
        onVotePost={handleVotePost}
        onVotePoll={handleVotePoll}
        onToggleBookmark={handleToggleBookmark}
        onOpenLightbox={handleOpenLightbox}
        onReportPost={handleReportPost}
        onBlockAuthor={handleBlockAuthor}
        onDeletePost={handleDeletePost}
        onFilterMedia={handleFilterMedia}
      />
    ),
    [
      blurNsfw,
      handleBlockAuthor,
      handleDeletePost,
      handleFilterMedia,
      handleOpenLightbox,
      handlePressPost,
      handleReportPost,
      handleToggleBookmark,
      handleVotePoll,
      handleVotePost,
      isDark,
      isTablet,
      navigation,
      user?.id,
    ],
  );

  const bg = isDark ? '#0a0a0c' : '#f4f4f5';
  const surfaceBg = isDark ? '#0f0f12' : '#ffffff';
  const borderCol = isDark ? '#1e1e24' : '#e4e4e7';
  const isOwnPosts = mode === 'user_posts' && Boolean(user?.id && targetAuthorId === user.id);

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: surfaceBg,
            borderBottomColor: borderCol,
          },
        ]}>
        <View style={styles.headerInner}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={22} color={isDark ? '#e4e4e7' : '#18181b'} />
          </TouchableOpacity>
          <Text
            style={[styles.headerTitle, { color: isDark ? '#f4f4f5' : '#09090b' }]}
            numberOfLines={1}>
            {screenTitle}
          </Text>
          {isOwnPosts ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('ForumComposer', { defaultCategory: 'general' })}
              style={styles.newPostHeaderBtn}>
              <MaterialIcons name="add" size={18} color="#ffffff" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 32 }} />
          )}
        </View>
      </View>

      {loading && posts.length === 0 ? (
        <ScrollView contentContainerStyle={{ paddingTop: width >= 720 ? 12 : 0 }}>
          <FeedSkeletonCard isDark={isDark} width={width} />
          <FeedSkeletonCard isDark={isDark} width={width} />
          <FeedSkeletonCard isDark={isDark} width={width} />
        </ScrollView>
      ) : (
        <FlashList
          data={posts}
          keyExtractor={keyExtractor}
          extraData={`${isDark}-${blurNsfw}-${isTablet}`}
          renderItem={renderPost}
          drawDistance={450}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.45}
          contentContainerStyle={{
            paddingTop: isTablet ? 12 : 0,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: isTablet ? 14 : 0,
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialIcons
                name={errorMsg ? 'wifi-off' : mode === 'bookmarks' ? 'bookmark-border' : 'forum'}
                size={42}
                color={isDark ? '#3f3f46' : '#d4d4d8'}
              />
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: isDark ? '#e4e4e7' : '#18181b',
                  marginTop: 10,
                }}>
                {errorMsg ? t('common.error') : t('forumFeed.emptyTitle')}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: '#71717a',
                  textAlign: 'center',
                  marginTop: 4,
                  paddingHorizontal: 28,
                }}>
                {errorMsg ? t('forumFeed.errorLoad') : t('forumFeed.emptyDesc')}
              </Text>
              {errorMsg ? (
                <TouchableOpacity onPress={handleRefresh} style={styles.emptyActionBtn}>
                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>
                    {t('common.retry')}
                  </Text>
                </TouchableOpacity>
              ) : isOwnPosts ? (
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('ForumComposer', { defaultCategory: 'general' })
                  }
                  style={styles.emptyActionBtn}>
                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>
                    {t('forumFeed.composerTitle')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#3b82f6" />
              </View>
            ) : null
          }
        />
      )}

      {lightbox.visible && (
        <ForumImageLightbox
          visible
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={handleCloseLightbox}
        />
      )}

      {Boolean(reportPostId) && (
        <ForumReportModal
          visible
          targetType="post"
          targetId={reportPostId}
          onClose={handleCloseReport}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16.5,
    fontWeight: '700',
  },
  newPostHeaderBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyActionBtn: {
    marginTop: 14,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 9,
  },
});

export default memo(ForumUserFeedScreen);
