import type { Block } from './types';
import { MAX_TOTAL } from './scoring';

const EMOJI: Record<Block, string> = {
  green: '🟩',
  yellow: '🟨',
  orange: '🟧',
  red: '🟥',
};

export interface Edition {
  code: string;
  name: string;
  flag: string;
}

export const EDITIONS: Record<string, Edition> = {
  ie: { code: 'ie', name: 'Ireland', flag: '🇮🇪' },
  ww: { code: 'ww', name: 'World', flag: '🌍' },
};

export function editionInfo(code: string): Edition {
  return EDITIONS[code] ?? { code, name: code.toUpperCase(), flag: '🏳️' };
}

/**
 * Spoiler-free share text. Contains only the puzzle number, flag, total and
 * colour blocks — never questions, guesses or answers. The last line is a full
 * https:// URL, because chat apps such as WhatsApp only make a link tappable
 * when they recognise it as one (a bare "fewclues.app" often isn't).
 */
export function shareText(opts: {
  puzzle: number;
  flag: string;
  total: number;
  blocks: Block[];
  siteHost: string;
}): string {
  return [
    `Few Clues #${opts.puzzle} ${opts.flag} ${opts.total}/${MAX_TOTAL}`,
    opts.blocks.map((b) => EMOJI[b]).join(''),
    `https://${opts.siteHost}`,
  ].join('\n');
}
