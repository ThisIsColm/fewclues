export const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export const initial = (name: string) => ([...name.trim()][0] ?? '?').toLocaleUpperCase('en-IE');
export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
