// Players are identified by WhatsApp number (digits only). Each gets one private
// progress link (token) and, when needed, their own Drive folder for external files.
import { randomBytes } from 'node:crypto';
import { readJSON, updateJSON } from './store.mjs';
import { createFolder, rootFolder } from './google.mjs';

export const digits = (p) => String(p ?? '').replace(/\D/g, '');
export const playerKey = (phone) => `players/by-phone/${phone}`;
export const playerTokenKey = (token) => `players/by-token/${token}`;
export const externalKey = (phone) => `external/${phone}`;

export const readPlayer = (phone) => readJSON(playerKey(digits(phone)));

// Create (or update the name of) a player; returns the player record.
export async function ensurePlayer({ phone, firstName, lastName }) {
  const p = digits(phone);
  const player = await updateJSON(playerKey(p), (x) => {
    if (!x.token) x.token = randomBytes(16).toString('hex');
    Object.assign(x, { phone: p, firstName: firstName || x.firstName || '', lastName: lastName || x.lastName || '' });
    return { ...x };
  }, {});
  await updateJSON(playerTokenKey(player.token), (x) => { x.phone = p; }, {});
  await updateJSON('players/all', (list) => { if (!list.includes(p)) list.push(p); }, []);
  return player;
}

// "Players / Ana Diaz (+971…)" in the video-analysis Drive folder, created once.
export async function playerFolder(player) {
  if (player.folderId) return player.folderId;
  const players = await updateJSON('players/root-folder', async (x) => {
    if (!x.id) x.id = await createFolder('Players', await rootFolder());
    return x.id;
  }, {});
  const id = await createFolder(`${player.firstName} ${player.lastName} (+${player.phone})`, players);
  await updateJSON(playerKey(player.phone), (x) => { x.folderId = id; }, {});
  return id;
}
