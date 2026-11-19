import { describe, expect, it } from 'vitest';
import { shareText } from '../shared/share';
import { streaks } from '../shared/streak';

describe('shareText', () => {
  it('matches the spec format exactly', () => {
    expect(
      shareText({ puzzle: 12, flag: '🇮🇪', total: 734, blocks: ['green', 'green', 'yellow', 'red', 'green'], siteHost: 'fewclues.app' }),
    ).toBe('Few Clues #12 🇮🇪 734/1000\n🟩🟩🟨🟥🟩\nfewclues.app');
  });
  it('uses all four block colours', () => {
    const t = shareText({ puzzle: 1, flag: '🇮🇪', total: 0, blocks: ['green', 'yellow', 'orange', 'red', 'red'], siteHost: 'x.ie' });
    expect(t.split('\n')[1]).toBe('🟩🟨🟧🟥🟥');
  });
  it('contains nothing but the header, blocks and host', () => {
    const t = shareText({ puzzle: 3, flag: '🇮🇪', total: 250, blocks: ['red', 'red', 'red', 'red', 'red'], siteHost: 'fewclues.app' });
    expect(t.split('\n')).toHaveLength(3);
    expect(t).not.toMatch(/%/);
  });
});

describe('streaks', () => {
  it('counts back from today', () => {
    expect(streaks(['2026-12-01', '2026-12-02', '2026-12-03'], '2026-12-03')).toEqual({ current: 3, max: 3 });
  });
  it('keeps yesterday’s streak alive before today is played', () => {
    expect(streaks(['2026-12-01', '2026-12-02'], '2026-12-03')).toEqual({ current: 2, max: 2 });
  });
  it('breaks after a missed day and tracks the max', () => {
    expect(streaks(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-12-02', '2026-12-03'], '2026-12-05')).toEqual({ current: 0, max: 4 });
  });
  it('handles no games', () => {
    expect(streaks([], '2026-12-05')).toEqual({ current: 0, max: 0 });
  });
});
