import { Num } from '../components/Num';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { MAX_TOTAL, formatBias } from '../../../shared/scoring';
import { shareText } from '../../../shared/share';
import type { Completion, Reveal, TodayResponse } from '../../../shared/types';
import { TopBar } from '../components/TopBar';
import { Button, Card, Icon, IconButton, toast } from '../components/ui';
import { clockSkew } from '../lib/api';
import { closeness, closenessLabel } from '../lib/closeness';
import { celebrate } from '../lib/confetti';
import { fmt } from '../lib/format';
import { haptic } from '../lib/haptics';
import { shareOrCopy } from '../lib/share';
import s from './screens.module.css';

export function Results(props: {
  today: TodayResponse;
  reveals: Reveal[];
  completion: Completion | null;
  streak: number;
  bias: number | null;
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
    <div className={`${s.screen} ${s.stack}`} onPointerDownCapture={skip}>
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
            <li key={r.question_id} className={s.tile} aria-label={`Question ${i + 1}: ${r.points} points, ${closenessLabel[c]} (off by ${fmt(r.offBy)})`}>
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
                Off {fmt(r.offBy)}
              </span>
            </li>
          );
        })}
      </ol>

      <div className={s.stats2}>
        <Card>
          <p className={s.statLabel}>Streak</p>
          <p className={s.statValue}>
            {props.streak} {props.streak === 1 ? 'day' : 'days'}
          </p>
        </Card>
        <Card>
          <p className={s.statLabel}>Your bias</p>
          <p className={s.statValue}>{props.bias === null ? '—' : formatBias(props.bias)}</p>
        </Card>
      </div>

      <RoomCard today={today} reveals={reveals} />

      {gap && (
        <button type="button" className={s.gapRow} onClick={() => props.onOpenReveal(gap.order - 1)}>
          <span>
            <span className={s.gapTitle}>Gap of the day</span>
            <span className={s.gapText}>
              Question {gap.order} fooled {gap.fooledPct}% of players
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
      <Countdown to={today.nextRolloverAt} />
      <p className={s.privacy}>
        Privacy: no ads, no trackers, no accounts. Your browser keeps a random ID; we store your guesses to draw the crowd charts, and your
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
        A new Percentle is ready.{' '}
        <button type="button" className="link-btn" onClick={() => location.reload()}>
          Play it
        </button>
      </p>
    );
  const sec = Math.floor(ms / 1000);
  const hms = [sec / 3600, (sec % 3600) / 60, sec % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':');
  return (
    <p className={s.countdown}>
      Next Percentle in <strong>{hms}</strong>
    </p>
  );
}

/** Tonight's room: the players' own votes, next to the poll. Hidden until 9pm. */
function RoomCard({ today, reveals }: { today: TodayResponse; reveals: Reveal[] }) {
  const polls = today.questions.filter((q) => q.options);
  if (!polls.length) return null;
  const room = today.room;
  const at = new Date(room.revealAt).toLocaleTimeString('en-IE', { hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Dublin' });
  const shown = room.questions.filter((x) => x.pct !== null);
  let withRoom = 0;
  const rows = polls.map((q) => {
    const rq = room.questions.find((x) => x.question_id === q.id);
    const rv = reveals.find((x) => x.question_id === q.id);
    const majority = rq?.pct == null ? null : rq.pct >= 50 ? 0 : 1;
    if (majority !== null && rv?.vote === majority) withRoom++;
    return { q, rq, rv };
  });
  return (
    <section className={s.roomCard} aria-labelledby="roomcard-title">
      <div className={s.cardHead}>
        <h2 className={s.roomTitle} id="roomcard-title">
          The room
        </h2>
        <span className={s.cardMeta}>{room.revealed ? 'Revealed' : `Tonight at ${at}`}</span>
      </div>
      {!room.revealed || !shown.length ? (
        <p className={s.cardSub}>
          {room.revealed
            ? `Not enough votes yet (we need ${room.minVotes} per question).`
            : `See how Percentle players voted, next to the polls, tonight at ${at}.`}
        </p>
      ) : (
        <>
          <ul className={s.roomList}>
            {rows.map(({ q, rq, rv }) => (
              <li key={q.id}>
                <span className={s.roomQ}>
                  <b>Q{q.order}</b> {q.options![0]}?
                  {rv?.vote !== undefined && <i> You: {q.options![rv.vote]}</i>}
                </span>
                <span className={s.roomNums}>
                  <span>
                    Room <b className="num">{rq?.pct ?? '–'}%</b>
                  </span>
                  <span>
                    Poll <b className="num">{rv ? `${fmt(rv.answer)}%` : '–'}</b>
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className={s.cardSub}>
            You sided with the room on {withRoom} of {shown.length}.
          </p>
        </>
      )}
    </section>
  );
}
