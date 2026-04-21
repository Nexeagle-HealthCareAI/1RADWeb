import { useState, useMemo, useEffect, useCallback, useContext, useRef } from 'react';
import apiClient from '../api/apiClient';
import { AuthContext } from '../auth/AuthContext';
import '../styles/global.css';

// --- CONSTANTS ---

const MODALITIES = ['X-RAY', 'MRI', 'CT', 'ULTRASOUND', 'DEXA', 'ANGIOGRAPHY', 'MAMMOGRAPHY', 'PET-CT', 'NUCLEAR MEDICINE', 'FLUOROSCOPY'];
const TODAY = new Date().toISOString().split('T')[0];

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
  BOOKED:      { icon: '\u{1F4CB}', label: 'Booked', color: '#3498db', bg: '#e8f4fd', glow: 'rgba(52,152,219,0.15)' },
  ARRIVED:     { icon: '\u{1F4CD}', label: 'Arrived', color: '#2ecc71', bg: '#e9f7ef', glow: 'rgba(46,204,113,0.15)' },
  IN_PROGRESS: { icon: '\u26A1', label: 'Scanning', color: '#f39c12', bg: '#fef9e7', glow: 'rgba(243,156,18,0.15)' },
  COMPLETED:   { icon: '\u2705', label: 'Complete', color: '#27ae60', bg: '#d5f5e3', glow: 'rgba(39,174,96,0.15)' },
  CANCELLED:   { icon: '\u26D4', label: 'Cancelled', color: '#e74c3c', bg: '#fdedec', glow: 'rgba(231,76,60,0.15)' },
};

const MODALITY_ICONS = {
  'X-RAY': '\u{1FA7B}', 
  'MRI': '\u{1F9E0}', 
  'CT': '\u{1F300}', 
  'ULTRASOUND': '\u{1F930}', 
  'DEXA': '\u{1F9B4}',
  'ANGIOGRAPHY': '\u{1FAC0}',
  'MAMMOGRAPHY': '\u{1F380}',
  'PET-CT': '\u2622',
  'NUCLEAR MEDICINE': '\u{1F52C}',
  'FLUOROSCOPY': '\u1F4FA'
};

export default function AppointmentBoard() {
  const { activeCenterId, activeCenter } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('TODAY'); // 'TODAY' or 'PAST'
  const [pastDateRange, setPastDateRange] = useState({ 
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
    end: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] 
  });
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [drawerSearchQuery, setDrawerSearchQuery] = useState('');
  const [filters, setFilters] = useState({ date: TODAY, status: 'ALL', modality: 'ALL', doctor: 'ALL' });
  const [expandedRow, setExpandedRow] = useState(null);

  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [printModalData, setPrintModalData] = useState(null);
  const [tokenPrintData, setTokenPrintData] = useState(null);

  const [bookingStep, setBookingStep] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const listTopRef = useRef(null);
  const [newBooking, setNewBooking] = useState({ patientId: '', service: '', modality: 'X-RAY', date: TODAY, time: '09:00', doctor: '', notes: '' });

  const [newPatient, setNewPatient] = useState({ 
    name: '', mobile: '', age: '', gender: 'Male', 
    village: '', district: '', address: '', sourceOfInfo: '', referrerId: null
  });
  const [duplicatePatient, setDuplicatePatient] = useState(null);

  const [referrers, setReferrers] = useState([]);
  const [isAddingNewReferrer, setIsAddingNewReferrer] = useState(false);
  const [newReferrer, setNewReferrer] = useState({ name: '', contact: '', address: '' });
  const [referrerSearchValue, setReferrerSearchValue] = useState('');
  const [serviceRegistry, setServiceRegistry] = useState([]);
  const drawerBodyRef = useRef(null);

  useEffect(() => {
    if (drawerBodyRef.current) {
      drawerBodyRef.current.scrollTop = 0;
    }
  }, [bookingStep, isBookingOpen]);

  // --- API SYNC ---
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        search: searchQuery,
        status: filters.status,
      };

      if (activeTab === 'TODAY') {
        params.date = TODAY;
      } else {
        params.startDate = pastDateRange.start;
        params.endDate = pastDateRange.end;
        params.isArchive = true;
      }

      const response = await apiClient.get('/appointments', { params });
      let mappedData = response.data.map(a => ({
        ...a,
        id: a.displayId,
        appointmentId: a.appointmentId,
        ptid: a.patientIdentifier
      }));

      if (activeTab === 'TODAY') {
        // Sort by dateTime to ensure chronological tokens
        mappedData.sort((a, b) => new Date(a.dateTime || 0) - new Date(b.dateTime || 0));
        mappedData = mappedData.map((a, index) => ({
          ...a,
          tokenNo: index + 1
        }));
      }

      setAppointments(mappedData);
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filters.status, activeTab, pastDateRange]);

  const fetchPatients = useCallback(async (query) => {
    try {
      const response = await apiClient.get('/patients', {
        params: { search: query }
      });
      setPatients(response.data.map(p => ({
        ...p,
        id: p.patientId,
        name: p.fullName
      })));
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    }
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

  const fetchDoctors = useCallback(async () => {
    try {
      const response = await apiClient.get('/personnel');
      const allPersonnel = response.data;
      // Filter for roles: admindoctor or doctor (case-insensitive)
      const specialists = allPersonnel.filter(p => 
        p.roles && p.roles.some(role => 
          role.toLowerCase() === 'doctor' || role.toLowerCase() === 'admindoctor'
        )
      ).map(p => p.fullName);
      setDoctors(specialists);
    } catch (error) {
      console.error('Failed to fetch doctors:', error);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments, activeCenterId, activeTab]);

  useEffect(() => {
    if (drawerSearchQuery.length > 2) {
      fetchPatients(drawerSearchQuery);
    }
  }, [drawerSearchQuery, fetchPatients]);

  const fetchRegistry = useCallback(async () => {
    try {
      const res = await apiClient.get('/finance/registry');
      setServiceRegistry(res.data);
    } catch (err) {
      console.error('[FINANCE] Registry fetch failed', err);
    }
  }, []);

  useEffect(() => {
    fetchReferrers('');
    fetchDoctors();
    fetchRegistry();
  }, [fetchReferrers, fetchDoctors, fetchRegistry, activeCenterId]);

  // --- DERIVED ---
  const filteredAppointments = useMemo(() => {
    return appointments.filter(app => {
      // Date filtering (Defensive)
      const appDate = app.date || (app.dateTime ? app.dateTime.split('T')[0] : null);
      
      if (activeTab === 'TODAY') {
        if (appDate !== TODAY) return false;
      } else {
        // Archive mode filtering
        if (!appDate) return false;
        if (appDate < pastDateRange.start || appDate > pastDateRange.end) return false;
      }

      const matchesSearch = app.patientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            app.mobile.includes(searchQuery) || 
                            app.id.includes(searchQuery);
      const matchesStatus = filters.status === 'ALL' || app.status === filters.status;
      const matchesModality = filters.modality === 'ALL' || app.modality === filters.modality;
      const matchesDoctor = filters.doctor === 'ALL' || app.doctor === filters.doctor;
      return matchesSearch && matchesStatus && matchesModality && matchesDoctor;
    });
  }, [appointments, searchQuery, filters, activeTab, pastDateRange]);

  // Derived validation
  const isMobileValid = /^\d{10}$/.test(newPatient.mobile);
  const isNewPatientIncomplete = !newBooking.patientId && 
    (!newPatient.name.trim() || !isMobileValid || !newPatient.age.trim());

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filters]);

  // Auto-scroll on page change
  useEffect(() => {
    if (listTopRef.current) {
      listTopRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentPage]);

  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);
  const paginatedAppointments = filteredAppointments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const stats = {
    total: filteredAppointments.length,
    booked: filteredAppointments.filter(a => a.status === 'BOOKED').length,
    arrived: filteredAppointments.filter(a => a.status === 'ARRIVED').length,
    inProgress: filteredAppointments.filter(a => a.status === 'IN_PROGRESS').length,
    completed: filteredAppointments.filter(a => a.status === 'COMPLETED').length,
    cancelled: filteredAppointments.filter(a => a.status === 'CANCELLED').length,
  };
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const activeRate = stats.total > 0 ? Math.round(((stats.total - stats.cancelled) / stats.total) * 100) : 0;

  // --- HANDLERS ---
  const handleAction = async (id, action) => {
    // Find the real GUID for this display ID
    const app = appointments.find(a => a.id === id);
    if (!app) return;

    let newStatus = '';
    if (action === 'ARRIVE') newStatus = 'ARRIVED';
    if (action === 'START') newStatus = 'IN_PROGRESS';
    if (action === 'COMPLETE') newStatus = 'COMPLETED';
    if (action === 'CANCEL') newStatus = 'CANCELLED';

    try {
      await apiClient.patch(`/appointments/${app.appointmentId}/status`, `"${newStatus}"`, {
        headers: { 'Content-Type': 'application/json' }
      });
      fetchAppointments();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const getNextAction = (status) => {
    switch (status) {
      case 'BOOKED': return { action: 'ARRIVE', label: 'CHECK IN', icon: '\u{1F4CD}', color: '#2ecc71' };
      case 'ARRIVED': return { action: 'START', label: 'BEGIN SCAN', icon: '\u26A1', color: '#f39c12' };
      case 'IN_PROGRESS': return { action: 'COMPLETE', label: 'FINALIZE', icon: '\u2705', color: '#27ae60' };
      default: return null;
    }
  };

  const handleAddPatient = async (e) => {
    e.preventDefault();
    try {
      const response = await apiClient.post('/patients', {
        fullName: newPatient.name,
        mobile: newPatient.mobile,
        age: newPatient.age,
        gender: newPatient.gender,
        village: newPatient.village,
        district: newPatient.district,
        address: newPatient.address,
        sourceOfInfo: newPatient.sourceOfInfo
      });
      
      const patientId = response.data.patientId;
      setIsAddPatientOpen(false);
      setNewPatient({ name: '', mobile: '', age: '', gender: 'Male', village: '', district: '', address: '', referredBy: '', sourceOfInfo: '' });
      setNewBooking(prev => ({ ...prev, patientId }));
      fetchPatients('');
    } catch (error) {
      console.error('Failed to add patient:', error);
    }
  };

  const handleBookAppointment = async () => {
    if (!newBooking.service) {
      alert('WARNING: Service/Procedure details are missing. Field is mandatory for deployment.');
      return;
    }
    if (!newBooking.doctor) {
      alert('WARNING: No Lead Specialist assigned. Mission cannot proceed without a supervisor.');
      return;
    }

    try {
      const appointmentRes = await apiClient.post('/appointments', {
        patientId: newBooking.patientId,
        service: newBooking.service,
        modality: newBooking.modality,
        dateTime: new Date().toISOString(),
        type: 'BOOKED',
        doctor: newBooking.doctor,
        referredBy: newPatient.referredBy || '',
        referredContact: referrers.find(r => r.name === newPatient.referredBy)?.contact || '',
        referredAddress: referrers.find(r => r.name === newPatient.referredBy)?.address || '',
        notes: newBooking.notes
      });

      // --- AUTO-BILLING TRIGGER (API INTEGRATED) ---
      try {
        const storedSettings = JSON.parse(localStorage.getItem('1rad_billing_settings') || '{"autoBill":false}');
        
        if (storedSettings.autoBill) {
          const matchedPrice = serviceRegistry.find(p => 
            p.modality === newBooking.modality && 
            p.serviceName.toLowerCase() === newBooking.service.toLowerCase()
          );

          if (matchedPrice) {
            await apiClient.post('/finance/invoices', {
              patientId: newBooking.patientId,
              appointmentId: appointmentRes.data.appointmentId,
              items: [{
                description: matchedPrice.serviceName,
                amount: matchedPrice.amount,
                quantity: 1
              }]
            });
            console.log('AUTO-BILL: Server-side invoice generated');
          }
        }
      } catch (err) {
        console.error('AUTO-BILL: Failed to process backend billing', err);
      }
      // ----------------------------------------------

      setIsBookingOpen(false);
      resetBooking();
      fetchAppointments();
    } catch (error) {
      console.error('Failed to book appointment:', error);
      alert('CRITICAL ERROR: Mission deployment failed. Check backend telemetry.');
    }
  };

  const resetBooking = () => {
    setBookingStep(1);
    setNewBooking({ patientId: '', service: '', modality: 'X-RAY', doctor: '', notes: '' });
    setNewPatient({ name: '', mobile: '', age: '', gender: 'Male', village: '', district: '', address: '', referredBy: '', sourceOfInfo: '' });
    setReferrerSearchValue('');
    setDrawerSearchQuery('');
  };

  // ============================================================
  //  STATUS PIPELINE
  // ============================================================

  // ============================================================
  //  MISSION INTEL CARDS
  // ============================================================
  const renderIntelCards = () => {
    const readyCount = stats.booked + stats.arrived;
    const progressCount = stats.inProgress;
    
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '20px', marginBottom: '32px',
      }}>
        {/* Card: Total Missions */}
        <div style={{
          background: 'linear-gradient(135deg, #0a1628 0%, #1e293b 100%)',
          borderRadius: '20px', padding: '24px', color: 'white', position: 'relative', overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.05)'
        }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '100px', opacity: 0.05, lineHeight: 1 }}>{'\u{1F4E1}'}</div>
          <div style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.7, marginBottom: '12px' }}>Total Missions</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <div style={{ fontSize: '48px', fontWeight: 950, lineHeight: 1 }}>{stats.total}</div>
            <div style={{ fontSize: '12px', fontWeight: 700, opacity: 0.6 }}>UNITS</div>
          </div>
          <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: 'var(--tactical-cyan)', borderRadius: '2px' }} />
            </div>
            <span style={{ fontSize: '9px', fontWeight: 900, color: 'var(--tactical-cyan)' }}>100% REGISTRY</span>
          </div>
        </div>

        {/* Card: Ready Stats */}
        <div style={{
          background: 'white', borderRadius: '20px', padding: '24px',
          border: '1px solid #dee2e6', position: 'relative', overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
        }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '100px', opacity: 0.04, lineHeight: 1 }}>{'\u{1F6EB}'}</div>
          <div style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', color: '#64748b', marginBottom: '12px' }}>Ready for Deployment</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '48px', fontWeight: 950, color: '#0f52ba', lineHeight: 1 }}>{readyCount}</span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f52ba', opacity: 0.8 }}>READY</span>
          </div>
          <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8' }}>BOOKED</span>
              <span style={{ fontSize: '14px', fontWeight: 900, color: '#334155' }}>{stats.booked}</span>
            </div>
            <div style={{ width: '1px', background: '#e2e8f0', margin: '4px 0' }}></div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8' }}>ARRIVED</span>
              <span style={{ fontSize: '14px', fontWeight: 900, color: '#334155' }}>{stats.arrived}</span>
            </div>
          </div>
        </div>

        {/* Card: Progress Stats */}
        <div style={{
          background: 'white', borderRadius: '20px', padding: '24px',
          border: '1px solid #dee2e6', position: 'relative', overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
        }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '100px', opacity: 0.04, lineHeight: 1 }}>{'\u26A1'}</div>
          <div style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', color: '#64748b', marginBottom: '12px' }}>Mission in Progress</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '48px', fontWeight: 950, color: '#f39c12', lineHeight: 1 }}>{progressCount}</span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#f39c12', opacity: 0.8 }}>ACTIVE SCAN</span>
          </div>
          <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: progressCount > 0 ? '100%' : '0%', height: '100%', background: '#f39c12', borderRadius: '2px', transition: 'width 0.5s ease' }} />
            </div>
            <span style={{ fontSize: '9px', fontWeight: 900, color: '#f39c12' }}>{progressCount > 0 ? 'SCANNING' : 'IDLE'}</span>
          </div>
        </div>

        {/* Card: Completed Stats */}
        <div style={{
          background: 'white', borderRadius: '20px', padding: '24px',
          border: '1px solid #dee2e6', position: 'relative', overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
        }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '100px', opacity: 0.04, lineHeight: 1 }}>{'\u2705'}</div>
          <div style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', color: '#64748b', marginBottom: '12px' }}>Completed Operations</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '48px', fontWeight: 950, color: '#10b981', lineHeight: 1 }}>{stats.completed}</span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#10b981', opacity: 0.8 }}>SUCCESS</span>
          </div>
          <div style={{ marginTop: '20px', height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${(stats.completed / (stats.total || 1)) * 100}%`, height: '100%', background: '#10b981', borderRadius: '2px', transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 800, marginTop: '8px', textTransform: 'uppercase' }}>Mission Success Rate: {Math.round((stats.completed / (stats.total || 1)) * 100)}%</div>
        </div>
      </div>
    );
  };

  // ============================================================
  //  FILTER CONSOLE
  // ============================================================
  const renderFilterBar = () => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      marginBottom: '24px', flexWrap: 'wrap',
    }}>
      <div style={{
        flex: '1 1 280px', display: 'flex', alignItems: 'center', gap: '10px',
        background: 'white', border: '1px solid #dee2e6', borderRadius: '12px',
        padding: '10px 16px', transition: 'border-color 0.2s',
      }}>
        <span style={{ fontSize: '16px', opacity: 0.4 }}>{'\u{1F50D}'}</span>
        <input
          type="text"
          placeholder="Search patient, mobile, or ID..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: '13px', fontWeight: 600, width: '100%', color: '#333',
          }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', color: '#aaa', padding: 0 }}>{'\u2715'}</button>
        )}
      </div>

      <select
        value={filters.doctor}
        onChange={e => setFilters({...filters, doctor: e.target.value})}
        style={{
          background: 'white', border: '1px solid #dee2e6', borderRadius: '12px',
          padding: '10px 16px', fontSize: '12px', fontWeight: 700, color: '#555',
          cursor: 'pointer', minWidth: '160px',
        }}
      >
        <option value="ALL">All Specialists</option>
        {doctors.map(d => <option key={d} value={d}>{d}</option>)}
      </select>

      {activeTab === 'PAST' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid #dee2e6', borderRadius: '12px', padding: '10px 16px' }}>
          <span style={{ fontSize: '10px', fontWeight: 900, color: '#0f52ba', textTransform: 'uppercase', marginRight: '5px' }}>Mission Range</span>
          <input 
            type="date" 
            value={pastDateRange.start} 
            onChange={e => setPastDateRange(prev => ({ ...prev, start: e.target.value }))}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px', fontWeight: 700, color: '#333' }}
          />
          <span style={{ color: '#ccc' }}>→</span>
          <input 
            type="date" 
            value={pastDateRange.end} 
            onChange={e => setPastDateRange(prev => ({ ...prev, end: e.target.value }))}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px', fontWeight: 700, color: '#333' }}
          />
        </div>
      )}

      {(filters.status !== 'ALL' || filters.modality !== 'ALL' || filters.doctor !== 'ALL' || searchQuery || activeTab !== 'TODAY') && (
        <button
          onClick={() => { 
            setFilters({ date: TODAY, status: 'ALL', modality: 'ALL', doctor: 'ALL' }); 
            setSearchQuery(''); 
            setActiveTab('TODAY');
            setPastDateRange({ 
              start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
              end: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] 
            });
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 16px', borderRadius: '12px',
            background: '#fff5f5', border: '1px solid #fecaca', cursor: 'pointer',
            fontSize: '11px', fontWeight: 800, color: '#e74c3c',
            transition: 'all 0.2s',
          }}
        >
          {'\u2715'} RESET ARCHIVE
        </button>
      )}


    </div>
  );

  // ============================================================
  //  APPOINTMENT TABLE ROW
  // ============================================================
  const renderAppointmentRow = (app) => {
    const meta = STATUS_META[app.status];
    const next = getNextAction(app.status);
    const isExpanded = expandedRow === app.id;
    const statusIndex = ['BOOKED','ARRIVED','IN_PROGRESS','COMPLETED'].indexOf(app.status);
    const patient = patients.find(p => p.id === app.patientId);

    return (
      <div key={app.id} style={{ marginBottom: '10px' }}>
        <div
          onClick={() => setExpandedRow(isExpanded ? null : app.id)}
          style={{
            display: 'grid',
            gridTemplateColumns: '0.6fr 0.6fr 1.8fr 1.8fr 0.8fr 1fr 1.6fr',
            alignItems: 'center',
            padding: '16px 22px',
            background: isExpanded ? '#fafbff' : 'white',
            borderRadius: isExpanded ? '14px 14px 0 0' : '14px',
            border: `1px solid ${isExpanded ? '#c5d5f0' : '#eee'}`,
            borderBottom: isExpanded ? '1px dashed #dde5f5' : `1px solid ${isExpanded ? '#c5d5f0' : '#eee'}`,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: meta.color, borderRadius: '4px 0 0 4px' }} />

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba', fontFamily: 'monospace' }}>{app.ptid || '\u2014'}</div>
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#ccc' }}>{app.id}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '14px', fontWeight: 950, color: '#1a1a2e' }}>
              #{app.tokenNo || (app.id.includes('-') ? app.id.split('-')[1] : app.id)}
            </div>
            <div style={{ fontSize: '8px', fontWeight: 900, color: '#abb8c3', textTransform: 'uppercase' }}>TOKEN</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: '13px' }}>{app.patientName}</div>
            <div style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>{app.mobile} {'\u00B7'} {app.patientAge}y {app.patientGender}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '12px', color: '#0f52ba', fontWeight: 800 }}>{app.referredBy || 'Self'}</div>
            <div style={{ fontSize: '11px', color: '#888', fontWeight: 600 }}>{app.referredContact !== 'N/A' ? app.referredContact : ''}</div>
          </div>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '4px 8px', borderRadius: '20px',
            background: meta.bg, border: `1px solid ${meta.color}20`,
            justifySelf: 'start'
          }}>
            <span style={{ fontSize: '10px' }}>{meta.icon}</span>
            <span style={{ fontSize: '8px', fontWeight: 950, color: meta.color, textTransform: 'uppercase' }}>{meta.label}</span>
          </div>

          <div style={{ fontWeight: 700, color: '#333', fontSize: '11px' }}>{app.doctor}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifySelf: 'end' }}>
            {next && (
              <button
                onClick={(e) => { e.stopPropagation(); handleAction(app.id, next.action); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                  padding: '6px 10px', borderRadius: '8px',
                  background: next.color, border: 'none', cursor: 'pointer',
                  fontSize: '9px', fontWeight: 950, color: 'white',
                  boxShadow: `0 3px 8px ${next.color}30`, transition: 'all 0.2s',
                  width: '90px'
                }}
              >
                {next.icon} {next.label}
              </button>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); setTokenPrintData(app); }}
              style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: '#e8f0fe', border: '1px solid #c5d5f0', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', color: '#0f52ba', transition: 'all 0.2s',
              }}
              title="Print Thermal Token"
            >
              {'\u{1F5A8}\uFE0F'}
            </button>

            {app.status !== 'CANCELLED' && app.status !== 'COMPLETED' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleAction(app.id, 'CANCEL'); }}
                style={{
                  width: '28px', height: '28px', borderRadius: '8px',
                  background: '#fff5f5', border: '1px solid #fecaca', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', color: '#e74c3c', transition: 'all 0.2s',
                }}
                title="Abort Mission"
              >
                {'\u2715'}
              </button>
            )}

            <div style={{ marginLeft: '4px', transition: 'transform 0.2s', transform: `rotate(${isExpanded ? 180 : 0}deg)`, fontSize: '10px', color: '#ccc' }}>{'\u25BC'}</div>
          </div>
        </div>

        {isExpanded && (
          <div style={{
            background: '#fafbff', borderRadius: '0 0 14px 14px',
            border: '1px solid #c5d5f0', borderTop: 'none',
            padding: '20px 22px',
          }}>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '0 0 auto' }}>
                {['BOOKED','ARRIVED','IN_PROGRESS','COMPLETED'].map((s, i) => {
                  const sMeta = STATUS_META[s];
                  const reached = statusIndex >= i;
                  const isCurrent = s === app.status;
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{
                        width: isCurrent ? '32px' : '24px', height: isCurrent ? '32px' : '24px',
                        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: reached ? sMeta.color : '#eee',
                        color: reached ? 'white' : '#ccc',
                        fontSize: isCurrent ? '14px' : '10px', fontWeight: 900,
                        transition: 'all 0.3s', boxShadow: isCurrent ? `0 0 12px ${sMeta.glow}` : 'none',
                      }}>
                        {reached ? sMeta.icon : (i + 1)}
                      </div>
                      {i < 3 && (
                        <div style={{
                          width: '24px', height: '2px',
                          background: statusIndex > i ? sMeta.color : '#eee',
                          borderRadius: '1px',
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>

              {patient && (
                <div style={{ display: 'flex', gap: '32px', flex: 1 }}>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
              </div>
            </div>
          </div>
        )}
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
      <div className="drawer-overlay" onClick={() => setIsBookingOpen(false)}>
        <div className="drawer-content" onClick={e => e.stopPropagation()}>
          <div className="drawer-header" style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0f52ba 100%)', color: 'white', padding: '28px 30px', border: 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <span style={{ fontSize: '20px' }}>{isStep1 ? '\u{1F3AF}' : '\u{1F680}'}</span>
                <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0 }}>NEW MISSION</h2>
              </div>
              <p style={{ fontSize: '11px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px' }}>Phase {bookingStep}: {isStep1 ? 'Target Identity' : 'Mission Configuration'}</p>
            </div>
            <button className="btn-close" style={{ color: 'white', fontSize: '28px' }} onClick={() => setIsBookingOpen(false)}>&times;</button>
          </div>

          <div style={{ padding: '0 30px', marginTop: '20px' }}>
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
              <div className="quest-step-container">
                <div style={{ background: '#f8f9fa', padding: '18px', borderRadius: '14px', border: '1px solid #eee' }}>
                  <label style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 800, marginBottom: '10px', display: 'block', letterSpacing: '1px' }}>SEARCH PATIENT DATABASE</label>
                  <div className="search-input-group" style={{ width: '100%' }}>
                    <span className="search-icon">{'\u{1F50D}'}</span>
                    <input type="text" placeholder="Name or mobile number..." value={drawerSearchQuery} onChange={(e) => setDrawerSearchQuery(e.target.value)} autoFocus />
                  </div>

                  {drawerSearchQuery && (
                    <div style={{ marginTop: '10px', maxHeight: '160px', overflowY: 'auto' }}>
                      {patients.filter(p => 
                        p.name.toLowerCase().includes(drawerSearchQuery.toLowerCase()) || 
                        p.mobile.includes(drawerSearchQuery) || 
                        p.id.toLowerCase().includes(drawerSearchQuery.toLowerCase()) ||
                        (p.patientIdentifier && p.patientIdentifier.toLowerCase().includes(drawerSearchQuery.toLowerCase()))
                      ).map(p => (
                        <div key={p.id}
                          className={`patient-search-result ${newBooking.patientId === p.id ? 'selected' : ''}`}
                          onClick={() => { 
                            setNewBooking({...newBooking, patientId: p.id}); 
                            setNewPatient({
                              name: p.name,
                              mobile: p.mobile,
                              age: p.age || '',
                              gender: p.gender || 'Male',
                              village: p.village || '',
                              district: p.district || '',
                              address: p.address || '',
                              referredBy: p.referredBy || '',
                              sourceOfInfo: p.sourceOfInfo || ''
                            });
                            setDuplicatePatient(null); 
                          }}
                        >
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '10px',
                            background: newBooking.patientId === p.id ? '#0f52ba' : '#e8f0fe',
                            color: newBooking.patientId === p.id ? 'white' : '#0f52ba',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 900, fontSize: '12px', flexShrink: 0,
                          }}>{p.name.charAt(0)}</div>
                          <div style={{ flex: 1 }}>
                             <div style={{ fontWeight: 700, fontSize: '13px', color: '#1a1a2e' }}>{p.name}</div>
                             <div style={{ fontSize: '10px', color: '#888' }}>
                               <span style={{ color: '#0f52ba', fontWeight: 800 }}>{p.patientIdentifier || p.id}</span> {'\u00B7'} {p.mobile} {'\u00B7'} {p.age}y {p.gender}
                             </div>
                          </div>
                          {newBooking.patientId === p.id && <span style={{ color: '#0f52ba', fontWeight: 900 }}>{'\u2714'}</span>}
                        </div>
                      ))}
                      {!patients.some(p => 
                        p.name.toLowerCase().includes(drawerSearchQuery.toLowerCase()) || 
                        p.mobile.includes(drawerSearchQuery) ||
                        p.id.toLowerCase().includes(drawerSearchQuery.toLowerCase()) ||
                        (p.patientIdentifier && p.patientIdentifier.toLowerCase().includes(drawerSearchQuery.toLowerCase()))
                      ) && (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: '12px' }}>New capture required - provide details below</div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ background: 'white', padding: '22px', borderRadius: '14px', border: '2px dashed #dde5f5' }}>
                  <label style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 800, marginBottom: '18px', display: 'block', letterSpacing: '1px' }}>ENTER MISSION TARGET DETAILS</label>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-group" style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 700 }}>FULL NAME <span style={{ color: '#e74c3c' }}>*</span></label>
                      <input type="text" required placeholder="e.g. Michael Thorne" style={{ fontSize: '13px', padding: '11px 12px' }} value={newPatient.name} onChange={e => { setNewPatient({...newPatient, name: e.target.value}); setNewBooking({...newBooking, patientId: ''}); }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 700 }}>MOBILE <span style={{ color: '#e74c3c' }}>*</span></label>
                      <input 
                        type="tel" 
                        required 
                        placeholder="10-digit mobile..." 
                        style={{ 
                          fontSize: '13px', 
                          padding: '11px 12px',
                          borderColor: newPatient.mobile.length > 0 && !isMobileValid ? '#e74c3c' : '#dee2e6',
                          boxShadow: newPatient.mobile.length > 0 && !isMobileValid ? '0 0 0 1px #e74c3c' : 'none'
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
                          IDENTITY PROTOCOL: Exactly 10 digits required.
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group" style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '10px', fontWeight: 700 }}>AGE <span style={{ color: '#e74c3c' }}>*</span></label>
                        <input type="text" required placeholder="25" style={{ fontSize: '13px', padding: '11px 12px' }} value={newPatient.age} onChange={e => setNewPatient({...newPatient, age: e.target.value})} />
                      </div>
                      <div className="form-group" style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>GENDER</label>
                        <select style={{ fontSize: '13px', padding: '11px', height: '44px' }} value={newPatient.gender} onChange={e => setNewPatient({...newPatient, gender: e.target.value})}>
                          <option>Male</option><option>Female</option><option>Other</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 800, color: '#0f52ba', letterSpacing: '0.5px' }}>SOURCE OF INFORMATION</label>
                      <input 
                        type="text" 
                        placeholder="Discovery source..." 
                        style={{ fontSize: '13px', padding: '11px 12px', height: '44px', border: '1.5px solid #0f52ba20', background: '#f0f7ff' }} 
                        value={newPatient.sourceOfInfo} 
                        onChange={e => setNewPatient({...newPatient, sourceOfInfo: e.target.value})} 
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 700 }}>VILLAGE</label>
                      <input type="text" placeholder="Village" style={{ fontSize: '13px', padding: '11px 12px' }} value={newPatient.village} onChange={e => setNewPatient({...newPatient, village: e.target.value})} />
                    </div>
                    <div className="form-group" style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 700 }}>DISTRICT</label>
                      <input type="text" placeholder="District" style={{ fontSize: '13px', padding: '11px 12px' }} value={newPatient.district} onChange={e => setNewPatient({...newPatient, district: e.target.value})} />
                    </div>
                     <div className="form-group" style={{ marginBottom: '8px', gridColumn: 'span 2' }}>
                       <label style={{ fontSize: '10px', fontWeight: 700 }}>ADDRESS / RESIDENCE DATA</label>
                       <input type="text" placeholder="Street, Landmark..." style={{ fontSize: '13px', padding: '11px 12px' }} value={newPatient.address} onChange={e => setNewPatient({...newPatient, address: e.target.value})} />
                     </div>
                  </div>
                </div>

                {/* REFERRED BY SECTION (MOVED TO BOTTOM) */}
                <div className="form-group" style={{ marginTop: '10px', borderTop: '1px dashed #dde5f5', paddingTop: '16px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 800, color: '#0f52ba', letterSpacing: '0.5px', marginBottom: '8px', display: 'block' }}>MISSION SOURCE (REFERRED BY)</label>
                  
                  {!isAddingNewReferrer ? (
                    <>
                      <div style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <div className="search-input-group" style={{ flex: 1, margin: 0 }}>
                            <span className="search-icon">{'\u{1F50D}'}</span>
                            <input 
                              type="text" 
                              placeholder="Search saved referrers..." 
                              value={referrerSearchValue} 
                              onChange={(e) => {
                                setReferrerSearchValue(e.target.value);
                                setNewPatient(prev => ({ ...prev, referredBy: e.target.value }));
                              }} 
                              style={{ fontSize: '13px' }}
                            />
                          </div>
                          <button 
                            type="button"
                            onClick={() => setIsAddingNewReferrer(true)}
                            style={{ 
                              background: '#e8f0fe', color: '#0f52ba', border: '1px solid #c5d5f0', 
                              borderRadius: '10px', padding: '0 15px', fontSize: '11px', fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            + NEW
                          </button>
                        </div>
                        
                        {referrerSearchValue && !referrers.find(r => r.name === referrerSearchValue) && (
                          <div style={{ 
                            position: 'absolute', top: '100%', left: 0, right: 0, 
                            background: 'white', border: '1px solid #dee2e6', borderRadius: '10px',
                            marginTop: '4px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 10,
                            maxHeight: '150px', overflowY: 'auto'
                          }}>
                            {referrers.filter(r => r.name.toLowerCase().includes(referrerSearchValue.toLowerCase())).map(r => (
                              <div 
                                key={r.id}
                                onClick={() => {
                                  setNewPatient(prev => ({ ...prev, referredBy: r.name, referrerId: r.referrerId }));
                                  setReferrerSearchValue(r.name);
                                }}
                                style={{ padding: '10px 15px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f8f9fa' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                                onMouseLeave={e => e.currentTarget.style.background = 'white'}
                              >
                                <div style={{ fontWeight: 700 }}>{r.name}</div>
                                <div style={{ fontSize: '10px', color: '#888' }}>{r.contact} {r.address && '\u00B7'} {r.address}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* SELECTED REFERRER HUD DETAIL */}
                      {referrerSearchValue && referrers.find(r => r.name === referrerSearchValue) && (
                        <div style={{ 
                          marginTop: '12px', 
                          padding: '12px 16px', 
                          background: 'rgba(15, 82, 186, 0.05)', 
                          borderRadius: '12px',
                          border: '1px solid rgba(15, 82, 186, 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          animation: 'slideUp 0.3s ease'
                        }}>
                          <div style={{ 
                            width: '32px', height: '32px', borderRadius: '50%', background: '#0f52ba', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                            fontSize: '14px', fontWeight: 900
                          }}>
                            {referrerSearchValue.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px' }}>SELECTED SPECIALIST</div>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#1a1a2e', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{referrerSearchValue}</div>
                            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '8px' }}>
                              <span>{referrers.find(r => r.name === referrerSearchValue)?.contact || 'No Contact'}</span>
                              <span style={{ opacity: 0.3 }}>|</span>
                              <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{referrers.find(r => r.name === referrerSearchValue)?.address || 'No Address Data'}</span>
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={() => {
                              setReferrerSearchValue('');
                              setNewPatient(prev => ({ ...prev, referredBy: '', referrerId: null }));
                            }}
                            style={{ background: 'none', border: 'none', color: '#e74c3c', fontSize: '18px', cursor: 'pointer', padding: '0 5px', fontWeight: 800 }}
                          >
                            &times;
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '12px', border: '1.5px solid #0f52ba30' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba' }}>NEW REFERRER DATA</span>
                        <button type="button" onClick={() => setIsAddingNewReferrer(false)} style={{ border: 'none', background: 'none', color: '#e74c3c', fontSize: '10px', fontWeight: 800 }}>CANCEL</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                        <input type="text" placeholder="Name" style={{ fontSize: '12px', padding: '8px 10px', borderRadius: '8px' }} value={newReferrer.name} onChange={e => setNewReferrer(prev => ({ ...prev, name: e.target.value }))} />
                        <input type="text" placeholder="Contact" style={{ fontSize: '12px', padding: '8px 10px', borderRadius: '8px' }} value={newReferrer.contact} onChange={e => setNewReferrer(prev => ({ ...prev, contact: e.target.value }))} />
                      </div>
                      <input type="text" placeholder="Address" style={{ width: '100%', fontSize: '12px', padding: '8px 10px', borderRadius: '8px' }} value={newReferrer.address} onChange={e => setNewReferrer(prev => ({ ...prev, address: e.target.value }))} />
                      <button 
                        type="button" 
                        disabled={!newReferrer.name.trim() || !newReferrer.contact.trim()}
                        onClick={async () => { 
                          if(newReferrer.name.trim()){ 
                            try {
                              const res = await apiClient.post('/referrers', newReferrer);
                              fetchReferrers('');
                              setNewPatient({...newPatient, referredBy: newReferrer.name, referrerId: res.data.referrerId}); 
                              setReferrerSearchValue(newReferrer.name);
                              setIsAddingNewReferrer(false);
                              setNewReferrer({ name: '', contact: '', address: '' });
                            } catch (error) {
                              console.error('Failed to save referrer:', error);
                            }
                          } 
                        }} 
                        style={{ marginTop: '10px', width: '100%', background: '#0f52ba', color: 'white', border: 'none', padding: '8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}
                      >
                        SAVE & AUTO-SELECT REFERRER
                      </button>
                    </div>
                  )}
                </div>

                {newBooking.patientId && (
                  <div style={{
                    background: 'linear-gradient(90deg, #e8f0fe 0%, #fff 100%)',
                    padding: '14px 18px', borderRadius: '12px',
                    borderLeft: '4px solid #0f52ba',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginTop: '20px'
                  }}>
                    <div>
                      <div style={{ fontSize: '9px', color: '#0f52ba', fontWeight: 800, letterSpacing: '1px' }}>SELECTED PATIENT</div>
                      <div style={{ fontWeight: 800, color: '#0a1628', fontSize: '15px', marginTop: '2px' }}>{patients.find(p => p.id === newBooking.patientId)?.name}</div>
                    </div>
                    <span style={{ fontSize: '22px' }}>{'\u{1F3AF}'}</span>
                  </div>
                )}

                <div className="drawer-footer" style={{ borderTop: 'none', paddingTop: '20px' }}>
                  <button 
                    className="gamified-btn" 
                    style={{ 
                      width: '100%', padding: '16px', borderRadius: '12px', fontSize: '13px',
                      opacity: isNewPatientIncomplete ? 0.6 : 1,
                      cursor: isNewPatientIncomplete ? 'not-allowed' : 'pointer'
                    }} 
                    disabled={isNewPatientIncomplete} 
                    onClick={async () => {
                      if (!newBooking.patientId && newPatient.name && newPatient.mobile) {
                        try {
                          const response = await apiClient.post('/patients', {
                            fullName: newPatient.name,
                            mobile: newPatient.mobile,
                            age: newPatient.age || '0',
                            gender: newPatient.gender,
                            village: newPatient.village,
                            district: newPatient.district,
                            address: newPatient.address,
                            sourceOfInfo: newPatient.sourceOfInfo,
                            referrerId: newPatient.referrerId
                          });
                          const patientId = response.data.patientId;
                          if (!patientId) throw new Error("API returned invalid patient identity");
                          setNewBooking(prev => ({...prev, patientId}));
                          fetchPatients('');
                        } catch (error) {
                          console.error('Failed to auto-register patient:', error);
                          alert('Patient registration failed. Please try again.');
                          return; 
                        }
                      }
                      
                      // Final Safety Check before advancing
                      setTimeout(() => {
                        setBookingStep(2);
                      }, 100);
                    }}
                  >
                    PROCEED {'\u2192'} MISSION CONFIG
                  </button>
                </div>
              </div>
            )}

            {isStep2 && (
              <div className="quest-step-container">
                <div style={{ marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0a1628' }}>1. Select Study Modality</h3>
                </div>

                <div className="modality-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                  {MODALITIES.map(m => (
                    <div key={m} className={`modality-card ${newBooking.modality === m ? 'active' : ''}`} 
                      style={{ padding: '12px 8px', minHeight: 'auto' }}
                      onClick={() => setNewBooking({...newBooking, modality: m})}
                    >
                      <span className="modality-icon" style={{ fontSize: '18px', marginBottom: '4px' }}>{MODALITY_ICONS[m] || '\u{1F4CC}'}</span>
                      <span className="modality-name" style={{ fontSize: '9px' }}>{m}</span>
                    </div>
                  ))}
                </div>

                <div className="form-group" style={{ marginTop: '16px', position: 'relative' }}>
                  <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888' }}>2. SERVICE / PROCEDURE <span style={{ color: '#e74c3c' }}>*</span></label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Chest X-Ray with Lateral" 
                    value={newBooking.service} 
                    onChange={e => setNewBooking({...newBooking, service: e.target.value})} 
                    style={{ fontSize: '13px', padding: '10px' }} 
                  />

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
                      maxHeight: '200px', overflowY: 'auto', marginTop: '4px' 
                    }}>
                      <div style={{ padding: '8px 12px', background: '#f8f9fa', borderBottom: '1px solid #eee', fontSize: '9px', fontWeight: 900, color: '#0f52ba', letterSpacing: '1px' }}>
                        MATCHING SERVICES IN {newBooking.modality}
                      </div>
                      {serviceRegistry
                        .filter(s => s.modality === newBooking.modality && s.serviceName.toLowerCase().includes(newBooking.service.toLowerCase()))
                        .map(s => (
                          <div 
                            key={s.id}
                            onClick={() => setNewBooking({...newBooking, service: s.serviceName})}
                            style={{ padding: '12px 15px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', transition: 'background 0.2s' }}
                            onMouseOver={e => e.currentTarget.style.background = '#f0f4ff'}
                            onMouseOut={e => e.currentTarget.style.background = 'white'}
                          >
                             <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{s.serviceName}</div>
                             <div style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 950, marginTop: '2px' }}>₹{s.amount.toLocaleString()}</div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '16px', marginBottom: '8px' }}>
                  <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888', display: 'block', marginBottom: '10px' }}>3. ASSIGN LEAD SPECIALIST <span style={{ color: '#e74c3c' }}>*</span></label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                    {doctors.map(d => (
                      <div key={d} className={`modality-card ${newBooking.doctor === d ? 'active' : ''}`}
                        style={{ padding: '12px', position: 'relative', flexDirection: 'row', justifyContent: 'flex-start', gap: '10px', minHeight: 'auto' }}
                        onClick={() => setNewBooking({...newBooking, doctor: d})}
                      >
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '8px',
                          background: newBooking.doctor === d ? 'rgba(255,255,255,0.2)' : '#e8f0fe',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 900, fontSize: '11px', color: newBooking.doctor === d ? 'white' : '#0f52ba', flexShrink: 0,
                        }}>
                          {d.includes('.') ? d.split('. ')[1]?.charAt(0) || d.charAt(0) : d.charAt(0)}
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 800, fontSize: '11px', color: newBooking.doctor === d ? 'white' : '#1a1a2e' }}>{d}</div>
                        </div>
                        {newBooking.doctor === d && <span style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '10px' }}>{'\u2714'}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888' }}>4. NOTES (OPTIONAL)</label>
                  <textarea rows="2" placeholder="Clinical notes..." style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #dee2e6', fontSize: '12px', resize: 'vertical' }} value={newBooking.notes} onChange={e => setNewBooking({...newBooking, notes: e.target.value})} />
                </div>

                <div style={{
                  background: '#f0f4ff', padding: '14px', borderRadius: '12px',
                  border: '1px solid #dde5f5', marginTop: '12px',
                }}>
                  <div style={{ fontSize: '8px', fontWeight: 900, color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Final Mission Briefing Summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px' }}>
                    <div><span style={{ fontSize: '8px', color: '#888', fontWeight: 700 }}>PATIENT</span><div style={{ fontWeight: 800, fontSize: '11px', color: '#1a1a2e' }}>{patients.find(p => p.id === newBooking.patientId)?.name}</div></div>
                    <div><span style={{ fontSize: '8px', color: '#888', fontWeight: 700 }}>MODALITY</span><div style={{ fontWeight: 800, fontSize: '11px', color: '#1a1a2e' }}>{MODALITY_ICONS[newBooking.modality]} {newBooking.modality}</div></div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ fontSize: '8px', color: '#888', fontWeight: 700 }}>SERVICE & BILLING</span>
                      <div style={{ fontWeight: 800, fontSize: '11px', color: '#1a1a2e', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{newBooking.service || '\u2014'}</span>
                        {serviceRegistry.find(s => s.modality === newBooking.modality && s.serviceName.toLowerCase() === newBooking.service.toLowerCase()) && (
                          <span style={{ color: '#0f52ba' }}>₹{serviceRegistry.find(s => s.modality === newBooking.modality && s.serviceName.toLowerCase() === newBooking.service.toLowerCase()).amount.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div><span style={{ fontSize: '8px', color: '#888', fontWeight: 700 }}>SPECIALIST</span><div style={{ fontWeight: 800, fontSize: '11px', color: '#1a1a2e' }}>{newBooking.doctor || 'Unassigned'}</div></div>
                  </div>
                </div>

                <div className="drawer-footer" style={{ marginTop: '16px' }}>
                  <button className="btn-logout" style={{ padding: '12px 20px', borderRadius: '10px', fontWeight: 800, fontSize: '12px' }} onClick={() => setBookingStep(1)}>{'\u2190'} Back</button>
                  <button className="gamified-btn" style={{ flex: 1, padding: '12px', borderRadius: '10px', fontSize: '13px' }} disabled={!newBooking.patientId || !newBooking.service || !newBooking.doctor} onClick={handleBookAppointment}>
                    {'\u{1F680}'} DEPLOY MISSION
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );

    if (isAddPatientOpen) return (
      <div className="drawer-overlay" onClick={() => setIsAddPatientOpen(false)}>
        <div className="drawer-content" onClick={e => e.stopPropagation()}>
          <div className="drawer-header">
            <h2>Add New Patient</h2>
            <button className="btn-close" onClick={() => setIsAddPatientOpen(false)}>&times;</button>
          </div>
          <div className="drawer-body">
            <form onSubmit={handleAddPatient}>
              <div className="form-group"><label>Full Name</label><input type="text" required value={newPatient.name} onChange={e => setNewPatient({...newPatient, name: e.target.value})} /></div>
              <div className="form-group"><label>Mobile Number</label><input type="tel" required value={newPatient.mobile} onChange={e => setNewPatient({...newPatient, mobile: e.target.value})} /></div>
              {duplicatePatient && (
                <div className="duplicate-info">
                  <h4>{'\u26A0\uFE0F'} Duplicate Found!</h4>
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
  //  PRINT MODAL
  // ============================================================
  const renderTokenModal = () => {
    if (!tokenPrintData) return null;
    return (
      <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 3001 }}>
        <div style={{ width: '400px', background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
          <div style={{ padding: '20px', background: '#0a1628', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '1px' }}>THERMAL PREVIEW (80mm)</span>
            <button onClick={() => setTokenPrintData(null)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '18px', cursor: 'pointer' }}>{'\u2715'}</button>
          </div>
          
          <div style={{ padding: '30px', display: 'flex', justifyContent: 'center', background: '#f1f5f9' }}>
            <div id="thermal-token" style={{ 
              width: '80mm', minHeight: '120mm', background: 'white', padding: '12mm 5mm', 
              boxShadow: '0 5px 15px rgba(0,0,0,0.1)', color: 'black', 
              fontFamily: "'Courier New', Courier, monospace", textAlign: 'center',
              lineHeight: '1.2'
            }}>
              {/* 1. Hospital Name */}
              <div style={{ borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '12px' }}>
                <div style={{ fontSize: '18px', fontWeight: 900, textTransform: 'uppercase' }}>{activeCenter?.name || '1RAD HUB'}</div>
                <div style={{ fontSize: '9px', fontWeight: 700, marginTop: '2px' }}>DIAGNOSTIC COMMAND CENTER</div>
              </div>
              
              {/* 2. Token Number */}
              <div style={{ marginBottom: '15px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800 }}>TOKEN NO.</div>
                <div style={{ fontSize: '42px', fontWeight: 950, margin: '2px 0' }}>
                  {tokenPrintData.tokenNo || (tokenPrintData.id.includes('-') ? tokenPrintData.id.split('-')[1] : tokenPrintData.id)}
                </div>
              </div>

              <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '10px 0', margin: '10px 0', textAlign: 'left' }}>
                {/* 3. Patient ID */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700 }}>PATIENT ID:</span>
                  <span style={{ fontSize: '11px', fontWeight: 900 }}>{tokenPrintData.ptid || tokenPrintData.patientId}</span>
                </div>
                
                {/* 4. Patient Name */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700 }}>NAME:</span>
                  <span style={{ fontSize: '12px', fontWeight: 950 }}>{tokenPrintData.patientName.toUpperCase()}</span>
                </div>

                {/* 5. Date of Appointment */}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700 }}>DATE:</span>
                  <span style={{ fontSize: '11px', fontWeight: 900 }}>{new Date(tokenPrintData.dateTime).toLocaleDateString()}</span>
                </div>
              </div>

              {/* 6. Modality & Name */}
              <div style={{ marginTop: '12px', textAlign: 'left' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#333' }}>MODALITY: {tokenPrintData.modality}</div>
                <div style={{ fontSize: '14px', fontWeight: 950, marginTop: '2px', borderLeft: '3px solid black', paddingLeft: '8px' }}>
                  {tokenPrintData.service}
                </div>
              </div>
              
              <div style={{ marginTop: '25px', fontSize: '9px', fontWeight: 700 }}>
                PRINTED: {new Date().toLocaleTimeString()}
              </div>
              
              <div style={{ marginTop: '15px', borderTop: '2px dashed #000', paddingTop: '10px', fontSize: '10px', fontWeight: 950 }}>
                PLEASE WAIT FOR YOUR TURN
              </div>
            </div>
          </div>

          <div style={{ padding: '20px', display: 'flex', gap: '10px' }}>
            <button 
              className="gamified-btn" 
              style={{ flex: 1, padding: '14px' }}
              onClick={() => window.print()}
            >
              CONFIRM PRINT
            </button>
            <button 
              style={{ flex: 1, background: '#f1f5f9', border: '1px solid #dee2e6', borderRadius: '12px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
              onClick={() => setTokenPrintData(null)}
            >
              DISCARD
            </button>
          </div>
        </div>
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #thermal-token, #thermal-token * { visibility: visible; }
            #thermal-token { 
              position: absolute; left: 0; top: 0; width: 80mm; 
              box-shadow: none !important; margin: 0; padding: 5mm;
            }
          }
        `}</style>
      </div>
    );
  };

  // ============================================================
  //  MAIN RENDER
  // ============================================================
  return (
    <div className="page-wrapper board-padding" style={{ paddingTop: '40px' }}>
      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <span style={{ fontSize: '24px' }}>{'\u{1F4E1}'}</span>
            <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0a1628', letterSpacing: '-0.5px', margin: 0 }}>MISSION SCHEDULER</h1>
          </div>
          <p style={{ fontSize: '12px', color: '#888', fontWeight: 600, marginLeft: '36px' }}>
            Patient Intake & Appointment Command
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              marginLeft: '12px', padding: '2px 10px', borderRadius: '10px',
              background: '#e9f7ef', fontSize: '10px', fontWeight: 800, color: '#2ecc71',
            }}>
              {'\u25CF'} LIVE
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <button
            className="gamified-btn"
            style={{ 
              padding: '16px 40px', 
              fontSize: '14px', 
              fontWeight: 950, 
              borderRadius: '16px', 
              letterSpacing: '1px',
              boxShadow: '0 8px 25px rgba(15, 82, 186, 0.3)',
              transform: 'scale(1.05)',
              transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = '0 12px 30px rgba(15, 82, 186, 0.5)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(15, 82, 186, 0.3)';
            }}
            onClick={() => { resetBooking(); setIsBookingOpen(true); }}
          >
            + NEW MISSION
          </button>
          
        </div>
      </div>

      <div style={{ display: 'flex', background: 'white', padding: '5px', borderRadius: '12px', border: '1px solid #eee', width: 'fit-content', marginBottom: '25px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
        <button 
          onClick={() => setActiveTab('TODAY')}
          style={{ padding: '8px 25px', borderRadius: '8px', border: 'none', fontSize: '11px', fontWeight: 900, background: activeTab === 'TODAY' ? '#0f52ba' : 'transparent', color: activeTab === 'TODAY' ? 'white' : '#888', cursor: 'pointer', transition: 'all 0.3s', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span style={{ fontSize: '14px' }}>📅</span> TODAY'S MISSIONS
        </button>
        <button 
          onClick={() => setActiveTab('PAST')}
          style={{ padding: '8px 25px', borderRadius: '8px', border: 'none', fontSize: '11px', fontWeight: 900, background: activeTab === 'PAST' ? '#0f52ba' : 'transparent', color: activeTab === 'PAST' ? 'white' : '#888', cursor: 'pointer', transition: 'all 0.3s', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span style={{ fontSize: '14px' }}>📜</span> MISSION ARCHIVE
        </button>
      </div>

      {renderIntelCards()}
      {renderFilterBar()}

      <div style={{ marginBottom: '20px' }}>
        <div ref={listTopRef} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {filteredAppointments.length} Mission{filteredAppointments.length !== 1 ? 's' : ''} Found
            {totalPages > 1 && <span style={{ marginLeft: '10px', color: '#0f52ba' }}>— Page {currentPage} of {totalPages}</span>}
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '0.6fr 0.6fr 1.8fr 1.8fr 0.8fr 1fr 1.6fr',
          padding: '0 22px 10px',
          fontSize: '9px', fontWeight: 800, color: '#aaa',
          textTransform: 'uppercase', letterSpacing: '1px',
        }}>
          <span>ID</span>
          <span>Token</span>
          <span>Patient Details</span>
          <span>Referred By</span>
          <span>Status</span>
          <span>Specialist</span>
          <span style={{ textAlign: 'right', paddingRight: '20px' }}>Tactical Actions</span>
        </div>

        {filteredAppointments.length === 0 ? (
          <div style={{
            padding: '60px 20px', textAlign: 'center', color: '#bbb',
            background: 'white', borderRadius: '16px', border: '1px dashed #dee2e6',
          }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>{'\u{1F50D}'}</div>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>No missions match your filters</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>Try adjusting your search or pipeline filters</div>
          </div>
        ) : (
          paginatedAppointments.map(app => renderAppointmentRow(app))
        )}

        {/* Tactical Pagination HUD */}
        {totalPages > 1 && (
          <div style={{ 
            marginTop: '30px', 
            padding: '16px', 
            background: 'white', 
            borderRadius: '16px', 
            border: '1px solid #eee',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '20px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.02)'
          }}>
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              style={{
                width: '40px', height: '40px', borderRadius: '10px',
                border: '1px solid #dee2e6', background: currentPage === 1 ? '#f8f9fa' : 'white',
                color: currentPage === 1 ? '#ccc' : '#0f52ba', cursor: currentPage === 1 ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                transition: 'all 0.2s'
              }}
            >
              {'\u2190'}
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              {[...Array(totalPages)].map((_, i) => {
                const pageNum = i + 1;
                // Show max 5 pages or current page neighborhood
                if (totalPages > 7 && Math.abs(pageNum - currentPage) > 2 && pageNum !== 1 && pageNum !== totalPages) {
                  if (pageNum === 2 || pageNum === totalPages - 1) return <span key={pageNum} style={{ color: '#ccc' }}>...</span>;
                  return null;
                }
                return (
                  <button 
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    style={{
                      width: '32px', height: '32px', borderRadius: '8px',
                      border: 'none', background: currentPage === pageNum ? '#0f52ba' : 'transparent',
                      color: currentPage === pageNum ? 'white' : '#64748b',
                      fontSize: '12px', fontWeight: 900, cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              style={{
                width: '40px', height: '40px', borderRadius: '10px',
                border: '1px solid #dee2e6', background: currentPage === totalPages ? '#f8f9fa' : 'white',
                color: currentPage === totalPages ? '#ccc' : '#0f52ba', cursor: currentPage === totalPages ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                transition: 'all 0.2s'
              }}
            >
              {'\u2192'}
            </button>
          </div>
        )}
      </div>

      {renderDrawer()}
      {renderTokenModal()}
    </div>
  );
}