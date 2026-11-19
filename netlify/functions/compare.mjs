// Pro comparison: GET /api/admin/compare/clip?ref=VA0002&t=20:26 → the student's shot (MP4), or 202
// while it is being cut (the first request starts the cut).
import { getStore } from '@netlify/blobs';
import { json, requireAdmin } from '../lib/auth.mjs';

const clipStore = () => getStore({ name: 'compare-clips', consistency: 'strong' });
const clipKey = (ref, t) => `${ref}/${String(t).replace(/[^\d:.]/g, '')}`;

export default async (req) => {
  const url = new URL(req.url);
  const denied = await requireAdmin(req); // the page fetches with the header and plays it from a blob URL
  if (denied) return denied;
  if (url.pathname.endsWith('/reel')) { // POST starts a reel; GET ?key= → status, &mp4=1 → the video
    const store = clipStore();
    if (req.method === 'POST') {
      const b = await req.json();
      const key = `reels/${b.ref}-${b.a?.t}-${b.b?.t}`.replace(/[^\w/-]/g, '_');
      const old = (await store.get(`${key}.json`, { type: 'json' })) ?? {};
      await store.setJSON(`${key}.json`, { ...old, step: 'Starting…', done: false, error: null, ...(b.step === 'render' ? {} : { draft: null }) }); // so the page never sees the last run's result
      await fetch(`${url.origin}/api/reel-run`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() }, body: JSON.stringify(b) });
      return json({ ok: true, key: `reels/${b.ref}-${b.a?.t}-${b.b?.t}`.replace(/[^\w/-]/g, '_') });
    }
    const key = (url.searchParams.get('key') ?? '').replace(/[^\w/-]/g, '');
    const img = (url.searchParams.get('img') ?? '').replace(/[^AB]/g, '');
    if (img) { const b = await store.get(`${key}/${img}.jpg`, { type: 'arrayBuffer' }); return b ? new Response(b, { headers: { 'Content-Type': 'image/jpeg' } }) : json({ error: 'none' }, 404); }
    if (url.searchParams.get('mp4')) {
      const mp4 = await store.get(`${key}.mp4`, { type: 'arrayBuffer' });
      return mp4 ? new Response(mp4, { headers: { 'Content-Type': 'video/mp4' } }) : json({ error: 'not ready' }, 404);
    }
    return json((await store.get(`${key}.json`, { type: 'json' })) ?? { step: 'starting…' });
  }
  if (url.pathname.endsWith('/probe')) { // timestamp diagnosis: POST { ref, probe: ['0:27', …] }; GET ?ref= → status, &img=seek0 → frame
    const store = clipStore();
    if (req.method === 'POST') {
      const b = await req.json();
      await fetch(`${url.origin}/api/compare-cut`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() }, body: JSON.stringify(b) });
      return json({ ok: true });
    }
    const pref = `probe/${(url.searchParams.get('ref') ?? '').replace(/[^\w-]/g, '')}`;
    const img = (url.searchParams.get('img') ?? '').replace(/[^\w]/g, '');
    if (img) { const b = await store.get(`${pref}/${img}.jpg`, { type: 'arrayBuffer' }); return b ? new Response(b, { headers: { 'Content-Type': 'image/jpeg' } }) : json({ error: 'none' }, 404); }
    return json((await store.get(`${pref}.json`, { type: 'json' })) ?? { step: 'not started' });
  }
  const ref = (url.searchParams.get('ref') ?? '').replace(/[^\w-]/g, '');
  const t = url.searchParams.get('t') ?? '';
  if (!ref || !t) return json({ error: 'ref and t?' }, 400);
  const store = clipStore();
  const key = clipKey(ref, t);
  const mp4 = await store.get(key, { type: 'arrayBuffer' });
  if (mp4) return new Response(mp4, { headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, max-age=3600' } });
  const err = await store.get(`${key}.error`, { type: 'json' });
  if (err) { await store.delete(`${key}.error`); return json({ error: err.error }, 500); }
  if (url.searchParams.get('start') === '1') {
    await fetch(`${url.origin}/api/compare-cut`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() }, body: JSON.stringify({ ref, t }) });
  }
  return json({ status: 'cutting' }, 202);
};

export const config = { path: ['/api/admin/compare/clip', '/api/admin/compare/reel', '/api/admin/compare/probe'] };
