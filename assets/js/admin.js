// Private bookings dashboard: coachnavid.com/admin
import { demoAdmin, demoAllowed, request } from './api.js';
import { toHHMM, toMin } from '../../shared/rules.js';

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
    confirmed: `${b.studentLink ? `<a class="btn btn--ghost" href="${esc(b.studentLink)}" target="_blank" rel="noopener">WhatsApp confirmation ↗</a>` : ''}
                <button class="btn btn--ghost btn--danger" data-act="cancel" data-id="${esc(b.id)}">Cancel lesson</button>`,
  }[b.status] ?? '';
  const badge = { pending: 'waiting', confirmed: 'confirmed', declined: 'declined', cancelled: 'cancelled', expired: 'expired' }[b.status] ?? b.status;
  return `
    <article class="bk bk--${esc(b.status)}">
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
        <small>${esc(b.location)} · ref ${esc(b.code)} · requested ${esc(ago(b.createdAt))}${b.notifyFailed ? ' · <em>WhatsApp alert failed</em>' : ''}</small>
        ${b.notifyError ? `<small class="bk__err">Meta said: ${esc(b.notifyError)}</small>` : ''}
      </div>
      <span class="bk__badge">${esc(badge)}</span>
      ${actions ? `<div class="bk__actions">${actions}</div>` : ''}
    </article>`;
}

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
