// "My reports" login for players — no password: a 6-digit code on WhatsApp.
//   POST /api/me/code    { phone }        → sends the code (only to numbers that have reports)
//   POST /api/me/verify  { phone, code }  → { playerToken } (their private progress page)
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { json } from '../lib/auth.mjs';
import { logActivity, readJSON, updateJSON } from '../lib/store.mjs';
import { sendLoginCode } from '../lib/whatsapp.mjs';

const CODE_MINUTES = 10;
const MAX_CODES_PER_HOUR = 3;
const MAX_ATTEMPTS = 5;
const key = (phone) => `login/${phone}`;
const hash = (phone, code) => createHash('sha256').update(`${phone}:${code}`).digest('hex');
const phoneOf = (p) => String(p ?? '').replace(/[^\d+]/g, '').replace(/^00/, '+').replace(/^\+/, '');

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let b = {};
  try { b = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const phone = phoneOf(b.phone);
  if (!/^\d{8,15}$/.test(phone)) return json({ error: 'Please enter your WhatsApp number with country code.', code: 'phone' }, 400);
  const { pathname } = new URL(req.url);

  if (pathname.endsWith('/code')) {
    const player = await readJSON(`players/by-phone/${phone}`);
    // Same answer whether or not the number has reports, so numbers can't be probed.
    if (!player) return json({ ok: true });
    const code = String(randomInt(0, 1e6)).padStart(6, '0');
    const allowed = await updateJSON(key(phone), (x) => {
      const recent = (x.sent ?? []).filter((t) => Date.now() - t < 3600e3);
      if (recent.length >= MAX_CODES_PER_HOUR) return false;
      Object.assign(x, { hash: hash(phone, code), exp: Date.now() + CODE_MINUTES * 60e3, attempts: 0, sent: [...recent, Date.now()] });
      return true;
    }, {});
    if (!allowed) return json({ error: 'Too many codes requested. Please try again in an hour.', code: 'limit' }, 429);
    try {
      await sendLoginCode(phone, code);
    } catch (err) {
      await logActivity({ kind: 'failed', text: `Login code to …${phone.slice(-4)} not sent — ${err.message}` });
      return json({ error: 'We couldn’t send the code on WhatsApp. Please ask Coach Navid for your link.', code: 'send' }, 502);
    }
    return json({ ok: true });
  }

  if (pathname.endsWith('/verify')) {
    const given = String(b.code ?? '').replace(/\D/g, '');
    const ok = await updateJSON(key(phone), (x) => {
      if (!x.hash || Date.now() > x.exp || x.attempts >= MAX_ATTEMPTS) return false;
      x.attempts += 1;
      const match = given.length === 6 && timingSafeEqual(Buffer.from(hash(phone, given)), Buffer.from(x.hash));
      if (match) delete x.hash; // one use only
      return match;
    }, {});
    if (!ok) {
      await new Promise((r) => setTimeout(r, 500));
      return json({ error: 'That code isn’t right or has expired. Ask for a new one.', code: 'code' }, 401);
    }
    const player = await readJSON(`players/by-phone/${phone}`);
    return json({ playerToken: player.token, firstName: player.firstName });
  }

  return json({ error: 'Not found' }, 404);
};

export const config = { path: ['/api/me/code', '/api/me/verify'] };
