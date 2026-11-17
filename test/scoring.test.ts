import { describe, expect, it } from 'vitest';
import {
  binFor, binLabel, blockFor, isBullseye, modeBin, offBy, percentileBeaten, percentileFromCounts, scoreGuess,
} from '../shared/scoring';

describe('scoreGuess', () => {
  it('exact hit scores 100 and is a bullseye', () => {
    expect(scoreGuess(42, 42)).toBe(100);
    expect(isBullseye(42, 42)).toBe(true);
  });
  it('loses 4 points per point off', () => {
    expect(scoreGuess(40, 42)).toBe(92);
    expect(scoreGuess(52, 42)).toBe(60);
    expect(scoreGuess(0, 24)).toBe(4);
  });
  it('never goes below zero', () => {
    expect(scoreGuess(0, 25)).toBe(0);
    expect(scoreGuess(100, 0)).toBe(0);
    expect(scoreGuess(90, 3)).toBe(0);
  });
  it('rounds for decimal answers', () => {
    expect(scoreGuess(10, 12.3)).toBe(91); // 100 − 9.2 = 90.8
    expect(scoreGuess(10, 11.4)).toBe(94); // 100 − 5.6 = 94.4
    expect(scoreGuess(13, 12.7)).toBe(100); // within 0.5 → bullseye
  });
  it('treats the nearest whole number to a decimal answer as a bullseye', () => {
    expect(isBullseye(9, 9.4)).toBe(true);
    expect(isBullseye(10, 9.5)).toBe(true);
    expect(isBullseye(9, 9.6)).toBe(false);
    expect(scoreGuess(9, 9.6)).toBe(98);
  });
  it('strips float noise from offBy', () => {
    expect(offBy(10, 10.3)).toBe(0.3);
    expect(offBy(57, 42)).toBe(15);
  });
});

describe('blocks', () => {
  it.each([
    [0, 'green'], [3, 'green'], [3.1, 'yellow'], [10, 'yellow'], [10.5, 'orange'], [20, 'orange'], [20.1, 'red'], [100, 'red'],
  ] as const)('off by %s → %s', (off, block) => expect(blockFor(off)).toBe(block));
});

describe('histogram bins', () => {
  it('maps guesses to 10 bins with 100 in the top bin', () => {
    expect([0, 9, 10, 35, 89, 90, 99, 100].map(binFor)).toEqual([0, 0, 1, 3, 8, 9, 9, 9]);
    expect(binLabel(3)).toBe('30–40%');
  });
  it('finds the most common bin, lowest on a tie', () => {
    expect(modeBin([0, 2, 0, 5, 5, 0, 0, 0, 0, 0])).toBe(3);
    expect(modeBin(new Array(10).fill(0))).toBe(-1);
  });
});

describe('percentile', () => {
  const totals = Array.from({ length: 21 }, (_, i) => i * 10); // 0..200
  it('is hidden below the minimum player count', () => {
    expect(percentileBeaten(100, totals.slice(0, 19), 20)).toBeNull();
    expect(percentileBeaten(100, totals.slice(0, 20), 20)).not.toBeNull();
  });
  it('counts other players strictly below you', () => {
    expect(percentileBeaten(200, totals, 20)).toBe(100);
    expect(percentileBeaten(0, totals, 20)).toBe(0);
    expect(percentileBeaten(100, totals, 20)).toBe(50);
  });
  it('ties do not count as beaten', () => {
    expect(percentileBeaten(300, new Array(20).fill(300), 20)).toBe(0);
  });
  it('never shows for a lone player even with min 1', () => {
    expect(percentileFromCounts(0, 1, 1)).toBeNull();
  });
});

import { formatBias, verdictFor } from '../shared/scoring';

describe('verdict pill', () => {
  it.each([
    [42, 42, 'Bullseye'], [9, 9.4, 'Bullseye'], [45, 42, 'Close call'], [52, 42, 'Not bad'], [62, 42, 'Not bad'], [63, 42, 'Way off'],
  ] as const)('guess %s vs %s → %s', (g, a, v) => expect(verdictFor(g, a)).toBe(v));
});

describe('bias label', () => {
  it('formats signed averages', () => {
    expect(formatBias(5.6)).toBe('+6 too high');
    expect(formatBias(-4.2)).toBe('−4 too low');
    expect(formatBias(0.3)).toBe('Spot on');
  });
});
