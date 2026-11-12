import React, { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient, { BASE_URL } from '../api/apiClient';
import useAuth from '../auth/useAuth';
import TaxBillingSettings from '../components/Admin/TaxBillingSettings';
import { ROLE_LABELS, getCustomRoles, getRoleLabel } from '../data/roles';
import useOffline from '../hooks/useOffline';
import { nativeStorage } from '../hooks/useElectron';
import { snapshotServiceCharges, watchServiceCharges } from '../db/repos/serviceChargesRepo';
import { snapshotPersonnel, watchPersonnel } from '../db/repos/personnelRepo';
import useFinanceRevision from '../hooks/useFinanceRevision';
import { formatPatientAge } from '../utils/patientAge';
import '../styles/global.css';
import '../styles/AdminBoard.css';
import ReportPaperSettings from '../components/reportPaper/ReportPaperSettings';
import AiPrivacySettings from '../components/aiPrivacy/AiPrivacySettings';
// Lazy — pulls in mapbox-gl, which doesn't need to be part of the board's
// own bundle.
import OverviewDashboard from './admin/OverviewDashboard';
const HospitalLocationPicker = lazy(() => import('../components/HospitalLocationPicker'));
import FinanceManager from '../components/FinanceManager';
import RolesAndPermissions from '../components/RolesAndPermissions';
import { notifyToast } from '../utils/toast';


// --- HELPERS ---
const getISODate = (offset = 0) => {
  // Local (device) calendar date - NOT toISOString(), which is the UTC date and put "today" a
  // day behind for the first 5.5 hours of every IST day.
  const d = new Date();
  d.setDate(d.getDate() - offset);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().split('T')[0];
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
  const { currentUser, logout, activeCenter, centers, switchCenter, refreshCenters, createCenter, subscription, refreshSubscription, modules } = useAuth();
  const { isOnline, addToOutbox } = useOffline();
  const navigate = useNavigate();

  // Cloud PACS-only centres get a trimmed Dashboard — just the two things they
  // still manage here: add/remove users (Staff) and the report letterhead.
  // Everything RIS/clinic-ops (Overview analytics, Roles, Hospitals, Finance) is
  // hidden. RIS-only / RIS+PACS see the full tab set.
  const isPacsOnly = Array.isArray(modules) && modules.includes('PACS') && !modules.includes('RIS');
  const ALL_TABS = ['Overview', 'Staff', 'Roles', 'Hospitals', 'Finance', 'Tax & billing', 'Letterhead', 'AI & privacy'];
  const visibleTabs = isPacsOnly ? ['Staff', 'Letterhead', 'AI & privacy'] : ALL_TABS;
  // The single role every Cloud PACS-only user is onboarded with — full access
  // to the (already module-trimmed) PACS surface. admindoctor is the superset
  // role, so it satisfies the reporting + admin routes a PACS centre exposes;
  // the sidebar + backend module gates keep the experience scoped to PACS.
  const PACS_ONBOARD_ROLE = 'admindoctor';

  const [activeTab, setActiveTab] = useState('Overview');

  // When the SKU resolves to PACS-only, land on a tab that actually exists for
  // them (default 'Overview' is hidden), and never let a hidden tab stay active.
  useEffect(() => {
    if (isPacsOnly && !visibleTabs.includes(activeTab)) setActiveTab('Staff');
  }, [isPacsOnly, activeTab]);
  const [layouts, setLayouts] = useState(INITIAL_LAYOUTS);
  const [patients, setPatients] = useState([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [staffCurrentPage, setStaffCurrentPage] = useState(1);
  const staffItemsPerPage = 5;
  const [revealedPasswords, setRevealedPasswords] = useState({});
  
  // Dashboard Filters
  const [selectedDateFilter, setSelectedDateFilter] = useState(TODAY);
  const [overviewTimeframe, setOverviewTimeframe] = useState('MONTH'); // 'DAY', 'WEEK', 'MONTH', 'YEAR', 'ALL'
  
  // Layout Builder State
  const [isLayoutDrawerOpen, setIsLayoutDrawerOpen] = useState(false);
  const [editLayout, setEditLayout] = useState({ name: '', modality: 'X-RAY', type: '', active: true, selectedSections: ['findings', 'impression'] });

  // User Management State
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
  const [revokeUser, setRevokeUser] = useState(null);
  const [isHospitalDrawerOpen, setIsHospitalDrawerOpen] = useState(false);
  const [isChainDrawerOpen, setIsChainDrawerOpen] = useState(false);
  const [isDeployingChain, setIsDeployingChain] = useState(false);
  const [newChainData, setNewChainData] = useState({ chainName: '', hospitalName: '', hospitalAddress: '', modules: 'RIS,PACS' });
  const [showChainSelector, setShowChainSelector] = useState(false);
  // The on-page hospital switcher was removed in favour of the global one
  // in TopNav (visible on every page). isSwitchingNode is still used by
  // handleSwitchNode, which fires after a new hospital is deployed.
  const [isSwitchingNode, setIsSwitchingNode] = useState(false);
  const [userRegStep, setUserRegStep] = useState(1);
  const [editUser, setEditUser] = useState(null);
  // Inline save error shown INSIDE the staff drawer (a toast can hide behind the
  // drawer overlay) — e.g. duplicate email/mobile at this centre.
  const [userSaveError, setUserSaveError] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [settings, setSettings] = useState({ allowCustom: true, lockApproved: false, reqFindings: true, reqImpression: true });
  const [showPasswords, setShowPasswords] = useState(false);
  const [sharingUser, setSharingUser] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState('');

  // Custom Sections Registry
  const [customSections, setCustomSections] = useState([]);
  const [newSectionName, setNewSectionName] = useState('');

  // Referral Intel State
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [personnel, setPersonnel] = useState([]);
  const [referralIntelligence, setReferralIntelligence] = useState([]);
  const [personnelLoading, setPersonnelLoading] = useState(false);
  const [outlookData, setOutlookData] = useState(null);
  const [loadingOutlook, setLoadingOutlook] = useState(false);
  const [geoTab, setGeoTab] = useState('VILLAGE'); // 'VILLAGE' or 'DISTRICT'
  const [hoveredGeoItem, setHoveredGeoItem] = useState(null);
  
  // Referral Payout State
  const [loading, setLoading] = useState(false);

  // Responsive layout detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const [servicePrices, setServicePrices] = useState([]);
  const [financialMatrix, setFinancialMatrix] = useState(null);
  // Bumps whenever the cached finance data changes (new invoice/payment/
  // commission, here or synced from another device). Added to the analytics
  // fetch effects below so the dashboards re-fetch on their own — no reload.
  const financeRev = useFinanceRevision();
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

  // Report paper (Admin ▸ Report paper) lives in its own component —
  // components/reportPaper/ReportPaperSettings. isTestMode is still passed
  // to FinanceManager.
  const [isTestMode] = useState(false);

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

  // Warm the price-registry snapshot; the list renders from watchServiceCharges
  // below, so an edited price appears here on its own (refreshed each cycle).
  const fetchServicePrices = useCallback(async () => {
    try {
      const res = await apiClient.get('/finance/registry');
      await snapshotServiceCharges(res.data);
    } catch (err) {
      console.error('[FINANCE] Registry refresh failed — keeping offline snapshot.', err);
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
    publicContact: '',
    publicEmail: '',
    isAutoBillingEnabled: false,
    latitude: null,
    longitude: null,
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
  // Clinical credentials edit state — local copy of admin's spec/degree/license
  // shown in the drawer so the user can edit before clicking Save.
  const [adminEdit, setAdminEdit] = useState({ specialization: '', degree: '', licenseNo: '' });
  const [savingAdmin, setSavingAdmin] = useState(false);

  // Hydrate the edit form whenever the admin data refreshes
  useEffect(() => {
    if (hospitalData.admin) {
      setAdminEdit({
        specialization: hospitalData.admin.specialization || '',
        degree:         hospitalData.admin.degree || '',
        licenseNo:      hospitalData.admin.licenseNo || '',
      });
    }
  }, [hospitalData.admin?.userId, hospitalData.admin?.specialization, hospitalData.admin?.degree, hospitalData.admin?.licenseNo]);

  const handleSaveAdminCredentials = async () => {
    if (!hospitalData.admin?.userId) return;
    setSavingAdmin(true);
    try {
      await apiClient.patch(`/personnel/${hospitalData.admin.userId}/clinical-credentials`, {
        specialization: adminEdit.specialization || null,
        degree:         adminEdit.degree || null,
        licenseNo:      adminEdit.licenseNo || null,
      });
      // Reflect the saved values locally so the admin card refreshes
      setHospitalData(prev => ({
        ...prev,
        admin: {
          ...prev.admin,
          specialization: adminEdit.specialization,
          degree:         adminEdit.degree,
          licenseNo:      adminEdit.licenseNo,
        },
      }));
      setHospitalMessage({ type: 'success', text: 'Clinical credentials updated.' });
    } catch (err) {
      setHospitalMessage({ type: 'error', text: 'Failed to update credentials. Please retry.' });
      console.error('[ADMIN] clinical credentials update failed', err);
    } finally {
      setSavingAdmin(false);
    }
  };

  // --- API FETCHING ---
  // Warm the personnel snapshot; the staff list renders from watchPersonnel
  // below, so a staff change appears here on its own. Offline keeps the snapshot.
  const fetchPersonnel = useCallback(async () => {
    try {
      setPersonnelLoading(true);
      const res = await apiClient.get('/personnel');
      await snapshotPersonnel(res.data);
    } catch (err) {
      console.error('Personnel refresh failed — keeping offline snapshot.', err);
    } finally {
      setPersonnelLoading(false);
    }
  }, []);

  // Reactive reference data — staff list and price registry render from the
  // local cache (refreshed every sync cycle), so changes here or on another
  // device appear on their own with no manual refresh.
  useEffect(() => {
    const subPrices = watchServiceCharges().subscribe({
      next: (rows) => setServicePrices(Array.isArray(rows) ? rows : []),
      error: (err) => console.warn('[AdminBoard] service-charges liveQuery error', err),
    });
    const subPersonnel = watchPersonnel().subscribe({
      next: (rows) => setPersonnel((rows || []).map(p => ({
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
      }))),
      error: (err) => console.warn('[AdminBoard] personnel liveQuery error', err),
    });
    return () => { subPrices.unsubscribe(); subPersonnel.unsubscribe(); };
  }, []);

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
        userId:         adminRaw.userId         || adminRaw.UserId         || null,
        fullName:       adminRaw.fullName       || adminRaw.FullName       || '—',
        email:          adminRaw.email          || adminRaw.Email          || '—',
        mobile:         adminRaw.mobile         || adminRaw.Mobile         || '—',
        role:           adminRaw.role           || adminRaw.Role           || 'Staff',
        status:         adminRaw.status         || adminRaw.Status         || 'Unknown',
        registeredOn:   adminRaw.registeredOn   || adminRaw.RegisteredOn   || '',
        specialization: adminRaw.specialization || adminRaw.Specialization || '',
        degree:         adminRaw.degree         || adminRaw.Degree         || '',
        licenseNo:      adminRaw.licenseNo      || adminRaw.LicenseNo      || '',
      } : null;

      const data = {
        hospitalName:        r.hospitalName        || r.HospitalName        || r.name || r.Name || '',
        hospitalAddress:     r.hospitalAddress     || r.HospitalAddress     || r.address || r.Address || '',
        gstin:               r.gstin               || r.GSTIN               || '',
        registrationNumber:  r.registrationNumber  || r.RegistrationNumber  || '',
        pan:                 r.pan                 || r.PAN                 || '',
        nabhNumber:          r.nabhNumber          || r.NABHNumber          || '',
        publicContact:       r.publicContact       || '',
        publicEmail:         r.publicEmail         || '',
        isAutoBillingEnabled: r.isAutoBillingEnabled || r.IsAutoBillingEnabled || false,
        // Nullable: a centre with no pin set yet has neither field, and 0 is
        // a valid coordinate (equator/prime meridian) so this can't use `||`.
        latitude:  r.latitude  ?? r.Latitude  ?? null,
        longitude: r.longitude ?? r.Longitude ?? null,
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

  // The Overview's referral card. It reads the SUMMARY (one row per source, every total, no visit rows) -
  // it used to pull every visit of every partner just to add up money. A server without the summary route
  // (404) answers the full endpoint, which has the same fields plus rows.
  const fetchReferralIntelligence = useCallback(async (startDate = null, endDate = null, allTime = false) => {
    try {
      const params = allTime ? {} : { startDate, endDate };
      const res = await apiClient.get('/referrers/intelligence/summary', { params })
        .catch(err => (err?.response?.status === 404 ? apiClient.get('/referrers/intelligence', { params }) : Promise.reject(err)));
      setReferralIntelligence(res.data);
    } catch (err) {
      // Live only. The old fallback re-read a cache keyed by the (usually null) arguments rather than
      // the range on screen, so a failed request quietly showed some EARLIER range's numbers as current.
      // The last successfully loaded data stays on screen and the failure is said out loud.
      console.error('[REFERRAL INTEL] Live fetch failed', err);
      notifyToast(!err?.response ? 'Cannot reach the server — the referral figures shown may be out of date.' : 'Could not load live referral data — the figures shown may be out of date.', 'error');
    }
  }, []);

  // --- DOMAIN SYNCHRONIZATION ---
  
  // Personnel & Prescription
  useEffect(() => {
    if (activeTab === 'Staff') {
      fetchPersonnel();
    }
  }, [activeTab, fetchPersonnel]);

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
    // financeRev: re-run when the cached finance data changes so the matrix
    // refreshes itself after a payment/invoice lands (own action or synced in).
  }, [activeTab, financeRev, fetchServicePrices, fetchFinancialMatrix, fetchExpenses]);

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
    // financeRev: auto-refresh the overview analytics when finance data changes.
  }, [activeTab, overviewTimeframe, financeRev, fetchStrategicOutlook, fetchFinancialMatrix, fetchReferralIntelligence]);




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

    // NOTE: we intentionally do NOT pre-queue on `!isOnline`. navigator.onLine
    // (the source of `isOnline`) is only advisory and has false negatives — it
    // reports "offline" on VPNs, captive portals, Electron, and right after a
    // network transition even when the API is reachable. Gating on it made
    // chain-create intermittently queue instead of run (the "intermittent
    // working" bug). Instead we always attempt the request and fall back to the
    // outbox ONLY on a genuine network error (no response) in the catch below.
    try {
      setIsDeployingChain(true);
      const res = await apiClient.post('/hospitals/chain', payload);
      
      if (res.data.success) {
        setIsChainDrawerOpen(false);
        setNewChainData({ chainName: '', hospitalName: '', hospitalAddress: '', modules: 'RIS,PACS' });

        // Use standard transition logic
        await handleSwitchNode(res.data.hospitalId);
      }
    } catch (err) {
      console.error('Chain Deployment Failure:', err);
      if (!err.response) {
        await addToOutbox('CHAIN_DEPLOY', payload);
        notifyToast({ title: 'Network error', message: 'Centre deployment queued in offline outbox.' }, 'warning');
        setIsChainDrawerOpen(false);
      } else {
        notifyToast(err.response?.data?.message || 'Centre expansion failed.', 'error');
      }
    } finally {
      setIsDeployingChain(false);
    }
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
      nabhNumber: hospitalData.nabhNumber,
      publicContact: hospitalData.publicContact ?? null,
      publicEmail: hospitalData.publicEmail ?? null,
      latitude: hospitalData.latitude,
      longitude: hospitalData.longitude
    };

    if (!isOnline) {
      await addToOutbox('HOSPITAL_UPDATE', { id: targetHubId, ...payload });
      notifyToast({ title: 'Queued for sync', message: 'Centre metadata will sync when connection is restored.' }, 'info');
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
        notifyToast({ title: 'Network error', message: 'Centre configuration queued in offline outbox.' }, 'warning');
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

    // Review B9: only the flag goes to its own endpoint, so a half-loaded form can't
    // blank the centre's GSTIN/PAN/address.
    const outboxItem = { id: targetHubId, enabled: newAutoBill };

    if (!isOnline) {
      await addToOutbox('HOSPITAL_AUTOBILL', outboxItem);
      notifyToast({ title: 'Queued for sync', message: `Auto-billing ${newAutoBill ? 'enabled' : 'disabled'} — will sync when connection is restored.` }, 'info');
      setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      return;
    }

    try {
      await apiClient.put(`/hospitals/${targetHubId}/auto-billing`, { enabled: newAutoBill });
      setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      setHospitalData(prev => ({ ...prev, isAutoBillingEnabled: newAutoBill }));
      await refreshCenters();
    } catch (err) {
      console.error('[FINANCE] Protocol update failed', err);
      if (!err.response) {
        await addToOutbox('HOSPITAL_AUTOBILL', outboxItem);
        notifyToast({ title: 'Network error', message: 'Billing setting queued in offline outbox.' }, 'warning');
        setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      } else {
        notifyToast('Failed to save billing settings. Please check your connection.', 'error');
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
            publicContact: res.data.publicContact || '',
            publicEmail: res.data.publicEmail || '',
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

  const referralAggregated = useMemo(() => {
    // Partners only: Self / Walk-in, unlinked names and unattributed visits are not referral partners
    // (an older API without sourceKind keeps every row, as before).
    const isPartner = (ref) => (ref.sourceKind ? ref.sourceKind === 'PARTNER' : true);
    // What is still owed, by scan type. The server sums it from the commission rows; only an older API
    // lacks it, and then it is rebuilt from the visit rows that API returns.
    const owedFromVisits = (patients) => (patients || []).reduce((acc, p) => {
      const owed = Number(p.unpaidAmount ?? (p.commissionStatus?.toLowerCase() === 'unpaid' ? p.commissionAmount : 0)) || 0;
      if (owed !== 0) acc[p.modality] = (acc[p.modality] || 0) + owed;
      return acc;
    }, {});
    return (referralIntelligence || [])
      .filter(isPartner)
      .map(ref => ({
        referrerId: ref.referrerId,
        name: ref.name,
        totalPatients: ref.totalPatients ?? (ref.patients || []).length,
        totalCommission: ref.totalCommission || 0,
        paidCommission: ref.paidCommission || 0,
        unpaidCommission: ref.unpaidCommission || 0,
        totalRevenue: ref.totalRevenue || 0,
        unpaidByModality: ref.unpaidByModality || owedFromVisits(ref.patients),
      }))
      .sort((a, b) => (b.totalPatients - a.totalPatients) || String(a.name || '').localeCompare(String(b.name || '')));
  }, [referralIntelligence]);

  const handleDeleteUser = async (id) => {
    if (id === currentUser.id) {
      notifyToast({ title: 'Action blocked', message: "You cannot remove your own account from this centre — it would lock you out." }, 'warning');
      return;
    }
    // Now handled by modal confirmation without window.confirm check:
    {
      if (!isOnline) {
        await addToOutbox('PERSONNEL_DELETE', { id });
        notifyToast({ title: 'Queued for sync', message: 'Personnel removal will sync when connection is restored.' }, 'info');
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
          notifyToast({ title: 'Network error', message: 'Personnel removal queued in offline outbox.' }, 'warning');
          setPersonnel(prev => prev.filter(u => u.id !== id)); // Optimistic UI
        } else {
          notifyToast(err.response?.data?.message || 'Failed to remove personnel.', 'error');
        }
      }
    }
  };

  const handleCopyCredentials = (user) => {
    const text = `1Rad Flow Clinical Hub Access\nLogin ID: ${user.email}\nSecurity Key: ${user.password || '[Hidden]'}\nHub URL: ${window.location.origin}`;
    navigator.clipboard.writeText(text);
    setCopyFeedback(user.id);
    setTimeout(() => setCopyFeedback(''), 3000);
  };

  const handleWhatsAppShare = (user) => {
    const message = `Hello ${user.name},\n\nYour 1Rad Flow Clinical Hub credentials have been initialized.\n\n🌐 Hub URL: ${window.location.origin}\n🔑 Login ID: ${user.email}\n🛡️ Security Key: ${user.password || '[Please use the reset link if unknown]'}\n\nPlease maintain strict confidentiality of these credentials.`;
    const encoded = encodeURIComponent(message);
    const mobile = user.mobile?.replace(/\D/g, ''); // Ensure only numbers
    const finalMobile = mobile?.length === 10 ? `91${mobile}` : mobile; // Default to India if 10 digits
    window.open(`https://wa.me/${finalMobile}?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  const handleOpenUserDrawer = (user = null) => {
    setEditUser(user ? { ...user, roles: user.roles || [] } : {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      // Cloud PACS-only centres onboard everyone as a single full-access role —
      // no role picker (see the form below). RIS / RIS+PACS pick roles as usual.
      roles: isPacsOnly ? [PACS_ONBOARD_ROLE] : [],
      status: 'active',
      specialization: '',
      degree: '',
      licenseNo: '',
      mobile: ''
    });
    setUserRegStep(1);
    setUserSaveError('');
    setIsUserDrawerOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setUserSaveError(''); // clear any prior failure

    const isDoctorRole = editUser.roles.some(r => r.toLowerCase().includes('doctor'));
    
    // Surcharge check for NEW doctors — a RIS per-doctor-seat billing concept.
    // It doesn't apply to Cloud PACS-only centres (everyone is onboarded with the
    // single full-access role), so skip the prompt there.
    if (!editUser.id && isDoctorRole && !isPacsOnly) {
      const confirmSurcharge = window.confirm(
        "PROTOCOL ALERT: Adding a new doctor seat will increase your monthly subscription overhead by ₹1,000.\n\nDo you want to authorize this expansion?"
      );
      if (!confirmSurcharge) return;
    }

    if (!editUser.roles || editUser.roles.length === 0) {
      notifyToast('At least one clinical or administrative role must be assigned.', 'error');
      return;
    }

    // Same-centre duplicate guard (instant feedback; the backend enforces it
    // authoritatively too). Only for a NEW staff member — an edit keeps its own
    // identity. We don't OTP-verify emails, so we check this centre's roster.
    if (!editUser.id) {
      const email = String(editUser.email || '').trim().toLowerCase();
      const mobileDigits = String(editUser.mobile || '').replace(/\D/g, '');
      const clash = (personnel || []).find(p =>
        (email && String(p.email || '').trim().toLowerCase() === email) ||
        (mobileDigits && String(p.mobile || '').replace(/\D/g, '') === mobileDigits)
      );
      if (clash) {
        const msg = `“${(clash.name || 'A staff member').toUpperCase()}” already uses this email or mobile at this centre. Open their profile to edit it instead of adding them again.`;
        setUserSaveError(msg);
        notifyToast(msg, 'error');
        return;
      }
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
      notifyToast({ title: 'Queued for sync', message: `Personnel ${editUser.id ? 'update' : 'registration'} will sync when connection is restored.` }, 'info');
      setIsUserDrawerOpen(false);
      return;
    }

    const staffName = (editUser.name || 'Staff member').toUpperCase();
    try {
      if (editUser.id) {
        await apiClient.put(`/personnel/${editUser.id}`, payload);
        notifyToast(`“${staffName}” profile updated successfully.`, 'success');
      } else {
        await apiClient.post('/personnel', payload);
        notifyToast(`“${staffName}” onboarded successfully.`, 'success');
      }

      setUserSaveError('');
      setIsUserDrawerOpen(false);
      fetchPersonnel();
    } catch (err) {
      console.error('[PERSONNEL] Save failed', err);
      if (!err.response) {
        const type = editUser.id ? 'PERSONNEL_UPDATE' : 'PERSONNEL_CREATE';
        await addToOutbox(type, { id: editUser.id, ...payload });
        notifyToast({ title: 'Network error', message: 'Staff record queued in offline outbox.' }, 'warning');
        setIsUserDrawerOpen(false);
      } else {
        // Surface the server's reason BOTH as a toast and inline in the drawer
        // (the drawer stays open, so an inline banner can't be missed) — e.g. the
        // duplicate email/mobile guard.
        const msg = err.response?.data?.message || 'Failed to save staff record.';
        setUserSaveError(msg);
        notifyToast(msg, 'error');
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
                    <td><span className="file-badge" style={{ padding: '4px 8px' }}>{formatPatientAge(p.age)} / {p.gender}</span></td>
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

      // Don't pre-queue on `!isOnline` — navigator.onLine is advisory and has
      // false negatives, which made "add service" intermittently queue instead
      // of save (the "intermittent working" bug). Always attempt the request;
      // the catch falls back to the outbox only on a real network error.
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
        notifyToast({ title: 'Network error', message: 'Price update queued in offline outbox.' }, 'warning');
        setIsPriceDrawerOpen(false);
      } else {
        // Server rejected the save (validation/permission/etc.). Surface it —
        // previously this branch was silent, so a failed save looked like
        // nothing happened.
        notifyToast({ title: 'Save failed', message: err.response?.data?.message || err.response?.data?.error || 'Could not save the service. Please try again.' }, 'error');
      }
    }
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    const payload = editExpense;

    if (!isOnline) {
      await addToOutbox(payload.id ? 'EXPENSE_UPDATE' : 'EXPENSE', payload);
      notifyToast({ title: 'Queued for sync', message: 'Expense entry will sync when connection is restored.' }, 'info');
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
        await addToOutbox(payload.id ? 'EXPENSE_UPDATE' : 'EXPENSE', payload);
        notifyToast({ title: 'Network error', message: 'Expense queued in offline outbox.' }, 'warning');
        setIsExpenseDrawerOpen(false);
      } else {
        notifyToast('Failed to save expense.', 'error');
      }
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Are you sure you want to delete this operational expense?')) return;
    
    if (!isOnline) {
      await addToOutbox('EXPENSE_DELETE', { id });
      notifyToast({ title: 'Queued for sync', message: 'Expense deletion will sync when connection is restored.' }, 'info');
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
        notifyToast({ title: 'Network error', message: 'Deletion queued in offline outbox.' }, 'warning');
        setExpenses(prev => prev.filter(e => e.id !== id)); // Optimistic UI
      } else {
        notifyToast('Could not delete expense.', 'error');
      }
    }
  };

  const handleDeletePrice = async (id) => {
    if (window.confirm('Are you sure you want to delete this service charge?')) {
      if (!isOnline) {
        await addToOutbox('PRICE_DELETE', { id });
        notifyToast({ title: 'Queued for sync', message: 'Service charge deletion will sync when connection is restored.' }, 'info');
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
          notifyToast({ title: 'Network error', message: 'Deletion queued in offline outbox.' }, 'warning');
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

          {/* ── Two-column layout: Hospital info ◀▶ Administrator info ──
               Side-by-side on desktop (≥900 px), stacks to single column on
               narrower viewports. The admin card has 1 inner column on the
               right rail to keep field labels readable. */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: '20px',
            alignItems: 'start',
          }}>
            {/* ── LEFT: Hospital details ──────────────────────────── */}
            <div style={{ background: 'white', padding: '28px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '16px' }}>
                Hospital Information
              </div>

              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Hospital Name</div>
                <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1.2 }}>{hospitalData.hospitalName || 'Unnamed Hospital'}</h3>
                <div style={{ fontSize: '13px', color: '#475569', marginTop: '6px' }}>{hospitalData.hospitalAddress || 'No address provided'}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                {[
                  { label: 'GSTIN', value: hospitalData.gstin },
                  { label: 'Registration Number', value: hospitalData.registrationNumber },
                  { label: 'PAN', value: hospitalData.pan },
                  { label: 'Accreditation (NABH)', value: hospitalData.nabhNumber },
                  { label: 'Contact for referrers', value: [hospitalData.publicContact, hospitalData.publicEmail].filter(Boolean).join(' · ') }
                ].map(item => (
                  <div key={item.label} style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>{item.label}</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', wordBreak: 'break-all' }}>{item.value || 'Not provided'}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── RIGHT: Administrator info ───────────────────────── */}
            {hospitalData.admin ? (
              <div style={{ background: 'white', padding: '28px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.02)' }}>
                <div style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  marginBottom: '20px',
                }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>
                      Administrator
                    </div>
                    <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1.2 }}>
                      {hospitalData.admin.fullName}
                    </h3>
                  </div>
                  <span style={{
                    fontSize: '10px', fontWeight: 700,
                    color: hospitalData.admin.status?.toLowerCase() === 'active' ? '#16a34a' : '#dc2626',
                    background: hospitalData.admin.status?.toLowerCase() === 'active' ? '#dcfce7' : '#fee2e2',
                    padding: '4px 10px', borderRadius: '999px',
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {hospitalData.admin.status}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                  {[
                    { label: 'Email',          value: hospitalData.admin.email },
                    { label: 'Mobile',         value: hospitalData.admin.mobile },
                    { label: 'Role',           value: hospitalData.admin.role },
                    { label: 'Registered',     value: hospitalData.admin.registeredOn },
                    { label: 'Specialization', value: hospitalData.admin.specialization },
                    { label: 'Degree',         value: hospitalData.admin.degree },
                    { label: 'License Number', value: hospitalData.admin.licenseNo },
                  ].map(item => (
                    <div key={item.label} style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>{item.label}</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', wordBreak: 'break-all', lineHeight: 1.35 }}>{item.value || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{
                background: '#fffbeb', padding: '24px', borderRadius: '16px',
                border: '1px solid #fde68a',
                display: 'flex', alignItems: 'center', gap: '14px',
                minHeight: '120px',
              }}>
                <span style={{ fontSize: '24px' }}>⚠️</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>
                    No administrator assigned
                  </div>
                  <div style={{ fontSize: '12px', color: '#a16207' }}>
                    This hospital doesn't have a primary admin user mapped yet.
                  </div>
                </div>
              </div>
            )}
          </div>
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
           {/* Administrator block — account fields read-only (email/mobile/
               role change via Personnel), clinical credentials editable
               inline (specialization / degree / license number). */}
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

               {/* Read-only account fields */}
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '12px', marginBottom: '14px' }}>
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

               {/* Editable clinical credentials */}
               <div style={{ borderTop: '1px dashed #bfdbfe', paddingTop: '12px' }}>
                 <div style={{ fontSize: '10px', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>
                   Clinical Credentials
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <div>
                     <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '3px' }}>Specialization</label>
                     <input
                       type="text"
                       value={adminEdit.specialization}
                       onChange={e => setAdminEdit({ ...adminEdit, specialization: e.target.value })}
                       placeholder="e.g. Radiology, Cardiology"
                       style={{ width: '100%', padding: '8px 11px', borderRadius: '7px', border: '1px solid rgba(59,130,246,0.25)', background: 'rgba(255,255,255,0.85)', fontSize: '12.5px', fontWeight: 600, color: '#0f172a', outline: 'none', boxSizing: 'border-box' }}
                       onFocus={e => e.target.style.borderColor = '#3b82f6'}
                       onBlur={e => e.target.style.borderColor = 'rgba(59,130,246,0.25)'}
                     />
                   </div>
                   <div>
                     <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '3px' }}>Degree</label>
                     <input
                       type="text"
                       value={adminEdit.degree}
                       onChange={e => setAdminEdit({ ...adminEdit, degree: e.target.value })}
                       placeholder="e.g. MBBS, MD"
                       style={{ width: '100%', padding: '8px 11px', borderRadius: '7px', border: '1px solid rgba(59,130,246,0.25)', background: 'rgba(255,255,255,0.85)', fontSize: '12.5px', fontWeight: 600, color: '#0f172a', outline: 'none', boxSizing: 'border-box' }}
                       onFocus={e => e.target.style.borderColor = '#3b82f6'}
                       onBlur={e => e.target.style.borderColor = 'rgba(59,130,246,0.25)'}
                     />
                   </div>
                   <div>
                     <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '3px' }}>License / Registration Number</label>
                     <input
                       type="text"
                       value={adminEdit.licenseNo}
                       onChange={e => setAdminEdit({ ...adminEdit, licenseNo: e.target.value })}
                       placeholder="e.g. MMC/12345"
                       style={{ width: '100%', padding: '8px 11px', borderRadius: '7px', border: '1px solid rgba(59,130,246,0.25)', background: 'rgba(255,255,255,0.85)', fontSize: '12.5px', fontWeight: 600, color: '#0f172a', outline: 'none', boxSizing: 'border-box' }}
                       onFocus={e => e.target.style.borderColor = '#3b82f6'}
                       onBlur={e => e.target.style.borderColor = 'rgba(59,130,246,0.25)'}
                     />
                   </div>
                   <button
                     type="button"
                     onClick={handleSaveAdminCredentials}
                     disabled={savingAdmin}
                     style={{
                       alignSelf: 'flex-end',
                       background: savingAdmin ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                       color: 'white', border: 'none',
                       padding: '8px 16px', borderRadius: '8px',
                       fontSize: '11px', fontWeight: 800,
                       letterSpacing: '0.4px',
                       cursor: savingAdmin ? 'not-allowed' : 'pointer',
                       boxShadow: '0 4px 10px -3px rgba(59,130,246,0.4)',
                       fontFamily: 'inherit',
                     }}
                   >
                     {savingAdmin ? 'Saving…' : 'Save credentials'}
                   </button>
                 </div>
                 <div style={{ fontSize: '11px', color: '#64748b', marginTop: '10px', fontStyle: 'italic' }}>
                   Email, mobile, and role are managed from the Personnel screen.
                 </div>
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

              <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '7px' }}>Location</label>
                  <Suspense fallback={null}>
                    <HospitalLocationPicker
                        latitude={hospitalData.latitude}
                        longitude={hospitalData.longitude}
                        onChange={(lat, lng) => setHospitalData(prev => ({ ...prev, latitude: lat, longitude: lng }))}
                    />
                  </Suspense>
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
                    {/* Review R9: what the referral portal shows doctors and agents — the
                        centre's own number, not an admin's personal one. */}
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Phone shown to referrers</label>
                        <input type="tel" value={hospitalData.publicContact || ''} onChange={e => setHospitalData({...hospitalData, publicContact: e.target.value})} placeholder="Front-desk number" style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Email shown to referrers</label>
                        <input type="email" value={hospitalData.publicEmail || ''} onChange={e => setHospitalData({...hospitalData, publicEmail: e.target.value})} placeholder="desk@centre.in" style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
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


  // Overview (rebuilt Nov 2026): plain words, real numbers only — see OverviewDashboard.
  const renderAnalytics = () => {
    if (loadingOutlook && !outlookData) {
      return (
        <div style={{ padding: '120px 20px', textAlign: 'center' }}>
          <div className="pulse-loader" style={{ margin: '0 auto' }}></div>
          <div style={{ marginTop: '20px', fontSize: '14px', fontWeight: 600, color: '#3730A3' }}>Loading overview…</div>
        </div>
      );
    }
    if (!outlookData) {
      return (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#4B5563', fontSize: '15px' }}>
          The overview could not be loaded. Check the connection and press Refresh.
        </div>
      );
    }
    return (
      <OverviewDashboard
        outlook={outlookData}
        matrix={financialMatrix}
        partners={referralAggregated}
        timeframe={overviewTimeframe}
        onTimeframe={setOverviewTimeframe}
        loading={loadingOutlook}
        centreName={activeCenter?.name}
      />
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
                        {getRoleLabel(userRole, activeCenter?.id)?.toUpperCase()}
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
            <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 700, color: '#0a1628', letterSpacing: '-0.5px', margin: 0 }}>Dashboard</h1>
            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 400, letterSpacing: '0' }}>Your centre's numbers, staff and settings</span>
          </div>
        </div>

        {/* Right-aligned action area. The hospital switcher used to live
            here, but it's now in the global TopNav so it's reachable from
            every page. All that remains is the premium "Register new
            chain" CTA. */}
        <div style={{
          display: 'flex',
          justifyContent: isMobile ? 'stretch' : 'flex-end',
          width: isMobile ? '100%' : 'auto',
        }}>
          <button
            type="button"
            onClick={() => setIsChainDrawerOpen(true)}
            className="register-chain-cta"
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              padding: '13px 22px 13px 18px',
              borderRadius: '14px',
              border: '1px solid rgba(255,255,255,0.15)',
              background:
                'linear-gradient(135deg, #1e40af 0%, #1d4ed8 45%, #0b1a3a 100%)',
              color: 'white',
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.6px',
              cursor: 'pointer',
              boxShadow:
                '0 14px 32px -10px rgba(29, 78, 216, 0.55), ' +
                '0 0 0 1px rgba(255,255,255,0.04), ' +
                'inset 0 1px 0 rgba(255,255,255,0.18)',
              fontFamily: 'inherit',
              transition: 'transform 0.18s ease, box-shadow 0.18s ease',
              width: isMobile ? '100%' : 'auto',
              justifyContent: 'center',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow =
                '0 20px 40px -10px rgba(29, 78, 216, 0.65), ' +
                '0 0 0 1px rgba(255,255,255,0.05), ' +
                'inset 0 1px 0 rgba(255,255,255,0.22)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow =
                '0 14px 32px -10px rgba(29, 78, 216, 0.55), ' +
                '0 0 0 1px rgba(255,255,255,0.04), ' +
                'inset 0 1px 0 rgba(255,255,255,0.18)';
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '9px',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))',
                border: '1px solid rgba(255,255,255,0.20)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
              <span style={{
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '2px',
                color: 'rgba(255,255,255,0.65)',
                textTransform: 'uppercase',
              }}>Expand network</span>
              <span style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '0.4px' }}>
                Register new chain
              </span>
            </span>
            <span
              aria-hidden="true"
              style={{
                marginLeft: '4px',
                fontSize: '13px',
                color: 'rgba(255,255,255,0.75)',
              }}
            >→</span>
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
        {visibleTabs.map(tab => (
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
            {tab === 'Letterhead' ? 'Report paper' : tab}
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
      {activeTab === 'Tax & billing' && (
        <TaxBillingSettings hospitalId={activeCenter?.id} isOnline={isOnline} isMobile={isMobile} />
      )}
      {activeTab === 'Letterhead' && <ReportPaperSettings currentUser={currentUser} />}
      {activeTab === 'AI & privacy' && <AiPrivacySettings />}
      

      {isHospitalDrawerOpen && renderHospitalSettingsDrawer()}
      {isChainDrawerOpen && renderChainDrawer()}

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
                           <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '12px' }}>{isPacsOnly ? 'Access' : (<>Assigned Roles <span style={{ color: '#ef4444' }}>*</span></>)}</label>

                           {isPacsOnly ? (
                             <div style={{ padding: '14px 16px', borderRadius: '16px', border: '1px solid #bfdbfe', background: '#eff6ff', fontSize: '12px', color: '#1e3a8a', lineHeight: 1.6, fontWeight: 600 }}>
                               Added as a <strong>Cloud PACS user</strong> with full access — studies, the DICOM bridge, configuration, and user &amp; letterhead management. Individual roles aren&apos;t assigned on Cloud PACS.
                             </div>
                           ) : (
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
                           )}
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

                      {userSaveError && (
                        <div style={{ margin: '0 24px', padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                          <span style={{ flexShrink: 0, fontSize: '14px' }}>⚠️</span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#b91c1c', lineHeight: 1.45 }}>{userSaveError}</span>
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
    const fieldLabel = {
      display: 'block',
      fontSize: '12px',
      fontWeight: 700,
      color: '#0f172a',
      marginBottom: '6px',
      letterSpacing: '0.1px',
    };
    const fieldHelp = {
      fontSize: '11px',
      fontWeight: 500,
      color: '#64748b',
      marginBottom: '10px',
      lineHeight: 1.45,
    };
    const fieldInput = {
      width: '100%',
      padding: '13px 14px',
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      background: '#fff',
      fontSize: '13px',
      fontWeight: 500,
      color: '#0f172a',
      outline: 'none',
      fontFamily: 'inherit',
      transition: 'border-color 0.18s, box-shadow 0.18s',
      boxSizing: 'border-box',
    };
    const focusOn  = (e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 4px rgba(59,130,246,0.12)'; };
    const focusOff = (e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; };

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chain-title"
        onClick={() => setIsChainDrawerOpen(false)}
        style={{
          position: 'fixed', inset: 0,
          background: 'radial-gradient(ellipse at right, rgba(15,23,42,0.55) 0%, rgba(15,23,42,0.70) 100%)',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          zIndex: 10000,
          animation: 'chainFade 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', right: 0, top: 0,
            height: '100%',
            width: isMobile ? '100%' : '480px',
            background: '#f8fafc',
            display: 'flex', flexDirection: 'column',
            boxShadow: '-24px 0 60px rgba(15, 23, 42, 0.25)',
            animation: 'chainSlide 320ms cubic-bezier(0.32, 0.72, 0.36, 1)',
            fontFamily: 'inherit',
          }}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <div style={{
            position: 'relative',
            padding: '32px 32px 28px',
            background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 50%, #0b1a3a 100%)',
            color: 'white',
            overflow: 'hidden',
          }}>
            {/* decorative glow */}
            <div aria-hidden="true" style={{
              position: 'absolute', top: '-60px', right: '-40px',
              width: '220px', height: '220px', borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(96,165,250,0.35) 0%, rgba(96,165,250,0) 70%)',
              pointerEvents: 'none',
            }} />

            <button
              type="button"
              aria-label="Close"
              onClick={() => setIsChainDrawerOpen(false)}
              style={{
                position: 'absolute', top: '20px', right: '20px',
                width: '32px', height: '32px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.16)',
                color: 'rgba(255,255,255,0.85)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '15px',
              }}
            >×</button>

            <div style={{
              width: '52px', height: '52px', borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))',
              border: '1px solid rgba(255,255,255,0.20)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '18px',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18" />
                <path d="M5 21V7l7-4 7 4v14" />
                <path d="M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
              </svg>
            </div>

            <div id="new-chain-title" style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.4px', marginBottom: '6px' }}>
              Add a new centre
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.78)', margin: 0, lineHeight: 1.55, maxWidth: '360px' }}>
              Open a new location under your group. We'll set it up and link it to your account in one step.
            </p>
          </div>

          {/* ── Form body ──────────────────────────────────────────── */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '28px 32px 24px',
          }}>
            <form id="new-chain-form" onSubmit={handleDeployChain} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

              <div>
                <label style={fieldLabel} htmlFor="chainName">
                  Group or chain name <span style={{ fontWeight: 500, color: '#94a3b8' }}>(optional)</span>
                </label>
                <p style={fieldHelp}>If this centre is part of a group of centres, type the group name. Leave blank for a standalone centre.</p>
                <input
                  id="chainName"
                  type="text"
                  value={newChainData.chainName}
                  onChange={e => setNewChainData({ ...newChainData, chainName: e.target.value })}
                  placeholder="e.g. Sunrise Diagnostics Group"
                  style={fieldInput}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div>
                <label style={fieldLabel} htmlFor="hospitalName">Centre name</label>
                <p style={fieldHelp}>This is what patients and staff will see on bills, reports, and the worklist.</p>
                <input
                  id="hospitalName"
                  type="text"
                  required
                  value={newChainData.hospitalName}
                  onChange={e => setNewChainData({ ...newChainData, hospitalName: e.target.value })}
                  placeholder="e.g. City Diagnostic Centre"
                  style={fieldInput}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div>
                <label style={fieldLabel} htmlFor="hospitalAddress">Centre address</label>
                <p style={fieldHelp}>Full address — building, street, city, PIN. Used on letterheads and invoices.</p>
                <textarea
                  id="hospitalAddress"
                  required
                  rows={3}
                  value={newChainData.hospitalAddress}
                  onChange={e => setNewChainData({ ...newChainData, hospitalAddress: e.target.value })}
                  placeholder="123 Main Road, Sector 5, City, 400001"
                  style={{ ...fieldInput, resize: 'none', lineHeight: 1.55 }}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              {/* ── Subscription / product package (SKU) for this NEW centre ──
                  Modules are per-centre, so each centre in a chain can run a
                  different plan. Drives HospitalSubscription.Modules on the new
                  centre's 14-day trial. */}
              <div>
                <label style={fieldLabel}>Subscription plan</label>
                <p style={fieldHelp}>What should this centre be able to do? You can change it later from Subscription. Starts on a 14-day free trial.</p>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {[
                    { id: 'RIS,PACS', title: 'RIS + Cloud PACS', desc: 'Everything — appointments, billing, imaging upload, DICOM viewer & reporting.' },
                    { id: 'RIS',      title: 'RIS only',         desc: 'Clinic workflow + reporting. Attach PDF/JPG to visits; no DICOM upload/viewer.' },
                    { id: 'PACS',     title: 'Cloud PACS only',  desc: 'Teleradiology — study ingestion, DICOM viewer & reporting. No clinic/billing.' },
                  ].map(opt => {
                    const selected = newChainData.modules === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => setNewChainData({ ...newChainData, modules: opt.id })}
                        style={{
                          padding: '13px 15px', borderRadius: '12px', cursor: 'pointer',
                          border: selected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                          background: selected ? '#eff6ff' : '#fff',
                          display: 'flex', alignItems: 'flex-start', gap: '11px',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{
                          width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, marginTop: '1px',
                          border: selected ? '5px solid #2563eb' : '2px solid #cbd5e1',
                          background: '#fff', transition: 'all 0.15s',
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: selected ? '#1d4ed8' : '#1e293b' }}>{opt.title}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', lineHeight: 1.5 }}>{opt.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{
                marginTop: '4px',
                padding: '14px 16px',
                borderRadius: '12px',
                background: '#eff6ff',
                border: '1px solid #dbeafe',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: '16px', lineHeight: 1, marginTop: '1px' }}>💡</span>
                <div style={{ fontSize: '12px', color: '#1e3a8a', lineHeight: 1.55 }}>
                  After you create the centre, you'll be switched to it automatically. You can add staff, prices, and letterhead from the Admin Panel.
                </div>
              </div>
            </form>
          </div>

          {/* ── Sticky footer ──────────────────────────────────────── */}
          <div style={{
            padding: '18px 32px 22px',
            background: '#fff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            gap: '12px',
          }}>
            <button
              type="button"
              onClick={() => setIsChainDrawerOpen(false)}
              style={{
                flex: 1,
                padding: '14px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                background: '#fff',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="new-chain-form"
              disabled={isDeployingChain}
              style={{
                flex: 2,
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                background: isDeployingChain
                  ? 'linear-gradient(135deg, #93c5fd 0%, #60a5fa 100%)'
                  : 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 800,
                letterSpacing: '0.3px',
                cursor: isDeployingChain ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 12px 24px -8px rgba(29, 78, 216, 0.55), inset 0 1px 0 rgba(255,255,255,0.20)',
                transition: 'transform 0.15s, box-shadow 0.15s',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
              onMouseEnter={e => {
                if (isDeployingChain) return;
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 16px 30px -8px rgba(29, 78, 216, 0.65), inset 0 1px 0 rgba(255,255,255,0.25)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 12px 24px -8px rgba(29, 78, 216, 0.55), inset 0 1px 0 rgba(255,255,255,0.20)';
              }}
            >
              {isDeployingChain ? 'Creating…' : (<>Create centre <span aria-hidden="true">→</span></>)}
            </button>
          </div>

          <style>{`
            @keyframes chainFade { from { opacity: 0; } to { opacity: 1; } }
            @keyframes chainSlide {
              from { transform: translateX(40px); opacity: 0; }
              to   { transform: translateX(0);    opacity: 1; }
            }
          `}</style>
        </div>
      </div>
    );
  }


}
