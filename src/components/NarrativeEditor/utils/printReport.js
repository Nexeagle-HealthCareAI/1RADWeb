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

const A4_HEIGHT_PX = 1123;
const PAGE_TOLERANCE_PX = 4;

// Drop transient editor-only overlays that must never print/preview (incl.
// pageview's decoration chrome widgets, which are an on-screen overlay).
function stripTransient(el) {
  el.querySelectorAll?.(
    '.ne-autocomplete-dropdown, .ProseMirror-gapcursor, .grammar-underline-tooltip, .exit-preview-btn, .word-page-chrome'
  ).forEach((n) => n.remove());
}

// (Re)inject the authoritative header/footer (from React state) into a page,
// substituting the 1-based page number.
function injectHeaderFooter(pageEl, idx, { header, footer } = {}) {
  pageEl.querySelectorAll('.word-page-header').forEach((el) => el.remove());
  if (header?.text) {
    const hdr = document.createElement('div');
    hdr.className = 'word-page-header';
    hdr.textContent = header.text.replace('{pageNumber}', String(idx + 1));
    hdr.style.cssText = [
      `font-family:${header.fontFamily || 'Calibri'}`,
      `font-size:${header.fontSize || '9'}pt`,
      `text-align:${header.align || 'left'}`,
    ].join(';');
    pageEl.insertBefore(hdr, pageEl.firstChild);
  }
  pageEl.querySelectorAll('.word-page-footer').forEach((el) => el.remove());
  if (footer?.text) {
    const ftr = document.createElement('div');
    ftr.className = 'word-page-footer';
    ftr.textContent = footer.text.replace('{pageNumber}', String(idx + 1));
    ftr.style.cssText = [
      `font-family:${footer.fontFamily || 'Calibri'}`,
      `font-size:${footer.fontSize || '9'}pt`,
      `text-align:${footer.align || 'center'}`,
    ].join(';');
    pageEl.appendChild(ftr);
  }
}

function readBannerHeight(containerEl) {
  try { return parseFloat(containerEl?.style?.getPropertyValue?.('--patient-banner-height')) || 0; }
  catch { return 0; }
}

/**
 * Greedy first-fit of the flat column's content blocks into page-sized groups,
 * measuring live block heights so the printed pagination matches the on-screen
 * flow. Page writable height = A4 − the column's vertical padding (the margins),
 * minus the first-page banner on page 1. A `.page-break-marker` forces a new
 * page (and isn't itself rendered). Decoration chrome widgets are skipped.
 * Returns an array of arrays of (live) block elements.
 */
export function computeFlatPageGroups(flatEl, { bannerHeightPx = 0 } = {}) {
  if (!flatEl) return [];
  const cs = window.getComputedStyle(flatEl);
  const padTop = parseFloat(cs.paddingTop) || 96;
  const padBottom = parseFloat(cs.paddingBottom) || 96;
  // The column's padding-top already includes the banner reserve; back it out
  // so only page 1 loses the banner height (pages 2+ get the full area).
  const baseTop = Math.max(0, padTop - bannerHeightPx);
  const maxFor = (pageIdx) => {
    const m = A4_HEIGHT_PX - baseTop - padBottom - (pageIdx === 0 ? bannerHeightPx : 0);
    return m > 100 ? m : 931;
  };

  const groups = [[]];
  let acc = 0;
  let pageIdx = 0;
  for (const child of Array.from(flatEl.children)) {
    if (child.classList?.contains('word-page-chrome')) continue; // overlay, not content
    const isBreak = child.classList?.contains('page-break-marker') ||
                    child.getAttribute?.('data-page-break') != null;
    if (isBreak) {
      if (groups[groups.length - 1].length > 0) { groups.push([]); pageIdx++; acc = 0; }
      continue;
    }
    let h = child.offsetHeight || 0;
    try { h += parseFloat(window.getComputedStyle(child).marginBottom) || 0; } catch { /* ignore */ }
    const max = maxFor(pageIdx);
    if (acc + h > max + PAGE_TOLERANCE_PX && groups[groups.length - 1].length > 0) {
      groups.push([]); pageIdx++; acc = h;
    } else {
      acc += h;
    }
    groups[groups.length - 1].push(child);
  }
  if (groups.length > 1 && groups[groups.length - 1].length === 0) groups.pop();
  return groups;
}

// Build a detached, OFF-SCREEN measuring surface at the TRUE A4 content geometry:
// A4 width (794px), the prescription margins as padding, the report font/line-
// height. The editor is now a SIMPLE, margin-free writing surface whose width
// does NOT match the printed page, so pagination must be measured HERE — not on
// the live editor — or page breaks would land in the wrong place. `visibility:
// hidden` (not display:none) keeps layout so offsetHeight is real. Caller appends,
// measures synchronously, then removes.
function makeA4Measurer(containerEl, innerHTML) {
  const m = document.createElement('div');
  m.className = 'narrative-editor-content'; // inherit the editor's block typography
  m.setAttribute('style', [
    getReportCssVars(containerEl),  // --page-margin-* / --report-font-size / --report-line-height
    'position:absolute', 'left:-99999px', 'top:0', 'visibility:hidden',
    'display:block',                // override the base .narrative-editor-content flex-centering
    'width:794px', 'box-sizing:border-box', 'zoom:1',
    // prescription margins as padding → inner content width == printed A4 width
    'padding:calc(var(--page-margin-top,96px) + var(--patient-banner-height,0px)) var(--page-margin-right,96px) var(--page-margin-bottom,96px) var(--page-margin-left,96px)',
  ].join(';'));
  m.innerHTML = innerHTML || '';
  return m;
}

// Paginate the flat content into .word-page > .word-page-inner DOMs at TRUE A4
// geometry (measured off-screen) so the generated report is exact A4 + the
// prescription margins for EVERY user — independent of the margin-free editing
// surface. The patient banner (if any) is cloned onto page 1.
function buildPagesFromFlat(flatEl, containerEl, { header, footer } = {}) {
  const bannerHeightPx = readBannerHeight(containerEl);
  const measurer = makeA4Measurer(containerEl, flatEl.innerHTML);
  document.body.appendChild(measurer);
  try {
    const groups = computeFlatPageGroups(measurer, { bannerHeightPx });
    if (!groups.length) return [];
    const bannerEl = containerEl?.querySelector('.word-page-patient-banner');
    return groups.map((group, idx) => {
      const page = document.createElement('div');
      page.className = 'word-page';
      const inner = document.createElement('div');
      inner.className = 'word-page-inner';
      if (idx === 0 && bannerEl) {
        const b = bannerEl.cloneNode(true);
        stripTransient(b);
        // Render as a normal block at the top of page 1 — NOT the screen's
        // absolute overlay positioning, which would overlap the printed content.
        // The off-screen measurer already reserved page-1 space for it.
        b.style.position = 'static';
        b.style.top = 'auto'; b.style.left = 'auto'; b.style.right = 'auto';
        b.style.width = '100%';
        b.style.margin = '0 0 8px';
        inner.appendChild(b);
      }
      for (const block of group) {
        const clone = block.cloneNode(true);
        stripTransient(clone);
        inner.appendChild(clone);
      }
      page.appendChild(inner);
      injectHeaderFooter(page, idx, { header, footer });
      return page.outerHTML;
    });
  } finally {
    try { document.body.removeChild(measurer); } catch { /* already gone */ }
  }
}

// ── Clone the live A4 pages (Path A) OR chunk the flat column (continuous /
//    pageview) into A4 pages, (re)injecting the authoritative header/footer.
//    Returns page outerHTML[]. ──
export function buildReportPages(containerEl, { header, footer } = {}) {
  const canvas = containerEl?.querySelector('.word-canvas');
  if (!canvas) return [];

  // Path A — distinct .word-page sheets already exist; clone each.
  const sheets = canvas.querySelectorAll('.word-page');
  if (sheets.length) {
    return Array.from(sheets).map((p, idx) => {
      const clone = p.cloneNode(true);
      stripTransient(clone);
      injectHeaderFooter(clone, idx, { header, footer });
      return clone.outerHTML;
    });
  }

  // Flat schema — one column of blocks; chunk it into A4 pages.
  const flat = canvas.querySelector('.narrative-editor-content');
  return flat ? buildPagesFromFlat(flat, containerEl, { header, footer }) : [];
}

// Count the pages a flat-schema report will print to (drives the status-bar
// page count, which can't use doc.childCount on the flat schema — that's the
// paragraph count). Returns 1 for the Path A sheet model (it counts sheets
// elsewhere). One greedy fit over the live block heights.
export function countFlatPages(containerEl) {
  const canvas = containerEl?.querySelector('.word-canvas');
  if (!canvas) return 1;
  if (canvas.querySelector('.word-page')) return 1; // Path A — sheets counted elsewhere
  const flat = canvas.querySelector('.narrative-editor-content');
  if (!flat) return 1;
  // Measure at TRUE A4 geometry off-screen — the simple editing surface's width
  // no longer matches the printed page, so a live measurement would miscount.
  const measurer = makeA4Measurer(containerEl, flat.innerHTML);
  document.body.appendChild(measurer);
  try {
    return Math.max(1, computeFlatPageGroups(measurer, { bannerHeightPx: readBannerHeight(containerEl) }).length);
  } finally {
    try { document.body.removeChild(measurer); } catch { /* gone */ }
  }
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
  /* The app's global.css sets html,body,#root { height:100%; overflow:hidden }
     for the single-screen SPA shell. Those rules get inlined into this print
     document too, and on paper they clamp the body to ONE viewport and clip
     everything past the first page — so only page 1 printed even though the
     preview (which doesn't inherit them) showed several. Force the print
     document to flow to its full multi-page height. */
  html, body, #root {
    background:#fff !important; margin:0 !important; padding:0 !important;
    height:auto !important; min-height:0 !important; max-height:none !important;
    overflow:visible !important;
  }
  .print-canvas { display:block; background:#fff; margin:0; padding:0; height:auto; overflow:visible; }
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
