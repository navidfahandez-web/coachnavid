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
