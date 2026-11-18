import { Num } from '../components/Num';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { binLabel, missLabel, modeBin, verdictFor } from '../../../shared/scoring';
import type { Block, PublicQuestion, Reveal as RevealData, RoomQuestion } from '../../../shared/types';
import { Compare, Histogram } from '../components/Charts';
import { Progress } from '../components/Progress';
import { RevealGlass } from '../components/RevealGlass';
import { TopBar } from '../components/TopBar';
import { Button, Card, Icon, ui } from '../components/ui';
import { closeness } from '../lib/closeness';
import { celebrate } from '../lib/confetti';
import { fmt } from '../lib/format';
import { haptic } from '../lib/haptics';
import s from './screens.module.css';

const BEAT_MS = 250; // pause before the answer drops in
const LAND_MS = 260; // the verdict lands as the line settles (~0.5 s in)

export function Reveal(props: {
  q: PublicQuestion;
  r: RevealData;
  index: number;
  blocks: Block[];
  puzzle: number;
  edition: string;
  editionName: string;
  room?: RoomQuestion;
  roomRevealAt?: string;
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
  const miss = missLabel(r.guess, r.answer);
  const tier = closeness(r.block); // c1 ≤3 · c2 ≤10 · c3 ≤20 · c4 >20
  const wayOff = tier === 'c4';
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
    } else if (wayOff) haptic('error', 0);
    else haptic(tier === 'c1' ? 'success' : 'medium', 0);
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
        {q.options && r.vote !== undefined && <span className={s.youSaid}>You said {q.options[r.vote]}</span>}
      </p>

      {/* The result card takes the closeness colour the moment the verdict lands. */}
      <motion.section
        className={`${s.revealHero} ${showResult ? s[`tier_${tier}`] : ''}`}
        aria-label="Your result"
        animate={
          showResult && !skipped && !reduced
            ? r.bullseye
              ? { scale: [1, 1.05, 0.99, 1] }
              : tier === 'c1'
                ? { scale: [1, 1.03, 1] }
                : { scale: 1 }
            : { scale: 1 }
        }
        transition={{ duration: 0.38, ease: 'easeOut' }}
      >
        <motion.div
          className={s.revealGlassCol}
          animate={showResult && wayOff && !skipped && !reduced ? { x: [0, -12, 11, -9, 7, -4, 2, 0] } : { x: 0 }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
        >
          <RevealGlass guess={r.guess} answer={r.answer} phase={phase} skipped={skipped} />
        </motion.div>
        <div className={s.revealStats}>
          <h1
            className={s.verdictBig}
            tabIndex={-1}
            data-autofocus
            data-reveal
            aria-label={`${verdict}. ${miss.text}. ${r.points} points. You said ${r.guess}%, the answer is ${fmt(r.answer)}%.`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={showResult ? 'v' : 'p'}
                initial={skipped ? false : { y: 14, opacity: 0, scale: 0.92 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ type: 'spring', stiffness: 600, damping: 26 }}
                className={showResult ? '' : s.pendingText}
              >
                {showResult ? verdict : 'And the answer is…'}
              </motion.span>
            </AnimatePresence>
          </h1>
          <p className={`${s.missLine} ${showResult ? '' : s.pendingNum}`} aria-hidden="true">
            {miss.direction !== 'exact' && (
              <span className={s.arrow}>
                <Icon name={miss.direction === 'high' ? 'up' : 'down'} />
              </span>
            )}
            {miss.direction === 'exact' ? (
              <span className={s.missNum}>Spot on</span>
            ) : (
              <>
                <span className={s.missNum}>
                  <Num value={showResult ? r.offBy : 0} format={{ maximumFractionDigits: 1 }} />
                </span>
                <span className={s.missWord}>too {miss.direction}</span>
              </>
            )}
          </p>
          <span className={s.pts} aria-hidden="true">
            +<Num value={showResult ? r.points : 0} /> pts
          </span>
          <dl className={s.legendList} aria-hidden="true">
            <div>
              <dt>
                <i className={s.swGuess} /> You
              </dt>
              <dd className="num">{r.guess}%</dd>
            </div>
            <div>
              <dt>
                <i className={s.swAnswer} /> {q.options ? 'Poll' : 'Answer'}
              </dt>
              <dd className="num">{phase >= 1 ? `${fmt(r.answer)}%` : '··'}</dd>
            </div>
          </dl>
        </div>
      </motion.section>

      <motion.section
        className={`${ui.paper} ${s.fact}`}
        aria-labelledby="dyk-title"
        initial={skipped ? false : { opacity: 0, y: 12 }}
        animate={showResult ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34, delay: skipped ? 0 : 0.12 }}
      >
        <h2 className={ui.paperLabel} id="dyk-title">
          {q.options ? 'The poll' : 'Did you know?'}
        </h2>
        {q.options && (
          <p className={s.pollHeadline}>
            <b>{fmt(r.answer)}%</b> of {q.population} said {q.options[0]}.
          </p>
        )}
        <p className={s.nugget}>{r.nugget}</p>
        {r.pollster && (
          <p className={s.pollMeta}>
            {[r.pollster, r.fieldwork, r.sample ? `${r.sample.toLocaleString('en-IE')} asked` : null].filter(Boolean).join(' · ')}
          </p>
        )}
        <a className={s.sourceLink} href={r.source_url} target="_blank" rel="noopener noreferrer">
          <span>
            Source: <b>{r.source_name}</b>
            {r.source_name.includes(String(r.year)) ? '' : ` · ${r.year} data`}
          </span>
          <Icon name="external" />
        </a>
      </motion.section>

      {q.options && <SplitCard q={q} r={r} />}
      {q.options && <RoomTeaser q={q} room={props.room} revealAt={props.roomRevealAt} />}

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


      {r.comparisons.length > 0 && (
        <Card aria-labelledby="cmp-title">
          <h2 className={ui.cardTitle} id="cmp-title">
            {r.comparisons_title ?? `How ${props.editionName} compares`}
          </h2>
          <Compare home={q.options ? 'Everyone' : props.editionName} answer={r.answer} comparisons={r.comparisons} instant={skipped} />
        </Card>
      )}

      <div className={s.stickyNext}>
        <Button onClick={props.onNext}>{props.review ? 'Back to results' : last ? 'See results' : 'Next question'}</Button>
      </div>
    </div>
  );
}

/** False consensus: how each side of the vote predicted, against the real figure. */
function SplitCard({ q, r }: { q: PublicQuestion; r: RevealData }) {
  const opts = q.options!;
  if (!r.split)
    return (
      <Card aria-labelledby="split-title">
        <h2 className={ui.cardTitle} id="split-title">
          How each side guessed
        </h2>
        <p className={s.cardSub}>Not enough votes on each side yet. Check back later today.</p>
      </Card>
    );
  const [a, b] = r.split.avgByVote;
  const mine = r.vote;
  const row = (i: 0 | 1, avg: number) => (
    <li className={mine === i ? s.splitMine : ''}>
      <span className={s.splitLabel}>
        Said {opts[i]}
        {mine === i ? ' (you)' : ''}
      </span>
      <span className={s.splitTrack} aria-hidden="true">
        <i style={{ width: `${avg}%` }} />
        <b style={{ left: `${r.answer}%` }} />
      </span>
      <span className={`${s.splitVal} num`}>{avg}%</span>
    </li>
  );
  const gap = Math.abs(a - b);
  return (
    <Card aria-labelledby="split-title">
      <h2 className={ui.cardTitle} id="split-title">
        How each side guessed
      </h2>
      <ul className={s.split}>
        {row(0, a)}
        {row(1, b)}
      </ul>
      <p className={s.cardSub}>
        {gap >= 8
          ? `People assume others think like them: ${opts[0]} voters guessed ${gap} points higher than ${opts[1]} voters. The real figure was ${fmt(r.answer)}%.`
          : `Both sides read it about the same. The real figure was ${fmt(r.answer)}%.`}
      </p>
    </Card>
  );
}

/** "How this room voted": hidden until 9pm, then the players' own split next to the poll. */
function RoomTeaser({ q, room, revealAt }: { q: PublicQuestion; room?: RoomQuestion; revealAt?: string }) {
  if (!room) return null;
  const at = revealAt ? new Date(revealAt).toLocaleTimeString('en-IE', { hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Dublin' }) : '9pm';
  return (
    <Card aria-labelledby="room-title">
      <div className={s.cardHead}>
        <h2 className={ui.cardTitle} id="room-title">
          How the room voted
        </h2>
        <span className={s.cardMeta}>
          {room.votes.toLocaleString('en-IE')} {room.votes === 1 ? 'vote' : 'votes'}
        </span>
      </div>
      {room.pct === null ? (
        <p className={s.cardSub}>Revealed tonight at {at}. Come back to see if Percentle players think like the country.</p>
      ) : (
        <p className={s.cardSub}>
          <b className={s.roomPct}>{room.pct}%</b> of players said {q.options![0]}.
        </p>
      )}
    </Card>
  );
}
