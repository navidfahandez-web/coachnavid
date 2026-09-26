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

export function describeSlot(b) {
  const day = new Date(`${b.date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
  const where = locationLabel(b.location);
  return `${day}, ${b.start}–${toHHMM(toMin(b.start) + b.duration)} (${formatDuration(b.duration)})${where ? ` · ${where}` : ''}`;
}

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

// Meta signs webhook calls with the app secret: X-Hub-Signature-256: sha256=<hex>
export function validSignature(rawBody, header) {
  const secret = env('WHATSAPP_APP_SECRET');
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(header.slice(7));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
