// Admin password check shared by all private endpoints (ADMIN_PASSWORD in Netlify).
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s) => createHash('sha256').update(String(s)).digest();

export function isAdmin(req) {
  const password = (process.env.ADMIN_PASSWORD ?? '').trim();
  const given = req.headers.get('x-admin-key') ?? '';
  return password !== '' && timingSafeEqual(digest(given), digest(password));
}

export const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Returns a Response to send back if the request isn't from Navid, otherwise null.
export async function requireAdmin(req) {
  if (!(process.env.ADMIN_PASSWORD ?? '').trim()) return json({ error: 'ADMIN_PASSWORD is not set in Netlify yet.' }, 503);
  if (isAdmin(req)) return null;
  await new Promise((r) => setTimeout(r, 600)); // slow down guessing
  return json({ error: 'Wrong password.' }, 401);
}
