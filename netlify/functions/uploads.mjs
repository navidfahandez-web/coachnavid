// Video analysis uploads into Navid's Google Drive — one folder per upload.
//   POST /api/uploads/start    { firstName, lastName, phone, plan, paymentRef, notes } → { uploadId, ref }
//   POST /api/uploads/session  { uploadId, name, size, type } → { url } (browser uploads straight to Google)
//   POST /api/uploads/done     { uploadId } → notifies Navid on WhatsApp
//   GET  /api/admin/uploads                  (admin) list
//   POST /api/admin/uploads    { id, action: 'share' } (admin) → view link + WhatsApp text for the student
import { randomBytes } from 'node:crypto';
import { json, requireAdmin } from '../lib/auth.mjs';
import { logActivity, nextUploadRef, readJSON, updateJSON } from '../lib/store.mjs';
import { createFolder, folderUrl, listFolder, rootFolder, shareFolder, startResumableUpload } from '../lib/google.mjs';
import { alertCoach } from '../lib/whatsapp.mjs';

const KEY = 'uploads/list';
const PLANS = { quick: 'Quick Fix', match: 'Match Report', progress: 'Progress Plan' };
const MAX_BYTES = 8 * 1024 ** 3; // 8 GB per file
const clean = (s, n = 80) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const gb = (b) => `${(b / 1024 ** 3).toFixed(b > 1024 ** 3 ? 1 : 2)} GB`;

async function body(req) {
  try { return await req.json(); } catch { return null; }
}
const findUpload = async (uploadId) => (await readJSON(KEY, [])).find((u) => u.uploadId === uploadId);

export default async (req) => {
  const { pathname } = new URL(req.url);

  // ---------- admin ----------
  if (pathname === '/api/admin/uploads') {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    if (req.method === 'POST') {
      const b = await body(req);
      const u = (await readJSON(KEY, [])).find((x) => x.id === b?.id);
      if (!u) return json({ error: 'Upload not found.' }, 404);
      if (b.action !== 'share') return json({ error: 'Unknown action.' }, 400);
      await shareFolder(u.folderId);
      await updateJSON(KEY, (list) => { const x = list.find((y) => y.id === u.id); if (x) x.sharedAt = new Date().toISOString(); }, []);
      const text = `Hi ${u.firstName}! 🎥 Your ${u.planName} video analysis is ready. Everything is in your folder: ${folderUrl(u.folderId)}\n\nAny questions, just reply here. Coach Navid`;
      return json({ ok: true, link: folderUrl(u.folderId), whatsapp: `https://wa.me/${u.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}` });
    }
    const list = (await readJSON(KEY, [])).filter((u) => u.status !== 'started' || Date.now() - Date.parse(u.createdAt) < 864e5);
    return json({ uploads: list.reverse().map(({ uploadId, ...u }) => ({ ...u, folderUrl: folderUrl(u.folderId) })) });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const b = await body(req);
  if (!b) return json({ error: 'Invalid request' }, 400);

  // ---------- student: start ----------
  if (pathname.endsWith('/start')) {
    if (b.company) return json({ error: 'Invalid request' }, 400); // honeypot
    const firstName = clean(b.firstName, 60), lastName = clean(b.lastName, 60);
    const phone = String(b.phone ?? '').replace(/[^\d+]/g, '').replace(/^00/, '+');
    if (!firstName || !lastName) return json({ error: 'Please enter your first and last name.', code: 'name' }, 400);
    if (!/^\+\d{8,15}$/.test(phone)) return json({ error: 'Please enter your WhatsApp number with country code.', code: 'phone' }, 400);
    if (!PLANS[b.plan]) return json({ error: 'Please choose your analysis.', code: 'plan' }, 400);
    let folderId, ref;
    try {
      ref = await nextUploadRef();
      folderId = await createFolder(`${ref} · ${firstName} ${lastName} (${phone})`, await rootFolder());
    } catch (err) {
      console.error(`Upload start failed: ${err.message}`);
      return json({ error: 'Uploads are not available right now. Please send your video to Navid on WhatsApp.', code: 'drive' }, 503);
    }
    const u = {
      id: ref, uploadId: randomBytes(18).toString('hex'), ref, folderId,
      firstName, lastName, phone, plan: b.plan, planName: PLANS[b.plan],
      paymentRef: clean(b.paymentRef, 80), notes: clean(b.notes, 400),
      files: [], status: 'started', createdAt: new Date().toISOString(),
    };
    await updateJSON(KEY, (list) => { list.push(u); }, []);
    return json({ uploadId: u.uploadId, ref });
  }

  const u = await findUpload(String(b.uploadId ?? ''));
  if (!u || Date.now() - Date.parse(u.createdAt) > 864e5) return json({ error: 'This upload has expired. Please start again.' }, 404);

  // ---------- student: one resumable session per file ----------
  if (pathname.endsWith('/session')) {
    const size = Number(b.size);
    if (!(size > 0) || size > MAX_BYTES) return json({ error: 'Files can be up to 8 GB each.', code: 'size' }, 400);
    if (!/^video\//.test(String(b.type ?? ''))) return json({ error: 'Please upload a video file.', code: 'type' }, 400);
    if (u.files.length >= 10) return json({ error: 'Up to 10 files per upload.' }, 400);
    const origin = req.headers.get('origin') || new URL(req.url).origin;
    const url = await startResumableUpload({ name: clean(b.name, 120) || 'video', parent: u.folderId, mimeType: b.type, size, origin });
    await updateJSON(KEY, (list) => { list.find((x) => x.id === u.id)?.files.push({ name: clean(b.name, 120), size }); }, []);
    return json({ url });
  }

  // ---------- student: finished ----------
  if (pathname.endsWith('/done')) {
    const { files } = await listFolder(u.folderId);
    if (!files?.length) return json({ error: 'No video arrived yet — please try uploading again.' }, 400);
    const total = files.reduce((s, f) => s + Number(f.size || 0), 0);
    await updateJSON(KEY, (list) => {
      const x = list.find((y) => y.id === u.id);
      if (x) Object.assign(x, { status: 'uploaded', uploadedAt: new Date().toISOString(), fileCount: files.length, totalBytes: total });
    }, []);
    const msg = [
      `🎥 New video for analysis — ${u.ref}`,
      '',
      `Student: ${u.firstName} ${u.lastName} (${u.phone})`,
      `Plan: ${u.planName}`,
      u.paymentRef ? `Ziina payment: ${u.paymentRef}` : 'Ziina payment: (not given)',
      `Files: ${files.length} · ${gb(total)}`,
      u.notes ? `📝 ${u.notes}` : '',
      '',
      `Open folder: ${folderUrl(u.folderId)}`,
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
    try {
      await alertCoach(`New video for analysis ${u.ref} from ${u.firstName} ${u.lastName} (${u.planName}, ${files.length} file${files.length === 1 ? '' : 's'}, ${gb(total)})`, msg);
      await logActivity({ kind: 'sent', text: `Video upload ${u.ref} from ${u.firstName} — Navid notified.` });
    } catch (err) {
      await logActivity({ kind: 'failed', text: `Video upload ${u.ref}: couldn’t notify Navid — ${err.message}` });
    }
    return json({ ok: true, ref: u.ref });
  }

  return json({ error: 'Not found' }, 404);
};

export const config = { path: ['/api/uploads/start', '/api/uploads/session', '/api/uploads/done', '/api/admin/uploads'] };
