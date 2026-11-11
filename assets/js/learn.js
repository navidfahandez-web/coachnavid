// Coaching guide: approve / edit / reject the teaching points the AI found in coaching videos,
// one technique at a time, with Navid's own notes on top of each technique.
import { AREAS, SHOTS } from '../../shared/report.js';

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
let data = { sources: [], candidates: [], notes: {}, queued: 0 };
let tab = 'pending';
let tech = '';
const techOf = (c) => (c.shot && c.shot !== 'general' ? c.shot : `area:${c.area}`);
const techName = (t) => (t.startsWith('area:') ? `${AREAS.find((a) => a.id === t.slice(5))?.en ?? t.slice(5)} — general` : SHOTS.find((x) => x.id === t)?.en ?? t);
const ORDER = [...SHOTS.map((x) => x.id), ...AREAS.map((a) => `area:${a.id}`)];

function render() {
  for (const s of ['pending', 'approved', 'rejected']) $(`[data-count="${s}"]`).textContent = data.candidates.filter((c) => c.status === s).length;
  // technique picker: every technique with points, "(n to review)"
  const techs = [...new Set(data.candidates.map(techOf))].sort((a, b) => (ORDER.indexOf(a) + 999 * (ORDER.indexOf(a) < 0)) - (ORDER.indexOf(b) + 999 * (ORDER.indexOf(b) < 0)));
  if (!tech || !techs.includes(tech)) tech = techs[0] ?? '';
  $('[data-tech]').innerHTML = techs.map((t) => {
    const n = data.candidates.filter((c) => techOf(c) === t && c.status === tab).length;
    return `<option value="${esc(t)}"${t === tech ? ' selected' : ''}>${esc(techName(t))} (${n})${data.notes[t] ? ' 📝' : ''}</option>`;
  }).join('');
  $('[data-notes-box]').hidden = !tech;
  $('[data-tech-name]').textContent = tech ? techName(tech) : '';
  if (document.activeElement !== $('[data-tech-notes]')) $('[data-tech-notes]').value = data.notes[tech] ?? '';
  const shown = data.candidates.filter((c) => c.status === tab && techOf(c) === tech);
  $('[data-status]').textContent = shown.length ? `${shown.length} point${shown.length === 1 ? '' : 's'}` : (tab === 'pending' ? 'Nothing left to review 🎉' : 'None yet.');
  const bySource = new Map();
  for (const c of shown) { if (!bySource.has(c.source)) bySource.set(c.source, []); bySource.get(c.source).push(c); }
  $('[data-list]').innerHTML = [...bySource].map(([src, items]) => {
    const s = data.sources.find((x) => x.videoId === src) ?? {};
    return `<h4 class="lg__src">${esc(s.title || items[0].sourceTitle || src)}<small>${esc(s.about || '')}</small></h4>${items.map((c) => `
      <article class="lg__card" data-id="${esc(c.id)}">
        <div class="lg__meta"><span>${esc(c.kind)}</span><span>${esc(c.area)}${c.shot && c.shot !== 'general' ? ` · ${esc(c.shot)}` : ''}</span>
          <a href="https://www.youtube.com/watch?v=${esc(src)}&t=${toSec(c.time)}s" target="_blank" rel="noopener">▶ ${esc(c.time)}</a></div>
        ${c.mistake ? `<p><b>Mistake:</b> ${esc(c.mistake)}</p>` : ''}
        <label>Cue (edit into your own words)<textarea rows="2" data-fix>${esc(c.fix)}</textarea></label>
        <p class="note">${esc(c.why)}</p>
        <div class="lg__actions">
          ${c.status !== 'approved' ? '<button class="btn btn--lime" type="button" data-set="approved">✓ Approve</button>' : ''}
          ${c.status !== 'rejected' ? '<button class="btn btn--ghost" type="button" data-set="rejected">✕ Reject</button>' : ''}
          ${c.status !== 'pending' ? '<button class="btn btn--ghost" type="button" data-set="pending">↺ Back to review</button>' : ''}
        </div>
      </article>`).join('')}`;
  }).join('');
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

$('[data-list]').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-set]');
  if (!b) return;
  const card = b.closest('[data-id]');
  card.classList.add('is-done');
  try {
    const { candidate } = await api('/api/admin/learn/review', { id: card.dataset.id, status: b.dataset.set, fix: card.querySelector('[data-fix]').value });
    data.candidates = data.candidates.map((c) => (c.id === candidate.id ? candidate : c));
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
