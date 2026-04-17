import { useState, useMemo } from 'react';
import '../styles/global.css';

// --- MOCK DATA ---
const INITIAL_STUDIES = [
  { id: 'SID-201', patientName: 'Robert Fox', patientId: 'P005', age: 52, gender: 'Male', studyType: 'Chest X-Ray PA', modality: 'X-RAY', time: '09:00', doctor: 'Dr. Brown', status: 'ARRIVED', priority: 'STAT' },
  { id: 'SID-202', patientName: 'Emily Chen', patientId: 'P009', age: 28, gender: 'Female', studyType: 'Brain MRI w/ Contrast', modality: 'MRI', time: '10:30', doctor: 'Dr. Sarah', status: 'IN_PROGRESS', priority: 'ROUTINE' },
  { id: 'SID-203', patientName: 'Michael Ross', patientId: 'P012', age: 41, gender: 'Male', studyType: 'Abdomen CT (VNC)', modality: 'CT', time: '11:15', doctor: 'Dr. Mike', status: 'READY_FOR_REVIEW', priority: 'URGENT' },
  { id: 'SID-204', patientName: 'Janet Taylor', patientId: 'P015', age: 64, gender: 'Female', studyType: 'Pelvis Ultrasound', modality: 'ULTRASOUND', time: '11:45', doctor: 'Dr. Lisa', status: 'ARRIVED', priority: 'ROUTINE' }
];

const MODALITY_ICONS = {
  'X-RAY': '🩻',
  'MRI': '🧠',
  'CT': '🌀',
  'ULTRASOUND': '🤰'
};

export default function TechnicianPage() {
  const [studies, setStudies] = useState(INITIAL_STUDIES);
  const [currentView, setCurrentView] = useState('QUEUE'); // 'QUEUE' or 'WORKSPACE'
  const [activeStudy, setActiveStudy] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ modality: 'ALL', status: 'ALL' });
  
  // Workspace specific states
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [techNotes, setTechNotes] = useState('');
  const [activeSeries, setActiveSeries] = useState(0);
  const [currentSlice, setCurrentSlice] = useState(1);
  const [printModalData, setPrintModalData] = useState(null);

  // --- DERIVED DATA ---
  const filteredStudies = useMemo(() => {
    return studies.filter(s => {
      const matchesSearch = s.patientName.toLowerCase().includes(searchQuery.toLowerCase()) || s.id.includes(searchQuery);
      const matchesModality = filters.modality === 'ALL' || s.modality === filters.modality;
      const matchesStatus = filters.status === 'ALL' || s.status === filters.status;
      return matchesSearch && matchesModality && matchesStatus;
    });
  }, [studies, searchQuery, filters]);

  const stats = {
    assigned: studies.length,
    inProgress: studies.filter(s => s.status === 'IN_PROGRESS').length,
    pendingUpload: studies.filter(s => s.status === 'ARRIVED').length,
    ready: studies.filter(s => s.status === 'READY_FOR_REVIEW').length,
  };

  // --- HANDLERS ---
  const handleOpenWorkspace = (study) => {
    setActiveStudy(study);
    setCurrentView('WORKSPACE');
    // Mock existing files for IN_PROGRESS studies
    if (study.status === 'IN_PROGRESS' || study.status === 'READY_FOR_REVIEW') {
      setUploadedFiles([
        { name: 'chest_pa.dcm', type: 'DICOM', time: '10:05 AM', size: '15MB' },
        { name: 'referral_note.pdf', type: 'PDF', time: '10:10 AM', size: '1.2MB' }
      ]);
    } else {
      setUploadedFiles([]);
    }
    setTechNotes('');
  };

  const handleStatusUpdate = (id, newStatus) => {
    setStudies(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
    if (activeStudy && activeStudy.id === id) {
      setActiveStudy(prev => ({ ...prev, status: newStatus }));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const isImage = file.type.startsWith('image/');
      const isDicom = file.name.toLowerCase().endsWith('.dcm');
      
      const newFile = {
        name: file.name,
        type: isDicom ? 'DICOM' : isImage ? 'IMAGE' : 'FILE',
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        previewUrl: isImage ? URL.createObjectURL(file) : null,
        rawFile: file
      };

      setUploadedFiles(prev => [newFile, ...prev]);
      if (activeStudy?.status === 'ARRIVED') {
        handleStatusUpdate(activeStudy.id, 'IN_PROGRESS');
      }
    }
  };

  // --- RENDER VIEWS ---
  const renderPrintModal = () => {
    if (!printModalData) return null;
    return (
      <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 3000 }}>
         <div className="print-modal-container" style={{ width: '850px', height: '92vh', background: '#333', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#222', borderBottom: '1px solid #444' }}>
               <h3 style={{ color: '#eee', fontSize: '12px', fontWeight: 900 }}>DIAGNOSTIC DISPATCH PREVIEW</h3>
               <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn-primary" style={{ background: '#2ecc71' }} onClick={() => window.print()}>PRINT</button>
                  <button className="btn-logout" onClick={() => setPrintModalData(null)}>CLOSE</button>
               </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '40px', display: 'flex', justifyContent: 'center' }}>
               <div id="printable-report" style={{ width: '210mm', minHeight: '297mm', background: 'white', padding: '20mm', color: '#333', fontFamily: 'serif', position: 'relative' }}>
                   <div style={{ borderBottom: '2px solid #0f52ba', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <img src="/Logo.png" alt="NexEgale" style={{ height: '30px', width: 'auto' }} />
                      <div>
                        <h1 style={{ color: '#0f52ba', margin: 0, fontSize: '24px' }}>NexEgale 1Rad</h1>
                        <p style={{ fontSize: '10px', color: '#666' }}>Study Quality Verified Dispatch</p>
                      </div>
                   </div>
                  <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '4px', marginBottom: '25px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', border: '1px solid #eee' }}>
                     <div style={{ fontSize: '11px' }}><strong>PATIENT:</strong> {printModalData.patientName}</div>
                     <div style={{ fontSize: '11px' }}><strong>STUDY:</strong> {printModalData.studyType}</div>
                     <div style={{ fontSize: '11px' }}><strong>ID:</strong> {printModalData.patientId}</div>
                     <div style={{ fontSize: '11px' }}><strong>MODALITY:</strong> {printModalData.modality}</div>
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                     <h3 style={{ fontSize: '14px', borderBottom: '1px solid #eee' }}>TECHNICIAN PRELIMINARY DATA</h3>
                     <p>Imaging quality verified. All series acquired as per standard protocol. High-fidelity clinical assets have been deployed to the reporting specialist.</p>
                  </div>
                  <div style={{ position: 'absolute', bottom: '20mm', right: '20mm', textAlign: 'center' }}>
                     <div style={{ width: '150px', borderTop: '1px solid #333' }}></div>
                     <div style={{ fontSize: '11px', fontWeight: 800, marginTop: '5px' }}>Lead Technician</div>
                  </div>
               </div>
            </div>
         </div>
         <style>{`@media print { body * { visibility: hidden; } #printable-report, #printable-report * { visibility: visible; } #printable-report { position: absolute; left: 0; top: 0; } }`}</style>
      </div>
    );
  };

  const renderQueue = () => (
    <div className="queue-container board-padding" style={{ paddingTop: '80px' }}>
      {/* Top Header: Tactical Queue Command */}
      <div className="board-header" style={{ marginBottom: '35px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h1 className="page-title" style={{ color: '#0f52ba', fontWeight: 900, marginBottom: '5px' }}>TECHNICIAN QUEUE</h1>
           <p style={{ fontSize: '12px', color: '#666', fontWeight: 600 }}>DIAGNOSTIC WORKLIST & ACQUISITION COMMAND</p>
        </div>
      </div>

      {/* Cinematic Queue HUD */}
      <div className="summary-grid" style={{ marginBottom: '35px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
        <div className="summary-card" style={{ background: 'white', borderTop: '1px solid #dee2e6', borderRight: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #0f52ba' }}>
          <span className="label" style={{ fontSize: '10px', color: '#888', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>Active Missions</span>
          <div className="value" style={{ fontSize: '24px', fontWeight: 900, marginTop: '5px' }}>{stats.assigned}</div>
        </div>
        <div className="summary-card" style={{ background: 'white', borderTop: '1px solid #dee2e6', borderRight: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #00f2fe' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <span className="label" style={{ fontSize: '10px', color: '#888', fontWeight: 900, textTransform: 'uppercase' }}>In Progress</span>
             <span className="status-badge" style={{ background: '#e0f2fe', color: '#0f52ba', fontSize: '9px', padding: '2px 8px' }}>ACQUIRING 📡</span>
          </div>
          <div className="value" style={{ fontSize: '24px', fontWeight: 900, marginTop: '5px', color: '#0f52ba' }}>{stats.inProgress}</div>
        </div>
        <div className="summary-card" style={{ background: 'white', borderTop: '1px solid #dee2e6', borderRight: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #f1c40f' }}>
          <span className="label" style={{ fontSize: '10px', color: '#888', fontWeight: 900, textTransform: 'uppercase' }}>Pending Upload</span>
          <div className="value" style={{ fontSize: '24px', fontWeight: 900, marginTop: '5px' }}>{stats.pendingUpload}</div>
        </div>
        <div className="summary-card" style={{ background: '#f0fdf4', borderTop: '1px solid #dcfce7', borderRight: '1px solid #dcfce7', borderBottom: '1px solid #dcfce7', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #2ecc71' }}>
          <span className="label" style={{ fontSize: '10px', color: '#2ecc71', fontWeight: 900, textTransform: 'uppercase' }}>Ready for Review</span>
          <div className="value" style={{ fontSize: '24px', fontWeight: 900, marginTop: '5px', color: '#166534' }}>{stats.ready}</div>
        </div>
      </div>

      {/* Control & Recon Bar */}
      <div className="filter-bar responsive-control-bar force-stack-mobile" style={{ background: '#f8f9fa', padding: '20px', borderRadius: '12px', border: '1px solid #eee', marginBottom: '30px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'center' }}>
        <div className="search-input-group" style={{ background: 'white', border: '1px solid #ddd', borderRadius: '8px', padding: '10px 15px' }}>
          <span className="search-icon">🔍</span>
          <input 
            type="text" 
            placeholder="Search Subject ID..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', width: '250px', marginLeft: '10px', fontWeight: 600 }}
          />
        </div>
        <div className="filter-group">
          <label style={{ fontSize: '10px', fontWeight: 900, color: '#aaa', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Modality</label>
          <select value={filters.modality} onChange={e => setFilters({...filters, modality: e.target.value})} style={{ background: 'white', border: '1px solid #ddd', padding: '8px 15px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}>
            <option value="ALL">ALL MODALITIES</option>
            <option>X-RAY</option><option>MRI</option><option>CT</option><option>ULTRASOUND</option>
          </select>
        </div>
        <div className="filter-group">
          <label style={{ fontSize: '10px', fontWeight: 900, color: '#aaa', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Status Filter</label>
          <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} style={{ background: 'white', border: '1px solid #ddd', padding: '8px 15px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}>
            <option value="ALL">ALL STATUS</option>
            <option>ARRIVED</option><option>IN_PROGRESS</option><option>READY_FOR_REVIEW</option>
          </select>
        </div>
      </div>

      {/* Main Worklist: Study Registry */}
      <div className="table-container" style={{ background: 'white', borderRadius: '15px', border: '1px solid #dee2e6', overflow: 'hidden' }}>
        <table className="data-table">
          <thead style={{ background: '#f8f9fa' }}>
            <tr>
              <th style={{ padding: '20px' }}>SUBJECT IDENTITY</th>
              <th>DIAGNOSTIC MISSION</th>
              <th>MODALITY</th>
              <th>TIME</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudies.map(study => (
              <tr key={study.id} style={{ borderBottom: '1px solid #f8f9fa' }}>
                <td data-label="SUBJECT" style={{ padding: '20px' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#0a0f1d', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '14px', border: '2px solid #0f52ba' }}>
                         {study.patientName.charAt(0)}
                      </div>
                      <div>
                         <div style={{ fontWeight: 800, color: '#2c3e50', fontSize: '14px' }}>{study.patientName}</div>
                         <div style={{ fontSize: '10px', color: '#aaa', fontWeight: 700 }}>ID: {study.id}</div>
                      </div>
                   </div>
                </td>
                <td>
                   <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f52ba' }}>{study.studyType}</span>
                      <span style={{ fontSize: '9px', fontWeight: 900, color: study.priority === 'STAT' ? '#e74c3c' : '#888' }}>
                         {study.priority === 'STAT' ? '⚡ EMERGENCY STAT' : study.priority === 'URGENT' ? '⚠️ URGENT' : '📋 ROUTINE'}
                      </span>
                   </div>
                </td>
                <td>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>{MODALITY_ICONS[study.modality] || '🖥️'}</span>
                      <span className="file-badge" style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 900 }}>{study.modality}</span>
                   </div>
                </td>
                <td data-label="TIME"><span style={{ fontWeight: 800, color: '#2c3e50' }}>{study.time}</span></td>
                <td>
                  <span className={`status-badge status-${study.status.toLowerCase()}`} style={{ padding: '5px 12px', borderRadius: '15px', fontSize: '9px', fontWeight: 900, border: '1px solid rgba(0,0,0,0.05)' }}>
                    {study.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td>
                  <div className="action-buttons" style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-icon" style={{ color: '#0f52ba', background: '#f0f3fd', border: '1px solid #d0d9f7' }} title="Print Summary" onClick={() => setPrintModalData(study)}>🖨️</button>
                    {study.status === 'ARRIVED' && <button className="btn-primary" style={{ padding: '6px 15px', fontSize: '10px', fontWeight: 800 }} onClick={() => handleStatusUpdate(study.id, 'IN_PROGRESS')}>START STUDY</button>}
                    <button className="btn-logout" style={{ padding: '6px 15px', fontSize: '10px', fontWeight: 800, borderColor: '#dee2e6' }} onClick={() => handleOpenWorkspace(study)}>WORKSPACE</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderWorkspace = () => (
    <div className="technician-workspace" style={{ paddingTop: '80px', paddingLeft: '50px', paddingRight: '50px', paddingBottom: '50px' }}>
      <div className="board-header" style={{ marginBottom: '25px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button className="btn-logout" style={{ padding: '8px 20px', fontSize: '11px', fontWeight: 800 }} onClick={() => setCurrentView('QUEUE')}>← QUEUE EXIT</button>
          <div>
            <h1 className="page-title" style={{ marginBottom: 0, fontSize: '20px', fontWeight: 900 }}>DIAGNOSTIC WORKSPACE: {activeStudy.id}</h1>
            <p style={{ fontSize: '10px', color: '#666', fontWeight: 700, textTransform: 'uppercase' }}>High-Fidelity Clinical Acquisition Module</p>
          </div>
        </div>
        <div className="action-buttons">
          <span className={`status-badge status-${activeStudy.status.toLowerCase()}`} style={{ padding: '8px 20px', borderRadius: '25px', fontSize: '11px', fontWeight: 900 }}>{activeStudy.status.replace(/_/g, ' ')}</span>
        </div>
      </div>

      <div className="workspace-container" style={{ flexDirection: 'column', gap: '0' }}>
        {/* Top Intelligence Strip: Patient & Study Info */}
        <div style={{ 
          background: 'white', 
          border: '1px solid #dee2e6', 
          borderRadius: '12px', 
          padding: '15px 30px', 
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 15px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', gap: '50px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
               <div style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#0a0f1d', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 950 }}>{activeStudy.patientName.charAt(0)}</div>
               <div>
                  <label style={{ display: 'block', fontSize: '9px', color: '#0f52ba', fontWeight: 900, textTransform: 'uppercase', marginBottom: '2px' }}>Subject Identity</label>
                  <span style={{ fontSize: '17px', fontWeight: 900, color: '#2c3e50' }}>{activeStudy.patientName.toUpperCase()}</span>
               </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '9px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Bio-Metrics</label>
              <span style={{ fontSize: '14px', fontWeight: 800 }}>{activeStudy.gender} | {activeStudy.age} Years</span>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '9px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Target Study</label>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f52ba' }}>{activeStudy.studyType}</span>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '9px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Assigned Specialist</label>
              <span style={{ fontSize: '14px', fontWeight: 800 }}>{activeStudy.doctor.toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* --- DUAL PANEL SECTION: VIEWER (LEFT) | CONTROLS (RIGHT) --- */}
        <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0, height: 'calc(100vh - 220px)' }}>
          
          {/* Left Panel: High-Definition Cinematic Viewer (2/3) */}
          <div className="workspace-panel panel-center" style={{ flex: '2', background: '#000', display: 'flex', flexDirection: 'column', minWidth: 0, borderRadius: '15px', overflow: 'hidden', border: '5px solid #1a1a1a' }}>
            <div className="panel-header" style={{ background: '#111', borderBottom: '1px solid #222', color: '#666', fontSize: '10px', fontWeight: 900, letterSpacing: '1px' }}>CINEMATIC DICOM VIEWER [STAGE 01]</div>
            <div className="panel-body" style={{ padding: 0, position: 'relative', flex: 1, minHeight: 0 }}>
              <div className="viewer-layout">
                <div className="viewer-main" style={{ background: '#050505' }}>
                  <div className="viewer-sidebar" style={{ background: '#0a0a0a', borderRight: '1px solid #1a1a1a' }}>
                    {[0, 1].map(i => (
                      <div 
                        key={i} 
                        className={`series-thumb ${activeSeries === i ? 'active' : ''}`}
                        style={{ borderBottom: '1px solid #1a1a1a', padding: '15px', color: activeSeries === i ? '#00f2fe' : '#444', fontWeight: 900, fontSize: '10px' }}
                        onClick={() => setActiveSeries(i)}
                      >
                         SERIES {i + 1}<br/>
                         <span style={{ fontSize: '8px', opacity: 0.5 }}>25 SLICES</span>
                      </div>
                    ))}
                  </div>
                  <div className="viewer-canvas" style={{ background: 'radial-gradient(circle, #1a1a1a 0%, #000 70%)' }}>
                    {uploadedFiles.length > 0 && uploadedFiles[0].previewUrl ? (
                      <img 
                        src={uploadedFiles[0].previewUrl} 
                        alt="Study Preview" 
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: 'contrast(1.2) brightness(0.9)' }} 
                      />
                    ) : (
                      <>
                        <div className="viewer-overlay-top" style={{ color: '#00f2fe', textShadow: '0 0 10px rgba(0,242,254,0.3)' }}>
                          SUBJECT: {activeStudy.patientName.toUpperCase()}<br/>
                          MISSION: {activeStudy.studyType}<br/>
                          COORD: {activeStudy.modality}<br/>
                          SLICE: {currentSlice} / 25
                        </div>
                        <div style={{ textAlign: 'center', color: '#111' }}>
                          <span style={{ fontSize: '140px', opacity: 0.2 }}>{MODALITY_ICONS[activeStudy.modality] || '🖥️'}</span>
                          <p style={{ fontSize: '12px', marginTop: '20px', color: '#333', fontWeight: 900, letterSpacing: '2px' }}>
                            {uploadedFiles.length > 0 ? `INTEL LOADED: ${uploadedFiles[0].name.toUpperCase()}` : `[ AWAITING DICOM ACQUISITION ]`}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="viewer-toolbar" style={{ background: '#0a0a0a', borderTop: '1px solid #1a1a1a', padding: '10px 30px' }}>
                  <div className="tool-group">
                    <button className="tool-btn" style={{ background: '#111', color: '#aaa' }} title="Zoom">🔍</button>
                    <button className="tool-btn" style={{ background: '#111', color: '#aaa' }} title="Pan">🤚</button>
                    <button className="tool-btn" style={{ background: '#111', color: '#aaa' }} title="Window Level">🌓</button>
                  </div>
                  <input 
                    type="range" 
                    className="slice-slider" 
                    min="1" max="25" 
                    style={{ flex: 1, margin: '0 40px', accentColor: '#00f2fe' }}
                    value={currentSlice} 
                    onChange={e => setCurrentSlice(e.target.value)} 
                  />
                  <div className="tool-group">
                    <button className="tool-btn" style={{ color: '#00f2fe' }} onClick={() => {}}>3D</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
 
          {/* Right Panel: Control Sidebar (1/3) */}
          <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
              
             {/* Top: Upload Intel */}
             <div className="workspace-panel" style={{ flex: 'none', background: 'white', borderRadius: '15px' }}>
                <div className="panel-header" style={{ background: '#f8f9fa', color: '#2c3e50', fontWeight: 900 }}>ACQUISITION CONSOLE</div>
                <div className="panel-body" style={{ background: '#0a0f1d', padding: '25px' }}>
                   <div 
                      className="upload-dropzone" 
                      style={{ border: '2px dashed rgba(0,242,254,0.3)', background: 'rgba(255,255,255,0.02)', padding: '30px' }}
                      onClick={() => document.getElementById('study-upload').click()}
                   >
                      <div style={{ fontSize: '32px', marginBottom: '10px' }}>☁️</div>
                      <p style={{ fontSize: '13px', color: '#00f2fe', fontWeight: 900 }}>UPLOAD CLINICAL INTEL</p>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>DICOM / HIGH-RES ASSETS</span>
                      <input 
                        id="study-upload" 
                        type="file" 
                        style={{ display: 'none' }} 
                        accept=".dcm,image/*"
                        onChange={handleFileChange}
                      />
                   </div>
 
                   <div className="file-list" style={{ marginTop: '20px', maxHeight: '180px', overflowY: 'auto' }}>
                      {uploadedFiles.map((f, i) => (
                        <div key={i} className="file-item" style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderLeft: '3px solid #00f2fe', borderRadius: '4px', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                             <span style={{ fontSize: '18px' }}>📄</span>
                             <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: '#eee' }}>{f.name.toUpperCase()}</span>
                                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{f.type} | {f.size}</span>
                             </div>
                          </div>
                        </div>
                      ))}
                   </div>
                </div>
             </div>
 
             {/* Bottom: Tech Notes */}
             <div className="workspace-panel" style={{ flex: '1', background: 'white', borderRadius: '15px' }}>
                <div className="panel-header" style={{ background: '#f8f9fa', color: '#2c3e50', fontWeight: 900 }}>MISSION OBSERVATIONS</div>
                <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="form-group" style={{ flex: '1' }}>
                    <label style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', textTransform: 'uppercase', marginBottom: '10px', display: 'block' }}>Field Intel / QA Remarks</label>
                    <textarea 
                      style={{ width: '100%', height: 'calc(100% - 30px)', padding: '20px', borderRadius: '12px', border: '1px solid #dee2e6', fontSize: '13px', background: '#fcfcfc', color: '#2c3e50', fontWeight: 500 }}
                      placeholder="Enter critical technician findings for the specialist..."
                      value={techNotes}
                      onChange={e => setTechNotes(e.target.value)}
                    ></textarea>
                  </div>
                  
                  <button 
                    className="btn-primary" 
                    style={{ background: 'linear-gradient(90deg, #2ecc71 0%, #27ae60 100%)', padding: '18px', fontWeight: 900, borderRadius: '30px', boxShadow: '0 10px 20px rgba(46,204,113,0.2)' }}
                    onClick={() => { handleStatusUpdate(activeStudy.id, 'READY_FOR_REVIEW'); setCurrentView('QUEUE'); }}
                  >
                    DEPLOY TO SPECIALIST
                  </button>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-wrapper" style={{ padding: 0 }}>
      {currentView === 'QUEUE' ? renderQueue() : renderWorkspace()}
      {renderPrintModal()}
    </div>
  );
}
