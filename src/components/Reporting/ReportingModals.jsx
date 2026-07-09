import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Reporting page overlay modals, extracted verbatim from ReportingPage.
 * Both render into `overlayHost` (the fullscreen element when active, else
 * <body>) so they sit above a fullscreened DICOM/editor.
 */

// Universal notification modal — success / error / warning / info toast-dialog.
export function NotificationModal({ notifModal, setNotifModal, overlayHost }) {
  if (!notifModal.isOpen || !overlayHost) return null;
        const NOTIF_CFG = {
          success: { gradient: 'linear-gradient(135deg,#dcfce7,#bbf7d0)', iconColor: '#16a34a', border: '#bbf7d0', titleColor: '#15803d', shadow: 'rgba(22,163,74,0.22)',  icon: '✓', btnGrad: 'linear-gradient(135deg,#16a34a,#15803d)', btnShadow: 'rgba(22,163,74,0.4)'  },
          error:   { gradient: 'linear-gradient(135deg,#fee2e2,#fecaca)', iconColor: '#dc2626', border: '#fecaca', titleColor: '#991b1b', shadow: 'rgba(220,38,38,0.22)',  icon: '✕', btnGrad: 'linear-gradient(135deg,#e11d48,#be123c)', btnShadow: 'rgba(225,29,72,0.4)'  },
          warning: { gradient: 'linear-gradient(135deg,#fef3c7,#fde68a)', iconColor: '#d97706', border: '#fde68a', titleColor: '#92400e', shadow: 'rgba(217,119,6,0.22)', icon: '⚠', btnGrad: 'linear-gradient(135deg,#d97706,#b45309)', btnShadow: 'rgba(217,119,6,0.4)' },
          info:    { gradient: 'linear-gradient(135deg,#dbeafe,#bfdbfe)', iconColor: '#0f52ba', border: '#bfdbfe', titleColor: '#1e40af', shadow: 'rgba(15,82,186,0.22)', icon: '↻', btnGrad: 'linear-gradient(135deg,#0f52ba,#1e40af)', btnShadow: 'rgba(15,82,186,0.4)' },
        };
        const cfg = NOTIF_CFG[notifModal.type] || NOTIF_CFG.info;
        return createPortal(
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 100002, background: 'rgba(10,22,40,0.65)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', justifyContent: 'center', alignItems: 'center', animation: 'rpNoticeFade 0.2s ease-out' }}
            onClick={() => setNotifModal(m => ({ ...m, isOpen: false }))}
          >
            <div
              style={{ width: '90%', maxWidth: '460px', background: 'linear-gradient(160deg,#ffffff 0%,#f8fafc 100%)', borderRadius: '28px', border: `1px solid ${cfg.border}`, boxShadow: `0 24px 60px -12px ${cfg.shadow}, 0 0 0 1px rgba(0,0,0,0.04)`, padding: '40px 32px 32px', textAlign: 'center', animation: 'rpNoticePop 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: '76px', height: '76px', borderRadius: '50%', background: cfg.gradient, border: `2px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', fontSize: '30px', boxShadow: `0 12px 28px -8px ${cfg.shadow}` }}>
                <span style={{ color: cfg.iconColor, fontWeight: 900, lineHeight: 1 }}>{cfg.icon}</span>
              </div>
              <div style={{ display: 'inline-block', background: cfg.gradient, border: `1px solid ${cfg.border}`, borderRadius: '8px', padding: '3px 12px', marginBottom: '12px' }}>
                <span style={{ fontSize: '9px', fontWeight: 950, letterSpacing: '2px', color: cfg.titleColor, fontFamily: 'system-ui,sans-serif' }}>{notifModal.type.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 950, letterSpacing: '1.5px', color: '#0f172a', marginBottom: '12px', fontFamily: 'system-ui,sans-serif', lineHeight: 1.3 }}>{notifModal.title}</div>
              <div style={{ width: '40px', height: '3px', background: cfg.gradient, borderRadius: '99px', margin: '0 auto 16px' }} />
              <p style={{ fontSize: '13px', lineHeight: 1.75, color: '#475569', fontWeight: 500, margin: '0 0 28px', fontFamily: 'system-ui,sans-serif', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{notifModal.message}</p>
              <button
                onClick={() => setNotifModal(m => ({ ...m, isOpen: false }))}
                style={{ width: '100%', padding: '15px', background: cfg.btnGrad, color: 'white', border: 'none', borderRadius: '16px', fontSize: '11px', fontWeight: 950, letterSpacing: '1.5px', cursor: 'pointer', boxShadow: `0 8px 20px -6px ${cfg.btnShadow}`, fontFamily: 'system-ui,sans-serif' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >UNDERSTOOD</button>
            </div>
            <style>{`
              @keyframes rpNoticeFade { from { opacity: 0 } to { opacity: 1 } }
              @keyframes rpNoticePop  { from { transform: scale(0.88) translateY(20px); opacity: 0 } to { transform: scale(1) translateY(0); opacity: 1 } }
            `}</style>
          </div>,
          overlayHost   // ← portal target: fullscreen element if active, else <body>
        );
}

// Draft recovery modal — offers to restore a newer local autosave over the
// server copy when the two diverge.
export function DraftRecoveryModal({ draftRecoveryModal, resolveDraftRecovery, overlayHost }) {
  if (!draftRecoveryModal.isOpen || !overlayHost) return null;
  return createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100003, background: 'rgba(10,22,40,0.65)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', justifyContent: 'center', alignItems: 'center', animation: 'rpNoticeFade 0.2s ease-out' }}
          // Backdrop click defaults to "Use server version" — same as Cancel
          // on the old window.confirm, so behaviour is unchanged for users
          // who dismiss without reading.
          onClick={() => resolveDraftRecovery(false)}
        >
          <div
            style={{ width: '90%', maxWidth: '500px', background: 'linear-gradient(160deg,#ffffff 0%,#f8fafc 100%)', borderRadius: '28px', border: '1px solid #fde68a', boxShadow: '0 24px 60px -12px rgba(217,119,6,0.22), 0 0 0 1px rgba(0,0,0,0.04)', padding: '40px 32px 28px', textAlign: 'center', animation: 'rpNoticePop 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: '76px', height: '76px', borderRadius: '50%', background: 'linear-gradient(135deg,#fef3c7,#fde68a)', border: '2px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', fontSize: '34px', boxShadow: '0 12px 28px -8px rgba(217,119,6,0.22)' }}>
              <span style={{ color: '#d97706', fontWeight: 900, lineHeight: 1 }}>⟲</span>
            </div>
            <div style={{ display: 'inline-block', background: 'linear-gradient(135deg,#fef3c7,#fde68a)', border: '1px solid #fde68a', borderRadius: '8px', padding: '3px 12px', marginBottom: '12px' }}>
              <span style={{ fontSize: '9px', fontWeight: 950, letterSpacing: '2px', color: '#92400e', fontFamily: 'system-ui,sans-serif' }}>UNSAVED DRAFT FOUND</span>
            </div>
            <div style={{ fontSize: '15px', fontWeight: 950, letterSpacing: '0.5px', color: '#0f172a', marginBottom: '12px', fontFamily: 'system-ui,sans-serif', lineHeight: 1.3 }}>
              Restore your unsaved work?
            </div>
            <div style={{ width: '40px', height: '3px', background: 'linear-gradient(135deg,#fef3c7,#fde68a)', borderRadius: '99px', margin: '0 auto 16px' }} />
            <p style={{ fontSize: '13px', lineHeight: 1.7, color: '#475569', fontWeight: 500, margin: '0 0 8px', fontFamily: 'system-ui,sans-serif' }}>
              An autosaved draft from <strong style={{ color: '#0f172a' }}>~{draftRecoveryModal.ageMin} min ago</strong> exists on this device and <strong style={{ color: '#0f172a' }}>differs</strong> from the saved copy on the server.
            </p>
            <p style={{ fontSize: '12px', lineHeight: 1.6, color: '#64748b', fontWeight: 500, margin: '0 0 26px', fontFamily: 'system-ui,sans-serif' }}>
              Pick which version to load. The other one will be discarded.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => resolveDraftRecovery(false)}
                style={{ flex: 1, padding: '14px', background: 'white', color: '#475569', border: '1.5px solid #e2e8f0', borderRadius: '14px', fontSize: '11px', fontWeight: 800, letterSpacing: '1px', cursor: 'pointer', fontFamily: 'system-ui,sans-serif' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
              >USE SERVER COPY</button>
              <button
                onClick={() => resolveDraftRecovery(true)}
                autoFocus
                style={{ flex: 1.3, padding: '14px', background: 'linear-gradient(135deg,#d97706,#b45309)', color: 'white', border: 'none', borderRadius: '14px', fontSize: '11px', fontWeight: 950, letterSpacing: '1.5px', cursor: 'pointer', boxShadow: '0 8px 20px -6px rgba(217,119,6,0.4)', fontFamily: 'system-ui,sans-serif' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >RESTORE DRAFT</button>
            </div>
          </div>
        </div>,
        overlayHost
  );
}

// Modal to review incoming changes from Microsoft Word before applying them
export function WordSyncModal({ wordSyncModal, resolveWordSync, overlayHost }) {
  if (!wordSyncModal || !overlayHost) return null;
  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100003, background: 'rgba(10,22,40,0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', justifyContent: 'center', alignItems: 'center', animation: 'rpNoticeFade 0.2s ease-out' }}
      onClick={() => resolveWordSync(false)}
    >
      <div
        style={{ width: '90%', maxWidth: '520px', background: 'linear-gradient(160deg,#ffffff 0%,#f8fafc 100%)', borderRadius: '28px', border: '1px solid #bfdbfe', boxShadow: '0 24px 60px -12px rgba(15,82,186,0.22), 0 0 0 1px rgba(0,0,0,0.04)', padding: '40px 32px 32px', textAlign: 'center', animation: 'rpNoticePop 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: '76px', height: '76px', borderRadius: '50%', background: 'linear-gradient(135deg,#dbeafe,#bfdbfe)', border: '2px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', fontSize: '30px', boxShadow: '0 12px 28px -8px rgba(15,82,186,0.22)' }}>
          <span style={{ color: '#0f52ba', fontWeight: 900, lineHeight: 1 }}>📝</span>
        </div>
        <h3 style={{ margin: '0 0 14px', fontSize: '22px', fontWeight: 800, color: '#1e40af', letterSpacing: '-0.02em' }}>
          REVIEW CHANGES
        </h3>
        <p style={{ margin: '0 0 32px', fontSize: '15px', color: '#475569', lineHeight: 1.6, fontWeight: 500 }}>
          New edits have been saved in Microsoft Word. Would you like to sync these changes into the editor?
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => resolveWordSync(false)}
            style={{ flex: 1, padding: '14px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '14px', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', cursor: 'pointer', fontFamily: 'system-ui,sans-serif' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; }}
          >IGNORE</button>
          <button
            onClick={() => resolveWordSync(true)}
            style={{ flex: 1.3, padding: '14px', background: 'linear-gradient(135deg,#0f52ba,#1e40af)', color: 'white', border: 'none', borderRadius: '14px', fontSize: '11px', fontWeight: 950, letterSpacing: '1.5px', cursor: 'pointer', boxShadow: '0 8px 20px -6px rgba(15,82,186,0.4)', fontFamily: 'system-ui,sans-serif' }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >ACCEPT CHANGES</button>
        </div>
      </div>
    </div>,
    overlayHost
  );
}
