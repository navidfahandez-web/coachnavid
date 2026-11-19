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
    p.stderr.on('data', (d) => { err = (err + d).slice(-20000); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(`ffmpeg failed (${code}): ${clean(err.split('\n').filter(Boolean).slice(-3).join(' | '))}`))));
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
    // decoding every frame of a 30-minute phone video is too slow for a function (~2.5 min per
    // 5 minutes), so only the key frames are decoded (phones put one every ~0.5-1 s)
    // -seekable 0: one straight pass from start to end (with seeking, ffmpeg first scans the
    // whole fragmented file for its index, which downloads it twice)
    await run(['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-seekable', '0', '-skip_frame', 'nokey', '-i', proxy.url,
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

// One student shot for the pro comparison: full frame rate and 720p so it can be slowed down
// in the browser (no labels, no sound). Returns the MP4 as a Buffer.
export async function cutShot(videoFileId, start, length) {
  const dir = mkdtempSync(path.join(tmpdir(), 'shot-'));
  const proxy = await driveProxy(videoFileId);
  try {
    const f = path.join(dir, 'shot.mp4');
    await run(['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-seekable', '1',
      '-ss', Math.max(0, start).toFixed(2), '-t', length.toFixed(2), '-i', proxy.url,
      '-vf', 'scale=-2:720', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', f]);
    return readFileSync(f);
  } finally {
    proxy.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- Instagram reel: two shots compared, real speed then slow motion with phase captions ----------
// 1080×1920 (9:16), AceCue style: shot A left, shot B right, each zoomed in on the player (box from
// the AI per moment, the crop follows the player), players as solid silhouettes on a dark court.
// No sound (music is added in Instagram). Each shot: 5 s at real speed, then the 2 s around contact at 0.25×.
const W = 1080;
const PW = 530; const PH = 940; // one panel (9:16-ish, a standing player fills it)
const LAYOUT = { titleY: 70, labelY: 262, panelY: 330, aX: 7, bX: 543, capY: 1300, ctaY: 1790 };
export const REEL = { REAL: 5, BEFORE: 2, SLOW_FROM: 1, SLOW_LEN: 2, FACTOR: 4, BOX_AT: [0, 2, 4.5] }; // BOX_AT: seconds into the shot where the AI boxes the player
const box = (html, width = 1000, align = 'left') => `<div style="width:${width}px;text-align:${align};font:400 52px/1.08 Anton,sans-serif;color:#fff;letter-spacing:.01em">${html}</div>`;
const clean2 = (t) => String(t ?? '').replace(/[<>&]/g, '');

// Still frames (JPEG, 1280 wide) at these seconds — for the AI to find the player.
export async function grabFrames(videoFileId, times) {
  const dir = mkdtempSync(path.join(tmpdir(), 'frames-'));
  const proxy = await driveProxy(videoFileId);
  try {
    const out = [];
    for (const [k, t] of times.entries()) {
      const f = path.join(dir, `f${k}.jpg`);
      await run(['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-seekable', '1', '-ss', Math.max(0, t).toFixed(2), '-i', proxy.url,
        '-map', '0:v:0', '-vf', 'scale=1280:-2', '-frames:v', '1', '-q:v', '3', f]);
      out.push(readFileSync(f));
    }
    return out;
  } finally {
    proxy.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

// The empty court behind a moment: per-pixel median of frames sampled over ±40 s (the camera is fixed,
// players move), so whatever differs from it in a frame is a player → silhouette. Full frame, 1920 wide.
async function courtBackground(url, dir, name, t) {
  const f = path.join(dir, `${name}.png`);
  await run(['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-seekable', '1', '-ss', Math.max(0, t - 40).toFixed(2), '-t', '80', '-i', url,
    '-map', '0:v:0', '-vf', 'fps=1/3,scale=1920:-2,tmedian=radius=12', '-update', '1', f], 240000); // keeps the last median frame
  if (!existsSync(f)) throw new Error('Could not build the empty-court image');
  return f;
}

// AI boxes [ymin, xmin, ymax, xmax] (0–1000) at REEL.BOX_AT → an ffmpeg crop that follows the player.
// Crop size fits the biggest box with room around it (racket overhead, the step into the shot).
function followCrop(boxes) {
  const ok = (boxes ?? []).filter((b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[2] > b[0] && b[3] > b[1]);
  if (!ok.length) return `scale=${PW}:${PH}:force_original_aspect_ratio=decrease,pad=${PW}:${PH}:(ow-iw)/2:(oh-ih)/2`; // no box: whole frame
  const AR = 16 / 9; // club cameras film 16:9
  const maxH = Math.max(...ok.map((b) => (b[2] - b[0]) / 1000));
  const maxW = Math.max(...ok.map((b) => (b[3] - b[1]) / 1000));
  const ch = Math.min(1, Math.max(0.14, maxH * 1.35, maxW * 0.75 * AR * PH / PW)); // crop height as a share of the frame height (an outstretched racket may touch the edge)
  const pts = (boxes ?? []).map((b, i) => (ok.includes(b) ? { t: REEL.BOX_AT[i], x: (b[1] + b[3]) / 2000, y: (b[0] + b[2]) / 2000 - 0.03 * (b[2] - b[0]) / 1000 } : null)).filter(Boolean);
  const lerp = (k) => { // piecewise straight lines between the boxed moments, flat before/after
    if (pts.length === 1) return pts[0][k].toFixed(4);
    let e = pts[pts.length - 1][k].toFixed(4);
    for (let i = pts.length - 2; i >= 0; i--) {
      const a = pts[i]; const b = pts[i + 1];
      e = `if(lt(t,${b.t}),${a[k].toFixed(4)}+(${(b[k] - a[k]).toFixed(4)})*max(0,(t-${a.t}))/${(b.t - a.t).toFixed(2)},${e})`;
    }
    return e;
  };
  return `crop=w='ih*${ch.toFixed(4)}*${PW}/${PH}':h='ih*${ch.toFixed(4)}':x='clip(iw*(${lerp('x')})-ow/2,0,iw-ow)':y='clip(ih*(${lerp('y')})-oh/2,0,ih-oh)':exact=1,scale=${PW}:${PH}`;
}

// a, b: { t, label, boxes }; phases: [{ name, a, b }]; color: silhouette colour
export async function makeReel(videoFileId, { a, b, title, phases, cta = 'COACHNAVID.COM', anon = 'silhouette', color = '0xff5b1f' }, onStep = async () => {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'reel-'));
  const proxy = await driveProxy(videoFileId);
  try {
    await onStep('Drawing the captions…');
    const tag = (txt, col) => `<span style="display:inline-block;width:${PW}px;text-align:center;color:${col};font:400 38px Anton,sans-serif;letter-spacing:.14em">${clean2(txt).toUpperCase()}</span>`;
    const snippets = [
      box(`<span style="color:#ff5b1f">${clean2(title)}</span>`, 1000, 'center'), // 0 title
      tag(a.label, '#ffffff'), // 1
      tag(b.label, '#ff5b1f'), // 2
      box('<span style="letter-spacing:.14em">REAL SPEED</span>', 1000, 'center'), // 3
      ...phases.map((ph, i) => `<div style="width:1060px;font:400 40px/1.12 Anton,sans-serif;color:#fff">
        <div style="text-align:center;color:#ff5b1f;font-size:54px;letter-spacing:.06em;margin-bottom:14px">${i + 1} · ${clean2(ph.name).toUpperCase()}</div>
        <div style="display:flex;gap:40px"><div style="flex:1;text-align:center">${clean2(ph.a)}</div><div style="flex:1;text-align:center;color:#ffd2bf">${clean2(ph.b)}</div></div></div>`), // 4…
      box(`<span style="color:#ff5b1f">COACH NAVID</span> · ${clean2(cta)}`, 1000, 'center'), // last
    ];
    const pngs = await renderPngs(snippets, { fontsCss: labelCss() });
    const files = pngs.map((buf, i) => { const f = path.join(dir, `t${i}.png`); writeFileSync(f, buf); return f; });

    const sa0 = toSecondsSafe(a.t); const sb0 = toSecondsSafe(b.t);
    let bgs = [];
    if (anon === 'silhouette') {
      await onStep('Finding the empty court (for the silhouettes)…');
      bgs = [await courtBackground(proxy.url, dir, 'bgA', sa0), await courtBackground(proxy.url, dir, 'bgB', sb0)];
    }
    await onStep('Cutting, zooming in and slowing down the two shots…');
    const { REAL, SLOW_FROM, SLOW_LEN, FACTOR } = REEL;
    const total = REAL + SLOW_LEN * FACTOR; // 13 s
    // Step 1, one small ffmpeg run per shot (keeps memory low): real speed, then 0.25× around contact.
    // Silhouette: the player mask (frame minus empty court) is made on the full frame, then cropped and
    // enlarged together with the court's lines, so the zoom stays clean.
    const shotFiles = [];
    for (const [k, [t, m]] of [[sa0, a], [sb0, b]].entries()) {
      const CROP = followCrop(m.boxes);
      const pre = anon === 'silhouette' ? [
        // difference in colour (R+G+B), not only brightness, so dark clothes on a dark wall still count;
        // then remove thin lines/noise (open) and fill holes in the body (close)
        `[0:v]fps=30,setpts=PTS-STARTPTS,scale=1920:-2,format=gbrp,gblur=sigma=1.2[f]`,
        `[1:v]loop=loop=-1:size=1,fps=30,trim=0:${REAL},setpts=PTS-STARTPTS,scale=1920:-2,format=gbrp,split[b0][e0]`,
        `[b0]gblur=sigma=1.2[b]`,
        `[f][b]blend=all_mode=difference,colorchannelmixer=rr=0.6:rg=0.6:rb=0.6:gr=0.6:gg=0.6:gb=0.6:br=0.6:bg=0.6:bb=0.6,format=gray,lut=y='if(gt(val,36),255,0)',erosion,erosion,dilation,dilation,dilation,dilation,dilation,erosion,erosion,erosion,${CROP},gblur=sigma=3,lut=y='if(gt(val,110),255,0)',gblur=sigma=1[m]`,
        `color=c=${color}:s=${PW}x${PH}:r=30:d=${REAL}[o]`,
        `[o][m]alphamerge[sil]`,
        `[e0]format=yuv420p,${CROP},edgedetect=low=0.1:high=0.3:mode=wires,lutrgb=r=val*0.3:g=val*0.3:b=val*0.34,vignette=PI/4[court]`,
        `[court][sil]overlay=0:0:shortest=1,format=yuv420p,setsar=1,split[r][s]`,
      ] : [`[0:v]fps=30,setpts=PTS-STARTPTS,${CROP},setsar=1,format=yuv420p,split[r][s]`];
      const f = path.join(dir, `shot${k}.mp4`);
      await run(['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-seekable', '1', '-ss', Math.max(0, t - REEL.BEFORE).toFixed(2), '-t', String(REAL), '-i', proxy.url,
        ...(anon === 'silhouette' ? ['-i', bgs[k]] : []),
        '-filter_complex', [...pre, `[r]trim=0:${REAL},setpts=PTS-STARTPTS[rr]`, `[s]trim=${SLOW_FROM}:${SLOW_FROM + SLOW_LEN},setpts=${FACTOR}*(PTS-STARTPTS)[ss]`, '[rr][ss]concat=n=2:v=1:a=0[out]'].join(';'),
        '-map', '[out]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', f], 240000);
      shotFiles.push(f);
    }

    // Step 2: the 9:16 page — title, the two panels with a thin divider, labels and the timed captions.
    await onStep('Putting the reel together…');
    const nPh = phases.length;
    const slot = (SLOW_LEN * FACTOR) / Math.max(1, nPh);
    const ov = []; let last = 'bg';
    const add = (input, x, y, from, to) => { const o = `o${ov.length}`; ov.push(`[${last}][${input}:v]overlay=${x}:${y}${from !== undefined ? `:enable='gte(t,${from.toFixed(2)})*lt(t,${to.toFixed(2)})'` : ''}[${o}]`); last = o; };
    const P = 2; // inputs 0,1 = the two shots, then the caption images
    const graph = [
      `color=c=0x0d0d0e:s=${W}x1920:r=30:d=${total}[base]`,
      `[base][0:v]overlay=${LAYOUT.aX}:${LAYOUT.panelY}[ba]`, `[ba][1:v]overlay=${LAYOUT.bX}:${LAYOUT.panelY}[bb]`,
      `color=c=0xff5b1f:s=4x${PH}:r=30:d=${total}[div]`, `[bb][div]overlay=${(LAYOUT.aX + PW + LAYOUT.bX) / 2 - 2}:${LAYOUT.panelY}[bg]`,
    ];
    add(P + 0, '(W-w)/2', LAYOUT.titleY);
    add(P + 1, LAYOUT.aX, LAYOUT.labelY);
    add(P + 2, LAYOUT.bX, LAYOUT.labelY);
    add(P + 3, '(W-w)/2', LAYOUT.capY, 0, REAL);
    phases.forEach((_, i) => add(P + 4 + i, '(W-w)/2', LAYOUT.capY, REAL + i * slot, REAL + (i + 1) * slot));
    add(P + 4 + nPh, '(W-w)/2', LAYOUT.ctaY);
    const out = path.join(dir, 'reel.mp4');
    await run(['-hide_banner', '-nostdin', '-y', '-loglevel', 'error',
      ...shotFiles.flatMap((f) => ['-i', f]),
      ...files.flatMap((f) => ['-i', f]),
      '-filter_complex', [...graph, ...ov].join(';'),
      '-map', `[${last}]`, '-t', String(total), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an', out], 300000);
    return { mp4: readFileSync(out), seconds: total };
  } finally {
    proxy.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
const toSecondsSafe = (t) => { const v = toSeconds(t); if (v === null) throw new Error(`Bad time ${t}`); return v; };

// Diagnosis: is a moment at the same place whether ffmpeg jumps to it (-ss before -i, as the clip
// cutters do) or reads straight through to it with key frames only (as the AI's parts are cut)?
// times: seconds. Returns { info, seek: [{ t, jpg, shown }], pass: [{ t, jpg }] }.
export async function probeTimes(videoFileId, times, inOpts = []) {
  const dir = mkdtempSync(path.join(tmpdir(), 'probe-'));
  const proxy = await driveProxy(videoFileId);
  try {
    const seek = [];
    let info = '';
    for (const [k, t] of times.entries()) {
      const f = path.join(dir, `s${k}.jpg`);
      const log = await run(['-hide_banner', '-nostdin', '-y', '-loglevel', 'info', '-seekable', '1', ...inOpts, '-ss', t.toFixed(2), '-i', proxy.url,
        '-map', '0:v:0', '-vf', 'showinfo,scale=640:-2', '-frames:v', '1', '-q:v', '4', f]);
      if (!k) info = log.split('\n').filter((l) => /Duration|Stream|start:|creation|encoder|handler|major_brand/i.test(l)).join('\n').slice(0, 2500);
      seek.push({ t, jpg: readFileSync(f), shown: (/pts_time:\s*([\d.]+)/.exec(log) ?? [])[1] ?? null });
    }
    const sel = times.map((t) => `between(t,${t.toFixed(2)},${(t + 0.45).toFixed(2)})`).join('+');
    const log = await run(['-hide_banner', '-nostdin', '-y', '-loglevel', 'info', '-seekable', '0', ...inOpts, '-skip_frame', 'nokey', '-t', (Math.max(...times) + 2).toFixed(2), '-i', proxy.url,
      '-map', '0:v:0', '-vf', `fps=2,select='${sel}',showinfo,scale=640:-2`, '-vsync', '0', '-q:v', '4', path.join(dir, 'p%02d.jpg')], 11 * 60 * 1000);
    const shownPass = [...log.matchAll(/pts_time:\s*([\d.]+)/g)].map((m) => m[1]);
    const pass = times.map((t, k) => { const f = path.join(dir, `p${String(k + 1).padStart(2, '0')}.jpg`); return { t, jpg: existsSync(f) ? readFileSync(f) : null, shown: shownPass[k] ?? null }; });
    return { info, seek, pass };
  } finally {
    proxy.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
