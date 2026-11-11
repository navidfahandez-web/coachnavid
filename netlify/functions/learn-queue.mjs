// Slowly through the queue, as Navid asked: one coaching video per hour, 20 hours a day
// (20 videos per day), so the Gemini bill stays small and steady.
import { readJSON, updateJSON } from '../lib/store.mjs';
import { QUEUE, SOURCES, startVideo } from '../lib/learn.mjs';
import { SITE_URL } from '../lib/google.mjs';

const AT_ONCE = 1;

export default async () => {
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

export const config = { schedule: '0 3-22 * * *' }; // on the hour, 03:00–22:00 UTC = 20 runs a day
