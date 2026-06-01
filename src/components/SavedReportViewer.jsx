import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import apiClient, { BASE_URL } from '../api/apiClient';
import { PatientInfoBlock } from './ReportPreviewModal';
import { getTrackingUrl } from '../utils/trackingUrl';
import { notifyToast } from '../utils/toast';

// Read-only viewer for a SAVED radiology report.
//
// Why a new component instead of reusing ReportPreviewModal directly:
//   The preview modal paginates by extracting the editor's own .word-page
//   chunks. Those chunks reflect the editor's metrics at SAVE time
//   (letterhead height, banner reserve, margin variables). When viewed
//   from outside the reporting workspace — or after any of those metrics
//   change — the saved chunks overflow the modal's fixed-height A4 cards,
//   so paragraphs visually overlap the impression block below.
//
//   For read-only viewing (timeline / history / patient portal) we don't
//   need page-by-page WYSIWYG. We need a clean, printable document. So
//   this component renders the saved findings as ONE continuously flowing
//   A4-styled sheet: letterhead → patient banner → body → impression →
//   advice. Scrolls vertically if the content is longer than a page.
//   Print honours real page breaks via the print stylesheet.

export default function SavedReportViewer({
  isOpen,
  onClose,
  appointmentId,
  patientData, // for the banner fallback while we hydrate
}) {
  const [appointment, setAppointment] = useState(patientData || null);
  const [report, setReport] = useState(null);
  const [protocol, setProtocol] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !appointmentId) {
      setReport(null);
      setProtocol(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [apptRes, reportRes] = await Promise.all([
          apiClient.get(`/appointments/${appointmentId}`).catch(() => null),
          apiClient.get(`/Reporting/report/${appointmentId}`).catch(() => null),
        ]);
        if (cancelled) return;

        const apptData = apptRes?.data?.data || apptRes?.data;
        if (apptData && typeof apptData === 'object') setAppointment(apptData);

        const body = reportRes?.data;
        const r = (body?.success && body?.data) ? body.data : body;
        if (!r) {
          setError('No saved report found.');
          setReport(null);
        } else {
          setReport(r);
        }

        // Doctor-ID resolution mirrors ReportPreviewModal exactly so the SAME
        // letterhead/branding the reporting workspace shows also appears
        // here. Sources, in priority order:
        //   1. appointment.doctorUserId / .doctorId
        //   2. saved-report.doctorId / .doctorUserId
        //   3. personnel-directory lookup by the appointment's doctor name
        //   4. sessionStorage("1rad_doctor_id") — the current logged-in
        //      doctor's branding as the last-resort fallback
        // Endpoint is /Prescription/{id}, NOT /PrescriptionProtocols — the
        // earlier wrong path was returning 404 and silently leaving the
        // sheet without a letterhead.
        let resolvedDoctorId =
          apptData?.doctorUserId || apptData?.doctorId ||
          patientData?.doctorUserId || patientData?.doctorId ||
          r?.doctorId || r?.doctorUserId;

        const doctorName = apptData?.doctor || patientData?.doctor;
        if (!resolvedDoctorId && doctorName && doctorName !== 'Unassigned' && doctorName !== 'Unknown') {
          try {
            const personnelRes = await apiClient.get('/personnel');
            const list = personnelRes?.data?.data || personnelRes?.data;
            if (Array.isArray(list)) {
              const matched = list.find(d =>
                d.fullName === doctorName ||
                d.name === doctorName ||
                (d.fullName && d.fullName.includes(doctorName))
              );
              if (matched) resolvedDoctorId = matched.userId || matched.id;
            }
          } catch {
            // Non-fatal — drop to sessionStorage fallback.
          }
        }
        if (!resolvedDoctorId) resolvedDoctorId = sessionStorage.getItem('1rad_doctor_id');

        if (resolvedDoctorId) {
          try {
            const protoRes = await apiClient.get(`/Prescription/${resolvedDoctorId}`);
            if (protoRes?.data?.success && protoRes.data.data) {
              setProtocol(protoRes.data.data);
            }
          } catch {
            // No protocol = plain letterhead-less render. Acceptable.
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[SavedReportViewer] load failed', err);
        setError('Could not load the saved report.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, appointmentId, patientData]);

  // Lock background scroll while open + Esc to close.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  // Letterhead URL resolution mirrors the preview modal's logic so a tenant
  // configured against Azure Blob storage still loads through the API proxy.
  const letterheadUrl = useMemo(() => {
    if (!protocol?.letterheadBlobUrl) return null;
    let url = protocol.letterheadBlobUrl.startsWith('http')
      ? protocol.letterheadBlobUrl
      : `${BASE_URL}${protocol.letterheadBlobUrl}`;
    if (url.includes('blob.core.windows.net')) {
      return `${BASE_URL}/Study/proxy-asset?url=${encodeURIComponent(url)}`;
    }
    return url;
  }, [protocol?.letterheadBlobUrl]);

  // Strip the editor's pagination wrappers so the content flows continuously
  // instead of artificially splitting at the saved boundaries (which is what
  // causes the overlap when those boundaries don't match the current layout).
  // Also preserve blank lines the same way the preview modal does — empty
  // <p> tags collapse to zero height without a <br> inside.
  const findingsHtml = useMemo(() => {
    if (!report?.findings) return '';
    const raw = report.findings;
    const looksJson = typeof raw === 'string' && raw.trim().startsWith('{');
    if (looksJson) {
      try {
        const data = JSON.parse(raw);
        // Render structured report sections as titled blocks.
        return Object.entries(data).map(([k, v]) => (
          `<div style="margin-bottom: 18px;">
             <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px;">${k.replace(/_/g, ' ')}</div>
             <div style="white-space: pre-wrap;">${v || ''}</div>
           </div>`
        )).join('');
      } catch {
        return raw;
      }
    }
    const tmp = document.createElement('div');
    tmp.innerHTML = raw;
    // Unwrap .word-page-inner / .word-page so content becomes one continuous
    // flow. We keep all the actual content nodes intact, only dropping the
    // outer pagination scaffolding the editor injected.
    tmp.querySelectorAll('.word-page-inner').forEach(el => {
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });
    tmp.querySelectorAll('.word-page').forEach(el => {
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });
    // The editor stores "Space Before / After Paragraph" as data attributes,
    // NOT as CSS margins (so live pagination metrics stay stable). The print
    // path hydrates them into inline margin-top / margin-bottom at render
    // time. We do the same here so user-authored spacing reaches the viewer
    // exactly as it would the printed page.
    tmp.querySelectorAll('[data-spacing-before], [data-spacing-after]').forEach(el => {
      const before = el.getAttribute('data-spacing-before');
      const after  = el.getAttribute('data-spacing-after');
      const styles = [];
      if (before) styles.push(`margin-top: ${before}`);
      if (after)  styles.push(`margin-bottom: ${after}`);
      const existing = el.getAttribute('style') || '';
      const sep = existing && !existing.trim().endsWith(';') ? '; ' : '';
      el.setAttribute('style', existing + sep + styles.join('; '));
    });
    // Blank-line preservation: a typist creates a vertical gap by pressing
    // Enter twice (empty <p></p>). getHTML serialises those as truly empty
    // <p></p>, which collapse to ~0 height in plain HTML so the gap
    // disappears. Inject a <br> so each empty block keeps one line of height.
    tmp.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').forEach(el => {
      if (!el.textContent.trim() && el.children.length === 0) {
        el.innerHTML = '<br>';
      }
    });
    return tmp.innerHTML;
  }, [report?.findings]);

  if (!isOpen) return null;

  const baseFontSize = protocol?.fontSize || 12;
  const fontFamily = protocol?.fontFamily || '"Calibri", "Segoe UI", -apple-system, sans-serif';
  const fontColor  = protocol?.fontColor || '#1e293b';

  const handlePrint = () => {
    // Use the browser's print-to-PDF via a media query targeting the sheet.
    // The "Save as PDF" destination is the browser dialog's default for this
    // surface, so a single window.print() covers both "Print on paper" and
    // "Save as PDF" without us shipping a PDF library.
    window.print();
  };

  // Share via WhatsApp — opens wa.me with the patient's number and a message
  // pre-filled with the tokenized tracking URL. The patient taps the link in
  // their chat, the report opens in their browser (already public at
  // /track/{id} via the QR code surface). No backend changes, no template
  // approval, works on web + mobile WhatsApp identically.
  const handleShareWhatsApp = async () => {
    if (!appointmentId) return;

    // Normalise mobile to digits-only. Indian numbers are stored 10-digit
    // without country code in this codebase; prepend 91 so wa.me opens
    // correctly. Numbers that already include a country code (12+ digits)
    // are left alone.
    const rawMobile = appointment?.mobile || patientData?.mobile || '';
    const digits = String(rawMobile).replace(/\D/g, '');
    if (!digits) {
      notifyToast('No mobile number on file for this patient — cannot share via WhatsApp.', 'warning');
      return;
    }
    const e164 = digits.length === 10 ? `91${digits}` : digits;

    const patientFirstName = (appointment?.patientName || patientData?.patientName || 'Patient')
      .split(' ')[0];
    const modalityLabel = appointment?.modality || patientData?.modality || 'radiology';
    // Signed-token URL so the patient's tap from WhatsApp lands on a valid
    // public endpoint rather than getting a 401.
    const trackUrl = await getTrackingUrl(appointmentId);
    const message =
      `Hi ${patientFirstName}, your ${modalityLabel} report is ready.\n\n` +
      `View it here: ${trackUrl}`;

    // wa.me handles both whatsapp:// (mobile) and web.whatsapp.com (desktop)
    // automatically — picking the right surface based on the browser.
    const url = `https://wa.me/${e164}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const modalContent = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.62)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: window.innerWidth < 768 ? '12px' : '32px',
        zIndex: 9999,
        overflow: 'auto',
      }}
      className="saved-report-viewer-backdrop"
    >
      <style>{`
        /* Baseline typography for the rendered report — mirrors the print
           stylesheet inside ReportPreviewModal so paragraph/heading spacing
           looks identical to the reporting workspace's Preview output.
           Scoped to .saved-report-viewer-sheet so it doesn't leak elsewhere. */
        .saved-report-viewer-sheet .report-content p          { margin: 0 0 8px 0; }
        .saved-report-viewer-sheet .report-content h1         { font-size: 26pt; font-weight: 700; line-height: 1.2; margin: 0 0 12px 0; color: #1f3864; border-bottom: 1px solid #4472c4; padding-bottom: 4px; }
        .saved-report-viewer-sheet .report-content h2         { font-size: 20pt; font-weight: 700; line-height: 1.3; margin: 18px 0 8px 0; color: #2e4d7b; }
        .saved-report-viewer-sheet .report-content h3         { font-size: 16pt; font-weight: 600; line-height: 1.4; margin: 14px 0 6px 0; color: #2e4d7b; }
        .saved-report-viewer-sheet .report-content h4         { font-size: 14pt; font-weight: 600; line-height: 1.4; margin: 12px 0 4px 0; color: #374151; }
        .saved-report-viewer-sheet .report-content ul,
        .saved-report-viewer-sheet .report-content ol         { padding-left: 28px; margin: 6px 0 10px; }
        .saved-report-viewer-sheet .report-content li         { margin: 3px 0; line-height: 1.6; }
        .saved-report-viewer-sheet .report-content li p       { margin: 0; }
        .saved-report-viewer-sheet .report-content table      { border-collapse: collapse; width: 100%; margin: 14px 0; border: 1px solid #c8c8c8; }
        .saved-report-viewer-sheet .report-content th         { background: #d6e4f7; font-weight: 700; text-align: left; padding: 8px 12px; border: 1px solid #c8c8c8; font-size: 11pt; color: #1f3864; }
        .saved-report-viewer-sheet .report-content td         { padding: 7px 12px; border: 1px solid #c8c8c8; vertical-align: top; font-size: 11pt; }
        .saved-report-viewer-sheet .report-content img        { max-width: 100%; height: auto; display: block; margin: 14px 0; }
        .saved-report-viewer-sheet .report-content hr         { border: none; border-top: 1px solid #c8c8c8; margin: 20px 0; }
        .saved-report-viewer-sheet .report-content blockquote { border-left: 3px solid #4472c4; padding-left: 16px; margin: 12px 0; color: #555; font-style: italic; }
        .saved-report-viewer-sheet .report-content a          { color: #0078d4; text-decoration: underline; }
        /* Honor inline text-align declarations from the editor — these win
           over the body's default flow when the user explicitly set them. */
        .saved-report-viewer-sheet .report-content [style*="text-align: right"]   { text-align: right   !important; }
        .saved-report-viewer-sheet .report-content [style*="text-align: center"]  { text-align: center  !important; }
        .saved-report-viewer-sheet .report-content [style*="text-align: justify"] { text-align: justify !important; text-align-last: justify; }
        .saved-report-viewer-sheet .report-content [style*="text-align: left"]    { text-align: left    !important; }
        /* Defensive: clamp inline line-height < 1.0 (would overlap text) — same
           guard the reporting preview applies for legacy data. */
        .saved-report-viewer-sheet .report-content *[style*="line-height: 0."] { line-height: 1 !important; }

        @media print {
          /* Hide everything outside the modal portal. The portal mounts the
             backdrop as a direct child of <body>, so we hide all siblings of
             the backdrop — not the backdrop itself (the earlier rule hid the
             whole modal including the content, which is why print came out
             blank). */
          body > *:not(.saved-report-viewer-backdrop) { display: none !important; }

          /* Unwrap the modal chrome so the sheet flows like a normal
             document page instead of being constrained to the fixed-position
             viewport overlay. */
          .saved-report-viewer-backdrop {
            position: static !important;
            inset: auto !important;
            background: white !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            padding: 0 !important;
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            display: block !important;
          }
          .saved-report-viewer-print-host {
            width: 100% !important;
            max-width: none !important;
            min-height: 0 !important;
            background: white !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            display: block !important;
            overflow: visible !important;
          }
          /* The grey scrollable body wrapper inside the print-host — remove
             its scroll container and grey padding so the sheet sits flush. */
          .saved-report-viewer-print-host > div { overflow: visible !important; }
          .saved-report-viewer-print-host > div[style*="background: rgb(226, 232, 240)"],
          .saved-report-viewer-print-host > div[style*="background:#e2e8f0"] {
            background: white !important;
            padding: 0 !important;
          }

          /* Hide the toolbar (header bar with buttons). */
          .saved-report-viewer-toolbar { display: none !important; }

          /* The sheet itself: drop the shadow + border so it doesn't print a
             second outline alongside the page edge. Width auto so it fills
             the printable area; min-height auto so a short report doesn't
             force an extra blank page. */
          .saved-report-viewer-sheet {
            box-shadow: none !important;
            margin: 0 !important;
            border: none !important;
            width: 100% !important;
            max-width: none !important;
            min-height: 0 !important;
            padding: 18mm 16mm 22mm 16mm !important;
          }

          /* Avoid orphaned headings / split paragraphs across page breaks. */
          .saved-report-viewer-sheet h1,
          .saved-report-viewer-sheet h2,
          .saved-report-viewer-sheet h3,
          .saved-report-viewer-sheet h4 { break-after: avoid; page-break-after: avoid; }
          .saved-report-viewer-sheet p,
          .saved-report-viewer-sheet li { break-inside: avoid; page-break-inside: avoid; }

          /* Margin policy for the printed pages themselves. */
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        className="saved-report-viewer-print-host"
        style={{
          width: 'min(794px, calc(100vw - 32px))',
          minHeight: '60vh',
          background: '#f1f5f9',
          borderRadius: '14px',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 30px 80px rgba(0,0,0,0.3)',
        }}
      >
        {/* Toolbar */}
        <div className="saved-report-viewer-toolbar" style={{
          background: 'linear-gradient(135deg, #0f52ba 0%, #0a3d91 100%)',
          color: 'white',
          padding: '12px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '2px', opacity: 0.85 }}>SAVED REPORT</div>
            <div style={{ fontSize: '13px', fontWeight: 800, marginTop: '2px' }}>
              {appointment?.patientName?.toUpperCase() || 'Patient Report'}
              {/* Multi-service rollout (batch-4 fix). When the report
                  carries an AppointmentServiceId, look up THAT service
                  line on the appointment so the header shows the
                  modality the report is actually about — not the
                  visit's primary scalar. Falls back to the scalar for
                  single-service / v1 reports. */}
              {(() => {
                const serviceId = report?.appointmentServiceId || report?.AppointmentServiceId;
                const matched = serviceId
                  ? (appointment?.services || []).find(s => s.id === serviceId)
                  : null;
                const label = matched?.modality || appointment?.modality;
                return label ? ` · ${label}` : '';
              })()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Save as PDF — same window.print() flow; the browser's dialog
                has a "Save as PDF" destination so we cover both print + save
                with one button. */}
            <button
              onClick={handlePrint}
              disabled={loading || !report}
              title="Open the print dialog — choose 'Save as PDF' to download a copy"
              style={{
                fontSize: '11px', fontWeight: 900, letterSpacing: '0.5px',
                background: 'white', color: '#0f52ba',
                border: 'none', borderRadius: '8px',
                padding: '8px 14px', cursor: 'pointer',
                opacity: loading || !report ? 0.6 : 1,
                display: 'inline-flex', alignItems: 'center', gap: '6px',
              }}
            >💾 SAVE / PRINT</button>

            {/* Share via WhatsApp — opens wa.me with the patient's number
                and a clickable link to the existing /track/{id} page. */}
            <button
              onClick={handleShareWhatsApp}
              disabled={loading || !report || !(appointment?.mobile || patientData?.mobile)}
              title={
                (appointment?.mobile || patientData?.mobile)
                  ? 'Send the patient a WhatsApp message with a link to view this report'
                  : 'No mobile number on file for this patient'
              }
              style={{
                fontSize: '11px', fontWeight: 900, letterSpacing: '0.5px',
                background: '#25D366', color: 'white',
                border: 'none', borderRadius: '8px',
                padding: '8px 14px', cursor: 'pointer',
                opacity: (loading || !report || !(appointment?.mobile || patientData?.mobile)) ? 0.5 : 1,
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                boxShadow: '0 2px 8px rgba(37, 211, 102, 0.35)',
              }}
            >📲 SHARE ON WHATSAPP</button>

            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'rgba(255,255,255,0.18)',
                border: '1px solid rgba(255,255,255,0.28)',
                color: 'white', cursor: 'pointer',
                fontSize: '16px', fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflow: 'auto',
          background: '#e2e8f0',
          padding: window.innerWidth < 768 ? '12px' : '24px',
        }}>
          {loading ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 700 }}>
              Loading saved report…
            </div>
          ) : error ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#dc2626', fontSize: '13px', fontWeight: 700 }}>
              ⚠️ {error}
            </div>
          ) : !report ? null : (
            // The A4-styled sheet. min-height matches a page so short reports
            // still look like a document; grows naturally for longer content.
            <div className="saved-report-viewer-sheet" style={{
              width: '210mm',
              maxWidth: '100%',
              minHeight: '297mm',
              margin: '0 auto',
              background: 'white',
              position: 'relative',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              border: '1px solid #cbd5e1',
              padding: '24mm 22mm 28mm 22mm',
              boxSizing: 'border-box',
              fontFamily,
              fontSize: `${baseFontSize}pt`,
              color: fontColor,
              lineHeight: 1.6,
            }}>
              {letterheadUrl && (
                <img
                  src={letterheadUrl}
                  alt=""
                  style={{
                    position: 'absolute', inset: 0,
                    width: '100%', height: '100%',
                    objectFit: 'fill',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}

              <div style={{ position: 'relative', zIndex: 1 }}>
                <PatientInfoBlock
                  appointmentId={appointmentId}
                  fullAppointment={appointment}
                  savedMetadata={{ finalizedAt: report.finalizedAt }}
                />

                <div
                  className="report-content"
                  style={{ fontFamily, fontSize: `${baseFontSize}pt`, color: fontColor, lineHeight: 1.6 }}
                  dangerouslySetInnerHTML={{ __html: findingsHtml }}
                />

                {report.impression && (
                  <div style={{
                    marginTop: '28px',
                    background: 'rgba(15, 82, 186, 0.03)',
                    padding: '14px 18px',
                    borderRadius: '6px',
                    borderLeft: `4px solid ${fontColor || '#0f52ba'}`,
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: 900, color: '#0f52ba', marginBottom: '6px', letterSpacing: '1px' }}>IMPRESSION:</div>
                    <div style={{ fontSize: `${baseFontSize}pt`, fontWeight: 700, color: fontColor, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {report.impression}
                    </div>
                  </div>
                )}

                {report.advice && (
                  <div style={{ marginTop: '18px', paddingLeft: '20px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 900, color: '#64748b', marginBottom: '4px', letterSpacing: '1px' }}>ADVICE:</div>
                    <div style={{ fontSize: '11pt', color: '#475569', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                      {report.advice}
                    </div>
                  </div>
                )}

                {report.isFinalized && (
                  <div style={{ marginTop: '28px', display: 'flex' }}>
                    <span style={{
                      background: '#ecfdf5', color: '#10b981',
                      border: '1px solid #a7f3d0', borderRadius: '999px',
                      padding: '5px 14px', fontSize: '9px',
                      fontWeight: 900, letterSpacing: '1px',
                    }}>
                      ✓ FINALIZED &amp; SIGNED
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
