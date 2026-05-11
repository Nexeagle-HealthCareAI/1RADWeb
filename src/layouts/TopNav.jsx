import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLE_HOME } from '../data/roles';
import useAuth from '../auth/useAuth';
import useOffline from '../hooks/useOffline';
import '../styles/global.css';

export default function TopNav({ currentTime }) {
  const { currentUser, activeCenter, subscription } = useAuth();
  
  if (!currentUser) return null;

  const { isOnline, isSyncing, pendingCount } = useOffline();

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const getSubscriptionBadge = () => {
    if (!subscription) return null;
    if (subscription.isTrial) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '5px 12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
          <span style={{ fontSize: '8px', fontWeight: 900, color: '#3b82f6', textTransform: 'uppercase' }}>Trial Phase</span>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#1e40af' }}>{subscription.daysRemaining} Days Left</span>
        </div>
      );
    }
    if (!subscription.isActive) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '5px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <span style={{ fontSize: '8px', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase' }}>Subscription</span>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#991b1b' }}>EXPIRED</span>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '5px 12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
        <span style={{ fontSize: '8px', fontWeight: 900, color: '#10b981', textTransform: 'uppercase' }}>{subscription.planName || 'Active'}</span>
        <span style={{ fontSize: '11px', fontWeight: 800, color: '#065f46' }}>{subscription.daysRemaining} Days Remaining</span>
      </div>
    );
  };

  return (
    <header className="top-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '60px', padding: '0 30px', background: 'white', borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 1000 }}>
      {/* Welcome & Status HUD */}
      <div className="status-hud" style={{ display: 'flex', gap: '30px', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px', textTransform: 'uppercase' }}>Active Institution</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isOnline ? '#2ecc71' : '#94a3b8', boxShadow: isOnline ? '0 0 10px rgba(46, 204, 113, 0.4)' : 'none' }}></div>
              <span style={{ fontSize: '15px', fontWeight: 950, color: '#1a1a2e', letterSpacing: '-0.5px' }}>
                {activeCenter?.name?.toUpperCase() || 'OFFLINE_NODE'}
              </span>
            </div>
          </div>
          
          {/* Subscription Badge */}
          {getSubscriptionBadge()}

          {/* Sync Status HUD */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 15px', background: isOnline ? '#f0fdf4' : '#fef2f2', borderRadius: '12px', border: '1px solid', borderColor: isOnline ? '#bcf0da' : '#fecdd3' }}>
             <div style={{ position: 'relative' }}>
                <span style={{ fontSize: '18px' }}>{isOnline ? '☁️' : '📡'}</span>
                {isSyncing && (
                  <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', background: '#0f52ba', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div>
                )}
             </div>
             <div>
                <div style={{ fontSize: '9px', fontWeight: 950, color: isOnline ? '#166534' : '#991b1b', textTransform: 'uppercase' }}>
                   {isSyncing ? 'Synchronizing...' : isOnline ? 'Cloud Linked' : 'Offline Mode'}
                </div>
                <div style={{ fontSize: '10px', fontWeight: 800, color: isOnline ? '#15803d' : '#ef4444' }}>
                   {pendingCount > 0 ? `${pendingCount} Records Pending` : 'All Data Synced'}
                </div>
             </div>
          </div>
      </div>

      {/* Temporal HUD */}
      <div className="temporal-hud" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
        <div className="time-display" style={{ fontSize: '14px', fontWeight: 950, color: '#1a1a2e', letterSpacing: '-0.5px' }}>{formattedTime}</div>
        <div className="date-display hide-mobile" style={{ fontSize: '8px', fontWeight: 800, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px' }}>{formattedDate}</div>
      </div>
    </header>
  );
}
