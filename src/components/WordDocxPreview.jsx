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
      {/* docx-preview renders A4 page sheets here */}
      <div ref={containerRef} className="word-docx-preview" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }} />
    </div>
  );
}
