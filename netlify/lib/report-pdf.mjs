// Real PDF of a report: simple inline-styled HTML → Google Doc (converted by Drive)
// → exported as PDF into the student's folder. The temporary Doc is deleted.
import { AREAS, KINDS, REPORT_LABELS } from '../../shared/report.js';
import { deleteFile, exportFile, SITE_URL, uploadSimple } from './google.mjs';

const ORANGE = '#ff5b1f';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const para = (s) => esc(s).split(/\n{2,}/).map((p) => `<p style="margin:0 0 6pt">${p.replace(/\n/g, '<br>')}</p>`).join('');
const h = (text) => `<p style="color:${ORANGE};font-size:10pt;font-weight:bold;letter-spacing:1pt;margin:18pt 0 6pt">${esc(text.toUpperCase())}</p>`;
const bar = (n) => `<span style="color:${ORANGE}">${'■'.repeat(n)}</span><span style="color:#dddddd">${'■'.repeat(10 - n)}</span>`;

function html(r, history) {
  const L = REPORT_LABELS[r.lang] ?? REPORT_LABELS.en;
  const kind = KINDS[r.kind];
  const date = new Date(r.publishedAt || Date.now()).toLocaleDateString(r.lang === 'lt' ? 'lt-LT' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const prev = [...history].reverse().find((x) => x.kind === 'match');

  const scores = kind.scores ? `${h(L.scorecard)}<table style="border-collapse:collapse;width:100%">${AREAS.map((a) => {
    const s = r.scores?.[a.id];
    if (!s?.score) return '';
    const before = prev?.scores?.[a.id]?.score;
    const d = before ? s.score - before : null;
    return `<tr>
      <td style="padding:4pt 6pt;border-bottom:1px solid #eeeeee;width:42%"><b>${esc(a[r.lang] ?? a.en)}</b><br><span style="color:#666666;font-size:9pt">${esc(s.note)}</span>${a.shots.filter((x) => s.shots?.[x.id]?.score).map((x) => `<br><span style="font-size:8.5pt">· ${esc(x[r.lang] ?? x.en)}: <b>${s.shots[x.id].score}</b>/10${s.shots[x.id].note ? ` — ${esc(s.shots[x.id].note)}` : ''}</span>`).join('')}</td>
      <td style="padding:4pt 6pt;border-bottom:1px solid #eeeeee;font-size:9pt">${bar(s.score)}</td>
      <td style="padding:4pt 6pt;border-bottom:1px solid #eeeeee;text-align:right"><b style="font-size:14pt;color:${ORANGE}">${s.score}</b>/10${d ? `<br><span style="font-size:8pt;color:${d > 0 ? '#1f9d3a' : '#c0392b'}">${d > 0 ? '+' : ''}${d} ${L.prev}</span>` : ''}</td>
    </tr>`;
  }).join('')}</table>` : '';

  const items = r.items.filter((i) => i.title);
  const fixes = items.length ? `${h(r.kind === 'match' ? L.fixes : L.errors)}${items.map((i, n) => `
    <table style="border-collapse:collapse;width:100%;margin:0 0 8pt"><tr>
      <td style="width:28pt;vertical-align:top;padding:6pt"><span style="background:${ORANGE};color:#ffffff;font-weight:bold;font-size:13pt">&nbsp;${n + 1}&nbsp;</span></td>
      <td style="vertical-align:top;padding:6pt;border-left:2px solid ${ORANGE}">
        ${i.time ? `<span style="color:${ORANGE};font-weight:bold;font-size:9pt">▶ ${esc(i.time)}</span><br>` : ''}
        <b style="font-size:13pt">${esc(i.title)}</b>
        ${i.detail ? para(i.detail) : ''}
        ${i.fix ? `<p style="margin:6pt 0 2pt"><b>${L.fix}</b></p>${para(i.fix)}` : ''}
        ${i.drillName || i.drillHow ? `<p style="margin:6pt 0 2pt;background:#f4f4f4"><b>${L.drill}: ${esc(i.drillName)}</b></p>${para(i.drillHow)}` : ''}
      </td></tr></table>`).join('')}` : '';

  const weeks = r.weeks?.some((w) => w.focus || w.plan) ? `${h(L.plan)}<table style="border-collapse:collapse;width:100%"><tr>${r.weeks.map((w, i) => `
    <td style="vertical-align:top;padding:8pt;border:1px solid #eeeeee;width:33%"><span style="color:${ORANGE};font-size:8pt;font-weight:bold">${L.week.toUpperCase()} ${i + 1}</span><br><b>${esc(w.focus)}</b>${para(w.plan)}</td>`).join('')}</tr></table>` : '';

  const media = r.mediaFileId ? `${h(r.kind === 'match' ? L.voiceover : L.voice)}<p><a href="https://drive.google.com/file/d/${r.mediaFileId}/view">https://drive.google.com/file/d/${r.mediaFileId}/view</a></p>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;font-size:10.5pt;color:#111111">
    <table border="0" style="border-collapse:collapse;width:100%;border:0 solid #ffffff"><tr>
      <td style="width:60pt;border:0 solid #ffffff"><img src="${SITE_URL}/assets/img/padel-beast-logo-dark.png" width="45" height="60"></td>
      <td style="border:0 solid #ffffff"><b style="font-size:12pt">Coach Navid Fahandezh</b><br><span style="color:${ORANGE};font-size:9pt">Technical Director · Padel Beast</span></td>
      <td style="text-align:right;color:#666666;font-size:9pt;border:0 solid #ffffff">${esc(r.ref)}<br>${esc(date)}</td>
    </tr></table>
    <p style="color:${ORANGE};font-size:10pt;font-weight:bold;margin:18pt 0 2pt">${esc(L.report.toUpperCase())} · ${esc(kind.name.toUpperCase())}</p>
    <p style="font-size:24pt;font-weight:bold;margin:0 0 4pt">${esc(r.headline || kind.name)}</p>
    <p style="margin:0">${L.for ? `${L.for} ` : ''}<b>${esc(r.student.firstName)} ${esc(r.student.lastName)}</b></p>
    ${r.summary ? `${h(L.summary)}${para(r.summary)}` : ''}
    ${r.strengths ? `${h(L.strengths)}${para(r.strengths)}` : ''}
    ${scores}${fixes}${media}${weeks}
    ${r.closing ? `${h(L.closing)}${para(r.closing)}<p><b>— Coach Navid</b></p>` : ''}
    <p style="margin-top:20pt;color:#666666;font-size:9pt">${L.report}: <a href="${SITE_URL}/report/${r.token}">${SITE_URL}/report/${r.token}</a> · coachnavid.com · @navidff</p>
  </body></html>`;
}

// HTML → Google Doc → PDF in `folderId`; deletes `replaceId` (an older PDF) and the temp Doc.
export async function htmlToPdf(htmlText, name, folderId, replaceId = null) {
  const docId = await uploadSimple({ name: `${name} (temp)`, mimeType: 'application/vnd.google-apps.document', parents: [folderId] }, htmlText, 'text/html; charset=UTF-8');
  try {
    const pdf = await exportFile(docId, 'application/pdf');
    const pdfId = await uploadSimple({ name: `${name}.pdf`, mimeType: 'application/pdf', parents: [folderId] }, pdf, 'application/pdf');
    if (replaceId) await deleteFile(replaceId).catch(() => {});
    return pdfId;
  } finally {
    await deleteFile(docId).catch(() => {});
  }
}

// Returns the new PDF's Drive file id. Replaces the previous PDF if there was one.
export const createReportPdf = (r, history = []) =>
  htmlToPdf(html(r, history), `${r.ref} – ${KINDS[r.kind].name} – ${r.student.firstName} ${r.student.lastName}`, r.folderId, r.pdfFileId);
