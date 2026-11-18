import { placeById, type PlaceSet } from './places';
import type { Block } from './types';

export const MAX_CLUES = 4;
/** Points for solving on clue 1, 2, 3, 4. A miss scores 0. */
export const CLUE_POINTS = [100, 60, 30, 10] as const;
export const ROUND_MAX = CLUE_POINTS[0];

/**
 * The full ladder of four clues, hardest first. Rounds normally supply all
 * four by hand; if a round has fewer, the region is used to fill the gap
 * (never the first letter or name length — those give the answer away).
 */
export function buildLadder(set: PlaceSet, answerId: string, clues: string[]): string[] {
  const p = placeById(set, answerId);
  if (!p) throw new Error(`Unknown place ${answerId}`);
  const ladder = clues.slice(0, MAX_CLUES);
  if (ladder.length < MAX_CLUES) ladder.push(`It’s in ${p.region}.`);
  return ladder;
}

/** solvedAt: 1–4 = solved on that clue, 0 = missed. */
export function pointsFor(solvedAt: number): number {
  return solvedAt >= 1 && solvedAt <= MAX_CLUES ? CLUE_POINTS[solvedAt - 1] : 0;
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
