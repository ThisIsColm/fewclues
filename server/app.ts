import { randomInt, randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { NONCE, secureHeaders } from 'hono/secure-headers';
import { addDays, dublinDate, nextRollover, puzzleNumber, startOfDublinDay, weekStart } from '../shared/day';
import { blockForSolve, buildLadder, MAX_CLUES, roundMaxes, roundPoints, SPEED_FLOOR_MS, speedFactor } from '../shared/ladder';
import { PLACE_SETS, placeById } from '../shared/places';
import { percentileFromCounts } from '../shared/scoring';
import { editionInfo } from '../shared/share';
import type {
  Block,
  Completion,
  CrowdStats,
  GuessResponse,
  HeadToHead,
  LeagueSummary,
  Round,
  RoundView,
  StandingRow,
  StandingsResponse,
  TodayResponse,
} from '../shared/types';
import { ROUNDS_PER_DAY } from '../shared/validate';
import type { Config } from './config';
import type { ContentStore } from './content';
import type { AttemptRow, Store } from './db';
import { RateLimiter } from './ratelimit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CROWD_TTL_MS = 30_000;
const LEAGUE_MAX_MEMBERS = 50;
const LEAGUES_PER_PLAYER = 20;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

/** Trim, drop control characters, collapse spaces; null if empty or too long. */
export function cleanName(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, '').replace(/\s+/g, ' ').trim();
  return s.length >= 1 && [...s].length <= max ? s : null;
}

/** A player's progress on one round, from their attempts (ordered by n). */
export function roundProgress(attempts: { n: number; place: string; correct: number; created_at?: number }[]) {
  const sorted = [...attempts].sort((a, b) => a.n - b.n);
  const hit = sorted.find((a) => a.correct === 1);
  const solvedAt = hit ? hit.n : 0;
  const done = !!hit || sorted.length >= MAX_CLUES;
  return {
    solvedAt,
    solvedTime: hit?.created_at ?? null,
    done,
    wrong: sorted.filter((a) => a.correct === 0).map((a) => a.place),
    tries: sorted.length,
  };
}

export interface AppDeps {
  config: Config;
  store: Store;
  content: ContentStore;
  now?: () => Date;
  remoteAddr?: (c: Context) => string | undefined;
}

export function createApp({ config, store, content, now = () => new Date(), remoteAddr }: AppDeps) {
  const app = new Hono();
  const limiter = new RateLimiter(config.rateLimitPerMinute);
  const createLimiter = new RateLimiter(config.leagueCreatesPerHour, 3_600_000);
  const joinLimiter = new RateLimiter(config.leagueJoinsPerHour, 3_600_000);
  const edition = editionInfo(config.edition);
  const today = () => config.devDate ?? dublinDate(now());

  // ---- Per-round maximums for a day (harder rounds worth more; the day sums to 1000).
  const maxCache = new Map<string, Map<string, number>>();
  function maxFor(r: Round): number {
    let m = maxCache.get(r.date);
    if (!m) {
      const day = content.forDate(r.date);
      const maxes = roundMaxes(day.map((x) => x.difficulty));
      m = new Map(day.map((x, i) => [x.id, maxes[i]]));
      maxCache.set(r.date, m);
      if (maxCache.size > 10) maxCache.delete(maxCache.keys().next().value!);
    }
    return m.get(r.id) ?? 0;
  }
  /** Time from opening the round to solving it; a missing start counts as slowest. */
  const solveMs = (p: ReturnType<typeof roundProgress>, startedAt: number | undefined) =>
    p.solvedAt && p.solvedTime !== null && startedAt !== undefined ? Math.max(0, p.solvedTime - startedAt) : SPEED_FLOOR_MS;
  const pointsOf = (r: Round, p: ReturnType<typeof roundProgress>, startedAt: number | undefined) =>
    roundPoints(maxFor(r), p.solvedAt, solveMs(p, startedAt));

  // ---- Crowd stats per round, cached 30 s (and dropped when that round changes).
  const pointsCache = new Map<string, { list: number[]; at: number }>();
  function crowdPoints(r: Round): number[] {
    const hit = pointsCache.get(r.id);
    if (hit && Date.now() - hit.at < CROWD_TTL_MS) return hit.list;
    const max = maxFor(r);
    const list = store.roundResults(r.id).map((x) => roundPoints(max, x.solvedAt, x.ms ?? SPEED_FLOOR_MS));
    pointsCache.set(r.id, { list, at: Date.now() });
    if (pointsCache.size > 200) pointsCache.delete(pointsCache.keys().next().value!);
    return list;
  }
  const crowdCache = new Map<string, { stats: CrowdStats; at: number }>();
  function crowd(r: Round): CrowdStats {
    const hit = crowdCache.get(r.id);
    if (hit && Date.now() - hit.at < CROWD_TTL_MS) return hit.stats;
    const set = PLACE_SETS[r.set];
    const dist = store.roundDist(r.id);
    const stats: CrowdStats = {
      dist,
      players: dist.reduce((a, b) => a + b, 0),
      topWrong: store.topWrong(r.id).map((w) => ({ place: w.place, name: placeById(set, w.place)?.name ?? w.place, n: w.n })),
    };
    crowdCache.set(r.id, { stats, at: Date.now() });
    if (crowdCache.size > 200) crowdCache.delete(crowdCache.keys().next().value!);
    return stats;
  }

  /** Share of other finishers on this round who scored fewer points. */
  function beat(r: Round, points: number): number | null {
    const list = crowdPoints(r);
    return percentileFromCounts(list.filter((x) => x < points).length, list.length, config.percentileMinPlayers);
  }

  function view(r: Round, attempts: AttemptRow[], startedAt: number | undefined): RoundView {
    const set = PLACE_SETS[r.set];
    const ladder = buildLadder(set, r.answer, r.clues);
    const p = roundProgress(attempts);
    // Clues are only sent once the player has opened the round.
    const opened = startedAt !== undefined || p.tries > 0;
    const shown = p.done ? ladder : opened ? ladder.slice(0, Math.min(MAX_CLUES, p.tries + 1)) : [];
    let reveal: RoundView['reveal'] = null;
    if (p.done) {
      const stats = crowd(r);
      const points = pointsOf(r, p, startedAt);
      const ms = p.solvedAt ? solveMs(p, startedAt) : null;
      reveal = {
        answer: r.answer,
        answerName: placeById(set, r.answer)!.name,
        solvedAt: p.solvedAt,
        points,
        timeMs: ms,
        speed: ms === null ? null : Math.round(speedFactor(ms) * 100) / 100,
        block: blockForSolve(p.solvedAt),
        ladder,
        fact: r.fact,
        source_name: r.source_name,
        source_url: r.source_url,
        crowd: stats,
        beat: beat(r, points),
      };
    }
    return {
      id: r.id,
      order: r.order,
      category: r.category,
      difficulty: r.difficulty,
      max: maxFor(r),
      startedAt: startedAt !== undefined ? new Date(startedAt).toISOString() : null,
      clues: shown,
      wrong: p.wrong,
      done: p.done,
      reveal,
    };
  }

  // ---- Gap of the day: the round with the highest share of misses.
  const gapCache = new Map<string, { gap: Completion['gapOfDay']; at: number }>();
  function gapOfDay(date: string): Completion['gapOfDay'] {
    const hit = gapCache.get(date);
    if (hit && Date.now() - hit.at < CROWD_TTL_MS) return hit.gap;
    let gap: Completion['gapOfDay'] = null;
    for (const r of content.forDate(date)) {
      const d = store.roundDist(r.id);
      const players = d.reduce((a, b) => a + b, 0);
      if (!players) continue;
      const missedPct = Math.round((d[4] / players) * 100);
      if (!gap || missedPct > gap.missedPct) gap = { order: r.order, round_id: r.id, missedPct };
    }
    gapCache.set(date, { gap, at: Date.now() });
    return gap;
  }

  function completion(playerId: string, date: string): Completion | null {
    const total = store.getCompletion(playerId, date);
    if (total === undefined) return null;
    const { players, below } = store.rank(date, total);
    return { total, players, percentile: percentileFromCounts(below, players, config.percentileMinPlayers), gapOfDay: gapOfDay(date) };
  }

  function openDates(): string[] {
    const d = today();
    if (config.devDate) return [d].filter((x) => x >= config.launchDate);
    const since = now().getTime() - startOfDublinDay(d).getTime();
    return (since < config.rolloverGraceMs ? [d, addDays(d, -1)] : [d]).filter((x) => x >= config.launchDate);
  }

  function clientIp(c: Context): string {
    return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || remoteAddr?.(c) || 'unknown';
  }

  const byRound = (rows: AttemptRow[]) => {
    const m = new Map<string, AttemptRow[]>();
    for (const a of rows) m.set(a.round_id, [...(m.get(a.round_id) ?? []), a]);
    return m;
  };

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // NumberFlow injects a <style> into its shadow root; it carries this per-request nonce.
        styleSrc: ["'self'", NONCE],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
      referrerPolicy: 'strict-origin-when-cross-origin',
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: 'cross-origin',
    }),
  );
  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });
  app.post('/api/*', async (c, next) => {
    const ip = clientIp(c);
    const path = c.req.path;
    const special = path === '/api/leagues' ? createLimiter : path === '/api/leagues/join' ? joinLimiter : null;
    if (!limiter.take(ip) || (special && !special.take(ip))) {
      c.header('Retry-After', '10');
      return c.json({ error: 'Too many requests — slow down a little.' }, 429);
    }
    await next();
  });

  app.get('/api/health', (c) => {
    const ok = store.ping();
    return c.json({ ok, date: today(), roundsToday: content.forDate(today()).length }, ok ? 200 : 503);
  });

  app.get('/api/today', (c) => {
    const date = today();
    const playerId = c.req.header('x-player-id') ?? '';
    const rounds = date >= config.launchDate ? content.forDate(date) : [];
    const mine = UUID.test(playerId) ? byRound(store.playerAttempts(playerId, date)) : new Map<string, AttemptRow[]>();
    const starts = UUID.test(playerId) ? store.playerStarts(playerId, date) : new Map<string, number>();
    const body: TodayResponse = {
      date,
      puzzle: Math.max(0, puzzleNumber(date, config.launchDate)),
      launchDate: config.launchDate,
      edition: edition.code,
      editionName: edition.name,
      flag: edition.flag,
      siteHost: config.siteHost,
      nextRolloverAt: nextRollover(now()).toISOString(),
      set: rounds[0]?.set ?? 'ie-counties',
      rounds: rounds.map((r) => view(r, mine.get(r.id) ?? [], starts.get(r.id))),
      completion: UUID.test(playerId) ? completion(playerId, date) : null,
    };
    return c.json(body);
  });

  /** Open a round: records the start time (once) and returns clue 1. */
  app.post('/api/start', async (c) => {
    const b = await body(c);
    const playerId = b?.player_id;
    if (typeof playerId !== 'string' || !UUID.test(playerId)) return c.json({ error: 'Invalid player_id.' }, 400);
    const r = typeof b?.round_id === 'string' ? content.get(b.round_id) : undefined;
    if (!r) return c.json({ error: 'Unknown round.' }, 404);
    if (!openDates().includes(r.date) || !content.forDate(r.date).some((x) => x.id === r.id))
      return c.json({ error: 'That puzzle is closed — a new one is ready.', code: 'stale' }, 409);
    store.insertStart(playerId, r.date, r.id, now().getTime());
    const attempts = byRound(store.playerAttempts(playerId, r.date)).get(r.id) ?? [];
    return c.json({ round: view(r, attempts, store.playerStarts(playerId, r.date).get(r.id)) });
  });

  app.post('/api/guess', async (c) => {
    const b = await body(c);
    const playerId = b?.player_id;
    if (typeof playerId !== 'string' || !UUID.test(playerId)) return c.json({ error: 'Invalid player_id.' }, 400);
    const r = typeof b?.round_id === 'string' ? content.get(b.round_id) : undefined;
    if (!r) return c.json({ error: 'Unknown round.' }, 404);
    if (!openDates().includes(r.date) || !content.forDate(r.date).some((x) => x.id === r.id))
      return c.json({ error: 'That puzzle is closed — a new one is ready.', code: 'stale' }, 409);
    const set = PLACE_SETS[r.set];
    const place = typeof b?.place === 'string' ? placeById(set, b.place) : undefined;
    if (!place) return c.json({ error: `Pick a ${set.noun} from the list.` }, 400);

    const t = now().getTime();
    const out = store.transaction(() => {
      const before = byRound(store.playerAttempts(playerId, r.date)).get(r.id) ?? [];
      const p = roundProgress(before);
      if (p.done) return { alreadyDone: true, correct: p.solvedAt > 0 };
      // Guessing without opening the round first means guessing blind; start the clock now.
      store.insertStart(playerId, r.date, r.id, t);
      const correct = place.id === r.answer;
      store.insertAttempt(playerId, r.date, r.id, p.tries + 1, place.id, correct, t);
      // Finished all five rounds? Record the day's total once.
      const all = byRound(store.playerAttempts(playerId, r.date));
      const day = content.forDate(r.date);
      const states = day.map((x) => roundProgress(all.get(x.id) ?? []));
      if (states.length === ROUNDS_PER_DAY && states.every((s) => s.done) && store.getCompletion(playerId, r.date) === undefined) {
        const starts = store.playerStarts(playerId, r.date);
        const total = day.reduce((sum, x, i) => sum + pointsOf(x, states[i], starts.get(x.id)), 0);
        store.insertCompletion(playerId, r.date, total, t);
      }
      return { alreadyDone: false, correct };
    });
    if (!out.alreadyDone) {
      crowdCache.delete(r.id);
      pointsCache.delete(r.id);
      gapCache.delete(r.date);
    }
    const attempts = byRound(store.playerAttempts(playerId, r.date)).get(r.id) ?? [];
    const res: GuessResponse = {
      round: view(r, attempts, store.playerStarts(playerId, r.date).get(r.id)),
      completion: completion(playerId, r.date),
      correct: out.correct,
      alreadyDone: out.alreadyDone,
    };
    return c.json(res);
  });

  // ================================================================ leagues

  async function body(c: Context): Promise<Record<string, unknown> | null> {
    try {
      const b = await c.req.json();
      return b && typeof b === 'object' ? b : null;
    } catch {
      return null;
    }
  }

  function summary(leagueId: string, playerId: string): LeagueSummary {
    const l = store.leagueById(leagueId)!;
    return {
      id: l.id,
      name: l.name,
      code: l.invite_code,
      members: store.memberCount(l.id),
      myName: store.memberName(l.id, playerId) ?? '',
    };
  }

  function newCode(): string {
    for (;;) {
      const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      if (!store.leagueByCode(code)) return code;
    }
  }

  app.post('/api/leagues', async (c) => {
    const b = await body(c);
    const playerId = b?.player_id;
    if (typeof playerId !== 'string' || !UUID.test(playerId)) return c.json({ error: 'Invalid player_id.' }, 400);
    const name = cleanName(b?.name, 32);
    if (!name) return c.json({ error: 'League name must be 1–32 characters.' }, 400);
    const displayName = cleanName(b?.display_name, 20);
    if (!displayName) return c.json({ error: 'Your name must be 1–20 characters.' }, 400);
    if (store.myLeagues(playerId).length >= LEAGUES_PER_PLAYER)
      return c.json({ error: `You can be in up to ${LEAGUES_PER_PLAYER} leagues.` }, 409);
    const id = randomUUID();
    const t = now().getTime();
    store.transaction(() => {
      store.insertLeague(id, name, newCode(), playerId, t);
      store.upsertMember(id, playerId, displayName, t);
    });
    return c.json({ league: summary(id, playerId) }, 201);
  });

  app.post('/api/leagues/join', async (c) => {
    const b = await body(c);
    const playerId = b?.player_id;
    if (typeof playerId !== 'string' || !UUID.test(playerId)) return c.json({ error: 'Invalid player_id.' }, 400);
    const code = typeof b?.code === 'string' ? b.code.trim().toUpperCase() : '';
    const league = /^[A-Z0-9]{8}$/.test(code) ? store.leagueByCode(code) : undefined;
    if (!league) return c.json({ error: 'No league with that invite code.' }, 404);
    const displayName = cleanName(b?.display_name, 20);
    if (!displayName) return c.json({ error: 'Your name must be 1–20 characters.' }, 400);
    const already = store.memberName(league.id, playerId) !== undefined;
    if (!already) {
      if (store.memberCount(league.id) >= LEAGUE_MAX_MEMBERS)
        return c.json({ error: `This league is full (${LEAGUE_MAX_MEMBERS} players).` }, 409);
      if (store.myLeagues(playerId).length >= LEAGUES_PER_PLAYER)
        return c.json({ error: `You can be in up to ${LEAGUES_PER_PLAYER} leagues.` }, 409);
    }
    store.upsertMember(league.id, playerId, displayName, now().getTime());
    return c.json({ league: summary(league.id, playerId), alreadyMember: already });
  });

  app.get('/api/leagues', (c) => {
    const playerId = c.req.header('x-player-id') ?? '';
    if (!UUID.test(playerId)) return c.json({ leagues: [] });
    const leagues: LeagueSummary[] = store.myLeagues(playerId).map((l) => ({
      id: l.id,
      name: l.name,
      code: l.invite_code,
      members: l.members,
      myName: l.my_name,
    }));
    return c.json({ leagues });
  });

  /** Public preview for an invite link: name and size only. */
  app.get('/api/leagues/invite/:code', (c) => {
    const l = store.leagueByCode(c.req.param('code').toUpperCase());
    if (!l) return c.json({ error: 'No league with that invite code.' }, 404);
    return c.json({ name: l.name, members: store.memberCount(l.id), full: store.memberCount(l.id) >= LEAGUE_MAX_MEMBERS });
  });

  app.get('/api/leagues/:id/standings', (c) => {
    const playerId = c.req.header('x-player-id') ?? '';
    const leagueId = c.req.param('id');
    if (!UUID.test(playerId) || !store.leagueById(leagueId) || store.memberName(leagueId, playerId) === undefined)
      return c.json({ error: 'Not a member of this league.' }, 404);
    const period = c.req.query('period') === 'week' ? 'week' : 'day';
    const date = today();
    const from = period === 'week' ? weekStart(date) : date;
    const members = store.members(leagueId);
    const comps = store.leagueCompletions(leagueId, from, date);
    const viewerFinished = comps.some((x) => x.player_id === playerId && x.date === date);
    const finishedToday = new Set(comps.filter((x) => x.date === date).map((x) => x.player_id));

    // Per-member outcome on each of today's rounds — only for members who finished.
    const rounds = content.forDate(date);
    const solved = new Map<string, number[]>();
    if (period === 'day' && rounds.length) {
      const byPlayer = new Map<string, AttemptRow[]>();
      for (const a of store.leagueAttempts(leagueId, date)) byPlayer.set(a.player_id, [...(byPlayer.get(a.player_id) ?? []), a]);
      for (const [pid, rows] of byPlayer) {
        if (!finishedToday.has(pid)) continue;
        const m = byRound(rows);
        solved.set(pid, rounds.map((r) => roundProgress(m.get(r.id) ?? []).solvedAt));
      }
    }

    const totals = new Map<string, { total: number; days: number }>();
    for (const x of comps) {
      const t = totals.get(x.player_id) ?? { total: 0, days: 0 };
      t.total += x.total;
      t.days += 1;
      totals.set(x.player_id, t);
    }
    const rows: StandingRow[] = members.map((m) => {
      const t = totals.get(m.player_id);
      const s = solved.get(m.player_id);
      return {
        rank: null,
        name: m.display_name,
        isMe: m.player_id === playerId,
        total: t ? t.total : null,
        blocks: period === 'day' && s ? s.map((x) => blockForSolve(x) as Block) : null,
        ...(period === 'week' ? { daysPlayed: t?.days ?? 0 } : {}),
      };
    });
    rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
    rows.forEach((r, i) => {
      if (r.total === null) return;
      r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1;
    });

    // Head-to-head: the round with the biggest gap in clues needed, once the viewer has finished.
    let headToHead: HeadToHead | null = null;
    const mine = solved.get(playerId);
    const cost = (s: number) => (s === 0 ? 5 : s);
    if (period === 'day' && viewerFinished && mine) {
      let best = 0;
      for (const m of members) {
        if (m.player_id === playerId) continue;
        const theirs = solved.get(m.player_id);
        if (!theirs) continue;
        theirs.forEach((mateSolved, i) => {
          const gap = Math.abs(cost(mateSolved) - cost(mine[i]));
          if (gap > best) {
            best = gap;
            headToHead = { mate: m.display_name, order: i + 1, mySolved: mine[i], mateSolved, mateBetter: cost(mateSolved) < cost(mine[i]) };
          }
        });
      }
    }
    const res: StandingsResponse = { league: summary(leagueId, playerId), period, from, to: date, viewerFinished, rows, headToHead };
    return c.json(res);
  });

  app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Not found' }, 404) : c.text('Not found', 404)));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'Something went wrong.' }, 500);
  });

  return app;
}
