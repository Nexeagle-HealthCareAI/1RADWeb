import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { buildReportPages, getReportCssVars, printReport } from './utils/printReport';

/**
 * PrintPreviewModal — a full-screen, true-to-print preview of the report's A4
 * pages, with page navigation, zoom, and a one-click Print.
 *
 * The pages are cloned from the live editor (same DOM the export uses), so what
 * you see here is exactly what prints. Print is silent to the default printer
 * on the desktop app (Electron) and falls back to the browser print dialog on
 * the web — see utils/printReport.js.
 */
const PAGE_W = 794;   // A4 @ 96dpi
const PAGE_H = 1123;
const GAP = 28;       // gap between pages, in unscaled px
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.6;
const PRINTER_KEY = 'narrative-editor:report-printer';   // remembered device name

function cssVarsToObject(str) {
  const obj = {};
  (str || '').split(';').forEach((decl) => {
    const i = decl.indexOf(':');
    if (i <= 0) return;
    const k = decl.slice(0, i).trim();
    if (k.startsWith('--')) obj[k] = decl.slice(i + 1).trim();
  });
  return obj;
}

export default function PrintPreviewModal({ open, onClose, containerEl, header, footer, title = 'Radiology Report', showToast }) {
  const scrollRef = useRef(null);
  const [zoom, setZoom] = useState(0.7);
  const [current, setCurrent] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState(() => {
    try { return localStorage.getItem(PRINTER_KEY) || ''; } catch { return ''; }
  });

  // Snapshot the pages + layout vars when the modal opens (content is frozen
  // for the duration of the preview; re-opening re-snapshots).
  const { pages, varStyle } = useMemo(() => {
    if (!open || !containerEl) return { pages: [], varStyle: {} };
    return {
      pages: buildReportPages(containerEl, { header, footer }),
      varStyle: cssVarsToObject(getReportCssVars(containerEl)),
    };
  }, [open, containerEl, header, footer]);

  const pageCount = pages.length;

  // Fit-to-width on open and on resize, until the user zooms manually.
  const fitToWidth = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const avail = el.clientWidth - 48; // breathing room
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, avail / PAGE_W));
    setZoom(Number(z.toFixed(3)));
  }, []);

  useEffect(() => {
    if (!open) return;
    // Defer so the scroll container has its real width; reset to page 1 too.
    const t = setTimeout(() => { fitToWidth(); setCurrent(1); }, 0);
    const onResize = () => fitToWidth();
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize); };
  }, [open, fitToWidth]);

  // Desktop only: enumerate installed printers so the report can target a
  // specific one (e.g. the A4 laser, not the thermal receipt printer). The
  // chosen device is remembered, so it sticks across reports.
  useEffect(() => {
    if (!open || !window.electron?.report?.listPrinters) return;
    let alive = true;
    window.electron.report.listPrinters().then((res) => {
      if (!alive || !res?.ok) return;
      const list = res.printers || [];
      setPrinters(list);
      setSelectedPrinter((prev) => {
        if (prev && list.some((p) => p.name === prev)) return prev;   // saved still valid
        const def = list.find((p) => p.isDefault);
        return def ? def.name : '';                                   // else system default
      });
    }).catch(() => { /* leave on system default */ });
    return () => { alive = false; };
  }, [open]);

  const onPickPrinter = useCallback((name) => {
    setSelectedPrinter(name);
    try { localStorage.setItem(PRINTER_KEY, name); } catch { /* ignore */ }
  }, []);

  // Track which page is in view.
  const slotH = (PAGE_H + GAP) * zoom;
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || pageCount === 0) return;
    const idx = Math.round(el.scrollTop / Math.max(1, slotH));
    setCurrent(Math.min(pageCount, Math.max(1, idx + 1)));
  }, [slotH, pageCount]);

  const goToPage = useCallback((n) => {
    const el = scrollRef.current;
    if (!el) return;
    const clamped = Math.min(pageCount, Math.max(1, n));
    el.scrollTo({ top: (clamped - 1) * slotH, behavior: 'smooth' });
    setCurrent(clamped);
  }, [pageCount, slotH]);

  const doPrint = useCallback(async () => {
    if (printing) return;
    setPrinting(true);
    try {
      const res = await printReport(containerEl, { header, footer, title, deviceName: selectedPrinter });
      if (res?.ok) {
        showToast?.(res.mode === 'desktop-silent' ? 'Sent to printer' : 'Print dialog opened', 'success');
      } else {
        const why = res?.reason === 'PRINT_FAILED' || res?.reason === 'NO_PRINTER'
          ? 'No printer available — check the default printer in Windows settings.'
          : `Print failed${res?.reason ? ` (${res.reason})` : ''}.`;
        showToast?.(why, 'error');
      }
    } catch (e) {
      showToast?.(`Print failed (${e?.message || 'unknown error'}).`, 'error');
    } finally {
      setPrinting(false);
    }
  }, [printing, containerEl, header, footer, title, selectedPrinter, showToast]);

  // Keyboard: Esc closes, arrows / PageUp-Down navigate.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goToPage(current + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goToPage(current - 1); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose, goToPage, current]);

  if (!open) return null;

  const isElectron = typeof window !== 'undefined' && !!window.electron?.report?.printSilent;
  const stepZoom = (d) => setZoom((z) => Number(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + d)).toFixed(3)));

  return createPortal(
    <div className="ppv-overlay" role="dialog" aria-modal="true" aria-label="Print preview">
      {/* ── Toolbar ── */}
      <div className="ppv-toolbar">
        <div className="ppv-toolbar__group ppv-toolbar__title">
          <span className="ppv-dot" /> Print preview
        </div>

        <div className="ppv-toolbar__group">
          <button className="ppv-btn ppv-btn--icon" title="Previous page" disabled={current <= 1} onClick={() => goToPage(current - 1)}>◀</button>
          <span className="ppv-pageind">Page {current} / {pageCount || 1}</span>
          <button className="ppv-btn ppv-btn--icon" title="Next page" disabled={current >= pageCount} onClick={() => goToPage(current + 1)}>▶</button>
        </div>

        <div className="ppv-toolbar__group">
          <button className="ppv-btn ppv-btn--icon" title="Zoom out" onClick={() => stepZoom(-0.1)}>−</button>
          <span className="ppv-zoomind">{Math.round(zoom * 100)}%</span>
          <button className="ppv-btn ppv-btn--icon" title="Zoom in" onClick={() => stepZoom(0.1)}>+</button>
          <button className="ppv-btn" title="Fit to width" onClick={fitToWidth}>Fit</button>
        </div>

        <div className="ppv-toolbar__group ppv-toolbar__right">
          {isElectron && (
            <label className="ppv-printer" title="Choose which printer the report prints to">
              <span aria-hidden="true">🖨</span>
              <select
                className="ppv-printer__select"
                value={selectedPrinter}
                onChange={(e) => onPickPrinter(e.target.value)}
              >
                <option value="">Default printer</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
                ))}
              </select>
            </label>
          )}
          <button className="ppv-btn ppv-btn--primary" onClick={doPrint} disabled={printing || pageCount === 0}>
            {printing ? '⏳ Printing…' : '🖨 Print'}
          </button>
          <button className="ppv-btn ppv-btn--icon" title="Close (Esc)" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* ── Scrollable page stack ── */}
      <div className="ppv-scroll" ref={scrollRef} onScroll={onScroll}>
        {pageCount === 0 ? (
          <div className="ppv-empty">Nothing to preview yet.</div>
        ) : (
          <div className="ppv-pages" style={varStyle}>
            {pages.map((html, i) => (
              <div
                key={i}
                className="ppv-page-slot"
                style={{ width: PAGE_W * zoom, height: PAGE_H * zoom, marginBottom: GAP * zoom }}
              >
                <div
                  className="ppv-page-scale"
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: PAGE_W }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
