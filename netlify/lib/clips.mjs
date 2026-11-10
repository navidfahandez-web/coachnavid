// "Fix clips": one short video for Navid's voice-over. For each fix in a report: the moment at
// normal speed, then the same moment in slow motion, with a label — about 20 s for three fixes.
// ffmpeg reads only the needed seconds straight from Google Drive (HTTP range requests).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { toSeconds } from '../../shared/report.js';
import { googleAccessToken } from './google.mjs';
import { renderPngs } from './pdf-render.mjs';

export const CLIP = { before: 1.0, length: 2.4, slow: 2 }; // seconds before the timestamp, seconds shown, slow-motion factor

// Labels are drawn as PNGs by headless Chromium (this ffmpeg build has no text filter) and overlaid
const LABEL_CSS = '<link href="https://fonts.googleapis.com/css2?family=Anton&display=swap" rel="stylesheet">';
const label = (text, bg) => `<span style="display:inline-block;padding:10px 20px 8px;background:${bg};color:#fff;font:400 40px Anton,sans-serif;letter-spacing:.02em;border-radius:8px">${text.replace(/[<>&]/g, '')}</span>`;

// Which part of the video each fix uses (Navid can override start/length per fix in the builder)
export function segments(items) {
  return items.filter((i) => i.title && toSeconds(i.time) !== null).map((i, n) => {
    const t = toSeconds(i.time);
    const start = toSeconds(i.clipStart) ?? Math.max(0, t - CLIP.before);
    const length = Math.min(8, Math.max(1, Number(i.clipLen) || CLIP.length));
    return { n: n + 1, title: i.title, start, length };
  });
}

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args);
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-3000); });
    p.on('error', reject);
    // never put the Drive link / access token into an error message
    const clean = (t) => t.replace(/https?:\/\/\S+/g, '<video>').replace(/Bearer\s+\S+/g, 'Bearer <token>');
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${clean(err.split('\n').filter(Boolean).slice(-3).join(' | '))}`))));
  });
}

// Returns the finished MP4 as a Buffer.
export async function makeFixClips(videoFileId, items) {
  const segs = segments(items);
  if (!segs.length) throw new Error('No fixes with a timestamp (m:ss) to make clips from.');
  const dir = mkdtempSync(path.join(tmpdir(), 'clips-'));
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${videoFileId}?alt=media`;
    const auth = `Authorization: Bearer ${await googleAccessToken()}\r\n`;
    // two labels per fix: "1 · LOW VOLLEYS" (accent) and "1 · SLOW MOTION" (dark)
    const pngs = await renderPngs(segs.flatMap((s) => [label(`${s.n} · ${s.title.toUpperCase()}`, '#ff5b1f'), label(`${s.n} · SLOW MOTION`, '#0d0d0e')]), { fontsCss: LABEL_CSS });
    const labelFiles = pngs.map((png, i) => { const f = path.join(dir, `l${i}.png`); writeFileSync(f, png); return f; });
    const inputs = [
      ...segs.flatMap((s) => ['-ss', s.start.toFixed(2), '-t', s.length.toFixed(2), '-headers', auth, '-i', url]),
      ...labelFiles.flatMap((f) => ['-i', f]),
    ];
    const L = (k, slow) => segs.length + k * 2 + (slow ? 1 : 0); // input index of a label image
    const parts = segs.map((s, k) => [
      `[${k}:v]fps=30,scale=-2:720,setsar=1,setpts=PTS-STARTPTS,split=2[a${k}][b${k}]`,
      `[a${k}][${L(k, false)}:v]overlay=40:40,format=yuv420p[n${k}]`,
      `[b${k}]setpts=${CLIP.slow}*PTS[bs${k}];[bs${k}][${L(k, true)}:v]overlay=40:40,format=yuv420p[s${k}]`,
    ].join(';'));
    const concat = `${segs.map((_, k) => `[n${k}][s${k}]`).join('')}concat=n=${segs.length * 2}:v=1:a=0[out]`;
    const out = path.join(dir, 'clips.mp4');
    await run(['-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', `${parts.join(';')};${concat}`,
      '-map', '[out]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
    return { mp4: readFileSync(out), seconds: segs.reduce((t, s) => t + s.length * (1 + CLIP.slow), 0), segments: segs };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
