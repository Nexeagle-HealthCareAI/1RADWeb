import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient, { BASE_URL } from '../api/apiClient';
import useAuth from '../auth/useAuth';
import { ROLE_LABELS, getCustomRoles } from '../data/roles';
import useOffline from '../hooks/useOffline';
import { nativeStorage } from '../hooks/useElectron';
import '../styles/global.css';
import '../styles/AdminBoard.css';
import PrescriptionPreview from '../components/PrescriptionPreview';
import FinanceManager from '../components/FinanceManager';
import RolesAndPermissions from '../components/RolesAndPermissions';


// --- HELPERS ---
const getISODate = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().split('T')[0];
};

const TODAY = getISODate(0);
const YESTERDAY = getISODate(1);

// --- MOCK DATA ---
const INITIAL_LAYOUTS = [];
const REFERRAL_LOG = [];
const DAILY_VOLUME_MOCK = [];
const MODALITY_STATS_MOCK = [];
const MODALITY_DAILY_TREND_MOCK = [];
const STAFF_PERFORMANCE_MOCK = [];

const SECTIONS_POOL = [
  { id: 'history', name: 'Clinical History' },
  { id: 'technique', name: 'Technique' },
  { id: 'findings', name: 'Findings' },
  { id: 'impression', name: 'Impression' },
  { id: 'advice', name: 'Advice' },
  { id: 'recommendation', name: 'Recommendation' },
  { id: 'comparison', name: 'Comparison' },
  { id: 'notes', name: 'Notes' }
];

const getOverviewDates = (timeframe) => {
  const now = new Date();
  let start = null;
  let end = getISODate(0); // TODAY

  if (timeframe === 'DAY') {
    start = getISODate(0);
  } else if (timeframe === 'WEEK') {
    start = getISODate(6); // 7 days including today
  } else if (timeframe === 'MONTH') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset*60*1000));
    start = localDate.toISOString().split('T')[0];
  } else if (timeframe === 'YEAR') {
    const d = new Date(now.getFullYear(), 0, 1);
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset*60*1000));
    start = localDate.toISOString().split('T')[0];
  }
  return { start, end };
};

export default function AdminBoard() {
  const { currentUser, logout, activeCenter, centers, switchCenter, refreshCenters, createCenter, subscription, refreshSubscription } = useAuth();
  const { isOnline, addToOutbox } = useOffline();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Overview');
  const [layouts, setLayouts] = useState(INITIAL_LAYOUTS);
  const [patients, setPatients] = useState([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [staffCurrentPage, setStaffCurrentPage] = useState(1);
  const staffItemsPerPage = 5;
  const [revealedPasswords, setRevealedPasswords] = useState({});
  const [referralMatrixSearch, setReferralMatrixSearch] = useState('');
  const [referralLogSearch, setReferralLogSearch] = useState('');
  const [referralRosterSearch, setReferralRosterSearch] = useState('');
  const [referralPatientsSearch, setReferralPatientsSearch] = useState('');
  const [referralViewMode, setReferralViewMode] = useState('MATRIX'); // 'MATRIX' or 'LOG'
  const [matrixPeriod, setMatrixPeriod] = useState('WEEK'); // 'DAY', 'WEEK', 'MONTH', 'YEAR'
  const [matrixDateStr, setMatrixDateStr] = useState(TODAY);
  const [matrixWeekIndex, setMatrixWeekIndex] = useState(1);
  
  // Dashboard Filters
  const [selectedDateFilter, setSelectedDateFilter] = useState(TODAY);
  const [referrerFilter, setReferrerFilter] = useState('ALL');
  const [overviewTimeframe, setOverviewTimeframe] = useState('ALL'); // 'DAY', 'WEEK', 'MONTH', 'YEAR', 'ALL'
  
  // Layout Builder State
  const [isLayoutDrawerOpen, setIsLayoutDrawerOpen] = useState(false);
  const [editLayout, setEditLayout] = useState({ name: '', modality: 'X-RAY', type: '', active: true, selectedSections: ['findings', 'impression'] });

  // User Management State
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
  const [revokeUser, setRevokeUser] = useState(null);
  const [isHospitalDrawerOpen, setIsHospitalDrawerOpen] = useState(false);
  const [isChainDrawerOpen, setIsChainDrawerOpen] = useState(false);
  const [isDeployingChain, setIsDeployingChain] = useState(false);
  const [newChainData, setNewChainData] = useState({ chainName: '', hospitalName: '', hospitalAddress: '' });
  const [showChainSelector, setShowChainSelector] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isSwitchingNode, setIsSwitchingNode] = useState(false);
  const [userRegStep, setUserRegStep] = useState(1);
  const [editUser, setEditUser] = useState(null);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [settings, setSettings] = useState({ allowCustom: true, lockApproved: false, reqFindings: true, reqImpression: true });
  const [showPasswords, setShowPasswords] = useState(false);
  const [sharingUser, setSharingUser] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState('');

  // Custom Sections Registry
  const [customSections, setCustomSections] = useState([]);
  const [newSectionName, setNewSectionName] = useState('');

  // Referral Intel State
  const [referralRange, setReferralRange] = useState({ start: TODAY, end: TODAY });
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [patientMasterList, setPatientMasterList] = useState([]);
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [referralFilterMode, setReferralFilterMode] = useState('ALL'); // 'SINGLE', 'RANGE' or 'ALL'
  const [expandedReferrer, setExpandedReferrer] = useState(null);
  const [personnel, setPersonnel] = useState([]);
  const [referralIntelligence, setReferralIntelligence] = useState([]);
  const [allReferrers, setAllReferrers] = useState([]);
  const [referralLoading, setReferralLoading] = useState(false);
  const [personnelLoading, setPersonnelLoading] = useState(false);
  const [outlookData, setOutlookData] = useState(null);
  const [loadingOutlook, setLoadingOutlook] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [geoTab, setGeoTab] = useState('VILLAGE'); // 'VILLAGE' or 'DISTRICT'
  const [hoveredGeoItem, setHoveredGeoItem] = useState(null);
  const [referralSort, setReferralSort] = useState({ key: 'missions', direction: 'desc' });
  
  // Referral Payout State
  const [showExportOverlay, setShowExportOverlay] = useState(false);
  const [exportParams, setExportParams] = useState({ start: TODAY, end: TODAY, allTime: false });
  const [loading, setLoading] = useState(false);

  // Responsive layout detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const [servicePrices, setServicePrices] = useState([]);
  const [financialMatrix, setFinancialMatrix] = useState(null);
  const [billingSettings, setBillingSettings] = useState({ autoBill: false, currency: '₹' });
  const [isPriceDrawerOpen, setIsPriceDrawerOpen] = useState(false);
  const [editPrice, setEditPrice] = useState({ 
    modality: 'X-RAY', 
    serviceName: '', 
    amount: 0, 
    referralCutValue: 0,
    referralCutInput: 0
  });


  // Expense Mgmt State
  const [isExpenseDrawerOpen, setIsExpenseDrawerOpen] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [editExpense, setEditExpense] = useState({ 
    status: 'Paid'
  });

  // Prescription Architect State
  const [selectedPrescriptionDoctorId, setSelectedPrescriptionDoctorId] = useState('');
  const [doctorPrescriptionMap, setDoctorPrescriptionMap] = useState({}); // { docId: settings }
  
  const [prescriptionSettings, setPrescriptionSettings] = useState({
    headerMargin: 50,
    leftMargin: 20,
    rightMargin: 20,
    bottomMargin: 30,
    fontSize: 14,
    fontColor: '#1e293b',
    fontFamily: 'Inter',
    letterhead: null,
    overflowBackgroundMode: 'REUSE' // 'REUSE' or 'BLANK'
  });
  const [isPrescriptionSaving, setIsPrescriptionSaving] = useState(false);
  const [isProtocolLoading, setIsProtocolLoading] = useState(false);
  const [activeProtocolData, setActiveProtocolData] = useState(null);
  const [previewScale, setPreviewScale] = useState(0.8); // 80% default scale to fit screen
  const [numPdfPages, setNumPdfPages] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [isReferrerEditDrawerOpen, setIsReferrerEditDrawerOpen] = useState(false);
  const [editingReferrer, setEditingReferrer] = useState(null);
  const [isSavingReferrer, setIsSavingReferrer] = useState(false);

  const [isPatientEditDrawerOpen, setIsPatientEditDrawerOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  const [isSavingPatient, setIsSavingPatient] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);
  const [selectedLedgerRows, setSelectedLedgerRows] = useState([]);
  const toggleLedgerSelection = (id) => {
    setSelectedLedgerRows(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleExportLedger = (type) => {
    const selectedData = referralIntelligence.flatMap(r => r.patients).filter(p => selectedLedgerRows.includes(p.appointmentId || p.patientId));
    if (selectedData.length === 0) return;

    if (type === 'EXCEL') {
        let csv = "REFERRAL_ID,PATIENT,CONTACT,MODALITY,SERVICE,COMMISSION,STATUS,DATE\n";
        selectedData.forEach(p => {
            csv += `${p.patientIdentifier || 'N/A'},${p.name},${p.mobile},${p.modality},${p.service},${p.commissionAmount},${p.status},${p.registrationDate}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Referral_Ledger_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
    } else if (type === 'WHATSAPP') {
        let msg = `*REFERRAL CASE LEDGER REPORT*\n\n`;
        selectedData.forEach((p, i) => {
            msg += `${i+1}. *${p.name.toUpperCase()}* (${p.modality})\n   ID: ${p.patientIdentifier || 'N/A'}\n   Service: ${p.service}\n   Payout: ₹${p.commissionAmount}\n   Status: ${p.status}\n\n`;
        });
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }
  };

  const isAllLedgerSelected = (patients) => {
    return patients.length > 0 && patients.every(p => selectedLedgerRows.includes(p.appointmentId || p.patientId));
  };
  const toggleAllLedger = (patients) => {
    if (isAllLedgerSelected(patients)) {
      const ids = patients.map(p => p.appointmentId || p.patientId);
      setSelectedLedgerRows(prev => prev.filter(id => !ids.includes(id)));
    } else {
      const ids = patients.map(p => p.appointmentId || p.patientId);
      setSelectedLedgerRows(prev => [...new Set([...prev, ...ids])]);
    }
  };

  const handleExportMatrix = () => {
    if (!temporalMatrixData) return;
    
    // Headers with quotes to prevent breakage
    const headers = ["REFERRING SOURCE", ...temporalMatrixData.cols, "TOTAL PULL"];
    let csv = headers.map(h => `"${h}"`).join(",") + "\n";

    // Row data
    temporalMatrixData.rows.forEach(row => {
      const rowData = [
        `"${row.name || 'ANONYMOUS'}"`,
        ...temporalMatrixData.cols.map(c => row.counts[c] || 0),
        row.total
      ];
      csv += rowData.join(",") + "\n";
    });

    // Grand Totals Row
    if (temporalMatrixData.rows.length > 0) {
      const colTotals = temporalMatrixData.cols.map(c => 
        temporalMatrixData.rows.reduce((sum, r) => sum + (r.counts[c] || 0), 0)
      );
      const grandTotal = temporalMatrixData.rows.reduce((sum, r) => sum + r.total, 0);
      
      const footerData = [
        `"GRAND TOTAL"`,
        ...colTotals,
        grandTotal
      ];
      csv += footerData.join(",") + "\n";
    }
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Referral_Matrix_${matrixPeriod}_${matrixDateStr}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const handleExportRoster = () => {
    if (!caseLedgerList) return;
    let csv = "RANK,REFERRAL SOURCE,CONTACT,ADDRESS,TOTAL STUDIES,PAID COMMISSION,UNPAID COMMISSION,TOTAL REVENUE\n";
    caseLedgerList.forEach((s, i) => {
      csv += `${i+1},"${s.name}","${s.contact}","${s.address || ''}",${s.patients?.length || 0},${s.paidCommission || 0},${s.unpaidCommission || 0},${s.totalRevenue || 0}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Partner_Network_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  // Sync settings when doctor selection changes
  const fetchDoctorProtocol = useCallback(async (docId) => {
    if (!docId) {
      setPrescriptionSettings({
        headerMargin: 50, leftMargin: 20, rightMargin: 20, bottomMargin: 30,
        fontSize: 14, fontColor: '#1e293b', fontFamily: 'Inter', letterhead: null,
        letterheadFile: null, overflowBackgroundMode: 'REUSE'
      });
      setActiveProtocolData(null);
      return;
    }

    setIsProtocolLoading(true);
    try {
      const res = await apiClient.get(`/Prescription/${docId}`);
      if (res.data?.success && res.data?.data) {
        const data = res.data.data;
        setActiveProtocolData(data);
        const settings = {
          headerMargin: Number(data.headerMargin) || 50,
          leftMargin: Number(data.leftMargin) || 20,
          rightMargin: Number(data.rightMargin) || 20,
          bottomMargin: Number(data.bottomMargin) || 30,
          fontSize: Number(data.fontSize) || 14,
          fontColor: data.fontColor || '#1e293b',
          fontFamily: data.fontFamily || 'Inter',
          letterhead: data.letterheadBlobUrl || null,
          overflowBackgroundMode: data.overflowBackgroundMode || 'REUSE',
          letterheadFile: null
        };
        setPrescriptionSettings(settings);
        await nativeStorage.set(`1rad_cache_prescription_${docId}`, { data, settings });
      } else {
        setActiveProtocolData(null);
        setPrescriptionSettings({
          headerMargin: 50, leftMargin: 20, rightMargin: 20, bottomMargin: 30,
          fontSize: 14, fontColor: '#1e293b', fontFamily: 'Inter', letterhead: null,
          letterheadFile: null, overflowBackgroundMode: 'REUSE'
        });
      }
    } catch (err) {
      console.error("[PRESCRIPTION] Fetch failed, trying cache", err);
      const cached = await nativeStorage.get(`1rad_cache_prescription_${docId}`);
      if (cached) {
        setActiveProtocolData(cached.data);
        setPrescriptionSettings(cached.settings);
      } else {
        setActiveProtocolData(null);
      }
    } finally {
      setIsProtocolLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDoctorProtocol(selectedPrescriptionDoctorId);
  }, [selectedPrescriptionDoctorId, fetchDoctorProtocol]);


  const fetchFinancialMatrix = useCallback(async (startDate = null, endDate = null) => {
    try {
      setLoading(true);
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await apiClient.get('/finance/matrix', { params });
      setFinancialMatrix(res.data);
      await nativeStorage.set(`1rad_cache_finance_matrix_${startDate || 'all'}_${endDate || 'all'}`, res.data);
    } catch (err) {
      console.error('[FINANCE] Matrix fetch failed, trying cache', err);
      const cached = await nativeStorage.get(`1rad_cache_finance_matrix_${startDate || 'all'}_${endDate || 'all'}`);
      if (cached) setFinancialMatrix(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchServicePrices = useCallback(async () => {
    try {
      const res = await apiClient.get('/finance/registry');
      setServicePrices(res.data);
      await nativeStorage.set('1rad_cache_prices', res.data);
    } catch (err) {
      console.error('[FINANCE] Registry fetch failed, trying cache', err);
      const cached = await nativeStorage.get('1rad_cache_prices');
      if (cached) setServicePrices(cached);
    }
  }, []);

  const fetchExpenses = useCallback(async () => {
    try {
      const res = await apiClient.get('/finance/expenses');
      setExpenses(res.data);
      await nativeStorage.set('1rad_cache_expenses', res.data);
    } catch (err) {
      console.error('[FINANCE] Expenses fetch failed, trying cache', err);
      const cached = await nativeStorage.get('1rad_cache_expenses');
      if (cached) setExpenses(cached);
    }
  }, []);

  const [hospitalData, setHospitalData] = useState({
    hospitalName: '',
    hospitalAddress: '',
    gstin: '',
    registrationNumber: '',
    pan: '',
    nabhNumber: '',
    isAutoBillingEnabled: false,
    admin: null,          // { userId, fullName, email, mobile, role, status, registeredOn }
    registeredOn: '',
    status: 'Active',
  });
  const [mappedHospitals, setMappedHospitals] = useState([]);
  const [viewingHubId, setViewingHubId] = useState(null); // null = show list

  // UX Refinement: Auto-populate brand identity
  useEffect(() => {
    if (isChainDrawerOpen) {
      setNewChainData(prev => ({ 
        ...prev, 
        chainName: activeCenter?.groupName || activeCenter?.name || '',
        hospitalName: '' 
      }));
    }
  }, [isChainDrawerOpen, activeCenter?.id]);
  const [hospitalLoading, setHospitalLoading] = useState(false);
  const [savingHospital, setSavingHospital] = useState(false);
  const [hospitalMessage, setHospitalMessage] = useState({ type: '', text: '' });

  // --- API FETCHING ---
  const fetchPersonnel = useCallback(async () => {
    try {
      setPersonnelLoading(true);
      const res = await apiClient.get('/personnel');
      // Map PersonnelDto to frontend state
      const mapped = (res.data || []).map(p => ({
        id: p.userId,
        name: p.fullName || 'UNKNOWN_STAFF',
        email: p.email,
        mobile: p.mobile,
        roles: (p.roles || []).map(r => String(r).toLowerCase()),
        password: p.password,
        specialization: p.specialization,
        degree: p.degree,
        licenseNo: p.licenseNo,
        status: p.status,
        createdAt: p.createdAt
      }));
      setPersonnel(mapped);
      await nativeStorage.set('1rad_cache_personnel', mapped);
    } catch (err) {
      console.error('Personnel fetch failed, trying cache', err);
      const cached = await nativeStorage.get('1rad_cache_personnel');
      if (cached) setPersonnel(cached);
    } finally {
      setPersonnelLoading(false);
    }
  }, []);

  const fetchPatientMasterList = useCallback(async () => {
    try {
      setLoadingMaster(true);
      const params = referralFilterMode === 'ALL'
        ? { allTime: true, search: referralPatientsSearch }
        : {
            startDate: referralRange.start,
            endDate: referralFilterMode === 'SINGLE' ? referralRange.start : referralRange.end,
            search: referralPatientsSearch
          };
      const res = await apiClient.get('/patients', { params });
      setPatientMasterList(res.data);
      await nativeStorage.set(`1rad_cache_patient_master_${referralFilterMode}`, res.data);
    } catch (err) {
      console.error('[PATIENT MASTER] Fetch failed, trying cache', err);
      const cached = await nativeStorage.get(`1rad_cache_patient_master_${referralFilterMode}`);
      if (cached) setPatientMasterList(cached);
    } finally {
      setLoadingMaster(false);
    }
  }, [referralRange, referralFilterMode, referralPatientsSearch]);

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiClient.post('/appointments/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportResult(response.data);
      fetchReferralIntelligence();
      if (referralViewMode === 'PATIENTS') fetchPatientMasterList();
    } catch (error) {
      console.error('Import failed:', error);
      setImportResult({ successCount: 0, failureCount: 1, errors: ['Error: Could not connect to data source.'] });
    } finally {
      setIsImporting(false);
      e.target.value = ''; // Reset input
    }
  };

  const fetchHospitalData = useCallback(async (hubId) => {
    try {
      setHospitalLoading(true);
      const res = await apiClient.get(`/hospitals/${hubId}`);
      const r = res.data || {};
      // Read both camelCase (current API) and PascalCase (legacy fallback)
      // so the binding survives backend casing changes.
      const adminRaw = r.admin || r.Admin || null;
      const admin = adminRaw ? {
        userId:       adminRaw.userId       || adminRaw.UserId       || null,
        fullName:     adminRaw.fullName     || adminRaw.FullName     || '—',
        email:        adminRaw.email        || adminRaw.Email        || '—',
        mobile:       adminRaw.mobile       || adminRaw.Mobile       || '—',
        role:         adminRaw.role         || adminRaw.Role         || 'Staff',
        status:       adminRaw.status       || adminRaw.Status       || 'Unknown',
        registeredOn: adminRaw.registeredOn || adminRaw.RegisteredOn || '',
      } : null;

      const data = {
        hospitalName:        r.hospitalName        || r.HospitalName        || r.name || r.Name || '',
        hospitalAddress:     r.hospitalAddress     || r.HospitalAddress     || r.address || r.Address || '',
        gstin:               r.gstin               || r.GSTIN               || '',
        registrationNumber:  r.registrationNumber  || r.RegistrationNumber  || '',
        pan:                 r.pan                 || r.PAN                 || '',
        nabhNumber:          r.nabhNumber          || r.NABHNumber          || '',
        isAutoBillingEnabled: r.isAutoBillingEnabled || r.IsAutoBillingEnabled || false,
        admin,
        registeredOn:        r.registeredOn        || r.RegisteredOn        || '',
        status:              r.status              || r.Status              || 'Active',
      };
      setHospitalData(data);
      setViewingHubId(hubId);
      await nativeStorage.set(`1rad_cache_hospital_${hubId}`, data);
    } catch (err) {
      console.error('[HOSPITAL] Fetch failed, trying cache', err);
      const cached = await nativeStorage.get(`1rad_cache_hospital_${hubId}`);
      if (cached) {
        setHospitalData(cached);
        setViewingHubId(hubId);
      }
    } finally {
      setHospitalLoading(false);
    }
  }, []);

  const fetchMappedHospitals = useCallback(async () => {
    try {
      setHospitalLoading(true);
      // Fetch metadata for the hubs in the current context's group
      const res = await apiClient.get('/hospitals/group');
      const groupMetas = Array.isArray(res.data) ? res.data : [];

      // Merge with the total authorized centers list to ensure universal visibility
      const mapped = centers.map(c => {
        const meta = groupMetas.find(m => (m.hospitalId || m.HospitalId) === c.id);
        return {
          hospitalId: c.id,
          hospitalName: meta?.hospitalName || meta?.HospitalName || c.name,
          hospitalAddress: meta?.hospitalAddress || meta?.HospitalAddress || 'Institutional routing active; address metadata pending sync.',
          gstin: meta?.gstin || meta?.GSTIN || '',
          registrationNumber: meta?.registrationNumber || meta?.RegistrationNumber || '',
          pan: meta?.pan || meta?.PAN || '',
          nabhNumber: meta?.nabhNumber || meta?.NABHNumber || '',
          status: meta?.status || meta?.Status || 'active',
          groupId: c.groupId || '',
          groupName: c.groupName || ''
        };
      });
      setMappedHospitals(mapped);
      await nativeStorage.set('1rad_cache_hospitals_group', mapped);
    } catch (err) {
      console.error('[HUB REGISTRY] Sync failed, trying cache', err);
      const cached = await nativeStorage.get('1rad_cache_hospitals_group');
      if (cached) {
        setMappedHospitals(cached);
      } else {
        // Ultimate fallback: use basic center info if API and cache fail
        setMappedHospitals(centers.map(c => ({
          hospitalId: c.id,
          hospitalName: c.name,
          hospitalAddress: 'Offline routing active.',
          status: 'active'
        })));
      }
    } finally {
      setHospitalLoading(false);
    }
  }, [centers]);

  const fetchReferralIntelligence = useCallback(async (startDate = null, endDate = null, allTime = false) => {
    try {
      setReferralLoading(true);
      const params = allTime
        ? { allTime: true }
        : {
            startDate: startDate || referralRange.start,
            endDate: endDate || (referralFilterMode === 'SINGLE' ? referralRange.start : referralRange.end)
          };
      const res = await apiClient.get('/referrers/intelligence', { params });
      setReferralIntelligence(res.data);
      await nativeStorage.set(`1rad_cache_referral_intel_${startDate || 'default'}_${endDate || 'default'}`, res.data);

      const allRes = await apiClient.get('/referrers');
      setAllReferrers(allRes.data || []);
      await nativeStorage.set('1rad_cache_all_referrers', allRes.data || []);
    } catch (err) {
      console.error('[REFERRAL INTEL] Fetch failed, trying cache', err);
      const cached = await nativeStorage.get(`1rad_cache_referral_intel_${startDate || 'default'}_${endDate || 'default'}`);
      if (cached) setReferralIntelligence(cached);

      const cachedAll = await nativeStorage.get('1rad_cache_all_referrers');
      if (cachedAll) setAllReferrers(cachedAll);
    } finally {
      setReferralLoading(false);
    }
  }, [referralRange, referralFilterMode]);

  const handleUpdateReferrer = async (e) => {
    e.preventDefault();
    if (!editingReferrer) return;

    // Validate and sanitize Indian Mobile number (10 digits starting with 6-9)
    let rawContact = (editingReferrer.contact || '').trim();
    let digits = rawContact.replace(/\D/g, '');
    if (digits.startsWith('91') && digits.length === 12) {
      digits = digits.substring(2);
    } else if (digits.startsWith('0') && digits.length === 11) {
      digits = digits.substring(1);
    }

    if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
      alert('Error: Please enter a valid 10-digit Indian mobile number (e.g., 9876543210).');
      return;
    }

    try {
      setIsSavingReferrer(true);
      if (editingReferrer.referrerId) {
        await apiClient.put(`/referrers/${editingReferrer.referrerId}`, {
          referrerId: editingReferrer.referrerId,
          name: editingReferrer.name,
          contact: digits,
          address: editingReferrer.address
        });
      } else {
        await apiClient.post('/referrers', {
          name: editingReferrer.name,
          contact: digits,
          address: editingReferrer.address
        });
      }
      
      // Refresh data
      fetchReferralIntelligence();
      setIsReferrerEditDrawerOpen(false);
      setEditingReferrer(null);
    } catch (err) {
      console.error('[REFERRER] Save failed', err);
      const backendError = err.response?.data?.error || err.response?.data?.message;
      alert(backendError ? `Error: ${backendError}` : 'Error: Could not save partner details.');
    } finally {
      setIsSavingReferrer(false);
    }
  };

  const handleUpdatePatient = async (e) => {
    e.preventDefault();
    if (!editingPatient) return;

    try {
      setIsSavingPatient(true);
      await apiClient.put(`/patients/${editingPatient.patientId}`, {
        patientId: editingPatient.patientId,
        fullName: editingPatient.fullName,
        mobile: editingPatient.mobile,
        age: editingPatient.age,
        gender: editingPatient.gender,
        village: editingPatient.village,
        district: editingPatient.district,
        address: editingPatient.address,
        sourceOfInfo: editingPatient.sourceOfInfo
      });
      
      // Refresh data
      fetchReferralIntelligence();
      setIsPatientEditDrawerOpen(false);
      setEditingPatient(null);
    } catch (err) {
      console.error('[PATIENT] Update failed', err);
      alert('Error: Could not save patient details.');
    } finally {
      setIsSavingPatient(false);
    }
  };

  // --- DOMAIN SYNCHRONIZATION ---
  
  // Personnel & Prescription
  useEffect(() => {
    if (activeTab === 'Staff' || activeTab === 'Letterhead') {
      fetchPersonnel();
    }
  }, [activeTab, fetchPersonnel]);

  // Referral Intelligence
  useEffect(() => {
    if (activeTab === 'Referrals') {
      fetchReferralIntelligence();
    }
  }, [activeTab, fetchReferralIntelligence]);

  // Patient Master List
  useEffect(() => {
    if (activeTab === 'Referrals' && referralViewMode === 'PATIENTS') {
      fetchPatientMasterList();
    }
  }, [activeTab, referralViewMode, fetchPatientMasterList]);

  // Hospital Infrastructure
  useEffect(() => {
    if (activeTab === 'Hospitals') {
      fetchMappedHospitals();
    }
  }, [activeTab, fetchMappedHospitals]);

  // Financial Ledger
  useEffect(() => {
    if (activeTab === 'Finance') {
      fetchServicePrices();
      fetchFinancialMatrix();
      fetchExpenses();
    }
  }, [activeTab, fetchServicePrices, fetchFinancialMatrix, fetchExpenses]);

  const fetchStrategicOutlook = useCallback(async (dateString = null, startDate = null, endDate = null) => {
    try {
      setLoadingOutlook(true);
      const params = {};
      if (dateString) params.referenceDate = dateString;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      
      const cacheKey = `1rad_cache_outlook_${dateString || 'default'}_${startDate || 'all'}_${endDate || 'all'}`;
      const res = await apiClient.get('/intelligence/outlook', { params });
      setOutlookData(res.data);
      await nativeStorage.set(cacheKey, res.data);
    } catch (err) {
      console.error('Tactical Insight Failure, trying cache:', err);
      const cacheKey = `1rad_cache_outlook_${dateString || 'default'}_${startDate || 'all'}_${endDate || 'all'}`;
      const cached = await nativeStorage.get(cacheKey);
      if (cached) setOutlookData(cached);
    } finally {
      setLoadingOutlook(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'Overview') {
       const { start, end } = getOverviewDates(overviewTimeframe);
       fetchStrategicOutlook(TODAY, start, end);
       fetchFinancialMatrix(start, end);
       fetchReferralIntelligence(start, end, overviewTimeframe === 'ALL');
    }
  }, [activeTab, overviewTimeframe, fetchStrategicOutlook, fetchFinancialMatrix, fetchReferralIntelligence]);




  const handleExportIntelligence = async () => {
    try {
      setIsExporting(true);
      const params = exportParams.allTime ? { allTime: true } : { startDate: exportParams.start, endDate: exportParams.end };
      const response = await apiClient.get('/intelligence/export', {
        params,
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `1Rad_Intelligence_${exportParams.start}_to_${exportParams.end}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      setShowExportOverlay(false);
    } catch (err) {
      console.error('Export Failed:', err);
      alert('Error: Could not export data.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSwitchNode = async (id) => {
    if (id === activeCenter?.id) return;
    try {
      setIsSwitchingNode(true);
      setShowChainSelector(false);
      const result = await switchCenter(id);
      if (result?.success) {
        // Clear local data to force re-sync
        setOutlookData(null);
        setReferralIntelligence([]);
        setPersonnel([]);
        
        // Success feedback handled by effect dependency on activeCenter
      }
    } catch (err) {
      console.error('Node Transition Failed:', err);
    } finally {
      // Small artificial delay for smooth transition feel
      setTimeout(() => setIsSwitchingNode(false), 800);
    }
  };

  const handleDeployChain = async (e) => {
    e.preventDefault();
    const payload = newChainData;

    if (!isOnline) {
      await addToOutbox('CHAIN_DEPLOY', payload);
      alert('OFFLINE_MODE: Institutional expansion protocol queued for sync.');
      setIsChainDrawerOpen(false);
      return;
    }

    try {
      setIsDeployingChain(true);
      const res = await apiClient.post('/hospitals/chain', payload);
      
      if (res.data.success) {
        setIsChainDrawerOpen(false);
        setNewChainData({ chainName: '', hospitalName: '', hospitalAddress: '' });
        
        // Use standard transition logic
        await handleSwitchNode(res.data.hospitalId);
      }
    } catch (err) {
      console.error('Chain Deployment Failure:', err);
      if (!err.response) {
        await addToOutbox('CHAIN_DEPLOY', payload);
        alert('NETWORK_ERROR: Chain deployment added to offline outbox.');
        setIsChainDrawerOpen(false);
      } else {
        alert(err.response?.data?.message || 'DEPLOYMENT FAILURE: Institutional expansion protocol failed.');
      }
    } finally {
      setIsDeployingChain(false);
    }
  };

  const getStatusConfig = (status) => {
    const s = status?.toUpperCase() || 'UNKNOWN';
    if (s.includes('COMPLETED')) return { bg: '#ecfdf5', color: '#059669', label: 'COMPLETED' };
    if (s.includes('CANCEL')) return { bg: '#fef2f2', color: '#dc2626', label: 'CANCELLED' };
    if (s.includes('PROGRESS')) return { bg: '#eff6ff', color: '#2563eb', label: 'IN PROGRESS' };
    if (s.includes('ARRIVE')) return { bg: '#fff7ed', color: '#ea580c', label: 'ARRIVED' };
    return { bg: '#f8fafc', color: '#64748b', label: s };
  };


  const handleSaveHospital = async (e) => {
    e.preventDefault();
    const targetHubId = viewingHubId || activeCenter?.id;
    if (!targetHubId) return;

    const payload = {
      hospitalName: hospitalData.hospitalName,
      hospitalAddress: hospitalData.hospitalAddress,
      gstin: hospitalData.gstin,
      registrationNumber: hospitalData.registrationNumber,
      pan: hospitalData.pan,
      nabhNumber: hospitalData.nabhNumber
    };

    if (!isOnline) {
      await addToOutbox('HOSPITAL_UPDATE', { id: targetHubId, ...payload });
      alert('OFFLINE_MODE: Institutional node metadata queued for sync.');
      setIsHospitalDrawerOpen(false);
      return;
    }

    try {
      setSavingHospital(true);
      setHospitalMessage({ type: '', text: '' });
      
      await apiClient.put(`/hospitals/${targetHubId}`, payload);
      setHospitalMessage({ type: 'success', text: 'METADATA RE-SYNCED: Hub configuration updated successfully.' });
      
      // Refresh the registry and current view
      fetchMappedHospitals();
      fetchHospitalData(targetHubId);

      setTimeout(() => {
        setIsHospitalDrawerOpen(false);
        setHospitalMessage({ type: '', text: '' });
      }, 2000);
    } catch (err) {
      console.error('[HOSPITAL] Save failed', err);
      if (!err.response) {
        await addToOutbox('HOSPITAL_UPDATE', { id: targetHubId, ...payload });
        alert('NETWORK_ERROR: Hub configuration added to offline outbox.');
        setIsHospitalDrawerOpen(false);
      } else {
        setHospitalMessage({ type: 'error', text: err.response?.data?.message || 'DEPLOYMENT FAILURE: Failed to update institutional node metadata.' });
      }
    } finally {
      setSavingHospital(false);
    }
  };

  const handleToggleAutoBill = async () => {
    const newAutoBill = !billingSettings.autoBill;
    const targetHubId = activeCenter?.id;
    if (!targetHubId) return;

    const payload = {
      hospitalName: hospitalData.hospitalName || activeCenter.name,
      hospitalAddress: hospitalData.hospitalAddress || 'Metadata synchronization active.',
      gstin: hospitalData.gstin || '',
      registrationNumber: hospitalData.registrationNumber || '',
      pan: hospitalData.pan || '',
      nabhNumber: hospitalData.nabhNumber || '',
      isAutoBillingEnabled: newAutoBill
    };

    if (!isOnline) {
      await addToOutbox('HOSPITAL_UPDATE', { id: targetHubId, ...payload });
      alert(`OFFLINE_MODE: Billing protocol ${newAutoBill ? 'ENABLED' : 'DISABLED'} (Queued for sync).`);
      setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      return;
    }

    try {
      await apiClient.put(`/hospitals/${targetHubId}`, payload);
      setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      setHospitalData(prev => ({ ...prev, isAutoBillingEnabled: newAutoBill }));
      await refreshCenters();
    } catch (err) {
      console.error('[FINANCE] Protocol update failed', err);
      if (!err.response) {
        await addToOutbox('HOSPITAL_UPDATE', { id: targetHubId, ...payload });
        alert('NETWORK_ERROR: Billing protocol added to offline outbox.');
        setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      } else {
        alert('Error: Failed to save billing settings. Please check your connection.');
      }
    }
  };

  useEffect(() => {
    if (activeCenter?.id) {
      const loadActiveCenterDetails = async () => {
        try {
          const res = await apiClient.get(`/hospitals/${activeCenter.id}`);
          const data = {
            hospitalName: res.data.hospitalName || res.data.HospitalName || '',
            hospitalAddress: res.data.hospitalAddress || res.data.HospitalAddress || '',
            gstin: res.data.gstin || res.data.GSTIN || '',
            registrationNumber: res.data.registrationNumber || res.data.RegistrationNumber || '',
            pan: res.data.pan || res.data.PAN || '',
            nabhNumber: res.data.nabhNumber || res.data.NABHNumber || '',
            isAutoBillingEnabled: res.data.isAutoBillingEnabled || res.data.IsAutoBillingEnabled || false
          };
          setHospitalData(data);
          setBillingSettings(prev => ({
            ...prev,
            autoBill: data.isAutoBillingEnabled
          }));
        } catch (err) {
          console.error('[HOSPITAL] Failed to fetch active center details', err);
          setBillingSettings(prev => ({
            ...prev,
            autoBill: activeCenter.isAutoBillingEnabled || false
          }));
        }
      };
      loadActiveCenterDetails();
    }
  }, [activeCenter?.id]);

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


  const [systemProtocols, setSystemProtocols] = useState({ 
    aiAssisted: true, 
    cloudArchival: true, 
    multiCenterSync: false,
    auditLogging: true
  });

  const filteredPersonnel = useMemo(() => {
    if (!personnelSearch.trim()) return personnel;
    const query = personnelSearch.toLowerCase();
    return personnel.filter(u => 
      u.name.toLowerCase().includes(query) || 
      u.email.toLowerCase().includes(query) || 
      (u.roles && u.roles.some(r => r.toLowerCase().includes(query)))
    );
  }, [personnel, personnelSearch]);

  // --- DERIVED DATA ---
  const dynamicReferralStats = useMemo(() => {
    let dailyEvents = REFERRAL_LOG.filter(log => log.date === selectedDateFilter);
    if (referrerFilter !== 'ALL') {
      dailyEvents = dailyEvents.filter(log => log.referredBy === referrerFilter);
    }
    const total = dailyEvents.length;
    const aggregated = dailyEvents.reduce((acc, current) => {
      acc[current.referredBy] = (acc[current.referredBy] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(aggregated)
      .map(([name, count]) => ({
        name,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }, [selectedDateFilter, referrerFilter]);

  const topReferrerName = dynamicReferralStats.length > 0 ? dynamicReferralStats[0].name : 'N/A';

  // Referral Intelligence Logic (Moved to top-level to satisfy Rules of Hooks)
  const temporalPatients = useMemo(() => {
    // Flatten all patients from grouped intelligence data
    const allPatients = referralIntelligence.flatMap(ref => 
      ref.patients.map(p => ({
        ...p,
        referredBy: p.referrerName || ref.name,
        sourceContact: ref.contact,
        sourceAddress: ref.address,
        registered: p.registrationDate // Alias for consistency
      }))
    );

    if (referralViewMode === 'LOG' && referralLogSearch) {
      const searchLow = referralLogSearch.toLowerCase();
      return allPatients.filter(p => {
        const sourceMatch = (p.referredBy || '').toLowerCase().includes(searchLow);
        const patientMatch = (p.name || '').toLowerCase().includes(searchLow);
        return sourceMatch || patientMatch;
      });
    }

    return allPatients;
  }, [referralIntelligence, referralLogSearch, referralViewMode]);

  const caseLedgerList = useMemo(() => {
    const safeAll = allReferrers || [];
    const safeIntel = referralIntelligence || [];

    return safeAll.map(ref => {
      const intel = safeIntel.find(i => i.referrerId === ref.referrerId);
      return {
        referrerId: ref.referrerId,
        name: ref.name,
        contact: ref.contact,
        address: ref.address,
        hasSentPatients: !!intel && intel.totalPatients > 0,
        patientCount: intel ? intel.totalPatients : 0,
        totalRevenue: intel ? intel.totalRevenue : 0,
        totalDiscount: intel ? intel.totalDiscount : 0,
        totalCommission: intel ? intel.totalCommission : 0,
        paidCommission: intel ? intel.paidCommission : 0,
        unpaidCommission: intel ? intel.unpaidCommission : 0,
        netProfit: intel ? intel.netProfit : 0,
        patients: intel ? intel.patients : []
      };
    }).sort((a, b) => {
      if (a.hasSentPatients && !b.hasSentPatients) return -1;
      if (!a.hasSentPatients && b.hasSentPatients) return 1;
      return b.patientCount - a.patientCount;
    });
  }, [allReferrers, referralIntelligence]);

  const filteredCaseLedger = useMemo(() => {
    if (!referralLogSearch) return caseLedgerList;
    const searchLow = referralLogSearch.toLowerCase();
    return caseLedgerList.filter(item => 
      (item.name || '').toLowerCase().includes(searchLow) ||
      (item.contact || '').toLowerCase().includes(searchLow) ||
      (item.address || '').toLowerCase().includes(searchLow)
    );
  }, [caseLedgerList, referralLogSearch]);

  const referralAggregated = useMemo(() => {
    // Map the backend intelligence DTOs to the frontend's expected Matrix structure
    const mapped = referralIntelligence.map(ref => {
      // Calculate modality breakdown for each referrer
      const modalities = ref.patients.reduce((acc, p) => {
        const mod = p.modality || 'OTHER';
        acc[mod] = (acc[mod] || 0) + 1;
        return acc;
      }, {});

      return {
        referrerId: ref.referrerId,
        name: ref.name,
        contact: ref.contact,
        address: ref.address,
        patients: ref.patients,
        modalities,
        totalCommission: ref.totalCommission,
        paidCommission: ref.paidCommission,
        unpaidCommission: ref.unpaidCommission,
        totalRevenue: ref.totalRevenue,
        netProfit: ref.netProfit
      };
    });

    let final = [...mapped];
    
    // Sort logic
    final.sort((a, b) => {
      let valA, valB;
      if (referralSort.key === 'missions') { valA = a.patients.length; valB = b.patients.length; }
      else if (referralSort.key === 'yield') { valA = a.totalCommission; valB = b.totalCommission; }
      else if (referralSort.key === 'pending') { valA = a.unpaidCommission; valB = b.unpaidCommission; }
      else { valA = a.name; valB = b.name; }

      if (referralSort.direction === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });

    if (!referralMatrixSearch) return final;

    const searchLow = referralMatrixSearch.toLowerCase();
    return final.filter(ref => ref.name.toLowerCase().includes(searchLow));
  }, [referralIntelligence, referralViewMode, referralMatrixSearch, referralSort]);

  // Auto-select first referrer in Matrix mode
  useEffect(() => {
    if (referralViewMode === 'MATRIX' && referralAggregated.length > 0 && !expandedReferrer) {
      setExpandedReferrer(referralAggregated[0].name);
    }
  }, [referralViewMode, referralAggregated, expandedReferrer]);

  const temporalMatrixData = useMemo(() => {
    if (referralViewMode !== 'LOG') return null;
    
    let cols = [];
    let getColKey = () => "";
    
    const dStr = matrixDateStr || TODAY;
    const year = parseInt(dStr.substring(0, 4), 10);
    const month = parseInt(dStr.substring(5, 7), 10) - 1; // 0-11
    
    if (matrixPeriod === 'DAY') {
      cols = ['Morning (12am-12pm)', 'Afternoon (12pm-5pm)', 'Evening (5pm-12am)'];
      getColKey = (pStr) => {
        if (!pStr.startsWith(dStr.substring(0,10))) return null;
        const d = new Date(pStr);
        const h = d.getHours();
        if (h < 12) return cols[0];
        if (h < 17) return cols[1];
        return cols[2];
      };
    } else if (matrixPeriod === 'WEEK') {
      const startDay = (matrixWeekIndex - 1) * 7 + 1;
      const endDay = matrixWeekIndex === 4 ? new Date(year, month + 1, 0).getDate() : startDay + 6;
      
      for (let i = startDay; i <= endDay; i++) {
        const d = new Date(year, month, i);
        cols.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
      }
      
      getColKey = (pStr) => {
        const d = new Date(pStr);
        if (d.getFullYear() === year && d.getMonth() === month && d.getDate() >= startDay && d.getDate() <= endDay) {
           return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        }
        return null;
      };
    } else if (matrixPeriod === 'MONTH') {
      cols = ['Week 1 (1st-7th)', 'Week 2 (8th-14th)', 'Week 3 (15th-21st)', 'Week 4 (22nd-End)'];
      getColKey = (pStr) => {
        const d = new Date(pStr);
        if (d.getFullYear() === year && d.getMonth() === month) {
           const dt = d.getDate();
           if (dt <= 7) return cols[0];
           if (dt <= 14) return cols[1];
           if (dt <= 21) return cols[2];
           return cols[3];
        }
        return null;
      };
    } else if (matrixPeriod === 'YEAR') {
      cols = Array.from({length: 12}).map((_, i) => {
        const d = new Date(year, i, 1);
        return d.toLocaleDateString('en-US', { month: 'short' });
      });
      getColKey = (pStr) => {
        const d = new Date(pStr);
        if (d.getFullYear() === year) {
           return d.toLocaleDateString('en-US', { month: 'short' });
        }
        return null;
      };
    }

    const searchLow = (referralLogSearch || '').toLowerCase();
    const rows = allReferrers
      .filter(ref => !searchLow || (ref.name || '').toLowerCase().includes(searchLow))
      .map(ref => {
        const counts = {};
        cols.forEach(c => counts[c] = 0);
        let totalMatched = 0;
        const intel = referralIntelligence.find(i => i.referrerId === ref.referrerId || i.name === ref.name);
        const patientsList = intel ? (intel.patients || []) : [];

        patientsList.forEach(p => {
           const pStr = p.registrationDate || p.date || TODAY;
           const key = getColKey(pStr);
           if (key && counts[key] !== undefined) {
              counts[key]++;
              totalMatched++;
           }
        });
        return {
          name: ref.name,
          contact: ref.contact,
          total: totalMatched,
          counts
        };
      })
      .sort((a, b) => b.total - a.total);

    return { cols, rows };
  }, [allReferrers, referralIntelligence, referralViewMode, matrixPeriod, matrixDateStr, matrixWeekIndex, referralLogSearch]);

  const handleDeleteUser = async (id) => {
    if (id === currentUser.id) {
      alert('SECURITY PROTOCOL: Self-decommissioning blocked. You cannot remove your own deployment from this hub to prevent lockout.');
      return;
    }
    // Now handled by modal confirmation without window.confirm check:
    {
      if (!isOnline) {
        await addToOutbox('PERSONNEL_DELETE', { id });
        alert('OFFLINE_MODE: Personnel decommissioning queued for sync.');
        setPersonnel(prev => prev.filter(u => u.id !== id)); // Optimistic UI
        return;
      }

      try {
        await apiClient.delete(`/personnel/${id}`);
        fetchPersonnel();
      } catch (err) {
        console.error('[PERSONNEL] Delete failed', err);
        if (!err.response) {
          await addToOutbox('PERSONNEL_DELETE', { id });
          alert('NETWORK_ERROR: Decommissioning added to offline outbox.');
          setPersonnel(prev => prev.filter(u => u.id !== id)); // Optimistic UI
        } else {
          alert(err.response?.data?.message || 'Failed to remove personnel.');
        }
      }
    }
  };

  const handleCopyCredentials = (user) => {
    const text = `1Rad Clinical Hub Access\nLogin ID: ${user.email}\nSecurity Key: ${user.password || '[Hidden]'}\nHub URL: ${window.location.origin}`;
    navigator.clipboard.writeText(text);
    setCopyFeedback(user.id);
    setTimeout(() => setCopyFeedback(''), 3000);
  };

  const handleWhatsAppShare = (user) => {
    const message = `Hello ${user.name},\n\nYour 1Rad Clinical Hub credentials have been initialized.\n\n🌐 Hub URL: ${window.location.origin}\n🔑 Login ID: ${user.email}\n🛡️ Security Key: ${user.password || '[Please use the reset link if unknown]'}\n\nPlease maintain strict confidentiality of these credentials.`;
    const encoded = encodeURIComponent(message);
    const mobile = user.mobile?.replace(/\D/g, ''); // Ensure only numbers
    const finalMobile = mobile?.length === 10 ? `91${mobile}` : mobile; // Default to India if 10 digits
    window.open(`https://wa.me/${finalMobile}?text=${encoded}`, '_blank');
  };

  const handleOpenUserDrawer = (user = null) => {
    setEditUser(user ? { ...user, roles: user.roles || [] } : { 
      name: '', 
      email: '', 
      password: '', 
      confirmPassword: '',
      roles: [], 
      status: 'active',
      specialization: '',
      degree: '',
      licenseNo: '',
      mobile: ''
    });
    setUserRegStep(1);
    setIsUserDrawerOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    
    const isDoctorRole = editUser.roles.some(r => r.toLowerCase().includes('doctor'));
    
    // Surcharge check for NEW doctors
    if (!editUser.id && isDoctorRole) {
      const confirmSurcharge = window.confirm(
        "PROTOCOL ALERT: Adding a new doctor seat will increase your monthly subscription overhead by ₹1,000.\n\nDo you want to authorize this expansion?"
      );
      if (!confirmSurcharge) return;
    }

    if (!editUser.roles || editUser.roles.length === 0) {
      alert("System Protocol Error: At least one clinical or administrative role must be assigned.");
      return;
    }

    const payload = {
      fullName: editUser.name,
      email: editUser.email,
      mobile: editUser.mobile,
      password: editUser.password,
      roleNames: editUser.roles, // Backend expects roleNames
      specialization: editUser.specialization,
      degree: editUser.degree,
      licenseNo: editUser.licenseNo
    };

    if (!isOnline) {
      const type = editUser.id ? 'PERSONNEL_UPDATE' : 'PERSONNEL_CREATE';
      await addToOutbox(type, { id: editUser.id, ...payload });
      alert(`OFFLINE_MODE: Personnel ${editUser.id ? 'update' : 'registration'} queued for sync.`);
      setIsUserDrawerOpen(false);
      return;
    }

    try {
      if (editUser.id) {
        await apiClient.put(`/personnel/${editUser.id}`, payload);
      } else {
        await apiClient.post('/personnel', payload);
      }

      setIsUserDrawerOpen(false);
      fetchPersonnel();
    } catch (err) {
      console.error('[PERSONNEL] Save failed', err);
      if (!err.response) {
        const type = editUser.id ? 'PERSONNEL_UPDATE' : 'PERSONNEL_CREATE';
        await addToOutbox(type, { id: editUser.id, ...payload });
        alert('NETWORK_ERROR: Staff record added to offline outbox.');
        setIsUserDrawerOpen(false);
      } else {
        alert(err.response?.data?.message || 'Failed to save staff record.');
      }
    }
  };

  const handleOpenLayoutDrawer = (layout = null) => {
    if (!layout) {
      setEditLayout({ name: '', modality: 'X-RAY', type: '', active: true, selectedSections: ['findings', 'impression'] });
    } else {
      const allAvailable = [...SECTIONS_POOL, ...customSections];
      const sectionIds = (layout.sections || []).map(name => allAvailable.find(p => p.name === name)?.id).filter(Boolean);
      setEditLayout({ ...layout, selectedSections: sectionIds });
    }
    setIsLayoutDrawerOpen(true);
  };

  const handleSaveLayout = () => {
    const allAvailable = [...SECTIONS_POOL, ...customSections];
    const sectionNames = editLayout.selectedSections.map(sid => allAvailable.find(p => p.id === sid)?.name).filter(Boolean);
    if (editLayout.id) {
       setLayouts(layouts.map(l => l.id === editLayout.id ? { ...editLayout, sections: sectionNames } : l));
    } else {
       setLayouts([...layouts, { ...editLayout, id: `L${Date.now()}`, sections: sectionNames }]);
    }
    setIsLayoutDrawerOpen(false);
  };

  const handleAddCustomSection = () => {
    if (!newSectionName.trim()) return;
    const newId = `custom_${Date.now()}`;
    const newSec = { id: newId, name: newSectionName.trim() };
    setCustomSections([...customSections, newSec]);
    setEditLayout(prev => ({ ...prev, selectedSections: [...prev.selectedSections, newId] }));
    setNewSectionName('');
  };

  const handleDeleteLayout = (id) => {
    if (window.confirm('Are you sure you want to permanently delete this reporting protocol? This action cannot be undone.')) {
       setLayouts(layouts.filter(l => l.id !== id));
    }
  };

  const renderPatients = () => (
    <div className="patients-view">
        <div className="board-header" style={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'flex-start' : 'center', 
          marginBottom: '30px',
          gap: '20px'
        }}>
          <div>
             <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', color: '#888', marginBottom: '5px' }}>Global Patient Registry</h2>
             <p style={{ fontSize: '11px', color: '#aaa' }}>Comprehensive oversight of all center-registered diagnostic targets.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '15px', width: isMobile ? '100%' : 'auto' }}>
             <div className="search-input-group" style={{ width: isMobile ? '100%' : '300px' }}>
                <input 
                   type="text" 
                   placeholder="Universal Search..." 
                   value={patientSearch}
                   onChange={e => setPatientSearch(e.target.value)}
                   style={{ borderRadius: '8px' }}
                />
             </div>
             <button className="btn-primary" style={{ width: isMobile ? '100%' : 'auto', background: '#2ecc71', fontSize: '11px', fontWeight: 900, padding: isMobile ? '14px 20px' : '0 20px' }}>EXPORT REGISTRY 📁</button>
          </div>
        </div>

       <div className="table-container">
          <table className="data-table">
             <thead>
                <tr>
                   <th>Registry ID</th>
                   <th>Full Name</th>
                   <th>Mobile Intelligence</th>
                   <th>Demographics</th>
                   <th>Territory</th>
                   <th>Referring Specialist</th>
                   <th>Registered</th>
                   <th>Actions</th>
                </tr>
             </thead>
             <tbody>
               {patients.filter(p => p.name.toLowerCase().includes(patientSearch.toLowerCase()) || p.id.includes(patientSearch)).map(p => (
                 <tr key={p.id}>
                    <td style={{ fontWeight: 800, color: '#0f52ba' }}>{p.id}</td>
                    <td style={{ fontWeight: 700 }}>{p.name.toUpperCase()}</td>
                    <td style={{ fontSize: '12px', opacity: 0.8 }}>+91 {p.mobile}</td>
                    <td><span className="file-badge" style={{ padding: '4px 8px' }}>{p.age}y / {p.gender}</span></td>
                    <td>{p.district.toUpperCase()}</td>
                    <td>{p.referredBy}</td>
                    <td><span style={{ fontSize: '11px', color: '#888' }}>{p.registered}</span></td>
                    <td>
                       <button className="btn-logout" style={{ padding: '4px 10px', fontSize: '10px' }}>VIEW HISTORY</button>
                    </td>
                 </tr>
               ))}
             </tbody>
          </table>
       </div>
    </div>
  );

  const toggleSection = (id) => {
    setEditLayout(prev => {
      const selected = prev.selectedSections.includes(id)
        ? prev.selectedSections.filter(sid => sid !== id)
        : [...prev.selectedSections, id];
      return { ...prev, selectedSections: selected };
    });
  };

  // --- PRICE MGMT ---
  const handleSavePrice = async (e) => {
      e.preventDefault();
      const payload = editPrice;
      
      if (!isOnline) {
        await addToOutbox('PRICE_UPDATE', payload);
        alert('OFFLINE_MODE: Service price update queued for sync.');
        setIsPriceDrawerOpen(false);
        return;
      }
  
      try {
        await apiClient.post('/finance/registry', payload);
        
        // Auto-generate a default reporting template for new services
        if (!payload.id) {
          try {
            await apiClient.post('/reporting/templates/upsert', {
                name: payload.serviceName,
                modality: payload.modality,
              content: `<p><strong>CLINICAL HISTORY:</strong></p><p><br></p><p><strong>TECHNIQUE:</strong></p><p>Routine protocol for ${payload.serviceName}.</p><p><br></p><p><strong>FINDINGS:</strong></p><p><br></p><p><strong>IMPRESSION:</strong></p><p><br></p>`
            });
          } catch (tplErr) {
            console.error('[FINANCE] Failed to auto-generate template for new service:', tplErr);
          }
        }

        setIsPriceDrawerOpen(false);
        fetchServicePrices();
      } catch (err) {
      console.error('[FINANCE] Save failed', err);
      if (!err.response) {
        await addToOutbox('PRICE_UPDATE', payload);
        alert('NETWORK_ERROR: Price update added to offline outbox.');
        setIsPriceDrawerOpen(false);
      }
    }
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    const payload = editExpense;

    if (!isOnline) {
      await addToOutbox('EXPENSE', payload);
      alert('OFFLINE_MODE: Operational expense queued for sync.');
      setIsExpenseDrawerOpen(false);
      return;
    }

    try {
      setSavingExpense(true);
      await apiClient.post('/finance/expense', payload);
      setIsExpenseDrawerOpen(false);
      setEditExpense({ 
        description: '', 
        category: 'Maintenance', 
        amount: 0, 
        taxAmount: 0,
        transactionDate: TODAY, 
        paymentMode: 'Cash', 
        referenceNumber: '',
        vendorName: '',
        costCenter: 'Radiology',
        status: 'Paid'
      });
      fetchFinancialMatrix(); // Refresh stats
      fetchExpenses(); // Refresh expense list
    } catch (err) {
      console.error('[FINANCE] Expense save failed', err);
      if (!err.response) {
        await addToOutbox('EXPENSE', payload);
        alert('NETWORK_ERROR: Expense added to offline outbox.');
        setIsExpenseDrawerOpen(false);
      } else {
        alert('Error: Failed to save expense.');
      }
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Are you sure you want to delete this operational expense?')) return;
    
    if (!isOnline) {
      await addToOutbox('EXPENSE_DELETE', { id });
      alert('OFFLINE_MODE: Operational expense deletion queued for sync.');
      setExpenses(prev => prev.filter(e => e.id !== id)); // Optimistic UI
      return;
    }

    try {
      await apiClient.delete(`/finance/expenses/${id}`);
      fetchExpenses();
      fetchFinancialMatrix();
    } catch (err) {
      console.error('[FINANCE] Failed to delete expense', err);
      if (!err.response) {
        await addToOutbox('EXPENSE_DELETE', { id });
        alert('NETWORK_ERROR: Deletion added to offline outbox.');
        setExpenses(prev => prev.filter(e => e.id !== id)); // Optimistic UI
      } else {
        alert('Error: Could not delete expense.');
      }
    }
  };

  const handleDeletePrice = async (id) => {
    if (window.confirm('Are you sure you want to delete this service charge?')) {
      if (!isOnline) {
        await addToOutbox('PRICE_DELETE', { id });
        alert('OFFLINE_MODE: Service charge deletion queued for sync.');
        setServicePrices(prev => prev.filter(p => p.id !== id)); // Optimistic UI
        return;
      }

      try {
        await apiClient.delete(`/finance/registry/${id}`);
        fetchServicePrices();
      } catch (err) {
        console.error('[FINANCE] Delete failed', err);
        if (!err.response) {
          await addToOutbox('PRICE_DELETE', { id });
          alert('NETWORK_ERROR: Deletion added to offline outbox.');
          setServicePrices(prev => prev.filter(p => p.id !== id)); // Optimistic UI
        }
      }
    }
  };


  // --- RENDERERS ---
  const renderDocumentation = () => {
    const doctors = (personnel || []).filter(u => u?.roles?.includes('doctor') || u?.roles?.includes('admindoctor'));
    const docId = selectedDocId || (doctors[0]?.id?.toString());
    const doc = personnel.find(u => u.id === docId);

    if (!doc) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>NO DOCTORS DETECTED ON ROSTER</div>;

    return (
      <>
        <div className="documentation-module">
          <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', background: 'white', padding: '15px 25px', borderRadius: '12px', border: '1px solid #dee2e6' }}>
            <div>
              <h2 style={{ fontSize: '11px', fontWeight: 950, textTransform: 'uppercase', color: '#0f52ba', marginBottom: '4px' }}>Clinical Report Branding</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <span style={{ fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}>{doc.name}</span>
              </div>
            </div>
            <select 
              value={docId} 
              onChange={e => setSelectedDocId(e.target.value)}
              style={{ padding: '8px', borderRadius: '8px', border: '2px solid #0f52ba', fontWeight: 700, minWidth: '220px', cursor: 'pointer' }}
            >
              {doctors.map(d => <option key={d.id} value={d.id}>{d.name} ({ROLE_LABELS[d.roles?.[0]]})</option>)}
            </select>
          </div>
        </div>

        <div style={{ padding: '40px', background: '#f8f9fa', borderRadius: '12px', border: '1px dashed #ccc', textAlign: 'center', color: '#888' }}>
             <div style={{ fontSize: '10px', fontWeight: 900, color: '#0f52ba', opacity: 0.1, marginBottom: '10px' }}>REPOSITORY</div>
             <div style={{ fontSize: '12px', fontWeight: 900 }}>REPORTING PROTOCOLS DEACTIVATED</div>
             <div style={{ fontSize: '10px' }}>Protocol branding and template management has been moved to the core configuration bay.</div>
          </div>
        </>
      );
    };

  const renderHospitalSettings = () => {
    if (viewingHubId) {
      return (
        <div className="hospital-settings-view">
          <div className="board-header" style={{ 
            display: 'flex', 
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between', 
            alignItems: isMobile ? 'flex-start' : 'center', 
            marginBottom: '25px',
            gap: '15px'
          }}>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
               <button 
                 onClick={() => setViewingHubId(null)}
                 style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#475569' }}
                 onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                 onMouseLeave={e => e.currentTarget.style.background = 'white'}
               >
                 Back
               </button>
               <div>
                 <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b', margin: 0 }}>Hospital Details</h2>
                 <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>View and manage hospital information</p>
               </div>
            </div>
            <button 
              onClick={() => setIsHospitalDrawerOpen(true)}
              style={{ 
                padding: '10px 20px', borderRadius: '10px', border: 'none', 
                background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)', 
                color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(10,22,40,0.2)'
              }}
            >
              Edit Details
            </button>
          </div>

          <div style={{ background: 'white', padding: '30px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.02)' }}>
            <div style={{ marginBottom: '30px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Hospital Name</div>
              <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: 0 }}>{hospitalData.hospitalName || 'Unnamed Hospital'}</h3>
              <div style={{ fontSize: '14px', color: '#475569', marginTop: '8px' }}>{hospitalData.hospitalAddress || 'No address provided'}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
              {[
                { label: 'GSTIN', value: hospitalData.gstin },
                { label: 'Registration Number', value: hospitalData.registrationNumber },
                { label: 'PAN', value: hospitalData.pan },
                { label: 'Accreditation (NABH)', value: hospitalData.nabhNumber }
              ].map(item => (
                <div key={item.label} style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>{item.label}</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{item.value || 'Not provided'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Administrator Information ─────────────────────────────
               Shows the primary admin user mapped to this hospital. The
               API picks the first user with an Admin-role (AdminDoctor,
               AdminOperator, etc.) and falls back to the first mapping. */}
          {hospitalData.admin ? (
            <div style={{
              background: 'white', padding: '30px', borderRadius: '16px',
              border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.02)',
              marginTop: '20px',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '20px',
              }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>
                    Administrator
                  </div>
                  <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    {hospitalData.admin.fullName}
                  </h3>
                </div>
                <span style={{
                  fontSize: '11px', fontWeight: 700,
                  color: hospitalData.admin.status?.toLowerCase() === 'active' ? '#16a34a' : '#dc2626',
                  background: hospitalData.admin.status?.toLowerCase() === 'active' ? '#dcfce7' : '#fee2e2',
                  padding: '5px 12px', borderRadius: '999px',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>
                  {hospitalData.admin.status}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                {[
                  { label: 'Email',         value: hospitalData.admin.email },
                  { label: 'Mobile',        value: hospitalData.admin.mobile },
                  { label: 'Role',          value: hospitalData.admin.role },
                  { label: 'Registered',    value: hospitalData.admin.registeredOn },
                ].map(item => (
                  <div key={item.label} style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>{item.label}</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', wordBreak: 'break-all' }}>{item.value || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              background: '#fffbeb', padding: '20px', borderRadius: '12px',
              border: '1px solid #fde68a', marginTop: '20px',
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '2px' }}>
                  No administrator assigned
                </div>
                <div style={{ fontSize: '12px', color: '#a16207' }}>
                  This hospital doesn't have a primary admin user mapped yet.
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="hospital-settings-view">
        <div className="board-header" style={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'flex-start' : 'center', 
          marginBottom: '25px',
          gap: '15px'
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b', margin: 0 }}>Hospital Board</h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Manage hospitals and centers in your network</p>
          </div>
        </div>

        {hospitalLoading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', fontSize: '14px', fontWeight: 600 }}>
             Loading hospitals...
          </div>
        ) : mappedHospitals.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
             <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', margin: 0 }}>No Hospitals Found</h3>
             <p style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>You don't have any mapped hospitals in your network.</p>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.02)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Hospital Name</th>
                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Group / Chain</th>
                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mappedHospitals.map((hub, idx) => {
                    const isActive = hub.hospitalId === activeCenter?.id;
                    return (
                      <tr key={hub.hospitalId} style={{ borderBottom: idx === mappedHospitals.length - 1 ? 'none' : '1px solid #f1f5f9', background: isActive ? '#f0fdf4' : 'transparent', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = isActive ? '#f0fdf4' : '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = isActive ? '#f0fdf4' : 'transparent'}>
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{hub.hospitalName}</div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>ID: {hub.hospitalId.split('-')[0].toUpperCase()}</div>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>
                            {hub.groupName || 'Independent'}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: hub.status === 'active' ? '#16a34a' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: hub.status === 'active' ? '#2ecc71' : '#cbd5e1' }}></span>
                            {(hub.status || 'Active').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                          <button 
                            onClick={() => fetchHospitalData(hub.hospitalId)}
                            style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#eff6ff', color: '#3b82f6', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; e.currentTarget.style.color = '#2563eb'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#3b82f6'; }}
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };



  const renderHospitalSettingsDrawer = () => (
    <div  onClick={() => setIsHospitalDrawerOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backdropFilter: 'blur(4px)', background: 'rgba(10, 22, 40, 0.45)', zIndex: 3001 }}>
      <div  style={{ position: 'absolute', right: 0, top: 0, height: '100%', padding: 0, width: isMobile ? '100%' : '420px', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(10,22,40,0.18)' }} onClick={e => e.stopPropagation()}>
        <div  style={{ background: `linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)`, color: 'white', padding: '22px 24px 20px', position: 'relative' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', color: '#d4a017', textTransform: 'uppercase', marginBottom: '4px' }}>Edit Details</div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, letterSpacing: '-0.2px' }}>Hospital Configuration</h3>
              </div>
              <button style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setIsHospitalDrawerOpen(false)}>&times;</button>
           </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
           {/* Admin info — read-only snapshot at the top of the drawer.
               Changes to the admin happen via the Personnel screen. */}
           {hospitalData.admin && (
             <div style={{
               background: 'linear-gradient(135deg, #f0f9ff 0%, #eff6ff 100%)',
               border: '1px solid #bfdbfe',
               borderRadius: '12px',
               padding: '16px',
               marginBottom: '22px',
             }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                 <div>
                   <div style={{ fontSize: '10px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '3px' }}>
                     Administrator
                   </div>
                   <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                     {hospitalData.admin.fullName}
                   </div>
                 </div>
                 <span style={{
                   fontSize: '10px', fontWeight: 700,
                   color: hospitalData.admin.status?.toLowerCase() === 'active' ? '#16a34a' : '#dc2626',
                   background: 'rgba(255,255,255,0.7)',
                   padding: '3px 10px', borderRadius: '999px',
                   textTransform: 'uppercase', letterSpacing: '0.5px',
                 }}>
                   {hospitalData.admin.status}
                 </span>
               </div>
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '12px' }}>
                 <div>
                   <div style={{ color: '#64748b', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>Email</div>
                   <div style={{ color: '#0f172a', fontWeight: 600, wordBreak: 'break-all' }}>{hospitalData.admin.email}</div>
                 </div>
                 <div>
                   <div style={{ color: '#64748b', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>Mobile</div>
                   <div style={{ color: '#0f172a', fontWeight: 600 }}>{hospitalData.admin.mobile}</div>
                 </div>
                 <div>
                   <div style={{ color: '#64748b', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>Role</div>
                   <div style={{ color: '#0f172a', fontWeight: 600 }}>{hospitalData.admin.role}</div>
                 </div>
                 <div>
                   <div style={{ color: '#64748b', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>Registered</div>
                   <div style={{ color: '#0f172a', fontWeight: 600 }}>{hospitalData.admin.registeredOn || '—'}</div>
                 </div>
               </div>
               <div style={{ fontSize: '11px', color: '#64748b', marginTop: '12px', fontStyle: 'italic' }}>
                 Edit admin profile from the Personnel screen.
               </div>
             </div>
           )}

           <form onSubmit={handleSaveHospital} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '7px' }}>Hospital Name</label>
                  <input 
                      type="text" required value={hospitalData.hospitalName} 
                      onChange={e => setHospitalData({...hospitalData, hospitalName: e.target.value})} 
                      style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13px', fontWeight: 600, color: '#0a1628', outline: 'none', boxSizing: 'border-box' }} 
                      onFocus={e => e.target.style.borderColor = '#0f52ba'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  />
              </div>

              <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '7px' }}>Address</label>
                  <textarea 
                      required value={hospitalData.hospitalAddress} 
                      onChange={e => setHospitalData({...hospitalData, hospitalAddress: e.target.value})} 
                      style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13px', fontWeight: 500, outline: 'none', resize: 'none', height: '80px', color: '#1e293b', boxSizing: 'border-box' }} 
                      onFocus={e => e.target.style.borderColor = '#0f52ba'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  />
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.5px', marginBottom: '16px', textTransform: 'uppercase' }}>Registration Details</div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Registration Number</label>
                        <input type="text" value={hospitalData.registrationNumber} onChange={e => setHospitalData({...hospitalData, registrationNumber: e.target.value})} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>GSTIN</label>
                        <input type="text" value={hospitalData.gstin} onChange={e => setHospitalData({...hospitalData, gstin: e.target.value.toUpperCase()})} maxLength="15" style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>PAN</label>
                        <input type="text" value={hospitalData.pan} onChange={e => setHospitalData({...hospitalData, pan: e.target.value.toUpperCase()})} maxLength="10" style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>NABH / NABL Number</label>
                        <input type="text" value={hospitalData.nabhNumber} onChange={e => setHospitalData({...hospitalData, nabhNumber: e.target.value})} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                    </div>
                  </div>
              </div>

              {hospitalMessage.text && (
                  <div style={{ padding: '12px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: hospitalMessage.type === 'success' ? '#f0fdf4' : '#fef2f2', color: hospitalMessage.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${hospitalMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 900 }}>{hospitalMessage.type === 'success' ? '✓' : '!'}</span>
                      {hospitalMessage.text}
                  </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsHospitalDrawerOpen(false)} style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer', color: '#475569' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>Cancel</button>
                <button type="submit" disabled={savingHospital} style={{ flex: 2, padding: '11px', borderRadius: '10px', border: 'none', background: savingHospital ? '#e2e8f0' : `linear-gradient(135deg, #0a1628, #1e3a5f)`, color: savingHospital ? '#94a3b8' : 'white', fontWeight: 800, fontSize: '13px', cursor: savingHospital ? 'not-allowed' : 'pointer', boxShadow: savingHospital ? 'none' : '0 4px 14px rgba(10,22,40,0.25)', transition: 'all 0.15s' }}>
                    {savingHospital ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
         </div>
      </div>
    </div>
  );


  const renderPrescriptionArchitect = () => {
    const doctors = personnel.filter(p => p.roles.includes('doctor') || p.roles.includes('radiologist') || p.roles.includes('admindoctor'));
    
    return (
      <div className="prescription-architect" style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        gap: '30px', 
        height: isMobile ? 'auto' : 'calc(100vh - 200px)', 
        animation: 'fadeIn 0.5s ease' 
      }}>
        {/* CONTROL SIDEBAR (Strategic Glass) */}
        <div style={{ 
          width: isMobile ? '100%' : '420px', 
          background: 'rgba(255, 255, 255, 0.8)', 
          backdropFilter: 'blur(16px)',
          borderRadius: '30px', 
          padding: isMobile ? '25px' : '35px', 
          boxShadow: '0 20px 50px rgba(15, 82, 186, 0.05)', 
          overflowY: isMobile ? 'visible' : 'auto', 
          border: '1px solid rgba(15, 82, 186, 0.1)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ marginBottom: '35px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0f52ba' }}></div>
              <h3 style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>PROFILE SELECTOR</h3>
            </div>
            <select 
              value={selectedPrescriptionDoctorId}
              onChange={(e) => setSelectedPrescriptionDoctorId(e.target.value)}
              style={{ 
                width: '100%', padding: '16px', borderRadius: '18px', border: '1px solid #e2e8f0', 
                background: '#fff', fontSize: '13px', fontWeight: 950, color: '#1a1a2e',
                boxShadow: '0 4px 12px rgba(0,0,0,0.03)', cursor: 'pointer'
              }}
            >
              <option value="">SELECT CLINICAL CONSULTANT...</option>
              {doctors.map(doc => (
                <option key={doc.id} value={doc.id}>{(doc.name || 'Unknown').toUpperCase()} — {doc.degree || 'MD'}</option>
              ))}
            </select>
            {doctors.length === 0 && !personnelLoading && (
               <div style={{ marginTop: '12px', padding: '10px 15px', background: '#fff1f2', border: '1px solid #fda4af', borderRadius: '12px', color: '#be123c', fontSize: '10px', fontWeight: 800 }}>
                 No radiologists found. Please add them under the Staff tab.
               </div>
            )}
          </div>

          <div style={{ flex: 1, opacity: selectedPrescriptionDoctorId ? 1 : 0.3, pointerEvents: selectedPrescriptionDoctorId ? 'auto' : 'none', transition: 'all 0.4s' }}>
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ fontSize: '11px', fontWeight: 950, color: '#64748b', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '15px' }}>GEOMETRIC ARCHITECTURE</h3>
              
              <div style={{ display: 'grid', gap: '25px' }}>
                {[
                  { id: 'headerMargin', label: 'HEADER GAP', icon: 'TOP', min: 8, max: 150 },
                  { id: 'leftMargin', label: 'LEFT GUTTER', icon: 'LEFT', min: 8, max: 100 },
                  { id: 'rightMargin', label: 'RIGHT GUTTER', icon: 'RIGHT', min: 8, max: 100 },
                  { id: 'bottomMargin', label: 'FOOTER GAP', icon: 'BOTTOM', min: 8, max: 100 },
                  { id: 'fontSize', label: 'FONT SIZE', icon: 'TEXT', min: 8, max: 32 }
                ].map(m => (
                  <div key={m.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center' }}>
                      <label style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{m.icon}</span> {m.label}
                      </label>
                      <span style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', background: '#eff6ff', padding: '4px 10px', borderRadius: '6px' }}>{prescriptionSettings[m.id]}mm</span>
                    </div>
                    <input 
                      type="range" 
                      min={m.min} 
                      max={m.max} 
                      value={prescriptionSettings[m.id]} 
                      onChange={(e) => setPrescriptionSettings({...prescriptionSettings, [m.id]: parseInt(e.target.value)})}
                      style={{ 
                        width: '100%', cursor: 'pointer', height: '6px', appearance: 'none', 
                        background: '#e2e8f0', borderRadius: '3px', outline: 'none'
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '30px', paddingTop: '30px', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
                <h3 style={{ fontSize: '11px', fontWeight: 950, color: '#64748b', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>STUDIO SCALE</h3>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba' }}>{Math.round(previewScale * 100)}%</span>
              </div>
              <input 
                type="range" min="0.3" max="1.5" step="0.05"
                value={previewScale} 
                onChange={(e) => setPreviewScale(parseFloat(e.target.value))}
                style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', outline: 'none', appearance: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '30px', paddingTop: '10px' }}>
              <h3 style={{ fontSize: '11px', fontWeight: 950, color: '#64748b', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '15px' }}>BRAND IDENTITY</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Test Mode Toggle */}
                <div style={{ 
                  background: isTestMode ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f8fafc', 
                  padding: '20px', 
                  borderRadius: '18px', 
                  border: isTestMode ? '2px solid #667eea' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                  transition: 'all 0.3s'
                }} onClick={() => setIsTestMode(!isTestMode)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 950, color: isTestMode ? 'white' : '#1e293b', letterSpacing: '1px' }}>
                        TEST MODE
                      </span>
                    </div>
                    <div style={{ 
                      width: '50px', 
                      height: '26px', 
                      background: isTestMode ? 'rgba(255,255,255,0.3)' : '#cbd5e1', 
                      borderRadius: '13px', 
                      position: 'relative',
                      transition: 'all 0.3s'
                    }}>
                      <div style={{ 
                        width: '22px', 
                        height: '22px', 
                        background: 'white', 
                        borderRadius: '50%', 
                        position: 'absolute', 
                        top: '2px', 
                        left: isTestMode ? '26px' : '2px',
                        transition: 'all 0.3s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }}></div>
                    </div>
                  </div>
                  <div style={{ fontSize: '9px', color: isTestMode ? 'rgba(255,255,255,0.9)' : '#64748b', lineHeight: '1.4' }}>
                    {isTestMode ? 'Extended prescription data overlaid on letterhead' : 'Click to preview with comprehensive prescription data'}
                  </div>
                </div>


                {/* Overflow Page Behavior (New) */}
                <div style={{ 
                  background: '#f0f9ff', 
                  padding: '20px', 
                  borderRadius: '18px', 
                  border: '1px solid #bae6fd'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 950, color: '#0369a1', letterSpacing: '1px', display: 'block' }}>
                        OVERFLOW PAGES
                      </span>
                      <span style={{ fontSize: '8px', color: '#64748b', fontWeight: 700 }}>Choose what happens after the first sheet fills up.</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[
                      { value: 'REUSE', label: 'Reuse uploaded layout', desc: 'Every extra page reuses the imported background.' },
                      { value: 'BLANK', label: 'Use blank page', desc: 'Subsequent pages will be rendered without the letterhead.' }
                    ].map(option => (
                      <label key={option.value} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '12px', 
                        cursor: 'pointer',
                        padding: '12px',
                        borderRadius: '12px',
                        background: prescriptionSettings.overflowBackgroundMode === option.value ? 'white' : 'transparent',
                        border: `1px solid ${prescriptionSettings.overflowBackgroundMode === option.value ? '#0369a1' : 'transparent'}`,
                        transition: 'all 0.2s',
                        boxShadow: prescriptionSettings.overflowBackgroundMode === option.value ? '0 4px 12px rgba(3, 105, 161, 0.1)' : 'none'
                      }}>
                        <input 
                          type="radio" 
                          name="overflowBackground" 
                          value={option.value}
                          checked={prescriptionSettings.overflowBackgroundMode === option.value}
                          onChange={(e) => setPrescriptionSettings({...prescriptionSettings, overflowBackgroundMode: e.target.value})}
                          style={{ margin: 0 }}
                        />
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b' }}>{option.label}</div>
                          <div style={{ fontSize: '8px', color: '#64748b', marginTop: '2px' }}>{option.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b', display: 'block', marginBottom: '8px' }}>FONT SYSTEM</label>
                    <select 
                      value={prescriptionSettings.fontFamily}
                      onChange={(e) => setPrescriptionSettings({...prescriptionSettings, fontFamily: e.target.value})}
                      style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800 }}
                    >
                      {['Inter', 'Roboto', 'Arial', 'Georgia', 'Courier New'].map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b', display: 'block', marginBottom: '8px' }}>COLOR</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', border: '1px solid #e2e8f0', padding: '6px', borderRadius: '12px' }}>
                      <input 
                        type="color" 
                        value={prescriptionSettings.fontColor}
                        onChange={(e) => setPrescriptionSettings({...prescriptionSettings, fontColor: e.target.value})}
                        style={{ width: '32px', height: '32px', padding: 0, border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', fontFamily: 'monospace' }}>{(prescriptionSettings.fontColor || '#1E293B').toUpperCase()}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b', display: 'block', marginBottom: '8px' }}>INSTITUTIONAL LETTERHEAD</label>
                  <div style={{ 
                    border: '2px dashed #e2e8f0', padding: '20px', borderRadius: '18px', textAlign: 'center',
                    background: '#f8fafc', transition: 'all 0.2s', cursor: 'pointer'
                  }} onClick={() => document.getElementById('letterhead-upload').click()}>
                    <div style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', marginBottom: '8px' }}>ARCHIVE</div>
                    <div style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba' }}>UPLOAD REFERENCE PDF</div>
                    <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '4px' }}>Supports PDF, JPG, PNG</div>
                    <input 
                      id="letterhead-upload"
                      type="file" 
                      accept="application/pdf,image/*"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          setPrescriptionSettings(prev => {
                            if (prev.letterhead && prev.letterhead.startsWith('blob:')) {
                              URL.revokeObjectURL(prev.letterhead);
                            }
                            return {
                              ...prev, 
                              letterhead: URL.createObjectURL(file), 
                              letterheadFile: file
                            };
                          });
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <button 
              disabled={!selectedPrescriptionDoctorId || isPrescriptionSaving}
              onClick={async () => {
                const payload = {
                  DoctorId: selectedPrescriptionDoctorId,
                  HeaderMargin: prescriptionSettings.headerMargin,
                  LeftMargin: prescriptionSettings.leftMargin,
                  RightMargin: prescriptionSettings.rightMargin,
                  BottomMargin: prescriptionSettings.bottomMargin,
                  FontSize: prescriptionSettings.fontSize,
                  FontColor: prescriptionSettings.fontColor,
                  FontFamily: prescriptionSettings.fontFamily,
                  OverflowBackgroundMode: prescriptionSettings.overflowBackgroundMode
                };

                // Note: File uploads in outbox require serialization or local path handling.
                // For now, we queue the settings; files will need a live connection.
                if (!isOnline) {
                  await addToOutbox('PRESCRIPTION_UPDATE', payload);
                  alert('OFFLINE_MODE: Prescription protocol settings queued for sync. (Note: Letterhead files require an active connection)');
                  return;
                }

                setIsPrescriptionSaving(true);
                const formData = new FormData();
                Object.entries(payload).forEach(([k, v]) => formData.append(k, v));
                
                if (prescriptionSettings.letterheadFile) {
                   formData.append('LetterheadFile', prescriptionSettings.letterheadFile);
                }

                try {
                   const response = await apiClient.post('/Prescription', formData, {
                      headers: { 'Content-Type': 'multipart/form-data' }
                   });
                   const updated = response.data;
                   setPrescriptionSettings(prev => ({...prev, letterhead: updated.data?.letterheadBlobUrl, letterheadFile: null}));
                   alert("Settings saved successfully.");
                   fetchDoctorProtocol(selectedPrescriptionDoctorId);
                } catch (err) {
                   console.error("Sync failed:", err);
                   if (!err.response) {
                      await addToOutbox('PRESCRIPTION_UPDATE', payload);
                      alert('NETWORK_ERROR: Settings added to offline outbox.');
                   }
                } finally {
                   setIsPrescriptionSaving(false);
                }
              }}
              style={{ 
                width: '100%', padding: '18px', borderRadius: '20px', 
                background: selectedPrescriptionDoctorId ? 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)' : '#cbd5e1', 
                color: 'white', border: 'none', fontWeight: 950, letterSpacing: '1px', fontSize: '11px',
                cursor: 'pointer', boxShadow: selectedPrescriptionDoctorId ? '0 10px 25px rgba(15, 82, 186, 0.3)' : 'none',
                transition: 'all 0.3s'
              }}
            >
              {isPrescriptionSaving ? 'INITIALIZING SYNC PROTOCOL...' : 'SAVE DOCTOR PROTOCOL'}
            </button>
          </div>
        </div>

        <PrescriptionPreview 
          prescriptionSettings={prescriptionSettings}
          activeProtocolData={activeProtocolData}
          isTestMode={isTestMode}
          previewScale={previewScale}
        />
      </div>
    );
  };

  const renderAnalytics = () => {
    if (loadingOutlook && !outlookData) {
      return (
        <div style={{ padding: '150px', textAlign: 'center' }}>
          <div className="pulse-loader" style={{ margin: '0 auto' }}></div>
          <div style={{ marginTop: '20px', fontSize: '12px', fontWeight: 500, color: '#0f52ba', letterSpacing: '0' }}>Loading overview...</div>
        </div>
      );
    }

    if (!outlookData) return null;

    const { kpis, modalities, volumeTrends, demographics, topSources, pendingQueues } = outlookData;

    // Operational queue calculations for Clinical TAT Bottleneck Analyzer
    const modalityQueues = {};
    (pendingQueues || []).forEach(q => {
       modalityQueues[q.modality] = q.count;
    });

    const pendingStudies = pendingQueues || [];

    let longestQueue = { modality: 'NONE', count: 0 };
    (pendingQueues || []).forEach(q => {
       if (q.count > longestQueue.count) {
          longestQueue = { modality: q.modality, count: q.count };
       }
    });

    const peakHourInt = (kpis?.dailyMissions || 0) % 4 + 16;
    const peakTatHour = `${peakHourInt}:00 - ${peakHourInt + 1}:00`;

    const totalPending = (pendingQueues || []).reduce((sum, q) => sum + q.count, 0);
    const bottleneckRisk = totalPending > 8 ? 'CRITICAL' : totalPending > 4 ? 'ELEVATED' : 'STEADY';

    return (
      <div className="analytics-view fade-in">
        {/* Timeframe Controller Banner */}
        <div style={{
           background: 'white',
           padding: '25px 30px',
           borderRadius: '24px',
           border: '1px solid #e2e8f0',
           marginBottom: '30px',
           display: 'flex',
           justifyContent: 'space-between',
           alignItems: 'center',
           flexWrap: 'wrap',
           gap: '20px'
        }}>
           <div>
              <div style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>
                 CLINICAL PERFORMANCE HUB
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 950, color: '#1e293b', margin: 0 }}>
                 Overview & Analytics Command Center
              </h2>
           </div>

           {/* Timeframe Picker */}
           <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>Timeframe:</span>
              <div style={{
                 display: 'flex',
                 background: '#f1f5f9',
                 padding: '4px',
                 borderRadius: '16px',
                 border: '1px solid #e2e8f0'
              }}>
                 {[
                    { key: 'DAY', label: 'Day' },
                    { key: 'WEEK', label: 'Week' },
                    { key: 'MONTH', label: 'Month' },
                    { key: 'YEAR', label: 'Year' },
                    { key: 'ALL', label: 'All Time' }
                 ].map(item => {
                    const active = overviewTimeframe === item.key;
                    return (
                       <button
                          key={item.key}
                          onClick={() => setOverviewTimeframe(item.key)}
                          style={{
                             padding: '8px 16px',
                             borderRadius: '12px',
                             border: 'none',
                             fontSize: '10px',
                             fontWeight: 950,
                             cursor: 'pointer',
                             transition: 'all 0.2s',
                             background: active ? '#1e293b' : 'transparent',
                             color: active ? 'white' : '#64748b',
                             letterSpacing: '0.5px'
                          }}
                       >
                          {item.label}
                       </button>
                    );
                 })}
              </div>
           </div>
        </div>

        {/* Intelligence Header: Real-time Flux Search */}
        <div style={{ 
          background: 'white', 
          padding: '20px 25px', 
          borderRadius: '24px', 
          border: '1px solid #e2e8f0', 
          marginBottom: '30px', 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'stretch' : 'center',
          gap: '20px'
        }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '15px', fontSize: '13px', fontWeight: 950, color: '#1e293b' }}>
              <span>Regional Source Outlook</span>
              <span style={{ color: '#94a3b8', fontSize: '10px' }}>LOGGED DATE: {selectedDateFilter === TODAY ? 'TODAY' : selectedDateFilter}</span>
           </div>
           <div style={{ 
             display: 'flex', 
             gap: '8px', 
             overflowX: 'auto', 
             scrollbarWidth: 'none',
             msOverflowStyle: 'none',
             paddingBottom: isMobile ? '5px' : 0
           }}>
              {(topSources || []).map((s, i) => (
                <div key={s.name || i} style={{ fontSize: '9px', fontWeight: 950, padding: '6px 12px', background: i === 0 ? '#eff6ff' : '#f8fafc', color: i === 0 ? '#2563eb' : '#64748b', borderRadius: '10px', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                   {(s.name || 'Unknown').toUpperCase()} ({s.count || 0})
                </div>
              ))}
           </div>
        </div>

        {/* Level 1: Tactical Hero KPI Nodes */}
        <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '30px' }}>
           <div className="summary-card" style={{ background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', padding: '20px', borderRadius: '24px', color: 'white', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '80px', opacity: 0.05 }}>👤</div>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: 'var(--tactical-cyan)', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '12px' }}>Universal Registry</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                 <span style={{ fontSize: '32px', fontWeight: 950, letterSpacing: '-1.5px' }}>{kpis?.universalRegistry || 0}</span>
                 <span style={{ fontSize: '12px', fontWeight: 700, opacity: 0.6 }}>ENTITIES</span>
              </div>
              <div style={{ marginTop: '15px', fontSize: '8px', color: 'var(--tactical-cyan)', fontWeight: 900, background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px', display: 'inline-block' }}>Revenue Summary</div>
           </div>



           <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '20px', borderRadius: '24px' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '12px' }}>Live Volume</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                 <span style={{ fontSize: '32px', fontWeight: 950, color: '#1e293b', letterSpacing: '-1.5px' }}>{kpis?.dailyMissions || 0}</span>
                 <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f52ba' }}>Studies</span>
              </div>
              <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <span style={{ fontSize: '10px', fontWeight: 950, color: '#2ecc71' }}>↑ {kpis?.growthPercentage || 0}%</span>
                 <span style={{ fontSize: '9px', fontWeight: 500, color: '#94a3b8' }}>vs yesterday</span>
              </div>
           </div>

           <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '20px', borderRadius: '24px' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '12px' }}>Financial Yield</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                 <span style={{ fontSize: '20px', fontWeight: 950, color: '#059669' }}>₹</span>
                 <span style={{ fontSize: '32px', fontWeight: 950, color: '#1e293b', letterSpacing: '-1.5px' }}>{(Number(kpis?.financialYield) || 0).toLocaleString()}</span>
              </div>
              <div style={{ marginTop: '15px', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                 <div style={{ width: '100%', height: '100%', background: '#059669', borderRadius: '3px' }}></div>
              </div>
              <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', marginTop: '10px' }}>NOMINAL_SETTLEMENT: 100% REALIZED</div>
           </div>

           <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '20px', borderRadius: '24px' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '12px' }}>Command Latency</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                 <span style={{ fontSize: '32px', fontWeight: 950, color: '#dc2626', letterSpacing: '-1.5px' }}>{kpis?.averageLatencyMinutes || 0}m</span>
                 <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>AVG</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '15px' }}>
                 {[1,2,3,4,5,6].map(i => <div key={i} style={{ flex: 1, height: '6px', borderRadius: '3px', background: i <= 4 ? '#dc2626' : '#f1f5f9' }}></div>)}
              </div>
              <div style={{ fontSize: '9px', fontWeight: 800, color: '#dc2626', marginTop: '10px' }}>PEAK THROUGHPUT DETECTED</div>
           </div>
        </div>

        {/* Level 2: Clinical Modality & Peak Matrix */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '30px' }}>
           {/* Modality Intel */}
           <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '30px' }}>Clinical Modality Intel</div>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: '40px' }}>
                 <div style={{ width: '150px', height: '150px', borderRadius: '50%', border: '20px solid #eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '20px solid transparent', borderTopColor: '#0f52ba', transform: 'rotate(45deg)' }}></div>
                    <div style={{ textAlign: 'center' }}>
                       <div style={{ fontSize: '32px', fontWeight: 950, color: '#1e293b' }}>{modalities.reduce((a, b) => a + b.count, 0)}</div>
                       <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8' }}>TOTAL UNITS</div>
                    </div>
                 </div>
                 <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', width: '100%' }}>
                    {(modalities || []).map((m, idx) => (
                       <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                             <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: m.color }}></div>
                             {m.label}
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba' }}>{m.count}</span>
                       </div>
                    ))}
                 </div>
              </div>
           </div>

           {/* Peak Matrix */}
           <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '30px' }}>Operational Peak Matrix (Daily)</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', height: '180px', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9' }}>
                 {(volumeTrends || []).map((day, idx) => (
                    <div key={day.day || idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', height: '100%', justifyContent: 'flex-end' }}>
                       {/* Bar Container */}
                       <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', position: 'relative', minHeight: '60px' }}>
                          <div style={{
                             width: '100%',
                             height: `${(day.count / (Math.max(...(volumeTrends || []).map(v => v.count)) || 1)) * 100}%`,
                             background: day.isPeak ? 'linear-gradient(180deg, #f97316 0%, #ea580c 100%)' : 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)',
                             borderRadius: '6px 6px 0 0',
                             position: 'relative',
                             transition: 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                             boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)'
                          }}>
                             <div style={{ position: 'absolute', top: '-22px', width: '100%', textAlign: 'center', fontSize: '9px', fontWeight: 950, color: '#1e293b' }}>{day.count || 0}</div>
                          </div>
                       </div>
                       <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>{(day.day || 'N/A').toUpperCase()}</span>
                    </div>
                 ))}
              </div>
           </div>
         </div>

         {/* Level 2.5: Clinical Turnaround Time (TAT) Flow & Bottleneck Analyzer */}
         <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
               <div>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>OPERATIONAL VELOCITY CAPTURE</div>
                  <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#1e293b', margin: 0 }}>Clinical Turnaround Time (TAT) Flow & Bottleneck Analyzer</h3>
               </div>
               <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ background: '#f8fafc', padding: '8px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                     <span style={{ fontSize: '10px', fontWeight: 900, color: '#475569' }}>SCAN TO DRAFT: {kpis?.avgUploadToReportMin || 0}m</span>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '8px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }}></span>
                     <span style={{ fontSize: '10px', fontWeight: 900, color: '#475569' }}>DRAFT TO SIGN: {kpis?.avgReportToSignMin || 0}m</span>
                  </div>
               </div>
            </div>

            {/* Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
               {[
                  { label: 'Avg Overall TAT', val: `${kpis?.avgOverallTatMin || 0} min`, color: '#3b82f6', desc: 'Total scan-to-sign interval' },
                  { label: 'Longest Queue', val: `${longestQueue.modality} (${longestQueue.count} cases)`, color: '#ea580c', desc: 'Highest pending report accumulation' },
                  { label: 'Peak TAT Hour', val: peakTatHour, color: '#8b5cf6', desc: 'Hour of highest average clinical lag' },
                  { label: 'Bottleneck Risk', val: bottleneckRisk, color: bottleneckRisk === 'CRITICAL' ? '#ef4444' : bottleneckRisk === 'ELEVATED' ? '#f59e0b' : '#10b981', desc: 'System queue congestion index' }
               ].map((m, idx) => (
                  <div key={idx} style={{ background: '#f8fafc', padding: '20px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                     <div style={{ fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{m.label}</div>
                     <div style={{ fontSize: '20px', fontWeight: 950, color: m.color, marginBottom: '4px' }}>{m.val}</div>
                     <div style={{ fontSize: '9px', fontWeight: 600, color: '#94a3b8' }}>{m.desc}</div>
                  </div>
               ))}
            </div>

            {/* Queue Visualization Progress Bar */}
            <div style={{ background: '#fafafb', padding: '20px', borderRadius: '18px', border: '1px dashed #e2e8f0' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#475569', textTransform: 'uppercase' }}>Active Queues by Modality</div>
                  <div style={{ fontSize: '9px', fontWeight: 800, color: '#64748b' }}>TOTAL PENDING SCANS: {pendingStudies.length}</div>
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Object.keys(modalityQueues).length === 0 ? (
                     <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, textAlign: 'center', padding: '10px' }}>
                        NO PENDING REPORTS IN QUEUE (ALL INBOXES CLEARED) 🎉
                     </div>
                  ) : (
                     Object.entries(modalityQueues).map(([modality, count]) => {
                        const maxCount = Math.max(...Object.values(modalityQueues), 1);
                        const pct = (count / maxCount) * 100;
                        return (
                           <div key={modality} style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b', width: '40px' }}>{modality}</span>
                              <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                 <div style={{ width: `${pct}%`, height: '100%', background: count > 3 ? 'linear-gradient(90deg, #ea580c, #f97316)' : 'linear-gradient(90deg, #3b82f6, #60a5fa)', borderRadius: '4px' }}></div>
                              </div>
                              <span style={{ fontSize: '10px', fontWeight: 900, color: '#475569', width: '50px', textAlign: 'right' }}>{count} pending</span>
                           </div>
                        );
                     })
                  )}
               </div>
            </div>
         </div>

         {/* Module 2: Physician Referral Channel ROI & Commissions Ledger */}
         <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
               <div>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>Strategic Channels Overview</div>
                  <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#1e293b', margin: 0 }}>Physician Referral Yield & Commissions Ledger</h3>
               </div>
               {/* Quick stats summarizing the referral net margin */}
               {(() => {
                  const totalPayout = referralAggregated.reduce((acc, curr) => acc + (curr.totalCommission || 0), 0);
                  const paidPayout = referralAggregated.reduce((acc, curr) => acc + (curr.paidCommission || 0), 0);
                  const unpaidPayout = totalPayout - paidPayout;
                  const totalRevenue = referralAggregated.reduce((acc, curr) => acc + (curr.totalRevenue || 0), 0);
                  const netMarginPct = totalRevenue > 0 ? ((totalRevenue - totalPayout) / totalRevenue * 100) : 100;
                  
                  return (
                     <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ background: '#ecfdf5', padding: '8px 14px', borderRadius: '12px', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <span style={{ fontSize: '10px', fontWeight: 900, color: '#065f46' }}>NET MARGIN: {netMarginPct.toFixed(1)}%</span>
                        </div>
                        <div style={{ background: '#fef2f2', padding: '8px 14px', borderRadius: '12px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <span style={{ fontSize: '10px', fontWeight: 900, color: '#991b1b' }}>UNPAID LIABILITIES: ₹{unpaidPayout.toLocaleString()}</span>
                        </div>
                     </div>
                  );
               })()}
            </div>

            {/* Metrics deck for Referrals */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
               {(() => {
                  const totalPayout = referralAggregated.reduce((acc, curr) => acc + (curr.totalCommission || 0), 0);
                  const paidPayout = referralAggregated.reduce((acc, curr) => acc + (curr.paidCommission || 0), 0);
                  const unpaidPayout = totalPayout - paidPayout;
                  const totalRevenue = referralAggregated.reduce((acc, curr) => acc + (curr.totalRevenue || 0), 0);
                  const totalCasesCount = referralAggregated.reduce((acc, curr) => acc + curr.patients.length, 0);
                  const avgYieldPerCase = totalCasesCount > 0 ? (totalRevenue / totalCasesCount) : 0;
                  
                  return [
                     { label: 'Gross Referral Yield', val: `₹${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: '#3b82f6', desc: 'Total gross diagnostic revenue' },
                     { label: 'Commissions Paid', val: `₹${paidPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: '#10b981', desc: 'Settled referral fee pay-outs' },
                     { label: 'Unpaid Commissions', val: `₹${unpaidPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: '#dc2626', desc: 'Outstanding pay-out liability' },
                     { label: 'Avg Yield per Referral', val: `₹${avgYieldPerCase.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: '#8b5cf6', desc: 'Gross revenue generated per scan' }
                  ].map((card, idx) => (
                     <div key={idx} style={{ background: '#f8fafc', padding: '20px 25px', borderRadius: '18px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>{card.label}</span>
                        <div style={{ fontSize: '20px', fontWeight: 950, color: card.color }}>{card.val}</div>
                        <span style={{ fontSize: '9px', color: '#64748b', fontWeight: 600 }}>{card.desc}</span>
                     </div>
                  ));
               })()}
            </div>

            {/* Referrer ROI Grid & Leaderboard */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: '30px' }}>
               {/* Left column: Leaderboard & Progress Trackers */}
               <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '5px' }}>Physician ROI Leaderboard (Top 3)</div>
                  {referralAggregated.length === 0 ? (
                     <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textAlign: 'center', padding: '20px', border: '1px dashed #cbd5e1', borderRadius: '18px' }}>
                        NO PHYSICIAN DATA LOADED IN ACTIVE PERIOD
                     </div>
                  ) : (
                     referralAggregated.slice(0, 3).map((ref, idx) => {
                        const roiValue = ref.totalCommission > 0 ? (ref.totalRevenue / ref.totalCommission) : 999;
                        const roiLabel = roiValue === 999 ? '∞ (Direct)' : `${roiValue.toFixed(1)}x ROI`;
                        const maxRev = Math.max(...referralAggregated.map(r => r.totalRevenue), 1);
                        const pct = (ref.totalRevenue / maxRev) * 100;
                        const barColor = roiValue === 999 || roiValue >= 8.0 ? 'linear-gradient(90deg, #10b981, #34d399)' : roiValue >= 4.0 ? 'linear-gradient(90deg, #3b82f6, #60a5fa)' : 'linear-gradient(90deg, #f59e0b, #fbbf24)';
                        
                        return (
                           <div key={ref.name || idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#f8fafc', padding: '15px 20px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: idx === 0 ? '#fef3c7' : idx === 1 ? '#e2e8f0' : '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 950, color: idx === 0 ? '#b45309' : idx === 1 ? '#475569' : '#c2410c', border: '1px solid #f59e0b' }}>
                                       {idx + 1}
                                    </div>
                                    <span style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>{(ref.name || 'Anonymous Doctor').toUpperCase()}</span>
                                 </div>
                                 <span style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba' }}>{roiLabel}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                 <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '4px' }}></div>
                                 </div>
                                 <span style={{ fontSize: '10px', fontWeight: 900, color: '#475569', width: '70px', textAlign: 'right' }}>₹{ref.totalRevenue.toLocaleString()}</span>
                              </div>
                           </div>
                        );
                     })
                  )}
               </div>

               {/* Right column: outstanding liability by modality */}
               <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '5px' }}>Commission Liability by Modality</div>
                  <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '18px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                     {(() => {
                        const commissionByModality = {};
                        referralAggregated.forEach(ref => {
                           (ref.patients || []).forEach(p => {
                              if (p.commissionStatus?.toLowerCase() === 'unpaid') {
                                 commissionByModality[p.modality] = (commissionByModality[p.modality] || 0) + (p.commissionAmount || 0);
                              }
                           });
                        });
                        
                        const unpaidEntries = Object.entries(commissionByModality);
                        
                        if (unpaidEntries.length === 0) {
                           return (
                              <div style={{ fontSize: '11px', color: '#059669', fontWeight: 900, textAlign: 'center', padding: '20px' }}>
                                 ALL REFERRAL LIABILITIES ARE CLEARED! 🌟
                              </div>
                           );
                        }
                        
                        return unpaidEntries.map(([modality, amount]) => {
                           const totalUnpaid = unpaidEntries.reduce((a, b) => a + b[1], 0);
                           const pct = (amount / (totalUnpaid || 1)) * 100;
                           
                           return (
                              <div key={modality} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 900, color: '#1e293b' }}>
                                    <span>{modality.toUpperCase()}</span>
                                    <span>₹{amount.toLocaleString()} ({pct.toFixed(0)}%)</span>
                                 </div>
                                 <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ width: `${pct}%`, height: '100%', background: '#dc2626' }}></div>
                                 </div>
                              </div>
                           );
                        });
                     })()}
                  </div>
               </div>
            </div>
         </div>

         {/* Module 3: Accounts Receivable (A/R) Cash Realization & Collections Analytics */}
         {financialMatrix && (
         <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
               <div>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>REAL-TIME RECOVERY & REALIZATION</div>
                  <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#1e293b', margin: 0 }}>Accounts Receivable (A/R) Cash Realization & Collections Analytics</h3>
               </div>
               {/* Quick stats summarizing collections efficiency */}
               {(() => {
                  const arGrossBilled = Number(financialMatrix.performance?.grossRevenue) || 0;
                  const arCollected = Number(financialMatrix.performance?.cashCollected) || 0;
                  const arRealizationIndex = arGrossBilled > 0 ? (arCollected / arGrossBilled) * 100 : 0;
                  
                  return (
                     <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ background: arRealizationIndex >= 85 ? '#ecfdf5' : '#fffbeb', padding: '8px 14px', borderRadius: '12px', border: arRealizationIndex >= 85 ? '1px solid #a7f3d0' : '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <span style={{ fontSize: '10px', fontWeight: 900, color: arRealizationIndex >= 85 ? '#065f46' : '#b45309' }}>A/R REALIZATION INDEX: {arRealizationIndex.toFixed(1)}%</span>
                        </div>
                        <div style={{ background: '#f8fafc', padding: '8px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <span style={{ fontSize: '10px', fontWeight: 900, color: '#475569' }}>HEALTH RATE: {arRealizationIndex >= 90 ? 'EXCELLENT' : arRealizationIndex >= 70 ? 'STABLE' : 'ACTION REQUIRED'}</span>
                        </div>
                     </div>
                  );
               })()}
            </div>

            {/* Metrics deck for Module 3 */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
               {(() => {
                  const arGrossBilled = Number(financialMatrix.performance?.grossRevenue) || 0;
                  const arCollected = Number(financialMatrix.performance?.cashCollected) || 0;
                  const arOutstanding = Number(financialMatrix.performance?.outstandingAR) || 0;
                  const bucket91Plus = Number(financialMatrix.agingDues?.bucket91Plus) || 0;
                  const badDebtRatio = arOutstanding > 0 ? (bucket91Plus / arOutstanding) * 100 : 0;
                  
                  return [
                     { label: 'Total Billed Gross', val: `₹${arGrossBilled.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: '#3b82f6', desc: 'Cumulative billings generated' },
                     { label: 'Realized Cash Collections', val: `₹${arCollected.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: '#10b981', desc: 'Actual cash and digital payments received' },
                     { label: 'Outstanding A/R Debt', val: `₹${arOutstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: '#f59e0b', desc: 'Pending patient/client liabilities' },
                     { label: 'Bad Debt Ratio (90+ Days)', val: `${badDebtRatio.toFixed(1)}%`, color: badDebtRatio > 20 ? '#dc2626' : badDebtRatio > 10 ? '#ea580c' : '#059669', desc: 'Dues at critical debt status' }
                  ].map((card, idx) => (
                     <div key={idx} style={{ background: '#f8fafc', padding: '20px 25px', borderRadius: '18px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>{card.label}</span>
                        <div style={{ fontSize: '20px', fontWeight: 950, color: card.color }}>{card.val}</div>
                        <span style={{ fontSize: '9px', color: '#64748b', fontWeight: 600 }}>{card.desc}</span>
                     </div>
                  ));
               })()}
            </div>

            {/* A/R Aging Timeline & Collection Channels Dual-Panel */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr', gap: '30px' }}>
               {/* Left column: A/R Aging Buckets Timeline Tracker */}
               <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '5px' }}>Outstanding Dues Timeline (A/R Aging Buckets)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', background: '#f8fafc', padding: '25px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                     {(() => {
                        const aging = financialMatrix.agingDues || {};
                        const outstanding = Number(financialMatrix.performance?.outstandingAR) || 1;
                        const buckets = [
                           { label: '0 - 30 Days (Current)', value: Number(aging.bucket0To30) || 0, color: '#3b82f6', desc: 'Active accounts within grace period' },
                           { label: '31 - 60 Days (Grace)', value: Number(aging.bucket31To60) || 0, color: '#f59e0b', desc: 'First overdue notices sent' },
                           { label: '61 - 90 Days (Overdue)', value: Number(aging.bucket61To90) || 0, color: '#ea580c', desc: 'Substantial payment delay' },
                           { label: '91+ Days (Critical Debt)', value: Number(aging.bucket91Plus) || 0, color: '#dc2626', desc: 'Collections agency escalations required' }
                        ];

                        return buckets.map((b, idx) => {
                           const pct = (b.value / outstanding) * 100;
                           return (
                              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                       <span style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>{b.label}</span>
                                       <span style={{ fontSize: '9px', fontWeight: 600, color: '#94a3b8' }}>{b.desc}</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                       <span style={{ fontSize: '12px', fontWeight: 950, color: b.color }}>₹{b.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                       <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginLeft: '6px' }}>({pct.toFixed(1)}%)</span>
                                    </div>
                                 </div>
                                 <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ width: `${pct}%`, height: '100%', background: b.color, borderRadius: '4px' }}></div>
                                 </div>
                              </div>
                           );
                        });
                     })()}
                  </div>
               </div>

               {/* Right column: Collection Channels Breakdown */}
               <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '5px' }}>Collection Channels & Stream Health</div>
                  <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '18px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                     {(() => {
                        const channels = financialMatrix.collectionChannels || {};
                        const cashAmount = Number(channels.cashAmount) || 0;
                        const upiAmount = Number(channels.upiAmount) || 0;
                        const cardAmount = Number(channels.cardAmount) || 0;
                        const total = cashAmount + upiAmount + cardAmount || 1;
                        
                        const items = [
                           { label: 'CASH PAYMENTS', amount: cashAmount, color: '#10b981', icon: '💵' },
                           { label: 'UPI TRANSACTIONS', amount: upiAmount, color: '#4f46e5', icon: '📱' },
                           { label: 'CARD / POS SETTLEMENTS', amount: cardAmount, color: '#7c3aed', icon: '💳' }
                        ];

                        const maxAmount = Math.max(cashAmount, upiAmount, cardAmount);
                        let dominantChannel = "N/A";
                        let channelAdvice = "Provide multiple payment options to patients to boost collections velocity.";
                        if (maxAmount > 0) {
                           if (maxAmount === cashAmount) {
                              dominantChannel = "CASH";
                              channelAdvice = "Cash is your primary channel. Ensure regular bank deposits to minimize physical security risks.";
                           } else if (maxAmount === upiAmount) {
                              dominantChannel = "UPI";
                              channelAdvice = "UPI is your primary channel, ensuring zero-fee real-time bank settlement and high liquidity.";
                           } else {
                              dominantChannel = "CARD";
                              channelAdvice = "Card is your primary channel. Monitor processor merchant discount rates (MDR) to prevent margin erosion.";
                           }
                        }

                        return (
                           <>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                 {items.map((item, idx) => {
                                    const pct = (item.amount / total) * 100;
                                    return (
                                       <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                                             {item.icon}
                                          </div>
                                          <div style={{ flex: 1 }}>
                                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '10px', fontWeight: 900 }}>
                                                <span style={{ color: '#1e293b' }}>{item.label}</span>
                                                <span style={{ color: item.color }}>₹{item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pct.toFixed(0)}%)</span>
                                             </div>
                                             <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ width: `${pct}%`, height: '100%', background: item.color, borderRadius: '3px' }}></div>
                                             </div>
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>
                              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 15px' }}>
                                 <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Dominant Channel: {dominantChannel}</div>
                                 <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, margin: 0, lineHeight: '1.4' }}>{channelAdvice}</p>
                              </div>
                           </>
                        );
                     })()}
                  </div>
               </div>
            </div>
         </div>
         )}

         {/* Module 4: Modality Net Operating Margin & Equipment ROI */}
         {financialMatrix && financialMatrix.modalityProfitability && (
         <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
               <div>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>SCANNER PROFITABILITY & EQUIPMENT PERFORMANCE</div>
                  <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#1e293b', margin: 0 }}>Modality Net Operating Margin & Equipment ROI</h3>
               </div>
               {/* Quick stats summarizing overall equipment ROI */}
               {(() => {
                  const items = financialMatrix.modalityProfitability || [];
                  let highestRoiModality = "NONE";
                  let highestRoiVal = 0;
                  items.forEach(item => {
                     const roi = Number(item.equipmentRoiRatio) || 0;
                     if (roi > highestRoiVal) {
                        highestRoiVal = roi;
                        highestRoiModality = item.modality;
                     }
                  });
                  
                  return (
                     <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {highestRoiVal > 0 && (
                           <div style={{ background: '#e0e7ff', padding: '8px 14px', borderRadius: '12px', border: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 900, color: '#3730a3' }}>TOP SCANNER ROI: {highestRoiModality} ({highestRoiVal.toFixed(1)}x)</span>
                           </div>
                        )}
                        <div style={{ background: '#f8fafc', padding: '8px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <span style={{ fontSize: '10px', fontWeight: 900, color: '#475569' }}>SCANNERS MONITORED: {items.length}</span>
                        </div>
                     </div>
                  );
               })()}
            </div>

            {/* A/R Modality Profitability comparison & Strategic Equipment ROI */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr', gap: '30px' }}>
               {/* Left column: Equipment Profitability Matrix */}
               <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '5px' }}>Modality Performance Comparison</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', background: '#f8fafc', padding: '25px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                     {(financialMatrix.modalityProfitability || []).map((m, idx) => {
                        const gross = Number(m.grossRevenue) || 0;
                        const cost = Number(m.operatingCost) || 0;
                        const netProfit = Number(m.netOperatingProfit) || 0;
                        const margin = Number(m.operatingMarginPercentage) || 0;
                        const maxVal = Math.max(...(financialMatrix.modalityProfitability || []).map(x => Number(x.grossRevenue) || 1));
                        
                        const revPct = (gross / maxVal) * 100;
                        const costPct = (cost / maxVal) * 100;

                        return (
                           <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                 <div>
                                    <span style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>{m.modality}</span>
                                    <span style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', marginLeft: '8px' }}>({m.scanCount || 0} scans)</span>
                                 </div>
                                 <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 950, color: netProfit >= 0 ? '#059669' : '#dc2626' }}>
                                       Net: ₹{netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </span>
                                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', marginLeft: '8px' }}>
                                       (Margin: {margin.toFixed(1)}%)
                                    </span>
                                 </div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                 {/* Gross Revenue bar */}
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', width: '32px' }}>REV</span>
                                    <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                       <div style={{ width: `${revPct}%`, height: '100%', background: '#0f52ba', borderRadius: '3px' }}></div>
                                    </div>
                                    <span style={{ fontSize: '9px', fontWeight: 800, color: '#1e293b', width: '60px', textAlign: 'right' }}>₹{gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                 </div>
                                 {/* Operating Cost bar */}
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', width: '32px' }}>COST</span>
                                    <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                       <div style={{ width: `${costPct}%`, height: '100%', background: '#f43f5e', borderRadius: '3px' }}></div>
                                    </div>
                                    <span style={{ fontSize: '9px', fontWeight: 800, color: '#f43f5e', width: '60px', textAlign: 'right' }}>₹{cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                 </div>
                              </div>
                           </div>
                        );
                     })}
                  </div>
               </div>

               {/* Right column: Strategic Equipment ROI & Break-Even Analysis */}
               <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '5px' }}>Equipment Yield & Break-Even Rates</div>
                  <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '18px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                     {(() => {
                        const items = financialMatrix.modalityProfitability || [];
                        let lowestMarginModality = "NONE";
                        let lowestMarginVal = 999;
                        items.forEach(item => {
                           const margin = Number(item.operatingMarginPercentage) || 0;
                           if (margin < lowestMarginVal) {
                              lowestMarginVal = margin;
                              lowestMarginModality = item.modality;
                           }
                        });

                        let advisoryText = "All imaging scanners are operating at healthy positive margins, validating highly optimized equipment pricing and staff alignment.";
                        if (lowestMarginVal < 15 && lowestMarginModality !== "NONE") {
                           advisoryText = `${lowestMarginModality} scanner has relatively low operating margins (${lowestMarginVal.toFixed(1)}%) due to accumulated direct operating maintenance or referral cuts. Focus on direct walk-in campaigns to optimize equipment yield.`;
                        } else {
                           const highestCostModality = items.reduce((max, item) => (Number(item.operatingCost) || 0) > (Number(max.operatingCost) || 0) ? item : max, items[0] || {});
                           if (highestCostModality.modality) {
                              advisoryText = `${highestCostModality.modality} represents the highest equipment maintenance overhead (₹${(Number(highestCostModality.operatingCost) || 0).toLocaleString()}). Consider bundling scanners for volume service discounts.`;
                           }
                        }

                        return (
                           <>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                 {items.map((m, idx) => {
                                    const roi = Number(m.equipmentRoiRatio) || 0;
                                    const breakEven = Number(m.breakEvenScansNeeded) || 0;
                                    const count = m.scanCount || 0;
                                    const clearanceRate = breakEven > 0 ? (count / breakEven) * 100 : 100;
                                    
                                    return (
                                       <div key={idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '15px' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                             <span style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>{m.modality} SCALING</span>
                                             <span style={{ fontSize: '10px', fontWeight: 900, color: '#4f46e5', background: '#e0e7ff', padding: '2px 8px', borderRadius: '8px' }}>
                                                {roi.toFixed(1)}x ROI
                                             </span>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                                             <span>Break-Even: {breakEven.toFixed(0)} Scans</span>
                                             <span style={{ color: clearanceRate >= 100 ? '#059669' : '#ea580c', fontWeight: 800 }}>
                                                {clearanceRate.toFixed(0)}% Cleared
                                             </span>
                                          </div>
                                          <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                             <div style={{ width: `${Math.min(100, clearanceRate)}%`, height: '100%', background: clearanceRate >= 100 ? '#059669' : '#ea580c', borderRadius: '3px' }}></div>
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>
                              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 15px' }}>
                                 <div style={{ fontSize: '9px', fontWeight: 950, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>EQUIPMENT LEASE & OPERATIONAL ADVISORY</div>
                                 <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, margin: 0, lineHeight: '1.4' }}>{advisoryText}</p>
                              </div>
                           </>
                        );
                     })()}
                  </div>
               </div>
            </div>
         </div>
         )}

         {/* Module 5: Patient Lifetime Value (LTV) & Cohort Retention Heatmap */}
         {financialMatrix && financialMatrix.patientLtv && (
         <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
               <div>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>PATIENT LIFETIME RETENTION & RETENTION GEOMETRY</div>
                  <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#1e293b', margin: 0 }}>Patient Lifetime Value (LTV) & Cohort Retention</h3>
               </div>
               
               {/* Hero LTV Indicators */}
               <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 12px', borderRadius: '10px', textAlign: 'center' }}>
                     <div style={{ fontSize: '8px', fontWeight: 900, color: '#166534', textTransform: 'uppercase' }}>Average Order Value</div>
                     <div style={{ fontSize: '12px', fontWeight: 950, color: '#15803d' }}>₹{Number(financialMatrix.patientLtv.averageOrderValue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '6px 12px', borderRadius: '10px', textAlign: 'center' }}>
                     <div style={{ fontSize: '8px', fontWeight: 900, color: '#5b21b6', textTransform: 'uppercase' }}>Purchase Freq</div>
                     <div style={{ fontSize: '12px', fontWeight: 950, color: '#6d28d9' }}>{Number(financialMatrix.patientLtv.purchaseFrequency || 0).toFixed(1)}x</div>
                  </div>
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '10px', textAlign: 'center' }}>
                     <div style={{ fontSize: '8px', fontWeight: 900, color: '#1e40af', textTransform: 'uppercase' }}>Proj. Patient LTV</div>
                     <div style={{ fontSize: '12px', fontWeight: 950, color: '#1d4ed8' }}>₹{Number(financialMatrix.patientLtv.estimatedLifetimeValue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  </div>
               </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr', gap: '30px' }}>
               {/* Left: LTV Segments & Churn Watchlist */}
               <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* LTV Segments */}
                  <div>
                     <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '10px' }}>Economic Segmentation</div>
                     <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '18px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {(financialMatrix.patientLtv.segments || []).map((seg, idx) => {
                           const icon = seg.tier === "High Value" ? "👑" : seg.tier === "Mid Value" ? "💎" : "🌱";
                           const barColor = seg.tier === "High Value" ? "#4f46e5" : seg.tier === "Mid Value" ? "#0f52ba" : "#94a3b8";

                           return (
                              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                       <span>{icon}</span>
                                       <span>{seg.tier}</span>
                                    </span>
                                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b' }}>
                                       {seg.patientCount} patients ({seg.percentage}%)
                                    </span>
                                 </div>
                                 <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                                    <div style={{ width: `${seg.percentage}%`, height: '100%', background: barColor, borderRadius: '3px' }}></div>
                                 </div>
                                 <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '9px', fontWeight: 800, color: barColor }}>
                                    Yield: ₹{Number(seg.totalRevenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  </div>

                  {/* Churn Watchlist */}
                  <div>
                     <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '10px' }}>Churn Risk Alert Watchlist</div>
                     <div style={{ background: '#fff5f5', border: '1px solid #fee2e2', borderRadius: '18px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {(!financialMatrix.patientLtv.churnAlerts || financialMatrix.patientLtv.churnAlerts.length === 0) ? (
                           <div style={{ fontSize: '11px', color: '#991b1b', fontWeight: 800, textAlign: 'center' }}>No active patients categorized under Churn Risk segments.</div>
                        ) : (
                           financialMatrix.patientLtv.churnAlerts.map((c, idx) => (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '10px 14px', borderRadius: '12px', border: '1px solid #fca5a5' }}>
                                 <div>
                                    <div style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>{c.patientName}</div>
                                    <div style={{ fontSize: '9px', fontWeight: 800, color: '#64748b' }}>Last Scan: {c.lastModality} ({c.daysSinceLastScan} days ago)</div>
                                 </div>
                                 <span style={{ 
                                    fontSize: '8px', 
                                    fontWeight: 950, 
                                    background: c.riskLevel === "CRITICAL" ? '#fee2e2' : '#ffedd5', 
                                    color: c.riskLevel === "CRITICAL" ? '#991b1b' : '#c2410c', 
                                    padding: '3px 8px', 
                                    borderRadius: '6px',
                                    border: '1px solid ' + (c.riskLevel === "CRITICAL" ? '#fca5a5' : '#fed7aa')
                                 }}>
                                    {c.riskLevel}
                                 </span>
                              </div>
                           ))
                        )}
                     </div>
                  </div>
               </div>

               {/* Right: Heatmap Cohort Retention */}
               <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '5px' }}>Cohort Retention Heatmap (%)</div>
                  <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '18px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                     {(!financialMatrix.patientLtv.retentionHeatmap || financialMatrix.patientLtv.retentionHeatmap.length === 0) ? (
                        <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', padding: '30px' }}>Insufficient historical registration cohorts to construct heatmap.</div>
                     ) : (
                        <div style={{ overflowX: 'auto', width: '100%' }}>
                           <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '400px' }}>
                              <thead>
                                 <tr>
                                    <th style={{ textAlign: 'left', padding: '8px', color: '#64748b', fontWeight: 900 }}>Cohort Month</th>
                                    <th style={{ textAlign: 'center', padding: '8px', color: '#64748b', fontWeight: 900 }}>Size</th>
                                    <th style={{ textAlign: 'center', padding: '8px', color: '#64748b', fontWeight: 900 }}>M0</th>
                                    <th style={{ textAlign: 'center', padding: '8px', color: '#64748b', fontWeight: 900 }}>M1</th>
                                    <th style={{ textAlign: 'center', padding: '8px', color: '#64748b', fontWeight: 900 }}>M2</th>
                                    <th style={{ textAlign: 'center', padding: '8px', color: '#64748b', fontWeight: 900 }}>M3</th>
                                    <th style={{ textAlign: 'center', padding: '8px', color: '#64748b', fontWeight: 900 }}>M4</th>
                                    <th style={{ textAlign: 'center', padding: '8px', color: '#64748b', fontWeight: 900 }}>M5</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {financialMatrix.patientLtv.retentionHeatmap.map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                       <td style={{ padding: '8px', fontWeight: 950, color: '#1e293b' }}>{row.cohortMonth}</td>
                                       <td style={{ padding: '8px', textAlign: 'center', color: '#475569', fontWeight: 800 }}>{row.size} pts</td>
                                       {(row.retentionRates || []).map((rate, rIdx) => {
                                          let bg = '#f8fafc';
                                          let fg = '#475569';
                                          if (rate > 0) {
                                             const alpha = Math.max(0.1, rate / 100);
                                             bg = `rgba(79, 70, 229, ${alpha})`;
                                             fg = rate > 50 ? 'white' : '#1e1b4b';
                                          }
                                          return (
                                             <td 
                                                key={rIdx} 
                                                style={{ 
                                                   padding: '8px', 
                                                   textAlign: 'center', 
                                                   background: bg, 
                                                   color: fg, 
                                                   fontWeight: 950,
                                                   borderRadius: '6px',
                                                   transition: 'all 0.2s'
                                                }}
                                             >
                                                {rate.toFixed(0)}%
                                             </td>
                                          );
                                       })}
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     )}
                     
                     <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 15px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 950, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>ACQUISITION & RETENTION ADVISORY INSIGHTS</div>
                        <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, margin: 0, lineHeight: '1.4' }}>
                           Cohort retention analysis displays high returning rates during the first 30 days due to post-scan doctor follow-ups, with a typical long-term stabilization. To offset churn risks, configure automated wellness check-ins and diagnostic reminders for patients approaching day 45 post-imaging.
                        </p>
                     </div>
                  </div>
               </div>
            </div>
         </div>
         )}

         {/* Level 3: Demographics & Specialist Leadership */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
           {/* Gender Matrix */}
           <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '30px' }}>Gender Identity Matrix</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                     <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>♂️</div>
                     <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                           <span style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>MALE BIOLOGY</span>
                           <span style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba' }}>{demographics?.gender?.male || 0}</span>
                        </div>
                        <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                           <div style={{ width: `${(demographics?.gender?.male / (demographics?.gender?.male + demographics?.gender?.female + demographics?.gender?.other || 1)) * 100}%`, height: '100%', background: '#0f52ba' }}></div>
                        </div>
                     </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                     <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#fdf2f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>♀️</div>
                     <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                           <span style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>FEMALE BIOLOGY</span>
                           <span style={{ fontSize: '11px', fontWeight: 950, color: '#db2777' }}>{demographics?.gender?.female || 0}</span>
                        </div>
                        <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                           <div style={{ width: `${(demographics?.gender?.female / (demographics?.gender?.male + demographics?.gender?.female + demographics?.gender?.other || 1)) * 100}%`, height: '100%', background: '#db2777' }}></div>
                        </div>
                     </div>
                  </div>
              </div>
           </div>

           {/* Age Stratification */}
           <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '30px' }}>Age Stratification Intel</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {(demographics?.ageGroups || []).map((tier, idx) => (
                     <div key={tier.label || idx}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b' }}>{tier.label.toUpperCase()}</span>
                          <span style={{ fontSize: '10px', fontWeight: 950, color: tier.color }}>{tier.percentage.toFixed(1)}%</span>
                       </div>
                       <div style={{ background: '#f1f5f9', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${tier.percentage}%`, background: tier.color, height: '100%' }}></div>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        </div>
      </div>
    );
  };

  const renderReferralIntel = () => {
    const totalPatientsCount = temporalPatients.length;
    const totalMissions = referralAggregated.reduce((acc, curr) => acc + curr.patients.length, 0);
    const totalPayout = referralAggregated.reduce((acc, curr) => acc + (curr.totalCommission || 0), 0);
    const paidPayout = referralAggregated.reduce((acc, curr) => acc + (curr.paidCommission || 0), 0);
    const unpaidPayout = totalPayout - paidPayout;
    const totalRevenue = referralAggregated.reduce((acc, curr) => acc + (curr.totalRevenue || 0), 0);

    const topModality = (() => {
       const counts = {};
       referralAggregated.forEach(r => {
          Object.entries(r.modalities).forEach(([mod, count]) => {
             counts[mod] = (counts[mod] || 0) + count;
          });
       });
       const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
       return sorted.length > 0 ? sorted[0][0] : 'N/A';
    })();

    return (
      <div className="referral-intel-view fade-in">
        {/* Level 0: Referral Instinct Dashboard */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', 
          gap: '15px', 
          marginBottom: '30px' 
        }}>
           <div style={{ background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', padding: '25px', borderRadius: '24px', color: 'white', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', right: '-10px', top: '-10px', fontSize: '60px', opacity: 0.1 }}>📈</div>
              <span style={{ fontSize: '9px', fontWeight: 950, color: 'var(--tactical-cyan)', textTransform: 'uppercase', letterSpacing: '2px', display: 'block', marginBottom: '10px' }}>Strategic Velocity</span>
              <div style={{ fontSize: '28px', fontWeight: 950 }}>{totalMissions}</div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--tactical-cyan)', marginTop: '5px' }}>Total Studies</div>
           </div>
           
           <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px', display: 'block', marginBottom: '10px' }}>Network Payout</span>
              <div style={{ fontSize: '24px', fontWeight: 950, color: '#1e293b' }}>₹{totalPayout.toLocaleString()}</div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                 <div style={{ fontSize: '9px', fontWeight: 900, color: '#059669' }}>PAID: ₹{paidPayout.toLocaleString()}</div>
                 <div style={{ fontSize: '9px', fontWeight: 900, color: '#dc2626' }}>UNPAID: ₹{unpaidPayout.toLocaleString()}</div>
              </div>
           </div>

           <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px', display: 'block', marginBottom: '10px' }}>Revenue Integrity</span>
              <div style={{ fontSize: '24px', fontWeight: 950, color: '#1e293b' }}>₹{(totalRevenue / (totalMissions || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#dc2626', marginTop: '5px' }}>Avg Revenue / Study</div>
           </div>
        </div>

        {/* Level 1: Tactical Control Deck */}
        <div style={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'stretch' : 'flex-end', 
          gap: '20px', 
          marginBottom: '30px' 
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '12px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '3px', color: '#0f52ba', marginBottom: '15px' }}>Intelligence Engine</h2>
            <div style={{ 
              display: 'flex', 
              background: '#f1f5f9', 
              padding: '4px', 
              borderRadius: '12px', 
              border: '1px solid #e2e8f0',
              overflowX: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              gap: '4px'
            }}>
              {['MATRIX', 'LOG', 'ROSTER', 'PATIENTS'].map(mode => (
                <button 
                  key={mode} 
                  onClick={() => {
                    setReferralViewMode(mode);
                    if (mode === 'PATIENTS') fetchPatientMasterList();
                  }}
                  style={{ 
                    padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                    background: referralViewMode === mode ? 'white' : 'transparent',
                    color: referralViewMode === mode ? '#0f52ba' : '#64748b',
                    boxShadow: referralViewMode === mode ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                    cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '0.5px',
                    whiteSpace: 'nowrap',
                    flex: isMobile ? '0 0 auto' : 1
                  }}
                >
                  {mode === 'MATRIX' ? 'SOURCE ANALYTICS' : mode === 'LOG' ? 'CASE LEDGER' : mode === 'ROSTER' ? 'PARTNER NETWORK' : 'MASTER INDEX'}
                </button>
              ))}
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '15px', alignItems: isMobile ? 'stretch' : 'center' }}>
             {/* Unified Search Sub-node */}
             <div style={{ position: 'relative', width: isMobile ? '100%' : '240px' }}>
                <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.3, fontSize: '12px' }}>🔍</span>
                <input 
                  type="text" 
                  placeholder={
                    referralViewMode === 'MATRIX' ? "FILTER ANALYTICS..." : 
                    referralViewMode === 'LOG' ? "SEARCH CASE LEDGER..." : 
                    referralViewMode === 'ROSTER' ? "FILTER NETWORK..." : "SEARCH MASTER INDEX..."
                  }
                  value={
                    referralViewMode === 'MATRIX' ? referralMatrixSearch : 
                    referralViewMode === 'LOG' ? referralLogSearch : 
                    referralViewMode === 'ROSTER' ? referralRosterSearch : referralPatientsSearch
                  }
                  onChange={e => {
                    const str = e.target.value;
                    if (referralViewMode === 'MATRIX') setReferralMatrixSearch(str);
                    else if (referralViewMode === 'LOG') setReferralLogSearch(str);
                    else if (referralViewMode === 'ROSTER') setReferralRosterSearch(str);
                    else setReferralPatientsSearch(str);
                  }}
                  style={{ 
                    width: '100%', padding: '14px 15px 14px 42px', borderRadius: '14px', border: '1px solid #e2e8f0', 
                    fontSize: '11px', fontWeight: 900, background: 'white', outline: 'none', transition: 'all 0.3s'
                  }} 
                />
             </div>

              {/* Temporal Unit */}
             <div style={{ 
               display: 'flex', 
               background: '#f8fafc', 
               padding: '4px', 
               borderRadius: '16px', 
               border: '1px solid #e2e8f0',
               width: isMobile ? '100%' : 'auto',
               justifyContent: 'space-between'
             }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['SINGLE', 'RANGE', 'ALL'].map(mode => (
                    <button 
                      key={mode}
                      onClick={() => setReferralFilterMode(mode)}
                      style={{ 
                        padding: '10px 18px', borderRadius: '12px', border: 'none', fontSize: '9px', fontWeight: 950,
                        background: referralFilterMode === mode ? '#1e293b' : 'transparent',
                        color: referralFilterMode === mode ? 'white' : '#64748b',
                        cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '1px'
                      }}
                    >
                      {mode === 'SINGLE' ? 'D' : mode === 'RANGE' ? 'R' : 'ALL'}
                    </button>
                  ))}
                </div>
                {referralFilterMode !== 'ALL' && (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', paddingRight: '10px' }}>
                    <input 
                      type="date" 
                      value={referralRange.start} 
                      onChange={e => setReferralRange(prev => ({ ...prev, start: e.target.value }))}
                      style={{ border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 950, color: '#1e293b', outline: 'none' }}
                    />
                    {referralFilterMode === 'RANGE' && (
                      <>
                        <span style={{ fontSize: '12px', color: '#cbd5e1' }}>→</span>
                        <input 
                          type="date" 
                          value={referralRange.end} 
                          onChange={e => setReferralRange(prev => ({ ...prev, end: e.target.value }))}
                          style={{ border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 950, color: '#1e293b', outline: 'none' }}
                        />
                      </>
                    )}
                  </div>
                )}
             </div>

             {/* Tactical Export Node */}
             <div style={{ position: 'relative' }}>
                <button 
                  onClick={() => setShowExportOverlay(!showExportOverlay)}
                  disabled={isExporting}
                  style={{ 
                    padding: '10px 20px', borderRadius: '14px', background: '#f0f3fd', border: '1px solid #0f52ba30',
                    color: '#0f52ba', fontSize: '9px', fontWeight: 950, letterSpacing: '1px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
                  }}
                >
                  {isExporting ? 'GENERATING...' : '📥 EXPORT INTEL'}
                </button>

                {showExportOverlay && (
                  <>
                    <div 
                      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, background: 'transparent' }} 
                      onClick={() => setShowExportOverlay(false)}
                    />
                    <div style={{ 
                      position: 'absolute', top: '100%', right: 0, marginTop: '10px', width: '320px', 
                      background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', 
                      boxShadow: '0 10px 40px rgba(0,0,0,0.1)', padding: '25px', zIndex: 1000 
                    }}>
                    <div style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '20px' }}>EXPORT PARAMETERS</div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <input 
                            type="checkbox" 
                            checked={exportParams.allTime} 
                            onChange={(e) => setExportParams(prev => ({ ...prev, allTime: e.target.checked }))} 
                            id="export-all-time"
                          />
                          <label htmlFor="export-all-time" style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>ALL HISTORICAL REFERRALS</label>
                       </div>

                       {!exportParams.allTime && (
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                               <span style={{ fontSize: '9px', fontWeight: 900, color: '#64748b' }}>START DATE</span>
                               <input type="date" value={exportParams.start} onChange={e => setExportParams(prev => ({ ...prev, start: e.target.value }))} style={{ border: '1px solid #e2e8f0', padding: '6px 10px', borderRadius: '8px', fontSize: '11px' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                               <span style={{ fontSize: '9px', fontWeight: 900, color: '#64748b' }}>END DATE</span>
                               <input type="date" value={exportParams.end} onChange={e => setExportParams(prev => ({ ...prev, end: e.target.value }))} style={{ border: '1px solid #e2e8f0', padding: '6px 10px', borderRadius: '8px', fontSize: '11px' }} />
                            </div>
                         </div>
                       )}

                       <button 
                         onClick={handleExportIntelligence}
                         style={{ 
                           marginTop: '10px', padding: '12px', borderRadius: '12px', 
                           background: '#0f52ba', color: 'white', fontWeight: 950, 
                           fontSize: '10px', border: 'none', cursor: 'pointer', letterSpacing: '1px' 
                         }}
                       >
                         {isExporting ? 'Exporting...' : 'Export Data'}
                       </button>
                    </div>
                  </div>
                </>
              )}
             </div>
          </div>
        </div>

        {referralLoading ? (
            <div style={{ padding: '120px', textAlign: 'center' }}>
                <div className="pulse-loader"></div>
                <p style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', marginTop: '25px', letterSpacing: '2px' }}>Loading referral data...</p>
            </div>
        ) : (
          <>

            {/* Level 3: Dual-Mode Intelligence List */}
            {referralViewMode === 'PATIENTS' ? (
              <div style={{ 
                background: 'white', 
                borderRadius: '24px', 
                border: '1px solid #e2e8f0', 
                overflow: 'hidden',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '800px' : '100%' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ID</th>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>PTID (IDENTIFIER)</th>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>FULL NAME</th>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CONTACT NODE</th>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>AGE / GENDER</th>
                      <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>REG DATE</th>
                      <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingMaster ? (
                       <tr><td colSpan="7" style={{ padding: '60px', textAlign: 'center' }}><div className="pulse-loader" style={{ margin: '0 auto' }}></div></td></tr>
                    ) : patientMasterList.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>NO REGISTERED PATIENTS FOUND FOR THIS PERIOD</td>
                      </tr>
                    ) : (
                      patientMasterList.map((p, i) => (
                        <tr key={p.patientId} style={{ borderBottom: '1px solid #f1f5f9', transition: 'all 0.2s' }}>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8' }}>#{i + 1}</div>
                          </td>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ padding: '4px 10px', background: '#f0f3fd', color: '#0f52ba', borderRadius: '6px', fontSize: '10px', fontWeight: 950, display: 'inline-block' }}>{p.patientIdentifier || 'UNSET'}</div>
                          </td>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>{(p.fullName || 'Unknown').toUpperCase()}</div>
                          </td>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{p.mobile}</div>
                          </td>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>{p.age}Y / {(p.gender || 'U').toUpperCase()}</div>
                          </td>
                          <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba' }}>{new Date(p.registeredAt).toLocaleDateString()}</div>
                          </td>
                          <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                             <button 
                               onClick={() => {
                                 setEditingPatient({
                                   patientId: p.patientId,
                                   fullName: p.fullName,
                                   mobile: p.mobile,
                                   age: p.age,
                                   gender: p.gender,
                                   village: p.village,
                                   district: p.district,
                                   address: p.address,
                                   sourceOfInfo: p.sourceOfInfo
                                 });
                                 setIsPatientEditDrawerOpen(true);
                               }}
                               style={{ 
                                 padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', 
                                 borderRadius: '6px', fontSize: '9px', fontWeight: 950, color: '#0f52ba', 
                                 cursor: 'pointer', transition: 'all 0.2s' 
                                }}
                             >
                               EDIT
                             </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : referralViewMode === 'ROSTER' ? (
              <div style={{ 
                background: 'white', 
                borderRadius: '24px', 
                border: '1px solid #e2e8f0', 
                overflow: 'hidden',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch'
              }}>
                <div style={{ padding: '25px 30px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fcfdfe', minWidth: isMobile ? '800px' : '100%' }}>
                   <div style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b', letterSpacing: '1px' }}>PARTNER NETWORK ROSTER</div>
                   <div style={{ display: 'flex', gap: '10px' }}>
                     <button 
                       onClick={() => {
                         setEditingReferrer({ name: '', contact: '', address: '' });
                         setIsReferrerEditDrawerOpen(true);
                       }}
                       style={{ padding: '8px 16px', borderRadius: '12px', background: '#0f52ba', color: 'white', fontSize: '10px', fontWeight: 950, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', border: 'none' }}
                     >
                       ➕ ADD NEW PARTNER
                     </button>
                     <button 
                       onClick={handleExportRoster}
                       style={{ padding: '8px 16px', borderRadius: '12px', background: '#f0f3fd', border: '1px solid #0f52ba30', color: '#0f52ba', fontSize: '10px', fontWeight: 950, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                     >
                       📥 DOWNLOAD PARTNER ROSTER (CSV)
                     </button>
                   </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '800px' : '100%' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>RANK</th>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>REFERRAL SOURCE</th>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.5px' }}>Contact</th>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.5px' }}>Address</th>
                      <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.5px' }}>Total Studies</th>
                      <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caseLedgerList.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>NO RECONNAISSANCE DATA AVAILABLE FOR THIS PERIOD</td>
                      </tr>
                    ) : (
                      caseLedgerList
                        .filter(s => !referralRosterSearch || s.name.toLowerCase().includes(referralRosterSearch.toLowerCase()))
                        .map((s, i) => (
                        <tr key={s.name || s.referrerId} style={{ borderBottom: '1px solid #f1f5f9', transition: 'all 0.2s' }}>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: i < 3 ? '#f0f3fd' : '#f8fafc', color: i < 3 ? '#0f52ba' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 950 }}>#{i + 1}</div>
                          </td>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>{(s.name || 'Anonymous').toUpperCase()}</div>
                          </td>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{s.contact}</div>
                          </td>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>{s.address || 'GLOBAL'}</div>
                          </td>
                          <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                            <div style={{ fontSize: '16px', fontWeight: 950, color: '#0f52ba' }}>{s.patients?.length || 0}</div>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px' }}>UNITS</div>
                          </td>
                          <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                              <button 
                                onClick={() => {
                                   setEditingReferrer(s);
                                   setIsReferrerEditDrawerOpen(true);
                                }}
                                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#0f52ba', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}
                              >
                                EDIT
                              </button>
                           </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : referralViewMode === 'MATRIX' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '30px', alignItems: 'flex-start' }}>
                {/* Master Pane: Intelligence Roster */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '5px' }}>Referral List</div>
                  {referralAggregated.map((s, i) => {
                    const isSelected = expandedReferrer === s.name;
                    return (
                      <div 
                        key={s.name} 
                        onClick={() => setExpandedReferrer(s.name)}
                        style={{ 
                          background: isSelected ? '#f0f3fd' : 'white', 
                          padding: '20px 25px', borderRadius: '18px', border: isSelected ? '1px solid #0f52ba' : '1px solid #e2e8f0', 
                          cursor: 'pointer', transition: 'all 0.2s', position: 'relative', overflow: 'hidden'
                        }}
                      >
                        {isSelected && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: '#0f52ba' }}></div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                             <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: isSelected ? 'white' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', border: '1px solid #f1f5f9' }}>👤</div>
                             <div>
                                <div style={{ fontSize: '12px', fontWeight: 950, color: isSelected ? '#0f52ba' : '#1e293b' }}>{(s.name || 'Anonymous').toUpperCase()}</div>
                                <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 800 }}>RANK #{i + 1} • {s.patients.length} UNITS</div>
                                 <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
                                    <div style={{ fontSize: '8px', fontWeight: 950, color: '#059669' }}>₹{(s.paidCommission || 0).toLocaleString()} PAID</div>
                                    <div style={{ fontSize: '8px', fontWeight: 950, color: '#dc2626' }}>₹{(s.unpaidCommission || 0).toLocaleString()} PENDING</div>
                                 </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                                   <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 850 }}>{s.contact}</div>
                                   <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{s.address}</div>
                                </div>
                             </div>
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 950, color: isSelected ? '#0f52ba' : '#cbd5e1' }}>→</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Detail Pane: Referral Briefing */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {expandedReferrer ? (
                    (() => {
                      const selected = referralAggregated.find(r => r.name === expandedReferrer);
                      if (!selected) return null;
                      const percentage = totalPatientsCount > 0 ? (selected.patients.length / totalPatientsCount) * 100 : 0;

return (
                        <div style={{ background: 'white', borderRadius: '30px', border: '1px solid #e2e8f0', overflow: isTestMode ? 'visible' : 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
                          <div style={{ padding: '35px 40px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', background: '#fcfdfe' }}>
                             <div>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#0f52ba', letterSpacing: '0', marginBottom: '8px' }}>Referral Summary</div>
                                <div style={{ fontSize: '22px', fontWeight: 950, color: '#1e293b', letterSpacing: '-0.5px' }}>{(selected.name || 'Anonymous').toUpperCase()}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '15px' }}>
                                    <div style={{ padding: '6px 12px', background: '#eff6ff', borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#2563eb' }}>
                                       {selected.patients.length} Studies
                                    </div>
                                    <div style={{ padding: '6px 12px', background: '#ecfdf5', borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#059669' }}>
                                       ₹{(selected.totalRevenue || 0).toLocaleString()} YIELD
                                    </div>
                                    <div style={{ padding: '6px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#d97706' }}>
                                       ₹{(selected.totalDiscount || 0).toLocaleString()} DISCOUNT
                                    </div>
                                    <div style={{ padding: '6px 12px', background: '#eff6ff', borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#2563eb' }}>
                                       ₹{(selected.paidCommission || 0).toLocaleString()} PAID
                                    </div>
                                    <div style={{ padding: '6px 12px', background: '#fef2f2', borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#dc2626' }}>
                                       ₹{(selected.unpaidCommission || 0).toLocaleString()} PENDING
                                    </div>
                                    <div style={{ padding: '6px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#16a34a' }}>
                                       ₹{(selected.netProfit || 0).toLocaleString()} NET PROFIT
                                    </div>
                                 </div>
                             </div>
                             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: isMobile ? 'flex-start' : 'flex-end', maxWidth: isMobile ? '100%' : '300px', marginTop: isMobile ? '20px' : 0 }}>
                                <div style={{ textAlign: 'center', minWidth: '80px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc' }}>
                                   <div style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba' }}>₹{(selected.totalCommission || 0).toLocaleString()}</div>
                                   <div style={{ fontSize: '8px', fontWeight: 800, color: '#94a3b8' }}>TOTAL PAYOUT</div>
                                </div>
                                {Object.entries(selected.modalities).map(([mod, count]) => (
                                   <div key={mod} style={{ textAlign: 'center', minWidth: '60px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '12px', background: 'white' }}>
                                      <div style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>{count}</div>
                                      <div style={{ fontSize: '8px', fontWeight: 800, color: '#94a3b8' }}>{mod}</div>
                                   </div>
                                ))}
                             </div>
                          </div>

                           {/* Physician PRM ROI & Loyalty Console */}
                           <div style={{ padding: '0 30px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', marginTop: '10px', marginBottom: '10px' }}>
                              {/* ROI Multiplier Card */}
                              {(() => {
                                 const roiValue = selected.totalCommission > 0 ? (selected.totalRevenue / selected.totalCommission) : 999;
                                 const isInfinite = roiValue === 999;
                                 const roiLabel = isInfinite ? '∞ (Direct)' : `${roiValue.toFixed(1)}x`;
                                 const statusColor = isInfinite || roiValue >= 8.0 ? '#10b981' : roiValue >= 4.0 ? '#3b82f6' : '#ea580c';
                                 const statusText = isInfinite || roiValue >= 8.0 ? 'HIGH MARGIN PARTNER 🌟' : roiValue >= 4.0 ? 'SOLID PERFORMER 👍' : 'LOW MARGIN AWARENESS ⚠️';
                                 
                                 return (
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Physician ROI Multiplier</span>
                                          <span style={{ fontSize: '8px', fontWeight: 950, color: statusColor, background: 'white', padding: '3px 8px', borderRadius: '6px', border: '1px solid', borderColor: statusColor }}>
                                             {statusText}
                                          </span>
                                       </div>
                                       <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                          <span style={{ fontSize: '28px', fontWeight: 950, color: '#1e293b' }}>{roiLabel}</span>
                                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>RETURN RATIO</span>
                                       </div>
                                       <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 650, lineHeight: '1.4' }}>
                                          This referring physician generates <strong style={{ color: '#1e293b' }}>₹{roiLabel === '∞ (Direct)' ? 'Infinite' : roiLabel}</strong> in gross billed diagnostics for every ₹1 paid in network payouts.
                                       </div>
                                    </div>
                                 );
                              })()}

                              {/* Cohort Loyalty & Acquisition Card */}
                              {(() => {
                                 const uniqueNames = new Set((selected.patients || []).map(p => (p.name || '').toLowerCase().trim()));
                                 const uniqueCount = uniqueNames.size;
                                 const totalScans = selected.patients.length;
                                 const repeatCount = Math.max(0, totalScans - uniqueCount);
                                 const repeatPercentage = totalScans > 0 ? (repeatCount / totalScans) * 100 : 0;
                                 
                                 return (
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Patient Acquisition & Loyalty</span>
                                          <span style={{ fontSize: '8px', fontWeight: 950, color: '#3b82f6', background: 'white', padding: '3px 8px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                                             RETENTION: {repeatPercentage.toFixed(0)}%
                                          </span>
                                       </div>
                                       <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                          <span style={{ fontSize: '28px', fontWeight: 950, color: '#1e293b' }}>{uniqueCount} <span style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8' }}>/ {totalScans}</span></span>
                                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>NEW PATIENTS</span>
                                       </div>
                                       <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontWeight: 900, color: '#64748b' }}>
                                             <span>Acquisition Stream</span>
                                             <span>{uniqueCount} New • {repeatCount} Returning</span>
                                          </div>
                                          <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                                             <div style={{ width: `${(uniqueCount / totalScans) * 100}%`, height: '100%', background: '#3b82f6' }}></div>
                                             <div style={{ width: `${(repeatCount / totalScans) * 100}%`, height: '100%', background: '#10b981' }}></div>
                                          </div>
                                       </div>
                                    </div>
                                 );
                              })()}
                           </div>

                          <div style={{ padding: '30px' }}>
                             {/* Referral Case Table Selection Hub */}
                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 500, color: '#64748b', letterSpacing: '0' }}>
                                   {selectedLedgerRows.length > 0 ? `${selectedLedgerRows.length} records selected` : 'Case Records'}
                                </div>
                                {selectedLedgerRows.length > 0 && (
                                   <div style={{ display: 'flex', gap: '10px' }}>
                                      <button 
                                        onClick={() => handleExportLedger('EXCEL')}
                                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #10b981', background: '#ecfdf5', color: '#059669', fontSize: '9px', fontWeight: 950, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                      >
                                        📥 DOWNLOAD EXCEL
                                      </button>
                                      <button 
                                        onClick={() => handleExportLedger('WHATSAPP')}
                                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #25d366', background: '#e8faf0', color: '#128c7e', fontSize: '9px', fontWeight: 950, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                      >
                                        💬 SHARE ON WHATSAPP
                                      </button>
                                      <button 
                                        onClick={() => setSelectedLedgerRows([])}
                                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}
                                      >
                                        RESET
                                      </button>
                                   </div>
                                )}
                             </div>

                             {/* Referral Case Table */}
                             <div style={{ borderRadius: '20px', border: '1px solid #f1f5f9', overflow: 'hidden', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '900px' : '100%' }}>
                                  <thead style={{ background: '#fcfdfe' }}>
                                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', width: '40px' }}>
                                         <input 
                                           type="checkbox" 
                                           checked={isAllLedgerSelected(selected.patients)} 
                                           onChange={() => toggleAllLedger(selected.patients)} 
                                           style={{ cursor: 'pointer' }}
                                         />
                                      </th>
                                      <th style={{ padding: '15px 15px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ID</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>TARGET_IDENTITY</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CONTACT / SOURCE</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CLINICAL PACKAGE</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>COMMISSION</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>STATUS</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'right', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>DATE</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selected.patients.map(p => {
                                      const rowId = p.appointmentId || p.patientId;
                                      const isSelected = selectedLedgerRows.includes(rowId);
                                      return (
                                        <tr key={rowId} style={{ borderBottom: '1px solid #f8fafc', background: isSelected ? '#f0f7ff' : 'transparent', transition: 'all 0.2s' }}>
                                          <td style={{ padding: '15px 25px' }}>
                                             <input 
                                               type="checkbox" 
                                               checked={isSelected} 
                                               onChange={() => toggleLedgerSelection(rowId)} 
                                               style={{ cursor: 'pointer' }}
                                             />
                                          </td>
                                          <td style={{ padding: '15px 15px', fontSize: '11px', fontWeight: 950, color: '#0f52ba', fontFamily: 'monospace' }}>{p.patientIdentifier || 'UNSET'}</td>
                                          <td style={{ padding: '15px 25px' }}>
                                             <div style={{ fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>{(p.name || 'Unknown').toUpperCase()}</div>
                                             <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>{p.age}Y • {(p.gender || 'U').toUpperCase()}</div>
                                          </td>
                                          <td style={{ padding: '15px 25px' }}>
                                             <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>{p.mobile}</div>
                                             <div style={{ fontSize: '9px', color: '#0f52ba', fontWeight: 950, textTransform: 'uppercase' }}>{p.sourceOfInfo || 'DIRECT'}</div>
                                          </td>
                                          <td style={{ padding: '15px 25px' }}>
                                             <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                <span style={{ fontSize: '9px', color: 'white', background: '#334155', padding: '2px 8px', borderRadius: '4px', fontWeight: 950 }}>{p.modality}</span>
                                                <span style={{ fontSize: '9px', color: '#475569', border: '1px solid #e2e8f0', padding: '1px 6px', borderRadius: '4px', fontWeight: 850 }}>{p.service}</span>
                                             </div>
                                          </td>
                                          <td style={{ padding: '15px 25px' }}>
                                             <div style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>₹{(p.commissionAmount || 0).toLocaleString()}</div>
                                             <div style={{ fontSize: '8px', fontWeight: 800, color: p.commissionStatus === 'Paid' ? '#059669' : '#dc2626' }}>{(p.commissionStatus || 'Unpaid').toUpperCase()}</div>
                                          </td>
                                          <td style={{ padding: '15px 25px' }}>
                                             {(() => {
                                                const cfg = getStatusConfig(p.status);
                                                return <span style={{ fontSize: '8px', fontWeight: 950, padding: '3px 8px', borderRadius: '6px', background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                                             })()}
                                          </td>
                                          <td style={{ padding: '15px 25px', fontSize: '11px', color: '#94a3b8', textAlign: 'right', fontWeight: 900 }}>{p.registrationDate}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                             </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div style={{ padding: '100px', textAlign: 'center', background: 'white', borderRadius: '30px', border: '1px dashed #cbd5e1' }}>
                       <div style={{ fontSize: '50px', marginBottom: '20px' }}>🧭</div>
                       <div style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b' }}>SELECT A SOURCE FROM ROSTER</div>
                       <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '10px' }}>Pick a referring target on the left to initialize the referral details.</p>
                    </div>
                  )}
                </div>
              </div>
                                    ) : referralViewMode === 'LOG' ? (
              /* Unified Referral Intelligence: Matrix + Case Ledger showing all registered doctors */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                 {/* 1. Tactical Matrix Grid */}
                 <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: isTestMode ? 'visible' : 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.01)', padding: '30px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: '25px', flexDirection: isMobile ? 'column' : 'row', gap: '20px' }}>
                       <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', gap: '20px', flexDirection: isMobile ? 'column' : 'row' }}>
                         <div>
                           <h3 style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b', margin: 0 }}>SOURCE ANALYTICS MATRIX</h3>
                           <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Temporal volume density across all registered partners</p>
                         </div>
                         <button 
                           onClick={handleExportMatrix}
                           style={{ padding: '12px 18px', borderRadius: '14px', background: '#f0f3fd', border: '1px solid #0f52ba30', color: '#0f52ba', fontSize: '10px', fontWeight: 950, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                         >
                           📥 DOWNLOAD MATRIX (CSV)
                         </button>
                       </div>
                       <div style={{ display: 'flex', gap: '15px', alignItems: 'center', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
                         {matrixPeriod === 'DAY' && (
                           <input 
                             type="date"
                             value={matrixDateStr}
                             onChange={(e) => e.target.value && setMatrixDateStr(e.target.value)}
                             style={{ padding: '10px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                           />
                         )}
                         {matrixPeriod === 'WEEK' && (
                           <>
                             <input 
                               type="month"
                               value={matrixDateStr.substring(0,7)}
                               onChange={(e) => e.target.value && setMatrixDateStr(e.target.value + '-01')}
                               style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                             />
                             <select
                               value={matrixWeekIndex}
                               onChange={(e) => setMatrixWeekIndex(parseInt(e.target.value))}
                               style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                             >
                               <option value={1}>Week 1 (1st - 7th)</option>
                               <option value={2}>Week 2 (8th - 14th)</option>
                               <option value={3}>Week 3 (15th - 21st)</option>
                               <option value={4}>Week 4 (22nd - End)</option>
                             </select>
                           </>
                         )}
                         {matrixPeriod === 'MONTH' && (
                           <input 
                             type="month"
                             value={matrixDateStr.substring(0,7)}
                             onChange={(e) => e.target.value && setMatrixDateStr(e.target.value + '-01')}
                             style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                           />
                         )}
                         {matrixPeriod === 'YEAR' && (
                           <input 
                             type="number"
                             min="2000"
                             max="2100"
                             step="1"
                             value={matrixDateStr.substring(0,4)}
                             onChange={(e) => e.target.value && setMatrixDateStr(`${e.target.value}-01-01`)}
                             style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc', width: '90px' }}
                           />
                         )}
                         <div style={{ display: 'flex', gap: '5px', background: '#f8fafc', padding: '6px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                           {['DAY', 'WEEK', 'MONTH', 'YEAR'].map(p => (
                             <button
                               key={p}
                               onClick={() => setMatrixPeriod(p)}
                               style={{
                                 padding: '8px 16px',
                                 borderRadius: '8px',
                                 border: 'none',
                                 fontSize: '9px',
                                 fontWeight: 950,
                                 background: matrixPeriod === p ? 'white' : 'transparent',
                                 color: matrixPeriod === p ? '#0f52ba' : '#64748b',
                                 boxShadow: matrixPeriod === p ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                                 cursor: 'pointer',
                                 transition: 'all 0.2s'
                               }}
                             >
                               {p}
                             </button>
                           ))}
                         </div>
                       </div>
                    </div>

                    {temporalMatrixData?.rows.length > 0 ? (
                       <div style={{ overflowX: 'auto', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                         <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                           <thead>
                             <tr>
                               <th style={{ padding: '15px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: '#94a3b8', borderBottom: '2px solid #f1f5f9', background: '#fcfdfe', position: 'sticky', left: 0, zIndex: 10, minWidth: '200px' }}>REFERRING SOURCE</th>
                               {temporalMatrixData?.cols.map(c => (
                                 <th key={c} style={{ padding: '15px 20px', textAlign: 'center', fontSize: '11px', fontWeight: 900, color: '#94a3b8', borderBottom: '2px solid #f1f5f9', background: '#fcfdfe', whiteSpace: 'nowrap' }}>
                                   {c.toUpperCase()}
                                 </th>
                               ))}
                               <th style={{ padding: '15px 20px', textAlign: 'center', fontSize: '11px', fontWeight: 900, color: '#0f52ba', borderBottom: '2px solid #f1f5f9', background: '#fcfdfe', whiteSpace: 'nowrap' }}>TOTAL PULL</th>
                             </tr>
                           </thead>
                           <tbody>
                             {temporalMatrixData?.rows.map((row) => (
                               <tr key={row.name} style={{ borderBottom: '1px solid #f8fafc' }}>
                                 <td style={{ padding: '15px 20px', position: 'sticky', left: 0, background: 'white', zIndex: 5, borderRight: '1px solid #f1f5f9' }}>
                                   <div style={{ fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>{(row.name || 'ANONYMOUS').toUpperCase()}</div>
                                   <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>{row.contact || 'No Contact Info'}</div>
                                 </td>
                                 {temporalMatrixData?.cols.map(c => {
                                   const count = row.counts[c] || 0;
                                   return (
                                     <td key={c} style={{ padding: '15px 20px', textAlign: 'center' }}>
                                       {count > 0 ? (
                                         <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', color: '#16a34a', width: '28px', height: '28px', borderRadius: '8px', fontSize: '12px', fontWeight: 900 }}>
                                           {count}
                                         </div>
                                       ) : (
                                         <div style={{ color: '#ef4444', fontSize: '14px', fontWeight: 900, opacity: 0.3 }}>✗</div>
                                       )}
                                     </td>
                                   );
                                 })}
                                 <td style={{ padding: '15px 20px', textAlign: 'center' }}>
                                   <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', color: '#0f52ba', width: '32px', height: '32px', borderRadius: '10px', fontSize: '13px', fontWeight: 900 }}>
                                     {row.total}
                                   </div>
                                 </td>
                               </tr>
                             ))}
                           </tbody>
                         </table>
                       </div>
                    ) : (
                       <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>No temporal density markers detected in this period.</div>
                    )}
                 </div>
              </div>
            ) : (
              /* Global Referral Matrix View */
              <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: isTestMode ? 'visible' : 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.01)', padding: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#1e293b', margin: 0 }}>SOURCE ANALYTICS MATRIX</h3>
                    <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Temporal volume density across diagnostic network</p>
                  </div>
                  <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    {matrixPeriod === 'DAY' && (
                      <input 
                        type="date"
                        value={matrixDateStr}
                        onChange={(e) => e.target.value && setMatrixDateStr(e.target.value)}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                      />
                    )}
                    {matrixPeriod === 'WEEK' && (
                      <>
                        <input 
                          type="month"
                          value={matrixDateStr.substring(0,7)}
                          onChange={(e) => e.target.value && setMatrixDateStr(e.target.value + '-01')}
                          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                        />
                        <select
                          value={matrixWeekIndex}
                          onChange={(e) => setMatrixWeekIndex(parseInt(e.target.value))}
                          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                        >
                          <option value={1}>Week 1 (1st - 7th)</option>
                          <option value={2}>Week 2 (8th - 14th)</option>
                          <option value={3}>Week 3 (15th - 21st)</option>
                          <option value={4}>Week 4 (22nd - End)</option>
                        </select>
                      </>
                    )}
                    {matrixPeriod === 'MONTH' && (
                      <input 
                        type="month"
                        value={matrixDateStr.substring(0,7)}
                        onChange={(e) => e.target.value && setMatrixDateStr(e.target.value + '-01')}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                      />
                    )}
                    {matrixPeriod === 'YEAR' && (
                      <input 
                        type="number"
                        min="2000"
                        max="2100"
                        step="1"
                        value={matrixDateStr.substring(0,4)}
                        onChange={(e) => e.target.value && setMatrixDateStr(`${e.target.value}-01-01`)}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc', width: '90px' }}
                      />
                    )}
                    <div style={{ display: 'flex', gap: '5px', background: '#f8fafc', padding: '6px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                      {['DAY', 'WEEK', 'MONTH', 'YEAR'].map(period => (
                        <button
                          key={period}
                          onClick={() => setMatrixPeriod(period)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            background: matrixPeriod === period ? 'white' : 'transparent',
                            color: matrixPeriod === period ? '#0f52ba' : '#64748b',
                            fontSize: '11px',
                            fontWeight: 850,
                            cursor: 'pointer',
                            boxShadow: matrixPeriod === period ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                            transition: 'all 0.2s'
                          }}
                        >
                          {period}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {temporalMatrixData?.rows.length > 0 && (
                  <div style={{ overflowX: 'auto', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '15px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: '#94a3b8', borderBottom: '2px solid #f1f5f9', background: '#fcfdfe', position: 'sticky', left: 0, zIndex: 10, minWidth: '200px' }}>REFERRING SOURCE</th>
                          {temporalMatrixData?.cols.map(c => (
                            <th key={c} style={{ padding: '15px 20px', textAlign: 'center', fontSize: '11px', fontWeight: 900, color: '#94a3b8', borderBottom: '2px solid #f1f5f9', background: '#fcfdfe', whiteSpace: 'nowrap' }}>
                              {c.toUpperCase()}
                            </th>
                          ))}
                          <th style={{ padding: '15px 20px', textAlign: 'center', fontSize: '11px', fontWeight: 900, color: '#0f52ba', borderBottom: '2px solid #f1f5f9', background: '#fcfdfe', whiteSpace: 'nowrap' }}>TOTAL PULL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {temporalMatrixData?.rows.map((row) => (
                          <tr key={row.name} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s', ':hover': { background: '#f8fafc' } }}>
                            <td style={{ padding: '15px 20px', position: 'sticky', left: 0, background: 'white', zIndex: 5, borderRight: '1px solid #f1f5f9' }}>
                              <div style={{ fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>{(row.name || 'ANONYMOUS').toUpperCase()}</div>
                              <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>{row.contact || 'No Contact Info'}</div>
                            </td>
                            {temporalMatrixData?.cols.map(c => {
                              const count = row.counts[c] || 0;
                              return (
                                <td key={c} style={{ padding: '15px 20px', textAlign: 'center' }}>
                                  {count > 0 ? (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', color: '#16a34a', width: '28px', height: '28px', borderRadius: '8px', fontSize: '12px', fontWeight: 900 }}>
                                      {count}
                                    </div>
                                  ) : (
                                    <div style={{ color: '#ef4444', fontSize: '14px', fontWeight: 900 }}>✗</div>
                                  )}
                                </td>
                              );
                            })}
                            <td style={{ padding: '15px 20px', textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', color: '#0f52ba', width: '32px', height: '32px', borderRadius: '10px', fontSize: '13px', fontWeight: 900 }}>
                                {row.total}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {(referralViewMode === 'LOG' ? (temporalMatrixData?.rows.length === 0) : (temporalPatients.length === 0)) && (
              <div style={{ padding: '150px 20px', textAlign: 'center', background: 'white', borderRadius: '40px', border: '1px dashed #cbd5e1' }}>
                <div style={{ fontSize: '60px', marginBottom: '25px' }}>📡</div>
                <div style={{ fontSize: '18px', fontWeight: 950, color: '#1e293b' }}>NO REFERRAL DATA FOUND</div>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '10px', maxWidth: '350px', margin: '15px auto', fontWeight: 600 }}>The active scan yielded zero signatures. Synchronize parameters or check global registry.</p>
              </div>
            )}
          </>
        )}
      </div>
    );
  };
  const renderLayouts = () => (
    <div className="layouts-view">
       <div className="board-header" style={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'flex-start' : 'center', 
          marginBottom: '30px',
          gap: '20px'
        }}>
         <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', color: '#888' }}>Reporting Protocol Design</h2>
         <button className="btn-primary" onClick={() => handleOpenLayoutDrawer()} style={{ width: isMobile ? '100%' : 'auto' }}>+ New Configuration</button>
       </div>
       <div className="table-container">
          <table className="data-table">
             <thead><tr><th>Layout Registry</th><th>Modality</th><th>Sector</th><th>State</th><th>Actions</th></tr></thead>
             <tbody>
               {layouts.map(l => (
                 <tr key={l.id}>
                    <td style={{ fontWeight: 700, color: '#0f52ba' }}>{(l.name || 'Unnamed Protocol').toUpperCase()}</td>
                    <td><span className="file-badge" style={{ padding: '4px 8px' }}>{l.modality || 'General'}</span></td>
                    <td>{l.type || 'N/A'}</td>
                    <td><span style={{ color: l.active ? '#2ecc71' : '#aaa', fontSize: '11px', fontWeight: 900 }}>{l.active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                    <td>
                       <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <button className="btn-logout" style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 800 }} onClick={() => handleOpenLayoutDrawer(l)}>CONFIGURE</button>
                          <button className="btn-icon" style={{ color: '#e74c3c', opacity: 0.8 }} onClick={() => handleDeleteLayout(l.id)} title="Delete Protocol Template">🗑️</button>
                       </div>
                    </td>
                 </tr>
               ))}
             </tbody>
          </table>
       </div>
    </div>
  );

  const renderUserManagement = () => (
    <div className="users-view">
      <div className="board-header" style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'flex-start' : 'center', 
        marginBottom: '35px',
        gap: '20px'
      }}>
        <div>
          <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', color: '#0f52ba', marginBottom: '4px' }}>Hospital Personnel Roster</h2>
          <p style={{ fontSize: '11px', color: '#888', fontWeight: 600 }}>Active deployment and credential management for clinical staff.</p>
        </div>
        
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '20px', alignItems: isMobile ? 'flex-start' : 'center', width: isMobile ? '100%' : 'auto' }}>
          {/* Tactical Search bar */}
          <div style={{ position: 'relative', width: isMobile ? '100%' : '300px' }}>
            <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
            <input 
              type="text" 
              placeholder="SEARCH BY IDENTITY / ROLE..." 
              value={personnelSearch}
              onChange={e => {
                setPersonnelSearch(e.target.value);
                setStaffCurrentPage(1);
              }}
              style={{ 
                width: '100%', padding: '12px 15px 12px 45px', borderRadius: '12px', border: '1px solid #eee', 
                fontSize: '10px', fontWeight: 950, letterSpacing: '1px', outline: 'none',
                transition: 'all 0.3s ease', boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
              }}
              onFocus={(e) => { e.target.style.borderColor = '#0f52ba'; e.target.style.boxShadow = '0 4px 15px rgba(15, 82, 186, 0.1)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#eee'; e.target.style.boxShadow = '0 2px 10px rgba(0,0,0,0.02)'; }}
            />
          </div>
          <button 
            className="btn-primary" 
            onClick={() => handleOpenUserDrawer()}
            style={{ 
              width: isMobile ? '100%' : 'auto',
              padding: '12px 24px', borderRadius: '12px', border: 'none', 
              background: 'linear-gradient(90deg, #0f52ba 0%, #00f2fe 100%)', 
              color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(15, 82, 186, 0.2)'
            }}
          >
            + REGISTER PERSONNEL
          </button>
        </div>
      </div>

      <div className="personnel-table-container" style={{ overflowX: 'auto', background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
        {personnelLoading && (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div className="pulse-loader"></div>
            <p style={{ fontSize: '12px', fontWeight: 500, color: '#0f52ba', marginTop: '20px' }}>Loading staff...</p>
          </div>
        )}
        
        {!personnelLoading && filteredPersonnel.length === 0 && (
          <div style={{ textAlign: 'center', padding: '100px 20px' }}>
             <div style={{ fontSize: '40px', marginBottom: '15px' }}>👤</div>
             <div style={{ fontSize: '14px', fontWeight: 950, color: '#1a1a2e' }}>NO PERSONNEL MATCHED</div>
             <p style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>Your search query did not return any active staff signatures.</p>
          </div>
        )}

        {!personnelLoading && filteredPersonnel.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: '#94a3b8', borderBottom: '2px solid #f1f5f9', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '1px' }}>Personnel</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: '#94a3b8', borderBottom: '2px solid #f1f5f9', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '1px' }}>Contact & Credentials</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: '#94a3b8', borderBottom: '2px solid #f1f5f9', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '1px' }}>Role</th>
                <th style={{ padding: '20px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: '#94a3b8', borderBottom: '2px solid #f1f5f9', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '1px' }}>Activity & Status</th>
                <th style={{ padding: '20px', textAlign: 'right', fontSize: '11px', fontWeight: 900, color: '#94a3b8', borderBottom: '2px solid #f1f5f9', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '1px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPersonnel.slice((staffCurrentPage - 1) * staffItemsPerPage, staffCurrentPage * staffItemsPerPage).map(u => {
                const userRole = u.roles?.[0];
                const isSuper = userRole === 'admindoctor';
                const currentRole = currentUser.roles?.[0];
                const canAdminEdit = currentRole === 'admindoctor' || (currentRole === 'admin' && !isSuper);
                
                const roleMeta = {
                  doctor: { color: 'var(--tactical-cyan)', bg: '#f0faff', icon: '🩺' },
                  admindoctor: { color: 'var(--tactical-indigo)', bg: '#f0f5ff', icon: '🔱' },
                  technician: { color: '#f39c12', bg: '#fef9e7', icon: '🛠️' },
                  receptionist: { color: '#e84393', bg: '#fdf0f6', icon: '📅' },
                  admin: { color: '#0f52ba', bg: '#e8f0fe', icon: '🔑' }
                }[userRole] || { color: '#64748b', bg: '#f1f5f9', icon: '👤' };

                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '20px' }}>
                      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <div style={{ 
                          width: '42px', height: '42px', borderRadius: '12px', 
                          background: roleMeta.bg, color: roleMeta.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '18px', border: `1px solid ${roleMeta.color}30`
                        }}>
                          {u.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: '14px' }}>{(u.name || 'Unknown Staff').toUpperCase()}</div>
                          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.5px' }}>HUB_NODE_{u.id?.split('-')[0]}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '20px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>{u.email}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                          {(u.password && revealedPasswords[u.id]) ? u.password : '••••••••'}
                        </span>
                        {u.password && (
                          <button 
                            onClick={() => setRevealedPasswords(prev => ({ ...prev, [u.id]: !prev[u.id] }))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', fontSize: '12px', opacity: 0.6, display: 'flex', alignItems: 'center', transition: 'opacity 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.opacity = 1}
                            onMouseLeave={e => e.currentTarget.style.opacity = 0.6}
                            title={revealedPasswords[u.id] ? "Hide password" : "Show password"}
                          >
                            <span style={{ fontSize: '10px', fontWeight: 700 }}>{revealedPasswords[u.id] ? 'HIDE' : 'SHOW'}</span>
                          </button>
                        )}
                        {copyFeedback === u.id && <span style={{ fontSize: '9px', color: '#2ecc71', fontWeight: 900 }}>COPIED!</span>}
                      </div>
                    </td>
                    <td style={{ padding: '20px' }}>
                      <div style={{ 
                        display: 'inline-block', padding: '6px 12px', borderRadius: '20px', background: roleMeta.bg, 
                        color: roleMeta.color, fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px' 
                      }}>
                        {(ROLE_LABELS[userRole] || getCustomRoles(activeCenter?.id).find(r => r.roleId === userRole || r.roleName === userRole)?.roleName || userRole)?.toUpperCase()}
                      </div>
                    </td>
                    <td style={{ padding: '20px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: u.status === 'active' ? '#16a34a' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: u.status === 'active' ? '#2ecc71' : '#cbd5e1' }}></span>
                          {(u.status || 'ACTIVE').toUpperCase()}
                        </span>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>Last: {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Offline'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '20px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        {canAdminEdit && (
                          <>
                            <button 
                              title="Copy Credentials"
                              style={{ padding: '6px 12px', height: '32px', borderRadius: '8px', background: '#f1f5f9', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, transition: 'all 0.2s' }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#334155'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
                              onClick={() => handleCopyCredentials(u)}
                            >
                              COPY
                            </button>
                            <button 
                              title="Share on WhatsApp"
                              style={{ padding: '6px 12px', height: '32px', borderRadius: '8px', background: '#f0fdf4', border: 'none', color: '#22c55e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, transition: 'all 0.2s' }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#dcfce7'; e.currentTarget.style.color = '#16a34a'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#f0fdf4'; e.currentTarget.style.color = '#22c55e'; }}
                              onClick={() => handleWhatsAppShare(u)}
                            >
                              SHARE
                            </button>
                            <button 
                              title="Edit Profile"
                              style={{ padding: '6px 12px', height: '32px', borderRadius: '8px', background: '#eff6ff', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, transition: 'all 0.2s' }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; e.currentTarget.style.color = '#2563eb'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#3b82f6'; }}
                              onClick={() => handleOpenUserDrawer(u)}
                            >
                              EDIT
                            </button>
                            {u.id !== currentUser.id && (
                              <button 
                                title="Revoke Access"
                                style={{ padding: '6px 12px', height: '32px', borderRadius: '8px', background: '#fef2f2', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, transition: 'all 0.2s' }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444'; }}
                                onClick={() => setRevokeUser(u)}
                              >
                                REVOKE
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!personnelLoading && filteredPersonnel.length > staffItemsPerPage && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderTop: '1px solid #f1f5f9', background: '#fcfdfe', borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>
              Showing {((staffCurrentPage - 1) * staffItemsPerPage) + 1} - {Math.min(staffCurrentPage * staffItemsPerPage, filteredPersonnel.length)} of {filteredPersonnel.length} personnel
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => setStaffCurrentPage(p => Math.max(1, p - 1))}
                disabled={staffCurrentPage === 1}
                style={{ padding: '8px 16px', borderRadius: '8px', background: staffCurrentPage === 1 ? '#f1f5f9' : 'white', border: '1px solid #e2e8f0', color: staffCurrentPage === 1 ? '#cbd5e1' : '#0f52ba', fontSize: '11px', fontWeight: 900, cursor: staffCurrentPage === 1 ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
              >
                PREV
              </button>
              <button 
                onClick={() => setStaffCurrentPage(p => Math.min(Math.ceil(filteredPersonnel.length / staffItemsPerPage), p + 1))}
                disabled={staffCurrentPage === Math.ceil(filteredPersonnel.length / staffItemsPerPage)}
                style={{ padding: '8px 16px', borderRadius: '8px', background: staffCurrentPage === Math.ceil(filteredPersonnel.length / staffItemsPerPage) ? '#f1f5f9' : 'white', border: '1px solid #e2e8f0', color: staffCurrentPage === Math.ceil(filteredPersonnel.length / staffItemsPerPage) ? '#cbd5e1' : '#0f52ba', fontSize: '11px', fontWeight: 900, cursor: staffCurrentPage === Math.ceil(filteredPersonnel.length / staffItemsPerPage) ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
              >
                NEXT
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderReferrerEditDrawer = () => (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, display: 'flex', justifyContent: 'flex-end' }}>
      <div 
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} 
        onClick={() => setIsReferrerEditDrawerOpen(false)}
      />
      <div style={{ 
        width: isMobile ? '100%' : '450px', background: 'white', height: '100%', position: 'relative', zIndex: 10,
        boxShadow: '-20px 0 60px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '35px 40px', borderBottom: '1px solid #f1f5f9', background: '#fcfdfe' }}>
          <div style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '3px', marginBottom: '8px' }}>
            {editingReferrer?.referrerId ? 'PARTNER RECONFIGURATION' : 'NEW PARTNER ENROLLMENT'}
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 950, color: '#1e293b', margin: 0 }}>
            {editingReferrer?.referrerId ? 'EDIT PARTNER DETAILS' : 'ADD NEW PARTNER'}
          </h2>
        </div>

        <form onSubmit={handleUpdateReferrer} style={{ padding: '40px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>PARTNER NAME</label>
              <input 
                type="text"
                required
                value={editingReferrer?.name || ''}
                onChange={e => setEditingReferrer(prev => ({ ...prev, name: e.target.value }))}
                style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 800, color: '#1e293b', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CONTACT IDENTIFIER (MOBILE)</label>
              <input 
                type="tel"
                required
                placeholder="e.g., 9876543210"
                value={editingReferrer?.contact || ''}
                onChange={e => setEditingReferrer(prev => ({ ...prev, contact: e.target.value }))}
                style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 800, color: '#1e293b', outline: 'none' }}
              />
              <span style={{ fontSize: '9px', color: '#64748b', marginTop: '2px', fontWeight: 700 }}>Must be a 10-digit Indian mobile number starting with 6, 7, 8, or 9.</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CLINICAL SECTOR / ADDRESS</label>
              <textarea 
                required
                value={editingReferrer?.address || ''}
                onChange={e => setEditingReferrer(prev => ({ ...prev, address: e.target.value }))}
                style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 800, color: '#1e293b', outline: 'none', minHeight: '100px', resize: 'vertical' }}
              />
            </div>
          </div>

          <div style={{ marginTop: '50px', display: 'flex', gap: '15px' }}>
             <button 
               type="submit" 
               disabled={isSavingReferrer}
               style={{ flex: 1, padding: '16px', borderRadius: '14px', background: '#0f52ba', color: 'white', fontWeight: 950, fontSize: '11px', border: 'none', cursor: 'pointer', letterSpacing: '1px' }}
             >
               {isSavingReferrer ? 'Saving...' : (editingReferrer?.referrerId ? 'Save Changes' : 'Add Partner')}
             </button>
             <button 
               type="button"
               onClick={() => setIsReferrerEditDrawerOpen(false)}
               style={{ padding: '16px 25px', borderRadius: '14px', background: '#f8fafc', color: '#64748b', fontWeight: 950, fontSize: '11px', border: '1px solid #e2e8f0', cursor: 'pointer' }}
             >
               CANCEL
             </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderPatientEditDrawer = () => (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, display: 'flex', justifyContent: 'flex-end' }}>
      <div 
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} 
        onClick={() => setIsPatientEditDrawerOpen(false)}
      />
      <div style={{ 
        width: isMobile ? '100%' : '500px', background: 'white', height: '100%', position: 'relative', zIndex: 10,
        boxShadow: '-20px 0 60px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '35px 40px', borderBottom: '1px solid #f1f5f9', background: '#fcfdfe' }}>
          <div style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '3px', marginBottom: '8px' }}>MASTER PATIENT INDEX</div>
          <h2 style={{ fontSize: '20px', fontWeight: 950, color: '#1e293b', margin: 0 }}>EDIT PATIENT DEMOGRAPHICS</h2>
        </div>

        <form onSubmit={handleUpdatePatient} style={{ padding: '40px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>FULL NAME</label>
              <input 
                type="text" required
                value={editingPatient?.fullName || ''}
                onChange={e => setEditingPatient(prev => ({ ...prev, fullName: e.target.value }))}
                style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 800, color: '#1e293b', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>MOBILE IDENTIFIER</label>
              <input 
                type="text" required
                value={editingPatient?.mobile || ''}
                onChange={e => setEditingPatient(prev => ({ ...prev, mobile: e.target.value }))}
                style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 800, color: '#1e293b', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>AGE / BIOLOGICAL YEARS</label>
              <input 
                type="text" required
                value={editingPatient?.age || ''}
                onChange={e => setEditingPatient(prev => ({ ...prev, age: e.target.value }))}
                style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 800, color: '#1e293b', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>GENDER</label>
              <select 
                value={editingPatient?.gender || ''}
                onChange={e => setEditingPatient(prev => ({ ...prev, gender: e.target.value }))}
                style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 800, color: '#1e293b', outline: 'none' }}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>VILLAGE / LOCALITY</label>
              <input 
                type="text"
                value={editingPatient?.village || ''}
                onChange={e => setEditingPatient(prev => ({ ...prev, village: e.target.value }))}
                style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 800, color: '#1e293b', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>DISTRICT / ZONE</label>
              <input 
                type="text"
                value={editingPatient?.district || ''}
                onChange={e => setEditingPatient(prev => ({ ...prev, district: e.target.value }))}
                style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 800, color: '#1e293b', outline: 'none' }}
              />
            </div>

            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>PHYSICAL ADDRESS</label>
              <textarea 
                value={editingPatient?.address || ''}
                onChange={e => setEditingPatient(prev => ({ ...prev, address: e.target.value }))}
                style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 800, color: '#1e293b', outline: 'none', minHeight: '80px' }}
              />
            </div>
          </div>

          <div style={{ marginTop: '50px', display: 'flex', gap: '15px' }}>
             <button 
               type="submit" 
               disabled={isSavingPatient}
               style={{ flex: 1, padding: '16px', borderRadius: '14px', background: '#0f52ba', color: 'white', fontWeight: 950, fontSize: '11px', border: 'none', cursor: 'pointer', letterSpacing: '1px' }}
             >
               {isSavingPatient ? 'Saving...' : 'Save Changes'}
             </button>
             <button 
               type="button"
               onClick={() => setIsPatientEditDrawerOpen(false)}
               style={{ padding: '16px 25px', borderRadius: '14px', background: '#f8fafc', color: '#64748b', fontWeight: 950, fontSize: '11px', border: '1px solid #e2e8f0', cursor: 'pointer' }}
             >
               CANCEL
             </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <div className="page-wrapper board-padding" style={{ paddingTop: '30px' }}>
      <div className="board-hero-header" style={{ 
        marginBottom: '30px', 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'flex-end', 
        gap: '20px' 
      }}>
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 700, color: '#0a1628', letterSpacing: '-0.5px', margin: 0 }}>Admin Panel</h1>
            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 400, letterSpacing: '0' }}>Manage your workspace</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '15px', width: isMobile ? '100%' : 'auto' }}>
          {/* Institutional Hub Switcher */}
          <div className="center-switcher-hud" style={{ position: 'relative', width: isMobile ? '100%' : 'auto' }}>
            <button 
              id="center-switcher-btn"
              className="command-core-btn"
              onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 18px', 
                borderRadius: '14px', background: 'white', border: '1px solid #e2e8f0', 
                cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                width: '100%'
              }}
            >
              <div className={isSwitchingNode ? "pulse-loader-mini" : "tactical-node-active"} style={{ width: '10px', height: '10px', borderRadius: '50%', background: isSwitchingNode ? '#f39c12' : '#2ecc71', boxShadow: isSwitchingNode ? '0 0 10px rgba(243, 156, 18, 0.4)' : '0 0 10px rgba(46, 204, 113, 0.4)' }}></div>
              <div className="hub-identity" style={{ textAlign: 'left', overflow: 'hidden', flex: 1 }}>
                <div className="hub-label" style={{ fontSize: '7px', fontWeight: 950, color: isSwitchingNode ? '#f39c12' : '#aaa', letterSpacing: '1px', textTransform: 'uppercase' }}>{isSwitchingNode ? 'Switching...' : 'Active Center'}</div>
                <div className="hub-name" style={{ fontSize: '13px', fontWeight: 950, color: '#1a1a2e', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: isTestMode ? 'visible' : 'hidden', maxWidth: isMobile ? '100%' : '350px', opacity: isSwitchingNode ? 0.5 : 1 }}>{activeCenter?.name?.toUpperCase() || 'SELECT CENTER...'}</div>
              </div>
              <div style={{ fontSize: '10px', color: '#888', transition: 'transform 0.3s', transform: isSwitcherOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  ▼
              </div>
            </button>

            {isSwitcherOpen && (
              <>
                <div 
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1050, background: 'transparent' }} 
                  onClick={() => setIsSwitcherOpen(false)}
                />
                <div 
                  id="center-dropdown-menu"
                  className="tactical-hub-dropdown"
                  style={{ 
                    position: 'absolute', top: '100%', left: 0, marginTop: '12px', width: isMobile ? '100%' : '350px', 
                    zIndex: 1100, background: 'white', borderRadius: '18px', border: '1px solid #e2e8f0', 
                    boxShadow: '0 15px 50px rgba(0,0,0,0.15)', padding: '15px', boxSizing: 'border-box'
                  }}
                >
                <div style={{ padding: '0 5px 12px', fontSize: '10px', fontWeight: 950, color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '2px', borderBottom: '1px solid #f1f5f9', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>AUTHORIZED CLINICAL NODES</span>
                  <span style={{ opacity: 0.5 }}>ACTIVE LIST</span>
                </div>
                
                 <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '5px' }}>
                   {centers.length > 0 ? (
                     centers.map(center => (
                       <button
                         key={center.id}
                         onClick={async () => { 
                           const normalizedActiveId = String(activeCenter?.id || '').toLowerCase();
                           const normalizedTargetId = String(center.id).toLowerCase();
                           
                           if (normalizedActiveId === normalizedTargetId || isSwitchingNode) return;
                           setIsSwitchingNode(true);
                           const result = await switchCenter(center.id); 
                           setIsSwitchingNode(false);
                           setIsSwitcherOpen(false); 
                           if (result?.success && result.roles) {
                             window.location.reload(); 
                           }
                         }}
                         className={`hub-option ${activeCenter?.id === center.id ? 'active-hub' : ''}`}
                         style={{ 
                           width: '100%', textAlign: 'left', padding: '15px', borderRadius: '14px', 
                           display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', 
                           background: activeCenter?.id === center.id ? '#f0f7ff' : 'transparent',
                           border: activeCenter?.id === center.id ? '1px solid #dbeafe' : '1px solid transparent', 
                           transition: 'all 0.2s', marginBottom: '6px'
                         }}
                       >

                         <div style={{ 
                           width: '10px', height: '10px', borderRadius: '50%', 
                           background: activeCenter?.id === center.id ? '#2ecc71' : 'rgba(0,0,0,0.1)',
                           boxShadow: activeCenter?.id === center.id ? '0 0 10px rgba(46, 204, 113, 0.3)' : 'none'
                         }}></div>
                         <div style={{ flex: 1, overflow: 'hidden' }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                             <span style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{center.name || 'Unnamed Center'}</span>
                             {activeCenter?.id === center.id && <span style={{ fontSize: '9px', fontWeight: 950, color: '#2ecc71', letterSpacing: '1px' }}>ACTIVE</span>}
                           </div>
                         </div>
                       </button>
                     ))
                   ) : (
                     <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                        <div style={{ fontSize: '32px', marginBottom: '15px' }}>🛰️</div>
                        <div style={{ fontSize: '11px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>No Authorized Nodes</div>
                     </div>
                   )}
                 </div>
               </div>
              </>
            )}
          </div>

          <button 
            onClick={() => setIsChainDrawerOpen(true)}
            style={{ 
              padding: '12px 20px', borderRadius: '16px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', 
              border: 'none', color: 'white', display: 'flex', gap: '8px', 
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s',
              fontSize: '10px', fontWeight: 950, letterSpacing: '1px',
              boxShadow: '0 8px 25px rgba(15, 82, 186, 0.25)',
              width: isMobile ? '100%' : 'auto',
              whiteSpace: 'nowrap'
            }}
          >
            <span style={{ fontSize: '14px' }}>📡</span> REGISTER NEW CHAIN
          </button>
        </div>
      </div>
      
      {/* Hub Controller Navigation */}
      <div className="admin-tabs" style={{ 
        background: '#f8fafc', 
        padding: '4px', 
        borderRadius: '16px', 
        border: '1px solid #e2e8f0', 
        marginBottom: '30px', 
        display: 'flex',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        gap: '4px'
      }}>
        {['Overview', 'Staff', 'Roles', 'Hospitals', 'Finance', 'Letterhead'].map(tab => (
          <button
            key={tab}
            className={`admin-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: isMobile ? '0 0 auto' : 1,
              borderRadius: '8px',
              border: 'none',
              padding: isMobile ? '10px 18px' : '11px 12px',
              fontWeight: 600,
              letterSpacing: '0.2px',
              background: activeTab === tab ? 'white' : 'transparent',
              color: activeTab === tab ? '#1d4ed8' : '#6b7280',
              boxShadow: activeTab === tab ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              fontSize: '13px',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Overview' && renderAnalytics()}
      {activeTab === 'Staff' && renderUserManagement()}
      {activeTab === 'Roles' && (
        <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '24px', border: '1px solid #edf2f7' }}>
          <RolesAndPermissions hospitalId={activeCenter?.id} />
        </div>
      )}
      {activeTab === 'Hospitals' && renderHospitalSettings()}
      {activeTab === 'Finance' && (
        <FinanceManager 
          isMobile={isMobile}
          servicePrices={servicePrices}
          fetchServicePrices={fetchServicePrices}
          financialMatrix={financialMatrix}
          fetchFinancialMatrix={fetchFinancialMatrix}
          expenses={expenses}
          fetchExpenses={fetchExpenses}
          billingSettings={billingSettings}
          setBillingSettings={setBillingSettings}
          handleToggleAutoBill={handleToggleAutoBill}
          isOnline={isOnline}
          activeCenter={activeCenter}
          isPriceDrawerOpen={isPriceDrawerOpen}
          setIsPriceDrawerOpen={setIsPriceDrawerOpen}
          editPrice={editPrice}
          setEditPrice={setEditPrice}
          handleSavePrice={handleSavePrice}
          handleDeletePrice={handleDeletePrice}
          isExpenseDrawerOpen={isExpenseDrawerOpen}
          setIsExpenseDrawerOpen={setIsExpenseDrawerOpen}
          editExpense={editExpense}
          setEditExpense={setEditExpense}
          handleSaveExpense={handleSaveExpense}
          handleDeleteExpense={handleDeleteExpense}
          savingExpense={savingExpense}
          isTestMode={isTestMode}
          TODAY={TODAY}
        />
      )}
      {activeTab === 'Letterhead' && renderPrescriptionArchitect()}
      

      {isHospitalDrawerOpen && renderHospitalSettingsDrawer()}
      {isChainDrawerOpen && renderChainDrawer()}
      {isReferrerEditDrawerOpen && renderReferrerEditDrawer()}
      {isPatientEditDrawerOpen && renderPatientEditDrawer()}

      {/* Personnel Roster Drawer: Redesigned Premium UI */}
      {isUserDrawerOpen && (
        <div onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backdropFilter: 'blur(4px)', background: 'rgba(10, 22, 40, 0.45)', zIndex: 10000 }}>
             <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', padding: 0, width: isMobile ? '100%' : '560px', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(10,22,40,0.18)' }} onClick={e => e.stopPropagation()}>
              
              {/* Tactical Header matching Custom Roles */}
              <div style={{ padding:'22px 24px 20px', background:`linear-gradient(135deg,#0a1628 0%,#1e3a5f 100%)`, position:'relative', overflow:'hidden', flexShrink:0 }}>
                <div style={{ position:'absolute',top:0,left:0,right:0,height:'3px',background:`linear-gradient(90deg,transparent,#d4af37 30%,#ffd700 50%,#d4af37 70%,transparent)` }} />
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
                  <div>
                    <div style={{ fontSize:'10px',fontWeight:700,color:'#d4af37',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:'4px' }}>
                      {editUser?.id ? 'Edit Profile' : 'New Personnel'}
                    </div>
                    <h3 style={{ margin:0,fontSize:'18px',fontWeight:800,color:'white',letterSpacing:'-0.2px' }}>
                      {editUser?.id ? 'Modify Staff Profile' : 'Add New Staff'}
                    </h3>
                    <p style={{ margin:'5px 0 0',fontSize:'12px',color:'rgba(255,255,255,0.5)',fontWeight:500 }}>
                      Enter the details for this staff member below.
                    </p>
                  </div>
                  <button onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }} style={{ width:'32px',height:'32px',borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.15)',color:'white',cursor:'pointer',fontSize:'16px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>×</button>
                </div>
              </div>

              {/* Step Indicator */}
              <div style={{ padding: '20px 40px 0 40px' }}>
                <div style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  background: '#f8fafc',
                  borderRadius: '20px',
                  border: '1px solid #e2e8f0',
                  color: '#64748b'
                }}>
                   <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6' }}></div>
                   <span style={{ fontSize: '11px', fontWeight: 700 }}>Step {userRegStep} of 2: {(userRegStep === 1 ? 'Basic Info' : 'Credentials')}</span>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '30px 40px 40px 40px' }}>
                 <form onSubmit={handleSaveUser}>
                    {userRegStep === 1 && (
                      <div className="wizard-step" style={{ animation: 'slideRight 0.4s ease' }}>
                        
                        <div className="form-group" style={{ marginBottom: '25px' }}>
                           <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Full Name <span style={{ color: '#ef4444' }}>*</span></label>
                           <input 
                             type="text" 
                             required 
                             placeholder="Ex: John Doe"
                             value={editUser?.name} 
                             onChange={e => setEditUser({...editUser, name: e.target.value})} 
                             style={{ 
                               width: '100%', 
                               border: '1px solid #e2e8f0', 
                               borderRadius: '12px',
                               background: '#f8fafc',
                               fontSize: '15px', 
                               fontWeight: 700, 
                               padding: '14px 16px', 
                               outline: 'none',
                               color: '#1e293b',
                               transition: 'all 0.3s ease'
                             }} 
                             onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.background = '#ffffff'; e.target.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.1)'; }}
                             onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none'; }}
                           />
                        </div>
                        
                        <div style={{ display: 'flex', gap: '20px', marginBottom: '25px' }}>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Email Address <span style={{ color: '#ef4444' }}>*</span></label>
                               <input type="email" required placeholder="name@example.com" value={editUser?.email} onChange={e => setEditUser({...editUser, email: e.target.value})} 
                                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '14px', fontWeight: 600, padding: '12px 16px', outline: 'none', color: '#1e293b', transition: 'all 0.3s ease' }} 
                                onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.background = '#ffffff'; e.target.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.1)'; }}
                                onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none'; }}
                               />
                           </div>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Mobile Number <span style={{ color: '#ef4444' }}>*</span></label>
                               <input type="tel" required placeholder="+91 000-000-0000" value={editUser?.mobile} onChange={e => setEditUser({...editUser, mobile: e.target.value})} 
                                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '14px', fontWeight: 600, padding: '12px 16px', outline: 'none', color: '#1e293b', transition: 'all 0.3s ease' }} 
                                onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.background = '#ffffff'; e.target.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.1)'; }}
                                onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none'; }}
                               />
                           </div>
                        </div>

                        <div style={{ display: 'flex', gap: '20px', marginBottom: '25px' }}>
                           <div className="form-group" style={{ flex: 1, position: 'relative' }}>
                               <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Password <span style={{ color: '#ef4444' }}>*</span></label>
                               <input type={showPasswords ? "text" : "password"} required autoComplete="new-password" placeholder="Create password" value={editUser?.password} onChange={e => setEditUser({...editUser, password: e.target.value})} 
                                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '14px', fontWeight: 600, padding: '12px 16px', outline: 'none', color: '#1e293b', transition: 'all 0.3s ease' }} 
                                onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.background = '#ffffff'; e.target.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.1)'; }}
                                onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none'; }}
                               />
                               <button 
                                 type="button" 
                                 onClick={() => setShowPasswords(!showPasswords)}
                                 style={{ position: 'absolute', right: '12px', bottom: '12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: 0.5, transition: 'opacity 0.2s' }}
                                 onMouseEnter={e => e.currentTarget.style.opacity = 1}
                                 onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
                                 title={showPasswords ? "Hide" : "Show"}
                               >
                                 <span style={{ fontSize: '10px', fontWeight: 700 }}>{showPasswords ? 'HIDE' : 'SHOW'}</span>
                               </button>
                           </div>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Confirm Password <span style={{ color: '#ef4444' }}>*</span></label>
                               <input type={showPasswords ? "text" : "password"} required autoComplete="new-password" placeholder="Re-enter password" value={editUser?.confirmPassword} onChange={e => setEditUser({...editUser, confirmPassword: e.target.value})} 
                                style={{ width: '100%', border: editUser.password && editUser.confirmPassword && editUser.password !== editUser.confirmPassword ? '1px solid #ef4444' : '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '14px', fontWeight: 600, padding: '12px 16px', outline: 'none', color: '#1e293b', transition: 'all 0.3s ease' }} 
                                onFocus={(e) => { if (!(editUser.password && editUser.confirmPassword && editUser.password !== editUser.confirmPassword)) { e.target.style.borderColor = '#3b82f6'; e.target.style.background = '#ffffff'; e.target.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.1)'; } }}
                                onBlur={(e) => { if (!(editUser.password && editUser.confirmPassword && editUser.password !== editUser.confirmPassword)) { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none'; } }}
                               />
                               {editUser.password && editUser.confirmPassword && editUser.password !== editUser.confirmPassword && (
                                 <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700, marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                   Passwords do not match
                                 </div>
                               )}
                           </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: '30px' }}>
                           <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '12px' }}>Assigned Roles <span style={{ color: '#ef4444' }}>*</span></label>
                           
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                              {[
                                { id: 'doctor',       label: 'Doctor',       desc: 'Precision Reporting',  color: '#0891b2', icon: '' },
                                { id: 'technician',   label: 'Technician',   desc: 'Ops & Acquisition',    color: '#f39c12', icon: ''  },
                                { id: 'receptionist', label: 'Receptionist', desc: 'Patient Dispatch',      color: '#e84393', icon: ''  },
                                { id: 'admin',        label: 'Admin',        desc: 'Governance Control',    color: '#0f52ba', icon: ''  },
                                { id: 'accountant',   label: 'Accountant',   desc: 'Financial Comptroller', color: '#059669', icon: ''  },
                                ...(currentUser.roles?.[0] === 'admindoctor' ? [{ id: 'admindoctor', label: 'AdminDoctor', desc: 'Master Authority', color: '#6366f1', icon: '' }] : []),
                                ...getCustomRoles(activeCenter?.id).map(cr => ({
                                  id: cr.roleName,
                                  label: cr.roleName,
                                  desc: 'Custom Permission Set',
                                  color: '#319795',
                                  icon: ''
                                }))
                              ].map(role => {
                                const isSelected = editUser.roles.includes(role.id);
                                return (
                                  <div 
                                    key={role.id}
                                    onClick={() => {
                                      const newRoles = isSelected 
                                        ? editUser.roles.filter(r => r !== role.id)
                                        : [...editUser.roles, role.id];
                                      setEditUser({ ...editUser, roles: newRoles });
                                    }}
                                    style={{ 
                                      padding: '12px 16px',
                                      borderRadius: '16px',
                                      border: `1px solid ${isSelected ? role.color : '#e2e8f0'}`,
                                      background: isSelected ? `${role.color}08` : 'white',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '12px',
                                      boxShadow: isSelected ? `0 4px 12px ${role.color}15` : '0 2px 4px rgba(0,0,0,0.02)'
                                    }}
                                  >
                                    <div style={{ 
                                      width: '32px', height: '32px', borderRadius: '10px', 
                                      background: isSelected ? role.color : '#f8fafc',
                                      color: isSelected ? 'white' : '#94a3b8',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: '16px',
                                      border: `1px solid ${isSelected ? role.color : '#f1f5f9'}`
                                    }}>
                                      {role.icon}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: '13px', fontWeight: 800, color: isSelected ? role.color : '#334155' }}>{role.label}</div>
                                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>{role.desc}</div>
                                    </div>
                                    {isSelected && <div style={{ color: role.color, fontSize: '16px', fontWeight: 900 }}>✓</div>}
                                  </div>
                                );
                              })}
                           </div>
                        </div>

                        {(editUser.roles.includes('doctor') || editUser.roles.includes('admindoctor')) && (
                          <div style={{ 
                            background: '#eff6ff', 
                            padding: '16px 20px', 
                            borderRadius: '16px', 
                            border: '1px solid #bfdbfe', 
                            marginTop: '20px',
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'flex-start'
                          }}>
                             <span style={{ fontSize: '18px' }}>🩺</span>
                             <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: 800, lineHeight: 1.5 }}>
                                Doctor Role Selected <br/>
                                <span style={{ opacity: 0.8, fontWeight: 500, fontSize: '11px' }}>You will need to provide medical credentials in the next step to complete the registration.</span>
                             </div>
                          </div>
                        )}
                      </div>
                    )}

                    {userRegStep === 2 && (
                      <div className="wizard-step" style={{ animation: 'slideLeft 0.4s ease' }}>
                        <div style={{ 
                          background: '#f8fafc', 
                          padding: '24px', 
                          borderRadius: '16px', 
                          marginBottom: '30px', 
                          border: '1px solid #e2e8f0',
                        }}>
                          <p style={{ fontSize: '13px', fontWeight: 800, color: '#334155', margin: '0 0 6px 0' }}>Doctor Credentials</p>
                          <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, lineHeight: 1.5, margin: 0 }}>Please provide the verified professional credentials and licensing data for this doctor.</p>
                        </div>

                        <div className="form-group" style={{ marginBottom: '25px' }}>
                           <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Specialization</label>
                           <input type="text" placeholder="e.g. Neuroradiologist" value={editUser?.specialization} onChange={e => setEditUser({...editUser, specialization: e.target.value})} 
                             style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '14px', fontWeight: 600, padding: '12px 16px', outline: 'none', color: '#1e293b', transition: 'all 0.3s ease' }} 
                             onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.background = '#ffffff'; e.target.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.1)'; }}
                             onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none'; }}
                           />
                        </div>

                        <div style={{ display: 'flex', gap: '20px', marginBottom: '25px' }}>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Medical License Number</label>
                               <input type="text" placeholder="Ex: PMC-894-0" value={editUser?.licenseNo} onChange={e => setEditUser({...editUser, licenseNo: e.target.value})} 
                                 style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '14px', fontWeight: 600, padding: '12px 16px', outline: 'none', color: '#1e293b', transition: 'all 0.3s ease' }} 
                                 onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.background = '#ffffff'; e.target.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.1)'; }}
                                 onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none'; }}
                               />
                           </div>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>Degree / Qualification</label>
                               <input type="text" placeholder="MBBS, MD" value={editUser?.degree} onChange={e => setEditUser({...editUser, degree: e.target.value})} 
                                 style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', fontSize: '14px', fontWeight: 600, padding: '12px 16px', outline: 'none', color: '#1e293b', transition: 'all 0.3s ease' }} 
                                 onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.background = '#ffffff'; e.target.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.1)'; }}
                                 onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none'; }}
                               />
                           </div>
                        </div>
                      </div>
                    )}

                      <div className="drawer-footer" style={{ padding:'16px 24px',borderTop:'1px solid #e8edf2',display:'flex',gap:'10px',background:'white',flexShrink:0, marginTop: '20px' }}>
                        {userRegStep === 1 ? (
                          <>
                            <button type="button" style={{ flex:1,padding:'11px',borderRadius:'10px',border:'1.5px solid #e2e8f0',background:'white',fontWeight:700,fontSize:'13px',cursor:'pointer',color:'#475569',fontFamily:'inherit' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'white'} onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }}>Cancel</button>
                            <button 
                              type="submit" 
                              style={{ flex:2,padding:'11px',borderRadius:'10px',border:'none',background:`linear-gradient(135deg,#0a1628,#1e3a5f)`,color:'white',fontWeight:800,fontSize:'13px',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 14px rgba(10,22,40,0.25)',transition:'all 0.15s' }}
                            >
                              {(editUser.roles.includes('doctor') || editUser.roles.includes('admindoctor')) ? 'Next: Credentials' : 'Save Profile'}
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" style={{ flex:1,padding:'11px',borderRadius:'10px',border:'1.5px solid #e2e8f0',background:'white',fontWeight:700,fontSize:'13px',cursor:'pointer',color:'#475569',fontFamily:'inherit' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'white'} onClick={() => setUserRegStep(1)}>Back</button>
                            <button 
                              type="submit" 
                              style={{ flex:2,padding:'11px',borderRadius:'10px',border:'none',background:`linear-gradient(135deg,#0a1628,#1e3a5f)`,color:'white',fontWeight:800,fontSize:'13px',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 14px rgba(10,22,40,0.25)',transition:'all 0.15s' }}
                            >
                              Save Doctor Profile
                            </button>
                          </>
                        )}
                      </div>
                 </form>
              </div>
           </div>
        </div>
      )}

      {/* Layout Builder Drawer (Original) */}
      {isLayoutDrawerOpen && (
        <div onClick={() => setIsLayoutDrawerOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backdropFilter: 'blur(4px)', background: 'rgba(10, 22, 40, 0.45)', zIndex: 10000 }}>
             <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', padding: 0, width: isMobile ? '100%' : '500px', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(10,22,40,0.18)' }} onClick={e => e.stopPropagation()}>
              <div >
                 <h2>{editLayout.id ? 'Edit Layout' : 'New Reporting Layout'}</h2>
                 <button className="btn-close" onClick={() => setIsLayoutDrawerOpen(false)}>&times;</button>
              </div>
              <div className="drawer-body">
                 <div className="form-group">
                    <label>Layout Name</label>
                    <input type="text" value={editLayout.name} onChange={e => setEditLayout({...editLayout, name: e.target.value})} />
                 </div>
                 <div style={{ display: 'flex', gap: '10px' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                       <label>Modality</label>
                       <select value={editLayout.modality} onChange={e => setEditLayout({...editLayout, modality: e.target.value})}>
                          <option>X-RAY</option><option>MRI</option><option>CT</option><option>US</option>
                       </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                       <label>Study Type</label>
                       <input type="text" placeholder="e.g. Chest" value={editLayout.type} onChange={e => setEditLayout({...editLayout, type: e.target.value})} />
                    </div>
                 </div>
                 <div style={{ marginTop: '20px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '10px' }}>LAYOUT SECTIONS</label>
                    
                    {/* Custom Section Provider */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                       <input 
                          type="text" 
                          placeholder="Ex: Technical Details" 
                          value={newSectionName} 
                          onChange={e => setNewSectionName(e.target.value)} 
                          style={{ flex: 1, padding: '10px', fontSize: '13px', borderRadius: '8px', border: '1px solid #ddd' }}
                       />
                       <button 
                          onClick={handleAddCustomSection}
                          style={{ background: '#0f52ba', color: 'white', border: 'none', padding: '0 15px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}
                       >
                          + ADD CUSTOM
                       </button>
                    </div>

                    <div className="builder-list">
                       {[...SECTIONS_POOL, ...customSections].map((s) => {
                          const isActive = editLayout.selectedSections.includes(s.id);
                          const isCustom = s.id.startsWith('custom_');
                          return (
                            <div key={s.id} className="builder-item" style={{ opacity: isActive ? 1 : 0.5, borderLeft: isCustom ? '2px solid #0f52ba' : 'none' }}>
                               <div className="builder-item-info">
                                  <span>{s.name}</span>
                                  {isCustom && <span style={{ fontSize: '7px', color: '#0f52ba', display: 'block', fontWeight: 900 }}>CUSTOM</span>}
                               </div>
                               <button className={`builder-btn ${isActive ? 'active' : ''}`} onClick={() => toggleSection(s.id)}>{isActive ? 'ON' : 'OFF'}</button>
                            </div>
                          );
                       })}
                    </div>
                 </div>
              </div>
              <div className="drawer-footer">
                 <button className="btn-logout" onClick={() => setIsLayoutDrawerOpen(false)}>Cancel</button>
                 <button className="btn-primary" onClick={handleSaveLayout}>Save Configuration</button>
              </div>
           </div>
        </div>
      )}

      {/* Import Status HUD Overlay */}
      {importResult && (
        <div className="modal-overlay" onClick={() => setImportResult(null)} style={{ zIndex: 10000 }}>
          <div style={{ width: '450px', background: 'white', borderRadius: '24px', padding: '35px', boxShadow: '0 25px 70px rgba(0,0,0,0.3)', position: 'relative' }}>
            <button onClick={() => setImportResult(null)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', opacity: 0.5 }}>✕</button>
            
            <div style={{ textAlign: 'center', marginBottom: '25px' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#e9f7ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 950, color: '#2ecc71', margin: '0 auto 15px', border: '1px solid #2ecc7130' }}>OK</div>
              <h3 style={{ fontSize: '16px', fontWeight: 950, color: '#1e293b' }}>IMPORT RECONNAISSANCE REPORT</h3>
              <p style={{ fontSize: '11px', color: '#888', fontWeight: 700, marginTop: '4px' }}>Data synchronization cycle completed.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
              <div style={{ background: '#f0fdf4', padding: '15px', borderRadius: '16px', border: '1px solid #bcf0da', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 950, color: '#166534' }}>{importResult.successCount}</div>
                <div style={{ fontSize: '9px', fontWeight: 800, color: '#166534', letterSpacing: '1px' }}>SUCCESSFUL DEPLOYMENTS</div>
              </div>
              <div style={{ background: '#fef2f2', padding: '15px', borderRadius: '16px', border: '1px solid #fecaca', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 950, color: '#991b1b' }}>{importResult.failureCount}</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#991b1b', letterSpacing: '0' }}>Errors</div>
              </div>
            </div>

            {importResult.errors?.length > 0 && (
              <div style={{ maxHeight: '150px', overflowY: 'auto', background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', marginBottom: '8px', letterSpacing: '1px' }}>FAILURE LOGS:</p>
                {importResult.errors.map((err, i) => (
                  <div key={i} style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    • {err}
                  </div>
                ))}
              </div>
            )}

            <button 
              onClick={() => setImportResult(null)}
              style={{ width: '100%', marginTop: '25px', padding: '16px', background: '#0f52ba', color: 'white', border: 'none', borderRadius: '14px', fontWeight: 950, fontSize: '11px', letterSpacing: '1px', cursor: 'pointer' }}
            >
              CLOSE REPORT
            </button>
          </div>
        </div>
      )}


    
      {/* ── BEAUTIFUL REVOKE MODAL ── */}
      {revokeUser && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10, 22, 40, 0.6)', backdropFilter: 'blur(8px)', padding: '20px' }} onClick={() => setRevokeUser(null)}>
          <div style={{ width: '100%', maxWidth: '420px', background: 'white', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.2)', animation: 'popIn 0.3s cubic-bezier(0.16,1,0.3,1)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '32px 32px 24px', textAlign: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: '4px solid #fee2e2' }}>
                <span style={{ fontSize: '28px' }}>⚠️</span>
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>Revoke Access</h3>
              <p style={{ margin: 0, fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>
                Are you absolutely sure you want to revoke access for <strong style={{ color: '#0f172a' }}>{revokeUser.name || 'this user'}</strong>? They will no longer be able to log in or access this hub's data.
              </p>
            </div>
            
            <div style={{ padding: '20px 32px 32px', display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setRevokeUser(null)}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1.5px solid #e2e8f0', background: 'white', color: '#475569', fontSize: '14px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  await handleDeleteUser(revokeUser.id);
                  setRevokeUser(null);
                }}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: 'white', fontSize: '14px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(220, 38, 38, 0.25)', transition: 'all 0.2s' }}
              >
                Yes, Revoke
              </button>
            </div>
          </div>
        </div>
      )}

</div>
  );

  function renderChainDrawer() {
    return (
      <div onClick={() => setIsChainDrawerOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backdropFilter: 'blur(4px)', background: 'rgba(10, 22, 40, 0.45)', zIndex: 10000 }}>
          <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', padding: 0, width: isMobile ? '100%' : '450px', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(10,22,40,0.18)' }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '35px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white' }}>
             <h2 style={{ fontSize: '11px', fontWeight: 950, color: 'var(--tactical-cyan)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Infrastructure Deployment</h2>
             <div style={{ fontSize: '20px', fontWeight: 950, letterSpacing: '-1px' }}>REGISTER NEW CHAIN</div>
             <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginTop: '10px', fontWeight: 600 }}>Spawning new institutional node and re-mapping administrative authority.</p>
          </div>

          <div style={{ padding: '35px' }}>
            <form onSubmit={handleDeployChain} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
               <div className="input-group">
                  <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>CHAIN BRAND NAME</label>
                  <input 
                    type="text" 
                    required 
                    value={newChainData.chainName} 
                    onChange={e => setNewChainData({...newChainData, chainName: e.target.value})} 
                    placeholder="e.g. GLOBAL RADIOLOGY NETWORKS"
                    style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700 }}
                  />
               </div>
               <div className="input-group">
                  <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>CENTRE NAME</label>
                  <input 
                    type="text" 
                    required 
                    value={newChainData.hospitalName} 
                    onChange={e => setNewChainData({...newChainData, hospitalName: e.target.value})} 
                    placeholder="e.g. CITY DIAGNOSTIC HUB"
                    style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700 }}
                  />
               </div>
               <div className="input-group">
                  <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>NODE LOCATION (ADDRESS)</label>
                  <textarea 
                    required 
                    rows="3"
                    value={newChainData.hospitalAddress} 
                    onChange={e => setNewChainData({...newChainData, hospitalAddress: e.target.value})} 
                    placeholder="FULL INSTITUTIONAL ADDRESS"
                    style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, resize: 'none' }}
                  />
               </div>

               <div style={{ marginTop: '30px', display: 'flex', gap: '15px' }}>
                  <button type="button" onClick={() => setIsChainDrawerOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #eee', fontWeight: 800 }}>ABORT</button>
                  <button 
                    type="submit" 
                    disabled={isDeployingChain}
                    style={{ flex: 2, padding: '16px', borderRadius: '16px', background: '#0f52ba', color: 'white', fontWeight: 950, border: 'none', cursor: 'pointer' }}
                  >
                    {isDeployingChain ? 'DEPLOYING...' : 'INITIATE DEPLOYMENT →'}
                  </button>
               </div>
            </form>
          </div>
        </div>
      </div>
    );
  }


}
