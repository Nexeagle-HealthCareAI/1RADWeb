import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { onApiError } from '../api/apiErrorEvents';

/**
 * ApiErrorToast — global toast renderer that listens for `1rad:api-error`
 * window events (dispatched by apiClient's interceptor) and displays a
 * polished stack of notifications in the top-right corner.
 *
 * Behaviour:
 *   • Auto-dismiss after AUTODISMISS_MS with a thin progress bar.
 *   • Hover pauses the dismiss timer.
 *   • Max MAX_STACK visible; older toasts shift down, oldest pushed off.
 *   • Click the reference chip to copy the correlationId for support.
 *   • Mount once at app root — no per-page wiring needed.
 */

const AUTODISMISS_MS = 8000;
const MAX_STACK = 3;

const SEVERITY_THEME = {
  error: {
    accent: '#dc2626',
    bg:     '#fff',
    iconBg: '#fee2e2',
    iconColor: '#dc2626',
    progressBg: 'rgba(220, 38, 38, 0.18)',
    progressFill: '#dc2626',
  },
  warning: {
    accent: '#d97706',
    bg:     '#fff',
    iconBg: '#fef3c7',
    iconColor: '#d97706',
    progressBg: 'rgba(217, 119, 6, 0.18)',
    progressFill: '#d97706',
  },
  info: {
    accent: '#0078d4',
    bg:     '#fff',
    iconBg: '#dbeafe',
    iconColor: '#0078d4',
    progressBg: 'rgba(0, 120, 212, 0.18)',
    progressFill: '#0078d4',
  },
};

const SEVERITY_ICON = {
  error: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <circle cx="12" cy="16.5" r="0.9" fill="currentColor" />
    </svg>
  ),
  warning: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13.5" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" />
    </svg>
  ),
  info: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" />
    </svg>
  ),
};

function ToastItem({ toast, onDismiss }) {
  const [hovered, setHovered] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef(null);

  // Progress + auto-dismiss tick
  useEffect(() => {
    if (hovered) {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setElapsed(e => {
        const next = e + 100;
        if (next >= AUTODISMISS_MS) {
          clearInterval(intervalRef.current);
          onDismiss(toast.id);
        }
        return next;
      });
    }, 100);
    return () => clearInterval(intervalRef.current);
  }, [hovered, onDismiss, toast.id]);

  const theme = SEVERITY_THEME[toast.severity] || SEVERITY_THEME.error;
  const progress = Math.min(100, (elapsed / AUTODISMISS_MS) * 100);

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(toast.correlationId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="alert"
      style={{
        width: '380px',
        maxWidth: 'calc(100vw - 32px)',
        background: theme.bg,
        borderRadius: '12px',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.06)',
        border: '1px solid #e5e7eb',
        borderLeft: `4px solid ${theme.accent}`,
        overflow: 'hidden',
        marginBottom: '10px',
        fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
        animation: 'rad-toast-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', gap: '12px', padding: '14px 14px 12px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          background: theme.iconBg, color: theme.iconColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {SEVERITY_ICON[toast.severity] || SEVERITY_ICON.error}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{
              fontSize: '14px', fontWeight: 700, color: '#0f172a',
              lineHeight: 1.3,
            }}>
              {toast.title}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              style={{
                width: '22px', height: '22px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#94a3b8', borderRadius: '4px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, flexShrink: 0,
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div style={{
            fontSize: '13px', color: '#475569', lineHeight: 1.5,
            marginTop: '4px',
            wordBreak: 'break-word',
          }}>
            {toast.message}
          </div>

          {/* Per-field validation errors */}
          {toast.errors && (
            <ul style={{
              margin: '8px 0 0', padding: '0 0 0 18px',
              fontSize: '12px', color: '#64748b', lineHeight: 1.5,
            }}>
              {Object.entries(toast.errors).flatMap(([field, msgs]) =>
                (Array.isArray(msgs) ? msgs : [msgs]).map((m, i) => (
                  <li key={`${field}-${i}`}><strong style={{ color: '#334155' }}>{field}:</strong> {m}</li>
                ))
              )}
            </ul>
          )}

          {/* Reference chip */}
          {toast.correlationId && (
            <button
              onClick={handleCopy}
              title="Copy reference for support"
              style={{
                marginTop: '10px',
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '4px 10px',
                background: '#f1f5f9', border: '1px solid #e2e8f0',
                borderRadius: '999px',
                fontSize: '11px', color: '#475569',
                fontFamily: '"Cascadia Code", "Consolas", monospace',
                cursor: 'pointer', transition: 'background 0.12s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
              onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>{copied ? 'copied!' : `Ref ${toast.correlationId}`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Auto-dismiss progress bar */}
      <div style={{
        height: '3px',
        background: theme.progressBg,
        position: 'relative',
      }}>
        <div style={{
          height: '100%',
          width: `${100 - progress}%`,
          background: theme.progressFill,
          transition: 'width 100ms linear',
        }} />
      </div>
    </div>
  );
}

export default function ApiErrorToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsubscribe = onApiError((payload) => {
      setToasts(prev => {
        const next = [...prev, payload];
        // Trim oldest if past stack limit
        return next.length > MAX_STACK ? next.slice(next.length - MAX_STACK) : next;
      });
    });
    return unsubscribe;
  }, []);

  const handleDismiss = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <style>{`
        @keyframes rad-toast-in {
          from { opacity: 0; transform: translateX(24px) scale(0.97); }
          to   { opacity: 1; transform: translateX(0)   scale(1); }
        }
      `}</style>
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          pointerEvents: 'none',
        }}
      >
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <ToastItem toast={t} onDismiss={handleDismiss} />
          </div>
        ))}
      </div>
    </>,
    document.body
  );
}
