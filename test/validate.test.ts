import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateContent } from '../shared/validate';
import { makeDay } from './fixtures';

const today = '2026-12-01';
const run = (data: unknown, allowDrafts = false) => validateContent(data, { today, allowDrafts });

describe('validateContent (rounds)', () => {
  it('accepts a full approved day', () => {
    expect(run(makeDay(today)).errors).toEqual([]);
  });
  it('rejects a non-array', () => {
    expect(run({}).errors[0]).toMatch(/array/);
  });
  it('requires exactly 5 rounds per date with orders 1–5', () => {
    expect(run(makeDay(today).slice(0, 4)).errors.join()).toMatch(/has 4 approved rounds/);
    const d = makeDay(today);
    d[4].order = 4;
    expect(run(d).errors.join()).toMatch(/orders must be 1–5/);
  });
  it('requires the answer to be a real place and unique within the day', () => {
    const d = makeDay(today);
    d[0].answer = 'atlantis';
    expect(run(d).errors.join()).toMatch(/not a place/);
    expect(run(makeDay(today, ['kerry', 'kerry', 'mayo', 'meath', 'cork'])).errors.join()).toMatch(/same answer appears twice/);
  });
  it('refuses a clue that names the answer', () => {
    const d = makeDay(today);
    d[0].clues = ['The Kingdom of Kerry, famously.'];
    expect(run(d).errors.join()).toMatch(/clue 1 names the answer/);
    d[0].clues = ['Kerrygold is not a clue word match.'];
    expect(run(d).errors).toEqual([]); // whole words only
  });
  it('checks clue count, fact, source and enums', () => {
    const d = makeDay(today) as any[];
    d[0].clues = [];
    d[1].clues = ['a', 'b', 'c'];
    d[2].source_url = 'javascript:alert(1)';
    d[3].fact = '';
    d[4].status = 'live';
    const e = run(d).errors.join('\n');
    expect(e).toMatch(/clues must be 1–2/);
    expect(e).toMatch(/source_url/);
    expect(e).toMatch(/fact must be/);
    expect(e).toMatch(/status must be/);
  });
  it('flags duplicate ids and ignores drafts unless allowed', () => {
    const d = makeDay(today);
    d[1].id = d[0].id;
    expect(run(d).errors.join()).toMatch(/duplicate id/);
    expect(run(makeDay(today, undefined, 'draft')).errors).toEqual([]);
    expect(run(makeDay(today, undefined, 'draft')).warnings.join()).toMatch(/only draft rounds/);
  });
  it('warns about empty dates in the next 14 days', () => {
    expect(run(makeDay(today)).warnings.join()).toMatch(/13 of the next 14 days/);
  });
  it('the shipped rounds are valid, sourced, with 15 distinct answers', () => {
    const rounds = JSON.parse(readFileSync(new URL('../content/rounds.json', import.meta.url), 'utf8'));
    expect(rounds).toHaveLength(15);
    expect(new Set(rounds.map((r: any) => r.answer)).size).toBe(15);
    expect(run(rounds, true).errors).toEqual([]);
  });
});
