
export const MAX_LEVEL = 999;

export const EXP_REWARDS = {
  LOGIN: 10,
  WATCH_ANIME: 25,
  WATCH_MOVIE: 25,
  READ_CHAPTER: 15,
} as const;

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
  return exp.toLocaleString('id-ID');
}
