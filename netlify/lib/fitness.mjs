// Padel fitness program: merge the exercises the coaching guide collected (learn/candidates,
// type 'fitness') into one library, and let the AI propose 4-week plans per level band.
// Navid approves every exercise and every plan; students only ever see approved ones.
import { randomBytes } from 'node:crypto';
import { DAYS, INJURY_AREAS, PADEL_MOVES, PARTS, bandOf } from '../../shared/fitness.js';
import { LEVELS } from '../../shared/report.js';
import { CANDIDATES } from './learn.mjs'; // read the coaching guide's exercises (session 2 owns that file)
import { readJSON, updateJSON } from './store.mjs';
import { ask } from './video-ai.mjs';

export const LIBRARY = 'fitness/library'; // [{ id, name, goal, where[], equipment, how, dose, caution, body_part, padel_links[], levels[], members[], moments[], status, edited }]
export const PLANS = 'fitness/plans'; // { [bandId]: { band, status, overview, weeks:[{ week, focus, sessions:[{ day, focus, parts:[{ part, minutes, items:[{ ex, dose, cue }] }] }] }], at, model, note } }
export const LINKS = 'fitness/links'; // { [token]: { name, band, at } } private student links
export const STATUS = 'fitness/status'; // { merge: { state, at, error, stats }, plans: { [bandId]: { state, at, error } } }

const FAST = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview'];
const BEST = ['gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-3.5-flash'];
const S = (description) => ({ type: 'STRING', description });

export const setStatus = (mutate) => updateJSON(STATUS, (s) => { s.plans ??= {}; mutate(s); }, { plans: {} });
export const newToken = () => randomBytes(12).toString('hex');

const norm = (s) => String(s ?? '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ')
  .split(' ').filter(Boolean).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).join(' ').trim();
const mode = (arr) => { const m = new Map(); for (const v of arr) if (v) m.set(v, (m.get(v) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([v]) => v); };

// ---------- 1. Merge duplicates (one cheap text-only AI call) ----------
const MERGE_SCHEMA = {
  type: 'OBJECT', required: ['groups'],
  properties: {
    groups: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT', required: ['name', 'ids'],
        properties: {
          name: S('Clear, common English name for this exercise (e.g. "Pogo jumps", "Band external rotation")'),
          ids: { type: 'ARRAY', items: { type: 'INTEGER' }, description: 'Numbers of the names that are this same exercise' },
        },
      },
    },
  },
};

export async function mergeLibrary() {
  const all = await readJSON(CANDIDATES, []);
  const fit = all.filter((c) => c.type === 'fitness' && c.status !== 'rejected');
  const byName = new Map(); // normalised name → candidates
  for (const c of fit) { const k = norm(c.exercise) || norm(c.fix).slice(0, 40); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(c); }
  const names = [...byName.keys()];
  const lines = names.map((k, i) => { const cs = byName.get(k); return `${i}. ${cs[0].exercise} [${mode(cs.map((c) => c.goal))[0]}, ${mode(cs.map((c) => c.equipment))[0] ?? ''}]`; });
  const { json, model } = await ask({
    contents: [{ role: 'user', parts: [{ text: `These are exercise names collected from padel/tennis fitness videos, with [goal, equipment]. Many are the SAME exercise written differently (plural, word order, "med ball" vs "medicine ball", small cue differences). Group them: one group per distinct exercise. Keep exercises apart when the movement or the main equipment is really different (e.g. bodyweight squat vs barbell back squat, band row vs dumbbell row, lateral bound vs lateral shuffle). Every number must appear in exactly one group; an exercise with no duplicate is a group of one.\n\n${lines.join('\n')}` }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: MERGE_SCHEMA, temperature: 0.1, maxOutputTokens: 60000 },
  }, FAST);

  const used = new Set();
  const groups = [];
  for (const g of json.groups ?? []) {
    const ids = [...new Set((g.ids ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < names.length && !used.has(i)))];
    if (!ids.length) continue;
    ids.forEach((i) => used.add(i));
    groups.push({ name: String(g.name ?? '').trim(), keys: ids.map((i) => names[i]) });
  }
  names.forEach((k, i) => { if (!used.has(i)) groups.push({ name: byName.get(k)[0].exercise, keys: [k] }); });

  const old = await readJSON(LIBRARY, []);
  const oldByMember = new Map();
  for (const e of old) for (const m of e.members ?? []) oldByMember.set(m, e);
  const library = groups.map((g) => {
    const cs = g.keys.flatMap((k) => byName.get(k));
    const n = new Map();
    for (const c of cs) for (const l of c.levels ?? []) if (l >= 1 && l <= 10) n.set(l, (n.get(l) ?? 0) + 1);
    let levels = [...n].filter(([, k]) => k >= cs.length / 3).map(([l]) => l).sort((a, b) => a - b);
    if (!levels.length) levels = [...n.keys()].sort((a, b) => a - b);
    const longest = (f) => cs.map((c) => String(c[f] ?? '').trim()).filter((s) => s && s.length <= 260).sort((a, b) => b.length - a.length)[0] ?? '';
    const seen = new Set();
    const moments = cs.filter((c) => c.source && !seen.has(c.source) && seen.add(c.source)).slice(0, 6).map((c) => ({ source: c.source, time: c.time, title: c.sourceTitle ?? '' }));
    const entry = {
      id: `fx-${norm(g.name).replace(/ /g, '-').slice(0, 40)}-${cs.length}`,
      name: g.name || cs[0].exercise,
      goal: mode(cs.map((c) => c.goal))[0] ?? 'strength',
      where: mode(cs.map((c) => c.where)),
      equipment: mode(cs.map((c) => String(c.equipment ?? '').toLowerCase().trim()))[0] ?? '',
      how: longest('how') || longest('fix'),
      dose: mode(cs.map((c) => String(c.dose ?? '').trim()))[0] ?? '',
      caution: longest('caution'),
      body_part: mode(cs.map((c) => String(c.body_part ?? '').toLowerCase().trim()))[0] ?? '',
      padel_links: mode(cs.map((c) => String(c.padel_link ?? '').trim())).slice(0, 4),
      levels, members: cs.map((c) => c.id), moments, videos: seen.size,
      status: cs.every((c) => c.status === 'approved') ? 'approved' : 'pending',
    };
    // keep Navid's earlier decision / edits: the old entry that shares the most members
    const votes = new Map();
    for (const m of entry.members) { const o = oldByMember.get(m); if (o) votes.set(o, (votes.get(o) ?? 0) + 1); }
    const prev = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (prev) {
      entry.id = prev.id;
      if (prev.status !== 'pending') entry.status = prev.status;
      if (prev.edited) for (const f of ['name', 'how', 'dose', 'levels', 'caution']) if (prev.edited.includes(f)) entry[f] = prev[f];
      if (prev.edited) entry.edited = prev.edited;
    }
    return entry;
  });
  // ids must be unique
  const ids = new Set();
  for (const e of library) { let id = e.id; let i = 2; while (ids.has(id)) id = `${e.id}-${i++}`; e.id = id; ids.add(id); }
  library.sort((a, b) => b.members.length - a.members.length);
  await updateJSON(LIBRARY, (l) => { l.splice(0, l.length, ...library); }, []);
  return { exercises: fit.length, merged: library.length, model };
}

// ---------- 2. A 4-week plan for one level band ----------
const PLAN_SCHEMA = {
  type: 'OBJECT', required: ['overview', 'weeks'],
  properties: {
    overview: S('3-4 short sentences for the player: what this block builds, how the 4 weeks progress, and which padel movements it helps'),
    weeks: {
      type: 'ARRAY', description: 'Exactly 4 weeks',
      items: {
        type: 'OBJECT', required: ['week', 'focus', 'sessions'],
        properties: {
          week: { type: 'INTEGER' },
          focus: S('One short line: the focus / progression of this week'),
          sessions: {
            type: 'ARRAY', description: 'Exactly 3 sessions: gym, home, court',
            items: {
              type: 'OBJECT', required: ['day', 'focus', 'parts'],
              properties: {
                day: { type: 'STRING', enum: DAYS.map((d) => d.id) },
                focus: S('Short focus of the session, e.g. "Legs & first step"'),
                parts: {
                  type: 'ARRAY', description: 'warmup (10 min), main (30 min), finisher (5 min) in this order',
                  items: {
                    type: 'OBJECT', required: ['part', 'items'],
                    properties: {
                      part: { type: 'STRING', enum: PARTS.map((p) => p.id) },
                      items: {
                        type: 'ARRAY',
                        items: {
                          type: 'OBJECT', required: ['ex', 'dose'],
                          properties: {
                            ex: S('The exercise id from the list (exactly as written)'),
                            dose: S('Sets × reps or time, and rest, right for this level and week (e.g. "3 × 10, rest 60 s")'),
                            cue: S('Optional: one short cue for this week'),
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export async function makePlan(bandId, note = '') {
  const band = bandOf(bandId);
  if (!band) throw new Error('Unknown band');
  const lib = (await readJSON(LIBRARY, [])).filter((e) => e.status !== 'rejected');
  if (!lib.length) throw new Error('Merge the exercises first.');
  const lo = band.levels[0]; const hi = band.levels.at(-1);
  const fits = (e) => !e.levels?.length || e.levels.some((l) => l >= lo - 1 && l <= hi + 1);
  const pool = lib.filter(fits).sort((a, b) => (b.status === 'approved') - (a.status === 'approved') || b.members.length - a.members.length).slice(0, 320);
  const lines = pool.map((e) => `${e.id} | ${e.name} | ${e.goal} | ${e.where.join('/')} | ${e.equipment || 'none'} | ${e.dose || '-'} | helps: ${e.padel_links.join('; ')}${e.status === 'approved' ? ' | ✓ coach-approved' : ''}${e.videos > 1 ? ` | in ${e.videos} videos` : ''}`);
  const levelText = LEVELS.filter((l) => band.levels.includes(l.n)).map((l) => `${l.label}: ${l.desc}`).join(' ');
  const old = (await readJSON(PLANS, {}))[bandId];
  const prompt = `You are Coach Navid's strength & conditioning assistant. Build a 4-week padel fitness block for amateur players of level ${band.label} (${band.name}). ${levelText}

Every week has exactly 3 sessions of 45 minutes:
${DAYS.map((d) => `- ${d.id}: ${d.label}, equipment: ${d.equipment}`).join('\n')}
Each session: ${PARTS.map((p) => `${p.id} = ${p.minutes} min (${p.label})`).join('; ')}.

Rules:
- Use ONLY exercises from the list below, by their exact id. Gym day may use gym, home or court exercises that fit a gym; home day only exercises needing a band, light dumbbells or nothing; court day only court/bodyweight drills with cones, balls, racket.
- Prefer coach-approved exercises (✓) and those seen in several videos.
- Realistic amount: warm-up 3-5 exercises, main block 4-6, finisher 2-3. The doses must fit the minutes.
- Over the 4 weeks cover injury prevention for ${INJURY_AREAS.join(', ')}, plus mobility, strength, power, speed & agility, endurance and recovery, and improve these padel movements: ${PADEL_MOVES.join(', ')}.
- Progress sensibly week 1 → 3 (more load / harder variations), week 4 slightly lighter so the player arrives fresh. Keep the same core exercises across weeks so players learn them; change only a few.
- Level ${band.label}: ${lo <= 3 ? 'simple, safe exercises, technique first, no heavy barbell or high-impact plyometrics' : lo <= 6 ? 'moderate loads, basic plyometrics and medicine-ball power, good technique first' : 'heavier strength, real plyometrics and reactive agility'}.
- No medical claims. Doses for amateurs who also play 2-3 times a week.
${note ? `\nCoach Navid's request for this version: ${note}` : ''}${old?.status === 'approved' ? '\nThe previous approved version is being replaced on purpose.' : ''}

Exercises (id | name | goal | where | equipment | usual dose | helps):
${lines.join('\n')}`;
  const { json, model } = await ask({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: PLAN_SCHEMA, temperature: 0.4, maxOutputTokens: 30000 },
  }, BEST);
  const ids = new Set(pool.map((e) => e.id));
  const order = PARTS.map((p) => p.id);
  const weeks = (json.weeks ?? []).slice(0, 4).map((w, wi) => ({
    week: wi + 1, focus: String(w.focus ?? ''),
    sessions: DAYS.map((d) => {
      const s = (w.sessions ?? []).find((x) => x.day === d.id) ?? { focus: '', parts: [] };
      return {
        day: d.id, focus: String(s.focus ?? ''),
        parts: order.map((pid) => {
          const p = (s.parts ?? []).find((x) => x.part === pid) ?? { items: [] };
          return { part: pid, minutes: PARTS.find((x) => x.id === pid).minutes, items: (p.items ?? []).filter((it) => ids.has(it.ex)).slice(0, 8).map((it) => ({ ex: it.ex, dose: String(it.dose ?? '').slice(0, 80), ...(it.cue ? { cue: String(it.cue).slice(0, 140) } : {}) })) };
        }),
      };
    }),
  }));
  const plan = { band: bandId, status: 'draft', overview: String(json.overview ?? ''), weeks, at: new Date().toISOString(), model, note: note || '' };
  await updateJSON(PLANS, (all) => { all[bandId] = plan; }, {});
  return plan;
}

// Copy a library decision to the coaching guide's original tips, so both pages agree
export async function syncMembers(entry) {
  const members = new Set(entry.members ?? []);
  if (!members.size) return;
  const at = new Date().toISOString();
  await updateJSON(CANDIDATES, (list) => {
    for (const c of list) {
      if (!members.has(c.id)) continue;
      c.status = entry.status;
      if (entry.edited?.includes('levels')) { c.levels = entry.levels; c.levelsByNavid = true; }
      c.reviewedAt = at;
    }
  }, [], 12);
}

// The student's plan: approved plan, only approved exercises, with their video moments
export function studentPlan(plan, lib) {
  const byId = new Map(lib.map((e) => [e.id, e]));
  const used = new Map();
  const weeks = plan.weeks.map((w) => ({
    ...w,
    sessions: w.sessions.map((s) => ({
      ...s,
      parts: s.parts.map((p) => ({ ...p, items: p.items.filter((it) => byId.get(it.ex)?.status === 'approved').map((it) => { used.set(it.ex, byId.get(it.ex)); return it; }) })),
    })),
  }));
  const exercises = Object.fromEntries([...used].map(([id, e]) => [id, { name: e.name, goal: e.goal, how: e.how, caution: e.caution, equipment: e.equipment, padel_links: e.padel_links, moment: e.moments[0] ?? null }]));
  return { band: plan.band, overview: plan.overview, weeks, exercises };
}

