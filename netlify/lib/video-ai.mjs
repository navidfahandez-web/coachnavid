// AI first draft of a video-analysis report: the student's video goes from Google Drive to
// Gemini (which watches video natively, up to about an hour), together with Navid's framework —
// areas and shots, drill library, plan type, the student's note, earlier reports and GlassWall.
// Navid then checks and edits the draft in the report builder before publishing.
//
// Needs GEMINI_VIDEO_KEY in Netlify (aistudio.google.com → Get API key, on a paid/billing-enabled
// project so student videos aren't used for training). The Netlify AI Gateway can't take big files.
import { AREAS, DRILLS, KINDS, SHOTS } from '../../shared/report.js';
import { downloadRange, drive } from './google.mjs';

const API = 'https://generativelanguage.googleapis.com';
const env = (k) => (process.env[k] ?? '').trim();
const key = () => env('GEMINI_VIDEO_KEY') || (!env('GOOGLE_GEMINI_BASE_URL') ? env('GEMINI_API_KEY') : '');
export const canAnalyze = () => Boolean(key());
// Best model first; the next ones are used if a model isn't available on the account
const MODELS = ['gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-3.5-flash'];
const CHUNK = 32 * 1024 * 1024; // multiple of 256 KB, as Google requires

async function gemini(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { 'x-goog-api-key': key(), ...init.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Gemini: ${body.error?.message || res.status}`), { status: res.status });
  return body;
}

// Stream the Drive file to Gemini's Files API in 32 MB pieces (never the whole video in memory)
export async function uploadFromDrive(fileId, onProgress = () => {}) {
  const meta = await drive(`files/${fileId}?fields=name,size,mimeType`);
  const size = Number(meta.size);
  const start = await fetch(`${API}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': key(), 'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size), 'X-Goog-Upload-Header-Content-Type': meta.mimeType,
    },
    body: JSON.stringify({ file: { display_name: meta.name } }),
  });
  const url = start.headers.get('x-goog-upload-url');
  if (!url) throw new Error(`Gemini upload didn't start (${start.status})`);
  let file = null;
  for (let offset = 0; offset < size; offset += CHUNK) {
    const end = Math.min(offset + CHUNK, size) - 1;
    const last = end === size - 1;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-Goog-Upload-Offset': String(offset), 'X-Goog-Upload-Command': last ? 'upload, finalize' : 'upload' },
      body: await downloadRange(fileId, offset, end),
    });
    if (!res.ok) throw new Error(`Gemini upload failed at ${Math.round(offset / 1e6)} MB (${res.status})`);
    if (last) file = (await res.json()).file;
    onProgress(end + 1, size);
  }
  // Gemini processes the video before it can be used
  for (let i = 0; i < 120 && file.state === 'PROCESSING'; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    file = await gemini(`/v1beta/${file.name}`);
  }
  if (file.state !== 'ACTIVE') throw new Error(`Gemini couldn't process the video (${file.state})`);
  return { ...file, sizeBytes: size };
}

export const deleteUpload = (name) => gemini(`/v1beta/${name}`, { method: 'DELETE' }).catch(() => {});

const S = (description) => ({ type: 'STRING', ...(description ? { description } : {}) });
function schema(kind) {
  const spec = KINDS[kind];
  return {
    type: 'OBJECT',
    required: ['player_identified', 'headline', 'summary', 'strengths', 'items', 'closing', 'confidence_notes',
      ...(spec.scores ? ['scores', 'weeks'] : [])],
    properties: {
      player_identified: S('How you recognised the student (shirt colour, side, partner) and any doubt about it'),
      headline: S('One short line for the top of the report'),
      summary: S('3-5 sentences: what you saw overall'),
      strengths: S('2-3 real strengths, specific'),
      items: {
        type: 'ARRAY', description: `Exactly ${spec.items} — ${kind === 'match' ? 'the top fixes' : 'the key errors'}, most important first`,
        items: {
          type: 'OBJECT', required: ['time', 'title', 'detail', 'fix', 'drill'],
          properties: {
            time: S('Timestamp m:ss or h:mm:ss of a clear example in the video'),
            title: S('Short name of the error/fix'), detail: S('What happens and why it costs points'),
            fix: S('The correction, as a coaching cue'), drill: { type: 'STRING', enum: DRILLS.map((d) => d.name) },
          },
        },
      },
      ...(spec.scores ? {
        scores: {
          type: 'ARRAY', description: 'One entry per area you could judge; skip areas you could not see',
          items: {
            type: 'OBJECT', required: ['area', 'score', 'note', 'shots'],
            properties: {
              area: { type: 'STRING', enum: AREAS.map((a) => a.id) }, score: { type: 'INTEGER' }, note: S('One line'),
              shots: {
                type: 'ARRAY', description: 'Only shots seen several times',
                items: { type: 'OBJECT', required: ['shot', 'score', 'note'], properties: { shot: { type: 'STRING', enum: SHOTS.map((s) => s.id) }, score: { type: 'INTEGER' }, note: S() } },
              },
            },
          },
        },
        weeks: {
          type: 'ARRAY', description: 'Exactly 3 weeks, one per fix',
          items: { type: 'OBJECT', required: ['focus', 'plan'], properties: { focus: S(), plan: S('Sessions for the week') } },
        },
      } : {}),
      closing: S('Motivating final word + next step'),
      confidence_notes: S('For the coach only: what you could not see clearly or are unsure about'),
    },
  };
}

function prompt(r, ctx) {
  const lang = r.lang === 'lt' ? 'Lithuanian' : 'English';
  const kind = KINDS[r.kind];
  return `You are the video-analysis assistant of Coach Navid Fahandezh, a padel coach (Technical Director of Padel Beast).
Watch this ${r.kind === 'match' ? 'match' : 'clip'} of his student ${r.student.firstName} ${r.student.lastName} and write the FIRST DRAFT of a "${kind.name}" report. Navid checks and corrects everything before the student sees it, so be specific and honest rather than polished.

The student told us: "${r.studentNotes || 'nothing — identify them as best you can and say how in player_identified'}"

How to analyse (Navid's framework):
- Focus only on this student, not the partner or opponents.
- Areas and shots, scored 1-10 (5 = club average, 7 = strong club player, 9-10 = pro level):
${AREAS.map((a) => `  ${a.id} (${a.en}): ${a.shots.map((s) => `${s.id}=${s.en}`).join(', ')}`).join('\n')}
- Only score what you actually saw several times. Leave out areas or shots you couldn't judge.
- ${kind.items} ${r.kind === 'match' ? 'fixes' : 'errors'}: the ones that would win the most points, each with a timestamp of a clear example, what happens, the fix as a short coaching cue, and the best drill from this library:
${DRILLS.map((d) => `  - ${d.name}: ${d.how}`).join('\n')}
${r.kind === 'match' ? '- A 3-week plan: one week per fix, 2-3 sessions each, using the drills.' : ''}
- Use padel vocabulary (bandeja, víbora, chiquita, por 3, salida de pared…). Write to the student as "you", warm and direct, in ${lang}.
- Timestamps must point at real moments in the video. If unsure, say so in confidence_notes.

Earlier reports for this student (to mention progress or repeated problems): ${JSON.stringify(ctx.history)}
GlassWall court-camera AI data: ${JSON.stringify(ctx.glasswall)}`;
}

export async function analyzeVideo(file, r, ctx) {
  const long = (Number(file.videoMetadata?.videoDuration?.replace('s', '')) || 0) > 20 * 60 || file.sizeBytes > 1.5e9;
  const body = {
    contents: [{ role: 'user', parts: [{ fileData: { mimeType: file.mimeType, fileUri: file.uri } }, { text: prompt(r, ctx) }] }],
    generationConfig: {
      responseMimeType: 'application/json', responseSchema: schema(r.kind), temperature: 0.4,
      ...(long ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}), // a full match only fits at low resolution
    },
  };
  let lastErr;
  for (const model of MODELS) {
    try {
      const out = await gemini(`/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const text = (out.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      if (!text) throw new Error(`Gemini returned no draft (${out.candidates?.[0]?.finishReason ?? 'unknown'})`);
      return { draft: JSON.parse(text), model };
    } catch (err) {
      lastErr = err;
      if (![400, 404, 403].includes(err.status) || !/model|not found|not supported|permission/i.test(err.message)) throw err;
    }
  }
  throw lastErr;
}

// Gemini's draft → the report's own fields (what the builder edits)
export function draftToReport(r, d) {
  const drill = (name) => DRILLS.find((x) => x.name === name) ?? { name: name ?? '', how: '' };
  const clamp = (n) => Math.max(1, Math.min(10, Math.round(Number(n)) || 0)) || null;
  const scores = {};
  for (const s of d.scores ?? []) {
    if (!AREAS.some((a) => a.id === s.area)) continue;
    const shots = Object.fromEntries((s.shots ?? []).filter((x) => SHOTS.some((y) => y.id === x.shot)).map((x) => [x.shot, { score: clamp(x.score), note: x.note ?? '' }]));
    scores[s.area] = { score: clamp(s.score), manual: true, note: s.note ?? '', shots };
  }
  return {
    ...r,
    headline: d.headline ?? '', summary: d.summary ?? '', strengths: d.strengths ?? '', closing: d.closing ?? '',
    items: (d.items ?? []).map((i) => ({ time: i.time ?? '', title: i.title ?? '', detail: i.detail ?? '', fix: i.fix ?? '', drillName: drill(i.drill).name, drillHow: drill(i.drill).how })),
    scores: KINDS[r.kind].scores ? scores : r.scores,
    weeks: KINDS[r.kind].weeks ? (d.weeks ?? []).slice(0, 3) : r.weeks,
  };
}
