import React, { useState, useEffect } from 'react';
import apiClient, { BASE_URL } from '../api/apiClient';

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
            if (appRes.data?.success) setFullAppointment(appRes.data.data);

            // 3. Fetch Saved Report Metadata (Finalization dates, etc.)
            const reportRes = await apiClient.get(`/Reporting/report/${appointmentId}`);
            if (reportRes.data?.success) setSavedMetadata(reportRes.data.data);
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

  if (!isOpen) return null;

  // Extract content
  const { mode, text, data, impression, advice, isFinalized } = reportContent;

  const isPlain = !protocol?.letterheadBlobUrl;
  console.log(`[ReportPreview] Scenario Mode: ${isPlain ? 'PLAIN_HEADER' : 'LETTERHEAD_BINDING'}`);
  
  // Per User: "Form 14 size" interpreted as 14px base font for letterhead-bound reports
  const baseFontSize = isPlain ? (protocol?.fontSize || 12) : 14;
  const contentStyle = `font-size: ${baseFontSize}px; line-height: 1.6; color: ${protocol?.fontColor || '#1e293b'}; font-family: ${protocol?.fontFamily || 'inherit'};`;

  let bodyContent = '';

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

  return (
    <div className="modal-overlay" style={{ background: 'rgba(10, 22, 40, 0.98)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0, padding: '40px', backdropFilter: 'blur(10px)' }}>
      <div style={{ width: '950px', height: '100%', background: '#f8fafc', borderRadius: '32px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ padding: '25px 40px', background: '#0a1628', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
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
            <button className="btn btn-primary" style={{ background: '#0f52ba', border: 'none', padding: '12px 25px', borderRadius: '12px', fontWeight: 900, cursor: 'pointer' }} onClick={() => window.print()}>🖨️ PRINT_FINAL</button>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '12px 25px', borderRadius: '12px', cursor: 'pointer', fontWeight: 900 }}>CLOSE</button>
          </div>
        </div>
        
        <div style={{ flex: 1, padding: '40px', background: '#e2e8f0', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
          <div id="printable-report" style={{ 
            width: '210mm', 
            minHeight: '297mm', 
            background: 'white', 
            boxShadow: '0 30px 60px rgba(0,0,0,0.15)', 
            color: protocol?.fontColor || '#1e293b',
            fontFamily: protocol?.fontFamily || 'Arial, sans-serif',
            position: 'relative',
            overflow: 'hidden'
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
                  <embed 
                    src={`${resolvedAssetUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                    type="application/pdf"
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
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
              {/* Patient Information Matrix */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0', background: '#fff', borderRadius: '4px', marginBottom: '35px', border: '1px solid #f1f5f9', fontSize: '11px' }}>
                <div style={{ padding: '10px', borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>PATIENT NAME</span> <br/><strong style={{fontSize: '12px'}}>{fullAppointment?.patientName?.toUpperCase() || ''}</strong></div>
                <div style={{ padding: '10px', borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>AGE / SEX</span> <br/><strong>{fullAppointment?.patientAge || ''} / {fullAppointment?.patientGender || ''}</strong></div>
                <div style={{ padding: '10px', borderBottom: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>PATIENT ID</span> <br/><strong>{fullAppointment?.patientIdentifier || ''}</strong></div>
                <div style={{ padding: '10px', borderRight: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>STUDY TYPE</span> <br/><strong>{fullAppointment?.service || fullAppointment?.modality || ''}</strong></div>
                <div style={{ padding: '10px', borderRight: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>REPORT DATE</span> <br/><strong>{savedMetadata?.finalizedAt ? new Date(savedMetadata.finalizedAt).toLocaleDateString() : new Date().toLocaleDateString()}</strong></div>
                <div style={{ padding: '10px' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>REFERRED BY</span> <br/><strong>{fullAppointment?.referredBy || 'Self'}</strong></div>
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
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            background: white !important;
            visibility: hidden;
          }
          #printable-report, #printable-report * {
            visibility: visible;
          }
          #printable-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
          }
          .letterhead-container {
            position: ${protocol?.overflowBackgroundMode === 'REUSE' ? 'fixed' : 'absolute'} !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: ${protocol?.overflowBackgroundMode === 'REUSE' ? 'auto' : '0'} !important;
            height: 297mm !important;
            width: 210mm !important;
            z-index: 1 !important;
            pointer-events: none !important;
            display: block !important;
          }
          .modal-overlay { 
            background: white !important; 
            padding: 0 !important;
            position: static !important;
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
};

export default ReportPreviewModal;
