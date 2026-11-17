import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, dublinDate, formatLongDate, isIsoDate, nextRollover, puzzleNumber, startOfDublinDay } from '../shared/day';

const at = (iso: string) => new Date(iso);

describe('dublinDate — winter (GMT, UTC+0)', () => {
  it('rolls over at 00:00 UTC', () => {
    expect(dublinDate(at('2026-12-01T23:59:59.999Z'))).toBe('2026-12-01');
    expect(dublinDate(at('2026-12-02T00:00:00.000Z'))).toBe('2026-12-02');
  });
});

describe('dublinDate — summer (IST, UTC+1)', () => {
  it('rolls over at 23:00 UTC', () => {
    expect(dublinDate(at('2026-07-01T22:59:59.999Z'))).toBe('2026-07-01');
    expect(dublinDate(at('2026-07-01T23:00:00.000Z'))).toBe('2026-07-02');
  });
});

describe('DST starts: Sunday 29 March 2026 (clocks go 01:00 → 02:00)', () => {
  it('the 29th begins at 00:00 GMT and ends at 00:00 IST (a 23-hour day)', () => {
    expect(startOfDublinDay('2026-03-29').toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(startOfDublinDay('2026-03-30').toISOString()).toBe('2026-03-29T23:00:00.000Z');
  });
  it('dates either side of the jump are right', () => {
    expect(dublinDate(at('2026-03-28T23:59:59Z'))).toBe('2026-03-28');
    expect(dublinDate(at('2026-03-29T00:30:00Z'))).toBe('2026-03-29');
    expect(dublinDate(at('2026-03-29T01:30:00Z'))).toBe('2026-03-29'); // 02:30 IST
    expect(dublinDate(at('2026-03-29T22:59:59Z'))).toBe('2026-03-29');
    expect(dublinDate(at('2026-03-29T23:00:00Z'))).toBe('2026-03-30');
  });
  it('the next rollover from mid-day on the 29th is 23:00 UTC', () => {
    expect(nextRollover(at('2026-03-29T12:00:00Z')).toISOString()).toBe('2026-03-29T23:00:00.000Z');
    expect(nextRollover(at('2026-03-28T12:00:00Z')).toISOString()).toBe('2026-03-29T00:00:00.000Z');
  });
});

describe('DST ends: Sunday 25 October 2026 (clocks go 02:00 → 01:00)', () => {
  it('the 25th begins at 00:00 IST and ends at 00:00 GMT (a 25-hour day)', () => {
    expect(startOfDublinDay('2026-10-25').toISOString()).toBe('2026-10-24T23:00:00.000Z');
    expect(startOfDublinDay('2026-10-26').toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });
  it('the repeated 01:xx hour stays on the 25th', () => {
    expect(dublinDate(at('2026-10-24T22:59:59Z'))).toBe('2026-10-24');
    expect(dublinDate(at('2026-10-24T23:00:00Z'))).toBe('2026-10-25');
    expect(dublinDate(at('2026-10-25T00:30:00Z'))).toBe('2026-10-25'); // first 01:30
    expect(dublinDate(at('2026-10-25T01:30:00Z'))).toBe('2026-10-25'); // second 01:30
    expect(dublinDate(at('2026-10-25T23:59:59Z'))).toBe('2026-10-25');
    expect(dublinDate(at('2026-10-26T00:00:00Z'))).toBe('2026-10-26');
  });
  it('the next rollover from the 25th is midnight UTC on the 26th', () => {
    expect(nextRollover(at('2026-10-25T00:30:00Z')).toISOString()).toBe('2026-10-26T00:00:00.000Z');
    expect(nextRollover(at('2026-10-24T22:00:00Z')).toISOString()).toBe('2026-10-24T23:00:00.000Z');
  });
});

describe('puzzle numbers', () => {
  it('launch day is #1 and each day adds one', () => {
    expect(puzzleNumber('2026-12-01', '2026-12-01')).toBe(1);
    expect(puzzleNumber('2026-12-12', '2026-12-01')).toBe(12);
    expect(puzzleNumber('2027-12-01', '2026-12-01')).toBe(366);
  });
  it('do not skip or repeat across either DST change', () => {
    const launch = '2026-03-01';
    // Sample every 15 minutes through both changeovers; each puzzle number
    // must appear for one unbroken stretch, with no gaps between them.
    for (const [from, to] of [['2026-03-28T12:00Z', '2026-03-30T12:00Z'], ['2026-10-24T12:00Z', '2026-10-26T12:00Z']]) {
      const seq: number[] = [];
      for (let t = Date.parse(from); t < Date.parse(to); t += 15 * 60_000) {
        const n = puzzleNumber(dublinDate(new Date(t)), launch);
        if (seq.at(-1) !== n) seq.push(n);
      }
      expect(seq).toHaveLength(3);
      expect(seq[1] - seq[0]).toBe(1);
      expect(seq[2] - seq[1]).toBe(1);
    }
    expect(puzzleNumber('2026-03-29', launch)).toBe(29);
  });
});

describe('date helpers', () => {
  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-10-24', '2026-10-27')).toBe(3);
  });
  it('validates ISO dates', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-1-01')).toBe(false);
  });
  it('formats a long date', () => {
    expect(formatLongDate('2026-12-01')).toMatch(/Tuesday.*1.*December.*2026/);
  });
});

import { weekStart } from '../shared/day';

describe('weekStart (leagues reset on Monday)', () => {
  it('maps every day to its Monday', () => {
    expect(weekStart('2026-11-16')).toBe('2026-11-16'); // Monday
    expect(weekStart('2026-11-17')).toBe('2026-11-16');
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // Sunday
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
  });
  it('the week rolls over at midnight Dublin time, including the DST week', () => {
    // Sunday 29 March 2026 23:30 IST = 22:30 UTC — still Sunday in Dublin.
    expect(weekStart(dublinDate(new Date('2026-03-29T22:30:00Z')))).toBe('2026-03-23');
    expect(weekStart(dublinDate(new Date('2026-03-29T23:00:00Z')))).toBe('2026-03-30');
  });
});
