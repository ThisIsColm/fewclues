import { placeById, type PlaceSet } from './places';
import type { Block } from './types';

export const MAX_CLUES = 4;
/** Points for solving on clue 1, 2, 3, 4. A miss scores 0. */
export const CLUE_POINTS = [100, 60, 30, 10] as const;
export const ROUND_MAX = CLUE_POINTS[0];

/** The full ladder: the round's own clues (1–2), then automatic ones, to four. */
export function buildLadder(set: PlaceSet, answerId: string, clues: string[]): string[] {
  const p = placeById(set, answerId);
  if (!p) throw new Error(`Unknown place ${answerId}`);
  const auto = [
    `It’s in ${p.region}.`,
    `It begins with ${p.name[0].toUpperCase()}.`,
    `Its name has ${p.name.length} letters.`,
  ];
  return [...clues, ...auto].slice(0, MAX_CLUES);
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
