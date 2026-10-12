import { api } from './api.js';
import { COACH } from './config.js';
import { applyStatic, fmtDuration, getLang, locale, setLang, setVars, t } from './i18n.js';
import {
  addDays, DURATIONS, dayHasOpening, lastBookableDate, nowLocal,
  startTimes, toHHMM, toMin, unavailableReason,
} from '../../shared/rules.js';
import { DEFAULT_LOCATION, DEFAULT_PHONE_PREFIX, WEEKLY_HOURS, hoursOn, locationLabel } from '../../shared/schedule.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const REQUEST_KEY = 'navid-lessons-request';
const waNumber = COACH.whatsapp.replace(/\D/g, '');

const state = {
  backend: null,
  now: nowLocal(),
  days: {},              // date -> [{start, duration, status}]
  blockedDates: [],
  loaded: false,
  loadError: false,
  month: null,           // 'YYYY-MM'
  date: null,
  duration: 60,
  start: null,
  form: { firstName: '', lastName: '', phone: DEFAULT_PHONE_PREFIX },
  error: '',             // i18n key, or a raw server message
  submitting: false,
  request: loadRequest(), // { id, code, date, start, duration, location, status }
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
const fmt = (d, opts) => dateObj(d).toLocaleDateString(locale(), { timeZone: 'UTC', ...opts });
const longDay = (d) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long' });
// "Tue 13 Oct" / "an, spalio 13 d." (Lithuanian short dates read badly without the month name)
const shortDay = (d) => (getLang() === 'lt'
  ? `${fmt(d, { weekday: 'short' })}, ${fmt(d, { month: 'long', day: 'numeric' })}`
  : fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }));
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const endOf = (start, duration) => toHHMM(toMin(start) + duration);
const span = (h) => `${h.open}–${h.close}`;
const errorText = (e) => (e.startsWith('err.') ? t(e) : e);

// ---------- data ----------
async function loadAvailability() {
  const now = nowLocal();
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
    state.loadError = false;
  } catch (err) {
    console.error(err);
    state.loadError = true;
  }
  renderNote();
}

function renderNote() {
  const el = $('[data-load-state]');
  el.textContent = state.loadError ? t('note.loadError') : state.backend?.demo ? t('note.demo') : '';
  el.classList.add('note--warn');
}

const busyOn = (date) => state.days[date] ?? [];
const reasonFor = (date, start, duration) =>
  unavailableReason({ date, start, duration, busy: busyOn(date), blockedDates: state.blockedDates, now: state.now });
const hasOpening = (date) =>
  dayHasOpening({ date, busy: busyOn(date), blockedDates: state.blockedDates, now: state.now });

// ---------- calendar ----------
function renderWeekdays() {
  // 2024-01-01 was a Monday
  $('[data-weekdays]').innerHTML = [...Array(7)].map((_, i) =>
    `<span>${esc(fmt(addDays('2024-01-01', i), { weekday: 'short' }).replace('.', '').slice(0, 2))}</span>`).join('');
}

function renderCalendar() {
  const { now } = state;
  const last = lastBookableDate(now);
  const [y, m] = state.month.split('-').map(Number);
  const first = `${state.month}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (dateObj(first).getUTCDay() + 6) % 7; // Monday-first

  const month = fmt(first, { month: 'long' });
  $('[data-month-name]').textContent = month.charAt(0).toUpperCase() + month.slice(1);
  $('[data-year]').textContent = y;
  $('[data-prev]').disabled = state.month <= now.date.slice(0, 7);
  $('[data-next]').disabled = state.month >= last.slice(0, 7);

  let html = '<span class="day day--pad"></span>'.repeat(lead);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${state.month}-${String(d).padStart(2, '0')}`;
    const inRange = date >= now.date && date <= last;
    const bookable = inRange && !!hoursOn(date) && !state.blockedDates.includes(date);
    const noRoom = bookable && state.loaded && !hasOpening(date);
    // "Full" only when lessons fill it — a day that's simply over (today, late) just looks closed.
    const full = noRoom && busyOn(date).length > 0;
    const open = bookable && !(noRoom && !full);
    const disabled = !open || full || !state.loaded;
    const cls = ['day', date === now.date && 'day--today', open && !full && 'day--open', full && 'day--full'].filter(Boolean).join(' ');
    const label = `${longDay(date)}, ${t(full ? 'cal.full' : open ? 'cal.open' : 'cal.closed')}`;
    html += `<button type="button" class="${cls}" data-date="${date}" aria-label="${esc(label)}" aria-pressed="${date === state.date}" ${disabled ? 'disabled' : ''}>${d}</button>`;
  }
  $('[data-days]').innerHTML = html;
  renderDatePills();
}

// Lime pills under the calendar: the next few days that still have room.
function renderDatePills() {
  const pills = [];
  const last = lastBookableDate(state.now);
  for (let d = state.now.date; d <= last && pills.length < 5; d = addDays(d, 1)) {
    if (state.loaded && hoursOn(d) && !state.blockedDates.includes(d) && hasOpening(d)) pills.push(d);
  }
  $('[data-open-dates]').innerHTML = pills.map((d) =>
    `<button type="button" class="date-pill" data-date="${d}" aria-pressed="${d === state.date}">
      <b>${Number(d.slice(8))}</b>${esc(fmt(d, { weekday: 'long' }))}</button>`).join('');
}

// ---------- right panel ----------
function renderPanel() {
  const panel = $('[data-panel]');
  if (state.request) return renderStatus(panel);
  if (!state.date) {
    panel.innerHTML = `<div class="panel__empty"><div><b>${state.loaded ? '←' : '…'}</b>
      ${state.loaded ? t('panel.pickDay') : esc(t('panel.loading'))}</div></div>`;
    return;
  }

  const hours = hoursOn(state.date);
  const times = startTimes(state.duration, state.date);
  const slots = times.map((time) => {
    const reason = reasonFor(state.date, time, state.duration);
    const title = reason === 'taken' ? t('panel.taken') : reason === 'too-soon' ? t('panel.tooSoon') : '';
    return `<button type="button" class="slot" data-start="${time}" aria-pressed="${time === state.start}" ${reason ? `disabled title="${esc(title)}"` : ''}>${time}</button>`;
  }).join('');
  const anyFree = times.some((time) => !reasonFor(state.date, time, state.duration));

  const total = toMin(hours.close) - toMin(hours.open);
  const pct = (min) => ((min - toMin(hours.open)) / total) * 100;
  const blocks = busyOn(state.date).map((b) =>
    `<span class="timeline__block timeline__block--busy" style="left:${pct(toMin(b.start))}%;width:${(b.duration / total) * 100}%"></span>`).join('');
  const sel = state.start
    ? `<span class="timeline__block timeline__block--sel" style="left:${pct(toMin(state.start))}%;width:${(state.duration / total) * 100}%"></span>` : '';
  const ticks = [];
  for (let mm = toMin(hours.open); mm <= toMin(hours.close); mm += 60) ticks.push(`<span>${mm / 60}</span>`);

  const f = state.form;
  panel.innerHTML = `
    <h3>${esc(cap(shortDay(state.date)))}</h3>
    <p class="panel__sub">${esc(longDay(state.date))} · ${esc(t('panel.between', hours))}</p>
    <p class="panel__sub panel__where">📍 ${esc(locationLabel(DEFAULT_LOCATION))}</p>

    <div class="step-label"><span>${esc(t('panel.length'))}</span><small>${esc(t('panel.steps'))}</small></div>
    <div class="seg" role="group" aria-label="${esc(t('panel.length'))}">
      ${DURATIONS.map((d) => `<button type="button" data-duration="${d}" aria-pressed="${d === state.duration}">${esc(fmtDuration(d))}</button>`).join('')}
    </div>

    <div class="step-label"><span>${esc(t('panel.start'))}</span><small>${esc(t('panel.striped'))}</small></div>
    <div class="timeline" aria-hidden="true">${blocks}${sel}</div>
    <div class="timeline__ticks" aria-hidden="true">${ticks.join('')}</div>
    <div class="slots" role="group" aria-label="${esc(t('panel.start'))}" style="margin-top:14px">
      ${slots}
      ${anyFree ? '' : `<p class="slots__none">${esc(t('panel.noSlot', { dur: fmtDuration(state.duration) }))}</p>`}
    </div>

    <div class="step-label"><span>${esc(t('panel.details'))}</span><small>${esc(t('panel.sentTo'))}</small></div>
    <form class="form" data-form novalidate>
      <label class="field">${esc(t('form.first'))}<input name="firstName" autocomplete="given-name" required value="${esc(f.firstName)}" /></label>
      <label class="field">${esc(t('form.last'))}<input name="lastName" autocomplete="family-name" required value="${esc(f.lastName)}" /></label>
      <label class="field field--full">${esc(t('form.phone'))}<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(f.phone)}" placeholder="+971 50 123 4567" /></label>
      <label class="hp" aria-hidden="true">Company<input name="company" tabindex="-1" autocomplete="off" /></label>
      <div class="summary">
        ${state.start
          ? `<span>${esc(shortDay(state.date))} · <b>${state.start}–${endOf(state.start, state.duration)}</b></span><span>${esc(fmtDuration(state.duration))}</span>`
          : `<span>${esc(t('form.pickStart'))}</span>`}
      </div>
      ${state.error ? `<p class="form__error" role="alert">${esc(errorText(state.error))}</p>` : ''}
      <button class="btn btn--lime btn--block" type="submit" ${!state.start || state.submitting ? 'disabled' : ''}>
        ${esc(t(state.submitting ? 'form.sending' : !state.start ? 'form.pickTime' : 'form.submit'))}
      </button>
      <p class="form__fine">${esc(t('form.fine'))}</p>
    </form>`;
}

function renderStatus(panel) {
  const r = state.request;
  const status = ['pending', 'confirmed', 'declined', 'cancelled', 'expired'].includes(r.status) ? r.status : 'pending';
  const icon = { pending: '⏳', confirmed: '✓', declined: '✕', cancelled: '✕', expired: '…' }[status];
  const when = `${esc(shortDay(r.date))} · <b>${r.start}–${endOf(r.start, r.duration)}</b>`;
  const where = r.location ? `<p class="panel__sub">${esc(locationLabel(r.location) || '')}</p>` : '';
  const demo = state.backend?.demo && status === 'pending'
    ? `<div class="demo"><strong>Demo:</strong> on the live site Navid answers on WhatsApp or the admin page. Simulate his reply:
        <div class="demo__row">
          <button class="pill pill--lime" type="button" data-demo="confirmed">Navid taps “Yes”</button>
          <button class="pill" type="button" data-demo="declined">Navid taps “No”</button>
        </div></div>` : '';
  const wa = waNumber
    ? `<p><a href="https://wa.me/${waNumber}?text=${encodeURIComponent(t('status.waText', { code: r.code }))}" target="_blank" rel="noopener">${esc(t('status.message'))}</a></p>` : '';
  const again = status === 'confirmed' ? 'status.another' : status === 'pending' ? 'status.new' : 'status.pickAnother';

  panel.innerHTML = `
    <div class="status status--${status}" role="status">
      <div class="status__icon" aria-hidden="true">${icon}</div>
      <h3>${esc(t(`status.${status}`))}</h3>
      <div class="status__card">${when}<span>${esc(fmtDuration(r.duration))}</span></div>
      ${where}
      <p>${esc(t(`status.${status}Text`))}</p>
      <p class="panel__sub">${esc(t('status.ref', { code: r.code }))}</p>
      ${wa}
      ${demo}
      <button class="btn btn--ghost" type="button" data-new>${esc(t(again))}</button>
    </div>`;
}

function showThanks() {
  const dialog = $('[data-thanks]');
  if (!dialog.open) dialog.showModal();
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
  state.month = date.slice(0, 7);
  state.error = '';
  if (state.start && reasonFor(date, state.start, state.duration)) state.start = null;
  renderCalendar();
  renderPanel();
  if (matchMedia('(max-width: 960px)').matches) $('[data-panel]').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderAll() {
  applyStatic();
  renderWeekdays();
  renderCalendar();
  renderPanel();
  renderNote();
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('button');
  if (!el) return;

  if (el.matches('[data-lang]')) { setLang(el.dataset.lang); return renderAll(); }
  if (el.matches('[data-date]')) return selectDate(el.dataset.date);
  if (el.matches('[data-prev], [data-next]')) {
    const [y, m] = state.month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + (el.matches('[data-next]') ? 1 : -1), 1));
    state.month = d.toISOString().slice(0, 7);
    return renderCalendar();
  }
  if (el.matches('[data-duration]')) {
    state.duration = Number(el.dataset.duration);
    if (state.start && reasonFor(state.date, state.start, state.duration)) state.start = null;
    return renderPanel();
  }
  if (el.matches('[data-start]')) {
    state.start = el.dataset.start;
    state.error = '';
    return renderPanel();
  }
  if (el.matches('[data-new]')) {
    saveRequest(null);
    state.start = null;
    return renderPanel();
  }
  if (el.matches('[data-demo]')) {
    state.backend.answer(state.request.id, el.dataset.demo);
    return refreshStatus();
  }
});

// Clicking the dimmed backdrop closes the thank-you window
$('[data-thanks]').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
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

  state.error = !firstName || !lastName ? 'err.name' : !/^\+\d{8,15}$/.test(phone) ? 'err.phone' : '';
  if (state.error) return renderPanel();

  state.submitting = true;
  renderPanel();
  const lesson = { date: state.date, start: state.start, duration: state.duration, location: DEFAULT_LOCATION };
  try {
    const res = await state.backend.book({ ...lesson, firstName, lastName, phone, company: data.company });
    saveRequest({ id: res.id, code: res.code, ...lesson, status: 'pending' });
    showThanks();
    state.date = null;
    state.start = null;
    schedulePoll();
  } catch (err) {
    const known = ['taken', 'too-soon', 'day-off', 'name', 'phone'];
    state.error = known.includes(err.code) ? `err.${err.code}` : err.message || 'err.generic';
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
  setVars({ wd: span(WEEKLY_HOURS[1]), we: span(WEEKLY_HOURS[6]) });
  document.querySelectorAll('[data-hours]').forEach((el) => {
    el.textContent = span(WEEKLY_HOURS[el.dataset.hours === 'weekend' ? 6 : 1]);
  });
  if (waNumber) {
    const link = $('[data-coach-wa]');
    link.href = `https://wa.me/${waNumber}`;
    link.hidden = false;
    const soon = $('[data-soon-wa]');
    soon.hidden = false;
    const updateSoonLink = () => { soon.href = `https://wa.me/${waNumber}?text=${encodeURIComponent(t('soon.waText'))}`; };
    updateSoonLink();
    document.addEventListener('click', (e) => { if (e.target.closest('[data-lang]')) updateSoonLink(); });
  }
  state.month = state.now.date.slice(0, 7);
  renderAll();

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
      state.error = 'err.justTaken';
      renderPanel();
    }
  }, 60000);
}
boot();
