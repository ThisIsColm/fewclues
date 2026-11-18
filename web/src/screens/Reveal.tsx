import { motion, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';
import { verdictForSolve } from '../../../shared/ladder';
import { PLACE_SETS, placeById } from '../../../shared/places';
import type { Block, RoundView } from '../../../shared/types';
import { Num } from '../components/Num';
import { Progress } from '../components/Progress';
import { TopBar } from '../components/TopBar';
import { Button, Card, Icon, ui } from '../components/ui';
import { celebrate } from '../lib/confetti';
import { haptic } from '../lib/haptics';
import s from './screens.module.css';
import r from './Reveal.module.css';

/** Tier colour for the result card: first clue, second, third/fourth, missed. */
const tierFor = (solvedAt: number) => (solvedAt === 1 ? 'c1' : solvedAt === 2 ? 'c2' : solvedAt === 0 ? 'c4' : 'c3');

export function Reveal(props: {
  round: RoundView;
  index: number;
  set: string;
  blocks: Block[];
  puzzle: number;
  edition: string;
  streak: number;
  review: boolean;
  onNext: () => void;
}) {
  const { round, index } = props;
  const rv = round.reveal!;
  const set = PLACE_SETS[props.set];
  const reduced = useReducedMotion() ?? false;
  const tier = tierFor(rv.solvedAt);
  const animate = !props.review && !reduced;
  const last = index === 4;

  useEffect(() => {
    if (props.review) return;
    if (rv.solvedAt === 1) void celebrate();
    if (rv.solvedAt === 0) haptic('heavy', 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = rv.crowd.players;
  const labels = ['Clue 1', 'Clue 2', 'Clue 3', 'Clue 4', 'Missed'];
  const mine = rv.solvedAt === 0 ? 4 : rv.solvedAt - 1;
  const max = Math.max(1, ...rv.crowd.dist);
  const topWrong = rv.crowd.topWrong[0];
  const verdict = verdictForSolve(rv.solvedAt);

  return (
    <div className={`${s.screen} ${s.stack}`}>
      <TopBar puzzle={props.puzzle} edition={props.edition} streak={props.streak} />
      <Progress blocks={props.blocks} current={index} />

      <motion.section
        className={`${r.hero} ${r[`tier_${tier}`]}`}
        aria-label="Your result"
        initial={animate ? { scale: 0.96, opacity: 0 } : false}
        animate={
          animate && rv.solvedAt === 0
            ? { scale: 1, opacity: 1, x: [0, -12, 11, -8, 6, -3, 0] }
            : animate && rv.solvedAt === 1
              ? { opacity: 1, scale: [0.96, 1.04, 1] }
              : { scale: 1, opacity: 1 }
        }
        transition={{ duration: 0.42, ease: 'easeOut' }}
      >
        <p className={r.verdict}>{verdict}</p>
        <h1 className={r.answer} tabIndex={-1} data-autofocus data-reveal aria-label={`${verdict} The answer is ${rv.answerName}. ${rv.points} points.`}>
          {rv.answerName}
        </h1>
        <p className={r.pts} aria-hidden="true">
          +<Num value={rv.points} /> pts
        </p>
        {round.wrong.length > 0 && (
          <p className={r.tries}>
            Your guesses:{' '}
            {round.wrong.map((id) => (
              <span key={id} className={r.triedWrong}>
                {placeById(set, id)?.name ?? id}
              </span>
            ))}
            {rv.solvedAt > 0 && <span className={r.triedRight}>{rv.answerName}</span>}
          </p>
        )}
      </motion.section>

      <motion.section
        className={`${ui.paper} ${s.fact}`}
        aria-labelledby="dyk-title"
        initial={animate ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34, delay: animate ? 0.15 : 0 }}
      >
        <h2 className={ui.paperLabel} id="dyk-title">
          Did you know?
        </h2>
        <p className={s.nugget}>{rv.fact}</p>
        <a className={s.sourceLink} href={rv.source_url} target="_blank" rel="noopener noreferrer">
          <span>
            Source: <b>{rv.source_name}</b>
          </span>
          <Icon name="external" />
        </a>
      </motion.section>

      <Card aria-labelledby="crowd-title">
        <div className={s.cardHead}>
          <h2 className={ui.cardTitle} id="crowd-title">
            How everyone did
          </h2>
          <span className={s.cardMeta}>
            {total.toLocaleString('en-IE')} {total === 1 ? 'player' : 'players'}
          </span>
        </div>
        <ul className={r.dist}>
          {rv.crowd.dist.map((n, i) => (
            <li key={i} className={i === mine ? r.distMine : ''}>
              <span>
                {labels[i]}
                {i === mine ? <span className="visually-hidden"> (you)</span> : null}
              </span>
              <span className={r.distTrack} aria-hidden="true">
                <motion.i
                  style={{ width: `${n ? Math.max(3, (n / max) * 100) : 0}%`, originX: 0 }}
                  initial={animate ? { scaleX: 0 } : false}
                  animate={{ scaleX: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 28, delay: animate ? 0.2 + i * 0.04 : 0 }}
                />
              </span>
              <span className="num">{total ? `${Math.round((n / total) * 100)}%` : '–'}</span>
            </li>
          ))}
        </ul>
        <p className={s.cardSub}>
          {total <= 1
            ? "You're the first to finish this round today."
            : rv.beat === null
              ? `${Math.round((rv.crowd.dist[0] / total) * 100)}% got it from the first clue.`
              : rv.beat === 100
                ? 'Nobody did better than you.'
                : `You did better than ${rv.beat}% of players.`}
          {topWrong ? ` Most common wrong guess: ${topWrong.name}.` : ''}
        </p>
      </Card>

      <Card aria-labelledby="ladder-title">
        <h2 className={ui.cardTitle} id="ladder-title">
          The clues
        </h2>
        <ol className={r.ladder}>
          {rv.ladder.map((c, i) => (
            <li key={i} className={rv.solvedAt === i + 1 ? r.ladderHit : ''}>
              <span className={r.ladderNo}>{i + 1}</span>
              <span>{c}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className={s.stickyNext}>
        <Button onClick={props.onNext}>{props.review ? 'Back to results' : last ? 'See results' : 'Next round'}</Button>
      </div>
    </div>
  );
}
