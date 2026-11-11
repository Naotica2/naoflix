import MaterialIcons from '@react-native-vector-icons/material-icons';
import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Linking,
  Modal,
  Share,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useLanguage } from '../../misc/LanguageContext';
import {
  extractDomainLabel,
  formatCompactCount,
  formatRelativeTime,
  ForumCategory,
  ForumMediaItem,
  ForumPost,
  getDirectMediaUrlFromLink,
  isGifUrl,
  isNobarPostActive,
  needsExternalMediaResolve,
} from '../../types/forum';
import {
  openLinkedMediaDetail,
  peekResolvedExternalMediaUrl,
  resolveExternalMediaUrl,
} from '../../utils/forumApi';
import { getLevelColor } from '../../utils/LevelSystem';
import ForumImage from './ForumImage';
import ForumRichText from './ForumRichText';

interface Props {
  post: ForumPost;
  currentUserId?: string | null;
  blurNsfw?: boolean;
  isDetail?: boolean;
  isDark?: boolean;
  isTablet?: boolean;
  navigation: any;
  onPressPost?: (post: ForumPost) => void;
  onVotePost: (postId: string, value: -1 | 0 | 1) => void;
  onVotePoll: (postId: string, optionIndex: number) => void;
  onToggleBookmark: (postId: string) => void;
  onOpenLightbox: (images: ForumMediaItem[], index: number) => void;
  onReportPost: (postId: string) => void;
  onBlockAuthor: (authorId: string, username: string) => void;
  onDeletePost: (post: ForumPost) => void;
  onFilterMedia?: (mediaKey: string, title: string) => void;
}

const CATEGORY_META: Record<ForumCategory, { labelKey: string; color: string }> = {
  general: { labelKey: 'forumFeed.catGeneral', color: '#64748b' },
  anime: { labelKey: 'forumFeed.catAnime', color: '#3b82f6' },
  film: { labelKey: 'forumFeed.catFilm', color: '#10b981' },
  comics: { labelKey: 'forumFeed.catComics', color: '#f59e0b' },
  review: { labelKey: 'forumFeed.catReview', color: '#eab308' },
  nobar: { labelKey: 'forumFeed.catNobar', color: '#6366f1' },
};

function PostCard({
  post,
  currentUserId,
  blurNsfw = true,
  isDetail = false,
  isDark: isDarkProp,
  isTablet: isTabletProp,
  navigation,
  onPressPost,
  onVotePost,
  onVotePoll,
  onToggleBookmark,
  onOpenLightbox,
  onReportPost,
  onBlockAuthor,
  onDeletePost,
  onFilterMedia,
}: Props) {
  const { t, language } = useLanguage();
  const systemIsDark = useColorScheme() === 'dark';
  const isDark = isDarkProp ?? systemIsDark;
  const isTablet = isTabletProp ?? Dimensions.get('window').width >= 720;

  const externalLink = post.external_link || '';
  const postResetKey = `${post.id}:${externalLink}`;

  const [revealedSpoilerPostId, setRevealedSpoilerPostId] = useState<string | null>(null);
  const [revealedNsfwPostId, setRevealedNsfwPostId] = useState<string | null>(null);
  const [failedExternalKey, setFailedExternalKey] = useState<string | null>(null);
  const [resolvedExternalEntry, setResolvedExternalEntry] = useState<{
    link: string;
    url: string | null;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const spoilerRevealed = revealedSpoilerPostId === post.id;
  const nsfwRevealed = revealedNsfwPostId === post.id;
  const externalImgFailed = failedExternalKey === postResetKey;

  const directExternalMedia = useMemo(
    () => (externalLink ? getDirectMediaUrlFromLink(externalLink) : null),
    [externalLink],
  );
  const shouldResolveExternalMedia = useMemo(
    () => Boolean(externalLink && !directExternalMedia && needsExternalMediaResolve(externalLink)),
    [directExternalMedia, externalLink],
  );
  const cachedExternalMedia = useMemo(
    () => (shouldResolveExternalMedia ? peekResolvedExternalMediaUrl(externalLink) : undefined),
    [externalLink, shouldResolveExternalMedia],
  );

  useEffect(() => {
    if (!shouldResolveExternalMedia || cachedExternalMedia !== undefined) {
      return;
    }
    let cancelled = false;
    resolveExternalMediaUrl(externalLink)
      .then(url => {
        if (!cancelled) {
          setResolvedExternalEntry({ link: externalLink, url });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedExternalEntry({ link: externalLink, url: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cachedExternalMedia, externalLink, shouldResolveExternalMedia]);

  const effectiveExternalMediaUrl =
    directExternalMedia ||
    (shouldResolveExternalMedia
      ? cachedExternalMedia !== undefined
        ? cachedExternalMedia
        : resolvedExternalEntry?.link === externalLink
          ? resolvedExternalEntry.url
          : null
      : null);

  const isExternalGif = Boolean(
    effectiveExternalMediaUrl && (isGifUrl(effectiveExternalMediaUrl) || isGifUrl(externalLink)),
  );

  const isMine = Boolean(currentUserId && currentUserId === post.author_id);
  const catInfo = CATEGORY_META[post.category] || CATEGORY_META.general;
  const relTime = useMemo(
    () => formatRelativeTime(post.created_at, language),
    [post.created_at, language],
  );
  const levelColor = getLevelColor(post.author_level);

  const isSpoilerShielded = post.is_spoiler && !spoilerRevealed;
  const isNsfwShielded = post.is_nsfw && blurNsfw && !nsfwRevealed;
  const hideMediaContent = isSpoilerShielded || isNsfwShielded;

  const nobarLive = useMemo(
    () => (post.post_type === 'nobar' ? isNobarPostActive(post.created_at) : false),
    [post.post_type, post.created_at],
  );

  const totalPollVotes = useMemo(
    () => post.poll_tallies.reduce((sum, v) => sum + (Number(v) || 0), 0),
    [post.poll_tallies],
  );
  const pollEnded = useMemo(() => {
    if (!post.poll_expires_at) return false;
    return new Date(post.poll_expires_at).getTime() < Date.now();
  }, [post.poll_expires_at]);

  const cardContainerStyle = useMemo(
    () => ({
      width: '100%' as const,
      maxWidth: 680,
      alignSelf: 'center' as const,
      backgroundColor: isDark ? '#0f0f12' : '#ffffff',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderTopWidth: isTablet ? StyleSheet.hairlineWidth : 0,
      borderLeftWidth: isTablet ? StyleSheet.hairlineWidth : 0,
      borderRightWidth: isTablet ? StyleSheet.hairlineWidth : 0,
      borderRadius: isTablet ? 12 : 0,
      borderColor: isDark ? '#1e1e24' : '#e4e4e7',
      paddingHorizontal: 14,
      paddingVertical: 13,
      marginBottom: isTablet ? 10 : 0,
    }),
    [isDark, isTablet],
  );

  const handleShare = async () => {
    setMenuOpen(false);
    try {
      const snippet = post.body ? `\n\n${post.body.slice(0, 140)}...` : '';
      const nobarText = post.nobar_room_id ? `\nRoom Nobar: ${post.nobar_room_id}` : '';
      await Share.share({
        message: `[NaoFlix Forum] ${post.title}${nobarText}${snippet}`,
      });
    } catch {}
  };

  const renderMediaGrid = () => {
    const imgs = post.media_items || [];
    if (imgs.length === 0) return null;

    if (imgs.length === 1) {
      const item = imgs[0];
      return (
        <TouchableOpacity
          activeOpacity={0.9}
          disabled={hideMediaContent}
          onPress={() => onOpenLightbox(imgs, 0)}
          style={[styles.singleImgWrap, { backgroundColor: isDark ? '#16161b' : '#f4f4f5' }]}>
          <ForumImage
            uri={isDetail ? item.url : item.thumbUrl || item.url}
            recyclingKey={item.url}
            blurRadius={hideMediaContent ? 22 : 0}
            style={styles.singleImg}
          />
          {hideMediaContent && renderShieldOverlay()}
        </TouchableOpacity>
      );
    }

    if (imgs.length === 2) {
      return (
        <View style={styles.collageRow}>
          {imgs.map((item, idx) => (
            <TouchableOpacity
              key={`${item.url}-${idx}`}
              activeOpacity={0.9}
              disabled={hideMediaContent}
              onPress={() => onOpenLightbox(imgs, idx)}
              style={[styles.twoImgCell, { backgroundColor: isDark ? '#16161b' : '#f4f4f5' }]}>
              <ForumImage
                uri={item.thumbUrl || item.url}
                recyclingKey={item.url}
                blurRadius={hideMediaContent ? 22 : 0}
                style={styles.fillImg}
              />
            </TouchableOpacity>
          ))}
          {hideMediaContent && renderShieldOverlay()}
        </View>
      );
    }

    if (imgs.length === 3) {
      return (
        <View style={styles.collageRow}>
          <TouchableOpacity
            activeOpacity={0.9}
            disabled={hideMediaContent}
            onPress={() => onOpenLightbox(imgs, 0)}
            style={[styles.threeLeftCell, { backgroundColor: isDark ? '#16161b' : '#f4f4f5' }]}>
            <ForumImage
              uri={imgs[0].thumbUrl || imgs[0].url}
              recyclingKey={imgs[0].url}
              blurRadius={hideMediaContent ? 22 : 0}
              style={styles.fillImg}
            />
          </TouchableOpacity>
          <View style={styles.threeRightCol}>
            {[1, 2].map(idx => (
              <TouchableOpacity
                key={`${imgs[idx].url}-${idx}`}
                activeOpacity={0.9}
                disabled={hideMediaContent}
                onPress={() => onOpenLightbox(imgs, idx)}
                style={[
                  styles.threeRightCell,
                  { backgroundColor: isDark ? '#16161b' : '#f4f4f5' },
                ]}>
                <ForumImage
                  uri={imgs[idx].thumbUrl || imgs[idx].url}
                  recyclingKey={imgs[idx].url}
                  blurRadius={hideMediaContent ? 22 : 0}
                  style={styles.fillImg}
                />
              </TouchableOpacity>
            ))}
          </View>
          {hideMediaContent && renderShieldOverlay()}
        </View>
      );
    }

    return (
      <View style={styles.fourGrid}>
        {imgs.slice(0, 4).map((item, idx) => (
          <TouchableOpacity
            key={`${item.url}-${idx}`}
            activeOpacity={0.9}
            disabled={hideMediaContent}
            onPress={() => onOpenLightbox(imgs, idx)}
            style={[styles.fourCell, { backgroundColor: isDark ? '#16161b' : '#f4f4f5' }]}>
            <ForumImage
              uri={item.thumbUrl || item.url}
              recyclingKey={item.url}
              blurRadius={hideMediaContent ? 22 : 0}
              style={styles.fillImg}
            />
          </TouchableOpacity>
        ))}
        {hideMediaContent && renderShieldOverlay()}
      </View>
    );
  };

  const renderShieldOverlay = () => {
    const label = isNsfwShielded
      ? t('forumFeed.nsfwBadge')
      : post.spoiler_label
        ? `${t('forumFeed.spoilerBadge')} (${post.spoiler_label})`
        : t('forumFeed.spoilerRevealTitle');
    const hint = isNsfwShielded ? t('forumFeed.nsfwRevealHint') : t('forumFeed.spoilerRevealHint');

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => {
          if (isNsfwShielded) setRevealedNsfwPostId(post.id);
          if (isSpoilerShielded) setRevealedSpoilerPostId(post.id);
        }}
        style={styles.shieldOverlay}>
        <MaterialIcons
          name={isNsfwShielded ? 'visibility-off' : 'warning-amber'}
          size={22}
          color="#f4f4f5"
        />
        <Text style={styles.shieldTitle}>{label}</Text>
        <Text style={styles.shieldHint}>{hint}</Text>
      </TouchableOpacity>
    );
  };

  const upActive = post.my_vote === 1;
  const downActive = post.my_vote === -1;

  return (
    <TouchableOpacity
      activeOpacity={isDetail ? 1 : 0.85}
      disabled={isDetail}
      onPress={() => onPressPost?.(post)}
      style={cardContainerStyle}>
      <View style={styles.authorRow}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => navigation.navigate('UserProfile', { userId: post.author_id })}
          style={styles.authorLeft}>
          {post.author_avatar_url ? (
            <ForumImage
              uri={post.author_avatar_url}
              recyclingKey={post.author_avatar_url}
              style={styles.avatar}
            />
          ) : (
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: isDark ? '#1e293b' : '#dbeafe',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#3b82f6' }}>
                {(post.author_display_name || post.author_username || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <Text
            style={[styles.authorName, { color: isDark ? '#e4e4e7' : '#18181b' }]}
            numberOfLines={1}>
            {post.author_display_name || post.author_username}
          </Text>
          <Text style={[styles.levelInline, { color: levelColor }]}>Lv.{post.author_level}</Text>
          <Text style={{ color: isDark ? '#52525b' : '#a1a1aa', fontSize: 11 }}>
            {' \u00b7 '}
            {relTime}
          </Text>
        </TouchableOpacity>

        <View style={styles.authorRight}>
          {post.is_pinned && (
            <MaterialIcons name="push-pin" size={14} color="#3b82f6" style={{ marginRight: 4 }} />
          )}
          <View
            style={[
              styles.categoryFlair,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f5',
                borderColor: isDark ? '#27272f' : '#e4e4e7',
              },
            ]}>
            <View style={[styles.categoryDot, { backgroundColor: catInfo.color }]} />
            <Text style={[styles.categoryFlairText, { color: isDark ? '#cbd5e1' : '#3f3f46' }]}>
              {t(catInfo.labelKey as any)}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setMenuOpen(true)}
            hitSlop={10}
            style={{ paddingLeft: 6, paddingVertical: 2 }}>
            <MaterialIcons name="more-horiz" size={19} color={isDark ? '#71717a' : '#71717a'} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.titleBlock}>
        <Text
          style={[
            styles.postTitle,
            { color: isDark ? '#f4f4f5' : '#09090b', fontSize: isDetail ? 18 : 15.5 },
          ]}
          numberOfLines={isDetail ? undefined : 3}>
          {post.title}
        </Text>

        {(post.is_nsfw || post.is_spoiler || post.rating != null) && (
          <View style={styles.subBadgeRow}>
            {post.is_nsfw ? (
              <View
                style={[
                  styles.warnPill,
                  { borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.1)' },
                ]}>
                <Text style={[styles.warnPillText, { color: '#ef4444' }]}>
                  {t('forumFeed.nsfwBadge')}
                </Text>
              </View>
            ) : post.is_spoiler ? (
              <View
                style={[
                  styles.warnPill,
                  { borderColor: 'rgba(234,179,8,0.4)', backgroundColor: 'rgba(234,179,8,0.1)' },
                ]}>
                <Text style={[styles.warnPillText, { color: '#eab308' }]}>
                  {post.spoiler_label
                    ? `${t('forumFeed.spoilerBadge')} \u00b7 ${post.spoiler_label}`
                    : t('forumFeed.spoilerBadge')}
                </Text>
              </View>
            ) : null}

            {post.rating != null && (
              <View
                style={[
                  styles.warnPill,
                  {
                    borderColor: 'rgba(234,179,8,0.35)',
                    backgroundColor: isDark ? '#1a160c' : '#fefce8',
                  },
                ]}>
                <MaterialIcons name="star" size={11} color="#eab308" />
                <Text style={[styles.warnPillText, { color: '#eab308' }]}>{post.rating}/10</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {post.body ? (
        isSpoilerShielded ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setRevealedSpoilerPostId(post.id)}
            style={[
              styles.textSpoilerBox,
              {
                backgroundColor: isDark ? '#18181c' : '#f4f4f5',
                borderColor: isDark ? '#27272f' : '#e4e4e7',
              },
            ]}>
            <MaterialIcons name="visibility" size={15} color="#eab308" />
            <Text style={{ fontSize: 12.5, color: isDark ? '#cbd5e1' : '#3f3f46', flex: 1 }}>
              {t('forumFeed.spoilerRevealHint')}
            </Text>
          </TouchableOpacity>
        ) : (
          <ForumRichText
            text={post.body}
            isDark={isDark}
            numberOfLines={isDetail ? undefined : 3}
            style={[styles.bodyText, { color: isDark ? '#a1a1aa' : '#52525b' }]}
          />
        )
      ) : null}

      {renderMediaGrid()}

      {externalLink ? (
        effectiveExternalMediaUrl && !externalImgFailed ? (
          <View
            style={[
              styles.externalMediaCard,
              {
                backgroundColor: isDark ? '#16161b' : '#f4f4f5',
                borderColor: isDark ? '#27272f' : '#e4e4e7',
              },
            ]}>
            <TouchableOpacity
              activeOpacity={0.92}
              disabled={hideMediaContent}
              onPress={() =>
                onOpenLightbox([{ url: effectiveExternalMediaUrl, provider: 'external' }], 0)
              }
              style={styles.externalMediaTouchable}>
              <ForumImage
                uri={effectiveExternalMediaUrl}
                recyclingKey={effectiveExternalMediaUrl}
                contentFit="contain"
                autoplay
                blurRadius={hideMediaContent ? 22 : 0}
                style={styles.externalMediaImg}
                onError={() => setFailedExternalKey(postResetKey)}
              />
              {hideMediaContent ? (
                renderShieldOverlay()
              ) : (
                <>
                  <View style={styles.mediaKindBadge}>
                    <Text style={styles.mediaKindBadgeText}>{isExternalGif ? 'GIF' : 'IMG'}</Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() =>
                      Linking.openURL(externalLink).catch(() =>
                        ToastAndroid.show(t('common.error'), ToastAndroid.SHORT),
                      )
                    }
                    style={styles.externalDomainChip}>
                    <Text style={styles.externalDomainText} numberOfLines={1}>
                      {extractDomainLabel(externalLink)}
                    </Text>
                    <MaterialIcons name="open-in-new" size={11} color="#e4e4e7" />
                  </TouchableOpacity>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              Linking.openURL(externalLink).catch(() =>
                ToastAndroid.show(t('common.error'), ToastAndroid.SHORT),
              )
            }
            style={[
              styles.externalLinkCard,
              {
                backgroundColor: isDark ? '#141418' : '#f8fafc',
                borderColor: isDark ? '#27272f' : '#e4e4e7',
              },
            ]}>
            <MaterialIcons name="link" size={16} color="#3b82f6" />
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 12.5, fontWeight: '600', color: '#3b82f6' }}
                numberOfLines={1}>
                {extractDomainLabel(externalLink)}
              </Text>
              <Text
                style={{ fontSize: 11, color: isDark ? '#71717a' : '#71717a' }}
                numberOfLines={1}>
                {externalLink}
              </Text>
            </View>
            <MaterialIcons name="open-in-new" size={15} color={isDark ? '#71717a' : '#71717a'} />
          </TouchableOpacity>
        )
      ) : null}

      {post.post_type === 'poll' && post.poll_options.length >= 2 && (
        <View
          style={[
            styles.pollContainer,
            {
              backgroundColor: isDark ? '#121216' : '#f8fafc',
              borderColor: isDark ? '#27272f' : '#e4e4e7',
            },
          ]}>
          {post.poll_options.map((option, idx) => {
            const votes = Number(post.poll_tallies[idx]) || 0;
            const pct = totalPollVotes > 0 ? Math.round((votes / totalPollVotes) * 100) : 0;
            const showResults = post.my_poll_option !== null || pollEnded;
            const isSelected = post.my_poll_option === idx;

            return (
              <TouchableOpacity
                key={`${idx}-${option}`}
                activeOpacity={0.75}
                disabled={pollEnded}
                onPress={() => onVotePoll(post.id, idx)}
                style={[
                  styles.pollOptionBtn,
                  {
                    borderColor: isSelected ? '#3b82f6' : isDark ? '#27272f' : '#e4e4e7',
                    backgroundColor: isDark ? '#0f0f12' : '#ffffff',
                  },
                ]}>
                {showResults && (
                  <View
                    style={[
                      styles.pollFillBar,
                      {
                        width: `${Math.max(2, pct)}%`,
                        backgroundColor: isSelected
                          ? 'rgba(59,130,246,0.22)'
                          : isDark
                            ? 'rgba(255,255,255,0.06)'
                            : 'rgba(0,0,0,0.05)',
                      },
                    ]}
                  />
                )}
                <View style={styles.pollOptionContent}>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: isSelected ? '700' : '500',
                      color: isDark ? '#e4e4e7' : '#18181b',
                    }}
                    numberOfLines={2}>
                    {option}
                  </Text>
                  {showResults && (
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: isSelected ? '#3b82f6' : isDark ? '#a1a1aa' : '#52525b',
                        marginLeft: 8,
                      }}>
                      {pct}%
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}

          <View style={styles.pollMetaRow}>
            <Text style={{ fontSize: 11, color: isDark ? '#71717a' : '#71717a' }}>
              {t('forumFeed.pollTotalVotes', { count: totalPollVotes })}
              {' \u00b7 '}
              {pollEnded
                ? t('forumFeed.pollEnded')
                : post.my_poll_option === null
                  ? t('forumFeed.pollSignInHint')
                  : t('forumFeed.sortHot')}
            </Text>
          </View>
        </View>
      )}

      {post.post_type === 'nobar' && post.nobar_room_id ? (
        <View
          style={[
            styles.nobarCard,
            {
              backgroundColor: isDark ? 'rgba(99,102,241,0.1)' : '#eef2ff',
              borderColor: isDark ? 'rgba(99,102,241,0.35)' : '#c7d2fe',
            },
          ]}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={[styles.nobarDot, { backgroundColor: nobarLive ? '#10b981' : '#71717a' }]}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: nobarLive ? '#10b981' : isDark ? '#a1a1aa' : '#52525b',
                }}>
                {nobarLive ? t('forumFeed.nobarLive') : t('forumFeed.nobarEnded')}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: isDark ? '#f4f4f5' : '#1e1b4b',
                marginTop: 3,
              }}>
              {t('forumFeed.nobarRoomCode', { code: post.nobar_room_id })}
            </Text>
          </View>

          {nobarLive && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('JoinNobar', { roomId: post.nobar_room_id! })}
              style={styles.nobarJoinBtn}>
              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>
                {t('forumFeed.nobarJoinBtn')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {post.linked_media ? (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => openLinkedMediaDetail(navigation, post.linked_media)}
          style={[
            styles.linkedStrip,
            {
              backgroundColor: isDark ? '#141418' : '#f8fafc',
              borderColor: isDark ? '#27272f' : '#e4e4e7',
            },
          ]}>
          {post.linked_media.poster_url ? (
            <ForumImage
              uri={post.linked_media.poster_url}
              recyclingKey={post.linked_media.poster_url}
              style={styles.linkedPoster}
            />
          ) : (
            <View
              style={[
                styles.linkedPoster,
                {
                  backgroundColor: isDark ? '#1e1e24' : '#e4e4e7',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}>
              <MaterialIcons name="movie" size={16} color="#71717a" />
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: isDark ? '#f4f4f5' : '#09090b',
              }}
              numberOfLines={1}>
              {post.linked_media.title}
            </Text>
            <Text
              style={{
                fontSize: 11.5,
                color: isDark ? '#a1a1aa' : '#52525b',
                marginTop: 1,
              }}
              numberOfLines={1}>
              {post.linked_media.type === 'anime'
                ? t('forumFeed.mediaTypeAnime')
                : post.linked_media.type === 'film'
                  ? t('forumFeed.mediaTypeFilm')
                  : t('forumFeed.mediaTypeComics')}
              {post.linked_media.episode_label ? ` \u00b7 ${post.linked_media.episode_label}` : ''}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#3b82f6' }}>
              {t('forumFeed.linkedOpenDetail')}
            </Text>
            <MaterialIcons name="chevron-right" size={16} color="#3b82f6" />
          </View>
        </TouchableOpacity>
      ) : null}

      <View style={styles.footerRow}>
        <View style={styles.footerLeft}>
          <View
            style={[
              styles.votePill,
              {
                backgroundColor: isDark ? '#18181d' : '#f4f4f5',
                borderColor: isDark ? '#27272f' : '#e4e4e7',
              },
            ]}>
            <TouchableOpacity
              onPress={() => onVotePost(post.id, upActive ? 0 : 1)}
              hitSlop={6}
              style={styles.voteIconBtn}>
              <MaterialIcons
                name={upActive ? 'thumb-up-alt' : 'thumb-up-off-alt'}
                size={16}
                color={upActive ? '#f97316' : isDark ? '#a1a1aa' : '#52525b'}
              />
            </TouchableOpacity>

            <Text
              style={[
                styles.scoreText,
                {
                  color: upActive
                    ? '#f97316'
                    : downActive
                      ? '#6366f1'
                      : isDark
                        ? '#e4e4e7'
                        : '#18181b',
                },
              ]}>
              {formatCompactCount(post.score)}
            </Text>

            <TouchableOpacity
              onPress={() => onVotePost(post.id, downActive ? 0 : -1)}
              hitSlop={6}
              style={styles.voteIconBtn}>
              <MaterialIcons
                name={downActive ? 'thumb-down-alt' : 'thumb-down-off-alt'}
                size={16}
                color={downActive ? '#6366f1' : isDark ? '#a1a1aa' : '#52525b'}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            disabled={isDetail}
            onPress={() => onPressPost?.(post)}
            style={[
              styles.metricPill,
              {
                backgroundColor: isDark ? '#18181d' : '#f4f4f5',
                borderColor: isDark ? '#27272f' : '#e4e4e7',
              },
            ]}>
            <MaterialIcons
              name="chat-bubble-outline"
              size={15}
              color={isDark ? '#a1a1aa' : '#52525b'}
            />
            <Text style={[styles.metricText, { color: isDark ? '#d4d4d8' : '#3f3f46' }]}>
              {formatCompactCount(post.comments_count)}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footerRight}>
          <TouchableOpacity
            onPress={() => onToggleBookmark(post.id)}
            style={styles.iconActionBtn}
            hitSlop={6}>
            <MaterialIcons
              name={post.is_bookmarked ? 'bookmark' : 'bookmark-border'}
              size={19}
              color={post.is_bookmarked ? '#3b82f6' : isDark ? '#a1a1aa' : '#52525b'}
            />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleShare} style={styles.iconActionBtn} hitSlop={6}>
            <MaterialIcons name="share" size={17} color={isDark ? '#a1a1aa' : '#52525b'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Clean Bottom Overflow Menu Modal - mounted only when open to avoid per-item native Modal overhead */}
      {menuOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setMenuOpen(false)}
            style={styles.menuBackdrop}>
            <View
              style={[
                styles.menuSheet,
                {
                  backgroundColor: isDark ? '#141418' : '#ffffff',
                  borderColor: isDark ? '#27272f' : '#e4e4e7',
                },
              ]}>
              <TouchableOpacity
                onPress={() => {
                  setMenuOpen(false);
                  onToggleBookmark(post.id);
                }}
                style={styles.menuRow}>
                <MaterialIcons
                  name={post.is_bookmarked ? 'bookmark' : 'bookmark-border'}
                  size={20}
                  color={isDark ? '#e4e4e7' : '#18181b'}
                />
                <Text style={[styles.menuRowText, { color: isDark ? '#e4e4e7' : '#18181b' }]}>
                  {post.is_bookmarked ? t('forumFeed.menuUnbookmark') : t('forumFeed.menuBookmark')}
                </Text>
              </TouchableOpacity>

              {post.linked_media && onFilterMedia && (
                <TouchableOpacity
                  onPress={() => {
                    setMenuOpen(false);
                    onFilterMedia(post.linked_media!.media_key, post.linked_media!.title);
                  }}
                  style={styles.menuRow}>
                  <MaterialIcons name="filter-list" size={20} color="#3b82f6" />
                  <Text style={[styles.menuRowText, { color: '#3b82f6' }]}>
                    {t('forumFeed.filteredByTitle', { title: post.linked_media.title })}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={handleShare} style={styles.menuRow}>
                <MaterialIcons name="share" size={20} color={isDark ? '#e4e4e7' : '#18181b'} />
                <Text style={[styles.menuRowText, { color: isDark ? '#e4e4e7' : '#18181b' }]}>
                  {t('forumFeed.menuShare')}
                </Text>
              </TouchableOpacity>

              {!isMine && (
                <>
                  <TouchableOpacity
                    onPress={() => {
                      setMenuOpen(false);
                      onReportPost(post.id);
                    }}
                    style={styles.menuRow}>
                    <MaterialIcons name="flag" size={20} color="#f59e0b" />
                    <Text style={[styles.menuRowText, { color: isDark ? '#e4e4e7' : '#18181b' }]}>
                      {t('forumFeed.menuReport')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setMenuOpen(false);
                      onBlockAuthor(post.author_id, post.author_username);
                    }}
                    style={styles.menuRow}>
                    <MaterialIcons name="block" size={20} color="#ef4444" />
                    <Text style={[styles.menuRowText, { color: '#ef4444' }]}>
                      {t('forumFeed.menuBlockUser', { username: post.author_username })}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {isMine && (
                <TouchableOpacity
                  onPress={() => {
                    setMenuOpen(false);
                    onDeletePost(post);
                  }}
                  style={styles.menuRow}>
                  <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
                  <Text style={[styles.menuRowText, { color: '#ef4444' }]}>
                    {t('forumFeed.menuDelete')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  authorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 7,
  },
  authorName: {
    fontSize: 12.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  levelInline: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 5,
  },
  authorRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  categoryFlair: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 5,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  categoryFlairText: {
    fontSize: 11,
    fontWeight: '600',
  },
  titleBlock: {
    marginBottom: 6,
  },
  postTitle: {
    fontWeight: '700',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  subBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
    flexWrap: 'wrap',
  },
  warnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  warnPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  bodyText: {
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 8,
  },
  textSpoilerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  singleImgWrap: {
    width: '100%',
    height: 215,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 9,
    position: 'relative',
  },
  singleImg: {
    width: '100%',
    height: '100%',
  },
  collageRow: {
    flexDirection: 'row',
    gap: 4,
    height: 196,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 9,
    position: 'relative',
  },
  twoImgCell: {
    flex: 1,
    height: '100%',
  },
  threeLeftCell: {
    flex: 1.35,
    height: '100%',
  },
  threeRightCol: {
    flex: 1,
    gap: 4,
  },
  threeRightCell: {
    flex: 1,
  },
  fourGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 9,
    position: 'relative',
  },
  fourCell: {
    width: '49.2%',
    height: 120,
  },
  fillImg: {
    width: '100%',
    height: '100%',
  },
  shieldOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,14,0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  shieldTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  shieldHint: {
    color: '#d4d4d8',
    fontSize: 11.5,
    marginTop: 2,
    textAlign: 'center',
  },
  externalLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    marginBottom: 9,
  },
  externalMediaCard: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 9,
    position: 'relative',
  },
  externalMediaTouchable: {
    width: '100%',
    height: '100%',
  },
  externalMediaImg: {
    width: '100%',
    height: '100%',
  },
  mediaKindBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(10,10,14,0.78)',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  mediaKindBadgeText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  externalDomainChip: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    maxWidth: '58%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(10,10,14,0.78)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  externalDomainText: {
    color: '#e4e4e7',
    fontSize: 10.5,
    fontWeight: '600',
  },
  pollContainer: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 7,
    marginBottom: 9,
  },
  pollOptionBtn: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 38,
    justifyContent: 'center',
  },
  pollFillBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  pollOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  pollMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  nobarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 9,
  },
  nobarDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  nobarJoinBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 8,
  },
  linkedStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 9,
    padding: 8,
    marginBottom: 9,
  },
  linkedPoster: {
    width: 32,
    height: 44,
    borderRadius: 5,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  votePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    height: 32,
  },
  voteIconBtn: {
    paddingHorizontal: 9,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 12.5,
    fontWeight: '700',
    minWidth: 18,
    textAlign: 'center',
  },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    height: 32,
    paddingHorizontal: 11,
  },
  metricText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconActionBtn: {
    width: 34,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  menuRowText: {
    fontSize: 14.5,
    fontWeight: '600',
  },
});

export default memo(PostCard);
