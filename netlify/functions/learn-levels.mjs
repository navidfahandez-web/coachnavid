// Background: (1) tag every coaching-guide point that has no levels yet with the levels (1-10) it is
// for — a mistake can belong to several levels; (2) then write the goals of each level from those
// points (what a player must master to reach it), as pending goals for Navid to approve.
// Text only (no video), so it is cheap. Started from /api/admin/learn/levels.
import { isAdmin } from '../lib/auth.mjs';
import { readJSON, updateJSON } from '../lib/store.mjs';
import { CANDIDATES, GOALS, NAVID_METHOD, POINTS, SHOT_LEVELS, technique } from '../lib/learn.mjs';
import { ask } from '../lib/video-ai.mjs';
import { AREAS, LEVELS, SHOTS, levelsText } from '../../shared/report.js';

const BATCH = 40;
const MERGE_BATCH = 60;
const S = (description) => ({ type: 'STRING', ...(description ? { description } : {}) });
const FAST = ['gemini-3.8-flash', 'gemini-3.1-pro-preview'];
const STATUS = 'learn/levels-status';

const line = (c) => (c.type === 'fitness'
  ? `[fitness/${c.goal}] ${c.exercise}: ${c.how} — for ${c.padel_link}`
  : `[${c.area}/${c.shot}] ${c.mistake ? `mistake: ${c.mistake} → ` : ''}${c.fix}`);

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { reshot = false, relevel = false, merge = false, transitions = false, time = false, fundamentals = false, retag = [] } = await req.json().catch(() => ({}));
  if (Array.isArray(retag) && retag.length) { // clear these tags first so they are done again with the newest rules
    await updateJSON(CANDIDATES, (list) => { for (const c of list) for (const f of retag) if (['transition', 'time_tag', 'fundamental'].includes(f)) delete c[f]; }, [], 12);
  }
  // Navid's own scale per shot (when it first appears / is mastered) guides every level decision
  const shotLevels = await readJSON(SHOT_LEVELS, {});
  const LV = (n) => `${n} ${LEVELS.find((x) => x.n === n)?.label ?? ''}`;
  const shotRules = Object.entries(shotLevels).map(([id, v]) => `- ${SHOTS.find((x) => x.id === id)?.en ?? id}: first appears at level ${LV(v.from)}, mastered at ${LV(v.mastered)}${v.note ? ` (${v.note})` : ''}`).join('\n');
  if (relevel) { // Navid changed the scale: sort the AI-levelled tips again and rewrite the unreviewed level goals
    await updateJSON(CANDIDATES, (list) => { for (const c of list) if (c.type !== 'fitness' && !c.levelsByNavid && c.status === 'pending') delete c.levels; }, [], 12);
    await updateJSON(GOALS, (list) => { list.splice(0, list.length, ...list.filter((g) => !(g.source === 'derived' && g.status === 'pending'))); }, [], 12);
  }
  const t0 = Date.now();
  const left = () => 13 * 60e3 - (Date.now() - t0);
  const status = (s) => updateJSON(STATUS, (x) => { Object.assign(x, s, { at: new Date().toISOString() }); }, {});
  try {
    // 0) new shots were added to the framework: move tips of related shots to the right one
    if (reshot) {
      const RELATED = new Set(['lob', 'flat_smash', 'fh_volley', 'bh_volley', 'block_volley', 'half_volley', 'low_volley', 'bandeja', 'vibora', 'general', 'fh_after', 'bh_after']);
      let moved = 0;
      for (;;) {
        if (left() < 60e3) { await status({ step: `Re-sorting shots paused (time limit) — run again.` }); return new Response('partial'); }
        const todo = (await readJSON(CANDIDATES, [])).filter((c) => c.type !== 'fitness' && !c.reshot && RELATED.has(c.shot)).slice(0, BATCH);
        if (!todo.length) break;
        await status({ step: `Moving tips to the new shots… ${moved} checked` });
        const { json } = await ask({
          contents: [{ role: 'user', parts: [{ text: `Padel shot list (id: name):
${SHOTS.map((x) => `${x.id}: ${x.en}`).join('\n')}

For each numbered coaching point, give the id of the shot it is really about (keep its current shot if nothing fits better). New, more precise shots: lob_before, lob_after, lob_volley, back_block_volley, approach_volley, rulo, winner_smash.

${todo.map((c, i) => `${i}. (now: ${c.shot}) ${line(c)}`).join('\n')}` }] }],
          generationConfig: {
            responseMimeType: 'application/json', temperature: 0.1,
            responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', required: ['i', 'shot'], properties: { i: { type: 'INTEGER' }, shot: { type: 'STRING', enum: [...SHOTS.map((x) => x.id), 'general'] } } } },
          },
        }, FAST, false, 90000); // a slow reply must not freeze the job
        const to = new Map((json ?? []).filter((r) => todo[r.i]).map((r) => [todo[r.i].id, r.shot]));
        await updateJSON(CANDIDATES, (list) => { for (const c of list) if (todo.some((t) => t.id === c.id)) { if (to.get(c.id) && to.get(c.id) !== c.shot) { c.shotBefore = c.shot; c.shot = to.get(c.id); } c.reshot = true; } }, [], 12);
        moved += todo.length;
      }
    }

    // 0c) merge near-identical tips of the same technique into one point (members keep all sources/times)
    if (merge) {
      let n = 0;
      for (;;) {
        if (left() < 90e3) { await status({ step: `Merging duplicate tips paused after ${n} (time limit) — it carries on by itself.` }); return new Response('partial'); }
        const all = await readJSON(CANDIDATES, []);
        const open = all.filter((c) => !c.point && c.status !== 'rejected');
        if (!open.length) break;
        const t = technique(open[0]); // one technique at a time, the existing points of it as the list to join
        const todo = open.filter((c) => technique(c) === t).slice(0, MERGE_BATCH);
        const points = (await readJSON(POINTS, [])).filter((p) => p.tech === t);
        await status({ step: `Merging duplicate tips… ${n} done, ${open.length} left (now: ${t})` });
        const fit = t.startsWith('fit:');
        const { json } = await ask({
          contents: [{ role: 'user', parts: [{ text: `A padel coach collected ${fit ? 'fitness exercises' : 'coaching tips'} from many videos about one topic: ${t}. Many say the same thing in different words.
Group the NEW items below: each new item either joins an EXISTING point (same ${fit ? 'exercise, or the same exercise with small variations' : 'correction / idea, even if worded differently'}) or starts a NEW point together with the other new items that say the same.
Merge generously — a technique usually ends up with 10-25 points, not one per video — but never put two different corrections in one point.
For each NEW point write: fix = the cue, short and direct (max ~15 words), in simple coaching language; mistake = how the error looks on video (empty if none); why = one short sentence.${fit ? ' For fitness, fix = exercise name: how to do it.' : `
${NAVID_METHOD}`}

EXISTING points:
${points.length ? points.map((p) => `${p.id}: ${p.fix}`).join('\n') : '(none yet)'}

NEW items:
${todo.map((c, i) => `${i}. ${line(c)}`).join('\n')}` }] }],
          generationConfig: {
            responseMimeType: 'application/json', temperature: 0.1,
            responseSchema: { type: 'OBJECT', required: ['join', 'new_points'], properties: {
              join: { type: 'ARRAY', description: 'New items that join an existing point', items: { type: 'OBJECT', required: ['i', 'point'], properties: { i: { type: 'INTEGER' }, point: { type: 'STRING', description: 'id of the existing point' } } } },
              new_points: { type: 'ARRAY', items: { type: 'OBJECT', required: ['members', 'fix', 'mistake', 'why'], properties: { members: { type: 'ARRAY', items: { type: 'INTEGER' } }, fix: S(''), mistake: S(''), why: S('') } } },
            } },
          },
        }, FAST, false, 120000);
        const ids = new Set(points.map((p) => p.id));
        const to = new Map();
        for (const r of json?.join ?? []) if (todo[r.i] && ids.has(r.point)) to.set(todo[r.i].id, r.point);
        const fresh = [];
        const now = Date.now();
        (json?.new_points ?? []).forEach((p, k) => {
          const mem = (p.members ?? []).map((i) => todo[i]).filter((c) => c && !to.has(c.id));
          if (!mem.length || !String(p.fix ?? '').trim()) return;
          const id = `p${now}-${k}`;
          for (const c of mem) to.set(c.id, id);
          fresh.push({ id, tech: t, fix: String(p.fix).trim().slice(0, 300), mistake: String(p.mistake ?? '').slice(0, 300), why: String(p.why ?? '').slice(0, 300), status: 'pending', at: new Date().toISOString() });
        });
        for (const c of todo) if (!to.has(c.id)) { // the AI skipped it: its own point, so nothing loops forever
          const id = `p${now}-x${c.id}`;
          to.set(c.id, id);
          fresh.push({ id, tech: t, fix: c.fix, mistake: c.mistake ?? '', why: c.why ?? '', status: 'pending', at: new Date().toISOString() });
        }
        await updateJSON(POINTS, (list) => { list.push(...fresh); }, [], 12);
        // a tip that joins a point Navid already decided on gets the same decision (and his levels)
        const decided = new Map((await readJSON(POINTS, [])).filter((p) => p.status !== 'pending').map((p) => [p.id, p]));
        await updateJSON(CANDIDATES, (list) => {
          for (const c of list) if (to.has(c.id)) {
            c.point = to.get(c.id);
            const p = decided.get(c.point);
            if (p && c.status === 'pending') { c.status = p.status; if (p.levels) c.levels = p.levels; }
          }
        }, [], 12);
        n += todo.length;
      }
    }

    // 0b) Navid's principles on every technique tip: forced/wanted transition, earn/remove time
    const TAGS = [
      transitions && { field: 'transition', values: ['forced', 'wanted', 'none'], label: 'forced / wanted transitions', rule: `Coach Navid: padel is about transitions between defence (back of the court) and attack (net).
FORCED transition = the opponent makes the player change zone (lobbed at the net → bandeja/víbora to keep the net, or back to play the ball after the glass; pushed back by a hard/deep ball).
WANTED transition = the player chooses to change zone (a lob or a chiquita to take the net, moving in after a weak ball).
Answer forced, wanted or none (not about changing zone).` },
      time && { field: 'time_tag', values: ['earn', 'remove', 'none'], label: 'earning / removing time', rule: `Coach Navid: padel is about time.
EARN time = gain time for yourself or your partner to defend, get in position or reach the net (high lob, slow ball when far from your position, time to cover).
REMOVE time = take time away from the opponent so he is not ready for the next shot (fast lob so he can't prepare the smash or a comfortable bandeja, lob down the line because the distance is shorter, moving in and playing closer / earlier).
Answer earn, remove or none (not about time).` },
      fundamentals && { field: 'fundamental', values: ['timing', 'contact', 'deception', 'none'], label: 'timing / contact point / hiding the shot', rule: `Coach Navid: these fundamentals matter at every level.
TIMING = the right moment: squeezing the fingers slightly at the moment of contact (like a high five that makes a sound), the moment you hit, rhythm with the ball.
CONTACT = the contact point: where the ball meets the racket (sweet spot, in front of the body, height of contact).
DECEPTION = changing the timing of contact to hide the shot and be unexpected (hitting earlier/later, disguise, same preparation for different shots) so the opponent can't time his split step.
Answer timing, contact, deception or none (the point is about something else).` },
    ].filter(Boolean);
    for (const T of TAGS) {
      let n = 0;
      for (;;) {
        if (left() < 60e3) { await status({ step: `Tagging ${T.label} paused (time limit) — run again.` }); return new Response('partial'); }
        const todo = (await readJSON(CANDIDATES, [])).filter((c) => c.type !== 'fitness' && !c[T.field]).slice(0, BATCH);
        if (!todo.length) break;
        await status({ step: `Tagging ${T.label}… ${n} checked` });
        const { json } = await ask({
          contents: [{ role: 'user', parts: [{ text: `${T.rule}
For each numbered coaching point:

${todo.map((c, i) => `${i}. ${line(c)}`).join('\n')}` }] }],
          generationConfig: {
            responseMimeType: 'application/json', temperature: 0.1,
            responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', required: ['i', 't'], properties: { i: { type: 'INTEGER' }, t: { type: 'STRING', enum: T.values } } } },
          },
        }, FAST, false, 90000); // a slow reply must not freeze the job
        const tag = new Map((json ?? []).filter((r) => todo[r.i]).map((r) => [todo[r.i].id, r.t]));
        const ids = new Set(todo.map((t) => t.id));
        await updateJSON(CANDIDATES, (list) => { for (const c of list) if (ids.has(c.id)) c[T.field] = tag.get(c.id) ?? 'none'; }, [], 12);
        n += todo.length;
      }
    }

    // 1) levels for every point
    let tagged = 0;
    for (;;) {
      if (left() < 60e3) { await status({ step: `Paused after ${tagged} points (time limit) — run again to continue.` }); return new Response('partial'); }
      const todo = (await readJSON(CANDIDATES, [])).filter((c) => !Array.isArray(c.levels) || !c.levels.length).slice(0, BATCH);
      if (!todo.length) break;
      await status({ step: `Sorting tips by level… ${tagged} done` });
      const { json } = await ask({
        contents: [{ role: 'user', parts: [{ text: `Coach Navid's padel levels (amateur → high competition):
${levelsText()}

${shotRules ? `Coach Navid's own scale for these shots (follow it: basics of a shot go at its first levels, refinements up to the mastered level, never before it appears):
${shotRules}

` : ''}For each numbered padel coaching point below, give every level of the players it is for — the levels where players typically make that mistake or need that tip/exercise. A point usually fits 2-4 consecutive levels; basics fit low levels, advanced shots (víbora, por 3, gancho) fit higher ones.

${todo.map((c, i) => `${i}. ${line(c)}`).join('\n')}` }] }],
        generationConfig: {
          responseMimeType: 'application/json', temperature: 0.1,
          responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', required: ['i', 'levels'], properties: { i: { type: 'INTEGER' }, levels: { type: 'ARRAY', items: { type: 'INTEGER' } } } } },
        },
      }, FAST, false, 90000); // a slow reply must not freeze the job
      const byId = new Map();
      for (const r of json ?? []) {
        const c = todo[r.i];
        const lv = [...new Set((r.levels ?? []).map(Math.round).filter((n) => n >= 1 && n <= 10))].sort((a, b) => a - b);
        if (c && lv.length) byId.set(c.id, lv);
      }
      for (const c of todo) if (!byId.has(c.id)) byId.set(c.id, [0]); // 0 = couldn't tell; don't loop on it forever
      await updateJSON(CANDIDATES, (list) => { for (const c of list) if (byId.has(c.id)) c.levels = byId.get(c.id); }, [], 12);
      tagged += todo.length;
    }

    // 2) goals per level, from the tips of that level (only if none were derived yet)
    const goals = await readJSON(GOALS, []);
    const all = await readJSON(CANDIDATES, []);
    for (const L of LEVELS) {
      if (goals.some((g) => g.source === 'derived' && g.level === L.n)) continue;
      if (left() < 60e3) { await status({ step: `Goals written up to level ${L.n - 1} — run again to continue.` }); return new Response('partial'); }
      await status({ step: `Writing the goals of level ${L.n} ${L.label}…` });
      const pts = all.filter((c) => c.type !== 'fitness' && c.status !== 'rejected' && (c.levels ?? []).includes(L.n)).slice(0, 250);
      if (!pts.length) continue;
      const { json } = await ask({
        contents: [{ role: 'user', parts: [{ text: `Coach Navid's padel levels:
${levelsText()}

${shotRules ? `Coach Navid's scale per shot:\n${shotRules}\n` : ''}Below are coaching points (from pro coaching videos) for players at level ${L.n} ${L.label}.
Write the GOALS of this level: 8-15 concrete skills a player must master to complete level ${L.n} ${L.label} and move up to the next level — measurable where possible ("keeps 8 out of 10 bandejas deep, away from the net"). Cover technique, positioning, tactics/decisions and the physical side. Short, in Navid's words style: direct, simple.
${NAVID_METHOD}

${pts.map((c) => `- ${line(c)}`).join('\n')}` }] }],
        generationConfig: {
          responseMimeType: 'application/json', temperature: 0.3,
          responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', required: ['area', 'goal'], properties: { area: { type: 'STRING', enum: AREAS.map((a) => a.id) }, goal: { type: 'STRING' } } } },
        },
      });
      const now = Date.now();
      await updateJSON(GOALS, (list) => { (json ?? []).forEach((g, k) => list.push({ id: `L${L.n}-${now}-${k}`, source: 'derived', level: L.n, area: g.area, goal: g.goal, status: 'pending' })); }, [], 12);
    }
    await status({ step: null, done: true, tagged });
  } catch (err) {
    console.error(`learn-levels failed: ${err.message}`);
    await status({ step: null, error: err.message.slice(0, 300) });
  }
  return new Response('done');
};

export const config = { path: '/api/learn-levels', background: true };
