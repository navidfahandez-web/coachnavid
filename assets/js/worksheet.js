// Worksheet: every merged coaching point in one table. Navid writes the cue in his words, picks the level
// where it starts, and keeps (✓) or rejects (✕) it. Each change saves at once to /api/admin/learn/point,
// which passes the decision and levels on to every tip inside the point.
import { AREAS, LEVELS, SHOTS } from '../../shared/report.js';

const $ = (s, el = document) => el.querySelector(s);
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
const FIT = { warmup: 'Warm-up', mobility: 'Mobility', injury_prevention: 'Injury prevention', strength: 'Strength', power: 'Power', speed_agility: 'Speed & agility', endurance: 'Endurance', recovery: 'Recovery' };
const techName = (t) => (t.startsWith('fit:') ? `Fitness: ${FIT[t.slice(4)] ?? t.slice(4)}` : t.startsWith('area:') ? `${AREAS.find((a) => a.id === t.slice(5))?.en ?? t.slice(5)} (general)` : SHOTS.find((x) => x.id === t)?.en ?? t);
const ORDER = [...SHOTS.map((x) => x.id), ...AREAS.map((a) => `area:${a.id}`), ...Object.keys(FIT).map((k) => `fit:${k}`)];
const rank = (t) => { const i = ORDER.indexOf(t); return i < 0 ? 999 : i; };
const lvLabel = (ls) => { const v = (ls ?? []).filter((n) => n >= 1); if (!v.length) return '?'; const l = (n) => LEVELS.find((x) => x.n === n)?.label ?? n; return v.length === 1 ? l(v[0]) : `${l(v[0])}–${l(v.at(-1))}`; };

let rows = []; // { id, tech, fix, mistake, why, status, start, levels, vids, tips, first }
let shown = 120;
const PAGE = 120;
let multiOnly = true;
let hideDone = false;
try { multiOnly = localStorage.getItem('ws-multi') !== '0'; hideDone = localStorage.getItem('ws-hide-done') === '1'; } catch { /* blocked */ }
$('[data-multi]').checked = multiOnly;
$('[data-hide-done]').checked = hideDone;

function build(data) {
  const mem = new Map();
  for (const c of data.candidates) if (c.point) { if (!mem.has(c.point)) mem.set(c.point, []); mem.get(c.point).push(c); }
  rows = data.points.filter((p) => mem.has(p.id)).map((p) => {
    const ms = mem.get(p.id);
    const n = new Map();
    for (const m of ms) for (const l of m.levels ?? []) if (l >= 1) n.set(l, (n.get(l) ?? 0) + 1);
    const ai = p.levels?.length ? p.levels : [...n].filter(([, k]) => k >= ms.length / 3).map(([l]) => l).sort((a, b) => a - b);
    return { ...p, levels: ai, vids: new Set(ms.map((m) => m.source)).size, tips: ms.length, first: ms[0] };
  }).sort((a, b) => rank(a.tech) - rank(b.tech) || b.vids - a.vids || (a.levels[0] ?? 99) - (b.levels[0] ?? 99));
  const techs = [...new Set(rows.map((r) => r.tech))].sort((a, b) => rank(a) - rank(b));
  $('[data-topic]').innerHTML = `<option value="">All topics</option>${AREAS.map((A) => {
    const ts = techs.filter((t) => t === `area:${A.id}` || SHOTS.find((x) => x.id === t)?.area === A.id);
    return ts.length ? `<optgroup label="${esc(A.en)}">${ts.map((t) => `<option value="${esc(t)}">${esc(techName(t))} (${rows.filter((r) => r.tech === t).length})</option>`).join('')}</optgroup>` : '';
  }).join('')}<optgroup label="Fitness">${techs.filter((t) => t.startsWith('fit:')).map((t) => `<option value="${esc(t)}">${esc(techName(t))} (${rows.filter((r) => r.tech === t).length})</option>`).join('')}</optgroup>`;
}

const filtered = () => {
  const topic = $('[data-topic]').value;
  const q = $('[data-search]').value.trim().toLowerCase();
  return rows.filter((r) => (!topic || r.tech === topic) && (!multiOnly || r.vids >= 2) && (!hideDone || r.status === 'pending')
    && (!q || `${r.fix} ${r.mistake} ${r.why}`.toLowerCase().includes(q)));
};

const row = (r) => `
  <article class="ws__row is-${esc(r.status)}" data-id="${esc(r.id)}">
    <div class="ws__topic"><b>${esc(techName(r.tech))}</b>
      <small>said in ${r.vids} video${r.vids === 1 ? '' : 's'}${r.tips > r.vids ? ` · ${r.tips} tips` : ''} · AI: ${esc(lvLabel(r.levels))}</small>
      <a href="https://www.youtube.com/watch?v=${esc(r.first.source)}&t=${toSec(r.first.time)}s" target="_blank" rel="noopener">▶ watch</a></div>
    <label class="ws__cell"><span>Mistake</span><textarea rows="3" data-f="mistake">${esc(r.mistake)}</textarea></label>
    <label class="ws__cell"><span>Cue</span><textarea rows="3" data-f="fix">${esc(r.fix)}</textarea>${r.why ? `<small>${esc(r.why)}</small>` : ''}</label>
    <label class="ws__cell ws__start"><span>Starts at</span><select data-start><option value="">—</option>${LEVELS.map((l) => `<option value="${l.n}"${r.start === l.n ? ' selected' : ''}>${l.n} · ${l.label}</option>`).join('')}</select></label>
    <div class="ws__keep">
      <button type="button" class="ws__yes${r.status === 'approved' ? ' is-on' : ''}" data-set="approved" title="Keep">✓</button>
      <button type="button" class="ws__no${r.status === 'rejected' ? ' is-on' : ''}" data-set="rejected" title="Reject">✕</button>
      <span class="ws__saved" data-saved></span>
    </div>
  </article>`;

function render() {
  const list = filtered();
  const done = rows.filter((r) => r.status !== 'pending');
  $('[data-count]').textContent = `${list.length} points shown · you have done ${done.length} of ${rows.length} (${done.filter((r) => r.status === 'approved').length} kept, ${done.filter((r) => r.status === 'rejected').length} rejected)`;
  $('[data-rows]').innerHTML = list.slice(0, shown).map(row).join('') || '<p class="note">Nothing here.</p>';
  $('[data-more]').hidden = list.length <= shown;
  $('[data-more]').textContent = `Show more (${list.length - shown} left)`;
}

async function save(el, body) {
  const box = el.closest('[data-id]');
  const id = box.dataset.id;
  const mark = $('[data-saved]', box);
  mark.textContent = '…';
  try {
    const { point } = await api('/api/admin/learn/point', { id, ...body });
    const r = rows.find((x) => x.id === id);
    Object.assign(r, { fix: point.fix, mistake: point.mistake, status: point.status, start: point.start, levels: point.levels?.length ? point.levels : r.levels });
    box.className = `ws__row is-${point.status}`;
    $('.ws__yes', box).classList.toggle('is-on', point.status === 'approved');
    $('.ws__no', box).classList.toggle('is-on', point.status === 'rejected');
    $('small', $('.ws__topic', box)).textContent = `said in ${r.vids} video${r.vids === 1 ? '' : 's'}${r.tips > r.vids ? ` · ${r.tips} tips` : ''} · ${r.start ? 'you' : 'AI'}: ${lvLabel(r.levels)}`;
    mark.textContent = 'saved ✓';
    setTimeout(() => { if (mark.textContent === 'saved ✓') mark.textContent = ''; }, 2000);
    const done = rows.filter((x) => x.status !== 'pending');
    $('[data-count]').textContent = $('[data-count]').textContent.replace(/you have done .*$/, `you have done ${done.length} of ${rows.length} (${done.filter((x) => x.status === 'approved').length} kept, ${done.filter((x) => x.status === 'rejected').length} rejected)`);
  } catch (err) { mark.textContent = `not saved: ${err.message}`; }
}

$('[data-rows]').addEventListener('change', (e) => {
  if (e.target.matches('[data-f]')) {
    const r = rows.find((x) => x.id === e.target.closest('[data-id]').dataset.id);
    if (e.target.value.trim() !== String(r[e.target.dataset.f] ?? '').trim()) save(e.target, { [e.target.dataset.f]: e.target.value });
  }
  if (e.target.matches('[data-start]') && e.target.value) save(e.target, { start: Number(e.target.value) });
});
$('[data-rows]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-set]');
  if (!b) return;
  const r = rows.find((x) => x.id === b.closest('[data-id]').dataset.id);
  save(b, { status: r.status === b.dataset.set ? 'pending' : b.dataset.set }); // tap again to undo
});
for (const sel of ['[data-topic]', '[data-search]']) $(sel).addEventListener('input', () => { shown = PAGE; render(); });
$('[data-multi]').addEventListener('change', (e) => { multiOnly = e.target.checked; try { localStorage.setItem('ws-multi', multiOnly ? '1' : '0'); } catch { /* blocked */ } shown = PAGE; render(); });
$('[data-hide-done]').addEventListener('change', (e) => { hideDone = e.target.checked; try { localStorage.setItem('ws-hide-done', hideDone ? '1' : '0'); } catch { /* blocked */ } shown = PAGE; render(); });
$('[data-more]').addEventListener('click', () => { shown += PAGE; render(); });

(async () => {
  try { build(await api('/api/admin/learn')); render(); } catch (err) { $('[data-count]').textContent = err.message === 'Wrong password.' ? 'Log in on the Admin page first.' : err.message; }
})();
