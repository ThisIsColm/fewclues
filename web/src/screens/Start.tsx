import { formatLongDate } from '../../../shared/day';
import type { TodayResponse } from '../../../shared/types';
import { Button, Pill, Wordmark } from '../components/ui';
import s from './screens.module.css';

export function Start({ today, started, onPlay, onHelp }: { today: TodayResponse; started: number; onPlay: () => void; onHelp: () => void }) {
  return (
    <div className={s.screen}>
      <div className={s.start}>
        <Wordmark size={44} />
        <h1 className={s.startTitle} tabIndex={-1} data-autofocus>
          Five clues. Five counties. How few do you need?
        </h1>
        <p className={s.startMeta}>
          <Pill>{today.edition.toUpperCase()}</Pill>
          <span>
            #{today.puzzle} · {formatLongDate(today.date)}
          </span>
        </p>
        <ol className={s.startClues} aria-hidden="true">
          <li>
            <span>Clue 1</span>Ireland’s highest mountain range is here.
          </li>
          <li>
            <span>Clue 2</span>It’s in Munster.
          </li>
        </ol>
        <Button onClick={onPlay}>{started ? `Continue (${started}/5)` : 'Play'}</Button>
        <Button variant="ghost" onClick={onHelp}>
          How to play
        </Button>
      </div>
      <p className={s.privacy}>
        Privacy: no ads, no trackers, no accounts. Your browser keeps a random ID; we store your guesses to draw the crowd stats, and your
        league name only if you join a league.
      </p>
    </div>
  );
}

export function HowTo() {
  return (
    <ol className={s.howto}>
      <li>Each day there are five rounds. Each one is a county of Ireland, and you get one clue to start.</li>
      <li>Type your guess. Every wrong guess reveals an easier clue, up to four.</li>
      <li>The fewer clues you need, the more points: 100, 60, 30 or 10. 500 is a perfect day.</li>
    </ol>
  );
}
