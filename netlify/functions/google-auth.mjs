// Connect Navid's Google Drive (one time, from the admin page).
//   POST /api/admin/google/start       (admin) → { url } to Google's consent screen
//   GET  /api/admin/google/status      (admin) → connected account + storage
//   POST /api/admin/google/disconnect  (admin)
//   GET  /api/google/callback          Google redirects here after Navid approves
import { randomBytes } from 'node:crypto';
import { json, requireAdmin } from '../lib/auth.mjs';
import { checkState, consentUrl, disconnect, exchangeCode, isConfigured, saveState, status } from '../lib/google.mjs';

export default async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === '/api/google/callback') {
    const back = (msg) => Response.redirect(`${new URL(req.url).origin}/admin?drive=${encodeURIComponent(msg)}`, 302);
    if (searchParams.get('error')) return back(`error: ${searchParams.get('error')}`);
    if (!(await checkState(searchParams.get('state') ?? ''))) return back('error: link expired, try again');
    try {
      await exchangeCode(searchParams.get('code') ?? '');
      return back('connected');
    } catch (err) {
      return back(`error: ${err.message}`);
    }
  }

  const denied = await requireAdmin(req);
  if (denied) return denied;

  if (pathname.endsWith('/status')) return json(await status());
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (pathname.endsWith('/disconnect')) { await disconnect(); return json({ ok: true }); }
  if (!isConfigured()) return json({ error: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Netlify first.' }, 503);
  const state = randomBytes(16).toString('hex');
  await saveState(state);
  return json({ url: consentUrl(state) });
};

export const config = {
  path: ['/api/google/callback', '/api/admin/google/start', '/api/admin/google/status', '/api/admin/google/disconnect'],
};
