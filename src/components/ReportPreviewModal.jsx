import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import apiClient, { BASE_URL } from '../api/apiClient';
import { Document, Page, pdfjs } from 'react-pdf';
import { QRCodeCanvas } from 'qrcode.react';

// Configure PDF.js worker
// Configure PDF.js worker to use CDN for maximum reliability
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
      const targetDoctorId = doctorId || patientData?.doctorId || patientData?.doctorUserId || sessionStorage.getItem('1rad_doctor_id');
      console.log(`[ReportPreview] Syncing branding. Target Doctor: ${targetDoctorId || 'CURRENT_USER'}`);
      
      const fetchData = async () => {
        setLoadingProtocol(true);
        try {
          // 1. Fetch Branding & Signatory Profile (Authoritative Fallback)
          const brandingUrl = targetDoctorId ? `/Prescription/${targetDoctorId}` : `/Prescription/me`;
          const res = await apiClient.get(brandingUrl);
          if (res.data?.success) {
            console.info("[ReportPreview] Branding Data Received:", res.data.data);
            setProtocol(res.data.data);
          }

          // 2. Fetch Full Appointment Context (Enrich patientData)
          if (appointmentId) {
            console.info(`[ReportPreview] Synchronizing Context for Appointment: ${appointmentId}`);
            const appRes = await apiClient.get(`/appointments/${appointmentId}`); 
            // Handle both wrapped {success, data} and direct object responses
            const appData = appRes.data?.data || appRes.data;
            if (appData && typeof appData === 'object') {
              setFullAppointment(appData);
            }

            // 3. Fetch Saved Report Metadata (Finalization dates, etc.)
            const reportRes = await apiClient.get(`/Reporting/report/${appointmentId}`);
            const reportData = reportRes.data?.data || reportRes.data;
            if (reportData) setSavedMetadata(reportData);
          }
        } catch (err) {
          console.warn("[ReportPreview] Context sync partially failed:", err.message);
        } finally {
          setLoadingProtocol(false);
        }
      };
      fetchData();
    }
  }, [isOpen, doctorId, appointmentId, patientData]);


  const [sheetScale, setSheetScale] = useState(1);

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

  if (!isOpen) return null;

  // Extract content
  const { mode, text, data, impression, advice, isFinalized } = reportContent;

  const isPlain = !protocol?.letterheadBlobUrl;
  console.log(`[ReportPreview] Scenario Mode: ${isPlain ? 'PLAIN_HEADER' : 'LETTERHEAD_BINDING'}`);
  
  // Per User: "Form 14 size" interpreted as 14px base font for letterhead-bound reports
  const baseFontSize = isPlain ? (protocol?.fontSize || 12) : 14;
  const contentStyle = `font-size: ${baseFontSize}px; line-height: 1.6; color: ${protocol?.fontColor || '#1e293b'}; font-family: ${protocol?.fontFamily || 'inherit'};`;

  let bodyContent = '';


  if (!isPlain) {
    console.log(`[ReportPreview] Resolved Asset URL: ${resolvedAssetUrl}`);
    console.log(`[ReportPreview] Asset Type: ${resolvedAssetUrl?.toLowerCase().includes('.pdf') ? 'PDF_DOCUMENT' : 'IMAGE_ASSET'}`);
  }

  if (mode === 'Structured' && data) {
    bodyContent = Object.entries(data).map(([key, val]) => `
      <div style="margin-bottom: 25px; page-break-inside: avoid;">
        <div style="font-size: 10px; font-weight: 950; color: #64748b; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 1.5px; border-bottom: 1px solid #f1f5f9; padding-bottom: 2px;">${key.replace(/_/g, ' ')}</div>
        <div style="${contentStyle} white-space: pre-wrap;">${val}</div>
      </div>
    `).join('');
  } else {
    bodyContent = `<div style="${contentStyle}">${text || ''}</div>`;
  }

  // Surgical Margin Resolution (mm to style)
  const m = {
    top: isPlain ? '15mm' : (protocol?.headerMargin || 45) + 'mm',
    left: (protocol?.leftMargin || 20) + 'mm',
    right: (protocol?.rightMargin || 20) + 'mm',
    bottom: (protocol?.bottomMargin || 20) + 'mm'
  };

  const handleDownload = () => {
    window.print();
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
              <button className="btn-preview-primary" style={{ flex: 1, background: '#0f52ba', border: 'none', color: 'white', padding: '10px 22px', borderRadius: '10px', fontWeight: 950, cursor: 'pointer', fontSize: '11px', boxShadow: '0 4px 15px rgba(15, 82, 186, 0.4)', transition: 'all 0.2s' }} onClick={() => window.print()}>🖨️ {window.innerWidth > 600 ? 'AUTHENTIC_PRINT' : 'PRINT'}</button>
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
          {/* Scaled Wrapper to ensure scrollbars work with transform: scale */}
          <div style={{ 
            width: `${210 * sheetScale}mm`, 
            height: `${297 * sheetScale}mm`, 
            position: 'relative',
            flexShrink: 0
          }}>
            <div id="printable-report" style={{ 
              width: '210mm', 
              height: '297mm', 
              background: 'white', 
              boxShadow: '0 60px 120px rgba(0,0,0,0.8)', 
              color: protocol?.fontColor || '#1e293b',
              fontFamily: protocol?.fontFamily || 'Arial, sans-serif',
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `scale(${sheetScale})`,
              transformOrigin: 'top left',
              border: '1px solid #e2e8f0'
            }}>
            
            {/* WATERMARK FOR NON-FINALIZED */}
            {!isFinalized && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-45deg)', fontSize: '120px', color: 'rgba(241, 245, 249, 0.4)', fontWeight: 950, pointerEvents: 'none', zIndex: 1, letterSpacing: '20px', whiteSpace: 'nowrap' }}>
                 DRAFT_PREVIEW
              </div>
            )}

            {/* Letterhead Layer (Synchronized with PrescriptionModal Layout) */}
            {resolvedAssetUrl && (
              <div className="letterhead-container" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1, pointerEvents: 'none' }}>
                { (resolvedAssetUrl?.toLowerCase().includes('.pdf') || resolvedAssetUrl?.includes('type=pdf')) ? (
                    <Document
                      file={resolvedAssetUrl}
                      onLoadSuccess={({ numPages }) => setNumPdfPages(numPages)}
                      onLoadError={(err) => {
                        console.error("[ReportPreview] PDF Load Error:", err);
                        // If PDF fails, fallback to treat as image if possible or show error
                      }}
                      loading={<div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Initializing PDF Engine...</div>}
                    >
                      <Page 
                        pageNumber={1} 
                        width={794} 
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        renderMode="canvas" /* Canvas is more compatible than SVG on some browsers */
                        className="pdf-page-canvas"
                      />
                    </Document>
                ) : (
                  <img 
                    src={resolvedAssetUrl}
                    style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
                    alt="Letterhead"
                    onError={(e) => { 
                      e.target.style.opacity = 0; 
                      e.target.style.height = 0;
                      console.warn("[ReportPreview] Letterhead asset failed to load:", resolvedAssetUrl); 
                    }}
                  />
                )
                }
              </div>
            )}

            {/* Plain Header (Scenario 1: Fallback if no asset) */}
            {isPlain && (
              <div style={{ 
                position: 'absolute', top: '10mm', left: '20mm', right: '20mm', 
                borderBottom: '2px solid #0f52ba', paddingBottom: '10px', 
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'
              }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 950, color: '#0f52ba' }}>{fullAppointment?.hospitalName || 'DIAGNOSTIC CENTRE'}</div>
                  <div style={{ fontSize: '9px', color: '#64748b' }}>{fullAppointment?.hospitalAddress || 'Digital Medical Report'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                   <div style={{ fontSize: '10px', fontWeight: 700 }}>24/7 SUPPORT</div>
                   <div style={{ fontSize: '9px', color: '#64748b' }}>{fullAppointment?.hospitalPhone || ''}</div>
                </div>
              </div>
            )}

            {/* REPORT CONTENT OVERLAY */}
            <div style={{ 
              position: 'relative',
              zIndex: 2,
              paddingTop: m.top, 
              paddingLeft: m.left, 
              paddingRight: m.right, 
              paddingBottom: m.bottom,
              boxSizing: 'border-box',
              minHeight: '297mm',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Patient Information - Professional Readable Layout */}
              <div style={{ 
                display: 'flex', 
                gap: '30px',
                marginBottom: '35px',
                paddingBottom: '15px',
                borderBottom: '2px solid #0f52ba'
              }}>
                {/* QR ANCHOR */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ padding: '4px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                    <QRCodeCanvas 
                      value={`${window.location.origin}/track/${appointmentId}`}
                      size={55}
                      level="H"
                    />
                  </div>
                  <div style={{ fontSize: '7px', fontWeight: 950, color: '#0f52ba', marginTop: '4px' }}>SECURE_SCAN</div>
                </div>

                <div style={{ flex: 1 }}>
                  {/* Name & Date Line */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '10px' }}>
                    <div>
                      <span style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', letterSpacing: '1px', display: 'block' }}>PATIENT NAME</span>
                      <strong style={{ fontSize: '22px', color: '#0f172a' }}>{fullAppointment?.patientName?.toUpperCase() || 'NAME'}</strong>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', letterSpacing: '1px', display: 'block' }}>REPORT DATE</span>
                      <strong style={{ fontSize: '13px' }}>{savedMetadata?.finalizedAt ? new Date(savedMetadata.finalizedAt).toLocaleDateString() : new Date().toLocaleDateString()}</strong>
                    </div>
                  </div>

                  {/* Clinical Metadata Row */}
                  <div style={{ display: 'flex', gap: '30px', alignItems: 'center', background: '#f8fafc', padding: '8px 15px', borderRadius: '6px' }}>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '9px', fontWeight: 900 }}>PATIENT ID:</span>
                      <strong style={{ marginLeft: '8px', fontSize: '12px' }}>{fullAppointment?.patientIdentifier || fullAppointment?.ptid || fullAppointment?.id || '--'}</strong>
                    </div>
                    <div style={{ width: '1px', height: '12px', background: '#cbd5e1' }}></div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '9px', fontWeight: 900 }}>AGE / SEX:</span>
                      <strong style={{ marginLeft: '8px', fontSize: '12px' }}>{fullAppointment?.patientAge || fullAppointment?.age || '--'} / {fullAppointment?.patientGender || fullAppointment?.gender || '--'}</strong>
                    </div>
                    <div style={{ width: '1px', height: '12px', background: '#cbd5e1' }}></div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '9px', fontWeight: 900 }}>STUDY:</span>
                      <strong style={{ marginLeft: '8px', fontSize: '12px' }}>{fullAppointment?.service || fullAppointment?.modality || '--'}</strong>
                    </div>
                  </div>
                  
                  {/* Referral Line */}
                  <div style={{ marginTop: '8px', paddingLeft: '15px' }}>
                    <span style={{ color: '#64748b', fontSize: '9px', fontWeight: 900 }}>REFERRED BY:</span>
                    <strong style={{ marginLeft: '8px', fontSize: '11px', fontStyle: 'italic' }}>{fullAppointment?.referredBy || 'Self'}</strong>
                  </div>
                </div>
              </div>

              {/* Report Findings Matrix */}
              <div style={{ flex: 1 }}>

                <div dangerouslySetInnerHTML={{ __html: bodyContent }} />
                
                {/* Final Conclusion (Impression) */}
                {impression && (
                  <div style={{ marginTop: '35px', background: 'rgba(15, 82, 186, 0.02)', padding: '15px 20px', borderRadius: '6px', borderLeft: `4px solid ${protocol?.fontColor || '#0f52ba'}` }}>
                    <div style={{ fontSize: '10px', fontWeight: 950, color: protocol?.fontColor || '#0f52ba', marginBottom: '6px', letterSpacing: '1px' }}>IMPRESSION:</div>
                    <div style={{ 
                      fontSize: (protocol?.fontSize || 13) + 'px', 
                      fontWeight: 900, 
                      color: protocol?.fontColor || '#1e293b',
                      lineHeight: '1.5'
                    }}>
                      {impression}
                    </div>
                  </div>
                )}
                
                {/* Clinical Advice */}
                {advice && (
                  <div style={{ marginTop: '20px', paddingLeft: '20px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', marginBottom: '4px', letterSpacing: '1px' }}>ADVICE:</div>
                    <div style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>{advice}</div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 0 !important;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box !important;
          }

          body {
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
          }

          /* Total Isolation */
          #root, .dashboard-layout, .workspace-container, .top-nav, .sidebar {
            display: none !important;
          }

          .modal-overlay {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }

          #printable-report {
            width: 210mm !important;
            min-height: 297mm !important;
            background: white !important;
            position: relative !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            transform: none !important;
            transform-origin: top left !important;
          }

          /* Letterhead Continuity */
          .letterhead-container {
            position: ${protocol?.overflowBackgroundMode === 'REUSE' ? 'fixed' : 'absolute'} !important;
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

          /* Reset all containers */
          .modal-overlay > div,
          .modal-overlay > div > div {
            width: 210mm !important;
            height: auto !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            box-shadow: none !important;
            border: none !important;
          }

          /* Hide UI */
          button, .modal-header, .btn, .preview-header, .modal-overlay > div > div:first-child {
            display: none !important;
          }

          /* Force exact dimensions */
          #printable-report {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
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

  return createPortal(modalContent, document.body);
};

export default ReportPreviewModal;
