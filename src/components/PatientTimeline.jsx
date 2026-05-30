import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import SavedReportViewer from './SavedReportViewer';

/**
 * PatientTimeline — premium vertical timeline of a patient's appointment history.
 *
 * Each entry shows: date · modality · service · referredBy and two clear status indicators
 * (whether a report exists and whether DICOM files were uploaded). Actions:
 *  - "View report" opens a modal popup with the historical report
 *  - "Open DICOM" hands the study off to the parent's DICOM viewer (full view)
 */
const PatientTimeline = ({
  history = [],
  loading = false,
  onViewDicom,
  activeAppointmentId = null,
}) => {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  // Selected study for the SavedReportViewer popup. The viewer does its own
  // report/appointment/protocol fetching, so we just hand it the study row.
  const [previewStudy, setPreviewStudy] = useState(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // (SavedReportViewer owns its own body-scroll lock while open.)

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getId = (s) => s.appointmentId || s.AppointmentId || s.id || s.Id;
  const getDate = (s) => new Date(s.appointmentDate || s.AppointmentDate || s.dateTime || s.DateTime);
  const getModality = (s) => s.modality || s.Modality || 'STUDY';
  const getService = (s) => s.procedureName || s.ProcedureName || s.service || s.Service || 'Diagnostic Study';
  const getReferrer = (s) => s.referredBy || s.ReferredBy || '';
  const getPatientName = (s) => s.patientName || s.PatientName || '';
  const getAssetCount = (s) => Number(s.assetCount || s.AssetCount || 0);
  const isReported = (s) => {
    const status = (s.status || s.Status || '').toLowerCase();
    return status === 'reported' || !!s.report || !!s.reportImpression || !!s.ReportImpression;
  };

  // ── Open report popup ────────────────────────────────────────────────────
  // The viewer fetches its own data — no eager pre-load needed here.
  const handleOpenReport = (study) => {
    setPreviewStudy(study);
  };

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
        <div className="timeline-spinner" />
        <div style={{ marginTop: '14px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', color: '#64748b' }}>
          Loading patient history…
        </div>
        <style>{`
          .timeline-spinner {
            width: 28px; height: 28px; border: 3px solid #e2e8f0;
            border-top-color: #0a1628; border-radius: 50%;
            margin: 0 auto; animation: tlspin 0.8s linear infinite;
          }
          @keyframes tlspin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!history || history.length === 0) {
    return (
      <div style={{ padding: '60px 40px', textAlign: 'center', background: '#fafbfc', borderRadius: '16px', border: '1.5px dashed #e2e8f0' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '16px', background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px', color: '#f5d76e', fontSize: '24px', boxShadow: '0 8px 20px rgba(10, 22, 40, 0.2)' }}>📋</div>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#0a1628', marginBottom: '6px' }}>No previous visits</div>
        <div style={{ fontSize: '12px', color: '#64748b', maxWidth: '320px', margin: '0 auto', lineHeight: 1.5 }}>
          This appears to be the patient's first visit at this facility. Past appointments and reports will appear here once available.
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="patient-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>Diagnostic Timeline</div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0a1628', margin: 0, letterSpacing: '-0.3px' }}>Past Visits &amp; Reports</h2>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)',
          color: '#f5d76e', padding: '6px 14px', borderRadius: '999px',
          fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px',
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          boxShadow: '0 4px 12px rgba(10, 22, 40, 0.15)',
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#d4a017' }} />
          {history.length} VISIT{history.length !== 1 ? 'S' : ''}
        </div>
      </div>

      {/* Timeline list */}
      <div style={{ position: 'relative', paddingLeft: isMobile ? '0' : '40px' }}>
        {/* Vertical rail (desktop only) */}
        {!isMobile && (
          <div style={{
            position: 'absolute', left: '14px', top: '14px', bottom: '14px',
            width: '2px',
            background: 'linear-gradient(180deg, #d4a017 0%, #0a1628 30%, #cbd5e1 100%)',
            borderRadius: '1px',
          }} />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {history.map((study, idx) => {
            const studyId    = getId(study);
            const isActive   = String(activeAppointmentId) === String(studyId);
            const date       = getDate(study);
            const dayNum     = date.getDate();
            const monthShort = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
            const year       = date.getFullYear();
            const modality   = getModality(study);
            const service    = getService(study);
            const referrer   = getReferrer(study);
            const assetCount = getAssetCount(study);
            const reported   = isReported(study);

            return (
              <div key={studyId || idx} style={{ position: 'relative' }}>
                {/* Timeline dot (desktop) */}
                {!isMobile && (
                  <div style={{
                    position: 'absolute', left: '-32px', top: '22px',
                    width: '14px', height: '14px', borderRadius: '50%',
                    background: isActive ? '#d4a017' : 'white',
                    border: `3px solid ${isActive ? 'white' : '#cbd5e1'}`,
                    boxShadow: isActive ? '0 0 0 4px rgba(212, 160, 23, 0.25)' : '0 0 0 2px white',
                    zIndex: 2,
                  }} />
                )}

                <div style={{
                  background: 'white', borderRadius: '14px',
                  border: `1px solid ${isActive ? '#fde68a' : '#e8edf2'}`,
                  boxShadow: isActive
                    ? '0 6px 20px rgba(212, 160, 23, 0.15)'
                    : '0 2px 8px rgba(15, 23, 42, 0.04)',
                  padding: isMobile ? '16px' : '18px 20px',
                  display: 'flex', gap: '18px',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'stretch' : 'flex-start',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  position: 'relative', overflow: 'hidden',
                }}
                  onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(15, 23, 42, 0.08)'; } }}
                  onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.borderColor = '#e8edf2'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.04)'; } }}
                >
                  {/* Date tile */}
                  <div style={{
                    flexShrink: 0,
                    width: isMobile ? 'auto' : '78px',
                    display: 'flex', flexDirection: isMobile ? 'row' : 'column',
                    alignItems: isMobile ? 'baseline' : 'center', justifyContent: isMobile ? 'flex-start' : 'center',
                    gap: isMobile ? '8px' : '0',
                    padding: isMobile ? '0' : '10px 6px',
                    borderRadius: '12px',
                    background: isMobile ? 'transparent' : (isActive ? 'linear-gradient(135deg, #fff8e6 0%, #fefce8 100%)' : '#fafbfc'),
                    border: isMobile ? 'none' : `1px solid ${isActive ? '#fde68a' : '#e8edf2'}`,
                  }}>
                    <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 900, color: isActive ? '#92400e' : '#0a1628', lineHeight: 1, letterSpacing: '-0.5px' }}>
                      {dayNum}
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: isActive ? '#92400e' : '#64748b', letterSpacing: '0.8px', marginTop: isMobile ? 0 : '4px' }}>
                      {monthShort} {year}
                    </div>
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row: modality chip + active badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: 'white', background: '#0a1628', padding: '3px 10px', borderRadius: '6px', letterSpacing: '0.5px' }}>
                        {modality.toString().toUpperCase()}
                      </span>
                      {isActive && (
                        <span style={{ fontSize: '9px', fontWeight: 900, color: '#92400e', background: '#fff8e6', border: '1px solid #fde68a', padding: '3px 9px', borderRadius: '6px', letterSpacing: '0.5px' }}>
                          CURRENT SESSION
                        </span>
                      )}
                    </div>

                    {/* Service name */}
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0a1628', margin: 0, letterSpacing: '-0.2px' }}>
                      {service}
                    </h3>

                    {/* Patient + referrer line */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                      {getPatientName(study) && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ fontSize: '11px' }}>👤</span>
                          <span style={{ fontWeight: 700, color: '#0a1628' }}>{getPatientName(study)}</span>
                        </span>
                      )}
                      {referrer && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 800, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '2px 7px', borderRadius: '5px', letterSpacing: '0.3px' }}>↗ REFERRED BY</span>
                          <span style={{ fontWeight: 700, color: '#0a1628' }}>{referrer}</span>
                        </span>
                      )}
                    </div>

                    {/* Status indicators */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                      {/* Report indicator */}
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '5px 11px', borderRadius: '999px',
                        background: reported ? '#f0fdf4' : '#fafbfc',
                        border: `1px solid ${reported ? '#bbf7d0' : '#e2e8f0'}`,
                        fontSize: '10px', fontWeight: 700,
                        color: reported ? '#15803d' : '#94a3b8',
                      }}>
                        <span style={{ fontSize: '11px' }}>{reported ? '✓' : '○'}</span>
                        {reported ? 'Report available' : 'No report yet'}
                      </div>

                      {/* DICOM indicator */}
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '5px 11px', borderRadius: '999px',
                        background: assetCount > 0 ? '#eff6ff' : '#fafbfc',
                        border: `1px solid ${assetCount > 0 ? '#bfdbfe' : '#e2e8f0'}`,
                        fontSize: '10px', fontWeight: 700,
                        color: assetCount > 0 ? '#0f52ba' : '#94a3b8',
                      }}>
                        <span style={{ fontSize: '11px' }}>{assetCount > 0 ? '🔬' : '○'}</span>
                        {assetCount > 0 ? `${assetCount} image${assetCount !== 1 ? 's' : ''}` : 'No images'}
                      </div>
                    </div>
                  </div>

                  {/* Actions column */}
                  <div style={{
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: isMobile ? 'row' : 'column',
                    gap: '8px',
                    alignSelf: isMobile ? 'stretch' : 'center',
                  }}>
                    <button
                      onClick={() => handleOpenReport(study)}
                      disabled={!reported}
                      title={reported ? 'Preview the historical report' : 'No report on file'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        padding: '9px 14px', borderRadius: '10px',
                        background: reported ? 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)' : '#f1f5f9',
                        color: reported ? 'white' : '#94a3b8',
                        border: 'none',
                        fontSize: '11px', fontWeight: 800,
                        cursor: reported ? 'pointer' : 'not-allowed',
                        letterSpacing: '0.3px',
                        boxShadow: reported ? '0 4px 12px rgba(10, 22, 40, 0.15)' : 'none',
                        whiteSpace: 'nowrap',
                        flex: isMobile ? 1 : 'none',
                      }}
                    >
                      👁 View report
                    </button>
                    <button
                      onClick={() => onViewDicom?.(study)}
                      disabled={assetCount === 0}
                      title={assetCount > 0 ? 'Open DICOM in viewer' : 'No DICOM images uploaded'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        padding: '9px 14px', borderRadius: '10px',
                        background: assetCount > 0 ? 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)' : '#f1f5f9',
                        color: assetCount > 0 ? '#0a1628' : '#94a3b8',
                        border: 'none',
                        fontSize: '11px', fontWeight: 800,
                        cursor: assetCount > 0 ? 'pointer' : 'not-allowed',
                        letterSpacing: '0.3px',
                        boxShadow: assetCount > 0 ? '0 4px 12px rgba(212, 160, 23, 0.25)' : 'none',
                        whiteSpace: 'nowrap',
                        flex: isMobile ? 1 : 'none',
                      }}
                    >
                      🔬 Open DICOM
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Read-only viewer for historical reports — same letterhead + patient
          banner + flowing body as the reporting workspace's preview.
          Replaces the old inline modal whose body just dumped raw editor HTML
          into a small card, causing .word-page-inner styles to overlap. */}
      <SavedReportViewer
        isOpen={!!previewStudy}
        onClose={() => setPreviewStudy(null)}
        appointmentId={previewStudy ? getId(previewStudy) : null}
        patientData={previewStudy}
      />
    </div>
  );
};


export default PatientTimeline;
