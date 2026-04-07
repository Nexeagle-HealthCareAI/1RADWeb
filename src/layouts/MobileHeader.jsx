import React from 'react';
import '../styles/global.css';

export default function MobileHeader({ onMenuToggle, isSidebarOpen, currentTime }) {
  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <header className="mobile-header" style={{ 
      display: 'none', /* Hidden by default, shown in global.css media query */
      height: '60px',
      background: '#ffffff',
      borderBottom: '1px solid #dee2e6',
      padding: '0 15px',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1200,
      boxShadow: '0 2px 10px rgba(0,0,0,0.05)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <button 
          onClick={onMenuToggle}
          style={{ 
            background: 'transparent', 
            border: 'none', 
            fontSize: '24px', 
            display: 'flex', 
            alignItems: 'center', 
            cursor: 'pointer',
            color: '#2c3e50'
          }}
        >
          {isSidebarOpen ? '✕' : '☰'}
        </button>
        <div style={{ fontSize: '18px', fontWeight: 950, color: '#0f52ba', letterSpacing: '-0.5px' }}>
          easy<span style={{ color: '#2ecc71' }}>RAD</span>
        </div>
      </div>

      <div style={{ 
        background: '#f8f9fa', 
        padding: '5px 12px', 
        borderRadius: '20px', 
        border: '1px solid #eee',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
         <span style={{ width: '6px', height: '6px', background: '#2ecc71', borderRadius: '50%', boxShadow: '0 0 5px #2ecc71' }}></span>
         <span style={{ fontSize: '12px', fontWeight: 900, color: '#0f52ba', letterSpacing: '0.5px' }}>{formattedTime}</span>
      </div>
    </header>
  );
}
