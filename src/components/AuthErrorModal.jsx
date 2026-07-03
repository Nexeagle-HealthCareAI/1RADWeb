import { useEffect } from 'react';

/**
 * AuthErrorModal — premium blocking dialog for auth-related errors on the
 * Register and Login pages. Replaces the easy-to-miss inline error band
 * with a high-attention overlay and explicit next-step CTAs.
 *
 * Props
 *   open            — controls visibility
 *   variant         — 'info' | 'warn' | 'error' (icon + accent colour)
 *   title           — bold heading line
 *   message         — descriptive body text
 *   identifiers     — { email, mobile } shown as a highlighted summary chip
 *   primaryAction   — { label, onClick } main CTA button
 *   secondaryAction — { label, onClick } outline button below primary
 *   tertiaryAction  — { label, onClick } subtle underline link at the bottom
 *   onClose         — fired on Esc, backdrop click, and the X button
 */
export default function AuthErrorModal({
  open,
  variant = 'info',
  title,
  message,
  identifiers,
  primaryAction,
  secondaryAction,
  tertiaryAction,
  onClose,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const accent = variant === 'error'
    ? { from: '#ef4444', to: '#b91c1c', glow: 'rgba(239,68,68,0.55)', chipBorder: 'rgba(239,68,68,0.25)', chipBg: 'rgba(239,68,68,0.08)', chipText: '#fca5a5' }
    : variant === 'warn'
    ? { from: '#f59e0b', to: '#b45309', glow: 'rgba(245,158,11,0.55)', chipBorder: 'rgba(245,158,11,0.25)', chipBg: 'rgba(245,158,11,0.08)', chipText: '#fcd34d' }
    : { from: '#3b82f6', to: '#2563eb', glow: 'rgba(59,130,246,0.55)', chipBorder: 'rgba(59,130,246,0.20)', chipBg: 'rgba(59,130,246,0.08)', chipText: '#93c5fd' };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-error-title"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100040,
        background: 'radial-gradient(ellipse at center, rgba(15,23,42,0.88) 0%, rgba(2,6,23,0.96) 100%)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'aemFade 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '440px',
          background: 'linear-gradient(160deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: '20px',
          padding: '34px 30px 28px',
          boxShadow:
            `0 30px 70px -20px ${accent.glow.replace('0.55', '0.30')}, ` +
            '0 0 0 1px rgba(255,255,255,0.04), ' +
            'inset 0 1px 0 rgba(255,255,255,0.06)',
          animation: 'aemPop 340ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          position: 'relative',
        }}
      >
        {/* Close (X) */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            position: 'absolute', top: '14px', right: '14px',
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', lineHeight: 1,
          }}
        >×</button>

        {/* Icon */}
        <div style={{
          width: '60px', height: '60px', borderRadius: '50%',
          margin: '0 auto 18px',
          background: `linear-gradient(135deg, ${accent.from} 0%, ${accent.to} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 10px 28px -6px ${accent.glow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8"  x2="12" y2="13" />
            <line x1="12" y1="16" x2="12" y2="16" />
          </svg>
        </div>

        <h2
          id="auth-error-title"
          style={{
            fontSize: '20px', fontWeight: 800, color: '#fff',
            margin: '0 0 8px', textAlign: 'center', letterSpacing: '-0.3px',
          }}
        >
          {title}
        </h2>

        {message && (
          <p style={{
            fontSize: '14px', color: 'rgba(255,255,255,0.95)',
            margin: '0 0 18px', textAlign: 'center', lineHeight: 1.55,
          }}>
            {message}
          </p>
        )}

        {(identifiers?.email || identifiers?.mobile) && (
          <div style={{
            background: accent.chipBg,
            border: `1px solid ${accent.chipBorder}`,
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '20px',
            display: 'flex', flexDirection: 'column', gap: '4px',
          }}>
            {identifiers.email && (
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)' }}>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>Email: </span>
                <strong style={{ color: accent.chipText }}>{identifiers.email}</strong>
              </div>
            )}
            {identifiers.mobile && (
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)' }}>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>Mobile: </span>
                <strong style={{ color: accent.chipText }}>{identifiers.mobile}</strong>
              </div>
            )}
          </div>
        )}

        {primaryAction && (
          <button
            type="button"
            onClick={primaryAction.onClick}
            style={{
              width: '100%', padding: '13px',
              background: `linear-gradient(135deg, ${accent.from} 0%, ${accent.to} 100%)`,
              color: 'white', border: 'none', borderRadius: '10px',
              fontSize: '13px', fontWeight: 700, letterSpacing: '0.4px',
              cursor: 'pointer', marginBottom: '10px',
              boxShadow: `0 8px 20px -6px ${accent.glow}, inset 0 1px 0 rgba(255,255,255,0.20)`,
              fontFamily: 'inherit',
            }}
          >
            {primaryAction.label}
          </button>
        )}

        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            style={{
              width: '100%', padding: '12px',
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.95)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '10px',
              fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', marginBottom: '10px',
              fontFamily: 'inherit',
            }}
          >
            {secondaryAction.label}
          </button>
        )}

        {tertiaryAction && (
          <button
            type="button"
            onClick={tertiaryAction.onClick}
            style={{
              width: '100%', padding: '11px',
              background: 'transparent',
              color: 'rgba(255,255,255,0.75)',
              border: 'none',
              fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', textDecoration: 'underline',
              fontFamily: 'inherit',
            }}
          >
            {tertiaryAction.label}
          </button>
        )}
      </div>

      <style>{`
        @keyframes aemFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes aemPop  {
          0%   { opacity: 0; transform: scale(0.92) translateY(10px); }
          100% { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </div>
  );
}
