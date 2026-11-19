// Full speed (Navid, 2026-11-19: "as many videos as you can now without stopping"): every 5 minutes,
// up to 8 videos being watched at once. If Gemini says no credits / rate limit, videos wait and retry.
import { readJSON, updateJSON } from '../lib/store.mjs';
import { QUEUE, SOURCES, isBillingError, startVideo } from '../lib/learn.mjs';
import { SITE_URL } from '../lib/google.mjs';

const AT_ONCE = 8;

export default async () => {
  // videos that failed only because the Gemini credits ran out go back to the front of the queue
  const stuck = (await readJSON(SOURCES, [])).filter((x) => x.status === 'failed' && isBillingError(x.error));
  if (stuck.length) {
    await updateJSON(QUEUE, (q) => { const inQ = new Set(q.map((x) => x.videoId)); q.unshift(...stuck.filter((x) => !inQ.has(x.videoId)).map((x) => ({ videoId: x.videoId, title: x.title ?? '', channel: x.channel ?? '', mode: x.mode ?? 'technique' }))); }, []);
    await updateJSON(SOURCES, (list) => { for (const x of list) if (x.status === 'failed' && isBillingError(x.error)) x.status = 'waiting'; }, []);
  }
  const sources = await readJSON(SOURCES, []);
  // a background run stops after 15 min: older "running" ones failed silently, retry them later
  const running = sources.filter((s) => s.status === 'running' && Date.now() - Date.parse(s.startedAt) < 16 * 60e3).length;
  const free = AT_ONCE - running;
  if (free <= 0) return new Response('busy'); // (sorting catch-up runs on the next free hour)
  let next = [];
  await updateJSON(QUEUE, (q) => { next = q.splice(0, free); }, []);
  for (const v of next) await startVideo(process.env.URL || SITE_URL, v);
  // finish any unfinished sorting (levels, transition / time / timing tags) left by a paused job
  const tips = (await readJSON('learn/candidates', [])).filter((c) => c.type !== 'fitness');
  const missing = { transitions: tips.some((c) => !c.transition), time: tips.some((c) => !c.time_tag), fundamentals: tips.some((c) => !c.fundamental), levels: tips.some((c) => !(c.levels ?? []).length) };
  const ls = await readJSON('learn/levels-status', {});
  const busy = ls.step && Date.now() - Date.parse(ls.at) < 4 * 60e3; // a sorting job is still working
  if (Object.values(missing).some(Boolean) && !busy) {
    await fetch(`${process.env.URL || SITE_URL}/api/learn-levels`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() }, body: JSON.stringify(missing) });
  }
  return new Response(`started ${next.length}`);
};

export const config = { schedule: '*/5 * * * *' };
