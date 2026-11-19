/** Rounds per day and the day’s maximum score. */
export const QUESTIONS_PER_DAY = 5;
export const MAX_TOTAL = 1000;

/**
 * "You beat X% of players": the share of *other* players with a strictly
 * worse result. Returns null below the minimum player count.
 */
export function percentileBeaten(myTotal: number, allTotals: number[], minPlayers: number): number | null {
  return percentileFromCounts(allTotals.filter((t) => t < myTotal).length, allTotals.length, minPlayers);
}

/** Same, from counts (as the database returns them). */
export function percentileFromCounts(below: number, players: number, minPlayers: number): number | null {
  if (players < Math.max(2, minPlayers)) return null;
  return Math.round((below / (players - 1)) * 100);
}
