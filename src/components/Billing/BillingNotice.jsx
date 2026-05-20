import React, { useEffect, useState } from 'react';

/**
 * Unified notification + confirmation modal for the Billing section.
 *
 * Usage:
 *   const { notify, confirm, modalProps } = useBillingNotice();
 *   // ...
 *   notify({ type: 'error', message: '...' });
 *   confirm({ message: 'Delete this?', onConfirm: () => doIt() });
 *   // Render once near the page root:
 *   <BillingNoticeModal {...modalProps} />
 */

const TONES = {
  error:   { icon: '⚠️', tint: '#dc2626', bg: '#fef2f2', border: '#fecaca', title: 'Error' },
  warning: { icon: '⚠️', tint: '#b45309', bg: '#fffbeb', border: '#fde68a', title: 'Heads up' },
  success: { icon: '✓',  tint: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', title: 'Success' },
  info:    { icon: 'ℹ',  tint: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', title: 'Notice' },
};

export function useBillingNotice() {
  const [state, setState] = useState(null);
  const close = () => setState(null);

  const notify = (arg) => {
    if (!arg) return;
    if (typeof arg === 'string') setState({ kind: 'notice', type: 'info', message: arg });
    else setState({ kind: 'notice', type: arg.type || 'info', title: arg.title, message: arg.message });
  };

  const confirm = ({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, danger = false }) => {
    setState({ kind: 'confirm', title, message, confirmText, cancelText, onConfirm, danger });
  };

  return { notify, confirm, modalProps: { state, close } };
}

export function BillingNoticeModal({ state, close }) {
  // ESC closes
  useEffect(() => {
    if (!state) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, close]);

  if (!state) return null;

  const isConfirm = state.kind === 'confirm';
  const tone = isConfirm
    ? (state.danger ? TONES.error : TONES.info)
    : (TONES[state.type] || TONES.info);
  const title = state.title || tone.title;

  return (
    <div
      onClick={() => { if (!isConfirm) close(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100000,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'billingNoticeFade 0.18s ease-out',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '440px',
          background: 'white', borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 20px 50px -12px rgba(15, 23, 42, 0.25)',
          padding: '24px',
          animation: 'billingNoticePop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: '52px', height: '52px', borderRadius: '50%',
            background: tone.bg, border: `1px solid ${tone.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', color: tone.tint,
            margin: '0 auto 16px',
          }}
        >{tone.icon}</div>

        {/* Title */}
        <h3 style={{
          margin: '0 0 8px',
          fontSize: '16px', fontWeight: 700,
          color: '#0f172a',
          textAlign: 'center',
          letterSpacing: '-0.2px',
        }}>{title}</h3>

        {/* Message */}
        {state.message && (
          <p style={{
            margin: '0 0 22px',
            fontSize: '13px', lineHeight: 1.55,
            color: '#475569',
            textAlign: 'center',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>{state.message}</p>
        )}

        {/* Actions */}
        {isConfirm ? (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={close}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: '10px',
                border: '1px solid #e2e8f0', background: 'white',
                color: '#0f172a', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
            >{state.cancelText || 'Cancel'}</button>
            <button
              type="button"
              onClick={() => { const fn = state.onConfirm; close(); if (fn) fn(); }}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: '10px',
                border: 'none',
                background: state.danger ? '#dc2626' : '#0f172a',
                color: 'white', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', boxShadow: `0 4px 12px ${state.danger ? 'rgba(220,38,38,0.25)' : 'rgba(15,23,42,0.2)'}`,
              }}
            >{state.confirmText || 'Confirm'}</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={close}
            autoFocus
            style={{
              width: '100%', padding: '10px 16px', borderRadius: '10px',
              border: 'none', background: '#0f172a', color: 'white',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(15,23,42,0.2)',
            }}
          >OK</button>
        )}
      </div>

      <style>{`
        @keyframes billingNoticeFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes billingNoticePop { from { transform: scale(0.92) translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>
    </div>
  );
}
