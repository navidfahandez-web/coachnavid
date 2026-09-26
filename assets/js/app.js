import { api } from './api.js';
import { COACH } from './config.js';
import {
  addDays, DURATIONS, dayHasOpening, formatDuration, lastBookableDate, nowInLithuania,
  RULES, startTimes, toHHMM, toMin, unavailableReason,
} from '../../shared/rules.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const REQUEST_KEY = 'navid-lessons-request';

const state = {
  backend: null,
  now: nowInLithuania(),
  days: {},              // date -> [{start, duration, status}]
  blockedDates: [],
  loaded: false,
  month: null,           // 'YYYY-MM'
  date: null,
  duration: 60,
  start: null,
  form: { firstName: '', lastName: '', phone: '+370 ' },
  error: '',
  submitting: false,
  request: loadRequest(), // { id, code, date, start, duration, status }
};

function loadRequest() {
  try { return JSON.parse(localStorage.getItem(REQUEST_KEY)); } catch { return null; }
}
function saveRequest(r) {
  state.request = r;
  try { r ? localStorage.setItem(REQUEST_KEY, JSON.stringify(r)) : localStorage.removeItem(REQUEST_KEY); } catch { /* ignore */ }
}

// ---------- formatting ----------
const dateObj = (d) => new Date(`${d}T12:00:00Z`);
const fmt = (d, opts) => dateObj(d).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
const longDay = (d) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long' });
const endOf = (start, duration) => toHHMM(toMin(start) + duration);

// ---------- data ----------
async function loadAvailability() {
  const now = nowInLithuania();
  const last = lastBookableDate(now);
  const mid = addDays(now.date, 30);
  try {
    const chunks = await Promise.all([
      state.backend.availability(now.date, mid),
      state.backend.availability(addDays(mid, 1), last),
    ]);
    state.now = chunks[0].now ?? now;
    state.blockedDates = chunks[0].blockedDates ?? [];
    state.days = Object.assign({}, ...chunks.map((c) => c.days));
    state.loaded = true;
    setNote(state.backend.demo ? 'Demo mode — the booking backend isn’t connected here, so nothing is sent to WhatsApp.' : '', true);
  } catch (err) {
    console.error(err);
    setNote('Couldn’t load availability. Please refresh, or message Navid on WhatsApp.', true);
  }
}

function setNote(text, warn) {
  const el = $('[data-load-state]');
  el.textContent = text;
  el.classList.toggle('note--warn', !!warn);
}

const busyOn = (date) => state.days[date] ?? [];
const reasonFor = (date, start, duration) =>
  unavailableReason({ date, start, duration, busy: busyOn(date), blockedDates: state.blockedDates, now: state.now });

// ---------- calendar ----------
function renderCalendar() {
  const { now } = state;
  const last = lastBookableDate(now);
  const [y, m] = state.month.split('-').map(Number);
  const first = `${state.month}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (dateObj(first).getUTCDay() + 6) % 7; // Monday-first

  $('[data-month-name]').textContent = fmt(first, { month: 'long' }).toLowerCase();
  $('[data-year]').textContent = y;
  $('[data-prev]').disabled = state.month <= now.date.slice(0, 7);
  $('[data-next]').disabled = state.month >= last.slice(0, 7);

  let html = '<span class="day day--pad"></span>'.repeat(lead);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${state.month}-${String(d).padStart(2, '0')}`;
    const outOfRange = date < now.date || date > last;
    const off = state.blockedDates.includes(date);
    const full = !outOfRange && !off && state.loaded &&
      !dayHasOpening({ date, busy: busyOn(date), blockedDates: state.blockedDates, now });
    const disabled = outOfRange || off || full || !state.loaded;
    const cls = ['day', date === now.date && 'day--today', full && 'day--full'].filter(Boolean).join(' ');
    const label = `${longDay(date)}${full ? ', fully booked' : off ? ', unavailable' : outOfRange ? ', not bookable' : ''}`;
    html += `<button type="button" class="${cls}" data-date="${date}" aria-label="${label}" aria-pressed="${date === state.date}" ${disabled ? 'disabled' : ''}>${d}</button>`;
  }
  $('[data-days]').innerHTML = html;
}

// ---------- right panel ----------
function renderPanel() {
  const panel = $('[data-panel]');
  if (state.request) return renderStatus(panel);
  if (!state.date) {
    panel.innerHTML = `<div class="panel__empty"><div><b>${state.loaded ? '←' : '…'}</b>
      ${state.loaded ? 'Choose a day on the calendar<br />to see Navid’s open times.' : 'Loading availability…'}</div></div>`;
    return;
  }

  const times = startTimes(state.duration);
  const slots = times.map((t) => {
    const reason = reasonFor(state.date, t, state.duration);
    const title = reason === 'taken' ? 'Already booked' : reason === 'too-soon' ? 'Too soon to book' : '';
    return `<button type="button" class="slot" data-start="${t}" aria-pressed="${t === state.start}" ${reason ? `disabled title="${title}"` : ''}>${t}</button>`;
  }).join('');
  const anyFree = times.some((t) => !reasonFor(state.date, t, state.duration));

  const span = toMin(RULES.close) - toMin(RULES.open);
  const pct = (min) => ((min - toMin(RULES.open)) / span) * 100;
  const blocks = busyOn(state.date).map((b) =>
    `<span class="timeline__block timeline__block--busy" style="left:${pct(toMin(b.start))}%;width:${(b.duration / span) * 100}%"></span>`).join('');
  const sel = state.start
    ? `<span class="timeline__block timeline__block--sel" style="left:${pct(toMin(state.start))}%;width:${(state.duration / span) * 100}%"></span>` : '';
  const ticks = [];
  for (let mm = toMin(RULES.open); mm <= toMin(RULES.close); mm += 60) ticks.push(`<span>${mm / 60}</span>`);

  const f = state.form;
  panel.innerHTML = `
    <h3>${esc(fmt(state.date, { weekday: 'short', day: 'numeric', month: 'short' }).toLowerCase())}</h3>
    <p class="panel__sub">${esc(longDay(state.date))} · lessons between ${RULES.open} and ${RULES.close}</p>

    <div class="step-label"><span>lesson length</span><small>30-min steps</small></div>
    <div class="seg" role="group" aria-label="Lesson length">
      ${DURATIONS.map((d) => `<button type="button" data-duration="${d}" aria-pressed="${d === state.duration}">${formatDuration(d)}</button>`).join('')}
    </div>

    <div class="step-label"><span>start time</span><small>striped = booked</small></div>
    <div class="timeline" aria-hidden="true">${blocks}${sel}</div>
    <div class="timeline__ticks" aria-hidden="true">${ticks.join('')}</div>
    <div class="slots" role="group" aria-label="Start time" style="margin-top:14px">
      ${slots}
      ${anyFree ? '' : `<p class="slots__none">No ${formatDuration(state.duration)} slot left this day — try a shorter lesson or another day.</p>`}
    </div>

    <div class="step-label"><span>your details</span><small>sent to Navid on WhatsApp</small></div>
    <form class="form" data-form novalidate>
      <label class="field">First name<input name="firstName" autocomplete="given-name" required value="${esc(f.firstName)}" /></label>
      <label class="field">Last name<input name="lastName" autocomplete="family-name" required value="${esc(f.lastName)}" /></label>
      <label class="field field--full">Phone (WhatsApp)<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(f.phone)}" placeholder="+370 612 34567" /></label>
      <label class="hp" aria-hidden="true">Company<input name="company" tabindex="-1" autocomplete="off" /></label>
      <div class="summary">
        ${state.start
          ? `<span>${esc(fmt(state.date, { weekday: 'short', day: 'numeric', month: 'short' }))} · <b>${state.start}–${endOf(state.start, state.duration)}</b></span><span>${formatDuration(state.duration)}</span>`
          : '<span>Pick a start time above</span>'}
      </div>
      ${state.error ? `<p class="form__error" role="alert">${esc(state.error)}</p>` : ''}
      <button class="btn btn--lime btn--block" type="submit" ${!state.start || state.submitting ? 'disabled' : ''}>
        ${state.submitting ? 'Sending…' : 'Request this lesson'}
      </button>
      <p class="form__fine">Navid gets your request on WhatsApp and confirms it there. The slot is held for you while he replies.</p>
    </form>`;
}

function renderStatus(panel) {
  const r = state.request;
  const when = `${fmt(r.date, { weekday: 'short', day: 'numeric', month: 'short' })} · <b>${r.start}–${endOf(r.start, r.duration)}</b>`;
  const views = {
    pending: ['⏳', 'request sent', 'Navid has your request on WhatsApp. This page updates by itself as soon as he confirms — you can also come back later.'],
    confirmed: ['✓', 'you’re booked!', 'Navid confirmed your lesson. He’ll message you on WhatsApp with the court details. See you on court!'],
    declined: ['✕', 'not available', 'Navid can’t make this one. Please pick another time — or message him to find a slot that works.'],
    cancelled: ['✕', 'lesson cancelled', 'This lesson was cancelled and the slot is free again. Feel free to book another time.'],
    expired: ['…', 'no answer yet', 'Navid didn’t get to your request in time, so the slot was released. Please request again.'],
  };
  const [icon, title, text] = views[r.status] ?? views.pending;
  const demo = state.backend?.demo && r.status === 'pending'
    ? `<div class="demo"><strong>Demo:</strong> on the live site Navid answers on WhatsApp. Simulate his reply:
        <div class="demo__row">
          <button class="pill pill--lime" type="button" data-demo="confirmed">Navid taps “Yes”</button>
          <button class="pill" type="button" data-demo="declined">Navid taps “No”</button>
        </div></div>` : '';
  const wa = COACH.whatsapp
    ? `<p><a href="https://wa.me/${COACH.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi Navid, about my lesson request ${r.code}`)}" target="_blank" rel="noopener">Message Navid on WhatsApp ↗</a></p>` : '';

  panel.innerHTML = `
    <div class="status status--${esc(r.status)}" role="status">
      <div class="status__icon" aria-hidden="true">${icon}</div>
      <h3>${title}</h3>
      <div class="status__card">${when}<span>${formatDuration(r.duration)}</span></div>
      <p>${text}</p>
      <p class="panel__sub">Reference ${esc(r.code)}</p>
      ${wa}
      ${demo}
      <button class="btn btn--ghost" type="button" data-new>${r.status === 'confirmed' ? 'Book another lesson' : r.status === 'pending' ? 'Start a new request' : 'Pick another time'}</button>
    </div>`;
}

// ---------- status polling ----------
let pollTimer = null;
async function refreshStatus() {
  if (!state.request || !state.backend) return;
  try {
    const s = await state.backend.status(state.request.id);
    if (s.status !== state.request.status) {
      saveRequest({ ...state.request, status: s.status });
      await loadAvailability();
      renderCalendar();
      renderPanel();
    }
  } catch (err) {
    if (err.status === 404) { saveRequest(null); renderPanel(); }
  }
  schedulePoll();
}
function schedulePoll() {
  clearTimeout(pollTimer);
  if (state.request?.status === 'pending') pollTimer = setTimeout(refreshStatus, 8000);
}

// ---------- events ----------
function selectDate(date) {
  state.date = date;
  state.error = '';
  if (state.start && reasonFor(date, state.start, state.duration)) state.start = null;
  renderCalendar();
  renderPanel();
  if (matchMedia('(max-width: 960px)').matches) $('[data-panel]').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;

  if (t.matches('[data-date]')) return selectDate(t.dataset.date);
  if (t.matches('[data-prev], [data-next]')) {
    const [y, m] = state.month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + (t.matches('[data-next]') ? 1 : -1), 1));
    state.month = d.toISOString().slice(0, 7);
    return renderCalendar();
  }
  if (t.matches('[data-duration]')) {
    state.duration = Number(t.dataset.duration);
    if (state.start && reasonFor(state.date, state.start, state.duration)) state.start = null;
    return renderPanel();
  }
  if (t.matches('[data-start]')) {
    state.start = t.dataset.start;
    state.error = '';
    return renderPanel();
  }
  if (t.matches('[data-new]')) {
    saveRequest(null);
    state.start = null;
    return renderPanel();
  }
  if (t.matches('[data-demo]')) {
    state.backend.answer(state.request.id, t.dataset.demo);
    return refreshStatus();
  }
});

document.addEventListener('input', (e) => {
  if (e.target.closest('[data-form]') && e.target.name in state.form) state.form[e.target.name] = e.target.value;
});

document.addEventListener('submit', async (e) => {
  if (!e.target.matches('[data-form]')) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const phone = data.phone.replace(/[^\d+]/g, '').replace(/^00/, '+');
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();

  state.error =
    !firstName || !lastName ? 'Please enter your first and last name.'
    : !/^\+\d{8,15}$/.test(phone) ? 'Please enter your WhatsApp number with country code, e.g. +370 612 34567.'
    : '';
  if (state.error) return renderPanel();

  state.submitting = true;
  renderPanel();
  const lesson = { date: state.date, start: state.start, duration: state.duration };
  try {
    const res = await state.backend.book({ ...lesson, firstName, lastName, phone, company: data.company });
    saveRequest({ id: res.id, code: res.code, ...lesson, status: 'pending' });
    state.date = null;
    state.start = null;
    schedulePoll();
  } catch (err) {
    state.error = err.message || 'Something went wrong — please try again.';
    if (err.status === 409) state.start = null;
  } finally {
    state.submitting = false;
  }
  await loadAvailability();
  renderCalendar();
  renderPanel();
});

// ---------- boot ----------
async function boot() {
  if (COACH.whatsapp) {
    const link = $('[data-coach-wa]');
    link.href = `https://wa.me/${COACH.whatsapp.replace(/\D/g, '')}`;
    link.hidden = false;
  }
  state.month = state.now.date.slice(0, 7);
  renderCalendar();
  renderPanel();

  state.backend = await api();
  await loadAvailability();
  renderCalendar();
  renderPanel();
  if (state.request) refreshStatus();

  // keep the calendar fresh if the page stays open
  setInterval(async () => {
    if (document.hidden) return;
    await loadAvailability();
    renderCalendar();
    // Only redraw the panel if the picked slot was taken meanwhile (keeps typing undisturbed)
    if (state.date && !state.request && state.start && reasonFor(state.date, state.start, state.duration)) {
      state.start = null;
      state.error = 'That time was just booked by someone else — please pick another.';
      renderPanel();
    }
  }, 60000);
}
boot();
