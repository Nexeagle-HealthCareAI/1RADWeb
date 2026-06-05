// ════════════════════════════════════════════════════════════════════════════
//  WordDocxPreview.jsx — renders the EXACT .docx that "Launch Word" produces.
//
//  Instead of approximating Word with HTML/CSS, this builds the real report
//  .docx (buildReportDocxBlob — the same bytes Launch-Word opens) and renders
//  it with docx-preview (Apache-2.0). So this preview is a 1:1 view of what
//  Microsoft Word will show — true pagination, headers/footers, margins, tabs.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { buildReportDocxBlob } from '../utils/exportWord';

export default function WordDocxPreview({
  appointment, findingsHtml, impression, advice, protocol, watermark = '', style,
}) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('loading');
      setErr('');
      try {
        const blob = await buildReportDocxBlob({ appointment, findingsHtml, impression, advice, protocol, watermark });
        if (cancelled) return;
        const el = containerRef.current;
        if (!el) return;
        el.innerHTML = '';
        await renderAsync(blob, el, undefined, {
          className: 'docxpv',
          inWrapper: true,        // wrap pages in a .docx-wrapper (A4 sheets)
          breakPages: true,       // real pagination
          ignoreWidth: false,
          ignoreHeight: false,
          renderHeaders: true,    // letterhead / header band
          renderFooters: true,
          renderFootnotes: true,
          experimental: true,     // tab-stop calculation (organ-label columns)
          useBase64URL: true,
        });
        if (!cancelled) setStatus('ready');
      } catch (e) {
        console.error('[WordDocxPreview] render failed', e);
        if (!cancelled) { setErr(e?.message || 'Failed to render'); setStatus('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [appointment, findingsHtml, impression, advice, protocol, watermark]);

  return (
    <div style={{ position: 'relative', background: '#e9edf2', overflow: 'auto', ...style }}>
      {status === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '13px', fontWeight: 700 }}>
          Rendering Word preview…
        </div>
      )}
      {status === 'error' && (
        <div style={{ padding: '24px', textAlign: 'center', color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>
          Could not render the Word preview{err ? `: ${err}` : ''}.
        </div>
      )}
      {/* Print the TRUE Word render (all pages, faithful) — bypasses the legacy
          preview-print that clipped to one page. */}
      {status === 'ready' && (
        <button
          onClick={() => {
            const el = containerRef.current;
            if (!el) return;
            const win = window.open('', '_blank', 'width=900,height=1000');
            if (!win) return;
            win.document.write(
              `<!doctype html><html><head><title>Report</title>` +
              `<style>@page{size:A4;margin:0} html,body{margin:0;padding:0;background:#fff} ` +
              `.docx-wrapper{background:#fff!important;padding:0!important;display:block!important} ` +
              `.docx-wrapper>section.docx{box-shadow:none!important;margin:0 auto!important} ` +
              `@media print{.docx-wrapper>section.docx{break-after:page;page-break-after:always}}</style>` +
              `</head><body>${el.innerHTML}</body></html>`
            );
            win.document.close();
            win.focus();
            setTimeout(() => { try { win.print(); } catch (_) {} }, 600);
          }}
          style={{ position: 'absolute', top: '10px', right: '16px', zIndex: 5, padding: '8px 14px', borderRadius: '10px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '12px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(15,82,186,0.25)' }}
        >🖨️ Print</button>
      )}
      {/* docx-preview renders A4 page sheets here */}
      <div ref={containerRef} className="word-docx-preview" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }} />
    </div>
  );
}
