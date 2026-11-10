// Background: put the coach's voice lines onto a report's fix clip — { ref, lines: [url, …] }.
// The lines are audio files (e.g. generated in Coach Navid's Higgsfield voice); line k starts with fix k.
// Saves "<ref> – fix clips + voice.mp4" in the student's folder and sets it as the report's voice-over video.
import { isAdmin } from '../lib/auth.mjs';
import { logActivity, readJSON, updateJSON } from '../lib/store.mjs';
import { deleteFile, downloadRange, drive, uploadSimple } from '../lib/google.mjs';
import { addVoice } from '../lib/clips.mjs';

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { ref, lines } = await req.json();
  const key = `reports/by-ref/${ref}`;
  const setClips = (c) => updateJSON(key, (x) => { x.clips = { ...(x.clips ?? {}), ...c }; }, {});
  try {
    const r = await readJSON(key);
    if (r.clips?.status !== 'ready' || !r.clips.fileId) throw new Error('Make the fix clip first.');
    const { size } = await drive(`files/${r.clips.fileId}?fields=size`);
    const clip = await downloadRange(r.clips.fileId, 0, Number(size) - 1);
    const audio = [];
    for (const url of lines) {
      if (!/^https:\/\//.test(url)) throw new Error('Voice lines must be https links.');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Couldn’t download a voice line (${res.status}).`);
      audio.push(Buffer.from(await res.arrayBuffer()));
    }
    const mp4 = await addVoice(clip, audio, r.clips.offsets ?? []);
    const fileId = await uploadSimple({ name: `${ref} – fix clips + voice.mp4`, mimeType: 'video/mp4', parents: [r.folderId] }, mp4, 'video/mp4');
    if (r.clips.voiceFileId) await deleteFile(r.clips.voiceFileId).catch(() => {});
    await setClips({ voiceStatus: 'ready', voiceFileId: fileId, voiceError: null });
    await updateJSON(key, (x) => { x.mediaFileId = fileId; }, {}); // the report's voice-over video
    await logActivity({ kind: 'sent', text: `Voice-over added to the fix clip of ${ref}.` });
  } catch (err) {
    console.error(`Voice for ${ref} failed: ${err.message}`);
    await setClips({ voiceStatus: 'failed', voiceError: err.message.slice(0, 400) });
  }
  return new Response('done');
};

export const config = { path: '/api/voice-run', background: true };
