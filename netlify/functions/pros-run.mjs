// Background runner for the pro library jobs (pros/jobs): index a video for a player, verify his
// shots one by one, write his technique profile. One runner at a time; after ~12 minutes it starts
// a fresh copy of itself and stops, so long job lists keep going on their own.
import { isAdmin } from '../lib/auth.mjs';
import { readJSON, updateJSON } from '../lib/store.mjs';
import {
  JOBS, PROS, STATUS, VIDEOS, profileKey, playerByName, embedInfo, videoSeconds, findShots,
  verifyShot, applyVerify, buildProfile, setStatus, kick, fmt, sec, addJobs,
} from '../lib/pros.mjs';

const BUDGET = 12 * 60e3;
const WINDOW = 120; // seconds of video per indexing call
const MAX_VIDEO = 40 * 60; // only the first 40 minutes of very long videos
const sameJob = (a, b) => a.type === b.type && a.player === b.player && (a.source ?? null) === (b.source ?? null);
const saveJob = (job) => updateJSON(JOBS, (q) => { const x = q.find((y) => sameJob(y, job)); if (x) Object.assign(x, job); }, []);
const dropJob = (job) => updateJSON(JOBS, (q) => { const i = q.findIndex((y) => sameJob(y, job)); if (i >= 0) q.splice(i, 1); }, []);

async function indexJob(job, left) {
  const v = (await readJSON(VIDEOS, {}))[job.source] ?? {};
  if (v.embeddable === undefined || !v.title) Object.assign(v, await embedInfo(job.source));
  if (v.blocked) return true;
  if (v.embeddable === false) {
    await updateJSON(VIDEOS, (all) => { all[job.source] = { ...all[job.source], ...v }; }, {});
    await setStatus({ log: `${job.source}: YouTube doesn't allow embedding — skipped` });
    return true;
  }
  v.duration ??= await videoSeconds(job.source);
  const dur = Math.min(v.duration ?? MAX_VIDEO, MAX_VIDEO);
  await updateJSON(VIDEOS, (all) => { all[job.source] = { ...all[job.source], ...v }; }, {});
  let from = job.next ?? 0;
  let found = job.found ?? 0;
  while (from < dur && left() > 4 * 60e3) {
    await setStatus({ step: `${job.player}: watching “${v.title || job.source}” ${fmt(from)} of ${fmt(dur)}…` });
    const starts = [0, 1, 2].map((k) => from + k * WINDOW).filter((s) => s < dur);
    const parts = await Promise.all(starts.map((s) => findShots(job.source, job.player, s, Math.min(s + WINDOW, dur), v.title)
      .catch((err) => (err.status === 400 ? Object.assign([], { ended: true }) : Promise.reject(err)))));
    if (!(await readJSON(JOBS, [])).some((x) => sameJob(x, job))) return true; // removed from the list meanwhile: stop
    const ended = parts.findIndex((x) => x.ended);
    const shots = (ended >= 0 ? parts.slice(0, ended + 1) : parts).flat(); // nothing after the video's end
    await updateJSON(PROS, (list) => {
      for (const s of shots) {
        if (list.some((c) => c.source === job.source && c.player === job.player && Math.abs(sec(c.time) - s.t) < 1.2)) continue;
        list.push({ id: `${job.source}-${Math.round(s.t * 10)}`, source: job.source, sourceTitle: v.title ?? '', player: job.player, shot: s.shot, time: fmt(s.t), end: fmt(s.t + 1.2), view: s.view, quality: Math.max(1, Math.min(5, s.quality ?? 3)), phases: {}, indexedBy: 'pros' });
        found += 1;
      }
    }, [], 12);
    from = ended >= 0 ? dur : starts.at(-1) + WINDOW; // the video ended inside this batch
    Object.assign(job, { next: from, found });
    await saveJob(job);
  }
  if (from < dur) return false;
  await updateJSON(VIDEOS, (all) => { const x = (all[job.source] ??= {}); x.players = [...new Set([...(x.players ?? []), job.player])]; x.indexed = new Date().toISOString(); }, {});
  await setStatus({ log: `${job.player}: “${v.title || job.source}” → ${found} moments found` });
  await addJobs([{ type: 'verify', player: job.player }, { type: 'profile', player: job.player }]); // check them next
  return true;
}

async function verifyJob(job, left) {
  let n = 0, real = 0;
  for (;;) {
    if (left() < 2 * 60e3) return false;
    const todo = (await readJSON(PROS, [])).filter((c) => c.player === job.player && (c.verifyTries ?? 0) < 2
      && (c.verified === undefined || (job.refine && c.verified === true && !c.blind && c.navid !== 'ok'))).slice(0, 6);
    if (!todo.length) break;
    await setStatus({ step: `${job.player}: checking shots one by one… ${n} done, ${real} real` });
    const results = await Promise.all(todo.map((c) => verifyShot(c).then((r) => ({ id: c.id, ...r }), (err) => ({ id: c.id, error: err.message.slice(0, 120) }))));
    await updateJSON(PROS, (list) => {
      for (const r of results) {
        const c = list.find((x) => x.id === r.id);
        if (!c) continue;
        if (r.error) c.verifyTries = (c.verifyTries ?? 0) + 1;
        if (job.refine && c.verified === true && !r.error && !r.ok) { c.blind = true; c.recheck = 'unsure'; continue; } // 2nd look disagreed: keep it, ranked lower
        applyVerify(c, r);
      }
    }, [], 12);
    n += todo.length; real += results.filter((r) => r.ok).length;
  }
  await setStatus({ log: `${job.player}: ${n} shots checked, ${real} real` });
  return true;
}

async function profileJob(job) {
  const p = playerByName(job.player) ?? { name: job.player, full: job.player, id: job.player.toLowerCase() };
  await setStatus({ step: `${p.full}: writing the technique profile…` });
  const prof = await buildProfile(p);
  if (!prof) { await setStatus({ log: `${p.full}: no checked clips yet — no profile` }); return true; }
  await updateJSON(profileKey(p.id), (x) => { for (const k of Object.keys(x)) delete x[k]; Object.assign(x, prof); }, {});
  await setStatus({ log: `${p.full}: technique profile written (${prof.shots.length} shots, ${prof.clips} clips)` });
  return true;
}

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const t0 = Date.now();
  const left = () => BUDGET - (Date.now() - t0);
  const me = `${t0}-${Math.random().toString(36).slice(2, 6)}`;
  const got = await updateJSON(STATUS, (x) => {
    if (x.runner && x.runner !== me && Date.now() - Date.parse(x.beat ?? 0) < 3 * 60e3) return false;
    Object.assign(x, { runner: me, beat: new Date().toISOString(), error: null });
    return true;
  }, {});
  if (!got) return new Response('already running');
  const beat = setInterval(() => updateJSON(STATUS, (x) => { if (x.runner === me) x.beat = new Date().toISOString(); }, {}).catch(() => {}), 60e3);
  let more = false;
  try {
    for (;;) {
      const job = (await readJSON(JOBS, []))[0];
      if (!job) break;
      if (left() < 2 * 60e3) { more = true; break; }
      let done;
      try {
        done = job.type === 'index' ? await indexJob(job, left) : job.type === 'verify' ? await verifyJob(job, left) : job.type === 'profile' ? await profileJob(job) : true;
      } catch (err) {
        console.error(`pros-run ${job.type} ${job.player}: ${err.message}`);
        job.tries = (job.tries ?? 0) + 1;
        await setStatus({ log: `${job.player} ${job.type} failed: ${err.message.slice(0, 160)}${job.tries >= 2 ? ' — skipped' : ' — will retry'}` });
        if (/credit|quota|billing|exhausted|429/i.test(err.message)) { await setStatus({ error: `Gemini says: ${err.message.slice(0, 200)} — top up AI Studio credits, then press Run.` }); await saveJob(job); break; }
        if (job.tries >= 2) await dropJob(job); else await saveJob(job);
        continue;
      }
      if (done) await dropJob(job); else { more = true; break; }
    }
  } finally {
    clearInterval(beat);
    await updateJSON(STATUS, (x) => { if (x.runner === me) { x.runner = null; x.step = more ? 'Continuing in a new run…' : null; } }, {});
  }
  if (more) await kick(new URL(req.url).origin);
  return new Response('ok');
};

export const config = { path: '/api/pros-run', background: true };
