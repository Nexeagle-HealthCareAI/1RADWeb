import { useState, useEffect, useMemo } from 'react';
import apiClient from '../api/apiClient';
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
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modality, setModality] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Responsive breakpoint — matches AppointmentBoard
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isMobile = windowWidth < 768;
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

  // Update operations status override
  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    if (!selectedItem) return;
    
    setSaving(true);
    try {
      await apiClient.put(`/appointments/${selectedItem.appointmentId}/operations-status`, {
        appointmentId: selectedItem.appointmentId,
        progressStatus: newStatus,
        delayReason: newReason
      });
      
      showToast('Clinical progress status updated successfully!', 'success');
      setModalOpen(false);
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
    setNewReason(appt.delayReason || '');
    setModalOpen(true);
  };

  // Filter grid
  const filteredAppointments = useMemo(() => {
    return Array.isArray(appointments) ? appointments.filter(appt => {
      const apptDate = appt.dateTime ? appt.dateTime.split('T')[0] : '';
      const dateMatch = apptDate === selectedDate;
      
      const searchLower = search.toLowerCase();
      const searchMatch = !search || 
        (appt.patientName && appt.patientName.toLowerCase().includes(searchLower)) ||
        (appt.displayId && appt.displayId.toLowerCase().includes(searchLower)) ||
        (appt.mobile && appt.mobile.includes(searchLower)) ||
        (appt.service && appt.service.toLowerCase().includes(searchLower));
        
      const modalityMatch = modality === 'ALL' || appt.modality === modality;
      const progressMatch = statusFilter === 'ALL' || appt.reportProgressStatus === statusFilter;
      
      return dateMatch && searchMatch && modalityMatch && progressMatch;
    }).sort((a, b) => (a.dailyTokenNumber ?? Infinity) - (b.dailyTokenNumber ?? Infinity)) : [];
  }, [appointments, selectedDate, search, modality, statusFilter]);

  // Paginated partition matching BillingPage
  const paginatedAppointments = useMemo(() => {
    return filteredAppointments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredAppointments, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);

  // Metrics calculators based explicitly on Delivery Progress (reportProgressStatus)
  const getMetrics = () => {
    const todayAppts = Array.isArray(appointments) 
      ? appointments.filter(a => (a.dateTime ? a.dateTime.split('T')[0] : '') === selectedDate)
      : [];
    
    return {
      total: todayAppts.length,
      notStarted: todayAppts.filter(a => !a.reportProgressStatus || a.reportProgressStatus === 'NOT_STARTED').length,
      started: todayAppts.filter(a => a.reportProgressStatus === 'STARTED').length,
      inMid: todayAppts.filter(a => a.reportProgressStatus === 'IN_MID').length,
      delivered: todayAppts.filter(a => a.reportProgressStatus === 'DELIVERED').length,
      delayed: todayAppts.filter(a => a.delayReason && a.delayReason.trim().length > 0).length
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

  // Date navigator helper
  const shiftDate = (days) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  return (
    <div className="appointment-board-container">

      {/* â”€â”€ PAGE HEADER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
          </div>
        </div>
      </div>

      {/* â”€â”€ KPI INTEL CARDS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="intel-cards-grid" style={{ gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(155px, 1fr))' }}>

        <div className="intel-card dark">
          <span className="intel-label">Total Today</span>
          <div className="intel-value">{metrics.total}</div>
          <div className="intel-trend" style={{ color: '#10b981' }}>Active Queue</div>
        </div>

        <div className="intel-card" style={{ background: 'white' }}>
          <span className="intel-label">⚪ Not Started</span>
          <div className="intel-value" style={{ color: '#475569' }}>{metrics.notStarted}</div>
          <div className="intel-trend" style={{ color: '#94a3b8' }}>Awaiting Work</div>
        </div>

        <div className="intel-card" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <span className="intel-label" style={{ color: '#0f52ba' }}>🔵 Started</span>
          <div className="intel-value" style={{ color: '#0f52ba' }}>{metrics.started}</div>
          <div className="intel-trend" style={{ color: '#0f52ba' }}>In Progress</div>
        </div>

        <div className="intel-card" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
          <span className="intel-label" style={{ color: '#b45309' }}>🟡 In Mid</span>
          <div className="intel-value" style={{ color: '#b45309' }}>{metrics.inMid}</div>
          <div className="intel-trend" style={{ color: '#b45309' }}>Half Complete</div>
        </div>

        <div className="intel-card" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <span className="intel-label" style={{ color: '#15803d' }}>🟢 Delivered</span>
          <div className="intel-value" style={{ color: '#14532d' }}>{metrics.delivered}</div>
          <div className="intel-trend" style={{ color: '#15803d' }}>Reports Sent</div>
        </div>

        <div className="intel-card" style={{ background: '#fff1f2', border: '1px solid #fecaca' }}>
          <span className="intel-label" style={{ color: '#e11d48' }}>⚠️ Delayed</span>
          <div className="intel-value" style={{ color: '#881337' }}>{metrics.delayed}</div>
          <div className="intel-trend" style={{ color: '#e11d48' }}>With Delay Note</div>
        </div>

      </div>

      {/* â”€â”€ FILTER BAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
            <option value="ALL">All Delivery Progress</option>
            <option value="NOT_STARTED">Not Started</option>
            <option value="STARTED">Started</option>
            <option value="IN_MID">In Mid (Half Done)</option>
            <option value="DELIVERED">Delivered</option>
          </select>
        </div>
      </div>

      {/* â”€â”€ OPERATIONS LEDGER TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="appointments-table-wrapper">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 950, letterSpacing: '1px', margin: 0, color: '#0a1628' }}>CLINICAL OPERATIONS REGISTRY</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {isMobile ? (
              /* ── MOBILE: Card Layout ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
                {paginatedAppointments.map((appt) => {
                  const progress   = getProgressBadge(appt.reportProgressStatus);
                  const coreStatus = getCoreStatusStyle(appt.status);
                  return (
                    <div key={appt.appointmentId} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
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
                      {/* Patient info */}
                      <div style={{ fontWeight: 950, color: '#0f172a', fontSize: '14px' }}>{appt.patientName}</div>
                      {appt.patientId && (
                        <div style={{ fontSize: '9px', color: '#0f52ba', fontWeight: 800, marginTop: '2px', fontFamily: 'monospace' }}>PID: {appt.patientId}</div>
                      )}
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginTop: '2px' }}>
                        {appt.patientAge}y · {appt.patientGender} · {appt.mobile}
                      </div>
                      {/* Modality + Service */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                        <span style={{ background: '#eff6ff', color: '#0f52ba', fontSize: '9px', fontWeight: 950, padding: '3px 8px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                          {appt.modality}
                        </span>
                        <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: 950 }}>{appt.service}</span>
                      </div>
                      {/* Delay note */}
                      {appt.delayReason && (
                        <div style={{ background: '#fff1f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '10px', fontSize: '11px', lineHeight: 1.4, fontWeight: 800, marginTop: '10px' }}>
                          ⚠️ <strong>Delayed:</strong> {appt.delayReason}
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

                    return (
                      <tr key={appt.appointmentId}>
                        {/* Token / ID */}
                        <td style={{ fontFamily: 'monospace' }}>
                          <div style={{ fontWeight: 950, color: '#0f52ba', fontSize: '15px' }}>
                            {appt.dailyTokenNumber ? `#${String(appt.dailyTokenNumber).padStart(3, '0')}` : 'N/A'}
                          </div>
                          <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', fontWeight: 800 }}>{appt.displayId}</div>
                        </td>

                        {/* Patient */}
                        <td>
                          <div style={{ fontWeight: 950, color: '#0f172a', fontSize: '14px' }}>{appt.patientName}</div>
                          {appt.patientId && (
                            <div style={{ fontSize: '9px', color: '#0f52ba', fontWeight: 800, marginTop: '2px', fontFamily: 'monospace' }}>PID: {appt.patientId}</div>
                          )}
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', fontWeight: 700 }}>
                            {appt.patientAge}y · {appt.patientGender} · {appt.mobile}
                          </div>
                        </td>

                        {/* Modality & Service */}
                        <td>
                          <span style={{ display: 'inline-block', background: '#eff6ff', color: '#0f52ba', fontSize: '9px', fontWeight: 950, padding: '3px 8px', borderRadius: '6px', border: '1px solid #bfdbfe', marginBottom: '4px' }}>
                            {appt.modality}
                          </span>
                          <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 950 }}>{appt.service}</div>
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

                        {/* Delay Note */}
                        <td style={{ maxWidth: '240px' }}>
                          {appt.delayReason ? (
                            <div style={{ background: '#fff1f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '12px', fontSize: '11px', lineHeight: 1.4, maxHeight: '60px', overflowY: 'auto', fontWeight: 800 }}>
                              ⚠️ <strong>Delayed:</strong> {appt.delayReason}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '11px', fontStyle: 'italic', fontWeight: 700 }}>No delays recorded</span>
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

      {/* â”€â”€ OVERRIDE MODAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

              {/* Delay reason */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 950, letterSpacing: '0.8px', textTransform: 'uppercase' }}>Reason for Delay / Comments</label>
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

      {/* â”€â”€ TOAST CONTAINER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{ position: 'fixed', bottom: '30px', right: '16px', left: isMobile ? '16px' : 'auto', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: t.type === 'success' ? '#10b981' : '#ef4444', color: 'white', padding: '14px 24px', borderRadius: '14px', fontSize: '11px', fontWeight: 950, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', animation: 'fadeIn 0.2s ease-out', pointerEvents: 'auto', minWidth: isMobile ? 'unset' : '280px', border: t.type === 'success' ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(248,113,113,0.2)' }}>
            {t.type === 'success' ? '✅' : '❌'} {t.message.toUpperCase()}
          </div>
        ))}
      </div>

      {/* â”€â”€ KEYFRAMES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.9) translateY(20px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
      `}</style>

    </div>
  );
}

