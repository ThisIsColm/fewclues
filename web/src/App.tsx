import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, formatLongDate } from '../../shared/day';
import { QUESTIONS_PER_DAY } from '../../shared/scoring';
import { streaks } from '../../shared/streak';
import type { Block, Completion, GuessResponse, LeagueSummary, RoundView, TodayResponse } from '../../shared/types';
import { Button, Sheet, ToastHost, Wordmark } from './components/ui';
import { getToday, previewInvite } from './lib/api';
import { load, save, type Saved } from './lib/storage';
import { LeagueForms, Leagues } from './screens/Leagues';
import { Results } from './screens/Results';
import { Reveal } from './screens/Reveal';
import { Round } from './screens/Round';
import { HowTo, Start } from './screens/Start';
import { StatsBody } from './screens/StatsSheet';
import s from './screens/screens.module.css';

type Route =
  | { name: 'loading' }
  | { name: 'message'; title: string; body: string; retry?: boolean }
  | { name: 'start' }
  | { name: 'round'; index: number }
  | { name: 'reveal'; index: number; review?: boolean }
  | { name: 'results' }
  | { name: 'leagues'; back: Route };

const routeKey = (r: Route) => ('index' in r ? `${r.name}-${r.index}` : r.name);

export function App() {
  const stateRef = useRef<Saved>(load());
  const st = stateRef.current;
  const persist = useCallback(() => save(stateRef.current), []);
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [rounds, setRounds] = useState<RoundView[]>([]);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'loading' });
  const [sheet, setSheet] = useState<'help' | 'stats' | null>(null);
  const [invite, setInvite] = useState<{ code: string; name: string; members: number; full: boolean } | null>(null);
  const [, bump] = useState(0);

  // ---------------------------------------------------------------- navigation
  const go = useCallback(
    (r: Route) => {
      if (today && (r.name === 'round' || (r.name === 'reveal' && !r.review))) {
        stateRef.current.cursor = { date: today.date, index: r.index, phase: r.name === 'round' ? 'question' : 'reveal' };
        persist();
      }
      if (today && r.name === 'results') {
        stateRef.current.cursor = { date: today.date, index: QUESTIONS_PER_DAY, phase: 'question' };
        persist();
      }
      setRoute(r);
      window.scrollTo(0, 0);
    },
    [today, persist],
  );

  /** Mirror the finished day into local history (streaks, stats). */
  const record = useCallback(
    (t: TodayResponse, rs: RoundView[], c: Completion | null) => {
      if (!c || !rs.length || !rs.every((r) => r.reveal)) return;
      stateRef.current.history[t.date] = {
        puzzle: t.puzzle,
        total: c.total,
        points: rs.map((r) => r.reveal!.points),
        solved: rs.map((r) => r.reveal!.solvedAt),
        blocks: rs.map((r) => r.reveal!.block),
      };
      persist();
    },
    [persist],
  );

  // ---------------------------------------------------------------- boot
  useEffect(() => {
    void (async () => {
      const join = new URLSearchParams(location.search).get('join');
      let t: TodayResponse;
      try {
        t = await getToday(st.playerId);
      } catch (e) {
        setRoute({ name: 'message', title: 'Few Clues', body: (e as Error).message, retry: true });
        return;
      }
      setToday(t);
      setRounds(t.rounds);
      setCompletion(t.completion);
      record(t, t.rounds, t.completion);
      if (st.cursor && st.cursor.date !== t.date) delete st.cursor;
      const cutoff = addDays(t.date, -400);
      for (const d of Object.keys(st.history)) if (d < cutoff) delete st.history[d];
      persist();

      if (join) {
        history.replaceState(null, '', location.pathname);
        previewInvite(join)
          .then((p) => setInvite({ code: join.toUpperCase(), ...p }))
          .catch(() => setInvite({ code: join.toUpperCase(), name: '', members: 0, full: false }));
      }
      if (t.date < t.launchDate) {
        setRoute({ name: 'message', title: 'Coming soon', body: `The first Few Clues is on ${formatLongDate(t.launchDate)}.` });
        return;
      }
      if (!t.rounds.length) {
        setRoute({ name: 'message', title: 'No puzzle today', body: 'Today’s rounds aren’t ready yet. Check back soon.' });
        return;
      }
      // Resume: an unfinished round, else the reveal you were reading, else results.
      const firstOpen = t.rounds.findIndex((r) => !r.done);
      const c = st.cursor;
      const started = t.rounds.some((r) => r.done || r.wrong.length) || c;
      if (c?.phase === 'reveal' && t.rounds[c.index]?.done && (firstOpen === -1 || firstOpen === c.index + 1))
        setRoute({ name: 'reveal', index: c.index });
      else if (firstOpen === -1) setRoute({ name: 'results' });
      else if (started) setRoute({ name: 'round', index: firstOpen });
      else setRoute({ name: 'start' });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move focus to the new screen's heading for screen-reader users (unless they've already moved on).
  useEffect(() => {
    const t = setTimeout(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected) return; // the user is already somewhere
      document.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    }, 320);
    return () => clearTimeout(t);
  }, [route]);

  const finished = useMemo(() => Object.keys(st.history), [st.history, rounds, completion]); // eslint-disable-line react-hooks/exhaustive-deps
  const streak = useMemo(() => (today ? streaks(finished, today.date) : { current: 0, max: 0 }), [finished, today]);
  const firstClueRate = useMemo(() => {
    const solves = Object.values(st.history).flatMap((r) => r.solved ?? []);
    return solves.length ? Math.round((solves.filter((x) => x === 1).length / solves.length) * 100) : null;
  }, [st.history, completion]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (index: number) => (res: GuessResponse) => {
    const next = [...rounds];
    next[index] = res.round;
    setRounds(next);
    setCompletion(res.completion);
    if (today) record(today, next, res.completion);
    return next;
  };

  const openLeagues = () => go({ name: 'leagues', back: route.name === 'leagues' ? { name: 'results' } : route });
  const joined = (l: LeagueSummary) => {
    setInvite(null);
    st.displayName = l.myName;
    st.leagueId = l.id;
    persist();
    bump((x) => x + 1);
    go({ name: 'leagues', back: route.name === 'leagues' ? route.back : route });
  };

  // ---------------------------------------------------------------- render
  const blocks: Block[] = rounds.map((r) => r.reveal?.block).filter(Boolean) as Block[];
  const nextOpen = (from: number) => {
    const i = rounds.findIndex((r, k) => k > from && !r.done);
    return i === -1 ? rounds.findIndex((r) => !r.done) : i;
  };
  let screen: React.ReactNode = null;
  if (route.name === 'loading') screen = <div className={s.screen} aria-busy="true" />;
  else if (route.name === 'message')
    screen = (
      <div className={s.screen}>
        <div className={s.start}>
          <Wordmark size={40} />
          <h1 className={s.startTitle} tabIndex={-1} data-autofocus>
            {route.title}
          </h1>
          <p className={s.startMeta}>{route.body}</p>
          {route.retry && <Button onClick={() => location.reload()}>Try again</Button>}
        </div>
      </div>
    );
  else if (today && route.name === 'start')
    screen = (
      <Start
        today={today}
        started={rounds.filter((r) => r.done).length}
        onPlay={() => go({ name: 'round', index: Math.max(0, rounds.findIndex((r) => !r.done)) })}
      />
    );
  else if (today && route.name === 'round' && rounds[route.index])
    screen = (
      <Round
        key={rounds[route.index].id}
        round={rounds[route.index]}
        index={route.index}
        set={today.set}
        blocks={blocks}
        puzzle={today.puzzle}
        edition={today.edition}
        streak={streak.current}
        playerId={st.playerId}
        onUpdate={apply(route.index)}
        onDone={(res) => {
          apply(route.index)(res);
          go({ name: 'reveal', index: route.index });
        }}
        onStale={() => setTimeout(() => location.reload(), 1500)}
      />
    );
  else if (today && route.name === 'reveal' && rounds[route.index]?.reveal)
    screen = (
      <Reveal
        round={rounds[route.index]}
        index={route.index}
        set={today.set}
        blocks={blocks}
        puzzle={today.puzzle}
        edition={today.edition}
        streak={streak.current}
        review={!!route.review}
        onNext={() => {
          if (route.review) return go({ name: 'results' });
          const n = nextOpen(route.index);
          go(n === -1 ? { name: 'results' } : { name: 'round', index: n });
        }}
      />
    );
  else if (today && route.name === 'results')
    screen = (
      <Results
        today={today}
        reveals={rounds.map((r) => r.reveal!).filter(Boolean)}
        completion={completion}
        streak={streak.current}
        firstClueRate={firstClueRate}
        onOpenReveal={(i) => go({ name: 'reveal', index: i, review: true })}
        onLeagues={openLeagues}
        onStats={() => setSheet('stats')}
        onHelp={() => setSheet('help')}
      />
    );
  else if (route.name === 'leagues')
    screen = (
      <Leagues
        playerId={st.playerId}
        initialLeagueId={st.leagueId}
        displayName={st.displayName}
        onBack={() => go(route.back.name === 'loading' ? { name: 'start' } : route.back)}
        onLeagueChange={(id) => {
          st.leagueId = id;
          persist();
        }}
        onName={(n) => {
          st.displayName = n;
          persist();
        }}
      />
    );

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={routeKey(route)}
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0, transition: { type: 'spring', stiffness: 520, damping: 42, mass: 0.7 } }}
          exit={{ opacity: 0, x: -20, transition: { duration: 0.1 } }}
        >
          {screen}
        </motion.main>
      </AnimatePresence>

      <Sheet title="How to play" open={sheet === 'help'} onClose={() => setSheet(null)}>
        <HowTo />
      </Sheet>
      <Sheet title="Your stats" open={sheet === 'stats'} onClose={() => setSheet(null)}>
        <StatsBody history={st.history} today={today?.date ?? ''} current={streak.current} max={streak.max} />
      </Sheet>
      <Sheet title={invite?.name ? `Join “${invite.name}”` : 'Join a league'} open={!!invite} onClose={() => setInvite(null)}>
        {invite && (
          <>
            <p style={{ color: 'var(--text-2)', marginBottom: 14 }}>
              {invite.full
                ? 'This league is full (50 players).'
                : invite.name
                  ? `${invite.members} ${invite.members === 1 ? 'player' : 'players'} so far. Pick the name they'll see — that's all we need.`
                  : 'That invite link looks wrong or has expired.'}
            </p>
            {invite.name && !invite.full && <LeagueForms playerId={st.playerId} displayName={st.displayName} code={invite.code} onDone={joined} />}
          </>
        )}
      </Sheet>
      <ToastHost />
    </MotionConfig>
  );
}
