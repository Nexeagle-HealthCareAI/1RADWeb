import { useState, useMemo, useEffect, useCallback, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { AuthContext } from '../auth/AuthContext';
import useOffline from '../hooks/useOffline';
import { nativeStorage } from '../hooks/useElectron';
import { getThermalConfig } from '../utils/thermalPrinter';
import { printThermalToken } from '../utils/thermalPrint';
import AppointmentCard from '../components/AppointmentCard';
import '../styles/global.css';
import '../styles/AppointmentBoard.css';
import ReportPreviewModal from '../components/ReportPreviewModal';
import useTickClock from '../utils/useTickClock';
import { formatElapsed, premisesSeverity, premisesPillStyle } from '../utils/timeTracking';
import { useOverdue } from '../components/OverdueAppointments/OverdueContext';
import { getTrackingUrl } from '../utils/trackingUrl';
import { buildPatientAge, formatPatientAge, parsePatientAge } from '../utils/patientAge';
import { getServiceLines, getUniqueModalities, matchesAnyModality, getReportProgressLabel, getStageElapsedMinutes, formatStageElapsed, getStageSlaBucket } from '../utils/appointmentServices';
import { watchAppointments } from '../db/repos/appointmentsRepo';
import { watchPatients, findDuplicateCandidates } from '../db/repos/patientsRepo';
import { getAllReferrers } from '../db/repos/referrersRepo';
import { snapshotPersonnel, watchPersonnel } from '../db/repos/personnelRepo';
import { snapshotServiceCharges, watchServiceCharges } from '../db/repos/serviceChargesRepo';
import { rankPatientDuplicates, rankReferrerDuplicates } from '../utils/duplicateMatch';
import { syncNow } from '../sync/SyncEngine';

// --- CONSTANTS ---

const MODALITIES = ['ULTRASOUND', 'X-RAY', 'CT', 'MRI', 'DEXA', 'ANGIOGRAPHY', 'MAMMOGRAPHY', 'PET-CT', 'NUCLEAR MEDICINE', 'FLUOROSCOPY'];
// TODAY is now calculated dynamically within the component if needed, 
// but we'll keep a base constant for initial state.
const getTodayString = () => new Date().toLocaleDateString('en-CA');
const TODAY = getTodayString();

// --- CONSTANTS ---

const INFORMATION_SOURCES = [
  'Social Media',
  'Word of Mouth',
  'Newspaper / Ad',
  'Radio / TV',
  'Hospital Website',
  'Specialist Referral',
  'Community Outreach',
  'Other'
];

const STATUS_META = {
  future:      { label: 'FUTURE', color: '#6366f1', bg: '#eef2ff', glow: 'rgba(99,102,241,0.1)', icon: '🕒' },
  scheduled:   { label: 'EXPECTED', color: '#475569', bg: '#f1f5f9', glow: 'rgba(71,85,105,0.1)', icon: '⏳' },
  booked:      { label: 'EXPECTED', color: '#475569', bg: '#f1f5f9', glow: 'rgba(71,85,105,0.1)', icon: '⏳' },
  confirmed:   { label: 'ARRIVED', color: '#059669', bg: '#ecfdf5', glow: 'rgba(5,150,105,0.15)', icon: '✅' },
  in_progress: { label: 'SCANNING', color: '#d97706', bg: '#fffbe6', glow: 'rgba(217,119,6,0.15)', icon: '⚙️' },
  completed:   { label: 'SCANNED', color: '#2563eb', bg: '#eff6ff', glow: 'rgba(37,99,235,0.15)', icon: '✅' },
  scanned:     { label: 'SCANNED', color: '#2563eb', bg: '#eff6ff', glow: 'rgba(37,99,235,0.15)', icon: '✅' },
  reporting:   { label: 'REPORTING', color: '#7c3aed', bg: '#f5f3ff', glow: 'rgba(124,58,237,0.15)', icon: '📝' },
  reported:    { label: 'REPORTED', color: '#10b981', bg: '#ecfdf5', glow: 'rgba(16,185,129,0.15)', icon: '📄' },
  delivered:   { label: 'DELIVERED', color: '#0369a1', bg: '#e0f2fe', glow: 'rgba(3,105,161,0.15)', icon: '📬' },
  cancelled:   { label: 'CANCELLED', color: '#dc2626', bg: '#fef2f2', glow: 'rgba(220,38,38,0.15)', icon: '❌' },
  unknown:     { label: 'UNKNOWN', color: '#64748b', bg: '#f8fafc', glow: 'rgba(100,116,139,0.1)', icon: '❓' }
};

const MODALITY_ICONS = {
  'X-RAY': 'XR', 
  'MRI': 'MR', 
  'CT': 'CT', 
  'ULTRASOUND': 'US', 
  'DEXA': 'DX',
  'ANGIOGRAPHY': 'AG',
  'MAMMOGRAPHY': 'MG',
  'PET-CT': 'PET',
  'NUCLEAR MEDICINE': 'NM',
  'FLUOROSCOPY': 'FL'
};

export default function AppointmentBoard() {
  const navigate = useNavigate();
  const { activeCenterId, activeCenter } = useContext(AuthContext);
  const { isOnline, addToOutbox } = useOffline();
  // 60s tick keeps the on-premises pill counting up; isOverdue comes from the
  // shared OverdueProvider so the row pulse mirrors the bell exactly.
  useTickClock();
  const { isOverdue } = useOverdue();
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 60-second tick drives the per-service TAT pills on the ledger.
  // Whole-minute precision is plenty — cheaper than a 1-second tick
  // re-rendering every card.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Which worklist rows have their service ledger expanded. Collapsed
  // by default so the worklist scans as a tight one-line-per-visit
  // list; click "View N services" to unfurl the full ledger. A Set is
  // O(1) toggle + cheap to JSON-serialise if we ever want to persist
  // (not doing that today — collapse is the safer default per visit).
  const [expandedLedgers, setExpandedLedgers] = useState(() => new Set());
  const toggleLedger = (apptId) => {
    setExpandedLedgers(prev => {
      const next = new Set(prev);
      if (next.has(apptId)) next.delete(apptId); else next.add(apptId);
      return next;
    });
  };

  const [activeTab, setActiveTab] = useState('TODAY'); // 'TODAY' or 'PAST'
  const [pastDateRange, setPastDateRange] = useState({ 
    start: TODAY, 
    end: TODAY 
  });
  const [archiveFilterMode, setArchiveFilterMode] = useState('ALL'); // 'ALL' or 'RANGE'
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [ownerDetails, setOwnerDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [drawerSearchQuery, setDrawerSearchQuery] = useState('');
  const [filters, setFilters] = useState({ date: TODAY, status: 'ALL', modality: 'ALL', doctor: 'ALL', notArrived: false });
  const [expandedRow, setExpandedRow] = useState(null);


  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [isEditingOpen, setIsEditingOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  // Multi-service edit state. The drawer's draft inputs (service /
  // modality / amount / referralCutValue) on editingAppointment model
  // the "in-progress" line; editServices is the list of lines already
  // committed via "Add another service". On save we combine the two
  // and POST as `services` to the v2 update endpoint. Each entry may
  // carry an `id` (existing AppointmentService row — server keeps it in
  // place) or no id (newly added — server inserts).
  const [editServices, setEditServices] = useState([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewAppointment, setPreviewAppointment] = useState(null);
  // Multi-service rollout — which AppointmentService.Id the open
  // ReportPreviewModal is currently scoped to. Null = "primary line"
  // / legacy single-service path; the modal falls back to the
  // appointment's scalar Service/Modality for the header & thank-you
  // line in that case.
  const [previewServiceId, setPreviewServiceId] = useState(null);
  const [previewReport, setPreviewReport] = useState({ mode: 'Narrative Editor', text: '', impression: '', isFinalized: false });
  // Worklist row expansion — only ONE row can be expanded at a time so
  // a busy worklist doesn't accordion out of control. Set to the
  // appointmentId of the open row, or null when nothing is expanded.
  // Single-service visits don't render the chevron at all.
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const [cancelConfirmModal, setCancelConfirmModal] = useState({ isOpen: false, appointmentId: null, patientName: '' });
  // Scenario 04 — cancelling a PAID appointment needs admin sign-off; this modal
  // captures the reason and submits a CANCEL_APPOINTMENT request to Approvals.
  const [cancelApprovalModal, setCancelApprovalModal] = useState({ isOpen: false, appointmentId: null, patientName: '', reason: '', submitting: false });

  const submitCancelApproval = async () => {
    const { appointmentId, patientName, reason } = cancelApprovalModal;
    if (!reason.trim() || !appointmentId) return;
    setCancelApprovalModal(m => ({ ...m, submitting: true }));
    try {
      await apiClient.post('/approvals', {
        type: 'CANCEL_APPOINTMENT',
        title: `${patientName || 'Patient'} — cancel paid appointment`,
        appointmentId,
        payload: '{}',
        reason: reason.trim(),
      });
      setCancelApprovalModal({ isOpen: false, appointmentId: null, patientName: '', reason: '', submitting: false });
      setErrorModal({
        isOpen: true,
        title: '✅ Sent for approval',
        message: 'An admin will review this cancellation in Finance → Approvals. The appointment stays active until then.'
      });
    } catch (e) {
      setCancelApprovalModal(m => ({ ...m, submitting: false }));
      setErrorModal({
        isOpen: true,
        title: 'Could not send request',
        message: e.response?.data?.error || e.response?.data?.message || 'Please try again.'
      });
    }
  };

  // Scenario 05 — correct the "Referred By". Applies immediately when nothing is
  // paid; once payment exists the backend reports requiresApproval and we switch
  // this modal to its reason-capture phase and submit a CHANGE_REFERRER request.
  const [changeRefModal, setChangeRefModal] = useState({ isOpen: false, appointmentId: null, patientName: '', currentReferrer: '', newName: '', newContact: '', isDoctor: true, phase: 'edit', reason: '', submitting: false });

  const submitChangeReferrer = async () => {
    const m = changeRefModal;
    if (!m.newName.trim() || !m.appointmentId) return;
    setChangeRefModal(s => ({ ...s, submitting: true }));
    try {
      const res = await apiClient.post(`/appointments/${m.appointmentId}/change-referrer`, {
        newReferrerName: m.newName.trim(),
        newReferrerContact: m.newContact.trim() || null,
        newReferrerIsDoctor: m.isDoctor,
      });
      if (res.data?.requiresApproval) {
        setChangeRefModal(s => ({ ...s, phase: 'approval', submitting: false }));
        return;
      }
      setChangeRefModal({ isOpen: false, appointmentId: null, patientName: '', currentReferrer: '', newName: '', newContact: '', isDoctor: true, phase: 'edit', reason: '', submitting: false });
      refreshAppointments();
      showNotif('success', 'REFERRER UPDATED', 'The referral commission now credits the corrected referrer.');
    } catch (e) {
      setChangeRefModal(s => ({ ...s, submitting: false }));
      showNotif('error', 'UPDATE FAILED', e.response?.data?.message || e.response?.data?.error || 'Could not change the referrer. Please try again.');
    }
  };

  const submitChangeReferrerApproval = async () => {
    const m = changeRefModal;
    if (!m.reason.trim() || !m.appointmentId) return;
    setChangeRefModal(s => ({ ...s, submitting: true }));
    try {
      await apiClient.post('/approvals', {
        type: 'CHANGE_REFERRER',
        title: `${m.patientName || 'Patient'} — referrer → ${m.newName.trim()}`,
        appointmentId: m.appointmentId,
        payload: JSON.stringify({
          newReferrerName: m.newName.trim(),
          newReferrerContact: m.newContact.trim() || null,
          newReferrerIsDoctor: m.isDoctor,
        }),
        reason: m.reason.trim(),
      });
      setChangeRefModal({ isOpen: false, appointmentId: null, patientName: '', currentReferrer: '', newName: '', newContact: '', isDoctor: true, phase: 'edit', reason: '', submitting: false });
      setErrorModal({ isOpen: true, title: '✅ Sent for approval', message: 'An admin will review this referrer change in Finance → Approvals.' });
    } catch (e) {
      setChangeRefModal(s => ({ ...s, submitting: false }));
      showNotif('error', 'COULD NOT SEND', e.response?.data?.message || e.response?.data?.error || 'Please try again.');
    }
  };

  const [notifModal, setNotifModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const showNotif = (type, title, message) => setNotifModal({ isOpen: true, type, title, message });
  const [tokenPrintData, setTokenPrintData] = useState(null);
  // Resolved tokenized URL for the printable QR — fetched whenever a token
  // slip is opened so the patient's QR scan reaches the public endpoint with
  // a signature instead of an anonymous Guid (which would be rejected).
  const [tokenPrintQrUrl, setTokenPrintQrUrl] = useState('');
  useEffect(() => {
    let cancelled = false;
    if (!tokenPrintData) { setTokenPrintQrUrl(''); return; }
    const id = tokenPrintData.appointmentId || tokenPrintData.id;
    if (!id) { setTokenPrintQrUrl(''); return; }
    // Render the tokenless URL straight away so the QR has something to
    // show during the brief fetch. Swap in the signed URL once it arrives.
    setTokenPrintQrUrl(`${window.location.origin}/track/${id}`);
    getTrackingUrl(id).then(url => {
      if (!cancelled && url) setTokenPrintQrUrl(url);
    });
    return () => { cancelled = true; };
  }, [tokenPrintData]);
  const [printDropdownId, setPrintDropdownId] = useState(null);

  const [bookingStep, setBookingStep] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const listTopRef = useRef(null);
  const [newBooking, setNewBooking] = useState({
    patientId: '',
    service: '',
    modality: 'ULTRASOUND',
    date: getTodayString(),
    doctor: '',
    notes: '',
    amount: '',
    referralCutValue: 0,
    priority: 'ROUTINE', // STAT / URGENT / ROUTINE — drives worklist sort
    // Multi-service support (step 3). The single-service inputs above
    // model the "in progress" draft line; addedServices is the list
    // already committed via the "Add to visit" button. On submit we
    // combine the two so a visit can carry multiple scans (X-ray + CT
    // + USG together). Each entry: { serviceName, modality, amount,
    // referralCutValue }.
    addedServices: [],
  });

  const [newPatient, setNewPatient] = useState({
    name: '', mobile: '', age: '', ageUnit: 'Y', gender: 'Female',
    village: '', district: '', address: '', sourceOfInfo: '', referrerId: null,
    // Inline referral-source capture for a brand-new (free-typed) referrer.
    referrerContact: '', referrerAddress: ''
  });
  const [duplicatePatient, setDuplicatePatient] = useState(null);
  // Live duplicate detection (fuzzy name + exact phone) over the offline cache.
  const [patientDuplicates, setPatientDuplicates] = useState([]);
  const [dupDismissed, setDupDismissed] = useState(false);
  const [referrerSuggestions, setReferrerSuggestions] = useState([]);

  const [referrers, setReferrers] = useState([]);
  const [viewAppointment, setViewAppointment] = useState(null);
  const [isAddingReferrer, setIsAddingReferrer] = useState(false);
  const [newReferrer, setNewReferrer] = useState({ name: '', contact: '', address: '' });
  const [referrerSearchValue, setReferrerSearchValue] = useState('');
  const [serviceRegistry, setServiceRegistry] = useState([]);
  const [showBookingValidation, setShowBookingValidation] = useState(false);
  const drawerBodyRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = () => setPrintDropdownId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (drawerBodyRef.current) {
      drawerBodyRef.current.scrollTop = 0;
    }
  }, [bookingStep, isBookingOpen]);

  // On step 2 (Clinical Configuration), default the Lead Specialist to the
  // first available doctor if none is chosen yet — covers the case where the
  // doctor list finishes loading after the user has advanced.
  useEffect(() => {
    if (bookingStep === 2 && doctors.length > 0) {
      setNewBooking(prev => (prev.doctor ? prev : { ...prev, doctor: doctors[0] }));
    }
  }, [bookingStep, doctors]);

  // --- API SYNC ---
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    const params = {
      search: searchQuery,
      status: filters.status,
    };

    if (activeTab === 'TODAY') {
      params.date = getTodayString();
    } else if (activeTab === 'FUTURE') {
      params.isArchive = true;
      params.startDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    } else {
      params.isArchive = true;
      if (archiveFilterMode === 'RANGE') {
        params.startDate = pastDateRange.start;
        params.endDate = pastDateRange.end;
      }
    }

    const cacheKey = `1rad_cache_appointments_${activeTab}_${activeCenterId}`;

    try {
      const response = await apiClient.get('/appointments', { params });
      let mappedData = response.data.map(a => {
        const appDate = a.date || (a.dateTime ? a.dateTime.split('T')[0] : null);
        const isFuture = appDate && appDate > getTodayString();
        const currentStatus = a.status ? a.status.toLowerCase() : 'scheduled';
        return {
          ...a,
          id: a.displayId,
          appointmentId: a.appointmentId,
          ptid: a.patientIdentifier,
          status: isFuture ? 'future' : (currentStatus === 'future' ? 'scheduled' : currentStatus)
        };
      });

      // Sort ASCENDING for correct sequential Token Number calculation
      const chronologicalData = mappedData.sort((a, b) => {
        const timeA = new Date(a.dateTime || 0).getTime();
        const timeB = new Date(b.dateTime || 0).getTime();
        return timeA - timeB;
      });
      
      const itemsWithTokens = chronologicalData.map(item => ({
        ...item,
        // Token is assigned by the server on ARRIVAL — surface it as-is and
        // leave it blank (dash in the UI) until the patient arrives. No more
        // fabricated sequential numbers for not-yet-arrived patients.
        tokenNo: item.dailyTokenNumber ?? null
      }));
      
      // Worklist order: STAT → URGENT → ROUTINE, then token DESC. Priority
      // is still the dominant key so a STAT walk-in surfaces above all
      // routine tokens regardless of when it was booked; inside each
      // priority bucket the LATEST tokens float to the top so the front
      // desk sees newly-booked patients first when refreshing the board.
      // (Time DESC as a tiebreaker for the rare same-token collision.)
      const PRIORITY_RANK = { STAT: 0, URGENT: 1, ROUTINE: 2 };
      const finalSortedData = itemsWithTokens.sort((a, b) => {
        const pa = PRIORITY_RANK[a.priority] ?? 2;
        const pb = PRIORITY_RANK[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;

        const tokenA = a.tokenNo || 0;
        const tokenB = b.tokenNo || 0;
        if (tokenA !== tokenB) return tokenB - tokenA;

        const timeA = new Date(a.dateTime || 0).getTime();
        const timeB = new Date(b.dateTime || 0).getTime();
        return timeB - timeA;
      });

      setAppointments(finalSortedData);
      await nativeStorage.set(cacheKey, finalSortedData);
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
      const cached = await nativeStorage.get(cacheKey);
      if (cached) {
        setAppointments(cached);
      }
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filters.status, activeTab, pastDateRange, activeCenterId]);

  // Patient search now goes through the offline-first cache. The actual
  // network pull is the SyncEngine's job; this function only exists to
  // trigger an immediate delta-pull (e.g. right after creating a new
  // patient) so the freshly-created row turns up in the drawer search
  // without waiting for the next 30s tick. Reactive list rendering is
  // handled by the liveQuery effect below.
  const fetchPatients = useCallback(async () => {
    try { await syncNow(); } catch (_err) { /* engine already logs */ }
  }, []);

  const fetchReferrers = useCallback(async (query) => {
    try {
      const response = await apiClient.get('/referrers', {
        params: { search: query }
      });
      setReferrers(response.data);
    } catch (error) {
      console.error('Failed to fetch referrers:', error);
    }
  }, []);

  // Personnel processing — runs against either the live API response or
  // the cached snapshot from the offline fallback. Extracted so both
  // paths render the SAME owner details + specialist list (a bug in this
  // helper would have shown up twice otherwise).
  const applyPersonnel = useCallback((allPersonnel) => {
    if (!Array.isArray(allPersonnel)) return;

    let owner = allPersonnel.find(u => {
      const roles = (u.roles || u.Roles || []).map(r => String(r).toLowerCase());
      return roles.includes('admindoctor');
    });
    if (!owner) {
      owner = allPersonnel.find(u => {
        const roles = (u.roles || u.Roles || []).map(r => String(r).toLowerCase());
        return roles.includes('admin');
      });
    }
    if (owner) {
      setOwnerDetails({
        name: owner.fullName || owner.FullName || 'Owner',
        contact: owner.mobile || owner.Mobile || owner.phoneNumber || owner.PhoneNumber || '+91 XXXXXXXXXX',
        email: owner.email || owner.Email || 'contact@1rad.health'
      });
    }

    // A "specialist" is ONLY someone with a genuine doctor/radiologist role.
    // The old logic used "anyone NOT in [admin, technician, receptionist,
    // accountant]" — which wrongly swept every CUSTOM ROLE into the doctor
    // list, so custom-role users showed up as selectable specialists and got
    // assigned to appointments as the doctor. A positive match fixes that:
    // custom roles (and any non-clinical role) are no longer treated as doctors.
    const isDoctorRole = (r) => {
      const lower = String(r).toLowerCase().replace(/\s+/g, '');
      return lower.includes('doctor') || lower.includes('radiolog');
    };
    let specialists = allPersonnel.filter(p => {
      const rawRoles = p.roles || p.Roles || [];
      return rawRoles.some(isDoctorRole);
    }).map(p => p.fullName || p.FullName || 'UNKNOWN_STAFF');

    // Safety net: only if the centre has NO doctor-roled user at all do we fall
    // back to listing everyone, so the booking flow can still assign someone.
    if (specialists.length === 0) {
      specialists = allPersonnel.map(p => p.fullName || p.FullName || 'UNKNOWN_STAFF');
    }

    setDoctors(specialists);
  }, []);

  // Reactive reference data. The doctor dropdown and the service-price list
  // render straight from the local cache; the sync engine refreshes those
  // snapshots every cycle, so a newly-added doctor or an edited price appears
  // here on its own — no page reload, no manual refresh — whether the change
  // was made on this device or another one.
  useEffect(() => {
    const subDoctors = watchPersonnel().subscribe({
      next: (rows) => { if (Array.isArray(rows) && rows.length) applyPersonnel(rows); },
      error: (err) => console.warn('[AppointmentBoard] personnel liveQuery error', err),
    });
    const subPrices = watchServiceCharges().subscribe({
      next: (rows) => setServiceRegistry(Array.isArray(rows) ? rows : []),
      error: (err) => console.warn('[AppointmentBoard] service-charges liveQuery error', err),
    });
    return () => { subDoctors.unsubscribe(); subPrices.unsubscribe(); };
  }, [applyPersonnel, activeCenterId]);

  // Personnel is a small slow-changing list — no delta sync engine pull.
  // Snapshot the response on success; fall back to the snapshot on failure.
  // The cache survives reload and powers the booking drawer's specialist
  // dropdown during a brief outage so the booking flow never stalls on
  // "who is this patient referred to".
  // Warm the cache from the server. Rendering is driven by the watchPersonnel
  // subscription below — this just refreshes the snapshot the watch reads, so
  // there's a single rendering path and a price/doctor change made anywhere
  // flows in automatically. On failure we keep the last good snapshot.
  const fetchDoctors = useCallback(async () => {
    try {
      const response = await apiClient.get('/personnel');
      await snapshotPersonnel(response.data);
    } catch (error) {
      console.warn('Failed to refresh personnel — keeping offline snapshot.', error);
    }
  }, []);

  const fetchServiceRegistry = useCallback(async () => {
    try {
      const response = await apiClient.get('/finance/registry');
      await snapshotServiceCharges(response.data);
    } catch (error) {
      console.error('Failed to refresh service registry — keeping offline snapshot.', error);
    }
  }, []);

  // Drives post-mutation refresh. Every tab now reads from the local
  // Dexie cache via liveQuery (TODAY, FUTURE, and PAST all served by the
  // same cached table — the sync engine pulls every delta without a date
  // filter, so all three windows are present locally). A successful
  // mutation just nudges the SyncEngine to pull the delta; the UI
  // re-renders when the new row lands in local storage.
  const refreshAppointments = useCallback(() => {
    syncNow();
  }, []);

  // TODAY tab: subscribe to the offline cache via liveQuery. The SyncEngine
  // writes deltas in the background (booted in AuthContext), this just
  // re-renders every time the local rows change. PAST / FUTURE tabs keep
  // the old server-fetch + 30s poll path because they're not cached locally
  // in B1.
  useEffect(() => {
    fetchServiceRegistry();

    // Build the liveQuery argument shape for whichever tab is active.
    // The sync engine pulls every appointment delta the user has access
    // to (no date filter), so PAST and FUTURE are served from the same
    // cached table that TODAY uses — the mode just controls the slice.
    let watchArgs;
    if (activeTab === 'TODAY') {
      watchArgs = { mode: 'today', dateIso: filters.date, status: filters.status };
    } else if (activeTab === 'FUTURE') {
      watchArgs = { mode: 'future', status: filters.status };
    } else { // PAST (the legacy archive tab)
      const range = (archiveFilterMode === 'RANGE')
        ? { startIso: pastDateRange.start, endIso: pastDateRange.end }
        : {};
      watchArgs = { mode: 'past', ...range, status: filters.status };
    }

    setLoading(true);
    let firstEmission = true;
    const today = getTodayString();
    const sub = watchAppointments(watchArgs).subscribe({
      next: (rows) => {
        // Adapt repo rows to the shape the rest of this component already
        // expects: alias displayId → id, patientIdentifier → ptid, and apply
        // the "future booking" status normalisation the old fetch path did
        // post-response.
        const adapted = rows.map((a) => {
          const appDate = a.dateTime ? a.dateTime.split('T')[0] : null;
          const isFuture = appDate && appDate > today;
          const current = a.status ? a.status.toLowerCase() : 'scheduled';
          return {
            ...a,
            id: a.displayId,
            appointmentId: a.appointmentId,
            ptid: a.patientIdentifier,
            status: isFuture ? 'future' : (current === 'future' ? 'scheduled' : current),
          };
        });
        setAppointments(adapted);
        if (firstEmission) { firstEmission = false; setLoading(false); }
      },
      error: (err) => {
        console.warn('[AppointmentBoard] liveQuery error', err);
        setLoading(false);
      },
    });

    // Kick an immediate pull so the local cache reflects the freshest server
    // state right after mount or a tab/date/status switch. The engine's own
    // 30s interval covers the steady-state case. Online-only; harmless when
    // offline (sync engine just no-ops).
    syncNow();

    return () => sub.unsubscribe();
  }, [
    fetchServiceRegistry, activeCenterId,
    activeTab,
    filters.date, filters.status,
    archiveFilterMode, pastDateRange.start, pastDateRange.end,
  ]);

  // Patient drawer search — subscribes to the local cache. Below 3 chars we
  // intentionally render an empty list (the legacy behaviour), so the
  // drawer doesn't dump every cached patient on a single-letter typo.
  useEffect(() => {
    if (drawerSearchQuery.length <= 2) {
      setPatients([]);
      return undefined;
    }
    const sub = watchPatients({ query: drawerSearchQuery, limit: 50 }).subscribe({
      next: (rows) => setPatients(rows),
      error: (err) => console.warn('[AppointmentBoard] patient liveQuery error', err),
    });
    return () => sub.unsubscribe();
  }, [drawerSearchQuery]);

  // ── Live PATIENT duplicate detection ──────────────────────────────────────
  // As the operator types the name/mobile for a NEW registration, fuzzy-match
  // against the offline cache and surface probable duplicates. Debounced so we
  // don't hit Dexie on every keystroke. Skipped once a patient is selected.
  useEffect(() => {
    if (newBooking.patientId) { setPatientDuplicates([]); return undefined; }
    const name = (newPatient.name || '').trim();
    if (name.length < 3) { setPatientDuplicates([]); return undefined; }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const candidates = await findDuplicateCandidates({ name, mobile: newPatient.mobile, limit: 60 });
        const ranked = rankPatientDuplicates(
          { name, mobile: newPatient.mobile, age: newPatient.age, gender: newPatient.gender },
          candidates,
        );
        if (!cancelled) setPatientDuplicates(ranked);
      } catch (err) {
        if (!cancelled) setPatientDuplicates([]);
        console.warn('[DEDUPE] patient candidate scan failed', err?.message || err);
      }
    }, 280);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [newPatient.name, newPatient.mobile, newPatient.age, newPatient.gender, newBooking.patientId]);

  // Reset the "not a duplicate" dismissal whenever the name changes materially,
  // so a fresh name re-arms detection.
  useEffect(() => { setDupDismissed(false); }, [newPatient.name]);

  // ── Live REFERRER "did you mean" ──────────────────────────────────────────
  // Fuzzy-match the typed referral source against all cached referrers so a
  // near-duplicate ("Dr Sharma" vs "Dr. Sharmaa") is caught before a second
  // partner record is created. Skipped once an existing referrer is selected.
  useEffect(() => {
    if (newPatient.referrerId) { setReferrerSuggestions([]); return undefined; }
    const name = (newPatient.referredBy || '').trim();
    if (name.length < 3) { setReferrerSuggestions([]); return undefined; }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const all = await getAllReferrers();
        const ranked = rankReferrerDuplicates(name, all);
        // Drop an exact (already-typed) name — only suggest genuine variants.
        if (!cancelled) setReferrerSuggestions(ranked.filter(s => (s.referrer.name || '').toLowerCase() !== name.toLowerCase()));
      } catch (err) {
        if (!cancelled) setReferrerSuggestions([]);
      }
    }, 280);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [newPatient.referredBy, newPatient.referrerId]);

  const fetchRegistry = useCallback(async () => {
    try {
      const res = await apiClient.get('/finance/registry');
      await snapshotServiceCharges(res.data);
    } catch (err) {
      console.error('[FINANCE] Registry refresh failed — keeping offline snapshot.', err);
    }
  }, []);

  useEffect(() => {
    fetchReferrers('');
    fetchDoctors();
    fetchRegistry();
  }, [fetchReferrers, fetchDoctors, fetchRegistry, activeCenterId]);


  // --- DERIVED ---
  const appointmentsForTab = useMemo(() => {
    return appointments.filter(app => {
      const appDate = app.dateTime ? app.dateTime.split('T')[0] : app.date;
      const currentToday = getTodayString();
      
      if (activeTab === 'TODAY') {
        return appDate === currentToday;
      } else if (activeTab === 'FUTURE') {
        return !appDate || appDate > currentToday;
      } else {
        if (appDate >= currentToday && activeTab === 'PAST') return false;
        if (archiveFilterMode === 'RANGE') {
          return appDate && appDate >= pastDateRange.start && appDate <= pastDateRange.end;
        }
        return true;
      }
    });
  }, [appointments, activeTab, pastDateRange, archiveFilterMode]);

  const filteredAppointments = useMemo(() => {
    return appointmentsForTab.filter(app => {
      // Search now also matches the referred person and the service/test name(s)
      // across every service line on the visit (Scenario 08).
      const q = searchQuery.trim().toLowerCase();
      const serviceText = [app.service, app.modality, ...((app.services || []).map(s => s.serviceName || s.service || s.modality))]
        .filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !q ||
                            (app.patientName?.toLowerCase() || '').includes(q) ||
                            (app.mobile || '').includes(searchQuery) ||
                            (app.id || '').includes(searchQuery) ||
                            (app.referredBy?.toLowerCase() || '').includes(q) ||
                            serviceText.includes(q);
      const matchesStatus = filters.status === 'ALL' || app.status === filters.status;
      // Multi-service rollout: filter picks up a visit whose ANY service
      // line matches the chosen modality. matchesAnyModality also
      // tolerates v1 rows that don't carry a services[] array yet.
      const matchesModality = matchesAnyModality(app, filters.modality);
      const matchesDoctor = filters.doctor === 'ALL' || app.doctor === filters.doctor;
      // "Not arrived" quick filter — show only patients who are booked but
      // haven't been marked arrived yet, so the front desk can find and check
      // them in fast. Un-arrived = still in a pre-arrival status.
      const isNotArrived = ['', 'scheduled', 'booked', 'future'].includes((app.status || '').toLowerCase());
      const matchesArrival = !filters.notArrived || isNotArrived;
      return matchesSearch && matchesStatus && matchesModality && matchesDoctor && matchesArrival;
    });
  }, [appointmentsForTab, searchQuery, filters]);

  // Derived validation
  const isMobileValid = /^\d{10}$/.test(newPatient.mobile);
  // Mobile is OPTIONAL now — only block if a number was entered but isn't a
  // full 10 digits. Name + age remain required.
  const isNewPatientIncomplete = !newBooking.patientId &&
    (!newPatient.name.trim() || !newPatient.age.trim() || (newPatient.mobile.length > 0 && !isMobileValid));
  // Referrer mobile (inline new-referrer capture) — optional, 10-digit if present.
  const isReferrerContactValid = !newPatient.referrerContact || /^\d{10}$/.test(newPatient.referrerContact);
  // When the referral is an "Other person" (agent), the supporting doctor is
  // mandatory — it becomes the report's "Referred By". Block the step until it's
  // filled. (Only applies once a referral name has been entered.)
  const isSupportedDoctorMissing =
    !!newPatient.referredBy?.trim() &&
    newPatient.referrerIsDoctor === false &&
    !String(newPatient.referrerSupportedByDoctor || '').trim();

  // Most-used services per modality, derived from this centre's recent
  // appointments. Powers the quick-pick suggestion chips in step 2 so the
  // operator can tap the common studies instead of typing every time.
  const mostUsedByModality = useMemo(() => {
    const counts = {}; // MODALITY -> { serviceName -> count }
    for (const app of appointments || []) {
      const lines = getServiceLines(app);
      const entries = (lines && lines.length)
        ? lines
        : [{ serviceName: app?.service, modality: app?.modality }];
      for (const ln of entries) {
        const mod  = String(ln?.modality || app?.modality || '').toUpperCase();
        const name = (ln?.serviceName || '').trim();
        if (!mod || !name) continue;
        counts[mod] = counts[mod] || {};
        counts[mod][name] = (counts[mod][name] || 0) + 1;
      }
    }
    const result = {};
    for (const mod of Object.keys(counts)) {
      // Top 3 most-USED services for this modality, ranked by how many times
      // they've actually been booked (highest count first).
      result[mod] = Object.entries(counts[mod])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);
    }
    return result;
  }, [appointments]);

  // Top 3 most-frequent referring persons (by how many appointments name them),
  // for one-tap quick-add under the Referred By field.
  const topReferrers = useMemo(() => {
    const counts = {};
    for (const app of appointments || []) {
      const name = (app?.referredBy || '').trim();
      if (!name) continue;
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
  }, [appointments]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filters, activeTab, archiveFilterMode, pastDateRange]);

  const isInitialMount = useRef(true);
  // Auto-scroll on page change

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    if (listTopRef.current) {
      listTopRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const itemsPerPage = 5;
  const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);
  const paginatedAppointments = filteredAppointments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const stats = {
    total: appointmentsForTab.length,
    expected: appointmentsForTab.filter(a => ['scheduled', 'booked'].includes(a.status?.toLowerCase())).length,
    noShow: appointmentsForTab.filter(a => ['no_show', 'noshow'].includes(a.status?.toLowerCase())).length,
    arrived: appointmentsForTab.filter(a => a.status?.toLowerCase() === 'confirmed').length,
    scanning: appointmentsForTab.filter(a => a.status?.toLowerCase() === 'in_progress').length,
    scanned: appointmentsForTab.filter(a => ['scanned', 'completed'].includes(a.status?.toLowerCase())).length,
    reporting: appointmentsForTab.filter(a => a.status?.toLowerCase() === 'reporting').length,
    finalized: appointmentsForTab.filter(a => a.status?.toLowerCase() === 'reported').length,
    delivered: appointmentsForTab.filter(a => a.status?.toLowerCase() === 'delivered').length,
    cancelled: appointmentsForTab.filter(a => a.status?.toLowerCase() === 'cancelled').length,
  };
  const activeCount = stats.total - stats.cancelled;
  const activeRate = stats.total > 0 ? Math.round((activeCount / stats.total) * 100) : 0;
  const completionRate = activeCount > 0 ? Math.round(((stats.finalized + stats.delivered) / activeCount) * 100) : 0;

  // --- HANDLERS ---
  const handleAction = async (id, actionOrStatus) => {
    const app = appointments.find(a => a.id === id || a.appointmentId === id);
    if (!app) return;

    let newStatus = '';
    if (actionOrStatus === 'CONFIRM') newStatus = 'confirmed';
    else if (actionOrStatus === 'START') newStatus = 'in_progress';
    else if (actionOrStatus === 'COMPLETE') newStatus = 'completed';
    else if (actionOrStatus === 'CANCEL') newStatus = 'cancelled';
    else if (actionOrStatus === 'DELIVER') newStatus = 'delivered';
    else if (actionOrStatus === 'REPORTING') {
      navigate(`/reporting/${app.appointmentId}`);
      return;
    }
    else newStatus = actionOrStatus.toLowerCase(); // Direct status update

    // Cache original status to enable rollback if the API request is rejected by the server
    const originalStatus = app.status;

    // Optimistic UI Update
    setAppointments(prev => prev.map(a => (a.id === id || a.appointmentId === id) ? { ...a, status: newStatus } : a));

    if (!isOnline) {
      await addToOutbox('APPOINTMENT_STATUS', { id: app.appointmentId, status: newStatus });
      return;
    }

    try {
      const response = await apiClient.patch(`/appointments/${app.appointmentId}/status`, `"${newStatus}"`, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = response.data;
      if (result && result.notAllowed) {
        // Rollback the optimistic UI state since it was not allowed by the business rule
        setAppointments(prev => prev.map(a => (a.id === id || a.appointmentId === id) ? { ...a, status: originalStatus } : a));

        if (result.requiresApproval) {
          // Scenario 04 — a PAID appointment isn't a dead end: capture a reason
          // and route it to the admin Approvals queue instead of just locking.
          setCancelApprovalModal({ isOpen: true, appointmentId: app.appointmentId, patientName: app.patientName || '', reason: '', submitting: false });
        } else {
          setErrorModal({
            isOpen: true,
            title: "🔒 Cancellation Locked",
            message: result.message || "Cannot cancel appointment at this time."
          });
        }
      } else {
        refreshAppointments();
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      
      // Rollback the optimistic UI state immediately to restore dashboard consistency
      setAppointments(prev => prev.map(a => (a.id === id || a.appointmentId === id) ? { ...a, status: originalStatus } : a));

      if (error.response) {
        const serverMessage = error.response.data?.error || error.response.data?.message || error.response.data;
        setErrorModal({
          isOpen: true,
          title: "Validation Failure",
          message: serverMessage || "Could not update status."
        });
      } else {
        await addToOutbox('APPOINTMENT_STATUS', { id: app.appointmentId, status: newStatus });
      }
    }
  };

  const getNextAction = (status) => {
    switch (status) {
      case 'scheduled':   
      case 'booked':      
        return { action: 'CONFIRM', label: 'ARRIVED', color: '#10b981', icon: '✅' };
      case 'reported':    
        return { action: 'DELIVER', label: 'DELIVER', color: '#0369a1', icon: '📬' };
      default: 
        return null;
    }
  };

  const handleAddPatient = async (e) => {
    e.preventDefault();
    const payload = {
      fullName: newPatient.name,
      mobile: newPatient.mobile,
      age: buildPatientAge(newPatient.age, newPatient.ageUnit),
      gender: newPatient.gender,
      village: newPatient.village,
      district: newPatient.district,
      address: newPatient.address,
      sourceOfInfo: newPatient.sourceOfInfo
    };

    // Stable key shared by the online create and the outbox fallback so a
    // lost-response retry can't register the patient twice.
    const idemKey = crypto.randomUUID();

    if (!isOnline) {
      const tempId = `temp-${Date.now()}`;
      await addToOutbox('PATIENT_CREATE', { ...payload, tempId }, idemKey);
      showNotif('info', 'QUEUED FOR SYNC', 'Patient profile has been saved and will synchronize automatically when connection is restored.');
      setNewBooking(prev => ({ ...prev, patientId: tempId }));
      setIsAddPatientOpen(false);
      return;
    }

    try {
      const response = await apiClient.post('/patients', payload, { headers: { 'Idempotency-Key': idemKey } });
      const patientId = response.data.patientId;
      setIsAddPatientOpen(false);
      setNewPatient({ name: '', mobile: '', age: '', ageUnit: 'Y', gender: 'Female', village: '', district: '', address: '', referredBy: '', sourceOfInfo: '', referrerId: null, referrerContact: '', referrerAddress: '' });
      setNewBooking(prev => ({ ...prev, patientId }));
      fetchPatients('');
    } catch (error) {
      console.error('Failed to add patient:', error);
      if (!error.response) {
         const tempId = `temp-${Date.now()}`;
         await addToOutbox('PATIENT_CREATE', { ...payload, tempId }, idemKey);
         setNewBooking(prev => ({ ...prev, patientId: tempId }));
         setIsAddPatientOpen(false);
      }
    }
  };

  const handleBookAppointment = async () => {
    // 1. Validate Patient Identity
    if (!newBooking.patientId) {
      showNotif('error', 'PATIENT REQUIRED', 'No patient has been selected. Please select or add a patient in Phase 1 before proceeding.');
      setBookingStep(1);
      return;
    }

    // 2. Validate Service/Procedure — either the draft line is filled OR
    //    the user has already added at least one service via "Add to visit".
    const hasDraftService = !!(newBooking.service && newBooking.service.trim());
    const hasAddedService = (newBooking.addedServices || []).length > 0;
    if (!hasDraftService && !hasAddedService) {
      showNotif('error', 'SERVICE REQUIRED', 'Add at least one service. This field is mandatory for billing and reporting.');
      return;
    }

    // 3. Validate Specialist
    if (!newBooking.doctor) {
      showNotif('error', 'SPECIALIST REQUIRED', 'No Lead Specialist assigned. Every appointment requires a supervising physician.');
      return;
    }
    // Referred By is mandatory on every booking — the referral source drives
    // commission and reporting. For a walk-in, the "🏥 Self / walk-in" button
    // fills this with "Self", so the field is never legitimately blank.
    if (!String(newPatient.referredBy || '').trim()) {
      showNotif('error', 'REFERRED BY REQUIRED', 'Please enter who referred this patient. Use the “Self / walk-in” button if there is no referrer.');
      return;
    }
    // When the referral is NOT a doctor, the supporting doctor name is required.
    if (newPatient.referredBy?.trim() && newPatient.referrerIsDoctor === false && !String(newPatient.referrerSupportedByDoctor || '').trim()) {
      showNotif('error', 'DOCTOR NAME REQUIRED', 'Please enter the supporting doctor name for this referral.');
      return;
    }
    // Defense-in-depth: the Lead Specialist must be a real doctor on the centre's
    // roster — never a custom-role/non-clinical user. `doctors` is already filtered
    // to genuine doctor roles, so anything outside it is rejected (catches stale
    // selections or hand-edited values).
    if (doctors.length > 0 && !doctors.includes(newBooking.doctor)) {
      showNotif('error', 'INVALID SPECIALIST', 'The Lead Specialist must be a registered doctor. Please pick a doctor from the list.');
      return;
    }

    // 4. Validate Date (Safety Check)
    if (!newBooking.date) {
      showNotif('error', 'DATE REQUIRED', 'Appointment date is undefined. Please select a valid appointment date.');
      return;
    }

    const now = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    const timePart = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const localDateTimeStr = `${newBooking.date}T${timePart}`;

    // Build the full service-line list. addedServices are everything the
    // user has already committed via "Add to visit"; the draft inputs
    // (newBooking.service / .modality / .amount / .referralCutValue) are
    // appended as the final line so they don't get lost if the user hit
    // submit without clicking "Add" first. We then de-dup defensively in
    // case the user double-clicked.
    const draftHasService = !!String(newBooking.service || '').trim();
    const serviceLines = [
      ...(newBooking.addedServices || []),
      ...(draftHasService ? [{
        serviceName:      String(newBooking.service || '').trim(),
        modality:         String(newBooking.modality || '').trim().toUpperCase(),
        amount:           Number(newBooking.amount) || 0,
        referralCutValue: Number(newBooking.referralCutValue) || 0,
      }] : []),
    ].filter(s => s.serviceName);

    const primary = serviceLines[0] || {
      serviceName: '', modality: '', amount: 0, referralCutValue: 0,
    };

    // ── DUPLICATE-APPOINTMENT PRE-CHECK (instant + works offline) ──────
    // Mirrors the server rule so a duplicate is caught before the API call:
    // same patient identity (name + age + gender) + same service line on the
    // same date, non-cancelled. Reads the locally-cached worklist.
    {
      const bookDate = (localDateTimeStr || '').split('T')[0];
      const normTxt = (s) => String(s ?? '').trim().toLowerCase();
      const ageDigits = (s) => { const m = String(s ?? '').match(/\d+/); return m ? m[0] : ''; };
      const newName = normTxt(newPatient.name);
      const newAge = ageDigits(newPatient.age);
      const newGender = normTxt(newPatient.gender);
      const newServiceSet = new Set(serviceLines.map(l => `${normTxt(l.modality)}|${normTxt(l.serviceName)}`));

      const dup = (newName && bookDate) ? (appointments || []).find(a => {
        if (String(a.status || '').toLowerCase() === 'cancelled') return false;
        if ((a.dateTime ? a.dateTime.split('T')[0] : '') !== bookDate) return false;
        if (normTxt(a.patientName) !== newName) return false;
        if (ageDigits(a.patientAge) !== newAge) return false;
        if (normTxt(a.patientGender) !== newGender) return false;
        return getServiceLines(a).some(l => newServiceSet.has(`${normTxt(l.modality)}|${normTxt(l.serviceName)}`));
      }) : null;

      if (dup) {
        const t = dup.dateTime ? new Date(dup.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const tok = dup.tokenNo || dup.dailyTokenNumber;
        const pid = dup.patientIdentifier || dup.ptid;
        const ref = dup.displayId || dup.id;
        showNotif('warning', 'DUPLICATE APPOINTMENT',
          `This patient already has an appointment ${t ? `at ${t} ` : ''}today for the same service.` +
          `${tok ? ` Token No: ${tok}.` : ''}${pid ? ` Patient ID: ${pid}.` : ''}${ref ? ` Reference: ${ref}.` : ''}` +
          ` Please verify before booking again.`);
        return;
      }
    }

    const payload = {
      patientId: newBooking.patientId,
      // Scalar fields kept for backward compat with v1 servers (older
      // API builds without step 2) and the offline outbox replay path.
      // The server's CreateAppointmentCommand prefers `services` when
      // present and falls back to these scalars otherwise.
      service:  primary.serviceName,
      modality: primary.modality,
      amount:   primary.amount,
      referralCutValue: primary.referralCutValue,
      // Multi-service shape — what new servers will use.
      services: serviceLines,
      dateTime: localDateTimeStr,
      type: 'scheduled',
      doctor: newBooking.doctor,
      referredBy: newPatient.referredBy || '',
      referredContact: newPatient.referrerContact || referrers.find(r => r.name === newPatient.referredBy)?.contact || '',
      referredAddress: newPatient.referrerAddress || referrers.find(r => r.name === newPatient.referredBy)?.address || '',
      // Referral source (payee-first). The referrer IS the payee; the type
      // decides which extra fields apply.
      referrerIsDoctor: newPatient.referrerIsDoctor !== false,
      referrerSupportedByDoctor: newPatient.referrerIsDoctor === false ? (newPatient.referrerSupportedByDoctor || '') : '',
      referrerSupportedSpecialty: newPatient.referrerIsDoctor === false ? (newPatient.referrerSupportedSpecialty || '') : '',
      referrerSupportedDegree: newPatient.referrerIsDoctor === false ? (newPatient.referrerSupportedDegree || '') : '',
      referrerEmail: newPatient.referrerIsDoctor !== false ? (newPatient.referrerEmail || '') : '',
      referrerSpecialty: newPatient.referrerIsDoctor !== false ? (newPatient.referrerSpecialty || '') : '',
      referrerDegree: newPatient.referrerIsDoctor !== false ? (newPatient.referrerDegree || '') : '',
      notes: newBooking.notes,
      priority: newBooking.priority || 'ROUTINE',
    };


    // One stable key for this booking: sent on the online attempt AND reused
    // by the outbox fallback, so a "created server-side but response lost →
    // re-queued" retry is deduped by the backend instead of double-booking.
    const idemKey = crypto.randomUUID();

    if (!isOnline) {
      await addToOutbox('APPOINTMENT_CREATE', payload, idemKey);
      showNotif('info', 'QUEUED FOR SYNC', 'Appointment has been saved and will sync automatically when your connection is restored.');
      setIsBookingOpen(false);
      resetBooking();
      return;
    }

    try {
      await apiClient.post('/appointments', payload, { headers: { 'Idempotency-Key': idemKey } });

      setIsBookingOpen(false);
      resetBooking();
      refreshAppointments();
    } catch (error) {

      console.error('Failed to book appointment:', error);
      if (!error.response) {
        await addToOutbox('APPOINTMENT_CREATE', payload, idemKey);
        setIsBookingOpen(false);
        resetBooking();
      } else {
        // Surface the backend's reason — notably the duplicate-appointment
        // guard (409), which tells the front desk when/where the existing
        // appointment is so they can verify instead of double-booking.
        const detail = error?.response?.data?.message
          || error?.response?.data?.error
          || (typeof error?.response?.data === 'string' ? error.response.data : null);
        const isDuplicate = error?.response?.status === 409;
        showNotif(
          isDuplicate ? 'warning' : 'error',
          isDuplicate ? 'DUPLICATE APPOINTMENT' : 'BOOKING FAILED',
          detail || 'Appointment could not be created. Please check your connection and try again.'
        );
      }
    }
  };

  const resetBooking = () => {
    setBookingStep(1);
    setNewBooking({
      patientId: '',
      service: '',
      modality: 'ULTRASOUND',
      addedServices: [],
      date: getTodayString(),
      doctor: doctors && doctors.length > 0 ? doctors[0] : '',
      notes: '',
      amount: '',
      referralCutValue: 0,
      // Reset to ROUTINE every time the form is opened — STAT must be a
      // conscious choice for the booker, never a sticky carry-over.
      priority: 'ROUTINE',
    });

    // Reset age unit to Years on every fresh booking — M / D must be a
    // conscious choice each time, never a sticky carry-over from a previous
    // booking (e.g. a baby's appointment leaving M selected for the next
    // adult patient by accident).
    setNewPatient({ name: '', mobile: '', age: '', ageUnit: 'Y', gender: 'Female', village: '', district: '', address: '', referredBy: '', sourceOfInfo: '', referrerId: null, referrerContact: '', referrerAddress: '' });
    setReferrerSearchValue('');
    setDrawerSearchQuery('');
    setShowBookingValidation(false);
  };

  // Print the queue-token slip. On the desktop app with a thermal printer
  // configured (Billing → Control), it prints SILENTLY as ESC/POS (big token
  // number + QR). Otherwise — or if the printer errors — it opens the existing
  // token modal so a slip can still be printed via the dialog.
  const handlePrintToken = async (app) => {
    const cfg = getThermalConfig();
    if (cfg && (cfg.interface || cfg.transport)) {
      const solo = (getServiceLines(app)?.[0]) || {};
      // QR only when we have a real web origin (skip on desktop file://).
      let qr = null;
      try {
        if (typeof window !== 'undefined' && /^https?:/.test(window.location.origin)) {
          qr = await getTrackingUrl(app.appointmentId || app.id);
        }
      } catch (_) {}
      const r = await printThermalToken({
        clinic: {
          name: activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTICS',
          address: activeCenter?.address || '',
        },
        token: app.tokenNo ?? app.dailyTokenNumber ?? app.id,
        patientName: app.patientName || '',
        patientId: app.patientIdentifier || app.ptid || app.patientId || '',
        datetime: app.dateTime
          ? new Date(app.dateTime).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
          : '',
        service: solo.serviceName || app.service || '',
        modality: solo.modality || app.modality || '',
        qr,
        footer: ['PLEASE KEEP THIS TOKEN', 'THANK YOU'],
      });
      if (r?.ok) return; // printed silently — no modal needed
    }
    // Fallback: open the token modal (HTML slip / print dialog).
    setTokenPrintData(app);
  };

  // Open the print preview for a visit. When `serviceId` is supplied,
  // the GET fetches the service-scoped report (different services on a
  // multi-service visit have separate DiagnosticReport rows post-step-6)
  // and the ReportPreviewModal renders the patient banner + thank-you
  // line with THAT service's name + modality.
  const handlePreviewPrint = async (c, serviceId = null) => {
    try {
      setLoading(true);
      setPreviewAppointment(c);
      setPreviewServiceId(serviceId || null);

      const apptId = c.id || c.appointmentId;
      const url = serviceId
        ? `/Reporting/report/${apptId}?serviceId=${encodeURIComponent(serviceId)}`
        : `/Reporting/report/${apptId}`;

      const reportRes = await apiClient.get(url).catch(() => null);
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
      console.error('[APPOINTMENT] Preview preparation failed', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditAppointment = async () => {
    if (!editingAppointment) return;

    const draftHasService = !!String(editingAppointment.service || '').trim();
    const hasAddedService = (editServices || []).length > 0;

    if (!draftHasService && !hasAddedService) {
      showNotif('warning', 'SERVICE REQUIRED', 'At least one service is required. This is mandatory before saving.');
      return;
    }
    if (!editingAppointment.doctor) {
      showNotif('warning', 'SPECIALIST REQUIRED', 'No Lead Specialist assigned. Cannot save without a supervising physician.');
      return;
    }
    // Mobile is OPTIONAL on edit — keep whatever the user typed (trimmed) and
    // never block the save on it.
    const editMobile = String(editingAppointment.mobile || '').trim();
    if (!String(editingAppointment.patientGender || '').trim()) {
      showNotif('warning', 'GENDER REQUIRED', 'Please select the patient\'s gender.');
      return;
    }
    // When the referral is NOT a doctor, the supporting doctor name is required.
    if (editingAppointment.referredBy?.trim() && editingAppointment.referrerIsDoctor === false && !String(editingAppointment.referrerSupportedByDoctor || '').trim()) {
      showNotif('warning', 'DOCTOR NAME REQUIRED', 'Please enter the supporting doctor name for this referral.');
      return;
    }

    // Build the full services[] list.
    //
    // The primary line (the inputs at the top of the drawer) carries the
    // original AppointmentService.Id we stashed on open as
    // `_primaryServiceId` — sending it back tells the server's
    // reconciler to update that row in place (preserving its status,
    // TAT timestamps, attached report / study / commission rows)
    // instead of soft-deleting and recreating it.
    //
    // The remaining lines are whatever the user committed via "Add
    // another service". Existing rows carry their `id`; new rows have
    // `id: null`. Any pre-existing line the user removed in the UI is
    // simply absent here — the reconciler soft-deletes anything not
    // present in the incoming array.
    const serviceLines = [
      ...(draftHasService ? [{
        id:               editingAppointment._primaryServiceId || null,
        serviceName:      String(editingAppointment.service || '').trim(),
        modality:         String(editingAppointment.modality || '').trim().toUpperCase(),
        amount:           Number(editingAppointment.amount) || 0,
        referralCutValue: Number(editingAppointment.referralCutValue) || 0,
      }] : []),
      ...(editServices || []).map(l => ({
        id:               l.id || null,
        serviceName:      l.serviceName,
        modality:         (l.modality || '').toUpperCase(),
        amount:           Number(l.amount) || 0,
        referralCutValue: Number(l.referralCutValue) || 0,
      })),
    ].filter(s => s.serviceName);

    const primary = serviceLines[0] || {
      serviceName: '', modality: '', amount: 0, referralCutValue: 0,
    };

    try {
      await apiClient.put(`/appointments/${editingAppointment.appointmentId}`, {
        appointmentId: editingAppointment.appointmentId,
        patientId: editingAppointment.patientId,
        // Scalar fields kept for v1-server backward compat (mirror the
        // first line). The server prefers `services` when present.
        service:  primary.serviceName,
        modality: primary.modality,
        amount:   primary.amount,
        referralCutValue: primary.referralCutValue,
        // Multi-service shape — what new servers reconcile against.
        services: serviceLines,
        dateTime: editingAppointment.dateTime,
        doctor: editingAppointment.doctor,
        notes: editingAppointment.notes,
        referredBy: editingAppointment.referredBy || '',
        // Contact applies to both a doctor and an agent payee.
        referredContact: editingAppointment.referrerContact || '',
        // Referral source (payee-first). Send the type only when known so an
        // untouched referral keeps its existing type on the server.
        referrerIsDoctor: editingAppointment.referrerIsDoctor === undefined ? null : editingAppointment.referrerIsDoctor,
        referrerSupportedByDoctor: editingAppointment.referrerIsDoctor === false ? (editingAppointment.referrerSupportedByDoctor || '') : '',
        referrerSupportedSpecialty: editingAppointment.referrerIsDoctor === false ? (editingAppointment.referrerSupportedSpecialty || '') : '',
        referrerSupportedDegree: editingAppointment.referrerIsDoctor === false ? (editingAppointment.referrerSupportedDegree || '') : '',
        referrerEmail: editingAppointment.referrerIsDoctor !== false ? (editingAppointment.referrerEmail || '') : '',
        referrerSpecialty: editingAppointment.referrerIsDoctor !== false ? (editingAppointment.referrerSpecialty || '') : '',
        referrerDegree: editingAppointment.referrerIsDoctor !== false ? (editingAppointment.referrerDegree || '') : '',
        patientName: editingAppointment.patientName,
        mobile: editMobile,
        patientAge: editingAppointment.patientAge,
        patientGender: editingAppointment.patientGender,
      });

      setIsEditingOpen(false);
      setEditingAppointment(null);
      setEditServices([]);
      refreshAppointments();
    } catch (error) {
      console.error('Failed to update appointment:', error);
      // Surface the actual backend reason so a real failure is diagnosable
      // instead of always blaming the connection.
      const detail = error?.response?.data?.error
        || error?.response?.data?.message
        || (typeof error?.response?.data === 'string' ? error.response.data : null)
        || error?.message;
      showNotif('error', 'UPDATE FAILED', detail
        ? `Could not update the appointment: ${detail}`
        : 'Could not update the appointment. Please check your connection and try again.');
    }
  };

  const handleAddReferrer = async (e) => {
    e.preventDefault();

    // Only the name is required. Contact is optional and unvalidated — we just
    // light-sanitize any digits the user typed so stored numbers stay tidy.
    let rawContact = (newReferrer.contact || '').trim();
    let digits = rawContact.replace(/\D/g, '');
    if (digits.startsWith('91') && digits.length === 12) {
      digits = digits.substring(2);
    } else if (digits.startsWith('0') && digits.length === 11) {
      digits = digits.substring(1);
    }
    const contactToSend = digits || rawContact;

    if (!newReferrer.name || newReferrer.name.trim().length < 1) {
      showNotif('error', 'INVALID NAME', 'Referrer name is required.');
      return;
    }

    try {
      const response = await apiClient.post('/referrers', {
        name: newReferrer.name,
        contact: contactToSend,
        address: newReferrer.address
      });
      
      const referrerId = response.data.referrerId || response.data.id;
      const savedReferrer = {
        referrerId: referrerId,
        id: referrerId,
        name: newReferrer.name,
        contact: contactToSend,
        address: newReferrer.address
      };
      
      // Update local state
      setReferrers(prev => [...prev, savedReferrer]);
      
      // Select the newly added referrer in both possible contexts
      setNewPatient(prev => ({ 
        ...prev, 
        referredBy: savedReferrer.name,
        referrerId: savedReferrer.referrerId
      }));
      if (editingAppointment) {
        setEditingAppointment(prev => ({ 
          ...prev, 
          referredBy: savedReferrer.name,
          referrerId: savedReferrer.referrerId
        }));
      }
      
      // Close modal and reset
      setIsAddingReferrer(false);
      setNewReferrer({ name: '', contact: '', address: '' });
      
    } catch (error) {
      console.error('Failed to add referrer:', error);
      const backendError = error.response?.data?.error || error.response?.data?.message;
      showNotif('error', 'REFERRER SAVE FAILED', backendError || 'Could not save referrer. Please verify your connection and try again.');
    }
  };


  // ============================================================
  //  INSTITUTIONAL PRINTING ENGINE (DESKTOP PARITY)
  // ============================================================
  const ghostPrint = (html) => {
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    if (isMobileDevice) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
          setTimeout(() => {
            printWindow.close();
          }, 1000);
        }, 500);
      } else {
        showNotif('warning', 'POP-UPS BLOCKED', 'Please allow pop-ups for this site to enable printing on mobile devices.');
      }
    } else {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);
      iframe.contentDocument.write(html);
      iframe.contentDocument.close();
      
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
    }
  };

  const handlePrintA4 = (inv) => {
    if (!inv) return;
    
    const itemsHtml = (inv.items || []).map(it => `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px 0;">${it.description}</td>
        <td style="padding: 12px 0; text-align: center;">${it.quantity}</td>
        <td style="padding: 12px 0; text-align: right;">₹${it.amount.toLocaleString()}</td>
        <td style="padding: 12px 0; text-align: right; font-weight: bold;">₹${(it.amount * it.quantity).toLocaleString()}</td>
      </tr>
    `).join('');

    ghostPrint(`
      <html>
        <head>
          <title>1Rad Invoice - ${inv.displayId}</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; }
            .header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 2px solid #0f52ba; padding-bottom: 20px; }
            .hospital-info { font-weight: 900; }
            .invoice-meta { text-align: right; }
            .patient-box { background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 30px; border: 1px solid #e2e8f0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            th { text-align: left; font-size: 10px; text-transform: uppercase; color: #64748b; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0; }
            .totals { float: right; width: 300px; }
            .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
            .grand-total { border-top: 2px solid #0f52ba; margin-top: 10px; padding-top: 10px; font-size: 20px; font-weight: 950; color: #0f52ba; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="hospital-info">
               <div style="font-size: 24px; color: #0f52ba;">${(activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTIC HUB').toUpperCase()}</div>
               <div style="font-size: 12px; color: #64748b; font-weight: 500; margin-top: 5px;">${activeCenter?.address || 'Strategic Healthcare Node'}</div>
               <div style="font-size: 12px; color: #64748b; font-weight: 500;">Contact: ${ownerDetails?.contact || activeCenter?.contactNo || '+91 XXXXXXXXXX'} | Email: ${ownerDetails?.email || 'contact@1rad.health'}</div>
               <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-top: 4px;">REPRESENTATIVE: ${ownerDetails?.name || 'ADMINISTRATOR'}</div>
            </div>
            <div class="invoice-meta">
               <div style="font-size: 14px; font-weight: 950;">TAX INVOICE</div>
               <div style="font-size: 11px; color: #64748b; margin-top: 5px;">ID: ${inv.displayId}</div>
               <div style="font-size: 11px; color: #64748b;">DATE: ${new Date(inv.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
          <div class="patient-box">
             <div style="font-size: 10px; font-weight: 950; color: #64748b; margin-bottom: 8px;">BILL_TO_PATIENT:</div>
             <div style="font-size: 18px; font-weight: 950;">${(inv.patientName || 'N/A').toUpperCase()}</div>
             <div style="font-size: 12px; color: #64748b; margin-top: 5px;">Patient ID: ${inv.patientIdentifier || inv.ptid || inv.patientId || 'N/A'}</div>
             <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Ref. No (Referred By): ${inv.referrerName || inv.referenceNumber || 'N/A'}</div>
          </div>
          <table>
             <thead>
                <tr>
                   <th style="width: 50%;">SERVICE_DESCRIPTION</th>
                   <th style="text-align: center;">QTY</th>
                   <th style="text-align: right;">UNIT_PRICE</th>
                   <th style="text-align: right;">SUBTOTAL</th>
                </tr>
             </thead>
             <tbody>
                ${itemsHtml}
             </tbody>
          </table>
          <div class="totals">
             <div class="total-row">
                <span style="font-size: 12px; font-weight: 700;">GROSS_AGGREGATE</span>
                <span style="font-size: 12px; font-weight: 700;">₹${(inv.grossAmount || 0).toLocaleString()}</span>
             </div>
             <div class="total-row" style="color: #ef4444;">
                <span style="font-size: 12px; font-weight: 700;">DEDUCTION/DISCOUNT</span>
                <span style="font-size: 12px; font-weight: 700;">- ₹${(inv.discountAmount || 0).toLocaleString()}</span>
             </div>
             <div class="total-row grand-total">
                <span>NET_PAYABLE</span>
                <span>₹${(inv.totalAmount || 0).toLocaleString()}</span>
             </div>
             <div style="margin-top: 20px; font-size: 11px; font-weight: 900; color: #10b981; text-align: right;">
                STATUS: ${(inv.status || 'PAID').toUpperCase()}
             </div>
          </div>
          <div style="margin-top: 150px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
             This is a computer-generated diagnostic invoice. No physical signature required.<br/>
             Powered by Nexeagle
          </div>
        </body>
      </html>
    `);
  };

  const handlePrintThermal = (inv) => {
    if (!inv) return;
    
    const itemsHtml = (inv.items || []).map(it => `
      <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px;">
        <span>${it.description} x${it.quantity}</span>
        <span>₹${((it.amount || 0) * (it.quantity || 0)).toLocaleString()}</span>
      </div>
    `).join('');

    ghostPrint(`
      <html>
        <head>
          <title>Receipt - ${inv.displayId}</title>
          <style>
            body { font-family: 'monospace'; padding: 10px; font-size: 12px; width: 72mm; }
            .center { text-align: center; }
            .divider { border-top: 1px dashed #000; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="center" style="font-size: 16px; font-weight: bold;">${(activeCenter?.name || activeCenter?.hospitalName || '1RAD HUB').toUpperCase()}</div>
          <div class="center">${activeCenter?.address || ''}</div>
          <div class="center" style="font-size: 9px; font-weight: bold; margin-top: 2px;">TEL: ${ownerDetails?.contact || activeCenter?.contactNo || '+91 XXXXXXXXXX'} | EMAIL: ${ownerDetails?.email || 'contact@1rad.health'}</div>
          <div class="center" style="font-size: 9px; font-weight: bold;">REPRESENTATIVE: ${ownerDetails?.name || 'ADMINISTRATOR'}</div>
          <div class="divider"></div>
          <div style="font-weight: bold;">INV: ${inv.displayId}</div>
          <div>DATE: ${new Date(inv.createdAt).toLocaleString()}</div>
          <div class="divider"></div>
          <div style="font-weight: bold;">PATIENT: ${inv.patientName.toUpperCase()}</div>
          <div>PATIENT ID: ${inv.patientIdentifier || inv.ptid || inv.patientId || 'N/A'}</div>
          <div>REF. NO: ${inv.referrerName || inv.referenceNumber || 'N/A'}</div>
          <div class="divider"></div>
          ${itemsHtml}
          <div class="divider"></div>
          <div style="display: flex; justify-content: space-between; font-weight: bold;">
            <span>TOTAL AMOUNT</span>
            <span>₹${(inv.totalAmount || 0).toLocaleString()}</span>
          </div>
          <div class="divider"></div>
          <div class="center" style="margin-top: 20px; font-size: 10px; font-weight: bold;">
            THANK YOU FOR CHOOSING 1RAD
          </div>
          <div class="center" style="font-size: 8px; color: #555; margin-top: 15px; font-weight: bold; font-family: monospace; letter-spacing: 1px;">POWERED BY NEXEAGLE</div>
        </body>
      </html>
    `);
  };

  const handlePrintReceipt = (inv) => {
    if (!inv) return;
    
    ghostPrint(`
      <html>
        <head>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
          <style>
            @page { size: A4; margin: 0; }
            body { font-family: 'Inter', sans-serif; margin: 0; padding: 50px; color: #1e293b; background: #fff; }
            .container { max-width: 800px; margin: 0 auto; }
            
            /* Center Branding Header block (same style as A4 Invoice) */
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 4px solid #0f52ba; padding-bottom: 30px; margin-bottom: 40px; }
            .hospital-logo { width: 60px; height: 60px; background: #0f52ba; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 24px; margin-bottom: 15px; }
            .hospital-info h1 { font-size: 22px; font-weight: 900; color: #0f52ba; margin: 0; letter-spacing: -0.5px; }
            .hospital-info p { font-size: 11px; color: #64748b; margin: 4px 0; font-weight: 500; }
            .invoice-meta { text-align: right; }
            .invoice-title { font-size: 32px; font-weight: 900; color: #e2e8f0; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 2px; }
            .meta-grid { display: grid; grid-template-columns: auto auto; gap: 8px 20px; font-size: 11px; }
            .meta-label { font-weight: 800; color: #94a3b8; text-transform: uppercase; }
            .meta-value { font-weight: 700; color: #1e293b; }
            
            /* Payment Receipt details container below */
            .receipt-shell { border: 2px solid #0f52ba; border-radius: 24px; padding: 40px; position: relative; overflow: hidden; background: #f8fafc; border-top: 8px solid #0f52ba; }
            .receipt-title-box { font-size: 14px; font-weight: 900; color: #0f52ba; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 25px; }
            
            .content-row { display: flex; margin-bottom: 15px; align-items: baseline; }
            .label { font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; min-width: 200px; }
            .value { font-size: 14px; font-weight: 700; color: #1e293b; border-bottom: 1px dashed #cbd5e1; flex-grow: 1; padding-bottom: 2px; }
            
            .payment-card { background: #f0f4ff; border-radius: 16px; padding: 25px; display: flex; justify-content: space-between; align-items: center; margin-top: 40px; border: 1px solid #dbeafe; }
            .amount-label { font-size: 10px; font-weight: 950; color: #0f52ba; text-transform: uppercase; }
            .amount-value { font-size: 28px; font-weight: 950; color: #0f52ba; }
            
            .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-15deg); font-size: 120px; font-weight: 900; color: rgba(15, 82, 186, 0.03); z-index: 0; text-transform: uppercase; pointer-events: none; }
            .seal { position: absolute; bottom: 30px; right: 30px; width: 100px; height: 100px; border: 2px dashed rgba(15, 82, 186, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 900; color: rgba(15, 82, 186, 0.2); text-align: center; padding: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <!-- Proper Center Name Branding Header Block -->
            <div class="header">
              <div class="hospital-info">
                <div class="hospital-logo">1R</div>
                <h1>${(activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTICS').toUpperCase()}</h1>
                <p>${activeCenter?.address || 'Strategic Clinical Node'}</p>
                <p>CONTACT: ${ownerDetails?.contact || activeCenter?.contactNo || '+91 XXXXXXXXXX'} | EMAIL: ${ownerDetails?.email || 'contact@1rad.health'}</p>
                <p style="font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-top: 2px;">REPRESENTATIVE: ${ownerDetails?.name || 'ADMINISTRATOR'}</p>
              </div>
              <div class="invoice-meta">
                <div class="invoice-title">RECEIPT</div>
                <div class="meta-grid">
                  <span class="meta-label">Receipt No:</span><span class="meta-value">REC/${inv.displayId}</span>
                  <span class="meta-label">Settlement Date:</span><span class="meta-value">${new Date(inv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                </div>
              </div>
            </div>

            <!-- Payment Receipt Acknowledgement Card Box -->
            <div class="receipt-shell">
              <div class="watermark">OFFICIAL</div>
              <div class="receipt-title-box">Payment Receipt Acknowledgement</div>

              <div class="content-row">
                <span class="label">Received With Thanks From:</span>
                <span class="value">${(inv.patientName || 'VALUED PATIENT').toUpperCase()}</span>
              </div>
              <div class="content-row">
                <span class="label">Patient ID:</span>
                <span class="value">${inv.patientIdentifier || inv.ptid || inv.patientId || 'N/A'}</span>
              </div>
              <div class="content-row">
                <span class="label">Ref. No / Referred By:</span>
                <span class="value">${inv.referrerName || inv.referenceNumber || 'N/A'}</span>
              </div>
              <div class="content-row">
                <span class="label">Reference Invoice:</span>
                <span class="value">${inv.displayId}</span>
              </div>
              <div class="content-row">
                <span class="label">Payment Instrument:</span>
                <span class="value">${inv.paymentMethod || 'CASH'} / ID: ${(inv.invoiceId || inv.appointmentId || 'N/A').substring(0, 8).toUpperCase()}</span>
              </div>

              <div class="payment-card">
                <div>
                  <div class="amount-label">Aggregate Amount Received</div>
                  <div style="font-size: 10px; color: #64748b; font-weight: 600;">(In Words: RUPEES ${(inv.totalAmount || 0).toLocaleString()} ONLY)</div>
                </div>
                <div class="amount-value">₹${(inv.totalAmount || 0).toLocaleString()}</div>
              </div>

              <div class="seal">OFFICIAL<br/>COLLECTION<br/>STAMP</div>
              
              <div style="margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; position: relative; z-index: 2;">
                 <div style="font-size: 9px; color: #94a3b8; font-weight: 700;">
                   SYSTEM GENERATED RECEIPT<br/>
                   NO PHYSICAL SIGNATURE REQUIRED
                 </div>
                 <div style="text-align: right;">
                   <div style="font-size: 11px; font-weight: 900; color: #1e293b; border-top: 1px solid #1e293b; padding-top: 5px; width: 180px;">AUTHORIZED CASHIER</div>
                 </div>
              </div>
            </div>
            <div style="text-align: center; font-size: 9px; color: #94a3b8; margin-top: 30px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Powered by Nexeagle</div>
          </div>
        </body>
      </html>
    `);
  };

  const handlePrintInstitutional = async (app, type) => {
    try {
      setLoading(true);
      const res = await apiClient.get('/finance/invoices', { 
        params: { appointmentId: app.appointmentId } 
      });
      const inv = res.data[0];
      if (!inv) {
        showNotif('warning', 'NO INVOICE FOUND', 'No financial records were found for this appointment. Please ensure billing has been completed first.');
        return;
      }
      
      if (type === 'A4') handlePrintA4(inv);
      else if (type === 'THERMAL') handlePrintThermal(inv);
      else if (type === 'RECEIPT') handlePrintReceipt(inv);
    } catch (err) {
      console.error('Print protocol failed', err);
      showNotif('error', 'PRINT FAILED', 'Could not retrieve financial data for printing. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  //  STATUS PIPELINE
  // ============================================================

  // ============================================================
  //  MISSION INTEL CARDS
  // ============================================================
  const renderIntelCards = () => {
    return (
      <div className="intel-cards-grid" style={{ gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(6, 1fr)' }}>
        <div className="intel-card dark">
          <span className="intel-label">Total Volume</span>
          <div className="intel-value">{stats.total}</div>
          <div className="intel-trend">
            <span style={{ color: '#10b981' }}>↑ {activeRate}% Active</span>
          </div>
        </div>
        
        <div className="intel-card">
          <span className="intel-label">Expected/Arrived</span>
          <div className="intel-value" style={{ color: 'var(--primary-accent)' }}>
            {stats.expected}<span style={{ fontSize: '16px', color: '#cbd5e1', margin: '0 4px' }}>/</span>{stats.confirmed}
          </div>
          <div className="intel-trend">
            <span style={{ color: 'var(--text-secondary)' }}>PENDING INTAKE</span>
          </div>
        </div>

        <div className="intel-card">
          <span className="intel-label">In Progress</span>
          <div className="intel-value" style={{ color: '#f59e0b' }}>{stats.inProgress}</div>
          <div className="intel-trend">
            <span style={{ color: '#f59e0b' }}>SCANNING/REPORTING</span>
          </div>
        </div>

        <div className="intel-card">
          <span className="intel-label">Finalized Reports</span>
          <div className="intel-value" style={{ color: '#10b981' }}>{stats.finalized}</div>
          <div className="intel-trend">
            <span style={{ color: '#10b981' }}>SIGNED REPORT</span>
          </div>
        </div>

        <div className="intel-card">
          <span className="intel-label">Delivered Reports</span>
          <div className="intel-value" style={{ color: '#0369a1' }}>{stats.delivered}</div>
          <div className="intel-trend">
            <span style={{ color: '#0369a1' }}>HANDED OVER</span>
          </div>
        </div>

        <div className="intel-card">
          <span className="intel-label">Efficiency</span>
          <div className="intel-value" style={{ color: '#8b5cf6' }}>{completionRate}%</div>
          <div className="intel-trend">
            <span style={{ color: '#8b5cf6' }}>THROUGHPUT</span>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  //  FILTER CONSOLE - RESPONSIVE
  // ============================================================
  const renderFilterBar = () => (
    <div className="filter-bar-responsive">
      <div className="filter-search-group">
        <input
          type="text"
          placeholder="Search patient, referrer, service, mobile…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="filter-reset-btn" style={{ padding: '4px', borderRadius: '50%', width: '24px', height: '24px' }}>✕</button>
        )}
      </div>

      <div className="filter-select-group">
        <select
          className="filter-select"
          value={filters.modality}
          onChange={e => setFilters({...filters, modality: e.target.value})}
        >
          <option value="ALL">All Modalities</option>
          {MODALITIES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="filter-select-group">
        <select
          className="filter-select"
          value={filters.doctor}
          onChange={e => setFilters({...filters, doctor: e.target.value})}
        >
          <option value="ALL">All Specialists</option>
          {doctors.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {(filters.status !== 'ALL' || filters.doctor !== 'ALL' || filters.modality !== 'ALL' || searchQuery) && (
        <button className="filter-reset-btn" onClick={() => {
          setSearchQuery('');
          setFilters({ ...filters, status: 'ALL', doctor: 'ALL', modality: 'ALL' });
        }}>
          Reset
        </button>
      )}
    </div>
  );

  // ============================================================
  //  PAGINATION RENDERER
  // ============================================================
  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const itemStart = (currentPage - 1) * itemsPerPage + 1;
    const itemEnd = Math.min(currentPage * itemsPerPage, filteredAppointments.length);

    const getPageNumbers = () => {
      if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
      const pages = [1];
      if (currentPage > 3) pages.push('...');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
      return pages;
    };

    return (
      <div className="pagination-container">
        <span className="pagination-info">
          Showing <strong>{itemStart}–{itemEnd}</strong> of <strong>{filteredAppointments.length}</strong> record{filteredAppointments.length !== 1 ? 's' : ''}
        </span>

        <div className="pagination-pages">
          <button
            className="pagination-btn pagination-nav"
            onClick={() => handlePageChange(1)}
            disabled={currentPage === 1}
            title="First page"
          >«</button>

          <button
            className="pagination-btn pagination-nav"
            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          ><span className="nav-label">Prev</span></button>

          {getPageNumbers().map((page, i) =>
            page === '...'
              ? <span key={`el-${i}`} className="pagination-ellipsis">…</span>
              : <button
                  key={page}
                  className={`pagination-btn${currentPage === page ? ' active' : ''}`}
                  onClick={() => handlePageChange(page)}
                >{page}</button>
          )}

          <button
            className="pagination-btn pagination-nav"
            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          ><span className="nav-label">Next</span></button>

          <button
            className="pagination-btn pagination-nav"
            onClick={() => handlePageChange(totalPages)}
            disabled={currentPage === totalPages}
            title="Last page"
          >»</button>
        </div>
      </div>
    );
  };



  // ============================================================
  //  APPOINTMENT TABLE ROW
  // ============================================================
  const renderAppointmentRow = (app) => {
    const meta = STATUS_META[app.status] || STATUS_META.unknown;
    const next = getNextAction(app.status);

    // Formatting date
    const appDate = app.dateTime ? new Date(app.dateTime).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const appTime = app.dateTime ? `${new Date(app.dateTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} IST` : '';

    // Priority class — drives the row's pulsing left-edge glow via CSS
    // (priority-row-stat / priority-row-urgent in AppointmentBoard.css). The
    // box-shadow paints the 4px accent strip AND the breathing glow, so we
    // skip the inline borderLeft to avoid double-rendering it.
    // Overdue (on-premises > 3h) reuses the same red pulse — they're both
    // "act now" signals; a row that is both STAT and overdue still pulses red,
    // which is the correct visual outcome.
    const overdue = isOverdue(app.appointmentId);
    const priorityRowClass = (overdue || app.priority === 'STAT') ? 'priority-row-stat'
                           : app.priority === 'URGENT'             ? 'priority-row-urgent'
                           : '';

    // Turnaround-time pills.
    const onPremisesElapsed = app.arrivedAt
      ? formatElapsed(app.arrivedAt, app.deliveredAt)
      : null;
    const premisesSev = premisesSeverity(app.arrivedAt, app.deliveredAt);
    const premisesStyle = premisesPillStyle(premisesSev);
    const scanToDelivery = (app.scanStartedAt && app.deliveredAt)
      ? formatElapsed(app.scanStartedAt, app.deliveredAt)
      : null;

    return (
      <div key={app.appointmentId} className={`appointments-table-wrapper ${priorityRowClass}`} style={{
        marginBottom: '10px',
        border: '1px solid #e8eef7',
        borderRadius: '14px',
        overflow: 'hidden',
        background: 'white',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
        // Compact row redesign — no rigid min-width, content wraps
        // gracefully so the worklist fits on standard laptop screens
        // without horizontal scroll. The earlier 950px floor came
        // from the old 8-column grid; that grid is now flexbox.
        minWidth: 0,
      }}>
        <div style={{ padding: '10px 14px 8px', background: 'transparent' }}>
          {/* Header row — visit-level info (patient + meta + status +
              quick actions). All sub-rows below are service-scoped.
              Layout: identity cluster on the left, action cluster on
              the right, with the patient meta line wrapping if the
              container gets narrow. */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '12px',
          }}>
            {/* Identity cluster — token tile + patient name + meta line. */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0, flex: 1 }}>
              <div style={{
                flexShrink: 0,
                width: '34px', height: '34px', borderRadius: '8px',
                background: 'rgba(15, 82, 186, 0.08)', color: '#0f52ba',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 950, fontSize: '13px',
                border: '1.5px solid rgba(15, 82, 186, 0.18)',
              }}>
                {app.tokenNo || '—'}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                {/* Top line — patient name + gender/age + priority +
                    a compact "services gist" so the receptionist can
                    read the visit's scan plan without dropping their
                    eye to the ledger below. The gist is just the
                    distinct modality codes (X-RAY · CT · USG) with a
                    "+N" overflow chip when there are more than 3. The
                    full breakdown still lives in the ledger sub-rows. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '13px', letterSpacing: '-0.2px' }}>
                    {app.patientName.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '9px', fontWeight: 900, color: '#475569', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', textTransform: 'uppercase' }}>
                    {app.patientGender || 'U'} · {formatPatientAge(app.patientAge)}
                  </span>
                  {app.priority && app.priority !== 'ROUTINE' && (
                    <span
                      className={app.priority === 'STAT' ? 'priority-chip-stat' : 'priority-chip-urgent'}
                      style={{
                        fontSize: '8.5px', fontWeight: 950, letterSpacing: '0.5px',
                        padding: '1px 6px', borderRadius: '999px',
                        color: app.priority === 'STAT' ? '#dc2626' : '#d97706',
                        background: app.priority === 'STAT' ? '#fee2e2' : '#fef3c7',
                        border: `1px solid ${app.priority === 'STAT' ? '#fecaca' : '#fde68a'}`,
                      }}
                    >{app.priority}</span>
                  )}
                  {(() => {
                    // Show service NAMES instead of modality codes —
                    // the receptionist sees exactly what was booked at
                    // a glance ("Chest X-Ray PA · CT Head"). Names are
                    // truncated to keep each chip compact; the ledger
                    // below carries the full names + prices + actions.
                    const lines = getServiceLines(app);
                    if (!lines || lines.length === 0) return null;
                    const shown = lines.slice(0, 2);
                    const extra = lines.length - shown.length;
                    return (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                        marginLeft: '2px',
                        minWidth: 0, // allow chip text to truncate
                        maxWidth: '100%',
                      }}>
                        {shown.map((line, idx) => (
                          <span
                            key={line.id || `gist-${idx}`}
                            title={line.serviceName || line.modality || ''}
                            style={{
                              fontSize: '9px', fontWeight: 800, letterSpacing: '0.2px',
                              color: '#0f52ba', background: '#eff6ff',
                              padding: '1px 7px', borderRadius: '4px',
                              border: '1px solid #dbeafe',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '160px',
                            }}
                          >{line.serviceName || line.modality || '-'}</span>
                        ))}
                        {extra > 0 && (
                          <span
                            title={`${extra} more service${extra === 1 ? '' : 's'} — see ledger below`}
                            style={{
                              fontSize: '8.5px', fontWeight: 950, letterSpacing: '0.3px',
                              color: '#0f52ba', background: '#dbeafe',
                              padding: '1px 6px', borderRadius: '999px',
                              flexShrink: 0,
                            }}
                          >+{extra}</span>
                        )}
                      </span>
                    );
                  })()}
                </div>
                {/* Meta line — #PID · date · time · doctor chip · ref chip · ⏱ TAT.
                    Doctor & referrer get proper coloured chips so they
                    stand out from the muted dot-separated meta —
                    operators glance at this row to know "who's seeing
                    this and who sent them" without hunting through
                    grey text. */}
                <div style={{
                  marginTop: '3px',
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px',
                  fontSize: '10px', fontWeight: 700, color: '#64748b',
                }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#475569' }}>
                    #{app.ptid || app.patientIdentifier || app.id?.substring(0,8) || '—'}
                  </span>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span>{appDate}</span>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span>{appTime}</span>
                  {/* Assigned doctor — emphasised chip. Unassigned
                      states still show but in a muted amber so it
                      flags "no one owns this yet". */}
                  <span
                    title={app.doctor ? `Assigned to ${app.doctor}` : 'No specialist assigned'}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      fontSize: '10.5px', fontWeight: 900, letterSpacing: '0.2px',
                      color: app.doctor ? '#0c4a6e' : '#9a3412',
                      background: app.doctor ? '#e0f2fe' : '#fef3c7',
                      border: `1px solid ${app.doctor ? '#bae6fd' : '#fde68a'}`,
                      padding: '2px 9px', borderRadius: '999px',
                    }}
                  >
                    <span aria-hidden="true" style={{ fontSize: '11px' }}>🩺</span>
                    {app.doctor || 'Unassigned'}
                  </span>
                  {app.referredBy && (
                    <span
                      title={`Referred by ${app.referredBy}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        fontSize: '10.5px', fontWeight: 900, letterSpacing: '0.2px',
                        color: '#5b21b6', background: '#ede9fe',
                        border: '1px solid #ddd6fe',
                        padding: '2px 9px', borderRadius: '999px',
                      }}
                    >
                      <span aria-hidden="true" style={{ fontSize: '11px' }}>↗</span>
                      Ref: {app.referredBy}
                    </span>
                  )}
                  {onPremisesElapsed && (
                    <>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span title={app.deliveredAt ? 'Total time on premises' : 'On premises (live)'} style={{
                        color: premisesStyle.color, background: premisesStyle.bg,
                        border: `1px solid ${premisesStyle.border}`,
                        padding: '1px 6px', borderRadius: '999px',
                        fontWeight: 900, fontSize: '9px',
                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                      }}>
                        <span style={{ fontSize: '9px' }}>⏱</span>{onPremisesElapsed}
                      </span>
                    </>
                  )}
                  {scanToDelivery && (
                    <span title="Scan start → delivered" style={{
                      color: '#0369a1', background: '#e0f2fe',
                      border: '1px solid #bae6fd',
                      padding: '1px 6px', borderRadius: '999px',
                      fontWeight: 900, fontSize: '9px',
                      display: 'inline-flex', alignItems: 'center', gap: '3px',
                    }}>
                      <span style={{ fontSize: '9px' }}>📋</span>{scanToDelivery}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action cluster — sits on the right of the header row.
                Holds the status pill, the optional next-action button
                (Mark Arrived / Mark Scanning / etc), and the three
                quick action icons (Print Token, Edit, Cancel). */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{
                backgroundColor: meta.bg,
                color: meta.color,
                padding: '3px 8px',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                border: `1px solid ${meta.color}20`,
                borderRadius: '6px',
              }}>
                <span style={{ fontSize: '11px', lineHeight: '1' }}>{meta.icon}</span>
                <span style={{ lineHeight: '1', fontWeight: 800, fontSize: '8.5px' }}>{meta.label}</span>
              </div>
              {next && (
                <button
                  onClick={() => handleAction(app.appointmentId || app.id, next.action)}
                  style={{
                    padding: '6px 12px', borderRadius: '6px',
                    background: next.color, color: 'white',
                    border: 'none', cursor: 'pointer',
                    fontSize: '9px', fontWeight: 950,
                    boxShadow: `0 4px 10px ${next.color}33`,
                    whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <span>{next.icon}</span><span>{next.label}</span>
                </button>
              )}
              <button
                onClick={() => setViewAppointment(app)}
                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'white', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '12px' }}
                title="View details"
              >👁️</button>
              <button
                onClick={() => handlePrintToken(app)}
                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'white', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '12px' }}
                title="Print Token"
              >🖨️</button>
              <button
                onClick={() => {
                  // Pre-fill the referral type/profile from the saved referrer so
                  // the edit card shows the right state and an agent isn't flipped
                  // back to "doctor" on save.
                  const matchedRef = (referrers || []).find(r => (r.name || '').toLowerCase() === (app.referredBy || '').toLowerCase());
                  // For an agent, surface the supporting doctor's profile by
                  // looking the doctor up in the partner list (it lives on the
                  // doctor's own referrer record, not the agent's).
                  // Prefer THIS visit's supporting doctor (per-appointment) so an
                  // agent who refers for different doctors shows the right one for
                  // this booking; fall back to the agent's saved default.
                  const apptSupportDoc = app.supportedByDoctor || (matchedRef && matchedRef.isDoctor === false ? matchedRef.supportedByDoctor : '') || '';
                  const supportDoc = apptSupportDoc
                    ? (referrers || []).find(r => r.isDoctor !== false && (r.name || '').toLowerCase() === String(apptSupportDoc).toLowerCase())
                    : null;
                  const refProfile = matchedRef ? {
                    referrerIsDoctor:        matchedRef.isDoctor !== false,
                    referrerContact:         matchedRef.contact || app.referredContact || '',
                    referrerSupportedByDoctor: apptSupportDoc,
                    referrerSupportedSpecialty: supportDoc?.specialty || '',
                    referrerSupportedDegree:    supportDoc?.degree || '',
                    referrerEmail:           matchedRef.email || '',
                    referrerSpecialty:       matchedRef.specialty || '',
                    referrerDegree:          matchedRef.degree || '',
                  } : {};
                  setEditingAppointment({ ...app, ...refProfile });
                  const lines = getServiceLines(app);
                  const [primary, ...rest] = lines;
                  if (primary) {
                    setEditingAppointment(prev => ({
                      ...app,
                      ...refProfile,
                      modality:         primary.modality || app.modality || 'X-RAY',
                      service:          primary.serviceName || app.service || '',
                      amount:           primary.amount || app.amount || 0,
                      referralCutValue: primary.referralCutValue || app.referralCutValue || 0,
                      _primaryServiceId: primary.id || null,
                    }));
                  }
                  setEditServices(rest.map(l => ({
                    id:               l.id || null,
                    serviceName:      l.serviceName,
                    modality:         l.modality,
                    amount:           l.amount,
                    referralCutValue: l.referralCutValue,
                    status:           l.status,
                  })));
                  setIsEditingOpen(true);
                }}
                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'white', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '12px' }}
                title="Edit"
              >✏️</button>
              <button
                onClick={() => setCancelConfirmModal({ isOpen: true, appointmentId: app.appointmentId || app.id, patientName: app.patientName })}
                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: '#fff1f2', border: '1px solid #fecdd3', cursor: 'pointer', color: '#e11d48', fontSize: '12px' }}
                title="Cancel"
              >✕</button>
              {app.referredBy && String(app.referredBy).trim() && (
                <button
                  onClick={() => setChangeRefModal({ isOpen: true, appointmentId: app.appointmentId || app.id, patientName: app.patientName || '', currentReferrer: app.referredBy || '', newName: '', newContact: '', isDoctor: true, phase: 'edit', reason: '', submitting: false })}
                  style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', cursor: 'pointer', color: '#1d4ed8', fontSize: '12px' }}
                  title="Change referred by"
                >↪</button>
              )}
            </div>
          </div>

          {/* Service ledger — Stripe-invoice style sub-rows. One
              properly-aligned line per service: modality chip · service
              name · price · status pill · per-line Print button. A
              TOTAL row anchors the bill at the bottom for multi-service
              visits. Single-service visits show one sub-row and skip
              the total (the row itself shows the only price). */}
          {(() => {
            const lines = getServiceLines(app);
            if (lines.length === 0) return null;

            const accentFor = (m) => {
              const k = String(m || '').toUpperCase();
              return ({
                'X-RAY': '#10b981', CT: '#3b82f6', MRI: '#8b5cf6',
                ULTRASOUND: '#06b6d4', USG: '#06b6d4',
                MAMMOGRAPHY: '#ec4899', MG: '#ec4899',
                DEXA: '#f59e0b', PET: '#f97316', NUCLEAR: '#84cc16',
              }[k] || '#64748b');
            };
            const stepRank = (status) => {
              const s = String(status || '').toUpperCase();
              if (s === 'DELIVERED') return 4;
              if (s === 'REPORTED')  return 3;
              if (s === 'SCANNED')   return 2;
              return 1;
            };
            const stepPill = (status) => {
              const s = String(status || '').toUpperCase();
              if (s === 'DELIVERED')   return { label: 'Delivered',   color: '#047857', bg: '#d1fae5', border: '#a7f3d0' };
              if (s === 'REPORTED')    return { label: 'Reported',    color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' };
              if (s === 'SCANNED')     return { label: 'Scanned',     color: '#9a3412', bg: '#ffedd5', border: '#fed7aa' };
              if (s === 'IN_MID')      return { label: 'Half Way',    color: '#b45309', bg: '#fef3c7', border: '#fcd34d' };
              if (s === 'IN_PROGRESS') return { label: 'In Progress', color: '#a16207', bg: '#fef9c3', border: '#fde68a' };
              if (s === 'CANCELLED')   return { label: 'Cancelled',   color: '#9f1239', bg: '#ffe4e6', border: '#fecdd3' };
              return                         { label: 'Not Started',  color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' };
            };
            const apptKey  = app.appointmentId || app.id;
            const expanded = expandedLedgers.has(apptKey);

            // Tiny one-line summary for the collapsed state. Counts
            // services by stage so the front desk knows at a glance
            // whether anything still needs work, even without unfurling.
            const summary = { notStarted: 0, scanned: 0, reported: 0, delivered: 0, cancelled: 0 };
            for (const l of lines) {
              const s = String(l.status || 'NOT_STARTED').toUpperCase();
              if (s === 'DELIVERED')   summary.delivered++;
              else if (s === 'REPORTED')  summary.reported++;
              else if (s === 'SCANNED')   summary.scanned++;
              else if (s === 'CANCELLED') summary.cancelled++;
              else                        summary.notStarted++;
            }
            const summaryChips = [
              summary.notStarted && { label: `${summary.notStarted} pending`,   bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
              summary.scanned    && { label: `${summary.scanned} scanned`,      bg: '#ffedd5', color: '#9a3412', border: '#fed7aa' },
              summary.reported   && { label: `${summary.reported} reported`,    bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' },
              summary.delivered  && { label: `${summary.delivered} delivered`,  bg: '#d1fae5', color: '#047857', border: '#a7f3d0' },
              summary.cancelled  && { label: `${summary.cancelled} cancelled`,  bg: '#ffe4e6', color: '#9f1239', border: '#fecdd3' },
            ].filter(Boolean);

            return (
              <div style={{
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px solid #f1f5f9',
                display: 'flex', flexDirection: 'column', gap: '6px',
              }}>
                {/* Toggle strip — collapsed by default. Shows a per-
                    stage chip summary on the left + a chevron button
                    on the right that flips the full ledger open.
                    Stops the row click handler so opening the ledger
                    doesn't also fire whatever the parent row click
                    does (Edit drawer, etc.). */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); toggleLedger(apptKey); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleLedger(apptKey); }
                  }}
                  aria-expanded={expanded}
                  aria-label={expanded ? 'Hide services' : `View all ${lines.length} services`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    background: expanded ? 'rgba(15, 82, 186, 0.05)' : '#f8fafc',
                    border: `1px solid ${expanded ? 'rgba(15, 82, 186, 0.18)' : '#eef2f6'}`,
                    cursor: 'pointer',
                    transition: 'background 0.12s, border-color 0.12s',
                  }}
                  onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.background = '#f1f5f9'; }}
                  onMouseLeave={(e) => { if (!expanded) e.currentTarget.style.background = '#f8fafc'; }}
                >
                  <span style={{
                    fontSize: '9px', fontWeight: 950, letterSpacing: '0.5px',
                    color: '#0f172a', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>
                    {lines.length} {lines.length === 1 ? 'service' : 'services'}
                  </span>
                  <div style={{
                    flex: 1, minWidth: 0,
                    display: 'flex', alignItems: 'center', gap: '4px',
                    flexWrap: 'wrap',
                  }}>
                    {summaryChips.map((c, i) => (
                      <span key={i} style={{
                        fontSize: '8.5px', fontWeight: 800, letterSpacing: '0.3px',
                        color: c.color, background: c.bg,
                        padding: '2px 7px', borderRadius: '999px',
                        border: `1px solid ${c.border}`,
                        textTransform: 'uppercase',
                      }}>{c.label}</span>
                    ))}
                  </div>
                  <span style={{
                    fontSize: '9px', fontWeight: 900, letterSpacing: '0.5px',
                    color: '#0f52ba', textTransform: 'uppercase', whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                  }}>
                    {expanded ? 'Hide' : 'View all'}
                    <span aria-hidden="true" style={{
                      display: 'inline-block',
                      transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.18s',
                      fontSize: '11px', lineHeight: 1,
                    }}>▾</span>
                  </span>
                </div>

                {expanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {/* Tiny in-card column headers — match the sub-row
                    grid columns so service / amount / status / print
                    all read like a proper table. Very subtle so they
                    orient without competing with the data. */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '4px 96px minmax(160px, 1fr) 130px 160px',
                  gap: '8px',
                  alignItems: 'center',
                  padding: '0 4px 4px 6px',
                  fontSize: '8px', fontWeight: 900, letterSpacing: '0.8px',
                  color: '#94a3b8', textTransform: 'uppercase',
                }}>
                  <span />
                  <span style={{ textAlign: 'center' }}>Modality</span>
                  <span>Service</span>
                  <span>Status</span>
                  <span style={{ textAlign: 'center' }}>Print Prescription</span>
                </div>
                {lines.map((line, idx) => {
                  const accent   = accentFor(line.modality);
                  const step     = stepRank(line.status);
                  const pill     = stepPill(line.status);
                  const canPrint = step >= 3;
                  return (
                    <div
                      key={line.id || `lrow-${idx}`}
                      style={{
                        display: 'grid',
                        // Sub-row grid — consistent columns across the
                        // visit's services so the eye can scan straight
                        // down: modality · name · price · status · print.
                        gridTemplateColumns: '4px 96px minmax(160px, 1fr) 130px 160px',
                        gap: '8px',
                        alignItems: 'center',
                        padding: '5px 4px 5px 6px',
                        borderRadius: '8px',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fbff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {/* Modality accent stripe — colour-codes the row. */}
                      <span aria-hidden="true" style={{
                        width: '3px', height: '18px', borderRadius: '3px',
                        background: accent,
                      }} />
                      <span style={{
                        fontSize: '9px', fontWeight: 950, letterSpacing: '0.4px',
                        color: '#0f52ba', background: '#eff6ff',
                        padding: '2px 6px', borderRadius: '5px',
                        border: '1px solid #dbeafe',
                        textAlign: 'center',
                      }}>{line.modality || 'OT'}</span>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, color: '#1e293b',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }} title={line.serviceName}>
                        {line.serviceName || '-'}
                      </span>
                      {/* Status + TAT pills share one cell so the
                          eye reads them as a unit ("Scanned · 1h 20m"
                          tells the whole story for the row). The TAT
                          pill colour shifts amber/red on SLA breach. */}
                      {(() => {
                        const elapsedMin = getStageElapsedMinutes(line, app, nowMs);
                        const slaBucket  = getStageSlaBucket(line, elapsedMin);
                        const tatStyle = (
                          slaBucket === 'breach' ? { color: '#9f1239', bg: '#ffe4e6', border: '#fecdd3' } :
                          slaBucket === 'warn'   ? { color: '#9a3412', bg: '#ffedd5', border: '#fed7aa' } :
                                                   { color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' }
                        );
                        const tatLabel = elapsedMin == null ? '' : formatStageElapsed(elapsedMin);
                        return (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            flexWrap: 'wrap',
                          }}>
                            <span style={{
                              fontSize: '8.5px', fontWeight: 900, letterSpacing: '0.3px',
                              color: pill.color, background: pill.bg,
                              padding: '2px 7px', borderRadius: '999px',
                              border: `1px solid ${pill.border}`,
                              textTransform: 'uppercase',
                            }}>{pill.label}</span>
                            {tatLabel && (
                              <span title={`In ${pill.label.toLowerCase()} stage for ${tatLabel}`} style={{
                                fontSize: '8.5px', fontWeight: 800, letterSpacing: '0.3px',
                                color: tatStyle.color, background: tatStyle.bg,
                                padding: '2px 6px', borderRadius: '999px',
                                border: `1px solid ${tatStyle.border}`,
                                fontVariantNumeric: 'tabular-nums',
                              }}>⏱ {tatLabel}</span>
                            )}
                          </span>
                        );
                      })()}
                      <button
                        type="button"
                        disabled={!canPrint}
                        onClick={(e) => { e.stopPropagation(); if (canPrint) handlePreviewPrint(app, line.id); }}
                        aria-label={`Print prescription for ${line.serviceName || line.modality}`}
                        title={canPrint ? 'Print prescription for this service' : 'Available once the report is finalised'}
                        style={{
                          justifySelf: 'stretch',
                          padding: '5px 10px',
                          borderRadius: '7px',
                          border: 'none',
                          background: canPrint ? 'linear-gradient(135deg, #0f52ba 0%, #1e3a8a 100%)' : '#f1f5f9',
                          color: canPrint ? 'white' : '#94a3b8',
                          cursor: canPrint ? 'pointer' : 'not-allowed',
                          fontSize: '9px', fontWeight: 900, letterSpacing: '0.3px',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                          boxShadow: canPrint ? '0 2px 6px -2px rgba(15, 82, 186, 0.55)' : 'none',
                          fontFamily: 'inherit',
                          textTransform: 'uppercase',
                          transition: 'transform 0.12s ease',
                          whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => { if (canPrint) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                      >
                        {/* Heroicons-style outline printer, inline SVG so
                            no icon library dependency. currentColor lets
                            it switch between white (enabled) and slate
                            (disabled) without two assets. */}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="6 9 6 2 18 2 18 9" />
                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                          <rect x="6" y="14" width="12" height="8" rx="1" />
                        </svg>
                        Print Prescription
                      </button>
                    </div>
                  );
                })}

                {/* Total row removed at user request — per-service
                    amounts line up in the price column already, and the
                    booking-step briefing + the token slip both still
                    show the visit-level total. */}
                </div>
                )}
              </div>
            );
          })()}
        </div>

      </div>
    );
  };

  // ============================================================
  //  BOOKING DRAWER
  // ============================================================
  const renderDrawer = () => {
    const isStep1 = bookingStep === 1;
    const isStep2 = bookingStep === 2;
    const isStep3 = bookingStep === 3;

    if (isBookingOpen) return (
      <div className="drawer-overlay">
        <div className="drawer-content booking-drawer-width" onClick={e => e.stopPropagation()}>
          {/* Header — padding shrinks on phones so the title isn't
              pinched between huge whitespace gutters. Letter-spacing
              on the phase line drops too (long captions like
              "Clinical Configuration" otherwise wrap awkwardly). */}
          <div className="drawer-header" style={{
            background: 'linear-gradient(135deg, #0a1628 0%, #0f52ba 100%)',
            color: 'white',
            padding: isMobile ? '14px 16px' : '16px 30px',
            border: 'none',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h2 style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 900, margin: 0 }}>NEW APPOINTMENT</h2>
              </div>
              <p style={{
                fontSize: isMobile ? '10px' : '11px',
                opacity: 0.7, textTransform: 'uppercase',
                letterSpacing: isMobile ? '0.5px' : '1px',
                margin: 0,
              }}>
                Phase {bookingStep}: {isStep1 ? 'Patient Identity' : 'Clinical Configuration'}
              </p>
            </div>
            <button className="btn-close" style={{ color: 'white', fontSize: '28px', flexShrink: 0 }} onClick={() => setIsBookingOpen(false)}>✕</button>
          </div>

          <div style={{ padding: isMobile ? '0 16px' : '0 30px', marginTop: '12px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[1,2].map(s => (
                <div key={s} style={{
                  flex: 1, height: '5px', borderRadius: '3px',
                  background: s <= bookingStep ? 'linear-gradient(90deg, #0f52ba, #00f2fe)' : '#eef0f2',
                  transition: 'background 0.4s ease',
                }} />
              ))}
            </div>
          </div>

          <div className="drawer-body" style={{ paddingTop: '10px' }} ref={drawerBodyRef}>
            {isStep1 && (
              <div className="quest-step-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Remaining Form in Two Columns */}
                <div style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  gap: '24px',
                  alignItems: 'stretch'
                }}>
                  {/* Left Column: Patient Details */}
                  <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ background: 'white', padding: '16px 20px', borderRadius: '14px', border: '2px dashed #dde5f5' }}>
                      <label style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 800, marginBottom: '12px', display: 'block', letterSpacing: '1px' }}>ENTER PATIENT DEMOGRAPHICS</label>
                      
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr', 
                        gap: '10px' 
                      }}>
                        <div className="form-group" style={{ marginBottom: '4px' }}>
                          <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>FULL NAME <span style={{ color: '#e74c3c' }}>*</span></label>
                          <input 
                            type="text" 
                            required 
                            placeholder="e.g. Michael Thorne" 
                            style={{ 
                              width: '100%',
                              fontSize: '13px', 
                              padding: '8px 12px',
                              borderRadius: '10px',
                              border: showBookingValidation && !newPatient.name.trim() ? '1.5px solid #e74c3c' : '1.5px solid #dee2e6',
                              background: showBookingValidation && !newPatient.name.trim() ? '#fff5f5' : 'white',
                              outline: 'none', fontWeight: 600
                            }} 
                            value={newPatient.name}
                            onChange={e => { setNewPatient({...newPatient, name: e.target.value}); setNewBooking({...newBooking, patientId: ''}); }}
                          />
                        </div>

                        {/* ── Ambient duplicate hint — the system finds the likely
                            existing patient for the operator, no search needed. ── */}
                        {!dupDismissed && !newBooking.patientId && patientDuplicates.length > 0 && (
                          <div style={{
                            marginBottom: '8px', borderRadius: '14px', overflow: 'hidden',
                            border: '1.5px solid #fde68a', background: '#fffbeb',
                            boxShadow: '0 6px 18px rgba(217,119,6,0.06)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: '1px solid #fef3c7' }}>
                              <span style={{ fontSize: '9px', fontWeight: 900, color: '#b45309', letterSpacing: '0.8px' }}>
                                ⚠ POSSIBLE EXISTING PATIENT{patientDuplicates.length > 1 ? 'S' : ''}
                              </span>
                              <button
                                type="button"
                                onClick={() => setDupDismissed(true)}
                                style={{ background: 'none', border: 'none', color: '#92400e', fontSize: '10px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px' }}
                              >NEW PATIENT ✕</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              {patientDuplicates.map((d, i) => {
                                const p = d.patient;
                                const tag = d.tier === 'high' ? { t: 'LIKELY SAME', c: '#b91c1c', bg: '#fee2e2' }
                                          : d.tier === 'family' ? { t: 'SAME PHONE', c: '#92400e', bg: '#fef3c7' }
                                          : { t: 'POSSIBLE', c: '#9a3412', bg: '#ffedd5' };
                                return (
                                  <div key={p.id || i} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                                    padding: '10px 12px', borderTop: i ? '1px solid #fef3c7' : 'none',
                                  }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 900, color: '#1e293b' }}>{(p.fullName || p.name || '').toUpperCase()}</span>
                                        <span style={{ fontSize: '8px', fontWeight: 950, color: tag.c, background: tag.bg, padding: '2px 7px', borderRadius: '20px', letterSpacing: '0.5px' }}>{tag.t}</span>
                                      </div>
                                      <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, marginTop: '2px' }}>
                                        {[p.patientIdentifier || p.id, p.mobile, formatPatientAge ? formatPatientAge(p.age) : p.age, p.gender].filter(Boolean).join(' · ')}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const { value: ageVal, unit: ageUnitVal } = parsePatientAge(p.age);
                                        setNewBooking(prev => ({ ...prev, patientId: p.id || p.patientId }));
                                        setNewPatient({
                                          name: p.fullName || p.name || '',
                                          mobile: p.mobile || '',
                                          age: ageVal,
                                          ageUnit: ageUnitVal,
                                          gender: p.gender || 'Female',
                                          village: p.village || '',
                                          district: p.district || '',
                                          address: p.address || '',
                                          referredBy: p.referredBy || '',
                                          sourceOfInfo: p.sourceOfInfo || '',
                                          referrerId: p.referrerId || null,
                                          referrerContact: '', referrerAddress: '',
                                        });
                                        setPatientDuplicates([]);
                                      }}
                                      style={{ padding: '8px 14px', borderRadius: '10px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    >THIS IS THEM</button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div className="form-group" style={{ marginBottom: '4px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>AGE <span style={{ color: '#e74c3c' }}>*</span></label>
                            {/* Number + Y/M/D unit toggle. Use M for babies
                                under 2y, D for newborns under a month. The
                                input + buttons share the same border so it
                                looks like one control, not two stuck side
                                by side. */}
                            <div style={{
                              display: 'flex', alignItems: 'stretch',
                              border: showBookingValidation && !newPatient.age.trim() ? '1.5px solid #e74c3c' : '1.5px solid #dee2e6',
                              borderRadius: '10px',
                              background: showBookingValidation && !newPatient.age.trim() ? '#fff5f5' : 'white',
                              overflow: 'hidden',
                            }}>
                              <input
                                type="text"
                                required
                                placeholder={newPatient.ageUnit === 'M' ? '6' : newPatient.ageUnit === 'D' ? '15' : '25'}
                                inputMode="numeric"
                                style={{
                                  flex: 1, minWidth: 0,
                                  fontSize: '13px',
                                  padding: '8px 10px',
                                  border: 'none', outline: 'none',
                                  background: 'transparent',
                                }}
                                value={newPatient.age}
                                onChange={e => setNewPatient({...newPatient, age: e.target.value.replace(/[^0-9.]/g, '')})}
                              />
                              <div style={{ display: 'flex', borderLeft: '1.5px solid #dee2e6' }}>
                                {['Y', 'M', 'D'].map(u => {
                                  const active = newPatient.ageUnit === u;
                                  return (
                                    <button
                                      key={u}
                                      type="button"
                                      onClick={() => setNewPatient({...newPatient, ageUnit: u})}
                                      title={u === 'Y' ? 'Years' : u === 'M' ? 'Months' : 'Days'}
                                      style={{
                                        background: active ? '#0f52ba' : 'transparent',
                                        color: active ? 'white' : '#64748b',
                                        border: 'none',
                                        padding: '0 10px',
                                        fontSize: '11px', fontWeight: 900, letterSpacing: '0.5px',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s',
                                      }}
                                    >{u}</button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                          <div className="form-group" style={{ marginBottom: '4px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', marginBottom: '4px', display: 'block' }}>GENDER</label>
                            {/* F / M toggle — same control idiom as the age unit buttons. */}
                            <div style={{ display: 'flex', alignItems: 'stretch', border: '1.5px solid #dee2e6', borderRadius: '10px', overflow: 'hidden', height: '38px' }}>
                              {[{ v: 'Female', l: 'F' }, { v: 'Male', l: 'M' }].map(g => {
                                const active = newPatient.gender === g.v;
                                return (
                                  <button
                                    key={g.v}
                                    type="button"
                                    onClick={() => setNewPatient({...newPatient, gender: g.v})}
                                    title={g.v}
                                    style={{
                                      flex: 1,
                                      background: active ? '#0f52ba' : 'transparent',
                                      color: active ? 'white' : '#64748b',
                                      border: 'none',
                                      fontSize: '13px', fontWeight: 900, letterSpacing: '0.5px',
                                      cursor: 'pointer', transition: 'background 0.15s',
                                    }}
                                  >{g.l}</button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="form-group" style={{ marginBottom: '4px' }}>
                          <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>MOBILE <span style={{ color: '#94a3b8', fontWeight: 600 }}>(optional)</span></label>
                          <input
                            type="tel"
                            placeholder="10-digit mobile (optional)"
                            style={{
                              width: '100%',
                              fontSize: '13px',
                              padding: '8px 12px',
                              borderRadius: '10px',
                              borderColor: (newPatient.mobile.length > 0 && !isMobileValid) ? '#e74c3c' : '#dee2e6',
                              boxShadow: (newPatient.mobile.length > 0 && !isMobileValid) ? '0 0 0 1px #e74c3c' : 'none',
                              outline: 'none', fontWeight: 600
                            }}
                            value={newPatient.mobile}
                            onChange={e => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                              setNewPatient({...newPatient, mobile: val});
                              setNewBooking({...newBooking, patientId: ''});
                            }}
                          />
                          {newPatient.mobile.length > 0 && !isMobileValid && (
                            <div style={{ fontSize: '8px', color: '#e74c3c', fontWeight: 800, marginTop: '2px', letterSpacing: '0.5px' }}>
                              Exactly 10 digits required.
                            </div>
                          )}
                        </div>
                        <div className="form-group" style={{ marginBottom: '4px' }}>
                          <label style={{ fontSize: '10px', fontWeight: 800, color: '#0f52ba', letterSpacing: '0.5px', marginBottom: '4px', display: 'block' }}>SOURCE OF INFORMATION</label>
                          <input 
                            type="text" 
                            placeholder="Discovery source..." 
                            style={{ width: '100%', fontSize: '13px', padding: '8px 10px', height: '38px', border: '1.5px solid #0f52ba20', background: '#f0f7ff', borderRadius: '10px', outline: 'none' }} 
                            value={newPatient.sourceOfInfo} 
                            onChange={e => setNewPatient({...newPatient, sourceOfInfo: e.target.value})} 
                          />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div className="form-group" style={{ marginBottom: '4px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>VILLAGE</label>
                            <input type="text" placeholder="Village" style={{ fontSize: '13px', padding: '8px 10px', borderRadius: '10px' }} value={newPatient.village} onChange={e => setNewPatient({...newPatient, village: e.target.value})} />
                          </div>
                          <div className="form-group" style={{ marginBottom: '4px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>DISTRICT</label>
                            <input type="text" placeholder="District" style={{ fontSize: '13px', padding: '8px 10px', borderRadius: '10px' }} value={newPatient.district} onChange={e => setNewPatient({...newPatient, district: e.target.value})} />
                          </div>
                        </div>
                        <div className="form-group" style={{ marginBottom: '4px' }}>
                          <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>ADDRESS / RESIDENCE DATA</label>
                          <input 
                            type="text" 
                            placeholder="Street, Landmark..." 
                            style={{ width: '100%', fontSize: '13px', padding: '8px 10px', height: '38px', borderRadius: '10px', border: '1.5px solid #dee2e6' }} 
                            value={newPatient.address} 
                            onChange={e => setNewPatient({...newPatient, address: e.target.value})} 
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Referred By & Proceed */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ background: 'white', padding: '16px 20px', borderRadius: '14px', border: '2px dashed #dde5f5', height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <label style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 800, marginBottom: '12px', display: 'block', letterSpacing: '1px' }}>REFERRAL SOURCE</label>
                      
                      <div className="form-group" style={{ position: 'relative', flex: 1 }}>
                        <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', marginBottom: '6px', display: 'block' }}>REFERRED BY</label>
                        {/* Search OR type. If the typed name matches no existing
                            referrer, it becomes a brand-new referral source on
                            proceed — no separate "add" button needed. */}
                        <div style={{ position: 'relative' }}>
                          <input
                            type="text"
                            placeholder="Search or type referrer..."
                            value={newPatient.referredBy}
                            style={{
                              width: '100%', padding: '8px 12px', borderRadius: '10px',
                              border: '1.5px solid #dee2e6', fontSize: '13px', fontWeight: 600,
                              outline: 'none', background: '#f8fafc'
                            }}
                            onChange={e => {
                              const val = e.target.value;
                              setNewPatient({...newPatient, referredBy: val, referrerId: null});
                              fetchReferrers(val);
                            }}
                          />
                          {newPatient.referredBy && referrers.length > 0 && !referrers.some(r => r.name === newPatient.referredBy) && (
                            <div style={{
                              position: 'absolute', top: '100%', left: 0, right: 0,
                              background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px',
                              boxShadow: '0 10px 30px rgba(0,0,0,0.1)', zIndex: 100,
                              maxHeight: '150px', overflowY: 'auto', marginTop: '4px'
                            }}>
                              {referrers.map(r => (
                                <div
                                  key={r.referrerId || r.id}
                                  onClick={() => {
                                    setNewPatient({...newPatient, referredBy: r.name, referrerId: r.referrerId || r.id});
                                    setReferrers([]);
                                  }}
                                  style={{ padding: '10px 15px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', fontSize: '12px' }}
                                  onMouseOver={e => e.currentTarget.style.background = '#f0f4ff'}
                                  onMouseOut={e => e.currentTarget.style.background = 'white'}
                                >
                                  <strong>{r.name}</strong>
                                  <span style={{ marginLeft: '8px', color: '#888', fontSize: '10px' }}>{r.contact}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Self / walk-in — no external referrer. Credits the centre's
                            own doctor by default (overridable in the Supporting doctor
                            field), so a self-referred patient's commission lands on the
                            in-house doctor. */}
                        <div style={{ marginTop: '8px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setNewPatient(prev => ({
                                ...prev,
                                referredBy: 'Self',
                                referrerId: null,
                                referrerIsDoctor: false,
                                referrerSupportedByDoctor: (prev.referrerSupportedByDoctor || '').trim() || ownerDetails?.name || '',
                              }));
                              setReferrers([]);
                              setReferrerSuggestions([]);
                            }}
                            style={{
                              padding: '6px 14px', borderRadius: '20px',
                              border: (newPatient.referredBy || '').trim().toLowerCase() === 'self' ? '1.5px solid #0f52ba' : '1px solid #dbeafe',
                              background: (newPatient.referredBy || '').trim().toLowerCase() === 'self' ? '#0f52ba' : '#f0f7ff',
                              color: (newPatient.referredBy || '').trim().toLowerCase() === 'self' ? 'white' : '#0f52ba',
                              fontSize: '10px', fontWeight: 900, cursor: 'pointer', letterSpacing: '0.3px',
                            }}
                          >🏥 Self / walk-in{ownerDetails?.name ? ` · Dr. ${ownerDetails.name}` : ''}</button>
                        </div>

                        {/* Top 3 most-frequent referring persons — one tap to fill.
                            Shown only when the field is empty. */}
                        {newPatient.referredBy.trim().length === 0 && topReferrers.length > 0 && (
                          <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            <span style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8', letterSpacing: '0.5px', width: '100%' }}>TOP REFERRED BY</span>
                            {topReferrers.map(name => {
                              const match = referrers.find(r => r.name === name);
                              return (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => {
                                    setNewPatient(prev => ({ ...prev, referredBy: name, referrerId: match ? (match.referrerId || match.id) : null }));
                                    setReferrers([]);
                                  }}
                                  style={{ padding: '5px 11px', borderRadius: '20px', border: '1px solid #dbeafe', background: '#f0f7ff', color: '#0f52ba', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}
                                >
                                  {name}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* "Did you mean" — fuzzy near-duplicate referrers so the
                            operator links an existing partner instead of spawning
                            "Dr Sharma" / "Dr. Sharmaa" as a second record. */}
                        {!newPatient.referrerId && referrerSuggestions.length > 0 && (
                          <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontSize: '8px', fontWeight: 900, color: '#b45309', letterSpacing: '0.5px' }}>DID YOU MEAN</span>
                            {referrerSuggestions.map(s => (
                              <button
                                key={s.referrer.referrerId || s.referrer.id}
                                type="button"
                                onClick={() => {
                                  setNewPatient(prev => ({ ...prev, referredBy: s.referrer.name, referrerId: s.referrer.referrerId || s.referrer.id }));
                                  setReferrerSuggestions([]);
                                  setReferrers([]);
                                }}
                                style={{ padding: '5px 11px', borderRadius: '20px', border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}
                              >
                                {s.referrer.name}{s.referrer.contact ? ` · ${s.referrer.contact}` : ''}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* New referral source — typed name doesn't match an existing
                            partner. Choice-first: is this a doctor or another person? */}
                        {newPatient.referredBy.trim() && !newPatient.referrerId && (() => {
                          const refIsDoctor = newPatient.referrerIsDoctor !== false; // default Doctor
                          const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, outline: 'none', background: '#f8fafc', border: '1.5px solid #dee2e6', boxSizing: 'border-box' };
                          return (
                          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {/* Step 1 — who is the referral? */}
                            <div>
                              <div style={{ fontSize: '9px', fontWeight: 800, color: '#64748b', letterSpacing: '0.5px', marginBottom: '6px' }}>
                                WHO IS THE REFERRAL?
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                {[{ k: true, icon: '👨‍⚕️', label: 'Doctor' }, { k: false, icon: '👤', label: 'Other person' }].map(opt => {
                                  const active = refIsDoctor === opt.k;
                                  return (
                                    <button key={String(opt.k)} type="button"
                                      onClick={() => setNewPatient({ ...newPatient, referrerIsDoctor: opt.k })}
                                      style={{ flex: 1, padding: '12px 10px', borderRadius: '12px', border: `1.5px solid ${active ? '#0f52ba' : '#dee2e6'}`, background: active ? '#eff6ff' : 'white', color: active ? '#0f52ba' : '#64748b', fontSize: '12px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                      <span style={{ fontSize: '18px' }}>{opt.icon}</span>
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Step 2 — common fields: Mobile + Email */}
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <input type="tel" placeholder="Mobile (optional)" value={newPatient.referrerContact}
                                  onChange={e => setNewPatient({...newPatient, referrerContact: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                                  style={{ ...inputStyle, border: `1.5px solid ${!isReferrerContactValid ? '#e74c3c' : '#dee2e6'}` }} />
                                {!isReferrerContactValid && (
                                  <div style={{ fontSize: '8px', color: '#e74c3c', fontWeight: 800, marginTop: '2px', letterSpacing: '0.5px' }}>
                                    Exactly 10 digits required.
                                  </div>
                                )}
                              </div>
                              <input type="email" placeholder="Email / Gmail (optional)" value={newPatient.referrerEmail || ''}
                                onChange={e => setNewPatient({...newPatient, referrerEmail: e.target.value})} style={{ ...inputStyle, flex: 1 }} />
                            </div>

                            {/* Step 2b — conditional: doctor → speciality+degree; other → supported by doctor */}
                            {refIsDoctor ? (
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <input type="text" placeholder="Speciality (optional)" value={newPatient.referrerSpecialty || ''}
                                  onChange={e => setNewPatient({...newPatient, referrerSpecialty: e.target.value})} style={{ ...inputStyle, flex: 1 }} />
                                <input type="text" placeholder="Degree (optional)" value={newPatient.referrerDegree || ''}
                                  onChange={e => setNewPatient({...newPatient, referrerDegree: e.target.value})} style={{ ...inputStyle, flex: 1 }} />
                              </div>
                            ) : (
                              // Separated block: the payee is an agent, so the
                              // referring doctor they collect for gets its own
                              // clearly-labelled card — distinct from the agent's
                              // own contact fields above.
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '12px', border: `1.5px dashed ${isSupportedDoctorMissing ? '#f59e0b' : '#bfdbfe'}`, background: isSupportedDoctorMissing ? '#fffbeb' : '#f5f9ff' }}>
                                <div style={{ fontSize: '9px', fontWeight: 900, color: '#0f52ba', letterSpacing: '0.6px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <span>👨‍⚕️</span> Referring doctor <span style={{ color: '#e11d48' }}>*</span>
                                  <span style={{ fontSize: '8px', fontWeight: 800, color: '#b45309', letterSpacing: '0.3px' }}>required</span>
                                </div>
                                {/* Supported by doctor — auto-select from existing partner doctors */}
                                <div style={{ position: 'relative' }}>
                                  <input type="text" placeholder="Supporting doctor name — search or type" value={newPatient.referrerSupportedByDoctor || ''}
                                    onChange={e => setNewPatient({...newPatient, referrerSupportedByDoctor: e.target.value})}
                                    style={{ ...inputStyle, border: `1.5px solid ${isSupportedDoctorMissing ? '#f59e0b' : '#dee2e6'}` }} />
                                  {(() => {
                                    const q = String(newPatient.referrerSupportedByDoctor || '').trim().toLowerCase();
                                    if (q.length < 1) return null;
                                    const matches = (referrers || [])
                                      .filter(r => r.isDoctor !== false && (r.name || '').toLowerCase().includes(q) && (r.name || '').toLowerCase() !== q)
                                      .slice(0, 5);
                                    if (matches.length === 0) return null;
                                    return (
                                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 6px 18px rgba(15,23,42,0.12)', marginTop: '4px', maxHeight: '170px', overflowY: 'auto' }}>
                                        {matches.map(d => (
                                          <div key={d.referrerId || d.name}
                                            onMouseDown={() => setNewPatient({ ...newPatient, referrerSupportedByDoctor: d.name, referrerSupportedSpecialty: d.specialty || '', referrerSupportedDegree: d.degree || '' })}
                                            style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{d.name}</div>
                                            {(d.specialty || d.degree) && (
                                              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>{[d.specialty, d.degree].filter(Boolean).join(' · ')}</div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                                {/* Supporting doctor's profile — auto-filled on pick, editable for a new name */}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <input type="text" placeholder="Doctor speciality (optional)" value={newPatient.referrerSupportedSpecialty || ''}
                                    onChange={e => setNewPatient({...newPatient, referrerSupportedSpecialty: e.target.value})} style={{ ...inputStyle, flex: 1 }} />
                                  <input type="text" placeholder="Doctor degree (optional)" value={newPatient.referrerSupportedDegree || ''}
                                    onChange={e => setNewPatient({...newPatient, referrerSupportedDegree: e.target.value})} style={{ ...inputStyle, flex: 1 }} />
                                </div>
                              </div>
                            )}

                            <input type="text" placeholder="Address / clinic (optional)" value={newPatient.referrerAddress}
                              onChange={e => setNewPatient({...newPatient, referrerAddress: e.target.value})} style={inputStyle} />
                          </div>
                          );
                        })()}
                      </div>

                      {newBooking.patientId && (
                        <div style={{
                          background: 'linear-gradient(90deg, #e8f0fe 0%, #fff 100%)',
                          padding: '10px 14px', borderRadius: '12px',
                          borderLeft: '4px solid #0f52ba',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          marginTop: '12px', marginBottom: '12px'
                        }}>
                          <div>
                            <div style={{ fontSize: '9px', color: '#0f52ba', fontWeight: 900, background: 'white', padding: '4px 8px', borderRadius: '6px', border: '1px solid #0f52ba' }}>MATCHED</div>
                          </div>
                        </div>
                      )}

                      <div className="drawer-footer" style={{ borderTop: 'none', paddingTop: '10px', marginTop: 'auto' }}>
                        <button
                          className="gamified-btn"
                          disabled={isSupportedDoctorMissing}
                          style={{
                            width: '100%',
                            padding: isMobile ? '11px' : '12px',
                            borderRadius: '10px',
                            fontSize: isMobile ? '12px' : '13px',
                            background: (isSupportedDoctorMissing || (isNewPatientIncomplete && showBookingValidation)) ? '#94a3b8' : 'linear-gradient(90deg, #0f52ba, #00f2fe)',
                            boxShadow: (isSupportedDoctorMissing || (isNewPatientIncomplete && showBookingValidation)) ? 'none' : '0 10px 20px rgba(15, 82, 186, 0.2)',
                            cursor: isSupportedDoctorMissing ? 'not-allowed' : 'pointer',
                            opacity: isSupportedDoctorMissing ? 0.8 : 1,
                          }}
                          onClick={async () => {
                            if (isNewPatientIncomplete) {
                              setShowBookingValidation(true);
                              return;
                            }
                            if (isSupportedDoctorMissing) {
                              showNotif('warning', 'DOCTOR NAME REQUIRED', 'Please enter the supporting doctor for this referral before continuing.');
                              return;
                            }

                            // Referral source: a brand-new (free-typed) name with an
                            // optional mobile that, if present, must be 10 digits. Create
                            // it so the booking links to a real referrerId. Best-effort —
                            // if the create fails we still proceed with the free-text name.
                            if (!isReferrerContactValid) {
                              showNotif('error', 'INVALID REFERRER MOBILE', 'Referral source mobile must be exactly 10 digits, or left blank.');
                              return;
                            }
                            let resolvedReferrerId = newPatient.referrerId;
                            if (!resolvedReferrerId && newPatient.referredBy.trim() && isOnline) {
                              try {
                                const refRes = await apiClient.post('/referrers', {
                                  name: newPatient.referredBy.trim(),
                                  contact: newPatient.referrerContact || '',
                                  address: newPatient.referrerAddress || '',
                                });
                                resolvedReferrerId = refRes.data?.referrerId || refRes.data?.id || null;
                                if (resolvedReferrerId) {
                                  setNewPatient(prev => ({ ...prev, referrerId: resolvedReferrerId }));
                                  fetchReferrers('');
                                }
                              } catch (err) {
                                console.warn('[REFERRER] Inline create failed; proceeding with free-text name.', err?.message || err);
                              }
                            }

                            // Case A: NEW PATIENT (Registration).
                            // Offline-first — if the device is offline
                            // OR the request fails with no response
                            // (network drop / DNS hiccup), generate a
                            // temp ID, queue PATIENT_CREATE in the
                            // outbox, and let the booking flow
                            // continue. The SyncEngine drains the
                            // outbox on reconnect and rewrites the
                            // tempId on the linked APPOINTMENT_CREATE.
                            if (!newBooking.patientId && newPatient.name.trim()) {
                              const patientPayload = {
                                fullName: newPatient.name,
                                mobile: newPatient.mobile,
                                age: buildPatientAge(newPatient.age, newPatient.ageUnit) || '0',
                                gender: newPatient.gender,
                                village: newPatient.village,
                                district: newPatient.district,
                                address: newPatient.address,
                                sourceOfInfo: newPatient.sourceOfInfo,
                                referrerId: resolvedReferrerId,
                              };

                              // One stable key for this registration — shared by
                              // the online attempt and the outbox fallback so a
                              // lost-response retry can't create the patient twice.
                              const patientIdemKey = crypto.randomUUID();
                              if (!isOnline) {
                                const tempId = `temp-${Date.now()}`;
                                await addToOutbox('PATIENT_CREATE', { ...patientPayload, tempId }, patientIdemKey);
                                setNewBooking(prev => ({ ...prev, patientId: tempId }));
                                showNotif('info', 'QUEUED FOR SYNC', 'Patient profile saved locally. Will register on the server when connection is restored.');
                              } else {
                                try {
                                  const response = await apiClient.post('/patients', patientPayload, { headers: { 'Idempotency-Key': patientIdemKey } });
                                  const patientId = response.data.patientId;
                                  if (!patientId) throw new Error("API returned invalid patient identity");
                                  setNewBooking(prev => ({...prev, patientId}));
                                  fetchPatients('');
                                } catch (error) {
                                  console.error('Failed to auto-register patient:', error);
                                  // Network-level failure → queue to
                                  // outbox and continue. Only block
                                  // when the server actually responded
                                  // with a validation error.
                                  if (!error.response) {
                                    const tempId = `temp-${Date.now()}`;
                                    await addToOutbox('PATIENT_CREATE', { ...patientPayload, tempId }, patientIdemKey);
                                    setNewBooking(prev => ({ ...prev, patientId: tempId }));
                                    showNotif('info', 'QUEUED FOR SYNC', 'Network unavailable. Patient profile saved locally and will sync when reconnected.');
                                  } else {
                                    const serverMsg = error.response?.data?.error
                                      || error.response?.data?.message
                                      || 'Patient registration could not be completed.';
                                    showNotif('error', 'REGISTRATION FAILED', serverMsg);
                                    return;
                                  }
                                }
                              }
                            }
                            // Case B: EXISTING PATIENT (Demographic Sync).
                            // Best-effort — skip silently when offline,
                            // queue a PATIENT_UPDATE only if the user
                            // actually changed something. The booking
                            // continues regardless (a server-side
                            // demographic update is not critical for
                            // proceeding with the visit).
                            else if (newBooking.patientId && !String(newBooking.patientId).startsWith('temp-')) {
                              const updatePayload = {
                                patientId: newBooking.patientId,
                                fullName: newPatient.name,
                                mobile: newPatient.mobile,
                                age: buildPatientAge(newPatient.age, newPatient.ageUnit) || '0',
                                gender: newPatient.gender,
                                village: newPatient.village,
                                district: newPatient.district,
                                address: newPatient.address,
                                sourceOfInfo: newPatient.sourceOfInfo,
                                referrerId: resolvedReferrerId,
                              };
                              if (!isOnline) {
                                try { await addToOutbox('PATIENT_UPDATE', updatePayload); } catch (_) { /* non-blocking */ }
                              } else {
                                try {
                                  await apiClient.put(`/patients/${newBooking.patientId}`, updatePayload);
                                } catch (error) {
                                  console.error('Failed to sync existing patient demographics:', error);
                                  if (!error.response) {
                                    try { await addToOutbox('PATIENT_UPDATE', updatePayload); } catch (_) { /* non-blocking */ }
                                  }
                                }
                              }
                            }

                            // Advance to Clinical Configuration. Default the Lead
                            // Specialist to the first available doctor so step 2
                            // opens with a selection already made.
                            setNewBooking(prev => ({
                              ...prev,
                              doctor: prev.doctor || (doctors && doctors.length > 0 ? doctors[0] : '')
                            }));
                            setBookingStep(2);
                            setShowBookingValidation(false);
                          }}
                        >
                          PROCEED {'\u2192'} CLINICAL CONFIG
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isStep2 && (
              <div className="quest-step-container">
                <div style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  gap: '20px',
                  alignItems: 'stretch'
                }}>
                  {/* Left Column: Clinical Setup — wider so the modality grid,
                      service + price row and multi-service tray have room. */}
                  <div style={{ flex: 1.9, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ background: '#f8f9fa', padding: '12px 14px', borderRadius: '14px', border: '1px solid #eee' }}>
                      <div style={{ marginBottom: '6px' }}>
                        <h3 style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '1px' }}>1. Select Study Modality</h3>
                      </div>

                      <div className="modality-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '10px' }}>
                        {MODALITIES.map(m => (
                          <div key={m} className={`modality-card ${newBooking.modality === m ? 'active' : ''}`}
                            style={{ padding: '6px 2px', minHeight: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                            onClick={() => setNewBooking({...newBooking, modality: m, service: '', amount: '', referralCutValue: 0})}
                          >
                            <span className="modality-icon" style={{ fontSize: '11px', fontWeight: 900, marginBottom: '2px', color: newBooking.modality === m ? 'white' : '#0f52ba' }}>{MODALITY_ICONS[m] || 'MOD'}</span>
                            <span className="modality-name" style={{ fontSize: '8px' }}>{m}</span>
                          </div>
                        ))}
                      </div>

                      {/* Service + Price on ONE row — service takes the width,
                          price stays compact beside it. Stacks on mobile. */}
                      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', alignItems: 'flex-start' }}>
                      <div className="form-group" style={{ marginTop: '6px', position: 'relative', flex: 2, width: '100%' }}>
                        <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888', marginBottom: '4px', display: 'block' }}>2. SERVICE / PROCEDURE <span style={{ color: '#e74c3c' }}>*</span></label>
                        <input 
                          type="text" 
                          required 
                          placeholder="e.g. Chest X-Ray with Lateral" 
                          value={newBooking.service} 
                          onChange={e => {
                            const val = e.target.value;
                            setNewBooking(prev => ({ ...prev, service: val }));
                            const match = serviceRegistry.find(s => s.modality === newBooking.modality && s.serviceName.toLowerCase() === val.toLowerCase());
                            if (match) {
                              setNewBooking(prev => ({
                                ...prev,
                                amount: match.amount,
                                referralCutValue: match.referralCutValue || 0
                              }));
                            }
                          }} 
                          style={{ fontSize: '13px', padding: '8px 10px', height: '36px', borderRadius: '10px' }} 
                        />

                        {/* Top 3 most-used services for this modality, ranked by
                            how often they've actually been booked. Shown only
                            when the field is empty. If there's little/no history
                            yet, we fill up to 3 from the price registry so a new
                            centre still gets useful one-tap picks. */}
                        {newBooking.service.length === 0 && (() => {
                          const fromHistory  = mostUsedByModality[newBooking.modality] || [];
                          const fromRegistry = serviceRegistry
                            .filter(s => s.modality === newBooking.modality)
                            .map(s => s.serviceName);
                          const suggestions = [...new Set([...fromHistory, ...fromRegistry])]
                            .filter(Boolean)
                            .slice(0, 3);
                          if (suggestions.length === 0) return null;
                          return (
                            <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              <span style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8', letterSpacing: '0.5px', width: '100%' }}>MOST USED SERVICES</span>
                              {suggestions.map(name => {
                                const reg = serviceRegistry.find(s => s.modality === newBooking.modality && s.serviceName === name);
                                return (
                                  <button
                                    key={name}
                                    type="button"
                                    onClick={() => {
                                      const mod = String(newBooking.modality || '').toUpperCase();
                                      if (reg) {
                                        // We already know the price — one tap adds it
                                        // straight to the visit, so the user can keep
                                        // tapping picks to build a multi-service visit
                                        // fast. Skips exact duplicates.
                                        setNewBooking(prev => {
                                          const exists = (prev.addedServices || []).some(l =>
                                            (l.serviceName || '').toLowerCase() === name.toLowerCase() &&
                                            (l.modality || '').toUpperCase() === mod);
                                          if (exists) return prev;
                                          return {
                                            ...prev,
                                            addedServices: [
                                              ...(prev.addedServices || []),
                                              { serviceName: name, modality: mod, amount: Number(reg.amount) || 0, referralCutValue: Number(reg.referralCutValue) || 0 },
                                            ],
                                          };
                                        });
                                      } else {
                                        // No known price — fill the draft so the user
                                        // can set one, then use "Add to visit".
                                        setNewBooking(prev => ({ ...prev, service: name }));
                                      }
                                    }}
                                    title={reg ? 'Add this service to the visit' : 'Fill in to set a price'}
                                    style={{ padding: '5px 11px', borderRadius: '20px', border: '1px solid #dbeafe', background: '#f0f7ff', color: '#0f52ba', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}
                                  >
                                    {reg ? '+ ' : ''}{name}{reg ? ` · ₹${(reg.amount || 0).toLocaleString()}` : ''}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* Service Suggestions Dropdown */}
                        {newBooking.service.length > 0 && serviceRegistry.some(s =>
                          s.modality === newBooking.modality && 
                          s.serviceName.toLowerCase().includes(newBooking.service.toLowerCase()) && 
                          s.serviceName !== newBooking.service
                        ) && (
                          <div style={{ 
                            position: 'absolute', top: '100%', left: 0, right: 0, 
                            background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', 
                            boxShadow: '0 10px 30px rgba(0,0,0,0.1)', zIndex: 100, 
                            maxHeight: '160px', overflowY: 'auto', marginTop: '4px' 
                          }}>
                            <div style={{ padding: '8px 12px', background: '#f8f9fa', borderBottom: '1px solid #eee', fontSize: '9px', fontWeight: 900, color: '#0f52ba', letterSpacing: '1px' }}>
                              MATCHING SERVICES IN {newBooking.modality}
                            </div>
                            {serviceRegistry
                              .filter(s => s.modality === newBooking.modality && s.serviceName.toLowerCase().includes(newBooking.service.toLowerCase()))
                              .map(s => (
                                <div 
                                  key={s.id}
                                  onClick={() => setNewBooking({
                                    ...newBooking, 
                                    service: s.serviceName,
                                    amount: s.amount,
                                    referralCutValue: s.referralCutValue || 0
                                  })}
                                  style={{ padding: '10px 15px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', transition: 'background 0.2s' }}
                                  onMouseOver={e => e.currentTarget.style.background = '#f0f4ff'}
                                  onMouseOut={e => e.currentTarget.style.background = 'white'}
                                >
                                   <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{s.serviceName}</div>
                                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                                     <div style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 950 }}>₹{(s.amount || 0).toLocaleString()}</div>
                                     {s.referralCutValue > 0 && (
                                       <div style={{ fontSize: '9px', color: '#e67e22', fontWeight: 900, background: '#fff7ed', padding: '2px 6px', borderRadius: '4px', border: '1px solid #ffedd5' }}>
                                         INCENTIVE: ₹{(s.referralCutValue || 0).toLocaleString()}
                                       </div>
                                     )}
                                   </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>

                      <div className="form-group" style={{ marginTop: '6px', flex: 1, width: '100%', minWidth: isMobile ? 'auto' : '120px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888', marginBottom: '4px', display: 'block' }}>3. PRICE (₹)</label>
                        <input
                          type="number"
                          placeholder="e.g. 500"
                          value={newBooking.amount}
                          onChange={e => setNewBooking({...newBooking, amount: e.target.value === '' ? '' : parseFloat(e.target.value)})}
                          style={{ fontSize: '13px', padding: '8px 10px', height: '36px', borderRadius: '10px', width: '100%' }}
                        />
                        {newBooking.referralCutValue > 0 && (
                          <div style={{ fontSize: '9px', fontWeight: 800, color: '#0f52ba', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ opacity: 0.6 }}>SYSTEM REFERRAL CUT:</span>
                            <span>₹{newBooking.referralCutValue}</span>
                          </div>
                        )}
                      </div>
                      </div>

                      {/* Multi-service line-item tray.
                          The inputs above represent the "current draft" service.
                          Clicking "Add another service" pushes that draft into
                          the addedServices list and clears the inputs so the
                          user can pick a different modality + service for the
                          next line. The chips below let the user see and
                          remove what's already been added. On submit, the
                          draft (if any) is appended to the addedServices list
                          and the full array is sent as `services` to the API. */}
                      {(() => {
                        const draftHasService = !!String(newBooking.service || '').trim();
                        const lines = newBooking.addedServices || [];
                        const draftAmount = draftHasService ? (Number(newBooking.amount) || 0) : 0;
                        const draftCut    = draftHasService ? (Number(newBooking.referralCutValue) || 0) : 0;
                        const linesAmount = lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
                        const linesCut    = lines.reduce((acc, l) => acc + (Number(l.referralCutValue) || 0), 0);
                        const totalAmount = linesAmount + draftAmount;
                        const totalCut    = linesCut    + draftCut;
                        const totalCount  = lines.length + (draftHasService ? 1 : 0);

                        const addCurrentDraft = () => {
                          if (!draftHasService) return;
                          setNewBooking(prev => ({
                            ...prev,
                            addedServices: [
                              ...(prev.addedServices || []),
                              {
                                serviceName:      String(prev.service || '').trim(),
                                modality:         String(prev.modality || '').trim().toUpperCase(),
                                amount:           Number(prev.amount) || 0,
                                referralCutValue: Number(prev.referralCutValue) || 0,
                              },
                            ],
                            // Clear draft inputs so the user can add the next
                            // service with a fresh modality pick.
                            service: '',
                            amount: '',
                            referralCutValue: 0,
                          }));
                        };

                        const removeLine = (idx) => {
                          setNewBooking(prev => ({
                            ...prev,
                            addedServices: (prev.addedServices || []).filter((_, i) => i !== idx),
                          }));
                        };

                        const promoteLineToDraft = (idx) => {
                          // Lets the user edit an already-added line by
                          // pulling it back into the modality + service +
                          // amount inputs above. Saves them the
                          // "remove + re-type" round trip.
                          setNewBooking(prev => {
                            const next = (prev.addedServices || []).filter((_, i) => i !== idx);
                            const line = (prev.addedServices || [])[idx];
                            if (!line) return prev;
                            return {
                              ...prev,
                              addedServices:    next,
                              modality:         line.modality || prev.modality,
                              service:          line.serviceName,
                              amount:           line.amount,
                              referralCutValue: line.referralCutValue || 0,
                            };
                          });
                        };

                        return (
                          <>
                            {/* "Add to visit" — appears ONLY when a service is in
                                progress, and as a solid primary button so it's
                                impossible to miss. Hidden otherwise to keep the
                                area uncluttered (common services are added in one
                                tap from the "Most used" chips above). */}
                            {draftHasService && (
                              <button
                                type="button"
                                onClick={addCurrentDraft}
                                style={{
                                  marginTop: '10px',
                                  width: '100%',
                                  padding: '13px',
                                  borderRadius: '12px',
                                  border: 'none',
                                  background: 'linear-gradient(135deg, #0f52ba, #1e40af)',
                                  color: 'white',
                                  fontSize: '13px', fontWeight: 900, letterSpacing: '0.3px', fontFamily: 'inherit',
                                  cursor: 'pointer',
                                  boxShadow: '0 6px 16px rgba(15,82,186,0.30)',
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                }}
                                title="Add this service to the visit and start another"
                              >
                                <span style={{ fontSize: '17px', lineHeight: 1 }}>+</span>
                                {lines.length === 0
                                  ? 'Add this service to the visit'
                                  : 'Add another service to this visit'}
                              </button>
                            )}

                            {(lines.length > 0 || draftHasService) && (
                              <div style={{
                                marginTop: '10px',
                                padding: '12px 12px 10px',
                                background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)',
                                border: '1px solid #dbe6f7',
                                borderRadius: '12px',
                                boxShadow: '0 1px 3px rgba(15, 82, 186, 0.04)',
                              }}>
                                {/* Header — title + count chip + running total.
                                    Tighter visual hierarchy so it reads as
                                    THE tally for the whole visit, not just a
                                    quiet caption above the rows. */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                                      Services on this visit
                                    </span>
                                    <span style={{
                                      fontSize: '9px', fontWeight: 950, letterSpacing: '0.3px',
                                      color: 'white', background: '#0f52ba',
                                      padding: '2px 7px', borderRadius: '999px',
                                    }}>{totalCount}</span>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 950, color: '#0f172a', letterSpacing: '0.1px' }}>
                                      ₹{totalAmount.toLocaleString()}
                                    </div>
                                    {totalCut > 0 && (
                                      <div style={{ fontSize: '9px', fontWeight: 900, color: '#e67e22', marginTop: '1px' }}>
                                        Total cut · ₹{totalCut.toLocaleString()}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Compact lines. Each row is a single line —
                                    modality chip + service name (with referral
                                    cut as a subtle subline if any) + price +
                                    edit/remove actions. Hover lifts the row so
                                    affordance is clear. */}
                                {lines.map((line, idx) => (
                                  <div key={idx} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '7px 8px', borderRadius: '8px',
                                    background: 'white', border: '1px solid #e9eef7',
                                    marginBottom: '4px',
                                  }}>
                                    <span style={{
                                      flexShrink: 0,
                                      fontSize: '8px', fontWeight: 950, letterSpacing: '0.4px',
                                      color: '#0f52ba',
                                      background: '#eff6ff',
                                      padding: '3px 6px',
                                      borderRadius: '5px',
                                      border: '1px solid #dbeafe',
                                    }}>{line.modality || 'OT'}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {line.serviceName}
                                      </div>
                                      {Number(line.referralCutValue) > 0 && (
                                        <div style={{ fontSize: '8.5px', fontWeight: 800, color: '#e67e22', marginTop: '1px' }}>
                                          Referral cut · ₹{Number(line.referralCutValue).toLocaleString()}
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                      <div style={{ fontSize: '11px', fontWeight: 900, color: '#0f172a' }}>
                                        ₹{Number(line.amount || 0).toLocaleString()}
                                      </div>
                                    </div>
                                    <div style={{ display: 'inline-flex', gap: '4px', flexShrink: 0 }}>
                                      <button
                                        type="button"
                                        onClick={() => promoteLineToDraft(idx)}
                                        aria-label={`Edit ${line.serviceName}`}
                                        title="Edit this service"
                                        style={{
                                          width: '22px', height: '22px', borderRadius: '6px',
                                          background: 'white', border: '1px solid #e2e8f0',
                                          color: '#64748b', cursor: 'pointer', fontSize: '11px',
                                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                          fontFamily: 'inherit',
                                        }}
                                      >✎</button>
                                      <button
                                        type="button"
                                        onClick={() => removeLine(idx)}
                                        aria-label={`Remove ${line.serviceName}`}
                                        title="Remove this service"
                                        style={{
                                          width: '22px', height: '22px', borderRadius: '6px',
                                          background: 'white', border: '1px solid #e2e8f0',
                                          color: '#64748b', cursor: 'pointer', fontSize: '11px',
                                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                          fontFamily: 'inherit',
                                        }}
                                      >✕</button>
                                    </div>
                                  </div>
                                ))}

                                {/* Draft preview — slightly indented + dashed
                                    border so the user sees it as "what will
                                    be added if I commit", distinct from the
                                    saved rows. */}
                                {draftHasService && (
                                  <div style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '7px 8px', borderRadius: '8px',
                                    background: '#eff6ff', border: '1px dashed #93c5fd',
                                    marginTop: lines.length > 0 ? '2px' : '0',
                                  }}>
                                    <span style={{
                                      flexShrink: 0,
                                      fontSize: '8px', fontWeight: 950, letterSpacing: '0.4px',
                                      color: '#0f52ba',
                                      background: 'white',
                                      padding: '3px 6px',
                                      borderRadius: '5px',
                                      border: '1px solid #dbeafe',
                                    }}>{(newBooking.modality || 'OT').toUpperCase()}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {newBooking.service} <span style={{ opacity: 0.6, fontSize: '9px', fontWeight: 700 }}>· draft</span>
                                      </div>
                                      {Number(newBooking.referralCutValue) > 0 && (
                                        <div style={{ fontSize: '8.5px', fontWeight: 800, color: '#e67e22', marginTop: '1px' }}>
                                          Referral cut · ₹{Number(newBooking.referralCutValue).toLocaleString()}
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '11px', fontWeight: 900, color: '#0f172a', flexShrink: 0 }}>
                                      ₹{Number(newBooking.amount || 0).toLocaleString()}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}

                      <div className="form-group" style={{ marginTop: '8px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888', marginBottom: '4px', display: 'block' }}>4. NOTES (OPTIONAL)</label>
                        <textarea rows="1" placeholder="Clinical notes..." style={{ width: '100%', padding: '8px 10px', borderRadius: '10px', border: '1px solid #dee2e6', fontSize: '12px', resize: 'vertical' }} value={newBooking.notes} onChange={e => setNewBooking({...newBooking, notes: e.target.value})} />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Execution Schedule & Specialist — narrower. */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ background: 'white', padding: '12px 14px', borderRadius: '14px', border: '2px dashed #dde5f5' }}>
                      <div style={{ marginBottom: '6px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888', display: 'block', marginBottom: '4px' }}>5. MISSION DATE <span style={{ color: '#e74c3c' }}>*</span></label>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          {[-2, -1, 0, 1, 2, 3].map(offset => {
                            const d = new Date();
                            d.setDate(d.getDate() + offset);
                            const dateStr = d.toLocaleDateString('en-CA');
                            let label = '';
                            if (offset === 0) label = 'TODAY';
                            else if (offset === 1) label = 'TOMORROW';
                            else if (offset === -1) label = 'YESTERDAY';
                            else if (offset === -2) label = 'DAY BEFORE';
                            else label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }).toUpperCase();
                            
                            const isActive = newBooking.date === dateStr;
                            return (
                              <button
                                key={dateStr}
                                onClick={() => setNewBooking({...newBooking, date: dateStr})}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  fontSize: '9px',
                                  fontWeight: 900,
                                  border: '1px solid',
                                  borderColor: isActive ? '#0f52ba' : '#e2e8f0',
                                  background: isActive ? '#0f52ba' : 'white',
                                  color: isActive ? 'white' : '#64748b',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  boxShadow: isActive ? '0 4px 12px rgba(15, 82, 186, 0.2)' : 'none'
                                }}
                              >
                                {label}
                              </button>
                            );
                          })}
                          <div style={{ position: 'relative' }}>
                            <button
                              onClick={() => document.getElementById('custom-date-trigger').showPicker()}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '9px',
                                fontWeight: 900,
                                border: '1px solid #e2e8f0',
                                background: 'white',
                                color: '#64748b',
                                cursor: 'pointer'
                              }}
                            >
                              CUSTOM...
                            </button>
                            <input 
                              id="custom-date-trigger"
                              type="date" 
                              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', top: 0, left: 0, width: 1, height: 1 }}
                              value={newBooking.date}
                              onChange={e => setNewBooking({...newBooking, date: e.target.value})}
                            />
                          </div>
                        </div>
                        
                        {/* Show specific custom date if selected and not in quick chips */}
                        {![-2, -1, 0, 1, 2, 3].some(offset => {
                          const d = new Date();
                          d.setDate(d.getDate() + offset);
                          return d.toLocaleDateString('en-CA') === newBooking.date;
                        }) && (
                          <div style={{ 
                            display: 'flex', alignItems: 'center', gap: '6px', 
                            background: '#f8fafc', padding: '4px 8px', borderRadius: '6px', 
                            border: '1px solid #e2e8f0', width: 'fit-content'
                          }}>
                            <span style={{ fontSize: '8px', fontWeight: 950, color: '#0f52ba' }}>SELECTED: {newBooking.date}</span>
                            <button 
                              onClick={() => setNewBooking({...newBooking, date: getTodayString()})}
                              style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '9px', fontWeight: 900, cursor: 'pointer' }}
                            >RESET</button>
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: '8px', marginBottom: '4px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888', display: 'block', marginBottom: '4px' }}>6. ASSIGN LEAD SPECIALIST <span style={{ color: '#e74c3c' }}>*</span></label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                          {doctors.map((d, idx) => (
                            <div key={`${d}_${idx}`} className={`modality-card ${newBooking.doctor === d ? 'active' : ''}`}
                              style={{ padding: '6px', position: 'relative', flexDirection: 'row', justifyContent: 'flex-start', gap: '6px', minHeight: 'auto' }}
                              onClick={() => setNewBooking({...newBooking, doctor: d})}
                            >
                              <div style={{
                                width: '20px', height: '20px', borderRadius: '6px',
                                background: newBooking.doctor === d ? 'rgba(255,255,255,0.2)' : '#e8f0fe',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 900, fontSize: '9px', color: newBooking.doctor === d ? 'white' : '#0f52ba', flexShrink: 0,
                              }}>
                                {d.includes('.') ? d.split('. ')[1]?.charAt(0) || d.charAt(0) : d.charAt(0)}
                              </div>
                              <div style={{ textAlign: 'left' }}>
                                <div style={{ fontWeight: 800, fontSize: '10px', color: newBooking.doctor === d ? 'white' : '#1a1a2e' }}>{d}</div>
                              </div>
                              {newBooking.doctor === d && <span style={{ position: 'absolute', top: '4px', right: '4px', fontSize: '8px', fontWeight: 950, color: 'white' }}>SELECTED</span>}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ── 7. Appointment Priority — sits below the specialist.
                          Auto-set to Routine; each level fills with its own
                          colour when chosen so the urgency reads instantly, and
                          the default carries an "AUTO" tag so the user can see it
                          was pre-selected for them. ── */}
                      <div style={{ marginTop: '10px', marginBottom: '4px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888', display: 'block', marginBottom: '5px' }}>
                          7. APPOINTMENT PRIORITY
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                          {[
                            { id: 'STAT',    label: 'Emergency', desc: 'See immediately', color: '#dc2626' },
                            { id: 'URGENT',  label: 'Urgent',    desc: 'Same day',        color: '#d97706' },
                            { id: 'ROUTINE', label: 'Routine',   desc: 'Standard',        color: '#16a34a' },
                          ].map(opt => {
                            const active = (newBooking.priority || 'ROUTINE') === opt.id;
                            const isDefault = opt.id === 'ROUTINE';
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setNewBooking({ ...newBooking, priority: opt.id })}
                                style={{
                                  position: 'relative',
                                  padding: '10px 6px', borderRadius: '12px', cursor: 'pointer',
                                  border: `2px solid ${active ? opt.color : '#e5e7eb'}`,
                                  background: active ? opt.color : 'white',
                                  color: active ? 'white' : opt.color,
                                  fontWeight: 900, fontSize: '11px',
                                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                                  boxShadow: active ? `0 6px 16px ${opt.color}40` : 'none',
                                  transition: 'all 0.15s',
                                }}
                              >
                                <span style={{ letterSpacing: '0.4px' }}>{opt.label}</span>
                                <span style={{ fontSize: '8px', fontWeight: 700, opacity: 0.85 }}>{opt.desc}</span>
                                {active && isDefault && (
                                  <span style={{ position: 'absolute', top: '-7px', right: '-4px', background: '#0f172a', color: 'white', fontSize: '7px', fontWeight: 900, padding: '2px 6px', borderRadius: '8px', letterSpacing: '0.3px' }}>AUTO</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 700, marginTop: '5px' }}>
                          Automatically set to Routine. Choose Urgent or Emergency only if the case needs faster handling.
                        </div>
                      </div>
                    </div>

                    {(() => {
                      // Multi-service summary. Lists every service line
                      // (including the live draft) so the receptionist
                      // can verify the whole visit before deploying it.
                      // Totals at the bottom roll up bill + referral cut.
                      // Single-service visits still read naturally - one
                      // row plus the same totals row.
                      const _draftHasService = !!String(newBooking.service || '').trim();
                      const _draftAmount = _draftHasService ? (Number(newBooking.amount) || 0) : 0;
                      const _draftCut    = _draftHasService ? (Number(newBooking.referralCutValue) || 0) : 0;
                      const _linesAmount = (newBooking.addedServices || []).reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
                      const _linesCut    = (newBooking.addedServices || []).reduce((acc, l) => acc + (Number(l.referralCutValue) || 0), 0);
                      const _totalAmount = _linesAmount + _draftAmount;
                      const _totalCut    = _linesCut    + _draftCut;
                      const _summaryLines = [
                        ...(newBooking.addedServices || []),
                        ...(_draftHasService ? [{
                          serviceName:      String(newBooking.service || '').trim(),
                          modality:         String(newBooking.modality || '').trim().toUpperCase(),
                          amount:           _draftAmount,
                          referralCutValue: _draftCut,
                        }] : []),
                      ];
                      return (
                        <div style={{
                          background: '#f0f4ff', padding: '12px 14px', borderRadius: '12px',
                          border: '1px solid #dde5f5', marginTop: '0px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ fontSize: '8px', fontWeight: 950, color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                              Final Mission Briefing Summary
                            </div>
                            {_summaryLines.length > 1 && (
                              <span style={{
                                fontSize: '8px', fontWeight: 950, letterSpacing: '0.3px',
                                color: 'white', background: '#0f52ba',
                                padding: '2px 7px', borderRadius: '999px',
                              }}>{_summaryLines.length} services</span>
                            )}
                          </div>

                          {/* Patient + Specialist + Date + Priority. Sets
                              the who / when context above the bill block. */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                            <div>
                              <span style={{ fontSize: '8px', color: '#888', fontWeight: 700, letterSpacing: '0.4px' }}>PATIENT</span>
                              <div style={{ fontWeight: 800, fontSize: '10.5px', color: '#1a1a2e' }}>
                                {newPatient.name || patients.find(p => p.id === newBooking.patientId)?.name || '-'}
                              </div>
                            </div>
                            <div>
                              <span style={{ fontSize: '8px', color: '#888', fontWeight: 700, letterSpacing: '0.4px' }}>SPECIALIST</span>
                              <div style={{ fontWeight: 800, fontSize: '10.5px', color: '#1a1a2e' }}>
                                {newBooking.doctor || 'Unassigned'}
                              </div>
                            </div>
                            <div>
                              <span style={{ fontSize: '8px', color: '#888', fontWeight: 700, letterSpacing: '0.4px' }}>SCHEDULED DATE</span>
                              <div style={{ fontWeight: 800, fontSize: '10.5px', color: '#0f52ba' }}>
                                {newBooking.date}
                              </div>
                            </div>
                            <div>
                              <span style={{ fontSize: '8px', color: '#888', fontWeight: 700, letterSpacing: '0.4px' }}>PRIORITY</span>
                              <div style={{
                                fontWeight: 900, fontSize: '10.5px',
                                color: newBooking.priority === 'STAT' ? '#dc2626'
                                     : newBooking.priority === 'URGENT' ? '#d97706'
                                     : '#1a1a2e',
                              }}>
                                {newBooking.priority || 'ROUTINE'}
                              </div>
                            </div>
                          </div>

                          {/* Services block - one row per line, then a
                              gradient total row that rolls up the bill
                              and the referral cut. */}
                          <div>
                            <div style={{ fontSize: '8px', color: '#888', fontWeight: 700, letterSpacing: '0.4px', marginBottom: '6px' }}>
                              SERVICES & BILLING
                            </div>
                            {_summaryLines.length === 0 ? (
                              <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic', padding: '6px 0' }}>
                                No services added yet.
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {_summaryLines.map((line, idx) => (
                                  <div key={idx} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '6px 8px', borderRadius: '8px',
                                    background: 'white', border: '1px solid #e9eef7',
                                  }}>
                                    <span style={{
                                      flexShrink: 0,
                                      fontSize: '8px', fontWeight: 950, letterSpacing: '0.4px',
                                      color: '#0f52ba',
                                      background: '#eff6ff',
                                      padding: '2px 6px', borderRadius: '5px',
                                      border: '1px solid #dbeafe',
                                    }}>{line.modality || 'OT'}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {line.serviceName}
                                      </div>
                                      {Number(line.referralCutValue) > 0 && (
                                        <div style={{ fontSize: '8px', fontWeight: 800, color: '#e67e22', marginTop: '1px' }}>
                                          {`Referral cut · ₹${Number(line.referralCutValue).toLocaleString()}`}
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba', flexShrink: 0 }}>
                                      {`₹${Number(line.amount || 0).toLocaleString()}`}
                                    </div>
                                  </div>
                                ))}

                                {/* Totals row - gradient so it visually
                                    closes the bill, not just another
                                    service row. Total referral cut sits
                                    under the total bill in a gold tint. */}
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: '10px',
                                  padding: '8px 10px', borderRadius: '8px',
                                  background: 'linear-gradient(135deg, #0f52ba 0%, #1e3a8a 100%)',
                                  color: 'white',
                                  marginTop: '2px',
                                }}>
                                  <div style={{ flex: 1, fontSize: '9px', fontWeight: 950, letterSpacing: '0.6px', textTransform: 'uppercase', opacity: 0.85 }}>
                                    Total bill
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 950, letterSpacing: '0.1px' }}>
                                      {`₹${_totalAmount.toLocaleString()}`}
                                    </div>
                                    {_totalCut > 0 && (
                                      <div style={{ fontSize: '8.5px', fontWeight: 900, color: '#fcd34d', marginTop: '1px', letterSpacing: '0.3px' }}>
                                        {`Total referral cut · ₹${_totalCut.toLocaleString()}`}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="drawer-footer" style={{
                      marginTop: '0px',
                      paddingTop: '10px',
                      gap: isMobile ? '8px' : undefined,
                    }}>
                      <button
                        className="btn-logout"
                        style={{
                          padding: isMobile ? '10px 12px' : '10px 16px',
                          borderRadius: '10px',
                          fontWeight: 800,
                          fontSize: isMobile ? '11px' : '12px',
                          whiteSpace: 'nowrap',
                        }}
                        onClick={() => setBookingStep(1)}
                      >{'\u2190'} Back</button>
                      <button
                        className="gamified-btn"
                        style={{
                          flex: 1,
                          padding: isMobile ? '10px 12px' : '10px 16px',
                          borderRadius: '10px',
                          fontSize: isMobile ? '11px' : '12px',
                          fontWeight: 950,
                          letterSpacing: isMobile ? '0.3px' : 'normal',
                          background: 'linear-gradient(90deg, #0f52ba, #00f2fe)',
                          color: 'white', border: 'none', cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(15, 82, 186, 0.2)',
                          opacity: (!newBooking.patientId || (!newBooking.service && (newBooking.addedServices || []).length === 0) || !newBooking.doctor) ? 0.7 : 1,
                          whiteSpace: 'nowrap',
                        }}
                        disabled={
                          !newBooking.patientId ||
                          // Either a draft service is in the inputs OR there's
                          // at least one committed line in the visit tray.
                          (!newBooking.service && (newBooking.addedServices || []).length === 0) ||
                          !newBooking.doctor
                        }
                        onClick={handleBookAppointment}
                      >
                        {isMobile ? '🚀 BOOK' : '🚀 DEPLOY MISSION'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );

    if (isAddPatientOpen) return (
      <div className="drawer-overlay">
        <div className="drawer-content" onClick={e => e.stopPropagation()}>
          <div className="drawer-header">
            <h2>Add New Patient</h2>
            <button className="btn-close" onClick={() => setIsAddPatientOpen(false)}>✕</button>
          </div>
          <div className="drawer-body">
            <form onSubmit={handleAddPatient}>
              <div className="form-group"><label>Full Name</label><input type="text" required value={newPatient.name} onChange={e => setNewPatient({...newPatient, name: e.target.value})} /></div>
              <div className="form-group"><label>Mobile Number</label><input type="tel" required value={newPatient.mobile} onChange={e => setNewPatient({...newPatient, mobile: e.target.value})} /></div>
              {duplicatePatient && (
                <div className="duplicate-info" style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '15px', borderRadius: '12px', marginTop: '10px' }}>
                  <h4 style={{ color: '#b91c1c', margin: '0 0 5px 0', fontSize: '14px', fontWeight: 900 }}>DUPLICATE FOUND</h4>
                  <p>Patient <strong>{duplicatePatient.name}</strong> exists with this mobile.</p>
                  <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                    <button type="button" className="btn-primary" style={{ fontSize: '12px' }} onClick={() => { setNewBooking({...newBooking, patientId: duplicatePatient.id}); setIsAddPatientOpen(false); }}>Use Existing</button>
                    <button type="button" className="btn-logout" style={{ fontSize: '12px' }} onClick={() => setDuplicatePatient(null)}>Continue New</button>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <div className="form-group" style={{ flex: 1 }}><label>Age / DOB</label><input type="text" placeholder="e.g. 25" value={newPatient.age} onChange={e => setNewPatient({...newPatient, age: e.target.value})} /></div>
                <div className="form-group" style={{ flex: 1 }}><label>Gender</label><select value={newPatient.gender} onChange={e => setNewPatient({...newPatient, gender: e.target.value})}><option>Male</option><option>Female</option><option>Other</option></select></div>
              </div>
              <div className="form-group"><label>Address</label><input type="text" value={newPatient.address} onChange={e => setNewPatient({...newPatient, address: e.target.value})} /></div>
              <div className="form-group"><label>Referred By</label><input type="text" value={newPatient.referredBy} onChange={e => setNewPatient({...newPatient, referredBy: e.target.value})} /></div>
              <div className="drawer-footer">
                <button type="button" className="btn-logout" onClick={() => setIsAddPatientOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add Patient</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );

    return null;
  };

  // ============================================================
  //  EDIT APPOINTMENT MODAL
  // ============================================================
  
  // PREMIUM EDIT APPOINTMENT DRAWER
  const renderEditDrawer = () => {
    if (!isEditingOpen || !editingAppointment) return null;

    return (
      <div
        onClick={() => { setIsEditingOpen(false); setEditServices([]); }}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backdropFilter: 'blur(4px)', background: 'rgba(10, 22, 40, 0.45)', zIndex: 10000 }}
      >
        <div 
          style={{ position: 'absolute', right: 0, top: 0, height: '100%', padding: 0, width: '560px', maxWidth: '100%', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(10,22,40,0.18)' }} 
          onClick={e => e.stopPropagation()}
        >
          {/* Tactical Header */}
          <div style={{ padding:'22px 24px 20px', background:`linear-gradient(135deg,#0a1628 0%,#1e3a5f 100%)`, position:'relative', overflow:'hidden', flexShrink:0 }}>
            <div style={{ position:'absolute',top:0,left:0,right:0,height:'3px',background:`linear-gradient(90deg,transparent,#d4af37 30%,#ffd700 50%,#d4af37 70%,transparent)` }} />
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ display:'inline-block', padding:'4px 8px', background:'rgba(255,255,255,0.1)', borderRadius:'6px', fontSize:'9px', fontWeight:950, color:'#d4af37', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'10px' }}>
                  ID: {editingAppointment.id || editingAppointment.displayId || editingAppointment.appointmentId}
                </div>
                <h3 style={{ margin:0,fontSize:'18px',fontWeight:800,color:'white',letterSpacing:'-0.2px' }}>
                  Modify Appointment
                </h3>
                <p style={{ margin:'5px 0 0',fontSize:'12px',color:'rgba(255,255,255,0.5)',fontWeight:500 }}>
                  Update clinical or financial details below.
                </p>
              </div>
              <button
                onClick={() => { setIsEditingOpen(false); setEditServices([]); }}
                style={{ width:'32px',height:'32px',borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.15)',color:'white',cursor:'pointer',fontSize:'16px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}
              >
                &times;
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '30px 40px 40px 40px' }}>
            <form onSubmit={(e) => { e.preventDefault(); handleEditAppointment(); }}>
              
              <div style={{ marginBottom: '25px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>Patient Details</h4>
                
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Patient Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="text" required value={editingAppointment.patientName || ''} onChange={e => setEditingAppointment({...editingAppointment, patientName: e.target.value})} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '13px', fontWeight: 700, padding: '12px 16px', outline: 'none', color: '#1e293b' }} />
                </div>
                
                <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Mobile <span style={{ color: '#94a3b8', fontWeight: 600 }}>(optional)</span></label>
                    <input type="text" value={editingAppointment.mobile || ''} onChange={e => setEditingAppointment({...editingAppointment, mobile: e.target.value})} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '13px', fontWeight: 700, padding: '12px 16px', outline: 'none', color: '#1e293b' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Age <span style={{ color: '#ef4444' }}>*</span></label>
                    <input type="text" required value={editingAppointment.patientAge || ''} onChange={e => setEditingAppointment({...editingAppointment, patientAge: e.target.value})} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '13px', fontWeight: 700, padding: '12px 16px', outline: 'none', color: '#1e293b' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Gender <span style={{ color: '#ef4444' }}>*</span></label>
                    <select required value={editingAppointment.patientGender || ''} onChange={e => setEditingAppointment({...editingAppointment, patientGender: e.target.value})} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '13px', fontWeight: 700, padding: '12px 16px', outline: 'none', color: '#1e293b', height: '44px' }}>
                      <option value="" disabled>Select</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '25px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>Service Details</h4>
                
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Scheduled Date <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="date" required value={editingAppointment.dateTime ? editingAppointment.dateTime.split('T')[0] : (editingAppointment.date || '')} onChange={e => { const newDate = e.target.value; let currentTime = '12:00:00'; if (editingAppointment.dateTime && editingAppointment.dateTime.includes('T')) { const timePart = editingAppointment.dateTime.split('T')[1]; currentTime = timePart.replace('Z', ''); } setEditingAppointment({...editingAppointment, dateTime: `${newDate}T${currentTime}`, date: newDate}); }} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '13px', fontWeight: 700, padding: '12px 16px', outline: 'none', color: '#1e293b' }} />
                </div>

                <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Modality <span style={{ color: '#ef4444' }}>*</span></label>
                    <select required value={editingAppointment.modality || 'X-RAY'} onChange={e => setEditingAppointment({...editingAppointment, modality: e.target.value, service: '', amount: 0, referralCutValue: 0})} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '13px', fontWeight: 700, padding: '12px 16px', outline: 'none', color: '#1e293b', height: '44px' }}>
                      {MODALITIES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 2, position: 'relative' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Service / Procedure <span style={{ color: '#ef4444' }}>*</span></label>
                    <input type="text" required placeholder="e.g. Chest X-Ray" value={editingAppointment.service || ''} onChange={e => { const val = e.target.value; setEditingAppointment(prev => ({ ...prev, service: val })); const match = serviceRegistry.find(s => s.modality === editingAppointment.modality && s.serviceName.toLowerCase() === val.toLowerCase()); if (match) { setEditingAppointment(prev => ({...prev, amount: match.amount, referralCutValue: match.referralCutValue || 0})); } }} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '13px', fontWeight: 700, padding: '12px 16px', outline: 'none', color: '#1e293b' }} />
                    
                    {/* Auto-suggest dropdown */}
                    {editingAppointment.service?.length > 0 && serviceRegistry.some(s => s.modality === editingAppointment.modality && s.serviceName.toLowerCase().includes(editingAppointment.service.toLowerCase()) && s.serviceName !== editingAppointment.service) && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '150px', overflowY: 'auto', marginTop: '4px' }}>
                        {serviceRegistry.filter(s => s.modality === editingAppointment.modality && s.serviceName.toLowerCase().includes(editingAppointment.service.toLowerCase())).map(s => (
                          <div key={s.id} onClick={() => setEditingAppointment({...editingAppointment, service: s.serviceName, amount: s.amount, referralCutValue: s.referralCutValue || 0})} style={{ padding: '10px 15px', borderBottom: '1px solid #f8fafc', cursor: 'pointer' }} onMouseOver={e => e.currentTarget.style.background = '#f0f4ff'} onMouseOut={e => e.currentTarget.style.background = 'white'}>
                            <div style={{ fontSize: '12px', fontWeight: 800 }}>{s.serviceName}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Service Amount (₹) <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="number" required value={editingAppointment.amount || 0} onChange={e => setEditingAppointment({...editingAppointment, amount: parseFloat(e.target.value) || 0})} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '13px', fontWeight: 700, padding: '12px 16px', outline: 'none', color: '#1e293b' }} />
                  {editingAppointment.referralCutValue > 0 && (
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#0f52ba', marginTop: '6px' }}>
                      <span style={{ opacity: 0.6 }}>SYSTEM REFERRAL CUT: </span>₹{(editingAppointment.referralCutValue || 0).toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Multi-service tray for edits. Mirrors the create-flow
                    tray but tracks each line's existing AppointmentService
                    id so the server's reconciler keeps that row in place
                    (preserving its status, TAT timestamps, and any
                    attached report / study / commission). Removing a line
                    with an id silently soft-deletes it on save; lines
                    without an id are inserted. The inputs above keep
                    modelling the "primary" service line (index 0) so
                    today's single-modality UX stays familiar. */}
                {(() => {
                  const draftHasService = !!String(editingAppointment.service || '').trim();
                  const lines = editServices || [];
                  const totalAmount =
                    lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0) +
                    (draftHasService ? (Number(editingAppointment.amount) || 0) : 0);

                  const addCurrentDraft = () => {
                    if (!draftHasService) return;
                    setEditServices(prev => [
                      ...prev,
                      {
                        // No id — new line. Server inserts on reconcile.
                        id:               null,
                        serviceName:      String(editingAppointment.service || '').trim(),
                        modality:         String(editingAppointment.modality || '').trim().toUpperCase(),
                        amount:           Number(editingAppointment.amount) || 0,
                        referralCutValue: Number(editingAppointment.referralCutValue) || 0,
                      },
                    ]);
                    // Clear draft so the user can compose the next line.
                    // Keep the modality picker on its current value — the
                    // common case is the same scan family for a multi-line
                    // visit (e.g. both knees, both shoulders).
                    setEditingAppointment(prev => ({
                      ...prev,
                      service: '',
                      amount: 0,
                      referralCutValue: 0,
                    }));
                  };

                  const removeLine = (idx) => {
                    setEditServices(prev => prev.filter((_, i) => i !== idx));
                  };

                  // Remove the "primary" line (the one in the inputs above). If
                  // other services are queued, the next one is promoted into the
                  // inputs so there's always a primary; otherwise the draft is
                  // cleared so the user can type a fresh service in its place.
                  const removePrimary = () => {
                    const list = editServices || [];
                    if (list.length > 0) {
                      const [next, ...remaining] = list;
                      setEditingAppointment(p => ({
                        ...p,
                        modality:         next.modality || p.modality,
                        service:          next.serviceName || '',
                        amount:           Number(next.amount) || 0,
                        referralCutValue: Number(next.referralCutValue) || 0,
                        _primaryServiceId: next.id || null,
                      }));
                      setEditServices(remaining);
                    } else {
                      setEditingAppointment(p => ({ ...p, service: '', amount: 0, referralCutValue: 0, _primaryServiceId: null }));
                    }
                  };

                  return (
                    <>
                      {(lines.length > 0 || draftHasService) && (
                        <div style={{
                          marginTop: '8px',
                          padding: '10px 12px',
                          background: '#f8fafc',
                          border: '1px dashed #cbd5e1',
                          borderRadius: '10px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: lines.length > 0 ? '8px' : '0' }}>
                            <span style={{ fontSize: '9px', fontWeight: 900, color: '#0f52ba', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                              Services on this visit
                            </span>
                            <span style={{ fontSize: '10px', fontWeight: 800, color: '#0f172a' }}>
                              {lines.length + (draftHasService ? 1 : 0)} item{lines.length + (draftHasService ? 1 : 0) === 1 ? '' : 's'} · ₹{totalAmount.toLocaleString()}
                            </span>
                          </div>

                          {/* Already-committed lines (primary lives in the
                              inputs above, so it isn't repeated here). */}
                          {lines.map((line, idx) => {
                            const isExisting = !!line.id;
                            const isReported = ['REPORTED', 'DELIVERED'].includes((line.status || '').toUpperCase());
                            return (
                              <div key={line.id || `new-${idx}`} style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '7px 9px', borderRadius: '8px',
                                background: 'white', marginBottom: '4px',
                                border: '1px solid #e2e8f0',
                              }}>
                                <span style={{
                                  fontSize: '8px', fontWeight: 900, letterSpacing: '0.4px',
                                  color: '#0f52ba', background: '#eff6ff',
                                  padding: '2px 6px', borderRadius: '4px',
                                }}>{line.modality || 'OT'}</span>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={line.serviceName}>
                                  {line.serviceName}
                                </span>
                                {isExisting && (
                                  <span title="Existing service line — will be updated, not recreated" style={{
                                    fontSize: '8px', fontWeight: 900,
                                    color: '#047857', background: '#d1fae5',
                                    padding: '2px 6px', borderRadius: '999px',
                                    border: '1px solid #a7f3d0',
                                  }}>SAVED</span>
                                )}
                                <span style={{ fontSize: '10px', fontWeight: 800, color: '#0f172a' }}>
                                  ₹{Number(line.amount || 0).toLocaleString()}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeLine(idx)}
                                  aria-label={`Remove ${line.serviceName}`}
                                  title={isReported ? 'This service already has a report — removing it will soft-delete the line on save.' : 'Remove this service'}
                                  style={{
                                    width: '22px', height: '22px', borderRadius: '6px',
                                    background: '#fff1f2', border: '1px solid #fecdd3',
                                    color: '#e11d48', cursor: 'pointer', fontSize: '12px', fontWeight: 900,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  }}
                                >✕</button>
                              </div>
                            );
                          })}

                          {/* Primary draft preview — the inputs above. */}
                          {draftHasService && (
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: '8px',
                              padding: '7px 9px', borderRadius: '8px',
                              background: '#eff6ff', border: '1px dashed #93c5fd',
                            }}>
                              <span style={{
                                fontSize: '8px', fontWeight: 900, letterSpacing: '0.4px',
                                color: '#0f52ba', background: 'white',
                                padding: '2px 6px', borderRadius: '4px',
                              }}>{(editingAppointment.modality || 'OT').toUpperCase()}</span>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {editingAppointment.service} <span style={{ opacity: 0.6, fontSize: '9px', fontWeight: 600 }}>· primary</span>
                              </span>
                              <span style={{ fontSize: '10px', fontWeight: 800, color: '#0f172a' }}>
                                ₹{Number(editingAppointment.amount || 0).toLocaleString()}
                              </span>
                              <button
                                type="button"
                                onClick={removePrimary}
                                aria-label={`Remove ${editingAppointment.service}`}
                                title="Remove this service"
                                style={{
                                  width: '22px', height: '22px', borderRadius: '6px',
                                  background: '#fff1f2', border: '1px solid #fecdd3',
                                  color: '#e11d48', cursor: 'pointer', fontSize: '12px', fontWeight: 900,
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                }}
                              >✕</button>
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={addCurrentDraft}
                        disabled={!draftHasService}
                        style={{
                          marginTop: '8px',
                          width: '100%',
                          padding: '9px 10px',
                          borderRadius: '10px',
                          border: '1px dashed #93c5fd',
                          background: draftHasService ? '#eff6ff' : '#f8fafc',
                          color: draftHasService ? '#1d4ed8' : '#94a3b8',
                          cursor: draftHasService ? 'pointer' : 'not-allowed',
                          fontSize: '11px',
                          fontWeight: 800,
                          letterSpacing: '0.3px',
                          fontFamily: 'inherit',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        }}
                        title={draftHasService ? 'Add the current service line and start another' : 'Fill in a service first'}
                      >
                        <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span>
                        Add another service to this visit
                      </button>
                    </>
                  );
                })()}
              </div>

              <div style={{ marginBottom: '25px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>Routing & Notes</h4>
                
                <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Lead Specialist <span style={{ color: '#ef4444' }}>*</span></label>
                    <select required value={editingAppointment.doctor || ''} onChange={e => setEditingAppointment({...editingAppointment, doctor: e.target.value})} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '13px', fontWeight: 700, padding: '12px 16px', outline: 'none', color: '#1e293b', height: '44px' }}>
                      <option value="">Select Specialist...</option>
                      {doctors.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Referred By</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="text" placeholder="Search referrers..." value={editingAppointment.referredBy || ''} onChange={e => setEditingAppointment({...editingAppointment, referredBy: e.target.value})} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '13px', fontWeight: 700, padding: '12px 16px', outline: 'none', color: '#1e293b' }} />
                    </div>
                    {/* Fast typeahead — pick a known referrer to auto-fill their
                        profile (type, contact, supporting doctor) instead of retyping. */}
                    {(() => {
                      const q = (editingAppointment.referredBy || '').trim().toLowerCase();
                      if (q.length < 1) return null;
                      const matches = (referrers || [])
                        .filter(r => (r.name || '').toLowerCase().includes(q) && (r.name || '').toLowerCase() !== q)
                        .slice(0, 6);
                      if (matches.length === 0) return null;
                      return (
                        <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                          <span style={{ fontSize: '8px', fontWeight: 900, color: '#b45309', letterSpacing: '0.5px' }}>DID YOU MEAN</span>
                          {matches.map(r => (
                            <button
                              key={r.referrerId || r.id || r.name}
                              type="button"
                              onClick={() => setEditingAppointment(prev => ({
                                ...prev,
                                referredBy: r.name,
                                referrerContact: r.contact || prev.referrerContact || '',
                                referrerIsDoctor: r.isDoctor !== false,
                                referrerEmail: r.email || '',
                                referrerSpecialty: r.specialty || '',
                                referrerDegree: r.degree || '',
                                referrerSupportedByDoctor: r.isDoctor === false ? (r.supportedByDoctor || prev.referrerSupportedByDoctor || '') : '',
                              }))}
                              style={{ padding: '5px 11px', borderRadius: '20px', border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}
                            >
                              {r.name}{r.contact ? ` · ${r.contact}` : ''}{r.isDoctor === false ? ' · agent' : ''}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Referral type — same payee-first choice as booking. */}
                {editingAppointment.referredBy?.trim() && (() => {
                  const refIsDoctor = editingAppointment.referrerIsDoctor !== false;
                  const inp = { width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '13px', fontWeight: 700, padding: '10px 14px', outline: 'none', color: '#1e293b', boxSizing: 'border-box' };
                  return (
                    <div style={{ marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569' }}>Who is the referral?</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {[{ k: true, icon: '👨‍⚕️', label: 'Doctor' }, { k: false, icon: '👤', label: 'Other person' }].map(opt => {
                          const active = refIsDoctor === opt.k;
                          return (
                            <button key={String(opt.k)} type="button"
                              onClick={() => setEditingAppointment({ ...editingAppointment, referrerIsDoctor: opt.k })}
                              style={{ flex: 1, padding: '12px 10px', borderRadius: '12px', border: `1.5px solid ${active ? '#0f52ba' : '#e2e8f0'}`, background: active ? '#eff6ff' : 'white', color: active ? '#0f52ba' : '#64748b', fontSize: '12px', fontWeight: 800, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '18px' }}>{opt.icon}</span>{opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="tel" placeholder="Mobile (optional)" value={editingAppointment.referrerContact || ''}
                          onChange={e => setEditingAppointment({ ...editingAppointment, referrerContact: e.target.value.replace(/\D/g, '').slice(0, 10) })} style={{ ...inp, flex: 1 }} />
                        <input type="email" placeholder="Email (optional)" value={editingAppointment.referrerEmail || ''}
                          onChange={e => setEditingAppointment({ ...editingAppointment, referrerEmail: e.target.value })} style={{ ...inp, flex: 1 }} />
                      </div>
                      {refIsDoctor ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input type="text" placeholder="Speciality (optional)" value={editingAppointment.referrerSpecialty || ''}
                            onChange={e => setEditingAppointment({ ...editingAppointment, referrerSpecialty: e.target.value })} style={{ ...inp, flex: 1 }} />
                          <input type="text" placeholder="Degree (optional)" value={editingAppointment.referrerDegree || ''}
                            onChange={e => setEditingAppointment({ ...editingAppointment, referrerDegree: e.target.value })} style={{ ...inp, flex: 1 }} />
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '12px', border: '1.5px dashed #bfdbfe', background: '#f5f9ff' }}>
                          <div style={{ fontSize: '9px', fontWeight: 900, color: '#0f52ba', letterSpacing: '0.6px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span>👨‍⚕️</span> Referring doctor
                          </div>
                          <div style={{ position: 'relative' }}>
                            <input type="text" placeholder="Supported by doctor — search or type name" value={editingAppointment.referrerSupportedByDoctor || ''}
                              onChange={e => setEditingAppointment({ ...editingAppointment, referrerSupportedByDoctor: e.target.value })} style={inp} />
                            {(() => {
                              const q = String(editingAppointment.referrerSupportedByDoctor || '').trim().toLowerCase();
                              if (q.length < 1) return null;
                              const matches = (referrers || [])
                                .filter(r => r.isDoctor !== false && (r.name || '').toLowerCase().includes(q) && (r.name || '').toLowerCase() !== q)
                                .slice(0, 5);
                              if (matches.length === 0) return null;
                              return (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 6px 18px rgba(15,23,42,0.12)', marginTop: '4px', maxHeight: '170px', overflowY: 'auto' }}>
                                  {matches.map(d => (
                                    <div key={d.referrerId || d.name}
                                      onMouseDown={() => setEditingAppointment({ ...editingAppointment, referrerSupportedByDoctor: d.name, referrerSupportedSpecialty: d.specialty || '', referrerSupportedDegree: d.degree || '' })}
                                      style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{d.name}</div>
                                      {(d.specialty || d.degree) && (
                                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>{[d.specialty, d.degree].filter(Boolean).join(' · ')}</div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input type="text" placeholder="Doctor speciality (optional)" value={editingAppointment.referrerSupportedSpecialty || ''}
                              onChange={e => setEditingAppointment({ ...editingAppointment, referrerSupportedSpecialty: e.target.value })} style={{ ...inp, flex: 1 }} />
                            <input type="text" placeholder="Doctor degree (optional)" value={editingAppointment.referrerSupportedDegree || ''}
                              onChange={e => setEditingAppointment({ ...editingAppointment, referrerSupportedDegree: e.target.value })} style={{ ...inp, flex: 1 }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Clinical Notes</label>
                  <textarea placeholder="Any additional context..." value={editingAppointment.notes || ''} onChange={e => setEditingAppointment({...editingAppointment, notes: e.target.value})} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '13px', fontWeight: 700, padding: '12px 16px', outline: 'none', color: '#1e293b', minHeight: '80px', resize: 'vertical' }} />
                </div>
              </div>

              {/* Edit-drawer summary footer.
                  Mirrors the booking briefing so the user can verify the
                  whole visit (every service, total bill, total referral
                  cut, who / when / priority) right above the Save action
                  without scrolling back through the form. The primary
                  line is whatever's currently in the input fields at the
                  top; secondary lines come from editServices. */}
              {(() => {
                const _draftHasService = !!String(editingAppointment.service || '').trim();
                const _draftAmount = _draftHasService ? (Number(editingAppointment.amount) || 0) : 0;
                const _draftCut    = _draftHasService ? (Number(editingAppointment.referralCutValue) || 0) : 0;
                const _linesAmount = (editServices || []).reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
                const _linesCut    = (editServices || []).reduce((acc, l) => acc + (Number(l.referralCutValue) || 0), 0);
                const _totalAmount = _linesAmount + _draftAmount;
                const _totalCut    = _linesCut    + _draftCut;
                const _summaryLines = [
                  ...(_draftHasService ? [{
                    serviceName:      String(editingAppointment.service || '').trim(),
                    modality:         String(editingAppointment.modality || '').trim().toUpperCase(),
                    amount:           _draftAmount,
                    referralCutValue: _draftCut,
                    _isPrimary:       true,
                    _hasExistingId:   !!editingAppointment._primaryServiceId,
                  }] : []),
                  ...(editServices || []).map(l => ({
                    serviceName:      l.serviceName,
                    modality:         (l.modality || '').toUpperCase(),
                    amount:           Number(l.amount) || 0,
                    referralCutValue: Number(l.referralCutValue) || 0,
                    _isPrimary:       false,
                    _hasExistingId:   !!l.id,
                  })),
                ];

                // Resolve the scheduled date in YYYY-MM-DD form for the
                // header tile. dateTime may be ISO with or without a T.
                const _dateStr = (() => {
                  const raw = editingAppointment.dateTime || editingAppointment.date || '';
                  if (!raw) return '-';
                  const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
                  return m ? m[1] : raw;
                })();

                return (
                  <div style={{
                    background: '#f0f4ff', padding: '12px 14px', borderRadius: '12px',
                    border: '1px solid #dde5f5', marginBottom: '10px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontSize: '8px', fontWeight: 950, color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                        Visit summary before saving
                      </div>
                      {_summaryLines.length > 1 && (
                        <span style={{
                          fontSize: '8px', fontWeight: 950, letterSpacing: '0.3px',
                          color: 'white', background: '#0f52ba',
                          padding: '2px 7px', borderRadius: '999px',
                        }}>{_summaryLines.length} services</span>
                      )}
                    </div>

                    {/* Who / when / priority context. */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                      <div>
                        <span style={{ fontSize: '8px', color: '#888', fontWeight: 700, letterSpacing: '0.4px' }}>PATIENT</span>
                        <div style={{ fontWeight: 800, fontSize: '10.5px', color: '#1a1a2e' }}>
                          {editingAppointment.patientName || '-'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '8px', color: '#888', fontWeight: 700, letterSpacing: '0.4px' }}>SPECIALIST</span>
                        <div style={{ fontWeight: 800, fontSize: '10.5px', color: '#1a1a2e' }}>
                          {editingAppointment.doctor || 'Unassigned'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '8px', color: '#888', fontWeight: 700, letterSpacing: '0.4px' }}>SCHEDULED DATE</span>
                        <div style={{ fontWeight: 800, fontSize: '10.5px', color: '#0f52ba' }}>
                          {_dateStr}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '8px', color: '#888', fontWeight: 700, letterSpacing: '0.4px' }}>PRIORITY</span>
                        <div style={{
                          fontWeight: 900, fontSize: '10.5px',
                          color: editingAppointment.priority === 'STAT' ? '#dc2626'
                               : editingAppointment.priority === 'URGENT' ? '#d97706'
                               : '#1a1a2e',
                        }}>
                          {editingAppointment.priority || 'ROUTINE'}
                        </div>
                      </div>
                    </div>

                    {/* Services & billing block — same gradient totals
                        row as the booking briefing so the two flows look
                        consistent. */}
                    <div>
                      <div style={{ fontSize: '8px', color: '#888', fontWeight: 700, letterSpacing: '0.4px', marginBottom: '6px' }}>
                        SERVICES & BILLING
                      </div>
                      {_summaryLines.length === 0 ? (
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic', padding: '6px 0' }}>
                          No services on this visit yet.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {_summaryLines.map((line, idx) => (
                            <div key={idx} style={{
                              display: 'flex', alignItems: 'center', gap: '8px',
                              padding: '6px 8px', borderRadius: '8px',
                              background: 'white', border: '1px solid #e9eef7',
                            }}>
                              <span style={{
                                flexShrink: 0,
                                fontSize: '8px', fontWeight: 950, letterSpacing: '0.4px',
                                color: '#0f52ba',
                                background: '#eff6ff',
                                padding: '2px 6px', borderRadius: '5px',
                                border: '1px solid #dbeafe',
                              }}>{line.modality || 'OT'}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {line.serviceName}
                                  </span>
                                  {line._isPrimary && (
                                    <span title="The primary service drives the worklist's headline modality" style={{
                                      flexShrink: 0,
                                      fontSize: '7.5px', fontWeight: 900, letterSpacing: '0.4px',
                                      color: '#0f52ba', background: '#e0e7ff',
                                      padding: '1px 5px', borderRadius: '999px',
                                    }}>PRIMARY</span>
                                  )}
                                  {!line._isPrimary && line._hasExistingId && (
                                    <span title="Already-saved line — will be updated, not recreated" style={{
                                      flexShrink: 0,
                                      fontSize: '7.5px', fontWeight: 900, letterSpacing: '0.4px',
                                      color: '#047857', background: '#d1fae5',
                                      padding: '1px 5px', borderRadius: '999px',
                                    }}>SAVED</span>
                                  )}
                                  {!line._isPrimary && !line._hasExistingId && (
                                    <span title="New line — will be added on save" style={{
                                      flexShrink: 0,
                                      fontSize: '7.5px', fontWeight: 900, letterSpacing: '0.4px',
                                      color: '#7c3aed', background: '#ede9fe',
                                      padding: '1px 5px', borderRadius: '999px',
                                    }}>NEW</span>
                                  )}
                                </div>
                                {Number(line.referralCutValue) > 0 && (
                                  <div style={{ fontSize: '8px', fontWeight: 800, color: '#e67e22', marginTop: '1px' }}>
                                    {`Referral cut · ₹${Number(line.referralCutValue).toLocaleString()}`}
                                  </div>
                                )}
                              </div>
                              <div style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba', flexShrink: 0 }}>
                                {`₹${Number(line.amount || 0).toLocaleString()}`}
                              </div>
                            </div>
                          ))}

                          <div style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '8px 10px', borderRadius: '8px',
                            background: 'linear-gradient(135deg, #0f52ba 0%, #1e3a8a 100%)',
                            color: 'white',
                            marginTop: '2px',
                          }}>
                            <div style={{ flex: 1, fontSize: '9px', fontWeight: 950, letterSpacing: '0.6px', textTransform: 'uppercase', opacity: 0.85 }}>
                              Total bill
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '13px', fontWeight: 950, letterSpacing: '0.1px' }}>
                                {`₹${_totalAmount.toLocaleString()}`}
                              </div>
                              {_totalCut > 0 && (
                                <div style={{ fontSize: '8.5px', fontWeight: 900, color: '#fcd34d', marginTop: '1px', letterSpacing: '0.3px' }}>
                                  {`Total referral cut · ₹${_totalCut.toLocaleString()}`}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

            </form>
          </div>

          {/* Footer */}
          <div style={{ padding:'16px 24px', borderTop:'1px solid #e8edf2', display:'flex', gap:'10px', background:'white', flexShrink:0 }}>
            <button
              type="button"
              onClick={() => { setIsEditingOpen(false); setEditServices([]); }}
              style={{ flex:1, padding:'11px', borderRadius:'10px', border:'1.5px solid #e2e8f0', background:'white', fontWeight:700, fontSize:'13px', cursor:'pointer', color:'#475569' }}
            >
              Cancel
            </button>
            <button 
              type="button"
              onClick={handleEditAppointment}
              style={{ flex:2, padding:'11px', borderRadius:'10px', border:'none', background:`linear-gradient(135deg,#0a1628,#1e3a5f)`, color:'white', fontWeight:800, fontSize:'13px', cursor:'pointer', boxShadow:'0 4px 14px rgba(10,22,40,0.25)' }}
            >
              Save Modifications
            </button>
          </div>

        </div>
      </div>
    );
  };
;

  // ============================================================
  //  VIEW MODAL — every detail of one visit at a glance (read-only)
  // ============================================================
  const renderViewModal = () => {
    const app = viewAppointment;
    if (!app) return null;

    const lines = getServiceLines(app);
    const billTotal = lines.length > 0
      ? lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0)
      : (Number(app.totalAmount) || Number(app.amount) || 0);
    const refCut = lines.length > 0
      ? lines.reduce((acc, l) => acc + (Number(l.referralCutValue) || 0), 0)
      : (Number(app.referralCutValue) || 0);

    // Resolve the referral from the partner list so we can show its type,
    // contact and the referring-doctor profile (which, for an agent, lives
    // on the doctor's own record).
    const ref = (referrers || []).find(r => (r.name || '').toLowerCase() === (app.referredBy || '').toLowerCase());
    const refIsDoctor = ref ? ref.isDoctor !== false : true;
    const refContact = ref?.contact || app.referredContact || '';
    const refEmail = ref?.email || '';
    const supportedDoc = ref?.supportedByDoctor || '';
    const supportDocRec = (!refIsDoctor && supportedDoc)
      ? (referrers || []).find(r => r.isDoctor !== false && (r.name || '').toLowerCase() === supportedDoc.toLowerCase())
      : null;
    const docSpecialty = refIsDoctor ? (ref?.specialty || '') : (supportDocRec?.specialty || '');
    const docDegree = refIsDoctor ? (ref?.degree || '') : (supportDocRec?.degree || '');

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '';
    const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '';

    const statusColor = ({
      BOOKED: '#64748b', CONFIRMED: '#0f52ba', ARRIVED: '#0891b2', IN_PROGRESS: '#7c3aed',
      SCANNED: '#0d9488', REPORTING: '#d97706', REPORTED: '#16a34a', DELIVERED: '#16a34a',
      COMPLETED: '#16a34a', CANCELLED: '#e11d48',
    }[String(app.status || '').toUpperCase()] || '#64748b');

    const accentFor = (m) => ({
      'X-RAY': '#10b981', CT: '#3b82f6', MRI: '#8b5cf6', ULTRASOUND: '#06b6d4', USG: '#06b6d4',
      MAMMOGRAPHY: '#ec4899', MG: '#ec4899', DEXA: '#f59e0b', PET: '#f97316', NUCLEAR: '#84cc16',
    }[String(m || '').toUpperCase()] || '#64748b');

    const lbl = { fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '2px' };
    const val = { fontSize: '13px', fontWeight: 800, color: '#1e293b', wordBreak: 'break-word' };
    const sectionTitle = { fontSize: '10px', fontWeight: 900, color: '#0f52ba', letterSpacing: '0.7px', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' };
    const card = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', marginBottom: '14px' };

    const Field = ({ label, value }) => (
      <div style={{ flex: 1, minWidth: '120px' }}>
        <div style={lbl}>{label}</div>
        <div style={val}>{value || <span style={{ color: '#cbd5e1', fontWeight: 700 }}>—</span>}</div>
      </div>
    );

    return (
      <div className="modal-overlay" onClick={() => setViewAppointment(null)} style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0, padding: '20px' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: '560px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: 'white', borderRadius: '18px', boxShadow: '0 24px 70px rgba(0,0,0,0.4)' }}>
          {/* Header */}
          <div style={{ padding: '20px 22px', background: 'linear-gradient(135deg, #0a1628 0%, #0f52ba 100%)', color: 'white', position: 'sticky', top: 0, zIndex: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '8px', fontWeight: 800, opacity: 0.7, letterSpacing: '1px' }}>VISIT DETAILS · {app.displayId || ''}</div>
                <div style={{ fontSize: '19px', fontWeight: 950, marginTop: '3px', wordBreak: 'break-word' }}>{String(app.patientName || 'Unknown').toUpperCase()}</div>
                <div style={{ fontSize: '11px', fontWeight: 700, opacity: 0.85, marginTop: '3px' }}>
                  {[app.patientAge && `${app.patientAge} yrs`, app.patientGender].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                <button onClick={() => setViewAppointment(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: '16px', cursor: 'pointer', width: '30px', height: '30px', borderRadius: '8px', lineHeight: 1 }}>✕</button>
                <span style={{ background: 'white', color: statusColor, fontSize: '10px', fontWeight: 900, padding: '4px 10px', borderRadius: '999px', letterSpacing: '0.5px' }}>
                  {String(app.status || 'BOOKED').replace(/_/g, ' ')}
                </span>
                {app.dailyTokenNumber != null && (
                  <span style={{ fontSize: '10px', fontWeight: 800, opacity: 0.9 }}>TOKEN #{app.dailyTokenNumber}</span>
                )}
              </div>
            </div>
          </div>

          <div style={{ padding: '18px 20px' }}>
            {/* Patient & contact */}
            <div style={card}>
              <div style={sectionTitle}><span>🧑</span> Patient</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
                <Field label="Mobile" value={app.mobile} />
                <Field label="Patient ID" value={app.patientIdentifier || app.ptid || ''} />
                <Field label="Priority" value={String(app.priority || 'ROUTINE')} />
              </div>
            </div>

            {/* Visit */}
            <div style={card}>
              <div style={sectionTitle}><span>📅</span> Visit</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
                <Field label="Scheduled" value={app.dateTime ? `${fmtDate(app.dateTime)} · ${fmtTime(app.dateTime)}` : ''} />
                <Field label="Lead specialist" value={app.doctor} />
                <Field label="Arrived" value={app.arrivedAt ? `${fmtDate(app.arrivedAt)} · ${fmtTime(app.arrivedAt)}` : 'Not arrived yet'} />
              </div>
            </div>

            {/* Services */}
            <div style={card}>
              <div style={{ ...sectionTitle, justifyContent: 'space-between', display: 'flex' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span>🩻</span> Services</span>
                <span style={{ fontSize: '10px', fontWeight: 900, color: '#0f172a' }}>{lines.length || 1} item{(lines.length || 1) === 1 ? '' : 's'}</span>
              </div>
              {(lines.length > 0 ? lines : [{ modality: app.modality, serviceName: app.service, amount: app.totalAmount || app.amount, status: app.status }]).map((l, idx) => (
                <div key={l.id || idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderTop: idx === 0 ? 'none' : '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '8px', fontWeight: 900, color: 'white', background: accentFor(l.modality), padding: '3px 7px', borderRadius: '5px', letterSpacing: '0.4px' }}>{l.modality || 'OT'}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', flex: 1, minWidth: 0 }}>{l.serviceName || '—'}</span>
                  {l.status && <span style={{ fontSize: '8px', fontWeight: 800, color: '#64748b' }}>{String(l.status).replace(/_/g, ' ')}</span>}
                  <span style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}>₹{(Number(l.amount) || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>

            {/* Referral */}
            {app.referredBy?.trim() && (
              <div style={card}>
                <div style={sectionTitle}><span>{refIsDoctor ? '👨‍⚕️' : '👤'}</span> Referral · {refIsDoctor ? 'Doctor' : 'Other person'}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: (docSpecialty || docDegree || supportedDoc) ? '12px' : 0 }}>
                  <Field label="Referred by" value={app.referredBy} />
                  <Field label="Contact" value={refContact} />
                  <Field label="Email" value={refEmail} />
                </div>
                {!refIsDoctor && supportedDoc && (
                  <div style={{ paddingTop: '12px', borderTop: '1px dashed #cbd5e1' }}>
                    <div style={{ ...lbl, color: '#0f52ba' }}>👨‍⚕️ Referring doctor</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '6px' }}>
                      <Field label="Name" value={supportedDoc} />
                      <Field label="Speciality" value={docSpecialty} />
                      <Field label="Degree" value={docDegree} />
                    </div>
                  </div>
                )}
                {refIsDoctor && (docSpecialty || docDegree) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1' }}>
                    <Field label="Speciality" value={docSpecialty} />
                    <Field label="Degree" value={docDegree} />
                  </div>
                )}
              </div>
            )}

            {/* Billing */}
            <div style={{ ...card, background: '#eff6ff', border: '1px solid #bfdbfe', marginBottom: app.notes?.trim() ? '14px' : 0 }}>
              <div style={sectionTitle}><span>💳</span> Billing</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={lbl}>Total bill</div>
                  <div style={{ fontSize: '22px', fontWeight: 950, color: '#0f172a' }}>₹{billTotal.toLocaleString()}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={lbl}>Referral cut</div>
                  <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f52ba' }}>₹{refCut.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {app.notes?.trim() && (
              <div style={card}>
                <div style={sectionTitle}><span>📝</span> Clinical notes</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{app.notes}</div>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div style={{ position: 'sticky', bottom: 0, background: 'white', borderTop: '1px solid #e2e8f0', padding: '14px 20px', display: 'flex', gap: '10px' }}>
            <button onClick={() => { setViewAppointment(null); handlePrintToken(app); }} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '12px', fontWeight: 800, color: '#475569', cursor: 'pointer' }}>🖨️ Print token</button>
            <button onClick={() => setViewAppointment(null)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: '#0f52ba', fontSize: '12px', fontWeight: 800, color: 'white', cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  //  PRINT MODAL
  // ============================================================
  const renderTokenModal = () => {
    if (!tokenPrintData) return null;
    return (
      <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0 }}>
        <div style={{ width: '400px', background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
          <div style={{ padding: '20px', background: '#0a1628', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '1px' }}>THERMAL PREVIEW (80mm)</span>
            <button onClick={() => setTokenPrintData(null)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '18px', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ padding: '20px', display: 'flex', justifyContent: 'center', background: '#f1f5f9' }}>
            <div id="thermal-token" style={{ width: '80mm', background: 'white', padding: '6mm 5mm', boxShadow: '0 5px 15px rgba(0,0,0,0.1)', color: 'black', fontFamily: "'Courier New', Courier, monospace", textAlign: 'center', lineHeight: '1.2' }}>
              <div style={{ borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '8px' }}>
                <div style={{ fontSize: '16px', fontWeight: 900, textTransform: 'uppercase' }}>{activeCenter?.name || '1RAD HUB'}</div>
                <div style={{ fontSize: '8px', fontWeight: 700, marginTop: '2px' }}>DIAGNOSTIC COMMAND CENTER</div>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '9px', fontWeight: 800 }}>TOKEN NO.</div>
                <div style={{ fontSize: '38px', fontWeight: 950, margin: '2px 0' }}>{tokenPrintData.tokenNo || tokenPrintData.id}</div>
              </div>
              <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '8px 0', margin: '8px 0', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '8px', fontWeight: 700 }}>PATIENT ID:</span>
                  <span style={{ fontSize: '10px', fontWeight: 900 }}>{tokenPrintData.patientIdentifier || tokenPrintData.ptid || tokenPrintData.patientId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '8px', fontWeight: 700 }}>NAME:</span>
                  <span style={{ fontSize: '11px', fontWeight: 950 }}>{tokenPrintData.patientName.toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '8px', fontWeight: 700 }}>DATE:</span>
                  <span style={{ fontSize: '10px', fontWeight: 900 }}>{new Date(tokenPrintData.dateTime).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })} - {new Date(tokenPrintData.dateTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} IST</span>
                </div>
              </div>
              {(() => {
                // Multi-service token. Lists every service availed on
                // the visit with its price + a total at the bottom so
                // the patient walks out with an itemised slip. Falls
                // back to the legacy single-line render (MODALITY: ...
                // + service name) only when there's exactly one line —
                // keeps the slip clean for the common single-modality
                // walk-in.
                const _tokenLines = getServiceLines(tokenPrintData);
                if (_tokenLines.length <= 1) {
                  const _solo = _tokenLines[0] || {};
                  return (
                    <div style={{ marginTop: '8px', textAlign: 'left' }}>
                      <div style={{ fontSize: '9px', fontWeight: 800, color: '#333' }}>
                        MODALITY: {_solo.modality || tokenPrintData.modality || '-'}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 950, marginTop: '2px', borderLeft: '3px solid black', paddingLeft: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                        <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                          {_solo.serviceName || tokenPrintData.service || '-'}
                        </span>
                        {Number(_solo.amount || tokenPrintData.amount) > 0 && (
                          <span style={{ fontSize: '11px', fontWeight: 950, whiteSpace: 'nowrap' }}>
                            ₹{Number(_solo.amount || tokenPrintData.amount).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                const _tokenTotal = _tokenLines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
                return (
                  <div style={{ marginTop: '8px', textAlign: 'left' }}>
                    <div style={{
                      fontSize: '9px', fontWeight: 900, color: '#000',
                      letterSpacing: '0.6px',
                      borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '5px',
                    }}>
                      SERVICES AVAILED ({_tokenLines.length})
                    </div>
                    {_tokenLines.map((line, idx) => (
                      <div key={line.id || `tok-${idx}`} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        gap: '6px', marginBottom: idx === _tokenLines.length - 1 ? '0' : '4px',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '10px', fontWeight: 950, lineHeight: 1.15, wordBreak: 'break-word' }}>
                            {line.serviceName || '-'}
                          </div>
                          <div style={{ fontSize: '8px', fontWeight: 700, color: '#333', marginTop: '1px' }}>
                            {line.modality || ''}
                          </div>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 950, whiteSpace: 'nowrap' }}>
                          ₹{Number(line.amount || 0).toLocaleString()}
                        </span>
                      </div>
                    ))}
                    <div style={{
                      borderTop: '1.5px solid #000',
                      marginTop: '6px', paddingTop: '4px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: '10px', fontWeight: 950, letterSpacing: '0.5px' }}>
                        TOTAL
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 950 }}>
                        ₹{_tokenTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', width: '65mm' }}>
                  {/* ecc=M (15% correction) packs the tokenized URL sparse
                      enough that 14mm of paper is still scannable; ecc=H
                      was forcing too many modules and the printed result
                      was effectively a black blob. */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&ecc=M&data=${encodeURIComponent(tokenPrintQrUrl)}`}
                    alt="QR"
                    crossOrigin="anonymous"
                    style={{ width: '18mm', height: '18mm' }}
                  />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba' }}>LIVE STATUS</div>
                    <div style={{ fontSize: '7px', fontWeight: 700, color: '#64748b' }}>SCAN TO TRACK YOUR JOURNEY</div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '10px', fontSize: '8px', fontWeight: 700, color: '#94a3b8' }}>PRINTED: {new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} IST</div>
            </div>
          </div>
          <div style={{ padding: '20px', display: 'flex', gap: '10px' }}>
            <button className="gamified-btn" style={{ flex: 1, padding: '14px' }} onClick={() => window.print()}>CONFIRM PRINT</button>
            <button style={{ flex: 1, background: '#f1f5f9', border: '1px solid #dee2e6', borderRadius: '12px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }} onClick={() => setTokenPrintData(null)}>DISCARD</button>
          </div>
        </div>
        <style>{`@media print { body * { visibility: hidden !important; } #thermal-token, #thermal-token * { visibility: visible !important; } #thermal-token { position: absolute; left: 0; top: 0; width: 80mm; box-shadow: none !important; margin: 0; padding: 3mm 0; } }`}</style>
      </div>
    );
  };

  // ============================================================
  //  MAIN RENDER
  // ============================================================
  return (
    <div className="appointment-board-container">
      {/* --- PAGE HEADER --- */}
      <div className="appt-page-top">
        <div className="appt-page-header">
          <div className="appt-page-title-block">
            <h1 className="appt-page-title">Appointment Command</h1>
            <p className="appt-page-subtitle">Strategic Clinical Mission Control</p>
          </div>

          <div className="appt-page-actions">
            <div className="appt-tab-toggle">
              <button 
                className={`appt-tab-btn ${activeTab === 'TODAY' ? 'active' : ''}`}
                onClick={() => setActiveTab('TODAY')}
              >
                Today
              </button>
              <button 
                className={`appt-tab-btn ${activeTab === 'PAST' ? 'active' : ''}`}
                onClick={() => setActiveTab('PAST')}
              >
                Past
              </button>
              <button 
                className={`appt-tab-btn ${activeTab === 'FUTURE' ? 'active' : ''}`}
                onClick={() => setActiveTab('FUTURE')}
              >
                Future
              </button>
            </div>
            
            <button className="appt-new-mission-btn" onClick={() => { resetBooking(); setIsBookingOpen(true); }}>
              + New Mission
            </button>
          </div>
        </div>
      </div>

      {/* --- INTEL CARDS --- */}
      <div className="intel-cards-grid" style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : (activeTab === 'FUTURE' ? 'repeat(6, 1fr)' : 'repeat(7, 1fr)'),
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* Card 1: Total Volume */}
        <div className="intel-card dark" style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: 'white',
          padding: '20px',
          borderRadius: '20px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '100px'
        }}>
          <span className="intel-label" style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase' }}>Total Volume</span>
          <div className="intel-value" style={{ fontSize: '28px', fontWeight: 950, margin: '6px 0', fontFamily: 'monospace' }}>{stats.total}</div>
          <div className="intel-trend" style={{ fontSize: '10px', color: '#10b981', fontWeight: 800 }}>
            ↑ {activeRate}% Active
          </div>
        </div>

        {/* Card 2: Expected */}
        <div className="intel-card" style={{
          background: '#ffffff',
          padding: '20px',
          borderRadius: '20px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '100px'
        }}>
          <span className="intel-label" style={{ fontSize: '9px', fontWeight: 900, color: '#64748b', letterSpacing: '1px', textTransform: 'uppercase' }}>{activeTab === 'PAST' ? 'No Show' : 'Expected Today'}</span>
          <div className="intel-value" style={{ fontSize: '28px', fontWeight: 950, margin: '6px 0', color: activeTab === 'PAST' ? '#dc2626' : '#475569', fontFamily: 'monospace' }}>{activeTab === 'PAST' ? stats.noShow : stats.expected}</div>
          <div className="intel-trend" style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>
            {activeTab === 'PAST' ? 'Did Not Attend' : 'Intake Pending'}
          </div>
        </div>

        {/* Card 3: Arrived */}
        <div className="intel-card" style={{
          background: '#ecfdf5',
          padding: '20px',
          borderRadius: '20px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          border: '1px solid #d1fae5',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '100px'
        }}>
          <span className="intel-label" style={{ fontSize: '9px', fontWeight: 900, color: '#047857', letterSpacing: '1px', textTransform: 'uppercase' }}>Arrived In Hall</span>
          <div className="intel-value" style={{ fontSize: '28px', fontWeight: 950, margin: '6px 0', color: '#059669', fontFamily: 'monospace' }}>{stats.arrived}</div>
          <div className="intel-trend" style={{ fontSize: '10px', color: '#059669', fontWeight: 800 }}>
            Queue Waiting
          </div>
        </div>

        {/* Card 4: Clinical */}
        <div className="intel-card" style={{
          background: '#fffbeb',
          padding: '20px',
          borderRadius: '20px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          border: '1px solid #fef3c7',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '100px'
        }}>
          <span className="intel-label" style={{ fontSize: '9px', fontWeight: 900, color: '#b45309', letterSpacing: '1px', textTransform: 'uppercase' }}>Scanning / Scanned</span>
          <div className="intel-value" style={{ fontSize: '22px', fontWeight: 950, margin: '10px 0', color: '#d97706', fontFamily: 'monospace' }}>
            {stats.scanning} <span style={{ fontSize: '14px', color: '#cbd5e1', fontWeight: 800 }}>/</span> {stats.scanned}
          </div>
          <div className="intel-trend" style={{ fontSize: '9px', color: '#b45309', fontWeight: 800 }}>
            In Progress / Complete
          </div>
        </div>

        {/* Card 5: Backlog */}
        <div className="intel-card" style={{
          background: '#f5f3ff',
          padding: '20px',
          borderRadius: '20px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          border: '1px solid #ddd6fe',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '100px'
        }}>
          <span className="intel-label" style={{ fontSize: '9px', fontWeight: 900, color: '#6d28d9', letterSpacing: '1px', textTransform: 'uppercase' }}>Reporting / Reported</span>
          <div className="intel-value" style={{ fontSize: '22px', fontWeight: 950, margin: '10px 0', color: '#7c3aed', fontFamily: 'monospace' }}>
            {stats.reporting} <span style={{ fontSize: '14px', color: '#cbd5e1', fontWeight: 800 }}>/</span> {stats.finalized}
          </div>
          <div className="intel-trend" style={{ fontSize: '9px', color: '#6d28d9', fontWeight: 800 }}>
            Drafting / Finalized
          </div>
        </div>

        {/* Card 6: Delivered */}
        <div className="intel-card" style={{
          background: '#f0f9ff',
          padding: '20px',
          borderRadius: '20px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          border: '1px solid #e0f2fe',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '100px'
        }}>
          <span className="intel-label" style={{ fontSize: '9px', fontWeight: 900, color: '#0369a1', letterSpacing: '1px', textTransform: 'uppercase' }}>Delivered Reports</span>
          <div className="intel-value" style={{ fontSize: '28px', fontWeight: 950, margin: '6px 0', color: '#0284c7', fontFamily: 'monospace' }}>{stats.delivered}</div>
          <div className="intel-trend" style={{ fontSize: '10px', color: '#0369a1', fontWeight: 800 }}>
            Handed Over ({completionRate}% Efficacy)
          </div>
        </div>

        {/* Card 7: Cancelled — Today & Past only */}
        {activeTab !== 'FUTURE' && (
          <div className="intel-card" style={{
            background: '#fff1f2',
            padding: '20px',
            borderRadius: '20px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            border: '1px solid #fecdd3',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '100px'
          }}>
            <span className="intel-label" style={{ fontSize: '9px', fontWeight: 900, color: '#be123c', letterSpacing: '1px', textTransform: 'uppercase' }}>Cancelled</span>
            <div className="intel-value" style={{ fontSize: '28px', fontWeight: 950, margin: '6px 0', color: '#e11d48', fontFamily: 'monospace' }}>{stats.cancelled}</div>
            <div className="intel-trend" style={{ fontSize: '10px', color: '#be123c', fontWeight: 800 }}>
              Aborted Missions
            </div>
          </div>
        )}
      </div>

      {/* --- FILTER BAR --- */}
      <div className="filter-bar-responsive">
        <div className="filter-search-group">
          <input
            type="text"
            placeholder="Search mission records..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-select-group">
          <select
            className="filter-select"
            value={filters.doctor}
            onChange={e => setFilters({...filters, doctor: e.target.value})}
          >
            <option value="ALL">All Specialists</option>
            {doctors.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          {/* One-click "Not Arrived" filter — high-visibility: amber attention
              style when patients are still waiting to be checked in, solid when
              the filter is on. Pulses gently while there are people waiting. */}
          {(() => {
            const waiting = (stats.expected || 0) > 0;
            const on = filters.notArrived;
            const bg = on ? '#f59e0b' : (waiting ? '#fffbeb' : 'white');
            const bd = on ? '#f59e0b' : (waiting ? '#f59e0b' : '#e2e8f0');
            const fg = on ? 'white' : (waiting ? '#b45309' : '#64748b');
            return (
              <button
                type="button"
                onClick={() => setFilters({ ...filters, notArrived: !filters.notArrived })}
                title="Show only patients who have not arrived yet"
                className={waiting && !on ? 'not-arrived-pulse' : ''}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '0 18px', height: '44px', borderRadius: '12px',
                  border: `2px solid ${bd}`, background: bg, color: fg,
                  fontSize: '13px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap',
                  boxShadow: on
                    ? '0 6px 16px rgba(245,158,11,0.35)'
                    : (waiting ? '0 4px 12px rgba(245,158,11,0.20)' : 'none'),
                  letterSpacing: '0.2px', transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: '16px' }}>🕒</span>
                Not Arrived
                <span style={{
                  fontSize: '12px', fontWeight: 950, padding: '2px 9px', borderRadius: '999px',
                  background: on ? 'rgba(255,255,255,0.3)' : (waiting ? '#f59e0b' : '#eef2f6'),
                  color: on ? 'white' : (waiting ? 'white' : '#94a3b8'),
                  minWidth: '22px', textAlign: 'center',
                }}>{stats.expected}</span>
              </button>
            );
          })()}
        </div>

        <button className="filter-reset-btn" onClick={() => {
          setSearchQuery('');
          setFilters({ date: TODAY, status: 'ALL', modality: 'ALL', doctor: 'ALL', notArrived: false });
        }}>
          Reset Filters
        </button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div ref={listTopRef} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {filteredAppointments.length} Record{filteredAppointments.length !== 1 ? 's' : ''} Found
            {totalPages > 1 && <span style={{ marginLeft: '10px', color: '#0f52ba' }}>— Page {currentPage} of {totalPages}</span>}
          </span>
        </div>

        {/* Appointments List - Responsive Display */}
        <div className="appointments-list-container" style={{ overflowX: 'auto', paddingBottom: '20px' }}>
          {loading ? (
            <div className="empty-state">
              <div className="empty-state-title">LOADING RECORDS...</div>
            </div>
          ) : paginatedAppointments.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">NO APPOINTMENTS FOUND</div>
              <div className="empty-state-text">
                {searchQuery ? 'Try adjusting your search criteria' : 'No appointments scheduled'}
              </div>
            </div>
          ) : isMobile ? (
            /* Mobile/Tablet: Card Layout */
            <div className="appointments-cards">
              {paginatedAppointments.map(app => (
                <AppointmentCard
                  key={app.appointmentId}
                  appointment={app}
                  statusMeta={STATUS_META}
                  getNextAction={getNextAction}
                  onAction={handleAction}
                  onPrint={(app) => handlePrintToken(app)}
                  onPrescription={(app) => handlePreviewPrint(app)}
                  // Multi-service rollout — per-service Print prescription
                  // for the mobile/tablet expander, mirroring the desktop.
                  onPrintServicePrescription={(appointmentObj, serviceId) =>
                    handlePreviewPrint(appointmentObj, serviceId)
                  }
                  onEdit={(app) => { setEditingAppointment(app); setIsEditingOpen(true); }}
                  onCancel={(id) => {
                    const matchedApp = appointments.find(a => a.id === id || a.appointmentId === id);
                    setCancelConfirmModal({ isOpen: true, appointmentId: id, patientName: matchedApp?.patientName || 'this patient' });
                  }}
                  patients={patients}
                />
              ))}
            </div>
          ) : (
            /* Desktop: Table Layout */
            <div className="appointments-table">
              {/* Column header strip — gives the list a table-like
                  orientation now that each card is a flex layout
                  rather than a rigid grid. Subtle slate-on-white,
                  no border noise. The left band covers the identity
                  cluster (token + patient + meta line) and the
                  service ledger that sits inside the card; the right
                  band covers the action cluster (status + buttons). */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 16px 6px',
                marginBottom: '6px',
                borderBottom: '1px solid #e2e8f0',
                fontSize: '9px', fontWeight: 950, color: '#94a3b8',
                letterSpacing: '1.2px', textTransform: 'uppercase',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flex: 1, minWidth: 0 }}>
                  <span style={{ flexShrink: 0 }}>Token · Patient</span>
                  <span style={{ flex: 1, minWidth: 0 }}>Services &amp; Billing</span>
                </div>
                <div style={{ flexShrink: 0 }}>Status · Actions</div>
              </div>

              {paginatedAppointments.map(app => (
                <div key={app.appointmentId}>
                  {renderAppointmentRow(app)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {renderPagination()}
      </div>

      {renderDrawer()}
      {renderEditDrawer()}
      {renderViewModal()}
      {renderTokenModal()}

      {/* Add New Referrer Modal */}
      {isAddingReferrer && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.7)', zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0 }}>
          <div style={{ width: '400px', background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '20px', background: '#0f52ba', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 900, letterSpacing: '1px' }}>ADD NEW REFERRER</span>
              <button onClick={() => setIsAddingReferrer(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleAddReferrer} style={{ padding: '25px' }}>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748b' }}>FULL NAME</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Dr. John Doe"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  value={newReferrer.name}
                  onChange={e => setNewReferrer({...newReferrer, name: e.target.value})}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748b' }}>CONTACT NUMBER (MOBILE) — OPTIONAL</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210 (optional)"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    marginBottom: '4px',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  value={newReferrer.contact}
                  onChange={e => setNewReferrer({...newReferrer, contact: e.target.value})}
                />
                <span style={{ fontSize: '9px', color: '#64748b', display: 'block', fontWeight: 700 }}>
                  Optional — leave blank if not known.
                </span>
              </div>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748b' }}>ADDRESS / CLINIC</label>
                <input 
                  type="text" 
                  placeholder="City, Area"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  value={newReferrer.address}
                  onChange={e => setNewReferrer({...newReferrer, address: e.target.value})}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setIsAddingReferrer(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #dee2e6', background: 'white', fontWeight: 800, cursor: 'pointer' }}>CANCEL</button>
                <button type="submit" className="gamified-btn" style={{ flex: 2, padding: '12px' }}>SAVE REFERRER</button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      <ReportPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => { setIsPreviewOpen(false); setPreviewServiceId(null); }}
        doctorId={previewAppointment?.doctorId}
        appointmentId={previewAppointment?.appointmentId || previewAppointment?.id}
        // Multi-service rollout — the per-service "Print prescription"
        // button from the expanded row passes a service id here so the
        // modal's patient banner + thank-you line name THAT service
        // line, not the visit's primary scalar.
        appointmentServiceId={previewServiceId}
        patientData={previewAppointment}
        reportContent={previewReport}
      />

      {/* Premium Glassmorphic Error Dialog Modal */}
      {errorModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.85)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '24px',
            padding: '30px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.15), 0 0 40px rgba(0, 0, 0, 0.05)',
            textAlign: 'center',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            transform: 'scale(1)',
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            color: '#1e293b'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              background: '#fef2f2',
              border: '1px solid #fee2e2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: '0 8px 16px rgba(239, 68, 68, 0.1)'
            }}>
              <span style={{ fontSize: '32px' }}>🔒</span>
            </div>
            
            <h3 style={{
              fontSize: '20px',
              fontWeight: 950,
              color: '#991b1b',
              margin: '0 0 10px 0',
              letterSpacing: '-0.025em'
            }}>
              {errorModal.title}
            </h3>
            
            <p style={{
              fontSize: '14px',
              color: '#475569',
              lineHeight: '1.6',
              margin: '0 0 24px 0',
              fontWeight: 650
            }}>
              {errorModal.message}
            </p>
            
            <button
              onClick={() => setErrorModal({ isOpen: false, title: '', message: '' })}
              style={{
                width: '100%',
                padding: '14px 20px',
                borderRadius: '14px',
                border: 'none',
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '14px',
                cursor: 'pointer',
                boxShadow: '0 10px 15px -3px rgba(220, 38, 38, 0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 12px 20px -3px rgba(220, 38, 38, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'none';
                e.target.style.boxShadow = '0 10px 15px -3px rgba(220, 38, 38, 0.3)';
              }}
            >
              Acknowledge & Close
            </button>
          </div>
        </div>
      )}

      {/* Premium Glassmorphic Cancel Confirmation Modal */}
      {changeRefModal.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '16px',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div style={{ background: '#ffffff', borderRadius: '24px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: '34px', textAlign: 'center', marginBottom: '6px' }}>↪</div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a', textAlign: 'center' }}>Change referred by</h3>
            <p style={{ fontSize: '12.5px', color: '#475569', textAlign: 'center', marginTop: '6px', lineHeight: 1.5 }}>
              Currently referred by <strong style={{ color: '#0f172a' }}>{changeRefModal.currentReferrer || '—'}</strong>. The referral commission will move to the new referrer.
            </p>

            {changeRefModal.phase === 'edit' ? (
              <>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '0.5px', marginTop: '18px', marginBottom: '6px' }}>NEW REFERRER NAME</label>
                <input
                  autoFocus
                  list="changeref-referrers"
                  value={changeRefModal.newName}
                  onChange={e => setChangeRefModal(s => ({ ...s, newName: e.target.value }))}
                  placeholder="Type or pick a referrer…"
                  style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
                <datalist id="changeref-referrers">
                  {(referrers || []).map(r => <option key={r.referrerId || r.id || r.name} value={r.name} />)}
                </datalist>

                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '0.5px', marginBottom: '6px' }}>CONTACT (OPTIONAL)</label>
                    <input
                      value={changeRefModal.newContact}
                      onChange={e => setChangeRefModal(s => ({ ...s, newContact: e.target.value }))}
                      placeholder="Phone number"
                      style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '0.5px', marginBottom: '6px' }}>TYPE</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[['Doctor', true], ['Agent', false]].map(([lbl, val]) => (
                        <button key={lbl} type="button" onClick={() => setChangeRefModal(s => ({ ...s, isDoctor: val }))}
                          style={{ padding: '12px 12px', borderRadius: '10px', border: changeRefModal.isDoctor === val ? '2px solid #1d4ed8' : '1px solid #e2e8f0', background: changeRefModal.isDoctor === val ? '#eff6ff' : 'white', color: changeRefModal.isDoctor === val ? '#1d4ed8' : '#64748b', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>{lbl}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button onClick={() => setChangeRefModal(s => ({ ...s, isOpen: false }))}
                    style={{ flex: 1, padding: '14px', borderRadius: '14px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={submitChangeReferrer} disabled={!changeRefModal.newName.trim() || changeRefModal.submitting}
                    style={{ flex: 1, padding: '14px', borderRadius: '14px', border: 'none', background: (!changeRefModal.newName.trim() || changeRefModal.submitting) ? '#cbd5e1' : 'linear-gradient(135deg, #1d4ed8, #0f52ba)', color: '#ffffff', fontWeight: 900, fontSize: '13px', cursor: (!changeRefModal.newName.trim() || changeRefModal.submitting) ? 'not-allowed' : 'pointer' }}>{changeRefModal.submitting ? 'Updating…' : 'Update Referrer'}</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ marginTop: '16px', padding: '12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', fontSize: '12.5px', color: '#92400e', lineHeight: 1.5 }}>
                  🔒 Payment was already collected, so changing the referrer to <strong>{changeRefModal.newName.trim()}</strong> needs admin approval.
                </div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '0.5px', marginTop: '16px', marginBottom: '6px' }}>REASON FOR CHANGE</label>
                <textarea
                  autoFocus
                  value={changeRefModal.reason}
                  onChange={e => setChangeRefModal(s => ({ ...s, reason: e.target.value }))}
                  placeholder="e.g. wrong referrer recorded at booking, commission belongs to another doctor…"
                  rows={3}
                  style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                  <button onClick={() => setChangeRefModal(s => ({ ...s, isOpen: false }))}
                    style={{ flex: 1, padding: '14px', borderRadius: '14px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={submitChangeReferrerApproval} disabled={!changeRefModal.reason.trim() || changeRefModal.submitting}
                    style={{ flex: 1, padding: '14px', borderRadius: '14px', border: 'none', background: (!changeRefModal.reason.trim() || changeRefModal.submitting) ? '#cbd5e1' : 'linear-gradient(135deg, #1d4ed8, #0f52ba)', color: '#ffffff', fontWeight: 900, fontSize: '13px', cursor: (!changeRefModal.reason.trim() || changeRefModal.submitting) ? 'not-allowed' : 'pointer' }}>{changeRefModal.submitting ? 'Sending…' : 'Send for Approval'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {cancelApprovalModal.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '16px',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div style={{ background: '#ffffff', borderRadius: '24px', padding: '28px', width: '100%', maxWidth: '440px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: '38px', textAlign: 'center', marginBottom: '8px' }}>🔒</div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a', textAlign: 'center' }}>Admin approval needed</h3>
            <p style={{ fontSize: '13px', color: '#475569', textAlign: 'center', marginTop: '8px', lineHeight: 1.55 }}>
              Payment was already collected for <strong style={{ color: '#0f172a' }}>{(cancelApprovalModal.patientName || 'this patient').toUpperCase()}</strong>. To cancel this paid appointment, send it for admin approval with a reason.
            </p>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '0.5px', marginTop: '18px', marginBottom: '6px' }}>REASON FOR CANCELLATION</label>
            <textarea
              autoFocus
              value={cancelApprovalModal.reason}
              onChange={e => setCancelApprovalModal(m => ({ ...m, reason: e.target.value }))}
              placeholder="e.g. patient left without the test, duplicate booking, wrong patient…"
              rows={3}
              style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
              <button
                onClick={() => setCancelApprovalModal({ isOpen: false, appointmentId: null, patientName: '', reason: '', submitting: false })}
                style={{ flex: 1, padding: '14px', borderRadius: '14px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
              >Keep Appointment</button>
              <button
                onClick={submitCancelApproval}
                disabled={!cancelApprovalModal.reason.trim() || cancelApprovalModal.submitting}
                style={{ flex: 1, padding: '14px', borderRadius: '14px', border: 'none', background: (!cancelApprovalModal.reason.trim() || cancelApprovalModal.submitting) ? '#cbd5e1' : 'linear-gradient(135deg, #0f52ba, #061a40)', color: '#ffffff', fontWeight: 900, fontSize: '13px', cursor: (!cancelApprovalModal.reason.trim() || cancelApprovalModal.submitting) ? 'not-allowed' : 'pointer' }}
              >{cancelApprovalModal.submitting ? 'Sending…' : 'Send for Approval'}</button>
            </div>
          </div>
        </div>
      )}

      {cancelConfirmModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.85)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: '24px',
            padding: '30px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 25px 50px -12px rgba(245, 158, 11, 0.15), 0 0 40px rgba(0, 0, 0, 0.05)',
            textAlign: 'center',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            transform: 'scale(1)',
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            color: '#1e293b'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              background: '#fffbeb',
              border: '1px solid #fef3c7',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: '0 8px 16px rgba(245, 158, 11, 0.1)'
            }}>
              <span style={{ fontSize: '32px' }}>⚠️</span>
            </div>
            
            <h3 style={{
              fontSize: '20px',
              fontWeight: 950,
              color: '#b45309',
              margin: '0 0 10px 0',
              letterSpacing: '-0.025em'
            }}>
              Cancel Appointment
            </h3>
            
            <p style={{
              fontSize: '14px',
              color: '#475569',
              lineHeight: '1.6',
              margin: '0 0 24px 0',
              fontWeight: 600
            }}>
              Are you sure you want to cancel the appointment for <strong style={{ color: '#0f172a', fontWeight: 800 }}>{(cancelConfirmModal.patientName || '').toUpperCase()}</strong>? 
              <span style={{ display: 'block', marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                This action will automatically delete any associated unpaid invoices, collected payment entries, and referral commissions.
              </span>
            </p>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setCancelConfirmModal({ isOpen: false, appointmentId: null, patientName: '' })}
                style={{
                  flex: 1,
                  padding: '14px 20px',
                  borderRadius: '14px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = '#ffffff';
                }}
              >
                No, Keep It
              </button>
              
              <button
                onClick={() => {
                  handleAction(cancelConfirmModal.appointmentId, 'CANCEL');
                  setCancelConfirmModal({ isOpen: false, appointmentId: null, patientName: '' });
                }}
                style={{
                  flex: 1,
                  padding: '14px 20px',
                  borderRadius: '14px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxShadow: '0 10px 15px -3px rgba(220, 38, 38, 0.3)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-1px)';
                  e.target.style.boxShadow = '0 12px 20px -3px rgba(220, 38, 38, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'none';
                  e.target.style.boxShadow = '0 10px 15px -3px rgba(220, 38, 38, 0.3)';
                }}
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Universal Notification Modal ─────────────────────────────────────── */}
      {notifModal.isOpen && (() => {
        const NOTIF_CFG = {
          success:  { gradient: 'linear-gradient(135deg,#dcfce7,#bbf7d0)', iconColor: '#16a34a', border: '#bbf7d0', titleColor: '#15803d', shadow: 'rgba(22,163,74,0.22)',   icon: '✓',  btnGrad: 'linear-gradient(135deg,#16a34a,#15803d)', btnShadow: 'rgba(22,163,74,0.4)'   },
          error:    { gradient: 'linear-gradient(135deg,#fee2e2,#fecaca)', iconColor: '#dc2626', border: '#fecaca', titleColor: '#991b1b', shadow: 'rgba(220,38,38,0.22)',   icon: '✕',  btnGrad: 'linear-gradient(135deg,#e11d48,#be123c)', btnShadow: 'rgba(225,29,72,0.4)'   },
          warning:  { gradient: 'linear-gradient(135deg,#fef3c7,#fde68a)', iconColor: '#d97706', border: '#fde68a', titleColor: '#92400e', shadow: 'rgba(217,119,6,0.22)',  icon: '⚠', btnGrad: 'linear-gradient(135deg,#d97706,#b45309)', btnShadow: 'rgba(217,119,6,0.4)'  },
          info:     { gradient: 'linear-gradient(135deg,#dbeafe,#bfdbfe)', iconColor: '#0f52ba', border: '#bfdbfe', titleColor: '#1e40af', shadow: 'rgba(15,82,186,0.22)',  icon: '↻', btnGrad: 'linear-gradient(135deg,#0f52ba,#1e40af)', btnShadow: 'rgba(15,82,186,0.4)'  },
        };
        const cfg = NOTIF_CFG[notifModal.type] || NOTIF_CFG.info;
        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(10,22,40,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', justifyContent: 'center', alignItems: 'center', animation: 'apptNoticeFade 0.2s ease-out' }}
            onClick={() => setNotifModal(m => ({ ...m, isOpen: false }))}
          >
            <div
              style={{ width: '90%', maxWidth: '440px', background: 'linear-gradient(160deg,#ffffff 0%,#f8fafc 100%)', borderRadius: '28px', border: `1px solid ${cfg.border}`, boxShadow: `0 24px 60px -12px ${cfg.shadow}, 0 0 0 1px rgba(0,0,0,0.04)`, padding: '40px 32px 32px', textAlign: 'center', animation: 'apptNoticePop 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Icon circle */}
              <div style={{ width: '76px', height: '76px', borderRadius: '50%', background: cfg.gradient, border: `2px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', fontSize: '30px', boxShadow: `0 12px 28px -8px ${cfg.shadow}` }}>
                <span style={{ color: cfg.iconColor, fontWeight: 900, lineHeight: 1 }}>{cfg.icon}</span>
              </div>
              {/* Type badge */}
              <div style={{ display: 'inline-block', background: cfg.gradient, border: `1px solid ${cfg.border}`, borderRadius: '8px', padding: '3px 12px', marginBottom: '12px' }}>
                <span style={{ fontSize: '9px', fontWeight: 950, letterSpacing: '2px', color: cfg.titleColor, fontFamily: 'system-ui,sans-serif' }}>
                  {notifModal.type.toUpperCase()}
                </span>
              </div>
              {/* Title */}
              <div style={{ fontSize: '13px', fontWeight: 950, letterSpacing: '1.5px', color: '#0f172a', marginBottom: '12px', fontFamily: 'system-ui,sans-serif', lineHeight: 1.3 }}>
                {notifModal.title}
              </div>
              {/* Divider */}
              <div style={{ width: '40px', height: '3px', background: cfg.gradient, borderRadius: '99px', margin: '0 auto 16px' }} />
              {/* Message */}
              <p style={{ fontSize: '13px', lineHeight: 1.75, color: '#475569', fontWeight: 500, margin: '0 0 28px', fontFamily: 'system-ui,sans-serif' }}>
                {notifModal.message}
              </p>
              {/* Close button */}
              <button
                onClick={() => setNotifModal(m => ({ ...m, isOpen: false }))}
                style={{ width: '100%', padding: '15px', background: cfg.btnGrad, color: 'white', border: 'none', borderRadius: '16px', fontSize: '11px', fontWeight: 950, letterSpacing: '1.5px', cursor: 'pointer', boxShadow: `0 8px 20px -6px ${cfg.btnShadow}`, fontFamily: 'system-ui,sans-serif' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >
                UNDERSTOOD
              </button>
            </div>
          </div>
        );
      })()}
      <style>{`
        @keyframes apptNoticeFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes apptNoticePop  { from { transform: scale(0.88) translateY(20px); opacity: 0 } to { transform: scale(1) translateY(0); opacity: 1 } }
      `}</style>
    </div>
  );
}