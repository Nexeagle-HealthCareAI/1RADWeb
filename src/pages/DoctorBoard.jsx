import { useState, useMemo, useEffect, useCallback, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { AuthContext } from '../auth/AuthContext';
import ReportPreviewModal from '../components/ReportPreviewModal';
import useOffline from '../hooks/useOffline';
import { nativeStorage } from '../hooks/useElectron';
import useTickClock from '../utils/useTickClock';
import { formatElapsed, premisesSeverity, premisesPillStyle } from '../utils/timeTracking';
import { useOverdue } from '../components/OverdueAppointments/OverdueContext';
import { formatPatientAge } from '../utils/patientAge';
import { getServiceLines, getUniqueModalities, matchesAnyModality, getReportProgressLabel } from '../utils/appointmentServices';
import '../styles/global.css';
import '../styles/DoctorBoard.css';

const MODALITY_ICONS = {
  'X-RAY': '🩻',
  'MRI': '🧠',
  'CT': '🌀',
  'ULTRASOUND': '🤰',
  'DEXA': '🦴',
  'MAMMOGRAPHY': '🎀'
};

const TODAY = new Date().toLocaleDateString('en-CA');

// Only these exact system roles get their own queue pre-selected by default.
// Custom roles, Admin, Technician, Receptionist, Accountant → all default to 'ALL'.
const DOCTOR_ROLES = ['admindoctor', 'doctor'];

/**
 * Returns the default selectedDoctor value for the current user:
 *  - 'admindoctor' or 'doctor' system role  → their own userId (see own queue first)
 *  - Admin, Technician, Receptionist, etc.  → 'ALL' (see all doctors)
 *  - Custom role users                      → 'ALL' (custom role names are never in
 *                                              DOCTOR_ROLES, so they always fall through)
 *  - No user / not loaded yet               → 'ALL'
 */
function getDefaultDoctorFilter(user) {
  if (!user) return 'ALL';
  const userRoles = (user.roles || []).map(r => String(r).toLowerCase());
  const isDoctor = userRoles.some(r => DOCTOR_ROLES.includes(r));
  return isDoctor ? user.id : 'ALL';
}

export default function DoctorBoard() {
  const { activeCenter, currentUser } = useContext(AuthContext);
  const { isOnline } = useOffline();
  const navigate = useNavigate();
  // 60s tick keeps the on-premises pill counting up; isOverdue mirrors the bell.
  useTickClock();
  const { isOverdue } = useOverdue();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('QUEUE'); // 'QUEUE' or 'HISTORY'
  
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewAppointment, setPreviewAppointment] = useState(null);
  const [previewReport, setPreviewReport] = useState({ mode: 'Narrative Editor', text: '', impression: '', isFinalized: false });

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ modality: 'ALL', priority: 'ALL', clinicalStatus: 'ALL' });
  // Always start with 'ALL' — auto-select the logged-in doctor ONLY after the doctors
  // list has loaded, to avoid UUID race condition (empty list = zero matches).
  const [selectedDoctor, setSelectedDoctor] = useState('ALL');
  const [doctors, setDoctors] = useState([]);
  const [archivePage, setArchivePage] = useState(1);
  const [archiveFilterMode, setArchiveFilterMode] = useState('ALL'); // 'ALL' or 'RANGE'
  const [archiveDateRange, setArchiveDateRange] = useState({ start: TODAY, end: TODAY });
  const itemsPerPage = 5;
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



  // --- API SYNC ---
  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/appointments');
      
      // Sort ASCENDING for correct sequential token number calculation
      const sortedData = res.data.sort((a, b) => new Date(a.dateTime || 0).getTime() - new Date(b.dateTime || 0).getTime());
      const dailyCounters = {};

      const allCases = sortedData.map(a => {
        const studyDate = a.dateTime ? new Date(a.dateTime).toLocaleDateString('en-CA') : null;
        const dateKey = studyDate || TODAY;
        dailyCounters[dateKey] = (dailyCounters[dateKey] || 0) + 1;

        return {
          ...a,
          id: a.displayId,
          priority: a.priority || (a.type === 'EMERGENCY' ? 'STAT' : 'ROUTINE'),
          isToday: studyDate === TODAY,
          // Prefer persisted server-side token; fall back to calculated for legacy records
          tokenNo: a.dailyTokenNumber ?? dailyCounters[dateKey]
        };
      });
      setCases(allCases);
      await nativeStorage.set('1rad_cache_cases', allCases);
    } catch (err) {
      console.error('[DOCTOR] Case fetch failed, trying cache', err);
      const cached = await nativeStorage.get('1rad_cache_cases');
      if (cached) setCases(cached);
    } finally {
      setLoading(false);
    }
  }, [TODAY]);

  useEffect(() => {
    fetchCases();
    const interval = setInterval(fetchCases, 5000); 
    return () => clearInterval(interval);
  }, [fetchCases]);

  const fetchDoctors = useCallback(async () => {
    try {
      const res = await apiClient.get('/personnel');
      
      // Positive doctor match only — a custom role (or any non-clinical role)
      // must NOT be treated as a doctor. The old "not in [admin, technician,
      // receptionist, accountant]" test wrongly swept custom-role users into
      // the doctor list.
      const isDoctorRole = (r) => {
        const lower = String(r).toLowerCase().replace(/\s+/g, '');
        return lower.includes('doctor') || lower.includes('radiolog');
      };

      let docList = (res.data || []).map(p => {
        const rawRoles = p.roles || p.Roles || [];
        return {
          id: p.userId || p.UserId,
          name: p.fullName || p.FullName || 'UNKNOWN_STAFF',
          roles: rawRoles.map(r => String(r).toLowerCase())
        };
      }).filter(p => p.roles.some(isDoctorRole));
      
      if (docList.length === 0 && (res.data || []).length > 0) {
        docList = (res.data || []).map(p => ({
          id: p.userId || p.UserId,
          name: p.fullName || p.FullName || 'UNKNOWN_STAFF',
          roles: (p.roles || p.Roles || []).map(r => String(r).toLowerCase())
        }));
      }
      
      setDoctors(docList);
    } catch (err) {
      console.error('[DOCTOR] Failed to fetch doctors', err);
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
      fetchCases();
    } catch (err) {
      console.error('[DOCTOR] Status update failed', err);
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
      const matchesStatus = filters.clinicalStatus === 'ALL' || status === filters.clinicalStatus.toLowerCase();
      // Normalize UUIDs to lowercase before comparing to handle API casing differences
      const normalizedSelected = selectedDoctor?.toLowerCase();
      const matchesDoctor =
        selectedDoctor === 'ALL' ||
        (c.doctorId && c.doctorId.toLowerCase() === normalizedSelected) ||
        c.doctor === doctors.find(d => d.id?.toLowerCase() === normalizedSelected)?.name;

      if (view === 'QUEUE') {
        return matchesDoctor && matchesSearch && matchesModality && matchesPriority && matchesStatus && c.isToday && ['scheduled', 'confirmed', 'in_progress', 'scanned', 'reporting', 'booked', 'reported', 'completed', 'delivered'].includes(status);
      } else {
        const studyDate = c.dateTime ? c.dateTime.split('T')[0] : null;
        const matchesDate = archiveFilterMode === 'ALL' || (studyDate && studyDate >= archiveDateRange.start && studyDate <= archiveDateRange.end);
        return matchesDoctor && matchesSearch && matchesModality && matchesPriority && matchesStatus && matchesDate && (status === 'reported' || !c.isToday);
      }
    });
  }, [cases, search, filters, view, TODAY, archiveFilterMode, archiveDateRange, selectedDoctor, doctors]);

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

  const stats = {
    pendingReports: cases.filter(c => c.isToday && ['scanned', 'reporting'].includes(c.status?.toLowerCase())).length,
    drafts: cases.filter(c => c.isToday && c.status?.toLowerCase() === 'reporting').length,
    finalizedToday: cases.filter(c => ['reported', 'completed'].includes(c.status?.toLowerCase()) && c.isToday).length,
    delivered: cases.filter(c => c.isToday && c.status?.toLowerCase() === 'delivered').length,
    upcoming: cases.filter(c => c.isToday && ['scheduled', 'confirmed', 'in_progress', 'booked'].includes(c.status?.toLowerCase())).length,
    archiveTotal: cases.filter(c => !c.isToday || c.status?.toLowerCase() === 'reported').length,
    archiveFinalized: cases.filter(c => c.status?.toLowerCase() === 'reported').length,
    archiveDrafts: cases.filter(c => !c.isToday && c.status?.toLowerCase() === 'reporting').length,
    reportingAccuracy: 98
  };

  // --- HANDLERS ---
  const handleOpenWorkspace = async (c) => {
    // Update status to reporting if not already reporting, reported, or completed
    const currentStatus = c.status?.toLowerCase();
    if (!['reporting', 'reported', 'completed'].includes(currentStatus)) {
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
    const url = target?.id ? `/reporting/${apptId}?serviceId=${encodeURIComponent(target.id)}` : `/reporting/${apptId}`;
    navigate(url);
  };

  const handlePreviewPrint = async (c) => {
    try {
      setLoading(true);
      setPreviewAppointment(c);
      
      // Attempt to fetch existing report for this appointment
      const reportRes = await apiClient.get(`/Reporting/report/${c.appointmentId || c.id}`).catch(() => null);
      const body = reportRes?.data;
      const r = (body?.success && body?.data) ? body.data : body;

      if (r && (r.findings !== undefined || r.impression !== undefined)) {
        setPreviewReport({
          mode: r.reportingMode || r.mode || 'Narrative Editor',
          text: r.findings || '',
          data: r.structuredData,
          impression: r.impression || '',
          advice: r.advice || '',
          isFinalized: r.isFinalized || c.status?.toLowerCase() === 'reported'
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



  const renderQueue = () => (
    <div className="board-view-container" style={{ background: '#fcfdfe', minHeight: '100vh' }}>
      <div className="board-header" style={{ padding: '15px 40px', background: 'white', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <div>
           <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
              <h1 style={{ fontSize: '16px', fontWeight: 700, color: '#0a1628', letterSpacing: '-0.5px', margin: 0 }}>Reporting Worklist</h1>
           </div>
           <p style={{ fontSize: '9.5px', color: '#6b7280' }}>Review and write radiology reports for today's studies</p>
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
            <button onClick={() => setView('QUEUE')} style={{
              padding: '10px 22px', borderRadius: '8px', border: 'none', fontSize: '10.5px',
              fontWeight: 600, background: view === 'QUEUE' ? 'white' : 'transparent',
              color: view === 'QUEUE' ? '#1d4ed8' : '#6b7280', cursor: 'pointer',
              transition: '0.2s', boxShadow: view === 'QUEUE' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
            }}>Today's Queue</button>
            <button onClick={() => setView('HISTORY')} style={{
              padding: '10px 22px', borderRadius: '8px', border: 'none', fontSize: '10.5px',
              fontWeight: 600, background: view === 'HISTORY' ? 'white' : 'transparent',
              color: view === 'HISTORY' ? '#1d4ed8' : '#6b7280', cursor: 'pointer',
              transition: '0.2s', boxShadow: view === 'HISTORY' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
            }}>Archive</button>
        </div>
      </div>

      <div className="board-padding">
        {view === 'QUEUE' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '20px' }}>
            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, color: '#ef4444', marginBottom: '6px' }}>Needs Report</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '19px', fontWeight: 700, color: '#ef4444' }}>{stats.pendingReports}</span>
                 <span style={{ fontSize: '9px', fontWeight: 500, color: '#ef4444' }}>Awaiting</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>In Progress</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '19px', fontWeight: 700, color: '#f59e0b' }}>{stats.drafts}</span>
                 <span style={{ fontSize: '9px', fontWeight: 500, color: '#f59e0b' }}>Drafts</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>Finalized Today</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '19px', fontWeight: 700, color: '#2ecc71' }}>{stats.finalizedToday}</span>
                 <span style={{ fontSize: '9px', fontWeight: 500, color: '#2ecc71' }}>Reports</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>Incoming</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '19px', fontWeight: 700, color: '#1d4ed8' }}>{stats.upcoming}</span>
                 <span style={{ fontSize: '9px', fontWeight: 500, color: '#1d4ed8' }}>Studies</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>Delivered</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '19px', fontWeight: 700, color: '#15803d' }}>{stats.delivered}</span>
                 <span style={{ fontSize: '9px', fontWeight: 500, color: '#15803d' }}>Handed to Patient</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>Total Archive</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '19px', fontWeight: 700, color: '#1e293b' }}>{stats.archiveTotal}</span>
                 <span style={{ fontSize: '9px', fontWeight: 500, color: '#6366f1' }}>Studies</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>Finalized</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '19px', fontWeight: 700, color: '#059669' }}>{stats.archiveFinalized}</span>
                 <span style={{ fontSize: '9px', fontWeight: 500, color: '#059669' }}>Reports</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>Open Drafts</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '19px', fontWeight: 700, color: '#f59e0b' }}>{stats.archiveDrafts}</span>
                 <span style={{ fontSize: '9px', fontWeight: 500, color: '#f59e0b' }}>Drafts</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>Accuracy</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 <span style={{ fontSize: '19px', fontWeight: 700, color: '#1d4ed8' }}>{stats.reportingAccuracy}%</span>
                 <span style={{ fontSize: '9px', fontWeight: 500, color: '#1d4ed8' }}>Rate</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ background: 'white', padding: '15px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
              <input 
                type="text" 
                placeholder={view === 'QUEUE' ? "Search patients or IDs..." : "Search archive..."}
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                style={{ 
                  width: '100%', padding: '12px 12px 12px 45px', borderRadius: '10px', 
                  border: search.startsWith('ID:') ? '2px solid #0f52ba' : '1px solid #e2e8f0', 
                  fontSize: '12.5px', fontWeight: 700, outline: 'none',
                  background: search.startsWith('ID:') ? '#f0f7ff' : 'white'
                }} 
              />
              {search.startsWith('ID:') && (
                <span style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', background: '#1d4ed8', color: 'white', fontSize: '8px', fontWeight: 500, padding: '2px 8px', borderRadius: '4px' }}>Scanner Mode</span>
              )}
            </div>
          </div>

          {view === 'HISTORY' && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '5px 15px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', background: '#e2e8f0', padding: '2px', borderRadius: '8px' }}>
                <button onClick={() => setArchiveFilterMode('ALL')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', fontSize: '7.5px', fontWeight: 950, background: archiveFilterMode === 'ALL' ? 'white' : 'transparent', color: archiveFilterMode === 'ALL' ? '#0f52ba' : '#64748b', cursor: 'pointer' }}>ALL</button>
                <button onClick={() => setArchiveFilterMode('RANGE')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', fontSize: '7.5px', fontWeight: 950, background: archiveFilterMode === 'RANGE' ? 'white' : 'transparent', color: archiveFilterMode === 'RANGE' ? '#0f52ba' : '#64748b', cursor: 'pointer' }}>RANGE</button>
              </div>
              
              {archiveFilterMode === 'RANGE' && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="date" value={archiveDateRange.start} onChange={e => setArchiveDateRange({...archiveDateRange, start: e.target.value})} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '9px', fontWeight: 700 }} />
                  <span style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8' }}>→</span>
                  <input type="date" value={archiveDateRange.end} onChange={e => setArchiveDateRange({...archiveDateRange, end: e.target.value})} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '9px', fontWeight: 700 }} />
                </div>
              )}
            </div>
          )}

          <select value={selectedDoctor} onChange={e => setSelectedDoctor(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '9.5px', fontWeight: 500, background: 'white', outline: 'none' }}>
            <option value="ALL">All Doctors</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          <select value={filters.modality} onChange={e => setFilters({...filters, modality: e.target.value})} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '9.5px', fontWeight: 500, background: 'white', outline: 'none' }}>
            <option value="ALL">All Modalities</option>
            {Object.keys(MODALITY_ICONS).map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select value={filters.priority} onChange={e => setFilters({...filters, priority: e.target.value})} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '9.5px', fontWeight: 500, background: 'white', outline: 'none' }}>
            <option value="ALL">All Priorities</option>
            <option value="STAT">STAT</option>
            <option value="URGENT">Urgent</option>
            <option value="ROUTINE">Routine</option>
          </select>

          <select value={filters.clinicalStatus} onChange={e => setFilters({...filters, clinicalStatus: e.target.value})} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '9.5px', fontWeight: 500, background: 'white', outline: 'none' }}>
            <option value="ALL">All Statuses</option>
            {view === 'QUEUE' ? (
              <>
                <option value="SCANNED">Ready for Report</option>
                <option value="REPORTING">In Progress</option>
                <option value="IN_PROGRESS">Scanning</option>
                <option value="REPORTED">Finalized Today</option>
              </>
            ) : (
              <>
                <option value="REPORTED">Finalized</option>
                <option value="COMPLETED">Archived</option>
              </>
            )}
          </select>

          <button className="gamified-btn" onClick={fetchCases} style={{ padding: '10px 18px', borderRadius: '8px', fontSize: '10.5px', fontWeight: 600 }}>Refresh</button>
        </div>

        <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <tr>
                <th onClick={() => handleSort('patientName')} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '9px', fontWeight: 600, color: '#6b7280', cursor: 'pointer', letterSpacing: '0.3px' }}>
                  Patient {sortConfig.key === 'patientName' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th onClick={() => handleSort('tokenNo')} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '9px', fontWeight: 600, color: '#6b7280', cursor: 'pointer', letterSpacing: '0.3px' }}>
                  Token {sortConfig.key === 'tokenNo' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th onClick={() => handleSort('service')} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '9px', fontWeight: 600, color: '#6b7280', cursor: 'pointer', letterSpacing: '0.3px' }}>
                  Service {sortConfig.key === 'service' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th onClick={() => handleSort('dateTime')} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '9px', fontWeight: 600, color: '#6b7280', cursor: 'pointer', letterSpacing: '0.3px' }}>
                  Date {sortConfig.key === 'dateTime' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th onClick={() => handleSort('doctorId')} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '9px', fontWeight: 600, color: '#6b7280', cursor: 'pointer', letterSpacing: '0.3px' }}>
                  Doctor {sortConfig.key === 'doctorId' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '9px', fontWeight: 600, color: '#6b7280', letterSpacing: '0.3px' }}>
                  Scan Notes
                </th>
                <th onClick={() => handleSort('status')} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '9px', fontWeight: 600, color: '#6b7280', cursor: 'pointer', letterSpacing: '0.3px' }}>
                  Status {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '9px', fontWeight: 600, color: '#6b7280', letterSpacing: '0.3px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCases.map(c => {
                const status = c.status?.toLowerCase();
                const isReady = ['scanned', 'reporting'].includes(status);
                const isActive = ['scheduled', 'confirmed', 'in_progress', 'scanned', 'reporting', 'booked', 'reported', 'completed'].includes(status) && c.isToday;
                const isScanning = ['confirmed', 'in_progress'].includes(status);
                const isExpected = ['scheduled', 'booked'].includes(status) && c.isToday;
                
                const isCaseOverdue = isOverdue(c.appointmentId);
                const priorityTrClass = (isCaseOverdue || c.priority === 'STAT') ? 'priority-tr-stat'
                                      : c.priority === 'URGENT'                   ? 'priority-tr-urgent'
                                      : '';

                // Turnaround-time pills.
                const onPremisesElapsed = c.arrivedAt
                  ? formatElapsed(c.arrivedAt, c.deliveredAt)
                  : null;
                const premisesSev = premisesSeverity(c.arrivedAt, c.deliveredAt);
                const premisesStyle = premisesPillStyle(premisesSev);
                const scanToDelivery = (c.scanStartedAt && c.deliveredAt)
                  ? formatElapsed(c.scanStartedAt, c.deliveredAt)
                  : null;

                return (
                  <tr key={c.appointmentId} className={priorityTrClass} style={{
                    borderBottom: '1px solid #f1f5f9',
                  }}>
                    <td style={{ padding: '20px' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '14px', background: '#f8fafc', color: '#0f52ba', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '12.5px', border: '1px solid #e2e8f0' }}>{c.patientName.charAt(0)}</div>
                          <div>
                             <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '11px' }}>{c.patientName.toUpperCase()}</div>
                             <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 700 }}>{c.id} | {c.patientGender || 'M'} | {formatPatientAge(c.patientAge, '45Y')}</div>
                             {/* TAT pills: on-premises (live) + scan→delivery (final). */}
                             {onPremisesElapsed && (
                               <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px', flexWrap: 'wrap' }}>
                                 <span title={c.deliveredAt ? 'Total time on premises' : 'On premises (live)'} style={{
                                   fontSize: '7.5px', fontWeight: 950, letterSpacing: '0.3px',
                                   padding: '2px 6px', borderRadius: '999px',
                                   color: premisesStyle.color, background: premisesStyle.bg,
                                   border: `1px solid ${premisesStyle.border}`,
                                 }}>⏱ {onPremisesElapsed}</span>
                                 {scanToDelivery && (
                                   <span title="Scan start → delivered" style={{
                                     fontSize: '7.5px', fontWeight: 950, letterSpacing: '0.3px',
                                     padding: '2px 6px', borderRadius: '999px',
                                     color: '#0369a1', background: '#e0f2fe',
                                     border: '1px solid #bae6fd',
                                   }}>📋 {scanToDelivery}</span>
                                 )}
                               </div>
                             )}
                          </div>
                       </div>
                    </td>
                    <td style={{ padding: '20px' }}>
                       <div style={{ 
                         width: '45px', height: '45px', borderRadius: '12px', 
                         background: '#f0f7ff', border: '1px solid #dbeafe', 
                         display: 'flex', alignItems: 'center', justifyContent: 'center',
                         fontSize: '13.5px', fontWeight: 950, color: '#0f52ba',
                         boxShadow: '0 4px 10px rgba(15, 82, 186, 0.1)'
                       }}>
                          {c.tokenNo || '-'}
                       </div>
                    </td>
                    <td style={{ padding: '20px' }}>
                       {(() => {
                         const lines    = getServiceLines(c);
                         const progress = getReportProgressLabel(c);
                         // Per-service status palette — matches the
                         // rest of the app (OpsBoard / Technician /
                         // Reporting). Doctor sees what's already
                         // signed off in green, what's awaiting the
                         // doctor in amber/orange, etc.
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
                           }[k] || { bg: '#eff6ff', border: '#dbeafe', text: '#0f52ba' });
                         };
                         return (
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                             {/* Per-service rows — one per AppointmentService.
                                 The doctor sees every scan on the visit
                                 with its current status pill, so they
                                 know which lines need a report and
                                 which are already signed off. Cancelled
                                 services dim + strike-through. */}
                             {lines.map((line, idx) => {
                               const tint = modTint(line.modality);
                               const st   = stepStyle(line.status);
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
                                     fontSize: '7.5px', fontWeight: 950, letterSpacing: '0.4px',
                                     color: tint.text, background: tint.bg,
                                     border: `1px solid ${tint.border}`,
                                     padding: '2px 7px', borderRadius: '5px',
                                     minWidth: '44px', textAlign: 'center',
                                   }}>{line.modality || 'OT'}</span>
                                   <span style={{
                                     fontSize: '10px', fontWeight: 800, color: '#1a1a2e',
                                     textDecoration: cancelled ? 'line-through' : 'none',
                                     maxWidth: '220px',
                                     whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                   }} title={line.serviceName}>{line.serviceName || '—'}</span>
                                   <span style={{
                                     fontSize: '7.5px', fontWeight: 900, letterSpacing: '0.3px',
                                     color: st.color, background: st.bg,
                                     padding: '2px 7px', borderRadius: '999px',
                                     border: `1px solid ${st.border}`,
                                     textTransform: 'uppercase',
                                   }}>{st.label}</span>
                                 </div>
                               );
                             })}
                             {/* Visit-level meta below the per-service list */}
                             {(progress || (c.priority && c.priority !== 'ROUTINE')) && (
                               <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                                 {c.priority && c.priority !== 'ROUTINE' && (
                                   <span
                                     className={c.priority === 'STAT' ? 'priority-chip-stat' : 'priority-chip-urgent'}
                                     style={{
                                       fontSize: '7.5px', fontWeight: 950, letterSpacing: '0.5px',
                                       color: c.priority === 'STAT' ? '#dc2626' : '#d97706',
                                       background: c.priority === 'STAT' ? '#fee2e2' : '#fef3c7',
                                       border: `1px solid ${c.priority === 'STAT' ? '#fecaca' : '#fde68a'}`,
                                       padding: '2px 8px', borderRadius: '999px',
                                     }}
                                   >{c.priority}</span>
                                 )}
                                 {progress && (
                                   <span title="Reporting progress across all services on this visit" style={{
                                     fontSize: '7.5px', fontWeight: 900, letterSpacing: '0.3px',
                                     color: '#047857', background: '#d1fae5',
                                     padding: '2px 8px', borderRadius: '999px',
                                     border: '1px solid #a7f3d0',
                                   }}>{progress}</span>
                                 )}
                               </div>
                             )}
                           </div>
                         );
                       })()}
                    </td>
                    <td style={{ padding: '20px' }}>
                        <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '10.5px' }}>{c.dateTime ? new Date(c.dateTime).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : 'N/A'}</div>
                        <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 400, marginTop: '4px' }}>{c.dateTime ? `${new Date(c.dateTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} IST` : '09:00 AM'}</div>
                    </td>
                    <td style={{ padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#64748b', fontWeight: 800, border: '1px solid #e2e8f0', flexShrink: 0 }}>DR</div>
                            <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
                                {c.doctor || doctors.find(d => d.id === c.doctorId)?.name || 'Unassigned'}
                            </span>
                        </div>
                    </td>
                    <td style={{ padding: '20px' }}>
                        <div style={{ maxWidth: '200px' }}>
                           <div style={{ fontSize: '8px', fontWeight: 800, color: '#0f52ba', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: status === 'scanned' ? '#2ecc71' : '#e2e8f0' }}></span>
                              {status === 'scanned' ? 'Scan complete' : 'In pipeline'}
                           </div>
                           <div style={{ fontSize: '9px', color: c.technicianComments ? '#1e293b' : '#94a3b8', fontWeight: 500, fontStyle: c.technicianComments ? 'normal' : 'italic' }}>
                              {c.technicianComments || 'No scanning bay observations provided.'}
                           </div>
                        </div>
                    </td>
                    <td style={{ padding: '20px' }}>
                      <span style={{ 
                        padding: '6px 12px', borderRadius: '10px', fontSize: '7.5px', fontWeight: 950,
                        background: status === 'reported' ? '#f0fdf4' : isReady ? '#e9f7ef' : isScanning ? '#fef3c7' : isExpected ? '#f0f7ff' : '#f8fafc',
                        color: status === 'reported' ? '#166534' : isReady ? '#27ae60' : isScanning ? '#d97706' : isExpected ? '#0f52ba' : '#64748b',
                        border: `1px solid ${status === 'reported' ? '#bbf7d0' : isReady ? '#c3e6cb' : isScanning ? '#fcd34d' : isExpected ? '#dbeafe' : '#e2e8f0'}`,
                        textTransform: 'uppercase'
                      }}>{status === 'scanned' ? 'Ready' : status === 'confirmed' ? 'Arrived' : status === 'in_progress' ? 'Scanning' : status === 'scheduled' ? 'Expected' : status === 'reported' ? 'Finalized' : status === 'completed' ? 'Archived' : status}</span>
                    </td>
                    <td style={{ padding: '20px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>

                         <button 
                           onClick={(e) => { e.stopPropagation(); handlePreviewPrint(c); }}
                          style={{ 
                            width: '38px', height: '38px', borderRadius: '12px', background: '#fef3c7', color: '#d97706', 
                            border: '1px solid #fde68a', cursor: 'pointer', display: 'flex', 
                            alignItems: 'center', justifyContent: 'center', fontSize: '13.5px'
                          }}
                          title="Print Prescription"
                        >📜</button>
                        <button 
                          className="gamified-btn" 
                          disabled={!isActive && view !== 'HISTORY'}
                          style={{ padding: '10px 20px', fontSize: '9px', borderRadius: '12px', opacity: (isActive || view === 'HISTORY') ? 1 : 0.4, cursor: (isActive || view === 'HISTORY') ? 'pointer' : 'not-allowed' }} 
                          onClick={() => handleOpenWorkspace(c)}
                        >
                          {status === 'reported' ? 'Review' : isReady ? 'Write Report' : 'Open Report'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredCases.length === 0 && !loading && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '100px', color: '#94a3b8', fontStyle: 'italic', fontSize: '11px' }}>
                    No cases found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {view === 'HISTORY' && totalPages > 1 && (
            <div style={{ padding: '15px 30px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '9.5px', fontWeight: 500, color: '#6b7280' }}>
                Page <span style={{ color: '#1d4ed8' }}>{archivePage}</span> of <span style={{ color: '#1d4ed8' }}>{totalPages}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setArchivePage(p => Math.max(1, p - 1))}
                  disabled={archivePage === 1}
                  style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', fontSize: '9.5px', fontWeight: 500, cursor: archivePage === 1 ? 'not-allowed' : 'pointer', opacity: archivePage === 1 ? 0.5 : 1 }}
                >Previous</button>
                <button
                  onClick={() => setArchivePage(p => Math.min(totalPages, p + 1))}
                  disabled={archivePage === totalPages}
                  style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #e2e8f0', background: 'white', fontSize: '9.5px', fontWeight: 500, cursor: archivePage === totalPages ? 'not-allowed' : 'pointer', opacity: archivePage === totalPages ? 0.5 : 1 }}
                >Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-wrapper" style={{ padding: 0, background: '#fcfdfe' }}>
      {renderQueue()}

      
      <ReportPreviewModal 
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        doctorId={previewAppointment?.doctorId}
        appointmentId={previewAppointment?.appointmentId || previewAppointment?.id}
        patientData={previewAppointment}
        reportContent={previewReport}
      />
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
