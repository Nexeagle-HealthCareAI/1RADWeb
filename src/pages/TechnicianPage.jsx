import { useState, useMemo, useEffect, useCallback, useRef, useContext } from 'react';
import JSZip from 'jszip';
import dicomParser from 'dicom-parser';
import apiClient from '../api/apiClient';
import { AuthContext } from '../auth/AuthContext';
import AdvancedDicomViewer from '../components/AdvancedDicomViewer';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { DicomCache } from '../utils/DicomCache';
import { dicomOptimizer } from '../utils/DicomPerformanceOptimizer';
import { assetsFromManifest } from '../utils/dicomManifest';
import { formatPatientAge } from '../utils/patientAge';
import { uploadStudyAssetDirect } from '../utils/azureUpload';
import useTickClock from '../utils/useTickClock';
import { formatElapsed, premisesSeverity, premisesPillStyle } from '../utils/timeTracking';
import { useOverdue } from '../components/OverdueAppointments/OverdueContext';
import { getServiceLines, getUniqueModalities, matchesAnyModality, getReportProgressLabel } from '../utils/appointmentServices';
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
  'STAT':    { color: '#dc2626', label: 'STAT',    bg: '#fee2e2', accent: '#dc2626' },
  'URGENT':  { color: '#d97706', label: 'URGENT',  bg: '#fef3c7', accent: '#d97706' },
  'ROUTINE': { color: '#64748b', label: 'ROUTINE', bg: '#f1f5f9', accent: null }
};

// STAT (0) → URGENT (1) → ROUTINE (2). Mirrors the backend GetAppointmentsQuery
// sort so the queue looks the same wherever it shows up.
const PRIORITY_RANK = { 'STAT': 0, 'URGENT': 1, 'ROUTINE': 2 };

const TODAY = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format in local time

export default function TechnicianPage() {
  const { activeCenter } = useContext(AuthContext);
  // 60s tick keeps the on-premises pill counting up; isOverdue mirrors the bell.
  useTickClock();
  const { isOverdue } = useOverdue();
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentView, setCurrentView] = useState('QUEUE'); // 'QUEUE' or 'WORKSPACE'
  const [hubTab, setHubTab] = useState('ACTIVE'); // 'ACTIVE' or 'ARCHIVE'
  const [activeStudy, setActiveStudy] = useState(null);
  const [activeAssetIndex, setActiveAssetIndex] = useState(0);
  // Multi-service workspace — which AppointmentService line is the
  // operator currently viewing? Drives the modality-aware viewer
  // toolset and filters the series list to only that service's
  // uploads (or, when uploads lack an FK, matches by modality).
  const [activeServiceId, setActiveServiceId] = useState(null);
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

  // File input ref for resetting after upload
  const fileInputRef = useRef(null);

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
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isMobile = windowWidth < 768;

  const [notifModal, setNotifModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const showNotif = (type, title, message) => setNotifModal({ isOpen: true, type, title, message });

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);



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
          // Real priority comes from the API; fall back to EMERGENCY-type for
          // legacy records that pre-date the Priority column.
          priority: a.priority || (a.type === 'EMERGENCY' ? 'STAT' : 'ROUTINE'),
          isToday: studyDate === TODAY,
          // Prefer persisted server-side token; fall back to calculated for legacy records
          tokenNo: a.dailyTokenNumber ?? dailyCounters[dateKey]
        };
      });

      // Only update state if data has actually changed to prevent unnecessary re-renders
      setStudies(prev => {
        const prevJSON = JSON.stringify(prev);
        const newJSON = JSON.stringify(worklist);
        return prevJSON === newJSON ? prev : worklist;
      });
    } catch (err) {
      console.error('[TECH] Worklist fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [TODAY]);

  useEffect(() => {
    fetchWorklist();
    // Increased from 5s to 30s to reduce UI flicker and improve performance
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
      showNotif('error', 'STATUS UPDATE FAILED', 'Could not update the appointment status. Please check your connection and try again.');
    }
  };

  // Per-service mark-scanned (multi-service rollout step 5). One visit
  // can carry many AppointmentService rows; this transitions a single
  // one and lets the server's rollup decide when the parent visit as
  // a whole becomes 'scanned'. Optimistically patches activeStudy so
  // the workspace UI updates without waiting for the refetch.
  const handleServiceStatus = async (appointmentId, serviceId, newStatus) => {
    if (!appointmentId || !serviceId) return;
    try {
      const res = await apiClient.patch(
        `/appointments/${appointmentId}/services/${serviceId}/status`,
        { status: newStatus }
      );
      const result = res?.data || {};
      // Optimistic local patch — keeps the per-service buttons reactive
      // without a full worklist refetch round trip.
      setActiveStudy(prev => {
        if (!prev || prev.appointmentId !== appointmentId) return prev;
        const updatedServices = (prev.services || []).map(svc =>
          svc.id === serviceId
            ? {
                ...svc,
                status:          result.serviceStatus ?? newStatus,
                scanStartedAt:   result.serviceScanStartedAt ?? svc.scanStartedAt,
                scanCompletedAt: result.serviceScanCompletedAt ?? svc.scanCompletedAt,
                deliveredAt:     result.serviceDeliveredAt ?? svc.deliveredAt,
              }
            : svc
        );
        return {
          ...prev,
          services:      updatedServices,
          status:        result.appointmentStatus ?? prev.status,
          scanStartedAt: result.appointmentScanStartedAt ?? prev.scanStartedAt,
          scannedAt:     result.appointmentScannedAt ?? prev.scannedAt,
          deliveredAt:   result.appointmentDeliveredAt ?? prev.deliveredAt,
        };
      });
      fetchWorklist();
    } catch (err) {
      console.error('[TECH] Per-service status transition failed', err);
      showNotif('error', 'STATUS UPDATE FAILED', 'Could not update the service status. Please check your connection and try again.');
    }
  };


  const handleCompleteStudy = async () => {
    if (!activeStudy) return;
    try {
      setLoading(true);
      await apiClient.post('/Study/complete', {
        appointmentId: activeStudy.appointmentId || activeStudy.id,
        comments: techNotes
      });
      await fetchWorklist();
      setCurrentView('QUEUE');
    } catch (err) {
      console.error('[TECH] Finalizing study failed', err);
      showNotif('error', 'FINALIZATION FAILED', 'Could not save observations and finalize the scanning study. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- DERIVED DATA ---
  const filteredStudies = useMemo(() => {
    return studies.filter(s => {
      const matchesSearch = (s.patientName?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || (s.id?.toLowerCase() || '').includes(searchQuery.toLowerCase());
      // Multi-service rollout: surface visits whose ANY service matches
      // the picked modality, with v1-row fallback for old cache entries.
      const matchesModality = matchesAnyModality(s, filters.modality);
      
      const status = s.status?.toLowerCase();
      const matchesPriority = filters.priority === 'ALL' || s.priority === filters.priority;
      const matchesStatus = filters.clinicalStatus === 'ALL' || status === filters.clinicalStatus.toLowerCase();
      const matchesDoctor = selectedDoctor === 'ALL' || s.doctorId === selectedDoctor || s.doctor === doctors.find(d => d.id === selectedDoctor)?.name;

      if (hubTab === 'ACTIVE') {
        return matchesDoctor && matchesSearch && matchesModality && matchesPriority && matchesStatus && s.isToday && ['scheduled', 'confirmed', 'in_progress', 'booked', 'scanned', 'reporting', 'reported', 'completed', 'delivered'].includes(status);
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
        // Priority is the dominant key so STATs surface to the top regardless
        // of which column the user clicked. Within a priority bucket the
        // user's chosen column sort applies.
        const pa = PRIORITY_RANK[a.priority] ?? 2;
        const pb = PRIORITY_RANK[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;

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
    total: studies.filter(s => s.isToday && ['scheduled', 'confirmed', 'in_progress', 'booked', 'scanned', 'reporting', 'reported', 'completed', 'delivered'].includes(s.status?.toLowerCase())).length,
    inProgress: studies.filter(s => s.isToday && s.status?.toLowerCase() === 'in_progress').length,
    pending: studies.filter(s => s.isToday && s.status?.toLowerCase() === 'confirmed').length,
    delivered: studies.filter(s => s.isToday && s.status?.toLowerCase() === 'delivered').length,
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
    setTechNotes(study.notes || study.technicianComments || '');
    setViewportProps({ invert: false, flipHorizontal: false, flipVertical: false, rotation: 0 });
    setKeyImages([]);
    // Default active service — first one the user is most likely to
    // scan first (per booking order). Multi-service visits let the
    // technician switch via the sidebar cards.
    const initialServices = getServiceLines(study);
    setActiveServiceId(initialServices[0]?.id ?? null);
    setActiveAssetIndex(0);

    // Auto-update status to in_progress if starting scan from confirmed/scheduled/booked
    const currentStatus = study.status?.toLowerCase();
    if (['confirmed', 'scheduled', 'booked'].includes(currentStatus)) {
      await handleStatusUpdate(study.appointmentId || study.id, 'in_progress');
    }

    // Fetch existing assets for this mission via the manifest endpoint.
    // Extracted ZIPs come back as per-series entries with slice-URL pseudo-Files
    // ready for Cornerstone; legacy un-extracted ZIPs keep the needsHydration
    // shape so hydrateZipAsset() can still serve them as a fallback.
    try {
        setLoading(true);
        const manifestRes = await apiClient.get(`/Study/${study.appointmentId}/manifest`)
            .catch(() => ({ data: { success: false } }));
        const manifestAssets = (manifestRes?.data?.success && manifestRes.data.data?.assets) || [];
        if (manifestAssets.length > 0) {
            setUploadedFiles(assetsFromManifest(manifestAssets));
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
      
      showNotif('error', 'STUDY LOAD FAILED', userMessage);
    } finally {
      setLoading(false);
      setProcessingStatus('');
      setLoadingProgress({ stage: '', current: 0, total: 0 });
    }
  };

  // When the technician switches to a different service, snap the
  // series picker back to the first asset so the viewer reloads
  // from the top of that service's series instead of an index that
  // may not exist after filtering.
  useEffect(() => {
    setActiveAssetIndex(0);
  }, [activeServiceId]);

  useEffect(() => {
    if (uploadedFiles[activeAssetIndex]?.needsHydration) {
      hydrateZipAsset(activeAssetIndex);
    }
  }, [activeAssetIndex, uploadedFiles]);

  useEffect(() => {
    setCurrentSlice(1);
  }, [activeAssetIndex]);


  const persistStudyAsset = async (file) => {
    const appointmentId = activeStudy?.appointmentId;
    if (!appointmentId) {
      console.warn('[TECH] No appointmentId — skipping backend persistence.');
      return;
    }
    // Path A: direct browser → Azure via SAS (skips backend bytes hop).
    try {
      console.log(`[TECH] 📤 Direct SAS upload: ${file.name} (${(file.size / 1048576).toFixed(1)} MB)`);
      await uploadStudyAssetDirect(file, appointmentId, (p) => {
        if (p?.stage?.startsWith('uploading')) {
          const mb = (p.loaded / 1048576).toFixed(1);
          const total = (p.total / 1048576).toFixed(1);
          console.log(`[TECH] upload ${p.stage}: ${mb} / ${total} MB (${(p.pct * 100).toFixed(0)}%)`);
        }
      }, {
        // Stamp the asset with the active service on a multi-service
        // visit so the viewer can strictly filter by AppointmentServiceId
        // instead of falling back to a modality-name match. Null when
        // the technician hasn't picked a service yet (legacy single-
        // service visits, freshly opened workspace before any click).
        appointmentServiceId: activeServiceId || null,
      });
      console.log(`[TECH] ✅ Direct upload completed: ${file.name}`);
      fetchWorklist();
      // NOTE: we deliberately do NOT reload assets from the backend manifest
      // here. The slices we just decoded locally are already on screen; the
      // server copy is still mid-extraction for ~seconds, so reloading would
      // swap the working viewer for an un-extracted ZIP entry and force a full
      // re-download + re-decode — the visible "blink"/reload. The backend copy
      // is for other sessions / the next open, which fetch it fresh anyway.
      return;
    } catch (sasErr) {
      console.warn('[TECH] Direct SAS upload failed, falling back to legacy multipart:', sasErr?.message);
    }
    // Path B fallback: legacy multipart POST.
    try {
      const formData = new FormData();
      formData.append('AppointmentId', appointmentId);
      if (activeServiceId) formData.append('AppointmentServiceId', activeServiceId);
      formData.append('File', file);
      console.log(`[TECH] 📤 (fallback) multipart upload: ${file.name}`);
      await apiClient.post('/Study/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      console.log(`[TECH] ✅ (fallback) Backend save completed: ${file.name}`);
      fetchWorklist();
      // NOTE: we deliberately do NOT reload assets from the backend manifest
      // here. The slices we just decoded locally are already on screen; the
      // server copy is still mid-extraction for ~seconds, so reloading would
      // swap the working viewer for an un-extracted ZIP entry and force a full
      // re-download + re-decode — the visible "blink"/reload. The backend copy
      // is for other sessions / the next open, which fetch it fresh anyway.
    } catch (err) {
      console.error('[TECH] Persistence failed (both paths)', err);
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

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
          setUploadedFiles(prev => {
            const updated = [...prev, ...newAssets];
            console.log(`[TECH] ✅ Files uploaded successfully! Total files: ${updated.length}`, updated);
            return updated;
          });
          setActiveAssetIndex(0); // Auto-focus first extracted asset stack
          setIsDicomImage(true);

          // Log processing statistics
          if (processingResult?.stats) {
            console.log(`[TECH] Processing statistics:`, processingResult.stats);

            // Show warning if corrupted files were found
            if (processingResult.stats.corruptedFiles > 0) {
              console.warn(`[TECH] WARNING: Eliminated ${processingResult.stats.corruptedFiles} corrupted files from upload`);
              setTimeout(() => {
                showNotif('warning', 'STUDY LOADED WITH WARNINGS', `Valid files imported: ${processingResult.stats.validFiles}\n${processingResult.stats.corruptedFiles} corrupted file(s) were automatically removed to ensure optimal viewing.`);
              }, 500);
            }
          }
        } else {
          showNotif('warning', 'NO SERIES FOUND', 'No valid DICOM image series were found in the ZIP archive. Please verify the file contains valid DICOM images.');
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

        showNotif('error', 'ZIP EXTRACTION FAILED', userMessage);
      } finally {
        setLoading(false);
        setProcessingStatus('');
        setLoadingProgress({ stage: '', current: 0, total: 0 });
        resetFileInput(); // Reset file input after upload completes
      }
    } else {
      const isDicom = file.name.toLowerCase().endsWith('.dcm') || file.name.toLowerCase().includes('dicom') || file.type === 'application/dicom';

      persistStudyAsset(file);

      setUploadedFiles(prev => {
        const updated = [...prev, {
          name: file.name,
          type: isDicom ? 'DICOM' : (file.type || 'UNKNOWN'),
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          time: new Date().toLocaleTimeString(),
          previewUrl: isDicom ? null : URL.createObjectURL(file),
          isZip: false,
          rawFiles: isDicom ? [file] : null
        }];
        console.log(`[TECH] ✅ File uploaded: ${file.name}. Total files: ${updated.length}`);
        return updated;
      });

      resetFileInput(); // Reset file input after upload
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '15px' }}>
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

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }}>Delivered</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                 <span style={{ fontSize: '24px', fontWeight: 700, color: '#15803d' }}>{stats.delivered}</span>
                 <span style={{ fontSize: '11px', fontWeight: 500, color: '#15803d' }}>Handed to Patient</span>
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
            <option value="STAT">STAT</option>
            <option value="URGENT">Urgent</option>
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
                
                // Priority class — drives the pulsing inset accent + glow via
                // CSS (.priority-tr-stat / .priority-tr-urgent in global.css).
                // Overdue (on-premises > 3h) gets the same red pulse since both
                // are "act now" signals.
                const isStudyOverdue = isOverdue(study.appointmentId);
                const priorityTrClass = (isStudyOverdue || study.priority === 'STAT') ? 'priority-tr-stat'
                                      : study.priority === 'URGENT'                    ? 'priority-tr-urgent'
                                      : '';

                // Turnaround-time pills.
                const onPremisesElapsed = study.arrivedAt
                  ? formatElapsed(study.arrivedAt, study.deliveredAt)
                  : null;
                const premisesSev = premisesSeverity(study.arrivedAt, study.deliveredAt);
                const premisesStyle = premisesPillStyle(premisesSev);
                const scanToDelivery = (study.scanStartedAt && study.deliveredAt)
                  ? formatElapsed(study.scanStartedAt, study.deliveredAt)
                  : null;

                return (
                  <tr key={study.appointmentId} className={priorityTrClass} style={{
                    borderBottom: '1px solid #f1f5f9',
                  }}>
                    <td style={{ padding: '8px 15px' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#f8fafc', color: '#0f52ba', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '14px', border: '1px solid #e2e8f0' }}>
                             {study.patientName.charAt(0)}
                          </div>
                          <div>
                             <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '12px' }}>{study.patientName.toUpperCase()}</div>
                             <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700 }}>{study.id} | {study.patientGender} | {formatPatientAge(study.patientAge)}</div>
                             {/* TAT pills: on-premises (live) + scan→delivery (final). */}
                             {onPremisesElapsed && (
                               <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                                 <span title={study.deliveredAt ? 'Total time on premises' : 'On premises (live)'} style={{
                                   fontSize: '8px', fontWeight: 950, letterSpacing: '0.3px',
                                   padding: '1px 5px', borderRadius: '999px',
                                   color: premisesStyle.color, background: premisesStyle.bg,
                                   border: `1px solid ${premisesStyle.border}`,
                                 }}>⏱ {onPremisesElapsed}</span>
                                 {scanToDelivery && (
                                   <span title="Scan start → delivered" style={{
                                     fontSize: '8px', fontWeight: 950, letterSpacing: '0.3px',
                                     padding: '1px 5px', borderRadius: '999px',
                                     color: '#0369a1', background: '#e0f2fe',
                                     border: '1px solid #bae6fd',
                                   }}>📋 {scanToDelivery}</span>
                                 )}
                               </div>
                             )}
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
                       {(() => {
                         const lines    = getServiceLines(study);
                         const progress = getReportProgressLabel(study);
                         // Per-service chip palette — matches OpsBoard /
                         // popover so the technician's eye learns the
                         // same status colour vocabulary everywhere.
                         const stepStyle = (s) => {
                           const u = String(s || '').toUpperCase();
                           if (u === 'DELIVERED')   return { color: '#047857', bg: '#d1fae5', border: '#a7f3d0', label: 'Delivered' };
                           if (u === 'REPORTED')    return { color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe', label: 'Reported' };
                           if (u === 'SCANNED')     return { color: '#9a3412', bg: '#ffedd5', border: '#fed7aa', label: 'Scanned' };
                           if (u === 'IN_MID')      return { color: '#b45309', bg: '#fef3c7', border: '#fcd34d', label: 'Half Way' };
                           if (u === 'IN_PROGRESS') return { color: '#a16207', bg: '#fef9c3', border: '#fde68a', label: 'In Progress' };
                           if (u === 'CANCELLED')   return { color: '#9f1239', bg: '#ffe4e6', border: '#fecdd3', label: 'Cancelled' };
                           return                         { color: '#475569', bg: '#f1f5f9', border: '#e2e8f0', label: 'Not Started' };
                         };
                         return (
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                             {/* Per-service rows — one per AppointmentService.
                                 The technician sees every scan the patient
                                 came in for, with each line's status pill,
                                 right on the worklist. No "+ N more" hiding.
                                 Cancelled lines dim + strike-through. */}
                             {lines.map((line, idx) => {
                               const st = stepStyle(line.status);
                               const cancelled = String(line.status || '').toUpperCase() === 'CANCELLED';
                               return (
                                 <div
                                   key={line.id || `${line.modality}-${idx}`}
                                   style={{
                                     display: 'flex', alignItems: 'center', gap: '6px',
                                     flexWrap: 'wrap',
                                     opacity: cancelled ? 0.55 : 1,
                                   }}
                                 >
                                   <span style={{
                                     fontSize: '12px', fontWeight: 800, color: '#1e293b',
                                     textDecoration: cancelled ? 'line-through' : 'none',
                                     maxWidth: '200px',
                                     whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                   }} title={line.serviceName}>{line.serviceName || '—'}</span>
                                   <span style={{
                                     fontSize: '8px', fontWeight: 900, letterSpacing: '0.3px',
                                     color: st.color, background: st.bg,
                                     padding: '1px 6px', borderRadius: '999px',
                                     border: `1px solid ${st.border}`,
                                     textTransform: 'uppercase',
                                   }}>{st.label}</span>
                                 </div>
                               );
                             })}
                             {/* Visit-level meta chips below the service list */}
                             {(progress || (study.priority && study.priority !== 'ROUTINE')) && (
                               <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                 {study.priority && study.priority !== 'ROUTINE' && (
                                   <span
                                     className={study.priority === 'STAT' ? 'priority-chip-stat' : 'priority-chip-urgent'}
                                     style={{ fontSize: '8px', fontWeight: 950, color: priority.color, background: priority.bg, padding: '1px 6px', borderRadius: '4px', letterSpacing: '0.5px' }}
                                   >{priority.label}</span>
                                 )}
                                 {progress && (
                                   <span title="Reporting progress across all services on this visit" style={{
                                     fontSize: '8px', fontWeight: 900, letterSpacing: '0.3px',
                                     color: '#047857', background: '#d1fae5',
                                     padding: '1px 6px', borderRadius: '999px',
                                     border: '1px solid #a7f3d0',
                                   }}>{progress}</span>
                                 )}
                               </div>
                             )}
                           </div>
                         );
                       })()}
                    </td>
                    <td style={{ padding: '8px 15px' }}>
                        <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '12px' }}>{study.dateTime ? new Date(study.dateTime).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : 'N/A'}</div>
                        <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 800, marginTop: '2px' }}>{study.dateTime ? `${new Date(study.dateTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} IST` : (study.appointmentTime || '09:00 AM')}</div>
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
                       {(() => {
                         const modalities = getUniqueModalities(study);
                         // For single-modality visits keep the original
                         // icon-tile + label render so the worklist row
                         // looks unchanged. Multi-modality visits get a
                         // compact chip stack to fit the column width.
                         if (modalities.length === 1) {
                           const m = modalities[0];
                           return (
                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                               <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f0f3fd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 950, color: '#0f52ba', border: '1px solid #dbeafe' }}>
                                 {(MODALITY_ICONS[m] || m.slice(0, 2))}
                               </div>
                               <span style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b' }}>{m}</span>
                             </div>
                           );
                         }
                         return (
                           <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                             {modalities.map((m, idx) => (
                               <span key={`${m}-${idx}`} style={{
                                 fontSize: '9px', fontWeight: 950, letterSpacing: '0.3px',
                                 color: '#0f52ba', background: '#eff6ff',
                                 padding: '2px 6px', borderRadius: '6px',
                                 border: '1px solid #dbeafe',
                               }}>{m}</span>
                             ))}
                           </div>
                         );
                       })()}
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

  const renderWorkspace = () => {
    // Derive the currently-focused service + its modality so the
    // viewer and series list can scope themselves to it. Falls back
    // to the visit-level modality when no service is set (legacy
    // single-service visits or a brand-new workspace open).
    const workspaceServices = getServiceLines(activeStudy);
    const activeService = workspaceServices.find(s => s.id && s.id === activeServiceId) || workspaceServices[0] || null;
    const activeModality = (activeService?.modality || activeStudy?.modality || '').toUpperCase();

    // Series filter — show only the assets matching the active
    // service. Uploads carrying an AppointmentServiceId match
    // strictly; legacy uploads (no FK) fall back to modality match
    // so a CT card still shows CT series. Hidden series stay
    // available via "Show all" toggle below the list.
    const matchesActiveService = (asset) => {
      if (!activeService) return true;
      const assetSvcId = asset?.appointmentServiceId || asset?.AppointmentServiceId;
      if (assetSvcId) return assetSvcId === activeService.id;
      const assetMod = String(asset?.modality || asset?.Modality || '').toUpperCase();
      if (!assetMod) return true; // unknown — keep visible
      return assetMod === activeModality;
    };
    const visibleUploadedFiles = workspaceServices.length > 1
      ? uploadedFiles.filter(matchesActiveService)
      : uploadedFiles;

    return (
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
        <input
          ref={fileInputRef}
          id="tech-study-up"
          type="file"
          style={{ display: 'none' }}
          accept=".dcm,.zip"
          onChange={handleFileChange}
        />
        
        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 8px' }}></div>

        {/* VIEWER TOOLS - HIDDEN ON MOBILE */}
        {!isMobile && (
          <>
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
          </>
        )}

        {/* MOBILE: SIMPLE DCM FILE SELECTOR ONLY */}
        {isMobile && uploadedFiles.length > 0 && (
          <select
            value={activeAssetIndex}
            onChange={e => setActiveAssetIndex(Number(e.target.value))}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 600, background: 'white', color: '#1e293b' }}
          >
            {uploadedFiles.map((f, i) => (
              <option key={i} value={i}>{f.name}</option>
            ))}
          </select>
        )}

        <button
          onClick={handleCompleteStudy}
          className="gamified-btn" style={{ padding: isMobile ? '8px 12px' : '10px 25px', borderRadius: '12px', fontSize: isMobile ? '12px' : '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 950 }}
        >{isMobile ? '✓' : 'Mark as Scanned'}</button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: isMobile ? '8px' : '10px', gap: isMobile ? '0' : '10px', flexDirection: isMobile ? 'column' : 'row' }}>

        {/* LEFT SIDEBAR: STUDY TREE - HIDDEN ON MOBILE */}
        {!isMobile && (
        <div style={{ width: '280px', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '15px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px', display: 'block', textTransform: 'uppercase' }}>Series Library</label>
          
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', marginBottom: '15px', borderLeft: '3px solid #0f52ba', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>{activeStudy?.patientName}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', fontWeight: 500 }}>ID: {activeStudy?.id}</div>
            </div>

            {/* Per-service scan controls (multi-service rollout step 5).
                For single-service visits this collapses to a quiet single
                row — same visual weight as the rest of the sidebar. For
                multi-service visits each line gets its own status pill +
                Mark Scanned button so the tech can confirm each modality
                as it finishes acquiring, instead of one giant "Complete"
                gate at the end. The server rolls each transition up to
                the parent visit's status. */}
            {(() => {
              const lines = getServiceLines(activeStudy);
              if (!lines || lines.length === 0) return null;
              return (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '8px', display: 'block', textTransform: 'uppercase' }}>
                    Services on this visit ({lines.length})
                  </label>
                  {lines.length > 1 && (
                    <div style={{
                      fontSize: '9px', fontWeight: 700, color: '#475569',
                      marginBottom: '8px', lineHeight: 1.4,
                      padding: '5px 8px',
                      background: '#f0f9ff', border: '1px solid #bfdbfe',
                      borderRadius: '6px',
                    }}>
                      💡 Tap a service to load its scans in the viewer.
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {lines.map((line) => {
                      const statusUpper  = (line.status || 'NOT_STARTED').toUpperCase();
                      const isScanned    = ['SCANNED', 'REPORTED', 'DELIVERED'].includes(statusUpper);
                      const isInProgress = ['IN_PROGRESS', 'IN_MID'].includes(statusUpper);
                      const isCancelled  = statusUpper === 'CANCELLED';
                      // Active service drives the viewer + series list.
                      // Single-service visits always treat the one line
                      // as active so the highlight + filtering still
                      // make sense even without a multi-service picker.
                      const isActive = !!line.id && (line.id === activeServiceId || (lines.length === 1));
                      // Status pill colours — mirrors the shared
                      // step palette used in OpsBoard / popover so
                      // the technician's eye learns one vocabulary.
                      const statusStyle =
                        statusUpper === 'DELIVERED' ? { color: '#047857', bg: '#d1fae5', border: '#a7f3d0' } :
                        statusUpper === 'REPORTED'  ? { color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' } :
                        statusUpper === 'SCANNED'   ? { color: '#9a3412', bg: '#ffedd5', border: '#fed7aa' } :
                        statusUpper === 'IN_MID'    ? { color: '#b45309', bg: '#fef3c7', border: '#fcd34d' } :
                        statusUpper === 'IN_PROGRESS' ? { color: '#a16207', bg: '#fef9c3', border: '#fde68a' } :
                        statusUpper === 'CANCELLED' ? { color: '#9f1239', bg: '#ffe4e6', border: '#fecdd3' } :
                                                       { color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' };
                      const statusLabel =
                        statusUpper === 'IN_MID' ? 'Half Way' :
                        statusUpper === 'IN_PROGRESS' ? 'In Progress' :
                        (line.status || 'NOT_STARTED').replace(/_/g, ' ');
                      const canMark    = !!line.id && !isScanned && !isCancelled;
                      const editable   = !!line.id;
                      const hasNotes   = Boolean(line.notes && String(line.notes).trim());
                      // Whole-card click opens the editor popover so
                      // the technician can change status to anything
                      // (not just SCANNED) and add notes.
                      return (
                        <div
                          key={line.id || `${line.modality}-${line.serviceName}`}
                          role={editable ? 'button' : undefined}
                          tabIndex={editable ? 0 : undefined}
                          // Click = make this the active service →
                          // the DICOM viewer + series list switch to
                          // its modality context. The ✎ icon (top
                          // right of the card) opens the status/notes
                          // popover separately.
                          onClick={editable ? () => setActiveServiceId(line.id) : undefined}
                          onKeyDown={editable ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveServiceId(line.id); }
                          } : undefined}
                          title={editable ? 'Click to view this service in the viewer' : ''}
                          style={{
                            background: isActive ? 'rgba(15, 82, 186, 0.05)' : 'white',
                            border: `1.5px solid ${isActive ? '#0f52ba' : '#e2e8f0'}`,
                            borderRadius: '10px',
                            padding: '8px 10px',
                            display: 'flex', flexDirection: 'column', gap: '6px',
                            cursor: editable ? 'pointer' : 'default',
                            opacity: isCancelled ? 0.55 : 1,
                            transition: 'all 0.15s',
                            boxShadow: isActive ? '0 4px 12px -4px rgba(15, 82, 186, 0.3)' : 'none',
                            position: 'relative',
                          }}
                          onMouseEnter={editable && !isActive ? (e) => {
                            e.currentTarget.style.borderColor = '#94a3b8';
                          } : undefined}
                          onMouseLeave={editable && !isActive ? (e) => {
                            e.currentTarget.style.borderColor = '#e2e8f0';
                          } : undefined}
                        >
                          {/* Active indicator stripe on the left edge */}
                          {isActive && (
                            <div aria-hidden="true" style={{
                              position: 'absolute', top: 0, left: 0, bottom: 0,
                              width: '3px', borderRadius: '10px 0 0 10px',
                              background: 'linear-gradient(180deg, #0f52ba, #1d4ed8)',
                            }} />
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              fontSize: '9px', fontWeight: 950, letterSpacing: '0.4px',
                              color: '#0f52ba', background: '#eff6ff',
                              padding: '2px 6px', borderRadius: '6px',
                              border: '1px solid #dbeafe',
                            }}>{line.modality}</span>
                            <span style={{
                              fontSize: '11px', fontWeight: 800, color: '#0f172a',
                              flex: 1, minWidth: 0,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              textDecoration: isCancelled ? 'line-through' : 'none',
                            }}
                            title={line.serviceName}>{line.serviceName}</span>
                            {isActive && (
                              <span title="Currently viewing" style={{
                                fontSize: '8px', fontWeight: 950, color: '#0f52ba',
                                background: '#dbeafe', border: '1px solid #bfdbfe',
                                padding: '2px 6px', borderRadius: '999px',
                                letterSpacing: '0.4px', textTransform: 'uppercase',
                              }}>● Viewing</span>
                            )}
                            {hasNotes && (
                              <span title="Has notes" aria-label="Has notes" style={{ fontSize: '11px' }}>📝</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              fontSize: '9px', fontWeight: 900, letterSpacing: '0.3px',
                              color: statusStyle.color, background: statusStyle.bg,
                              padding: '2px 7px', borderRadius: '999px',
                              border: `1px solid ${statusStyle.border}`,
                              textTransform: 'uppercase',
                            }}>{statusLabel}</span>
                            <div style={{ flex: 1 }} />
                            {canMark && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  // Stop the parent card's onClick — this
                                  // is the quick-mark shortcut, not the
                                  // full editor.
                                  e.stopPropagation();
                                  handleServiceStatus(activeStudy.appointmentId || activeStudy.id, line.id, 'SCANNED');
                                }}
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 900,
                                  padding: '5px 10px',
                                  borderRadius: '8px',
                                  border: 'none',
                                  cursor: 'pointer',
                                  background: 'linear-gradient(135deg, #0f52ba 0%, #1d4ed8 100%)',
                                  color: 'white',
                                  boxShadow: '0 4px 10px -4px rgba(15, 82, 186, 0.5)',
                                  fontFamily: 'inherit',
                                  letterSpacing: '0.3px',
                                }}
                              >
                                Mark scanned
                              </button>
                            )}
                            {!line.id && (
                              <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700, fontStyle: 'italic' }}>
                                legacy
                              </span>
                            )}
                          </div>
                          {hasNotes && (
                            <div style={{
                              fontSize: '10.5px', fontWeight: 600, color: '#0f172a',
                              lineHeight: 1.35,
                              padding: '6px 8px',
                              background: '#fffbeb',
                              border: '1px solid #fef3c7',
                              borderRadius: '8px',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }} title={line.notes}>📝 {line.notes}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '10px', display: 'block' }}>
              Series ({visibleUploadedFiles.length})
              {workspaceServices.length > 1 && uploadedFiles.length > visibleUploadedFiles.length && (
                <span style={{
                  marginLeft: '6px',
                  fontSize: '9px', fontWeight: 800, color: '#0f52ba',
                  background: '#dbeafe', border: '1px solid #bfdbfe',
                  padding: '1px 6px', borderRadius: '999px', letterSpacing: '0.3px',
                  textTransform: 'uppercase',
                }} title={`${uploadedFiles.length - visibleUploadedFiles.length} series hidden — different modality`}>
                  {uploadedFiles.length - visibleUploadedFiles.length} hidden
                </span>
              )}
            </label>
            {visibleUploadedFiles.map((f, i) => (
              <div
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveAssetIndex(i);
                }}
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
        )}

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
              {visibleUploadedFiles.length > 0 ? (
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
                        // Key includes active service id so the
                        // viewer re-initialises with a fresh engine
                        // when the technician switches services —
                        // otherwise the previous service's modality
                        // toolset would linger.
                        key={`${activeService?.id || 'visit'}_${activeAssetIndex}_${idx}`}
                        engineId={`tech-engine-${idx}`}
                        viewportId={`tech-viewport-${idx}`}
                        modality={activeModality || undefined}
                        files={visibleUploadedFiles[(activeAssetIndex + idx) % visibleUploadedFiles.length]?.rawFiles}
                        preParsedMetadata={visibleUploadedFiles[(activeAssetIndex + idx) % visibleUploadedFiles.length]?.metadata}
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
                        {/* Active modality + service caption so the
                            technician always knows which service the
                            viewer is currently showing. */}
                        {activeService && workspaceServices.length > 1 && (
                          <div style={{ background: 'rgba(15, 82, 186, 0.9)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: '6px', fontSize: '9px', color: 'white', fontWeight: 950, letterSpacing: '0.8px', border: '1px solid rgba(255,255,255,0.2)' }}>
                            🔍 {activeModality} · {activeService.serviceName}
                          </div>
                        )}
                        <div style={{ background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: '6px', fontSize: '9px', color: '#94a3b8', fontWeight: 950, letterSpacing: '1px', border: '1px solid rgba(255,255,255,0.1)' }}>
                           {visibleUploadedFiles[(activeAssetIndex + idx) % visibleUploadedFiles.length]?.name || 'No signal'}
                        </div>
                        <div style={{ background: 'rgba(59, 130, 246, 0.9)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', color: 'white', fontWeight: 900, width: 'fit-content' }}>
                          SLICE: {idx === 0 ? currentSlice : '?'} / {visibleUploadedFiles[(activeAssetIndex + idx) % visibleUploadedFiles.length]?.rawFiles?.length || 0}
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
  };

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

      {/* ── Universal Notification Modal ─────────────────────────────────────── */}
      {notifModal.isOpen && (() => {
        const NOTIF_CFG = {
          success: { gradient: 'linear-gradient(135deg,#dcfce7,#bbf7d0)', iconColor: '#16a34a', border: '#bbf7d0', titleColor: '#15803d', shadow: 'rgba(22,163,74,0.22)',  icon: '✓', btnGrad: 'linear-gradient(135deg,#16a34a,#15803d)', btnShadow: 'rgba(22,163,74,0.4)'  },
          error:   { gradient: 'linear-gradient(135deg,#fee2e2,#fecaca)', iconColor: '#dc2626', border: '#fecaca', titleColor: '#991b1b', shadow: 'rgba(220,38,38,0.22)',  icon: '✕', btnGrad: 'linear-gradient(135deg,#e11d48,#be123c)', btnShadow: 'rgba(225,29,72,0.4)'  },
          warning: { gradient: 'linear-gradient(135deg,#fef3c7,#fde68a)', iconColor: '#d97706', border: '#fde68a', titleColor: '#92400e', shadow: 'rgba(217,119,6,0.22)', icon: '⚠', btnGrad: 'linear-gradient(135deg,#d97706,#b45309)', btnShadow: 'rgba(217,119,6,0.4)' },
          info:    { gradient: 'linear-gradient(135deg,#dbeafe,#bfdbfe)', iconColor: '#0f52ba', border: '#bfdbfe', titleColor: '#1e40af', shadow: 'rgba(15,82,186,0.22)', icon: '↻', btnGrad: 'linear-gradient(135deg,#0f52ba,#1e40af)', btnShadow: 'rgba(15,82,186,0.4)' },
        };
        const cfg = NOTIF_CFG[notifModal.type] || NOTIF_CFG.info;
        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(10,22,40,0.65)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', justifyContent: 'center', alignItems: 'center', animation: 'techNoticeFade 0.2s ease-out' }}
            onClick={() => setNotifModal(m => ({ ...m, isOpen: false }))}
          >
            <div
              style={{ width: '90%', maxWidth: '440px', background: 'linear-gradient(160deg,#ffffff 0%,#f8fafc 100%)', borderRadius: '28px', border: `1px solid ${cfg.border}`, boxShadow: `0 24px 60px -12px ${cfg.shadow}, 0 0 0 1px rgba(0,0,0,0.04)`, padding: '40px 32px 32px', textAlign: 'center', animation: 'techNoticePop 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: '76px', height: '76px', borderRadius: '50%', background: cfg.gradient, border: `2px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', fontSize: '30px', boxShadow: `0 12px 28px -8px ${cfg.shadow}` }}>
                <span style={{ color: cfg.iconColor, fontWeight: 900, lineHeight: 1 }}>{cfg.icon}</span>
              </div>
              <div style={{ display: 'inline-block', background: cfg.gradient, border: `1px solid ${cfg.border}`, borderRadius: '8px', padding: '3px 12px', marginBottom: '12px' }}>
                <span style={{ fontSize: '9px', fontWeight: 950, letterSpacing: '2px', color: cfg.titleColor, fontFamily: 'system-ui,sans-serif' }}>{notifModal.type.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 950, letterSpacing: '1.5px', color: '#0f172a', marginBottom: '12px', fontFamily: 'system-ui,sans-serif', lineHeight: 1.3 }}>{notifModal.title}</div>
              <div style={{ width: '40px', height: '3px', background: cfg.gradient, borderRadius: '99px', margin: '0 auto 16px' }} />
              <p style={{ fontSize: '13px', lineHeight: 1.75, color: '#475569', fontWeight: 500, margin: '0 0 28px', fontFamily: 'system-ui,sans-serif', whiteSpace: 'pre-wrap' }}>{notifModal.message}</p>
              <button
                onClick={() => setNotifModal(m => ({ ...m, isOpen: false }))}
                style={{ width: '100%', padding: '15px', background: cfg.btnGrad, color: 'white', border: 'none', borderRadius: '16px', fontSize: '11px', fontWeight: 950, letterSpacing: '1.5px', cursor: 'pointer', boxShadow: `0 8px 20px -6px ${cfg.btnShadow}`, fontFamily: 'system-ui,sans-serif' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >UNDERSTOOD</button>
            </div>
            <style>{`
              @keyframes techNoticeFade { from { opacity: 0 } to { opacity: 1 } }
              @keyframes techNoticePop  { from { transform: scale(0.88) translateY(20px); opacity: 0 } to { transform: scale(1) translateY(0); opacity: 1 } }
            `}</style>
          </div>
        );
      })()}
    </div>
  );
}
