import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { CLUE_POINTS } from '../../../shared/ladder';
import { PLACE_SETS, placeById, resolve, suggest, type Place } from '../../../shared/places';
import type { Block, GuessResponse, RoundView } from '../../../shared/types';
import { Progress } from '../components/Progress';
import { TopBar } from '../components/TopBar';
import { Button, Icon, toast } from '../components/ui';
import { ApiError, postGuess } from '../lib/api';
import { haptic } from '../lib/haptics';
import { useVisualViewport } from '../lib/viewport';
import s from './Round.module.css';

export function Round(props: {
  round: RoundView;
  index: number;
  set: string;
  blocks: Block[];
  puzzle: number;
  edition: string;
  streak: number;
  playerId: string;
  onUpdate: (res: GuessResponse) => void;
  onDone: (res: GuessResponse) => void;
  onStale: () => void;
}) {
  const { round, index } = props;
  const set = PLACE_SETS[props.set];
  const reduced = useReducedMotion() ?? false;
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const shake = useAnimationControls();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const vp = useVisualViewport();
  const [focused, setFocused] = useState(false);
  const compact = vp.keyboard || (focused && vp.height < 560);

  // Keep the newest clue (and wrong guesses) in view: on a new clue, when the keyboard
  // opens or closes, and while new content grows in — unless the player has scrolled up to reread.
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = true;
    el.scrollTop = el.scrollHeight;
  }, [round.clues.length, round.wrong.length, compact, vp.height]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    };
    const ro = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    });
    el.addEventListener('scroll', onScroll, { passive: true });
    for (const child of Array.from(el.children)) ro.observe(child);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [round.wrong.length > 0]);

  // The page behind must not scroll while this screen is pinned to the visible area.
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, []);

  const tried = new Set(round.wrong);
  const options = useMemo(() => suggest(set, text, 6), [set, text]);
  const worth = CLUE_POINTS[Math.min(round.clues.length, 4) - 1];

  useEffect(() => setActive(0), [text]);

  async function submit(place: Place | undefined) {
    if (busy) return;
    if (!place) {
      toast(text.trim() ? `Pick a ${set.noun} from the list` : `Type a ${set.noun}`);
      inputRef.current?.focus();
      return;
    }
    if (tried.has(place.id)) {
      toast(`You already tried ${place.name}`);
      return;
    }
    setBusy(true);
    setOpen(false);
    try {
      const res = await postGuess(props.playerId, round.id, place.id);
      setText('');
      if (res.correct) {
        haptic('success', 0);
        props.onDone(res);
      } else {
        haptic(res.round.done ? 'heavy' : 'error', 0);
        if (!reduced) void shake.start({ x: [0, -14, 12, -9, 6, -3, 0], transition: { duration: 0.4 } });
        if (res.round.done) setTimeout(() => props.onDone(res), 450);
        else props.onUpdate(res);
        inputRef.current?.focus({ preventScroll: true });
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'stale') {
        toast(e.message);
        props.onStale();
      } else toast(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const pick = open && options[active] ? options[active] : resolve(set, text);
    void submit(pick);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!options.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + options.length) % options.length);
    } else if (e.key === 'Escape') setOpen(false);
  };

  const body = (
    <div
      className={`${s.screen} ${compact ? s.compact : ''}`}
      style={{ top: `${vp.top}px`, height: `${vp.height}px` }}
    >
      {!compact && (
        <>
          <TopBar puzzle={props.puzzle} edition={props.edition} streak={props.streak} />
          <Progress blocks={props.blocks} current={index} />
        </>
      )}
      <div className={s.head}>
        <p className={s.label}>
          Round {index + 1} of 5{round.category && !compact ? ` · ${round.category}` : ''}
        </p>
        <span className={s.worth} aria-live="polite">
          Worth {worth} pts
        </span>
      </div>
      <h1 className={s.title} tabIndex={-1} data-autofocus>
        Which {set.noun}?
      </h1>

      <div className={s.scroll} ref={scrollRef}>
        <ol className={s.clues} aria-label="Clues" aria-live="polite">
          <AnimatePresence initial={false}>
            {round.clues.map((c, i) => (
              <motion.li
                key={i}
                className={`${s.clue} ${i === round.clues.length - 1 ? s.latest : ''}`}
                initial={reduced ? false : { opacity: 0, y: 18, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              >
                <span className={s.clueNo}>Clue {i + 1}</span>
                <span className={s.clueText}>{c}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>

        {round.wrong.length > 0 && (
          <ul className={s.wrong} aria-label="Wrong guesses">
            {round.wrong.map((id) => (
              <li key={id}>
                <Icon name="close" /> {placeById(set, id)?.name ?? id}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={s.dock}>
        {open && options.length > 0 && (
          <ul className={s.options} id={listId} role="listbox" aria-orientation="horizontal" aria-label={`Matching ${set.noun}s`}>
            {options.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                aria-disabled={tried.has(p.id) || undefined}
                className={`${s.option} ${i === active ? s.optionActive : ''} ${tried.has(p.id) ? s.optionTried : ''}`}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  setText(p.name);
                  setOpen(false);
                  void submit(p);
                }}
              >
                {p.name}
              </li>
            ))}
          </ul>
        )}
        <motion.form className={s.form} onSubmit={onSubmit} animate={shake}>
          <input
            ref={inputRef}
            className={s.input}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              setFocused(true);
              // Stop the browser scrolling the page to "reveal" the input: the screen already fits.
              requestAnimationFrame(() => window.scrollTo(0, 0));
            }}
            onBlur={() =>
              setTimeout(() => {
                setOpen(false);
                setFocused(false);
              }, 120)
            }
            onKeyDown={onKey}
            placeholder={`Type a ${set.noun}…`}
            aria-label={`Your guess: type a ${set.noun}`}
            role="combobox"
            aria-expanded={open && options.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && options.length ? `${listId}-${active}` : undefined}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint="go"
            // readOnly, not disabled: disabling would close the phone keyboard after every guess.
            readOnly={busy}
          />
          <Button type="submit" className={s.go} disabled={busy || !text.trim()} onPointerDown={(e) => e.preventDefault()}>
            Guess
          </Button>
        </motion.form>
      </div>
    </div>
  );

  // Rendered at <body> level so no animated (transformed) ancestor can break position: fixed.
  return createPortal(body, document.body);
}
