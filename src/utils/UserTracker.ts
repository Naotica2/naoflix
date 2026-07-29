import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { DatabaseManager } from './DatabaseManager';
import { HistoryItemKey } from '../types/databaseTarget';
import { HistoryJSON } from '../types/historyJSON';
import URL from 'url';

export type TrackerCategory = 'anime' | 'movie' | 'series' | 'comic' | 'novel';

export interface UserStats {
  animeCount: number;
  animeEpisodes: number;
  movieCount: number;
  seriesCount: number;
  seriesEpisodes: number;
  comicCount: number;
  comicChapters: number;
  novelCount: number;
  novelChapters: number;
  animeTimeMs: number;
  movieTimeMs: number;
  seriesTimeMs: number;
  comicTimeMs: number;
  novelTimeMs: number;
}

export function useTimeTracker(category: TrackerCategory | null) {
  useEffect(() => {
    if (!category) return;
    
    let lastSaveTime = Date.now();

    const saveTime = () => {
      const now = Date.now();
      const timeSpent = now - lastSaveTime;
      if (timeSpent > 1000) {
        const statsKey = 'user_time_statistics';
        try {
          let rawStats = DatabaseManager.getSync(statsKey as any);
          if (rawStats === 'null' || !rawStats) rawStats = '{}';
          
          let stats: Record<string, number> = {};
          try {
            stats = JSON.parse(rawStats);
            if (!stats || typeof stats !== 'object') stats = {};
          } catch (e) {
            stats = {};
          }
          
          const timeKey = `${category}TimeMs`;
          stats[timeKey] = (stats[timeKey] || 0) + timeSpent;
          
          DatabaseManager.setSync(statsKey as any, JSON.stringify(stats));
          lastSaveTime = now;
        } catch (e) {
          console.error("Failed to save time stats", e);
        }
      }
    };

    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        saveTime();
      }
    }, 10000);

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState.match(/inactive|background/)) {
        saveTime();
      } else if (nextAppState === 'active') {
        lastSaveTime = Date.now();
      }
    });

    return () => {
      saveTime();
      clearInterval(interval);
      subscription.remove();
    };
  }, [category]);
}

export async function getUserStats(): Promise<UserStats> {
  const stats: UserStats = {
    animeCount: 0,
    animeEpisodes: 0,
    movieCount: 0,
    seriesCount: 0,
    seriesEpisodes: 0,
    comicCount: 0,
    comicChapters: 0,
    novelCount: 0,
    novelChapters: 0,
    animeTimeMs: 0,
    movieTimeMs: 0,
    seriesTimeMs: 0,
    comicTimeMs: 0,
    novelTimeMs: 0,
  };

  try {
    const rawTimeStats = await DatabaseManager.get('user_time_statistics' as any);
    if (rawTimeStats && rawTimeStats !== 'null') {
      try {
        const timeStats = JSON.parse(rawTimeStats);
        if (timeStats && typeof timeStats === 'object') {
          stats.animeTimeMs = timeStats.animeTimeMs || 0;
          stats.movieTimeMs = timeStats.movieTimeMs || 0;
          stats.seriesTimeMs = timeStats.seriesTimeMs || 0;
          stats.comicTimeMs = timeStats.comicTimeMs || 0;
          stats.novelTimeMs = timeStats.novelTimeMs || 0;
        }
      } catch (e) {
        console.error('Failed to parse user time stats', e);
      }
    }

    const keyOrderStr = await DatabaseManager.get('historyKeyCollectionsOrder' as any);
    if (keyOrderStr) {
      const keyOrder: HistoryItemKey[] = JSON.parse(keyOrderStr);
      const itemsPromises = keyOrder.map(key => DatabaseManager.get(key));
      const items = await Promise.all(itemsPromises);
      
      items.forEach((value) => {
        if (!value) return;
        try {
          const item: HistoryJSON = JSON.parse(value);
          
          let epNum = 1;
          if (item.episode) {
            const numMatch = item.episode.match(/(\d+)/);
            if (numMatch) {
              epNum = parseInt(numMatch[1], 10);
            }
          }

          const hostname = URL.parse(item.link || '').hostname || '';
          
          if (item.isComics) {
            if (hostname.includes('meionovel')) {
              stats.novelCount += 1;
              stats.novelChapters += epNum;
            } else {
              stats.comicCount += 1;
              stats.comicChapters += epNum;
            }
          } else if (item.isMovie || hostname.includes('movie-box') || hostname.includes('moviebox')) {
            stats.movieCount += 1;
          } else if (item.link?.includes('se=') || (typeof item.episode === 'string' && /S\d+E\d+/i.test(item.episode))) {
            stats.seriesCount += 1;
            stats.seriesEpisodes += epNum;
          } else {
            stats.animeCount += 1;
            stats.animeEpisodes += epNum;
          }
        } catch (e) {
        }
      });
    }
  } catch (error) {
    console.error('Failed to get user stats:', error);
  }

  return stats;
}
