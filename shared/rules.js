// Booking rules shared by the browser and the Netlify Functions, so the page
// and the server always agree on what a valid lesson is.
// All dates/times are wall-clock time in Lithuania (Europe/Vilnius).

export const RULES = {
  timeZone: 'Europe/Vilnius',
  open: '10:00',          // first lesson can start at 10:00
  close: '17:00',         // last lesson must end by 17:00
  step: 30,               // start times and durations move in 30-minute steps
  minDuration: 60,
  maxDuration: 120,
  bookAheadDays: 60,      // how far into the future students can book
  minNoticeMinutes: 120,  // no requests for lessons starting within 2 hours
  pendingHoldHours: 24,   // an unanswered request holds its slot this long
};

export const DURATIONS = [];
for (let d = RULES.minDuration; d <= RULES.maxDuration; d += RULES.step) DURATIONS.push(d);

export const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const toHHMM = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const formatDuration = (min) =>
  min % 60 === 0 ? `${min / 60}h` : `${Math.floor(min / 60)}h ${min % 60}min`;

// "Now" as Lithuanian wall-clock time: { date: 'YYYY-MM-DD', minutes: 0..1439 }
export function nowInLithuania(at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: RULES.timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

// Calendar-date arithmetic on 'YYYY-MM-DD' strings (UTC-based, so no DST surprises).
export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const isValidDate = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export function lastBookableDate(now = nowInLithuania()) {
  return addDays(now.date, RULES.bookAheadDays);
}

// Every start time that fits a lesson of `duration` inside opening hours.
export function startTimes(duration) {
  const out = [];
  for (let m = toMin(RULES.open); m + duration <= toMin(RULES.close); m += RULES.step) out.push(toHHMM(m));
  return out;
}

export function overlaps(aStart, aDuration, bStart, bDuration) {
  const a = toMin(aStart), b = toMin(bStart);
  return a < b + bDuration && b < a + aDuration;
}

// Why a given start/duration can't be booked, or null if it can.
// `busy` = [{ start, duration }] of lessons that are confirmed or held.
export function unavailableReason({ date, start, duration, busy = [], blockedDates = [], now = nowInLithuania() }) {
  if (!isValidDate(date)) return 'invalid-date';
  if (!DURATIONS.includes(duration)) return 'invalid-duration';
  if (!startTimes(duration).includes(start)) return 'outside-hours';
  if (date < now.date || date > lastBookableDate(now)) return 'out-of-range';
  if (blockedDates.includes(date)) return 'day-off';
  if (date === now.date && toMin(start) < now.minutes + RULES.minNoticeMinutes) return 'too-soon';
  if (busy.some((b) => overlaps(start, duration, b.start, b.duration))) return 'taken';
  return null;
}

// Does this day still have at least one bookable 1-hour lesson?
export function dayHasOpening({ date, busy, blockedDates, now }) {
  return startTimes(RULES.minDuration).some(
    (start) => !unavailableReason({ date, start, duration: RULES.minDuration, busy, blockedDates, now }),
  );
}

// Whether a stored booking currently blocks its slot.
export function isBlocking(booking, nowMs = Date.now()) {
  if (booking.status === 'confirmed') return true;
  if (booking.status === 'pending') {
    return nowMs - Date.parse(booking.createdAt) < RULES.pendingHoldHours * 3600 * 1000;
  }
  return false;
}
