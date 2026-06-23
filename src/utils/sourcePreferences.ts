import { DatabaseManager } from './DatabaseManager';

export interface SourcePreference {
  id: string;
  isActive: boolean;
}

const DEFAULT_PREFS: SourcePreference[] = [
  { id: 'komiku', isActive: true },
  { id: 'mynimeku', isActive: false },
  { id: 'bacakomik', isActive: false },
  { id: 'mangadex', isActive: false },
  { id: 'shinigami', isActive: false },
  { id: 'komikcast', isActive: false },
  { id: 'otakudesu', isActive: true },
  { id: 'animelovers', isActive: false },
];

let cachedPrefs: SourcePreference[] | null = null;

export async function getSourcePreferences(): Promise<SourcePreference[]> {
  if (cachedPrefs) return cachedPrefs;
  
  const saved = await DatabaseManager.get('extensionPreferences');
  if (saved) {
    try {
      const parsed: SourcePreference[] = JSON.parse(saved);
      // Merge with defaults so new sources auto-appear
      cachedPrefs = DEFAULT_PREFS.map(def => {
        const found = parsed.find(p => p.id === def.id);
        return found ? { ...def, isActive: found.isActive } : def;
      });
    } catch {
      cachedPrefs = DEFAULT_PREFS;
    }
  } else {
    cachedPrefs = DEFAULT_PREFS;
  }
  return cachedPrefs;
}

export function isSourceActive(prefs: SourcePreference[], sourceId: string): boolean {
  const found = prefs.find(p => p.id === sourceId);
  return found ? found.isActive : true; // default active if not found
}

export function invalidateSourceCache() {
  cachedPrefs = null;
}
