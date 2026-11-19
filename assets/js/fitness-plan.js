// Student's padel fitness plan (private link /fitness/<token>): Navid's approved 4-week plan for
// their level, 3 × 45 min a week, with the video moment for every exercise. Remembers ticked sessions.
import { BANDS, DAYS, PARTS, goalLabel, toSec } from '../../shared/fitness.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const token = location.pathname.split('/').filter(Boolean).pop();
const main = $('[data-plan]');
let plan = null;
let week = 1;
const doneKey = `fitness-done-${token}`;
let done = {};
try { done = JSON.parse(localStorage.getItem(doneKey) || '{}'); } catch { /* private mode */ }

function render() {
  const band = BANDS.find((b) => b.id === plan.band);
  const w = plan.weeks.find((x) => x.week === week) ?? plan.weeks[0];
  main.innerHTML = `
    <section class="adm-box">
      <p class="fx-kicker">Padel fitness · level ${esc(band?.label)}</p>
      <h1 class="fx-h1">Hi ${esc(plan.name)} — your 4-week plan</h1>
      <p class="fx-overview">${esc(plan.overview)}</p>
      <p class="note">3 sessions a week, 45 minutes each: one in the gym, one at home (a resistance band, light dumbbells if you have them) and one on court. Every session: 10 min warm-up, 30 min main block, 5 min finisher. Tap ▶ to see how each exercise is done.</p>
      <p class="fxs-safety">${esc(plan.safety)}</p>
      <nav class="fx-weeks">${plan.weeks.map((x) => {
    const n = DAYS.filter((d) => done[`${x.week}-${d.id}`]).length;
    return `<button type="button" data-week="${x.week}" class="${x.week === w.week ? 'is-on' : ''}">Week ${x.week}${n ? ` · ${n}/3 ✓` : ''}</button>`;
  }).join('')}</nav>
      <p class="fx-wfocus">${esc(w.focus)}</p>
    </section>
    <div class="fx-days">${w.sessions.map((s) => {
    const d = DAYS.find((x) => x.id === s.day);
    const k = `${w.week}-${s.day}`;
    return `<article class="fx-day"><h3>${d.icon} ${esc(d.label)} <small>${esc(s.focus)}</small></h3>
      ${s.parts.filter((p) => p.items.length).map((p) => {
    const P = PARTS.find((x) => x.id === p.part);
    return `<h4>${esc(P.label)} <small>${P.minutes} min</small></h4><ol class="fx-list">${p.items.map((it) => {
      const e = plan.exercises[it.ex];
      return `<li><div class="fx-ex fxs-ex"><b>${esc(e.name)}</b> <small><b>${esc(it.dose)}</b> · ${esc(goalLabel(e.goal))}${e.equipment && e.equipment !== 'none' ? ` · ${esc(e.equipment)}` : ''}</small>
        <small>${esc(it.cue || e.how)}</small>${e.caution ? `<small>⚠ ${esc(e.caution)}</small>` : ''}
        ${e.padel_links?.length ? `<small>Helps your padel: ${esc(e.padel_links.slice(0, 2).join(', '))}</small>` : ''}
        ${e.moment ? `<div class="fx-row"><button class="fx-play" type="button" data-play="${esc(e.moment.source)}" data-t="${toSec(e.moment.time)}">▶ Watch how</button></div>` : ''}
        <div data-video></div></div></li>`;
    }).join('')}</ol>`;
  }).join('')}
      <label class="fx-row"><input type="checkbox" data-done="${k}" ${done[k] ? 'checked' : ''}/> Done this session</label>
    </article>`;
  }).join('')}</div>`;
}

main.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.week) { week = Number(t.dataset.week); render(); return; }
  if (t.dataset.play) {
    const box = t.closest('.fx-ex').querySelector('[data-video]');
    if (box.innerHTML) { box.innerHTML = ''; return; }
    box.innerHTML = `<iframe class="fx-video" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(t.dataset.play)}?start=${Number(t.dataset.t) || 0}&autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
  }
});
main.addEventListener('change', (e) => {
  const k = e.target.dataset.done;
  if (!k) return;
  done[k] = e.target.checked;
  try { localStorage.setItem(doneKey, JSON.stringify(done)); } catch { /* private mode */ }
  render();
});

(async () => {
  try {
    const res = await fetch(`/api/fitness/${encodeURIComponent(token)}`);
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'Not found');
    if (!out.ready) {
      main.innerHTML = `<section class="adm-box"><h1 class="fx-h1">Hi ${esc(out.name)}!</h1><p>Coach Navid is finishing your fitness plan. Come back to this link soon.</p></section>`;
      return;
    }
    plan = out;
    // start at the first week that isn't fully done
    week = plan.weeks.find((w) => DAYS.some((d) => !done[`${w.week}-${d.id}`]))?.week ?? 1;
    render();
  } catch {
    main.innerHTML = '<section class="adm-box"><p>This link doesn’t work. Ask Coach Navid for a new one.</p></section>';
  }
})();
