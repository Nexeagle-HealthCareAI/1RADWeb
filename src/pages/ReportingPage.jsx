import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import JSZip from 'jszip';
import dicomParser from 'dicom-parser';
import AdvancedDicomViewer from '../components/AdvancedDicomViewer';
import NarrativeEditor from '../components/NarrativeEditor';
import apiClient, { BASE_URL } from '../api/apiClient';
import { DicomCache } from '../utils/DicomCache';
import { dicomOptimizer } from '../utils/DicomPerformanceOptimizer';
import { uploadStudyAssetDirect } from '../utils/azureUpload';
import { jwtDecode } from 'jwt-decode';
import useOffline from '../hooks/useOffline';
import { nativeStorage } from '../hooks/useElectron';
import ReportPreviewModal, { PatientInfoBlock } from '../components/ReportPreviewModal';
import useTickClock from '../utils/useTickClock';
import { formatElapsed, premisesSeverity, premisesPillStyle } from '../utils/timeTracking';
import SearchableTemplatePicker from '../components/SearchableTemplatePicker';
import PatientTimeline from '../components/PatientTimeline';
import VoiceReportingPanel from '../components/VoiceReportingPanel';
import { assetsFromManifest } from '../utils/dicomManifest';

const ReportingPage = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { isOnline, addToOutbox } = useOffline();
  // 60s tick so the on-premises clock advances while the radiologist is
  // actively reporting — shows the case "ageing" in real time.
  useTickClock();
  const appointmentId = params.id || searchParams.get('id');
  const [showKeywordDrawer, setShowKeywordDrawer] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [editorText, setEditorText] = useState('');
  const [showInlineSuggestion, setShowInlineSuggestion] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [cursorPos, setCursorPos] = useState({ top: 0, left: 0 });
  const [templates, setTemplates] = useState([]);
  const [keywordLibrary, setKeywordLibrary] = useState([]);
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  // The findings HTML as it currently exists on the SERVER (set when a report
  // is loaded and after each successful save). Stored inside every local draft
  // as `serverBaseline` so the crash-recovery prompt can tell whether the
  // draft holds genuine unsaved local edits (server unchanged since the draft)
  // vs. a stale draft that the server has already moved past. Fixes the bug
  // where the prompt always claimed the local draft was "newer" because the
  // report entity has no server-side UpdatedAt timestamp to compare against.
  const serverBaselineRef = useRef(null);
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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [activeMainTab, setActiveMainTab] = useState('REPORTING'); // 'DICOM', 'REPORTING', 'TIMELINE'
  // True only while the DICOM tab is visible — defers ZIP download until the user
  // actually needs the viewer, avoiding a 200-500 MB download on every page open.
  const dicomTabActiveRef = useRef(false);
  // True while hydrateZipAsset is running — used to pause live polling so it
  // does not compete for bandwidth during the ZIP download + DICOM processing.
  const isHydratingRef = useRef(false);

  const handleSelectMainTab = (tabId) => {
    setActiveMainTab(tabId);
    dicomTabActiveRef.current = tabId === 'DICOM';
    // Trigger DICOM loading on-demand — only when the doctor opens the DICOM tab.
    if (tabId === 'DICOM' && uploadedFiles[activeAssetIndex]?.needsHydration) {
      hydrateZipAsset(activeAssetIndex);
    }
    if (!isTablet) {
      if (tabId === 'DICOM') {
        setEditorState('collapsed');
      } else if (tabId === 'REPORTING') {
        setEditorState('standard');
        setActiveRightTab('REPORT');
      } else if (tabId === 'TIMELINE') {
        setEditorState('standard');
        setActiveRightTab('TIMELINE');
      }
    }
  };

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
  const [activeRightTab, setActiveRightTab] = useState('REPORT'); // 'REPORT', 'TIMELINE'
  const [expandedHistoryReport, setExpandedHistoryReport] = useState({}); // { [appointmentId]: { loading, data, error } }
  const [expandedHistoryDicom, setExpandedHistoryDicom] = useState({}); // { [appointmentId]: true/false }
  const [isHistoricalMode, setIsHistoricalMode] = useState(false);
  const [historicalStudyContext, setHistoricalStudyContext] = useState(null);
  const [originalAssets, setOriginalAssets] = useState([]);

  // --- AUTOSAVE SYSTEM ---
  const [lastSaved, setLastSaved] = useState(null);
  const [saveStatus, setSaveStatus] = useState('IDLE'); // 'IDLE', 'DIRTY', 'SAVING', 'SUCCESS'
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  const [notifModal, setNotifModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const showNotif = (type, title, message) => setNotifModal({ isOpen: true, type, title, message });

  // Voice Reporting → AI draft. Sends the dictation transcript + chosen
  // template + appointment context to the backend, which prompts Claude Haiku
  // to produce a structured HTML report. Returns { success, html, error }.
  const generateVoiceReport = useCallback(async ({ transcript, templateId }) => {
    try {
      const res = await apiClient.post('/reporting/voice-generate', {
        appointmentId,
        templateId: templateId || null,
        transcript,
      });
      const data = res?.data || {};
      if (data.success && (data.html || data.report)) {
        return { success: true, html: data.html || data.report };
      }
      return { success: false, error: data.error || data.message || 'No report returned.' };
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Request failed.';
      return { success: false, error: msg };
    }
  }, [appointmentId]);

  // Crash-recovery prompt — promise-based so the load flow can await the
  // user's choice and decide which version of the report to render.
  const [draftRecoveryModal, setDraftRecoveryModal] = useState({ isOpen: false, ageMin: 0, resolve: null });
  const askDraftRecovery = (ageMin) => new Promise((resolve) => {
    setDraftRecoveryModal({ isOpen: true, ageMin, resolve });
  });
  const resolveDraftRecovery = (restore) => {
    setDraftRecoveryModal((m) => {
      m.resolve?.(restore);
      return { isOpen: false, ageMin: 0, resolve: null };
    });
  };

  // Overlay host — resolves to the current fullscreen element when any
  // element on the page is fullscreened, otherwise <body>. Browsers only
  // render descendants of the fullscreen element during native fullscreen,
  // so notifications must portal inside it to be visible.
  const [overlayHost, setOverlayHost] = useState(() =>
    typeof document === 'undefined' ? null :
      (document.fullscreenElement
        || document.querySelector('.ne--css-fullscreen')
        || document.body)
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const resolve = () =>
      document.fullscreenElement
        || document.querySelector('.ne--css-fullscreen')
        || document.body;
    setOverlayHost(resolve());
    const onFs = () => setOverlayHost(resolve());
    document.addEventListener('fullscreenchange', onFs);
    const mo = new MutationObserver(() => setOverlayHost(resolve()));
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      mo.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isIPad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchstart' in document;
      const isTabletSize = (width >= 768 && width <= 1366) || (height >= 768 && height <= 1366);
      const isMobileSize = width < 768;

      const tablet = (isTouchDevice && (isTabletSize || isIPad)) || isMobileSize;
      setIsTablet(tablet);
      setIsMobile(isMobileSize);

      console.log('[REPORTING] Device detection:', {
        width, height, isTouchDevice, isIPad, isTabletSize, tablet,
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints
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
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // 1. LOCAL AUTOSAVE: Immediate persistence to nativeStorage/localStorage
  useEffect(() => {
    if (!appointmentId || isFinalized) return;

    const timer = setTimeout(async () => {
      // Read the FRESH editor HTML, not the (debounced) editorText state, so
      // attribute changes like right-align that haven't crossed the 300 ms
      // onUpdate debounce yet still get persisted.
      const freshFindings = editorRef.current?.editor?.getHTML?.() ?? editorText;

      const draft = {
        appointmentId,
        templateId: selectedTemplateId,
        findings: freshFindings,
        impression,
        advice,
        reportingMode: 'Narrative',
        timestamp: new Date().toISOString(),
        serverBaseline: serverBaselineRef.current,
      };

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

  // 2. CLOUD AUTOSAVE: Background API sync every 45 seconds if dirty.
  //
  // Failure policy:
  //   • 404 on the save endpoint = endpoint is gone (typo, deploy mid-flight,
  //     gateway misconfig). No amount of retrying will help. We DISABLE the
  //     cloud autosave for the rest of the session, log a clear console
  //     warning, and surface a banner so the user knows their work is
  //     still safe in localStorage (the local autosave is unaffected) but
  //     cloud sync is paused until they reload.
  //   • Any other failure (network blip, 5xx, 401) backs off exponentially:
  //     45s → 90s → 180s → 360s → 720s → 1440s (24 min cap). Success resets.
  const autosaveFailuresRef = useRef(0);
  const [cloudAutosaveDisabledReason, setCloudAutosaveDisabledReason] = useState(null);
  useEffect(() => {
    if (cloudAutosaveDisabledReason) return;
    if (saveStatus !== 'DIRTY' || !appointmentId || isFinalized || !isOnline || isCloudSyncing) return;

    const failures = autosaveFailuresRef.current;
    const delay = Math.min(45_000 * Math.pow(2, failures), 24 * 60 * 1000);
    if (failures > 0) {
      console.info(`[AUTOSAVE] Backing off after ${failures} failure(s); next attempt in ${Math.round(delay / 1000)}s`);
    }

    const cloudTimer = setTimeout(async () => {
      console.info(`[AUTOSAVE] Triggering background cloud sync...`);
      setIsCloudSyncing(true);
      setSaveStatus('SAVING');
      try {
        const freshFindings = editorRef.current?.editor?.getHTML?.() ?? editorText;
        const payload = {
          appointmentId,
          templateId: selectedTemplateId,
          findings: freshFindings,
          impression: impression || '',
          advice: advice || '',
          reportingMode: 'Narrative',
          isFinalized: false
        };
        const res = await apiClient.post('/reporting/save', payload);
        if (res.data?.success) {
          setLastSaved(new Date().toLocaleTimeString());
          setSaveStatus('SUCCESS');
          autosaveFailuresRef.current = 0;
        } else {
          autosaveFailuresRef.current = failures + 1;
          setSaveStatus('DIRTY');
        }
      } catch (err) {
        const status = err?.response?.status;
        // 404 from this endpoint actually comes back two ways:
        //   1. The route is missing on the deployed API (rare; only mid-deploy).
        //   2. The SaveReport handler caught a KeyNotFoundException because
        //      the appointment id doesn't exist in the user's hospital
        //      context (the body carries an explanatory error message).
        // We can't distinguish those reliably from the status alone, but
        // either way retrying is futile until the user does something
        // (reload, navigate back, fix the URL). Disable cloud autosave for
        // the session in both cases.
        if (status === 404) {
          const serverMsg = err?.response?.data?.error
            || 'The save endpoint returned 404 (no body).';
          console.error(
            '[AUTOSAVE] /reporting/save returned 404. Cloud autosave is now ' +
            'DISABLED for this session — local autosave is still active. ' +
            'Server said:', serverMsg
          );
          setCloudAutosaveDisabledReason(serverMsg);
          setSaveStatus('DIRTY'); // a future manual save can still try
        } else {
          console.warn('[AUTOSAVE] Cloud sync failed, will retry later.', err?.message || err);
          autosaveFailuresRef.current = failures + 1;
          setSaveStatus('DIRTY');
        }
      } finally {
        setIsCloudSyncing(false);
      }
    }, delay);

    return () => clearTimeout(cloudTimer);
  }, [saveStatus, editorText, impression, advice, appointmentId, isFinalized, isOnline, selectedTemplateId, isCloudSyncing, cloudAutosaveDisabledReason]);



  // --- TIMELINE FETCH (standalone so refresh button can call it) ---
  const fetchPatientTimeline = useCallback(async (appointmentData, currentAppId) => {
    if (!appointmentData) return;
    setLoadingTimeline(true);
    try {
      const patientId = appointmentData.patientId || appointmentData.patientIdentifier;

      // Try the dedicated patient timeline API first if patientId is a valid Guid
      const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isGuid = guidRegex.test(patientId);

      if (isGuid) {
        console.info(`[TIMELINE] Querying dedicated timeline API for patient Guid: ${patientId}`);
        const res = await apiClient.get(`/patients/${patientId}/timeline`);
        if (res.data?.success && Array.isArray(res.data.data)) {
          const formattedHistory = res.data.data
            .filter(a => String(a.appointmentId) !== String(appointmentData.appointmentId) && a.displayId !== currentAppId)
            .map(a => ({
              ...a,
              assetCount: a.assets?.length || 0,
              reportImpression: a.report?.impression || '',
              report: a.report
            }));
          setPatientHistory(formattedHistory);
          setLoadingTimeline(false);
          return;
        }
      }

      // Fallback search
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

  const handleLoadHistoricalDicom = async (study) => {
    const historicalId = study.appointmentId || study.AppointmentId || study.id || study.Id;
    if (historicalId === String(appointmentId)) return;

    setLoading(true);
    setProcessingStatus(`Synchronizing comparative study: ${study.modality || 'DICOM'}...`);

    try {
      // Manifest endpoint — same Option C migration as the initial load.
      const manifestRes = await apiClient.get(`/Study/${historicalId}/manifest`)
        .catch(() => ({ data: { success: false } }));
      const manifestAssets = (manifestRes?.data?.success && manifestRes.data.data?.assets) || [];

      if (manifestAssets.length > 0) {
        const hydAssets = assetsFromManifest(manifestAssets, { isHistorical: true });

        setUploadedFiles(hydAssets);
        setIsHistoricalMode(true);
        setHistoricalStudyContext(study);
        setActiveAssetIndex(0);

        // Switch to split mode to ensure visibility
        setEditorState('standard');

        console.info(`[1RAD] Historical Context Injected: ${historicalId}`);
      } else {
        showNotif('warning', 'NO IMAGING ASSETS', 'No imaging assets were found for this historical study.');
      }
    } catch (err) {
      console.error("[1RAD] Historical load failure:", err);
      showNotif('error', 'SYNC ERROR', 'Could not synchronize historical study assets. Please try again.');
    } finally {
      setLoading(false);
      setProcessingStatus('');
    }
  };

  const handleRestoreCurrentStudy = () => {
    setLoading(true);
    setProcessingStatus('Restoring active case context...');
    setTimeout(() => {
      setUploadedFiles(originalAssets);
      setIsHistoricalMode(false);
      setHistoricalStudyContext(null);
      setActiveAssetIndex(0);
      setLoading(false);
      setProcessingStatus('');
    }, 400);
  };

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
      // Surface available patient fields so the editor banner can verify which
      // ones are present (helpful when payload shape varies dev vs prod).
      console.info('[REPORTING][PATIENT_FIELDS]', {
        patientName: appointmentData?.patientName,
        patientId: appointmentData?.patientIdentifier ?? appointmentData?.ptid ?? appointmentData?.displayId,
        age: appointmentData?.patientAge ?? appointmentData?.age,
        gender: appointmentData?.patientGender ?? appointmentData?.gender,
        service: appointmentData?.service ?? appointmentData?.modality,
        referredBy: appointmentData?.referredBy,
        allKeys: Object.keys(appointmentData || {}),
      });

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

      // 2. Parallel fetch for Library, Institutional Branding, and study manifest.
      // Manifest endpoint replaces /assets — for extracted ZIPs it returns
      // per-slice URLs that the viewer loads directly via Cornerstone's wadouri
      // loader, eliminating the in-browser unzip wait.
      const [templRes, keyRes, protRes, reportRes, manifestRes] = await Promise.all([
        apiClient.get('/reporting/templates'),
        apiClient.get('/reporting/keywords'),
        doctorId ? apiClient.get(`/Prescription/${doctorId}`).catch(() => null) : Promise.resolve(null),
        apiClient.get(`/Reporting/report/${appId}`).catch(() => ({ data: { success: false } })),
        apiClient.get(`/Study/${appId}/manifest`).catch(() => ({ data: { success: false } }))
      ]);

      if (templRes.data?.success) {
        // Normalize PascalCase API response (Id/Name/Content) to camelCase so
        // the rest of the UI can use consistent tpl.id / tpl.name / tpl.content.
        const normalizedTemplates = (templRes.data.data || []).map(t => ({
          id:       t.id       ?? t.Id,
          name:     t.name     ?? t.Name     ?? '',
          modality: t.modality ?? t.Modality ?? '',
          content:  t.content  ?? t.Content  ?? '',
        }));
        setTemplates(normalizedTemplates);
      }
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

      const manifestAssets = (manifestRes?.data?.success && manifestRes.data.data?.assets) || [];
      if (manifestAssets.length > 0) {
        console.info(`[1RAD] Manifest returned ${manifestAssets.length} asset(s).`);
        const hydAssets = assetsFromManifest(manifestAssets);
        const extractedCount = hydAssets.filter(a => a.isExtracted).length;
        const pendingCount   = hydAssets.filter(a => a.needsHydration).length;
        console.info(`[1RAD] Hydrated ${hydAssets.length} series-entries (${extractedCount} extracted, ${pendingCount} pending ZIP fallback).`);

        setUploadedFiles(hydAssets);
        setOriginalAssets(hydAssets);
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

      // Helper to push HTML into the editor both via state AND imperatively
      // through the editor handle. State alone relies on NarrativeEditor's
      // content-sync useEffect, which is skipped if the editor is focused
      // or if its `isEmpty` heuristic mis-fires. The imperative call inside
      // requestAnimationFrame guarantees the editor catches up.
      const applyEditorContent = (html) => {
        setEditorText(html || '');
        requestAnimationFrame(() => {
          const handle = editorRef.current;
          if (!handle) return;
          if (handle.setContent) handle.setContent(html || '');
          else if (handle.editor) {
            try { handle.editor.commands.setContent(html || '', false); } catch {}
          }
          // ── Text-align persistence diagnostic (post-render) ─────────────
          // After Tiptap parses + re-serialises, do we still see the align?
          // If load logged alignCount > 0 but this logs 0, Tiptap's TextAlign
          // extension isn't parsing the inline style on the way back in.
          try {
            requestAnimationFrame(() => {
              const post = handle.editor?.getHTML?.() || '';
              const alignMatches = post.match(/text-align\s*:\s*[a-z]+/gi) || [];
              console.info('[ALIGN_DIAG] post-setContent editor HTML:', {
                htmlLength: post.length,
                alignCount: alignMatches.length,
                aligns: alignMatches.slice(0, 5),
              });
            });
          } catch (_) { /* never block render on diagnostic */ }
        });
      };

      // Tolerant service-name match: tries exact (case/whitespace-insensitive),
      // then substring both directions, then alphanumeric-only token-set match
      // ("CT-Brain Plain" ↔ "ct brain plain"). The token-set tier specifically
      // catches differences in punctuation/casing between dev and production
      // databases.
      const stripNonAlnum = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
      const findTemplateForService = (templatesArray, serviceName) => {
        if (!serviceName) return null;
        const target = serviceName.toLowerCase().trim();
        const targetTokens = stripNonAlnum(serviceName);
        const norm = (t) => (t?.name ?? t?.Name ?? '').toLowerCase().trim();
        const tokenNorm = (t) => stripNonAlnum(t?.name ?? t?.Name ?? '');
        const exact = templatesArray.find(t => norm(t) === target);
        if (exact) return exact;
        const tokenExact = templatesArray.find(t => tokenNorm(t) === targetTokens);
        if (tokenExact) return tokenExact;
        const substr = templatesArray.find(t => norm(t) && (target.includes(norm(t)) || norm(t).includes(target)));
        if (substr) return substr;
        const tokenSubstr = templatesArray.find(t => tokenNorm(t) && (targetTokens.includes(tokenNorm(t)) || tokenNorm(t).includes(targetTokens)));
        return tokenSubstr || null;
      };

      // Production diagnostic — log what we actually received from the API so
      // mismatches between local and Azure environments are visible. These
      // logs are intentionally always-on (not gated by DEBUG_LOGGING) since
      // they only fire once per appointment open and the cost is negligible.
      try {
        const tplCount = (templRes?.data?.data || []).length;
        const tplSample = (templRes?.data?.data || []).slice(0, 5).map(t => ({
          id: t.id ?? t.Id,
          name: t.name ?? t.Name,
          contentLength: (t.content ?? t.Content ?? '').length,
        }));
        console.info('[1RAD][TEMPLATE_DEBUG]', {
          appointmentService: appointmentData.service,
          appointmentServiceLength: (appointmentData.service || '').length,
          templatesReceived: tplCount,
          templatesSample: tplSample,
          existingReport: !!r,
          existingTemplateId: r?.templateId,
          existingFindingsLength: (r?.findings || '').length,
        });
      } catch (logErr) {
        console.warn('[1RAD][TEMPLATE_DEBUG] log failed', logErr);
      }

      if (r && (r.findings !== undefined || r.impression !== undefined)) {
        console.info(`[1RAD] Found Existing Report.`);

        const findingsHtml = r.findings || '';
        // Record what the server currently holds so draft-recovery can compare
        // lineage (see serverBaselineRef declaration).
        serverBaselineRef.current = findingsHtml;
        // ── Text-align persistence diagnostic (load side) ────────────────
        // If save logged alignCount > 0 but this logs 0, the API round-trip
        // is dropping inline styles. If both show alignCount > 0, the issue
        // is in the editor's parseHTML / content sync layer.
        try {
          const alignMatches = findingsHtml.match(/text-align\s*:\s*[a-z]+/gi) || [];
          console.info('[ALIGN_DIAG] load from API:', {
            htmlLength: findingsHtml.length,
            alignCount: alignMatches.length,
            aligns: alignMatches.slice(0, 5),
            firstSnippet: findingsHtml.slice(0, 200),
          });
        } catch (_) { /* never block load on diagnostic */ }
        setImpression(r.impression || '');
        setAdvice(r.advice || '');
        setIsFinalized(r.isFinalized);
        if (r.templateId) setSelectedTemplateId(String(r.templateId));

        // ── Crash-recovery prompt ──────────────────────────────────────
        // If a local draft exists AND is newer than the server's version,
        // offer the user a chance to restore it instead of clobbering with
        // the (potentially stale) server copy. Covers crashes, accidental
        // refreshes, and "I forgot to click Save" mistakes.
        let restored = false;
        try {
          const localDraft = await nativeStorage.get(`1rad_draft_${appId}`);
          if (localDraft && localDraft.findings) {
            const draftDiffers = (localDraft.findings || '') !== findingsHtml;

            // Decide whether the draft holds genuine UNSAVED local edits.
            //
            // Preferred signal — content lineage: the draft stores the server
            // content it was based on (`serverBaseline`). If that baseline
            // still equals the current server content, the server hasn't moved
            // on since the draft was made, so the draft's differences are real
            // unsaved edits → offer to restore. If the baseline differs, the
            // server has a newer saved version (saved elsewhere / later) and
            // the local draft is stale → don't prompt.
            //
            // Fallbacks for older drafts with no baseline: use the server's
            // UpdatedAt timestamp if the API provides one; otherwise fall back
            // to the legacy "draft newer than epoch" behaviour.
            const serverTs = new Date(r.updatedAt || r.UpdatedAt || r.modifiedAt || r.savedAt || 0).getTime();
            const draftTs = new Date(localDraft.timestamp || 0).getTime();
            let draftIsUnsaved;
            if (localDraft.serverBaseline !== undefined && localDraft.serverBaseline !== null) {
              draftIsUnsaved = localDraft.serverBaseline === findingsHtml;
            } else if (serverTs > 0) {
              draftIsUnsaved = draftTs > serverTs;
            } else {
              draftIsUnsaved = true; // no signal available — legacy behaviour
            }

            if (draftDiffers && draftIsUnsaved && !r.isFinalized) {
              const ageMin = Math.max(1, Math.round((Date.now() - draftTs) / 60000));
              const restore = await askDraftRecovery(ageMin);
              if (restore) {
                console.info('[1RAD] Crash-recovery — restoring local draft');
                applyEditorContent(localDraft.findings || '');
                if (localDraft.impression) setImpression(localDraft.impression);
                if (localDraft.advice) setAdvice(localDraft.advice);
                if (localDraft.templateId) setSelectedTemplateId(String(localDraft.templateId));
                restored = true;
              }
            }
          }
        } catch (recoverErr) {
          console.warn('[1RAD] Crash-recovery check failed', recoverErr);
        }

        if (restored) {
          // local draft already applied above
        } else if (!findingsHtml && r.templateId && templRes.data?.success) {
          // If the saved report has a templateId but no findings written yet,
          // re-apply the template content so the editor isn't blank with a
          // template-selected dropdown — that's the "binding broken" symptom.
          const tpl = (templRes.data.data || []).find(t => String(t.id ?? t.Id) === String(r.templateId));
          const tplHtml = tpl?.content ?? tpl?.Content ?? '';
          if (tplHtml) {
            console.info(`[1RAD] Saved report had templateId=${r.templateId} but empty findings — re-applying template content`);
            applyEditorContent(tplHtml);
          } else {
            applyEditorContent('');
          }
        } else {
          applyEditorContent(findingsHtml);
        }
      } else {
        // FALLBACK: New Case. Attempt auto-matching template with service name.
        console.info(`[1RAD] New Case Detected. Searching for default protocol for service: ${appointmentData.service}`);

        if (templRes.data?.success && appointmentData.service) {
          const templatesList = templRes.data.data || [];
          const serviceMatch = findTemplateForService(templatesList, appointmentData.service);

          if (serviceMatch) {
            const matchId = serviceMatch.id ?? serviceMatch.Id;
            const matchContent = serviceMatch.content ?? serviceMatch.Content ?? '';
            console.info(`[1RAD] Template matched: "${serviceMatch.name ?? serviceMatch.Name}" → ${matchContent.length} chars`);
            setSelectedTemplateId(String(matchId));
            applyEditorContent(matchContent);
          } else {
            console.info(`[1RAD] No matching template for service "${appointmentData.service}". Available: ${templatesList.map(t => t.name ?? t.Name).join(', ')}`);
          }
        }
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
        // Use the same imperative+state pattern so the editor catches up.
        setEditorText(draft.findings || '');
        requestAnimationFrame(() => {
          const handle = editorRef.current;
          if (!handle) return;
          if (handle.setContent) handle.setContent(draft.findings || '');
          else if (handle.editor) {
            try { handle.editor.commands.setContent(draft.findings || '', false); } catch {}
          }
        });
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

  // --- LIVE BACKGROUND POLLING FOR STUDY ASSETS & STATUS ---
  useEffect(() => {
    if (!appointmentId || isFinalized || !isOnline) return;

    const pollLiveUpdates = async () => {
      try {
        // 1. Fetch appointment details to see if status or notes changed
        const appRes = await apiClient.get(`/appointments/${appointmentId}`).catch(() => null);
        if (appRes?.data) {
          setActiveAppointment(prev => {
            if (!prev) return appRes.data;
            if (prev.status !== appRes.data.status || prev.notes !== appRes.data.notes || prev.technicianComments !== appRes.data.technicianComments) {
              console.log('[LIVE_UPDATE] Appointment updated:', appRes.data.status);
              return appRes.data;
            }
            return prev;
          });
        }

        // 2. Fetch manifest — skip while DICOM is downloading to avoid bandwidth competition.
        // Manifest call also returns Pending/Queued statuses so we pick up freshly
        // uploaded ZIPs the moment the backend extraction worker finishes them.
        if (!isHydratingRef.current) {
          const manifestRes = await apiClient.get(`/Study/${appointmentId}/manifest`).catch(() => null);
          const manifestAssets = (manifestRes?.data?.success && manifestRes.data.data?.assets) || null;
          if (manifestAssets) {
            setUploadedFiles(prev => {
              // Don't overwrite if we already have extracted series (local upload OR hydrated remote ZIP).
              // Both populate rawFiles + set needsHydration=false. We also catch the case where one
              // remote ZIP got expanded into multiple series entries sharing the same source id.
              const hasExtractedSeries = prev.some(a =>
                (a.rawFiles?.length > 0) ||
                (a.needsHydration === false && a.seriesUID) ||
                (a.type === 'DICOM SERIES')
              );
              if (hasExtractedSeries) {
                console.log('[LIVE_UPDATE] Preserving extracted series, skipping API sync', {
                  prevCount: prev.length,
                  manifestCount: manifestAssets.length
                });
                return prev;
              }

              // Compare source asset ids (the manifest entries are series-expanded,
              // so we de-dupe by sourceAssetId / id when comparing).
              const manifestSourceIds = manifestAssets.map(a => String(a.assetId));
              const currentSourceIds  = prev.map(a => String(a.sourceAssetId || a.id));
              const sameSet = manifestSourceIds.length === new Set([...manifestSourceIds, ...currentSourceIds]).size
                              && manifestSourceIds.length === currentSourceIds.length;

              if (!sameSet) {
                console.log('[LIVE_UPDATE] Assets changed, reloading study library...');
                const hydAssets = assetsFromManifest(manifestAssets);
                setOriginalAssets(hydAssets);
                return hydAssets;
              }
              return prev;
            });
          }
        }
      } catch (err) {
        console.warn('[LIVE_UPDATE] Failed to poll updates:', err);
      }
    };

    const interval = setInterval(pollLiveUpdates, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [appointmentId, isFinalized, isOnline]);

  // --- OFFLINE AUTOSAVE ---
  useEffect(() => {
    if (!appointmentId || isFinalized) return;

    const autosaveTimer = setTimeout(async () => {
      // Pull fresh editor HTML so attribute-only changes (right-align,
      // text-color, etc.) made within the 300 ms onUpdate debounce window
      // still make it into the persisted draft.
      const freshFindings = editorRef.current?.editor?.getHTML?.() ?? editorText;
      const draft = {
        findings: freshFindings,
        impression,
        advice,
        selectedTemplateId,
        timestamp: new Date().getTime(),
        serverBaseline: serverBaselineRef.current,
      };
      console.log(`[REPORTING] Autosaving draft for ${appointmentId}...`);
      await nativeStorage.set(`1rad_draft_${appointmentId}`, draft);
    }, 2000); // Debounce for 2 seconds

    return () => clearTimeout(autosaveTimer);
  }, [editorText, impression, advice, selectedTemplateId, appointmentId, isFinalized]);



  const handleSaveReport = async (finalizing = false) => {
    if (!appointmentId) {
      showNotif('error', 'CONTEXT MISSING', 'Cannot save the report — appointment context is missing. Please reload the page.');
      return;
    }

    // Flush any pending editor changes (debounce is 300ms) so all content is saved
    let currentFindings = editorText;
    if (editorRef.current?.editor) {
      currentFindings = editorRef.current.editor.getHTML();
    }
    // ── Text-align persistence diagnostic ──────────────────────────────
    // Count text-align occurrences in the HTML being saved so we can tell
    // the user whether alignment leaves the browser intact. If this prints
    // alignCount > 0 but the post-reload version reports 0, the bug is
    // server-side or wire-level. If this prints 0 right after the user
    // clicked Right-Align, the bug is in the editor command itself.
    try {
      const sample = (currentFindings || '');
      const alignMatches = sample.match(/text-align\s*:\s*[a-z]+/gi) || [];
      console.info('[ALIGN_DIAG] save payload:', {
        finalizing,
        htmlLength: sample.length,
        alignCount: alignMatches.length,
        aligns: alignMatches.slice(0, 5),
        firstSnippet: sample.slice(0, 200),
      });
    } catch (_) { /* never block save on diagnostic */ }

    const payload = {
      appointmentId: appointmentId,
      templateId: selectedTemplateId,
      findings: currentFindings,
      impression: impression || '',
      advice: advice || '',
      isFinalized: finalizing,
      reportingMode: 'Narrative'
    };

    if (!isOnline) {
      await addToOutbox('REPORT', payload);
      showNotif('warning', finalizing ? 'QUEUED FOR SYNC' : 'CACHED LOCALLY', finalizing ? 'You are offline. The finalized report has been queued and will sync automatically when reconnected.' : 'You are offline. Draft has been saved locally and will sync when reconnected.');
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
        // The server now holds exactly what we just sent — advance the
        // baseline so any subsequent draft compares lineage against this
        // saved content (and a reload right after save won't falsely prompt).
        serverBaselineRef.current = currentFindings;
        showNotif('success', finalizing ? 'REPORT FINALIZED' : 'DRAFT SAVED', finalizing ? 'Report has been finalized and dispatched successfully.' : 'Your changes have been saved successfully.');
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
        showNotif('warning', 'SAVED TO OUTBOX', 'Network error encountered. Report has been saved to the offline outbox and will sync automatically.');
        if (finalizing) {
          setIsFinalized(true);
          navigate('/doctor-board');
        }
      } else {
        showNotif('error', 'SAVE FAILED', `Could not save the report: ${err.response?.data?.error || err.message}`);
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

  // Persist a freshly-uploaded ZIP / DICOM file to the backend so other devices and
  // the technician/admin board can see it. Mirrors the flow used in TechnicianPage.
  const persistStudyAsset = async (file) => {
    if (!appointmentId) {
      console.warn('[REPORTING] No appointmentId — skipping backend persistence.');
      return;
    }
    // Path A: direct browser → Azure via SAS (browser never goes through backend
    // for the actual bytes — saves ~50% of total upload time on average and
    // ~75% with the parallel-block path for files >8 MB).
    try {
      console.log(`[REPORTING] 📤 Direct SAS upload: ${file.name} (${(file.size / 1048576).toFixed(1)} MB)`);
      await uploadStudyAssetDirect(file, appointmentId, (p) => {
        // Caller can choose to surface this in setProcessingStatus if desired.
        if (p?.stage?.startsWith('uploading')) {
          const mb = (p.loaded / 1048576).toFixed(1);
          const total = (p.total / 1048576).toFixed(1);
          console.log(`[REPORTING] upload ${p.stage}: ${mb} / ${total} MB (${(p.pct * 100).toFixed(0)}%)`);
        }
      });
      console.log(`[REPORTING] ✅ Direct upload completed: ${file.name}`);
      return;
    } catch (sasErr) {
      console.warn('[REPORTING] Direct SAS upload failed, falling back to legacy multipart:', sasErr?.message);
    }
    // Path B fallback: legacy multipart POST through the backend.
    try {
      const formData = new FormData();
      formData.append('AppointmentId', appointmentId);
      formData.append('File', file);
      console.log(`[REPORTING] 📤 (fallback) multipart upload: ${file.name}`);
      await apiClient.post('/Study/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      console.log(`[REPORTING] ✅ (fallback) Backend save completed: ${file.name}`);
    } catch (err) {
      console.error('[REPORTING] Persistence failed (both paths)', err);
    }
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

        console.log('[REPORTING] ZIP Processing result:', {
          totalSeries: classifiedAssets.length,
          seriesList: classifiedAssets.map((s, i) => ({
            index: i,
            name: s.patientName,
            desc: s.seriesDesc,
            fileCount: s.files?.length || 0,
            seriesUID: s.seriesUID,
            modality: s.modality
          }))
        });

        if (!Array.isArray(classifiedAssets) || classifiedAssets.length === 0) {
          throw new Error('NO_DICOM_SERIES: No valid DICOM image series found in the uploaded file');
        }

        // Background persist the ZIP to the backend (fire-and-forget — local extraction
        // already succeeded, so the user can keep working while the upload finishes).
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

        console.log('[REPORTING] Final assets to be stored:', {
          count: newAssets.length,
          assets: newAssets.map((a, i) => ({
            index: i,
            name: a.name,
            rawFilesCount: a.rawFiles?.length || 0
          }))
        });

        if (newAssets.length > 0) {
          setUploadedFiles(prev => {
            const updated = [...prev, ...newAssets];
            console.log(`[REPORTING] ✅ Files uploaded successfully! Total series: ${updated.length}`, updated);
            return updated;
          });
          setIsDicomImage(true);
          setActiveAssetIndex(0);
        }

        // Log processing statistics
        if (processingResult?.stats) {
          console.log(`[REPORTING] Processing statistics:`, processingResult.stats);
        }
      } catch (err) {
        console.error('Optimized ZIP load failed', err);
        setError(err.message || String(err));
      } finally {
        setLoading(false);
        setProcessingStatus('');
        setLoadingProgress({ stage: '', current: 0, total: 0 });
      }
    } else {
      // Plain DICOM (.dcm/.dicom) — persist to backend + add to local stack.
      const isDicom = file.name.toLowerCase().endsWith('.dcm') || file.name.toLowerCase().includes('dicom') || file.type === 'application/dicom';

      persistStudyAsset(file);

      setUploadedFiles(prev => [...prev, {
        name: file.name,
        type: isDicom ? 'DICOM' : (file.type || 'UNKNOWN'),
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
        time: new Date().toLocaleTimeString(),
        previewUrl: isDicom ? null : URL.createObjectURL(file),
        isZip: false,
        rawFiles: isDicom ? [file] : null,
      }]);
      if (isDicom) {
        setIsDicomImage(true);
        setActiveAssetIndex(prev => prev || 0);
      }
    }

    // Reset the file input so the same file can be re-uploaded if needed.
    if (e.target) e.target.value = '';
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

    isHydratingRef.current = true;
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

      if (!asset.remoteUrl) {
        throw new Error('MISSING_URL: Asset remote URL is not available. Please check the asset configuration.');
      }

      console.log(`[DICOM_LOAD] Starting download: ${asset.remoteUrl}`);
      setProcessingStatus('Downloading study...');

      // ── Direct download — no pre-flight connection test ────────────────────
      let blob;
      let response;
      try {
        response = await fetch(asset.remoteUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/zip, application/octet-stream, */*' },
          credentials: 'same-origin',
          cache: 'default', // allow browser HTTP cache — avoids re-downloading unchanged studies
        });
      } catch (fetchError) {
        // CORS / network failure → proxy fallback
        const isCors = fetchError.name === 'TypeError' || fetchError.message.includes('Failed to fetch');
        if (isCors) {
          console.log(`[DICOM_LOAD] Direct fetch failed (CORS?), trying proxy...`);
          setProcessingStatus('Trying secure proxy...');
          try {
            const proxyRes = await apiClient.get('/Study/proxy-asset', {
              params: { url: asset.remoteUrl },
              responseType: 'blob',
              timeout: 120000,
            });
            if (proxyRes.status === 200 && proxyRes.data) {
              blob = proxyRes.data;
            } else {
              throw new Error('Proxy returned no data.');
            }
          } catch (proxyErr) {
            throw new Error(`CORS_ERROR: Direct access blocked and proxy failed. Contact your administrator to configure CORS on Azure Blob Storage.`);
          }
        } else {
          throw new Error(`NETWORK_ERROR: ${fetchError.message}`);
        }
      }

      // Handle HTTP error codes
      if (response && !response.ok) {
        if (response.status === 404) throw new Error('FILE_NOT_FOUND: The study file is no longer available (HTTP 404).');
        if (response.status === 403) throw new Error('ACCESS_DENIED: You don\'t have permission to access this study file (HTTP 403).');
        if (response.status === 500) throw new Error('SERVER_ERROR: The server encountered an error retrieving the study (HTTP 500).');
        throw new Error(`HTTP_ERROR: Server returned ${response.status} ${response.statusText}.`);
      }

      // ── STREAMING decode: extract ZIP entries while bytes are still arriving ─
      // This overlaps the Azure → browser download with JS-side DICOM parsing,
      // eliminating the post-download "extract + scan" wait.
      let result;
      let earlyFlushedFile = null; // The File handed to viewer on first-slice-early
      if (response && !blob) {
        try {
          result = await dicomOptimizer.processStreamingZipResponse(response, {
            onProgress: (p) => {
              if (p.stage === 'downloading') {
                const mb = (p.bytesReceived / 1048576).toFixed(1);
                if (p.totalBytes > 0) {
                  const pct = Math.round((p.bytesReceived / p.totalBytes) * 100);
                  const total = (p.totalBytes / 1048576).toFixed(1);
                  setProcessingStatus(`Downloading: ${mb} / ${total} MB (${pct}%) · ${p.validFiles} slices extracted`);
                  setLoadingProgress({ stage: 'Downloading', current: pct, total: 100 });
                } else {
                  setProcessingStatus(`Downloading: ${mb} MB · ${p.validFiles} slices extracted`);
                }
              } else if (p.stage === 'extracting') {
                setProcessingStatus(`Extracting: ${p.entriesDone} entries · ${p.validFiles} valid slices`);
              }
            },
            onSeriesFound: (info) => {
              console.log(`[DICOM_LOAD] New series discovered: ${info.seriesDesc}`);
            },
            // FIRST-SLICE-EARLY: as soon as fflate decodes the first DICOM entry,
            // hand it to the viewer so the user can start reading while the rest
            // of the ZIP keeps streaming. When streaming completes the viewer's
            // append-detection picks up the full stack without resetting.
            onFirstDicom: ({ file, metadata }) => {
              earlyFlushedFile = file;
              console.log('[DICOM_LOAD] ⚡ First slice ready — flushing 1-file preview to viewer');
              const previewSeries = {
                ...asset,
                name: `${metadata.patientName || 'Study'} - ${metadata.seriesDesc || 'Series'}`,
                rawFiles: [file],
                needsHydration: false,
                seriesUID: metadata.seriesUID,
                modality: metadata.modality,
                metadata: { ...metadata },
                streamingInProgress: true,
              };
              setUploadedFiles(prev => {
                const newFiles = [...prev];
                newFiles.splice(index, 1, previewSeries);
                return newFiles;
              });
              setIsDicomImage(true);
              setLoading(false);
              setProcessingStatus(`Streaming remaining slices in background…`);
            },
          });
          if (!result || !result.series) {
            throw new Error('PROCESSING_FAILED: streaming processor returned invalid result.');
          }
        } catch (streamErr) {
          console.warn('[DICOM_LOAD] Streaming decode failed, falling back to full-blob path:', streamErr);
          result = null;
        }
      }

      // Fallback path: proxy gave us a Blob (no streaming possible) OR streaming threw.
      if (!result) {
        if (!blob && response) {
          // Stream wasn't consumed yet (only true if streaming branch didn't run) — collect chunks.
          const reader = response.body.getReader();
          const chunks = [];
          let received = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            const mb = (received / 1048576).toFixed(1);
            setProcessingStatus(`Downloading (fallback): ${mb} MB received...`);
          }
          blob = new Blob(chunks);
        }
        if (!blob || blob.size === 0) {
          throw new Error('EMPTY_FILE: The downloaded study file is empty (0 bytes).');
        }
        try {
          result = await dicomOptimizer.processZipFileOptimized(
            blob,
            (progress) => {
              setLoadingProgress(progress);
              const parts = [`${progress.stage}: ${progress.current}/${progress.total} files`];
              if (progress.seriesCount) parts.push(`(${progress.seriesCount} series)`);
              setProcessingStatus(parts.join(' '));
            },
            (seriesInfo) => console.log(`[DICOM_LOAD] New series discovered: ${seriesInfo.seriesDesc}`)
          );
          if (!result || !result.series) throw new Error('PROCESSING_FAILED: invalid result.');
        } catch (processingError) {
          console.error(`[DICOM_LOAD] Processing error:`, processingError);
          throw new Error(`DICOM_PROCESSING_ERROR: Failed to process study files. ${processingError.message}`);
        }
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
            showNotif('warning', 'STUDY LOADED WITH WARNINGS', `Valid files imported: ${stats.validFiles}\n${stats.corruptedFiles} corrupted file(s) were automatically removed to ensure optimal viewing.`);
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

      // Cache write — fire-and-forget so the viewer renders immediately
      if (finalAssets.length > 0 && asset.id) {
        const cachePayload = {
          ...asset,
          series: finalAssets.map(ca => ({
            name: ca.name, rawFiles: ca.rawFiles, seriesUID: ca.seriesUID,
            modality: ca.modality, patientName: ca.patientName,
            seriesDesc: ca.seriesDesc, metadata: ca.metadata
          }))
        };
        DicomCache.set(asset.id, cachePayload)
          .then(() => console.log(`[DICOM_LOAD] Cached asset ${asset.id}`))
          .catch(e => console.warn(`[DICOM_LOAD] Cache write failed (non-critical):`, e));
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

      showNotif('error', 'DIAGNOSTIC SIGNAL FAILURE', errorMessage);
    } finally {
      isHydratingRef.current = false;
      setLoading(false);
      setProcessingStatus('');
      setLoadingProgress({ stage: '', current: 0, total: 0 });
    }
  };

  useEffect(() => {
    // Only hydrate if the DICOM tab is currently open — avoids downloading on page load.
    if (dicomTabActiveRef.current && uploadedFiles[activeAssetIndex]?.needsHydration) {
      hydrateZipAsset(activeAssetIndex);
    }
  }, [activeAssetIndex, uploadedFiles]);





  const insertContent = (content) => {
    if (!editorRef.current) return;

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
      // Ensure we don't double wrap if it's already HTML, but convert newlines for simple text
      if (!content.includes('<')) {
        htmlContent = content.replace(/\n/g, '<br>');
      }
    }

    editorRef.current.insertContent(htmlContent);
  };




  const handleEditorChange = (html) => {
    setEditorText(html);
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

  const handlePreviewPrint = () => {
    // Flush any pending editor changes (debounce is 300ms) so the preview shows all pages
    if (editorRef.current?.editor) {
      setEditorText(editorRef.current.editor.getHTML());
    }
    setIsPreviewOpen(true);
  };

  // handleKeyDown removed - logic now handled inside NarrativeEditor via Tiptap extension




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

      // Ignore shortcuts when typing in input fields OR anywhere inside the
      // NarrativeEditor (covers Ribbon buttons that don't have isContentEditable
      // but still belong to the editor's interaction surface).
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable ||
        e.target.closest?.('.narrative-editor-container')
      ) {
        return;
      }

      // Prevent default for our shortcuts
      const shortcutKeys = ['w', 'z', 'p', 's', 'l', 'h', 'b', 'a', 'c', 'e', 'r', 'f', 'm', 'i', 'v', 'x', 'k', 'n', 't', 'g', 'y'];
      if (shortcutKeys.includes(e.key.toLowerCase()) || e.key === 'Escape' || e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
      }

      // Tool Selection Shortcuts
      switch (e.key.toLowerCase()) {
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
    if (!newTable.name) { showNotif('warning', 'TABLE NAME REQUIRED', 'Please enter a name for the table before saving.'); return; }
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
      if (!img || !editorRef.current?.container) return;
      const rect = img.getBoundingClientRect();
      const parentRect = editorRef.current.container.getBoundingClientRect();
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
    else if (cmd === 'diagram') showNotif('info', 'COMING SOON', 'The integrated flowchart / diagram engine is currently under development and will be available soon.');
    setShowSlashMenu(false);
  };

  const resizeImg = (size) => {
    if (!selectedImg) return;
    const container = document.getElementById(selectedImg + '_container');
    if (container) {
      container.style.width = size;
      setEditorText(editorRef.current?.getHTML() || '');
    }
  };

  const deleteImg = () => {
    if (!selectedImg) return;
    const container = document.getElementById(selectedImg + '_container');
    if (container) {
      container.remove();
      setSelectedImg(null);
      setEditorText(editorRef.current?.getHTML() || '');
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
    <>
    <div className="reporting-app-container">
      {/* SCOPED CSS */}
      <style>{`
        .reporting-app-container {
          height: calc(100vh - 20px);
          width: calc(100% - 24px);
          margin-left: 24px;
          margin-top: 20px;
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
          background: #ffffff; padding: 0;
          overflow: hidden; display: flex; flex-direction: column;
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
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
            height: 65vh; 
            display: flex; 
            flex-direction: row; /* Keep row to show toolbar */
          }
          
          /* CRITICAL: Force toolbar visibility on tablets */
          #dicom-toolbar {
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
            height: auto;
            display: flex;
            border-left: none;
            padding: 0;
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
          
          #dicom-toolbar {
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
          
          #dicom-toolbar {
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
          .panel-center { width: 100% !important; height: 50vh; display: flex; flex-direction: column; }
          .panel-center > div:first-child { display: none !important; } /* Hide left toolbar only on small mobile */
          .panel-right { width: 100% !important; height: auto; display: flex; border-left: none; padding: 0; overflow: hidden; }
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
            <div style={{ display: 'flex', gap: '8px', marginLeft: '15px', alignItems: 'center' }}>
              <span style={{ background: '#0f52ba', color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 950, letterSpacing: '1px' }}>{activeAppointment?.modality || '...'}</span>
              {/* Priority chip — visible while reporting so the radiologist
                  doesn't miss a STAT / URGENT case once they're in the editor. */}
              {activeAppointment?.priority && activeAppointment.priority !== 'ROUTINE' && (
                <span
                  className={activeAppointment.priority === 'STAT' ? 'priority-chip-stat' : 'priority-chip-urgent'}
                  style={{
                    background: activeAppointment.priority === 'STAT' ? '#fee2e2' : '#fef3c7',
                    color: activeAppointment.priority === 'STAT' ? '#dc2626' : '#d97706',
                    border: `1px solid ${activeAppointment.priority === 'STAT' ? '#fecaca' : '#fde68a'}`,
                    padding: '4px 10px', borderRadius: '999px',
                    fontSize: '10px', fontWeight: 950, letterSpacing: '1px',
                  }}
                >{activeAppointment.priority}</span>
              )}
              {/* Turnaround-time pills: on-premises clock (live) + scan→delivery
                  (final). Hidden until ArrivedAt is set so pre-arrival cases
                  don't show a clock. */}
              {activeAppointment?.arrivedAt && (() => {
                const sev = premisesSeverity(activeAppointment.arrivedAt, activeAppointment.deliveredAt);
                const ps  = premisesPillStyle(sev);
                const onPrem = formatElapsed(activeAppointment.arrivedAt, activeAppointment.deliveredAt);
                const scanDel = (activeAppointment.scanStartedAt && activeAppointment.deliveredAt)
                  ? formatElapsed(activeAppointment.scanStartedAt, activeAppointment.deliveredAt)
                  : null;
                return (
                  <>
                    <span title={activeAppointment.deliveredAt ? 'Total time on premises' : 'On premises (live)'} style={{
                      background: ps.bg, color: ps.color, border: `1px solid ${ps.border}`,
                      padding: '4px 10px', borderRadius: '999px',
                      fontSize: '10px', fontWeight: 950, letterSpacing: '0.5px',
                    }}>⏱ {onPrem}</span>
                    {scanDel && (
                      <span title="Scan start → delivered" style={{
                        background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd',
                        padding: '4px 10px', borderRadius: '999px',
                        fontSize: '10px', fontWeight: 950, letterSpacing: '0.5px',
                      }}>📋 {scanDel}</span>
                    )}
                  </>
                );
              })()}
              {(activeAppointment?.referredBy || activeAppointment?.ReferredBy) && (
                <span style={{ 
                  background: '#f5f3ff', 
                  border: '1px solid #ddd6fe', 
                  color: '#7c3aed', 
                  padding: '4px 10px', 
                  borderRadius: '6px', 
                  fontSize: '10px', 
                  fontWeight: 950, 
                  letterSpacing: '0.5px'
                }}>
                  ↗ REF: {activeAppointment?.referredBy || activeAppointment?.ReferredBy}
                  {(activeAppointment?.referredContact || activeAppointment?.ReferredContact) && ` (${activeAppointment?.referredContact || activeAppointment?.ReferredContact})`}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* COMPACT ACTIONS */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {/* ... Reserved for future header actions ... */}
          </div>

          <div style={{
            display: 'flex', gap: '8px', background: 'rgba(15, 82, 186, 0.05)',
            padding: '5px', borderRadius: '16px', border: '1px solid rgba(15, 82, 186, 0.1)'
          }}>
            {[
              { id: 'DICOM', label: 'DICOM_VIEWER', icon: '🔍' },
              { id: 'REPORTING', label: 'REPORTING', icon: '📝' },
              { id: 'VOICE', label: 'AI_VOICE_REPORTING', icon: '🎙️' },
              { id: 'TIMELINE', label: 'TIMELINE', icon: '🕒' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => handleSelectMainTab(tab.id)}
                style={{
                  background: activeMainTab === tab.id ? 'linear-gradient(135deg, #0f52ba 0%, #1e3a8a 100%)' : 'transparent',
                  border: 'none', padding: '8px 18px', borderRadius: '12px', cursor: 'pointer',
                  color: activeMainTab === tab.id ? 'white' : '#64748b',
                  fontSize: '10px', fontWeight: 950, display: 'flex', alignItems: 'center', gap: '8px',
                  transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  boxShadow: activeMainTab === tab.id ? '0 4px 12px rgba(15, 82, 186, 0.2)' : 'none'
                }}
              >
                <span style={{ fontSize: '14px' }}>{tab.icon}</span>
                {!isMobile && <span>{tab.label}</span>}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* --- MAIN LAYOUT --- */}
      <div className="main-layout" style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* DICOM TAB — MOBILE: simplified TechnicianPage-style layout.
            Intentionally does NOT use the .panel-center class — that class has a
            mobile media-query rule forcing height: 65vh + flex-row that fights
            this layout. We give the wrapper its own inline-only styles instead. */}
        {activeMainTab === 'DICOM' && isMobile && (() => {
          const activeAsset = uploadedFiles[activeAssetIndex];
          const hasRawFiles = !!(activeAsset?.rawFiles?.length);
          const needsLoad = !!activeAsset?.needsHydration && !hasRawFiles;
          return (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 auto',
            width: '100%',
            // Use SMALL viewport height (svh) instead of dynamic (dvh). dvh
            // shrinks when the URL bar collapses, causing the entire DICOM
            // layout to grow upward on the first user gesture — the
            // user-reported "series going up" issue. svh stays pinned to the
            // smallest reasonable viewport, so the canvas height never shifts
            // after mount. 80 px = 20 px container top margin + 60 px page
            // header.
            height: 'calc(100svh - 80px)',
            minHeight: '480px',
            padding: 0,
            background: '#0a0a0f',
            overflow: 'hidden',
            // Block scroll anchoring — if Cornerstone re-renders into a
            // resized canvas, browsers may try to "keep the user's view
            // anchored" by scrolling the parent, which manifests as the
            // series strip drifting up. Force a stable layout.
            overflowAnchor: 'none',
          }}>
            {/* Top strip — slice counter + count of series. Fixed height so
                the layout stays stable on tap. Shrunk from 40 → 34 px. */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
              borderBottom: '1px solid #334155',
              flexShrink: 0,
              height: '34px',
            }}>
              <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 900, letterSpacing: '1.5px' }}>
                {uploadedFiles.length} SERIES
              </div>
              <div style={{ flex: 1 }} />
              {hasRawFiles && (
                <>
                  {/* Zoom out */}
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('dicom-viewer:zoom', { detail: { delta: 0.8 } }))}
                    title="Zoom out"
                    style={{
                      width: '32px', height: '32px',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'white', borderRadius: '6px',
                      fontSize: '15px', fontWeight: 900,
                      cursor: 'pointer', touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >−</button>
                  {/* Zoom in */}
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('dicom-viewer:zoom', { detail: { delta: 1.25 } }))}
                    title="Zoom in"
                    style={{
                      width: '32px', height: '32px',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'white', borderRadius: '6px',
                      fontSize: '14px', fontWeight: 900,
                      cursor: 'pointer', touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >+</button>
                  {/* Reset zoom */}
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('dicom-viewer:zoom', { detail: { reset: true } }))}
                    title="Reset zoom"
                    style={{
                      height: '32px', padding: '0 8px',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'white', borderRadius: '6px',
                      fontSize: '10px', fontWeight: 800, letterSpacing: '1px',
                      cursor: 'pointer', touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >FIT</button>
                  {/* Full-screen DICOM viewer (dedicated page) */}
                  <button
                    type="button"
                    onClick={() => {
                      const validSeries = uploadedFiles.filter(f => f.rawFiles && f.rawFiles.length > 0);
                      if (validSeries.length === 0) {
                        showNotif('warning', 'NO DICOM FILES', 'Wait for the study to finish loading.');
                        return;
                      }
                      const allSeries = validSeries.map(series => ({
                        name: series.name,
                        files: series.rawFiles,
                        seriesUID: series.seriesUID,
                        modality: series.modality,
                        // Pre-rendered JPEG thumbnail — keeps the placeholder
                        // visible in the fullscreen viewer during cold start.
                        thumbnailUrl: series.thumbnailUrl,
                      }));
                      const activeValidIdx = validSeries.findIndex(s => s.name === uploadedFiles[activeAssetIndex]?.name);
                      navigate('/dicom-viewer', {
                        state: {
                          allSeries,
                          files: validSeries[0].rawFiles,
                          seriesName: uploadedFiles[activeAssetIndex]?.name || 'DICOM STUDY',
                          activeSeriesIndex: activeValidIdx >= 0 ? activeValidIdx : 0,
                          layoutMode: '1x1',
                          appointmentData: { ...activeAppointment, appointmentId, id: appointmentId },
                        },
                      });
                    }}
                    title="Open full-screen DICOM viewer"
                    style={{
                      height: '32px', padding: '0 10px',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      border: '1px solid #34d399',
                      color: 'white', borderRadius: '6px',
                      fontSize: '10px', fontWeight: 900, letterSpacing: '1px',
                      cursor: 'pointer', touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                      display: 'flex', alignItems: 'center', gap: '4px',
                      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
                    }}
                  >⛶ FULL</button>
                  <div style={{
                    background: 'rgba(59, 130, 246, 0.25)',
                    border: '1px solid rgba(59, 130, 246, 0.5)',
                    padding: '5px 10px', borderRadius: '6px',
                    fontSize: '11px', fontWeight: 800, color: 'white', whiteSpace: 'nowrap',
                  }}>
                    {currentSlice} / {activeAsset.rawFiles.length}
                  </div>
                </>
              )}
            </div>

            {/* Horizontal scrolling series strip — compact density on phones.
                Heights are FIXED (no minHeight) so the strip cannot grow when
                a tile gains a focus outline or active border, which was making
                the layout shift on tap. */}
            {uploadedFiles.length > 0 && (
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '6px',
                padding: '5px 8px',
                background: '#0f172a',
                borderBottom: '1px solid #334155',
                overflowX: 'auto',
                overflowY: 'hidden',
                WebkitOverflowScrolling: 'touch',
                scrollSnapType: 'x proximity',
                flexShrink: 0,
                // Strip is 48 px tall (tile 38 + 5 px padding × 2). Fixed
                // height — not minHeight — prevents content from pushing the
                // viewer down when an active tile gains its 2 px border.
                height: '48px',
                overflowAnchor: 'none',
              }}>
                {uploadedFiles.map((f, i) => {
                  const isActive = activeAssetIndex === i;
                  const sliceCount = f.rawFiles?.length || 0;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveAssetIndex(i);
                      }}
                      title={f.name}
                      style={{
                        flexShrink: 0,
                        minWidth: '64px',
                        maxWidth: '88px',
                        height: '38px',
                        // Box-sizing forces the active 2 px border to absorb
                        // INTO the 38 px height rather than adding to it.
                        boxSizing: 'border-box',
                        padding: '3px 6px',
                        borderRadius: '6px',
                        border: isActive ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                        background: isActive
                          ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
                          : 'rgba(255,255,255,0.05)',
                        color: isActive ? 'white' : '#cbd5e1',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'flex-start',
                        gap: '1px',
                        scrollSnapAlign: 'start',
                        touchAction: 'manipulation',
                        WebkitTapHighlightColor: 'transparent',
                        boxShadow: isActive ? '0 2px 8px rgba(59, 130, 246, 0.35)' : 'none',
                      }}
                    >
                      <div style={{ fontSize: '10px', fontWeight: 950, letterSpacing: '0.3px', lineHeight: 1 }}>
                        S{i + 1}
                      </div>
                      <div style={{
                        fontSize: '8px',
                        fontWeight: 600,
                        opacity: 0.8,
                        lineHeight: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        width: '100%',
                      }}>
                        {sliceCount > 0 ? `${sliceCount}` : '…'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Viewer / state area — explicit min-height so flex never collapses to 0 */}
            <div style={{
              flex: '1 1 auto',
              position: 'relative',
              background: '#000',
              minHeight: '300px',
              overflow: 'hidden',
            }}>
              {loading && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(15, 23, 42, 0.95)',
                  backdropFilter: 'blur(8px)', zIndex: 100,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'white', padding: '20px', textAlign: 'center',
                }}>
                  <div style={{ width: '40px', height: '40px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <div style={{ fontSize: '12px', fontWeight: 900, marginTop: '14px', letterSpacing: '1px' }}>PROCESSING DICOM</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px', maxWidth: '90%', wordBreak: 'break-word' }}>{processingStatus || 'Initializing…'}</div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {uploadedFiles.length === 0 ? (
                /* No assets at all for this study */
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', flexDirection: 'column', gap: '16px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', opacity: 0.3 }}>📡</div>
                  <div>NO DICOM ASSETS FOR THIS STUDY</div>
                  <input type="file" multiple accept=".dcm,.dicom,.zip" onChange={handleFileChange} style={{ fontSize: '11px', color: '#3b82f6' }} />
                </div>
              ) : needsLoad && !loading ? (
                /* Asset metadata exists but rawFiles not yet downloaded */
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: '12px', fontWeight: 800, flexDirection: 'column', gap: '14px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', opacity: 0.4 }}>☁️</div>
                  <div style={{ letterSpacing: '1px' }}>STUDY READY TO LOAD</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', maxWidth: '260px', lineHeight: '1.4' }}>
                    Tap to download imaging data from cloud storage and start viewing.
                  </div>
                  <button
                    onClick={() => hydrateZipAsset(activeAssetIndex)}
                    style={{
                      marginTop: '8px',
                      padding: '10px 20px',
                      borderRadius: '10px',
                      border: '1px solid #3b82f6',
                      background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: 900,
                      letterSpacing: '1px',
                      cursor: 'pointer',
                    }}
                  >
                    ▼ LOAD STUDY
                  </button>
                </div>
              ) : !hasRawFiles ? (
                /* Files prop will be empty — show a neutral state instead of mounting the viewer with [] */
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px' }}>
                  WAITING FOR DATA…
                </div>
              ) : (
                <AdvancedDicomViewer
                  key={`mobile-${activeAssetIndex}_${resetTrigger}`}
                  files={activeAsset.rawFiles}
                  placeholderUrl={activeAsset.thumbnailUrl}
                  preParsedMetadata={activeAsset.metadata}
                  activeTool={activeTool}
                  isCine={cineEnabled}
                  isSynced={false}
                  keyImages={keyImages}
                  onKeyImageToggle={toggleKeyImage}
                  onSliceChange={(idx) => setCurrentSlice(idx + 1)}
                  enableFullscreen={false}
                  showMetadata={false}
                  showMeasurements={false}
                  showWindowingPresets={false}
                  enableAdvancedTools={false}
                  onMetadata={setActiveMetadata}
                  invert={viewportProps.invert}
                  flipHorizontal={viewportProps.flipHorizontal}
                  flipVertical={viewportProps.flipVertical}
                  rotation={viewportProps.rotation}
                  resetTrigger={resetTrigger}
                />
              )}
            </div>
          </div>
          );
        })()}

        {/* DICOM TAB — DESKTOP / TABLET (existing complex layout) */}
        {activeMainTab === 'DICOM' && !isMobile && (
          <div className="panel panel-center" style={{ display: 'flex', flex: 1, padding: 0 }}>
            {/* LEFT TOOLBAR - Tablet Optimized */}
            {true && (
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
                        showNotif('info', 'TOUCH GESTURE GUIDE', 'Pinch to zoom in/out  •  Single finger to pan  •  Double tap to reset view  •  Use toolbar for measurements  •  Keyboard shortcuts available with external keyboard.');
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
            )}

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
                {/* Series Display Indicator */}
                <div style={{
                  background: 'rgba(139, 92, 246, 0.2)',
                  border: '1px solid rgba(139, 92, 246, 0.5)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 900,
                  color: '#c4b5fd',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span>🎬</span> SERIES: S{(activeAssetIndex + 1)} / {uploadedFiles.length} {uploadedFiles[activeAssetIndex]?.name && `(${uploadedFiles[activeAssetIndex].name.substring(0, 20)}...)`}
                </div>

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
                      // Check if we have any files with rawFiles
                      const validSeries = uploadedFiles.filter(file => file.rawFiles && file.rawFiles.length > 0);

                      if (validSeries.length > 0) {
                        // Pass ALL series to the viewer, not just the active one
                        const allSeries = validSeries.map(series => ({
                          name: series.name,
                          files: series.rawFiles,
                          seriesUID: series.seriesUID,
                          modality: series.modality,
                          // Pre-rendered JPEG thumbnail (Option C manifest) —
                          // shown as placeholder in viewer during cold start.
                          thumbnailUrl: series.thumbnailUrl
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

                        navigate('/dicom-viewer', {
                          state: navigationState,
                          replace: false
                        });
                      } else {
                        showNotif('warning', 'NO DICOM FILES', 'No DICOM files are available for full-screen viewing. Please ensure DICOM files are loaded in the viewer first.');
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

              <div style={{ flex: 1, background: '#000', position: 'relative', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '2px', padding: '2px' }}>
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

                {/* SERIES LIBRARY MINI-SIDEBAR — horizontal strip on mobile, vertical sidebar otherwise */}
                {uploadedFiles.length > 0 && (
                  <div style={{
                    width: isMobile ? '100%' : '60px',
                    minWidth: isMobile ? 'auto' : '60px',
                    maxWidth: isMobile ? 'none' : '60px',
                    height: isMobile ? '70px' : '100%',
                    minHeight: isMobile ? '70px' : 'auto',
                    flexShrink: 0,
                    background: '#0f172a',
                    borderRight: isMobile ? 'none' : '2px solid #334155',
                    borderBottom: isMobile ? '2px solid #334155' : 'none',
                    display: 'flex',
                    flexDirection: isMobile ? 'row' : 'column',
                    gap: isMobile ? '8px' : '10px',
                    padding: isMobile ? '8px' : '10px 5px',
                    zIndex: 99999,
                    position: 'relative',
                    overflow: isMobile ? 'auto' : 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    pointerEvents: 'auto'
                  }}>
                    {uploadedFiles.map((f, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('[SERIES SELECTOR] Clicked series index:', i, 'Series name:', f.name);
                          setActiveAssetIndex(i);
                        }}
                        title={f.name}
                        style={{
                          width: isMobile ? '70px' : '100%',
                          minWidth: isMobile ? '70px' : 'auto',
                          height: isMobile ? '100%' : '50px',
                          flexShrink: 0,
                          background: activeAssetIndex === i ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'rgba(255,255,255,0.05)',
                          border: activeAssetIndex === i ? '2px solid #1d4ed8' : 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', gap: '4px', boxShadow: activeAssetIndex === i ? '0 4px 12px rgba(59, 130, 246, 0.4)' : 'none',
                          transform: activeAssetIndex === i ? 'scale(1.05)' : 'scale(1)',
                          pointerEvents: 'auto',
                          position: 'relative',
                          zIndex: 99999,
                          touchAction: 'manipulation',
                          WebkitTapHighlightColor: 'transparent'
                        }}
                        onMouseEnter={(e) => {
                          if (activeAssetIndex !== i) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (activeAssetIndex !== i) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                          }
                        }}
                      >
                        <div style={{ fontSize: '12px' }}>🎞️</div>
                        <div style={{ fontSize: '8px', color: 'white', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', width: '100%', textAlign: 'center' }}>S{i + 1}</div>
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
                    {uploadedFiles.length > 0 && (
                      <>
                        {console.log('[REPORTING] Current uploadedFiles array:', {
                          length: uploadedFiles.length,
                          files: uploadedFiles.map((f, i) => ({
                            index: i,
                            name: f.name,
                            rawFilesLength: f.rawFiles?.length || 0,
                            hasMetadata: !!f.metadata
                          }))
                        })}
                      </>
                    )}
                    {[...Array(layoutMode === '2x2' ? 4 : 1)].map((_, idx) => {
                      // For 2x2, cycle through series. For 1x1, just use active series
                      const seriesIndex = layoutMode === '2x2'
                        ? (activeAssetIndex + idx) % uploadedFiles.length
                        : activeAssetIndex;

                      const currentSeries = uploadedFiles[seriesIndex];
                      const currentFiles = currentSeries?.rawFiles && Array.isArray(currentSeries.rawFiles)
                        ? currentSeries.rawFiles
                        : [];

                      console.log(`[DICOM VIEWER] Viewport ${idx} (${layoutMode}): activeIndex=${activeAssetIndex}, seriesIdx=${seriesIndex}`, {
                        seriesName: currentSeries?.name,
                        hasRawFiles: !!currentFiles,
                        rawFilesLength: currentFiles?.length || 0,
                        rawFilesType: typeof currentFiles,
                        isArray: Array.isArray(currentFiles),
                        firstFileExists: currentFiles?.[0] ? true : false,
                        firstFileName: currentFiles?.[0]?.name,
                        uploadedFilesCount: uploadedFiles.length
                      });

                      return (
                        <div key={idx} style={{ position: 'relative', background: '#000', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                          {/* DICOM Viewer with Advanced Tools */}
                          <div style={{ flex: 1, position: 'relative' }}>
                            <AdvancedDicomViewer
                              key={`${activeAssetIndex}_${idx}_${resetTrigger}`}
                              files={currentFiles || []}
                              placeholderUrl={uploadedFiles[(activeAssetIndex + idx) % uploadedFiles.length]?.thumbnailUrl}
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

                            {/* ACTIVE TOOL INDICATOR — hidden on mobile */}
                            {!isMobile && (
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
                            )}

                            {/* Windowing Presets - Bottom Right — hidden on mobile */}
                            {!isMobile && (
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
                            )}

                            {/* Key Images Indicator */}
                            {keyImages.includes(`${activeAssetIndex + idx}_${currentSlice}`) && (
                              <div style={{ position: 'absolute', top: '60px', right: '15px', zIndex: 10 }}>
                                <div style={{ background: 'rgba(245, 158, 11, 0.9)', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', color: 'white', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  ⭐ KEY IMAGE
                                </div>
                              </div>
                            )}

                            {/* Active Tool & Instructions - Bottom Left — hidden on mobile */}
                            {!isMobile && (
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
                            )}

                            {/* Measurement Results - Bottom Right — hidden on mobile */}
                            {!isMobile && idx === 0 && (
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

                    {/* Historical Mode Status Banner */}
                    {isHistoricalMode && (
                      <div style={{
                        position: 'absolute', top: '15px', left: '50%', transform: 'translateX(-50%)', zIndex: 100,
                        background: 'rgba(234, 88, 12, 0.9)', backdropFilter: 'blur(10px)',
                        padding: '8px 20px', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.2)',
                        display: 'flex', alignItems: 'center', gap: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                        animation: 'slideDown 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.8)', letterSpacing: '2px' }}>COMPARATIVE_VIEW_ACTIVE</span>
                          <span style={{ fontSize: '11px', fontWeight: 950, color: 'white' }}>
                            {historicalStudyContext?.modality} - {new Date(historicalStudyContext?.dateTime || historicalStudyContext?.appointmentDate).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          onClick={handleRestoreCurrentStudy}
                          style={{
                            background: 'white', color: '#ea580c', border: 'none',
                            padding: '6px 12px', borderRadius: '20px', fontSize: '9px',
                            fontWeight: 950, cursor: 'pointer', transition: 'all 0.2s'
                          }}
                        >
                          RETURN TO CURRENT CASE
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

            {/* REPORTING TAB */}
            {activeMainTab === 'REPORTING' && (
              <div className="panel panel-right" style={{
                flex: 1,
                display: 'flex',
                flexDirection: isMobile ? 'column-reverse' : 'row',
                minHeight: 0,
                background: '#f1f5f9',
                padding: isMobile ? '10px' : (isTablet ? '12px' : '16px'),
                gap: isMobile ? '10px' : (isTablet ? '12px' : '16px'),
                overflow: 'hidden',
              }}>

                {/* ── LEFT (or BOTTOM on mobile): editor card ────────────────── */}
                <div style={{
                  flex: 1, minWidth: 0, minHeight: 0,
                  display: 'flex', flexDirection: 'column',
                  background: 'white', borderRadius: '14px',
                  border: '1px solid #e8edf2',
                  boxShadow: '0 4px 20px rgba(15, 23, 42, 0.05)',
                  overflow: 'hidden',
                }}>
                  <NarrativeEditor
                    ref={editorRef}
                    content={editorText}
                    onChange={(html) => setEditorText(html)}
                    placeholder="Start typing your radiology report…"
                    onSave={() => handleSaveReport(false)}
                    style={{ flex: 1, minHeight: 0 }}
                    keywordLibrary={keywordLibrary}
                    pageMargins={protocol ? {
                      top:    protocol.headerMargin ?? 25,
                      right:  protocol.rightMargin  ?? 20,
                      bottom: protocol.bottomMargin ?? 20,
                      left:   protocol.leftMargin   ?? 20,
                    } : undefined}
                    firstPageBanner={activeAppointment ? (
                      <PatientInfoBlock
                        appointmentId={appointmentId}
                        fullAppointment={activeAppointment}
                        savedMetadata={null}
                      />
                    ) : null}
                  />
                </div>

                {/* ── MOBILE: compact action bar (replaces the full sidebar) ──── */}
                {isMobile ? (
                  <div style={{
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'white', borderRadius: '12px',
                    border: '1px solid #e8edf2',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                    padding: '8px 10px',
                  }}>
                    {/* Status dot */}
                    <div title={isOnline ? 'Cloud connected' : 'Offline'} style={{ width: '10px', height: '10px', borderRadius: '50%', background: isOnline ? '#10b981' : '#f59e0b', boxShadow: `0 0 0 3px ${isOnline ? '#10b98125' : '#f59e0b25'}`, flexShrink: 0 }} />

                    {/* Template selector — compact, searchable */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <SearchableTemplatePicker
                        compact
                        templates={templates}
                        value={selectedTemplateId}
                        placeholder="Pick template…"
                        onChange={(tpl) => {
                          const html = tpl.content || tpl.Content || '';
                          setSelectedTemplateId(tpl.id);
                          setEditorText(html);
                          requestAnimationFrame(() => {
                            const handle = editorRef.current;
                            if (handle?.setContent) handle.setContent(html);
                            else if (handle?.editor) { try { handle.editor.commands.setContent(html, false); } catch {} }
                          });
                        }}
                      />
                    </div>

                    {/* Save draft (icon-only) */}
                    <button
                      onClick={() => handleSaveReport(false)}
                      title="Save draft"
                      style={{ flexShrink: 0, padding: '8px 10px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0', color: '#0a1628', fontSize: '14px', cursor: 'pointer' }}
                    >💾</button>

                    {/* Preview (icon-only) */}
                    <button
                      onClick={handlePreviewPrint}
                      title="Preview"
                      style={{ flexShrink: 0, padding: '8px 10px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0', color: '#0a1628', fontSize: '14px', cursor: 'pointer' }}
                    >👁️</button>

                    {/* Finalize */}
                    <button
                      onClick={() => handleSaveReport(true)}
                      style={{ flexShrink: 0, padding: '8px 14px', borderRadius: '8px', background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', border: 'none', color: 'white', fontSize: '11px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' }}
                    >🖊 Sign</button>
                  </div>
                ) : (
                <aside style={{
                  width: isTablet ? '240px' : '280px',
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  overflowY: 'auto',
                  paddingRight: '2px',
                }}>
                  {/* Status card — connection + autosave indicator */}
                  <div style={{
                    background: 'white', borderRadius: '14px',
                    border: '1px solid #e8edf2',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                    padding: '14px 16px',
                  }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '10px' }}>Status</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isOnline ? '#10b981' : '#f59e0b', boxShadow: `0 0 0 3px ${isOnline ? '#10b98125' : '#f59e0b25'}`, animation: 'pulse 1.5s infinite' }} />
                      <span style={{ fontSize: '11px', fontWeight: 800, color: isOnline ? '#15803d' : '#92400e', letterSpacing: '0.3px' }}>
                        {isOnline ? 'Cloud connected' : 'Offline cache active'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
                      {saveStatus === 'SAVING'
                        ? <><span style={{ marginRight: '4px' }}>📡</span>Syncing…</>
                        : saveStatus === 'SUCCESS'
                          ? <><span style={{ marginRight: '4px', color: '#16a34a' }}>✓</span>Saved at {lastSaved}</>
                          : <><span style={{ marginRight: '4px' }}>💤</span>Monitoring for changes</>}
                    </div>
                    {cloudAutosaveDisabledReason && (
                      <div style={{
                        marginTop: '10px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderLeft: '3px solid #dc2626',
                        color: '#7f1d1d',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        fontSize: '10px',
                        fontWeight: 600,
                        lineHeight: 1.5,
                      }}>
                        <div style={{ fontWeight: 900, letterSpacing: '0.5px', marginBottom: '3px' }}>
                          ⚠ Cloud autosave paused
                        </div>
                        <div style={{ fontWeight: 500, color: '#991b1b' }}>
                          {cloudAutosaveDisabledReason}
                        </div>
                        <div style={{ marginTop: '4px', fontWeight: 500, color: '#7f1d1d' }}>
                          Your work is still being saved locally. Return to the worklist and reopen this appointment, or reload to retry.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Template selector card */}
                  <div style={{
                    background: 'white', borderRadius: '14px',
                    border: '1px solid #e8edf2',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                    padding: '14px 16px',
                  }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '10px' }}>Report Template</div>
                    <SearchableTemplatePicker
                      templates={templates}
                      value={selectedTemplateId}
                      placeholder="Select a template…"
                      onChange={(tpl) => {
                        const html = tpl.content || tpl.Content || '';
                        setSelectedTemplateId(tpl.id);
                        setEditorText(html);
                        requestAnimationFrame(() => {
                          const handle = editorRef.current;
                          if (handle?.setContent) handle.setContent(html);
                          else if (handle?.editor) { try { handle.editor.commands.setContent(html, false); } catch {} }
                        });
                      }}
                    />
                    {selectedTemplateId && (
                      <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700, marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>✓</span> Template applied
                      </div>
                    )}
                  </div>

                  {/* Actions card */}
                  <div style={{
                    background: 'white', borderRadius: '14px',
                    border: '1px solid #e8edf2',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                    padding: '14px 16px',
                    display: 'flex', flexDirection: 'column', gap: '8px',
                  }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '4px' }}>Actions</div>

                    <button
                      onClick={() => handleSaveReport(false)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: 'white', border: '1px solid #e2e8f0', color: '#0a1628', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                    >💾 Save draft</button>

                    <button
                      onClick={handlePreviewPrint}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: 'white', border: '1px solid #e2e8f0', color: '#0a1628', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                    >👁️ Preview</button>

                    <button
                      onClick={() => handleSaveReport(true)}
                      style={{
                        marginTop: '4px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        padding: '12px 14px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                        border: 'none', color: 'white',
                        fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                        letterSpacing: '0.3px',
                        boxShadow: '0 6px 16px rgba(22, 163, 74, 0.3)',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(22, 163, 74, 0.4)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(22, 163, 74, 0.3)'; }}
                    >🖊 Finalize &amp; Sign</button>
                  </div>

                  {/* Signature card */}
                  <div style={{
                    background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)',
                    borderRadius: '14px',
                    padding: '14px 16px',
                    color: 'white',
                    position: 'relative', overflow: 'hidden',
                    boxShadow: '0 4px 14px rgba(10, 22, 40, 0.15)',
                  }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #d4a017 50%, transparent)' }} />
                    <div style={{ fontSize: '9px', fontWeight: 800, color: '#d4a017', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '8px' }}>Signature</div>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'white', lineHeight: 1.3, marginBottom: '4px' }}>
                      {protocol?.hospital?.name || 'Authorized Diagnostic Center'}
                    </div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>
                      Digital Medical Record Signature
                    </div>
                  </div>
                </aside>
                )}

              </div>
            )}

            {/* VOICE REPORTING TAB — split: controls (left) + live editor (right) */}
            {activeMainTab === 'VOICE' && (
              <div style={{
                flex: 1, minHeight: 0,
                display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                background: '#f1f5f9', gap: isMobile ? '10px' : '16px',
                padding: isMobile ? '10px' : '16px', overflow: 'hidden',
              }}>
                {/* LEFT: dictation + generate controls */}
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
                  <VoiceReportingPanel
                    appointmentId={appointmentId}
                    templates={templates}
                    selectedTemplateId={selectedTemplateId}
                    isMobile={isMobile}
                    generate={generateVoiceReport}
                    onGenerated={(html) => {
                      // Drop the AI draft straight into the right-hand editor —
                      // no tab switch; the doctor reviews & edits it in place.
                      setEditorText(html || '');
                      const handle = editorRef.current;
                      if (handle?.setContent) handle.setContent(html || '');
                      else if (handle?.editor) { try { handle.editor.commands.setContent(html || '', false); } catch {} }
                    }}
                  />
                </div>

                {/* RIGHT: the generated report in the NarrativeEditor (editable) */}
                <div style={{
                  flex: 1, minWidth: 0, minHeight: 0,
                  display: 'flex', flexDirection: 'column',
                  background: 'white', borderRadius: '14px', border: '1px solid #e8edf2',
                  boxShadow: '0 4px 20px rgba(15,23,42,0.05)', overflow: 'hidden',
                }}>
                  <NarrativeEditor
                    ref={editorRef}
                    content={editorText}
                    onChange={(html) => setEditorText(html)}
                    placeholder="Your generated report will appear here — or start typing…"
                    onSave={() => handleSaveReport(false)}
                    style={{ flex: 1, minHeight: 0 }}
                    keywordLibrary={keywordLibrary}
                    pageMargins={protocol ? {
                      top:    protocol.headerMargin ?? 25,
                      right:  protocol.rightMargin  ?? 20,
                      bottom: protocol.bottomMargin ?? 20,
                      left:   protocol.leftMargin   ?? 20,
                    } : undefined}
                    firstPageBanner={activeAppointment ? (
                      <PatientInfoBlock
                        appointmentId={appointmentId}
                        fullAppointment={activeAppointment}
                        savedMetadata={null}
                      />
                    ) : null}
                  />
                </div>
              </div>
            )}

            {/* TIMELINE TAB */}
            {activeMainTab === 'TIMELINE' && (
              <div style={{ flex: 1, overflowY: 'auto', background: '#f1f5f9', padding: '24px 28px' }}>
                <div style={{ width: '100%', maxWidth: '1100px', margin: '0 auto' }}>
                  <PatientTimeline
                    history={patientHistory}
                    loading={loadingTimeline}
                    activeAppointmentId={appointmentId}
                    onViewDicom={(study) => {
                      // Open the historical study in the full-screen DICOM viewer in a new tab.
                      // The viewer hydrates from /Study/{id}/assets when launched via ?appointmentId=.
                      //
                      // IMPORTANT: do NOT pass `noopener` here. This app keeps the auth token in
                      // sessionStorage, which only propagates to a new tab when the tab is opened
                      // with an opener relationship intact. `noopener` breaks that relationship,
                      // the new tab starts with empty sessionStorage, ProtectedRoute sees a null
                      // currentUser, and the DICOM viewer redirects to /login. Same-origin routes
                      // don't carry a real tab-nabbing risk so dropping noopener is fine.
                      const historicalId = study.appointmentId || study.AppointmentId || study.id || study.Id;
                      if (!historicalId) {
                        showNotif('warning', 'NO_STUDY_ID', 'Could not determine the study to load.');
                        return;
                      }
                      window.open(`/dicom-viewer?appointmentId=${encodeURIComponent(historicalId)}`, '_blank');
                    }}
                  />
                </div>
              </div>
            )}
          </div>
      


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
                        onChange={e => setNewTable({ ...newTable, name: e.target.value })}
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
                              setNewTable({ ...newTable, columns: newCols });
                            }}
                            style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                          />
                          <button
                            className="tool-btn"
                            onClick={() => {
                              const newCols = newTable.columns.filter((_, i) => i !== idx);
                              setNewTable({ ...newTable, columns: newCols });
                            }}
                            style={{ background: '#fecaca', color: '#dc2626' }}
                          >✕</button>
                        </div>
                      ))}
                      <button className="btn btn-outline" style={{ width: '100%', fontSize: '12px' }} onClick={() => setNewTable({ ...newTable, columns: [...newTable.columns, ''] })}>+ Add Column</button>
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

      {/* ── Universal Notification Modal ─────────────────────────── */}
      {notifModal.isOpen && overlayHost && (() => {
        const NOTIF_CFG = {
          success: { gradient: 'linear-gradient(135deg,#dcfce7,#bbf7d0)', iconColor: '#16a34a', border: '#bbf7d0', titleColor: '#15803d', shadow: 'rgba(22,163,74,0.22)',  icon: '✓', btnGrad: 'linear-gradient(135deg,#16a34a,#15803d)', btnShadow: 'rgba(22,163,74,0.4)'  },
          error:   { gradient: 'linear-gradient(135deg,#fee2e2,#fecaca)', iconColor: '#dc2626', border: '#fecaca', titleColor: '#991b1b', shadow: 'rgba(220,38,38,0.22)',  icon: '✕', btnGrad: 'linear-gradient(135deg,#e11d48,#be123c)', btnShadow: 'rgba(225,29,72,0.4)'  },
          warning: { gradient: 'linear-gradient(135deg,#fef3c7,#fde68a)', iconColor: '#d97706', border: '#fde68a', titleColor: '#92400e', shadow: 'rgba(217,119,6,0.22)', icon: '⚠', btnGrad: 'linear-gradient(135deg,#d97706,#b45309)', btnShadow: 'rgba(217,119,6,0.4)' },
          info:    { gradient: 'linear-gradient(135deg,#dbeafe,#bfdbfe)', iconColor: '#0f52ba', border: '#bfdbfe', titleColor: '#1e40af', shadow: 'rgba(15,82,186,0.22)', icon: '↻', btnGrad: 'linear-gradient(135deg,#0f52ba,#1e40af)', btnShadow: 'rgba(15,82,186,0.4)' },
        };
        const cfg = NOTIF_CFG[notifModal.type] || NOTIF_CFG.info;
        return createPortal(
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 100002, background: 'rgba(10,22,40,0.65)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', justifyContent: 'center', alignItems: 'center', animation: 'rpNoticeFade 0.2s ease-out' }}
            onClick={() => setNotifModal(m => ({ ...m, isOpen: false }))}
          >
            <div
              style={{ width: '90%', maxWidth: '460px', background: 'linear-gradient(160deg,#ffffff 0%,#f8fafc 100%)', borderRadius: '28px', border: `1px solid ${cfg.border}`, boxShadow: `0 24px 60px -12px ${cfg.shadow}, 0 0 0 1px rgba(0,0,0,0.04)`, padding: '40px 32px 32px', textAlign: 'center', animation: 'rpNoticePop 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
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
              <p style={{ fontSize: '13px', lineHeight: 1.75, color: '#475569', fontWeight: 500, margin: '0 0 28px', fontFamily: 'system-ui,sans-serif', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{notifModal.message}</p>
              <button
                onClick={() => setNotifModal(m => ({ ...m, isOpen: false }))}
                style={{ width: '100%', padding: '15px', background: cfg.btnGrad, color: 'white', border: 'none', borderRadius: '16px', fontSize: '11px', fontWeight: 950, letterSpacing: '1.5px', cursor: 'pointer', boxShadow: `0 8px 20px -6px ${cfg.btnShadow}`, fontFamily: 'system-ui,sans-serif' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >UNDERSTOOD</button>
            </div>
            <style>{`
              @keyframes rpNoticeFade { from { opacity: 0 } to { opacity: 1 } }
              @keyframes rpNoticePop  { from { transform: scale(0.88) translateY(20px); opacity: 0 } to { transform: scale(1) translateY(0); opacity: 1 } }
            `}</style>
          </div>,
          overlayHost   // ← portal target: fullscreen element if active, else <body>
        );
      })()}

      {/* ── Draft Recovery Modal ─────────────────────────────────── */}
      {draftRecoveryModal.isOpen && overlayHost && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100003, background: 'rgba(10,22,40,0.65)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', justifyContent: 'center', alignItems: 'center', animation: 'rpNoticeFade 0.2s ease-out' }}
          // Backdrop click defaults to "Use server version" — same as Cancel
          // on the old window.confirm, so behaviour is unchanged for users
          // who dismiss without reading.
          onClick={() => resolveDraftRecovery(false)}
        >
          <div
            style={{ width: '90%', maxWidth: '500px', background: 'linear-gradient(160deg,#ffffff 0%,#f8fafc 100%)', borderRadius: '28px', border: '1px solid #fde68a', boxShadow: '0 24px 60px -12px rgba(217,119,6,0.22), 0 0 0 1px rgba(0,0,0,0.04)', padding: '40px 32px 28px', textAlign: 'center', animation: 'rpNoticePop 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: '76px', height: '76px', borderRadius: '50%', background: 'linear-gradient(135deg,#fef3c7,#fde68a)', border: '2px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', fontSize: '34px', boxShadow: '0 12px 28px -8px rgba(217,119,6,0.22)' }}>
              <span style={{ color: '#d97706', fontWeight: 900, lineHeight: 1 }}>⟲</span>
            </div>
            <div style={{ display: 'inline-block', background: 'linear-gradient(135deg,#fef3c7,#fde68a)', border: '1px solid #fde68a', borderRadius: '8px', padding: '3px 12px', marginBottom: '12px' }}>
              <span style={{ fontSize: '9px', fontWeight: 950, letterSpacing: '2px', color: '#92400e', fontFamily: 'system-ui,sans-serif' }}>UNSAVED DRAFT FOUND</span>
            </div>
            <div style={{ fontSize: '15px', fontWeight: 950, letterSpacing: '0.5px', color: '#0f172a', marginBottom: '12px', fontFamily: 'system-ui,sans-serif', lineHeight: 1.3 }}>
              Restore your unsaved work?
            </div>
            <div style={{ width: '40px', height: '3px', background: 'linear-gradient(135deg,#fef3c7,#fde68a)', borderRadius: '99px', margin: '0 auto 16px' }} />
            <p style={{ fontSize: '13px', lineHeight: 1.7, color: '#475569', fontWeight: 500, margin: '0 0 8px', fontFamily: 'system-ui,sans-serif' }}>
              An autosaved draft from <strong style={{ color: '#0f172a' }}>~{draftRecoveryModal.ageMin} min ago</strong> exists on this device and <strong style={{ color: '#0f172a' }}>differs</strong> from the saved copy on the server.
            </p>
            <p style={{ fontSize: '12px', lineHeight: 1.6, color: '#64748b', fontWeight: 500, margin: '0 0 26px', fontFamily: 'system-ui,sans-serif' }}>
              Pick which version to load. The other one will be discarded.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => resolveDraftRecovery(false)}
                style={{ flex: 1, padding: '14px', background: 'white', color: '#475569', border: '1.5px solid #e2e8f0', borderRadius: '14px', fontSize: '11px', fontWeight: 800, letterSpacing: '1px', cursor: 'pointer', fontFamily: 'system-ui,sans-serif' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
              >USE SERVER COPY</button>
              <button
                onClick={() => resolveDraftRecovery(true)}
                autoFocus
                style={{ flex: 1.3, padding: '14px', background: 'linear-gradient(135deg,#d97706,#b45309)', color: 'white', border: 'none', borderRadius: '14px', fontSize: '11px', fontWeight: 950, letterSpacing: '1.5px', cursor: 'pointer', boxShadow: '0 8px 20px -6px rgba(217,119,6,0.4)', fontFamily: 'system-ui,sans-serif' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >RESTORE DRAFT</button>
            </div>
          </div>
        </div>,
        overlayHost
      )}
    </>
  );

};

export default ReportingPage;
