// Runs every hour (Netlify scheduled function). Finds confirmed lessons that start
// within the next 24h and haven't had a reminder yet, marks them as due, and sends
// Navid one WhatsApp with a one-tap link per student (he sends it from WhatsApp Business).
import { logActivity, upcoming, updateDay } from '../lib/store.mjs';
import { coachNumber, describeSlot, reminderLink, sendText } from '../lib/whatsapp.mjs';
import { lessonStartMs, RULES } from '../../shared/rules.js';

export default async () => {
  const now = Date.now();
  const windowMs = RULES.reminderHours * 3600 * 1000;
  const due = (await upcoming()).filter((b) => {
    if (b.status !== 'confirmed' || b.reminderDueAt || b.remindedAt) return false;
    const until = lessonStartMs(b.date, b.start) - now;
    return until > 0 && until <= windowMs;
  });
  if (!due.length) return new Response('nothing due');

  // Mark them so Navid is only pinged once per lesson.
  for (const b of due) {
    await updateDay(b.date, (bookings) => {
      const x = bookings.find((y) => y.id === b.id);
      if (x && !x.reminderDueAt) x.reminderDueAt = new Date().toISOString();
    });
  }

  const lines = due.map((b) => `• ${b.firstName} ${b.lastName} — ${describeSlot(b)} (${b.code})\n  Send reminder: ${reminderLink(b)}`);
  try {
    await sendText(coachNumber(), `⏰ Lesson reminders to send\n\n${lines.join('\n\n')}\n\nAlso on coachnavid.com/admin`);
    await logActivity({ kind: 'sent', text: `Reminder digest sent to Navid for ${due.map((b) => b.code).join(', ')}.` });
  } catch (err) {
    console.error(`Reminder digest failed: ${err.message}`);
    await logActivity({ kind: 'failed', text: `Couldn’t send the reminder digest — ${err.message}. The reminders are still on the admin page.` });
  }
  return new Response(`reminders due: ${due.length}`);
};

export const config = { schedule: '@hourly' };
