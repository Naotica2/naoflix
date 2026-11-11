import MaterialIcons from '@react-native-vector-icons/material-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
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
import {
  BlockedUserProfile,
  ForumFilterCategory,
  ForumMediaItem,
  ForumPost,
  ForumSort,
} from '../types/forum';
import { HomeNavigator } from '../types/navigation';
import {
  fetchBlockedUsers,
  fetchForumFeed,
  getForumBlurNsfwPref,
  getForumCacheGeneration,
  parseFriendlyForumError,
  peekForumFeedCache,
  setForumBlurNsfwPref,
  softDeleteForumPost,
  toggleForumBookmark,
  toggleUserBlock,
  voteForumPoll,
  voteForumPost,
} from '../utils/forumApi';

type Props = BottomTabScreenProps<HomeNavigator, 'ForumPage'>;

const CATEGORIES: { key: ForumFilterCategory; labelKey: string; color: string }[] = [
  { key: 'all', labelKey: 'forumFeed.catAll', color: '#3b82f6' },
  { key: 'general', labelKey: 'forumFeed.catGeneral', color: '#64748b' },
  { key: 'anime', labelKey: 'forumFeed.catAnime', color: '#3b82f6' },
  { key: 'film', labelKey: 'forumFeed.catFilm', color: '#10b981' },
  { key: 'comics', labelKey: 'forumFeed.catComics', color: '#f59e0b' },
  { key: 'review', labelKey: 'forumFeed.catReview', color: '#eab308' },
  { key: 'nobar', labelKey: 'forumFeed.catNobar', color: '#6366f1' },
];

const SORTS: { key: ForumSort; labelKey: string; icon: string }[] = [
  { key: 'hot', labelKey: 'forumFeed.sortHot', icon: 'local-fire-department' },
  { key: 'new', labelKey: 'forumFeed.sortNew', icon: 'schedule' },
  { key: 'top', labelKey: 'forumFeed.sortTop', icon: 'trending-up' },
];

const PAGE_SIZE = 15;

function ForumSkeletonCard({ isDark, width }: { isDark: boolean; width: number }) {
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
        style={{ width: '86%', height: 16, borderRadius: 6, backgroundColor: bg, marginBottom: 8 }}
      />
      <View
        style={{ width: '62%', height: 12, borderRadius: 6, backgroundColor: bg, marginBottom: 12 }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ width: 76, height: 28, borderRadius: 14, backgroundColor: bg }} />
        <View style={{ width: 58, height: 28, borderRadius: 14, backgroundColor: bg }} />
      </View>
    </View>
  );
}

function ForumPage({ navigation, route }: Props) {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const isTablet = width >= 720;

  const [category, setCategory] = useState<ForumFilterCategory>('all');
  const [sort, setSort] = useState<ForumSort>('hot');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [filterMedia, setFilterMedia] = useState<{ key: string; title: string } | null>(null);

  const feedKey = `${category}:${sort}:${activeSearch}:${filterMedia?.key || ''}:${savedOnly}`;

  const [initialCachedPosts] = useState<ForumPost[] | null>(() =>
    peekForumFeedCache({
      category: 'all',
      sort: 'hot',
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserProfile[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);

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
    initialCachedPosts !== null ? 'all:hot:::false' : null,
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

  // Sync deep-link filter parameters pushed from MediaForumSection
  useEffect(() => {
    const params = route.params;
    if (!params) return;
    if (params.filterMediaKey) {
      setFilterMedia({
        key: params.filterMediaKey,
        title: params.filterMediaTitle || params.filterMediaKey,
      });
      setCategory('all');
    }
    if (params.initialCategory) {
      setCategory(params.initialCategory);
    }
  }, [route.params]);

  const loadFeed = useCallback(
    async (opts?: { forceRefresh?: boolean; append?: boolean }) => {
      const append = Boolean(opts?.append);
      const forceRefresh = Boolean(opts?.forceRefresh);
      if (append && (loadingMoreRef.current || !hasMoreRef.current)) return;

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
              numCursor:
                sort === 'top' ? lastPost.score : sort === 'hot' ? lastPost.hot_score : null,
              tsCursor: sort === 'new' ? lastPost.created_at : null,
              id: lastPost.id,
            }
          : null;

        const fetched = await fetchForumFeed({
          category,
          sort,
          search: activeSearch || null,
          mediaKey: filterMedia?.key || null,
          bookmarkedOnly: savedOnly,
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
            const extra = fetched.filter(p => !seen.has(p.id));
            return [...prev, ...extra];
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
    [activeSearch, category, feedKey, filterMedia?.key, savedOnly, sort],
  );

  // Sync only when filters/sort change or cache was invalidated elsewhere
  useFocusEffect(
    useCallback(() => {
      const nextBlur = getForumBlurNsfwPref();
      setBlurNsfw(prev => (prev === nextBlur ? prev : nextBlur));

      const currentGen = getForumCacheGeneration();
      if (loadedKeyRef.current === feedKey && loadedGenRef.current === currentGen) {
        return;
      }

      const cached = peekForumFeedCache({
        category,
        sort,
        search: activeSearch || null,
        mediaKey: filterMedia?.key || null,
        bookmarkedOnly: savedOnly,
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
    }, [activeSearch, category, feedKey, filterMedia?.key, loadFeed, savedOnly, sort]),
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setHasMore(true);
    loadFeed({ forceRefresh: true, append: false });
  }, [loadFeed]);

  const requireAuth = useCallback(() => {
    if (user && profile) return true;
    ToastAndroid.show(t('forumFeed.loginToVote'), ToastAndroid.SHORT);
    (navigation as any).navigate(user ? 'UsernameSetupScreen' : 'LoginScreen');
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
              ? {
                  ...p,
                  poll_tallies: res.poll_tallies,
                  my_poll_option: res.my_poll_option,
                }
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
          return savedOnly ? next.filter(p => p.is_bookmarked) : next;
        });
      } catch (err) {
        setPosts(snapshot);
        ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
      }
    },
    [requireAuth, savedOnly],
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
              loadedGenRef.current = getForumCacheGeneration();
              setPosts(prev => prev.filter(p => p.author_id !== authorId));
              ToastAndroid.show(t('forumFeed.blockedToast', { username }), ToastAndroid.SHORT);
            } catch (err) {
              ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
            }
          },
        },
      ]);
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

  const handleOpenSettings = useCallback(async () => {
    setSettingsOpen(true);
    if (!user) {
      setBlockedUsers([]);
      return;
    }
    setLoadingBlocked(true);
    try {
      const list = await fetchBlockedUsers();
      setBlockedUsers(list);
    } catch {
      setBlockedUsers([]);
    } finally {
      setLoadingBlocked(false);
    }
  }, [user]);

  const handleToggleBlurPref = useCallback(async (val: boolean) => {
    setBlurNsfw(val);
    await setForumBlurNsfwPref(val);
  }, []);

  const handleUnblockUser = useCallback(
    async (target: BlockedUserProfile) => {
      try {
        await toggleUserBlock(target.id);
        setBlockedUsers(prev => prev.filter(u => u.id !== target.id));
        ToastAndroid.show(
          t('forumFeed.unblockedToast', { username: target.username }),
          ToastAndroid.SHORT,
        );
        loadFeed({ forceRefresh: true, append: false });
      } catch (err) {
        ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
      }
    },
    [loadFeed, t],
  );

  const handleOpenComposer = useCallback(() => {
    if (!requireAuth()) return;
    const matchedLinkedMedia = filterMedia
      ? postsRef.current.find(p => p.linked_media?.media_key === filterMedia.key)?.linked_media
      : undefined;
    (navigation as any).navigate('ForumComposer', {
      linkedMedia: matchedLinkedMedia,
      defaultCategory: category === 'all' ? 'general' : category,
    });
  }, [category, filterMedia, navigation, requireAuth]);

  const handlePressPost = useCallback(
    (post: ForumPost) => {
      (navigation as any).navigate('ForumPostDetail', {
        postId: post.id,
        initialPost: post,
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

  const handleFilterMedia = useCallback((mediaKey: string, title: string) => {
    setFilterMedia({ key: mediaKey, title });
    setCategory('all');
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

  const headerChromeBg = isDark ? '#0a0a0c' : '#f4f4f5';
  const surfaceBg = isDark ? '#0f0f12' : '#ffffff';
  const borderCol = isDark ? '#1e1e24' : '#e4e4e7';

  const ListHeader = useMemo(
    () => (
      <View
        style={{
          width: '100%',
          maxWidth: 680,
          alignSelf: 'center',
          paddingTop: 6,
          paddingBottom: 6,
        }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 14,
            gap: 7,
            paddingBottom: 8,
          }}>
          {CATEGORIES.map(cat => {
            const active = category === cat.key && !savedOnly;
            return (
              <TouchableOpacity
                key={cat.key}
                activeOpacity={0.75}
                onPress={() => {
                  setSavedOnly(false);
                  setCategory(cat.key);
                }}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: active ? '#3b82f6' : isDark ? '#141419' : '#ffffff',
                    borderColor: active ? '#3b82f6' : borderCol,
                  },
                ]}>
                {!active && <View style={[styles.catDot, { backgroundColor: cat.color }]} />}
                <Text
                  maxFontSizeMultiplier={1.15}
                  style={{
                    fontSize: isCompact ? 11.5 : 12.5,
                    fontWeight: active ? '700' : '600',
                    color: active ? '#ffffff' : isDark ? '#cbd5e1' : '#3f3f46',
                  }}>
                  {t(cat.labelKey as any)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View
          style={[
            styles.sortBar,
            {
              backgroundColor: surfaceBg,
              borderTopColor: borderCol,
              borderBottomColor: borderCol,
              borderRadius: width >= 720 ? 10 : 0,
              borderLeftWidth: width >= 720 ? StyleSheet.hairlineWidth : 0,
              borderRightWidth: width >= 720 ? StyleSheet.hairlineWidth : 0,
            },
          ]}>
          <View style={styles.sortLeftGroup}>
            {SORTS.map(s => {
              const active = sort === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  activeOpacity={0.75}
                  onPress={() => setSort(s.key)}
                  style={[
                    styles.sortBtn,
                    active && {
                      backgroundColor: isDark ? 'rgba(59,130,246,0.16)' : 'rgba(59,130,246,0.1)',
                    },
                  ]}>
                  <MaterialIcons
                    name={s.icon as any}
                    size={15}
                    color={active ? '#3b82f6' : isDark ? '#71717a' : '#71717a'}
                  />
                  <Text
                    maxFontSizeMultiplier={1.15}
                    style={{
                      fontSize: 12.5,
                      fontWeight: active ? '700' : '600',
                      color: active ? '#3b82f6' : isDark ? '#a1a1aa' : '#52525b',
                    }}>
                    {t(s.labelKey as any)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => {
              if (!savedOnly && !requireAuth()) return;
              setSavedOnly(prev => !prev);
            }}
            style={[
              styles.savedBtn,
              {
                borderColor: savedOnly ? '#3b82f6' : borderCol,
                backgroundColor: savedOnly
                  ? isDark
                    ? 'rgba(59,130,246,0.16)'
                    : 'rgba(59,130,246,0.1)'
                  : 'transparent',
              },
            ]}>
            <MaterialIcons
              name={savedOnly ? 'bookmark' : 'bookmark-border'}
              size={15}
              color={savedOnly ? '#3b82f6' : isDark ? '#a1a1aa' : '#52525b'}
            />
            <Text
              maxFontSizeMultiplier={1.1}
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: savedOnly ? '#3b82f6' : isDark ? '#a1a1aa' : '#52525b',
              }}>
              {t('forumFeed.savedOnly')}
            </Text>
          </TouchableOpacity>
        </View>

        {filterMedia && (
          <View
            style={[
              styles.filterBanner,
              {
                backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : '#eff6ff',
                borderColor: isDark ? 'rgba(59,130,246,0.35)' : '#bfdbfe',
              },
            ]}>
            <MaterialIcons name="filter-list" size={16} color="#3b82f6" />
            <Text
              style={{
                flex: 1,
                fontSize: 12.5,
                fontWeight: '600',
                color: isDark ? '#93c5fd' : '#1e40af',
              }}
              numberOfLines={1}>
              {t('forumFeed.filteredByTitle', { title: filterMedia.title })}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setFilterMedia(null);
                (navigation as any).setParams({
                  filterMediaKey: undefined,
                  filterMediaTitle: undefined,
                });
              }}
              style={styles.filterResetBtn}>
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#3b82f6' }}>
                {t('forumFeed.clearFilter')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    ),
    [
      borderCol,
      category,
      filterMedia,
      isCompact,
      isDark,
      navigation,
      requireAuth,
      savedOnly,
      sort,
      surfaceBg,
      t,
      width,
    ],
  );

  return (
    <View style={[styles.container, { backgroundColor: headerChromeBg }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 8,
            backgroundColor: surfaceBg,
            borderBottomColor: borderCol,
          },
        ]}>
        <View style={styles.topBarInner}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={[
                styles.headerTitle,
                { color: isDark ? '#f4f4f5' : '#09090b', fontSize: isCompact ? 18 : 20 },
              ]}
              numberOfLines={1}>
              {t('forumFeed.title')}
            </Text>
            <Text
              style={{ fontSize: 11.5, color: isDark ? '#71717a' : '#71717a', marginTop: 1 }}
              numberOfLines={1}>
              {t('forumFeed.subtitle')}
            </Text>
          </View>

          <View style={styles.topActions}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                if (searchOpen && activeSearch) {
                  setSearchDraft('');
                  setActiveSearch('');
                }
                setSearchOpen(prev => !prev);
              }}
              style={[
                styles.headerIconBtn,
                {
                  backgroundColor: searchOpen
                    ? isDark
                      ? 'rgba(59,130,246,0.18)'
                      : '#eff6ff'
                    : isDark
                      ? '#18181d'
                      : '#f4f4f5',
                },
              ]}>
              <MaterialIcons
                name={searchOpen ? 'close' : 'search'}
                size={20}
                color={searchOpen ? '#3b82f6' : isDark ? '#d4d4d8' : '#3f3f46'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.75}
              onPress={handleOpenSettings}
              style={[styles.headerIconBtn, { backgroundColor: isDark ? '#18181d' : '#f4f4f5' }]}>
              <MaterialIcons name="tune" size={19} color={isDark ? '#d4d4d8' : '#3f3f46'} />
            </TouchableOpacity>
          </View>
        </View>

        {searchOpen && (
          <View style={styles.searchBarRow}>
            <View
              style={[
                styles.searchInputBox,
                {
                  backgroundColor: isDark ? '#16161b' : '#f4f4f5',
                  borderColor: borderCol,
                },
              ]}>
              <MaterialIcons name="search" size={18} color="#71717a" />
              <TextInput
                value={searchDraft}
                onChangeText={setSearchDraft}
                onSubmitEditing={() => setActiveSearch(searchDraft.trim())}
                returnKeyType="search"
                autoFocus
                placeholder={t('forumFeed.searchPlaceholder')}
                placeholderTextColor="#71717a"
                style={[styles.searchInput, { color: isDark ? '#f4f4f5' : '#09090b' }]}
              />
              {searchDraft.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setSearchDraft('');
                    setActiveSearch('');
                  }}
                  hitSlop={8}>
                  <MaterialIcons name="cancel" size={16} color="#71717a" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setActiveSearch(searchDraft.trim())}
              style={styles.searchSubmitBtn}>
              <Text style={{ color: '#ffffff', fontSize: 12.5, fontWeight: '700' }}>
                {t('common.search')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {loading && posts.length === 0 ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
          {ListHeader}
          <ForumSkeletonCard isDark={isDark} width={width} />
          <ForumSkeletonCard isDark={isDark} width={width} />
          <ForumSkeletonCard isDark={isDark} width={width} />
        </ScrollView>
      ) : (
        <FlashList
          data={posts}
          keyExtractor={keyExtractor}
          extraData={`${isDark}-${blurNsfw}-${isTablet}`}
          renderItem={renderPost}
          ListHeaderComponent={ListHeader}
          drawDistance={450}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.45}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 84,
            paddingHorizontal: isTablet ? 14 : 0,
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialIcons
                name={errorMsg ? 'wifi-off' : 'forum'}
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
                {errorMsg
                  ? t('forumFeed.errorLoad')
                  : filterMedia
                    ? t('forumFeed.emptyFilterDesc', { title: filterMedia.title })
                    : t('forumFeed.emptyDesc')}
              </Text>
              <TouchableOpacity
                onPress={errorMsg ? handleRefresh : handleOpenComposer}
                style={styles.emptyActionBtn}>
                <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>
                  {errorMsg ? t('common.retry') : t('forumFeed.composerTitle')}
                </Text>
              </TouchableOpacity>
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

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleOpenComposer}
        style={[
          styles.composeFab,
          {
            bottom: 14,
            right: 16,
          },
        ]}>
        <MaterialIcons name="edit" size={18} color="#ffffff" />
        <Text maxFontSizeMultiplier={1.1} style={styles.composeFabText}>
          {t('forumFeed.newPost')}
        </Text>
      </TouchableOpacity>

      {settingsOpen && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setSettingsOpen(false)}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setSettingsOpen(false)}
            style={styles.modalBackdrop}>
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.modalCard, { backgroundColor: surfaceBg, borderColor: borderCol }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: isDark ? '#f4f4f5' : '#09090b' }]}>
                  {t('forumFeed.title')}
                </Text>
                <TouchableOpacity onPress={() => setSettingsOpen(false)} hitSlop={10}>
                  <MaterialIcons name="close" size={20} color="#71717a" />
                </TouchableOpacity>
              </View>

              <View style={[styles.settingRow, { borderColor: borderCol }]}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: isDark ? '#e4e4e7' : '#18181b',
                    }}>
                    {blurNsfw ? t('forumFeed.blurNsfwOn') : t('forumFeed.blurNsfwOff')}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#71717a', marginTop: 2 }}>
                    {t('forumFeed.nsfwRevealHint')}
                  </Text>
                </View>
                <Switch
                  value={blurNsfw}
                  onValueChange={handleToggleBlurPref}
                  trackColor={{ false: '#3f3f46', true: '#3b82f6' }}
                  thumbColor="#ffffff"
                />
              </View>

              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: isDark ? '#cbd5e1' : '#3f3f46',
                  marginTop: 14,
                  marginBottom: 8,
                }}>
                {t('forumFeed.blockedUsersBtn', { count: blockedUsers.length })}
              </Text>

              {loadingBlocked ? (
                <ActivityIndicator size="small" color="#3b82f6" style={{ marginVertical: 14 }} />
              ) : blockedUsers.length === 0 ? (
                <Text style={{ fontSize: 12.5, color: '#71717a', paddingVertical: 8 }}>
                  {t('forumFeed.blockedUsersEmpty')}
                </Text>
              ) : (
                <ScrollView style={{ maxHeight: 210 }}>
                  {blockedUsers.map(u => (
                    <View key={u.id} style={[styles.blockedRow, { borderBottomColor: borderCol }]}>
                      <Text
                        style={{ flex: 1, fontSize: 13.5, color: isDark ? '#e4e4e7' : '#18181b' }}
                        numberOfLines={1}>
                        @{u.username}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleUnblockUser(u)}
                        style={styles.unblockBtn}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#3b82f6' }}>
                          {t('forumFeed.unblockBtn')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
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
  topBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  headerTitle: {
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  searchInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    height: 40,
    gap: 7,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    paddingVertical: 0,
  },
  searchSubmitBtn: {
    backgroundColor: '#3b82f6',
    height: 40,
    paddingHorizontal: 13,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  catDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
  },
  savedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
  },
  filterResetBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
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
  composeFab: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 21,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  composeFabText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  unblockBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
});

export default memo(ForumPage);
