import { addDays, isIsoDate } from './day';
import { normalise, PLACE_SETS, placeById } from './places';
import type { Round } from './types';

export const ROUNDS_PER_DAY = 5;

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  rounds: Round[];
}

export interface ValidateOptions {
  today: string;
  lookaheadDays?: number;
  allowDrafts?: boolean;
}

const KNOWN = new Set(['id', 'date', 'order', 'edition', 'set', 'answer', 'category', 'clues', 'fact', 'source_name', 'source_url', 'difficulty', 'status']);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
function isHttpUrl(v: unknown) {
  if (!nonEmpty(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function check(r: unknown, where: string, errors: string[], warnings: string[]): r is Round {
  if (!isObj(r)) {
    errors.push(`${where}: must be an object`);
    return false;
  }
  const before = errors.length;
  const err = (m: string) => errors.push(`${where} (${String(r.id ?? '?')}): ${m}`);
  if (!nonEmpty(r.id)) err('id must be a non-empty string');
  if (typeof r.date !== 'string' || !isIsoDate(r.date)) err('date must be a valid YYYY-MM-DD date');
  if (!Number.isInteger(r.order) || (r.order as number) < 1 || (r.order as number) > ROUNDS_PER_DAY) err(`order must be 1–${ROUNDS_PER_DAY}`);
  if (!nonEmpty(r.edition) || !/^[a-z]{2}$/.test(r.edition)) err('edition must be a two-letter lowercase code');
  const set = typeof r.set === 'string' ? PLACE_SETS[r.set] : undefined;
  if (!set) err(`set must be one of ${Object.keys(PLACE_SETS).join(', ')}`);
  const place = set && typeof r.answer === 'string' ? placeById(set, r.answer) : undefined;
  if (set && !place) err(`answer "${String(r.answer)}" is not a place in ${set.id}`);
  if (!Array.isArray(r.clues) || r.clues.length !== 4 || !r.clues.every((c) => nonEmpty(c) && c.length <= 160))
    err('clues must be exactly 4 non-empty strings (hardest first) of at most 160 characters');
  else if (place) {
    // A clue that names the answer gives the game away.
    const names = [place.name, ...(place.aliases ?? [])].map(normalise);
    r.clues.forEach((c, i) => {
      const words = ` ${normalise(c)} `;
      if (names.some((n) => words.includes(` ${n} `))) err(`clue ${i + 1} names the answer`);
    });
  }
  if (!nonEmpty(r.fact)) err('fact must be a non-empty string');
  if (!nonEmpty(r.source_name)) err('source_name must be a non-empty string');
  if (!isHttpUrl(r.source_url)) err('source_url must be an http(s) URL');
  if (r.category !== undefined && (!nonEmpty(r.category) || r.category.length > 24)) err('category must be 1–24 characters');
  if (!['easy', 'medium', 'hard'].includes(r.difficulty as string)) err('difficulty must be easy|medium|hard');
  if (!['draft', 'approved'].includes(r.status as string)) err('status must be draft|approved');
  if (r.status === 'approved' && JSON.stringify(r).includes('PLACEHOLDER')) err('approved round still contains PLACEHOLDER text');
  for (const k of Object.keys(r)) if (!KNOWN.has(k)) warnings.push(`${where} (${String(r.id ?? '?')}): unknown field "${k}"`);
  return errors.length === before;
}

export function validateContent(data: unknown, opts: ValidateOptions): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rounds: Round[] = [];
  if (!Array.isArray(data)) return { errors: ['rounds.json must contain a JSON array'], warnings, rounds };
  const seen = new Map<string, number>();
  data.forEach((r, i) => {
    if (isObj(r) && typeof r.id === 'string') {
      if (seen.has(r.id)) errors.push(`[${i}]: duplicate id "${r.id}" (first at [${seen.get(r.id)}])`);
      else seen.set(r.id, i);
    }
    if (check(r, `[${i}]`, errors, warnings)) rounds.push(r);
  });

  const playable = (r: Round) => r.status === 'approved' || (opts.allowDrafts && r.status === 'draft');
  const byDate = new Map<string, Round[]>();
  for (const r of rounds) if (playable(r)) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  const label = opts.allowDrafts ? 'approved or draft' : 'approved';
  for (const [date, list] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
    if (list.length !== ROUNDS_PER_DAY) {
      errors.push(`${date}: has ${list.length} ${label} rounds; needs exactly ${ROUNDS_PER_DAY}`);
      continue;
    }
    const orders = list.map((r) => r.order).sort((a, b) => a - b).join(',');
    if (orders !== '1,2,3,4,5') errors.push(`${date}: orders must be 1–5 with no repeats (got ${orders})`);
    const answers = new Set(list.map((r) => r.answer));
    if (answers.size !== list.length) errors.push(`${date}: the same answer appears twice`);
  }
  if (!opts.allowDrafts)
    for (const d of [...new Set(rounds.filter((r) => r.status === 'draft').map((r) => r.date))].sort())
      if (!byDate.has(d)) warnings.push(`${d}: only draft rounds — will not be served`);
  const lookahead = opts.lookaheadDays ?? 14;
  const missing: string[] = [];
  for (let i = 0; i < lookahead; i++) if (!byDate.has(addDays(opts.today, i))) missing.push(addDays(opts.today, i));
  if (missing.length) warnings.push(`${missing.length} of the next ${lookahead} days have no ${label} rounds: ${missing.join(', ')}`);
  return { errors, warnings, rounds };
}
