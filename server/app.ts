import { Hono, type Context } from 'hono';
import { NONCE, secureHeaders } from 'hono/secure-headers';
import { randomInt, randomUUID } from 'node:crypto';
import { addDays, dublinDate, nextRollover, puzzleNumber, startOfDublinDay, weekStart } from '../shared/day';
import {
  binFor,
  isBullseye,
  blockFor,
  offBy,
  percentileFromCounts,
  QUESTIONS_PER_DAY,
  scoreGuess,
} from '../shared/scoring';
import { editionInfo } from '../shared/share';
import type {
  Block,
  Completion,
  GuessResponse,
  HeadToHead,
  LeagueSummary,
  Question,
  Reveal,
  StandingRow,
  StandingsResponse,
  TodayResponse,
} from '../shared/types';
import type { Config } from './config';
import type { ContentStore } from './content';
import type { Store } from './db';
import { RateLimiter } from './ratelimit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HISTOGRAM_TTL_MS = 30_000;
const LEAGUE_MAX_MEMBERS = 50;
const LEAGUES_PER_PLAYER = 20;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

/** Trim, drop control characters, collapse spaces; null if empty or too long. */
export function cleanName(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, '').replace(/\s+/g, ' ').trim();
  return s.length >= 1 && [...s].length <= max ? s : null;
}

export interface AppDeps {
  config: Config;
  store: Store;
  content: ContentStore;
  now?: () => Date;
  /** Fallback client address when no proxy header is present. */
  remoteAddr?: (c: Context) => string | undefined;
}

export function createApp({ config, store, content, now = () => new Date(), remoteAddr }: AppDeps) {
  const app = new Hono();
  const limiter = new RateLimiter(config.rateLimitPerMinute);
  const createLimiter = new RateLimiter(config.leagueCreatesPerHour, 3_600_000);
  const joinLimiter = new RateLimiter(config.leagueJoinsPerHour, 3_600_000);
  const edition = editionInfo(config.edition);

  // ---- Histogram cache: recomputed from SQLite at most every 30 s per
  // question; new guesses bump the cached bin so the player always sees
  // their own guess counted.
  const histCache = new Map<string, { bins: number[]; at: number }>();
  function histogram(questionId: string): number[] {
    const t = Date.now();
    const hit = histCache.get(questionId);
    if (hit && t - hit.at < HISTOGRAM_TTL_MS) return hit.bins.slice();
    const bins = store.histogram(questionId);
    histCache.set(questionId, { bins, at: t });
    if (histCache.size > 200) histCache.delete(histCache.keys().next().value!);
    return bins.slice();
  }
  function bumpHistogram(questionId: string, guess: number) {
    const hit = histCache.get(questionId);
    if (hit) hit.bins[binFor(guess)]++;
  }

  const today = () => config.devDate ?? dublinDate(now());

  function reveal(q: Question, guess: number): Reveal {
    const off = offBy(guess, q.answer);
    return {
      question_id: q.id,
      order: q.order,
      guess,
      answer: q.answer,
      offBy: off,
      signedError: Math.round((guess - q.answer) * 10) / 10,
      points: scoreGuess(guess, q.answer),
      bullseye: isBullseye(guess, q.answer),
      block: blockFor(off),
      year: q.year,
      source_name: q.source_name,
      source_url: q.source_url,
      nugget: q.nugget,
      comparisons: q.comparisons ?? [],
      histogram: histogram(q.id),
      closerThan: closerThan(q, guess),
    };
  }

  function closerThan(q: Question, guess: number): number | null {
    const { players, further } = store.further(q.id, q.answer, offBy(guess, q.answer));
    return percentileFromCounts(further, players, config.percentileMinPlayers);
  }

  // ---- Gap of the day: the question with the largest share of guesses off by >10.
  const gapCache = new Map<string, { gap: Completion['gapOfDay']; at: number }>();
  function gapOfDay(date: string): Completion['gapOfDay'] {
    const hit = gapCache.get(date);
    if (hit && Date.now() - hit.at < HISTOGRAM_TTL_MS) return hit.gap;
    let gap: Completion['gapOfDay'] = null;
    for (const q of content.forDate(date)) {
      const { players, further } = store.further(q.id, q.answer, 10);
      if (!players) continue;
      const fooledPct = Math.round((further / players) * 100);
      if (!gap || fooledPct > gap.fooledPct) gap = { order: q.order, question_id: q.id, fooledPct };
    }
    gapCache.set(date, { gap, at: Date.now() });
    if (gapCache.size > 10) gapCache.delete(gapCache.keys().next().value!);
    return gap;
  }

  function completion(playerId: string, date: string): Completion | null {
    const total = store.getCompletion(playerId, date);
    if (total === undefined) return null;
    const { players, below } = store.rank(date, total);
    return {
      total,
      players,
      percentile: percentileFromCounts(below, players, config.percentileMinPlayers),
      gapOfDay: gapOfDay(date),
    };
  }

  /** Which puzzle dates currently accept guesses: today, plus yesterday just after midnight. */
  function openDates(): string[] {
    const d = today();
    if (config.devDate) return [d].filter((x) => x >= config.launchDate);
    const sinceMidnight = now().getTime() - startOfDublinDay(d).getTime();
    const dates = sinceMidnight < config.rolloverGraceMs ? [d, addDays(d, -1)] : [d];
    return dates.filter((x) => x >= config.launchDate);
  }

  function clientIp(c: Context): string {
    return (
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      remoteAddr?.(c) ||
      'unknown'
    );
  }

  app.use('*', secureHeaders({
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
    crossOriginResourcePolicy: 'cross-origin', // let link previews embed og.png
  }));

  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  app.post('/api/*', async (c, next) => {
    if (!limiter.take(clientIp(c))) {
      c.header('Retry-After', '10');
      return c.json({ error: 'Too many requests — slow down a little.' }, 429);
    }
    const path = c.req.path;
    const special = path === '/api/leagues' ? createLimiter : path === '/api/leagues/join' ? joinLimiter : null;
    if (special && !special.take(clientIp(c))) {
      c.header('Retry-After', '10');
      return c.json({ error: 'Too many requests — slow down a little.' }, 429);
    }
    await next();
  });

  app.get('/api/health', (c) => {
    const ok = store.ping();
    return c.json({ ok, date: today(), questionsToday: content.forDate(today()).length }, ok ? 200 : 503);
  });

  app.get('/api/today', (c) => {
    const date = today();
    const playerId = c.req.header('x-player-id') ?? '';
    const launched = date >= config.launchDate;
    const questions = launched ? content.forDate(date) : [];
    let reveals: Reveal[] = [];
    let done: Completion | null = null;
    if (UUID.test(playerId) && questions.length) {
      const guesses = new Map(store.playerGuesses(playerId, date).map((g) => [g.question_id, g.guess]));
      reveals = questions.filter((q) => guesses.has(q.id)).map((q) => reveal(q, guesses.get(q.id)!));
      done = completion(playerId, date);
    }
    const body: TodayResponse = {
      date,
      puzzle: Math.max(0, puzzleNumber(date, config.launchDate)),
      launchDate: config.launchDate,
      edition: edition.code,
      editionName: edition.name,
      flag: edition.flag,
      siteHost: config.siteHost,
      nextRolloverAt: nextRollover(now()).toISOString(),
      questions: questions.map((q) => ({ id: q.id, order: q.order, question: q.question, category: q.category })),
      reveals,
      completion: done,
    };
    return c.json(body);
  });

  app.post('/api/guess', async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Expected a JSON body.' }, 400);
    }
    const { player_id: playerId, question_id: questionId, guess } = body ?? {};
    if (typeof playerId !== 'string' || !UUID.test(playerId)) return c.json({ error: 'Invalid player_id.' }, 400);
    if (typeof questionId !== 'string') return c.json({ error: 'Invalid question_id.' }, 400);
    if (typeof guess !== 'number' || !Number.isInteger(guess) || guess < 0 || guess > 100)
      return c.json({ error: 'guess must be a whole number from 0 to 100.' }, 400);

    const q = content.get(questionId);
    if (!q) return c.json({ error: 'Unknown question.' }, 404);
    if (!openDates().includes(q.date) || !content.forDate(q.date).some((x) => x.id === q.id))
      return c.json({ error: 'That puzzle is closed — a new one is ready.', code: 'stale' }, 409);

    const t = now().getTime();
    const result = store.transaction(() => {
      const inserted = store.insertGuess(playerId, q.date, q.id, guess, t);
      const stored = inserted ? guess : store.getGuess(playerId, q.id)!;
      const mine = store.playerGuesses(playerId, q.date);
      if (mine.length === QUESTIONS_PER_DAY && store.getCompletion(playerId, q.date) === undefined) {
        const byId = new Map(content.forDate(q.date).map((x) => [x.id, x]));
        const total = mine.reduce((sum, g) => sum + scoreGuess(g.guess, byId.get(g.question_id)!.answer), 0);
        store.insertCompletion(playerId, q.date, total, t);
      }
      return { inserted, stored };
    });
    if (result.inserted) {
      bumpHistogram(q.id, guess);
      gapCache.delete(q.date);
    }

    const res: GuessResponse = { reveal: reveal(q, result.stored), completion: completion(playerId, q.date) };
    return c.json({ ...res, alreadyGuessed: !result.inserted });
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

    // Per-member offs on today's questions — only for members who finished.
    const questions = content.forDate(date);
    const finishedToday = new Set(comps.filter((x) => x.date === date).map((x) => x.player_id));
    const offs = new Map<string, number[]>();
    if (period === 'day' && questions.length) {
      const byQ = new Map(questions.map((q, i) => [q.id, { q, i }]));
      for (const g of store.leagueGuesses(leagueId, date)) {
        if (!finishedToday.has(g.player_id)) continue;
        const hit = byQ.get(g.question_id);
        if (!hit) continue;
        const arr = offs.get(g.player_id) ?? new Array<number>(questions.length).fill(NaN);
        arr[hit.i] = offBy(g.guess, hit.q.answer);
        offs.set(g.player_id, arr);
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
      const o = offs.get(m.player_id);
      return {
        rank: null,
        name: m.display_name,
        isMe: m.player_id === playerId,
        total: t ? t.total : null,
        blocks: period === 'day' && o ? o.map((x) => blockFor(x) as Block) : null,
        ...(period === 'week' ? { daysPlayed: t?.days ?? 0 } : {}),
      };
    });
    // Rank by total, ties share a rank (1, 1, 3); unfinished players go last.
    rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
    rows.forEach((r, i) => {
      if (r.total === null) return;
      r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1;
    });

    // Head-to-head: biggest gap on a single question, only once the viewer has finished.
    let headToHead: HeadToHead | null = null;
    const mine = offs.get(playerId);
    if (period === 'day' && viewerFinished && mine) {
      for (const m of members) {
        if (m.player_id === playerId) continue;
        const theirs = offs.get(m.player_id);
        if (!theirs) continue;
        theirs.forEach((mateOff, i) => {
          const gap = Math.abs(mateOff - mine[i]);
          if (!Number.isFinite(gap) || gap === 0) return;
          if (!headToHead || gap > Math.abs(headToHead.mateOff - headToHead.myOff))
            headToHead = { mate: m.display_name, order: i + 1, myOff: mine[i], mateOff, mateBetter: mateOff < mine[i] };
        });
      }
    }

    const res: StandingsResponse = {
      league: summary(leagueId, playerId),
      period,
      from,
      to: date,
      viewerFinished,
      rows,
      headToHead,
    };
    return c.json(res);
  });

  app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Not found' }, 404) : c.text('Not found', 404)));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'Something went wrong.' }, 500);
  });

  return app;
}
