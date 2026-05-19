import { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import useAuth from '../auth/useAuth';
import '../styles/global.css';

import TopNav from './TopNav';
import SessionTimeoutModal from '../components/SessionTimeoutModal';
import PrefetchStatusIndicator from '../components/PrefetchStatusIndicator';
import useOffline from '../hooks/useOffline';
import apiClient from '../api/apiClient';


export default function AppLayout() {
  const { currentUser, logout, showTimeoutModal, timeoutCountdown, resetIdleTimer } = useAuth();
  const location = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const pageContentRef = useRef(null);

  const { isOnline, performSync, pendingCount } = useOffline();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  // Global Auto-Sync Trigger
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      console.log(`[SYNC_ENGINE] Network detected. Syncing ${pendingCount} records...`);
      performSync(apiClient);
    }
  }, [isOnline, pendingCount, performSync]);

  // Reset scroll and close mobile sidebar on route change
  useEffect(() => {
    setIsMobileSidebarOpen(false);
    if (pageContentRef.current) {
      pageContentRef.current.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (!currentUser) return <Outlet />;

  return (
    <div className="app-layout">
      {/* Session Inactivity Guard */}
      <SessionTimeoutModal
        isOpen={showTimeoutModal}
        timeLeft={timeoutCountdown}
        onStayConnected={resetIdleTimer}
        onLogout={logout}
      />

      {/* Background DICOM Prefetch Status — only on Technician & Doctor boards */}
      {['/technician', '/doctor-board'].includes(location.pathname) && <PrefetchStatusIndicator />}

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
