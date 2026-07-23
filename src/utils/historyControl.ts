import URL from 'url';

import { HistoryItemKey } from '../types/databaseTarget';
import { HistoryAdditionalData, HistoryJSON } from '../types/historyJSON';
import { DatabaseManager } from './DatabaseManager';
import { supabase } from '../config/supabaseClient';
import { syncHistoryToCloud } from './watchHistorySync';
import { RootStackNavigator } from '../types/navigation';
import { ComicsReading } from './scrapers/comicsv2';
import { KomikuReading } from './scrapers/komiku';
import { NovelReading } from './scrapers/meionovel';

async function setHistory(
  targetData:
    | RootStackNavigator['Video']['data']
    | ComicsReading
    | KomikuReading
    | NovelReading,
  link: string,
  skipUpdateDate = false,
  additionalData: Partial<HistoryAdditionalData> | {} = {},
  isMovie?: boolean,
  isComics?: boolean,
  seriesTitle?: string,
) {
  let title: string;
  let episode: string | null;
  if (isComics && !('releaseDate' in targetData) && 'chapter' in targetData) {
    episode = (link.includes('softkomik') ? 'Chapter ' : '') + targetData.chapter;
    title = targetData.title;
  } else {
    const safeTitle = (targetData as any)?.title || '';
    const episodeIndex = safeTitle
      .toLowerCase()
      .lastIndexOf(isComics ? 'chapter' : 'episode');
    
    if (isComics && episodeIndex < 0 && 'chapter' in targetData && (targetData as any).chapter) {
      episode = (targetData as any).chapter;
      title = safeTitle.trim();
    } else {
      episode =
        episodeIndex < 0
          ? null
          : safeTitle.slice(episodeIndex).trim();
      title = (
        episodeIndex >= 0
          ? safeTitle.slice(0, episodeIndex)
          : safeTitle
      ).trim();
    }
  }

  // Normalize comic episode to always have "Chapter " prefix for cross-source consistency
  if (isComics && episode && !episode.toLowerCase().startsWith('chapter')) {
    const numMatch = episode.match(/(\d+\.?\d*)/);
    if (numMatch) {
      episode = `Chapter ${numMatch[1]}`;
    }
  }

  // Allow explicit episode override from additionalData (used by FilmPlayer for TV episodes)
  const additionalEpisode = (additionalData as any).episode;
  if (additionalEpisode !== undefined) {
    episode = additionalEpisode;
  }

  // Use explicit series title if provided (fixes cross-source history key collision)
  // Some scrapers return chapter title instead of series name in targetData.title,
  // causing all comics to share the same history key. seriesTitle overrides this.
  if (seriesTitle && seriesTitle.trim()) {
    title = seriesTitle.trim();
  }
  
  // Clean up title to match AniDetail.tsx matching logic
  if (title) {
    title = title.replace(/Subtitle Indonesia|Sub Indo/i, '').split('(Episode')[0].trim();
  }
  const dataKey =
    `historyItem:${title}:${isComics ?? 'false'}:${isMovie ?? 'false'}` as HistoryItemKey;

  const keyOrder: HistoryItemKey[] = JSON.parse(
    (await DatabaseManager.get('historyKeyCollectionsOrder')) ?? '[]',
  );
  const isDataExist = await DatabaseManager.get(dataKey);
  if (!isDataExist) {
    if (!keyOrder.includes(dataKey)) keyOrder.splice(0, 0, dataKey);
  } else if (!skipUpdateDate) {
    const keyIndex = keyOrder.findIndex(z => z === dataKey);
    if (keyIndex !== -1) {
      keyOrder.splice(keyIndex, 1);
    }
    keyOrder.splice(0, 0, dataKey);
  }
  const historyData: HistoryJSON = JSON.parse(isDataExist ?? '{}');

  let finalThumbnailUrl = historyData.thumbnailUrl || '';
  if ((targetData as any).type === 'animeDetail') {
    // Detail page always has the high quality poster
    finalThumbnailUrl = (targetData as any).thumbnailUrl || finalThumbnailUrl;
  } else if ((targetData as any).coverImage) {
    // Some scrapers provide coverImage directly
    finalThumbnailUrl = (targetData as any).coverImage;
  } else if (!finalThumbnailUrl) {
    // Fallback if we have absolutely nothing
    finalThumbnailUrl = (targetData as any).thumbnailUrl || ((targetData as any).comicImages?.[0]) || '';
  }

  const fullPayload = {
    ...additionalData,
    title,
    episode,
    link,
    thumbnailUrl: finalThumbnailUrl,
    date: skipUpdateDate ? historyData?.date || Date.now() : Date.now(),
    isMovie,
    isComics,
  };

  DatabaseManager.set('historyKeyCollectionsOrder', JSON.stringify(keyOrder));
  DatabaseManager.set(
    dataKey,
    JSON.stringify(fullPayload),
  );

  // Cloud Sync
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      syncHistoryToCloud(session.user.id, fullPayload);
    }
  });
}
export default setHistory;
