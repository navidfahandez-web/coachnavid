// Video analysis reports — one per upload (VA0001…), written by Navid in the admin builder.
//   GET  /api/admin/reports/:ref          (admin) the report (a fresh draft the first time) + the folder's files
//   PUT  /api/admin/reports/:ref          (admin) save the draft
//   POST /api/admin/reports/:ref/publish  (admin) publish: share the folder, return the WhatsApp text for the student
//   GET  /api/report/:token               the student's report (drafts only with the admin key, for preview)
import { randomBytes } from 'node:crypto';
import { isAdmin, json, requireAdmin } from '../lib/auth.mjs';
import { logActivity, readJSON, updateJSON } from '../lib/store.mjs';
import { listFolder, shareFolder } from '../lib/google.mjs';
import { SITE_URL } from '../lib/google.mjs';
import { AREAS, KINDS, kindForPlan } from '../../shared/report.js';

const UPLOADS = 'uploads/list';
const INDEX = 'reports/index'; // [{ ref, token, phone, kind, status, publishedAt }]
const reportKey = (ref) => `reports/by-ref/${ref}`;
const tokenKey = (token) => `reports/by-token/${token}`;
const digits = (p) => String(p ?? '').replace(/\D/g, '');
const str = (s, n = 400) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n);
const line = (s, n = 120) => str(s, n).replace(/\s+/g, ' ');

const findUpload = async (ref) => (await readJSON(UPLOADS, [])).find((u) => u.ref === ref);
const reportUrl = (token) => `${SITE_URL}/report/${token}`;

function blankReport(u) {
  const kind = kindForPlan(u.plan);
  return {
    ref: u.ref, token: randomBytes(16).toString('hex'), kind, plan: u.plan,
    lang: digits(u.phone).startsWith('370') ? 'lt' : 'en', status: 'draft',
    student: { firstName: u.firstName, lastName: u.lastName, phone: u.phone },
    folderId: u.folderId, studentNotes: u.notes ?? '',
    headline: '', summary: '', strengths: '', closing: '',
    items: [], scores: {}, weeks: [], videoFileId: null, mediaFileId: null,
    createdAt: new Date().toISOString(), updatedAt: null, publishedAt: null,
  };
}

// Only keep the fields the builder may set, trimmed to sane sizes.
function sanitize(r, b) {
  const kind = KINDS[b.kind] ? b.kind : r.kind;
  const spec = KINDS[kind];
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, spec.items).map((i) => ({
    time: line(i?.time, 12), title: line(i?.title), detail: str(i?.detail, 600),
    fix: str(i?.fix, 600), drillName: line(i?.drillName, 80), drillHow: str(i?.drillHow, 600),
  }));
  const scores = {};
  if (spec.scores) {
    for (const a of AREAS) {
      const s = b.scores?.[a.id] ?? {};
      const n = Math.round(Number(s.score));
      scores[a.id] = { score: n >= 1 && n <= 10 ? n : null, note: line(s.note, 160) };
    }
  }
  const weeks = (Array.isArray(b.weeks) ? b.weeks : []).slice(0, spec.weeks).map((w) => ({ focus: line(w?.focus, 100), plan: str(w?.plan, 800) }));
  const fileId = (v) => (/^[\w-]{10,100}$/.test(String(v ?? '')) ? String(v) : null);
  return {
    ...r, kind, lang: b.lang === 'lt' ? 'lt' : 'en',
    headline: line(b.headline, 140), summary: str(b.summary, 1500), strengths: str(b.strengths, 800), closing: str(b.closing, 800),
    items, scores, weeks, videoFileId: fileId(b.videoFileId), mediaFileId: fileId(b.mediaFileId),
    updatedAt: new Date().toISOString(),
  };
}

const saveReport = async (r) => {
  await updateJSON(reportKey(r.ref), (x) => { Object.keys(x).forEach((k) => delete x[k]); Object.assign(x, r); }, {});
  await updateJSON(tokenKey(r.token), (x) => { x.ref = r.ref; }, {});
};

// What the student's page needs (no phone number, no folder id).
async function publicView(r) {
  const index = await readJSON(INDEX, []);
  const earlier = index.filter((x) => x.status === 'published' && x.ref !== r.ref && x.phone === digits(r.student.phone) &&
    (!r.publishedAt || x.publishedAt < r.publishedAt)).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const history = [];
  for (const x of earlier.slice(-6)) {
    const e = await readJSON(reportKey(x.ref));
    if (e) history.push({ token: e.token, kind: e.kind, headline: e.headline, publishedAt: e.publishedAt, scores: e.scores });
  }
  const { student, folderId, studentNotes, ...rest } = r;
  return { ...rest, student: { firstName: student.firstName, lastName: student.lastName }, history };
}

export default async (req, context) => {
  const { pathname } = new URL(req.url);

  // ---------- student ----------
  if (pathname.startsWith('/api/report/')) {
    const token = String(context.params.token ?? '');
    if (!/^[a-f0-9]{32}$/.test(token)) return json({ error: 'Report not found.' }, 404);
    const pointer = await readJSON(tokenKey(token));
    const r = pointer && await readJSON(reportKey(pointer.ref));
    if (!r || (r.status !== 'published' && !isAdmin(req))) return json({ error: 'Report not found.' }, 404);
    return json(await publicView(r));
  }

  // ---------- admin ----------
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const ref = String(context.params.ref ?? '').toUpperCase();
  const u = await findUpload(ref);
  if (!u) return json({ error: `Upload ${ref} not found.` }, 404);
  let r = await readJSON(reportKey(ref));

  if (req.method === 'GET') {
    if (!r) { r = blankReport(u); await saveReport(r); }
    const files = await listFolder(u.folderId).then((x) => x.files ?? []).catch(() => []);
    return json({ report: r, upload: { ref: u.ref, planName: u.planName, notes: u.notes, phone: u.phone }, files, url: reportUrl(r.token) });
  }

  if (!r) return json({ error: 'Open the report first.' }, 400);
  let b = {};
  try { b = await req.json(); } catch { /* publish has no body */ }

  if (req.method === 'PUT') {
    r = sanitize(r, b);
    await saveReport(r);
    return json({ ok: true, report: r });
  }

  if (req.method === 'POST' && pathname.endsWith('/publish')) {
    if (b && Object.keys(b).length) r = sanitize(r, b);
    if (!r.items.some((i) => i.title)) return json({ error: 'Add at least one error/fix before publishing.' }, 400);
    try { await shareFolder(r.folderId); } catch (err) {
      return json({ error: `Couldn’t share the Drive folder: ${err.message}` }, 502);
    }
    const first = !r.publishedAt;
    r = { ...r, status: 'published', publishedAt: r.publishedAt ?? new Date().toISOString() };
    await saveReport(r);
    await updateJSON(INDEX, (list) => {
      const x = list.find((y) => y.ref === r.ref);
      const entry = { ref: r.ref, token: r.token, phone: digits(r.student.phone), kind: r.kind, status: 'published', publishedAt: r.publishedAt };
      if (x) Object.assign(x, entry); else list.push(entry);
    }, []);
    await updateJSON(UPLOADS, (list) => {
      const x = list.find((y) => y.ref === r.ref);
      if (x) Object.assign(x, { sharedAt: x.sharedAt ?? new Date().toISOString(), reportToken: r.token });
    }, []);
    if (first) await logActivity({ kind: 'sent', text: `Report ${r.ref} (${KINDS[r.kind].name}) published for ${r.student.firstName}.` });
    const name = r.student.firstName;
    const text = r.lang === 'lt'
      ? `Labas, ${name}! 🎥 Jūsų ${KINDS[r.kind].name} video analizė paruošta:\n${reportUrl(r.token)}\n\nKlausimai? Tiesiog atsakykite čia. Treneris Navid`
      : `Hi ${name}! 🎥 Your ${KINDS[r.kind].name} video analysis is ready:\n${reportUrl(r.token)}\n\nAny questions, just reply here. Coach Navid`;
    return json({ ok: true, report: r, url: reportUrl(r.token), whatsapp: `https://wa.me/${digits(r.student.phone)}?text=${encodeURIComponent(text)}` });
  }

  return json({ error: 'Not found' }, 404);
};

export const config = { path: ['/api/admin/reports/:ref', '/api/admin/reports/:ref/publish', '/api/report/:token'] };
