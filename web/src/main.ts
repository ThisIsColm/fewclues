import './styles.css';
import { addDays, dublinDate, formatLongDate, formatShortDate } from '../../shared/day';
import { binFor, binLabel, MAX_TOTAL, modeBin, QUESTIONS_PER_DAY } from '../../shared/scoring';
import { shareText } from '../../shared/share';
import { streaks } from '../../shared/streak';
import type { Completion, Reveal, TodayResponse } from '../../shared/types';
import { ApiError, clockSkew, getToday, postGuess } from './api';
import { afterPaint, countUp, h, icon, reducedMotion, toast } from './dom';
import { flag } from './flags';
import { load, save, type Saved } from './storage';

const app = document.getElementById('app')!;
const state: Saved = load();
save(state);

let today: TodayResponse;
let reveals: Reveal[] = [];
let completion: Completion | null = null;
let countdownTimer: number | undefined;

// ---------------------------------------------------------------- layout

function headerBar(): HTMLElement {
  return h(
    'header',
    { class: 'topbar' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'How to play', on: { click: openHelp } }, icon('help')),
    h('span', { class: 'wordmark', 'aria-hidden': 'true' }, 'Percentle'),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Your stats', on: { click: openStats } }, icon('stats')),
  );
}

function footer(): HTMLElement {
  return h(
    'footer',
    { class: 'footer' },
    h(
      'p',
      null,
      h('strong', null, 'Privacy: '),
      'no accounts, no ads, no trackers. Your browser keeps a random ID so you get one go a day; ',
      'we store only your guesses, to draw the crowd charts.',
    ),
  );
}

/** Swap the whole screen and move focus to its heading for screen readers. */
function show(screen: HTMLElement, opts: { header?: boolean; footer?: boolean } = {}) {
  clearInterval(countdownTimer);
  const main = h('main', { class: 'screen' }, screen);
  app.replaceChildren(...[opts.header !== false && headerBar(), main, opts.footer && footer()].filter(Boolean) as Node[]);
  window.scrollTo(0, 0);
  const heading = main.querySelector<HTMLElement>('[data-focus]') ?? main.querySelector<HTMLElement>('h1, h2');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

const progress = (index: number) =>
  h(
    'div',
    { class: 'progress' },
    h('span', { class: 'progress-label' }, `${index + 1}/${QUESTIONS_PER_DAY}`),
    h(
      'ol',
      { class: 'progress-steps', 'aria-hidden': 'true' },
      Array.from({ length: QUESTIONS_PER_DAY }, (_, i) =>
        h('li', { class: i < index ? 'done' : i === index ? 'current' : '' }),
      ),
    ),
  );

// ---------------------------------------------------------------- screens

function startScreen() {
  const started = reveals.length > 0;
  show(
    h(
      'section',
      { class: 'start' },
      h(
        'div',
        { class: 'logo', 'aria-hidden': 'true' },
        h('span', { class: 'logo-mark' }, '%'),
      ),
      h('h1', { class: 'title' }, 'Percentle'),
      h('p', { class: 'tagline' }, 'Guess the percentage. Five questions a day.'),
      h(
        'p',
        { class: 'meta' },
        flag(today.edition, `${today.editionName} edition`),
        h('span', null, `#${today.puzzle}`),
        h('span', { class: 'dot', 'aria-hidden': 'true' }, '·'),
        h('span', null, formatLongDate(today.date)),
      ),
      h(
        'button',
        { class: 'btn primary big', type: 'button', on: { click: () => goTo(reveals.length, 'question') } },
        started ? `Continue (${reveals.length}/${QUESTIONS_PER_DAY})` : 'Play',
      ),
      h('button', { class: 'btn ghost', type: 'button', on: { click: openHelp } }, 'How to play'),
    ),
    { header: false, footer: true },
  );
}

function questionScreen(index: number) {
  const q = today.questions[index];
  let value = 50;
  let lastTick = 0;

  const readout = h('output', { class: 'readout', 'aria-hidden': 'true' }, h('span', null, '50'), h('small', null, '%'));
  const slider = h('input', {
    type: 'range',
    class: 'slider',
    min: '0',
    max: '100',
    step: '1',
    value: '50',
    'aria-label': 'Your guess, in percent',
    'aria-valuetext': '50%',
  });
  const set = (v: number) => {
    value = Math.max(0, Math.min(100, Math.round(v)));
    slider.value = String(value);
    slider.setAttribute('aria-valuetext', `${value}%`);
    slider.style.setProperty('--fill', `${value}%`);
    readout.firstChild!.textContent = String(value);
    const t = performance.now();
    if (t - lastTick > 35 && 'vibrate' in navigator) {
      lastTick = t;
      try {
        navigator.vibrate(4);
      } catch {
        /* not allowed before a user gesture on some browsers */
      }
    }
  };
  slider.addEventListener('input', () => set(+slider.value));
  slider.style.setProperty('--fill', '50%');

  const nudge = (d: number, label: string, name: string) =>
    h('button', { class: 'icon-btn nudge', type: 'button', 'aria-label': label, on: { click: () => set(value + d) } }, icon(name));

  const lock = h('button', { class: 'btn primary big', type: 'button' }, 'Lock in');
  lock.addEventListener('click', async () => {
    lock.disabled = true;
    slider.disabled = true;
    lock.textContent = 'Locking in…';
    try {
      const res = await postGuess(state.playerId, q.id, value);
      reveals[index] = res.reveal;
      completion = res.completion;
      recordHistory();
      goTo(index, 'reveal');
    } catch (e) {
      lock.disabled = false;
      slider.disabled = false;
      lock.textContent = 'Lock in';
      handleError(e);
    }
  });

  show(
    h(
      'section',
      { class: 'question' },
      progress(index),
      h('h1', { class: 'q-text', 'data-focus': true }, q.question),
      readout,
      h('div', { class: 'slider-row' }, nudge(-1, 'Decrease by 1', 'minus'), slider, nudge(1, 'Increase by 1', 'plus')),
      h('div', { class: 'scale', 'aria-hidden': 'true' }, h('span', null, '0%'), h('span', null, '50%'), h('span', null, '100%')),
      h('div', { class: 'actions' }, lock),
    ),
  );
}

function revealScreen(index: number) {
  const q = today.questions[index];
  const r = reveals[index];
  const last = index === QUESTIONS_PER_DAY - 1;
  const lo = Math.min(r.guess, r.answer);
  const hi = Math.max(r.guess, r.answer);

  // --- the guess/answer bar: the answer marker slides out from your guess.
  const gap = h('div', { class: 'gap' });
  const guessMark = h('div', { class: 'mark mark-guess' }, h('span', { class: 'mark-label' }, `You ${r.guess}%`));
  const answerMark = h('div', { class: 'mark mark-answer' }, h('span', { class: 'mark-label' }, `Answer ${fmt(r.answer)}%`));
  // Keep labels inside the track near the edges.
  for (const [m, v] of [[guessMark, r.guess], [answerMark, r.answer]] as const) {
    m.classList.toggle('edge-left', v < 12);
    m.classList.toggle('edge-right', v > 88);
  }
  // Put the lower-valued label underneath when they'd collide.
  if (hi - lo < 24) (r.guess <= r.answer ? guessMark : answerMark).classList.add('below');
  guessMark.style.setProperty('--x', `${r.guess}%`);
  answerMark.style.setProperty('--x', `${r.guess}%`);
  gap.style.setProperty('--l', `${r.guess}%`);
  gap.style.setProperty('--w', '0%');
  const bar = h(
    'div',
    {
      class: 'answer-bar',
      role: 'img',
      'aria-label': `Your guess ${r.guess}%, the answer ${fmt(r.answer)}%.`,
    },
    h('div', { class: 'track' }, gap, guessMark, answerMark),
    h('div', { class: 'scale', 'aria-hidden': 'true' }, h('span', null, '0'), h('span', null, '50'), h('span', null, '100')),
  );
  afterPaint(() => {
    answerMark.style.setProperty('--x', `${r.answer}%`);
    gap.style.setProperty('--l', `${lo}%`);
    gap.style.setProperty('--w', `${hi - lo}%`);
  });

  const pts = h('span', { class: 'pts-num' }, String(r.points));
  const verdict = r.bullseye
    ? h('p', { class: 'verdict bullseye' }, h('span', { class: 'badge' }, 'Bullseye'), ' · ', pts, ' pts')
    : h('p', { class: 'verdict' }, `Off by ${fmt(r.offBy)} · `, pts, ' pts');
  countUp(pts, r.points);

  const next = h(
    'button',
    { class: 'btn primary big', type: 'button', on: { click: () => (last ? goToResults() : goTo(index + 1, 'question')) } },
    last ? 'See results' : 'Next',
  );

  show(
    h(
      'section',
      { class: 'reveal' },
      progress(index),
      h('p', { class: 'q-text small' }, q.question),
      h(
        'div',
        { class: 'figures' },
        h('div', null, h('span', { class: 'fig-label' }, 'You said'), h('span', { class: 'fig' }, `${r.guess}%`)),
        h('div', { class: 'answer' }, h('span', { class: 'fig-label' }, 'Answer'), h('span', { class: 'fig accent' }, `${fmt(r.answer)}%`)),
      ),
      bar,
      h('h1', { class: 'verdict-wrap', 'data-focus': true }, verdict),
      h('p', { class: 'nugget' }, r.nugget),
      histogram(r),
      r.comparisons.length ? comparisons(r) : null,
      h(
        'p',
        { class: 'source' },
        'Source: ',
        h('a', { href: r.source_url, target: '_blank', rel: 'noopener noreferrer' }, r.source_name),
        ` · data from ${r.year}`,
      ),
      h('div', { class: 'actions sticky' }, next),
    ),
  );
}

function histogram(r: Reveal): HTMLElement {
  const bins = r.histogram;
  const total = bins.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...bins);
  const mine = binFor(r.guess);
  const mode = modeBin(bins);
  const tied = bins.filter((n) => n === bins[mode]).length > 1;
  const line =
    total <= 1
      ? "You're the first to guess today."
      : tied
        ? 'Guesses are spread out — no clear favourite yet.'
        : mode === mine
        ? `Most people guessed ${binLabel(mode)} — same as you.`
        : `Most people guessed ${binLabel(mode)}.`;

  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'hist-h' },
    h('h2', { class: 'card-title', id: 'hist-h' }, 'How everyone guessed'),
    h('p', { class: 'card-sub' }, line),
    h(
      'div',
      { class: 'hist', 'aria-hidden': 'true' },
      bins.map((n, i) => {
        const col = h(
          'div',
          { class: `hist-col${i === mine ? ' mine' : ''}`, title: `${binLabel(i)}: ${n} ${n === 1 ? 'guess' : 'guesses'}` },
          h('div', { class: 'hist-bar' }),
          i === mine ? h('span', { class: 'hist-you' }, 'You') : null,
        );
        col.style.setProperty('--h', `${n === 0 ? 0 : Math.max(4, (n / max) * 100)}%`);
        return col;
      }),
    ),
    h('div', { class: 'scale', 'aria-hidden': 'true' }, h('span', null, '0%'), h('span', null, '50%'), h('span', null, '100%')),
    h('p', { class: 'card-foot' }, `${total.toLocaleString('en-IE')} ${total === 1 ? 'guess' : 'guesses'} so far`),
    // Screen-reader table of the same data.
    h(
      'table',
      { class: 'visually-hidden' },
      h('caption', null, 'Crowd guesses by range'),
      h('tbody', null, bins.map((n, i) => h('tr', null, h('th', { scope: 'row' }, binLabel(i) + (i === mine ? ' (your guess)' : '')), h('td', null, String(n))))),
    ),
  );
}

function comparisons(r: Reveal): HTMLElement {
  const rows = [{ label: today.editionName, value: r.answer, home: true }, ...r.comparisons.map((c) => ({ ...c, home: false }))].sort(
    (a, b) => b.value - a.value,
  );
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'cmp-h' },
    h('h2', { class: 'card-title', id: 'cmp-h' }, `How ${today.editionName} compares`),
    h(
      'ul',
      { class: 'cmp' },
      rows.map((row) => {
        const bar = h('span', { class: 'cmp-bar' });
        bar.style.setProperty('--w', `${row.value}%`);
        return h(
          'li',
          { class: row.home ? 'home' : '' },
          h('span', { class: 'cmp-label' }, row.label),
          h('span', { class: 'cmp-track', 'aria-hidden': 'true' }, bar),
          h('span', { class: 'cmp-val' }, `${fmt(row.value)}%`),
        );
      }),
    ),
  );
}

function resultsScreen() {
  const record = state.history[today.date];
  const total = completion?.total ?? record?.total ?? 0;
  const s = streaks(Object.keys(state.history), today.date);
  const text = shareText({
    puzzle: today.puzzle,
    flag: today.flag,
    total,
    blocks: reveals.map((r) => r.block),
    siteHost: today.siteHost,
  });

  const totalEl = h('span', { class: 'total-num' }, String(total));
  countUp(totalEl, total, 380);

  const countdown = h('span', { class: 'countdown-time' }, '--:--:--');
  const nextWrap = h('p', { class: 'countdown' }, 'Next Percentle in ', countdown);

  show(
    h(
      'section',
      { class: 'results' },
      h(
        'p',
        { class: 'meta' },
        flag(today.edition, `${today.editionName} edition`),
        `Percentle #${today.puzzle}`,
        h('span', { class: 'dot', 'aria-hidden': 'true' }, '·'),
        formatShortDate(today.date),
      ),
      h('h1', { class: 'total', 'data-focus': true, 'aria-label': `You scored ${total} out of ${MAX_TOTAL}` }, totalEl, h('small', null, `/${MAX_TOTAL}`)),
      h(
        'ol',
        { class: 'blocks', 'aria-label': 'Score per question' },
        reveals.map((r, i) =>
          h(
            'li',
            { class: `block ${r.block}`, 'aria-label': `Question ${i + 1}: ${r.points} points, off by ${fmt(r.offBy)}` },
            h('span', null, String(r.points)),
          ),
        ),
      ),
      completion?.percentile != null
        ? h('p', { class: 'percentile' }, `You beat ${completion.percentile}% of today's players`)
        : null,
      h(
        'div',
        { class: 'streak-row' },
        h('div', null, h('span', { class: 'stat-num' }, String(s.current)), h('span', { class: 'stat-label' }, 'Day streak')),
        h('div', null, h('span', { class: 'stat-num' }, String(s.max)), h('span', { class: 'stat-label' }, 'Best streak')),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn primary big', type: 'button', on: { click: () => share(text) } }, icon('share'), 'Share'),
        h('button', { class: 'btn secondary', type: 'button', on: { click: openStats } }, icon('stats'), 'Stats'),
      ),
      nextWrap,
    ),
    { footer: true },
  );

  const tick = () => {
    const ms = Date.parse(today.nextRolloverAt) - (Date.now() + clockSkew);
    if (ms <= 0) {
      clearInterval(countdownTimer);
      nextWrap.replaceChildren(
        'A new Percentle is ready. ',
        h('button', { class: 'link-btn', type: 'button', on: { click: () => location.reload() } }, 'Play it'),
      );
      return;
    }
    const sec = Math.floor(ms / 1000);
    countdown.textContent = [sec / 3600, (sec % 3600) / 60, sec % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':');
  };
  tick();
  countdownTimer = window.setInterval(tick, 1000);
}

function emptyScreen(title: string, body: string, retry = false) {
  show(
    h(
      'section',
      { class: 'start' },
      h('div', { class: 'logo', 'aria-hidden': 'true' }, h('span', { class: 'logo-mark' }, '%')),
      h('h1', { class: 'title' }, title),
      h('p', { class: 'tagline' }, body),
      retry ? h('button', { class: 'btn primary big', type: 'button', on: { click: () => location.reload() } }, 'Try again') : null,
    ),
    { header: false, footer: true },
  );
}

// ---------------------------------------------------------------- dialogs

function dialog(title: string, ...content: (Node | null)[]): HTMLDialogElement {
  const d = h(
    'dialog',
    { class: 'sheet', 'aria-labelledby': 'dlg-title' },
    h(
      'div',
      { class: 'sheet-head' },
      h('h2', { id: 'dlg-title' }, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', on: { click: () => d.close() } }, icon('close')),
    ),
    ...content.filter(Boolean) as Node[],
  );
  d.addEventListener('close', () => d.remove());
  // Tap on the backdrop closes it.
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
  document.body.append(d);
  d.showModal();
  return d;
}

function openHelp() {
  dialog(
    'How to play',
    h(
      'ol',
      { class: 'howto' },
      h('li', null, `Every day there are five questions about ${today?.editionName ?? 'Ireland'}: “What % of people…?”`),
      h('li', null, 'Drag the slider to your guess and lock it in. Then see the answer, and how everyone else guessed.'),
      h('li', null, 'The closer you are, the more points: up to 100 a question, 500 a day.'),
    ),
  );
  state.seenHelp = true;
  save(state);
}

function openStats() {
  const days = Object.entries(state.history);
  const played = days.length;
  const s = streaks(days.map(([d]) => d), today?.date ?? dublinDate(new Date()));
  const avg = played ? Math.round(days.reduce((a, [, r]) => a + r.total, 0) / played) : 0;
  const errors = days.flatMap(([, r]) => r.signedErrors);
  const bias = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : 0;
  const b = Math.round(Math.abs(bias));
  const biasText = !errors.length
    ? 'Play a game to find out whether you guess high or low.'
    : b < 1
      ? 'You’re well calibrated — no lean either way.'
      : `You ${bias > 0 ? 'overestimate' : 'underestimate'} by ${b} ${b === 1 ? 'point' : 'points'} on average.`;

  // Score distribution in 100-point bands.
  const bands = ['0–99', '100–199', '200–299', '300–399', '400–500'];
  const counts = bands.map(() => 0);
  for (const [, r] of days) counts[Math.min(4, Math.floor(r.total / 100))]++;
  const maxCount = Math.max(1, ...counts);
  const todayBand = state.history[today?.date] ? Math.min(4, Math.floor(state.history[today.date].total / 100)) : -1;

  const tile = (n: number | string, label: string) =>
    h('div', { class: 'tile' }, h('span', { class: 'stat-num' }, String(n)), h('span', { class: 'stat-label' }, label));

  dialog(
    'Your stats',
    h('div', { class: 'tiles' }, tile(played, 'Played'), tile(played ? avg : '–', 'Avg score'), tile(s.current, 'Streak'), tile(s.max, 'Best streak')),
    h('h3', { class: 'sheet-sub' }, 'Score distribution'),
    h(
      'ul',
      { class: 'cmp dist' },
      bands.map((label, i) => {
        const bar = h('span', { class: 'cmp-bar' });
        bar.style.setProperty('--w', `${counts[i] ? Math.max(4, (counts[i] / maxCount) * 100) : 0}%`);
        return h(
          'li',
          { class: i === todayBand ? 'home' : '' },
          h('span', { class: 'cmp-label' }, label),
          h('span', { class: 'cmp-track', 'aria-hidden': 'true' }, bar),
          h('span', { class: 'cmp-val' }, String(counts[i])),
        );
      }),
    ),
    h('h3', { class: 'sheet-sub' }, 'Your bias'),
    h('p', { class: 'bias' }, biasText),
  );
}

// ---------------------------------------------------------------- flow

function goTo(index: number, phase: 'question' | 'reveal') {
  state.cursor = { date: today.date, index, phase };
  save(state);
  if (phase === 'question' && index >= QUESTIONS_PER_DAY) return goToResults();
  if (phase === 'question') questionScreen(index);
  else revealScreen(index);
}

function goToResults() {
  state.cursor = { date: today.date, index: QUESTIONS_PER_DAY, phase: 'question' };
  save(state);
  resultsScreen();
}

/** Mirror server results into the local history once the day is finished. */
function recordHistory() {
  if (!completion || reveals.length !== QUESTIONS_PER_DAY) return;
  state.history[today.date] = {
    puzzle: today.puzzle,
    total: completion.total,
    points: reveals.map((r) => r.points),
    signedErrors: reveals.map((r) => r.signedError),
    blocks: reveals.map((r) => r.block),
  };
  save(state);
}

async function share(text: string) {
  const mobile = window.matchMedia('(pointer: coarse)').matches;
  if (mobile && navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  if (await copy(text)) toast('Copied to clipboard');
  else toast("Couldn't copy — long-press to select instead");
}

async function copy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  const ta = h('textarea', { class: 'visually-hidden', readonly: true });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok;
}

function handleError(e: unknown) {
  if (e instanceof ApiError && e.code === 'stale') {
    toast(e.message);
    setTimeout(() => location.reload(), 1500);
    return;
  }
  toast(e instanceof Error ? e.message : 'Something went wrong.');
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

async function init() {
  if (reducedMotion()) document.documentElement.classList.add('reduce-motion');
  try {
    today = await getToday(state.playerId);
  } catch (e) {
    emptyScreen('Percentle', e instanceof Error ? e.message : 'Something went wrong.', true);
    return;
  }
  if (today.date < today.launchDate) {
    emptyScreen('Coming soon', `The first Percentle is on ${formatLongDate(today.launchDate)}.`);
    return;
  }
  if (!today.questions.length) {
    emptyScreen('No puzzle today', 'Today’s questions aren’t ready yet. Check back soon.');
    return;
  }

  // The server is the source of truth for what this player has guessed.
  reveals = today.reveals;
  completion = today.completion;
  recordHistory();

  // Forget yesterday's in-progress cursor and old history beyond a year.
  if (state.cursor && state.cursor.date !== today.date) delete state.cursor;
  const cutoff = addDays(today.date, -400);
  for (const d of Object.keys(state.history)) if (d < cutoff) delete state.history[d];
  save(state);

  const n = reveals.length;
  const c = state.cursor;
  if (n > 0 && c?.phase === 'reveal' && c.index === n - 1) return revealScreen(n - 1); // refreshed on a reveal
  if (n >= QUESTIONS_PER_DAY) return resultsScreen(); // already done today
  if (n > 0 || c) return questionScreen(n); // resume mid-game
  startScreen();
}

init();
