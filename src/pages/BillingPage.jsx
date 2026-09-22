import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useAuth from '../auth/useAuth';
import apiClient from '../api/apiClient';
import useOffline from '../hooks/useOffline';
import { nativeStorage } from '../hooks/useElectron';
import { snapshotServiceCharges, watchServiceCharges } from '../db/repos/serviceChargesRepo';
import { snapshotPersonnel, watchPersonnel } from '../db/repos/personnelRepo';
import { matchesAnyModality } from '../utils/appointmentServices';
import { notifyToast } from '../utils/toast';
import '../styles/BillingPage.css';

// Extracted micro-hooks
import { useExpenseActions } from '../hooks/billing/useExpenseActions';
import { usePayoutActions }  from '../hooks/billing/usePayoutActions';
import { useInvoiceActions } from '../hooks/billing/useInvoiceActions';
import { useBillingData }    from '../hooks/billing/useBillingData';
import { useArchiveData } from '../hooks/billing/useArchiveData';

// Extracted pure utilities
import { printA4Invoice, printReceiptSlip, printThermalSlip, ghostPrint } from '../utils/billing/printHandlers';
import { exportToExcel } from '../utils/billing/exportHandler';

import { fetchFinancialMatrix, syncLegacyInvoices } from '../api/billing/reportingApi';
import { fetchRegistry as fetchRegistryApi } from '../api/billing/registryApi';
import { fetchInvoices as fetchInvoicesApi, fetchPendingBillables as fetchPendingBillablesApi } from '../api/billing/invoiceApi';
import { fetchExpenses as fetchExpensesApi } from '../api/billing/expenseApi';
import { fetchCommissions as fetchCommissionsApi } from '../api/billing/payoutApi';
import { fetchOutstandingCredits as fetchOutstandingCreditsApi } from '../api/billing/creditApi';
import { fetchAppointments as fetchAppointmentsApi } from '../api/appointments/appointmentApi';

// Modular Hub Components
import RevenueHub from '../components/Billing/RevenueHub';
import { fetchApprovalMap, approvalForInvoice } from '../utils/approvalLookup';
import { celebrate } from '../utils/celebrate';
import ExpenseLedger from '../components/Billing/ExpenseLedger';
import ReferralHub from '../components/Billing/ReferralHub';
import { useBillingNotice, BillingNoticeModal } from '../components/Billing/BillingNotice';
import AnalyticsHub from '../components/Billing/AnalyticsHub';
import FinanceManager from '../components/FinanceManager';
import Pagination from '../components/Pagination';
import PaymentSuccessModal from '../components/Billing/PaymentSuccessModal';

// Shared Drawers
import { 
  InvoiceDrawer, 
  NewInvoiceDrawer, 
  ExportDrawer, 
  ExpenseDrawer, 
  PayoutDrawer 
} from '../components/Billing/Drawers';

const getIstDateStr = (iso) => {
  if (!iso) return null;
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  const d = new Date(hasTz ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return null;
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
};

export default function BillingPage() {
  const { activeCenter } = useAuth();
  const { isOnline, addToOutbox, performSync, pendingCount } = useOffline();
  
  const TODAY = getIstDateStr(new Date().toISOString());

  // --- STATE ---
  const [paymentSuccess, setPaymentSuccess] = useState(null); // { amount, method, patientName, invoiceId }

  const [billingViewMode, setBillingViewMode] = useState('INVOICES'); // 'INVOICES', 'EXPENSES', 'FINANCE'
  // Patient advances (overpayment credits). Surfaced inline on each invoice
  // (status badge + the view drawer's refund button) instead of a separate tab.
  const [outstandingCredits, setOutstandingCredits] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [referrers, setReferrers] = useState([]);
  const [expenseFilter, setExpenseFilter] = useState('ALL'); // 'ALL' | 'OPERATIONAL' | 'REFERRAL'
  const [expenseSearch, setExpenseSearch] = useState('');
  const [isExpenseDrawerOpen, setIsExpenseDrawerOpen] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [editExpense, setEditExpense] = useState({ 
    status: 'Paid'
  });

  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isInvoiceDrawerOpen, setIsInvoiceDrawerOpen] = useState(false);
  const [isNewInvoiceDrawerOpen, setIsNewInvoiceDrawerOpen] = useState(false);
  
  // Patient Search State
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const [serviceRegistry, setServiceRegistry] = useState([]);
  const [pendingServices, setPendingServices] = useState([]);

  const [newInvoiceData, setNewInvoiceData] = useState({
    patientName: '',
    items: [{ description: '', amount: 0, quantity: 1 }],
    centreDiscount: 0,
    referrerDiscount: 0,
    paymentMethod: 'CASH',
    referrerId: ''
  });
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [searchTerm, setSearchTerm] = useState('');
  const [referralSearch, setReferralSearch] = useState('');

  // Unified notice/confirm modal — replaces window.alert / window.confirm.
  const { notify, confirm: confirmModal, modalProps: noticeProps } = useBillingNotice();
  const [timeFilter, setTimeFilter] = useState('TODAY'); // 'TODAY', 'PAST', 'ALL'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL', 'PAID', 'PENDING'
  // Admin-approval visibility: latest request per invoice/appointment + a filter.
  const [approvalMap, setApprovalMap] = useState({ byInvoice: {}, byAppointment: {}, rows: [] });
  const [approvalFilter, setApprovalFilter] = useState('ALL'); // 'ALL' | 'AWAITING'
  const loadApprovalMap = useCallback(async () => { setApprovalMap(await fetchApprovalMap()); }, []);
  const [modalityFilter, setModalityFilter] = useState('ALL'); // 'ALL', 'MRI', 'CT', 'X-RAY', etc.
  const [isExportDrawerOpen, setIsExportDrawerOpen] = useState(false);
  const [exportMode, setExportMode] = useState('ALL'); // 'ALL', 'RANGE'
  const [exportDates, setExportDates] = useState({ start: '', end: '' });
  
  // Referral Payout State
  const [isPayoutDrawerOpen, setIsPayoutDrawerOpen] = useState(false);
  const [isSavingPayout, setIsSavingPayout] = useState(false);
  const [editPayout, setEditPayout] = useState({ commissionId: '', referrerId: '', referrerName: '', amount: 0, modality: 'MRI', remarks: '', invoiceId: '', status: 'UNPAID' });
  const [referralCommissions, setReferralCommissions] = useState([]);
  const [referrerFilter, setReferrerFilter] = useState(['ALL']); // ['ALL'] or array of referrerIds
  const [appointments, setAppointments] = useState([]);

  // FinanceManager Specific State
  const [billingSettings, setBillingSettings] = useState({ autoBill: true, currency: '₹' });
  const [isPriceDrawerOpen, setIsPriceDrawerOpen] = useState(false);
  const [editPrice, setEditPrice] = useState({ modality: '', serviceName: '', amount: 0, referralCutType: 'PERCENTAGE', referralCutValue: 0, referralCutInput: 0 });


  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Invoices/Expenses/Referrers/ReferralCommissions are no longer offline
  // cached — every read hits the live API directly, scoped to the currently
  // selected date range (same TODAY/PAST/CUSTOM/ALL logic as fetchMatrix)
  // so a wide or historical range only pulls what's actually being viewed
  // instead of the whole hospital's history in one shot. Used both by the
  // direct fetchers below and by the archive/cursor-pagination hooks right
  // after this, so PAST/ALL get real bounds instead of an unbounded query.
  const getFinanceDateRange = useCallback(() => {
    const today = getIstDateStr(new Date().toISOString());
    let finalStart = null;
    let finalEnd = null;
    if (timeFilter === 'TODAY') {
      finalStart = today;
      finalEnd = today;
    } else if (timeFilter === 'PAST') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      finalEnd = getIstDateStr(yesterday.toISOString());
    } else if (timeFilter === 'CUSTOM') {
      finalStart = startDate;
      finalEnd = endDate;
    }
    return { finalStart, finalEnd };
  }, [timeFilter, startDate, endDate]);

  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'DESC' });
  const [currentPage, setCurrentPage] = useState(1);

  const handleSort = (key) => {
    let direction = 'ASC';
    if (sortConfig.key === key && sortConfig.direction === 'ASC') {
      direction = 'DESC';
    }
    setSortConfig({ key, direction });
  };

  // ── Pagination state (Client-side slicing) ─────────────────────────────────
  const [invoicePageSize, setInvoicePageSize] = useState(25);
  const [expensePageSize, setExpensePageSize] = useState(25);
  const [invoiceLoadingMore, setInvoiceLoadingMore] = useState(false);
  const [expenseLoadingMore, setExpenseLoadingMore] = useState(false);

  const resetInvoicePage = useCallback(() => setInvoicePageSize(25), []);
  const resetExpensePage = useCallback(() => setExpensePageSize(25), []);

  // ── Archive Mode (Server-side Pagination) ─────────────────────────────────
  // Any range other than TODAY routes the row-level table through real
  // cursor pagination instead of a flat fetch — a single unpaginated GET
  // caps at 200 rows server-side (see GetInvoicesQuery's takeCount), which
  // would silently truncate a busy clinic's PAST/ALL history exactly the
  // way the old 30-day local cache did, just via a different mechanism.
  const isArchive = timeFilter !== 'TODAY';
  const { finalStart: archiveStart, finalEnd: archiveEnd } = getFinanceDateRange();
  const {
    archiveData: archiveInvoices,
    archiveTotal: archiveInvoicesTotal,
    archiveLoading: archiveInvoicesLoading,
    hasMore: archiveInvoicesHasMore,
    loadMore: loadMoreArchiveInvoices
  } = useArchiveData({
    endpoint: '/finance/invoices',
    active: isArchive && billingViewMode === 'INVOICES',
    startDate: archiveStart,
    endDate: archiveEnd,
    searchTerm,
    statusFilter,
    modalityFilter,
    pageSize: 25
  });

  const {
    archiveData: archiveExpenses,
    archiveTotal: archiveExpensesTotal,
    archiveLoading: archiveExpensesLoading,
    hasMore: archiveExpensesHasMore,
    loadMore: loadMoreArchiveExpenses
  } = useArchiveData({
    endpoint: '/finance/expenses',
    active: isArchive && billingViewMode === 'EXPENSES',
    startDate: archiveStart,
    endDate: archiveEnd,
    searchTerm: expenseSearch,
    statusFilter: expenseFilter, // Actually backend might not support this mapping exactly, but we'll try
    pageSize: 25
  });

  const {
    archiveData: archiveCommissions,
    archiveTotal: archiveCommissionsTotal,
    archiveLoading: archiveCommissionsLoading,
    hasMore: archiveCommissionsHasMore,
    loadMore: loadMoreArchiveCommissions
  } = useArchiveData({
    endpoint: '/referrers/commissions', // Needs to match backend endpoint
    active: isArchive && billingViewMode === 'REFERRAL_CUTS',
    startDate: archiveStart,
    endDate: archiveEnd,
    searchTerm: referralSearch,
    pageSize: 25
  });

  // --- SYNC & FETCH ---
  const [matrix, setMatrix] = useState({ daily: [], weekly: [], monthly: [], yearly: [], modalityBreakdown: [] });
  const [isSyncing, setIsSyncing] = useState(false);


  // Responsive layout detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Resize listener lives in the mount effect below (it also kicks off
  // refreshAllFinancialData) — this used to be a separate, duplicate
  // listener doing the identical setIsMobile/setWindowWidth work.

  const fetchInvoices = useCallback(async () => {
    try {
      const { finalStart, finalEnd } = getFinanceDateRange();
      const data = await fetchInvoicesApi({ startDate: finalStart, endDate: finalEnd });
      setInvoices(Array.isArray(data) ? data : (data?.items || []));
    } catch (err) {
      console.error('[FINANCE] Invoice fetch failed', err);
      notifyToast('Could not load invoices — check your connection.', 'error');
    }
  }, [getFinanceDateRange]);

  // B3 Slice 7 — service charges promoted to a Dexie snapshot for
  // consistency with the other offline surfaces. On success: snapshot the
  // full response into IndexedDB; on failure: load from snapshot. The old
  // nativeStorage cache stays as a secondary fallback for legacy installs
  // that haven't populated the Dexie copy yet.
  // Warm the price-registry snapshot from the server. Rendering is driven by
  // the watchServiceCharges subscription below, so an edited price flows in on
  // its own (from here, the sync engine's background refresh, or another
  // device). On failure we keep the last good snapshot.
  const fetchRegistry = useCallback(async () => {
    try {
      const data = await fetchRegistryApi();
      await snapshotServiceCharges(data);
    } catch (err) {
      console.warn('[FINANCE] Registry refresh failed — keeping offline snapshot.', err);
    }
  }, []);

  const fetchMatrix = useCallback(async () => {
    const today = getIstDateStr(new Date().toISOString());
    let finalStart = null;
    let finalEnd = null;

    if (timeFilter === 'TODAY') {
      finalStart = today;
      finalEnd = today;
    } else if (timeFilter === 'PAST') {
      // "Before today" — no lower bound, but must exclude today itself.
      // Leaving both bounds null (as this branch used to) sent the exact
      // same unbounded request as ALL time, so "Past" silently showed
      // identical numbers to "All Time", today's activity included.
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      finalEnd = getIstDateStr(yesterday.toISOString());
    } else if (timeFilter === 'CUSTOM') {
      finalStart = startDate;
      finalEnd = endDate;
    }

    const cacheKey = `1rad_cache_matrix_${timeFilter}_${startDate}_${endDate}`;

    try {
      const data = await fetchFinancialMatrix({ startDate: finalStart, endDate: finalEnd });
      setMatrix(data);
      await nativeStorage.set(cacheKey, data);
    } catch (err) {
      console.error('[FINANCE] Matrix fetch failed, trying cache', err);
      const cached = await nativeStorage.get(cacheKey);
      if (cached) setMatrix(cached);
    }
  }, [timeFilter, startDate, endDate]);

  const fetchPendingBillables = useCallback(async (patientId) => {
    if (!patientId) return;
    try {
      const data = await fetchPendingBillablesApi(patientId);
      setPendingServices(data);
      await nativeStorage.set(`1rad_cache_pending_${patientId}`, data);
    } catch (err) {
      console.error('[FINANCE] Pending billables fetch failed, trying cache', err);
      const cached = await nativeStorage.get(`1rad_cache_pending_${patientId}`);
      if (cached) setPendingServices(cached);
    }
  }, []);

  const fetchExpenses = useCallback(async () => {
    try {
      const { finalStart, finalEnd } = getFinanceDateRange();
      const data = await fetchExpensesApi({ startDate: finalStart, endDate: finalEnd });
      setExpenses(Array.isArray(data) ? data : (data?.items || []));
    } catch (err) {
      console.error('[FINANCE] Expense fetch failed', err);
      notifyToast('Could not load expenses — check your connection.', 'error');
    }
  }, [getFinanceDateRange]);

  // The FULL partner list — deliberately not filtered by the page's search box.
  // It used to be: typing a patient name in the billing search shrank this list
  // to referrers matching that name (so the payee prefill and the partner filter
  // lost everyone else), AND, because fetchReferrers sat in refreshAllFinancialData's
  // dependency list, every search-box debounce re-fetched ALL finance data.
  const fetchReferrers = useCallback(async () => {
    try {
      const res = await apiClient.get('/referrers');
      setReferrers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('[FINANCE] Referrer fetch failed', err);
    }
  }, []);

  // NOTE: the legacy implementation hit /referrers/ledger which returns
  // date-grouped detail. This flat per-row shape is what the rest of the
  // page (useBillingData, ReferralHub) already expects; if a surface needs
  // the date-grouping it can be computed client-side.
  const fetchCommissions = useCallback(async () => {
    try {
      const { finalStart, finalEnd } = getFinanceDateRange();
      const data = await fetchCommissionsApi({ startDate: finalStart, endDate: finalEnd });
      setReferralCommissions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[FINANCE] Commission fetch failed', err);
      notifyToast('Could not load referral commissions — check your connection.', 'error');
    }
  }, [getFinanceDateRange]);

  const fetchAppointments = useCallback(async () => {
    const today = getIstDateStr(new Date().toISOString());
    try {
      const data = await fetchAppointmentsApi({ startDate: today });
      setAppointments(data);
      await nativeStorage.set('1rad_cache_billing_upcoming_appointments', data);
    } catch (err) {
      console.error('[FINANCE] Appointment fetch failed', err);
      const cached = await nativeStorage.get('1rad_cache_billing_upcoming_appointments');
      if (cached) setAppointments(cached);
    }
  }, []);

  const [ownerDetails, setOwnerDetails] = useState(null);

  // Derive the centre owner (for invoice headers / print) from a personnel
  // list. Pure — used by both the cold-start fetch and the reactive watch.
  const deriveOwner = useCallback((staffList) => {
    const list = Array.isArray(staffList) ? staffList : [];
    let owner = list.find(u => {
      const roles = (u.roles || u.Roles || []).map(r => String(r).toLowerCase());
      return roles.includes('admindoctor');
    });
    if (!owner) {
      owner = list.find(u => {
        const roles = (u.roles || u.Roles || []).map(r => String(r).toLowerCase());
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
  }, []);

  // Warm the personnel snapshot; ownerDetails renders from watchPersonnel below.
  const fetchPersonnel = useCallback(async () => {
    try {
      const res = await apiClient.get('/personnel');
      await snapshotPersonnel(res.data);
    } catch (err) {
      console.error('[FINANCE] Personnel refresh failed — keeping offline snapshot.', err);
    }
  }, []);

  // Patients holding a credit balance → { patientId: balance }. Used to flag
  // "Paid · Advance ₹X" on the invoice status and to drive the drawer refund.
  const fetchOutstandingCredits = useCallback(async () => {
    try {
      const data = await fetchOutstandingCreditsApi();
      setOutstandingCredits(Array.isArray(data) ? data : []);
    } catch { /* offline / no credits — keep last known */ }
  }, []);

  const advanceByPatient = useMemo(() => {
    const m = {};
    for (const c of (outstandingCredits || [])) {
      if (c && c.patientId != null) m[String(c.patientId)] = Number(c.balance) || 0;
    }
    return m;
  }, [outstandingCredits]);

  const refreshAllFinancialData = useCallback(async () => {
    await Promise.allSettled([
      fetchInvoices(),
      fetchExpenses(),
      fetchReferrers(),
      fetchCommissions(),
      fetchRegistry(),
      fetchAppointments(),
      fetchPersonnel(),
      fetchOutstandingCredits(),
      loadApprovalMap(),
    ]);
  }, [fetchInvoices, fetchExpenses, fetchReferrers, fetchCommissions, fetchRegistry, fetchAppointments, fetchPersonnel, fetchOutstandingCredits, loadApprovalMap]);

  // Incentives tab: keep eligibility live. A payout becomes payable the moment the
  // patient pays (on the Revenue tab, another screen, or another device), so while
  // this tab is showing, quietly refresh commissions + invoices + pending approvals
  // every 60s and whenever the browser tab returns to the foreground.
  useEffect(() => {
    if (billingViewMode !== 'REFERRAL_CUTS') return undefined;
    const tick = () => {
      if (document.hidden) return;
      void Promise.allSettled([fetchCommissions(), fetchInvoices(), loadApprovalMap()]);
    };
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [billingViewMode, fetchCommissions, fetchInvoices, loadApprovalMap]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);

    void refreshAllFinancialData();

    return () => window.removeEventListener('resize', handleResize);
  }, [refreshAllFinancialData]);

  // The matrix aggregates the centre's financial history and is expensive on
  // large tenants. Load it only for the two views that render it. Also
  // re-fetches whenever isOnline/pendingCount change — without this, the
  // client-computed fallback below (which takes over while offline or with
  // unsynced outbox items) stays on screen indefinitely after reconnecting:
  // nothing else re-requests the authoritative server matrix once the
  // fallback effect stops running, so the numbers can silently stay stale.
  useEffect(() => {
    // SERVICES (Service Performance) also renders AnalyticsHub off this same
    // matrix — it was missing here, so switching to that tab (or changing
    // the date filter while on it) never refetched. It silently kept
    // whatever matrix a prior Analytics/Finance visit had left behind (a
    // different date range), or — if the page never fetched a matrix at all
    // yet — fell through to the offline keyword-matching fallback instead of
    // the backend's authoritative per-service numbers. Either way the
    // figures shown didn't match the rest of the page.
    //
    // INVOICES (Revenue) needs it too now: its headline KPI strip reads
    // matrix.revenueSummary (the same live-DB aggregate Service Performance
    // uses) instead of re-deriving totals from the local offline cache,
    // which is only ever a rolling recent window (see evictOlderThan in the
    // sync engine) and can legitimately be missing older invoices for a
    // wider date range — that gap was the root cause of Revenue and Service
    // Performance silently disagreeing for any range beyond "recent".
    if (billingViewMode === 'ANALYTICS' || billingViewMode === 'FINANCE' || billingViewMode === 'SERVICES' || billingViewMode === 'INVOICES') {
      void fetchMatrix();
    }
  }, [billingViewMode, fetchMatrix, isOnline, pendingCount]);

  // Reset page whenever filters change so 'Load more' resets to page 1
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetInvoicePage();
  }, [statusFilter, searchTerm, startDate, endDate, timeFilter, modalityFilter, approvalFilter, resetInvoicePage]);

  // 'Load 25 more' 
  const loadMoreInvoices = useCallback(async () => {
    if (invoiceLoadingMore) return;
    setInvoiceLoadingMore(true);
    await new Promise(r => setTimeout(r, 120));
    setInvoicePageSize(prev => prev + 25);
    setInvoiceLoadingMore(false);
  }, [invoiceLoadingMore]);

  // ── Expense Ledger Pagination ─────────────────────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetExpensePage();
  }, [expenseFilter, expenseSearch, startDate, endDate, timeFilter, modalityFilter, resetExpensePage]);

  const loadMoreExpenses = useCallback(async () => {
    if (expenseLoadingMore) return;
    setExpenseLoadingMore(true);
    await new Promise(r => setTimeout(r, 120));
    setExpensePageSize(prev => prev + 25);
    setExpenseLoadingMore(false);
  }, [expenseLoadingMore]);


  // Invoices/Expenses/Referrers/ReferralCommissions are fetched live — each
  // effect re-runs on mount and whenever its fetcher's identity changes
  // (i.e. the date range or search term it closes over changed).
  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);
  useEffect(() => { fetchReferrers(); }, [fetchReferrers]);


  // Load the approval-request map on mount (powers the Revenue approval column).
  useEffect(() => { 
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadApprovalMap(); 
  }, [loadApprovalMap]);

  // Load the real Auto-Bill setting from the server so the toggle in the
  // Control tab reflects what is actually persisted in the database.
  useEffect(() => {
    if (!activeCenter?.id) return;
    let alive = true;
    (async () => {
      try {
        const res = await apiClient.get(`/hospitals/${activeCenter.id}`);
        const enabled = res.data.isAutoBillingEnabled ?? res.data.IsAutoBillingEnabled ?? false;
        if (alive) setBillingSettings(prev => ({ ...prev, autoBill: enabled }));
      } catch {
        // Keep the default; the toggle can still optimistically save via PUT.
        if (alive) setBillingSettings(prev => ({
          ...prev,
          autoBill: activeCenter.isAutoBillingEnabled ?? false,
        }));
      }
    })();
    return () => { alive = false; };
  }, [activeCenter?.id]);

  useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

  // Reactive reference data: the price registry and owner details render from
  // the local cache, refreshed every cycle by the sync engine. A price edited
  // here or elsewhere appears on its own — no manual refresh.
  useEffect(() => {
    const subPrices = watchServiceCharges().subscribe({
      next: (rows) => setServiceRegistry(Array.isArray(rows) ? rows : []),
      error: (err) => console.warn('[BillingPage] service-charges liveQuery error', err),
    });
    const subPersonnel = watchPersonnel().subscribe({
      next: (rows) => { if (Array.isArray(rows) && rows.length) deriveOwner(rows); },
      error: (err) => console.warn('[BillingPage] personnel liveQuery error', err),
    });
    return () => { subPrices.unsubscribe(); subPersonnel.unsubscribe(); };
  }, [deriveOwner]);


  // ── Expense / Price / Auto-bill actions (extracted hook) ────────────────────
  const {
    handleSaveExpense,
    handleToggleExpenseStatus,
    handleSetExpenseStatus,
    handleDeleteExpense,
    handleSavePrice,
    handleDeletePrice,
    handleToggleAutoBill,
  } = useExpenseActions({
    isOnline, addToOutbox, notify, notifyToast, confirmModal,
    refreshAllFinancialData, TODAY, activeCenter,
    editExpense, setExpenses, setEditExpense, setSavingExpense, setIsExpenseDrawerOpen,
    editPrice, setIsPriceDrawerOpen, fetchRegistry,
    billingSettings, setBillingSettings,
  });
  
  // ── Print handlers (extracted pure utils) ───────────────────────────────────
  const printCtx = { activeCenter, ownerDetails, notify };
  const handlePrintThermal = async (invInput = null) => {
    await printThermalSlip(invInput || selectedInvoice, printCtx);
  };
  const handlePrintA4 = async (invInput = null) => {
    await printA4Invoice(invInput || selectedInvoice, printCtx);
  };
  const handlePrintReceipt = async (invInput = null) => {
    await printReceiptSlip(invInput || selectedInvoice, printCtx);
  };

  // ── Export handler (delegates to extracted pure utility) ────────────────────
  const handleExportData = () => exportToExcel({
    invoices,
    liveStats,
    exportMode,
    exportDates,
    onClose: () => setIsExportDrawerOpen(false),
    onError: (msg) => notifyToast(msg, 'error'),
  });

  // ── Invoice / item / payment actions (extracted hook) ─────────────────
  const {
    recalculateInvoice,
    handleUpdateItem,
    handleAddItem,
    handleRemoveItem,
    handleOpenInvoice,
    handleCollectPayment,
    handleApplyCredit,
    handleCreateManualInvoice,
    handleSaveInvoice,
    handleRequestApproval,
    handleDeleteInvoice,
  } = useInvoiceActions({
    isOnline, notify, notifyToast, celebrate,
    refreshAllFinancialData,
    selectedInvoice, setSelectedInvoice,
    paymentMethod,
    setIsInvoiceDrawerOpen, setIsNewInvoiceDrawerOpen,
    setPaymentSuccess, setInvoices,
    selectedPatient, setSelectedPatient,
    setPatientSearchQuery,
    newInvoiceData, setNewInvoiceData,
  });

  const handleSyncLegacyData = async () => {
    const legacy = JSON.parse(localStorage.getItem('1rad_invoices') || '[]');
    if (legacy.length === 0) return notify({ type: 'info', message: 'No legacy data detected in browser.' });
    setIsSyncing(true);
    try {
      const payload = legacy.map(inv => ({
        invoiceId:   inv.invoiceId,
        patientName: inv.patientName,
        totalAmount: inv.totalAmount,
        status:      inv.status,
        createdAt:   inv.createdAt,
        items: inv.items.map(it => ({ description: it.description, amount: it.amount, quantity: it.quantity }))
      }));
      await syncLegacyInvoices({ invoices: payload });
      localStorage.removeItem('1rad_invoices');
      refreshAllFinancialData();
      notify({ type: 'success', message: 'Sync complete: local records merged.' });
    } catch (err) {
      console.error('[FINANCE] Sync failed', err);
      notify({ type: 'error', message: 'Sync failed. Please try again.' });
    } finally {
      setIsSyncing(false);
    }
  };
  const {
    filteredInvoices,
    futureAppointments,
    liveStats,
    recordedPayouts,
    filteredOutflow,
    outflowStats,
    filteredReferralCuts
  } = useBillingData({
    invoices, appointments, expenses, referralCommissions,
    searchTerm, timeFilter, statusFilter, modalityFilter,
    startDate, endDate, sortConfig, approvalFilter, approvalMap,
    expenseSearch, expenseFilter, referrerFilter, referralSearch
  });

  const itemsPerPage = 10;

  // Total records + label for the current view — drives the shared pager's
  // "Showing X–Y of N …" line and the page count.
  const totalRecords =
    billingViewMode === 'INVOICES' ? (timeFilter === 'FUTURE' ? (futureAppointments || []).length : (filteredInvoices || []).length) :
    billingViewMode === 'EXPENSES' ? (filteredOutflow || []).length :
    (filteredReferralCuts || []).length;

  const paginatedReferralCuts = useMemo(() => (filteredReferralCuts || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredReferralCuts, currentPage, itemsPerPage]);

  // ── Payout / commission actions (extracted hook) ───────────────────────
  const {
    handleSavePayout,
    handleWriteOffDeficit,
    handleToggleCommissionStatus,
  } = usePayoutActions({
    isOnline, notify, confirmModal,
    refreshAllFinancialData,
    editPayout, setIsPayoutDrawerOpen, setIsSavingPayout,
  });


  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [searchTerm, referralSearch, expenseSearch, expenseFilter, timeFilter, statusFilter, modalityFilter, startDate, endDate]);

  // --- PATIENT LOOKUP ---
  const fetchPatients = useCallback(async (query) => {
    if (!query) {
      setPatientResults([]);
      return;
    }
    setIsSearchingPatients(true);
    try {
      const response = await apiClient.get('/patients', {
        params: { search: query }
      });
      setPatientResults(response.data);
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    } finally {
      setIsSearchingPatients(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (patientSearchQuery) fetchPatients(patientSearchQuery);
      else setPatientResults([]);
    }, 500);
    return () => clearTimeout(timer);
  }, [patientSearchQuery, fetchPatients]);

  // Android billing tab definitions (used in both bottom nav and content switcher)
  const BILLING_TABS = [
    { id: 'INVOICES',      label: 'Revenue',     icon: '💰' },
    { id: 'REFERRAL_CUTS', label: 'Incentives',  icon: '🤝' },
    { id: 'EXPENSES',      label: 'Expenses',    icon: '📋' },
    { id: 'SERVICES',      label: 'Services',    icon: '📊' },
    { id: 'FINANCE',       label: 'Pricing',     icon: '⚙️' },
    { id: 'ANALYTICS',     label: 'Analytics',   icon: '📈' },
  ];

  return (
    <div className="billing-page" style={{ padding: isMobile ? '0' : '40px', background: '#f8fafc', minHeight: '100vh' }}>

      {/* ── ANDROID TOP APP BAR (mobile only, sticky) ───────────────────── */}
      {isMobile && (
        <div className="billing-android-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💳</div>
          </div>
          <div className="billing-android-topbar-title">
            <h1>Finance</h1>
            <span className="billing-android-topbar-subtitle">
              {activeCenter?.name || 'Current Facility'}
            </span>
          </div>
          <div className="billing-android-topbar-actions">
            <span className={`billing-android-online-badge ${isOnline ? 'online' : 'offline'}`}>
              <span style={{ fontSize: 6 }}>●</span>
              {isOnline ? 'LIVE' : 'OFFLINE'}
            </span>
            {localStorage.getItem('1rad_invoices') && (
              <button
                className="billing-android-topbar-btn"
                onClick={handleSyncLegacyData}
                disabled={isSyncing}
                title="Sync local data"
              >
                {isSyncing ? '⟳' : '☁'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── DESKTOP HEADER (non-mobile only) ───────────────────────────── */}
      {!isMobile && (
        <>
          <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0a1628', letterSpacing: '-0.5px', margin: 0 }}>Finance</h1>
              <div className="billing-tabs" style={{ display: 'flex', marginTop: '20px', overflowX: 'auto', borderBottom: '1px solid #e2e8f0', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <style>{`.billing-tabs::-webkit-scrollbar { display: none; }`}</style>
                {BILLING_TABS.map(tab => {
                  const active = billingViewMode === tab.id;
                  return (
                    <button key={tab.id} onClick={() => setBillingViewMode(tab.id)}
                      style={{ padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: active ? '3px solid #0f52ba' : '3px solid transparent', fontSize: '13px', fontWeight: active ? 800 : 600, cursor: 'pointer', color: active ? '#0f52ba' : '#64748b', transition: 'color 0.2s, border-color 0.2s', whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}
                    >{tab.label}</button>
                  );
                })}
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                {activeCenter?.name || 'Current facility'} · Finance &amp; Billing
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div id="billing-header-actions-portal"></div>
                {localStorage.getItem('1rad_invoices') && (
                  <button onClick={handleSyncLegacyData} disabled={isSyncing}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#1d4ed8', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >{isSyncing ? 'Syncing...' : 'Sync Local'}</button>
                )}
              </div>
            </div>
          </div>
          {(!isOnline || pendingCount > 0) && (
            <div style={{ margin: '0 0 14px', background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '4px solid #b45309', color: '#78350f', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', fontWeight: 600, lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '14px' }}>📊</span>
              <div><strong>Dashboard values computed locally</strong> — {!isOnline ? 'you are offline; numbers reflect what your device has cached.' : `${pendingCount} pending change${pendingCount === 1 ? '' : 's'} not yet on the server.`} They will switch back to the server’s authoritative figures once the queue drains.</div>
            </div>
          )}
        </>
      )}

      {/* Portal for hub components that inject export/action buttons into header on desktop */}
      {isMobile && <div id="billing-header-actions-portal" style={{ display: 'none' }}></div>}

      {/* ── ANDROID SYNC BANNER (mobile offline/pending notice) ────────── */}
      {isMobile && (!isOnline || pendingCount > 0) && (
        <div style={{ margin: '12px 16px 0', background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '4px solid #b45309', color: '#78350f', borderRadius: '12px', padding: '10px 14px', fontSize: '11px', fontWeight: 600, lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: 16 }}>📊</span>
          <div><strong>Locally computed</strong> — {!isOnline ? 'offline; device cache.' : `${pendingCount} change${pendingCount === 1 ? '' : 's'} pending sync.`}</div>
        </div>
      )}

      {/* ── MAIN CONTENT WRAPPER ───────────────────────────────────────── */}
      {/* On mobile this is the scrollable body div. On desktop it's just a passthrough. */}
      <div className={isMobile ? 'billing-android-body' : ''}>

      {billingViewMode === 'EXPENSES' && (
        <ExpenseLedger
          isMobile={isMobile}
          outflowStats={outflowStats}
          pagedExpenses={isArchive ? archiveExpenses : (filteredOutflow || []).slice(0, expensePageSize)}
          expenseTotalCount={isArchive ? archiveExpensesTotal : (filteredOutflow || []).length}
          expenseHasMore={isArchive ? archiveExpensesHasMore : (expensePageSize < (filteredOutflow || []).length)}
          onLoadMoreExpenses={isArchive ? loadMoreArchiveExpenses : loadMoreExpenses}
          expenseLoadingMore={isArchive ? archiveExpensesLoading : expenseLoadingMore}
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          expenseSearch={expenseSearch}
          setExpenseSearch={setExpenseSearch}
          expenseFilter={expenseFilter}
          setExpenseFilter={setExpenseFilter}
          handleDeleteExpense={handleDeleteExpense}
          setEditExpense={setEditExpense}
          setIsExpenseDrawerOpen={setIsExpenseDrawerOpen}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          itemsPerPage={itemsPerPage}
          sortConfig={sortConfig}
          handleSort={handleSort}
          TODAY={TODAY}
          handleToggleExpenseStatus={handleToggleExpenseStatus}
          handleSetExpenseStatus={handleSetExpenseStatus}
          activeCenterName={activeCenter?.name || activeCenter?.hospitalName || 'Default'}
          notify={notify}
          confirmDialog={confirmModal}
        />
      )}


      {billingViewMode === 'INVOICES' && (
        <RevenueHub
          isOnline={isOnline}
          filteredInvoices={filteredInvoices}
          advanceByPatient={advanceByPatient}
          approvalMap={approvalMap}
          approvalFilter={approvalFilter}
          setApprovalFilter={setApprovalFilter}
          liveStats={liveStats}
          matrix={matrix}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          modalityFilter={modalityFilter}
          setModalityFilter={setModalityFilter}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          /* ── Cursor-pagination props ───────────────────────────── */
          pagedInvoices={isArchive ? archiveInvoices : (filteredInvoices || []).slice(0, invoicePageSize)}
          invoiceTotalCount={isArchive ? archiveInvoicesTotal : (filteredInvoices || []).length}
          invoiceHasMore={isArchive ? archiveInvoicesHasMore : (invoicePageSize < (filteredInvoices || []).length)}
          onLoadMoreInvoices={isArchive ? loadMoreArchiveInvoices : loadMoreInvoices}
          invoiceLoadingMore={isArchive ? archiveInvoicesLoading : invoiceLoadingMore}
          /* ── Future-appointment section (unchanged) ───────────────── */
          paginatedFutureAppointments={futureAppointments}
          handleOpenInvoice={handleOpenInvoice}
          handleDeleteInvoice={handleDeleteInvoice}
          handlePrintA4={handlePrintA4}
          handlePrintThermal={handlePrintThermal}
          handlePrintReceipt={handlePrintReceipt}
          isMobile={isMobile}
          recordedPayouts={recordedPayouts}
          referralCommissions={referralCommissions}
          setEditPayout={setEditPayout}
          setIsPayoutDrawerOpen={setIsPayoutDrawerOpen}
          referrers={referrers}
          setSelectedInvoice={setSelectedInvoice}
          setIsInvoiceDrawerOpen={setIsInvoiceDrawerOpen}
          setIsNewInvoiceDrawerOpen={setIsNewInvoiceDrawerOpen}
          sortConfig={sortConfig}
          handleSort={handleSort}
          futureAppointments={futureAppointments}
          serviceRegistry={serviceRegistry}
        />
      )}


      {billingViewMode === 'REFERRAL_CUTS' && (
        <ReferralHub
          isMobile={isMobile}
          isOnline={isOnline}
          approvalMap={approvalMap}
          filteredReferralCuts={filteredReferralCuts}
          paginatedReferralCuts={paginatedReferralCuts}
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          referralSearch={referralSearch}
          setReferralSearch={setReferralSearch}
          onWriteOffDeficit={handleWriteOffDeficit}
          handleToggleCommissionStatus={handleToggleCommissionStatus}
          handleDeleteExpense={handleDeleteExpense}
          setEditPayout={setEditPayout}
          setIsPayoutDrawerOpen={setIsPayoutDrawerOpen}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          itemsPerPage={itemsPerPage}
          sortConfig={sortConfig}
          handleSort={handleSort}
          referrers={referrers}
          referrerFilter={referrerFilter}
          setReferrerFilter={setReferrerFilter}
          modalityFilter={modalityFilter}
          setModalityFilter={setModalityFilter}
        />

      )}

      {billingViewMode === 'SERVICES' && matrix && (
        <AnalyticsHub 
          isMobile={isMobile}
          liveStats={liveStats}
          outflowStats={outflowStats}
          matrix={matrix}
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          invoices={filteredInvoices}
          expenses={expenses}
          referrers={referrers}
          referralCommissions={referralCommissions}
          appointments={appointments}
          forceSection="SERVICES"
        />
      )}

      {billingViewMode === 'ANALYTICS' && matrix && (
        <AnalyticsHub 
          isMobile={isMobile}
          liveStats={liveStats}
          outflowStats={outflowStats}
          matrix={matrix}
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          invoices={filteredInvoices}
          expenses={expenses}
          referrers={referrers}
          referralCommissions={referralCommissions}
          appointments={appointments}
        />
      )}

      {billingViewMode === 'FINANCE' && (
        <FinanceManager 
          isMobile={isMobile}
          servicePrices={serviceRegistry}
          fetchServicePrices={fetchRegistry}
          financialMatrix={matrix}
          fetchFinancialMatrix={fetchMatrix}
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
          isTestMode={false}
          TODAY={TODAY}
          hideTabs={['EXPENSES', 'LEDGER']}
        />
      )}

      </div>{/* end billing-android-body / desktop passthrough wrapper */}

      {/* ── SHARED DRAWERS (rendered outside the scroll wrapper, fixed position) ──── */}
      {/* Shared Drawers */}
      {isInvoiceDrawerOpen && (
        <InvoiceDrawer 
          isMobile={isMobile}
          selectedInvoice={selectedInvoice}
          setIsInvoiceDrawerOpen={setIsInvoiceDrawerOpen}
          isPaid={selectedInvoice.status === 'PAID'}
          handleAddItem={handleAddItem}
          handleUpdateItem={handleUpdateItem}
          handleRemoveItem={handleRemoveItem}
          recalculateInvoice={recalculateInvoice}
          setSelectedInvoice={setSelectedInvoice}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          handleSaveInvoice={handleSaveInvoice}
          handleCollectPayment={handleCollectPayment}
          handleApplyCredit={handleApplyCredit}
          onAdvanceRefunded={refreshAllFinancialData}
          isOnline={isOnline}
          handlePrintA4={handlePrintA4}
          handlePrintThermal={handlePrintThermal}
          onRequestApproval={handleRequestApproval}
        />

      )}
      {isNewInvoiceDrawerOpen && (
        <NewInvoiceDrawer 
          isMobile={isMobile}
          setIsNewInvoiceDrawerOpen={setIsNewInvoiceDrawerOpen}
          handleCreateManualInvoice={handleCreateManualInvoice}
          selectedPatient={selectedPatient}
          setSelectedPatient={setSelectedPatient}
          patientSearchQuery={patientSearchQuery}
          setPatientSearchQuery={setPatientSearchQuery}
          isSearchingPatients={isSearchingPatients}
          patientResults={patientResults}
          setPatientResults={setPatientResults}
          fetchPendingBillables={fetchPendingBillables}
          setPendingServices={setPendingServices}
          pendingServices={pendingServices}
          newInvoiceData={newInvoiceData}
          setNewInvoiceData={setNewInvoiceData}
          serviceRegistry={serviceRegistry}
          referrers={referrers}
        />
      )}
      {isExportDrawerOpen && (
        <ExportDrawer 
          isMobile={isMobile}
          setIsExportDrawerOpen={setIsExportDrawerOpen}
          exportMode={exportMode}
          setExportMode={setExportMode}
          exportDates={exportDates}
          setExportDates={setExportDates}
          handleExportData={handleExportData}
        />
      )}
      {isExpenseDrawerOpen && (
        <ExpenseDrawer 
          isMobile={isMobile}
          setIsExpenseDrawerOpen={setIsExpenseDrawerOpen}
          handleSaveExpense={handleSaveExpense}
          editExpense={editExpense}
          setEditExpense={setEditExpense}
          savingExpense={savingExpense}
          referrers={referrers}
          expenses={expenses}
        />
      )}
      {isPayoutDrawerOpen && (
        <PayoutDrawer
          isMobile={isMobile}
          setIsPayoutDrawerOpen={setIsPayoutDrawerOpen}
          handleSavePayout={handleSavePayout}
          editPayout={editPayout}
          setEditPayout={setEditPayout}
          isSavingPayout={isSavingPayout}
        />
      )}

      {/* Unified Notice / Confirm modal — replaces window.alert / window.confirm */}
      <BillingNoticeModal {...noticeProps} />

      {/* ── Payment Success Modal ─────────────────────────────────────────── */}
      <PaymentSuccessModal
        paymentSuccess={paymentSuccess}
        onDismiss={() => setPaymentSuccess(null)}
        isMobile={isMobile}
      />

      {/* ── Android Bottom Nav + FAB (mobile only) ───────────────────────── */}
      {isMobile && (
        <>
          {/* FAB — New Invoice shortcut, only visible on Revenue tab */}
          {billingViewMode === 'INVOICES' && (
            <button
              className="billing-android-fab"
              onClick={() => setIsNewInvoiceDrawerOpen(true)}
              title="New Invoice"
              aria-label="Create new invoice"
            >
              +
            </button>
          )}

          {/* Fixed Bottom Navigation Bar */}
          <nav className="billing-android-bottomnav" aria-label="Billing navigation">
            {BILLING_TABS.map(tab => (
              <button
                key={tab.id}
                className={`billing-android-nav-item${billingViewMode === tab.id ? ' active' : ''}`}
                onClick={() => setBillingViewMode(tab.id)}
                aria-label={tab.label}
                aria-current={billingViewMode === tab.id ? 'page' : undefined}
              >
                <span className="billing-android-nav-icon">{tab.icon}</span>
                <span className="billing-android-nav-label">{tab.label}</span>
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
