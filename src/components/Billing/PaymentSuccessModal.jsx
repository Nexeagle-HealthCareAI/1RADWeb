/**
 * PaymentSuccessModal
 * ─────────────────────────────────────────────────────────────────────────────
 * The full-screen celebration modal shown after a payment is collected
 * (online → green, offline/queued → amber).
 *
 * Props:
 *   paymentSuccess  { amount, method, patientName, invoiceId, offline }
 *   onDismiss       () → void
 *   isMobile        boolean
 */

import React from 'react';

export default function PaymentSuccessModal({ paymentSuccess, onDismiss, isMobile }) {
  if (!paymentSuccess) return null;

  const isOffline = paymentSuccess.offline;
  const gradient = isOffline
    ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
    : 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
  const shadow = isOffline
    ? '0 8px 24px rgba(245,158,11,0.25)'
    : '0 8px 24px rgba(16,185,129,0.25)';

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(10, 22, 40, 0.55)',
        backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.25s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '28px',
          width: isMobile ? 'calc(100% - 32px)' : '420px',
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.22)',
          animation: 'slideUp 0.3s cubic-bezier(.16,1,.3,1)',
        }}
      >
        {/* Coloured header band */}
        <div style={{ background: gradient, padding: '36px 32px 28px', textAlign: 'center', position: 'relative' }}>
          <div style={{
            width: '72px', height: '72px',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '36px',
          }}>
            {isOffline ? '📶' : '✓'}
          </div>
          <div style={{ fontSize: '11px', fontWeight: 950, color: 'rgba(255,255,255,0.75)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
            {isOffline ? 'QUEUED OFFLINE' : 'PAYMENT RECEIVED'}
          </div>
          <div style={{ fontSize: '38px', fontWeight: 950, color: 'white', letterSpacing: '-1px' }}>
            ₹{Number(paymentSuccess.amount).toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginTop: '6px' }}>
            via {paymentSuccess.method}
          </div>
        </div>

        {/* Detail rows */}
        <div style={{ padding: '28px 32px 8px' }}>
          {[
            { label: 'PATIENT', value: (paymentSuccess.patientName || 'N/A').toUpperCase() },
            { label: 'INVOICE', value: paymentSuccess.invoiceId },
            { label: 'STATUS',  value: isOffline ? 'Will sync when online' : 'Settled & Recorded' },
          ].map(({ label, value }) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 0', borderBottom: '1px solid #f1f5f9',
            }}>
              <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1.5px' }}>{label}</span>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Dismiss button */}
        <div style={{ padding: '20px 32px 28px' }}>
          <button
            onClick={onDismiss}
            style={{
              width: '100%', padding: '14px',
              borderRadius: '14px', border: 'none',
              background: gradient,
              color: 'white', fontSize: '11px', fontWeight: 950,
              cursor: 'pointer', letterSpacing: '1px',
              boxShadow: shadow,
            }}
          >
            DONE
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 }                                   to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(32px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </div>
  );
}
