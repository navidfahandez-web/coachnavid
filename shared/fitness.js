// Coach Navid's padel fitness program — shared by the admin page, the student page and the server.
// Decisions (Navid, 2026-11-19): 3 × 45 min a week (one gym, one home, one court day);
// each session = 10 min warm-up & mobility / 30 min main block / 5 min finisher;
// home = resistance band + optional light dumbbells; one 4-week plan per level band, approved by Navid;
// students get a private page (free for his students).

// Level bands on Navid's 1-10 scale (most students are 3-6)
export const BANDS = [
  { id: '1-2', levels: [1, 2], label: 'D- / D', name: 'Beginners' },
  { id: '3-4', levels: [3, 4], label: 'D+ / C-', name: 'Improvers' },
  { id: '5-6', levels: [5, 6], label: 'C / C+', name: 'Intermediate' },
  { id: '7-8', levels: [7, 8], label: 'B- / B', name: 'Advanced' },
  { id: '9-10', levels: [9, 10], label: 'B+ / A', name: 'Competition' },
];
export const bandOf = (id) => BANDS.find((b) => b.id === id) ?? null;

export const PARTS = [
  { id: 'warmup', minutes: 10, label: 'Warm-up & mobility' },
  { id: 'main', minutes: 30, label: 'Main block' },
  { id: 'finisher', minutes: 5, label: 'Finisher: injury prevention / cool-down' },
];

export const DAYS = [
  { id: 'gym', label: 'Gym day', icon: '🏋️', equipment: 'a normal gym (dumbbells, barbell, cable, box, medicine ball, bands)' },
  { id: 'home', label: 'Home day', icon: '🏠', equipment: 'a resistance band and (optional) light dumbbells — otherwise bodyweight only' },
  { id: 'court', label: 'Court day', icon: '🎾', equipment: 'cones, balls, racket and the court (a partner can feed balls)' },
];

// Same ids as the coaching guide's fitness goals (netlify/lib/learn.mjs FIT_GOALS)
export const GOALS = [
  { id: 'warmup', label: 'Warm-up' },
  { id: 'mobility', label: 'Mobility' },
  { id: 'injury_prevention', label: 'Injury prevention' },
  { id: 'strength', label: 'Strength' },
  { id: 'power', label: 'Power' },
  { id: 'speed_agility', label: 'Speed & agility' },
  { id: 'endurance', label: 'Endurance' },
  { id: 'recovery', label: 'Recovery' },
];
export const goalLabel = (id) => GOALS.find((g) => g.id === id)?.label ?? id;

// What the program must protect and what it must improve on court
export const INJURY_AREAS = ['shoulder', 'elbow', 'wrist', 'knee', 'ankle', 'lower back', 'calf'];
export const PADEL_MOVES = ['split step', 'first step', 'staying low', 'footwork to the glass', 'recovering the net after a lob', 'overhead power'];

// Movement problems the video analyser can flag → exercises that help (matched on the exercise's padel_links / name / body part).
// Contract with the analyser: report.movement_issues = [{ move: <id below>, time: 'm:ss', note }]
export const MOVES = [
  { id: 'split_step', label: 'Split step', words: ['split step', 'split-step', 'reaction', 'ready position'] },
  { id: 'first_step', label: 'First step', words: ['first step', 'acceleration', 'explosive start', 'sprint'] },
  { id: 'staying_low', label: 'Staying low', words: ['low', 'low volley', 'knee bend', 'squat', 'lunge'] },
  { id: 'footwork_glass', label: 'Footwork to the glass', words: ['glass', 'back wall', 'backward', 'retreat', 'crossover'] },
  { id: 'recover_net', label: 'Recovering the net after a lob', words: ['recover', 'net', 'lob', 'forward', 'transition'] },
  { id: 'overhead_power', label: 'Overhead power', words: ['overhead', 'smash', 'bandeja', 'vibora', 'víbora', 'rotation', 'rotational', 'serve'] },
  { id: 'lateral', label: 'Lateral movement', words: ['lateral', 'side', 'shuffle', 'change of direction'] },
  { id: 'balance', label: 'Balance & stability', words: ['balance', 'stability', 'single leg', 'landing', 'ankle'] },
  { id: 'endurance', label: 'Endurance (tires late in the match)', words: ['endurance', 'conditioning', 'long rallies', 'stamina', 'interval'] },
];
export function exercisesForMove(moveId, library, level = 0) {
  const m = MOVES.find((x) => x.id === moveId);
  if (!m) return [];
  const hit = (e) => m.words.some((w) => `${e.padel_links.join(' ')} ${e.name} ${e.body_part}`.toLowerCase().includes(w));
  return library.filter((e) => e.status === 'approved' && hit(e) && (!level || !e.levels?.length || e.levels.some((l) => Math.abs(l - level) <= 1)))
    .sort((a, b) => b.videos - a.videos);
}

export const SAFETY_NOTE = 'Train without pain. If something hurts (more than normal muscle tiredness) stop that exercise and see a physiotherapist before you go on.';

// m:ss → seconds, for YouTube embeds
export const toSec = (t) => String(t ?? '').split(':').map(Number).reduce((a, b) => a * 60 + b, 0) || 0;

// ---------- Muscle map: which body regions an exercise works (from its body part + name) ----------
const REGION_WORDS = {
  shoulders: ['shoulder', 'deltoid', 'rotator', 'overhead'],
  chest: ['chest', 'pec', 'push-up', 'push up', 'bench press'],
  arms: ['arm', 'bicep', 'tricep'],
  forearms: ['forearm', 'wrist', 'grip', 'elbow'],
  core: ['core', ' abs', 'abdominal', 'oblique', 'trunk', 'plank', 'dead bug', 'rotation', 'breathing'],
  upperback: ['upper back', 'thoracic', 'lat', 'scapula', 'rhomboid', 'posture', 'pull-apart', 'pull apart', 'row'],
  lowerback: ['lower back', 'lumbar'],
  glutes: ['glute', 'hip', 'squat', 'lunge', 'bridge'],
  quads: ['quad', 'leg', 'thigh', 'knee', 'squat', 'lunge', 'jump', 'skipping', 'sprint', 'shuffle', 'step', 'run', 'agility', 'cone', 'reaction'],
  hamstrings: ['hamstring', 'posterior', 'deadlift', 'bridge', 'leg swing'],
  calves: ['calf', 'calves', 'ankle', 'achilles', 'foot', 'feet', 'jump', 'skipping', 'pogo', 'sprint', 'shuffle', 'step', 'run', 'cone', 'reaction'],
};
export function musclesOf(e) {
  const t = ` ${String(e?.body_part ?? '')} ${String(e?.name ?? '')} `.toLowerCase();
  return Object.keys(REGION_WORDS).filter((r) => REGION_WORDS[r].some((w) => t.includes(w)));
}
// Small front + back body map (SVG) with the worked regions in orange
export function muscleMap(regions, size = 96) {
  const on = new Set(regions);
  const f = (r) => (on.has(r) ? '#ff5b1f' : '#3b3b3e');
  const el = (r, cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f(r)}"/>`;
  const fig = (x, back) => `
    <circle cx="${x}" cy="9" r="6" fill="#55555a"/><rect x="${x - 2}" y="14" width="4" height="4" fill="#55555a"/>
    ${el('shoulders', x - 11, 22, 5, 4)}${el('shoulders', x + 11, 22, 5, 4)}
    ${back ? el('upperback', x, 30, 9, 9) : `${el('chest', x - 5, 27, 5, 4.5)}${el('chest', x + 5, 27, 5, 4.5)}`}
    ${back ? `<rect x="${x - 6}" y="40" width="12" height="11" rx="3" fill="${f('lowerback')}"/>` : `<rect x="${x - 6}" y="33" width="12" height="20" rx="3" fill="${f('core')}"/>`}
    ${el('arms', x - 15, 33, 3.5, 8)}${el('arms', x + 15, 33, 3.5, 8)}
    ${el('forearms', x - 17, 49, 3, 7.5)}${el('forearms', x + 17, 49, 3, 7.5)}
    ${back ? `${el('glutes', x - 5, 59, 5.5, 5.5)}${el('glutes', x + 5, 59, 5.5, 5.5)}` : `<rect x="${x - 9}" y="54" width="18" height="8" rx="3" fill="${f('glutes')}" opacity=".55"/>`}
    ${back ? `${el('hamstrings', x - 5, 76, 4.2, 11)}${el('hamstrings', x + 5, 76, 4.2, 11)}` : `${el('quads', x - 5, 74, 4.5, 11.5)}${el('quads', x + 5, 74, 4.5, 11.5)}`}
    ${el('calves', x - 5, 99, 3.5, 9)}${el('calves', x + 5, 99, 3.5, 9)}
    <ellipse cx="${x - 5}" cy="113" rx="3" ry="2" fill="#55555a"/><ellipse cx="${x + 5}" cy="113" rx="3" ry="2" fill="#55555a"/>`;
  return `<svg class="fx-map" viewBox="0 0 110 120" width="${size}" height="${Math.round(size * 120 / 110)}" role="img" aria-label="Muscles worked">${fig(28, false)}${fig(82, true)}</svg>`;
}
