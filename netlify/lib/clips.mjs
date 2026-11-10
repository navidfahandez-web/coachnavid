// "Fix clips": one short video for Navid's voice-over. For each fix in a report: the moment at
// normal speed, then the same moment in slow motion, with a label — about 20 s for three fixes.
// ffmpeg reads only the needed seconds straight from Google Drive (HTTP range requests).
import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { toSeconds } from '../../shared/report.js';
import { downloadRange, drive } from './google.mjs';
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

// never put the Drive link / access token into an error message
const clean = (t) => t.replace(/https?:\/\/\S+/g, '<video>').replace(/Bearer\s+\S+/g, 'Bearer <token>');
const proxyLog = []; // byte ranges ffmpeg asked for (for diagnosing slow cuts)

function run(args, timeoutMs = 240000) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] }); // no stdin: ffmpeg must never wait for a key press
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error(`ffmpeg took longer than ${timeoutMs / 1000} s. Last output: ${clean(err.split('\n').filter(Boolean).slice(-4).join(' | '))}${proxyLog.length ? ` · reads: ${proxyLog.slice(-6).join(', ')}` : ''}`));
    }, timeoutMs);
    p.on('exit', () => clearTimeout(timer));
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-3000); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${clean(err.split('\n').filter(Boolean).slice(-3).join(' | '))}`))));
  });
}

// Returns the finished MP4 as a Buffer.
// A tiny local server in front of the Drive file, so ffmpeg can jump around in it quickly.
// Drive's own replies don't let ffmpeg seek, and some phone/camera videos spread their index
// through the whole file, so ffmpeg makes thousands of small reads. This server fetches the
// file in 16 MB pieces, keeps recent pieces in memory and fetches the next ones ahead.
const PIECE = 16 * 1024 * 1024;
const KEEP = 10; // pieces kept in memory (~160 MB)
async function driveProxy(fileId) {
  const { size: sizeStr } = await drive(`files/${fileId}?fields=size`);
  const size = Number(sizeStr);
  const cache = new Map(); // piece index → Buffer (Map keeps insertion order = LRU)
  const inflight = new Map();
  const piece = (i) => {
    if (cache.has(i)) { const b = cache.get(i); cache.delete(i); cache.set(i, b); return Promise.resolve(b); }
    if (inflight.has(i)) return inflight.get(i);
    const p = downloadRange(fileId, i * PIECE, Math.min(size, (i + 1) * PIECE) - 1).then((b) => {
      cache.set(i, b);
      inflight.delete(i);
      while (cache.size > KEEP) cache.delete(cache.keys().next().value);
      return b;
    }, (err) => { inflight.delete(i); throw err; });
    inflight.set(i, p);
    return p;
  };
  const last = Math.floor((size - 1) / PIECE);
  const server = http.createServer(async (req, res) => {
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
    const start = m ? Number(m[1]) : 0;
    const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    proxyLog.push(`${Math.round(start / 1e6)}MB`);
    res.writeHead(m ? 206 : 200, {
      'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4', 'Content-Length': end - start + 1,
      ...(m ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    });
    let closed = false;
    req.on('close', () => { closed = true; }); // ffmpeg hangs up as soon as it has what it needs
    try {
      for (let pos = start; pos <= end && !closed;) {
        const i = Math.floor(pos / PIECE);
        if (i + 1 <= last) piece(i + 1).catch(() => {}); // read ahead
        if (i + 2 <= last) piece(i + 2).catch(() => {});
        const buf = await piece(i);
        const from = pos - i * PIECE;
        const to = Math.min(buf.length, end - i * PIECE + 1);
        const slice = buf.subarray(from, to);
        if (!res.write(slice)) await new Promise((r) => { res.once('drain', r); res.once('close', r); });
        pos += slice.length;
      }
      res.end();
    } catch { res.destroy(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/video`, close: () => server.close() };
}

// onStep(text) reports progress so a slow step is visible in the builder.
export async function makeFixClips(videoFileId, items, onStep = async () => {}) {
  const segs = segments(items);
  if (!segs.length) throw new Error('No fixes with a timestamp (m:ss) to make clips from.');
  const dir = mkdtempSync(path.join(tmpdir(), 'clips-'));
  let proxy = null;
  try {
    proxy = await driveProxy(videoFileId);
    const { url } = proxy;
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
      await run(['-hide_banner', '-nostdin', '-y', '-loglevel', 'info',
        '-seekable', '1', '-ss', s.start.toFixed(2), '-t', s.length.toFixed(2), '-i', url,
        '-i', labelFile(k * 2), '-i', labelFile(k * 2 + 1),
        '-filter_complex', [
          '[0:v]fps=30,scale=-2:720,setsar=1,setpts=PTS-STARTPTS,split=2[a][b]',
          '[a][1:v]overlay=40:main_h-overlay_h-40,format=yuv420p[n]',
          `[b]setpts=${CLIP.slow}*PTS[bs];[bs][2:v]overlay=40:main_h-overlay_h-40,format=yuv420p[s]`,
          '[n][s]concat=n=2:v=1:a=0[out]',
        ].join(';'),
        '-map', '[out]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-an', out]);
      pieces.push(out);
    }

    await onStep(`Joining the clips… (${secs()})`);
    const list = path.join(dir, 'list.txt');
    writeFileSync(list, pieces.map((f) => `file '${f}'`).join('\n'));
    const out = path.join(dir, 'clips.mp4');
    await run(['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], 60000);
    return { mp4: readFileSync(out), seconds: segs.reduce((t, s) => t + s.length * (1 + CLIP.slow), 0), segments: segs };
  } finally {
    proxy?.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

// Lay one voice line per fix onto the clip: line k starts where fix k starts (offsets in seconds).
// lines: Buffers (mp3/wav/m4a). Returns the MP4 with sound.
export async function addVoice(clipMp4, lines, offsets, duration) {
  const dir = mkdtempSync(path.join(tmpdir(), 'voice-'));
  try {
    const clip = path.join(dir, 'clip.mp4');
    writeFileSync(clip, clipMp4);
    const files = lines.map((b, k) => { const f = path.join(dir, `v${k}`); writeFileSync(f, b); return f; });
    const delays = files.map((_, k) => `[${k + 1}:a]aresample=48000,adelay=${Math.round((offsets[k] ?? 0) * 1000)}:all=1[v${k}]`);
    const mix = `${files.map((_, k) => `[v${k}]`).join('')}amix=inputs=${files.length}:normalize=0,apad[a]`;
    const out = path.join(dir, 'voiced.mp4');
    await run(['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-i', clip, ...files.flatMap((f) => ['-i', f]),
      '-filter_complex', `${delays.join(';')};${mix}`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
      '-t', duration.toFixed(2), '-movflags', '+faststart', out], 90000); // exact length (apad + -shortest hangs with copied video)
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Short low-res cuts of the video (for the AI to double-check its own timestamps).
// moments: [{ start, length }] in seconds → Buffers (small MP4s, no sound).
export async function cutMoments(videoFileId, moments) {
  const dir = mkdtempSync(path.join(tmpdir(), 'moments-'));
  const proxy = await driveProxy(videoFileId);
  try {
    const out = [];
    for (const [k, m] of moments.entries()) {
      const f = path.join(dir, `m${k}.mp4`);
      await run(['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-seekable', '1',
        '-ss', Math.max(0, m.start).toFixed(2), '-t', m.length.toFixed(2), '-i', proxy.url,
        '-vf', 'fps=10,scale=-2:540', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', f]);
      out.push(readFileSync(f));
    }
    return out;
  } finally {
    proxy.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

// The whole video as small low-res parts for the AI (one file per `partSec` seconds, 2 frames/s,
// 480p, no sound). Gemini can't jump into the middle of some phone videos, so each part is its
// own file with its own 0:00. onPart(k, Buffer) is called as soon as part k is finished, so the
// AI can start on it while the next parts are still being cut.
export async function cutParts(videoFileId, partSec, onPart) {
  const dir = mkdtempSync(path.join(tmpdir(), 'parts-'));
  const proxy = await driveProxy(videoFileId);
  const sent = new Set();
  const jobs = [];
  const flush = (all) => {
    const names = readdirSync(dir).filter((f) => /^p\d+\.mp4$/.test(f)).sort();
    // a part is finished once the next one has started (or ffmpeg has ended)
    for (const [i, f] of names.entries()) {
      const k = Number(f.slice(1, 4));
      if (sent.has(k) || (!all && i === names.length - 1)) continue;
      sent.add(k);
      // keep failures until the end (an early unhandled rejection would kill the function)
      jobs.push(onPart(k, readFileSync(path.join(dir, f))).then((v) => ({ v }), (e) => ({ e })));
    }
  };
  const timer = setInterval(() => { try { flush(false); } catch { /* next tick */ } }, 2000);
  try {
    await run(['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-seekable', '1', '-i', proxy.url,
      '-map', '0:v:0', '-an', '-vf', 'fps=2,scale=-2:480', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p',
      '-force_key_frames', `expr:gte(t,n_forced*${partSec})`,
      '-f', 'segment', '-segment_time', String(partSec), '-reset_timestamps', '1', '-segment_format', 'mp4',
      path.join(dir, 'p%03d.mp4')], 11 * 60 * 1000);
    clearInterval(timer);
    flush(true);
    const out = await Promise.all(jobs);
    const bad = out.find((x) => x.e);
    if (bad) throw bad.e;
    return out.map((x) => x.v);
  } finally {
    clearInterval(timer);
    proxy.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
