// Coach Navid PDF design (lesson summaries and video-analysis reports), modelled on the
// Padel Beast session report: dark cover with contents, then one cream page per section
// with a big condensed title, pills, dash lists and a dark "key concept" box. Coach Navid colours.
const SITE_URL = 'https://coachnavid.com';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const img = (name) => `${SITE_URL}/assets/img/${name}`;

const CSS = `
@page { size: A4; margin: 0; }
:root { --ink: #0d0d0e; --ink2: #3b3a37; --muted: #77746d; --orange: #ff5b1f; --orange-deep: #c63d10; --cream: #f6efe4; --card: #fffaf3; --line: #e3d9ca; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; background: var(--cream); color: var(--ink); font: 400 11.5pt/1.5 'Inter', sans-serif; }
.cover { height: 297mm; background: var(--ink); color: var(--cream); padding: 22mm 22mm 18mm; display: flex; flex-direction: column; align-items: center; text-align: center; page-break-after: always; position: relative; overflow: hidden; }
.cover::before { content: ''; position: absolute; inset: -40% -20% auto auto; width: 120%; height: 80%; background: radial-gradient(closest-side, rgba(255,91,31,.28), transparent); }
.cover__top { font-size: 8.5pt; letter-spacing: .38em; color: #b9b3a8; text-transform: uppercase; position: relative; }
.cover__logo { width: 62mm; margin: 26mm 0 16mm; position: relative; }
.cover__name { font-family: 'Anton', sans-serif; font-size: 46pt; line-height: 1; letter-spacing: .01em; text-transform: uppercase; margin: 0; position: relative; }
.cover__name em { font-style: normal; color: var(--orange); }
.cover__sub { font-size: 13pt; letter-spacing: .04em; margin: 8mm 0 1mm; color: #e9e2d6; position: relative; }
.cover__sub2 { font-size: 10.5pt; color: #a29c91; letter-spacing: .03em; position: relative; }
.toc { width: 100%; margin-top: 12mm; border-top: 1px solid #34322f; text-align: left; position: relative; }
.toc div { display: grid; grid-template-columns: 22mm 1fr; padding: 4.2mm 0; border-bottom: 1px solid #34322f; font-size: 10.5pt; letter-spacing: .14em; text-transform: uppercase; }
.toc b { font-family: 'Anton', sans-serif; color: var(--orange); font-weight: 400; font-size: 13pt; letter-spacing: 0; }
.cover__by { margin-top: auto; padding-top: 8mm; font-size: 9pt; letter-spacing: .38em; color: #b9b3a8; text-transform: uppercase; position: relative; }
.cover__by b { color: var(--cream); }

.page { min-height: 297mm; padding: 15mm 18mm 26mm; position: relative; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.head { display: flex; justify-content: space-between; align-items: center; padding-bottom: 5mm; border-bottom: 1.4px solid var(--orange); margin-bottom: 11mm; }
.head img { width: 13mm; }
.head span { font-size: 8pt; letter-spacing: .3em; color: var(--ink2); text-transform: uppercase; }
.num { font-family: 'Anton', sans-serif; color: var(--orange); font-size: 22pt; line-height: 1; }
h1 { font-family: 'Anton', sans-serif; font-weight: 400; font-size: 44pt; line-height: 1.02; text-transform: uppercase; margin: 1mm 0 2mm; letter-spacing: .005em; }
.sub { font-size: 13pt; letter-spacing: .18em; color: var(--ink2); text-transform: uppercase; margin: 0 0 7mm; }
.pills { display: flex; flex-wrap: wrap; gap: 3mm; margin-bottom: 8mm; }
.pill { background: var(--orange); color: #fff; border-radius: 999px; padding: 2mm 5mm; font-size: 8.5pt; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; }
.pill--ghost { background: transparent; color: var(--ink); border: 1.2px solid var(--ink); }
.label { color: var(--orange-deep); font-weight: 700; font-size: 9pt; letter-spacing: .32em; text-transform: uppercase; margin: 8mm 0 3mm; }
h3 { font-size: 11pt; letter-spacing: .16em; text-transform: uppercase; margin: 5mm 0 2mm; }
p { margin: 0 0 3mm; }
.dash { list-style: none; margin: 0 0 4mm; padding: 0; }
.dash li { position: relative; padding-left: 10mm; margin-bottom: 2.4mm; }
.dash li::before { content: ''; position: absolute; left: 0; top: .72em; width: 6mm; height: 1.6px; background: var(--orange); }
.key { background: var(--ink); color: var(--cream); border-left: 2.2mm solid var(--orange); border-radius: 3mm; padding: 7mm 9mm; margin: 8mm 0; break-inside: avoid; }
.key small { display: block; font-family: 'Anton', sans-serif; color: var(--orange); font-size: 12pt; letter-spacing: .14em; text-transform: uppercase; margin-bottom: 2mm; }
.key p { font-size: 12.5pt; font-weight: 600; margin: 0; line-height: 1.45; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin: 4mm 0; }
.card { background: var(--card); border-radius: 3mm; border-top: 1.6mm solid var(--orange); padding: 5mm 6mm; break-inside: avoid; }
.card b { display: block; font-family: 'Anton', sans-serif; font-weight: 400; font-size: 14pt; text-transform: uppercase; letter-spacing: .01em; margin-bottom: 1.5mm; }
.card p { color: var(--ink2); font-size: 10.5pt; margin: 0; }
.card .tag { font-size: 8pt; letter-spacing: .2em; color: var(--orange-deep); font-weight: 700; text-transform: uppercase; }
.focus { list-style: none; padding: 0; margin: 0; }
.focus li { display: grid; grid-template-columns: 12mm 1fr; padding: 2.5mm 0; font-size: 12.5pt; }
.focus b { font-family: 'Anton', sans-serif; color: var(--orange); font-weight: 400; }
.bars { display: grid; gap: 4mm; }
.bar { break-inside: avoid; }
.bar__top { display: flex; justify-content: space-between; align-items: baseline; font-weight: 600; }
.bar__top b { font-family: 'Anton', sans-serif; font-weight: 400; font-size: 18pt; color: var(--orange); }
.bar__top b small { font-family: 'Inter'; font-size: 9pt; color: var(--muted); }
.bar__track { height: 2.6mm; background: var(--line); border-radius: 99px; position: relative; margin: 1.5mm 0; }
.bar__track i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, var(--orange-deep), var(--orange)); border-radius: 99px; }
.bar__track em { position: absolute; top: -1mm; width: .6mm; height: 4.6mm; background: var(--ink); }
.bar p { font-size: 9.5pt; color: var(--ink2); margin: 0; }
.bar ul { margin: 1mm 0 0; padding: 0; list-style: none; columns: 2; font-size: 9pt; color: var(--ink2); }
.up { color: #1f8a3a; font-weight: 700; } .down { color: #c0392b; font-weight: 700; }
.foot { position: absolute; left: 18mm; right: 18mm; bottom: 11mm; border-top: 1px solid var(--line); padding-top: 3.5mm; display: flex; justify-content: space-between; font-size: 7.5pt; letter-spacing: .3em; color: var(--ink2); text-transform: uppercase; }
`;

// Section blocks (each returns HTML)
export const block = {
  label: (t) => `<p class="label">${esc(t)}</p>`,
  h3: (t) => `<h3>${esc(t)}</h3>`,
  text: (t) => (t ? String(t).split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('') : ''),
  list: (arr) => (arr?.length ? `<ul class="dash">${arr.map((x) => `<li>${x.html ?? esc(x)}</li>`).join('')}</ul>` : ''),
  key: (title, t) => (t ? `<div class="key"><small>${esc(title)}</small><p>${esc(t)}</p></div>` : ''),
  cards: (items) => (items?.length ? `<div class="cards">${items.map((c) => `<div class="card">${c.tag ? `<span class="tag">${esc(c.tag)}</span>` : ''}<b>${esc(c.title)}</b><p>${esc(c.text)}</p></div>`).join('')}</div>` : ''),
  focus: (arr) => (arr?.length ? `<ol class="focus">${arr.map((x, i) => `<li><b>${ROMAN[i] ?? i + 1}</b><span>${esc(x)}</span></li>`).join('')}</ol>` : ''),
  raw: (h) => h,
};

/**
 * doc({ lang, top, first, last, sub, sub2, by, header, footRight, sections: [{ title, sub, pills, body }] })
 * `body` is HTML built with `block.*`. Empty sections are left out.
 */
export function doc({ top, first, last, sub, sub2, by, header, sections, footLeft = 'Navid Fahandezh · Padel Beast', footRight = 'coachnavid.com', lang = 'en' }) {
  const list = sections.filter((s) => s && s.body && s.body.trim());
  const total = ROMAN[list.length - 1] ?? list.length;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<section class="cover">
  <div class="cover__top">${esc(top)}</div>
  <img class="cover__logo" src="${img('padel-beast-logo.png')}" alt="Padel Beast">
  <h1 class="cover__name">${esc(first)} <em>${esc(last)}</em></h1>
  <p class="cover__sub">${esc(sub)}</p>
  ${sub2 ? `<p class="cover__sub2">${esc(sub2)}</p>` : ''}
  <div class="toc">${list.map((s, i) => `<div><b>${ROMAN[i]}</b><span>${esc(s.title)}${s.sub ? ` — ${esc(s.sub)}` : ''}</span></div>`).join('')}</div>
  <div class="cover__by">${esc(by[0])} <b>${esc(by[1])}</b></div>
</section>
${list.map((s, i) => `<section class="page">
  <div class="head"><img src="${img('padel-beast-logo-orange.png')}" alt=""><span>${esc(header)}</span></div>
  <div class="num">${ROMAN[i]}</div>
  <h1>${esc(s.title)}</h1>
  ${s.sub ? `<p class="sub">${esc(s.sub)}</p>` : ''}
  ${s.pills?.length ? `<div class="pills">${s.pills.map((p) => `<span class="pill${p.ghost ? ' pill--ghost' : ''}">${esc(p.text ?? p)}</span>`).join('')}</div>` : ''}
  ${s.body}
  <div class="foot"><span>${esc(footLeft)}</span><span>${i === list.length - 1 ? esc(footRight) : `${ROMAN[i]} / ${total}`}</span></div>
</section>`).join('')}
</body></html>`;
}

export const splitName = (p) => ({ first: p.firstName ?? '', last: p.lastName ?? '' });
export const longDate = (iso, lang) => new Date(`${String(iso).slice(0, 10)}T12:00:00Z`)
  .toLocaleDateString(lang === 'lt' ? 'lt-LT' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
