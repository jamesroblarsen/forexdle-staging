// Draws the value chart as SVG: the currency's whole history, red event lines, and a hover readout.
import { formatTick, formatUsd, label, perUsd, ticks, toX, useLog, yearTicks } from './logic.0ba3ef614a.js';

const NS = 'http://www.w3.org/2000/svg';
// The drawing is sized to its container in pixels, so labels stay 12px on a phone instead of shrinking.
const L = 54, R = 14, T = 38, B = 28;

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// The kind of regime a label describes, for its shade.
export function regimeType(label) {
  if (/free/i.test(label)) return 'free';
  if (/fixed|peg|board|floor|cap|gold/i.test(label)) return 'fixed';
  return 'managed';
}

export function drawChart(wrap, points, events, shown, regimes = []) {
  wrap.textContent = '';
  const W = Math.max(300, Math.round(wrap.clientWidth || 680));
  const H = Math.round(Math.min(360, Math.max(260, W * 0.55)));
  const xs = points.map((p) => toX(p.t));
  const vs = points.map((p) => p.v);
  const log = useLog(vs);
  const x0 = Math.floor(xs[0]), x1 = Math.ceil(xs.at(-1));
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (log) { lo /= 1.25; hi *= 1.25; } else { const pad = (hi - lo) * 0.12 || hi * 0.1; lo = Math.max(0, lo - pad); hi += pad; }
  const f = log ? Math.log10 : (v) => v;
  const X = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - (f(v) - f(lo)) / (f(hi) - f(lo))) * (H - T - B);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `Value of one unit in US dollars, ${x0} to ${x1}${log ? ', log scale' : ''}` }, wrap);

  // How it was managed: blue zones shaded by type (fixed darkest, managed, free float lightest). Labels go on
  // the chart in the bottom half: across the zone where it fits, otherwise written upwards beside its edge.
  // (Red event titles use the top half, so the two never meet.)
  const zones = [];
  regimes.forEach((r, i) => {
    const a = X(Math.max(toX(r.from) - 0.5 / 12, x0)), b = X(r.to ? Math.min(toX(r.to) - 0.5 / 12, x1) : x1);
    if (b <= a) return;
    el('rect', { x: a, y: T, width: b - a, height: H - T - B, class: `zone ${regimeType(r.label)}`, 'data-regime': String(i + 1) }, svg);
    if (i > 0) el('line', { x1: a, x2: a, y1: T, y2: H - B, class: 'zone-edge' }, svg);
    zones.push({ a, b, text: r.label });
  });
  // Widest zones claim their label spot first; a sideways label that would sit on top of another is dropped
  // (the clue card's text still tells the whole story).
  const zoneLabels = [];
  for (const z of [...zones].sort((p, q) => (q.b - q.a) - (p.b - p.a))) {
    const w = z.text.length * 5.8;
    const label = z.b - z.a > w + 8 ? { x: (z.a + z.b) / 2, y: H - B - 8, anchor: 'middle', text: z.text, span: [z.a + (z.b - z.a - w) / 2, z.a + (z.b - z.a + w) / 2] }
      : z.b - z.a >= 14 ? { x: z.a + 3, y: H - B - 6, rotate: true, text: z.text, span: [z.a + 1, z.a + 16] }
      : { x: z.a - 3, y: H - B - 6, rotate: true, left: true, text: z.text, span: [z.a - 16, z.a - 1] };
    if (zoneLabels.some((o) => label.span[0] < o.span[1] && o.span[0] < label.span[1] && (label.rotate || o.rotate))) continue;
    zoneLabels.push(label);
  }

  for (const v of ticks(lo, hi, log)) {
    el('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'grid' }, svg);
    el('text', { x: L - 8, y: Y(v) + 4, class: 'tick', 'text-anchor': 'end' }, svg).textContent = formatTick(v);
  }
  for (const y of yearTicks(x0, x1, W - L - R)) {
    el('text', { x: X(y), y: H - 8, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = String(y);
  }

  // Area, then the line: dashed where only yearly averages exist, solid where monthly data starts.
  const firstMonthly = points.findIndex((p) => p.t.includes('-'));
  const coords = points.map((p, i) => `${X(xs[i]).toFixed(1)},${Y(p.v).toFixed(1)}`);
  el('path', { d: `M${X(xs[0])},${H - B} L${coords.join(' L')} L${X(xs.at(-1))},${H - B} Z`, class: 'area' }, svg);
  if (firstMonthly > 0) el('path', { d: `M${coords.slice(0, firstMonthly + 1).join(' L')}`, class: 'line annual' }, svg);
  el('path', { d: `M${coords.slice(Math.max(firstMonthly, 0)).join(' L')}`, class: 'line' }, svg);

  for (const z of zoneLabels) {
    const attrs = { x: z.x, y: z.y, class: 'zone-label', 'text-anchor': z.anchor ?? 'start' };
    if (z.rotate) Object.assign(attrs, { 'dominant-baseline': z.left ? 'auto' : 'hanging', transform: `rotate(-90 ${z.x} ${z.y})` });
    el('text', attrs, svg).textContent = z.text;
  }

  // Event lines, numbered in reveal order. Close numbers sit on two rows.
  const placed = [];
  const titled = [];
  events.slice(0, shown).forEach((e, k) => {
    const x = X(Math.min(Math.max(toX(e.date), x0), x1));
    const row = placed.some((p) => p.row === 0 && Math.abs(p.x - x) < 18) ? 1 : 0;
    placed.push({ x, row });
    const cy = row ? 28 : 11;
    const g = el('g', { class: 'event', 'data-event': String(k + 1) }, svg);
    el('line', { x1: x, x2: x, y1: cy + 8, y2: H - B, class: 'event-line' }, g);
    el('circle', { cx: x, cy, r: 8.5, class: 'event-dot' }, g);
    el('text', { x, y: cy + 4, class: 'event-num', 'text-anchor': 'middle' }, g).textContent = String(k + 1);
    // The event's short title, written down the line on its right (on its left near the right edge).
    // A title that would overprint an earlier one is left off (on phones, lines a year or two apart touch);
    // its number still links it to the caption below the chart.
    if (e.title && !titled.some((t) => Math.abs(t - x) < 13)) {
      titled.push(x);
      const flip = x > W - R - 16;
      const tx = flip ? x - 4 : x + 4, ty = T + 4;
      el('text', { x: tx, y: ty, class: 'event-title', 'text-anchor': 'start', 'dominant-baseline': flip ? 'auto' : 'hanging', transform: `rotate(90 ${tx} ${ty})` }, g).textContent = e.title;
    }
  });

  // Hover readout.
  const cross = el('line', { y1: T, y2: H - B, class: 'cross', visibility: 'hidden' }, svg);
  const dot = el('circle', { r: 5, class: 'hover-dot', visibility: 'hidden' }, svg);
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  wrap.appendChild(tip);
  const hit = el('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'hit' }, svg);
  const move = (ev) => {
    const box = svg.getBoundingClientRect();
    const sx = ((ev.clientX - box.left) / box.width) * W;
    const xv = x0 + ((sx - L) / (W - L - R)) * (x1 - x0);
    let i = 0;
    for (let a = 0, b = xs.length - 1; a <= b;) { const m = (a + b) >> 1; if (xs[m] < xv) a = m + 1; else b = m - 1; i = a; }
    if (i > 0 && (i >= xs.length || xv - xs[i - 1] < xs[i] - xv)) i -= 1;
    const p = points[i], px = X(xs[i]), py = Y(p.v);
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `<strong>${label(p.t)}</strong><br>1 unit = ${formatUsd(p.v)}<br>US$1 = ${perUsd(p.v)} units`;
    const left = (px / W) * box.width;
    tip.style.left = `${Math.min(Math.max(left, 70), box.width - 70)}px`;
    tip.style.top = `${(py / H) * box.height}px`;
    tip.classList.toggle('below', py < H / 2);
  };
  const leave = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', leave);
  return { log };
}
