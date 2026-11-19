// Background: the AI watches one coaching video and adds its teaching points as "pending"
// candidates for Navid to approve — { url, title }.
import { isAdmin } from '../lib/auth.mjs';
import { readJSON, updateJSON } from '../lib/store.mjs';
import { CANDIDATES, GOALS, QUEUE, SOURCES, isBillingError, learnFromVideo, youtubeId } from '../lib/learn.mjs';

// several videos finish at the same time: wait a moment and try again on write clashes
async function withRetry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (err) {
      if (i >= 4 || !/contention/i.test(err.message)) throw err;
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 4000));
    }
  }
}

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { url, title, mode = 'technique' } = await req.json();
  const videoId = youtubeId(url);
  const setSource = (s) => updateJSON(SOURCES, (list) => {
    const i = list.findIndex((x) => x.videoId === videoId);
    if (i < 0) list.push({ videoId, title, ...s }); else list[i] = { ...list[i], ...s };
  }, []);
  try {
    const { about, items = [], goals = [], model, video_title: seenTitle } = await learnFromVideo(`https://www.youtube.com/watch?v=${videoId}`, title, mode);
    const now = Date.now();
    await withRetry(() => updateJSON(CANDIDATES, (list) => {
      list.splice(0, list.length, ...list.filter((c) => c.source !== videoId || c.status !== 'pending')); // a re-run replaces its unreviewed points
      items.forEach((it, k) => list.push({ id: `${videoId}-${now}-${k}`, source: videoId, sourceTitle: title || seenTitle, ...it, status: 'pending' }));
    }, [], 12));
    if (goals.length) {
      await withRetry(() => updateJSON(GOALS, (list) => {
        goals.forEach((g, k) => list.push({ id: `${videoId}-g${now}-${k}`, source: videoId, level: Math.min(10, Math.max(1, Math.round(g.level) || 1)), area: g.area, goal: g.goal, status: 'pending' }));
      }, [], 12));
    }
    await setSource({ status: 'ready', about, ...(title ? {} : { title: seenTitle }), found: items.length, model, at: new Date().toISOString(), error: null });
  } catch (err) {
    console.error(`Learn ${videoId} failed: ${err.message}`);
    if (isBillingError(err.message)) { // no credits: back to the front of the queue, retried next hour
      await updateJSON(QUEUE, (q) => { if (!q.some((x) => x.videoId === videoId)) q.unshift({ videoId, title, channel: '', mode }); }, []);
      await setSource({ status: 'waiting', error: err.message.slice(0, 300), at: new Date().toISOString() });
      return new Response('waiting for credits');
    }
    await setSource({ status: 'failed', error: err.message.slice(0, 300), at: new Date().toISOString() });
  }
  return new Response('done');
};

export const config = { path: '/api/learn-run', background: true };
