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
  leagueJoinsPerHour: number;
  /** After midnight, still accept guesses on yesterday's puzzle for this long. */
  rolloverGraceMs: number;
}

function int(v: string | undefined, def: number): number {
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isInteger(n) && n >= 0 ? n : def;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const siteUrl = (env.SITE_URL || 'https://fewclues.app').replace(/\/+$/, '');
  const launchDate = env.LAUNCH_DATE || '2026-12-01';
  if (!isIsoDate(launchDate)) throw new Error(`LAUNCH_DATE must be YYYY-MM-DD, got "${launchDate}"`);
  const devDate = env.DEV_DATE || null;
  if (devDate && !isIsoDate(devDate)) throw new Error(`DEV_DATE must be YYYY-MM-DD, got "${devDate}"`);
  return {
    port: int(env.PORT, 8787),
    host: env.HOST || '0.0.0.0',
    dbPath: env.DB_PATH || 'data/fewclues.db',
    contentPath: env.CONTENT_PATH || 'content/rounds.json',
    staticDir: env.STATIC_DIR || 'dist/public',
    launchDate,
    edition: env.EDITION || 'ww',
    siteUrl,
    siteHost: env.SITE_HOST || new URL(siteUrl).host,
    allowDrafts: env.ALLOW_DRAFTS === '1',
    devDate,
    percentileMinPlayers: int(env.PERCENTILE_MIN_PLAYERS, 20),
    rateLimitPerMinute: int(env.RATE_LIMIT_PER_MINUTE, 60),
    leagueCreatesPerHour: int(env.LEAGUE_CREATES_PER_HOUR, 10),
    leagueJoinsPerHour: int(env.LEAGUE_JOINS_PER_HOUR, 30),
    rolloverGraceMs: int(env.ROLLOVER_GRACE_MINUTES, 60) * 60_000,
  };
}
