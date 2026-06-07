/**
 * printReport.js — Reliable A4 report printing for both the desktop (Electron)
 * app and the browser/PWA.
 *
 * The old exportPdf path opened a popup and pulled CSS in via <link href="…">.
 * That works on localhost but breaks in the packaged Electron app, where the
 * popup is about:blank and those hrefs don't resolve — so the report printed
 * unstyled. Here we instead *inline* every accessible stylesheet into a single
 * <style> block, so the print document is fully self-contained and renders the
 * same everywhere.
 *
 * Two consumers:
 *   • buildReportPages()  — clones the editor's A4 pages (+ header/footer) for
 *                           the on-screen preview modal.
 *   • printReport()       — builds the self-contained print document and sends
 *                           it to the printer: silent print on desktop (Electron
 *                           webContents.print), hidden-iframe print on the web.
 */

const A4_PX = { width: 794, height: 1123 };

// ── CSS custom properties that drive the report layout ──────────────────────
// (--page-margin-*, --report-font-size, --report-line-height,
//  --patient-banner-height). They live as inline vars on the
// .narrative-editor-container, so a page cloned OUT of that container loses
// them and would fall back to defaults. We lift them out and re-apply them to
// the print/preview wrapper so margins, font and line spacing stay faithful.
export function getReportCssVars(containerEl) {
  const raw = containerEl?.getAttribute?.('style') || '';
  return raw
    .split(';')
    .map(s => s.trim())
    .filter(s => s.startsWith('--'))
    .join('; ');
}

// ── Clone the live A4 pages, stripping transient UI and (re)injecting the
//    authoritative header/footer from React state. Returns page outerHTML[]. ──
export function buildReportPages(containerEl, { header, footer } = {}) {
  const canvas = containerEl?.querySelector('.word-canvas');
  if (!canvas) return [];
  const pages = canvas.querySelectorAll('.word-page');
  if (!pages.length) return [];

  return Array.from(pages).map((p, idx) => {
    const clone = p.cloneNode(true);

    // Drop transient overlays that must never print/preview.
    clone.querySelectorAll(
      '.ne-autocomplete-dropdown, .ProseMirror-gapcursor, .grammar-underline-tooltip, .exit-preview-btn'
    ).forEach(el => el.remove());

    // Header — strip whatever was live, re-inject from React state.
    clone.querySelectorAll('.word-page-header').forEach(el => el.remove());
    if (header?.text) {
      const hdr = document.createElement('div');
      hdr.className = 'word-page-header';
      hdr.textContent = header.text.replace('{pageNumber}', String(idx + 1));
      hdr.style.cssText = [
        `font-family:${header.fontFamily || 'Calibri'}`,
        `font-size:${header.fontSize || '9'}pt`,
        `text-align:${header.align || 'left'}`,
      ].join(';');
      clone.insertBefore(hdr, clone.firstChild);
    }

    // Footer — same treatment.
    clone.querySelectorAll('.word-page-footer').forEach(el => el.remove());
    if (footer?.text) {
      const ftr = document.createElement('div');
      ftr.className = 'word-page-footer';
      ftr.textContent = footer.text.replace('{pageNumber}', String(idx + 1));
      ftr.style.cssText = [
        `font-family:${footer.fontFamily || 'Calibri'}`,
        `font-size:${footer.fontSize || '9'}pt`,
        `text-align:${footer.align || 'center'}`,
      ].join(';');
      clone.appendChild(ftr);
    }

    return clone.outerHTML;
  });
}

// ── Serialise every accessible stylesheet into one <style> string ───────────
// Same-origin sheets (the app's own CSS, incl. ProseMirror's injected base)
// expose cssRules and are inlined fully. Cross-origin sheets (e.g. Google
// Fonts) throw on cssRules access — we fall back to an @import so fonts still
// load when online, without breaking the offline case.
function collectInlinedStyles() {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    let rules = null;
    try { rules = sheet.cssRules; } catch { rules = null; }
    if (rules) {
      for (const rule of Array.from(rules)) css += rule.cssText + '\n';
    } else if (sheet.href) {
      css += `@import url("${sheet.href}");\n`;
    }
  }
  return css;
}

// ── Print-only overrides: A4 page box, page breaks, header/footer placement,
//    and hide every editor chrome element. Mirrors the proven exportPdf rules. ─
const PRINT_OVERRIDES = `
  @page { size: A4; margin: 0; }
  html, body { background:#fff !important; margin:0 !important; padding:0 !important; }
  .print-canvas { display:block; background:#fff; margin:0; padding:0; }
  .word-page {
    width:${A4_PX.width}px; min-height:${A4_PX.height}px;
    background:#fff !important; box-shadow:none !important;
    margin:0 auto !important; position:relative;
    page-break-after:always; break-after:page;
  }
  .word-page:last-child { page-break-after:auto; break-after:auto; }
  .word-page-header {
    position:absolute !important; top:0 !important; left:0 !important; right:0 !important;
    height:80px !important; padding:18px 96px 0 !important; box-sizing:border-box !important;
    color:#444 !important; border-bottom:1px solid #d0d0d0 !important;
    overflow:hidden !important; white-space:nowrap !important; text-overflow:ellipsis !important; z-index:2 !important;
  }
  .word-page-footer {
    position:absolute !important; bottom:0 !important; left:0 !important; right:0 !important;
    height:80px !important; padding:0 96px 18px !important; box-sizing:border-box !important;
    color:#444 !important; border-top:1px solid #d0d0d0 !important;
    overflow:hidden !important; white-space:nowrap !important; text-overflow:ellipsis !important;
    display:flex !important; align-items:flex-end !important; z-index:2 !important;
  }
  /* Track-change marks keep their colour on paper. */
  ins[data-ci]{ color:#1a56db !important; } del[data-ci]{ color:#e02424 !important; }
  /* Belt-and-braces: never print editor chrome. */
  .narrative-editor-toolbar, .word-ribbon, .word-statusbar, .word-ruler-band,
  .find-replace-dialog, .table-toolbar, .image-toolbar, .ne-grammar-panel,
  .exit-preview-btn, .ne-autocomplete-dropdown { display:none !important; }
`;

// ── Assemble the fully self-contained print document ────────────────────────
export function buildPrintDocument(containerEl, { header, footer, title = 'Radiology Report' } = {}) {
  const pages = buildReportPages(containerEl, { header, footer });
  const cssVars = getReportCssVars(containerEl);
  const inlined = collectInlinedStyles();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${inlined}</style>
<style>${PRINT_OVERRIDES}</style>
</head>
<body>
<div class="print-canvas" style="${cssVars}">
${pages.join('\n')}
</div>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ── Web fallback: print via a hidden iframe (no popup blocker, no about:blank
//    style-loading issues since the doc is fully inlined). ────────────────────
function printViaIframe(html) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      // Keep the iframe alive long enough for the print job to spool, then drop it.
      setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* gone */ } }, 8000);
      resolve({ ok: true, mode: 'web' });
    };

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch { /* ignore — print dialog may still appear */ }
        cleanup();
      }, 350); // let fonts/images settle
    };

    const doc = iframe.contentWindow?.document;
    if (!doc) { cleanup(); return; }
    doc.open();
    doc.write(html);
    doc.close();
  });
}

/**
 * Print the report.
 *   • Desktop (Electron): silent print straight to the default/selected printer
 *     via the report:printSilent IPC bridge.
 *   • Web/PWA: hidden-iframe print (the browser shows its print dialog — silent
 *     printing isn't possible from a sandboxed browser).
 *
 * Returns { ok, mode, reason? }.
 */
export async function printReport(containerEl, { header, footer, title, deviceName } = {}) {
  if (!containerEl) return { ok: false, reason: 'NO_CONTAINER' };
  const html = buildPrintDocument(containerEl, { header, footer, title });

  const bridge = (typeof window !== 'undefined') && window.electron?.report?.printSilent;
  if (bridge) {
    try {
      const res = await window.electron.report.printSilent({ html, title, deviceName });
      return res?.ok ? { ok: true, mode: 'desktop-silent' } : { ok: false, mode: 'desktop-silent', reason: res?.reason || 'PRINT_FAILED' };
    } catch (err) {
      return { ok: false, mode: 'desktop-silent', reason: err?.message || 'IPC_ERROR' };
    }
  }

  return printViaIframe(html);
}
