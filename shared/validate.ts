import { addDays, isIsoDate } from './day';
import { QUESTIONS_PER_DAY } from './scoring';
import type { Question } from './types';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  /** Questions that passed the per-question schema checks. */
  questions: Question[];
}

export interface ValidateOptions {
  /** Today's puzzle date (YYYY-MM-DD); used for the "next N days" warning. */
  today: string;
  /** How far ahead to warn about empty dates. Default 14. */
  lookaheadDays?: number;
  /** Treat drafts as playable (ALLOW_DRAFTS=1) when counting a date's questions. */
  allowDrafts?: boolean;
}

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const STATUSES = ['draft', 'approved'];
const KNOWN_KEYS = new Set([
  'id', 'date', 'order', 'edition', 'question', 'answer', 'year', 'source_name',
  'source_url', 'nugget', 'comparisons', 'difficulty', 'status', 'category',
]);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
/** A number from 0 to 100 with at most one decimal place. */
const isPercent = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 && Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;

function isHttpUrl(v: unknown): boolean {
  if (!nonEmpty(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function checkQuestion(q: unknown, where: string, errors: string[], warnings: string[]): q is Question {
  if (!isObj(q)) {
    errors.push(`${where}: must be an object`);
    return false;
  }
  const before = errors.length;
  const err = (msg: string) => errors.push(`${where} (${String(q.id ?? '?')}): ${msg}`);

  if (!nonEmpty(q.id)) err('id must be a non-empty string');
  if (typeof q.date !== 'string' || !isIsoDate(q.date)) err('date must be a valid YYYY-MM-DD date');
  if (!Number.isInteger(q.order) || (q.order as number) < 1 || (q.order as number) > QUESTIONS_PER_DAY)
    err(`order must be an integer from 1 to ${QUESTIONS_PER_DAY}`);
  if (!nonEmpty(q.edition) || !/^[a-z]{2}$/.test(q.edition)) err('edition must be a two-letter lowercase code');
  if (!nonEmpty(q.question)) err('question must be a non-empty string');
  if (!isPercent(q.answer)) err('answer must be a number from 0 to 100 with at most 1 decimal place');
  if (!Number.isInteger(q.year) || (q.year as number) < 1900 || (q.year as number) > 2100)
    err('year must be an integer year');
  if (!nonEmpty(q.source_name)) err('source_name must be a non-empty string');
  if (!isHttpUrl(q.source_url)) err('source_url must be an http(s) URL');
  if (!nonEmpty(q.nugget)) err('nugget must be a non-empty string');
  if (!DIFFICULTIES.includes(q.difficulty as string)) err(`difficulty must be one of ${DIFFICULTIES.join('|')}`);
  if (!STATUSES.includes(q.status as string)) err(`status must be one of ${STATUSES.join('|')}`);

  if (q.category !== undefined && (!nonEmpty(q.category) || q.category.length > 24))
    err('category, if present, must be a non-empty string of at most 24 characters');
  if (q.comparisons !== undefined) {
    if (!Array.isArray(q.comparisons)) err('comparisons must be an array');
    else {
      if (q.comparisons.length > 5) err('comparisons may have at most 5 items');
      q.comparisons.forEach((c, i) => {
        if (!isObj(c) || !nonEmpty(c.label)) err(`comparisons[${i}].label must be a non-empty string`);
        if (!isObj(c) || !isPercent(c.value))
          err(`comparisons[${i}].value must be a number from 0 to 100 with at most 1 decimal place`);
      });
    }
  }
  for (const key of Object.keys(q)) {
    if (!KNOWN_KEYS.has(key)) warnings.push(`${where} (${String(q.id ?? '?')}): unknown field "${key}"`);
  }
  if (q.status === 'approved' && JSON.stringify(q).includes('PLACEHOLDER'))
    err('approved question still contains PLACEHOLDER text');
  return errors.length === before;
}

export function validateContent(data: unknown, opts: ValidateOptions): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const questions: Question[] = [];

  if (!Array.isArray(data)) {
    return { errors: ['questions.json must contain a JSON array'], warnings, questions };
  }

  const seenIds = new Map<string, number>();
  data.forEach((q, i) => {
    const where = `[${i}]`;
    if (isObj(q) && typeof q.id === 'string') {
      if (seenIds.has(q.id)) errors.push(`${where}: duplicate id "${q.id}" (first at [${seenIds.get(q.id)}])`);
      else seenIds.set(q.id, i);
    }
    if (checkQuestion(q, where, errors, warnings)) questions.push(q);
  });

  // Group playable questions by date: exactly 5, orders 1..5, one edition.
  const playable = (q: Question) => q.status === 'approved' || (opts.allowDrafts && q.status === 'draft');
  const byDate = new Map<string, Question[]>();
  for (const q of questions) {
    if (!playable(q)) continue;
    const list = byDate.get(q.date) ?? [];
    list.push(q);
    byDate.set(q.date, list);
  }
  const label = opts.allowDrafts ? 'approved or draft' : 'approved';
  for (const [date, list] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
    if (list.length !== QUESTIONS_PER_DAY) {
      errors.push(`${date}: has ${list.length} ${label} questions; needs exactly ${QUESTIONS_PER_DAY}`);
      continue;
    }
    const orders = list.map((q) => q.order).sort((a, b) => a - b).join(',');
    if (orders !== '1,2,3,4,5') errors.push(`${date}: orders must be 1–5 with no repeats (got ${orders})`);
    const editions = new Set(list.map((q) => q.edition));
    if (editions.size > 1) errors.push(`${date}: mixes editions ${[...editions].join(', ')}`);
  }

  // Dates with only drafts are worth knowing about when running strictly.
  if (!opts.allowDrafts) {
    const draftOnly = new Set(questions.filter((q) => q.status === 'draft').map((q) => q.date));
    for (const d of [...draftOnly].sort()) {
      if (!byDate.has(d)) warnings.push(`${d}: only draft questions — will not be served`);
    }
  }

  const lookahead = opts.lookaheadDays ?? 14;
  const missing: string[] = [];
  for (let i = 0; i < lookahead; i++) {
    const d = addDays(opts.today, i);
    if (!byDate.has(d)) missing.push(d);
  }
  if (missing.length) {
    warnings.push(
      `${missing.length} of the next ${lookahead} days have no ${label} questions: ${missing.join(', ')}`,
    );
  }

  return { errors, warnings, questions };
}
