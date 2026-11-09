// Background: make (or remake) the PDF of a published report — { ref }. Called by publish with the admin key.
import { isAdmin } from '../lib/auth.mjs';
import { logActivity, readJSON, updateJSON } from '../lib/store.mjs';
import { createReportPdf } from '../lib/report-pdf.mjs';

const digits = (p) => String(p ?? '').replace(/\D/g, '');

export default async (req) => {
  if (!isAdmin(req)) return new Response('Forbidden', { status: 403 });
  const { ref } = await req.json();
  const key = `reports/by-ref/${ref}`;
  const r = await readJSON(key);
  if (!r) return new Response('Not found', { status: 404 });
  try {
    // earlier Match Reports of this player, for the "+1 last time" changes
    const index = (await readJSON('reports/index', [])).filter((x) => x.status === 'published' && x.phone === digits(r.student.phone) && x.ref !== ref && x.publishedAt < r.publishedAt)
      .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
    const earlier = [];
    for (const x of index) { const e = await readJSON(`reports/by-ref/${x.ref}`); if (e) earlier.push(e); }
    const pdfFileId = await createReportPdf(r, earlier);
    await updateJSON(key, (x) => { x.pdfFileId = pdfFileId; }, {});
    await updateJSON('uploads/list', (list) => { const x = list.find((y) => y.ref === ref); if (x) x.pdfFileId = pdfFileId; }, []);
  } catch (err) {
    console.error(`PDF for ${ref} failed: ${err.message}`);
    await logActivity({ kind: 'failed', text: `Report ${ref}: PDF not created — ${err.message}. Students can still save it from the page.` });
  }
  return new Response('done');
};

export const config = { path: '/api/pdf-run', background: true };
