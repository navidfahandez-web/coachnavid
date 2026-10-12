// Confirm / decline / cancel a booking. Shared by the WhatsApp webhook and the
// private admin page so both behave exactly the same.
import { updateDay } from './store.mjs';
import { confirmLink, notifyStudent } from './whatsapp.mjs';
import { isBlocking, overlaps } from '../../shared/rules.js';

const ALLOWED_FROM = {
  confirm: ['pending'],
  decline: ['pending'],
  cancel: ['pending', 'confirmed'],
};
const NEW_STATUS = { confirm: 'confirmed', decline: 'declined', cancel: 'cancelled' };

// Returns { ok, booking, error?, clash?, studentNotified?, studentLink? }
// error: 'not-found' | 'bad-action' | 'wrong-status' | 'clash'
export async function applyAction(action, id) {
  if (!ALLOWED_FROM[action]) return { ok: false, error: 'bad-action' };
  let result;
  await updateDay(String(id).slice(0, 10), (bookings) => {
    result = null; // reset if updateDay retries after a write conflict
    const b = bookings.find((x) => x.id === id);
    if (!b) return (result = { ok: false, error: 'not-found' });
    if (!ALLOWED_FROM[action].includes(b.status)) return (result = { ok: false, error: 'wrong-status', booking: { ...b } });
    if (action === 'confirm') {
      const clash = bookings.find((x) => x.id !== b.id && isBlocking(x) && overlaps(b.start, b.duration, x.start, x.duration));
      if (clash) return (result = { ok: false, error: 'clash', booking: { ...b }, clash: { ...clash } });
    }
    Object.assign(b, { status: NEW_STATUS[action], decidedAt: new Date().toISOString() });
    return (result = { ok: true, booking: { ...b } });
  });

  // Tell the student, or hand Navid a one-tap link to do it himself.
  if (result.ok && action === 'confirm') {
    result.studentLink = confirmLink(result.booking);
    try {
      result.studentNotified = await notifyStudent(result.booking);
    } catch (err) {
      console.error(`Student confirmation failed: ${err.message}`);
      result.studentNotified = false;
    }
  }
  return result;
}
