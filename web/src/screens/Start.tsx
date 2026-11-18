import { formatLongDate } from '../../../shared/day';
import type { TodayResponse } from '../../../shared/types';
import { editionLabel } from '../components/TopBar';
import { Button, Pill, Wordmark } from '../components/ui';
import s from './screens.module.css';

export function Start({ today, started, onPlay, onHelp }: { today: TodayResponse; started: number; onPlay: () => void; onHelp: () => void }) {
  return (
    <div className={s.screen}>
      <div className={s.start}>
        <Wordmark size={44} />
        <h1 className={s.startTitle} tabIndex={-1} data-autofocus>
          Five countries. Four clues each. How few do you need?
        </h1>
        <p className={s.startMeta}>
          <Pill>{editionLabel(today.edition)}</Pill>
          <span>
            #{today.puzzle} · {formatLongDate(today.date)}
          </span>
        </p>
        <ol className={s.startClues} aria-hidden="true">
          <li>
            <span>Clue 1</span>Its national emblem is a harp.
          </li>
          <li>
            <span>Clue 4</span>Its capital is Dublin.
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
      <li>Each day there are five rounds. Each one is a country somewhere in the world, and you start with its hardest clue.</li>
      <li>Type your guess. Every wrong guess reveals an easier clue, up to four.</li>
      <li>The fewer clues you need, the more points: 100, 60, 30 or 10. 500 is a perfect day.</li>
    </ol>
  );
}
