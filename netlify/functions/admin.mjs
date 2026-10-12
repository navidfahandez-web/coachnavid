// Private admin API for coachnavid.com/admin — needs ADMIN_PASSWORD (Netlify env).
//   GET  /api/admin/bookings        → recent + upcoming bookings, with student details
//   POST /api/admin/bookings/:id    → { action: 'confirm' | 'decline' | 'cancel' }
import { createHash, timingSafeEqual } from 'node:crypto';
import { bookingsFrom, readActivity, readManualStudents, writeManualStudents } from '../lib/store.mjs';
import { REGIONS, regionById, regionOfLocation } from '../../shared/regions.js';
import { applyAction } from '../lib/actions.mjs';
import { confirmLink, graph, isFirstLesson, phoneNumberId, wabaId } from '../lib/whatsapp.mjs';
import { addDays, isBlocking, nowLocal } from '../../shared/rules.js';
import { locationLabel } from '../../shared/schedule.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const digest = (s) => createHash('sha256').update(String(s)).digest();

function authorised(req) {
  const password = (process.env.ADMIN_PASSWORD ?? '').trim();
  const given = req.headers.get('x-admin-key') ?? '';
  return password !== '' && timingSafeEqual(digest(given), digest(password));
}

const view = (b, all = []) => ({
  id: b.id, code: b.code, date: b.date, start: b.start, duration: b.duration,
  location: locationLabel(b.location) || b.location,
  firstName: b.firstName, lastName: b.lastName, phone: b.phone, notes: b.notes ?? '',
  status: b.status === 'pending' && !isBlocking(b) ? 'expired' : b.status,
  createdAt: b.createdAt, decidedAt: b.decidedAt ?? null, notifyFailed: !!b.notifyFailed,
  notifyError: b.notifyError ?? null,
  studentLink: b.status === 'confirmed' ? confirmLink(b, { firstTime: isFirstLesson(b, all) }) : null,
});

const digits = (p) => String(p ?? '').replace(/\D/g, '');

// One row per (phone, region). Booking students: confirmed lessons only.
// `canContact`: added by hand, or ticked "tell me when Navid is back" when booking.
async function studentDatabase() {
  const rows = new Map();
  const row = (phone, region) => {
    const key = `${digits(phone)}|${region}`;
    if (!rows.has(key)) rows.set(key, { phone, region, firstName: '', lastName: '', lessons: 0, lastLesson: null, canContact: false, manual: false });
    return rows.get(key);
  };
  for (const b of await bookingsFrom('0000-00-00')) {
    const region = regionOfLocation(b.location);
    if (b.status !== 'confirmed' || !region) continue;
    const r = row(b.phone, region);
    Object.assign(r, { firstName: b.firstName, lastName: b.lastName });
    r.lessons += 1;
    if (!r.lastLesson || b.date > r.lastLesson) r.lastLesson = b.date;
    if (b.updates) r.canContact = true;
  }
  for (const s of await readManualStudents()) {
    const r = row(s.phone, s.region);
    if (!r.firstName) Object.assign(r, { firstName: s.firstName, lastName: s.lastName });
    Object.assign(r, { manual: true, canContact: true });
  }
  return [...rows.values()].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
}

export default async (req, context) => {
  if (!(process.env.ADMIN_PASSWORD ?? '').trim()) return json({ error: 'ADMIN_PASSWORD is not set in Netlify yet.' }, 503);
  if (!authorised(req)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return json({ error: 'Wrong password.' }, 401);
  }

  // Student database: everyone who had a confirmed lesson + students added by hand.
  if (new URL(req.url).pathname.endsWith('/students')) {
    if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
      const list = await readManualStudents();
      const phone = String(body.phone ?? '').replace(/[^\d+]/g, '').replace(/^00/, '+');
      if (body.action === 'add') {
        const firstName = String(body.firstName ?? '').trim().slice(0, 60);
        const lastName = String(body.lastName ?? '').trim().slice(0, 60);
        if (!firstName) return json({ error: 'Add at least a first name.' }, 400);
        if (!/^\+\d{8,15}$/.test(phone)) return json({ error: 'Phone needs a country code, e.g. +370 612 34567.' }, 400);
        if (!regionById(body.region)) return json({ error: 'Pick a location.' }, 400);
        const i = list.findIndex((s) => digits(s.phone) === digits(phone) && s.region === body.region);
        const entry = { firstName, lastName, phone, region: body.region, addedAt: new Date().toISOString() };
        if (i >= 0) list[i] = entry; else list.push(entry);
      } else if (body.action === 'remove') {
        const before = list.length;
        const kept = list.filter((s) => !(digits(s.phone) === digits(phone) && s.region === body.region));
        if (kept.length === before) return json({ error: 'Only students you added by hand can be removed.' }, 400);
        list.splice(0, list.length, ...kept);
      } else {
        return json({ error: 'Unknown action.' }, 400);
      }
      await writeManualStudents(list);
    }
    // Navid's own number (private env var) is added to every announcement as a test recipient.
    const coach = digits(process.env.COACH_WHATSAPP);
    return json({ regions: REGIONS, students: await studentDatabase(), testRecipient: coach ? `+${coach}` : null });
  }

  // WhatsApp connection check: is the sending number OK, and is this app
  // subscribed to the WhatsApp account (needed for replies to reach the site)?
  if (new URL(req.url).pathname.endsWith('/whatsapp')) {
    if (req.method === 'POST') {
      const r = await graph(`${wabaId()}/subscribed_apps`, { method: 'POST' });
      if (r.error) return json({ error: `Meta said: ${r.error}` }, 502);
    }
    const [phone, subscribed] = await Promise.all([
      graph(`${phoneNumberId()}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`),
      graph(`${wabaId()}/subscribed_apps`),
    ]);
    return json({
      phone,
      wabaId: wabaId(),
      subscribedApps: subscribed.error ? { error: subscribed.error } : (subscribed.data ?? []).map((a) => ({
        id: a.whatsapp_business_api_data?.id ?? a.id,
        name: a.whatsapp_business_api_data?.name ?? a.name ?? '',
      })),
      appId: process.env.WHATSAPP_APP_ID || '909678558688772',
    });
  }

  if (req.method === 'GET') {
    const from = addDays(nowLocal().date, -30);
    const all = await bookingsFrom('0000-00-00');
    const bookings = all.filter((b) => b.date >= from && b.status !== 'failed').map((b) => view(b, all));
    return json({ now: nowLocal(), bookings, activity: await readActivity() });
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

export const config = { path: ['/api/admin/bookings', '/api/admin/bookings/:id', '/api/admin/whatsapp', '/api/admin/students'] };
