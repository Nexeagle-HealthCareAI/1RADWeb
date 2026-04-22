import { useState, useMemo, useEffect, useCallback } from 'react';
import apiClient from '../api/apiClient';
import '../styles/global.css';

const MODALITY_ICONS = {
  'X-RAY': '🩻',
  'MRI': '🧠',
  'CT': '🌀',
  'ULTRASOUND': '🤰',
  'DEXA': '🦴',
  'MAMMOGRAPHY': '🎀'
};

const TEMPLATES = {
  'NORMAL CHEST': { findings: 'The heart and mediastinal silhouettes are normal. Lungs are clear. No pleural effusion or pneumothorax.', impression: 'NORMAL CHEST X-RAY.' },
  'NORMAL BRAIN': { findings: 'Brain parenchyma shows normal signal intensity. No space-occupying lesions. Ventricular system is normal.', impression: 'NO ACUTE INTRACRANIAL PATHOLOGY.' },
  'NORMAL ABDOMEN': { findings: 'Liver, spleen, and kidneys appear normal. No free air or fluid in the peritoneal cavity.', impression: 'NO ACUTE ABDOMINAL PATHOLOGY DETECTED.' }
};

export default function DoctorBoard() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('QUEUE'); // 'QUEUE', 'WORKSPACE', or 'HISTORY'
  const [activeCase, setActiveCase] = useState(null);
  
  // Reporting State
  const [report, setReport] = useState({ history: '', findings: '', impression: '', advice: '', technique: '' });
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [currentSlice, setCurrentSlice] = useState(1);
  const [printModalData, setPrintModalData] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [modalityFilter, setModalityFilter] = useState('ALL');

  const TODAY = new Date().toISOString().split('T')[0];

  // --- API SYNC ---
  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/appointments');
      const allCases = res.data.map(a => ({
        ...a,
        id: a.displayId,
        priority: a.type === 'EMERGENCY' ? 'STAT' : 'ROUTINE',
        isToday: (a.date || (a.dateTime ? a.dateTime.split('T')[0] : null)) === TODAY
      }));
      setCases(allCases);
    } catch (err) {
      console.error('[DOCTOR] Case fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [TODAY]);

  useEffect(() => {
    fetchCases();
    const interval = setInterval(fetchCases, 45000); 
    return () => clearInterval(interval);
  }, [fetchCases]);

  const handleStatusUpdate = async (id, newStatus) => {
    try {
      await apiClient.patch(`/appointments/${id}/status`, `"${newStatus}"`, {
        headers: { 'Content-Type': 'application/json' }
      });
      fetchCases();
    } catch (err) {
      console.error('[DOCTOR] Status update failed', err);
    }
  };

  // --- DERIVED DATA ---
  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      const matchesSearch = c.patientName.toLowerCase().includes(search.toLowerCase()) || c.id.toLowerCase().includes(search.toLowerCase());
      const matchesModality = modalityFilter === 'ALL' || c.modality === modalityFilter;
      
      const status = c.status?.toLowerCase();
      if (view === 'QUEUE') {
        return matchesSearch && matchesModality && (c.isToday || ['scanned', 'reporting'].includes(status)) && ['scheduled', 'confirmed', 'in_progress', 'scanned', 'reporting', 'booked'].includes(status);
      } else {
        return matchesSearch && matchesModality && (status === 'reported' || !c.isToday);
      }
    });
  }, [cases, search, modalityFilter, view, TODAY]);

  const stats = {
    pendingReports: cases.filter(c => ['scanned', 'reporting'].includes(c.status?.toLowerCase())).length,
    drafts: cases.filter(c => c.status?.toLowerCase() === 'reporting').length,
    finalizedToday: cases.filter(c => c.status?.toLowerCase() === 'reported' && c.isToday).length,
    upcoming: cases.filter(c => c.isToday && ['scheduled', 'confirmed', 'in_progress', 'booked'].includes(c.status?.toLowerCase())).length
  };

  // --- HANDLERS ---
  const handleOpenWorkspace = (c) => {
    setActiveCase(c);
    setView('WORKSPACE');
    if (c.status?.toLowerCase() !== 'reporting') {
      handleStatusUpdate(c.appointmentId, 'reporting');
    }
    setReport({ 
      history: c.notes || '', 
      findings: '', 
      impression: '', 
      advice: '', 
      technique: `${c.modality} Standard Protocol` 
    });
  };

  const handleApplyTemplate = (type) => {
    const template = TEMPLATES[type];
    if (template) {
      setReport(prev => ({ ...prev, findings: template.findings, impression: template.impression }));
    }
  };

  const handleFinalize = () => {
    if (!report.findings || !report.impression) {
      alert('REQUIRED: Findings and Impression are mandatory for clinical finalization.');
      return;
    }
    setIsFinalizing(true);
  };

  const confirmFinalize = async () => {
    await handleStatusUpdate(activeCase.appointmentId, 'reported');
    setIsFinalizing(false);
    setView('QUEUE');
  };

  const renderPrintModal = () => {
    if (!printModalData) return null;
    return (
      <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.98)', zIndex: 10000 }}>
         <div style={{ width: '900px', height: '94vh', background: 'white', borderRadius: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '20px 40px', background: '#0a1628', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div>
                  <h3 style={{ fontSize: '12px', fontWeight: 950, letterSpacing: '2px', margin: 0 }}>OFFICIAL DIAGNOSTIC DISPATCH</h3>
               </div>
               <div style={{ display: 'flex', gap: '15px' }}>
                  <button className="gamified-btn" style={{ padding: '10px 30px' }} onClick={() => window.print()}>PRINT REPORT</button>
                  <button onClick={() => setPrintModalData(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer' }}>CLOSE</button>
               </div>
            </div>
            <div style={{ flex: 1, padding: '50px', background: '#f1f5f9', display: 'flex', justifyContent: 'center', overflowY: 'auto' }}>
               <div id="printable-report" style={{ width: '210mm', minHeight: '297mm', background: 'white', padding: '25mm', color: '#1e293b', boxShadow: '0 0 50px rgba(0,0,0,0.1)' }}>
                   <div style={{ borderBottom: '4px solid #0f52ba', paddingBottom: '25px', marginBottom: '35px', display: 'flex', justifyContent: 'space-between' }}>
                      <h1 style={{ fontWeight: 950, color: '#0f52ba' }}>1RAD REPORT</h1>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>DISPATCH_ID</div>
                        <div style={{ fontSize: '16px', fontWeight: 900 }}>{printModalData.id}</div>
                      </div>
                   </div>
                   <div style={{ marginBottom: '40px' }}>
                     <div style={{ fontSize: '20px', fontWeight: 950 }}>{printModalData.patientName.toUpperCase()}</div>
                     <div style={{ fontSize: '14px', color: '#64748b' }}>MODALITY: {printModalData.modality} | STUDY: {printModalData.service}</div>
                   </div>
                   <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8' }}>
                      <h3>FINDINGS</h3>
                      <p>{report.findings || 'No findings reported.'}</p>
                      <h3>IMPRESSION</h3>
                      <p style={{ fontWeight: 900 }}>{report.impression || 'NORMAL STUDY.'}</p>
                   </div>
               </div>
            </div>
         </div>
         <style>{`@media print { body * { visibility: hidden; } #printable-report, #printable-report * { visibility: visible; } #printable-report { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
      </div>
    );
  };

  const renderQueue = () => (
    <div className="board-view-container" style={{ background: '#fcfdfe', minHeight: '100vh' }}>
      <div className="board-header" style={{ padding: '40px', background: 'white', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px' }}>
        <div>
           <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '5px' }}>
              <span style={{ fontSize: '28px' }}>🦸‍♂️</span>
              <h1 style={{ fontSize: '26px', fontWeight: 950, color: '#1a1a2e', letterSpacing: '-1px', margin: 0 }}>SPECIALIST REPORTING COMMAND</h1>
           </div>
           <p style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, marginLeft: '45px', textTransform: 'uppercase', letterSpacing: '2px' }}>Diagnostic Intelligence Worklist & Archive Registry</p>
        </div>
        
        <div className="admin-tabs" style={{ 
          background: 'rgba(15, 82, 186, 0.03)', 
          backdropFilter: 'blur(10px)',
          padding: '6px', 
          borderRadius: '16px', 
          border: '1px solid rgba(15, 82, 186, 0.1)', 
          display: 'flex',
          gap: '10px'
        }}>
            <button onClick={() => setView('QUEUE')} style={{ 
              padding: '12px 25px', borderRadius: '12px', border: 'none', fontSize: '10px', 
              fontWeight: 950, background: view === 'QUEUE' ? 'white' : 'transparent', 
              color: view === 'QUEUE' ? '#0f52ba' : '#64748b', cursor: 'pointer', 
              transition: '0.2s', letterSpacing: '1px', textTransform: 'uppercase',
              boxShadow: view === 'QUEUE' ? '0 8px 20px rgba(15, 82, 186, 0.15)' : 'none'
            }}>Active Worklist</button>
            <button onClick={() => setView('HISTORY')} style={{ 
              padding: '12px 25px', borderRadius: '12px', border: 'none', fontSize: '10px', 
              fontWeight: 950, background: view === 'HISTORY' ? 'white' : 'transparent', 
              color: view === 'HISTORY' ? '#0f52ba' : '#64748b', cursor: 'pointer', 
              transition: '0.2s', letterSpacing: '1px', textTransform: 'uppercase',
              boxShadow: view === 'HISTORY' ? '0 8px 20px rgba(15, 82, 186, 0.15)' : 'none'
            }}>Clinical Archive</button>
        </div>
      </div>

      <div className="board-padding">
        {view === 'QUEUE' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '40px' }}>
            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '20px' }}>Ready for Report</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                 <span style={{ fontSize: '48px', fontWeight: 950, color: '#ef4444', letterSpacing: '-2px' }}>{stats.pendingReports}</span>
                 <span style={{ fontSize: '14px', fontWeight: 700, color: '#ef4444' }}>CASES</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '20px' }}>In Acquisition</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                 <span style={{ fontSize: '48px', fontWeight: 950, color: '#f59e0b', letterSpacing: '-2px' }}>{stats.upcoming - (stats.upcoming > 0 ? stats.pendingReports : 0)}</span>
                 <span style={{ fontSize: '14px', fontWeight: 700, color: '#f59e0b' }}>PIPELINE</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '20px' }}>Finalized Today</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                 <span style={{ fontSize: '48px', fontWeight: 950, color: '#2ecc71', letterSpacing: '-2px' }}>{stats.finalizedToday}</span>
                 <span style={{ fontSize: '14px', fontWeight: 700, color: '#2ecc71' }}>REPORTS</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '20px' }}>Expected Missions</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                 <span style={{ fontSize: '48px', fontWeight: 950, color: '#0f52ba', letterSpacing: '-2px' }}>{stats.upcoming}</span>
                 <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f52ba' }}>TOTAL</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '30px', display: 'flex', gap: '20px', alignItems: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
            <input type="text" placeholder={view === 'QUEUE' ? "SEARCH ACTIVE WORKLIST..." : "SEARCH CLINICAL ARCHIVE..."} value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', padding: '14px 14px 14px 45px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, outline: 'none' }} />
          </div>
          <select value={modalityFilter} onChange={e => setModalityFilter(e.target.value)} style={{ padding: '14px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 900, background: 'white', outline: 'none' }}>
            <option value="ALL">ALL MODALITIES</option>
            {Object.keys(MODALITY_ICONS).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="gamified-btn" onClick={fetchCases} style={{ padding: '14px 30px', borderRadius: '12px' }}>RE-SYNC HUB</button>
        </div>

        <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>SUBJECT</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>MISSION PROFILE</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>ACQUISITION</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>STATUS</th>
                <th style={{ padding: '20px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>EXECUTE</th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.map(c => {
                const status = c.status?.toLowerCase();
                const isReady = ['scanned', 'reporting'].includes(status);
                const isActive = ['scheduled', 'confirmed', 'in_progress', 'scanned', 'reporting', 'booked'].includes(status) && c.isToday;
                const isScanning = ['confirmed', 'in_progress'].includes(status);
                const isExpected = ['scheduled', 'booked'].includes(status) && c.isToday;
                
                return (
                  <tr key={c.appointmentId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '20px' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '14px', background: '#f8fafc', color: '#0f52ba', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '16px', border: '1px solid #e2e8f0' }}>{c.patientName.charAt(0)}</div>
                          <div>
                             <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '14px' }}>{c.patientName.toUpperCase()}</div>
                             <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>{c.id} | {c.patientGender || 'M'} | {c.patientAge || '45'}Y</div>
                          </div>
                       </div>
                    </td>
                    <td style={{ padding: '20px' }}>
                       <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#1a1a2e' }}>{c.service}</span>
                          <span style={{ fontSize: '9px', fontWeight: 950, color: c.priority === 'STAT' ? '#ef4444' : '#64748b', background: c.priority === 'STAT' ? '#fee2e2' : '#f1f5f9', padding: '2px 8px', borderRadius: '6px', alignSelf: 'flex-start', marginTop: '4px' }}>
                            {c.priority === 'STAT' ? '⚡ EMERGENCY' : '📋 ROUTINE'}
                          </span>
                       </div>
                    </td>
                    <td style={{ padding: '20px' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '20px' }}>{MODALITY_ICONS[c.modality] || '📑'}</span>
                          <span style={{ fontSize: '10px', fontWeight: 950, color: isReady ? '#27ae60' : '#94a3b8' }}>{isReady ? 'ASSETS LOADED' : 'PIPELINE ACTIVE'}</span>
                       </div>
                    </td>
                    <td style={{ padding: '20px' }}>
                      <span style={{ 
                        padding: '6px 12px', borderRadius: '10px', fontSize: '9px', fontWeight: 950,
                        background: isReady ? '#e9f7ef' : isScanning ? '#fef3c7' : isExpected ? '#f0f7ff' : '#f8fafc',
                        color: isReady ? '#27ae60' : isScanning ? '#d97706' : isExpected ? '#0f52ba' : '#64748b',
                        border: `1px solid ${isReady ? '#c3e6cb' : isScanning ? '#fcd34d' : isExpected ? '#dbeafe' : '#e2e8f0'}`,
                        textTransform: 'uppercase'
                      }}>{status === 'scanned' ? '📡 READY' : status === 'confirmed' ? '⚡ ARRIVED' : status === 'in_progress' ? '🌀 SCANNING' : status === 'scheduled' ? '📅 EXPECTED' : status.toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '20px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        {view === 'HISTORY' && <button className="icon-btn" onClick={() => setPrintModalData(c)}>🖨️</button>}
                        <button 
                          className="gamified-btn" 
                          disabled={!isActive && view !== 'HISTORY'}
                          style={{ padding: '10px 20px', fontSize: '11px', borderRadius: '12px', opacity: (isActive || view === 'HISTORY') ? 1 : 0.4, cursor: (isActive || view === 'HISTORY') ? 'pointer' : 'not-allowed' }} 
                          onClick={() => handleOpenWorkspace(c)}
                        >
                          {isReady ? 'EXECUTE REPORTER' : 'PRE-TRIAGE REPORT'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredCases.length === 0 && !loading && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '100px', color: '#94a3b8', fontStyle: 'italic', fontSize: '14px' }}>
                    [ NO DIAGNOSTIC MISSIONS IN THIS FREQUENCY ]
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderWorkspace = () => (
    <div style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
       <div style={{ padding: '15px 40px', background: '#0a1628', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '25px' }}>
             <button onClick={() => setView('QUEUE')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px 20px', borderRadius: '10px', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}>← EXIT BOARD</button>
             <div>
                <div style={{ fontSize: '18px', fontWeight: 950 }}>{activeCase.patientName.toUpperCase()}</div>
                <div style={{ fontSize: '10px', color: '#00f2fe', fontWeight: 900, letterSpacing: '1px' }}>DIAGNOSTIC TARGET: {activeCase.modality} // {activeCase.service}</div>
              </div>
          </div>
          <div style={{ display: 'flex', gap: '15px' }}>
             <button 
                onClick={handleFinalize}
                style={{ background: '#2ecc71', color: 'white', border: 'none', borderRadius: '10px', padding: '12px 30px', fontWeight: 950, fontSize: '12px', cursor: 'pointer', boxShadow: '0 10px 20px rgba(46, 204, 113, 0.2)' }}
             >DEPLOY FINAL DISPATCH</button>
          </div>
       </div>

       <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, background: '#000', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1rem solid #111' }}>
             <div style={{ position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)', width: '500px', background: 'rgba(0,0,0,0.8)', padding: '15px 30px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '30px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                   <button style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#222', color: 'white', border: 'none' }}>🔍</button>
                </div>
                <input type="range" style={{ flex: 1, accentColor: '#00f2fe' }} min="1" max="50" value={currentSlice} onChange={e => setCurrentSlice(e.target.value)} />
                <div style={{ fontSize: '10px', fontWeight: 950, color: '#00f2fe' }}>HD</div>
             </div>
             <div style={{ color: 'white', opacity: 0.1 }}>
                <div style={{ fontSize: '200px' }}>{MODALITY_ICONS[activeCase.modality] || '🖥️'}</div>
             </div>
          </div>

          <div style={{ width: '550px', background: 'white', padding: '40px', display: 'flex', flexDirection: 'column', gap: '30px', overflowY: 'auto' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '15px', display: 'block' }}>Clinical Loadouts</label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                   {Object.keys(TEMPLATES).map(name => (
                      <button key={name} onClick={() => handleApplyTemplate(name)} style={{ padding: '8px 15px', borderRadius: '20px', border: '1px solid #e2e8f0', background: 'white', fontSize: '10px', fontWeight: 900, color: '#0f52ba', cursor: 'pointer' }}>⚡ {name}</button>
                   ))}
                </div>
              </div>

              <div className="report-bubble" style={{ background: '#f8fafc', padding: '25px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                 <label style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', textTransform: 'uppercase', display: 'block', marginBottom: '15px' }}>Clinical Observations</label>
                 <textarea 
                    value={report.findings}
                    onChange={e => setReport(prev => ({ ...prev, findings: e.target.value }))}
                    placeholder="Document anatomical findings..."
                    style={{ width: '100%', minHeight: '150px', background: 'transparent', border: 'none', fontSize: '14px', lineHeight: '1.6', outline: 'none', resize: 'none' }}
                 />
              </div>

              <div className="report-bubble" style={{ background: '#f0f4ff', padding: '25px', borderRadius: '18px', border: '2px solid #0f52ba10' }}>
                 <label style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', textTransform: 'uppercase', display: 'block', marginBottom: '15px' }}>Diagnostic Impression</label>
                 <textarea 
                    value={report.impression}
                    onChange={e => setReport(prev => ({ ...prev, impression: e.target.value }))}
                    placeholder="Enter final clinical conclusion..."
                    style={{ width: '100%', minHeight: '100px', background: 'transparent', border: 'none', fontSize: '14px', fontWeight: 900, color: '#1a1a2e', lineHeight: '1.6', outline: 'none', resize: 'none' }}
                 />
              </div>
          </div>
       </div>

       {isFinalizing && (
          <div className="modal-overlay" style={{ background: 'rgba(10, 22, 40, 0.9)', zIndex: 1000 }}>
             <div style={{ width: '500px', background: 'white', borderRadius: '24px', padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '20px' }}>📜</div>
                <h2 style={{ fontSize: '22px', fontWeight: 950, color: '#1a1a2e', marginBottom: '10px' }}>Finalize Clinical Dispatch?</h2>
                <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '30px' }}>This action will authorize the final diagnostic report and notify the patient. This action cannot be undone.</p>
                <div style={{ display: 'flex', gap: '15px' }}>
                   <button onClick={() => setIsFinalizing(false)} style={{ flex: 1, padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 900, cursor: 'pointer' }}>WAIT, RE-CHECK</button>
                   <button onClick={confirmFinalize} style={{ flex: 1, padding: '15px', borderRadius: '12px', border: 'none', background: '#2ecc71', color: 'white', fontWeight: 950, cursor: 'pointer', boxShadow: '0 10px 20px rgba(46, 204, 113, 0.2)' }}>AUTHORIZE & SEND</button>
                </div>
             </div>
          </div>
       )}
    </div>
  );

  return (
    <div className="page-wrapper" style={{ padding: 0, background: '#fcfdfe' }}>
      {view === 'WORKSPACE' ? renderWorkspace() : renderQueue()}
      {renderPrintModal()}
      <style>{`
        .gamified-btn { background: #0f52ba; color: white; border: none; font-weight: 950; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 15px rgba(15, 82, 186, 0.2); }
        .gamified-btn:hover { background: #0d44a0; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(15, 82, 186, 0.3); }
        .gamified-btn:disabled { background: #94a3b8 !important; cursor: not-allowed; box-shadow: none !important; transform: none !important; }
        .icon-btn { width: 40px; height: 40px; border-radius: 12px; border: 1px solid #e2e8f0; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .icon-btn:hover { background: #f8fafc; border-color: #0f52ba; }
        .report-bubble { transition: all 0.3s; }
        .report-bubble:focus-within { border-color: #0f52ba !important; box-shadow: 0 10px 30px rgba(15, 82, 186, 0.05); }
      `}</style>
    </div>
  );
}
