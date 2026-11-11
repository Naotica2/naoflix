import { tSync } from '../misc/LanguageContext';
import { OfflineAnimeItem } from '../types/offlineAnime';
import { cleanAnimeTitle } from './watchHistorySync';

export interface OfflineEpisodeSlot {
  slotKey: string;
  episodeNumber: number;
  displayLabel: string;
  variants: OfflineAnimeItem[];
  primaryItem: OfflineAnimeItem;
}

export interface OfflineAnimeGroup {
  canonicalKey: string;
  animeTitle: string;
  thumbnailUrl: string;
  sources: string[];
  totalSize: number;
  slots: OfflineEpisodeSlot[];
  items: OfflineAnimeItem[];
  lastPositionEp?: OfflineAnimeItem;
}

export function cleanDisplaySeriesTitle(rawTitle: string): string {
  const base = cleanAnimeTitle(rawTitle || '');
  return base
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || rawTitle.trim();
}

/**
 * Produces a cross-source canonical series key so episodes of the same anime
 * downloaded from different sources (e.g. Nimegami, Otakudesu)
 * are grouped cleanly together even with small formatting differences.
 */
export function getCanonicalSeriesKey(rawTitle: string): string {
  let t = cleanDisplaySeriesTitle(rawTitle || '').toLowerCase();

  // Strip common leftover tags in brackets/parens such as (tv), [sub indo], (indo), (bd)
  t = t.replace(/\(\s*(?:sub\s*indo|indo|subtitle\s*indonesia|tv|bd|batch|uncensored|censored)\s*\)/gi, ' ');
  t = t.replace(/\[\s*(?:sub\s*indo|indo|subtitle\s*indonesia|tv|bd|batch|uncensored|censored)\s*\]/gi, ' ');

  // Normalize season forms so "Season 2", "2nd Season", and "S2" match consistently
  t = t.replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/gi, ' s$1 ');
  t = t.replace(/\bseason\s*(\d+)\b/gi, ' s$1 ');
  t = t.replace(/\bpart\s*(\d+)\b/gi, ' p$1 ');

  // Normalize punctuation & whitespace
  t = t.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t || (rawTitle || 'unknown').toLowerCase().trim();
}

export function extractEpisodeNumber(rawEpTitle: string): number {
  if (!rawEpTitle) return 999999;

  // Strip resolution tokens & bracketed metadata so "(720p)" / "[1080p]" never pollute numbers
  const stripped = rawEpTitle
    .replace(/\(\s*\d{3,4}p[^)]*\)/gi, ' ')
    .replace(/\[\s*\d{3,4}p[^\]]*\]/gi, ' ')
    .replace(/\b(?:360|480|720|1080|2160)p\b/gi, ' ')
    .trim();

  const lower = stripped.toLowerCase();
  const isOva = /\b(?:ova|ona|special|sp|nced|ncop)\b/i.test(lower);
  const isMovie = /\b(?:movie|film|theatrical)\b/i.test(lower);

  // Explicit episode/ep match handles strings like "Part 2 Episode 10" -> 10 accurately
  const explicitEp = stripped.match(/(?:episode|eps?\.?)\s*#?(\d+(?:\.\d+)?)/i);
  if (explicitEp?.[1]) {
    const num = parseFloat(explicitEp[1]);
    if (!Number.isNaN(num)) {
      if (isOva) return 10000 + num;
      if (isMovie) return 20000 + num;
      return num;
    }
  }

  // Fallback: match standalone number outside "Season X" or "Part X"
  const withoutSeasonPart = stripped
    .replace(/\b(?:season|s)\s*\d+\b/gi, ' ')
    .replace(/\bpart\s*\d+\b/gi, ' ');
  const standaloneNum = withoutSeasonPart.match(/(\d+(?:\.\d+)?)/);
  if (standaloneNum?.[1]) {
    const num = parseFloat(standaloneNum[1]);
    if (!Number.isNaN(num)) {
      if (isOva) return 10000 + num;
      if (isMovie) return 20000 + num;
      return num;
    }
  }

  if (isOva) return 10000;
  if (isMovie) return 20000;
  return 999999;
}

export function getEpisodeSlotKey(rawEpTitle: string): string {
  const epNum = extractEpisodeNumber(rawEpTitle);
  if (epNum < 999999) {
    return `ep:${epNum}`;
  }
  const clean = (rawEpTitle || '')
    .replace(/\(\s*\d{3,4}p[^)]*\)/gi, '')
    .replace(/\[\s*\d{3,4}p[^\]]*\]/gi, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
  return `txt:${clean || 'unknown'}`;
}

export function getResolutionRank(resolution?: string): number {
  const num = parseInt((resolution || '').replace(/[^\d]/g, ''), 10);
  if (!Number.isNaN(num) && num > 0) return num;
  if ((resolution || '').toUpperCase() === 'HD') return 720;
  return 0;
}

export function formatSourceLabel(source?: string): string {
  const s = (source || '').trim().toLowerCase();
  if (s === 'nimegami') return 'Nimegami';
  if (s === 'otakudesu') return 'Otakudesu';
  if (!s) return tSync('offline.sourceLocal');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatEpisodeShortLabel(item: OfflineAnimeItem, epNum?: number): string {
  const num = epNum ?? extractEpisodeNumber(item.episodeTitle);
  if (num < 10000) {
    return `Episode ${num}`;
  }
  if (num >= 10000 && num < 20000) {
    const ovaNum = num - 10000;
    return ovaNum > 0 ? `OVA ${ovaNum}` : 'OVA';
  }
  if (num >= 20000 && num < 999999) {
    const movNum = num - 20000;
    return movNum > 0 ? `Movie ${movNum}` : 'Movie';
  }
  return item.episodeTitle || 'Episode';
}

export function buildOfflineEpisodeSlots(seriesItems: OfflineAnimeItem[]): OfflineEpisodeSlot[] {
  const slotMap = new Map<string, OfflineAnimeItem[]>();

  for (const item of seriesItems) {
    const key = getEpisodeSlotKey(item.episodeTitle);
    const list = slotMap.get(key);
    if (list) {
      list.push(item);
    } else {
      slotMap.set(key, [item]);
    }
  }

  const slots: OfflineEpisodeSlot[] = [];
  for (const [slotKey, variants] of slotMap.entries()) {
    const sortedVariants = [...variants].sort((a, b) => {
      const rankDiff = getResolutionRank(a.resolution) - getResolutionRank(b.resolution);
      if (rankDiff !== 0) return rankDiff;
      return (b.downloadedAt || 0) - (a.downloadedAt || 0);
    });

    const epNum = extractEpisodeNumber(sortedVariants[0].episodeTitle);
    const resumedVariant = sortedVariants.find(
      v => v.lastPositionSeconds && v.lastPositionSeconds > 5,
    );
    const primaryItem = resumedVariant || sortedVariants[0];

    slots.push({
      slotKey,
      episodeNumber: epNum,
      displayLabel: formatEpisodeShortLabel(primaryItem, epNum),
      variants: sortedVariants,
      primaryItem,
    });
  }

  slots.sort((a, b) => {
    if (a.episodeNumber !== b.episodeNumber) {
      return a.episodeNumber - b.episodeNumber;
    }
    return a.displayLabel.localeCompare(b.displayLabel);
  });

  return slots;
}

export function groupOfflineAnimeSeries(items: OfflineAnimeItem[]): OfflineAnimeGroup[] {
  const groupMap = new Map<
    string,
    {
      canonicalKey: string;
      animeTitle: string;
      thumbnailUrl: string;
      sourcesSet: Set<string>;
      totalSize: number;
      items: OfflineAnimeItem[];
      latestAt: number;
    }
  >();

  for (const item of items) {
    const canonicalKey = getCanonicalSeriesKey(item.animeTitle);
    let entry = groupMap.get(canonicalKey);
    if (!entry) {
      entry = {
        canonicalKey,
        animeTitle: cleanDisplaySeriesTitle(item.animeTitle),
        thumbnailUrl: item.thumbnailUrl,
        sourcesSet: new Set<string>(),
        totalSize: 0,
        items: [],
        latestAt: item.downloadedAt || 0,
      };
      groupMap.set(canonicalKey, entry);
    }

    if (!entry.thumbnailUrl && item.thumbnailUrl) {
      entry.thumbnailUrl = item.thumbnailUrl;
    }
    if (item.source) {
      entry.sourcesSet.add(item.source.toLowerCase());
    }
    entry.totalSize += item.fileSize || 0;
    entry.items.push(item);
    if ((item.downloadedAt || 0) > entry.latestAt) {
      entry.latestAt = item.downloadedAt || 0;
    }
  }

  const groups: OfflineAnimeGroup[] = [];
  for (const entry of groupMap.values()) {
    const slots = buildOfflineEpisodeSlots(entry.items);
    const resumedItem = [...entry.items]
      .filter(i => i.lastPositionSeconds && i.lastPositionSeconds > 5)
      .sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0))[0];

    groups.push({
      canonicalKey: entry.canonicalKey,
      animeTitle: entry.animeTitle,
      thumbnailUrl: entry.thumbnailUrl,
      sources: Array.from(entry.sourcesSet),
      totalSize: entry.totalSize,
      slots,
      items: slots.flatMap(s => s.variants),
      lastPositionEp: resumedItem,
    });
  }

  return groups;
}
