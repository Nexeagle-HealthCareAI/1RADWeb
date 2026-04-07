import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import useAuth from '../auth/useAuth';
import '../styles/global.css';

export default function AppLayout() {
  const { currentUser } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [window.location.pathname]);

  if (!currentUser) return <Outlet />;

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="app-layout">
      {/* Mobile Backdrop Overlay */}
      {isMobileSidebarOpen && (
        <div 
          onClick={() => setIsMobileSidebarOpen(false)}
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

      <div className="main-content" style={{ position: 'relative' }}>
        {/* Global Tactical Header HUD (Desktop Only) */}
        <div className="top-navigation-hud" style={{ 
          position: 'absolute', 
          top: '25px', 
          left: '0',
          right: '0',
          padding: '0 40px',
          zIndex: 1000, 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none'
        }}>
          {/* Clinical Advisory & Status */}
          <div className="status-hud-wrapper" style={{ 
            background: 'rgba(255,255,255,0.8)', 
            backdropFilter: 'blur(10px)',
            border: '1px solid #dee2e6',
            padding: '8px 25px',
            borderRadius: '30px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
             <span style={{ width: '8px', height: '8px', background: '#2ecc71', borderRadius: '50%', boxShadow: '0 0 10px #2ecc71' }}></span>
             <span className="status-text" style={{ fontSize: '11px', fontWeight: 900, color: '#2c3e50', letterSpacing: '0.5px' }}>
                <span className="welcome-label" style={{ opacity: 0.6 }}>WELCOME,</span> {currentUser.name.toUpperCase()} 
                <span className="status-separator" style={{ margin: '0 10px', opacity: 0.2 }}>|</span>
                <span className="status-label" style={{ color: '#0f52ba' }}>SYSTEM OPERATIONAL ⚡</span>
             </span>
          </div>

          {/* Temporal HUD */}
          <div className="temporal-hud" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'flex-end'
          }}>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f52ba', letterSpacing: '1px' }}>
              {formattedTime}
            </div>
            <div className="date-label" style={{ fontSize: '10px', fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
              {formattedDate}
            </div>
          </div>
        </div>

        <main className="page-content" style={{ padding: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
