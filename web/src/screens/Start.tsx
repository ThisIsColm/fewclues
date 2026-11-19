import { useState } from 'react';
import { formatShortDate } from '../../../shared/day';
import type { TodayResponse } from '../../../shared/types';
import { editionLabel } from '../components/TopBar';
import { Button, Sheet, Wordmark } from '../components/ui';
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

export function HowTo() {
  return (
    <ol className={sc.howto}>
      <li>Each day there are five rounds. Each one is a country somewhere in the world, and you start with its hardest clue.</li>
      <li>Type your guess. Every wrong guess reveals an easier clue, up to four.</li>
      <li>Fewer clues, faster answers and harder rounds score more. A perfect day is 1000.</li>
    </ol>
  );
}
