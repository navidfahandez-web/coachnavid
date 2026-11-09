// Lesson records per player: voice note → transcript → summary → PDF.
// Stored at lessons/<phone> (newest last); the audio itself under audio/<id> until archived to Drive.
import { getStore } from '@netlify/blobs';
import { readJSON, updateJSON } from './store.mjs';
import { AREAS } from '../../shared/report.js';
import { renderToDrive } from './pdf-render.mjs';
import { lessonDoc } from './pdf-docs.mjs';

export const lessonsKey = (phone) => `lessons/${phone}`;
export const audioStore = () => getStore({ name: 'lesson-audio', consistency: 'strong' });
export const readLessons = (phone) => readJSON(lessonsKey(phone), []);

export const updateLesson = (phone, id, patch) => updateJSON(lessonsKey(phone), (list) => {
  const x = list.find((l) => l.id === id);
  if (x) Object.assign(x, typeof patch === 'function' ? patch(x) : patch);
  return x ? { ...x } : null;
}, []);

// What players may see (no raw transcript or audio)
export const publicLesson = ({ id, date, lang, summary, pdfFileId }) => ({ id, date, lang, summary, pdfFileId });

// The PDF (Coach Navid design, rendered with headless Chromium)
export const lessonPdf = (lesson, player, folderId) =>
  renderToDrive(lessonDoc(lesson, player), `Lesson ${lesson.date} – ${player.firstName} ${player.lastName}`, folderId, lesson.pdfFileId);

// Shot names for an area id list (used to tag lessons on the player page)
export const areaOfShot = (id) => AREAS.find((a) => a.shots.some((s) => s.id === id))?.id ?? null;
