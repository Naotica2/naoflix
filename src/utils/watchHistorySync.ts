import { supabase } from '../config/supabaseClient';
import { HistoryJSON, HistoryAdditionalData } from '../types/historyJSON';
import URL from 'url';

const syncTimeouts = new Map<string, NodeJS.Timeout>();

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
  if (historyData.link?.startsWith('film://')) source = 'lk21';
  else if (hostname.includes('otakudesu')) source = 'otakudesu';
  else if (hostname.includes('samehadaku')) source = 'samehadaku';
  else if (hostname.includes('komiku')) source = 'komiku';
  else if (hostname.includes('komikcast')) source = 'komikcast';
  else if (hostname.includes('meionovel')) source = 'meionovel';
  else if (hostname.includes('idlix') || hostname.includes('lk21') || hostname.includes('nontondrama')) source = 'lk21';

  let contentId = historyData.seriesLink || historyData.link || historyData.title.toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  if (contentId.startsWith('film://') && contentId.includes('?')) {
    contentId = contentId.split('?')[0];
  }
  
  const syncKey = `${userId}_${contentType}_${contentId}`;

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
