// Video analysis reports — what each plan's report contains, the scorecard areas,
// the drill library Navid picks from, and the labels for the student's report page.

// Match Report scorecard (1–10 each)
export const AREAS = [
  { id: 'ground', en: 'Groundstrokes & walls', lt: 'Smūgiai nuo žemės ir sienos', shots: [
    { id: 'fh_before', en: 'Forehand before the glass', lt: 'Forhendas prieš sieną' },
    { id: 'bh_before', en: 'Backhand before the glass', lt: 'Bekhendas prieš sieną' },
    { id: 'fh_after', en: 'Forehand after the back glass', lt: 'Forhendas po galinės sienos' },
    { id: 'bh_after', en: 'Backhand after the back glass', lt: 'Bekhendas po galinės sienos' },
    { id: 'side_wall', en: 'Side-wall & double-wall exits', lt: 'Šoninė ir dviguba siena' },
    { id: 'contrapared', en: 'Back-wall shot (contrapared)', lt: 'Contrapared' },
    { id: 'bajada', en: 'Attacking off the back wall (bajada)', lt: 'Bajada (puolimas nuo sienos)' },
    { id: 'chiquita', en: 'Chiquita', lt: 'Chiquita' },
    { id: 'lob', en: 'Defensive lob', lt: 'Gynybinis lobas' },
    { id: 'serve', en: 'Serve', lt: 'Padavimas' },
    { id: 'return', en: 'Return of serve', lt: 'Padavimo priėmimas' },
  ] },
  { id: 'volley', en: 'Volleys & net play', lt: 'Voledžiai ir žaidimas prie tinklo', shots: [
    { id: 'fh_volley', en: 'Forehand volley', lt: 'Forhendo voledžas' },
    { id: 'bh_volley', en: 'Backhand volley', lt: 'Bekhendo voledžas' },
    { id: 'low_volley', en: 'Low volley', lt: 'Žemas voledžas' },
    { id: 'block_volley', en: 'Block volley vs hard balls', lt: 'Blokuojantis voledžas' },
    { id: 'half_volley', en: 'Half-volley (bote pronto)', lt: 'Pusvoledis (bote pronto)' },
    { id: 'drop_volley', en: 'Drop volley (dejada)', lt: 'Trumpas voledžas (dejada)' },
  ] },
  { id: 'overhead', en: 'Overheads (bandeja, víbora, smash)', lt: 'Smūgiai virš galvos (bandeja, víbora, smash)', shots: [
    { id: 'bandeja', en: 'Bandeja', lt: 'Bandeja' },
    { id: 'vibora', en: 'Víbora', lt: 'Víbora' },
    { id: 'gancho', en: 'Hook (gancho)', lt: 'Gancho' },
    { id: 'flat_smash', en: 'Flat smash', lt: 'Plokščias smūgis' },
    { id: 'por3', en: 'Kick smash out over the side (por 3)', lt: 'Smash per šoną (por 3)' },
    { id: 'por4', en: 'Smash out over the back (por 4)', lt: 'Smash per galą (por 4)' },
  ] },
  { id: 'position', en: 'Positioning & movement', lt: 'Pozicija ir judėjimas', shots: [
    { id: 'split_step', en: 'Split step', lt: 'Split step' },
    { id: 'wall_footwork', en: 'Turning & footwork to the wall', lt: 'Pasisukimas ir kojų darbas prie sienos' },
    { id: 'net_recovery', en: 'Recovering to the net after a lob', lt: 'Grįžimas prie tinklo po lobo' },
    { id: 'pair_movement', en: 'Moving together as a pair', lt: 'Judėjimas kartu su partneriu' },
    { id: 'net_position', en: 'Court position & balance at the net', lt: 'Pozicija ir pusiausvyra prie tinklo' },
  ] },
  { id: 'tactics', en: 'Tactics & decisions', lt: 'Taktika ir sprendimai', shots: [
    { id: 'shot_selection', en: 'Shot selection', lt: 'Smūgių pasirinkimas' },
    { id: 'lob_or_chiquita', en: 'Lob or chiquita — the right choice', lt: 'Lobas ar chiquita – teisingas pasirinkimas' },
    { id: 'middle', en: 'Playing through the middle', lt: 'Žaidimas per vidurį' },
    { id: 'patience', en: 'Patience & building the point', lt: 'Kantrybė ir taško kūrimas' },
    { id: 'high_ball', en: 'Finishing the high ball', lt: 'Aukšto kamuolio užbaigimas' },
    { id: 'big_points', en: 'Big points (30–30, deuce)', lt: 'Svarbūs taškai (30–30, lygu)' },
  ] },
  { id: 'partner', en: 'Partner play & communication', lt: 'Žaidimas su partneriu ir komunikacija', shots: [
    { id: 'calling', en: 'Calling balls', lt: 'Kamuolių šaukimas' },
    { id: 'cover_middle', en: 'Covering the middle', lt: 'Vidurio dengimas' },
    { id: 'switches', en: 'Switches (cambios)', lt: 'Pasikeitimai (cambios)' },
    { id: 'support', en: 'Support & body language', lt: 'Palaikymas ir kūno kalba' },
  ] },
  { id: 'physical', en: 'Physical condition', lt: 'Fizinė forma', shots: [
    { id: 'speed', en: 'Speed & reaction', lt: 'Greitis ir reakcija' },
    { id: 'first_step', en: 'First-step explosiveness', lt: 'Pirmo žingsnio sprogstamumas' },
    { id: 'endurance', en: 'Endurance (long rallies, 3rd set)', lt: 'Ištvermė (ilgi taškai, 3 setas)' },
    { id: 'agility', en: 'Agility & change of direction', lt: 'Vikrumas ir krypties keitimas' },
    { id: 'low_positions', en: 'Low positions & flexibility', lt: 'Žemos pozicijos ir lankstumas' },
    { id: 'recovery', en: 'Recovery between points', lt: 'Atsigavimas tarp taškų' },
  ] },
];
export const SHOTS = AREAS.flatMap((a) => a.shots.map((s) => ({ ...s, area: a.id })));

// Area score = what Navid typed, else the average of the shots he scored.
export function areaScore(s) {
  if (Number.isFinite(s?.score)) return s.score;
  const v = Object.values(s?.shots ?? {}).map((x) => x?.score).filter(Number.isFinite);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

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
