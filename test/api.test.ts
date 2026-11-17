import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { loadConfig } from '../server/config';
import { ContentStore } from '../server/content';
import { Store } from '../server/db';
import { makeDay } from './fixtures';

const ANSWERS = [10, 25, 50, 75, 90];
let clock: Date;
let app: ReturnType<typeof createApp>;

function setup(env: Record<string, string> = {}) {
  const config = loadConfig({ LAUNCH_DATE: '2026-12-01', PERCENTILE_MIN_PLAYERS: '2', RATE_LIMIT_PER_MINUTE: '1000', ...env });
  const content = ContentStore.fromQuestions(
    [...makeDay('2026-12-01', ANSWERS), ...makeDay('2026-12-02', ANSWERS), ...makeDay('2026-12-03', ANSWERS, 'draft')],
    'ie',
    config.allowDrafts,
  );
  app = createApp({ config, store: new Store(':memory:'), content, now: () => clock });
}

const today = async (player: string) => (await app.request('/api/today', { headers: { 'X-Player-Id': player } })).json();
const guess = (player: string, question_id: string, g: number, headers: Record<string, string> = {}) =>
  app.request('/api/guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ player_id: player, question_id, guess: g }),
  });

beforeEach(() => {
  clock = new Date('2026-12-01T12:00:00Z');
  setup();
});

describe('GET /api/today', () => {
  it('returns question text but never answers', async () => {
    const body = await today(randomUUID());
    expect(body.puzzle).toBe(1);
    expect(body.date).toBe('2026-12-01');
    expect(body.questions).toHaveLength(5);
    expect(body.nextRolloverAt).toBe('2026-12-02T00:00:00.000Z');
    const raw = JSON.stringify(body.questions);
    expect(raw).not.toMatch(/answer|nugget|source|comparisons/);
    expect(body.reveals).toEqual([]);
  });

  it('does not serve drafts unless ALLOW_DRAFTS=1', async () => {
    clock = new Date('2026-12-03T12:00:00Z');
    expect((await today(randomUUID())).questions).toHaveLength(0);
    setup({ ALLOW_DRAFTS: '1' });
    expect((await today(randomUUID())).questions).toHaveLength(5);
  });

  it('serves nothing before launch day', async () => {
    setup({ LAUNCH_DATE: '2026-12-02' });
    const body = await today(randomUUID());
    expect(body).toMatchObject({ puzzle: 0, launchDate: '2026-12-02', questions: [] });
    expect((await guess(randomUUID(), '2026-12-01-1', 10)).status).toBe(409);
  });
});

describe('POST /api/guess', () => {
  it('scores, reveals and builds a histogram', async () => {
    const p = randomUUID();
    const res = await guess(p, '2026-12-01-1', 14);
    expect(res.status).toBe(200);
    const { reveal, completion } = await res.json();
    expect(reveal).toMatchObject({ answer: 10, guess: 14, offBy: 4, points: 84, block: 'yellow', bullseye: false, signedError: 4 });
    expect(reveal.histogram[1]).toBe(1);
    expect(reveal.histogram.reduce((a: number, b: number) => a + b)).toBe(1);
    expect(completion).toBeNull();
  });

  it('allows one guess per question per player — a replay returns the original', async () => {
    const p = randomUUID();
    await guess(p, '2026-12-01-1', 14);
    const again = await (await guess(p, '2026-12-01-1', 10)).json();
    expect(again.alreadyGuessed).toBe(true);
    expect(again.reveal.guess).toBe(14);
    expect(again.reveal.histogram.reduce((a: number, b: number) => a + b)).toBe(1);
  });

  it('two players: histograms, completion and percentile update', async () => {
    const a = randomUUID();
    const b = randomUUID();
    for (const [i, ans] of ANSWERS.entries()) await guess(a, `2026-12-01-${i + 1}`, ans); // perfect
    const last = await (await guess(a, '2026-12-01-5', 0)).json(); // replay of last one
    expect(last.completion).toMatchObject({ total: 500, players: 1, percentile: null });

    let bLast: any;
    for (let i = 0; i < 5; i++) bLast = await (await guess(b, `2026-12-01-${i + 1}`, 35)).json();
    // b: off by 25,10,15,40,55 → 0 + 60 + 40 + 0 + 0
    expect(bLast.completion).toMatchObject({ total: 100, players: 2, percentile: 0 });
    expect(bLast.reveal.histogram[9]).toBe(1); // a guessed 90
    expect(bLast.reveal.histogram[3]).toBe(1); // b guessed 35

    const aToday = await today(a);
    expect(aToday.completion).toMatchObject({ total: 500, players: 2, percentile: 100 });
    expect(aToday.reveals).toHaveLength(5);
  });

  it('hides the percentile below the minimum player count', async () => {
    setup({ PERCENTILE_MIN_PLAYERS: '20' });
    const p = randomUUID();
    let body: any;
    for (let i = 0; i < 5; i++) body = await (await guess(p, `2026-12-01-${i + 1}`, 50)).json();
    expect(body.completion.percentile).toBeNull();
  });

  it('resumes: today returns the reveals already made', async () => {
    const p = randomUUID();
    await guess(p, '2026-12-01-1', 10);
    await guess(p, '2026-12-01-2', 20);
    const body = await today(p);
    expect(body.reveals.map((r: any) => r.question_id)).toEqual(['2026-12-01-1', '2026-12-01-2']);
    expect(body.completion).toBeNull();
  });

  it("rejects guesses on another day's puzzle", async () => {
    const res = await guess(randomUUID(), '2026-12-02-1', 10);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('stale');
  });

  it('accepts yesterday’s puzzle for a grace period after midnight', async () => {
    clock = new Date('2026-12-02T00:20:00Z');
    expect((await guess(randomUUID(), '2026-12-01-1', 10)).status).toBe(200);
    clock = new Date('2026-12-02T01:01:00Z');
    expect((await guess(randomUUID(), '2026-12-01-1', 10)).status).toBe(409);
  });

  it('validates input', async () => {
    expect((await guess('not-a-uuid', '2026-12-01-1', 10)).status).toBe(400);
    expect((await guess(randomUUID(), '2026-12-01-1', 101)).status).toBe(400);
    expect((await guess(randomUUID(), '2026-12-01-1', 4.5)).status).toBe(400);
    expect((await guess(randomUUID(), 'nope', 4)).status).toBe(404);
    const res = await app.request('/api/guess', { method: 'POST', body: 'garbage' });
    expect(res.status).toBe(400);
  });

  it('rate-limits POSTs per CF-Connecting-IP', async () => {
    setup({ RATE_LIMIT_PER_MINUTE: '3' });
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await guess(randomUUID(), '2026-12-01-1', 10, { 'CF-Connecting-IP': '1.2.3.4' })).status);
    expect(codes).toEqual([200, 200, 200, 429]);
    expect((await guess(randomUUID(), '2026-12-01-1', 10, { 'CF-Connecting-IP': '5.6.7.8' })).status).toBe(200);
  });
});

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, questionsToday: 5 });
  });
});
