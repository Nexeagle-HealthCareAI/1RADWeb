import { useState, useMemo } from 'react';
import '../styles/global.css';

// --- HELPERS ---
const TODAY = new Date().toISOString().split('T')[0];
const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

const MODALITY_ICONS = {
  'X-RAY': '🩻',
  'MRI': '🧠',
  'CT': '🌀',
  'ULTRASOUND': '🤰'
};

// --- MOCK DATA ---
const INITIAL_CASES = [
  { id: 'SID-203', patientName: 'Michael Ross', patientId: 'P012', age: 41, gender: 'Male', studyType: 'Abdomen CT (VNC)', modality: 'CT', tech: 'Tech John', techNotes: 'Metastatic calcification in series 3. No contrast reactions.', uploadedFiles: 14, status: 'READY_FOR_REVIEW', waitingTime: '25m', priority: 'URGENT', date: TODAY, referredBy: 'Dr. James Wilson', referredContact: '+91 98765 43210', referredAddress: 'Wilson Clinic, Sector 12, Delhi' },
  { id: 'SID-202', patientName: 'Emily Chen', patientId: 'P009', age: 28, gender: 'Female', studyType: 'Brain MRI (T2 FLAIR)', modality: 'MRI', tech: 'Tech Sarah', techNotes: 'Movement artifacts in series 2. Repetition needed for axial T2.', uploadedFiles: 98, status: 'DRAFT', waitingTime: '1h 10m', priority: 'ROUTINE', date: TODAY, referredBy: 'Dr. Sarah Smith', referredContact: '+91 87654 32109', referredAddress: 'City Hospital, Building A, Mumbai' },
  { id: 'SID-201', patientName: 'Robert Fox', patientId: 'P005', age: 52, gender: 'Male', studyType: 'Chest X-Ray PA', modality: 'X-RAY', tech: 'Tech John', techNotes: 'Standard PA view. Quality verified.', uploadedFiles: 2, status: 'FINAL_REPORTED', waitingTime: '-', priority: 'ROUTINE', date: SEVEN_DAYS_AGO, referredBy: 'Dr. John Doe', referredContact: '+91 76543 21098', referredAddress: 'Health Care Center, Pune' },
  { id: 'SID-198', patientName: 'Sarah Jenkins', patientId: 'P034', age: 22, gender: 'Female', studyType: 'Wrist X-Ray (Lateral)', modality: 'X-RAY', tech: 'Tech John', techNotes: 'Fracture Dislocation (Trauma).', uploadedFiles: 4, status: 'FINAL_REPORTED', waitingTime: '-', priority: 'STAT', date: SEVEN_DAYS_AGO, referredBy: 'Dr. Emma Watson', referredContact: '+91 65432 10987', referredAddress: 'Trauma Care, Bangalore' },
  { id: 'SID-204', patientName: 'Janet Taylor', patientId: 'P015', age: 64, gender: 'Female', studyType: 'Pelvis Ultrasound', modality: 'ULTRASOUND', tech: 'Tech Lisa', techNotes: 'Normal scan.', uploadedFiles: 1, status: 'READY_FOR_REVIEW', waitingTime: '5m', priority: 'ROUTINE', date: TODAY, referredBy: 'Dr. Richard Roe', referredContact: '+91 54321 09876', referredAddress: 'Sunrise Polyclinic, Chennai' }
];

const TEMPLATES = {
  'Normal Chest': {
    findings: 'The heart and mediastinal silhouettes are normal. The lungs are clear. There is no pleural effusion or pneumothorax.',
    impression: 'Normal Chest X-ray.'
  },
  'Normal Brain': {
    findings: 'Brain parenchyma shows normal signal intensity. No space-occupying lesions. Ventricular system is normal.',
    impression: 'No acute intracranial pathology.'
  },
  'Normal Abdomen': {
    findings: 'Liver, spleen, and kidneys appear normal. No free air or fluid in the peritoneal cavity.',
    impression: 'No acute abdominal pathology detected.'
  }
};

export default function DoctorBoard() {
  const [cases, setCases] = useState(INITIAL_CASES);
  const [view, setView] = useState('QUEUE'); // 'QUEUE', 'WORKSPACE', or 'HISTORY'
  const [activeCase, setActiveCase] = useState(null);
  
  // History Filters
  const [historyStart, setHistoryStart] = useState(SEVEN_DAYS_AGO);
  const [historyEnd, setHistoryEnd] = useState(TODAY);
  
  // Reporting State
  const [report, setReport] = useState({ history: '', findings: '', impression: '', advice: '', technique: '', comparison: '' });
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [activeSeries, setActiveSeries] = useState(0);
  const [currentSlice, setCurrentSlice] = useState(1);
  const [printModalData, setPrintModalData] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [modalityFilter, setModalityFilter] = useState('ALL');

  // --- DERIVED DATA ---
  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      const matchesSearch = c.patientName.toLowerCase().includes(search.toLowerCase()) || c.id.includes(search);
      const matchesModality = modalityFilter === 'ALL' || c.modality === modalityFilter;
      return matchesSearch && matchesModality;
    });
  }, [cases, search, modalityFilter]);

  const stats = {
    pending: cases.filter(c => c.status === 'READY_FOR_REVIEW').length,
    drafts: cases.filter(c => c.status === 'DRAFT').length,
    finalized: cases.filter(c => c.status === 'FINAL_REPORTED').length,
    urgent: cases.filter(c => (c.priority === 'STAT' || c.priority === 'URGENT') && c.status !== 'FINAL_REPORTED').length
  };

  // --- HANDLERS ---
  const handleOpenWorkspace = (c) => {
    setActiveCase(c);
    setView('WORKSPACE');
    // Load existing report if draft, else reset
    if (c.status === 'DRAFT') {
      setReport({ ...report, findings: 'Preliminary findings started...', impression: 'Pending comparison.' });
    } else {
      setReport({ history: '', findings: '', impression: '', advice: '', technique: '', comparison: '' });
    }
  };

  const handleApplyTemplate = (type) => {
    const template = TEMPLATES[type];
    if (template) {
      setReport(prev => ({ ...prev, findings: template.findings, impression: template.impression }));
    }
  };

  const handleSaveDraft = () => {
    setCases(prev => prev.map(c => c.id === activeCase.id ? { ...c, status: 'DRAFT' } : c));
    alert('Draft Saved Successfully');
  };

  const handleFinalize = () => {
    if (!report.findings || !report.impression) {
      alert('Error: Findings and Impression are mandatory for finalization.');
      return;
    }
    setIsFinalizing(true);
  };

  const confirmFinalize = () => {
    setCases(prev => prev.map(c => c.id === activeCase.id ? { ...c, status: 'FINAL_REPORTED' } : c));
    setIsFinalizing(false);
    setView('QUEUE');
  };

  const renderPrintModal = () => {
    if (!printModalData) return null;
    return (
      <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 3000 }}>
         <div className="print-modal-container" style={{ width: '850px', height: '92vh', background: '#333', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#222', borderBottom: '1px solid #444' }}>
               <h3 style={{ color: '#eee', fontSize: '12px', fontWeight: 900 }}>OFFICIAL RADIOLOGY DISPATCH</h3>
               <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn-primary" style={{ background: '#2ecc71' }} onClick={() => window.print()}>PRINT REPORT</button>
                  <button className="btn-logout" onClick={() => setPrintModalData(null)}>CLOSE</button>
               </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '40px', display: 'flex', justifyContent: 'center' }}>
               <div id="printable-report" style={{ width: '210mm', minHeight: '297mm', background: 'white', padding: '20mm', color: '#333', fontFamily: 'serif', position: 'relative' }}>
                   <div style={{ borderBottom: '2px solid #0f52ba', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <img src="/Logo.png" alt="NexEgale" style={{ height: '30px', width: 'auto' }} />
                      <div>
                        <h1 style={{ color: '#0f52ba', margin: 0, fontSize: '24px' }}>NexEgale 1Rad</h1>
                        <p style={{ fontSize: '10px', color: '#666' }}>Finalized Diagnostic Impression</p>
                      </div>
                   </div>
                  <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '4px', marginBottom: '25px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', border: '1px solid #eee' }}>
                     <div style={{ fontSize: '11px' }}><strong>PATIENT:</strong> {printModalData.patientName}</div>
                     <div style={{ fontSize: '11px' }}><strong>STUDY:</strong> {printModalData.studyType}</div>
                     <div style={{ fontSize: '11px' }}><strong>ID:</strong> {printModalData.patientId}</div>
                     <div style={{ fontSize: '11px' }}><strong>AGE/GENDER:</strong> {printModalData.age}y / {printModalData.gender}</div>
                     <div style={{ fontSize: '11px', gridColumn: 'span 2', borderTop: '1px dashed #ddd', paddingTop: '10px', marginTop: '5px' }}>
                        <strong>REFERRED BY:</strong> {printModalData.referredBy || 'Self / Walk-in'}
                     </div>
                     <div style={{ fontSize: '11px' }}><strong>REF. CONTACT:</strong> {printModalData.referredContact || 'N/A'}</div>
                     <div style={{ fontSize: '11px' }}><strong>REF. ADDRESS:</strong> {printModalData.referredAddress || 'N/A'}</div>
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                     <h3 style={{ fontSize: '14px', borderBottom: '1px solid #eee' }}>DIAGNOSTIC FINDINGS</h3>
                     <p>Imaging demonstrates normal anatomical variants. No acute findings detected in the current study volume. All series reviewed at 100% fidelity.</p>
                     <h3 style={{ fontSize: '14px', borderBottom: '1px solid #eee', marginTop: '20px' }}>IMPRESSION</h3>
                     <p style={{ fontWeight: 700 }}>NORMAL DIAGNOSTIC STUDY.</p>
                  </div>
                  <div style={{ position: 'absolute', bottom: '20mm', right: '20mm', textAlign: 'center' }}>
                     <div style={{ width: '150px', borderTop: '1px solid #333' }}></div>
                     <div style={{ fontSize: '11px', fontWeight: 800, marginTop: '5px' }}>MD, Radiologist</div>
                  </div>
               </div>
            </div>
         </div>
         <style>{`@media print { body * { visibility: hidden; } #printable-report, #printable-report * { visibility: visible; } #printable-report { position: absolute; left: 0; top: 0; } }`}</style>
      </div>
    );
  };

  // --- RENDERERS ---
  const renderQueue = () => (
    <div className="queue-view board-padding" style={{ paddingTop: '80px' }}>
      <div className="board-header" style={{ marginBottom: '35px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h1 className="page-title" style={{ color: '#0f52ba', fontWeight: 900, marginBottom: '5px' }}>DOCTOR REPORTING BOARD</h1>
           <p style={{ fontSize: '12px', color: '#666', fontWeight: 600 }}>DIAGNOSTIC WORKLIST & MISSION CONTROL</p>
        </div>
        <div className="board-actions" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
           <div style={{ display: 'flex', background: 'white', padding: '5px', borderRadius: '12px', border: '1px solid #eee' }}>
              <button 
                onClick={() => setView('QUEUE')}
                style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', fontSize: '11px', fontWeight: 900, background: view === 'QUEUE' ? '#0f52ba' : 'transparent', color: view === 'QUEUE' ? 'white' : '#888', cursor: 'pointer', transition: 'all 0.3s' }}
              >
                ACTIVE WORKLIST
              </button>
              <button 
                onClick={() => setView('HISTORY')}
                style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', fontSize: '11px', fontWeight: 900, background: view === 'HISTORY' ? '#0f52ba' : 'transparent', color: view === 'HISTORY' ? 'white' : '#888', cursor: 'pointer', transition: 'all 0.3s' }}
              >
                ARCHIVE
              </button>
           </div>
        </div>
      </div>

      <div className="summary-grid" style={{ marginBottom: '35px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
        <div className="summary-card" style={{ background: 'white', borderTop: '1px solid #dee2e6', borderRight: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #e74c3c' }}>
          <span className="label" style={{ fontSize: '10px', color: '#888', fontWeight: 900, textTransform: 'uppercase' }}>Pending Review</span>
          <div className="value" style={{ fontSize: '24px', fontWeight: 900, marginTop: '5px', color: '#e74c3c' }}>{stats.pending}</div>
        </div>
        <div className="summary-card" style={{ background: 'white', borderTop: '1px solid #dee2e6', borderRight: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #f1c40f' }}>
          <span className="label" style={{ fontSize: '10px', color: '#888', fontWeight: 900, textTransform: 'uppercase' }}>Draft Reports</span>
          <div className="value" style={{ fontSize: '24px', fontWeight: 900, marginTop: '5px', color: '#f39c12' }}>{stats.drafts}</div>
        </div>
        <div className="summary-card" style={{ background: '#f0fdf4', borderTop: '1px solid #dcfce7', borderRight: '1px solid #dcfce7', borderBottom: '1px solid #dcfce7', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #2ecc71' }}>
          <span className="label" style={{ fontSize: '10px', color: '#2ecc71', fontWeight: 900, textTransform: 'uppercase' }}>Finalized Today</span>
          <div className="value" style={{ fontSize: '24px', fontWeight: 900, marginTop: '5px', color: '#166534' }}>{stats.finalized}</div>
        </div>
        <div className="summary-card" style={{ background: '#fef2f2', borderTop: '1px solid #fee2e2', borderRight: '1px solid #fee2e2', borderBottom: '1px solid #fee2e2', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #ff4757' }}>
          <span className="label" style={{ fontSize: '10px', color: '#ff4757', fontWeight: 900, textTransform: 'uppercase' }}>Urgent Missions</span>
          <div className="value" style={{ fontSize: '24px', fontWeight: 900, marginTop: '5px', color: '#991b1b' }}>{stats.urgent}</div>
        </div>
      </div>

      <div className="filter-bar responsive-control-bar force-stack-mobile" style={{ background: '#f8f9fa', padding: '20px', borderRadius: '12px', border: '1px solid #eee', marginBottom: '30px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', alignItems: 'center' }}>
        <div className="search-input-group" style={{ background: 'white', border: '1px solid #ddd', borderRadius: '8px', padding: '10px 15px' }}>
          <span className="search-icon">🔍</span>
          <input type="text" placeholder="Search Subject ID..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', width: '300px', marginLeft: '10px', fontWeight: 600 }} />
        </div>
        <div className="filter-group">
          <select value={modalityFilter} onChange={e => setModalityFilter(e.target.value)} style={{ background: 'white', border: '1px solid #ddd', padding: '10px 15px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}>
             <option value="ALL">ALL MODALITIES</option>
             <option>X-RAY</option><option>MRI</option><option>CT</option><option>ULTRASOUND</option>
          </select>
        </div>
      </div>

      <div className="table-container" style={{ background: 'white', borderRadius: '15px', border: '1px solid #dee2e6', overflow: 'hidden' }}>
        <table className="data-table">
          <thead style={{ background: '#f8f9fa' }}>
            <tr>
              <th style={{ padding: '20px' }}>SUBJECT IDENTITY</th>
              <th>DIAGNOSTIC MISSION</th>
              <th>FILES</th>
              <th>TECHNICIAN</th>
              <th>STATUS</th>
              <th>WAITING</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredCases.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f8f9fa' }}>
                <td data-label="TARGET" style={{ padding: '20px' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#0a0f1d', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, border: '2px solid #0f52ba' }}>{c.patientName.charAt(0)}</div>
                      <div>
                         <div style={{ fontWeight: 800, color: '#2c3e50', fontSize: '14px' }}>{c.patientName.toUpperCase()}</div>
                         <div style={{ fontSize: '10px', color: '#aaa', fontWeight: 700 }}>ID: {c.patientId}</div>
                      </div>
                   </div>
                </td>
                <td data-label="STUDY">
                   <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f52ba' }}>{c.studyType}</span>
                      <span style={{ fontSize: '9px', fontWeight: 900, color: (c.priority === 'STAT' || c.priority === 'URGENT') ? '#e74c3c' : '#888' }}>
                         {(c.priority === 'STAT' || c.priority === 'URGENT') ? `⚡ ${c.priority}` : '📋 ROUTINE'}
                      </span>
                   </div>
                </td>
                <td data-label="ASSETS"><span className="file-badge" style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 900 }}>{c.uploadedFiles} ASSETS</span></td>
                <td data-label="TECH"><div style={{ fontSize: '12px', fontWeight: 700, color: '#666' }}>{c.tech}</div></td>
                <td data-label="STATUS"><span className={`status-badge status-${c.status.toLowerCase()}`} style={{ padding: '5px 12px', borderRadius: '15px', fontSize: '9px', fontWeight: 900 }}>{c.status.replace(/_/g, ' ')}</span></td>
                <td data-label="LATENCY"><span style={{ fontWeight: 800, color: '#e74c3c' }}>{c.waitingTime}</span></td>
                <td data-label="ACTIONS">
                  <div className="action-buttons" style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-icon" style={{ color: '#0f52ba', background: '#f0f3fd', border: '1px solid #d0d9f7' }} onClick={() => setPrintModalData(c)}>🖨️</button>
                    <button className="btn-logout" style={{ padding: '6px 15px', fontSize: '10px', fontWeight: 800 }} onClick={() => handleOpenWorkspace(c)}>REPORT</button>
                    <button className="btn-primary" style={{ padding: '6px 15px', fontSize: '10px', background: '#0f52ba', fontWeight: 900 }} onClick={() => window.open('/viewer', '_blank')}>VIEWER ↗</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderHistory = () => {
    const historicalCases = cases.filter(c => {
      const matchesSearch = c.patientName.toLowerCase().includes(search.toLowerCase()) || c.id.includes(search);
      const inRange = c.date >= historyStart && c.date <= historyEnd;
      const isPast = c.status === 'FINAL_REPORTED';
      return matchesSearch && inRange && isPast;
    });

    return (
      <div className="history-view board-padding" style={{ paddingTop: '80px' }}>
        <div className="board-header" style={{ marginBottom: '35px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
             <h1 className="page-title" style={{ color: '#0f52ba', fontWeight: 900, marginBottom: '5px' }}>DIAGNOSTIC ARCHIVE</h1>
             <p style={{ fontSize: '12px', color: '#666', fontWeight: 600 }}>HISTORICAL DISPATCH REGISTRY</p>
          </div>
          <div className="board-actions" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
             <div style={{ display: 'flex', background: 'white', padding: '5px', borderRadius: '12px', border: '1px solid #eee' }}>
                <button onClick={() => setView('QUEUE')} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', fontSize: '11px', fontWeight: 900, background: 'transparent', color: '#888', cursor: 'pointer' }}>ACTIVE WORKLIST</button>
                <button onClick={() => setView('HISTORY')} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', fontSize: '11px', fontWeight: 900, background: '#0f52ba', color: 'white', cursor: 'pointer' }}>ARCHIVE</button>
             </div>
          </div>
        </div>

        <div className="filter-bar" style={{ display: 'flex', gap: '20px', alignItems: 'center', background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #eee', marginBottom: '25px', marginTop: '20px' }}>
           <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <label style={{ fontSize: '10px', fontWeight: 900, color: '#0f52ba', textTransform: 'uppercase' }}>Archival Range</label>
              <input type="date" value={historyStart} onChange={e => setHistoryStart(e.target.value)} style={{ padding: '8px 15px', fontSize: '12px', borderRadius: '8px', border: '1px solid #ddd', fontWeight: 600 }} />
              <span style={{ color: '#aaa', fontWeight: 900 }}>→</span>
              <input type="date" value={historyEnd} onChange={e => setHistoryEnd(e.target.value)} style={{ padding: '8px 15px', fontSize: '12px', borderRadius: '8px', border: '1px solid #ddd', fontWeight: 600 }} />
           </div>
           <div className="search-input-group" style={{ background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '8px', padding: '10px 15px', flex: 1 }}>
              <span className="search-icon">🔍</span>
              <input type="text" placeholder="Search archive..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', marginLeft: '10px' }} />
           </div>
        </div>

        <div className="table-container" style={{ background: 'white', borderRadius: '15px', border: '1px solid #dee2e6', overflow: 'hidden' }}>
           <table className="data-table">
              <thead style={{ background: '#f8f9fa' }}>
                 <tr>
                    <th style={{ padding: '20px' }}>ARCHIVAL SUBJECT</th>
                    <th>EXAM DATE</th>
                    <th>MISSION</th>
                    <th>MODALITY</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                 </tr>
              </thead>
              <tbody>
                 {historicalCases.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f8f9fa' }}>
                       <td style={{ padding: '20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                             <div style={{ width: '35px', height: '35px', borderRadius: '50%', background: '#0a0f1d', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 950, fontSize: '12px' }}>{c.patientName.charAt(0)}</div>
                             <div>
                                <span style={{ fontWeight: 800, color: '#2c3e50' }}>{c.patientName.toUpperCase()}</span><br/>
                                <span style={{ fontSize: '9px', fontWeight: 900, color: '#0f52ba' }}>ID: {c.id}</span>
                             </div>
                          </div>
                       </td>
                       <td><span style={{ fontWeight: 800 }}>{c.date}</span></td>
                       <td><span style={{ fontSize: '13px', fontWeight: 700 }}>{c.studyType}</span></td>
                       <td><span className="file-badge" style={{ padding: '4px 8px' }}>{c.modality}</span></td>
                       <td><span className="status-badge status-final_reported" style={{ padding: '5px 12px', borderRadius: '15px', fontSize: '9px', fontWeight: 900 }}>FINALIZED</span></td>
                       <td data-label="CASE DETAILS">
                          <button className="btn-icon" onClick={() => setPrintModalData(c)} style={{ color: '#0f52ba', background: '#f0f3fd', border: '1px solid #d0d9f7', padding: '8px 15px', fontSize: '10px', fontWeight: 900 }}>🖨️ DISPATCH</button>
                       </td>
                    </tr>
                 ))}
                 {historicalCases.length === 0 && (
                   <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '60px', color: '#aaa', fontStyle: 'italic' }}>
                         NO ARCHIVAL RECORDS FOUND IN THIS TEMPORAL RANGE
                      </td>
                   </tr>
                 )}
              </tbody>
           </table>
        </div>
      </div>
    );
  };

  // --- CALCULATIONS ---
  const missionProgress = useMemo(() => {
    let score = 0;
    if (report.history) score += 20;
    if (report.findings) score += 40;
    if (report.impression) score += 40;
    return score;
  }, [report]);

  const renderWorkspace = () => (
    <div className="reporting-layout" style={{ paddingTop: '80px' }}>
      {/* Top Action Bar */}
      <div className="reporting-action-bar" style={{ background: '#0a0f1d', color: 'white', padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '25px' }}>
          <button className="btn-logout" style={{ border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'white', padding: '8px 20px', borderRadius: '8px', fontSize: '11px', fontWeight: 900 }} onClick={() => setView('QUEUE')}>← BOARD EXIT</button>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 950, letterSpacing: '1px' }}>{activeCase.patientName.toUpperCase()} <span style={{ fontWeight: 400, opacity: 0.5, marginLeft: '10px' }}>ID: {activeCase.id}</span></div>
            <div style={{ fontSize: '9px', color: '#00f2fe', fontWeight: 900, textTransform: 'uppercase', marginTop: '2px', display: 'flex', gap: '15px' }}>
               <span>Diagnostic Workspace Active</span>
               <span style={{ color: '#fff', opacity: 0.6 }}>|</span>
               <span>REF BY: {activeCase.referredBy?.toUpperCase() || 'SELF'} ({activeCase.referredContact || 'N/A'})</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
           <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '20px' }}>
              <span style={{ fontSize: '8px', fontWeight: 900, opacity: 0.5, textTransform: 'uppercase' }}>Source Address</span>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#aaa', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeCase.referredAddress || 'N/A'}</span>
           </div>
           <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '9px', fontWeight: 900, opacity: 0.5, textTransform: 'uppercase' }}>Mission Triage</span>
              <span style={{ fontSize: '11px', fontWeight: 900, color: (activeCase.priority === 'STAT' || activeCase.priority === 'URGENT') ? '#ff4757' : '#2ecc71' }}>{activeCase.priority} PRIORITY</span>
           </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', margin: '0 20px', height: 'calc(100vh - 200px)' }}>
        
        {/* Left column: Cinematic Diagnostic Viewer */}
        <div className="doctor-panel" style={{ flex: '1.2', background: '#000', display: 'flex', flexDirection: 'column', borderRadius: '15px', overflow: 'hidden', border: '5px solid #1a1a1a' }}>
          <div className="panel-header" style={{ background: '#111', borderBottom: '1px solid #222', color: '#666', fontSize: '10px', fontWeight: 900, letterSpacing: '1px', padding: '10px 20px' }}>CINEMATIC VIEWPORT [HI-RES]</div>
          <div className="viewer-canvas" style={{ position: 'relative', flex: 1, minHeight: 0, background: 'radial-gradient(circle, #1a1a1a 0%, #000 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <div className="viewer-overlay-top" style={{ color: '#00f2fe', textShadow: '0 0 10px rgba(0,242,254,0.3)' }}>
                MISSION: {activeCase.studyType}<br/>
                MODALITY: {activeCase.modality}<br/>
                SLICE: {currentSlice} / 50
             </div>
             <div style={{ color: 'white', textAlign: 'center' }}>
                <span style={{ fontSize: '150px', opacity: 0.1 }}>{MODALITY_ICONS[activeCase.modality] || '🖥️'}</span>
                <p style={{ fontSize: '11px', marginTop: '20px', color: '#333', fontWeight: 900, letterSpacing: '3px' }}>[ FULL FIDELITY DATASTREAM ]</p>
             </div>
          </div>
          <div className="viewer-toolbar" style={{ background: '#0a0a0a', borderTop: '1px solid #1a1a1a', padding: '15px 30px' }}>
             <div style={{ display: 'flex', gap: '15px' }}>
                <button className="tool-btn" style={{ background: '#111', color: '#aaa' }}>🔍</button>
                <button className="tool-btn" style={{ background: '#111', color: '#aaa' }}>📐</button>
                <button className="tool-btn" style={{ background: '#111', color: '#aaa' }}>🌓</button>
             </div>
             <input type="range" className="slice-slider" style={{ flex: 1, margin: '0 40px', accentColor: '#00f2fe' }} min="1" max="50" value={currentSlice} onChange={e => setCurrentSlice(e.target.value)} />
             <button className="tool-btn" style={{ color: '#00f2fe', fontWeight: 950 }}>3D</button>
          </div>
        </div>

        {/* Right column: Diagnostic Reporting HUD */}
        <div className="doctor-panel" style={{ flex: '1', background: 'white', borderRadius: '15px', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #dee2e6' }}>
          <div className="panel-header" style={{ padding: '20px 30px', background: '#f8f9fa', borderBottom: '1px solid #eee' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontWeight: 950, fontSize: '10px', color: '#0f52ba' }}>MISSION READINESS HUD</span>
              <span style={{ fontWeight: 950, fontSize: '10px', color: missionProgress === 100 ? '#2ecc71' : '#aaa' }}>{missionProgress}% COMPLETE</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: '#eee', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${missionProgress}%`, height: '100%', background: missionProgress === 100 ? '#2ecc71' : '#0f52ba', transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}></div>
            </div>
          </div>
          
          <div className="doctor-scroll" style={{ padding: '30px', overflowY: 'auto', flex: 1 }}>
            {/* Quick Templates */}
            <div style={{ marginBottom: '35px' }}>
              <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#aaa', marginBottom: '12px', textTransform: 'uppercase' }}>Diagnostic Loadouts</label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {Object.keys(TEMPLATES).map(name => (
                  <button 
                    key={name}
                    style={{ padding: '8px 15px', background: 'white', border: '1px solid #dee2e6', borderRadius: '25px', fontSize: '10px', fontWeight: 900, cursor: 'pointer', transition: 'all 0.2s', color: '#0f52ba', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}
                    onClick={() => handleApplyTemplate(name)}
                  >
                    ⚡ {name.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="report-section" style={{ background: '#fcfcfc', border: '1px solid #eee', borderRadius: '12px', padding: '20px', marginBottom: '25px' }}>
              <label style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase' }}>
                <span style={{ width: '8px', height: '8px', background: report.history ? '#2ecc71' : '#aaa', borderRadius: '50%' }}></span>
                Clinical Perspective
              </label>
              <textarea 
                style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '14px', marginTop: '12px', outline: 'none', fontWeight: 500, color: '#2c3e50' }}
                placeholder="Subject history and clinical objective..." 
                value={report.history} 
                onChange={e => setReport({...report, history: e.target.value})} 
              />
            </div>
            
            <div className="report-section" style={{ border: report.findings ? '2px solid #0f52ba' : '1px solid #eee', borderRadius: '12px', padding: '20px', marginBottom: '25px', background: 'white' }}>
              <label style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase' }}>
                <span style={{ width: '8px', height: '8px', background: report.findings ? '#2ecc71' : '#e74c3c', borderRadius: '50%' }}></span>
                Primary Findings
              </label>
              <textarea 
                rows="8" 
                style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '14px', marginTop: '12px', lineHeight: '1.6', outline: 'none', color: '#2c3e50' }}
                placeholder="Identify anomalies and clinical data..." 
                value={report.findings} 
                onChange={e => setReport({...report, findings: e.target.value})} 
              />
            </div>

            <div className="report-section" style={{ border: report.impression ? '2px solid #00f2fe' : '1px solid #eee', borderRadius: '12px', padding: '20px', marginBottom: '25px', background: '#f8feff' }}>
              <label style={{ fontSize: '10px', fontWeight: 950, color: '#00f2fe', display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase' }}>
                <span style={{ width: '8px', height: '8px', background: report.impression ? '#2ecc71' : '#ff4757', borderRadius: '50%' }}></span>
                Diagnostic Impression
              </label>
              <textarea 
                rows="4" 
                style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '14px', marginTop: '12px', fontWeight: 900, outline: 'none', color: '#0f52ba' }}
                placeholder="Clinical conclusion..." 
                value={report.impression} 
                onChange={e => setReport({...report, impression: e.target.value})} 
              />
            </div>
          </div>
          
          <div style={{ padding: '25px 30px', background: 'white', borderTop: '1px solid #eee', display: 'flex', gap: '15px' }}>
             <button 
                className="btn-logout" 
                style={{ flex: 1, padding: '18px', fontWeight: 950, fontSize: '10px', letterSpacing: '1px', borderRadius: '30px' }} 
                onClick={handleSaveDraft}
             >
                SAVE INTEL DRAFT
             </button>
             <button 
                className="btn-primary" 
                style={{ 
                  flex: 1.5, 
                  background: missionProgress === 100 ? 'linear-gradient(90deg, #2ecc71 0%, #27ae60 100%)' : '#0f52ba', 
                  padding: '18px', 
                  fontWeight: 950, 
                  fontSize: '10px', 
                  letterSpacing: '2px',
                  borderRadius: '30px',
                  opacity: missionProgress === 100 ? 1 : 0.6,
                  boxShadow: missionProgress === 100 ? '0 10px 20px rgba(46,204,113,0.2)' : 'none'
                }} 
                onClick={handleFinalize}
                disabled={missionProgress < 100}
             >
                {missionProgress === 100 ? 'DEPLOY REPORT' : 'MISSION PARTIAL'}
             </button>
          </div>
        </div>
      </div>

      {/* Finalize Modal */}
      {isFinalizing && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.8)', zIndex: 4000 }}>
          <div className="modal-content" style={{ width: '450px', padding: '40px', borderRadius: '20px' }}>
            <h2 style={{ marginBottom: '15px', color: '#0f52ba', fontWeight: 950 }}>Authorize Dispatch?</h2>
            <p style={{ color: '#666', fontSize: '13px', marginBottom: '30px', lineHeight: '1.7', fontWeight: 600 }}>
              Finalizing this mission will deploy the diagnostic dispatch to the patient registry. This action is irreversible for the current specialist.
            </p>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button className="btn-primary" style={{ flex: 2, background: '#2ecc71', borderRadius: '10px', fontWeight: 950 }} onClick={confirmFinalize}>CONFIRM DEPLOY</button>
              <button className="btn-logout" style={{ flex: 1, borderRadius: '10px', fontWeight: 900 }} onClick={() => setIsFinalizing(false)}>ABORT</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="page-wrapper" style={{ padding: 0 }}>
      {view === 'WORKSPACE' ? renderWorkspace() : (view === 'HISTORY' ? renderHistory() : renderQueue())}
      {renderPrintModal()}
    </div>
  );
}
