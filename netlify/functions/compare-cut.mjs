// Background: cut one student shot (report ref + time) for the pro comparison page and keep it
// in Blobs (compare-clips store) so the page can play it in slow motion.
import { getStore } from '@netlify/blobs';
import { isAdmin } from '../lib/auth.mjs';
import { readJSON } from '../lib/store.mjs';
import { cutShot } from '../lib/clips.mjs';
import { toSeconds } from '../../shared/report.js';

export const clipStore = () => getStore({ name: 'compare-clips', consistency: 'strong' });
export const clipKey = (ref, t) => `${ref}/${String(t).replace(/[^\d:.]/g, '')}`;

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { ref, t } = await req.json();
  const store = clipStore();
  try {
    const r = await readJSON(`reports/by-ref/${ref}`);
    const sec = toSeconds(t);
    if (!r?.videoFileId || sec === null) throw new Error('No video or time');
    const mp4 = await cutShot(r.videoFileId, sec - 2, 5); // 2 s before the moment, 3 s after
    await store.set(clipKey(ref, t), mp4, { metadata: { at: new Date().toISOString() } });
  } catch (err) {
    console.error(`compare-cut ${ref} ${t}: ${err.message}`);
    await store.setJSON(`${clipKey(ref, t)}.error`, { error: err.message.replace(/https?:\/\/\S+/g, '<link>').slice(0, 300) });
  }
  return new Response('done');
};

export const config = { path: '/api/compare-cut', background: true };
