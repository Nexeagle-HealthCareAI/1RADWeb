import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import { NAV_ITEMS, ROLE_LABELS, getRolePermissions } from '../data/roles';
import '../styles/global.css';

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg: '#0a1628',
  surface: 'rgba(255,255,255,0.05)',
  hover: 'rgba(255,255,255,0.11)',
  active: 'rgba(96,165,250,0.22)',
  activeBorder: '#60a5fa',
  border: 'rgba(255,255,255,0.12)',
  borderStrong: '#1e3a5f',
  accent: '#60a5fa',
  accentDim: 'rgba(96,165,250,0.18)',
  textHigh: 'rgba(255,255,255,0.96)',
  textMid: 'rgba(255,255,255,0.72)',
  textLow: 'rgba(255,255,255,0.45)',
  danger: '#f87171',
  dangerBg: 'rgba(248,113,113,0.10)',
  wExpanded: 228,
  wCollapsed: 60,
  wMobile: 280,
};

// ── Route → SVG icon ──────────────────────────────────────────────────────────
const ICONS = {
  '/configuration': <>
    <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
    <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.892 3.433-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.892-1.64-.901-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319z"/>
  </>,
  '/admin-board': <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>,
  '/appointment-board': <>
    <path d="M14 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zM1 3.857C1 3.384 1.448 3 2 3h12c.552 0 1 .384 1 .857v10.286c0 .473-.448.857-1 .857H2c-.552 0-1-.384-1-.857V3.857z"/>
    <path d="M6.5 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-9 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-9 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
  </>,
  '/billing': <path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4zm2-1a1 1 0 0 0-1 1v1h14V4a1 1 0 0 0-1-1H2zm13 4H1v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7zM2 10h2v1H2v-1zm0 2h2v1H2v-1zm4-2h6v1H6v-1z"/>,
  '/technician': <>
    <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
    <path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12z"/>
  </>,
  '/doctor-board': <>
    <path d="M5.5 7a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5zM5 9.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5z"/>
    <path d="M9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5L9.5 0zm0 1v2A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5z"/>
  </>,
  '/subscription': <>
    <path d="M0 8a4 4 0 0 1 7.465-2H14a.5.5 0 0 1 .354.146l1.5 1.5a.5.5 0 0 1 0 .708l-1.5 1.5a.5.5 0 0 1-.708 0L13 9.207l-.646.647a.5.5 0 0 1-.708 0L11 9.207l-.646.647a.5.5 0 0 1-.708 0L9 9.207l-.646.647A.5.5 0 0 1 8 10h-.535A4 4 0 0 1 0 8zm4-3a3 3 0 1 0 2.712 4.285A.5.5 0 0 1 7.163 9h.63l.853-.854a.5.5 0 0 1 .708 0l.646.647.646-.647a.5.5 0 0 1 .708 0l.646.647.646-.647a.5.5 0 0 1 .708 0l.646.647.793-.793-1-1h-6.63a.5.5 0 0 1-.451-.285A3 3 0 0 0 4 5z"/>
    <path d="M4 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
  </>,
  '/dicom-bridge': <>
    <path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"/>
    <path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.823-.823a2 2 0 0 1-.451-2.587l1.328-1.372a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.242-4.243z"/>
  </>,
  '/referrals': <>
    <path d="M12.5 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM11 12.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z"/>
    <path d="M3.5 7a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 3.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z"/>
    <path d="M12.5 7a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-1.5-3.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z"/>
    <path d="M3.5 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-1.5-3.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z"/>
  </>,
  '/staff': <>
    <path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
    <path fillRule="evenodd" d="M5.216 14A2.238 2.238 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.325 6.325 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.216z"/>
    <path d="M4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>
  </>,
  '/operations-board': <>
    <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
    <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
    <path d="M8 8a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 8zm2.5 1.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zm-5 1a.5.5 0 0 1 .5.5v0a.5.5 0 0 1-1 0v0a.5.5 0 0 1 .5-.5z"/>
  </>,
};

const NavIcon = ({ route, color = 'currentColor', size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={color}
    style={{ display: 'block', flexShrink: 0 }}>
    {ICONS[route] ?? <circle cx="8" cy="8" r="5"/>}
  </svg>
);

// ── Tooltip (collapsed desktop only) ─────────────────────────────────────────
function Tooltip({ label, anchorRef, visible }) {
  if (!visible || !anchorRef.current) return null;
  const { top, height } = anchorRef.current.getBoundingClientRect();
  return (
    <div style={{
      position: 'fixed', left: T.wCollapsed + 10,
      top: top + height / 2, transform: 'translateY(-50%)',
      zIndex: 9999, pointerEvents: 'none',
      display: 'flex', alignItems: 'center',
    }}>
      <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderRight: '6px solid #112240' }} />
      <div style={{
        background: '#112240', color: T.textHigh,
        padding: '6px 12px', borderRadius: '7px',
        fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap',
        border: `1px solid ${T.borderStrong}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}>{label}</div>
    </div>
  );
}

// ── Nav row ───────────────────────────────────────────────────────────────────
function NavRow({ item, collapsed, isMobile, onClose }) {
  const location = useLocation();
  const [hov, setHov] = useState(false);
  const rowRef = useRef(null);

  const isActive = location.pathname === item.route ||
    (item.route !== '/' && location.pathname.startsWith(item.route + '/'));
  const isUpcoming = !!item.isUpcoming;
  const showCollapsed = collapsed && !isMobile;

  const iconColor = isActive ? T.accent : hov ? T.textHigh : T.textMid;

  return (
    <div ref={rowRef} style={{ position: 'relative' }}>
      <NavLink
        to={isUpcoming ? '#' : item.route}
        onClick={e => { if (isUpcoming) e.preventDefault(); else onClose?.(); }}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: 'flex', alignItems: 'center',
          gap: showCollapsed ? 0 : '11px',
          padding: showCollapsed ? '10px 0' : '9px 12px',
          justifyContent: showCollapsed ? 'center' : 'flex-start',
          borderRadius: '9px',
          textDecoration: 'none',
          background: isActive ? T.active : hov ? T.hover : 'transparent',
          boxShadow: isActive && !showCollapsed ? `inset 2px 0 0 ${T.activeBorder}` : 'none',
          opacity: isUpcoming ? 0.4 : 1,
          cursor: isUpcoming ? 'default' : 'pointer',
          transition: 'background 0.13s, box-shadow 0.13s',
          outline: 'none',
          fontFamily: '"Segoe UI", system-ui, sans-serif',
        }}
      >
        <NavIcon route={item.route} color={iconColor} size={15} />

        {/* Sliding label */}
        <div style={{
          overflow: 'hidden',
          maxWidth: showCollapsed ? 0 : '200px',
          opacity: showCollapsed ? 0 : 1,
          transition: 'max-width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.17s ease',
          display: 'flex', alignItems: 'center', gap: '7px',
          flex: 1, whiteSpace: 'nowrap',
        }}>
          <span style={{
            fontSize: '13.5px', fontWeight: isActive ? 500 : 400,
            color: isActive ? T.textHigh : hov ? T.textHigh : T.textMid,
            transition: 'color 0.13s', letterSpacing: '0.01em',
          }}>{item.label}</span>
          {isUpcoming && (
            <span style={{
              fontSize: '9px', fontWeight: 700, letterSpacing: '0.4px',
              background: T.accentDim, color: T.accent,
              padding: '2px 6px', borderRadius: '4px', flexShrink: 0,
            }}>SOON</span>
          )}
        </div>

        {/* Active dot — collapsed desktop */}
        {isActive && showCollapsed && (
          <div style={{
            position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
            width: '2px', height: '18px',
            background: T.activeBorder, borderRadius: '0 2px 2px 0',
          }} />
        )}
      </NavLink>

      {showCollapsed && <Tooltip label={item.label} anchorRef={rowRef} visible={hov} />}
    </div>
  );
}

// ── Hamburger / X icon ────────────────────────────────────────────────────────
const HamburgerIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="7"  x2="21" y2="7"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="17" x2="21" y2="17"/>
  </svg>
);

const CloseIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <line x1="4" y1="4" x2="20" y2="20"/>
    <line x1="20" y1="4" x2="4"  y2="20"/>
  </svg>
);

// ── Sign-out icon ─────────────────────────────────────────────────────────────
const SignOutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
    <path fillRule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z"/>
    <path fillRule="evenodd" d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z"/>
  </svg>
);

// ── Main Sidebar ──────────────────────────────────────────────────────────────
export default function Sidebar({ isMobileOpen, onMobileClose }) {
  const { currentUser, logout, activeCenter } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [soHov, setSoHov] = useState(false);
  const [toggleHov, setToggleHov] = useState(false);
  const [closeHov, setCloseHov] = useState(false);
  const [viewW, setViewW] = useState(window.innerWidth);
  const navigate = useNavigate();

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const onResize = () => setViewW(window.innerWidth);
    const onPermissionsUpdate = () => setRefreshKey(prev => prev + 1);
    window.addEventListener('resize', onResize);
    window.addEventListener('1rad_permissions_updated', onPermissionsUpdate);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('1rad_permissions_updated', onPermissionsUpdate);
    };
  }, []);

  const isMobile = viewW < 640;
  const isTablet = viewW >= 640 && viewW < 1024;

  // On mobile/tablet the sidebar is a full drawer — collapsed rail is desktop-only
  const showCollapsed = collapsed && !isMobile && !isTablet;

  if (!currentUser) return null;

  const userRoles = currentUser.roles || [];
  const primaryRole = userRoles[0] || '';
  const roleLabel = ROLE_LABELS[primaryRole] || primaryRole;
  const displayName =
    currentUser.name || currentUser.username ||
    currentUser.email?.split('@')[0] || 'User';
  const initial = displayName.slice(0, 1).toUpperCase();

  // Dynamically resolve permitted routes based on user roles and active hospital context
  const allowedRoutes = userRoles.reduce((acc, role) => {
    const permissions = getRolePermissions(role, activeCenter?.id);
    return [...acc, ...permissions];
  }, []);

  const navItems = NAV_ITEMS.filter(item =>
    allowedRoutes.includes(item.route)
  );

  const handleLogout = () => { logout(); navigate('/login'); };

  // Width: mobile = full drawer handled by CSS, desktop = variable
  const sidebarW = isMobile
    ? T.wMobile
    : isTablet
    ? T.wExpanded
    : showCollapsed ? T.wCollapsed : T.wExpanded;

  const FF = '"Segoe UI", system-ui, sans-serif';

  return (
      <aside
      id="tactical-sidebar"
      className={`sidebar ${showCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}
      style={{
        width: sidebarW, minWidth: sidebarW,
        height: '100%',
        background: T.bg,
        borderRight: `1px solid ${T.borderStrong}`,
        display: 'flex', flexDirection: 'column',
        overflow: 'visible', flexShrink: 0,
        position: 'relative',
        transition: 'width 0.24s cubic-bezier(0.4,0,0.2,1), min-width 0.24s cubic-bezier(0.4,0,0.2,1)',
        // On mobile, CSS class handles position:fixed + transform
        zIndex: isMobile ? 1100 : 'auto',
      }}
    >

      {/* ══ HEADER ══ */}
      <div style={{
        height: '68px', flexShrink: 0,
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        padding: showCollapsed ? '0 13px' : '0 18px',
        gap: '12px', overflow: 'hidden',
        transition: 'padding 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>

        {/* Left: logo always visible + text slides out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, overflow: 'hidden' }}>
          {/* Logo — never hides */}
          <img
            src="/Logo.png"
            alt="NexEagle"
            style={{
              width: '34px', height: '34px',
              objectFit: 'contain', flexShrink: 0, borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
          />
          {/* Text — slides out on collapse */}
          <div style={{
            overflow: 'hidden',
            maxWidth: showCollapsed ? 0 : '160px',
            opacity: showCollapsed ? 0 : 1,
            transition: 'max-width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.16s ease',
            whiteSpace: 'nowrap',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{ fontSize: '18px', fontWeight: 800, color: T.textHigh, letterSpacing: '-0.4px', fontFamily: FF }}>NexEagle</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: T.accent, letterSpacing: '1px', fontFamily: FF, textTransform: 'uppercase', marginTop: '2px' }}>1Rad</span>
            </div>
          </div>
        </div>

        {/* Close — mobile */}
        {isMobile && (
          <button
            onClick={onMobileClose}
            onMouseEnter={() => setCloseHov(true)}
            onMouseLeave={() => setCloseHov(false)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '28px', height: '28px', flexShrink: 0,
              border: `1px solid ${closeHov ? T.danger : 'rgba(255,255,255,0.22)'}`,
              borderRadius: '6px',
              background: closeHov ? T.dangerBg : 'rgba(255,255,255,0.05)',
              color: closeHov ? T.danger : T.textHigh,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <CloseIcon size={13} />
          </button>
        )}
      </div>

      {/* Toggle chevron — desktop: floating over the border */}
      {!isMobile && (
        <button
          onClick={() => setCollapsed(v => !v)}
          onMouseEnter={() => setToggleHov(true)}
          onMouseLeave={() => setToggleHov(false)}
          title={showCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            position: 'absolute',
            top: '68px',
            marginTop: '-12px',
            right: '-12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '24px', height: '24px', flexShrink: 0,
            border: `1px solid ${toggleHov ? T.accent : 'rgba(255,255,255,0.22)'}`,
            borderRadius: '50%',
            background: toggleHov ? '#1e3a5f' : '#0f172a',
            color: toggleHov ? '#ffffff' : T.textHigh,
            cursor: 'pointer',
            zIndex: 100,
            transition: 'all 0.2s ease',
            boxShadow: toggleHov ? '0 0 8px rgba(96, 165, 250, 0.4)' : '0 2px 5px rgba(0,0,0,0.3)',
          }}
        >
          <svg 
            width="14" height="14" viewBox="0 0 16 16" fill="currentColor"
            style={{ 
              transform: showCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.4s cubic-bezier(0.4,0,0.2,1)'
            }}
          >
            <path d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
          </svg>
        </button>
      )}

      {/* ══ NAV ══ */}
      <nav style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: showCollapsed ? '10px 8px' : '10px 10px',
        display: 'flex', flexDirection: 'column', gap: '2px',
        scrollbarWidth: 'none',
        transition: 'padding 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Section label */}
        <div style={{
          overflow: 'hidden',
          maxHeight: showCollapsed ? 0 : '28px',
          opacity: showCollapsed ? 0 : 1,
          transition: 'max-height 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.16s ease',
        }}>
          <div style={{
            fontSize: '10px', fontWeight: 600, letterSpacing: '0.8px',
            color: T.textLow, textTransform: 'uppercase',
            padding: '4px 10px 6px', userSelect: 'none', fontFamily: FF,
          }}>Navigation</div>
        </div>

        {navItems.map(item => (
          <NavRow
            key={item.route}
            item={item}
            collapsed={showCollapsed}
            isMobile={isMobile}
            onClose={isMobile ? onMobileClose : undefined}
          />
        ))}
      </nav>

      {/* ══ FOOTER ══ */}
      <div style={{
        borderTop: `1px solid ${T.border}`,
        padding: showCollapsed ? '10px 8px' : '10px 10px',
        flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '3px',
        transition: 'padding 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>



        {/* Sign out */}
        <button
          onClick={() => { handleLogout(); onMobileClose?.(); }}
          onMouseEnter={() => setSoHov(true)}
          onMouseLeave={() => setSoHov(false)}
          title={showCollapsed ? 'Sign out' : undefined}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: showCollapsed ? 'center' : 'flex-start',
            gap: '10px',
            padding: showCollapsed ? '9px 0' : '8px 10px',
            borderRadius: '9px', border: 'none',
            background: soHov ? 'rgba(248,113,113,0.18)' : 'transparent',
            color: soHov ? '#ffffff' : T.danger, cursor: 'pointer',
            transition: 'all 0.2s ease, padding 0.22s',
            fontFamily: FF,
          }}
        >
          <SignOutIcon />
          <div style={{
            overflow: 'hidden',
            maxWidth: showCollapsed ? 0 : '150px',
            opacity: showCollapsed ? 0 : 1,
            transition: 'max-width 0.24s cubic-bezier(0.4,0,0.2,1), opacity 0.18s ease',
            whiteSpace: 'nowrap',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 400 }}>Sign out</span>
          </div>
        </button>
      </div>
    </aside>
  );
}
