import { supabase } from '../config/supabaseClient';
import { HistoryJSON, HistoryAdditionalData } from '../types/historyJSON';
import URL from 'url';

const syncTimeouts = new Map<string, NodeJS.Timeout>();
const lastSyncedByKey = new Map<string, { sig: string; syncedAt: number }>();
const lastTopSyncByUser = new Map<string, string>();
const cleanedLegacyTitles = new Set<string>();
const CLOUD_RESYNC_TTL_MS = 180_000;

const HISTORY_GRID_CACHE_TTL_MS = 60_000;
const watchHistoryGridCache = new Map<
  string,
  { items: any[]; fetchedAt: number }
>();

export function getWatchHistoryGridCache(userId: string) {
  const cached = watchHistoryGridCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < HISTORY_GRID_CACHE_TTL_MS) {
    return cached.items;
  }
  return null;
}

export function setWatchHistoryGridCache(userId: string, items: any[]) {
  watchHistoryGridCache.set(userId, { items, fetchedAt: Date.now() });
}

export function invalidateWatchHistoryGridCache(userId?: string) {
  if (userId) {
    watchHistoryGridCache.delete(userId);
  } else {
    watchHistoryGridCache.clear();
  }
}

export function cleanAnimeTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let t = rawTitle;

  // 0. Remove server and resolution suffixes (e.g. " - 720p / BerkasDrive", " - 480p", " / Alternative")
  t = t.replace(/\s*[-/|]\s*\d+p\b[^\n]*/gi, '');
  t = t.replace(/\s*\/\s*(?:BerkasDrive|Alternative|Akirabox|GoogleDrive|Mega|Filedon)[^\n]*/gi, '');

  // 1. Remove bracketed / parenthesized episode markers:
  // e.g. (Episode 1), [Episode 01], (Ep. 12), [END], [BD], [Batch]
  t = t.replace(/\((?:episode|ep\.?|ch\.?)\s*\d+[^)]*\)/gi, '');
  t = t.replace(/\[(?:episode|ep\.?|ch\.?)\s*\d+[^\]]*\]/gi, '');
  t = t.replace(/\[(?:end|bd|batch|complete)[^\]]*\]/gi, '');
  t = t.replace(/\((?:end|bd|batch|complete)[^)]*\)/gi, '');

  // 2. Remove subtitle indicators
  t = t.replace(/subtitle\s+indonesia/gi, '');
  t = t.replace(/sub\s+indo/gi, '');

  // 3. Remove inline episode mentions: " Episode 1", " Ep 12", " Ep. 05", " - Episode 1"
  const epMatch = t.search(/\s*[-:]?\s*(?:episode|eps?\.?)\s*\d+/i);
  if (epMatch !== -1) {
    t = t.substring(0, epMatch);
  }

  // 4. Standalone trailing episode numbers e.g. " - 01" or " - 24"
  t = t.replace(/\s+-\s+\d+(\s+.*)?$/, '');

  // 5. Clean up any trailing punctuation/dashes/colons/pipes
  t = t.replace(/[\s\-_:|,]+$/, '');

  return t.trim();
}

export function getCanonicalAnimeContentId(
  link?: string,
  seriesLink?: string,
  title?: string
): string {
  // 1. If explicit seriesLink is provided and valid (not an episode link)
  if (seriesLink && typeof seriesLink === 'string' && seriesLink.trim()) {
    let sl = seriesLink.trim();
    if (sl.endsWith('/')) sl = sl.slice(0, -1);
    if (!sl.includes('/episode/') && !sl.includes('/streaming/')) {
      return sl;
    }
  }

  // 2. If Nimegami streaming or detail link
  if (link && (link.includes('nimegami.id') || link.startsWith('nimegami://'))) {
    const slugMatch = link.match(/nimegami\.id\/([a-zA-Z0-9_-]+)/) || link.match(/nimegami:\/\/(?:detail|stream|ep)\/([a-zA-Z0-9_-]+)/);
    if (slugMatch && slugMatch[1]) {
      const slug = slugMatch[1].replace(/\/.*$/, '');
      return `nimegami://detail/${slug}`;
    }
  }

  // 3. If link is an Otakudesu episode link, convert to anime series link
  if (link && link.includes('/episode/')) {
    const match = link.match(/\/episode\/([^\/]+)/);
    if (match && match[1]) {
      const episodeSlug = match[1];
      // Strip "-episode-\d+..."
      const seriesSlug = episodeSlug.replace(/-episode-\d+.*$/i, '');
      const parsed = URL.parse(link);
      const host = parsed.protocol ? `${parsed.protocol}//${parsed.host}` : 'https://otakudesu.cloud';
      return `${host}/anime/${seriesSlug}-sub-indo`;
    }
  }

  // 4. If link is already an anime detail link
  if (link && link.includes('/anime/')) {
    let l = link.trim();
    if (l.endsWith('/')) l = l.slice(0, -1);
    return l;
  }

  // 5. Fallback based on cleaned title slug
  const clean = cleanAnimeTitle(title || '');
  if (clean) {
    return `anime:${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  }

  return (link || 'unknown-anime').replace(/\/$/, '');
}

export async function syncHistoryToCloud(
  userId: string,
  historyData: HistoryJSON & Partial<HistoryAdditionalData>
) {
  if (!userId) return;

  let contentType = 'unknown';
  if (historyData.isComics) {
    contentType = 'comic';
  } else if (historyData.isMovie || historyData.link?.startsWith('film://')) {
    contentType = 'film';
  } else if (URL.parse(historyData.link ?? '').hostname!?.includes('meionovel')) {
    contentType = 'novel';
  } else {
    contentType = 'anime';
  }

  let source = 'unknown';
  const hostname = URL.parse(historyData.link ?? '').hostname || '';
  
  if (hostname.includes('anichin')) {
    return;
  }
  if (historyData.link?.startsWith('film://')) source = 'lk21';
  else if (historyData.link?.startsWith('nimegami://') || hostname.includes('nimegami')) source = 'nimegami';
  else if (hostname.includes('otakudesu')) source = 'otakudesu';
  else if (hostname.includes('samehadaku')) source = 'samehadaku';
  else if (hostname.includes('komiku')) source = 'komiku';
  else if (hostname.includes('komikindo')) source = 'komikindo';
  else if (hostname.includes('luvyaa')) source = 'luvyaa';
  else if (hostname.includes('meionovel')) source = 'meionovel';
  else if (hostname.includes('idlix') || hostname.includes('lk21') || hostname.includes('nontondrama')) source = 'lk21';

  let contentId = '';
  if (contentType === 'anime') {
    contentId = getCanonicalAnimeContentId(historyData.link, historyData.seriesLink, historyData.title);
  } else if (contentType === 'film') {
    contentId = historyData.seriesLink || historyData.link || historyData.title.toLowerCase().replace(/[^a-z0-9]/g, '-');
    if (contentId.startsWith('film://') && contentId.includes('?')) {
      contentId = contentId.split('?')[0];
    }
  } else {
    contentId = historyData.seriesLink || historyData.link || historyData.title.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }
  
  const syncKey = `${userId}_${contentType}_${contentId}`;
  const cleanedAnimeTitle = contentType === 'anime' ? cleanAnimeTitle(historyData.title) : historyData.title;
  const payloadTitle = (contentType === 'film' && historyData.episode)
    ? `${historyData.title} ${historyData.episode}`
    : cleanedAnimeTitle;
  const payloadThumb = historyData.thumbnailUrl || null;
  const payloadEpisode = historyData.episode || null;
  const sig = `${payloadTitle}\0${payloadThumb ?? ''}\0${payloadEpisode ?? ''}\0${source}`;

  const prevSynced = lastSyncedByKey.get(syncKey);
  const now = Date.now();
  if (
    prevSynced &&
    prevSynced.sig === sig &&
    lastTopSyncByUser.get(userId) === syncKey &&
    now - prevSynced.syncedAt < CLOUD_RESYNC_TTL_MS
  ) {
    return;
  }

  if (syncTimeouts.has(syncKey)) {
    clearTimeout(syncTimeouts.get(syncKey)!);
  }

  syncTimeouts.set(
    syncKey,
    setTimeout(async () => {
      try {
        const execNow = Date.now();
        const latestSynced = lastSyncedByKey.get(syncKey);
        if (
          latestSynced &&
          latestSynced.sig === sig &&
          lastTopSyncByUser.get(userId) === syncKey &&
          execNow - latestSynced.syncedAt < CLOUD_RESYNC_TTL_MS
        ) {
          return;
        }

        const payload = {
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
          title: payloadTitle,
          thumbnail_url: payloadThumb,
          episode: payloadEpisode,
          source: source,
          last_watched_at: new Date(historyData.date).toISOString(),
        };

        const { error } = await supabase
          .from('watch_history')
          .upsert(payload as any, { 
            onConflict: 'user_id, content_id, content_type' 
          });

        if (error) {
          console.warn('[SyncHistory] Failed to sync history to cloud:', error.message);
        } else {
          lastSyncedByKey.set(syncKey, { sig, syncedAt: Date.now() });
          lastTopSyncByUser.set(userId, syncKey);
          invalidateWatchHistoryGridCache(userId);

          if (contentType === 'anime' && cleanedAnimeTitle) {
            const legacyKey = `${userId}::${cleanedAnimeTitle.toLowerCase()}`;
            if (!cleanedLegacyTitles.has(legacyKey)) {
              cleanedLegacyTitles.add(legacyKey);
              // Clean up legacy duplicate rows once per series title per session
              await supabase
                .from('watch_history')
                .delete()
                .eq('user_id', userId)
                .eq('content_type', 'anime')
                .ilike('title', cleanedAnimeTitle)
                .neq('content_id', contentId);
            }
          }
        }
      } catch (err) {
        console.warn('[SyncHistory] Exception during cloud sync:', err);
      } finally {
        syncTimeouts.delete(syncKey);
      }
    }, 3000)
  );
}
