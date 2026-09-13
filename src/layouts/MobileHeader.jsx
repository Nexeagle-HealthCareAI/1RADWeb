import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import '../styles/global.css';

export default function MobileHeader({ onMenuToggle, isSidebarOpen, currentTime }) {
  const time = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Multi-hospital switcher — the desktop TopNav switcher is hidden on mobile,
  // so the diagnostic-centre selector has to live here too. Only renders the
  // interactive affordance when the user is mapped to more than one hospital.
  const { currentUser, activeCenter, centers, switchCenter, logout } = useAuth();
  const navigate = useNavigate();
  const hasMultipleHospitals = (centers?.length || 0) > 1;
  
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isSwitchingCenter, setIsSwitchingCenter] = useState(false);
  const switcherRef = useRef(null);

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  const displayName = currentUser?.name || currentUser?.username || currentUser?.email?.split('@')[0] || 'User';
  const initial = displayName.slice(0, 1).toUpperCase();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    const onClickOutside = (e) => {
      if (isSwitcherOpen && switcherRef.current && !switcherRef.current.contains(e.target)) {
        setIsSwitcherOpen(false);
      }
      if (isProfileMenuOpen && profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setIsProfileMenuOpen(false);
      }
    };
    if (isSwitcherOpen || isProfileMenuOpen) {
      document.addEventListener('mousedown', onClickOutside);
      document.addEventListener('touchstart', onClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('touchstart', onClickOutside);
    };
  }, [isSwitcherOpen, isProfileMenuOpen]);

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
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 14px',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 1200,
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}
    >
      {/* Left: Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <img
          src={`${import.meta.env.BASE_URL}Logo.png`}
          alt="1Rad"
          style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
        />
        <span style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>1Rad</span>
      </div>

      {/* Right: Switcher + Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        
        {/* Centre Switcher */}
        <div ref={switcherRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setIsSwitcherOpen(o => !o)}
            aria-haspopup="listbox"
            aria-expanded={isSwitcherOpen}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: '#f8fafc', border: '1px solid #e2e8f0',
              padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
              outline: 'none', WebkitTapHighlightColor: 'transparent',
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{
              fontSize: '13px', fontWeight: 700, color: '#475569',
              maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {activeCenter?.name || 'NexEagle'}
            </span>
            <span style={{
              fontSize: '10px', color: '#64748b', flexShrink: 0,
              transform: isSwitcherOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}>▾</span>
          </button>

          {isSwitcherOpen && (
            <div
              role="listbox"
              style={{
                position: 'absolute', top: 'calc(100% + 12px)', right: 0,
                width: '240px', maxHeight: '60vh', overflowY: 'auto',
                background: 'white', border: '1px solid #e2e8f0',
                borderRadius: '16px', padding: '8px',
                boxShadow: '0 14px 40px rgba(0,0,0,0.12)',
                zIndex: 1300, transformOrigin: 'top right',
                animation: 'stFadeIn 0.2s ease'
              }}
            >
              <div style={{
                padding: '4px 8px 10px', fontSize: '10px', fontWeight: 800,
                color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px',
                borderBottom: '1px solid #f1f5f9', marginBottom: '8px',
                display: 'flex', justifyContent: 'space-between',
              }}>
                <span>Switch Centre</span>
                <span style={{ opacity: 0.6 }}>{centers.length}</span>
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
                      padding: '10px', borderRadius: '12px',
                      display: 'flex', alignItems: 'center', gap: '12px',
                      background: isActive ? '#eff6ff' : 'transparent',
                      border: 'none',
                      cursor: isSwitchingCenter ? 'wait' : 'pointer',
                      opacity: isSwitchingCenter && !isActive ? 0.5 : 1,
                      marginBottom: '2px', outline: 'none', WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
                      background: isActive ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' : '#f1f5f9',
                      color: isActive ? 'white' : '#64748b',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '14px',
                    }}>
                      {center.name?.charAt(0) || 'H'}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{
                        fontSize: '13px', fontWeight: 800, color: isActive ? '#1d4ed8' : '#1e293b',
                        whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden',
                      }}>
                        {center.name || 'Unnamed Center'}
                      </div>
                      {(center.groupName || center.role) && (
                        <div style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                          {[center.groupName, center.role && String(center.role).toUpperCase()].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    {isActive && <span style={{ fontSize: '12px', color: '#3b82f6' }}>✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Profile Dropdown */}
        <div ref={profileMenuRef} style={{ position: 'relative' }}>
          <button 
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '34px', height: '34px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              border: 'none', color: 'white', fontWeight: 800, fontSize: '14px',
              cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent',
              boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
              transition: 'transform 0.15s ease'
            }}
            aria-label="Profile Menu"
            aria-expanded={isProfileMenuOpen}
          >
            {initial}
          </button>

        {/* Dropdown Menu */}
        <div style={{
          position: 'absolute', top: 'calc(100% + 12px)', right: 0,
          width: '180px', background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px', padding: '8px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
          transformOrigin: 'top right',
          transform: isProfileMenuOpen ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-10px)',
          opacity: isProfileMenuOpen ? 1 : 0,
          pointerEvents: isProfileMenuOpen ? 'auto' : 'none',
          transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease',
          zIndex: 1300
        }}>
          <button 
            onClick={() => { setIsProfileMenuOpen(false); navigate('/settings'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
              padding: '12px', background: 'transparent', border: 'none',
              borderRadius: '10px', color: '#475569',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              textAlign: 'left', outline: 'none', WebkitTapHighlightColor: 'transparent',
              marginBottom: '4px'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
          
          <button 
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
              padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: 'none',
              borderRadius: '10px', color: '#f87171',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              textAlign: 'left', outline: 'none', WebkitTapHighlightColor: 'transparent'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z"/>
              <path fillRule="evenodd" d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z"/>
            </svg>
            Sign Out
          </button>
        </div>
      </div>
      </div>
    </header>
  );
}
