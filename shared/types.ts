export type Difficulty = 'easy' | 'medium' | 'hard';
export type Status = 'draft' | 'approved';

export interface Comparison {
  label: string;
  value: number;
}

/** A question exactly as stored in content/questions.json. */
export interface Question {
  id: string;
  date: string; // YYYY-MM-DD, Europe/Dublin
  order: number; // 1–5
  edition: string;
  question: string;
  answer: number;
  year: number;
  source_name: string;
  source_url: string;
  nugget: string;
  comparisons?: Comparison[];
  difficulty: Difficulty;
  status: Status;
  /** Optional short topic shown above the question, e.g. "Travel". */
  category?: string;
}

/** What the client sees before guessing — never includes the answer. */
export interface PublicQuestion {
  id: string;
  order: number;
  question: string;
  category?: string;
}

export type Block = 'green' | 'yellow' | 'orange' | 'red';

/** Everything the client is told after locking in a guess. */
export interface Reveal {
  question_id: string;
  order: number;
  guess: number;
  answer: number;
  offBy: number;
  signedError: number; // guess − answer
  points: number;
  bullseye: boolean;
  block: Block;
  year: number;
  source_name: string;
  source_url: string;
  nugget: string;
  comparisons: Comparison[];
  histogram: number[]; // 10 bins of crowd guesses
  /** "You were closer than X% of players" on this question; null until enough players. */
  closerThan: number | null;
}

export interface Completion {
  total: number;
  players: number; // players who finished today
  /** "You beat X% of today's players" — null until enough players finished. */
  percentile: number | null;
  /** The question today's crowd got most wrong (share off by more than 10). */
  gapOfDay: { order: number; question_id: string; fooledPct: number } | null;
}

export interface TodayResponse {
  date: string;
  puzzle: number; // 0 before launch
  launchDate: string;
  edition: string;
  editionName: string;
  flag: string;
  siteHost: string;
  nextRolloverAt: string; // ISO instant
  questions: PublicQuestion[];
  reveals: Reveal[]; // guesses this player already made today, in order
  completion: Completion | null;
}

export interface GuessResponse {
  reveal: Reveal;
  completion: Completion | null;
}

// ---------------------------------------------------------------- leagues

export interface LeagueSummary {
  id: string;
  name: string;
  code: string;
  members: number;
  myName: string;
}

export interface StandingRow {
  rank: number | null; // null = not finished (day) / not played (week)
  name: string;
  isMe: boolean;
  total: number | null;
  blocks: Block[] | null; // day view, once that member has finished
  daysPlayed?: number; // week view
}

export interface HeadToHead {
  mate: string;
  order: number;
  myOff: number;
  mateOff: number;
  mateBetter: boolean;
}

export interface StandingsResponse {
  league: LeagueSummary;
  period: 'day' | 'week';
  from: string;
  to: string;
  viewerFinished: boolean;
  rows: StandingRow[];
  headToHead: HeadToHead | null;
}
