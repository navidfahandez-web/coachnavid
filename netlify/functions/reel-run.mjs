// Background: make a test Instagram reel from a student's own video — two moments of the same shot,
// real speed then 0.25× slow motion, phase captions, players zoomed in as silhouettes.
// Two steps, so Navid approves the words before the video is made:
//   { ref, a: { t, label }, b: { t, label }, step: 'draft' }  → the AI writes title + phase captions and
//       finds the player (a box per moment); status.draft holds them, frames for checking in Blobs
//   { ref, a, b, step: 'render', title, phases }               → the video, with Navid's (edited) words
// Saved in the student's Drive folder; status in Blobs (compare-clips store).
import { getStore } from '@netlify/blobs';
import { isAdmin } from '../lib/auth.mjs';
import { readJSON } from '../lib/store.mjs';
import { uploadSimple } from '../lib/google.mjs';
import { cutMoments, grabFrames, makeReel, REEL } from '../lib/clips.mjs';
import { ask } from '../lib/video-ai.mjs';
import { toSeconds } from '../../shared/report.js';

const reels = () => getStore({ name: 'compare-clips', consistency: 'strong' });
export const reelKey = (ref, a, b) => `reels/${ref}-${a?.t}-${b?.t}`.replace(/[^\w/-]/g, '_');
const S = (d) => ({ type: 'STRING', description: d });

async function captions(r, a, b) {
  const [ca, cb] = await cutMoments(r.videoFileId, [a, b].map((m) => ({ start: toSeconds(m.t) - REEL.BEFORE, length: REEL.REAL })));
  const { json } = await ask({
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'video/mp4', data: ca.toString('base64') } },
      { inlineData: { mimeType: 'video/mp4', data: cb.toString('base64') } },
      { text: `Two clips from the same padel match (club court camera). Clip A = "${a.label}", clip B = "${b.label}". The shot is hit about ${REEL.BEFORE} seconds into each clip; the player is ${r.ai?.player || 'the student'}.
For an Instagram reel in the style "same shot, side by side", compare the student's shot in 4–5 phases. Name the phases for THIS padel shot.
This is PADEL, not tennis: a padel serve is underhand — the player bounces the ball and hits it at or below waist height. There is no ball toss and no overhead serve. Use padel words (glass, transition area, bandeja, víbora, chiquita, lob).
Each caption MAX 6 words, concrete, what you really see (if a phase isn't clear, say what you can, e.g. "too far to see grip"). Also a short hook title (max 8 words).
Follow Coach Navid's method: decision before technique, timing (incl. hiding the shot), contact point, transitions (forced or wanted), earning or removing time.` },
    ] }],
    generationConfig: {
      responseMimeType: 'application/json', temperature: 0.3,
      responseSchema: { type: 'OBJECT', required: ['title', 'phases'], properties: {
        title: S('Hook title, max 8 words'),
        phases: { type: 'ARRAY', items: { type: 'OBJECT', required: ['name', 'a', 'b'], properties: { name: S('Phase name, 1–3 words'), a: S('Clip A, max 6 words'), b: S('Clip B, max 6 words') } } },
      } },
    },
  });
  return { title: json.title ?? '', phases: (json.phases ?? []).slice(0, 5) };
}

// The player's box in 3 frames per moment (REEL.BOX_AT seconds into the shot), so the crop can follow them.
async function findPlayer(r, a, b) {
  const times = [a, b].flatMap((m) => REEL.BOX_AT.map((x) => toSeconds(m.t) - REEL.BEFORE + x));
  const frames = await grabFrames(r.videoFileId, times);
  const box = { type: 'ARRAY', items: { type: 'INTEGER' }, description: '[ymin, xmin, ymax, xmax], 0–1000' };
  const { json } = await ask({
    contents: [{ role: 'user', parts: [
      ...frames.map((f) => ({ inlineData: { mimeType: 'image/jpeg', data: f.toString('base64') } })),
      { text: `Six frames from a fixed padel court camera. Frames 1–3 = moment A ("${a.label}"), frames 4–6 = moment B ("${b.label}"); in each moment the frames are ${REEL.BOX_AT[1] - REEL.BOX_AT[0]} s and ${REEL.BOX_AT[2] - REEL.BOX_AT[1]} s apart, and the shot is hit in the middle frame (2 and 5).
The student: ${r.ai?.player || 'the player hitting that shot'}.
For each frame give the bounding box of the student (whole body and racket), as box_2d [ymin, xmin, ymax, xmax] normalised to 0–1000. Follow the SAME player through the three frames of a moment. If the student is not visible in a frame, give [0,0,0,0].` },
    ] }],
    generationConfig: {
      responseMimeType: 'application/json', temperature: 0.1,
      responseSchema: { type: 'OBJECT', required: ['a', 'b'], properties: { a: { type: 'ARRAY', items: box }, b: { type: 'ARRAY', items: box } } },
    },
  });
  const fix = (list) => REEL.BOX_AT.map((_, i) => { const v = list?.[i]; return Array.isArray(v) && v.length === 4 && v[2] > v[0] ? v.map(Number) : null; });
  return { boxes: { a: fix(json.a), b: fix(json.b) }, frames: { a: frames[1], b: frames[4] } };
}

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const body = await req.json();
  const { ref, a, b } = body;
  const key = reelKey(ref, a, b);
  let status = (await reels().get(`${key}.json`, { type: 'json' })) ?? {};
  const setStatus = async (s) => { status = { ...status, ...s, at: new Date().toISOString() }; await reels().setJSON(`${key}.json`, status); };
  try {
    const r = await readJSON(`reports/by-ref/${ref}`);
    if (!r?.videoFileId) throw new Error('No video for this report');
    if (body.step !== 'render') {
      await setStatus({ step: 'The AI is watching both shots…', error: null, done: false, draft: null });
      const words = await captions(r, a, b);
      await setStatus({ step: 'Finding the player in each shot…' });
      const { boxes, frames } = await findPlayer(r, a, b);
      await reels().set(`${key}/A.jpg`, frames.a);
      await reels().set(`${key}/B.jpg`, frames.b);
      await setStatus({ step: null, draft: { ...words, boxes, a, b } });
      return new Response('done');
    }
    const draft = status.draft ?? {};
    const title = body.title ?? draft.title ?? '';
    const phases = (body.phases ?? draft.phases ?? []).filter((p) => p.name).slice(0, 5);
    const boxes = body.boxes ?? draft.boxes ?? {};
    await setStatus({ step: 'Making the video…', error: null, done: false });
    const { mp4, seconds } = await makeReel(r.videoFileId, { a: { ...a, boxes: boxes.a }, b: { ...b, boxes: boxes.b }, title, phases }, (step) => setStatus({ step }));
    await reels().set(`${key}.mp4`, mp4);
    const fileId = await uploadSimple({ name: `${ref} – reel test ${a.t} vs ${b.t}.mp4`, mimeType: 'video/mp4', parents: [r.folderId] }, mp4, 'video/mp4');
    await setStatus({ step: null, done: true, fileId, seconds, title, phases });
  } catch (err) {
    console.error(`reel ${ref}: ${err.message}`);
    await setStatus({ step: null, error: err.message.replace(/https?:\/\/\S+/g, '<link>').slice(0, 400) });
  }
  return new Response('done');
};

export const config = { path: '/api/reel-run', background: true };
