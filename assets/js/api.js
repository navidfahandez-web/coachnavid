// Talks to the Netlify Functions. If they aren't there (opening the page from
// a plain static server), falls back to a demo backend kept in localStorage so
// the whole flow can still be tried — including "Navid" answering.
import {
  addDays, isBlocking, lastBookableDate, nowLocal, overlaps, RULES, unavailableReason,
} from '../../shared/rules.js';
import { DEFAULT_LOCATION, hoursOn, locationLabel } from '../../shared/schedule.js';

async function request(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw Object.assign(new Error('No API'), { noApi: true, status: res.status });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error || 'Something went wrong'), { status: res.status, code: body.code });
  return body;
}

const live = {
  demo: false,
  availability: (from, to) => request(`/api/availability?from=${from}&to=${to}`),
  book: (data) => request('/api/bookings', { method: 'POST', body: JSON.stringify(data) }),
  status: (id) => request(`/api/bookings/${encodeURIComponent(id)}`),
};

// ---------- demo backend ----------
const KEY = 'navid-lessons-demo-v3';
const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? null; } catch { return null; }
};
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode */ } };

function seed() {
  // A few made-up lessons on the next open days so the demo calendar looks lived-in
  const days = [];
  for (let d = addDays(nowLocal().date, 1); days.length < 4; d = addDays(d, 1)) if (hoursOn(d)) days.push(d);
  const at = (i, offset, duration, status = 'confirmed', who = ['Aisha', 'Khan']) => {
    const start = hoursOn(days[i]).open.slice(0, 2) * 60 + offset;
    return {
      id: `${days[i]}_SEED${i}${offset}`, code: `S${i}${offset}`.slice(0, 4), date: days[i],
      start: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
      duration, location: DEFAULT_LOCATION, firstName: who[0], lastName: who[1], phone: '+971501234567',
      status, createdAt: new Date().toISOString(),
    };
  };
  const list = [at(0, 0, 120), at(0, 180, 60, 'pending', ['Marco', 'Rossi']), at(1, 90, 90), at(3, 60, 60)];
  write(list);
  return list;
}
const bookings = () => read() ?? seed();

const demo = {
  demo: true,
  async availability(from, to) {
    const now = nowLocal();
    const days = {};
    for (const b of bookings().filter((x) => isBlocking(x) && x.date >= from && x.date <= to)) {
      (days[b.date] ??= []).push({ start: b.start, duration: b.duration, status: b.status });
    }
    return { rules: RULES, now, from, to: to > lastBookableDate(now) ? lastBookableDate(now) : to, blockedDates: [], days };
  },
  async book({ date, start, duration, location, firstName, lastName, phone, notes }) {
    await new Promise((r) => setTimeout(r, 600));
    const list = bookings();
    const reason = unavailableReason({ date, start, duration, busy: list.filter((b) => b.date === date && isBlocking(b)) });
    if (reason) throw Object.assign(new Error('That slot can’t be booked.'), { status: 409, code: reason });
    let n = 0;
    try { n = Number(localStorage.getItem('navid-lessons-demo-ref') || 0) + 1; localStorage.setItem('navid-lessons-demo-ref', String(n)); } catch { n = Date.now() % 10000; }
    const code = `SMASH${String(n).padStart(4, '0')}`;
    const b = { id: `${date}_${code}DEMO`, code, date, start, duration, location, firstName, lastName, phone, notes, status: 'pending', createdAt: new Date().toISOString() };
    write([...list, b]);
    return { id: b.id, code, status: 'pending' };
  },
  async status(id) {
    const b = bookings().find((x) => x.id === id);
    if (!b) throw Object.assign(new Error('Not found'), { status: 404 });
    return b;
  },
  // Stand-in for Navid tapping Yes / No in WhatsApp.
  answer(id, status) {
    write(bookings().map((b) => (b.id === id ? { ...b, status } : b)));
  },
};

// Demo version of the admin API, sharing the same fake bookings.
export const demoAdmin = {
  demo: true,
  async list() {
    const from = addDays(nowLocal().date, -30);
    return {
      now: nowLocal(),
      bookings: bookings().filter((b) => b.date >= from)
        .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
        .map((b) => ({
          ...b, location: locationLabel(b.location) || b.location,
          status: b.status === 'pending' && !isBlocking(b) ? 'expired' : b.status,
          studentLink: b.status === 'confirmed' ? `https://wa.me/${b.phone.replace(/\D/g, '')}` : null,
        })),
    };
  },
  async act(id, action) {
    const list = bookings();
    const b = list.find((x) => x.id === id);
    const from = { confirm: ['pending'], decline: ['pending'], cancel: ['pending', 'confirmed'] }[action];
    if (!b || !from?.includes(b.status)) throw new Error(`This booking is already ${b?.status ?? 'gone'}.`);
    if (action === 'confirm' && list.some((x) => x.id !== id && x.date === b.date && isBlocking(x) && overlaps(b.start, b.duration, x.start, x.duration))) {
      throw new Error('It overlaps another lesson.');
    }
    b.status = { confirm: 'confirmed', decline: 'declined', cancel: 'cancelled' }[action];
    write(list);
    return { booking: b, studentNotified: false, studentLink: action === 'confirm' ? `https://wa.me/${b.phone.replace(/\D/g, '')}` : null };
  },
};

// Demo mode is only ever allowed on a local preview (or with ?demo), so a
// live-site outage never silently turns into fake bookings.
export const demoAllowed =
  /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || new URLSearchParams(location.search).has('demo');

let backend = null;
export async function api() {
  if (backend) return backend;
  if (!demoAllowed) return (backend = live);
  const today = nowLocal().date;
  try {
    await live.availability(today, today);
    backend = live;
  } catch (err) {
    backend = err.noApi || err instanceof TypeError ? demo : live;
  }
  return backend;
}

export { request };
