/**
 * Flags drawn as inline SVG: flag emoji don't render on Windows or on Linux
 * without an emoji font, and we don't load any outside assets.
 */
const FLAGS: Record<string, string[]> = {
  ie: ['#169b62', '#ffffff', '#ff883e'], // vertical tricolour
};

export function flag(code: string, label: string): HTMLElement | SVGSVGElement {
  const colours = FLAGS[code];
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 30 20');
  svg.setAttribute('class', 'flag');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  (colours ?? ['#888', '#aaa', '#ccc']).forEach((fill, i) => {
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', String(i * 10));
    r.setAttribute('width', '10.2');
    r.setAttribute('height', '20');
    r.setAttribute('fill', fill);
    svg.append(r);
  });
  const border = document.createElementNS(ns, 'rect');
  for (const [k, v] of Object.entries({ x: '0.5', y: '0.5', width: '29', height: '19', rx: '2', fill: 'none', stroke: 'currentColor', 'stroke-opacity': '0.25' }))
    border.setAttribute(k, v);
  svg.append(border);
  return svg;
}
