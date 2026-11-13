import { useState, useMemo, useEffect, useCallback, useContext, useRef, lazy, Suspense } from 'react';
import { t as tr } from '../i18n';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { AuthContext } from '../auth/AuthContext';
// Lazy — pulls in react-pdf/qrcode, which don't need to be part of the
// board's own bundle.
const ReportPreviewModal = lazy(() => import('../components/ReportPreviewModal'));
import useOffline from '../hooks/useOffline';
import useTickClock from '../utils/useTickClock';
import { isPatientArrived } from '../utils/arrival';
import { formatElapsed, premisesSeverity, premisesPillStyle } from '../utils/timeTracking';
import { useOverdue } from '../components/OverdueAppointments/OverdueContext';
import { formatPatientAge } from '../utils/patientAge';
import { getServiceLines, getUniqueModalities, matchesAnyModality, getReportProgressLabel } from '../utils/appointmentServices';
import useLiveAppointments from '../hooks/useLiveAppointments';
import { snapshotPersonnel, watchPersonnel } from '../db/repos/personnelRepo';
import { notifyToast } from '../utils/toast';
import '../styles/global.css';
import '../styles/DoctorBoard.css';
import { useViewport } from '../components/saral/hooks';

const MODALITY_ICONS = {
  'X-RAY': '🩻',
  'MRI': '🧠',
  'CT': '🌀',
  'ULTRASOUND': '🤰',
  'DEXA': '🦴',
  'MAMMOGRAPHY': '🎀'
};

// Today as YYYY-MM-DD for a given clock reading.
const dayOf = (ms) => new Date(ms).toLocaleDateString('en-CA');
// Scanned but not yet signed — the doctor's backlog, whatever day it's from.
const WAITING = ['scanned', 'reporting'];

// Only these exact system roles get their own queue pre-selected by default.
// Custom roles, Admin, Technician, Receptionist, Accountant → all default to 'ALL'.
const DOCTOR_ROLES = ['admindoctor', 'doctor'];


// Which study a preview should show on a visit with several: the first one
// that is signed, else the first study. (Previews used to always show the
// first study, whatever its state.)
function previewServiceId(c) {
  const lines = (c?.services || []).filter(l => l && l.id && !l.deletedAt);
  const signed = lines.find(l => ['REPORTED', 'DELIVERED'].includes(String(l.status || '').toUpperCase()));
  return (signed || lines[0])?.id || null;
}

export default function DoctorBoard() {
  const { activeCenter, currentUser } = useContext(AuthContext);
  // The board's clock: refreshed every minute, so "today" rolls over at
  // midnight and "oldest waiting" keeps counting without a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const TODAY = dayOf(now);
  const { isOnline } = useOffline();
  const navigate = useNavigate();
  // 60s tick keeps the on-premises pill counting up; isOverdue mirrors the bell.
  useTickClock();
  const { isOverdue } = useOverdue();
  const vp = useViewport();
  // Preview-modal spinner only — the worklist's own loading state comes from
  // the live hook below.
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('QUEUE'); // 'QUEUE' or 'HISTORY'
  
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewAppointment, setPreviewAppointment] = useState(null);
  const [previewSvcId, setPreviewServiceId] = useState(null);
  const [previewReport, setPreviewReport] = useState({ mode: 'Narrative Editor', text: '', impression: '', isFinalized: false });

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ modality: 'ALL', priority: 'ALL', clinicalStatus: 'ALL' });
  // Always start with 'ALL' — auto-select the logged-in doctor ONLY after the doctors
  // list has loaded, to avoid UUID race condition (empty list = zero matches).
  const [selectedDoctor, setSelectedDoctor] = useState('ALL');
  const [filtersOpen, setFiltersOpen] = useState(false); // phones: filters folded behind a button
  const [doctors, setDoctors] = useState([]);
  const [archivePage, setArchivePage] = useState(1);
  const [archiveFilterMode, setArchiveFilterMode] = useState('ALL'); // 'ALL' or 'RANGE'
  const [archiveDateRange, setArchiveDateRange] = useState(() => ({ start: dayOf(Date.now()), end: dayOf(Date.now()) }));
  const itemsPerPage = 25;
  const [sortConfig, setSortConfig] = useState({ key: 'dateTime', direction: 'asc' });

  // After the doctors list loads, auto-select the logged-in doctor if they are one.
  // We guard with a ref so this only fires once (doesn't override manual user changes).
  const hasAutoSetDoctor = useRef(false);
  useEffect(() => {
    if (doctors.length === 0 || !currentUser?.id || hasAutoSetDoctor.current) return;
    hasAutoSetDoctor.current = true;

    const userRoles = (currentUser.roles || []).map(r => String(r).toLowerCase());
    const isDoctor = userRoles.some(r => DOCTOR_ROLES.includes(r));
    if (!isDoctor) return; // Non-doctor / custom role → stay on 'ALL'

    // Find the exact ID from the doctors list (avoids UUID casing mismatches)
    const match = doctors.find(d =>
      d.id?.toLowerCase() === String(currentUser.id).toLowerCase()
    );
    if (match) setSelectedDoctor(match.id);
    // If no match found the doctor isn't in the personnel list → stay on 'ALL'
  }, [doctors, currentUser?.id]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };



  // --- WORKLIST (live backend) ---
  // The reporting worklist comes straight from the API (recent visits + any
  // visit not yet finalized), kept fresh by polling. Nothing is cached on disk.
  const { rows: liveRows, loading: listLoading, refresh: refreshCases, reload: reloadCases, patchRow } = useLiveAppointments({ mode: 'all' });
  const cases = useMemo(() => liveRows
    // Cancelled visits never appear on the reporting (doctor) board.
    .filter(a => String(a.status || '').toUpperCase() !== 'CANCELLED')
    .map(a => ({
      ...a,
      id: a.displayId,
      priority: a.priority || (a.type === 'EMERGENCY' ? 'STAT' : 'ROUTINE'),
      isToday: a.dateTime ? new Date(a.dateTime).toLocaleDateString('en-CA') === TODAY : false,
      isWaiting: WAITING.includes(String(a.status || '').toLowerCase()),
    })), [liveRows, TODAY]);

  // Manual refresh / post-action nudge — pull what changed right now.
  const fetchCases = useCallback(async () => {
    try { await refreshCases(); } catch (err) { console.warn('[DOCTOR] refresh failed', err?.message || err); }
  }, [refreshCases]);

  // Warm the personnel snapshot; the doctor list renders from watchPersonnel
  // below, so staff changes appear on their own (refreshed each sync cycle).
  const fetchDoctors = useCallback(async () => {
    try {
      const res = await apiClient.get('/personnel');
      await snapshotPersonnel(res.data);
    } catch (err) {
      console.error('[DOCTOR] Failed to refresh doctors — keeping offline snapshot.', err);
    }
  }, []);

  useEffect(() => {
    fetchDoctors(); // warm the cache immediately on mount
    const sub = watchPersonnel().subscribe({
      next: (rows) => {
        const list = rows || [];
        // Positive doctor match only — a custom role (or any non-clinical role)
        // must NOT be treated as a doctor. The old "not in [admin, technician,
        // receptionist, accountant]" test wrongly swept custom-role users into
        // the doctor list.
        const isDoctorRole = (r) => {
          const lower = String(r).toLowerCase().replace(/\s+/g, '');
          return lower.includes('doctor') || lower.includes('radiolog');
        };
        let docList = list.map(p => {
          const rawRoles = p.roles || p.Roles || [];
          return {
            id: p.userId || p.UserId,
            name: p.fullName || p.FullName || 'UNKNOWN_STAFF',
            roles: rawRoles.map(r => String(r).toLowerCase())
          };
        }).filter(p => p.roles.some(isDoctorRole));
        // Safety net: only if the centre has NO doctor-roled user at all do we
        // fall back to listing everyone, so assignment still works.
        if (docList.length === 0 && list.length > 0) {
          docList = list.map(p => ({
            id: p.userId || p.UserId,
            name: p.fullName || p.FullName || 'UNKNOWN_STAFF',
            roles: (p.roles || p.Roles || []).map(r => String(r).toLowerCase())
          }));
        }
        setDoctors(docList);
      },
      error: (err) => console.warn('[DOCTOR] personnel liveQuery error', err),
    });
    return () => sub.unsubscribe();
  }, [fetchDoctors]);

  const handleStatusUpdate = async (id, newStatus) => {
    // Arrival gate — reporting can't move a study until the patient has arrived.
    const target = (cases || []).find(c => c.appointmentId === id || c.id === id);
    const arrived = isPatientArrived(target);
    if (target && !arrived) {
      notifyToast({ title: 'Patient not arrived', message: 'Mark the patient as arrived before updating the study status.' }, 'warning');
      return;
    }

    if (!isOnline) {
      notifyToast({ title: 'No connection', message: 'You are offline — status updates need a live connection.' }, 'error');
      return;
    }

    // Instant in-memory feedback; reverted below if the server rejects it.
    patchRow(id, (row) => ({ ...row, status: newStatus }));
    try {
      await apiClient.patch(`/appointments/${id}/status`, `"${newStatus}"`, {
        headers: { 'Content-Type': 'application/json' }
      });
      fetchCases();
    } catch (err) {
      console.error('[DOCTOR] Status update failed', err);
      notifyToast({
        title: 'Status update failed',
        message: !err.response ? 'No connection to the server — please try again.' : 'Could not update the study status. Please try again.',
      }, 'error');
      reloadCases(); // restore the canonical rows (undo the in-memory patch)
    }
  };

  // --- DERIVED DATA ---
  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      const matchesSearch = (c.patientName?.toLowerCase() || '').includes(search.toLowerCase()) || (c.id?.toLowerCase() || '').includes(search.toLowerCase());
      // Multi-service rollout: a visit matches the picked modality when
      // ANY of its service lines does. v1 rows (no services array)
      // fall back to comparing the scalar modality field.
      const matchesModality = matchesAnyModality(c, filters.modality);
      const matchesPriority = filters.priority === 'ALL' || c.priority === filters.priority;
      
      const status = c.status?.toLowerCase();
      // The count tiles double as filters (Nov 2026): WAITING = scanned or being
      // written; REPORTED = signed (incl. completed); EXPECTED = not scanned yet.
      const fs = filters.clinicalStatus;
      const matchesStatus = fs === 'ALL'
        || (fs === 'WAITING' ? c.isWaiting
          : fs === 'REPORTED' ? ['reported', 'completed'].includes(status) && (view === 'HISTORY' || c.isToday)
          : fs === 'DELIVERED' ? status === 'delivered' && c.isToday
          : fs === 'EXPECTED' ? c.isToday && ['scheduled', 'confirmed', 'in_progress', 'booked'].includes(status)
          : status === fs.toLowerCase());
      // Normalize UUIDs to lowercase before comparing to handle API casing differences
      const normalizedSelected = selectedDoctor?.toLowerCase();
      // A doctor's own queue also shows studies nobody has been assigned to,
      // so unassigned scans can't sit unseen.
      const unassigned = !c.doctorId && !c.doctor;
      const matchesDoctor =
        selectedDoctor === 'ALL' ||
        unassigned ||
        (c.doctorId && c.doctorId.toLowerCase() === normalizedSelected) ||
        c.doctor === doctors.find(d => d.id?.toLowerCase() === normalizedSelected)?.name;

      if (view === 'QUEUE') {
        // Today's visits PLUS any earlier day's scan still waiting for its
        // report — the backlog used to drop off at midnight.
        return matchesDoctor && matchesSearch && matchesModality && matchesPriority && matchesStatus && (c.isToday || c.isWaiting) && ['scheduled', 'confirmed', 'in_progress', 'scanned', 'reporting', 'booked', 'reported', 'completed', 'delivered'].includes(status);
      } else {
        const studyDate = c.dateTime ? c.dateTime.split('T')[0] : null;
        const matchesDate = archiveFilterMode === 'ALL' || (studyDate && studyDate >= archiveDateRange.start && studyDate <= archiveDateRange.end);
        return matchesDoctor && matchesSearch && matchesModality && matchesPriority && matchesStatus && matchesDate && (status === 'reported' || (!c.isToday && !c.isWaiting));
      }
    });
  }, [cases, search, filters, view, archiveFilterMode, archiveDateRange, selectedDoctor, doctors]);

  const sortedCases = useMemo(() => {
    const sortableItems = [...filteredCases];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        // Priority floats STATs to the top regardless of which column the
        // user is sorting by. Mirrors backend GetAppointmentsQuery.
        const rank = { STAT: 0, URGENT: 1, ROUTINE: 2 };
        const pa = rank[a.priority] ?? 2;
        const pb = rank[b.priority] ?? 2;
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
  }, [filteredCases, sortConfig]);

  const paginatedCases = useMemo(() => {
    if (view === 'QUEUE') return sortedCases;
    const start = (archivePage - 1) * itemsPerPage;
    return sortedCases.slice(start, start + itemsPerPage);
  }, [sortedCases, view, archivePage]);

  const totalPages = Math.ceil(filteredCases.length / itemsPerPage);

  useEffect(() => {
    setArchivePage(1);
  }, [search, filters, view, archiveFilterMode, archiveDateRange]);

  // Oldest scan still waiting for its report (hours), any day.
  const oldestWaitingHours = (() => {
    const times = cases.filter(c => c.isWaiting)
      .map(c => new Date(c.scannedAt || c.scanStartedAt || c.arrivedAt || c.dateTime || 0).getTime())
      .filter(t => t > 0);
    if (!times.length) return null;
    return Math.max(0, Math.floor((now - Math.min(...times)) / 3600000));
  })();

  const stats = {
    pendingReports: cases.filter(c => c.isWaiting).length,
    drafts: cases.filter(c => c.status?.toLowerCase() === 'reporting').length,
    finalizedToday: cases.filter(c => ['reported', 'completed'].includes(c.status?.toLowerCase()) && c.isToday).length,
    delivered: cases.filter(c => c.isToday && c.status?.toLowerCase() === 'delivered').length,
    upcoming: cases.filter(c => c.isToday && ['scheduled', 'confirmed', 'in_progress', 'booked'].includes(c.status?.toLowerCase())).length,
    archiveTotal: cases.filter(c => !c.isToday || c.status?.toLowerCase() === 'reported').length,
    archiveFinalized: cases.filter(c => c.status?.toLowerCase() === 'reported').length,
    archiveDrafts: cases.filter(c => !c.isToday && c.status?.toLowerCase() === 'reporting').length,
  };

  // --- HANDLERS ---
  const handleOpenWorkspace = async (c) => {
    // Update status to reporting if not already reporting, reported, completed, or delivered
    const currentStatus = c.status?.toLowerCase();
    if (!['reporting', 'reported', 'completed', 'delivered'].includes(currentStatus)) {
      await handleStatusUpdate(c.appointmentId || c.id, 'reporting');
    }

    // Multi-service rollout — when the visit carries many service lines,
    // jump the radiologist straight to the first one without a finalised
    // report so they land on the actual outstanding work. Single-service
    // visits behave exactly as before (no serviceId in the URL).
    const lines = getServiceLines(c);
    const target = lines.find(l => l.id && !['REPORTED', 'DELIVERED'].includes((l.status || '').toUpperCase()))
                || lines.find(l => l.id)
                || null;
    const apptId = c.appointmentId || c.id;
    // Remember the waiting queue in the order on screen, so signing a report
    // can go straight to the next patient instead of back to this list.
    try {
      const queue = sortedCases
        .filter(x => x.isWaiting || (x.appointmentId || x.id) === apptId)
        .map(x => ({ id: x.appointmentId || x.id, name: x.patientName || '', status: String(x.status || '').toLowerCase() }));
      sessionStorage.setItem('1rad_report_queue', JSON.stringify(queue));
    } catch { /* storage unavailable — signing just returns to the list */ }
    const url = target?.id ? `/reporting/${apptId}?serviceId=${encodeURIComponent(target.id)}` : `/reporting/${apptId}`;
    navigate(url);
  };

  const handlePreviewPrint = async (c) => {
    try {
      setLoading(true);
      setPreviewAppointment(c);
      
      // Attempt to fetch existing report for this appointment
      const svcId = previewServiceId(c);
      setPreviewServiceId(svcId);
      const reportRes = await apiClient.get(`/Reporting/report/${c.appointmentId || c.id}`, { params: svcId ? { serviceId: svcId } : undefined }).catch(() => null);
      const body = reportRes?.data;
      const r = (body?.success && body?.data) ? body.data : body;

      if (r && (r.findings !== undefined || r.impression !== undefined)) {
        setPreviewReport({
          mode: r.reportingMode || r.mode || 'Narrative Editor',
          text: r.findings || '',
          data: r.structuredData,
          impression: r.impression || '',
          advice: r.advice || '',
          isFinalized: !!r.isFinalized || /final|addend/i.test(String(r.status || ''))
        });
      } else {
        setPreviewReport({
          mode: 'Narrative Editor',
          text: '',
          impression: '',
          advice: '',
          isFinalized: false
        });
      }
      
      setIsPreviewOpen(true);
    } catch (err) {
      console.error('[DOCTOR] Preview preparation failed', err);
    } finally {
      setLoading(false);
    }
  };



  // ── Look (rebuilt Nov 2026) ───────────────────────────────────────────────
  // One compact row per visit (one card on phones), counts that double as
  // filters, plain-word statuses, and the report button always in view.
  const STATUS_WORD = (c) => {
    const s = String(c.status || '').toLowerCase();
    if (s === 'scanned') return { text: tr('stage.waitingReport'), fg: '#9A3412', bg: '#FFEDD5' };
    if (s === 'reporting') return { text: tr('stage.drafting'), fg: '#92400E', bg: '#FEF3C7' };
    if (s === 'reported' || s === 'completed') return { text: tr('stage.reportReady'), fg: '#166534', bg: '#DCFCE7' };
    if (s === 'delivered') return { text: tr('stage.given'), fg: '#065F46', bg: '#D1FAE5' };
    if (s === 'in_progress') return { text: tr('stage.inScan'), fg: '#1E40AF', bg: '#DBEAFE' };
    if (s === 'confirmed' || isPatientArrived(c)) return { text: tr('stage.arrived'), fg: '#3730A3', bg: '#EEF2FF' };
    return { text: tr('stage.notArrived'), fg: '#4B5563', bg: '#F3F4F6' };
  };
  const MOD_TINT = (m) => ({
    'X-RAY': '#047857', XRAY: '#047857', CT: '#1D4ED8', MRI: '#6D28D9', ULTRASOUND: '#0E7490', USG: '#0E7490',
    MAMMOGRAPHY: '#BE185D', MG: '#BE185D', DEXA: '#B45309', PET: '#C2410C', ECG: '#B91C1C',
  }[String(m || '').toUpperCase()] || '#3730A3');
  const LINE_WORD = (s) => ({ DELIVERED: 'given', REPORTED: 'signed', SCANNED: 'to report', IN_MID: 'half way', IN_PROGRESS: 'in scan', CANCELLED: 'cancelled' }[String(s || '').toUpperCase()] || '');
  const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }) : '—');
  const dateOf = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }) : '');
  const titleCase = (s) => String(s || 'Unnamed patient').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());

  const actionFor = (c) => {
    const s = String(c.status || '').toLowerCase();
    const isActive = ['scheduled', 'confirmed', 'in_progress', 'scanned', 'reporting', 'booked', 'reported', 'completed', 'delivered'].includes(s) && (c.isToday || c.isWaiting);
    const arrived = isPatientArrived(c);
    const enabled = view === 'HISTORY' || (isActive && arrived);
    const label = !enabled && !arrived ? tr('stage.notArrived')
      : s === 'delivered' ? 'View report' : (s === 'reported' || s === 'completed') ? 'Review' : s === 'reporting' ? 'Continue' : s === 'scanned' ? 'Write report' : 'Open';
    const primary = s === 'scanned' || s === 'reporting';
    return { enabled, label, primary };
  };

  const TILES = view === 'QUEUE' ? [
    { key: 'WAITING', label: tr('stage.waitingReport'), value: stats.pendingReports, tone: '#9A3412', soft: '#FFF7ED', strong: true },
    { key: 'REPORTING', label: tr('stage.drafting'), value: stats.drafts, tone: '#92400E', soft: '#FFFBEB' },
    { key: 'REPORTED', label: tr('stage.signedToday'), value: stats.finalizedToday, tone: '#166534', soft: '#F0FDF4' },
    { key: 'DELIVERED', label: tr('stage.given'), value: stats.delivered, tone: '#065F46', soft: '#ECFDF5' },
    { key: 'EXPECTED', label: tr('stage.waitingScan'), value: stats.upcoming, tone: '#1E40AF', soft: '#EFF6FF' },
  ] : [
    { key: 'ALL', label: 'All earlier', value: stats.archiveTotal, tone: '#111827', soft: '#F9FAFB' },
    { key: 'REPORTED', label: 'Signed', value: stats.archiveFinalized, tone: '#166534', soft: '#F0FDF4' },
    { key: 'REPORTING', label: 'Drafts left open', value: stats.archiveDrafts, tone: '#92400E', soft: '#FFFBEB' },
  ];

  const selectStyle = { height: 44, padding: '0 12px', borderRadius: 10, border: '1.5px solid #D1D5DB', fontSize: 14, fontWeight: 600, background: 'white', color: '#111827', minWidth: 0, fontFamily: 'inherit' };
  const activeFilters = [selectedDoctor, filters.modality, filters.priority].filter(v => v !== 'ALL').length;
  const GRID = 'minmax(0,52px) minmax(0,1.5fr) minmax(0,2fr) minmax(0,92px) minmax(0,1fr) minmax(0,128px) minmax(0,200px)';

  const renderRow = (c) => {
    const st = STATUS_WORD(c);
    const act = actionFor(c);
    const lines = getServiceLines(c);
    const progress = getReportProgressLabel(c);
    const overdue = isOverdue(c.appointmentId);
    const stripe = (overdue || c.priority === 'STAT') ? '#DC2626' : c.priority === 'URGENT' ? '#F59E0B' : 'transparent';
    const here = c.arrivedAt ? formatElapsed(c.arrivedAt, c.deliveredAt) : null;
    const sev = premisesPillStyle(premisesSeverity(c.arrivedAt, c.deliveredAt));
    const doctorName = c.doctor || doctors.find(d => d.id === c.doctorId)?.name || '';
    const sinceOld = c.isWaiting && !c.isToday && c.dateTime;

    const tests = (
      <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
        {lines.map((line, idx) => {
          const cancelled = String(line.status || '').toUpperCase() === 'CANCELLED';
          const word = LINE_WORD(line.status);
          return (
            <div key={line.id || `${line.modality}-${idx}`} style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, opacity: cancelled ? 0.5 : 1 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: MOD_TINT(line.modality), letterSpacing: 0.3, flexShrink: 0 }}>{line.modality || 'OT'}</span>
              <span title={line.serviceName} style={{ fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: cancelled ? 'line-through' : 'none' }}>{line.serviceName || '—'}</span>
              {lines.length > 1 && word && <span style={{ fontSize: 12, color: '#6B7280', flexShrink: 0 }}>· {word}</span>}
            </div>
          );
        })}
        {(progress || c.technicianComments) && (
          <div style={{ fontSize: 12, color: '#4B5563', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.technicianComments || undefined}>
            {progress && <strong style={{ color: '#166534' }}>{progress}</strong>}{progress && c.technicianComments ? ' · ' : ''}{c.technicianComments ? `Scan note: ${c.technicianComments}` : ''}
          </div>
        )}
      </div>
    );

    const buttons = (
      <div style={{ display: 'flex', gap: 8, justifyContent: vp.phone ? 'stretch' : 'flex-end' }}>
        <button type="button" onClick={(e) => { e.stopPropagation(); handlePreviewPrint(c); }} title="Preview and print"
          aria-label={`Preview and print report for ${c.patientName || 'patient'}`}
          style={{ height: 40, minWidth: 44, padding: vp.phone ? '0 14px' : 0, borderRadius: 10, border: '1.5px solid #D1D5DB', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#374151', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M7 14h10v7H7z" /></svg>
          {vp.phone && 'Print'}
        </button>
        <button type="button" disabled={!act.enabled} onClick={() => handleOpenWorkspace(c)}
          title={!act.enabled ? 'Mark the patient as arrived at the front desk first' : undefined}
          style={{ height: 40, flex: vp.phone ? 1 : '0 0 auto', minWidth: 124, padding: '0 16px', borderRadius: 10, fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
            cursor: act.enabled ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
            border: act.enabled && !act.primary ? '1.5px solid #3730A3' : 'none',
            background: !act.enabled ? '#E5E7EB' : act.primary ? '#3730A3' : 'white',
            color: !act.enabled ? '#6B7280' : act.primary ? 'white' : '#3730A3' }}>
          {act.label}
        </button>
      </div>
    );

    if (vp.phone) {
      return (
        <div key={c.appointmentId} style={{ background: 'white', border: '1.5px solid #E5E7EB', borderLeft: `5px solid ${stripe === 'transparent' ? '#E5E7EB' : stripe}`, borderRadius: 14, padding: 12, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF2FF', color: '#3730A3', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{c.tokenNo || '–'}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#111827', lineHeight: 1.2 }}>{titleCase(c.patientName)}</div>
              <div style={{ fontSize: 13, color: '#6B7280' }}>{[c.id, c.patientGender, formatPatientAge(c.patientAge, '')].filter(Boolean).join(' · ')}</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: st.fg, background: st.bg, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>{st.text}</span>
          </div>
          {tests}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 13, color: '#4B5563' }}>
            <span>{c.isToday ? timeOf(c.dateTime) : `${dateOf(c.dateTime)}, ${timeOf(c.dateTime)}`}</span>
            {c.priority && c.priority !== 'ROUTINE' && <strong style={{ color: c.priority === 'STAT' ? '#B91C1C' : '#B45309' }}>{c.priority === 'STAT' ? 'STAT' : 'Urgent'}</strong>}
            {overdue && <strong style={{ color: '#B91C1C' }}>Overdue</strong>}
            <span>{doctorName || 'No doctor yet'}</span>
            {here && <span style={{ color: sev.color, fontWeight: 700 }}>⏱ {here} here</span>}
            {sinceOld && <strong style={{ color: '#B45309' }}>Waiting since {dateOf(c.dateTime)}</strong>}
          </div>
          {buttons}
        </div>
      );
    }

    return (
      <div key={c.appointmentId} role="row" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, alignItems: 'center', padding: '10px 16px 10px 12px', borderTop: '1px solid #F1F5F9', borderLeft: `4px solid ${stripe}`, background: 'white' }}>
        <div role="cell" style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF2FF', color: '#3730A3', fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Token">{c.tokenNo || '–'}</div>
        <div role="cell" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleCase(c.patientName)}</div>
          <div style={{ fontSize: 13, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[c.id, c.patientGender, formatPatientAge(c.patientAge, '')].filter(Boolean).join(' · ')}
          </div>
          {(sinceOld || (c.priority && c.priority !== 'ROUTINE') || overdue) && (
            <div style={{ display: 'flex', gap: 8, fontSize: 12, fontWeight: 800, marginTop: 2 }}>
              {c.priority && c.priority !== 'ROUTINE' && <span style={{ color: c.priority === 'STAT' ? '#B91C1C' : '#B45309' }}>{c.priority === 'STAT' ? 'STAT' : 'Urgent'}</span>}
              {overdue && <span style={{ color: '#B91C1C' }}>Overdue</span>}
              {sinceOld && <span style={{ color: '#B45309' }}>Waiting since {dateOf(c.dateTime)}</span>}
            </div>
          )}
        </div>
        <div role="cell" style={{ minWidth: 0 }}>{tests}</div>
        <div role="cell" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>{timeOf(c.dateTime)}</div>
          {!c.isToday && <div style={{ fontSize: 12, color: '#6B7280' }}>{dateOf(c.dateTime)}</div>}
          {here && <div title={c.deliveredAt ? 'Total time at the centre' : 'Time at the centre so far'} style={{ fontSize: 12, fontWeight: 700, color: sev.color }}>⏱ {here}</div>}
        </div>
        <div role="cell" style={{ fontSize: 14, color: doctorName ? '#374151' : '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{doctorName || 'No doctor yet'}</div>
        <div role="cell"><span style={{ fontSize: 12, fontWeight: 800, color: st.fg, background: st.bg, padding: '5px 10px', borderRadius: 999, whiteSpace: 'nowrap', display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.text}</span></div>
        <div role="cell">{buttons}</div>
      </div>
    );
  };

  const sortHead = (key, label, align) => (
    <button type="button" onClick={() => handleSort(key)} aria-label={`Sort by ${label}`}
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: align || 'left', textTransform: 'inherit', letterSpacing: 'inherit' }}>
      {label}{sortConfig.key === key ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  );

  const renderQueue = () => (
    <div style={{ background: '#F6F7FB', minHeight: '100%', fontFamily: "'Inter', system-ui, sans-serif", color: '#111827', padding: vp.phone ? '12px 12px 24px' : '20px 28px 32px', display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0,1fr)', alignContent: 'start' }}>
      {/* Title + Today / Earlier */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: vp.phone ? 22 : 26, fontWeight: 800, margin: 0, letterSpacing: '-0.3px' }}>{tr('page.reports')}</h1>
          <p style={{ fontSize: 14, color: '#4B5563', margin: '2px 0 0' }}>
            {view === 'QUEUE' ? tr('page.reportsSub') : 'Reports from earlier days'}
            {view === 'QUEUE' && oldestWaitingHours != null && stats.pendingReports > 0 && (
              <> · <strong style={{ color: oldestWaitingHours >= 24 ? '#B91C1C' : '#9A3412' }}>oldest waiting {oldestWaitingHours < 1 ? 'under an hour' : `${oldestWaitingHours} h`}</strong></>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div role="tablist" aria-label="Which reports" style={{ display: 'flex', background: 'white', border: '1.5px solid #E5E7EB', borderRadius: 12, padding: 3 }}>
            {[['QUEUE', tr('filter.today')], ['HISTORY', tr('filter.past')]].map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => { setView(k); setFilters(f => ({ ...f, clinicalStatus: 'ALL' })); }}
                style={{ height: 38, padding: '0 18px', borderRadius: 9, border: 'none', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
                  background: view === k ? '#111827' : 'transparent', color: view === k ? 'white' : '#4B5563' }}>{label}</button>
            ))}
          </div>
          <button type="button" onClick={fetchCases} aria-label="Refresh" title="Refresh"
            style={{ width: 44, height: 44, borderRadius: 12, border: '1.5px solid #E5E7EB', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 4v5h-5" /></svg>
          </button>
        </div>
      </div>

      {/* Counts — tap one to show just those */}
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: vp.phone ? 'repeat(3, minmax(0,1fr))' : `repeat(${TILES.length}, minmax(0,1fr))` }}>
        {TILES.map(k => {
          const on = filters.clinicalStatus === k.key || (k.key === 'ALL' && filters.clinicalStatus === 'ALL');
          return (
            <button key={k.key} type="button" aria-pressed={on}
              onClick={() => setFilters(f => ({ ...f, clinicalStatus: f.clinicalStatus === k.key ? 'ALL' : k.key }))}
              style={{ textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', borderRadius: 14, padding: vp.phone ? '8px 10px' : '12px 14px',
                background: on ? k.soft : 'white', border: `1.5px solid ${on ? k.tone : '#E5E7EB'}`, boxShadow: on ? `0 0 0 2px ${k.soft}` : 'none', display: 'grid', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: vp.phone ? 11 : 12, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.2 }}>{k.label}</span>
              <span style={{ fontSize: vp.phone ? 22 : 28, fontWeight: 800, color: k.value > 0 || k.key === 'ALL' ? k.tone : '#9CA3AF', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{k.value}</span>
            </button>
          );
        })}
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" aria-label="Search by patient name or ID" placeholder="Patient name or ID" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 44, padding: '0 14px 0 42px', borderRadius: 10, border: search.startsWith('ID:') ? '2px solid #3730A3' : '1.5px solid #D1D5DB', fontSize: 15, outline: 'none', background: search.startsWith('ID:') ? '#EEF2FF' : 'white', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </div>
        {vp.phone && (
          <button type="button" onClick={() => setFiltersOpen(o => !o)} aria-expanded={filtersOpen}
            style={{ ...selectStyle, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: filtersOpen || activeFilters ? '#EEF2FF' : 'white', borderColor: filtersOpen || activeFilters ? '#A5B4FC' : '#D1D5DB', color: '#3730A3', fontWeight: 800 }}>
            Filters{activeFilters ? ` · ${activeFilters}` : ''}
          </button>
        )}
        {(!vp.phone || filtersOpen) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: vp.phone ? '1 1 100%' : '0 1 auto' }}>
            <select aria-label="Doctor" value={selectedDoctor} onChange={e => setSelectedDoctor(e.target.value)} style={{ ...selectStyle, flex: vp.phone ? '1 1 45%' : '0 0 auto' }}>
              <option value="ALL">All doctors</option>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select aria-label="Scan type" value={filters.modality} onChange={e => setFilters({ ...filters, modality: e.target.value })} style={{ ...selectStyle, flex: vp.phone ? '1 1 45%' : '0 0 auto' }}>
              <option value="ALL">All scan types</option>
              {Object.keys(MODALITY_ICONS).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select aria-label="Priority" value={filters.priority} onChange={e => setFilters({ ...filters, priority: e.target.value })} style={{ ...selectStyle, flex: vp.phone ? '1 1 45%' : '0 0 auto' }}>
              <option value="ALL">Any priority</option>
              <option value="STAT">STAT</option>
              <option value="URGENT">Urgent</option>
              <option value="ROUTINE">Routine</option>
            </select>
            {view === 'HISTORY' && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <select aria-label="Dates" value={archiveFilterMode} onChange={e => setArchiveFilterMode(e.target.value)} style={selectStyle}>
                  <option value="ALL">Any date</option>
                  <option value="RANGE">Between dates</option>
                </select>
                {archiveFilterMode === 'RANGE' && (
                  <>
                    <input type="date" aria-label="From" value={archiveDateRange.start} onChange={e => setArchiveDateRange({ ...archiveDateRange, start: e.target.value })} style={selectStyle} />
                    <span style={{ color: '#6B7280' }}>to</span>
                    <input type="date" aria-label="To" value={archiveDateRange.end} onChange={e => setArchiveDateRange({ ...archiveDateRange, end: e.target.value })} style={selectStyle} />
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* The list */}
      <div role="table" aria-label="Reports" style={vp.phone ? { display: 'grid', gap: 10 } : { background: 'white', border: '1.5px solid #E5E7EB', borderRadius: 16, overflow: 'hidden' }}>
        {!vp.phone && (
          <div role="row" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, padding: '10px 16px 10px 16px', background: '#F9FAFB', fontSize: 12, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <span role="columnheader">{sortHead('tokenNo', 'No.')}</span>
            <span role="columnheader">{sortHead('patientName', 'Patient')}</span>
            <span role="columnheader">{sortHead('service', 'Tests')}</span>
            <span role="columnheader">{sortHead('dateTime', 'Time')}</span>
            <span role="columnheader">{sortHead('doctorId', 'Doctor')}</span>
            <span role="columnheader">{sortHead('status', 'Status')}</span>
            <span role="columnheader" style={{ textAlign: 'right' }}></span>
          </div>
        )}
        {paginatedCases.map(renderRow)}
        {filteredCases.length === 0 && !loading && !listLoading && (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: '#6B7280', fontSize: 15, background: 'white', borderRadius: vp.phone ? 14 : 0 }}>
            {search || activeFilters || filters.clinicalStatus !== 'ALL' ? 'Nothing matches these filters.' : view === 'QUEUE' ? 'No reports to write right now.' : 'No earlier reports.'}
          </div>
        )}
        {view === 'HISTORY' && totalPages > 1 && (
          <div style={{ padding: '10px 16px', background: '#F9FAFB', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: vp.phone ? 12 : 0 }}>
            <span style={{ fontSize: 14, color: '#4B5563' }}>Page {archivePage} of {totalPages} · {filteredCases.length} reports</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setArchivePage(p => Math.max(1, p - 1))} disabled={archivePage === 1} style={{ ...selectStyle, cursor: archivePage === 1 ? 'not-allowed' : 'pointer', opacity: archivePage === 1 ? 0.5 : 1 }}>Previous</button>
              <button type="button" onClick={() => setArchivePage(p => Math.min(totalPages, p + 1))} disabled={archivePage === totalPages} style={{ ...selectStyle, cursor: archivePage === totalPages ? 'not-allowed' : 'pointer', opacity: archivePage === totalPages ? 0.5 : 1 }}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="page-wrapper" style={{ padding: 0, background: '#F6F7FB' }}>
      {renderQueue()}

      
      <Suspense fallback={null}>
        <ReportPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          doctorId={previewAppointment?.doctorId}
          appointmentId={previewAppointment?.appointmentId || previewAppointment?.id}
          patientData={previewAppointment}
          appointmentServiceId={previewSvcId}
          reportContent={previewReport}
        />
      </Suspense>
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
