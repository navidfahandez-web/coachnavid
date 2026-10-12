// Where Navid coaches, used to group students and send "I'm back" announcements.
// `locations` are booking location ids (shared/schedule.js) that belong to the region.
export const REGIONS = [
  {
    id: 'uae', name: 'UAE · Abu Dhabi', locations: ['tpp'], lang: 'en',
    place: 'Abu Dhabi (The Padel Project, Musaffah)',
  },
  {
    id: 'lt', name: 'Lithuania · Klaipeda & Palanga', locations: ['klaipeda', 'palanga'], lang: 'lt',
    place: 'Klaipėdą ir Palangą',
  },
  {
    id: 'om', name: 'Oman · Padel Addicts', locations: ['padel-addicts'], lang: 'en',
    place: 'Oman (Padel Addicts)',
  },
];

export const regionById = (id) => REGIONS.find((r) => r.id === id);
export const regionOfLocation = (locationId) => REGIONS.find((r) => r.locations.includes(locationId))?.id ?? null;
