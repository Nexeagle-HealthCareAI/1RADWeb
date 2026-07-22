import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import apiClient from '../../../api/apiClient';
import { notifyToast } from '../../../utils/toast';

export const ExportDrawer = ({
  isMobile,
  setIsExportDrawerOpen,
  exportMode,
  setExportMode,
  exportDates,
  setExportDates,
  handleExportData
}) => {
  return (
    <div className="drawer-overlay" onClick={() => setIsExportDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ 
        padding: 0, 
        width: isMobile ? '100%' : '500px', 
        height: isMobile ? '100%' : 'auto',
        background: 'white',
        borderRadius: isMobile ? '0' : '24px',
        maxHeight: isMobile ? '100%' : '95vh',
        overflowY: 'auto'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: isMobile ? '25px' : '35px', background: 'linear-gradient(135deg, #10b981 0%, #064e3b 100%)', color: 'white' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                 <h2 style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Fiscal Intelligence</h2>
                 <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 950, letterSpacing: '-1px' }}>EXPORT CONSOLE</div>
              </div>
              <button 
                onClick={() => setIsExportDrawerOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer', opacity: 0.7, padding: '5px' }}
              >✕</button>
           </div>
        </div>

        <div style={{ padding: isMobile ? '20px' : '35px' }}>
           <div style={{ marginBottom: '35px' }}>
              <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', display: 'block', marginBottom: '15px' }}>EXPORT_SCOPE</label>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '15px' }}>
                 <button 
                   onClick={() => setExportMode('ALL')}
                   style={{ 
                     padding: '20px', borderRadius: '16px', border: exportMode === 'ALL' ? '2px solid #10b981' : '1px solid #e2e8f0',
                     background: exportMode === 'ALL' ? '#f0fdf4' : 'white', textAlign: 'center', cursor: 'pointer'
                   }}
                 >
                   <div style={{ fontSize: '11px', fontWeight: 950, color: exportMode === 'ALL' ? '#059669' : '#64748b' }}>FULL LEDGER</div>
                   <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '4px' }}>ALL RECORDS</div>
                 </button>
                 <button 
                   onClick={() => setExportMode('RANGE')}
                   style={{ 
                     padding: '20px', borderRadius: '16px', border: exportMode === 'RANGE' ? '2px solid #10b981' : '1px solid #e2e8f0',
                     background: exportMode === 'RANGE' ? '#f0fdf4' : 'white', textAlign: 'center', cursor: 'pointer'
                   }}
                 >
                   <div style={{ fontSize: '11px', fontWeight: 950, color: exportMode === 'RANGE' ? '#059669' : '#64748b' }}>DATE RANGE</div>
                   <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '4px' }}>CUSTOM WINDOW</div>
                 </button>
              </div>
           </div>

           {exportMode === 'RANGE' && (
             <div style={{ marginBottom: '40px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', animation: 'fadeIn 0.3s' }}>
                <div>
                   <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '10px' }}>START_DATE</label>
                   <input 
                     type="date" 
                     value={exportDates.start}
                     onChange={e => setExportDates({ ...exportDates, start: e.target.value })}
                     style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 800 }}
                   />
                </div>
                <div>
                   <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '10px' }}>END_DATE</label>
                   <input 
                     type="date" 
                     value={exportDates.end}
                     onChange={e => setExportDates({ ...exportDates, end: e.target.value })}
                     style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 800 }}
                   />
                </div>
             </div>
           )}

           <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #f1f5f9', marginBottom: '40px' }}>
              <div style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1px', marginBottom: '10px' }}>DETAILS</div>
              <div style={{ display: 'flex', gap: '15px' }}>
                 <div>
                    <div style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>Format: Excel (.xlsx)</div>
                    <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>Includes full audit trail and line-item manifest.</div>
                 </div>
              </div>
           </div>

           <button 
             onClick={handleExportData}
             style={{ 
               width: '100%', padding: '18px', borderRadius: '18px', border: 'none', 
               background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
               color: 'white', fontWeight: 950, fontSize: '11px', cursor: 'pointer',
               boxShadow: '0 10px 30px rgba(16, 185, 129, 0.3)'
             }}
           >
              INITIATE EXPORT
           </button>
        </div>
      </div>
    </div>
  );
};
