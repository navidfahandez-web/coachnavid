// Lesson voice notes → text (speech-to-text) → lesson summary (Claude).
// Keys: Netlify's AI Gateway injects ANTHROPIC_/OPENAI_ API keys + base URLs automatically (billed in
// Netlify credits). Setting your own OPENAI_API_KEY / ANTHROPIC_API_KEY in Netlify overrides the gateway.
import Anthropic from '@anthropic-ai/sdk';
import { SHOTS } from '../../shared/report.js';

const env = (k) => (process.env[k] ?? '').trim();

// Speech-to-text: OpenAI with our own key; otherwise Gemini through the Netlify AI Gateway
// (the gateway only relays JSON, so OpenAI's file-upload endpoint doesn't work through it).
const ownOpenAI = () => Boolean(env('OPENAI_API_KEY')) && (!env('OPENAI_BASE_URL') || env('OPENAI_BASE_URL').includes('api.openai.com'));
const gemini = () => Boolean(env('GEMINI_API_KEY') && env('GOOGLE_GEMINI_BASE_URL'));
export const canTranscribe = () => ownOpenAI() || gemini();
export const canSummarize = () => Boolean(env('ANTHROPIC_API_KEY'));

const EXT = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };
// Padel words a recogniser would otherwise get wrong
const PADEL_TERMS = 'bandeja, víbora, chiquita, globo, por 3, por 4, contrapared, bajada de pared, bote pronto, dejada, gancho, remate, revés, drive, split step, salida de pared';

async function transcribeOpenAI(audio, type) {
  const form = new FormData();
  form.append('file', new Blob([audio], { type }), `voice.${EXT[type] ?? 'm4a'}`);
  form.append('model', 'gpt-4o-transcribe');
  form.append('prompt', `Padel coaching voice note after a lesson. Terms: ${PADEL_TERMS}.`);
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${env('OPENAI_API_KEY')}` }, body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Transcription: ${body.error?.message || res.status}`);
  return String(body.text ?? '').trim();
}

async function transcribeGemini(audio, type) {
  const base = env('GOOGLE_GEMINI_BASE_URL').replace(/\/+$/, '');
  const call = async (mime, model = 'gemini-3.8-flash') => {
    const res = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType: mime, data: Buffer.from(audio).toString('base64') } },
          { text: `Transcribe this padel coach's voice note word for word, in the language it is spoken (English, Spanish or Lithuanian). Padel terms you may hear: ${PADEL_TERMS}. Return only the transcript.` },
        ] }],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Transcription: ${body.error?.message || res.status}`);
    return (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  };
  try { return await call(type); } catch (err) {
    if (/not found|does not have access|model/i.test(err.message)) return call(type, 'gemini-3.5-flash');
    if (type === 'audio/mp4' || type === 'audio/x-m4a' || type === 'audio/m4a') return call('audio/aac'); // m4a is AAC audio
    throw err;
  }
}

export async function transcribe(audio, mimeType) {
  let type = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (!type.startsWith('audio/')) type = 'audio/mp4'; // unlabelled uploads: phones record m4a
  const text = ownOpenAI() ? await transcribeOpenAI(audio, type) : await transcribeGemini(audio, type);
  if (!text) throw new Error('The recording came back empty — was the microphone on?');
  return text;
}

const list = { type: 'array', items: { type: 'string' } };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'worked_on', 'went_well', 'to_improve', 'drills', 'progress', 'next_focus', 'shots'],
  properties: {
    title: { type: 'string', description: 'Short lesson title, e.g. "Bandeja depth and net recovery"' },
    summary: { type: 'string', description: '2–4 sentences: what the lesson was about and how it went' },
    worked_on: list,
    went_well: list,
    to_improve: list,
    drills: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['name', 'how'], properties: { name: { type: 'string' }, how: { type: 'string' } } },
    },
    progress: { type: 'string', description: 'Comparison with earlier lessons/reports; empty string if there is nothing earlier to compare with' },
    next_focus: { type: 'string', description: 'What to focus on until the next lesson' },
    shots: {
      type: 'array',
      description: 'Only shots the coach actually talked about',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'note', 'trend'],
        properties: {
          id: { type: 'string', enum: SHOTS.map((s) => s.id) },
          note: { type: 'string' },
          trend: { type: 'string', enum: ['better', 'same', 'worse', 'new'] },
        },
      },
    },
  },
};

const SYSTEM = `You write lesson summaries for Coach Navid Fahandezh, a padel coach (Technical Director of Padel Beast).
After a lesson Navid records a voice note about his player. Turn it into a clear summary the player receives as a PDF.

- Write to the player ("you"), warm, direct and practical, like a good coach. Keep it short — this is read on a phone.
- Use only what Navid says in the voice note for this lesson. Do not invent shots, numbers or drills he did not mention.
  If he names a drill without details, describe it briefly in plain words.
- Use the earlier lessons, reports and GlassWall data only to describe progress (better / same / worse) and to keep names consistent.
- Write all text in the requested language. Keep padel terms (bandeja, víbora, chiquita…) as they are.
- The voice note may be in English, Spanish or Lithuanian and may be informal; ignore filler words.
- For "shots", list only shots Navid talked about, using the given shot ids.`;

// context: { player, lang, notes, previousLessons, reports, glasswall }
export async function summarizeLesson(context) {
  const baseURL = env('ANTHROPIC_BASE_URL');
  const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), ...(baseURL ? { baseURL } : {}) });
  // The Netlify AI Gateway doesn't forward beta headers, so the refusal fallback is only used with our own key
  const viaGateway = Boolean(baseURL) && !baseURL.includes('api.anthropic.com');
  const shotNames = SHOTS.map((s) => `${s.id} = ${s.en}`).join('\n');
  const prompt = [
    `Player: ${context.player.firstName} ${context.player.lastName}`,
    `Write the summary in: ${context.lang === 'lt' ? 'Lithuanian' : 'English'}`,
    `Lesson date: ${context.date}`,
    '',
    '<voice_note>', context.notes, '</voice_note>',
    '',
    '<earlier_lessons>', JSON.stringify(context.previousLessons), '</earlier_lessons>',
    '<earlier_reports>', JSON.stringify(context.reports), '</earlier_reports>',
    '<glasswall_ai>', JSON.stringify(context.glasswall), '</glasswall_ai>',
    '',
    '<shot_ids>', shotNames, '</shot_ids>',
  ].join('\n');

  const params = {
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  };
  const res = viaGateway
    ? await client.messages.create(params)
    : await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to write this summary.');
  if (res.stop_reason === 'max_tokens') throw new Error('The summary was cut off — try a shorter voice note.');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}
