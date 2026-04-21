import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLE_HOME } from '../data/roles';
import useAuth from '../auth/useAuth';
import '../styles/global.css';

export default function TopNav({ currentTime }) {
  const { currentUser, centers, activeCenter, switchCenter } = useAuth();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const navigate = useNavigate();
  
  if (!currentUser) return null;

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <header className="top-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '60px', padding: '0 20px', background: 'white', borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 1000 }}>
      {/* Welcome & Status HUD */}
      <div className="status-hud" style={{ display: 'flex', gap: '15px', alignItems: 'center', overflow: 'hidden' }}>
        {/* Institutional Switcher HUD - Visible if user is admin in ANY hub */}
        {(currentUser.roles?.some(role => ['admin', 'admindoctor'].includes(role)) || 
          centers.some(c => c.roles?.some(r => ['admin', 'admindoctor'].includes(r)))) && (
          <div className="center-switcher-hud" style={{ position: 'relative' }}>
            <button 
              id="center-switcher-btn"
              className="command-core-btn"
              onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 12px', borderRadius: '10px', background: '#f8f9fa', border: '1px solid #eee', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              <div className={switching ? "pulse-loader-mini" : "tactical-node-active"} style={{ width: '8px', height: '8px', borderRadius: '50%', background: switching ? '#f39c12' : '#2ecc71', boxShadow: switching ? '0 0 10px rgba(243, 156, 18, 0.4)' : '0 0 10px rgba(46, 204, 113, 0.4)' }}></div>
              <div className="hub-identity" style={{ textAlign: 'left', overflow: 'hidden' }}>
                <div className="hub-label hide-mobile" style={{ fontSize: '7px', fontWeight: 950, color: switching ? '#f39c12' : '#aaa', letterSpacing: '1px' }}>{switching ? 'RECONFIGURING HUB...' : 'DEPLOYED HUB'}</div>
                <div className="hub-name" style={{ fontSize: '12px', fontWeight: 950, color: '#1a1a2e', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '120px', opacity: switching ? 0.5 : 1 }}>{activeCenter?.name?.toUpperCase()}</div>
              </div>
              <div style={{ fontSize: '8px', color: '#888', transition: 'transform 0.3s', transform: isSwitcherOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  ▼
              </div>
            </button>

            {isSwitcherOpen && (
              <div 
                id="center-dropdown-menu"
                className="tactical-hub-dropdown"
                style={{ position: 'absolute', top: '100%', left: 0, marginTop: '12px', width: '300px', zIndex: 1100, background: 'white', borderRadius: '14px', border: '1px solid #eee', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', padding: '10px' }}
              >
                <div style={{ padding: '8px', fontSize: '9px', fontWeight: 950, color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '2px', borderBottom: '1px solid rgba(0,0,0,0.05)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>AUTHORIZED HUBS</span>
                  <span style={{ opacity: 0.5 }}>v2.42</span>
                </div>
                
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  {centers.map(center => (
                    <button
                      key={center.id}
                      onClick={async () => { 
                        const normalizedActiveId = String(activeCenter?.id).toLowerCase();
                        const normalizedTargetId = String(center.id).toLowerCase();
                        
                        if (normalizedActiveId === normalizedTargetId || switching) return;
                        setSwitching(true);
                        const result = await switchCenter(center.id); 
                        setSwitching(false);
                        setIsSwitcherOpen(false); 
                        if (result?.success && result.roles) {
                          const primaryRole = result.roles.includes('admin') || result.roles.includes('admindoctor') 
                            ? 'admin' 
                            : result.roles.includes('doctor') ? 'doctor' : 'viewer';
                          navigate(ROLE_HOME[primaryRole] || '/');
                        }
                      }}
                      className={`hub-option ${activeCenter.id === center.id ? 'active-hub' : ''}`}
                      style={{ 
                        width: '100%', textAlign: 'left', padding: '12px', borderRadius: '10px', 
                        display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', background: activeCenter.id === center.id ? '#f0f7ff' : 'transparent',
                        border: 'none', transition: 'all 0.2s', marginBottom: '4px'
                      }}
                    >
                      <div style={{ 
                        width: '8px', height: '8px', borderRadius: '50%', 
                        background: activeCenter.id === center.id ? '#2ecc71' : 'rgba(0,0,0,0.1)',
                      }}></div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 900, color: '#2c3e50', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{center.name}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

              </div>
            )}
          </div>
        )}
      </div>

      {/* Temporal HUD */}
      <div className="temporal-hud" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
        <div className="time-display" style={{ fontSize: '14px', fontWeight: 950, color: '#1a1a2e', letterSpacing: '-0.5px' }}>{formattedTime}</div>
        <div className="date-display hide-mobile" style={{ fontSize: '8px', fontWeight: 800, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px' }}>{formattedDate}</div>
      </div>
    </header>
  );
}
