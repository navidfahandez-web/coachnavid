// Video analysis reports — what each plan's report contains, the scorecard areas,
// the drill library Navid picks from, and the labels for the student's report page.

// Match Report scorecard (1–10 each)
export const AREAS = [
  { id: 'ground',   en: 'Groundstrokes & walls',            lt: 'Smūgiai nuo žemės ir sienos' },
  { id: 'volley',   en: 'Volleys & net play',               lt: 'Voledžiai ir žaidimas prie tinklo' },
  { id: 'overhead', en: 'Overheads (bandeja, víbora, smash)', lt: 'Smūgiai virš galvos (bandeja, víbora, smash)' },
  { id: 'position', en: 'Positioning & movement',           lt: 'Pozicija ir judėjimas' },
  { id: 'tactics',  en: 'Tactics & decisions',              lt: 'Taktika ir sprendimai' },
  { id: 'partner',  en: 'Partner play & communication',     lt: 'Žaidimas su partneriu ir komunikacija' },
];

// Report kinds. A Progress Plan is made of Quick Fix and Match Report reports.
export const KINDS = {
  quick: { name: 'Quick Fix', items: 3, scores: false, weeks: 0, media: 'voice' },
  match: { name: 'Match Report', items: 3, scores: true, weeks: 3, media: 'video' },
};
export const kindForPlan = (plan) => (plan === 'match' ? 'match' : 'quick');

export const DRILLS = [
  { area: 'ground', name: 'Back-wall exits', how: 'Partner feeds deep to the back wall. Let it bounce off the wall, turn your shoulders early and lift the ball cross-court. 3 × 15 balls each side.' },
  { area: 'ground', name: 'Side-wall double', how: 'Feeds into the side wall then back wall. Focus on staying low and letting the ball come to you. 3 × 10 balls.' },
  { area: 'ground', name: 'Lob to the corner', how: 'From the back of the court, defend every feed with a high lob to the opponent’s backhand corner. Target: 7/10 land in the last 2 metres.' },
  { area: 'ground', name: 'Chiquita to the feet', how: 'From the baseline, play soft low balls to the net player’s feet. Score a point every time the ball dips below the net tape. 3 × 12 balls.' },
  { area: 'volley', name: 'Block volley wall', how: 'Stand at the net, partner hits hard at your body. Short backswing, firm wrist, just block it deep. 4 × 12 balls.' },
  { area: 'volley', name: 'Volley to the glass', how: 'Volley every feed deep and down the middle so it reaches the back glass. Recover your split step after each ball. 3 × 15 balls.' },
  { area: 'volley', name: 'Low volley ladder', how: 'Feeds below the net height. Bend your knees (not your back), open the racket face, play deep. Count 10 in a row.' },
  { area: 'overhead', name: 'Bandeja shadow + feed', how: '10 shadow swings sideways-on, racket high, then 3 × 10 fed lobs. Aim deep cross-court with slice, and come back to the net after every ball.' },
  { area: 'overhead', name: 'Víbora to the side wall', how: 'Fed lobs to your forehand side. Hit with side spin so the ball hits the side wall low. 3 × 10 balls, rest 30 seconds between sets.' },
  { area: 'overhead', name: 'Smash decision drill', how: 'Partner feeds mixed lobs. Short ones: flat smash (x3) or por 3. Deep ones: bandeja and hold the net. Call your choice out loud before hitting.' },
  { area: 'position', name: 'Split-step timing', how: 'Play a rally at walking pace; split step every time the opponent touches the ball. Partner calls “late” when you miss it. 5 minutes.' },
  { area: 'position', name: 'Move as a pair (rope drill)', how: 'Hold an imaginary 3 m rope with your partner. Coach points left/right/forward/back and you both move together. 6 × 30 seconds.' },
  { area: 'position', name: 'Net recovery', how: 'After every lob you defend, move up to the net in 3 steps. Partner feeds the next ball as soon as you play. 4 × 8 balls.' },
  { area: 'tactics', name: 'Middle is king', how: 'Play points where every ball down the middle scores double. Learn to aim between the opponents to create confusion.' },
  { area: 'tactics', name: 'Lob and take the net', how: 'Play points from the back: you can only win the point by lobbing and taking the net. 10 points per game.' },
  { area: 'tactics', name: 'Patience game', how: 'Rally from the back: no attacking shot until the ball has crossed the net 6 times. Builds patience and better shot choice.' },
  { area: 'partner', name: 'Call every ball', how: 'Play 15 minutes where every ball must be called (“mine”, “yours”, “out”). Any silent ball = point lost.' },
  { area: 'partner', name: 'Cover the middle', how: 'On every ball down the middle, the player with the forehand in the middle takes it. Play 10 points and review who took each ball.' },
];

// Labels on the student's report page
export const REPORT_LABELS = {
  en: {
    report: 'Video analysis', for: 'for', by: 'by Coach Navid Fahandezh · Technical Director, Padel Beast',
    summary: 'Summary', strengths: 'What you do well', errors: 'Key errors', fixes: 'Top 3 fixes',
    fix: 'The fix', drill: 'Drill', watch: 'Watch', scorecard: 'Scorecard', prev: 'last time',
    plan: '3-week practice plan', week: 'Week', voice: 'Voice note from Navid', voiceover: 'Navid’s voice-over on your key moments',
    video: 'Your video', closing: 'Final word', pdf: 'Download PDF', history: 'Your earlier reports',
    book: 'Book a lesson with Navid', draft: 'Draft preview — the student can’t see this yet.',
    progress: 'Track your progress across all your reports', progressCta: 'See your progress →',
  },
  lt: {
    report: 'Video analizė', for: '', by: 'treneris Navid Fahandezh · Padel Beast techninis direktorius',
    summary: 'Santrauka', strengths: 'Ką darote gerai', errors: 'Pagrindinės klaidos', fixes: '3 svarbiausi pataisymai',
    fix: 'Pataisymas', drill: 'Pratimas', watch: 'Žiūrėti', scorecard: 'Įvertinimas', prev: 'praėjusį kartą',
    plan: '3 savaičių treniruočių planas', week: 'Savaitė', voice: 'Navid balso žinutė', voiceover: 'Navid komentarai apie svarbiausius momentus',
    video: 'Jūsų video', closing: 'Paskutinis žodis', pdf: 'Atsisiųsti PDF', history: 'Ankstesnės ataskaitos',
    book: 'Užsisakyti treniruotę su Navid', draft: 'Juodraštis — mokinys jo dar nemato.',
    progress: 'Stebėkite savo pažangą per visas ataskaitas', progressCta: 'Mano pažanga →',
  },
};

// "3:12" / "1:03:12" → seconds (null if not a time)
export function toSeconds(t) {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(String(t ?? '').trim());
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}
