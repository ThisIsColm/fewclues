import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { HISTOGRAM_BINS } from '../shared/scoring';

export interface GuessRow {
  question_id: string;
  guess: number;
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
    `);
    this.stmts = {
      insertGuess: this.db.prepare(
        'INSERT OR IGNORE INTO guesses (player_id, date, question_id, guess, created_at) VALUES (?, ?, ?, ?, ?)',
      ),
      getGuess: this.db.prepare<[string, string], { guess: number }>(
        'SELECT guess FROM guesses WHERE player_id = ? AND question_id = ?',
      ),
      playerGuesses: this.db.prepare<[string, string], GuessRow>(
        'SELECT question_id, guess FROM guesses WHERE player_id = ? AND date = ?',
      ),
      histogram: this.db.prepare<[string], { bin: number; n: number }>(
        'SELECT MIN(guess / 10, 9) AS bin, COUNT(*) AS n FROM guesses WHERE question_id = ? GROUP BY bin',
      ),
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
      // How many guessers on a question were further off than `off`.
      further: this.db.prepare<[number, number, string], { players: number; further: number | null }>(
        'SELECT COUNT(*) AS players, SUM(ABS(guess - ?) > ? + 1e-9) AS further FROM guesses WHERE question_id = ?',
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

  /** Returns true if inserted, false if this player already guessed this question. */
  insertGuess(playerId: string, date: string, questionId: string, guess: number, at: number): boolean {
    return this.stmts.insertGuess.run(playerId, date, questionId, guess, at).changes === 1;
  }

  getGuess(playerId: string, questionId: string): number | undefined {
    return this.stmts.getGuess.get(playerId, questionId)?.guess;
  }

  playerGuesses(playerId: string, date: string): GuessRow[] {
    return this.stmts.playerGuesses.all(playerId, date);
  }

  histogram(questionId: string): number[] {
    const bins = new Array<number>(HISTOGRAM_BINS).fill(0);
    for (const { bin, n } of this.stmts.histogram.all(questionId)) bins[bin] = n;
    return bins;
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

  /** Players who guessed a question, and how many were further off than `off`. */
  further(questionId: string, answer: number, off: number): { players: number; further: number } {
    const r = this.stmts.further.get(answer, off, questionId)!;
    return { players: r.players, further: r.further ?? 0 };
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
