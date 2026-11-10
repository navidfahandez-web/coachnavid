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
    const out = [];
    for (const html of snippets) {
      await page.setContent(`<!doctype html><html><head>${fontsCss}<style>html,body{margin:0;background:transparent}</style></head><body><span id="l">${html}</span></body></html>`, { waitUntil: 'load', timeout: 20000 });
      await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]));
      out.push(Buffer.from(await (await page.$('#l')).screenshot({ omitBackground: true })));
    }
    return out;
  } finally {
    await browser.close();
  }
}
