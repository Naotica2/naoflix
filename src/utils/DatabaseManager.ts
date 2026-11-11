import { useFocusEffect } from '@react-navigation/native';
import { EventEmitter } from 'expo';
import SQLiteKV from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import defaultDatabaseValue from '../misc/defaultDatabaseValue.json';
import { HistoryItemKey, SetDatabaseTarget } from '../types/databaseTarget';
import { HistoryJSON } from '../types/historyJSON';

export type DataKey = SetDatabaseTarget | HistoryItemKey | `IGNORE_DEFAULT_DB_${string}`;

export type AppDatabase = Omit<
  Record<SetDatabaseTarget | 'history', string>,
  'historyKeyCollectionsOrder'
>;

export class DatabaseManager {
  static #event = new EventEmitter<Record<string, (value: string) => void>>();

  static async set(key: string, value: string) {
    await SQLiteKV.setItem(key, value);
    this.#event.emit('valueChanged', key);
  }
  static async setSilent(key: string, value: string) {
    await SQLiteKV.setItem(key, value);
  }
  static setSync(key: DataKey, value: string) {
    SQLiteKV.setItemSync(key, value);
    this.#event.emit('valueChanged', key);
  }
  static get(key: DataKey) {
    return SQLiteKV.getItem(key);
  }
  static getSync(key: DataKey) {
    return SQLiteKV.getItemSync(key);
  }
  static getAllKeys() {
    return SQLiteKV.getAllKeys();
  }
  static getAllKeysSync() {
    return SQLiteKV.getAllKeysSync();
  }
  static async delete(key: string) {
    await SQLiteKV.removeItem(key);
    this.#event.emit('valueChanged', key);
  }
  static deleteSync(key: DataKey) {
    SQLiteKV.removeItemSync(key);
    this.#event.emit('valueChanged', key);
  }

  static async getDataForBackup(): Promise<AppDatabase> {
    let historyKeyOrder: HistoryItemKey[] = [];
    try {
      const parsed = JSON.parse((await this.get('historyKeyCollectionsOrder')) ?? '[]');
      if (Array.isArray(parsed)) {
        historyKeyOrder = parsed as HistoryItemKey[];
      }
    } catch {
      historyKeyOrder = [];
    }
    const history = await toOldHistoryStructure(historyKeyOrder);

    return {
      audioMixingMode: (await this.get('audioMixingMode')) ?? defaultDatabaseValue.audioMixingMode,
      colorScheme: (await this.get('colorScheme')) ?? defaultDatabaseValue.colorScheme,
      enableBatteryTimeInfo:
        (await this.get('enableBatteryTimeInfo')) ?? defaultDatabaseValue.enableBatteryTimeInfo,
      enableNowPlayingNotification:
        (await this.get('enableNowPlayingNotification')) ??
        defaultDatabaseValue.enableNowPlayingNotification,
      history: JSON.stringify(history),
      searchHistory: (await this.get('searchHistory')) ?? defaultDatabaseValue.searchHistory,
      novelSearchHistory:
        (await this.get('novelSearchHistory')) ?? defaultDatabaseValue.novelSearchHistory,
      watchLater: (await this.get('watchLater')) ?? defaultDatabaseValue.watchLater,
      extensionPreferences:
        (await this.get('extensionPreferences')) ?? defaultDatabaseValue.extensionPreferences,
      local_exp: (await this.get('local_exp')) ?? defaultDatabaseValue.local_exp,
      enableForumChat:
        (await this.get('enableForumChat')) ?? defaultDatabaseValue.enableForumChat,
      last_announcement_hash:
        (await this.get('last_announcement_hash')) ?? defaultDatabaseValue.last_announcement_hash,
      remoteConfig: (await this.get('remoteConfig')) ?? defaultDatabaseValue.remoteConfig,
      homeShowAnime: (await this.get('homeShowAnime')) ?? defaultDatabaseValue.homeShowAnime,
      homeShowComics: (await this.get('homeShowComics')) ?? defaultDatabaseValue.homeShowComics,
      homeShowNovels: (await this.get('homeShowNovels')) ?? defaultDatabaseValue.homeShowNovels,
      homeShowFilms: (await this.get('homeShowFilms')) ?? defaultDatabaseValue.homeShowFilms,
      homeShowDonghua: (await this.get('homeShowDonghua')) ?? defaultDatabaseValue.homeShowDonghua,
      offlineAnimeList:
        (await this.get('offlineAnimeList')) ?? defaultDatabaseValue.offlineAnimeList,
      pausedDownloads:
        (await this.get('pausedDownloads')) ?? defaultDatabaseValue.pausedDownloads,
      language: (await this.get('language')) ?? defaultDatabaseValue.language,
    };
  }

  static listenOnValueChanged(callback: (key: string) => void) {
    return this.#event.addListener('valueChanged', callback);
  }
}

export function useKeyValueIfFocused(key: DataKey) {
  const [value, setValue] = useState(() => DatabaseManager.getSync(key));
  useFocusEffect(
    useCallback(() => {
      const syncVal = DatabaseManager.getSync(key);
      setValue(prev => (prev === syncVal ? prev : syncVal));
      const listener = DatabaseManager.listenOnValueChanged(async changeKey => {
        if (key === changeKey) {
          const nextVal = await DatabaseManager.get(key);
          setValue(prev => (prev === nextVal ? prev : nextVal));
        }
      });

      return () => listener.remove();
    }, [key]),
  );
  return value;
}
export function useModifiedKeyValueIfFocused<T>(
  key: DataKey,
  modifyValueFunc: (value: string) => T,
  fallback?: T,
) {
  const value = useKeyValueIfFocused(key);
  const [modifiedValue, setModifiedValue] = useState<T>(() => {
    try {
      if (value == null) return fallback as T;
      return modifyValueFunc(value);
    } catch {
      return fallback as T;
    }
  });
  const modifyFuncRef = useRef(modifyValueFunc);
  const lastRawRef = useRef<string | null | undefined>(value);
  useEffect(() => {
    modifyFuncRef.current = modifyValueFunc;
  });
  useFocusEffect(
    useCallback(() => {
      if (lastRawRef.current === value) return;
      lastRawRef.current = value;
      try {
        if (value == null) {
          setModifiedValue(fallback as T);
          return;
        }
        setModifiedValue(modifyFuncRef.current(value));
      } catch {
      }
    }, [value, fallback]),
  );
  return modifiedValue;
}

export function toNewHistoryStructure(oldHistory: HistoryJSON[]): {
  keyCollectionsOrder: HistoryItemKey[];
  newHistory: { key: HistoryItemKey; data: HistoryJSON }[];
} {
  const validItems = Array.isArray(oldHistory)
    ? oldHistory.filter(x => x && typeof x.title === 'string' && x.title.trim().length > 0)
    : [];
  return {
    keyCollectionsOrder: validItems.map(
      x =>
        `historyItem:${x.title.trim()}:${x.isComics ?? 'false'}:${x.isMovie ?? 'false'}` as const,
    ),
    newHistory: validItems.map(x => ({
      key: `historyItem:${x.title.trim()}:${x.isComics ?? 'false'}:${x.isMovie ?? 'false'}` as const,
      data: x,
    })),
  };
}
export async function toOldHistoryStructure(keyCollectionsOrder: HistoryItemKey[]) {
  const history: HistoryJSON[] = [];
  if (!Array.isArray(keyCollectionsOrder)) return history;
  for (const key of keyCollectionsOrder) {
    if (typeof key !== 'string') continue;
    const data = await DatabaseManager.get(key);
    if (!data) continue;
    try {
      const dataJson = JSON.parse(data) as HistoryJSON;
      if (dataJson && typeof dataJson === 'object') {
        history.push(dataJson);
      }
    } catch {}
  }
  return history;
}
export async function DANGER_MIGRATE_OLD_HISTORY(oldHistoryString: HistoryJSON[]) {
  const newHistory = toNewHistoryStructure(oldHistoryString);
  await DatabaseManager.set(
    'historyKeyCollectionsOrder',
    JSON.stringify(newHistory.keyCollectionsOrder),
  );
  for (const data of newHistory.newHistory) {
    await DatabaseManager.set(data.key, JSON.stringify(data.data));
  }
}
