import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
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
        <p className={s.sub}>Five countries a day · a few minutes</p>
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

/**
 * A mini round that plays itself once: clue 1, a wrong guess, an easier clue,
 * the right guess, then it stays on the finished state. Reduced motion shows
 * the finished example straight away.
 */
const STEPS = [1800, 900, 1000, 1800, 900, 2600]; // clue 1 · typing Wales · Wales ✕ · clue 2 · typing Ireland · Ireland ✓

function Example() {
  const reduced = useReducedMotion() ?? false;
  const [step, setStep] = useState(reduced ? 5 : 0);
  useEffect(() => {
    if (reduced || step >= STEPS.length - 1) return; // play once, then rest on the answer
    const t = setTimeout(() => setStep((x) => x + 1), STEPS[step]);
    return () => clearTimeout(t);
  }, [step, reduced]);

  const clue2 = step >= 3;
  const typed = step === 1 || step === 2 ? 'Wales' : step >= 4 ? 'Ireland' : '';
  const typing = step === 1 || step === 4;
  const verdict = step === 2 ? 'wrong' : step === 5 ? 'right' : null;

  return (
    <section className={s.example} aria-labelledby="ex-title">
      <div className={s.exHead}>
        <h2 id="ex-title">Example round</h2>
        <span className={s.exTag}>Example</span>
      </div>
      <p className="visually-hidden">
        Clue 1: Its national emblem is a harp. You guess Wales, which is wrong, so an easier clue appears. Clue 2: Its capital is Dublin.
        You guess Ireland, and get it on clue 2.
      </p>

      <div className={s.exBody} aria-hidden="true">
        <div className={`${s.exClue} ${clue2 ? s.exOld : ''}`}>
          <i>Clue 1</i>
          <span>Its national emblem is a harp.</span>
        </div>
        <AnimatePresence initial={false}>
          {clue2 && (
            <motion.div
              key="c2"
              className={s.exClue}
              initial={reduced ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            >
              <i>Clue 2</i>
              <span>Its capital is Dublin.</span>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className={`${s.exInput} ${verdict === 'wrong' ? s.exWrong : ''} ${verdict === 'right' ? s.exRight : ''}`}
          animate={verdict === 'wrong' && !reduced ? { x: [0, -8, 7, -5, 3, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <span className={s.exTyped}>
            {typed ? (
              <motion.span
                key={typed}
                initial={reduced || !typing ? false : { clipPath: 'inset(0 100% 0 0)' }}
                animate={{ clipPath: 'inset(0 0% 0 0)' }}
                transition={{ duration: 0.7, ease: 'linear' }}
              >
                {typed}
              </motion.span>
            ) : (
              <span className={s.exPlaceholder}>Type a country…</span>
            )}
            {typing && <span className={s.caret} />}
          </span>
          {verdict === 'wrong' && <Icon name="close" />}
          {verdict === 'right' && <Icon name="check" />}
        </motion.div>

        <p className={s.exNote}>
          {verdict === 'wrong'
            ? 'Wrong, so an easier clue appears'
            : verdict === 'right'
              ? 'Got it on clue 2'
              : clue2
                ? 'An easier clue'
                : 'You start with the hardest clue'}
        </p>
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
