import { Num } from '../components/Num';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { MAX_TOTAL } from '../../../shared/scoring';
import { shareText } from '../../../shared/share';
import type { Completion, RoundReveal, TodayResponse } from '../../../shared/types';
import { TopBar } from '../components/TopBar';
import { Button, Card, Icon, IconButton, toast } from '../components/ui';
import { clockSkew } from '../lib/api';
import { closeness } from '../lib/closeness';
import { celebrate } from '../lib/confetti';
import { haptic } from '../lib/haptics';
import { shareOrCopy } from '../lib/share';
import s from './screens.module.css';

export function Results(props: {
  today: TodayResponse;
  reveals: RoundReveal[];
  completion: Completion | null;
  streak: number;
  /** All-time share of rounds solved on the first clue, or null before any games. */
  firstClueRate: number | null;
  onOpenReveal: (index: number) => void;
  onLeagues: () => void;
  onStats: () => void;
  onHelp: () => void;
}) {
  const { today, reveals, completion } = props;
  const reduced = useReducedMotion() ?? false;
  const total = completion?.total ?? reveals.reduce((a, r) => a + r.points, 0);
  const [shownTotal, setShownTotal] = useState(reduced ? total : 0);
  const [tiles, setTiles] = useState(reduced ? 5 : 0);

  // Score counts up, then the tiles land one by one with a tick each. Tap to skip.
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setShownTotal(total), 60);
    return () => clearTimeout(t);
  }, [total, reduced]);
  useEffect(() => {
    if (tiles >= 5) return;
    const t = setTimeout(() => {
      setTiles((n) => n + 1);
      haptic('light', 0);
    }, tiles === 0 ? 350 : 110);
    return () => clearTimeout(t);
  }, [tiles]);
  useEffect(() => {
    if (total === MAX_TOTAL) void celebrate(true);
  }, [total]);
  const skip = () => {
    setShownTotal(total);
    setTiles(5);
  };

  const pct = completion?.percentile;
  const top = pct == null ? null : Math.max(1, 100 - pct);
  const gap = completion?.gapOfDay;

  async function share() {
    const text = shareText({ puzzle: today.puzzle, flag: today.flag, total, blocks: reveals.map((r) => r.block), siteHost: today.siteHost });
    const res = await shareOrCopy({ text });
    if (res === 'copied') toast('Result copied');
    if (res === 'failed') toast("Couldn't copy — try again");
  }

  return (
    <div className={`${s.screen} ${s.stack}`} onPointerDownCapture={skip} data-layout="wide">
      <TopBar
        puzzle={today.puzzle}
        edition={today.edition}
        streak={props.streak}
        right={
          <>
            <IconButton label="How to play" icon="help" onClick={props.onHelp} />
            <IconButton label="Your stats" icon="stats" onClick={props.onStats} />
            <IconButton label="Leagues" icon="league" onClick={props.onLeagues} />
          </>
        }
      />

      {/* Two columns on wide screens; a single column (same order) on phones. */}
      <div className={s.cols}>
      <div className={s.col}>
      <section className={s.hero} aria-labelledby="score-title">
        <div className={s.heroTop}>
          <h1 className={s.heroLabel} id="score-title" tabIndex={-1} data-autofocus>
            Today's score<span className="visually-hidden">: {total} out of {MAX_TOTAL}</span>
          </h1>
          {top !== null && <span className={s.topPill}>Top {top}%</span>}
        </div>
        <p className={s.score} aria-hidden="true">
          <Num value={shownTotal} transformTiming={{ duration: 550, easing: 'cubic-bezier(.2,.9,.3,1)' }} spinTiming={{ duration: 550, easing: 'cubic-bezier(.2,.9,.3,1)' }} />
          <small>/{MAX_TOTAL}</small>
        </p>
      </section>

      <ol className={s.tiles} aria-label="Your five answers">
        {reveals.map((r, i) => {
          const c = closeness(r.block);
          return (
            <li key={i} className={s.tile} aria-label={`Round ${i + 1}: ${r.points} points, ${r.solvedAt ? `solved on clue ${r.solvedAt}` : 'missed'}`}>
              <motion.span
                className={`${s.tileBox} ${s[c]}`}
                initial={false}
                animate={i < tiles ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 520, damping: 24 }}
                aria-hidden="true"
              >
                {r.points}
              </motion.span>
              <span className={s.tileOff} aria-hidden="true">
                {r.solvedAt ? `Clue ${r.solvedAt}` : 'Missed'}
              </span>
            </li>
          );
        })}
      </ol>
      </div>

      <div className={s.col}>
      <div className={s.stats2}>
        <Card>
          <p className={s.statLabel}>Streak</p>
          <p className={s.statValue}>
            {props.streak} {props.streak === 1 ? 'day' : 'days'}
          </p>
        </Card>
        <Card>
          <p className={s.statLabel}>First-clue hits</p>
          <p className={s.statValue}>{props.firstClueRate === null ? '—' : `${props.firstClueRate}%`}</p>
        </Card>
      </div>

      {gap && (
        <button type="button" className={s.gapRow} onClick={() => props.onOpenReveal(gap.order - 1)}>
          <span>
            <span className={s.gapTitle}>Gap of the day</span>
            <span className={s.gapText}>
              Round {gap.order} stumped {gap.missedPct}% of players
            </span>
          </span>
          <Icon name="chevron" />
        </button>
      )}

      <div className={s.buttons}>
        <Button onClick={share}>
          <Icon name="share" /> Share result
        </Button>
        <Button variant="secondary" onClick={props.onLeagues}>
          Challenge a friend
        </Button>
      </div>
      </div>
      </div>
      <Countdown to={today.nextRolloverAt} />
      <p className={s.privacy}>
        Privacy: no ads, no trackers, no accounts. Your browser keeps a random ID; we store your guesses to draw the crowd stats, and your
        league name only if you join a league.
      </p>
    </div>
  );
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now() + clockSkew);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + clockSkew), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Date.parse(to) - now;
  if (ms <= 0)
    return (
      <p className={s.countdown}>
        A new Few Clues is ready.{' '}
        <button type="button" className="link-btn" onClick={() => location.reload()}>
          Play it
        </button>
      </p>
    );
  const sec = Math.floor(ms / 1000);
  const hms = [sec / 3600, (sec % 3600) / 60, sec % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':');
  return (
    <p className={s.countdown}>
      Next Few Clues in <strong>{hms}</strong>
    </p>
  );
}
