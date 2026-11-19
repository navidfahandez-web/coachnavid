// Background: (1) tag every coaching-guide point that has no levels yet with the levels (1-10) it is
// for — a mistake can belong to several levels; (2) then write the goals of each level from those
// points (what a player must master to reach it), as pending goals for Navid to approve.
// Text only (no video), so it is cheap. Started from /api/admin/learn/levels.
import { isAdmin } from '../lib/auth.mjs';
import { readJSON, updateJSON } from '../lib/store.mjs';
import { CANDIDATES, GOALS } from '../lib/learn.mjs';
import { ask } from '../lib/video-ai.mjs';
import { AREAS, LEVELS, levelsText } from '../../shared/report.js';

const BATCH = 80;
const FAST = ['gemini-3.8-flash', 'gemini-3.1-pro-preview'];
const STATUS = 'learn/levels-status';

const line = (c) => (c.type === 'fitness'
  ? `[fitness/${c.goal}] ${c.exercise}: ${c.how} — for ${c.padel_link}`
  : `[${c.area}/${c.shot}] ${c.mistake ? `mistake: ${c.mistake} → ` : ''}${c.fix}`);

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const t0 = Date.now();
  const left = () => 13 * 60e3 - (Date.now() - t0);
  const status = (s) => updateJSON(STATUS, (x) => { Object.assign(x, s, { at: new Date().toISOString() }); }, {});
  try {
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

For each numbered padel coaching point below, give every level of the players it is for — the levels where players typically make that mistake or need that tip/exercise. A point usually fits 2-4 consecutive levels; basics fit low levels, advanced shots (víbora, por 3, gancho) fit higher ones.

${todo.map((c, i) => `${i}. ${line(c)}`).join('\n')}` }] }],
        generationConfig: {
          responseMimeType: 'application/json', temperature: 0.1,
          responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', required: ['i', 'levels'], properties: { i: { type: 'INTEGER' }, levels: { type: 'ARRAY', items: { type: 'INTEGER' } } } } },
        },
      }, FAST);
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

Below are coaching points (from pro coaching videos) for players at level ${L.n} ${L.label}.
Write the GOALS of this level: 8-15 concrete skills a player must master to complete level ${L.n} ${L.label} and move up to the next level — measurable where possible ("keeps 8 out of 10 bandejas deep, away from the net"). Cover technique, positioning, tactics/decisions and the physical side. Short, in Navid's words style: direct, simple.

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
