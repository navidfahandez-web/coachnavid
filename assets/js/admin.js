// Private bookings dashboard: coachnavid.com/admin
import { demoAdmin, demoAllowed, request } from './api.js';
import { addDays, toHHMM, toMin } from '../../shared/rules.js';
import { WEEKLY_HOURS, hoursOn } from '../../shared/schedule.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const KEY = 'navid-admin-key';

let password = '';
try { password = sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || ''; } catch { /* storage blocked */ }
let backend = null; // live API or demoAdmin
let data = { now: null, bookings: [] };

const liveAdmin = {
  demo: false,
  list: () => request('/api/admin/bookings', { headers: { 'x-admin-key': password } }),
  act: (id, action) => request(`/api/admin/bookings/${encodeURIComponent(id)}`, {
    method: 'POST', headers: { 'x-admin-key': password }, body: JSON.stringify({ action }),
  }),
};

// ---------- helpers ----------
const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dur = (m) => (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m / 60}h`);
const ago = (iso) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`;
};
const digits = (p) => String(p).replace(/\D/g, '');

let toastTimer;
function toast(html, ms = 6000) {
  const el = $('[data-toast]');
  el.innerHTML = html;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- rendering ----------
function card(b) {
  const end = toHHMM(toMin(b.start) + b.duration);
  const actions = {
    pending: `<button class="btn btn--lime" data-act="confirm" data-id="${esc(b.id)}">Confirm</button>
              <button class="btn btn--ghost" data-act="decline" data-id="${esc(b.id)}">Decline</button>`,
    confirmed: `${b.reminderLink ? `<a class="btn btn--lime" data-remind="${esc(b.id)}" href="${esc(b.reminderLink)}" target="_blank" rel="noopener">⏰ Send reminder ↗</a>` : ''}
                ${b.remindedAt ? '<span class="bk__sent">⏰ Reminder sent</span>' : ''}
                ${b.studentLink ? `<a class="btn btn--ghost" href="${esc(b.studentLink)}" target="_blank" rel="noopener">WhatsApp confirmation ↗</a>` : ''}
                <button class="btn btn--ghost btn--danger" data-act="cancel" data-id="${esc(b.id)}">Cancel lesson</button>`,
  }[b.status] ?? '';
  const badge = { pending: 'waiting', confirmed: 'confirmed', declined: 'declined', cancelled: 'cancelled', expired: 'expired' }[b.status] ?? b.status;
  return `
    <article class="bk bk--${esc(b.status)}" id="bk-${esc(b.id)}">
      <div class="bk__when">
        <b>${esc(day(b.date))}</b>
        <span>${esc(b.start)}–${esc(end)} · ${esc(dur(b.duration))}</span>
      </div>
      <div class="bk__who">
        <b>${esc(b.firstName)} ${esc(b.lastName)}</b>
        <span>
          <a href="https://wa.me/${digits(b.phone)}" target="_blank" rel="noopener">${esc(b.phone)}</a>
          · <a href="tel:${esc(b.phone)}">call</a>
        </span>
        ${b.notes ? `<span class="bk__notes">📝 ${esc(b.notes)}</span>` : ''}
        <small>${esc(b.location)} · ref ${esc(b.code)} · requested ${esc(ago(b.createdAt))}${b.notifyFailed ? ' · <em>WhatsApp alert failed</em>' : ''}</small>
        ${b.notifyError ? `<small class="bk__err">Meta said: ${esc(b.notifyError)}</small>` : ''}
      </div>
      <span class="bk__badge">${esc(badge)}</span>
      ${actions ? `<div class="bk__actions">${actions}</div>` : ''}
    </article>`;
}

// ---------- weekly calendar ----------
const HOUR_PX = 54;
const allHours = Object.values(WEEKLY_HOURS);
const GRID_START = Math.min(...allHours.map((h) => toMin(h.open)));
const GRID_END = Math.max(...allHours.map((h) => toMin(h.close)));
const mondayOf = (d) => addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
let weekOffset = 0;
const clubOf = (b) => String(b.location || '').split(' · ')[0];

function renderWeek() {
  const today = data.now?.date ?? new Date().toISOString().slice(0, 10);
  const start = addDays(mondayOf(today), weekOffset * 7);
  const days = [...Array(7)].map((_, i) => addDays(start, i));
  const fmt = (d, o) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...o });
  $('[data-week-title]').textContent = weekOffset === 0 ? 'this week'
    : `${fmt(days[0], { day: 'numeric', month: 'short' })} – ${fmt(days[6], { day: 'numeric', month: 'short' })}`;
  const lessons = data.bookings.filter((b) => ['pending', 'confirmed'].includes(b.status) && b.date >= days[0] && b.date <= days[6]);
  const nConf = lessons.filter((b) => b.status === 'confirmed').length;
  $('[data-week-count]').textContent = `· ${nConf} confirmed, ${lessons.length - nConf} waiting`;

  const block = (b) => {
    const top = ((toMin(b.start) - GRID_START) / 60) * HOUR_PX;
    const h = (b.duration / 60) * HOUR_PX - 4;
    return `<button type="button" class="ev ev--${esc(b.status)}" data-goto="${esc(b.id)}" style="top:${top}px;height:${h}px"
      title="${esc(`${b.start}–${toHHMM(toMin(b.start) + b.duration)} · ${b.firstName} ${b.lastName} · ${clubOf(b)}`)}">
      <b>${esc(b.start)}–${esc(toHHMM(toMin(b.start) + b.duration))}</b>
      <span>${esc(b.firstName)} ${esc(b.lastName)}</span>
      <small>${esc(clubOf(b))}</small></button>`;
  };

  // Desktop / tablet: time grid
  const hours = [];
  for (let m = GRID_START; m < GRID_END; m += 60) hours.push(m);
  const height = ((GRID_END - GRID_START) / 60) * HOUR_PX;
  $('[data-week-grid]').innerHTML = `
    <div class="wk__corner"></div>
    ${days.map((d) => `<div class="wk__day ${d === today ? 'is-today' : ''}"><b>${esc(fmt(d, { weekday: 'short' }))}</b> ${esc(fmt(d, { day: 'numeric' }))}</div>`).join('')}
    <div class="wk__times" style="height:${height}px">${hours.map((m) => `<span style="top:${((m - GRID_START) / 60) * HOUR_PX}px">${toHHMM(m)}</span>`).join('')}</div>
    ${days.map((d) => {
      const open = hoursOn(d);
      const shade = open
        ? `<i class="wk__open" style="top:${((toMin(open.open) - GRID_START) / 60) * HOUR_PX}px;height:${((toMin(open.close) - toMin(open.open)) / 60) * HOUR_PX}px"></i>`
        : '';
      return `<div class="wk__col ${d === today ? 'is-today' : ''}" style="height:${height}px;background-size:100% ${HOUR_PX}px">${shade}${lessons.filter((b) => b.date === d).map(block).join('')}</div>`;
    }).join('')}`;

  // Phone: agenda list
  $('[data-week-agenda]').innerHTML = days.map((d) => {
    const list = lessons.filter((b) => b.date === d).sort((a, b) => a.start.localeCompare(b.start));
    return `<div class="ag ${d === today ? 'is-today' : ''}">
      <h4>${esc(fmt(d, { weekday: 'long', day: 'numeric', month: 'short' }))}</h4>
      ${list.length ? list.map((b) => `<button type="button" class="ag__ev ev--${esc(b.status)}" data-goto="${esc(b.id)}">
        <b>${esc(b.start)}–${esc(toHHMM(toMin(b.start) + b.duration))}</b><span>${esc(b.firstName)} ${esc(b.lastName)}</span><small>${esc(clubOf(b))}</small></button>`).join('')
        : `<p class="note">${hoursOn(d) ? 'No lessons' : 'Not available'}</p>`}
    </div>`;
  }).join('');
}

document.addEventListener('click', (e) => {
  const remind = e.target.closest('[data-remind]');
  if (remind && !backend.demo) { // the link opens WhatsApp; also record that it was sent
    request(`/api/admin/bookings/${encodeURIComponent(remind.dataset.remind)}`, {
      method: 'POST', headers: { 'x-admin-key': password }, body: JSON.stringify({ action: 'reminded' }),
    }).then(load).catch(() => {});
  }
  const nav = e.target.closest('[data-week]');
  if (nav) { const v = Number(nav.dataset.week); weekOffset = v === 0 ? 0 : weekOffset + v; return renderWeek(); }
  const go = e.target.closest('[data-goto]');
  if (go) {
    const el = document.getElementById(`bk-${go.dataset.goto}`);
    if (el) {
      el.closest('details')?.setAttribute('open', '');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
  }
});

function render() {
  const today = data.now?.date ?? new Date().toISOString().slice(0, 10);
  const groups = {
    pending: data.bookings.filter((b) => b.status === 'pending' && b.date >= today),
    upcoming: data.bookings.filter((b) => b.status === 'confirmed' && b.date >= today),
  };
  groups.past = data.bookings.filter((b) => !groups.pending.includes(b) && !groups.upcoming.includes(b)).reverse();
  const log = data.activity ?? [];
  $('[data-activity]').innerHTML = log.length
    ? log.map((a) => `<li class="adm-log__${esc(a.kind)}"><time>${esc(new Date(a.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</time> ${esc(a.text)}</li>`).join('')
    : '<li>Nothing yet.</li>';
  renderWeek();
  const empty = { pending: 'No requests waiting. 🎾', upcoming: 'No confirmed lessons coming up.', past: 'Nothing here yet.' };
  for (const [k, list] of Object.entries(groups)) {
    $(`[data-list="${k}"]`).innerHTML = list.length ? list.map(card).join('') : `<p class="note">${empty[k]}</p>`;
    $(`[data-count="${k}"]`).textContent = list.length ? `(${list.length})` : '';
  }
}

function showLogin(error) {
  $('[data-dash]').hidden = true;
  $('[data-login]').hidden = false;
  $('[data-refresh]').hidden = true;
  $('[data-logout]').hidden = true;
  const err = $('[data-login-error]');
  err.hidden = !error;
  err.textContent = error ?? '';
}

async function load() {
  try {
    data = await backend.list();
    $('[data-login]').hidden = true;
    $('[data-dash]').hidden = false;
    $('[data-refresh]').hidden = false;
    $('[data-logout]').hidden = backend.demo;
    $('[data-demo-note]').hidden = !backend.demo;
    render();
    if (!studentsData.regions.length) loadStudents();
  } catch (err) {
    if (err.status === 401 || err.status === 503) return showLogin(err.message);
    toast(`Couldn’t load bookings: ${esc(err.message)}`);
  }
}

// ---------- events ----------
$('[data-login]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  password = String(f.get('password'));
  try {
    sessionStorage.setItem(KEY, password);
    if (f.get('remember')) localStorage.setItem(KEY, password); else localStorage.removeItem(KEY);
  } catch { /* storage blocked: stays in memory */ }
  await load();
});

$('[data-logout]').addEventListener('click', () => {
  password = '';
  try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch { /* ignore */ }
  showLogin();
});
$('[data-refresh]').addEventListener('click', load);

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const { act, id } = btn.dataset;
  const b = data.bookings.find((x) => x.id === id);
  const label = `${b.firstName} ${b.lastName}, ${day(b.date)} ${b.start}`;
  if (act === 'cancel' && !confirm(`Cancel the lesson with ${label}? The slot opens up again.`)) return;
  if (act === 'decline' && !confirm(`Decline ${label}?`)) return;
  btn.disabled = true;
  try {
    const r = await backend.act(id, act);
    if (act === 'confirm') {
      toast(r.studentNotified
        ? `Confirmed ✅ ${esc(b.firstName)} got a WhatsApp confirmation.`
        : `Confirmed ✅ <a href="${esc(r.studentLink)}" target="_blank" rel="noopener">Send ${esc(b.firstName)} the WhatsApp confirmation ↗</a>`, 15000);
    } else {
      toast(act === 'decline' ? 'Declined — the slot is open again.' : 'Cancelled — the slot is open again.');
    }
  } catch (err) {
    toast(`Couldn’t ${act}: ${esc(err.message)}`);
  }
  await load();
});

// ---------- students & announcements ----------
let studentsData = { regions: [], students: [] };
let region = (() => { try { return localStorage.getItem('navid-admin-region') || 'uae'; } catch { return 'uae'; } })();
const SENT_KEY = 'navid-admin-announced';
const sentSet = () => { try { return new Set(JSON.parse(localStorage.getItem(SENT_KEY)) ?? []); } catch { return new Set(); } };
const markSent = (k) => { const s = sentSet(); s.add(k); try { localStorage.setItem(SENT_KEY, JSON.stringify([...s])); } catch { /* ignore */ } };

const TEMPLATES = {
  en: 'Hi {name}! 👋 Coach Navid here. Great news — I’m coaching in {place} again{dates}. Lessons are now open for booking: https://coachnavid.com 🎾 See you on court!',
  lt: 'Labas, {name}! 👋 Čia treneris Navid. Puikios naujienos – vėl atvykstu į {place}{dates}. Pamokas jau galite rezervuoti: https://coachnavid.com 🎾 Iki pasimatymo aikštelėje!',
};

async function loadStudents() {
  try {
    studentsData = backend.demo
      ? { regions: [{ id: 'uae', name: 'UAE · Abu Dhabi', lang: 'en', place: 'Abu Dhabi' }, { id: 'lt', name: 'Lithuania · Klaipeda & Palanga', lang: 'lt', place: 'Klaipėdą ir Palangą' }], students: [
        { firstName: 'Rūta', lastName: 'Demo', phone: '+37061234567', region: 'lt', lessons: 3, lastLesson: '2026-10-05', canContact: true, manual: false },
        { firstName: 'Jonas', lastName: 'Demo', phone: '+37061234568', region: 'lt', lessons: 0, lastLesson: null, canContact: true, manual: true },
        { firstName: 'Aisha', lastName: 'Demo', phone: '+971501234567', region: 'uae', lessons: 1, lastLesson: '2026-10-14', canContact: false, manual: false },
      ] }
      : await request('/api/admin/students', { headers: { 'x-admin-key': password } });
    renderStudents(true);
  } catch (err) {
    $('[data-students]').innerHTML = `<p class="bk__err">${esc(err.message)}</p>`;
  }
}

function annText(r, s) {
  const dates = $('[data-ann-dates]').value.trim();
  return $('[data-ann-text]').value
    .replaceAll('{name}', s.firstName || '')
    .replaceAll('{dates}', dates ? (r.lang === 'lt' ? ` (${dates})` : ` (${dates})`) : '')
    .replaceAll('{place}', r.place);
}

function renderStudents(resetText) {
  const { regions, students } = studentsData;
  if (!regions.some((r) => r.id === region)) region = regions[0]?.id;
  const r = regions.find((x) => x.id === region);
  $('[data-region-tabs]').innerHTML = regions.map((x) => {
    const n = students.filter((s) => s.region === x.id).length;
    return `<button type="button" data-region="${esc(x.id)}" aria-pressed="${x.id === region}">${esc(x.name)} <small>(${n})</small></button>`;
  }).join('');
  document.querySelectorAll('[data-region-name]').forEach((el) => { el.textContent = r?.name ?? ''; });
  $('[data-count="students"]').textContent = students.length ? `(${students.length})` : '';

  const here = students.filter((s) => s.region === region);
  $('[data-students]').innerHTML = here.length ? here.map((s) => `
    <article class="bk stu">
      <div class="bk__who">
        <b>${esc(s.firstName)} ${esc(s.lastName)}</b>
        <span><a href="https://wa.me/${digits(s.phone)}" target="_blank" rel="noopener">${esc(s.phone)}</a></span>
        <small>${s.lessons ? `${s.lessons} lesson${s.lessons > 1 ? 's' : ''} · last ${esc(day(s.lastLesson))}` : 'no online bookings yet'}${s.manual ? ' · added by you' : ''}</small>
      </div>
      <span class="bk__badge">${s.canContact ? 'can message' : 'no consent'}</span>
      ${s.manual ? `<div class="bk__actions"><button class="btn btn--ghost btn--danger" data-remove-student="${esc(s.phone)}">Remove</button></div>` : ''}
    </article>`).join('') : '<p class="note">No students here yet. They appear after a confirmed lesson, or add them by hand below.</p>';

  if (resetText || !$('[data-ann-text]').value) $('[data-ann-text]').value = TEMPLATES[r?.lang] ?? TEMPLATES.en;
  renderAnnounce();
}

function renderAnnounce() {
  const r = studentsData.regions.find((x) => x.id === region);
  const sent = sentSet();
  const list = studentsData.students.filter((s) => s.region === region && s.canContact);
  // Always include Navid himself first, to check the message and the WhatsApp link work.
  if (studentsData.testRecipient) list.unshift({ firstName: 'Navid', lastName: '(test – you)', phone: studentsData.testRecipient, test: true });
  $('[data-ann-list]').innerHTML = list.length ? list.map((s) => {
    const text = annText(r, s);
    const key = `${region}|${digits(s.phone)}|${text.length}`;
    return `<div class="ann">
      <span>${sent.has(key) ? '✅' : s.test ? '🧪' : '•'} <b>${esc(s.firstName)} ${esc(s.lastName)}</b> <small>${esc(s.phone)}</small></span>
      <a class="btn ${sent.has(key) ? 'btn--ghost' : 'btn--lime'}" data-sent-key="${esc(key)}" href="https://wa.me/${digits(s.phone)}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${sent.has(key) ? 'Sent · send again' : 'Send ↗'}</a>
    </div>`;
  }).join('') : '<p class="note">Nobody in this location can be messaged yet.</p>';
}

document.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-region]');
  if (tab) { region = tab.dataset.region; try { localStorage.setItem('navid-admin-region', region); } catch { /* ignore */ } return renderStudents(true); }
  const sent = e.target.closest('[data-sent-key]');
  if (sent) { markSent(sent.dataset.sentKey); setTimeout(renderAnnounce, 300); return; }
  const rm = e.target.closest('[data-remove-student]');
  if (rm && confirm('Remove this student from the list?')) {
    try {
      studentsData = await request('/api/admin/students', { method: 'POST', headers: { 'x-admin-key': password }, body: JSON.stringify({ action: 'remove', phone: rm.dataset.removeStudent, region }) });
      renderStudents(false);
    } catch (err) { toast(esc(err.message)); }
  }
});
document.addEventListener('input', (e) => { if (e.target.matches('[data-ann-text], [data-ann-dates]')) renderAnnounce(); });
$('[data-add-student]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  try {
    studentsData = await request('/api/admin/students', { method: 'POST', headers: { 'x-admin-key': password }, body: JSON.stringify({ action: 'add', ...f, region }) });
    e.target.reset();
    renderStudents(false);
    toast(`${esc(f.firstName)} added ✅`);
  } catch (err) { toast(esc(err.message)); }
});

// ---------- WhatsApp connection ----------
async function connection(fix) {
  const box = $('[data-conn]');
  box.innerHTML = '<p class="note">Asking Meta…</p>';
  try {
    const r = backend.demo
      ? { phone: { display_phone_number: '+1 555 0100', verified_name: 'Demo' }, wabaId: 'demo', subscribedApps: [], appId: 'demo' }
      : await request('/api/admin/whatsapp', { method: fix ? 'POST' : 'GET', headers: { 'x-admin-key': password } });
    const p = r.phone ?? {};
    const apps = r.subscribedApps;
    // Connected only if *this* site's Meta app is subscribed (Meta's own dashboard app doesn't count)
    const ok = Array.isArray(apps) && apps.some((a) => a.id === r.appId);
    const names = Array.isArray(apps) ? apps.map((a) => a.name || a.id).join(', ') : '';
    box.innerHTML = `
      <p>📱 Sending number: <b>${esc(p.display_phone_number ?? '—')}</b> ${p.verified_name ? `(${esc(p.verified_name)})` : ''}
         ${p.error ? `<em class="bk__err">— ${esc(p.error)}</em>` : ''}</p>
      <p>${ok ? '✅' : '⚠️'} Replies to this site: ${ok
        ? `connected (${esc(names)})`
        : apps?.error ? `<em class="bk__err">couldn’t check — ${esc(apps.error)}</em>`
        : `<b>not connected</b> — your Yes/No taps can’t reach the site yet.${names ? ` <small>(currently linked: ${esc(names)})</small>` : ''}`}</p>`;
    $('[data-conn-fix]').hidden = ok;
  } catch (err) {
    box.innerHTML = `<p class="bk__err">${esc(err.message)}</p>`;
  }
}
$('[data-conn-check]').addEventListener('click', () => connection(false));
$('[data-conn-fix]').addEventListener('click', () => connection(true));

// ---------- boot ----------
async function boot() {
  // Local preview without the functions → demo data, so the page can be tried out.
  try {
    await liveAdmin.list();
    backend = liveAdmin;
  } catch (err) {
    backend = demoAllowed && err.noApi ? demoAdmin : liveAdmin;
  }
  if (!backend.demo && !password) return showLogin();
  await load();
  setInterval(() => { if (!document.hidden && !$('[data-dash]').hidden) load(); }, 30000);
}
boot();
