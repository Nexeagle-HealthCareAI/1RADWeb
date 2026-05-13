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
    <div className="appointment-card">
      {/* Status indicator bar */}
      <div className="card-status-bar" style={{ backgroundColor: meta.color }} />

      {/* Card header with token and status */}
      <div className="card-header">
        <div className="card-token">
          <div className="token-number">#{appointment.tokenNo || appointment.id.split('-')[1] || '—'}</div>
          <div className="token-label">TOKEN</div>
        </div>
        <div className="card-status-badge" style={{ backgroundColor: meta.bg, borderColor: meta.color }}>
          <span className="status-icon">{meta.icon}</span>
          <span className="status-label">{meta.label}</span>
        </div>
      </div>

      {/* Patient info section */}
      <div className="card-section">
        <div className="section-title">Patient</div>
        <div className="patient-info">
          <div className="patient-name">{appointment.patientName}</div>
          <div className="patient-details">
            {appointment.mobile} • {appointment.patientAge}y {appointment.patientGender}
          </div>
          <div className="patient-id">ID: {appointment.ptid || '—'}</div>
        </div>
      </div>

      {/* Referral info section */}
      <div className="card-section">
        <div className="section-title">Referral</div>
        <div className="referral-info">
          <div className="referral-name">{appointment.referredBy || 'Self'}</div>
          {appointment.referredContact && appointment.referredContact !== 'N/A' && (
            <div className="referral-contact">{appointment.referredContact}</div>
          )}
        </div>
      </div>

      {/* Doctor info section */}
      <div className="card-section">
        <div className="section-title">Specialist</div>
        <div className="doctor-name">{appointment.doctor}</div>
      </div>

      {/* Actions section */}
      <div className="card-actions">
        {next && (
          <button
            className="action-btn action-btn-primary"
            onClick={() => onAction(appointment.id, next.action)}
            style={{ backgroundColor: next.color }}
            title={next.label}
          >
            <span className="action-icon">{next.icon}</span>
            <span className="action-text">{next.label}</span>
          </button>
        )}

        <button
          className="action-btn action-btn-secondary"
          onClick={() => onPrint(appointment)}
          title="Print Token Slip"
          style={{ fontSize: '10px', fontWeight: 800, padding: '0 12px' }}
        >
          TOKEN
        </button>

        <button
          className="action-btn action-btn-secondary"
          onClick={() => onPrescription && onPrescription(appointment)}
          title="Print Prescription"
          style={{ background: '#fffbeb', borderColor: '#fde68a', fontSize: '10px', fontWeight: 800, padding: '0 12px', color: '#b45309' }}
        >
          PRESCRIPTION
        </button>

        {appointment.status !== 'cancelled' && appointment.status !== 'completed' && (
          <>
            <button
              className="action-btn action-btn-secondary"
              onClick={() => onEdit && onEdit(appointment)}
              title="Edit Appointment"
              style={{ fontSize: '10px', fontWeight: 800, padding: '0 12px' }}
            >
              EDIT
            </button>

            <button
              className="action-btn action-btn-danger"
              onClick={() => onCancel(appointment.id)}
              title="Cancel"
              style={{ width: '40px' }}
            >
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  );
}
