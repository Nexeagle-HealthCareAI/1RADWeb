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
    <aside id="tactical-sidebar" className={`sidebar gamified-sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-header">
        <div className="brand-info">
          <div className="logo-icon-container">
            <img 
              src="/Logo.png" 
              alt="NexEgale Logo" 
              className="brand-logo-img"
            />
          </div>
          {!isCollapsed && (
            <div className="brand-text-wrapper">
              <h2 className="brand">
                1Rad
              </h2>
              <span className="brand-subtitle">
                NEXEGALE COMMAND v2.0
              </span>
            </div>
          )}
        </div>
        <button 
          id="sidebar-toggle-btn"
          className="btn-collapse" 
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand Mission Hub" : "Collapse Mission Hub"}
        >
          <span className="toggle-icon">{isCollapsed ? '☰' : '✕'}</span>
        </button>
      </div>



      <nav className="sidebar-nav">
        {allowedNavItems.map((item, index) => {
          if (item.isUpcoming) {
            return (
              <div
                key={item.route}
                className="nav-item gamified-item upcoming"
                title={`${item.label} (Coming Soon)`}
                style={{ animationDelay: `${index * 0.05}s`, opacity: 0.5, cursor: 'not-allowed' }}
              >
                <span className="nav-icon-container">
                  <span className="nav-icon">{item.icon}</span>
                </span>
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="nav-label">{item.label}</span>
                    <span style={{ fontSize: '8px', color: 'var(--tactical-cyan)', fontWeight: 900, marginTop: '2px' }}>[IN DEVELOPMENT]</span>
                  </div>
                )}
              </div>
            );
          }
          return (
            <NavLink
              key={item.route}
              to={item.route}
              id={`nav-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              className={({ isActive }) =>
                `nav-item gamified-item ${isActive ? 'active' : ''}`
              }
              title={isCollapsed ? item.label : ''}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <span className="nav-icon-container">
                <span className="nav-icon">{item.icon}</span>
              </span>
              {!isCollapsed && <span className="nav-label">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
         <button 
           id="terminate-session-btn"
           className="nav-item gamified-item terminate-btn" 
           onClick={handleLogout} 
         >
            <span className="nav-icon-container">
               <span className="logout-icon">⏻</span>
            </span>
            {!isCollapsed && <span className="nav-label">Terminate Session</span>}
         </button>
      </div>
    </aside>
  );
}
