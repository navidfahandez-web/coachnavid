// Background (up to 15 min): voice note → transcript → Claude summary → PDF in the player's Drive folder.
// Called by /api/admin/lessons with the admin key; { phone, id, pdfOnly? }.
import { isAdmin } from '../lib/auth.mjs';
import { readJSON } from '../lib/store.mjs';
import { drive, uploadSimple } from '../lib/google.mjs';
import { externalKey, playerFolder, readPlayer } from '../lib/players.mjs';
import { audioStore, lessonPdf, readLessons, updateLesson } from '../lib/lessons.mjs';
import { canSummarize, canTranscribe, summarizeLesson, transcribe } from '../lib/lesson-ai.mjs';
import { AREAS } from '../../shared/report.js';

// Earlier reports, compact: area scores (+ shots) and the fixes
async function reportContext(phone) {
  const index = (await readJSON('reports/index', [])).filter((x) => x.status === 'published' && x.phone === phone)
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)).slice(-3);
  const out = [];
  for (const x of index) {
    const r = await readJSON(`reports/by-ref/${x.ref}`);
    if (!r) continue;
    out.push({
      date: r.publishedAt.slice(0, 10), kind: r.kind, headline: r.headline,
      fixes: r.items.filter((i) => i.title).map((i) => i.title),
      scores: Object.fromEntries(AREAS.filter((a) => r.scores?.[a.id]?.score).map((a) => [a.en, {
        score: r.scores[a.id].score,
        shots: Object.fromEntries(Object.entries(r.scores[a.id].shots ?? {}).filter(([, v]) => v.score).map(([k, v]) => [k, v.score])),
      }])),
    });
  }
  return out;
}

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { phone, id, pdfOnly } = await req.json();
  const lessons = await readLessons(phone);
  let lesson = lessons.find((l) => l.id === id);
  const player = await readPlayer(phone);
  if (!lesson || !player) return new Response('Not found', { status: 404 });

  try {
    if (!pdfOnly) {
      if (lesson.hasAudio && !lesson.transcript) {
        const audio = await audioStore().get(id, { type: 'arrayBuffer' });
        if (!audio) throw new Error('The recording is missing — please record it again.');
        if (!canTranscribe()) throw new Error('Voice notes need OPENAI_API_KEY in Netlify.');
        const transcript = await transcribe(Buffer.from(audio), lesson.mimeType);
        lesson = await updateLesson(phone, id, { transcript });
        try { // keep the original recording in the player's Drive folder
          const ext = lesson.mimeType.includes('webm') ? 'webm' : lesson.mimeType.includes('ogg') ? 'ogg' : 'm4a';
          const audioFileId = await uploadSimple({ name: `Voice note ${lesson.date}.${ext}`, parents: [await playerFolder(player)] }, Buffer.from(audio), lesson.mimeType.split(';')[0]);
          lesson = await updateLesson(phone, id, { audioFileId });
          await audioStore().delete(id);
        } catch (err) { console.error(`Voice note not archived: ${err.message}`); }
      }

      const notes = [lesson.transcript, lesson.notes].filter(Boolean).join('\n\n');
      if (!notes) throw new Error('Nothing to summarise.');
      if (!canSummarize()) throw new Error('Summaries need ANTHROPIC_API_KEY in Netlify.');
      const earlier = lessons.filter((l) => l.id !== id && l.summary && l.date <= lesson.date).slice(-5);
      const ext = (await readJSON(externalKey(phone), [])).slice(-2);
      const summary = await summarizeLesson({
        player, lang: lesson.lang, date: lesson.date, notes,
        previousLessons: earlier.map((l) => ({ date: l.date, title: l.summary.title, worked_on: l.summary.worked_on, to_improve: l.summary.to_improve, next_focus: l.summary.next_focus, shots: l.summary.shots })),
        reports: await reportContext(phone),
        glasswall: ext.map((e) => ({ date: e.date, focus: e.focus.map((f) => `${f.category}: ${f.title}`), stats: e.metrics.map((m) => `${m.name}: ${m.value}${m.unit === '%' ? '%' : ` ${m.unit}`}`) })),
      });
      lesson = await updateLesson(phone, id, { summary, status: 'pdf' });
    }

    const pdfFileId = await lessonPdf(lesson, player, await playerFolder(player));
    await drive(`files/${pdfFileId}/permissions?fields=id`, { method: 'POST', body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
    await updateLesson(phone, id, { pdfFileId, status: 'ready', error: null });
  } catch (err) {
    console.error(`Lesson ${id} failed: ${err.message}`);
    await updateLesson(phone, id, { status: 'failed', error: err.message });
  }
  return new Response('done');
};

export const config = { path: '/api/lessons-run', background: true };
