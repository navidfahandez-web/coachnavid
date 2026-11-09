// Lesson records per player: voice note → transcript → summary → PDF.
// Stored at lessons/<phone> (newest last); the audio itself under audio/<id> until archived to Drive.
import { getStore } from '@netlify/blobs';
import { readJSON, updateJSON } from './store.mjs';
import { SITE_URL } from './google.mjs';
import { AREAS, SHOTS } from '../../shared/report.js';
import { htmlToPdf } from './report-pdf.mjs';

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

const L = {
  en: {
    kicker: 'Lesson summary', worked: 'What we worked on', well: 'What went well', improve: 'What to improve',
    drills: 'Drills to practise', progress: 'Your progress', next: 'Focus until the next lesson', shots: 'Shots',
    better: 'better', same: 'same', worse: 'needs work', new: 'new',
  },
  lt: {
    kicker: 'Treniruotės santrauka', worked: 'Ką treniravome', well: 'Kas sekėsi gerai', improve: 'Ką tobulinti',
    drills: 'Pratimai', progress: 'Jūsų pažanga', next: 'Iki kitos treniruotės', shots: 'Smūgiai',
    better: 'geriau', same: 'taip pat', worse: 'reikia dirbti', new: 'nauja',
  },
};

const ORANGE = '#ff5b1f';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const h = (t) => `<p style="color:${ORANGE};font-size:10pt;font-weight:bold;letter-spacing:1pt;margin:16pt 0 4pt">${esc(t.toUpperCase())}</p>`;
const bullets = (arr) => (arr?.length ? `<ul style="margin:0 0 0 14pt;padding:0">${arr.map((x) => `<li style="margin:0 0 3pt">${esc(x)}</li>`).join('')}</ul>` : '');

export function lessonHtml(lesson, player) {
  const t = L[lesson.lang] ?? L.en;
  const s = lesson.summary;
  const date = new Date(`${lesson.date}T12:00:00Z`).toLocaleDateString(lesson.lang === 'lt' ? 'lt-LT' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shotName = (id) => { const x = SHOTS.find((y) => y.id === id); return x ? (x[lesson.lang] ?? x.en) : id; };
  return `<!doctype html><html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;font-size:10.5pt;color:#111111">
    <table border="0" style="border-collapse:collapse;width:100%;border:0 solid #ffffff"><tr>
      <td style="width:60pt;border:0 solid #ffffff"><img src="${SITE_URL}/assets/img/padel-beast-logo-sm.png" width="45" height="60"></td>
      <td style="border:0 solid #ffffff"><b style="font-size:12pt">Coach Navid Fahandezh</b><br><span style="color:${ORANGE};font-size:9pt">Technical Director · Padel Beast</span></td>
      <td style="text-align:right;color:#666666;font-size:9pt;border:0 solid #ffffff">${esc(date)}</td>
    </tr></table>
    <p style="color:${ORANGE};font-size:10pt;font-weight:bold;margin:18pt 0 2pt">${esc(t.kicker.toUpperCase())}</p>
    <p style="font-size:22pt;font-weight:bold;margin:0 0 4pt">${esc(s.title)}</p>
    <p style="margin:0 0 8pt"><b>${esc(player.firstName)} ${esc(player.lastName)}</b></p>
    <p>${esc(s.summary)}</p>
    ${s.worked_on?.length ? h(t.worked) + bullets(s.worked_on) : ''}
    ${s.went_well?.length ? h(t.well) + bullets(s.went_well) : ''}
    ${s.to_improve?.length ? h(t.improve) + bullets(s.to_improve) : ''}
    ${s.shots?.length ? h(t.shots) + bullets(s.shots.map((x) => `${shotName(x.id)} (${t[x.trend] ?? x.trend}) — ${x.note}`)) : ''}
    ${s.drills?.length ? h(t.drills) + s.drills.map((d) => `<p style="margin:0 0 6pt"><b>${esc(d.name)}</b><br>${esc(d.how)}</p>`).join('') : ''}
    ${s.progress ? h(t.progress) + `<p>${esc(s.progress)}</p>` : ''}
    ${s.next_focus ? `<table style="border-collapse:collapse;width:100%;margin-top:14pt"><tr><td style="background:${ORANGE};color:#ffffff;padding:10pt"><b>${esc(t.next)}</b><br>${esc(s.next_focus)}</td></tr></table>` : ''}
    <p style="margin-top:12pt"><b>— Coach Navid</b></p>
    <p style="margin-top:16pt;color:#666666;font-size:9pt">coachnavid.com · @navidff</p>
  </body></html>`;
}

export const lessonPdf = (lesson, player, folderId) =>
  htmlToPdf(lessonHtml(lesson, player), `Lesson ${lesson.date} – ${player.firstName} ${player.lastName}`, folderId, lesson.pdfFileId);

// Shot names for an area id list (used to tag lessons on the player page)
export const areaOfShot = (id) => AREAS.find((a) => a.shots.some((s) => s.id === id))?.id ?? null;
