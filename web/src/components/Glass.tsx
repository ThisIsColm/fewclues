import { Num } from './Num';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
} from 'motion/react';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { haptic, tickFor } from '../lib/haptics';
import s from './Glass.module.css';

/** Extra travel so that at 0% the wave crest sits fully below the rim. */
const BELOW = 10;
const NUMBER_ROOM = 124; // px needed above the surface for the big number (+ wave crest)

export interface GlassProps {
  /** Target value 0–100 (fractional while dragging). Owned by the parent. */
  value: MotionValue<number>;
  frozen?: boolean;
  /** Bump to make the liquid slosh (lock-in). */
  sloshKey?: number;
  /** Set to 1 while a finger/pointer is down (numbers skip their roll animation then). */
  dragging: MotionValue<number>;
}

/**
 * The pouring glass. Drag up/down anywhere to set the value. Everything that
 * moves per frame is a motion value bound to `transform`, so dragging never
 * re-renders React; only the number re-renders, once per whole percent.
 */
export const Glass = memo(function Glass({ value, frozen = false, sloshKey = 0, dragging }: GlassProps) {
  const reduced = useReducedMotion() ?? false;
  const el = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const height = useMotionValue(400);

  // Spring-follow the target; underdamped just enough to feel like liquid.
  const spring = useSpring(value, { stiffness: 420, damping: 30, mass: 0.7 });
  const level = reduced ? value : spring;

  // Surface position in px from the top of the glass.
  const surfaceY = useTransform(() => (1 - level.get() / 100) * (height.get() + BELOW));
  const invY = useTransform(() => -surfaceY.get());

  // Slosh: tilt follows vertical velocity through a wobbly spring, plus a kick channel.
  const velocity = useVelocity(spring);
  const tiltTarget = useTransform(velocity, (v) => (reduced ? 0 : Math.max(-5, Math.min(5, -v * 0.03))));
  const tilt = useSpring(tiltTarget, { stiffness: 160, damping: 7, mass: 0.6 });
  const kick = useMotionValue(0);
  const rotate = useTransform(() => (reduced ? 0 : tilt.get() + kick.get()));

  useLayoutEffect(() => {
    const node = el.current!;
    const ro = new ResizeObserver(([e]) => {
      height.set(e.contentRect.height);
      node.style.setProperty('--glass-h', `${e.contentRect.height}px`);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [height]);

  // Keep the backing <input type="range"> in sync and fire haptic ticks.
  const lastInt = useRef(Math.round(value.get()));
  useMotionValueEvent(value, 'change', (v) => {
    const n = Math.round(v);
    if (n === lastInt.current) return;
    const kind = tickFor(lastInt.current, n);
    if (kind) haptic(kind, kind === 'heavy' ? 0 : 30);
    lastInt.current = n;
    if (input.current) {
      input.current.value = String(n);
      input.current.setAttribute('aria-valuetext', `${n}%`);
    }
  });

  // Lock-in slosh.
  useEffect(() => {
    if (!sloshKey || reduced) return;
    const c = animate(kick, [0, -10, 7, -4, 2, 0], { duration: 0.7, ease: 'easeOut' });
    return () => c.stop();
  }, [sloshKey, kick, reduced]);

  // Relative drag: anywhere on the glass, up = more.
  const drag = useRef<{ id: number; y: number; v: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (frozen) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, y: e.clientY, v: value.get() };
    dragging.set(1);
    input.current?.focus({ preventScroll: true });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const h = height.get() || 1;
    let v = d.v + ((d.y - e.clientY) / h) * 100;
    if (v < 0 || v > 100) {
      // Re-anchor at the rim so reversing direction responds immediately.
      v = Math.max(0, Math.min(100, v));
      drag.current = { ...d, y: e.clientY, v };
    }
    value.set(v);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    dragging.set(0);
    value.set(Math.round(value.get()));
    // A release thump. On iPhone this is the only drag haptic WebKit allows:
    // it plays haptics only inside a tap (pointerup/click), never on pointermove.
    haptic('medium', 0);
    if (!reduced) animate(kick, [0, 2.5, -1.5, 0], { duration: 0.5 });
  };

  return (
    <div
      ref={el}
      className={`${s.glass} ${frozen ? s.frozen : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Ticks />
      <motion.div className={s.liquid} style={{ y: surfaceY }} aria-hidden="true">
        <motion.div className={s.surface} style={{ rotate }}>
          <svg className={`${s.wave} ${reduced ? '' : s.waveMoving}`} viewBox="0 0 200 36" preserveAspectRatio="none">
            <path d="M0 18 Q12.5 11 25 18 T50 18 T75 18 T100 18 T125 18 T150 18 T175 18 T200 18 V36 H0 Z" />
          </svg>
          {/* Solid tail: when the surface tilts, its edges can't lift clear of the body. */}
          <div className={s.tail} />
        </motion.div>
        <div className={s.body}>
          {/* Dark copy of the ticks, visible only where the liquid covers them. */}
          <motion.div className={s.inner} style={{ y: invY }}>
            <Ticks dark />
          </motion.div>
        </div>
      </motion.div>
      <GlassNumber value={value} surfaceY={surfaceY} dragging={dragging} />
      <input
        ref={input}
        className={`visually-hidden ${s.range}`}
        type="range"
        min={0}
        max={100}
        step={1}
        defaultValue={Math.round(value.get())}
        aria-label="Your guess in percent"
        aria-valuetext={`${Math.round(value.get())}%`}
        disabled={frozen}
        onChange={(e) => value.set(+e.currentTarget.value)}
      />
    </div>
  );
});

/** The big number rides above the surface, or just under it when there's no room. */
function GlassNumber({ value, surfaceY, dragging }: { value: MotionValue<number>; surfaceY: MotionValue<number>; dragging: MotionValue<number> }) {
  const [n, setN] = useState(() => Math.round(value.get()));
  const animated = useAnimatedWhenIdle(dragging);
  const [below, setBelow] = useState(false);
  useMotionValueEvent(value, 'change', (v) => setN(Math.round(v)));
  useMotionValueEvent(surfaceY, 'change', (y) => {
    const b = y < NUMBER_ROOM;
    if (b !== below) setBelow(b);
  });
  const offset = useSpring(below ? 16 : -NUMBER_ROOM, { stiffness: 500, damping: 40 });
  useEffect(() => offset.set(below ? 16 : -NUMBER_ROOM), [below, offset]);
  const y = useTransform(() => surfaceY.get() + offset.get());
  return (
    <motion.div className={`${s.number} ${below ? s.numberDark : ''}`} style={{ y }} aria-hidden="true">
      <Num value={n} animated={animated} transformTiming={{ duration: 220, easing: 'ease-out' }} spinTiming={{ duration: 220, easing: 'ease-out' }} />
      <span className={s.pct}>%</span>
    </motion.div>
  );
}

const TICKS = [10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90];
function Ticks({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`${s.ticks} ${dark ? s.ticksDark : ''}`} aria-hidden="true">
      {TICKS.map((t) => {
        const major = t === 25 || t === 50 || t === 75;
        if (!major && t % 10) return null;
        return (
          <div key={t} className={`${s.tick} ${major ? s.major : ''}`} style={{ bottom: `${t}%` }}>
            {major && <span>{t}</span>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * NumberFlow measures layout (getBoundingClientRect) for every animated change.
 * While a finger is dragging that's up to 60 forced layouts a second, so the
 * roll is switched off during a drag and back on for taps, keys and release.
 */
export function useAnimatedWhenIdle(dragging: MotionValue<number>) {
  const [idle, setIdle] = useState(dragging.get() === 0);
  useMotionValueEvent(dragging, 'change', (v) => setIdle(v === 0));
  return idle;
}
