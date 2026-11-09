// Player profiles on Navid's phone: record a voice note after a lesson → AI summary → PDF → WhatsApp.
import { request } from './api.js';
import { SHOTS } from '../../shared/report.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
let password = '';
try { password = sessionStorage.getItem('navid-admin-key') || localStorage.getItem('navid-admin-key') || ''; } catch { /* blocked */ }
const headers = { 'x-admin-key': password };
const phone = new URLSearchParams(location.search).get('phone');
const pdfUrl = (id) => `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
const digits = (p) => String(p).replace(/\D/g, '');
let player = null;
let lessons = [];
let pollTimer = null;

let toastTimer;
function toast(html, ms = 7000) {
  const el = $('[data-toast]');
  el.innerHTML = html;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- all players ----------
async function showList() {
  $('[data-list]').hidden = false;
  const { players } = await request('/api/admin/players', { headers });
  const render = (q = '') => {
    const list = players.filter((p) => `${p.firstName} ${p.lastName} ${p.phone}`.toLowerCase().includes(q.toLowerCase()));
    $('[data-players]').innerHTML = list.length ? list.map((p) => `
      <a class="bk stu ap__row" href="/admin/player?phone=${encodeURIComponent(p.phone)}">
        <div class="bk__who"><b>${esc(p.firstName)} ${esc(p.lastName)}</b>
          <small>${esc(p.phone)} · ${p.reports} report${p.reports === 1 ? '' : 's'}${p.external ? ` · ${p.external} GlassWall` : ''}</small></div>
        <span class="bk__badge">Open →</span>
      </a>`).join('') : '<p class="note">No players yet — add one below.</p>';
  };
  render();
  $('[data-search]').addEventListener('input', (e) => render(e.target.value));
}

$('[data-new-player]').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  sessionStorage.setItem('ap-new', JSON.stringify({ firstName: f.get('firstName'), lastName: f.get('lastName') }));
  location.href = `/admin/player?phone=${encodeURIComponent(f.get('phone'))}`;
});

// ---------- one player ----------
const TREND = { better: '▲', same: '=', worse: '▼', new: '•' };
const shotName = (id) => SHOTS.find((s) => s.id === id)?.en ?? id;

function sendLink(l) {
  const name = player?.firstName ?? '';
  const text = l.lang === 'lt'
    ? `Labas, ${name}! 📄 Šiandienos treniruotės santrauka: ${pdfUrl(l.pdfFileId)}\n\nTreneris Navid`
    : `Hi ${name}! 📄 Here’s the summary of today’s lesson: ${pdfUrl(l.pdfFileId)}\n\nCoach Navid`;
  return `https://wa.me/${digits(player.phone)}?text=${encodeURIComponent(text)}`;
}

const listField = (k, label, arr) => `<label class="field">${label} <small class="note">one per line</small><textarea data-k="${k}" rows="3">${esc((arr ?? []).join('\n'))}</textarea></label>`;

function lessonCard(l) {
  const s = l.summary;
  const status = {
    processing: '⏳ Listening & writing the summary…', pdf: '⏳ Making the PDF…', ready: l.sentAt ? '✅ Sent' : '✅ Ready to send', failed: '⚠️ Failed',
  }[l.status] ?? l.status;
  return `<article class="adm-box ap__lesson" data-lesson="${esc(l.id)}">
    <div class="ap__lesson-top">
      <b>${esc(new Date(`${l.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }))}</b>
      <span class="bk__badge">${status}</span>
    </div>
    ${l.error ? `<p class="bk__err">${esc(l.error)}</p><button class="btn btn--ghost" data-act="retry">Try again</button>` : ''}
    ${s ? `<h3>${esc(s.title)}</h3><p>${esc(s.summary)}</p>
      ${s.shots?.length ? `<p class="note">${s.shots.map((x) => `${TREND[x.trend] ?? ''} ${esc(shotName(x.id))}`).join(' · ')}</p>` : ''}` : ''}
    ${l.status === 'ready' ? `<div class="bk__actions">
        <a class="btn btn--lime" data-act="send" href="${esc(sendLink(l))}" target="_blank" rel="noopener">Send PDF on WhatsApp ↗</a>
        <a class="btn btn--ghost" href="${esc(pdfUrl(l.pdfFileId))}">PDF ↓</a>
      </div>` : ''}
    ${s ? `<details class="ap__edit"><summary>Edit summary</summary>
      <label class="field">Title <input data-k="title" value="${esc(s.title)}" /></label>
      <label class="field">Summary <textarea data-k="summary" rows="3">${esc(s.summary)}</textarea></label>
      ${listField('worked_on', 'What we worked on', s.worked_on)}
      ${listField('went_well', 'What went well', s.went_well)}
      ${listField('to_improve', 'What to improve', s.to_improve)}
      <label class="field">Drills <small class="note">“Name: how” — one per line</small><textarea data-k="drills" rows="3">${esc((s.drills ?? []).map((d) => `${d.name}: ${d.how}`).join('\n'))}</textarea></label>
      <label class="field">Progress <textarea data-k="progress" rows="2">${esc(s.progress)}</textarea></label>
      <label class="field">Focus until next lesson <textarea data-k="next_focus" rows="2">${esc(s.next_focus)}</textarea></label>
      <label class="field">Language <select data-k="lang"><option value="en" ${l.lang === 'en' ? 'selected' : ''}>English</option><option value="lt" ${l.lang === 'lt' ? 'selected' : ''}>Lietuvių</option></select></label>
      <button class="btn btn--lime" data-act="save">Save &amp; update PDF</button>
    </details>` : ''}
    ${l.transcript || l.notes ? `<details class="ap__edit"><summary>What you said</summary><p class="note">${esc([l.transcript, l.notes].filter(Boolean).join('\n\n'))}</p></details>` : ''}
    <button class="pill ap__del" data-act="delete">Delete lesson</button>
  </article>`;
}

function renderLessons() {
  $('[data-count]').textContent = lessons.length ? `(${lessons.length})` : '';
  $('[data-lessons]').innerHTML = lessons.length ? lessons.map(lessonCard).join('') : '<p class="note">No lessons yet. Record your first voice note above.</p>';
  clearTimeout(pollTimer);
  if (lessons.some((l) => l.status === 'processing' || l.status === 'pdf')) pollTimer = setTimeout(loadPlayer, 4000);
}

async function loadPlayer() {
  const r = await request(`/api/admin/lessons?phone=${encodeURIComponent(phone)}`, { headers });
  const pending = JSON.parse(sessionStorage.getItem('ap-new') || 'null');
  player = r.player ?? { firstName: pending?.firstName ?? '', lastName: pending?.lastName ?? '', phone, token: null };
  lessons = r.lessons;
  $('[data-name]').textContent = `${player.firstName} ${player.lastName}`.trim() || 'New player';
  $('[data-phone]').textContent = player.phone;
  $('[data-links]').innerHTML = `
    ${player.token ? `<a class="btn btn--ghost" href="/player/${esc(player.token)}" target="_blank" rel="noopener">📈 Progress page ↗</a>` : ''}
    <a class="btn btn--ghost" href="/admin/glasswall?phone=${encodeURIComponent(player.phone)}">＋ GlassWall</a>
    <a class="btn btn--ghost" href="https://wa.me/${digits(player.phone)}" target="_blank" rel="noopener">WhatsApp ↗</a>`;
  $('[data-ai-info]').textContent = !r.ai.summarize ? '⚠️ Add ANTHROPIC_API_KEY in Netlify to create summaries.'
    : !r.ai.transcribe ? '⚠️ Voice notes need speech-to-text (Netlify AI Gateway or OPENAI_API_KEY) — typed notes work already.' : '';
  if (!$('[data-new-lesson]').elements.lang.dataset.set) {
    $('[data-new-lesson]').elements.lang.value = digits(player.phone).startsWith('370') ? 'lt' : 'en';
    $('[data-new-lesson]').elements.lang.dataset.set = '1';
  }
  renderLessons();
}

// ---------- recording ----------
let recorder = null;
let chunks = [];
let recorded = null; // { blob, type }
let timer = null;

$('[data-rec]').addEventListener('click', async () => {
  if (recorder?.state === 'recording') { recorder.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) ?? '';
    recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 });
    chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(timer);
      recorded = { blob: new Blob(chunks, { type: recorder.mimeType || type || 'audio/mp4' }), type: recorder.mimeType || type || 'audio/mp4' };
      $('[data-rec]').classList.remove('is-rec');
      $('[data-rec-label]').textContent = 'Recorded ✓ — tap to record again';
      const audio = $('[data-playback]');
      audio.src = URL.createObjectURL(recorded.blob);
      audio.hidden = false;
    };
    recorder.start(1000);
    const t0 = Date.now();
    $('[data-rec]').classList.add('is-rec');
    timer = setInterval(() => {
      const sec = Math.floor((Date.now() - t0) / 1000);
      $('[data-rec-label]').textContent = `Recording ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} — tap to stop`;
      if (sec >= 15 * 60) recorder.stop();
    }, 500);
  } catch (err) {
    toast(`Microphone not available: ${esc(err.message)}`);
  }
});

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).split(',')[1]);
  fr.onerror = reject;
  fr.readAsDataURL(blob);
});

$('[data-new-lesson]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('[data-new-error]');
  err.hidden = true;
  const file = f.elements.audio.files[0];
  const audio = file ? { blob: file, type: file.type || 'audio/mp4' } : recorded;
  const btn = f.querySelector('[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Uploading…';
  try {
    const r = await request('/api/admin/lessons', {
      method: 'POST', headers,
      body: JSON.stringify({
        phone: player.phone, firstName: player.firstName, lastName: player.lastName,
        date: f.elements.date.value, lang: f.elements.lang.value, notes: f.elements.notes.value,
        ...(audio ? { audioBase64: await toBase64(audio.blob), mimeType: audio.type } : {}),
      }),
    });
    sessionStorage.removeItem('ap-new');
    lessons.unshift(r.lesson);
    renderLessons();
    f.elements.notes.value = '';
    f.elements.audio.value = '';
    recorded = null;
    $('[data-playback]').hidden = true;
    $('[data-rec-label]').textContent = 'Tap to record';
    toast('Got it ✅ — the summary will be ready in about a minute.');
    loadPlayer();
  } catch (error) {
    err.textContent = error.message;
    err.hidden = false;
  }
  btn.disabled = false;
  btn.textContent = 'Create lesson summary';
});

// ---------- lesson actions ----------
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const card = b.closest('[data-lesson]');
  const id = card?.dataset.lesson;
  const act = b.dataset.act;
  const post = (body) => request('/api/admin/lessons', { method: 'POST', headers, body: JSON.stringify({ phone: player.phone, id, ...body }) });
  try {
    if (act === 'send') { post({ action: 'sent' }).catch(() => {}); return; } // the link itself opens WhatsApp
    e.preventDefault();
    if (act === 'delete') {
      if (!confirm('Delete this lesson, its recording and its PDF?')) return;
      await post({ action: 'delete' });
    }
    if (act === 'retry') await post({ action: 'retry' });
    if (act === 'save') {
      const v = (k) => card.querySelector(`[data-k=${k}]`).value;
      const lines = (k) => v(k).split('\n').map((s) => s.trim()).filter(Boolean);
      const old = lessons.find((l) => l.id === id).summary;
      await post({
        action: 'save', lang: v('lang'),
        summary: {
          ...old, title: v('title'), summary: v('summary'), worked_on: lines('worked_on'), went_well: lines('went_well'), to_improve: lines('to_improve'),
          drills: lines('drills').map((d) => { const [name, ...how] = d.split(':'); return { name: name.trim(), how: how.join(':').trim() }; }),
          progress: v('progress'), next_focus: v('next_focus'),
        },
      });
      toast('Saved ✅ — updating the PDF…');
    }
    loadPlayer();
  } catch (err) { toast(esc(err.message)); }
});

// ---------- boot ----------
if (!password) location.href = '/admin';
else if (phone) {
  $('[data-profile]').hidden = false;
  $('[data-new-lesson]').elements.date.value = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
  loadPlayer().catch((err) => toast(esc(err.message)));
} else showList().catch((err) => toast(esc(err.message)));
