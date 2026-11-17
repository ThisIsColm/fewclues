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
          How well do you know {today.editionName}?
        </h1>
        <p className={s.startMeta}>
          <Pill>{today.edition.toUpperCase()}</Pill>
          <span>
            #{today.puzzle} · {formatLongDate(today.date)}
          </span>
        </p>
        <div className={s.startGlass} aria-hidden="true">
          <div>
            <svg viewBox="0 0 200 20" preserveAspectRatio="none">
              <path d="M0 10 Q12.5 5 25 10 T50 10 T75 10 T100 10 T125 10 T150 10 T175 10 T200 10 V20 H0 Z" />
            </svg>
          </div>
          <strong className="num">46%</strong>
        </div>
        <Button onClick={onPlay}>{started ? `Continue (${started}/5)` : 'Play'}</Button>
        <Button variant="ghost" onClick={onHelp}>
          How to play
        </Button>
      </div>
      <p className={s.privacy}>
        Privacy: no ads, no trackers, no accounts. Your browser keeps a random ID; we store your guesses to draw the crowd charts, and your
        league name only if you join a league.
      </p>
    </div>
  );
}

export function HowTo({ editionName }: { editionName: string }) {
  return (
    <ol className={s.howto}>
      <li>Five questions a day about {editionName}: “What % of people…?”</li>
      <li>Drag up or down on the glass to pour your guess, then lock it in.</li>
      <li>The closer you get, the more points: up to 100 a question, 500 a day.</li>
    </ol>
  );
}
