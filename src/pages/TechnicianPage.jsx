import { useState, useMemo, useEffect, useCallback, useRef, useContext } from 'react';
import JSZip from 'jszip';
import dicomParser from 'dicom-parser';
import apiClient from '../api/apiClient';
import { AuthContext } from '../auth/AuthContext';
import AdvancedDicomViewer from '../components/AdvancedDicomViewer';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { DicomCache } from '../utils/DicomCache';
import { dicomOptimizer } from '../utils/DicomPerformanceOptimizer';
import '../styles/global.css';
import '../styles/TechnicianPage.css';

const MODALITY_ICONS = {
  'X-RAY': 'XR',
  'MRI': 'MR',
  'CT': 'CT',
  'ULTRASOUND': 'US',
  'DEXA': 'DX',
  'MAMMOGRAPHY': 'MG'
};

const PRIORITY_META = {
  'STAT': { color: '#ef4444', label: 'EMERGENCY', bg: '#fee2e2' },
  'URGENT': { color: '#f59e0b', label: 'URGENT', bg: '#fef3c7' },
  'ROUTINE': { color: '#3b82f6', label: 'ROUTINE', bg: '#dbeafe' }
};

const TODAY = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format in local time

export default function TechnicianPage() {
  const { activeCenter } = useContext(AuthContext);
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentView, setCurrentView] = useState('QUEUE'); // 'QUEUE' or 'WORKSPACE'
  const [hubTab, setHubTab] = useState('ACTIVE'); // 'ACTIVE' or 'ARCHIVE'
  const [activeStudy, setActiveStudy] = useState(null);
  const [activeAssetIndex, setActiveAssetIndex] = useState(0);
  const [isDicomImage, setIsDicomImage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ modality: 'ALL', priority: 'ALL', clinicalStatus: 'ALL' });
  const [selectedDoctor, setSelectedDoctor] = useState('ALL');
  const [doctors, setDoctors] = useState([]);
  
  // Workspace specific states
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [currentSlice, setCurrentSlice] = useState(1);
  const [techNotes, setTechNotes] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewAppointment, setPreviewAppointment] = useState(null);
  const [previewReport, setPreviewReport] = useState({ mode: 'Narrative Editor', text: '', impression: '', isFinalized: false });

  // Pagination & Archive Filtering
  const [archivePage, setArchivePage] = useState(1);
  const [archiveFilterMode, setArchiveFilterMode] = useState('ALL'); // 'ALL' or 'RANGE'
  const [archiveDateRange, setArchiveDateRange] = useState({ start: TODAY, end: TODAY });
  const itemsPerPage = 5;
  const [sortConfig, setSortConfig] = useState({ key: 'dateTime', direction: 'asc' });

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
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



  // New state for progressive loading
  const [loadingProgress, setLoadingProgress] = useState({ stage: '', current: 0, total: 0 });
  const [processingStatus, setProcessingStatus] = useState('');

  // --- API SYNC ---
  const fetchWorklist = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch today's missions for the main bay, and past missions if in archive
      const res = await apiClient.get('/appointments');
      
      // Sort ASCENDING for correct sequential token number calculation
      const sortedData = res.data.sort((a, b) => new Date(a.dateTime || 0).getTime() - new Date(b.dateTime || 0).getTime());
      const dailyCounters = {};

      const worklist = sortedData.map(a => {
        const studyDate = a.dateTime ? new Date(a.dateTime).toLocaleDateString('en-CA') : null;
        const dateKey = studyDate || TODAY;
        dailyCounters[dateKey] = (dailyCounters[dateKey] || 0) + 1;

        return {
          ...a,
          id: a.displayId,
          priority: a.type === 'EMERGENCY' ? 'STAT' : 'ROUTINE',
          isToday: studyDate === TODAY,
          // Prefer persisted server-side token; fall back to calculated for legacy records
          tokenNo: a.dailyTokenNumber ?? dailyCounters[dateKey]
        };
      });
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

  const fetchDoctors = useCallback(async () => {
    try {
      const res = await apiClient.get('/personnel');
      const docList = (res.data || []).map(p => ({
        id: p.userId,
        name: p.fullName || 'UNKNOWN_STAFF',
        roles: (p.roles || []).map(r => String(r).toLowerCase())
      })).filter(p => p.roles.some(r => r.includes('doctor')));
      setDoctors(docList);
    } catch (err) {
      console.error('[TECH] Failed to fetch doctors', err);
    }
  }, []);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  const handleStatusUpdate = async (id, newStatus) => {
    try {
      await apiClient.patch(`/appointments/${id}/status`, `"${newStatus}"`, {
        headers: { 'Content-Type': 'application/json' }
      });
      fetchWorklist();
    } catch (err) {
      console.error('[TECH] Status transition failed', err);
      alert('Error: Failed to update status.');
    }
  };

  // --- DERIVED DATA ---
  const filteredStudies = useMemo(() => {
    return studies.filter(s => {
      const matchesSearch = (s.patientName?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || (s.id?.toLowerCase() || '').includes(searchQuery.toLowerCase());
      const matchesModality = filters.modality === 'ALL' || s.modality === filters.modality;
      
      const status = s.status?.toLowerCase();
      const matchesPriority = filters.priority === 'ALL' || s.priority === filters.priority;
      const matchesStatus = filters.clinicalStatus === 'ALL' || status === filters.clinicalStatus.toLowerCase();
      const matchesDoctor = selectedDoctor === 'ALL' || s.doctorId === selectedDoctor || s.doctor === doctors.find(d => d.id === selectedDoctor)?.name;

      if (hubTab === 'ACTIVE') {
        return matchesDoctor && matchesSearch && matchesModality && matchesPriority && matchesStatus && s.isToday && ['scheduled', 'confirmed', 'in_progress', 'booked', 'scanned', 'reporting', 'reported', 'completed'].includes(status);
      } else {
        const studyDate = s.dateTime ? s.dateTime.split('T')[0] : null;
        const matchesDate = archiveFilterMode === 'ALL' || (studyDate && studyDate >= archiveDateRange.start && studyDate <= archiveDateRange.end);
        return matchesDoctor && matchesSearch && matchesModality && matchesPriority && matchesStatus && matchesDate && (['reported', 'completed'].includes(status) || !s.isToday);
      }
    });
  }, [studies, searchQuery, filters, hubTab, TODAY, archiveFilterMode, archiveDateRange, selectedDoctor]);

  const sortedStudies = useMemo(() => {
    const sortableItems = [...filteredStudies];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (sortConfig.key === 'dateTime') {
          aValue = new Date(aValue || 0).getTime();
          bValue = new Date(bValue || 0).getTime();
        } else if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = (bValue || '').toLowerCase();
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredStudies, sortConfig]);

  const paginatedStudies = useMemo(() => {
    if (hubTab === 'ACTIVE') return sortedStudies;
    const start = (archivePage - 1) * itemsPerPage;
    return sortedStudies.slice(start, start + itemsPerPage);
  }, [sortedStudies, hubTab, archivePage]);

  const totalPages = Math.ceil(filteredStudies.length / itemsPerPage);

  useEffect(() => {
    setArchivePage(1);
  }, [searchQuery, filters, hubTab, archiveFilterMode, archiveDateRange]);

  const stats = {
    total: studies.filter(s => s.isToday && ['scheduled', 'confirmed', 'in_progress', 'booked', 'scanned', 'reporting', 'reported', 'completed'].includes(s.status?.toLowerCase())).length,
    inProgress: studies.filter(s => s.isToday && s.status?.toLowerCase() === 'in_progress').length,
    pending: studies.filter(s => s.isToday && s.status?.toLowerCase() === 'confirmed').length,
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
    if (!asset || !asset.needsHydration || !asset.remoteUrl || asset.rawFiles?.length > 0) return;

    setLoading(true);
    setProcessingStatus('Initializing DICOM processor...');
    
    try {
      // TACTICAL CACHE CHECK
      console.log(`[TECH_LOAD] Checking persistent cache for asset: ${asset.id}`);
      const cachedData = await DicomCache.get(asset.id);
      
      if (cachedData && cachedData.series?.length > 0) {
        console.log(`[TECH_LOAD] Cache HIT for ${asset.id}. Restoring ${cachedData.series.length} series.`);
        setProcessingStatus('Restoring from cache...');
        
        const hydratedFromCache = cachedData.series.map(s => ({
          ...asset,
          name: s.name,
          rawFiles: s.rawFiles,
          seriesUID: s.seriesUID,
          modality: s.modality || asset.modality,
          patientName: s.patientName || asset.patientName,
          metadata: s.metadata,
          needsHydration: false
        }));

        setUploadedFiles(prev => {
          const newFiles = [...prev];
          newFiles.splice(index, 1, ...hydratedFromCache);
          return newFiles;
        });
        setIsDicomImage(true);
        setLoading(false);
        setProcessingStatus('');
        return;
      }

      console.log(`[TECH_LOAD] Cache MISS. Initializing optimized hydration for asset: ${asset.name}`);
      setProcessingStatus('Downloading study data...');
      
      let response;
      try {
        response = await fetch(asset.remoteUrl);
        if (!response.ok) throw new Error(`NETWORK_FAILURE: HTTP_${response.status} when fetching asset stream.`);
      } catch (fetchError) {
        // Check for CORS-specific errors and try API proxy fallback
        if (fetchError.message.includes('CORS') || 
            fetchError.message.includes('Access-Control-Allow-Origin') ||
            (fetchError.name === 'TypeError' && fetchError.message.includes('Failed to fetch'))) {
          
          console.log(`[TECH_LOAD] CORS error detected, trying API proxy fallback...`);
          try {
            const proxyResponse = await apiClient.get(`/Study/proxy-asset`, {
              params: { url: asset.remoteUrl },
              responseType: 'blob'
            });
            
            if (proxyResponse.data && proxyResponse.status === 200) {
              console.log(`[TECH_LOAD] ✅ API proxy successful`);
              // Convert axios response to fetch-like response
              response = {
                ok: true,
                status: proxyResponse.status,
                blob: async () => proxyResponse.data,
                headers: new Headers(proxyResponse.headers)
              };
            } else {
              throw new Error(`CORS_ERROR: Cross-origin request blocked and API proxy failed. ${fetchError.message}`);
            }
          } catch (proxyError) {
            console.warn(`[TECH_LOAD] API proxy failed:`, proxyError);
            throw new Error(`CORS_ERROR: Cross-origin request blocked. The server needs to be configured to allow requests from this domain. ${fetchError.message}`);
          }
        } else {
          throw fetchError;
        }
      }

      const blob = await response.blob();
      console.log(`[TECH_LOAD] Binary stream received. Size: ${(blob.size / (1024*1024)).toFixed(2)} MB. Starting optimized processing...`);
      
      // Use optimized processor with progress tracking
      const processingResult = await dicomOptimizer.processZipFileOptimized(
        blob,
        (progress) => {
          setLoadingProgress(progress);
          setProcessingStatus(`${progress.stage}: ${progress.current}/${progress.total} files${progress.seriesCount ? ` (${progress.seriesCount} series found)` : ''}`);
        },
        (seriesInfo) => {
          console.log(`[TECH_LOAD] New series discovered: ${seriesInfo.seriesDesc}`);
        }
      );

      console.log(`[TECH_LOAD] Processing result:`, {
        type: typeof processingResult,
        hasSeries: !!processingResult?.series,
        seriesCount: processingResult?.series?.length,
        stats: processingResult?.stats
      });

      // Extract series array from result
      const classifiedAssets = processingResult?.series || [];

      // Validate that classifiedAssets is an array
      if (!Array.isArray(classifiedAssets)) {
        console.error(`[TECH_LOAD] Invalid processing result - expected array, got:`, typeof classifiedAssets);
        throw new Error(`PROCESSING_ERROR: DICOM processor returned invalid result (${typeof classifiedAssets} instead of array)`);
      }

      if (classifiedAssets.length === 0) {
        console.warn(`[TECH_LOAD] No valid DICOM series found in the archive`);
        
        // Check if there were corrupted files
        if (processingResult?.stats?.corruptedFiles > 0) {
          throw new Error(`NO_DICOM_SERIES: Found ${processingResult.stats.corruptedFiles} corrupted files. No valid DICOM images could be extracted.`);
        }
        
        throw new Error('NO_DICOM_SERIES: No valid DICOM image series found in the uploaded file');
      }

      const finalAssets = classifiedAssets.map(series => ({
        ...asset,
        name: `${series.patientName} - ${series.seriesDesc}`,
        rawFiles: series.files,
        needsHydration: false,
        seriesUID: series.seriesUID,
        modality: series.modality,
        metadata: series.metadata || {
          patientName: series.patientName,
          modality: series.modality,
          seriesDescription: series.seriesDesc,
          studyDate: series.studyDate
        }
      }));

      console.log(`[TECH_LOAD] Optimized processing complete. Discovered ${finalAssets.length} valid diagnostic series.`);
      
      // Log processing statistics
      if (processingResult?.stats) {
        console.log(`[TECH_LOAD] Processing statistics:`, processingResult.stats);
      }

      // TACTICAL CACHE STORAGE
      if (finalAssets.length > 0) {
        setProcessingStatus('Caching for future use...');
        const cachePayload = {
          ...asset,
          series: finalAssets.map(ca => ({ 
            name: ca.name, 
            rawFiles: ca.rawFiles, 
            seriesUID: ca.seriesUID,
            modality: ca.modality,
            patientName: ca.patientName,
            seriesDesc: ca.seriesDesc,
            metadata: ca.metadata
          }))
        };
        await DicomCache.set(asset.id, cachePayload);
        console.log(`[TECH_LOAD] Asset ${asset.id} persisted to persistent cache.`);
      }

      setUploadedFiles(prev => {
        const newFiles = [...prev];
        if (finalAssets.length > 0) {
          newFiles.splice(index, 1, ...finalAssets);
        } else {
          console.warn('[TECH_LOAD] No valid DICOM series found in ZIP container.');
          newFiles[index] = { ...asset, needsHydration: false, rawFiles: [] };
        }
        return newFiles;
      });
      setIsDicomImage(true);
    } catch (err) {
      console.error('[TECH_LOAD] Optimized hydration failure', err);
      setProcessingStatus(`Error: ${err.message}`);
      
      // Provide user-friendly error messages based on error type
      let userMessage = 'Failed to load study: ';
      
      if (err.message.includes('CORS_ERROR')) {
        userMessage += 'Server configuration issue detected. The DICOM storage server needs to allow cross-origin requests. Please contact your system administrator to configure CORS settings for the Azure Blob Storage.';
      } else if (err.message.includes('NETWORK_ERROR') || err.message.includes('Failed to fetch')) {
        userMessage += 'Unable to download study data. Please check your internet connection and try again.';
      } else if (err.message.includes('PROCESSING_ERROR')) {
        userMessage += 'Failed to process DICOM files. The file may be corrupted or in an unsupported format.';
      } else if (err.message.includes('NO_DICOM_SERIES')) {
        userMessage += 'No valid DICOM image series found in the uploaded file. Please verify the file contains valid DICOM images.';
      } else {
        userMessage += err.message;
      }
      
      console.error('[TECH_LOAD] Error details:', {
        message: err.message,
        stack: err.stack,
        asset: {
          id: asset?.id,
          name: asset?.name,
          remoteUrl: asset?.remoteUrl
        }
      });
      
      alert(userMessage);
    } finally {
      setLoading(false);
      setProcessingStatus('');
      setLoadingProgress({ stage: '', current: 0, total: 0 });
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
      setProcessingStatus('Initializing optimized ZIP processor...');
      
      try {
        // Use optimized processor for local file uploads
        const processingResult = await dicomOptimizer.processZipFileOptimized(
          file,
          (progress) => {
            setLoadingProgress(progress);
            setProcessingStatus(`${progress.stage}: ${progress.current}/${progress.total} files${progress.seriesCount ? ` (${progress.seriesCount} series found)` : ''}`);
          },
          (seriesInfo) => {
            console.log(`[TECH] New series discovered: ${seriesInfo.seriesDesc}`);
          }
        );

        console.log(`[TECH] Processing result:`, {
          type: typeof processingResult,
          hasSeries: !!processingResult?.series,
          seriesCount: processingResult?.series?.length,
          stats: processingResult?.stats
        });

        // Extract series array from result
        const classifiedAssets = processingResult?.series || [];

        // Validate that classifiedAssets is an array
        if (!Array.isArray(classifiedAssets)) {
          console.error(`[TECH] Invalid processing result - expected array, got:`, typeof classifiedAssets);
          throw new Error(`PROCESSING_ERROR: DICOM processor returned invalid result (${typeof classifiedAssets} instead of array)`);
        }

        if (classifiedAssets.length === 0) {
          console.warn(`[TECH] No valid DICOM series found in the archive`);
          
          // Check if there were corrupted files
          if (processingResult?.stats?.corruptedFiles > 0) {
            throw new Error(`NO_DICOM_SERIES: Found ${processingResult.stats.corruptedFiles} corrupted files. No valid DICOM images could be extracted.`);
          }
          
          throw new Error('NO_DICOM_SERIES: No valid DICOM image series found in the uploaded file');
        }

        // Background persist the zip file
        persistStudyAsset(file);

        const newAssets = classifiedAssets.map(series => ({
          name: `${series.patientName} - ${series.seriesDesc}`,
          type: 'DICOM SERIES',
          size: `${series.files.length} IMAGES`,
          time: new Date().toLocaleTimeString(),
          previewUrl: null,
          isZip: false,
          rawFiles: series.files,
          seriesUID: series.seriesUID,
          modality: series.modality,
          metadata: series.metadata || {
            patientName: series.patientName,
            modality: series.modality,
            seriesDescription: series.seriesDesc,
            studyDate: series.studyDate
          }
        }));

        if (newAssets.length > 0) {
          setUploadedFiles(prev => [...prev, ...newAssets]);
          setActiveAssetIndex(0); // Auto-focus first extracted asset stack
          setIsDicomImage(true);
          
          // Log processing statistics
          if (processingResult?.stats) {
            console.log(`[TECH] Processing statistics:`, processingResult.stats);
            
            // Show warning if corrupted files were found
            if (processingResult.stats.corruptedFiles > 0) {
              console.warn(`[TECH] WARNING: Eliminated ${processingResult.stats.corruptedFiles} corrupted files from upload`);
              setTimeout(() => {
                alert(`Study loaded successfully!\n\nSUCCESS: Valid files: ${processingResult.stats.validFiles}\nWARNING: Corrupted files eliminated: ${processingResult.stats.corruptedFiles}\n\nCorrupted files have been automatically removed to ensure optimal viewing.`);
              }, 500);
            }
          }
        } else {
          alert('No valid DICOM image series found in the ZIP archive.');
        }
      } catch (err) {
        console.error('[TECH] Optimized ZIP extraction failed', err);
        setProcessingStatus(`Error: ${err.message}`);
        
        // Provide user-friendly error messages
        let userMessage = 'Failed to extract ZIP archive: ';
        if (err.message.includes('NO_DICOM_SERIES')) {
          userMessage = err.message;
        } else if (err.message.includes('PROCESSING_ERROR')) {
          userMessage += 'The DICOM processor encountered an error. Please verify the file format.';
        } else {
          userMessage += err.message;
        }
        
        alert(userMessage);
      } finally {
        setLoading(false);
        setProcessingStatus('');
        setLoadingProgress({ stage: '', current: 0, total: 0 });
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
  const handlePreviewPrint = async (c) => {
    try {
      setLoading(true);
      setPreviewAppointment(c);
      
      const reportRes = await apiClient.get(`/Reporting/report/${c.id || c.appointmentId}`).catch(() => null);
      if (reportRes?.data?.success && reportRes.data.data) {
        const r = reportRes.data.data;
        setPreviewReport({
          mode: r.mode || 'Narrative Editor',
          text: r.findings || '',
          data: r.structuredData,
          impression: r.impression,
          advice: r.advice,
          isFinalized: r.isFinalized || c.status?.toLowerCase() === 'reported' || c.status?.toLowerCase() === 'completed'
        });
      } else {
        setPreviewReport({ mode: 'Narrative Editor', text: '', impression: '', isFinalized: false });
      }
      setIsPreviewOpen(true);
    } catch (err) {
      console.error('[TECH] Preview prep failed', err);
    } finally {
      setLoading(false);
    }
  };

  const renderQueue = () => (
    <div className="board-view-container" style={{ background: '#fcfdfe', minHeight: '100vh' }}>
      <div className="board-header" style={{ padding: '12px 30px', background: 'white', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div>
           <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '5px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0a1628', letterSpacing: '-0.5px', margin: 0 }}>Scanning Worklist</h1>
           </div>
           <p style={{ fontSize: '12px', color: '#6b7280', marginLeft: '2px' }}>Manage today's studies and upload DICOM files</p>
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
              padding: '10px 22px', borderRadius: '8px', border: 'none', fontSize: '13px',
              fontWeight: 600, background: hubTab === 'ACTIVE' ? 'white' : 'transparent',
              color: hubTab === 'ACTIVE' ? '#1d4ed8' : '#6b7280', cursor: 'pointer',
              transition: '0.2s', boxShadow: hubTab === 'ACTIVE' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
            }}>Active Queue</button>
            <button onClick={() => setHubTab('ARCHIVE')} style={{
              padding: '10px 22px', borderRadius: '8px', border: 'none', fontSize: '13px',
              fontWeight: 600, background: hubTab === 'ARCHIVE' ? 'white' : 'transparent',
              color: hubTab === 'ARCHIVE' ? '#1d4ed8' : '#6b7280', cursor: 'pointer',
              transition: '0.2s', boxShadow: hubTab === 'ARCHIVE' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
            }}>Archive</button>
        </div>
      </div>

      <div className="board-padding">
        {hubTab === 'ACTIVE' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '15px' }}>
            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }}>Today's Studies</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                 <span style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>{stats.total}</span>
                 <span style={{ fontSize: '11px', fontWeight: 500, color: '#1d4ed8' }}>Studies</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }}>In Progress</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                 <span style={{ fontSize: '24px', fontWeight: 700, color: '#f59e0b' }}>{stats.inProgress}</span>
                 <span style={{ fontSize: '11px', fontWeight: 500, color: '#f59e0b' }}>Scanning</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }}>Arrived</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                 <span style={{ fontSize: '24px', fontWeight: 700, color: '#2ecc71' }}>{stats.pending}</span>
                 <span style={{ fontSize: '11px', fontWeight: 500, color: '#2ecc71' }}>Ready</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }}>Scheduled</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                 <span style={{ fontSize: '24px', fontWeight: 700, color: '#1d4ed8' }}>{stats.expected}</span>
                 <span style={{ fontSize: '11px', fontWeight: 500, color: '#1d4ed8' }}>Pending</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '15px' }}>
            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }}>Total Archive</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                 <span style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>{stats.archiveTotal}</span>
                 <span style={{ fontSize: '11px', fontWeight: 500, color: '#6366f1' }}>Studies</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }}>Reported</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                 <span style={{ fontSize: '24px', fontWeight: 700, color: '#059669' }}>{stats.archiveReported}</span>
                 <span style={{ fontSize: '11px', fontWeight: 500, color: '#059669' }}>Reports</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }}>Completed</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                 <span style={{ fontSize: '24px', fontWeight: 700, color: '#1d4ed8' }}>{stats.archiveCompleted}</span>
                 <span style={{ fontSize: '11px', fontWeight: 500, color: '#1d4ed8' }}>Closed</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }}>Completion Rate</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                 <span style={{ fontSize: '24px', fontWeight: 700, color: '#6366f1' }}>{stats.archiveEfficiency}%</span>
                 <span style={{ fontSize: '11px', fontWeight: 500, color: '#6366f1' }}>Rate</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ background: 'white', padding: '15px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input 
                type="text" 
                placeholder={hubTab === 'ACTIVE' ? "Search patients or IDs..." : "Search archive..."}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ 
                  width: '100%', padding: '12px 12px 12px 45px', borderRadius: '10px', 
                  border: searchQuery.startsWith('ID:') ? '2px solid #0f52ba' : '1px solid #e2e8f0', 
                  fontSize: '12px', fontWeight: 700, outline: 'none',
                  background: searchQuery.startsWith('ID:') ? '#f0f7ff' : 'white'
                }}
              />
              {searchQuery.startsWith('ID:') && (
                <span style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', background: '#0f52ba', color: 'white', fontSize: '8px', fontWeight: 900, padding: '2px 6px', borderRadius: '4px' }}>SCANNER MODE</span>
              )}
            </div>
          </div>

          {hubTab === 'ARCHIVE' && (
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

          <select value={selectedDoctor} onChange={e => setSelectedDoctor(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 500, background: 'white', outline: 'none' }}>
            <option value="ALL">All Doctors</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          <select value={filters.modality} onChange={e => setFilters({...filters, modality: e.target.value})} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 500, background: 'white', outline: 'none' }}>
            <option value="ALL">All Modalities</option>
            {Object.keys(MODALITY_ICONS).map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select value={filters.priority} onChange={e => setFilters({...filters, priority: e.target.value})} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 500, background: 'white', outline: 'none' }}>
            <option value="ALL">All Priorities</option>
            <option value="STAT">Emergency</option>
            <option value="ROUTINE">Routine</option>
          </select>

          <select value={filters.clinicalStatus} onChange={e => setFilters({...filters, clinicalStatus: e.target.value})} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 500, background: 'white', outline: 'none' }}>
            <option value="ALL">All Statuses</option>
            {hubTab === 'ACTIVE' ? (
              <>
                <option value="CONFIRMED">Awaiting Scan</option>
                <option value="IN_PROGRESS">Scanning</option>
                <option value="SCANNED">Ready for Doctor</option>
                <option value="REPORTING">Under Review</option>
                <option value="REPORTED">Finalized</option>
                <option value="COMPLETED">Archived</option>
              </>
            ) : (
              <>
                <option value="REPORTED">Finalized</option>
                <option value="COMPLETED">Completed</option>
              </>
            )}
          </select>

          <button className="gamified-btn" onClick={fetchWorklist} style={{ padding: '10px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>Refresh</button>
        </div>

        <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <tr>
                <th onClick={() => handleSort('patientName')} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6b7280', cursor: 'pointer', letterSpacing: '0.3px' }}>
                  Patient
                </th>
                <th onClick={() => handleSort('tokenNo')} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6b7280', cursor: 'pointer', letterSpacing: '0.3px' }}>
                  Token
                </th>
                <th onClick={() => handleSort('service')} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6b7280', cursor: 'pointer', letterSpacing: '0.3px' }}>
                  Service
                </th>
                <th onClick={() => handleSort('dateTime')} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6b7280', cursor: 'pointer', letterSpacing: '0.3px' }}>
                  Date
                </th>
                <th onClick={() => handleSort('doctorId')} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6b7280', cursor: 'pointer', letterSpacing: '0.3px' }}>
                  Doctor
                </th>
                <th onClick={() => handleSort('modality')} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6b7280', cursor: 'pointer', letterSpacing: '0.3px' }}>
                  Modality
                </th>
                <th onClick={() => handleSort('status')} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6b7280', cursor: 'pointer', letterSpacing: '0.3px' }}>
                  Status {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: '#6b7280', letterSpacing: '0.3px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedStudies.map(study => {
                const priority = PRIORITY_META[study.priority] || PRIORITY_META.ROUTINE;
                const status = study.status?.toLowerCase();
                const isArrived = ['confirmed', 'in_progress', 'scanned', 'reporting', 'reported', 'completed'].includes(status);
                const isExpected = ['scheduled', 'booked'].includes(status) && study.isToday;
                const isDone = ['scanned', 'reporting', 'reported', 'completed'].includes(status);
                
                return (
                  <tr key={study.appointmentId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 15px' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#f8fafc', color: '#0f52ba', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '14px', border: '1px solid #e2e8f0' }}>
                             {study.patientName.charAt(0)}
                          </div>
                          <div>
                             <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '12px' }}>{study.patientName.toUpperCase()}</div>
                             <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700 }}>{study.id} | {study.patientGender} | {study.patientAge}Y</div>
                          </div>
                       </div>
                    </td>
                    <td style={{ padding: '8px 15px' }}>
                       <div style={{ 
                         width: '38px', height: '38px', borderRadius: '10px', 
                         background: '#f0f7ff', border: '1px solid #dbeafe', 
                         display: 'flex', alignItems: 'center', justifyContent: 'center',
                         fontSize: '15px', fontWeight: 950, color: '#0f52ba'
                       }}>
                          {study.tokenNo || '-'}
                       </div>
                    </td>
                    <td style={{ padding: '8px 15px' }}>
                       <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{study.service}</span>
                          <span style={{ fontSize: '8px', fontWeight: 950, color: priority.color, background: priority.bg, padding: '1px 6px', borderRadius: '4px', alignSelf: 'flex-start', marginTop: '2px' }}>
                             {priority.label}
                          </span>
                       </div>
                    </td>
                    <td style={{ padding: '8px 15px' }}>
                        <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '12px' }}>{study.dateTime ? new Date(study.dateTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : 'N/A'}</div>
                        <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 800, marginTop: '2px' }}>{study.appointmentTime || '09:00 AM'}</div>
                    </td>
                    <td style={{ padding: '8px 15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#64748b', fontWeight: 800, border: '1px solid #e2e8f0', flexShrink: 0 }}>DR</div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>
                                {study.doctor || doctors.find(d => d.id === study.doctorId)?.name || 'Unassigned'}
                            </span>
                        </div>
                    </td>
                    <td style={{ padding: '8px 15px' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f0f3fd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 950, color: '#0f52ba', border: '1px solid #dbeafe' }}>
                             {study.modality.slice(0, 2)}
                          </div>
                          <span style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b' }}>{study.modality}</span>
                       </div>
                    </td>
                    <td style={{ padding: '8px 15px' }}>
                      <span style={{ 
                        padding: '4px 8px', borderRadius: '8px', fontSize: '9px', fontWeight: 950,
                        background: (status === 'reported' || status === 'completed') ? '#f0fdf4' : isDone ? '#ecfdf5' : isArrived && !isDone ? '#f0f7ff' : isExpected ? '#fefce8' : '#f8fafc',
                        color: (status === 'reported' || status === 'completed') ? '#166534' : isDone ? '#059669' : isArrived && !isDone ? '#0f52ba' : isExpected ? '#854d0e' : '#64748b',
                        border: `1px solid ${(status === 'reported' || status === 'completed') ? '#bbf7d0' : isDone ? '#6ee7b7' : isArrived && !isDone ? '#dbeafe' : isExpected ? '#fef08a' : '#e2e8f0'}`,
                        textTransform: 'uppercase'
                      }}>
                        {status === 'confirmed' ? 'ARRIVED' : status === 'in_progress' ? 'SCANNING' : status === 'scanned' ? 'READY' : status === 'reporting' ? 'REPORTING' : status === 'reported' ? 'FINALIZED' : status === 'completed' ? 'ARCHIVED' : status === 'scheduled' ? 'EXPECTED' : status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '8px 15px', textAlign: 'right' }}>
                      {hubTab === 'ACTIVE' ? (
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>

                          <button 
                            onClick={(e) => { e.stopPropagation(); handlePreviewPrint(study); }}
                            style={{ 
                              padding: '10px', borderRadius: '12px', background: '#fef3c7', color: '#d97706', 
                              border: '1px solid #fde68a', cursor: 'pointer', display: 'flex', 
                              alignItems: 'center', justifyContent: 'center' 
                            }}
                            title="Print Prescription"
                          >RX</button>
                          <button 
                            className="gamified-btn" 
                            disabled={!study.isToday && hubTab !== 'ARCHIVE'}
                            style={{ padding: '8px 20px', fontSize: '10px', borderRadius: '12px', opacity: (study.isToday || hubTab === 'ARCHIVE') ? 1 : 0.4, background: (status === 'reported' || status === 'completed') ? '#16a34a' : '' }} 
                            onClick={() => handleOpenWorkspace(study)}
                          >
                             {(status === 'reported' || status === 'completed') ? 'Review' : isDone ? 'Re-upload' : 'Start Scan'}
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>

                          <button 
                            onClick={() => handlePreviewPrint(study)}
                            style={{ padding: '10px', borderRadius: '12px', border: '1px solid #fde68a', background: '#fef3c7', cursor: 'pointer' }}
                            title="Print Prescription"
                          >RX</button>
                          <button 
                            onClick={() => handlePreviewPrint(study)}
                            style={{ padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}
                            title="Print Dispatch"
                          >PTR</button>
                          <button 
                            className="gamified-btn" 
                            style={{ padding: '10px 20px', borderRadius: '12px', fontSize: '11px' }} 
                            onClick={() => handleOpenWorkspace(study)}
                          >
                            Review
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
                    No studies found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          
          {hubTab === 'ARCHIVE' && totalPages > 1 && (
            <div style={{ padding: '15px 30px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>
                Page <span style={{ color: '#1d4ed8' }}>{archivePage}</span> of <span style={{ color: '#1d4ed8' }}>{totalPages}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setArchivePage(p => Math.max(1, p - 1))}
                  disabled={archivePage === 1}
                  style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', fontSize: '12px', fontWeight: 500, cursor: archivePage === 1 ? 'not-allowed' : 'pointer', opacity: archivePage === 1 ? 0.5 : 1 }}
                >Previous</button>
                <button
                  onClick={() => setArchivePage(p => Math.min(totalPages, p + 1))}
                  disabled={archivePage === totalPages}
                  style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', fontSize: '12px', fontWeight: 500, cursor: archivePage === totalPages ? 'not-allowed' : 'pointer', opacity: archivePage === totalPages ? 0.5 : 1 }}
                >Next</button>
              </div>
            </div>
          )}
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
        <button onClick={() => setCurrentView('QUEUE')} className="toolbar-btn light" style={{ width: 'auto', padding: '0 12px', fontSize: '12px', fontWeight: 600, height: '30px' }}>
          ← Back
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
          <span>Import DICOM</span>
        </button>
        <input id="tech-study-up" type="file" style={{ display: 'none' }} accept=".dcm,.zip" onChange={handleFileChange} />
        
        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 8px' }}></div>

        {/* VIEWER TOOLS */}
        {[
          { id: 'WindowLevel', label: 'W/L' },
          { id: 'Zoom', label: 'Zoom' },
          { id: 'Pan', label: 'Pan' },
          { id: 'StackScroll', label: 'Scroll' },
          { id: 'Length', label: 'Length' },
          { id: 'Angle', label: 'Angle' },
          { id: 'ArrowAnnotate', label: 'Annotate' }
        ].map(t => (
          <button 
            key={t.id}
            onClick={() => setActiveTool(t.id)}
            className={`toolbar-btn light ${activeTool === t.id ? 'active' : ''}`}
            title={t.label}
            style={{ width: 'auto', height: '28px', fontSize: '8px', padding: '0 8px', fontWeight: 950 }}
          >{t.label.toUpperCase()}</button>
        ))}

        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 8px' }}></div>

        {/* SPECIAL TOOLS */}
        <button onClick={() => setCineEnabled(!cineEnabled)} className={`toolbar-btn light ${cineEnabled ? 'active' : ''}`} title="Cine Loop" style={{ fontSize: '10px', padding: '0 10px', height: '28px', fontWeight: 500 }}>Cine</button>
        <button
          onClick={() => setIsSyncEnabled(!isSyncEnabled)}
          className={`toolbar-btn light ${isSyncEnabled ? 'active' : ''}`}
          title="Synchronize Viewports"
          style={{ fontSize: '10px', padding: '0 10px', height: '28px', fontWeight: 500 }}
        >
          Sync
        </button>

        <div style={{ flex: 1 }}></div>

        <select 
           value={layoutMode} 
           onChange={e => setLayoutMode(e.target.value)}
           style={{ background: 'white', color: '#1e293b', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 950 }}
        >
           <option value="1x1">1×1</option>
           <option value="2x2">2×2</option>
        </select>
        
        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 8px' }}></div>
        <button onClick={() => toggleKeyImage()} className={`toolbar-btn light ${keyImages.includes(`${activeAssetIndex}_${currentSlice}`) ? 'active' : ''}`} title="Mark Key Image" style={{ width: 'auto', height: '32px', fontSize: '10px', fontWeight: 500, padding: '0 10px' }}>Key</button>
        <button onClick={() => setScreenshotData(true)} className="toolbar-btn light" title="Screenshot" style={{ width: 'auto', height: '32px', fontSize: '10px', fontWeight: 500, padding: '0 10px' }}>Screenshot</button>
        <button onClick={() => { setResetTrigger(t => t + 1); setViewportProps({ invert: false, flipHorizontal: false, flipVertical: false, rotation: 0 }); }} className="toolbar-btn light" title="Reset Viewer" style={{ width: 'auto', height: '32px', fontSize: '10px', fontWeight: 500, padding: '0 10px' }}>Reset</button>
        
        <div style={{ width: '1px', height: '30px', background: '#e2e8f0', margin: '0 10px' }}></div>
        
        <div style={{ flex: 1 }}></div>

        <button 
          onClick={() => { handleStatusUpdate(activeStudy?.appointmentId, 'scanned'); setCurrentView('QUEUE'); }}
          className="gamified-btn" style={{ padding: '10px 25px', borderRadius: '12px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 950 }}
        >Mark as Scanned</button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: '10px', gap: '10px' }}>
        
        {/* LEFT SIDEBAR: STUDY TREE */}
        <div style={{ width: '280px', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '15px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px', display: 'block', textTransform: 'uppercase' }}>Series Library</label>
          
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', marginBottom: '15px', borderLeft: '3px solid #0f52ba', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>{activeStudy?.patientName}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', fontWeight: 500 }}>ID: {activeStudy?.id}</div>
            </div>

            <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '10px', display: 'block' }}>Series ({uploadedFiles.length})</label>
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
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', fontWeight: 400 }}>{f.rawFiles.length} slices</div>
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
          {/* PROGRESS OVERLAY */}
          {loading && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(8px)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              gap: '20px'
            }}>
              <div style={{
                width: '80px',
                height: '80px',
                border: '4px solid rgba(59, 130, 246, 0.2)',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              
              <div style={{ textAlign: 'center', maxWidth: '400px' }}>
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '10px' }}>
                  Processing DICOM data...
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '20px' }}>
                  {processingStatus || 'Initializing...'}
                </div>
                
                {loadingProgress.total > 0 && (
                  <div style={{ width: '300px', margin: '0 auto' }}>
                    <div style={{
                      width: '100%',
                      height: '8px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      marginBottom: '10px'
                    }}>
                      <div style={{
                        width: `${(loadingProgress.current / loadingProgress.total) * 100}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease'
                      }}></div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
                      {loadingProgress.current} / {loadingProgress.total} files processed
                      {loadingProgress.seriesCount && ` • ${loadingProgress.seriesCount} series found`}
                    </div>
                  </div>
                )}
              </div>
              
              <style>{`
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          )}
          
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
                        preParsedMetadata={uploadedFiles[(activeAssetIndex + idx) % uploadedFiles.length]?.metadata}
                        onMetadata={idx === 0 ? setActiveMetadata : null}
                        isSynced={isSyncEnabled}
                        onKeyImageToggle={toggleKeyImage}
                        keyImages={keyImages}
                        activeTool={activeTool}
                        isCine={cineEnabled}
                        onSliceChange={(index, total) => {
                          if (idx === 0) setCurrentSlice(index + 1);
                        }}
                      />
                      
                      {/* VIEWPORT HUD */}
                      <div style={{ position: 'absolute', top: '15px', left: '15px', display: 'flex', flexDirection: 'column', gap: '5px', zIndex: 10 }}>
                        <div style={{ background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: '6px', fontSize: '9px', color: '#94a3b8', fontWeight: 950, letterSpacing: '1px', border: '1px solid rgba(255,255,255,0.1)' }}>
                           {uploadedFiles[(activeAssetIndex + idx) % uploadedFiles.length]?.name || 'No signal'}
                        </div>
                        <div style={{ background: 'rgba(59, 130, 246, 0.9)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', color: 'white', fontWeight: 900, width: 'fit-content' }}>
                          SLICE: {idx === 0 ? currentSlice : '?'} / {uploadedFiles[(activeAssetIndex + idx) % uploadedFiles.length]?.rawFiles?.length || 0}
                        </div>
                        {isSyncEnabled && <div style={{ background: 'rgba(16, 185, 129, 0.9)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 500 }}>Synced</div>}
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
                    <div style={{ fontSize: '32px', fontWeight: 950, color: '#0f52ba', opacity: 0.2 }}>
                      {activeStudy?.modality.slice(0, 2)}
                    </div>
                  </div>
                  
                  <div style={{ textAlign: 'center', zIndex: 1 }}>
                    <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', marginBottom: '10px', letterSpacing: '-0.5px' }}>Upload DICOM Study</h2>
                    <p style={{ color: '#64748b', fontSize: '13px', fontWeight: 600, maxWidth: '300px', margin: '0 auto 25px' }}>
                      Please select or drag and drop DICOM files or a ZIP study to begin processing for {activeStudy?.patientName}.
                    </p>
                    
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                      <div style={{ background: '#1d4ed8', color: 'white', padding: '11px 24px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, boxShadow: '0 4px 12px rgba(29,78,216,0.2)' }}>
                        Browse Files
                      </div>
                      <div style={{ background: 'white', color: '#6b7280', padding: '11px 24px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: '1px solid #e2e8f0' }}>
                        Drag & Drop
                      </div>
                    </div>
                  </div>

                  <div style={{ position: 'absolute', bottom: '30px', color: '#94a3b8', fontSize: '12px', fontWeight: 400 }}>
                    Supports .dcm and .zip files
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

      
      <ReportPreviewModal 
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        doctorId={previewAppointment?.doctorId}
        appointmentId={previewAppointment?.appointmentId || previewAppointment?.id}
        patientData={previewAppointment}
        reportContent={previewReport}
      />
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
