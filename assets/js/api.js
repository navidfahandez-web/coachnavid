// Talks to the Netlify Functions. If they aren't there (opening the page from
// a plain static server), falls back to a demo backend kept in localStorage so
// the whole flow can still be tried — including "Navid" answering.
import {
  addDays, isBlocking, lastBookableDate, nowInLithuania, RULES, unavailableReason,
} from '../../shared/rules.js';

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
const KEY = 'navid-lessons-demo-v1';
const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? null; } catch { return null; }
};
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode */ } };

function seed() {
  const today = nowInLithuania().date;
  const at = (d, start, duration) => ({
    id: `${addDays(today, d)}_SEED${d}${start.slice(0, 2)}`, code: 'SEED', date: addDays(today, d), start, duration,
    status: 'confirmed', createdAt: new Date().toISOString(),
  });
  const list = [
    at(1, '10:00', 120), at(1, '15:00', 60),
    at(2, '13:30', 90),
    at(4, '10:00', 120), at(4, '12:00', 120), at(4, '14:00', 120), at(4, '16:00', 60), // fully booked day
    at(6, '11:00', 60), at(6, '16:00', 60),
  ];
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
  async book({ date, start, duration, firstName, lastName, phone }) {
    await new Promise((r) => setTimeout(r, 600));
    const list = bookings();
    const reason = unavailableReason({ date, start, duration, busy: list.filter((b) => b.date === date && isBlocking(b)) });
    if (reason) throw Object.assign(new Error('Sorry — that time was just taken. Please pick another slot.'), { status: 409 });
    const code = Math.random().toString(36).slice(2, 6).toUpperCase();
    const b = { id: `${date}_${code}DEMO`, code, date, start, duration, firstName, lastName, phone, status: 'pending', createdAt: new Date().toISOString() };
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
