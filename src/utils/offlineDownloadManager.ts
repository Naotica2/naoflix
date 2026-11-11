import { AppState, AppStateStatus, ToastAndroid } from 'react-native';
import RNFetchBlob from 'react-native-blob-util';
import {
  ActiveDownloadItem,
  DownloadPauseReason,
  OfflineAnimeItem,
} from '../types/offlineAnime';
import { tSync } from '../misc/LanguageContext';
import { DatabaseManager } from './DatabaseManager';
import deviceUserAgent from './deviceUserAgent';
import DialogManager from './dialogManager';
import getStreamHeaders from './streamHeaders';
import {
  extractFiledonVideoUrl,
  normalizeDirectDownloadUrl,
  resolveBestOtakudesuDownload,
  resolveOtakudesuDownloadUrl,
} from './scrapers/animeindo';
import { cleanAnimeTitle } from './watchHistorySync';

const DB_KEY = 'offlineAnimeList';
const PAUSED_DB_KEY = 'pausedDownloads';
const OFFLINE_DIR_NAME = 'naoflix_offline';
const STALL_TIMEOUT_MS = 15000;
const STALL_CHECK_INTERVAL_MS = 3000;
const NETWORK_PROBE_INTERVAL_MS = 5000;

type ProgressListener = (activeDownloads: Map<string, ActiveDownloadItem>) => void;
type ListListener = (list: OfflineAnimeItem[]) => void;

interface ActiveRunMeta {
  runToken: number;
  task?: any;
  targetPath: string;
  isRangePart: boolean;
  baseBytes: number;
  lastProgressAt: number;
  httpStatus: number;
  responseHeaders: Record<string, string>;
  outcome: 'active' | 'pausing' | 'paused' | 'canceled' | 'done';
  pauseReason?: DownloadPauseReason;
  isStall?: boolean;
  mergedPart?: boolean;
  finalizePromise?: Promise<void>;
}

class OfflineDownloadManager {
  private activeDownloads: Map<string, ActiveDownloadItem> = new Map();
  private activeTasks: Map<string, any> = new Map();
  private activeRunMeta: Map<string, ActiveRunMeta> = new Map();
  private progressListeners: Set<ProgressListener> = new Set();
  private listListeners: Set<ListListener> = new Set();
  private lastProgressFlush: Map<string, { time: number; pos: number }> = new Map();

  private runSeq = 0;
  private stallInterval: ReturnType<typeof setInterval> | null = null;
  private networkProbeInterval: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private isProbingNetwork = false;
  private initializedFromStorage = false;

  constructor() {
    setTimeout(() => {
      if (!this.initializedFromStorage) {
        void this.initFromStorage();
      }
    }, 50);
  }

  private getOfflineDir(): string {
    return `${RNFetchBlob.fs.dirs.DocumentDir}/${OFFLINE_DIR_NAME}`;
  }

  public async ensureDirExists(): Promise<string> {
    const dir = this.getOfflineDir();
    const exists = await RNFetchBlob.fs.isDir(dir).catch(() => false);
    if (!exists) {
      await RNFetchBlob.fs.mkdir(dir).catch(() => {});
    }
    // Ensure .nomedia exists so Android gallery and media scanner do not index this folder
    const noMediaPath = `${dir}/.nomedia`;
    const noMediaExists = await RNFetchBlob.fs.exists(noMediaPath).catch(() => false);
    if (!noMediaExists) {
      await RNFetchBlob.fs.writeFile(noMediaPath, '', 'utf8').catch(() => {});
    }
    return dir;
  }

  public async initFromStorage(): Promise<void> {
    this.initializedFromStorage = true;
    await this.loadPausedDownloadsFromStorage();
  }

  public async reloadFromStorage(): Promise<void> {
    this.initializedFromStorage = true;
    await this.loadPausedDownloadsFromStorage();
    this.notifyListListeners(this.getOfflineAnimeList());
  }

  private async loadPausedDownloadsFromStorage(): Promise<void> {
    try {
      const raw = (await DatabaseManager.get(PAUSED_DB_KEY).catch(() => null)) ??
        DatabaseManager.getSync(PAUSED_DB_KEY);
      if (!raw) return;

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      if (!Array.isArray(parsed)) return;

      const completedIds = new Set(this.getOfflineAnimeList().map(item => item.id));
      let hasNetworkPaused = false;
      let dirtyStorage = false;

      for (const entry of parsed) {
        if (!entry || typeof entry !== 'object' || !entry.id || !entry.filePath) {
          dirtyStorage = true;
          continue;
        }
        if (completedIds.has(entry.id)) {
          dirtyStorage = true;
          continue;
        }
        const existingInMem = this.activeDownloads.get(entry.id);
        if (existingInMem && existingInMem.status === 'downloading') {
          continue;
        }

        // Remove any leftover interrupted .part on cold restore if base file already tracks bytes
        const partPath = `${entry.filePath}.part`;
        await RNFetchBlob.fs.unlink(partPath).catch(() => {});

        const stat = await RNFetchBlob.fs.stat(entry.filePath).catch(() => null);
        const diskBytes = stat ? Number(stat.size) || 0 : 0;
        const totalBytes = Number(entry.totalBytes) || 0;
        const progressPercent =
          totalBytes > 0
            ? Math.min(99, Math.floor((diskBytes / totalBytes) * 100))
            : Number(entry.progressPercent) || 0;

        const pauseReason: DownloadPauseReason =
          entry.pauseReason === 'network' ? 'network' : 'manual';
        if (pauseReason === 'network') {
          hasNetworkPaused = true;
        }

        const restoredItem: ActiveDownloadItem = {
          id: String(entry.id),
          animeTitle: String(entry.animeTitle || ''),
          episodeTitle: String(entry.episodeTitle || ''),
          resolution: String(entry.resolution || '360p'),
          thumbnailUrl: String(entry.thumbnailUrl || ''),
          source: String(entry.source || 'otakudesu'),
          filePath: String(entry.filePath),
          receivedBytes: diskBytes,
          totalBytes,
          progressPercent,
          status: 'paused',
          pauseReason,
          sourceUrl: entry.sourceUrl ? String(entry.sourceUrl) : undefined,
          streamUrl: entry.streamUrl ? String(entry.streamUrl) : undefined,
          resolvedUrl: entry.resolvedUrl ? String(entry.resolvedUrl) : undefined,
          resumedBaseBytes: diskBytes,
          pausedAt: Number(entry.pausedAt) || Date.now(),
        };

        this.activeDownloads.set(restoredItem.id, restoredItem);
      }

      if (dirtyStorage) {
        this.savePausedDownloadsToStorage();
      }
      this.notifyProgressListeners();
      if (hasNetworkPaused) {
        this.startNetworkWatcher();
      }
    } catch {}
  }

  private savePausedDownloadsToStorage() {
    try {
      const pausedList = Array.from(this.activeDownloads.values())
        .filter(item => item.status === 'paused' || item.status === 'downloading')
        .map(item => ({
          id: item.id,
          animeTitle: item.animeTitle,
          episodeTitle: item.episodeTitle,
          resolution: item.resolution,
          thumbnailUrl: item.thumbnailUrl,
          source: item.source,
          filePath: item.filePath,
          receivedBytes: item.receivedBytes,
          totalBytes: item.totalBytes,
          progressPercent: item.progressPercent,
          status: 'paused' as const,
          pauseReason:
            item.pauseReason || (item.status === 'downloading' ? ('network' as const) : 'manual'),
          sourceUrl: item.sourceUrl,
          streamUrl: item.streamUrl,
          resolvedUrl: item.resolvedUrl,
          resumedBaseBytes: item.resumedBaseBytes,
          pausedAt: item.pausedAt || Date.now(),
        }));
      DatabaseManager.set(PAUSED_DB_KEY, JSON.stringify(pausedList));
    } catch {}
  }

  public getOfflineAnimeList(): OfflineAnimeItem[] {
    const raw = DatabaseManager.getSync(DB_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as OfflineAnimeItem[]) : [];
    } catch {
      return [];
    }
  }

  private saveOfflineAnimeList(list: OfflineAnimeItem[]) {
    DatabaseManager.set(DB_KEY, JSON.stringify(list));
    this.notifyListListeners(list);
  }

  public subscribeList(listener: ListListener): () => void {
    this.listListeners.add(listener);
    listener(this.getOfflineAnimeList());
    return () => {
      this.listListeners.delete(listener);
    };
  }

  public subscribeProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    listener(new Map(this.activeDownloads));
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  private notifyProgressListeners() {
    const copy = new Map(this.activeDownloads);
    this.progressListeners.forEach(listener => {
      try {
        listener(copy);
      } catch {}
    });
  }

  private isTransientNetworkError(errStr: string): boolean {
    const lower = (errStr || '').toLowerCase();
    return (
      lower.includes('request error') ||
      lower.includes('timeout') ||
      lower.includes('timed out') ||
      lower.includes('failed to connect') ||
      lower.includes('unable to resolve host') ||
      lower.includes('network is unreachable') ||
      lower.includes('no address associated') ||
      lower.includes('reset') ||
      lower.includes('eof') ||
      lower.includes('broken pipe') ||
      lower.includes('connection abort') ||
      lower.includes('software caused') ||
      lower.includes('ssl') ||
      lower.includes('handshake') ||
      lower.includes('econn') ||
      lower.includes('enotfound') ||
      lower.includes('etimedout') ||
      lower.includes('socket')
    );
  }

  private formatDownloadErrorMessage(errStr: string, fallbackTitle: string): string {
    const lower = (errStr || '').toLowerCase();
    let reason = errStr || fallbackTitle;
    if (
      lower.includes('unable to resolve host') ||
      lower.includes('failed to connect') ||
      lower.includes('network is unreachable') ||
      lower.includes('no address associated')
    ) {
      reason = tSync('offline.errUnreachable');
    } else if (lower.includes('timeout') || lower.includes('timed out')) {
      reason = tSync('offline.errTimeout');
    } else if (lower.includes('trust manager') || lower.includes('ssl') || lower.includes('cert')) {
      reason = tSync('offline.errSsl');
    }
    return tSync('offline.failedToast', { reason });
  }

  private notifyListListeners(list: OfflineAnimeItem[]) {
    this.listListeners.forEach(listener => {
      try {
        listener(list);
      } catch {}
    });
  }

  public async deleteOfflineAnime(id: string): Promise<boolean> {
    const list = this.getOfflineAnimeList();
    const target = list.find(item => item.id === id);
    if (!target) return false;

    await RNFetchBlob.fs.unlink(target.filePath).catch(() => {});
    await RNFetchBlob.fs.unlink(`${target.filePath}.part`).catch(() => {});
    this.lastProgressFlush.delete(id);

    const newList = list.filter(item => item.id !== id);
    this.saveOfflineAnimeList(newList);
    ToastAndroid.show(tSync('offline.deleteSuccessToast'), ToastAndroid.SHORT);
    return true;
  }

  public async deleteAllOfflineAnime(): Promise<void> {
    const activeIds = Array.from(this.activeDownloads.keys());
    for (const id of activeIds) {
      const meta = this.activeRunMeta.get(id);
      if (meta) {
        meta.outcome = 'canceled';
      }
      const task = this.activeTasks.get(id);
      if (task) {
        try {
          task.cancel(() => {});
        } catch {}
        this.activeTasks.delete(id);
      }
      const dlItem = this.activeDownloads.get(id);
      if (dlItem) {
        await RNFetchBlob.fs.unlink(dlItem.filePath).catch(() => {});
        await RNFetchBlob.fs.unlink(`${dlItem.filePath}.part`).catch(() => {});
      }
      this.activeDownloads.delete(id);
      this.activeRunMeta.delete(id);
    }
    this.savePausedDownloadsToStorage();
    this.stopStallWatchdogIfIdle();
    this.stopNetworkWatcher();
    this.notifyProgressListeners();

    const list = this.getOfflineAnimeList();
    for (const item of list) {
      await RNFetchBlob.fs.unlink(item.filePath).catch(() => {});
      await RNFetchBlob.fs.unlink(`${item.filePath}.part`).catch(() => {});
    }
    this.saveOfflineAnimeList([]);
    ToastAndroid.show(tSync('offline.deleteAllSuccessToast'), ToastAndroid.SHORT);
  }

  public updateOfflineProgress(id: string, positionSeconds: number, force: boolean = false) {
    const pos = Math.max(0, Math.floor(positionSeconds));
    const now = Date.now();
    const prev = this.lastProgressFlush.get(id);

    if (!force && prev) {
      if (now - prev.time < 4000 || Math.abs(pos - prev.pos) < 3) {
        return;
      }
    }

    const list = this.getOfflineAnimeList();
    const index = list.findIndex(item => item.id === id);
    if (index !== -1) {
      this.lastProgressFlush.set(id, { time: now, pos });
      list[index].lastPositionSeconds = pos;
      DatabaseManager.set(DB_KEY, JSON.stringify(list));
      if (force) {
        this.notifyListListeners(list);
      }
    }
  }

  private async isValidDownloadedVideoFile(filePath: string): Promise<boolean> {
    try {
      const stat = await RNFetchBlob.fs.stat(filePath).catch(() => null);
      if (!stat || Number(stat.size) <= 10000) {
        return false;
      }
      const stream = await RNFetchBlob.fs.readStream(filePath, 'ascii', 128);
      return await new Promise<boolean>(resolve => {
        let resolved = false;
        const done = (ok: boolean) => {
          if (!resolved) {
            resolved = true;
            resolve(ok);
          }
        };
        stream.open();
        stream.onData(chunk => {
          const head = typeof chunk === 'string' ? chunk : '';
          const lowerHead = head.trimStart().toLowerCase();
          const isBadText =
            lowerHead.startsWith('<html') ||
            lowerHead.startsWith('<!doctype') ||
            lowerHead.startsWith('<?xml') ||
            lowerHead.startsWith('{') ||
            lowerHead.startsWith('[') ||
            lowerHead.startsWith('#extm3u');
          done(!isBadText);
        });
        stream.onError(() => done(true));
        stream.onEnd(() => done(false));
      });
    } catch {
      return true;
    }
  }

  public async preparePlayback(item: OfflineAnimeItem): Promise<string> {
    const exists = await RNFetchBlob.fs.exists(item.filePath).catch(() => false);
    if (!exists) {
      throw new Error(tSync('offline.fileMissing'));
    }
    const valid = await this.isValidDownloadedVideoFile(item.filePath);
    if (!valid) {
      throw new Error(tSync('offline.fileCorrupt'));
    }
    return item.filePath;
  }

  public async cleanupPlayback(_sessionPath?: string): Promise<void> {
    // Direct MP4 downloads do not require session file cleanup
  }

  private startStallWatchdog() {
    if (this.stallInterval) return;
    this.stallInterval = setInterval(() => {
      const now = Date.now();
      let hasActive = false;
      for (const [id, meta] of this.activeRunMeta.entries()) {
        if (meta.outcome !== 'active') continue;
        hasActive = true;
        if (meta.task && now - meta.lastProgressAt >= STALL_TIMEOUT_MS) {
          void this.pauseDownload(id, 'network', true);
        }
      }
      if (!hasActive) {
        this.stopStallWatchdog();
      }
    }, STALL_CHECK_INTERVAL_MS);
  }

  private stopStallWatchdog() {
    if (this.stallInterval) {
      clearInterval(this.stallInterval);
      this.stallInterval = null;
    }
  }

  private stopStallWatchdogIfIdle() {
    for (const meta of this.activeRunMeta.values()) {
      if (meta.outcome === 'active') return;
    }
    this.stopStallWatchdog();
  }

  private hasNetworkPausedDownloads(): boolean {
    for (const item of this.activeDownloads.values()) {
      if (item.status === 'paused' && item.pauseReason === 'network') {
        return true;
      }
    }
    return false;
  }

  private startNetworkWatcher() {
    if (!this.hasNetworkPausedDownloads()) return;
    if (!this.appStateSubscription) {
      this.appStateSubscription = AppState.addEventListener(
        'change',
        (nextState: AppStateStatus) => {
          if (nextState === 'active') {
            void this.probeAndAutoResume();
          }
        },
      );
    }
    if (!this.networkProbeInterval) {
      this.networkProbeInterval = setInterval(() => {
        void this.probeAndAutoResume();
      }, NETWORK_PROBE_INTERVAL_MS);
    }
  }

  private stopNetworkWatcher() {
    if (this.networkProbeInterval) {
      clearInterval(this.networkProbeInterval);
      this.networkProbeInterval = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  private stopNetworkWatcherIfUnused() {
    if (!this.hasNetworkPausedDownloads()) {
      this.stopNetworkWatcher();
    }
  }

  private async probeAndAutoResume(): Promise<void> {
    if (this.isProbingNetwork) return;
    const networkPausedIds = Array.from(this.activeDownloads.values())
      .filter(d => d.status === 'paused' && d.pauseReason === 'network')
      .map(d => d.id);

    if (networkPausedIds.length === 0) {
      this.stopNetworkWatcher();
      return;
    }

    this.isProbingNetwork = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch('https://clients3.google.com/generate_204', {
        method: 'HEAD',
        signal: ctrl.signal,
      });
      if (res && (res.status === 204 || res.ok || (res.status >= 200 && res.status < 400))) {
        this.stopNetworkWatcher();
        ToastAndroid.show(
          tSync('offline.autoResumingToast', { count: networkPausedIds.length }),
          ToastAndroid.SHORT,
        );
        for (const id of networkPausedIds) {
          const item = this.activeDownloads.get(id);
          if (item && item.status === 'paused' && item.pauseReason === 'network') {
            await this.resumeDownload(id, true);
          }
        }
      }
    } catch {
      // Still offline; retry on next interval
    } finally {
      clearTimeout(timer);
      this.isProbingNetwork = false;
    }
  }

  private async consolidateRangePartOnPause(
    item: ActiveDownloadItem,
    meta: ActiveRunMeta,
  ): Promise<number> {
    const partPath = `${item.filePath}.part`;
    if (meta.isRangePart && !meta.mergedPart) {
      const partExists = await RNFetchBlob.fs.exists(partPath).catch(() => false);
      if (partExists) {
        const partStat = await RNFetchBlob.fs.stat(partPath).catch(() => null);
        const partSize = partStat ? Number(partStat.size) || 0 : 0;

        if (partSize > 0 && meta.httpStatus === 206) {
          await RNFetchBlob.fs.appendFile(item.filePath, partPath, 'uri').catch(() => {});
          meta.mergedPart = true;
        } else if (partSize > 0 && meta.httpStatus === 200) {
          const baseStat = await RNFetchBlob.fs.stat(item.filePath).catch(() => null);
          const baseSize = baseStat ? Number(baseStat.size) || 0 : 0;
          if (partSize > baseSize) {
            await RNFetchBlob.fs.unlink(item.filePath).catch(() => {});
            await RNFetchBlob.fs.mv(partPath, item.filePath).catch(() => {});
            meta.mergedPart = true;
          }
        }
      }
      await RNFetchBlob.fs.unlink(partPath).catch(() => {});
      meta.mergedPart = true;
    }
    const finalStat = await RNFetchBlob.fs.stat(item.filePath).catch(() => null);
    return finalStat ? Number(finalStat.size) || 0 : 0;
  }

  public async pauseDownload(
    id: string,
    reason: DownloadPauseReason = 'manual',
    isStall: boolean = false,
  ): Promise<boolean> {
    const item = this.activeDownloads.get(id);
    if (!item) return false;

    if (item.status === 'paused') {
      if (reason === 'manual' && item.pauseReason !== 'manual') {
        item.pauseReason = 'manual';
        this.savePausedDownloadsToStorage();
        this.notifyProgressListeners();
        this.stopNetworkWatcherIfUnused();
      }
      return true;
    }

    const meta = this.activeRunMeta.get(id);
    if (meta?.finalizePromise) {
      await meta.finalizePromise;
      return true;
    }

    if (meta) {
      meta.outcome = 'pausing';
      meta.pauseReason = reason;
      meta.isStall = isStall;

      const task = this.activeTasks.get(id) || meta.task;
      this.activeTasks.delete(id);

      meta.finalizePromise = (async () => {
        if (task) {
          try {
            task.cancel(() => {});
          } catch {}
          await new Promise<void>(r => setTimeout(() => r(), 120));
        }

        const diskBytes = await this.consolidateRangePartOnPause(item, meta);
        meta.outcome = 'paused';
        meta.task = undefined;
        this.stopStallWatchdogIfIdle();

        item.status = 'paused';
        item.pauseReason = reason;
        item.pausedAt = Date.now();
        item.receivedBytes = diskBytes;
        item.resumedBaseBytes = diskBytes;
        item.progressPercent =
          item.totalBytes > 0
            ? Math.min(99, Math.floor((diskBytes / item.totalBytes) * 100))
            : item.progressPercent;

        this.savePausedDownloadsToStorage();
        this.notifyProgressListeners();

        if (reason === 'network') {
          this.startNetworkWatcher();
          ToastAndroid.show(
            tSync('offline.pausedNetworkToast', { episode: item.episodeTitle }),
            ToastAndroid.LONG,
          );
        } else {
          this.stopNetworkWatcherIfUnused();
          ToastAndroid.show(
            tSync('offline.pausedManualToast', { episode: item.episodeTitle }),
            ToastAndroid.SHORT,
          );
        }
      })();

      await meta.finalizePromise;
      return true;
    }

    const stat = await RNFetchBlob.fs.stat(item.filePath).catch(() => null);
    const diskBytes = stat ? Number(stat.size) || 0 : item.receivedBytes;
    item.status = 'paused';
    item.pauseReason = reason;
    item.pausedAt = Date.now();
    item.receivedBytes = diskBytes;
    item.resumedBaseBytes = diskBytes;
    this.savePausedDownloadsToStorage();
    this.notifyProgressListeners();
    if (reason === 'network') {
      this.startNetworkWatcher();
    } else {
      this.stopNetworkWatcherIfUnused();
    }
    return true;
  }

  public async resumeDownload(id: string, silent: boolean = false): Promise<boolean> {
    const item = this.activeDownloads.get(id);
    if (!item) return false;
    if (item.status === 'downloading') return true;

    const prevMeta = this.activeRunMeta.get(id);
    if (prevMeta?.finalizePromise) {
      await prevMeta.finalizePromise;
    }

    await this.ensureDirExists();
    await RNFetchBlob.fs.unlink(`${item.filePath}.part`).catch(() => {});

    const stat = await RNFetchBlob.fs.stat(item.filePath).catch(() => null);
    const existingBytes = stat ? Number(stat.size) || 0 : 0;

    item.status = 'downloading';
    delete item.pauseReason;
    delete item.pausedAt;
    delete item.errorMessage;
    item.receivedBytes = existingBytes;
    item.resumedBaseBytes = existingBytes;
    if (item.totalBytes > 0) {
      item.progressPercent = Math.min(99, Math.floor((existingBytes / item.totalBytes) * 100));
    }

    this.savePausedDownloadsToStorage();
    this.stopNetworkWatcherIfUnused();
    this.notifyProgressListeners();

    if (!silent) {
      ToastAndroid.show(
        tSync('offline.resumed', { episode: item.episodeTitle }),
        ToastAndroid.SHORT,
      );
    }

    return this.launchFetchAttempt(item, existingBytes, 0);
  }

  public cancelDownload(id: string) {
    const meta = this.activeRunMeta.get(id);
    if (meta) {
      meta.outcome = 'canceled';
    }
    const task = this.activeTasks.get(id);
    if (task) {
      try {
        task.cancel(() => {});
      } catch {}
      this.activeTasks.delete(id);
    }
    this.activeRunMeta.delete(id);
    this.stopStallWatchdogIfIdle();

    const item = this.activeDownloads.get(id);
    if (item) {
      RNFetchBlob.fs.unlink(item.filePath).catch(() => {});
      RNFetchBlob.fs.unlink(`${item.filePath}.part`).catch(() => {});
      this.activeDownloads.delete(id);
      this.savePausedDownloadsToStorage();
      this.stopNetworkWatcherIfUnused();
      this.notifyProgressListeners();
      ToastAndroid.show(tSync('offline.canceledToast'), ToastAndroid.SHORT);
    }
  }

  public async startDownload({
    animeTitle,
    episodeTitle,
    source,
    sourceUrl,
    streamUrl,
    resolution,
    thumbnailUrl,
  }: {
    animeTitle: string;
    episodeTitle: string;
    source: string;
    sourceUrl?: string;
    streamUrl: string;
    resolution: string;
    thumbnailUrl: string;
  }): Promise<boolean> {
    if (!streamUrl || streamUrl.startsWith('javascript:') || streamUrl === 'about:blank') {
      ToastAndroid.show(tSync('offline.invalidLink'), ToastAndroid.LONG);
      return false;
    }

    const cleanTitle =
      cleanAnimeTitle(animeTitle) || animeTitle.replace(/[/\\:*?"<>|\s]/g, '_').trim();
    const cleanEp = episodeTitle.replace(/[/\\:*?"<>|\s]/g, '_').trim();
    const cleanRes = (resolution || 'HD').replace(/[/\\:*?"<>|\s()]/g, '_').trim();
    const cleanSource = (source || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '_');

    const legacyId = `${cleanTitle}__${cleanEp}__${cleanRes}`
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    const id = `${cleanTitle}__${cleanEp}__${cleanRes}__${cleanSource}`
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');

    const existingList = this.getOfflineAnimeList();
    const alreadyDownloaded = existingList.find(
      item =>
        item.id === id ||
        (item.id === legacyId && (item.source || '').toLowerCase() === cleanSource),
    );
    if (alreadyDownloaded) {
      const fileExists = await RNFetchBlob.fs
        .exists(alreadyDownloaded.filePath)
        .catch(() => false);
      if (fileExists) {
        DialogManager.alert(
          tSync('offline.redownloadTitle'),
          tSync('offline.redownloadDesc', { episode: episodeTitle, res: cleanRes }),
          [
            { text: tSync('common.cancel'), onPress: () => {} },
            {
              text: tSync('offline.redownloadBtn'),
              onPress: () => {
                void this.executeDownload({
                  id: alreadyDownloaded.id,
                  animeTitle: cleanTitle,
                  episodeTitle,
                  source,
                  sourceUrl,
                  streamUrl,
                  resolution: cleanRes,
                  thumbnailUrl,
                  cleanAnimeTitle: cleanTitle,
                  cleanEpisodeTitle: cleanEp,
                });
              },
            },
          ],
        );
        return false;
      }
    }

    const activeExisting =
      this.activeDownloads.get(id) ||
      (alreadyDownloaded ? this.activeDownloads.get(alreadyDownloaded.id) : undefined);
    if (activeExisting) {
      if (activeExisting.status === 'paused') {
        return this.resumeDownload(activeExisting.id);
      }
      ToastAndroid.show(tSync('offline.alreadyQueued'), ToastAndroid.LONG);
      return false;
    }

    return this.executeDownload({
      id,
      animeTitle: cleanTitle,
      episodeTitle,
      source,
      sourceUrl,
      streamUrl,
      resolution: cleanRes,
      thumbnailUrl,
      cleanAnimeTitle: cleanTitle,
      cleanEpisodeTitle: cleanEp,
    });
  }

  private async resolveDirectUrl(
    rawStreamUrl: string,
    sourceUrl?: string,
  ): Promise<string | null> {
    let finalDownloadUrl = normalizeDirectDownloadUrl(rawStreamUrl);
    const isShortlink =
      finalDownloadUrl.includes('link.desustream.com') ||
      finalDownloadUrl.includes('desustream') ||
      finalDownloadUrl.includes('desudrive') ||
      finalDownloadUrl.includes('desuarchive') ||
      finalDownloadUrl.includes('otakudesu.cloud') ||
      finalDownloadUrl.includes('otakudesu.blog') ||
      finalDownloadUrl.includes('pixeldrain.com/u/');

    if (isShortlink) {
      try {
        const resolved = await resolveOtakudesuDownloadUrl(
          finalDownloadUrl,
          undefined,
          sourceUrl,
        );
        if (resolved) {
          finalDownloadUrl = normalizeDirectDownloadUrl(resolved);
        }
      } catch {}
    }

    if (finalDownloadUrl.includes('filedon.co/')) {
      try {
        const extracted = await extractFiledonVideoUrl(finalDownloadUrl);
        if (extracted) {
          finalDownloadUrl = extracted;
        }
      } catch {}
    }

    if (
      !finalDownloadUrl ||
      finalDownloadUrl.toLowerCase().includes('.m3u8') ||
      finalDownloadUrl.toLowerCase().includes('is_hls=1')
    ) {
      return null;
    }

    // Preserve percent-encoded signatures on presigned CDN/R2/GoogleVideo URLs; only encode whitespace
    return finalDownloadUrl.trim().replace(/\s/g, '%20');
  }

  private async refreshExpiredDownloadUrl(item: ActiveDownloadItem): Promise<boolean> {
    try {
      if (!item.sourceUrl) return false;
      const { default: AnimeAPI } = await import('./AnimeAPI');
      const res = await AnimeAPI.fromUrl(item.sourceUrl, item.resolution).catch(() => null);
      if (!res || res === 'Unsupported' || res.type !== 'animeStreaming') {
        return false;
      }

      if ((item.source || '').toLowerCase() === 'otakudesu') {
        const fresh = await resolveBestOtakudesuDownload(
          res.downloadOptions || [],
          item.resolution || '360p',
          item.sourceUrl,
          res.streamingLink || '',
        );
        if (fresh) {
          item.streamUrl = fresh;
          item.resolvedUrl = undefined;
          return true;
        }
        return false;
      }

      const candidate =
        (res as any).downloadLink ||
        res.downloadOptions?.find(
          d =>
            d.resolution === item.resolution ||
            /berkasdrive|filedon|pdrain|pixeldrain/i.test(`${d.server}${d.url}`),
        )?.url ||
        res.streamingLink;

      if (candidate) {
        item.streamUrl = candidate;
        item.resolvedUrl = undefined;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async executeDownload({
    id,
    animeTitle,
    episodeTitle,
    source,
    sourceUrl,
    streamUrl,
    resolution,
    thumbnailUrl,
    cleanAnimeTitle: safeAnimeTitle,
    cleanEpisodeTitle: safeEpisodeTitle,
  }: {
    id: string;
    animeTitle: string;
    episodeTitle: string;
    source: string;
    sourceUrl?: string;
    streamUrl: string;
    resolution: string;
    thumbnailUrl: string;
    cleanAnimeTitle: string;
    cleanEpisodeTitle: string;
  }): Promise<boolean> {
    const dir = await this.ensureDirExists();
    const cleanResName = (resolution || 'HD').replace(/[^a-zA-Z0-9]/g, '_').trim();
    const safeAnime = safeAnimeTitle.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const safeEp = safeEpisodeTitle.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
    const baseName = `${safeAnime}_${safeEp}_${cleanResName}_${Date.now()}`;
    const finalMp4Path = `${dir}/${baseName}.mp4`;

    const activeItem: ActiveDownloadItem = {
      id,
      animeTitle,
      episodeTitle,
      resolution,
      thumbnailUrl,
      source,
      filePath: finalMp4Path,
      receivedBytes: 0,
      totalBytes: 0,
      progressPercent: 0,
      status: 'downloading',
      sourceUrl,
      streamUrl,
      resumedBaseBytes: 0,
    };

    this.activeDownloads.set(id, activeItem);
    this.savePausedDownloadsToStorage();
    this.notifyProgressListeners();

    ToastAndroid.show(tSync('offline.started'), ToastAndroid.LONG);

    return this.launchFetchAttempt(activeItem, 0, 0);
  }

  private async launchFetchAttempt(
    item: ActiveDownloadItem,
    existingBytes: number,
    retryCount: number,
  ): Promise<boolean> {
    const id = item.id;
    const isRangePart = existingBytes > 0;
    const targetPath = isRangePart ? `${item.filePath}.part` : item.filePath;
    const runToken = ++this.runSeq;

    const runMeta: ActiveRunMeta = {
      runToken,
      targetPath,
      isRangePart,
      baseBytes: existingBytes,
      lastProgressAt: Date.now(),
      httpStatus: 0,
      responseHeaders: {},
      outcome: 'active',
    };

    this.activeRunMeta.set(id, runMeta);
    this.startStallWatchdog();

    let finalDownloadUrl = item.resolvedUrl;
    if (!finalDownloadUrl) {
      if (!item.streamUrl) {
        this.activeRunMeta.delete(id);
        this.activeDownloads.delete(id);
        this.savePausedDownloadsToStorage();
        this.stopStallWatchdogIfIdle();
        this.notifyProgressListeners();
        ToastAndroid.show(tSync('offline.invalidLink'), ToastAndroid.LONG);
        return false;
      }

      const resolved = await this.resolveDirectUrl(item.streamUrl, item.sourceUrl);
      if (
        runMeta.outcome !== 'active' ||
        this.activeRunMeta.get(id)?.runToken !== runToken
      ) {
        return false;
      }
      if (!resolved) {
        this.activeRunMeta.delete(id);
        this.activeDownloads.delete(id);
        this.savePausedDownloadsToStorage();
        this.stopStallWatchdogIfIdle();
        this.notifyProgressListeners();
        ToastAndroid.show(tSync('offline.hlsUnsupported'), ToastAndroid.LONG);
        return false;
      }
      finalDownloadUrl = resolved;
      item.resolvedUrl = resolved;
    }

    if (isRangePart) {
      await RNFetchBlob.fs.unlink(targetPath).catch(() => {});
    }

    const rawHeaders: Record<string, string> = {
      'User-Agent': deviceUserAgent,
      ...(getStreamHeaders(finalDownloadUrl) || {}),
    };
    if (isRangePart) {
      rawHeaders.Range = `bytes=${existingBytes}-`;
    }

    const cleanHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawHeaders)) {
      if (k && v && typeof v === 'string') {
        cleanHeaders[k.trim()] = v.trim().replace(/[\r\n]+/g, '');
      }
    }

    try {
      const task = RNFetchBlob.config({
        path: targetPath,
        followRedirect: true,
      }).fetch('GET', finalDownloadUrl, cleanHeaders);

      if (
        runMeta.outcome !== 'active' ||
        this.activeRunMeta.get(id)?.runToken !== runToken
      ) {
        try {
          task.cancel(() => {});
        } catch {}
        return false;
      }

      runMeta.task = task;
      runMeta.lastProgressAt = Date.now();
      this.activeTasks.set(id, task);

      // Attach stateChange via cast because index.d.ts omits StatefulPromise.stateChange
      (task as any).stateChange?.((state: any) => {
        if (
          runMeta.outcome !== 'active' ||
          this.activeRunMeta.get(id)?.runToken !== runToken
        ) {
          return;
        }
        if (state?.status) {
          runMeta.httpStatus = Number(state.status) || runMeta.httpStatus;
        }
        if (state?.headers && typeof state.headers === 'object') {
          for (const [hk, hv] of Object.entries(state.headers)) {
            runMeta.responseHeaders[hk.toLowerCase()] = String(hv || '');
          }
          const prevTotal = item.totalBytes;
          const contentRange = runMeta.responseHeaders['content-range'];
          if (contentRange) {
            const m = contentRange.match(/\/(\d+)$/);
            if (m?.[1]) {
              const fullTotal = Number(m[1]) || 0;
              if (fullTotal > 0) {
                item.totalBytes = fullTotal;
              }
            }
          } else if (item.totalBytes <= 0) {
            const contentLength = Number(runMeta.responseHeaders['content-length']) || 0;
            if (contentLength > 0) {
              item.totalBytes =
                isRangePart && runMeta.httpStatus === 206
                  ? existingBytes + contentLength
                  : contentLength;
            }
          }
          if (item.totalBytes > prevTotal) {
            this.savePausedDownloadsToStorage();
          }
        }
      });

      let lastEmittedPercent = -1;
      let lastEmitTime = 0;

      task.progress((received: any, total: any) => {
        if (
          runMeta.outcome !== 'active' ||
          this.activeRunMeta.get(id)?.runToken !== runToken
        ) {
          return;
        }
        runMeta.lastProgressAt = Date.now();

        const rawRec = Number(received) || 0;
        const rawTot = Number(total) || 0;
        const isServerRestart200 = isRangePart && runMeta.httpStatus === 200;

        let effectiveReceived = rawRec;
        let effectiveTotal = rawTot;

        if (isRangePart && !isServerRestart200) {
          effectiveReceived = existingBytes + rawRec;
          if (item.totalBytes > existingBytes) {
            effectiveTotal = item.totalBytes;
          } else if (rawTot > 0) {
            effectiveTotal = existingBytes + rawTot;
          } else {
            effectiveTotal = 0;
          }
        } else if (item.totalBytes > 0 && rawTot <= 0) {
          effectiveTotal = item.totalBytes;
        }

        const percent =
          effectiveTotal > 0
            ? Math.min(99, Math.floor((effectiveReceived / effectiveTotal) * 100))
            : item.progressPercent;

        const current = this.activeDownloads.get(id);
        if (current && current.status === 'downloading') {
          current.receivedBytes = effectiveReceived;
          current.totalBytes = effectiveTotal;
          current.progressPercent = percent;

          const now = Date.now();
          if (
            lastEmittedPercent === -1 ||
            percent - lastEmittedPercent >= 2 ||
            now - lastEmitTime >= 300
          ) {
            lastEmittedPercent = percent;
            lastEmitTime = now;
            this.notifyProgressListeners();
          }
        }
      });

      task
        .then(async res => {
          if (
            runMeta.outcome !== 'active' ||
            this.activeRunMeta.get(id)?.runToken !== runToken
          ) {
            return;
          }

          runMeta.outcome = 'done';
          this.activeTasks.delete(id);
          this.activeRunMeta.delete(id);
          this.stopStallWatchdogIfIdle();

          const info = res.info();
          const status = Number(info.status) || runMeta.httpStatus || 0;
          const headersObj = info.headers || {};
          let contentType = '';
          let contentRange = '';
          for (const [hk, hv] of Object.entries(headersObj)) {
            const lk = hk.toLowerCase();
            if (lk === 'content-type') contentType = String(hv || '').toLowerCase();
            if (lk === 'content-range') contentRange = String(hv || '').toLowerCase();
          }

          if (contentRange) {
            const m = contentRange.match(/\/(\d+)$/);
            if (m?.[1] && Number(m[1]) > 0) {
              item.totalBytes = Number(m[1]);
            }
          }

          // Handle 416 Range Not Satisfiable
          if (status === 416 && isRangePart) {
            await RNFetchBlob.fs.unlink(targetPath).catch(() => {});
            const existingStat = await RNFetchBlob.fs.stat(item.filePath).catch(() => null);
            const diskSize = existingStat ? Number(existingStat.size) || 0 : 0;
            const diskValid =
              diskSize > 10000 &&
              (!item.totalBytes || diskSize >= item.totalBytes * 0.98) &&
              (await this.isValidDownloadedVideoFile(item.filePath));

            if (diskValid) {
              this.finalizeCompletedItem(item, diskSize);
              return;
            }
            if (retryCount < 1) {
              await RNFetchBlob.fs.unlink(item.filePath).catch(() => {});
              item.receivedBytes = 0;
              item.resumedBaseBytes = 0;
              item.progressPercent = 0;
              this.notifyProgressListeners();
              await this.launchFetchAttempt(item, 0, retryCount + 1);
              return;
            }
          }

          // Handle expired link (403/404/410) once by re-resolving from sourceUrl
          if ((status === 403 || status === 404 || status === 410) && retryCount < 1) {
            if (isRangePart) {
              await RNFetchBlob.fs.unlink(targetPath).catch(() => {});
            }
            const refreshed = await this.refreshExpiredDownloadUrl(item);
            if (refreshed) {
              await this.launchFetchAttempt(item, existingBytes, retryCount + 1);
              return;
            }
          }

          const actualPath = res.path() || targetPath;
          const partStat = await RNFetchBlob.fs.stat(actualPath).catch(() => null);
          const receivedChunkSize = partStat ? Number(partStat.size) || 0 : 0;

          const isBadMime =
            contentType.includes('text/html') ||
            contentType.includes('application/json') ||
            contentType.includes('application/xhtml') ||
            contentType.includes('mpegurl');

          if (status >= 200 && status < 400 && !isBadMime) {
            if (isRangePart && status === 206) {
              if (receivedChunkSize > 0) {
                await RNFetchBlob.fs.appendFile(item.filePath, actualPath, 'uri');
              }
              await RNFetchBlob.fs.unlink(actualPath).catch(() => {});
              const mergedStat = await RNFetchBlob.fs.stat(item.filePath).catch(() => null);
              const mergedSize = mergedStat ? Number(mergedStat.size) || 0 : 0;
              const isValid =
                mergedSize > 10000 && (await this.isValidDownloadedVideoFile(item.filePath));
              if (isValid) {
                this.finalizeCompletedItem(item, mergedSize);
                return;
              }
            } else if (isRangePart) {
              // Server returned 200 (full file from byte 0 into .part)
              const partValid =
                receivedChunkSize > 10000 && (await this.isValidDownloadedVideoFile(actualPath));
              if (partValid) {
                await RNFetchBlob.fs.unlink(item.filePath).catch(() => {});
                await RNFetchBlob.fs.mv(actualPath, item.filePath);
                this.finalizeCompletedItem(item, receivedChunkSize);
                return;
              }
              await RNFetchBlob.fs.unlink(actualPath).catch(() => {});
            } else {
              const directValid =
                receivedChunkSize > 10000 && (await this.isValidDownloadedVideoFile(actualPath));
              if (directValid) {
                if (actualPath !== item.filePath) {
                  await RNFetchBlob.fs.unlink(item.filePath).catch(() => {});
                  await RNFetchBlob.fs.mv(actualPath, item.filePath).catch(() => {});
                }
                this.finalizeCompletedItem(item, receivedChunkSize);
                return;
              }
            }
          }

          await RNFetchBlob.fs.unlink(actualPath).catch(() => {});
          if (isRangePart) {
            await RNFetchBlob.fs.unlink(item.filePath).catch(() => {});
          }
          this.activeDownloads.delete(id);
          this.savePausedDownloadsToStorage();
          this.notifyProgressListeners();

          if (isBadMime || (status >= 200 && status < 400 && receivedChunkSize > 10000)) {
            ToastAndroid.show(tSync('offline.badHtmlToast'), ToastAndroid.LONG);
          } else if (status >= 200 && status < 400 && receivedChunkSize <= 10000) {
            ToastAndroid.show(tSync('offline.tooSmallToast'), ToastAndroid.LONG);
          } else {
            ToastAndroid.show(tSync('offline.httpFailedToast', { status }), ToastAndroid.LONG);
          }
        })
        .catch(async err => {
          if (
            runMeta.outcome !== 'active' ||
            this.activeRunMeta.get(id)?.runToken !== runToken
          ) {
            return;
          }

          this.activeTasks.delete(id);
          this.activeRunMeta.delete(id);
          this.stopStallWatchdogIfIdle();

          const errStr = String(err?.message || err || '');
          const lowerErr = errStr.toLowerCase();

          if (lowerErr.includes('canceled') || lowerErr.includes('cancelled')) {
            await RNFetchBlob.fs.unlink(targetPath).catch(() => {});
            this.activeDownloads.delete(id);
            this.savePausedDownloadsToStorage();
            this.notifyProgressListeners();
            return;
          }

          if (this.isTransientNetworkError(errStr)) {
            await new Promise<void>(r => setTimeout(() => r(), 100));
            const diskBytes = await this.consolidateRangePartOnPause(item, runMeta);
            item.status = 'paused';
            item.pauseReason = 'network';
            item.pausedAt = Date.now();
            item.receivedBytes = diskBytes;
            item.resumedBaseBytes = diskBytes;
            if (item.totalBytes > 0) {
              item.progressPercent = Math.min(99, Math.floor((diskBytes / item.totalBytes) * 100));
            }
            this.savePausedDownloadsToStorage();
            this.notifyProgressListeners();
            this.startNetworkWatcher();
            ToastAndroid.show(
              tSync('offline.pausedNetworkToast', { episode: item.episodeTitle }),
              ToastAndroid.LONG,
            );
            return;
          }

          await RNFetchBlob.fs.unlink(targetPath).catch(() => {});
          if (isRangePart) {
            await RNFetchBlob.fs.unlink(item.filePath).catch(() => {});
          }
          this.activeDownloads.delete(id);
          this.savePausedDownloadsToStorage();
          this.notifyProgressListeners();
          ToastAndroid.show(
            this.formatDownloadErrorMessage(errStr, item.episodeTitle),
            ToastAndroid.LONG,
          );
        });

      return true;
    } catch (e: any) {
      if (runMeta.outcome !== 'active') {
        return false;
      }
      this.activeTasks.delete(id);
      this.activeRunMeta.delete(id);
      this.stopStallWatchdogIfIdle();

      const errStr = String(e?.message || '');
      if (this.isTransientNetworkError(errStr)) {
        const diskBytes = await this.consolidateRangePartOnPause(item, runMeta);
        item.status = 'paused';
        item.pauseReason = 'network';
        item.pausedAt = Date.now();
        item.receivedBytes = diskBytes;
        item.resumedBaseBytes = diskBytes;
        this.savePausedDownloadsToStorage();
        this.notifyProgressListeners();
        this.startNetworkWatcher();
        ToastAndroid.show(
          tSync('offline.pausedNetworkToast', { episode: item.episodeTitle }),
          ToastAndroid.LONG,
        );
        return true;
      }

      this.activeDownloads.delete(id);
      this.savePausedDownloadsToStorage();
      this.notifyProgressListeners();
      RNFetchBlob.fs.unlink(targetPath).catch(() => {});
      ToastAndroid.show(
        this.formatDownloadErrorMessage(errStr, item.episodeTitle),
        ToastAndroid.SHORT,
      );
      return false;
    }
  }

  private finalizeCompletedItem(item: ActiveDownloadItem, fileSize: number) {
    this.lastProgressFlush.delete(item.id);
    this.activeDownloads.delete(item.id);
    this.savePausedDownloadsToStorage();
    this.stopNetworkWatcherIfUnused();
    this.notifyProgressListeners();

    const newOfflineItem: OfflineAnimeItem = {
      id: item.id,
      animeTitle: item.animeTitle,
      episodeTitle: item.episodeTitle,
      source: item.source,
      sourceUrl: item.sourceUrl,
      thumbnailUrl: item.thumbnailUrl,
      filePath: item.filePath,
      fileSize,
      resolution: item.resolution,
      downloadedAt: Date.now(),
      lastPositionSeconds: 0,
    };

    const list = this.getOfflineAnimeList();
    const existingTarget = list.find(x => x.id === item.id);
    if (existingTarget && existingTarget.filePath !== item.filePath) {
      RNFetchBlob.fs.unlink(existingTarget.filePath).catch(() => {});
    }
    const filtered = list.filter(x => x.id !== item.id);
    filtered.unshift(newOfflineItem);
    this.saveOfflineAnimeList(filtered);

    ToastAndroid.show(
      tSync('offline.completedToast', {
        title: item.animeTitle,
        episode: item.episodeTitle,
      }),
      ToastAndroid.LONG,
    );
  }

  public formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${Math.floor(bytes)} B`;
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  public getTotalOfflineStorage(): number {
    const list = this.getOfflineAnimeList();
    return list.reduce((acc, curr) => acc + (curr.fileSize || 0), 0);
  }
}

export const offlineDownloadManager = new OfflineDownloadManager();
export default offlineDownloadManager;
