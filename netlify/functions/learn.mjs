// Navid's coaching guide, built from coaching videos (and later his lesson recordings):
// GET  /api/admin/learn                         → sources, candidates, notes, queue size
// POST /api/admin/learn        { videos: [{url|videoId, title?, channel?}], now? }
//      → adds the videos to the queue (watched a few every 10 min); now=true starts up to 12 at once
// POST /api/admin/learn/review { id, status: 'approved'|'rejected'|'pending', fix? } → Navid's decision
// POST /api/admin/learn/note   { technique, text } → Navid's own notes on top of a technique
import { json, requireAdmin } from '../lib/auth.mjs';
import { readJSON, updateJSON } from '../lib/store.mjs';
import { CANDIDATES, GOALS, NOTES, POINTS, PROS, QUEUE, SETTINGS, SHOT_LEVELS, SOURCES, startVideo, youtubeId } from '../lib/learn.mjs';
import { canAnalyze } from '../lib/video-ai.mjs';

export default async (req) => {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { pathname } = new URL(req.url);
  if (req.method === 'GET' && pathname.endsWith('/pros')) return json({ pros: await readJSON(PROS, []) });
  if (req.method === 'GET') {
    const [sources, candidates, notes, queue, goals, levelsStatus, points, shotLevels] = await Promise.all([readJSON(SOURCES, []), readJSON(CANDIDATES, []), readJSON(NOTES, {}), readJSON(QUEUE, []), readJSON(GOALS, []), readJSON('learn/levels-status', {}), readJSON(POINTS, []), readJSON(SHOT_LEVELS, {})]);
    const settings = await readJSON(SETTINGS, {});
    return json({ sources, candidates, notes, queued: queue.length, goals, levelsStatus, points, shotLevels, settings });
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
      if (Array.isArray(b.levels)) { c.levels = [...new Set(b.levels.map(Number).filter((n) => n >= 1 && n <= 10))].sort((x, y) => x - y); c.levelsByNavid = true; }
      c.reviewedAt = new Date().toISOString();
      found = c;
    }, []);
    return found ? json({ ok: true, candidate: found }) : json({ error: 'Not found' }, 404);
  }

  if (pathname.endsWith('/point')) { // a merged point: the decision (and levels) go to every tip in it
    const status = ['approved', 'rejected', 'pending'].includes(b.status) ? b.status : null;
    let found = null;
    await updateJSON(POINTS, (list) => {
      const p = list.find((x) => x.id === b.id);
      if (!p) return;
      if (status) p.status = status;
      if (typeof b.fix === 'string' && b.fix.trim()) p.fix = b.fix.trim().slice(0, 300);
      if (Array.isArray(b.levels)) p.levels = [...new Set(b.levels.map(Number).filter((n) => n >= 1 && n <= 10))].sort((x, y) => x - y);
      p.reviewedAt = new Date().toISOString();
      found = p;
    }, []);
    if (!found) return json({ error: 'Not found' }, 404);
    let members = [];
    await updateJSON(CANDIDATES, (list) => {
      for (const c of list) {
        if (c.point !== found.id) continue;
        if (status) c.status = status;
        if (found.levels) { c.levels = found.levels; c.levelsByNavid = true; }
        c.reviewedAt = found.reviewedAt;
        members.push(c);
      }
    }, [], 12);
    return json({ ok: true, point: found, members });
  }

  if (pathname.endsWith('/settings')) { // { videosPaused: true|false }
    const settings = await updateJSON(SETTINGS, (x) => { if (typeof b.videosPaused === 'boolean') x.videosPaused = b.videosPaused; return x; }, {});
    return json({ ok: true, settings });
  }

  if (pathname.endsWith('/shot-levels')) { // Navid: when each shot first appears / is mastered (1-10)
    const shotLevels = await updateJSON(SHOT_LEVELS, (m) => {
      for (const [k, v] of Object.entries(b.levels ?? {})) {
        const from = Math.round(Number(v?.from)); const mastered = Math.round(Number(v?.mastered));
        if (from >= 1 && from <= 10 && mastered >= from && mastered <= 10) m[String(k).slice(0, 40)] = { from, mastered, ...(v.note ? { note: String(v.note).slice(0, 300) } : {}) };
        else if (v === null) delete m[k];
      }
      return m;
    }, {});
    return json({ ok: true, shotLevels });
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
    await fetch(`${new URL(req.url).origin}/api/learn-levels`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() }, body: JSON.stringify({ reshot: Boolean(b.reshot), merge: Boolean(b.merge), relevel: Boolean(b.relevel), transitions: Boolean(b.transitions), time: Boolean(b.time), fundamentals: Boolean(b.fundamentals), retag: Array.isArray(b.retag) ? b.retag : [] }) });
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
    .map((v) => ({ videoId: v?.videoId && /^[\w-]{11}$/.test(v.videoId) ? v.videoId : youtubeId(v?.url), title: String(v?.title ?? '').slice(0, 200), channel: String(v?.channel ?? '').slice(0, 80), mode: ['fitness', 'pro'].includes(v?.mode) ? v.mode : 'technique' }))
    .filter((v) => v.videoId && (b.redo || !done.has(v.videoId))); // redo=true: watch again
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

export const config = { path: ['/api/admin/learn', '/api/admin/learn/review', '/api/admin/learn/note', '/api/admin/learn/goal', '/api/admin/learn/levels', '/api/admin/learn/pros', '/api/admin/learn/point', '/api/admin/learn/shot-levels', '/api/admin/learn/settings'] };
