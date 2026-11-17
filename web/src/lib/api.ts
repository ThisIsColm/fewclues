import type { GuessResponse, LeagueSummary, StandingsResponse, TodayResponse } from '../../../shared/types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/** Server clock minus client clock, in ms — keeps the countdown honest. */
export let clockSkew = 0;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
  } catch {
    throw new ApiError(0, "Couldn't reach Percentle. Check your connection and try again.");
  }
  const date = res.headers.get('date');
  if (date) clockSkew = Date.parse(date) - Date.now();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.code);
  return body as T;
}

const who = (playerId: string) => ({ headers: { 'X-Player-Id': playerId } });
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const getToday = (playerId: string) => request<TodayResponse>('/api/today', who(playerId));

export const postGuess = (playerId: string, questionId: string, guess: number) =>
  request<GuessResponse & { alreadyGuessed: boolean }>(
    '/api/guess',
    post({ player_id: playerId, question_id: questionId, guess }),
  );

export const getLeagues = (playerId: string) => request<{ leagues: LeagueSummary[] }>('/api/leagues', who(playerId));

export const createLeague = (playerId: string, name: string, displayName: string) =>
  request<{ league: LeagueSummary }>('/api/leagues', post({ player_id: playerId, name, display_name: displayName }));

export const joinLeague = (playerId: string, code: string, displayName: string) =>
  request<{ league: LeagueSummary; alreadyMember: boolean }>(
    '/api/leagues/join',
    post({ player_id: playerId, code, display_name: displayName }),
  );

export const previewInvite = (code: string) =>
  request<{ name: string; members: number; full: boolean }>(`/api/leagues/invite/${encodeURIComponent(code)}`);

export const getStandings = (playerId: string, leagueId: string, period: 'day' | 'week') =>
  request<StandingsResponse>(`/api/leagues/${encodeURIComponent(leagueId)}/standings?period=${period}`, who(playerId));
