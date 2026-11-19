// "The Method" — Navid's methodology as a video book, built live from the Coaching guide:
// principles (shared/method.js) → levels & goals → techniques (his notes + approved tips) → fitness.
// Every tip links to the exact moment of the coaching video it came from.
import { AREAS, LEVELS, SHOTS } from '../../shared/report.js';
import { FITNESS_PROGRAM, PRINCIPLES } from '../../shared/method.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
let password = '';
try { password = sessionStorage.getItem('navid-admin-key') || localStorage.getItem('navid-admin-key') || ''; } catch { /* blocked */ }
const toSec = (t) => String(t ?? '').split(':').map(Number).reduce((a, b) => a * 60 + b, 0) || 0;
const FIT = { warmup: 'Warm-up', mobility: 'Mobility', injury_prevention: 'Injury prevention', strength: 'Strength', power: 'Power', speed_agility: 'Speed & agility', endurance: 'Endurance', recovery: 'Recovery' };
const lvLabel = (ls) => {
  const v = (ls ?? []).filter((n) => n >= 1).sort((a, b) => a - b);
  if (!v.length) return '';
  const l = (n) => LEVELS.find((x) => x.n === n)?.label ?? n;
  return v.length === 1 ? l(v[0]) : `${l(v[0])}–${l(v.at(-1))}`;
};
let data = null;
// Merged points ("said in N videos") with all their video moments; tips not merged yet stay on their own
function units() {
  const by = new Map();
  for (const c of data.candidates) if (c.point) { if (!by.has(c.point)) by.set(c.point, []); by.get(c.point).push(c); }
  const known = new Set();
  const pts = (data.points ?? []).filter((p) => by.has(p.id)).map((p) => {
    known.add(p.id);
    const ms = by.get(p.id);
    const f = ms[0];
    const n = new Map();
    for (const m of ms) for (const l of m.levels ?? []) if (l >= 1) n.set(l, (n.get(l) ?? 0) + 1);
    const lv = p.levels?.length ? p.levels : [...n].filter(([, k]) => k >= ms.length / 3).map(([l]) => l);
    const pick = (field) => (ms.filter((m) => m[field] === f[field]).length >= ms.length / 2 ? f[field] : null);
    return { ...f, ...p, isPoint: true, members: ms, levels: lv, shot: f.shot, goal: f.goal, type: f.type, transition: pick('transition'), time_tag: pick('time_tag'), fundamental: pick('fundamental'),
      exercise: f.type === 'fitness' ? '' : f.exercise };
  });
  return [...pts, ...data.candidates.filter((c) => !c.point || !known.has(c.point))];
}
let drafts = false;
const LIMIT = 8;

const shown = (c) => c.status === 'approved' || (drafts && c.status === 'pending');
const moments = (c) => {
  const ms = (c.isPoint ? c.members : [c]).filter((m, i, a) => a.findIndex((x) => x.source === m.source) === i); // one per video
  return ms.slice(0, 4).map((m) => `<button class="bk-play" type="button" data-play="${esc(m.source)}" data-t="${toSec(m.time)}" title="${esc(m.sourceTitle ?? '')}">▶ ${esc(m.time)}</button>`).join('')
    + (ms.length > 4 ? `<span class="bk-said">+${ms.length - 4} more</span>` : '');
};
const item = (c) => {
  const vids = c.isPoint ? new Set(c.members.map((m) => m.source)).size : 1;
  return `
  <li class="${c.status === 'approved' ? '' : 'is-draft'}">
    <div>
      ${c.type === 'fitness'
    ? `<b>${esc(c.isPoint ? c.fix : `${c.exercise} — ${c.fix}`)}</b><small>${esc(c.where ?? '')}${c.dose ? ` · ${esc(c.dose)}` : ''}${c.equipment ? ` · ${esc(c.equipment)}` : ''}${c.padel_link || c.why ? ` · helps: ${esc(c.padel_link ?? c.why)}` : ''}</small>`
    : `${c.mistake ? `<small>Mistake: ${esc(c.mistake)}</small>` : ''}<b>${esc(c.fix)}</b>${c.why ? `<small>${esc(c.why)}</small>` : ''}`}
      <div class="bk-moments">${vids > 1 ? `<span class="bk-said">said in ${vids} videos</span>` : ''}${moments(c)}</div>
      <div data-video></div>
    </div>
    ${lvLabel(c.levels) ? `<span class="bk-lv">${esc(lvLabel(c.levels))}</span>` : ''}
  </li>`;
};
const list = (items, id) => {
  if (!items.length) return `<p class="bk-empty">${drafts ? 'Nothing here yet.' : 'No approved points yet — approve them in the Coaching guide (or tick “Show drafts”).'}</p>`;
  items = [...items].sort((a, b) => (b.members?.length ?? 1) - (a.members?.length ?? 1) || (a.levels?.[0] ?? 99) - (b.levels?.[0] ?? 99));
  listItems[id] = items;
  return `<ul class="bk-list" data-list="${id}">${items.slice(0, LIMIT).map(item).join('')}</ul>${items.length > LIMIT ? `<button class="bk-more" type="button" data-more="${id}">Show all ${items.length}</button>` : ''}`;
};
let listItems = {};

function bar(label, done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="bk-bar"><span><b>${esc(label)}</b><em>${done} / ${total}</em></span><i><b style="width:${pct}%"></b></i></div>`;
}

function render() {
  const C = units();
  const SL = data.shotLevels ?? {};
  const lvName = (n) => `${n} ${LEVELS.find((x) => x.n === n)?.label ?? ''}`;
  const range = (id) => (SL[id] ? `appears ${lvName(SL[id].from)} · mastered ${lvName(SL[id].mastered)}` : '');
  const tech = C.filter((c) => c.type !== 'fitness');
  const fit = C.filter((c) => c.type === 'fitness');
  const ok = (arr) => arr.filter((c) => c.status === 'approved').length;
  const reviewed = (arr) => arr.filter((c) => c.status !== 'pending').length;
  const shotIds = SHOTS.map((s) => s.id);
  const notesDone = shotIds.filter((id) => (data.notes[id] ?? '').trim()).length;
  const watched = data.sources.filter((s) => s.status === 'ready').length;
  $('[data-progress]').innerHTML = [
    bar('Principles written', PRINCIPLES.length, PRINCIPLES.length),
    bar('Level goals approved', data.goals.filter((g) => g.status === 'approved').length, data.goals.filter((g) => g.status !== 'rejected').length),
    bar('Your technique notes', notesDone, shotIds.length),
    bar('Technique points reviewed', reviewed(tech), tech.length),
    bar('Fitness exercises reviewed', reviewed(fit), fit.length),
    bar('Shots placed on your scale', shotIds.filter((id) => SL[id]).length, shotIds.length),
    bar('Coaching videos watched', watched, watched + data.queued),
  ].join('');

  listItems = {};
  const chapters = [];
  // 1 · principles
  chapters.push({ id: 'principles', title: '1 · The principles', html: PRINCIPLES.map((p) => {
    let tips = '';
    if (p.tag) {
      const [field, vals] = p.tag;
      const items = tech.filter((c) => vals.includes(c[field]) && shown(c));
      listItems[`p-${p.id}`] = items;
      tips = list(items, `p-${p.id}`);
    }
    return `<section class="bk-sec"><h3>${p.icon} ${esc(p.title)}</h3><p class="bk-text">${esc(p.text)}</p>${tips}</section>`;
  }).join('') });
  // 2 · levels
  chapters.push({ id: 'levels', title: '2 · The 10 levels', note: 'From D- to A — amateur to high competition. Each level is its own step so players feel progress fast.', html: LEVELS.map((L) => {
    const gs = data.goals.filter((g) => g.level === L.n && (g.status === 'approved' || (drafts && g.status === 'pending')));
    const sh = (k) => SHOTS.filter((x) => SL[x.id]?.[k] === L.n).map((x) => x.en).join(', ');
    const starts = sh('from'); const masters = sh('mastered');
    return `<section class="bk-sec"><h3>Level ${L.n} · ${esc(L.label)}</h3><p class="bk-text">${esc(L.desc)}</p>${starts || masters ? `<p class="bk-text">${starts ? `🌱 <b>Starts:</b> ${esc(starts)}<br>` : ''}${masters ? `🏆 <b>Mastered:</b> ${esc(masters)}` : ''}</p>` : ''}${gs.length ? `<ul class="bk-list">${gs.map((g) => `<li class="${g.status === 'approved' ? '' : 'is-draft'}"><div><b>${esc(g.goal)}</b><small>${esc(AREAS.find((a) => a.id === g.area)?.en ?? g.area)}</small></div></li>`).join('')}</ul>` : `<p class="bk-empty">${drafts ? 'No goals yet.' : 'No approved goals yet.'}</p>`}</section>`;
  }).join('') });
  // 3 · techniques, by area
  let n = 3;
  for (const A of AREAS.filter((a) => a.id !== 'physical')) {
    const shots = [...A.shots].sort((x, y) => (SL[x.id]?.from ?? 99) - (SL[y.id]?.from ?? 99)); // in the order a player meets them
    const done = tech.filter((c) => c.area === A.id || A.shots.some((x) => x.id === c.shot));
    chapters.push({ id: `a-${A.id}`, title: `${n++} · ${A.en}`, note: done.length ? `${ok(done)} of ${done.length} points approved` : '', html: shots.map((S) => {
      const items = tech.filter((c) => c.shot === S.id && shown(c));
      listItems[`s-${S.id}`] = items;
      const mine = (data.notes[S.id] ?? '').trim();
      if (!mine && !items.length && !drafts) return '';
      return `<section class="bk-sec"><h3>${esc(S.en)}<small>${ok(tech.filter((c) => c.shot === S.id))} approved</small></h3>${range(S.id) ? `<p class="bk-range">${esc(range(S.id))}${SL[S.id].note ? ` — ${esc(SL[S.id].note)}` : ''}</p>` : ''}${mine ? `<div class="bk-mine">${esc(mine)}</div>` : ''}${list(items, `s-${S.id}`)}</section>`;
    }).join('') + (() => { // points about the area in general (no single shot)
      const items = tech.filter((c) => c.area === A.id && (!c.shot || c.shot === 'general') && shown(c));
      return items.length ? `<section class="bk-sec"><h3>${esc(A.en)} — in general</h3>${list(items, `g-${A.id}`)}</section>` : '';
    })() || `<p class="bk-empty">Nothing approved in this chapter yet.</p>` });
  }
  // fitness
  chapters.push({ id: 'fitness', title: `${n} · The fitness program`, note: FITNESS_PROGRAM, html: Object.entries(FIT).map(([g, label]) => {
    const items = fit.filter((c) => c.goal === g && shown(c));
    listItems[`f-${g}`] = items;
    return `<section class="bk-sec"><h3>💪 ${esc(label)}<small>${ok(fit.filter((c) => c.goal === g))} approved</small></h3>${list(items, `f-${g}`)}</section>`;
  }).join('') });

  $('[data-toc]').innerHTML = chapters.map((c) => `<a href="#${c.id}">${esc(c.title)}</a>`).join('');
  $('[data-book]').innerHTML = chapters.map((c) => `<section class="bk-ch" id="${c.id}"><h2>${esc(c.title)}</h2>${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}${c.html}</section>`).join('');
}

$('[data-drafts]').addEventListener('change', (e) => { drafts = e.target.checked; render(); });
document.addEventListener('click', (e) => {
  const p = e.target.closest('[data-play]');
  if (p) { // the coaching video, at that moment, right under the point
    const box = p.closest('li').querySelector('[data-video]');
    const key = `${p.dataset.play}@${p.dataset.t}`;
    if (box.dataset.on === key) { box.innerHTML = ''; box.dataset.on = ''; return; } // same moment again: close it
    box.dataset.on = key;
    box.innerHTML = `<iframe class="bk-video" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(p.dataset.play)}?start=${Number(p.dataset.t) || 0}&autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
    return;
  }
  const m = e.target.closest('[data-more]');
  if (m) { $(`[data-list="${m.dataset.more}"]`).innerHTML = listItems[m.dataset.more].map(item).join(''); m.remove(); }
});

(async () => {
  try {
    const res = await fetch('/api/admin/learn', { headers: { 'x-admin-key': password } });
    if (!res.ok) throw new Error(res.status === 401 ? 'Log in on the Admin page first.' : `Error ${res.status}`);
    data = await res.json();
    render();
  } catch (err) { $('[data-progress]').textContent = err.message; }
})();
