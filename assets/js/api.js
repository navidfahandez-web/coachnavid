// Talks to the Netlify Functions. If they aren't there (opening the page from
// a plain static server), falls back to a demo backend kept in localStorage so
// the whole flow can still be tried — including "Navid" answering.
import {
  isBlocking, lastBookableDate, nowInLithuania, RULES, unavailableReason,
} from '../../shared/rules.js';
import { OPEN_DATES } from '../../shared/schedule.js';

async function request(path, options) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw Object.assign(new Error('No API'), { noApi: true });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error || 'Something went wrong'), { status: res.status });
  return body;
}

const live = {
  demo: false,
  async availability(from, to) {
    return request(`/api/availability?from=${from}&to=${to}`);
  },
  book: (data) => request('/api/bookings', { method: 'POST', body: JSON.stringify(data) }),
  status: (id) => request(`/api/bookings/${encodeURIComponent(id)}`),
};

// ---------- demo backend ----------
const KEY = 'navid-lessons-demo-v2';
const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? null; } catch { return null; }
};
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode */ } };

function seed() {
  // A few made-up lessons on the real open dates so the demo calendar looks lived-in
  const days = OPEN_DATES.filter((d) => d >= nowInLithuania().date);
  const at = (i, start, duration) => days[i] && ({
    id: `${days[i]}_SEED${i}${start.slice(0, 2)}`, code: 'SEED', date: days[i], start, duration, location: 'klaipeda',
    status: 'confirmed', createdAt: new Date().toISOString(),
  });
  const list = [
    at(0, '10:00', 120), at(0, '15:00', 60),
    at(1, '13:30', 90),
    at(3, '11:00', 60), at(3, '16:00', 60),
  ].filter(Boolean);
  write(list);
  return list;
}
const bookings = () => read() ?? seed();

const demo = {
  demo: true,
  async availability(from, to) {
    const now = nowInLithuania();
    const days = {};
    for (const b of bookings().filter((x) => isBlocking(x) && x.date >= from && x.date <= to)) {
      (days[b.date] ??= []).push({ start: b.start, duration: b.duration, status: b.status });
    }
    return { rules: RULES, now, from, to: to > lastBookableDate(now) ? lastBookableDate(now) : to, blockedDates: [], days };
  },
  async book({ date, start, duration, location, firstName, lastName, phone }) {
    await new Promise((r) => setTimeout(r, 600));
    const list = bookings();
    const reason = unavailableReason({ date, start, duration, busy: list.filter((b) => b.date === date && isBlocking(b)) });
    if (reason) throw Object.assign(new Error('Sorry — that time was just taken. Please pick another slot.'), { status: 409 });
    const code = Math.random().toString(36).slice(2, 6).toUpperCase();
    const b = { id: `${date}_${code}DEMO`, code, date, start, duration, location, firstName, lastName, phone, status: 'pending', createdAt: new Date().toISOString() };
    write([...list, b]);
    return { id: b.id, code, status: 'pending' };
  },
  async status(id) {
    const b = bookings().find((x) => x.id === id);
    if (!b) throw Object.assign(new Error('Not found'), { status: 404 });
    return b;
  },
  // Stand-in for Navid tapping Yes / No / Cancel in WhatsApp.
  answer(id, status) {
    write(bookings().map((b) => (b.id === id ? { ...b, status } : b)));
  },
  reset() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
};

// Pick the backend once. Demo mode is only ever allowed on a local preview
// (or with ?demo), so a live-site outage never silently turns into fake bookings.
const demoAllowed =
  /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || new URLSearchParams(location.search).has('demo');

let backend = null;
export async function api() {
  if (backend) return backend;
  if (!demoAllowed) return (backend = live);
  const today = nowInLithuania().date;
  try {
    await live.availability(today, today);
    backend = live;
  } catch (err) {
    backend = err.noApi || err instanceof TypeError ? demo : live;
  }
  return backend;
}
