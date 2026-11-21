// Mannequin demo video of a pro's shot: GET /api/pros/mq/:player/:shot (supports Range, needed by iPhones).
// The mannequin is our own Higgsfield animation made from a written technique description — no pro footage.
import { mqMedia } from '../lib/pros.mjs';

export default async (req) => {
  const [player, shot] = new URL(req.url).pathname.split('/').slice(-2).map(decodeURIComponent);
  if (!/^[a-z]{2,20}$/.test(player) || !/^[a-z0-9_]{2,30}$/.test(shot)) return new Response('Not found', { status: 404 });
  const got = await mqMedia().getWithMetadata(`mq/${player}/${shot}`, { type: 'arrayBuffer' });
  if (!got?.data) return new Response('Not found', { status: 404 });
  const buf = new Uint8Array(got.data);
  const base = { 'Content-Type': got.metadata?.type || 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable' };
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') ?? '');
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, buf.length - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
    if (start >= buf.length || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${buf.length}` } });
    return new Response(buf.slice(start, end + 1), { status: 206, headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': String(end - start + 1) } });
  }
  return new Response(buf, { headers: { ...base, 'Content-Length': String(buf.length) } });
};

export const config = { path: '/api/pros/mq/:player/:shot' };
