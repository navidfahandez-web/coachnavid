// Background: cut one student shot (report ref + time) for the pro comparison page and keep it
// in Blobs (compare-clips store) so the page can play it in slow motion.
import { getStore } from '@netlify/blobs';
import { isAdmin } from '../lib/auth.mjs';
import { readJSON } from '../lib/store.mjs';
import { cutShot, packetDump, probeTimes } from '../lib/clips.mjs';
import { toSeconds } from '../../shared/report.js';

export const clipStore = () => getStore({ name: 'compare-clips', consistency: 'strong' });
export const clipKey = (ref, t) => `${ref}/${String(t).replace(/[^\d:.]/g, '')}`;

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { ref, t, probe, inOpts, packets } = await req.json();
  const store = clipStore();
  if (packets) { // { ref, packets: [{ ss, n }] } → raw packet timestamps
    const key = `probe/${ref}`;
    try {
      const r = await readJSON(`reports/by-ref/${ref}`);
      const out = [];
      for (const q of packets) out.push(`--- ss ${q.ss ?? 0}\n${await packetDump(r.videoFileId, Number(q.ss) || 0, Math.min(20000, Number(q.n) || 500), (inOpts ?? []).filter((x) => /^-?[\w.]+$/.test(x)).slice(0, 6))}`);
      await store.setJSON(`${key}.json`, { done: true, packets: out });
    } catch (err) { await store.setJSON(`${key}.json`, { error: err.message.slice(0, 400) }); }
    return new Response('done');
  }
  if (probe) { // timestamp diagnosis: frames at these times, by jumping vs by reading straight through
    const key = `probe/${ref}`;
    try {
      const r = await readJSON(`reports/by-ref/${ref}`);
      const times = probe.map(toSeconds).filter((x) => x !== null);
      await store.setJSON(`${key}.json`, { step: 'running', times: probe });
      const out = await probeTimes(r.videoFileId, times, (inOpts ?? []).filter((x) => /^-?[\w.]+$/.test(x)).slice(0, 6));
      for (const [k, x] of out.seek.entries()) await store.set(`${key}/seek${k}.jpg`, x.jpg);
      for (const [k, x] of out.pass.entries()) if (x.jpg) await store.set(`${key}/pass${k}.jpg`, x.jpg);
      await store.setJSON(`${key}.json`, { done: true, times: probe, info: out.info, seek: out.seek.map((x) => x.shown), pass: out.pass.map((x) => x.shown) });
    } catch (err) {
      await store.setJSON(`${key}.json`, { error: err.message.replace(/https?:\/\/\S+/g, '<link>').slice(0, 400) });
    }
    return new Response('done');
  }
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
