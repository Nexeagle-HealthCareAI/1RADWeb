import React, { useState } from 'react';
import { getServiceLines, getUniqueModalities, getReportProgressLabel } from '../utils/appointmentServices';
import '../styles/AppointmentCard.css';

/**
 * AppointmentCard Component
 * Premium Native Android / Mobile UI Card
 * Replaces table rows on mobile (<768px) with a tactile, high-density card.
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
  patients,
  onPrintServicePrescription,
}) {
  const meta = statusMeta[appointment.status] || statusMeta['unknown'];
  const next = getNextAction(appointment.status);
  const [expanded, setExpanded] = useState(false);
  const lines = getServiceLines(appointment);
  const modalities = getUniqueModalities(appointment);
  const progress = getReportProgressLabel(appointment);
  const primaryName = lines[0]?.serviceName || appointment.service || '—';
  const isMulti = lines.length > 1;

  // Check if modified offline or pending sync in outbox
  const isOfflineCached = String(appointment.id || '').startsWith('temp-') || appointment._offline;

  return (
    <div className="appointment-card android-card" style={{ borderLeft: `5px solid ${meta.color}` }}>
      {appointment.status?.toLowerCase() === 'delivered' && (
        <div className="card-watermark">DELIVERED</div>
      )}

      {/* Top Header Strip: Token, Mission ID, Status Badge */}
      <div className="android-card-header">
        <div className="token-cluster">
          <span className="token-badge">#{appointment.tokenNo || appointment.id?.split('-')[1] || '—'}</span>
          <span className="mission-id-tag">ID: {appointment.ptid || appointment.id || '—'}</span>
          {isOfflineCached && (
            <span className="offline-cached-badge" title="Saved locally, waiting to sync">☁️ Outbox</span>
          )}
        </div>
        <div className="status-pill-glowing" style={{ backgroundColor: meta.bg, color: meta.color, borderColor: `${meta.color}44` }}>
          <span>{meta.icon}</span>
          <span>{meta.label}</span>
        </div>
      </div>

      {/* Patient Hero Box */}
      <div className="android-card-body">
        <div className="patient-hero-row">
          <div className="patient-avatar-box">
            {appointment.patientName?.charAt(0)?.toUpperCase() || 'P'}
          </div>
          <div className="patient-info-col">
            <div className="patient-name-text">{appointment.patientName?.toUpperCase() || 'UNKNOWN PATIENT'}</div>
            <div className="patient-demographics">
              <span className="demo-chip">{appointment.patientAge || '—'}Y {appointment.patientGender?.charAt(0)?.toUpperCase() || ''}</span>
              {appointment.mobile && (
                <a 
                  href={`tel:${appointment.mobile}`} 
                  onClick={e => e.stopPropagation()} 
                  className="mobile-call-link"
                  title="Tap to call patient"
                >
                  📞 {appointment.mobile}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Clinical Summary & Modalities */}
        <div className="clinical-summary-box">
          <div className="service-primary-row">
            <div className="modality-chips-group">
              {modalities.map((m, idx) => (
                <span key={`${m}-${idx}`} className={`modality-pill mod-${String(m).toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
                  {m}
                </span>
              ))}
            </div>
            <div className="service-name-text">{primaryName}</div>
          </div>

          <div className="clinical-meta-row">
            <span className="specialist-chip" title={appointment.doctor ? `Assigned to ${appointment.doctor}` : 'No specialist'}>
              🩺 {appointment.doctor || 'Unassigned Doctor'}
            </span>
            {appointment.referredBy && (
              <span className="referrer-chip" title={`Referred by ${appointment.referredBy}`}>
                ↗ {appointment.referredBy}
              </span>
            )}
            {progress && (
              <span className="progress-chip">{progress}</span>
            )}
          </div>
        </div>

        {/* Accordion Toggle for Multi/Detailed Services */}
        {lines.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className={`service-accordion-btn ${expanded ? 'open' : ''}`}
          >
            <span>{expanded ? `Hide Service Details (${lines.length})` : (isMulti ? `View All ${lines.length} Services` : `View Service Details`)}</span>
            <span className="chevron-icon">{expanded ? '▲' : '▼'}</span>
          </button>
        )}

        {/* Expanded Services Drawer */}
        {expanded && (
          <div className="expanded-services-panel">
            <div className="panel-title">SERVICES ON THIS VISIT</div>
            <div className="services-list">
              {lines.map((line, idx) => {
                const canPrint = (String(line.status || '').toUpperCase() !== 'FUTURE' && String(line.status || '').toUpperCase() !== 'SCHEDULED');
                return (
                  <div key={line.id || `mline-${idx}`} className="service-line-item">
                    <div className="service-line-info">
                      <span className="service-line-mod">{line.modality || 'OT'}</span>
                      <span className="service-line-name">{line.serviceName || '—'}</span>
                    </div>
                    <div className="service-line-actions">
                      <span className="service-status-pill">{line.status || 'Scheduled'}</span>
                      {onPrintServicePrescription && (
                        <button
                          type="button"
                          disabled={!canPrint}
                          onClick={() => onPrintServicePrescription(appointment, line.id)}
                          className="print-rx-btn"
                        >
                          🖨️ Rx
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tactile Android Action Footer Strip */}
      <div className="android-card-footer">
        {next ? (
          <button
            type="button"
            className="hero-action-btn"
            onClick={() => onAction(appointment.id, next.action)}
            style={{ backgroundColor: next.color, boxShadow: `0 6px 16px ${next.color}33` }}
          >
            <span className="action-icon">{next.icon}</span>
            <span className="action-text">{next.label}</span>
          </button>
        ) : (
          <div className="no-action-spacer">No Pending Action</div>
        )}

        <div className="quick-action-icons">
          <button type="button" className="icon-btn" onClick={() => onPrint(appointment)} title="Print Token Slip">
            🖨️
          </button>
          <button type="button" className="icon-btn" onClick={() => onPrescription && onPrescription(appointment)} title="Report & Prescription">
            📄
          </button>
          <button type="button" className="icon-btn" onClick={() => onEdit(appointment)} title="Modify Appointment">
            ✏️
          </button>
          <button type="button" className="icon-btn cancel-btn" onClick={() => onCancel(appointment.id)} title="Cancel Appointment">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
