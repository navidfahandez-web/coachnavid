// Navid's schedule — edit this file and redeploy to change it.
// Lessons run every week at The Padel Project, Musaffah (Abu Dhabi), on UAE time.
// To close a specific day (holiday, tournament…), set BLOCKED_DATES in Netlify instead.

export const TIME_ZONE = 'Asia/Dubai';

// Opening hours for lessons by weekday (0 = Sunday … 6 = Saturday).
// A lesson must start and finish inside these hours.
const WEEKDAY = { open: '12:00', close: '17:00' };
const WEEKEND = { open: '08:00', close: '14:00' }; // UAE weekend: Saturday & Sunday
export const WEEKLY_HOURS = {
  0: WEEKEND, // Sunday
  1: WEEKDAY,
  2: WEEKDAY,
  3: WEEKDAY,
  4: WEEKDAY,
  5: WEEKDAY, // Friday
  6: WEEKEND, // Saturday
};

export const LOCATIONS = [
  { id: 'tpp', city: 'Musaffah, Abu Dhabi', club: 'The Padel Project', note: '' },
];
export const DEFAULT_LOCATION = LOCATIONS[0].id;

// Pre-filled in the phone field of the booking form
export const DEFAULT_PHONE_PREFIX = '+971 ';

export const hoursOn = (date) => WEEKLY_HOURS[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? null;

export const locationById = (id) => LOCATIONS.find((l) => l.id === id);
export const locationLabel = (id) => {
  const l = locationById(id);
  return l ? `${l.club} · ${l.city}${l.note ? ` (${l.note})` : ''}` : '';
};
