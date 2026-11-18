export type Difficulty = 'easy' | 'medium' | 'hard';
export type Status = 'draft' | 'approved';
export type Block = 'green' | 'yellow' | 'orange' | 'red';

/** A round exactly as stored in content/rounds.json. */
export interface Round {
  id: string;
  date: string; // YYYY-MM-DD, Europe/Dublin
  order: number; // 1–5
  edition: string;
  set: string; // place set id, e.g. "world-countries"
  answer: string; // place id
  category?: string;
  /** Four hand-written clues, hardest first. */
  clues: string[];
  /** Shown on the reveal. */
  fact: string;
  source_name: string;
  source_url: string;
  difficulty: Difficulty;
  status: Status;
}

export interface CrowdStats {
  /** Finishers by outcome: [solved on clue 1, 2, 3, 4, missed]. */
  dist: [number, number, number, number, number];
  players: number;
  /** Most common wrong guesses. */
  topWrong: { place: string; name: string; n: number }[];
}

/** One round as a given player currently sees it. Never contains unrevealed clues or the answer before it's done. */
export interface RoundView {
  id: string;
  order: number;
  category?: string;
  clues: string[]; // revealed so far
  wrong: string[]; // wrong place ids so far, in order
  done: boolean;
  reveal: RoundReveal | null;
}

export interface RoundReveal {
  answer: string; // place id
  answerName: string;
  solvedAt: number; // 1–4, 0 = missed
  points: number;
  block: Block;
  ladder: string[]; // all four clues
  fact: string;
  source_name: string;
  source_url: string;
  crowd: CrowdStats;
  /** "You beat X% of players on this round"; null until enough players. */
  beat: number | null;
}

export interface Completion {
  total: number;
  players: number;
  percentile: number | null;
  /** The round that stumped the most players today. */
  gapOfDay: { order: number; round_id: string; missedPct: number } | null;
}

export interface TodayResponse {
  date: string;
  puzzle: number; // 0 before launch
  launchDate: string;
  edition: string;
  editionName: string;
  flag: string;
  siteHost: string;
  nextRolloverAt: string;
  set: string;
  rounds: RoundView[];
  completion: Completion | null;
}

export interface GuessResponse {
  round: RoundView;
  completion: Completion | null;
  correct: boolean;
  alreadyDone: boolean;
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
  rank: number | null;
  name: string;
  isMe: boolean;
  total: number | null;
  blocks: Block[] | null;
  daysPlayed?: number;
}

export interface HeadToHead {
  mate: string;
  order: number;
  mySolved: number; // 1–4, 0 = missed
  mateSolved: number;
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
