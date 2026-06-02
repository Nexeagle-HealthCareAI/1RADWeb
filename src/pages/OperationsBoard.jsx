import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import apiClient from '../api/apiClient';
import useTickClock from '../utils/useTickClock';
import { formatElapsed, premisesSeverity, premisesPillStyle } from '../utils/timeTracking';
import { useOverdue } from '../components/OverdueAppointments/OverdueContext';
import { getServiceLines, getUniqueModalities, matchesAnyModality, getReportProgressLabel, getStageElapsedMinutes, formatStageElapsed, getStageSlaBucket } from '../utils/appointmentServices';
import '../styles/global.css';
import '../styles/AppointmentBoard.css';

// Badge colour tokens — used only in badge helper functions, not for layout
const T = {
  bg: '#f8fafc',
  cardBg: '#ffffff',
  border: '#e2e8f0',
  borderHover: '#cbd5e1',
  accent: '#0f52ba', // Sapphire Blue
  accentHover: '#0c46a0', // Deep Navy
  textHigh: '#0f172a', // Charcoal slate
  textMid: '#475569', // Muted slate
  textLow: '#94a3b8', // Light slate
  filterBg: '#f1f5f9', // soft filter backdrop
  font: 'system-ui, -apple-system, sans-serif', // Exact RevenueHub font family
  
  // Clean Status Badges
  slate: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  blue: { bg: '#eff6ff', text: '#0f52ba', border: '#bfdbfe' },
  amber: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  emerald: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  rose: { bg: '#fff1f2', text: '#b91c1c', border: '#fecaca' }
};

export default function OperationsBoard() {
  // 60s tick keeps the on-premises pill counting up; isOverdue mirrors the bell.
  useTickClock();
  const { isOverdue } = useOverdue();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modality, setModality] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  // List vs. Modality-Queue view toggle. The list is the existing
  // appointment-per-row table; the queue pivots service lines by
  // modality so the front desk can see what's pending in each room.
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'queue'

  // Responsive breakpoints — matches AppointmentBoard. isMobile drives the
  // fine-grained phone tweaks; isCompact (phone + tablet) drives the bigger
  // structural choice of card layout vs. the wide desktop table, so tablets
  // (768–1024) get a comfortable 2-up card grid instead of a cramped table.
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isMobile = windowWidth < 768;
  const isCompact = windowWidth < 1024;
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Per-service TAT chips display whole minutes, so a 60s tick is enough
  // to keep them honest without burning CPU on a re-render every second.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Which worklist rows have the full per-service ledger expanded.
  // Collapsed by default — the first row shows a compact gist (modality
  // chips + service count), click the toggle to open a sub-row with
  // the full per-line breakdown + inline notes + status edit hooks.
  // Mirrors the same pattern as AppointmentBoard.
  const [expandedLedgers, setExpandedLedgers] = useState(() => new Set());
  const toggleLedger = (apptId) => {
    setExpandedLedgers(prev => {
      const next = new Set(prev);
      if (next.has(apptId)) next.delete(apptId); else next.add(apptId);
      return next;
    });
  };
  
  // Pagination State Matrix
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Stateful custom local toasts
  const [toasts, setToasts] = useState([]);
  
  // Selected date matrix - defaults to today
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Modal override states
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newReason, setNewReason] = useState('');
  const [saving, setSaving] = useState(false);
  // Export uses an async path now (bulk-fetches comments), so we lock the
  // button while it's running to prevent a re-click spawning a second pull.
  const [exporting, setExporting] = useState(false);

  // Comment timeline popup. Loaded on demand because per-row counts aren't
  // useful and the full list could be large; we only need it when the user
  // explicitly asks to see history.
  const [commentsModal, setCommentsModal] = useState({ open: false, appointment: null });
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const fetchComments = useCallback(async (appointmentId) => {
    if (!appointmentId) return;
    setCommentsLoading(true);
    try {
      const res = await apiClient.get(`/appointments/${appointmentId}/comments`);
      setComments(res?.data?.items ?? []);
    } catch (err) {
      console.error('[OPS] comments fetch failed', err);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  const openCommentsModal = useCallback((appt) => {
    setCommentsModal({ open: true, appointment: appt });
    setComments([]);
    fetchComments(appt.appointmentId);
  }, [fetchComments]);

  const closeCommentsModal = () => setCommentsModal({ open: false, appointment: null });

  // Trigger stateful local notifications
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Fetch appointments list
  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/appointments');
      const allAppts = Array.isArray(response.data) ? response.data : [];
      setAppointments(allAppts);
    } catch (err) {
      console.error(err);
      showToast('Failed to retrieve active board appointments.', 'error');
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  // Reset pagination to first page when filtering parameters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, modality, statusFilter, selectedDate]);

  // Update operations status override.
  //
  // Two separate API calls now: the status PUT and (optionally) a comment
  // POST. We deliberately STOP sending delayReason on the status PUT — the
  // /comments endpoint owns that field server-side now, mirroring the latest
  // comment onto Appointment.DelayReason so worklist rows keep working
  // without a join. This is what stops history from being overwritten.
  // Single per-service status transition used across the OpsBoard
  // queue view. OpsBoard is the consolidated status command centre:
  // - NOT_STARTED → SCANNED (front desk override when no DICOM lands)
  // - REPORTED → DELIVERED (patient picks up the report)
  // SCANNED → REPORTED is driven automatically by the doctor's save
  // on ReportingPage, so we don't expose it here.
  const handleAdvanceServiceStatus = async (appointmentId, serviceId, nextStatus) => {
    if (!appointmentId || !serviceId || !nextStatus) return;
    try {
      await apiClient.patch(
        `/appointments/${appointmentId}/services/${serviceId}/status`,
        { status: nextStatus }
      );
      // Best-effort refresh — the parent already polls but a manual
      // refetch nudges the user's view ahead of the next poll tick.
      try { fetchAppointments?.(); } catch (_) { /* not always wired */ }
    } catch (err) {
      console.error('[OPS] Service status update failed', err);
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Could not update this service. Please try again.';
      showToast(msg, 'error');
    }
  };

  // Per-service notes — saves to AppointmentService.TechnicianComments
  // via the PATCH /notes endpoint. Empty string clears the note.
  const handleUpdateServiceNotes = async (appointmentId, serviceId, notes) => {
    if (!appointmentId || !serviceId) return;
    try {
      await apiClient.patch(
        `/appointments/${appointmentId}/services/${serviceId}/notes`,
        { notes: notes ?? '' }
      );
      try { fetchAppointments?.(); } catch (_) { /* parent may not pass it */ }
    } catch (err) {
      console.error('[OPS] Service notes update failed', err);
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Could not save these notes. Please try again.';
      showToast(msg, 'error');
    }
  };

  // Service-pill popover state — { appointmentId, serviceId, anchorRect }.
  // anchorRect is the bounding rect of the clicked pill so we can park
  // the popover next to it without depending on a portal/library.
  const [servicePopover, setServicePopover] = useState(null);
  const openServicePopover = (e, appt, line) => {
    e.stopPropagation();
    if (!line.id) return; // legacy synthetic line — nothing to edit
    const rect = e.currentTarget.getBoundingClientRect();
    setServicePopover({
      appointmentId: appt.appointmentId,
      serviceId:     line.id,
      modality:      line.modality,
      serviceName:   line.serviceName,
      status:        String(line.status || 'NOT_STARTED').toUpperCase(),
      notes:         line.notes || '',
      anchorRect:    { top: rect.top, left: rect.left, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right },
    });
  };
  const closeServicePopover = () => setServicePopover(null);
  const saveServicePopover = async (draft) => {
    if (!servicePopover) return;
    const { appointmentId, serviceId, status: originalStatus, notes: originalNotes } = servicePopover;
    const tasks = [];
    if (draft.status !== originalStatus) {
      tasks.push(handleAdvanceServiceStatus(appointmentId, serviceId, draft.status));
    }
    if ((draft.notes || '') !== (originalNotes || '')) {
      tasks.push(handleUpdateServiceNotes(appointmentId, serviceId, draft.notes));
    }
    if (tasks.length === 0) { closeServicePopover(); return; }
    await Promise.all(tasks);
    closeServicePopover();
  };

  // Visit-level note handler. The old "override status" path is gone:
  // per-service status changes now flow through the pill popover and
  // drive the parent rollup server-side, so the only thing left to
  // edit at the visit level is the cross-service narrative (e.g.
  // "patient hasn't arrived yet" — applies to ALL services, not one).
  const handleAddVisitNote = async (e) => {
    e.preventDefault();
    if (!selectedItem) return;

    const body = newReason.trim();
    if (body.length === 0) { setModalOpen(false); return; }

    setSaving(true);
    try {
      await apiClient.post(`/appointments/${selectedItem.appointmentId}/comments`, { body });
      showToast('Visit note saved.', 'success');
      setModalOpen(false);
      setNewReason('');
      fetchAppointments();
    } catch (err) {
      console.error(err);
      showToast('Failed to save visit note.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openVisitNoteModal = (appt) => {
    setSelectedItem(appt);
    // Start the textarea empty — the previous comment is shown as read-only
    // context above the input so the user knows what was there. We never
    // overwrite an existing comment; new entries always append to the
    // visit's comment timeline.
    setNewReason('');
    setModalOpen(true);
  };

  // Filter grid
  const filteredAppointments = useMemo(() => {
    return Array.isArray(appointments) ? appointments.filter(appt => {
      const apptDate = appt.dateTime ? appt.dateTime.split('T')[0] : '';
      const dateMatch = apptDate === selectedDate;
      
      const searchLower = search.toLowerCase();
      // Search now also walks the service lines so a multi-service visit
      // surfaces when the user types any of its service names.
      const serviceLineNames = getServiceLines(appt).map(l => (l.serviceName || '').toLowerCase());
      const searchMatch = !search ||
        (appt.patientName && appt.patientName.toLowerCase().includes(searchLower)) ||
        (appt.displayId && appt.displayId.toLowerCase().includes(searchLower)) ||
        (appt.mobile && appt.mobile.includes(searchLower)) ||
        (appt.service && appt.service.toLowerCase().includes(searchLower)) ||
        serviceLineNames.some(n => n.includes(searchLower));

      // Multi-service rollout: match the picked modality against any
      // service line on the visit (with v1 scalar fallback).
      const modalityMatch = matchesAnyModality(appt, modality);
      // Per-service progress filter — picking "Scanned" surfaces any
      // visit with at least one service line in SCANNED state, not
      // only visits whose parent reportProgressStatus matches. Falls
      // back to the parent scalar for legacy rows without service
      // lines (getServiceLines synthesises a single line then).
      const progressMatch = statusFilter === 'ALL'
        || getServiceLines(appt).some(l => String(l.status || 'NOT_STARTED').toUpperCase() === statusFilter);
      
      return dateMatch && searchMatch && modalityMatch && progressMatch;
    }).sort((a, b) => {
      // Worklist order: STAT → URGENT → ROUTINE, then daily token ascending.
      // Mirrors AppointmentBoard / Technician / Doctor so the same patient
      // appears in the same relative position on every operations surface.
      const rank = { STAT: 0, URGENT: 1, ROUTINE: 2 };
      const pa = rank[a.priority] ?? 2;
      const pb = rank[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return (a.dailyTokenNumber ?? Infinity) - (b.dailyTokenNumber ?? Infinity);
    }) : [];
  }, [appointments, selectedDate, search, modality, statusFilter]);

  // Modality filter options derived from the ACTUAL data, not a hardcoded list.
  // The old static options ("US", "ECG") never matched the stored modality
  // values ("ULTRASOUND", …) so those filters silently returned nothing. Driving
  // the dropdown from real service lines means it always matches and only shows
  // modalities the centre actually runs — no guesswork for the operator.
  const availableModalities = useMemo(() => {
    const set = new Set();
    for (const appt of appointments) {
      for (const m of getUniqueModalities(appt)) {
        if (m && m !== 'OT') set.add(m); // 'OT' is the no-modality fallback
      }
    }
    return Array.from(set).sort();
  }, [appointments]);

  // Paginated partition matching BillingPage
  const paginatedAppointments = useMemo(() => {
    return filteredAppointments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredAppointments, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);

  // Per-SERVICE metrics. Counts AppointmentService line items (not
  // appointments) so a multi-service visit where X-Ray is delivered
  // but CT is still pending contributes accurately to BOTH the
  // Delivered and Not Started buckets instead of collapsing the whole
  // visit into one parent status. For visits that pre-date migration
  // 57 (or somehow have no service lines yet) we fall back to a
  // single synthesised line from the scalar fields via
  // getServiceLines, so legacy data still counts.
  const getMetrics = () => {
    const todayAppts = Array.isArray(appointments)
      ? appointments.filter(a => (a.dateTime ? a.dateTime.split('T')[0] : '') === selectedDate)
      : [];

    // Count appointments separately so the "Total Today" tile still
    // means "patients seen today" rather than "scans done today".
    const totalAppointments = todayAppts.length;

    const buckets = { notStarted: 0, scanned: 0, reported: 0, delivered: 0, totalLines: 0 };
    for (const appt of todayAppts) {
      for (const line of getServiceLines(appt)) {
        // Cancelled lines drop out — they shouldn't tilt the queue
        // counters or the productivity numbers.
        const status = String(line.status || 'NOT_STARTED').toUpperCase();
        if (status === 'CANCELLED') continue;
        buckets.totalLines += 1;
        if      (status === 'DELIVERED') buckets.delivered  += 1;
        else if (status === 'REPORTED')  buckets.reported   += 1;
        else if (status === 'SCANNED')   buckets.scanned    += 1;
        else                             buckets.notStarted += 1;
      }
    }

    return {
      total: totalAppointments,     // patients on the worklist today
      totalLines: buckets.totalLines, // scans on the worklist today
      notStarted: buckets.notStarted,
      scanned:    buckets.scanned,
      reported:   buckets.reported,
      delivered:  buckets.delivered,
    };
  };

  const metrics = getMetrics();

  // Report delivery progress status badge
  const getProgressBadge = (status) => {
    switch (status) {
      case 'STARTED':
        return { label: 'STARTED', style: T.blue };
      case 'IN_MID':
        return { label: 'IN MID', style: T.amber };
      case 'DELIVERED':
        return { label: 'DELIVERED', style: T.emerald };
      default:
        return { label: 'NOT STARTED', style: T.slate };
    }
  };

  // Standard 1Rad clinical stage badge mapping
  const getCoreStatusStyle = (status) => {
    const s = String(status || '').toLowerCase();
    switch (s) {
      case 'booked':
      case 'scheduled':
        return { label: 'BOOKED 📅', style: T.slate };
      case 'confirmed':
      case 'arrived':
        return { label: 'ARRIVED 📍', style: T.blue };
      case 'in_progress':
        return { label: 'SCANNING 🌀', style: T.amber };
      case 'scanned':
        return { label: 'ACQUIRED 📡', style: T.amber };
      case 'reporting':
        return { label: 'ANALYZING 📝', style: T.blue };
      case 'reported':
      case 'completed':
        return { label: 'FINALIZED ✅', style: T.emerald };
      default:
        return { label: String(status).toUpperCase(), style: T.slate };
    }
  };

  // Professional pagination matching AppointmentBoard
  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const itemStart = (currentPage - 1) * itemsPerPage + 1;
    const itemEnd   = Math.min(currentPage * itemsPerPage, filteredAppointments.length);

    const getPageNumbers = () => {
      if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
      const pages = [1];
      if (currentPage > 3) pages.push('...');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
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
          <button className="pagination-btn pagination-nav" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} title="First page">«</button>
          <button className="pagination-btn pagination-nav" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
            <span className="nav-label">Prev</span>
          </button>
          {getPageNumbers().map((page, i) =>
            page === '...'
              ? <span key={`el-${i}`} className="pagination-ellipsis">…</span>
              : <button key={page} className={`pagination-btn${currentPage === page ? ' active' : ''}`} onClick={() => setCurrentPage(page)}>{page}</button>
          )}
          <button className="pagination-btn pagination-nav" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
            <span className="nav-label">Next</span>
          </button>
          <button className="pagination-btn pagination-nav" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} title="Last page">»</button>
        </div>
      </div>
    );
  };

  // Excel export — exports current filtered appointments + full comment
  // trail. We POST every visible appointmentId in one bulk request so an
  // export of 200 patients is one HTTP round-trip, not 200.
  //
  // Layout (post multi-service rollout):
  //   Sheet 1 "Operations"  — one row per visit. Visit-level rollup +
  //      flattened summary of all services (modalities, services, per-
  //      stage counts), the visit's delay reason and the full
  //      chronological comment trail. Good for headcount reports.
  //   Sheet 2 "Services"    — one row per AppointmentService line, with
  //      its modality, service name, status, per-stage timestamps, TAT,
  //      technician notes, and back-reference to the visit identifiers.
  //      This is the sheet ops needs to answer "how long did CT cases
  //      spend in each stage today?".
  //   Sheet 3 "Comments"    — one row per visit-level comment so the
  //      analyst can pivot / sort by author or time across the export.
  const exportToExcel = async () => {
    if (!filteredAppointments.length) return;
    setExporting(true);

    // Bulk-fetch comments for the visible set. If the bulk endpoint fails
    // for any reason we still produce the spreadsheet — minus the timeline
    // — rather than block the user from getting their data out.
    let commentsByApptId = new Map();
    let allComments = [];
    try {
      const ids = filteredAppointments.map(a => a.appointmentId);
      const res = await apiClient.post('/appointments/comments/bulk', { appointmentIds: ids });
      allComments = res?.data?.items ?? [];
      for (const c of allComments) {
        if (!commentsByApptId.has(c.appointmentId)) commentsByApptId.set(c.appointmentId, []);
        commentsByApptId.get(c.appointmentId).push(c);
      }
    } catch (err) {
      console.warn('[OPS] bulk comments fetch failed — exporting without trail', err);
      showToast('Comment trail unavailable — exporting summary only', 'error');
    }

    const fmtDateTime = (iso) => {
      if (!iso) return '';
      const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
      const d = new Date(hasTz ? iso : iso + 'Z');
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString('en-GB', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
    };

    // Whole-minutes formatter for elapsed time export. Empty when we
    // don't have an anchor for the line (e.g. NOT_STARTED without
    // arrivedAt). Reads UTC anchors via the same helpers the UI uses.
    const fmtElapsed = (line, appt) => {
      const min = getStageElapsedMinutes(line, appt, Date.now());
      return min == null ? '' : formatStageElapsed(min);
    };
    const statusLabel = (s) => {
      const u = String(s || 'NOT_STARTED').toUpperCase();
      if (u === 'IN_PROGRESS') return 'In Progress';
      if (u === 'IN_MID')      return 'Half Way';
      return u.charAt(0) + u.slice(1).toLowerCase().replace(/_/g, ' ');
    };

    // Sheet 1: appointments + comment summary. Visit-level rollup row
    // with all services flattened into pipe-separated cells so even
    // multi-service visits stay readable on a single line.
    const rows = filteredAppointments.map((a) => {
      const trail = commentsByApptId.get(a.appointmentId) || [];
      const fullTrail = trail
        .map(c => `[${fmtDateTime(c.createdAt)} — ${c.authorName}]\n${c.body}`)
        .join('\n\n');

      const lines = getServiceLines(a);
      // Per-stage tally for the visit (non-cancelled lines only)
      const live = lines.filter(l => String(l.status || '').toUpperCase() !== 'CANCELLED');
      const tally = { notStarted: 0, inProgress: 0, scanned: 0, reported: 0, delivered: 0 };
      for (const l of live) {
        const s = String(l.status || 'NOT_STARTED').toUpperCase();
        if (s === 'DELIVERED')                          tally.delivered++;
        else if (s === 'REPORTED')                      tally.reported++;
        else if (s === 'SCANNED')                       tally.scanned++;
        else if (s === 'IN_PROGRESS' || s === 'IN_MID') tally.inProgress++;
        else                                             tally.notStarted++;
      }
      const modalitiesFlat = [...new Set(lines.map(l => l.modality).filter(Boolean))].join(' | ');
      const servicesFlat   = lines.map(l => l.serviceName).filter(Boolean).join(' | ');
      const statusesFlat   = lines.map(l => `${l.modality || 'OT'}:${statusLabel(l.status)}`).join(' | ');
      const onPremises     = a.arrivedAt ? formatElapsed(a.arrivedAt, a.deliveredAt) : '';
      const scanToDeliv    = (a.scanStartedAt && a.deliveredAt) ? formatElapsed(a.scanStartedAt, a.deliveredAt) : '';

      return {
        Token: a.dailyTokenNumber ?? '',
        'Display ID': a.displayId ?? '',
        'Patient ID': a.patientId ?? '',
        'Patient Name': a.patientName ?? '',
        Age: a.patientAge ?? '',
        Gender: a.patientGender ?? '',
        Mobile: a.mobile ?? '',
        Doctor: a.doctor ?? '',
        'Referred By': a.referredBy ?? '',
        Priority: a.priority ?? 'ROUTINE',
        'Service Count': lines.length,
        'Modalities (all)': modalitiesFlat,
        'Services (all)':   servicesFlat,
        'Per-Service Status': statusesFlat,
        'Pending': tally.notStarted,
        'In Progress / Half Way': tally.inProgress,
        'Scanned': tally.scanned,
        'Reported': tally.reported,
        'Delivered': tally.delivered,
        'Visit Status': a.status ?? '',
        'Progress Status': a.reportProgressStatus ?? '',
        'On Premises': onPremises,
        'Scan → Delivered': scanToDeliv,
        'Arrived At': fmtDateTime(a.arrivedAt),
        'Scan Started': fmtDateTime(a.scanStartedAt),
        'Scanned At':   fmtDateTime(a.scannedAt),
        'Delivered At': fmtDateTime(a.deliveredAt),
        'Latest Comment': a.delayReason ?? '',
        'Latest Comment By': a.latestCommentAuthorName ?? '',
        'Latest Comment At': fmtDateTime(a.latestCommentAt),
        'Comment Count': trail.length,
        'All Comments (oldest → newest)': fullTrail,
        Date: a.dateTime ? a.dateTime.split('T')[0] : '',
        Time: a.dateTime ? a.dateTime.split('T')[1]?.slice(0, 5) : '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    // Per-column widths. Order must match the keys above.
    ws['!cols'] = [
      { wch: 6 },  { wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 4 },  // Token, Display ID, Patient ID, Name, Age
      { wch: 6 },  { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 8 },  // Gender, Mobile, Doctor, Ref, Priority
      { wch: 8 },  { wch: 22 }, { wch: 36 }, { wch: 40 },               // Service Count, Modalities, Services, Per-Svc
      { wch: 8 },  { wch: 14 }, { wch: 8 },  { wch: 8 },  { wch: 8 },  // tally cols
      { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 14 },               // Visit/Progress Status, On Premises, S→D
      { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 },               // 4 timestamps
      { wch: 36 }, { wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 60 },  // Comment columns
      { wch: 12 }, { wch: 8 },                                          // Date, Time
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Operations');

    // Sheet 2 — per-service line items. One row per AppointmentService
    // so analysts can pivot per modality / status / technician.
    const serviceRows = [];
    for (const a of filteredAppointments) {
      const lines = getServiceLines(a);
      for (const l of lines) {
        serviceRows.push({
          Token: a.dailyTokenNumber ?? '',
          'Display ID': a.displayId ?? '',
          'Patient Name': a.patientName ?? '',
          'Patient ID': a.patientId ?? '',
          Mobile: a.mobile ?? '',
          Doctor: a.doctor ?? '',
          'Referred By': a.referredBy ?? '',
          Priority: a.priority ?? 'ROUTINE',
          Modality: l.modality ?? '',
          Service: l.serviceName ?? '',
          Status: statusLabel(l.status),
          'Stage Elapsed': fmtElapsed(l, a),
          'Scan Started':     fmtDateTime(l.scanStartedAt),
          'Scan Completed':   fmtDateTime(l.scanCompletedAt),
          'Reported At':      fmtDateTime(l.reportedAt),
          'Delivered At':     fmtDateTime(l.deliveredAt),
          'Cancelled At':     fmtDateTime(l.cancelledAt),
          'Technician Notes': l.notes ?? '',
          'Visit Date': a.dateTime ? a.dateTime.split('T')[0] : '',
        });
      }
    }
    if (serviceRows.length > 0) {
      const sws = XLSX.utils.json_to_sheet(serviceRows);
      sws['!cols'] = [
        { wch: 6 },  { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 14 },  // Token..Mobile
        { wch: 18 }, { wch: 18 }, { wch: 8 },  { wch: 12 }, { wch: 30 },  // Doctor..Service
        { wch: 14 }, { wch: 12 },                                          // Status, Elapsed
        { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 },  // 5 timestamps
        { wch: 50 }, { wch: 12 },                                          // Notes, Date
      ];
      XLSX.utils.book_append_sheet(wb, sws, 'Services');
    }

    // Sheet 3 — every visit-level comment as its own row.
    if (allComments.length > 0) {
      const apptById = new Map(filteredAppointments.map(a => [a.appointmentId, a]));
      const commentRows = allComments.map((c) => {
        const a = apptById.get(c.appointmentId);
        const aLines = a ? getServiceLines(a) : [];
        return {
          Token: a?.dailyTokenNumber ?? '',
          'Patient Name': a?.patientName ?? '',
          'Display ID': a?.displayId ?? '',
          Modalities: [...new Set(aLines.map(l => l.modality).filter(Boolean))].join(' | '),
          Author: c.authorName ?? '',
          'Created At': fmtDateTime(c.createdAt),
          Comment: c.body ?? '',
        };
      });
      const cws = XLSX.utils.json_to_sheet(commentRows);
      cws['!cols'] = [
        { wch: 6 }, { wch: 24 }, { wch: 14 }, { wch: 16 },
        { wch: 22 }, { wch: 22 }, { wch: 70 },
      ];
      XLSX.utils.book_append_sheet(wb, cws, 'Comments');
    }

    XLSX.writeFile(wb, `operations-${selectedDate}.xlsx`);
    setExporting(false);
  };

  // Date navigator helper
  const shiftDate = (days) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // ────────────────────────────────────────────────────────────────────
  //  Modality Queue view — pivots service lines from the filtered
  //  appointments by modality so the front desk can see what's
  //  pending in each scan room. Each column is a modality; inside
  //  the column, lines are grouped by status and shown as service
  //  cards with patient name, token, and a Mark Delivered action
  //  for reports that have been finalised.
  // ────────────────────────────────────────────────────────────────────
  const renderModalityQueue = (apptList) => {
    // Accent colour per modality. Falls back to slate for anything
    // we haven't tabled.
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
      if (s === 'DELIVERED')   return 6;
      if (s === 'REPORTED')    return 5;
      if (s === 'SCANNED')     return 4;
      if (s === 'IN_MID')      return 3;
      if (s === 'IN_PROGRESS') return 2;
      return 1;
    };
    const stepPill = (status) => {
      const s = String(status || '').toUpperCase();
      if (s === 'DELIVERED')   return { label: 'Delivered',   color: '#047857', bg: '#d1fae5', border: '#a7f3d0' };
      if (s === 'REPORTED')    return { label: 'Reported',    color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' };
      if (s === 'IN_MID')      return { label: 'Half Way',    color: '#b45309', bg: '#fef3c7', border: '#fcd34d' };
      if (s === 'IN_PROGRESS') return { label: 'In Progress', color: '#a16207', bg: '#fef9c3', border: '#fde68a' };
      if (s === 'SCANNED')   return { label: 'Scanned',     color: '#9a3412', bg: '#ffedd5', border: '#fed7aa' };
      return                       { label: 'Not Started',  color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' };
    };

    // Flatten all service lines from the filtered appointments and
    // group by modality. Cancelled lines drop out.
    const groups = new Map();
    for (const appt of apptList) {
      for (const line of getServiceLines(appt)) {
        const status = String(line.status || 'NOT_STARTED').toUpperCase();
        if (status === 'CANCELLED') continue;
        const modality = (line.modality || 'OTHER').toUpperCase();
        if (!groups.has(modality)) groups.set(modality, []);
        groups.get(modality).push({ line, appt, status });
      }
    }

    if (groups.size === 0) {
      return (
        <div style={{ padding: '80px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
          NO SERVICE LINES IN ACTIVE SCOPE
        </div>
      );
    }

    // Stable column order: modalities sorted by name. Could be hospital-
    // configurable later (alphabetical is a sensible default).
    const sortedModalities = [...groups.keys()].sort();

    return (
      <div style={{
        display: 'grid',
        // Drop minmax to 240px on phones (typical phone width minus
        // 32px of padding ≈ 328px content area) so each column gets
        // breathing room without forcing a horizontal scroll when
        // the device is < 320px viewport (rare but real).
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
        gap: '14px',
        padding: '14px 14px 18px',
        background: '#f8fafc',
      }}>
        {sortedModalities.map(modality => {
          const items = groups.get(modality);
          const accent = accentFor(modality);

          // Per-status sub-counts so the column header reads at a glance.
          const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
          for (const it of items) counts[stepRank(it.status)] += 1;

          // Display order within a column: pending first (action
          // needed), then scanned, reported, delivered. So the eye
          // catches what's outstanding at the top.
          const ordered = [...items].sort((a, b) => stepRank(a.status) - stepRank(b.status));

          return (
            <div key={modality} style={{
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Column header — accent stripe + modality + counts */}
              <div style={{
                position: 'relative',
                padding: '14px 16px 12px',
                background: 'white',
                borderBottom: '1px solid #f1f5f9',
              }}>
                <div aria-hidden="true" style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  height: '3px', background: accent,
                }} />
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <h4 style={{
                    margin: 0,
                    fontSize: '13px', fontWeight: 950,
                    color: '#0f172a', letterSpacing: '0.4px',
                  }}>{modality}</h4>
                  <span style={{
                    fontSize: '9px', fontWeight: 950, letterSpacing: '0.5px',
                    color: '#64748b', textTransform: 'uppercase',
                  }}>{items.length} {items.length === 1 ? 'line' : 'lines'}</span>
                </div>
                {/* Mini stat strip: pending · scanned · reported · delivered */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  marginTop: '8px',
                  fontSize: '9px', fontWeight: 900, letterSpacing: '0.3px',
                }}>
                  <span style={{
                    background: '#f1f5f9', color: '#475569',
                    padding: '2px 7px', borderRadius: '999px',
                    border: '1px solid #e2e8f0',
                  }}>⚪ {counts[1]}</span>
                  <span style={{
                    background: '#ffedd5', color: '#9a3412',
                    padding: '2px 7px', borderRadius: '999px',
                    border: '1px solid #fed7aa',
                  }}>🟠 {counts[2]}</span>
                  <span style={{
                    background: '#dbeafe', color: '#1d4ed8',
                    padding: '2px 7px', borderRadius: '999px',
                    border: '1px solid #bfdbfe',
                  }}>🔵 {counts[3]}</span>
                  <span style={{
                    background: '#d1fae5', color: '#047857',
                    padding: '2px 7px', borderRadius: '999px',
                    border: '1px solid #a7f3d0',
                  }}>🟢 {counts[4]}</span>
                </div>
              </div>

              {/* Service cards — one per AppointmentService row in the
                  column. Outstanding services float to the top. */}
              <div style={{
                padding: '8px 10px 10px',
                display: 'flex', flexDirection: 'column', gap: '6px',
                flex: 1,
                maxHeight: '480px',
                overflowY: 'auto',
              }}>
                {ordered.length === 0 ? (
                  <div style={{
                    padding: '24px 10px', textAlign: 'center',
                    fontSize: '10px', fontWeight: 700, color: '#94a3b8',
                  }}>Room idle — nothing pending.</div>
                ) : (
                  ordered.map(({ line, appt, status }) => {
                    const pill = stepPill(status);
                    const step = stepRank(status);
                    // Context-aware action — OpsBoard is the single
                    // place this transition happens. SCANNED → REPORTED
                    // is owned by the doctor's save on ReportingPage.
                    let nextAction = null;
                    if (step === 1)      nextAction = { status: 'IN_PROGRESS', label: '▶ Start scan',                  tint: 'linear-gradient(135deg, #ca8a04 0%, #a16207 100%)', shadow: 'rgba(202, 138, 4, 0.45)' };
                    else if (step === 2) nextAction = { status: 'SCANNED',     label: '✓ Mark scanned',               tint: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', shadow: 'rgba(234, 88, 12, 0.45)' };
                    else if (step === 4) nextAction = { status: 'DELIVERED',   label: '✓ Mark delivered to patient',  tint: 'linear-gradient(135deg, #047857 0%, #065f46 100%)', shadow: 'rgba(4, 120, 87, 0.55)' };
                    // Per-stage TAT chip. Anchored to the moment this
                    // line entered its current stage so a line that
                    // was scanned 2 minutes ago doesn't inherit the
                    // visit's hour-long booking age.
                    const elapsedMin = getStageElapsedMinutes(line, appt, nowMs);
                    const slaBucket  = getStageSlaBucket(line, elapsedMin);
                    const tatStyle = (
                      slaBucket === 'breach' ? { color: '#9f1239', bg: '#ffe4e6', border: '#fecdd3' } :
                      slaBucket === 'warn'   ? { color: '#9a3412', bg: '#ffedd5', border: '#fed7aa' } :
                                               { color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' }
                    );
                    const tatLabel = elapsedMin == null ? '' : formatStageElapsed(elapsedMin);
                    return (
                      <div
                        key={`${appt.appointmentId}-${line.id || line.modality}-${line.serviceName}`}
                        style={{
                          background: 'white',
                          border: '1px solid #e8eef7',
                          borderRadius: '10px',
                          padding: '8px 10px',
                          display: 'flex', flexDirection: 'column', gap: '6px',
                        }}
                      >
                        {/* Top line — token + patient name + status pill */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            flexShrink: 0,
                            fontFamily: 'monospace',
                            fontSize: '10px', fontWeight: 950,
                            color: '#0f52ba', background: 'rgba(15,82,186,0.08)',
                            padding: '2px 7px', borderRadius: '5px',
                            border: '1px solid rgba(15,82,186,0.2)',
                          }}>{appt.dailyTokenNumber ? `#${String(appt.dailyTokenNumber).padStart(3, '0')}` : (appt.tokenNo || '—')}</span>
                          <span style={{
                            flex: 1, minWidth: 0,
                            fontSize: '11px', fontWeight: 900, color: '#0f172a',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }} title={appt.patientName}>{appt.patientName}</span>
                          <span style={{
                            flexShrink: 0,
                            fontSize: '9px', fontWeight: 900, letterSpacing: '0.3px',
                            color: pill.color, background: pill.bg,
                            padding: '2px 7px', borderRadius: '999px',
                            border: `1px solid ${pill.border}`,
                            textTransform: 'uppercase',
                          }}>{pill.label}</span>
                        </div>
                        {/* Service name + TAT chip */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          fontSize: '10px', color: '#475569', fontWeight: 700,
                        }}>
                          <span style={{
                            flex: 1, minWidth: 0,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }} title={line.serviceName}>
                            {line.serviceName || '—'}
                          </span>
                          {tatLabel && (
                            <span title={`In ${pill.label.toLowerCase()} stage for ${tatLabel}`} style={{
                              flexShrink: 0,
                              fontSize: '9px', fontWeight: 900, letterSpacing: '0.3px',
                              color: tatStyle.color, background: tatStyle.bg,
                              padding: '2px 6px', borderRadius: '999px',
                              border: `1px solid ${tatStyle.border}`,
                              fontVariantNumeric: 'tabular-nums',
                              display: 'inline-flex', alignItems: 'center', gap: '3px',
                            }}>⏱ {tatLabel}</span>
                          )}
                        </div>
                        {/* Action row — context-aware. Mark Scanned
                            for NOT_STARTED, Mark Delivered for
                            REPORTED. SCANNED → REPORTED is automatic
                            (doctor's save). DELIVERED/CANCELLED show
                            nothing — the work on the row is done. */}
                        {nextAction && line.id && (
                          <button
                            type="button"
                            onClick={() => handleAdvanceServiceStatus(appt.appointmentId, line.id, nextAction.status)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: 'none',
                              background: nextAction.tint,
                              color: 'white',
                              fontSize: '10px', fontWeight: 900, letterSpacing: '0.3px',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              boxShadow: `0 3px 8px -3px ${nextAction.shadow}`,
                              transition: 'transform 0.12s ease',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                          >
                            {nextAction.label}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="appointment-board-container">

      {/* ── PAGE HEADER ────────────────────────────────────────────────── */}
      <div className="appt-page-top">
        <div className="appt-page-header">
          <div className="appt-page-title-block">
            <h1 className="appt-page-title">Clinical Operations Board</h1>
            <p className="appt-page-subtitle">Manual Workflow Override · Delivery Updates · Delay Tracking</p>
          </div>

          <div className="appt-page-actions">
            {/* Date navigator */}
            <div style={{ display: 'flex', background: 'white', padding: '6px 12px', borderRadius: '14px', border: '1px solid #e2e8f0', alignItems: 'center', gap: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
              <button onClick={() => shiftDate(-1)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '6px 10px', borderRadius: '8px', fontWeight: 950, fontSize: '12px' }}>◄</button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ background: 'none', border: 'none', color: '#0f172a', fontSize: '12px', fontWeight: 950, outline: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              />
              <button onClick={() => shiftDate(1)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '6px 10px', borderRadius: '8px', fontWeight: 950, fontSize: '12px' }}>▶</button>
              <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#0f172a', fontSize: '10px', fontWeight: 950, padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', letterSpacing: '0.5px' }}>TODAY</button>
            </div>
            <button className="appt-new-mission-btn" onClick={fetchAppointments}>↺ Refresh</button>
            <button
              className="appt-new-mission-btn"
              onClick={exportToExcel}
              disabled={!filteredAppointments.length || exporting}
              style={{ background: '#15803d', borderColor: '#15803d', opacity: exporting ? 0.6 : 1 }}
              title="Export visible records (with full comment trail) to Excel"
            >{exporting ? '⏳ Exporting…' : '⬇ Export Excel'}</button>
          </div>
        </div>
      </div>

      {/* ── KPI INTEL CARDS ────────────────────────────────────────────── */}
      <div className="intel-cards-grid" style={{ gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(155px, 1fr))' }}>

        <div className="intel-card dark">
          <span className="intel-label">Total Today</span>
          <div className="intel-value">{metrics.total}</div>
          <div className="intel-trend" style={{ color: '#10b981' }}>
            {/* Show patient count vs scan count side by side when they
                differ — clarifies that a multi-service visit produces
                multiple scans without inflating the patient count. */}
            {metrics.totalLines > metrics.total
              ? `${metrics.totalLines} scan${metrics.totalLines === 1 ? '' : 's'}`
              : 'Active Queue'}
          </div>
        </div>

        <div className="intel-card" style={{ background: 'white' }}>
          <span className="intel-label">⚪ Not Started</span>
          <div className="intel-value" style={{ color: '#475569' }}>{metrics.notStarted}</div>
          <div className="intel-trend" style={{ color: '#94a3b8' }}>Awaiting Scan</div>
        </div>

        <div className="intel-card" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
          <span className="intel-label" style={{ color: '#b45309' }}>🟠 Scanned</span>
          <div className="intel-value" style={{ color: '#b45309' }}>{metrics.scanned}</div>
          <div className="intel-trend" style={{ color: '#b45309' }}>Awaiting Report</div>
        </div>

        <div className="intel-card" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <span className="intel-label" style={{ color: '#0f52ba' }}>🔵 Reported</span>
          <div className="intel-value" style={{ color: '#0f52ba' }}>{metrics.reported}</div>
          <div className="intel-trend" style={{ color: '#0f52ba' }}>Awaiting Delivery</div>
        </div>

        <div className="intel-card" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <span className="intel-label" style={{ color: '#15803d' }}>🟢 Delivered</span>
          <div className="intel-value" style={{ color: '#14532d' }}>{metrics.delivered}</div>
          <div className="intel-trend" style={{ color: '#15803d' }}>Handed to Patient</div>
        </div>

      </div>

      {/* ── FILTER BAR ─────────────────────────────────────────────────── */}
      <div className="filter-bar-responsive">
        <div className="filter-search-group">
          <span style={{ fontSize: '16px', color: '#94a3b8', flexShrink: 0 }}>🔍</span>
          <input
            type="text"
            placeholder="Search by patient name, ID, mobile or procedure…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-select-group">
          <select className="filter-select" value={modality} onChange={(e) => setModality(e.target.value)}>
            <option value="ALL">All Modalities</option>
            {availableModalities.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All Service Status</option>
            <option value="NOT_STARTED">Not Started</option>
            <option value="SCANNED">Scanned (awaiting report)</option>
            <option value="REPORTED">Reported (awaiting delivery)</option>
            <option value="DELIVERED">Delivered</option>
          </select>
        </div>
      </div>

      {/* ── OPERATIONS LEDGER TABLE ────────────────────────────────────── */}
      <div className="appointments-table-wrapper">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '14px 16px' : '20px 24px',
          borderBottom: '1px solid #e2e8f0',
          flexWrap: 'wrap',
          gap: isMobile ? '8px' : '12px',
        }}>
          <h3 style={{
            fontSize: isMobile ? '11px' : '13px',
            fontWeight: 950, letterSpacing: '0.8px', margin: 0, color: '#0a1628',
          }}>{isMobile ? 'OPERATIONS' : 'CLINICAL OPERATIONS REGISTRY'}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* View toggle — switches between the existing visit
                ledger (one row per appointment) and the new modality
                queue (services pivoted by modality so the front desk
                can see what's pending in each room). */}
            <div style={{
              display: 'inline-flex',
              padding: '3px',
              background: '#f1f5f9',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
            }}>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                title="List view"
                style={{
                  padding: isMobile ? '6px 10px' : '6px 14px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '10px',
                  fontWeight: 900,
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontFamily: 'inherit',
                  background: viewMode === 'list' ? 'white' : 'transparent',
                  color: viewMode === 'list' ? '#0f52ba' : '#64748b',
                  boxShadow: viewMode === 'list' ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >{isMobile ? '☰' : '☰ List'}</button>
              <button
                type="button"
                onClick={() => setViewMode('queue')}
                aria-pressed={viewMode === 'queue'}
                title="Modality queue view"
                style={{
                  padding: isMobile ? '6px 10px' : '6px 14px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '10px',
                  fontWeight: 900,
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontFamily: 'inherit',
                  background: viewMode === 'queue' ? 'white' : 'transparent',
                  color: viewMode === 'queue' ? '#0f52ba' : '#64748b',
                  boxShadow: viewMode === 'queue' ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >{isMobile ? '⊞' : '⊞ Modality Queue'}</button>
            </div>
            <span style={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8', letterSpacing: '0.5px' }}>RECORDS</span>
            <span style={{ background: '#0f52ba', color: 'white', padding: '2px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 950 }}>
              {filteredAppointments.length}
            </span>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: '#64748b' }}>
            <div style={{ margin: '0 auto 20px', width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#0f52ba', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '0.5px' }}>RETRIEVING CLINICAL BOARD PARAMETERS…</span>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div style={{ padding: '80px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
            NO DATA DETECTED IN ACTIVE SCOPE
          </div>
        ) : viewMode === 'queue' ? (
          renderModalityQueue(filteredAppointments)
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {isCompact ? (
              /* ── MOBILE & TABLET: Card Layout ──
                 Phones get a single column; tablets get a comfortable 2-up grid
                 so the wide desktop table never has to be scrolled sideways. */
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                gap: '12px',
                padding: '16px',
                alignItems: 'start',
              }}>
                {paginatedAppointments.map((appt) => {
                  const progress   = getProgressBadge(appt.reportProgressStatus);
                  const coreStatus = getCoreStatusStyle(appt.status);
                  const isApptOverdue = isOverdue(appt.appointmentId);
                  // STAT + overdue share the same red heartbeat. URGENT gets
                  // the softer amber. Matches AppointmentBoard / Tech / Doctor.
                  const overdueRowClass = (isApptOverdue || appt.priority === 'STAT') ? 'priority-row-stat'
                                        : appt.priority === 'URGENT'                  ? 'priority-row-urgent'
                                        : '';
                  const onPremisesElapsed = appt.arrivedAt ? formatElapsed(appt.arrivedAt, appt.deliveredAt) : null;
                  const premisesSev = premisesSeverity(appt.arrivedAt, appt.deliveredAt);
                  const premisesStyle = premisesPillStyle(premisesSev);
                  const scanToDelivery = (appt.scanStartedAt && appt.deliveredAt) ? formatElapsed(appt.scanStartedAt, appt.deliveredAt) : null;
                  return (
                    <div key={appt.appointmentId} className={overdueRowClass} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                      {/* Top row: token + badges */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <div>
                          <div style={{ fontWeight: 950, color: '#0f52ba', fontSize: '18px', fontFamily: 'monospace' }}>
                            {appt.dailyTokenNumber ? `#${String(appt.dailyTokenNumber).padStart(3, '0')}` : 'N/A'}
                          </div>
                          <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 800, marginTop: '2px' }}>{appt.displayId}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span className="status-badge" style={{ background: coreStatus.style.bg, color: coreStatus.style.text, border: `1px solid ${coreStatus.style.border}` }}>
                            {coreStatus.label}
                          </span>
                          <span className="status-badge" style={{ background: progress.style.bg, color: progress.style.text, border: `1px solid ${progress.style.border}` }}>
                            {progress.label}
                          </span>
                        </div>
                      </div>
                      {/* Patient info + priority chip (only above ROUTINE) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 950, color: '#0f172a', fontSize: '14px' }}>{appt.patientName}</span>
                        {appt.priority && appt.priority !== 'ROUTINE' && (
                          <span
                            className={appt.priority === 'STAT' ? 'priority-chip-stat' : 'priority-chip-urgent'}
                            style={{
                              fontSize: '9px', fontWeight: 950, letterSpacing: '0.5px',
                              padding: '2px 7px', borderRadius: '999px',
                              color: appt.priority === 'STAT' ? '#dc2626' : '#d97706',
                              background: appt.priority === 'STAT' ? '#fee2e2' : '#fef3c7',
                              border: `1px solid ${appt.priority === 'STAT' ? '#fecaca' : '#fde68a'}`,
                            }}
                          >{appt.priority}</span>
                        )}
                      </div>
                      {appt.patientId && (
                        <div style={{ fontSize: '9px', color: '#0f52ba', fontWeight: 800, marginTop: '2px', fontFamily: 'monospace' }}>PID: {appt.patientId}</div>
                      )}
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginTop: '2px' }}>
                        {appt.patientAge}y · {appt.patientGender} · {appt.mobile}
                      </div>
                      {/* Doctor + referrer chips — same as desktop. */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        marginTop: '6px', flexWrap: 'wrap',
                      }}>
                        <span
                          title={appt.doctor ? `Assigned to ${appt.doctor}` : 'No specialist assigned'}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            fontSize: '10px', fontWeight: 900, letterSpacing: '0.2px',
                            color: appt.doctor ? '#0c4a6e' : '#9a3412',
                            background: appt.doctor ? '#e0f2fe' : '#fef3c7',
                            border: `1px solid ${appt.doctor ? '#bae6fd' : '#fde68a'}`,
                            padding: '2px 8px', borderRadius: '999px',
                          }}
                        >
                          <span aria-hidden="true" style={{ fontSize: '10px' }}>🩺</span>
                          {appt.doctor || 'Unassigned'}
                        </span>
                        {appt.referredBy && (
                          <span
                            title={`Referred by ${appt.referredBy}`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              fontSize: '10px', fontWeight: 900, letterSpacing: '0.2px',
                              color: '#5b21b6', background: '#ede9fe',
                              border: '1px solid #ddd6fe',
                              padding: '2px 8px', borderRadius: '999px',
                            }}
                          >
                            <span aria-hidden="true" style={{ fontSize: '10px' }}>↗</span>
                            Ref: {appt.referredBy}
                          </span>
                        )}
                      </div>
                      {/* Modality + Service — mobile-friendly tappable
                          rows. Tap the row → opens the per-service
                          editor popup (status + notes), same as desktop.
                          Multi-service visits get a View All toggle;
                          single-service visits show inline always. */}
                      {(() => {
                        const lines = getServiceLines(appt);
                        if (lines.length === 0) return null;
                        const apptKey  = appt.appointmentId;
                        const expanded = expandedLedgers.has(apptKey);
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

                        // Tappable mobile-friendly service row.
                        const renderServiceRow = (line, idx) => {
                          const tint = modTint(line.modality);
                          const st   = stepStyle(line.status);
                          const elapsedMin = getStageElapsedMinutes(line, appt, nowMs);
                          const slaBucket  = getStageSlaBucket(line, elapsedMin);
                          const tatStyle = (
                            slaBucket === 'breach' ? { color: '#9f1239', bg: '#ffe4e6', border: '#fecdd3' } :
                            slaBucket === 'warn'   ? { color: '#9a3412', bg: '#ffedd5', border: '#fed7aa' } :
                                                     { color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' }
                          );
                          const tatLabel  = elapsedMin == null ? '' : formatStageElapsed(elapsedMin);
                          const cancelled = String(line.status || '').toUpperCase() === 'CANCELLED';
                          const editable  = Boolean(line.id);
                          const hasNotes  = Boolean(line.notes && String(line.notes).trim());
                          return (
                            <div
                              key={line.id || `mcard-${idx}`}
                              role={editable ? 'button' : undefined}
                              tabIndex={editable ? 0 : undefined}
                              onClick={editable ? (e) => openServicePopover(e, appt, line) : undefined}
                              onKeyDown={editable ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openServicePopover(e, appt, line); }
                              } : undefined}
                              style={{
                                background: '#f8fafc',
                                border: '1px solid #eef2f7',
                                borderRadius: '10px',
                                padding: '10px',
                                opacity: cancelled ? 0.55 : 1,
                                cursor: editable ? 'pointer' : 'default',
                                display: 'flex', flexDirection: 'column', gap: '6px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                  flexShrink: 0,
                                  fontSize: '10px', fontWeight: 950, letterSpacing: '0.4px',
                                  color: tint.text, background: tint.bg,
                                  border: `1px solid ${tint.border}`,
                                  padding: '3px 8px', borderRadius: '5px',
                                  minWidth: '44px', textAlign: 'center',
                                }}>{line.modality || 'OT'}</span>
                                <span
                                  style={{
                                    flex: 1, minWidth: 0,
                                    fontSize: '13px', fontWeight: 900, color: '#0f172a',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    textDecoration: cancelled ? 'line-through' : 'none',
                                  }}
                                  title={line.serviceName}
                                >{line.serviceName || '—'}</span>
                                {editable && (
                                  <span style={{
                                    flexShrink: 0,
                                    fontSize: '9px', fontWeight: 950, letterSpacing: '0.3px',
                                    color: '#0f52ba',
                                  }}>✎</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                <span style={{
                                  fontSize: '10px', fontWeight: 900, letterSpacing: '0.3px',
                                  color: st.color, background: st.bg,
                                  border: `1px solid ${st.border}`,
                                  padding: '2px 8px', borderRadius: '999px',
                                  textTransform: 'uppercase',
                                }}>{st.label}</span>
                                {tatLabel && !cancelled && (
                                  <span style={{
                                    fontSize: '10px', fontWeight: 900, letterSpacing: '0.3px',
                                    color: tatStyle.color, background: tatStyle.bg,
                                    padding: '2px 8px', borderRadius: '999px',
                                    border: `1px solid ${tatStyle.border}`,
                                    fontVariantNumeric: 'tabular-nums',
                                  }}>⏱ {tatLabel}</span>
                                )}
                              </div>
                              {hasNotes && (
                                <div style={{
                                  fontSize: '11px', fontWeight: 600, color: '#0f172a',
                                  lineHeight: 1.4,
                                  paddingTop: '4px',
                                  borderTop: '1px dashed #e2e8f0',
                                }}>📝 {line.notes}</div>
                              )}
                            </div>
                          );
                        };

                        // Single-service — show one row inline, no toggle.
                        // Tap the row OR the explicit Update button to
                        // open the editor. The button gives an obvious
                        // affordance for the operator who doesn't know
                        // the whole row is tappable.
                        if (lines.length === 1) {
                          const only = lines[0];
                          const editable = Boolean(only?.id);
                          return (
                            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {renderServiceRow(only, 0)}
                              {editable && (
                                <button
                                  type="button"
                                  onClick={(e) => openServicePopover(e, appt, only)}
                                  style={{
                                    width: '100%',
                                    background: 'linear-gradient(135deg, #0f52ba 0%, #1e3a8a 100%)',
                                    border: 'none',
                                    color: 'white',
                                    padding: '10px',
                                    borderRadius: '10px',
                                    cursor: 'pointer',
                                    fontSize: '11px', fontWeight: 950, letterSpacing: '0.3px',
                                    textTransform: 'uppercase',
                                    boxShadow: '0 3px 8px -3px rgba(15, 82, 186, 0.55)',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                  }}
                                >✎ Update Status & Notes</button>
                              )}
                            </div>
                          );
                        }

                        // Multi-service — summary chips + View all toggle.
                        const summary = { notStarted: 0, inProgress: 0, scanned: 0, reported: 0, delivered: 0, cancelled: 0 };
                        for (const l of lines) {
                          const s = String(l.status || 'NOT_STARTED').toUpperCase();
                          if (s === 'DELIVERED')                          summary.delivered++;
                          else if (s === 'REPORTED')                      summary.reported++;
                          else if (s === 'SCANNED')                       summary.scanned++;
                          else if (s === 'IN_PROGRESS' || s === 'IN_MID') summary.inProgress++;
                          else if (s === 'CANCELLED')                     summary.cancelled++;
                          else                                             summary.notStarted++;
                        }
                        const summaryChips = [
                          summary.notStarted && { label: `${summary.notStarted} pending`,    bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
                          summary.inProgress && { label: `${summary.inProgress} in progress`,bg: '#fef9c3', color: '#a16207', border: '#fde68a' },
                          summary.scanned    && { label: `${summary.scanned} scanned`,       bg: '#ffedd5', color: '#9a3412', border: '#fed7aa' },
                          summary.reported   && { label: `${summary.reported} reported`,     bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' },
                          summary.delivered  && { label: `${summary.delivered} delivered`,   bg: '#d1fae5', color: '#047857', border: '#a7f3d0' },
                          summary.cancelled  && { label: `${summary.cancelled} cancelled`,   bg: '#ffe4e6', color: '#9f1239', border: '#fecdd3' },
                        ].filter(Boolean);

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleLedger(apptKey)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleLedger(apptKey); } }}
                              aria-expanded={expanded}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '8px 10px',
                                borderRadius: '10px',
                                background: expanded ? 'rgba(15, 82, 186, 0.05)' : '#f8fafc',
                                border: `1px solid ${expanded ? 'rgba(15, 82, 186, 0.18)' : '#eef2f6'}`,
                                cursor: 'pointer',
                              }}
                            >
                              <span style={{
                                fontSize: '10px', fontWeight: 950, letterSpacing: '0.4px',
                                color: '#0f172a', textTransform: 'uppercase', whiteSpace: 'nowrap',
                              }}>{lines.length} services</span>
                              <div style={{
                                flex: 1, minWidth: 0,
                                display: 'flex', alignItems: 'center', gap: '4px',
                                flexWrap: 'wrap',
                              }}>
                                {summaryChips.map((c, i) => (
                                  <span key={i} style={{
                                    fontSize: '9px', fontWeight: 800, letterSpacing: '0.3px',
                                    color: c.color, background: c.bg,
                                    padding: '2px 7px', borderRadius: '999px',
                                    border: `1px solid ${c.border}`,
                                    textTransform: 'uppercase',
                                  }}>{c.label}</span>
                                ))}
                              </div>
                              <span style={{
                                fontSize: '10px', fontWeight: 900, letterSpacing: '0.4px',
                                color: '#0f52ba', textTransform: 'uppercase', whiteSpace: 'nowrap',
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                              }}>
                                {expanded ? 'Hide' : 'View all'}
                                <span aria-hidden="true" style={{
                                  display: 'inline-block',
                                  transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.18s',
                                }}>▾</span>
                              </span>
                            </div>
                            {expanded && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {lines.map((line, idx) => renderServiceRow(line, idx))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {/* TAT pills */}
                      {onPremisesElapsed && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                          <span title={appt.deliveredAt ? 'Total time on premises' : 'On premises (live)'} style={{ fontSize: '10px', fontWeight: 950, padding: '3px 8px', borderRadius: '999px', color: premisesStyle.color, background: premisesStyle.bg, border: `1px solid ${premisesStyle.border}` }}>⏱ {onPremisesElapsed}</span>
                          {scanToDelivery && (
                            <span title="Scan start → delivered" style={{ fontSize: '10px', fontWeight: 950, padding: '3px 8px', borderRadius: '999px', color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd' }}>📋 {scanToDelivery}</span>
                          )}
                        </div>
                      )}
                      {/* Latest comment + author byline + View all link */}
                      {appt.delayReason && (
                        <div style={{ background: '#fff1f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '10px', fontSize: '11px', lineHeight: 1.4, fontWeight: 800, marginTop: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 950, letterSpacing: '0.6px' }}>⚠️ LATEST COMMENT</span>
                            <button
                              onClick={() => openCommentsModal(appt)}
                              style={{ background: 'transparent', border: 'none', color: '#0f52ba', fontSize: '10px', fontWeight: 950, cursor: 'pointer', textDecoration: 'underline' }}
                            >View all →</button>
                          </div>
                          {appt.delayReason}
                          {(appt.latestCommentAuthorName || appt.latestCommentAt) && (
                            <div style={{ fontSize: '9px', fontWeight: 700, color: '#7f1d1d', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>👤 {appt.latestCommentAuthorName || 'System'}</span>
                              {appt.latestCommentAt && (
                                <>
                                  <span style={{ opacity: 0.5 }}>·</span>
                                  <span>{formatCommentTime(appt.latestCommentAt)}</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Action */}
                      <button
                        onClick={() => openVisitNoteModal(appt)}
                        style={{ marginTop: '12px', width: '100%', background: 'white', border: '1px solid #0f52ba', color: '#0f52ba', padding: '10px', borderRadius: '10px', cursor: 'pointer', fontSize: '11px', fontWeight: 950, letterSpacing: '0.3px' }}
                      >
                        ADD VISIT NOTE
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── DESKTOP: Card-Stack Layout ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 4px 4px' }}>
                {/* Tiny column-label strip above the cards — same role
                    as the old <thead> but quieter so cards read as
                    cards, not table rows. */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(220px, 1.3fr) minmax(200px, 1.2fr) minmax(150px, 0.9fr) minmax(180px, 1.1fr) minmax(160px, 1fr)',
                  gap: '14px',
                  padding: '0 16px 4px',
                  fontSize: '9px', fontWeight: 950, letterSpacing: '0.8px',
                  color: '#94a3b8', textTransform: 'uppercase',
                }}>
                  <span>Patient &amp; Visit</span>
                  <span>Services &amp; TAT</span>
                  <span>Clinical Stage</span>
                  <span>Notes</span>
                  <span style={{ textAlign: 'right' }}>Actions</span>
                </div>
                {paginatedAppointments.map((appt) => {
                    const progress   = getProgressBadge(appt.reportProgressStatus);
                    const coreStatus = getCoreStatusStyle(appt.status);
                    const isApptOverdue = isOverdue(appt.appointmentId);
                    const overdueTrClass = (isApptOverdue || appt.priority === 'STAT') ? 'priority-tr-stat'
                                         : appt.priority === 'URGENT'                  ? 'priority-tr-urgent'
                                         : '';
                    const onPremisesElapsed = appt.arrivedAt ? formatElapsed(appt.arrivedAt, appt.deliveredAt) : null;
                    const premisesSev = premisesSeverity(appt.arrivedAt, appt.deliveredAt);
                    const premisesStyle = premisesPillStyle(premisesSev);
                    const scanToDelivery = (appt.scanStartedAt && appt.deliveredAt) ? formatElapsed(appt.scanStartedAt, appt.deliveredAt) : null;

                    // Only show the expanded ledger for multi-service visits.
                    // Single-service visits render inline in column 2 with no
                    // toggle, so there's nothing to expand into.
                    const apptServiceCount = getServiceLines(appt).length;
                    const isLedgerExpanded = apptServiceCount > 1 && expandedLedgers.has(appt.appointmentId);
                    const isStat   = (isApptOverdue || appt.priority === 'STAT');
                    const isUrgent = appt.priority === 'URGENT';
                    return (
                      <div
                        key={appt.appointmentId}
                        className={overdueTrClass}
                        style={{
                          background: 'white',
                          border: `1px solid ${isStat ? '#fecaca' : isUrgent ? '#fde68a' : '#e8eef7'}`,
                          borderRadius: '14px',
                          overflow: 'hidden',
                          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                          transition: 'box-shadow 0.15s, transform 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.boxShadow = '0 6px 18px -6px rgba(15, 23, 42, 0.12)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.04)';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(220px, 1.3fr) minmax(200px, 1.2fr) minmax(150px, 0.9fr) minmax(180px, 1.1fr) minmax(160px, 1fr)',
                        gap: '14px',
                        padding: '14px 16px',
                        alignItems: 'flex-start',
                      }}>
                        {/* ── COLUMN 1: Patient & Visit identity ── */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0 }}>
                          {/* Token tile — same pattern as AppointmentBoard. */}
                          <div style={{
                            flexShrink: 0,
                            width: '42px', height: '42px',
                            borderRadius: '10px',
                            background: 'rgba(15, 82, 186, 0.08)',
                            border: '1.5px solid rgba(15, 82, 186, 0.2)',
                            color: '#0f52ba',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'monospace',
                          }}>
                            <span style={{ fontSize: '13px', fontWeight: 950, lineHeight: 1 }}>
                              {appt.dailyTokenNumber ? `#${String(appt.dailyTokenNumber).padStart(3, '0')}` : '—'}
                            </span>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', marginTop: '2px', letterSpacing: '0.3px' }}>TOKEN</span>
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 950, color: '#0f172a', fontSize: '14px', letterSpacing: '-0.2px' }}>{appt.patientName}</span>
                              {appt.priority && appt.priority !== 'ROUTINE' && (
                                <span
                                  className={appt.priority === 'STAT' ? 'priority-chip-stat' : 'priority-chip-urgent'}
                                  style={{
                                    fontSize: '9px', fontWeight: 950, letterSpacing: '0.5px',
                                    padding: '2px 7px', borderRadius: '999px',
                                    color: appt.priority === 'STAT' ? '#dc2626' : '#d97706',
                                    background: appt.priority === 'STAT' ? '#fee2e2' : '#fef3c7',
                                    border: `1px solid ${appt.priority === 'STAT' ? '#fecaca' : '#fde68a'}`,
                                  }}
                                >{appt.priority}</span>
                              )}
                            </div>
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: '6px',
                              marginTop: '4px', flexWrap: 'wrap',
                              fontSize: '10px', fontWeight: 700, color: '#64748b',
                            }}>
                              {appt.patientId && (
                                <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#475569' }}>#{appt.patientId}</span>
                              )}
                              <span style={{ opacity: 0.4 }}>·</span>
                              <span>{appt.patientAge}y · {appt.patientGender}</span>
                              {appt.mobile && (
                                <>
                                  <span style={{ opacity: 0.4 }}>·</span>
                                  <span>{appt.mobile}</span>
                                </>
                              )}
                            </div>
                            {/* Doctor + referrer chips — same emphasis pattern as AppointmentBoard. */}
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: '6px',
                              marginTop: '6px', flexWrap: 'wrap',
                            }}>
                              <span
                                title={appt.doctor ? `Assigned to ${appt.doctor}` : 'No specialist assigned'}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                                  fontSize: '10px', fontWeight: 900, letterSpacing: '0.2px',
                                  color: appt.doctor ? '#0c4a6e' : '#9a3412',
                                  background: appt.doctor ? '#e0f2fe' : '#fef3c7',
                                  border: `1px solid ${appt.doctor ? '#bae6fd' : '#fde68a'}`,
                                  padding: '2px 8px', borderRadius: '999px',
                                }}
                              >
                                <span aria-hidden="true" style={{ fontSize: '10px' }}>🩺</span>
                                {appt.doctor || 'Unassigned'}
                              </span>
                              {appt.referredBy && (
                                <span
                                  title={`Referred by ${appt.referredBy}`}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    fontSize: '10px', fontWeight: 900, letterSpacing: '0.2px',
                                    color: '#5b21b6', background: '#ede9fe',
                                    border: '1px solid #ddd6fe',
                                    padding: '2px 8px', borderRadius: '999px',
                                  }}
                                >
                                  <span aria-hidden="true" style={{ fontSize: '10px' }}>↗</span>
                                  Ref: {appt.referredBy}
                                </span>
                              )}
                            </div>
                            {/* Visit-level TAT pills */}
                            {onPremisesElapsed && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px', flexWrap: 'wrap' }}>
                                <span title={appt.deliveredAt ? 'Total time on premises' : 'On premises (live)'} style={{
                                  fontSize: '9px', fontWeight: 950, letterSpacing: '0.3px',
                                  padding: '2px 7px', borderRadius: '999px',
                                  color: premisesStyle.color, background: premisesStyle.bg,
                                  border: `1px solid ${premisesStyle.border}`,
                                }}>⏱ {onPremisesElapsed}</span>
                                {scanToDelivery && (
                                  <span title="Scan start → delivered" style={{
                                    fontSize: '9px', fontWeight: 950, letterSpacing: '0.3px',
                                    padding: '2px 7px', borderRadius: '999px',
                                    color: '#0369a1', background: '#e0f2fe',
                                    border: '1px solid #bae6fd',
                                  }}>📋 {scanToDelivery}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ── COLUMN 2: Services gist only.
                            The toggle strip lives at the bottom of the
                            card (below the 4-column grid) — mirrors
                            AppointmentBoard's pattern so the "View all"
                            affordance is always in the same spot. */}
                        <div style={{ minWidth: 0 }}>
                          {(() => {
                            const lines = getServiceLines(appt);
                            if (lines.length === 0) {
                              return <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>—</span>;
                            }
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

                            // Single-service — show one row inline.
                            // The "Update Status & Notes" button lives
                            // in Column 4 (Notes & Actions) on the
                            // right-hand side of the card, so the
                            // affordance sits with the other action
                            // buttons and is easy to find.
                            if (lines.length === 1) {
                              const only = lines[0];
                              const t    = modTint(only.modality);
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span style={{
                                    fontSize: '9px', fontWeight: 950, letterSpacing: '0.3px',
                                    color: t.text, background: t.bg,
                                    border: `1px solid ${t.border}`,
                                    padding: '3px 9px', borderRadius: '6px',
                                  }}>{only.modality || 'OT'}</span>
                                  <span
                                    style={{ fontSize: '13px', color: '#0f172a', fontWeight: 900,
                                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}
                                    title={only.serviceName || ''}
                                  >{only.serviceName || '—'}</span>
                                </div>
                              );
                            }

                            // Multi-service — modality chip stack + primary
                            // service name + "+N more" badge. The summary
                            // chips and View-all toggle live at the bottom
                            // of the card.
                            const modalities = getUniqueModalities(appt);
                            const primary    = lines[0]?.serviceName || appt.service || '';
                            const extra      = lines.length - 1;
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                  {modalities.map((m, idx) => {
                                    const t = modTint(m);
                                    return (
                                      <span key={`${m}-${idx}`} title={lines.find(l => l.modality === m)?.serviceName || m} style={{
                                        fontSize: '9px', fontWeight: 950, letterSpacing: '0.3px',
                                        color: t.text, background: t.bg,
                                        border: `1px solid ${t.border}`,
                                        padding: '2px 8px', borderRadius: '6px',
                                      }}>{m}</span>
                                    );
                                  })}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span style={{
                                    fontSize: '12px', color: '#0f172a', fontWeight: 900,
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px',
                                  }} title={primary}>{primary}</span>
                                  {extra > 0 && (
                                    <span style={{
                                      background: '#dbeafe', color: '#0f52ba',
                                      fontSize: '9px', fontWeight: 900,
                                      padding: '2px 7px', borderRadius: '999px',
                                      letterSpacing: '0.3px',
                                    }}>+{extra} more</span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* ── COLUMN 3: Clinical Stage + Per-service progress pills ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                          <span className="status-badge" style={{ alignSelf: 'flex-start', background: coreStatus.style.bg, color: coreStatus.style.text, border: `1px solid ${coreStatus.style.border}` }}>
                            {coreStatus.label}
                          </span>

                          {/* Per-service status strip.
                            A multi-service visit shows one mini-pill per
                            AppointmentService (modality short code + status
                            colour). Single-service visits show one pill;
                            the visual treatment is identical so the eye
                            doesn't have to context-switch between rows.
                            The aggregate "X/Y reported" still anchors the
                            top so the rollup isn't lost. */}
                          {(() => {
                            const lines = getServiceLines(appt);
                            // Step rank so we can colour each per-service
                            // pill the same way the queue cards do.
                            const stepStyle = (status) => {
                              const s = String(status || '').toUpperCase();
                              if (s === 'DELIVERED')   return { color: '#047857', bg: '#d1fae5', border: '#a7f3d0' };
                              if (s === 'REPORTED')    return { color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' };
                              if (s === 'SCANNED')     return { color: '#9a3412', bg: '#ffedd5', border: '#fed7aa' };
                              if (s === 'IN_MID')      return { color: '#b45309', bg: '#fef3c7', border: '#fcd34d' };
                              if (s === 'IN_PROGRESS') return { color: '#a16207', bg: '#fef9c3', border: '#fde68a' };
                              if (s === 'CANCELLED')   return { color: '#9f1239', bg: '#ffe4e6', border: '#fecdd3' };
                              return                         { color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' };
                            };
                            const statusLabel = (status) => {
                              const s = String(status || '').toUpperCase();
                              if (s === 'DELIVERED')   return 'Delivered';
                              if (s === 'REPORTED')    return 'Reported';
                              if (s === 'SCANNED')     return 'Scanned';
                              if (s === 'IN_MID')      return 'Half Way';
                              if (s === 'IN_PROGRESS') return 'In Progress';
                              if (s === 'CANCELLED')   return 'Cancelled';
                              return                         'Not Started';
                            };
                            // Short modality code so a 3-service visit
                            // still fits in the column without wrapping.
                            const shortMod = (m) => {
                              const k = String(m || '').toUpperCase();
                              return ({
                                CT: 'CT', MRI: 'MRI',
                                'X-RAY': 'XR',
                                ULTRASOUND: 'US', USG: 'US',
                                MAMMOGRAPHY: 'MG', MG: 'MG',
                                DEXA: 'DX', PET: 'PT', NUCLEAR: 'NM',
                              }[k] || (k ? k.substring(0, 3) : 'OT'));
                            };
                            // Rollup tally — non-cancelled services and
                            // how many are at-or-past REPORTED. Shown as
                            // a small caption above the per-line pills.
                            const live = lines.filter(l => String(l.status || '').toUpperCase() !== 'CANCELLED');
                            const reported = live.filter(l => {
                              const s = String(l.status || '').toUpperCase();
                              return s === 'REPORTED' || s === 'DELIVERED';
                            }).length;
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                {live.length > 1 && (
                                  <span style={{
                                    fontSize: '9px', fontWeight: 900, color: '#64748b',
                                    letterSpacing: '0.4px', textTransform: 'uppercase',
                                  }}>{reported}/{live.length} reported</span>
                                )}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '220px' }}>
                                  {lines.map((line, idx) => {
                                    const st  = stepStyle(line.status);
                                    const lbl = statusLabel(line.status);
                                    const elapsedMin = getStageElapsedMinutes(line, appt, nowMs);
                                    const tatLabel   = elapsedMin == null ? '' : formatStageElapsed(elapsedMin);
                                    const hasNotes   = Boolean(line.notes && String(line.notes).trim());
                                    const tooltip    = `${line.modality || 'OT'} · ${line.serviceName || ''} — ${lbl}${tatLabel ? ` · ${tatLabel}` : ''}${hasNotes ? `\n📝 ${line.notes}` : ''}\n\nClick to edit status or notes`;
                                    const clickable  = Boolean(line.id);
                                    return (
                                      <span
                                        key={line.id || `${appt.appointmentId}-${idx}`}
                                        title={tooltip}
                                        onClick={clickable ? (e) => openServicePopover(e, appt, line) : undefined}
                                        role={clickable ? 'button' : undefined}
                                        tabIndex={clickable ? 0 : undefined}
                                        onKeyDown={clickable ? (e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            openServicePopover(e, appt, line);
                                          }
                                        } : undefined}
                                        style={{
                                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                                          padding: '2px 7px',
                                          borderRadius: '999px',
                                          fontSize: '9px', fontWeight: 900, letterSpacing: '0.3px',
                                          color: st.color, background: st.bg,
                                          border: `1px solid ${st.border}`,
                                          textTransform: 'uppercase',
                                          cursor: clickable ? 'pointer' : 'default',
                                          userSelect: 'none',
                                        }}
                                      >
                                        <span style={{
                                          fontFamily: 'monospace', fontWeight: 950,
                                          fontSize: '9px',
                                          opacity: 0.85,
                                          letterSpacing: '0.2px',
                                        }}>{shortMod(line.modality)}</span>
                                        <span style={{ opacity: 0.55 }}>·</span>
                                        <span>{lbl}</span>
                                        {hasNotes && (
                                          <span aria-label="Has notes" style={{ marginLeft: '2px', fontSize: '9px' }}>📝</span>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* ── COLUMN 4: Notes ──
                            Visit-level latest comment box (when there
                            is one) and the per-service note gist for
                            single-service visits. Multi-service notes
                            live inside the expanded ledger. */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                          {appt.delayReason ? (
                            <div style={{ background: '#fff1f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '12px', fontSize: '11px', lineHeight: 1.4, maxHeight: '110px', overflowY: 'auto', fontWeight: 800 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                <span style={{ fontSize: '9px', fontWeight: 950, letterSpacing: '0.6px' }}>⚠️ LATEST COMMENT</span>
                                <button
                                  onClick={() => openCommentsModal(appt)}
                                  style={{ background: 'transparent', border: 'none', color: '#0f52ba', fontSize: '10px', fontWeight: 950, cursor: 'pointer', textDecoration: 'underline' }}
                                >View all →</button>
                              </div>
                              {appt.delayReason}
                              {(appt.latestCommentAuthorName || appt.latestCommentAt) && (
                                <div style={{ fontSize: '9px', fontWeight: 700, color: '#7f1d1d', marginTop: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <span>👤 {appt.latestCommentAuthorName || 'System'}</span>
                                  {appt.latestCommentAt && (
                                    <>
                                      <span style={{ opacity: 0.5 }}>·</span>
                                      <span>{formatCommentTime(appt.latestCommentAt)}</span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => openCommentsModal(appt)}
                              style={{ background: 'transparent', border: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: '11px', fontStyle: 'italic', fontWeight: 700, padding: '6px 10px', borderRadius: '10px', cursor: 'pointer' }}
                              title="View comment history"
                            >No comments yet — View history</button>
                          )}

                          {/* Per-service note gist (single-service
                              only). For multi-service the per-line
                              notes live inside the expanded ledger
                              and would duplicate here. */}
                          {apptServiceCount === 1 && (() => {
                            const only = getServiceLines(appt)[0];
                            const noteText = only && only.notes && String(only.notes).trim();
                            if (!noteText) return null;
                            return (
                              <div
                                style={{
                                  fontSize: '11px', fontWeight: 600, color: '#0f172a',
                                  lineHeight: 1.4,
                                  padding: '6px 10px',
                                  background: '#fffbeb',
                                  border: '1px solid #fef3c7',
                                  borderRadius: '10px',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                                title={only.notes}
                              >📝 {only.notes}</div>
                            );
                          })()}
                        </div>

                        {/* ── COLUMN 5: Actions ──
                            Buttons cluster on the right edge of the
                            card. Single-service visits get the primary
                            "Update Status & Notes" button up top; the
                            "Add Visit Note" button anchors the visit-
                            level comment action below. */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch', minWidth: 0 }}>
                          {apptServiceCount === 1 && (() => {
                            const only = getServiceLines(appt)[0];
                            if (!only || !only.id) return null;
                            return (
                              <button
                                type="button"
                                onClick={(e) => openServicePopover(e, appt, only)}
                                title="Change status or add/edit notes for this service"
                                style={{
                                  background: 'linear-gradient(135deg, #0f52ba 0%, #1e3a8a 100%)',
                                  border: 'none',
                                  color: 'white',
                                  padding: '8px 14px',
                                  borderRadius: '10px',
                                  cursor: 'pointer',
                                  fontSize: '10px', fontWeight: 950, letterSpacing: '0.3px',
                                  transition: 'all 0.15s ease',
                                  boxShadow: '0 3px 8px -3px rgba(15, 82, 186, 0.55)',
                                  textTransform: 'uppercase',
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                                  whiteSpace: 'nowrap',
                                }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                              >✎ Update Status & Notes</button>
                            );
                          })()}
                          <button
                            onClick={() => openVisitNoteModal(appt)}
                            style={{ background: 'white', border: '1px solid #e2e8f0', color: '#0f52ba', padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '10px', fontWeight: 950, letterSpacing: '0.3px', transition: 'all 0.15s ease' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#0f52ba'; e.currentTarget.style.background = '#eff6ff'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white'; }}
                          >
                            + ADD VISIT NOTE
                          </button>
                        </div>
                      </div>

                      {/* Toggle strip — bottom of the card, full width.
                          Same role + styling as AppointmentBoard's
                          "View N services ▾" toggle so the affordance
                          is in the same spot on both boards. Only
                          renders for multi-service visits; single-
                          service rows don't need a hide/show. */}
                      {apptServiceCount > 1 && (() => {
                        const lines    = getServiceLines(appt);
                        const apptKey  = appt.appointmentId;
                        const expanded = expandedLedgers.has(apptKey);
                        const summary = { notStarted: 0, inProgress: 0, scanned: 0, reported: 0, delivered: 0, cancelled: 0 };
                        for (const l of lines) {
                          const s = String(l.status || 'NOT_STARTED').toUpperCase();
                          if (s === 'DELIVERED')                          summary.delivered++;
                          else if (s === 'REPORTED')                      summary.reported++;
                          else if (s === 'SCANNED')                       summary.scanned++;
                          else if (s === 'IN_PROGRESS' || s === 'IN_MID') summary.inProgress++;
                          else if (s === 'CANCELLED')                     summary.cancelled++;
                          else                                             summary.notStarted++;
                        }
                        const summaryChips = [
                          summary.notStarted && { label: `${summary.notStarted} pending`,    bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
                          summary.inProgress && { label: `${summary.inProgress} in progress`,bg: '#fef9c3', color: '#a16207', border: '#fde68a' },
                          summary.scanned    && { label: `${summary.scanned} scanned`,       bg: '#ffedd5', color: '#9a3412', border: '#fed7aa' },
                          summary.reported   && { label: `${summary.reported} reported`,     bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' },
                          summary.delivered  && { label: `${summary.delivered} delivered`,   bg: '#d1fae5', color: '#047857', border: '#a7f3d0' },
                          summary.cancelled  && { label: `${summary.cancelled} cancelled`,   bg: '#ffe4e6', color: '#9f1239', border: '#fecdd3' },
                        ].filter(Boolean);
                        return (
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
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '8px 16px',
                              borderTop: '1px solid #f1f5f9',
                              background: expanded ? 'rgba(15, 82, 186, 0.04)' : '#f8fafc',
                              cursor: 'pointer',
                              transition: 'background 0.12s',
                            }}
                            onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.background = '#f1f5f9'; }}
                            onMouseLeave={(e) => { if (!expanded) e.currentTarget.style.background = '#f8fafc'; }}
                          >
                            <span style={{
                              fontSize: '9px', fontWeight: 950, letterSpacing: '0.5px',
                              color: '#0f172a', textTransform: 'uppercase', whiteSpace: 'nowrap',
                            }}>
                              {lines.length} services
                            </span>
                            <div style={{
                              flex: 1, minWidth: 0,
                              display: 'flex', alignItems: 'center', gap: '4px',
                              flexWrap: 'wrap',
                            }}>
                              {summaryChips.map((c, i) => (
                                <span key={i} style={{
                                  fontSize: '9px', fontWeight: 800, letterSpacing: '0.3px',
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
                              marginLeft: 'auto',
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
                        );
                      })()}

                      {isLedgerExpanded && (
                        <div style={{ padding: '0 16px 14px 16px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                          <div style={{ paddingTop: '12px' }}>
                            {(() => {
                              const lines = getServiceLines(appt);
                              return (
                                <div style={{
                                  background: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '12px',
                                  padding: '4px 12px 8px',
                                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                }}>
                                  {/* Mini in-table header */}
                                  <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '70px minmax(180px, 1.2fr) 140px 100px minmax(240px, 2fr) 180px',
                                    gap: '16px',
                                    padding: '8px 8px 6px',
                                    borderBottom: '1px solid #f1f5f9',
                                    fontSize: '9px', fontWeight: 900, letterSpacing: '0.5px',
                                    color: '#94a3b8', textTransform: 'uppercase',
                                  }}>
                                    <span>Modality</span>
                                    <span>Service</span>
                                    <span>Status</span>
                                    <span style={{ textAlign: 'center' }}>Time in stage</span>
                                    <span>Notes</span>
                                    <span style={{ textAlign: 'right' }}>Action</span>
                                  </div>
                                  {lines.map((line, idx) => (
                                    <LedgerRowEditor
                                      key={line.id || `det-${idx}`}
                                      line={line}
                                      appt={appt}
                                      isLast={idx === lines.length - 1}
                                      nowMs={nowMs}
                                      onOpenEditor={openServicePopover}
                                    />
                                  ))}
                                  <div style={{
                                    marginTop: '6px',
                                    padding: '6px 8px 0',
                                    borderTop: '1px solid #f1f5f9',
                                    fontSize: '9px', fontWeight: 800, color: '#94a3b8',
                                    letterSpacing: '0.3px', textTransform: 'uppercase',
                                  }}>
                                    Click ✎ Update Status & Notes (or the status pill) to change status and notes for that service.
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                      </div>
                    );
                  })}
                </div>
            )}
            {renderPagination()}
          </div>
        )}
      </div>

      {/* ── PER-SERVICE STATUS + NOTES POPOVER ─────────────────────────── */}
      {servicePopover && (
        <ServicePillPopover
          state={servicePopover}
          onClose={closeServicePopover}
          onSave={saveServicePopover}
        />
      )}

      {/* ── ADD VISIT NOTE MODAL ───────────────────────────────────────── */}
      {modalOpen && selectedItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, animation: 'fadeIn 0.25s ease-out' }}>
          <div style={{ width: '90%', maxWidth: '420px', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', borderRadius: '24px', border: '1px solid rgba(226,232,240,0.8)', boxShadow: '0 25px 50px -12px rgba(15,23,42,0.2)', padding: '30px 24px', display: 'flex', flexDirection: 'column', gap: '20px', animation: 'scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1)', boxSizing: 'border-box' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 950, margin: 0, color: '#0f52ba', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Add Visit Note</h3>
                <span style={{ fontSize: '11px', color: '#0f52ba', fontWeight: 950, marginTop: '4px', display: 'block' }}>
                  {selectedItem.patientName} ({selectedItem.dailyTokenNumber ? `#${String(selectedItem.dailyTokenNumber).padStart(3, '0')}` : 'N/A'})
                </span>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, marginTop: '2px', display: 'block' }}>
                  Applies to the whole visit. For per-service notes, click the status pill.
                </span>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#0f172a', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 950, fontSize: '12px' }}>✕</button>
            </div>

            <form onSubmit={handleAddVisitNote} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Latest comment (context) — read-only so the user can see what
                  was last said without accidentally erasing it by editing. */}
              {selectedItem.delayReason && (
                <div style={{
                  background: '#fffbeb', border: '1px solid #fef3c7',
                  borderRadius: '12px', padding: '10px 12px',
                  display: 'flex', flexDirection: 'column', gap: '4px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', color: '#92400e', fontWeight: 950, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                      Latest comment
                    </span>
                    <button
                      type="button"
                      onClick={() => openCommentsModal(selectedItem)}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: '#0f52ba', fontSize: '10px', fontWeight: 950,
                        letterSpacing: '0.3px', textDecoration: 'underline',
                      }}
                    >View all comments →</button>
                  </div>
                  <div style={{ fontSize: '12px', color: '#1e293b', fontWeight: 700, lineHeight: 1.5 }}>
                    {selectedItem.delayReason}
                  </div>
                  {(selectedItem.latestCommentAuthorName || selectedItem.latestCommentAt) && (
                    <div style={{ fontSize: '10px', color: '#92400e', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>👤 {selectedItem.latestCommentAuthorName || 'System'}</span>
                      {selectedItem.latestCommentAt && (
                        <>
                          <span style={{ opacity: 0.5 }}>·</span>
                          <span>{formatCommentTime(selectedItem.latestCommentAt)}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Add a new comment — APPEND, not overwrite. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 950, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                  {selectedItem.delayReason ? 'Add a new comment' : 'Add a comment'}
                </label>
                <textarea
                  placeholder="e.g. Awaiting radiologist signature, Gantry scanner under maintenance…"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  rows={3}
                  style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', color: '#0f172a', fontSize: '11px', fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box', fontWeight: 700 }}
                />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['Awaiting signature', 'PACS Sync issue', 'Gantry maintenance', 'Patient details missing'].map(txt => (
                    <button key={txt} type="button" onClick={() => setNewReason(txt)}
                      style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', fontSize: '9px', fontWeight: 950, padding: '4px 10px', borderRadius: '8px', cursor: 'pointer' }}>
                      +{txt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button type="button" onClick={() => setModalOpen(false)}
                  style={{ flex: 1, background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#0f172a', padding: '12px', borderRadius: '12px', cursor: 'pointer', fontSize: '11px', fontWeight: 950 }}>
                  CANCEL
                </button>
                <button type="submit" disabled={saving || newReason.trim().length === 0}
                  style={{ flex: 1, background: (saving || newReason.trim().length === 0) ? '#cbd5e1' : 'linear-gradient(135deg, #0f52ba 0%, #0a3d91 100%)', border: 'none', color: 'white', padding: '12px', borderRadius: '12px', cursor: (saving || newReason.trim().length === 0) ? 'not-allowed' : 'pointer', fontSize: '11px', fontWeight: 950, boxShadow: (saving || newReason.trim().length === 0) ? 'none' : '0 8px 18px -4px rgba(15,82,186,0.35)', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'SAVING…' : 'SAVE NOTE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── COMMENTS TIMELINE POPUP ────────────────────────────────────── */}
      {commentsModal.open && commentsModal.appointment && (
        <div
          onClick={closeCommentsModal}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001, animation: 'fadeIn 0.2s ease-out' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(560px, calc(100vw - 32px))',
              maxHeight: '80vh',
              background: 'white', borderRadius: '20px',
              boxShadow: '0 30px 80px rgba(0,0,0,0.32)',
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
              animation: 'scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
            }}
          >
            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #0f52ba 0%, #0a3d91 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '2px', opacity: 0.85 }}>COMMENT HISTORY</div>
                <div style={{ fontSize: '18px', fontWeight: 900, marginTop: '4px', letterSpacing: '-0.3px' }}>
                  {commentsModal.appointment.patientName}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 700, marginTop: '2px', opacity: 0.78 }}>
                  {commentsModal.appointment.displayId} · {commentsModal.appointment.modality}
                </div>
              </div>
              <button
                onClick={closeCommentsModal}
                aria-label="Close"
                style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.28)', color: 'white', cursor: 'pointer', fontSize: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >✕</button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
              {commentsLoading ? (
                <div style={{ padding: '40px 24px', textAlign: 'center', color: '#64748b', fontSize: '12px', fontWeight: 700 }}>
                  Loading timeline…
                </div>
              ) : comments.length === 0 ? (
                <div style={{ padding: '40px 24px', textAlign: 'center', color: '#64748b', fontSize: '12px', fontWeight: 700 }}>
                  No comments yet for this appointment.
                </div>
              ) : (
                <div style={{ padding: '8px 24px 16px' }}>
                  {comments.map((c, idx) => (
                    <CommentTimelineItem
                      key={c.appointmentCommentId}
                      comment={c}
                      isLatest={idx === 0}
                    />
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: '12px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
              <span>{comments.length} comment{comments.length === 1 ? '' : 's'}</span>
              <span>Newest first</span>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST CONTAINER ────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: '30px', right: '16px', left: isMobile ? '16px' : 'auto', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: t.type === 'success' ? '#10b981' : '#ef4444', color: 'white', padding: '14px 24px', borderRadius: '14px', fontSize: '11px', fontWeight: 950, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', animation: 'fadeIn 0.2s ease-out', pointerEvents: 'auto', minWidth: isMobile ? 'unset' : '280px', border: t.type === 'success' ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(248,113,113,0.2)' }}>
            {t.type === 'success' ? '✅' : '❌'} {t.message.toUpperCase()}
          </div>
        ))}
      </div>

      {/* ── KEYFRAMES ──────────────────────────────────────────────────── */}
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.9) translateY(20px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
      `}</style>

    </div>
  );
}

// Compact human time for the inline "by {name} · {when}" byline. Falls back
// gracefully if the timestamp is missing or unparseable. Reuses the UTC
// hardening from timeTracking (server omits the trailing Z on DateTimes
// with Kind=Unspecified, which would otherwise parse as local time).
function formatCommentTime(iso) {
  if (!iso) return '';
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  const ms = new Date(hasTz ? iso : iso + 'Z').getTime();
  if (Number.isNaN(ms)) return '';
  const diffMin = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (diffMin < 1)   return 'just now';
  if (diffMin < 60)  return `${diffMin}m ago`;
  if (diffMin < 1440) {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`;
  }
  // For older comments fall back to absolute IST date so users don't see
  // "47h ago" — easier to scan as "12 Apr".
  return new Date(ms).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short',
  });
}

// One timeline row. Newest entry gets a small "LATEST" badge so the user
// can spot the active comment without scanning timestamps.
function CommentTimelineItem({ comment, isLatest }) {
  const dt = comment.createdAt ? new Date(comment.createdAt + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(comment.createdAt) ? '' : 'Z')) : null;
  const when = dt ? dt.toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }) : '—';

  return (
    <div style={{ display: 'flex', gap: '12px', padding: '12px 4px', borderBottom: '1px solid #f1f5f9' }}>
      {/* Avatar (initial) */}
      <div style={{
        width: '34px', height: '34px', borderRadius: '50%',
        background: isLatest ? '#dbeafe' : '#f1f5f9',
        color:      isLatest ? '#0f52ba' : '#64748b',
        fontWeight: 900, fontSize: '13px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        border: isLatest ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
      }}>
        {(comment.authorName || '?').charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}>{comment.authorName}</span>
          {isLatest && (
            <span style={{
              fontSize: '9px', fontWeight: 950, letterSpacing: '0.8px',
              background: '#dbeafe', color: '#0f52ba',
              padding: '2px 6px', borderRadius: '999px',
              border: '1px solid #bfdbfe',
            }}>LATEST</span>
          )}
          <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, marginLeft: 'auto' }}>{when}</span>
        </div>
        <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: 600, lineHeight: 1.55, marginTop: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {comment.body}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  LedgerRowEditor — one row in the expanded service ledger.
//  Read-only display by default; the EDIT ✎ button opens the
//  ServicePillPopover (the same popup as the top-row pills) anchored
//  to this row, so the operator changes status + notes in one place.
// ─────────────────────────────────────────────────────────────────────────
function LedgerRowEditor({
  line,
  appt,
  isLast,
  nowMs,
  onOpenEditor,
}) {
  const status = String(line.status || 'NOT_STARTED').toUpperCase();
  const notes  = line.notes || '';

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
  const stepStyle = (s) => {
    if (s === 'DELIVERED')   return { color: '#047857', bg: '#d1fae5', border: '#a7f3d0', label: 'Delivered' };
    if (s === 'REPORTED')    return { color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe', label: 'Reported' };
    if (s === 'SCANNED')     return { color: '#9a3412', bg: '#ffedd5', border: '#fed7aa', label: 'Scanned' };
    if (s === 'IN_MID')      return { color: '#b45309', bg: '#fef3c7', border: '#fcd34d', label: 'Half Way' };
    if (s === 'IN_PROGRESS') return { color: '#a16207', bg: '#fef9c3', border: '#fde68a', label: 'In Progress' };
    if (s === 'CANCELLED')   return { color: '#9f1239', bg: '#ffe4e6', border: '#fecdd3', label: 'Cancelled' };
    return                         { color: '#475569', bg: '#f1f5f9', border: '#e2e8f0', label: 'Not Started' };
  };
  const tint = modTint(line.modality);
  const st   = stepStyle(status);

  const elapsedMin = getStageElapsedMinutes(line, appt, nowMs);
  const slaBucket  = getStageSlaBucket(line, elapsedMin);
  const tatStyle = (
    slaBucket === 'breach' ? { color: '#9f1239', bg: '#ffe4e6', border: '#fecdd3' } :
    slaBucket === 'warn'   ? { color: '#9a3412', bg: '#ffedd5', border: '#fed7aa' } :
                             { color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' }
  );
  const tatLabel  = elapsedMin == null ? '' : formatStageElapsed(elapsedMin);
  const cancelled = status === 'CANCELLED';
  const editable  = Boolean(line.id);

  const openEditor = (e) => {
    if (!editable) return;
    onOpenEditor(e, appt, line);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '70px minmax(180px, 1.2fr) 140px 100px minmax(240px, 2fr) 180px',
        gap: '16px',
        padding: '10px 8px',
        alignItems: 'flex-start',
        borderBottom: isLast ? 'none' : '1px solid #f8fafc',
        opacity: cancelled ? 0.6 : 1,
      }}
    >
      {/* Modality */}
      <span style={{
        justifySelf: 'start',
        fontSize: '9px', fontWeight: 950, letterSpacing: '0.4px',
        color: tint.text, background: tint.bg,
        border: `1px solid ${tint.border}`,
        padding: '3px 8px', borderRadius: '5px',
        textAlign: 'center', minWidth: '46px',
        marginTop: '2px',
      }}>{line.modality || 'OT'}</span>

      {/* Service name */}
      <span style={{
        fontSize: '12px', fontWeight: 800, color: '#0f172a',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        textDecoration: cancelled ? 'line-through' : 'none',
        marginTop: '2px',
      }} title={line.serviceName}>{line.serviceName || '—'}</span>

      {/* Status pill — read-only display. Click opens the editor
          popup (same component as the top-row pills). */}
      <span
        onClick={openEditor}
        role={editable ? 'button' : undefined}
        tabIndex={editable ? 0 : undefined}
        onKeyDown={editable ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditor(e); }
        } : undefined}
        title={editable ? 'Click to change status or edit notes' : ''}
        style={{
          justifySelf: 'start',
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          fontSize: '10px', fontWeight: 900, letterSpacing: '0.3px',
          color: st.color, background: st.bg,
          border: `1px solid ${st.border}`,
          padding: '3px 10px', borderRadius: '999px',
          textTransform: 'uppercase',
          cursor: editable ? 'pointer' : 'default',
          userSelect: 'none',
          marginTop: '2px',
        }}
      >
        {st.label}
      </span>

      {/* Time-in-stage chip */}
      <span style={{
        justifySelf: 'center',
        marginTop: '2px',
        fontSize: '10px', fontWeight: 900, letterSpacing: '0.3px',
        color: tatLabel ? tatStyle.color : '#cbd5e1',
        background: tatLabel ? tatStyle.bg : 'transparent',
        border: tatLabel ? `1px solid ${tatStyle.border}` : '1px dashed #e2e8f0',
        padding: '3px 8px', borderRadius: '999px',
        fontVariantNumeric: 'tabular-nums',
        display: 'inline-flex', alignItems: 'center', gap: '3px',
      }}>
        {tatLabel ? <>⏱ {tatLabel}</> : '—'}
      </span>

      {/* Notes gist — full text shown wrapped on up to 2 lines so the
          operator sees the actual note without opening the editor.
          Long notes get an ellipsis with full text in the tooltip. */}
      <div style={{
        fontSize: '11px', lineHeight: 1.4,
        color: notes ? '#0f172a' : '#94a3b8',
        fontWeight: notes ? 700 : 600,
        fontStyle: notes ? 'normal' : 'italic',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        marginTop: '2px',
      }}
        title={notes || ''}
      >
        {notes ? `📝 ${notes}` : '— No notes —'}
      </div>

      {/* Edit button — opens the status + notes popup anchored next
          to this row. One affordance for both edits keeps the row
          calm and the action obvious. */}
      <button
        type="button"
        onClick={openEditor}
        disabled={!editable}
        title={notes ? 'Update status or notes' : 'Change status or add a note'}
        style={{
          justifySelf: 'stretch',
          padding: '6px 10px',
          border: '1px solid #e2e8f0',
          background: 'white',
          color: editable ? '#0f52ba' : '#cbd5e1',
          borderRadius: '8px',
          fontSize: '9px', fontWeight: 950, letterSpacing: '0.3px',
          cursor: editable ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
          textTransform: 'uppercase',
          transition: 'all 0.12s',
          marginTop: '2px',
          whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
        }}
        onMouseEnter={(e) => { if (editable) { e.currentTarget.style.borderColor = '#0f52ba'; e.currentTarget.style.background = '#eff6ff'; } }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white'; }}
      >✎ Update Status & Notes</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  ServicePillPopover — anchored editor for status + notes on one service
// ─────────────────────────────────────────────────────────────────────────
// Opens next to the clicked pill, contains a status dropdown and a notes
// textarea. Click-outside / Escape closes. No portal — uses fixed
// positioning with the pill's bounding rect, then nudges into view if
// it would clip the viewport.
function ServicePillPopover({ state, onClose, onSave }) {
  const { modality, serviceName, status: initialStatus, notes: initialNotes, anchorRect } = state;
  const [status, setStatus] = React.useState(initialStatus);
  const [notes,  setNotes]  = React.useState(initialNotes || '');
  const ref = React.useRef(null);

  // Click-outside + Escape to dismiss without saving. The popover
  // itself stops propagation so clicks inside don't close it.
  React.useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Responsive sizing — on phones (≤480px) the popover takes nearly
  // the full screen width with a small gutter, so the step grid and
  // notes textarea don't get squeezed. On tablet/desktop we keep the
  // ideal 420×520. Park below the pill by default; flip above if it
  // would clip the bottom; clamp horizontally to the viewport.
  const gutter = 12;
  const viewportW = (typeof window !== 'undefined') ? window.innerWidth  : 1024;
  const viewportH = (typeof window !== 'undefined') ? window.innerHeight : 768;
  const isPhone = viewportW < 520;
  const popoverWidth  = Math.min(420, viewportW - gutter * 2);
  const popoverHeight = Math.min(520, viewportH - gutter * 2);
  let top  = anchorRect.bottom + 6;
  let left = anchorRect.left;
  if (isPhone) {
    // Centre on the screen — anchoring to a tiny pill on a phone is
    // unhelpful since the popover is nearly full width anyway.
    left = Math.max(gutter, Math.round((viewportW - popoverWidth) / 2));
    top  = Math.max(gutter, Math.round((viewportH - popoverHeight) / 2));
  } else {
    if (top + popoverHeight > viewportH - gutter) {
      top = Math.max(gutter, anchorRect.top - popoverHeight - 6);
    }
    if (left + popoverWidth > viewportW - gutter) {
      left = Math.max(gutter, viewportW - popoverWidth - gutter);
    }
  }

  const dirty = (status !== initialStatus) || ((notes || '') !== (initialNotes || ''));

  return (
    <div
      role="dialog"
      aria-label={`Edit ${modality} service`}
      style={{
        position: 'fixed', inset: 0, zIndex: 10001,
        // Phone backdrop dims the page so the centred popover reads
        // as a modal; desktop stays transparent so the popover feels
        // anchored to the row it came from.
        background: isPhone ? 'rgba(15, 23, 42, 0.35)' : 'transparent',
        pointerEvents: isPhone ? 'auto' : 'none',
      }}
      onClick={(e) => { if (isPhone && e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        style={{
          position: 'absolute',
          top, left,
          width: `${popoverWidth}px`,
          maxHeight: `${popoverHeight}px`,
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          boxShadow: '0 20px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.04)',
          padding: '14px 16px',
          pointerEvents: 'auto',
          display: 'flex', flexDirection: 'column', gap: '12px',
          fontFamily: 'inherit',
          overflowY: 'auto',
          // Smooth scroll on iOS so long content (textarea + step grid
          // + actions) doesn't feel janky inside the popover frame.
          WebkitOverflowScrolling: 'touch',
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header — modality chip + service name */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: '9px', fontWeight: 950, letterSpacing: '0.5px',
              color: '#0f52ba', textTransform: 'uppercase',
            }}>{modality || 'OTHER'}</div>
            <div style={{
              fontSize: '13px', fontWeight: 900, color: '#0f172a',
              marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }} title={serviceName}>{serviceName || '—'}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0,
              width: '24px', height: '24px',
              border: 'none', background: '#f1f5f9',
              borderRadius: '6px', cursor: 'pointer',
              fontSize: '14px', color: '#64748b', fontWeight: 900,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Status — visual step progression instead of a dropdown.
            Each step is a clickable chip so the operator can see
            where the service is in the flow and tap exactly the
            stage they want. Cancelled is offset on the right
            because it's a side-exit, not a forward step. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{
            fontSize: '9px', fontWeight: 900, letterSpacing: '0.5px',
            color: '#64748b', textTransform: 'uppercase',
          }}>Status</span>
          {(() => {
            const steps = [
              { value: 'NOT_STARTED', label: 'Not started', dot: '⚪', color: '#475569', bg: '#f1f5f9', border: '#e2e8f0', desc: 'Booked, waiting' },
              { value: 'IN_PROGRESS', label: 'In progress', dot: '🟡', color: '#a16207', bg: '#fef9c3', border: '#fde68a', desc: 'Scan started, just begun' },
              { value: 'IN_MID',      label: 'Half way',    dot: '🟧', color: '#b45309', bg: '#fef3c7', border: '#fcd34d', desc: 'Scan is half-way done' },
              { value: 'SCANNED',     label: 'Scanned',     dot: '🟠', color: '#9a3412', bg: '#ffedd5', border: '#fed7aa', desc: 'Acquisition complete' },
              { value: 'REPORTED',    label: 'Reported',    dot: '🔵', color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe', desc: 'Doctor signed off' },
              { value: 'DELIVERED',   label: 'Delivered',   dot: '🟢', color: '#047857', bg: '#d1fae5', border: '#a7f3d0', desc: 'Handed to patient' },
            ];
            return (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '6px',
                }}>
                  {steps.map((step) => {
                    const isActive = status === step.value;
                    return (
                      <button
                        key={step.value}
                        type="button"
                        onClick={() => setStatus(step.value)}
                        title={step.desc}
                        style={{
                          padding: '8px 4px',
                          borderRadius: '8px',
                          border: isActive ? `1.5px solid ${step.color}` : '1px solid #e2e8f0',
                          background: isActive ? step.bg : 'white',
                          color: isActive ? step.color : '#64748b',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontSize: '10px', fontWeight: 900, letterSpacing: '0.2px',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                          transition: 'all 0.12s',
                          boxShadow: isActive ? `0 2px 6px -3px ${step.color}66` : 'none',
                        }}
                        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = step.border; }}
                        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = '#e2e8f0'; }}
                      >
                        <span style={{ fontSize: '13px' }}>{step.dot}</span>
                        <span style={{ textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.2 }}>{step.label}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Cancelled — set apart as a side exit */}
                <button
                  type="button"
                  onClick={() => setStatus('CANCELLED')}
                  title="Service withdrawn from this visit"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: status === 'CANCELLED' ? '1.5px solid #9f1239' : '1px dashed #fecdd3',
                    background: status === 'CANCELLED' ? '#ffe4e6' : 'white',
                    color: status === 'CANCELLED' ? '#9f1239' : '#9f1239',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '10px', fontWeight: 900, letterSpacing: '0.3px',
                    textTransform: 'uppercase',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                    alignSelf: 'flex-start',
                    transition: 'all 0.12s',
                  }}
                >
                  <span>✕</span>
                  {status === 'CANCELLED' ? 'Cancelled — selected' : 'Cancel this service'}
                </button>
                {/* Description of current selection */}
                <div style={{
                  fontSize: '10px', fontWeight: 700, color: '#64748b',
                  padding: '6px 10px',
                  background: '#f8fafc', borderRadius: '7px',
                  border: '1px solid #f1f5f9',
                }}>
                  <span style={{ fontWeight: 900, color: '#0f172a', marginRight: '6px' }}>{(steps.find(s => s.value === status) || { label: 'Cancelled', desc: 'Service withdrawn' }).label}:</span>
                  {(steps.find(s => s.value === status) || { desc: 'Service withdrawn from this visit' }).desc}
                </div>
              </>
            );
          })()}
        </div>

        {/* Notes textarea */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            fontSize: '9px', fontWeight: 900, letterSpacing: '0.5px',
            color: '#64748b', textTransform: 'uppercase',
          }}>
            <span>Notes (ops team only)</span>
            <span style={{ fontWeight: 700, color: notes.length > 500 ? '#dc2626' : '#94a3b8' }}>{notes.length}/500</span>
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.substring(0, 500))}
            placeholder="e.g. Patient asked to come back tomorrow, sedation needed…"
            rows={3}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontSize: '12px', fontWeight: 600, color: '#0f172a',
              fontFamily: 'inherit',
              resize: 'vertical',
              minHeight: '60px', maxHeight: '120px',
              outline: 'none',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#0f52ba'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
          />
        </label>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: 'white',
              color: '#475569',
              fontSize: '11px', fontWeight: 900, letterSpacing: '0.3px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textTransform: 'uppercase',
            }}
          >Cancel</button>
          <button
            type="button"
            disabled={!dirty}
            onClick={() => onSave({ status, notes })}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: 'none',
              background: dirty
                ? 'linear-gradient(135deg, #0f52ba 0%, #1e3a8a 100%)'
                : '#cbd5e1',
              color: 'white',
              fontSize: '11px', fontWeight: 900, letterSpacing: '0.3px',
              cursor: dirty ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              textTransform: 'uppercase',
              boxShadow: dirty ? '0 3px 8px -3px rgba(15, 82, 186, 0.55)' : 'none',
            }}
          >Save ✓</button>
        </div>
      </div>
    </div>
  );
}
