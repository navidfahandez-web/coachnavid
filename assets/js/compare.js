// Compare a student's shot with a pro's: the student's moment (cut from their own video) next to the
// pro reference shot (played from YouTube at that second), both looping in slow motion together.
import { SHOTS } from '../../shared/report.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
let password = '';
try { password = sessionStorage.getItem('navid-admin-key') || localStorage.getItem('navid-admin-key') || ''; } catch { /* blocked */ }
const H = { 'x-admin-key': password };
const sec = (t) => String(t ?? '').split(':').map(Number).reduce((a, b) => a * 60 + b, 0) || 0;
const PHASES = [['preparation', 'Preparation'], ['load', 'Load'], ['drop', 'Racket drop'], ['contact', 'Contact'], ['finish', 'Finish']];
let pros = [];
let speed = 0.25;
let yt = null;
let proClip = null;
const student = $('[data-student]');
const params = new URLSearchParams(location.search);
if (params.get('ref')) $('[data-ref]').value = params.get('ref');
if (params.get('t')) $('[data-t]').value = params.get('t');

// ---------- student clip ----------
async function loadStudent() {
  const ref = $('[data-ref]').value.trim();
  const t = $('[data-t]').value.trim();
  $('[data-student-label]').textContent = `Student · ${ref} at ${t}`;
  $('[data-status]').textContent = 'Cutting the student’s shot from their video… (about a minute the first time)';
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`/api/admin/compare/clip?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(t)}${i === 0 ? '&start=1' : ''}`, { headers: H });
    if (res.status === 200) {
      student.src = URL.createObjectURL(await res.blob());
      student.playbackRate = speed;
      $('[data-status]').textContent = '';
      return;
    }
    if (res.status !== 202) { $('[data-status]').textContent = (await res.json().catch(() => ({}))).error ?? `Error ${res.status}`; return; }
    await new Promise((r) => setTimeout(r, 5000));
  }
  $('[data-status]').textContent = 'The cut is taking long — try again in a minute.';
}

// ---------- pro clip (YouTube, looped between 1.5 s before contact and the end of the swing) ----------
const proStart = () => Math.max(0, sec(proClip.time) - 1.5);
const proEnd = () => Math.max(sec(proClip.end), sec(proClip.time) + 1.5) + 0.5;
function loadPro() {
  proClip = pros.find((p) => p.id === $('[data-pro]').value);
  if (!proClip) return;
  $('[data-pro-label]').textContent = `${proClip.player} · ${SHOTS.find((s) => s.id === proClip.shot)?.en ?? proClip.shot}`;
  $('[data-phases-box]').hidden = false;
  $('[data-phase-pro]').textContent = proClip.player;
  $('[data-phases]').innerHTML = PHASES.map(([k, label]) => `<tr><th>${label}</th><td>${esc(proClip.phases?.[k])}</td></tr>`).join('');
  const opts = { videoId: proClip.source, startSeconds: proStart(), endSeconds: proEnd() };
  if (yt) yt.cueVideoById(opts);
  else {
    yt = new window.YT.Player('pro-player', {
      videoId: proClip.source,
      playerVars: { start: Math.floor(proStart()), rel: 0, modestbranding: 1, playsinline: 1, mute: 1 },
      events: {
        onReady: () => { yt.mute(); yt.setPlaybackRate(speed); },
        onStateChange: (e) => { if (e.data === window.YT.PlayerState.ENDED || (e.data === 1 && yt.getCurrentTime() > proEnd())) yt.seekTo(proStart(), true); },
      },
    });
  }
}
setInterval(() => { // loop the pro clip on its swing
  if (yt?.getCurrentTime && proClip && yt.getPlayerState?.() === 1 && yt.getCurrentTime() > proEnd()) yt.seekTo(proStart(), true);
}, 120);

function fillPros() {
  const shot = $('[data-shot]').value;
  const list = pros.filter((p) => !shot || p.shot === shot).sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));
  $('[data-pro]').innerHTML = list.map((p) => `<option value="${esc(p.id)}">${esc(p.player)} · ${esc(p.shot)} · ${esc(p.time)} · ${'★'.repeat(p.quality ?? 0)}</option>`).join('') || '<option value="">No pro shots of this kind yet</option>';
  loadPro();
}

// ---------- controls ----------
function setSpeed(v) {
  speed = v;
  student.playbackRate = v;
  yt?.setPlaybackRate?.(v);
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.speed) === v));
}
document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
$('[data-both]').addEventListener('click', () => {
  student.currentTime = 0; student.playbackRate = speed; student.play();
  if (yt && proClip) { yt.seekTo(proStart(), true); yt.setPlaybackRate(speed); yt.playVideo(); }
});
$('[data-pause]').addEventListener('click', () => { student.pause(); yt?.pauseVideo?.(); });
$('[data-shot]').addEventListener('change', fillPros);
$('[data-pro]').addEventListener('change', loadPro);
$('[data-t]').addEventListener('change', loadStudent);
$('[data-ref]').addEventListener('change', loadStudent);

(async () => {
  try {
    const res = await fetch('/api/admin/learn/pros', { headers: H });
    if (!res.ok) throw new Error(res.status === 401 ? 'Log in on the Admin page first.' : `Error ${res.status}`);
    pros = (await res.json()).pros ?? [];
    const shots = [...new Set(pros.map((p) => p.shot))];
    $('[data-shot]').innerHTML = `<option value="">All shots</option>${shots.map((s) => `<option value="${s}">${esc(SHOTS.find((x) => x.id === s)?.en ?? s)}</option>`).join('')}`;
    const want = params.get('shot') ?? (shots.includes('bandeja') ? 'bandeja' : '');
    $('[data-shot]').value = want;
    const ready = () => (window.YT?.Player ? fillPros() : setTimeout(ready, 300));
    ready();
  } catch (err) { $('[data-status]').textContent = err.message; }
  loadStudent();
})();
