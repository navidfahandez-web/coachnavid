// GlassWall import: read the PDF in the browser (pdf.js), pull out the match details,
// coach note, focus areas and every number, let Navid check it, save to the player.
import { request } from './api.js';
import { parseGlassWall } from '../../shared/glasswall.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
let password = '';
try { password = sessionStorage.getItem('navid-admin-key') || localStorage.getItem('navid-admin-key') || ''; } catch { /* blocked */ }
const headers = { 'x-admin-key': password };
const form = $('[data-gw]');
let pdfBase64 = null;
let focus = [];

let toastTimer;
function toast(html, ms = 7000) {
  const el = $('[data-toast]');
  el.innerHTML = html;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- PDF → lines of text ----------
async function pdfLines(buffer) {
  const pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const { items } = await (await doc.getPage(p)).getTextContent();
    const rows = [];
    for (const it of items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      let row = rows.find((r) => Math.abs(r.y - y) <= 3);
      if (!row) rows.push(row = { y, parts: [] });
      row.parts.push({ x: it.transform[4], s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) lines.push(r.parts.sort((a, b) => a.x - b.x).map((x) => x.s).join(' ').replace(/\s+/g, ' ').trim());
  }
  return lines;
}

// ---------- render ----------
function metricRow(m = {}) {
  return `<div class="gw__metric" data-metric>
    <input data-k="name" list="metric-names" value="${esc(m.name)}" placeholder="Stat name, e.g. Rallies at the back" />
    <input data-k="value" type="number" step="any" value="${esc(m.value)}" placeholder="57" />
    <input data-k="unit" value="${esc(m.unit)}" placeholder="% / winners" />
    <button class="pill" type="button" data-remove title="Remove">✕</button>
    ${m.source ? `<small>“${esc(m.source)}”</small>` : ''}
  </div>`;
}

function renderFocus() {
  $('[data-focus]').innerHTML = focus.length ? focus.map((f, i) => `
    <fieldset class="rb__item" data-f="${i}">
      <legend>${esc(f.category || 'Focus')}</legend>
      <label class="field">Title <input data-k="title" value="${esc(f.title)}" /></label>
      <label class="field">Finding <textarea data-k="finding" rows="2">${esc(f.finding)}</textarea></label>
      <label class="field">Drills (one per line) <textarea data-k="drills" rows="2">${esc(f.drills.join('\n'))}</textarea></label>
    </fieldset>`).join('') : '<p class="note">No focus areas found.</p>';
}

function fill(parsed) {
  for (const k of ['date', 'time', 'court', 'label', 'partner', 'coachName', 'coachNote']) form.elements[k].value = parsed[k] ?? '';
  $('[data-metrics]').innerHTML = parsed.metrics.map(metricRow).join('');
  focus = parsed.focus;
  renderFocus();
  document.querySelectorAll('[data-details]').forEach((el) => { el.hidden = false; });
}

function collect() {
  const metrics = [...document.querySelectorAll('[data-metric]')].map((el) => ({
    name: el.querySelector('[data-k=name]').value, value: el.querySelector('[data-k=value]').value, unit: el.querySelector('[data-k=unit]').value,
  })).filter((m) => m.name && m.value !== '');
  const f = [...document.querySelectorAll('[data-f]')].map((el, i) => ({
    category: focus[i].category,
    title: el.querySelector('[data-k=title]').value,
    finding: el.querySelector('[data-k=finding]').value,
    drills: el.querySelector('[data-k=drills]').value.split('\n').map((s) => s.trim()).filter(Boolean),
  }));
  const v = (k) => form.elements[k].value;
  return {
    source: 'GlassWall', date: v('date'), time: v('time'), court: v('court'), label: v('label'),
    partner: v('partner'), coachName: v('coachName'), coachNote: v('coachNote'), focus: f, metrics,
  };
}

// ---------- player lookup ----------
async function loadPlayer() {
  const phone = form.elements.phone.value.trim();
  if (phone.replace(/\D/g, '').length < 8) return;
  try {
    const r = await request(`/api/admin/external?phone=${encodeURIComponent(phone)}`, { headers });
    $('[data-player-info]').textContent = r.player ? `✅ ${r.player.firstName} ${r.player.lastName} — already a player` : 'New player — enter their name.';
    if (r.player) {
      if (!form.elements.firstName.value) form.elements.firstName.value = r.player.firstName;
      if (!form.elements.lastName.value) form.elements.lastName.value = r.player.lastName;
      $('[data-player-link]').href = `/player/${r.player.token}`;
      $('[data-player-link]').hidden = false;
    }
    const names = [...new Set(r.entries.flatMap((e) => e.metrics.map((m) => m.name)))];
    $('#metric-names').innerHTML = names.map((n) => `<option value="${esc(n)}">`).join('');
    $('[data-history]').hidden = !r.entries.length;
    $('[data-entries]').innerHTML = [...r.entries].reverse().map((e) => `
      <article class="bk stu">
        <div class="bk__who"><b>${esc(e.source)} · ${esc(e.date)} ${esc(e.time)}</b>
          <small>${esc(e.focus.map((f) => f.title).join(' · '))}</small>
          <small>${esc(e.metrics.map((m) => `${m.name}: ${m.value}${m.unit === '%' ? '%' : ` ${m.unit}`}`).join(' · '))}</small></div>
        <div class="bk__actions" style="grid-column:auto">
          ${e.pdfFileId ? `<a class="btn btn--ghost" href="https://drive.google.com/file/d/${esc(e.pdfFileId)}/view" target="_blank" rel="noopener">PDF ↗</a>` : ''}
          <button class="btn btn--ghost btn--danger" type="button" data-delete="${esc(e.id)}">Delete</button>
        </div>
      </article>`).join('');
  } catch (err) { $('[data-player-info]').textContent = err.message; }
}

// ---------- events ----------
form.elements.phone.addEventListener('change', loadPlayer);
form.elements.pdf.addEventListener('change', async () => {
  const file = form.elements.pdf.files[0];
  if (!file) return;
  $('[data-parse-info]').textContent = 'Reading the PDF…';
  try {
    const buffer = await file.arrayBuffer();
    pdfBase64 = btoa(new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ''));
    const lines = await pdfLines(buffer.slice(0));
    const parsed = parseGlassWall(lines);
    fill(parsed);
    $('[data-parse-info]').textContent = `Found ${parsed.focus.length} focus area${parsed.focus.length === 1 ? '' : 's'} and ${parsed.metrics.length} stat${parsed.metrics.length === 1 ? '' : 's'}. Check them below.`;
  } catch (err) {
    $('[data-parse-info]').textContent = `Couldn’t read this PDF (${err.message}). You can still fill it in by hand.`;
    fill({ metrics: [], focus: [] });
  }
});
$('[data-add-metric]').addEventListener('click', () => $('[data-metrics]').insertAdjacentHTML('beforeend', metricRow()));
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-remove]')) e.target.closest('[data-metric]').remove();
  const del = e.target.closest('[data-delete]');
  if (del && confirm('Delete this GlassWall report from the player’s record?')) {
    await request('/api/admin/external', { method: 'POST', headers, body: JSON.stringify({ phone: form.elements.phone.value, id: del.dataset.delete, action: 'delete' }) }).catch((err) => toast(esc(err.message)));
    loadPlayer();
  }
});
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  $('[data-status]').textContent = 'Saving…';
  try {
    const r = await request('/api/admin/external', {
      method: 'POST', headers,
      body: JSON.stringify({ phone: form.elements.phone.value, firstName: form.elements.firstName.value, lastName: form.elements.lastName.value, entry: collect(), pdfBase64 }),
    });
    toast(`Saved ✅ <a href="/player/${esc(r.playerToken)}" target="_blank" rel="noopener">Open their progress ↗</a>${r.pdfError ? ` — PDF not stored: ${esc(r.pdfError)}` : ''}`, 12000);
    $('[data-status]').textContent = '';
    form.elements.pdf.value = '';
    pdfBase64 = null;
    document.querySelectorAll('[data-details]').forEach((el) => { el.hidden = true; });
    loadPlayer();
  } catch (err) {
    $('[data-status]').textContent = err.message;
  }
  btn.disabled = false;
});

// ---------- boot ----------
if (!password) location.href = '/admin';
const pre = new URLSearchParams(location.search).get('phone');
if (pre) { form.elements.phone.value = pre; loadPlayer(); }
