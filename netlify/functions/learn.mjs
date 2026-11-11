// Navid's coaching guide, built from coaching videos (and later his lesson recordings):
// GET  /api/admin/learn                     → sources + candidates
// POST /api/admin/learn        { videos: [{url, title}] } → the AI starts watching each one
// POST /api/admin/learn/review { id, status: 'approved'|'rejected', fix? } → Navid's decision
import { json, requireAdmin } from '../lib/auth.mjs';
import { readJSON, updateJSON } from '../lib/store.mjs';
import { CANDIDATES, SOURCES, youtubeId } from '../lib/learn.mjs';
import { canAnalyze } from '../lib/video-ai.mjs';

export default async (req) => {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { pathname } = new URL(req.url);
  if (req.method === 'GET') return json({ sources: await readJSON(SOURCES, []), candidates: await readJSON(CANDIDATES, []) });
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
      if (typeof b.note === 'string') c.note = b.note.trim().slice(0, 300);
      c.reviewedAt = new Date().toISOString();
      found = c;
    }, []);
    return found ? json({ ok: true, candidate: found }) : json({ error: 'Not found' }, 404);
  }

  if (!canAnalyze()) return json({ error: 'Needs GEMINI_VIDEO_KEY in Netlify.' }, 503);
  const videos = (Array.isArray(b.videos) ? b.videos : []).filter((v) => youtubeId(v?.url)).slice(0, 12);
  if (!videos.length) return json({ error: 'No YouTube links.' }, 400);
  const origin = new URL(req.url).origin;
  for (const v of videos) {
    const videoId = youtubeId(v.url);
    await updateJSON(SOURCES, (list) => {
      const i = list.findIndex((x) => x.videoId === videoId);
      const s = { videoId, title: String(v.title ?? '').slice(0, 200), status: 'running', startedAt: new Date().toISOString(), error: null };
      if (i < 0) list.push(s); else list[i] = { ...list[i], ...s };
    }, []);
    await fetch(`${origin}/api/learn-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() },
      body: JSON.stringify({ url: v.url, title: v.title }),
    });
  }
  return json({ ok: true, started: videos.length });
};

export const config = { path: ['/api/admin/learn', '/api/admin/learn/review'] };
