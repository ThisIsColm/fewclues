import type { DayRecord } from '../lib/storage';
import s from './screens.module.css';

export function StatsBody({ history, today, current, max }: { history: Record<string, DayRecord>; today: string; current: number; max: number }) {
  const days = Object.entries(history);
  const played = days.length;
  const avg = played ? Math.round(days.reduce((a, [, r]) => a + r.total, 0) / played) : null;
  const solves = days.flatMap(([, r]) => r.solved ?? []);
  const firstRate = solves.length ? Math.round((solves.filter((x) => x === 1).length / solves.length) * 100) : null;
  const missRate = solves.length ? Math.round((solves.filter((x) => x === 0).length / solves.length) * 100) : null;
  const bands = ['0–199', '200–399', '400–599', '600–799', '800–1000'];
  const counts = bands.map(() => 0);
  for (const [, r] of days) counts[Math.min(4, Math.floor(r.total / 200))]++;
  const top = Math.max(1, ...counts);
  const todayBand = history[today] ? Math.min(4, Math.floor(history[today].total / 200)) : -1;
  const tile = (v: string | number, label: string) => (
    <div>
      <p className={s.statValue}>{v}</p>
      <p className={s.statLabel}>{label}</p>
    </div>
  );
  return (
    <>
      <div className={s.tilesStats}>
        {tile(played, 'Played')}
        {tile(avg ?? '—', 'Average')}
        {tile(current, 'Streak')}
        {tile(max, 'Best')}
      </div>
      <h3 className={s.sheetSub}>Score distribution</h3>
      <ul className={s.dist}>
        {bands.map((b, i) => (
          <li key={b} className={i === todayBand ? s.today : ''}>
            <span>{b}</span>
            <span aria-hidden="true">
              <i style={{ width: counts[i] ? `${Math.max(4, (counts[i] / top) * 100)}%` : '3px' }} />
            </span>
            <span className="num">{counts[i]}</span>
          </li>
        ))}
      </ul>
      <h3 className={s.sheetSub}>Clues</h3>
      <p className={s.statLabel} style={{ marginTop: 6, fontSize: 15, color: 'var(--text-2)' }}>
        {firstRate === null
          ? 'Play a game to see how many clues you usually need.'
          : `You get ${firstRate}% of rounds from the first clue, and miss ${missRate}%.`}
      </p>
    </>
  );
}
