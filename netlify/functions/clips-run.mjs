// Background: make the "fix clips" video of a report — { ref } — and save it in the student's
// Drive folder, so Navid can record his voice-over on it. Progress lives in report.clips.
import { isAdmin } from '../lib/auth.mjs';
import { logActivity, readJSON, updateJSON } from '../lib/store.mjs';
import { deleteFile, listFolder, uploadSimple } from '../lib/google.mjs';
import { makeFixClips } from '../lib/clips.mjs';

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { ref } = await req.json();
  const key = `reports/by-ref/${ref}`;
  const setClips = (c) => updateJSON(key, (x) => { x.clips = { ...(x.clips ?? {}), ...c }; }, {});
  try {
    const r = await readJSON(key);
    let videoId = r.videoFileId;
    if (!videoId) {
      const { files = [] } = await listFolder(r.folderId);
      videoId = files.filter((f) => /^video\//.test(f.mimeType)).sort((a, b) => Number(b.size) - Number(a.size))[0]?.id;
    }
    if (!videoId) throw new Error('No video in the student’s folder yet.');
    const { mp4, seconds } = await makeFixClips(videoId, r.items);
    const fileId = await uploadSimple({ name: `${ref} – fix clips (${Math.round(seconds)} s).mp4`, mimeType: 'video/mp4', parents: [r.folderId] }, mp4, 'video/mp4');
    if (r.clips?.fileId) await deleteFile(r.clips.fileId).catch(() => {});
    await setClips({ status: 'ready', fileId, seconds: Math.round(seconds), at: new Date().toISOString(), error: null });
    await logActivity({ kind: 'sent', text: `Fix clips ready for ${ref} (${Math.round(seconds)} s) — in the student’s Drive folder.` });
  } catch (err) {
    console.error(`Clips for ${ref} failed: ${err.message}`);
    await setClips({ status: 'failed', error: err.message.replace(/https?:\/\/\S+/g, '<link>').replace(/Bearer\s+\S+/g, 'Bearer <token>').slice(0, 500) });
  }
  return new Response('done');
};

export const config = { path: '/api/clips-run', background: true };
