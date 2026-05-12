import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient, { BASE_URL } from '../api/apiClient';
import useAuth from '../auth/useAuth';
import { ROLE_LABELS } from '../data/roles';
import useOffline from '../hooks/useOffline';
import { nativeStorage } from '../hooks/useElectron';
import '../styles/global.css';
import '../styles/AdminBoard.css';
import PrescriptionPreview from '../components/PrescriptionPreview';
import FinanceManager from '../components/FinanceManager';


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

export default function AdminBoard() {
  const { currentUser, logout, activeCenter, centers, switchCenter, refreshCenters, createCenter, subscription, refreshSubscription } = useAuth();
  const { isOnline, addToOutbox } = useOffline();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('INTELLIGENCE');
  const [layouts, setLayouts] = useState(INITIAL_LAYOUTS);
  const [patients, setPatients] = useState([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [personnelSearch, setPersonnelSearch] = useState('');
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
  
  // Layout Builder State
  const [isLayoutDrawerOpen, setIsLayoutDrawerOpen] = useState(false);
  const [editLayout, setEditLayout] = useState({ name: '', modality: 'X-RAY', type: '', active: true, selectedSections: ['findings', 'impression'] });

  // User Management State
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
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
  const [referralLoading, setReferralLoading] = useState(false);
  const [personnelLoading, setPersonnelLoading] = useState(false);
  const [outlookData, setOutlookData] = useState(null);
  const [loadingOutlook, setLoadingOutlook] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
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
    referralCutType: 'PERCENTAGE', 
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
  const [isTestMode, setIsTestMode] = useState(false);

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


  const fetchFinancialMatrix = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/finance/matrix');
      setFinancialMatrix(res.data);
      await nativeStorage.set('1rad_cache_finance_matrix', res.data);
    } catch (err) {
      console.error('[FINANCE] Matrix fetch failed, trying cache', err);
      const cached = await nativeStorage.get('1rad_cache_finance_matrix');
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
    isAutoBillingEnabled: false
  });
  const [mappedHospitals, setMappedHospitals] = useState([]);
  const [viewingHubId, setViewingHubId] = useState(null); // null = show list

  // UX Refinement: Auto-populate brand identity
  useEffect(() => {
    if (isChainDrawerOpen && activeCenter?.groupName) {
      setNewChainData(prev => ({ ...prev, chainName: activeCenter.groupName }));
    }
  }, [isChainDrawerOpen, activeCenter]);
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
      setImportResult({ successCount: 0, failureCount: 1, errors: ['PROTOCOL FAILURE: Could not establish secure data stream.'] });
    } finally {
      setIsImporting(false);
      e.target.value = ''; // Reset input
    }
  };

  const fetchHospitalData = useCallback(async (hubId) => {
    try {
      setHospitalLoading(true);
      const res = await apiClient.get(`/hospitals/${hubId}`);
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

  const fetchReferralIntelligence = useCallback(async () => {
    try {
      setReferralLoading(true);
      const params = referralFilterMode === 'ALL'
        ? { allTime: true }
        : {
            startDate: referralRange.start,
            endDate: referralFilterMode === 'SINGLE' ? referralRange.start : referralRange.end
          };
      const res = await apiClient.get('/referrers/intelligence', { params });
      setReferralIntelligence(res.data);
      await nativeStorage.set(`1rad_cache_referral_intel_${referralFilterMode}`, res.data);
    } catch (err) {
      console.error('[REFERRAL INTEL] Fetch failed, trying cache', err);
      const cached = await nativeStorage.get(`1rad_cache_referral_intel_${referralFilterMode}`);
      if (cached) setReferralIntelligence(cached);
    } finally {
      setReferralLoading(false);
    }
  }, [referralRange, referralFilterMode]);

  // --- DOMAIN SYNCHRONIZATION ---
  
  // Personnel & Prescription
  useEffect(() => {
    if (activeTab === 'PERSONNEL' || activeTab === 'PRESCRIPTION') {
      fetchPersonnel();
    }
  }, [activeTab, fetchPersonnel]);

  // Referral Intelligence
  useEffect(() => {
    if (activeTab === 'REFERRAL INTEL') {
      fetchReferralIntelligence();
    }
  }, [activeTab, fetchReferralIntelligence]);

  // Patient Master List
  useEffect(() => {
    if (activeTab === 'REFERRAL INTEL' && referralViewMode === 'PATIENTS') {
      fetchPatientMasterList();
    }
  }, [activeTab, referralViewMode, fetchPatientMasterList]);

  // Hospital Infrastructure
  useEffect(() => {
    if (activeTab === 'HOSPITAL') {
      fetchMappedHospitals();
    }
  }, [activeTab, fetchMappedHospitals]);

  // Financial Ledger
  useEffect(() => {
    if (activeTab === 'FINANCE') {
      fetchServicePrices();
      fetchFinancialMatrix();
      fetchExpenses();
    }
  }, [activeTab, fetchServicePrices, fetchFinancialMatrix, fetchExpenses]);

  const fetchStrategicOutlook = useCallback(async (dateString) => {
    try {
      setLoadingOutlook(true);
      const res = await apiClient.get('/intelligence/outlook', { params: { referenceDate: dateString || TODAY } });
      setOutlookData(res.data);
      await nativeStorage.set(`1rad_cache_outlook_${dateString || TODAY}`, res.data);
    } catch (err) {
      console.error('Tactical Insight Failure, trying cache:', err);
      const cached = await nativeStorage.get(`1rad_cache_outlook_${dateString || TODAY}`);
      if (cached) setOutlookData(cached);
    } finally {
      setLoadingOutlook(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'INTELLIGENCE') {
       fetchStrategicOutlook(selectedDateFilter);
    }
  }, [activeTab, selectedDateFilter, fetchStrategicOutlook]);




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
      alert('PROTOCOL FAILURE: Could not compile strategic intelligence export.');
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
      hospitalName: activeCenter.name,
      hospitalAddress: activeCenter.address || 'Metadata synchronization active.',
      gstin: activeCenter.gstin || '',
      registrationNumber: activeCenter.registrationNumber || '',
      pan: activeCenter.pan || '',
      nabhNumber: activeCenter.nabhNumber || '',
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
      await refreshCenters();
    } catch (err) {
      console.error('[FINANCE] Protocol update failed', err);
      if (!err.response) {
        await addToOutbox('HOSPITAL_UPDATE', { id: targetHubId, ...payload });
        alert('NETWORK_ERROR: Billing protocol added to offline outbox.');
        setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      } else {
        alert('SYSTEM ERROR: Failed to persist billing protocol. Please check institutional connectivity.');
      }
    }
  };

  useEffect(() => {
    if (activeCenter) {
      setBillingSettings(prev => ({
        ...prev,
        autoBill: activeCenter.isAutoBillingEnabled || false
      }));
    }
  }, [activeCenter]);

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
        referredBy: ref.name,
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

  const referralAggregated = useMemo(() => {
    if (referralViewMode !== 'MATRIX' && referralViewMode !== 'ROSTER' ) return [];
    
    // Map the backend intelligence DTOs to the frontend's expected Matrix structure
    const mapped = referralIntelligence.map(ref => {
      // Calculate modality breakdown for each referrer
      const modalities = ref.patients.reduce((acc, p) => {
        const mod = p.modality || 'OTHER';
        acc[mod] = (acc[mod] || 0) + 1;
        return acc;
      }, {});

      return {
        name: ref.name,
        contact: ref.contact,
        address: ref.address,
        patients: ref.patients,
        modalities
      };
    });

    if (!referralMatrixSearch) return mapped.sort((a, b) => b.patients.length - a.patients.length);

    const searchLow = referralMatrixSearch.toLowerCase();
    return mapped
      .filter(ref => ref.name.toLowerCase().includes(searchLow))
      .sort((a, b) => b.patients.length - a.patients.length);
  }, [referralIntelligence, referralViewMode, referralMatrixSearch]);

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
    const rows = referralIntelligence
      .filter(ref => !searchLow || (ref.name || '').toLowerCase().includes(searchLow))
      .map(ref => {
        const counts = {};
        cols.forEach(c => counts[c] = 0);
        let totalMatched = 0;
        ref.patients.forEach(p => {
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
  }, [referralIntelligence, referralViewMode, matrixPeriod, matrixDateStr, matrixWeekIndex, referralLogSearch]);

  const handleDeleteUser = async (id) => {
    if (id === currentUser.id) {
      alert('SECURITY PROTOCOL: Self-decommissioning blocked. You cannot remove your own deployment from this hub to prevent lockout.');
      return;
    }
    if (window.confirm('Are you sure you want to remove this staff member from the current hub?')) {
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
       <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
         <div>
            <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', color: '#888', marginBottom: '5px' }}>Global Patient Registry</h2>
            <p style={{ fontSize: '11px', color: '#aaa' }}>Comprehensive oversight of all center-registered diagnostic targets.</p>
         </div>
         <div style={{ display: 'flex', gap: '15px' }}>
            <div className="search-input-group" style={{ width: '300px' }}>

               <input 
                  type="text" 
                  placeholder="Universal Search..." 
                  value={patientSearch}
                  onChange={e => setPatientSearch(e.target.value)}
                  style={{ borderRadius: '8px' }}
               />
            </div>
            <button className="btn-primary" style={{ background: '#2ecc71', fontSize: '11px', fontWeight: 900, padding: '0 20px' }}>EXPORT REGISTRY 📁</button>
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
        alert('PROTOCOL FAILURE: Failed to record operational expense.');
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
        alert('PROTOCOL FAILURE: Could not delete expense.');
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

  const renderSubscription = () => {
    return (
      <div className="subscription-view">
        <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px' }}>
          <div>
            <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', color: '#0f52ba', marginBottom: '4px' }}>Subscription Protocol</h2>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginTop: '10px' }}>
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '8px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 950, color: '#0f52ba' }}>
                   LICENSING & ENTITLEMENTS
                </div>
            </div>
          </div>
          
          <button 
            onClick={() => navigate('/subscription')}
            style={{ 
              padding: '12px 24px', borderRadius: '12px', border: 'none', 
              background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(15, 82, 186, 0.2)'
            }}
          >
            UPGRADE PROTOCOL →
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '30px' }}>
           {/* Active Plan Status */}
           <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '30px' }}>Active Intelligence Tier</div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '25px', marginBottom: '40px' }}>
                 <div style={{ 
                   width: '80px', height: '80px', borderRadius: '24px', 
                   background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center',
                   fontSize: '32px', boxShadow: '0 10px 25px rgba(15, 82, 186, 0.2)'
                 }}>
                    <div style={{ fontSize: '10px', fontWeight: 950, color: 'white' }}>{subscription?.isTrial ? 'TRIAL' : 'PREMIUM'}</div>
                 </div>
                 <div>
                    <div style={{ fontSize: '24px', fontWeight: 950, color: '#1e293b', letterSpacing: '-1px' }}>
                      {subscription?.planName?.toUpperCase() || 'UNKNOWN_TIER'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                       <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: subscription?.isActive ? '#2ecc71' : '#e74c3c' }}></div>
                       <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>
                         STATUS: {subscription?.status?.toUpperCase() || 'INACTIVE'}
                       </span>
                    </div>
                 </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                 <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '20px', border: '1px solid #edf2f7' }}>
                    <div style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '8px' }}>EXPIRATION_DATE</div>
                    <div style={{ fontSize: '14px', fontWeight: 900, color: '#1e293b' }}>
                      {subscription?.endDate ? new Date(subscription.endDate).toLocaleDateString() : 'N/A'}
                    </div>
                 </div>
                 <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '20px', border: '1px solid #edf2f7' }}>
                    <div style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '8px' }}>REMAINING_WINDOW</div>
                    <div style={{ fontSize: '14px', fontWeight: 900, color: (subscription?.daysRemaining < 5) ? '#e74c3c' : '#0f52ba' }}>
                      {subscription?.daysRemaining || 0} DAYS
                    </div>
                 </div>
              </div>
           </div>

           {/* Surcharge Metrics */}
           <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '30px' }}>Doctor Surcharge Ledger</div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b' }}>Active Specialist Count</span>
                    <span style={{ fontSize: '16px', fontWeight: 950, color: '#1e293b' }}>{subscription?.doctorCount || 0}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b' }}>Included Base Seats</span>
                    <span style={{ fontSize: '16px', fontWeight: 950, color: '#1e293b' }}>1</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b' }}>Additional Seats Surcharge</span>
                    <span style={{ fontSize: '16px', fontWeight: 950, color: '#0f52ba' }}>₹{subscription?.additionalDoctorSurcharge?.toLocaleString() || '0'}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0', marginTop: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b' }}>Total Protocol Overhead</span>
                    <span style={{ fontSize: '20px', fontWeight: 950, color: '#1e293b' }}>₹{((subscription?.totalBasePrice || 0) + (subscription?.additionalDoctorSurcharge || 0)).toLocaleString()}</span>
                 </div>
              </div>
           </div>
        </div>
      </div>
    );
  };

  const renderHospitalSettings = () => {
    if (viewingHubId) {
      return (
        <div className="hospital-settings-view">
          <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
               <button 
                 onClick={() => setViewingHubId(null)}
                 style={{ width: 'auto', height: '40px', borderRadius: '12px', border: '1px solid #eee', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '10px', fontWeight: 950, padding: '0 15px' }}
               >
                 BACK
               </button>
               <div>
                 <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', color: '#0f52ba', marginBottom: '4px' }}>Hub Configuration</h2>
                 <p style={{ fontSize: '11px', color: '#888', fontWeight: 600 }}>Managing physical node metadata and compliance parameters.</p>
               </div>
            </div>
            <button 
              onClick={() => setIsHospitalDrawerOpen(true)}
              style={{ 
                padding: '12px 24px', borderRadius: '12px', border: 'none', 
                background: 'linear-gradient(90deg, #0f52ba 0%, #00f2fe 100%)', 
                color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(15, 82, 186, 0.2)'
              }}
            >
              EDIT CONFIGURATION
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div style={{ background: 'white', padding: '40px', borderRadius: '24px', border: '1px solid #eee', boxShadow: '0 10px 40px rgba(0,0,0,0.02)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: '150px', height: '150px', background: 'linear-gradient(135deg, transparent 50%, rgba(15, 82, 186, 0.03) 50%)', borderRadius: '0 24px 0 0' }}></div>
              <div style={{ display: 'flex', gap: '40px' }}>
                <div style={{ width: '120px', height: '120px', background: '#f8fbfc', borderRadius: '20px', border: '1px solid #edf2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 950, color: '#0f52ba' }}>HUB_IMAGE</div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '3px', textTransform: 'uppercase' }}>INSTITUTIONAL_IDENTITY</span>
                  <h1 style={{ fontSize: '32px', fontWeight: 950, color: '#1a1a2e', marginTop: '8px', marginBottom: '4px' }}>{(hospitalData.hospitalName || 'UNCONFIGURED_HUB').toUpperCase()}</h1>
                  <p style={{ fontSize: '14px', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>ADR:</span> {hospitalData.hospitalAddress || 'Address not synchronized.'}
                  </p>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {[
                { label: 'GSTIN MODULE', value: hospitalData.gstin, icon: '📄' },
                { label: 'REGISTRATION #', value: hospitalData.registrationNumber, icon: '🔖' },
                { label: 'TAX PAN NODE', value: hospitalData.pan, icon: '💳' },
                { label: 'QUALITY ACCREDIT', value: hospitalData.nabhNumber, icon: '🏆' }
              ].map(item => (
                <div key={item.label} style={{ background: 'white', padding: '25px', borderRadius: '20px', border: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>{item.label.slice(0, 3)}</div>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>{item.label}</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', marginTop: '2px' }}>{item.value || 'NOT_SYNCHRONIZED'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="hospital-settings-view">
        <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px' }}>
          <div>
            <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', color: '#0f52ba', marginBottom: '4px' }}>Institutional Hub Registry</h2>
            <p style={{ fontSize: '11px', color: '#888', fontWeight: 600 }}>Overview of mapped physical centers within your authorized expansion zone.</p>
          </div>
          <div style={{ background: '#f8f9fa', padding: '8px 16px', borderRadius: '10px', fontSize: '9px', fontWeight: 900, color: '#64748b', border: '1px solid #eee' }}>
            PROTOCOL: ACTIVE_MAPPING_ONLY
          </div>
        </div>

        {hospitalLoading ? (
          <div style={{ padding: '100px', textAlign: 'center' }}>
             <div className="pulse-loader"></div>
             <p style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba', marginTop: '20px' }}>SCANNING NETWORK NODES...</p>
          </div>
        ) : (
          <div className="topology-registry" style={{ display: 'flex', flexDirection: 'column', gap: '50px' }}>
            {(() => {
              // 1. Grouping logic
              const chains = {};
              const soloHubs = [];

              mappedHospitals.forEach(hub => {
                if (hub.groupId && hub.groupId.trim()) {
                  if (!chains[hub.groupId]) {
                    chains[hub.groupId] = {
                      name: hub.groupName || 'UNNAMED_CHAIN',
                      hubs: []
                    };
                  }
                  chains[hub.groupId].hubs.push(hub);
                } else {
                  soloHubs.push(hub);
                }
              });

              return (
                <>
                  {/* --- SECTION: LINKED CHAINS --- */}
                  {Object.entries(chains).map(([groupId, chain]) => (
                    <div key={groupId} className="tactical-chain-block" style={{ position: 'relative' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px' }}>
                        <div style={{ width: '32px', height: '2px', background: 'linear-gradient(90deg, #0f52ba, transparent)' }}></div>
                        <h3 style={{ fontSize: '12px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px', textTransform: 'uppercase' }}>
                          CHAIN_PROTOCOL: {chain.name}
                        </h3>
                        <div style={{ flex: 1, height: '1px', background: '#f1f5f9' }}></div>
                      </div>

                      <div style={{ position: 'relative', paddingLeft: '40px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* The Vertical Backbone Line */}
                        <div style={{ 
                          position: 'absolute', left: '15px', top: '25px', bottom: '25px', 
                          width: '2px', background: 'rgba(15, 82, 186, 0.1)', borderLeft: '2px dashed rgba(15, 82, 186, 0.2)' 
                        }}></div>

                        {chain.hubs.map((hub, idx) => {
                          const isActive = hub.hospitalId === activeCenter.id;
                          return (
                            <div key={hub.hospitalId} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                              {/* Horizontal Link to Backbone */}
                              <div style={{ 
                                position: 'absolute', left: '-25px', width: '25px', height: '2px', 
                                background: isActive ? '#0f52ba30' : 'rgba(0,0,0,0.05)' 
                              }}></div>
                              
                              <div 
                                style={{ 
                                  flex: 1, background: 'white', border: isActive ? '2px solid #0f52ba' : '1px solid #eee', 
                                  borderRadius: '24px', padding: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  boxShadow: isActive ? '0 15px 40px rgba(15, 82, 186, 0.1)' : '0 4px 20px rgba(0,0,0,0.02)',
                                  transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                   {/* The Connected Dot */}
                                   <div style={{ 
                                     width: '12px', height: '12px', borderRadius: '50%', 
                                     background: isActive ? '#0f52ba' : '#cbd5e1',
                                     marginLeft: '-35px', marginRight: '23px', zIndex: 2,
                                     boxShadow: isActive ? '0 0 10px rgba(15, 82, 186, 0.4)' : 'none',
                                     border: '3px solid white'
                                   }}></div>
                                   
                                   <div style={{ width: '45px', height: '45px', borderRadius: '14px', background: isActive ? '#f0f7ff' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 950, color: isActive ? '#0f52ba' : '#64748b' }}>HUB</div>
                                   <div>
                                      <h4 style={{ fontSize: '15px', fontWeight: 950, color: '#1a1a2e', marginBottom: '4px' }}>{hub.hospitalName.toUpperCase()}</h4>
                                      <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>NODE_IDENTITY: {hub.hospitalId.split('-')[0].toUpperCase()}</div>
                                   </div>
                                </div>

                                <div style={{ display: 'flex', gap: '30px', alignItems: 'center' }}>
                                   <div style={{ textAlign: 'right' }}>
                                      <div style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>STATUS</div>
                                      <div style={{ fontSize: '10px', fontWeight: 950, color: '#2ecc71', marginTop: '2px' }}>{hub.status.toUpperCase()}</div>
                                   </div>
                                   <button 
                                     onClick={() => fetchHospitalData(hub.hospitalId)}
                                     style={{ 
                                       padding: '10px 20px', borderRadius: '12px', background: isActive ? '#0f52ba' : '#f8fafc', 
                                       color: isActive ? 'white' : '#64748b', border: isActive ? 'none' : '1px solid #e2e8f0', 
                                       fontSize: '10px', fontWeight: 950, cursor: 'pointer'
                                     }}
                                   >
                                     MANAGE NODE
                                   </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* --- SECTION: SOLO STRATEGIC NODES --- */}
                  {soloHubs.length > 0 && (
                    <div className="solo-nodes-block">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px' }}>
                        <div style={{ width: '32px', height: '2px', background: 'linear-gradient(90deg, #64748b, transparent)' }}></div>
                        <h3 style={{ fontSize: '12px', fontWeight: 950, color: '#64748b', letterSpacing: '2px', textTransform: 'uppercase' }}>
                          INDEPENDENT_NODES
                        </h3>
                        <div style={{ flex: 1, height: '1px', background: '#f1f5f9' }}></div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '25px' }}>
                        {soloHubs.map(hub => {
                           const isActive = hub.hospitalId === activeCenter.id;
                           return (
                             <div 
                               key={hub.hospitalId}
                               style={{ 
                                 background: 'white', border: isActive ? '2px solid #0f52ba' : '1px solid #eee', 
                                 borderRadius: '24px', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
                                 position: 'relative', overflow: 'hidden'
                               }}
                             >
                               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                  <div style={{ width: '50px', height: '50px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e0efff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 950, color: '#0f52ba' }}>NODE</div>
                                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isActive ? '#0f52ba' : '#cbd5e1' }}></div>
                               </div>
                               <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#1a1a2e', marginBottom: '8px' }}>{hub.hospitalName.toUpperCase()}</h3>
                               <p style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '25px' }}>{hub.hospitalAddress}</p>
                               <button 
                                 onClick={() => fetchHospitalData(hub.hospitalId)}
                                 style={{ 
                                   width: '100%', padding: '14px', borderRadius: '14px', border: 'none', 
                                   background: isActive ? '#0f52ba' : '#f8fafc', color: isActive ? 'white' : '#64748b', 
                                   fontWeight: 950, fontSize: '10px', cursor: 'pointer'
                                 }}
                               >
                                 HUB CONFIGURATION →
                               </button>
                             </div>
                           );
                        })}
                      </div>
                    </div>
                  )}

                  {mappedHospitals.length === 0 && (
                    <div style={{ padding: '100px', textAlign: 'center', border: '1px dashed #eee', borderRadius: '30px' }}>
                       <div style={{ fontSize: '50px', marginBottom: '20px' }}>🏙️</div>
                       <h3 style={{ fontSize: '15px', fontWeight: 950, color: '#1a1a2e' }}>NO MAPPED CENTERS DETECTED</h3>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    );
  };


  const renderHospitalDrawer = () => (
    <div className="drawer-overlay" onClick={() => setIsHospitalDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 3001 }}>
      <div className="drawer-content" style={{ padding: 0, width: '500px', borderRadius: '24px 0 0 24px', background: '#fff', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="drawer-header" style={{ background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white', padding: '40px 30px' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 950, letterSpacing: '3px', color: 'var(--tactical-cyan)', textTransform: 'uppercase' }}>Config Infrastructure</span>
                  <h2 style={{ fontWeight: 950, fontSize: '24px', letterSpacing: '-0.5px' }}>SYNC_METADATA</h2>
              </div>
              <button className="btn-close" style={{ color: 'white', opacity: 0.6, fontSize: '28px' }} onClick={() => setIsHospitalDrawerOpen(false)}>&times;</button>
           </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '40px 30px' }}>
           <form onSubmit={handleSaveHospital}>
              <div className="form-group" style={{ marginBottom: '30px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '12px' }}>Institutional Identity</label>
                  <input 
                      type="text" required value={hospitalData.hospitalName} 
                      onChange={e => setHospitalData({...hospitalData, hospitalName: e.target.value})} 
                      style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '18px', fontWeight: 950, padding: '10px 0', outline: 'none' }} 
                  />
              </div>

              <div className="form-group" style={{ marginBottom: '30px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '12px' }}>Physical Infrastructure Node (Address)</label>
                  <textarea 
                      required value={hospitalData.hospitalAddress} 
                      onChange={e => setHospitalData({...hospitalData, hospitalAddress: e.target.value})} 
                      style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '14px', fontWeight: 600, padding: '10px 0', outline: 'none', resize: 'none', height: '60px' }} 
                  />
              </div>

              <div style={{ background: '#f8f9fc', padding: '25px', borderRadius: '20px', marginBottom: '30px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px', marginBottom: '20px' }}>COMPLIANCE NODES</p>
                  <div className="form-group" style={{ marginBottom: '20px' }}>
                      <label style={{ fontSize: '9px', fontWeight: 850, color: '#888', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Operational License #</label>
                      <input type="text" value={hospitalData.registrationNumber} onChange={e => setHospitalData({...hospitalData, registrationNumber: e.target.value.toUpperCase()})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #ddd', fontSize: '13px', fontWeight: 800, padding: '8px 0', outline: 'none', background: 'transparent' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div className="form-group">
                          <label style={{ fontSize: '9px', fontWeight: 850, color: '#888', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>GSTIN Module</label>
                          <input type="text" value={hospitalData.gstin} onChange={e => setHospitalData({...hospitalData, gstin: e.target.value.toUpperCase()})} maxLength="15" style={{ width: '100%', border: 'none', borderBottom: '1px solid #ddd', fontSize: '13px', fontWeight: 800, padding: '8px 0', outline: 'none', background: 'transparent' }} />
                      </div>
                      <div className="form-group">
                          <label style={{ fontSize: '9px', fontWeight: 850, color: '#888', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>IT PAN Node</label>
                          <input type="text" value={hospitalData.pan} onChange={e => setHospitalData({...hospitalData, pan: e.target.value.toUpperCase()})} maxLength="10" style={{ width: '100%', border: 'none', borderBottom: '1px solid #ddd', fontSize: '13px', fontWeight: 800, padding: '8px 0', outline: 'none', background: 'transparent' }} />
                      </div>
                  </div>
                  <div className="form-group" style={{ marginTop: '20px' }}>
                      <label style={{ fontSize: '9px', fontWeight: 850, color: '#888', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Quality Accreditation (NABH/NABL)</label>
                      <input type="text" value={hospitalData.nabhNumber} onChange={e => setHospitalData({...hospitalData, nabhNumber: e.target.value.toUpperCase()})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #ddd', fontSize: '13px', fontWeight: 800, padding: '8px 0', outline: 'none', background: 'transparent' }} />
                  </div>
              </div>

              {hospitalMessage.text && (
                  <div style={{ padding: '15px', borderRadius: '12px', marginBottom: '25px', fontSize: '11px', fontWeight: 900, background: hospitalMessage.type === 'success' ? '#e9f7ef' : '#fdeded', color: hospitalMessage.type === 'success' ? '#155724' : '#721c24', border: `1px solid ${hospitalMessage.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span>{hospitalMessage.type === 'success' ? '🛡️' : '⚠️'}</span>
                      {hospitalMessage.text}
                  </div>
              )}

              <div className="drawer-footer" style={{ marginTop: '20px', display: 'flex', gap: '15px' }}>
                <button type="button" className="btn-logout" style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #eee' }} onClick={() => setIsHospitalDrawerOpen(false)}>ABORT</button>
                <button type="submit" disabled={savingHospital} style={{ flex: 2, padding: '16px', borderRadius: '16px', background: '#0f52ba', color: 'white', fontWeight: 950, fontSize: '11px', letterSpacing: '1px', border: 'none', cursor: 'pointer' }}>
                    {savingHospital ? 'SYNCHRONIZING...' : 'COMMIT CHANGES →'}
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
      <div className="prescription-architect" style={{ display: 'flex', gap: '30px', height: 'calc(100vh - 200px)', animation: 'fadeIn 0.5s ease' }}>
        {/* CONTROL SIDEBAR (Strategic Glass) */}
        <div style={{ 
          width: '420px', 
          background: 'rgba(255, 255, 255, 0.8)', 
          backdropFilter: 'blur(16px)',
          borderRadius: '30px', 
          padding: '35px', 
          boxShadow: '0 20px 50px rgba(15, 82, 186, 0.05)', 
          overflowY: 'auto', 
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
                 ⚠️ NO CLINICAL CONSULTANTS DETECTED. PLEASE REGISTER RADIOLOGISTS IN THE PERSONNEL TAB.
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
                   alert("STRATEGIC PROTOCOL SYNCHRONIZED SUCCESSFULLY 📡");
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
          <div style={{ marginTop: '20px', fontSize: '12px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px' }}>SYNCHRONIZING STRATEGIC OUTLOOK...</div>
        </div>
      );
    }

    if (!outlookData) return null;

    const { kpis, modalities, volumeTrends, demographics, topSources } = outlookData;

    return (
      <div className="analytics-view fade-in">
        {/* Intelligence Header: Real-time Flux Search */}
        <div style={{ background: 'white', padding: '20px 30px', borderRadius: '24px', border: '1px solid #e2e8f0', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '15px', fontSize: '13px', fontWeight: 950, color: '#1e293b' }}>
              <span>Regional Source Outlook</span>
              <span style={{ color: '#94a3b8', fontSize: '10px' }}>LOGGED DATE: {selectedDateFilter === TODAY ? 'TODAY' : selectedDateFilter}</span>
           </div>
           <div style={{ display: 'flex', gap: '10px' }}>
              {(topSources || []).map((s, i) => (
                <div key={s.name || i} style={{ fontSize: '9px', fontWeight: 950, padding: '6px 12px', background: i === 0 ? '#eff6ff' : '#f8fafc', color: i === 0 ? '#2563eb' : '#64748b', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
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
              <div style={{ marginTop: '15px', fontSize: '8px', color: 'var(--tactical-cyan)', fontWeight: 900, background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px', display: 'inline-block' }}>STRATEGIC RESOURCE POOL</div>
           </div>



           <div className="summary-card" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '20px', borderRadius: '24px' }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '12px' }}>Live Volume</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                 <span style={{ fontSize: '32px', fontWeight: 950, color: '#1e293b', letterSpacing: '-1.5px' }}>{kpis?.dailyMissions || 0}</span>
                 <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f52ba' }}>MISSIONS</span>
              </div>
              <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <span style={{ fontSize: '10px', fontWeight: 950, color: '#2ecc71' }}>↑ {kpis?.growthPercentage || 0}%</span>
                 <span style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8' }}>OPERATIONAL GAIN</span>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '30px' }}>
           {/* Modality Intel */}
           <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '30px' }}>Clinical Modality Intel</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
                 <div style={{ width: '150px', height: '150px', borderRadius: '50%', border: '20px solid #eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '20px solid transparent', borderTopColor: '#0f52ba', transform: 'rotate(45deg)' }}></div>
                    <div style={{ textAlign: 'center' }}>
                       <div style={{ fontSize: '32px', fontWeight: 950, color: '#1e293b' }}>{modalities.reduce((a, b) => a + b.count, 0)}</div>
                       <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8' }}>TOTAL UNITS</div>
                    </div>
                 </div>
                 <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
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
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '160px', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9' }}>
                 {(volumeTrends || []).map((day, idx) => (
                  <div key={day.day || idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '100%', height: `${(day.count / (Math.max(...(volumeTrends || []).map(v => v.count)) || 1)) * 100}%`, background: day.isPeak ? '#dc2626' : '#0f52ba', borderRadius: '6px 6px 0 0', position: 'relative' }}>
                       <div style={{ position: 'absolute', top: '-20px', width: '100%', textAlign: 'center', fontSize: '9px', fontWeight: 950, color: '#1e293b' }}>{day.count || 0}</div>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8' }}>{(day.day || 'N/A').toUpperCase()}</span>
                  </div>
                ))}
              </div>
           </div>
        </div>

        {/* Level 3: Demographics & Specialist Leadership */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
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

    return (
      <div className="referral-intel-view">
        {/* Level 1: Tactical Control Deck */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px' }}>
          <div>
            <h2 style={{ fontSize: '13px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '3px', color: '#0f52ba', marginBottom: '12px' }}>Referral Intelligence Engine</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
               <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  {['MATRIX', 'LOG', 'ROSTER', 'PATIENTS'].map(mode => (
                    <button 
                      key={mode} 
                      onClick={() => {
                        setReferralViewMode(mode);
                        if (mode === 'PATIENTS') fetchPatientMasterList();
                      }}
                      style={{ 
                        padding: '6px 15px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                        background: referralViewMode === mode ? 'white' : 'transparent',
                        color: referralViewMode === mode ? '#0f52ba' : '#64748b',
                        boxShadow: referralViewMode === mode ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                        cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '0.5px'
                      }}
                    >
                      {mode === 'MATRIX' ? 'SOURCE ANALYTICS' : mode === 'LOG' ? 'REFERRAL CASE LEDGER' : mode === 'ROSTER' ? 'PARTNER NETWORK' : 'MASTER PATIENT INDEX'}
                    </button>
                  ))}
               </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
             {/* Unified Search Sub-node */}
             <div style={{ position: 'relative', width: '240px' }}>
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
                    width: '100%', padding: '12px 15px 12px 42px', borderRadius: '14px', border: '1px solid #e2e8f0', 
                    fontSize: '10px', fontWeight: 900, background: 'white', outline: 'none', transition: 'all 0.3s'
                  }} 
                />
             </div>

              {/* Temporal Unit */}
             <div style={{ display: 'flex', background: '#f8fafc', padding: '4px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', gap: '2px', marginRight: '10px' }}>
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
                         {isExporting ? 'EXPORTING...' : 'INITIATE TACTICAL EXPORT'}
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
                <p style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', marginTop: '25px', letterSpacing: '2px' }}>SYNCHRONIZING TACTICAL DATA...</p>
            </div>
        ) : (
          <>

            {/* Level 3: Dual-Mode Intelligence List */}
            {referralViewMode === 'PATIENTS' ? (
              <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ID</th>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>PTID (IDENTIFIER)</th>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>FULL NAME</th>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CONTACT NODE</th>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>AGE / GENDER</th>
                      <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>REG DATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingMaster ? (
                       <tr><td colSpan="6" style={{ padding: '60px', textAlign: 'center' }}><div className="pulse-loader" style={{ margin: '0 auto' }}></div></td></tr>
                    ) : patientMasterList.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>NO REGISTERED PATIENTS FOUND FOR THIS PERIOD</td>
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
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : referralViewMode === 'ROSTER' ? (
              <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>RANK</th>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>REFERRAL SOURCE</th>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CONTACT NODE</th>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ADDRESS / SECTOR</th>
                      <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>TOTAL MISSIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referralAggregated.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>NO RECONNAISSANCE DATA AVAILABLE FOR THIS PERIOD</td>
                      </tr>
                    ) : (
                      referralAggregated
                        .filter(s => !referralRosterSearch || s.name.toLowerCase().includes(referralRosterSearch.toLowerCase()))
                        .map((s, i) => (
                        <tr key={s.name} style={{ borderBottom: '1px solid #f1f5f9', transition: 'all 0.2s' }}>
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
                            <div style={{ fontSize: '16px', fontWeight: 950, color: '#0f52ba' }}>{s.patients.length}</div>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px' }}>UNITS</div>
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
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '5px' }}>INTELLIGENCE ROSTER</div>
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
                          <div style={{ padding: '35px 40px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fcfdfe' }}>
                             <div>
                                <div style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px', marginBottom: '8px' }}>REFERRAL BRIEFING</div>
                                <div style={{ fontSize: '22px', fontWeight: 950, color: '#1e293b', letterSpacing: '-0.5px' }}>{(selected.name || 'Anonymous').toUpperCase()}</div>
                             </div>
                          </div>

                          <div style={{ padding: '30px' }}>
                             {/* Referral Case Table */}
                             <div style={{ borderRadius: '20px', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                  <thead style={{ background: '#fcfdfe' }}>
                                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>REFERRAL_ID</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>TARGET_IDENTITY</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CONTACT / SOURCE</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CLINICAL PACKAGE</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>STATUS</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'right', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>DATE</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selected.patients.map(p => (
                                      <tr key={p.patientId} style={{ borderBottom: '1px solid #f8fafc' }}>
                                        <td style={{ padding: '15px 25px', fontSize: '11px', fontWeight: 950, color: '#0f52ba', fontFamily: 'monospace' }}>{p.patientIdentifier || 'UNSET'}</td>
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
                                           {(() => {
                                              const cfg = getStatusConfig(p.status);
                                              return <span style={{ fontSize: '8px', fontWeight: 950, padding: '3px 8px', borderRadius: '6px', background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                                           })()}
                                        </td>
                                        <td style={{ padding: '15px 25px', fontSize: '11px', color: '#94a3b8', textAlign: 'right', fontWeight: 900 }}>{p.registrationDate}</td>
                                      </tr>
                                    ))}
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
            ) : (
              /* Global Referral Matrix View */
              <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: isTestMode ? 'visible' : 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.01)', padding: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#1e293b', margin: 0 }}>REFERRAL CASE LEDGER</h3>
                    <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Temporal breakdown of patient intelligence</p>
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
       <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
         <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', color: '#888' }}>Reporting Protocol Design</h2>
         <button className="btn-primary" onClick={() => handleOpenLayoutDrawer()}>+ New Configuration</button>
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
      <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px' }}>
        <div>
          <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', color: '#0f52ba', marginBottom: '4px' }}>Hospital Personnel Roster</h2>
          <p style={{ fontSize: '11px', color: '#888', fontWeight: 600 }}>Active deployment and credential management for clinical staff.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          {/* Tactical Search bar */}
          <div style={{ position: 'relative', width: '300px' }}>
            <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
            <input 
              type="text" 
              placeholder="SEARCH BY IDENTITY / ROLE..." 
              value={personnelSearch}
              onChange={e => setPersonnelSearch(e.target.value)}
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

      <div className="personnel-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '25px' }}>
        {personnelLoading && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px' }}>
            <div className="pulse-loader"></div>
            <p style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba', marginTop: '20px' }}>SYNCHRONIZING PERSONNEL...</p>
          </div>
        )}
        
        {!personnelLoading && filteredPersonnel.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '100px 20px', border: '1px dashed #eee', borderRadius: '24px' }}>
             <div style={{ fontSize: '40px', marginBottom: '15px' }}>👤</div>
             <div style={{ fontSize: '14px', fontWeight: 950, color: '#1a1a2e' }}>NO PERSONNEL MATCHED</div>
             <p style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>Your search query did not return any active staff signatures.</p>
          </div>
        )}

        {!personnelLoading && filteredPersonnel.map(u => {
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
            <div key={u.id} className="personnel-card" style={{ 
              background: 'white', borderRadius: '24px', border: '1px solid #eee', 
              padding: '30px', position: 'relative', overflow: isTestMode ? 'visible' : 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.02)', transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              cursor: 'default'
            }}>
              {/* Tactical Accent */}
              <div style={{ position: 'absolute', top: 0, left: 0, width: '6px', bottom: 0, background: roleMeta.color }}></div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '25px' }}>
                <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
                  <div style={{ 
                    width: '60px', height: '60px', borderRadius: '18px', 
                    background: roleMeta.bg, color: roleMeta.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '24px', border: `1px solid ${roleMeta.color}20`,
                    boxShadow: `0 8px 20px ${roleMeta.color}10`
                  }}>
                    {u.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 950, color: '#1a1a2e', fontSize: '18px', letterSpacing: '-0.5px' }}>{(u.name || 'Unknown Staff').toUpperCase()}</div>
                    <span style={{ marginTop: '4px', fontSize: '9px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>HUB_NODE_{u.id?.split('-')[0]}</span>
                  </div>
                </div>
                <div style={{ 
                  padding: '6px 14px', borderRadius: '20px', background: roleMeta.bg, 
                  color: roleMeta.color, fontSize: '10px', fontWeight: 950, letterSpacing: '1px' 
                }}>
                  {ROLE_LABELS[userRole]?.toUpperCase()}
                </div>
              </div>

              <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '20px', marginBottom: '25px', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>SYSTEM IDENTITY</span>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{u.email}</span>
                  </div>
                  <div style={{ borderTop: '1px solid #edf2f7', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ACCESS KEY</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 950, color: u.password ? '#0f52ba' : '#cbd5e1', fontFamily: 'monospace' }}>
                        {u.password || '••••••••'}
                      </span>
                      {copyFeedback === u.id && <span style={{ fontSize: '8px', color: '#2ecc71', fontWeight: 900 }}>COPIED!</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                     <span style={{ fontSize: '9px', fontWeight: 950, color: '#cbd5e1', letterSpacing: '0.5px' }}>LAST ACTIVE</span>
                     <span style={{ fontSize: '11px', fontWeight: 950, color: u.lastLogin ? '#1e293b' : '#cbd5e1' }}>{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'OFFLINE'}</span>
                  </div>
                  <div style={{ width: '1px', height: '24px', background: '#edf2f7' }}></div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                     <span style={{ fontSize: '9px', fontWeight: 950, color: '#cbd5e1', letterSpacing: '0.5px' }}>STATUS</span>
                     <span style={{ fontSize: '11px', fontWeight: 950, color: u.status === 'active' ? '#2ecc71' : '#cbd5e1' }}>{(u.status || 'ACTIVE').toUpperCase()}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {canAdminEdit && (
                    <>
                      <button 
                        title="Copy Credentials"
                        style={{ width: '38px', height: '38px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }} 
                        onClick={() => handleCopyCredentials(u)}
                      >
                        📋
                      </button>
                      <button 
                        title="Share on WhatsApp"
                        style={{ width: '38px', height: '38px', borderRadius: '12px', background: '#e9f7ef', border: '1px solid #c3e6cb', color: '#27ae60', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }} 
                        onClick={() => handleWhatsAppShare(u)}
                      >
                        💬
                      </button>
                      <button 
                        className="btn-logout" 
                        style={{ padding: '0 15px', height: '38px', borderRadius: '12px', fontSize: '10px', fontWeight: 950, border: '1px solid #f1f5f9', background: 'white', cursor: 'pointer' }} 
                        onClick={() => handleOpenUserDrawer(u)}
                      >
                        EDIT
                      </button>
                      {u.id !== currentUser.id && (
                        <button 
                          style={{ width: '38px', height: '38px', borderRadius: '12px', background: '#fff5f5', border: '1px solid #fecaca', color: '#e74c3c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }} 
                          onClick={() => handleDeleteUser(u.id, u.roles)}
                        >
                          🗑️
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="page-wrapper board-padding" style={{ paddingTop: '30px' }}>
      <div className="board-hero-header flex-stack-mobile" style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '20px' }}>
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 950, color: '#0a1628', letterSpacing: '-1px', margin: 0 }}>OPERATIONAL COMMAND</h1>
            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '4px' }}>Strategic Node Control</span>
          </div>
        </div>

        {/* Institutional Hub Switcher - Relocated from TopNav */}
        <div className="center-switcher-hud" style={{ position: 'relative' }}>
          <button 
            id="center-switcher-btn"
            className="command-core-btn"
            onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 18px', 
              borderRadius: '14px', background: 'white', border: '1px solid #e2e8f0', 
              cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' 
            }}
          >
            <div className={isSwitchingNode ? "pulse-loader-mini" : "tactical-node-active"} style={{ width: '10px', height: '10px', borderRadius: '50%', background: isSwitchingNode ? '#f39c12' : '#2ecc71', boxShadow: isSwitchingNode ? '0 0 10px rgba(243, 156, 18, 0.4)' : '0 0 10px rgba(46, 204, 113, 0.4)' }}></div>
            <div className="hub-identity" style={{ textAlign: 'left', overflow: 'hidden' }}>
              <div className="hub-label" style={{ fontSize: '7px', fontWeight: 950, color: isSwitchingNode ? '#f39c12' : '#aaa', letterSpacing: '1px', textTransform: 'uppercase' }}>{isSwitchingNode ? 'RECONFIGURING HUB...' : 'DEPLOYED HUB'}</div>
              <div className="hub-name" style={{ fontSize: '13px', fontWeight: 950, color: '#1a1a2e', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: isTestMode ? 'visible' : 'hidden', maxWidth: '180px', opacity: isSwitchingNode ? 0.5 : 1 }}>{activeCenter?.name?.toUpperCase()}</div>
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
                  position: 'absolute', top: '100%', left: 0, marginTop: '12px', width: '350px', 
                  zIndex: 1100, background: 'white', borderRadius: '18px', border: '1px solid #e2e8f0', 
                  boxShadow: '0 15px 50px rgba(0,0,0,0.15)', padding: '15px' 
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
                           <span style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{center.name}</span>
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
            alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s',
            fontSize: '10px', fontWeight: 950, letterSpacing: '1px',
            boxShadow: '0 8px 25px rgba(15, 82, 186, 0.25)'
          }}
        >
          <span style={{ fontSize: '14px' }}>📡</span> REGISTER NEW CHAIN
        </button>
      </div>
      
      {/* Hub Controller Navigation */}
      <div className="admin-tabs flex-stack-mobile" style={{ 
        background: 'rgba(15, 82, 186, 0.03)', 
        backdropFilter: 'blur(10px)',
        padding: '6px', 
        borderRadius: '16px', 
        border: '1px solid rgba(15, 82, 186, 0.1)', 
        marginBottom: '40px', 
        display: 'flex',
        overflowX: 'auto', // Allow horizontal scroll for tabs on narrow tablets
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
        scrollbarWidth: 'none' // Hide scrollbar for cleaner look
      }}>
        {['INTELLIGENCE', 'REFERRAL INTEL', 'PERSONNEL', 'HOSPITAL', 'FINANCE', 'PRESCRIPTION', 'SUBSCRIPTION'].map(tab => (
          <button 
            key={tab}
            className={`admin-tab ${activeTab === tab ? 'active' : ''}`} 
            onClick={() => setActiveTab(tab)}
            style={{ 
              flex: 1, 
              borderRadius: '12px', 
              border: 'none', 
              padding: '14px', 
              fontWeight: 950, 
              letterSpacing: '1px', 
              background: activeTab === tab ? 'white' : 'transparent', 
              color: activeTab === tab ? '#0f52ba' : '#64748b',
              boxShadow: activeTab === tab ? '0 8px 20px rgba(15, 82, 186, 0.15)' : 'none', 
              textTransform: 'uppercase', 
              fontSize: '11px',
              transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              cursor: 'pointer'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'INTELLIGENCE' && renderAnalytics()}
      {activeTab === 'REFERRAL INTEL' && renderReferralIntel()}
      {activeTab === 'PERSONNEL' && renderUserManagement()}
      {activeTab === 'HOSPITAL' && renderHospitalSettings()}
      {activeTab === 'FINANCE' && (
        <FinanceManager 
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
      {activeTab === 'PRESCRIPTION' && renderPrescriptionArchitect()}
      {activeTab === 'SUBSCRIPTION' && renderSubscription()}

      {isHospitalDrawerOpen && renderHospitalSettingsDrawer()}
      {isChainDrawerOpen && renderChainDrawer()}

      {/* Personnel Roster Drawer: Redesigned Tactical HUD */}
      {isUserDrawerOpen && (
        <div className="drawer-overlay" onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)' }}>
           <div className="drawer-content" style={{ 
             padding: 0, 
             width: '500px',
             borderRadius: '24px 0 0 24px', 
             background: '#fff',
             boxShadow: '-20px 0 60px rgba(0,0,0,0.1)',
             display: 'flex',
             flexDirection: 'column'
           }} onClick={e => e.stopPropagation()}>
              
              {/* Tactical Header */}
              <div className="drawer-header" style={{ 
                background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', 
                color: 'white', 
                padding: '40px 30px',
                position: 'relative',
                overflow: 'hidden'
              }}>
                 {/* Decorative HUD Lines */}
                 <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                 <div style={{ position: 'absolute', top: '10px', left: '30px', width: '20px', height: '2px', background: 'var(--tactical-cyan)' }}></div>
                 
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 950, letterSpacing: '3px', color: 'var(--tactical-cyan)', textTransform: 'uppercase' }}>Personnel Deployment</span>
                        <h2 style={{ fontWeight: 950, fontSize: '24px', letterSpacing: '-0.5px' }}>{editUser?.id ? 'CONFIG_IDENTITY' : 'INIT_REGISTRATION'}</h2>
                    </div>
                    <button className="btn-close" style={{ color: 'white', opacity: 0.6, fontSize: '28px' }} onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }}>&times;</button>
                 </div>

                 {/* Pulse Badge */}
                 <div style={{ 
                   marginTop: '20px',
                   display: 'inline-flex',
                   alignItems: 'center',
                   gap: '8px',
                   padding: '6px 14px',
                   background: 'rgba(255,255,255,0.1)',
                   borderRadius: '20px',
                   border: '1px solid rgba(255,255,255,0.1)'
                 }}>
                    <div className="tactical-node-active" style={{ width: '6px', height: '6px' }}></div>
                    <span style={{ fontSize: '9px', fontWeight: 950, letterSpacing: '1px' }}>SYSTEM_PHASE_{userRegStep}: {(userRegStep === 1 ? 'BIO_DATA' : 'CREDENTIAL_SYNC')}</span>
                 </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '40px 30px' }}>
                 <form onSubmit={handleSaveUser}>
                    {userRegStep === 1 && (
                      <div className="wizard-step" style={{ animation: 'slideRight 0.4s ease' }}>
                        
                        {/* Validation HUD Summary */}
                        {(!editUser.name || !editUser.email || editUser.roles.length === 0) && (
                          <div style={{ 
                            background: '#fff9f0', 
                            border: '1px solid #ffe8cc', 
                            padding: '16px', 
                            borderRadius: '16px', 
                            marginBottom: '30px',
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'center'
                          }}>
                            <span style={{ fontSize: '20px' }}>⚠️</span>
                            <div>
                              <div style={{ fontSize: '11px', fontWeight: 950, color: '#f39c12' }}>ACTION REQUIRED</div>
                              <div style={{ fontSize: '10px', color: '#888' }}>Personnel profile core parameters missing or invalid.</div>
                            </div>
                          </div>
                        )}

                        <div className="form-group" style={{ marginBottom: '30px' }}>
                           <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '12px' }}>Operational Alias (Full Name)</label>
                           <input 
                             type="text" 
                             required 
                             placeholder="Ex: John Doe"
                             value={editUser?.name} 
                             onChange={e => setEditUser({...editUser, name: e.target.value})} 
                             style={{ 
                               width: '100%', 
                               border: 'none', 
                               borderBottom: '2px solid #f0f0f0', 
                               fontSize: '18px', 
                               fontWeight: 800, 
                               padding: '12px 0', 
                               outline: 'none',
                               color: '#1a1a2e',
                               transition: 'border-color 0.3s ease'
                             }} 
                             onFocus={(e) => e.target.style.borderBottomColor = 'var(--tactical-cyan)'}
                             onBlur={(e) => e.target.style.borderBottomColor = '#f0f0f0'}
                           />
                        </div>
                        
                        <div style={{ display: 'flex', gap: '30px', marginBottom: '35px' }}>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>System UID (Email)</label>
                               <input type="email" required value={editUser?.email} onChange={e => setEditUser({...editUser, email: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                           </div>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Mobile Contact</label>
                               <input type="tel" required placeholder="+91 000-000-0000" value={editUser?.mobile} onChange={e => setEditUser({...editUser, mobile: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                           </div>
                        </div>

                        <div style={{ display: 'flex', gap: '30px', marginBottom: '35px' }}>
                           <div className="form-group" style={{ flex: 1, position: 'relative' }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Access Crypt (Password)</label>
                               <input type={showPasswords ? "text" : "password"} required value={editUser?.password} onChange={e => setEditUser({...editUser, password: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                               <button 
                                 type="button" 
                                 onClick={() => setShowPasswords(!showPasswords)}
                                 style={{ position: 'absolute', right: 0, bottom: '10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', opacity: 0.5 }}
                               >
                                 {showPasswords ? 'HIDE' : 'SHOW'}
                               </button>
                           </div>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Confirm Crypt</label>
                               <input type={showPasswords ? "text" : "password"} required value={editUser?.confirmPassword} onChange={e => setEditUser({...editUser, confirmPassword: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                               {editUser.password && editUser.confirmPassword && editUser.password !== editUser.confirmPassword && (
                                 <div style={{ fontSize: '8px', color: '#e74c3c', fontWeight: 900, marginTop: '4px' }}>MISMATCH DETECTED</div>
                               )}
                           </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: '30px' }}>
                           <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '15px' }}>Assigned Directives (Multi-Role Select)</label>
                           
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                              {[
                                { id: 'doctor',       label: 'Doctor',       desc: 'Precision Reporting',  color: '#0891b2', icon: '👨‍⚕️' },
                                { id: 'technician',   label: 'Technician',   desc: 'Ops & Acquisition',    color: '#f39c12', icon: '🩻'  },
                                { id: 'receptionist', label: 'Receptionist', desc: 'Patient Dispatch',      color: '#e84393', icon: '📋'  },
                                { id: 'admin',        label: 'Admin',        desc: 'Governance Control',    color: '#0f52ba', icon: '🏢'  },
                                { id: 'accountant',   label: 'Accountant',   desc: 'Financial Comptroller', color: '#059669', icon: '📊'  },
                                ...(currentUser.roles?.[0] === 'admindoctor' ? [{ id: 'admindoctor', label: 'AdminDoctor', desc: 'Master Authority', color: '#6366f1', icon: '⭐' }] : [])
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
                                      border: `1px solid ${isSelected ? role.color : '#eee'}`,
                                      background: isSelected ? `${role.color}05` : 'white',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '12px',
                                      boxShadow: isSelected ? `0 4px 12px ${role.color}15` : 'none'
                                    }}
                                  >
                                    <div style={{ 
                                      width: '32px', height: '32px', borderRadius: '10px', 
                                      background: isSelected ? role.color : '#f8f9fa',
                                      color: isSelected ? 'white' : '#888',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: '16px'
                                    }}>
                                      {role.icon}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: '12px', fontWeight: 950, color: isSelected ? role.color : '#1a1a2e' }}>{role.label.toUpperCase()}</div>
                                      <div style={{ fontSize: '8px', color: '#aaa', fontWeight: 700 }}>{role.desc.toUpperCase()}</div>
                                    </div>
                                    {isSelected && <div style={{ color: role.color, fontSize: '10px' }}>[x]</div>}
                                  </div>
                                );
                              })}
                           </div>
                        </div>

                        {(editUser.roles.includes('doctor') || editUser.roles.includes('admindoctor')) && (
                          <div style={{ 
                            background: 'rgba(15, 82, 186, 0.05)', 
                            padding: '16px', 
                            borderRadius: '16px', 
                            border: '1px dashed #0f52ba', 
                            marginTop: '20px',
                            display: 'flex',
                            gap: '12px'
                          }}>
                             <div style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 800, lineHeight: 1.4 }}>
                                CLINICAL ACTIVATION DETECTED: <br/>
                                <span style={{ opacity: 0.7 }}>Phase 2 will initiate clinical credential syncing for reporting authorization.</span>
                             </div>
                          </div>
                        )}
                      </div>
                    )}

                    {userRegStep === 2 && (
                      <div className="wizard-step" style={{ animation: 'slideLeft 0.4s ease' }}>
                        <div style={{ 
                          background: '#f0faff', 
                          padding: '24px', 
                          borderRadius: '20px', 
                          marginBottom: '35px', 
                          border: '1px solid #e0f2fe',
                          position: 'relative',
                          overflow: 'hidden'
                        }}>
                          <p style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px', marginBottom: '8px' }}>CLINICAL REGISTRY</p>
                          <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, lineHeight: 1.5 }}>Authorized clinical reporting requires verified professional credentials and licensing data.</p>
                        </div>

                        <div className="form-group" style={{ marginBottom: '30px' }}>
                           <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Core Specialization / Wing</label>
                           <input type="text" placeholder="e.g. Neuroradiologist" value={editUser?.specialization} onChange={e => setEditUser({...editUser, specialization: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '15px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                        </div>

                        <div style={{ display: 'flex', gap: '30px', marginBottom: '30px' }}>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Registration License #</label>
                               <input type="text" placeholder="Ex: PMC-894-0" value={editUser?.licenseNo} onChange={e => setEditUser({...editUser, licenseNo: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                           </div>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Primary Professional Degree</label>
                               <input type="text" placeholder="MBBS, MD" value={editUser?.degree} onChange={e => setEditUser({...editUser, degree: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                           </div>
                        </div>
                      </div>
                    )}

                    <div className="drawer-footer" style={{ marginTop: '40px', display: 'flex', gap: '15px' }}>
                      {userRegStep === 1 ? (
                        <>
                          <button type="button" className="btn-logout" style={{ flex: 1, padding: '18px', borderRadius: '16px', border: '1px solid #eee' }} onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }}>ABORT</button>
                          <button 
                            type="submit" 
                            className="btn-primary" 
                            style={{ flex: 2, padding: '18px', borderRadius: '16px', background: '#0f52ba', color: 'white', fontWeight: 950, fontSize: '11px', letterSpacing: '1px' }}
                          >
                            {(editUser.roles.includes('doctor') || editUser.roles.includes('admindoctor')) ? 'NEXT: CREDENTIALS' : 'FINALIZE DEPLOYMENT'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="btn-logout" style={{ flex: 1, padding: '18px', borderRadius: '16px', border: '1px solid #eee' }} onClick={() => setUserRegStep(1)}>REVERT</button>
                          <button 
                            type="submit" 
                            className="btn-primary" 
                            style={{ flex: 2, padding: '18px', borderRadius: '16px', background: 'var(--tactical-indigo)', color: 'white', fontWeight: 950, fontSize: '11px', letterSpacing: '1px' }}
                          >
                            COMPLETE DOCTOR SYNC
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
        <div className="drawer-overlay" onClick={() => setIsLayoutDrawerOpen(false)}>
           <div className="drawer-content" onClick={e => e.stopPropagation()}>
              <div className="drawer-header">
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
                <div style={{ fontSize: '9px', fontWeight: 800, color: '#991b1b', letterSpacing: '1px' }}>SYSTEM FAILURES</div>
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


    </div>
  );

  function renderChainDrawer() {
    return (
      <div className="drawer-overlay" onClick={() => setIsChainDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
        <div className="drawer-content" style={{ padding: 0, width: '450px', background: 'white', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
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
