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

export const CLIP = { before: 1.0, length: 2.4, slow: 2 }; // seconds before the timestamp, seconds shown, slow-motion factor

const FONT = [process.env.LAMBDA_TASK_ROOT, process.cwd(), path.dirname(new URL(import.meta.url).pathname) + '/../..']
  .filter(Boolean).map((d) => path.join(d, 'assets/fonts/Anton-Regular.ttf')).find((f) => existsSync(f));

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
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${err.split('\n').filter(Boolean).slice(-3).join(' | ')}`))));
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
    const label = (text, k, color) => {
      if (!FONT) return '';
      const f = path.join(dir, `t${k}.txt`); // textfile avoids escaping problems in drawtext
      writeFileSync(f, text);
      return `,drawtext=fontfile='${FONT}':textfile='${f}':x=40:y=40:fontsize=44:fontcolor=white:box=1:boxcolor=${color}:boxborderw=16`;
    };
    const inputs = segs.flatMap((s) => ['-ss', s.start.toFixed(2), '-t', s.length.toFixed(2), '-headers', auth, '-i', url]);
    const parts = segs.map((s, k) => [
      `[${k}:v]fps=30,scale=-2:720,setsar=1,setpts=PTS-STARTPTS,split=2[a${k}][b${k}]`,
      `[a${k}]null${label(`${s.n} · ${s.title.toUpperCase()}`, `n${k}`, '0xff5b1f@0.92')}[n${k}]`,
      `[b${k}]setpts=${CLIP.slow}*PTS${label(`${s.n} · SLOW MOTION`, `s${k}`, '0x0d0d0e@0.85')}[s${k}]`,
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
