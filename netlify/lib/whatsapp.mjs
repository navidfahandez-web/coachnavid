// WhatsApp Cloud API (Meta) helpers.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { formatDuration, toHHMM, toMin } from '../../shared/rules.js';
import { locationLabel } from '../../shared/schedule.js';

const env = (k) => process.env[k] ?? '';
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
export const studentConfirmationText = (b) =>
  `Hi ${b.firstName}! ✅ Your padel lesson with Coach Navid is confirmed.\n\n📅 ${describeTime(b)}\n📍 ${locationLabel(b.location)}\n\nSee you on court!`;

// One-tap link that opens WhatsApp with the confirmation already typed for the student.
export const confirmLink = (b) =>
  `https://wa.me/${b.phone.replace(/\D/g, '')}?text=${encodeURIComponent(studentConfirmationText(b))}`;

// Template params can't contain newlines, tabs or 4+ spaces.
const clean = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 200);

// Tell the coach about a new request. Business-initiated messages need an
// approved template (see README); its two quick-reply buttons carry the
// booking id so a single tap confirms or declines.
export async function notifyCoach(b) {
  const to = coachNumber();
  const template = env('WHATSAPP_TEMPLATE');
  if (template) {
    return send(to, {
      type: 'template',
      template: {
        name: template,
        language: { code: env('WHATSAPP_TEMPLATE_LANG') || 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              `${b.firstName} ${b.lastName}`, b.phone, describeSlot(b), b.code,
            ].map((text) => ({ type: 'text', text: clean(text) })),
          },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `YES:${b.id}` }] },
          { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `NO:${b.id}` }] },
        ],
      },
    });
  }
  // No template configured: plain text + reply buttons. Only delivered if the
  // coach has messaged the business number in the last 24h — fine for testing.
  return send(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `🎾 New lesson request\n\nStudent: ${b.firstName} ${b.lastName}\nPhone: ${b.phone}\nWhen: ${describeSlot(b)}\nRef: ${b.code}\n\nConfirm this lesson?`,
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
