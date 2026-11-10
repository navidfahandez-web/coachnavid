// "Fix clips": one short video for Navid's voice-over. For each fix in a report: the moment at
// normal speed, then the same moment in slow motion, with a label — about 20 s for three fixes.
// ffmpeg reads only the needed seconds straight from Google Drive (HTTP range requests).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { toSeconds } from '../../shared/report.js';
import { googleAccessToken } from './google.mjs';
import { renderPngs } from './pdf-render.mjs';

export const CLIP = { before: 1.0, length: 2.4, slow: 2 }; // seconds before the timestamp, seconds shown, slow-motion factor

// Labels are drawn as PNGs by headless Chromium (this ffmpeg build has no text filter) and overlaid
// Anton is bundled with the function (netlify.toml included_files), so no font download is needed
const FONT_FILE = [process.env.LAMBDA_TASK_ROOT, process.cwd()].filter(Boolean)
  .map((d) => path.join(d, 'assets/fonts/Anton-Regular.ttf')).find((f) => existsSync(f));
const labelCss = () => (FONT_FILE
  ? `<style>@font-face{font-family:Anton;src:url(data:font/ttf;base64,${readFileSync(FONT_FILE).toString('base64')}) format('truetype')}</style>`
  : '');
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

function run(args, timeoutMs = 240000) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args);
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`ffmpeg took longer than ${timeoutMs / 1000} s`)); }, timeoutMs);
    p.on('exit', () => clearTimeout(timer));
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-3000); });
    p.on('error', reject);
    // never put the Drive link / access token into an error message
    const clean = (t) => t.replace(/https?:\/\/\S+/g, '<video>').replace(/Bearer\s+\S+/g, 'Bearer <token>');
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${clean(err.split('\n').filter(Boolean).slice(-3).join(' | '))}`))));
  });
}

// Returns the finished MP4 as a Buffer.
// onStep(text) reports progress so a slow step is visible in the builder.
export async function makeFixClips(videoFileId, items, onStep = async () => {}) {
  const segs = segments(items);
  if (!segs.length) throw new Error('No fixes with a timestamp (m:ss) to make clips from.');
  const dir = mkdtempSync(path.join(tmpdir(), 'clips-'));
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${videoFileId}?alt=media`;
    const auth = `Authorization: Bearer ${await googleAccessToken()}\r\n`;
    const t0 = Date.now();
    const secs = () => `${Math.round((Date.now() - t0) / 1000)} s`;

    await onStep('Drawing the labels…');
    // two labels per fix: "1 · LOW VOLLEYS" (accent) and "1 · SLOW MOTION" (dark)
    const pngs = await renderPngs(segs.flatMap((s) => [label(`${s.n} · ${s.title.toUpperCase()}`, '#ff5b1f'), label(`${s.n} · SLOW MOTION`, '#0d0d0e')]), { fontsCss: labelCss() });
    const labelFile = (i) => { const f = path.join(dir, `l${i}.png`); writeFileSync(f, pngs[i]); return f; };

    // One small ffmpeg run per fix: read only those seconds from Drive (HTTP range requests),
    // then normal speed + slow motion with the labels, into a local file.
    const pieces = [];
    for (const [k, s] of segs.entries()) {
      await onStep(`Cutting fix ${k + 1} of ${segs.length}… (${secs()})`);
      const out = path.join(dir, `p${k}.mp4`);
      await run(['-hide_banner', '-loglevel', 'error',
        '-seekable', '1', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
        '-ss', s.start.toFixed(2), '-t', s.length.toFixed(2), '-headers', auth, '-i', url,
        '-i', labelFile(k * 2), '-i', labelFile(k * 2 + 1),
        '-filter_complex', [
          '[0:v]fps=30,scale=-2:720,setsar=1,setpts=PTS-STARTPTS,split=2[a][b]',
          '[a][1:v]overlay=40:40,format=yuv420p[n]',
          `[b]setpts=${CLIP.slow}*PTS[bs];[bs][2:v]overlay=40:40,format=yuv420p[s]`,
          '[n][s]concat=n=2:v=1:a=0[out]',
        ].join(';'),
        '-map', '[out]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-an', out]);
      pieces.push(out);
    }

    await onStep(`Joining the clips… (${secs()})`);
    const list = path.join(dir, 'list.txt');
    writeFileSync(list, pieces.map((f) => `file '${f}'`).join('\n'));
    const out = path.join(dir, 'clips.mp4');
    await run(['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], 60000);
    return { mp4: readFileSync(out), seconds: segs.reduce((t, s) => t + s.length * (1 + CLIP.slow), 0), segments: segs };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
