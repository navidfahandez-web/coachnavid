// Background: cut one student shot (report ref + time) for the pro comparison page and keep it
// in Blobs (compare-clips store) so the page can play it in slow motion.
import { getStore } from '@netlify/blobs';
import { isAdmin } from '../lib/auth.mjs';
import { readJSON } from '../lib/store.mjs';
import { cutParts, cutShot, packetDump, probeSheet, probeTimes } from '../lib/clips.mjs';
import { toSeconds } from '../../shared/report.js';

export const clipStore = () => getStore({ name: 'compare-clips', consistency: 'strong' });
export const clipKey = (ref, t) => `${ref}/${String(t).replace(/[^\d:.]/g, '')}`;

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { ref, t, probe, inOpts, packets, sheet, parts } = await req.json();
  const store = clipStore();
  if (parts) { // { ref, parts: seconds per part } → only cut the analyser's parts (no AI) and log when each arrives
    const key = `probe/${ref}`;
    const t0 = Date.now();
    const log = [];
    const save = (x) => store.setJSON(`${key}.json`, { step: 'parts', log, ...x, sec: Math.round((Date.now() - t0) / 1000), mem: Math.round(process.memoryUsage().rss / 1e6) });
    const beat = setInterval(() => { save({}).catch(() => {}); }, 15000);
    try {
      const r = await readJSON(`reports/by-ref/${ref}`);
      await save({});
      await cutParts(r.videoFileId, Number(parts) || 300, async (k, buf) => {
        log.push({ k, sec: Math.round((Date.now() - t0) / 1000), kb: Math.round(buf.length / 1024) });
        await save({});
        if (k === 0) { // also send part 1 to Gemini (upload only, no AI question) and time it
          try {
            const f = await uploadBuffer(buf, 'probe part 1', 'video/mp4', (x) => { log.push({ gemini: x }); save({}).catch(() => {}); });
            deleteUpload(f.name);
          } catch (err) { log.push({ gemini: `failed: ${err.message.slice(0, 200)}` }); }
          await save({});
        }
      });
      await save({ done: true });
    } catch (err) { await save({ error: err.message.slice(0, 400) }); } finally { clearInterval(beat); }
    return new Response('done');
  }
  if (sheet) { // { ref, sheet: [seconds to jump to] } → one frame per minute read straight + jump frames
    const key = `probe/${ref}`;
    try {
      const r = await readJSON(`reports/by-ref/${ref}`);
      await store.setJSON(`${key}.json`, { step: 'sheet' });
      const out = await probeSheet(r.videoFileId, sheet.map(Number).filter(Number.isFinite).slice(0, 8));
      if (out.sheet) await store.set(`${key}/sheet.jpg`, out.sheet);
      for (const [k, b] of out.jumpImgs.entries()) await store.set(`${key}/jump${k}.jpg`, b);
      await store.setJSON(`${key}.json`, { done: true, shown: out.shown, jumps: sheet });
    } catch (err) { await store.setJSON(`${key}.json`, { error: err.message.slice(0, 400) }); }
    return new Response('done');
  }
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
