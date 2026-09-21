import { useState, useEffect, useMemo } from 'react';
import useLiveAppointments from '../hooks/useLiveAppointments';

const ACTIVE_STATUSES = ['confirmed', 'in_progress', 'scanned', 'reporting'];

export default function WaitingAreaBoard() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  // Today's queue comes straight from the live backend (no local cache) and
  // refreshes every 15s. Derived from the ticking clock so the window rolls
  // over to the new day at midnight on a display that's never reloaded.
  const todayIso = currentTime.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const { rows, loading, error, lastUpdatedAt } = useLiveAppointments({
    mode: 'today',
    dateIso: todayIso,
    pollMs: 15_000,
  });

  const missions = useMemo(() => rows
    .filter(m => ACTIVE_STATUSES.includes((m.status || '').toLowerCase()))
    // Waiting-room ordering is by appointment time, ascending (next up first).
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()),
  [rows]);

  // If the connection drops the screen must never go blank or show an error to
  // patients in the waiting room — it keeps showing the last successfully
  // loaded queue (React memory only) with a small "last updated" note, and
  // clears it by itself as soon as a poll succeeds again.
  const staleMinutes = error && lastUpdatedAt ? Math.max(1, Math.round((currentTime.getTime() - lastUpdatedAt) / 60000)) : 0;

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
          {staleMinutes > 0 && (
            <div style={{ fontSize: '12px', opacity: 0.45, fontWeight: 800, marginTop: '4px' }}>
              LAST UPDATED {staleMinutes} MIN AGO
            </div>
          )}
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
