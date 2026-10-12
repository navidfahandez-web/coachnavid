// Private admin API for coachnavid.com/admin — needs ADMIN_PASSWORD (Netlify env).
//   GET  /api/admin/bookings        → recent + upcoming bookings, with student details
//   POST /api/admin/bookings/:id    → { action: 'confirm' | 'decline' | 'cancel' }
import { createHash, timingSafeEqual } from 'node:crypto';
import { bookingsFrom } from '../lib/store.mjs';
import { applyAction } from '../lib/actions.mjs';
import { confirmLink } from '../lib/whatsapp.mjs';
import { addDays, isBlocking, nowLocal } from '../../shared/rules.js';
import { locationLabel } from '../../shared/schedule.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const digest = (s) => createHash('sha256').update(String(s)).digest();

function authorised(req) {
  const password = (process.env.ADMIN_PASSWORD ?? '').trim();
  const given = req.headers.get('x-admin-key') ?? '';
  return password !== '' && timingSafeEqual(digest(given), digest(password));
}

const view = (b) => ({
  id: b.id, code: b.code, date: b.date, start: b.start, duration: b.duration,
  location: locationLabel(b.location) || b.location,
  firstName: b.firstName, lastName: b.lastName, phone: b.phone,
  status: b.status === 'pending' && !isBlocking(b) ? 'expired' : b.status,
  createdAt: b.createdAt, decidedAt: b.decidedAt ?? null, notifyFailed: !!b.notifyFailed,
  studentLink: b.status === 'confirmed' ? confirmLink(b) : null,
});

export default async (req, context) => {
  if (!(process.env.ADMIN_PASSWORD ?? '').trim()) return json({ error: 'ADMIN_PASSWORD is not set in Netlify yet.' }, 503);
  if (!authorised(req)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return json({ error: 'Wrong password.' }, 401);
  }

  if (req.method === 'GET') {
    const from = addDays(nowLocal().date, -30);
    const bookings = (await bookingsFrom(from)).filter((b) => b.status !== 'failed').map(view);
    return json({ now: nowLocal(), bookings });
  }

  if (req.method === 'POST' && context.params?.id) {
    let action;
    try { ({ action } = await req.json()); } catch { return json({ error: 'Invalid request' }, 400); }
    const r = await applyAction(action, context.params.id);
    if (!r.ok) {
      const error = {
        'not-found': 'Booking not found.',
        'bad-action': 'Unknown action.',
        'wrong-status': `This booking is already ${r.booking?.status}.`,
        clash: `It overlaps another lesson (${r.clash?.start}, ${r.clash?.firstName} ${r.clash?.lastName}).`,
      }[r.error] ?? 'Could not update the booking.';
      return json({ error }, 409);
    }
    return json({ booking: view(r.booking), studentNotified: !!r.studentNotified, studentLink: r.studentLink ?? null });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: ['/api/admin/bookings', '/api/admin/bookings/:id'] };
