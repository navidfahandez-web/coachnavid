// Pro reference library: a folder per top player → his shots → checked clips (YouTube embeds only,
// never downloaded) + a technique profile per shot. The AI watches YouTube videos through Gemini's
// YouTube URL input. Three steps per player, run as jobs by /api/pros-run (background):
//   index   — find the moments the player hits the ball, window by window (2 min at 2 frames/s)
//   verify  — check each moment on its own 3-second clip at 10 frames/s: real? which shot? exact
//             contact time, the 5 phases of THIS swing and 1-3 signature details
//   profile — write the player's technique per shot from his verified clips (text only, cheap)
// Clips live in pros/clips (shared with the compare page — only ever ADD fields there).
import { readJSON, updateJSON } from './store.mjs';
import { ask } from './video-ai.mjs';
import { SHOTS } from '../../shared/report.js';
import { SITE_URL } from './google.mjs';

export const PROS = 'pros/clips';
export const JOBS = 'pros/jobs'; // [{ type: 'index'|'verify'|'profile', player, source?, next?, refine? }]
export const STATUS = 'pros/status'; // { step, at, error, log: [] }
export const VIDEOS = 'pros/videos'; // { [youtubeId]: { title, author, embeddable, duration, players: [], indexed } }
export const profileKey = (id) => `pros/profile/${id}`;

// `name` = the player value used in pros/clips (same spelling as learn.mjs PRO_PLAYERS)
export const PLAYERS = [
  { id: 'galan', name: 'Galán', full: 'Alejandro Galán', tour: 'men' },
  { id: 'tapia', name: 'Tapia', full: 'Agustín Tapia', tour: 'men' },
  { id: 'coello', name: 'Coello', full: 'Arturo Coello', tour: 'men' },
  { id: 'chingotto', name: 'Chingotto', full: 'Federico Chingotto', tour: 'men' },
  { id: 'lebron', name: 'Lebrón', full: 'Juan Lebrón', tour: 'men' },
  { id: 'augsburger', name: 'Augsburger', full: 'Leo Augsburger', tour: 'men' },
  { id: 'triay', name: 'Triay', full: 'Gemma Triay', tour: 'women' },
  { id: 'brea', name: 'Brea', full: 'Delfina Brea', tour: 'women' },
  { id: 'sanchez', name: 'Sánchez', full: 'Ariana Sánchez', tour: 'women' },
  { id: 'josemaria', name: 'Josemaría', full: 'Paula Josemaría', tour: 'women' },
  { id: 'gonzalez', name: 'González', full: 'Bea González', tour: 'women' },
];
export const playerByName = (name) => PLAYERS.find((p) => p.name === name || p.id === name || p.full === name);

const VERIFY_MODELS = ['gemini-3.8-flash', 'gemini-3.1-pro-preview'];
const S = (d) => ({ type: 'STRING', description: d });
export const sec = (t) => String(t ?? '').split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
export const fmt = (s) => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
const shotName = (id) => SHOTS.find((s) => s.id === id)?.en ?? id;
const yt = (id) => `https://www.youtube.com/watch?v=${id}`;

export const youtubeId = (url) => String(url ?? '').trim().match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/)?.[1]
  ?? (/^[\w-]{11}$/.test(String(url ?? '').trim()) ? String(url).trim() : null);

// Can this video be played in an embed on our site? oEmbed answers 401/403 when the owner blocks it.
export async function embedInfo(id) {
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(yt(id))}`).catch(() => null);
  if (!res) return { embeddable: null };
  if (res.status === 401 || res.status === 403) return { embeddable: false };
  if (!res.ok) return { embeddable: false, missing: true };
  const j = await res.json().catch(() => ({}));
  return { embeddable: true, title: j.title ?? '', author: j.author_name ?? '' };
}

// Length of a YouTube video (from the public watch page metadata; null if YouTube doesn't say)
export async function videoSeconds(id) {
  const html = await fetch(yt(id), { headers: { 'Accept-Language': 'en' } }).then((r) => r.text()).catch(() => '');
  const n = Number(html.match(/"lengthSeconds":"(\d+)"/)?.[1]);
  return n > 0 ? n : null;
}

// Gemini sometimes counts from the clip start, sometimes from the video start: accept both
const inClip = (t, from, to) => {
  if (!Number.isFinite(t)) return null;
  if (t >= from - 0.3 && t <= to + 0.3) return t;
  if (t >= 0 && t <= to - from + 0.3) return from + t;
  return null;
};

// INDEX: every moment `player` hits the ball in [from, to) seconds of the video
export async function findShots(source, player, from, to, title = '') {
  const { json } = await ask({
    contents: [{ role: 'user', parts: [
      { fileData: { fileUri: yt(source) }, videoMetadata: { startOffset: `${from}s`, endOffset: `${to}s`, fps: 2 } },
      { text: `Padel video "${title}". This clip is ${fmt(from)}–${fmt(to)} of the video.
Find every moment ${player} (professional padel player) hits the ball and his/her technique is visible. Recognise ${player} by name captions, commentary, shirt, playing side and partner; if you are not sure it is ${player}, leave the shot out.
For each: the time of CONTACT as m:ss.s of the FULL video (between ${fmt(from)} and ${fmt(to)}), which shot, how well the technique can be seen (1-5) and the camera angle. Only shots you actually see — never fill in a pattern. Max 25.` },
    ] }],
    generationConfig: {
      responseMimeType: 'application/json', temperature: 0.1,
      responseSchema: { type: 'OBJECT', required: ['player_seen', 'shots'], properties: {
        player_seen: { type: 'BOOLEAN', description: `${player} appears in this clip` },
        shots: { type: 'ARRAY', items: { type: 'OBJECT', required: ['time', 'shot', 'quality', 'view'], properties: {
          time: S('m:ss.s contact time in the full video'),
          shot: { type: 'STRING', enum: SHOTS.map((s) => s.id) },
          quality: { type: 'INTEGER' },
          view: { type: 'STRING', enum: ['behind', 'side', 'front', 'above', 'court-level'] },
        } } },
      } },
    },
  }, VERIFY_MODELS, false, 180000);
  return (json.shots ?? []).map((s) => ({ ...s, t: inClip(sec(s.time), from, to) })).filter((s) => s.t !== null);
}

// VERIFY: one shot on its own 3-second clip at 10 frames/s
export async function verifyShot(c) {
  const t = sec(c.time);
  const from = Math.max(0, t - 1.5), to = t + 1.5;
  const { json } = await ask({
    contents: [{ role: 'user', parts: [
      { fileData: { fileUri: yt(c.source) }, videoMetadata: { startOffset: `${from.toFixed(1)}s`, endOffset: `${to.toFixed(1)}s`, fps: 10 } },
      { text: `This 3-second clip (${fmt(from)}–${fmt(to)} of the video) should show ${c.player} (professional padel player) hitting a ${shotName(c.shot)} at about ${fmt(t)}.
First answer honestly: is that player clearly visible hitting a shot in this clip, which shot is it really, and at which exact moment does the racket touch the ball (m:ss.s of the full video)? Then describe THIS swing in the 5 phases — what you actually see in these frames (body, feet, racket, non-hitting arm, contact height and position), not a textbook description. Add 1-3 details that are special about how this player does it.` },
    ] }],
    generationConfig: {
      responseMimeType: 'application/json', temperature: 0.1,
      responseSchema: { type: 'OBJECT', required: ['visible', 'is_player', 'shot', 'contact', 'phases', 'details'], properties: {
        visible: { type: 'BOOLEAN', description: 'a player clearly hits the ball in this clip' },
        is_player: { type: 'BOOLEAN', description: `it is ${c.player} who hits it (as far as you can tell)` },
        shot: { type: 'STRING', enum: [...SHOTS.map((s) => s.id), 'none'] },
        contact: S('m:ss.s of the full video when the racket touches the ball'),
        phases: { type: 'OBJECT', required: ['preparation', 'load', 'drop', 'contact', 'finish'], properties: { preparation: S('what you see'), load: S('what you see'), drop: S('what you see'), contact: S('what you see'), finish: S('what you see') } },
        details: { type: 'ARRAY', items: { type: 'STRING' }, description: '1-3 signature details of this swing' },
      } },
    },
  }, VERIFY_MODELS, false, 90000);
  const ok = Boolean(json.visible && json.is_player && json.shot !== 'none');
  const hit = inClip(sec(json.contact), from, to);
  return { ok, shot: json.shot, phases: json.phases, details: json.details ?? [], contact: hit };
}

// Save a verify result on the clip (keeps the original listing in shotListed / phasesListed)
export function applyVerify(c, r) {
  if (r.error) { c.verifyError = r.error; return; } // left unchecked: tried again next run
  delete c.verifyError;
  c.verified = r.ok;
  c.checkedAt = new Date().toISOString();
  if (!r.ok) return;
  if (c.shotListed === undefined) { c.shotListed = c.shot; c.phasesListed = c.phases; }
  c.shot = r.shot; c.phases = r.phases; c.details = r.details;
  if (r.contact !== null && r.contact !== undefined) { c.time = fmt(r.contact); c.end = fmt(r.contact + 1.2); c.timed = true; }
}

const PHASE_OBJ = { type: 'OBJECT', required: ['typical', 'special'], properties: { typical: S('what he/she always does in this phase (1-2 short sentences)'), special: S('what is special / different from most players, or "" if nothing') } };

// PROFILE: the player's technique per shot, from his verified clips only
export async function buildProfile(p) {
  const clips = (await readJSON(PROS, [])).filter((c) => c.player === p.name && c.verified === true);
  if (!clips.length) return null;
  const byShot = {};
  for (const c of clips) (byShot[c.shot] ??= []).push(c);
  const input = Object.entries(byShot).map(([shot, list]) => `## ${shot} — ${shotName(shot)} (${list.length} clips)\n${list.map((c) => `- id ${c.id} · quality ${c.quality ?? '?'} · view ${c.view ?? '?'}${c.navid === 'ok' ? ' · approved by coach' : c.recheck === 'unsure' ? ' · second check unsure (weigh less)' : ''}\n  ${Object.entries(c.phases ?? {}).map(([k, v]) => `${k}: ${v}`).join(' | ')}\n  details: ${(c.details ?? []).join('; ')}`).join('\n')}`).join('\n\n');
  const { json, model } = await ask({
    contents: [{ role: 'user', parts: [{ text: `You are helping padel coach Navid build a pro reference library for his students. Below are checked clips of ${p.full} (each one swing, described phase by phase by a video AI).
Write ${p.full}'s technique profile per shot: what is TYPICAL in each of the 5 phases (what repeats across his clips) and what is SPECIAL about him compared with most players, his signature details, and what an amateur student can copy. Base everything on these clips only; where clips disagree, go with the majority; if a shot has only 1-2 clips say so in "confidence". Pick the best 1-3 clip ids per shot to show students (clear, typical, high quality). Simple English, short sentences.

${input}` }] }],
    generationConfig: {
      responseMimeType: 'application/json', temperature: 0.3,
      responseSchema: { type: 'OBJECT', required: ['style', 'shots'], properties: {
        style: S(`${p.full}'s game and technique in 3-4 sentences`),
        shots: { type: 'ARRAY', items: { type: 'OBJECT', required: ['shot', 'summary', 'phases', 'signature', 'copy', 'best', 'confidence'], properties: {
          shot: { type: 'STRING', enum: Object.keys(byShot) },
          summary: S('2 sentences: how he/she plays this shot'),
          phases: { type: 'OBJECT', required: ['preparation', 'load', 'drop', 'contact', 'finish'], properties: { preparation: PHASE_OBJ, load: PHASE_OBJ, drop: PHASE_OBJ, contact: PHASE_OBJ, finish: PHASE_OBJ } },
          signature: { type: 'ARRAY', items: { type: 'STRING' }, description: '1-4 signature details' },
          copy: S('what an amateur student can copy from this, 1-2 sentences'),
          best: { type: 'ARRAY', items: { type: 'STRING' }, description: 'best 1-3 clip ids' },
          confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
        } } },
      } },
    },
  }, ['gemini-3.1-pro-preview', 'gemini-3.8-flash'], false, 300000);
  const ids = new Set(clips.map((c) => c.id));
  for (const s of json.shots ?? []) { s.best = (s.best ?? []).filter((id) => ids.has(id)); s.clips = byShot[s.shot]?.length ?? 0; }
  return { player: p.name, style: json.style, shots: json.shots ?? [], clips: clips.length, model, at: new Date().toISOString() };
}

export const setStatus = ({ log, ...s }) => updateJSON(STATUS, (x) => {
  Object.assign(x, s, { at: new Date().toISOString() });
  if (log) x.log = [...(x.log ?? []).slice(-30), `${new Date().toISOString().slice(5, 16).replace('T', ' ')} ${log}`];
}, {});

export const addJobs = (jobs) => updateJSON(JOBS, (q) => {
  for (const j of jobs) {
    const same = q.find((x) => x.type === j.type && x.player === j.player && (x.source ?? null) === (j.source ?? null));
    if (!same) { q.push(j); continue; }
    // already listed: keep its progress, move it to the end (so verify/profile run after new videos)
    q.splice(q.indexOf(same), 1);
    q.push({ ...same, ...j, refine: Boolean(same.refine || j.refine) });
  }
}, []);

// Start the background runner (it chains itself until the job list is empty)
export const kick = (origin = process.env.URL || SITE_URL) => fetch(`${origin}/api/pros-run`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() }, body: '{}',
}).catch(() => {});
