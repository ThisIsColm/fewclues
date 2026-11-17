import type { GuessResponse, TodayResponse } from '../../shared/types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/** Server clock minus client clock, in ms — keeps the countdown honest. */
export let clockSkew = 0;

async function request<T>(path: string, init: RequestInit): Promise<T> {
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

export const getToday = (playerId: string) =>
  request<TodayResponse>('/api/today', { headers: { 'X-Player-Id': playerId } });

export const postGuess = (playerId: string, questionId: string, guess: number) =>
  request<GuessResponse & { alreadyGuessed: boolean }>('/api/guess', {
    method: 'POST',
    body: JSON.stringify({ player_id: playerId, question_id: questionId, guess }),
  });
