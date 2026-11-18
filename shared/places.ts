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

const slug = (n: string) =>
  n
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const country = (region: string) => (entry: string | [string, ...string[]]): Place => {
  const [name, ...aliases] = typeof entry === 'string' ? [entry] : entry;
  return { id: slug(name), name, region, aliases: aliases.length ? aliases : undefined };
};

/**
 * The 193 UN member states plus the two observer states (Vatican City, Palestine).
 * Grouped by continent, which is shown as a hint next to suggestions.
 */
export const WORLD_COUNTRIES: PlaceSet = {
  id: 'world-countries',
  noun: 'country',
  regionNoun: 'continent',
  places: [
    ...(
      [
        'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', ['Cabo Verde', 'Cape Verde'], 'Cameroon',
        ['Central African Republic', 'CAR'], 'Chad', 'Comoros',
        ['DR Congo', 'Democratic Republic of the Congo', 'DRC', 'Congo-Kinshasa', 'Zaire'],
        ['Republic of the Congo', 'Congo', 'Congo-Brazzaville'], 'Djibouti', 'Egypt', 'Equatorial Guinea', 'Eritrea',
        ['Eswatini', 'Swaziland'], 'Ethiopia', 'Gabon', ['Gambia', 'The Gambia'], 'Ghana', 'Guinea', 'Guinea-Bissau',
        ['Ivory Coast', "Côte d'Ivoire", 'Cote dIvoire'], 'Kenya', 'Lesotho', 'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali',
        'Mauritania', 'Mauritius', 'Morocco', 'Mozambique', 'Namibia', 'Niger', 'Nigeria', 'Rwanda',
        ['São Tomé and Príncipe', 'Sao Tome'], 'Senegal', 'Seychelles', 'Sierra Leone', 'Somalia', 'South Africa',
        'South Sudan', 'Sudan', 'Tanzania', 'Togo', 'Tunisia', 'Uganda', 'Zambia', 'Zimbabwe',
      ] as (string | [string, ...string[]])[]
    ).map(country('Africa')),
    ...(
      [
        'Afghanistan', 'Armenia', 'Azerbaijan', 'Bahrain', 'Bangladesh', 'Bhutan', 'Brunei', 'Cambodia', 'China', 'Georgia',
        'India', 'Indonesia', 'Iran', 'Iraq', 'Israel', 'Japan', 'Jordan', 'Kazakhstan', 'Kuwait', 'Kyrgyzstan', 'Laos',
        'Lebanon', 'Malaysia', 'Maldives', 'Mongolia', ['Myanmar', 'Burma'], 'Nepal', 'North Korea', 'Oman', 'Pakistan',
        'Palestine', 'Philippines', 'Qatar', 'Saudi Arabia', 'Singapore', ['South Korea', 'Korea'], 'Sri Lanka', 'Syria',
        'Tajikistan', 'Thailand', ['Timor-Leste', 'East Timor'], ['Turkey', 'Türkiye'], 'Turkmenistan',
        ['United Arab Emirates', 'UAE', 'Emirates'], 'Uzbekistan', ['Vietnam', 'Viet Nam'], 'Yemen',
      ] as (string | [string, ...string[]])[]
    ).map(country('Asia')),
    ...(
      [
        'Albania', 'Andorra', 'Austria', 'Belarus', 'Belgium', ['Bosnia and Herzegovina', 'Bosnia'], 'Bulgaria', 'Croatia',
        'Cyprus', ['Czechia', 'Czech Republic'], 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
        'Iceland', ['Ireland', 'Republic of Ireland', 'Eire'], 'Italy', 'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg',
        'Malta', 'Moldova', 'Monaco', 'Montenegro', ['Netherlands', 'Holland', 'The Netherlands'],
        ['North Macedonia', 'Macedonia'], 'Norway', 'Poland', 'Portugal', 'Romania', 'Russia', 'San Marino', 'Serbia',
        'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Ukraine',
        ['United Kingdom', 'UK', 'Britain', 'Great Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland'],
        ['Vatican City', 'Vatican', 'Holy See'],
      ] as (string | [string, ...string[]])[]
    ).map(country('Europe')),
    ...(
      [
        'Antigua and Barbuda', ['Bahamas', 'The Bahamas'], 'Barbados', 'Belize', 'Canada', 'Costa Rica', 'Cuba', 'Dominica',
        'Dominican Republic', 'El Salvador', 'Grenada', 'Guatemala', 'Haiti', 'Honduras', 'Jamaica', 'Mexico', 'Nicaragua',
        'Panama', ['Saint Kitts and Nevis', 'St Kitts'], ['Saint Lucia', 'St Lucia'],
        ['Saint Vincent and the Grenadines', 'St Vincent'], 'Trinidad and Tobago',
        ['United States', 'USA', 'US', 'America', 'United States of America'],
      ] as (string | [string, ...string[]])[]
    ).map(country('North America')),
    ...['Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Guyana', 'Paraguay', 'Peru', 'Suriname', 'Uruguay', 'Venezuela'].map(
      country('South America'),
    ),
    ...(
      [
        'Australia', 'Fiji', 'Kiribati', 'Marshall Islands', ['Micronesia', 'Federated States of Micronesia'], 'Nauru',
        ['New Zealand', 'NZ', 'Aotearoa'], 'Palau', ['Papua New Guinea', 'PNG'], 'Samoa', 'Solomon Islands', 'Tonga',
        'Tuvalu', 'Vanuatu',
      ] as (string | [string, ...string[]])[]
    ).map(country('Oceania')),
  ],
};

export const PLACE_SETS: Record<string, PlaceSet> = { [IE_COUNTIES.id]: IE_COUNTIES, [WORLD_COUNTRIES.id]: WORLD_COUNTRIES };

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
  // Only fall back to typo matches when nothing matches what was typed directly.
  const direct = scored.filter((x) => x.score <= 2);
  return (direct.length ? direct : scored)
    .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((x) => x.p);
}

/** The single place the text unambiguously means, if any (exact name/alias, or a lone suggestion). */
export function resolve(set: PlaceSet, typed: string): Place | undefined {
  const q = normalise(typed);
  const exact = set.places.find((p) => [p.name, ...(p.aliases ?? [])].some((n) => normalise(n) === q));
  if (exact) return exact;
  const s = suggest(set, typed, 2);
  return s.length === 1 ? s[0] : undefined;
}
