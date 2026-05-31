import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import useOffline from '../hooks/useOffline';
import useSyncStatus from '../sync/useSyncStatus';
import useQuotaStatus from '../sync/useQuotaStatus';
import OverdueBell from '../components/OverdueAppointments/OverdueBell';
import '../styles/global.css';

export default function TopNav({ currentTime }) {
  const { currentUser, activeCenter, subscription, centers, switchCenter } = useAuth();
  const navigate = useNavigate();

  // Multi-hospital switcher state. Only renders when the user has more than
  // one authorized hospital mapping — single-hospital users see no chrome
  // change. Mirrors the AdminBoard switcher but compact for the header.
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isSwitchingCenter, setIsSwitchingCenter] = useState(false);
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

  const { isOnline, isSyncing, pendingCount } = useOffline();
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
            {/* Sync Hub */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ 
                width: '32px', height: '32px', borderRadius: '8px', 
                background: isOnline ? '#f0fdf4' : '#fef2f2',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${isOnline ? '#dcfce7' : '#fee2e2'}`
              }}>
                <span style={{ fontSize: '14px' }}>{isOnline ? '🌐' : '📡'}</span>
              </div>
              <div
                className="nav-status-details"
                style={{ display: 'flex', flexDirection: 'column' }}
                title={syncStatus.lastPullAtIso ? `Last sync: ${new Date(syncStatus.lastPullAtIso).toLocaleString()}` : 'No successful sync yet'}
              >
                <span style={{ fontSize: '9px', fontWeight: 950, color: syncToneColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {isSyncing ? 'Syncing...' : isOnline ? 'Online' : 'Offline'}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>
                  {pendingCount > 0 ? `${pendingCount} Pending` : syncStatus.label}
                </span>
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
    </>
  );
}
