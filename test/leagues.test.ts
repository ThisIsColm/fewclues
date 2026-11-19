import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanName, createApp } from '../server/app';
import { loadConfig } from '../server/config';
import { ContentStore } from '../server/content';
import { Store } from '../server/db';
import { addDays } from '../shared/day';
import { makeDay } from './fixtures';

const ANSWERS = ['kerry', 'cork', 'mayo', 'meath', 'antrim'];
let clock: Date;
let app: ReturnType<typeof createApp>;

function setup(env: Record<string, string> = {}) {
  const config = loadConfig({ LAUNCH_DATE: '2026-11-01', PERCENTILE_MIN_PLAYERS: '2', RATE_LIMIT_PER_MINUTE: '10000', LEAGUE_CREATES_PER_HOUR: '1000', LEAGUE_JOINS_PER_HOUR: '1000', ...env });
  const days = Array.from({ length: 14 }, (_, i) => makeDay(addDays('2026-11-16', i), ANSWERS)).flat();
  app = createApp({ config, store: new Store(':memory:'), content: ContentStore.fromRounds(days, 'ie', false), now: () => clock });
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const get = async (path: string, player: string) => (await app.request(path, { headers: { 'X-Player-Id': player } })).json();
const date = () => clock.toISOString().slice(0, 10);
/** outcomes[i] = clue the round is solved on (1–4), or 0 to miss it. */
async function play(player: string, outcomes: number[]) {
  const wrong = ['dublin', 'wexford', 'sligo', 'tyrone'];
  let last: any;
  for (let i = 0; i < 5; i++) {
    const at = outcomes[i];
    const rid = `${date()}-${i + 1}`;
    const send = async (place: string) => (await post('/api/guess', { player_id: player, round_id: rid, place })).json();
    for (let k = 0; k < (at === 0 ? 4 : at - 1); k++) last = await send(wrong[k]);
    if (at !== 0) last = await send(ANSWERS[i]);
  }
  return last;
}
async function create(player: string, name = 'Kitchen', display = 'Colm') {
  const res = await post('/api/leagues', { player_id: player, name, display_name: display });
  return { status: res.status, ...(await res.json()) };
}

beforeEach(() => {
  clock = new Date('2026-11-18T12:00:00Z'); // a Wednesday
  setup();
});

describe('leagues', () => {
  it('create → join by code → list', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const { status, league } = await create(a);
    expect(status).toBe(201);
    expect(league).toMatchObject({ name: 'Kitchen', members: 1, myName: 'Colm' });
    expect(league.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    const preview = await (await app.request(`/api/leagues/invite/${league.code}`)).json();
    expect(preview).toEqual({ name: 'Kitchen', members: 1, full: false });

    const join = await (await post('/api/leagues/join', { player_id: b, code: league.code.toLowerCase(), display_name: '  Niamh  ' })).json();
    expect(join.league).toMatchObject({ id: league.id, members: 2, myName: 'Niamh' });
    expect(join.alreadyMember).toBe(false);

    // Joining again just updates the display name.
    const again = await (await post('/api/leagues/join', { player_id: b, code: league.code, display_name: 'Niamh M' })).json();
    expect(again).toMatchObject({ alreadyMember: true, league: { members: 2, myName: 'Niamh M' } });

    expect((await get('/api/leagues', b)).leagues.map((l: any) => l.name)).toEqual(['Kitchen']);
    const second = await create(b, 'Work', 'Niamh');
    expect((await get('/api/leagues', b)).leagues.map((l: any) => l.name)).toEqual(['Kitchen', 'Work']);
    expect((await get('/api/leagues', a)).leagues).toHaveLength(1);
    expect(second.league.code).not.toBe(league.code);
  });

  it('validates names and codes', async () => {
    const a = randomUUID();
    expect((await create(a, '', 'Colm')).status).toBe(400);
    expect((await create(a, 'x'.repeat(33), 'Colm')).status).toBe(400);
    expect((await create(a, 'Kitchen', '\u0000​ ')).status).toBe(400);
    expect((await post('/api/leagues/join', { player_id: a, code: 'NOPE2345', display_name: 'C' })).status).toBe(404);
    expect(cleanName('  Seán   Ó​ Briain ', 20)).toBe('Seán Ó Briain');
  });

  it('caps a league at 50 members', async () => {
    const { league } = await create(randomUUID());
    for (let i = 0; i < 49; i++) expect((await post('/api/leagues/join', { player_id: randomUUID(), code: league.code, display_name: `P${i}` })).status).toBe(200);
    const res = await post('/api/leagues/join', { player_id: randomUUID(), code: league.code, display_name: 'Late' });
    expect(res.status).toBe(409);
    expect((await (await app.request(`/api/leagues/invite/${league.code}`)).json()).full).toBe(true);
  });

  it('rate-limits creating and joining per IP', async () => {
    setup({ LEAGUE_CREATES_PER_HOUR: '2', LEAGUE_JOINS_PER_HOUR: '2' });
    const ip = { 'CF-Connecting-IP': '9.9.9.9' };
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await post('/api/leagues', { player_id: randomUUID(), name: 'L', display_name: 'X' }, ip)).status);
    expect(codes).toEqual([201, 201, 429]);
    const jc = [];
    for (let i = 0; i < 3; i++) jc.push((await post('/api/leagues/join', { player_id: randomUUID(), code: 'AAAAAAAA', display_name: 'X' }, ip)).status);
    expect(jc).toEqual([404, 404, 429]);
  });

  it('standings: only members, hide head-to-head until you finish, rank by score', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const outsider = randomUUID();
    const { league } = await create(a);
    await post('/api/leagues/join', { player_id: b, code: league.code, display_name: 'Niamh' });
    expect((await app.request(`/api/leagues/${league.id}/standings`, { headers: { 'X-Player-Id': outsider } })).status).toBe(404);

    await play(b, [1, 1, 1, 1, 2]); // 4 × 200 + 120 = 920
    let s = await get(`/api/leagues/${league.id}/standings`, a);
    expect(s.viewerFinished).toBe(false);
    expect(s.headToHead).toBeNull();
    expect(s.rows).toEqual([
      { rank: 1, name: 'Niamh', isMe: false, total: 920, blocks: ['green', 'green', 'green', 'green', 'yellow'] },
      { rank: null, name: 'Colm', isMe: true, total: null, blocks: null },
    ]);
    // Nothing in standings carries answers or guesses.
    expect(JSON.stringify(s)).not.toMatch(/answer|kerry|place/);

    await play(a, [0, 1, 1, 1, 1]); // missed round 1 → 800
    s = await get(`/api/leagues/${league.id}/standings`, a);
    expect(s.viewerFinished).toBe(true);
    expect(s.rows.map((r: any) => [r.rank, r.name, r.total])).toEqual([[1, 'Niamh', 920], [2, 'Colm', 800]]);
    expect(s.rows[1].blocks).toEqual(['red', 'green', 'green', 'green', 'green']);
    expect(s.headToHead).toEqual({ mate: 'Niamh', order: 1, mySolved: 0, mateSolved: 1, mateBetter: true });
  });

  it('ties share a rank', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const { league } = await create(a);
    await post('/api/leagues/join', { player_id: b, code: league.code, display_name: 'Niamh' });
    await play(a, [1, 1, 1, 1, 1]);
    await play(b, [1, 1, 1, 1, 1]);
    const s = await get(`/api/leagues/${league.id}/standings`, a);
    expect(s.rows.map((r: any) => r.rank)).toEqual([1, 1]);
    expect(s.headToHead).toBeNull(); // no gap to report
  });

  it('weekly totals sum Monday→today and reset on Monday (Dublin)', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const { league } = await create(a);
    await post('/api/leagues/join', { player_id: b, code: league.code, display_name: 'Niamh' });
    // Sun 22 Nov: a plays. Mon 23, Tue 24: a and b play.
    clock = new Date('2026-11-22T12:00:00Z');
    await play(a, [1, 1, 1, 1, 1]);
    clock = new Date('2026-11-23T12:00:00Z');
    await play(a, [1, 1, 1, 1, 1]);
    await play(b, [2, 1, 1, 1, 1]); // 920
    clock = new Date('2026-11-24T12:00:00Z');
    await play(a, [2, 1, 1, 1, 1]); // 920
    await play(b, [1, 1, 1, 1, 1]);
    let s = await get(`/api/leagues/${league.id}/standings?period=week`, a);
    expect(s).toMatchObject({ period: 'week', from: '2026-11-23', to: '2026-11-24' });
    expect(s.rows.map((r: any) => [r.rank, r.name, r.total, r.daysPlayed])).toEqual([[1, 'Colm', 1920, 2], [1, 'Niamh', 1920, 2]]);

    // Sunday 29 Nov 23:59 GMT is still the same week; 30 Nov 00:00 starts a new one.
    clock = new Date('2026-11-29T23:59:00Z');
    expect((await get(`/api/leagues/${league.id}/standings?period=week`, a)).from).toBe('2026-11-23');
    clock = new Date('2026-11-30T00:00:00Z');
    s = await get(`/api/leagues/${league.id}/standings?period=week`, a);
    expect(s.from).toBe('2026-11-30');
    expect(s.rows.every((r: any) => r.total === null && r.daysPlayed === 0)).toBe(true);
  });
});

