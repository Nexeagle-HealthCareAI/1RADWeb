import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';

const ReportPreviewModal = ({ 
  isOpen, 
  onClose, 
  doctorId, 
  patientData, 
  reportContent 
}) => {
  const [protocol, setProtocol] = useState(null);
  const [loadingProtocol, setLoadingProtocol] = useState(false);

  useEffect(() => {
    if (isOpen && doctorId) {
      const fetchProtocol = async () => {
        setLoadingProtocol(true);
        try {
          console.info(`[ReportPreview] Fetching Branding Protocol for Doctor: ${doctorId}`);
          const res = await apiClient.get(`/Prescription/${doctorId}`);
          if (res.data?.success) {
            setProtocol(res.data.data);
          }
        } catch (err) {
          console.error("[ReportPreview] Branding Sync failed:", err);
        } finally {
          setLoadingProtocol(false);
        }
      };
      fetchProtocol();
    }
  }, [isOpen, doctorId]);

  if (!isOpen) return null;

  // Extract content
  const { mode, text, data, impression, advice, isFinalized } = reportContent;

  let bodyContent = '';
  // Use institutional font settings for content
  const contentStyle = `font-size: ${protocol?.fontSize || 12}px; line-height: 1.6; color: ${protocol?.fontColor || '#1e293b'}; font-family: ${protocol?.fontFamily || 'inherit'};`;

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
    top: (protocol?.headerMargin || 40) + 'mm',
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

            {/* Letterhead Layer (Z-Index 1: Foundation) */}
            {protocol?.letterheadBlobUrl && (
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }}>
                { (protocol.letterheadBlobUrl.toLowerCase().includes('.pdf') || protocol.letterheadBlobUrl.includes('type=pdf')) ? (
                  <iframe 
                    src={`${protocol.letterheadBlobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title="Institutional Letterhead"
                  />
                ) : (
                  <div style={{ 
                    width: '100%', 
                    height: '100%', 
                    backgroundImage: `url(${protocol.letterheadBlobUrl})`,
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat'
                  }}></div>
                )
                }
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
                <div style={{ padding: '10px', borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>PATIENT NAME</span> <br/><strong style={{fontSize: '12px'}}>{patientData?.patientName?.toUpperCase() || ''}</strong></div>
                <div style={{ padding: '10px', borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>AGE / SEX</span> <br/><strong>{patientData?.patientAge || ''} / {patientData?.patientGender || ''}</strong></div>
                <div style={{ padding: '10px', borderBottom: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>PATIENT ID</span> <br/><strong>{patientData?.patientIdentifier || ''}</strong></div>
                <div style={{ padding: '10px', borderRight: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>STUDY TYPE</span> <br/><strong>{patientData?.service || ''}</strong></div>
                <div style={{ padding: '10px', borderRight: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>DATE</span> <br/><strong>{patientData?.dateTime ? new Date(patientData.dateTime).toLocaleDateString() : ''}</strong></div>
                <div style={{ padding: '10px' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>REFERRED BY</span> <br/><strong>{patientData?.referredBy || ''}</strong></div>
              </div>

              {/* Report Findings Matrix */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '10px', fontWeight: 950, color: protocol?.fontColor || '#0f52ba', marginBottom: '12px', letterSpacing: '1px', borderBottom: '1px solid rgba(15, 82, 186, 0.1)', paddingBottom: '4px' }}>CLINICAL FINDINGS:</div>
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

              {/* Professional Signatory Block */}
              <div style={{ marginTop: '60px', display: 'flex', justifyContent: 'flex-end' }}>
                 <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '200px', borderBottom: `1px solid ${protocol?.fontColor || '#1e293b'}`, marginBottom: '10px', opacity: 0.3 }}></div>
                    <div style={{ fontWeight: 950, fontSize: '12px', color: protocol?.fontColor || '#1e293b' }}>
                      { (protocol?.doctor?.fullName || protocol?.doctor?.name || '').toUpperCase() }
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>
                      {protocol?.doctor?.specialization || ''}
                    </div>
                    <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '3px' }}>
                       {protocol?.doctor?.degree} {protocol?.doctor?.licenseNo ? `• Reg No: ${protocol.doctor.licenseNo}` : ''}
                    </div>
                 </div>
              </div>

              {/* Audit & Compliance Footer */}
              <div style={{ marginTop: 'auto', paddingTop: '20px', fontSize: '8px', color: '#cbd5e1', textAlign: 'center', borderTop: '1px solid #f1f5f9', letterSpacing: '0.5px' }}>
                 ID: {patientData?.displayId || patientData?.appointmentId} • Electronic Diagnostic Record • Verified
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-report, #printable-report * { visibility: visible; }
          #printable-report { position: fixed; left: 0; top: 0; width: 100%; height: 100%; margin: 0; padding: 0; box-shadow: none; }
          .modal-overlay { background: white !important; padding: 0 !important; }
        }
      `}</style>
    </div>
  </div>
  );
};

export default ReportPreviewModal;
