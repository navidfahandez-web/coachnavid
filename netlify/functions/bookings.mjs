// POST /api/bookings      → student requests a lesson (held as "pending")
// GET  /api/bookings/:id  → student's page polls the status of their request
import { findById, logActivity, newIds, nextLessonRef, updateDay } from '../lib/store.mjs';
import { notifyCoach } from '../lib/whatsapp.mjs';
import { blockedDates } from '../lib/settings.mjs';
import { isBlocking, isValidDate, unavailableReason } from '../../shared/rules.js';
import { DEFAULT_LOCATION, locationById } from '../../shared/schedule.js';

// `code` lets the page show the message in the visitor's language.
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const MESSAGES = {
  taken: 'Sorry — that time was just taken. Please pick another slot.',
  'too-soon': 'Lessons need to be requested at least 2 hours in advance.',
  'day-off': 'Navid is not available that day.',
  'out-of-range': 'That date can’t be booked.',
};

const name = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);

export default async (req, context) => {
  if (req.method === 'GET') {
    const b = context.params?.id && (await findById(context.params.id));
    if (!b) return json({ error: 'Not found' }, 404);
    const status = b.status === 'pending' && !isBlocking(b) ? 'expired' : b.status;
    return json({ id: b.id, code: b.code, date: b.date, start: b.start, duration: b.duration, location: b.location, status });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let input;
  try { input = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  if (input.company) return json({ error: 'Invalid request' }, 400); // honeypot field

  const firstName = name(input.firstName);
  const lastName = name(input.lastName);
  const phone = String(input.phone ?? '').replace(/[^\d+]/g, '');
  const date = String(input.date ?? '');
  const start = String(input.start ?? '');
  const duration = Number(input.duration);
  const location = locationById(input.location) ? String(input.location) : DEFAULT_LOCATION;
  const updates = input.updates === true; // opted in to "tell me when Navid is back"

  if (!firstName || !lastName) return json({ error: 'Please enter your first and last name.', code: 'name' }, 400);
  if (!/^\+\d{8,15}$/.test(phone)) return json({ error: 'Please enter your phone number with country code, e.g. +971 50 123 4567.', code: 'phone' }, 400);
  if (!isValidDate(date)) return json({ error: 'Please pick a date.', code: 'invalid-date' }, 400);

  const blocked = blockedDates();
  let booking;
  let ref; // allocated once the slot is known to be free; reused if the write is retried
  try {
    booking = await updateDay(date, async (bookings) => {
      const busy = bookings.filter((b) => isBlocking(b));
      const reason = unavailableReason({ date, start, duration, busy, blockedDates: blocked });
      if (reason) throw Object.assign(new Error(MESSAGES[reason] ?? 'That slot can’t be booked.'), { status: 409, code: reason });
      ref ??= await nextLessonRef();
      const b = {
        ...newIds(date), code: ref, date, start, duration, location, firstName, lastName, phone, updates,
        status: 'pending', createdAt: new Date().toISOString(),
      };
      bookings.push(b);
      return b;
    });
  } catch (err) {
    if (err.status) return json({ error: err.message, code: err.code }, err.status);
    throw err;
  }

  try {
    await notifyCoach(booking);
    await logActivity({ kind: 'sent', text: `Request ${booking.code} sent to Navid’s WhatsApp (accepted by Meta).` });
  } catch (err) {
    await logActivity({ kind: 'failed', text: `Request ${booking.code}: Meta refused the alert — ${err.message}` });
    // Keep the request anyway: it's on the admin page, so Navid can still answer it.
    console.error(`WhatsApp notify failed: ${err.message}`);
    await updateDay(date, (bookings) => {
      const b = bookings.find((x) => x.id === booking.id);
      if (b) Object.assign(b, { notifyFailed: true, notifyError: String(err.message).slice(0, 300) });
    });
  }

  return json({ id: booking.id, code: booking.code, status: 'pending' }, 201);
};

export const config = { path: ['/api/bookings', '/api/bookings/:id'] };
