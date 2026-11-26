// Background (up to 15 min): AI first draft of a report from the student's video — { ref }.
// Started from the report builder; progress is kept in report.ai so the builder can show it.
import { getStore } from '@netlify/blobs';
import { isAdmin } from '../lib/auth.mjs';
import { logActivity, readJSON, updateJSON } from '../lib/store.mjs';
import { listFolder } from '../lib/google.mjs';
import { externalKey } from '../lib/players.mjs';
import { analyzeVideo, draftToReport, markFrames, PART, shotPhases, verifyMoment } from '../lib/video-ai.mjs';
import { cutMoments, cutParts, cutShot, grabFrames } from '../lib/clips.mjs';
import { markedFrameHtml, renderJpegs } from '../lib/pdf-render.mjs';
import { drive } from '../lib/google.mjs';
import { AREAS, toSeconds } from '../../shared/report.js';

const BEFORE = 4; // seconds of context before the claimed moment

// Watch only the seconds around each fix and record whether they really show it.
async function checkMoments(key, setAi) {
  const r = await readJSON(key);
  const items = (r.items ?? []).map((it, k) => ({ it, k, t: toSeconds(it.time) })).filter((x) => x.it.title && x.t !== null);
  if (!items.length || !r.videoFileId) return;
  await setAi({ step: 'Double-checking each moment…', checks: null });
  const clips = await cutMoments(r.videoFileId, items.map((x) => ({ start: x.t - BEFORE, length: BEFORE + 4 })));
  const checks = [];
  for (const [n, x] of items.entries()) {
    try {
      const v = await verifyMoment(clips[n], x.it, r.ai?.player, Math.min(BEFORE, x.t));
      checks.push({ index: x.k, time: x.it.time, title: x.it.title, ok: Boolean(v.matches), seen: v.what_happens ?? '' });
    } catch (err) { checks.push({ index: x.k, time: x.it.time, title: x.it.title, ok: null, seen: `Couldn’t check: ${err.message}` }); }
  }
  await setAi({ checks, checkedAt: new Date().toISOString() });
}

// Shot breakdown: for each fix, the 3 phases of that shot (preparation → contact → ending) as frames
// with the important body parts marked. Pictures in Blobs (compare-clips store), served by
// /api/admin/compare/frame; the list in report.ai.breakdown.
const mmss = (sec) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, '0')}`;
async function breakdown(key, setAi) {
  const r = await readJSON(key);
  const items = (r.items ?? []).map((it, k) => ({ it, k, t: toSeconds(it.time) })).filter((x) => x.it.title && x.t !== null).slice(0, 3);
  if (!items.length || !r.videoFileId) throw new Error('No fixes with a time yet.');
  const store = getStore({ name: 'compare-clips', consistency: 'strong' });
  const shots = [];
  const cards = [];
  for (const [n, x] of items.entries()) {
    await setAi({ breakdownStep: `Shot ${n + 1} of ${items.length}: finding preparation, contact and ending…` });
    const before = Math.min(2.5, x.t);
    const start = x.t - before;
    const clip = await cutShot(r.videoFileId, start, 4.5);
    const phases = await shotPhases(clip, x.it, r.ai?.player, before);
    let prev = -1;
    for (const p of phases) { if (!Number.isFinite(p.t) || p.t <= prev) p.t = Math.min(4.4, prev + 0.4); p.t = Math.max(0, Math.min(4.4, p.t)); prev = p.t; }
    const at = phases.map((p) => start + p.t);
    await setAi({ breakdownStep: `Shot ${n + 1} of ${items.length}: marking the body on each frame…` });
    const frames = await grabFrames(r.videoFileId, at);
    const marked = await markFrames(frames, x.it, phases, r.ai?.player);
    const shot = { index: x.k, time: x.it.time, title: x.it.title, phases: phases.map((p, i) => ({ id: p.id, name: p.name, time: mmss(at[i]), what: p.what, ...marked[i], img: `breakdown/${r.ref}/${x.k}-${p.id}` })) };
    shots.push(shot);
    shot.phases.forEach((ph, i) => cards.push({ ph, html: markedFrameHtml(frames[i], { phase: `${x.k + 1} · ${ph.name}`, time: ph.time, caption: ph.caption, marks: ph.marks }) }));
  }
  await setAi({ breakdownStep: 'Drawing the marks…' });
  const jpgs = await renderJpegs(cards.map((c) => c.html));
  for (const [i, c] of cards.entries()) await store.set(`${c.ph.img}.jpg`, jpgs[i]);
  await setAi({ breakdown: shots, breakdownAt: new Date().toISOString() });
}

const digits = (p) => String(p ?? '').replace(/\D/g, '');

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { ref, checkOnly, watch, breakdownOnly } = await req.json();
  const key = `reports/by-ref/${ref}`;
  let lastStep = 'starting';
  const setAi = (ai) => { if (ai.step) lastStep = ai.step; return updateJSON(key, (x) => { x.ai = { ...(x.ai ?? {}), ...ai }; }, {}); };
  // Netlify stops a background function after 15 min without a word, which left the builder saying
  // "running" for ever: save a clear message just before that.
  const watchdog = setTimeout(() => {
    console.error(`AI draft for ${ref}: out of time (${lastStep})`);
    setAi({ status: 'failed', error: `The AI took too long (stopped while: ${lastStep}). ${lastStep.startsWith('Double') ? 'The new draft is in, but its moments weren’t all double-checked' : 'Your report wasn’t changed'} — try again later; if it happens again, tell Claude.` }).catch(() => {});
  }, 14 * 60e3);
  try {
    if (breakdownOnly) { // Navid asked for the shot breakdown of the current fixes
      await setAi({ breakdownStatus: 'running', breakdownStep: 'Starting…', breakdownError: null });
      try { await breakdown(key, setAi); await setAi({ breakdownStatus: 'ready', breakdownStep: null }); } catch (err) {
        console.error(`breakdown ${ref}: ${err.message}`);
        await setAi({ breakdownStatus: 'failed', breakdownStep: null, breakdownError: err.message.slice(0, 300) });
      }
      return new Response('done');
    }
    if (checkOnly) { // Navid changed times: only re-check the moments
      await checkMoments(key, setAi);
      await setAi({ status: 'ready', step: null });
      return new Response('done');
    }
    const r = await readJSON(key);
    if (!r) return new Response('Not found', { status: 404 });

    // The student's video: the one chosen in the builder, else the biggest video in the folder
    let videoId = r.videoFileId;
    if (!videoId) {
      const { files = [] } = await listFolder(r.folderId);
      videoId = files.filter((f) => /^video\//.test(f.mimeType)).sort((a, b) => Number(b.size) - Number(a.size))[0]?.id;
    }
    if (!videoId) throw new Error('No video in the student’s folder yet.');

    const ms = Number((await drive(`files/${videoId}?fields=videoMediaMetadata`)).videoMediaMetadata?.durationMillis) || 0;
    const total = ms ? Math.ceil(ms / 1000 / PART) : '?';
    await setAi({ status: 'running', step: `Cutting the video into ${total} parts and watching each one…`, progress: 0, error: null });
    // Context: earlier published reports of this player + GlassWall
    const phone = digits(r.student.phone);
    const index = (await readJSON('reports/index', [])).filter((x) => x.status === 'published' && x.phone === phone && x.ref !== ref).slice(-3);
    const history = [];
    for (const x of index) {
      const e = await readJSON(`reports/by-ref/${x.ref}`);
      if (e) history.push({ date: e.publishedAt?.slice(0, 10), kind: e.kind, fixes: e.items.map((i) => i.title), scores: Object.fromEntries(AREAS.filter((a) => e.scores?.[a.id]?.score).map((a) => [a.id, e.scores[a.id].score])) });
    }
    const glasswall = (await readJSON(externalKey(phone), [])).slice(-2).map((g) => ({ date: g.date, focus: g.focus.map((f) => f.title), stats: g.metrics.map((m) => `${m.name}: ${m.value}${m.unit === '%' ? '%' : ` ${m.unit}`}`) }));

    // Safety: a video whose internal clock is broken comes out much longer than it really is (the AI
    // would then get repeated frames and wrong times) — stop before spending AI credits on it.
    const short = ms > 0 && ms < 4 * 60e3; // a short clip (training): cut and watched in more detail
    const cut = (onPart) => cutParts(videoId, PART, async (k, buf) => {
      if (ms && k * PART > ms / 1000 + 30) throw new Error(`The video’s timing looks broken (part ${k + 1} starts after the real end at ${Math.round(ms / 60000)} min), so the AI’s times would be wrong. Your report wasn’t changed — tell Claude which video this is.`);
      return onPart(k, buf);
    }, { short });
    const guide = (await readJSON('learn/candidates', [])).filter((c) => c.status === 'approved');
    const guideNotes = await readJSON('learn/notes', {});
    const { draft, model, moments, setting, parts, duration } = await analyzeVideo(cut, r, { history, glasswall, guide, guideNotes, watch, fps: short ? 5 : undefined },
      (done) => setAi({ step: done === total ? 'Writing the draft from the moments…' : `Watched part ${done} of ${total}…` }));
    await updateJSON(key, (x) => {
      const filled = draftToReport(x, draft);
      Object.assign(x, filled, {
        videoFileId: x.videoFileId || videoId,
        ai: { status: 'ready', at: new Date().toISOString(), model, watchedBy: watch === 'pro' ? 'pro' : 'flash', setting, player: draft.player_identified, notes: draft.confidence_notes, moments, parts, duration, checked: false },
        updatedAt: new Date().toISOString(),
      });
    }, {});
    await setAi({ status: 'running', step: 'Double-checking each moment…' });
    try { await checkMoments(key, setAi); } catch (err) { await setAi({ checks: [{ ok: null, seen: `Moments not checked: ${err.message}` }] }); }
    if (setting === 'training') { // technique clips: break each fix's shot down into its phases
      await setAi({ status: 'running', step: 'Breaking down each shot (preparation → contact → ending)…', breakdownStatus: 'running' });
      try { await breakdown(key, setAi); await setAi({ breakdownStatus: 'ready', breakdownStep: null }); } catch (err) { await setAi({ breakdownStatus: 'failed', breakdownStep: null, breakdownError: err.message.slice(0, 300) }); }
    }
    await setAi({ status: 'ready', step: null });
    await logActivity({ kind: 'sent', text: `AI draft ready for ${ref} (${model}) — check it in the report builder.` });
  } catch (err) {
    console.error(`AI draft for ${ref} failed: ${err.message}`);
    await setAi({ status: 'failed', error: err.message, ...(err.moments ? { moments: err.moments, parts: err.partLog, setting: err.setting } : {}) });
  } finally {
    clearTimeout(watchdog);
  }
  return new Response('done');
};

export const config = { path: '/api/ai-run', background: true };
