import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { loadConfig } from '../server/config';
import { ContentStore } from '../server/content';
import { Store } from '../server/db';
import type { Question } from '../shared/types';
import { makeDay } from './fixtures';

const DAY = '2026-12-01';
const polls = (): Question[] =>
  makeDay(DAY, [38, 70, 12, 55, 90]).map((q) => ({
    ...q,
    options: ['Yes', 'No'] as [string, string],
    population: 'adults in Ireland',
    pollster: 'Test Polls',
    fieldwork: 'March 2024',
    sample: 1000,
  }));

let clock: Date;
let app: ReturnType<typeof createApp>;
function setup(env: Record<string, string> = {}) {
  const config = loadConfig({ LAUNCH_DATE: DAY, RATE_LIMIT_PER_MINUTE: '10000', ROOM_MIN_VOTES: '3', SPLIT_MIN_VOTES: '2', ...env });
  app = createApp({ config, store: new Store(':memory:'), content: ContentStore.fromQuestions(polls(), 'ie', false), now: () => clock });
}
const guess = (player: string, n: number, g: number, vote?: number) =>
  app.request('/api/guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_id: player, question_id: `${DAY}-${n}`, guess: g, vote }),
  });
const today = async (p: string) => (await app.request('/api/today', { headers: { 'X-Player-Id': p } })).json();

beforeEach(() => {
  clock = new Date('2026-12-01T12:00:00Z');
  setup();
});

describe('Read the Room', () => {
  it('sends options and population, never the answer', async () => {
    const body = await today(randomUUID());
    expect(body.questions[0]).toMatchObject({ options: ['Yes', 'No'], population: 'adults in Ireland' });
    expect(JSON.stringify(body.questions)).not.toMatch(/answer|pollster|sample/);
  });

  it('requires a vote on poll questions and stores it once', async () => {
    const p = randomUUID();
    expect((await guess(p, 1, 40)).status).toBe(400);
    expect((await guess(p, 1, 40, 2)).status).toBe(400);
    const r = await (await guess(p, 1, 40, 1)).json();
    expect(r.reveal).toMatchObject({ vote: 1, answer: 38, pollster: 'Test Polls', sample: 1000, fieldwork: 'March 2024' });
    const again = await (await guess(p, 1, 10, 0)).json(); // replay can't change guess or vote
    expect(again.reveal).toMatchObject({ guess: 40, vote: 1 });
    expect((await today(p)).reveals[0].vote).toBe(1);
  });

  it('false-consensus split appears once both sides have enough voters', async () => {
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    await guess(a, 1, 60, 0);
    await guess(b, 1, 50, 0);
    let r = await (await guess(c, 1, 20, 1)).json();
    expect(r.reveal.split).toBeNull(); // only one No voter
    r = await (await guess(randomUUID(), 1, 30, 1)).json();
    expect(r.reveal.split).toEqual({ avgByVote: [55, 25], voters: [2, 2] });
  });

  it('room split is hidden until 9pm Dublin, and below the minimum vote count', async () => {
    const players = [randomUUID(), randomUUID(), randomUUID()];
    await guess(players[0], 1, 50, 0);
    await guess(players[1], 1, 50, 0);
    let room = (await today(players[0])).room;
    expect(room.revealAt).toBe('2026-12-01T21:00:00.000Z');
    expect(room.revealed).toBe(false);
    expect(room.questions[0]).toEqual({ question_id: `${DAY}-1`, order: 1, label: 'Yes', votes: 2, pct: null });

    clock = new Date('2026-12-01T21:00:00Z');
    room = (await today(players[0])).room;
    expect(room.revealed).toBe(true);
    expect(room.questions[0].pct).toBeNull(); // 2 votes < minimum 3

    await guess(players[2], 1, 50, 1);
    room = (await today(players[0])).room;
    expect(room.questions[0]).toMatchObject({ votes: 3, pct: 67 });
  });

  it('ROOM_REVEAL=open forces the reveal for testing', async () => {
    setup({ ROOM_REVEAL: 'open', ROOM_MIN_VOTES: '1' });
    const p = randomUUID();
    await guess(p, 2, 50, 1);
    expect((await today(p)).room.questions[1]).toMatchObject({ votes: 1, pct: 0, order: 2 });
  });

  it('league standings carry the league room after 9pm only', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const post = (path: string, body: unknown) =>
      app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const { league } = await (await post('/api/leagues', { player_id: a, name: 'Kitchen', display_name: 'Colm' })).json();
    await post('/api/leagues/join', { player_id: b, code: league.code, display_name: 'Niamh' });
    await guess(a, 1, 40, 0);
    await guess(b, 1, 40, 1);
    const standings = async () =>
      (await app.request(`/api/leagues/${league.id}/standings`, { headers: { 'X-Player-Id': a } })).json();
    expect((await standings()).room).toBeNull();
    clock = new Date('2026-12-01T21:30:00Z');
    expect((await standings()).room[0]).toMatchObject({ order: 1, votes: 2, pct: 50 });
  });
});
