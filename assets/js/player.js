// Player progress: coachnavid.com/player/<token> — every report, averages and charts.
import { AREAS, KINDS } from '../../shared/report.js';
import { demoPlayer } from '../../shared/demo.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const token = location.pathname.split('/').filter(Boolean).pop();
const round1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => (n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(1));
const mean = (v) => (v.length ? round1(v.reduce((s, n) => s + n, 0) / v.length) : null);

const T = {
  en: {
    title: 'Your progress', reports: 'Reports', now: 'Current average', change: 'Since first report',
    overall: 'Overall average (Match Reports)', areas: 'Progress by area', areaAvg: 'Average per area (all Match Reports)',
    timeline: 'All your reports', fixes: 'Fixes', open: 'Open', table: 'Show the numbers', report: 'Report',
    grow: 'Your charts grow with every Match Report.', none: 'No Match Report scores yet — your charts start with your first Match Report.',
    best: 'Biggest improvement', avg: 'average',
    gw: 'GlassWall AI — stats over time', gwNote: 'From GlassWall’s court-camera AI analysis of your matches.', gwFocus: 'Latest GlassWall focus areas', gwEntry: 'GlassWall AI analysis', gwCount: 'GlassWall analyses', since: 'since first',
  },
  lt: {
    title: 'Jūsų pažanga', reports: 'Ataskaitos', now: 'Dabartinis vidurkis', change: 'Nuo pirmos ataskaitos',
    overall: 'Bendras vidurkis (Match Report)', areas: 'Pažanga pagal sritis', areaAvg: 'Vidurkis pagal sritį (visos Match Report)',
    timeline: 'Visos jūsų ataskaitos', fixes: 'Pataisymai', open: 'Atidaryti', table: 'Rodyti skaičius', report: 'Ataskaita',
    grow: 'Grafikai pildosi su kiekviena Match Report.', none: 'Dar nėra Match Report įvertinimų — grafikai prasidės nuo pirmos Match Report.',
    best: 'Didžiausias pagerėjimas', avg: 'vidurkis',
    gw: 'GlassWall AI — statistika laike', gwNote: 'Iš GlassWall kortų kamerų AI analizės.', gwFocus: 'Naujausios GlassWall sritys', gwEntry: 'GlassWall AI analizė', gwCount: 'GlassWall analizės', since: 'nuo pirmos',
  },
};

const day = (iso, lang) => new Date(iso).toLocaleDateString(lang === 'lt' ? 'lt-LT' : 'en-GB', { day: 'numeric', month: 'short' });

// ---------- line chart (single series, fixed 0–10 scale, SVG) ----------
// points: [{ label, value, tip }]
function lineChart(points, { height = 200, compact = false, max = 10 } = {}) {
  const W = compact ? 300 : innerWidth < 600 ? 360 : 640, H = height;
  const pad = compact ? { l: 22, r: 16, t: 14, b: 22 } : { l: 30, r: 28, t: 18, b: 30 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => pad.t + ih - (Math.min(v, max) / max) * ih;
  const grid = (compact ? [0, max / 2, max] : [0, 1, 2, 3, 4, 5].map((n) => (max * n) / 5)).map((v) => `
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="pl__grid" />
    <text x="${pad.l - 8}" y="${y(v) + 4}" class="pl__axis" text-anchor="end">${v}</text>`).join('');
  const valid = points.map((p, i) => ({ ...p, i })).filter((p) => p.value !== null);
  const path = valid.map((p, n) => `${n ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const labels = compact ? '' : points.map((p, i) => `<text x="${x(i)}" y="${H - 8}" class="pl__axis" text-anchor="middle">${esc(p.label)}</text>`).join('');
  const last = valid.at(-1);
  return `<svg class="pl__chart" viewBox="0 0 ${W} ${H}" role="img">
    ${grid}${labels}
    ${valid.length > 1 ? `<path d="${path}" class="pl__line" />` : ''}
    ${valid.map((p) => `<circle cx="${x(p.i)}" cy="${y(p.value)}" r="${compact ? 4 : 5}" class="pl__dot" />`).join('')}
    ${last ? `<text x="${x(last.i) + (compact ? 0 : 10)}" y="${y(last.value) - 10}" class="pl__val" text-anchor="${compact ? 'middle' : 'start'}">${fmt(last.value)}</text>` : ''}
    ${valid.map((p) => `<circle cx="${x(p.i)}" cy="${y(p.value)}" r="16" class="pl__hit" data-tip="${esc(p.tip)}" />`).join('')}
  </svg>`;
}

function render(d) {
  const lang = d.reports.at(-1)?.lang ?? 'en';
  const L = T[lang] ?? T.en;
  document.documentElement.lang = lang;
  document.title = `${L.title} · ${d.firstName} · Coach Navid`;

  const matches = d.reports.filter((r) => r.kind === 'match' && r.average !== null);
  const first = matches[0], last = matches.at(-1);
  const change = first && last && matches.length > 1 ? round1(last.average - first.average) : null;

  // per-area series + averages
  const areas = AREAS.map((a) => {
    const vals = matches.map((r) => r.scores?.[a.id]?.score ?? null);
    const known = vals.filter((v) => v !== null);
    return { ...a, vals, avg: mean(known), delta: known.length > 1 ? known.at(-1) - known[0] : null };
  });
  const best = areas.filter((a) => a.delta > 0).sort((a, b) => b.delta - a.delta)[0];

  const ext = d.external ?? [];
  const tiles = `
    <div class="pl__tiles">
      <div class="pl__tile"><span>${L.reports}</span><b>${d.reports.length}</b></div>
      <div class="pl__tile"><span>${L.now}</span><b>${fmt(last?.average)}<small>/10</small></b></div>
      <div class="pl__tile"><span>${L.change}</span><b class="${change > 0 ? 'up' : change < 0 ? 'down' : ''}">${change === null ? '—' : `${change > 0 ? '▲ +' : change < 0 ? '▼ ' : ''}${fmt(change)}`}</b></div>
      ${ext.length ? `<div class="pl__tile"><span>${L.gwCount}</span><b>${ext.length}</b></div>` : ''}
      ${best ? `<div class="pl__tile"><span>${L.best}</span><b class="up">▲ +${best.delta}</b><small>${esc(best[lang] ?? best.en)}</small></div>` : ''}
    </div>`;

  const charts = matches.length ? `
    <section class="rp__sec">
      <h2 class="rp__h">${L.overall}</h2>
      <div class="pl__card">${lineChart(matches.map((r) => ({ label: day(r.publishedAt, lang), value: r.average, tip: `${day(r.publishedAt, lang)} · ${L.avg} ${fmt(r.average)}/10` })))}</div>
      ${matches.length === 1 ? `<p class="note">${L.grow}</p>` : ''}
    </section>
    <section class="rp__sec">
      <h2 class="rp__h">${L.areas}</h2>
      <div class="pl__multiples">${areas.map((a) => `
        <div class="pl__card pl__mini">
          <div class="pl__mini-top"><b>${esc(a[lang] ?? a.en)}</b>${a.delta !== null ? `<span class="rp__delta ${a.delta > 0 ? 'up' : a.delta < 0 ? 'down' : ''}">${a.delta > 0 ? '▲ +' : a.delta < 0 ? '▼ ' : '= '}${a.delta || ''}</span>` : ''}</div>
          ${lineChart(a.vals.map((v, i) => ({ label: day(matches[i].publishedAt, lang), value: v, tip: `${day(matches[i].publishedAt, lang)} · ${v ?? '—'}/10` })), { height: 130, compact: true })}
        </div>`).join('')}
      </div>
    </section>
    <section class="rp__sec">
      <h2 class="rp__h">${L.areaAvg}</h2>
      <div class="rp__scores">${areas.map((a) => `
        <div class="rp__score">
          <div class="rp__score-top"><span>${esc(a[lang] ?? a.en)}</span><b>${fmt(a.avg)}<small>/10</small></b></div>
          <div class="rp__bar"><i style="width:${(a.avg ?? 0) * 10}%"></i></div>
        </div>`).join('')}
      </div>
      <details class="pl__table">
        <summary>${L.table}</summary>
        <div class="pl__scroll"><table>
          <thead><tr><th></th>${matches.map((r) => `<th>${esc(day(r.publishedAt, lang))}</th>`).join('')}<th>Ø</th></tr></thead>
          <tbody>
            ${areas.map((a) => `<tr><th>${esc(a[lang] ?? a.en)}</th>${a.vals.map((v) => `<td>${v ?? '—'}</td>`).join('')}<td><b>${fmt(a.avg)}</b></td></tr>`).join('')}
            <tr class="pl__total"><th>${L.avg}</th>${matches.map((r) => `<td>${fmt(r.average)}</td>`).join('')}<td><b>${fmt(mean(matches.map((r) => r.average)))}</b></td></tr>
          </tbody>
        </table></div>
      </details>
    </section>` : (d.external?.length ? '' : `<p class="note">${L.none}</p>`);

  // GlassWall (external AI) — every stat charted over time, plus the latest focus areas
  const unitText = (m) => (m.unit === '%' ? '%' : m.unit ? ` ${m.unit}` : '');
  const series = [...new Set(ext.flatMap((e) => e.metrics.map((m) => m.name)))].map((name) => {
    const pts = ext.map((e) => ({ e, m: e.metrics.find((m) => m.name === name) })).filter((p) => p.m);
    const top = Math.max(...pts.map((p) => p.m.value));
    return { name, pts, max: pts[0].m.unit === '%' ? 100 : Math.max(10, Math.ceil((top * 1.25) / 5) * 5) };
  });
  const latest = ext.at(-1);
  const glasswall = ext.length ? `
    <section class="rp__sec">
      <h2 class="rp__h">${L.gw}</h2>
      <p class="note">${L.gwNote}</p>
      ${series.length ? `<div class="pl__multiples">${series.map((s) => {
        const first = s.pts[0].m, last = s.pts.at(-1).m;
        const delta = s.pts.length > 1 ? round1(last.value - first.value) : null;
        return `<div class="pl__card pl__mini">
          <div class="pl__mini-top"><b>${esc(s.name)}</b>${delta !== null ? `<span class="rp__delta">${delta > 0 ? '+' : ''}${fmt(delta)}${last.unit === '%' ? ' pts' : unitText(last)} ${L.since}</span>` : ''}</div>
          ${lineChart(s.pts.map((p) => ({ label: p.e.date, value: p.m.value, tip: `${day(p.e.date, lang)} · ${fmt(p.m.value)}${unitText(p.m)}` })), { height: 130, compact: true, max: s.max })}
        </div>`;
      }).join('')}</div>` : ''}
      ${latest.focus.length ? `<h3 class="pl__sub">${L.gwFocus} · ${esc(day(latest.date, lang))}</h3>
      <div class="pl__gwfocus">${latest.focus.map((f) => `
        <div class="pl__card"><span class="pl__cat">${esc(f.category)}</span><b>${esc(f.title)}</b><p>${esc(f.finding)}</p>
          ${f.drills.map((x) => `<p class="pl__drill">• ${esc(x)}</p>`).join('')}</div>`).join('')}</div>` : ''}
    </section>` : '';

  const timeline = `
    <section class="rp__sec">
      <h2 class="rp__h">${L.timeline}</h2>
      <ol class="pl__timeline">${[
        ...d.reports.map((r) => ({ at: r.publishedAt, r })),
        ...ext.map((e) => ({ at: `${e.date}T${e.time || '12:00'}:00Z`, e })),
      ].sort((a, b) => b.at.localeCompare(a.at)).map(({ r, e }) => (e ? `
        <li class="pl__ext">
          <div class="pl__when">${esc(day(e.date, lang))}<small>${L.gwEntry}</small></div>
          <div>
            <b>${esc(e.focus.map((f) => f.title).join(' · ') || L.gwEntry)}</b>
            ${e.pdfFileId ? `<a class="pl__pdf" href="https://drive.google.com/file/d/${encodeURIComponent(e.pdfFileId)}/view" target="_blank" rel="noopener">PDF ↗</a>` : ''}
            ${e.metrics.length ? `<p>${e.metrics.map((m) => `${esc(m.name)}: ${fmt(m.value)}${esc(unitText(m))}`).join(' · ')}</p>` : ''}
          </div>
        </li>` : `
        <li>
          <div class="pl__when">${esc(day(r.publishedAt, lang))}<small>${esc(KINDS[r.kind]?.name)}${r.average !== null ? ` · ${fmt(r.average)}/10` : ''}</small></div>
          <div>
            <a href="/report/${esc(r.token)}"><b>${esc(r.headline || KINDS[r.kind]?.name)}</b> ↗</a>
            ${r.pdfFileId ? `<a class="pl__pdf" href="https://drive.google.com/uc?export=download&id=${encodeURIComponent(r.pdfFileId)}">PDF ↓</a>` : ''}
            ${r.fixes.length ? `<p>${L.fixes}: ${r.fixes.map(esc).join(' · ')}</p>` : ''}
          </div>
        </li>`)).join('')}
      </ol>
    </section>`;

  if (!d.example) { // remember it, so coachnavid.com/me opens straight to this page next time
    try { localStorage.setItem('cn-player', JSON.stringify({ playerToken: token, firstName: d.firstName })); } catch { /* ignore */ }
  }
  $('[data-player]').innerHTML = `
    ${d.example ? '<p class="rp__draft">📋 Example — this is what a player’s progress page looks like after 10 reports. <a href="/analysis#plans">Get your own analysis →</a></p>' : ''}
    <section class="rp__hero">
      <p class="kicker">${L.title}</p>
      <h1 class="rp__title">${esc(d.firstName)} ${esc(d.lastName)}</h1>
      <p class="rp__by">Coach Navid Fahandezh · Technical Director, Padel Beast</p>
    </section>
    ${tiles}${charts}${glasswall}${timeline}`;
}

// ---------- hover tooltip ----------
const tip = $('[data-tip]');
document.addEventListener('pointerover', (e) => {
  const t = e.target.closest('[data-tip]:not(.pl__tip)');
  if (!t) return;
  tip.textContent = t.dataset.tip;
  tip.hidden = false;
  const r = t.getBoundingClientRect();
  tip.style.left = `${r.left + r.width / 2 + scrollX}px`;
  tip.style.top = `${r.top + scrollY - 8}px`;
});
document.addEventListener('pointerout', (e) => { if (e.target.closest('[data-tip]')) tip.hidden = true; });

(token === 'demo' ? Promise.resolve(demoPlayer()) : fetch(`/api/player/${encodeURIComponent(token)}`)
  .then(async (res) => { if (!res.ok) throw new Error(); return res.json(); }))
  .then(render)
  .catch(() => { $('[data-player]').innerHTML = '<p class="note">This page isn’t available. Please check the link Coach Navid sent you.</p>'; });
