import type { Block } from '../../../shared/types';

/**
 * The closeness scale used everywhere in the UI. It maps onto the share
 * blocks one-to-one (≤3, ≤10, ≤20, >20), so the share text is unchanged.
 */
export type Closeness = 'c1' | 'c2' | 'c3' | 'c4';

const MAP: Record<Block, Closeness> = { green: 'c1', yellow: 'c2', orange: 'c3', red: 'c4' };
export const closeness = (b: Block): Closeness => MAP[b];

export const closenessLabel: Record<Closeness, string> = {
  c1: 'off by 3 or less',
  c2: 'off by 10 or less',
  c3: 'off by 20 or less',
  c4: 'off by more than 20',
};
