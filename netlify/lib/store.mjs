// Bookings live in Netlify Blobs, one JSON document per day: days/YYYY-MM-DD.
// Every write is conditional on the etag we read, so two students hitting the
// same slot at the same moment can't both get it.
import { getStore } from '@netlify/blobs';
import { randomBytes } from 'node:crypto';
import { addDays, isBlocking, isValidDate, nowLocal } from '../../shared/rules.js';

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

// All bookings on or after `from` (YYYY-MM-DD), sorted by time.
export async function bookingsFrom(from) {
  const { blobs } = await store().list({ prefix: 'days/' });
  const dates = blobs.map((b) => b.key.slice(5)).filter((d) => d >= from).sort();
  const days = await Promise.all(dates.map(readDay));
  return days.flatMap((d) => d.bookings).sort((a, b) =>
    `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
}

// Upcoming bookings (today onwards) — used for WhatsApp text commands.
export const upcoming = () => bookingsFrom(nowLocal().date);

// id = "<date>_<random>", so the day document can be found from the id alone.
// code = short, human-typable reference for WhatsApp replies ("YES K7Q2").
export function newIds(date) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  const rand = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return { id: `${date}_${rand}`, code: rand.slice(0, 4) };
}

// Small rolling log of WhatsApp events (deliveries, failures, replies) shown on
// the admin page, so problems are visible without digging through Netlify logs.
// Best-effort: a lost entry under concurrent writes doesn't matter.
const LOG_KEY = 'log/whatsapp';
export async function logActivity(entry) {
  try {
    const list = (await store().get(LOG_KEY, { type: 'json' })) ?? [];
    list.unshift({ at: new Date().toISOString(), ...entry });
    await store().setJSON(LOG_KEY, list.slice(0, 40));
  } catch (err) {
    console.error(`Activity log failed: ${err.message}`);
  }
}
export const readActivity = async () => (await store().get(LOG_KEY, { type: 'json' })) ?? [];

// Students Navid added by hand (e.g. existing students who never booked online).
// Booking-based students are derived from the bookings themselves (see admin.mjs).
const STUDENTS_KEY = 'students/manual';
export const readManualStudents = async () => (await store().get(STUDENTS_KEY, { type: 'json' })) ?? [];
export const writeManualStudents = (list) => store().setJSON(STUDENTS_KEY, list);

// Sequential, human-friendly lesson references: SMASH0001, SMASH0002, …
// Uses a conditional write so two bookings at the same moment never share a number.
const REF_KEY = 'counter/lesson-ref';
export async function nextLessonRef() {
  for (let i = 0; i < 8; i++) {
    const res = await store().getWithMetadata(REF_KEY, { type: 'json' });
    const n = (res?.data?.n ?? 0) + 1;
    const write = await store().setJSON(REF_KEY, { n }, res?.etag ? { onlyIfMatch: res.etag } : { onlyIfNew: true });
    if (write?.modified !== false) return `SMASH${String(n).padStart(4, '0')}`;
  }
  throw new Error('Could not allocate a lesson reference, try again');
}
