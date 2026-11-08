// Example player with 10 reports (7 Match Reports, 3 Quick Fix) — shown at
// /player/demo and /report/demo-1 … demo-10 so people can see what they get.
// Clearly labelled as an example; not a real student.
import { DRILLS } from './report.js';

const drill = (name) => DRILLS.find((d) => d.name === name) ?? { name, how: '' };
const item = (time, title, detail, fix, drillName) => ({ time, title, detail, fix, drillName, drillHow: drill(drillName).how });

// [date, kind, headline, scores (ground, volley, overhead, position, tactics, partner) | null, items]
const ROWS = [
  ['2026-06-02', 'match', 'Good hands — but the net is giving you away', [5, 6, 3, 4, 4, 5], [
    item('4:18', 'Bandeja hit flat and short', 'You hit the bandeja like a smash: flat, hard and short. It lands mid-court and the opponents take the net.', 'Sideways, racket high, slice under the ball. Aim deep cross-court and stay at the net.', 'Bandeja shadow + feed'),
    item('12:40', 'No split step at the net', 'You are flat-footed when the opponent hits, so every fast ball surprises you.', 'Small hop exactly as the opponent touches the ball. Land on your toes, ready to go both ways.', 'Split-step timing'),
    item('27:05', 'Lobs to the middle', 'Your lobs land in the middle of the court, easy for either opponent.', 'Lob to the backhand corner, last 2 metres. Height first, then depth.', 'Lob to the corner'),
  ]],
  ['2026-06-20', 'quick', 'Bandeja check — much higher contact already', null, [
    item('0:42', 'Elbow drops before contact', 'You prepare well, but the elbow drops and the ball goes flat.', 'Keep the elbow at shoulder height until after contact.', 'Bandeja shadow + feed'),
    item('1:55', 'Running backwards facing the net', 'You backpedal instead of turning sideways, so you arrive late.', 'Turn first, then shuffle sideways. Shoulder points at the ball.', 'Bandeja shadow + feed'),
    item('3:30', 'Not coming back to the net', 'After the bandeja you stay at the service line.', 'Two quick steps forward after every overhead.', 'Net recovery'),
  ]],
  ['2026-07-08', 'match', 'The bandeja is landing deep — now the walls', [5, 6, 4, 4, 5, 5], [
    item('8:12', 'Hitting before the back wall', 'You try to volley balls that should come off the back wall, and miss the timing.', 'Let it pass, turn your shoulders, wait for it to come off the glass.', 'Back-wall exits'),
    item('19:47', 'Silent on middle balls', 'Two balls down the middle went untouched because nobody called them.', 'Call every ball. Forehand in the middle takes it.', 'Call every ball'),
    item('33:10', 'Rushing the attack', 'You go for winners from the back of the court.', 'From the back: lob or chiquita, then take the net.', 'Lob and take the net'),
  ]],
  ['2026-07-26', 'match', 'Big step on the walls — positioning next', [6, 6, 5, 5, 5, 6], [
    item('6:30', 'Too far from your partner', 'There is a big gap between you two at the net.', 'Move together like you share a 3 m rope.', 'Move as a pair (rope drill)'),
    item('15:02', 'Low volleys into the net', 'You bend your back, not your knees, and the low volleys hit the tape.', 'Knees down, open racket face, push the ball deep.', 'Low volley ladder'),
    item('41:18', 'Smash every lob', 'You smash even deep lobs and lose the net.', 'Short lob: smash. Deep lob: bandeja and hold the net.', 'Smash decision drill'),
  ]],
  ['2026-08-14', 'quick', 'Víbora — the side spin is coming', null, [
    item('0:25', 'Contact behind the body', 'The ball is behind you at contact, so the víbora floats.', 'Contact in front of your right shoulder.', 'Víbora to the side wall'),
    item('1:40', 'No side spin', 'Racket goes straight through the ball.', 'Brush across the ball from right to left.', 'Víbora to the side wall'),
    item('2:58', 'Watching your shot', 'You stop to watch the ball instead of recovering.', 'Hit and move — forward to the net.', 'Net recovery'),
  ]],
  ['2026-09-01', 'match', 'Tough match, smart lessons', [6, 7, 5, 5, 5, 6], [
    item('11:20', 'Impatient in long rallies', 'Under pressure you went for risky winners and the tactics score dropped a little.', 'Six balls of patience before you attack.', 'Patience game'),
    item('24:44', 'Volleys short to the service line', 'Your volleys land short and give them time.', 'Volley deep, down the middle, to the glass.', 'Volley to the glass'),
    item('38:03', 'Lob defence too low', 'Your defensive lobs are low and get smashed.', 'More height, aim the last 2 metres.', 'Lob to the corner'),
  ]],
  ['2026-09-22', 'match', 'Everything is more solid — let’s use the middle', [6, 7, 6, 6, 5, 6], [
    item('9:15', 'Playing to the side, not the middle', 'You open angles that help the opponents.', 'Middle is king: aim between them.', 'Middle is king'),
    item('22:37', 'Late on fast body balls', 'Hard balls at your body come back weak.', 'Short backswing, firm wrist, block it deep.', 'Block volley wall'),
    item('35:50', 'Chiquita too high', 'Your chiquitas sit up and get volleyed down.', 'Soft and low — to the net player’s feet.', 'Chiquita to the feet'),
  ]],
  ['2026-10-10', 'quick', 'Block volleys — ready for faster opponents', null, [
    item('0:33', 'Backswing on block volleys', 'You swing at fast balls and lose control.', 'No backswing: racket in front, just block.', 'Block volley wall'),
    item('1:48', 'Racket face too closed', 'Blocks go into the net.', 'Slightly open face, push through the ball.', 'Low volley ladder'),
    item('2:41', 'Weight on the heels', 'You lean back on fast balls.', 'Weight forward, on your toes.', 'Split-step timing'),
  ]],
  ['2026-10-24', 'match', 'Playing like a team now', [7, 7, 6, 7, 6, 7], [
    item('7:05', 'Covering the same ball', 'You and your partner both moved to the same middle ball twice.', 'Agree before the match: forehand in the middle takes it.', 'Cover the middle'),
    item('18:22', 'Bandeja direction', 'The bandeja is deep now — next step is placing it to their backhand.', 'Same swing, aim the back-left corner.', 'Bandeja shadow + feed'),
    item('31:40', 'Waiting for the mistake', 'Good patience — now add the attack when the ball is high.', 'High ball at the net = víbora or smash, no waiting.', 'Smash decision drill'),
  ]],
  ['2026-11-07', 'match', 'Ready for competition', [7, 8, 7, 7, 7, 8], [
    item('5:48', 'Second serve too safe', 'The second serve sits up and gets attacked.', 'Same routine, aim the glass, add slice.', 'Back-wall exits'),
    item('20:15', 'Por 3 attempts too early', 'You try por 3 from balls that are not short enough.', 'Only por 3 inside the service box.', 'Smash decision drill'),
    item('44:02', 'Talk more on big points', 'Communication dips at 30–30 and deuce.', 'Call every ball on big points — louder, not quieter.', 'Call every ball'),
  ]],
];

const AREA_IDS = ['ground', 'volley', 'overhead', 'position', 'tactics', 'partner'];
const NOTES = {
  ground: 'Walls getting more natural', volley: 'Quick hands, depth improving', overhead: 'Bandeja depth is the key',
  position: 'Moving better as a pair', tactics: 'Patience pays', partner: 'Talk on every ball',
};

export const DEMO_PLAYER = { firstName: 'Sample', lastName: 'Player', token: 'demo' };

export const DEMO_REPORTS = ROWS.map(([date, kind, headline, scores, items], i) => ({
  token: `demo-${i + 1}`, ref: `EX${String(i + 1).padStart(2, '0')}`, kind, lang: 'en', status: 'published', example: true,
  student: { firstName: DEMO_PLAYER.firstName, lastName: DEMO_PLAYER.lastName },
  headline, publishedAt: `${date}T10:00:00Z`,
  summary: kind === 'match'
    ? 'This is an example report. A full match, watched point by point: what wins you points, what costs you points, and the three things that will make the biggest difference right now.'
    : 'This is an example report. One clip, one shot, three clear corrections — with a drill for each.',
  strengths: 'Quick hands at the net, great energy, and you clearly listen — the fixes from the last report are already showing.',
  scores: scores ? Object.fromEntries(AREA_IDS.map((id, n) => [id, { score: scores[n], note: NOTES[id] }])) : {},
  items,
  weeks: kind === 'match' ? [
    { focus: items[0].title, plan: `2 × 45 min: ${items[0].drillName}, then 15 min of points using it.` },
    { focus: items[1].title, plan: `2 × 45 min: ${items[1].drillName} + 20 min match play.` },
    { focus: items[2].title, plan: `1 × 60 min: ${items[2].drillName}, then play a full set focusing on it.` },
  ] : [],
  closing: 'Keep going — film your next match and send it in. Every report builds on the last one.',
  videoFileId: null, mediaFileId: null, playerToken: 'demo',
}));

// Same shape as GET /api/report/:token
export function demoReport(token) {
  const i = DEMO_REPORTS.findIndex((r) => r.token === token);
  if (i < 0) return null;
  const r = DEMO_REPORTS[i];
  return { ...r, history: DEMO_REPORTS.slice(0, i).map((h) => ({ token: h.token, kind: h.kind, headline: h.headline, publishedAt: h.publishedAt, scores: h.scores })) };
}

// Same shape as GET /api/player/:token
export function demoPlayer() {
  const avg = (s) => {
    const v = Object.values(s).map((x) => x.score);
    return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
  };
  return {
    firstName: DEMO_PLAYER.firstName, lastName: DEMO_PLAYER.lastName, example: true,
    reports: DEMO_REPORTS.map((r) => ({
      token: r.token, ref: r.ref, kind: r.kind, lang: r.lang, headline: r.headline, publishedAt: r.publishedAt,
      scores: r.kind === 'match' ? r.scores : null, average: r.kind === 'match' ? avg(r.scores) : null,
      fixes: r.items.map((x) => x.title),
    })),
  };
}
