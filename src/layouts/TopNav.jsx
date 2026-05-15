import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import useOffline from '../hooks/useOffline';
import '../styles/global.css';

export default function TopNav({ currentTime }) {
  const { currentUser, activeCenter, subscription } = useAuth();
  const navigate = useNavigate();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  if (!currentUser) return null;

  const { isOnline, isSyncing, pendingCount } = useOffline();

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

  const roles = currentUser.roles || [];
  const canSeeSubscription = roles.includes('admindoctor') || roles.includes('admin');
  const daysLeft = subscription?.daysRemaining ?? null;
  const showBanner = canSeeSubscription && !bannerDismissed && daysLeft !== null && daysLeft <= 7;
  const isExpired = daysLeft !== null && daysLeft <= 0;

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

      {/* Expiry Warning Banner - Modern Streamlined Design */}
      {showBanner && (
        <div style={{
          background: isExpired ? '#dc2626' : '#0f172a',
          padding: '8px 30px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1001, position: 'relative',
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ 
              background: isExpired ? 'rgba(255,255,255,0.2)' : '#0f52ba', 
              padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 950, color: 'white', letterSpacing: '1px'
            }}>
              {isExpired ? 'CRITICAL' : 'NOTICE'}
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'white', letterSpacing: '0.3px' }}>
              {isExpired
                ? 'SUBSCRIPTION EXPIRED: Access to clinical modules is now restricted.'
                : `Subscription protocol ending in ${daysLeft} days. Renew to maintain operational continuity.`}
            </span>
            <button
              onClick={() => navigate('/subscription')}
              style={{ background: 'white', border: 'none', borderRadius: '6px', padding: '4px 12px', color: isExpired ? '#dc2626' : '#0f172a', fontSize: '10px', fontWeight: 950, cursor: 'pointer', transition: 'all 0.2s' }}
            >
              RESOLVE NOW →
            </button>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
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
          {/* Institutional Node Identifier */}
          <div className="nav-logo-section" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div className="nav-logo-icon" style={{ 
              width: '40px', height: '40px', borderRadius: '12px', 
              background: 'linear-gradient(135deg, #0f52ba 0%, #1e40af 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 16px rgba(15, 82, 186, 0.2)'
            }}>
              <span style={{ color: 'white', fontWeight: 950, fontSize: '16px' }}>{activeCenter?.name?.charAt(0) || 'H'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="nav-terminal-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Current Terminal</span>
                {isOnline && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />}
              </div>
              <span className="nav-center-name" style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b', letterSpacing: '-0.3px' }}>
                {activeCenter?.name || 'INITIALIZING_NODE...'}
              </span>
            </div>
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
              <div className="nav-status-details" style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '9px', fontWeight: 950, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {isSyncing ? 'Syncing...' : isOnline ? 'Online' : 'Offline'}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>
                  {pendingCount > 0 ? `${pendingCount} Pending` : 'Encrypted'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Temporal / User HUD */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '25px' }} className="nav-user-section">
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
