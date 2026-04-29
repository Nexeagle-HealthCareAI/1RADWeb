import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../api/apiClient';

export default function StatusTracking() {
  const { id } = useParams();
  const [study, setStudy] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await apiClient.get(`/appointments/${id}`);
        setStudy(res.data);
      } catch (err) {
        console.error('Tracking failed', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
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

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1628', color: 'white' }}>
      <div className="dicom-loader"></div>
    </div>
  );

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
          <p style={{ fontSize: '12px', color: '#64748b' }}>Please wait in the diagnostic lounge. Our team will notify you when the mission enters the next phase.</p>
        </div>
      </div>
      <style>{`
        .dicom-loader {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(15, 82, 186, 0.1);
          border-top: 3px solid #0f52ba;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
