import type { Block } from '../../../shared/types';
import { closeness, closenessLabel } from '../lib/closeness';
import s from './Progress.module.css';

/** Five segments: finished ones coloured by closeness, current in paper, upcoming raised. */
export function Progress({ blocks, current }: { blocks: Block[]; current: number }) {
  return (
    <ol className={s.steps} aria-label={`Question ${current + 1} of 5`}>
      {Array.from({ length: 5 }, (_, i) => {
        const b = blocks[i];
        const cls = b ? s[closeness(b)] : i === current ? s.current : s.upcoming;
        const label = b ? `Question ${i + 1}: ${closenessLabel[closeness(b)]}` : i === current ? `Question ${i + 1}: current` : `Question ${i + 1}: not yet`;
        return (
          <li key={i} className={`${s.step} ${cls}`}>
            <span className="visually-hidden">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
