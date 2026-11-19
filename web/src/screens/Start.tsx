import { formatLongDate } from '../../../shared/day';
import type { TodayResponse } from '../../../shared/types';
import { editionLabel } from '../components/TopBar';
import { Button, Icon, Pill, Wordmark } from '../components/ui';
import s from './screens.module.css';

export function Start({ today, started, onPlay, onHelp }: { today: TodayResponse; started: number; onPlay: () => void; onHelp: () => void }) {
  return (
    <div className={s.screen}>
      <div className={s.start}>
        <Wordmark size={40} />
        <h1 className={s.startTitle} tabIndex={-1} data-autofocus>
          Five countries. Four clues each. How few do you need?
        </h1>
        <p className={s.startMeta}>
          <Pill>{editionLabel(today.edition)}</Pill>
          <span>
            #{today.puzzle} · {formatLongDate(today.date)}
          </span>
        </p>
        <section className={s.example} aria-labelledby="example-title">
          <div className={s.exampleHead}>
            <h2 id="example-title">How it works</h2>
            <span className={s.exampleTag}>Example</span>
          </div>
          <ol className={s.exSteps}>
            <li>
              <span className={s.exClue}>
                <i>Clue 1</i>Its national emblem is a harp.
              </span>
              <span className={s.exGuess}>
                You guess <b className={s.exWrong}>Wales</b>
                <Icon name="close" />
                <em>Wrong, so an easier clue appears</em>
              </span>
            </li>
            <li>
              <span className={s.exClue}>
                <i>Clue 2</i>Its capital is Dublin.
              </span>
              <span className={s.exGuess}>
                You guess <b>Ireland</b>
                <Icon name="check" />
                <em>Got it on clue 2: +60 pts</em>
              </span>
            </li>
          </ol>
          <p className={s.exPoints}>
            Points by clue: <b>100</b> · <b>60</b> · <b>30</b> · <b>10</b>
          </p>
        </section>
        <Button variant="accent" onClick={onPlay}>
          {started ? `Continue (${started}/5)` : 'Play today’s five'}
        </Button>
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
