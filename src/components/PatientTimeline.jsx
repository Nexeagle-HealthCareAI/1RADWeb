import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';

/**
 * PatientTimeline
 * A high-fidelity, medical-grade vertical timeline for tracking patient diagnostic history.
 * Designed for use within the ReportingPage with seamless inline reports and quick copy actions.
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
  const [loadedReports, setLoadedReports] = useState({}); // { [studyId]: { loading, data, error } }
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLoadReport = async (studyId) => {
    if (loadedReports[studyId]) return;

    // Check if the study already has the report pre-embedded from the dedicated timeline API
    const study = history.find(s => {
      const sId = s.appointmentId || s.AppointmentId || s.id || s.Id;
      return String(sId) === String(studyId);
    });

    if (study?.report) {
      console.info(`[TIMELINE COMPONENT] Found pre-embedded report for ${studyId}`);
      setLoadedReports(prev => ({
        ...prev,
        [studyId]: { loading: false, data: study.report, error: null }
      }));
      return;
    }

    setLoadedReports(prev => ({
      ...prev,
      [studyId]: { loading: true, data: null, error: null }
    }));

    try {
      const res = await apiClient.get(`/Reporting/report/${studyId}`);
      const body = res.data;
      const r = (body?.success && body?.data) ? body.data : body;
      
      setLoadedReports(prev => ({
        ...prev,
        [studyId]: { loading: false, data: r, error: null }
      }));
    } catch (err) {
      console.warn('[TIMELINE COMPONENT] Failed to fetch report:', err.message);
      setLoadedReports(prev => ({
        ...prev,
        [studyId]: { loading: false, data: null, error: 'Could not load historical report.' }
      }));
    }
  };

  const handleToggleExpand = (studyId) => {
    const nextExpanded = expandedId === studyId ? null : studyId;
    setExpandedId(nextExpanded);
    if (nextExpanded) {
      handleLoadReport(studyId);
    }
  };

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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {history.map((study, idx) => {
            const studyId = study.appointmentId || study.AppointmentId || study.id || study.Id;
            const isActive = String(activeAppointmentId) === String(studyId);
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
                  onClick={() => handleToggleExpand(studyId)}
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
                        {(study.status === 'REPORTED' || study.Status === 'REPORTED' || study.status === 'reported' || study.Status === 'reported') && (
                          <span style={{ fontSize: '9px', fontWeight: 950, color: '#059669', background: '#d1fae5', padding: '3px 8px', borderRadius: '6px' }}>REPORTED</span>
                        )}
                      </div>
                      <h4 style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b', margin: 0 }}>
                        {study.procedureName || study.ProcedureName || study.service || study.Service || 'Diagnostic Study'}
                      </h4>
                      {(study.referredBy || study.ReferredBy) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px', fontSize: '12px', fontWeight: 800, color: '#7c3aed' }}>
                          <span style={{ fontSize: '10px', fontWeight: 950, background: '#f5f3ff', color: '#7c3aed', padding: '2px 6px', borderRadius: '4px', border: '1px solid #ddd6fe' }}>↗ REFERRER</span>
                          <span>{study.referredBy || study.ReferredBy}</span>
                          {(study.referredContact || study.ReferredContact) && (
                            <span style={{ color: '#94a3b8', fontWeight: 500 }}>• {study.referredContact || study.ReferredContact}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                       {isActive && (
                         <span style={{ fontSize: '8px', fontWeight: 950, color: '#0f52ba', background: '#dbeafe', padding: '4px 8px', borderRadius: '6px' }}>CURRENT_SESSION</span>
                       )}
                       <span style={{ fontSize: '12px', color: '#94a3b8' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Inline Expanded Full Report Details */}
                  {isExpanded && (
                    <div 
                      onClick={(e) => e.stopPropagation()}
                      style={{ 
                        marginTop: '15px', 
                        padding: '16px', 
                        background: '#f8fafc', 
                        borderRadius: '12px', 
                        border: '1px solid #e2e8f0',
                        borderLeft: '4px solid #0f52ba', 
                        animation: 'fadeIn 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        cursor: 'default'
                      }}
                    >
                      {/* Loading State */}
                      {loadedReports[studyId]?.loading && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '11px', fontWeight: 900 }}>
                          <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid rgba(15,82,186,0.2)', borderTopColor: '#0f52ba', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          RETRIEVING FULL DIAGNOSTIC REPORT...
                        </div>
                      )}

                      {/* Error State */}
                      {loadedReports[studyId]?.error && (
                        <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 900 }}>
                          ⚠️ {loadedReports[studyId].error}
                        </div>
                      )}

                      {/* Loaded Report Details */}
                      {loadedReports[studyId]?.data && (() => {
                        const reportData = loadedReports[studyId].data;

                        const plainFindings = (() => {
                          try {
                            return Object.values(JSON.parse(reportData.findings)).join('\n\n');
                          } catch {
                            return reportData.findings || '';
                          }
                        })();
                        
                        const htmlFindings = (() => {
                          try {
                            return Object.values(JSON.parse(reportData.findings)).join('<br/>');
                          } catch {
                            return reportData.findings || '';
                          }
                        })();

                        const hasFindings = !!plainFindings;
                        const hasImpression = !!reportData.impression;

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            
                            {/* Findings Section */}
                            {hasFindings && (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                  <span style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', textTransform: 'uppercase' }}>HISTORICAL FINDINGS</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(plainFindings);
                                      setCopiedId(`findings-${studyId}`);
                                      setTimeout(() => setCopiedId(null), 2000);
                                    }}
                                    style={{
                                      background: copiedId === `findings-${studyId}` ? '#dcfce7' : '#eff6ff',
                                      border: `1px solid ${copiedId === `findings-${studyId}` ? '#bbf7d0' : '#bfdbfe'}`,
                                      borderRadius: '6px',
                                      color: copiedId === `findings-${studyId}` ? '#16a34a' : '#0f52ba',
                                      fontSize: '8px',
                                      fontWeight: 950,
                                      padding: '3px 8px',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s'
                                    }}
                                  >
                                    {copiedId === `findings-${studyId}` ? '✓ COPIED' : '⎘ COPY FINDINGS'}
                                  </button>
                                </div>
                                <div 
                                  style={{
                                    fontSize: '11px',
                                    color: '#334155',
                                    lineHeight: '1.6',
                                    background: 'white',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    maxHeight: '120px',
                                    overflowY: 'auto'
                                  }}
                                  dangerouslySetInnerHTML={{ __html: htmlFindings }}
                                />
                              </div>
                            )}

                            {/* Impression Section */}
                            {hasImpression && (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                  <span style={{ fontSize: '9px', fontWeight: 950, color: '#10b981', letterSpacing: '1px', textTransform: 'uppercase' }}>IMPRESSION</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(reportData.impression);
                                      setCopiedId(`imp-${studyId}`);
                                      setTimeout(() => setCopiedId(null), 2000);
                                    }}
                                    style={{
                                      background: copiedId === `imp-${studyId}` ? '#dcfce7' : '#f0fdf4',
                                      border: `1px solid ${copiedId === `imp-${studyId}` ? '#bbf7d0' : '#bbf7d0'}`,
                                      borderRadius: '6px',
                                      color: copiedId === `imp-${studyId}` ? '#16a34a' : '#16a34a',
                                      fontSize: '8px',
                                      fontWeight: 950,
                                      padding: '3px 8px',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s'
                                    }}
                                  >
                                    {copiedId === `imp-${studyId}` ? '✓ COPIED' : '⎘ COPY IMPRESSION'}
                                  </button>
                                </div>
                                <div style={{
                                  fontSize: '11px',
                                  color: '#0f172a',
                                  fontWeight: 900,
                                  lineHeight: '1.5',
                                  background: '#f0fdf4',
                                  padding: '12px',
                                  borderRadius: '8px',
                                  border: '1px solid #bbf7d0'
                                }}>
                                  {reportData.impression}
                                </div>
                              </div>
                            )}

                            {/* Advice Section */}
                            {reportData.advice && (
                              <div style={{ fontSize: '10px', color: '#64748b', fontStyle: 'italic' }}>
                                <strong>Advice:</strong> {reportData.advice}
                              </div>
                            )}

                            {/* Verification Badge */}
                            {reportData.isFinalized && (
                              <span style={{ alignSelf: 'flex-start', background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0', borderRadius: '4px', padding: '2px 6px', fontSize: '8px', fontWeight: 950 }}>
                                ✓ VERIFIED REPORT
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Fallback to simple local impression preview if not loaded or failed */}
                      {!loadedReports[studyId] && (
                        <div>
                          <div style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1px', marginBottom: '8px', textTransform: 'uppercase' }}>CLINICAL_IMPRESSION_PREVIEW</div>
                          <div style={{ fontSize: '12px', color: '#334155', lineHeight: '1.5', fontStyle: 'italic' }}>
                            {study.reportImpression || study.ReportImpression ? (
                              `"${study.reportImpression || study.ReportImpression}"`
                            ) : (
                              'No narrative impression preview available.'
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions Area */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '15px' }}>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        handleToggleExpand(studyId); 
                      }}
                      style={{ 
                        flex: isMobile ? 1 : 'none',
                        padding: '8px 16px', borderRadius: '8px', 
                        border: '1.5px solid #0f52ba', 
                        background: isExpanded ? '#eff6ff' : 'transparent', 
                        color: '#0f52ba', fontSize: '10px', fontWeight: 950, cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {isExpanded ? '🗁 HIDE INLINE REPORT' : '📄 VIEW INLINE REPORT'}
                    </button>
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); onViewDicom?.(study); }}
                      style={{ 
                        flex: isMobile ? 1 : 'none',
                        padding: '8px 16px', borderRadius: '8px', 
                        border: 'none', background: '#10b981', 
                        color: 'white', fontSize: '10px', fontWeight: 950, cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(16,185,129,0.15)',
                        transition: 'all 0.2s'
                      }}
                    >
                      🔍 VISUALIZE DICOM
                    </button>

                    {onViewReport && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onViewReport?.(study); }}
                        style={{ 
                          marginLeft: isMobile ? '0' : 'auto',
                          flex: isMobile ? 1 : 'none',
                          padding: '8px 12px', borderRadius: '8px', 
                          border: '1px solid #cbd5e1', background: '#f8fafc', 
                          color: '#64748b', fontSize: '10px', fontWeight: 800, cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        Dedicated Page ↗
                      </button>
                    )}
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
        .patient-timeline button:hover { opacity: 0.85; transform: translateY(-1px); }
        .patient-timeline button:active { transform: translateY(0px); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default PatientTimeline;
