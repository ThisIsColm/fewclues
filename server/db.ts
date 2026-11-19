import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface AttemptRow {
  round_id: string;
  n: number;
  place: string;
  correct: number;
  created_at?: number;
}

export interface LeagueRow {
  id: string;
  name: string;
  invite_code: string;
}

export class Store {
  readonly db: Database.Database;
  private stmts;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 3000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guesses (
        player_id   TEXT    NOT NULL,
        date        TEXT    NOT NULL,
        question_id TEXT    NOT NULL,
        guess       INTEGER NOT NULL CHECK (guess BETWEEN 0 AND 100),
        created_at  INTEGER NOT NULL,
        PRIMARY KEY (player_id, question_id)
      ) WITHOUT ROWID;
      -- Histogram: count guesses per question, grouped by value.
      CREATE INDEX IF NOT EXISTS guesses_by_question ON guesses (question_id, guess);
      -- Resume: a player's guesses for a day.
      CREATE INDEX IF NOT EXISTS guesses_by_player_date ON guesses (player_id, date);

      CREATE TABLE IF NOT EXISTS completions (
        player_id  TEXT    NOT NULL,
        date       TEXT    NOT NULL,
        total      INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (player_id, date)
      ) WITHOUT ROWID;
      -- Percentile: count of totals below mine for a day.
      CREATE INDEX IF NOT EXISTS completions_by_date_total ON completions (date, total);

      CREATE TABLE IF NOT EXISTS leagues (
        id          TEXT    PRIMARY KEY,
        name        TEXT    NOT NULL,
        invite_code TEXT    NOT NULL UNIQUE,
        created_by  TEXT    NOT NULL,
        created_at  INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS league_members (
        league_id    TEXT    NOT NULL REFERENCES leagues (id),
        player_id    TEXT    NOT NULL,
        display_name TEXT    NOT NULL,
        joined_at    INTEGER NOT NULL,
        PRIMARY KEY (league_id, player_id)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS league_members_by_player ON league_members (player_id);

      -- Clue ladder: each guess a player makes on a round (n = 1..4).
      CREATE TABLE IF NOT EXISTS attempts (
        player_id  TEXT    NOT NULL,
        date       TEXT    NOT NULL,
        round_id   TEXT    NOT NULL,
        n          INTEGER NOT NULL CHECK (n BETWEEN 1 AND 4),
        place      TEXT    NOT NULL,
        correct    INTEGER NOT NULL CHECK (correct IN (0, 1)),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (player_id, round_id, n)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS attempts_by_round ON attempts (round_id, correct, n);
      CREATE INDEX IF NOT EXISTS attempts_by_player_date ON attempts (player_id, date);

      -- When each player opened each round (clue 1 is only sent then); drives the speed bonus.
      CREATE TABLE IF NOT EXISTS round_starts (
        player_id  TEXT    NOT NULL,
        date       TEXT    NOT NULL,
        round_id   TEXT    NOT NULL,
        started_at INTEGER NOT NULL,
        PRIMARY KEY (player_id, round_id)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS round_starts_by_player_date ON round_starts (player_id, date);
    `);
    this.stmts = {
      insertCompletion: this.db.prepare(
        'INSERT OR IGNORE INTO completions (player_id, date, total, created_at) VALUES (?, ?, ?, ?)',
      ),
      getCompletion: this.db.prepare<[string, string], { total: number }>(
        'SELECT total FROM completions WHERE player_id = ? AND date = ?',
      ),
      rank: this.db.prepare<[number, string], { players: number; below: number | null }>(
        'SELECT COUNT(*) AS players, SUM(total < ?) AS below FROM completions WHERE date = ?',
      ),
      ping: this.db.prepare('SELECT 1'),
      insertAttempt: this.db.prepare(
        'INSERT OR IGNORE INTO attempts (player_id, date, round_id, n, place, correct, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ),
      playerAttempts: this.db.prepare<[string, string], AttemptRow>(
        'SELECT round_id, n, place, correct, created_at FROM attempts WHERE player_id = ? AND date = ? ORDER BY round_id, n',
      ),
      insertStart: this.db.prepare('INSERT OR IGNORE INTO round_starts (player_id, date, round_id, started_at) VALUES (?, ?, ?, ?)'),
      playerStarts: this.db.prepare<[string, string], { round_id: string; started_at: number }>(
        'SELECT round_id, started_at FROM round_starts WHERE player_id = ? AND date = ?',
      ),
      // Every finisher's outcome on a round: clue solved on (0 = missed) and time taken.
      roundResults: this.db.prepare<[string], { solved: number | null; solved_at: number | null; started_at: number | null }>(
        `SELECT MIN(CASE WHEN a.correct = 1 THEN a.n END) AS solved,
                MAX(CASE WHEN a.correct = 1 THEN a.created_at END) AS solved_at,
                s.started_at AS started_at
           FROM attempts a LEFT JOIN round_starts s ON s.player_id = a.player_id AND s.round_id = a.round_id
          WHERE a.round_id = ? GROUP BY a.player_id
         HAVING MAX(a.correct) = 1 OR COUNT(*) >= 4`,
      ),
      // Outcome per player who finished a round: solved on clue n, or missed (4 wrong).
      roundOutcomes: this.db.prepare<[string], { solved: number; n: number }>(
        `SELECT CASE WHEN MAX(correct) = 1 THEN MIN(CASE WHEN correct = 1 THEN n END) ELSE 0 END AS solved, COUNT(*) AS n
           FROM attempts WHERE round_id = ? GROUP BY player_id
         HAVING MAX(correct) = 1 OR COUNT(*) >= 4`,
      ),
      topWrong: this.db.prepare<[string], { place: string; n: number }>(
        'SELECT place, COUNT(*) AS n FROM attempts WHERE round_id = ? AND correct = 0 GROUP BY place ORDER BY n DESC, place LIMIT 3',
      ),
      leagueAttempts: this.db.prepare<[string, string], AttemptRow & { player_id: string }>(
        `SELECT a.player_id, a.round_id, a.n, a.place, a.correct FROM attempts a
           JOIN league_members m ON m.player_id = a.player_id AND m.league_id = ?
          WHERE a.date = ?`,
      ),
      insertLeague: this.db.prepare(
        'INSERT INTO leagues (id, name, invite_code, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
      ),
      leagueById: this.db.prepare<[string], LeagueRow>('SELECT id, name, invite_code FROM leagues WHERE id = ?'),
      leagueByCode: this.db.prepare<[string], LeagueRow>('SELECT id, name, invite_code FROM leagues WHERE invite_code = ?'),
      memberCount: this.db.prepare<[string], { n: number }>('SELECT COUNT(*) AS n FROM league_members WHERE league_id = ?'),
      upsertMember: this.db.prepare(
        `INSERT INTO league_members (league_id, player_id, display_name, joined_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (league_id, player_id) DO UPDATE SET display_name = excluded.display_name`,
      ),
      member: this.db.prepare<[string, string], { display_name: string }>(
        'SELECT display_name FROM league_members WHERE league_id = ? AND player_id = ?',
      ),
      members: this.db.prepare<[string], { player_id: string; display_name: string }>(
        'SELECT player_id, display_name FROM league_members WHERE league_id = ? ORDER BY joined_at',
      ),
      myLeagues: this.db.prepare<[string], LeagueRow & { my_name: string; members: number }>(
        `SELECT l.id, l.name, l.invite_code, m.display_name AS my_name,
                (SELECT COUNT(*) FROM league_members x WHERE x.league_id = l.id) AS members
           FROM league_members m JOIN leagues l ON l.id = m.league_id
          WHERE m.player_id = ? ORDER BY m.joined_at, l.rowid`,
      ),
      leagueCompletions: this.db.prepare<[string, string, string], { player_id: string; date: string; total: number }>(
        `SELECT c.player_id, c.date, c.total FROM completions c
           JOIN league_members m ON m.player_id = c.player_id AND m.league_id = ?
          WHERE c.date BETWEEN ? AND ?`,
      ),
      leagueGuesses: this.db.prepare<[string, string], { player_id: string; question_id: string; guess: number }>(
        `SELECT g.player_id, g.question_id, g.guess FROM guesses g
           JOIN league_members m ON m.player_id = g.player_id AND m.league_id = ?
          WHERE g.date = ?`,
      ),
    };
  }





  insertCompletion(playerId: string, date: string, total: number, at: number): void {
    this.stmts.insertCompletion.run(playerId, date, total, at);
  }

  getCompletion(playerId: string, date: string): number | undefined {
    return this.stmts.getCompletion.get(playerId, date)?.total;
  }

  rank(date: string, total: number): { players: number; below: number } {
    const r = this.stmts.rank.get(total, date)!;
    return { players: r.players, below: r.below ?? 0 };
  }


  // ---- leagues
  insertLeague(id: string, name: string, code: string, createdBy: string, at: number) {
    this.stmts.insertLeague.run(id, name, code, createdBy, at);
  }
  leagueById(id: string) {
    return this.stmts.leagueById.get(id);
  }
  leagueByCode(code: string) {
    return this.stmts.leagueByCode.get(code);
  }
  memberCount(leagueId: string): number {
    return this.stmts.memberCount.get(leagueId)!.n;
  }
  upsertMember(leagueId: string, playerId: string, name: string, at: number) {
    this.stmts.upsertMember.run(leagueId, playerId, name, at);
  }
  memberName(leagueId: string, playerId: string): string | undefined {
    return this.stmts.member.get(leagueId, playerId)?.display_name;
  }
  members(leagueId: string) {
    return this.stmts.members.all(leagueId);
  }
  myLeagues(playerId: string) {
    return this.stmts.myLeagues.all(playerId);
  }
  leagueCompletions(leagueId: string, from: string, to: string) {
    return this.stmts.leagueCompletions.all(leagueId, from, to);
  }
  leagueGuesses(leagueId: string, date: string) {
    return this.stmts.leagueGuesses.all(leagueId, date);
  }

  // ---- clue ladder
  insertAttempt(playerId: string, date: string, roundId: string, n: number, place: string, correct: boolean, at: number): boolean {
    return this.stmts.insertAttempt.run(playerId, date, roundId, n, place, correct ? 1 : 0, at).changes === 1;
  }
  playerAttempts(playerId: string, date: string): AttemptRow[] {
    return this.stmts.playerAttempts.all(playerId, date);
  }
  /** [solved on 1, 2, 3, 4, missed] among players who finished the round. */
  roundDist(roundId: string): [number, number, number, number, number] {
    const d: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    for (const r of this.stmts.roundOutcomes.all(roundId)) d[r.solved === 0 ? 4 : r.solved - 1]++;
    return d;
  }
  topWrong(roundId: string) {
    return this.stmts.topWrong.all(roundId);
  }
  /** Record that a player opened a round; the first call wins. */
  insertStart(playerId: string, date: string, roundId: string, at: number) {
    this.stmts.insertStart.run(playerId, date, roundId, at);
  }
  playerStarts(playerId: string, date: string): Map<string, number> {
    return new Map(this.stmts.playerStarts.all(playerId, date).map((r) => [r.round_id, r.started_at]));
  }
  roundResults(roundId: string) {
    return this.stmts.roundResults.all(roundId).map((r) => ({
      solvedAt: r.solved ?? 0,
      ms: r.solved_at !== null && r.started_at !== null ? Math.max(0, r.solved_at - r.started_at) : null,
    }));
  }
  leagueAttempts(leagueId: string, date: string) {
    return this.stmts.leagueAttempts.all(leagueId, date);
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  ping(): boolean {
    return this.stmts.ping.get() !== undefined;
  }

  close() {
    this.db.close();
  }
}
