// HTML → PDF with headless Chromium (the -min package downloads the browser on first use,
// then reuses it while the function is warm). Used from background functions only.
import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';
import { deleteFile, uploadSimple } from './google.mjs';

const PACK = 'https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar';

export async function renderPdf(html) {
  const browser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    executablePath: await chromium.executablePath(PACK),
    headless: 'shell',
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 });
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(await page.pdf({ printBackground: true, preferCSSPageSize: true }));
  } finally {
    await browser.close();
  }
}

// Render and save into the Drive folder; replaces the previous PDF (replaceId) if any.
export async function renderToDrive(html, name, folderId, replaceId = null) {
  const pdf = await renderPdf(html);
  const id = await uploadSimple({ name: `${name}.pdf`, mimeType: 'application/pdf', parents: [folderId] }, pdf, 'application/pdf');
  if (replaceId) await deleteFile(replaceId).catch(() => {});
  return id;
}

// Small PNGs (transparent background) from HTML snippets — e.g. text labels for video clips.
export async function renderPngs(snippets, { fontsCss = '' } = {}) {
  const browser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    executablePath: await chromium.executablePath(PACK),
    headless: 'shell',
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 2000 }); // wide captions (reels) must not be cut at 800 px
    const out = [];
    for (const html of snippets) {
      await page.setContent(`<!doctype html><html><head>${fontsCss}<style>html,body{margin:0;background:transparent}</style></head><body><span id="l" style="display:inline-block">${html}</span></body></html>`, { waitUntil: 'load', timeout: 20000 });
      await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]));
      out.push(Buffer.from(await (await page.$('#l')).screenshot({ omitBackground: true })));
    }
    return out;
  } finally {
    await browser.close();
  }
}

// JPEG pictures from full HTML cards (one browser for all) — e.g. the shot breakdown frames.
export async function renderJpegs(htmls, width = 720) {
  const browser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    executablePath: await chromium.executablePath(PACK),
    headless: 'shell',
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 1200, deviceScaleFactor: 1 });
    const out = [];
    for (const html of htmls) {
      await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
      await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]));
      out.push(Buffer.from(await (await page.$('#card')).screenshot({ type: 'jpeg', quality: 85 })));
    }
    return out;
  } finally {
    await browser.close();
  }
}

// One breakdown card: phase title, the frame with numbered marks (green = good, orange = to fix;
// lines for directions/angles), the legend and the caption. marks: [{ label, kind, p:[y,x], q?, note }].
const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export function markedFrameHtml(jpg, { phase, time, caption, marks }) {
  const col = (m) => (m.kind === 'fix' ? '#ff5b1f' : '#22c55e');
  const lines = marks.filter((m) => m.q).map((m) => `<line x1="${m.p[1] / 10}" y1="${m.p[0] / 10}" x2="${m.q[1] / 10}" y2="${m.q[0] / 10}" stroke="${col(m)}" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke" stroke-dasharray="14 8"/>`).join('');
  const dots = marks.map((m, i) => `<div class="m" style="left:${m.p[1] / 10}%;top:${m.p[0] / 10}%;border-color:${col(m)}"><b style="background:${col(m)}">${i + 1}</b></div>`).join('');
  const legend = marks.map((m, i) => `<li><b style="background:${col(m)}">${i + 1}</b><span><strong>${escH(m.label)}</strong> ${m.kind === 'fix' ? '→ to fix' : '✓'}<br><small>${escH(m.note)}</small></span></li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#111;font:16px/1.35 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#fff}
    #card{width:720px;background:#111}
    .h{display:flex;justify-content:space-between;align-items:baseline;padding:14px 18px;background:#ff5b1f;font-weight:800;font-size:26px;letter-spacing:.04em;text-transform:uppercase}
    .h span{font-size:16px;font-weight:600;letter-spacing:0}
    .f{position:relative;line-height:0}.f img{width:100%;display:block}
    .f svg{position:absolute;inset:0;width:100%;height:100%}
    .m{position:absolute;width:46px;height:46px;margin:-23px 0 0 -23px;border:4px solid;border-radius:50%;box-shadow:0 0 0 2px rgba(0,0,0,.55)}
    .m b{position:absolute;left:30px;top:-14px;min-width:26px;height:26px;border-radius:13px;font:800 17px/26px Arial,sans-serif;text-align:center;color:#111;box-shadow:0 0 0 2px rgba(0,0,0,.55)}
    ul{list-style:none;margin:0;padding:12px 18px 4px}li{display:flex;gap:12px;margin:0 0 10px}
    li>b{flex:none;width:26px;height:26px;border-radius:13px;font:800 16px/26px Arial,sans-serif;text-align:center;color:#111}
    small{color:#c9c9c9;font-size:14px}.c{padding:4px 18px 18px;font-size:17px;font-style:italic;color:#ffd6c4}
  </style></head><body><div id="card">
    <div class="h">${escH(phase)}<span>${escH(time)}</span></div>
    <div class="f"><img src="data:image/jpeg;base64,${jpg.toString('base64')}"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>${dots}</div>
    <ul>${legend}</ul>${caption ? `<div class="c">${escH(caption)}</div>` : ''}
  </div></body></html>`;
}
