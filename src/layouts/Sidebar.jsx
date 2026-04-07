import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import { NAV_ITEMS, ROLE_LABELS } from '../data/roles';
import '../styles/global.css';

export default function Sidebar({ isMobileOpen, onMobileClose }) {
  const { currentUser, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  
  if (!currentUser) return null;

  const allowedNavItems = NAV_ITEMS.filter((item) =>
    item.allowedRoles.includes(currentUser.role)
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Gamification Mock Data
  const userLevel = currentUser.role === 'admindoctor' ? 99 : 12;
  const xpPercentage = 75; 

  return (
    <aside className={`sidebar gamified-sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-header">
        <div className="brand-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="logo-icon-container" style={{ 
            width: '36px', 
            height: '36px', 
            background: '#ffffff', 
            borderRadius: '10px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
            flexShrink: 0,
            border: '2px solid rgba(255,255,255,0.1)',
            position: 'relative'
          }}>
            {/* Precision Diagnostic Cross */}
            <div style={{ position: 'absolute', width: '18px', height: '6px', background: 'linear-gradient(90deg, #0f52ba, #2ecc71)', borderRadius: '2px' }}></div>
            <div style={{ position: 'absolute', width: '6px', height: '18px', background: 'linear-gradient(180deg, #0f52ba, #2ecc71)', borderRadius: '2px' }}></div>
          </div>
          {!isCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h2 className="brand" style={{ margin: 0, fontSize: '20px', fontWeight: 950, letterSpacing: '-0.5px', color: '#ffffff', textTransform: 'none', lineHeight: 1 }}>
                easy<span style={{ color: '#2ecc71' }}>RAD</span>
              </h2>
              <span className="brand-subtitle" style={{ fontSize: '9px', fontWeight: 900, color: '#00f2fe', textTransform: 'uppercase', letterSpacing: '1.2px', marginTop: '2px', opacity: 0.9 }}>
                Clinical Suite v2.0
              </span>
            </div>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <button 
            className="btn-collapse" 
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            style={{ 
              background: 'rgba(255,255,255,0.1)', 
              border: '1px solid rgba(255,255,255,0.2)', 
              borderRadius: '50%', 
              width: '28px', 
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
              boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
              color: '#00f2fe'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              e.currentTarget.style.transform = isCollapsed ? 'rotate(180deg) scale(1.1)' : 'rotate(0deg) scale(1.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.transform = isCollapsed ? 'rotate(180deg) scale(1)' : 'rotate(0deg) scale(1)';
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 900 }}>{isCollapsed ? '➡' : '⬅'}</span>
          </button>
          
          {/* Subtle connecting bar for aesthetic depth */}
          <div style={{ position: 'absolute', top: '14px', right: '-12px', width: '12px', height: '1px', background: 'rgba(255,255,255,0.1)', zIndex: -1 }}></div>
        </div>
      </div>

      {!isCollapsed && (
        <div className="player-stats" style={{ padding: '0 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '15px' }}>
          <div className="player-level" style={{ fontSize: '11px', fontWeight: 900, color: '#ffd700', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
             Lv.{userLevel} <span style={{ color: '#ffffff', opacity: 0.8 }}>| {ROLE_LABELS[currentUser.role].toUpperCase()}</span>
          </div>
          <div className="xp-bar-container" style={{ height: '5px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="xp-bar" style={{ width: `${xpPercentage}%`, height: '100%', background: 'linear-gradient(90deg, #2ecc71 0%, #00f2fe 100%)' }}></div>
          </div>
          <div className="xp-text" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', textAlign: 'right', marginTop: '5px', fontWeight: 700 }}>{xpPercentage}% TO ELITE STATUS</div>
        </div>
      )}

      <nav className="sidebar-nav">
        {allowedNavItems.map((item, index) => (
          <NavLink
            key={item.route}
            to={item.route}
            className={({ isActive }) =>
              `nav-item gamified-item ${isActive ? 'active' : ''}`
            }
            title={isCollapsed ? item.label : ''}
            style={{ 
              animationDelay: `${index * 0.1}s`,
              display: 'flex',
              alignItems: 'center',
              padding: '12px 15px',
              borderRadius: '10px',
              gap: '12px',
              textDecoration: 'none',
              transition: 'all 0.3s'
            }}
          >
            <span className="nav-icon-container" style={{ 
              width: '32px', 
              height: '32px', 
              flexShrink: 0,
              background: 'rgba(255,255,255,0.2)', 
              borderRadius: '8px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
            }}>
              <span className="nav-icon" style={{ fontSize: '18px', filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.3))' }}>{item.icon}</span>
            </span>
            {!isCollapsed && <span className="nav-label" style={{ fontWeight: 800, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px', paddingBottom: '20px' }}>
         <button 
           className="nav-item gamified-item" 
           onClick={handleLogout} 
           style={{ 
             width: '100%', 
             background: 'rgba(255,255,255,0.05)', 
             border: '1px solid rgba(255,255,255,0.1)', 
             cursor: 'pointer',
             padding: '12px 15px',
             borderRadius: '10px',
             display: 'flex',
             alignItems: 'center',
             gap: '12px',
             transition: 'all 0.3s'
           }}
           onMouseEnter={e => {
             e.currentTarget.style.background = 'rgba(231, 76, 60, 0.1)';
             e.currentTarget.style.borderColor = '#e74c3c';
           }}
           onMouseLeave={e => {
             e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
             e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
           }}
         >
            <span className="nav-icon-container" style={{ 
              width: '32px', 
              height: '32px', 
              background: 'rgba(255,255,255,0.1)', 
              borderRadius: '8px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
               <span style={{ color: '#e74c3c', fontSize: '16px', fontWeight: 900 }}>⏻</span>
            </span>
            {!isCollapsed && <span className="nav-label" style={{ fontWeight: 800, color: '#ffffff', opacity: 0.8, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px' }}>Terminate Session</span>}
         </button>
      </div>
    </aside>
  );
}
