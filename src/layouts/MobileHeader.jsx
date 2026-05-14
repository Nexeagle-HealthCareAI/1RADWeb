import React from 'react';
import '../styles/global.css';

export default function MobileHeader({ onMenuToggle, isSidebarOpen, currentTime }) {
  const time = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <header
      className="mobile-header"
      style={{
        display: 'none',         // shown via .mobile-header CSS class on small screens
        height: '56px',
        background: '#0a1628',   // matches sidebar deep navy
        borderBottom: '1px solid #1e3a5f',
        padding: '0 14px',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 1200,
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}
    >
      {/* Left: hamburger + brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={onMenuToggle}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '36px', height: '36px', flexShrink: 0,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', cursor: 'pointer',
            color: 'rgba(255,255,255,0.80)',
            transition: 'background 0.13s',
          }}
          aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
        >
          {isSidebarOpen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="4" y1="4" x2="20" y2="20"/>
              <line x1="20" y1="4" x2="4"  y2="20"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="7"  x2="21" y2="7"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="17" x2="21" y2="17"/>
            </svg>
          )}
        </button>

        {/* Logo + brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <img
            src="/Logo.png"
            alt="NexEagle"
            style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '6px' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span style={{
              fontSize: '13px', fontWeight: 700,
              color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.2px',
              fontFamily: '"Segoe UI", system-ui, sans-serif',
            }}>NexEagle</span>
            <span style={{
              fontSize: '9.5px', fontWeight: 600,
              color: '#60a5fa', letterSpacing: '0.3px',
              fontFamily: '"Segoe UI", system-ui, sans-serif',
            }}>1Rad</span>
          </div>
        </div>
      </div>

      {/* Right: time + status dot */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '7px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.09)',
        padding: '5px 12px', borderRadius: '20px',
      }}>
        <div style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: '#34d399',
          boxShadow: '0 0 6px rgba(52,211,153,0.6)',
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: '12px', fontWeight: 600,
          color: 'rgba(255,255,255,0.80)',
          fontFamily: '"Segoe UI", system-ui, sans-serif',
          letterSpacing: '0.2px',
        }}>{time}</span>
      </div>
    </header>
  );
}
