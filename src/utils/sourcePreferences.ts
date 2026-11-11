import { DatabaseManager } from './DatabaseManager';

export interface SourcePreference {
  id: string;
  isActive: boolean;
}

const DEFAULT_PREFS: SourcePreference[] = [
  { id: 'komiku', isActive: true },
  { id: 'mynimeku', isActive: false },
  { id: 'bacakomik', isActive: false },
  { id: 'shinigami', isActive: false },
  { id: 'komikindo', isActive: false },
  { id: 'luvyaa', isActive: false },
  { id: 'voratoon', isActive: false },
  { id: 'otakudesu', isActive: true },
  { id: 'nimegami', isActive: false },
  { id: 'lk21', isActive: true },
];

let cachedPrefs: SourcePreference[] | null = null;
let sourceVersion = 0;

export function getSourceVersion(): number {
  return sourceVersion;
}

export async function getSourcePreferences(): Promise<SourcePreference[]> {
  if (cachedPrefs) return cachedPrefs;
  
  const saved = await DatabaseManager.get('extensionPreferences');
  if (saved) {
    try {
      const parsed: SourcePreference[] = JSON.parse(saved);
      const merged = DEFAULT_PREFS.map(def => {
        if (def.id === 'lk21') return { ...def, isActive: true };
        const found = parsed.find(p => p.id === def.id);
        return found ? { ...def, isActive: found.isActive } : def;
      });
      if (!merged.some(p => (p.id === 'otakudesu' || p.id === 'nimegami') && p.isActive)) {
        const idx = merged.findIndex(p => p.id === 'otakudesu');
        if (idx >= 0) merged[idx] = { ...merged[idx], isActive: true };
      }
      cachedPrefs = merged;
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
  return found ? found.isActive : true;
}

export function invalidateSourceCache() {
  cachedPrefs = null;
  sourceVersion += 1;
}

export async function getActiveAnimeSource(): Promise<'otakudesu' | 'nimegami'> {
  const prefs = await getSourcePreferences();
  if (isSourceActive(prefs, 'nimegami')) return 'nimegami';
  return 'otakudesu';
}

export async function getActiveFilmSource(): Promise<'lk21'> {
  return 'lk21';
}

export async function getActiveDonghuaSource(): Promise<'anichin'> {
  return 'anichin';
}
