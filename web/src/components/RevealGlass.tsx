import { motion, useReducedMotion } from 'motion/react';
import { fmt } from '../lib/format';
import s from './RevealGlass.module.css';

/**
 * Narrow glass for the reveal hero card: tangerine fill at the guess, then
 * (phase ≥ 1) a cyan answer line drops in on a spring, with the gap hatched.
 * `skipped` renders the end state at once.
 */
export function RevealGlass({ guess, answer, phase, skipped }: { guess: number; answer: number; phase: number; skipped: boolean }) {
  const reduced = useReducedMotion() ?? false;
  const instant = skipped || reduced;
  const lo = Math.min(guess, answer);
  const hi = Math.max(guess, answer);
  return (
    <div className={s.glass} role="img" aria-label={`Your guess ${guess}%. The answer ${fmt(answer)}%.`}>
      {[25, 50, 75].map((t) => (
        <i key={t} className={s.tick} style={{ bottom: `${t}%` }} aria-hidden="true" />
      ))}
      <motion.div
        className={s.liquid}
        initial={instant ? false : { height: '0%' }}
        animate={{ height: `${guess}%` }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <div className={s.surface}>
          <svg className={`${s.wave} ${reduced ? '' : s.waveMoving}`} viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 10 Q12.5 5 25 10 T50 10 T75 10 T100 10 T125 10 T150 10 T175 10 T200 10 V20 H0 Z" />
          </svg>
        </div>
      </motion.div>
      {phase >= 1 && (
        <>
          <motion.div
            className={s.hatch}
            style={{ bottom: `${lo}%`, height: `${hi - lo}%` }}
            initial={instant ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: instant ? 0 : 0.18, duration: 0.2 }}
            aria-hidden="true"
          />
          <motion.div
            className={s.answerLine}
            style={{ bottom: `${answer}%` }}
            initial={instant ? false : { y: -240, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22, mass: 0.8 }}
            aria-hidden="true"
          />
        </>
      )}
    </div>
  );
}
