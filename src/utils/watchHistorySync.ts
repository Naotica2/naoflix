import { supabase } from '../config/supabaseClient';
import { HistoryJSON, HistoryAdditionalData } from '../types/historyJSON';
import URL from 'url';

// Debounce map to prevent spamming the database with rapid watch progress updates
const syncTimeouts = new Map<string, NodeJS.Timeout>();

export async function syncHistoryToCloud(
  userId: string,
  historyData: HistoryJSON & Partial<HistoryAdditionalData>
) {
  if (!userId) return;

  // 1. Determine Content Type
  let contentType = 'unknown';
  if (historyData.isComics) {
    contentType = 'comic';
  } else if (historyData.isMovie || historyData.link?.startsWith('film://')) {
    contentType = 'film';
  } else if (URL.parse(historyData.link ?? '').hostname!?.includes('meionovel')) {
    contentType = 'novel';
  } else {
    // Default to anime if not explicitly comic/film/novel
    contentType = 'anime';
  }

  // 2. Determine Source
  let source = 'unknown';
  const hostname = URL.parse(historyData.link ?? '').hostname || '';
  if (historyData.link?.startsWith('film://')) source = 'moviebox';
  else if (hostname.includes('otakudesu')) source = 'otakudesu';
  else if (hostname.includes('samehadaku')) source = 'samehadaku';
  else if (hostname.includes('komiku')) source = 'komiku';
  else if (hostname.includes('komikcast')) source = 'komikcast';
  else if (hostname.includes('meionovel')) source = 'meionovel';
  else if (hostname.includes('idlix') || hostname.includes('lk21')) source = 'idlix';

  // 3. Create a unique identifier for this content
  // We use the link as the primary ID if available, otherwise fallback to title slug
  let contentId = historyData.seriesLink || historyData.link || historyData.title.toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  // For moviebox film links, strip query parameters so all episodes map to the same series entry
  if (contentId.startsWith('film://') && contentId.includes('?')) {
    contentId = contentId.split('?')[0];
  }
  
  // Create a unique key for debouncing per piece of content
  const syncKey = `${userId}_${contentType}_${contentId}`;

  // 4. Debounce the actual upload (wait 3 seconds after last update)
  if (syncTimeouts.has(syncKey)) {
    clearTimeout(syncTimeouts.get(syncKey)!);
  }

  syncTimeouts.set(
    syncKey,
    setTimeout(async () => {
      try {
        const payload = {
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
          title: (contentType === 'film' && historyData.episode) 
            ? `${historyData.title} ${historyData.episode}` 
            : historyData.title,
          thumbnail_url: historyData.thumbnailUrl || null,
          episode: historyData.episode || null,
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
        }
      } catch (err) {
        console.warn('[SyncHistory] Exception during cloud sync:', err);
      } finally {
        syncTimeouts.delete(syncKey);
      }
    }, 3000)
  );
}
