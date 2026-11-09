// Google Drive for video analysis uploads.
// Scope is drive.file: the site can only see/manage files and folders it created itself,
// nothing else in Navid's Drive. Tokens live in a private Netlify Blobs store, never in the repo.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Netlify (see README).
import { getStore } from '@netlify/blobs';

const store = () => getStore({ name: 'private-config', consistency: 'strong' });
const env = (k) => (process.env[k] ?? '').trim();

export const SITE_URL = 'https://coachnavid.com';
export const REDIRECT_URI = `${SITE_URL}/api/google/callback`;
export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const ROOT_FOLDER_NAME = 'Coach Navid – Video analysis';

export const isConfigured = () => Boolean(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET'));
export const folderUrl = (id) => `https://drive.google.com/drive/folders/${id}`;

// ---- OAuth (one-time connection from the admin page) ----
export function consentUrl(state) {
  const q = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline', // gives a refresh token so the site stays connected
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google token error: ${body.error_description || body.error || res.status}`);
  return body;
}

export async function exchangeCode(code) {
  const t = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI });
  if (!t.refresh_token) throw new Error('Google did not return a refresh token. Remove the app’s access in your Google account and connect again.');
  await store().setJSON('google/tokens', {
    refresh_token: t.refresh_token, access_token: t.access_token, expires_at: Date.now() + (t.expires_in - 60) * 1000,
  });
}

export async function saveState(state) {
  await store().setJSON(`google/state/${state}`, { at: Date.now() });
}
export async function checkState(state) {
  const s = await store().get(`google/state/${state}`, { type: 'json' });
  if (s) await store().delete(`google/state/${state}`);
  return Boolean(s && Date.now() - s.at < 15 * 60 * 1000);
}

export async function disconnect() {
  await store().delete('google/tokens');
  await store().delete('google/rootFolder');
}

async function accessToken() {
  const t = await store().get('google/tokens', { type: 'json' });
  if (!t?.refresh_token) throw Object.assign(new Error('Google Drive is not connected yet.'), { code: 'not-connected' });
  if (t.access_token && t.expires_at > Date.now()) return t.access_token;
  const fresh = await tokenRequest({ refresh_token: t.refresh_token, grant_type: 'refresh_token' });
  await store().setJSON('google/tokens', { ...t, access_token: fresh.access_token, expires_at: Date.now() + (fresh.expires_in - 60) * 1000 });
  return fresh.access_token;
}

// ---- Drive API ----
export async function drive(path, init = {}) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Drive: ${body.error?.message || res.status}`);
  return body;
}

export async function status() {
  if (!isConfigured()) return { configured: false, connected: false };
  try {
    const about = await drive('about?fields=user(emailAddress),storageQuota(limit,usage)');
    return { configured: true, connected: true, email: about.user?.emailAddress, quota: about.storageQuota };
  } catch (err) {
    return { configured: true, connected: false, error: err.code === 'not-connected' ? null : err.message };
  }
}

export async function createFolder(name, parent) {
  const f = await drive('files?fields=id', {
    method: 'POST',
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) }),
  });
  return f.id;
}

// "Coach Navid – Video analysis" in My Drive, created once and remembered.
export async function rootFolder() {
  const saved = await store().get('google/rootFolder', { type: 'json' });
  if (saved?.id) {
    try {
      const f = await drive(`files/${saved.id}?fields=id,trashed`);
      if (!f.trashed) return f.id;
    } catch { /* deleted — make a new one */ }
  }
  const id = await createFolder(ROOT_FOLDER_NAME);
  await store().setJSON('google/rootFolder', { id });
  return id;
}

// Resumable upload session: the browser then uploads the file straight to Google
// (no size limit from our server). `origin` must be the page's origin for CORS.
export async function startResumableUpload({ name, parent, mimeType, size, origin }) {
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType || 'application/octet-stream',
      'X-Upload-Content-Length': String(size),
      Origin: origin,
    },
    body: JSON.stringify({ name, parents: [parent] }),
  });
  if (!res.ok) throw new Error(`Google Drive upload: ${(await res.text()).slice(0, 200)}`);
  return res.headers.get('location');
}

export const listFolder = (id) =>
  drive(`files?q=${encodeURIComponent(`'${id}' in parents and trashed = false`)}&fields=files(id,name,size,mimeType)`);

// Anyone with the link can view (used when Navid delivers the analysis).
export const shareFolder = (id) =>
  drive(`files/${id}/permissions?fields=id`, { method: 'POST', body: JSON.stringify({ role: 'reader', type: 'anyone' }) });

// Upload a file in one request (small files: generated docs and PDFs).
// `meta.mimeType` set to a Google type converts the upload (e.g. HTML → Google Doc).
export async function uploadSimple(meta, body, contentType) {
  const boundary = `cn${Date.now().toString(36)}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
  const data = Buffer.concat([Buffer.from(head), Buffer.isBuffer(body) ? body : Buffer.from(body), Buffer.from(`\r\n--${boundary}--`)]);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: data,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Drive upload: ${out.error?.message || res.status}`);
  return out.id;
}

export async function exportFile(id, mimeType) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(mimeType)}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  if (!res.ok) throw new Error(`Google Drive export: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export const deleteFile = (id) => drive(`files/${id}`, { method: 'DELETE' });
export const downloadUrl = (id) => `https://drive.google.com/uc?export=download&id=${id}`;

// One byte range of a Drive file (used to stream big videos on to other services in pieces).
export async function downloadRange(id, start, end) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
    headers: { Authorization: `Bearer ${await accessToken()}`, Range: `bytes=${start}-${end}` },
  });
  if (!res.ok && res.status !== 206) throw new Error(`Google Drive download: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
