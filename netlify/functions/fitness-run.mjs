// Background jobs for the fitness program: { job: 'merge' } or { job: 'plan', band, note }
import { isAdmin } from '../lib/auth.mjs';
import { makePlan, mergeLibrary, setStatus } from '../lib/fitness.mjs';

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { job, band, note } = await req.json().catch(() => ({}));
  const at = () => new Date().toISOString();
  try {
    if (job === 'merge') {
      const stats = await mergeLibrary();
      await setStatus((s) => { s.merge = { state: 'done', at: at(), stats }; });
    } else if (job === 'plan') {
      const plan = await makePlan(band, note);
      await setStatus((s) => { s.plans[band] = { state: 'done', at: at(), model: plan.model }; });
    }
  } catch (err) {
    console.error(`fitness ${job}: ${err.message}`);
    await setStatus((s) => {
      const v = { state: 'error', at: at(), error: String(err.message).slice(0, 300) };
      if (job === 'merge') s.merge = v; else s.plans[band] = v;
    });
  }
  return new Response('ok');
};

export const config = { path: '/api/fitness-run', background: true };
