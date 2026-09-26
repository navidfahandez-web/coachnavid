// Bookings live in Netlify Blobs, one JSON document per day: days/YYYY-MM-DD.
// Every write is conditional on the etag we read, so two students hitting the
// same slot at the same moment can't both get it.
import { getStore } from '@netlify/blobs';
import { randomBytes } from 'node:crypto';
import { addDays, isBlocking, isValidDate, nowInLithuania } from '../../shared/rules.js';

const store = () => getStore({ name: 'lesson-bookings', consistency: 'strong' });
const dayKey = (date) => `days/${date}`;

export async function readDay(date) {
  const res = await store().getWithMetadata(dayKey(date), { type: 'json' });
  return { bookings: res?.data?.bookings ?? [], etag: res?.etag ?? null };
}

// Read-modify-write a day with optimistic locking. `mutate` gets the bookings
// array, changes it in place and returns a result; throwing aborts the write.
export async function updateDay(date, mutate, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    const { bookings, etag } = await readDay(date);
    const result = await mutate(bookings);
    const opts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    const write = await store().setJSON(dayKey(date), { bookings }, opts);
    if (write?.modified !== false) return result;
  }
  throw new Error('Too much contention writing bookings, try again');
}

// Busy blocks (no personal data) for the public calendar.
export async function busyBetween(from, to) {
  const out = {};
  const nowMs = Date.now();
  const dates = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  const days = await Promise.all(dates.map(readDay));
  dates.forEach((date, i) => {
    const busy = days[i].bookings
      .filter((b) => isBlocking(b, nowMs))
      .map((b) => ({ start: b.start, duration: b.duration, status: b.status }));
    if (busy.length) out[date] = busy;
  });
  return out;
}

export async function findById(id) {
  const date = String(id).slice(0, 10);
  if (!isValidDate(date)) return null;
  const { bookings } = await readDay(date);
  return bookings.find((b) => b.id === id) ?? null;
}

// Upcoming bookings (today onwards) — used for WhatsApp text commands.
export async function upcoming() {
  const today = nowInLithuania().date;
  const { blobs } = await store().list({ prefix: 'days/' });
  const dates = blobs.map((b) => b.key.slice(5)).filter((d) => d >= today).sort();
  const days = await Promise.all(dates.map(readDay));
  return days.flatMap((d) => d.bookings).sort((a, b) =>
    `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
}

// id = "<date>_<random>", so the day document can be found from the id alone.
// code = short, human-typable reference for WhatsApp replies ("YES K7Q2").
export function newIds(date) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  const rand = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return { id: `${date}_${rand}`, code: rand.slice(0, 4) };
}
