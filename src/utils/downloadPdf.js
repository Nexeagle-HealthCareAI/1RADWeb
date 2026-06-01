/**
 * Direct PDF download from HTML content using html2pdf.js
 * Downloads PDF without opening print dialog
 */
import html2pdf from 'html2pdf.js';
import { notifyToast } from './toast';

export async function downloadReportPdf(pages, filename = 'report.pdf', options = {}) {
  if (!pages || pages.length === 0) {
    console.error('[DownloadPDF] No pages provided');
    return;
  }

  try {
    // Create a temporary container with all pages
    const container = document.createElement('div');
    container.style.cssText = `
      width: 210mm;
      background: white;
      margin: 0;
      padding: 0;
    `;

    // Add each page
    pages.forEach((pageHTML, idx) => {
      const pageDiv = document.createElement('div');
      pageDiv.style.cssText = `
        width: 210mm;
        height: 297mm;
        page-break-after: ${idx === pages.length - 1 ? 'auto' : 'always'};
        break-after: ${idx === pages.length - 1 ? 'auto' : 'page'};
        background: white;
        margin: 0;
        padding: 0;
        position: relative;
        overflow: hidden;
      `;
      pageDiv.innerHTML = pageHTML;
      container.appendChild(pageDiv);
    });

    // Append to body temporarily for rendering
    document.body.appendChild(container);

    // Configure html2pdf options
    const pdfOptions = {
      margin: 0,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, allowTaint: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      ...options,
    };

    // Generate and download PDF
    await html2pdf().set(pdfOptions).from(container).save();

    // Clean up
    document.body.removeChild(container);
    console.log(`[DownloadPDF] Successfully downloaded: ${filename}`);
  } catch (error) {
    console.error('[DownloadPDF] Error downloading PDF:', error);
    notifyToast('Failed to download PDF. Please try again or use Print instead.', 'error');
  }
}
