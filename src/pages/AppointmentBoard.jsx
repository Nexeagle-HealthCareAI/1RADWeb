import { useState, useMemo, useEffect, useCallback, useContext, useRef } from 'react';
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
  future:      { label: 'FUTURE', color: '#6366f1', bg: '#eef2ff', glow: 'rgba(99,102,241,0.1)' },
  scheduled:   { label: 'EXPECTED', color: '#64748b', bg: '#f1f5f9', glow: 'rgba(100,116,139,0.1)' },
  booked:      { label: 'EXPECTED', color: '#64748b', bg: '#f1f5f9', glow: 'rgba(100,116,139,0.1)' },
  confirmed:   { label: 'ARRIVED', color: '#10b981', bg: '#ecfdf5', glow: 'rgba(16,185,129,0.15)' },
  in_progress: { label: 'SCANNING', color: '#f59e0b', bg: '#fffbeb', glow: 'rgba(245,158,11,0.15)' },
  completed:   { label: 'SCANNED', color: '#0f52ba', bg: '#f0f4ff', glow: 'rgba(15,82,186,0.15)' },
  scanned:     { label: 'SCANNED', color: '#0f52ba', bg: '#f0f4ff', glow: 'rgba(15,82,186,0.15)' },
  reporting:   { label: 'REPORTING', color: '#8b5cf6', bg: '#f5f3ff', glow: 'rgba(139,92,246,0.15)' },
  reported:    { label: 'REPORTED', color: '#059669', bg: '#ecfdf5', glow: 'rgba(5,150,105,0.15)' },
  cancelled:   { label: 'CANCELLED', color: '#ef4444', bg: '#fef2f2', glow: 'rgba(239,68,68,0.15)' },
  unknown:     { label: 'UNKNOWN', color: '#94a3b8', bg: '#f8fafc', glow: 'rgba(148,163,184,0.1)' }
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
  const { activeCenterId, activeCenter } = useContext(AuthContext);
  const { isOnline, addToOutbox } = useOffline();
  const [activeTab, setActiveTab] = useState('TODAY'); // 'TODAY' or 'PAST'
  const [pastDateRange, setPastDateRange] = useState({ 
    start: TODAY, 
    end: TODAY 
  });
  const [archiveFilterMode, setArchiveFilterMode] = useState('ALL'); // 'ALL' or 'RANGE'
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
  const [isEditingOpen, setIsEditingOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewAppointment, setPreviewAppointment] = useState(null);
  const [previewReport, setPreviewReport] = useState({ mode: 'Narrative Editor', text: '', impression: '', isFinalized: false });
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
    amount: 0,
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

  // Responsive layout detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

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
        return {
          ...a,
          id: a.displayId,
          appointmentId: a.appointmentId,
          ptid: a.patientIdentifier,
          status: isFuture ? 'future' : (a.status ? a.status.toLowerCase() : 'scheduled')
        };
      });

      // Sort by absolute dateTime to ensure strict chronological order (time-based)
      const sortedData = mappedData.sort((a, b) => {
        const timeA = new Date(a.dateTime || 0).getTime();
        const timeB = new Date(b.dateTime || 0).getTime();
        return timeB - timeA;
      });
      
      const dailyCounters = {};
      const processedData = sortedData.map(item => {
        const dateKey = new Date(item.dateTime || TODAY).toISOString().split('T')[0];
        dailyCounters[dateKey] = (dailyCounters[dateKey] || 0) + 1;
        
        return {
          ...item,
          tokenNo: dailyCounters[dateKey]
        };
      });

      setAppointments(processedData);
      await nativeStorage.set(cacheKey, processedData);
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

  // Handle window resize for responsive layout
  useEffect(() => {
    const handleResize = () => {
      const newWidth = window.innerWidth;
      setWindowWidth(newWidth);
      setIsMobile(newWidth < 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- DERIVED ---
  const filteredAppointments = useMemo(() => {
    return appointments.filter(app => {
      // Date filtering (Defensive)
      const appDate = app.date || (app.dateTime ? app.dateTime.split('T')[0] : null);
      
      const currentToday = getTodayString();
      if (activeTab === 'TODAY') {
        if (appDate !== currentToday) return false;
      } else if (activeTab === 'FUTURE') {
        if (!appDate || appDate <= currentToday) return false;
      } else {
        // Archive mode filtering
        if (appDate >= currentToday && activeTab === 'PAST') return false;
        if (archiveFilterMode === 'RANGE') {
          if (!appDate) return false;
          if (appDate < pastDateRange.start || appDate > pastDateRange.end) return false;
        }
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
  }, [searchQuery, filters, activeTab, archiveFilterMode, pastDateRange]);

  // Auto-scroll on page change
  useEffect(() => {
    if (listTopRef.current) {
      listTopRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentPage]);

  const itemsPerPage = 5;
  const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);
  const paginatedAppointments = filteredAppointments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const stats = {
    total: filteredAppointments.length,
    scheduled: filteredAppointments.filter(a => a.status === 'scheduled' || a.status === 'future').length,
    confirmed: filteredAppointments.filter(a => a.status === 'confirmed').length,
    inProgress: filteredAppointments.filter(a => a.status === 'in_progress').length,
    completed: filteredAppointments.filter(a => a.status === 'completed').length,
    cancelled: filteredAppointments.filter(a => a.status === 'cancelled').length,
  };
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const activeRate = stats.total > 0 ? Math.round(((stats.total - stats.cancelled) / stats.total) * 100) : 0;

  // --- HANDLERS ---
  const handleAction = async (id, actionOrStatus) => {
    const app = appointments.find(a => a.id === id);
    if (!app) return;

    let newStatus = '';
    if (actionOrStatus === 'CONFIRM') newStatus = 'confirmed';
    else if (actionOrStatus === 'START') newStatus = 'in_progress';
    else if (actionOrStatus === 'COMPLETE') newStatus = 'completed';
    else if (actionOrStatus === 'CANCEL') newStatus = 'cancelled';
    else newStatus = actionOrStatus.toLowerCase(); // Direct status update

    // Optimistic UI Update
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));

    if (!isOnline) {
      await addToOutbox('APPOINTMENT_STATUS', { id: app.appointmentId, status: newStatus });
      return;
    }

    try {
      await apiClient.patch(`/appointments/${app.appointmentId}/status`, `"${newStatus}"`, {
        headers: { 'Content-Type': 'application/json' }
      });
      fetchAppointments();
    } catch (error) {
      console.error('Failed to update status:', error);
      if (!error.response) {
        await addToOutbox('APPOINTMENT_STATUS', { id: app.appointmentId, status: newStatus });
      }
    }
  };

  const getNextAction = (status) => {
    switch (status) {
      case 'future':      return null;
      case 'scheduled':   return { action: 'CONFIRM', label: 'MARK ARRIVED', color: '#10b981' };
      case 'booked':      return { action: 'CONFIRM', label: 'MARK ARRIVED', color: '#10b981' };
      case 'confirmed':   return { action: 'START', label: 'BEGIN SCAN', color: '#f59e0b' };
      case 'in_progress': return { action: 'COMPLETE', label: 'FINALIZE SCAN', color: '#0f52ba' };
      case 'completed':   
      case 'scanned':     return { action: 'REPORTING', label: 'START REPORT', color: '#8b5cf6' };
      default: return null;
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
      alert('OFFLINE_MODE: Patient profile queued for synchronization.');
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
      alert('DEPLOYMENT HALTED: Mission target (Patient) is not identified. Please select or add a patient in Phase 1.');
      setBookingStep(1);
      return;
    }

    // 2. Validate Service/Procedure
    if (!newBooking.service || newBooking.service.trim() === '') {
      alert('DEPLOYMENT HALTED: Clinical Service/Procedure is missing. This field is mandatory for billing and reporting.');
      return;
    }

    // 3. Validate Specialist
    if (!newBooking.doctor) {
      alert('DEPLOYMENT HALTED: No Lead Specialist assigned. Every mission requires a supervising physician.');
      return;
    }

    // 4. Validate Date (Safety Check)
    if (!newBooking.date) {
      alert('DEPLOYMENT HALTED: Mission timeline is undefined. Please select a valid date.');
      return;
    }

    const payload = {
      patientId: newBooking.patientId,
      service: newBooking.service,
      modality: newBooking.modality,
      dateTime: new Date(`${newBooking.date}T12:00:00`).toISOString(),
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
      alert('OFFLINE_MODE: Mission deployment queued for synchronization.');
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
        alert('CRITICAL ERROR: Mission deployment failed. Check backend telemetry.');
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
      doctor: '', 
      notes: '',
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
      alert('WARNING: Service/Procedure details are missing. Field is mandatory.');
      return;
    }
    if (!editingAppointment.doctor) {
      alert('WARNING: No Lead Specialist assigned. Cannot proceed without a supervisor.');
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
      alert('ERROR: Failed to update appointment. Please try again.');
    }
  };

  const handleAddReferrer = async (e) => {
    e.preventDefault();
    
    // Validation Logic
    const cleanContact = newReferrer.contact.replace(/[\s\-\+\(\)]/g, '');
    const contactRegex = /^[0-9]{10,15}$/;
    
    if (!newReferrer.name || newReferrer.name.trim().length < 3) {
      alert('VALIDATION ERROR: Referrer name must be at least 3 characters.');
      return;
    }
    
    if (!cleanContact || !contactRegex.test(cleanContact)) {
      alert('VALIDATION ERROR: Please provide a valid numeric contact number (10-15 digits).');
      return;
    }

    try {
      const response = await apiClient.post('/referrers', {
        name: newReferrer.name,
        contact: cleanContact,
        address: newReferrer.address
      });
      
      const savedReferrer = response.data;
      
      // Update local state
      setReferrers(prev => [...prev, savedReferrer]);
      
      // Select the newly added referrer in both possible contexts
      setNewPatient(prev => ({ ...prev, referredBy: savedReferrer.name }));
      if (editingAppointment) {
        setEditingAppointment(prev => ({ ...prev, referredBy: savedReferrer.name }));
      }
      
      // Close modal and reset
      setIsAddingReferrer(false);
      setNewReferrer({ name: '', contact: '', address: '' });
      
    } catch (error) {
      console.error('Failed to add referrer:', error);
      alert('ERROR: Could not save referrer. Please verify your connection and try again.');
    }
  };


  // ============================================================
  //  INSTITUTIONAL PRINTING ENGINE (DESKTOP PARITY)
  // ============================================================
  const ghostPrint = (html) => {
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
               <div style="font-size: 24px; color: #0f52ba;">${(activeCenter?.hospitalName || '1RAD DIAGNOSTIC HUB').toUpperCase()}</div>
               <div style="font-size: 12px; color: #64748b; font-weight: 500; margin-top: 5px;">${activeCenter?.address || 'Strategic Healthcare Node'}</div>
               <div style="font-size: 12px; color: #64748b; font-weight: 500;">Contact: ${activeCenter?.contactNo || '+91 XXXXXXXXXX'}</div>
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
             <div style="font-size: 12px; color: #64748b; margin-top: 5px;">Clinical Reference: ${inv.patientId || 'N/A'}</div>
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
             Powered by 1Rad Strategic Infrastructure
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
          <div class="center" style="font-size: 16px; font-weight: bold;">${activeCenter?.hospitalName || '1RAD HUB'}</div>
          <div class="center">${activeCenter?.address || ''}</div>
          <div class="divider"></div>
          <div style="font-weight: bold;">INV: ${inv.displayId}</div>
          <div>DATE: ${new Date(inv.createdAt).toLocaleString()}</div>
          <div class="divider"></div>
          <div style="font-weight: bold;">PATIENT: ${inv.patientName.toUpperCase()}</div>
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
        </body>
      </html>
    `);
  };

  const handlePrintReceipt = (inv) => {
    if (!inv) return;
    
    ghostPrint(`
      <html>
        <head>
          <title>Payment Receipt - ${inv.displayId}</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
            .receipt-container { max-width: 600px; margin: 0 auto; border: 2px solid #0f52ba; padding: 30px; border-radius: 20px; }
            .header { text-align: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 20px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; padding: 5px 0; }
            .label { font-weight: 950; color: #64748b; font-size: 11px; text-transform: uppercase; }
            .value { font-weight: 700; color: #1e293b; }
            .amount-box { background: #f0f4ff; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0; border: 1px solid #dbeafe; }
            .stamp { text-align: right; margin-top: 40px; font-weight: 950; color: #0f52ba; font-size: 14px; opacity: 0.5; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              <div style="font-size: 20px; font-weight: 950; color: #0f52ba;">${activeCenter?.hospitalName?.toUpperCase() || '1RAD DIAGNOSTICS'}</div>
              <div style="font-size: 12px; color: #64748b;">PAYMENT ACKNOWLEDGEMENT</div>
            </div>
            <div class="row"><span class="label">Receipt No:</span><span class="value">REC/${inv.displayId}</span></div>
            <div class="row"><span class="label">Date:</span><span class="value">${new Date().toLocaleDateString()}</span></div>
            <div class="row"><span class="label">Patient Name:</span><span class="value">${inv.patientName.toUpperCase()}</span></div>
            <div class="row"><span class="label">Invoice Ref:</span><span class="value">${inv.displayId}</span></div>
            <div class="row"><span class="label">Payment Mode:</span><span class="value">${inv.paymentMethod || 'CASH'}</span></div>
            <div class="amount-box">
              <div class="label">Amount Received</div>
              <div style="font-size: 32px; font-weight: 950; color: #0f52ba; margin-top: 5px;">₹${(inv.totalAmount || 0).toLocaleString()}</div>
              <div style="font-size: 10px; color: #64748b; font-weight: 700; margin-top: 5px;">FULLY PAID & SETTLED</div>
            </div>
            <div class="stamp">Authorized Signatory<br/><span style="font-size: 10px;">(Computer Generated)</span></div>
            <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px dashed #e2e8f0; padding-top: 15px;">
              Thank you for choosing 1Rad Diagnostic Services.
            </div>
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
        alert('MISSION ALERT: No financial records found for this deployment.');
        return;
      }
      
      if (type === 'A4') handlePrintA4(inv);
      else if (type === 'THERMAL') handlePrintThermal(inv);
      else if (type === 'RECEIPT') handlePrintReceipt(inv);
    } catch (err) {
      console.error('Print protocol failed', err);
      alert('CRITICAL ERROR: Financial telemetry extraction failed.');
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
    const readyCount = stats.scheduled + stats.confirmed;
    const progressCount = stats.inProgress;
    
    return (
      <div className="intel-cards-grid">
        {/* Card: Total Missions */}
        <div style={{
          background: 'linear-gradient(135deg, #0a1628 0%, #1e293b 100%)',
          borderRadius: '16px', padding: '16px', color: 'white', position: 'relative', overflow: 'hidden',
          boxShadow: '0 8px 25px rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.05)'
        }}>
          <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '9px', fontWeight: 950, color: 'white', opacity: 0.1 }}>SIGNAL_OK</div>
          <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1.5px', opacity: 0.7, marginBottom: '8px' }}>Total Missions</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <div style={{ fontSize: '32px', fontWeight: 950, lineHeight: 1 }}>{stats.total}</div>
            <div style={{ fontSize: '10px', fontWeight: 700, opacity: 0.6 }}>UNITS</div>
          </div>
          <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: 'var(--tactical-cyan)', borderRadius: '2px' }} />
            </div>
            <span style={{ fontSize: '8px', fontWeight: 900, color: 'var(--tactical-cyan)' }}>100% REGISTRY</span>
          </div>
        </div>

        {/* Card: Ready Stats */}
        <div style={{
          background: 'white', borderRadius: '16px', padding: '16px',
          border: '1px solid #dee2e6', position: 'relative', overflow: 'hidden',
          boxShadow: '0 4px 15px rgba(0,0,0,0.02)'
        }}>
          <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '9px', fontWeight: 950, color: '#0f52ba', opacity: 0.1 }}>READY_INTEL</div>
          <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#64748b', marginBottom: '8px' }}>Ready for Deployment</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '32px', fontWeight: 950, color: '#0f52ba', lineHeight: 1 }}>{readyCount}</span>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#0f52ba', opacity: 0.8 }}>READY</span>
          </div>
          <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8' }}>SCHEDULED</span>
              <span style={{ fontSize: '12px', fontWeight: 900, color: '#334155' }}>{stats.scheduled}</span>
            </div>
            <div style={{ width: '1px', background: '#e2e8f0', margin: '3px 0' }}></div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8' }}>CONFIRMED</span>
              <span style={{ fontSize: '12px', fontWeight: 900, color: '#334155' }}>{stats.confirmed}</span>
            </div>
          </div>
        </div>

        {/* Card: Progress Stats */}
        <div style={{
          background: 'white', borderRadius: '16px', padding: '16px',
          border: '1px solid #dee2e6', position: 'relative', overflow: 'hidden',
          boxShadow: '0 4px 15px rgba(0,0,0,0.02)'
        }}>
          <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '9px', fontWeight: 950, color: '#f39c12', opacity: 0.1 }}>ACTIVE_SCAN</div>
          <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#64748b', marginBottom: '8px' }}>Mission in Progress</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '32px', fontWeight: 950, color: '#f39c12', lineHeight: 1 }}>{progressCount}</span>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#f39c12', opacity: 0.8 }}>ACTIVE SCAN</span>
          </div>
          <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, height: '3px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: progressCount > 0 ? '100%' : '0%', height: '100%', background: '#f39c12', borderRadius: '2px', transition: 'width 0.5s ease' }} />
            </div>
            <span style={{ fontSize: '8px', fontWeight: 900, color: '#f39c12' }}>{progressCount > 0 ? 'SCANNING' : 'IDLE'}</span>
          </div>
        </div>

        {/* Card: Completed Stats */}
        <div style={{
          background: 'white', borderRadius: '16px', padding: '16px',
          border: '1px solid #dee2e6', position: 'relative', overflow: 'hidden',
          boxShadow: '0 4px 15px rgba(0,0,0,0.02)'
        }}>
          <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '9px', fontWeight: 950, color: '#10b981', opacity: 0.1 }}>OK</div>
          <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#64748b', marginBottom: '8px' }}>Completed Operations</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '32px', fontWeight: 950, color: '#10b981', lineHeight: 1 }}>{stats.completed}</span>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#10b981', opacity: 0.8 }}>SUCCESS</span>
          </div>
          <div style={{ marginTop: '15px', height: '3px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${(stats.completed / (stats.total || 1)) * 100}%`, height: '100%', background: '#10b981', borderRadius: '2px', transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 800, marginTop: '6px', textTransform: 'uppercase' }}>Success Rate: {Math.round((stats.completed / (stats.total || 1)) * 100)}%</div>
        </div>
      </div>
    );
  };

  // ============================================================
  //  FILTER CONSOLE - RESPONSIVE
  // ============================================================
  const renderFilterBar = () => (
    <div className="filter-bar-responsive">
      {/* Search Group */}
      <div className="filter-search-group">
        <input
          type="text"
          placeholder="Search patient, mobile, or ID..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button 
            onClick={() => setSearchQuery('')} 
            style={{ 
              border: 'none', 
              background: 'none', 
              cursor: 'pointer', 
              fontSize: '14px', 
              color: '#aaa', 
              padding: 0 
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Select Group */}
      <div className="filter-select-group">
        <select
          value={filters.doctor}
          onChange={e => setFilters({...filters, doctor: e.target.value})}
          className="filter-select"
        >
          <option value="ALL">All Specialists</option>
          {doctors.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Date Range / All Toggle (only on PAST tab) */}
      {activeTab === 'PAST' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ display: 'flex', background: 'white', padding: '3px', borderRadius: '10px', border: '1px solid #dee2e6' }}>
            <button 
              onClick={() => setArchiveFilterMode('ALL')}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '10px', fontWeight: 950, background: archiveFilterMode === 'ALL' ? '#0f52ba' : 'transparent', color: archiveFilterMode === 'ALL' ? 'white' : '#64748b', cursor: 'pointer' }}
            >GLOBAL_ALL</button>
            <button 
              onClick={() => setArchiveFilterMode('RANGE')}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '10px', fontWeight: 950, background: archiveFilterMode === 'RANGE' ? '#0f52ba' : 'transparent', color: archiveFilterMode === 'RANGE' ? 'white' : '#64748b', cursor: 'pointer' }}
            >DATE_RANGE</button>
          </div>
          
          {archiveFilterMode === 'RANGE' && (
            <div className="filter-date-range">
              <input 
                type="date" 
                value={pastDateRange.start} 
                onChange={e => setPastDateRange(prev => ({ ...prev, start: e.target.value }))}
              />
              <span style={{ color: '#ccc' }}>→</span>
              <input 
                type="date" 
                value={pastDateRange.end} 
                onChange={e => setPastDateRange(prev => ({ ...prev, end: e.target.value }))}
              />
            </div>
          )}
        </div>
      )}

      {/* Reset Button */}
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
          className="filter-reset-btn"
        >
          ✕ RESET
        </button>
      )}

    </div>
  );

  // ============================================================
  //  PAGINATION RENDERER
  // ============================================================
  const renderPagination = () => {
    if (totalPages <= 1) return null;

    return (
      <div className="pagination-container">
        <button
          className="pagination-btn"
          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          disabled={currentPage === 1}
        >
          ← Prev
        </button>

        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
          <button
            key={page}
            className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
            onClick={() => setCurrentPage(page)}
          >
            {page}
          </button>
        ))}

        <button
          className="pagination-btn"
          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          disabled={currentPage === totalPages}
        >
          Next →
        </button>

        <span className="pagination-info">
          Page {currentPage} of {totalPages}
        </span>
      </div>
    );
  };



  // ============================================================
  //  APPOINTMENT TABLE ROW
  // ============================================================
  const renderAppointmentRow = (app) => {
    const meta = STATUS_META[app.status] || STATUS_META.unknown;
    const next = getNextAction(app.status);
    const isExpanded = expandedRow === app.appointmentId;
    const statusIndex = ['scheduled','confirmed','in_progress','scanned','reporting','reported'].indexOf(app.status);
    const patient = patients.find(p => p.id === app.patientId);

    return (
      <div key={app.appointmentId} className="mission-row-wrapper" style={{ marginBottom: '12px' }}>
        <div
          onClick={() => setExpandedRow(isExpanded ? null : app.appointmentId)}
          className={`mission-row-container ${isExpanded ? 'expanded' : ''}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '80px 70px 2.2fr 1.2fr 110px 140px 1.2fr 210px',
            alignItems: 'center',
            padding: '18px 24px',
            background: isExpanded ? '#fafbff' : 'white',
            borderRadius: isExpanded ? '16px 16px 0 0' : '16px',
            border: `1px solid ${isExpanded ? '#c5d5f0' : '#eef2f6'}`,
            borderBottom: isExpanded ? '1px dashed #dde5f5' : `1px solid ${isExpanded ? '#c5d5f0' : '#eef2f6'}`,
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            boxShadow: isExpanded ? '0 10px 30px rgba(15, 82, 186, 0.05)' : '0 2px 4px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ position: 'absolute', left: 0, top: '15%', bottom: '15%', width: '4px', background: meta.color, borderRadius: '0 4px 4px 0' }} />

          {/* ID Column */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', fontFamily: 'monospace', letterSpacing: '0.5px' }}>{app.ptid || '\u2014'}</div>
            <div style={{ fontSize: '8px', fontWeight: 800, color: '#94a3b8', marginTop: '2px' }}>{app.id.split('-').pop()}</div>
          </div>

          {/* Token Column */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '16px', fontWeight: 950, color: '#1a1a2e', letterSpacing: '-0.5px' }}>
              #{app.tokenNo || (app.id.includes('-') ? app.id.split('-')[1] : app.id)}
            </div>
            <div style={{ fontSize: '7px', fontWeight: 900, color: '#abb8c3', textTransform: 'uppercase', letterSpacing: '1px' }}>TOKEN_NO</div>
          </div>

          {/* Patient Column */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '12px', background: '#f0f4ff', color: '#0f52ba', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '14px', border: '1px solid #dbeafe' }}>{app.patientName.charAt(0)}</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontWeight: 850, color: '#1e293b', fontSize: '14px', letterSpacing: '-0.2px' }}>{app.patientName.toUpperCase()}</div>
              <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, marginTop: '2px' }}>{app.mobile} {'\u00B7'} {app.patientAge}Y {app.patientGender.toUpperCase()}</div>
            </div>
          </div>

          {/* Referral Column */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '11px', color: '#0f52ba', fontWeight: 900 }}>{app.referredBy || 'DIRECT_WALKIN'}</div>
            <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700, marginTop: '2px' }}>{app.referredContact !== 'N/A' ? app.referredContact : 'NO_REF_CONTACT'}</div>
          </div>

          {/* Date Column */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '11px', fontWeight: 850, color: '#1e293b' }}>
              {(() => {
                const d = app.dateTime ? new Date(app.dateTime) : (app.date ? new Date(app.date) : null);
                if (!d || isNaN(d.getTime())) return '\u2014';
                return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' }).toUpperCase()}, ${d.getFullYear()}`;
              })()}
            </div>
            <div style={{ fontSize: '7px', fontWeight: 900, color: '#abb8c3', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px' }}>MISSION_DATE</div>
          </div>

          {/* Status Column */}
          <div onClick={(e) => e.stopPropagation()}>
            <select
              value={app.status}
              onChange={(e) => handleAction(app.id, e.target.value)}
              disabled={app.status === 'future'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', borderRadius: '10px',
                background: meta.bg, border: `1px solid ${meta.color}30`,
                color: meta.color, fontSize: '9px', fontWeight: 950,
                textTransform: 'uppercase', letterSpacing: '0.5px',
                cursor: app.status === 'future' ? 'not-allowed' : 'pointer', 
                appearance: 'none', outline: 'none',
                opacity: app.status === 'future' ? 0.7 : 1
              }}
            >
              {Object.keys(STATUS_META).map(s => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
          </div>

          {/* Specialist Column */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontWeight: 850, color: '#334155', fontSize: '11px' }}>{app.doctor.toUpperCase()}</div>
            <div style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8', marginTop: '2px', textTransform: 'uppercase' }}>SPECIALIST</div>
          </div>

          {/* Actions Column */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifySelf: 'end' }}>
            
            {/* Next Status Action */}
            {next && (
              <button
                onClick={(e) => { e.stopPropagation(); handleAction(app.id, next.action); }}
                style={{ 
                  padding: '3px 6px', borderRadius: '6px', 
                  background: next.color, color: 'white', 
                  border: 'none', cursor: 'pointer', 
                  fontSize: '7.5px', fontWeight: 950, 
                  letterSpacing: '0.3px', transition: 'all 0.2s',
                  boxShadow: `0 4px 10px ${next.color}30`,
                  textTransform: 'uppercase'
                }}
              >
                {next.label}
              </button>
            )}

            {/* Token Print */}
            <button
              onClick={(e) => { e.stopPropagation(); setTokenPrintData(app); }}
              style={{ 
                padding: '3px 6px', borderRadius: '6px', 
                background: '#f1f5f9', border: '1px solid #cbd5e1', 
                cursor: 'pointer', display: 'flex', alignItems: 'center', 
                justifyContent: 'center', fontSize: '7.5px', fontWeight: 950, 
                color: '#0f52ba', transition: 'all 0.2s' 
              }}
              title="Print Token Slip"
            >
              TOKEN
            </button>

            {/* Prescription / Report Preview */}
            <button
              onClick={(e) => { e.stopPropagation(); handlePreviewPrint(app); }}
              style={{ 
                padding: '3px 6px', borderRadius: '6px', 
                background: '#fffbeb', border: '1px solid #fde68a', 
                cursor: 'pointer', display: 'flex', alignItems: 'center', 
                justifyContent: 'center', fontSize: '7.5px', fontWeight: 950, 
                color: '#b45309', transition: 'all 0.2s' 
              }}
              title="Print Prescription"
            >
              PRESCRIPTION
            </button>

            {/* Edit */}
            {app.status !== 'cancelled' && app.status !== 'completed' && (
              <button
                onClick={(e) => { e.stopPropagation(); setEditingAppointment(app); setIsEditingOpen(true); }}
                style={{ padding: '3px 6px', borderRadius: '6px', background: '#f8fafc', border: '1.5px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7.5px', fontWeight: 950, color: '#475569', transition: 'all 0.2s' }}
                title="Edit Appointment"
              >
                EDIT
              </button>
            )}

            {/* Cancel */}
            {app.status !== 'cancelled' && app.status !== 'completed' && (
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm(`Cancel appointment for ${app.patientName}?`)) handleAction(app.id, 'CANCEL'); }}
                style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#fef2f2', border: '1.5px solid #fecaca', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#ef4444', transition: 'all 0.2s' }}
                title="Cancel Appointment"
              >
                ✕
              </button>
            )}

            <div style={{ marginLeft: '4px', transition: 'transform 0.3s', transform: `rotate(${isExpanded ? 180 : 0}deg)`, fontSize: '12px', color: isExpanded ? '#0f52ba' : '#cbd5e1', fontWeight: 900 }}>▾</div>
          </div>
        </div>

        {isExpanded && (
          <div style={{
            background: '#fafbff', borderRadius: '0 0 14px 14px',
            border: '1px solid #c5d5f0', borderTop: 'none',
            padding: '20px 22px',
          }}>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>


              {patient && (
                <div style={{ flex: 1, display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 350px', background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1.5px', marginBottom: '20px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                       CLINICAL INTELLIGENCE
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                      <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, marginBottom: '5px' }}>STUDY MODALITY</div>
                        <div style={{ fontSize: '14px', fontWeight: 950, color: '#1a1a2e' }}>{app.modality}</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, marginBottom: '5px' }}>PROCEDURE / SERVICE</div>
                        <div style={{ fontSize: '14px', fontWeight: 950, color: '#1a1a2e' }}>{app.service}</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, marginBottom: '5px' }}>GENDER / AGE</div>
                        <div style={{ fontSize: '14px', fontWeight: 950, color: '#1a1a2e' }}>{app.patientGender} / {app.patientAge}Y</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ flex: '1 1 350px', background: '#fffbeb', padding: '24px', borderRadius: '16px', border: '1px solid #fde68a', boxShadow: '0 4px 15px rgba(245,158,11,0.05)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 950, color: '#b45309', letterSpacing: '1.5px', marginBottom: '15px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                       PHYSICIAN OBSERVATIONS
                    </div>
                    <p style={{ fontSize: '13px', color: '#92400e', fontWeight: 600, margin: 0, lineHeight: '1.6', background: 'rgba(255,255,255,0.4)', padding: '15px', borderRadius: '10px' }}>
                      {app.notes || 'No clinical observations or critical notes provided for this mission.'}
                    </p>
                  </div>
                  <div style={{ flex: '1 1 100%', background: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', marginTop: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b', letterSpacing: '1.5px', marginBottom: '20px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                       REPORTING & PRINTING SUITE
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setTokenPrintData(app); }}
                        style={{ padding: '12px 24px', background: 'white', border: '1.5px solid #0f52ba', borderRadius: '12px', fontSize: '11px', fontWeight: 950, color: '#0f52ba', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                      >
                        PRINT THERMAL SLIP
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handlePrintInstitutional(app, 'RECEIPT'); }}
                        style={{ padding: '12px 24px', background: 'white', border: '1.5px solid #10b981', borderRadius: '12px', fontSize: '11px', fontWeight: 950, color: '#10b981', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                      >
                        PAYMENT RECEIPT
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handlePrintInstitutional(app, 'A4'); }}
                        style={{ padding: '12px 24px', background: 'white', border: '1.5px solid #6366f1', borderRadius: '12px', fontSize: '11px', fontWeight: 950, color: '#6366f1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                      >
                        CLINICAL INVOICE (A4)
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handlePreviewPrint(app); }}
                        style={{ padding: '12px 24px', background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: '12px', fontSize: '11px', fontWeight: 950, color: '#b45309', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                      >
                        PRESCRIPTION
                      </button>
                    </div>
                  </div>
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
      <div className="drawer-overlay">
        <div className="drawer-content" onClick={e => e.stopPropagation()}>
          <div className="drawer-header" style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0f52ba 100%)', color: 'white', padding: '28px 30px', border: 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0 }}>NEW MISSION</h2>
              </div>
              <p style={{ fontSize: '11px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px' }}>Phase {bookingStep}: {isStep1 ? 'Target Identity' : 'Mission Configuration'}</p>
            </div>
            <button className="btn-close" style={{ color: 'white', fontSize: '28px' }} onClick={() => setIsBookingOpen(false)}>✕</button>
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
                    <input type="text" placeholder="Search patient database..." value={drawerSearchQuery} onChange={(e) => setDrawerSearchQuery(e.target.value)} autoFocus style={{ paddingLeft: '15px' }} />
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
                          {newBooking.patientId === p.id && <span style={{ color: '#0f52ba', fontWeight: 900, fontSize: '10px' }}>SELECTED</span>}
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
                  
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                    <div className="form-group" style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 700 }}>FULL NAME <span style={{ color: '#e74c3c' }}>*</span></label>
                      <input 
                        type="text" 
                        required 
                        placeholder="e.g. Michael Thorne" 
                        style={{ 
                          fontSize: '13px', 
                          padding: '11px 12px',
                          border: showBookingValidation && !newPatient.name.trim() ? '1.5px solid #e74c3c' : '1.5px solid #dee2e6',
                          background: showBookingValidation && !newPatient.name.trim() ? '#fff5f5' : 'white'
                        }} 
                        value={newPatient.name} 
                        onChange={e => { setNewPatient({...newPatient, name: e.target.value}); setNewBooking({...newBooking, patientId: ''}); }} 
                      />
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
                          borderColor: (newPatient.mobile.length > 0 && !isMobileValid) || (showBookingValidation && !isMobileValid) ? '#e74c3c' : '#dee2e6',
                          background: (showBookingValidation && !isMobileValid) ? '#fff5f5' : 'white',
                          boxShadow: (newPatient.mobile.length > 0 && !isMobileValid) || (showBookingValidation && !isMobileValid) ? '0 0 0 1px #e74c3c' : 'none'
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
                        <input 
                          type="text" 
                          required 
                          placeholder="25" 
                          style={{ 
                            fontSize: '13px', 
                            padding: '11px 12px',
                            border: showBookingValidation && !newPatient.age.trim() ? '1.5px solid #e74c3c' : '1.5px solid #dee2e6',
                            background: showBookingValidation && !newPatient.age.trim() ? '#fff5f5' : 'white'
                          }} 
                          value={newPatient.age} 
                          onChange={e => setNewPatient({...newPatient, age: e.target.value})} 
                        />
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

                <div className="form-group" style={{ marginTop: '10px', position: 'relative' }}>
                    <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888' }}>Referred By</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <input 
                          type="text" 
                          placeholder="Search or type referrer name..."
                          value={newPatient.referredBy} 
                          onChange={e => {
                            const val = e.target.value;
                            setNewPatient({...newPatient, referredBy: val});
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
                                  setNewPatient({...newPatient, referredBy: r.name});
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
                        style={{ padding: '0 12px', borderRadius: '8px', border: '1px dashed #cbd5e1', background: '#f8fafc', color: '#0f52ba', fontSize: '18px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        +
                      </button>
                    </div>
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
                      <div style={{ fontSize: '9px', color: '#0f52ba', fontWeight: 900, background: 'white', padding: '4px 8px', borderRadius: '6px', border: '1px solid #0f52ba' }}>MATCHED</div>
                    </div>
                  </div>
                )}

                <div className="drawer-footer" style={{ borderTop: 'none', paddingTop: '20px' }}>
                  <button 
                    className="gamified-btn" 
                    style={{ 
                      width: '100%', padding: '16px', borderRadius: '12px', fontSize: '13px',
                      background: isNewPatientIncomplete && showBookingValidation ? '#94a3b8' : 'linear-gradient(90deg, #0f52ba, #00f2fe)',
                      boxShadow: isNewPatientIncomplete && showBookingValidation ? 'none' : '0 10px 20px rgba(15, 82, 186, 0.2)',
                    }} 
                    onClick={async () => {
                      if (isNewPatientIncomplete) {
                        setShowBookingValidation(true);
                        // Optional: trigger a subtle haptic or visual shake
                        return;
                      }

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
                        setShowBookingValidation(false);
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
                      onClick={() => setNewBooking({...newBooking, modality: m, service: '', amount: 0, referralCutValue: 0})}
                    >
                      <span className="modality-icon" style={{ fontSize: '14px', fontWeight: 900, marginBottom: '4px', color: newBooking.modality === m ? 'white' : '#0f52ba' }}>{MODALITY_ICONS[m] || 'MOD'}</span>
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
                            onClick={() => setNewBooking({
                              ...newBooking, 
                              service: s.serviceName,
                              amount: s.amount,
                              referralCutValue: s.referralCutValue || 0
                            })}


                            style={{ padding: '12px 15px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', transition: 'background 0.2s' }}
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

                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888' }}>3. SERVICE AMOUNT (₹)</label>
                  <input 
                    type="number" 
                    placeholder="e.g. 500" 
                    value={newBooking.amount || ''} 
                    onChange={e => setNewBooking({...newBooking, amount: parseFloat(e.target.value) || 0})} 
                    style={{ fontSize: '13px', padding: '10px' }} 
                  />
                  {newBooking.referralCutValue > 0 && (
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#0f52ba', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ opacity: 0.6 }}>SYSTEM REFERRAL CUT:</span>
                      <span>₹{newBooking.referralCutValue}</span>

                    </div>
                  )}
                </div>

                <div style={{ marginTop: '16px' }}>
                  <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888', display: 'block', marginBottom: '10px' }}>MISSION DATE <span style={{ color: '#e74c3c' }}>*</span></label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {[0, 1, 2, 3, 4, 5, 6].map(offset => {
                      const d = new Date();
                      d.setDate(d.getDate() + offset);
                      const dateStr = d.toLocaleDateString('en-CA');
                      const label = offset === 0 ? 'TODAY' : offset === 1 ? 'TOMORROW' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }).toUpperCase();
                      const isActive = newBooking.date === dateStr;
                      return (
                        <button
                          key={dateStr}
                          onClick={() => setNewBooking({...newBooking, date: dateStr})}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '10px',
                            fontSize: '10px',
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
                          padding: '8px 14px',
                          borderRadius: '10px',
                          fontSize: '10px',
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
                        min={getTodayString()}
                        onChange={e => setNewBooking({...newBooking, date: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  {/* Show specific custom date if selected and not in quick chips */}
                  {![0, 1, 2, 3, 4, 5, 6].some(offset => {
                    const d = new Date();
                    d.setDate(d.getDate() + offset);
                    return d.toLocaleDateString('en-CA') === newBooking.date;
                  }) && (
                    <div style={{ 
                      display: 'flex', alignItems: 'center', gap: '8px', 
                      background: '#f8fafc', padding: '8px 12px', borderRadius: '10px', 
                      border: '1px solid #e2e8f0', width: 'fit-content'
                    }}>
                      <span style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba' }}>SELECTED: {newBooking.date}</span>
                      <button 
                        onClick={() => setNewBooking({...newBooking, date: getTodayString()})}
                        style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '10px', fontWeight: 900, cursor: 'pointer' }}
                      >RESET</button>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '16px', marginBottom: '8px' }}>
                  <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', color: '#888', display: 'block', marginBottom: '10px' }}>3. ASSIGN LEAD SPECIALIST <span style={{ color: '#e74c3c' }}>*</span></label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                    {doctors.map((d, idx) => (
                      <div key={`${d}_${idx}`} className={`modality-card ${newBooking.doctor === d ? 'active' : ''}`}
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
                        {newBooking.doctor === d && <span style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '9px', fontWeight: 950, color: 'white' }}>SELECTED</span>}
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
                    <div><span style={{ fontSize: '8px', color: '#888', fontWeight: 700 }}>SPECIALIST</span><div style={{ fontWeight: 800, fontSize: '11px', color: '#1a1a2e' }}>{newBooking.doctor || 'Unassigned'}</div></div>
                    <div><span style={{ fontSize: '8px', color: '#888', fontWeight: 700 }}>SCHEDULED DATE</span><div style={{ fontWeight: 800, fontSize: '11px', color: '#0f52ba' }}>{newBooking.date}</div></div>
                  </div>
                </div>

                <div className="drawer-footer" style={{ marginTop: '16px' }}>
                  <button className="btn-logout" style={{ padding: '12px 20px', borderRadius: '10px', fontWeight: 800, fontSize: '12px' }} onClick={() => setBookingStep(1)}>{'\u2190'} Back</button>
                  <button 
                    className="gamified-btn" 
                    style={{ 
                      flex: 1, padding: '12px', borderRadius: '10px', fontSize: '13px',
                      opacity: (!newBooking.patientId || !newBooking.service || !newBooking.doctor) ? 0.7 : 1
                    }} 
                    onClick={handleBookAppointment}
                  >
                    DEPLOY MISSION
                  </button>
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
                  const currentTime = editingAppointment.dateTime ? editingAppointment.dateTime.split('T')[1] : '12:00:00Z';
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
                  <span style={{ fontSize: '10px', fontWeight: 900 }}>{new Date(tokenPrintData.dateTime).toLocaleDateString()}</span>
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

              <div style={{ marginTop: '10px', fontSize: '8px', fontWeight: 700, color: '#94a3b8' }}>PRINTED: {new Date().toLocaleTimeString()}</div>
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
    <div className="page-wrapper board-padding appt-page-top">
      {/* \u2500\u2500 Page Header \u2500\u2500 */}
      <div className="appt-page-header">
        <div className="appt-page-title-block">
          <h1 className="appt-page-title">MISSION SCHEDULER</h1>
          <p className="appt-page-subtitle">
            Patient Intake & Appointment Command
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              marginLeft: '12px', padding: '2px 10px', borderRadius: '10px',
              background: '#e9f7ef', fontSize: '10px', fontWeight: 800, color: '#2ecc71',
            }}>
              LIVE
            </span>
          </p>
        </div>

        <div className="appt-page-actions">
          <button
            className="gamified-btn appt-new-mission-btn"
            onClick={() => { resetBooking(); setIsBookingOpen(true); }}
          >
            + NEW MISSION
          </button>

          <div className="appt-tab-toggle">
            <button
              onClick={() => setActiveTab('TODAY')}
              className={`appt-tab-btn ${activeTab === 'TODAY' ? 'active' : ''}`}
            >
              {isMobile ? 'TODAY' : "TODAY'S MISSIONS"}
            </button>
            <button
              onClick={() => setActiveTab('FUTURE')}
              className={`appt-tab-btn ${activeTab === 'FUTURE' ? 'active' : ''}`}
            >
              {isMobile ? 'FUTURE' : 'FUTURE MISSIONS'}
            </button>
            <button
              onClick={() => setActiveTab('PAST')}
              className={`appt-tab-btn ${activeTab === 'PAST' ? 'active' : ''}`}
            >
              {isMobile ? 'ARCHIVE' : 'MISSION ARCHIVE'}
            </button>
          </div>
        </div>
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

        {/* Desktop: Table Header */}
        {!isMobile && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 70px 2.2fr 1.2fr 110px 140px 1.2fr 210px',
            padding: '0 22px 10px',
            fontSize: '9px', fontWeight: 800, color: '#aaa',
            textTransform: 'uppercase', letterSpacing: '1px',
          }}>
            <span>ID</span>
            <span>Token</span>
            <span>Patient Details</span>
            <span>Referred By</span>
            <span>Date</span>
            <span>Status</span>
            <span>Specialist</span>
            <span style={{ textAlign: 'right', paddingRight: '20px' }}>Tactical Actions</span>
          </div>
        )}

        {/* Appointments List - Responsive Display */}
        <div className="appointments-list-container">
          {loading ? (
            <div className="empty-state">
              <div className="empty-state-title">LOADING MISSIONS...</div>
            </div>
          ) : paginatedAppointments.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">NO MISSIONS FOUND</div>
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
                  onCancel={(id) => handleAction(id, 'CANCEL')}
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
                <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748b' }}>CONTACT NUMBER</label>
                <input 
                  type="tel" 
                  placeholder="e.g. 9876543210"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  value={newReferrer.contact}
                  onChange={e => setNewReferrer({...newReferrer, contact: e.target.value})}
                />
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
    </div>
  );
}