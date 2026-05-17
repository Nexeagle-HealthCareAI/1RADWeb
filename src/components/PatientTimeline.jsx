import React, { useState } from 'react';

/**
 * PatientTimeline
 * A high-fidelity, medical-grade vertical timeline for tracking patient diagnostic history.
 * Designed for use within the ReportingPage.
 */
const PatientTimeline = ({ 
  history = [], 
  loading = false, 
  onViewReport, 
  onViewDicom,
  activeAppointmentId = null 
}) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [expandedId, setExpandedId] = useState(null);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
        <div className="timeline-spinner" />
        <div style={{ marginTop: '15px', fontSize: '11px', fontWeight: 950, letterSpacing: '1px' }}>SYNCHRONIZING_PATIENT_HISTORY...</div>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div style={{ padding: '60px 40px', textAlign: 'center', background: '#f8fafc', borderRadius: '24px', border: '2px dashed #e2e8f0' }}>
        <div style={{ fontSize: '24px', marginBottom: '15px' }}>📋</div>
        <div style={{ fontSize: '12px', fontWeight: 950, color: '#64748b', letterSpacing: '0.5px' }}>NO_HISTORICAL_RECORDS_FOUND</div>
        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px' }}>This appears to be the patient's first visit to the facility.</div>
      </div>
    );
  }

  return (
    <div className="patient-timeline" style={{ padding: isMobile ? '10px' : '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Timeline Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px' }}>
        <div>
          <h3 style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>Diagnostic_Timeline</h3>
          <div style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b' }}>SEQUENTIAL_STUDY_LEDGER</div>
        </div>
        <div style={{ background: '#0f52ba', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '10px', fontWeight: 950 }}>
          {history.length} RECORDS
        </div>
      </div>

      <div style={{ position: 'relative', paddingLeft: '30px', marginTop: '10px' }}>
        {/* Vertical Line */}
        <div style={{ 
          position: 'absolute', left: '11px', top: '5px', bottom: '5px', 
          width: '2px', background: 'linear-gradient(180deg, #0f52ba 0%, #e2e8f0 100%)',
          borderRadius: '1px'
        }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {history.map((study, idx) => {
            const studyId = study.appointmentId || study.AppointmentId || study.id || study.Id;
            const isActive = activeAppointmentId === studyId;
            const isExpanded = expandedId === studyId;
            const date = new Date(study.appointmentDate || study.AppointmentDate || study.dateTime || study.DateTime);
            const formattedDate = date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
            
            return (
              <div key={studyId || idx} style={{ position: 'relative' }}>
                {/* Timeline Dot */}
                <div style={{ 
                  position: 'absolute', left: '-24px', top: '6px',
                  width: '12px', height: '12px', borderRadius: '50%',
                  background: isActive ? '#0f52ba' : 'white',
                  border: `3px solid ${isActive ? 'white' : '#cbd5e1'}`,
                  boxShadow: isActive ? '0 0 0 3px rgba(15, 82, 186, 0.2)' : 'none',
                  zIndex: 2, transition: 'all 0.3s ease'
                }} />

                <div 
                  onClick={() => setExpandedId(isExpanded ? null : studyId)}
                  style={{ 
                    background: isActive ? '#f0f7ff' : 'white',
                    borderRadius: '16px', border: `1px solid ${isActive ? '#bfdbfe' : '#e2e8f0'}`,
                    padding: isMobile ? '15px' : '20px',
                    boxShadow: isActive ? '0 10px 25px -5px rgba(15, 82, 186, 0.1)' : '0 4px 12px rgba(0,0,0,0.02)',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '9px', fontWeight: 950, color: 'white', background: '#334155', padding: '3px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>
                          {study.modality || study.Modality || 'UNKN'}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>{formattedDate}</span>
                        {(study.assetCount > 0 || study.AssetCount > 0) && (
                          <span style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', background: '#dbeafe', padding: '3px 8px', borderRadius: '6px' }}>
                            {study.assetCount || study.AssetCount} IMAGES
                          </span>
                        )}
                        {(study.status === 'REPORTED' || study.Status === 'REPORTED') && (
                          <span style={{ fontSize: '9px', fontWeight: 950, color: '#059669', background: '#d1fae5', padding: '3px 8px', borderRadius: '6px' }}>REPORTED</span>
                        )}
                      </div>
                      <h4 style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b', margin: 0 }}>
                        {study.procedureName || study.ProcedureName || study.service || study.Service || 'Diagnostic Study'}
                      </h4>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                       {isActive && (
                         <span style={{ fontSize: '8px', fontWeight: 950, color: '#0f52ba', background: '#dbeafe', padding: '4px 8px', borderRadius: '6px' }}>CURRENT_SESSION</span>
                       )}
                       <span style={{ fontSize: '12px', color: '#94a3b8' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: '15px', padding: '15px', background: '#f8fafc', borderRadius: '12px', borderLeft: '4px solid #0f52ba', animation: 'fadeIn 0.3s ease' }}>
                        <div style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1px', marginBottom: '8px', textTransform: 'uppercase' }}>CLINICAL_IMPRESSION_PREVIEW</div>
                        <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.5', fontStyle: 'italic' }}>
                            {study.reportImpression || study.ReportImpression ? (
                              `"${study.reportImpression || study.ReportImpression}"`
                            ) : (
                              'No narrative impression available for this historical study.'
                            )}
                        </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '15px' }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onViewReport?.(study); }}
                      style={{ 
                        flex: isMobile ? 1 : 'none',
                        padding: '8px 16px', borderRadius: '8px', 
                        border: '1px solid #0f52ba', background: 'transparent', 
                        color: '#0f52ba', fontSize: '10px', fontWeight: 950, cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      VIEW_FULL_REPORT
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onViewDicom?.(study); }}
                      style={{ 
                        flex: isMobile ? 1 : 'none',
                        padding: '8px 16px', borderRadius: '8px', 
                        border: 'none', background: '#f1f5f9', 
                        color: '#475569', fontSize: '10px', fontWeight: 950, cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      VISUALIZE_DICOM
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .timeline-spinner {
          width: 30px; height: 30px; border: 3px solid #f3f3f3;
          border-top: 3px solid #0f52ba; border-radius: 50%;
          margin: 0 auto; animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .patient-timeline button:hover { opacity: 0.8; transform: translateY(-1px); }
        .patient-timeline button:active { transform: translateY(0px); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default PatientTimeline;
