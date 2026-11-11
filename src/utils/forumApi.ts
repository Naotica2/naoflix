import { supabase } from '../config/supabaseClient';
import { tSync } from '../misc/LanguageContext';
import { HistoryItemKey } from '../types/databaseTarget';
import {
  BlockedUserProfile,
  ForumCategory,
  ForumComment,
  ForumFilterCategory,
  ForumLinkedMedia,
  ForumMediaItem,
  ForumPost,
  ForumPostType,
  ForumReportReason,
  ForumSort,
  getDirectMediaUrlFromLink,
  isDirectImageOrGifUrl,
  isGifUrl,
  needsExternalMediaResolve,
  normalizeMediaKey,
} from '../types/forum';
import { HistoryJSON } from '../types/historyJSON';
import watchLaterJSON from '../types/watchLaterJSON';
import { DatabaseManager } from './DatabaseManager';
import { cleanupDeletedForumMedia } from './forumMediaStorage';
import { inferComicDetailUrlSync } from './scrapers/comicsv2';

const FEED_CACHE_TTL_MS = 30_000;
const feedCache = new Map<string, { posts: ForumPost[]; fetchedAt: number }>();
let cacheGeneration = 0;

const BLUR_NSFW_PREF_KEY = 'IGNORE_DEFAULT_DB_forumBlurNsfw';

export function getForumBlurNsfwPref(): boolean {
  try {
    return DatabaseManager.getSync(BLUR_NSFW_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

export async function setForumBlurNsfwPref(enabled: boolean): Promise<void> {
  await DatabaseManager.set(BLUR_NSFW_PREF_KEY, enabled ? 'true' : 'false');
}

export function getForumCacheGeneration(): number {
  return cacheGeneration;
}

export function invalidateForumCache(): void {
  feedCache.clear();
  cacheGeneration += 1;
}

export interface FetchForumFeedParams {
  category?: ForumFilterCategory;
  sort?: ForumSort;
  search?: string | null;
  mediaKey?: string | null;
  authorId?: string | null;
  bookmarkedOnly?: boolean;
  limit?: number;
  cursor?: {
    isPinned: boolean;
    numCursor: number | null;
    tsCursor: string | null;
    id: string;
  } | null;
  forceRefresh?: boolean;
}

function normalizePostRow(row: any): ForumPost {
  const rawMedia = Array.isArray(row.media_items) ? row.media_items : [];
  const rawPollOpts = Array.isArray(row.poll_options) ? row.poll_options : [];
  const rawPollTallies = Array.isArray(row.poll_tallies)
    ? row.poll_tallies.map((n: any) => Number(n) || 0)
    : [];

  return {
    id: String(row.id),
    author_id: String(row.author_id),
    author_username: row.author_username || 'user',
    author_display_name: row.author_display_name ?? null,
    author_avatar_url: row.author_avatar_url ?? null,
    author_level: Number(row.author_level) || 1,
    category: (row.category || 'general') as ForumCategory,
    post_type: (row.post_type || 'text') as ForumPostType,
    title: String(row.title || ''),
    body: String(row.body || ''),
    media_items: rawMedia as ForumMediaItem[],
    linked_media: (row.linked_media ?? null) as ForumLinkedMedia | null,
    poll_options: rawPollOpts.map(String),
    poll_tallies: rawPollTallies,
    poll_expires_at: row.poll_expires_at ?? null,
    rating: row.rating != null ? Number(row.rating) : null,
    nobar_room_id: row.nobar_room_id ?? null,
    external_link: row.external_link ?? null,
    is_spoiler: Boolean(row.is_spoiler),
    spoiler_label: row.spoiler_label ?? null,
    is_nsfw: Boolean(row.is_nsfw),
    is_pinned: Boolean(row.is_pinned),
    status: row.status,
    upvotes_count: Number(row.upvotes_count) || 0,
    downvotes_count: Number(row.downvotes_count) || 0,
    score: Number(row.score) || 0,
    comments_count: Number(row.comments_count) || 0,
    hot_score: Number(row.hot_score) || 0,
    created_at: String(row.created_at),
    my_vote: (Number(row.my_vote) || 0) as -1 | 0 | 1,
    my_poll_option: row.my_poll_option != null ? Number(row.my_poll_option) : null,
    is_bookmarked: Boolean(row.is_bookmarked),
  };
}

function normalizeCommentRow(row: any): ForumComment {
  return {
    id: String(row.id),
    post_id: String(row.post_id),
    author_id: String(row.author_id),
    author_username: row.author_username || 'user',
    author_display_name: row.author_display_name ?? null,
    author_avatar_url: row.author_avatar_url ?? null,
    author_level: Number(row.author_level) || 1,
    parent_id: row.parent_id ? String(row.parent_id) : null,
    depth: Number(row.depth) || 0,
    body: String(row.body || ''),
    image_item: (row.image_item ?? null) as ForumMediaItem | null,
    is_spoiler: Boolean(row.is_spoiler),
    status: String(row.status || 'active'),
    score: Number(row.score) || 0,
    created_at: String(row.created_at),
    my_vote: (Number(row.my_vote) || 0) as -1 | 0 | 1,
  };
}

function buildFeedCacheKey(params: FetchForumFeedParams): string {
  const {
    category = 'all',
    sort = 'hot',
    search = null,
    mediaKey = null,
    authorId = null,
    bookmarkedOnly = false,
    limit = 15,
  } = params;
  return JSON.stringify({
    category,
    sort,
    search,
    mediaKey,
    authorId,
    bookmarkedOnly,
    limit,
  });
}

export function peekForumFeedCache(params: FetchForumFeedParams = {}): ForumPost[] | null {
  if (params.cursor) return null;
  const hit = feedCache.get(buildFeedCacheKey(params));
  if (hit && Date.now() - hit.fetchedAt < FEED_CACHE_TTL_MS) {
    return hit.posts;
  }
  return null;
}

export async function fetchForumFeed(params: FetchForumFeedParams = {}): Promise<ForumPost[]> {
  const {
    category = 'all',
    sort = 'hot',
    search = null,
    mediaKey = null,
    authorId = null,
    bookmarkedOnly = false,
    limit = 15,
    cursor = null,
    forceRefresh = false,
  } = params;

  const isFirstPage = !cursor;
  const cacheKey = buildFeedCacheKey(params);

  if (isFirstPage && !forceRefresh) {
    const hit = feedCache.get(cacheKey);
    if (hit && Date.now() - hit.fetchedAt < FEED_CACHE_TTL_MS) {
      return hit.posts;
    }
  }

  const { data, error } = await supabase.rpc('get_forum_feed', {
    p_category: category === 'all' ? null : category,
    p_sort: sort,
    p_search: search?.trim() ? search.trim() : null,
    p_media_key: mediaKey || null,
    p_author_id: authorId || null,
    p_bookmarked_only: bookmarkedOnly,
    p_limit: limit,
    p_cursor_pinned: cursor ? cursor.isPinned : null,
    p_cursor_num: cursor ? cursor.numCursor : null,
    p_cursor_ts: cursor ? cursor.tsCursor : null,
    p_cursor_id: cursor ? cursor.id : null,
  });

  if (error) throw error;

  const posts = (Array.isArray(data) ? data : []).map(normalizePostRow);
  if (isFirstPage) {
    feedCache.set(cacheKey, { posts, fetchedAt: Date.now() });
  }
  return posts;
}

export async function fetchForumThread(
  postId: string,
): Promise<{ post: ForumPost | null; comments: ForumComment[] }> {
  const { data, error } = await supabase.rpc('get_forum_thread', {
    p_post_id: postId,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.post) {
    return { post: null, comments: [] };
  }

  const post = normalizePostRow(row.post);
  const rawComments = Array.isArray(row.comments) ? row.comments : [];
  const comments = rawComments.map(normalizeCommentRow);

  return { post, comments };
}

export interface CreateForumPostInput {
  category: ForumCategory;
  post_type: ForumPostType;
  title: string;
  body?: string;
  media_items?: ForumMediaItem[];
  linked_media?: ForumLinkedMedia | null;
  poll_options?: string[];
  poll_days?: number | null;
  rating?: number | null;
  nobar_room_id?: string | null;
  external_link?: string | null;
  is_spoiler?: boolean;
  spoiler_label?: string | null;
  is_nsfw?: boolean;
}

export async function createForumPost(input: CreateForumPostInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_forum_post', {
    p_category: input.category,
    p_post_type: input.post_type,
    p_title: input.title,
    p_body: input.body ?? '',
    p_media_items: input.media_items ?? [],
    p_linked_media: input.linked_media ?? null,
    p_poll_options: input.poll_options ?? [],
    p_poll_days: input.poll_days ?? null,
    p_rating: input.rating ?? null,
    p_nobar_room_id: input.nobar_room_id ?? null,
    p_external_link: input.external_link ?? null,
    p_is_spoiler: Boolean(input.is_spoiler),
    p_spoiler_label: input.spoiler_label ?? null,
    p_is_nsfw: Boolean(input.is_nsfw),
  });

  if (error) throw error;
  invalidateForumCache();
  return String(data);
}

export async function createForumComment(params: {
  postId: string;
  parentId?: string | null;
  body: string;
  imageItem?: ForumMediaItem | null;
  isSpoiler?: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_forum_comment', {
    p_post_id: params.postId,
    p_parent_id: params.parentId ?? null,
    p_body: params.body,
    p_image_item: params.imageItem ?? null,
    p_is_spoiler: Boolean(params.isSpoiler),
  });
  if (error) throw error;
  invalidateForumCache();
  return String(data);
}

export async function voteForumPost(
  postId: string,
  value: -1 | 0 | 1,
): Promise<{ score: number; upvotes_count: number; downvotes_count: number; my_vote: -1 | 0 | 1 }> {
  const { data, error } = await supabase.rpc('vote_forum_post', {
    p_post_id: postId,
    p_value: value,
  });
  if (error) throw error;
  invalidateForumCache();
  return {
    score: Number(data?.score) || 0,
    upvotes_count: Number(data?.upvotes_count) || 0,
    downvotes_count: Number(data?.downvotes_count) || 0,
    my_vote: (Number(data?.my_vote) || 0) as -1 | 0 | 1,
  };
}

export async function voteForumComment(
  commentId: string,
  value: -1 | 0 | 1,
): Promise<{ score: number; my_vote: -1 | 0 | 1 }> {
  const { data, error } = await supabase.rpc('vote_forum_comment', {
    p_comment_id: commentId,
    p_value: value,
  });
  if (error) throw error;
  return {
    score: Number(data?.score) || 0,
    my_vote: (Number(data?.my_vote) || 0) as -1 | 0 | 1,
  };
}

export async function voteForumPoll(
  postId: string,
  optionIndex: number,
): Promise<{ poll_tallies: number[]; my_poll_option: number }> {
  const { data, error } = await supabase.rpc('vote_forum_poll', {
    p_post_id: postId,
    p_option_index: optionIndex,
  });
  if (error) throw error;
  invalidateForumCache();
  return {
    poll_tallies: Array.isArray(data?.poll_tallies)
      ? data.poll_tallies.map((n: any) => Number(n) || 0)
      : [],
    my_poll_option: Number(data?.my_poll_option),
  };
}

export async function toggleForumBookmark(postId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_forum_bookmark', {
    p_post_id: postId,
  });
  if (error) throw error;
  invalidateForumCache();
  return Boolean(data);
}

export async function reportForumItem(params: {
  targetType: 'post' | 'comment';
  targetId: string;
  reason: ForumReportReason;
  details?: string;
}): Promise<'reported' | 'already_reported'> {
  const { data, error } = await supabase.rpc('report_forum_item', {
    p_target_type: params.targetType,
    p_target_id: params.targetId,
    p_reason: params.reason,
    p_details: params.details ?? null,
  });
  if (error) throw error;
  return data === 'already_reported' ? 'already_reported' : 'reported';
}

export async function toggleUserBlock(targetUserId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_user_block', {
    p_target_user_id: targetUserId,
  });
  if (error) throw error;
  invalidateForumCache();
  return Boolean(data);
}

export async function fetchBlockedUsers(): Promise<BlockedUserProfile[]> {
  const { data, error } = await supabase.rpc('get_blocked_users');
  if (error) throw error;
  return Array.isArray(data) ? (data as BlockedUserProfile[]) : [];
}

export async function softDeleteForumPost(postId: string): Promise<void> {
  const { data, error } = await supabase.rpc('soft_delete_forum_post', {
    p_post_id: postId,
  });
  if (error) throw error;
  invalidateForumCache();
  if (Array.isArray(data) && data.length > 0) {
    cleanupDeletedForumMedia(data as ForumMediaItem[]);
  }
}

export async function softDeleteForumComment(commentId: string): Promise<void> {
  const { error } = await supabase.rpc('soft_delete_forum_comment', {
    p_comment_id: commentId,
  });
  if (error) throw error;
  invalidateForumCache();
}

export async function loadLocalWatchedAndSavedMedia(): Promise<ForumLinkedMedia[]> {
  const seen = new Set<string>();
  const results: ForumLinkedMedia[] = [];

  try {
    const orderRaw = await DatabaseManager.get('historyKeyCollectionsOrder');
    const keys: HistoryItemKey[] = orderRaw ? JSON.parse(orderRaw) : [];
    if (Array.isArray(keys)) {
      for (const key of keys.slice(0, 25)) {
        const raw = await DatabaseManager.get(key);
        if (!raw) continue;
        try {
          const item = JSON.parse(raw) as HistoryJSON;
          if (!item?.title) continue;
          const type = item.isComics ? 'comics' : item.isMovie ? 'film' : 'anime';
          const rawLink = item.seriesLink || item.link || item.title;
          const cleanLink =
            type === 'comics' ? inferComicDetailUrlSync(rawLink) || rawLink : rawLink;
          const media_key = normalizeMediaKey(type, cleanLink || item.title);
          if (seen.has(media_key)) continue;
          seen.add(media_key);

          let filmItem: ForumLinkedMedia['film_item'] = null;
          if (type === 'film' && cleanLink.startsWith('film://')) {
            const rawPath = cleanLink.replace('film://', '').split('?')[0];
            const parts = rawPath.split('/');
            filmItem = {
              id: parts[0] || cleanLink,
              title: item.title,
              poster: item.thumbnailUrl || '',
              type: 'Movie',
              source: 'lk21',
            };
          }

          results.push({
            media_key,
            type,
            title: item.title.replace(/\s+(?:Episode|Chapter)\s+\d+.*/i, '').trim(),
            poster_url: item.thumbnailUrl || null,
            link: cleanLink,
            episode_label: item.episode || null,
            film_item: filmItem,
          });
        } catch {}
      }
    }
  } catch {}

  try {
    const wlRaw = await DatabaseManager.get('watchLater');
    const wlList: watchLaterJSON[] = wlRaw ? JSON.parse(wlRaw) : [];
    if (Array.isArray(wlList)) {
      for (const item of wlList.slice(0, 20)) {
        if (!item?.title) continue;
        const type = item.isComics ? 'comics' : item.isMovie ? 'film' : 'anime';
        const media_key = normalizeMediaKey(type, item.link || item.title);
        if (seen.has(media_key)) continue;
        seen.add(media_key);

        let filmItem: ForumLinkedMedia['film_item'] = null;
        if (type === 'film' && item.link?.startsWith('film://')) {
          const rawPath = item.link.replace('film://', '').split('?')[0];
          const parts = rawPath.split('/');
          filmItem = {
            id: parts[0] || item.link,
            title: item.title,
            poster: item.thumbnailUrl || '',
            type: 'Movie',
            source: 'lk21',
          };
        }

        results.push({
          media_key,
          type,
          title: item.title,
          poster_url: item.thumbnailUrl || null,
          link: item.link || null,
          film_item: filmItem,
        });
      }
    }
  } catch {}

  return results;
}

export function openLinkedMediaDetail(
  navigation: any,
  linked: ForumLinkedMedia | null | undefined,
): void {
  if (!linked) return;

  if (linked.type === 'film') {
    if (linked.film_item) {
      navigation.navigate('FilmDetail', { data: linked.film_item });
      return;
    }
    const rawId =
      linked.link?.replace('film://', '').split('?')[0].split('/')[0] || linked.media_key;
    navigation.navigate('FilmDetail', {
      data: {
        id: rawId,
        title: linked.title,
        poster: linked.poster_url || '',
        type: 'Movie',
        source: linked.source || 'lk21',
      },
    });
    return;
  }

  if (linked.link) {
    navigation.navigate('FromUrl', {
      title: linked.title,
      link: linked.link,
      type: linked.type === 'comics' ? 'comics' : 'anime',
      thumbnailUrl: linked.poster_url || undefined,
      forceDetail: linked.type === 'anime' || linked.type === 'comics',
    });
  }
}

const EXTERNAL_MEDIA_CACHE_MAX = 200;
const externalMediaResolveCache = new Map<string, string | null>();
const externalMediaInFlight = new Map<string, Promise<string | null>>();

export function peekResolvedExternalMediaUrl(rawUrl: string): string | null | undefined {
  const key = (rawUrl || '').trim();
  if (!key) return undefined;
  return externalMediaResolveCache.get(key);
}

function setBoundedExternalMediaCache(key: string, val: string | null) {
  if (externalMediaResolveCache.size >= EXTERNAL_MEDIA_CACHE_MAX) {
    const oldestKey = externalMediaResolveCache.keys().next().value;
    if (oldestKey !== undefined) {
      externalMediaResolveCache.delete(oldestKey);
    }
  }
  externalMediaResolveCache.set(key, val);
}

function decodeHtmlUrl(raw: string): string {
  return raw
    .trim()
    .replace(/&amp;/gi, '&')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/');
}

function extractCandidatesFromHtml(html: string): string[] {
  const unescapedHtml = html
    .replace(/&amp;/gi, '&')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/');
  const candidates: string[] = [];
  const metaRegex = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRegex.exec(unescapedHtml)) !== null) {
    const tag = m[0];
    const keyMatch = /(?:property|name|itemprop)=["']([^"']+)["']/i.exec(tag);
    const contentMatch = /content=["']([^"']+)["']/i.exec(tag);
    if (!keyMatch || !contentMatch) continue;
    const key = keyMatch[1].toLowerCase();
    if (
      key === 'og:image' ||
      key === 'og:image:secure_url' ||
      key === 'og:image:url' ||
      key === 'twitter:image' ||
      key === 'twitter:image:src' ||
      key === 'contenturl'
    ) {
      candidates.push(decodeHtmlUrl(contentMatch[1]));
    }
  }

  const cdnRegex =
    /https?:\/\/(?:media\d*\.(?:tenor|giphy)\.com|i\.giphy\.com|c\.tenor\.com|i\.imgur\.com)\/[^"'\s<>\\]+?\.(?:gif|webp|png|jpe?g)(?:\?[^"'\s<>\\]*)?/gi;
  while ((m = cdnRegex.exec(unescapedHtml)) !== null) {
    candidates.push(decodeHtmlUrl(m[0]));
  }

  return Array.from(new Set(candidates)).filter(
    u => /^https?:\/\//i.test(u) && !/favicon|sprite|apple-touch-icon|tenor-logo/i.test(u),
  );
}

export async function resolveExternalMediaUrl(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const key = (rawUrl || '').trim();
  if (!key) return null;

  const direct = getDirectMediaUrlFromLink(key);
  if (direct) return direct;

  if (!needsExternalMediaResolve(key)) return null;

  if (externalMediaResolveCache.has(key)) {
    return externalMediaResolveCache.get(key) ?? null;
  }

  const existing = externalMediaInFlight.get(key);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        return null;
      }
      signal.addEventListener('abort', onAbort);
    }

    try {
      const res = await fetch(key, {
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        },
      });
      if (!res.ok) {
        setBoundedExternalMediaCache(key, null);
        return null;
      }
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (contentType.startsWith('image/')) {
        const finalUrl = res.url || key;
        setBoundedExternalMediaCache(key, finalUrl);
        return finalUrl;
      }

      const redirectedDirect = res.url ? getDirectMediaUrlFromLink(res.url) : null;
      if (redirectedDirect) {
        setBoundedExternalMediaCache(key, redirectedDirect);
        return redirectedDirect;
      }

      const html = await res.text();
      const candidates = extractCandidatesFromHtml(html);

      // Prefer explicit animated .gif/.webp over static .png/.jpg fallback posters
      const animatedPick = candidates.find(
        c =>
          isGifUrl(c) &&
          (/\.(?:gif|webp)(?:$|[?#])/i.test(c) || /[?&](?:format|fm|f)=gif(?:&|$)/i.test(c)),
      );
      const gifCdnPick = candidates.find(c => isGifUrl(c));
      const validPick =
        animatedPick || gifCdnPick || candidates.find(c => isDirectImageOrGifUrl(c)) || null;
      setBoundedExternalMediaCache(key, validPick);
      return validPick;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onAbort);
      externalMediaInFlight.delete(key);
    }
  })();

  externalMediaInFlight.set(key, promise);
  return promise;
}

export function parseFriendlyForumError(err: any): string {
  const msg = String(err?.message || err || '');
  if (msg.includes('QUOTA_EXCEEDED')) return tSync('forumFeed.uploadQuotaExceeded');
  if (msg.includes('RATE_LIMIT')) {
    return msg.replace(/^.*RATE_LIMIT:\s*/i, '');
  }
  if (msg.includes('AUTH_REQUIRED') || msg.includes('Authentication required')) {
    return tSync('forumFeed.loginToVote');
  }
  return msg || tSync('common.error');
}
