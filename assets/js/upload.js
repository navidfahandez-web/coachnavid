// Video upload page: creates the student's Drive folder, then uploads each file
// straight to Google Drive in chunks (resumable, with a progress bar).
import { applyStatic, setLang, t } from './i18n.js';
import { COACH } from './config.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const CHUNK = 16 * 1024 * 1024; // multiple of 256 KB, as Google requires
const waNumber = (COACH.whatsapp || '').replace(/\D/g, '');

async function api(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { code: data.code });
  return data;
}

// PUT one chunk; resolves with the XHR so we can read the status.
function putChunk(url, blob, start, total, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    if (blob) xhr.setRequestHeader('Content-Range', `bytes ${start}-${start + blob.size - 1}/${total}`);
    else xhr.setRequestHeader('Content-Range', `bytes */${total}`); // "how much do you have?"
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
    xhr.onload = () => resolve(xhr);
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(blob ?? null);
  });
}

const nextOffset = (xhr, fallback) => {
  const range = xhr.getResponseHeader('Range'); // e.g. "bytes=0-16777215"
  return range ? Number(range.split('-')[1]) + 1 : fallback;
};

async function uploadFile(url, file, onProgress) {
  let offset = 0;
  let failures = 0;
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK, file.size);
    try {
      const xhr = await putChunk(url, file.slice(offset, end), offset, file.size, (n) => onProgress(offset + n));
      if (xhr.status === 200 || xhr.status === 201) return;
      if (xhr.status === 308) { offset = nextOffset(xhr, end); failures = 0; continue; }
      if (xhr.status >= 500) throw new Error('server');
      throw new Error(`Upload failed (${xhr.status})`);
    } catch (err) {
      if (++failures > 6 || !/network|server/.test(err.message)) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** failures)); // back off, then ask Google where we are
      const xhr = await putChunk(url, null, 0, file.size).catch(() => null);
      if (xhr?.status === 200 || xhr?.status === 201) return;
      if (xhr?.status === 308) offset = nextOffset(xhr, 0);
    }
  }
}

const fmtSize = (b) => (b > 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1024 ** 2))} MB`);

function renderFiles() {
  const files = [...$('[name=files]').files];
  $('[data-file-list]').innerHTML = files.map((f) => `<li>🎬 ${esc(f.name)} <small>${fmtSize(f.size)}</small></li>`).join('');
}

function setBusy(on) {
  $('[data-upload-form] button[type=submit]').disabled = on;
  $('[data-upload-form]').classList.toggle('is-busy', on);
}

$('[name=files]').addEventListener('change', renderFiles);

$('[data-upload-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const files = [...$('[name=files]').files];
  const err = $('[data-upload-error]');
  err.hidden = true;
  if (!files.length) { err.textContent = t('up.err.nofile'); err.hidden = false; return; }

  setBusy(true);
  const bar = $('[data-progress]');
  const label = $('[data-progress-label]');
  bar.hidden = false;
  const total = files.reduce((s, x) => s + x.size, 0);
  let done = 0;
  const show = (n) => {
    const pct = Math.min(100, Math.round(((done + n) / total) * 100));
    bar.querySelector('i').style.width = `${pct}%`;
    label.textContent = `${t('up.uploading')} ${pct}% · ${fmtSize(done + n)} / ${fmtSize(total)}`;
  };
  // Leaving the page would stop the upload
  const guard = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
  addEventListener('beforeunload', guard);

  try {
    const { uploadId, ref } = await api('/api/uploads/start', {
      firstName: f.firstName, lastName: f.lastName, phone: f.phone, plan: f.plan,
      paymentRef: f.paymentRef, notes: f.notes, company: f.company,
    });
    for (const file of files) {
      const { url } = await api('/api/uploads/session', { uploadId, name: file.name, size: file.size, type: file.type || 'video/mp4' });
      await uploadFile(url, file, show);
      done += file.size;
      show(0);
    }
    await api('/api/uploads/done', { uploadId });
    removeEventListener('beforeunload', guard);
    $('[data-upload-form]').hidden = true;
    $('[data-upload-done]').hidden = false;
    $('[data-done-ref]').textContent = ref;
  } catch (error) {
    removeEventListener('beforeunload', guard);
    const key = { name: 'up.err.name', phone: 'up.err.phone', plan: 'up.err.plan', size: 'up.err.size', type: 'up.err.type', drive: 'up.err.drive' }[error.code];
    err.textContent = key ? t(key) : `${t('up.err.generic')} (${error.message})`;
    err.hidden = false;
    setBusy(false);
  }
});

function render() {
  applyStatic();
  document.title = t('up.meta');
  const wa = $('[data-wa-fallback]');
  if (waNumber) { wa.href = `https://wa.me/${waNumber}?text=${encodeURIComponent(t('va.waText'))}`; wa.hidden = false; }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b) return;
  setLang(b.dataset.lang);
  render();
});

// Preselect the plan from ?plan=match
const plan = new URLSearchParams(location.search).get('plan');
if (plan && $(`[name=plan] option[value="${CSS.escape(plan)}"]`)) $('[name=plan]').value = plan;
render();
