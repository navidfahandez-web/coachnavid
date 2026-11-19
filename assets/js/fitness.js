// Fitness program (admin): merge the exercises the coaching guide collected, review them,
// let the AI draft a 4-week plan per level band, fix and approve it, and make private student links.
import { BANDS, DAYS, GOALS, PARTS, goalLabel, toSec } from '../../shared/fitness.js';
import { LEVELS } from '../../shared/report.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
let password = '';
try { password = sessionStorage.getItem('navid-admin-key') || localStorage.getItem('navid-admin-key') || ''; } catch { /* blocked */ }
const api = async (path, body) => {
  const res = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-admin-key': password }, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Error ${res.status}`);
  return out;
};
const lvLabel = (ls) => {
  const v = (ls ?? []).filter((n) => n >= 1).sort((a, b) => a - b);
  const l = (n) => LEVELS.find((x) => x.n === n)?.label ?? n;
  return !v.length ? '' : v.length === 1 ? l(v[0]) : `${l(v[0])}–${l(v.at(-1))}`;
};
const STATUS_TXT = { approved: '✓ approved', rejected: '✕ rejected', pending: 'waiting for you' };

let data = { library: [], plans: {}, links: {}, status: { plans: {} }, raw: {} };
let byId = new Map();
const ui = { tab: 'plans', band: '3-4', week: 1, goal: '', where: '', st: 'pending', q: '', limit: 30 };
let poll = null;

function showError(msg) { const e = $('[data-error]'); e.hidden = !msg; e.textContent = msg ?? ''; }

async function load() {
  if (!password) { showError('Log in on the Admin page first, then come back.'); return; }
  try {
    data = await api('/api/admin/fitness');
    byId = new Map(data.library.map((e) => [e.id, e]));
    showError('');
    render();
  } catch (err) { showError(err.message); }
  const running = data.status.merge?.state === 'running' || Object.values(data.status.plans ?? {}).some((p) => p.state === 'running');
  clearTimeout(poll);
  if (running) poll = setTimeout(load, 8000);
}

function render() {
  const lib = data.library;
  const ap = lib.filter((e) => e.status === 'approved').length;
  const m = data.status.merge;
  $('[data-stats]').innerHTML = `
    <div><b>${data.raw.total ?? 0}</b><span>exercises found in fitness videos</span></div>
    <div><b>${lib.length || '—'}</b><span>after merging duplicates</span></div>
    <div><b>${ap}</b><span>approved by you</span></div>
    <div class="fx-merge">${m?.state === 'running' ? '<span class="fx-run">Merging duplicates… (about a minute)</span>'
    : `<button class="btn ${lib.length ? 'btn--ghost' : 'btn--lime'}" type="button" data-merge>${lib.length ? '↻ Merge again (new videos)' : 'Merge duplicates'}</button><small>AI, text only · about $0.02</small>`}
    ${m?.state === 'error' ? `<small class="fx-bad">Last merge failed: ${esc(m.error)}</small>` : ''}</div>`;
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === ui.tab));
  document.querySelectorAll('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== ui.tab; });
  if (ui.tab === 'plans') renderPlans();
  if (ui.tab === 'library') renderLibrary();
  if (ui.tab === 'links') renderLinks();
}

// ---------- Plans ----------
const play = (mo) => (mo ? `<button class="fx-play" type="button" data-play="${esc(mo.source)}" data-t="${toSec(mo.time)}" title="${esc(mo.title)}">▶ ${esc(mo.time)}</button>` : '');
function exRow(it, i, ctx) {
  const e = byId.get(it.ex);
  if (!e) return `<li class="is-gone"><span>Exercise no longer in the library</span><button class="fx-x" type="button" data-remove="${i}" ${ctx}>Remove</button></li>`;
  return `<li class="st-${e.status}">
    <div class="fx-ex">
      <b>${esc(e.name)}</b> <span class="fx-goal">${esc(goalLabel(e.goal))}</span>
      <small>${esc(e.how)}${e.caution ? ` · ⚠ ${esc(e.caution)}` : ''}</small>
      <small>${e.equipment ? `${esc(e.equipment)} · ` : ''}helps: ${esc(e.padel_links.join(', '))}${e.videos > 1 ? ` · <i>in ${e.videos} videos</i>` : ''}</small>
      <div class="fx-row">${play(e.moments[0])}
        <input class="fx-dose" value="${esc(it.dose)}" data-dose="${i}" ${ctx} aria-label="Dose" />
        <span class="fx-st">${STATUS_TXT[e.status]}</span>
        ${e.status !== 'approved' ? `<button class="fx-ok" type="button" data-review="${esc(e.id)}" data-st="approved">✓ OK</button>` : ''}
        ${e.status !== 'rejected' ? `<button class="fx-x" type="button" data-review="${esc(e.id)}" data-st="rejected">✕ Not good</button>` : ''}
        <button class="fx-x" type="button" data-swap="${i}" ${ctx}>⇄ Swap</button>
        <button class="fx-x" type="button" data-remove="${i}" ${ctx}>Remove</button>
      </div>
      <div data-video></div><div data-swapbox></div>
    </div></li>`;
}

function renderPlans() {
  const box = $('[data-view="plans"]');
  const band = BANDS.find((b) => b.id === ui.band);
  const plan = data.plans[ui.band];
  const st = data.status.plans?.[ui.band];
  const chips = BANDS.map((b) => {
    const p = data.plans[b.id];
    return `<button type="button" data-band="${b.id}" class="${b.id === ui.band ? 'is-on' : ''}">${esc(b.label)} <small>${esc(b.name)}${p ? (p.status === 'approved' ? ' · ✓' : ' · draft') : ''}</small></button>`;
  }).join('');
  let body = '';
  const maker = (again) => `<div class="fx-make">
      <textarea data-note rows="2" placeholder="${again ? 'What should change? e.g. more shoulder work, fewer jumps, add a 10-min court endurance block…' : 'Optional: anything the AI should know (e.g. more shoulder and knee work)'}"></textarea>
      <button class="btn ${again ? 'btn--ghost' : 'btn--lime'}" type="button" data-make>${again ? '↻ Make a new version' : 'Make a draft plan'}</button>
      <small>AI · about $0.05–0.10 per plan · takes 1–3 minutes</small></div>`;
  if (!data.library.length) body = '<p class="note">First press <b>Merge duplicates</b> above: the plan is built from the merged exercise list.</p>';
  else if (st?.state === 'running') body = '<p class="fx-run">The AI is writing the 4-week plan… (1–3 minutes, this page updates by itself)</p>';
  else if (!plan) body = `<p class="note">No plan for ${esc(band.label)} yet.</p>${st?.state === 'error' ? `<p class="fx-bad">Last try failed: ${esc(st.error)}</p>` : ''}${maker(false)}`;
  else {
    const used = [...new Set(plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.parts.flatMap((p) => p.items.map((it) => it.ex)))))].map((id) => byId.get(id)).filter(Boolean);
    const waiting = used.filter((e) => e.status === 'pending');
    const rejected = used.filter((e) => e.status === 'rejected');
    const week = plan.weeks.find((w) => w.week === ui.week) ?? plan.weeks[0];
    body = `
      <div class="fx-planhead">
        <span class="fx-badge ${plan.status}">${plan.status === 'approved' ? '✓ Approved — students see it' : 'Draft — students don’t see it yet'}</span>
        <small>${used.length} different exercises · made ${new Date(plan.at).toLocaleDateString()}${plan.note ? ` · your note: “${esc(plan.note)}”` : ''}</small>
      </div>
      <p class="fx-overview">${esc(plan.overview)}</p>
      ${waiting.length ? `<p class="fx-warn">${waiting.length} exercise${waiting.length > 1 ? 's' : ''} in this plan still need your OK (students only see approved ones). Check them below, or <button class="fx-link" type="button" data-approve-all>approve all ${waiting.length} at once</button>.</p>` : ''}
      ${rejected.length ? `<p class="fx-warn">${rejected.length} exercise${rejected.length > 1 ? 's' : ''} you rejected ${rejected.length > 1 ? 'are' : 'is'} still in the plan — swap or remove ${rejected.length > 1 ? 'them' : 'it'}.</p>` : ''}
      <nav class="fx-weeks">${plan.weeks.map((w) => `<button type="button" data-week="${w.week}" class="${w.week === week.week ? 'is-on' : ''}">Week ${w.week}</button>`).join('')}</nav>
      <p class="fx-wfocus">${esc(week.focus)}</p>
      <div class="fx-days">${week.sessions.map((s) => {
    const d = DAYS.find((x) => x.id === s.day);
    return `<article class="fx-day"><h3>${d.icon} ${esc(d.label)} <small>${esc(s.focus)}</small></h3>
        ${s.parts.map((p) => {
    const P = PARTS.find((x) => x.id === p.part);
    const ctx = `data-w="${week.week}" data-d="${s.day}" data-p="${p.part}"`;
    return `<h4>${esc(P.label)} <small>${P.minutes} min</small></h4><ol class="fx-list">${p.items.map((it, i) => exRow(it, i, ctx)).join('')}</ol>
          <button class="fx-x fx-add" type="button" data-add ${ctx}>＋ Add exercise</button><div data-addbox></div>`;
  }).join('')}</article>`;
  }).join('')}</div>
      <div class="fx-actions">
        ${plan.status === 'approved' ? '<button class="btn btn--ghost" type="button" data-plan-status="draft">Back to draft (hide from students)</button>'
    : `<button class="btn btn--lime" type="button" data-plan-status="approved">✓ Approve this plan</button>${waiting.length || rejected.length ? '<small>Only your approved exercises will show to students.</small>' : ''}`}
      </div>
      ${maker(true)}`;
  }
  box.innerHTML = `<h2>4-week plan by level</h2><p class="note">Most of your students are D+ to C+. Pick a level band:</p><nav class="fx-bands">${chips}</nav>${body}`;
}

// ---------- Library ----------
function renderLibrary() {
  const box = $('[data-view="library"]');
  const q = ui.q.toLowerCase();
  const list = data.library.filter((e) => (!ui.goal || e.goal === ui.goal) && (!ui.where || e.where.includes(ui.where)) && (!ui.st || e.status === ui.st)
    && (!q || `${e.name} ${e.how} ${e.padel_links.join(' ')} ${e.body_part}`.toLowerCase().includes(q)));
  const opt = (v, cur, label) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  box.innerHTML = `<h2>Exercise library</h2>
    <p class="note">The same exercise from different videos is merged into one card (“in N videos”). Approve the good ones, reject the rest. You can fix the name, the cue, the dose and the levels — approved exercises also count as approved in the Coaching guide.</p>
    <div class="fx-filters">
      <select data-f="goal">${opt('', ui.goal, 'All goals')}${GOALS.map((g) => opt(g.id, ui.goal, g.label)).join('')}</select>
      <select data-f="where">${opt('', ui.where, 'Gym, home & court')}${DAYS.map((d) => opt(d.id, ui.where, d.label)).join('')}</select>
      <select data-f="st">${opt('pending', ui.st, 'Waiting for you')}${opt('approved', ui.st, 'Approved')}${opt('rejected', ui.st, 'Rejected')}${opt('', ui.st, 'All')}</select>
      <input data-f="q" type="search" placeholder="Search: shoulder, split step, band…" value="${esc(ui.q)}" />
      <span class="note">${list.length} shown</span>
    </div>
    <ul class="fx-lib">${list.slice(0, ui.limit).map((e) => `<li class="st-${e.status}" data-id="${esc(e.id)}">
      <div class="fx-ex">
        <b>${esc(e.name)}</b> <span class="fx-goal">${esc(goalLabel(e.goal))}</span> <span class="fx-goal">${esc(e.where.join(' / '))}</span>${lvLabel(e.levels) ? ` <span class="fx-goal">${esc(lvLabel(e.levels))}</span>` : ''}
        <small>${esc(e.how)}</small>
        <small>${e.dose ? `${esc(e.dose)} · ` : ''}${e.equipment ? `${esc(e.equipment)} · ` : ''}helps: ${esc(e.padel_links.join(', '))}${e.caution ? ` · ⚠ ${esc(e.caution)}` : ''}</small>
        <div class="fx-row">${e.moments.map(play).join('')}${e.videos > 1 ? `<span class="fx-said">in ${e.videos} videos</span>` : ''}
          <span class="fx-st">${STATUS_TXT[e.status]}</span>
          ${e.status !== 'approved' ? `<button class="fx-ok" type="button" data-review="${esc(e.id)}" data-st="approved">✓ OK</button>` : ''}
          ${e.status !== 'rejected' ? `<button class="fx-x" type="button" data-review="${esc(e.id)}" data-st="rejected">✕ Not good</button>` : ''}
          <button class="fx-x" type="button" data-edit="${esc(e.id)}">✎ Edit</button>
        </div>
        <div data-video></div><div data-editbox></div>
      </div></li>`).join('')}</ul>
    ${list.length > ui.limit ? `<button class="fx-link" type="button" data-more>Show more (${list.length - ui.limit} left)</button>` : ''}`;
}

// ---------- Student links ----------
function renderLinks() {
  const box = $('[data-view="links"]');
  const links = Object.entries(data.links).sort((a, b) => b[1].at.localeCompare(a[1].at));
  box.innerHTML = `<h2>Student links</h2>
    <p class="note">Make a private link for a student and send it on WhatsApp. They see the approved plan for their level, with a video for every exercise. Free for your students. If the plan for that level isn’t approved yet, the page says “coming soon”.</p>
    <div class="fx-filters"><input data-link-name placeholder="Student’s first name" maxlength="60" />
      <select data-link-band>${BANDS.map((b) => `<option value="${b.id}" ${b.id === ui.band ? 'selected' : ''}>${esc(b.label)} · ${esc(b.name)}${data.plans[b.id]?.status === 'approved' ? ' ✓' : ''}</option>`).join('')}</select>
      <button class="btn btn--lime" type="button" data-link-make>Make link</button></div>
    <ul class="fx-links">${links.map(([t, l]) => {
    const url = `${location.origin}/fitness/${t}`;
    return `<li><b>${esc(l.name)}</b> <span class="fx-goal">${esc(BANDS.find((b) => b.id === l.band)?.label)}</span>
      <a href="${url}" target="_blank" rel="noopener">open</a> <button class="fx-link" type="button" data-copy="${url}">copy link</button>
      <button class="fx-x" type="button" data-link-del="${t}">delete</button></li>`;
  }).join('') || '<li class="note">No links yet.</li>'}</ul>`;
}

// ---------- Actions ----------
async function act(fn) {
  try { await fn(); } catch (err) { showError(err.message); }
}
async function review(id, body) {
  const out = await api('/api/admin/fitness/review', { id, ...body });
  const i = data.library.findIndex((x) => x.id === id);
  data.library[i] = out.exercise; byId.set(id, out.exercise);
}
async function planEdit(body) {
  const out = await api('/api/admin/fitness/plan-edit', { band: ui.band, ...body });
  data.plans[ui.band] = out.plan;
}
const ctxOf = (el) => ({ week: Number(el.dataset.w), day: el.dataset.d, part: el.dataset.p });
function pickerFor(ctx, excludeGoal) {
  const where = ctx.day;
  const opts = data.library.filter((e) => e.status !== 'rejected' && (where === 'gym' || e.where.includes(where)))
    .sort((a, b) => (b.status === 'approved') - (a.status === 'approved') || (a.goal === excludeGoal ? -1 : 0) - (b.goal === excludeGoal ? -1 : 0) || b.videos - a.videos);
  return `<div class="fx-pick"><select data-pick><option value="">Choose an exercise…</option>${GOALS.map((g) => {
    const gs = opts.filter((e) => e.goal === g.id);
    return gs.length ? `<optgroup label="${esc(g.label)}">${gs.map((e) => `<option value="${esc(e.id)}">${e.status === 'approved' ? '✓ ' : ''}${esc(e.name)}</option>`).join('')}</optgroup>` : '';
  }).join('')}</select> <input data-pick-dose placeholder="Dose, e.g. 3 × 10" /></div>`;
}

document.addEventListener('click', (e) => act(async () => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.tab) { ui.tab = t.dataset.tab; render(); return; }
  if (t.dataset.band) { ui.band = t.dataset.band; ui.week = 1; render(); return; }
  if (t.dataset.week) { ui.week = Number(t.dataset.week); render(); return; }
  if (t.dataset.play) {
    const box = t.closest('.fx-ex').querySelector('[data-video]');
    const key = `${t.dataset.play}@${t.dataset.t}`;
    if (box.dataset.key === key) { box.innerHTML = ''; box.dataset.key = ''; return; }
    box.dataset.key = key;
    box.innerHTML = `<iframe class="fx-video" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(t.dataset.play)}?start=${Number(t.dataset.t) || 0}&autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
    return;
  }
  if (t.hasAttribute('data-merge')) {
    if (data.library.length && !confirm('Merge again? Your approvals and edits are kept.')) return;
    await api('/api/admin/fitness/merge', {}); await load(); return;
  }
  if (t.hasAttribute('data-make')) {
    const note = $('[data-note]')?.value ?? '';
    if (data.plans[ui.band]?.status === 'approved' && !confirm('This replaces the approved plan with a new draft (students stop seeing it until you approve again). Go on?')) return;
    await api('/api/admin/fitness/plan', { band: ui.band, note }); await load(); return;
  }
  if (t.dataset.review) { t.disabled = true; await review(t.dataset.review, { status: t.dataset.st }); render(); return; }
  if (t.hasAttribute('data-approve-all')) {
    const plan = data.plans[ui.band];
    const ids = [...new Set(plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.parts.flatMap((p) => p.items.map((it) => it.ex)))))].filter((id) => byId.get(id)?.status === 'pending');
    if (!confirm(`Approve all ${ids.length} exercises in this plan without checking them one by one?`)) return;
    t.disabled = true;
    for (const id of ids) await review(id, { status: 'approved' }); // one by one: each also updates the Coaching guide
    render(); return;
  }
  if (t.dataset.planStatus) { await planEdit({ status: t.dataset.planStatus }); render(); return; }
  if (t.dataset.remove != null) { await planEdit({ ...ctxOf(t), index: Number(t.dataset.remove), remove: true }); render(); return; }
  if (t.dataset.swap != null || t.hasAttribute('data-add')) {
    const ctx = ctxOf(t);
    const isAdd = t.hasAttribute('data-add');
    const box = isAdd ? t.nextElementSibling : t.closest('.fx-ex').querySelector('[data-swapbox]');
    if (box.innerHTML) { box.innerHTML = ''; return; }
    const cur = isAdd ? null : data.plans[ui.band].weeks.find((w) => w.week === ctx.week).sessions.find((s) => s.day === ctx.day).parts.find((p) => p.part === ctx.part).items[Number(t.dataset.swap)];
    box.innerHTML = `${pickerFor(ctx, byId.get(cur?.ex)?.goal)}<button class="fx-ok" type="button" data-pick-save>${isAdd ? 'Add' : 'Swap'}</button>`;
    box.querySelector('[data-pick-dose]').value = cur?.dose ?? '';
    box.querySelector('[data-pick-save]').onclick = () => act(async () => {
      const ex = box.querySelector('[data-pick]').value;
      if (!ex) return;
      const dose = box.querySelector('[data-pick-dose]').value;
      await planEdit(isAdd ? { ...ctx, add: true, ex, dose } : { ...ctx, index: Number(t.dataset.swap), ex, dose });
      render();
    });
    return;
  }
  if (t.dataset.edit) {
    const ex = byId.get(t.dataset.edit);
    const box = t.closest('.fx-ex').querySelector('[data-editbox]');
    if (box.innerHTML) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="fx-editf">
      <label>Name <input data-e="name" value="${esc(ex.name)}" /></label>
      <label>How (cue) <textarea data-e="how" rows="2">${esc(ex.how)}</textarea></label>
      <label>Dose <input data-e="dose" value="${esc(ex.dose)}" /></label>
      <label>Watch out <input data-e="caution" value="${esc(ex.caution)}" /></label>
      <div class="fx-lv">Levels: ${LEVELS.map((l) => `<label><input type="checkbox" data-lv="${l.n}" ${ex.levels.includes(l.n) ? 'checked' : ''}/> ${l.label}</label>`).join('')}</div>
      <button class="fx-ok" type="button" data-edit-save>Save &amp; approve</button></div>`;
    box.querySelector('[data-edit-save]').onclick = () => act(async () => {
      const body = { status: 'approved', levels: [...box.querySelectorAll('[data-lv]:checked')].map((c) => Number(c.dataset.lv)) };
      for (const f of ['name', 'how', 'dose', 'caution']) body[f] = box.querySelector(`[data-e="${f}"]`).value;
      await review(ex.id, body); render();
    });
    return;
  }
  if (t.hasAttribute('data-more')) { ui.limit += 30; render(); return; }
  if (t.hasAttribute('data-link-make')) {
    const name = $('[data-link-name]').value.trim();
    if (!name) { $('[data-link-name]').focus(); return; }
    const out = await api('/api/admin/fitness/link', { name, band: $('[data-link-band]').value });
    await navigator.clipboard?.writeText(out.url).catch(() => {});
    await load(); return;
  }
  if (t.dataset.copy) { await navigator.clipboard.writeText(t.dataset.copy); t.textContent = 'copied ✓'; return; }
  if (t.dataset.linkDel) {
    if (!confirm('Delete this link? The student can’t open it any more.')) return;
    await api('/api/admin/fitness/link', { token: t.dataset.linkDel, remove: true }); await load();
  }
}));

document.addEventListener('change', (e) => act(async () => {
  const t = e.target;
  if (t.dataset.dose != null) { await planEdit({ ...ctxOf(t), index: Number(t.dataset.dose), dose: t.value }); t.classList.add('is-saved'); return; }
  if (t.dataset.f && t.dataset.f !== 'q') { ui[t.dataset.f] = t.value; ui.limit = 30; render(); }
}));
let typing = null;
document.addEventListener('input', (e) => {
  if (e.target.dataset.f !== 'q') return;
  clearTimeout(typing);
  typing = setTimeout(() => { ui.q = e.target.value; ui.limit = 30; render(); const s = $('[data-f="q"]'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }, 250);
});

load();
