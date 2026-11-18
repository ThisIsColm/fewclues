import type { Round } from '../shared/types';

/** Five rounds for a date; answers default to five distinct counties. */
export function makeDay(date: string, answers = ['kerry', 'cork', 'mayo', 'meath', 'antrim'], status: Round['status'] = 'approved'): Round[] {
  return answers.map((answer, i) => ({
    id: `${date}-${i + 1}`,
    date,
    order: i + 1,
    edition: 'ie',
    set: 'ie-counties',
    answer,
    category: 'Test',
    clues: [`Hard clue ${i + 1}.`, `Medium clue ${i + 1}.`, `Easier clue ${i + 1}.`, `Easy clue ${i + 1}.`],
    fact: 'Test fact.',
    source_name: 'Test source',
    source_url: 'https://example.com/source',
    difficulty: 'easy',
    status,
  }));
}
