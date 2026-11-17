import { Num } from '../components/Num';
import { useMotionValue, useMotionValueEvent, type MotionValue } from 'motion/react';
import { useState } from 'react';
import type { Block, GuessResponse, PublicQuestion } from '../../../shared/types';
import { Glass, useAnimatedWhenIdle } from '../components/Glass';
import { Progress } from '../components/Progress';
import { TopBar } from '../components/TopBar';
import { Button, toast } from '../components/ui';
import { ApiError, postGuess } from '../lib/api';
import { haptic } from '../lib/haptics';
import s from './screens.module.css';

const MIN_LOCK_MS = 420; // long enough to see the slosh, short enough to never feel blocked

export function Guess(props: {
  q: PublicQuestion;
  index: number;
  blocks: Block[];
  puzzle: number;
  edition: string;
  streak: number;
  playerId: string;
  onLocked: (res: GuessResponse) => void;
  onStale: () => void;
}) {
  const { q, index } = props;
  const value = useMotionValue(50);
  const dragging = useMotionValue(0);
  const [frozen, setFrozen] = useState(false);
  const [slosh, setSlosh] = useState(0);

  async function lock() {
    if (frozen) return;
    const guess = Math.round(value.get());
    value.set(guess);
    setFrozen(true);
    setSlosh((k) => k + 1);
    haptic('heavy', 0);
    const started = performance.now();
    try {
      const res = await postGuess(props.playerId, q.id, guess);
      const wait = MIN_LOCK_MS - (performance.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      props.onLocked(res);
    } catch (e) {
      setFrozen(false);
      if (e instanceof ApiError && e.code === 'stale') {
        toast(e.message);
        props.onStale();
      } else toast(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  return (
    <div className={`${s.screen} ${s.guess}`}>
      <TopBar puzzle={props.puzzle} edition={props.edition} streak={props.streak} />
      <Progress blocks={props.blocks} current={index} />
      <p className={s.qLabel}>
        Question {index + 1} of 5{q.category ? ` · ${q.category}` : ''}
      </p>
      <h1 className={s.qText} tabIndex={-1} data-autofocus>
        {q.question}
      </h1>
      <Glass value={value} frozen={frozen} sloshKey={slosh} dragging={dragging} />
      <p className={s.hint}>Drag up or down anywhere on the glass</p>
      <Button onClick={lock} disabled={frozen} aria-live="off">
        <LockLabel value={value} dragging={dragging} />
      </Button>
    </div>
  );
}

/** "Lock in 64%" — subscribes to the value itself so the screen doesn't re-render. */
function LockLabel({ value, dragging }: { value: MotionValue<number>; dragging: MotionValue<number> }) {
  const [n, setN] = useState(() => Math.round(value.get()));
  const animated = useAnimatedWhenIdle(dragging);
  useMotionValueEvent(value, 'change', (v) => setN(Math.round(v)));
  return (
    <span>
      Lock in <Num value={n} animated={animated} style={{ letterSpacing: '-0.01em' }} transformTiming={{ duration: 160 }} spinTiming={{ duration: 160 }} />%
    </span>
  );
}
