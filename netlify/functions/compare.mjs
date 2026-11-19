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

export const config = { path: '/api/admin/compare/clip' };
