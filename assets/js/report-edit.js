// Report builder: coachnavid.com/admin/report?ref=VA0001
import { request } from './api.js';
import { AREAS, DRILLS, KINDS, areaScore } from '../../shared/report.js';

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
        <label class="field rb__time" title="Where the clip of this fix starts. Empty = 1 second before the time.">Clip from <input data-k="clipStart" value="${esc(it.clipStart ?? '')}" placeholder="auto" /></label>
        <label class="field rb__time" title="Seconds shown at normal speed (then repeated in slow motion)">Clip secs <input data-k="clipLen" type="number" min="1" max="8" step="0.5" value="${esc(it.clipLen ?? '')}" placeholder="2.4" /></label>
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
    const shots = s.shots ?? {};
    const scored = a.shots.filter((x) => shots[x.id]?.score).length;
    const manual = s.manual === false ? '' : (s.score ?? ''); // older reports: score was always typed
    return `<div class="rb__area" data-area="${a.id}">
      <div class="rb__score">
        <span>${esc(a.en)}</span>
        <input type="number" min="1" max="10" step="1" data-score value="${esc(manual)}" placeholder="${esc(areaScore({ shots }) ?? '–')}" aria-label="${esc(a.en)} score" title="Leave empty to use the average of the shots" />
        <input data-note value="${esc(s.note ?? '')}" placeholder="One line, e.g. solid cross-court, rushes the lob" />
      </div>
      <details class="rb__shots" ${scored ? 'open' : ''}>
        <summary>Shots <small data-shot-count>${scored ? `${scored} scored` : 'score only what you saw'}</small></summary>
        ${a.shots.map((x) => `<div class="rb__shot" data-shot="${x.id}">
          <span>${esc(x.en)}</span>
          <input type="number" min="1" max="10" step="1" data-shot-score value="${esc(shots[x.id]?.score ?? '')}" aria-label="${esc(x.en)} score" />
          <input data-shot-note value="${esc(shots[x.id]?.note ?? '')}" placeholder="Note (optional)" />
        </div>`).join('')}
      </details>
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

// ---------- fix clips (normal speed + slow motion, for the voice-over) ----------
let clipsTimer = null;
function renderClips() {
  const c = report.clips ?? {};
  const btn = $('[data-clips-run]');
  btn.disabled = c.status === 'running';
  btn.textContent = c.status === 'running' ? 'Cutting…' : c.status === 'ready' ? 'Make the clip again' : 'Make 20 s clip';
  const link = $('[data-clips-open]');
  link.hidden = c.status !== 'ready';
  if (c.fileId) link.href = `https://drive.google.com/file/d/${c.fileId}/view`;
  // players: the clip, and the student's full video to check the timestamps against
  const setPlayer = (sel, id) => {
    const fig = $(sel);
    fig.hidden = !id;
    const frame = fig.querySelector('iframe');
    const src = id ? `https://drive.google.com/file/d/${id}/preview` : '';
    if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
  };
  setPlayer('[data-clips-player]', c.status === 'ready' ? (c.voiceFileId || c.fileId) : null);
  $('[data-clips-player] figcaption').textContent = c.voiceFileId ? 'Fix clip with your voice' : 'Fix clip';
  setPlayer('[data-video-player]', val('videoFileId') || report.videoFileId || null);
  $('[data-video-times]').textContent = (report.items ?? []).filter((i) => i.time).map((i, n) => `${n + 1}: ${i.time}`).join(' · ');
  $('[data-clips-status]').textContent = c.status === 'running' ? `${c.step || 'Starting…'} — usually 1–3 minutes.`
    : c.status === 'failed' ? `⚠️ ${c.error}`
    : c.status === 'ready' ? `✅ ${c.seconds} s clip saved in the student’s Drive folder. Record your voice-over on it, upload the result to the folder, then choose it below as the voice-over video.`
    : 'Each fix at normal speed, then again in slow motion with a label — about 20 seconds, silent, ready for your voice-over. Uses the times of the fixes below; adjust “Clip from” if a moment is off.';
  clearTimeout(clipsTimer);
  if (c.status === 'running') clipsTimer = setTimeout(pollClips, 5000);
}
async function pollClips() {
  try {
    const data = await api('GET');
    report.clips = data.report.clips;
    if (report.clips?.status === 'ready') { files = data.files; renderFiles(); toast('Fix clip ready ✅', 8000); }
    renderClips();
  } catch { clipsTimer = setTimeout(pollClips, 10000); }
}

// ---------- AI first draft ----------
let aiAvailable = false;
let aiTimer = null;
function renderAi() {
  const ai = report.ai ?? {};
  const btn = $('[data-ai-run]');
  const bar = $('[data-ai-progress]');
  btn.disabled = !aiAvailable || ai.status === 'running';
  btn.textContent = ai.status === 'running' ? 'Working…' : ai.status === 'ready' ? 'Make a new AI draft' : 'Make AI draft';
  bar.hidden = ai.status !== 'running';
  bar.querySelector('i').style.width = `${ai.progress ?? 0}%`;
  $('[data-ai-status]').textContent = !aiAvailable ? 'Needs GEMINI_VIDEO_KEY in Netlify (Google AI Studio key) — see the README.'
    : ai.status === 'running' ? `${ai.step ?? 'Working…'}${ai.progress && ai.progress < 100 ? ` ${ai.progress}%` : ''} — a full match takes a few minutes; you can leave this page.`
    : ai.status === 'failed' ? `⚠️ ${ai.error}`
    : ai.status === 'ready' ? `✅ Draft filled in below (${ai.model}, ${new Date(ai.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}). Check every timestamp, score and fix before publishing.`
    : 'The AI watches the student’s video with your framework and fills in this report for you to check.';
  const notes = $('[data-ai-notes]');
  notes.hidden = ai.status !== 'ready' || !(ai.player || ai.notes);
  notes.innerHTML = `${ai.player ? `<p><b>Who it analysed:</b> ${esc(ai.player)}</p>` : ''}${ai.notes ? `<p><b>Not sure about:</b> ${esc(ai.notes)}</p>` : ''}`;
  clearTimeout(aiTimer);
  if (ai.status === 'running') aiTimer = setTimeout(pollAi, 5000);
}
async function pollAi() {
  try {
    const data = await api('GET');
    if (data.report.ai?.status === 'ready') {
      dirty = false;
      render(data);
      toast('AI draft ready ✅ — check it before publishing.', 10000);
    } else { report.ai = data.report.ai; renderAi(); }
  } catch { aiTimer = setTimeout(pollAi, 10000); }
}

function render(data) {
  report = data.report;
  files = data.files;
  aiAvailable = Boolean(data.aiAvailable);
  const u = data.upload;
  $('[data-ref]').textContent = report.ref;
  $('[data-student]').textContent = `${report.student.firstName} ${report.student.lastName}`;
  $('[data-meta]').textContent = `${u.planName} · ${u.phone} · ${report.status === 'published' ? `published ${new Date(report.publishedAt).toLocaleDateString('en-GB')}` : 'draft'}`;
  $('[data-student-notes]').hidden = !u.notes;
  $('[data-student-notes]').textContent = `📝 Student asked: ${u.notes}`;
  $('[data-folder]').href = `https://drive.google.com/drive/folders/${report.folderId}`;
  const gw = data.external ?? [];
  $('[data-gw-box]').hidden = !gw.length;
  $('[data-gw]').innerHTML = gw.map((e) => `
    <p><b>${esc(e.date)}</b>${e.coachName ? ` · ${esc(e.coachName)}` : ''}: ${esc(e.focus.map((f) => `${f.category}: ${f.title}`).join(' · '))}</p>
    ${e.metrics.length ? `<p class="note">${esc(e.metrics.map((m) => `${m.name}: ${m.value}${m.unit === '%' ? '%' : ` ${m.unit}`}`).join(' · '))}</p>` : ''}`).join('');
  $('[data-preview]').href = `/report/${report.token}`;
  $('[data-publish]').textContent = report.status === 'published' ? 'Update & send again ↗' : 'Publish & send ↗';
  for (const k of ['kind', 'lang', 'headline', 'summary', 'strengths', 'closing']) form().elements[k].value = report[k] ?? '';
  renderFiles();
  renderKind();
  form().hidden = false;
  $('[data-status]').hidden = true;
  renderAi();
  renderClips();
}

// ---------- collect ----------
function collect() {
  const items = [...document.querySelectorAll('[data-item]')].map((el) =>
    Object.fromEntries([...el.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value])));
  const weeks = [...document.querySelectorAll('[data-week]')].map((el) =>
    Object.fromEntries([...el.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value])));
  const scores = Object.fromEntries([...document.querySelectorAll('[data-area]')].map((el) => [el.dataset.area, {
    score: el.querySelector('[data-score]').value, note: el.querySelector('[data-note]').value,
    shots: Object.fromEntries([...el.querySelectorAll('[data-shot]')].map((x) => [x.dataset.shot,
      { score: x.querySelector('[data-shot-score]').value, note: x.querySelector('[data-shot-note]').value }])),
  }]));
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
form().addEventListener('input', (e) => {
  dirty = true;
  $('[data-saved]').textContent = 'Unsaved changes';
  const area = e.target.closest('[data-area]');
  if (area && e.target.matches('[data-shot-score]')) { // show the live shot average as the area's placeholder
    const vals = [...area.querySelectorAll('[data-shot-score]')].map((i) => Number(i.value)).filter((n) => n >= 1 && n <= 10);
    area.querySelector('[data-score]').placeholder = vals.length ? String(Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10) : '–';
    area.querySelector('[data-shot-count]').textContent = vals.length ? `${vals.length} scored` : 'score only what you saw';
  }
});
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
    toast(`Published ✅ <a href="${esc(r.url)}" target="_blank" rel="noopener">Open report ↗</a> · The PDF is being made — in about a minute it’s on the report page and in admin (PDF ↓ / Send PDF on WhatsApp).`, 20000);
    $('[data-publish]').textContent = 'Update & send again ↗';
  } catch (err) { win?.close(); toast(esc(err.message)); }
});
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

$('[data-clips-run]').addEventListener('click', async () => {
  try {
    await save(); // use the times as they are on screen now
    const r = await api('POST', '/clips');
    report = { ...report, clips: r.report.clips };
    renderClips();
  } catch (err) { toast(esc(err.message)); }
});

$('[data-ai-run]').addEventListener('click', async () => {
  const hasContent = report.headline || report.items?.some((i) => i.title);
  if (hasContent && !confirm('The AI draft will replace what’s in this report now. Continue?')) return;
  try {
    if (val('videoFileId') && val('videoFileId') !== report.videoFileId) await save(); // analyse the video picked above
    const r = await api('POST', '/ai');
    report = { ...report, ai: r.report.ai };
    renderAi();
  } catch (err) { toast(esc(err.message)); }
});

// ---------- boot ----------
if (!password) location.href = '/admin';
else if (!ref) $('[data-status]').textContent = 'No upload selected — open a report from the admin page.';
else api('GET').then(render).catch((err) => { $('[data-status]').textContent = err.message; });
