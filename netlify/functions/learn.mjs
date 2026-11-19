// Navid's coaching guide, built from coaching videos (and later his lesson recordings):
// GET  /api/admin/learn                         → sources, candidates, notes, queue size
// POST /api/admin/learn        { videos: [{url|videoId, title?, channel?}], now? }
//      → adds the videos to the queue (watched a few every 10 min); now=true starts up to 12 at once
// POST /api/admin/learn/review { id, status: 'approved'|'rejected'|'pending', fix? } → Navid's decision
// POST /api/admin/learn/note   { technique, text } → Navid's own notes on top of a technique
import { json, requireAdmin } from '../lib/auth.mjs';
import { readJSON, updateJSON } from '../lib/store.mjs';
import { CANDIDATES, GOALS, NOTES, QUEUE, SOURCES, startVideo, youtubeId } from '../lib/learn.mjs';
import { canAnalyze } from '../lib/video-ai.mjs';

export default async (req) => {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { pathname } = new URL(req.url);
  if (req.method === 'GET') {
    const [sources, candidates, notes, queue, goals, levelsStatus] = await Promise.all([readJSON(SOURCES, []), readJSON(CANDIDATES, []), readJSON(NOTES, {}), readJSON(QUEUE, []), readJSON(GOALS, []), readJSON('learn/levels-status', {})]);
    return json({ sources, candidates, notes, queued: queue.length, goals, levelsStatus });
  }
  const b = await req.json().catch(() => ({}));

  if (pathname.endsWith('/review')) {
    const status = ['approved', 'rejected', 'pending'].includes(b.status) ? b.status : null;
    if (!status) return json({ error: 'status?' }, 400);
    let found = null;
    await updateJSON(CANDIDATES, (list) => {
      const c = list.find((x) => x.id === b.id);
      if (!c) return;
      c.status = status;
      if (typeof b.fix === 'string' && b.fix.trim()) c.fix = b.fix.trim().slice(0, 300);
      if (Array.isArray(b.levels)) c.levels = [...new Set(b.levels.map(Number).filter((n) => n >= 1 && n <= 10))].sort((x, y) => x - y);
      c.reviewedAt = new Date().toISOString();
      found = c;
    }, []);
    return found ? json({ ok: true, candidate: found }) : json({ error: 'Not found' }, 404);
  }

  if (pathname.endsWith('/goal')) { // Navid approves / edits / rejects a level goal, or adds his own
    let found = null;
    await updateJSON(GOALS, (list) => {
      let g = list.find((x) => x.id === b.id);
      if (!g && b.add) { g = { id: `own-${Date.now()}`, source: 'navid', level: Number(b.level) || 1, area: String(b.area ?? 'tactics'), goal: '', status: 'approved' }; list.push(g); }
      if (!g) return;
      if (['approved', 'rejected', 'pending'].includes(b.status)) g.status = b.status;
      if (typeof b.goal === 'string' && b.goal.trim()) g.goal = b.goal.trim().slice(0, 300);
      if (Number(b.level) >= 1 && Number(b.level) <= 10) g.level = Number(b.level);
      found = g;
    }, []);
    return found ? json({ ok: true, goal: found }) : json({ error: 'Not found' }, 404);
  }

  if (pathname.endsWith('/levels')) { // start sorting all tips by level + writing level goals
    await fetch(`${new URL(req.url).origin}/api/learn-levels`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() }, body: JSON.stringify({ reshot: Boolean(b.reshot), transitions: Boolean(b.transitions), time: Boolean(b.time) }) });
    return json({ ok: true });
  }

  if (pathname.endsWith('/note')) {
    const t = String(b.technique ?? '').slice(0, 60);
    if (!t) return json({ error: 'technique?' }, 400);
    const notes = await updateJSON(NOTES, (n) => { n[t] = String(b.text ?? '').slice(0, 3000); return n; }, {});
    return json({ ok: true, notes });
  }

  if (!canAnalyze()) return json({ error: 'Needs GEMINI_VIDEO_KEY in Netlify.' }, 503);
  const sources = await readJSON(SOURCES, []);
  const done = new Set(sources.map((s) => s.videoId));
  const videos = (Array.isArray(b.videos) ? b.videos : [])
    .map((v) => ({ videoId: v?.videoId && /^[\w-]{11}$/.test(v.videoId) ? v.videoId : youtubeId(v?.url), title: String(v?.title ?? '').slice(0, 200), channel: String(v?.channel ?? '').slice(0, 80), mode: v?.mode === 'fitness' ? 'fitness' : 'technique' }))
    .filter((v) => v.videoId && !done.has(v.videoId));
  if (!videos.length) return json({ ok: true, added: 0, note: 'Nothing new (already watched or no links).' });
  const origin = new URL(req.url).origin;
  if (b.now) {
    for (const v of videos.slice(0, 12)) await startVideo(origin, v);
    return json({ ok: true, started: Math.min(12, videos.length) });
  }
  let added = 0;
  await updateJSON(QUEUE, (q) => {
    const inQ = new Set(q.map((x) => x.videoId));
    if (b.first) { // first=true: these jump to the front (also when they were already waiting)
      const ids = new Set(videos.map((v) => v.videoId));
      const rest = q.filter((x) => !ids.has(x.videoId));
      q.splice(0, q.length, ...videos, ...rest);
      added = videos.length;
      return;
    }
    const fresh = videos.filter((v) => !inQ.has(v.videoId));
    q.push(...fresh);
    added = fresh.length;
  }, []);
  return json({ ok: true, added });
};

export const config = { path: ['/api/admin/learn', '/api/admin/learn/review', '/api/admin/learn/note', '/api/admin/learn/goal', '/api/admin/learn/levels'] };
