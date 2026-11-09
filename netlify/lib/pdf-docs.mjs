// The two Coach Navid PDFs, built with pdf-design: lesson summaries and video-analysis reports.
// Pure functions (no server imports) so they can be previewed in a browser.
import { AREAS, KINDS, SHOTS } from '../../shared/report.js';
import { block, doc, esc, longDate } from './pdf-design.mjs';

const T = {
  en: {
    training: 'Private training', lessonDoc: 'Lesson summary', reportDoc: 'Video analysis', by: ['Report by', 'Navid Fahandezh'],
    worked: 'What we worked on', workedSub: 'The focus of the session', well: 'What went well',
    improve: 'What to improve', improveSub: 'The corrections', shots: 'Shot by shot',
    drills: 'Drills', drillsSub: 'To practise before the next lesson',
    progress: 'Your progress', progressSub: 'Compared with your earlier sessions',
    keys: 'Quick keys', keysSub: 'The whole session in one minute', next: 'Focus for the next session',
    key: 'Key concept', better: 'better', same: 'same', worse: 'needs work', new: 'new',
    summary: 'Summary', summarySub: 'What I saw', strengths: 'What you do well',
    scorecard: 'Scorecard', scorecardSub: 'Every area of your game, 1–10', prev: 'last time',
    fix: 'Fix', theFix: 'The fix', whatHappens: 'What happens', drill: 'Drill', watch: 'Watch at',
    plan: 'Practice plan', planSub: 'Three weeks', week: 'Week', final: 'Final word', finalSub: 'From your coach',
  },
  lt: {
    training: 'Asmeninė treniruotė', lessonDoc: 'Treniruotės santrauka', reportDoc: 'Video analizė', by: ['Ataskaitą parengė', 'Navid Fahandezh'],
    worked: 'Ką treniravome', workedSub: 'Treniruotės tikslas', well: 'Kas sekėsi gerai',
    improve: 'Ką tobulinti', improveSub: 'Pataisymai', shots: 'Smūgiai',
    drills: 'Pratimai', drillsSub: 'Iki kitos treniruotės',
    progress: 'Jūsų pažanga', progressSub: 'Palyginti su ankstesnėmis treniruotėmis',
    keys: 'Greiti raktai', keysSub: 'Visa treniruotė per minutę', next: 'Kitos treniruotės tikslas',
    key: 'Pagrindinė mintis', better: 'geriau', same: 'taip pat', worse: 'reikia dirbti', new: 'nauja',
    summary: 'Santrauka', summarySub: 'Ką pamačiau', strengths: 'Ką darote gerai',
    scorecard: 'Įvertinimas', scorecardSub: 'Visos žaidimo sritys, 1–10', prev: 'praėjusį kartą',
    fix: 'Pataisymas', theFix: 'Pataisymas', whatHappens: 'Kas vyksta', drill: 'Pratimas', watch: 'Žiūrėti',
    plan: 'Treniruočių planas', planSub: 'Trys savaitės', week: 'Savaitė', final: 'Paskutinis žodis', finalSub: 'Nuo trenerio',
  },
};
const tr = (lang) => T[lang] ?? T.en;
const shotName = (id, lang) => { const s = SHOTS.find((x) => x.id === id); return s ? (s[lang] ?? s.en) : id; };
const upper = (s) => String(s ?? '').toUpperCase();

export function lessonDoc(lesson, player) {
  const t = tr(lesson.lang);
  const s = lesson.summary;
  const date = longDate(lesson.date, lesson.lang);
  const shots = s.shots ?? [];
  const cards = [
    ...shots.map((x) => ({ tag: t[x.trend] ?? x.trend, title: shotName(x.id, lesson.lang), text: x.note })),
  ].slice(0, 6);
  return doc({
    lang: lesson.lang,
    top: `Padel Beast · ${t.training} · ${date}`,
    first: player.firstName, last: player.lastName,
    sub: `${t.lessonDoc} · ${s.title}`,
    sub2: s.summary?.split(/(?<=[.!?])\s/)[0],
    by: t.by,
    header: `${player.firstName} ${player.lastName} · ${t.lessonDoc} · ${date}`,
    sections: [
      {
        title: t.worked, sub: s.title,
        pills: shots.slice(0, 4).map((x) => shotName(x.id, lesson.lang)),
        body: block.text(s.summary) + (s.worked_on?.length ? block.label(t.worked) + block.list(s.worked_on) : '')
          + (s.went_well?.length ? block.label(t.well) + block.list(s.went_well) : ''),
      },
      {
        title: t.improve, sub: t.improveSub,
        body: block.list(s.to_improve)
          + (shots.filter((x) => x.trend !== 'better').length ? block.label(t.shots) + block.list(shots.filter((x) => x.trend !== 'better').map((x) => ({ html: `<b>${esc(shotName(x.id, lesson.lang))}</b> — ${esc(x.note)}` }))) : '')
          + block.key(t.key, s.to_improve?.[0]),
      },
      {
        title: t.drills, sub: t.drillsSub,
        body: block.cards((s.drills ?? []).map((d) => ({ title: d.name, text: d.how }))),
      },
      {
        title: t.progress, sub: t.progressSub,
        body: s.progress ? block.text(s.progress) : '',
      },
      {
        title: t.keys, sub: t.keysSub,
        body: block.cards(cards) + (s.next_focus ? block.label(t.next) + block.focus(s.next_focus.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 5)) : ''),
      },
    ],
  });
}

export function reportDoc(r, history = []) {
  const t = tr(r.lang);
  const kind = KINDS[r.kind];
  const date = longDate(r.publishedAt || new Date().toISOString(), r.lang);
  const prev = [...history].reverse().find((x) => x.kind === 'match');
  const items = r.items.filter((i) => i.title);

  const bars = kind.scores ? `<div class="bars">${AREAS.map((a) => {
    const s = r.scores?.[a.id];
    if (!s?.score) return '';
    const before = prev?.scores?.[a.id]?.score;
    const d = before ? Math.round((s.score - before) * 10) / 10 : 0;
    const shots = a.shots.filter((x) => s.shots?.[x.id]?.score);
    return `<div class="bar">
      <div class="bar__top"><span>${esc(upper(a[r.lang] ?? a.en))}</span><b>${s.score}<small>/10</small></b></div>
      <div class="bar__track"><i style="width:${s.score * 10}%"></i>${before ? `<em style="left:${before * 10}%"></em>` : ''}</div>
      <p>${esc(s.note)}${d ? ` <span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲ +' : '▼ '}${d} ${t.prev}</span>` : ''}</p>
      ${shots.length ? `<ul>${shots.map((x) => `<li>${esc(x[r.lang] ?? x.en)}: <b>${s.shots[x.id].score}</b></li>`).join('')}</ul>` : ''}
    </div>`;
  }).join('')}</div>` : '';

  return doc({
    lang: r.lang,
    top: `Padel Beast · ${t.reportDoc} · ${date}`,
    first: r.student.firstName, last: r.student.lastName,
    sub: `${t.reportDoc} · ${kind.name} · ${r.ref}`,
    sub2: r.headline,
    by: t.by,
    header: `${r.student.firstName} ${r.student.lastName} · ${kind.name} · ${date}`,
    sections: [
      {
        title: t.summary, sub: t.summarySub, pills: [kind.name, r.ref],
        body: block.text(r.summary) + (r.strengths ? block.key(t.strengths, r.strengths) : ''),
      },
      kind.scores ? { title: t.scorecard, sub: t.scorecardSub, body: bars } : null,
      ...items.map((i, n) => ({
        title: i.title, sub: `${t.fix} ${n + 1}`,
        pills: i.time ? [`${t.watch} ${i.time}`] : [],
        body: (i.detail ? block.label(t.whatHappens) + block.text(i.detail) : '')
          + block.key(t.theFix, i.fix)
          + (i.drillName || i.drillHow ? block.label(t.drill) + block.cards([{ title: i.drillName, text: i.drillHow }]) : ''),
      })),
      r.weeks?.some((w) => w.focus || w.plan) ? {
        title: t.plan, sub: t.planSub,
        body: block.cards(r.weeks.map((w, n) => ({ tag: `${t.week} ${n + 1}`, title: w.focus, text: w.plan }))),
      } : null,
      { title: t.final, sub: t.finalSub, body: block.key('Coach Navid', r.closing) },
    ],
  });
}
