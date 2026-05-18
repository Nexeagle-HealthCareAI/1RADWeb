import React from 'react';

const TYPE_CONFIG = {
  error:   { icon: '❌', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  warning: { icon: '⚠️', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  info:    { icon: 'ℹ️', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  success: { icon: '✅', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
};

const BADGE = (count, type) => {
  const cfg = TYPE_CONFIG[type];
  if (!count) return null;
  const labels = { error: 'error', warning: 'warning', info: 'note', success: 'pass' };
  return (
    <span key={type} style={{
      fontSize: '10px', background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`, borderRadius: '10px', padding: '1px 7px',
    }}>
      {cfg.icon} {count} {labels[type]}{count !== 1 ? 's' : ''}
    </span>
  );
};

/**
 * QualityCheckPanel — fixed right sidebar displaying report quality results.
 *
 * Props:
 *   open        {boolean}
 *   results     {{ type, code, message, suggestion }[]}
 *   onRerun     {fn()}   — re-run check
 *   onClose     {fn()}
 */
export default function QualityCheckPanel({ open, results = [], onRerun, onClose }) {
  if (!open) return null;

  const errors   = results.filter(r => r.type === 'error');
  const warnings = results.filter(r => r.type === 'warning');
  const infos    = results.filter(r => r.type === 'info');
  const passes   = results.filter(r => r.type === 'success');

  // Sort: errors first, then warnings, info, success
  const sorted = [
    ...results.filter(r => r.type === 'error'),
    ...results.filter(r => r.type === 'warning'),
    ...results.filter(r => r.type === 'info'),
    ...results.filter(r => r.type === 'success'),
  ];

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0,
      width: '310px',
      background: '#fff',
      borderLeft: '1px solid #e5e7eb',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
      zIndex: 901,
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    }}>

      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #e5e7eb', background: '#f8f9fa' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px', color: '#111827' }}>📋 Quality Check</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
          >✕</button>
        </div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {BADGE(errors.length, 'error')}
          {BADGE(warnings.length, 'warning')}
          {BADGE(infos.length, 'info')}
          {errors.length === 0 && warnings.length === 0 && passes.length > 0 && BADGE(passes.length, 'success')}
        </div>
      </div>

      {/* Result list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {sorted.length === 0 && (
          <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '12px', padding: '32px 12px' }}>
            Click <strong>Re-run</strong> to analyse the report.
          </p>
        )}
        {sorted.map((r, i) => {
          const cfg = TYPE_CONFIG[r.type] ?? TYPE_CONFIG.info;
          return (
            <div key={i} style={{
              background: cfg.bg, border: `1px solid ${cfg.border}`,
              borderRadius: '6px', padding: '10px 12px', marginBottom: '7px',
            }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{cfg.icon}</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: cfg.color, lineHeight: 1.4 }}>
                    {r.message}
                  </div>
                  {r.suggestion && (
                    <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '4px', lineHeight: 1.5 }}>
                      {r.suggestion}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '8px' }}>
        <button
          onClick={onRerun}
          style={{
            flex: 1, padding: '7px', border: '1px solid #3b82f6', background: '#eff6ff',
            borderRadius: '5px', cursor: 'pointer', fontSize: '12px',
            fontFamily: 'inherit', fontWeight: 600, color: '#1d4ed8',
          }}
        >
          🔄 Re-run Check
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '7px 14px', border: '1px solid #d1d5db', background: '#f9fafb',
            borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
