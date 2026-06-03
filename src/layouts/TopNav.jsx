import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import useOffline from '../hooks/useOffline';
import useSyncStatus from '../sync/useSyncStatus';
import useQuotaStatus from '../sync/useQuotaStatus';
import OverdueBell from '../components/OverdueAppointments/OverdueBell';
import { BASE_URL } from '../api/apiClient';
import '../styles/global.css';

// Where the "Get Desktop App" link points. Defaults to the API's download
// endpoint (which serves the electron-builder installer), so it follows the
// active environment's API base automatically (dev → dev API, prod → prod API).
// An explicit VITE_DESKTOP_DOWNLOAD_URL overrides it if you host elsewhere.
const DESKTOP_DOWNLOAD_URL =
  import.meta.env.VITE_DESKTOP_DOWNLOAD_URL || `${BASE_URL}/download/desktop`;
// No point offering the download inside the desktop app itself.
const IS_ELECTRON_APP = typeof window !== 'undefined' && !!window.electron;

export default function TopNav({ currentTime }) {
  const { currentUser, activeCenter, subscription, centers, switchCenter } = useAuth();
  const navigate = useNavigate();

  // Multi-hospital switcher state. Only renders when the user has more than
  // one authorized hospital mapping — single-hospital users see no chrome
  // change. Mirrors the AdminBoard switcher but compact for the header.
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isSwitchingCenter, setIsSwitchingCenter] = useState(false);
  // "Get Desktop App" download + pin-to-taskbar prompt.
  const [showDesktopModal, setShowDesktopModal] = useState(false);
  const [desktopDownloaded, setDesktopDownloaded] = useState(false);
  const switcherRef = useRef(null);
  const hasMultipleHospitals = (centers?.length || 0) > 1;

  useEffect(() => {
    if (!isSwitcherOpen) return undefined;
    const onClickOutside = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setIsSwitcherOpen(false);
      }
    };
    const onEsc = (e) => { if (e.key === 'Escape') setIsSwitcherOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [isSwitcherOpen]);

  const handleSwitchCenter = async (id) => {
    const normalizedActive = String(activeCenter?.id || '').toLowerCase();
    const normalizedTarget = String(id).toLowerCase();
    if (normalizedActive === normalizedTarget || isSwitchingCenter) return;
    setIsSwitchingCenter(true);
    const result = await switchCenter(id);
    setIsSwitchingCenter(false);
    setIsSwitcherOpen(false);
    if (result?.success) {
      // Reload so every component re-derives from the new active hospital —
      // matches the existing AdminBoard/ReferralsPage switch behaviour.
      window.location.reload();
    }
  };

  // Fix #9: Persist dismiss to sessionStorage keyed by date so the banner stays
  // dismissed across page navigations for the entire working day.
  const todayKey = `1rad_sub_banner_dismissed_${new Date().toISOString().slice(0, 10)}`;
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem(todayKey) === 'true'
  );
  const dismissBanner = () => {
    sessionStorage.setItem(todayKey, 'true');
    setBannerDismissed(true);
  };

  if (!currentUser) return null;

  const { isOnline, isSyncing, pendingCount, poisonedCount } = useOffline();
  // Cache-freshness chip in the existing Sync Hub. The SyncEngine writes
  // meta.lastSuccessfulPullAt after each pull; the hook below reads that
  // via Dexie liveQuery and derives a human label + colour tone.
  const syncStatus = useSyncStatus();
  const syncToneColor = syncStatus.tone === 'crit' ? '#dc2626'
                       : syncStatus.tone === 'warn' ? '#b45309'
                       : '#10b981';
  // Track 4 — quota chip. Only renders when the cache is filling (warn or
  // crit). Below 80% we stay invisible so the header doesn't carry a chip
  // that's permanently green and ignored. The quota monitor evicts old
  // rows automatically; this chip just tells the user it's happening.
  const quota = useQuotaStatus();
  const showQuotaChip = quota?.state === 'warn' || quota?.state === 'crit';
  const quotaPct = quota?.ratio != null ? Math.round(quota.ratio * 100) : null;
  const quotaToneColor = quota?.state === 'crit' ? '#dc2626' : '#b45309';
  const quotaToneBg    = quota?.state === 'crit' ? '#fef2f2' : '#fffbeb';
  const quotaToneBorder= quota?.state === 'crit' ? '#fee2e2' : '#fde68a';

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

  const roles = currentUser.roles || [];
  const canSeeSubscription = roles.includes('admindoctor') || roles.includes('admin');

  // ── Subscription badge state machine ──────────────────────────────────────
  const daysLeft = subscription?.daysRemaining ?? null;
  const subStatus = subscription?.status ?? null;
  const isTrial = subscription?.isTrial ?? false;
  const isLocked = subscription?.isLocked ?? false;
  const hasPending = subscription?.hasPendingPaymentRequest ?? false;
  const isActivePaid = !isTrial && subscription?.isActive && (subStatus === 'Active' || subStatus === 'Expiring');

  // Determine which banner to show (priority order)
  let bannerState = null;
  if (canSeeSubscription && subscription !== null) {
    if (isLocked || subStatus === 'Locked') {
      bannerState = 'locked';
    } else if (hasPending) {
      bannerState = 'pending';
    } else if (subStatus === 'Expired') {
      bannerState = 'grace';
    } else if (isTrial && subStatus === 'Expiring') {
      bannerState = 'expiring';
    } else if (isTrial && subStatus === 'Active' && daysLeft !== null) {
      bannerState = 'trial';
    } else if (isActivePaid && daysLeft !== null && daysLeft <= 30) {
      bannerState = 'premium_expiring';
    }
  }

  const showBanner = bannerState !== null && !bannerDismissed;

  const bannerConfig = {
    locked:          { bg: '#dc2626', badge: 'CRITICAL',  badgeBg: 'rgba(255,255,255,0.2)', text: 'SUBSCRIPTION LOCKED — Access to clinical modules is restricted. Resolve payment immediately.', cta: 'RESOLVE NOW →', ctaColor: '#dc2626' },
    grace:           { bg: '#b45309', badge: 'GRACE',     badgeBg: '#d97706',               text: `Trial ended — ${daysLeft === 0 ? 'grace period active today' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left in grace period`}. Upgrade to avoid lockout.`, cta: 'UPGRADE →', ctaColor: '#b45309' },
    expiring:        { bg: '#92400e', badge: 'NOTICE',    badgeBg: '#d97706',               text: `Trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Upgrade now to maintain access.`, cta: 'UPGRADE →', ctaColor: '#92400e' },
    trial:           { bg: '#0f172a', badge: 'FREE TRIAL', badgeBg: '#1d4ed8',              text: `Free trial active — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining. Upgrade anytime to keep full access.`, cta: 'VIEW PLANS →', ctaColor: '#0f172a' },
    pending:         { bg: '#1e3a8a', badge: 'REVIEW',    badgeBg: '#3b82f6',               text: 'Your payment is under review. Plan will be activated within 24 hours of confirmation.', cta: 'VIEW STATUS →', ctaColor: '#1e3a8a' },
    premium_expiring:{ bg: '#0f172a', badge: 'NOTICE',    badgeBg: '#0f52ba',               text: `Premium plan renews in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Contact us to renew.`, cta: 'RENEW →', ctaColor: '#0f172a' },
  };

  const cfg = bannerConfig[bannerState] || null;

  return (
    <>
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.33); opacity: 0; }
          80%, 100% { opacity: 0; }
        }
        @keyframes pulse-dot {
          0% { transform: scale(0.8); }
          50% { transform: scale(1); }
          100% { transform: scale(0.8); }
        }
        .nav-button-hover:hover {
          background: rgba(15, 82, 186, 0.05) !important;
          transform: translateY(-1px);
        }
        .nav-button-hover:active {
          transform: translateY(0);
        }
        
        @media (max-width: 768px) {
          .top-nav-header {
            padding: 0 15px !important;
            height: 56px !important;
          }
          .nav-logo-section {
            gap: 10px !important;
          }
          .nav-terminal-label, .nav-status-details, .nav-temporal-section {
            display: none !important;
          }
          .nav-logo-icon {
            width: 32px !important;
            height: 32px !important;
            font-size: 14px !important;
          }
          .nav-center-name {
            font-size: 12px !important;
          }
          .nav-status-indicators {
            gap: 12px !important;
          }
          .nav-user-section {
            gap: 8px !important;
          }
          .nav-user-meta {
            display: none !important;
          }
          .nav-divider {
            margin: 0 10px !important;
          }
        }

        @media (max-width: 480px) {
          .nav-divider {
             display: none !important;
          }
          .nav-status-indicators {
             display: none !important;
          }
        }
      `}</style>

      {/* ── Subscription Status Banner ── */}
      {showBanner && cfg && (
        <div style={{
          background: cfg.bg,
          padding: '8px 30px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1001, position: 'relative',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          animation: bannerState === 'pending' ? 'none' : undefined,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: cfg.badgeBg, padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 950, color: 'white', letterSpacing: '1px', flexShrink: 0 }}>
              {cfg.badge}
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'white', letterSpacing: '0.3px' }}>
              {cfg.text}
            </span>
            <button
              onClick={() => navigate('/subscription')}
              style={{ background: 'white', border: 'none', borderRadius: '6px', padding: '4px 12px', color: cfg.ctaColor, fontSize: '10px', fontWeight: 950, cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}
            >
              {cfg.cta}
            </button>
          </div>
          <button
            onClick={dismissBanner}
            style={{ position: 'absolute', right: '20px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '14px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      <header className="top-nav top-nav-header" style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
        height: '64px', padding: '0 40px', 
        background: 'rgba(255, 255, 255, 0.8)', 
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #eef2f6', 
        position: 'sticky', top: 0, zIndex: 1000,
        boxShadow: '0 4px 20px rgba(0,0,0,0.02)'
      }}>
        
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* Institutional Node Identifier (with multi-hospital switcher). */}
          <div ref={switcherRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => hasMultipleHospitals && setIsSwitcherOpen(o => !o)}
              disabled={!hasMultipleHospitals}
              aria-haspopup={hasMultipleHospitals ? 'listbox' : undefined}
              aria-expanded={hasMultipleHospitals ? isSwitcherOpen : undefined}
              title={hasMultipleHospitals ? 'Switch hospital' : undefined}
              className="nav-logo-section"
              style={{
                display: 'flex', alignItems: 'center', gap: '15px',
                background: 'transparent', border: 'none', padding: 0,
                cursor: hasMultipleHospitals ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}
            >
              <div className="nav-logo-icon" style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #0f52ba 0%, #1e40af 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 16px rgba(15, 82, 186, 0.2)',
                position: 'relative',
              }}>
                <span style={{ color: 'white', fontWeight: 950, fontSize: '16px' }}>{activeCenter?.name?.charAt(0) || 'H'}</span>
                {hasMultipleHospitals && (
                  <span style={{
                    position: 'absolute', bottom: '-3px', right: '-3px',
                    minWidth: '16px', height: '16px', padding: '0 4px',
                    borderRadius: '8px', background: '#10b981',
                    color: 'white', fontSize: '9px', fontWeight: 950,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid white',
                    lineHeight: 1,
                  }}>{centers.length}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                <div className="nav-terminal-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                    {hasMultipleHospitals ? 'Active hospital' : 'Current Terminal'}
                  </span>
                  {isOnline && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />}
                </div>
                <span className="nav-center-name" style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b', letterSpacing: '-0.3px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  {activeCenter?.name || 'INITIALIZING_NODE...'}
                  {hasMultipleHospitals && (
                    <span style={{
                      fontSize: '11px', color: '#64748b',
                      transform: isSwitcherOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.18s ease',
                    }}>▾</span>
                  )}
                </span>
              </div>
            </button>

            {isSwitcherOpen && hasMultipleHospitals && (
              <div
                role="listbox"
                aria-label="Authorized hospitals"
                style={{
                  position: 'absolute', top: 'calc(100% + 10px)', left: 0,
                  width: '320px', maxHeight: '60vh', overflowY: 'auto',
                  background: 'white', border: '1px solid #e2e8f0',
                  borderRadius: '14px', padding: '10px',
                  boxShadow: '0 18px 50px rgba(0,0,0,0.18)',
                  zIndex: 1100,
                }}
              >
                <div style={{
                  padding: '4px 8px 10px', fontSize: '9px', fontWeight: 950,
                  color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '1.5px',
                  borderBottom: '1px solid #f1f5f9', marginBottom: '8px',
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <span>Authorized hospitals</span>
                  <span style={{ opacity: 0.5 }}>{centers.length}</span>
                </div>
                {centers.map(center => {
                  const isActive = String(activeCenter?.id || '').toLowerCase() === String(center.id).toLowerCase();
                  return (
                    <button
                      key={center.id}
                      type="button"
                      onClick={() => handleSwitchCenter(center.id)}
                      disabled={isSwitchingCenter}
                      role="option"
                      aria-selected={isActive}
                      style={{
                        width: '100%', textAlign: 'left',
                        padding: '12px', borderRadius: '10px',
                        display: 'flex', alignItems: 'center', gap: '12px',
                        background: isActive ? '#f0f7ff' : 'transparent',
                        border: isActive ? '1px solid #dbeafe' : '1px solid transparent',
                        cursor: isSwitchingCenter ? 'wait' : 'pointer',
                        opacity: isSwitchingCenter && !isActive ? 0.5 : 1,
                        marginBottom: '4px',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{
                        width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
                        background: isActive ? 'linear-gradient(135deg, #0f52ba 0%, #1e40af 100%)' : '#f1f5f9',
                        color: isActive ? 'white' : '#64748b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 950, fontSize: '14px',
                      }}>
                        {center.name?.charAt(0) || 'H'}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{
                          fontSize: '12px', fontWeight: 900, color: '#1e293b',
                          whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden',
                        }}>
                          {center.name || 'Unnamed Center'}
                        </div>
                        {(center.groupName || center.role) && (
                          <div style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {[center.groupName, center.role && String(center.role).toUpperCase()].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      {isActive ? (
                        <span style={{
                          fontSize: '9px', fontWeight: 950, color: '#10b981',
                          letterSpacing: '1px', flexShrink: 0,
                        }}>ACTIVE</span>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>↵</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="nav-divider" style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 40px' }} />

          {/* Tactical Status Indicators */}
          <div className="nav-status-indicators" style={{ display: 'flex', gap: '24px' }}>
            {/* Sync Hub — click to open the Sync & Saved Changes page */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate('/settings/sync')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/settings/sync'); } }}
              title={
                poisonedCount > 0
                  ? `${poisonedCount} change${poisonedCount === 1 ? '' : 's'} could not be saved — click to review`
                  : (syncStatus.lastPullAtIso ? `Last sync: ${new Date(syncStatus.lastPullAtIso).toLocaleString()} — click for details` : 'Click for sync details')
              }
              style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
            >
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: poisonedCount > 0 ? '#fef2f2' : (isOnline ? '#f0fdf4' : '#fef2f2'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${poisonedCount > 0 ? '#fecaca' : (isOnline ? '#dcfce7' : '#fee2e2')}`
              }}>
                <span style={{ fontSize: '14px' }}>{poisonedCount > 0 ? '⚠️' : (isOnline ? '🌐' : '📡')}</span>
              </div>
              <div
                className="nav-status-details"
                style={{ display: 'flex', flexDirection: 'column' }}
              >
                <span style={{ fontSize: '9px', fontWeight: 950, color: syncToneColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {isSyncing ? 'Syncing...' : isOnline ? 'Online' : 'Offline'}
                </span>
                {poisonedCount > 0 ? (
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#b91c1c' }}>
                    {poisonedCount} need{poisonedCount === 1 ? 's' : ''} attention
                  </span>
                ) : (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>
                    {pendingCount > 0 ? `${pendingCount} saving…` : syncStatus.label}
                  </span>
                )}
              </div>
            </div>

            {showQuotaChip && quotaPct != null && (
              <div
                title={`Local cache: ${quotaPct}% full — old worklists are evicted automatically`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  background: quotaToneBg,
                  border: `1px solid ${quotaToneBorder}`,
                }}
              >
                <span style={{ fontSize: '12px' }}>💾</span>
                <span style={{ fontSize: '10px', fontWeight: 950, color: quotaToneColor, letterSpacing: '0.3px' }}>
                  Cache {quotaPct}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Temporal / User HUD */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '25px' }} className="nav-user-section">
          {/* Get the desktop app — hidden when already running inside Electron. */}
          {!IS_ELECTRON_APP && (
            <button
              type="button"
              onClick={() => { setDesktopDownloaded(false); setShowDesktopModal(true); }}
              title="Download the 1Rad desktop app for Windows"
              className="nav-desktop-download"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '7px 14px', borderRadius: '10px',
                background: 'linear-gradient(135deg, #eff6ff 0%, #e0edff 100%)',
                border: '1px solid #bfdbfe',
                color: '#0f52ba', fontSize: '11px', fontWeight: 800,
                cursor: 'pointer', whiteSpace: 'nowrap',
                boxShadow: '0 1px 2px rgba(15,82,186,0.08)',
              }}
            >
              {/* Desktop monitor icon */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <span className="nav-desktop-download-label">Get Desktop App</span>
            </button>
          )}

          {/* SLA bell — auto-hides when there are no overdue patients. */}
          <OverdueBell />

          <div style={{ textAlign: 'right' }} className="nav-temporal-section">
            <div style={{ fontSize: '16px', fontWeight: 950, color: '#1e293b', letterSpacing: '-0.5px', lineHeight: 1, marginBottom: '2px' }}>
              {formattedTime}
            </div>
            <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {formattedDate}
            </div>
          </div>
          
          <div className="nav-divider" style={{ width: '1px', height: '32px', background: '#e2e8f0' }} />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="nav-user-meta" style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>{currentUser?.name || 'USER'}</span>
              <span style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {roles[0]?.replace('admin', 'CHIEF ')}
              </span>
            </div>
            <div style={{ 
              width: '36px', height: '36px', borderRadius: '50%', 
              background: '#f1f5f9', border: '2px solid white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
              fontSize: '16px'
            }}>
              👤
            </div>
          </div>
        </div>
      </header>

      {/* Get Desktop App — download + pin-to-taskbar prompt */}
      {showDesktopModal && (
        <div
          onClick={() => setShowDesktopModal(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: '420px', maxWidth: '100%', background: 'white', borderRadius: '18px', boxShadow: '0 24px 70px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
            <div style={{ padding: '22px 24px', background: 'linear-gradient(135deg, #0a1628 0%, #0f52ba 100%)', color: 'white', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '22px' }}>🖥️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '15px', fontWeight: 950 }}>Get the 1Rad Desktop App</div>
                <div style={{ fontSize: '11px', fontWeight: 600, opacity: 0.85, marginTop: '2px' }}>Faster, works offline, and always one click away.</div>
              </div>
              <button onClick={() => setShowDesktopModal(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: '30px', height: '30px', borderRadius: '8px', fontSize: '15px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ padding: '22px 24px' }}>
              {!desktopDownloaded ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = DESKTOP_DOWNLOAD_URL;
                      a.rel = 'noopener';
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      setDesktopDownloaded(true);
                    }}
                    style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '13px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 8px 20px rgba(15,82,186,0.3)' }}
                  >
                    <span style={{ fontSize: '16px' }}>⬇</span> Download for Windows
                  </button>
                  <div style={{ marginTop: '16px', padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '16px' }}>📌</span>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', lineHeight: 1.5 }}>
                      Tip: After installing, you can pin 1Rad to your taskbar so it's always one click away. We'll show you how once the download starts.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <span style={{ fontSize: '20px' }}>✅</span>
                    <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>Your download has started</div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '10px' }}>Pin 1Rad to your taskbar for one-click access:</div>
                  <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li style={{ fontSize: '12px', fontWeight: 600, color: '#334155', lineHeight: 1.5 }}>Open the installer you just downloaded and follow the steps.</li>
                    <li style={{ fontSize: '12px', fontWeight: 600, color: '#334155', lineHeight: 1.5 }}>Open <strong>1Rad</strong>, then <strong>right-click its icon in the taskbar</strong> and choose <strong>“Pin to taskbar”</strong>.</li>
                  </ol>
                  <button
                    type="button"
                    onClick={() => setShowDesktopModal(false)}
                    style={{ marginTop: '20px', width: '100%', padding: '12px', borderRadius: '12px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '13px', fontWeight: 900, cursor: 'pointer' }}
                  >
                    Done
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
