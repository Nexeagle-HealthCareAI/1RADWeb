import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../api/apiClient';

export default function StatusTracking() {
  const { id } = useParams();
  const [study, setStudy] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchAll = async () => {
      try {
        const res = await apiClient.get(`/appointments/${id}`);
        if (!active) return;
        const studyData = res.data?.data || res.data;
        setStudy(studyData);

        // If the study is reported/finalized, also fetch the report content
        // so the QR-scanner sees the actual report instead of the timeline.
        const status = (studyData?.status || '').toLowerCase();
        const isReported = status === 'reported' || status === 'finalized' || status === 'completed';
        if (isReported) {
          try {
            const reportRes = await apiClient.get(`/Reporting/report/${id}`);
            if (!active) return;
            const reportData = reportRes.data?.data || reportRes.data;
            if (reportData && (reportData.isFinalized || reportData.finalizedAt || reportData.text)) {
              setReport(reportData);
            }
          } catch (e) {
            console.warn('Report fetch failed', e?.message);
          }
        }
      } catch (err) {
        console.error('Tracking failed', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [id]);

  const steps = [
    { key: 'booked', label: 'BOOKED', icon: '📅' },
    { key: 'confirmed', label: 'ARRIVED', icon: '📍' },
    { key: 'in_progress', label: 'SCANNING', icon: '🌀' },
    { key: 'scanned', label: 'ACQUIRED', icon: '📡' },
    { key: 'reporting', label: 'ANALYZING', icon: '📝' },
    { key: 'reported', label: 'FINALIZED', icon: '✅' }
  ];

  const currentStatus = study?.status?.toLowerCase() || 'booked';
  const currentIndex = steps.findIndex(s => s.key === currentStatus);

  const printReport = () => window.print();

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1628', color: 'white' }}>
      <div className="dicom-loader"></div>
      <style>{`
        .dicom-loader { width: 40px; height: 40px; border: 3px solid rgba(15, 82, 186, 0.1); border-top: 3px solid #0f52ba; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );

  // ── Report view (finalized) ─────────────────────────────────────────────────
  if (report) {
    const name      = (study?.patientName || '').toUpperCase() || '—';
    const ptid      = study?.patientIdentifier || study?.ptid || study?.id || '—';
    const age       = study?.patientAge || study?.age || '—';
    const sex       = study?.patientGender || study?.gender || '—';
    const studyName = study?.service || study?.modality || '—';
    const modality  = study?.modality || '—';
    const refBy     = study?.referredBy || 'Self';
    const repDate   = report?.finalizedAt
      ? new Date(report.finalizedAt).toLocaleDateString()
      : new Date().toLocaleDateString();

    const html = report?.text || report?.content || '';

    return (
      <div className="track-report-root" style={{
        minHeight: '100vh', background: '#e2e8f0', padding: '24px 12px',
        fontFamily: '"Inter", "Helvetica Neue", "Segoe UI", -apple-system, sans-serif',
      }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>

          {/* Top bar — only on screen, hidden on print */}
          <div className="track-toolbar" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '14px', gap: '10px',
          }}>
            <div style={{ fontSize: '11px', color: '#475569', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }}>
              1RAD · Final Report
            </div>
            <button onClick={printReport} style={{
              background: '#0f52ba', color: 'white', border: 'none',
              padding: '8px 16px', borderRadius: '8px', fontSize: '12px',
              fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 6px rgba(15,82,186,0.3)',
            }}>
              🖨️ Print / Save as PDF
            </button>
          </div>

          {/* Report sheet */}
          <div className="track-report-sheet" style={{
            background: 'white', borderRadius: '10px',
            boxShadow: '0 4px 18px rgba(15, 23, 42, 0.08)',
            padding: '24px 28px',
          }}>

            {/* Patient header — same layout as PatientInfoBlock */}
            <div style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', gap: '14px',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              border: '1px solid #e2e8f0', borderRadius: '10px',
              padding: '10px 14px 10px 12px', marginBottom: '14px',
              fontFeatureSettings: '"tnum" 1, "lnum" 1',
            }}>
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: 0, width: '4px',
                background: 'linear-gradient(180deg, #0f52ba 0%, #1e40af 50%, #0f52ba 100%)',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '17px', fontWeight: 800, color: '#0a1628', letterSpacing: '-0.2px', lineHeight: 1.2 }}>{name}</div>
                <div style={{ fontSize: '10.5px', color: '#475569', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                  <span><span style={{ color: '#94a3b8', fontWeight: 700 }}>Patient ID:</span> <strong style={{ color: '#0f172a' }}>{ptid}</strong></span>
                  <span style={{ color: '#cbd5e1' }}>·</span>
                  <span><span style={{ color: '#94a3b8', fontWeight: 700 }}>Age/Sex:</span> <strong style={{ color: '#0f172a' }}>{age} / {sex}</strong></span>
                  <span style={{ color: '#cbd5e1' }}>·</span>
                  <span><span style={{ color: '#94a3b8', fontWeight: 700 }}>Study:</span> <strong style={{ color: '#0f52ba' }}>{studyName}</strong></span>
                  <span style={{ color: '#cbd5e1' }}>·</span>
                  <span><span style={{ color: '#94a3b8', fontWeight: 700 }}>Prescribed By:</span> <strong style={{ color: '#0f172a' }}>{refBy}</strong></span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '8px', borderLeft: '1px solid #e2e8f0', minWidth: '70px' }}>
                <div style={{ fontSize: '8px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Reported</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{repDate}</div>
              </div>
            </div>

            <div style={{
              fontSize: '10.5px', fontStyle: 'italic', color: '#475569',
              textAlign: 'center', marginBottom: '14px',
            }}>
              Thank you for referring the patient for <strong style={{ color: '#0f52ba', fontStyle: 'normal' }}>{modality}</strong>.
            </div>

            {/* Report content */}
            <div
              className="report-content"
              style={{
                fontFamily: '"Calibri", "Segoe UI", sans-serif',
                fontSize: '12pt', lineHeight: 1.6, color: '#000',
              }}
              dangerouslySetInnerHTML={{ __html: html }}
            />

            {/* Impression / advice if present */}
            {report.impression && (
              <div style={{ marginTop: '18px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f52ba', letterSpacing: '1px', marginBottom: '6px' }}>IMPRESSION</div>
                <div style={{ fontSize: '12pt', lineHeight: 1.6, color: '#000' }}
                  dangerouslySetInnerHTML={{ __html: report.impression }} />
              </div>
            )}
            {report.advice && (
              <div style={{ marginTop: '18px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f52ba', letterSpacing: '1px', marginBottom: '6px' }}>ADVICE</div>
                <div style={{ fontSize: '11pt', lineHeight: 1.6, color: '#374151', fontStyle: 'italic' }}
                  dangerouslySetInnerHTML={{ __html: report.advice }} />
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '10px', color: '#94a3b8' }}>
            Scanned via 1Rad QR · Token #{study?.displayId || id}
          </div>
        </div>

        <style>{`
          .report-content p { margin: 0 0 8px 0; }
          .report-content h1 { font-size: 20pt; font-weight: 700; line-height: 1.2; margin: 0 0 12px 0; color: #1f3864; border-bottom: 1px solid #4472c4; padding-bottom: 4px; }
          .report-content h2 { font-size: 16pt; font-weight: 700; margin: 14px 0 8px 0; color: #2e4d7b; }
          .report-content h3 { font-size: 14pt; font-weight: 600; margin: 12px 0 6px 0; color: #2e4d7b; }
          .report-content h4 { font-size: 12pt; font-weight: 600; margin: 10px 0 4px 0; color: #374151; }
          .report-content ul, .report-content ol { padding-left: 28px; margin: 6px 0 10px; }
          .report-content table { border-collapse: collapse; width: 100%; margin: 10px 0; border: 1px solid #c8c8c8; }
          .report-content th { background: #d6e4f7; padding: 7px 12px; border: 1px solid #c8c8c8; font-weight: 700; color: #1f3864; }
          .report-content td { padding: 7px 12px; border: 1px solid #c8c8c8; vertical-align: top; }
          .report-content img { max-width: 100%; height: auto; }
          @media print {
            body { background: white !important; }
            .track-toolbar { display: none !important; }
            .track-report-root { background: white !important; padding: 0 !important; }
            .track-report-sheet { box-shadow: none !important; padding: 0 !important; border-radius: 0 !important; }
          }
        `}</style>
      </div>
    );
  }

  // ── Live tracker (in-progress) ──────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0a1628', color: 'white', fontFamily: 'Inter, sans-serif', padding: '40px 20px' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '12px', fontWeight: 950, color: '#60a5fa', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '10px' }}>1RAD_LIVE_TRACKER</div>
          <h1 style={{ fontSize: '28px', fontWeight: 950, margin: 0 }}>MISSION STATUS</h1>
          <div style={{ fontSize: '14px', opacity: 0.6, marginTop: '5px' }}>TOKEN #{study?.displayId || id}</div>
        </div>

        {/* Patient Info Card */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '24px', padding: '25px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 950 }}>{study?.patientName?.toUpperCase()}</div>
              <div style={{ fontSize: '12px', opacity: 0.6 }}>{study?.modality} // {study?.service}</div>
            </div>
            <div style={{ background: '#0f52ba', color: 'white', padding: '6px 12px', borderRadius: '10px', fontSize: '10px', fontWeight: 950 }}>LIVE</div>
          </div>
        </div>

        {/* Timeline */}
        <div style={{ position: 'relative', paddingLeft: '50px' }}>
          <div style={{ position: 'absolute', left: '20px', top: '10px', bottom: '10px', width: '2px', background: 'rgba(255,255,255,0.1)' }}></div>
          {steps.map((step, idx) => {
            const isDone = idx <= currentIndex;
            const isCurrent = idx === currentIndex;
            return (
              <div key={step.key} style={{ marginBottom: '40px', position: 'relative', opacity: isDone ? 1 : 0.4 }}>
                <div style={{
                  position: 'absolute', left: '-38px', top: '0', width: '16px', height: '16px',
                  borderRadius: '50%', background: isCurrent ? '#0f52ba' : isDone ? '#2ecc71' : '#1e293b',
                  boxShadow: isCurrent ? '0 0 20px #0f52ba' : 'none',
                  zIndex: 2, border: '4px solid #0a1628'
                }}></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <span style={{ fontSize: '24px' }}>{step.icon}</span>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 950, color: isCurrent ? '#60a5fa' : 'white' }}>{step.label}</div>
                    <div style={{ fontSize: '10px', opacity: 0.6 }}>{isDone ? (isCurrent ? 'Current Phase' : 'Completed') : 'Pending'}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '50px', textAlign: 'center', padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '20px' }}>
          <p style={{ fontSize: '12px', color: '#64748b' }}>
            {currentStatus === 'reported'
              ? 'Your report is being prepared for viewing — please refresh in a moment.'
              : 'Please wait in the diagnostic lounge. Our team will notify you when the mission enters the next phase.'}
          </p>
        </div>
      </div>
    </div>
  );
}
