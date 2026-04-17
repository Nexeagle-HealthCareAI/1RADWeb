import React, { useState } from 'react';
import useAuth from '../auth/useAuth';
import '../styles/global.css';

export default function TopNav({ currentTime }) {
  const { currentUser, centers, activeCenter, switchCenter, createCenter } = useAuth();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isCenterDrawerOpen, setIsCenterDrawerOpen] = useState(false);
  const [newCenter, setNewCenter] = useState({ name: '', address: '' });

  const handleCreateCenter = (e) => {
    e.preventDefault();
    if (!newCenter.name || !newCenter.address) return;
    createCenter(newCenter);
    setNewCenter({ name: '', address: '' });
    setIsCenterDrawerOpen(false);
  };
  
  if (!currentUser) return null;

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <>
      <header className="top-nav">
      {/* Welcome & Status HUD */}
      <div className="status-hud" style={{ display: 'flex', gap: '30px', alignItems: 'center' }}>
        {/* Institutional Switcher HUD - Restricted to Admins */}
        {currentUser.roles?.some(role => ['admin', 'admindoctor'].includes(role)) && (
          <div className="center-switcher-hud" style={{ position: 'relative' }}>
          <button 
            id="center-switcher-btn"
            className="command-core-btn"
            onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
          >
            <div className="tactical-node-active"></div>
            <div className="hub-identity">
              <span className="hub-label">DEPLOYED HUB</span>
              <span className="hub-name">{activeCenter?.name?.toUpperCase()}</span>
            </div>
            <div style={{ marginLeft: '10px', fontSize: '10px', transition: 'transform 0.3s', transform: isSwitcherOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
               ▼
            </div>
          </button>

          {isSwitcherOpen && (
            <div 
              id="center-dropdown-menu"
              className="tactical-hub-dropdown"
              style={{ position: 'absolute', top: '100%', left: 0, marginTop: '12px', width: '320px', zIndex: 1000 }}
            >
              <div style={{ padding: '12px', fontSize: '10px', fontWeight: 900, color: 'var(--tactical-indigo)', textTransform: 'uppercase', letterSpacing: '2px', borderBottom: '1px solid rgba(0,0,0,0.05)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                <span>AUTHORIZED HUBS</span>
                <span style={{ opacity: 0.5 }}>v2.41</span>
              </div>
              
              <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '5px' }}>
                {centers.map(center => (
                  <button
                    key={center.id}
                    onClick={() => { switchCenter(center.id); setIsSwitcherOpen(false); }}
                    className={`hub-option ${activeCenter.id === center.id ? 'active-hub' : ''}`}
                    style={{ 
                      width: '100%', textAlign: 'left', padding: '15px', borderRadius: '12px', 
                      display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', background: 'transparent'
                    }}
                  >
                    <div style={{ 
                      width: '12px', height: '12px', borderRadius: '4px', 
                      background: activeCenter.id === center.id ? '#2ecc71' : 'rgba(0,0,0,0.1)',
                      boxShadow: activeCenter.id === center.id ? '0 0 10px rgba(46, 204, 113, 0.4)' : 'none'
                    }}></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#2c3e50' }}>{center.name}</span>
                        {activeCenter.id === center.id && <span style={{ fontSize: '9px', color: '#2ecc71', fontWeight: 900 }}>[ ACTIVE ]</span>}
                      </div>
                      <span style={{ fontSize: '11px', color: '#888', display: 'block', marginTop: '2px' }}>{center.address}</span>
                      <span className="id-badge">HUB-ID: {center.id}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div style={{ padding: '10px', marginTop: '10px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                <button 
                  onClick={() => { setIsCenterDrawerOpen(true); setIsSwitcherOpen(false); }}
                  className="gamified-btn"
                  style={{ width: '100%', padding: '12px', fontSize: '11px', borderRadius: '10px' }}
                >
                  + INITIALIZE NEW INFRASTRUCTURE
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>

      {/* Temporal HUD */}
      <div className="temporal-hud">
        <div className="time-display">{formattedTime}</div>
        <div className="date-display">{formattedDate}</div>
      </div>
    </header>

    {/* Center Initialization Drawer */}
    {isCenterDrawerOpen && (
      <div className="drawer-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setIsCenterDrawerOpen(false)}>
        <div className="tactical-drawer animate-slide-right" style={{ width: '450px', height: '100%', background: 'white', padding: '40px', boxShadow: '-10px 0 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
           <div className="drawer-header" style={{ marginBottom: '40px' }}>
              <div style={{ fontSize: '10px', fontWeight: 900, color: '#0f52ba', letterSpacing: '1px', marginBottom: '8px' }}>CLINICAL EXPANSION</div>
              <h2 style={{ fontSize: '24px', fontWeight: 950, color: '#2c3e50', letterSpacing: '-0.5px' }}>INITIALIZE INFRASTRUCTURE</h2>
           </div>

           <form onSubmit={handleCreateCenter} style={{ display: 'flex', flexDirection: 'column', gap: '25px', flex: 1 }}>
              <div className="form-group">
                 <label style={{ fontSize: '10px', fontWeight: 900, color: '#888', marginBottom: '8px', display: 'block' }}>INSTITUTION NAME</label>
                 <input 
                    type="text" 
                    required 
                    autoFocus
                    placeholder="e.g. North Wing Diagnostics" 
                    value={newCenter.name}
                    onChange={e => setNewCenter({...newCenter, name: e.target.value})}
                    style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '1px solid #dee2e6', fontSize: '14px', fontWeight: 600 }}
                 />
              </div>

              <div className="form-group">
                 <label style={{ fontSize: '10px', fontWeight: 900, color: '#888', marginBottom: '8px', display: 'block' }}>PHYSICAL INFRASTRUCTURE ADDRESS</label>
                 <textarea 
                    required 
                    placeholder="Enter full clinical facility location..." 
                    rows="4"
                    value={newCenter.address}
                    onChange={e => setNewCenter({...newCenter, address: e.target.value})}
                    style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '1px solid #dee2e6', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit' }}
                 />
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', gap: '15px' }}>
                 <button type="button" onClick={() => setIsCenterDrawerOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '12px', border: '1px solid #dee2e6', background: 'white', fontWeight: 900, cursor: 'pointer' }}>CANCEL</button>
                 <button type="submit" style={{ flex: 2, padding: '16px', borderRadius: '12px', border: 'none', background: '#0f52ba', color: 'white', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 15px rgba(15, 82, 186, 0.3)' }}>DEPLOY INFRASTRUCTURE</button>
              </div>
           </form>
        </div>
      </div>
    )}
  </>
  );
}
