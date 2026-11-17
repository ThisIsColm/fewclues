/**
 * Calendar logic for the daily puzzle. The puzzle day is the civil date in
 * Europe/Dublin, so it rolls over at local midnight whether Ireland is on
 * GMT (winter) or IST (summer, UTC+1).
 */
export const TIME_ZONE = 'Europe/Dublin';

const DAY_MS = 86_400_000;
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The puzzle date (YYYY-MM-DD) for an instant. */
export function dublinDate(now: Date): string {
  return dateFmt.format(now); // en-CA formats as YYYY-MM-DD
}

export function isIsoDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function dateToUtcMidnight(date: string): number {
  const m = ISO_DATE.exec(date);
  if (!m || !isIsoDate(date)) throw new Error(`Invalid date: ${date}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

/** Add whole calendar days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  return new Date(dateToUtcMidnight(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Calendar days from a to b (b − a). DST-proof: works on dates, not instants. */
export function daysBetween(a: string, b: string): number {
  return Math.round((dateToUtcMidnight(b) - dateToUtcMidnight(a)) / DAY_MS);
}

/** Puzzle number: launch day is #1, the next day #2, and so on. */
export function puzzleNumber(date: string, launchDate: string): number {
  return daysBetween(launchDate, date) + 1;
}

/** Offset of Dublin local time from UTC at an instant, in ms (0 or 3 600 000). */
function dublinOffsetMs(instant: number): number {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFmt.formatToParts(new Date(instant))) p[type] = +value;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The UTC instant at which a Dublin calendar date begins (local 00:00). */
export function startOfDublinDay(date: string): Date {
  const guess = dateToUtcMidnight(date);
  let instant = guess - dublinOffsetMs(guess);
  // Re-check in case the offset differs at the corrected instant.
  instant = guess - dublinOffsetMs(instant);
  return new Date(instant);
}

/** The instant the next puzzle unlocks. */
export function nextRollover(now: Date): Date {
  return startOfDublinDay(addDays(dublinDate(now), 1));
}

/** Format a YYYY-MM-DD date for display, e.g. "Tuesday 1 December 2026". */
export function formatLongDate(date: string, locale = 'en-IE'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(dateToUtcMidnight(date)));
}

/** Short display date, e.g. "Tue 1 Dec". */
export function formatShortDate(date: string, locale = 'en-IE'): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(dateToUtcMidnight(date)));
}

/** Monday of the week containing a date (weeks run Monday–Sunday, Dublin dates). */
export function weekStart(date: string): string {
  const dow = new Date(dateToUtcMidnight(date)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}
