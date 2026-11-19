// Padel fitness program
// Admin (x-admin-key):
//   GET  /api/admin/fitness                    library, plans, student links, job status, raw count
//   POST /api/admin/fitness/merge              merge the coaching guide's exercises into one library (background, ~1 min)
//   POST /api/admin/fitness/plan  { band, note? }  AI draft of a 4-week plan for a level band (background, ~2 min)
//   POST /api/admin/fitness/plan-edit { band, status?, week, day, part, index, remove?|dose?|ex? }  edit / approve a plan
//   POST /api/admin/fitness/review { id, status?, name?, how?, dose?, caution?, levels? }  Navid's decision on an exercise
//   POST /api/admin/fitness/link  { name, band } | { token, remove: true }  private student link
// Student (public, private link):
//   GET  /api/fitness/:token                   the approved plan, approved exercises only
import { json, requireAdmin } from '../lib/auth.mjs';
import { LIBRARY, LINKS, PLANS, STATUS, newToken, setStatus, studentPlan, syncMembers } from '../lib/fitness.mjs';
import { CANDIDATES } from '../lib/learn.mjs';
import { readJSON, updateJSON } from '../lib/store.mjs';
import { canAnalyze } from '../lib/video-ai.mjs';
import { BANDS, SAFETY_NOTE } from '../../shared/fitness.js';

const startJob = (req, body) => fetch(`${new URL(req.url).origin}/api/fitness-run`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': (process.env.ADMIN_PASSWORD ?? '').trim() }, body: JSON.stringify(body),
});
const STALE = 15 * 60 * 1000; // a background job can't run longer than this

export default async (req) => {
  const { pathname } = new URL(req.url);

  if (pathname.startsWith('/api/fitness/')) { // student page
    const token = pathname.split('/').pop();
    if (!/^[a-f0-9]{24}$/.test(token)) return json({ error: 'Not found' }, 404);
    const link = (await readJSON(LINKS, {}))[token];
    if (!link) return json({ error: 'Not found' }, 404);
    const plan = (await readJSON(PLANS, {}))[link.band];
    if (!plan || plan.status !== 'approved') return json({ name: link.name, ready: false, safety: SAFETY_NOTE });
    return json({ name: link.name, ready: true, safety: SAFETY_NOTE, ...studentPlan(plan, await readJSON(LIBRARY, [])) });
  }

  const denied = await requireAdmin(req);
  if (denied) return denied;

  if (req.method === 'GET') {
    const [library, plans, links, status, candidates] = await Promise.all([readJSON(LIBRARY, []), readJSON(PLANS, {}), readJSON(LINKS, {}), readJSON(STATUS, { plans: {} }), readJSON(CANDIDATES, [])]);
    const fit = candidates.filter((c) => c.type === 'fitness');
    return json({ library, plans, links, status, raw: { total: fit.length, approved: fit.filter((c) => c.status === 'approved').length, rejected: fit.filter((c) => c.status === 'rejected').length }, canAI: canAnalyze() });
  }
  const b = await req.json().catch(() => ({}));
  const busy = (s) => s?.state === 'running' && Date.now() - Date.parse(s.at) < STALE;

  if (pathname.endsWith('/merge')) {
    if (!canAnalyze()) return json({ error: 'Needs GEMINI_VIDEO_KEY in Netlify.' }, 503);
    const st = await readJSON(STATUS, { plans: {} });
    if (busy(st.merge)) return json({ ok: true, note: 'Already running.' });
    await setStatus((s) => { s.merge = { state: 'running', at: new Date().toISOString() }; });
    await startJob(req, { job: 'merge' });
    return json({ ok: true });
  }

  if (pathname.endsWith('/plan')) {
    if (!canAnalyze()) return json({ error: 'Needs GEMINI_VIDEO_KEY in Netlify.' }, 503);
    if (!BANDS.some((x) => x.id === b.band)) return json({ error: 'band?' }, 400);
    const st = await readJSON(STATUS, { plans: {} });
    if (busy(st.plans?.[b.band])) return json({ ok: true, note: 'Already running.' });
    await setStatus((s) => { s.plans[b.band] = { state: 'running', at: new Date().toISOString() }; });
    await startJob(req, { job: 'plan', band: b.band, note: String(b.note ?? '').slice(0, 500) });
    return json({ ok: true });
  }

  if (pathname.endsWith('/plan-edit')) {
    let plan = null; let err = null;
    await updateJSON(PLANS, (all) => {
      const p = all[b.band];
      if (!p) { err = 'No plan for this band yet.'; return; }
      if (['draft', 'approved'].includes(b.status)) { p.status = b.status; p.approvedAt = b.status === 'approved' ? new Date().toISOString() : null; }
      if (b.week) {
        const part = p.weeks.find((w) => w.week === Number(b.week))?.sessions.find((s) => s.day === b.day)?.parts.find((x) => x.part === b.part);
        if (!part) { err = 'Not found'; return; }
        const i = Number(b.index);
        if (b.add) part.items.push({ ex: String(b.ex), dose: String(b.dose ?? '').slice(0, 80) });
        else if (!part.items[i]) { err = 'Not found'; return; } else if (b.remove) part.items.splice(i, 1);
        else {
          if (typeof b.dose === 'string') part.items[i].dose = b.dose.trim().slice(0, 80);
          if (typeof b.ex === 'string' && b.ex) part.items[i].ex = b.ex;
        }
        p.editedAt = new Date().toISOString();
      }
      plan = p;
    }, {});
    return err ? json({ error: err }, 400) : json({ ok: true, plan });
  }

  if (pathname.endsWith('/review')) {
    let found = null;
    await updateJSON(LIBRARY, (list) => {
      const e = list.find((x) => x.id === b.id);
      if (!e) return;
      if (['approved', 'rejected', 'pending'].includes(b.status)) e.status = b.status;
      const edited = new Set(e.edited ?? []);
      for (const f of ['name', 'how', 'dose', 'caution']) {
        if (typeof b[f] === 'string' && b[f].trim() && b[f].trim() !== e[f]) { e[f] = b[f].trim().slice(0, 300); edited.add(f); }
      }
      if (Array.isArray(b.levels)) { e.levels = [...new Set(b.levels.map(Number).filter((n) => n >= 1 && n <= 10))].sort((x, y) => x - y); edited.add('levels'); }
      if (edited.size) e.edited = [...edited];
      e.reviewedAt = new Date().toISOString();
      found = e;
    }, []);
    if (!found) return json({ error: 'Not found' }, 404);
    if (b.status || Array.isArray(b.levels)) await syncMembers(found).catch((err) => console.error(`sync to coaching guide: ${err.message}`));
    return json({ ok: true, exercise: found });
  }

  if (pathname.endsWith('/link')) {
    if (b.remove) {
      await updateJSON(LINKS, (m) => { delete m[b.token]; }, {});
      return json({ ok: true });
    }
    const name = String(b.name ?? '').trim().slice(0, 60);
    if (!name || !BANDS.some((x) => x.id === b.band)) return json({ error: 'Name and level band, please.' }, 400);
    const token = newToken();
    await updateJSON(LINKS, (m) => { m[token] = { name, band: b.band, at: new Date().toISOString() }; }, {});
    return json({ ok: true, token, url: `${new URL(req.url).origin}/fitness/${token}` });
  }

  return json({ error: 'Not found' }, 404);
};

export const config = { path: ['/api/admin/fitness', '/api/admin/fitness/merge', '/api/admin/fitness/plan', '/api/admin/fitness/plan-edit', '/api/admin/fitness/review', '/api/admin/fitness/link', '/api/fitness/:token'] };
