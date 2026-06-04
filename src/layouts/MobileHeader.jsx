import React, { useState, useRef, useEffect } from 'react';
import useAuth from '../auth/useAuth';
import '../styles/global.css';

export default function MobileHeader({ onMenuToggle, isSidebarOpen, currentTime }) {
  const time = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Multi-hospital switcher — the desktop TopNav switcher is hidden on mobile,
  // so the diagnostic-centre selector has to live here too. Only renders the
  // interactive affordance when the user is mapped to more than one hospital.
  const { activeCenter, centers, switchCenter } = useAuth();
  const hasMultipleHospitals = (centers?.length || 0) > 1;
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isSwitchingCenter, setIsSwitchingCenter] = useState(false);
  const switcherRef = useRef(null);

  useEffect(() => {
    if (!isSwitcherOpen) return undefined;
    const onClickOutside = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setIsSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('touchstart', onClickOutside);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('touchstart', onClickOutside);
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
      // Reload so every screen re-derives from the new active hospital —
      // matches the desktop TopNav switch behaviour.
      window.location.reload();
    }
  };

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
      {/* Left: hamburger + brand/centre switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
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

        {/* Logo + active centre (tap to switch when multi-hospital) */}
        <div ref={switcherRef} style={{ position: 'relative', minWidth: 0, flex: 1 }}>
          <button
            type="button"
            onClick={() => hasMultipleHospitals && setIsSwitcherOpen(o => !o)}
            disabled={!hasMultipleHospitals}
            aria-haspopup={hasMultipleHospitals ? 'listbox' : undefined}
            aria-expanded={hasMultipleHospitals ? isSwitcherOpen : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: '9px',
              background: 'transparent', border: 'none', padding: 0,
              cursor: hasMultipleHospitals ? 'pointer' : 'default',
              fontFamily: 'inherit', minWidth: 0, maxWidth: '100%',
            }}
          >
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img
                src={`${import.meta.env.BASE_URL}Logo.png`}
                alt="NexEagle"
                style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '6px' }}
              />
              {hasMultipleHospitals && (
                <span style={{
                  position: 'absolute', bottom: '-3px', right: '-3px',
                  minWidth: '14px', height: '14px', padding: '0 3px',
                  borderRadius: '7px', background: '#34d399',
                  color: '#0a1628', fontSize: '8px', fontWeight: 950,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1.5px solid #0a1628', lineHeight: 1,
                }}>{centers.length}</span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0, textAlign: 'left' }}>
              <span style={{
                fontSize: '8px', fontWeight: 800,
                color: '#60a5fa', letterSpacing: '0.4px', textTransform: 'uppercase',
                fontFamily: '"Segoe UI", system-ui, sans-serif',
              }}>{hasMultipleHospitals ? 'Active centre' : '1Rad'}</span>
              <span style={{
                fontSize: '12.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px',
                color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.2px',
                fontFamily: '"Segoe UI", system-ui, sans-serif',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeCenter?.name || 'NexEagle'}
                </span>
                {hasMultipleHospitals && (
                  <span style={{
                    fontSize: '10px', color: '#94a3b8', flexShrink: 0,
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
                position: 'absolute', top: 'calc(100% + 12px)', left: '-40px',
                width: '78vw', maxWidth: '320px', maxHeight: '64vh', overflowY: 'auto',
                background: 'white', border: '1px solid #e2e8f0',
                borderRadius: '14px', padding: '10px',
                boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
                zIndex: 1300,
              }}
            >
              <div style={{
                padding: '4px 8px 10px', fontSize: '9px', fontWeight: 950,
                color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '1.5px',
                borderBottom: '1px solid #f1f5f9', marginBottom: '8px',
                display: 'flex', justifyContent: 'space-between',
              }}>
                <span>Switch centre</span>
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
                      marginBottom: '4px', fontFamily: 'inherit',
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
                      <span style={{ fontSize: '9px', fontWeight: 950, color: '#10b981', letterSpacing: '1px', flexShrink: 0 }}>ACTIVE</span>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>↵</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: time + status dot */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.09)',
        padding: '5px 12px', borderRadius: '20px', marginLeft: '10px',
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
