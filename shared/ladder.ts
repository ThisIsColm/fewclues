import { placeById, type PlaceSet } from './places';
import type { Block, Difficulty } from './types';

export const MAX_CLUES = 4;
export const DAY_MAX = 1000;

/** Harder rounds are worth more. The day's five rounds always add up to 1000. */
export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = { easy: 1, medium: 1.5, hard: 2 };
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium ×1.5', hard: 'Hard ×2' };

/** Share of the round's maximum kept when solved on clue 1, 2, 3, 4. */
export const CLUE_SHARE = [1, 0.6, 0.35, 0.15] as const;

/** Speed bonus: full marks within 5 s of opening the round, easing to 75% at 90 s, then flat. */
export const SPEED_GRACE_MS = 5_000;
export const SPEED_FLOOR_MS = 90_000;
export const SPEED_FLOOR = 0.75;

/**
 * Integer maximum per round from the day's difficulties, summing to exactly
 * DAY_MAX (largest-remainder rounding, ties to the earlier round).
 */
export function roundMaxes(difficulties: Difficulty[]): number[] {
  const w = difficulties.map((d) => DIFFICULTY_WEIGHT[d]);
  const sum = w.reduce((a, b) => a + b, 0);
  const exact = w.map((x) => (x / sum) * DAY_MAX);
  const out = exact.map(Math.floor);
  let left = DAY_MAX - out.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

export function speedFactor(ms: number): number {
  if (!(ms > SPEED_GRACE_MS)) return 1;
  const t = Math.min(1, (ms - SPEED_GRACE_MS) / (SPEED_FLOOR_MS - SPEED_GRACE_MS));
  return 1 - (1 - SPEED_FLOOR) * t;
}

/** Points for a round. solvedAt 1–4 (0 = missed); ms = time from opening the round to the right answer. */
export function roundPoints(max: number, solvedAt: number, ms: number): number {
  if (!(solvedAt >= 1 && solvedAt <= MAX_CLUES)) return 0;
  return Math.round(max * CLUE_SHARE[solvedAt - 1] * speedFactor(ms));
}

/** What the round is worth right now, while the player is still thinking (for the live "worth" label). */
export function worthNow(max: number, cluesShown: number, elapsedMs: number): number {
  return roundPoints(max, Math.max(1, Math.min(MAX_CLUES, cluesShown)), elapsedMs);
}

/**
 * The full ladder of four clues, hardest first. Rounds normally supply all
 * four by hand; if a round has fewer, the region is used to fill the gap.
 */
export function buildLadder(set: PlaceSet, answerId: string, clues: string[]): string[] {
  const p = placeById(set, answerId);
  if (!p) throw new Error(`Unknown place ${answerId}`);
  const ladder = clues.slice(0, MAX_CLUES);
  if (ladder.length < MAX_CLUES) ladder.push(`It’s in ${p.region}.`);
  return ladder;
}

/** Share blocks: 🟩 first clue, 🟨 second, 🟧 third or fourth, 🟥 missed. */
export function blockForSolve(solvedAt: number): Block {
  if (solvedAt === 1) return 'green';
  if (solvedAt === 2) return 'yellow';
  if (solvedAt === 3 || solvedAt === 4) return 'orange';
  return 'red';
}

export function verdictForSolve(solvedAt: number): string {
  return ['Missed it', 'First clue!', 'Second clue', 'Third clue', 'Last clue'][solvedAt] ?? 'Missed it';
}
