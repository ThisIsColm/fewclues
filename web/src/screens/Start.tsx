import { useState } from 'react';
import { formatShortDate } from '../../../shared/day';
import type { TodayResponse } from '../../../shared/types';
import { editionLabel } from '../components/TopBar';
import { Button, Icon, Sheet, Wordmark } from '../components/ui';
import s from './Start.module.css';
import sc from './screens.module.css';

export function Start({ today, started, onPlay }: { today: TodayResponse; started: number; onPlay: () => void }) {
  const [privacy, setPrivacy] = useState(false);
  return (
    <div className={s.screen}>
      <header className={s.top}>
        <Wordmark size={30} />
      </header>

      <div className={s.middle}>
        <h1 className={s.title} tabIndex={-1} data-autofocus>
          How few clues do you need?
        </h1>
        <p className={s.sub}>Every miss unlocks an easier clue.</p>
        <Example />
      </div>

      <div className={s.bottom}>
        <p className={s.meta}>
          #{today.puzzle} · {formatShortDate(today.date)} · {editionLabel(today.edition)}
        </p>
        <Button variant="accent" onClick={onPlay}>
          {started ? `Continue (${started}/5)` : 'Play today’s five'}
        </Button>
        <button type="button" className={s.privacyLink} onClick={() => setPrivacy(true)}>
          Privacy
        </button>
      </div>

      <Sheet title="Privacy" open={privacy} onClose={() => setPrivacy(false)}>
        <p className={sc.cardSub}>
          No ads, no trackers, no accounts. Your browser keeps a random ID so you get one go a day. We store your guesses to work out the
          crowd stats, and your league name only if you join a league.
        </p>
      </Sheet>
    </div>
  );
}

/** A still, finished example round: clue 1 was missed (red ✕), clue 2 got it. */
function Example() {
  return (
    <section className={s.example} aria-labelledby="ex-title">
      <div className={s.exHead}>
        <h2 id="ex-title">Example round</h2>
        <span className={s.exTag}>Example</span>
      </div>
      <p className="visually-hidden">
        Clue 1: Its national emblem is a harp. A wrong guess reveals clue 2: Its capital is Dublin. The answer, Ireland, is found on clue 2.
      </p>
      <div className={s.exBody} aria-hidden="true">
        <div className={`${s.exClue} ${s.exOld}`}>
          <span className={s.exText}>
            <i>Clue 1</i>
            <span>Its national emblem is a harp.</span>
          </span>
          <span className={s.exMiss}>
            <Icon name="close" />
          </span>
        </div>
        <div className={s.exClue}>
          <span className={s.exText}>
            <i>Clue 2</i>
            <span>Its capital is Dublin.</span>
          </span>
        </div>
        <div className={`${s.exInput} ${s.exRight}`}>
          <span className={s.exTyped}>Ireland</span>
          <Icon name="check" />
        </div>
        <p className={s.exNote}>Got it on clue 2</p>
      </div>
    </section>
  );
}

export function HowTo() {
  return (
    <ol className={sc.howto}>
      <li>Each day there are five rounds. Each one is a country somewhere in the world, and you start with its hardest clue.</li>
      <li>Type your guess. Every wrong guess reveals an easier clue, up to four.</li>
      <li>Fewer clues, faster answers and harder rounds score more. A perfect day is 1000.</li>
    </ol>
  );
}
