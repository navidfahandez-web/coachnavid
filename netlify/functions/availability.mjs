// GET /api/availability?from=YYYY-MM-DD&to=YYYY-MM-DD
// Busy blocks per day for the calendar. Never includes student details.
import { busyBetween } from '../lib/store.mjs';
import { blockedDates } from '../lib/settings.mjs';
import { LOCATIONS, OPEN_DATES } from '../../shared/schedule.js';
import { addDays, isValidDate, lastBookableDate, nowInLithuania, RULES } from '../../shared/rules.js';

export default async (req) => {
  const url = new URL(req.url);
  const now = nowInLithuania();
  const last = lastBookableDate(now);
  let from = url.searchParams.get('from');
  let to = url.searchParams.get('to');
  if (!isValidDate(from) || from < now.date) from = now.date;
  if (!isValidDate(to) || to > last) to = last;
  if (to > addDays(from, 45)) to = addDays(from, 45);

  const days = from <= to ? await busyBetween(from, to) : {};
  return Response.json(
    { rules: RULES, now, from, to, openDates: OPEN_DATES, locations: LOCATIONS, blockedDates: blockedDates(), days },
    { headers: { 'Cache-Control': 'no-store' } },
  );
};

export const config = { path: '/api/availability' };
