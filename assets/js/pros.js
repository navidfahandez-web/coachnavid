// Pro library: a folder per top player → his shots → checked YouTube clips (played in slow motion via
// the YouTube IFrame API, never downloaded) + the technique profile the AI wrote from those clips.
import { SHOTS } from '../../shared/report.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
let password = '';
try { password = sessionStorage.getItem('navid-admin-key') || localStorage.getItem('navid-admin-key') || ''; } catch { /* blocked */ }
const sec = (t) => String(t ?? '').split(':').map(Number).reduce((a, b) => a * 60 + b, 0) || 0;
const shotName = (id) => SHOTS.find((s) => s.id === id)?.en ?? id;
const PHASES = [['preparation', 'Preparation'], ['load', 'Load'], ['drop', 'Racket drop'], ['contact', 'Contact'], ['finish', 'Finish']];
// the shots a top player should have in his folder (shown as "missing" when there's no clip yet)
const KEY_SHOTS = ['bandeja', 'vibora', 'flat_smash', 'por3', 'rulo', 'fh_volley', 'bh_volley', 'block_volley', 'low_volley', 'fh_before', 'bh_before', 'fh_after', 'bh_after', 'contrapared', 'bajada', 'lob_before', 'lob_after', 'chiquita', 'serve', 'return'];
const ORDER = SHOTS.map((s) => s.id);
let data = null;
let speed = 0.25;

async function api(method = 'GET', body) {
  const res = await fetch('/api/admin/pros', { method, headers: { 'x-admin-key': password, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401 && !body) { password = prompt('Admin password') ?? ''; try { sessionStorage.setItem('navid-admin-key', password); } catch { /* */ } return api(method, body); }
  if (!res.ok) throw new Error(j.error ?? `Error ${res.status}`);
  return j;
}

const playersOf = () => {
  const known = new Set(data.players.map((p) => p.name));
  const others = [...new Set(data.clips.map((c) => c.player).filter((n) => n && !known.has(n)))].sort()
    .map((n) => ({ id: `x-${n}`, name: n, full: n === 'other' ? 'Unknown players' : n, tour: 'other' }));
  return [...data.players, ...others];
};
const clipsOf = (p) => data.clips.filter((c) => c.player === p.name);
const good = (c) => c.verified === true && data.videos?.[c.source]?.embeddable !== false;

// ---------- status ----------
function renderStatus() {
  const s = data.status ?? {};
  const box = $('[data-status-box]');
  const jobs = data.jobs ?? [];
  box.hidden = !(s.step || s.error || jobs.length || s.log?.length);
  box.innerHTML = `${s.error ? `<p class="pl-err">${esc(s.error)}</p>` : ''}
    ${s.step ? `<p><b>Working:</b> ${esc(s.step)}</p>` : jobs.length ? '<p><b>Waiting to start…</b></p>' : '<p><b>Nothing running.</b></p>'}
    ${jobs.length ? `<p class="note">Still to do: ${jobs.map((j) => esc(`${j.player} ${j.type === 'index' ? `watch video${j.next ? ` (at ${Math.round(j.next / 60)} min)` : ''}` : j.type === 'verify' ? 'check shots' : 'write profile'}`)).join(' · ')}</p>` : ''}
    <details><summary>Log</summary><ul class="pl-log">${(s.log ?? []).slice().reverse().map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details>
    <p class="pl-row">${jobs.length && !s.step ? '<button class="btn btn--ghost" type="button" data-act="run">▶ Start</button>' : ''}${jobs.length ? '<button class="btn btn--ghost" type="button" data-act="clear-jobs">Stop &amp; clear the list</button>' : ''}</p>`;
}

// ---------- home: folders ----------
function renderHome() {
  const card = (p) => {
    const list = clipsOf(p);
    const ok = list.filter(good);
    const shots = new Set(ok.map((c) => c.shot)).size;
    const prof = data.profiles?.[p.id];
    return `<a class="pl-card" href="#${encodeURIComponent(p.id)}">
      <b>${esc(p.full)}</b>
      <span>${ok.length ? `${ok.length} checked clips · ${shots} shots` : list.length ? `${list.length} clips, not checked yet` : 'No videos yet'}</span>
      <small>${prof ? '✓ technique profile' : ''}${list.filter((c) => c.verified === undefined).length ? ` · ${list.filter((c) => c.verified === undefined).length} to check` : ''}</small>
    </a>`;
  };
  const all = playersOf();
  const group = (tour, title) => {
    const ps = all.filter((p) => p.tour === tour);
    return ps.length ? `<h2 class="pl-h">${title}</h2><div class="pl-grid">${ps.map(card).join('')}</div>` : '';
  };
  $('[data-view]').innerHTML = `
    <section class="adm-box"><h3>Top pros, shot by shot</h3>
      <p class="note">Each folder is a player. The AI watches YouTube videos of the player (they are never downloaded — clips play from YouTube), finds the moments he/she hits the ball, checks every shot on its own 3-second clip, and then writes the player's technique per shot. Clips only come from videos YouTube allows us to embed.</p></section>
    ${group('men', 'Men')}${group('women', 'Women')}${group('other', 'Other pros (from match videos)')}`;
}

// ---------- one player ----------
let yt = null, cur = null;
const start = () => Math.max(0, sec(cur.time) - 1.5);
const end = () => Math.max(sec(cur.end), sec(cur.time) + 1) + 0.6;
function play(c) {
  cur = c;
  const box = $('[data-player-box]');
  box.hidden = false;
  $('[data-now]').innerHTML = `<b>${esc(shotName(c.shot))}</b> · ${esc(c.time)} · ${'★'.repeat(c.quality ?? 0)} · ${esc(c.view ?? '')}
    <a href="https://www.youtube.com/watch?v=${esc(c.source)}&t=${Math.floor(start())}s" target="_blank" rel="noopener">open on YouTube ↗</a>
    <div class="pl-now-phases">${PHASES.map(([k, l]) => c.phases?.[k] ? `<p><b>${l}:</b> ${esc(c.phases[k])}</p>` : '').join('')}${c.details?.length ? `<p><b>Special:</b> ${c.details.map(esc).join(' · ')}</p>` : ''}</div>`;
  const opts = { videoId: c.source, startSeconds: start(), endSeconds: end() };
  if (yt?.loadVideoById) { yt.loadVideoById(opts); yt.mute(); yt.setPlaybackRate(speed); return; }
  const make = () => {
    yt = new window.YT.Player('pl-yt', {
      videoId: c.source,
      playerVars: { start: Math.floor(start()), rel: 0, modestbranding: 1, playsinline: 1, mute: 1, autoplay: 1 },
      events: {
        onReady: () => { yt.mute(); yt.seekTo(start(), true); yt.setPlaybackRate(speed); yt.playVideo(); },
        onError: (e) => { if ([101, 150].includes(e.data)) $('[data-now]').insertAdjacentHTML('afterbegin', '<p class="pl-err">YouTube doesn’t allow this video to be played here.</p>'); },
        onStateChange: (e) => { if (e.data === window.YT.PlayerState.ENDED) { yt.seekTo(start(), true); yt.playVideo(); } else if (e.data === 1) yt.setPlaybackRate(speed); },
      },
    });
  };
  if (window.YT?.Player) make(); else window.onYouTubeIframeAPIReady = make;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
setInterval(() => { if (cur && yt?.getPlayerState?.() === 1 && yt.getCurrentTime() > end()) yt.seekTo(start(), true); }, 100);

function renderPlayer(p) {
  const list = clipsOf(p);
  const ok = list.filter(good);
  const prof = data.profiles?.[p.id];
  const byShot = {};
  for (const c of ok) (byShot[c.shot] ??= []).push(c);
  const profShot = Object.fromEntries((prof?.shots ?? []).map((s) => [s.shot, s]));
  const shots = Object.keys(byShot).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const missing = KEY_SHOTS.filter((s) => !byShot[s]);
  const todo = list.filter((c) => c.verified === undefined).length;
  const dropped = list.filter((c) => c.verified === false).length;
  const clipCard = (c, best) => `<div class="pl-clip${best ? ' is-best' : ''}${c.navid === 'ok' ? ' is-ok' : ''}" data-clip="${esc(c.id)}">
      <button type="button" class="pl-clip__play" data-play="${esc(c.id)}">▶ ${esc(c.time)}${best ? ' · best' : ''}${c.navid === 'ok' ? ' · ✓ Navid' : ''}${c.recheck === 'unsure' && c.navid !== 'ok' ? ' · ?' : ''}</button>
      <span class="pl-clip__meta">${'★'.repeat(c.quality ?? 0)} ${esc(c.view ?? '')} · ${esc((c.sourceTitle || data.videos?.[c.source]?.title || c.source).slice(0, 48))}</span>
      ${c.details?.length ? `<span class="pl-clip__det">${esc(c.details[0])}</span>` : ''}
      <span class="pl-clip__mark"><button type="button" data-mark="${esc(c.id)}" data-ok="1" title="Good clip">✓</button><button type="button" data-mark="${esc(c.id)}" data-ok="0" title="Wrong — hide it">✗</button></span>
    </div>`;
  const shotBlock = (s) => {
    const ps = profShot[s];
    const best = new Set(ps?.best ?? []);
    const clips = byShot[s].slice().sort((a, b) => best.has(b.id) - best.has(a.id) || (b.navid === 'ok') - (a.navid === 'ok') || (a.recheck === 'unsure') - (b.recheck === 'unsure') || (b.quality ?? 0) - (a.quality ?? 0));
    return `<section class="adm-box pl-shot" id="shot-${esc(s)}">
      <h3>${esc(shotName(s))} <small>${byShot[s].length} clip${byShot[s].length > 1 ? 's' : ''}${ps ? ` · ${esc(ps.confidence)} confidence` : ''}</small></h3>
      ${ps ? `<p>${esc(ps.summary)}</p>
        <table class="pl-phases"><thead><tr><th></th><th>Typical</th><th>Special about ${esc(p.name)}</th></tr></thead><tbody>
        ${PHASES.map(([k, l]) => `<tr><th>${l}</th><td>${esc(ps.phases?.[k]?.typical)}</td><td>${esc(ps.phases?.[k]?.special)}</td></tr>`).join('')}</tbody></table>
        ${ps.signature?.length ? `<p><b>Signature:</b> ${ps.signature.map(esc).join(' · ')}</p>` : ''}
        ${ps.copy ? `<p class="pl-copy"><b>What your students can copy:</b> ${esc(ps.copy)}</p>` : ''}` : '<p class="note">No technique profile for this shot yet.</p>'}
      <div class="pl-clips">${clips.map((c) => clipCard(c, best.has(c.id))).join('')}</div>
    </section>`;
  };
  $('[data-view]').innerHTML = `
    <p><a href="#">← All players</a></p>
    <section class="adm-box">
      <h3>${esc(p.full)}</h3>
      ${prof?.style ? `<p>${esc(prof.style)}</p><p class="note">Profile from ${prof.clips} checked clips · ${esc(prof.at?.slice(0, 10))}</p>` : '<p class="note">No technique profile yet — it is written once there are checked clips.</p>'}
      <p class="note">${ok.length} checked clips · ${todo} still to check · ${dropped} dropped (not ${esc(p.name)}, or not that shot)</p>
      ${shots.length ? `<p class="pl-jump">${shots.map((s) => `<a href="#${encodeURIComponent(p.id)}/${s}" data-jump="${s}">${esc(shotName(s))} (${byShot[s].length})</a>`).join('')}</p>` : ''}
      ${missing.length ? `<p class="note"><b>No clips yet:</b> ${missing.map(shotName).map(esc).join(' · ')}</p>` : ''}
      <form class="pl-add" data-add>
        <label class="field">Add a YouTube video of ${esc(p.name)} <input name="url" placeholder="https://www.youtube.com/watch?v=…" required /></label>
        <button class="btn btn--lime" type="submit">Watch &amp; add shots</button>
      </form>
      <p class="note">Costs roughly 10–25 US cents of AI Studio credit per 10-minute video (finding + checking every shot).</p>
      <p class="pl-row">
        ${todo ? `<button class="btn btn--ghost" type="button" data-act="verify">Check the ${todo} new shots</button>` : ''}
        ${ok.some((c) => !c.timed) ? `<button class="btn btn--ghost" type="button" data-act="verify" data-refine="1">Fix the timing of ${ok.filter((c) => !c.timed).length} clips</button>` : ''}
        ${ok.length ? '<button class="btn btn--ghost" type="button" data-act="profile">Rewrite the technique profile</button>' : ''}
      </p>
    </section>
    <section class="adm-box pl-playerbox" data-player-box hidden>
      <div class="pl-frame"><div id="pl-yt"></div></div>
      <p class="pl-speeds">Speed ${[1, 0.5, 0.25].map((s) => `<button type="button" data-speed="${s}" class="${s === speed ? 'is-on' : ''}">${s}×</button>`).join('')}
        <button type="button" data-step="-0.1">◀ 0.1 s</button><button type="button" data-step="0.1">0.1 s ▶</button>
        <button type="button" data-contact>Contact</button><button type="button" data-pause>⏸</button></p>
      <div data-now></div>
    </section>
    ${shots.map(shotBlock).join('')}`;
  $('[data-add]').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button', e.target);
    btn.disabled = true;
    try { const r = await api('POST', { action: 'add-video', url: e.target.url.value, player: p.name }); alert(`Added “${r.title}”. The AI is watching it now — check back in 10–20 minutes.`); e.target.reset(); await load(); } catch (err) { alert(err.message); }
    btn.disabled = false;
  };
}

// ---------- events ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a[data-jump]');
  if (!t) return;
  const player = playersOf().find((p) => p.id === decodeURIComponent(location.hash.slice(1).split('/')[0]));
  if (t.dataset.jump) { e.preventDefault(); document.getElementById(`shot-${t.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth' }); return; }
  if (t.dataset.play) return play(data.clips.find((c) => c.id === t.dataset.play));
  if (t.dataset.speed) { speed = Number(t.dataset.speed); yt?.setPlaybackRate?.(speed); document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.speed) === speed)); return; }
  if (t.dataset.step) { yt?.pauseVideo?.(); yt?.seekTo?.(Math.max(0, yt.getCurrentTime() + Number(t.dataset.step)), true); return; }
  if (t.hasAttribute('data-contact') && cur) { yt?.pauseVideo?.(); yt?.seekTo?.(sec(cur.time), true); return; }
  if (t.hasAttribute('data-pause')) { if (yt?.getPlayerState?.() === 1) yt.pauseVideo(); else yt?.playVideo?.(); return; }
  if (t.dataset.mark) {
    const ok = t.dataset.ok === '1';
    if (!ok && !confirm('Hide this clip everywhere (library and compare page)?')) return;
    try { await api('POST', { action: 'mark', id: t.dataset.mark, ok }); const c = data.clips.find((x) => x.id === t.dataset.mark); Object.assign(c, { navid: ok ? 'ok' : 'wrong', verified: ok }); route(); } catch (err) { alert(err.message); }
    return;
  }
  if (t.dataset.act) {
    t.disabled = true;
    try { await api('POST', { action: t.dataset.act, player: player?.name, refine: t.dataset.refine === '1' }); await load(); } catch (err) { alert(err.message); t.disabled = false; }
  }
});

function route() {
  renderStatus();
  const [id, shot] = location.hash.slice(1).split('/').map(decodeURIComponent);
  const p = id && playersOf().find((x) => x.id === id);
  if (!p) { renderHome(); return; }
  if (yt) { yt.destroy?.(); yt = null; cur = null; }
  renderPlayer(p);
  if (shot) document.getElementById(`shot-${shot}`)?.scrollIntoView();
}
window.addEventListener('hashchange', route);

async function load() {
  try { data = await api(); route(); } catch (err) { $('[data-view]').innerHTML = `<p class="pl-err">${esc(err.message)}</p>`; }
}
load();
setInterval(async () => { // refresh the status while the AI works
  if (!data || !(data.status?.step || data.jobs?.length)) return;
  try { const d = await api(); const changed = d.clips.length !== data.clips.length || d.clips.filter((c) => c.verified !== undefined).length !== data.clips.filter((c) => c.verified !== undefined).length; data = d; if (changed && !cur) route(); else renderStatus(); } catch { /* next time */ }
}, 20000);
