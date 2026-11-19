// Background: check pro reference shots one by one. For each shot of a player (not yet checked), the
// AI watches only the 3 seconds around contact (YouTube clip, 10 frames/s), confirms it is really that
// player hitting that shot, and describes THIS swing in detail. Fake / pattern-filled entries are
// marked verified:false. POST /api/pro-verify { player } (admin key). Status in blob pros/verify-status.
import { isAdmin } from '../lib/auth.mjs';
import { readJSON, updateJSON } from '../lib/store.mjs';
import { ask } from '../lib/video-ai.mjs';
import { SHOTS } from '../../shared/report.js';

const PROS = 'pros/clips';
const STATUS = 'pros/verify-status';
const sec = (t) => String(t ?? '').split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
const S = (d) => ({ type: 'STRING', description: d });

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { player = 'Galán' } = await req.json().catch(() => ({}));
  const t0 = Date.now();
  const status = (s) => updateJSON(STATUS, (x) => { Object.assign(x, s, { player, at: new Date().toISOString() }); }, {});
  let n = 0;
  try {
    for (;;) {
      if (Date.now() - t0 > 12 * 60e3) { await status({ step: `Paused after ${n} shots (time limit) — run again.` }); return new Response('partial'); }
      const todo = (await readJSON(PROS, [])).filter((c) => c.player === player && c.verified === undefined).slice(0, 6);
      if (!todo.length) break;
      await status({ step: `Checking ${player}'s shots one by one… ${n} done` });
      const results = await Promise.all(todo.map(async (c) => {
        const t = sec(c.time);
        try {
          const { json } = await ask({
            contents: [{ role: 'user', parts: [
              { fileData: { fileUri: `https://www.youtube.com/watch?v=${c.source}` }, videoMetadata: { startOffset: `${Math.max(0, t - 1.5).toFixed(1)}s`, endOffset: `${(t + 1.5).toFixed(1)}s`, fps: 10 } },
              { text: `This 3-second clip should show ${player} (professional padel player) hitting a ${SHOTS.find((s) => s.id === c.shot)?.en ?? c.shot} at about 1.5 s.
First answer honestly: is that player clearly visible hitting a shot in this clip, and which shot is it really? Then describe THIS swing in the 5 phases — what you actually see in these frames (body, feet, racket, non-hitting arm, contact height and position), not a textbook description. Add 1-3 details that are special about how this player does it.` },
            ] }],
            generationConfig: {
              responseMimeType: 'application/json', temperature: 0.1,
              responseSchema: { type: 'OBJECT', required: ['visible', 'is_player', 'shot', 'phases', 'details'], properties: {
                visible: { type: 'BOOLEAN', description: 'a player clearly hits the ball in this clip' },
                is_player: { type: 'BOOLEAN', description: `it is ${player} who hits it (as far as you can tell)` },
                shot: { type: 'STRING', enum: [...SHOTS.map((s) => s.id), 'none'] },
                phases: { type: 'OBJECT', required: ['preparation', 'load', 'drop', 'contact', 'finish'], properties: { preparation: S('what you see'), load: S('what you see'), drop: S('what you see'), contact: S('what you see'), finish: S('what you see') } },
                details: { type: 'ARRAY', items: { type: 'STRING' }, description: '1-3 signature details of this swing' },
              } },
            },
          }, ['gemini-3.8-flash', 'gemini-3.1-pro-preview'], false, 90000);
          const ok = Boolean(json.visible && json.is_player && json.shot !== 'none');
          return { id: c.id, ok, shot: json.shot, phases: json.phases, details: json.details ?? [] };
        } catch (err) { return { id: c.id, ok: null, error: err.message.slice(0, 120) }; }
      }));
      await updateJSON(PROS, (list) => {
        for (const r of results) {
          const c = list.find((x) => x.id === r.id);
          if (!c) continue;
          if (r.ok === null) { c.verified = false; c.verifyError = r.error; continue; }
          c.verified = r.ok;
          if (r.ok) { c.shotListed = c.shot; c.shot = r.shot; c.phasesListed = c.phases; c.phases = r.phases; c.details = r.details; }
        }
      }, [], 12);
      n += todo.length;
    }
    const list = (await readJSON(PROS, [])).filter((c) => c.player === player);
    await status({ step: null, done: true, checked: n, real: list.filter((c) => c.verified).length, dropped: list.filter((c) => c.verified === false).length });
  } catch (err) {
    console.error(`pro-verify ${player}: ${err.message}`);
    await status({ step: null, error: err.message.slice(0, 300) });
  }
  return new Response('done');
};

export const config = { path: '/api/pro-verify', background: true };
