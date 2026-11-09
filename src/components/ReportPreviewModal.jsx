import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import apiClient from '../api/apiClient';
import { QRCodeCanvas } from 'qrcode.react';
import QRCode from 'qrcode';
import { downloadReportPdf } from '../utils/downloadPdf';
import { getTrackingUrl } from '../utils/trackingUrl';
import { notifyToast } from '../utils/toast';
import { sanitizeReportHtml, sanitizeMarkup } from '../utils/sanitizeHtml';
import {
  normalizePaper, loadPaperAssets, ensurePaperFonts, reportFacts,
  buildReportSheets, printDocumentHtml, effectiveMode, PAPER_MODES,
} from './reportPaper/reportPaper';
import { renderPdfLetterhead } from './reportPaper/pdfLetterhead';

// Editor HTML → page chunks. The editor already paginates (.word-page-inner
// wrappers, or [data-page-break] markers); those boundaries are kept as forced
// breaks and the paper builder re-splits each chunk to the real page size.
function editorChunks(html) {
  if (!html) return [];
  const tmp = document.createElement('div');
  tmp.innerHTML = sanitizeReportHtml(html);
  // "Space before / after" choices are stored as attributes in the editor.
  tmp.querySelectorAll('[data-spacing-before], [data-spacing-after]').forEach(el => {
    const styles = [];
    const b = el.getAttribute('data-spacing-before');
    const a = el.getAttribute('data-spacing-after');
    if (b) styles.push(`margin-top: ${b}`);
    if (a) styles.push(`margin-bottom: ${a}`);
    const ex = el.getAttribute('style') || '';
    el.setAttribute('style', ex + (ex && !ex.trim().endsWith(';') ? '; ' : '') + styles.join('; '));
  });
  // Blank lines typed with Enter serialise as empty <p></p>; keep their height.
  tmp.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').forEach(el => {
    if (!el.textContent.trim() && el.children.length === 0) el.innerHTML = '<br>';
  });
  const inners = tmp.querySelectorAll('.word-page-inner');
  if (inners.length) return Array.from(inners).map(n => n.innerHTML);
  if (tmp.querySelector('[data-page-break]')) {
    const out = [];
    let cur = document.createElement('div');
    Array.from(tmp.children).forEach(child => {
      if (child.hasAttribute && child.hasAttribute('data-page-break')) { out.push(cur.innerHTML); cur = document.createElement('div'); return; }
      cur.appendChild(child.cloneNode(true));
    });
    out.push(cur.innerHTML);
    return out.filter(p => p && p.trim());
  }
  return [tmp.innerHTML];
}

// Patient info header — renders on page 1 of the preview and inside the
// hidden measurer so pagination can subtract its height from page-1 capacity.
// Premium patient-header card. Mirrored in `generatePageHtml` below so the
// printed report visually matches what the doctor sees on screen.
export const PatientInfoBlock = ({ appointmentId, fullAppointment, savedMetadata, appointmentServiceId = null }) => {
  // Multi-service rollout (batch-4 fix). When the caller supplied an
  // appointmentServiceId, name THIS service line on the header + the
  // "thank you" line so the printed report reflects the report that's
  // actually being printed (e.g. a CT report on a 3-service visit
  // prints "CT Head Plain (CT)" rather than the visit's primary X-ray
  // scalar). Falls back to the parent's scalar Service/Modality when
  // no service id is supplied (single-service / legacy / worklist
  // print-preview callers that don't pick a specific service).
  const _matchedService = appointmentServiceId
    ? (fullAppointment?.services || []).find(s => s.id === appointmentServiceId)
    : null;
  const name      = (fullAppointment?.patientName || '').toUpperCase() || '—';
  const ptid      = fullAppointment?.patientIdentifier || fullAppointment?.ptid || fullAppointment?.id || '—';
  const age       = fullAppointment?.patientAge || fullAppointment?.age || '—';
  const sex       = fullAppointment?.patientGender || fullAppointment?.gender || '—';
  const study     = _matchedService?.serviceName || fullAppointment?.service || fullAppointment?.modality || '—';
  const modality  = _matchedService?.modality    || fullAppointment?.modality || '—'; // used by the thank-you line
  const refByName  = fullAppointment?.referredBy || 'Self';
  const refDegSpec = [fullAppointment?.referrerDegree, fullAppointment?.referrerSpecialty].filter(Boolean).join(', ');
  const repDate   = savedMetadata?.finalizedAt
    ? new Date(savedMetadata.finalizedAt).toLocaleDateString()
    : new Date().toLocaleDateString();

  // QR target — request a signed token from the API so the printed QR works
  // when the patient (anonymous) scans it. We start with the tokenless URL so
  // the QR has something to render immediately, then swap once the token
  // arrives. If the token request fails we keep the bare URL — the public
  // endpoint will reject it and the patient gets a clear "ask for a new QR"
  // message instead of silently bad data.
  const [qrUrl, setQrUrl] = useState(
    appointmentId ? `${window.location.origin}/track/${appointmentId}` : ''
  );
  useEffect(() => {
    let cancelled = false;
    if (!appointmentId) return;
    getTrackingUrl(appointmentId).then(url => {
      if (!cancelled && url) setQrUrl(url);
    });
    return () => { cancelled = true; };
  }, [appointmentId]);

  // Compact patient header + a thank-you note to the prescribing doctor.
  // Two-line header (name + dot-separated meta) keeps page-1 vertical space
  // minimal; the thank-you note sits underneath as a small italic acknowledgement.
  return (
    <>
      <div className="patient-info-block" style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        padding: '10px 14px 10px 12px',
        marginBottom: '10px',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
        overflow: 'hidden',
        // Premium clinical-doc font stack — Inter for clean modern look,
        // falls back through system fonts that all render well in print.
        fontFamily: '"Inter", "Helvetica Neue", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
        fontFeatureSettings: '"tnum" 1, "lnum" 1', // tabular + lining numerals for IDs/dates
      }}>
        {/* Left accent bar */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: '4px',
          background: 'linear-gradient(180deg, #0f52ba 0%, #1e40af 50%, #0f52ba 100%)',
        }} />

        {/* QR code */}
        <div style={{
          marginLeft: '6px',
          padding: '4px',
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          flexShrink: 0,
        }}>
          {/* level=M (15% error correction) lets the QR pack the ~140-char
              tokenized URL into a sparse-enough matrix to scan reliably at
              this size. level=H (30%) was forcing 53+ modules per side and
              sub-pixel module width at 42px, which phones couldn't read. */}
          <QRCodeCanvas value={qrUrl} size={56} level="M" />
        </div>

        {/* Patient identity + metadata stacked */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '17px', fontWeight: 800, color: '#0a1628',
            letterSpacing: '-0.2px', lineHeight: 1.2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{name}</div>
          <div style={{
            fontSize: '10.5px', color: '#475569', marginTop: '3px',
            display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap',
          }}>
            <span>
              <span style={{ color: '#94a3b8', fontWeight: 700 }}>Patient ID:</span> <strong style={{ color: '#0f172a' }}>{ptid}</strong>
            </span>
            <span style={{ color: '#cbd5e1' }}>·</span>
            <span>
              <span style={{ color: '#94a3b8', fontWeight: 700 }}>Age/Sex:</span> <strong style={{ color: '#0f172a' }}>{age} / {sex}</strong>
            </span>
            <span style={{ color: '#cbd5e1' }}>·</span>
            <span>
              <span style={{ color: '#94a3b8', fontWeight: 700 }}>Study:</span> <strong style={{ color: '#0f52ba' }}>{study}</strong>
            </span>
            <span style={{ color: '#cbd5e1' }}>·</span>
            <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '1px' }}>
              <span>
                <span style={{ color: '#94a3b8', fontWeight: 700 }}>Prescribed By:</span>{' '}
                <strong style={{ color: '#0f172a' }}>{refByName}</strong>
              </span>
              {refDegSpec && (
                <span style={{ fontSize: '9.5px', color: '#64748b', fontStyle: 'italic', fontWeight: 500 }}>
                  {refDegSpec}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Right: report date */}
        <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '8px', borderLeft: '1px solid #e2e8f0', minWidth: '70px' }}>
          <div style={{
            fontSize: '8px', fontWeight: 800, color: '#94a3b8',
            letterSpacing: '1.5px', textTransform: 'uppercase',
          }}>Reported</div>
          <div style={{
            fontSize: '12px', fontWeight: 700, color: '#1e293b', marginTop: '2px',
          }}>{repDate}</div>
        </div>
      </div>

      {/* Acknowledgement line — centered, below the header card on page 1 only */}
      <div style={{
        fontFamily: '"Inter", "Helvetica Neue", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: '10.5px',
        fontStyle: 'italic',
        color: '#475569',
        marginBottom: '14px',
        letterSpacing: '0.1px',
        textAlign: 'center',
      }}>
        Thank you for referring the patient for <strong style={{ color: '#0f52ba', fontStyle: 'normal' }}>{modality}</strong>.
      </div>
    </>
  );
};

const ReportPreviewModal = ({
  isOpen,
  onClose,
  doctorId,
  appointmentId, // NEW: For direct report fetching
  // Multi-service rollout (batch-4 fix). When supplied, the preview's
  // header names the chosen service line instead of the parent visit's
  // primary scalar. NULL = legacy / single-service / "print preview from
  // worklist" path where the caller can't yet pick a specific service.
  appointmentServiceId = null,
  patientData,
  reportContent,
  // Optional live signature from the reporting page ({ name, credentials,
  // signedAt, status }) — newer than the fetched report right after signing.
  signature = null,
}) => {
  const [paperBody, setPaperBody] = useState(null);
  const [loadingProtocol, setLoadingProtocol] = useState(false);
  const [savedMetadata, setSavedMetadata] = useState(null);
  const [fullAppointment, setFullAppointment] = useState(patientData); // Start with props, enrich later

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setLoadingProtocol(true);
      try {
        if (appointmentId) {
          try {
            const appRes = await apiClient.get(`/appointments/${appointmentId}`);
            const appData = appRes.data?.data || appRes.data;
            if (!cancelled && appData && typeof appData === 'object') setFullAppointment(appData);
            const reportRes = await apiClient.get(`/Reporting/report/${appointmentId}`, {
              params: appointmentServiceId ? { serviceId: appointmentServiceId } : undefined,
            });
            const reportData = reportRes.data?.data || reportRes.data;
            if (!cancelled && reportData && typeof reportData === 'object') setSavedMetadata(reportData);
          } catch (contextErr) {
            console.warn('[ReportPreview] Could not load the visit, using local data:', contextErr.message);
          }
        }
        // The report paper is ONE setting per centre — the id in the route is
        // ignored by the API; /me works for every role.
        const id = doctorId || patientData?.doctorId || patientData?.doctorUserId;
        const res = await apiClient.get(id ? `/Prescription/${id}` : '/Prescription/me');
        if (!cancelled && res.data?.success) setPaperBody(res.data);
      } catch (err) {
        console.warn('[ReportPreview] Paper settings failed to load:', err.message);
      } finally {
        if (!cancelled) setLoadingProtocol(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, doctorId, appointmentId, appointmentServiceId, patientData]);

  const [sheetScale, setSheetScale] = useState(1);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState(null);

  // QR → the signed tracking link (works when the patient scans it, no login).
  useEffect(() => {
    if (!isOpen || !appointmentId) return;
    let cancelled = false;
    (async () => {
      try {
        const qrUrl = await getTrackingUrl(appointmentId);
        // Level M: the tokenised URL is long; H made modules too small to scan.
        const dataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'M', type: 'image/png', width: 220, margin: 1, color: { dark: '#000000', light: '#ffffff' } });
        if (!cancelled) setQrCodeDataUrl(dataUrl);
      } catch (error) {
        console.error('[ReportPreview] QR Code generation failed:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, appointmentId]);

  useEffect(() => { if (isOpen) setSheetScale(1); }, [isOpen]);

  // Header / footer / logo / letterhead pictures, inlined as data URLs so
  // printing never waits on the network.
  const [assets, setAssets] = useState(null);
  useEffect(() => {
    if (!isOpen || !paperBody) return;
    let cancelled = false;
    (async () => {
      const paper = normalizePaper(paperBody);
      const [a] = await Promise.all([
        loadPaperAssets(paper, { letterheadLoader: renderPdfLetterhead }),
        ensurePaperFonts(),
      ]);
      if (!cancelled) setAssets(a);
    })();
    return () => { cancelled = true; };
  }, [isOpen, paperBody]);

  // ── Build the sheets (screen + print use the SAME html) ───────────────────
  const [docs, setDocs] = useState({ print: null, pdf: null });
  // Callers rebuild reportContent / signature objects on every render (the
  // reporting page polls); key the build on their CONTENT so pagination runs
  // only when something the paper shows has changed.
  const rcKey = reportContent ? JSON.stringify(reportContent) : '';
  const sigKey = signature ? JSON.stringify(signature) : '';
  useEffect(() => {
    if (!isOpen || !rcKey || !assets) return;
    const paper = normalizePaper(paperBody);
    const rc = JSON.parse(rcKey);
    const sig = sigKey ? JSON.parse(sigKey) : null;
    const { mode: rcMode, text: rcText, data: rcData, impression, advice } = rc;
    let chunks;
    if (rcMode === 'Structured' && rcData) {
      const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      chunks = [Object.entries(rcData).map(([k, v]) => `<h3>${esc(k.replace(/_/g, ' '))}</h3><p style="white-space:pre-wrap">${esc(v)}</p>`).join('')];
    } else {
      chunks = editorChunks(rcText);
    }
    const facts = reportFacts({
      appointment: fullAppointment, serviceId: appointmentServiceId,
      report: savedMetadata || {}, signature: sig,
    });
    const common = { paper, assets, facts, chunks, impression, advice, qr: qrCodeDataUrl };
    const print = buildReportSheets({ ...common, target: 'print' });
    // PDF copies differ only when LETTERHEAD mode borrows the standard header.
    const pdf = effectiveMode(paper, 'pdf') === print.mode ? print : buildReportSheets({ ...common, target: 'pdf' });
    setDocs({ print, pdf });
  }, [isOpen, rcKey, sigKey, paperBody, assets, savedMetadata, fullAppointment, appointmentServiceId, qrCodeDataUrl]);

  // Ctrl/Cmd+P while the preview is open → OUR A4 print, not the browser's
  // native print of the app chrome. Reached through a ref set each render.
  const handlePrintRef = useRef(null);
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        try { handlePrintRef.current?.(); } catch { /* print not ready */ }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isOpen]);

  if (!isOpen) return null;

  const { isFinalized } = reportContent || {};
  const paper = normalizePaper(paperBody);
  const shown = docs.print;
  const pageCount = shown?.sheets.length || 0;
  const ready = !!shown;

  // Print: the same sheets in a hidden full-size iframe (all pages come through).
  const handlePrint = () => {
    if (!docs.print) return;
    try {
      const html = printDocumentHtml({ sheets: docs.print.sheets, css: docs.print.css });
      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = `position:fixed;left:-99999px;top:0;width:794px;height:${Math.max(1, docs.print.sheets.length) * 1123 + 200}px;border:0;background:#fff;`;
      document.body.appendChild(iframe);
      setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* gone */ } }, 60000);
      const d = iframe.contentWindow?.document;
      if (!d) return;
      d.open(); d.write(html); d.close();
    } catch (err) {
      console.error('[ReportPreview] Print failed:', err);
      notifyToast('Could not open printing. Please try again.', 'error');
    }
  };
  handlePrintRef.current = handlePrint;

  const handleDownload = async () => {
    const target = docs.pdf || docs.print;
    if (!target) return;
    try {
      const nm = (fullAppointment?.patientName || 'report').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const filename = `${nm || 'report'}-${new Date().toISOString().split('T')[0]}.pdf`;
      // Each sheet carries its own styles so the PDF renderer sees the full look.
      const pages = target.sheets.map(s => `<style>${target.css}</style><div class="rp-doc">${s}</div>`);
      await downloadReportPdf(pages, filename);
    } catch (error) {
      console.error('Download failed:', error);
      notifyToast('Failed to download PDF. Please try again.', 'error');
    }
  };

  const handleWhatsAppShare = async () => {
    const mobile = fullAppointment?.patientMobile || fullAppointment?.mobile;
    if (!mobile) {
      notifyToast('No patient mobile number found for this appointment.', 'warning');
      return;
    }
    // Same signed-token URL the QR uses, so the link works from the patient's phone.
    const reportUrl = await getTrackingUrl(appointmentId);
    const centreName = paper.centre?.name || fullAppointment?.hospitalName || '1Rad Flow Diagnostic Center';
    const message = `Hello ${fullAppointment?.patientName},\n\nYour Diagnostic Report for ${fullAppointment?.service || 'the clinical study'} is now available.\n\n📄 View/Download Report: ${reportUrl}\n\nThank you for choosing ${centreName}.`;
    const cleanedMobile = mobile.replace(/\D/g, '');
    const finalMobile = cleanedMobile.length === 10 ? `91${cleanedMobile}` : cleanedMobile;
    window.open(`https://wa.me/${finalMobile}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const paperLabel = {
    [PAPER_MODES.IMAGES]: 'Your header & footer',
    [PAPER_MODES.STANDARD]: 'Standard design',
    [PAPER_MODES.LETTERHEAD]: paper.letterhead ? 'Your letterhead' : 'Your printed paper',
  }[shown?.mode || paper.mode];
  const pdfNote = docs.pdf && docs.print && docs.pdf !== docs.print
    ? 'PDF copies get the standard header — your paper has it printed already.'
    : '';

  const isNarrowPreview = typeof window !== 'undefined' && window.innerWidth < 900;
  const zoomBtn = { width: '34px', height: '32px', borderRadius: '9px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', fontWeight: 900, cursor: 'pointer', fontSize: '14px' };
  const actionBtn = { flex: 1, padding: '13px 16px', borderRadius: '12px', fontWeight: 800, cursor: ready ? 'pointer' : 'wait', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', whiteSpace: 'nowrap', opacity: ready ? 1 : 0.6 };

  const modalContent = (
    <div className="modal-overlay" style={{ background: 'rgba(10, 22, 40, 0.98)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0, backdropFilter: 'blur(10px)', padding: isNarrowPreview ? 0 : '2vh' }}>
      <div style={{ width: isNarrowPreview ? '100vw' : '96vw', height: isNarrowPreview ? '100vh' : '96vh', maxWidth: '1500px', background: '#0a1628', display: 'flex', flexDirection: isNarrowPreview ? 'column' : 'row', overflow: 'hidden', borderRadius: isNarrowPreview ? 0 : '18px', boxShadow: '0 40px 100px -20px rgba(0,0,0,0.6)' }}>

        <div className="preview-canvas" style={{ flex: 1, background: '#0a1628', backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '30px 30px', overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: isNarrowPreview ? '20px 10px' : '48px 20px' }}>
          {!ready ? (
            <div style={{ color: '#93c5fd', fontWeight: 700, fontSize: '14px', marginTop: '20vh' }}>Preparing the report…</div>
          ) : (
            <div style={{ width: `${210 * sheetScale}mm`, height: `${(297 * pageCount + 10 * (pageCount - 1)) * sheetScale}mm`, position: 'relative', flexShrink: 0 }}>
              <div id="printable-report" className="rp-doc" style={{ width: '210mm', position: 'absolute', top: 0, left: 0, transform: `scale(${sheetScale})`, transformOrigin: 'top left' }}>
                <style>{shown.css}</style>
                {shown.sheets.map((s, i) => (
                  <div key={i} className="a4-page" data-page-index={i} style={{ width: '210mm', height: '297mm', marginBottom: i === pageCount - 1 ? 0 : '10mm', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' }}
                    dangerouslySetInnerHTML={sanitizeMarkup(s)} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: actions sidebar ── */}
        <div style={{ flex: isNarrowPreview ? '0 0 auto' : '0 0 300px', width: isNarrowPreview ? '100%' : undefined, background: 'linear-gradient(160deg, #0f52ba 0%, #0a2a63 55%, #071d45 100%)', borderLeft: isNarrowPreview ? 'none' : '1px solid rgba(255,255,255,0.12)', borderTop: isNarrowPreview ? '1px solid rgba(255,255,255,0.12)' : 'none', display: 'flex', flexDirection: 'column', gap: '18px', padding: isNarrowPreview ? '14px 16px' : '22px 20px', color: 'white', boxSizing: 'border-box', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>NexEagle · 1Rad Flow</div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '5px 0 0' }}>Report Preview</h3>
              <div style={{ marginTop: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 10px', borderRadius: '999px', background: isFinalized ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)', color: isFinalized ? '#4ade80' : '#fbbf24', border: `1px solid ${isFinalized ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}` }}>
                  {loadingProtocol ? 'Loading…' : (isFinalized ? '✓ Final report' : '✎ Draft')}
                </span>
              </div>
            </div>
            <button onClick={onClose} title="Close" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: '#e2e8f0', fontSize: '15px', cursor: 'pointer', width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0 }}>✕</button>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '14px 15px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullAppointment?.patientName || '—'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '11px' }}>
              {[
                ['Study', fullAppointment?.service || fullAppointment?.modality || '—'],
                ['Patient ID', fullAppointment?.patientIdentifier || fullAppointment?.ptid || '—'],
                ['Paper', paperLabel],
                ['Pages', ready ? String(pageCount) : '…'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, whiteSpace: 'nowrap' }}>{k}</span>
                  <span style={{ color: 'white', fontWeight: 700, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                </div>
              ))}
            </div>
            {pdfNote && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '10px', lineHeight: 1.45 }}>{pdfNote}</div>}
          </div>

          <div>
            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1px', color: 'rgba(255,255,255,0.55)', marginBottom: '8px' }}>ZOOM</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => setSheetScale(s => Math.max(0.3, +(s - 0.1).toFixed(2)))} style={zoomBtn}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: '12px', fontWeight: 800, color: '#93c5fd' }}>{Math.round(sheetScale * 100)}%</div>
              <button onClick={() => setSheetScale(s => Math.min(2, +(s + 0.1).toFixed(2)))} style={zoomBtn}>+</button>
              <button onClick={() => setSheetScale(1)} style={{ ...zoomBtn, width: 'auto', padding: '0 12px', fontSize: '11px' }}>100%</button>
            </div>
          </div>

          <div style={{ marginTop: isNarrowPreview ? 0 : 'auto' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1px', color: 'rgba(255,255,255,0.55)', marginBottom: '10px' }}>SHARE &amp; EXPORT</div>
            <div style={{ display: 'flex', flexDirection: isNarrowPreview ? 'row' : 'column', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={handleWhatsAppShare} style={{ ...actionBtn, cursor: 'pointer', opacity: 1, background: 'rgba(37,211,102,0.16)', border: '1px solid rgba(37,211,102,0.35)', color: '#4ade80' }}>💬 Share on WhatsApp</button>
              <button onClick={handleDownload} disabled={!ready} style={{ ...actionBtn, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: 'white' }}>📥 Download PDF</button>
              <button onClick={handlePrint} disabled={!ready} style={{ ...actionBtn, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', border: 'none', color: 'white', boxShadow: '0 6px 18px rgba(37,99,235,0.5)' }}>🖨️ Print</button>
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '10px', lineHeight: 1.45 }}>For a sharp, searchable PDF choose Print → “Save as PDF”.</div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ReportPreviewModal;
