// Coaching guide: approve / edit / reject the teaching points the AI found in coaching videos,
// one technique at a time, with Navid's own notes on top of each technique.
import { AREAS, LEVELS, SHOTS } from '../../shared/report.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
let password = '';
try { password = sessionStorage.getItem('navid-admin-key') || localStorage.getItem('navid-admin-key') || ''; } catch { /* blocked */ }
const api = async (path, body) => {
  const res = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-admin-key': password }, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Error ${res.status}`);
  return out;
};
const toSec = (t) => String(t ?? '').split(':').map(Number).reduce((a, b) => a * 60 + b, 0) || 0;
let data = { sources: [], candidates: [], notes: {}, queued: 0, goals: [], levelsStatus: {}, points: [], shotLevels: {} };
// Merged points: one card per idea ("said in N videos"); tips not merged yet are shown on their own.
let members = new Map(); // point id → its tips
const ptLevels = (p) => { // Navid's levels, else the levels at least a third of its tips share
  if (p.levels?.length) return p.levels;
  const n = new Map();
  const ms = members.get(p.id) ?? [];
  for (const c of ms) for (const l of c.levels ?? []) if (l >= 1) n.set(l, (n.get(l) ?? 0) + 1);
  const top = [...n].filter(([, k]) => k >= ms.length / 3).map(([l]) => l);
  return (top.length ? top : [...n.keys()]).sort((a, b) => a - b);
};
const units = () => { // points (with their tips) + tips not merged yet
  members = new Map();
  for (const c of data.candidates) if (c.point) { if (!members.has(c.point)) members.set(c.point, []); members.get(c.point).push(c); }
  const pts = data.points.filter((p) => members.has(p.id)).map((p) => ({ ...p, isPoint: true, members: members.get(p.id), levels: ptLevels(p), shot: p.tech, type: members.get(p.id)[0].type }));
  const known = new Set(data.points.map((p) => p.id));
  return [...pts, ...data.candidates.filter((c) => !c.point || !known.has(c.point))];
};
const share = (u, f) => (u.isPoint ? u.members.filter(f).length >= u.members.length / 2 : f(u));
let level = '';
const inLevel = (c) => !level || (c.levels ?? []).includes(Number(level));
$('[data-level]').innerHTML += LEVELS.map((l) => `<option value="${l.n}">${l.n} · ${l.label}</option>`).join('');
let tab = 'pending';
let tech = '';
const TR = { 'tr:forced': '🔄 Forced transitions (all shots)', 'tr:wanted': '🔄 Wanted transitions (all shots)', 'tm:earn': '⏱ Earning time (all shots)', 'tm:remove': '⏱ Removing time (all shots)', 'fu:timing': '🎯 Timing (all shots)', 'fu:contact': '🎯 Contact point / sweet spot (all shots)', 'fu:deception': '🎭 Changing timing to hide the shot (all shots)' };
const inTech = (c, t) => (t.startsWith('tr:') ? share(c, (m) => m.transition === t.slice(3)) : t.startsWith('tm:') ? share(c, (m) => m.time_tag === t.slice(3)) : t.startsWith('fu:') ? share(c, (m) => m.fundamental === t.slice(3)) : techOf(c) === t);
const techOf = (c) => (c.isPoint ? c.tech : c.shot && c.shot !== 'general' ? c.shot : `area:${c.area}`);
const FIT = { injury_prevention: 'Injury prevention', strength: 'Strength', power: 'Power', speed_agility: 'Speed & agility', endurance: 'Endurance', mobility: 'Mobility', warmup: 'Warm-up', recovery: 'Recovery' };
const techName = (t) => (TR[t] ? TR[t] : t.startsWith('fit:') ? `💪 Fitness — ${FIT[t.slice(4)] ?? t.slice(4)}` : t.startsWith('area:') ? `${AREAS.find((a) => a.id === t.slice(5))?.en ?? t.slice(5)} — general` : SHOTS.find((x) => x.id === t)?.en ?? t);
const ORDER = ['tr:forced', 'tr:wanted', 'tm:earn', 'tm:remove', 'fu:timing', 'fu:contact', 'fu:deception', ...SHOTS.map((x) => x.id), ...AREAS.map((a) => `area:${a.id}`), ...Object.keys(FIT).map((k) => `fit:${k}`)];

function render() {
  const all = units();
  for (const s of ['pending', 'approved', 'rejected']) $(`[data-count="${s}"]`).textContent = all.filter((c) => c.status === s).length;
  // technique picker: every technique with points, "(n to review)"
  const pool = all.filter(inLevel);
  const techs = [...Object.keys(TR).filter((t) => pool.some((c) => inTech(c, t))), ...new Set(pool.map(techOf))].sort((a, b) => (ORDER.indexOf(a) + 999 * (ORDER.indexOf(a) < 0)) - (ORDER.indexOf(b) + 999 * (ORDER.indexOf(b) < 0)));
  if (!tech || !techs.includes(tech)) tech = techs[0] ?? '';
  $('[data-tech]').innerHTML = techs.map((t) => {
    const n = pool.filter((c) => inTech(c, t) && c.status === tab).length;
    return `<option value="${esc(t)}"${t === tech ? ' selected' : ''}>${esc(techName(t))} (${n})${data.notes[t] ? ' 📝' : ''}</option>`;
  }).join('');
  $('[data-notes-box]').hidden = !tech;
  $('[data-tech-name]').textContent = tech ? techName(tech) : '';
  if (document.activeElement !== $('[data-tech-notes]')) $('[data-tech-notes]').value = data.notes[tech] ?? '';
  const shown = pool.filter((c) => c.status === tab && inTech(c, tech));
  // level goals
  $('[data-goals-box]').hidden = !level;
  if (level) {
    const L = LEVELS.find((l) => l.n === Number(level));
    $('[data-goal-level]').textContent = `${L.n} · ${L.label}`;
    const gs = data.goals.filter((g) => g.level === L.n).sort((a, b) => (a.status === 'rejected') - (b.status === 'rejected') || String(a.area).localeCompare(String(b.area)));
    $('[data-goals]').innerHTML = gs.length ? gs.map((g) => `
      <div class="lg__goal is-${esc(g.status)}" data-goal-id="${esc(g.id)}">
        <span class="note">${esc(AREAS.find((a) => a.id === g.area)?.en ?? g.area)}</span>
        <input data-goal-text value="${esc(g.goal)}" />
        ${g.status !== 'approved' ? '<button class="btn btn--lime" type="button" data-goal-set="approved">✓</button>' : ''}
        ${g.status !== 'rejected' ? '<button class="btn btn--ghost" type="button" data-goal-set="rejected">✕</button>' : '<button class="btn btn--ghost" type="button" data-goal-set="pending">↺</button>'}
      </div>`).join('') : '<p class="note">No goals for this level yet.</p>';
  }
  const ls = data.levelsStatus ?? {};
  const noLv = data.candidates.filter((c) => !(c.levels ?? []).length).length;
  const unmerged = data.candidates.filter((c) => !c.point && c.status !== 'rejected').length;
  $('[data-levels-status]').textContent = ls.step ? `⏳ ${ls.step}` : ls.error ? `Sorting stopped: ${ls.error} (it retries by itself every 5 minutes)` : unmerged ? `${unmerged} tips not merged yet.` : noLv ? `${noLv} tips not sorted by level yet.` : '';
  $('[data-status]').textContent = shown.length ? `${shown.length} point${shown.length === 1 ? '' : 's'} (${shown.reduce((n, u) => n + (u.isPoint ? u.members.length : 1), 0)} tips)` : (tab === 'pending' ? 'Nothing left to review 🎉' : 'None yet.');
    const pts = shown.filter((u) => u.isPoint).sort((a, b) => b.members.length - a.members.length);
  const singles = shown.filter((u) => !u.isPoint);
  const lvButtons = (c) => `<div class="lg__lv" title="Levels this is for — click to change">${LEVELS.map((l) => `<button type="button" data-lv="${l.n}" class="${(c.levels ?? []).includes(l.n) ? 'is-on' : ''}">${l.label}</button>`).join('')}</div>`;
  const actions = (c) => `<div class="lg__actions">
          ${c.status !== 'approved' ? `<button class="btn btn--lime" type="button" data-set="approved">✓ Approve${c.isPoint && c.members.length > 1 ? ` (all ${c.members.length})` : ''}</button>` : ''}
          ${c.status !== 'rejected' ? '<button class="btn btn--ghost" type="button" data-set="rejected">✕ Reject</button>' : ''}
          ${c.status !== 'pending' ? '<button class="btn btn--ghost" type="button" data-set="pending">↺ Back to review</button>' : ''}
        </div>`;
  const nmlWarn = (txt) => (/no[\s-]*man'?s[\s-]*land|tierra de nadie/i.test(txt) ? '<p class="lg__warn">⚠️ Uses “no man’s land” — in your method this is the transition area (OK to stand there when the previous ball allows it). Edit or reject.</p>' : '');
  const srcTitle = (id, fallback) => data.sources.find((x) => x.videoId === id)?.title || fallback || id;
  const pointCard = (p) => {
    const vids = new Set(p.members.map((m) => m.source)).size;
    return `
      <article class="lg__card lg__point" data-point="${esc(p.id)}">
        <div class="lg__meta"><span class="lg__said">said in ${vids} video${vids === 1 ? '' : 's'}</span>${p.members.length > vids ? `<span>${p.members.length} tips</span>` : ''}</div>
        ${nmlWarn(`${p.mistake} ${p.fix} ${p.why}`)}
        ${p.mistake ? `<p><b>Mistake:</b> ${esc(p.mistake)}</p>` : ''}
        <label>${p.type === 'fitness' ? 'Exercise (edit into your own words)' : 'Cue (edit into your own words)'}<textarea rows="2" data-fix>${esc(p.fix)}</textarea></label>
        ${p.why ? `<p class="note">${esc(p.why)}</p>` : ''}
        <details class="lg__members"><summary>The ${p.members.length} original tip${p.members.length === 1 ? '' : 's'} and video moments</summary>
          <ul>${p.members.map((m) => `<li><a href="https://www.youtube.com/watch?v=${esc(m.source)}&t=${toSec(m.time)}s" target="_blank" rel="noopener">▶ ${esc(m.time)}</a> <small>${esc(srcTitle(m.source, m.sourceTitle))}</small><br>${esc(m.type === 'fitness' ? `${m.exercise}: ${m.fix}` : m.fix)}</li>`).join('')}</ul>
        </details>
        ${lvButtons(p)}
        ${actions(p)}
      </article>`;
  };
  const bySource = new Map();
  for (const c of singles) { if (!bySource.has(c.source)) bySource.set(c.source, []); bySource.get(c.source).push(c); }
  $('[data-list]').innerHTML = (pts.length ? `<h4 class="lg__src">Merged points<small>Near-identical tips from different videos, merged into one. Approving a point approves every tip in it.</small></h4>${pts.map(pointCard).join('')}` : '')
    + (singles.length && pts.length ? '<h4 class="lg__src">Not merged yet<small>The merging job is still working on these.</small></h4>' : '')
    + [...bySource].map(([src, items]) => {
    const s = data.sources.find((x) => x.videoId === src) ?? {};
    return `<h4 class="lg__src">${esc(s.title || items[0].sourceTitle || src)}<small>${esc(s.about || '')}</small></h4>${items.map((c) => `
      <article class="lg__card" data-id="${esc(c.id)}">
        <div class="lg__meta"><span>${esc(c.kind)}</span><span>${esc(c.area)}${c.shot && c.shot !== 'general' ? ` · ${esc(c.shot)}` : ''}</span>
          <a href="https://www.youtube.com/watch?v=${esc(src)}&t=${toSec(c.time)}s" target="_blank" rel="noopener">▶ ${esc(c.time)}</a></div>
        ${nmlWarn(`${c.mistake} ${c.fix} ${c.why}`)}
        ${c.type === 'fitness' ? `<p><b>${esc(c.exercise)}</b> · ${esc(c.where)}${c.equipment ? ` · ${esc(c.equipment)}` : ''}${c.dose ? ` · ${esc(c.dose)}` : ''}</p><p class="note">${esc(c.body_part)}${c.caution ? ` — ⚠️ ${esc(c.caution)}` : ''}</p>`
          : c.mistake ? `<p><b>Mistake:</b> ${esc(c.mistake)}</p>` : ''}
        <label>${c.type === 'fitness' ? 'How to do it (edit into your own words)' : 'Cue (edit into your own words)'}<textarea rows="2" data-fix>${esc(c.fix)}</textarea></label>
        <p class="note">${esc(c.why)}</p>
        ${lvButtons(c)}
        ${actions(c)}
      </article>`).join('')}`;
  }).join('');
  const noCredits = data.sources.some((s) => s.status === 'waiting');
  $('[data-credits]').hidden = !noCredits;
  const running = data.sources.filter((s) => s.status === 'running').length;
  const watched = data.sources.filter((s) => s.status === 'ready').length;
  $('[data-status]').textContent += ` · ${watched} videos watched${running ? `, ${running} being watched now` : ''}${data.queued ? `, ${data.queued} in the queue` : ''}`;
  $('[data-sources]').innerHTML = data.sources.map((s) => `<li>${esc(s.title || s.videoId)} — ${s.status === 'ready' ? `${s.found} points` : esc(s.status)}${s.error ? ` (${esc(s.error)})` : ''}</li>`).join('');
}

async function load() {
  try { data = await api('/api/admin/learn'); render(); } catch (err) { $('[data-status]').textContent = err.message === 'Wrong password.' ? 'Log in on the Admin page first.' : err.message; }
}

$('[data-tabs]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('is-on', x === b));
  render();
});

$('[data-level]').addEventListener('change', (e) => { level = e.target.value; render(); });

$('[data-goals]').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-goal-set]');
  if (!b) return;
  const row = b.closest('[data-goal-id]');
  try {
    const { goal } = await api('/api/admin/learn/goal', { id: row.dataset.goalId, status: b.dataset.goalSet, goal: row.querySelector('[data-goal-text]').value });
    data.goals = data.goals.map((g) => (g.id === goal.id ? goal : g));
    render();
  } catch (err) { alert(err.message); }
});

$('[data-goal-add]').addEventListener('click', async () => {
  const text = $('[data-goal-new]').value.trim();
  if (!text || !level) return;
  try {
    const { goal } = await api('/api/admin/learn/goal', { add: true, level: Number(level), goal: text, status: 'approved' });
    data.goals.push(goal);
    $('[data-goal-new]').value = '';
    render();
  } catch (err) { alert(err.message); }
});

$('[data-tech]').addEventListener('change', (e) => { tech = e.target.value; render(); window.scrollTo({ top: 0 }); });

$('[data-save-notes]').addEventListener('click', async () => {
  try {
    const { notes } = await api('/api/admin/learn/note', { technique: tech, text: $('[data-tech-notes]').value });
    data.notes = notes;
    $('[data-notes-saved]').textContent = 'Saved ✓';
    setTimeout(() => { $('[data-notes-saved]').textContent = ''; }, 2500);
    render();
  } catch (err) { alert(err.message); }
});

// a merged point: the decision goes to the point and every tip in it
async function savePoint(card, body) {
  const { point, members: ms } = await api('/api/admin/learn/point', { id: card.dataset.point, ...body });
  data.points = data.points.map((x) => (x.id === point.id ? point : x));
  const byId = new Map(ms.map((m) => [m.id, m]));
  data.candidates = data.candidates.map((c) => byId.get(c.id) ?? c);
}

$('[data-list]').addEventListener('click', async (e) => {
  const lv = e.target.closest('[data-lv]');
  if (lv) { // toggle a level on this tip / point
    const n = Number(lv.dataset.lv);
    const toggle = (ls) => ((ls ?? []).filter((x) => x >= 1).includes(n) ? ls.filter((x) => x !== n) : [...(ls ?? []).filter((x) => x >= 1), n]);
    lv.classList.toggle('is-on');
    try {
      const pc = lv.closest('[data-point]');
      if (pc) {
        const u = units().find((x) => x.id === pc.dataset.point);
        await savePoint(pc, { levels: toggle(u.levels) });
      } else {
        const c = data.candidates.find((x) => x.id === lv.closest('[data-id]').dataset.id);
        const { candidate } = await api('/api/admin/learn/review', { id: c.id, status: c.status, levels: toggle(c.levels) });
        data.candidates = data.candidates.map((x) => (x.id === candidate.id ? candidate : x));
      }
    } catch (err) { lv.classList.toggle('is-on'); alert(err.message); }
    return;
  }
  const b = e.target.closest('[data-set]');
  if (!b) return;
  const card = b.closest('[data-point], [data-id]');
  card.classList.add('is-done');
  try {
    if (card.dataset.point) await savePoint(card, { status: b.dataset.set, fix: card.querySelector('[data-fix]').value });
    else {
      const { candidate } = await api('/api/admin/learn/review', { id: card.dataset.id, status: b.dataset.set, fix: card.querySelector('[data-fix]').value });
      data.candidates = data.candidates.map((c) => (c.id === candidate.id ? candidate : c));
    }
    render();
  } catch (err) { card.classList.remove('is-done'); alert(err.message); }
});

$('[data-learn]').addEventListener('click', async () => {
  const videos = $('[data-links]').value.split(/\s+/).filter((u) => /youtu/.test(u)).map((url) => ({ url, title: '' }));
  if (!videos.length) return;
  try { await api('/api/admin/learn', { videos }); $('[data-links]').value = ''; setTimeout(load, 1500); } catch (err) { alert(err.message); }
});

load();
setInterval(() => { if (document.activeElement?.tagName !== 'TEXTAREA' && data.sources.some((s) => s.status === 'running')) load(); }, 30000);
