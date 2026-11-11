// Background: the AI watches one coaching video and adds its teaching points as "pending"
// candidates for Navid to approve — { url, title }.
import { isAdmin } from '../lib/auth.mjs';
import { readJSON, updateJSON } from '../lib/store.mjs';
import { CANDIDATES, SOURCES, learnFromVideo, youtubeId } from '../lib/learn.mjs';

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { url, title } = await req.json();
  const videoId = youtubeId(url);
  const setSource = (s) => updateJSON(SOURCES, (list) => {
    const i = list.findIndex((x) => x.videoId === videoId);
    if (i < 0) list.push({ videoId, title, ...s }); else list[i] = { ...list[i], ...s };
  }, []);
  try {
    const { about, items = [], model } = await learnFromVideo(`https://www.youtube.com/watch?v=${videoId}`, title);
    const now = Date.now();
    await updateJSON(CANDIDATES, (list) => {
      items.forEach((it, k) => list.push({ id: `${videoId}-${now}-${k}`, source: videoId, sourceTitle: title, ...it, status: 'pending' }));
    }, []);
    await setSource({ status: 'ready', about, found: items.length, model, at: new Date().toISOString(), error: null });
  } catch (err) {
    console.error(`Learn ${videoId} failed: ${err.message}`);
    await setSource({ status: 'failed', error: err.message.slice(0, 300), at: new Date().toISOString() });
  }
  return new Response('done');
};

export const config = { path: '/api/learn-run', background: true };
