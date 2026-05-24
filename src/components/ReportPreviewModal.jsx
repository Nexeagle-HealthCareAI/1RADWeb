import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import apiClient, { BASE_URL } from '../api/apiClient';
import { Document, Page, pdfjs } from 'react-pdf';
import { QRCodeCanvas } from 'qrcode.react';
import QRCode from 'qrcode';
import { downloadReportPdf } from '../utils/downloadPdf';

// Configure PDF.js worker
// Configure PDF.js worker to use CDN for maximum reliability
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Patient info header — renders on page 1 of the preview and inside the
// hidden measurer so pagination can subtract its height from page-1 capacity.
// Premium patient-header card. Mirrored in `generatePageHtml` below so the
// printed report visually matches what the doctor sees on screen.
const PatientInfoBlock = ({ appointmentId, fullAppointment, savedMetadata }) => {
  const name      = (fullAppointment?.patientName || '').toUpperCase() || '—';
  const ptid      = fullAppointment?.patientIdentifier || fullAppointment?.ptid || fullAppointment?.id || '—';
  const age       = fullAppointment?.patientAge || fullAppointment?.age || '—';
  const sex       = fullAppointment?.patientGender || fullAppointment?.gender || '—';
  const study     = fullAppointment?.service || fullAppointment?.modality || '—';
  const modality  = fullAppointment?.modality || '—'; // used by the thank-you line
  const refBy     = fullAppointment?.referredBy || 'Self';
  const repDate   = savedMetadata?.finalizedAt
    ? new Date(savedMetadata.finalizedAt).toLocaleDateString()
    : new Date().toLocaleDateString();

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
          <QRCodeCanvas value={`${window.location.origin}/track/${appointmentId}`} size={42} level="H" />
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
            display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
          }}>
            <span><span style={{ color: '#94a3b8', fontWeight: 700 }}>ID</span> <strong style={{ color: '#0f172a' }}>{ptid}</strong></span>
            <span style={{ color: '#cbd5e1' }}>·</span>
            <span><strong style={{ color: '#0f172a' }}>{age}</strong> / <strong style={{ color: '#0f172a' }}>{sex}</strong></span>
            <span style={{ color: '#cbd5e1' }}>·</span>
            <span style={{ color: '#0f52ba', fontWeight: 700 }}>{study}</span>
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

          // 2. Fetch Branding & Signatory Profile using actual Doctor ID
          if (resolvedDoctorId) {
            const res = await apiClient.get(`/Prescription/${resolvedDoctorId}`);
            if (res.data?.success) {
              console.info("[ReportPreview] Branding Data Received:", res.data.data);
              setProtocol(res.data.data);
            }
          } else {
             console.warn("[ReportPreview] No Doctor ID found. Skipping custom branding.");
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
        const qrUrl = `${window.location.origin}/track/${appointmentId}`;
        const dataUrl = await QRCode.toDataURL(qrUrl, {
          errorCorrectionLevel: 'H',
          type: 'image/png',
          width: 200,
          margin: 1,
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
    const handleResize = () => {
      // Calculate scale to fit A4 (794x1123 @ 96dpi) into the viewport
      const padding = 80;
      const availableWidth = window.innerWidth - (window.innerWidth < 768 ? 20 : 80);
      const availableHeight = window.innerHeight - (window.innerWidth < 768 ? 100 : 180);
      const scale = Math.min(availableWidth / 794, availableHeight / 1123);
      setSheetScale(scale);
    };

    if (isOpen) {
      handleResize();
      window.addEventListener('resize', handleResize);
    }
    return () => window.removeEventListener('resize', handleResize);
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
    const _baseFontSize = protocol?.fontSize || (_isPlain ? 12 : 14);
    // Honor protocol-configured margins in both modes (?? so an explicit 0 is
    // respected). Fall back to sensible defaults only when the setting is unset:
    // blank A4 → 20mm uniform; letterhead → 45mm top to clear typical header art.
    const _topMm    = protocol?.headerMargin ?? (_isPlain ? 20 : 45);
    const _leftMm   = protocol?.leftMargin   ?? 20;
    const _rightMm  = protocol?.rightMargin  ?? 20;
    const _bottomMm = protocol?.bottomMargin ?? 20;
    const _contentStyle = `font-size: ${_baseFontSize}px; line-height: 1.6; color: ${protocol?.fontColor || '#1e293b'}; font-family: ${protocol?.fontFamily || 'inherit'};`;

    const _unwrapPages = (html) => {
      if (!html) return '';
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      tmp.querySelectorAll('.word-page-inner, .word-page').forEach(el => {
        const p = el.parentNode;
        while (el.firstChild) p.insertBefore(el.firstChild, el);
        el.remove();
      });
      return tmp.innerHTML;
    };

    let body = '';
    if (rcMode === 'Structured' && rcData) {
      body = Object.entries(rcData).map(([k, v]) => `
        <div style="margin-bottom: 25px;">
          <div style="font-size: 10px; font-weight: 950; color: #64748b; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 1.5px; border-bottom: 1px solid #f1f5f9; padding-bottom: 2px;">${k.replace(/_/g, ' ')}</div>
          <div style="${_contentStyle} white-space: pre-wrap;">${_unwrapPages(v)}</div>
        </div>`).join('');
    } else {
      // IMPORTANT: do NOT wrap the freeform body in a single outer <div> —
      // pagination needs the top-level paragraphs/headings as individual
      // measurable blocks so it can split across pages. Font/color are set
      // on the .a4-page content area and on the measurement container instead.
      body = _unwrapPages(rcText);
    }
    if (rcImpression) {
      body += `<div class="impression-block" style="margin-top: 35px; background: rgba(15, 82, 186, 0.02); padding: 15px 20px; border-radius: 6px; border-left: 4px solid ${protocol?.fontColor || '#0f52ba'};"><div style="font-size: 10px; font-weight: 950; color: ${protocol?.fontColor || '#0f52ba'}; margin-bottom: 6px; letter-spacing: 1px;">IMPRESSION:</div><div style="font-size: ${_baseFontSize}px; font-weight: 900; color: ${protocol?.fontColor || '#1e293b'}; line-height: 1.5;">${rcImpression}</div></div>`;
    }
    if (rcAdvice) {
      body += `<div class="advice-block" style="margin-top: 20px; padding-left: 20px;"><div style="font-size: 10px; font-weight: 950; color: #64748b; margin-bottom: 4px; letter-spacing: 1px;">ADVICE:</div><div style="font-size: 11px; color: #475569; font-style: italic;">${rcAdvice}</div></div>`;
    }

    // Measure each top-level block in a hidden container at the actual content width.
    const measureDiv = document.createElement('div');
    const contentWidthMm = 210 - _leftMm - _rightMm;
    measureDiv.style.cssText = `position: fixed; left: -99999px; top: 0; width: ${contentWidthMm}mm; visibility: hidden; pointer-events: none; font-size: ${_baseFontSize}px; line-height: 1.6; font-family: ${protocol?.fontFamily || 'inherit'};`;
    document.body.appendChild(measureDiv);
    measureDiv.innerHTML = body;

    const MM_TO_PX = 96 / 25.4;
    const PAGE_CONTENT_PX = (297 - _topMm - _bottomMm) * MM_TO_PX;
    // Page 1 also hosts the patient-info header — measure it (or default 220px)
    const patientInfoHeight = patientInfoMeasureRef.current?.offsetHeight || 220;
    const FIRST_PAGE_CONTENT_PX = Math.max(50, PAGE_CONTENT_PX - patientInfoHeight - 16);

    // Helper: when a single block is taller than the page limit, split its
    // text into multiple shorter elements that each fit. Preserves the tag name
    // and inline styles/classes; loses inline-child formatting (bold/italic/
    // spans) inside the split block — those collapse to plain text. Acceptable
    // trade-off because the alternative is silently clipping the tail.
    const splitOversizedBlock = (blockEl, maxHeightPx) => {
      const tag = blockEl.tagName.toLowerCase();
      const styleAttr = blockEl.getAttribute('style') ? ` style="${blockEl.getAttribute('style').replace(/"/g, '&quot;')}"` : '';
      const classAttr = blockEl.className ? ` class="${blockEl.className}"` : '';
      const fullText = blockEl.textContent || '';
      if (!fullText.trim()) return [blockEl.outerHTML];

      // Tokenise by whitespace, keeping word boundaries.
      const tokens = fullText.match(/\S+\s*/g) || [fullText];

      const probe = document.createElement(tag);
      if (styleAttr) probe.setAttribute('style', blockEl.getAttribute('style'));
      if (classAttr) probe.className = blockEl.className;
      measureDiv.appendChild(probe);

      const parts = [];
      let buffer = '';
      for (const tok of tokens) {
        probe.textContent = buffer + tok;
        const h = probe.getBoundingClientRect().height;
        if (h > maxHeightPx && buffer) {
          parts.push(`<${tag}${classAttr}${styleAttr}>${buffer.trim()}</${tag}>`);
          buffer = tok;
        } else {
          buffer = buffer + tok;
        }
      }
      if (buffer.trim()) {
        parts.push(`<${tag}${classAttr}${styleAttr}>${buffer.trim()}</${tag}>`);
      }
      measureDiv.removeChild(probe);
      return parts.length ? parts : [blockEl.outerHTML];
    };

    // Expand the block list so any block taller than the page limit is
    // pre-split into smaller pieces before the page-packing loop.
    const expandedBlocks = [];
    for (const block of Array.from(measureDiv.children)) {
      const h = block.getBoundingClientRect().height;
      // Use the smaller (first-page) limit as the worst-case threshold for
      // splitting — a block we'd split for page 2+ might also be needed for
      // page 1, and we need it to fit in the worst case.
      const splitThreshold = Math.min(FIRST_PAGE_CONTENT_PX, PAGE_CONTENT_PX);
      if (h > splitThreshold) {
        // Render each split piece individually back into the measureDiv so
        // we can measure the actual pieces in the next loop.
        const pieces = splitOversizedBlock(block, splitThreshold);
        const tmp = document.createElement('div');
        tmp.innerHTML = pieces.join('');
        for (const piece of Array.from(tmp.children)) {
          expandedBlocks.push(piece);
        }
      } else {
        expandedBlocks.push(block);
      }
    }
    // Re-populate measureDiv with the expanded set so subsequent height reads
    // reflect the post-split layout.
    measureDiv.innerHTML = '';
    expandedBlocks.forEach(b => measureDiv.appendChild(b));

    const chunks = [];
    let currHTML = '';
    let currH = 0;
    let isFirst = true;

    for (const block of Array.from(measureDiv.children)) {
      const h = block.getBoundingClientRect().height;
      const limit = isFirst ? FIRST_PAGE_CONTENT_PX : PAGE_CONTENT_PX;
      if (currHTML && currH + h > limit) {
        chunks.push(currHTML);
        currHTML = block.outerHTML;
        currH = h;
        isFirst = false;
      } else {
        currHTML += block.outerHTML;
        currH += h;
      }
    }
    if (currHTML) chunks.push(currHTML);

    measureDiv.remove();
    const pageCount = chunks.length ? chunks.length : 1;
    console.log(`[ReportPreview] Pagination complete: ${pageCount} pages created`);
    console.log(`[ReportPreview] Pages array:`, chunks);
    setPages(chunks.length ? chunks : ['']);
  }, [isOpen, reportContent, protocol, savedMetadata, fullAppointment]);

  if (!isOpen) return null;

  // Extract content
  const { mode, text, data, impression, advice, isFinalized } = reportContent;

  const isPlain = !protocol?.letterheadBlobUrl;
  console.log(`[ReportPreview] Scenario Mode: ${isPlain ? 'PLAIN_HEADER' : 'LETTERHEAD_BINDING'}`);
  console.log(`[ReportPreview] Total pages to render: ${pages.length}`);
  
  // Honor protocol.fontSize when provided; fall back per scenario
  const baseFontSize = protocol?.fontSize || (isPlain ? 12 : 14);

  // Surgical Margin Resolution (mm to style) — drives both preview & print.
  // Honor protocol-configured margins in both modes (?? so an explicit 0 is
  // respected). Fall back to sensible defaults only when the setting is unset:
  // blank A4 → 20mm uniform; letterhead → 45mm top to clear typical header art.
  const topMm    = protocol?.headerMargin ?? (isPlain ? 20 : 45);
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
    const _ptName  = (fullAppointment?.patientName || '').toUpperCase() || '—';
    const _ptId    = fullAppointment?.patientIdentifier || fullAppointment?.ptid || fullAppointment?.id || '—';
    const _ptAge   = fullAppointment?.patientAge || fullAppointment?.age || '—';
    const _ptSex   = fullAppointment?.patientGender || fullAppointment?.gender || '—';
    const _ptSvc   = fullAppointment?.service || fullAppointment?.modality || '—';
    const _ptMod   = fullAppointment?.modality || '—'; // used by thank-you line
    const _ptRef   = fullAppointment?.referredBy || 'Self';
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
          <div style="font-size: 10.5px; color: #475569; margin-top: 3px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span><span style="color: #94a3b8; font-weight: 700;">ID</span> <strong style="color: #0f172a;">${_ptId}</strong></span>
            <span style="color: #cbd5e1;">·</span>
            <span><strong style="color: #0f172a;">${_ptAge}</strong> / <strong style="color: #0f172a;">${_ptSex}</strong></span>
            <span style="color: #cbd5e1;">·</span>
            <span style="color: #0f52ba; font-weight: 700;">${_ptSvc}</span>
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
      <div style="
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
          overflow: hidden;
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
      alert('Failed to download PDF. Please try again.');
    }
  };

  const handlePrintInNewWindow = () => {
    // Use the same helper function to generate complete pages
    const pagesHtml = pages.map((pageHTML, pageIdx) => generatePageHtml(pageHTML, pageIdx)).join('');

    // Create print document with full styling
    const printContent = `
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
          .report-content,
          .print-container {
            font-family: "Calibri", "Segoe UI", -apple-system, sans-serif;
            font-size: 12pt;
            line-height: 1.6;
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
          .report-content li { margin: 3px 0; line-height: 1.6; }
          .report-content li p { margin: 0; }
          .report-content table { border-collapse: collapse; width: 100%; margin: 14px 0; border: 1px solid #c8c8c8; }
          .report-content th { background: #d6e4f7; font-weight: 700; text-align: left; padding: 8px 12px; border: 1px solid #c8c8c8; font-size: 11pt; color: #1f3864; }
          .report-content td { padding: 7px 12px; border: 1px solid #c8c8c8; vertical-align: top; font-size: 11pt; }
          .report-content img { max-width: 100%; height: auto; display: block; margin: 14px 0; }
          .report-content hr { border: none; border-top: 1px solid #c8c8c8; margin: 20px 0; }
          .report-content blockquote { border-left: 3px solid #4472c4; padding-left: 16px; margin: 12px 0; color: #555; font-style: italic; }
          .report-content a { color: #0078d4; text-decoration: underline; }
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

    // Open in new window
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) {
      alert('Pop-up was blocked. Please allow pop-ups for this site and try again.');
      return;
    }

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    // Print is triggered by the inline window.addEventListener('load', ...) script
    // injected into the print HTML above — no more race-condition setTimeout here.
  };

  const handleWhatsAppShare = () => {
    const mobile = fullAppointment?.patientMobile || fullAppointment?.mobile;
    if (!mobile) {
      alert("No patient mobile number found for this appointment.");
      return;
    }

    const reportUrl = `${window.location.origin}/track/${appointmentId}`;
    const message = `Hello ${fullAppointment?.patientName},\n\nYour Diagnostic Report for ${fullAppointment?.service || 'the clinical study'} is now available.\n\n📄 View/Download Report: ${reportUrl}\n\nThank you for choosing ${fullAppointment?.hospitalName || '1Rad Diagnostic Center'}.`;
    
    const encoded = encodeURIComponent(message);
    const cleanedMobile = mobile.replace(/\D/g, '');
    const finalMobile = cleanedMobile.length === 10 ? `91${cleanedMobile}` : cleanedMobile;
    
    window.open(`https://wa.me/${finalMobile}?text=${encoded}`, '_blank');
  };

  const modalContent = (
    <div className="modal-overlay" style={{ background: 'rgba(10, 22, 40, 0.98)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0, backdropFilter: 'blur(10px)' }}>
      <div style={{ width: '100vw', height: '100vh', background: '#0a1628', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="preview-header" style={{ 
          padding: '12px 25px', 
          background: 'rgba(15, 23, 42, 0.95)', 
          backdropFilter: 'blur(20px)', 
          color: 'white', 
          display: 'flex', 
          flexDirection: window.innerWidth < 768 ? 'column' : 'row',
          justifyContent: 'space-between', 
          alignItems: window.innerWidth < 768 ? 'flex-start' : 'center', 
          borderBottom: '1px solid rgba(255,255,255,0.1)', 
          zIndex: 100,
          gap: '15px',
          boxShadow: '0 4px 30px rgba(0,0,0,0.5)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
             <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer', padding: '5px' }}>✕</button>
             <div style={{ width: '1px', height: '30px', background: 'rgba(255,255,255,0.1)' }} />
             <div>
              <h3 style={{ fontSize: '11px', fontWeight: 950, letterSpacing: '3px', margin: 0, color: '#3b82f6', textTransform: 'uppercase' }}>Diagnostic Signal Preview</h3>
              <div style={{ fontSize: '9px', opacity: 0.5, marginTop: '2px', fontWeight: 700 }}>
                {loadingProtocol ? 'SYNCHRONIZING_BRANDING...' : `MODE: ${mode?.toUpperCase()} • STATUS: ${isFinalized ? 'AUTHENTICATED' : 'DRAFT_RECON'}`}
              </div>
             </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {/* Zoom Controls */}
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <button onClick={() => setSheetScale(s => Math.max(0.3, s - 0.1))} style={{ background: 'none', border: 'none', color: 'white', width: '30px', height: '30px', cursor: 'pointer', fontWeight: 900 }}>−</button>
              <div style={{ fontSize: '10px', fontWeight: 950, width: '45px', textAlign: 'center', color: '#60a5fa' }}>{Math.round(sheetScale * 100)}%</div>
              <button onClick={() => setSheetScale(s => Math.min(2, s + 0.1))} style={{ background: 'none', border: 'none', color: 'white', width: '30px', height: '30px', cursor: 'pointer', fontWeight: 900 }}>+</button>
            </div>

            <div style={{ display: 'flex', gap: '8px', width: window.innerWidth < 768 ? '100%' : 'auto', flexWrap: 'wrap' }}>
              <button 
                className="btn-preview-action" 
                style={{ flex: 1, background: 'rgba(37, 211, 102, 0.15)', border: '1px solid rgba(37, 211, 102, 0.3)', color: '#25d366', padding: '10px 18px', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '11px', transition: 'all 0.2s' }} 
                onClick={handleWhatsAppShare}
              >
                <span>💬</span> {window.innerWidth > 600 ? 'WHATSAPP_SECURE' : 'SHARE'}
              </button>
              <button 
                className="btn-preview-action" 
                style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '10px 18px', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '11px', transition: 'all 0.2s' }} 
                onClick={handleDownload}
              >
                <span>📥</span> {window.innerWidth > 600 ? 'DOWNLOAD_PDF' : 'PDF'}
              </button>
              <button className="btn-preview-primary" style={{ flex: 1, background: '#0f52ba', border: 'none', color: 'white', padding: '10px 22px', borderRadius: '10px', fontWeight: 950, cursor: 'pointer', fontSize: '11px', boxShadow: '0 4px 15px rgba(15, 82, 186, 0.4)', transition: 'all 0.2s' }} onClick={handlePrintInNewWindow}>🖨️ {window.innerWidth > 600 ? 'AUTHENTIC_PRINT' : 'PRINT'}</button>
            </div>
          </div>
        </div>
        
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
              const showLetterhead = !!resolvedAssetUrl && (pageIdx === 0 || protocol?.overflowBackgroundMode === 'REUSE');
              const isPdf = resolvedAssetUrl?.toLowerCase().includes('.pdf') || resolvedAssetUrl?.includes('type=pdf');
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
                  {/* Letterhead layer for this page */}
                  {showLetterhead && (
                    <div className="letterhead-container" style={{ position: 'absolute', top: 0, left: 0, width: '210mm', height: '297mm', zIndex: 1, pointerEvents: 'none', overflow: 'hidden' }}>
                      {isPdf ? (
                        <Document
                          file={resolvedAssetUrl}
                          onLoadSuccess={({ numPages }) => setNumPdfPages(numPages)}
                          onLoadError={(err) => console.error("[ReportPreview] PDF Load Error:", err)}
                          loading={pageIdx === 0 ? <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Initializing PDF Engine...</div> : null}
                        >
                          <Page
                            pageNumber={1}
                            width={794}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            renderMode="canvas"
                            className="pdf-page-canvas"
                          />
                        </Document>
                      ) : (
                        <img
                          src={resolvedAssetUrl}
                          style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
                          alt="Letterhead"
                          onError={(e) => { e.target.style.opacity = 0; e.target.style.height = 0; }}
                        />
                      )}
                    </div>
                  )}

                  {/* Per-page content area — sized to the safe zone.
                      Typography intentionally NOT overridden inline — the
                      .report-content class mirrors the editor's authored
                      typography so the preview matches the editor. */}
                  <div style={{
                    position: 'absolute',
                    top: m.top,
                    left: m.left,
                    right: m.right,
                    bottom: m.bottom,
                    zIndex: 2,
                    overflow: 'hidden',
                  }}>
                    {pageIdx === 0 && (
                      <PatientInfoBlock
                        appointmentId={appointmentId}
                        fullAppointment={fullAppointment}
                        savedMetadata={savedMetadata}
                      />
                    )}
                    <div className="report-content" dangerouslySetInnerHTML={{ __html: pageHTML }} />
                  </div>

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
    </div>
      <style>{`
        /* ───────────────────────────────────────────────────────────────
           .report-content — mirrors the NarrativeEditor's typography
           rules so the preview and print render with the same fonts,
           heading sizes, list/table styling, blockquotes, etc. that the
           doctor saw while authoring. Replaces the previous hard-coded
           overrides that made preview look completely different from
           the editor.
           ─────────────────────────────────────────────────────────────── */
        .report-content {
          font-family: "Calibri", "Segoe UI", -apple-system, sans-serif;
          font-size: 12pt;
          line-height: 1.6;
          color: #000000;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .report-content h1 {
          font-size: 26pt; font-weight: 700; line-height: 1.2;
          margin: 0 0 12px 0; color: #1f3864;
          border-bottom: 1px solid #4472c4; padding-bottom: 4px;
        }
        .report-content h2 {
          font-size: 20pt; font-weight: 700; line-height: 1.3;
          margin: 18px 0 8px 0; color: #2e4d7b;
        }
        .report-content h3 {
          font-size: 16pt; font-weight: 600; line-height: 1.4;
          margin: 14px 0 6px 0; color: #2e4d7b;
        }
        .report-content h4 {
          font-size: 14pt; font-weight: 600; line-height: 1.4;
          margin: 12px 0 4px 0; color: #374151;
        }
        .report-content p { margin: 0 0 8px 0; }
        .report-content ul, .report-content ol {
          padding-left: 28px; margin: 6px 0 10px;
        }
        .report-content li { margin: 3px 0; line-height: 1.6; }
        .report-content li p { margin: 0; }
        .report-content table {
          border-collapse: collapse; width: 100%;
          margin: 14px 0; border: 1px solid #c8c8c8;
        }
        .report-content th {
          background: #d6e4f7; font-weight: 700; text-align: left;
          padding: 8px 12px; border: 1px solid #c8c8c8;
          font-size: 11pt; color: #1f3864;
        }
        .report-content td {
          padding: 7px 12px; border: 1px solid #c8c8c8;
          vertical-align: top; font-size: 11pt;
        }
        .report-content img {
          max-width: 100%; height: auto;
          display: block; margin: 14px 0;
        }
        .report-content hr {
          border: none; border-top: 1px solid #c8c8c8; margin: 20px 0;
        }
        .report-content code {
          background: #f3f2f1; padding: 1px 5px; border-radius: 3px;
          font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
          font-size: 10.5pt; color: #c7254e;
        }
        .report-content pre {
          background: #1e1e1e; color: #d4d4d4;
          padding: 16px 20px; border-radius: 4px;
          overflow-x: auto; margin: 14px 0; font-size: 10pt;
        }
        .report-content pre code { background: transparent; padding: 0; color: inherit; font-size: inherit; }
        .report-content blockquote {
          border-left: 3px solid #4472c4; padding-left: 16px;
          margin: 12px 0; color: #555; font-style: italic;
        }
        .report-content a { color: #0078d4; text-decoration: underline; }

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
              overflow: 'hidden',
            }}>
              {pageIdx === 0 && (
                <PatientInfoBlock
                  appointmentId={appointmentId}
                  fullAppointment={fullAppointment}
                  savedMetadata={savedMetadata}
                />
              )}
              <div className="report-content" dangerouslySetInnerHTML={{ __html: pageHTML }} />
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
            page-break-inside: avoid;
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
