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
import { upcoming } from '../lib/store.mjs';
import { applyAction } from '../lib/actions.mjs';
import { coachNumber, describeSlot, sendText, validSignature } from '../lib/whatsapp.mjs';
import { isBlocking } from '../../shared/rules.js';

const COMMANDS = {
  yes: 'confirm', y: 'confirm', ok: 'confirm', confirm: 'confirm', taip: 'confirm', si: 'confirm', sí: 'confirm',
  no: 'decline', n: 'decline', ne: 'decline', decline: 'decline',
  cancel: 'cancel', atšaukti: 'cancel',
  list: 'list', bookings: 'list', lessons: 'list',
};

const HELP =
  'Commands:\n• YES / NO — answer the open request\n• YES K7Q2 / NO K7Q2 — answer a specific request\n• CANCEL K7Q2 — cancel a lesson and free the slot\n• LIST — upcoming lessons\n\nYou can also manage everything at coachnavid.com/admin';

const who = (b) => `${b.firstName} ${b.lastName}`;
const line = (b) => `${b.code} · ${describeSlot(b)} · ${who(b)} (${b.phone})`;

// Run an action and turn the result into Navid's WhatsApp reply.
async function apply(action, id) {
  const r = await applyAction(action, id);
  if (r.error === 'not-found') return 'I couldn’t find that request.';
  if (r.error === 'wrong-status') return `That booking is already ${r.booking.status}.\n${line(r.booking)}`;
  if (r.error === 'clash') return `Can’t confirm ${r.booking.code} — it overlaps ${r.clash.status} lesson ${line(r.clash)}.`;
  if (!r.ok) return HELP;
  const b = r.booking;
  if (action === 'confirm') {
    const student = r.studentNotified
      ? `📩 ${b.firstName} got a WhatsApp confirmation.`
      : `Send ${b.firstName} the confirmation (one tap): ${r.studentLink}`;
    return `Confirmed ✅ The slot is now blocked.\n${line(b)}\n\n${student}\n\nTo cancel later, reply: CANCEL ${b.code}`;
  }
  if (action === 'decline') return `Declined ❌ The slot is open again.\n${line(b)}`;
  return `Cancelled 🗓️ The slot is open again.\n${line(b)}`;
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
