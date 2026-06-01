import React from 'react';
import { getServiceLines, getUniqueModalities, getReportProgressLabel } from '../utils/appointmentServices';
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

      {/* Token & Status Section */}
      <div className="card-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div className="card-token">
            <div className="token-number">TOKEN #{appointment.tokenNo || appointment.id?.split('-')[1] || '—'}</div>
            <div className="token-label">Mission ID</div>
          </div>
          <div className="card-status-badge" style={{
            backgroundColor: meta.bg,
            color: meta.color,
            borderColor: `${meta.color}33`
          }}>
            <span style={{ fontSize: '12px', lineHeight: '1', display: 'flex', alignItems: 'center' }}>{meta.icon}</span>
            <span style={{ lineHeight: '1', display: 'flex', alignItems: 'center', fontWeight: 800 }}>{meta.label}</span>
          </div>
        </div>
      </div>

      {/* Patient Section */}
      <div className="card-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div className="patient-avatar">
            {appointment.patientName.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
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
        {(() => {
          const lines       = getServiceLines(appointment);
          const modalities  = getUniqueModalities(appointment);
          const progress    = getReportProgressLabel(appointment);
          const primaryName = lines[0]?.serviceName || appointment.service || '—';
          const extraCount  = lines.length - 1;
          return (
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Service</span>
                <div className="value" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{primaryName}</span>
                  {extraCount > 0 && (
                    <span style={{
                      fontSize: '9px', fontWeight: 900,
                      color: '#0f52ba', background: '#dbeafe',
                      padding: '1px 6px', borderRadius: '999px', letterSpacing: '0.3px',
                    }}>+{extraCount} more</span>
                  )}
                </div>
                {progress && (
                  <div style={{ marginTop: '3px' }}>
                    <span style={{
                      fontSize: '9px', fontWeight: 900,
                      color: '#047857', background: '#d1fae5',
                      padding: '1px 6px', borderRadius: '999px', letterSpacing: '0.3px',
                      border: '1px solid #a7f3d0',
                    }}>{progress}</span>
                  </div>
                )}
              </div>
              <div className="info-item">
                <span className="label">Modality</span>
                <div className="value" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                  {modalities.map((m, idx) => (
                    <span key={`${m}-${idx}`} style={{
                      color: '#0f52ba', background: '#eff6ff',
                      padding: '1px 6px', borderRadius: '4px',
                      fontSize: '10px', fontWeight: 900, letterSpacing: '0.3px',
                    }}>{m}</span>
                  ))}
                </div>
              </div>
              <div className="info-item">
                <span className="label">Specialist</span>
                <div className="value">{appointment.doctor || 'UNASSIGNED'}</div>
              </div>
              <div className="info-item">
                <span className="label">Mission Date</span>
                <div className="value" style={{ color: '#0f52ba', fontWeight: 900 }}>
                  {appointment.dateTime ? new Date(appointment.dateTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                </div>
              </div>
            </div>
          );
        })()}
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
