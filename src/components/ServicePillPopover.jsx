import React, { useState, useEffect, useRef } from 'react';

/**
 * ServicePillPopover — anchored editor for status + notes on one
 * AppointmentService line. Re-used by OperationsBoard's per-service
 * status pills + TechnicianPage's per-service cards so the
 * editing surface is identical across the app.
 *
 * Click-outside / Escape dismisses without saving. No portal — uses
 * fixed positioning with the anchor's bounding rect, then nudges
 * into view if it would clip the viewport.
 *
 * Phones (< 520px) get a centred modal with a dimmed backdrop;
 * desktop keeps the anchor-to-pill behaviour with a transparent
 * backdrop so it feels like an inline editor.
 *
 * Props:
 *   state    — { modality, serviceName, status, notes, anchorRect: DOMRect-like }
 *   onClose  — () => void
 *   onSave   — ({ status, notes }) => void
 */
export default function ServicePillPopover({ state, onClose, onSave }) {
  const { modality, serviceName, status: initialStatus, notes: initialNotes, anchorRect } = state;
  const [status, setStatus] = useState(initialStatus);
  const [notes,  setNotes]  = useState(initialNotes || '');
  const ref = useRef(null);

  // Click-outside + Escape to dismiss without saving. The popover
  // itself stops propagation so clicks inside don't close it.
  useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Responsive sizing.
  const gutter = 12;
  const viewportW = (typeof window !== 'undefined') ? window.innerWidth  : 1024;
  const viewportH = (typeof window !== 'undefined') ? window.innerHeight : 768;
  const isPhone = viewportW < 520;
  const popoverWidth  = Math.min(420, viewportW - gutter * 2);
  const popoverHeight = Math.min(520, viewportH - gutter * 2);
  let top  = anchorRect.bottom + 6;
  let left = anchorRect.left;
  if (isPhone) {
    left = Math.max(gutter, Math.round((viewportW - popoverWidth) / 2));
    top  = Math.max(gutter, Math.round((viewportH - popoverHeight) / 2));
  } else {
    if (top + popoverHeight > viewportH - gutter) {
      top = Math.max(gutter, anchorRect.top - popoverHeight - 6);
    }
    if (left + popoverWidth > viewportW - gutter) {
      left = Math.max(gutter, viewportW - popoverWidth - gutter);
    }
  }

  const dirty = (status !== initialStatus) || ((notes || '') !== (initialNotes || ''));

  const steps = [
    { value: 'NOT_STARTED', label: 'Not started', dot: '⚪', color: '#475569', bg: '#f1f5f9', border: '#e2e8f0', desc: 'Booked, waiting' },
    { value: 'IN_PROGRESS', label: 'In progress', dot: '🟡', color: '#a16207', bg: '#fef9c3', border: '#fde68a', desc: 'Scan started, just begun' },
    { value: 'IN_MID',      label: 'Half way',    dot: '🟧', color: '#b45309', bg: '#fef3c7', border: '#fcd34d', desc: 'Scan is half-way done' },
    { value: 'SCANNED',     label: 'Scanned',     dot: '🟠', color: '#9a3412', bg: '#ffedd5', border: '#fed7aa', desc: 'Acquisition complete' },
    { value: 'REPORTED',    label: 'Reported',    dot: '🔵', color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe', desc: 'Doctor signed off' },
    { value: 'DELIVERED',   label: 'Delivered',   dot: '🟢', color: '#047857', bg: '#d1fae5', border: '#a7f3d0', desc: 'Handed to patient' },
  ];

  return (
    <div
      role="dialog"
      aria-label={`Edit ${modality} service`}
      style={{
        position: 'fixed', inset: 0, zIndex: 10001,
        background: isPhone ? 'rgba(15, 23, 42, 0.35)' : 'transparent',
        pointerEvents: isPhone ? 'auto' : 'none',
      }}
      onClick={(e) => { if (isPhone && e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        style={{
          position: 'absolute',
          top, left,
          width: `${popoverWidth}px`,
          maxHeight: `${popoverHeight}px`,
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          boxShadow: '0 20px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.04)',
          padding: '14px 16px',
          pointerEvents: 'auto',
          display: 'flex', flexDirection: 'column', gap: '12px',
          fontFamily: 'inherit',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: '9px', fontWeight: 950, letterSpacing: '0.5px',
              color: '#0f52ba', textTransform: 'uppercase',
            }}>{modality || 'OTHER'}</div>
            <div style={{
              fontSize: '13px', fontWeight: 900, color: '#0f172a',
              marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }} title={serviceName}>{serviceName || '—'}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0,
              width: '24px', height: '24px',
              border: 'none', background: '#f1f5f9',
              borderRadius: '6px', cursor: 'pointer',
              fontSize: '14px', color: '#64748b', fontWeight: 900,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Status step picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{
            fontSize: '9px', fontWeight: 900, letterSpacing: '0.5px',
            color: '#64748b', textTransform: 'uppercase',
          }}>Status</span>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '6px',
          }}>
            {steps.map((step) => {
              const isActive = status === step.value;
              return (
                <button
                  key={step.value}
                  type="button"
                  onClick={() => setStatus(step.value)}
                  title={step.desc}
                  style={{
                    padding: '8px 4px',
                    borderRadius: '8px',
                    border: isActive ? `1.5px solid ${step.color}` : '1px solid #e2e8f0',
                    background: isActive ? step.bg : 'white',
                    color: isActive ? step.color : '#64748b',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '9.5px', fontWeight: 900, letterSpacing: '0.2px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                    transition: 'all 0.12s',
                    boxShadow: isActive ? `0 2px 6px -3px ${step.color}66` : 'none',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = step.border; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = '#e2e8f0'; }}
                >
                  <span style={{ fontSize: '13px' }}>{step.dot}</span>
                  <span style={{ textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.2 }}>{step.label}</span>
                </button>
              );
            })}
          </div>
          {/* Cancelled — side exit */}
          <button
            type="button"
            onClick={() => setStatus('CANCELLED')}
            title="Service withdrawn from this visit"
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: status === 'CANCELLED' ? '1.5px solid #9f1239' : '1px dashed #fecdd3',
              background: status === 'CANCELLED' ? '#ffe4e6' : 'white',
              color: '#9f1239',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '10px', fontWeight: 900, letterSpacing: '0.3px',
              textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
              alignSelf: 'flex-start',
              transition: 'all 0.12s',
            }}
          >
            <span>✕</span>
            {status === 'CANCELLED' ? 'Cancelled — selected' : 'Cancel this service'}
          </button>
          {/* Live description of current selection */}
          <div style={{
            fontSize: '10px', fontWeight: 700, color: '#64748b',
            padding: '6px 10px',
            background: '#f8fafc', borderRadius: '7px',
            border: '1px solid #f1f5f9',
          }}>
            <span style={{ fontWeight: 900, color: '#0f172a', marginRight: '6px' }}>{(steps.find(s => s.value === status) || { label: 'Cancelled', desc: 'Service withdrawn' }).label}:</span>
            {(steps.find(s => s.value === status) || { desc: 'Service withdrawn from this visit' }).desc}
          </div>
        </div>

        {/* Notes textarea */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            fontSize: '9px', fontWeight: 900, letterSpacing: '0.5px',
            color: '#64748b', textTransform: 'uppercase',
          }}>
            <span>Notes (ops team only)</span>
            <span style={{ fontWeight: 700, color: notes.length > 500 ? '#dc2626' : '#94a3b8' }}>{notes.length}/500</span>
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.substring(0, 500))}
            placeholder="e.g. Patient asked to come back tomorrow, sedation needed…"
            rows={3}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontSize: '12px', fontWeight: 600, color: '#0f172a',
              fontFamily: 'inherit',
              resize: 'vertical',
              minHeight: '60px', maxHeight: '120px',
              outline: 'none',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#0f52ba'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
          />
        </label>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: 'white',
              color: '#475569',
              fontSize: '11px', fontWeight: 900, letterSpacing: '0.3px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textTransform: 'uppercase',
            }}
          >Cancel</button>
          <button
            type="button"
            disabled={!dirty}
            onClick={() => onSave({ status, notes })}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: 'none',
              background: dirty
                ? 'linear-gradient(135deg, #0f52ba 0%, #1e3a8a 100%)'
                : '#cbd5e1',
              color: 'white',
              fontSize: '11px', fontWeight: 900, letterSpacing: '0.3px',
              cursor: dirty ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              textTransform: 'uppercase',
              boxShadow: dirty ? '0 3px 8px -3px rgba(15, 82, 186, 0.55)' : 'none',
            }}
          >Save ✓</button>
        </div>
      </div>
    </div>
  );
}
