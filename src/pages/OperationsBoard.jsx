import { useState, useEffect, useMemo, useCallback } from 'react';
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

  // Responsive breakpoint — matches AppointmentBoard
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isMobile = windowWidth < 768;
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
  const [newStatus, setNewStatus] = useState('NOT_STARTED');
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
      alert('Could not update this service. Please try again.');
    }
  };

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    if (!selectedItem) return;

    setSaving(true);
    try {
      // Status update. delayReason is omitted on purpose; the server keeps
      // its current value (it's only changed by the /comments endpoint now).
      await apiClient.put(`/appointments/${selectedItem.appointmentId}/operations-status`, {
        appointmentId: selectedItem.appointmentId,
        progressStatus: newStatus,
        delayReason: null
      });

      // Append a new comment if the user typed one. We always append — even
      // if the text matches the previous DelayReason — because the user
      // explicitly clicked save with this content, and the audit trail
      // should reflect that they reaffirmed it.
      const body = newReason.trim();
      if (body.length > 0) {
        await apiClient.post(`/appointments/${selectedItem.appointmentId}/comments`, { body });
      }

      showToast('Clinical progress status updated successfully!', 'success');
      setModalOpen(false);
      setNewReason('');
      fetchAppointments();
    } catch (err) {
      console.error(err);
      showToast('Failed to update clinical progress.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (appt) => {
    setSelectedItem(appt);
    setNewStatus(appt.reportProgressStatus || 'NOT_STARTED');
    // Start the textarea empty — the previous comment is shown as read-only
    // context above the input so the user knows what was there. This is the
    // "no more accidental overwrites" guardrail.
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
  // Layout:
  //   Sheet 1 "Operations" — one row per appointment, with the latest
  //      comment summary, author, time, comment count, and the full trail
  //      concatenated in chronological order.
  //   Sheet 2 "Comments"  — one row per comment so the analyst can pivot /
  //      sort by author / time in Excel itself.
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

    // Sheet 1: appointments + comment summary.
    const rows = filteredAppointments.map((a) => {
      const trail = commentsByApptId.get(a.appointmentId) || [];
      // Concatenate every comment as a single text block, oldest first, with
      // a clear delimiter per entry. Newlines render as wrapped rows in
      // Excel when Wrap-Text is enabled on the column.
      const fullTrail = trail
        .map(c => `[${fmtDateTime(c.createdAt)} — ${c.authorName}]\n${c.body}`)
        .join('\n\n');

      return {
        Token: a.dailyTokenNumber ?? '',
        'Patient ID': a.patientId ?? '',
        'Patient Name': a.patientName ?? '',
        Age: a.patientAge ?? '',
        Gender: a.patientGender ?? '',
        Mobile: a.mobile ?? '',
        Modality: a.modality ?? '',
        Service: a.service ?? '',
        Status: a.status ?? '',
        'Progress Status': a.reportProgressStatus ?? '',
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
    // Widen the comment trail column so it's readable instead of one
    // character per row. !cols controls per-column width in xlsx.
    ws['!cols'] = [
      { wch: 6 },  { wch: 14 }, { wch: 24 }, { wch: 4 }, { wch: 6 },
      { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 16 },
      { wch: 36 }, { wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 60 },
      { wch: 12 }, { wch: 8 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Operations');

    // Sheet 2: every comment as its own row — useful for pivots / sorting
    // by author or time across the whole export.
    if (allComments.length > 0) {
      const apptById = new Map(filteredAppointments.map(a => [a.appointmentId, a]));
      const commentRows = allComments.map((c) => {
        const a = apptById.get(c.appointmentId);
        return {
          Token: a?.dailyTokenNumber ?? '',
          'Patient Name': a?.patientName ?? '',
          'Display ID': a?.displayId ?? '',
          Modality: a?.modality ?? '',
          Author: c.authorName ?? '',
          'Created At': fmtDateTime(c.createdAt),
          Comment: c.body ?? '',
        };
      });
      const cws = XLSX.utils.json_to_sheet(commentRows);
      cws['!cols'] = [
        { wch: 6 }, { wch: 24 }, { wch: 14 }, { wch: 12 },
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
      if (s === 'DELIVERED') return 4;
      if (s === 'REPORTED')  return 3;
      if (s === 'SCANNED')   return 2;
      return 1;
    };
    const stepPill = (status) => {
      const s = String(status || '').toUpperCase();
      if (s === 'DELIVERED') return { label: 'Delivered',   color: '#047857', bg: '#d1fae5', border: '#a7f3d0' };
      if (s === 'REPORTED')  return { label: 'Reported',    color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' };
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
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '14px',
        padding: '16px 20px 20px',
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
                    if (step === 1) nextAction = { status: 'SCANNED',   label: '✓ Mark scanned',              tint: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', shadow: 'rgba(234, 88, 12, 0.45)' };
                    else if (step === 3) nextAction = { status: 'DELIVERED', label: '✓ Mark delivered to patient', tint: 'linear-gradient(135deg, #047857 0%, #065f46 100%)', shadow: 'rgba(4, 120, 87, 0.55)' };
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
                            fontSize: '8.5px', fontWeight: 900, letterSpacing: '0.3px',
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
            <option value="X-RAY">X-RAY</option>
            <option value="MRI">MRI</option>
            <option value="CT">CT</option>
            <option value="US">Ultrasound (US)</option>
            <option value="ECG">ECG</option>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 950, letterSpacing: '1px', margin: 0, color: '#0a1628' }}>CLINICAL OPERATIONS REGISTRY</h3>
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
                style={{
                  padding: '6px 14px',
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
              >☰ List</button>
              <button
                type="button"
                onClick={() => setViewMode('queue')}
                aria-pressed={viewMode === 'queue'}
                style={{
                  padding: '6px 14px',
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
              >⊞ Modality Queue</button>
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
            {isMobile ? (
              /* ── MOBILE: Card Layout ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
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
                      {/* Modality + Service (multi-service aware).
                          Single-service visits render exactly as before:
                          one chip and the service name. Multi-service
                          visits get a chip stack, the primary service
                          name, an extra-count chip and the green
                          "X / Y reported" progress badge. */}
                      {(() => {
                        const lines      = getServiceLines(appt);
                        const modalities = getUniqueModalities(appt);
                        const progress   = getReportProgressLabel(appt);
                        const primary    = lines[0]?.serviceName || appt.service || '';
                        const extra      = lines.length - 1;
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                            {modalities.map((m, idx) => (
                              <span key={`${m}-${idx}`} title={lines.find(l => l.modality === m)?.serviceName || m} style={{ background: '#eff6ff', color: '#0f52ba', fontSize: '9px', fontWeight: 950, padding: '3px 8px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                                {m}
                              </span>
                            ))}
                            <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: 950 }}>{primary}</span>
                            {extra > 0 && (
                              <span style={{
                                background: '#dbeafe', color: '#0f52ba',
                                fontSize: '9px', fontWeight: 900,
                                padding: '2px 7px', borderRadius: '999px',
                                letterSpacing: '0.3px',
                              }}>+{extra} more</span>
                            )}
                            {progress && (
                              <span title="Reporting progress across all services on this visit" style={{
                                background: '#d1fae5', color: '#047857',
                                fontSize: '9px', fontWeight: 900,
                                padding: '2px 7px', borderRadius: '999px',
                                border: '1px solid #a7f3d0',
                                letterSpacing: '0.3px',
                              }}>{progress}</span>
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
                        onClick={() => openEditModal(appt)}
                        style={{ marginTop: '12px', width: '100%', background: 'white', border: '1px solid #0f52ba', color: '#0f52ba', padding: '10px', borderRadius: '10px', cursor: 'pointer', fontSize: '11px', fontWeight: 950, letterSpacing: '0.3px' }}
                      >
                        OVERRIDE STATUS
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── DESKTOP: Table Layout ── */
              <table className="appointments-table">
                <thead>
                  <tr>
                    <th>Token / ID</th>
                    <th>Patient Details</th>
                    <th>Modality &amp; Service</th>
                    <th>Clinical Stage</th>
                    <th>Delivery Progress</th>
                    <th>Delay Reason / Note</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
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

                    return (
                      <tr key={appt.appointmentId} className={overdueTrClass}>
                        {/* Token / ID */}
                        <td style={{ fontFamily: 'monospace' }}>
                          <div style={{ fontWeight: 950, color: '#0f52ba', fontSize: '15px' }}>
                            {appt.dailyTokenNumber ? `#${String(appt.dailyTokenNumber).padStart(3, '0')}` : 'N/A'}
                          </div>
                          <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', fontWeight: 800 }}>{appt.displayId}</div>
                        </td>

                        {/* Patient */}
                        <td>
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
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', fontWeight: 700 }}>
                            {appt.patientAge}y · {appt.patientGender} · {appt.mobile}
                          </div>
                          {/* TAT pills: on-premises (live) + scan→delivery (final). */}
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
                        </td>

                        {/* Modality & Service (multi-service aware). */}
                        <td>
                          {(() => {
                            const lines      = getServiceLines(appt);
                            const modalities = getUniqueModalities(appt);
                            const progress   = getReportProgressLabel(appt);
                            const primary    = lines[0]?.serviceName || appt.service || '';
                            const extra      = lines.length - 1;
                            return (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                  {modalities.map((m, idx) => (
                                    <span key={`${m}-${idx}`} title={lines.find(l => l.modality === m)?.serviceName || m} style={{ display: 'inline-block', background: '#eff6ff', color: '#0f52ba', fontSize: '9px', fontWeight: 950, padding: '3px 8px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                                      {m}
                                    </span>
                                  ))}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 950 }}>{primary}</div>
                                  {extra > 0 && (
                                    <span style={{
                                      background: '#dbeafe', color: '#0f52ba',
                                      fontSize: '9px', fontWeight: 900,
                                      padding: '2px 7px', borderRadius: '999px',
                                      letterSpacing: '0.3px',
                                    }}>+{extra} more</span>
                                  )}
                                </div>
                                {progress && (
                                  <div style={{ marginTop: '4px' }}>
                                    <span title="Reporting progress across all services on this visit" style={{
                                      background: '#d1fae5', color: '#047857',
                                      fontSize: '9px', fontWeight: 900,
                                      padding: '2px 7px', borderRadius: '999px',
                                      border: '1px solid #a7f3d0',
                                      letterSpacing: '0.3px',
                                    }}>{progress}</span>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </td>

                        {/* Clinical Stage */}
                        <td>
                          <span className="status-badge" style={{ background: coreStatus.style.bg, color: coreStatus.style.text, border: `1px solid ${coreStatus.style.border}` }}>
                            {coreStatus.label}
                          </span>
                        </td>

                        {/* Delivery Progress */}
                        <td>
                          <span className="status-badge" style={{ background: progress.style.bg, color: progress.style.text, border: `1px solid ${progress.style.border}` }}>
                            {progress.label}
                          </span>
                        </td>

                        {/* Latest comment + author byline + View all link */}
                        <td style={{ maxWidth: '260px' }}>
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
                        </td>

                        {/* Action */}
                        <td style={{ textAlign: 'right' }}>
                          <button
                            onClick={() => openEditModal(appt)}
                            style={{ background: 'white', border: '1px solid #e2e8f0', color: '#0f52ba', padding: '7px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '10px', fontWeight: 950, letterSpacing: '0.3px', transition: 'all 0.15s ease' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#0f52ba'; e.currentTarget.style.background = '#eff6ff'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white'; }}
                          >
                            OVERRIDE STATUS
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {renderPagination()}
          </div>
        )}
      </div>

      {/* ── OVERRIDE MODAL ─────────────────────────────────────────────── */}
      {modalOpen && selectedItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, animation: 'fadeIn 0.25s ease-out' }}>
          <div style={{ width: '90%', maxWidth: '420px', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', borderRadius: '24px', border: '1px solid rgba(226,232,240,0.8)', boxShadow: '0 25px 50px -12px rgba(15,23,42,0.2)', padding: '30px 24px', display: 'flex', flexDirection: 'column', gap: '20px', animation: 'scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1)', boxSizing: 'border-box' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 950, margin: 0, color: '#e11d48', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Manual Status Override</h3>
                <span style={{ fontSize: '11px', color: '#0f52ba', fontWeight: 950, marginTop: '4px', display: 'block' }}>
                  {selectedItem.patientName} ({selectedItem.dailyTokenNumber ? `#${String(selectedItem.dailyTokenNumber).padStart(3, '0')}` : 'N/A'})
                </span>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#0f172a', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 950, fontSize: '12px' }}>✕</button>
            </div>

            <form onSubmit={handleUpdateStatus} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Status grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 950, letterSpacing: '0.8px', textTransform: 'uppercase' }}>Report Progress Status</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {[
                    { val: 'NOT_STARTED', lbl: '⚪ Not Started' },
                    { val: 'STARTED',     lbl: '🔵 Started' },
                    { val: 'IN_MID',      lbl: '🟡 In Mid' },
                    { val: 'DELIVERED',   lbl: '🟢 Delivered' },
                  ].map(btn => (
                    <button key={btn.val} type="button" onClick={() => setNewStatus(btn.val)}
                      style={{ background: newStatus === btn.val ? '#eff6ff' : 'white', border: newStatus === btn.val ? '2px solid #0f52ba' : '1px solid #e2e8f0', color: newStatus === btn.val ? '#0f52ba' : '#475569', padding: '10px', borderRadius: '12px', fontSize: '11px', fontWeight: 950, cursor: 'pointer', transition: 'all 0.15s ease' }}>
                      {btn.lbl}
                    </button>
                  ))}
                </div>
              </div>

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
                <button type="submit" disabled={saving}
                  style={{ flex: 1, background: 'linear-gradient(135deg, #0f52ba 0%, #0a3d91 100%)', border: 'none', color: 'white', padding: '12px', borderRadius: '12px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '11px', fontWeight: 950, boxShadow: '0 8px 18px -4px rgba(15,82,186,0.35)', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'SAVING…' : 'APPLY OVERRIDE'}
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
              fontSize: '8px', fontWeight: 950, letterSpacing: '0.8px',
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

