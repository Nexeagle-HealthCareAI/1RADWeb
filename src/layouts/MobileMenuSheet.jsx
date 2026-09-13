import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import useOffline from '../hooks/useOffline';
import { syncEngine } from '../offline/SyncEngine';
import { NAV_ITEMS, ROLE_LABELS, getRolePermissions } from '../data/roles';
import '../styles/global.css';

// Reuse the SVG icons from Sidebar (or similar ones)
const ICONS = {
  '/configuration': (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.892 3.433-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.892-1.64-.901-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319z"/>
    </svg>
  ),
  '/admin-board': <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/></svg>,
  '/appointment-board': <svg viewBox="0 0 16 16" fill="currentColor"><path d="M14 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zM1 3.857C1 3.384 1.448 3 2 3h12c.552 0 1 .384 1 .857v10.286c0 .473-.448.857-1 .857H2c-.552 0-1-.384-1-.857V3.857z"/><path d="M6.5 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-9 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-9 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>,
  '/billing': <svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4zm2-1a1 1 0 0 0-1 1v1h14V4a1 1 0 0 0-1-1H2zm13 4H1v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7zM2 10h2v1H2v-1zm0 2h2v1H2v-1zm4-2h6v1H6v-1z"/></svg>,
  '/technician': <svg viewBox="0 0 16 16" fill="currentColor"><path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/><path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12z"/></svg>,
  '/doctor-board': <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 7a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5zM5 9.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5z"/><path d="M9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5L9.5 0zm0 1v2A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5z"/></svg>,
  '/subscription': <svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 8a4 4 0 0 1 7.465-2H14a.5.5 0 0 1 .354.146l1.5 1.5a.5.5 0 0 1 0 .708l-1.5 1.5a.5.5 0 0 1-.708 0L13 9.207l-.646.647a.5.5 0 0 1-.708 0L11 9.207l-.646.647a.5.5 0 0 1-.708 0L9 9.207l-.646.647A.5.5 0 0 1 8 10h-.535A4 4 0 0 1 0 8zm4-3a3 3 0 1 0 2.712 4.285A.5.5 0 0 1 7.163 9h.63l.853-.854a.5.5 0 0 1 .708 0l.646.647.646-.647a.5.5 0 0 1 .708 0l.646.647.646-.647a.5.5 0 0 1 .708 0l.646.647.793-.793-1-1h-6.63a.5.5 0 0 1-.451-.285A3 3 0 0 0 4 5z"/><path d="M4 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>,
  '/dicom-bridge': <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"/><path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.823-.823a2 2 0 0 1-.451-2.587l1.328-1.372a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.242-4.243z"/></svg>,
  '/studies': <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"/><path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.823-.823a2 2 0 0 1-.451-2.587l1.328-1.372a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.242-4.243z"/></svg>,
  '/referrals': <svg viewBox="0 0 16 16" fill="currentColor"><path d="M12.5 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM11 12.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z"/><path d="M3.5 7a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 3.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z"/><path d="M12.5 7a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-1.5-3.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z"/><path d="M3.5 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-1.5-3.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z"/></svg>,
  '/staff': <svg viewBox="0 0 16 16" fill="currentColor"><path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path fillRule="evenodd" d="M5.216 14A2.238 2.238 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.325 6.325 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.216z"/><path d="M4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>,
  '/operations-board': <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/><path d="M8 8a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 8zm2.5 1.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zm-5 1a.5.5 0 0 1 .5.5v0a.5.5 0 0 1-1 0v0a.5.5 0 0 1 .5-.5z"/></svg>,
  '/approvals': <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/></svg>
};

const ROUTE_THEMES = {
  '/technician': { bg: '#e0f2fe', color: '#0284c7' },       // Cyan
  '/operations-board': { bg: '#ffedd5', color: '#ea580c' }, // Orange
  '/dicom-bridge': { bg: '#e0e7ff', color: '#4f46e5' },     // Indigo
  '/studies': { bg: '#dbeafe', color: '#2563eb' },          // Blue
  '/admin-board': { bg: '#f3e8ff', color: '#9333ea' },      // Purple
  '/approvals': { bg: '#fef3c7', color: '#d97706' },        // Amber
  '/referrals': { bg: '#ffe4e6', color: '#e11d48' },        // Rose
  '/staff': { bg: '#ccfbf1', color: '#0d9488' },            // Teal
  '/configuration': { bg: '#f1f5f9', color: '#475569' },    // Slate
  '/subscription': { bg: '#ede9fe', color: '#7c3aed' },     // Violet
  '/appointment-board': { bg: '#dbeafe', color: '#1d4ed8' },// Blue
  '/billing': { bg: '#dcfce7', color: '#16a34a' },          // Green
  '/doctor-board': { bg: '#e0e7ff', color: '#4338ca' }      // Indigo
};

const PACS_ONLY_ROUTES = new Set(['/admin-board', '/configuration', '/studies', '/dicom-bridge']);

export default function MobileMenuSheet({ isOpen, onClose }) {
  const { currentUser, logout, activeCenter, hasModule, modules } = useAuth();
  const { isOnline, isSyncing, pendingCount } = useOffline();
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [isOpen]);

  if (!currentUser) return null;

  const userRoles = currentUser.roles || [];
  const primaryRole = userRoles[0] || '';
  const roleLabel = ROLE_LABELS[primaryRole] || primaryRole;
  const displayName = currentUser.name || currentUser.username || currentUser.email?.split('@')[0] || 'User';
  const initial = displayName.slice(0, 1).toUpperCase();

  const allowedRoutes = userRoles.reduce((acc, role) => {
    const permissions = getRolePermissions(role, activeCenter?.id);
    return [...acc, ...permissions];
  }, []);

  const isPacsOnly = Array.isArray(modules) && modules.includes('PACS') && !modules.includes('RIS');

  // Do not exclude /dicom-bridge since it is not on the permanent bottom nav bar
  const BOTTOM_NAV_ROUTES = new Set(['/appointment-board', '/billing', '/studies', '/doctor-board']);

  const navItems = NAV_ITEMS.filter(item =>
    allowedRoutes.includes(item.route) &&
    hasModule(item.requiredModule) &&
    (!isPacsOnly || PACS_ONLY_ROUTES.has(item.route)) &&
    !BOTTOM_NAV_ROUTES.has(item.route)
  );

  const clinicalRoutes = ['/technician', '/operations-board', '/dicom-bridge', '/studies', '/appointment-board', '/doctor-board', '/billing'];
  const adminRoutes = ['/admin-board', '/approvals', '/referrals', '/staff'];
  
  const clinicalItems = navItems.filter(item => clinicalRoutes.includes(item.route));
  const adminItems = navItems.filter(item => adminRoutes.includes(item.route));
  const systemItems = navItems.filter(item => !clinicalRoutes.includes(item.route) && !adminRoutes.includes(item.route));

  const handleLogout = () => { 
    logout(); 
    onClose();
    navigate('/login'); 
  };

  const handleNavigate = (route) => {
    onClose();
    navigate(route);
  };

  const renderSection = (title, items) => {
    if (!items || items.length === 0) return null;
    return (
      <div style={{ marginBottom: '22px' }}>
        <div style={{ 
          fontSize: '11px', fontWeight: 800, color: '#94a3b8', 
          textTransform: 'uppercase', letterSpacing: '0.8px', 
          marginBottom: '12px', paddingLeft: '4px' 
        }}>
          {title}
        </div>
        <div style={{ 
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' 
        }}>
          {items.map(item => {
            const theme = ROUTE_THEMES[item.route] || { bg: '#eff6ff', color: '#2563eb' };
            return (
              <button
                key={item.route}
                onClick={() => handleNavigate(item.route)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '18px',
                  padding: '14px 6px', cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent',
                  transition: 'all 0.15s ease', boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.94)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                onTouchStart={e => e.currentTarget.style.transform = 'scale(0.94)'}
                onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <div style={{
                  width: '42px', height: '42px', borderRadius: '14px',
                  background: theme.bg, color: theme.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.03)'
                }}>
                  <div style={{ width: '22px', height: '22px' }}>
                    {ICONS[item.route] || <div style={{width:'100%', height:'100%', background:'#94a3b8', borderRadius:'50%'}}/>}
                  </div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', textAlign: 'center', lineHeight: 1.25 }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop — sits below bottom nav (z-index 2000 vs bottom nav 2050) */}
      {isOpen && (
        <div 
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            animation: 'fadeIn 0.2s ease-out'
          }}
        />
      )}

      {/* Docked Menu Sheet — floats cleanly above bottom nav (z-index 2001) */}
      <div 
        style={{
          position: 'fixed', bottom: 'calc(88px + env(safe-area-inset-bottom))', left: '14px', right: '14px',
          zIndex: 2001,
          background: '#ffffff',
          borderRadius: '28px',
          padding: '20px',
          maxHeight: 'calc(85vh - 90px)',
          overflowY: 'auto',
          transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.96)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease',
          boxShadow: '0 20px 50px -10px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8)'
        }}
      >
        {/* User Profile Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px dashed #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '14px', flexShrink: 0,
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '18px', boxShadow: '0 4px 12px rgba(15,23,42,0.2)'
            }}>
              {initial}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {displayName}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: '6px' }}>
                  {roleLabel}
                </span>
                {activeCenter?.name && (
                  <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '120px' }}>
                    · {activeCenter.name}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <button
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: '#f1f5f9', border: 'none', color: '#64748b',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent'
            }}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Offline Architecture & PWA Hub Card */}
        <div style={{
          background: isOnline ? (pendingCount > 0 ? '#fffbeb' : '#f0fdf4') : '#fef2f2',
          border: `1px solid ${isOnline ? (pendingCount > 0 ? '#fde68a' : '#bbf7d0') : '#fecaca'}`,
          borderRadius: '16px', padding: '12px 14px', marginBottom: '20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
              background: isOnline ? (pendingCount > 0 ? '#f59e0b' : '#22c55e') : '#ef4444',
              boxShadow: `0 0 0 4px ${isOnline ? (pendingCount > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)') : 'rgba(239,68,68,0.2)'}`
            }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {isOnline ? (pendingCount > 0 ? `${pendingCount} item(s) pending sync` : 'Online · PWA High-Speed') : 'Offline Mode Active'}
              </div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {isOnline ? 'Low-bandwidth architecture enabled' : 'Instant 1-click offline operation'}
              </div>
            </div>
          </div>
          
          {(pendingCount > 0 || !isOnline) && (
            <button
              onClick={() => {
                if (isOnline) syncEngine.flushOutbox();
              }}
              disabled={isSyncing || !isOnline}
              style={{
                padding: '6px 12px', borderRadius: '10px',
                background: isOnline ? '#3b82f6' : '#94a3b8',
                color: 'white', border: 'none', fontSize: '11px', fontWeight: 700,
                cursor: isOnline ? 'pointer' : 'default', flexShrink: 0,
                opacity: isSyncing ? 0.7 : 1, transition: 'all 0.15s ease'
              }}
            >
              {isSyncing ? 'Syncing...' : isOnline ? 'Sync Now' : 'Cached'}
            </button>
          )}
        </div>

        {/* Categorized Navigation Sections */}
        {renderSection('Clinical & Workspace', clinicalItems)}
        {renderSection('Management & Approvals', adminItems)}
        {renderSection('System & Tools', systemItems)}

        {/* Footer Actions */}
        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              onClick={() => handleNavigate('/settings')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px', background: '#f1f5f9', border: 'none', borderRadius: '14px',
                color: '#475569', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                outline: 'none', WebkitTapHighlightColor: 'transparent', transition: 'all 0.15s ease'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06-.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </button>
            <button
              onClick={handleLogout}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px', background: '#fef2f2', border: 'none', borderRadius: '14px',
                color: '#dc2626', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                outline: 'none', WebkitTapHighlightColor: 'transparent', transition: 'all 0.15s ease'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z"/>
                <path fillRule="evenodd" d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z"/>
              </svg>
              Sign Out
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: '10px', color: '#94a3b8', marginTop: '14px', fontWeight: 600, letterSpacing: '0.3px' }}>
            1Rad Mobile · Android-PWA v2.4 · Offline Ready
          </div>
        </div>
      </div>
    </>
  );
}
