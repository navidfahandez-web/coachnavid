// Background (up to 15 min): AI first draft of a report from the student's video — { ref }.
// Started from the report builder; progress is kept in report.ai so the builder can show it.
import { isAdmin } from '../lib/auth.mjs';
import { logActivity, readJSON, updateJSON } from '../lib/store.mjs';
import { listFolder } from '../lib/google.mjs';
import { externalKey } from '../lib/players.mjs';
import { analyzeVideo, draftToReport, PART, verifyMoment } from '../lib/video-ai.mjs';
import { cutMoments, cutParts } from '../lib/clips.mjs';
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

const digits = (p) => String(p ?? '').replace(/\D/g, '');

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { ref, checkOnly } = await req.json();
  const key = `reports/by-ref/${ref}`;
  const setAi = (ai) => updateJSON(key, (x) => { x.ai = { ...(x.ai ?? {}), ...ai }; }, {});
  try {
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

    const cut = (onPart) => cutParts(videoId, PART, onPart);
    const guide = (await readJSON('learn/candidates', [])).filter((c) => c.status === 'approved');
    const { draft, model, moments, parts, duration } = await analyzeVideo(cut, r, { history, glasswall, guide },
      (done) => setAi({ step: done === total ? 'Writing the draft from the moments…' : `Watched part ${done} of ${total}…` }));
    await updateJSON(key, (x) => {
      const filled = draftToReport(x, draft);
      Object.assign(x, filled, {
        videoFileId: x.videoFileId || videoId,
        ai: { status: 'ready', at: new Date().toISOString(), model, player: draft.player_identified, notes: draft.confidence_notes, moments, parts, duration, checked: false },
        updatedAt: new Date().toISOString(),
      });
    }, {});
    await setAi({ status: 'running', step: 'Double-checking each moment…' });
    try { await checkMoments(key, setAi); } catch (err) { await setAi({ checks: [{ ok: null, seen: `Moments not checked: ${err.message}` }] }); }
    await setAi({ status: 'ready', step: null });
    await logActivity({ kind: 'sent', text: `AI draft ready for ${ref} (${model}) — check it in the report builder.` });
  } catch (err) {
    console.error(`AI draft for ${ref} failed: ${err.message}`);
    await setAi({ status: 'failed', error: err.message });
  }
  return new Response('done');
};

export const config = { path: '/api/ai-run', background: true };
