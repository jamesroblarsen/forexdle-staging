// Pure game logic, shared by the browser (game.js) and the tests. No DOM here.

export const MAX_GUESSES = 6;
const KEY = 'forexdle';

// 'YYYY' (annual average) sits mid-year; 'YYYY-MM' (monthly average) sits mid-month.
export function toX(t) {
  const [y, m] = t.split('-').map(Number);
  return m ? y + (m - 0.5) / 12 : y + 0.5;
}

// A month label for a point or an event date.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function label(t) {
  const [y, m] = t.split('-');
  return m ? `${MONTHS[Number(m) - 1]} ${y}` : `${y} (yearly average)`;
}

// A log scale once the currency's value has moved more than fourfold, so collapses stay readable.
export const useLog = (values) => Math.max(...values) / Math.min(...values) > 4;

// Value of one unit in US dollars, written the way a player reads it.
export function formatUsd(v) {
  if (v >= 100) return `$${Math.round(v)}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.1) return `${(v * 100).toFixed(1)}¢`;
  if (v >= 0.0001) return `${Number((v * 100).toPrecision(2))}¢`;
  return `$${v.toExponential(1)}`;
}

// Axis labels: whole dollars without ".00".
export const formatTick = (v) => (v >= 1 && Number.isInteger(v) ? `$${v}` : formatUsd(v));

// Units of the currency one US dollar buys.
export function perUsd(v) {
  const n = 1 / v;
  if (n >= 1000) return Math.round(n).toLocaleString('en-US');
  if (n >= 10) return n.toFixed(1);
  if (n >= 0.01) return n.toFixed(3);
  return n.toPrecision(2);
}

// Axis ticks. Linear: 4-6 round steps. Log: 1-2-5 steps, thinned to at most 7.
export function ticks(min, max, log) {
  if (log) {
    const out = [];
    for (let e = Math.floor(Math.log10(min)) - 1; e <= Math.ceil(Math.log10(max)) + 1; e++) {
      for (const m of [1, 2, 5]) {
        const v = m * 10 ** e;
        if (v >= min && v <= max) out.push(Number(v.toPrecision(3)));
      }
    }
    if (out.length <= 7) return out;
    return out.filter((v) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9);
  }
  const raw = (max - min) / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw);
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(6)));
  return out;
}

// Year ticks for the time axis.
export function yearTicks(x0, x1, width = 680) {
  const span = x1 - x0;
  const fit = Math.max(3, Math.floor(width / 55));
  const step = [1, 2, 5, 10, 20, 25, 50].find((s) => span / s <= fit) ?? 50;
  const out = [];
  for (let y = Math.ceil(x0 / step) * step; y <= x1; y += step) out.push(y);
  return out;
}

// Guess matching: case, accents and spacing don't matter; names, codes and aliases all count.
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
export function findCurrency(input, currencies) {
  const q = norm(input);
  if (!q) return null;
  return currencies.find((c) => norm(c.name) === q || c.id.toLowerCase() === q || (c.aliases ?? []).some((a) => norm(a) === q)) ?? null;
}

// One puzzle per calendar day, counted in the player's own time zone. Day 1 is the epoch.
export function dayNumber(epoch, now = new Date()) {
  const [y, m, d] = epoch.split('-').map(Number);
  return Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 86400000) + 1;
}
export const puzzleIndex = (day, count) => (((day - 1) % count) + count) % count;

// How many event lines show: one per wrong guess, all of them once the game is over.
export function revealed(state, eventCount) {
  if (state.status !== 'playing') return eventCount;
  return Math.min(state.guesses.length, eventCount);
}

// Apply a guess (a currency id) to a state. Returns a new state.
export function applyGuess(state, id, answerId) {
  if (state.status !== 'playing' || state.guesses.includes(id)) return state;
  const guesses = [...state.guesses, id];
  const status = id === answerId ? 'won' : guesses.length >= MAX_GUESSES ? 'lost' : 'playing';
  return { ...state, guesses, status };
}

export function shareText(day, state, answerId, url) {
  const score = state.status === 'won' ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const squares = state.guesses.map((g) => (g === answerId ? '🟩' : '🟥')).join('');
  return `Forexdle #${day} ${score}\n${squares}\n${url}`;
}

// The calendar ships scrambled, so the answers aren't readable at a glance in the page source.
export function encode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b, i) => { bin += String.fromCharCode(b ^ KEY.charCodeAt(i % KEY.length)); });
  return btoa(bin);
}
export function decode(b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ KEY.charCodeAt(i % KEY.length));
  return new TextDecoder().decode(bytes);
}
