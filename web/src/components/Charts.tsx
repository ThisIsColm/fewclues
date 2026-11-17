import { motion, useReducedMotion } from 'motion/react';
import { binFor, binLabel } from '../../../shared/scoring';
import type { Comparison } from '../../../shared/types';
import { fmt } from '../lib/format';
import s from './Charts.module.css';

export function Histogram({ bins, guess, answer, instant }: { bins: number[]; guess: number; answer: number; instant: boolean }) {
  const reduced = useReducedMotion() ?? false;
  const max = Math.max(1, ...bins);
  const mine = binFor(guess);
  const ans = binFor(answer);
  const skip = instant || reduced;
  return (
    <>
      <div className={s.hist} aria-hidden="true">
        {bins.map((n, i) => {
          const h = n === 0 ? 0 : Math.max(5, (n / max) * 100);
          return (
            <div key={i} className={s.col} title={`${binLabel(i)}: ${n}`}>
              <motion.div
                className={`${s.bar} ${i === mine ? s.mine : ''} ${i === ans ? s.answer : ''} ${n === 0 && i === ans ? s.empty : ''}`}
                style={{ height: n === 0 && i === ans ? '6px' : `${h}%`, originY: 1 }}
                initial={skip ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26, delay: skip ? 0 : i * 0.035 }}
              />
            </div>
          );
        })}
      </div>
      <div className={s.axis} aria-hidden="true">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
      <div className={s.legend} aria-hidden="true">
        <span><i className={s.keyMine} /> Your guess</span>
        <span><i className={s.keyAnswer} /> Answer</span>
      </div>
      <table className="visually-hidden">
        <caption>How everyone guessed, by range</caption>
        <tbody>
          {bins.map((n, i) => (
            <tr key={i}>
              <th scope="row">
                {binLabel(i)}
                {i === mine ? ' (your guess)' : ''}
                {i === ans ? ' (the answer)' : ''}
              </th>
              <td>{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function Compare({ home, answer, comparisons, instant }: { home: string; answer: number; comparisons: Comparison[]; instant: boolean }) {
  const reduced = useReducedMotion() ?? false;
  const skip = instant || reduced;
  const rows = [{ label: home, value: answer, home: true }, ...comparisons.map((c) => ({ ...c, home: false }))].sort((a, b) => b.value - a.value);
  return (
    <ul className={s.cmp}>
      {rows.map((r, i) => (
        <li key={r.label} className={r.home ? s.home : ''}>
          <span className={s.cmpLabel}>{r.label}</span>
          <span className={s.cmpTrack} aria-hidden="true">
            <motion.span
              className={s.cmpBar}
              style={{ width: `${r.value}%`, originX: 0 }}
              initial={skip ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 28, delay: skip ? 0 : 0.05 * i }}
            />
          </span>
          <span className={`${s.cmpVal} num`}>{fmt(r.value)}%</span>
        </li>
      ))}
    </ul>
  );
}
