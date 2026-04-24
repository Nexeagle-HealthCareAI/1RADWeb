import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import dicomParser from 'dicom-parser';
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

// Legacy DicomPreview removed in favor of AdvancedDicomViewer

const TEMPLATES = {
  'NORMAL CHEST': { findings: 'The heart and mediastinal silhouettes are normal. Lungs are clear. No pleural effusion or pneumothorax.', impression: 'NORMAL CHEST X-RAY.' },
  'NORMAL BRAIN': { findings: 'Brain parenchyma shows normal signal intensity. No space-occupying lesions. Ventricular system is normal.', impression: 'NO ACUTE INTRACRANIAL PATHOLOGY.' },
  'NORMAL ABDOMEN': { findings: 'Liver, spleen, and kidneys appear normal. No free air or fluid in the peritoneal cavity.', impression: 'NO ACUTE ABDOMINAL PATHOLOGY DETECTED.' }
};

const TODAY = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format in local time

export default function DoctorBoard() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('QUEUE'); // 'QUEUE', 'WORKSPACE', or 'HISTORY'
  const [activeCase, setActiveCase] = useState(null);
  const [loadedDicom, setLoadedDicom] = useState(null);
  const [isDicomImage, setIsDicomImage] = useState(false);
  
  // Reporting State
  const [report, setReport] = useState({ history: '', findings: '', impression: '', advice: '', technique: '' });
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [currentSlice, setCurrentSlice] = useState(1);
  const [printModalData, setPrintModalData] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ modality: 'ALL', priority: 'ALL', clinicalStatus: 'ALL' });
  const [isTablet, setIsTablet] = useState(window.innerWidth < 1100);
  const [viewMode, setViewMode] = useState('TABLE');
  const [archivePage, setArchivePage] = useState(1);
  const [archiveFilterMode, setArchiveFilterMode] = useState('ALL'); // 'ALL' or 'RANGE'
  const [archiveDateRange, setArchiveDateRange] = useState({ start: TODAY, end: TODAY });
  const itemsPerPage = 5;

  useEffect(() => {
    const handleResize = () => {
      const tablet = window.innerWidth < 1100;
      setIsTablet(tablet);
      if (tablet) setViewMode('CARDS');
      else setViewMode('TABLE');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);



  // --- API SYNC ---
  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/appointments');
      const allCases = res.data.map(a => {
        const studyDate = a.dateTime ? new Date(a.dateTime).toLocaleDateString('en-CA') : null;
        return {
          ...a,
          id: a.displayId,
          priority: a.type === 'EMERGENCY' ? 'STAT' : 'ROUTINE',
          isToday: studyDate === TODAY
        };
      });
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
      const matchesSearch = (c.patientName?.toLowerCase() || '').includes(search.toLowerCase()) || (c.id?.toLowerCase() || '').includes(search.toLowerCase());
      const matchesModality = filters.modality === 'ALL' || c.modality === filters.modality;
      const matchesPriority = filters.priority === 'ALL' || c.priority === filters.priority;
      
      const status = c.status?.toLowerCase();
      const matchesStatus = filters.clinicalStatus === 'ALL' || status === filters.clinicalStatus.toLowerCase();

      if (view === 'QUEUE') {
        return matchesSearch && matchesModality && matchesPriority && matchesStatus && c.isToday && ['scheduled', 'confirmed', 'in_progress', 'scanned', 'reporting', 'booked'].includes(status);
      } else {
        const studyDate = c.dateTime ? c.dateTime.split('T')[0] : null;
        const matchesDate = archiveFilterMode === 'ALL' || (studyDate && studyDate >= archiveDateRange.start && studyDate <= archiveDateRange.end);
        return matchesSearch && matchesModality && matchesPriority && matchesStatus && matchesDate && (status === 'reported' || !c.isToday);
      }
    });
  }, [cases, search, filters, view, TODAY, archiveFilterMode, archiveDateRange]);

  const paginatedCases = useMemo(() => {
    if (view === 'QUEUE') return filteredCases;
    const start = (archivePage - 1) * itemsPerPage;
    return filteredCases.slice(start, start + itemsPerPage);
  }, [filteredCases, view, archivePage]);

  const totalPages = Math.ceil(filteredCases.length / itemsPerPage);

  useEffect(() => {
    setArchivePage(1);
  }, [search, filters, view, archiveFilterMode, archiveDateRange]);

  const stats = {
    pendingReports: cases.filter(c => c.isToday && ['scanned', 'reporting'].includes(c.status?.toLowerCase())).length,
    drafts: cases.filter(c => c.isToday && c.status?.toLowerCase() === 'reporting').length,
    finalizedToday: cases.filter(c => c.status?.toLowerCase() === 'reported' && c.isToday).length,
    upcoming: cases.filter(c => c.isToday && ['scheduled', 'confirmed', 'in_progress', 'booked'].includes(c.status?.toLowerCase())).length,
    archiveTotal: cases.filter(c => !c.isToday || c.status?.toLowerCase() === 'reported').length,
    archiveFinalized: cases.filter(c => c.status?.toLowerCase() === 'reported').length,
    archiveDrafts: cases.filter(c => !c.isToday && c.status?.toLowerCase() === 'reporting').length,
    reportingAccuracy: 98
  };

  // --- HANDLERS ---
  const handleOpenWorkspace = (c) => {
    // Redirect to the dedicated Reporting Hub with patient context
    window.location.href = `/reporting?id=${c.id || c.appointmentId}`;
    
    if (c.status?.toLowerCase() !== 'reporting') {
      handleStatusUpdate(c.appointmentId, 'reporting');
    }
  };

  const handleDicomUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLoadedDicom(file);
    }
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
      <div className="board-header" style={{ padding: '15px 40px', background: 'white', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
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
        {view === 'QUEUE' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Critical Action</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '28px', fontWeight: 950, color: '#ef4444', letterSpacing: '-1.5px' }}>{stats.pendingReports}</span>
                 <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444' }}>AWAITING</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>In Progress</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '28px', fontWeight: 950, color: '#f59e0b', letterSpacing: '-1.5px' }}>{stats.drafts}</span>
                 <span style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>DRAFTS</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Success Metrics</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '28px', fontWeight: 950, color: '#2ecc71', letterSpacing: '-1.5px' }}>{stats.finalizedToday}</span>
                 <span style={{ fontSize: '11px', fontWeight: 700, color: '#2ecc71' }}>REPORTS</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Clinical Flux</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '28px', fontWeight: 950, color: '#0f52ba', letterSpacing: '-1.5px' }}>{stats.upcoming}</span>
                 <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f52ba' }}>UNITS</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Lifetime Archive</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '28px', fontWeight: 950, color: '#1e293b', letterSpacing: '-1.5px' }}>{stats.archiveTotal}</span>
                 <span style={{ fontSize: '11px', fontWeight: 700, color: '#6366f1' }}>STUDIES</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Total Finalized</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '28px', fontWeight: 950, color: '#059669', letterSpacing: '-1.5px' }}>{stats.archiveFinalized}</span>
                 <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669' }}>VALIDATED</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Legacy Drafts</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '28px', fontWeight: 950, color: '#f59e0b', letterSpacing: '-1.5px' }}>{stats.archiveDrafts}</span>
                 <span style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>DRAFTS</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Performance</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '28px', fontWeight: 950, color: '#0f52ba', letterSpacing: '-1.5px' }}>{stats.reportingAccuracy}%</span>
                 <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f52ba' }}>ACCURACY</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ background: 'white', padding: '15px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
            <input type="text" placeholder={view === 'QUEUE' ? "SEARCH ACTIVE WORKLIST..." : "SEARCH CLINICAL ARCHIVE..."} value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', padding: '12px 12px 12px 45px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, outline: 'none' }} />
          </div>

          {view === 'HISTORY' && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '5px 15px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', background: '#e2e8f0', padding: '2px', borderRadius: '8px' }}>
                <button onClick={() => setArchiveFilterMode('ALL')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', fontSize: '9px', fontWeight: 950, background: archiveFilterMode === 'ALL' ? 'white' : 'transparent', color: archiveFilterMode === 'ALL' ? '#0f52ba' : '#64748b', cursor: 'pointer' }}>ALL</button>
                <button onClick={() => setArchiveFilterMode('RANGE')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', fontSize: '9px', fontWeight: 950, background: archiveFilterMode === 'RANGE' ? 'white' : 'transparent', color: archiveFilterMode === 'RANGE' ? '#0f52ba' : '#64748b', cursor: 'pointer' }}>RANGE</button>
              </div>
              
              {archiveFilterMode === 'RANGE' && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="date" value={archiveDateRange.start} onChange={e => setArchiveDateRange({...archiveDateRange, start: e.target.value})} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '11px', fontWeight: 700 }} />
                  <span style={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8' }}>→</span>
                  <input type="date" value={archiveDateRange.end} onChange={e => setArchiveDateRange({...archiveDateRange, end: e.target.value})} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '11px', fontWeight: 700 }} />
                </div>
              )}
            </div>
          )}

          <select value={filters.modality} onChange={e => setFilters({...filters, modality: e.target.value})} style={{ padding: '12px 15px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 900, background: 'white', outline: 'none' }}>
            <option value="ALL">MODALITY: ALL</option>
            {Object.keys(MODALITY_ICONS).map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select value={filters.priority} onChange={e => setFilters({...filters, priority: e.target.value})} style={{ padding: '12px 15px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 900, background: 'white', outline: 'none' }}>
            <option value="ALL">PRIORITY: ALL</option>
            <option value="STAT">⚡ EMERGENCY</option>
            <option value="ROUTINE">📋 ROUTINE</option>
          </select>

          <select value={filters.clinicalStatus} onChange={e => setFilters({...filters, clinicalStatus: e.target.value})} style={{ padding: '12px 15px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 900, background: 'white', outline: 'none' }}>
            <option value="ALL">PHASE: ALL</option>
            {view === 'QUEUE' ? (
              <>
                <option value="SCANNED">📡 READY FOR REPORT</option>
                <option value="REPORTING">📝 IN DRAFTING</option>
                <option value="IN_PROGRESS">⚡ IN ACQUISITION</option>
              </>
            ) : (
              <>
                <option value="REPORTED">📄 FINALIZED</option>
                <option value="COMPLETED">✅ ARCHIVED</option>
              </>
            )}
          </select>

          <button className="gamified-btn" onClick={fetchCases} style={{ padding: '12px 20px', borderRadius: '10px' }}>RE-SYNC HUB</button>
        </div>

        {!isTablet && (
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', justifyContent: 'flex-end' }}>
             <button onClick={() => setViewMode('TABLE')} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: viewMode === 'TABLE' ? '#0f52ba' : 'white', color: viewMode === 'TABLE' ? 'white' : '#64748b', fontSize: '11px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>GRID_VIEW</button>
             <button onClick={() => setViewMode('CARDS')} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: viewMode === 'CARDS' ? '#0f52ba' : 'white', color: viewMode === 'CARDS' ? 'white' : '#64748b', fontSize: '11px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>CARD_VIEW</button>
          </div>
        )}

        <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          {viewMode === 'TABLE' ? (
            <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '11px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>PATIENT NODE</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '11px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>STUDY ARCHITECTURE</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '11px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>MISSION DATE</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '11px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>SCANNING CONTEXT</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '11px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>PHASE</th>
                <th style={{ padding: '20px', textAlign: 'right', fontSize: '11px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>OPERATIONS</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCases.map(c => {
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
                        <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '13px' }}>{c.dateTime ? new Date(c.dateTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : 'N/A'}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, marginTop: '4px' }}>TIME: {c.dateTime ? new Date(c.dateTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase() : '09:00 AM'}</div>
                    </td>
                    <td style={{ padding: '20px' }}>
                        <div style={{ maxWidth: '200px' }}>
                           <div style={{ fontSize: '10px', fontWeight: 800, color: '#0f52ba', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: status === 'scanned' ? '#2ecc71' : '#e2e8f0' }}></span>
                              {status === 'scanned' ? 'SCANNING COMPLETE' : 'IN_PIPELINE'}
                           </div>
                           <div style={{ fontSize: '11px', color: c.technicianComments ? '#1e293b' : '#94a3b8', fontWeight: 500, fontStyle: c.technicianComments ? 'normal' : 'italic' }}>
                              {c.technicianComments || 'No scanning bay observations provided.'}
                           </div>
                        </div>
                    </td>
                    <td style={{ padding: '20px' }}>
                      <span style={{ 
                        padding: '6px 12px', borderRadius: '10px', fontSize: '9px', fontWeight: 950,
                        background: isReady ? '#e9f7ef' : isScanning ? '#fef3c7' : isExpected ? '#f0f7ff' : '#f8fafc',
                        color: isReady ? '#27ae60' : isScanning ? '#d97706' : isExpected ? '#0f52ba' : '#64748b',
                        border: `1px solid ${isReady ? '#c3e6cb' : isScanning ? '#fcd34d' : isExpected ? '#dbeafe' : '#e2e8f0'}`,
                        textTransform: 'uppercase'
                      }}>{status === 'scanned' ? '📡 READY' : status === 'confirmed' ? '⚡ ARRIVED' : status === 'in_progress' ? '🌀 SCANNING' : status === 'scheduled' ? '📅 EXPECTED' : status === 'reported' ? '✅ REPORTED' : status.toUpperCase()}</span>
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
                  <td colSpan="7" style={{ textAlign: 'center', padding: '100px', color: '#94a3b8', fontStyle: 'italic', fontSize: '14px' }}>
                    [ NO DIAGNOSTIC MISSIONS IN THIS FREQUENCY ]
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {view === 'HISTORY' && totalPages > 1 && (
            <div style={{ padding: '15px 30px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>
                SHOWING PAGE <span style={{ color: '#0f52ba' }}>{archivePage}</span> OF <span style={{ color: '#0f52ba' }}>{totalPages}</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => setArchivePage(p => Math.max(1, p - 1))}
                  disabled={archivePage === 1}
                  style={{ padding: '8px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '10px', fontWeight: 900, cursor: archivePage === 1 ? 'not-allowed' : 'pointer', opacity: archivePage === 1 ? 0.5 : 1 }}
                >PREVIOUS</button>
                <button 
                  onClick={() => setArchivePage(p => Math.min(totalPages, p + 1))}
                  disabled={archivePage === totalPages}
                  style={{ padding: '8px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '10px', fontWeight: 900, cursor: archivePage === totalPages ? 'not-allowed' : 'pointer', opacity: archivePage === totalPages ? 0.5 : 1 }}
                >NEXT</button>
              </div>
            </div>
          )}
            </>
          ) : (
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: isTablet ? '1fr' : 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
               {filteredCases.map(c => {
                  const status = c.status || 'scheduled';
                  const isReady = status === 'scanned';
                  const isScanning = status === 'in_progress';
                  const isExpected = status === 'scheduled';
                  return (
                    <div key={c.id || c.appointmentId} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                             <div style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b' }}>{c.patientName?.toUpperCase()}</div>
                             <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, marginTop: '4px' }}>UHID: {c.patientIdentifier || 'UH-XXX'}</div>
                          </div>
                          <span style={{ 
                            padding: '6px 12px', borderRadius: '8px', fontSize: '10px', fontWeight: 950,
                            background: isReady ? '#ecfdf5' : isScanning ? '#fff7ed' : isExpected ? '#eff6ff' : '#f8fafc',
                            color: isReady ? '#27ae60' : isScanning ? '#d97706' : isExpected ? '#0f52ba' : '#64748b'
                          }}>{status.toUpperCase()}</span>
                       </div>
                       
                       <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                             <div style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>STUDY</div>
                             <div style={{ fontSize: '12px', fontWeight: 900, color: '#0f52ba' }}>{c.service?.toUpperCase()}</div>
                          </div>
                          <div>
                             <div style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>DATE/TIME</div>
                             <div style={{ fontSize: '12px', fontWeight: 800 }}>{c.dateTime ? new Date(c.dateTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase() : 'N/A'}</div>
                          </div>
                       </div>

                       {c.technicianComments && (
                         <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', padding: '0 5px' }}>
                            "{c.technicianComments}"
                         </div>
                       )}

                       <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
                          <button 
                            className="btn btn-primary"
                            onClick={() => handleOpenWorkspace(c)}
                            style={{ flex: 1, padding: '12px', borderRadius: '10px', fontSize: '11px', fontWeight: 950 }}
                          >EXECUTE_REPORTER</button>
                       </div>
                    </div>
                  );
               })}
               {filteredCases.length === 0 && !loading && (
                 <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', color: '#94a3b8', fontStyle: 'italic' }}>
                    [ NO DIAGNOSTIC MISSIONS IN THIS FREQUENCY ]
                 </div>
               )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderWorkspace = () => (
    <div style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
       {/* COMMAND HEADER (LIGHT) */}
       <div style={{ padding: '15px 40px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '25px' }}>
             <button onClick={() => setView('QUEUE')} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#1a1a2e', padding: '10px 20px', borderRadius: '12px', fontSize: '11px', fontWeight: 900, cursor: 'pointer', transition: '0.2s' }}>← EXIT COMMAND</button>
             <div>
                <div style={{ fontSize: '18px', fontWeight: 950, color: '#1a1a2e' }}>{activeCase.patientName.toUpperCase()}</div>
                <div style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 900, letterSpacing: '1px' }}>DIAGNOSTIC TARGET: {activeCase.modality} // {activeCase.service}</div>
              </div>
          </div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
             <div style={{ textAlign: 'right', marginRight: '10px' }}>
                <div style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>WORKFLOW_PHASE</div>
                <div style={{ fontSize: '11px', fontWeight: 950, color: '#2ecc71' }}>● LIVE_REPORTING</div>
             </div>
             <button 
                onClick={handleFinalize}
                style={{ background: '#2ecc71', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 30px', fontWeight: 950, fontSize: '12px', cursor: 'pointer', boxShadow: '0 8px 20px rgba(46, 204, 113, 0.2)' }}
             >DEPLOY FINAL DISPATCH</button>
          </div>
       </div>

       <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: isMobile ? 'auto' : 'hidden', padding: isMobile ? '15px' : '30px' }}>
          {/* DIAGNOSTIC ZONE (DARK) */}
          <div style={{ 
            flex: 1, 
            minHeight: isMobile ? '400px' : 'auto',
            background: 'radial-gradient(circle, #1a1a2e 0%, #050510 100%)', 
            position: 'relative', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            borderRadius: '24px', 
            boxShadow: '0 20px 50px rgba(0,0,0,0.15)', 
            overflow: 'hidden', 
            border: '1px solid #1e293b',
            marginBottom: isMobile ? '20px' : '0'
          }}>
             <div style={{ position: 'absolute', top: isMobile ? '15px' : '30px', left: isMobile ? '15px' : '30px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '15px', borderRadius: '12px', borderLeft: '3px solid #0f52ba', fontSize: '10px', fontWeight: 800, backdropFilter: 'blur(10px)', zIndex: 5 }}>
                ACQUISITION_TARGET: {activeCase.modality}<br/>
                FIDELITY: DIAGNOSTIC_HIGH<br/>
                ENGINE: 1RAD_CORE_V4
             </div>

             <div style={{ textAlign: 'center', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {loadedDicom ? (
                  <SimpleDicomViewer 
                     key={loadedDicom.name + loadedDicom.size} 
                     files={[loadedDicom]} 
                     onImageStatus={setIsDicomImage} 
                  />
                ) : (
                  <>
                    <div style={{ fontSize: '100px', opacity: 0.05, color: 'white' }}>{MODALITY_ICONS[activeCase.modality] || '🖥️'}</div>
                    <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <p style={{ fontSize: '9px', color: '#0f52ba', fontWeight: 950, letterSpacing: '2px', marginBottom: '15px' }}>[ SECURE_DICOM_STREAM_IDLE ]</p>
                      <button 
                         onClick={() => document.getElementById('doctor-dicom-upload').click()}
                         style={{ background: '#0f52ba', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '12px', fontSize: '11px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 10px 20px rgba(15,82,186,0.3)' }}
                      >FETCH ASSET STREAM</button>
                      <input id="doctor-dicom-upload" type="file" accept=".dcm" onChange={handleDicomUpload} style={{ display: 'none' }} />
                    </div>
                  </>
                )}
             </div>
          </div>

          {/* REPORTING SIDEBAR (LIGHT) */}
          <div style={{ 
            width: isMobile ? '100%' : '500px', 
            background: 'white', 
            marginLeft: isMobile ? '0' : '30px', 
            borderRadius: '24px', 
            padding: isMobile ? '25px' : '40px', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '30px', 
            overflowY: 'visible', 
            border: '1px solid #e2e8f0', 
            boxShadow: '0 10px 30px rgba(0,0,0,0.02)' 
          }}>
              <div>
                <label style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '15px', display: 'block' }}>CLINICAL_TEMPLATES</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                   {Object.keys(TEMPLATES).map(name => (
                      <button key={name} onClick={() => handleApplyTemplate(name)} style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '10px', fontWeight: 950, color: '#1e293b', cursor: 'pointer', transition: '0.2s' }}>⚡ {name}</button>
                   ))}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                 <label style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', textTransform: 'uppercase', display: 'block', marginBottom: '15px' }}>Diagnostic Findings</label>
                 <textarea 
                    value={report.findings}
                    onChange={e => setReport(prev => ({ ...prev, findings: e.target.value }))}
                    placeholder="Document anatomical observations..."
                    style={{ width: '100%', minHeight: '180px', background: 'transparent', border: 'none', fontSize: '14px', lineHeight: '1.6', outline: 'none', resize: 'none', color: '#1e293b' }}
                 />
              </div>

              <div style={{ background: '#f0f7ff', padding: '25px', borderRadius: '20px', border: '1px solid #dbeafe' }}>
                 <label style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', textTransform: 'uppercase', display: 'block', marginBottom: '15px' }}>Clinical Impression</label>
                 <textarea 
                    value={report.impression}
                    onChange={e => setReport(prev => ({ ...prev, impression: e.target.value }))}
                    placeholder="Enter final diagnostic conclusion..."
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
      {renderQueue()}
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
