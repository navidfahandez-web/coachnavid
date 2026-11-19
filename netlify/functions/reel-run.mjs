// Background: make a test Instagram reel from a student's own video — two moments of the same shot,
// real speed then 0.25× slow motion, phase captions written by the AI after watching both clips.
// { ref, a: { t, label }, b: { t, label }, title? } → saved in the student's Drive folder; status in Blobs.
import { getStore } from '@netlify/blobs';
import { isAdmin } from '../lib/auth.mjs';
import { readJSON } from '../lib/store.mjs';
import { uploadSimple } from '../lib/google.mjs';
import { cutMoments, makeReel } from '../lib/clips.mjs';
import { ask } from '../lib/video-ai.mjs';
import { toSeconds } from '../../shared/report.js';

const reels = () => getStore({ name: 'compare-clips', consistency: 'strong' });

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { ref, a, b, title } = await req.json();
  const key = `reels/${ref}-${a.t}-${b.t}`.replace(/[^\w/-]/g, '_');
  const setStatus = (s) => reels().setJSON(`${key}.json`, { ...s, at: new Date().toISOString() });
  try {
    const r = await readJSON(`reports/by-ref/${ref}`);
    if (!r?.videoFileId) throw new Error('No video for this report');
    await setStatus({ step: 'The AI is watching both shots…' });
    const [ca, cb] = await cutMoments(r.videoFileId, [a, b].map((m) => ({ start: toSeconds(m.t) - 2, length: 5 })));
    const S = (d) => ({ type: 'STRING', description: d });
    const { json } = await ask({
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: 'video/mp4', data: ca.toString('base64') } },
        { inlineData: { mimeType: 'video/mp4', data: cb.toString('base64') } },
        { text: `Two clips from the same padel match (club court camera). Clip A = "${a.label}", clip B = "${b.label}". The moment is 2 seconds into each clip; the player is ${r.ai?.player || 'the student'}.
For an Instagram reel in the style "same shot, different swing", compare the student's technique in the 5 phases. Each line MAX 6 words, concrete, what you really see (if you can't see a phase clearly, say what you can, e.g. "too far to see grip"). Also a short hook title (max 8 words). Follow Coach Navid's method: timing, contact point, transitions, time.` },
      ] }],
      generationConfig: {
        responseMimeType: 'application/json', temperature: 0.3,
        responseSchema: { type: 'OBJECT', required: ['title', 'phases'], properties: {
          title: S('Hook title, max 8 words'),
          phases: { type: 'ARRAY', items: { type: 'OBJECT', required: ['name', 'a', 'b'], properties: { name: S('Preparation / Load / Racket drop / Contact / Finish'), a: S('Clip A, max 6 words'), b: S('Clip B, max 6 words') } } },
        } },
      },
    });
    await setStatus({ step: 'Making the video…', phases: json.phases, title: title || json.title });
    const { mp4, seconds } = await makeReel(r.videoFileId, { a, b, title: title || json.title, phases: (json.phases ?? []).slice(0, 5) }, (step) => setStatus({ step, phases: json.phases }));
    await reels().set(`${key}.mp4`, mp4);
    const fileId = await uploadSimple({ name: `${ref} – reel test ${a.t} vs ${b.t}.mp4`, mimeType: 'video/mp4', parents: [r.folderId] }, mp4, 'video/mp4');
    await setStatus({ step: null, done: true, fileId, seconds, title: title || json.title, phases: json.phases });
  } catch (err) {
    console.error(`reel ${ref}: ${err.message}`);
    await setStatus({ step: null, error: err.message.replace(/https?:\/\/\S+/g, '<link>').slice(0, 400) });
  }
  return new Response('done');
};

export const config = { path: '/api/reel-run', background: true };
