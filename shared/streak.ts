import { addDays } from './day';

/**
 * Streaks over the set of dates a player finished. The current streak counts
 * back from today — or from yesterday if today isn't finished yet, so the
 * streak doesn't look broken before you've played.
 */
export function streaks(finished: Iterable<string>, today: string): { current: number; max: number } {
  const days = new Set(finished);
  let current = 0;
  let d = days.has(today) ? today : addDays(today, -1);
  while (days.has(d)) {
    current++;
    d = addDays(d, -1);
  }
  let max = 0;
  for (const day of days) {
    if (days.has(addDays(day, -1))) continue; // not the start of a run
    let len = 0;
    let x = day;
    while (days.has(x)) {
      len++;
      x = addDays(x, 1);
    }
    max = Math.max(max, len);
  }
  return { current, max };
}
