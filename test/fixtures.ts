import type { Question } from '../shared/types';

export function makeDay(date: string, answers: number[], status: Question['status'] = 'approved', idPrefix = date): Question[] {
  return answers.map((answer, i) => ({
    id: `${idPrefix}-${i + 1}`,
    date,
    order: i + 1,
    edition: 'ie',
    question: `Question ${i + 1}?`,
    answer,
    year: 2024,
    source_name: 'Test source',
    source_url: 'https://example.com/source',
    nugget: 'Test nugget.',
    comparisons: [{ label: 'EU', value: 50 }],
    difficulty: 'easy',
    status,
  }));
}
