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
const noEmbed = new Set(); // YouTube ids whose owner blocks embedding
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
  $('[data-phases]').innerHTML = PHASES.map(([k, label]) => `<tr><th>${label}</th><td>${esc(proClip.phases?.[k])}</td></tr>`).join('')
    + (proClip.details?.length ? `<tr><th>Details</th><td><ul>${proClip.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></td></tr>` : '');
  renderPhases();
  const opts = { videoId: proClip.source, startSeconds: proStart(), endSeconds: proEnd() };
  if (yt) yt.cueVideoById(opts);
  else {
    yt = new window.YT.Player('pro-player', {
      videoId: proClip.source,
      playerVars: { start: Math.floor(proStart()), rel: 0, modestbranding: 1, playsinline: 1, mute: 1 },
      events: {
        onReady: () => { yt.mute(); yt.setPlaybackRate(speed); },
        onError: (e) => { // 101/150: the owner doesn't allow embedding → drop this clip, show the next one
          if (![101, 150].includes(e.data) || !proClip) return;
          noEmbed.add(proClip.source);
          $('[data-status]').textContent = `${proClip.player}'s clip can't be played here (YouTube doesn't allow embedding) — showing the next one.`;
          fillPros();
        },
        onStateChange: (e) => { if (e.data === window.YT.PlayerState.ENDED || (e.data === 1 && yt.getCurrentTime() > proEnd())) yt.seekTo(proStart(), true); },
      },
    });
  }
}
setInterval(() => { // loop the pro clip on its swing
  if (yt?.getCurrentTime && proClip && yt.getPlayerState?.() === 1 && yt.getCurrentTime() > proEnd()) yt.seekTo(proStart(), true);
}, 120);

// ---------- phase by phase: the student's marked breakdown pictures next to the pro paused at the same phase ----------
// The pro's phase instants are around his contact time (pro clips have the contact second, not the phases):
const PRO_AT = { preparation: -0.5, execution: 0, ending: 0.5 };
const PRO_TEXT = { preparation: ['preparation', 'load'], execution: ['contact'], ending: ['finish'] };
let breakdown = null;
const ppPlayers = [];
async function loadBreakdown() {
  breakdown = null;
  const ref = $('[data-ref]').value.trim();
  const t = $('[data-t]').value.trim();
  try {
    const res = await fetch(`/api/admin/reports/${encodeURIComponent(ref)}`, { headers: H });
    const shots = res.ok ? ((await res.json()).report?.ai?.breakdown ?? []) : [];
    breakdown = shots.find((s) => s.time === t) ?? shots.find((s) => Math.abs(sec(s.time) - sec(t)) <= 1) ?? null;
  } catch { /* no breakdown */ }
  renderPhases();
}
function renderPhases() {
  const box = $('[data-pp-box]');
  box.hidden = !breakdown || !proClip;
  ppPlayers.splice(0).forEach((p) => p.destroy?.());
  if (box.hidden) return;
  $('[data-pp-pro]').textContent = proClip.player;
  $('[data-pp]').innerHTML = breakdown.phases.map((p, i) => `<div class="cp-pp">
      <figure><figcaption><b>${esc(p.name)}</b> · student ${esc(p.time)}</figcaption><img data-pp-img="${esc(p.img)}" alt="${esc(p.name)}" />
        <p class="note">${esc(p.caption)}</p></figure>
      <figure><figcaption><b>${esc(p.name)}</b> · ${esc(proClip.player)}</figcaption><div class="cp-pp-yt"><div id="pp-${i}"></div></div>
        <p class="cp-pp-nudge"><button type="button" class="pill" data-nudge="${i}" data-by="-0.1">◀ 0.1 s</button> <span data-pp-t="${i}"></span> <button type="button" class="pill" data-nudge="${i}" data-by="0.1">0.1 s ▶</button></p>
        <p class="note">${esc((PRO_TEXT[p.id] ?? []).map((k) => proClip.phases?.[k]).filter(Boolean).join(' '))}</p></figure>
    </div>`).join('');
  for (const img of document.querySelectorAll('[data-pp-img]')) {
    fetch(`/api/admin/compare/frame?key=${encodeURIComponent(img.dataset.ppImg)}`, { headers: H }).then((r) => (r.ok ? r.blob() : null)).then((b) => { if (b) img.src = URL.createObjectURL(b); });
  }
  breakdown.phases.forEach((p, i) => {
    const at = Math.max(0, sec(proClip.time) + (PRO_AT[p.id] ?? 0));
    let first = true;
    const player = new window.YT.Player(`pp-${i}`, {
      videoId: proClip.source,
      playerVars: { start: Math.floor(at), rel: 0, modestbranding: 1, playsinline: 1, mute: 1, controls: 1 },
      events: {
        onReady: () => { player.mute(); player.playVideo(); },
        // YouTube shows a frame only once it has played: play, then jump to the instant and pause
        onStateChange: (e) => { if (first && e.data === window.YT.PlayerState.PLAYING) { first = false; player.seekTo(at, true); player.pauseVideo(); } },
      },
    });
    player.at = at;
    ppPlayers[i] = player;
    $(`[data-pp-t="${i}"]`).textContent = mmss(at);
  });
}
const mmss = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-nudge]');
  if (!b) return;
  const p = ppPlayers[Number(b.dataset.nudge)];
  if (!p?.seekTo) return;
  p.at = Math.max(0, p.at + Number(b.dataset.by));
  p.seekTo(p.at, true); p.pauseVideo();
  $(`[data-pp-t="${b.dataset.nudge}"]`).textContent = mmss(p.at);
});

function fillPros() {
  const shot = $('[data-shot]').value;
  // checked pro shots first; ones the check found wrong, or that YouTube won't embed, are left out
  // order: Navid checked it, then AI-verified, then contact re-timed, then quality
  const list = pros.filter((p) => (!shot || p.shot === shot) && p.verified !== false && p.navid !== 'wrong' && !noEmbed.has(p.source))
    .sort((a, b) => (b.navid === 'ok') - (a.navid === 'ok') || (b.verified === true) - (a.verified === true) || (b.timed === true) - (a.timed === true) || (b.quality ?? 0) - (a.quality ?? 0));
  $('[data-pro]').innerHTML = list.map((p) => `<option value="${esc(p.id)}">${p.verified ? '✓ ' : ''}${esc(p.player)} · ${esc(p.shot)} · ${esc(p.time)} · ${'★'.repeat(p.quality ?? 0)}</option>`).join('') || '<option value="">No pro shots of this kind yet</option>';
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
$('[data-t]').addEventListener('change', () => { loadStudent(); loadBreakdown(); });
$('[data-ref]').addEventListener('change', () => { loadStudent(); loadBreakdown(); });

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
  loadBreakdown();
})();

// ---------- Instagram reel: AI drafts the captions, Navid edits them, then the video is made ----------
const reelMoments = () => ({ a: { t: $('[data-ra-t]').value.trim(), label: $('[data-ra-l]').value.trim() }, b: { t: $('[data-rb-t]').value.trim(), label: $('[data-rb-l]').value.trim() } });
let reelKey = '';
let reelPoll = null;
const reelStatus = (t) => { $('[data-reel-status]').textContent = t; };
const phaseRow = (p = {}) => `<tr><td><input data-ph="name" value="${esc(p.name)}" /></td><td><input data-ph="a" value="${esc(p.a)}" /></td><td><input data-ph="b" value="${esc(p.b)}" /></td><td><button type="button" class="pill" data-ph-del>✕</button></td></tr>`;
function showDraft(d) {
  $('[data-reel-edit]').hidden = false;
  $('[data-reel-title]').value = d.title ?? '';
  $('[data-reel-phases]').innerHTML = (d.phases ?? []).map(phaseRow).join('');
  for (const k of ['A', 'B']) {
    const img = $(`[data-reel-img="${k}"]`);
    fetch(`/api/admin/compare/reel?key=${encodeURIComponent(reelKey)}&img=${k}`, { headers: H }).then((r) => r.blob()).then((bl) => { img.src = URL.createObjectURL(bl); });
    const b = d.boxes?.[k.toLowerCase()]?.[1]; // the box at the moment of the shot
    const el = $(`[data-reel-box="${k}"]`);
    el.hidden = !b;
    if (b) Object.assign(el.style, { top: `${b[0] / 10}%`, left: `${b[1] / 10}%`, height: `${(b[2] - b[0]) / 10}%`, width: `${(b[3] - b[1]) / 10}%` });
  }
}
async function pollReel(wantDraft) {
  clearTimeout(reelPoll);
  const s = await (await fetch(`/api/admin/compare/reel?key=${encodeURIComponent(reelKey)}`, { headers: H })).json().catch(() => ({}));
  if (s.error) { reelStatus(`⚠️ ${s.error}`); return; }
  if (wantDraft && s.draft && !s.step) { reelStatus('✏️ Check the boxes and the words, then make the video.'); showDraft(s.draft); return; }
  if (!wantDraft && s.done && !s.step) {
    reelStatus(`✅ Reel ready (${s.seconds} s) — also saved in the student's Drive folder.`);
    const v = $('[data-reel-video]');
    v.src = URL.createObjectURL(await (await fetch(`/api/admin/compare/reel?key=${encodeURIComponent(reelKey)}&mp4=1`, { headers: H })).blob());
    v.hidden = false;
    return;
  }
  reelStatus(`⏳ ${s.step ?? 'Starting…'}`);
  reelPoll = setTimeout(() => pollReel(wantDraft), 5000);
}
async function startReel(extra) {
  const res = await fetch('/api/admin/compare/reel', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: $('[data-ref]').value.trim(), ...reelMoments(), ...extra }) });
  if (!res.ok) { reelStatus(`Error ${res.status}`); return false; }
  reelKey = (await res.json()).key;
  return true;
}
$('[data-reel-draft]').addEventListener('click', async () => {
  $('[data-reel-edit]').hidden = true;
  $('[data-reel-video]').hidden = true;
  reelStatus('⏳ Starting…');
  if (await startReel({ step: 'draft' })) setTimeout(() => pollReel(true), 4000);
});
$('[data-reel-render]').addEventListener('click', async () => {
  const phases = [...document.querySelectorAll('[data-reel-phases] tr')].map((tr) => Object.fromEntries([...tr.querySelectorAll('[data-ph]')].map((i) => [i.dataset.ph, i.value.trim()]))).filter((p) => p.name);
  if (!phases.length) { reelStatus('Add at least one phase.'); return; }
  reelStatus('⏳ Starting… (the video takes 3–6 minutes)');
  if (await startReel({ step: 'render', title: $('[data-reel-title]').value.trim(), phases })) setTimeout(() => pollReel(false), 6000);
});
$('[data-reel-add]').addEventListener('click', () => $('[data-reel-phases]').insertAdjacentHTML('beforeend', phaseRow()));
$('[data-reel-phases]').addEventListener('click', (e) => { if (e.target.closest('[data-ph-del]')) e.target.closest('tr').remove(); });
