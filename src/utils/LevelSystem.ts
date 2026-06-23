// Level & Rank System for NaoFlix

export type RankTier = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export const MAX_LEVEL = 999;

/** EXP reward amounts */
export const EXP_REWARDS = {
  LOGIN: 10,
  WATCH_ANIME: 25,
  WATCH_MOVIE: 25,
  READ_CHAPTER: 15,
} as const;

/** Get rank based on level */
export function getRank(level: number): RankTier {
  if (level >= 750) return 'Legendary';
  if (level >= 500) return 'Epic';
  if (level >= 300) return 'Rare';
  if (level >= 100) return 'Uncommon';
  return 'Common';
}

/** Get color for each rank — using distinct colors for visual appeal */
export function getRankColor(rank: RankTier): string {
  switch (rank) {
    case 'Common':
      return '#9E9E9E'; // Gray
    case 'Uncommon':
      return '#4CAF50'; // Green
    case 'Rare':
      return '#2196F3'; // Blue
    case 'Epic':
      return '#9C27B0'; // Purple
    case 'Legendary':
      return '#FFD700'; // Gold
  }
}

/** Get a subtle background tint for the rank badge */
export function getRankBgColor(rank: RankTier): string {
  switch (rank) {
    case 'Common':
      return '#9E9E9E20';
    case 'Uncommon':
      return '#4CAF5020';
    case 'Rare':
      return '#2196F320';
    case 'Epic':
      return '#9C27B020';
    case 'Legendary':
      return '#FFD70020';
  }
}

/** EXP required to go from a given level to the next */
export function getExpForLevel(level: number): number {
  return 100 + level * 20;
}

/** Calculate total EXP needed to reach a certain level from level 1 */
export function getTotalExpForLevel(targetLevel: number): number {
  // Sum of getExpForLevel(1) + getExpForLevel(2) + ... + getExpForLevel(targetLevel - 1)
  let total = 0;
  for (let i = 1; i < targetLevel; i++) {
    total += getExpForLevel(i);
  }
  return total;
}

/** From total EXP, calculate current level, current exp within that level, needed exp, and progress */
export function getLevelFromExp(totalExp: number): {
  level: number;
  currentExp: number;
  expNeeded: number;
  progress: number;
  rank: RankTier;
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
    rank: getRank(level),
  };
}

/** Format EXP number with commas */
export function formatExp(exp: number): string {
  return exp.toLocaleString('id-ID');
}
