import type { Block } from './types';

export const QUESTIONS_PER_DAY = 5;
export const MAX_POINTS = 100;
export const MAX_TOTAL = QUESTIONS_PER_DAY * MAX_POINTS;
export const HISTOGRAM_BINS = 10;

/**
 * Answers may have one decimal place but the slider moves in whole numbers,
 * so a guess counts as a bullseye when it is the closest whole number to the
 * answer (off by 0.5 or less). A bullseye always scores 100.
 */
export const BULLSEYE_TOLERANCE = 0.5;

/** |guess − answer|, rounded to 1 dp to strip float noise (e.g. 0.30000000000000004). */
export function offBy(guess: number, answer: number): number {
  return Math.round(Math.abs(guess - answer) * 10) / 10;
}

export function isBullseye(guess: number, answer: number): boolean {
  return offBy(guess, answer) <= BULLSEYE_TOLERANCE;
}

/** points = max(0, 100 − 4 × |guess − answer|), rounded; 100 for a bullseye. */
export function scoreGuess(guess: number, answer: number): number {
  if (isBullseye(guess, answer)) return MAX_POINTS;
  return Math.max(0, Math.round(MAX_POINTS - 4 * offBy(guess, answer)));
}

/** Share-grid colour: 🟩 off by ≤3, 🟨 ≤10, 🟧 ≤20, 🟥 >20. */
export function blockFor(off: number): Block {
  if (off <= 3) return 'green';
  if (off <= 10) return 'yellow';
  if (off <= 20) return 'orange';
  return 'red';
}

/** Histogram bin for a guess: 0–9 → 0, 10–19 → 1, … 90–100 → 9. */
export function binFor(value: number): number {
  return Math.min(HISTOGRAM_BINS - 1, Math.max(0, Math.floor(value / 10)));
}

export function binLabel(bin: number): string {
  return `${bin * 10}–${bin * 10 + 10}%`;
}

/** Index of the most common bin (lowest wins a tie), or −1 if empty. */
export function modeBin(histogram: number[]): number {
  let best = -1;
  let bestCount = 0;
  histogram.forEach((count, i) => {
    if (count > bestCount) {
      best = i;
      bestCount = count;
    }
  });
  return best;
}

/**
 * "You beat X% of today's players": the share of *other* finishers whose total
 * is strictly lower than yours. Returns null below the minimum player count.
 */
export function percentileBeaten(
  myTotal: number,
  allTotals: number[],
  minPlayers: number,
): number | null {
  const below = allTotals.filter((t) => t < myTotal).length;
  return percentileFromCounts(below, allTotals.length, minPlayers);
}

/** Same as percentileBeaten, from counts (as the database returns them). */
export function percentileFromCounts(below: number, players: number, minPlayers: number): number | null {
  if (players < Math.max(2, minPlayers)) return null;
  return Math.round((below / (players - 1)) * 100);
}

export type Verdict = 'Bullseye' | 'Close call' | 'Not bad' | 'Way off';

/** Verdict pill on the reveal. Uses the same thresholds as the blocks. */
export function verdictFor(guess: number, answer: number): Verdict {
  if (isBullseye(guess, answer)) return 'Bullseye';
  const off = offBy(guess, answer);
  if (off <= 3) return 'Close call';
  if (off <= 20) return 'Not bad';
  return 'Way off';
}

/** "+6 too high" / "−4 too low" / "Spot on" from an average signed error. */
export function formatBias(avgSignedError: number): string {
  const n = Math.round(avgSignedError);
  if (n === 0) return 'Spot on';
  return n > 0 ? `+${n} too high` : `\u2212${-n} too low`;
}

/** "18 too high" / "4.5 too low" / "Spot on" — which way the guess missed. */
export function missLabel(guess: number, answer: number): { direction: 'high' | 'low' | 'exact'; text: string } {
  if (isBullseye(guess, answer)) return { direction: 'exact', text: 'Spot on' };
  const off = offBy(guess, answer);
  const n = Number.isInteger(off) ? String(off) : off.toFixed(1);
  return guess > answer ? { direction: 'high', text: `${n} too high` } : { direction: 'low', text: `${n} too low` };
}
