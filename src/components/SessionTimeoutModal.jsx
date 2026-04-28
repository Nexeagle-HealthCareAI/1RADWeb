import React, { useEffect, useState } from 'react';

/**
 * SessionTimeoutModal - A premium, clinical-grade alert for session expiration.
 * Features: Countdown timer, glassmorphism, and clear action path.
 */
export default function SessionTimeoutModal({ isOpen, onStayConnected, onLogout, timeLeft }) {
  if (!isOpen) return null;

  return (
    <div className="session-timeout-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(2, 6, 23, 0.85)', zIndex: 20000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(8px)'
    }}>
      <div style={{
        width: '420px',
        background: 'rgba(15, 23, 42, 0.9)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        borderRadius: '24px',
        padding: '32px',
        textAlign: 'center',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        color: 'white',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        {/* Warning Icon */}
        <div style={{
          width: '64px', height: '64px', borderRadius: '20px',
          background: 'rgba(245, 158, 11, 0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          border: '1px solid rgba(245, 158, 11, 0.2)'
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '12px', letterSpacing: '-0.02em' }}>
          SESSION INACTIVITY ALERT
        </h2>
        
        <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: '1.6', marginBottom: '24px' }}>
          Your clinical session is about to expire due to inactivity. For security, you will be automatically logged out in:
        </p>

        {/* Countdown */}
        <div style={{
          fontSize: '48px', fontWeight: 900, color: '#38bdf8',
          marginBottom: '32px', fontVariantNumeric: 'tabular-nums',
          textShadow: '0 0 20px rgba(56, 189, 248, 0.3)'
        }}>
          {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button 
            onClick={onStayConnected}
            style={{
              padding: '14px', borderRadius: '14px',
              background: 'linear-gradient(135deg, #0f52ba, #38bdf8)',
              color: 'white', border: 'none', fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
              fontSize: '14px', letterSpacing: '0.5px'
            }}
          >
            STAY CONNECTED
          </button>
          
          <button 
            onClick={onLogout}
            style={{
              padding: '12px', borderRadius: '14px',
              background: 'transparent',
              color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.2)',
              fontWeight: 600, cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            LOGOUT NOW
          </button>
        </div>

        <div style={{ marginTop: '24px', fontSize: '10px', color: '#475569', fontWeight: 700, letterSpacing: '1px' }}>
          1RAD SECURE ACCESS PROTOCOL
        </div>
      </div>
    </div>
  );
}
