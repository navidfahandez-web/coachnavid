// External AI reports (GlassWall) added to a player's record by Navid.
//   GET  /api/admin/external?phone=+971…   (admin) the player's GlassWall entries
//   POST /api/admin/external               (admin) { phone, firstName, lastName, entry, pdfBase64? } → saves it
//   POST /api/admin/external               (admin) { phone, id, action: 'delete' }
// The PDF goes into the player's Drive folder (view-only link, so it opens from their progress page).
import { randomBytes } from 'node:crypto';
import { json, requireAdmin } from '../lib/auth.mjs';
import { logActivity, readJSON, updateJSON } from '../lib/store.mjs';
import { deleteFile, drive, uploadSimple } from '../lib/google.mjs';
import { digits, ensurePlayer, externalKey, playerFolder, readPlayer } from '../lib/players.mjs';

const line = (s, n = 160) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const text = (s, n = 1500) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n);

function clean(e) {
  return {
    source: line(e.source, 40) || 'GlassWall',
    date: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : new Date().toISOString().slice(0, 10),
    time: /^\d{1,2}:\d{2}$/.test(e.time) ? e.time : '',
    court: line(e.court, 40), label: line(e.label, 80), partner: line(e.partner, 80),
    coachName: line(e.coachName, 80), coachNote: text(e.coachNote),
    focus: (Array.isArray(e.focus) ? e.focus : []).slice(0, 8).map((f) => ({
      category: line(f.category, 30), title: line(f.title, 120), finding: text(f.finding, 600),
      drills: (Array.isArray(f.drills) ? f.drills : []).slice(0, 6).map((d) => text(d, 400)).filter(Boolean),
    })).filter((f) => f.title),
    metrics: (Array.isArray(e.metrics) ? e.metrics : []).slice(0, 20).map((m) => ({
      name: line(m.name, 80), value: Number(m.value), unit: line(m.unit, 12), of: m.of ? Number(m.of) : null,
    })).filter((m) => m.name && Number.isFinite(m.value)),
  };
}

export default async (req) => {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  if (req.method === 'GET') {
    const phone = digits(new URL(req.url).searchParams.get('phone'));
    const player = phone ? await readPlayer(phone) : null;
    return json({ player: player && { firstName: player.firstName, lastName: player.lastName, phone: `+${phone}`, token: player.token }, entries: phone ? await readJSON(externalKey(phone), []) : [] });
  }

  let b;
  try { b = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const phone = digits(b.phone);
  if (!/^\d{8,15}$/.test(phone)) return json({ error: 'Enter the player’s WhatsApp number with country code.' }, 400);

  if (b.action === 'delete') {
    let removed = null;
    await updateJSON(externalKey(phone), (list) => {
      const i = list.findIndex((x) => x.id === b.id);
      if (i >= 0) removed = list.splice(i, 1)[0];
    }, []);
    if (removed?.pdfFileId) await deleteFile(removed.pdfFileId).catch(() => {});
    return json({ ok: true });
  }

  const existing = await readPlayer(phone);
  const firstName = line(b.firstName, 60) || existing?.firstName;
  const lastName = line(b.lastName, 60) || existing?.lastName || '';
  if (!firstName) return json({ error: 'Enter the player’s name.' }, 400);
  const player = await ensurePlayer({ phone, firstName, lastName });
  const entry = { id: randomBytes(6).toString('hex'), ...clean(b.entry ?? {}), addedAt: new Date().toISOString(), pdfFileId: null };

  let pdfError = null;
  if (b.pdfBase64) {
    try {
      const pdf = Buffer.from(String(b.pdfBase64), 'base64');
      if (pdf.length > 4.5 * 1024 * 1024) throw new Error('PDF is larger than 4.5 MB');
      const folder = await playerFolder(player);
      entry.pdfFileId = await uploadSimple({ name: `${entry.source} ${entry.date}${entry.time ? ` ${entry.time.replace(':', 'h')}` : ''}.pdf`, mimeType: 'application/pdf', parents: [folder] }, pdf, 'application/pdf');
      await drive(`files/${entry.pdfFileId}/permissions?fields=id`, { method: 'POST', body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
    } catch (err) {
      pdfError = err.message;
    }
  }

  await updateJSON(externalKey(phone), (list) => {
    list.push(entry);
    list.sort((a, c) => `${a.date} ${a.time}`.localeCompare(`${c.date} ${c.time}`));
  }, []);
  await logActivity({ kind: 'sent', text: `${entry.source} report (${entry.date}) added to ${firstName}’s record${pdfError ? ` — PDF not saved: ${pdfError}` : ''}.` });
  return json({ ok: true, entry, pdfError, playerToken: player.token });
};

export const config = { path: '/api/admin/external' };
