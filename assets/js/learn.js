// Coaching guide: approve / edit / reject the teaching points the AI found in coaching videos.
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
let data = { sources: [], candidates: [] };
let tab = 'pending';

function render() {
  for (const s of ['pending', 'approved', 'rejected']) $(`[data-count="${s}"]`).textContent = data.candidates.filter((c) => c.status === s).length;
  const shown = data.candidates.filter((c) => c.status === tab);
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
setInterval(() => { if (data.sources.some((s) => s.status === 'running')) load(); }, 15000);
