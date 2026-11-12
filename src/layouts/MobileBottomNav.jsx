import { useLang, t } from '../i18n';
import { NavLink, useLocation } from 'react-router-dom';
import { useNavAccess, pickTabs } from './navAccess';
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
  ),
  'home': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  ),
  'partners': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14.8c2 .7 3.2 2.5 3.5 5.2" />
    </svg>
  ),
  'tracker': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 3v2h6V3" />
      <path d="m9 13 2 2 4-4" />
    </svg>
  ),
};

export default function MobileBottomNav({ onMenuClick, isMenuOpen, onTabClick }) {
  useLang();
  const location = useLocation();
  const { can } = useNavAccess();

  // Only pages this user can open (a receptionist never sees Reports, a doctor
  // never sees Money). Menu sits in the middle; the rest go either side.
  const tabs = pickTabs(can).map((d) => ({ label: t(d.key), route: d.route, icon: d.icon }));
  const half = Math.ceil(tabs.length / 2);
  const onATab = tabs.some((tab) => location.pathname === tab.route || location.pathname.startsWith(tab.route + '/'));

  const renderTab = (tab) => {
    const isActive = location.pathname === tab.route || location.pathname.startsWith(tab.route + '/');
    return (
      <NavLink
        key={tab.route}
        to={tab.route}
        onClick={() => { if (onTabClick) onTabClick(); }}
        className={`mobile-bottom-nav-item ${isActive ? 'active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
      >
        <div className="mobile-bottom-nav-icon">{ICONS[tab.icon]}</div>
        <span className="mobile-bottom-nav-label">{tab.label}</span>
        {isActive && <div className="mobile-bottom-nav-indicator"></div>}
      </NavLink>
    );
  };

  return (
    <div className="mobile-bottom-nav">
      <div className="mobile-bottom-nav-bg"></div>
      <div className="mobile-bottom-nav-container">
        {tabs.slice(0, half).map(renderTab)}
        <div className="mobile-bottom-nav-item mobile-bottom-nav-menu-slot">
          <button
            onClick={onMenuClick}
            className={`mobile-bottom-nav-menu-btn ${isMenuOpen ? 'menu-open' : ''} ${!onATab && !isMenuOpen ? 'menu-here' : ''}`}
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMenuOpen}
          >
            <div style={{
              transform: isMenuOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {ICONS[isMenuOpen ? 'close' : 'menu']}
            </div>
          </button>
          {/* "You are here" when the open page lives in the menu, not on a tab. */}
          <span className={`mobile-bottom-nav-label mobile-bottom-nav-menu-label ${!onATab ? 'here' : ''}`}>{t('nav.menu')}</span>
        </div>
        {tabs.slice(half).map(renderTab)}
      </div>
    </div>
  );
}
