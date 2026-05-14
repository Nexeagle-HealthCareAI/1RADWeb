import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import JSZip from 'jszip';
import dicomParser from 'dicom-parser';
import AdvancedDicomViewer from '../components/AdvancedDicomViewer';
import NarrativeEditor from '../components/NarrativeEditor';
import apiClient, { BASE_URL } from '../api/apiClient';
import { DicomCache } from '../utils/DicomCache';
import { dicomOptimizer } from '../utils/DicomPerformanceOptimizer';
import { jwtDecode } from 'jwt-decode';
import useOffline from '../hooks/useOffline';
import { nativeStorage } from '../hooks/useElectron';
import ReportPreviewModal from '../components/ReportPreviewModal';

const ReportingPage = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { isOnline, addToOutbox } = useOffline();
  const appointmentId = params.id || searchParams.get('id');
  const [showKeywordDrawer, setShowKeywordDrawer] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [editorText, setEditorText] = useState('');
  const [showInlineSuggestion, setShowInlineSuggestion] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [cursorPos, setCursorPos] = useState({ top: 0, left: 0 });
  const [history, setHistory] = useState([editorText]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [keywordLibrary, setKeywordLibrary] = useState([]);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [selectedImg, setSelectedImg] = useState(null);
  const [imgToolbarPos, setImgToolbarPos] = useState({ top: 0, left: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeAssetIndex, setActiveAssetIndex] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [currentSlice, setCurrentSlice] = useState(1);
  const [activeTool, setActiveTool] = useState('WindowLevel');
  const [activeMetadata, setActiveMetadata] = useState(null);
  const [cineEnabled, setCineEnabled] = useState(false);
  const [layoutMode, setLayoutMode] = useState('1x1');
  const [viewportProps, setViewportProps] = useState({ invert: false, flipHorizontal: false, flipVertical: false, rotation: 0 });
  const [resetTrigger, setResetTrigger] = useState(0);
  const [screenshotData, setScreenshotData] = useState(null);
  const [keyImages, setKeyImages] = useState([]);
  const [isSyncEnabled, setIsSyncEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDicomImage, setIsDicomImage] = useState(false);
  const [editorState, setEditorState] = useState('standard'); // 'standard', 'expanded', 'collapsed'
  const [editorWidth, setEditorWidth] = useState(50); // percentage
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const isResizing = useRef(false);
  const [isTablet, setIsTablet] = useState(window.innerWidth < 1100);
  const [activeWorkspaceMode, setActiveWorkspaceMode] = useState('split'); // 'split', 'dicom', 'editor'
  
  // Performance optimization states
  const [loadingProgress, setLoadingProgress] = useState({ stage: '', current: 0, total: 0 });
  const [processingStatus, setProcessingStatus] = useState('');
  
  // --- API SYNC STATES ---
  const [protocol, setProtocol] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [activeAppointment, setActiveAppointment] = useState(null);
  const [impression, setImpression] = useState('');
  const [advice, setAdvice] = useState('');
  const [isFinalized, setIsFinalized] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  // --- PATIENT TIMELINE STATES ---
  const [patientHistory, setPatientHistory] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [expandedHistoryReport, setExpandedHistoryReport] = useState({}); // { [appointmentId]: { loading, data, error } }
  const [expandedHistoryDicom, setExpandedHistoryDicom] = useState({}); // { [appointmentId]: true/false }
  
  // --- AUTOSAVE SYSTEM ---
  const [lastSaved, setLastSaved] = useState(null);
  const [saveStatus, setSaveStatus] = useState('IDLE'); // 'IDLE', 'DIRTY', 'SAVING', 'SUCCESS'
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isIPad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchstart' in document;
      const isTabletSize = (width >= 768 && width <= 1366) || (height >= 768 && height <= 1366);
      
      const tablet = isTouchDevice && (isTabletSize || isIPad);
      setIsTablet(tablet);
      
      console.log('[REPORTING] Device detection:', {
        width, height, isTouchDevice, isIPad, isTabletSize, tablet,
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        activeWorkspaceMode
      });
      
      // Force toolbar visibility on tablets
      if (tablet) {
        setTimeout(() => {
          const toolbar = document.getElementById('dicom-toolbar');
          if (toolbar) {
            toolbar.style.display = 'flex';
            toolbar.style.transform = 'translateX(0)';
            console.log('[REPORTING] Toolbar forced visible on tablet');
          }
        }, 100);
      }
      
      if (tablet && activeWorkspaceMode === 'split') {
        setActiveWorkspaceMode('editor'); // Default to editor on tablet
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [activeWorkspaceMode]);

  // 1. LOCAL AUTOSAVE: Immediate persistence to nativeStorage/localStorage
  useEffect(() => {
    if (!appointmentId || isFinalized) return;
    
    const draft = {
      appointmentId,
      templateId: selectedTemplateId,
      findings: editorText,
      impression,
      advice,
      reportingMode: 'Narrative',
      timestamp: new Date().toISOString()
    };

    const timer = setTimeout(async () => {
      try {
        await nativeStorage.set(`1rad_draft_${appointmentId}`, draft);
        if (saveStatus === 'IDLE' || saveStatus === 'SUCCESS') {
          setSaveStatus('DIRTY');
        }
        console.info(`[AUTOSAVE] Local draft cached for ${appointmentId}`);
      } catch (e) {
        console.warn('[AUTOSAVE] Local cache failed', e);
      }
    }, 1500); // 1.5s debounce

    return () => clearTimeout(timer);
  }, [editorText, impression, advice, appointmentId, isFinalized, selectedTemplateId]);

  // 2. CLOUD AUTOSAVE: Background API sync every 45 seconds if dirty
  useEffect(() => {
    if (saveStatus !== 'DIRTY' || !appointmentId || isFinalized || !isOnline || isCloudSyncing) return;

    const cloudTimer = setTimeout(async () => {
      console.info(`[AUTOSAVE] Triggering background cloud sync...`);
      setIsCloudSyncing(true);
      setSaveStatus('SAVING');
      try {
        const payload = {
          appointmentId,
          templateId: selectedTemplateId,
          findings: editorText,
          impression: impression || '',
          advice: advice || '',
          reportingMode: 'Narrative',
          isFinalized: false
        };
        const res = await apiClient.post('/reporting/save', payload);
        if (res.data?.success) {
          setLastSaved(new Date().toLocaleTimeString());
          setSaveStatus('SUCCESS');
        } else {
          setSaveStatus('DIRTY');
        }
      } catch (err) {
        console.warn('[AUTOSAVE] Cloud sync failed, will retry later.', err);
        setSaveStatus('DIRTY');
      } finally {
        setIsCloudSyncing(false);
      }
    }, 45000); // 45s cloud sync interval

    return () => clearTimeout(cloudTimer);
  }, [saveStatus, editorText, impression, advice, appointmentId, isFinalized, isOnline, selectedTemplateId, isCloudSyncing]);



  // --- TIMELINE FETCH (standalone so refresh button can call it) ---
  const fetchPatientTimeline = useCallback(async (appointmentData, currentAppId) => {
    if (!appointmentData) return;
    setLoadingTimeline(true);
    try {
      const patientId = appointmentData.patientId || appointmentData.patientIdentifier;
      const searchQuery = patientId
        ? String(patientId)
        : (appointmentData.patientName || '');

      if (!searchQuery) return;

      const [todayRes, archiveRes] = await Promise.all([
        apiClient.get('/appointments', { params: { search: searchQuery } }).catch(() => ({ data: [] })),
        apiClient.get('/appointments', { params: { search: searchQuery, isArchive: true } }).catch(() => ({ data: [] })),
      ]);

      const seen = new Set();
      const merged = [...(Array.isArray(todayRes.data) ? todayRes.data : []), ...(Array.isArray(archiveRes.data) ? archiveRes.data : [])]
        .filter(a => {
          const key = String(a.appointmentId);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      const past = merged
        .filter(a => {
          const samePatient =
            (patientId && (String(a.patientId) === String(patientId) || String(a.patientIdentifier) === String(patientId))) ||
            a.patientName?.toLowerCase().trim() === appointmentData.patientName?.toLowerCase().trim();
          const different =
            String(a.appointmentId) !== String(appointmentData.appointmentId) &&
            a.displayId !== currentAppId;
          return samePatient && different;
        })
        .sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));

      setPatientHistory(past);
    } catch (err) {
      console.warn('[TIMELINE] Fetch failed:', err.message);
    } finally {
      setLoadingTimeline(false);
    }
  }, []);

  // --- DATA FETCHING ---
  const fetchReportingContext = useCallback(async (appId) => {
    setLoading(true);
    setError(null);
    console.info(`[1RAD] Initializing Reporting Context for AppID: ${appId}`);

    try {
      // 1. Fetch Core Patient & Case Data first to resolve context
      const appRes = await apiClient.get(`/appointments/${appId}`).catch(() => ({ data: null }));
      
      if (!appRes?.data) {
        setError("PATIENT_CONTEXT_NOT_FOUND: The requested appointment record could not be retrieved.");
        setLoading(false);
        return;
      }
      
      const appointmentData = appRes.data;
      setActiveAppointment(appointmentData);
      
      // TACTICAL RESOLUTION: Try appointment first, then Auth Token fallback
      let doctorId = appointmentData.doctorId || appointmentData.doctorUserId || appointmentData.doctor?.userId;
      
      if (!doctorId) {
        console.warn("[1RAD] Doctor ID missing in Appointment. Attempting Auth Token fallback...");
        try {
          const token = sessionStorage.getItem('1rad_token');
          if (token) {
            const decoded = jwtDecode(token);
            // Try standard OIDC claims
            doctorId = decoded.sub || decoded.nameid || decoded.UserId || decoded.id;
            console.info(`[1RAD] Resolved DoctorID from Auth Token: ${doctorId}`);
          }
        } catch (jwtErr) {
          console.error("[1RAD] Auth Token resolution failed:", jwtErr);
        }
      }

      console.info(`[1RAD] Final Context DoctorID: ${doctorId}`);

      // 2. Parallel fetch for Library and Institutional Branding
      const [templRes, keyRes, protRes, reportRes, assetRes] = await Promise.all([
        apiClient.get('/reporting/templates'),
        apiClient.get('/reporting/keywords'),
        doctorId ? apiClient.get(`/Prescription/${doctorId}`).catch(() => null) : Promise.resolve(null),
        apiClient.get(`/Reporting/report/${appId}`).catch(() => ({ data: { success: false } })),
        apiClient.get(`/Study/${appId}/assets`).catch(() => ({ data: [] }))
      ]);

      if (templRes.data?.success) setTemplates(templRes.data.data);
      if (keyRes.data?.success) {
        const mapped = keyRes.data.data.map(k => ({
          ...k,
          trigger: k.trigger || k.keyword
        }));
        setKeywordLibrary(mapped);
      }
      
      if (protRes?.data?.success) {
        console.info(`[1RAD] Branding Protocol Synchronized:`, protRes.data.data);
        setProtocol(protRes.data.data);
      } else {
        console.warn(`[1RAD] Institutional Branding failed for DoctorID: ${doctorId}. Reverting to default.`);
      }
      
      if (assetRes.data && assetRes.data.length > 0) {
        console.info(`[1RAD] Found ${assetRes.data.length} existing study assets`);
        console.info(`[1RAD] Raw asset data:`, assetRes.data);
        
        const hydAssets = assetRes.data.map((asset, index) => {
          // Validate asset data
          if (!asset.blobUrl) {
            console.error(`[1RAD] Asset ${index} missing blobUrl:`, asset);
          }
          if (!asset.fileName) {
            console.warn(`[1RAD] Asset ${index} missing fileName:`, asset);
          }
          
          return {
            id: asset.id,
            name: asset.fileName || `Asset ${index + 1}`,
            type: (asset.fileType || 'unknown').toUpperCase(),
            remoteUrl: asset.blobUrl,
            needsHydration: (asset.fileType || '').toLowerCase() === 'zip',
            rawFiles: [],
            // Add debug info
            originalAsset: asset
          };
        });
        
        console.info(`[1RAD] Processed assets:`, hydAssets);
        setUploadedFiles(hydAssets);
        
        // Auto-hydrate first asset if it's a ZIP
        if (hydAssets.length > 0 && hydAssets[0].needsHydration) {
          console.info(`[1RAD] Auto-hydrating first asset: ${hydAssets[0].name}`);
          console.info(`[1RAD] Asset remoteUrl: ${hydAssets[0].remoteUrl}`);
          
          // Validate URL before attempting hydration
          if (!hydAssets[0].remoteUrl) {
            console.error(`[1RAD] Cannot hydrate asset - missing remoteUrl`);
            alert('ASSET_ERROR: Study file URL is missing. Please contact support.');
            return;
          }
          
          // Trigger hydration after state is set
          setTimeout(() => {
            setActiveAssetIndex(0);
          }, 100);
        }
      } else {
        console.info(`[1RAD] No existing study assets found`);
      }

      // CACHE FOR OFFLINE USE
      await nativeStorage.set(`1rad_cache_appointment_${appId}`, appointmentData);

      // --- PATIENT TIMELINE FETCH ---
      setShowTimeline(true);
      fetchPatientTimeline(appointmentData, appId);

      
      // 3. Resolve Report Data (Handle both nested and flat structures)
      const reportBody = reportRes.data;
      const r = (reportBody?.success && reportBody?.data) ? reportBody.data : reportBody;

      if (r && (r.findings !== undefined || r.impression !== undefined)) {
        console.info(`[1RAD] Found Existing Report.`);

        // 1. Restore Findings Content
        setEditorText(r.findings || '');
        
        setImpression(r.impression || '');
        setAdvice(r.advice || '');
        setIsFinalized(r.isFinalized);
        if (r.templateId) setSelectedTemplateId(String(r.templateId));
      } else {
        // FALLBACK: New Case.
        console.info(`[1RAD] New Case Detected.`);
      }
    } catch (err) {
      console.error('[REPORTING] Initialization failure, trying cache', err);
      // Try to load from cache
      const cachedAppointment = await nativeStorage.get(`1rad_cache_appointment_${appId}`);
      if (cachedAppointment) {
        setActiveAppointment(cachedAppointment);
      }
      
      const draft = await nativeStorage.get(`1rad_draft_${appId}`);
      if (draft) {
        console.info('[1RAD] Reconstituting Workspace from Local Draft');
        setEditorText(draft.findings || '');
        setImpression(draft.impression || '');
        setAdvice(draft.advice || '');
        setSelectedTemplateId(draft.selectedTemplateId);
      } else {
         setError("SYSTEM_INITIALIZATION_ERROR: A critical failure occurred while preparing the diagnostic workspace. " + (err.message || "Please check your connection."));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (appointmentId) {
      fetchReportingContext(appointmentId);
    }
  }, [appointmentId, fetchReportingContext]);
  
  // --- OFFLINE AUTOSAVE ---
  useEffect(() => {
    if (!appointmentId || isFinalized) return;
    
    const autosaveTimer = setTimeout(async () => {
       const draft = {
         findings: editorText,
         impression,
         advice,
         selectedTemplateId,
         timestamp: new Date().getTime()
       };
       console.log(`[REPORTING] Autosaving draft for ${appointmentId}...`);
       await nativeStorage.set(`1rad_draft_${appointmentId}`, draft);
    }, 2000); // Debounce for 2 seconds

    return () => clearTimeout(autosaveTimer);
  }, [editorText, impression, advice, selectedTemplateId, appointmentId, isFinalized]);



  const handleSaveReport = async (finalizing = false) => {
    if (!appointmentId) {
      alert('APPOINTMENT CONTEXT MISSING: Cannot save report.');
      return;
    }
    
    const payload = {
      appointmentId: appointmentId,
      templateId: selectedTemplateId,
      findings: editorText,
      impression: impression || '',
      advice: advice || '',
      isFinalized: finalizing,
      reportingMode: 'Narrative'
    };

    if (!isOnline) {
      await addToOutbox('REPORT', payload);
      alert(finalizing ? 'OFFLINE_MODE: Finalized report queued for sync.' : 'OFFLINE_MODE: Draft cached locally.');
      if (finalizing) {
        setIsFinalized(true);
        navigate('/doctor-board');
      }
      return;
    }

    setIsSaving(true);
    try {
      const res = await apiClient.post('/reporting/save', payload);
      if (res.data?.success) {
        alert(finalizing ? 'STRATEGIC DISPATCH COMPLETE: Report finalized.' : 'DRAFT PERSISTED: Changes saved.');
        if (finalizing) {
          setIsFinalized(true);
          // Clear local draft on success
          await nativeStorage.delete(`1rad_draft_${appointmentId}`);
          navigate('/doctor-board');
        }
      }
    } catch (err) {
      console.error('[REPORTING] Save failed', err);
      if (!err.response) {
         await addToOutbox('REPORT', payload);
         alert('NETWORK_ERROR: Report saved to offline outbox.');
         if (finalizing) {
            setIsFinalized(true);
            navigate('/doctor-board');
         }
      } else {
         alert(`SAVE FAILURE: ${err.response?.data?.error || err.message}`);
      }
    } finally {
      setIsSaving(false);
    }
  };





  const handleApplyTemplate = (template) => {
    setSelectedTemplateId(template.id);
    setEditorText(template.content || template.Content || '');
  };

  const handleApplyKeyword = (macro) => {
    const textToInsert = macro.replacementText || '';
    insertContent(textToInsert);
    
    // Also copy plain text version to clipboard for tactical versatility
    try {
      const plainText = textToInsert.replace(/<[^>]*>?/gm, '');
      navigator.clipboard.writeText(plainText);
      console.info(`[1RAD] Macro "${macro.trigger}" inserted and copied to clipboard.`);
    } catch (err) {
      console.warn('[1RAD] Clipboard fallback failed:', err);
    }
  };

  const onMeasurement = (measurement) => {
    console.log('[1RAD] Clinical Measurement Recorded:', measurement);
    // Future: Auto-populate findings if desired
  };

  // --- DICOM HANDLERS ---
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
      setProcessingStatus('Initializing optimized DICOM processor...');
      
      try {
        // Use optimized processor for ZIP files
        const processingResult = await dicomOptimizer.processZipFileOptimized(
          file,
          (progress) => {
            setLoadingProgress(progress);
            setProcessingStatus(`${progress.stage}: ${progress.current}/${progress.total} files${progress.seriesCount ? ` (${progress.seriesCount} series found)` : ''}`);
          },
          (seriesInfo) => {
            console.log(`[REPORTING] New series discovered: ${seriesInfo.seriesDesc}`);
          }
        );
        
        // Extract series array from result
        const classifiedAssets = processingResult?.series || [];
        
        if (!Array.isArray(classifiedAssets) || classifiedAssets.length === 0) {
          throw new Error('NO_DICOM_SERIES: No valid DICOM image series found in the uploaded file');
        }
        
        const assets = classifiedAssets.map(series => ({
          name: `${series.patientName} - ${series.seriesDesc}`,
          rawFiles: series.files,
          size: `${series.files.length} slices`,
          seriesUID: series.seriesUID,
          modality: series.modality
        }));
        
        setUploadedFiles(assets);
        setIsDicomImage(true);
        
        // Log processing statistics
        if (processingResult?.stats) {
          console.log(`[REPORTING] Processing statistics:`, processingResult.stats);
        }
      } catch (err) {
        console.error('Optimized ZIP load failed', err);
        setProcessingStatus(`Error: ${err.message}`);
        alert('Failed to process ZIP file: ' + err.message);
      } finally {
        setLoading(false);
        setProcessingStatus('');
        setLoadingProgress({ stage: '', current: 0, total: 0 });
      }
    }
  };

  const testAssetConnection = async (asset) => {
    try {
      console.log(`[DICOM_TEST] Testing connection to: ${asset.remoteUrl}`);

      // Try direct first
      try {
        const headResponse = await fetch(asset.remoteUrl, { 
          method: 'HEAD', 
          mode: 'cors',
          cache: 'no-cache'
        });
        if (headResponse.ok) {
          console.log(`[DICOM_TEST] ✅ Direct access successful.`);
          return { success: true, useProxy: false };
        }
      } catch (e) {
        console.warn(`[DICOM_TEST] Direct HEAD failed (likely CORS):`, e.message);
      }

      // Try proxy using apiClient (optional - if backend supports it)
      try {
        console.log(`[DICOM_TEST] Attempting proxy test...`);
        const proxyResponse = await apiClient.get(`/Study/proxy-asset`, {
          params: { url: asset.remoteUrl },
          responseType: 'blob',
          timeout: 5000
        });

        if (proxyResponse.status === 200 && proxyResponse.data) {
          console.log(`[DICOM_TEST] ✅ Secure proxy access successful.`);
          return { success: true, useProxy: true };
        }
      } catch (proxyError) {
        console.warn(`[DICOM_TEST] Proxy test failed:`, {
          status: proxyError.response?.status,
          statusText: proxyError.response?.statusText,
          message: proxyError.message
        });
        
        // If proxy returns 405, it means endpoint doesn't support this method
        // This is not a critical error - we can still try direct download
        if (proxyError.response?.status === 405) {
          console.warn(`[DICOM_TEST] Proxy endpoint not available (405 Method Not Allowed)`);
        }
      }

      // Return success=false but don't throw - let the main download logic handle it
      console.log(`[DICOM_TEST] Connection test inconclusive, will attempt direct download`);
      return { 
        success: false, 
        useProxy: false,
        error: "Connection test failed, but direct download will be attempted" 
      };
    } catch (error) {
      console.error(`[DICOM_TEST] Connection test error:`, error);
      return { 
        success: false, 
        useProxy: false,
        error: error.message 
      };
    }
  };

  const hydrateZipAsset = async (index) => {
    const asset = uploadedFiles[index];
    if (!asset || !asset.needsHydration || !asset.remoteUrl || asset.rawFiles?.length > 0) return;

    setLoading(true);
    setProcessingStatus('Initializing optimized DICOM processor...');
    
    try {
      // TACTICAL CACHE CHECK
      console.log(`[DICOM_LOAD] Checking persistent cache for asset: ${asset.id}`);
      let cachedData;
      try {
        cachedData = await DicomCache.get(asset.id);
      } catch (cacheError) {
        console.warn(`[DICOM_LOAD] Cache retrieval failed (non-critical):`, cacheError);
        cachedData = null;
      }
      
      if (cachedData && cachedData.series?.length > 0) {
        console.log(`[DICOM_LOAD] Cache HIT for ${asset.id}. Restoring ${cachedData.series.length} series.`);
        setProcessingStatus('Restoring from cache...');
        
        const hydratedFromCache = cachedData.series.map(s => ({
          ...asset,
          name: s.name,
          rawFiles: s.rawFiles, // Blobs are automatically handled by IndexedDB
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

      console.log(`[DICOM_LOAD] Cache MISS. Initializing optimized hydration for asset: ${asset.name}`);
      console.log(`[DICOM_LOAD] Asset details:`, {
        id: asset.id,
        name: asset.name,
        remoteUrl: asset.remoteUrl,
        needsHydration: asset.needsHydration
      });
      
      setProcessingStatus('Downloading study data...');
      
      // Validate URL before fetching
      if (!asset.remoteUrl) {
        throw new Error('MISSING_URL: Asset remote URL is not available. Please check the asset configuration.');
      }
      
      // Test connection first (non-blocking - if it fails, we'll try direct anyway)
      console.log(`[DICOM_LOAD] Testing asset connectivity...`);
      let useProxy = false;
      try {
        const connectionTest = await testAssetConnection(asset);
        if (connectionTest.success) {
          useProxy = connectionTest.useProxy;
          console.log(`[DICOM_LOAD] ✅ Connection test passed (UseProxy: ${useProxy})`);
        } else {
          console.warn(`[DICOM_LOAD] ⚠️ Connection test failed, will attempt direct download anyway:`, connectionTest.error);
        }
      } catch (testError) {
        console.warn(`[DICOM_LOAD] ⚠️ Connection test error, will attempt direct download anyway:`, testError);
      }
      
      console.log(`[DICOM_LOAD] Proceeding with download...`);
      
      const token = sessionStorage.getItem('1rad_token') || sessionStorage.getItem('1rad_initiation_token');
      
      // Check if URL is accessible with retry mechanism
      let response;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount <= maxRetries) {
        try {
          console.log(`[DICOM_LOAD] Attempt ${retryCount + 1}/${maxRetries + 1} - Fetching: ${asset.remoteUrl}`);
          
          response = await fetch(asset.remoteUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/zip, application/octet-stream, */*',
            },
            // Add credentials if needed for authenticated endpoints
            credentials: 'same-origin'
          });
          
          if (response.ok) {
            break; 
          } else if (retryCount < maxRetries && (response.status >= 500 || response.status === 429)) {
            console.warn(`[DICOM_LOAD] Retryable error ${response.status}, waiting before retry...`);
            await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
            retryCount++;
            continue;
          } else {
            break;
          }
        } catch (fetchError) {
          console.error(`[DICOM_LOAD] Fetch error (attempt ${retryCount + 1}):`, fetchError);
          
          // Check for CORS-specific errors
          if (fetchError.message.includes('CORS') || 
              fetchError.message.includes('Access-Control-Allow-Origin') ||
              (fetchError.name === 'TypeError' && fetchError.message.includes('Failed to fetch'))) {
            
            // Try API proxy as fallback for CORS issues
            if (retryCount === 0) {
              console.log(`[DICOM_LOAD] CORS error detected, trying API proxy fallback...`);
              try {
                const proxyResponse = await apiClient.get(`/Study/proxy-asset`, {
                  params: { url: asset.remoteUrl },
                  responseType: 'blob'
                });
                
                if (proxyResponse.data && proxyResponse.status === 200) {
                  console.log(`[DICOM_LOAD] ✅ API proxy successful`);
                  // Convert axios response to fetch-like response
                  response = {
                    ok: true,
                    status: proxyResponse.status,
                    blob: async () => proxyResponse.data,
                    headers: new Headers(proxyResponse.headers)
                  };
                  break;
                }
              } catch (proxyError) {
                console.warn(`[DICOM_LOAD] API proxy failed:`, proxyError);
                console.warn(`[DICOM_LOAD] Proxy error details:`, {
                  status: proxyError.response?.status,
                  statusText: proxyError.response?.statusText,
                  message: proxyError.message
                });
                // Continue with original CORS error handling
              }
            }
            
            throw new Error(`CORS_ERROR: Cross-origin request blocked. The server needs to be configured to allow requests from this domain. ${fetchError.message}`);
          }
          
          if (retryCount < maxRetries) {
            console.warn(`[DICOM_LOAD] Network error, retrying in ${(retryCount + 1) * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
            retryCount++;
            continue;
          } else {
            throw new Error(`NETWORK_ERROR: Unable to download study data after ${maxRetries + 1} attempts. ${fetchError.message}`);
          }
        }
      }
      
      if (!response.ok) {
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          url: asset.remoteUrl
        };
        console.error(`[DICOM_LOAD] HTTP Error:`, errorDetails);
        
        if (response.status === 404) {
          throw new Error(`FILE_NOT_FOUND: The study file is no longer available on the server (HTTP 404).`);
        } else if (response.status === 403) {
          throw new Error(`ACCESS_DENIED: You don't have permission to access this study file (HTTP 403).`);
        } else if (response.status === 500) {
          throw new Error(`SERVER_ERROR: The server encountered an error while retrieving the study (HTTP 500).`);
        } else {
          throw new Error(`HTTP_ERROR: Server returned ${response.status} ${response.statusText} when fetching study data.`);
        }
      }
      
      let blob;
      try {
        blob = await response.blob();
        console.log(`[DICOM_LOAD] Binary stream received. Size: ${(blob.size / (1024*1024)).toFixed(2)} MB. Content-Type: ${blob.type}`);
        
        if (blob.size === 0) {
          throw new Error('EMPTY_FILE: The downloaded study file is empty (0 bytes).');
        }
        
      } catch (blobError) {
        console.error(`[DICOM_LOAD] Blob conversion error:`, blobError);
        throw new Error(`DATA_CONVERSION_ERROR: Failed to process downloaded study data. ${blobError.message}`);
      }
      
      // Use optimized processor with progress tracking and corruption detection
      let result;
      try {
        console.log(`[DICOM_LOAD] Starting DICOM processing...`);
        result = await dicomOptimizer.processZipFileOptimized(
          blob,
          (progress) => {
            setLoadingProgress(progress);
            const statusParts = [`${progress.stage}: ${progress.current}/${progress.total} files`];
            if (progress.seriesCount) statusParts.push(`(${progress.seriesCount} series found)`);
            if (progress.corruptedFiles > 0) statusParts.push(`⚠️ ${progress.corruptedFiles} corrupted`);
            setProcessingStatus(statusParts.join(' '));
          },
          (seriesInfo) => {
            console.log(`[DICOM_LOAD] New series discovered: ${seriesInfo.seriesDesc}`);
          }
        );
        
        if (!result || !result.series) {
          throw new Error('PROCESSING_FAILED: DICOM processor returned invalid result.');
        }
        
      } catch (processingError) {
        console.error(`[DICOM_LOAD] Processing error:`, processingError);
        throw new Error(`DICOM_PROCESSING_ERROR: Failed to process study files. ${processingError.message}`);
      }

      const classifiedAssets = result.series;
      const stats = result.stats;

      // Log statistics
      console.log(`[DICOM_LOAD] Processing statistics:`, stats);
      
      // Show warning if corrupted files were found
      if (stats.corruptedFiles > 0) {
        console.warn(`[DICOM_LOAD] ⚠️ Eliminated ${stats.corruptedFiles} corrupted files from study`);
        setProcessingStatus(`✅ Loaded ${stats.validFiles} valid files (eliminated ${stats.corruptedFiles} corrupted)`);
        
        // Show user notification
        setTimeout(() => {
          if (stats.corruptedFiles > 0) {
            alert(`Study loaded successfully!\n\n✅ Valid files: ${stats.validFiles}\n⚠️ Corrupted files eliminated: ${stats.corruptedFiles}\n\nCorrupted files have been automatically removed to ensure optimal viewing.`);
          }
        }, 1000);
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
        },
        stats: {
          totalFiles: stats.totalFiles,
          validFiles: stats.validFiles,
          corruptedFiles: stats.corruptedFiles
        }
      }));

      console.log(`[DICOM_LOAD] Optimized processing complete. Discovered ${finalAssets.length} valid diagnostic series.`);

      // TACTICAL CACHE STORAGE
      if (finalAssets.length > 0) {
        try {
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
          console.log(`[DICOM_LOAD] Asset ${asset.id} persisted to persistent cache.`);
        } catch (cacheError) {
          console.warn(`[DICOM_LOAD] Cache storage failed (non-critical):`, cacheError);
          // Don't throw error for cache failures, just log warning
        }
      }

      setUploadedFiles(prev => {
        const newFiles = [...prev];
        if (finalAssets.length > 0) {
          newFiles.splice(index, 1, ...finalAssets);
        } else {
          console.warn('[DICOM_LOAD] No valid DICOM series found in ZIP container.');
          newFiles[index] = { ...asset, needsHydration: false, rawFiles: [] };
        }
        return newFiles;
      });
      setIsDicomImage(true);
    } catch (err) {
      console.error('[DICOM_LOAD] Optimized hydration failure', err);
      setProcessingStatus(`Error: ${err.message}`);
      
      // Provide user-friendly error messages based on error type
      let userMessage = 'DIAGNOSTIC SIGNAL FAILURE: ';
      
      if (err.message.includes('CORS_ERROR')) {
        userMessage += 'Server configuration issue detected. The DICOM storage server needs to allow cross-origin requests. Please contact your system administrator to configure CORS settings for the Azure Blob Storage.';
      } else if (err.message.includes('NETWORK_ERROR') || err.message.includes('Failed to fetch')) {
        userMessage += 'Unable to download study data. Please check your internet connection and try again.';
      } else if (err.message.includes('FILE_NOT_FOUND')) {
        userMessage += 'The study file is no longer available. It may have been moved or deleted.';
      } else if (err.message.includes('ACCESS_DENIED')) {
        userMessage += 'Access denied. Please check your permissions or contact your administrator.';
      } else if (err.message.includes('EMPTY_FILE')) {
        userMessage += 'The study file appears to be empty or corrupted.';
      } else if (err.message.includes('DICOM_PROCESSING_ERROR')) {
        userMessage += 'Failed to process DICOM files. The study may contain unsupported formats.';
      } else {
        userMessage += err.message;
      }
      
      // Show detailed error in console for debugging
      console.error('[DICOM_LOAD] Full error details:', {
        message: err.message,
        stack: err.stack,
        asset: {
          id: asset?.id,
          name: asset?.name,
          remoteUrl: asset?.remoteUrl
        }
      });
      
      // Enhanced error display with actionable guidance
      const errorDetails = {
        title: 'DIAGNOSTIC SIGNAL FAILURE',
        message: userMessage,
        technicalDetails: err.message,
        suggestions: []
      };
      
      if (err.message.includes('CORS_ERROR')) {
        errorDetails.suggestions = [
          '1. Contact your system administrator to configure CORS settings',
          '2. Ensure Azure Blob Storage allows requests from this domain',
          '3. Try accessing from the production environment instead of localhost'
        ];
      } else if (err.message.includes('NETWORK_ERROR')) {
        errorDetails.suggestions = [
          '1. Check your internet connection',
          '2. Try refreshing the page',
          '3. Contact IT support if the problem persists'
        ];
      }
      
      // Display comprehensive error information
      const errorMessage = `${errorDetails.title}\n\n${errorDetails.message}\n\n` +
        (errorDetails.suggestions.length > 0 ? 
          `Suggested Actions:\n${errorDetails.suggestions.join('\n')}\n\n` : '') +
        `Technical Details: ${errorDetails.technicalDetails}`;
      
      alert(errorMessage);
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



  const undo = () => {
    if (history && historyIndex > 0) {
      const prev = history[historyIndex - 1];
      if (prev !== undefined) {
        setHistoryIndex(historyIndex - 1);
        setEditorText(prev);
        if (textareaRef.current) textareaRef.current.innerHTML = prev;
      }
    }
  };

  const redo = () => {
    if (history && historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      if (next !== undefined) {
        setHistoryIndex(historyIndex + 1);
        setEditorText(next);
        if (textareaRef.current) textareaRef.current.innerHTML = next;
      }
    }
  };

  const formatText = (style) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    if (style === 'bold') document.execCommand('bold', false, null);
    else if (style === 'italic') document.execCommand('italic', false, null);
    else if (style === 'underline') document.execCommand('underline', false, null);
    else if (style === 'h1') document.execCommand('formatBlock', false, '<h1>');
    else if (style === 'list') document.execCommand('insertUnorderedList', false, null);
    else if (style === 'list-num') document.execCommand('insertOrderedList', false, null);
    else if (style.startsWith('fontName:')) {
      const font = style.split(':')[1];
      document.execCommand('fontName', false, font);
    }
    else if (style.startsWith('fontSize:')) {
      const size = style.split(':')[1];
      document.execCommand('fontSize', false, size);
    }
    else if (style.startsWith('color:')) {
      const color = style.split(':')[1];
      document.execCommand('foreColor', false, color);
    }
    else if (style.startsWith('hilite:')) {
      const color = style.split(':')[1];
      document.execCommand('hiliteColor', false, color);
    }
    setEditorText(el.innerHTML);
  };
  const insertContent = (content) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    
    let htmlContent = content;
    // Check if content is a Markdown-style table and convert to real HTML
    if (content.trim().startsWith('|')) {
      const rows = content.trim().split('\n').filter(r => !r.includes('---') && r.trim() !== '');
      htmlContent = `<table style="width:100%; border-collapse: collapse; margin: 15px 0; border: 1px solid #e2e8f0;">` + 
        rows.map((row, i) => {
          const cells = row.split('|').filter(c => c.trim() !== '' || row.indexOf('|') !== row.lastIndexOf('|'));
          const tag = i === 0 ? 'th' : 'td';
          return `<tr>${cells.map(c => `<${tag} style="border: 1px solid #e2e8f0; padding: 10px; background: ${i === 0 ? '#f8fafc' : '#fff'}; text-align: left;">${c.trim() || '&nbsp;'}</${tag}>`).join('')}</tr>`;
        }).join('') + 
        `</table><p>&nbsp;</p>`;
    } else {
      htmlContent = content.replace(/\n/g, '<br>');
    }

    document.execCommand('insertHTML', false, htmlContent);
    setEditorText(el.innerHTML);
  };

  // Initialize content once
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.innerHTML = editorText;
    }
  }, []);

  const handleEditorChange = (e) => {
    const html = e.currentTarget.innerHTML || '';
    setEditorText(html);
    
    // Save to history (debounce-ish)
    if (history && Math.abs(html.length - (history[historyIndex]?.length || 0)) > 10) {
      const newHistory = (history || []).slice(0, historyIndex + 1);
      newHistory.push(html);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  const toggleFullscreen = () => {
    const container = document.querySelector('.panel-right');
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(err => {
        console.error(`Error: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Sync state if user exits via Escape key
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);



  const handleSuggestionSelect = () => {
    insertContent('Gall bladder shows echogenic calculi with posterior acoustic shadowing. No pericholecystic fluid is seen.');
    setShowInlineSuggestion(false);
  };

  const handlePreviewPrint = () => setIsPreviewOpen(true);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const el = textareaRef.current;
      if (!el) return;
      
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      
      const range = selection.getRangeAt(0);
      const text = range.startContainer.textContent || '';
      const cursor = range.startOffset;
      const beforeCursor = text.substring(0, cursor);
      const lastSegment = beforeCursor.split(/\s+/).pop();

      const match = keywordLibrary.find(k => (k.trigger || '').toLowerCase() === lastSegment.toLowerCase());
      if (match) {
        e.preventDefault();
        
        // Remove the keyword text
        range.setStart(range.startContainer, cursor - lastSegment.length);
        range.deleteContents();
        
        // Insert the paragraph
        const html = (match.replacementText || '').replace(/\n/g, '<br>');
        document.execCommand('insertHTML', false, html);
        
        setEditorText(el.innerHTML);
      }
    }
  };



  // --- TACTICAL LAYOUT ENGINE ---
  const handleResizing = useCallback((e) => {
    if (!isResizing.current) return;
    const newWidth = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
    if (newWidth > 5 && newWidth < 85) {
      setEditorWidth(newWidth);
      if (newWidth < 8) setEditorState('collapsed');
      else if (newWidth > 70) setEditorState('expanded');
      else setEditorState('custom');
    }
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleResizing);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, [handleResizing]);

  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleResizing);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [handleResizing, stopResizing]);

  useEffect(() => {
    const handleKeys = (e) => {
      if (e.ctrlKey && e.key === '[') setEditorState('collapsed');
      if (e.ctrlKey && e.key === ']') setEditorState('expanded');
      if (e.ctrlKey && e.key === '\\') setEditorState('standard');
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, []);

  // --- DICOM VIEWER KEYBOARD SHORTCUTS ---
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  
  useEffect(() => {
    const handleDicomShortcuts = (e) => {
      // Only activate shortcuts when DICOM viewer is active
      if (!isDicomImage) return;
      
      // Ignore shortcuts when typing in input fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      // Prevent default for our shortcuts
      const shortcutKeys = ['w', 'z', 'p', 's', 'l', 'h', 'b', 'a', 'c', 'e', 'r', 'f', 'm', 'i', 'v', 'x', 'k', 'n', 't', 'g', 'y'];
      if (shortcutKeys.includes(e.key.toLowerCase()) || e.key === 'Escape' || e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
      }

      // Tool Selection Shortcuts
      switch(e.key.toLowerCase()) {
        // Navigation & Manipulation
        case 'w':
          setActiveTool('WindowLevelTool');
          console.log('[SHORTCUT] Window/Level (W)');
          break;
        case 'z':
          setActiveTool('ZoomTool');
          console.log('[SHORTCUT] Zoom (Z)');
          break;
        case 'p':
          setActiveTool('PanTool');
          console.log('[SHORTCUT] Pan (P)');
          break;
        case 's':
          setActiveTool('StackScrollTool');
          console.log('[SHORTCUT] Stack Scroll (S)');
          break;

        // Measurement Tools
        case 'l':
          setActiveTool('LengthTool');
          console.log('[SHORTCUT] Length (L)');
          break;
        case 'h':
          setActiveTool('HeightTool');
          console.log('[SHORTCUT] Height (H)');
          break;
        case 'b':
          setActiveTool('BidirectionalTool');
          console.log('[SHORTCUT] Bidirectional/RECIST (B)');
          break;
        case 'a':
          setActiveTool('AngleTool');
          console.log('[SHORTCUT] Angle (A)');
          break;
        case 'c':
          setActiveTool('CobbAngleTool');
          console.log('[SHORTCUT] Cobb Angle (C)');
          break;

        // ROI Tools
        case 'e':
          setActiveTool('EllipticalROITool');
          console.log('[SHORTCUT] Elliptical ROI (E)');
          break;
        case 'r':
          setActiveTool('RectangleROITool');
          console.log('[SHORTCUT] Rectangle ROI (R)');
          break;
        case 'o':
          setActiveTool('CircleROITool');
          console.log('[SHORTCUT] Circle ROI (O)');
          break;
        case 'f':
          setActiveTool('PlanarFreehandROITool');
          console.log('[SHORTCUT] Freehand ROI (F)');
          break;

        // Analysis Tools
        case 'u':
          setActiveTool('ProbeTool');
          console.log('[SHORTCUT] Probe/HU (U)');
          break;
        case 'n':
          setActiveTool('ArrowAnnotateTool');
          console.log('[SHORTCUT] Arrow Annotation (N)');
          break;
        case 'm':
          setActiveTool('AdvancedMagnifyTool');
          console.log('[SHORTCUT] Magnify (M)');
          break;

        // Image Manipulation
        case 'i':
          setViewportProps(prev => ({ ...prev, invert: !prev.invert }));
          console.log('[SHORTCUT] Invert (I)');
          break;
        case 'x':
          setViewportProps(prev => ({ ...prev, flipHorizontal: !prev.flipHorizontal }));
          console.log('[SHORTCUT] Flip Horizontal (X)');
          break;
        case 'y':
          setViewportProps(prev => ({ ...prev, flipVertical: !prev.flipVertical }));
          console.log('[SHORTCUT] Flip Vertical (Y)');
          break;
        case 't':
          setViewportProps(prev => ({ ...prev, rotation: (prev.rotation + 90) % 360 }));
          console.log('[SHORTCUT] Rotate 90° (T)');
          break;

        // Playback & Navigation
        case ' ':
          setCineEnabled(prev => !prev);
          console.log('[SHORTCUT] Toggle Cine (Space)');
          break;
        case 'k':
          toggleKeyImage();
          console.log('[SHORTCUT] Toggle Key Image (K)');
          break;
        case 'v':
          setIsSyncEnabled(prev => !prev);
          console.log('[SHORTCUT] Toggle Sync (V)');
          break;

        // Layout
        case '1':
          if (e.ctrlKey) {
            setLayoutMode('1x1');
            console.log('[SHORTCUT] 1x1 Layout (Ctrl+1)');
          }
          break;
        case '2':
          if (e.ctrlKey) {
            setLayoutMode('1x2');
            console.log('[SHORTCUT] 1x2 Layout (Ctrl+2)');
          }
          break;
        case '3':
          if (e.ctrlKey) {
            setLayoutMode('2x2');
            console.log('[SHORTCUT] 2x2 Layout (Ctrl+3)');
          }
          break;

        // Reset & Help
        case 'escape':
          setActiveTool('WindowLevelTool');
          setResetTrigger(prev => prev + 1);
          console.log('[SHORTCUT] Reset (Escape)');
          break;
        case '?':
          if (e.shiftKey) {
            setShowShortcutsHelp(prev => !prev);
            console.log('[SHORTCUT] Toggle Help (?)');
          }
          break;
      }

      // Arrow keys for series/slice navigation
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Navigate between series
        if (e.key === 'ArrowUp' && activeAssetIndex > 0) {
          setActiveAssetIndex(prev => prev - 1);
          console.log('[SHORTCUT] Previous Series (↑)');
        } else if (e.key === 'ArrowDown' && activeAssetIndex < uploadedFiles.length - 1) {
          setActiveAssetIndex(prev => prev + 1);
          console.log('[SHORTCUT] Next Series (↓)');
        }
      }

      // Ctrl+S to save report
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSaveReport(false);
        console.log('[SHORTCUT] Save Report (Ctrl+S)');
      }

      // Ctrl+Shift+S to finalize report
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        handleSaveReport(true);
        console.log('[SHORTCUT] Finalize Report (Ctrl+Shift+S)');
      }
    };

    window.addEventListener('keydown', handleDicomShortcuts);
    return () => window.removeEventListener('keydown', handleDicomShortcuts);
  }, [isDicomImage, activeAssetIndex, uploadedFiles.length]);

  // Keyboard shortcuts help modal
  const renderShortcutsHelp = () => {
    if (!showShortcutsHelp) return null;
    
    return (
      <div className="overlay" style={{ zIndex: 10002, background: 'rgba(15, 23, 42, 0.95)' }} onClick={() => setShowShortcutsHelp(false)}>
        <div className="modal" style={{ 
          width: '800px', 
          maxHeight: '85vh', 
          overflow: 'auto',
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          border: '2px solid rgba(59, 130, 246, 0.3)',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)'
        }} onClick={e => e.stopPropagation()}>
          <div className="modal-header" style={{ 
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', 
            color: 'white',
            padding: '20px 25px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '24px' }}>⚡</span>
              <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '1px' }}>DICOM VIEWER KEYBOARD SHORTCUTS</span>
            </div>
            <button 
              className="tool-btn" 
              onClick={() => setShowShortcutsHelp(false)}
              style={{ 
                background: 'rgba(255,255,255,0.2)', 
                color: 'white', 
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '6px',
                width: '32px',
                height: '32px'
              }}
            >✕</button>
          </div>
          <div className="modal-body" style={{ padding: '25px', background: 'white' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '25px', fontSize: '12px' }}>
              <div>
                <h4 style={{ color: '#3b82f6', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🎮</span> Navigation & Manipulation
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>W</kbd> 
                    <span>Window/Level Tool</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>Z</kbd> 
                    <span>Zoom Tool</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>P</kbd> 
                    <span>Pan Tool</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>S</kbd> 
                    <span>Stack Scroll</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 style={{ color: '#10b981', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📏</span> Measurements
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>L</kbd> 
                    <span>Length Tool</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>H</kbd> 
                    <span>Height Tool</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>B</kbd> 
                    <span>Bidirectional (RECIST)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>A</kbd> 
                    <span>Angle Tool</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>C</kbd> 
                    <span>Cobb Angle</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>U</kbd> 
                    <span>HU Probe</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 style={{ color: '#f59e0b', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🎯</span> ROI Analysis
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>E</kbd> 
                    <span>Elliptical ROI</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>R</kbd> 
                    <span>Rectangle ROI</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>O</kbd> 
                    <span>Circle ROI</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>F</kbd> 
                    <span>Freehand ROI</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>N</kbd> 
                    <span>Arrow Annotation</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>M</kbd> 
                    <span>Magnifier</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '25px', marginTop: '25px', fontSize: '12px' }}>
              <div>
                <h4 style={{ color: '#8b5cf6', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🎨</span> Image Controls
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>I</kbd> 
                    <span>Invert Colors</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>X</kbd> 
                    <span>Flip Horizontal</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>Y</kbd> 
                    <span>Flip Vertical</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>T</kbd> 
                    <span>Rotate 90°</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>ESC</kbd> 
                    <span>Reset View</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 style={{ color: '#ef4444', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚡</span> Quick Actions
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>Space</kbd> 
                    <span>Toggle Cine</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>K</kbd> 
                    <span>Key Image</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>V</kbd> 
                    <span>Toggle Sync</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>↑↓</kbd> 
                    <span>Series Navigation</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>?</kbd> 
                    <span>Toggle Help</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ 
              marginTop: '25px', 
              padding: '20px', 
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))', 
              borderRadius: '12px', 
              border: '2px solid rgba(59, 130, 246, 0.2)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#3b82f6', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span>🎯</span> PRO TIP
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.6' }}>
                <strong>All advanced measurement and ROI tools are accessible via keyboard shortcuts</strong> while the DICOM viewer is active. 
                The toolbar shows only essential tools to keep the interface clean and maximize viewing space for optimal diagnosis.
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px', fontStyle: 'italic' }}>
                Press any shortcut key while viewing DICOM images to instantly activate the corresponding tool.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (editorState === 'standard') setEditorWidth(45);
    else if (editorState === 'expanded') setEditorWidth(100);
    else if (editorState === 'collapsed') setEditorWidth(5);
  }, [editorState]);

  const insertTable = (preset) => {
    const header = `| ${preset.columns.join(' | ')} |`;
    const separator = `| ${preset.columns.map(() => '---').join(' | ')} |`;
    const row = `| ${preset.columns.map(() => ' ').join(' | ')} |`;
    const tableMd = `\n${header}\n${separator}\n${row}\n`;
    insertContent(tableMd);
    setShowTableModal(false);
  };

  const handleSaveTable = () => {
    if (!newTable.name) return alert('Enter table name');
    setTablePresets([...tablePresets, { id: Date.now(), ...newTable }]);
    setShowTableBuilder(false);
    setNewTable({ name: '', columns: [''] });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const id = 'img_' + Date.now();
      const imgHtml = `<div id="${id}_container" style="margin: 15px 0; text-align: center; position: relative; display: inline-block; width: 50%;"><img src="${event.target.result}" id="${id}" style="width: 100%; border-radius: 8px; border: 1px solid #e2e8f0; cursor: pointer;" onclick="window.onImgClick('${id}')" /><div style="font-size: 11px; color: #64748b; margin-top: 5px;">Clinical Image: ${file.name}</div></div><p>&nbsp;</p>`;
      insertContent(imgHtml);
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  // Expose function to global scope for the inline onclick handler
  useEffect(() => {
    window.onImgClick = (id) => {
      const img = document.getElementById(id);
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const parentRect = textareaRef.current.getBoundingClientRect();
      setSelectedImg(id);
      setImgToolbarPos({ 
        top: rect.top - parentRect.top - 40, 
        left: rect.left - parentRect.left + (rect.width / 2) - 80
      });
    };
  }, []);

  const handleSlashCommand = (cmd) => {
    if (cmd === 'table') setShowTableModal(true);
    else if (cmd === 'image') fileInputRef.current.click();
    else if (cmd === 'diagram') alert('DIAGRAM_NODE: Integrated Flowchart engine coming soon.');
    setShowSlashMenu(false);
  };

  const resizeImg = (size) => {
    if (!selectedImg) return;
    const container = document.getElementById(selectedImg + '_container');
    if (container) {
      container.style.width = size;
      setEditorText(textareaRef.current.innerHTML);
    }
  };

  const deleteImg = () => {
    if (!selectedImg) return;
    const container = document.getElementById(selectedImg + '_container');
    if (container) {
      container.remove();
      setSelectedImg(null);
      setEditorText(textareaRef.current.innerHTML);
    }
  };



  const syncFromStructured = () => {
    // Mock sync logic: takes structured data and generates a clean summary
    const syncText = "SYNALYSIS REPORT:\n" + 
      "Clinical: Pain abdomen, fever.\n" + 
      "Liver: Normal size and echotexture.\n" + 
      "Kidneys: Right measures 10.2 cm. Left measures 9.8 cm.\n" + 
      "Impression: Normal study.";
    setEditorText(syncText);
  };

  const commonPhrases = [
    { label: 'Normal Study', text: 'The study reveals no significant abnormality in the scanned region.' },
    { label: 'Clinical Correlation', text: 'Clinical correlation is suggested for further management.' },
    { label: 'Follow-up Suggested', text: 'A follow-up scan is recommended in 3-6 months to assess progression.' },
    { label: 'Normal Liver', text: 'Liver is normal in size and echotexture. No focal lesion seen.' },
    { label: 'No Calculus', text: 'No evidence of radiopaque calculus or hydronephrosis seen.' }
  ];

  if (loading && !activeAppointment) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', flexDirection: 'column', gap: '20px' }}>
        <div className="clinical-loader" style={{ width: '50px', height: '50px', border: '4px solid rgba(15, 82, 186, 0.1)', borderTopColor: '#0f52ba', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <div style={{ fontSize: '12px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px', textTransform: 'uppercase' }}>Synchronizing Diagnostic Workspace...</div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', flexDirection: 'column', gap: '20px', textAlign: 'center', padding: '20px' }}>
        <div style={{ fontSize: '64px', animation: 'pulse 2s infinite' }}>⚠️</div>
        <h2 style={{ fontWeight: 900, letterSpacing: '4px', color: '#3b82f6' }}>SIGNAL_INTERRUPTED</h2>
        <p style={{ color: '#94a3b8', maxWidth: '500px', lineHeight: '1.6', fontSize: '14px', fontWeight: 600 }}>{error}</p>
        <button 
          className="btn btn-primary" 
          style={{ padding: '12px 30px', borderRadius: '12px', background: '#3b82f6', border: 'none', color: 'white', fontWeight: 800, cursor: 'pointer', marginTop: '20px' }}
          onClick={() => navigate('/doctor-board')}
        >
          RETURN_TO_COMMAND_CENTER
        </button>
        <style>{`
          @keyframes pulse {
            0% { opacity: 0.5; transform: scale(0.95); }
            50% { opacity: 1; transform: scale(1); }
            100% { opacity: 0.5; transform: scale(0.95); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="reporting-app-container">
      {/* SCOPED CSS */}
      <style>{`
        .reporting-app-container {
          height: 100vh;
          width: calc(100% - 24px);
          margin-left: 24px;
          background: #f8fafc;
          color: #1e293b;
          font-family: 'Inter', system-ui, sans-serif;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* HEADER */
        .reporting-header {
          height: 60px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          position: sticky;
          top: 0;
          z-index: 1000;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .back-btn {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          font-weight: 500;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .back-btn:hover { color: #0f172a; }

        .patient-badge-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-left: 15px;
          border-left: 1px solid #e2e8f0;
        }

        @media (max-width: 1100px) {
          .reporting-header { height: auto; padding: 10px 15px; flex-direction: column; align-items: flex-start; gap: 10px; }
          .patient-badge-header { border-left: none; padding-left: 0; }
          .patient-badge-header div:first-child div:first-child { font-size: 16px !important; }
        }

        .header-title {
          font-weight: 700;
          font-size: 16px;
          color: #0f172a;
        }

        .header-meta {
          font-size: 12px;
          color: #64748b;
          background: #f1f5f9;
          padding: 3px 8px;
          border-radius: 4px;
        }

        .modality-badge {
          background: #e0e7ff;
          color: #4338ca;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        .draft-badge {
          background: #fef3c7;
          color: #d97706;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        .header-right {
          display: flex;
          gap: 10px;
        }

        .btn {
          padding: 8px 14px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-outline {
          background: #fff;
          border: 1px solid #cbd5e1;
          color: #475569;
        }
        .btn-outline:hover { background: #f8fafc; color: #0f172a; border-color: #94a3b8; }
        
        .btn-primary {
          background: #2563eb;
          border: 1px solid #2563eb;
          color: #fff;
        }
        .btn-primary:hover { background: #1d4ed8; }

        .btn-success {
          background: #10b981;
          border: 1px solid #10b981;
          color: #fff;
        }
        .btn-success:hover { background: #059669; }

        /* MAIN LAYOUT */
        .main-layout {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        /* PANELS */
        .panel {
          overflow-y: auto;
          padding: 15px;
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .panel-left { width: 300px; background: #f8fafc; border-right: 1px solid #e2e8f0; }
        .panel-center { 
          flex: 1;
          width: ${editorState === 'expanded' ? '0%' : (100 - editorWidth) + '%'};
          display: ${editorState === 'expanded' ? 'none' : 'flex'};
          background: #0f172a; padding: 0; flex-direction: row; /* Changed to row for left toolbar */
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .panel-right { 
          width: ${editorState === 'expanded' ? '100%' : editorWidth + '%'};
          min-width: ${editorState === 'collapsed' ? '60px' : '300px'};
          background: #ffffff; padding: ${editorState === 'collapsed' ? '20px 10px' : '20px 30px'}; 
          overflow-y: auto; display: flex; flex-direction: column; 
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1), padding 0.4s;
          border-left: 1px solid #e2e8f0;
          position: relative;
        }

        /* Tablet and iPad optimizations - Force toolbar visibility */
        @media (max-width: 1366px) and (orientation: landscape), 
               (max-width: 1024px) and (orientation: portrait),
               (pointer: coarse) {
          .main-layout { flex-direction: column; }
          .panel-center { 
            width: 100% !important; 
            height: ${activeWorkspaceMode === 'editor' ? '0' : '65vh'}; 
            display: ${activeWorkspaceMode === 'editor' ? 'none' : 'flex'}; 
            flex-direction: row; /* Keep row to show toolbar */
          }
          
          /* CRITICAL: Force toolbar visibility on tablets */
          #dicom-toolbar,
          .panel-center > div:first-child { 
            width: ${isTablet ? (window.innerWidth > 1024 ? '320px' : '280px') : '200px'} !important;
            height: 100% !important;
            box-shadow: 4px 0 20px rgba(0,0,0,0.3) !important;
            display: flex !important; /* Force toolbar to show on tablets */
            transform: translateX(0) !important; /* Force visible position */
            position: relative !important;
            z-index: 10 !important;
          }
          
          .panel-right { 
            width: 100% !important; 
            height: ${activeWorkspaceMode === 'dicom' ? '0' : 'auto'}; 
            display: ${activeWorkspaceMode === 'dicom' ? 'none' : 'flex'}; 
            border-left: none; 
            padding: 20px 15px; 
          }
          .resizer-handle { display: none; }
          
          /* Touch-friendly button sizes */
          button {
            min-height: 44px !important;
            min-width: 44px !important;
            touch-action: manipulation;
          }
          
          /* Prevent zoom on input focus */
          input, textarea, select {
            font-size: 16px !important;
          }
          
          /* Enhanced touch targets for medical precision */
          .dicom-tool-button {
            min-height: 60px !important;
            min-width: 60px !important;
            padding: 12px !important;
          }
        }

        /* iPad Pro and large tablet optimizations */
        @media only screen 
          and (min-device-width: 1024px) 
          and (max-device-width: 1366px) 
          and (-webkit-min-device-pixel-ratio: 2) {
          
          #dicom-toolbar,
          .panel-center > div:first-child { 
            width: 350px !important;
            display: flex !important; /* Force toolbar to show on iPad Pro */
            transform: translateX(0) !important;
          }
          
          /* Extra large touch targets for iPad Pro */
          button {
            min-height: 52px !important;
            padding: 16px !important;
          }
          
          .dicom-tool-button {
            min-height: 70px !important;
            min-width: 70px !important;
          }
        }

        /* Standard iPad optimizations */
        @media only screen 
          and (min-device-width: 768px) 
          and (max-device-width: 1024px) 
          and (-webkit-min-device-pixel-ratio: 1) {
          
          #dicom-toolbar,
          .panel-center > div:first-child { 
            width: 300px !important;
            display: flex !important; /* Force toolbar to show on iPad */
            transform: translateX(0) !important;
          }
          
          /* Larger touch targets for iPad */
          button {
            min-height: 48px !important;
            padding: 14px !important;
          }
          
          .dicom-tool-button {
            min-height: 65px !important;
            min-width: 65px !important;
          }
        }

        /* iPhone and small tablet portrait - Hide toolbar only on small screens */
        @media (max-width: 768px) {
          .main-layout { flex-direction: column; }
          .panel-center { width: 100% !important; height: 50vh; display: ${activeWorkspaceMode === 'editor' ? 'none' : 'flex'}; flex-direction: column; }
          .panel-center > div:first-child { display: none !important; } /* Hide left toolbar only on small mobile */
          .panel-right { width: 100% !important; height: ${activeWorkspaceMode === 'dicom' ? '0' : 'auto'}; display: ${activeWorkspaceMode === 'dicom' ? 'none' : 'flex'}; border-left: none; padding: 20px 15px; }
          .resizer-handle { display: none; }
        }

        .resizer-handle {
          position: absolute;
          left: -4px;
          top: 0;
          bottom: 0;
          width: 8px;
          cursor: col-resize;
          z-index: 100;
          transition: background 0.2s;
        }
        .resizer-handle:hover {
          background: rgba(15, 82, 186, 0.2);
        }
        .resizer-handle::after {
          content: '';
          position: absolute;
          left: 3px;
          top: 50%;
          transform: translateY(-50%);
          height: 40px;
          width: 2px;
          background: #e2e8f0;
          border-radius: 2px;
        }
        .resizer-handle:hover::after {
          background: #0f52ba;
        }

        /* CARDS */
        .card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 15px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.02);
        }

        .card-header {
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .info-row {
          display: flex;
          margin-bottom: 8px;
          font-size: 13px;
        }
        .info-label { width: 80px; color: #64748b; font-weight: 500; }
        .info-value { flex: 1; color: #0f172a; font-weight: 600; }

        .prior-report-item {
          padding: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          margin-bottom: 8px;
          cursor: pointer;
        }
        .prior-report-item:hover { background: #f1f5f9; border-color: #cbd5e1; }
        
        .prior-title { font-size: 13px; font-weight: 600; color: #2563eb; }
        .prior-date { font-size: 11px; color: #64748b; margin-top: 4px; }

        .keyword-chip {
          display: inline-block;
          background: #eef2ff;
          color: #4f46e5;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          margin: 0 6px 6px 0;
          cursor: pointer;
          border: 1px solid #c7d2fe;
        }
        .keyword-chip:hover { background: #e0e7ff; }

        /* CENTER VIEWER */
        .viewer-header {
          height: 40px;
          background: #1e293b;
          display: flex;
          align-items: center;
          padding: 0 15px;
          color: #94a3b8;
          font-size: 12px;
          justify-content: space-between;
        }

        .viewer-main {
          flex: 1;
          display: flex;
          position: relative;
        }

        .viewer-viewport {
          flex: 1;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #334155;
          font-weight: 600;
          position: relative;
        }

        .viewer-thumbnail-strip {
          width: 100px;
          background: #0f172a;
          border-left: 1px solid #1e293b;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow-y: auto;
        }

        .thumbnail {
          height: 80px;
          background: #1e293b;
          border-radius: 6px;
          border: 2px solid transparent;
          cursor: pointer;
        }
        .thumbnail.active { border-color: #3b82f6; }
        
        .measurements-panel {
          position: absolute;
          bottom: 15px;
          left: 15px;
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(4px);
          padding: 10px;
          border-radius: 8px;
          border: 1px solid #334155;
          color: #e2e8f0;
          font-size: 11px;
        }

        .key-images-panel {
          position: absolute;
          bottom: 15px;
          right: 115px; /* offset for strip */
          display: flex;
          gap: 10px;
        }

        .key-image-card {
          width: 60px;
          height: 60px;
          background: #1e293b;
          border: 1px solid #3b82f6;
          border-radius: 6px;
        }

        /* RIGHT PANEL: REPORTING WORKSPACE */
        .template-selector {
          width: 100%;
          padding: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: #fff;
          font-size: 14px;
          font-weight: 600;
          color: #0f172a;
          margin-bottom: 15px;
          outline: none;
        }

        .tabs {
          display: flex;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 15px;
        }

        .tab {
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
          border-bottom: 2px solid transparent;
        }
        .tab.active {
          color: #2563eb;
          border-bottom-color: #2563eb;
        }

        /* STRUCTURED FORM */
        .struct-container {
          display: flex;
          flex-direction: column;
          gap: 15px;
          padding: 10px 0;
        }

        .struct-section {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 15px 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          transition: all 0.2s;
        }
        .struct-section:focus-within {
          border-color: #3b82f6;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.08);
        }

        .struct-header {
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .struct-header .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          display: inline-block;
          margin-left: 8px;
        }
        .struct-header .status-empty {
          background: #cbd5e1;
        }

        .struct-textarea {
          width: 100%;
          min-height: 40px;
          border: none;
          resize: none;
          outline: none;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.6;
          color: #0f172a;
          background: transparent;
        }
        .struct-textarea::placeholder {
          color: #94a3b8;
          font-style: italic;
        }

        /* RICH EDITOR */
        .editor-container {
          flex-direction: column;
          flex: 1;
          background: #fff;
          height: calc(100vh - 250px);
          position: relative;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.02);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          display: flex;
        }
        
        .panel-right:fullscreen {
          padding: 40px;
          background: #f1f5f9;
          width: 100vw;
          height: 100vh;
        }
        
        .panel-right:fullscreen .tabs {
          display: none;
        }

        .panel-right:fullscreen .editor-container {
          background: #fff;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          max-width: 1200px;
          margin: 0 auto;
          height: calc(100vh - 80px);
          overflow: hidden;
        }

        .panel-right:fullscreen .editor-textarea {
          padding: 60px 100px;
          font-size: 16px;
          height: 100%;
        }
        .editor-container:focus-within {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .editor-toolbar {
          border-bottom: 1px solid #e2e8f0;
          padding: 10px 15px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          background: #f8fafc;
          border-radius: 12px 12px 0 0;
        }

        .tool-btn {
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          border-radius: 6px;
          cursor: pointer;
          color: #475569;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          transition: all 0.15s ease;
        }
        .tool-btn:hover { background: #e2e8f0; color: #0f172a; transform: translateY(-1px); }
        .tool-btn:active { transform: translateY(0); }

        .editor-textarea {
          flex: 1;
          border: none;
          padding: 25px;
          font-size: 15px;
          line-height: 1.8;
          color: #1e293b;
          overflow-y: auto;
          outline: none;
          font-family: 'Inter', sans-serif;
          background: #fff;
          max-height: 100%;
        }
        .editor-textarea table {
          border-collapse: collapse;
          width: 100%;
          margin: 15px 0;
          font-size: 13px;
        }
        .editor-textarea th { background: #f1f5f9; color: #475569; font-weight: 700; border: 1px solid #e2e8f0; padding: 10px; }
        .editor-textarea td { border: 1px solid #e2e8f0; padding: 10px; background: #fff; }
        .editor-textarea::placeholder {
          color: #94a3b8;
          font-weight: 400;
        }

        .template-placeholder {
          background: #fef08a;
          color: #854d0e;
          padding: 0 4px;
          border-radius: 3px;
          border: 1px dashed #ca8a04;
          font-size: 13px;
        }

        /* INLINE SUGGESTION */
        .inline-suggestion {
          position: absolute;
          top: 100px;
          left: 100px;
          width: 300px;
          background: #fff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
          z-index: 50;
          overflow: hidden;
        }

        .suggestion-item {
          padding: 10px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .suggestion-item.active { background: #eff6ff; }
        
        .sugg-header { display: flex; justify-content: space-between; align-items: center; }
        .sugg-keyword { font-weight: 700; font-size: 13px; color: #1d4ed8; }
        .sugg-badge { font-size: 10px; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; color: #475569; }
        .sugg-preview { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* DIAGRAM BLOCK */
        .diagram-block {
          border: 2px dashed #cbd5e1;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          background: #f8fafc;
          margin: 15px 0;
          color: #64748b;
          cursor: pointer;
        }
        .diagram-block:hover { border-color: #94a3b8; background: #f1f5f9; }

        /* MODALS & DRAWERS */
        .overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(4px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal {
          background: #fff;
          border-radius: 12px;
          width: 500px;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
          overflow: hidden;
        }

        .modal-header {
          padding: 15px 20px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 700;
          color: #0f172a;
        }

        .modal-body { padding: 20px; }

        .preset-card {
          border: 1px solid #e2e8f0;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 10px;
          cursor: pointer;
          font-weight: 600;
          color: #334155;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .preset-card:hover { border-color: #3b82f6; background: #eff6ff; color: #1d4ed8; }

        .drawer {
          position: fixed;
          top: 0; right: 0; bottom: 0;
          width: 600px;
          background: #fff;
          box-shadow: -10px 0 50px rgba(0,0,0,0.15);
          z-index: 10000;
          display: flex;
          flex-direction: column;
          animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .table th { background: #f8fafc; padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600; }
        .table td { padding: 10px; border-bottom: 1px solid #e2e8f0; color: #334155; }
        .table tr:hover { background: #f8fafc; }

        /* Keyboard shortcuts styling */
        kbd {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 2px 6px;
          font-family: 'Courier New', monospace;
          font-size: 11px;
          font-weight: 700;
          color: #475569;
          margin-right: 8px;
          display: inline-block;
          min-width: 20px;
          text-align: center;
        }
      `}</style>

      {/* --- HEADER --- */}
      <header className="reporting-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => window.location.href = '/doctor-board'}>← Worklist</button>
          <div className="patient-badge-header">
            <div>
              <div style={{ fontSize: '20px', fontWeight: 950, color: '#1a1a2e', letterSpacing: '-0.5px' }}>{activeAppointment?.patientName?.toUpperCase() || 'LOADING...'}</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ID: {activeAppointment?.patientIdentifier || '...'}</span>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ACC: {activeAppointment?.displayId || '...'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginLeft: '15px' }}>
              <span style={{ background: '#0f52ba', color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 950, letterSpacing: '1px' }}>{activeAppointment?.modality || '...'}</span>
            </div>
          </div>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* COMPACT TIMELINE LINK */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <button
              onClick={() => navigate(`/patient-timeline/${appointmentId}`, { state: { patient: activeAppointment, returnPath: `/reporting/${appointmentId}` } })}
              style={{
                padding: '6px 15px', borderRadius: '7px', border: 'none',
                background: '#0f52ba',
                color: 'white',
                fontWeight: 900, fontSize: '10px', cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex', alignItems: 'center', gap: '5px'
              }}
            >
              🕒 PATIENT_HISTORY
              {patientHistory.length > 0 && (
                <span style={{ background: '#ef4444', color: 'white', borderRadius: '99px', fontSize: '8px', fontWeight: 950, padding: '1px 5px', lineHeight: 1.4, minWidth: '16px', textAlign: 'center' }}>
                  {patientHistory.length}
                </span>
              )}
              {loadingTimeline && (
                <span style={{ display: 'inline-block', width: '8px', height: '8px', border: '1.5px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              )}
            </button>
          </div>

          <div style={{ 
            display: 'flex', gap: '2px', background: 'rgba(15, 82, 186, 0.05)', 
            padding: '4px', borderRadius: '12px', border: '1px solid rgba(15, 82, 186, 0.1)'
          }}>
            {isTablet ? (
               <div style={{ display: 'flex', gap: '5px' }}>
                  <button 
                    onClick={() => setActiveWorkspaceMode('dicom')}
                    style={{ 
                      background: activeWorkspaceMode === 'dicom' ? '#0f52ba' : 'transparent',
                      border: 'none', padding: '8px 15px', borderRadius: '8px', color: activeWorkspaceMode === 'dicom' ? 'white' : '#64748b',
                      fontSize: '11px', fontWeight: 900
                    }}
                  >VIEWER</button>
                  <button 
                    onClick={() => setActiveWorkspaceMode('editor')}
                    style={{ 
                      background: activeWorkspaceMode === 'editor' ? '#0f52ba' : 'transparent',
                      border: 'none', padding: '8px 15px', borderRadius: '8px', color: activeWorkspaceMode === 'editor' ? 'white' : '#64748b',
                      fontSize: '11px', fontWeight: 900
                    }}
                  >EDITOR</button>
               </div>
            ) : (
              [
                { state: 'collapsed', icon: '\u{21E4}', label: 'Diag' },
                { state: 'standard', icon: '\u{2139}', label: 'Split' },
                { state: 'expanded', icon: '\u{21E5}', label: 'Edit' }
              ].map(mode => (
                <button 
                  key={mode.state}
                  onClick={() => setEditorState(mode.state)}
                  style={{ 
                    background: editorState === mode.state ? '#0f52ba' : 'transparent',
                    border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer',
                    color: editorState === mode.state ? 'white' : '#64748b',
                    fontSize: '9px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '4px',
                    transition: 'all 0.3s'
                  }}
                >
                  <span style={{ fontSize: '12px' }}>{mode.icon}</span>
                  {editorState === mode.state && <span>{mode.label.toUpperCase()}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      </header>

      {/* --- MAIN LAYOUT --- */}
      <div className="main-layout">
        
        {/* LEFT PANEL removed for cleaner workspace */}

        {/* CENTER PANEL: DICOM Viewer */}
        <div className="panel panel-center" style={{ display: 'flex' }}>
          {/* LEFT TOOLBAR - Tablet Optimized */}
          <div 
            id="dicom-toolbar"
            style={{
              width: isTablet ? (window.innerWidth > 1024 ? '320px' : '280px') : '200px',
              background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
              borderRight: '2px solid #334155',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: isTablet ? '4px 0 20px rgba(0,0,0,0.3)' : 'none',
              position: 'relative',
              zIndex: 10,
              transition: 'transform 0.3s ease',
              transform: 'translateX(0)' // Default to visible on tablets
            }}>

            {/* Tablet Toolbar Toggle - Show on tablets only */}
            {isTablet && (
              <button
                onClick={() => {
                  const toolbar = document.getElementById('dicom-toolbar');
                  if (toolbar.style.transform === 'translateX(-100%)') {
                    toolbar.style.transform = 'translateX(0)';
                  } else {
                    toolbar.style.transform = 'translateX(-100%)';
                  }
                }}
                style={{
                  position: 'absolute',
                  right: '-40px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  border: 'none',
                  color: 'white',
                  width: '40px',
                  height: '80px',
                  borderRadius: '0 8px 8px 0',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  zIndex: 20,
                  boxShadow: '2px 0 10px rgba(0,0,0,0.3)',
                  touchAction: 'manipulation'
                }}
              >
                🛠️
              </button>
            )}
            {/* Toolbar Header */}
            <div style={{
              padding: isTablet ? '25px 20px' : '15px',
              borderBottom: '2px solid #334155',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              position: 'relative'
            }}>
              <div style={{
                color: 'white',
                fontSize: isTablet ? '16px' : '12px',
                fontWeight: 900,
                letterSpacing: '1px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ fontSize: isTablet ? '24px' : '16px' }}>🛠️</span>
                DICOM TOOLS
              </div>
              {isTablet && (
                <div style={{
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: '11px',
                  marginTop: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span>📱</span> Touch optimized interface
                </div>
              )}
            </div>

            {/* Quick Actions - Tablet Only */}
            {isTablet && (
              <div style={{ padding: '20px', borderBottom: '1px solid #334155', background: 'rgba(59, 130, 246, 0.1)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    onClick={() => {
                      setActiveTool('WindowLevelTool');
                      setResetTrigger(prev => prev + 1);
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      color: 'white',
                      padding: '12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      touchAction: 'manipulation',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>🔄</span>
                    RESET VIEW
                  </button>
                  <button
                    onClick={() => {
                      alert('Touch Gestures:\n\n🤏 Pinch to zoom in/out\n👆 Single finger to pan\n👆👆 Double tap to reset\n🖱️ Use toolbar for measurements\n\nKeyboard shortcuts available when connected to external keyboard.');
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                      border: 'none',
                      color: 'white',
                      padding: '12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      touchAction: 'manipulation',
                      boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>❓</span>
                    HELP
                  </button>
                </div>
              </div>
            )}

            {/* Essential Tools */}
            {/* Navigation Tools */}
            <div style={{ padding: isTablet ? '25px 20px' : '15px', borderBottom: '1px solid #334155' }}>
              <div style={{ 
                color: '#3b82f6', 
                fontSize: isTablet ? '14px' : '10px', 
                fontWeight: 900, 
                marginBottom: isTablet ? '20px' : '10px',
                letterSpacing: '1px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: isTablet ? '18px' : '14px' }}>🎮</span>
                NAVIGATION
              </div>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: isTablet ? '1fr 1fr' : '1fr 1fr 1fr', 
                gap: isTablet ? '12px' : '4px' 
              }}>
                {[
                  { id: 'WindowLevelTool', icon: '☀️', label: 'Window/Level', shortcut: 'W', desc: 'Adjust brightness & contrast' },
                  { id: 'ZoomTool', icon: '🔍', label: 'Zoom', shortcut: 'Z', desc: 'Magnify image' },
                  { id: 'PanTool', icon: '✋', label: 'Pan', shortcut: 'P', desc: 'Move image around' },
                  { id: 'StackScrollTool', icon: '📜', label: 'Scroll', shortcut: 'S', desc: 'Navigate slices' }
                ].map(t => (
                  <button 
                    key={t.id}
                    onClick={() => setActiveTool(t.id)}
                    style={{ 
                      background: activeTool === t.id 
                        ? 'linear-gradient(135deg, #3b82f6, #2563eb)' 
                        : 'rgba(255,255,255,0.05)', 
                      border: activeTool === t.id ? '3px solid #60a5fa' : '3px solid transparent',
                      color: activeTool === t.id ? 'white' : '#e2e8f0',
                      padding: isTablet ? '16px 12px' : '6px 4px',
                      borderRadius: '10px',
                      fontSize: isTablet ? '11px' : '8px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: isTablet ? '8px' : '3px',
                      transition: 'all 0.3s ease',
                      width: '100%',
                      textAlign: 'center',
                      minHeight: isTablet ? '80px' : '45px',
                      touchAction: 'manipulation',
                      boxShadow: activeTool === t.id 
                        ? '0 6px 20px rgba(59, 130, 246, 0.4)' 
                        : '0 2px 8px rgba(0,0,0,0.1)',
                      transform: activeTool === t.id ? 'translateY(-2px)' : 'none'
                    }}
                    title={isTablet ? t.desc : undefined}
                  >
                    <span style={{ fontSize: isTablet ? '20px' : '12px' }}>{t.icon}</span> 
                    <span style={{ fontSize: isTablet ? '10px' : '7px', lineHeight: '1.2', textAlign: 'center' }}>
                      {t.label}
                    </span>
                    <span style={{ 
                      fontSize: isTablet ? '9px' : '6px', 
                      background: 'rgba(255,255,255,0.2)', 
                      padding: isTablet ? '3px 6px' : '1px 2px', 
                      borderRadius: '4px',
                      letterSpacing: '0.5px'
                    }}>{t.shortcut}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Measurement Tools */}
            <div style={{ padding: isTablet ? '25px 20px' : '15px', borderBottom: '1px solid #334155' }}>
              <div style={{ 
                color: '#10b981', 
                fontSize: isTablet ? '14px' : '10px', 
                fontWeight: 900, 
                marginBottom: isTablet ? '20px' : '10px',
                letterSpacing: '1px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: isTablet ? '18px' : '14px' }}>📏</span>
                MEASUREMENTS
              </div>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: isTablet ? '1fr 1fr' : '1fr 1fr 1fr', 
                gap: isTablet ? '12px' : '4px' 
              }}>
                {[
                  { id: 'LengthTool', icon: '📏', label: 'Length', shortcut: 'L', desc: 'Measure distance' },
                  { id: 'HeightTool', icon: '📐', label: 'Height', shortcut: 'H', desc: 'Measure height' },
                  { id: 'BidirectionalTool', icon: '↔️', label: 'Bidirectional', shortcut: 'B', desc: 'RECIST measurement' },
                  { id: 'AngleTool', icon: '∠', label: 'Angle', shortcut: 'A', desc: 'Measure angles' },
                  { id: 'CobbAngleTool', icon: '🦴', label: 'Cobb Angle', shortcut: 'C', desc: 'Spine curvature' },
                  { id: 'CircleROITool', icon: '🔵', label: 'Circle ROI', shortcut: 'O', desc: 'Circular region' }
                ].map(t => (
                  <button 
                    key={t.id}
                    onClick={() => setActiveTool(t.id)}
                    style={{ 
                      background: activeTool === t.id 
                        ? 'linear-gradient(135deg, #10b981, #059669)' 
                        : 'rgba(255,255,255,0.05)', 
                      border: activeTool === t.id ? '3px solid #34d399' : '3px solid transparent',
                      color: activeTool === t.id ? 'white' : '#e2e8f0',
                      padding: isTablet ? '16px 12px' : '6px 4px',
                      borderRadius: '10px',
                      fontSize: isTablet ? '11px' : '8px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: isTablet ? '8px' : '3px',
                      transition: 'all 0.3s ease',
                      width: '100%',
                      textAlign: 'center',
                      minHeight: isTablet ? '80px' : '45px',
                      touchAction: 'manipulation',
                      boxShadow: activeTool === t.id 
                        ? '0 6px 20px rgba(16, 185, 129, 0.4)' 
                        : '0 2px 8px rgba(0,0,0,0.1)',
                      transform: activeTool === t.id ? 'translateY(-2px)' : 'none'
                    }}
                    title={isTablet ? t.desc : undefined}
                  >
                    <span style={{ fontSize: isTablet ? '20px' : '12px' }}>{t.icon}</span> 
                    <span style={{ fontSize: isTablet ? '10px' : '7px', lineHeight: '1.2', textAlign: 'center' }}>
                      {t.label}
                    </span>
                    <span style={{ 
                      fontSize: isTablet ? '9px' : '6px', 
                      background: 'rgba(255,255,255,0.2)', 
                      padding: isTablet ? '3px 6px' : '1px 2px', 
                      borderRadius: '4px',
                      letterSpacing: '0.5px'
                    }}>{t.shortcut}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ROI Analysis Tools */}
            <div style={{ padding: isTablet ? '25px 20px' : '15px', borderBottom: '1px solid #334155' }}>
              <div style={{ 
                color: '#f59e0b', 
                fontSize: isTablet ? '14px' : '10px', 
                fontWeight: 900, 
                marginBottom: isTablet ? '20px' : '10px',
                letterSpacing: '1px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: isTablet ? '18px' : '14px' }}>🎯</span>
                ROI ANALYSIS
              </div>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: isTablet ? '1fr 1fr' : '1fr 1fr 1fr', 
                gap: isTablet ? '12px' : '4px' 
              }}>
                {[
                  { id: 'EllipticalROITool', icon: '⭕', label: 'Ellipse ROI', shortcut: 'E', desc: 'Elliptical region' },
                  { id: 'RectangleROITool', icon: '⬜', label: 'Rectangle ROI', shortcut: 'R', desc: 'Rectangular region' },
                  { id: 'PlanarFreehandROITool', icon: '✏️', label: 'Freehand ROI', shortcut: 'F', desc: 'Custom shape' },
                  { id: 'ProbeTool', icon: '🎯', label: 'HU Probe', shortcut: 'U', desc: 'Pixel values' },
                  { id: 'ArrowAnnotateTool', icon: '➡️', label: 'Arrow', shortcut: 'N', desc: 'Point annotation' },
                  { id: 'AdvancedMagnifyTool', icon: '🔍', label: 'Magnify', shortcut: 'M', desc: 'Magnification tool' }
                ].map(t => (
                  <button 
                    key={t.id}
                    onClick={() => setActiveTool(t.id)}
                    style={{ 
                      background: activeTool === t.id 
                        ? 'linear-gradient(135deg, #f59e0b, #d97706)' 
                        : 'rgba(255,255,255,0.05)', 
                      border: activeTool === t.id ? '3px solid #fbbf24' : '3px solid transparent',
                      color: activeTool === t.id ? 'white' : '#e2e8f0',
                      padding: isTablet ? '16px 12px' : '6px 4px',
                      borderRadius: '10px',
                      fontSize: isTablet ? '11px' : '8px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: isTablet ? '8px' : '3px',
                      transition: 'all 0.3s ease',
                      width: '100%',
                      textAlign: 'center',
                      minHeight: isTablet ? '80px' : '45px',
                      touchAction: 'manipulation',
                      boxShadow: activeTool === t.id 
                        ? '0 6px 20px rgba(245, 158, 11, 0.4)' 
                        : '0 2px 8px rgba(0,0,0,0.1)',
                      transform: activeTool === t.id ? 'translateY(-2px)' : 'none'
                    }}
                    title={isTablet ? t.desc : undefined}
                  >
                    <span style={{ fontSize: isTablet ? '20px' : '12px' }}>{t.icon}</span> 
                    <span style={{ fontSize: isTablet ? '10px' : '7px', lineHeight: '1.2', textAlign: 'center' }}>
                      {t.label}
                    </span>
                    <span style={{ 
                      fontSize: isTablet ? '9px' : '6px', 
                      background: 'rgba(255,255,255,0.2)', 
                      padding: isTablet ? '3px 6px' : '1px 2px', 
                      borderRadius: '4px',
                      letterSpacing: '0.5px'
                    }}>{t.shortcut}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tablet Footer Info */}
            {isTablet && (
              <div style={{ 
                padding: '20px', 
                background: 'rgba(15, 23, 42, 0.8)',
                marginTop: 'auto'
              }}>
                <div style={{ 
                  color: '#94a3b8', 
                  fontSize: '10px', 
                  lineHeight: '1.4',
                  textAlign: 'center'
                }}>
                  <div style={{ marginBottom: '8px', color: '#e2e8f0', fontWeight: 700 }}>
                    📱 TABLET OPTIMIZED
                  </div>
                  <div style={{ marginBottom: '4px' }}>
                    • Touch gestures for navigation
                  </div>
                  <div style={{ marginBottom: '4px' }}>
                    • Large touch targets (WCAG AA)
                  </div>
                  <div>
                    • Professional medical imaging
                  </div>
                </div>
              </div>
            )}

            {/* Advanced Tools Info */}
            <div style={{ padding: '15px', background: 'rgba(59, 130, 246, 0.1)' }}>
              <div style={{ 
                color: '#3b82f6', 
                fontSize: '9px', 
                fontWeight: 900, 
                marginBottom: '8px',
                letterSpacing: '1px'
              }}>
                ⚡ QUICK ACCESS
              </div>
              <div style={{ fontSize: '8px', color: '#94a3b8', lineHeight: '1.4' }}>
                <div style={{ marginBottom: '4px' }}>
                  <strong style={{ color: '#e2e8f0' }}>All tools accessible via keyboard shortcuts</strong>
                </div>
                <div style={{ marginBottom: '2px' }}>• Press <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 3px', borderRadius: '2px', fontSize: '7px' }}>ESC</kbd> to reset</div>
                <div>• Press <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 3px', borderRadius: '2px', fontSize: '7px' }}>?</kbd> for help</div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: 'auto', padding: '15px' }}>
              <button
                onClick={() => setShowShortcutsHelp(true)}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2))',
                  border: '1px solid rgba(139, 92, 246, 0.5)',
                  color: '#c4b5fd',
                  padding: '8px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>❓</span> SHORTCUTS
              </button>
            </div>
          </div>

          {/* MAIN VIEWER AREA */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Top Controls */}
            <div style={{ 
              height: '50px', 
              background: '#1e293b', 
              borderBottom: '1px solid #334155', 
              display: 'flex', 
              alignItems: 'center', 
              padding: '0 15px', 
              gap: '15px', 
              justifyContent: 'space-between' 
            }}>
              {/* Active Tool Display */}
              <div style={{
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.5)',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 900,
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>⚡</span> ACTIVE: {activeTool.replace('Tool', '').toUpperCase()}
              </div>

              {/* Controls */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button 
                  onClick={() => setCineEnabled(!cineEnabled)} 
                  title="Toggle Cine Mode (Space)"
                  style={{ 
                    background: cineEnabled ? '#ef4444' : 'rgba(255,255,255,0.08)', 
                    border: '2px solid ' + (cineEnabled ? '#f87171' : 'transparent'),
                    color: 'white', 
                    padding: '6px 10px', 
                    borderRadius: '6px', 
                    fontSize: '10px', 
                    fontWeight: 900, 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>🎬</span> CINE
                </button>
                
                <select 
                  value={layoutMode} 
                  onChange={e => setLayoutMode(e.target.value)}
                  style={{ 
                    background: 'rgba(255,255,255,0.08)', 
                    color: 'white', 
                    border: '2px solid #334155', 
                    padding: '6px 10px', 
                    borderRadius: '6px', 
                    fontSize: '10px', 
                    fontWeight: 900, 
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="1x1" style={{ background: '#1e293b', color: 'white' }}>1×1</option>
                  <option value="2x2" style={{ background: '#1e293b', color: 'white' }}>2×2</option>
                </select>

                {/* FULLSCREEN BUTTON */}
                <button
                  onClick={() => {
                    console.log('[FULL VIEW] Button clicked');
                    console.log('[FULL VIEW] uploadedFiles:', uploadedFiles);
                    console.log('[FULL VIEW] uploadedFiles.length:', uploadedFiles.length);
                    console.log('[FULL VIEW] Total series count:', uploadedFiles.length);
                    console.log('[FULL VIEW] activeAssetIndex:', activeAssetIndex);
                    console.log('[FULL VIEW] activeAppointment:', activeAppointment);
                    
                    // Detailed logging of each series
                    uploadedFiles.forEach((file, index) => {
                      console.log(`[FULL VIEW] Series ${index + 1}:`, {
                        name: file.name,
                        hasRawFiles: !!file.rawFiles,
                        rawFilesCount: file.rawFiles?.length || 0,
                        seriesUID: file.seriesUID,
                        modality: file.modality
                      });
                    });
                    
                    // Check if we have any files with rawFiles
                    const validSeries = uploadedFiles.filter(file => file.rawFiles && file.rawFiles.length > 0);
                    
                    console.log('[FULL VIEW] Valid series count:', validSeries.length);
                    console.log('[FULL VIEW] Valid series:', validSeries.map(s => s.name));
                    
                    if (validSeries.length > 0) {
                      // Pass ALL series to the viewer, not just the active one
                      const allSeries = validSeries.map(series => ({
                        name: series.name,
                        files: series.rawFiles,
                        seriesUID: series.seriesUID,
                        modality: series.modality
                      }));
                      
                      const activeValidSeriesIndex = validSeries.findIndex(s => s.name === uploadedFiles[activeAssetIndex]?.name);
                      
                      const navigationState = {
                        allSeries: allSeries, // Pass all series
                        files: validSeries[0].rawFiles, // Default to first series for backward compatibility
                        seriesName: uploadedFiles[activeAssetIndex]?.name || 'DICOM STUDY',
                        activeSeriesIndex: activeValidSeriesIndex >= 0 ? activeValidSeriesIndex : 0, // Map to validSeries index
                        layoutMode: layoutMode, // Preserve layout mode
                        appointmentData: {
                          ...activeAppointment,
                          appointmentId: appointmentId,
                          id: appointmentId
                        }
                      };
                      
                      console.log('[FULL VIEW] Navigating to DICOM viewer with ALL series:', {
                        totalSeries: allSeries.length,
                        seriesNames: allSeries.map(s => s.name),
                        totalFiles: allSeries.reduce((sum, s) => sum + s.files.length, 0),
                        navigationState: navigationState
                      });
                      
                      console.log('[FULL VIEW] 🚀 Navigation state being passed:', JSON.stringify({
                        allSeriesCount: navigationState.allSeries.length,
                        filesCount: navigationState.files.length,
                        seriesName: navigationState.seriesName,
                        activeSeriesIndex: navigationState.activeSeriesIndex
                      }, null, 2));
                      
                      navigate('/dicom-viewer', {
                        state: navigationState,
                        replace: false
                      });
                    } else {
                      console.error('[FULL VIEW] No DICOM files available');
                      console.error('[FULL VIEW] uploadedFiles.length:', uploadedFiles.length);
                      console.error('[FULL VIEW] Valid series count:', validSeries.length);
                      console.error('[FULL VIEW] Files with rawFiles:', uploadedFiles.map(f => ({
                        name: f.name,
                        hasRawFiles: !!f.rawFiles,
                        rawFilesCount: f.rawFiles?.length || 0
                      })));
                      alert('No DICOM files available for full-screen viewing. Please ensure DICOM files are loaded first.');
                    }
                  }}
                  title="Open Full Screen DICOM Viewer"
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    border: '2px solid #34d399',
                    color: 'white',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  <span style={{ fontSize: '12px' }}>🔍</span>
                  FULL VIEW
                </button>
              </div>
            </div>

          <div style={{ flex: 1, background: '#000', position: 'relative', display: 'flex', gap: '2px', padding: '2px' }}>
            {/* Floating Toolbar Toggle for Tablets */}
            {isTablet && (
              <button
                onClick={() => {
                  const toolbar = document.getElementById('dicom-toolbar');
                  if (toolbar) {
                    if (toolbar.style.transform === 'translateX(-100%)') {
                      toolbar.style.transform = 'translateX(0)';
                      toolbar.style.transition = 'transform 0.3s ease';
                    } else {
                      toolbar.style.transform = 'translateX(-100%)';
                      toolbar.style.transition = 'transform 0.3s ease';
                    }
                  }
                }}
                style={{
                  position: 'absolute',
                  top: '20px',
                  left: '20px',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  border: 'none',
                  color: 'white',
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  zIndex: 100,
                  boxShadow: '0 4px 20px rgba(59, 130, 246, 0.4)',
                  touchAction: 'manipulation',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'scale(1)';
                }}
                title="Toggle DICOM Tools"
              >
                🛠️
              </button>
            )}
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
                  width: '60px',
                  height: '60px',
                  border: '3px solid rgba(59, 130, 246, 0.2)',
                  borderTopColor: '#3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                
                <div style={{ textAlign: 'center', maxWidth: '350px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 900, marginBottom: '8px', letterSpacing: '1px' }}>
                    PROCESSING DICOM DATA
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '15px' }}>
                    {processingStatus || 'Initializing...'}
                  </div>
                  
                  {loadingProgress.total > 0 && (
                    <div style={{ width: '250px', margin: '0 auto' }}>
                      <div style={{
                        width: '100%',
                        height: '6px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                        marginBottom: '8px'
                      }}>
                        <div style={{
                          width: `${(loadingProgress.current / loadingProgress.total) * 100}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                          borderRadius: '3px',
                          transition: 'width 0.3s ease'
                        }}></div>
                      </div>
                      <div style={{ fontSize: '10px', color: '#cbd5e1' }}>
                        {loadingProgress.current} / {loadingProgress.total} files
                        {loadingProgress.seriesCount && ` • ${loadingProgress.seriesCount} series`}
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
            
            {/* SERIES LIBRARY MINI-SIDEBAR */}
            {uploadedFiles.length > 1 && (
              <div style={{ width: '60px', background: '#0f172a', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 5px', zIndex: 10 }}>
                {uploadedFiles.map((f, i) => (
                  <button 
                    key={i}
                    onClick={() => setActiveAssetIndex(i)}
                    title={f.name}
                    style={{ 
                      width: '100%', height: '50px', background: activeAssetIndex === i ? '#3b82f6' : 'rgba(255,255,255,0.05)', 
                      border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', transition: '0.2s', gap: '4px'
                    }}
                  >
                    <div style={{ fontSize: '12px' }}>🎞️</div>
                    <div style={{ fontSize: '8px', color: 'white', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', width: '100%', textAlign: 'center' }}>S{i+1}</div>
                  </button>
                ))}
              </div>
            )}

            {uploadedFiles.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: '12px', fontWeight: 950, letterSpacing: '2px', flexDirection: 'column', gap: '20px' }}>
                <div style={{ fontSize: '48px', opacity: 0.2 }}>📡</div>
                <div style={{ textAlign: 'center' }}>
                  <div>WAITING_FOR_DATA_SIGNAL</div>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '10px', fontWeight: 400 }}>
                    Upload DICOM files or ZIP archives to begin analysis
                  </div>
                </div>
                <input 
                  type="file" 
                  multiple 
                  accept=".dcm,.dicom,.zip" 
                  onChange={handleFileChange}
                  style={{ 
                    padding: '10px 20px', 
                    borderRadius: '8px', 
                    border: '2px dashed #3b82f6', 
                    background: 'rgba(59, 130, 246, 0.1)', 
                    color: '#3b82f6',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 700
                  }}
                />
              </div>
            ) : (
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: layoutMode === '2x2' ? '1fr 1fr' : '1fr', gridTemplateRows: layoutMode === '2x2' ? '1fr 1fr' : '1fr', gap: '2px' }}>
                {[...Array(layoutMode === '2x2' ? 4 : 1)].map((_, idx) => {
                  const currentFiles = uploadedFiles[(activeAssetIndex + idx) % uploadedFiles.length]?.rawFiles;
                  
                  return (
                    <div key={idx} style={{ position: 'relative', background: '#000', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      {/* DICOM Viewer with Advanced Tools */}
                      <div style={{ flex: 1, position: 'relative' }}>
                        <AdvancedDicomViewer 
                          key={`${activeAssetIndex}_${idx}_${resetTrigger}`} 
                          files={currentFiles || []} 
                          preParsedMetadata={uploadedFiles[(activeAssetIndex + idx) % uploadedFiles.length]?.metadata}
                          activeTool={activeTool}
                          isCine={cineEnabled}
                          isSynced={isSyncEnabled}
                          keyImages={keyImages}
                          onKeyImageToggle={toggleKeyImage}
                          onSliceChange={(index, total) => {
                            if (idx === 0) setCurrentSlice(index + 1);
                          }}
                          // Enhanced features - all enabled
                          enableFullscreen={true}
                          showMetadata={true}
                          showMeasurements={true}
                          showWindowingPresets={true}
                          enableAdvancedTools={true}
                          onFullscreenChange={(isFullscreen) => {
                            console.log(`[DICOM] Viewport ${idx} fullscreen:`, isFullscreen);
                          }}
                          onMeasurement={(measurement) => {
                            console.log(`[DICOM] New measurement in viewport ${idx}:`, measurement);
                            if (onMeasurement) onMeasurement(measurement);
                          }}
                          onMetadata={(metadata) => {
                            if (idx === 0) setActiveMetadata(metadata);
                          }}
                          // Viewport transformations
                          invert={viewportProps.invert}
                          flipHorizontal={viewportProps.flipHorizontal}
                          flipVertical={viewportProps.flipVertical}
                          rotation={viewportProps.rotation}
                          resetTrigger={resetTrigger}
                        />
                        
                        {/* Enhanced Overlay Information */}
                        <div style={{ position: 'absolute', top: '15px', left: '15px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)', padding: '8px 15px', borderRadius: '8px', fontSize: '11px', color: '#e2e8f0', fontWeight: 900, letterSpacing: '1px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            {uploadedFiles[(activeAssetIndex + idx) % uploadedFiles.length]?.name?.toUpperCase() || 'SERIES'}
                          </div>
                          <div style={{ background: 'rgba(59, 130, 246, 0.9)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', color: 'white', fontWeight: 900, width: 'fit-content' }}>
                            SLICE: {idx === 0 ? currentSlice : '?'} / {currentFiles?.length || 0}
                          </div>
                          {activeMetadata && idx === 0 && (
                            <div style={{ background: 'rgba(16, 185, 129, 0.9)', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', color: 'white', fontWeight: 900, width: 'fit-content' }}>
                              {activeMetadata.modality} • {activeMetadata.rows}x{activeMetadata.columns}
                            </div>
                          )}
                        </div>

                        {/* ACTIVE TOOL INDICATOR */}
                        <div style={{ position: 'absolute', top: '15px', right: '15px', zIndex: 10 }}>
                          <div style={{ 
                            background: 'rgba(59, 130, 246, 0.9)', 
                            padding: '8px 15px', 
                            borderRadius: '8px', 
                            fontSize: '11px', 
                            color: 'white', 
                            fontWeight: 900,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            border: '2px solid rgba(255,255,255,0.2)'
                          }}>
                            <span style={{ fontSize: '14px' }}>
                              {activeTool === 'WindowLevelTool' && '☀️'}
                              {activeTool === 'ZoomTool' && '🔍'}
                              {activeTool === 'PanTool' && '✋'}
                              {activeTool === 'LengthTool' && '📏'}
                              {activeTool === 'ArrowAnnotateTool' && '➡️'}
                              {!['WindowLevelTool', 'ZoomTool', 'PanTool', 'LengthTool', 'ArrowAnnotateTool'].includes(activeTool) && '⚡'}
                            </span>
                            <span>
                              {activeTool === 'WindowLevelTool' && 'WINDOW/LEVEL'}
                              {activeTool === 'ZoomTool' && 'ZOOM'}
                              {activeTool === 'PanTool' && 'PAN'}
                              {activeTool === 'LengthTool' && 'MEASURE'}
                              {activeTool === 'ArrowAnnotateTool' && 'ANNOTATE'}
                              {activeTool === 'HeightTool' && 'HEIGHT'}
                              {activeTool === 'BidirectionalTool' && 'BIDIRECTIONAL'}
                              {activeTool === 'AngleTool' && 'ANGLE'}
                              {activeTool === 'CobbAngleTool' && 'COBB ANGLE'}
                              {activeTool === 'EllipticalROITool' && 'ELLIPSE ROI'}
                              {activeTool === 'RectangleROITool' && 'RECTANGLE ROI'}
                              {activeTool === 'CircleROITool' && 'CIRCLE ROI'}
                              {activeTool === 'PlanarFreehandROITool' && 'FREEHAND ROI'}
                              {activeTool === 'ProbeTool' && 'HU PROBE'}
                              {activeTool === 'AdvancedMagnifyTool' && 'MAGNIFY'}
                              {!['WindowLevelTool', 'ZoomTool', 'PanTool', 'LengthTool', 'ArrowAnnotateTool', 'HeightTool', 'BidirectionalTool', 'AngleTool', 'CobbAngleTool', 'EllipticalROITool', 'RectangleROITool', 'CircleROITool', 'PlanarFreehandROITool', 'ProbeTool', 'AdvancedMagnifyTool'].includes(activeTool) && 'ADVANCED TOOL'}
                            </span>
                          </div>
                        </div>

                        {/* Windowing Presets - Bottom Right */}
                        <div style={{ position: 'absolute', bottom: '15px', right: '15px', zIndex: 10 }}>
                          <select 
                            onChange={(e) => {
                              // This would be handled by the AdvancedDicomViewer component
                              console.log('Windowing preset changed:', e.target.value);
                            }}
                            style={{ 
                              background: 'rgba(15, 23, 42, 0.9)', 
                              color: 'white', 
                              border: '2px solid rgba(255,255,255,0.2)', 
                              padding: '6px 12px', 
                              borderRadius: '6px', 
                              fontSize: '10px', 
                              fontWeight: 900,
                              outline: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="Default">DEFAULT W/L</option>
                            <option value="Lung">LUNG</option>
                            <option value="Bone">BONE</option>
                            <option value="Brain">BRAIN</option>
                            <option value="Abdomen">ABDOMEN</option>
                            <option value="Liver">LIVER</option>
                            <option value="Mediastinum">MEDIASTINUM</option>
                            <option value="Angio">ANGIO</option>
                          </select>
                        </div>

                        {/* Key Images Indicator */}
                        {keyImages.includes(`${activeAssetIndex + idx}_${currentSlice}`) && (
                          <div style={{ position: 'absolute', top: '60px', right: '15px', zIndex: 10 }}>
                            <div style={{ background: 'rgba(245, 158, 11, 0.9)', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', color: 'white', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '5px' }}>
                              ⭐ KEY IMAGE
                            </div>
                          </div>
                        )}

                        {/* Active Tool & Instructions - Bottom Left */}
                        <div style={{ position: 'absolute', bottom: '15px', left: '15px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: '6px', fontSize: '9px', color: '#94a3b8', fontWeight: 900, letterSpacing: '1px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            ACTIVE: {activeTool?.replace('Tool', '').toUpperCase() || 'WINDOW_LEVEL'}
                          </div>
                          {activeTool && activeTool !== 'WindowLevelTool' && (
                            <div style={{ background: 'rgba(59, 130, 246, 0.8)', padding: '3px 8px', borderRadius: '4px', fontSize: '8px', color: 'white', fontWeight: 700, maxWidth: '200px' }}>
                              {activeTool === 'LengthTool' && 'Click and drag to measure distance'}
                              {activeTool === 'AngleTool' && 'Click 3 points to measure angle'}
                              {activeTool === 'EllipticalROITool' && 'Draw ellipse for ROI analysis'}
                              {activeTool === 'ProbeTool' && 'Click to probe pixel values'}
                              {activeTool === 'ArrowAnnotateTool' && 'Click and drag to annotate'}
                              {activeTool === 'ZoomTool' && 'Click and drag to zoom'}
                              {activeTool === 'PanTool' && 'Click and drag to pan'}
                            </div>
                          )}
                        </div>

                        {/* Measurement Results - Bottom Right */}
                        {idx === 0 && (
                          <div style={{ position: 'absolute', bottom: '15px', right: '15px', zIndex: 10, maxWidth: '250px' }}>
                            <div style={{ background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                              <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 900, marginBottom: '4px', letterSpacing: '1px' }}>MEASUREMENTS</div>
                              <div style={{ fontSize: '10px', color: '#e2e8f0', fontWeight: 700 }}>
                                {/* This would be populated by the AdvancedDicomViewer component */}
                                <div>Distance: 12.4 mm</div>
                                <div>Area: 156.7 mm²</div>
                                <div>HU: -45 ± 12</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* RIGHT PANEL: Reporting Workspace */}
        <div className="panel panel-right">
          <div className="resizer-handle" onMouseDown={startResizing}></div>

          <div className="tabs" style={{ 
            marginTop: '0px', marginBottom: '10px', borderBottom: '1px solid #f1f5f9', display: editorState === 'collapsed' ? 'none' : 'flex',
            justifyContent: 'center', gap: '20px'
          }}>
            <div className="tab active" style={{ fontSize: '10px', fontWeight: 950 }}>REPORT_WORKSPACE</div>
            {showTimeline && (
              <div
                className="tab"
                style={{
                  fontSize: '10px',
                  fontWeight: 950,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  position: 'relative'
                }}
                onClick={() => navigate(`/patient-timeline/${appointmentId}`, { state: { patient: activeAppointment, returnPath: `/reporting/${appointmentId}` } })}
              >
                🕒 TIMELINE
                {patientHistory.length > 0 && (
                  <span style={{ background: '#ef4444', color: 'white', borderRadius: '99px', fontSize: '8px', fontWeight: 950, padding: '1px 5px', letterSpacing: '0.5px', lineHeight: 1.4 }}>
                    {patientHistory.length}
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{ 
            display: editorState === 'collapsed' ? 'none' : 'flex', 
            flexDirection: 'column', flex: 1, paddingRight: '5px',
            animation: 'fadeIn 0.4s ease'
          }}>
        {/* Shared Header: Metadata & Status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
             <div style={{ padding: '6px 12px', background: '#f0f7ff', borderRadius: '10px', border: '1px solid #dbeafe' }}>
                <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Workstation Status</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnline ? '#10b981' : '#f59e0b' }}></div>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#1e293b' }}>{isOnline ? 'CLOUD_CONNECTED' : 'OFFLINE_CACHE_ACTIVE'}</span>
                </div>
             </div>
             
             <div style={{ padding: '6px 12px', background: saveStatus === 'SAVING' ? '#fffbeb' : '#f8fafc', borderRadius: '10px', border: `1px solid ${saveStatus === 'SAVING' ? '#fde68a' : '#e2e8f0'}`, transition: 'all 0.3s' }}>
                <div style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cloud Intelligence</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: saveStatus === 'SAVING' ? '#d97706' : '#1e293b' }}>
                    {saveStatus === 'SAVING' ? '📡 SYNCING...' : saveStatus === 'SUCCESS' ? `✅ SAVED AT ${lastSaved}` : saveStatus === 'DIRTY' ? '📝 PENDING SYNC' : '💤 MONITORING'}
                  </span>
                </div>
             </div>
          </div>
          
          <div style={{ display: 'flex', gap: '12px' }}>
             <button className="btn btn-outline" style={{ padding: '8px 16px', fontSize: '11px' }} onClick={() => handleSaveReport(false)}>💾 Save Draft</button>
             <button className="btn btn-outline" style={{ padding: '8px 16px', fontSize: '11px' }} onClick={handlePreviewPrint}>👁️ Preview Report</button>
             <button className="btn btn-success" style={{ padding: '8px 20px', fontSize: '11px' }} onClick={() => handleSaveReport(true)}>Finalize & Sign</button>
          </div>
        </div>



            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' }}>
              {/* STICKY PROTOCOL SELECTOR */}
              <div style={{ 
                position: 'sticky', top: 0, zIndex: 10, 
                padding: '10px 20px', background: 'white', 
                borderBottom: '1px solid #f1f5f9',
                backdropFilter: 'blur(8px)',
                backgroundColor: 'rgba(255, 255, 255, 0.9)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '8px', letterSpacing: '1px' }}>Active Clinical Protocol</label>
                    <select 
                      className="template-selector" 
                      value={selectedTemplateId || ''} 
                      onChange={(e) => {
                        const tpl = templates.find(t => String(t.id) === String(e.target.value));
                        if (tpl) {
                          setSelectedTemplateId(tpl.id);
                          setEditorText(tpl.content || '');
                        }
                      }}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}
                    >
                      <option value="">Select Protocol Template...</option>
                      {templates.map(tpl => (
                        <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px', paddingTop: '10px' }}>
                {/* NEW TIPTAP EDITOR */}
                <NarrativeEditor
                  content={editorText}
                  onChange={(html) => setEditorText(html)}
                  placeholder="Start typing your radiology report..."
                  onSave={() => handleSaveReport(false)}
                  keywordLibrary={keywordLibrary}
                />
                
                {/* Bottom Narrative Inputs (Impression & Advice) */}
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', display: 'block', marginBottom: '8px' }}>CLINICAL IMPRESSION</label>
                    <textarea 
                      value={impression}
                      onChange={(e) => setImpression(e.target.value)}
                      placeholder="Enter final study impression..."
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', minHeight: '80px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', display: 'block', marginBottom: '8px' }}>FOLLOW-UP ADVICE</label>
                    <textarea 
                      value={advice}
                      onChange={(e) => setAdvice(e.target.value)}
                      placeholder="Enter patient advice..."
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', minHeight: '80px', outline: 'none' }}
                    />
                  </div>
                </div>
              </div>
            </div>



            {/* Signature Block */}
            <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '15px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>{protocol?.hospital?.name || 'Authorized Diagnostic Center'}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Digital Medical Record Signature</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- MODALS & DRAWERS --- */}

      {/* Insert Table Modal */}
      {showTableModal && (
        <div className="overlay" style={{ zIndex: 10001 }} onClick={() => { setShowTableModal(false); setShowTableBuilder(false); }}>
          <div className="modal" style={{ width: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>{showTableBuilder ? '⚙️ Table Configuration' : '📊 Insert Measurement Table'}</span>
              <button className="tool-btn" onClick={() => { setShowTableModal(false); setShowTableBuilder(false); }}>✕</button>
            </div>
            <div className="modal-body">
              {!showTableBuilder ? (
                <>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '15px' }}>Choose a preset to insert into your report:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {tablePresets.map(preset => (
                      <div key={preset.id} className="preset-card" onClick={() => insertTable(preset)} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ fontSize: '20px' }}>📊</div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700 }}>{preset.name}</div>
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>{preset.columns.length} columns</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-primary" style={{ width: '100%', marginTop: '20px' }} onClick={() => setShowTableBuilder(true)}>+ Configure New Table Type</button>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '5px' }}>TABLE NAME</label>
                    <input 
                      type="text" 
                      placeholder="e.g., Fetal Growth" 
                      value={newTable.name}
                      onChange={e => setNewTable({...newTable, name: e.target.value})}
                      style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '5px' }}>COLUMN HEADERS</label>
                    {newTable.columns.map((col, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '5px', marginBottom: '8px' }}>
                        <input 
                          type="text" 
                          placeholder={`Column ${idx + 1}`} 
                          value={col}
                          onChange={e => {
                            const newCols = [...newTable.columns];
                            newCols[idx] = e.target.value;
                            setNewTable({...newTable, columns: newCols});
                          }}
                          style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                        />
                        <button 
                          className="tool-btn" 
                          onClick={() => {
                            const newCols = newTable.columns.filter((_, i) => i !== idx);
                            setNewTable({...newTable, columns: newCols});
                          }}
                          style={{ background: '#fecaca', color: '#dc2626' }}
                        >✕</button>
                      </div>
                    ))}
                    <button className="btn btn-outline" style={{ width: '100%', fontSize: '12px' }} onClick={() => setNewTable({...newTable, columns: [...newTable.columns, '']})}>+ Add Column</button>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowTableBuilder(false)}>Cancel</button>
                    <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSaveTable}>Save Table Preset</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ReportPreviewModal 
        isOpen={isPreviewOpen} 
        onClose={() => setIsPreviewOpen(false)}
        appointmentId={appointmentId}
        doctorId={activeAppointment?.doctorId || activeAppointment?.doctorUserId || activeAppointment?.doctor?.userId || sessionStorage.getItem('1rad_doctor_id')}
        patientData={activeAppointment}
        reportContent={{
          mode: 'Narrative',
          text: editorText,
          data: {},
          impression: impression,
          advice: advice,
          isFinalized: isFinalized
        }}
      />
      {renderShortcutsHelp()}
    </div>
  );
};

export default ReportingPage;
