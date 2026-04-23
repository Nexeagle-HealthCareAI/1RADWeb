import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import dicomParser from 'dicom-parser';
import apiClient from '../api/apiClient';
import AdvancedDicomViewer from '../components/AdvancedDicomViewer';
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
  const [activeAssetIndex, setActiveAssetIndex] = useState(0);
  const [isDicomImage, setIsDicomImage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ modality: 'ALL', priority: 'ALL', clinicalStatus: 'ALL' });
  
  // Workspace specific states
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [techNotes, setTechNotes] = useState('');
  const [currentSlice, setCurrentSlice] = useState(1);
  const [printModalData, setPrintModalData] = useState(null);
  
  // New Workspace state
  const [activeTool, setActiveTool] = useState('WindowLevel');
  const [activeMetadata, setActiveMetadata] = useState(null);
  const [cineEnabled, setCineEnabled] = useState(false);
  const [layoutMode, setLayoutMode] = useState('1x1');
  const [viewportProps, setViewportProps] = useState({ invert: false, flipHorizontal: false, flipVertical: false, rotation: 0 });
  const [resetTrigger, setResetTrigger] = useState(0);
  const [screenshotData, setScreenshotData] = useState(null);
  const [keyImages, setKeyImages] = useState([]);
  const [isSyncEnabled, setIsSyncEnabled] = useState(false);

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
      const matchesPriority = filters.priority === 'ALL' || s.priority === filters.priority;
      const matchesStatus = filters.clinicalStatus === 'ALL' || status === filters.clinicalStatus.toLowerCase();

      if (hubTab === 'ACTIVE') {
        // Today's work: Scheduled, Confirmed, In Progress, Scanned, Reporting
        return matchesSearch && matchesModality && matchesPriority && matchesStatus && s.isToday && ['scheduled', 'confirmed', 'in_progress', 'booked', 'scanned', 'reporting'].includes(status);
      } else {
        // Archive: Reported, Completed, or past appointments
        return matchesSearch && matchesModality && matchesPriority && matchesStatus && (['reported', 'completed'].includes(status) || !s.isToday);
      }
    });
  }, [studies, searchQuery, filters, hubTab, TODAY]);

  const stats = {
    total: studies.filter(s => s.isToday && ['scheduled', 'confirmed', 'in_progress', 'booked', 'scanned', 'reporting'].includes(s.status?.toLowerCase())).length,
    inProgress: studies.filter(s => s.status?.toLowerCase() === 'in_progress').length,
    pending: studies.filter(s => s.status?.toLowerCase() === 'confirmed').length,
    expected: studies.filter(s => s.isToday && ['scheduled', 'booked'].includes(s.status?.toLowerCase())).length,
    // Archive Stats
    archiveTotal: studies.filter(s => !s.isToday || ['reported', 'completed'].includes(s.status?.toLowerCase())).length,
    archiveReported: studies.filter(s => s.status?.toLowerCase() === 'reported').length,
    archiveCompleted: studies.filter(s => s.status?.toLowerCase() === 'completed').length,
    archiveEfficiency: studies.length > 0 ? Math.round((studies.filter(s => ['reported', 'completed'].includes(s.status?.toLowerCase())).length / studies.length) * 100) : 0
  };

  // --- HANDLERS ---
  const handleOpenWorkspace = async (study) => {
    setActiveStudy(study);
    setCurrentView('WORKSPACE');
    setUploadedFiles([]);
    setTechNotes(study.notes || '');
    setViewportProps({ invert: false, flipHorizontal: false, flipVertical: false, rotation: 0 });
    setKeyImages([]);

    // Fetch existing assets for this mission
    try {
        setLoading(true);
        const res = await apiClient.get(`/Study/${study.appointmentId}/assets`);
        if (res.data && res.data.length > 0) {
            const hydAssets = res.data.map(asset => ({
                id: asset.id,
                name: asset.fileName,
                type: asset.fileType.toUpperCase(),
                remoteUrl: asset.blobUrl,
                needsHydration: asset.fileType === 'zip',
                rawFiles: []
            }));
            setUploadedFiles(hydAssets);
        }
    } catch (err) {
        console.error('[TECH] Asset fetch failed', err);
    } finally {
        setLoading(false);
    }
  };

  const hydrateZipAsset = async (index) => {
    const asset = uploadedFiles[index];
    if (!asset || !asset.needsHydration || !asset.remoteUrl) return;

    setLoading(true);
    try {
      const response = await fetch(asset.remoteUrl);
      const blob = await response.blob();
      const zip = await JSZip.loadAsync(blob);
      const extractedFiles = [];
      
      const fileNames = Object.keys(zip.files);
      for (const fileName of fileNames) {
        const zipFile = zip.files[fileName];
        if (!zipFile.dir) {
          const content = await zipFile.async('arraybuffer');
          extractedFiles.push(new File([content], fileName.split('/').pop(), { type: 'application/dicom' }));
        }
      }

      setUploadedFiles(prev => {
        const newFiles = [...prev];
        newFiles[index] = { ...asset, rawFiles: extractedFiles, needsHydration: false };
        return newFiles;
      });
    } catch (err) {
      console.error('[TECH] Hydration failure', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (uploadedFiles[activeAssetIndex]?.needsHydration) {
      hydrateZipAsset(activeAssetIndex);
    }
  }, [activeAssetIndex, uploadedFiles]);

  const persistStudyAsset = async (file) => {
    try {
      const formData = new FormData();
      formData.append('AppointmentId', activeStudy.appointmentId);
      formData.append('File', file);
      await apiClient.post('/Study/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    } catch (err) {
      console.error('[TECH] Persistence failed', err);
    }
  };

  const handleDownloadScreenshot = useCallback((dataUrl) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `1RAD_CAPTURE_${activeStudy?.patientName}_${new Date().getTime()}.png`;
    link.click();
    setScreenshotData(null); // Reset trigger
  }, [activeStudy]);

  const toggleKeyImage = () => {
    const key = `${activeAssetIndex}_${currentSlice}`;
    setKeyImages(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
    
    if (isZip) {
      setLoading(true);
      try {
        const zip = await JSZip.loadAsync(file);
        const extractedFiles = [];
        
        const fileNames = Object.keys(zip.files);
        const seriesGroups = {};

        for (const fileName of fileNames) {
          const zipFile = zip.files[fileName];
          const isSystemFile = fileName.includes('__MACOSX') || fileName.endsWith('.DS_Store');
          
          if (!zipFile.dir && !isSystemFile) {
            const content = await zipFile.async('arraybuffer');
            const dcmFile = new File([content], fileName.split('/').pop(), { type: 'application/dicom' });
            
            try {
              const byteArray = new Uint8Array(content);
              const dataSet = dicomParser.parseDicom(byteArray);
              
              if (!dataSet.elements['x7fe00010']) {
                continue; // Not an image
              }
              
              const seriesUID = dataSet.string('x0020000e') || 'UNKNOWN_SERIES';
              const seriesDesc = dataSet.string('x0008103e') || 'UNNAMED SERIES';
              const instanceNum = parseInt(dataSet.string('x00200013') || '0', 10);
              const studyUID = dataSet.string('x0020000d') || 'UNKNOWN_STUDY';
              const modality = dataSet.string('x00080060') || 'UNK';
              const magStrength = dataSet.string('x00180087') || null;
              
              let patientName = dataSet.string('x00100010') || 'UNKNOWN_PATIENT';
              patientName = patientName.replace(/\^/g, ' ');

              if (!seriesGroups[seriesUID]) {
                seriesGroups[seriesUID] = {
                  seriesUID,
                  seriesDesc,
                  studyUID,
                  patientName,
                  files: []
                };
              }
              seriesGroups[seriesUID].files.push({ file: dcmFile, instanceNum });
            } catch (err) {
               console.warn('Failed to parse DICOM:', fileName);
            }
          }
        }
        
        const newAssets = Object.values(seriesGroups).map(group => {
          group.files.sort((a, b) => a.instanceNum - b.instanceNum);
          return {
            name: `${group.patientName} - ${group.seriesDesc}`,
            type: 'DICOM SERIES',
            size: `${group.files.length} IMAGES`,
            time: new Date().toLocaleTimeString(),
            previewUrl: null,
            isZip: false,
            rawFiles: group.files.map(f => f.file)
          };
        });

        // Background persist the zip file
        persistStudyAsset(file);

        if (newAssets.length > 0) {
          setUploadedFiles(prev => [...prev, ...newAssets]);
          setActiveAssetIndex(0); // Auto-focus first extracted asset stack
        } else {
          alert('No valid DICOM image series found in the ZIP archive.');
        }
      } catch (err) {
        console.error('[TECH] ZIP extraction failed', err);
        alert('Failed to extract ZIP archive.');
      } finally {
        setLoading(false);
      }
    } else {
      const isDicom = file.name.toLowerCase().endsWith('.dcm') || file.name.toLowerCase().includes('dicom') || file.type === 'application/dicom';
      
      persistStudyAsset(file);

      setUploadedFiles(prev => [...prev, {
        name: file.name,
        type: isDicom ? 'DICOM' : (file.type || 'UNKNOWN'),
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
        time: new Date().toLocaleTimeString(),
        previewUrl: isDicom ? null : URL.createObjectURL(file), // Don't use standard img tag for DICOM
        isZip: false,
        rawFiles: isDicom ? [file] : null
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
      <div className="board-header" style={{ padding: '30px 40px', background: 'white', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
           <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '5px' }}>
              <span style={{ fontSize: '24px' }}>🛰️</span>
              <h1 style={{ fontSize: '24px', fontWeight: 950, color: '#1a1a2e', letterSpacing: '-1px', margin: 0 }}>SCANNING BAY COMMAND</h1>
           </div>
           <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 900, marginLeft: '45px', textTransform: 'uppercase', letterSpacing: '2px' }}>Clinical Acquisition & Worklist Dispatch</p>
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
        {hubTab === 'ACTIVE' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '30px' }}>
            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '18px 22px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>Daily Flux</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '32px', fontWeight: 950, color: '#1e293b', letterSpacing: '-1.5px' }}>{stats.total}</span>
                 <span style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', opacity: 0.8 }}>UNITS</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '18px 22px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>Acquisition Active</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '32px', fontWeight: 950, color: '#f59e0b', letterSpacing: '-1.5px' }}>{stats.inProgress}</span>
                 <span style={{ fontSize: '11px', fontWeight: 950, color: '#f59e0b', opacity: 0.8 }}>SCANNING</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '18px 22px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>Arrival Confirmed</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '32px', fontWeight: 950, color: '#2ecc71', letterSpacing: '-1.5px' }}>{stats.pending}</span>
                 <span style={{ fontSize: '11px', fontWeight: 950, color: '#2ecc71', opacity: 0.8 }}>READY</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '18px 22px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>Mission Expected</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '32px', fontWeight: 950, color: '#0f52ba', letterSpacing: '-1.5px' }}>{stats.expected}</span>
                 <span style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', opacity: 0.8 }}>PENDING</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '30px' }}>
            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '18px 22px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>Archive Magnitude</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '32px', fontWeight: 950, color: '#1e293b', letterSpacing: '-1.5px' }}>{stats.archiveTotal}</span>
                 <span style={{ fontSize: '11px', fontWeight: 950, color: '#6366f1', opacity: 0.8 }}>STUDIES</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '18px 22px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>Clinical Finalized</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '32px', fontWeight: 950, color: '#059669', letterSpacing: '-1.5px' }}>{stats.archiveReported}</span>
                 <span style={{ fontSize: '11px', fontWeight: 950, color: '#059669', opacity: 0.8 }}>REPORTS</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '18px 22px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>Closed Lifecycle</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '32px', fontWeight: 950, color: '#0f52ba', letterSpacing: '-1.5px' }}>{stats.archiveCompleted}</span>
                 <span style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', opacity: 0.8 }}>CLOSED</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '18px 22px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>Diagnostic Yield</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '32px', fontWeight: 950, color: '#6366f1', letterSpacing: '-1.5px' }}>{stats.archiveEfficiency}%</span>
                 <span style={{ fontSize: '11px', fontWeight: 950, color: '#6366f1', opacity: 0.8 }}>RATIO</span>
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
            <option value="ALL">MODALITY: ALL</option>
            {Object.keys(MODALITY_ICONS).map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select value={filters.priority} onChange={e => setFilters({...filters, priority: e.target.value})} style={{ padding: '14px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 900, background: 'white', outline: 'none' }}>
            <option value="ALL">PRIORITY: ALL</option>
            <option value="STAT">⚡ EMERGENCY</option>
            <option value="ROUTINE">📋 ROUTINE</option>
          </select>

          <select value={filters.clinicalStatus} onChange={e => setFilters({...filters, clinicalStatus: e.target.value})} style={{ padding: '14px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 900, background: 'white', outline: 'none' }}>
            <option value="ALL">PHASE: ALL</option>
            {hubTab === 'ACTIVE' ? (
              <>
                <option value="CONFIRMED">📡 AWAITING SCAN</option>
                <option value="IN_PROGRESS">⚡ IN SCANNING</option>
                <option value="SCANNED">✅ READY FOR DOC</option>
                <option value="REPORTING">📝 UNDER REVIEW</option>
              </>
            ) : (
              <>
                <option value="REPORTED">📄 FINALIZED</option>
                <option value="COMPLETED">✅ COMPLETED</option>
              </>
            )}
          </select>

          <button className="gamified-btn" onClick={fetchWorklist} style={{ padding: '14px 30px', borderRadius: '12px' }}>RE-SYNC HUD</button>
        </div>

        <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>SUBJECT</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>MISSION TARGET</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>MISSION DATE</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>MODALITY</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>STATUS</th>
                <th style={{ padding: '20px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>{hubTab === 'ACTIVE' ? 'WORKSPACE' : 'ACTIONS'}</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudies.map(study => {
                const priority = PRIORITY_META[study.priority] || PRIORITY_META.ROUTINE;
                const status = study.status?.toLowerCase();
                const isArrived = ['confirmed', 'in_progress', 'scanned', 'reporting'].includes(status);
                const isExpected = ['scheduled', 'booked'].includes(status) && study.isToday;
                const isDone = ['scanned', 'reporting'].includes(status);
                
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
                        <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '13px' }}>{study.appointmentDate ? new Date(study.appointmentDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : 'N/A'}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, marginTop: '4px' }}>TIME: {study.appointmentTime || '09:00 AM'}</div>
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
                        background: isDone ? '#f0fdf4' : isArrived && !isDone ? '#e9f7ef' : isExpected ? '#f0f7ff' : '#f8fafc',
                        color: isDone ? '#16a34a' : isArrived && !isDone ? '#27ae60' : isExpected ? '#0f52ba' : '#64748b',
                        border: `1px solid ${isDone ? '#bbf7d0' : isArrived && !isDone ? '#c3e6cb' : isExpected ? '#dbeafe' : '#e2e8f0'}`,
                        textTransform: 'uppercase'
                      }}>
                        {status === 'confirmed' ? '📡 ARRIVED' : status === 'in_progress' ? '⚡ SCANNING' : status === 'scanned' ? '✅ READY' : status === 'reporting' ? '📝 REPORTING' : status === 'scheduled' ? '📅 EXPECTED' : status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '20px', textAlign: 'right' }}>
                      {hubTab === 'ACTIVE' ? (
                        <button 
                          className="gamified-btn" 
                          disabled={!isArrived}
                          style={{ padding: '10px 20px', borderRadius: '12px', fontSize: '11px', opacity: isArrived ? 1 : 0.4, cursor: isArrived ? 'pointer' : 'not-allowed', background: isDone ? '#1e293b' : '#0f52ba' }} 
                          onClick={() => handleOpenWorkspace(study)}
                        >
                          {isDone ? 'REVIEW DATA' : 'ENTER WORKSPACE'}
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
                  <td colSpan="6" style={{ textAlign: 'center', padding: '100px', color: '#94a3b8', fontStyle: 'italic', fontSize: '14px' }}>
                    [ NO DIAGNOSTIC ASSETS IN THIS FREQUENCY ]
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
    <div className="workspace-view" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc', overflow: 'hidden', fontFamily: "'Inter', 'Outfit', sans-serif" }}>
      
      {/* TOP COMPACT TOOLBAR */}
      <div style={{ 
        height: '46px', 
        background: '#ffffff', 
        borderBottom: '1px solid #e2e8f0', 
        display: 'flex', 
        alignItems: 'center', 
        padding: '0 12px', 
        gap: '6px',
        zIndex: 100,
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <button onClick={() => setCurrentView('QUEUE')} className="toolbar-btn light" style={{ width: 'auto', padding: '0 12px', fontSize: '10px', fontWeight: 900, height: '30px' }}>
          ↩ EXIT
        </button>
        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 5px' }}></div>
        
        {/* UPLOAD & EXPORT */}
        <button 
          onClick={() => document.getElementById('tech-study-up').click()}
          className="toolbar-btn light active" 
          title="Import Clinical Data (DICOM / ZIP)"
          style={{ 
            background: 'linear-gradient(135deg, #0f52ba 0%, #003087 100%)', 
            color: 'white', 
            border: 'none',
            display: 'flex',
            gap: '6px',
            width: 'auto',
            padding: '0 12px',
            fontSize: '9px',
            fontWeight: 950,
            borderRadius: '8px',
            boxShadow: '0 4px 10px rgba(15, 82, 186, 0.2)',
            height: '30px'
          }}
        >
          <span style={{ fontSize: '14px' }}>📦</span> 
          <span>IMPORT</span>
        </button>
        <input id="tech-study-up" type="file" style={{ display: 'none' }} accept=".dcm,.zip" onChange={handleFileChange} />
        
        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 8px' }}></div>

        {/* VIEWER TOOLS */}
        {[
          { id: 'WindowLevel', icon: '🌓', label: 'W/L' },
          { id: 'StackScroll', icon: '📚', label: 'Stack' },
          { id: 'Zoom', icon: '🔍', label: 'Zoom' },
          { id: 'Pan', icon: '✋', label: 'Pan' },
          { id: 'Length', icon: '📏', label: 'Measure' },
          { id: 'Angle', icon: '📐', label: 'Angle' },
          { id: 'EllipticalROI', icon: '⭕', label: 'ROI' },
          { id: 'ArrowAnnotate', icon: '↗️', label: 'Annotate' },
        ].map(t => (
          <button 
            key={t.id}
            onClick={() => setActiveTool(t.id)}
            className={`toolbar-btn light ${activeTool === t.id ? 'active' : ''}`}
            title={t.label}
            style={{ width: '28px', height: '28px', fontSize: '11px', padding: 0 }}
          >{t.icon}</button>
        ))}

        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 8px' }}></div>

        {/* SPECIAL TOOLS */}
        <button onClick={() => setCineEnabled(!cineEnabled)} className={`toolbar-btn light ${cineEnabled ? 'active' : ''}`} title="Cine Loop" style={{ fontSize: '8px', padding: '0 8px', height: '28px' }}>🎬 CINE</button>
        <button 
          onClick={() => setIsSyncEnabled(!isSyncEnabled)} 
          className={`toolbar-btn light ${isSyncEnabled ? 'active' : ''}`} 
          title="Synchronize Viewports"
          style={{ fontWeight: 950, fontSize: '8px', padding: '0 8px', height: '28px' }}
        >
          🔗 SYNC
        </button>

        <div style={{ flex: 1 }}></div>

        <select 
           value={layoutMode} 
           onChange={e => setLayoutMode(e.target.value)}
           style={{ background: 'white', color: '#1e293b', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 950 }}
        >
           <option value="1x1">LAYOUT: 1X1</option>
           <option value="2x2">LAYOUT: 2X2</option>
        </select>
        
        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 8px' }}></div>
        <button onClick={() => toggleKeyImage()} className={`toolbar-btn light ${keyImages.includes(`${activeAssetIndex}_${currentSlice}`) ? 'active' : ''}`} title="Mark Key Image" style={{ width: '32px', height: '32px', fontSize: '13px' }}>⭐</button>
        <button onClick={() => setScreenshotData(true)} className="toolbar-btn light" title="Export Screenshot" style={{ width: '32px', height: '32px', fontSize: '13px' }}>📸</button>
        <button onClick={() => { setResetTrigger(t => t + 1); setViewportProps({ invert: false, flipHorizontal: false, flipVertical: false, rotation: 0 }); }} className="toolbar-btn light" title="Reset Viewer" style={{ width: '32px', height: '32px', fontSize: '13px' }}>🔄</button>
        
        <div style={{ width: '1px', height: '30px', background: '#e2e8f0', margin: '0 10px' }}></div>
        
        <div style={{ flex: 1 }}></div>

        <button 
          onClick={() => { handleStatusUpdate(activeStudy?.appointmentId, 'scanned'); setCurrentView('QUEUE'); }}
          className="gamified-btn" style={{ padding: '10px 25px', borderRadius: '12px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 950 }}
        >DEPLOY STUDY</button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: '10px', gap: '10px' }}>
        
        {/* LEFT SIDEBAR: STUDY TREE */}
        <div style={{ width: '280px', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '15px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px', display: 'block', textTransform: 'uppercase' }}>Series Library</label>
          
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', marginBottom: '15px', borderLeft: '3px solid #0f52ba', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>{activeStudy?.patientName}</div>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', fontWeight: 800 }}>UHID: {activeStudy?.id}</div>
            </div>

            <label style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '10px', display: 'block', letterSpacing: '1px' }}>ACQUISITION_SERIES ({uploadedFiles.length})</label>
            {uploadedFiles.map((f, i) => (
              <div 
                key={i} 
                onClick={() => setActiveAssetIndex(i)}
                style={{ 
                  background: activeAssetIndex === i ? '#eff6ff' : 'white', 
                  padding: '12px', 
                  borderRadius: '12px', 
                  marginBottom: '10px', 
                  border: `1px solid ${activeAssetIndex === i ? '#3b82f6' : '#e2e8f0'}`, 
                  cursor: 'pointer',
                  transition: '0.2s',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                  position: 'relative'
                }}
              >
                {activeAssetIndex === i && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: '#3b82f6' }}></div>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: activeAssetIndex === i ? '#1d4ed8' : '#1e293b', letterSpacing: '0.5px' }}>{f.name.toUpperCase()}</div>
                  <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '4px', fontWeight: 700 }}>{f.rawFiles.length} DATA_SLICES</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '15px', padding: '15px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
            <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', marginBottom: '10px', display: 'block', textTransform: 'uppercase', letterSpacing: '1px' }}>Clinical Observations</label>
            <textarea 
              value={techNotes}
              onChange={e => setTechNotes(e.target.value)}
              placeholder="Add findings..."
              style={{ width: '100%', height: '80px', background: 'transparent', border: 'none', color: '#1e293b', fontSize: '12px', resize: 'none', outline: 'none', fontWeight: 800 }}
            />
          </div>
        </div>

        {/* CENTER MAIN VIEWPORT */}
        <div style={{ flex: 1, position: 'relative', background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
           <div style={{ flex: 1, padding: '0px', display: 'flex', flexDirection: 'column' }}>
              {uploadedFiles.length > 0 ? (
                <div style={{ 
                  width: '100%', 
                  height: '100%', 
                  display: 'grid', 
                  gridTemplateColumns: layoutMode === '2x2' ? '1fr 1fr' : '1fr',
                  gridTemplateRows: layoutMode === '2x2' ? '1fr 1fr' : '1fr',
                  gap: '10px'
                }}>
                  {[...Array(layoutMode === '2x2' ? 4 : 1)].map((_, idx) => (
                    <div key={idx} style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '1px solid #334155', background: '#000' }}>
                      <AdvancedDicomViewer 
                        key={`${activeAssetIndex}_${idx}`} 
                        engineId={`tech-engine-${idx}`}
                        viewportId={`tech-viewport-${idx}`}
                        files={uploadedFiles[(activeAssetIndex + idx) % uploadedFiles.length]?.rawFiles} 
                        onMetadata={idx === 0 ? setActiveMetadata : null}
                        isSynced={isSyncEnabled}
                        onKeyImageToggle={toggleKeyImage}
                        keyImages={keyImages}
                        activeTool={activeTool}
                        isCine={cineEnabled}
                      />
                      
                      {/* VIEWPORT HUD */}
                      <div style={{ position: 'absolute', top: '15px', left: '15px', display: 'flex', flexDirection: 'column', gap: '5px', zIndex: 10 }}>
                        <div style={{ background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: '6px', fontSize: '9px', color: '#94a3b8', fontWeight: 950, letterSpacing: '1px', border: '1px solid rgba(255,255,255,0.1)' }}>
                           {uploadedFiles[(activeAssetIndex + idx) % uploadedFiles.length]?.name.toUpperCase() || 'NO_SIGNAL'}
                        </div>
                        {isSyncEnabled && <div style={{ background: 'rgba(16, 185, 129, 0.9)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '8px', fontWeight: 950 }}>🔗 SYNCED</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div 
                  onClick={() => document.getElementById('tech-study-up').click()}
                  style={{ 
                    height: '100%', 
                    margin: '20px',
                    background: 'white',
                    borderRadius: '24px',
                    border: '2px dashed #cbd5e1',
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#0f52ba';
                    e.currentTarget.style.background = '#f0f7ff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.background = 'white';
                  }}
                >
                  <div style={{ 
                    width: '200px', 
                    height: '200px', 
                    background: '#f8fafc', 
                    borderRadius: '50%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    marginBottom: '30px',
                    boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.02)',
                    fontSize: '80px'
                  }}>
                    {MODALITY_ICONS[activeStudy?.modality] || '🖥️'}
                  </div>
                  
                  <div style={{ textAlign: 'center', zIndex: 1 }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 950, color: '#1e293b', marginBottom: '10px', letterSpacing: '-1px' }}>Initialize Acquisition</h2>
                    <p style={{ color: '#64748b', fontSize: '13px', fontWeight: 600, maxWidth: '300px', margin: '0 auto 25px' }}>
                      Please select or drag and drop DICOM files or a ZIP study to begin processing for {activeStudy?.patientName}.
                    </p>
                    
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                      <div style={{ background: '#0f52ba', color: 'white', padding: '12px 25px', borderRadius: '12px', fontSize: '11px', fontWeight: 950, letterSpacing: '1px', boxShadow: '0 4px 15px rgba(15, 82, 186, 0.2)' }}>
                        BROWSE FILES
                      </div>
                      <div style={{ background: 'white', color: '#64748b', padding: '12px 25px', borderRadius: '12px', fontSize: '11px', fontWeight: 950, border: '1px solid #e2e8f0' }}>
                        DRAG & DROP
                      </div>
                    </div>
                  </div>

                  <div style={{ position: 'absolute', bottom: '30px', color: '#94a3b8', fontSize: '9px', fontWeight: 950, letterSpacing: '2px', textTransform: 'uppercase' }}>
                    [ AWAITING_SECURE_SIGNAL ]
                  </div>
                </div>
              )}
           </div>
        </div>


      </div>

      <style>{`
        .toolbar-btn {
          width: 42px;
          height: 42px;
          background: #1e1e2d;
          border: 1px solid #2a2a3d;
          border-radius: 10px;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: 0.2s;
          font-size: 18px;
        }
        .toolbar-btn.light {
          background: #f8fafc;
          border-color: #e2e8f0;
          color: #1e293b;
        }
        .toolbar-btn.light:hover {
          background: #f1f5f9;
          border-color: #0f52ba;
        }
        .toolbar-btn.light.active {
          background: #0f52ba;
          border-color: #3b82f6;
          color: white;
          box-shadow: 0 4px 12px rgba(15, 82, 186, 0.2);
        }
        .dicom-loader {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(15, 82, 186, 0.1);
          border-top: 3px solid #0f52ba;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  return (
    <div className="page-wrapper" style={{ padding: 0, background: currentView === 'QUEUE' ? '#fcfdfe' : '#f8fafc' }}>
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
