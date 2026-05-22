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
  const { currentUser, logout, showTimeoutModal, timeoutCountdown, resetIdleTimer, subscription, refreshSubscription } = useAuth();
  const location = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const pageContentRef = useRef(null);

  const { isOnline, performSync, pendingCount } = useOffline();
  const [isLocked, setIsLocked] = useState(false);
  const [isResolvingLock, setIsResolvingLock] = useState(false);
  const navigate = useNavigate();
  const isAdmin = currentUser?.roles?.includes('admindoctor') || currentUser?.roles?.includes('admin');

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

  // Handle Backend Lock Event
  useEffect(() => {
    const handleLock = () => {
      setIsLocked(true);
    };
    window.addEventListener('1rad_subscription_locked', handleLock);
    return () => window.removeEventListener('1rad_subscription_locked', handleLock);
  }, []);

  // Sync with Auth Context Subscription
  // Fix #8: Only lock when subscription is confirmed inactive (not while still loading as null)
  useEffect(() => {
    if (subscription !== null && subscription.isActive === false) {
      setIsLocked(true);
    } else if (subscription !== null && subscription.isActive === true) {
      // Auto-unlock if subscription becomes active again (e.g. after payment)
      setIsLocked(false);
    }
  }, [subscription]);

  // Reset scroll and close mobile sidebar on route change
  useEffect(() => {
    setIsMobileSidebarOpen(false);
    if (pageContentRef.current) {
      pageContentRef.current.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (!currentUser) return <Outlet />;

  // If locked, render lock screen on top
  if (isLocked && location.pathname !== '/subscription') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#0a1628', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', boxShadow: '0 0 0 1px rgba(255,255,255,0.05), inset 0 2px 4px rgba(255,255,255,0.05), 0 10px 30px rgba(0,0,0,0.5)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '10px' }}>System Access Locked</h1>
        <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', maxWidth: '400px', lineHeight: 1.6, marginBottom: '30px' }}>
          Your hospital's subscription has expired or a payment is overdue. Operational access to 1Rad has been restricted.
        </p>
        
        {isAdmin ? (
          <button
            disabled={isResolvingLock}
            onClick={async () => {
              // Fix #2: Never set isLocked(false) directly. Only unlock when the backend
              // confirms the subscription is active after a real refresh.
              setIsResolvingLock(true);
              await refreshSubscription();
              setIsResolvingLock(false);
              // Navigate regardless so admin can view/manage plan details.
              // The subscription useEffect above will auto-unlock if isActive becomes true.
              navigate('/subscription');
            }}
            style={{ padding: '14px 28px', background: isResolvingLock ? '#1e40af' : '#0f52ba', color: 'white', border: 'none', borderRadius: '12px', fontSize: '13px', fontWeight: 900, cursor: isResolvingLock ? 'wait' : 'pointer', boxShadow: '0 8px 20px rgba(15,82,186,0.3)', opacity: isResolvingLock ? 0.7 : 1, transition: 'all 0.2s' }}
          >
            {isResolvingLock ? 'CHECKING...' : 'RESOLVE PAYMENT'}
          </button>
        ) : (
          <div style={{ padding: '16px 24px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', color: '#fca5a5', fontSize: '12px', fontWeight: 800 }}>
            Please contact your Hospital Administrator to renew the subscription.
          </div>
        )}
      </div>
    );
  }

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
