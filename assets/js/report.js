// Student's video analysis report: coachnavid.com/report/<token>
import { AREAS, KINDS, REPORT_LABELS, toSeconds } from '../../shared/report.js';
import { demoReport } from '../../shared/demo.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const para = (s) => esc(s).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br />')}</p>`).join('');
const token = location.pathname.split('/').filter(Boolean).pop();
const drive = (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}`;

let adminKey = '';
try { adminKey = sessionStorage.getItem('navid-admin-key') || localStorage.getItem('navid-admin-key') || ''; } catch { /* blocked */ }

function scorecard(r, L) {
  const prev = [...r.history].reverse().find((h) => h.kind === 'match');
  return `
    <section class="rp__sec">
      <h2 class="rp__h">${L.scorecard}</h2>
      <div class="rp__scores">${AREAS.map((a) => {
        const s = r.scores?.[a.id] ?? {};
        if (!s.score) return '';
        const before = prev?.scores?.[a.id]?.score;
        const delta = before ? s.score - before : 0;
        return `<div class="rp__score">
          <div class="rp__score-top"><span>${esc(a[r.lang] ?? a.en)}</span><b>${s.score}<small>/10</small></b></div>
          <div class="rp__bar"><i style="width:${s.score * 10}%"></i>${before ? `<em style="left:${before * 10}%" title="${L.prev}"></em>` : ''}</div>
          ${s.note || before ? `<p>${esc(s.note)}${before ? ` <span class="rp__delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '='}${delta || ''} ${L.prev}</span>` : ''}</p>` : ''}
        </div>`;
      }).join('')}</div>
    </section>`;
}

function items(r, L) {
  const list = r.items.filter((i) => i.title);
  if (!list.length) return '';
  return `
    <section class="rp__sec">
      <h2 class="rp__h">${r.kind === 'match' ? L.fixes : L.errors}</h2>
      <ol class="rp__items">${list.map((i, n) => {
        const sec = toSeconds(i.time);
        const time = i.time ? (r.videoFileId && sec !== null
          ? `<a class="rp__time" href="${drive(r.videoFileId)}/view?t=${sec}" target="_blank" rel="noopener">▶ ${L.watch} ${esc(i.time)}</a>`
          : `<span class="rp__time">${esc(i.time)}</span>`) : '';
        return `<li class="rp__item">
          <div class="rp__num">${n + 1}</div>
          <div>
            ${time}
            <h3>${esc(i.title)}</h3>
            ${i.detail ? para(i.detail) : ''}
            ${i.fix ? `<div class="rp__fix"><b>${L.fix}</b>${para(i.fix)}</div>` : ''}
            ${i.drillName || i.drillHow ? `<div class="rp__drill"><b>${L.drill}: ${esc(i.drillName)}</b>${para(i.drillHow)}</div>` : ''}
          </div>
        </li>`;
      }).join('')}</ol>
    </section>`;
}

function render(r) {
  const L = REPORT_LABELS[r.lang] ?? REPORT_LABELS.en;
  document.documentElement.lang = r.lang;
  document.title = `${L.report} · ${r.student.firstName} · Coach Navid`;
  const kindName = KINDS[r.kind]?.name ?? '';
  const date = new Date(r.publishedAt || r.updatedAt || r.createdAt).toLocaleDateString(r.lang === 'lt' ? 'lt-LT' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const media = r.mediaFileId ? `
    <section class="rp__sec">
      <h2 class="rp__h">${r.kind === 'match' ? L.voiceover : L.voice}</h2>
      <div class="rp__embed ${r.kind === 'match' ? '' : 'rp__embed--audio'}"><iframe src="${drive(r.mediaFileId)}/preview" allow="autoplay" title="${esc(L.voice)}"></iframe></div>
      <a class="rp__print-link" href="${drive(r.mediaFileId)}/view">${drive(r.mediaFileId)}/view</a>
    </section>` : '';
  const weeks = r.weeks?.some((w) => w.focus || w.plan) ? `
    <section class="rp__sec">
      <h2 class="rp__h">${L.plan}</h2>
      <div class="rp__weeks">${r.weeks.map((w, i) => `<div class="rp__week"><span>${L.week} ${i + 1}</span><h3>${esc(w.focus)}</h3>${para(w.plan)}</div>`).join('')}</div>
    </section>` : '';
  const history = r.history.length ? `
    <section class="rp__sec rp__noprint">
      <h2 class="rp__h">${L.history}</h2>
      <ul class="rp__history">${r.history.map((h) => `<li><a href="/report/${esc(h.token)}">${esc(KINDS[h.kind]?.name)} · ${new Date(h.publishedAt).toLocaleDateString('en-GB')} — ${esc(h.headline)}</a></li>`).join('')}</ul>
    </section>` : '';

  $('[data-report]').innerHTML = `
    ${r.status !== 'published' ? `<p class="rp__draft">${L.draft}</p>` : ''}
    ${r.example ? '<p class="rp__draft">📋 Example report — this is what you receive. <a href="/analysis#plans">Get your own analysis →</a></p>' : ''}
    <section class="rp__hero">
      <p class="kicker">${L.report} · ${esc(kindName)} · ${esc(r.ref)}</p>
      <h1 class="rp__title">${esc(r.headline || kindName)}</h1>
      <p class="rp__for">${L.for ? `${L.for} ` : ''}<b>${esc(r.student.firstName)} ${esc(r.student.lastName)}</b> · ${esc(date)}</p>
      <p class="rp__by">${L.by}</p>
    </section>
    ${r.videoFileId ? `<section class="rp__sec rp__noprint"><h2 class="rp__h">${L.video}</h2><div class="rp__embed"><iframe src="${drive(r.videoFileId)}/preview" allow="autoplay" allowfullscreen title="${esc(L.video)}"></iframe></div></section>` : ''}
    ${r.summary ? `<section class="rp__sec"><h2 class="rp__h">${L.summary}</h2>${para(r.summary)}</section>` : ''}
    ${r.strengths ? `<section class="rp__sec rp__good"><h2 class="rp__h">${L.strengths}</h2>${para(r.strengths)}</section>` : ''}
    ${KINDS[r.kind]?.scores ? scorecard(r, L) : ''}
    ${items(r, L)}
    ${media}
    ${weeks}
    ${r.closing ? `<section class="rp__sec rp__closing"><h2 class="rp__h">${L.closing}</h2>${para(r.closing)}<p class="rp__sign">— Coach Navid</p></section>` : ''}
    ${r.playerToken ? `<div class="rp__progress rp__noprint"><p>📈 ${L.progress}</p><a class="btn btn--lime" href="/player/${esc(r.playerToken)}">${L.progressCta}</a></div>` : ''}
    <div class="rp__cta rp__noprint">
      <button class="btn btn--lime" type="button" data-pdf>${L.pdf}</button>
      <a class="btn btn--ghost" href="/#book">${L.book}</a>
    </div>
    ${history}`;
  document.querySelectorAll('[data-pdf]').forEach((b) => { b.hidden = false; b.textContent = b.closest('nav') ? 'PDF' : L.pdf; });
}

document.addEventListener('click', (e) => { if (e.target.closest('[data-pdf]')) window.print(); });

(token.startsWith('demo-') ? Promise.resolve(demoReport(token)).then((r) => { if (!r) throw new Error(); return r; }) : fetch(`/api/report/${encodeURIComponent(token)}`, { headers: adminKey ? { 'x-admin-key': adminKey } : {} })
  .then(async (res) => { if (!res.ok) throw new Error(); return res.json(); }))
  .then(render)
  .catch(() => { $('[data-report]').innerHTML = '<p class="note">This report isn’t available. Please check the link Coach Navid sent you.</p>'; });
