/**
 * Answer sets. Each round's answer is one place from a set; the player picks
 * from this list (with aliases and typo-tolerant matching), so a wrong
 * spelling is never marked as a wrong answer.
 */
export interface Place {
  id: string;
  name: string;
  /** Grouping used for an automatic clue, e.g. province or continent. */
  region: string;
  aliases?: string[];
}

export interface PlaceSet {
  id: string;
  noun: string; // "county"
  regionNoun: string; // "province"
  places: Place[];
}

const county = (name: string, region: string, aliases?: string[]): Place => ({ id: name.toLowerCase(), name, region, aliases });

/** The 32 traditional counties of the island of Ireland. */
export const IE_COUNTIES: PlaceSet = {
  id: 'ie-counties',
  noun: 'county',
  regionNoun: 'province',
  places: [
    ...['Carlow', 'Dublin', 'Kildare', 'Kilkenny', 'Laois', 'Longford', 'Louth', 'Meath', 'Offaly', 'Westmeath', 'Wexford', 'Wicklow'].map((n) =>
      county(n, 'Leinster', n === 'Laois' ? ['Laoighis', 'Leix'] : undefined),
    ),
    ...['Clare', 'Cork', 'Kerry', 'Limerick', 'Tipperary', 'Waterford'].map((n) => county(n, 'Munster', n === 'Tipperary' ? ['Tipp'] : undefined)),
    ...['Galway', 'Leitrim', 'Mayo', 'Roscommon', 'Sligo'].map((n) => county(n, 'Connacht')),
    ...['Antrim', 'Armagh', 'Cavan', 'Derry', 'Donegal', 'Down', 'Fermanagh', 'Monaghan', 'Tyrone'].map((n) =>
      county(n, 'Ulster', n === 'Derry' ? ['Londonderry'] : undefined),
    ),
  ],
};

export const PLACE_SETS: Record<string, PlaceSet> = { [IE_COUNTIES.id]: IE_COUNTIES };

export function placeById(set: PlaceSet, id: string): Place | undefined {
  return set.places.find((p) => p.id === id);
}

/** Lowercase, strip accents, punctuation and a leading "County"/"Co.". */
export function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/^\s*(county|co)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Edit distance where swapping two adjacent letters counts as one edit (optimal string alignment). */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/**
 * Suggestions for what's typed: exact and prefix matches first, then
 * substring, then close misspellings (edit distance ≤ 2).
 */
export function suggest(set: PlaceSet, typed: string, limit = 6): Place[] {
  const q = normalise(typed);
  if (!q) return [];
  const scored: { p: Place; score: number }[] = [];
  for (const p of set.places) {
    const names = [p.name, ...(p.aliases ?? [])].map(normalise);
    let score = Infinity;
    for (const n of names) {
      if (n === q) score = Math.min(score, 0);
      else if (n.startsWith(q)) score = Math.min(score, 1);
      else if (q.length >= 2 && n.includes(q)) score = Math.min(score, 2);
      else if (q.length >= 3) {
        // Typo tolerance: compare with the whole name and with its start (for half-typed names).
        const d = Math.min(editDistance(q, n), editDistance(q, n.slice(0, q.length)));
        if (d <= (q.length < 5 ? 1 : 2)) score = Math.min(score, 3 + d);
      }
    }
    if (score < Infinity) scored.push({ p, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name)).slice(0, limit).map((x) => x.p);
}

/** The single place the text unambiguously means, if any (exact name/alias, or a lone suggestion). */
export function resolve(set: PlaceSet, typed: string): Place | undefined {
  const q = normalise(typed);
  const exact = set.places.find((p) => [p.name, ...(p.aliases ?? [])].some((n) => normalise(n) === q));
  if (exact) return exact;
  const s = suggest(set, typed, 2);
  return s.length === 1 ? s[0] : undefined;
}
