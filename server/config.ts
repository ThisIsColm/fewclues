import { isIsoDate } from '../shared/day';

export interface Config {
  port: number;
  host: string;
  dbPath: string;
  contentPath: string;
  staticDir: string;
  launchDate: string;
  edition: string;
  siteUrl: string;
  siteHost: string;
  allowDrafts: boolean;
  /** Pin "today" to a fixed puzzle date (local testing only). */
  devDate: string | null;
  percentileMinPlayers: number;
  rateLimitPerMinute: number;
  leagueCreatesPerHour: number;
  /** Minimum votes before a room's split is shown at 9pm. */
  roomMinVotes: number;
  /** Minimum voters on each side before the false-consensus split is shown. */
  splitMinVotes: number;
  /** 'auto' (9pm), or force the room reveal 'open' / 'closed' for testing. */
  roomReveal: 'auto' | 'open' | 'closed';
  leagueJoinsPerHour: number;
  /** After midnight, still accept guesses on yesterday's puzzle for this long. */
  rolloverGraceMs: number;
}

function int(v: string | undefined, def: number): number {
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isInteger(n) && n >= 0 ? n : def;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const siteUrl = (env.SITE_URL || 'https://percentle.ie').replace(/\/+$/, '');
  const launchDate = env.LAUNCH_DATE || '2026-12-01';
  if (!isIsoDate(launchDate)) throw new Error(`LAUNCH_DATE must be YYYY-MM-DD, got "${launchDate}"`);
  const devDate = env.DEV_DATE || null;
  if (devDate && !isIsoDate(devDate)) throw new Error(`DEV_DATE must be YYYY-MM-DD, got "${devDate}"`);
  return {
    port: int(env.PORT, 8787),
    host: env.HOST || '0.0.0.0',
    dbPath: env.DB_PATH || 'data/percentle.db',
    contentPath: env.CONTENT_PATH || 'content/questions.json',
    staticDir: env.STATIC_DIR || 'dist/public',
    launchDate,
    edition: env.EDITION || 'ie',
    siteUrl,
    siteHost: env.SITE_HOST || new URL(siteUrl).host,
    allowDrafts: env.ALLOW_DRAFTS === '1',
    devDate,
    percentileMinPlayers: int(env.PERCENTILE_MIN_PLAYERS, 20),
    rateLimitPerMinute: int(env.RATE_LIMIT_PER_MINUTE, 60),
    leagueCreatesPerHour: int(env.LEAGUE_CREATES_PER_HOUR, 10),
    roomMinVotes: int(env.ROOM_MIN_VOTES, 50),
    splitMinVotes: int(env.SPLIT_MIN_VOTES, 10),
    roomReveal: env.ROOM_REVEAL === 'open' || env.ROOM_REVEAL === 'closed' ? env.ROOM_REVEAL : 'auto',
    leagueJoinsPerHour: int(env.LEAGUE_JOINS_PER_HOUR, 30),
    rolloverGraceMs: int(env.ROLLOVER_GRACE_MINUTES, 60) * 60_000,
  };
}
