// Lesson voice notes for a player (admin, from Navid's phone).
//   GET  /api/admin/lessons?phone=…   the player and their lessons
//   POST /api/admin/lessons           { phone, firstName?, lastName?, date, lang, notes?, audioBase64?, mimeType? } → new lesson
//   POST /api/admin/lessons           { phone, id, action: 'save' | 'retry' | 'sent' | 'delete', summary?, lang? }
// The slow part (transcribe → summary → PDF) runs in the background function lessons-run.
import { randomBytes } from 'node:crypto';
import { json, requireAdmin } from '../lib/auth.mjs';
import { deleteFile } from '../lib/google.mjs';
import { digits, ensurePlayer, readPlayer } from '../lib/players.mjs';
import { audioStore, lessonsKey, readLessons, updateLesson } from '../lib/lessons.mjs';
import { canSummarize, canTranscribe } from '../lib/lesson-ai.mjs';
import { updateJSON } from '../lib/store.mjs';

const MAX_AUDIO = 4.3 * 1024 * 1024; // request bodies are limited to 6 MB (base64)
const line = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const list = (a, n = 12) => (Array.isArray(a) ? a.slice(0, n).map((x) => line(x, 300)).filter(Boolean) : []);

function cleanSummary(s = {}) {
  return {
    title: line(s.title, 120), summary: String(s.summary ?? '').trim().slice(0, 1500),
    worked_on: list(s.worked_on), went_well: list(s.went_well), to_improve: list(s.to_improve),
    drills: (Array.isArray(s.drills) ? s.drills : []).slice(0, 8).map((d) => ({ name: line(d?.name, 80), how: line(d?.how, 400) })).filter((d) => d.name || d.how),
    progress: String(s.progress ?? '').trim().slice(0, 800), next_focus: String(s.next_focus ?? '').trim().slice(0, 600),
    shots: (Array.isArray(s.shots) ? s.shots : []).slice(0, 20).map((x) => ({ id: line(x?.id, 30), note: line(x?.note, 200), trend: line(x?.trend, 10) })),
  };
}

const run = (req, body) => fetch(`${new URL(req.url).origin}/api/lessons-run`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() },
  body: JSON.stringify(body),
});

export default async (req) => {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  if (req.method === 'GET') {
    const phone = digits(new URL(req.url).searchParams.get('phone'));
    const player = phone ? await readPlayer(phone) : null;
    const lessons = phone ? await readLessons(phone) : [];
    return json({
      player: player && { firstName: player.firstName, lastName: player.lastName, phone: `+${phone}`, token: player.token },
      lessons: lessons.slice().reverse(),
      ai: { transcribe: canTranscribe(), summarize: canSummarize() },
    });
  }

  let b;
  try { b = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const phone = digits(b.phone);
  if (!/^\d{8,15}$/.test(phone)) return json({ error: 'Enter the player’s WhatsApp number with country code.' }, 400);

  if (b.action) {
    const id = String(b.id ?? '');
    if (b.action === 'delete') {
      let removed = null;
      await updateJSON(lessonsKey(phone), (l) => { const i = l.findIndex((x) => x.id === id); if (i >= 0) removed = l.splice(i, 1)[0]; }, []);
      await audioStore().delete(id).catch(() => {});
      for (const f of [removed?.pdfFileId, removed?.audioFileId]) if (f) await deleteFile(f).catch(() => {});
      return json({ ok: true });
    }
    if (b.action === 'sent') return json({ lesson: await updateLesson(phone, id, { sentAt: new Date().toISOString() }) });
    if (b.action === 'save') {
      const lesson = await updateLesson(phone, id, { summary: cleanSummary(b.summary), lang: b.lang === 'lt' ? 'lt' : 'en', status: 'pdf', error: null });
      if (!lesson) return json({ error: 'Lesson not found.' }, 404);
      await run(req, { phone, id, pdfOnly: true });
      return json({ lesson });
    }
    if (b.action === 'redo') { // write the summary again from the same voice note
      const lesson = await updateLesson(phone, id, { summary: null, status: 'processing', error: null });
      if (!lesson) return json({ error: 'Lesson not found.' }, 404);
      await run(req, { phone, id });
      return json({ lesson });
    }
    if (b.action === 'retry') {
      const lesson = await updateLesson(phone, id, (x) => ({ status: x.summary ? 'pdf' : 'processing', error: null }));
      if (!lesson) return json({ error: 'Lesson not found.' }, 404);
      await run(req, { phone, id, pdfOnly: Boolean(lesson.summary) });
      return json({ lesson });
    }
    return json({ error: 'Unknown action.' }, 400);
  }

  // ---------- new lesson ----------
  const existing = await readPlayer(phone);
  const firstName = line(b.firstName, 60) || existing?.firstName;
  if (!firstName) return json({ error: 'Enter the player’s name.' }, 400);
  await ensurePlayer({ phone, firstName, lastName: line(b.lastName, 60) || existing?.lastName || '' });

  const notes = String(b.notes ?? '').trim().slice(0, 6000);
  const audio = b.audioBase64 ? Buffer.from(String(b.audioBase64), 'base64') : null;
  if (!audio && !notes) return json({ error: 'Record a voice note or type your notes.' }, 400);
  if (audio && audio.length > MAX_AUDIO) return json({ error: 'That recording is too long (max ~15 minutes). Split it in two, or type the rest.' }, 400);
  if (audio && !canTranscribe() && !notes) return json({ error: 'Voice notes need speech-to-text (Netlify AI Gateway or OPENAI_API_KEY) — for now, type your notes instead.' }, 503);
  if (!canSummarize()) return json({ error: 'Summaries need ANTHROPIC_API_KEY in Netlify.' }, 503);

  const lesson = {
    id: randomBytes(6).toString('hex'),
    date: /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : new Date().toISOString().slice(0, 10),
    lang: b.lang === 'lt' ? 'lt' : 'en',
    notes, hasAudio: Boolean(audio), mimeType: line(b.mimeType, 60) || 'audio/mp4',
    transcript: '', summary: null, pdfFileId: null, audioFileId: null,
    status: 'processing', error: null, createdAt: new Date().toISOString(), sentAt: null,
  };
  if (audio) await audioStore().set(lesson.id, audio);
  await updateJSON(lessonsKey(phone), (l) => { l.push(lesson); l.sort((x, y) => `${x.date}${x.createdAt}`.localeCompare(`${y.date}${y.createdAt}`)); }, []);
  await run(req, { phone, id: lesson.id });
  return json({ lesson });
};

export const config = { path: '/api/admin/lessons' };
