import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import apiClient from '../api/apiClient';
import SavedReportViewer from '../components/SavedReportViewer';

const STATUS_COLOR = {
  reported:    { bg: '#10b981', light: '#f0fdf4', border: '#bbf7d0', text: '#065f46' },
  reporting:   { bg: '#8b5cf6', light: '#f5f3ff', border: '#ddd6fe', text: '#4c1d95' },
  completed:   { bg: '#0f52ba', light: '#eff6ff', border: '#bfdbfe', text: '#1e3a8a' },
  scanned:     { bg: '#0f52ba', light: '#eff6ff', border: '#bfdbfe', text: '#1e3a8a' },
  in_progress: { bg: '#f59e0b', light: '#fffbeb', border: '#fde68a', text: '#78350f' },
  confirmed:   { bg: '#f59e0b', light: '#fffbeb', border: '#fde68a', text: '#78350f' },
  cancelled:   { bg: '#ef4444', light: '#fef2f2', border: '#fecaca', text: '#7f1d1d' },
  scheduled:   { bg: '#64748b', light: '#f8fafc', border: '#e2e8f0', text: '#334155' },
  booked:      { bg: '#64748b', light: '#f8fafc', border: '#e2e8f0', text: '#334155' },
};

const getStatus = (s) => STATUS_COLOR[s?.toLowerCase()] || STATUS_COLOR.scheduled;

export default function PatientTimelinePage() {
  const navigate = useNavigate();
  const { appointmentId } = useParams();
  const { state: routeState } = useLocation();

  const patient = routeState?.patient || {};
  const returnPath = routeState?.returnPath || `/reporting/${appointmentId}`;

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  // The timeline uses SavedReportViewer (a read-only viewer) instead of
  // ReportPreviewModal. The preview modal's pagination relies on the editor's
  // own .word-page chunks, which were sized for the editor's metrics at SAVE
  // time. When those chunks don't match current page dimensions (different
  // letterhead, margin, banner height) they overflow the modal's fixed-height
  // A4 cards and the impression block visually overlaps the cut-off body.
  // The viewer flattens those chunks into a single continuously-flowing sheet
  // so the saved content always renders cleanly regardless of when it was
  // saved.
  const [previewAppointment, setPreviewAppointment] = useState(null);
  const [dicomState, setDicomState] = useState({});
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterModality, setFilterModality] = useState('ALL');

  const fetchHistory = useCallback(async () => {
    if (!patient.patientName && !patient.patientId) return;
    setLoading(true);
    try {
      const patientId = patient.patientId || patient.patientIdentifier;

      // Try the dedicated patient timeline API first if patientId is a valid Guid
      const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isGuid = guidRegex.test(patientId);

      if (isGuid) {
        console.info(`[TIMELINE PAGE] Querying dedicated timeline API for patient Guid: ${patientId}`);
        const res = await apiClient.get(`/patients/${patientId}/timeline`);
        if (res.data?.success && Array.isArray(res.data.data)) {
          const formattedHistory = res.data.data
            .filter(a => String(a.appointmentId) !== String(appointmentId) && a.displayId !== appointmentId)
            .map(a => ({
              ...a,
              assetCount: a.assets?.length || 0,
              reportImpression: a.report?.impression || '',
              report: a.report
            }));
          setHistory(formattedHistory);
          setLoading(false);
          return;
        }
      }

      // Fallback search
      const searchQuery = patientId || patient.patientName;
      const [todayRes, archiveRes] = await Promise.all([
        apiClient.get('/appointments', { params: { search: searchQuery } }).catch(() => ({ data: [] })),
        apiClient.get('/appointments', { params: { search: searchQuery, isArchive: true } }).catch(() => ({ data: [] })),
      ]);

      const seen = new Set();
      const merged = [
        ...(Array.isArray(todayRes.data) ? todayRes.data : []),
        ...(Array.isArray(archiveRes.data) ? archiveRes.data : []),
      ].filter(a => {
        const key = String(a.appointmentId);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const past = merged
        .filter(a => {
          const samePatient =
            (patient.patientId && String(a.patientId) === String(patient.patientId)) ||
            a.patientName?.toLowerCase().trim() === patient.patientName?.toLowerCase().trim();
          const different = String(a.appointmentId) !== String(appointmentId) && a.displayId !== appointmentId;
          return samePatient && different;
        })
        .sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));

      setHistory(past);
    } catch (err) {
      console.warn('[TIMELINE PAGE] Fetch failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [patient.patientId, patient.patientIdentifier, patient.patientName, appointmentId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // SavedReportViewer fetches its own report + appointment + protocol given
  // an appointmentId — we just hand it the appointment object so it has a
  // banner fallback while the network calls resolve.
  const handleViewReport = (appt) => {
    setPreviewAppointment({
      ...appt,
      patientName: appt.patientName || patient?.patientName,
    });
  };

  const closePreview = () => {
    setPreviewAppointment(null);
  };

  const handleOpenDicom = async (appt) => {
    const id = appt.appointmentId;
    if (dicomState[id] === 'loading') return;
    setDicomState(prev => ({ ...prev, [id]: 'loading' }));
    try {
      const assetRes = await apiClient.get(`/Study/${id}/assets`).catch(() => ({ data: [] }));
      const valid = (assetRes.data || []).filter(a => a.blobUrl);
      if (!valid.length) { setDicomState(prev => ({ ...prev, [id]: 'none' })); return; }
      setDicomState(prev => ({ ...prev, [id]: 'done' }));
      navigate('/dicom-viewer', {
        state: {
          files: [],
          seriesName: `${appt.service || appt.modality} — ${new Date(appt.dateTime).toLocaleDateString('en-IN')}`,
          allSeries: valid.map(a => ({ name: a.fileName || 'SERIES', files: [], blobUrl: a.blobUrl, modality: appt.modality })),
          activeSeriesIndex: 0,
          appointmentData: { ...appt, patientName: patient.patientName },
          returnPath,
        }
      });
    } catch {
      setDicomState(prev => ({ ...prev, [id]: 'error' }));
    }
  };

  const modalities = [...new Set(history.map(h => h.modality).filter(Boolean))];
  const statuses   = [...new Set(history.map(h => h.status?.toLowerCase()).filter(Boolean))];

  const filtered = history.filter(h => {
    const okStatus   = filterStatus   === 'ALL' || h.status?.toLowerCase() === filterStatus;
    const okModality = filterModality === 'ALL' || h.modality === filterModality;
    return okStatus && okModality;
  });

  // ── Stats ──────────────────────────────────────────────────────
  const stats = {
    total:     history.length,
    finalized: history.filter(h => ['reported', 'completed'].includes(h.status?.toLowerCase())).length,
    modalities: [...new Set(history.map(h => h.modality).filter(Boolean))].length,
    latestDate: history[0]?.dateTime ? new Date(history[0].dateTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
  };

  return (
    <div style={{ background: '#f0f4f8', minHeight: '100vh' }}>

      {/* ── Hero Header ── */}
      <div style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0f2a5e 60%, #1e3a8a 100%)', padding: '30px 50px 40px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '280px', height: '280px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

        {/* Back */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
          <button
            onClick={() => navigate(returnPath)}
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ← BACK TO REPORT
          </button>
          <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)' }} />
          <span style={{ fontSize: '10px', fontWeight: 950, color: 'rgba(255,255,255,0.4)', letterSpacing: '2px', textTransform: 'uppercase' }}>PATIENT TIMELINE</span>
          <button
            onClick={fetchHistory}
            disabled={loading}
            style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '8px 14px', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: '14px', opacity: loading ? 0.5 : 1 }}
          >
            <span style={{ display: 'inline-block', animation: loading ? 'spin 0.8s linear infinite' : 'none' }}>↻</span>
          </button>
        </div>

        {/* Patient Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '24px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 950, color: 'rgba(255,255,255,0.4)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>Patient Profile</div>
            <h1 style={{ fontSize: '28px', fontWeight: 950, color: 'white', letterSpacing: '-1px', margin: '0 0 12px' }}>
              {patient.patientName?.toUpperCase() || 'UNKNOWN PATIENT'}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {[
                { label: 'UHID',     value: patient.patientIdentifier || patient.patientId || '—' },
                { label: 'AGE',      value: patient.patientAge ? `${patient.patientAge} yrs` : '—' },
                { label: 'GENDER',   value: patient.patientGender || '—' },
                { label: 'MODALITY', value: patient.modality || '—' },
                { label: 'STUDY',    value: patient.service || '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '6px 12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '8px', fontWeight: 950, color: 'rgba(255,255,255,0.4)', letterSpacing: '1px' }}>{label}</span>
                  <span style={{ fontSize: '11px', fontWeight: 900, color: 'white' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats pills */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {[
              { label: 'Total Studies',  value: stats.total,     color: '#60a5fa' },
              { label: 'Finalized',      value: stats.finalized, color: '#34d399' },
              { label: 'Modalities',     value: stats.modalities, color: '#a78bfa' },
              { label: 'Latest',         value: stats.latestDate, color: '#fbbf24', small: true },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '14px 18px', textAlign: 'center', minWidth: '80px' }}>
                <div style={{ fontSize: s.small ? '12px' : '24px', fontWeight: 950, color: s.color, letterSpacing: '-0.5px', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '8px', fontWeight: 950, color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', textTransform: 'uppercase', marginTop: '5px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '30px 50px', maxWidth: '900px', margin: '0 auto' }}>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>Filter:</span>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 14px', fontSize: '11px', fontWeight: 800, color: '#334155', cursor: 'pointer', outline: 'none' }}
          >
            <option value="ALL">All Statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
          </select>

          <select
            value={filterModality}
            onChange={e => setFilterModality(e.target.value)}
            style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 14px', fontSize: '11px', fontWeight: 800, color: '#334155', cursor: 'pointer', outline: 'none' }}
          >
            <option value="ALL">All Modalities</option>
            {modalities.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, color: '#64748b' }}>
            {filtered.length} of {history.length} studies
          </span>
        </div>

        {/* Timeline */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0', gap: '16px', color: '#64748b' }}>
            <div style={{ width: '44px', height: '44px', border: '3px solid #e2e8f0', borderTopColor: '#0f52ba', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: '12px', fontWeight: 700 }}>Loading diagnostic history...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e8edf2', padding: '70px 40px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <div style={{ fontSize: '16px', fontWeight: 950, color: '#1e293b', marginBottom: '8px' }}>
              {history.length === 0 ? 'No Previous Studies' : 'No Matches'}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
              {history.length === 0
                ? 'This is the first recorded visit for this patient.'
                : 'Try adjusting the filters above.'}
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Vertical line */}
            <div style={{ position: 'absolute', left: '19px', top: '24px', bottom: '24px', width: '2px', background: 'linear-gradient(180deg, #0f52ba, #e2e8f0)', borderRadius: '2px', zIndex: 0 }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filtered.map((appt, idx) => {
                const sc = getStatus(appt.status);
                const hasReport = ['reported', 'reporting', 'completed'].includes(appt.status?.toLowerCase());
                const dState = dicomState[appt.appointmentId];

                return (
                  <div key={appt.appointmentId || idx} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>

                    {/* Timeline dot */}
                    <div style={{ width: '40px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '18px' }}>
                      <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: sc.bg, border: '3px solid white', boxShadow: `0 0 0 2px ${sc.bg}55`, flexShrink: 0 }} />
                    </div>

                    {/* Card */}
                    <div style={{ flex: 1, background: 'white', borderRadius: '18px', border: '1px solid #e8edf2', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', transition: 'all 0.2s' }}>

                      {/* Card Header */}
                      <div style={{ padding: '18px 22px' }}>
                        {/* Row 1 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 950, color: '#0a1628', marginBottom: '2px' }}>
                              {appt.service || appt.modality || 'Study'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                              <span>📅 {appt.dateTime ? new Date(appt.dateTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                              {appt.dateTime && <span>⏰ {new Date(appt.dateTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
                              {appt.doctor && <span>👨‍⚕️ {appt.doctor}</span>}
                              {appt.referredBy && (
                                <span style={{ color: '#7c3aed' }}>
                                  ↗ Ref: {appt.referredBy}
                                  {(appt.referredContact || appt.ReferredContact) && ` (${appt.referredContact || appt.ReferredContact})`}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                            <span style={{ background: sc.light, color: sc.text, border: `1px solid ${sc.border}`, borderRadius: '99px', padding: '4px 12px', fontSize: '9px', fontWeight: 950, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                              {appt.status || 'UNKNOWN'}
                            </span>
                            {appt.modality && (
                              <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: '8px', padding: '3px 10px', fontSize: '9px', fontWeight: 950 }}>
                                {appt.modality}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Tech note */}
                        {appt.technicianComments && (
                          <div style={{ fontSize: '11px', color: '#64748b', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontStyle: 'italic' }}>
                            🔧 {appt.technicianComments}
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            disabled={!hasReport}
                            onClick={() => hasReport && handleViewReport(appt)}
                            style={{
                              background: hasReport ? 'white' : '#f8fafc',
                              border: `1.5px solid ${hasReport ? '#e2e8f0' : '#f1f5f9'}`,
                              color: hasReport ? '#334155' : '#cbd5e1',
                              borderRadius: '10px', padding: '8px 14px', fontSize: '11px', fontWeight: 900,
                              cursor: hasReport ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
                            }}
                          >
                            📄 {hasReport ? 'VIEW REPORT' : 'NO REPORT'}
                          </button>

                          <button
                            onClick={() => handleOpenDicom(appt)}
                            disabled={dState === 'loading' || dState === 'none'}
                            style={{
                              background: dState === 'none' ? '#f8fafc' : 'linear-gradient(135deg, #10b981, #059669)',
                              border: dState === 'none' ? '1.5px solid #f1f5f9' : 'none',
                              color: dState === 'none' ? '#cbd5e1' : 'white',
                              borderRadius: '10px', padding: '8px 14px', fontSize: '11px', fontWeight: 900,
                              cursor: (dState === 'loading' || dState === 'none') ? 'default' : 'pointer',
                              display: 'flex', alignItems: 'center', gap: '6px',
                              boxShadow: dState === 'none' ? 'none' : '0 4px 12px rgba(16,185,129,0.3)',
                              opacity: dState === 'loading' ? 0.7 : 1, transition: 'all 0.2s'
                            }}
                          >
                            {dState === 'loading'
                              ? <span style={{ display: 'inline-block', width: '10px', height: '10px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                              : '🔍'}
                            {dState === 'none' ? 'NO DICOM' : 'OPEN DICOM →'}
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        select { -webkit-appearance: none; appearance: none; }
      `}</style>

      {/* Read-only viewer for the saved report — letterhead + patient banner
          + body + impression + advice, rendered as one continuously flowing
          A4 sheet so old saves (where the editor's stored chunks no longer
          match current page metrics) don't overlap. */}
      <SavedReportViewer
        isOpen={!!previewAppointment}
        onClose={closePreview}
        appointmentId={previewAppointment?.appointmentId}
        patientData={previewAppointment}
      />
    </div>
  );
}
