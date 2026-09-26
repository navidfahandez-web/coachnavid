// Navid's schedule in Lithuania — edit this file and redeploy to change it.
// Only the dates listed here can be booked; every other day shows as unavailable.

export const OPEN_DATES = [
  '2026-10-01',
  '2026-10-02',
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
];

export const LOCATIONS = [
  { id: 'klaipeda', city: 'Klaipėda', club: 'A1 Padel', note: '' },
  { id: 'palanga', city: 'Palanga', club: 'Oshee', note: 'club to be confirmed' },
];

export const locationById = (id) => LOCATIONS.find((l) => l.id === id);
export const locationLabel = (id) => {
  const l = locationById(id);
  return l ? `${l.city} · ${l.club}${l.note ? ` (${l.note})` : ''}` : '';
};
