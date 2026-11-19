// Pro library API (admin). GET → players, clips, technique profiles, videos, jobs, status.
// POST { action } →
//   add-video { url, player }   check it can be embedded, then index + verify + profile it
//   verify { player, refine? }  check unchecked shots (refine: also re-time already-checked ones)
//   profile { player }          (re)write the technique profile
//   mark { id, ok }             Navid's own yes/no on a clip (no = hidden everywhere)
//   run                         restart the job runner
import { requireAdmin, json } from '../lib/auth.mjs';
import { readJSON, updateJSON } from '../lib/store.mjs';
import { PROS, JOBS, STATUS, VIDEOS, PLAYERS, profileKey, playerByName, youtubeId, embedInfo, addJobs, kick } from '../lib/pros.mjs';

export default async (req) => {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const origin = new URL(req.url).origin;

  if (req.method === 'GET') {
    const [clips, jobs, status, videos, ...profiles] = await Promise.all([
      readJSON(PROS, []), readJSON(JOBS, []), readJSON(STATUS, {}), readJSON(VIDEOS, {}),
      ...PLAYERS.map((p) => readJSON(profileKey(p.id), null)),
    ]);
    return json({ players: PLAYERS, clips, jobs, status, videos, profiles: Object.fromEntries(PLAYERS.map((p, i) => [p.id, profiles[i]])) });
  }

  const body = await req.json().catch(() => ({}));
  const player = playerByName(body.player)?.name ?? (typeof body.player === 'string' ? body.player.trim().slice(0, 40) : '');

  if (body.action === 'add-video') {
    const source = youtubeId(body.url);
    if (!source) return json({ error: 'That doesn’t look like a YouTube link.' }, 400);
    if (!player) return json({ error: 'Pick the player first.' }, 400);
    const info = await embedInfo(source);
    await updateJSON(VIDEOS, (all) => { all[source] = { ...all[source], ...info }; }, {});
    if (info.embeddable === false) return json({ error: info.missing ? 'YouTube can’t find that video.' : 'The owner of this video doesn’t allow it to be played on other sites, so it can’t go in the library. Try another video.' }, 400);
    await addJobs([{ type: 'index', player, source }, { type: 'verify', player }, { type: 'profile', player }]);
    await kick(origin);
    return json({ ok: true, title: info.title });
  }
  if (body.action === 'verify' && player) { await addJobs([{ type: 'verify', player, refine: Boolean(body.refine) }, { type: 'profile', player }]); await kick(origin); return json({ ok: true }); }
  if (body.action === 'profile' && player) { await addJobs([{ type: 'profile', player }]); await kick(origin); return json({ ok: true }); }
  if (body.action === 'run') { await kick(origin); return json({ ok: true }); }
  if (body.action === 'clear-jobs') { await updateJSON(JOBS, (q) => { q.length = 0; }, []); await updateJSON(STATUS, (x) => { x.runner = null; x.step = null; x.error = null; }, {}); return json({ ok: true }); }
  if (body.action === 'mark' && body.id) {
    const ok = Boolean(body.ok);
    const found = await updateJSON(PROS, (list) => {
      const c = list.find((x) => x.id === body.id);
      if (!c) return false;
      c.navid = ok ? 'ok' : 'wrong';
      c.verified = ok;
      return true;
    }, []);
    return found ? json({ ok: true }) : json({ error: 'Clip not found.' }, 404);
  }
  return json({ error: 'Unknown action.' }, 400);
};

export const config = { path: '/api/admin/pros' };
