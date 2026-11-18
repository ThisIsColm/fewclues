import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, formatLongDate } from '../../shared/day';
import { QUESTIONS_PER_DAY } from '../../shared/scoring';
import { streaks } from '../../shared/streak';
import type { Completion, GuessResponse, LeagueSummary, Reveal as RevealData, TodayResponse } from '../../shared/types';
import { Button, Sheet, ToastHost, Wordmark } from './components/ui';
import { getToday, previewInvite } from './lib/api';
import { load, save, type Saved } from './lib/storage';
import { Guess } from './screens/Guess';
import { LeagueForms, Leagues } from './screens/Leagues';
import { Results } from './screens/Results';
import { Reveal } from './screens/Reveal';
import { HowTo, Start } from './screens/Start';
import { StatsBody } from './screens/StatsSheet';
import s from './screens/screens.module.css';

type Route =
  | { name: 'loading' }
  | { name: 'message'; title: string; body: string; retry?: boolean }
  | { name: 'start' }
  | { name: 'guess'; index: number }
  | { name: 'reveal'; index: number; review?: boolean }
  | { name: 'results' }
  | { name: 'leagues'; back: Route };

const routeKey = (r: Route) => ('index' in r ? `${r.name}-${r.index}` : r.name);

export function App() {
  const stateRef = useRef<Saved>(load());
  const st = stateRef.current;
  const persist = useCallback(() => save(stateRef.current), []);
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [reveals, setReveals] = useState<RevealData[]>([]);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'loading' });
  const [sheet, setSheet] = useState<'help' | 'stats' | null>(null);
  const [invite, setInvite] = useState<{ code: string; name: string; members: number; full: boolean } | null>(null);
  const [, bump] = useState(0);

  // ---------------------------------------------------------------- navigation
  const go = useCallback(
    (r: Route) => {
      if (today && (r.name === 'guess' || (r.name === 'reveal' && !r.review))) {
        stateRef.current.cursor = { date: today.date, index: r.index, phase: r.name === 'guess' ? 'question' : 'reveal' };
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

  /** Mirror server results into local history once the day is finished. */
  const record = useCallback(
    (t: TodayResponse, rs: RevealData[], c: Completion | null) => {
      if (!c || rs.length !== QUESTIONS_PER_DAY) return;
      stateRef.current.history[t.date] = {
        puzzle: t.puzzle,
        total: c.total,
        points: rs.map((r) => r.points),
        signedErrors: rs.map((r) => r.signedError),
        blocks: rs.map((r) => r.block),
      };
      persist();
    },
    [persist],
  );

  // ---------------------------------------------------------------- boot
  useEffect(() => {
    void (async () => {
      const params = new URLSearchParams(location.search);
      const join = params.get('join');
      let t: TodayResponse;
      try {
        t = await getToday(st.playerId);
      } catch (e) {
        setRoute({ name: 'message', title: 'Percentle', body: (e as Error).message, retry: true });
        return;
      }
      setToday(t);
      setReveals(t.reveals);
      setCompletion(t.completion);
      record(t, t.reveals, t.completion);
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
        setRoute({ name: 'message', title: 'Coming soon', body: `The first Percentle is on ${formatLongDate(t.launchDate)}.` });
        return;
      }
      if (!t.questions.length) {
        setRoute({ name: 'message', title: 'No puzzle today', body: 'Today’s questions aren’t ready yet. Check back soon.' });
        return;
      }
      const n = t.reveals.length;
      const c = st.cursor;
      if (n > 0 && c?.phase === 'reveal' && c.index === n - 1) setRoute({ name: 'reveal', index: n - 1 });
      else if (n >= QUESTIONS_PER_DAY) setRoute({ name: 'results' });
      else if (n > 0 || c) setRoute({ name: 'guess', index: n });
      else setRoute({ name: 'start' });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // At 9pm, quietly refetch so the room results appear without a reload.
  useEffect(() => {
    if (!today || today.room.revealed) return;
    const ms = Date.parse(today.room.revealAt) - Date.now() + 1500;
    if (ms > 2 ** 31 - 1) return;
    const t = setTimeout(() => {
      getToday(st.playerId)
        .then((t2) => setToday((cur) => (cur && cur.date === t2.date ? { ...cur, room: t2.room } : cur)))
        .catch(() => {});
    }, Math.max(0, ms));
    return () => clearTimeout(t);
  }, [today, st.playerId]);

  // Move focus to the new screen's heading for screen-reader users.
  useEffect(() => {
    const t = setTimeout(() => {
      // Don't steal focus from something the user has already moved to (e.g. the slider).
      const a = document.activeElement;
      if (a && a !== document.body && document.querySelector('main')?.contains(a)) return;
      document.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    }, 320);
    return () => clearTimeout(t);
  }, [route]);

  const finished = useMemo(() => Object.keys(st.history), [st.history, reveals, completion]); // eslint-disable-line react-hooks/exhaustive-deps
  const streak = useMemo(() => (today ? streaks(finished, today.date) : { current: 0, max: 0 }), [finished, today]);
  const bias = useMemo(() => {
    const errs = Object.values(st.history).flatMap((r) => r.signedErrors);
    return errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null;
  }, [st.history, completion]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLocked = (index: number) => (res: GuessResponse) => {
    const next = [...reveals];
    next[index] = res.reveal;
    setReveals(next);
    setCompletion(res.completion);
    if (today) record(today, next, res.completion);
    go({ name: 'reveal', index });
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
  let screen: React.ReactNode = null;
  const blocks = reveals.map((r) => r.block);
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
    screen = <Start today={today} started={reveals.length} onPlay={() => go({ name: 'guess', index: reveals.length })} onHelp={() => setSheet('help')} />;
  else if (today && route.name === 'guess')
    screen = (
      <Guess
        q={today.questions[route.index]}
        index={route.index}
        blocks={blocks}
        puzzle={today.puzzle}
        edition={today.edition}
        streak={streak.current}
        playerId={st.playerId}
        onLocked={onLocked(route.index)}
        onStale={() => setTimeout(() => location.reload(), 1500)}
      />
    );
  else if (today && route.name === 'reveal' && reveals[route.index])
    screen = (
      <Reveal
        q={today.questions[route.index]}
        r={reveals[route.index]}
        index={route.index}
        blocks={blocks}
        puzzle={today.puzzle}
        edition={today.edition}
        editionName={today.editionName}
        room={today.room.questions.find((x) => x.question_id === today.questions[route.index].id)}
        roomRevealAt={today.room.revealAt}
        streak={streak.current}
        review={!!route.review}
        onNext={() =>
          route.review ? go({ name: 'results' }) : route.index + 1 >= QUESTIONS_PER_DAY ? go({ name: 'results' }) : go({ name: 'guess', index: route.index + 1 })
        }
      />
    );
  else if (today && route.name === 'results')
    screen = (
      <Results
        today={today}
        reveals={reveals}
        completion={completion}
        streak={streak.current}
        bias={bias}
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
        <HowTo editionName={today?.editionName ?? 'Ireland'} />
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
