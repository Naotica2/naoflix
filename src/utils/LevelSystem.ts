
import { getCurrentLanguage } from '../misc/LanguageContext';
import { DatabaseManager } from './DatabaseManager';

export const MAX_LEVEL = 999;

export const EXP_REWARDS = {
  LOGIN: 10,
  WATCH_ANIME: 25,
  WATCH_MOVIE: 25,
  READ_CHAPTER: 15,
  FORUM_POST: 10,
  FORUM_COMMENT: 5,
} as const;

const FORUM_DAILY_EXP_KEY = 'IGNORE_DEFAULT_DB_forumDailyExp';
const DAILY_MAX_POST_EXP = 4; // max 40 EXP/day from creating posts
const DAILY_MAX_COMMENT_EXP = 10; // max 50 EXP/day from comments

interface DailyForumExpLedger {
  date: string;
  posts: number;
  comments: number;
}

function getLocalDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function awardForumExpWithCap(
  kind: 'post' | 'comment',
  addExpFn: (amount: number) => Promise<void>,
): Promise<number> {
  try {
    const today = getLocalDateKey();
    const raw = await DatabaseManager.get(FORUM_DAILY_EXP_KEY);
    let ledger: DailyForumExpLedger = { date: today, posts: 0, comments: 0 };
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today) {
        ledger = {
          date: today,
          posts: Number(parsed.posts) || 0,
          comments: Number(parsed.comments) || 0,
        };
      }
    }

    if (kind === 'post') {
      if (ledger.posts >= DAILY_MAX_POST_EXP) return 0;
      ledger.posts += 1;
      await DatabaseManager.setSilent(FORUM_DAILY_EXP_KEY, JSON.stringify(ledger));
      await addExpFn(EXP_REWARDS.FORUM_POST);
      return EXP_REWARDS.FORUM_POST;
    }

    if (ledger.comments >= DAILY_MAX_COMMENT_EXP) return 0;
    ledger.comments += 1;
    await DatabaseManager.setSilent(FORUM_DAILY_EXP_KEY, JSON.stringify(ledger));
    await addExpFn(EXP_REWARDS.FORUM_COMMENT);
    return EXP_REWARDS.FORUM_COMMENT;
  } catch {
    return 0;
  }
}

const LEVEL_COLORS: [number, string][] = [
  [500, '#E0E0E0'], // Platinum
  [300, '#FFD700'], // Gold
  [150, '#FF7043'], // Deep Orange
  [100, '#EC407A'], // Pink
  [75,  '#AB47BC'], // Purple
  [50,  '#5C6BC0'], // Indigo
  [30,  '#29B6F6'], // Light Blue
  [20,  '#26A69A'], // Teal
  [10,  '#66BB6A'], // Green
  [0,   '#78909C'], // Blue Gray (default)
];

export function getLevelColor(level: number): string {
  for (const [threshold, color] of LEVEL_COLORS) {
    if (level >= threshold) return color;
  }
  return '#78909C';
}

export function getLevelBgColor(level: number): string {
  return getLevelColor(level) + '20';
}

export function getLevelLabel(level: number): string {
  if (level >= 500) return 'Platinum';
  if (level >= 300) return 'Gold';
  if (level >= 150) return 'Fire';
  if (level >= 100) return 'Pink';
  if (level >= 75) return 'Purple';
  if (level >= 50) return 'Indigo';
  if (level >= 30) return 'Sky';
  if (level >= 20) return 'Teal';
  if (level >= 10) return 'Green';
  return 'Gray';
}

export function getExpForLevel(level: number): number {
  return 100 + level * 20;
}

export function getTotalExpForLevel(targetLevel: number): number {
  let total = 0;
  for (let i = 1; i < targetLevel; i++) {
    total += getExpForLevel(i);
  }
  return total;
}

export function getLevelFromExp(totalExp: number): {
  level: number;
  currentExp: number;
  expNeeded: number;
  progress: number;
} {
  let level = 1;
  let remainingExp = totalExp;

  while (level < MAX_LEVEL) {
    const needed = getExpForLevel(level);
    if (remainingExp < needed) break;
    remainingExp -= needed;
    level++;
  }

  const expNeeded = getExpForLevel(level);
  const progress = level >= MAX_LEVEL ? 1 : Math.min(remainingExp / expNeeded, 1);

  return {
    level: Math.min(level, MAX_LEVEL),
    currentExp: level >= MAX_LEVEL ? expNeeded : remainingExp,
    expNeeded,
    progress,
  };
}

export function formatExp(exp: number): string {
  return exp.toLocaleString(getCurrentLanguage() === 'en' ? 'en-US' : 'id-ID');
}
