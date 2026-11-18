import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { loadConfig } from '../server/config';
import { ContentStore } from '../server/content';
import { Store } from '../server/db';
import { makeDay } from './fixtures';

const DAY = '2026-12-01';
const ANSWERS = ['kerry', 'cork', 'mayo', 'meath', 'antrim'];
let clock: Date;
let app: ReturnType<typeof createApp>;

function setup(env: Record<string, string> = {}) {
  const config = loadConfig({ LAUNCH_DATE: DAY, PERCENTILE_MIN_PLAYERS: '2', RATE_LIMIT_PER_MINUTE: '10000', ...env });
  const content = ContentStore.fromRounds(
    [...makeDay(DAY, ANSWERS), ...makeDay('2026-12-02', ANSWERS), ...makeDay('2026-12-03', ANSWERS, 'draft')],
    'ie',
    config.allowDrafts,
  );
  app = createApp({ config, store: new Store(':memory:'), content, now: () => clock });
}
const today = async (p: string) => (await app.request('/api/today', { headers: { 'X-Player-Id': p } })).json();
const guess = (p: string, round: number | string, place: string, headers: Record<string, string> = {}) =>
  app.request('/api/guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ player_id: p, round_id: typeof round === 'number' ? `${DAY}-${round}` : round, place }),
  });
const g = async (p: string, round: number, place: string) => (await guess(p, round, place)).json();

/** Solve round `n` on clue `at` (1–4), or miss it (0). */
async function play(p: string, n: number, at: number) {
  const wrong = ['dublin', 'wexford', 'sligo', 'tyrone'];
  let last: any;
  for (let i = 1; i <= (at === 0 ? 4 : at - 1); i++) last = await g(p, n, wrong[i - 1]);
  if (at !== 0) last = await g(p, n, ANSWERS[n - 1]);
  return last;
}

beforeEach(() => {
  clock = new Date('2026-12-01T12:00:00Z');
  setup();
});

describe('GET /api/today', () => {
  it('shows only the first clue and never the answer or later clues', async () => {
    const body = await today(randomUUID());
    expect(body.puzzle).toBe(1);
    expect(body.set).toBe('ie-counties');
    expect(body.rounds).toHaveLength(5);
    expect(body.rounds[0]).toEqual({ id: `${DAY}-1`, order: 1, category: 'Test', clues: ['Hard clue 1.'], wrong: [], done: false, reveal: null });
    const raw = JSON.stringify(body.rounds);
    expect(raw).not.toMatch(/kerry|Medium clue|Easier clue|Easy clue/i);
  });
  it('does not serve drafts unless ALLOW_DRAFTS=1, nor anything before launch', async () => {
    clock = new Date('2026-12-03T12:00:00Z');
    expect((await today(randomUUID())).rounds).toHaveLength(0);
    setup({ ALLOW_DRAFTS: '1' });
    expect((await today(randomUUID())).rounds).toHaveLength(5);
    setup({ LAUNCH_DATE: '2026-12-05' });
    expect((await today(randomUUID())).rounds).toHaveLength(0);
  });
});

describe('POST /api/guess — the clue ladder', () => {
  it('a wrong guess reveals exactly one more clue', async () => {
    const p = randomUUID();
    let r = await g(p, 1, 'cork');
    expect(r.correct).toBe(false);
    expect(r.round).toMatchObject({ clues: ['Hard clue 1.', 'Medium clue 1.'], wrong: ['cork'], done: false, reveal: null });
    r = await g(p, 1, 'clare');
    expect(r.round.clues).toHaveLength(3);
    expect(r.round.clues[2]).toBe('Easier clue 1.');
  });

  it('solving on clue 2 scores 60 and reveals everything', async () => {
    const p = randomUUID();
    await g(p, 1, 'cork');
    const r = await g(p, 1, 'kerry');
    expect(r.correct).toBe(true);
    expect(r.round.done).toBe(true);
    expect(r.round.reveal).toMatchObject({ answer: 'kerry', answerName: 'Kerry', solvedAt: 2, points: 60, block: 'yellow', fact: 'Test fact.' });
    expect(r.round.reveal.ladder).toHaveLength(4);
    expect(r.round.reveal.crowd).toMatchObject({ dist: [0, 1, 0, 0, 0], players: 1, topWrong: [{ place: 'cork', name: 'Cork', n: 1 }] });
  });

  it('four wrong guesses end the round as a miss', async () => {
    const r = await play(randomUUID(), 1, 0);
    expect(r.round.reveal).toMatchObject({ solvedAt: 0, points: 0, block: 'red', answer: 'kerry' });
  });

  it('a finished round cannot be replayed', async () => {
    const p = randomUUID();
    await g(p, 1, 'kerry');
    const again = await g(p, 1, 'cork');
    expect(again).toMatchObject({ alreadyDone: true, correct: true, round: { reveal: { solvedAt: 1, points: 100 } } });
  });

  it('completion: total, percentile and gap of the day across two players', async () => {
    const a = randomUUID();
    const b = randomUUID();
    let last: any;
    for (const [n, at] of [[1, 1], [2, 2], [3, 3], [4, 4], [5, 0]] as const) last = await play(a, n, at);
    expect(last.completion).toMatchObject({ total: 200, players: 1, percentile: null }); // 100+60+30+10+0
    for (let n = 1; n <= 5; n++) last = await play(b, n, n === 5 ? 0 : 1);
    expect(last.completion).toMatchObject({ total: 400, players: 2, percentile: 100 });
    expect(last.completion.gapOfDay).toMatchObject({ order: 5, missedPct: 100 });
    const ra = await today(a);
    expect(ra.completion).toMatchObject({ total: 200, percentile: 0 });
    expect(ra.rounds.every((r: any) => r.done)).toBe(true);
    // b beat a on round 2 (clue 1 vs clue 2).
    expect((await today(b)).rounds[1].reveal.beat).toBe(100);
  });

  it('resumes: today returns revealed clues and wrong guesses so far', async () => {
    const p = randomUUID();
    await g(p, 3, 'galway');
    const body = await today(p);
    expect(body.rounds[2]).toMatchObject({ clues: ['Hard clue 3.', 'Medium clue 3.'], wrong: ['galway'], done: false });
  });

  it('validates input', async () => {
    expect((await guess('nope', 1, 'kerry')).status).toBe(400);
    expect((await guess(randomUUID(), 1, 'atlantis')).status).toBe(400);
    expect((await guess(randomUUID(), 'no-such-round', 'kerry')).status).toBe(404);
    expect((await guess(randomUUID(), '2026-12-02-1', 'kerry')).status).toBe(409); // tomorrow's
    expect((await app.request('/api/guess', { method: 'POST', body: 'garbage' })).status).toBe(400);
  });

  it('accepts yesterday’s rounds for the grace period after midnight', async () => {
    clock = new Date('2026-12-02T00:20:00Z');
    expect((await guess(randomUUID(), 1, 'kerry')).status).toBe(200);
    clock = new Date('2026-12-02T01:01:00Z');
    expect((await guess(randomUUID(), 1, 'kerry')).status).toBe(409);
  });

  it('rate-limits POSTs per CF-Connecting-IP', async () => {
    setup({ RATE_LIMIT_PER_MINUTE: '3' });
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await guess(randomUUID(), 1, 'kerry', { 'CF-Connecting-IP': '1.2.3.4' })).status);
    expect(codes).toEqual([200, 200, 200, 429]);
  });
});

describe('health and headers', () => {
  it('reports ok', async () => {
    expect(await (await app.request('/api/health')).json()).toMatchObject({ ok: true, roundsToday: 5 });
  });
  it('uses a strict CSP with a fresh style nonce', async () => {
    const a = (await app.request('/api/health')).headers.get('content-security-policy')!;
    const b = (await app.request('/api/health')).headers.get('content-security-policy')!;
    expect(a).toMatch(/script-src 'self';/);
    expect(a).toMatch(/style-src 'self' 'nonce-/);
    expect(a).not.toMatch(/unsafe-inline/);
    expect(a).not.toBe(b);
  });
});
