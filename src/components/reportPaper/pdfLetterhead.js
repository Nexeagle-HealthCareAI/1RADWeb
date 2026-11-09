// A PDF letterhead (full-page upload) → PNG data URL of page 1 at print
// resolution, so it can sit behind the report like a picture.
import { pdfjs } from 'react-pdf';

// The LOCALLY-bundled worker, never a public CDN (a CDN compromise of
// executable worker JS = arbitrary code execution).
pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

export async function renderPdfLetterhead(url) {
  try {
    const doc = await pdfjs.getDocument({ url }).promise;
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1588 / vp1.width }); // 2× A4 width at 96 dpi
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[ReportPaper] PDF letterhead render failed:', err);
    return null;
  }
}
