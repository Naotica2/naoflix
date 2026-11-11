export type ForumCategory = 'general' | 'anime' | 'film' | 'comics' | 'review' | 'nobar';
export type ForumFilterCategory = 'all' | ForumCategory;
export type ForumPostType = 'text' | 'image' | 'poll' | 'nobar' | 'link';
export type ForumSort = 'hot' | 'new' | 'top';
export type ForumCommentSort = 'best' | 'new';
export type ForumReportReason = 'spam' | 'spoiler' | 'nsfw' | 'harassment' | 'other';
export type ForumMediaType = 'anime' | 'film' | 'comics';

export interface ForumMediaItem {
  url: string;
  thumbUrl?: string;
  provider: 'imagekit' | 'supabase' | 'external';
  fileId?: string;
  storagePath?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

export interface ForumLinkedMedia {
  media_key: string;
  type: ForumMediaType;
  title: string;
  poster_url?: string | null;
  link?: string | null;
  episode_label?: string | null;
  source?: string | null;
  film_item?: {
    id: string;
    title: string;
    poster: string;
    type: string;
    source: string;
    subjectType?: number | string;
    releaseDate?: string;
    rating?: string;
    description?: string;
  } | null;
}

export interface ForumPost {
  id: string;
  author_id: string;
  author_username: string;
  author_display_name: string | null;
  author_avatar_url: string | null;
  author_level: number;
  category: ForumCategory;
  post_type: ForumPostType;
  title: string;
  body: string;
  media_items: ForumMediaItem[];
  linked_media: ForumLinkedMedia | null;
  poll_options: string[];
  poll_tallies: number[];
  poll_expires_at: string | null;
  rating: number | null;
  nobar_room_id: string | null;
  external_link: string | null;
  is_spoiler: boolean;
  spoiler_label: string | null;
  is_nsfw: boolean;
  is_pinned: boolean;
  status?: string;
  upvotes_count: number;
  downvotes_count: number;
  score: number;
  comments_count: number;
  hot_score: number;
  created_at: string;
  my_vote: -1 | 0 | 1;
  my_poll_option: number | null;
  is_bookmarked: boolean;
}

export interface ForumComment {
  id: string;
  post_id: string;
  author_id: string;
  author_username: string;
  author_display_name: string | null;
  author_avatar_url: string | null;
  author_level: number;
  parent_id: string | null;
  depth: number;
  body: string;
  image_item: ForumMediaItem | null;
  is_spoiler: boolean;
  status: string;
  score: number;
  created_at: string;
  my_vote: -1 | 0 | 1;
}

export interface ForumCommentNode extends ForumComment {
  replies: ForumCommentNode[];
}

export interface UploadQuotaInfo {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

export interface BlockedUserProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function normalizeMediaKey(type: ForumMediaType, rawId: string): string {
  const cleaned = (rawId || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/^\/+|\/+$/g, '')
    .slice(0, 120);
  return `${type}:${cleaned}`;
}

export function buildCommentTree(flat: ForumComment[]): ForumCommentNode[] {
  const map = new Map<string, ForumCommentNode>();
  const roots: ForumCommentNode[] = [];

  for (const item of flat) {
    map.set(item.id, { ...item, replies: [] });
  }

  for (const item of flat) {
    const node = map.get(item.id);
    if (!node) continue;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function sortCommentTree(
  nodes: ForumCommentNode[],
  sort: ForumCommentSort,
): ForumCommentNode[] {
  const sorted = [...nodes].sort((a, b) => {
    if (sort === 'best') {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return sorted.map(node => ({
    ...node,
    replies: node.replies.length > 0 ? sortCommentTree(node.replies, sort) : [],
  }));
}

export function findCommentSubtree(
  roots: ForumCommentNode[],
  targetId: string,
): ForumCommentNode | null {
  for (const node of roots) {
    if (node.id === targetId) return node;
    if (node.replies.length > 0) {
      const found = findCommentSubtree(node.replies, targetId);
      if (found) return found;
    }
  }
  return null;
}

export function countCommentSubtree(node: ForumCommentNode): number {
  let count = 1;
  for (const child of node.replies) {
    count += countCommentSubtree(child);
  }
  return count;
}

export interface TextSegment {
  text: string;
  isSpoiler: boolean;
  isUrl: boolean;
}

export function parseSpoilerAndUrlSegments(input: string): TextSegment[] {
  if (!input) return [];
  const segments: TextSegment[] = [];
  const spoilerRegex = />!([\s\S]+?)!</g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushWithUrls = (raw: string, isSpoiler: boolean) => {
    if (!raw) return;
    const parts = raw.split(/(https?:\/\/[^\s<>"']+)/gi);
    for (const part of parts) {
      if (!part) continue;
      const isUrl = /^https?:\/\//i.test(part);
      segments.push({ text: part, isSpoiler, isUrl });
    }
  };

  while ((match = spoilerRegex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      pushWithUrls(input.slice(lastIndex, match.index), false);
    }
    pushWithUrls(match[1], true);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    pushWithUrls(input.slice(lastIndex), false);
  }

  return segments;
}

export function formatCompactCount(n: number): string {
  if (Math.abs(n) >= 1000000) {
    return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (Math.abs(n) >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}

export function formatRelativeTime(iso: string, lang: 'id' | 'en'): string {
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return lang === 'en' ? 'Just now' : 'Baru saja';
  const min = Math.floor(sec / 60);
  if (min < 60) return lang === 'en' ? `${min}m` : `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return lang === 'en' ? `${hr}h` : `${hr}j`;
  const day = Math.floor(hr / 24);
  if (day < 30) return lang === 'en' ? `${day}d` : `${day}h`;
  const month = Math.floor(day / 30);
  if (month < 12) return lang === 'en' ? `${month}mo` : `${month}bln`;
  const year = Math.floor(month / 12);
  return lang === 'en' ? `${year}y` : `${year}thn`;
}

export function extractDomainLabel(rawUrl: string): string {
  try {
    const cleaned = rawUrl
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '');
    return cleaned.split('/')[0] || rawUrl;
  } catch {
    return rawUrl;
  }
}

export function isNobarPostActive(createdAtIso: string): boolean {
  const ageMs = Date.now() - new Date(createdAtIso).getTime();
  return ageMs <= 3 * 60 * 60 * 1000;
}

interface HttpUrlParts {
  cleaned: string;
  host: string;
  pathname: string;
  search: string;
}

function parseHttpUrlParts(rawUrl: string): HttpUrlParts | null {
  const cleaned = (rawUrl || '').trim();
  const match = cleaned.match(/^https?:\/\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?(?:#.*)?$/i);
  if (!match) return null;
  return {
    cleaned,
    host: match[1].toLowerCase().replace(/^www\./, ''),
    pathname: (match[2] || '/').toLowerCase(),
    search: (match[3] || '').toLowerCase(),
  };
}

function hasVideoExtensionOrFormat(parts: HttpUrlParts): boolean {
  if (/\.(?:mp4|webm|mov|mkv|m3u8|mpd|avi)$/i.test(parts.pathname)) {
    return true;
  }
  return /[?&](?:format|fm|f)=(?:mp4|webm|mov)(?:&|$)/i.test(parts.search);
}

export function isGifUrl(rawUrl: string): boolean {
  const parts = parseHttpUrlParts(rawUrl);
  if (!parts || hasVideoExtensionOrFormat(parts)) return false;

  if (/\.(?:gif|gifv)$/i.test(parts.pathname)) {
    return true;
  }
  if (/[?&](?:format|fm|f)=gif(?:&|$)/i.test(parts.search)) {
    return true;
  }
  if (/\.(?:png|jpe?g|bmp)$/i.test(parts.pathname)) {
    return false;
  }
  if (
    /^media\d*\.giphy\.com$/.test(parts.host) ||
    parts.host === 'i.giphy.com' ||
    parts.host === 'gph.is' ||
    (parts.host === 'giphy.com' &&
      (parts.pathname.startsWith('/gifs/') ||
        parts.pathname.startsWith('/stickers/') ||
        parts.pathname.startsWith('/embed/')))
  ) {
    return true;
  }
  if (
    /^media\d*\.tenor\.com$/.test(parts.host) ||
    parts.host === 'c.tenor.com' ||
    (parts.host === 'tenor.com' && parts.pathname.includes('/view/'))
  ) {
    return true;
  }
  return false;
}

export function isDirectImageOrGifUrl(rawUrl: string): boolean {
  const parts = parseHttpUrlParts(rawUrl);
  if (!parts || hasVideoExtensionOrFormat(parts)) return false;

  // HTML viewer pages on tenor.com / imgur.com / giphy.com must go through page resolution or Giphy ID extraction
  if (parts.host === 'tenor.com' || parts.host === 'giphy.com' || parts.host === 'imgur.com') {
    return false;
  }

  if (/\.(?:gif|webp|png|jpe?g|avif|bmp)$/i.test(parts.pathname)) {
    return true;
  }

  if (/[?&](?:format|fm|f)=(?:gif|webp|png|jpe?g|avif)(?:&|$)/i.test(parts.search)) {
    return true;
  }

  if (parts.host === 'pbs.twimg.com' && parts.pathname.startsWith('/media/')) {
    return true;
  }

  if (
    (/^media\d*\.giphy\.com$/.test(parts.host) || parts.host === 'i.giphy.com') &&
    parts.pathname.includes('/media/')
  ) {
    return true;
  }

  if (/^media\d*\.tenor\.com$/.test(parts.host) || parts.host === 'c.tenor.com') {
    return true;
  }

  return false;
}

export function getDirectMediaUrlFromLink(rawUrl: string): string | null {
  const parts = parseHttpUrlParts(rawUrl);
  if (!parts || hasVideoExtensionOrFormat(parts)) return null;

  // Imgur .gifv or non-i imgur direct image extension
  if (parts.host === 'i.imgur.com' || parts.host === 'imgur.com') {
    const gifvMatch = parts.cleaned.match(
      /^https?:\/\/(?:www\.|i\.)?imgur\.com\/([a-zA-Z0-9]+)\.gifv(?:[?#].*)?$/i,
    );
    if (gifvMatch?.[1]) {
      return `https://i.imgur.com/${gifvMatch[1]}.gif`;
    }
    if (parts.host === 'imgur.com') {
      const imgMatch = parts.cleaned.match(
        /^https?:\/\/(?:www\.)?imgur\.com\/([a-zA-Z0-9]+)\.(gif|webp|png|jpe?g|avif)(?:[?#].*)?$/i,
      );
      if (imgMatch?.[1] && imgMatch?.[2]) {
        return `https://i.imgur.com/${imgMatch[1]}.${imgMatch[2].toLowerCase()}`;
      }
    }
  }

  if (isDirectImageOrGifUrl(parts.cleaned)) {
    return parts.cleaned;
  }

  // Giphy share / embed links -> direct media GIF CDN URL
  if (parts.host === 'giphy.com') {
    const origMatch = parts.cleaned.match(
      /^https?:\/\/(?:www\.)?giphy\.com\/(?:gifs|stickers|embed)\/([^?#]+)/i,
    );
    if (origMatch?.[1]) {
      const rawSegs = origMatch[1].split('/').filter(Boolean);
      while (
        rawSegs.length > 1 &&
        /^(?:fullscreen|html5|links|tile)$/i.test(rawSegs[rawSegs.length - 1])
      ) {
        rawSegs.pop();
      }
      const targetSeg = rawSegs[rawSegs.length - 1] || '';
      if (targetSeg.includes('-')) {
        const id = targetSeg.split('-').pop() || '';
        if (/^[a-zA-Z0-9]{6,}$/.test(id)) {
          return `https://media.giphy.com/media/${id}/giphy.gif`;
        }
      } else if (
        /^[a-zA-Z0-9]{8,}$/.test(targetSeg) &&
        (/\d/.test(targetSeg) || /[A-Z]/.test(targetSeg))
      ) {
        return `https://media.giphy.com/media/${targetSeg}/giphy.gif`;
      }
    }
  }

  return null;
}

export function needsExternalMediaResolve(rawUrl: string): boolean {
  const parts = parseHttpUrlParts(rawUrl);
  if (!parts || hasVideoExtensionOrFormat(parts)) return false;
  if (getDirectMediaUrlFromLink(parts.cleaned)) return false;

  if (parts.host === 'tenor.com') {
    return parts.pathname.length > 1;
  }
  if (parts.host === 'gph.is' || parts.host === 'giphy.com') {
    return (
      parts.host === 'gph.is' ||
      parts.pathname.startsWith('/gifs/') ||
      parts.pathname.startsWith('/stickers/') ||
      parts.pathname.startsWith('/clips/')
    );
  }
  if (parts.host === 'imgur.com') {
    return (
      parts.pathname.startsWith('/a/') ||
      parts.pathname.startsWith('/gallery/') ||
      /^\/[a-zA-Z0-9]{5,}$/i.test(parts.pathname)
    );
  }
  return false;
}
