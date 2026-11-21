import { drawChart } from './chart.06c499e2ab.js';
import { MAX_GUESSES, applyGuess, dayNumber, decode, findCurrency, puzzleIndex, revealed, shareText } from './logic.0ba3ef614a.js';

const URL_LIVE = 'https://fourthmeridiangames.com/forexdle/';
const $ = (id) => document.getElementById(id);

const raw = await (await fetch('daily.json', { cache: 'no-cache' })).json();
const { days, puzzles } = JSON.parse(decode(raw.data));
const currencies = raw.currencies;
const byId = Object.fromEntries(currencies.map((c) => [c.id, c]));

// ?day=N picks a day, on a local test server only.
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const asked = Number(new URLSearchParams(location.search).get('day'));
const day = local && asked >= 1 ? asked : Math.max(1, dayNumber(raw.epoch));
const puzzle = puzzles[days[puzzleIndex(day, days.length)]];
const answer = byId[puzzle.id];

const store = `forexdle:day:${day}`;
let state = { guesses: [], status: 'playing' };
try { state = { ...state, ...JSON.parse(localStorage.getItem(store) ?? '{}') }; } catch { /* private mode */ }
const save = () => { try { localStorage.setItem(store, JSON.stringify(state)); } catch { /* private mode */ } };

$('day-num').textContent = `#${day}`;
$('currency-list').innerHTML = currencies.map((c) => `<option value="${c.name}">`).join('');

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The caption without a lead-in that repeats the title ("Covid-19: its central bank..." under the title Covid-19).
function body(e) {
  if (!e.title || !e.text.toLowerCase().startsWith(e.title.toLowerCase())) return e.text;
  const rest = e.text.slice(e.title.length).replace(/^[\s:,.–-]+/, '');
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

function regimeCard(p) {
  return { kind: "regime", title: "How it is managed", text: p.regimeText };
}

function render() {
  // Two events are on the chart from the start. Each miss then reveals one step: a clue card (step 1 is how
  // it was managed, drawn as blue zones) and one more event.
  const cards = [regimeCard(puzzle), ...puzzle.cards];
  const steps = revealed(state, cards.length);
  const start = puzzle.events.length - cards.length;
  const shownEvents = start + steps;
  const { log } = drawChart($('chart'), puzzle.points, puzzle.events, shownEvents, steps >= 1 ? puzzle.regimes : []);
  $('scale-note').textContent = log ? 'log scale' : '';
  $('key-regime').hidden = steps < 1;

  const ev = (e, n) => `<div class="ev" data-event="${n}"><span class="n">${n}</span>
        <span><span class="yr">${e.date.slice(0, 4)}</span><strong class="ev-title">${esc(e.title ?? '')}</strong> ${esc(body(e))}</span></div>`;
  $('events').innerHTML = `<li class="step" data-step="0">${puzzle.events.slice(0, start).map((e, j) => ev(e, j + 1)).join('')}</li>`
    + cards.slice(0, steps).map((card, k) => `<li class="step" data-step="${k + 1}">
      <div class="clue" data-kind="${card.kind}"><span class="clue-title">${esc(card.title)}</span>${card.html ?? esc(card.text)}</div>
      ${ev(puzzle.events[start + k], start + k + 1)}
    </li>`).join('');

  $('guesses').innerHTML = [...state.guesses].reverse().map((id) => {
    const c = byId[id];
    const chip = id === puzzle.id ? '<span class="chip ok">Correct</span>'
      : c.region === answer.region ? '<span class="chip near">Right region</span>'
      : '<span class="chip">Wrong region</span>';
    return `<li><span aria-hidden="true">${id === puzzle.id ? '✓' : '✗'}</span><span class="name">${esc(c.name)}</span>${chip}</li>`;
  }).join('');

  const playing = state.status === 'playing';
  $('guess-form').hidden = !playing;
  const left = MAX_GUESSES - state.guesses.length;
  $('left').textContent = playing ? `${left} guess${left === 1 ? '' : 'es'} left` : '';

  if (playing) { $('result').innerHTML = ''; return; }
  const won = state.status === 'won';
  $('result').innerHTML = `<div class="banner ${won ? 'won' : 'lost'}" data-status="${state.status}">
    ${won ? `Got it in ${state.guesses.length}: <strong>${esc(puzzle.answer)}</strong>.` : `Out of guesses. It was the <strong>${esc(puzzle.answer)}</strong>.`}
    <p>${esc(puzzle.outro)}</p>
    <button id="share" type="button">Share</button> <span id="shared" class="muted small"></span>
  </div>`;
  $('share').onclick = async () => {
    const text = shareText(day, state, puzzle.id, URL_LIVE);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); $('shared').textContent = 'Copied'; }
    } catch { /* cancelled */ }
  };
}

$('guess-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const input = $('guess-in');
  const value = input.value.trim();
  if (!value) { $('guess-err').textContent = 'Type a currency first'; return; }
  const c = findCurrency(value, currencies);
  if (!c) { $('guess-err').textContent = 'Pick a currency from the list'; return; }
  if (state.guesses.includes(c.id)) { $('guess-err').textContent = 'You already guessed that'; return; }
  $('guess-err').textContent = '';
  input.value = '';
  state = applyGuess(state, c.id, puzzle.id);
  save();
  render();
});
$('guess-in').addEventListener('input', () => { $('guess-err').textContent = ''; });

$('help-btn').onclick = () => $('help').showModal();
try {
  if (!localStorage.getItem('forexdle:seen-help')) { $('help').showModal(); localStorage.setItem('forexdle:seen-help', '1'); }
} catch { /* private mode */ }

render();
let lastWidth = $('chart').clientWidth;
addEventListener('resize', () => {
  if ($('chart').clientWidth !== lastWidth) { lastWidth = $('chart').clientWidth; render(); }
});
