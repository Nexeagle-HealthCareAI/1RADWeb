import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import { NAV_ITEMS } from '../data/roles';
import '../styles/global.css';

export default function Sidebar({ isMobileOpen, onMobileClose }) {
  const { currentUser, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  
  if (!currentUser) return null;

  const userRoles = currentUser.roles || [];
  const allowedNavItems = NAV_ITEMS.filter((item) =>
    item.allowedRoles.some(role => userRoles.includes(role))
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };



  return (
    <aside id="tactical-sidebar" className={`sidebar gamified-sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`} style={{ transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
      <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px' }}>
        <div className="brand-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="logo-icon-container" style={{ width: '32px', height: '32px' }}>
            <img 
              src="/Logo.png" 
              alt="NexEgale Logo" 
              className="brand-logo-img"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div className="brand-text-wrapper hide-on-collapsed" style={{ display: isCollapsed ? 'none' : 'flex', flexDirection: 'column' }}>
            <h2 className="brand" style={{ fontSize: '20px', fontWeight: 900, color: 'white', margin: 0, letterSpacing: '-0.5px' }}>
              1Rad
            </h2>
            <span className="brand-subtitle" style={{ fontSize: '8px', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              COMMAND v2.0
            </span>
          </div>
        </div>
        
        <button 
          id="sidebar-toggle-btn"
          className="btn-collapse hide-mobile" 
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '5px' }}
        >
          <span className="toggle-icon" style={{ fontSize: '18px' }}>{isCollapsed ? '☰' : '✕'}</span>
        </button>
      </div>

      <nav className="sidebar-nav" style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {allowedNavItems.map((item, index) => {
          const isUpcoming = item.isUpcoming;
          return (
            <NavLink
              key={item.route}
              to={isUpcoming ? '#' : item.route}
              onClick={(e) => { if(isUpcoming) e.preventDefault(); if(isMobileOpen) onMobileClose(); }}
              className={({ isActive }) =>
                `nav-item gamified-item ${isActive && !isUpcoming ? 'active' : ''} ${isUpcoming ? 'upcoming' : ''}`
              }
              style={{ 
                display: 'flex', alignItems: 'center', padding: '12px', borderRadius: '10px', 
                color: 'white', textDecoration: 'none', opacity: isUpcoming ? 0.4 : 1,
                background: 'transparent', transition: 'all 0.2s'
              }}
            >
              <span className="nav-icon-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '32px', fontSize: '18px' }}>
                <span className="nav-icon">{item.icon}</span>
              </span>
              <div className="nav-label-wrapper hide-on-collapsed" style={{ display: isCollapsed ? 'none' : 'flex', flexDirection: 'column', marginLeft: '12px' }}>
                <span className="nav-label" style={{ fontSize: '13px', fontWeight: 700 }}>{item.label}</span>
                {isUpcoming && <span style={{ fontSize: '7px', color: 'var(--tactical-cyan)', fontWeight: 900 }}>[COMING SOON]</span>}
              </div>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer" style={{ marginTop: 'auto', padding: '20px 10px' }}>
         <button 
           id="terminate-session-btn"
           className="nav-item gamified-item terminate-btn" 
           onClick={() => { handleLogout(); if(isMobileOpen) onMobileClose(); }} 
           style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '12px', borderRadius: '10px', border: 'none', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', cursor: 'pointer' }}
         >
            <span className="nav-icon-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '32px', fontSize: '18px' }}>
               <span className="logout-icon">⏻</span>
            </span>
            <span className="nav-label hide-on-collapsed" style={{ display: isCollapsed ? 'none' : 'block', marginLeft: '12px', fontSize: '13px', fontWeight: 700 }}>Terminate</span>
         </button>
      </div>
    </aside>
  );
}
