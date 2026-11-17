import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { daysBetween } from '../../../shared/day';
import type { LeagueSummary, StandingsResponse } from '../../../shared/types';
import { Button, Card, IconButton, Sheet, toast, ui } from '../components/ui';
import { ApiError, createLeague, getLeagues, getStandings, joinLeague } from '../lib/api';
import { closeness, closenessLabel } from '../lib/closeness';
import { fmt, initial, ordinal } from '../lib/format';
import { shareOrCopy } from '../lib/share';
import s from './Leagues.module.css';

export function Leagues(props: {
  playerId: string;
  initialLeagueId?: string;
  displayName?: string;
  onBack: () => void;
  onLeagueChange: (id: string) => void;
  onName: (name: string) => void;
}) {
  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null);
  const [current, setCurrent] = useState<string | undefined>(props.initialLeagueId);
  const [period, setPeriod] = useState<'day' | 'week'>('day');
  const [data, setData] = useState<StandingsResponse | null>(null);
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLeagues = useCallback(async (select?: string) => {
    try {
      const { leagues } = await getLeagues(props.playerId);
      setLeagues(leagues);
      const pick = leagues.find((l) => l.id === (select ?? current)) ?? leagues[0];
      setCurrent(pick?.id);
    } catch (e) {
      setError((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.playerId]);

  useEffect(() => {
    void loadLeagues(props.initialLeagueId);
  }, [loadLeagues, props.initialLeagueId]);

  useEffect(() => {
    if (!current) return;
    props.onLeagueChange(current);
    let live = true;
    getStandings(props.playerId, current, period)
      .then((d) => live && setData(d))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, period, props.playerId]);

  const league = leagues?.find((l) => l.id === current);
  const standings = data && data.league.id === current && data.period === period ? data : null;

  async function invite() {
    if (!league) return;
    const url = `${location.origin}/?join=${league.code}`;
    const res = await shareOrCopy({ title: 'Percentle league', text: `Join my Percentle league “${league.name}”`, url });
    if (res === 'copied') toast('Invite link copied');
    if (res === 'failed') toast(`Couldn't copy. The code is ${league.code}`);
  }

  const created = (l: LeagueSummary) => {
    setSheet(false);
    props.onName(l.myName);
    void loadLeagues(l.id);
  };

  return (
    <div className={`${s.screen}`}>
      <header className={s.header}>
        <IconButton label="Back" icon="back" onClick={props.onBack} />
        <div className={s.titleWrap}>
          <p className={s.kicker}>League</p>
          <h1 className={s.title} tabIndex={-1} data-autofocus>
            {league ? league.name : 'Play with friends'}
          </h1>
        </div>
        {leagues && leagues.length > 0 && <IconButton label="New or join league" icon="plus" onClick={() => setSheet(true)} />}
      </header>

      {error && <p className={ui.error}>{error}</p>}

      {leagues && leagues.length === 0 && (
        <div className={s.stack}>
          <p className={s.lede}>Start a league, send the link, and see who really knows {`Ireland`}. Scores only — nobody sees answers before they've played.</p>
          <LeagueForms playerId={props.playerId} displayName={props.displayName} onDone={created} />
        </div>
      )}

      {leagues && leagues.length > 1 && (
        <div className={s.switcher} role="group" aria-label="Your leagues">
          {leagues.map((l) => (
            <button key={l.id} type="button" className={s.switch} aria-pressed={l.id === current} onClick={() => setCurrent(l.id)}>
              {l.name}
            </button>
          ))}
        </div>
      )}

      {league && (
        <div className={s.stack}>
          <div className={s.toggle} role="tablist" aria-label="Period">
            {(['day', 'week'] as const).map((p) => (
              <button key={p} type="button" role="tab" aria-selected={period === p} className={s.toggleBtn} onClick={() => setPeriod(p)}>
                {period === p && <motion.span layoutId="toggle" className={s.toggleBg} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span>{p === 'day' ? 'Today' : 'This week'}</span>
              </button>
            ))}
          </div>

          {standings ? <Standings data={standings} /> : <div className={s.loading} aria-busy="true" />}

          {standings?.headToHead && period === 'day' && <HeadToHead h={standings.headToHead} />}
          {standings && period === 'day' && !standings.viewerFinished && (
            <p className={s.note}>Finish today's puzzle to see how you stack up, question by question.</p>
          )}

          <Button onClick={invite}>Invite to league</Button>
          <p className={s.note}>
            {league.members} of 50 players · code <span className={s.code}>{league.code}</span>
          </p>
        </div>
      )}

      <Sheet title="Leagues" open={sheet} onClose={() => setSheet(false)}>
        <LeagueForms playerId={props.playerId} displayName={props.displayName} onDone={created} />
      </Sheet>
    </div>
  );
}

function Standings({ data }: { data: StandingsResponse }) {
  const reduced = useReducedMotion() ?? false;
  const daysSoFar = daysBetween(data.from, data.to) + 1;
  return (
    <ol className={s.rows} aria-label={data.period === 'day' ? "Today's standings" : "This week's standings"}>
      {data.rows.map((r, i) => (
        <motion.li
          key={`${r.name}-${i}`}
          className={`${s.row} ${r.isMe ? s.me : ''}`}
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduced ? 0 : i * 0.04, type: 'spring', stiffness: 400, damping: 32 }}
        >
          <span className={`${s.rank} ${r.rank === 1 ? s.first : ''}`}>{r.rank ? ordinal(r.rank) : '–'}</span>
          <span className={s.avatar} aria-hidden="true">
            {initial(r.name)}
          </span>
          <span className={s.name}>
            {r.name}
            {r.isMe && <span className="visually-hidden"> (you)</span>}
          </span>
          {data.period === 'day' ? (
            r.blocks ? (
              <span className={s.minis} role="img" aria-label={r.blocks.map((b, j) => `Q${j + 1} ${closenessLabel[closeness(b)]}`).join(', ')}>
                {r.blocks.map((b, j) => (
                  <i key={j} className={s[closeness(b)]} />
                ))}
              </span>
            ) : (
              <span className={s.pending}>{r.total === null ? 'Not played' : ''}</span>
            )
          ) : (
            <span className={s.pending}>
              {r.daysPlayed}/{daysSoFar} {daysSoFar === 1 ? 'day' : 'days'}
            </span>
          )}
          <span className={`${s.total} num`}>{r.total ?? '—'}</span>
        </motion.li>
      ))}
    </ol>
  );
}

function HeadToHead({ h }: { h: NonNullable<StandingsResponse['headToHead']> }) {
  return (
    <section className={ui.paper} aria-labelledby="h2h-title">
      <h2 className={ui.paperLabel} id="h2h-title">
        Head to head · Question {h.order}
      </h2>
      <p className={s.h2h}>
        {h.mateBetter ? (
          <>
            {h.mate} was off by <b>{fmt(h.mateOff)}</b>. You were off by <b>{fmt(h.myOff)}</b>. Expect to hear about it.
          </>
        ) : (
          <>
            You were off by <b>{fmt(h.myOff)}</b>. {h.mate} was off by <b>{fmt(h.mateOff)}</b>. Feel free to mention it.
          </>
        )}
      </p>
    </section>
  );
}

/** Create a league, or join one with a code. The only place we ask for a name. */
export function LeagueForms({ playerId, displayName, onDone, code: presetCode }: { playerId: string; displayName?: string; onDone: (l: LeagueSummary) => void; code?: string }) {
  const [name, setName] = useState(displayName ?? '');
  const [leagueName, setLeagueName] = useState('');
  const [code, setCode] = useState(presetCode ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<{ league: LeagueSummary }>) {
    setBusy(true);
    setErr(null);
    try {
      const { league } = await fn();
      onDone(league);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }
  const submitCreate = (e: FormEvent) => {
    e.preventDefault();
    void run(() => createLeague(playerId, leagueName, name));
  };
  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    void run(() => joinLeague(playerId, code, name));
  };

  return (
    <div className={s.forms}>
      <div className={ui.field}>
        <label htmlFor="lg-you">Your name in leagues</label>
        <input id="lg-you" className={ui.input} value={name} maxLength={20} autoComplete="nickname" onChange={(e) => setName(e.target.value)} placeholder="e.g. Colm" />
      </div>
      {err && <p className={ui.error} role="alert">{err}</p>}
      {!presetCode && (
        <Card>
          <form onSubmit={submitCreate}>
            <h2 className={ui.cardTitle}>Start a league</h2>
            <div className={ui.field} style={{ marginTop: 12 }}>
              <label htmlFor="lg-name">League name</label>
              <input id="lg-name" className={ui.input} value={leagueName} maxLength={32} onChange={(e) => setLeagueName(e.target.value)} placeholder="e.g. The Kitchen" />
            </div>
            <Button type="submit" disabled={busy || !name.trim() || !leagueName.trim()}>
              Create league
            </Button>
          </form>
        </Card>
      )}
      <Card>
        <form onSubmit={submitJoin}>
          <h2 className={ui.cardTitle}>{presetCode ? 'Join this league' : 'Got an invite code?'}</h2>
          {!presetCode && (
            <div className={ui.field} style={{ marginTop: 12 }}>
              <label htmlFor="lg-code">Invite code</label>
              <input id="lg-code" className={`${ui.input} ${s.codeInput}`} value={code} maxLength={8} autoCapitalize="characters" autoComplete="off" spellCheck={false} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="8 letters" />
            </div>
          )}
          <Button type="submit" variant={presetCode ? 'primary' : 'secondary'} disabled={busy || !name.trim() || code.trim().length !== 8} style={presetCode ? { marginTop: 12 } : undefined}>
            Join league
          </Button>
        </form>
      </Card>
    </div>
  );
}
