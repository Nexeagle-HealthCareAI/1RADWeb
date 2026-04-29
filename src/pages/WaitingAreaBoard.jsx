import { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';

export default function WaitingAreaBoard() {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const fetchBoard = async () => {
    try {
      const res = await apiClient.get('/appointments');
      const today = new Date().toLocaleDateString('en-CA');
      const activeMissions = res.data
        .filter(m => {
          const studyDate = m.dateTime ? new Date(m.dateTime).toLocaleDateString('en-CA') : null;
          return studyDate === today && ['confirmed', 'in_progress', 'scanned', 'reporting'].includes(m.status?.toLowerCase());
        })
        .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
      
      setMissions(activeMissions);
    } catch (err) {
      console.error('Failed to fetch board', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoard();
    const interval = setInterval(fetchBoard, 15000);
    const clock = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(clock); };
  }, []);

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed': return '#2ecc71';
      case 'in_progress': return '#f1c40f';
      case 'scanned': return '#3498db';
      case 'reporting': return '#9b59b6';
      default: return '#94a3b8';
    }
  };

  const getStatusLabel = (status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed': return 'PLEASE WAIT';
      case 'in_progress': return 'IN SCANNING';
      case 'scanned': return 'PROCESSING';
      case 'reporting': return 'REPORTING';
      default: return 'WAITING';
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#050510', color: 'white', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '30px 60px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f52ba', letterSpacing: '4px', textTransform: 'uppercase' }}>1RAD_DIAGNOSTIC_HUB</div>
          <h1 style={{ fontSize: '36px', fontWeight: 950, margin: 0, letterSpacing: '-1px' }}>WAITING_AREA_COMMAND</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '32px', fontWeight: 950 }}>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
          <div style={{ fontSize: '14px', opacity: 0.6, fontWeight: 800 }}>{currentTime.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}</div>
        </div>
      </div>

      <div style={{ padding: '40px 60px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
          {['TOKEN', 'PATIENT NAME', 'MODALITY', 'STATUS'].map(h => (
            <div key={h} style={{ fontSize: '12px', fontWeight: 950, color: '#64748b', letterSpacing: '2px' }}>{h}</div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {missions.map((m, idx) => (
            <div key={m.appointmentId} style={{ 
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', alignItems: 'center',
              padding: '30px', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', 
              border: '1px solid rgba(255,255,255,0.05)', animation: `slideIn 0.5s ease-out forwards`, animationDelay: `${idx * 0.1}s`,
              transform: 'translateX(-50px)', opacity: 0
            }}>
              <div style={{ fontSize: '42px', fontWeight: 950, color: '#0f52ba' }}>#{m.displayId || m.appointmentId}</div>
              <div style={{ fontSize: '24px', fontWeight: 900 }}>{m.patientName?.toUpperCase()}</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#60a5fa' }}>{m.modality} // {m.service}</div>
              <div>
                <span style={{ 
                  padding: '12px 30px', borderRadius: '14px', fontSize: '14px', fontWeight: 950,
                  background: getStatusColor(m.status), color: 'white', display: 'inline-block',
                  boxShadow: `0 10px 30px ${getStatusColor(m.status)}44`
                }}>{getStatusLabel(m.status)}</span>
              </div>
            </div>
          ))}

          {missions.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '100px', opacity: 0.3 }}>
              <div style={{ fontSize: '80px', marginBottom: '20px' }}>📺</div>
              <div style={{ fontSize: '20px', fontWeight: 900 }}>NO ACTIVE MISSIONS IN QUEUE</div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
