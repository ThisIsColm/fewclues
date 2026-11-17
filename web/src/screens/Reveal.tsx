import { Num } from '../components/Num';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { binLabel, modeBin, verdictFor } from '../../../shared/scoring';
import type { Block, PublicQuestion, Reveal as RevealData } from '../../../shared/types';
import { Compare, Histogram } from '../components/Charts';
import { Progress } from '../components/Progress';
import { RevealGlass } from '../components/RevealGlass';
import { TopBar } from '../components/TopBar';
import { Button, Card, ui } from '../components/ui';
import { celebrate } from '../lib/confetti';
import { haptic } from '../lib/haptics';
import s from './screens.module.css';

const BEAT_MS = 400; // pause before the answer drops in
const LAND_MS = 380; // spring time for the drop

export function Reveal(props: {
  q: PublicQuestion;
  r: RevealData;
  index: number;
  blocks: Block[];
  puzzle: number;
  edition: string;
  editionName: string;
  streak: number;
  review: boolean;
  onNext: () => void;
}) {
  const { q, r, index } = props;
  const reduced = useReducedMotion() ?? false;
  // Phases: 0 = guess only, 1 = answer dropping, 2 = landed (points, verdict).
  const [phase, setPhase] = useState(reduced || props.review ? 2 : 0);
  const [skipped, setSkipped] = useState(reduced || props.review);
  const verdict = verdictFor(r.guess, r.answer);
  const last = index === 4;

  useEffect(() => {
    if (phase >= 2) return;
    const t1 = setTimeout(() => setPhase(1), BEAT_MS);
    const t2 = setTimeout(() => setPhase(2), BEAT_MS + LAND_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 2 || props.review) return;
    if (r.bullseye) {
      haptic('success', 0);
      void celebrate();
    } else haptic(verdict === 'Way off' ? 'light' : 'medium', 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Tap anywhere to skip the intro.
  const skip = () => {
    if (phase < 2) {
      setSkipped(true);
      setPhase(2);
    }
  };

  const total = r.histogram.reduce((a, b) => a + b, 0);
  const mode = modeBin(r.histogram);
  const tied = r.histogram.filter((n) => n === r.histogram[mode]).length > 1;
  const crowd =
    total <= 1 ? "You're the first to guess this one today." : tied ? 'Guesses are spread out — no clear favourite yet.' : `Most people went for ${binLabel(mode)}.`;
  const closer =
    r.closerThan === null || total <= 1
      ? ''
      : r.closerThan === 100
        ? ' Nobody got closer than you.'
        : r.closerThan === 0
          ? ' Everyone else was closer.'
          : ` You were closer than ${r.closerThan}% of players.`;
  const showResult = phase >= 2;

  return (
    <div className={`${s.screen} ${s.stack}`} onPointerDownCapture={skip}>
      <TopBar puzzle={props.puzzle} edition={props.edition} streak={props.streak} />
      <Progress blocks={props.blocks} current={index} />
      <p className={s.qSmall}>
        <span className="visually-hidden">Question {index + 1}: </span>
        {q.question}
      </p>

      <div className={s.resultRow}>
        <div>
          <span className={s.offLabel}>Off by</span>
          <h1 className={`${s.offNum} ${showResult ? '' : s.pendingNum}`} tabIndex={-1} data-autofocus aria-label={`Off by ${r.offBy}. ${verdict}. ${r.points} points.`}>
            <Num value={showResult ? r.offBy : 0} format={{ maximumFractionDigits: 1 }} />
          </h1>
        </div>
        <div className={s.resultRight} aria-hidden="true">
          <AnimatePresence>
            {showResult && (
              <motion.span
                className={`${s.verdict} ${r.bullseye ? s.verdictBullseye : ''}`}
                initial={skipped ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              >
                {verdict}
              </motion.span>
            )}
          </AnimatePresence>
          <span className={s.pts}>
            +<Num value={showResult ? r.points : 0} /> pts
          </span>
        </div>
      </div>

      <RevealGlass guess={r.guess} answer={r.answer} phase={phase} skipped={skipped} />

      <Card aria-labelledby="hist-title">
        <div className={s.cardHead}>
          <h2 className={ui.cardTitle} id="hist-title">
            Where everyone guessed
          </h2>
          <span className={s.cardMeta}>
            {total.toLocaleString('en-IE')} {total === 1 ? 'player' : 'players'}
          </span>
        </div>
        <Histogram bins={r.histogram} guess={r.guess} answer={r.answer} instant={skipped} />
        <p className={s.cardSub}>
          {crowd}
          {closer}
        </p>
      </Card>

      <section className={ui.paper} aria-labelledby="dyk-title">
        <h2 className={ui.paperLabel} id="dyk-title">
          Did you know?
        </h2>
        <p className={s.nugget}>{r.nugget}</p>
        <p className={s.source}>
          Source:{' '}
          <a href={r.source_url} target="_blank" rel="noopener noreferrer">
            {r.source_name}
          </a>{' '}
          · {r.year}
        </p>
      </section>

      {r.comparisons.length > 0 && (
        <Card aria-labelledby="cmp-title">
          <h2 className={ui.cardTitle} id="cmp-title">
            How {props.editionName} compares
          </h2>
          <Compare home={props.editionName} answer={r.answer} comparisons={r.comparisons} instant={skipped} />
        </Card>
      )}

      <div className={s.stickyNext}>
        <Button onClick={props.onNext}>{props.review ? 'Back to results' : last ? 'See results' : 'Next question'}</Button>
      </div>
    </div>
  );
}
