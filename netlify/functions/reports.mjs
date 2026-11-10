// Video analysis reports — one per upload (VA0001…), written by Navid in the admin builder.
//   GET  /api/admin/reports/:ref          (admin) the report (a fresh draft the first time) + the folder's files
//   PUT  /api/admin/reports/:ref          (admin) save the draft
//   POST /api/admin/reports/:ref/publish  (admin) publish: share the folder, return the WhatsApp text for the student
//   GET  /api/report/:token               the student's report (drafts only with the admin key, for preview)
//   GET  /api/player/:token               a player's progress: every published report, scores over time
//   GET  /api/admin/players               (admin) all players with reports
import { randomBytes } from 'node:crypto';
import { isAdmin, json, requireAdmin } from '../lib/auth.mjs';
import { logActivity, readJSON, updateJSON } from '../lib/store.mjs';
import { listFolder, shareFolder } from '../lib/google.mjs';
import { SITE_URL } from '../lib/google.mjs';
import { ensurePlayer as savePlayer, externalKey, playerKey, playerTokenKey } from '../lib/players.mjs';
import { AREAS, KINDS, areaScore, kindForPlan } from '../../shared/report.js';
import { canAnalyze } from '../lib/video-ai.mjs';

const UPLOADS = 'uploads/list';
const INDEX = 'reports/index'; // [{ ref, token, phone, kind, status, publishedAt }]
const reportKey = (ref) => `reports/by-ref/${ref}`;
const tokenKey = (token) => `reports/by-token/${token}`;
const digits = (p) => String(p ?? '').replace(/\D/g, '');
const str = (s, n = 400) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n);
const line = (s, n = 120) => str(s, n).replace(/\s+/g, ' ');

const findUpload = async (ref) => (await readJSON(UPLOADS, [])).find((u) => u.ref === ref);
const reportUrl = (token) => `${SITE_URL}/report/${token}`;

// Average of the scorecard (Match Reports only); null when there are no scores.
function scoreAverage(scores) {
  const v = AREAS.map((a) => scores?.[a.id]?.score).filter((n) => Number.isFinite(n));
  return v.length ? Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10 : null;
}

// Every player (by phone number) gets one private progress link.
async function ensurePlayer(r) {
  return (await savePlayer(r.student)).token;
}

// Published reports of one player, oldest first.
async function playerReports(phone) {
  const index = (await readJSON(INDEX, [])).filter((x) => x.status === 'published' && x.phone === phone)
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const out = [];
  for (const x of index) {
    const r = await readJSON(reportKey(x.ref));
    if (r) out.push(r);
  }
  return out;
}

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
    time: line(i?.time, 12), clipStart: line(i?.clipStart, 12), clipLen: Number(i?.clipLen) > 0 ? Math.min(8, Number(i.clipLen)) : null, title: line(i?.title), detail: str(i?.detail, 600),
    fix: str(i?.fix, 600), drillName: line(i?.drillName, 80), drillHow: str(i?.drillHow, 600),
  }));
  const scores = {};
  if (spec.scores) {
    for (const a of AREAS) {
      const s = b.scores?.[a.id] ?? {};
      const num = (v) => { const n = Math.round(Number(v)); return n >= 1 && n <= 10 ? n : null; };
      const shots = {};
      for (const shot of a.shots) {
        const x = s.shots?.[shot.id];
        if (num(x?.score) !== null || x?.note) shots[shot.id] = { score: num(x?.score), note: line(x?.note, 120) };
      }
      const manual = num(s.score);
      // Stored score is final: typed by Navid, else the average of the shots he scored
      scores[a.id] = { score: manual ?? areaScore({ shots }), manual: manual !== null, note: line(s.note, 160), shots };
    }
  }
  const weeks = (Array.isArray(b.weeks) ? b.weeks : []).slice(0, spec.weeks).map((w) => ({ focus: line(w?.focus, 100), plan: str(w?.plan, 800) }));
  const fileId = (v) => (/^[\w-]{10,100}$/.test(String(v ?? '')) ? String(v) : null);
  return {
    ...r, kind, lang: b.lang === 'lt' ? 'lt' : 'en',
    headline: line(b.headline, 140), summary: str(b.summary, 1500), strengths: str(b.strengths, 800), closing: str(b.closing, 800),
    items, scores, weeks, videoFileId: fileId(b.videoFileId), mediaFileId: fileId(b.mediaFileId),
    // one voice-over line per fix (spoken in Navid's Higgsfield voice, then laid on the fix clip)
    voiceLines: (Array.isArray(b.voiceLines) ? b.voiceLines : r.voiceLines ?? []).slice(0, spec.items).map((t) => str(t, 300)),
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
  const { student, folderId, studentNotes, ai, clips, ...rest } = r; // ai notes and raw clips are for Navid only
  const player = await readJSON(playerKey(digits(student.phone)));
  return { ...rest, student: { firstName: student.firstName, lastName: student.lastName }, history, playerToken: player?.token ?? null };
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

  if (pathname.startsWith('/api/player/')) {
    const token = String(context.params.token ?? '');
    const pointer = /^[a-f0-9]{32}$/.test(token) && await readJSON(playerTokenKey(token));
    if (!pointer) return json({ error: 'Player not found.' }, 404);
    const player = await readJSON(playerKey(pointer.phone));
    const reports = await playerReports(pointer.phone);
    return json({
      firstName: player.firstName, lastName: player.lastName,
      reports: reports.map((r) => ({
        token: r.token, ref: r.ref, kind: r.kind, lang: r.lang, headline: r.headline, publishedAt: r.publishedAt,
        scores: r.kind === 'match' ? r.scores : null, average: r.kind === 'match' ? scoreAverage(r.scores) : null,
        fixes: r.items.filter((i) => i.title).map((i) => i.title), pdfFileId: r.pdfFileId ?? null,
      })),
      external: await readJSON(externalKey(pointer.phone), []),
      lessons: (await readJSON(`lessons/${pointer.phone}`, [])).filter((l) => l.status === 'ready')
        .map(({ id, date, lang, summary, pdfFileId }) => ({ id, date, lang, summary, pdfFileId })),
    });
  }

  // ---------- admin ----------
  const denied = await requireAdmin(req);
  if (denied) return denied;

  if (pathname === '/api/admin/players') {
    const index = (await readJSON(INDEX, [])).filter((x) => x.status === 'published');
    const phones = [...new Set([...index.map((x) => x.phone), ...await readJSON('players/all', [])])];
    const players = [];
    for (const phone of phones) {
      const p = await readJSON(playerKey(phone));
      if (!p) continue;
      const reports = await playerReports(phone);
      const avgs = reports.map((r) => (r.kind === 'match' ? scoreAverage(r.scores) : null)).filter((n) => n !== null);
      const external = await readJSON(externalKey(phone), []);
      players.push({
        external: external.length, lastExternal: external.at(-1)?.date ?? null,
        token: p.token, firstName: p.firstName, lastName: p.lastName, phone: `+${phone}`,
        reports: reports.length, lastAt: [reports.at(-1)?.publishedAt, external.at(-1)?.addedAt].filter(Boolean).sort().at(-1) ?? null,
        firstAverage: avgs[0] ?? null, lastAverage: avgs.at(-1) ?? null,
      });
    }
    players.sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
    return json({ players });
  }
  const ref = String(context.params.ref ?? '').toUpperCase();
  const u = await findUpload(ref);
  if (!u) return json({ error: `Upload ${ref} not found.` }, 404);
  let r = await readJSON(reportKey(ref));

  if (req.method === 'GET') {
    if (!r) { r = blankReport(u); await saveReport(r); }
    const files = await listFolder(u.folderId).then((x) => x.files ?? []).catch(() => []);
    const external = (await readJSON(externalKey(digits(u.phone)), [])).slice(-3).reverse();
    return json({ report: r, upload: { ref: u.ref, planName: u.planName, notes: u.notes, phone: u.phone }, files, external, url: reportUrl(r.token), aiAvailable: canAnalyze() });
  }

  if (!r) return json({ error: 'Open the report first.' }, 400);
  let b = {};
  try { b = await req.json(); } catch { /* publish has no body */ }

  if (req.method === 'PUT') {
    r = sanitize(r, b);
    await saveReport(r);
    return json({ ok: true, report: r });
  }

  if (req.method === 'POST' && pathname.endsWith('/voice')) { // voice lines (audio links) onto the fix clip
    const lines = (Array.isArray(b?.lines) ? b.lines : []).filter((u) => /^https:\/\//.test(u)).slice(0, 6);
    if (!lines.length) return json({ error: 'No voice lines given.' }, 400);
    await updateJSON(reportKey(ref), (x) => { x.clips = { ...(x.clips ?? {}), voiceStatus: 'running', voiceError: null }; }, {});
    await fetch(`${new URL(req.url).origin}/api/voice-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() },
      body: JSON.stringify({ ref, lines }),
    });
    return json({ report: await readJSON(reportKey(ref)) });
  }

  if (req.method === 'POST' && pathname.endsWith('/clips')) { // 20 s video of the fixes, for Navid's voice-over
    if (r.clips?.status === 'running' && Date.now() - Date.parse(r.clips.startedAt) < 16 * 60e3) return json({ report: r }); // background runs stop after 15 min
    await updateJSON(reportKey(ref), (x) => { x.clips = { ...(x.clips ?? {}), status: 'running', error: null, startedAt: new Date().toISOString() }; }, {});
    await fetch(`${new URL(req.url).origin}/api/clips-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() },
      body: JSON.stringify({ ref }),
    });
    return json({ report: await readJSON(reportKey(ref)) });
  }

  if (req.method === 'POST' && pathname.endsWith('/check')) { // re-check the fix moments after Navid changed times
    if (!canAnalyze()) return json({ error: 'Needs GEMINI_VIDEO_KEY in Netlify.' }, 503);
    await updateJSON(reportKey(ref), (x) => { x.ai = { ...(x.ai ?? {}), status: 'running', step: 'Double-checking each moment…', startedAt: new Date().toISOString(), error: null }; }, {});
    await fetch(`${new URL(req.url).origin}/api/ai-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() },
      body: JSON.stringify({ ref, checkOnly: true }),
    });
    return json({ report: await readJSON(reportKey(ref)) });
  }

  if (req.method === 'POST' && pathname.endsWith('/ai')) { // AI first draft from the student's video
    if (!canAnalyze()) return json({ error: 'AI video analysis needs GEMINI_VIDEO_KEY in Netlify (see README).', code: 'no-key' }, 503);
    if (r.ai?.status === 'running' && Date.now() - Date.parse(r.ai.startedAt) < 16 * 60e3) return json({ report: r });
    await updateJSON(reportKey(ref), (x) => { x.ai = { status: 'running', step: 'Starting…', progress: 0, startedAt: new Date().toISOString() }; }, {});
    await fetch(`${new URL(req.url).origin}/api/ai-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() },
      body: JSON.stringify({ ref }),
    });
    return json({ report: await readJSON(reportKey(ref)) });
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
    await ensurePlayer(r);
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
    // The PDF is made in the background (headless Chromium takes a few seconds); it appears in admin when ready
    await fetch(`${new URL(req.url).origin}/api/pdf-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() },
      body: JSON.stringify({ ref: r.ref }),
    }).catch((err) => logActivity({ kind: 'failed', text: `Report ${r.ref}: PDF not started — ${err.message}` }));
    const name = r.student.firstName;
    const text = r.lang === 'lt'
      ? `Labas, ${name}! 🎥 Jūsų ${KINDS[r.kind].name} video analizė paruošta:\n${reportUrl(r.token)}\n\nKlausimai? Tiesiog atsakykite čia. Treneris Navid`
      : `Hi ${name}! 🎥 Your ${KINDS[r.kind].name} video analysis is ready:\n${reportUrl(r.token)}\n\nAny questions, just reply here. Coach Navid`;
    return json({ ok: true, report: r, pdfPending: true, url: reportUrl(r.token), whatsapp: `https://wa.me/${digits(r.student.phone)}?text=${encodeURIComponent(text)}` });
  }

  return json({ error: 'Not found' }, 404);
};

export const config = {
  path: ['/api/admin/reports/:ref', '/api/admin/reports/:ref/publish', '/api/admin/reports/:ref/ai', '/api/admin/reports/:ref/check', '/api/admin/reports/:ref/clips', '/api/admin/reports/:ref/voice', '/api/report/:token', '/api/player/:token', '/api/admin/players'],
};
