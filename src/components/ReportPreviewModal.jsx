import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import apiClient, { BASE_URL } from '../api/apiClient';
import { Document, Page, pdfjs } from 'react-pdf';
import { QRCodeCanvas } from 'qrcode.react';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

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
      const availableWidth = window.innerWidth - padding;
      const availableHeight = window.innerHeight - 150; // Accounting for header
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
        <div style={{ padding: '20px 40px', background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(20px)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
             <div style={{ width: '40px', height: '40px', background: '#0f52ba', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📄</div>
             <div>
              <h3 style={{ fontSize: '13px', fontWeight: 950, letterSpacing: '2px', margin: 0, color: '#60a5fa' }}>DIAGNOSTIC_REPORT_PREVIEW</h3>
              <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '2px' }}>
                Protocol: {loadingProtocol ? 'LOADING...' : (protocol ? 'INSTITUTIONAL_READY' : 'DEFAULT_LAYOUT')} • Mode: {mode?.toUpperCase()}
              </div>
             </div>
          </div>
          <div style={{ display: 'flex', gap: '15px' }}>
            <button 
              className="btn" 
              style={{ background: 'rgba(37, 211, 102, 0.1)', border: '1px solid rgba(37, 211, 102, 0.2)', color: '#25d366', padding: '12px 20px', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }} 
              onClick={handleWhatsAppShare}
            >
              <span>💬</span> WHATSAPP
            </button>
            <button 
              className="btn" 
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '12px 20px', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }} 
              onClick={handleDownload}
            >
              <span>📥</span> DOWNLOAD
            </button>
            <button className="btn btn-primary" style={{ background: '#0f52ba', border: 'none', padding: '12px 25px', borderRadius: '12px', fontWeight: 900, cursor: 'pointer' }} onClick={() => window.print()}>🖨️ PRINT_FINAL</button>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '12px 25px', borderRadius: '12px', cursor: 'pointer', fontWeight: 900 }}>CLOSE</button>
          </div>
        </div>
        
        <div style={{ flex: 1, background: '#0f172a', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div id="printable-report" style={{ 
            width: '210mm', 
            minHeight: '297mm', 
            background: 'white', 
            boxShadow: '0 50px 100px rgba(0,0,0,0.5)', 
            color: protocol?.fontColor || '#1e293b',
            fontFamily: protocol?.fontFamily || 'Arial, sans-serif',
            position: 'relative',
            overflow: 'hidden',
            transform: `scale(${sheetScale})`,
            transformOrigin: 'center center'
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
                    onLoadError={(err) => console.error("[ReportPreview] PDF Load Error:", err)}
                    loading={<div />}
                  >
                    <Page 
                      pageNumber={1} 
                      width={794} 
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      renderMode="svg"
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
                {mode !== 'Narrative Editor' && (
                  <div style={{ fontSize: '10px', fontWeight: 950, color: protocol?.fontColor || '#0f52ba', marginBottom: '12px', letterSpacing: '1px', borderBottom: '1px solid rgba(15, 82, 186, 0.1)', paddingBottom: '4px' }}>CLINICAL FINDINGS:</div>
                )}
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
          button, .modal-header, .btn, .modal-overlay > div > div:first-child {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ReportPreviewModal;
