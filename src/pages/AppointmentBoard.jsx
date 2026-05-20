import { useState, useMemo, useEffect, useCallback, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { AuthContext } from '../auth/AuthContext';
import useOffline from '../hooks/useOffline';
import { nativeStorage } from '../hooks/useElectron';
import AppointmentCard from '../components/AppointmentCard';
import '../styles/global.css';
import '../styles/AppointmentBoard.css';
import ReportPreviewModal from '../components/ReportPreviewModal';

// --- CONSTANTS ---

const MODALITIES = ['X-RAY', 'MRI', 'CT', 'ULTRASOUND', 'DEXA', 'ANGIOGRAPHY', 'MAMMOGRAPHY', 'PET-CT', 'NUCLEAR MEDICINE', 'FLUOROSCOPY'];
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
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
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
  const [filters, setFilters] = useState({ date: TODAY, status: 'ALL', modality: 'ALL', doctor: 'ALL' });
  const [expandedRow, setExpandedRow] = useState(null);


  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [isEditingOpen, setIsEditingOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewAppointment, setPreviewAppointment] = useState(null);
  const [previewReport, setPreviewReport] = useState({ mode: 'Narrative Editor', text: '', impression: '', isFinalized: false });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const [cancelConfirmModal, setCancelConfirmModal] = useState({ isOpen: false, appointmentId: null, patientName: '' });
  const [notifModal, setNotifModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const showNotif = (type, title, message) => setNotifModal({ isOpen: true, type, title, message });
  const [tokenPrintData, setTokenPrintData] = useState(null);
  const [printDropdownId, setPrintDropdownId] = useState(null);

  const [bookingStep, setBookingStep] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const listTopRef = useRef(null);
  const [newBooking, setNewBooking] = useState({ 
    patientId: '', 
    service: '', 
    modality: 'X-RAY', 
    date: getTodayString(), 
    doctor: '', 
    notes: '',
    amount: '',
    referralCutValue: 0
  });

  const [newPatient, setNewPatient] = useState({ 
    name: '', mobile: '', age: '', gender: 'Male', 
    village: '', district: '', address: '', sourceOfInfo: '', referrerId: null
  });
  const [duplicatePatient, setDuplicatePatient] = useState(null);

  const [referrers, setReferrers] = useState([]);
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
      
      const dailyCounters = {};
      const itemsWithTokens = chronologicalData.map(item => {
        const dateKey = item.dateTime ? item.dateTime.split('T')[0] : (item.date || TODAY);
        dailyCounters[dateKey] = (dailyCounters[dateKey] || 0) + 1;
        
        return {
          ...item,
          // Prefer persisted server-side token; fall back to calculated for legacy records
          tokenNo: item.dailyTokenNumber ?? dailyCounters[dateKey]
        };
      });
      
      // Sort DESCENDING by Token Number as requested
      const finalSortedData = itemsWithTokens.sort((a, b) => {
        const tokenA = a.tokenNo || 0;
        const tokenB = b.tokenNo || 0;
        if (tokenA !== tokenB) {
          return tokenB - tokenA;
        }
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
      
      let owner = allPersonnel.find(u => {
        const roles = (u.roles || u.Roles || []).map(r => r.toLowerCase());
        return roles.includes('admindoctor');
      });
      if (!owner) {
        owner = allPersonnel.find(u => {
          const roles = (u.roles || u.Roles || []).map(r => r.toLowerCase());
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

  const fetchServiceRegistry = useCallback(async () => {
    try {
      const response = await apiClient.get('/finance/registry');
      setServiceRegistry(response.data);
    } catch (error) {
      console.error('Failed to fetch service registry:', error);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
    fetchServiceRegistry();
    const interval = setInterval(fetchAppointments, 30000); // 30s Real-time Heartbeat
    return () => clearInterval(interval);
  }, [fetchAppointments, fetchServiceRegistry, activeCenterId, activeTab]);

  useEffect(() => {
    if (drawerSearchQuery.length > 2) {
      fetchPatients(drawerSearchQuery);
    }
  }, [drawerSearchQuery, fetchPatients]);

  const fetchRegistry = useCallback(async () => {
    try {
      const res = await apiClient.get('/finance/registry');
      setServiceRegistry(res.data);
      await nativeStorage.set('1rad_cache_service_registry', res.data);
    } catch (err) {
      console.error('[FINANCE] Registry fetch failed', err);
      const cached = await nativeStorage.get('1rad_cache_service_registry');
      if (cached) setServiceRegistry(cached);
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
      const matchesSearch = (app.patientName?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || 
                            (app.mobile || '').includes(searchQuery) || 
                            (app.id || '').includes(searchQuery);
      const matchesStatus = filters.status === 'ALL' || app.status === filters.status;
      const matchesModality = filters.modality === 'ALL' || app.modality === filters.modality;
      const matchesDoctor = filters.doctor === 'ALL' || app.doctor === filters.doctor;
      return matchesSearch && matchesStatus && matchesModality && matchesDoctor;
    });
  }, [appointmentsForTab, searchQuery, filters]);

  // Derived validation
  const isMobileValid = /^\d{10}$/.test(newPatient.mobile);
  const isNewPatientIncomplete = !newBooking.patientId && 
    (!newPatient.name.trim() || !isMobileValid || !newPatient.age.trim());

  // Referrer contact validation derived state
  const cleanReferrerContactDigits = (newReferrer.contact || '').trim().replace(/\D/g, '');
  let sanitizedReferrerContact = cleanReferrerContactDigits;
  if (sanitizedReferrerContact.startsWith('91') && sanitizedReferrerContact.length === 12) {
    sanitizedReferrerContact = sanitizedReferrerContact.substring(2);
  } else if (sanitizedReferrerContact.startsWith('0') && sanitizedReferrerContact.length === 11) {
    sanitizedReferrerContact = sanitizedReferrerContact.substring(1);
  }
  const isReferrerContactValid = sanitizedReferrerContact.length === 10 && /^[6-9]\d{9}$/.test(sanitizedReferrerContact);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filters, activeTab, archiveFilterMode, pastDateRange]);

  const isInitialMount = useRef(true);
  // Auto-scroll on page change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (listTopRef.current) {
      listTopRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentPage]);

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
        
        setErrorModal({
          isOpen: true,
          title: "🔒 Cancellation Locked",
          message: result.message || "Cannot cancel appointment at this time."
        });
      } else {
        fetchAppointments();
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
      age: newPatient.age,
      gender: newPatient.gender,
      village: newPatient.village,
      district: newPatient.district,
      address: newPatient.address,
      sourceOfInfo: newPatient.sourceOfInfo
    };

    if (!isOnline) {
      const tempId = `temp-${Date.now()}`;
      await addToOutbox('PATIENT_CREATE', { ...payload, tempId });
      showNotif('info', 'QUEUED FOR SYNC', 'Patient profile has been saved and will synchronize automatically when connection is restored.');
      setNewBooking(prev => ({ ...prev, patientId: tempId }));
      setIsAddPatientOpen(false);
      return;
    }

    try {
      const response = await apiClient.post('/patients', payload);
      const patientId = response.data.patientId;
      setIsAddPatientOpen(false);
      setNewPatient({ name: '', mobile: '', age: '', gender: 'Male', village: '', district: '', address: '', referredBy: '', sourceOfInfo: '' });
      setNewBooking(prev => ({ ...prev, patientId }));
      fetchPatients('');
    } catch (error) {
      console.error('Failed to add patient:', error);
      if (!error.response) {
         const tempId = `temp-${Date.now()}`;
         await addToOutbox('PATIENT_CREATE', { ...payload, tempId });
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

    // 2. Validate Service/Procedure
    if (!newBooking.service || newBooking.service.trim() === '') {
      showNotif('error', 'SERVICE REQUIRED', 'Clinical Service / Procedure is missing. This field is mandatory for billing and reporting.');
      return;
    }

    // 3. Validate Specialist
    if (!newBooking.doctor) {
      showNotif('error', 'SPECIALIST REQUIRED', 'No Lead Specialist assigned. Every appointment requires a supervising physician.');
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

    const payload = {
      patientId: newBooking.patientId,
      service: newBooking.service,
      modality: newBooking.modality,
      dateTime: localDateTimeStr,
      type: 'scheduled',
      doctor: newBooking.doctor,
      referredBy: newPatient.referredBy || '',
      referredContact: referrers.find(r => r.name === newPatient.referredBy)?.contact || '',
      referredAddress: referrers.find(r => r.name === newPatient.referredBy)?.address || '',
      notes: newBooking.notes,
      amount: newBooking.amount,
      referralCutValue: newBooking.referralCutValue
    };


    if (!isOnline) {
      await addToOutbox('APPOINTMENT_CREATE', payload);
      showNotif('info', 'QUEUED FOR SYNC', 'Appointment has been saved and will sync automatically when your connection is restored.');
      setIsBookingOpen(false);
      resetBooking();
      return;
    }

    try {
      await apiClient.post('/appointments', payload);
      
      setIsBookingOpen(false);
      resetBooking();
      fetchAppointments();
    } catch (error) {

      console.error('Failed to book appointment:', error);
      if (!error.response) {
        await addToOutbox('APPOINTMENT_CREATE', payload);
        setIsBookingOpen(false);
        resetBooking();
      } else {
        showNotif('error', 'BOOKING FAILED', 'Appointment could not be created. Please check your connection and try again.');
      }
    }
  };

  const resetBooking = () => {
    setBookingStep(1);
    setNewBooking({ 
      patientId: '', 
      service: '', 
      modality: 'X-RAY', 
      date: getTodayString(), 
      doctor: doctors && doctors.length > 0 ? doctors[0] : '', 
      notes: '',
      amount: '',
      referralCutValue: 0
    });

    setNewPatient({ name: '', mobile: '', age: '', gender: 'Male', village: '', district: '', address: '', referredBy: '', sourceOfInfo: '' });
    setReferrerSearchValue('');
    setDrawerSearchQuery('');
    setShowBookingValidation(false);
  };

  const handlePreviewPrint = async (c) => {
    try {
      setLoading(true);
      setPreviewAppointment(c);
      
      const reportRes = await apiClient.get(`/Reporting/report/${c.id || c.appointmentId}`).catch(() => null);
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
    
    if (!editingAppointment.service) {
      showNotif('warning', 'SERVICE REQUIRED', 'Service / Procedure details are missing. This field is mandatory before saving.');
      return;
    }
    if (!editingAppointment.doctor) {
      showNotif('warning', 'SPECIALIST REQUIRED', 'No Lead Specialist assigned. Cannot save without a supervising physician.');
      return;
    }

    try {
      await apiClient.put(`/appointments/${editingAppointment.appointmentId}`, {
        appointmentId: editingAppointment.appointmentId,
        patientId: editingAppointment.patientId,
        service: editingAppointment.service,
        modality: editingAppointment.modality,
        dateTime: editingAppointment.dateTime,
        doctor: editingAppointment.doctor,
        notes: editingAppointment.notes,
        referredBy: editingAppointment.referredBy || '',
        referralCutValue: editingAppointment.referralCutValue || 0,
        patientName: editingAppointment.patientName,
        mobile: editingAppointment.mobile,
        patientAge: editingAppointment.patientAge,
        amount: editingAppointment.amount || 0
      });



      setIsEditingOpen(false);
      setEditingAppointment(null);
      fetchAppointments();
    } catch (error) {
      console.error('Failed to update appointment:', error);
      showNotif('error', 'UPDATE FAILED', 'Could not update the appointment. Please check your connection and try again.');
    }
  };

  const handleAddReferrer = async (e) => {
    e.preventDefault();
    
    // Validation & Sanitization Logic (Indian Mobile number - 10 digits starting with 6-9)
    let rawContact = (newReferrer.contact || '').trim();
    let digits = rawContact.replace(/\D/g, '');
    if (digits.startsWith('91') && digits.length === 12) {
      digits = digits.substring(2);
    } else if (digits.startsWith('0') && digits.length === 11) {
      digits = digits.substring(1);
    }

    if (!newReferrer.name || newReferrer.name.trim().length < 3) {
      showNotif('error', 'INVALID NAME', 'Referrer name must be at least 3 characters long.');
      return;
    }
    
    if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
      showNotif('error', 'INVALID MOBILE', 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 (e.g., 9876543210).');
      return;
    }

    try {
      const response = await apiClient.post('/referrers', {
        name: newReferrer.name,
        contact: digits,
        address: newReferrer.address
      });
      
      const referrerId = response.data.referrerId || response.data.id;
      const savedReferrer = {
        referrerId: referrerId,
        id: referrerId,
        name: newReferrer.name,
        contact: digits,
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
          placeholder="Search patient, mobile, or ID..."
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
          value={filters.doctor}
          onChange={e => setFilters({...filters, doctor: e.target.value})}
        >
          <option value="ALL">All Specialists</option>
          {doctors.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <select
          className="filter-select"
          value={filters.status}
          onChange={e => setFilters({...filters, status: e.target.value})}
        >
          <option value="ALL">All Statuses</option>
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </select>
      </div>

      {(filters.status !== 'ALL' || filters.doctor !== 'ALL' || searchQuery) && (
        <button className="filter-reset-btn" onClick={() => {
          setSearchQuery('');
          setFilters({ ...filters, status: 'ALL', doctor: 'ALL' });
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
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            title="First page"
          >«</button>

          <button
            className="pagination-btn pagination-nav"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          ><span className="nav-label">Prev</span></button>

          {getPageNumbers().map((page, i) =>
            page === '...'
              ? <span key={`el-${i}`} className="pagination-ellipsis">…</span>
              : <button
                  key={page}
                  className={`pagination-btn${currentPage === page ? ' active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                >{page}</button>
          )}

          <button
            className="pagination-btn pagination-nav"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          ><span className="nav-label">Next</span></button>

          <button
            className="pagination-btn pagination-nav"
            onClick={() => setCurrentPage(totalPages)}
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

    return (
      <div key={app.appointmentId} className="appointments-table-wrapper" style={{ 
        marginBottom: '10px', 
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        overflow: 'hidden',
        background: 'white',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        minWidth: '950px' // Ensure columns don't collapse too much
      }}>
        <div 
          style={{ 
            display: 'grid',
            gridTemplateColumns: '75px 50px 2.4fr 0.9fr 95px 110px 1.3fr 215px',
            gap: '12px',
            padding: '12px 16px',
            alignItems: 'center',
            background: 'transparent'
          }}
        >
          {/* Column 1: ID */}
          <div>
            <span style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 800, color: '#64748b', background: '#f1f5f9', padding: '3px 6px', borderRadius: '6px' }}>
              #{app.ptid || app.patientIdentifier || app.id?.substring(0,8) || '—'}
            </span>
          </div>

          {/* Column 2: Token */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ 
              width: '28px', height: '28px', borderRadius: '6px', 
              background: 'rgba(15, 82, 186, 0.08)', color: '#0f52ba', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              fontWeight: 950, fontSize: '12px', border: '1.5px solid rgba(15, 82, 186, 0.2)'
            }}>
              {app.tokenNo || '—'}
            </div>
          </div>

          {/* Column 3: Patient & Service */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '12px', letterSpacing: '-0.2px' }}>
                {app.patientName.toUpperCase()}
              </span>
              <span style={{ fontSize: '9px', fontWeight: 900, color: '#475569', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', textTransform: 'uppercase' }}>
                {app.patientGender || 'U'} • {app.patientAge ? `${app.patientAge}Y` : '—'}
              </span>
            </div>
            <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 700, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: '#0f52ba', background: '#eff6ff', padding: '1.5px 5px', borderRadius: '4px', fontSize: '8.5px', fontWeight: 900 }}>
                {app.modality}
              </span>
              <span>•</span>
              <span style={{ textTransform: 'uppercase' }}>{app.service}</span>
            </div>
          </div>

          {/* Column 4: Referred By */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={app.referredBy || 'DIRECT/SELF'}>
              {app.referredBy || 'DIRECT/SELF'}
            </div>
            <div style={{ fontSize: '8.5px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginTop: '1px' }}>
              REFERRING DR.
            </div>
          </div>

          {/* Column 5: Date */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>{appDate}</div>
            <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 700, marginTop: '2px' }}>{appTime}</div>
          </div>

          {/* Column 6: Status */}
          <div className="status-badge" style={{ 
            backgroundColor: meta.bg, 
            color: meta.color, 
            padding: '4px 8px', 
            width: 'fit-content',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            border: `1px solid ${meta.color}20`,
            borderRadius: '6px'
          }}>
            <span style={{ fontSize: '11px', lineHeight: '1', display: 'flex', alignItems: 'center' }}>{meta.icon}</span>
            <span style={{ lineHeight: '1', display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: '8.5px' }}>{meta.label}</span>
          </div>

          {/* Column 7: Specialist */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={app.doctor || 'UNASSIGNED'}>
              {app.doctor || 'UNASSIGNED'}
            </div>
            <div style={{ fontSize: '8.5px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginTop: '1px' }}>
              SPECIALIST
            </div>
          </div>

          {/* Column 8: Actions */}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
            {next && (
              <button
                onClick={() => handleAction(app.appointmentId || app.id, next.action)}
                style={{ 
                  padding: '6px 14px', borderRadius: '6px', 
                  background: next.color, color: 'white', 
                  border: 'none', cursor: 'pointer', 
                  fontSize: '9px', fontWeight: 950, 
                  boxShadow: `0 4px 10px ${next.color}33`,
                  whiteSpace: 'nowrap',
                  minWidth: '85px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
              >
                <span>{next.icon}</span> <span>{next.label}</span>
              </button>
            )}
            <button
              onClick={() => setTokenPrintData(app)}
              style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'white', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '12px' }}
              title="Print Token"
            >
              🖨️
            </button>
            <button
              onClick={() => handlePreviewPrint(app)}
              style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'white', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '12px' }}
              title="Report"
            >
              📄
            </button>
            <button
              onClick={() => { setEditingAppointment(app); setIsEditingOpen(true); }}
              style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'white', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '12px' }}
              title="Edit"
            >
              ✏️
            </button>
            <button
              onClick={() => setCancelConfirmModal({ isOpen: true, appointmentId: app.appointmentId || app.id, patientName: app.patientName })}
              style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: '#fff1f2', border: '1px solid #fecdd3', cursor: 'pointer', color: '#e11d48', fontSize: '12px' }}
              title="Cancel"
            >
              ✕
            </button>
          </div>
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
          <div className="drawer-header" style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0f52ba 100%)', color: 'white', padding: '16px 30px', border: 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0 }}>NEW APPOINTMENT</h2>
              </div>
              <p style={{ fontSize: '11px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px' }}>Phase {bookingStep}: {isStep1 ? 'Patient Identity' : 'Clinical Configuration'}</p>
            </div>
            <button className="btn-close" style={{ color: 'white', fontSize: '28px' }} onClick={() => setIsBookingOpen(false)}>✕</button>
          </div>

          <div style={{ padding: '0 30px', marginTop: '12px' }}>
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
                
                {/* Search Patient Database at Top */}
                <div style={{ background: '#f8f9fa', padding: '16px 20px', borderRadius: '14px', border: '1px solid #eef2f6' }}>
                  <label style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 800, marginBottom: '8px', display: 'block', letterSpacing: '1px' }}>SEARCH PATIENT DATABASE</label>
                  <div className="search-input-group" style={{ width: '100%', marginBottom: '8px' }}>
                    <input 
                      type="text" 
                      placeholder="Search patient database by name, mobile, or ID..." 
                      value={drawerSearchQuery} 
                      onChange={(e) => setDrawerSearchQuery(e.target.value)} 
                      autoFocus 
                      style={{ paddingLeft: '15px', height: '40px', fontSize: '13px', width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1' }} 
                    />
                  </div>

                  {drawerSearchQuery && (
                    <div style={{ 
                      maxHeight: '150px', 
                      overflowY: 'auto', 
                      marginTop: '8px', 
                      background: 'white', 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '10px', 
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)' 
                    }}>
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
                          style={{ padding: '10px 15px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                          onMouseOver={e => e.currentTarget.style.background = '#f8fafd'}
                          onMouseOut={e => e.currentTarget.style.background = 'white'}
                        >
                          <div style={{
                            width: '28px', height: '28px', borderRadius: '8px',
                            background: newBooking.patientId === p.id ? '#0f52ba' : '#e8f0fe',
                            color: newBooking.patientId === p.id ? 'white' : '#0f52ba',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 900, fontSize: '11px', flexShrink: 0,
                          }}>{p.name.charAt(0)}</div>
                          <div style={{ flex: 1 }}>
                             <div style={{ fontWeight: 700, fontSize: '12px', color: '#1a1a2e' }}>{p.name}</div>
                             <div style={{ fontSize: '9px', color: '#888' }}>
                               <span style={{ color: '#0f52ba', fontWeight: 800 }}>{p.patientIdentifier || p.id}</span> {'\u00b7'} {p.mobile} {'\u00b7'} {p.age}y {p.gender}
                             </div>
                          </div>
                          {newBooking.patientId === p.id && <span style={{ color: '#0f52ba', fontWeight: 900, fontSize: '9px' }}>SELECTED</span>}
                        </div>
                      ))}
                      {!patients.some(p => 
                        p.name.toLowerCase().includes(drawerSearchQuery.toLowerCase()) || 
                        p.mobile.includes(drawerSearchQuery) ||
                        p.id.toLowerCase().includes(drawerSearchQuery.toLowerCase()) ||
                        (p.patientIdentifier && p.patientIdentifier.toLowerCase().includes(drawerSearchQuery.toLowerCase()))
                      ) && (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: '11px' }}>No match found - fill details below</div>
                      )}
                    </div>
                  )}
                </div>

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
                        <div className="form-group" style={{ marginBottom: '4px' }}>
                          <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>MOBILE <span style={{ color: '#e74c3c' }}>*</span></label>
                          <input 
                            type="tel" 
                            required 
                            placeholder="10-digit mobile..." 
                            style={{ 
                              width: '100%',
                              fontSize: '13px', 
                              padding: '8px 12px',
                              borderRadius: '10px',
                              borderColor: (newPatient.mobile.length > 0 && !isMobileValid) || (showBookingValidation && !isMobileValid) ? '#e74c3c' : '#dee2e6',
                              background: (showBookingValidation && !isMobileValid) ? '#fff5f5' : 'white',
                              boxShadow: (newPatient.mobile.length > 0 && !isMobileValid) || (showBookingValidation && !isMobileValid) ? '0 0 0 1px #e74c3c' : 'none',
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
                              IDENTITY PROTOCOL: Exactly 10 digits required.
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div className="form-group" style={{ marginBottom: '4px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>AGE <span style={{ color: '#e74c3c' }}>*</span></label>
                            <input 
                              type="text" 
                              required 
                              placeholder="25" 
                              style={{ 
                                fontSize: '13px', 
                                padding: '8px 10px',
                                borderRadius: '10px',
                                border: showBookingValidation && !newPatient.age.trim() ? '1.5px solid #e74c3c' : '1.5px solid #dee2e6',
                                background: showBookingValidation && !newPatient.age.trim() ? '#fff5f5' : 'white'
                              }} 
                              value={newPatient.age} 
                              onChange={e => setNewPatient({...newPatient, age: e.target.value})} 
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: '4px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', marginBottom: '4px', display: 'block' }}>GENDER</label>
                            <select style={{ fontSize: '13px', padding: '6px', height: '38px', borderRadius: '10px' }} value={newPatient.gender} onChange={e => setNewPatient({...newPatient, gender: e.target.value})}>
                              <option>Male</option><option>Female</option><option>Other</option>
                            </select>
                          </div>
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
                        <div style={{ 
                          display: 'flex', 
                          flexDirection: isMobile ? 'column' : 'row',
                          gap: '8px' 
                        }}>
                          <div style={{ flex: 1, position: 'relative' }}>
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
                          <button 
                            type="button" 
                            onClick={() => setIsAddingReferrer(true)}
                            style={{ 
                              width: isMobile ? '100%' : '36px', 
                              height: '36px', 
                              borderRadius: '10px', 
                              border: '1px dashed #cbd5e1', 
                              background: '#f8fafc', 
                              color: '#0f52ba', 
                              fontSize: isMobile ? '11px' : '18px', 
                              fontWeight: 700, 
                              cursor: 'pointer', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              gap: '8px'
                            }}
                          >
                            {isMobile ? '+ ADD NEW SPECIALIST' : '+'}
                          </button>
                        </div>
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
                          style={{ 
                            width: '100%', padding: '12px', borderRadius: '10px', fontSize: '13px',
                            background: isNewPatientIncomplete && showBookingValidation ? '#94a3b8' : 'linear-gradient(90deg, #0f52ba, #00f2fe)',
                            boxShadow: isNewPatientIncomplete && showBookingValidation ? 'none' : '0 10px 20px rgba(15, 82, 186, 0.2)',
                          }} 
                          onClick={async () => {
                            if (isNewPatientIncomplete) {
                              setShowBookingValidation(true);
                              return;
                            }

                            // Case A: NEW PATIENT (Registration)
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
                                showNotif('error', 'REGISTRATION FAILED', 'Patient registration could not be completed. Please try again.');
                                return; 
                              }
                            } 
                            // Case B: EXISTING PATIENT (Demographic Sync)
                            else if (newBooking.patientId) {
                              try {
                                await apiClient.put(`/patients/${newBooking.patientId}`, {
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
                              } catch (error) {
                                console.error('Failed to sync existing patient demographics:', error);
                              }
                            }
                            
                            // Advance to Clinical Configuration
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
                  {/* Left Column: Clinical Setup */}
                  <div style={{ flex: 1.1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
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

                      <div className="form-group" style={{ marginTop: '6px', position: 'relative' }}>
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

                      <div className="form-group" style={{ marginTop: '8px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888', marginBottom: '4px', display: 'block' }}>3. SERVICE AMOUNT (₹)</label>
                        <input 
                          type="number" 
                          placeholder="e.g. 500" 
                          value={newBooking.amount} 
                          onChange={e => setNewBooking({...newBooking, amount: e.target.value === '' ? '' : parseFloat(e.target.value)})} 
                          style={{ fontSize: '13px', padding: '8px 10px', height: '36px', borderRadius: '10px' }} 
                        />
                        {newBooking.referralCutValue > 0 && (
                          <div style={{ fontSize: '9px', fontWeight: 800, color: '#0f52ba', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ opacity: 0.6 }}>SYSTEM REFERRAL CUT:</span>
                            <span>₹{newBooking.referralCutValue}</span>
                          </div>
                        )}
                      </div>

                      <div className="form-group" style={{ marginTop: '8px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888', marginBottom: '4px', display: 'block' }}>4. NOTES (OPTIONAL)</label>
                        <textarea rows="1" placeholder="Clinical notes..." style={{ width: '100%', padding: '8px 10px', borderRadius: '10px', border: '1px solid #dee2e6', fontSize: '12px', resize: 'vertical' }} value={newBooking.notes} onChange={e => setNewBooking({...newBooking, notes: e.target.value})} />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Execution Schedule & Specialist */}
                  <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                    </div>

                    <div style={{
                      background: '#f0f4ff', padding: '10px 12px', borderRadius: '12px',
                      border: '1px solid #dde5f5', marginTop: '0px',
                    }}>
                      <div style={{ fontSize: '8px', fontWeight: 900, color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Final Mission Briefing Summary</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '4px' }}>
                        <div><span style={{ fontSize: '8px', color: '#888', fontWeight: 700 }}>PATIENT</span><div style={{ fontWeight: 800, fontSize: '10px', color: '#1a1a2e' }}>{patients.find(p => p.id === newBooking.patientId)?.name}</div></div>
                        <div><span style={{ fontSize: '8px', color: '#888', fontWeight: 700 }}>MODALITY</span><div style={{ fontWeight: 800, fontSize: '10px', color: '#1a1a2e' }}>{newBooking.modality}</div></div>
                        <div style={{ gridColumn: 'span 2' }}>
                          <span style={{ fontSize: '8px', color: '#888', fontWeight: 700 }}>SERVICE & BILLING</span>
                          <div style={{ fontWeight: 800, fontSize: '10px', color: '#1a1a2e', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{newBooking.service || '\u2014'}</span>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ color: '#0f52ba' }}>₹{(newBooking.amount || 0).toLocaleString()}</div>
                              {newBooking.referralCutValue > 0 && (
                                <div style={{ fontSize: '8px', color: '#e67e22', fontWeight: 900, marginTop: '2px' }}>
                                  REFERRAL CUT: ₹{(newBooking.referralCutValue || 0).toLocaleString()}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div><span style={{ fontSize: '8px', color: '#888', fontWeight: 700 }}>SPECIALIST</span><div style={{ fontWeight: 800, fontSize: '10px', color: '#1a1a2e' }}>{newBooking.doctor || 'Unassigned'}</div></div>
                        <div><span style={{ fontSize: '8px', color: '#888', fontWeight: 700 }}>SCHEDULED DATE</span><div style={{ fontWeight: 800, fontSize: '10px', color: '#0f52ba' }}>{newBooking.date}</div></div>
                      </div>
                    </div>

                    <div className="drawer-footer" style={{ marginTop: '0px', paddingTop: '10px' }}>
                      <button className="btn-logout" style={{ padding: '10px 16px', borderRadius: '10px', fontWeight: 800, fontSize: '12px' }} onClick={() => setBookingStep(1)}>{'\u2190'} Back</button>
                      <button 
                        className="gamified-btn" 
                        style={{ 
                          flex: 1, padding: '10px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 950,
                          background: 'linear-gradient(90deg, #0f52ba, #00f2fe)',
                          color: 'white', border: 'none', cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(15, 82, 186, 0.2)',
                          opacity: (!newBooking.patientId || !newBooking.service || !newBooking.doctor) ? 0.7 : 1
                        }}
                        disabled={!newBooking.patientId || !newBooking.service || !newBooking.doctor}
                        onClick={handleBookAppointment}
                      >
                        🚀 DEPLOY MISSION
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
  const renderEditModal = () => {
    if (!isEditingOpen || !editingAppointment) return null;

    return (
      <div className="drawer-overlay">
        <div className="drawer-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
          <div className="drawer-header" style={{ background: 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)', color: 'white', padding: '28px 30px', border: 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0 }}>EDIT APPOINTMENT</h2>
              </div>
              <p style={{ fontSize: '11px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Appointment ID: {editingAppointment.id}
              </p>
            </div>
            <button className="btn-close" style={{ color: 'white', fontSize: '28px' }} onClick={() => setIsEditingOpen(false)}>✕</button>
          </div>

          <div className="drawer-body" style={{ padding: '30px' }}>
            {/* Patient Identity (Editable) */}
            <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
              <label style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 800, marginBottom: '15px', display: 'block', letterSpacing: '1px' }}>PATIENT IDENTITY</label>
              
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: '#64748b' }}>FULL NAME</label>
                <input 
                  type="text" 
                  style={{ fontSize: '13px', padding: '10px', width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                  value={editingAppointment.patientName || ''}
                  onChange={e => setEditingAppointment({...editingAppointment, patientName: e.target.value})}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '9px', fontWeight: 700, color: '#64748b' }}>MOBILE</label>
                  <input 
                    type="tel" 
                    style={{ fontSize: '13px', padding: '10px', width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                    value={editingAppointment.mobile || ''}
                    onChange={e => setEditingAppointment({...editingAppointment, mobile: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '9px', fontWeight: 700, color: '#64748b' }}>AGE (Y)</label>
                  <input 
                    type="text" 
                    style={{ fontSize: '13px', padding: '10px', width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                    value={editingAppointment.patientAge || ''}
                    onChange={e => setEditingAppointment({...editingAppointment, patientAge: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* Mission Date */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700 }}>MISSION DATE <span style={{ color: '#e74c3c' }}>*</span></label>
              <input 
                type="date" 
                required 
                style={{ fontSize: '13px', padding: '11px 12px', width: '100%', borderRadius: '10px', border: '1px solid #e2e8f0' }} 
                value={editingAppointment.dateTime ? editingAppointment.dateTime.split('T')[0] : (editingAppointment.date || '')} 
                onChange={e => {
                  const newDate = e.target.value;
                  let currentTime = '12:00:00';
                  if (editingAppointment.dateTime && editingAppointment.dateTime.includes('T')) {
                    const timePart = editingAppointment.dateTime.split('T')[1];
                    currentTime = timePart.replace('Z', '');
                  }
                  setEditingAppointment({
                    ...editingAppointment, 
                    dateTime: `${newDate}T${currentTime}`,
                    date: newDate
                  });
                }} 
              />
            </div>

            {/* Modality */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700 }}>MODALITY</label>
              <select 
                style={{ fontSize: '13px', padding: '11px', height: '44px', width: '100%', borderRadius: '10px', border: '1px solid #e2e8f0' }} 
                value={editingAppointment.modality || 'X-RAY'} 
                onChange={e => setEditingAppointment({...editingAppointment, modality: e.target.value, service: '', amount: 0, referralCutValue: 0})}
              >
                {MODALITIES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Service/Procedure */}
            <div className="form-group" style={{ marginBottom: '16px', position: 'relative' }}>
              <label style={{ fontSize: '10px', fontWeight: 700 }}>SERVICE / PROCEDURE <span style={{ color: '#e74c3c' }}>*</span></label>
              <input 
                type="text" 
                required 
                placeholder="e.g. Chest X-Ray with Lateral" 
                style={{ fontSize: '13px', padding: '11px 12px', width: '100%', borderRadius: '10px', border: '1px solid #e2e8f0' }} 
                value={editingAppointment.service || ''} 
                onChange={e => {
                  const val = e.target.value;
                  setEditingAppointment(prev => ({ ...prev, service: val }));
                  const match = serviceRegistry.find(s => s.modality === editingAppointment.modality && s.serviceName.toLowerCase() === val.toLowerCase());
                  if (match) {
                    setEditingAppointment(prev => ({
                      ...prev,
                      amount: match.amount,
                      referralCutValue: match.referralCutValue || 0
                    }));

                  }

                }} 
              />

              {/* Service Suggestions in Edit Mode */}
              {editingAppointment.service?.length > 0 && serviceRegistry.some(s => 
                s.modality === editingAppointment.modality && 
                s.serviceName.toLowerCase().includes(editingAppointment.service.toLowerCase()) && 
                s.serviceName !== editingAppointment.service
              ) && (
                <div style={{ 
                  position: 'absolute', top: '100%', left: 0, right: 0, 
                  background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', 
                  boxShadow: '0 10px 30px rgba(0,0,0,0.1)', zIndex: 100, 
                  maxHeight: '150px', overflowY: 'auto', marginTop: '4px' 
                }}>
                  {serviceRegistry
                    .filter(s => s.modality === editingAppointment.modality && s.serviceName.toLowerCase().includes(editingAppointment.service.toLowerCase()))
                    .map(s => (
                      <div 
                        key={s.id}
                        onClick={() => setEditingAppointment({
                          ...editingAppointment, 
                          service: s.serviceName,
                          amount: s.amount,
                          referralCutValue: s.referralCutValue || 0
                        })}


                        style={{ padding: '10px 15px', borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                        onMouseOver={e => e.currentTarget.style.background = '#f0f4ff'}
                        onMouseOut={e => e.currentTarget.style.background = 'white'}
                      >
                         <div style={{ fontSize: '12px', fontWeight: 800 }}>{s.serviceName}</div>
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

            {/* Service Amount */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700 }}>SERVICE AMOUNT (₹)</label>
              <input 
                type="number" 
                style={{ fontSize: '13px', padding: '11px 12px', width: '100%', borderRadius: '10px', border: '1px solid #e2e8f0' }} 
                value={editingAppointment.amount || 0} 
                onChange={e => setEditingAppointment({...editingAppointment, amount: parseFloat(e.target.value) || 0})}
              />
              {editingAppointment.referralCutValue > 0 && (
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#0f52ba', marginTop: '6px' }}>
                  <span style={{ opacity: 0.6 }}>SYSTEM REFERRAL CUT: </span>
                  ₹{(editingAppointment.referralCutValue || 0).toLocaleString()}
                </div>
              )}


            </div>

            {/* Doctor */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700 }}>LEAD SPECIALIST <span style={{ color: '#e74c3c' }}>*</span></label>
              <select 
                style={{ fontSize: '13px', padding: '11px', height: '44px', width: '100%', borderRadius: '10px', border: '1px solid #e2e8f0' }} 
                value={editingAppointment.doctor || ''} 
                onChange={e => setEditingAppointment({...editingAppointment, doctor: e.target.value})}
              >
                <option value="">Select Specialist...</option>
                {doctors.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Referrer */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700 }}>REFERRED BY</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input 
                    type="text" 
                    placeholder="Search referrers..."
                    style={{ fontSize: '13px', padding: '11px 12px', width: '100%', borderRadius: '10px', border: '1px solid #e2e8f0' }} 
                    value={editingAppointment.referredBy || ''} 
                    onChange={e => {
                      const val = e.target.value;
                      setEditingAppointment({...editingAppointment, referredBy: val});
                      fetchReferrers(val);
                    }} 
                  />
                  {editingAppointment.referredBy && referrers.length > 0 && !referrers.some(r => r.name === editingAppointment.referredBy) && (
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
                            setEditingAppointment({...editingAppointment, referredBy: r.name});
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
                <button 
                  type="button" 
                  onClick={() => setIsAddingReferrer(true)}
                  style={{ padding: '0 15px', borderRadius: '10px', border: '1px dashed #cbd5e1', background: '#f8fafc', color: '#0f52ba', fontSize: '20px', fontWeight: 700, cursor: 'pointer' }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Notes */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700 }}>NOTES (OPTIONAL)</label>
              <textarea 
                placeholder="Clinical notes..." 
                style={{ fontSize: '13px', padding: '11px 12px', width: '100%', minHeight: '80px', fontFamily: 'inherit' }} 
                value={editingAppointment.notes || ''} 
                onChange={e => setEditingAppointment({...editingAppointment, notes: e.target.value})} 
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={() => setIsEditingOpen(false)}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '12px',
                  border: '1px solid #dee2e6',
                  background: 'white',
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                CANCEL
              </button>
                <button
                onClick={handleEditAppointment}
                style={{
                  flex: 2,
                  padding: '14px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)',
                  fontSize: '12px',
                  fontWeight: 900,
                  color: 'white',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(243, 156, 18, 0.3)',
                  transition: 'all 0.2s'
                }}
              >
                SAVE CHANGES
              </button>
            </div>
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
              <div style={{ marginTop: '8px', textAlign: 'left' }}>
                <div style={{ fontSize: '9px', fontWeight: 800, color: '#333' }}>MODALITY: {tokenPrintData.modality}</div>
                <div style={{ fontSize: '12px', fontWeight: 950, marginTop: '2px', borderLeft: '3px solid black', paddingLeft: '8px' }}>{tokenPrintData.service}</div>
              </div>

              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', width: '65mm' }}>
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`${window.location.origin}/track/${tokenPrintData.appointmentId || tokenPrintData.id}`)}`} 
                    alt="QR" 
                    crossOrigin="anonymous"
                    style={{ width: '14mm', height: '14mm' }} 
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

          <select
            className="filter-select"
            value={filters.status}
            onChange={e => setFilters({...filters, status: e.target.value})}
          >
            <option value="ALL">All Statuses</option>
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        </div>

        <button className="filter-reset-btn" onClick={() => {
          setSearchQuery('');
          setFilters({ date: TODAY, status: 'ALL', modality: 'ALL', doctor: 'ALL' });
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

        {/* Desktop: Table Header */}
        {!isMobile && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '75px 50px 2.4fr 0.9fr 95px 110px 1.3fr 215px',
            gap: '12px',
            padding: '0 16px 8px',
            fontSize: '8.5px', fontWeight: 800, color: '#aaa',
            textTransform: 'uppercase', letterSpacing: '1px',
          }}>
            <span>Mission ID</span>
            <span style={{ textAlign: 'center' }}>Token</span>
            <span>Patient & Service</span>
            <span>Referring Dr.</span>
            <span>Scheduled Date</span>
            <span>Status</span>
            <span>Specialist</span>
            <span style={{ textAlign: 'right', paddingRight: '16px' }}>Mission Control</span>
          </div>
        )}

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
                  onPrint={(app) => setTokenPrintData(app)}
                  onPrescription={(app) => handlePreviewPrint(app)}
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
      {renderEditModal()}
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
                <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748b' }}>CONTACT NUMBER (MOBILE)</label>
                <input 
                  type="tel" 
                  required
                  placeholder="e.g. 9876543210"
                  style={{ 
                    width: '100%', 
                    padding: '10px', 
                    borderRadius: '8px', 
                    border: '1.5px solid',
                    borderColor: (newReferrer.contact.length > 0 && !isReferrerContactValid) ? '#e74c3c' : '#cbd5e1',
                    marginBottom: '4px',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  value={newReferrer.contact}
                  onChange={e => setNewReferrer({...newReferrer, contact: e.target.value})}
                />
                <span style={{ fontSize: '9px', color: (newReferrer.contact.length > 0 && !isReferrerContactValid) ? '#e74c3c' : '#64748b', display: 'block', fontWeight: 700 }}>
                  Must be a 10-digit Indian mobile number.
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
        onClose={() => setIsPreviewOpen(false)}
        doctorId={previewAppointment?.doctorId}
        appointmentId={previewAppointment?.appointmentId || previewAppointment?.id}
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