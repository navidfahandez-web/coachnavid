// Background (up to 15 min): AI first draft of a report from the student's video — { ref }.
// Started from the report builder; progress is kept in report.ai so the builder can show it.
import { isAdmin } from '../lib/auth.mjs';
import { logActivity, readJSON, updateJSON } from '../lib/store.mjs';
import { listFolder } from '../lib/google.mjs';
import { externalKey } from '../lib/players.mjs';
import { analyzeVideo, deleteUpload, draftToReport, uploadFromDrive } from '../lib/video-ai.mjs';
import { AREAS } from '../../shared/report.js';

const digits = (p) => String(p ?? '').replace(/\D/g, '');

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { ref } = await req.json();
  const key = `reports/by-ref/${ref}`;
  const setAi = (ai) => updateJSON(key, (x) => { x.ai = { ...(x.ai ?? {}), ...ai }; }, {});
  let upload = null;
  try {
    const r = await readJSON(key);
    if (!r) return new Response('Not found', { status: 404 });

    // The student's video: the one chosen in the builder, else the biggest video in the folder
    let videoId = r.videoFileId;
    if (!videoId) {
      const { files = [] } = await listFolder(r.folderId);
      videoId = files.filter((f) => /^video\//.test(f.mimeType)).sort((a, b) => Number(b.size) - Number(a.size))[0]?.id;
    }
    if (!videoId) throw new Error('No video in the student’s folder yet.');

    await setAi({ status: 'running', step: 'Sending the video to the AI…', progress: 0 });
    let last = 0;
    upload = await uploadFromDrive(videoId, async (done, total) => {
      const pct = Math.round((done / total) * 100);
      if (pct - last >= 10) { last = pct; await setAi({ progress: pct }); }
    });

    await setAi({ step: 'Watching the video and writing the draft…', progress: 100 });
    // Context: earlier published reports of this player + GlassWall
    const phone = digits(r.student.phone);
    const index = (await readJSON('reports/index', [])).filter((x) => x.status === 'published' && x.phone === phone && x.ref !== ref).slice(-3);
    const history = [];
    for (const x of index) {
      const e = await readJSON(`reports/by-ref/${x.ref}`);
      if (e) history.push({ date: e.publishedAt?.slice(0, 10), kind: e.kind, fixes: e.items.map((i) => i.title), scores: Object.fromEntries(AREAS.filter((a) => e.scores?.[a.id]?.score).map((a) => [a.id, e.scores[a.id].score])) });
    }
    const glasswall = (await readJSON(externalKey(phone), [])).slice(-2).map((g) => ({ date: g.date, focus: g.focus.map((f) => f.title), stats: g.metrics.map((m) => `${m.name}: ${m.value}${m.unit === '%' ? '%' : ` ${m.unit}`}`) }));

    const { draft, model } = await analyzeVideo(upload, r, { history, glasswall });
    if (draft.usable === false) throw new Error(`The AI couldn’t analyse this video: ${(draft.unusable_reason || 'no reason given').replace(/[.\s]+$/, '')}. Your report wasn’t changed.`);
    await updateJSON(key, (x) => {
      const filled = draftToReport(x, draft);
      Object.assign(x, filled, {
        videoFileId: x.videoFileId || videoId,
        ai: { status: 'ready', at: new Date().toISOString(), model, player: draft.player_identified, notes: draft.confidence_notes, checked: false },
        updatedAt: new Date().toISOString(),
      });
    }, {});
    await logActivity({ kind: 'sent', text: `AI draft ready for ${ref} (${model}) — check it in the report builder.` });
  } catch (err) {
    console.error(`AI draft for ${ref} failed: ${err.message}`);
    await setAi({ status: 'failed', error: err.message });
  } finally {
    if (upload?.name) await deleteUpload(upload.name); // don't keep student videos at Google longer than needed
  }
  return new Response('done');
};

export const config = { path: '/api/ai-run', background: true };
