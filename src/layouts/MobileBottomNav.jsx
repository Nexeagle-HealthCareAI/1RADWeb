import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import '../styles/global.css';

const ICONS = {
  '/appointment-board': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  ),
  '/billing': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12" />
      <path d="M6 8h12" />
      <path d="m6 13 8.5 8" />
      <path d="M6 13h3" />
      <path d="M9 13c6.667 0 6.667-10 0-10" />
    </svg>
  ),
  '/studies': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
      <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>
  ),
  '/doctor-board': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  ),
  'menu': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12"></line>
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <line x1="3" y1="18" x2="21" y2="18"></line>
    </svg>
  ),
  'close': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  )
};

export default function MobileBottomNav({ onMenuClick, isMenuOpen, onTabClick }) {
  const location = useLocation();

  const TABS = [
    { label: 'Appointment', route: '/appointment-board', icon: '/appointment-board' },
    { label: 'Billing', route: '/billing', icon: '/billing' },
    { label: 'Menu', action: onMenuClick, icon: isMenuOpen ? 'close' : 'menu' },
    { label: 'Cloud PACS', route: '/studies', icon: '/studies' },
    { label: 'Reports', route: '/doctor-board', icon: '/doctor-board' },
  ];

  return (
    <div className="mobile-bottom-nav">
      <div className="mobile-bottom-nav-bg"></div>
      
      <div className="mobile-bottom-nav-container">
        {TABS.map((tab) => {
          const isActive = tab.route && (location.pathname === tab.route || location.pathname.startsWith(tab.route + '/'));
          const isMenu = tab.icon === 'menu' || tab.icon === 'close';
          
          if (isMenu) {
            return (
              <button 
                key="menu" 
                onClick={tab.action} 
                className={`mobile-bottom-nav-menu-btn ${isMenuOpen ? 'menu-open' : ''}`}
                aria-label={isMenuOpen ? 'Close Menu' : 'Open Menu'}
                aria-expanded={isMenuOpen}
              >
                <div style={{
                  transform: isMenuOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {ICONS[tab.icon]}
                </div>
              </button>
            );
          }

          return (
            <NavLink
              key={tab.route}
              to={tab.route}
              onClick={() => {
                if (onTabClick) onTabClick();
              }}
              className={`mobile-bottom-nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="mobile-bottom-nav-icon">
                {ICONS[tab.icon]}
              </div>
              <span className="mobile-bottom-nav-label">
                {tab.label}
              </span>
              
              {isActive && (
                <div className="mobile-bottom-nav-indicator"></div>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
