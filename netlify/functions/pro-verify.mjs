// Old entry point, kept so existing links work: POST /api/pro-verify { player } (admin key)
// now just queues a verify + profile job for the pro library runner (see lib/pros.mjs).
import { isAdmin } from '../lib/auth.mjs';
import { addJobs, kick } from '../lib/pros.mjs';

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { player = 'Galán', refine = false } = await req.json().catch(() => ({}));
  await addJobs([{ type: 'verify', player, refine }, { type: 'profile', player }]);
  await kick(new URL(req.url).origin);
  return new Response('queued');
};

export const config = { path: '/api/pro-verify' };
