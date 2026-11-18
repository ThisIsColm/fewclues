import { describe, expect, it } from 'vitest';
import { blockForSolve, buildLadder, pointsFor, verdictForSolve } from '../shared/ladder';
import { IE_COUNTIES, normalise, resolve, suggest } from '../shared/places';
import { percentileBeaten, percentileFromCounts } from '../shared/scoring';

describe('clue ladder scoring', () => {
  it('scores 100 / 60 / 30 / 10 / 0', () => {
    expect([1, 2, 3, 4, 0].map(pointsFor)).toEqual([100, 60, 30, 10, 0]);
  });
  it('maps outcomes to share blocks and verdicts', () => {
    expect([1, 2, 3, 4, 0].map(blockForSolve)).toEqual(['green', 'yellow', 'orange', 'orange', 'red']);
    expect(verdictForSolve(1)).toBe('First clue!');
    expect(verdictForSolve(0)).toBe('Missed it');
  });
  it('fills the ladder to four clues with region, first letter, length', () => {
    expect(buildLadder(IE_COUNTIES, 'kerry', ['Hard clue.'])).toEqual([
      'Hard clue.',
      'It’s in Munster.',
      'It begins with K.',
      'Its name has 5 letters.',
    ]);
    expect(buildLadder(IE_COUNTIES, 'meath', ['A', 'B'])).toEqual(['A', 'B', 'It’s in Leinster.', 'It begins with M.']);
    expect(() => buildLadder(IE_COUNTIES, 'atlantis', ['x'])).toThrow();
  });
});

describe('county matching', () => {
  it('has the 32 counties in four provinces', () => {
    expect(IE_COUNTIES.places).toHaveLength(32);
    const by = (p: string) => IE_COUNTIES.places.filter((x) => x.region === p).length;
    expect([by('Leinster'), by('Munster'), by('Connacht'), by('Ulster')]).toEqual([12, 6, 5, 9]);
  });
  it('normalises case, accents, punctuation and "County"/"Co."', () => {
    expect(normalise('  Co. Kérry! ')).toBe('kerry');
    expect(normalise('County Derry')).toBe('derry');
  });
  it('resolves names, aliases and small typos', () => {
    expect(resolve(IE_COUNTIES, 'kerry')?.id).toBe('kerry');
    expect(resolve(IE_COUNTIES, 'Londonderry')?.id).toBe('derry');
    expect(resolve(IE_COUNTIES, 'Tipp')?.id).toBe('tipperary');
    expect(resolve(IE_COUNTIES, 'Fermangh')?.id).toBe('fermanagh');
    expect(resolve(IE_COUNTIES, 'Kery')?.id).toBe('kerry');
    expect(resolve(IE_COUNTIES, 'Tiperary')?.id).toBe('tipperary');
    expect(suggest(IE_COUNTIES, 'Lie').map((p) => p.name)).toContain('Leitrim'); // swapped letters
    expect(resolve(IE_COUNTIES, 'Kil')).toBeUndefined(); // Kildare or Kilkenny: ambiguous
    expect(resolve(IE_COUNTIES, 'Narnia')).toBeUndefined();
  });
  it('suggests prefix matches first', () => {
    expect(suggest(IE_COUNTIES, 'kil').map((p) => p.name)).toEqual(['Kildare', 'Kilkenny']);
    expect(suggest(IE_COUNTIES, 'w').map((p) => p.name)).toEqual(['Waterford', 'Westmeath', 'Wexford', 'Wicklow']);
    expect(suggest(IE_COUNTIES, '')).toEqual([]);
  });
});

describe('percentile', () => {
  const totals = Array.from({ length: 21 }, (_, i) => i * 10);
  it('is hidden below the minimum player count', () => {
    expect(percentileBeaten(100, totals.slice(0, 19), 20)).toBeNull();
  });
  it('counts other players strictly below you', () => {
    expect(percentileBeaten(200, totals, 20)).toBe(100);
    expect(percentileBeaten(100, totals, 20)).toBe(50);
    expect(percentileFromCounts(0, 1, 1)).toBeNull();
  });
});
