// WhatsApp Cloud API (Meta) helpers.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { formatDuration, nowLocal, toHHMM, toMin } from '../../shared/rules.js';
import { locationById, locationLabel } from '../../shared/schedule.js';
import { CANCELLATION_HOURS, paymentFor } from '../../shared/pricing.js';
import { readJSON, updateJSON } from './store.mjs';

const env = (k) => (process.env[k] ?? '').trim(); // ignore stray spaces/newlines pasted into Netlify
const GRAPH = 'https://graph.facebook.com/v21.0';

export const coachNumber = () => env('COACH_WHATSAPP').replace(/\D/g, '');

async function send(to, message) {
  const res = await fetch(`${GRAPH}/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, ...message }),
  });
  if (!res.ok) {
    const text = await res.text();
    let e = {};
    try { e = JSON.parse(text).error ?? {}; } catch { /* not JSON */ }
    throw new Error(`code ${e.code ?? '?'}${e.error_subcode ? `/${e.error_subcode}` : ''} (HTTP ${res.status}) — ${e.message ?? text}`);
  }
  return res.json();
}

// Read-only/setup calls used by the admin "WhatsApp connection" check.
// Returns Meta's JSON (or its error) — never the token.
export async function graph(path, init = {}) {
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  const e = body.error;
  return res.ok ? body : { error: [e?.message, e?.error_user_msg].filter(Boolean).join(' — ') || `HTTP ${res.status}`, code: e?.code };
}
export const phoneNumberId = () => env('WHATSAPP_PHONE_NUMBER_ID');
// WhatsApp Business Account that owns the sending number (test number's account by default).
export const wabaId = () => env('WHATSAPP_WABA_ID') || '1414125076742937';

export const sendText = (to, body) => send(to, { type: 'text', text: { body, preview_url: false } });

// "Wed 7 Oct, 16:00–17:00 (1h)"
export function describeTime(b) {
  const day = new Date(`${b.date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
  return `${day}, ${b.start}–${toHHMM(toMin(b.start) + b.duration)} (${formatDuration(b.duration)})`;
}

export function describeSlot(b) {
  const where = locationLabel(b.location);
  return `${describeTime(b)}${where ? ` · ${where}` : ''}`;
}

// The confirmation text a student gets — also used for Navid's one-tap backup link.
// First lesson ever for this phone number → Navid introduces himself.
export function studentConfirmationText(b, { firstTime = false } = {}) {
  const loc = locationById(b.location);
  const club = loc ? `🎾 ${loc.club} – ${loc.city.toUpperCase()}` : '';
  const map = loc?.mapsUrl ? `📍 Location: ${loc.mapsUrl}` : '';
  const opening = firstTime
    ? [
      `Hi ${b.firstName}! 👋 I'm Navid Fahandezh – padel coach with 15+ years of experience and Technical Director of Padel Beast. Thanks for booking your first lesson with me!`,
      '',
      '✅ Your lesson is confirmed:',
    ]
    : [`Hi ${b.firstName}! ✅ Your padel lesson with Coach Navid is confirmed.`];
  const pay = paymentFor(b.duration);
  return [
    ...opening,
    '',
    `📅 ${describeTime(b)}`,
    club,
    map,
    pay ? `💳 Payment${pay.price ? ` (${pay.price})` : ''}: ${pay.url}` : '',
    '',
    `Please note: cancellations less than ${CANCELLATION_HOURS} hours before the lesson are not refunded.`,
    '',
    'See you on court!',
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
}

// One-tap link that opens WhatsApp with the confirmation already typed for the student.
export const confirmLink = (b, opts) =>
  `https://wa.me/${b.phone.replace(/\D/g, '')}?text=${encodeURIComponent(studentConfirmationText(b, opts))}`;

// Reminder sent ~24h before the lesson.
export function reminderText(b) {
  const loc = locationById(b.location);
  return [
    `Hi ${b.firstName}! 👋 Just a reminder of your padel lesson with Coach Navid ${b.date === nowLocal().date ? 'today' : 'tomorrow'}:`,
    '',
    `📅 ${describeTime(b)}`,
    loc ? `🎾 ${loc.club} – ${loc.city.toUpperCase()}` : '',
    loc?.mapsUrl ? `📍 Location: ${loc.mapsUrl}` : '',
    '',
    `If you can’t make it, please let me know as soon as possible — cancellations less than ${CANCELLATION_HOURS} hours before the lesson are not refunded.`,
    '',
    'See you on court! 🎾',
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
}
export const reminderLink = (b) =>
  `https://wa.me/${b.phone.replace(/\D/g, '')}?text=${encodeURIComponent(reminderText(b))}`;

// True if this phone number has no earlier confirmed lesson.
const digits = (p) => String(p ?? '').replace(/\D/g, '');
export const isFirstLesson = (b, all) => !all.some((x) =>
  x.id !== b.id && digits(x.phone) === digits(b.phone) && x.status === 'confirmed' &&
  Date.parse(x.createdAt) < Date.parse(b.createdAt));

// Template params can't contain newlines, tabs or 4+ spaces.
const clean = (s, max = 200) => String(s).replace(/\s+/g, ' ').trim().slice(0, max);

// Approved templates are the only messages Meta delivers outside the 24h window
// (i.e. when Navid hasn't written to the business number lately). The admin page
// creates these in Meta with one tap; until they're approved we fall back to plain messages.
export const COACH_TEMPLATES = [
  {
    name: 'lesson_request',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: '🎾 New padel lesson request\n\nStudent: {{1}}\nPhone: {{2}}\nWhen: {{3}}\nRef: {{4}}\nWants to work on: {{5}}\n\nConfirm this lesson?',
        example: { body_text: [['Ana Diaz', '+971 50 123 4567', 'Wed 14 Oct, 12:00–13:00 (1h) · MUSAFFAH · The Padel Project', 'SMASH0001', 'My bandeja and positioning']] },
      },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Yes, confirm' }, { type: 'QUICK_REPLY', text: 'No, decline' }] },
    ],
  },
  {
    name: 'coach_alert',
    category: 'UTILITY',
    language: 'en',
    components: [
      {
        type: 'BODY',
        text: '🔔 Coach Navid website update: {{1}}\n\nTap Show details for the full message, or open coachnavid.com/admin.',
        example: { body_text: [['New video for analysis VA0002 from Ana Diaz (Match Report, 1 file, 1.2 GB)']] },
      },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Show details' }] },
    ],
  },
  {
    // Players' login code for coachnavid.com/me (Meta's standard one-time-code format)
    name: 'login_code',
    category: 'AUTHENTICATION',
    language: 'en',
    components: [
      { type: 'BODY', add_security_recommendation: true },
      { type: 'FOOTER', code_expiration_minutes: 10 },
      { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy code' }] },
    ],
  },
];

export const sendLoginCode = (to, code) => send(to, {
  type: 'template',
  template: {
    name: 'login_code',
    language: { code: 'en' },
    components: [
      { type: 'body', parameters: [{ type: 'text', text: code }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
    ],
  },
});

function sendTemplate(to, name, params, buttonPayloads = []) {
  return send(to, {
    type: 'template',
    template: {
      name,
      language: { code: 'en' },
      components: [
        { type: 'body', parameters: params.map((text) => ({ type: 'text', text: clean(text, 900) || '—' })) },
        ...buttonPayloads.map((payload, index) => ({
          type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload }],
        })),
      ],
    },
  });
}

// Tell the coach about a new request. The template's two quick-reply buttons
// carry the booking id so a single tap confirms or declines.
export async function notifyCoach(b) {
  const to = coachNumber();
  try {
    return await sendTemplate(to, env('WHATSAPP_TEMPLATE') || 'lesson_request',
      [`${b.firstName} ${b.lastName}`, b.phone, describeSlot(b), b.code, clean(b.notes || '—')],
      [`YES:${b.id}`, `NO:${b.id}`]);
  } catch (err) {
    console.warn(`lesson_request template not usable, sending a plain message: ${err.message}`);
  }
  // Template not approved yet: plain text + reply buttons. Only delivered if the
  // coach has messaged the business number in the last 24h.
  return send(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `🎾 New lesson request\n\nStudent: ${b.firstName} ${b.lastName}\nPhone: ${b.phone}\nWhen: ${describeSlot(b)}\nRef: ${b.code}${b.notes ? `\n\n📝 Wants to work on: ${b.notes}` : ''}\n\nConfirm this lesson?`,
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `YES:${b.id}`, title: 'Yes, confirm' } },
          { type: 'reply', reply: { id: `NO:${b.id}`, title: 'No, decline' } },
        ],
      },
    },
  });
}

// Any other alert for Navid (video uploads, reminder digests). The template carries a
// one-line summary; the full text waits until he taps "Show details" (which opens the
// 24h window, so it can then be sent as a normal message).
const PENDING = 'coach/pending-details';
export async function alertCoach(summary, fullText) {
  try {
    await sendTemplate(coachNumber(), 'coach_alert', [summary], ['DETAILS']);
    await updateJSON(PENDING, (list) => { list.push({ at: new Date().toISOString(), text: fullText }); list.splice(0, list.length - 10); }, []);
  } catch (err) {
    console.warn(`coach_alert template not usable, sending a plain message: ${err.message}`);
    await sendText(coachNumber(), fullText);
  }
}

// Navid tapped "Show details": hand over everything waiting, oldest first.
export async function takePendingDetails() {
  const list = await readJSON(PENDING, []);
  if (list.length) await updateJSON(PENDING, (l) => { l.splice(0, l.length); }, []);
  return list.map((x) => x.text);
}

// Tell the student their lesson is confirmed, from the business number.
// Needs an approved template (WHATSAPP_STUDENT_TEMPLATE, see README) because
// the student hasn't messaged the business first. Returns false when not set up.
export async function notifyStudent(b) {
  const template = env('WHATSAPP_STUDENT_TEMPLATE');
  if (!template) return false;
  await send(b.phone.replace(/\D/g, ''), {
    type: 'template',
    template: {
      name: template,
      language: { code: env('WHATSAPP_STUDENT_TEMPLATE_LANG') || 'en' },
      components: [{
        type: 'body',
        parameters: [b.firstName, describeTime(b), locationLabel(b.location)]
          .map((text) => ({ type: 'text', text: clean(text) })),
      }],
    },
  });
  return true;
}

// Meta signs webhook calls with the app secret: X-Hub-Signature-256: sha256=<hex>
export function validSignature(rawBody, header) {
  const secret = env('WHATSAPP_APP_SECRET');
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(header.slice(7));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
