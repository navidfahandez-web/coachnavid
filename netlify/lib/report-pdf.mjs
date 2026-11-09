// Real PDF of a report (Coach Navid design, rendered with headless Chromium) into the student's folder.
import { KINDS } from '../../shared/report.js';
import { renderToDrive } from './pdf-render.mjs';
import { reportDoc } from './pdf-docs.mjs';

// Returns the new PDF's Drive file id. Replaces the previous PDF if there was one.
export const createReportPdf = (r, history = []) =>
  renderToDrive(reportDoc(r, history), `${r.ref} – ${KINDS[r.kind].name} – ${r.student.firstName} ${r.student.lastName}`, r.folderId, r.pdfFileId);
