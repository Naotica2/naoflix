export type DownloadPauseReason = 'manual' | 'network';

export interface OfflineAnimeItem {
  id: string; // unique id (e.g., slug_episode or url hash)
  animeTitle: string;
  episodeTitle: string;
  source: 'otakudesu' | 'nimegami' | string;
  sourceUrl?: string;
  thumbnailUrl: string;
  filePath: string; // local MP4 path in DocumentDir
  fileSize: number; // bytes
  resolution: string;
  downloadedAt: number; // completion timestamp (ms)
  duration?: number; // total duration in seconds
  lastPositionSeconds?: number; // last playback position in seconds
}

export interface ActiveDownloadItem {
  id: string;
  animeTitle: string;
  episodeTitle: string;
  resolution: string;
  thumbnailUrl: string;
  source: string;
  filePath: string;
  receivedBytes: number;
  totalBytes: number;
  progressPercent: number;
  status: 'downloading' | 'paused' | 'completed' | 'failed' | 'canceled';
  pauseReason?: DownloadPauseReason;
  errorMessage?: string;
  sourceUrl?: string;
  streamUrl?: string;
  resolvedUrl?: string;
  resumedBaseBytes?: number;
  pausedAt?: number;
}
