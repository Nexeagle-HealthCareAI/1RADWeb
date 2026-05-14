import { useState, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import { NAV_ITEMS, ROLE_LABELS } from '../data/roles';
import '../styles/global.css';

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg: '#0d1117',
  bgHover: 'rgba(255,255,255,0.05)',
  bgActive: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.07)',
  accent: '#3b82f6',
  textPrimary: 'rgba(255,255,255,0.90)',
  textSecondary: 'rgba(255,255,255,0.42)',
  textMuted: 'rgba(255,255,255,0.22)',
  danger: '#f87171',
  dangerHover: 'rgba(248,113,113,0.10)',
};

// ── Route → SVG icon (16×16 viewBox, fill="currentColor") ────────────────────
const ROUTE_ICONS = {
  '/configuration': (
    <>
      <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.892 3.433-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.892-1.64-.901-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319z"/>
    </>
  ),
  '/admin-board': (
    <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
  ),
  '/appointment-board': (
    <>
      <path d="M14 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zM1 3.857C1 3.384 1.448 3 2 3h12c.552 0 1 .384 1 .857v10.286c0 .473-.448.857-1 .857H2c-.552 0-1-.384-1-.857V3.857z"/>
      <path d="M6.5 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-9 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-9 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
    </>
  ),
  '/billing': (
    <path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4zm2-1a1 1 0 0 0-1 1v1h14V4a1 1 0 0 0-1-1H2zm13 4H1v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7zM2 10h2v1H2v-1zm0 2h2v1H2v-1zm4-2h6v1H6v-1z"/>
  ),
  '/technician': (
    <>
      <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
      <path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12z"/>
    </>
  ),
  '/doctor-board': (
    <>
      <path d="M5.5 7a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5zM5 9.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5z"/>
      <path d="M9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5L9.5 0zm0 1v2A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5z"/>
    </>
  ),
  '/subscription': (
    <>
      <path d="M0 8a4 4 0 0 1 7.465-2H14a.5.5 0 0 1 .354.146l1.5 1.5a.5.5 0 0 1 0 .708l-1.5 1.5a.5.5 0 0 1-.708 0L13 9.207l-.646.647a.5.5 0 0 1-.708 0L11 9.207l-.646.647a.5.5 0 0 1-.708 0L9 9.207l-.646.647A.5.5 0 0 1 8 10h-.535A4 4 0 0 1 0 8zm4-3a3 3 0 1 0 2.712 4.285A.5.5 0 0 1 7.163 9h.63l.853-.854a.5.5 0 0 1 .708 0l.646.647.646-.647a.5.5 0 0 1 .708 0l.646.647.646-.647a.5.5 0 0 1 .708 0l.646.647.793-.793-1-1h-6.63a.5.5 0 0 1-.451-.285A3 3 0 0 0 4 5z"/>
      <path d="M4 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
    </>
  ),
  '/dicom-bridge': (
    <>
      <path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"/>
      <path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.823-.823a2 2 0 0 1-.451-2.587l1.328-1.372a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.242-4.243z"/>
    </>
  ),
};

const NavIcon = ({ route, size = 15 }) => (
  <svg
    width={size} height={size}
    viewBox="0 0 16 16"
    fill="currentColor"
    style={{ display: 'block', flexShrink: 0 }}
  >
    {ROUTE_ICONS[route] ?? <circle cx="8" cy="8" r="4"/>}
  </svg>
);

// ── Floating tooltip (appears to the right when sidebar is collapsed) ─────────
function CollapsedTooltip({ label, visible, anchorRef }) {
  const [pos, setPos] = useState({ top: 0 });

  if (!visible || !anchorRef.current) return null;

  const rect = anchorRef.current.getBoundingClientRect();
  const top = rect.top + rect.height / 2;

  return (
    <div
      style={{
        position: 'fixed',
        left: '74px',
        top,
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      {/* Arrow */}
      <div style={{
        width: 0, height: 0,
        borderTop: '5px solid transparent',
        borderBottom: '5px solid transparent',
        borderRight: '6px solid #1e2530',
      }} />
      {/* Label bubble */}
      <div style={{
        background: '#1e2530',
        color: 'rgba(255,255,255,0.90)',
        padding: '5px 11px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        letterSpacing: '0.1px',
      }}>
        {label}
      </div>
    </div>
  );
}

// ── Nav item ──────────────────────────────────────────────────────────────────
function NavItem({ item, isCollapsed, onMobileClose }) {
  const location = useLocation();
  const [hovered, setHovered] = useState(false);
  const ref = useRef(null);

  const isActive = location.pathname === item.route ||
    (item.route !== '/' && location.pathname.startsWith(item.route + '/'));
  const isUpcoming = !!item.isUpcoming;

  return (
    <>
      <NavLink
        ref={ref}
        to={isUpcoming ? '#' : item.route}
        onClick={e => {
          if (isUpcoming) e.preventDefault();
          if (onMobileClose) onMobileClose();
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: isCollapsed ? '10px 0' : '8px 10px',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          borderRadius: '7px',
          textDecoration: 'none',
          color: isActive ? T.textPrimary : hovered ? T.textPrimary : T.textSecondary,
          background: isActive ? T.bgActive : hovered ? T.bgHover : 'transparent',
          borderLeft: !isCollapsed
            ? `2px solid ${isActive ? T.accent : 'transparent'}`
            : '2px solid transparent',
          opacity: isUpcoming ? 0.38 : 1,
          transition: 'background 0.12s, color 0.12s',
          fontFamily: '"Segoe UI", system-ui, sans-serif',
          cursor: isUpcoming ? 'default' : 'pointer',
          position: 'relative',
          marginLeft: isCollapsed ? 0 : '-2px',
          outline: 'none',
        }}
      >
        {/* Icon — always shown */}
        <NavIcon route={item.route} size={15} />

        {/* Label — only when expanded */}
        {!isCollapsed && (
          <span style={{
            fontSize: '13px',
            fontWeight: isActive ? 500 : 400,
            flex: 1,
            lineHeight: 1.3,
          }}>
            {item.label}
          </span>
        )}

        {/* Active accent dot for collapsed */}
        {isActive && isCollapsed && (
          <div style={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: '2px',
            height: '18px',
            background: T.accent,
            borderRadius: '0 2px 2px 0',
          }} />
        )}

        {/* Coming-soon badge */}
        {isUpcoming && !isCollapsed && (
          <span style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.4px',
            background: 'rgba(59,130,246,0.14)', color: '#60a5fa',
            padding: '2px 5px', borderRadius: '3px',
          }}>SOON</span>
        )}
      </NavLink>

      {/* Tooltip (collapsed only) */}
      {isCollapsed && (
        <CollapsedTooltip
          label={item.label}
          visible={hovered}
          anchorRef={ref}
        />
      )}
    </>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar({ isMobileOpen, onMobileClose }) {
  const { currentUser, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [signOutHovered, setSignOutHovered] = useState(false);
  const navigate = useNavigate();

  if (!currentUser) return null;

  const userRoles = currentUser.roles || [];
  const primaryRole = userRoles[0] || '';
  const roleLabel = ROLE_LABELS[primaryRole] || primaryRole;
  const displayName =
    currentUser.name ||
    currentUser.username ||
    currentUser.email?.split('@')[0] ||
    'User';
  const avatarInitial = displayName.slice(0, 1).toUpperCase();

  const allowedNavItems = NAV_ITEMS.filter(item =>
    item.allowedRoles.some(role => userRoles.includes(role))
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const w = isCollapsed ? '60px' : '216px';

  return (
    <aside
      id="tactical-sidebar"
      className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}
      style={{
        width: w, minWidth: w,
        background: T.bg,
        display: 'flex', flexDirection: 'column',
        height: '100vh',
        borderRight: `1px solid ${T.border}`,
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'space-between',
        padding: isCollapsed ? '18px 0' : '16px 14px',
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
        minHeight: '56px',
      }}>
        {!isCollapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '14px', fontWeight: 700,
              color: T.textPrimary, letterSpacing: '-0.2px',
              fontFamily: '"Segoe UI", system-ui, sans-serif',
            }}>1Rad</span>
            <span style={{
              fontSize: '9px', fontWeight: 700,
              color: T.accent,
              background: 'rgba(59,130,246,0.12)',
              padding: '2px 6px', borderRadius: '4px',
              letterSpacing: '0.4px',
            }}>PRO</span>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          className="hide-mobile"
          onClick={() => setIsCollapsed(v => !v)}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: 'transparent', border: 'none',
            color: T.textMuted, cursor: 'pointer',
            width: '28px', height: '28px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '6px', transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = T.bgHover; e.currentTarget.style.color = T.textPrimary; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted; }}
        >
          {isCollapsed ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 8a.5.5 0 0 1 .5-.5h5.793L8.146 5.354a.5.5 0 1 1 .708-.708l3 3a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L10.293 8.5H4.5A.5.5 0 0 1 4 8z"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M12 8a.5.5 0 0 1-.5.5H5.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 0 1 .708.708L5.707 7.5H11.5a.5.5 0 0 1 .5.5z"/>
            </svg>
          )}
        </button>
      </div>

      {/* ── Nav ── */}
      <nav style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: isCollapsed ? '8px 8px' : '8px 10px',
        display: 'flex', flexDirection: 'column', gap: '2px',
        scrollbarWidth: 'none',
      }}>
        {/* Section label */}
        {!isCollapsed && (
          <div style={{
            fontSize: '10px', fontWeight: 600, letterSpacing: '0.7px',
            color: T.textMuted, textTransform: 'uppercase',
            padding: '10px 10px 5px',
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            userSelect: 'none',
          }}>Navigation</div>
        )}

        {allowedNavItems.map(item => (
          <NavItem
            key={item.route}
            item={item}
            isCollapsed={isCollapsed}
            onMobileClose={onMobileClose}
          />
        ))}
      </nav>

      {/* ── Footer: user card + sign out ── */}
      <div style={{
        borderTop: `1px solid ${T.border}`,
        padding: isCollapsed ? '10px 8px' : '10px 10px',
        flexShrink: 0,
        display: 'flex', flexDirection: 'column', gap: '3px',
      }}>
        {/* User card */}
        {!isCollapsed ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 10px', borderRadius: '7px',
            background: T.bgHover, marginBottom: '3px',
          }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 700, color: 'white',
              flexShrink: 0, fontFamily: '"Segoe UI", sans-serif',
              letterSpacing: '0.5px',
            }}>
              {avatarInitial}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: '12px', fontWeight: 600, color: T.textPrimary,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                fontFamily: '"Segoe UI", sans-serif',
              }}>
                {displayName}
              </div>
              <div style={{
                fontSize: '10px', color: T.textMuted,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                fontFamily: '"Segoe UI", sans-serif', marginTop: '1px',
              }}>
                {roleLabel}
              </div>
            </div>
          </div>
        ) : (
          /* Collapsed: just avatar */
          <div style={{
            display: 'flex', justifyContent: 'center',
            marginBottom: '3px', padding: '4px 0',
          }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 700, color: 'white',
              fontFamily: '"Segoe UI", sans-serif',
            }}>
              {avatarInitial}
            </div>
          </div>
        )}

        {/* Sign out button */}
        <button
          onClick={() => { handleLogout(); if (onMobileClose) onMobileClose(); }}
          onMouseEnter={() => setSignOutHovered(true)}
          onMouseLeave={() => setSignOutHovered(false)}
          title={isCollapsed ? 'Sign out' : undefined}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            gap: '9px',
            padding: isCollapsed ? '9px 0' : '8px 10px',
            borderRadius: '7px', border: 'none',
            background: signOutHovered ? T.dangerHover : 'transparent',
            color: T.danger, cursor: 'pointer',
            transition: 'background 0.12s',
            fontFamily: '"Segoe UI", system-ui, sans-serif',
          }}
        >
          {/* Sign-out icon */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
            <path fillRule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z"/>
            <path fillRule="evenodd" d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z"/>
          </svg>
          {!isCollapsed && (
            <span style={{ fontSize: '13px', fontWeight: 400 }}>Sign out</span>
          )}
        </button>
      </div>
    </aside>
  );
}
