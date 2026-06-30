import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import apiClient, { BASE_URL } from '../api/apiClient';
import { Document, Page, pdfjs } from 'react-pdf';
import { QRCodeCanvas } from 'qrcode.react';
import QRCode from 'qrcode';
import { downloadReportPdf } from '../utils/downloadPdf';
import { getTrackingUrl } from '../utils/trackingUrl';
import { notifyToast } from '../utils/toast';
import { sanitizeReportHtml, sanitizeMarkup } from '../utils/sanitizeHtml';

// Configure PDF.js worker — load the LOCALLY-bundled worker, never a public CDN
// (a CDN compromise/MITM of executable worker JS = arbitrary code execution).
pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

// Re-paginate ONE editor page-chunk by MEASURING each top-level block against
// the real A4 writable area, then splitting at block boundaries so a page never
// overflows its fixed-height (overflow:hidden) box — which is what truncated the
// print. We split only (never merge across chunks), so the editor's page
// boundaries — including manual page breaks — are preserved.
//
// Block heights use offsetTop deltas so collapsed margins between blocks are
// counted (a block's footprint = where the next block starts − where it starts).
// The measurer carries class `report-content` so it inherits the exact
// print/preview typography (fonts, heading sizes, list/table spacing).
function _paginateChunkByMeasurement(chunkHtml, { widthMm, capacityPx, firstCapacityPx }) {
  if (!chunkHtml || !chunkHtml.trim()) return [''];
  const m = document.createElement('div');
  m.className = 'report-content';
  m.style.cssText = `position:fixed; left:-99999px; top:0; visibility:hidden; pointer-events:none; width:${widthMm}mm; box-sizing:border-box;`;
  m.innerHTML = chunkHtml;
  document.body.appendChild(m);

  const els = Array.from(m.children);
  if (els.length <= 1) { document.body.removeChild(m); return [chunkHtml]; } // single block — can't split

  const heights = els.map((el, i) => {
    const top = el.offsetTop;
    const next = (i + 1 < els.length) ? els[i + 1].offsetTop : m.scrollHeight;
    return Math.max(0, next - top);
  });
  const htmls = els.map(el => el.outerHTML);
  document.body.removeChild(m);

  const pages = [];
  let cur = [], curH = 0, cap = firstCapacityPx;
  for (let i = 0; i < htmls.length; i++) {
    const h = heights[i];
    if (cur.length && curH + h > cap) {      // adding this block would overflow → new page
      pages.push(cur.join(''));
      cur = []; curH = 0; cap = capacityPx;   // pages after the first get the full height
    }
    cur.push(htmls[i]);
    curH += h;
  }
  if (cur.length) pages.push(cur.join(''));
  return pages.length ? pages : [chunkHtml];
}

// ── SINGLE SOURCE OF TRUTH for `.report-content` typography ──────────────────
// Preview, the hidden pagination measurer, Download-PDF (it inherits the modal's
// stylesheet) and Print MUST render with identical fonts/sizes/line-height, or
// the printed sheets won't match the preview (and the measurer would break pages
// in the wrong place). This used to be two hand-maintained CSS blocks that
// drifted apart — the preview was stuck at a hardcoded 12pt / line-height 1.6
// while print used the configured font size / line-height 1.5, so print never
// matched preview and a non-default font size could clip text off the page.
// Both the modal <style> and buildPrintContent() now interpolate THIS, so they
// can never diverge again. Canonical = font size in POINTS, line-height 1.5
// (unified with the NarrativeEditor + Word export).
const reportContentCss = (baseFontSize = 12) => `
  .report-content {
    font-family: "Calibri", "Segoe UI", -apple-system, sans-serif;
    font-size: ${baseFontSize}pt;
    line-height: 1.5;
    color: #000000;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .report-content h1 { font-size: 26pt; font-weight: 700; line-height: 1.2; margin: 0 0 12px 0; color: #1f3864; border-bottom: 1px solid #4472c4; padding-bottom: 4px; }
  .report-content h2 { font-size: 20pt; font-weight: 700; line-height: 1.3; margin: 18px 0 8px 0; color: #2e4d7b; }
  .report-content h3 { font-size: 16pt; font-weight: 600; line-height: 1.4; margin: 14px 0 6px 0; color: #2e4d7b; }
  .report-content h4 { font-size: 14pt; font-weight: 600; line-height: 1.4; margin: 12px 0 4px 0; color: #374151; }
  .report-content p { margin: 0 0 8px 0; }
  .report-content ul, .report-content ol { padding-left: 28px; margin: 6px 0 10px; }
  .report-content li { margin: 3px 0; line-height: 1.5; }
  .report-content li p { margin: 0; }
  .report-content table { border-collapse: collapse; width: 100%; margin: 14px 0; border: 1px solid #c8c8c8; }
  .report-content th { background: #d6e4f7; font-weight: 700; text-align: left; padding: 8px 12px; border: 1px solid #c8c8c8; font-size: 11pt; color: #1f3864; }
  .report-content td { padding: 7px 12px; border: 1px solid #c8c8c8; vertical-align: top; font-size: 11pt; }
  .report-content img { max-width: 100%; height: auto; display: block; margin: 14px 0; }
  .report-content hr { border: none; border-top: 1px solid #c8c8c8; margin: 20px 0; }
  .report-content code { background: #f3f2f1; padding: 1px 5px; border-radius: 3px; font-family: "Cascadia Code", "Consolas", "Courier New", monospace; font-size: 10.5pt; color: #c7254e; }
  .report-content pre { background: #1e1e1e; color: #d4d4d4; padding: 16px 20px; border-radius: 4px; overflow-x: auto; margin: 14px 0; font-size: 10pt; }
  .report-content pre code { background: transparent; padding: 0; color: inherit; font-size: inherit; }
  .report-content blockquote { border-left: 3px solid #4472c4; padding-left: 16px; margin: 12px 0; color: #555; font-style: italic; }
  .report-content a { color: #0078d4; text-decoration: underline; }
  .report-content [style*="text-align: right"]   { text-align: right !important; }
  .report-content [style*="text-align: center"]  { text-align: center !important; }
  .report-content [style*="text-align: justify"] { text-align: justify !important; text-align-last: justify; }
  .report-content [style*="text-align: left"]    { text-align: left !important; }
  .report-content ul[data-list-style="checkmark"] > li::marker  { content: "✓  "; color: #16a34a; font-weight: 700; }
  .report-content ul[data-list-style="arrow"]     > li::marker  { content: "▸  "; color: #0f52ba; }
  .report-content ul[data-list-style="diamond"]   > li::marker  { content: "◆  "; color: #475569; }
  .report-content ul[data-list-style="star"]      > li::marker  { content: "★  "; color: #f59e0b; }
  .report-content ul[data-list-style="dash"]      > li::marker  { content: "—  "; color: #475569; }
  .report-content ul[data-list-style="hand"]      > li::marker  { content: "☞  "; color: #0f52ba; }
  .report-content ul[data-list-style="triangle"]  > li::marker  { content: "‣  "; color: #475569; }
  .report-content ul[data-list-style="circ-fill"] > li::marker  { content: "●  "; color: #1f2937; font-size: 0.8em; }
  .report-content ul[data-list-style="arrowhead"] { list-style: none; }
  .report-content ul[data-list-style="arrowhead"] > li { position: relative; }
  .report-content ul[data-list-style="arrowhead"] > li::before { content: "➤"; position: absolute; left: -1.15em; top: 0; font-size: 0.95em; background: linear-gradient(135deg, #000000 0%, #000000 50%, #9ca3af 50%, #e5e7eb 100%); -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent; }
  .report-content ol[data-list-style="decimal-paren"], .report-content ol[data-list-style="alpha-paren"], .report-content ol[data-list-style="upper-paren"] { counter-reset: li-paren; }
  .report-content ol[data-list-style="decimal-paren"] > li, .report-content ol[data-list-style="alpha-paren"] > li, .report-content ol[data-list-style="upper-paren"] > li { counter-increment: li-paren; }
  .report-content ol[data-list-style="decimal-paren"] > li::marker { content: counter(li-paren, decimal) ")  "; }
  .report-content ol[data-list-style="alpha-paren"]   > li::marker { content: counter(li-paren, lower-alpha) ")  "; }
  .report-content ol[data-list-style="upper-paren"]   > li::marker { content: counter(li-paren, upper-alpha) ")  "; }
`;

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
  const refDegSpec = [fullAppointment?.referrerDegree, fullAppointment?.referrerSpecialty].filter(Boolean).join(', ');
  const refBy     = (fullAppointment?.referredBy || 'Self') + (refDegSpec && fullAppointment?.referredBy ? ` (${refDegSpec})` : '');
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
            <span>
              <span style={{ color: '#94a3b8', fontWeight: 700 }}>Prescribed By:</span> <strong style={{ color: '#0f172a' }}>{refBy}</strong>
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
  // header + thank-you line name the chosen service line instead of
  // the parent visit's primary scalar. NULL = legacy / single-service
  // / "print preview from worklist" path where the caller can't yet
  // pick a specific service.
  appointmentServiceId = null,
  patientData,
  reportContent
}) => {
  const [protocol, setProtocol] = useState(null);
  const [loadingProtocol, setLoadingProtocol] = useState(false);
  const [savedMetadata, setSavedMetadata] = useState(null);
  const [fullAppointment, setFullAppointment] = useState(patientData); // Start with props, enrich later
  const [numPdfPages, setNumPdfPages] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        setLoadingProtocol(true);
        try {
          let resolvedDoctorId = doctorId || patientData?.doctorId || patientData?.doctorUserId;

          // 1. Fetch Full Appointment Context First
          if (appointmentId) {
            let doctorName = null;
            try {
              console.info(`[ReportPreview] Synchronizing Context for Appointment: ${appointmentId}`);
              const appRes = await apiClient.get(`/appointments/${appointmentId}`); 
              const appData = appRes.data?.data || appRes.data;
              if (appData && typeof appData === 'object') {
                setFullAppointment(appData);
                doctorName = appData.doctor;
                if (!resolvedDoctorId) {
                  resolvedDoctorId = appData.doctorUserId || appData.doctorId;
                }
              }

              // Fetch Saved Report Metadata
              const reportRes = await apiClient.get(`/Reporting/report/${appointmentId}`);
              const reportData = reportRes.data?.data || reportRes.data;
              if (reportData) {
                setSavedMetadata(reportData);
                if (!resolvedDoctorId) resolvedDoctorId = reportData.doctorId || reportData.doctorUserId;
              }
            } catch (contextErr) {
              console.warn("[ReportPreview] Failed to fetch appointment context, falling back to local data:", contextErr.message);
            }

            // Fallback: If we have the doctor's name but no ID (e.g. report not created yet), look it up in the personnel directory
            if (!resolvedDoctorId && doctorName && doctorName !== 'Unassigned' && doctorName !== 'Unknown') {
              try {
                const personnelRes = await apiClient.get('/personnel');
                const personnelList = personnelRes.data?.data || personnelRes.data;
                if (Array.isArray(personnelList)) {
                  const matchedDoc = personnelList.find(d => 
                    d.fullName === doctorName || 
                    d.name === doctorName || 
                    (d.fullName && d.fullName.includes(doctorName))
                  );
                  if (matchedDoc) {
                    resolvedDoctorId = matchedDoc.userId || matchedDoc.id;
                    console.info(`[ReportPreview] Resolved Doctor ID from Personnel directory: ${resolvedDoctorId}`);
                  }
                }
              } catch (pErr) {
                console.warn("[ReportPreview] Failed to resolve doctor ID from personnel:", pErr.message);
              }
            }
          }

          // Fallback to session if still not found
          if (!resolvedDoctorId) resolvedDoctorId = sessionStorage.getItem('1rad_doctor_id');

          console.log(`[ReportPreview] Syncing branding. Target Doctor: ${resolvedDoctorId || 'NONE'}`);

          // 2. Fetch Branding & Signatory Profile. When we couldn't resolve the
          // report's doctor (e.g. a non-doctor user with no session doctor id),
          // ask for "me" — the backend falls back to the centre's default
          // protocol either way, so the letterhead margins always load.
          const brandingEndpoint = resolvedDoctorId ? `/Prescription/${resolvedDoctorId}` : '/Prescription/me';
          const res = await apiClient.get(brandingEndpoint);
          if (res.data?.success) {
            console.info("[ReportPreview] Branding Data Received:", res.data.data);
            setProtocol(res.data.data);
          }

        } catch (err) {
          console.warn("[ReportPreview] Prescription sync partially failed:", err.message);
        } finally {
          setLoadingProtocol(false);
        }
      };
      fetchData();
    }
  }, [isOpen, doctorId, appointmentId, patientData]);


  const [sheetScale, setSheetScale] = useState(1);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState(null);

  // Generate QR code as data URL for use in PDF/print
  useEffect(() => {
    if (!isOpen || !appointmentId) return;

    const generateQR = async () => {
      try {
        // Embed the signed tracking token so the QR works when scanned by
        // the patient (anonymous, no session cookies). Falls back to the
        // tokenless URL if the issue endpoint fails.
        const qrUrl = await getTrackingUrl(appointmentId);
        const dataUrl = await QRCode.toDataURL(qrUrl, {
          // M (15%) instead of H (30%) — the longer tokenized URL was
          // forcing too many modules with H, making the printed QR
          // sub-millimetre per module on standard A4 letterhead and
          // unscannable by phone cameras. M is the industry default and
          // still tolerates print scuffs / ink bleed.
          errorCorrectionLevel: 'M',
          type: 'image/png',
          width: 200,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' }
        });
        setQrCodeDataUrl(dataUrl);
      } catch (error) {
        console.error('[ReportPreview] QR Code generation failed:', error);
      }
    };

    generateQR();
  }, [isOpen, appointmentId]);

  useEffect(() => {
    // Default to 100% zoom on open. The report sits in its own scrollable pane,
    // so it no longer needs to be shrunk to fit the whole sheet on screen; users
    // adjust with the zoom controls in the sidebar.
    if (isOpen) setSheetScale(1);
  }, [isOpen]);


  const resolvedAssetUrl = useMemo(() => {
    if (!protocol?.letterheadBlobUrl) return null;

    let url = protocol.letterheadBlobUrl.startsWith('http')
      ? protocol.letterheadBlobUrl
      : `${BASE_URL}${protocol.letterheadBlobUrl}`;

    // Apply Strategic Proxy for Azure Blobs (Matching AdminBoard logic)
    if (url.includes('blob.core.windows.net')) {
      return `${BASE_URL}/Study/proxy-asset?url=${encodeURIComponent(url)}`;
    }

    return url;
  }, [protocol?.letterheadBlobUrl]);

  // Pre-render the letterhead (PDF or image) to a PNG data URL so that the
  // print popup never needs to make a network request (avoids the browser
  // downloading a PDF letterhead instead of embedding it).
  const [letterheadDataUrl, setLetterheadDataUrl] = useState(null);

  useEffect(() => {
    if (!resolvedAssetUrl) { setLetterheadDataUrl(null); return; }

    let cancelled = false;
    const isPdfSource = resolvedAssetUrl.toLowerCase().includes('.pdf') || resolvedAssetUrl.includes('type=pdf');

    if (isPdfSource) {
      // Use pdfjs to render page 1 of the PDF letterhead to a canvas → PNG data URL
      (async () => {
        try {
          const loadingTask = pdfjs.getDocument({ url: resolvedAssetUrl });
          const pdfDocument = await loadingTask.promise;
          const page = await pdfDocument.getPage(1);
          const naturalViewport = page.getViewport({ scale: 1 });
          const scale = 794 / naturalViewport.width; // fit A4 width (96 dpi)
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          if (!cancelled) setLetterheadDataUrl(canvas.toDataURL('image/png'));
        } catch (err) {
          console.warn('[ReportPreview] PDF letterhead pre-render failed:', err);
          if (!cancelled) setLetterheadDataUrl(null);
        }
      })();
    } else {
      // Draw the image to an offscreen canvas to obtain a data URL.
      // crossOrigin='anonymous' is required for canvas.toDataURL on proxied assets.
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (cancelled) return;
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        try {
          setLetterheadDataUrl(canvas.toDataURL('image/png'));
        } catch {
          // Canvas tainted (proxy lacks CORS headers) — fall back to the URL
          // directly; the window.onload script in the print popup will wait
          // for the <img> to load before triggering window.print().
          setLetterheadDataUrl(resolvedAssetUrl);
        }
      };
      img.onerror = () => { if (!cancelled) setLetterheadDataUrl(resolvedAssetUrl); };
      img.src = resolvedAssetUrl;
    }

    return () => { cancelled = true; };
  }, [resolvedAssetUrl]);

  // ── Multi-page pagination ─────────────────────────────────────────────────
  // Splits body content (findings + impression + advice) into per-page HTML
  // chunks so each rendered sheet stays within the available content area
  // (297mm − headerMargin − bottomMargin). Patient info renders on page 1 only.
  const [pages, setPages] = useState(['']);
  const patientInfoMeasureRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !reportContent) return;

    const { mode: rcMode, text: rcText, data: rcData, impression: rcImpression, advice: rcAdvice } = reportContent;
    const _isPlain = !protocol?.letterheadBlobUrl;
    const _baseFontSize = protocol?.fontSize || 12;
    // Unified with the editor + Word export: font size in POINTS, line-height 1.5.
    const _contentStyle = `font-size: ${_baseFontSize}pt; line-height: 1.5; color: ${protocol?.fontColor || '#1e293b'}; font-family: ${protocol?.fontFamily || 'inherit'};`;

    // ── WYSIWYG pagination ──────────────────────────────────────────────
    // Honor the editor's own page splits. The editor has already paginated
    // the report using the protocol margins and the patient-banner reserve,
    // so we simply extract each <div class="word-page-inner"> as a ready
    // preview-page chunk. Eliminates editor/preview divergence (different
    // fonts, different metrics) entirely.
    // Print-time spacing: the editor stores `data-spacing-before` /
    // `data-spacing-after` on paragraphs/headings without applying them as
    // visible CSS margin (so live pagination stays stable). At preview/print
    // time we honor those attributes by writing them out as margin-top /
    // margin-bottom inline styles, so the user's "Add Space Before / After
    // Paragraph" choices reach the rendered output exactly as in Word.
    const _hydrateSpacing = (root) => {
      root.querySelectorAll('[data-spacing-before], [data-spacing-after]').forEach(el => {
        const before = el.getAttribute('data-spacing-before');
        const after  = el.getAttribute('data-spacing-after');
        const styles = [];
        if (before) styles.push(`margin-top: ${before}`);
        if (after)  styles.push(`margin-bottom: ${after}`);
        const existing = el.getAttribute('style') || '';
        const sep = existing && !existing.trim().endsWith(';') ? '; ' : '';
        el.setAttribute('style', existing + sep + styles.join('; '));
      });
    };

    // Blank-line spacing: a typist adds gaps between paragraphs by pressing
    // Enter (empty <p></p>). The editor renders these with a full line of
    // height (ProseMirror's trailing <br>), but getHTML() serialises them as
    // truly empty <p></p>, which COLLAPSE to ~0 height in plain HTML — so the
    // gaps disappear in preview/print. Inject a <br> into every empty block so
    // it keeps one line of height, exactly as the editor shows it.
    const _preserveBlankLines = (root) => {
      root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').forEach(el => {
        if (!el.textContent.trim() && el.children.length === 0) {
          el.innerHTML = '<br>';
        }
      });
    };

    const _extractEditorPages = (html) => {
      if (!html) return [];
      const tmp = document.createElement('div');
      tmp.innerHTML = sanitizeReportHtml(html);
      _hydrateSpacing(tmp);
      _preserveBlankLines(tmp);

      // Path A — editor produced .word-page wrappers (PageDocument schema).
      // Each one is already a ready-made page chunk.
      const inners = tmp.querySelectorAll('.word-page-inner');
      if (inners.length > 0) {
        return Array.from(inners).map(inner => inner.innerHTML);
      }

      // Path B — editor produced flat blocks, with [data-page-break]
      // markers injected by getPrintHTML at every auto-flow boundary AND
      // by PageBreakNode renderHTML at every user-inserted manual break.
      // Walk top-level children and split at each marker.
      const hasMarkers = !!tmp.querySelector('[data-page-break]');
      if (hasMarkers) {
        const pages = [];
        let current = document.createElement('div');
        Array.from(tmp.children).forEach(child => {
          if (child.hasAttribute && child.hasAttribute('data-page-break')) {
            pages.push(current.innerHTML);
            current = document.createElement('div');
            return;
          }
          current.appendChild(child.cloneNode(true));
        });
        pages.push(current.innerHTML);
        // Filter trivially empty trailing chunks (e.g., a break with no
        // content after it — shouldn't normally happen but defensive).
        return pages.filter(p => p && p.trim());
      }

      // Legacy / single-page fallback — content has no Path A wrappers
      // and no Path B markers (e.g., very short flat draft, or legacy
      // raw HTML from an older save). One page; pagination is best-effort.
      return [tmp.innerHTML];
    };

    let chunks = [];

    if (rcMode === 'Structured' && rcData) {
      // Structured reports — render all sections on a single page chunk.
      // (Structured layouts are usually short and don't span pages.)
      const structured = Object.entries(rcData).map(([k, v]) => `
        <div style="margin-bottom: 25px;">
          <div style="font-size: 10px; font-weight: 950; color: #64748b; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 1.5px; border-bottom: 1px solid #f1f5f9; padding-bottom: 2px;">${k.replace(/_/g, ' ')}</div>
          <div style="${_contentStyle} white-space: pre-wrap;">${v}</div>
        </div>`).join('');
      chunks = [structured];
    } else {
      // Freeform — take editor's already-paginated chunks as-is.
      chunks = _extractEditorPages(rcText);
    }

    // Impression + Advice attach to the LAST page so they always end the report.
    let trailing = '';
    if (rcImpression) {
      trailing += `<div class="impression-block" style="margin-top: 35px; background: rgba(15, 82, 186, 0.02); padding: 15px 20px; border-radius: 6px; border-left: 4px solid ${protocol?.fontColor || '#0f52ba'};"><div style="font-size: 10px; font-weight: 950; color: ${protocol?.fontColor || '#0f52ba'}; margin-bottom: 6px; letter-spacing: 1px;">IMPRESSION:</div><div style="font-size: ${_baseFontSize}px; font-weight: 900; color: ${protocol?.fontColor || '#1e293b'}; line-height: 1.5;">${rcImpression}</div></div>`;
    }
    if (rcAdvice) {
      trailing += `<div class="advice-block" style="margin-top: 20px; padding-left: 20px;"><div style="font-size: 10px; font-weight: 950; color: #64748b; margin-bottom: 4px; letter-spacing: 1px;">ADVICE:</div><div style="font-size: 11px; color: #475569; font-style: italic;">${rcAdvice}</div></div>`;
    }
    if (trailing) {
      if (chunks.length === 0) chunks = [trailing];
      else chunks[chunks.length - 1] = (chunks[chunks.length - 1] || '') + trailing;
    }

    // ── Re-paginate by measurement ──────────────────────────────────────────
    // The editor's chunks were sized for the editor's layout, but spacing
    // hydration + the appended impression/advice + any margin differences make a
    // chunk overflow the print A4 box (height:297mm; overflow:hidden → clipped).
    // Re-split each chunk against the ACTUAL writable area so content flows to a
    // new page instead of being truncated. We only SPLIT (never merge across
    // chunks), so editor page boundaries — incl. manual breaks — are preserved.
    const PX_PER_MM = 96 / 25.4;
    const _leftMm   = protocol?.leftMargin   ?? 20;
    const _rightMm  = protocol?.rightMargin  ?? 20;
    const _topMm    = protocol?.headerMargin ?? 25;
    const _bottomMm = protocol?.bottomMargin ?? 20;
    const _widthMm  = Math.max(60, 210 - _leftMm - _rightMm);
    // Reserve ~one text line so the print window (a separate document that can
    // render a hair taller than the on-screen measurer) still fits each page
    // without needing the overflow:visible margin spill — keeps preview = print.
    const SAFETY_PX = 26;
    const capacityPx = Math.max(120, (297 - _topMm - _bottomMm) * PX_PER_MM - SAFETY_PX);
    // Page 1 also carries the patient banner — subtract its measured height
    // (the hidden measurer renders the same banner at the content width).
    const bannerPx = (patientInfoMeasureRef.current?.offsetHeight || 110) + 8;
    const firstCapacityPx = Math.max(120, capacityPx - bannerPx);

    let paged = [];
    chunks.forEach((chunkHtml) => {
      const sub = _paginateChunkByMeasurement(chunkHtml, {
        widthMm: _widthMm,
        capacityPx,
        // The banner reserve applies only to the very first page of the document.
        firstCapacityPx: paged.length === 0 ? firstCapacityPx : capacityPx,
      });
      paged = paged.concat(sub);
    });
    if (!paged.length) paged = [''];
    console.log(`[ReportPreview] Measured pagination — ${paged.length} page(s) from ${chunks.length} editor chunk(s)`);
    setPages(paged);
  }, [isOpen, reportContent, protocol, savedMetadata, fullAppointment]);

  // Ctrl/Cmd+P while the preview is open → run OUR A4 iframe print (handlePrint),
  // not the browser's native print, which would render the modal/app chrome with
  // broken pagination. handlePrint is defined after the early-return below (it's
  // only needed when open), so we reach it through a ref that's set on each open
  // render — keeping this hook unconditional and above the return.
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
    document.addEventListener('keydown', onKey, true /* capture, beats the browser */);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isOpen]);

  if (!isOpen) return null;

  // Extract content
  const { mode, text, data, impression, advice, isFinalized } = reportContent;

  const isPlain = !protocol?.letterheadBlobUrl;
  console.log(`[ReportPreview] Scenario Mode: ${isPlain ? 'PLAIN_HEADER' : 'LETTERHEAD_BINDING'}`);
  console.log(`[ReportPreview] Total pages to render: ${pages.length}`);
  
  // Honor protocol.fontSize when provided; fall back per scenario
  const baseFontSize = protocol?.fontSize || 12;

  // Surgical Margin Resolution (mm to style) — drives both preview & print.
  // Honor protocol-configured margins in both modes (?? so an explicit 0 is
  // respected). Fall back to sensible defaults only when the setting is unset:
  // blank A4 → 20mm uniform; letterhead → 45mm top to clear typical header art.
  const topMm    = protocol?.headerMargin ?? 25;
  const leftMm   = protocol?.leftMargin   ?? 20;
  const rightMm  = protocol?.rightMargin  ?? 20;
  const bottomMm = protocol?.bottomMargin ?? 20;
  const m = { top: `${topMm}mm`, left: `${leftMm}mm`, right: `${rightMm}mm`, bottom: `${bottomMm}mm` };

  // Helper to generate complete page HTML (with letterhead, margins, content).
  //
  // GOAL: render IDENTICAL output to what the on-screen A4 preview displays.
  // The preview uses absolute-positioned siblings (letterhead <img> + content
  // <div with top/left/right/bottom margins>), which works on screen but is
  // fragile in print engines. The print version below uses the same logical
  // layout but achieved with background-image + padding — both of which are
  // bulletproof in print drivers.
  //
  // Critically: NO `white-space: pre-wrap` wrapper around pageHTML (the previous
  // version added one — that style preserved the template-literal indentation
  // and broke the layout. The preview just does `dangerouslySetInnerHTML` with
  // no wrapper; this print version now does the same.)
  const generatePageHtml = (pageHTML, pageIdx) => {
    const isLast = pageIdx === pages.length - 1;
    const showLetterhead = !!letterheadDataUrl && (pageIdx === 0 || protocol?.overflowBackgroundMode === 'REUSE');

    // Build the patient-info banner only on page 1 — exact HTML twin of the
    // React PatientInfoBlock component used in the on-screen preview.
    // Service-scoped overrides — keep in sync with PatientInfoBlock above.
    const _matchedService = appointmentServiceId
      ? (fullAppointment?.services || []).find(s => s.id === appointmentServiceId)
      : null;
    const _ptName  = (fullAppointment?.patientName || '').toUpperCase() || '—';
    const _ptId    = fullAppointment?.patientIdentifier || fullAppointment?.ptid || fullAppointment?.id || '—';
    const _ptAge   = fullAppointment?.patientAge || fullAppointment?.age || '—';
    const _ptSex   = fullAppointment?.patientGender || fullAppointment?.gender || '—';
    const _ptSvc   = _matchedService?.serviceName || fullAppointment?.service || fullAppointment?.modality || '—';
    const _ptMod   = _matchedService?.modality    || fullAppointment?.modality || '—'; // used by thank-you line
    const _refDegSpec = [fullAppointment?.referrerDegree, fullAppointment?.referrerSpecialty].filter(Boolean).join(', ');
    const _ptRef   = (fullAppointment?.referredBy || 'Self') + (_refDegSpec && fullAppointment?.referredBy ? ` (${_refDegSpec})` : '');
    const _repDate = savedMetadata?.finalizedAt
      ? new Date(savedMetadata.finalizedAt).toLocaleDateString()
      : new Date().toLocaleDateString();

    const patientBannerHtml = pageIdx === 0 ? `
      <div style="
        position: relative;
        display: flex;
        align-items: center;
        gap: 14px;
        background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 10px 14px 10px 12px;
        margin-bottom: 10px;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
        overflow: hidden;
        font-family: 'Inter', 'Helvetica Neue', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
        font-feature-settings: 'tnum' 1, 'lnum' 1;
      ">
        <div style="position: absolute; top: 0; bottom: 0; left: 0; width: 4px; background: linear-gradient(180deg, #0f52ba 0%, #1e40af 50%, #0f52ba 100%);"></div>

        <div style="margin-left: 6px; padding: 4px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; flex-shrink: 0;">
          ${qrCodeDataUrl
            ? `<img src="${qrCodeDataUrl}" style="width: 42px; height: 42px; display: block;" alt="QR Code" />`
            : `<div style="width: 42px; height: 42px; background: #f1f5f9;"></div>`}
        </div>

        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 17px; font-weight: 800; color: #0a1628; letter-spacing: -0.2px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${_ptName}</div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 3px; display: flex; align-items: center; gap: 7px; flex-wrap: wrap;">
            <span><span style="color: #94a3b8; font-weight: 700;">Patient ID:</span> <strong style="color: #0f172a;">${_ptId}</strong></span>
            <span style="color: #cbd5e1;">·</span>
            <span><span style="color: #94a3b8; font-weight: 700;">Age/Sex:</span> <strong style="color: #0f172a;">${_ptAge} / ${_ptSex}</strong></span>
            <span style="color: #cbd5e1;">·</span>
            <span><span style="color: #94a3b8; font-weight: 700;">Study:</span> <strong style="color: #0f52ba;">${_ptSvc}</strong></span>
            <span style="color: #cbd5e1;">·</span>
            <span><span style="color: #94a3b8; font-weight: 700;">Prescribed By:</span> <strong style="color: #0f172a;">${_ptRef}</strong></span>
          </div>
        </div>

        <div style="text-align: right; flex-shrink: 0; padding-left: 8px; border-left: 1px solid #e2e8f0; min-width: 70px;">
          <div style="font-size: 8px; font-weight: 800; color: #94a3b8; letter-spacing: 1.5px; text-transform: uppercase;">Reported</div>
          <div style="font-size: 12px; font-weight: 700; color: #1e293b; margin-top: 2px;">${_repDate}</div>
        </div>
      </div>
      <div style="font-family: 'Inter', 'Helvetica Neue', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 10.5px; font-style: italic; color: #475569; margin-bottom: 14px; letter-spacing: 0.1px; text-align: center;">
        Thank you for referring the patient for <strong style="color: #0f52ba; font-style: normal;">${_ptMod}</strong>.
      </div>
    ` : '';

    // Letterhead delivered via <img absolutely-positioned> — the SAME approach
    // the on-screen preview uses (line ~799). This makes print and preview
    // visually identical. Combined with `print-color-adjust: exact` and the
    // @page { margin: 0 } rule in the surrounding print-window CSS, every
    // print driver we've tested honours this layout.
    const letterheadImg = showLetterhead
      ? `<img src="${letterheadDataUrl}" style="position: absolute; top: 0; left: 0; width: 210mm; height: 297mm; z-index: 1; pointer-events: none; object-fit: fill; display: block;" alt="Letterhead" />`
      : '';

    return `
      <div class="rp-sheet${isLast ? ' rp-sheet-last' : ''}" style="
        width: 210mm;
        height: 297mm;
        page-break-after: ${isLast ? 'auto' : 'always'};
        break-after: ${isLast ? 'auto' : 'page'};
        background: white;
        margin: 0;
        padding: 0;
        position: relative;
        overflow: hidden;
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      ">
        ${letterheadImg}
        <div style="
          position: absolute;
          top: ${topMm}mm;
          left: ${leftMm}mm;
          right: ${rightMm}mm;
          bottom: ${bottomMm}mm;
          z-index: 2;
          overflow: visible;
        ">
          ${patientBannerHtml}
          <div class="report-content">${pageHTML}</div>
        </div>
      </div>
    `;
  };

  const handleDownload = async () => {
    try {
      const filename = `diagnostic-report-${new Date().toISOString().split('T')[0]}.pdf`;
      // Generate complete page HTML with letterhead and styling
      const completePages = pages.map((pageHTML, idx) => generatePageHtml(pageHTML, idx));
      await downloadReportPdf(completePages, filename);
    } catch (error) {
      console.error('Download failed:', error);
      notifyToast('Failed to download PDF. Please try again.', 'error');
    }
  };

  // Print the on-screen report EXACTLY as previewed. We print the `printTree`
  // (a React mirror of the preview — same components, same .report-content
  // styles, same pages[]), shown via the @media print rules that hide
  // everything else. This guarantees PRINT === PREVIEW (the old new-window path
  // rebuilt the HTML separately and drifted out of sync). Works in the browser
  // and in the desktop app (Electron's window.print() opens the system dialog).
  const handlePrint = () => {
    // Robust multi-page print: render the SAME self-contained document the
    // preview is built from into a hidden, FULL-SIZE iframe and print THAT.
    // The previous in-place window.print() relied on @media print flattening the
    // live modal DOM, which dropped every page past the first on some browsers.
    // A real-sized iframe (A4 width + enough height for all pages) gives the
    // print layout the whole document, so all pages come through.
    try {
      const html = buildPrintContent();
      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      const fullH = Math.max(1, pages.length) * 1123 + 300; // A4 px/page + buffer
      iframe.style.cssText = `position:fixed;left:-99999px;top:0;width:794px;height:${fullH}px;border:0;background:#fff;`;
      document.body.appendChild(iframe);
      // Drop the iframe once the job has had time to spool.
      setTimeout(() => { try { document.body.removeChild(iframe); } catch (_) { /* gone */ } }, 12000);
      const doc = iframe.contentWindow?.document;
      if (!doc) { try { document.body.removeChild(iframe); } catch (_) {} return; }
      doc.open();
      doc.write(html);
      doc.close();
      // The injected onload script in `html` waits for the letterhead image(s)
      // then calls window.print() inside the iframe — printing every page.
    } catch (_) {
      // Last-ditch fallback to the old behaviour.
      setTimeout(() => { try { window.print(); } catch (__) {} }, 60);
    }
  };
  // Expose to the Ctrl/Cmd+P interceptor declared above the early return.
  handlePrintRef.current = handlePrint;

  // Legacy fallback — opens a separate window with rebuilt HTML. Kept for
  // reference; no longer wired to the Print button (it drifted out of sync
  // with the preview).
  // Build the FULLY self-contained print document (all pages + inlined print
  // CSS + an onload auto-print script). Used by handlePrint (hidden-iframe
  // print) — reliable multi-page output independent of the live modal DOM.
  const buildPrintContent = () => {
    const pagesHtml = pages.map((pageHTML, pageIdx) => generatePageHtml(pageHTML, pageIdx)).join('');
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <base href="${window.location.origin}/">
        <title>Diagnostic Report - Print</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: white;
            width: 100%;
            height: auto;
          }

          /* Print each A4 sheet a HAIR under 297mm so sub-pixel rounding can't
             spill a full-height page onto a second sheet — which is what inserted
             a blank page between pages. (The on-screen preview keeps the full
             297mm via the inline style; this class rule only wins inside the
             print document.) The last sheet never forces a trailing break. */
          .rp-sheet { height: 296mm !important; }
          .rp-sheet:last-child, .rp-sheet-last { page-break-after: auto !important; break-after: auto !important; }

          /* Zero browser-default block margins so they don't double-up with
             the typography rules below. */
          p, h1, h2, h3, h4, h5, h6,
          ul, ol, dl, dd, blockquote, pre, table, figure {
            margin: 0;
            padding: 0;
          }

          /* Typography mirror of the NarrativeEditor (.narrative-editor-content).
             This is what makes the print popup look IDENTICAL to the editor and
             the preview — same fonts, same heading sizes, same colours, same
             list/table styling. Without this, the popup would fall back to the
             browser's defaults and the report would look completely different. */
          /* Base font for the print wrapper (stray text outside .report-content). */
          .print-container {
            font-family: "Calibri", "Segoe UI", -apple-system, sans-serif;
            font-size: ${baseFontSize}pt;
            line-height: 1.5;
            color: #000000;
          }
          /* Report typography — SINGLE SOURCE OF TRUTH (shared with the preview). */
          ${reportContentCss(baseFontSize)}
          /* word-page wrappers from the editor's pagination model — strip
             their margins/padding so they don't add extra vertical space
             inside our own per-page containers. */
          .print-container .word-page,
          .print-container .word-page-inner {
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            border: none !important;
            width: auto !important;
            height: auto !important;
          }
          /* Clamp any inline line-height < 1.0 that would overlap text — same
             rule the editor applies. (Defensive: if old reports were saved
             with overlapping line-height, print still renders cleanly.) */
          .print-container *[style*="line-height: 0."] { line-height: 1 !important; }

          .print-container {
            width: 210mm;
            background: white;
            margin: 0;
          }
          .print-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            background: #f0f0f0;
            border-bottom: 1px solid #d0d0d0;
            margin-bottom: 16px;
            gap: 16px;
            flex-wrap: wrap;
          }
          .print-header h2 {
            margin: 0;
            font-size: 18px;
            color: #333;
          }
          .print-button-group {
            display: flex;
            gap: 8px;
          }
          .print-button {
            padding: 10px 20px;
            font-size: 14px;
            font-weight: bold;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
          }
          .print-button.primary {
            background: #0078d4;
            color: white;
          }
          .print-button.primary:hover {
            background: #1e40af;
          }
          .print-button.secondary {
            background: white;
            color: #0078d4;
            border: 1px solid #0078d4;
          }
          .print-button.secondary:hover {
            background: #f0f0f0;
          }
          @media print {
            .print-header { display: none !important; }
            body { margin: 0 !important; padding: 0 !important; }
            /* Force background-image (the letterhead) to print on every page.
               Chromium suppresses backgrounds by default — these rules override. */
            .print-container > div {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        </style>
        <script>
          // Wait for ALL images/embeds to finish loading before opening the
          // print dialog. The letterhead is a proxied Azure Blob that can take
          // several seconds — the old 500 ms setTimeout fired too early.
          window.addEventListener('load', function () {
            var images = document.querySelectorAll('img, embed');
            if (!images.length) { setTimeout(window.print, 100); return; }
            var pending = images.length;
            function done() { if (--pending <= 0) setTimeout(window.print, 100); }
            images.forEach(function(el) {
              if (el.tagName === 'IMG') {
                if (el.complete) { done(); } else { el.onload = done; el.onerror = done; }
              } else {
                // embed/object — no reliable load event; give it a generous head-start
                setTimeout(done, 1500);
              }
            });
          });
        </script>
      </head>
      <body>
        <div class="print-header">
          <h2>📄 Diagnostic Report</h2>
          <div class="print-button-group">
            <button class="print-button primary" onclick="window.print()">🖨️ Print / Save as PDF</button>
            <button class="print-button secondary" onclick="window.close()">✕ Close</button>
          </div>
        </div>
        <div class="print-container">
          ${pagesHtml}
        </div>
      </body>
      </html>
    `;
  };

  const handleWhatsAppShare = async () => {
    const mobile = fullAppointment?.patientMobile || fullAppointment?.mobile;
    if (!mobile) {
      notifyToast('No patient mobile number found for this appointment.', 'warning');
      return;
    }

    // Use the same signed-token URL the QR uses so the WhatsApp link works
    // when the patient taps it from their phone (no session).
    const reportUrl = await getTrackingUrl(appointmentId);
    const message = `Hello ${fullAppointment?.patientName},\n\nYour Diagnostic Report for ${fullAppointment?.service || 'the clinical study'} is now available.\n\n📄 View/Download Report: ${reportUrl}\n\nThank you for choosing ${fullAppointment?.hospitalName || '1Rad Diagnostic Center'}.`;
    
    const encoded = encodeURIComponent(message);
    const cleanedMobile = mobile.replace(/\D/g, '');
    const finalMobile = cleanedMobile.length === 10 ? `91${cleanedMobile}` : cleanedMobile;
    
    window.open(`https://wa.me/${finalMobile}?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  // Preview-modal layout helpers (premium popup: report pane + actions sidebar).
  const isNarrowPreview = typeof window !== 'undefined' && window.innerWidth < 900;
  const zoomBtn = { width: '34px', height: '32px', borderRadius: '9px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', fontWeight: 900, cursor: 'pointer', fontSize: '14px' };
  const actionBtn = { flex: 1, padding: '13px 16px', borderRadius: '12px', fontWeight: 950, cursor: 'pointer', fontSize: '12.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.15s', whiteSpace: 'nowrap' };

  const modalContent = (
    <div className="modal-overlay" style={{ background: 'rgba(10, 22, 40, 0.98)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0, backdropFilter: 'blur(10px)', padding: isNarrowPreview ? 0 : '2vh' }}>
      <div style={{ width: isNarrowPreview ? '100vw' : '96vw', height: isNarrowPreview ? '100vh' : '96vh', maxWidth: '1500px', background: '#0a1628', display: 'flex', flexDirection: isNarrowPreview ? 'column' : 'row', overflow: 'hidden', borderRadius: isNarrowPreview ? 0 : '18px', boxShadow: '0 40px 100px -20px rgba(0,0,0,0.6)' }}>

        <div className="preview-canvas" style={{
          flex: 1, 
          background: '#0a1628', 
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
          overflow: 'auto', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'flex-start', 
          padding: window.innerWidth < 768 ? '20px 10px' : '60px 20px' 
        }}>
          {/* Scaled Wrapper — grows with content so overflow pages remain visible */}
          <div
            ref={(el) => { window.__previewScaledWrapper = el; }}
            style={{
              width: `${210 * sheetScale}mm`,
              // height is set by JS below to match the scaled inner report height
              minHeight: `${297 * sheetScale}mm`,
              position: 'relative',
              flexShrink: 0,
              ['--sheet-scale']: sheetScale,
            }}>
            <div
              id="printable-report"
              ref={(el) => {
                if (!el) return;
                requestAnimationFrame(() => {
                  const wrapper = el.parentElement;
                  if (wrapper) wrapper.style.height = `${el.offsetHeight * sheetScale}px`;
                });
              }}
              style={{
                width: '210mm',
                background: 'transparent',
                color: protocol?.fontColor || '#1e293b',
                fontFamily: protocol?.fontFamily || 'Arial, sans-serif',
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `scale(${sheetScale})`,
                transformOrigin: 'top left',
              }}>

            {/* Hidden patient-info measurer — same markup as the visible block,
                used so the pagination effect can subtract its height from page 1. */}
            <div
              ref={patientInfoMeasureRef}
              style={{ position: 'fixed', left: '-99999px', top: 0, width: `${210 - leftMm - rightMm}mm`, visibility: 'hidden', pointerEvents: 'none' }}
            >
              <PatientInfoBlock
                appointmentId={appointmentId}
                fullAppointment={fullAppointment}
                savedMetadata={savedMetadata}
              />
            </div>

            {pages.map((pageHTML, pageIdx) => {
              const isLast = pageIdx === pages.length - 1;
              return (
                <div
                  key={`a4-page-${pageIdx}`}
                  className="a4-page"
                  data-page-index={pageIdx}
                  style={{
                    width: '210mm',
                    height: '297mm',
                    background: 'white',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 60px 120px rgba(0,0,0,0.8)',
                    marginBottom: isLast ? 0 : '40px',
                    border: '1px solid #e2e8f0',
                    breakAfter: isLast ? 'auto' : 'page',
                    pageBreakAfter: isLast ? 'auto' : 'always',
                  }}
                >
                  {/* SINGLE SOURCE OF TRUTH — the preview renders the EXACT same
                      generatePageHtml() the Print + Download PDF use (letterhead
                      via the shared data-URL, the same patient banner, the same
                      margins). So what you see here is byte-for-byte what prints
                      and exports — no second renderer to drift out of sync. */}
                  <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={sanitizeMarkup(generatePageHtml(pageHTML, pageIdx))} />

                  {/* Page indicator (preview only) */}
                  <div className="preview-page-badge" style={{
                    position: 'absolute',
                    right: '6mm',
                    bottom: '6mm',
                    zIndex: 4,
                    fontSize: '9px',
                    fontWeight: 700,
                    color: '#64748b',
                    background: 'rgba(255,255,255,0.85)',
                    padding: '2px 7px',
                    borderRadius: '3px',
                    letterSpacing: '1px',
                  }}>
                    PAGE {pageIdx + 1} / {pages.length}
                  </div>
                </div>
              );
            })}

          </div>
        </div>
      </div>

        {/* ── RIGHT: actions sidebar (1/4) ── */}
        <div style={{
          flex: isNarrowPreview ? '0 0 auto' : '0 0 300px',
          width: isNarrowPreview ? '100%' : undefined,
          background: 'linear-gradient(160deg, #0f52ba 0%, #0a2a63 55%, #071d45 100%)',
          borderLeft: isNarrowPreview ? 'none' : '1px solid rgba(255,255,255,0.12)',
          borderTop: isNarrowPreview ? '1px solid rgba(255,255,255,0.12)' : 'none',
          display: 'flex', flexDirection: 'column', gap: '18px',
          padding: isNarrowPreview ? '14px 16px' : '22px 20px',
          color: 'white', boxSizing: 'border-box', overflowY: 'auto',
        }}>
          {/* Brand + title + status + close */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '8px', fontWeight: 900, letterSpacing: '2.5px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>NexEagle · 1Rad</div>
              <h3 style={{ fontSize: '18px', fontWeight: 950, margin: '5px 0 0', letterSpacing: '-0.3px' }}>Report Preview</h3>
              <div style={{ marginTop: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: 900, padding: '3px 10px', borderRadius: '999px', background: isFinalized ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)', color: isFinalized ? '#4ade80' : '#fbbf24', border: `1px solid ${isFinalized ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}` }}>
                  {loadingProtocol ? 'Loading…' : (isFinalized ? '✓ Final report' : '✎ Draft')}
                </span>
              </div>
            </div>
            <button onClick={onClose} title="Close" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: '#e2e8f0', fontSize: '15px', cursor: 'pointer', width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0 }}>✕</button>
          </div>

          {/* Report context card */}
          <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '14px 15px' }}>
            <div style={{ fontSize: '15px', fontWeight: 950, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(fullAppointment?.patientName || '—').toUpperCase()}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '11px' }}>
              {[
                ['Study', fullAppointment?.service || fullAppointment?.modality || '—'],
                ['Patient ID', fullAppointment?.patientIdentifier || fullAppointment?.ptid || fullAppointment?.id || '—'],
                ['Reported', savedMetadata?.finalizedAt ? new Date(savedMetadata.finalizedAt).toLocaleDateString() : new Date().toLocaleDateString()],
                ['Pages', String(pages.length)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '11px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 700, whiteSpace: 'nowrap' }}>{k}</span>
                  <span style={{ color: 'white', fontWeight: 800, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Zoom */}
          <div>
            <div style={{ fontSize: '9px', fontWeight: 900, letterSpacing: '1px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>ZOOM</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => setSheetScale(s => Math.max(0.3, +(s - 0.1).toFixed(2)))} style={zoomBtn}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: '12px', fontWeight: 950, color: '#93c5fd' }}>{Math.round(sheetScale * 100)}%</div>
              <button onClick={() => setSheetScale(s => Math.min(2, +(s + 0.1).toFixed(2)))} style={zoomBtn}>+</button>
              <button onClick={() => setSheetScale(1)} style={{ ...zoomBtn, width: 'auto', padding: '0 12px', fontSize: '10px' }}>100%</button>
            </div>
          </div>

          {/* Actions — pinned to the bottom on desktop */}
          <div style={{ marginTop: isNarrowPreview ? 0 : 'auto' }}>
            <div style={{ fontSize: '9px', fontWeight: 900, letterSpacing: '1px', color: 'rgba(255,255,255,0.5)', marginBottom: '10px' }}>SHARE &amp; EXPORT</div>
            <div style={{ display: 'flex', flexDirection: isNarrowPreview ? 'row' : 'column', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={handleWhatsAppShare} style={{ ...actionBtn, background: 'rgba(37,211,102,0.16)', border: '1px solid rgba(37,211,102,0.35)', color: '#4ade80' }}>💬 Share on WhatsApp</button>
              <button onClick={handleDownload} style={{ ...actionBtn, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: 'white' }}>📥 Download PDF</button>
              <button onClick={handlePrint} style={{ ...actionBtn, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', border: 'none', color: 'white', boxShadow: '0 6px 18px rgba(37,99,235,0.5)' }}>🖨️ Print</button>
            </div>
          </div>
        </div>
    </div>
      <style>{`
        /* Report typography — SINGLE SOURCE OF TRUTH (shared with Print +
           inherited by the pagination measurer and Download-PDF). Driven by
           the configured font size at line-height 1.5, identical to the print
           document, so what you preview is exactly what prints/exports. */
        ${reportContentCss(baseFontSize)}

        @media print {
          /* Each .a4-page is already 297mm tall with its own safe-zone padding,
             so @page margin = 0 to avoid doubling. */
          @page {
            size: A4;
            margin: 0 !important;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box !important;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            background: white !important;
          }

          /* Hide everything outside the modal */
          #root, .dashboard-layout, .workspace-container, .top-nav, .sidebar {
            display: none !important;
          }

          /* Flatten the entire modal wrapper chain so the .a4-page divs
             become effective children of <body> — page-break-after only works
             reliably when ancestors are not absolutely-positioned / clipped. */
          .modal-overlay,
          .modal-overlay > div,
          .preview-canvas,
          .preview-canvas > div {
            display: contents !important;
          }

          /* Header bar and zoom controls — hide entirely */
          .preview-header { display: none !important; }

          /* The scrollable canvas should not be scrollable in print */
          .preview-canvas {
            overflow: visible !important;
          }

          /* The scaled report container — flatten it */
          #printable-report {
            position: static !important;
            transform: none !important;
            transform-origin: top left !important;
            width: 210mm !important;
            min-height: 0 !important;
            height: auto !important;
            background: white !important;
            background-image: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
          }

          /* Each rendered .a4-page = one printed sheet */
          .a4-page {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            position: relative !important;
            overflow: hidden !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .a4-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          /* Preview-only UI */
          .preview-page-badge { display: none !important; }

          /* Don't split key blocks across the synthetic per-page sheet */
          .a4-page p,
          .a4-page h1, .a4-page h2, .a4-page h3, .a4-page h4,
          .a4-page tr, .a4-page img,
          .a4-page .impression-block, .a4-page .advice-block {
            page-break-inside: avoid;
          }

          .letterhead-container {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            z-index: 1 !important;
          }

          .react-pdf__Document,
          .react-pdf__Page,
          .react-pdf__Page__svg {
            display: block !important;
            width: 210mm !important;
            height: 297mm !important;
          }

          /* Top-level buttons (Whatsapp / Download / Print) */
          .btn-preview-action, .btn-preview-primary { display: none !important; }
        }

        .btn-preview-action:hover {
          background: rgba(255,255,255,0.15) !important;
          transform: translateY(-1px);
        }
        .btn-preview-primary:hover {
          background: #1e40af !important;
          box-shadow: 0 6px 20px rgba(15, 82, 186, 0.5) !important;
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );

  // ── Dedicated print-only tree ──────────────────────────────────────────────
  // Rendered as a sibling of the modal, attached directly to <body>. It is
  // hidden on screen and shown only in print. By being a direct body child it
  // avoids all the modal wrapper layout interference that was previously
  // causing only page 1 to print.
  console.log(`[ReportPreview] Rendering print tree with ${pages.length} pages`);
  const printTree = (
    <div className="print-only-tree" aria-hidden="true">
      {pages.map((pageHTML, pageIdx) => {
        console.log(`[ReportPreview] Print tree rendering page ${pageIdx + 1}`);
        const isLast = pageIdx === pages.length - 1;
        const showLetterhead = !!resolvedAssetUrl && (pageIdx === 0 || protocol?.overflowBackgroundMode === 'REUSE');
        const isPdf = resolvedAssetUrl?.toLowerCase().includes('.pdf') || resolvedAssetUrl?.includes('type=pdf');
        return (
          <div
            key={`print-page-${pageIdx}`}
            className="print-only-page"
            style={{
              width: '210mm',
              height: '297mm',
              position: 'relative',
              overflow: 'hidden',
              background: 'white',
              pageBreakAfter: isLast ? 'auto' : 'always',
              breakAfter: isLast ? 'auto' : 'page',
            }}
          >
            {showLetterhead && (
              <div className="letterhead-container" style={{ position: 'absolute', top: 0, left: 0, width: '210mm', height: '297mm', zIndex: 1, pointerEvents: 'none', overflow: 'hidden' }}>
                {isPdf ? (
                  <Document file={resolvedAssetUrl} onLoadError={() => {}}>
                    <Page pageNumber={1} width={794} renderTextLayer={false} renderAnnotationLayer={false} renderMode="canvas" />
                  </Document>
                ) : (
                  <img src={resolvedAssetUrl} alt="Letterhead" style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
                )}
              </div>
            )}
            <div style={{
              position: 'absolute',
              top: m.top,
              left: m.left,
              right: m.right,
              bottom: m.bottom,
              zIndex: 2,
              overflow: 'visible',
            }}>
              {pageIdx === 0 && (
                <PatientInfoBlock
                  appointmentId={appointmentId}
                  fullAppointment={fullAppointment}
                  savedMetadata={savedMetadata}
                />
              )}
              <div className="report-content" dangerouslySetInnerHTML={sanitizeMarkup(pageHTML)} />
            </div>
          </div>
        );
      })}
      <style>{`
        /* Keep print tree LAID OUT (not display:none) so canvas-based react-pdf
           letterheads actually render. We just push it off-screen on screen.
           In print, it returns to (0,0) and shows; the rest of the page hides. */
        .print-only-tree {
          position: absolute;
          left: -99999px;
          top: 0;
          width: 210mm;
          visibility: hidden;
          pointer-events: none;
          z-index: -1;
        }
        @media print {
          @page { size: A4; margin: 0; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            width: 100% !important;
            height: auto !important;
          }
          body > *:not(.print-only-tree) { display: none !important; }
          .print-only-tree {
            position: static !important;
            left: auto !important;
            top: auto !important;
            visibility: visible !important;
            display: block !important;
            width: 210mm !important;
            height: auto !important;
            z-index: auto !important;
            /* NB: must NOT be page-break-inside:avoid — that forces the WHOLE
               multi-page tree onto one sheet and clips to page 1. The per-page
               .print-only-page children carry the page breaks instead. */
          }
          .print-only-tree * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box !important;
          }
          .print-only-page {
            width: 210mm !important;
            height: 297mm !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
          }
          .print-only-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .print-only-page p,
          .print-only-page h1, .print-only-page h2, .print-only-page h3, .print-only-page h4,
          .print-only-page tr, .print-only-page img,
          .print-only-page .impression-block, .print-only-page .advice-block {
            page-break-inside: avoid;
          }
          .print-only-tree .react-pdf__Document,
          .print-only-tree .react-pdf__Page,
          .print-only-tree .react-pdf__Page__canvas,
          .print-only-tree .react-pdf__Page__svg {
            display: block !important;
            width: 210mm !important;
            height: 297mm !important;
            max-width: none !important;
          }
          /* Ensure content areas in print pages are visible */
          .print-only-page > div[style*="position: absolute"] {
            position: absolute !important;
            overflow: visible !important;
          }
        }
      `}</style>
    </div>
  );

  return createPortal(<>{modalContent}{printTree}</>, document.body);
};

export default ReportPreviewModal;
