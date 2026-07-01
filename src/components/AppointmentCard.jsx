import React, { useState } from 'react';
import { getServiceLines, getUniqueModalities, getReportProgressLabel } from '../utils/appointmentServices';
import '../styles/AppointmentCard.css';

/**
 * AppointmentCard Component
 * Mobile/Tablet card display for appointments
 * Replaces table rows on smaller screens
 *
 * Multi-service rollout — when the visit has more than one service
 * line, a "Show services" chevron appears under the meta row. Clicking
 * expands an in-card panel listing each service with its own status
 * and per-line actions (View report, Print prescription). Single-
 * service visits get no chevron and no expansion — they look exactly
 * as they always have.
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
  // Multi-service rollout — Print prescription callback. The earlier
  // "View report" was removed at the receptionist's request — they
  // jump into reports via the row-level 📄 Report button which lands
  // on the first unreported service.
  onPrintServicePrescription,
}) {
  const meta = statusMeta[appointment.status] || statusMeta['unknown'];
  const next = getNextAction(appointment.status);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="appointment-card" style={{ position: 'relative', overflow: 'hidden' }}>
      {appointment.status?.toLowerCase() === 'delivered' && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-15deg)',
          color: 'rgba(220, 38, 38, 0.15)',
          borderTop: '4px solid rgba(220, 38, 38, 0.15)',
          borderBottom: '4px solid rgba(220, 38, 38, 0.15)',
          padding: '10px 40px',
          fontSize: '3rem', fontWeight: 900, fontFamily: 'serif',
          pointerEvents: 'none', userSelect: 'none', zIndex: 0,
          whiteSpace: 'nowrap', letterSpacing: '8px'
        }}>
          DELIVERED
        </div>
      )}
      {/* Status Bar */}
      <div className="card-status-bar" style={{
        background: `linear-gradient(90deg, ${meta.color} 0%, ${meta.color}88 100%)`,
        position: 'relative', zIndex: 1
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
          const isMulti     = lines.length > 1;
          return (
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Service</span>
                <div className="value" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{primaryName}</span>
                  {extraCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(true)}
                      title={`Show all ${lines.length} services on this visit`}
                      style={{
                        fontSize: '9px', fontWeight: 900,
                        color: '#0f52ba', background: '#dbeafe',
                        padding: '1px 8px', borderRadius: '999px', letterSpacing: '0.3px',
                        border: '1px solid #bfdbfe',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >+{extraCount} more</button>
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
                <div className="value">
                  <span
                    title={appointment.doctor ? `Assigned to ${appointment.doctor}` : 'No specialist assigned'}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      fontSize: '10px', fontWeight: 900, letterSpacing: '0.2px',
                      color: appointment.doctor ? '#0c4a6e' : '#9a3412',
                      background: appointment.doctor ? '#e0f2fe' : '#fef3c7',
                      border: `1px solid ${appointment.doctor ? '#bae6fd' : '#fde68a'}`,
                      padding: '2px 8px', borderRadius: '999px',
                    }}
                  >
                    <span aria-hidden="true" style={{ fontSize: '10px' }}>🩺</span>
                    {appointment.doctor || 'Unassigned'}
                  </span>
                </div>
              </div>
              <div className="info-item">
                <span className="label">Mission Date</span>
                <div className="value" style={{ color: '#0f52ba', fontWeight: 900 }}>
                  {appointment.dateTime ? new Date(appointment.dateTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                </div>
              </div>
              {/* Referrer chip — only shown when the visit has a
                  referrer. Spans the full info row width so a long
                  referrer name wraps cleanly on phone widths. */}
              {appointment.referredBy && (
                <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                  <span className="label">Referred By</span>
                  <div className="value">
                    <span
                      title={`Referred by ${appointment.referredBy}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        fontSize: '10px', fontWeight: 900, letterSpacing: '0.2px',
                        color: '#5b21b6', background: '#ede9fe',
                        border: '1px solid #ddd6fe',
                        padding: '2px 8px', borderRadius: '999px',
                      }}
                    >
                      <span aria-hidden="true" style={{ fontSize: '10px' }}>↗</span>
                      {appointment.referredBy}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Show-services chevron. Shown for every visit now (was
            multi-service only) — single-service rows need an
            affordance to access the per-service Print prescription
            button too, since the row-level prescription button was
            removed. Label adapts to singular / plural. */}
        {(() => {
          const lines = getServiceLines(appointment);
          if (lines.length === 0) return null;
          const isMulti = lines.length > 1;
          return (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              aria-expanded={expanded}
              style={{
                marginTop: '10px',
                width: '100%',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                background: expanded ? '#0f52ba' : 'white',
                color: expanded ? 'white' : '#0f52ba',
                cursor: 'pointer',
                fontSize: '11px', fontWeight: 900, letterSpacing: '0.3px',
                fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <span>
                {expanded
                  ? (isMulti ? `Hide services (${lines.length})` : 'Hide details')
                  : (isMulti ? `Show all ${lines.length} services` : 'Show details')}
              </span>
              <span aria-hidden="true" style={{
                display: 'inline-block',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.18s ease',
              }}>▾</span>
            </button>
          );
        })()}
      </div>

      {/* Expanded per-service panel (mobile/tablet). Renders for any
          visit with at least one service line — single-service rows
          show one card so the receptionist can still tap Print
          prescription from the worklist. */}
      {expanded && (() => {
        const lines = getServiceLines(appointment);
        if (lines.length === 0) return null;

        const accentFor = (m) => {
          const k = String(m || '').toUpperCase();
          return ({
            'X-RAY': '#10b981',
            CT:      '#3b82f6',
            MRI:     '#8b5cf6',
            ULTRASOUND: '#06b6d4',
            USG:     '#06b6d4',
            MAMMOGRAPHY: '#ec4899',
            MG:      '#ec4899',
            DEXA:    '#f59e0b',
            PET:     '#f97316',
            NUCLEAR: '#84cc16',
          }[k] || '#64748b');
        };
        const stepRank = (status) => {
          const s = String(status || '').toUpperCase();
          if (s === 'DELIVERED')   return 6;
          if (s === 'REPORTED')    return 5;
          if (s === 'SCANNED')     return 4;
          if (s === 'IN_MID')      return 3;
          if (s === 'IN_PROGRESS') return 2;
          return 1;
        };
        const stepLabel = (status) => {
          const s = String(status || '').toUpperCase();
          if (s === 'DELIVERED')   return { label: 'Delivered',   color: '#047857', bg: '#d1fae5', border: '#a7f3d0' };
          if (s === 'REPORTED')    return { label: 'Reported',    color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' };
          if (s === 'SCANNED')     return { label: 'Scanned',     color: '#9a3412', bg: '#ffedd5', border: '#fed7aa' };
          if (s === 'IN_MID')      return { label: 'Half Way',    color: '#b45309', bg: '#fef3c7', border: '#fcd34d' };
          if (s === 'IN_PROGRESS') return { label: 'In Progress', color: '#a16207', bg: '#fef9c3', border: '#fde68a' };
          if (s === 'CANCELLED')   return { label: 'Cancelled',   color: '#9f1239', bg: '#ffe4e6', border: '#fecdd3' };
          return                         { label: 'Not Started',  color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' };
        };

        return (
          <div className="card-section" style={{
            background: 'linear-gradient(180deg, #f8fbff 0%, #f1f5fb 100%)',
            borderTop: '1px solid #e2e8f0',
            padding: '12px 14px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '10px',
            }}>
              <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Services on this visit
              </div>
              <span style={{ fontSize: '9px', fontWeight: 950, color: 'white', background: '#0f52ba', padding: '2px 7px', borderRadius: '999px' }}>
                {lines.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {lines.map((line, idx) => {
                const accent    = accentFor(line.modality);
                const step      = stepRank(line.status);
                const pill      = stepLabel(line.status);
                const canPrint  = step >= 3;
                return (
                  <div
                    key={line.id || `mline-${idx}`}
                    style={{
                      position: 'relative',
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '10px 12px 10px 14px',
                      display: 'flex', flexDirection: 'column', gap: '8px',
                    }}
                  >
                    <div aria-hidden="true" style={{
                      position: 'absolute', left: 0, top: 8, bottom: 8,
                      width: '3px', borderRadius: '3px',
                      background: accent,
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '9px', fontWeight: 950, letterSpacing: '0.4px',
                        color: '#0f52ba', background: '#eff6ff',
                        padding: '2px 7px', borderRadius: '5px',
                        border: '1px solid #dbeafe',
                      }}>{line.modality || 'OT'}</span>
                      <span style={{
                        flex: 1, minWidth: 0,
                        fontSize: '12px', fontWeight: 800, color: '#0f172a',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }} title={line.serviceName}>
                        {line.serviceName || '—'}
                      </span>
                      <span style={{
                        fontSize: '8.5px', fontWeight: 900, letterSpacing: '0.3px',
                        color: pill.color, background: pill.bg,
                        padding: '2px 7px', borderRadius: '999px',
                        border: `1px solid ${pill.border}`,
                        textTransform: 'uppercase',
                      }}>{pill.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        disabled={!canPrint || !onPrintServicePrescription}
                        onClick={() => onPrintServicePrescription && onPrintServicePrescription(appointment, line.id)}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          background: canPrint ? 'linear-gradient(135deg, #0f52ba 0%, #1e3a8a 100%)' : '#f8fafc',
                          color: canPrint ? 'white' : '#94a3b8',
                          fontSize: '11px', fontWeight: 900, letterSpacing: '0.3px',
                          cursor: (canPrint && onPrintServicePrescription) ? 'pointer' : 'not-allowed',
                          fontFamily: 'inherit',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                          boxShadow: canPrint ? '0 4px 10px -4px rgba(15, 82, 186, 0.45)' : 'none',
                        }}
                      >
                        🖨️ Print prescription
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
