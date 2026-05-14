import React from 'react';
import '../styles/AppointmentCard.css';

/**
 * AppointmentCard Component
 * Mobile/Tablet card display for appointments
 * Replaces table rows on smaller screens
 */
export default function AppointmentCard({
  appointment,
  statusMeta,
  getNextAction,
  onAction,
  onPrint,
  onPrescription,
  onEdit,
  onCancel,
  patients
}) {
  const meta = statusMeta[appointment.status];
  const next = getNextAction(appointment.status);
  const patient = patients.find(p => p.id === appointment.patientId);

  return (
    <div className="appointment-card" style={{ 
      border: `1.5px solid ${meta.color}20`,
      boxShadow: `0 8px 30px ${meta.color}08`,
      background: 'white'
    }}>
      {/* Precision Status Indicator */}
      <div className="card-status-bar" style={{ 
        background: `linear-gradient(90deg, ${meta.color} 0%, ${meta.color}dd 100%)`,
        height: '5px'
      }} />

      {/* Institutional Header */}
      <div className="card-header" style={{ padding: '20px 18px', background: '#fafbff' }}>
        <div className="card-token">
          <div className="token-number" style={{ fontSize: '20px', letterSpacing: '-0.5px' }}>#{appointment.tokenNo || appointment.id.split('-')[1] || '\u2014'}</div>
          <div className="token-label" style={{ letterSpacing: '1px' }}>INSTITUTIONAL_TOKEN</div>
        </div>
        <div className="card-status-badge" style={{ 
          backgroundColor: meta.bg, 
          borderColor: meta.color,
          padding: '6px 14px',
          borderRadius: '10px'
        }}>
          <span className="status-label" style={{ color: meta.color, letterSpacing: '0.5px', fontSize: '10px' }}>{meta.label}</span>
        </div>
      </div>

      {/* Patient Central Section */}
      <div className="card-section" style={{ padding: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
          <div style={{ 
            width: '42px', height: '42px', borderRadius: '12px', 
            background: '#f1f5f9', color: '#0f52ba', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontWeight: 900, fontSize: '16px', border: '1.5px solid #e2e8f0' 
          }}>
            {appointment.patientName.charAt(0)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="patient-name" style={{ fontSize: '15px', letterSpacing: '-0.2px' }}>{appointment.patientName.toUpperCase()}</div>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginTop: '2px' }}>
              {appointment.mobile} <span style={{ color: '#cbd5e1' }}>\u00B7</span> {appointment.patientAge}Y {appointment.patientGender.toUpperCase()}
            </div>
          </div>
        </div>
        <div className="patient-id" style={{ 
          background: '#f8fafc', padding: '6px 12px', borderRadius: '8px', 
          display: 'inline-block', fontSize: '10px', color: '#475569', border: '1px solid #e2e8f0' 
        }}>
          PATIENT_ID: <span style={{ color: '#0f52ba', fontWeight: 900 }}>{appointment.ptid || '\u2014'}</span>
        </div>
      </div>

      {/* Clinical & Referral Matrix */}
      <div className="card-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#fcfdfe', borderTop: '1px solid #f1f5f9' }}>
        <div className="info-block">
          <div className="section-title">REFERRAL_SOURCE</div>
          <div className="referral-name" style={{ fontSize: '12px' }}>{appointment.referredBy || 'DIRECT_WALKIN'}</div>
        </div>
        <div className="info-block">
          <div className="section-title">MODALITY_SPEC</div>
          <div className="doctor-name" style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{appointment.modality || 'NOT_SPECIFIED'}</div>
        </div>
      </div>

      {/* Primary Action Suite */}
      <div className="card-actions" style={{ padding: '15px', background: 'white', borderTop: '1.5px solid #f1f5f9', gap: '10px' }}>
        {next && (
          <button
            className="action-btn action-btn-primary"
            onClick={() => onAction(appointment.id, next.action)}
            style={{ 
              backgroundColor: next.color, 
              flex: 2, 
              borderRadius: '12px',
              boxShadow: `0 4px 12px ${next.color}30`
            }}
          >
            <span className="action-text" style={{ display: 'inline', letterSpacing: '0.5px' }}>{next.label}</span>
          </button>
        )}

        <div style={{ display: 'flex', gap: '8px', width: next ? 'auto' : '100%' }}>
          <button
            className="action-btn action-btn-secondary"
            onClick={() => onPrint(appointment)}
            style={{ borderRadius: '12px', border: '1.5px solid #e2e8f0', background: 'white', color: '#475569' }}
          >
            SLIP
          </button>

          <button
            className="action-btn action-btn-secondary"
            onClick={() => onPrescription && onPrescription(appointment)}
            style={{ 
              borderRadius: '12px', background: '#fffbeb', border: '1.5px solid #fde68a', color: '#b45309' 
            }}
          >
            RX
          </button>

          <button
            className="action-btn action-btn-danger"
            onClick={() => onCancel(appointment.id)}
            style={{ borderRadius: '12px', minWidth: '44px', background: '#fff1f2', color: '#e11d48', border: '1.5px solid #fecdd3' }}
          >
            \u2715
          </button>
        </div>
      </div>
    </div>
  );
}
