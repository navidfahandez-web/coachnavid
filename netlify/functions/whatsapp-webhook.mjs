// WhatsApp Cloud API webhook: /api/whatsapp
//   GET  — Meta's one-time verification handshake
//   POST — incoming messages. Only messages from COACH_WHATSAPP are acted on.
//
// What Navid can send:
//   tap "Yes, confirm" / "No, decline" on a request
//   YES / NO            — answers the only open request (asks which one if several)
//   YES K7Q2 / NO K7Q2  — answers a specific request by its ref
//   CANCEL K7Q2         — cancels a lesson and frees the slot again
//   LIST                — upcoming lessons and open requests
import { updateDay, upcoming } from '../lib/store.mjs';
import { coachNumber, describeSlot, sendText, validSignature } from '../lib/whatsapp.mjs';
import { isBlocking, overlaps } from '../../shared/rules.js';

const COMMANDS = {
  yes: 'confirm', y: 'confirm', ok: 'confirm', confirm: 'confirm', taip: 'confirm', si: 'confirm', sí: 'confirm',
  no: 'decline', n: 'decline', ne: 'decline', decline: 'decline',
  cancel: 'cancel', atšaukti: 'cancel',
  list: 'list', bookings: 'list', lessons: 'list',
};

const HELP =
  'Commands:\n• YES / NO — answer the open request\n• YES K7Q2 / NO K7Q2 — answer a specific request\n• CANCEL K7Q2 — cancel a lesson and free the slot\n• LIST — upcoming lessons';

const who = (b) => `${b.firstName} ${b.lastName}`;
const line = (b) => `${b.code} · ${describeSlot(b)} · ${who(b)} (${b.phone})`;

// Apply an action to one booking inside the day's locked update. Returns the reply text.
function apply(action, id) {
  return updateDay(id.slice(0, 10), (bookings) => {
    const b = bookings.find((x) => x.id === id);
    if (!b) return 'I couldn’t find that request.';

    if (action === 'confirm') {
      if (b.status === 'confirmed') return `Already confirmed ✅\n${line(b)}`;
      if (b.status !== 'pending') return `That request was already ${b.status}, so it can’t be confirmed.\n${line(b)}`;
      const clash = bookings.find((x) => x.id !== b.id && isBlocking(x) && overlaps(b.start, b.duration, x.start, x.duration));
      if (clash) return `Can’t confirm ${b.code} — it overlaps ${clash.status} lesson ${line(clash)}.`;
      Object.assign(b, { status: 'confirmed', decidedAt: new Date().toISOString() });
      return `Confirmed ✅ The slot is now blocked.\n${line(b)}\n\nMessage ${b.firstName}: https://wa.me/${b.phone.replace('+', '')}\nTo cancel later, reply: CANCEL ${b.code}`;
    }
    if (action === 'decline') {
      if (b.status !== 'pending') return `That request is already ${b.status}.\n${line(b)}`;
      Object.assign(b, { status: 'declined', decidedAt: new Date().toISOString() });
      return `Declined ❌ The slot is open again.\n${line(b)}`;
    }
    if (action === 'cancel') {
      if (!['pending', 'confirmed'].includes(b.status)) return `That lesson is already ${b.status}.\n${line(b)}`;
      Object.assign(b, { status: 'cancelled', decidedAt: new Date().toISOString() });
      return `Cancelled 🗓️ The slot is open again.\n${line(b)}`;
    }
    return HELP;
  });
}

async function handle(command) {
  // Button taps carry "YES:<id>" / "NO:<id>"
  const button = /^(YES|NO):(\d{4}-\d{2}-\d{2}_[A-Z0-9]+)$/.exec(command);
  if (button) return apply(button[1] === 'YES' ? 'confirm' : 'decline', button[2]);

  const [word = '', ref = ''] = command.trim().toLowerCase().split(/\s+/);
  const action = COMMANDS[word.replace(/[^\p{L}]/gu, '')];
  if (!action) return HELP;

  const all = await upcoming();
  if (action === 'list') {
    const confirmed = all.filter((b) => b.status === 'confirmed');
    const pending = all.filter((b) => b.status === 'pending' && isBlocking(b));
    return [
      `Upcoming lessons (${confirmed.length}):`, ...confirmed.map(line),
      '', `Waiting for your answer (${pending.length}):`, ...pending.map(line),
    ].join('\n');
  }

  if (ref) {
    const b = all.find((x) => x.code === ref.toUpperCase());
    return b ? apply(action, b.id) : `No upcoming booking with ref ${ref.toUpperCase()}.`;
  }

  // No ref: only unambiguous when exactly one request fits.
  const candidates = all.filter((b) =>
    action === 'cancel' ? b.status === 'confirmed' : b.status === 'pending' && isBlocking(b));
  if (candidates.length === 1) return apply(action, candidates[0].id);
  if (!candidates.length) return action === 'cancel' ? 'No upcoming lessons to cancel.' : 'There are no open requests right now.';
  const verb = { confirm: 'YES', decline: 'NO', cancel: 'CANCEL' }[action];
  return `Which one? Reply ${verb} + ref:\n${candidates.map(line).join('\n')}`;
}

export default async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' &&
      url.searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get('hub.challenge')) : new Response('Forbidden', { status: 403 });
  }

  const raw = await req.text();
  if (!validSignature(raw, req.headers.get('x-hub-signature-256'))) return new Response('Bad signature', { status: 401 });

  const messages = JSON.parse(raw).entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];
  for (const m of messages) {
    if (m.from !== coachNumber()) continue; // ignore everyone except Navid
    const command =
      m.button?.payload ?? m.interactive?.button_reply?.id ?? m.text?.body ?? '';
    try {
      await sendText(m.from, await handle(command));
    } catch (err) {
      console.error('Webhook command failed', command, err);
      await sendText(m.from, 'Something went wrong handling that — please try again.').catch(() => {});
    }
  }
  return new Response('ok'); // always 200 so Meta doesn't retry
};

export const config = { path: '/api/whatsapp' };
