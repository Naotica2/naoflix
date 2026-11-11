import URL from 'url';

import { HistoryItemKey } from '../types/databaseTarget';
import { HistoryAdditionalData, HistoryJSON } from '../types/historyJSON';
import { DatabaseManager } from './DatabaseManager';
import { supabase } from '../config/supabaseClient';
import { syncHistoryToCloud, cleanAnimeTitle } from './watchHistorySync';
import { RootStackNavigator } from '../types/navigation';
import { ComicsReading } from './scrapers/comicsv2';
import { KomikuReading } from './scrapers/komiku';
import { NovelReading } from './scrapers/meionovel';

const lastCloudHintByKey = new Map<string, { sig: string; sentAt: number }>();
const CLOUD_HINT_TTL_MS = 180_000;

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

  if (isComics && episode && !episode.toLowerCase().startsWith('chapter')) {
    const numMatch = episode.match(/(\d+\.?\d*)/);
    if (numMatch) {
      episode = `Chapter ${numMatch[1]}`;
    }
  }

  const additionalEpisode = (additionalData as any).episode;
  if (additionalEpisode !== undefined) {
    episode = additionalEpisode;
  }

  if (seriesTitle && seriesTitle.trim()) {
    title = cleanAnimeTitle(seriesTitle.trim());
  } else if (title) {
    title = cleanAnimeTitle(title);
  }
  const dataKey =
    `historyItem:${title}:${isComics ?? 'false'}:${isMovie ?? 'false'}` as HistoryItemKey;

  let keyOrder: HistoryItemKey[] = [];
  try {
    const parsedOrder = JSON.parse((await DatabaseManager.get('historyKeyCollectionsOrder')) ?? '[]');
    if (Array.isArray(parsedOrder)) keyOrder = parsedOrder;
  } catch {}
  const isDataExist = await DatabaseManager.get(dataKey);
  let orderChanged = false;
  if (!isDataExist) {
    if (!keyOrder.includes(dataKey)) {
      keyOrder.splice(0, 0, dataKey);
      orderChanged = true;
    }
  } else if (!skipUpdateDate && keyOrder[0] !== dataKey) {
    const keyIndex = keyOrder.findIndex(z => z === dataKey);
    if (keyIndex !== -1) {
      keyOrder.splice(keyIndex, 1);
    }
    keyOrder.splice(0, 0, dataKey);
    orderChanged = true;
  }
  let historyData: Partial<HistoryJSON> = {};
  try {
    const parsedHist = JSON.parse(isDataExist ?? '{}');
    if (parsedHist && typeof parsedHist === 'object') historyData = parsedHist;
  } catch {}

  let finalThumbnailUrl = historyData.thumbnailUrl || '';
  if ((additionalData as any).thumbnailUrl) {
    finalThumbnailUrl = (additionalData as any).thumbnailUrl || finalThumbnailUrl;
  }
  if (!finalThumbnailUrl) {
    if ((targetData as any).type === 'animeDetail') {
      finalThumbnailUrl = (targetData as any).thumbnailUrl || finalThumbnailUrl;
    } else if ((targetData as any).coverImage) {
      finalThumbnailUrl = (targetData as any).coverImage;
    } else {
      finalThumbnailUrl = (targetData as any).thumbnailUrl || ((targetData as any).comicImages?.[0]) || '';
    }
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

  if (orderChanged) {
    DatabaseManager.set('historyKeyCollectionsOrder', JSON.stringify(keyOrder));
  }
  DatabaseManager.set(
    dataKey,
    JSON.stringify(fullPayload),
  );

  const cloudHintSig = `${fullPayload.title}\0${fullPayload.episode ?? ''}\0${fullPayload.thumbnailUrl}\0${fullPayload.link}\0${Boolean(fullPayload.isMovie)}\0${Boolean(fullPayload.isComics)}`;
  const prevHint = lastCloudHintByKey.get(dataKey);
  const now = Date.now();
  if (
    isDataExist &&
    skipUpdateDate &&
    prevHint &&
    prevHint.sig === cloudHintSig &&
    now - prevHint.sentAt < CLOUD_HINT_TTL_MS
  ) {
    return;
  }

  supabase.auth
    .getSession()
    .then(({ data: { session } }) => {
      if (session?.user) {
        lastCloudHintByKey.set(dataKey, { sig: cloudHintSig, sentAt: Date.now() });
        syncHistoryToCloud(session.user.id, fullPayload);
      }
    })
    .catch(() => {});
}
export default setHistory;
