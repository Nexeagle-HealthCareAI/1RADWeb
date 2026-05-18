/**
 * exportPdf.js — Print-to-PDF via a dedicated print window.
 *
 * Clones the editor's A4 pages into a new window that includes all
 * current stylesheets, then triggers the browser's print dialog so the
 * user can save as PDF (or print on paper).
 *
 * @param {HTMLElement} containerEl  — the .narrative-editor-container DOM node
 * @param {object}      [opts]
 * @param {string}      [opts.title] — window / document title
 */
export function exportPdf(containerEl, { title = 'Radiology Report' } = {}) {
  const canvas = containerEl?.querySelector('.word-canvas');
  if (!canvas) return;

  // Collect the inner page HTML (strips floating toolbars, find dialogs, etc.)
  const pages = canvas.querySelectorAll('.word-page');
  if (!pages.length) return;

  const pagesHtml = Array.from(pages)
    .map(p => {
      const clone = p.cloneNode(true);
      // Remove injected header/footer DOM nodes – they'll be re-read from data
      clone.querySelectorAll('.ne-autocomplete-dropdown').forEach(el => el.remove());
      return clone.outerHTML;
    })
    .join('\n');

  // Gather all <link rel="stylesheet"> hrefs from the current document
  const linkTags = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map(l => `<link rel="stylesheet" href="${l.href}">`)
    .join('\n');

  // Gather all <style> blocks from the current document
  const styleTags = Array.from(document.querySelectorAll('style'))
    .map(s => `<style>${s.textContent}</style>`)
    .join('\n');

  const win = window.open('', '_blank', 'width=900,height=800,menubar=yes,toolbar=yes');
  if (!win) {
    alert('Pop-up was blocked. Please allow pop-ups for this site and try again.');
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  ${linkTags}
  ${styleTags}
  <style>
    /* ── Print-window overrides ─────────────────────────── */
    @page { size: A4; margin: 0; }

    html, body {
      background: white !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    /* Mimic the .word-canvas as a simple block */
    .print-canvas {
      display: block;
      background: white;
      padding: 0;
      margin: 0;
    }

    .word-page {
      width: 794px;
      min-height: 1123px;
      background: white !important;
      box-shadow: none !important;
      margin: 0 auto !important;
      page-break-after: always;
      break-after: page;
    }
    .word-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    /* Hide non-print elements */
    .ne-autocomplete-dropdown,
    .narrative-editor-toolbar,
    .word-ribbon,
    .word-statusbar,
    .word-ruler-band,
    .find-replace-dialog,
    .table-toolbar,
    .image-toolbar { display: none !important; }

    /* Ensure track-change marks print in colour */
    ins[data-ci] { color: #1a56db !important; }
    del[data-ci] { color: #e02424 !important; }

    /* Print button (screen-only) */
    .print-btn-bar {
      display: flex;
      justify-content: center;
      gap: 12px;
      padding: 16px;
      background: #f3f3f3;
      border-bottom: 1px solid #d8d8d8;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .print-btn-bar button {
      padding: 8px 20px;
      border-radius: 4px;
      border: 1px solid #0078d4;
      background: #0078d4;
      color: white;
      font-size: 13px;
      cursor: pointer;
      font-family: "Segoe UI", sans-serif;
    }
    .print-btn-bar button.secondary {
      background: white;
      color: #0078d4;
    }
    @media print {
      .print-btn-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="print-btn-bar">
    <button onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="secondary" onclick="window.close()">✕ Close</button>
  </div>
  <div class="print-canvas">
    ${pagesHtml}
  </div>
</body>
</html>`);

  win.document.close();
  win.focus();
}
