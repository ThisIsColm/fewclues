import { readFileSync, statSync } from 'node:fs';
import { dublinDate } from '../shared/day';
import type { Round } from '../shared/types';
import { ROUNDS_PER_DAY, validateContent } from '../shared/validate';

/**
 * Playable rounds in memory. Re-reads the file when it changes (checked at
 * most every 30 s); a bad edit is logged and the last good content kept.
 */
export class ContentStore {
  private byDate = new Map<string, Round[]>();
  private byId = new Map<string, Round>();
  private mtimeMs = 0;
  private lastCheck = 0;

  constructor(
    private path: string,
    private edition: string,
    private allowDrafts: boolean,
    private log: (msg: string) => void = console.log,
  ) {
    if (!this.reload()) throw new Error(`Content in ${path} failed validation; refusing to start`);
  }

  static fromRounds(rounds: Round[], edition: string, allowDrafts: boolean): ContentStore {
    const store = Object.create(ContentStore.prototype) as ContentStore;
    Object.assign(store, { byDate: new Map(), byId: new Map(), path: '', edition, allowDrafts, mtimeMs: 0, lastCheck: Infinity, log: () => {} });
    store.index(rounds);
    return store;
  }

  private index(rounds: Round[]) {
    const byDate = new Map<string, Round[]>();
    const byId = new Map<string, Round>();
    for (const r of rounds) {
      if (r.edition !== this.edition) continue;
      if (r.status !== 'approved' && !(this.allowDrafts && r.status === 'draft')) continue;
      byId.set(r.id, r);
      byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
    }
    for (const list of byDate.values()) list.sort((a, b) => a.order - b.order);
    this.byDate = byDate;
    this.byId = byId;
  }

  reload(): boolean {
    try {
      const mtimeMs = statSync(this.path).mtimeMs;
      const { errors, warnings, rounds } = validateContent(JSON.parse(readFileSync(this.path, 'utf8')), {
        today: dublinDate(new Date()),
        allowDrafts: this.allowDrafts,
      });
      for (const w of warnings) this.log(`content warning: ${w}`);
      if (errors.length) {
        for (const e of errors) this.log(`content ERROR: ${e}`);
        return false;
      }
      this.index(rounds);
      this.mtimeMs = mtimeMs;
      this.log(`content: loaded ${this.byId.size} playable rounds over ${this.byDate.size} days${this.allowDrafts ? ' (drafts allowed)' : ''}`);
      return true;
    } catch (e) {
      this.log(`content ERROR: ${(e as Error).message}`);
      return false;
    }
  }

  private maybeReload() {
    const now = Date.now();
    if (now - this.lastCheck < 30_000) return;
    this.lastCheck = now;
    try {
      if (statSync(this.path).mtimeMs !== this.mtimeMs) this.reload();
    } catch {
      /* keep serving */
    }
  }

  forDate(date: string): Round[] {
    this.maybeReload();
    const list = this.byDate.get(date) ?? [];
    return list.length === ROUNDS_PER_DAY ? list : [];
  }

  get(id: string): Round | undefined {
    this.maybeReload();
    return this.byId.get(id);
  }
}
