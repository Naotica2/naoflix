import { DatabaseManager } from './DatabaseManager';

const CONFIG_URL = 'https://raw.githubusercontent.com/Naotica2/naoflix/main/scraper_config.json';

export interface RemoteConfig {
  lk21_base_url?: string;
  lk21_dramamu_url?: string;
  lk21_search_api?: string;
  anichin_domain?: string;
  [key: string]: string | undefined;
}

const DEFAULT_CONFIG: RemoteConfig = {
  lk21_base_url: 'https://tv12.lk21official.cc',
  lk21_dramamu_url: 'https://tv7.nontondrama.my',
  lk21_search_api: 'https://gudangvape.com/search.php',
  anichin_domain: 'https://anichin.cafe',
};

let cachedConfig: RemoteConfig | null = null;

export async function syncRemoteConfig(): Promise<void> {
  try {
    // Adding timestamp to prevent CDN or browser caching of the json
    const res = await fetch(CONFIG_URL + '?t=' + Date.now()); 
    if (res.ok) {
      const json = await res.json();
      DatabaseManager.set('remoteConfig', JSON.stringify(json));
      cachedConfig = json;
      console.log('Remote config synced successfully.');
    }
  } catch (e) {
    console.error('Failed to sync remote config', e);
  }
}

export function getRemoteConfig(): RemoteConfig {
  if (cachedConfig) return cachedConfig;
  
  const saved = DatabaseManager.getSync('remoteConfig');
  if (saved) {
    try {
      cachedConfig = JSON.parse(saved);
      return cachedConfig as RemoteConfig;
    } catch {}
  }
  return DEFAULT_CONFIG;
}
