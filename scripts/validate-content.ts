/**
 * npm run validate-content [-- path/to/questions.json] [--allow-drafts]
 * Exit code 1 on errors; warnings alone still pass.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dublinDate } from '../shared/day';
import { validateContent } from '../shared/validate';

const args = process.argv.slice(2);
const allowDrafts = args.includes('--allow-drafts') || process.env.ALLOW_DRAFTS === '1';
const file = resolve(args.find((a) => !a.startsWith('--')) ?? 'content/questions.json');

let data: unknown;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`✖ Could not read ${file}: ${(e as Error).message}`);
  process.exit(1);
}

const { errors, warnings, questions } = validateContent(data, { today: dublinDate(new Date()), allowDrafts });
const approved = questions.filter((q) => q.status === 'approved').length;
console.log(`${file}: ${questions.length} valid questions (${approved} approved)${allowDrafts ? ' [drafts allowed]' : ''}`);
for (const w of warnings) console.warn(`⚠ ${w}`);
for (const e of errors) console.error(`✖ ${e}`);
if (errors.length) {
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}
console.log(`✔ OK${warnings.length ? ` with ${warnings.length} warning(s)` : ''}`);
