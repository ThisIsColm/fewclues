import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateContent } from '../shared/validate';
import { makeDay } from './fixtures';

const today = '2026-12-01';
const run = (data: unknown, allowDrafts = false) => validateContent(data, { today, allowDrafts });

describe('validateContent', () => {
  it('accepts a full approved day', () => {
    const r = run(makeDay(today, [1, 2, 3, 4, 5]));
    expect(r.errors).toEqual([]);
    expect(r.questions).toHaveLength(5);
  });

  it('rejects a non-array', () => {
    expect(run({}).errors[0]).toMatch(/array/);
  });

  it('requires exactly 5 approved questions per date', () => {
    expect(run(makeDay(today, [1, 2, 3, 4])).errors.join()).toMatch(/has 4 approved questions/);
    const six = [...makeDay(today, [1, 2, 3, 4, 5]), { ...makeDay(today, [6])[0], id: 'extra', order: 5 }];
    expect(run(six).errors.join()).toMatch(/has 6 approved/);
  });

  it('ignores drafts unless drafts are allowed', () => {
    const day = makeDay(today, [1, 2, 3, 4, 5]);
    day[4].status = 'draft';
    expect(run(day).errors.join()).toMatch(/has 4 approved/);
    expect(run(makeDay(today, [1, 2, 3, 4, 5], 'draft')).errors).toEqual([]);
    expect(run(day, true).errors).toEqual([]);
  });

  it('requires orders 1–5 with no repeats', () => {
    const day = makeDay(today, [1, 2, 3, 4, 5]);
    day[4].order = 4;
    expect(run(day).errors.join()).toMatch(/orders must be 1–5/);
  });

  it('flags duplicate ids', () => {
    const day = makeDay(today, [1, 2, 3, 4, 5]);
    day[1].id = day[0].id;
    expect(run(day).errors.join()).toMatch(/duplicate id/);
  });

  it('checks answers and comparison values are 0–100 with ≤1 decimal', () => {
    for (const bad of [-1, 100.1, 12.34, NaN, '50']) {
      const day = makeDay(today, [1, 2, 3, 4, 5]);
      (day[0] as any).answer = bad;
      expect(run(day).errors.join()).toMatch(/answer must be/);
    }
    const ok = makeDay(today, [0, 100, 12.5, 4, 5]);
    expect(run(ok).errors).toEqual([]);
    const day = makeDay(today, [1, 2, 3, 4, 5]);
    day[2].comparisons = [{ label: 'UK', value: 101 }];
    expect(run(day).errors.join()).toMatch(/comparisons\[0\]\.value/);
  });

  it('limits comparisons to 5', () => {
    const day = makeDay(today, [1, 2, 3, 4, 5]);
    day[0].comparisons = Array.from({ length: 6 }, (_, i) => ({ label: `C${i}`, value: i }));
    expect(run(day).errors.join()).toMatch(/at most 5/);
  });

  it('checks required fields, enums and URLs', () => {
    const day = makeDay(today, [1, 2, 3, 4, 5]) as any[];
    day[0].question = '';
    day[1].difficulty = 'impossible';
    day[2].source_url = 'javascript:alert(1)';
    day[3].date = '2026-02-30';
    day[4].status = 'live';
    const errs = run(day).errors.join('\n');
    expect(errs).toMatch(/question must be/);
    expect(errs).toMatch(/difficulty must be/);
    expect(errs).toMatch(/source_url must be/);
    expect(errs).toMatch(/date must be/);
    expect(errs).toMatch(/status must be/);
  });

  it('refuses approved questions that still say PLACEHOLDER', () => {
    const day = makeDay(today, [1, 2, 3, 4, 5]);
    day[0].nugget = 'PLACEHOLDER text';
    expect(run(day).errors.join()).toMatch(/PLACEHOLDER/);
  });

  it('warns about empty dates in the next 14 days', () => {
    const r = run(makeDay(today, [1, 2, 3, 4, 5]));
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toMatch(/13 of the next 14 days/);
    expect(r.warnings.join()).toContain('2026-12-14');
    expect(r.warnings.join()).not.toContain('2026-12-15');
  });

  it('the shipped content is valid, sourced, and playable with drafts allowed', () => {
    const seed = JSON.parse(readFileSync(new URL('../content/questions.json', import.meta.url), 'utf8'));
    expect(seed).toHaveLength(15);
    expect(seed.some((q: any) => JSON.stringify(q).includes('PLACEHOLDER'))).toBe(false);
    expect(seed.every((q: any) => /^https:\/\//.test(q.source_url))).toBe(true);
    expect(run(seed).errors).toEqual([]);
    expect(run(seed, true).errors).toEqual([]);
  });
});
