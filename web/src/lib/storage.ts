import type { Block } from '../../../shared/types';

const KEY = 'percentle.v1';

export interface DayRecord {
  puzzle: number;
  total: number;
  points: number[];
  signedErrors: number[]; // guess − answer, per question
  blocks: Block[];
}

export interface Cursor {
  date: string;
  index: number; // 0–4
  phase: 'question' | 'reveal';
}

export interface Saved {
  v: 1;
  playerId: string;
  history: Record<string, DayRecord>; // keyed by YYYY-MM-DD
  cursor?: Cursor;
  seenHelp?: boolean;
  /** Last display name used for a league, to prefill the next one. */
  displayName?: string;
  /** League last viewed. */
  leagueId?: string;
}

/** crypto.randomUUID needs a secure context; fall back for plain-http LAN testing. */
function uuid(): string {
  if (typeof crypto.randomUUID === 'function' && window.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (s && s.v === 1 && typeof s.playerId === 'string') return { ...s, history: s.history ?? {} };
    }
  } catch {
    /* corrupted or blocked storage — start fresh */
  }
  return { v: 1, playerId: uuid(), history: {} };
}

export function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota — the game still works for this session */
  }
}
