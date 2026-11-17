import { readFileSync, statSync } from 'node:fs';
import { dublinDate } from '../shared/day';
import type { Question } from '../shared/types';
import { validateContent } from '../shared/validate';

/**
 * Holds the playable questions in memory. Re-reads the file when it changes
 * (checked at most once every 30 s), so new questions go live without a
 * restart. A bad edit is logged and the previous good content is kept.
 */
export class ContentStore {
  private byDate = new Map<string, Question[]>();
  private byId = new Map<string, Question>();
  private mtimeMs = 0;
  private lastCheck = 0;

  constructor(
    private path: string,
    private edition: string,
    private allowDrafts: boolean,
    private log: (msg: string) => void = console.log,
  ) {
    const ok = this.reload();
    if (!ok) throw new Error(`Content in ${path} failed validation; refusing to start`);
  }

  /** Build directly from an array (tests). */
  static fromQuestions(questions: Question[], edition: string, allowDrafts: boolean): ContentStore {
    const store = Object.create(ContentStore.prototype) as ContentStore;
    Object.assign(store, { byDate: new Map(), byId: new Map(), path: '', edition, allowDrafts, mtimeMs: 0, lastCheck: Infinity, log: () => {} });
    store.index(questions);
    return store;
  }

  private index(questions: Question[]) {
    const byDate = new Map<string, Question[]>();
    const byId = new Map<string, Question>();
    for (const q of questions) {
      if (q.edition !== this.edition) continue;
      if (q.status !== 'approved' && !(this.allowDrafts && q.status === 'draft')) continue;
      byId.set(q.id, q);
      const list = byDate.get(q.date) ?? [];
      list.push(q);
      byDate.set(q.date, list);
    }
    for (const list of byDate.values()) list.sort((a, b) => a.order - b.order);
    this.byDate = byDate;
    this.byId = byId;
  }

  reload(): boolean {
    try {
      const mtimeMs = statSync(this.path).mtimeMs;
      const data = JSON.parse(readFileSync(this.path, 'utf8'));
      const { errors, warnings, questions } = validateContent(data, {
        today: dublinDate(new Date()),
        allowDrafts: this.allowDrafts,
      });
      for (const w of warnings) this.log(`content warning: ${w}`);
      if (errors.length) {
        for (const e of errors) this.log(`content ERROR: ${e}`);
        return false;
      }
      this.index(questions);
      this.mtimeMs = mtimeMs;
      this.log(`content: loaded ${this.byId.size} playable questions over ${this.byDate.size} days${this.allowDrafts ? ' (drafts allowed)' : ''}`);
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
      /* keep serving what we have */
    }
  }

  /** The day's five questions in order, or [] if the day isn't complete. */
  forDate(date: string): Question[] {
    this.maybeReload();
    const list = this.byDate.get(date) ?? [];
    return list.length === 5 ? list : [];
  }

  get(id: string): Question | undefined {
    this.maybeReload();
    return this.byId.get(id);
  }
}
