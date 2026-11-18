import type { ReactNode } from 'react';
import { Pill, Wordmark } from './ui';
import s from './TopBar.module.css';

export function TopBar({ puzzle, edition, streak, right }: { puzzle: number; edition: string; streak: number; right?: ReactNode }) {
  return (
    <header className={s.bar}>
      <div className={s.left}>
        <Wordmark />
        <span className={s.puzzle}>#{puzzle}</span>
      </div>
      <div className={s.right}>
        {right ?? (
          <>
            <Pill>
              <span aria-label={`${editionLabel(edition)} edition`}>{editionLabel(edition)}</span>
            </Pill>
            {streak > 0 && <Pill tone="streak">{streak}-day streak</Pill>}
          </>
        )}
      </div>
    </header>
  );
}

export const editionLabel = (code: string) => (code === 'ww' ? 'World' : code.toUpperCase());
