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

const PRIORITY_META = {
  'STAT': { color: '#ef4444', label: '⚡ EMERGENCY', bg: '#fee2e2' },
  'URGENT': { color: '#f59e0b', label: '⚠️ URGENT', bg: '#fef3c7' },
  'ROUTINE': { color: '#3b82f6', label: '📋 ROUTINE', bg: '#dbeafe' }
};

export default function TechnicianPage() {
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentView, setCurrentView] = useState('QUEUE'); // 'QUEUE' or 'WORKSPACE'
  const [hubTab, setHubTab] = useState('ACTIVE'); // 'ACTIVE' or 'ARCHIVE'
  const [activeStudy, setActiveStudy] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ modality: 'ALL' });
  
  // Workspace specific states
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [techNotes, setTechNotes] = useState('');
  const [currentSlice, setCurrentSlice] = useState(1);
  const [printModalData, setPrintModalData] = useState(null);

  const TODAY = new Date().toISOString().split('T')[0];

  // --- API SYNC ---
  const fetchWorklist = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch today's missions for the main bay, and past missions if in archive
      const res = await apiClient.get('/appointments');
      const worklist = res.data.map(a => ({
        ...a,
        id: a.displayId,
        priority: a.type === 'EMERGENCY' ? 'STAT' : 'ROUTINE',
        isToday: (a.date || (a.dateTime ? a.dateTime.split('T')[0] : null)) === TODAY
      }));
      setStudies(worklist);
    } catch (err) {
      console.error('[TECH] Worklist fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [TODAY]);

  useEffect(() => {
    fetchWorklist();
    const interval = setInterval(fetchWorklist, 30000); 
    return () => clearInterval(interval);
  }, [fetchWorklist]);

  const handleStatusUpdate = async (id, newStatus) => {
    try {
      await apiClient.patch(`/appointments/${id}/status`, `"${newStatus}"`, {
        headers: { 'Content-Type': 'application/json' }
      });
      fetchWorklist();
    } catch (err) {
      console.error('[TECH] Status transition failed', err);
      alert('SYSTEM ERROR: Failed to update clinical status.');
    }
  };

  // --- DERIVED DATA ---
  const filteredStudies = useMemo(() => {
    return studies.filter(s => {
      const matchesSearch = s.patientName.toLowerCase().includes(searchQuery.toLowerCase()) || s.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesModality = filters.modality === 'ALL' || s.modality === filters.modality;
      
      const status = s.status?.toLowerCase();
      if (hubTab === 'ACTIVE') {
        // Today's work: Scheduled, Confirmed, In Progress
        return matchesSearch && matchesModality && s.isToday && ['scheduled', 'confirmed', 'in_progress', 'booked'].includes(status);
      } else {
        // Archive: Scanned, Reported, or past appointments
        return matchesSearch && matchesModality && (['scanned', 'reported', 'completed'].includes(status) || !s.isToday);
      }
    });
  }, [studies, searchQuery, filters, hubTab, TODAY]);

  const stats = {
    total: studies.filter(s => s.isToday && ['scheduled', 'confirmed', 'in_progress', 'booked'].includes(s.status?.toLowerCase())).length,
    inProgress: studies.filter(s => s.status?.toLowerCase() === 'in_progress').length,
    pending: studies.filter(s => s.status?.toLowerCase() === 'confirmed').length,
    expected: studies.filter(s => s.isToday && ['scheduled', 'booked'].includes(s.status?.toLowerCase())).length
  };

  // --- HANDLERS ---
  const handleOpenWorkspace = (study) => {
    setActiveStudy(study);
    setCurrentView('WORKSPACE');
    setUploadedFiles([]);
    setTechNotes(study.notes || '');
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedFiles(prev => [...prev, {
        name: file.name,
        type: file.type || 'DICOM',
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
        time: new Date().toLocaleTimeString(),
        previewUrl: URL.createObjectURL(file)
      }]);
    }
  };

  // --- RENDER VIEWS ---
  const renderPrintModal = () => {
    if (!printModalData) return null;
    return (
      <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.98)', zIndex: 10000 }}>
         <div style={{ width: '900px', height: '94vh', background: 'white', borderRadius: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '20px 40px', background: '#0a1628', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div>
                  <h3 style={{ fontSize: '12px', fontWeight: 950, letterSpacing: '2px', margin: 0 }}>CLINICAL DISPATCH PREVIEW</h3>
                  <p style={{ fontSize: '9px', opacity: 0.6, margin: '4px 0 0' }}>VERIFIED MISSION DATA | DISPATCH_READY</p>
               </div>
               <div style={{ display: 'flex', gap: '15px' }}>
                  <button className="gamified-btn" style={{ padding: '10px 30px' }} onClick={() => window.print()}>PRINT MISSION</button>
                  <button onClick={() => setPrintModalData(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer' }}>CLOSE</button>
               </div>
            </div>
            <div style={{ flex: 1, padding: '50px', background: '#f1f5f9', display: 'flex', justifyContent: 'center', overflowY: 'auto' }}>
               <div id="printable-dispatch" style={{ width: '210mm', minHeight: '297mm', background: 'white', padding: '25mm', color: '#1e293b', boxShadow: '0 0 50px rgba(0,0,0,0.1)' }}>
                  <div style={{ borderBottom: '4px solid #0f52ba', paddingBottom: '25px', marginBottom: '35px', display: 'flex', justifyContent: 'space-between' }}>
                    <h1 style={{ fontWeight: 950, color: '#0f52ba' }}>1RAD DISPATCH</h1>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>MISSION_ID</div>
                        <div style={{ fontSize: '16px', fontWeight: 900 }}>{printModalData.id}</div>
                    </div>
                  </div>
                  <div style={{ marginBottom: '40px' }}>
                    <h3 style={{ fontSize: '12px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', marginBottom: '15px' }}>Subject Identity</h3>
                    <div style={{ fontSize: '20px', fontWeight: 950 }}>{printModalData.patientName.toUpperCase()}</div>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>MODALITY: {printModalData.modality} | SERVICE: {printModalData.service}</div>
                  </div>
               </div>
            </div>
         </div>
         <style>{`@media print { body * { visibility: hidden; } #printable-dispatch, #printable-dispatch * { visibility: visible; } #printable-dispatch { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
      </div>
    );
  };

  const renderQueue = () => (
    <div className="board-view-container" style={{ background: '#fcfdfe', minHeight: '100vh' }}>
      <div className="board-header" style={{ padding: '40px', background: 'white', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px' }}>
        <div>
           <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '5px' }}>
              <span style={{ fontSize: '28px' }}>🛰️</span>
              <h1 style={{ fontSize: '26px', fontWeight: 950, color: '#1a1a2e', letterSpacing: '-1px', margin: 0 }}>SCANNING BAY COMMAND</h1>
           </div>
           <p style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, marginLeft: '45px', textTransform: 'uppercase', letterSpacing: '2px' }}>Clinical Acquisition & Worklist Dispatch</p>
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
            <button onClick={() => setHubTab('ACTIVE')} style={{ 
              padding: '12px 25px', borderRadius: '12px', border: 'none', fontSize: '10px', 
              fontWeight: 950, background: hubTab === 'ACTIVE' ? 'white' : 'transparent', 
              color: hubTab === 'ACTIVE' ? '#0f52ba' : '#64748b', cursor: 'pointer', 
              transition: '0.2s', letterSpacing: '1px', textTransform: 'uppercase',
              boxShadow: hubTab === 'ACTIVE' ? '0 8px 20px rgba(15, 82, 186, 0.15)' : 'none'
            }}>Active Queue</button>
            <button onClick={() => setHubTab('ARCHIVE')} style={{ 
              padding: '12px 25px', borderRadius: '12px', border: 'none', fontSize: '10px', 
              fontWeight: 950, background: hubTab === 'ARCHIVE' ? 'white' : 'transparent', 
              color: hubTab === 'ARCHIVE' ? '#0f52ba' : '#64748b', cursor: 'pointer', 
              transition: '0.2s', letterSpacing: '1px', textTransform: 'uppercase',
              boxShadow: hubTab === 'ARCHIVE' ? '0 8px 20px rgba(15, 82, 186, 0.15)' : 'none'
            }}>Clinical Archive</button>
        </div>
      </div>

      <div className="board-padding">
        {hubTab === 'ACTIVE' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '40px' }}>
            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '20px' }}>Daily Flux</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                 <span style={{ fontSize: '48px', fontWeight: 950, color: '#1e293b', letterSpacing: '-2px' }}>{stats.total}</span>
                 <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f52ba' }}>UNITS</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '20px' }}>Acquisition Active</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                 <span style={{ fontSize: '48px', fontWeight: 950, color: '#f59e0b', letterSpacing: '-2px' }}>{stats.inProgress}</span>
                 <span style={{ fontSize: '14px', fontWeight: 700, color: '#f59e0b' }}>SCANNING</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '20px' }}>Arrival Confirmed</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                 <span style={{ fontSize: '48px', fontWeight: 950, color: '#2ecc71', letterSpacing: '-2px' }}>{stats.pending}</span>
                 <span style={{ fontSize: '14px', fontWeight: 700, color: '#2ecc71' }}>READY</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '20px' }}>Mission Expected</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                 <span style={{ fontSize: '48px', fontWeight: 950, color: '#0f52ba', letterSpacing: '-2px' }}>{stats.expected}</span>
                 <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f52ba' }}>PENDING</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '30px', display: 'flex', gap: '20px', alignItems: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
            <input 
              type="text" 
              placeholder={hubTab === 'ACTIVE' ? "SEARCH TODAY'S MISSIONS..." : "SEARCH HISTORICAL ARCHIVE..."}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '14px 14px 14px 45px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, outline: 'none' }}
            />
          </div>
          <select value={filters.modality} onChange={e => setFilters({...filters, modality: e.target.value})} style={{ padding: '14px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 900, background: 'white', outline: 'none' }}>
            <option value="ALL">ALL MODALITIES</option>
            {Object.keys(MODALITY_ICONS).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="gamified-btn" onClick={fetchWorklist} style={{ padding: '14px 30px', borderRadius: '12px' }}>RE-SYNC HUD</button>
        </div>

        <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>SUBJECT</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>MISSION TARGET</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>MODALITY</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>STATUS</th>
                <th style={{ padding: '20px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>{hubTab === 'ACTIVE' ? 'WORKSPACE' : 'ACTIONS'}</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudies.map(study => {
                const priority = PRIORITY_META[study.priority] || PRIORITY_META.ROUTINE;
                const status = study.status?.toLowerCase();
                const isArrived = ['confirmed', 'in_progress'].includes(status);
                const isExpected = ['scheduled', 'booked'].includes(status) && study.isToday;
                
                return (
                  <tr key={study.appointmentId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '20px' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '14px', background: '#f8fafc', color: '#0f52ba', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '16px', border: '1px solid #e2e8f0' }}>
                             {study.patientName.charAt(0)}
                          </div>
                          <div>
                             <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '14px' }}>{study.patientName.toUpperCase()}</div>
                             <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>{study.id} | {study.patientGender} | {study.patientAge}Y</div>
                          </div>
                       </div>
                    </td>
                    <td style={{ padding: '20px' }}>
                       <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>{study.service}</span>
                          <span style={{ fontSize: '9px', fontWeight: 950, color: priority.color, background: priority.bg, padding: '2px 8px', borderRadius: '6px', alignSelf: 'flex-start', marginTop: '4px' }}>
                             {priority.label}
                          </span>
                       </div>
                    </td>
                    <td style={{ padding: '20px' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '20px' }}>{MODALITY_ICONS[study.modality] || '📑'}</span>
                          <span style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>{study.modality}</span>
                       </div>
                    </td>
                    <td style={{ padding: '20px' }}>
                      <span style={{ 
                        padding: '6px 12px', borderRadius: '10px', fontSize: '10px', fontWeight: 950,
                        background: isArrived ? '#e9f7ef' : isExpected ? '#f0f7ff' : '#f8fafc',
                        color: isArrived ? '#27ae60' : isExpected ? '#0f52ba' : '#64748b',
                        border: `1px solid ${isArrived ? '#c3e6cb' : isExpected ? '#dbeafe' : '#e2e8f0'}`,
                        textTransform: 'uppercase'
                      }}>
                        {status === 'confirmed' ? '📡 ARRIVED' : status === 'in_progress' ? '⚡ SCANNING' : status === 'scheduled' ? '📅 EXPECTED' : status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '20px', textAlign: 'right' }}>
                      {hubTab === 'ACTIVE' ? (
                        <button 
                          className="gamified-btn" 
                          disabled={!isArrived}
                          style={{ padding: '10px 20px', borderRadius: '12px', fontSize: '11px', opacity: isArrived ? 1 : 0.4, cursor: isArrived ? 'pointer' : 'not-allowed' }} 
                          onClick={() => handleOpenWorkspace(study)}
                        >
                          ENTER WORKSPACE
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                          <button 
                            onClick={() => setPrintModalData(study)}
                            style={{ padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}
                          >🖨️</button>
                          <button 
                            className="gamified-btn" 
                            style={{ padding: '10px 20px', borderRadius: '12px', fontSize: '11px' }} 
                            onClick={() => handleOpenWorkspace(study)}
                          >
                            REVIEW DATA
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredStudies.length === 0 && !loading && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '100px', color: '#94a3b8', fontStyle: 'italic', fontSize: '14px' }}>
                    [ NO MISSIONS DETECTED IN THIS FREQUENCY ]
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
    <div style={{ height: 'calc(100vh - 60px)', background: '#050a14', color: 'white', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 40px', background: '#0a1628', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button 
            style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '10px', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }} 
            onClick={() => setCurrentView('QUEUE')}
          >
            ← ABORT TO COMMAND
          </button>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 950, letterSpacing: '-0.5px' }}>{activeStudy.patientName.toUpperCase()} <span style={{ fontWeight: 400, opacity: 0.5, marginLeft: '10px' }}>ID: {activeStudy.id}</span></div>
            <div style={{ fontSize: '10px', color: '#00f2fe', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>ACQUISITION_TARGET: {activeStudy.modality} // {activeStudy.service}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.4)' }}>SESSION_LATENCY</div>
              <div style={{ fontSize: '14px', fontWeight: 900, color: '#f59e0b' }}>04:12m</div>
            </div>
            <button 
                onClick={() => { handleStatusUpdate(activeStudy.appointmentId, 'scanned'); setCurrentView('QUEUE'); }}
                style={{ background: '#00f2fe', color: '#050a14', border: 'none', borderRadius: '12px', padding: '12px 30px', fontWeight: 950, fontSize: '12px', cursor: 'pointer', boxShadow: '0 0 20px rgba(0,242,254,0.3)' }}
            >
                DEPLOY ASSETS TO SPECIALIST
            </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, position: 'relative', background: 'radial-gradient(circle, #0a1628 0%, #000 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', top: '30px', left: '30px', background: 'rgba(0,0,0,0.5)', padding: '15px', borderRadius: '10px', borderLeft: '3px solid #00f2fe', fontSize: '10px', fontWeight: 800 }}>
             SLICE_VOL: {currentSlice} / 25<br/>
             RESOLUTION: 4096 x 4096<br/>
             FIDELITY: HI-RES [DICOM]
          </div>
          
          <div style={{ textAlign: 'center' }}>
              {uploadedFiles.length > 0 && uploadedFiles[0].previewUrl ? (
                  <img src={uploadedFiles[0].previewUrl} style={{ maxHeight: '75vh', maxWidth: '100%', filter: 'contrast(1.2) brightness(0.9) grayscale(1)' }} alt="Preview" />
              ) : (
                  <>
                    <div style={{ fontSize: '120px', opacity: 0.1 }}>{MODALITY_ICONS[activeStudy.modality] || '🖥️'}</div>
                    <p style={{ fontSize: '11px', color: '#00f2fe', fontWeight: 950, letterSpacing: '4px', marginTop: '20px' }}>[ AWAITING ACQUISITION INTEL ]</p>
                  </>
              )}
          </div>

          <div style={{ position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)', width: '600px', background: 'rgba(10,22,40,0.8)', backdropFilter: 'blur(10px)', padding: '15px 30px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#050a14', color: 'white', border: '1px solid #1a1a1a', cursor: 'pointer' }}>🔍</button>
                    <button style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#050a14', color: 'white', border: '1px solid #1a1a1a', cursor: 'pointer' }}>🌓</button>
                </div>
                <input type="range" style={{ flex: 1, accentColor: '#00f2fe' }} min="1" max="25" value={currentSlice} onChange={e => setCurrentSlice(e.target.value)} />
                <div style={{ fontSize: '10px', fontWeight: 950, color: '#00f2fe' }}>2D / 3D</div>
             </div>
          </div>
        </div>

        <div style={{ width: '400px', background: 'rgba(10,22,40,0.5)', borderLeft: '1px solid rgba(255,255,255,0.05)', padding: '30px', display: 'flex', flexDirection: 'column', gap: '25px' }}>
            <div>
                <label style={{ fontSize: '9px', fontWeight: 950, color: '#00f2fe', letterSpacing: '1px', display: 'block', marginBottom: '15px' }}>ACQUISITION_UPLOAD</label>
                <div 
                    onClick={() => document.getElementById('tech-study-up').click()}
                    style={{ border: '2px dashed rgba(0,242,254,0.3)', borderRadius: '15px', padding: '30px', textAlign: 'center', cursor: 'pointer', background: 'rgba(0,242,254,0.02)' }}
                >
                    <div style={{ fontSize: '32px' }}>☁️</div>
                    <div style={{ fontSize: '12px', fontWeight: 950, marginTop: '10px' }}>UPLOAD CLINICAL ASSETS</div>
                    <input id="tech-study-up" type="file" style={{ display: 'none' }} accept="image/*,.dcm" onChange={handleFileChange} />
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <label style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', display: 'block', marginBottom: '15px' }}>LOADED_ASSETS ({uploadedFiles.length})</label>
                {uploadedFiles.map((f, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '10px', marginBottom: '10px', borderLeft: '3px solid #00f2fe' }}>
                        <div style={{ fontSize: '11px', fontWeight: 900 }}>{f.name.toUpperCase()}</div>
                        <div style={{ fontSize: '9px', opacity: 0.5, marginTop: '4px' }}>{f.type} | {f.size} | {f.time}</div>
                    </div>
                ))}
            </div>

            <div>
                <label style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', display: 'block', marginBottom: '15px' }}>FIELD_INTEL / OBSERVATIONS</label>
                <textarea 
                    value={techNotes}
                    onChange={e => setTechNotes(e.target.value)}
                    placeholder="Enter technician observations for the reporting doctor..."
                    style={{ width: '100%', height: '150px', background: '#050a14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '15px', color: 'white', fontSize: '12px', resize: 'none', outline: 'none' }}
                />
            </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-wrapper" style={{ padding: 0, background: currentView === 'QUEUE' ? '#fcfdfe' : '#050a14' }}>
      {currentView === 'QUEUE' ? renderQueue() : renderWorkspace()}
      {renderPrintModal()}
      <style>{`
        .gamified-btn {
          background: #0f52ba;
          color: white;
          border: none;
          font-weight: 950;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 15px rgba(15, 82, 186, 0.2);
        }
        .gamified-btn:hover {
          background: #0d44a0;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(15, 82, 186, 0.3);
        }
        .gamified-btn:disabled {
          background: #94a3b8;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }
      `}</style>
    </div>
  );
}
