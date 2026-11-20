// Full speed (Navid, 2026-11-19: "as many videos as you can now without stopping"): every 5 minutes,
// up to 8 videos being watched at once. If Gemini says no credits / rate limit, videos wait and retry.
import { readJSON, updateJSON } from '../lib/store.mjs';
import { QUEUE, SETTINGS, SOURCES, isBillingError, startVideo } from '../lib/learn.mjs';
import { SITE_URL } from '../lib/google.mjs';

const AT_ONCE = 8;

export default async () => {
  const paused = (await readJSON(SETTINGS, {})).videosPaused; // Navid paused watching: only the cheap text sorting runs
  // videos that failed only because the Gemini credits ran out go back to the front of the queue
  const stuck = (await readJSON(SOURCES, [])).filter((x) => x.status === 'failed' && isBillingError(x.error));
  if (stuck.length && !paused) {
    await updateJSON(QUEUE, (q) => { const inQ = new Set(q.map((x) => x.videoId)); q.unshift(...stuck.filter((x) => !inQ.has(x.videoId)).map((x) => ({ videoId: x.videoId, title: x.title ?? '', channel: x.channel ?? '', mode: x.mode ?? 'technique' }))); }, []);
    await updateJSON(SOURCES, (list) => { for (const x of list) if (x.status === 'failed' && isBillingError(x.error)) x.status = 'waiting'; }, []);
  }
  // finish any unfinished sorting (merging duplicates, levels, transition / time / timing tags) left by a
  // paused job — also while all video slots are busy (before, a full queue meant tags never resumed)
  const all = await readJSON('learn/candidates', []);
  const tips = all.filter((c) => c.type !== 'fitness');
  // a technique with many unreviewed points left after merging gets the second merging pass
  const [pts, cons] = await Promise.all([readJSON('learn/points', []), readJSON('learn/points-consolidated-v2', {})]);
  const used = new Set(all.map((c) => c.point).filter(Boolean));
  const perTech = new Map();
  for (const p of pts) if (p.status === 'pending' && used.has(p.id)) perTech.set(p.tech, (perTech.get(p.tech) ?? 0) + 1);
  const crowded = [...perTech].some(([t, k]) => k > 25 && k > (cons[t] ?? 0) * 1.15);
  const missing = { merge: crowded || all.some((c) => !c.point && c.status !== 'rejected'), transitions: tips.some((c) => !c.transition), time: tips.some((c) => !c.time_tag), fundamentals: tips.some((c) => !c.fundamental), levels: tips.some((c) => !(c.levels ?? []).length) };
  const set = await readJSON(SETTINGS, {});
  if (set.relevelAt && (set.goalsAt ?? '') < set.relevelAt) missing.levels = true; // a re-sort by Navid's scale is not finished
  const ls = await readJSON('learn/levels-status', {});
  const busy = ls.step && Date.now() - Date.parse(ls.at) < 4 * 60e3; // a sorting job is still working
  if (Object.values(missing).some(Boolean) && !busy) {
    await fetch(`${process.env.URL || SITE_URL}/api/learn-levels`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() }, body: JSON.stringify(missing) });
  }
  if (paused) return new Response('videos paused');
  const sources = await readJSON(SOURCES, []);
  // a background run stops after 15 min: older "running" ones failed silently, retry them later
  const running = sources.filter((s) => s.status === 'running' && Date.now() - Date.parse(s.startedAt) < 16 * 60e3).length;
  const free = AT_ONCE - running;
  if (free <= 0) return new Response('busy');
  let next = [];
  await updateJSON(QUEUE, (q) => { next = q.splice(0, free); }, []);
  for (const v of next) await startVideo(process.env.URL || SITE_URL, v);
  return new Response(`started ${next.length}`);
};

export const config = { schedule: '*/5 * * * *' };
