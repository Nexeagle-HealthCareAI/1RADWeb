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
  const meta = statusMeta[appointment.status] || statusMeta['unknown'];
  const next = getNextAction(appointment.status);

  return (
    <div className="appointment-card">
      {/* Status Bar */}
      <div className="card-status-bar" style={{ 
        background: `linear-gradient(90deg, ${meta.color} 0%, ${meta.color}88 100%)`
      }} />

      {/* Header */}
      <div className="card-header">
        <div className="card-token">
          <div className="token-number">#{appointment.tokenNo || appointment.id.split('-')[1] || '—'}</div>
          <div className="token-label">Token ID</div>
        </div>
        <div className="card-status-badge" style={{ 
          backgroundColor: meta.bg, 
          color: meta.color,
          borderColor: `${meta.color}33`
        }}>
          {meta.icon} {meta.label}
        </div>
      </div>

      {/* Patient Section */}
      <div className="card-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="patient-avatar">
            {appointment.patientName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="patient-name">{appointment.patientName.toUpperCase()}</div>
            <div className="patient-meta">
              {appointment.mobile} • {appointment.patientAge}Y {appointment.patientGender?.toUpperCase()}
            </div>
          </div>
        </div>
        <div className="patient-id-tag">
          MISSION_ID: <span>{appointment.ptid || appointment.id || '—'}</span>
        </div>
      </div>

      {/* Info Grid */}
      <div className="card-section">
        <div className="info-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="info-item">
            <span className="label">Modality</span>
            <div className="value">{appointment.modality || '—'}</div>
          </div>
          <div className="info-item">
            <span className="label">Referrer</span>
            <div className="value">{appointment.referredBy || 'Direct'}</div>
          </div>
          <div className="info-item">
            <span className="label">Mission Date</span>
            <div className="value" style={{ color: '#0f52ba', fontWeight: 900 }}>
              {appointment.dateTime ? new Date(appointment.dateTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="card-actions">
        {next && (
          <button
            className="action-btn-main"
            onClick={() => onAction(appointment.id, next.action)}
            style={{ 
              backgroundColor: next.color, 
              color: 'white',
              boxShadow: `0 8px 16px ${next.color}33`
            }}
          >
            {next.icon} {next.label}
          </button>
        )}

        <button className="action-btn-icon" onClick={() => onPrint(appointment)} title="Print Slip">
          🖨️
        </button>

        <button className="action-btn-icon" onClick={() => onPrescription && onPrescription(appointment)} title="Report">
          📄
        </button>

        <button 
          className="action-btn-icon" 
          onClick={() => onEdit(appointment)} 
          title="Edit"
        >
          ✏️
        </button>

        <button 
          className="action-btn-icon" 
          onClick={() => onCancel(appointment.id)} 
          style={{ color: '#ef4444' }}
          title="Cancel"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
