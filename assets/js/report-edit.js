// Report builder: coachnavid.com/admin/report?ref=VA0001
import { request } from './api.js';
import { AREAS, DRILLS, KINDS } from '../../shared/report.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const KEY = 'navid-admin-key';
let password = '';
try { password = sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || ''; } catch { /* storage blocked */ }
const ref = (new URLSearchParams(location.search).get('ref') || '').toUpperCase();
const api = (method, path = '', body) => request(`/api/admin/reports/${encodeURIComponent(ref)}${path}`, {
  method, headers: { 'x-admin-key': password }, ...(body ? { body: JSON.stringify(body) } : {}),
});

let report = null;
let files = [];
let dirty = false;

let toastTimer;
function toast(html, ms = 6000) {
  const el = $('[data-toast]');
  el.innerHTML = html;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

const form = () => $('[data-rb]');
const val = (name) => form().elements[name]?.value ?? '';

// ---------- render ----------
function fileOptions(kind, selected) {
  const want = kind === 'video' ? (f) => /^video\//.test(f.mimeType) : (f) => /^(audio|video)\//.test(f.mimeType);
  const list = files.filter(want);
  return `<option value="">${list.length ? '— choose —' : '— no files yet —'}</option>` +
    list.map((f) => `<option value="${esc(f.id)}" ${f.id === selected ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
}

const drillOptions = (selected) => `<option value="">Pick from your drill library…</option>` +
  AREAS.map((a) => `<optgroup label="${esc(a.en)}">${DRILLS.filter((d) => d.area === a.id)
    .map((d) => `<option ${d.name === selected ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</optgroup>`).join('');

function renderKind() {
  const kind = val('kind') || report.kind;
  const spec = KINDS[kind];
  $('[data-scores-box]').hidden = !spec.scores;
  $('[data-weeks-box]').hidden = !spec.weeks;
  $('[data-items-title]').textContent = kind === 'match' ? 'Top 3 fixes' : '3 key errors';
  $('[data-media-title]').textContent = kind === 'match' ? 'Voice-over video (≈10 min on their key moments)' : 'Voice note';

  const items = Array.from({ length: spec.items }, (_, i) => report.items[i] ?? {});
  $('[data-items]').innerHTML = items.map((it, i) => `
    <fieldset class="rb__item" data-item="${i}">
      <legend>${i + 1}</legend>
      <div class="rb__row">
        <label class="field rb__time">Time <input data-k="time" value="${esc(it.time)}" placeholder="3:12" /></label>
        <label class="field">${kind === 'match' ? 'Fix' : 'Error'} <input data-k="title" value="${esc(it.title)}" placeholder="e.g. Bandeja hit too flat and too early" /></label>
      </div>
      <label class="field">What happens <textarea data-k="detail" rows="2" placeholder="What you see in the clip and why it costs points.">${esc(it.detail)}</textarea></label>
      <label class="field">The fix <textarea data-k="fix" rows="2" placeholder="Your cue — how to do it right.">${esc(it.fix)}</textarea></label>
      <div class="rb__row">
        <label class="field">Drill <select data-drill>${drillOptions(it.drillName)}</select></label>
        <label class="field">Drill name <input data-k="drillName" value="${esc(it.drillName)}" /></label>
      </div>
      <label class="field">How to do the drill <textarea data-k="drillHow" rows="2">${esc(it.drillHow)}</textarea></label>
    </fieldset>`).join('');

  $('[data-scores]').innerHTML = AREAS.map((a) => {
    const s = report.scores?.[a.id] ?? {};
    return `<div class="rb__score" data-area="${a.id}">
      <span>${esc(a.en)}</span>
      <input type="number" min="1" max="10" data-score value="${esc(s.score ?? '')}" aria-label="${esc(a.en)} score" />
      <input data-note value="${esc(s.note ?? '')}" placeholder="One line, e.g. solid cross-court, rushes the lob" />
    </div>`;
  }).join('');

  const weeks = Array.from({ length: spec.weeks }, (_, i) => report.weeks[i] ?? {});
  $('[data-weeks]').innerHTML = weeks.map((w, i) => `
    <div class="rb__item" data-week="${i}">
      <label class="field">Week ${i + 1} focus <input data-k="focus" value="${esc(w.focus)}" placeholder="e.g. Bandeja depth" /></label>
      <label class="field">Sessions <textarea data-k="plan" rows="3" placeholder="e.g. 2 × 45 min: Bandeja shadow + feed, then 20 min points where bandejas must land deep.">${esc(w.plan)}</textarea></label>
    </div>`).join('');
}

function renderFiles() {
  $('[name=videoFileId]').innerHTML = fileOptions('video', report.videoFileId);
  $('[name=mediaFileId]').innerHTML = fileOptions('media', report.mediaFileId);
}

function render(data) {
  report = data.report;
  files = data.files;
  const u = data.upload;
  $('[data-ref]').textContent = report.ref;
  $('[data-student]').textContent = `${report.student.firstName} ${report.student.lastName}`;
  $('[data-meta]').textContent = `${u.planName} · ${u.phone} · ${report.status === 'published' ? `published ${new Date(report.publishedAt).toLocaleDateString('en-GB')}` : 'draft'}`;
  $('[data-student-notes]').hidden = !u.notes;
  $('[data-student-notes]').textContent = `📝 Student asked: ${u.notes}`;
  $('[data-folder]').href = `https://drive.google.com/drive/folders/${report.folderId}`;
  $('[data-preview]').href = `/report/${report.token}`;
  $('[data-publish]').textContent = report.status === 'published' ? 'Update & send again ↗' : 'Publish & send ↗';
  for (const k of ['kind', 'lang', 'headline', 'summary', 'strengths', 'closing']) form().elements[k].value = report[k] ?? '';
  renderFiles();
  renderKind();
  form().hidden = false;
  $('[data-status]').hidden = true;
}

// ---------- collect ----------
function collect() {
  const items = [...document.querySelectorAll('[data-item]')].map((el) =>
    Object.fromEntries([...el.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value])));
  const weeks = [...document.querySelectorAll('[data-week]')].map((el) =>
    Object.fromEntries([...el.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value])));
  const scores = Object.fromEntries([...document.querySelectorAll('[data-area]')].map((el) =>
    [el.dataset.area, { score: el.querySelector('[data-score]').value, note: el.querySelector('[data-note]').value }]));
  return {
    kind: val('kind'), lang: val('lang'), headline: val('headline'), summary: val('summary'),
    strengths: val('strengths'), closing: val('closing'), videoFileId: val('videoFileId'), mediaFileId: val('mediaFileId'),
    items, weeks, scores,
  };
}

async function save() {
  const r = await api('PUT', '', collect());
  report = r.report;
  dirty = false;
  $('[data-saved]').textContent = `Saved ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

// ---------- events ----------
form().addEventListener('input', () => { dirty = true; $('[data-saved]').textContent = 'Unsaved changes'; });
form().addEventListener('change', (e) => {
  if (e.target.name === 'kind') {
    report = { ...report, ...collect() }; // keep what's typed while switching
    renderKind();
  }
  if (e.target.matches('[data-drill]')) {
    const d = DRILLS.find((x) => x.name === e.target.value);
    const box = e.target.closest('[data-item]');
    if (d) { box.querySelector('[data-k=drillName]').value = d.name; box.querySelector('[data-k=drillHow]').value = d.how; }
  }
});
form().addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await save(); toast('Draft saved ✅'); } catch (err) { toast(esc(err.message)); }
});
$('[data-preview]').addEventListener('click', async () => { if (dirty) await save().catch(() => {}); });
$('[data-reload]').addEventListener('click', async () => {
  try {
    report = { ...report, ...collect() };
    const data = await api('GET');
    files = data.files;
    renderFiles();
    toast(`${files.length} file${files.length === 1 ? '' : 's'} in the folder`);
  } catch (err) { toast(esc(err.message)); }
});
$('[data-publish]').addEventListener('click', async () => {
  if (!confirm('Publish this report? The student’s Drive folder will be shared (view only) so the videos play on the report page.')) return;
  const win = window.open('about:blank', '_blank'); // before the await, so pop-up blockers allow it
  try {
    const r = await api('POST', '/publish', collect());
    report = r.report;
    dirty = false;
    if (win) win.location.href = r.whatsapp; else location.href = r.whatsapp;
    toast(`Published ✅ <a href="${esc(r.url)}" target="_blank" rel="noopener">Open report ↗</a> — the WhatsApp message is ready to send.`, 12000);
    $('[data-publish]').textContent = 'Update & send again ↗';
  } catch (err) { win?.close(); toast(esc(err.message)); }
});
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------- boot ----------
if (!password) location.href = '/admin';
else if (!ref) $('[data-status]').textContent = 'No upload selected — open a report from the admin page.';
else api('GET').then(render).catch((err) => { $('[data-status]').textContent = err.message; });
