import { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import useAuth from '../auth/useAuth';
import '../styles/global.css';

import TopNav from './TopNav';

export default function AppLayout() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const pageContentRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  // Reset scroll and close mobile sidebar on route change
  useEffect(() => {
    setIsMobileSidebarOpen(false);
    if (pageContentRef.current) {
      pageContentRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  if (!currentUser) return <Outlet />;

  return (
    <div className="app-layout">
      {/* Mobile Backdrop Overlay */}
      {isMobileSidebarOpen && (
        <div 
          onClick={() => setIsMobileSidebarOpen(false)}
          className="mobile-backdrop"
          style={{ 
            position: 'fixed', 
            top: 0, left: 0, right: 0, bottom: 0, 
            background: 'rgba(0,0,0,0.5)', 
            zIndex: 1090,
            backdropFilter: 'blur(3px)'
          }}
        />
      )}

      <MobileHeader 
        onMenuToggle={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)} 
        isSidebarOpen={isMobileSidebarOpen}
        currentTime={currentTime}
      />

      <Sidebar 
        isMobileOpen={isMobileSidebarOpen} 
        onMobileClose={() => setIsMobileSidebarOpen(false)} 
      />

      <div className="main-content">
        <TopNav currentTime={currentTime} />

        <main className="page-content" ref={pageContentRef} style={{ padding: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
