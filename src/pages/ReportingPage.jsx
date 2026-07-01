import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import JSZip from 'jszip';
import AdvancedDicomViewer from '../components/AdvancedDicomViewer';
import NarrativeEditor from '../components/NarrativeEditor';
import apiClient, { BASE_URL } from '../api/apiClient';
import { DicomCache } from '../utils/DicomCache';
import { dicomOptimizer } from '../utils/DicomPerformanceOptimizer';
import { uploadStudyAssetDirect } from '../utils/azureUpload';
import { jwtDecode } from 'jwt-decode';
import useOffline from '../hooks/useOffline';
import useAuth from '../auth/useAuth';
import useReportAutosave, { reportDraftKey } from '../hooks/useReportAutosave';
import useReportAi from '../hooks/useReportAi';
import usePatientTimeline from '../hooks/usePatientTimeline';
import { nativeStorage, nativeWord } from '../hooks/useElectron';
import { openReportInWord } from '../utils/exportWord';
import { docxToFindingsHtml } from '../utils/importWord';
import ReportPreviewModal, { PatientInfoBlock } from '../components/ReportPreviewModal';
import useTickClock from '../utils/useTickClock';
import SearchableTemplatePicker from '../components/SearchableTemplatePicker';
import PatientTimeline from '../components/PatientTimeline';
import VoiceReportingPanel from '../components/VoiceReportingPanel';
import ReportingDicomPanel from '../components/Reporting/ReportingDicomPanel';
import ReportingEditorPanel from '../components/Reporting/ReportingEditorPanel';
import { NotificationModal, DraftRecoveryModal } from '../components/Reporting/ReportingModals';
import { assetsFromManifest } from '../utils/dicomManifest';
import { getReportByAppointmentId } from '../db/repos/reportsRepo';
import { getAppointmentById } from '../db/repos/appointmentsRepo';
import { logEvent } from '../sync/syncTelemetry';
import { getServiceLines } from '../utils/appointmentServices';


const ReportingPage = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { isOnline, addToOutbox } = useOffline();
  const { user: currentUser } = useAuth();
  // 60s tick so the on-premises clock advances while the radiologist is
  // actively reporting — shows the case "ageing" in real time.
  useTickClock();
  const appointmentId = params.id || searchParams.get('id');
  // Cloud PACS-only: report against an ImagingStudy with no appointment.
  const studyId = searchParams.get('studyId');
  // Multi-service rollout (step 6). When the URL has ?serviceId=<guid>
  // the page scopes its load/save to that specific AppointmentService
  // line; different services on the same visit each get their own
  // report. When absent we fall back to the legacy single-report-per-
  // appointment flow so older entry paths (existing bookmarks, direct
  // links from older builds) keep working unchanged.
  const initialServiceIdFromUrl = searchParams.get('serviceId') || null;
  const [activeServiceId, setActiveServiceId] = useState(initialServiceIdFromUrl);
  const [appointmentServices, setAppointmentServices] = useState([]);
  const [editorText, setEditorText] = useState('');
  const [templates, setTemplates] = useState([]);
  const [keywordLibrary, setKeywordLibrary] = useState([]);
  const editorRef = useRef(null);
  // The findings HTML as it currently exists on the SERVER (set when a report
  // is loaded and after each successful save). Stored inside every local draft
  // as `serverBaseline` so the crash-recovery prompt can tell whether the
  // draft holds genuine unsaved local edits (server unchanged since the draft)
  // vs. a stale draft that the server has already moved past. Fixes the bug
  // where the prompt always claimed the local draft was "newer" because the
  // report entity has no server-side UpdatedAt timestamp to compare against.
  // OCC tokens (serverBaseline / rowVersion) + the 409 conflict state now live
  // in the useReportAutosave hook (declared below).

  // Imperative editor-content setter. Lifted from inside the report-fetch
  // effect because the OCC undo handler (and any other top-level callback)
  // also needs to push HTML into the editor — duplicating the body inline
  // would re-grow the same scope-bug it was created from. State alone
  // relies on NarrativeEditor's content-sync useEffect, which is skipped
  // if the editor is focused or its isEmpty heuristic mis-fires; the
  // imperative call inside rAF guarantees the editor catches up.
  const applyEditorContent = useCallback((html) => {
    setEditorText(html || '');
    requestAnimationFrame(() => {
      const handle = editorRef.current;
      if (!handle) return;
      if (handle.setContent) handle.setContent(html || '');
      else if (handle.editor) {
        try { handle.editor.commands.setContent(html || '', false); } catch {}
      }
    });
  }, []);
  // Monotonic token so an in-flight context load can detect it's been superseded
  // by a newer one (appointmentId change / unmount) and skip applying stale data.
  const fetchReqRef = useRef(0);
  const [selectedImg, setSelectedImg] = useState(null);
  const [imgToolbarPos, setImgToolbarPos] = useState({ top: 0, left: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeAssetIndex, setActiveAssetIndex] = useState(0);
  // When the doctor switches services, snap back to the first
  // matching series so the viewer reloads cleanly from the top of
  // that service's filtered set.
  useEffect(() => {
    setActiveAssetIndex(0);
  }, [activeServiceId]);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const [currentSlice, setCurrentSlice] = useState(1);
  const [activeTool, setActiveTool] = useState('WindowLevel');
  const [activeMetadata, setActiveMetadata] = useState(null);
  const [cineEnabled, setCineEnabled] = useState(false);
  const [layoutMode, setLayoutMode] = useState('1x1');
  const [viewportProps, setViewportProps] = useState({ invert: false, flipHorizontal: false, flipVertical: false, rotation: 0 });
  const [resetTrigger, setResetTrigger] = useState(0);
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
  // Default tab. Opening from the study board's "View" passes ?view=dicom so the
  // window lands on the DICOM viewer; otherwise start on Reporting.
  const [activeMainTab, setActiveMainTab] = useState(
    (searchParams.get('view') || '').toLowerCase() === 'dicom' ? 'DICOM' : 'REPORTING'
  ); // 'DICOM', 'REPORTING', 'TIMELINE'
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

  const [activeAppointment, setActiveAppointment] = useState(null);
  // Editable patient header: when the user clicks "Edit" on the locked banner,
  // the patient details are inserted as editable report content and the locked
  // banner is replaced by a slim notice. Persisted per-report (localStorage) so
  // a reload — where the in-content header is already saved in editorText —
  // doesn't show the banner AND the header (a duplicate).
  const [headerEditable, setHeaderEditable] = useState(false);
  useEffect(() => {
    try { setHeaderEditable(localStorage.getItem(`ne:header-editable:${appointmentId}`) === '1'); }
    catch { setHeaderEditable(false); }
  }, [appointmentId]);

  // Active service derived from the URL-/tab-picked id. Drives the
  // DICOM filter so switching services swaps the viewer's series
  // list, the sidebar, and the slice counter — all in lockstep.
  // Must come AFTER both `appointmentServices` and `activeAppointment`
  // declarations (TDZ).
  const activeService = useMemo(() => {
    if (!activeServiceId || !appointmentServices?.length) return null;
    return appointmentServices.find(s => s.id === activeServiceId) || null;
  }, [activeServiceId, appointmentServices]);
  const activeServiceMod = useMemo(() => {
    return String(activeService?.modality || activeAppointment?.modality || '').toUpperCase();
  }, [activeService, activeAppointment]);

  // Per-service filter applied across every DICOM surface (mobile
  // viewer, mobile series strip, desktop sidebar, desktop viewer).
  // Three-tier match — strict FK > modality > first-service pin —
  // so legacy assets without an AppointmentServiceId still attach
  // sensibly.
  const visibleUploadedFiles = useMemo(() => {
    if (!appointmentServices || appointmentServices.length <= 1) return uploadedFiles;
    if (!activeService) return uploadedFiles;
    const isFirstService = appointmentServices[0]?.id === activeService.id;
    return uploadedFiles.filter((f) => {
      const svcId = f?.appointmentServiceId || f?.AppointmentServiceId;
      if (svcId) return svcId === activeService.id;
      const m = String(f?.modality || f?.Modality || '').toUpperCase();
      if (m && activeServiceMod) return m === activeServiceMod;
      // Untagged + unknown-modality → pin to first service only so
      // legacy assets don't double-up across every service tab.
      return isFirstService;
    });
  }, [uploadedFiles, appointmentServices, activeService, activeServiceMod]);
  // Overflow menu for the service picker — opens when there are more
  // services than fit on a single visible row.
  const [serviceOverflowOpen, setServiceOverflowOpen] = useState(false);
  const [impression, setImpression] = useState('');
  const [advice, setAdvice] = useState('');
  const [isFinalized, setIsFinalized] = useState(false);
  // Sign-off state (21 CFR Part 11) loaded from the server report:
  //   reportStatus    → 'Draft' | 'Preliminary' | 'Final' | 'Addended'
  //   reportSignature → { name, credentials, signedAt } | null
  //   reportAddenda   → immutable addendum records to render below the report
  const [reportStatus, setReportStatus] = useState('Draft');
  const [reportSignature, setReportSignature] = useState(null);
  const [reportAddenda, setReportAddenda] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  // Pull the sign-off metadata off a loaded/returned server report into local
  // state (tolerant of camelCase and PascalCase JSON).
  const applyReportMeta = useCallback((r) => {
    const status = r?.status || r?.Status || (r?.isFinalized || r?.IsFinalized ? 'Final' : 'Draft');
    setReportStatus(status);
    setReportAddenda(r?.addenda || r?.Addenda || []);
    const name = r?.signerName || r?.SignerName;
    setReportSignature(name ? {
      name,
      credentials: r?.signerCredentials || r?.SignerCredentials || '',
      signedAt:    r?.signedAt || r?.SignedAt || null,
    } : null);
  }, []);

  // --- PATIENT TIMELINE STATES ---
  const { patientHistory, loadingTimeline, fetchPatientTimeline } = usePatientTimeline();
  const [showTimeline, setShowTimeline] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState('REPORT'); // 'REPORT', 'TIMELINE'
  const [isHistoricalMode, setIsHistoricalMode] = useState(false);
  const [historicalStudyContext, setHistoricalStudyContext] = useState(null);
  const [originalAssets, setOriginalAssets] = useState([]);

  // --- AUTOSAVE SYSTEM ---
  // Friction-#3 calming pass: instead of bouncing between four discrete
  // labels (IDLE / DIRTY / SAVING / SUCCESS) the UI now derives a single
  // calm status line from these three pieces of state.
  //   lastSavedAt → Date | null. Drives "Saved just now" / "Saved Xm ago".
  //   saveStatus  → kept for the orchestration logic in the autosave effect
  //                 (it still needs DIRTY/SAVING/CONFLICT semantics) but
  //                 only the labels are decoupled from the state names.
  //   savingVisible → flips true only if a save lasts >500ms. Sub-500ms
  //                 saves never show "Saving…" at all — eliminates the
  //                 single biggest source of pill-bouncing.
  // saveStatus / lastSavedAt / savingVisible / isCloudSyncing now come from the
  // useReportAutosave hook (declared below).

  const [notifModal, setNotifModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const showNotif = (type, title, message) => setNotifModal({ isOpen: true, type, title, message });

  // ── Report save subsystem (local + cloud autosave, OCC, 409 conflict, manual
  //    save / finalize) — all in one hook. saveNow/undoConflict are aliased to
  //    the old names so the JSX call sites stay unchanged. ──────────────────
  const applyContent = useCallback(({ findings, impression: imp, advice: adv, templateId }) => {
    applyEditorContent(findings || '');
    setImpression(imp || '');
    setAdvice(adv || '');
    if (templateId) setSelectedTemplateId(String(templateId));
  }, [applyEditorContent]);
  const onReportFinalized = useCallback(() => {
    setIsFinalized(true);
    navigate('/doctor-board');
  }, [navigate]);
  const {
    saveStatus,
    lastSavedAt,
    savingVisible,
    cloudAutosaveDisabledReason,
    occConflict,
    saveNow: handleSaveReport,
    undoConflict: handleUndoConflict,
    setBaseline: setReportBaseline,
    finalizeReport,
    addAddendum,
  } = useReportAutosave({
    appointmentId,
    imagingStudyId: studyId,
    activeServiceId,
    selectedTemplateId,
    isFinalized,
    isOnline,
    editorText,
    impression,
    advice,
    editorRef,
    applyContent,
    addToOutbox,
    notify: showNotif,
    logEvent,
    onFinalized: onReportFinalized,
  });

  // Page-level sign-off wrappers passed to the editor. They call the hook
  // (server save-then-sign / addendum) and fold the returned report's sign-off
  // metadata back into local state so the lock banner, signature footer, and
  // addenda list re-render immediately. Returned to the editor's dialogs as a
  // { ok } result so they can show errors and stay open on failure.
  const handleFinalizeReport = useCallback(async (args) => {
    const res = await finalizeReport(args);
    if (res?.ok && res.report) applyReportMeta(res.report);
    return res;
  }, [finalizeReport, applyReportMeta]);

  const handleAddAddendum = useCallback(async (args) => {
    const res = await addAddendum(args);
    if (res?.ok && res.report) applyReportMeta(res.report);
    return res;
  }, [addAddendum, applyReportMeta]);

  // Voice Reporting → AI draft. Sends the dictation transcript + chosen
  // template + appointment context to the backend, which prompts Claude Haiku
  // to produce a structured HTML report. Returns { success, html, error }.
  const generateVoiceReport = useCallback(async ({ transcript, templateId }) => {
    try {
      const res = await apiClient.post('/reporting/voice-generate', {
        appointmentId,
        // PACS-only: study supplies the dictation context when no appointment.
        imagingStudyId: studyId || null,
        // Multi-service rollout — the active service tab decides which
        // service's name + modality the server feeds Claude Haiku as
        // dictation context. Null = single-service / legacy path.
        appointmentServiceId: activeServiceId || null,
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
  }, [appointmentId, studyId]);

  const {
    aiReview, setAiReview,
    handleAiAssist, runRadAiCleanup, acceptAiReview,
  } = useReportAi({ activeService, activeAppointment, appointmentId, editorRef, applyEditorContent, showNotif });

  // Prior-study copy-forward — pull a previous report's findings into the
  // current report with a comparison line. Flattens any .word-page wrappers so
  // the inserted content sits cleanly inside the editor's page model.
  const handleCopyForward = useCallback(async (study) => {
    const priorId = study?.appointmentId || study?.id;
    if (!priorId) return;
    try {
      const res = await apiClient.get(`/reporting/report/${priorId}`);
      const data = res?.data?.data || res?.data || {};
      const findings = data.findings || '';
      const dateStr = study.dateTime ? new Date(study.dateTime).toLocaleDateString() : '';
      const studyName = study.service || study.modality || 'prior study';
      const comparison = `<p><strong>Comparison:</strong> ${studyName}${dateStr ? ` dated ${dateStr}` : ''}.</p>`;
      let flat = '';
      if (findings) {
        const tmp = document.createElement('div');
        tmp.innerHTML = findings;
        tmp.querySelectorAll('.word-page-inner, .word-page').forEach((el) => {
          const p = el.parentNode;
          while (el.firstChild) p.insertBefore(el.firstChild, el);
          el.remove();
        });
        flat = tmp.innerHTML;
      }
      editorRef.current?.insertContent?.(comparison + flat);
      showNotif('success', 'COPIED FORWARD', findings
        ? 'Prior findings inserted with a comparison line. Edit for the current study.'
        : 'Comparison line inserted (the prior report had no findings text).');
    } catch (e) {
      showNotif('error', 'COPY FAILED', e?.response?.data?.error || e?.message || 'Could not load the prior report.');
    }
  }, []);

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




  // --- TIMELINE FETCH (standalone so refresh button can call it) ---


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
    const reqId = ++fetchReqRef.current;               // supersede any older in-flight load
    const isStale = () => reqId !== fetchReqRef.current;
    setLoading(true);
    setError(null);
    console.info(`[1RAD] Initializing Reporting Context for AppID: ${appId}`);

    try {
      // 1. Fetch Core Patient & Case Data first to resolve context.
      //    Online-first, cache-fallback — the Doctor Board that linked here is
      //    itself offline-first (it renders this case straight from the local
      //    cache). So opening the case must NOT hard-fail just because the live
      //    GET hiccups (a transient 5xx, a hospital-claim timing gap, a brief
      //    network drop). Fall back to the cached appointment the board already
      //    showed the doctor, so a case is always openable.
      let appointmentData = null;
      // Right after login the hospital context (auth token + the active local DB)
      // can still be settling, so a VALID appointment briefly 404s ("not found for
      // this hospital yet") and the per-hospital cache isn't populated either —
      // which is why a manual reload used to be needed. Retry the live fetch a few
      // times through that window before falling back, so the case opens on its own.
      for (let attempt = 0; attempt < 3 && !appointmentData; attempt++) {
        try {
          const appRes = await apiClient.get(`/appointments/${appId}`);
          appointmentData = appRes?.data || null;
        } catch (liveErr) {
          const status = liveErr?.response?.status;
          const transient = !status || status === 404 || status >= 500;   // context-settling / network / server
          console.warn(`[REPORTING] Live appointment fetch failed (attempt ${attempt + 1}/3) — ${status || liveErr?.message}`);
          if (!transient || attempt === 2) break;
          await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        }
      }
      if (!appointmentData) {
        try {
          const cached = await getAppointmentById(appId);
          if (cached) {
            appointmentData = cached;
            console.info('[REPORTING] Loaded appointment from offline cache.');
          }
        } catch (cacheErr) {
          console.warn('[REPORTING] Offline appointment cache read failed', cacheErr);
        }
      }

      if (!appointmentData) {
        setError("PATIENT_CONTEXT_NOT_FOUND: The requested appointment record could not be retrieved.");
        setLoading(false);
        return;
      }

      // A newer load (the user switched appointment/service, or navigated away)
      // started while this one was in flight — drop this result so we don't clobber
      // the current context with stale data. Don't clear loading: the newer load owns it.
      if (isStale()) return;

      // The report must always show a DOCTOR as "Referred By". The server
      // resolves referringDoctorName from the referral source (an agent
      // referrer resolves to the doctor they're supported by); fall back to the
      // raw referredBy when it isn't present.
      setActiveAppointment({
        ...appointmentData,
        referredBy: appointmentData.referringDoctorName || appointmentData.referredBy,
      });

      // Multi-service rollout (step 6). Cache the line items so the
      // service-picker strip can render and we can default to the
      // appropriate service when the URL didn't pin one explicitly.
      // getServiceLines also handles v1 cache rows (no services array)
      // by synthesising a single line from the scalars.
      const lines = getServiceLines(appointmentData);
      setAppointmentServices(lines);
      if (!activeServiceId && lines.length > 0 && lines[0].id) {
        // Default to the first unreported service so the doctor lands
        // where the work is. Falls back to the primary line if every
        // service has already been reported.
        const firstUnreported = lines.find(l => !['REPORTED', 'DELIVERED'].includes((l.status || '').toUpperCase()));
        const target = firstUnreported || lines[0];
        if (target?.id) setActiveServiceId(target.id);
      }
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

      // The logged-in user IS the reporting doctor. Auth now lives in
      // localStorage ('1rad_user' / '1rad_token') — it was migrated off
      // sessionStorage, which is why the old session-based fallback returned
      // nothing and the branding protocol (margins/font/letterhead) never loaded.
      if (!doctorId) {
        console.warn("[1RAD] Doctor ID missing in Appointment. Falling back to the signed-in user...");
        try {
          const storedUser = localStorage.getItem('1rad_user') || sessionStorage.getItem('1rad_user');
          if (storedUser) {
            const u = JSON.parse(storedUser);
            doctorId = u?.id || u?.userId || u?.Id || u?.UserId;
            if (doctorId) console.info(`[1RAD] Resolved DoctorID from signed-in user: ${doctorId}`);
          }
        } catch (e) {
          console.error("[1RAD] Stored-user resolution failed:", e);
        }
      }

      if (!doctorId) {
        try {
          const token = localStorage.getItem('1rad_token') || sessionStorage.getItem('1rad_token');
          if (token) {
            const decoded = jwtDecode(token);
            doctorId = decoded.sub || decoded.nameid || decoded.UserId || decoded.id ||
              decoded['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'];
            if (doctorId) console.info(`[1RAD] Resolved DoctorID from Auth Token: ${doctorId}`);
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
        // Templates + keywords are editor conveniences. A failure here must NOT
        // reject the whole load and block the doctor from opening the case —
        // degrade to "none" so the workspace still opens and the report can be
        // written from scratch.
        apiClient.get('/reporting/templates').catch(() => ({ data: { success: false } })),
        apiClient.get('/reporting/keywords').catch(() => ({ data: { success: false } })),
        doctorId ? apiClient.get(`/Prescription/${doctorId}`).catch(() => null) : Promise.resolve(null),
        // Offline-first fallback (Phase B1 Slice 3): if the network fetch
        // fails (offline, 5xx, DNS hiccup) check the local cache before
        // surrendering. The cache row is kept fresh by SyncEngine.pullReports
        // and is keyed by appointmentId.
        apiClient.get(
          activeServiceId
            ? `/Reporting/report/${appId}?serviceId=${encodeURIComponent(activeServiceId)}`
            : `/Reporting/report/${appId}`
        ).catch(async () => {
          try {
            const cached = await getReportByAppointmentId(appId);
            if (cached) {
              console.info('[REPORTING] Network fetch failed — rendering from offline cache.');
              return { data: { success: true, data: { ...cached, isFinalized: !!cached.isFinalized } } };
            }
          } catch (cacheErr) {
            console.warn('[REPORTING] Offline cache read failed', cacheErr);
          }
          return { data: { success: false } };
        }),
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
        // Seed the hook's OCC tokens (serverBaseline + rowVersion) from the
        // loaded report so the next save runs the concurrency check correctly,
        // and draft-recovery can compare lineage via the on-disk serverBaseline.
        setReportBaseline({ findings: findingsHtml, rowVersion: r.rowVersion ?? r.RowVersion ?? null });
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
        applyReportMeta(r);
        if (r.templateId) setSelectedTemplateId(String(r.templateId));

        // ── Crash-recovery prompt ──────────────────────────────────────
        // If a local draft exists AND is newer than the server's version,
        // offer the user a chance to restore it instead of clobbering with
        // the (potentially stale) server copy. Covers crashes, accidental
        // refreshes, and "I forgot to click Save" mistakes.
        let restored = false;
        try {
          const localDraft = await nativeStorage.get(reportDraftKey(appId, activeServiceId));
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
        // FALLBACK: New Case (no saved SERVER report for this appointment/service).
        //
        // FIRST restore any local draft for this appointment+service. When the
        // technician wrote OFFLINE, saved, navigated away and came back, that
        // draft is the ONLY copy of their work — it hasn't synced to the server,
        // and offline the report AND template fetches both fail, so without this
        // the editor opens blank ("the place is empty" — doesn't match the
        // template). The draft-recovery logic above only runs when a server
        // report exists, which it doesn't for a brand-new offline report.
        let restoredDraft = false;
        try {
          const localDraft = await nativeStorage.get(reportDraftKey(appId, activeServiceId));
          if (localDraft && (localDraft.findings || localDraft.impression || localDraft.advice)) {
            console.info('[1RAD] New case — restoring unsynced local draft.');
            applyEditorContent(localDraft.findings || '');
            if (localDraft.impression) setImpression(localDraft.impression);
            if (localDraft.advice) setAdvice(localDraft.advice);
            const draftTpl = localDraft.selectedTemplateId || localDraft.templateId;
            if (draftTpl) setSelectedTemplateId(String(draftTpl));
            restoredDraft = true;
          }
        } catch (draftErr) {
          console.warn('[1RAD] New-case local draft check failed', draftErr);
        }

        // No draft → auto-match a template against the ACTIVE service's name (or
        // fall back to the visit's primary service for legacy single-service
        // visits). This makes the template binding follow whichever service tab
        // the radiologist is on — switching from CT → X-Ray re-binds to the
        // X-Ray template instead of leaving the CT template mismatched.
        if (!restoredDraft) {
          const targetServiceLine = lines.find(l => l.id && l.id === activeServiceId) || lines[0];
          const targetServiceName = targetServiceLine?.serviceName || appointmentData.service;
          console.info(`[1RAD] New Case Detected. Searching for default protocol for service: ${targetServiceName}`);

          if (templRes.data?.success && targetServiceName) {
            const templatesList = templRes.data.data || [];
            const serviceMatch = findTemplateForService(templatesList, targetServiceName);

            if (serviceMatch) {
              const matchId = serviceMatch.id ?? serviceMatch.Id;
              const matchContent = serviceMatch.content ?? serviceMatch.Content ?? '';
              console.info(`[1RAD] Template matched: "${serviceMatch.name ?? serviceMatch.Name}" → ${matchContent.length} chars`);
              setSelectedTemplateId(String(matchId));
              applyEditorContent(matchContent);
            } else {
              console.info(`[1RAD] No matching template for service "${targetServiceName}". Available: ${templatesList.map(t => t.name ?? t.Name).join(', ')}`);
            }
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

      const draft = await nativeStorage.get(reportDraftKey(appId, activeServiceId));
      if (draft) {
        console.info('[1RAD] Reconstituting Workspace from Local Draft');
        applyEditorContent(draft.findings || '');
        setImpression(draft.impression || '');
        setAdvice(draft.advice || '');
        setSelectedTemplateId(draft.selectedTemplateId);
      } else {
        setError("SYSTEM_INITIALIZATION_ERROR: A critical failure occurred while preparing the diagnostic workspace. " + (err.message || "Please check your connection."));
      }
    } finally {
      setLoading(false);
    }
    // Depending on activeServiceId so a service tab switch refetches the
    // scoped report instead of replaying the captured closure value. The
    // appointment+services state is reset above to the current values so
    // this is safe to re-run.
  }, [activeServiceId]);

  // Cloud PACS-only context loader. A study has no appointment / services /
  // timeline — it carries its own demographics and its assets come back on the
  // study-detail payload. Kept separate from fetchReportingContext so the
  // appointment path is entirely unchanged.
  const fetchStudyReportingContext = useCallback(async (sId) => {
    const reqId = ++fetchReqRef.current;
    const isStale = () => reqId !== fetchReqRef.current;
    setLoading(true);
    setError(null);
    try {
      // Resolve the signed-in doctor (the reporter) for branding.
      let doctorId = null;
      try {
        const storedUser = localStorage.getItem('1rad_user') || sessionStorage.getItem('1rad_user');
        if (storedUser) {
          const u = JSON.parse(storedUser);
          doctorId = u?.id || u?.userId || u?.Id || u?.UserId;
        }
      } catch { /* ignore */ }

      const [studyRes, templRes, keyRes, protRes, reportRes] = await Promise.all([
        apiClient.get(`/Study/studies/${sId}`).catch(() => ({ data: { success: false } })),
        apiClient.get('/reporting/templates').catch(() => ({ data: { success: false } })),
        apiClient.get('/reporting/keywords').catch(() => ({ data: { success: false } })),
        doctorId ? apiClient.get(`/Prescription/${doctorId}`).catch(() => null) : Promise.resolve(null),
        apiClient.get(`/reporting/report/by-study/${sId}`).catch(() => ({ data: { success: false } })),
      ]);
      if (isStale()) return;

      const study = (studyRes.data?.success && studyRes.data.data) || null;
      if (!study) {
        setError('STUDY_NOT_FOUND: The requested study could not be retrieved.');
        setLoading(false);
        return;
      }

      // Synthetic "appointment" so the patient header renders off the study's
      // denormalised demographics. No visit, so no services.
      setActiveAppointment({
        patientName: study.patientName,
        patientIdentifier: study.dicomPatientId,
        modality: study.modality,
        service: study.studyDescription || study.modality,
        appointmentDate: study.studyDate,
        isStudyOnly: true,
      });
      setAppointmentServices([]);

      // --- PATIENT TIMELINE FETCH (study path) ---
      // Opening from the study board's "View" must still show the patient's
      // prior studies. The appointment path does this in fetchReportingContext;
      // mirror it here off the study's demographics so the Timeline tab isn't
      // empty. Uses the patient Guid when present (dedicated API), else falls
      // back to a name/identifier search.
      setShowTimeline(true);
      fetchPatientTimeline({
        patientId: study.patientId || study.PatientId || null,
        patientName: study.patientName,
        patientIdentifier: study.dicomPatientId,
        appointmentId: study.appointmentId || study.AppointmentId || null,
      }, study.appointmentId || study.AppointmentId || sId);

      if (templRes.data?.success) {
        setTemplates((templRes.data.data || []).map(t => ({
          id: t.id ?? t.Id, name: t.name ?? t.Name ?? '', modality: t.modality ?? t.Modality ?? '', content: t.content ?? t.Content ?? '',
        })));
      }
      if (keyRes.data?.success) {
        setKeywordLibrary(keyRes.data.data.map(k => ({ ...k, trigger: k.trigger || k.keyword })));
      }
      if (protRes?.data?.success) setProtocol(protRes.data.data);

      const manifestAssets = study.assets || [];
      if (manifestAssets.length > 0) {
        const hyd = assetsFromManifest(manifestAssets);
        setUploadedFiles(hyd);
        setOriginalAssets(hyd);
      }

      // Apply the server report (always set the baseline, even when empty, so
      // the autosave lineage check works), then offer crash-recovery if a newer
      // local draft of unsaved edits survived a refresh.
      const rBody = reportRes.data;
      const r = (rBody?.success && rBody?.data) ? rBody.data : null;
      const serverFindings = r?.findings || '';
      applyEditorContent(serverFindings);
      setReportBaseline({ findings: serverFindings, rowVersion: r?.rowVersion ?? r?.RowVersion ?? null });
      if (r) {
        setImpression(r.impression || '');
        setAdvice(r.advice || '');
        setIsFinalized(!!r.isFinalized);
        applyReportMeta(r);
        if (r.templateId) setSelectedTemplateId(String(r.templateId));
      }
      try {
        // Study mode has no service scope — the draft key matches the autosave
        // hook's ownerKey (`study_<id>`).
        const localDraft = await nativeStorage.get(reportDraftKey(`study_${sId}`, activeServiceId));
        const draftDiffers = localDraft?.findings && localDraft.findings !== serverFindings;
        // Genuine unsaved edits = the draft was based on the server content we
        // just loaded (lineage), or it predates baseline tracking.
        const unsaved = localDraft && (localDraft.serverBaseline === undefined || localDraft.serverBaseline === serverFindings);
        if (draftDiffers && unsaved && !(r?.isFinalized)) {
          const draftTs = new Date(localDraft.timestamp || 0).getTime();
          const ageMin = Math.max(1, Math.round((Date.now() - draftTs) / 60000));
          if (await askDraftRecovery(ageMin)) {
            applyEditorContent(localDraft.findings || '');
            if (localDraft.impression) setImpression(localDraft.impression);
            if (localDraft.advice) setAdvice(localDraft.advice);
            const dtpl = localDraft.templateId || localDraft.selectedTemplateId;
            if (dtpl) setSelectedTemplateId(String(dtpl));
          }
        }
      } catch (recoverErr) {
        console.warn('[REPORTING] Study draft crash-recovery check failed', recoverErr);
      }
    } catch (err) {
      console.error('[REPORTING] Study context init failure', err);
      setError('SYSTEM_INITIALIZATION_ERROR: Could not prepare the study reporting workspace. ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  }, [setReportBaseline, fetchPatientTimeline]);

  useEffect(() => {
    if (studyId) {
      fetchStudyReportingContext(studyId);
    } else if (appointmentId) {
      fetchReportingContext(appointmentId);
    }
    // Invalidate any in-flight load when the appointment/service changes or the
    // page unmounts, so a late-arriving response can't apply stale context.
    return () => { fetchReqRef.current++; };
    // Multi-service rollout: re-fetch when the user switches between
    // service tabs so the editor reloads with that service's report.
  }, [appointmentId, studyId, activeServiceId, fetchReportingContext, fetchStudyReportingContext]);

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
          } catch {
            throw new Error(`CORS_ERROR: Direct access blocked and proxy failed. Contact your administrator to configure CORS on Azure Blob Storage.`);
          }
        } else {
          throw new Error(`NETWORK_ERROR: ${fetchError.message}`);
        }
      }

      // Direct blob access DENIED with a real HTTP status (not a thrown network
      // error). Causes: account public access disabled (409 "Public access is
      // not permitted"), blocked anonymous read (403), OR — crucially — a
      // PRIVATE container while the account allows public access, which Azure
      // reports as an AMBIGUOUS 404 "ResourceNotFound" (it hides existence from
      // anonymous callers). In all of these the browser can't read the blob
      // directly, so we stream it through the backend proxy, which authenticates
      // to storage. If the blob is genuinely gone the proxy fails too and we
      // surface the real error below.
      if (response && !response.ok) {
        console.log(`[DICOM_LOAD] Direct fetch returned ${response.status}; falling back to secure proxy...`);
        setProcessingStatus('Trying secure proxy...');
        try {
          const proxyRes = await apiClient.get('/Study/proxy-asset', {
            params: { url: asset.remoteUrl },
            responseType: 'blob',
            timeout: 120000,
          });
          if (proxyRes.status === 200 && proxyRes.data) {
            blob = proxyRes.data;
            response = null; // route to the blob-decode path below
          }
        } catch (proxyErr) {
          console.warn('[DICOM_LOAD] Proxy fallback failed', proxyErr?.message || proxyErr);
          // fall through to the standard error handling below
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














  // Sync state if user exits via Escape key
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);




  const handlePreviewPrint = () => {
    // Flush any pending editor changes (debounce is 300ms) so the preview shows all pages
    if (editorRef.current?.editor) {
      setEditorText(editorRef.current.editor.getHTML());
    }
    setIsPreviewOpen(true);
  };

  // Launch Microsoft Word with this patient's report (header + findings +
  // impression + advice). Desktop opens Word directly; web downloads a .docx.
  // On desktop we also watch the temp file: when the doctor saves in Word, the
  // findings are pulled back into the editor and saved to the cloud (round-trip).
  const [openingWord, setOpeningWord] = useState(false);
  const wordSyncRef = useRef({ path: null, unsub: null, busy: false });

  // Pull the saved Word bytes back into the editor and persist to cloud.
  const importFromWordBytes = async (base64) => {
    if (wordSyncRef.current.busy) return;
    wordSyncRef.current.busy = true;
    try {
      const findings = await docxToFindingsHtml(base64);
      if (findings && findings.trim()) {
        applyEditorContent(findings);
        // Let the editor commit the new content, then save a draft to cloud.
        setTimeout(() => { try { handleSaveReport(false); } catch (_) {} }, 250);
        showNotif('success', 'IMPORTED FROM WORD', 'Your Word edits were pulled in and saved as a draft.');
      }
    } catch (e) {
      showNotif('error', 'WORD IMPORT FAILED', e?.message || 'Could not read the saved Word document.');
    } finally {
      wordSyncRef.current.busy = false;
    }
  };

  // Stop watching the current temp Word file and drop the listener.
  const teardownWordWatch = () => {
    const s = wordSyncRef.current;
    if (s.unsub) { try { s.unsub(); } catch (_) {} }
    if (s.path) { try { nativeWord.stopWatch(s.path); } catch (_) {} }
    wordSyncRef.current = { path: null, unsub: null, busy: false };
  };

  const handleOpenInWord = async () => {
    try {
      setOpeningWord(true);
      // Pull the freshest findings straight from the editor (the autosave
      // debounce may not have flushed editorText yet).
      const findingsHtml = editorRef.current?.editor?.getHTML?.() ?? editorText;
      const watermark = editorRef.current?.getWatermark?.() || '';
      // Replace any previous watch (e.g. user re-opens Word for the same case).
      teardownWordWatch();
      const res = await openReportInWord({
        appointment: activeAppointment,
        findingsHtml,
        impression,
        advice,
        protocol,
        watch: true,
        watermark,
      });
      if (res?.ok === false) {
        showNotif('error', 'WORD LAUNCH FAILED', res.error || 'Could not open the report in Microsoft Word.');
      } else if (res?.mode === 'BROWSER_DOWNLOAD') {
        showNotif('success', 'REPORT DOWNLOADED', 'A Word document was downloaded. Open it to edit in Microsoft Word.');
      } else {
        // Desktop launch — wire the auto-sync watch for this file.
        if (res?.path) {
          const unsub = nativeWord.onFileChanged((payload) => {
            if (payload?.path === wordSyncRef.current.path && payload?.base64) {
              importFromWordBytes(payload.base64);
            }
          });
          wordSyncRef.current = { path: res.path, unsub, busy: false };
        }
        showNotif('success', 'OPENING IN WORD', 'Editing in Word — save there and your changes sync back here automatically.');
      }
    } catch (err) {
      showNotif('error', 'WORD LAUNCH FAILED', err?.message || 'Could not open the report in Microsoft Word.');
    } finally {
      setOpeningWord(false);
    }
  };

  // Stop watching when leaving the report / unmounting.
  useEffect(() => () => teardownWordWatch(), []);

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

      // Ctrl+Shift+S opens the Sign dialog (password re-auth, 21 CFR Part 11).
      // Signing is no longer a silent "save as final" — it goes through the
      // editor's FinalizeDialog → /reporting/report/finalize.
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        if (!isFinalized) window.dispatchEvent(new CustomEvent('narrative-editor:open-finalize'));
        console.log('[SHORTCUT] Open Sign dialog (Ctrl+Shift+S)');
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

  // Single source of truth for the report editor — rendered in both the default
  // and the generated-report layouts (only the placeholder differs), so its
  // props never drift between the two call sites.
  // Build a CLEAN, editable patient header from the same fields PatientInfoBlock
  // shows (minus its QR/gradient chrome, which doesn't belong in editable text).
  const buildPatientHeaderHtml = () => {
    const a = activeAppointment || {};
    const svc = activeServiceId ? (a.services || []).find(s => s.id === activeServiceId) : null;
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const name       = (a.patientName || '').toUpperCase() || '—';
    const ptid       = a.patientIdentifier || a.ptid || a.id || '—';
    const age        = a.patientAge || a.age || '—';
    const sex        = a.patientGender || a.gender || '—';
    const study      = svc?.serviceName || a.service || a.modality || '—';
    const refByName  = a.referredBy || 'Self';
    const refDegSpec = [a.referrerDegree, a.referrerSpecialty].filter(Boolean).join(', ');
    const date       = new Date().toLocaleDateString();
    return (
      `<p><strong>${esc(name)}</strong></p>` +
      `<p>ID: ${esc(ptid)} &nbsp;·&nbsp; Age/Sex: ${esc(age)}/${esc(sex)} &nbsp;·&nbsp; ` +
      `Study: ${esc(study)} &nbsp;·&nbsp; Ref: ${esc(refByName)}` +
      (refDegSpec ? ` <em style="font-size:0.88em;color:#64748b;">(${esc(refDegSpec)})</em>` : '') +
      ` &nbsp;·&nbsp; Date: ${esc(date)}</p><hr>`
    );
  };


  // Convert the locked banner → editable report content at the top of the doc.
  const convertHeaderToContent = () => {
    const ed = editorRef.current;
    if (ed?.editor) {
      try { ed.editor.chain().focus('start').insertContent(buildPatientHeaderHtml()).run(); } catch { /* editor not ready */ }
    }
    setHeaderEditable(true);
    try { localStorage.setItem(`ne:header-editable:${appointmentId}`, '1'); } catch { /* storage blocked */ }
  };

  // Re-show the locked auto-filled banner. Best-effort: strip the injected
  // editable header (the name paragraph + the "ID: … Age/Sex: … Ref: …" line +
  // its <hr>) from the top of the report so the premium banner can take over
  // again without a duplicate. If the user edited it so heavily that the shape
  // no longer matches, we leave it for them to delete — the banner stays
  // suppressed (via inlineHeaderPresent) while the header is still detected, so
  // there's never a double header either way.
  const restoreLockedHeader = () => {
    const current = editorText || '';
    const stripped = current.replace(
      /^\s*<p[^>]*>\s*<strong>[\s\S]*?<\/strong>\s*<\/p>\s*<p[^>]*>[\s\S]*?ID:[\s\S]*?<\/p>\s*<hr[^>]*>/i,
      '',
    );
    if (stripped !== current) applyEditorContent(stripped);
    setHeaderEditable(false);
    try { localStorage.removeItem(`ne:header-editable:${appointmentId}`); } catch { /* storage blocked */ }
  };

  const renderNarrativeEditor = (placeholder) => {
    // The editable patient header (buildPatientHeaderHtml) is injected into the
    // report CONTENT, while the locked premium banner (PatientInfoBlock) renders
    // as firstPageBanner chrome. They must NEVER show together. The headerEditable
    // flag lives in localStorage keyed by appointmentId — which is null when the
    // page is opened by studyId — so it can desync from the saved content and
    // leave both showing. Defensive fix: also detect the injected header in the
    // content and suppress the banner whenever it's present, regardless of the
    // flag. (Removing the in-content header to return to the locked banner is a
    // deferred follow-up — for now we just keep editing to a single header.)
    const inlineHeaderPresent = /Age\/Sex:[\s\S]{0,80}Ref:/i.test(editorText || '');
    const headerInEditMode = headerEditable || inlineHeaderPresent;
    return (
    <NarrativeEditor
      ref={editorRef}
      content={editorText}
      onChange={(html) => setEditorText(html)}
      placeholder={placeholder}
      editable={!isFinalized}
      onSave={() => handleSaveReport(false)}
      // Ctrl+P opens the report Preview (which owns the correct A4 print path)
      // instead of the browser's native print, which would dump the whole app
      // chrome with broken layout. The editor's shortcut handler calls this and
      // suppresses the native dialog.
      onPrint={handlePreviewPrint}
      // ── Electronic sign-off (21 CFR Part 11) ──
      onFinalize={handleFinalizeReport}
      onAddendum={handleAddAddendum}
      signerName={currentUser?.name || ''}
      signerCredentials={[currentUser?.degree || currentUser?.credentials, currentUser?.specialty].filter(Boolean).join(', ')}
      reportStatus={reportStatus}
      addenda={reportAddenda}
      signature={reportSignature}
      onAiAssist={handleAiAssist}
      onWholeReportAi={runRadAiCleanup}
      aiBusy={aiReview.busy}
      style={{ flex: 1, minHeight: 0 }}
      keywordLibrary={keywordLibrary}
      pageMargins={protocol ? {
        top:    protocol.headerMargin ?? 25,
        right:  protocol.rightMargin  ?? 20,
        bottom: protocol.bottomMargin ?? 20,
        left:   protocol.leftMargin   ?? 20,
      } : undefined}
      bodyFontPt={protocol?.fontSize || 12}
      firstPageBanner={
        !activeAppointment ? null
        : headerInEditMode ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            padding: '6px 12px', fontSize: 11, color: '#475569', background: '#f1f5f9',
            border: '1px dashed #cbd5e1', borderRadius: 8, marginBottom: 8 }}>
            <span>✎ Patient header is editable in the report below.</span>
            <button type="button" onClick={restoreLockedHeader}
              title="Show the locked auto-filled patient banner again"
              style={{ fontSize: 11, fontWeight: 700, color: '#0f52ba', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              🔒 Use locked header
            </button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <PatientInfoBlock
              appointmentId={appointmentId}
              appointmentServiceId={activeServiceId || null}
              fullAppointment={activeAppointment}
              savedMetadata={null}
            />
            <button type="button" onClick={convertHeaderToContent}
              title="Edit the patient header as part of the report text"
              style={{ position: 'absolute', top: 6, right: 8, zIndex: 6, fontSize: 10, fontWeight: 700,
                color: '#0f52ba', background: 'rgba(255,255,255,0.92)', border: '1px solid #cbd5e1',
                borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
              ✎ Edit
            </button>
          </div>
        )
      }
    />
    );
  };

  return (
    <>
    <div className="reporting-app-container" style={{ position: 'relative', overflow: 'hidden' }}>

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

        /* Worklist back button — promoted to a proper standout pill
           so the doctor can find their exit even on a busy header.
           Indigo gradient matches the rest of the brand chrome, with
           a soft shadow and lift on hover. */
        .back-btn {
          background: linear-gradient(135deg, #0f52ba 0%, #1e3a8a 100%);
          border: none;
          color: white;
          cursor: pointer;
          font-weight: 800;
          font-size: 12px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 10px;
          box-shadow: 0 4px 10px -3px rgba(15, 82, 186, 0.45);
          transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
          font-family: inherit;
        }
        .back-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 14px -3px rgba(15, 82, 186, 0.55);
          filter: brightness(1.05);
          color: white;
        }
        .back-btn:active {
          transform: translateY(0);
          box-shadow: 0 2px 6px -2px rgba(15, 82, 186, 0.45);
        }

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
              <div style={{ fontSize: '14px', fontWeight: 900, color: '#1a1a2e', letterSpacing: '-0.2px' }}>
                {activeAppointment?.patientName || 'Loading…'}
              </div>
              <div style={{
                display: 'flex', gap: '8px', marginTop: '2px',
                fontSize: '10px', fontWeight: 700, color: '#64748b',
                alignItems: 'center', flexWrap: 'wrap',
              }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#475569' }}>
                  #{activeAppointment?.patientIdentifier || '—'}
                </span>
                {(activeAppointment?.patientAge != null || activeAppointment?.patientGender) && (
                  <>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>
                      {activeAppointment?.patientAge != null ? `${activeAppointment.patientAge}y` : ''}
                      {activeAppointment?.patientAge != null && activeAppointment?.patientGender ? ' · ' : ''}
                      {activeAppointment?.patientGender || ''}
                    </span>
                  </>
                )}
                {activeAppointment?.displayId && (
                  <>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span style={{ fontFamily: 'monospace' }}>{activeAppointment.displayId}</span>
                  </>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginLeft: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
              {(() => {
                // Multi-service rollout step 6 — service picker.
                // Single-service visits keep a single badge (header
                // looks unchanged). Multi-service visits get a card
                // stack so the radiologist sees every service's
                // modality, full name, status and stage TAT at a
                // glance — same vocabulary the rest of the app uses.
                const lines = appointmentServices && appointmentServices.length > 0
                  ? appointmentServices
                  : [{ id: null, serviceName: activeAppointment?.service || '', modality: activeAppointment?.modality || '', status: 'NOT_STARTED' }];
                if (lines.length <= 1) {
                  return (
                    <span style={{ background: '#0f52ba', color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 950, letterSpacing: '1px' }}>
                      {lines[0]?.modality || activeAppointment?.modality || '...'}
                    </span>
                  );
                }
                // Per-modality chip palette — matches OpsBoard /
                // Technician so the colour code reads the same
                // everywhere. On the Reporting page we keep each tab
                // lean (modality + service name only) so the doctor
                // can scan 5+ services without horizontal sprawl.
                // Status / TAT / notes live on the worklist where
                // the doctor came from — duplicating them here just
                // clutters the picker.
                const modTint = (m) => {
                  const k = String(m || '').toUpperCase();
                  return ({
                    'X-RAY':     { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
                    CT:          { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
                    MRI:         { bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9' },
                    ULTRASOUND:  { bg: '#ecfeff', border: '#a5f3fc', text: '#0e7490' },
                    USG:         { bg: '#ecfeff', border: '#a5f3fc', text: '#0e7490' },
                    MAMMOGRAPHY: { bg: '#fdf2f8', border: '#fbcfe8', text: '#be185d' },
                    MG:          { bg: '#fdf2f8', border: '#fbcfe8', text: '#be185d' },
                    DEXA:        { bg: '#fffbeb', border: '#fde68a', text: '#b45309' },
                    PET:         { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
                  }[k] || { bg: '#f1f5f9', border: '#e2e8f0', text: '#0f52ba' });
                };
                // Visible-tab cap. Keeps the picker on a single row;
                // anything beyond goes into a "+N more ▾" dropdown so
                // a 7-service visit doesn't push the header to two
                // lines. The active service is always pinned visible
                // (it's the one being edited) even if it would
                // otherwise overflow.
                const VISIBLE_CAP = 3;
                const activeIdx = lines.findIndex(l => l.id && l.id === activeServiceId);
                const baseVisible = lines.slice(0, VISIBLE_CAP);
                let visibleLines = baseVisible;
                let overflowLines = lines.slice(VISIBLE_CAP);
                // If the active line is in the overflow group, swap it
                // up to the front of the visible band so it's always
                // on-screen.
                if (activeIdx >= VISIBLE_CAP) {
                  visibleLines = [lines[activeIdx], ...baseVisible.slice(0, VISIBLE_CAP - 1)];
                  overflowLines = lines.filter((_, i) => i !== activeIdx && i >= VISIBLE_CAP - 1);
                  overflowLines = overflowLines.concat(baseVisible.slice(VISIBLE_CAP - 1));
                }

                // Tab renderer — shared between the visible row and
                // the overflow dropdown so styling stays in lockstep.
                // The ACTIVE tab gets a solid indigo gradient (same
                // brand chrome as the Worklist back button) so the
                // doctor never confuses "which service am I editing
                // right now". Inactive tabs stay minimal in white.
                const renderTab = (line, opts = {}) => {
                  const { compact = false } = opts;
                  const isActive  = !!line.id && line.id === activeServiceId;
                  const cancelled = String(line.status || '').toUpperCase() === 'CANCELLED';
                  const tint      = modTint(line.modality);
                  return (
                    <button
                      key={line.id || `${line.modality}-${line.serviceName}`}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      disabled={!line.id || isActive}
                      onClick={() => {
                        if (!line.id || line.id === activeServiceId) return;
                        setActiveServiceId(line.id);
                        setServiceOverflowOpen(false);
                        const next = new URLSearchParams(searchParams);
                        next.set('serviceId', line.id);
                        navigate({ search: next.toString() }, { replace: true });
                      }}
                      title={`${line.modality} · ${line.serviceName}${isActive ? ' (editing)' : ''}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: compact ? '7px 12px' : (isActive ? '6px 11px' : '4px 9px'),
                        borderRadius: '8px',
                        border: isActive ? 'none' : '1px solid #e2e8f0',
                        cursor: (!line.id || isActive) ? 'default' : 'pointer',
                        background: isActive
                          ? 'linear-gradient(135deg, #0f52ba 0%, #1e3a8a 100%)'
                          : 'white',
                        color: isActive ? 'white' : '#0f172a',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s',
                        boxShadow: isActive
                          ? '0 6px 16px -4px rgba(15, 82, 186, 0.55), 0 0 0 2px rgba(15, 82, 186, 0.18)'
                          : 'none',
                        opacity: cancelled ? 0.55 : 1,
                        position: 'relative',
                        width: compact ? '100%' : 'auto',
                        justifyContent: compact ? 'flex-start' : 'center',
                        transform: isActive ? 'translateY(-1px)' : 'translateY(0)',
                      }}
                      onMouseEnter={(e) => { if (!isActive && line.id) e.currentTarget.style.borderColor = '#94a3b8'; }}
                      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = '#e2e8f0'; }}
                    >
                      <span style={{
                        fontSize: '8px', fontWeight: 950, letterSpacing: '0.3px',
                        color: isActive ? 'white' : tint.text,
                        background: isActive ? 'rgba(255, 255, 255, 0.2)' : tint.bg,
                        border: `1px solid ${isActive ? 'rgba(255, 255, 255, 0.35)' : tint.border}`,
                        padding: '2px 6px', borderRadius: '4px',
                        textTransform: 'uppercase', flexShrink: 0,
                      }}>{line.modality || 'OT'}</span>
                      <span style={{
                        fontSize: isActive ? '11px' : '10.5px',
                        fontWeight: isActive ? 950 : 800,
                        color: isActive ? 'white' : '#0f172a',
                        letterSpacing: isActive ? '0.2px' : '0.1px',
                        textDecoration: cancelled ? 'line-through' : 'none',
                        maxWidth: compact ? '260px' : '200px',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{line.serviceName}</span>
                      {isActive && (
                        <span aria-hidden="true" title="Currently editing" style={{
                          fontSize: '7.5px', fontWeight: 950, letterSpacing: '0.6px',
                          color: '#0f52ba', background: 'white',
                          padding: '2px 7px', borderRadius: '999px',
                          textTransform: 'uppercase',
                          flexShrink: 0, marginLeft: '2px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        }}>● Editing</span>
                      )}
                    </button>
                  );
                };

                return (
                  <div
                    role="tablist"
                    aria-label="Services on this visit"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      flexWrap: 'nowrap', position: 'relative',
                    }}
                  >
                    {visibleLines.map(line => renderTab(line))}
                    {overflowLines.length > 0 && (
                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded={serviceOverflowOpen}
                          onClick={() => setServiceOverflowOpen(o => !o)}
                          title={`${overflowLines.length} more services`}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '5px 10px',
                            borderRadius: '8px',
                            border: `1px solid ${serviceOverflowOpen ? '#0f52ba' : '#e2e8f0'}`,
                            background: serviceOverflowOpen ? 'rgba(15, 82, 186, 0.06)' : 'white',
                            color: '#0f52ba',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontSize: '10px', fontWeight: 900, letterSpacing: '0.3px',
                            textTransform: 'uppercase',
                            transition: 'all 0.12s',
                          }}
                        >
                          +{overflowLines.length} more
                          <span aria-hidden="true" style={{
                            display: 'inline-block',
                            transform: serviceOverflowOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.18s',
                            fontSize: '11px', lineHeight: 1,
                          }}>▾</span>
                        </button>
                        {serviceOverflowOpen && (
                          <>
                            {/* Click-outside backdrop — invisible, just
                                catches the click. Stops at the dropdown
                                itself so internal clicks don't dismiss. */}
                            <div
                              onClick={() => setServiceOverflowOpen(false)}
                              style={{
                                position: 'fixed', inset: 0,
                                zIndex: 99,
                                background: 'transparent',
                              }}
                            />
                            <div
                              role="listbox"
                              style={{
                                position: 'absolute',
                                top: 'calc(100% + 6px)',
                                right: 0,
                                minWidth: '260px',
                                maxHeight: '320px',
                                overflowY: 'auto',
                                background: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                boxShadow: '0 14px 36px -10px rgba(15, 23, 42, 0.18)',
                                padding: '6px',
                                display: 'flex', flexDirection: 'column', gap: '4px',
                                zIndex: 100,
                              }}
                            >
                              <div style={{
                                padding: '4px 8px 6px',
                                fontSize: '8.5px', fontWeight: 950, letterSpacing: '0.5px',
                                color: '#94a3b8', textTransform: 'uppercase',
                                borderBottom: '1px solid #f1f5f9', marginBottom: '4px',
                              }}>More services ({overflowLines.length})</div>
                              {overflowLines.map(line => renderTab(line, { compact: true }))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
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
              {/* TAT and referrer chips removed at user request — the
                  Reporting page header is for picking which service
                  to report on, not for status surfacing. Those still
                  live on the Doctor Board worklist where the doctor
                  came from. */}
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
              { id: 'DICOM',     label: 'DICOM Viewer',           icon: '🔍' },
              { id: 'REPORTING', label: 'Reporting',              icon: '📝' },
              // 'AI Voice Reporting (Beta)' tab hidden for now — the
              // VoiceReportingPanel + its VOICE tab content remain in the file,
              // so re-enabling is just restoring this entry.
              { id: 'TIMELINE',  label: 'Patient Timeline',       icon: '🕒' }
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
        {activeMainTab === 'DICOM' && (
          <ReportingDicomPanel
            isMobile={isMobile}
            isTablet={isTablet}
            isSyncEnabled={isSyncEnabled}
            isHistoricalMode={isHistoricalMode}
            activeAppointment={activeAppointment}
            appointmentId={appointmentId}
            activeServiceId={activeServiceId}
            activeServiceMod={activeServiceMod}
            activeAssetIndex={activeAssetIndex}
            setActiveAssetIndex={setActiveAssetIndex}
            activeMetadata={activeMetadata}
            setActiveMetadata={setActiveMetadata}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            cineEnabled={cineEnabled}
            setCineEnabled={setCineEnabled}
            currentSlice={currentSlice}
            setCurrentSlice={setCurrentSlice}
            layoutMode={layoutMode}
            setLayoutMode={setLayoutMode}
            resetTrigger={resetTrigger}
            setResetTrigger={setResetTrigger}
            setShowShortcutsHelp={setShowShortcutsHelp}
            keyImages={keyImages}
            toggleKeyImage={toggleKeyImage}
            loadingProgress={loadingProgress}
            processingStatus={processingStatus}
            historicalStudyContext={historicalStudyContext}
            uploadedFiles={uploadedFiles}
            visibleUploadedFiles={visibleUploadedFiles}
            viewportProps={viewportProps}
            handleFileChange={handleFileChange}
            handleRestoreCurrentStudy={handleRestoreCurrentStudy}
            hydrateZipAsset={hydrateZipAsset}
            navigate={navigate}
            showNotif={showNotif}
            loading={loading}
            onMeasurement={onMeasurement}
          />
        )}

            {/* REPORTING TAB */}
            {activeMainTab === 'REPORTING' && (
              <ReportingEditorPanel
                renderNarrativeEditor={renderNarrativeEditor}
                applyEditorContent={applyEditorContent}
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                setSelectedTemplateId={setSelectedTemplateId}
                protocol={protocol}
                handleOpenInWord={handleOpenInWord}
                handlePreviewPrint={handlePreviewPrint}
                openingWord={openingWord}
                handleSaveReport={handleSaveReport}
                handleUndoConflict={handleUndoConflict}
                saveStatus={saveStatus}
                lastSavedAt={lastSavedAt}
                savingVisible={savingVisible}
                cloudAutosaveDisabledReason={cloudAutosaveDisabledReason}
                occConflict={occConflict}
                isOnline={isOnline}
                aiReview={aiReview}
                setAiReview={setAiReview}
                acceptAiReview={acceptAiReview}
                overlayHost={overlayHost}
                isMobile={isMobile}
                isTablet={isTablet}
              />
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
                      applyEditorContent(html || '');
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
                  {renderNarrativeEditor('Your generated report will appear here — or start typing…')}
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
                    onCopyForward={handleCopyForward}
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
      



        <ReportPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          appointmentId={appointmentId}
          // Multi-service rollout — print preview names the active
          // service tab's line on the patient banner + thank-you line
          // instead of the visit's primary scalar.
          appointmentServiceId={activeServiceId || null}
          doctorId={activeAppointment?.doctorId || activeAppointment?.doctorUserId || activeAppointment?.doctor?.userId || sessionStorage.getItem('1rad_doctor_id')}
          patientData={activeAppointment}
          reportContent={{
            mode: 'Narrative',
            // Use getPrintHTML so Path B's auto-flow boundaries are injected
            // as page-break markers in the served HTML. No-op on Path A
            // (returns editor.getHTML() unchanged).
            text: (editorRef.current?.getPrintHTML?.() ?? editorText),
            data: {},
            impression: impression,
            advice: advice,
            isFinalized: isFinalized
          }}
        />

        {renderShortcutsHelp()}
      </div>

      {/* ── Universal Notification Modal ─────────────────────────── */}
      <NotificationModal
        notifModal={notifModal}
        setNotifModal={setNotifModal}
        overlayHost={overlayHost}
      />

      {/* ── Draft Recovery Modal ─────────────────────────────────── */}
      <DraftRecoveryModal
        draftRecoveryModal={draftRecoveryModal}
        resolveDraftRecovery={resolveDraftRecovery}
        overlayHost={overlayHost}
      />
    </>
  );

};

export default ReportingPage;
