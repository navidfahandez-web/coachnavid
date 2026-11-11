// Every 10 minutes: start the next coaching videos from the queue (at most 6 running at once),
// so hundreds of videos get watched over a few days without hitting Gemini's limits.
import { readJSON, updateJSON } from '../lib/store.mjs';
import { QUEUE, SOURCES, startVideo } from '../lib/learn.mjs';
import { SITE_URL } from '../lib/google.mjs';

const AT_ONCE = 6;

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

export const config = { schedule: '*/10 * * * *' };
