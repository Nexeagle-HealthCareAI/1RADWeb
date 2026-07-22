import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import useAuth from '../auth/useAuth';
import apiClient from '../api/apiClient';
import useOffline from '../hooks/useOffline';
import { nativeStorage } from '../hooks/useElectron';
import { printThermalReceipt } from '../utils/thermalPrint';
import { watchInvoices, watchInvoicesPage } from '../db/repos/invoicesRepo';
import { watchExpenses, watchExpensesPage } from '../db/repos/expensesRepo';
import { watchReferrers } from '../db/repos/referrersRepo';
import { watchReferralCommissions } from '../db/repos/referralCommissionsRepo';
import { snapshotServiceCharges, watchServiceCharges } from '../db/repos/serviceChargesRepo';
import { snapshotPersonnel, watchPersonnel } from '../db/repos/personnelRepo';
import { syncNow } from '../sync/SyncEngine';
import { computeStats, computeMatrix } from '../analytics/financialAggregator';
import { matchesAnyModality } from '../utils/appointmentServices';
import { notifyToast } from '../utils/toast';
import '../styles/BillingPage.css';

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

  // --- SYNC & FETCH ---
  const [stats, setStats] = useState({ totalRevenue: 0, pendingCount: 0, realizationRate: 0, averageTicket: 0, pendingRevenue: 0 });
  const [matrix, setMatrix] = useState({ daily: [], weekly: [], monthly: [], yearly: [], modalityBreakdown: [] });
  const [isSyncing, setIsSyncing] = useState(false);


  // Responsive layout detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);


  // B3 Slice 1 — invoices are now offline-first. The legacy fetchInvoices
  // function survives so post-mutation calls still work, but reading is
  // driven by the liveQuery subscription added in the useEffect below.
  // fetchInvoices reduces to a SyncEngine nudge that pulls the freshest
  // delta into the local cache; liveQuery re-emits and the table re-renders.
  const fetchInvoices = useCallback(async () => {
    try { await syncNow(); } catch (_) { /* engine logs */ }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiClient.get('/finance/stats');
      setStats(res.data);
      await nativeStorage.set('1rad_cache_stats', res.data);
    } catch (err) {
      console.error('[FINANCE] Stats fetch failed, trying cache', err);
      const cached = await nativeStorage.get('1rad_cache_stats');
      if (cached) setStats(cached);
    }
  }, []);

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
      const res = await apiClient.get('/finance/registry');
      await snapshotServiceCharges(res.data);
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
    } else if (timeFilter === 'CUSTOM') {
      finalStart = startDate;
      finalEnd = endDate;
    }

    const cacheKey = `1rad_cache_matrix_${timeFilter}_${startDate}_${endDate}`;

    try {
      const res = await apiClient.get('/finance/matrix', {
        params: { startDate: finalStart, endDate: finalEnd }
      });
      setMatrix(res.data);
      await nativeStorage.set(cacheKey, res.data);
    } catch (err) {
      console.error('[FINANCE] Matrix fetch failed, trying cache', err);
      const cached = await nativeStorage.get(cacheKey);
      if (cached) setMatrix(cached);
    }
  }, [timeFilter, startDate, endDate]);

  const fetchPendingBillables = useCallback(async (patientId) => {
    if (!patientId) return;
    try {
      const res = await apiClient.get(`/finance/pending-billables/${patientId}`);
      setPendingServices(res.data);
      await nativeStorage.set(`1rad_cache_pending_${patientId}`, res.data);
    } catch (err) {
      console.error('[FINANCE] Pending billables fetch failed, trying cache', err);
      const cached = await nativeStorage.get(`1rad_cache_pending_${patientId}`);
      if (cached) setPendingServices(cached);
    }
  }, []);

  // B3 Slice 3 — expenses are offline-first. Reading is driven by the
  // watchExpenses liveQuery added in the same effect block as invoices;
  // fetchExpenses becomes a SyncEngine nudge so post-mutation refreshes
  // still work.
  const fetchExpenses = useCallback(async () => {
    try { await syncNow(); } catch (_) {}
  }, []);

  // B3 Slice 4 — referrers offline. fetchReferrers becomes a SyncEngine
  // nudge; rendering driven by the watchReferrers liveQuery effect below.
  const fetchReferrers = useCallback(async () => {
    try { await syncNow(); } catch (_) {}
  }, []);

  // B3 Slice 5 — referral commissions offline. NOTE: the legacy
  // implementation hit /referrers/ledger which returns date-grouped detail.
  // The cache holds flat per-row commissions; if downstream rendering
  // needs the date-grouping it can be computed client-side. Keeping the
  // ledger endpoint cached separately is a future follow-up if a user
  // surface depends on its specific shape.
  const fetchCommissions = useCallback(async () => {
    try { await syncNow(); } catch (_) {}
  }, []);

  const fetchAppointments = useCallback(async () => {
    const today = getIstDateStr(new Date().toISOString());
    try {
      const res = await apiClient.get('/appointments', { params: { startDate: today } });
      setAppointments(res.data);
      await nativeStorage.set('1rad_cache_billing_upcoming_appointments', res.data);
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
      const { data } = await apiClient.get('/finance/credits/outstanding');
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
    // One sync refreshes invoices, expenses, referrers, and commissions. The
    // previous implementation started four concurrent full syncs on each mount.
    await Promise.allSettled([
      fetchInvoices(),
      fetchStats(),
      fetchRegistry(),
      fetchAppointments(),
      fetchPersonnel(),
      fetchOutstandingCredits(),
      loadApprovalMap(),
    ]);
  }, [fetchInvoices, fetchStats, fetchRegistry, fetchAppointments, fetchPersonnel, fetchOutstandingCredits, loadApprovalMap]);

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
  // large tenants. Load it only for the two views that render it.
  useEffect(() => {
    if (billingViewMode === 'ANALYTICS' || billingViewMode === 'FINANCE') {
      void fetchMatrix();
    }
  }, [billingViewMode, fetchMatrix]);

  // Reset page whenever filters change so 'Load more' resets to page 1
  useEffect(() => {
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
    resetExpensePage();
  }, [expenseFilter, expenseSearch, startDate, endDate, timeFilter, modalityFilter, resetExpensePage]);

  const loadMoreExpenses = useCallback(async () => {
    if (expenseLoadingMore) return;
    setExpenseLoadingMore(true);
    await new Promise(r => setTimeout(r, 120));
    setExpensePageSize(prev => prev + 25);
    setExpenseLoadingMore(false);
  }, [expenseLoadingMore]);


  // Full watchInvoices subscription — fetches all invoices.
  // The UI arrays (filteredInvoices) will apply the complex filters consistently.
  useEffect(() => {
    const sub = watchInvoices({}).subscribe({
      next: (rows) => setInvoices(rows),
      error: (err) => console.warn('[BillingPage] invoice liveQuery error', err),
    });
    return () => sub.unsubscribe();
  }, []);

  // Client-side analytics override. 
  useEffect(() => {
    const useComputed = !isOnline || pendingCount > 0;
    if (!useComputed) return undefined;
    
    // Compute date boundaries for analytics based on timeFilter
    const todayStr = getIstDateStr(new Date().toISOString());
    let s = undefined, e = undefined;
    if (timeFilter === 'TODAY') { s = e = todayStr; }
    else if (timeFilter === 'PAST') { 
        const d = new Date(); d.setDate(d.getDate() - 1);
        e = getIstDateStr(d.toISOString()); 
    }
    else if (timeFilter === 'CUSTOM') { s = startDate; e = endDate; }
    
    const sub = watchInvoices({
      startDateIso: s,
      endDateIso:   e,
    }).subscribe({
      next: (rows) => {
        setStats(computeStats(rows));
        setMatrix(computeMatrix(rows, {
          from: s || undefined,
          to:   e || undefined,
        }));
      },
      error: (err) => console.warn('[BillingPage] computed analytics liveQuery error', err),
    });
    return () => sub.unsubscribe();
  }, [isOnline, pendingCount, timeFilter, startDate, endDate]);

  // B3 Slice 3 — full expenses liveQuery. Fetches all.
  useEffect(() => {
    const sub = watchExpenses({}).subscribe({
      next: (rows) => setExpenses(rows),
      error: (err) => console.warn('[BillingPage] expense liveQuery error', err),
    });
    return () => sub.unsubscribe();
  }, []);

  // B3 Slice 4 — referrers liveQuery.
  useEffect(() => {
    const sub = watchReferrers({ search: searchTerm }).subscribe({
      next: (rows) => setReferrers(rows),
      error: (err) => console.warn('[BillingPage] referrers liveQuery error', err),
    });
    return () => sub.unsubscribe();
  }, [searchTerm]);

  // Load the approval-request map on mount (powers the Revenue approval column).
  useEffect(() => { loadApprovalMap(); }, [loadApprovalMap]);

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

  // B3 Slice 5 — referral commissions liveQuery. Fetches all.
  useEffect(() => {
    const sub = watchReferralCommissions({}).subscribe({
      next: (rows) => setReferralCommissions(rows),
      error: (err) => console.warn('[BillingPage] commissions liveQuery error', err),
    });
    return () => sub.unsubscribe();
  }, []);

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


  const handleSaveExpense = async (e) => {
    e.preventDefault();
    // API requires Description; form's "Item or vendor" field writes to vendorName.
    // Use vendorName as fallback so saving never fails on a blank description.
    const payload = {
      ...editExpense,
      description: (editExpense.description || '').trim() || (editExpense.vendorName || '').trim(),
    };

    // Stable key shared by the online call + outbox fallback so a lost-response
    // retry can't record the expense twice.
    const idemKey = crypto.randomUUID();
    if (!isOnline) {
      await addToOutbox(payload.id ? 'EXPENSE_UPDATE' : 'EXPENSE', payload, idemKey);
      notify({ type: 'info', title: 'Offline', message: 'Expense will sync when reconnected.' });
      setIsExpenseDrawerOpen(false);
      return;
    }

    try {
      setSavingExpense(true);
      if (payload.id) {
        await apiClient.put(`/finance/expenses/${payload.id}`, payload, { headers: { 'Idempotency-Key': idemKey } });
      } else {
        await apiClient.post('/finance/expense', payload, { headers: { 'Idempotency-Key': idemKey } });
      }
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
        // costCenter is no longer user-editable; default it to the active centre name.
        costCenter: activeCenter?.name || activeCenter?.hospitalName || 'Default',
        status: 'Paid'
      });
      refreshAllFinancialData(); // Refresh all financial hubs
    } catch (err) {
      console.error('[FINANCE] Expense save failed', err);
      if (!err.response) {
        await addToOutbox(payload.id ? 'EXPENSE_UPDATE' : 'EXPENSE', payload, idemKey);
        notify({ type: 'info', title: 'No connection', message: 'Expense added to offline queue.' });
        setIsExpenseDrawerOpen(false);
      } else {
        notify({ type: 'error', message: 'Failed to save expense.' });
      }
    } finally {
      setSavingExpense(false);
    }
  };

  const handleSavePrice = async (e) => {
    e.preventDefault();
    try {
      if (editPrice.id) {
        await apiClient.put(`/finance/registry/${editPrice.id}`, editPrice);
      } else {
        await apiClient.post('/finance/registry', editPrice);
      }
      setIsPriceDrawerOpen(false);
      fetchRegistry();
    } catch (err) {
      console.error('[FINANCE] Price save failed', err);
      notify({ type: 'error', message: 'Failed to save service price.' });
    }
  };

  const handleDeletePrice = (id) => {
    confirmModal({
      title: 'Delete service price?',
      message: 'This action cannot be undone.',
      confirmText: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await apiClient.delete(`/finance/registry/${id}`);
          fetchRegistry();
        } catch (err) {
          console.error('[FINANCE] Price deletion failed', err);
          notify({ type: 'error', message: 'Could not delete service price.' });
        }
      }
    });
  };

  const handleToggleAutoBill = async () => {
    const newAutoBill = !billingSettings.autoBill;
    const targetHubId = activeCenter?.id;
    if (!targetHubId) {
      notifyToast({ title: 'No centre selected', message: 'Please select a centre before changing this setting.' }, 'warning');
      return;
    }

    // We need the current hospital data for the PUT payload (API requires all fields).
    // Fall back to what we know if the GET hasn't been called yet.
    let hospitalPayload;
    try {
      const res = await apiClient.get(`/hospitals/${targetHubId}`);
      hospitalPayload = {
        hospitalName: res.data.hospitalName || res.data.HospitalName || activeCenter.name || '',
        hospitalAddress: res.data.hospitalAddress || res.data.HospitalAddress || '',
        gstin: res.data.gstin || res.data.GSTIN || '',
        registrationNumber: res.data.registrationNumber || res.data.RegistrationNumber || '',
        pan: res.data.pan || res.data.PAN || '',
        nabhNumber: res.data.nabhNumber || res.data.NABHNumber || '',
        isAutoBillingEnabled: newAutoBill,
      };
    } catch {
      hospitalPayload = {
        hospitalName: activeCenter.name || '',
        hospitalAddress: '',
        gstin: '', registrationNumber: '', pan: '', nabhNumber: '',
        isAutoBillingEnabled: newAutoBill,
      };
    }

    if (!isOnline) {
      await addToOutbox('HOSPITAL_UPDATE', { id: targetHubId, ...hospitalPayload });
      notifyToast({ title: 'Queued for sync', message: `Auto-billing ${newAutoBill ? 'enabled' : 'disabled'} — will sync when connection is restored.` }, 'info');
      setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      return;
    }

    try {
      await apiClient.put(`/hospitals/${targetHubId}`, hospitalPayload);
      setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      notifyToast({ title: `Auto-billing ${newAutoBill ? 'enabled' : 'disabled'}`, message: newAutoBill ? 'Invoices will now be generated automatically on appointment completion.' : 'Automatic invoice generation has been turned off.' }, newAutoBill ? 'success' : 'info');
    } catch (err) {
      console.error('[FINANCE] Auto-billing toggle failed', err);
      if (!err.response) {
        await addToOutbox('HOSPITAL_UPDATE', { id: targetHubId, ...hospitalPayload });
        notifyToast({ title: 'Network error', message: 'Billing setting queued in offline outbox.' }, 'warning');
        setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      } else {
        notifyToast({ title: 'Save failed', message: 'Could not update billing settings. Please try again.' }, 'error');
      }
    }
  };
  
  const handlePrintThermal = async (invInput = null) => {
    const inv = invInput || selectedInvoice;
    if (!inv) return;

    // 72mm thermal paper is ~32 monospace chars wide, so verbose
    // modality names like MAMMOGRAPHY blow the line. Use short
    // codes that match what radiologists and patients already
    // recognise from referral pads.
    const shortMod = (m) => {
      const k = String(m || '').toUpperCase();
      return ({
        CT: 'CT', MRI: 'MRI',
        'X-RAY': 'XR',
        ULTRASOUND: 'US', USG: 'US',
        MAMMOGRAPHY: 'MG', MG: 'MG',
        DEXA: 'DX', PET: 'PT', NUCLEAR: 'NM',
      }[k] || (k ? k.substring(0, 3) : ''));
    };

    const items = inv.items || [];

    // Per-modality subtotal so the patient can verify the bill
    // against what they walked in for. Only renders below when
    // 2+ modalities are present.
    const modAgg = new Map();
    for (const it of items) {
      const m = String(it.modality || it.Modality || 'OTHER').toUpperCase() || 'OTHER';
      const subtotal = (Number(it.amount) || 0) * (Number(it.quantity) || 0);
      const cur = modAgg.get(m) || { modality: m, subtotal: 0, count: 0 };
      cur.subtotal += subtotal;
      cur.count    += 1;
      modAgg.set(m, cur);
    }
    const modRows = [...modAgg.values()].sort((a, b) => b.subtotal - a.subtotal);

    // ── Silent ESC/POS path ──────────────────────────────────────────────────
    // When a thermal printer is configured (Configuration → Printing & Devices)
    // print the receipt as raw ESC/POS — silent, auto paper-cut, optional
    // cash-drawer, 58/80mm. Works in the desktop app (USB/network) and in
    // Chrome/Edge (Web Serial / WebUSB). Any failure falls through to the HTML
    // print slip below so a receipt always comes out.
    const r = await printThermalReceipt({
      clinic: {
        name: activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTICS',
        address: activeCenter?.address || '',
        phone: ownerDetails?.contact || activeCenter?.contactNo || '',
        email: ownerDetails?.email || 'contact@1rad.health',
        rep: ownerDetails?.name || 'ADMINISTRATOR',
      },
      invoice: {
        displayId: inv.displayId,
        date: new Date().toLocaleDateString(),
        patientName: inv.patientName || 'N/A',
        patientId: inv.patientIdentifier || inv.patientId || 'N/A',
        refNo: inv.referrerName || inv.referenceNumber || '',
      },
      items: items.map(it => ({
        code: shortMod(it.modality || it.Modality),
        desc: it.description || '',
        qty: Number(it.quantity) || 1,
        amount: Number(it.amount) || 0,
      })),
      modalitySummary: modRows.map(row => ({ code: shortMod(row.modality), name: row.modality, subtotal: row.subtotal })),
      total: inv.totalAmount || 0,
      gross: inv.grossAmount || 0,
      discount: inv.discountAmount || 0,
      additionalCharges: inv.additionalCharges || 0,
      additionalChargesReason: inv.additionalChargesReason || '',
      // Partial-payment proof on the slip: amount paid + balance still due.
      paid: Number(inv.paidAmount) || 0,
      balance: Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0)),
      status: inv.status || 'PENDING',
      footer: ['THANK YOU FOR CHOOSING 1RAD', 'DIGITAL REPORT AT 1RAD.HEALTH'],
    });
    if (r?.ok) {
      notify?.({ type: 'success', title: 'Printed', message: 'Receipt sent to the thermal printer.' });
      return;
    }
    if (!r?.unconfigured) {
      notify?.({ type: 'warning', title: 'Thermal printer', message: `Could not print silently (${r?.error || 'error'}). Falling back to the print dialog.` });
    }

    const itemsHtml = items.map(it => {
      const code = shortMod(it.modality || it.Modality);
      const sub  = (Number(it.amount) || 0) * (Number(it.quantity) || 0);
      const prefix = code ? `[${code}] ` : '';
      // Truncate to fit alongside the modality tag — total line
      // width has to land under ~32 chars so the price doesn't
      // wrap onto the next line on a 72mm printer.
      const desc = `${prefix}${(it.description || '').substring(0, 22 - prefix.length)}`;
      return `
      <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px; font-family: monospace;">
        <span>${desc} x${it.quantity}</span>
        <span>₹${sub.toLocaleString()}</span>
      </div>
    `;
    }).join('');

    // Per-modality subtotal strip — appears just above the TOTAL
    // line so the patient sees "you paid X for the CT and Y for
    // the X-ray" before the grand total. Skip for single-modality
    // bills since the table already shows it.
    const modalitySummaryHtml = modRows.length > 1 ? `
      <div class="divider"></div>
      <div style="font-size: 10px; font-weight: bold; margin-bottom: 4px;">BY MODALITY</div>
      ${modRows.map(r => `
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; font-family: monospace;">
          <span>${shortMod(r.modality)} - ${r.modality.substring(0, 14)}</span>
          <span>₹${Math.round(r.subtotal).toLocaleString()}</span>
        </div>
      `).join('')}
    ` : '';

    ghostPrint(`
      <html>
        <head>
          <title>Thermal Receipt</title>
          <style>
            body { font-family: 'monospace'; width: 72mm; padding: 10px; margin: 0; color: #000; }
            .center { text-align: center; }
            .divider { border-top: 1px dashed #000; margin: 10px 0; }
            .bold { font-weight: bold; }
            .header-text { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
            .sub-text { font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="header-text">${(activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTICS').toUpperCase()}</div>
            <div class="sub-text">${activeCenter?.address || ''}</div>
            <div class="sub-text">TEL: ${ownerDetails?.contact || activeCenter?.contactNo || '+91 XXXXXXXXXX'} | EMAIL: ${ownerDetails?.email || 'contact@1rad.health'}</div>
            <div class="sub-text" style="font-weight: bold; margin-top: 2px;">REPRESENTATIVE: ${ownerDetails?.name || 'ADMINISTRATOR'}</div>
          </div>
          <div class="divider"></div>
          <div style="font-size: 11px;">
            <div>INV: ${inv.displayId}</div>
            <div>DATE: ${new Date().toLocaleDateString()}</div>
            <div class="bold">PATIENT: ${(inv.patientName || 'N/A').toUpperCase()}</div>
            <div>PATIENT ID: ${inv.patientIdentifier || inv.patientId || 'N/A'}</div>
            <div>REF. NO: ${inv.referrerName || inv.referenceNumber || 'N/A'}</div>
          </div>
          <div class="divider"></div>
          <div class="center" style="font-size: 10px; font-weight: bold; margin-bottom: 4px;">SERVICES BILLED</div>
          ${itemsHtml}
          ${modalitySummaryHtml}
          <div class="divider"></div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px;">
            <span>TOTAL</span>
            <span>₹${(inv.totalAmount || 0).toLocaleString()}</span>
          </div>
          ${(Number(inv.paidAmount) || 0) > 0 && ((Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0)) > 0.01 ? `
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-family: monospace; margin-top: 5px;">
            <span>PAID</span><span>₹${(Number(inv.paidAmount) || 0).toLocaleString()}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; font-family: monospace;">
            <span>BALANCE DUE</span><span>₹${Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0)).toLocaleString()}</span>
          </div>
          <div class="center" style="font-size: 10px; font-weight: bold; margin-top: 6px;">** PART PAYMENT - BALANCE DUE **</div>
          ` : ''}
          <div class="divider"></div>
          <div class="center" style="margin-top: 15px; font-size: 10px; font-weight: bold;">
            THANK YOU FOR CHOOSING 1RAD<br/>
            DIGITAL REPORT AT 1RAD.HEALTH
          </div>
          <div class="center" style="font-size: 8px; color: #555; margin-top: 15px; font-weight: bold; font-family: monospace; letter-spacing: 1px;">1RAD POWERED BY NEXEAGLE</div>
        </body>
      </html>
    `);
  };

  const handleToggleExpenseStatus = async (id, currentStatus) => {

    const newStatus = currentStatus === 'PAID' ? 'UNPAID' : 'PAID';
    try {
      await apiClient.put(`/finance/expenses/${id}/status`, { status: newStatus });
      refreshAllFinancialData();
    } catch (err) {
      console.error('[FINANCE] Status transition failed', err);
      const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Could not update expense status.';
      notify({ type: 'error', message: errorMsg });
    }
  };

  // Direct status setter — lets the ledger drop-down pick any status
  // (Draft / Pending / Approved / Paid) instead of just toggling.
  const handleSetExpenseStatus = async (id, newStatus) => {
    console.log(`[FINANCE] Setting expense ${id} status → ${newStatus}`);
    
    if (!isOnline) {
      await addToOutbox('EXPENSE_STATUS_UPDATE', { id, status: newStatus });
      notify({ type: 'info', title: 'Offline', message: 'Expense status update queued.' });
      // We don't have optimistic UI for this yet, so we just wait for sync
      return;
    }

    try {
      const resp = await apiClient.put(`/finance/expenses/${id}/status`, { status: newStatus });
      console.log('[FINANCE] Status update OK:', resp.status, resp.data);
      refreshAllFinancialData();
    } catch (err) {
      console.error('[FINANCE] Status transition failed', err);
      if (!err.response) {
        await addToOutbox('EXPENSE_STATUS_UPDATE', { id, status: newStatus });
        notify({ type: 'info', title: 'No connection', message: 'Status update added to offline queue.' });
      } else {
      const status = err.response?.status;
      const data = err.response?.data;
      const errorMsg = data?.message || data?.error || data?.title || err.message || 'Could not update expense status.';
      notify({
        type: 'error',
        title: `Failed to set status to "${newStatus}"${status ? ` (HTTP ${status})` : ''}`,
        message: errorMsg,
      });
      }
    }
  };

  // Write off a referrer's carried deficit (net-negative commission balance):
  // the centre absorbs it and the doctor's balance returns to zero. Records a
  // clearly-labelled offsetting commission entry via the batch endpoint.
  const handleWriteOffDeficit = (partner) => {
    const referrerId = partner?.cuts?.find(c => c.referrerId)?.referrerId;
    // Use the referrer's TRUE all-time net (not the filtered card total) — a
    // date filter must never make us write off the wrong amount.
    const net = (combinedReferralCuts || [])
      .filter(c => c.referrerId === referrerId)
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const deficit = net < 0 ? Math.abs(net) : 0;
    if (!referrerId || deficit <= 0) {
      notify({ type: 'warning', message: 'No recoverable deficit to write off for this referrer (their all-time balance is not negative).' });
      return;
    }
    confirmModal({
      title: `Write off ₹${deficit.toLocaleString()} deficit?`,
      message: `${partner.name || 'This referrer'} currently owes ₹${deficit.toLocaleString()}. Writing it off means the centre absorbs the loss and the referrer's balance returns to zero. This cannot be undone.`,
      confirmText: 'Write off',
      danger: true,
      onConfirm: async () => {
        const payload = {
          referrerId,
          remarks: `DEFICIT WRITE-OFF (₹${deficit}) — centre absorbed`,
          lines: [{ modality: 'WRITE-OFF', amount: deficit, status: 'PAID' }],
        };

        if (!isOnline) {
          await addToOutbox('PAYOUT_BATCH', payload);
          notify({ type: 'info', title: 'Offline', message: 'Write-off queued for sync.' });
          // Optimistic UI could go here, but for now we just rely on the sync pull
          return;
        }

        try {
          await apiClient.post('/referrers/commissions/batch', payload);
          notify({ type: 'success', title: 'Written off', message: `₹${deficit.toLocaleString()} deficit cleared for ${partner.name || 'referrer'}.` });
          refreshAllFinancialData();
        } catch (err) {
          console.error('[FINANCE] Deficit write-off failed', err);
          if (!err.response) {
            await addToOutbox('PAYOUT_BATCH', payload);
            notify({ type: 'info', title: 'No connection', message: 'Write-off added to offline queue.' });
          } else {
            notify({ type: 'error', message: 'Could not write off the deficit.' });
          }
        }
      },
    });
  };

  const handleSavePayout = async (e) => {
    e.preventDefault();
    if (!editPayout.referrerId) {
      notify({ type: 'warning', message: 'Please select a referrer before saving.' });
      return;
    }

    // Single-line REVISE of one existing commission keeps the legacy single endpoint.
    const isSingle = !!editPayout.commissionId;

    // Reverting an already-PAID commission to UNPAID is sensitive (money already
    // handed over) — it must go through admin approval, not a silent edit here.
    // Send them to the dedicated guard (Referral Hub → tap the PAID badge →
    // Request approval, which captures a reason and routes to Finance → Approvals).
    if (isSingle && editPayout.originalStatus === 'PAID' && (editPayout.status || 'UNPAID') !== 'PAID') {
      notify({
        type: 'warning',
        title: 'NEEDS APPROVAL',
        message: 'To revert a paid commission to UNPAID, tap its PAID badge on the payout and Request approval — it needs admin sign-off with a reason.',
      });
      return;
    }

    // Normalise the drawer's service lines (mirrors PayoutDrawer's derivation so
    // saving works whether or not the user touched the line editor).
    const rawLines = Array.isArray(editPayout.lines) && editPayout.lines.length > 0
      ? editPayout.lines
      : [{ modality: editPayout.modality || 'MRI', amount: editPayout.amount, status: editPayout.status || 'UNPAID', appointmentServiceId: editPayout.appointmentServiceId || null, serviceAmount: editPayout.serviceAmount || 0 }];

    const lines = rawLines
      .map(l => ({
        commissionId: l.commissionId || null,
        modality: l.modality || 'MRI',
        amount: l.amount === '' || l.amount === null || l.amount === undefined ? 0 : Number(l.amount),
        status: l.status || 'UNPAID',
        appointmentServiceId: l.appointmentServiceId || null,
        serviceAmount: parseFloat(l.serviceAmount) || 0,
      }))
      .filter(l => Number.isFinite(l.amount) && l.amount >= 0);

    if (!isSingle && lines.length === 0) {
      notify({ type: 'warning', message: 'Enter an amount for at least one service line.' });
      return;
    }

    // Anti-fraud cap: a referral commission may EQUAL but never EXCEED the
    // service charge it was earned on. Editing it above the service amount
    // creates a financial discrepancy. Lines with no known service amount
    // (serviceAmount = 0) are skipped.
    const inflated = lines.find(l => l.serviceAmount > 0 && l.amount > l.serviceAmount);
    if (inflated) {
      notify({
        type: 'warning',
        title: 'PAYOUT LIMIT',
        message: `Commission for ${inflated.modality} cannot exceed the service amount of ₹${inflated.serviceAmount.toLocaleString()}.`,
      });
      return;
    }

    // ── Edits to a recorded commission need admin sign-off ───────────────────
    // The single-line revise targets ONE existing commission; route the change
    // to Finance → Approvals with a mandatory reason instead of applying it
    // directly. (Batch recording of a brand-new payout below still applies now.)
    if (isSingle || editPayout.approvalEdit) {
      const reason = String(editPayout.approvalReason || '').trim();
      if (reason.length < 4) {
        notify({ type: 'warning', title: 'REASON REQUIRED', message: 'Enter a short reason for this payout change — edits to a recorded payout need admin approval.' });
        return;
      }
      
      const approvals = isSingle
        ? [{
            type: 'EDIT_COMMISSION',
            title: `Payout edit — ${editPayout.referrerName || ''} · ₹${Number(editPayout.amount) || 0} ${editPayout.modality || ''}`.trim(),
            appointmentId: editPayout.appointmentId || null,
            payload: JSON.stringify({ commissionId: editPayout.commissionId, amount: Number(editPayout.amount) || 0, modality: editPayout.modality || '', status: editPayout.status || 'UNPAID', remarks: editPayout.remarks || '' }),
            reason,
          }]
        : lines.filter(line => line.commissionId).map(line => ({
            type: 'EDIT_COMMISSION',
            title: `Payout edit — ${editPayout.referrerName || ''} · ₹${line.amount.toLocaleString()} ${line.modality}`.trim(),
            appointmentId: editPayout.appointmentId || null,
            payload: JSON.stringify({ commissionId: line.commissionId, amount: line.amount, modality: line.modality, status: line.status, remarks: editPayout.remarks || '' }),
            reason,
          }));

      if (approvals.length === 0) {
        notify({ type: 'warning', title: 'NO PAYOUT FOUND', message: 'There is no recorded payout to revise for this invoice.' });
        return;
      }

      if (!isOnline) {
        await Promise.all(approvals.map(approval => addToOutbox('APPROVAL_CREATE', approval)));
        notify({ type: 'info', title: 'Offline', message: 'Approval request added to offline queue.' });
        setIsPayoutDrawerOpen(false);
        return;
      }
      try {
        setIsSavingPayout(true);
        await Promise.all(approvals.map(approval => apiClient.post('/approvals', approval)));
        window.dispatchEvent(new Event('1rad_approvals_changed'));   // refresh the nav badge
        notify({ type: 'success', title: 'Sent for approval', message: 'The payout change will apply once an admin approves it.' });
        setIsPayoutDrawerOpen(false);
      } catch (err) {
        console.error('[PAYOUT] approval request failed', err);
        if (!err.response) {
          await addToOutbox('APPROVAL_CREATE', approvalPayload);
          notify({ type: 'info', title: 'No connection', message: 'Approval request added to offline queue.' });
          setIsPayoutDrawerOpen(false);
        } else {
          notify({ type: 'error', message: 'Could not send the change for approval. Please try again.' });
        }
      } finally {
        setIsSavingPayout(false);
      }
      return;
    }

    const singlePayload = {
      referrerId: editPayout.referrerId,
      amount: parseFloat(editPayout.amount),
      modality: editPayout.modality,
      referenceNumber: editPayout.invoiceId,
      remarks: editPayout.remarks,
      status: editPayout.status || 'UNPAID'
    };

    const batchPayload = {
      referrerId: editPayout.referrerId,
      referenceNumber: editPayout.invoiceId,
      remarks: editPayout.remarks,
      patientName: editPayout.patientName || null,
      appointmentId: editPayout.appointmentId || null,
      lines
    };

    // Stable key shared by the online call + outbox fallback so a lost-response
    // retry can't double-record the payout / commission batch.
    const idemKey = crypto.randomUUID();
    if (!isOnline) {
      if (isSingle) {
        await addToOutbox('PAYOUT_UPDATE', { ...singlePayload, commissionId: editPayout.commissionId }, idemKey);
      } else {
        await addToOutbox('PAYOUT_BATCH', batchPayload, idemKey);
      }
      notify({ type: 'info', title: 'Offline', message: 'Payout will sync when reconnected.' });
      setIsPayoutDrawerOpen(false);
      return;
    }

    try {
      setIsSavingPayout(true);

      if (isSingle) {
        await apiClient.put(`/referrers/commissions/${editPayout.commissionId}`, {
          ...singlePayload,
          commissionId: editPayout.commissionId
        }, { headers: { 'Idempotency-Key': idemKey } });
      } else {
        // Per-service payout — one commission row per service line.
        await apiClient.post('/referrers/commissions/batch', batchPayload, { headers: { 'Idempotency-Key': idemKey } });
      }

      setIsPayoutDrawerOpen(false);
      refreshAllFinancialData();
    } catch (err) {
      console.error('[PAYOUT] Transaction failure:', err);
      if (!err.response) {
        if (isSingle) {
          await addToOutbox('PAYOUT_UPDATE', { ...singlePayload, commissionId: editPayout.commissionId }, idemKey);
        } else {
          await addToOutbox('PAYOUT_BATCH', batchPayload, idemKey);
        }
        notify({ type: 'info', title: 'No connection', message: 'Payout added to offline queue.' });
        setIsPayoutDrawerOpen(false);
      } else {
        notify({ type: 'error', message: 'Could not save payout.' });
      }
    } finally {
      setIsSavingPayout(false);
    }
  };

  // Internal deletion logic — no confirmation here. Use deleteExpenseConfirm()
  // for the single-row UX, or pass { skipConfirm: true } from bulk callers.
  const performDeleteExpense = async (id, options = {}) => {
    if (!isOnline) {
      await addToOutbox('EXPENSE_DELETE', { id });
      if (!options.skipConfirm) notify({ type: 'info', title: 'Offline', message: 'Deletion will sync when reconnected.' });
      setExpenses(prev => prev.filter(e => e.id !== id));
      return;
    }
    try {
      await apiClient.delete(`/finance/expenses/${id}`);
      refreshAllFinancialData();
    } catch (err) {
      console.error('[FINANCE] Failed to delete expense', err);
      if (!err.response) {
        await addToOutbox('EXPENSE_DELETE', { id });
        if (!options.skipConfirm) notify({ type: 'info', title: 'No connection', message: 'Deletion queued.' });
        setExpenses(prev => prev.filter(e => e.id !== id));
      } else if (!options.skipConfirm) {
        notify({ type: 'error', message: 'Could not delete expense.' });
      }
    }
  };

  const handleDeleteExpense = (id, options = {}) => {
    if (options.skipConfirm) {
      // Bulk callers handle their own batched confirm.
      return performDeleteExpense(id, options);
    }
    confirmModal({
      title: 'Delete this expense?',
      message: 'This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
      onConfirm: () => performDeleteExpense(id, options),
    });
  };

  const handleToggleCommissionStatus = async (id, currentStatus) => {
    // '__SKIP__' is used by the disbursement form which has already sent its own PATCH;
    // we just need to refresh the data here without sending a duplicate request.
    if (currentStatus === '__SKIP__') {
      refreshAllFinancialData();
      return;
    }
    const newStatus = currentStatus === 'PAID' ? 'UNPAID' : 'PAID';
    
    if (!isOnline) {
      await addToOutbox('PAYOUT_STATUS_UPDATE', { id, status: newStatus });
      notify({ type: 'info', title: 'Offline', message: 'Commission status update queued.' });
      return;
    }

    try {
      await apiClient.patch(`/referrers/commissions/${id}/status`, { status: newStatus });
      refreshAllFinancialData();
    } catch (err) {
      console.error('[FINANCE] Commission transition failed', err);
      if (!err.response) {
        await addToOutbox('PAYOUT_STATUS_UPDATE', { id, status: newStatus });
        notify({ type: 'info', title: 'No connection', message: 'Commission status update added to offline queue.' });
      } else {
        notify({ type: 'error', message: 'Could not update commission status.' });
      }
    }
  };

  const handleDeleteInvoice = async (id, commissionId) => {
    if (!isOnline) {
      await addToOutbox('INVOICE_DELETE', { id, commissionId });
      notify({ type: 'info', title: 'Offline', message: 'Invoice deletion queued.' });
      setInvoices(prev => prev.filter(inv => inv.invoiceId !== id)); // Optimistic UI
      return;
    }

    try {
      const url = commissionId ? `/finance/invoices/${id}?commissionId=${commissionId}` : `/finance/invoices/${id}`;
      await apiClient.delete(url);
      refreshAllFinancialData();
    } catch (err) {
      console.error('[FINANCE] Failed to delete invoice', err);
      if (!err.response) {
        await addToOutbox('INVOICE_DELETE', { id, commissionId });
        notify({ type: 'info', title: 'No connection', message: 'Deletion added to offline queue.' });
        setInvoices(prev => prev.filter(inv => inv.invoiceId !== id)); // Optimistic UI
      } else {
        const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Could not delete invoice.';
        notify({ type: 'error', message: errorMsg });
      }
    }
  };

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

  const handleSyncLegacyData = async () => {
    const legacy = JSON.parse(localStorage.getItem('1rad_invoices') || '[]');
    if (legacy.length === 0) return notify({ type: 'info', message: 'No legacy data detected in browser.' });
    
    setIsSyncing(true);
    try {
      // Map legacy format to API format
      const payload = legacy.map(inv => ({
        invoiceId: inv.invoiceId,
        patientName: inv.patientName,
        totalAmount: inv.totalAmount,
        status: inv.status,
        createdAt: inv.createdAt,
        items: inv.items.map(it => ({
          description: it.description,
          amount: it.amount,
          quantity: it.quantity
        }))
      }));

      await apiClient.post('/finance/sync', { invoices: payload });
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

  // Excel export — client-side so we can include the multi-service
  // line items, per-modality breakdown, and referral-cut detail
  // exactly as the UI shows them. Layout:
  //
  //   Sheet 1 "Invoices"     — one row per invoice (visit-level rollup).
  //   Sheet 2 "Line Items"   — one row per InvoiceItem, with modality
  //                            and service back-fill so analysts can
  //                            pivot revenue by modality / service.
  //   Sheet 3 "Modality Mix" — aggregate by modality across the
  //                            filtered set (count, billed, paid,
  //                            pending).
  //   Sheet 4 "Stats Summary"— the same headline numbers the KPI
  //                            cards show, so the export reads like
  //                            the page.
  const handleExportData = async () => {
    try {
      const { start, end } = exportDates;
      const useRange = exportMode === 'RANGE' && (start || end);

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
      const fmtDate = (iso) => {
        if (!iso) return '';
        const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
        const d = new Date(hasTz ? iso : iso + 'Z');
        if (Number.isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
      };
      const inRange = (iso) => {
        if (!useRange || !iso) return !useRange;
        const d = fmtDate(iso);
        if (start && d < start) return false;
        if (end   && d > end)   return false;
        return true;
      };

      // Scope: if the user picked a date range, honour it; otherwise
      // export every cached invoice (the same set the page shows).
      const safeInvoices = (invoices || []).filter(inv => {
        if (!inv) return false;
        if (!useRange) return true;
        return inRange(inv.createdAt);
      });

      // Sheet 1 — visit-level invoice rollup. Includes everything the
      // operator sees in the ledger row plus the modality short-list
      // and per-stage counts derived from items[].
      const invoiceRows = safeInvoices.map(inv => {
        const items = inv.items || [];
        const modalities = [...new Set(items.map(it => it.modality || it.Modality).filter(Boolean))];
        const services   = items.map(it => `${it.description}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`);
        const grossLines = items.reduce((s, it) => s + (Number(it.amount) || 0) * (Number(it.quantity) || 0), 0);
        return {
          'Invoice ID': inv.displayId ?? '',
          'Patient Name': inv.patientName ?? '',
          'Patient ID': inv.patientIdentifier ?? '',
          'Referred By': inv.referrerName ?? '',
          'Modalities (all)': modalities.join(' | ') || (inv.modality || ''),
          'Service Count': items.length,
          'Services (all)': services.join(' | '),
          'Gross Amount':   Number(inv.grossAmount) || grossLines,
          'Discount':       Number(inv.discountAmount) || 0,
          'Total Payable':  Number(inv.totalAmount)  || 0,
          'Paid Amount':    Number(inv.paidAmount)   || 0,
          'Balance':        Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0)),
          'Referral Cut':   Number(inv.commissionAmount) || 0,
          'Net Centre Income': (Number(inv.totalAmount) || 0) - (Number(inv.commissionAmount) || 0),
          'Status':       inv.status ?? '',
          'Created At':   fmtDateTime(inv.createdAt),
          'Service Date': fmtDate(inv.serviceDate || inv.createdAt),
        };
      });

      // ── Premium design tokens — matches Referral export style ─────────────
      const HDR_BG = 'FF1E293B'; // Dark slate header
      const TOT_BG = 'FF334155'; // Lighter slate totals
      const ALT_BG = 'FFF8FAFC'; // Off-white alternate rows
      const DEF_FG = 'FF1E293B'; // Near-black body text
      const BDR    = 'FFE2E8F0'; // Light slate border

      const thin    = { style: 'thin',   color: { rgb: BDR } };
      const medium  = { style: 'medium', color: { rgb: 'FF94A3B8' } };
      const borders = { top: thin, bottom: thin, left: thin, right: thin };

      const hdrStyle = {
        fill: { patternType: 'solid', fgColor: { rgb: HDR_BG } },
        font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 10, name: 'Calibri' },
        border: borders,
        alignment: { vertical: 'center' },
      };
      const totStyle = {
        fill: { patternType: 'solid', fgColor: { rgb: TOT_BG } },
        font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 13, name: 'Calibri' },
        border: { ...borders, top: medium },
        alignment: { vertical: 'center' },
      };
      const mkRow = (bg, fg) => ({
        fill: { patternType: 'solid', fgColor: { rgb: bg } },
        font: { color: { rgb: fg }, sz: 10, name: 'Calibri' },
        border: borders,
        alignment: { vertical: 'center' },
      });

      const applySheet = (ws, numCols, numDataRows, hasTotalsRow = false) => {
        ws['!rows'] = ws['!rows'] || [];
        // Header row
        for (let C = 0; C < numCols; C++) {
          const ref = XLSX.utils.encode_cell({ c: C, r: 0 });
          if (ws[ref]) ws[ref].s = hdrStyle;
        }
        ws['!rows'][0] = { hpt: 22 };
        // Data rows — zebra
        for (let R = 1; R <= numDataRows; R++) {
          const bg = R % 2 === 0 ? ALT_BG : 'FFFFFFFF';
          for (let C = 0; C < numCols; C++) {
            const ref = XLSX.utils.encode_cell({ c: C, r: R });
            if (ws[ref]) ws[ref].s = mkRow(bg, DEF_FG);
          }
        }
        // Totals row (last row if hasTotalsRow)
        if (hasTotalsRow) {
          const totIdx = numDataRows + 1;
          for (let C = 0; C < numCols; C++) {
            const ref = XLSX.utils.encode_cell({ c: C, r: totIdx });
            if (!ws[ref]) ws[ref] = { t: 's', v: '' };
            ws[ref].s = totStyle;
          }
          ws['!rows'][totIdx] = { hpt: 30 };
        }
      };

      const wb = XLSX.utils.book_new();

      // ── Sheet 1: Invoices ────────────────────────────────────────────────
      // Compute totals for footer row
      const invTotals = safeInvoices.reduce((acc, inv) => {
        acc.gross   += Number(inv.grossAmount)      || 0;
        acc.disc    += Number(inv.discountAmount)   || 0;
        acc.total   += Number(inv.totalAmount)      || 0;
        acc.paid    += Number(inv.paidAmount)       || 0;
        acc.balance += Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0));
        acc.ref     += Number(inv.commissionAmount) || 0;
        return acc;
      }, { gross: 0, disc: 0, total: 0, paid: 0, balance: 0, ref: 0 });

      const invoiceRowsWithFooter = [
        ...invoiceRows,
        {},
        {
          'Invoice ID': 'TOTALS',
          'Gross Amount': Math.round(invTotals.gross),
          'Discount':     Math.round(invTotals.disc),
          'Total Payable':Math.round(invTotals.total),
          'Paid Amount':  Math.round(invTotals.paid),
          'Balance':      Math.round(invTotals.balance),
          'Referral Cut': Math.round(invTotals.ref),
          'Net Centre Income': Math.round(invTotals.total - invTotals.ref),
        },
      ];

      const ws1 = XLSX.utils.json_to_sheet(invoiceRowsWithFooter);
      ws1['!cols'] = [
        { wch: 14 }, { wch: 26 }, { wch: 14 }, { wch: 22 }, { wch: 22 },
        { wch: 8  }, { wch: 40 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
        { wch: 14 }, { wch: 18 },
        { wch: 10 }, { wch: 22 }, { wch: 12 },
      ];
      applySheet(ws1, 17, invoiceRows.length, true);
      XLSX.utils.book_append_sheet(wb, ws1, 'Invoices');

      // ── Sheet 2: Line Items ──────────────────────────────────────────────
      const itemRows = [];
      for (const inv of safeInvoices) {
        const items = inv.items || [];
        for (const it of items) {
          const qty   = Number(it.quantity) || 0;
          const rate  = Number(it.amount)   || 0;
          const sub   = qty * rate;
          itemRows.push({
            'Invoice ID':   inv.displayId ?? '',
            'Patient Name': inv.patientName ?? '',
            'Referred By':  inv.referrerName ?? '',
            'Modality':     String(it.modality || it.Modality || '').toUpperCase(),
            'Service':      it.description ?? '',
            'Quantity':     qty,
            'Rate':         rate,
            'Subtotal':     sub,
            'Invoice Status': inv.status ?? '',
            'Created At':   fmtDateTime(inv.createdAt),
            'Service Date': fmtDate(inv.serviceDate || inv.createdAt),
          });
        }
      }
      if (itemRows.length > 0) {
        const ws2 = XLSX.utils.json_to_sheet(itemRows);
        ws2['!cols'] = [
          { wch: 14 }, { wch: 26 }, { wch: 22 }, { wch: 14 },
          { wch: 36 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
          { wch: 12 }, { wch: 22 }, { wch: 12 },
        ];
        applySheet(ws2, 11, itemRows.length);
        XLSX.utils.book_append_sheet(wb, ws2, 'Line Items');
      }

      // ── Sheet 3: Modality Mix ────────────────────────────────────────────
      const byMod = new Map();
      for (const inv of safeInvoices) {
        const items = inv.items || [];
        const total = Number(inv.totalAmount) || 0;
        const paid  = Number(inv.paidAmount)  || 0;
        const itemsSubtotal = items.reduce((s, it) => s + (Number(it.amount) || 0) * (Number(it.quantity) || 0), 0);
        // Scale factor pro-rates the invoice's total / paid across its
        // items so any discount baked into totalAmount distributes
        // proportionally. Falls back to even split if no item amounts.
        const realisation = total > 0 ? paid / total : 0;
        for (const it of items) {
          const lineSub = (Number(it.amount) || 0) * (Number(it.quantity) || 0);
          const lineBilled = itemsSubtotal > 0 ? (lineSub / itemsSubtotal) * total : (total / Math.max(1, items.length));
          const linePaid   = lineBilled * realisation;
          const m = String(it.modality || it.Modality || 'OTHER').toUpperCase() || 'OTHER';
          const row = byMod.get(m) || { Modality: m, 'Service Lines': 0, 'Billed': 0, 'Paid': 0, 'Pending': 0 };
          row['Service Lines'] += 1;
          row['Billed']        += lineBilled;
          row['Paid']          += linePaid;
          row['Pending']       += Math.max(0, lineBilled - linePaid);
          byMod.set(m, row);
        }
      }
      const modalityRows = [...byMod.values()]
        .sort((a, b) => b['Billed'] - a['Billed'])
        .map(r => ({
          Modality: r.Modality,
          'Service Lines': r['Service Lines'],
          'Billed': Math.round(r['Billed']),
          'Paid':   Math.round(r['Paid']),
          'Pending':Math.round(r['Pending']),
          'Realisation %': r['Billed'] > 0 ? Math.round((r['Paid'] / r['Billed']) * 100) : 0,
        }));
      if (modalityRows.length > 0) {
        const ws3 = XLSX.utils.json_to_sheet(modalityRows);
        ws3['!cols'] = [
          { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
        ];
        applySheet(ws3, 6, modalityRows.length);
        XLSX.utils.book_append_sheet(wb, ws3, 'Modality Mix');
      }

      // ── Sheet 4: Stats Summary ───────────────────────────────────────────
      const statsRows = [
        { Metric: 'Total Revenue',     Value: Math.round(liveStats?.totalRevenue   || 0) },
        { Metric: 'Total Billed',      Value: Math.round(liveStats?.totalBilled    || 0) },
        { Metric: 'Pending Revenue',   Value: Math.round(liveStats?.pendingRevenue || 0) },
        { Metric: 'Pending Invoices',  Value: liveStats?.pendingCount || 0 },
        { Metric: 'Realisation %',     Value: liveStats?.realizationRate || 0 },
        { Metric: 'Average Ticket',    Value: Math.round(liveStats?.averageTicket  || 0) },
        { Metric: 'Total Discount',    Value: Math.round(liveStats?.totalDiscount  || 0) },
        { Metric: 'Total Commission',  Value: Math.round(liveStats?.totalCommission|| 0) },
        { Metric: 'Net Profit',        Value: Math.round(liveStats?.netProfit      || 0) },
        { Metric: '', Value: '' },
        { Metric: 'Export Range Start', Value: useRange && start ? start : 'All time' },
        { Metric: 'Export Range End',   Value: useRange && end   ? end   : 'All time' },
        { Metric: 'Invoices in Export', Value: invoiceRows.length },
        { Metric: 'Line Items',         Value: itemRows.length },
        { Metric: 'Exported At',        Value: fmtDateTime(new Date().toISOString()) },
      ];
      const ws4 = XLSX.utils.json_to_sheet(statsRows);
      ws4['!cols'] = [{ wch: 22 }, { wch: 22 }];
      applySheet(ws4, 2, statsRows.length);
      XLSX.utils.book_append_sheet(wb, ws4, 'Stats Summary');

      const fname = useRange && (start || end)
        ? `1Rad_Financials_${start || 'start'}_to_${end || 'end'}.xlsx`
        : `1Rad_Financials_${new Date().toISOString().split('T')[0]}.xlsx`;
        
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      a.click();
      window.URL.revokeObjectURL(url);

      setIsExportDrawerOpen(false);
    } catch (err) {
      console.error('[FINANCE] Export failed', err);
      notifyToast('Could not export data. Please try again.', 'error');
    }
  };

  const filteredInvoices = useMemo(() => {
    const today = getIstDateStr(new Date().toISOString());
    const safeInvoices = invoices || [];
    const safeApps = appointments || [];
    const appointmentById = new Map(
      safeApps
        .filter(app => app?.appointmentId)
        .map(app => [app.appointmentId, app])
    );
    
    return safeInvoices.filter(inv => {
      if (!inv) return false;
      // Search Filter — patient, invoice no., referred-by, modality and any
      // service/test name on the bill (Scenario 08).
      const q = searchTerm.trim().toLowerCase();
      if (q) {
        const searchHay = [
          inv.patientName,
          inv.displayId,
          inv.referrerName,
          inv.modality,
          ...((inv.items || []).map(it => it.description)),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchHay.includes(q)) return false;
      }

      // Status Filter. "PENDING" means "still owes money" — so it includes
      // PARTIAL invoices (part-paid, balance outstanding), which is exactly the
      // list a biller works to collect the remainder from.
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'PENDING') {
          if (inv.status !== 'PENDING' && inv.status !== 'PARTIAL') return false;
        } else if (inv.status !== statusFilter) {
          return false;
        }
      }

      // Approval Filter — only invoices with a request still awaiting admin sign-off.
      if (approvalFilter === 'AWAITING') {
        const ap = approvalForInvoice(approvalMap, inv);
        if (!ap || ap.status !== 'PENDING') return false;
      }

      // Time Filter Logic - Respect Appointment Schedule for categorization
      const linkedApp = appointmentById.get(inv.appointmentId);
      const appDateStr = linkedApp ? (linkedApp.date || (linkedApp.dateTime ? linkedApp.dateTime.split('T')[0] : null)) : null;
      const invDateStr = inv.createdAt ? getIstDateStr(inv.createdAt) : null;
      
      const targetDate = appDateStr || invDateStr;

      if (timeFilter === 'TODAY' && targetDate !== today) return false;
      if (timeFilter === 'PAST' && targetDate >= today) return false;
      if (timeFilter === 'FUTURE' && targetDate <= today) return false;
      if (timeFilter === 'CUSTOM') {
          if (startDate && targetDate < startDate) return false;
          if (endDate && targetDate > endDate) return false;
      }
      
      // Modality Filter
      if (modalityFilter !== 'ALL' && inv.modality !== modalityFilter) return false;

      return true;
    }).sort((a, b) => {
      if (!sortConfig.key) return 0;
      const valA = sortConfig.key === 'date' ? a.createdAt : a[sortConfig.key];
      const valB = sortConfig.key === 'date' ? b.createdAt : b[sortConfig.key];
      
      if (valA < valB) return sortConfig.direction === 'ASC' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'ASC' ? 1 : -1;
      return 0;
    });
  }, [invoices, appointments, searchTerm, timeFilter, statusFilter, modalityFilter, startDate, endDate, sortConfig, approvalFilter, approvalMap]);

  const futureAppointments = useMemo(() => {
    const today = getIstDateStr(new Date().toISOString());
    const safeApps = appointments || [];

    // A future appointment that's ALREADY BILLED has a real invoice, which is
    // shown in the "Pre-billed future transactions" section. Exclude it from the
    // projected "Upcoming revenue" ledger so the same visit doesn't appear in
    // BOTH (which double-counted its revenue + showed two rows when a billed
    // patient was moved from today to a future date). We key off the SAME
    // invoice set that's rendered as pre-billed, so a visit shows exactly once.
    const billedApptIds = new Set((filteredInvoices || []).map(i => i.appointmentId).filter(Boolean));

    return safeApps.filter(app => {
      const appDate = app.date || (app.dateTime ? app.dateTime.split('T')[0] : null);
      if (!appDate || appDate <= today) return false;
      if (billedApptIds.has(app.appointmentId)) return false; // already billed → pre-billed section only

      // Modality Filter — multi-service aware. Picks up a visit whose
      // ANY service line matches the chosen modality, with v1 scalar
      // fallback for rows that pre-date the multi-service rollout.
      if (!matchesAnyModality(app, modalityFilter)) return false;
      
      // Search Filter
      const matchesSearch = String(app.patientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            String(app.displayId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            String(app.referredBy || app.referrerName || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesSearch;
    }).sort((a, b) => {
        const valA = a.date || a.dateTime;
        const valB = b.date || b.dateTime;
        if (valA < valB) return sortConfig.direction === 'ASC' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ASC' ? 1 : -1;
        return 0;
    });
  }, [appointments, searchTerm, modalityFilter, sortConfig, filteredInvoices]);

  // Upcoming referral commissions — projected from FUTURE appointments that
  // carry a referrer. Real ReferralCommission rows are only created on ARRIVAL,
  // so without this a future booking's referrer payout never appears under the
  // Future tab even though its appointment/invoice does. These are optimistic
  // (UNPAID, not yet earned) and surface only under Future / All via the
  // serviceDate filter. Kept OUT of `combinedReferralCuts` so the earned-stats
  // and recorded-payout logic don't count money that hasn't been earned yet.
  const upcomingReferralCuts = useMemo(() => {
    return (futureAppointments || [])
      .filter(app => {
        const ref = String(app.referredBy || '').trim();
        return ref && ref.toLowerCase() !== 'self';
      })
      .map(app => {
        const lines = Array.isArray(app.services) ? app.services : [];
        const cut = lines.length
          ? lines.reduce((s, l) => s + (Number(l.referralCutValue ?? l.ReferralCutValue) || 0), 0)
          : (Number(app.referralCutValue) || 0);
        const when = app.dateTime || app.date;
        return {
          id: `upcoming-${app.appointmentId || app.id}`,
          date: when,
          serviceDate: when,                       // future → routed to the Future tab
          name: app.referredBy,
          description: `Upcoming commission${app.modality ? ` [${app.modality}]` : ''}`,
          reference: app.displayId || null,
          amount: cut,
          type: 'STRATEGIC',
          status: 'UNPAID',
          referrerId: app.referrerId || null,
          modality: app.modality || '',
          remarks: '',
          patientName: app.patientName || 'N/A',
          patientPaymentStatus: null,
          paymentReceived: 0,
          referrerIsDoctor: app.referrerIsDoctor !== false,
          referringDoctor: app.referredBy || null,
          appointmentId: app.appointmentId || app.id || null,
          upcoming: true,
        };
      });
  }, [futureAppointments]);

  // Canonical definitions (agreed 2026-06-14):
  //   Revenue       = NET billed (totalAmount = gross - discount), CANCELLED excluded.
  //   Realization % = collected / net billed * 100 (amount-based, capped 100).
  //   Net profit    = collected - operational expenses - commissions (cash basis).
  // `totalGross` is kept separately as the pre-discount list value.
  const liveStats = useMemo(() => {
    const safeInvoices = filteredInvoices || [];
    const active = safeInvoices.filter(inv => (inv?.status || '').toUpperCase() !== 'CANCELLED');
    const paidInvoices = active.filter(inv => inv?.status === 'PAID');
    const pendingInvoices = active.filter(inv => inv?.status === 'PENDING' || inv?.status === 'PARTIAL');

    const totalGross     = active.reduce((sum, inv) => sum + (Number(inv?.grossAmount) || 0), 0); // list / pre-discount
    const totalRevenue   = active.reduce((sum, inv) => sum + (Number(inv?.totalAmount) || 0), 0); // NET billed
    const totalCollected = active.reduce((sum, inv) => sum + (Number(inv?.paidAmount) || 0), 0);
    const pendingRevenue = active.reduce((sum, inv) => sum + Math.max(0, (Number(inv?.totalAmount) || 0) - (Number(inv?.paidAmount) || 0)), 0);
    const pendingCount = pendingInvoices.length;

    const realizationRate = totalRevenue > 0 ? Math.min(100, Math.round((totalCollected / totalRevenue) * 100)) : 0;
    const averageTicket = paidInvoices.length > 0 ? Math.round(totalCollected / paidInvoices.length) : 0;

    const totalDiscount = active.reduce((sum, inv) => sum + (Number(inv?.discountAmount) || 0), 0);
    // Referral cuts accrued on the period's billed invoices.
    const totalCommission = active.reduce((sum, inv) => sum + (Number(inv?.commissionAmount) || 0), 0);
    // Operating spend (non-referral) + referral actually paid out — surfaced for a
    // separate "net profit" view, but DELIBERATELY NOT part of "net revenue".
    const operationalExpenses = (expenses || [])
      .filter(e => e && e.category !== 'Referral' && !((e.description || '').toLowerCase().includes('referral')))
      .reduce((sum, e) => sum + (Number(e?.amount) || 0) + (Number(e?.taxAmount) || 0), 0);
    const commissionPaidOut = (referralCommissions || [])
      .filter(c => (c?.commissionStatus || c?.status || '').toUpperCase() === 'PAID')
      .reduce((sum, c) => sum + (Number(c?.payoutAmount !== undefined ? c.payoutAmount : c?.amount) || 0), 0);

    // NET REVENUE = what the centre keeps from the period's BILLING: net billed
    // (gross − discounts) minus referral cuts. Operating expenses are NOT part of
    // "net revenue" (they belong to net PROFIT), so they can never drag it
    // negative; and referral cuts can't exceed the revenue they're a cut of, so
    // this stays ≥ 0. Consistent with the gross / discounts / cuts tiles, all of
    // which are billing-based over the same (date-filtered) invoice set.
    const netRevenue = Math.max(0, totalRevenue - totalCommission);
    // Net profit (incl. operating spend + commissions paid) — for a future tile.
    const netProfit = netRevenue;

    return { totalRevenue, totalGross, totalCollected, pendingRevenue, pendingCount, realizationRate, averageTicket, totalDiscount, totalCommission, commissionPaidOut, operationalExpenses, netRevenue, netProfit, totalBilled: totalRevenue };
  }, [filteredInvoices, expenses, referralCommissions]);

  const combinedReferralCuts = useMemo(() => {
    const legacyCuts = expenses.filter(e => e && (e.category === 'Referral' || (e.description || '').toLowerCase().includes('referral'))).map(e => {
        const inv = (invoices || []).find(i => i.displayId === e.referenceNumber || i.invoiceId === e.referenceNumber);
        return {
            id: e.id,
            date: e.transactionDate,
            name: e.vendorName || 'DIRECT',
            description: e.description,
            reference: e.referenceNumber,
            amount: e.amount,
            type: 'LEGACY',
            // Honor the actual stored status; default to PAID only when missing
            // (legacy expenses are usually paid but UNPAID is a valid state).
            status: (e.status || 'PAID').toUpperCase() === 'PAID' ? 'PAID' : 'UNPAID',
            patientPaymentStatus: inv?.status ? String(inv.status).toUpperCase() : null
        };
    });
    // Derive the patient's payment status for a commission by matching it to
    // its invoice. The /referrers/commissions feed (which powers this hub) does
    // NOT carry patientPaymentStatus, so we compute it here from the invoices
    // BillingPage already holds — paid vs. total is the source of truth, with
    // any ledger-supplied value as a fallback. This is what makes the "payment
    // received" tick appear once the Revenue Hub collects from the patient.
    const derivePatientPaymentStatus = (c) => {
        const ref = c.referenceNumber || c.reference;
        const apptId = c.appointmentId || c.AppointmentId;
        const inv = (invoices || []).find(i =>
            (ref && (i.displayId === ref || i.invoiceId === ref)) ||
            (apptId && i.appointmentId === apptId)
        );
        if (inv) {
            const paid = Number(inv.paidAmount) || 0;
            const total = Number(inv.totalAmount) || 0;
            if (total > 0 && paid >= total - 0.01) return 'PAID';
            if (paid > 0) return 'PARTIAL';
            const s = String(inv.status || '').toUpperCase();
            if (s === 'PAID' || s === 'COMPLETED' || s === 'SETTLED') return 'PAID';
            if (s === 'PARTIAL') return 'PARTIAL';
            return 'PENDING';
        }
        // No invoice matched — fall back to whatever the row already carries.
        return c.patientPaymentStatus ? String(c.patientPaymentStatus).toUpperCase() : null;
    };

    const strategicCuts = referralCommissions.filter(c => c).map(c => {
        return {
            id: c.commissionId || c.id,
            date: c.payoutDate || c.transactionDate,
            // The appointment/service date — future-dated cuts are "upcoming"
            // (optimistic) rather than earned. Falls back to the transaction date.
            serviceDate: c.serviceDate || c.payoutDate || c.transactionDate,
            name: c.partnerName || c.referrerName,
            description: c.studyAndServices || `Commission [${c.modality || 'MRI'}] ${c.remarks ? `- ${c.remarks}` : ''}`,
            reference: c.referenceNumber,
            amount: c.payoutAmount !== undefined ? c.payoutAmount : c.amount,
            type: 'STRATEGIC',
            status: (c.commissionStatus || c.status || 'UNPAID').toUpperCase(),
            referrerId: c.referrerId,
            modality: c.modality || 'MRI',
            serviceName: c.serviceName || '',
            remarks: c.remarks || '',
            patientName: c.patientName || 'N/A',
            patientDisplayId: c.patientDisplayId || '',
            patientAge: c.patientAge || '',
            patientGender: c.patientGender || '',
            patientMobile: c.patientMobile || '',
            patientPaymentStatus: derivePatientPaymentStatus(c),
            paymentReceived: c.paymentReceived !== undefined ? c.paymentReceived : 0,
            // Payee-first model: the referral record (name above) IS the payee.
            // When that payee is NOT a doctor, the referring doctor is the
            // "supported by" doctor; when it IS a doctor, they are the doctor.
            referrerIsDoctor: c.referrerIsDoctor !== false,
            referringDoctor: c.referrerIsDoctor === false
              ? (c.supportedByDoctor || null)
              : (c.partnerName || c.referrerName || null),
            appointmentId: c.appointmentId || null,
        };
    });

    return [...legacyCuts, ...strategicCuts].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [expenses, referralCommissions, invoices]);

  const recordedPayouts = useMemo(() => {
    return new Set(combinedReferralCuts.map(c => c.reference).filter(Boolean));
  }, [combinedReferralCuts]);

  const todayReferralTotal = useMemo(() => {
    const today = getIstDateStr(new Date().toISOString());
    return combinedReferralCuts
      .filter(cut => {
        if (!cut.date) return false;
        try {
          return getIstDateStr(cut.date) === today;
        } catch {
          return false;
        }
      })
      .reduce((sum, cut) => sum + (Number(cut.amount) || 0), 0);
  }, [combinedReferralCuts]);

  const globalOutflow = useMemo(() => {
    const operationalExpenses = expenses.filter(e => e && e.category !== 'Referral' && !(e.description || '').toLowerCase().includes('referral')).map(e => ({
        id: e.id,
        date: e.transactionDate,
        name: e.vendorName || 'N/A',
        description: e.description,
        category: e.category,
        amount: e.amount,
        taxAmount: e.taxAmount,
        type: 'OPERATIONAL',
        status: e.status?.toUpperCase() || 'PAID'
    }));
    
    return operationalExpenses.sort((a, b) => {
        if (!sortConfig.key) return new Date(b.date) - new Date(a.date);
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA < valB) return sortConfig.direction === 'ASC' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ASC' ? 1 : -1;
        return 0;
    });
  }, [expenses, combinedReferralCuts, sortConfig]);

  const filteredOutflow = useMemo(() => {
    const today = getIstDateStr(new Date().toISOString());
    const q = expenseSearch.trim().toLowerCase();

    return globalOutflow.filter(exp => {
        if (!exp) return false;
        // Category Filter
        

        // Time Filter
        const expDate = exp.date ? getIstDateStr(exp.date) : null;
        if (timeFilter === 'TODAY' && expDate !== today) return false;
        if (timeFilter === 'PAST' && expDate === today) return false;
        if (timeFilter === 'CUSTOM') {
            if (startDate && expDate < startDate) return false;
            if (endDate && expDate > endDate) return false;
        }

        // Modality Filter alignment
        if (modalityFilter !== 'ALL') {
            // Strategic cuts have an explicit modality field
            if (exp.type === 'STRATEGIC' && exp.modality !== modalityFilter) return false;
            // For legacy/operational, check description for modality tags [MRI], [CT], etc.
            if (exp.type !== 'STRATEGIC' && !(exp.description || '').includes(`[${modalityFilter}]`)) return false;
        }

        // Free-text search across description, vendor name, category
        if (q) {
            const haystack = [exp.description, exp.name, exp.category]
              .filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(q)) return false;
        }

        return true;
    });
  }, [globalOutflow, expenseFilter, timeFilter, startDate, endDate, modalityFilter, expenseSearch]);

  const outflowStats = useMemo(() => {
    const safeOutflow = filteredOutflow || [];
    // Expense cost = amount + tax (the real cash outflow).
    const cost = (exp) => (Number(exp?.amount) || 0) + (Number(exp?.taxAmount) || 0);
    const totalOutflow = safeOutflow.reduce((sum, exp) => sum + cost(exp), 0);
    const referralTotal = safeOutflow.filter(e => e?.category === 'Referral').reduce((sum, exp) => sum + cost(exp), 0);
    const operationalTotal = safeOutflow.filter(e => e?.category !== 'Referral').reduce((sum, exp) => sum + cost(exp), 0);

    const today = getIstDateStr(new Date().toISOString());
    const todayOutflow = safeOutflow
      .filter(e => e?.date && getIstDateStr(e.date) === today)
      .reduce((sum, exp) => sum + cost(exp), 0);

    const referralPercentage = totalOutflow > 0 ? Math.round((referralTotal / totalOutflow) * 100) : 0;

    const categories = Array.from(new Set(safeOutflow.map(e => e?.category || 'General')));
    const categoryBreakdown = categories.map(cat => {
        const amount = safeOutflow.filter(e => e?.category === cat).reduce((sum, e) => sum + cost(e), 0);
        const percentage = totalOutflow > 0 ? Math.round((amount / totalOutflow) * 100) : 0;
        return { category: cat, amount, percentage };
    });

    return { totalOutflow, referralTotal, operationalTotal, todayOutflow, referralPercentage, categoryBreakdown };
  }, [filteredOutflow]);

  const filteredReferralCuts = useMemo(() => {
    const today = getIstDateStr(new Date().toISOString());
    const q = referralSearch.trim().toLowerCase();
    // Include the projected upcoming cuts so future bookings' referrer payouts
    // appear under Future/All. Their future serviceDate keeps them out of the
    // earned (Today/Past/Custom) tabs automatically.
    return [...combinedReferralCuts, ...upcomingReferralCuts].filter(cut => {
        const cutDate = cut.date ? getIstDateStr(cut.date) : null;
        const svcDate = cut.serviceDate ? getIstDateStr(cut.serviceDate) : null;
        const isFuture = !!svcDate && svcDate > today;   // appointment not yet served = upcoming

        // FUTURE tab = every upcoming commission (future service date), regardless
        // of when it was booked. The other date tabs exclude upcoming cuts so they
        // surface only under Future (and All, which shows everything).
        if (timeFilter === 'FUTURE') {
            if (!isFuture) return false;
        } else if (timeFilter !== 'ALL') {
            if (isFuture) return false;
            if (timeFilter === 'TODAY' && cutDate !== today) return false;
            if (timeFilter === 'PAST' && cutDate === today) return false;
            if (timeFilter === 'CUSTOM') {
                if (startDate && cutDate < startDate) return false;
                if (endDate && cutDate > endDate) return false;
            }
        }
        // Modality Filter alignment
        if (modalityFilter !== 'ALL') {
            // Strategic cuts have an explicit modality field
            if (cut.type === 'STRATEGIC' && cut.modality !== modalityFilter) return false;
            // For legacy, check description for modality tags [MRI], [CT], etc.
            if (cut.type !== 'STRATEGIC' && !(cut.description || '').includes(`[${modalityFilter}]`)) return false;
        }

        // Partner (Referrer) Filter
        if (!referrerFilter.includes('ALL')) {
            if (!referrerFilter.includes(cut.referrerId)) return false;
        }

        // Free-text search across patient, partner, reference, modality, description
        if (q) {
            const haystack = [
                cut.patientName,
                cut.name,
                cut.referringDoctor,
                cut.reference,
                cut.modality,
                cut.description
            ].filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(q)) return false;
        }

        return true;
    }).sort((a, b) => {
        if (!sortConfig.key) return new Date(b.date) - new Date(a.date);
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA < valB) return sortConfig.direction === 'ASC' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ASC' ? 1 : -1;
        return 0;
    });
  }, [combinedReferralCuts, upcomingReferralCuts, timeFilter, startDate, endDate, modalityFilter, referrerFilter, sortConfig, referralSearch]);

  const itemsPerPage = 10;

  // Total records + label for the current view — drives the shared pager's
  // "Showing X–Y of N …" line and the page count.
  const totalRecords =
    billingViewMode === 'INVOICES' ? (timeFilter === 'FUTURE' ? (futureAppointments || []).length : (filteredInvoices || []).length) :
    billingViewMode === 'EXPENSES' ? (filteredOutflow || []).length :
    (filteredReferralCuts || []).length;
  const recordLabel =
    billingViewMode === 'INVOICES' ? (timeFilter === 'FUTURE' ? 'appointments' : 'invoices') :
    billingViewMode === 'EXPENSES' ? 'expenses' :
    'commissions';
  const totalPages = Math.ceil(totalRecords / itemsPerPage);

  const renderPagination = () => (
    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={totalRecords}
      itemsPerPage={itemsPerPage}
      onPageChange={setCurrentPage}
      isMobile={isMobile}
      itemLabel={recordLabel}
    />
  );

  const paginatedInvoices = useMemo(() => (filteredInvoices || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredInvoices, currentPage, itemsPerPage]);
  const paginatedFutureAppointments = useMemo(() => (futureAppointments || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [futureAppointments, currentPage, itemsPerPage]);
  const paginatedReferralCuts = useMemo(() => (filteredReferralCuts || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredReferralCuts, currentPage, itemsPerPage]);

  const paginatedOutflow = useMemo(() => (filteredOutflow || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredOutflow, currentPage, itemsPerPage]);




  useEffect(() => {
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

  // --- ACTIONS ---
  const handleOpenInvoice = (inv) => {
    setSelectedInvoice({ ...inv });
    setIsInvoiceDrawerOpen(true);
  };

  const recalculateInvoice = (inv) => {
    const gross = inv.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
    const disc = inv.discountAmount || 0;
    const additionalCharges = Number(inv.additionalCharges) || 0;
    const net = gross + additionalCharges - disc;
    return {
        ...inv,
        grossAmount: gross,
        totalAmount: net,
        balanceAmount: net - (inv.paidAmount || 0)
    };
  };

  const handleUpdateItem = (index, field, value) => {
    const newItems = [...selectedInvoice.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setSelectedInvoice(recalculateInvoice({ ...selectedInvoice, items: newItems }));
  };

  const handleAddItem = () => {
    const newItems = [...selectedInvoice.items, { description: '', amount: 0, quantity: 1 }];
    setSelectedInvoice({ ...selectedInvoice, items: newItems });
  };

  const handleRemoveItem = (index) => {
    const newItems = selectedInvoice.items.filter((_, i) => i !== index);
    setSelectedInvoice(recalculateInvoice({ ...selectedInvoice, items: newItems }));
  };

  const handleCollectPayment = async (centreDiscount = 0, referrerDiscount = 0, deduction = 0, netAmount = null, meta = {}) => {
    // netAmount can legitimately be 0 (a discount that fully covers the bill), so a
    // falsy `||` fallback would wrongly re-bill the gross. Guard for null/undefined.
    const currentNet = (netAmount === null || netAmount === undefined) ? (selectedInvoice.totalAmount || 0) : netAmount;
    const currentPaid = selectedInvoice.paidAmount || 0;
    const balance = Math.max(0, currentNet - currentPaid);
    // Partial payment: when the drawer supplies an explicit amount-received,
    // collect exactly that and leave the rest due; otherwise collect the full
    // balance. Over-tender is now allowed — we send the FULL amount and the API
    // settles the invoice and parks the excess as a patient advance (it flips the
    // invoice to PARTIAL when 0 < paid < total, PAID at/above the balance).
    const paymentAmount = (meta.amountReceived === null || meta.amountReceived === undefined)
      ? balance
      : Math.max(0, Number(meta.amountReceived) || 0);

    // When the referral concession exceeds the doctor's commission, the excess
    // is his carried deficit — flag it (with the biller's reason) so the API can
    // record a negative commission + audit. The authoriser is the authenticated
    // user, captured server-side.
    const commission = selectedInvoice.commissionAmount || 0;
    const commissionDeficit = Math.max(0, referrerDiscount - commission);

    const payload = {
      invoiceId: selectedInvoice.invoiceId,
      amount: paymentAmount,
      centreDiscount,
      referrerDiscount,
      deduction,
      paymentMethod: paymentMethod,
      commissionDeficit,
      deficitReason: meta.deficitReason || '',
      // Over-commission excess funded by the centre (instead of the referrer's
      // deficit): the API floors the commission at 0 and the centre absorbs it.
      absorbExcessToCentre: !!meta.absorbToCentre,
      extraCharges: meta.additionalChargesReason ? JSON.parse(meta.additionalChargesReason) : []
    };

    // Stable key shared by the online call + outbox fallback — a payment that
    // reached the server but lost its response must NOT be charged twice.
    const idemKey = crypto.randomUUID();
    try {
      console.log('[FINANCE] Committing settlement:', payload);

      if (!isOnline) {
        await addToOutbox('PAYMENT', payload, idemKey);
        setIsInvoiceDrawerOpen(false);
        setPaymentSuccess({
          amount: paymentAmount,
          method: paymentMethod,
          patientName: selectedInvoice.patientName,
          invoiceId: selectedInvoice.displayId,
          offline: true
        });
        return;
      }

      await apiClient.post('/finance/payments', payload, { headers: { 'Idempotency-Key': idemKey } });
      celebrate();
      setIsInvoiceDrawerOpen(false);
      refreshAllFinancialData();
      setPaymentSuccess({
        amount: paymentAmount,
        method: paymentMethod,
        patientName: selectedInvoice.patientName,
        invoiceId: selectedInvoice.displayId,
        offline: false
      });
    } catch (err) {
      console.error('[FINANCE] Payment failed', err);
      if (!err.response) {
         await addToOutbox('PAYMENT', payload, idemKey);
         setIsInvoiceDrawerOpen(false);
         setPaymentSuccess({
           amount: paymentAmount,
           method: paymentMethod,
           patientName: selectedInvoice.patientName,
           invoiceId: selectedInvoice.displayId,
           offline: true
         });
      }
    }
  };

  // Carry a patient's advance forward onto this invoice (settles it without fresh
  // cash). Amount null = apply the max possible (min of balance owed & wallet).
  const handleApplyCredit = async (invoiceId, amount) => {
    try {
      const { data } = await apiClient.post('/finance/credit/apply', { invoiceId, amount: amount ?? null });
      if (data?.success) {
        notifyToast(`Applied ₹${Number(data.applied || 0).toLocaleString('en-IN')} from the patient's advance ✓`, 'success');
        setIsInvoiceDrawerOpen(false);
        refreshAllFinancialData();
      } else {
        notifyToast(data?.error || 'Could not apply the advance.', 'error');
      }
    } catch (err) {
      notifyToast(err?.response?.data?.error || err?.message || 'Could not apply the advance.', 'error');
    }
  };

  const handleCreateManualInvoice = async (e) => {
    e.preventDefault();
    if (!selectedPatient || newInvoiceData.items.length === 0) {
      notify({ type: 'warning', title: 'Patient Required', message: 'Please select a patient before creating an invoice.' });
      return;
    }
    
    const totalCommission = newInvoiceData.items.reduce((sum, it) => sum + ((it.referralCutValue || 0) * (it.quantity || 1)), 0);

    const payload = {
      patientId: selectedPatient.patientId,
      appointmentId: newInvoiceData.items.find(it => it.appointmentId)?.appointmentId || null,
      referrerId: newInvoiceData.referrerId || null,
      centreDiscount: Number(newInvoiceData.centreDiscount || 0),
      referrerDiscount: Number(newInvoiceData.referrerDiscount || 0),
      commissionAmount: totalCommission,
      items: newInvoiceData.items.map(it => ({
        description: it.description,
        amount: Number(it.amount),
        quantity: Number(it.quantity),
        // Multi-service rollout — forward the FK so the server can
        // attach this line to the right AppointmentService row.
        // Without it the InvoiceItem ends up with NULL FK and the
        // GetInvoices modality projection falls back to the visit's
        // scalar primary, which makes every item on a multi-service
        // bill look like the same modality.
        appointmentServiceId: it.appointmentServiceId || null,
      }))
    };

    // Stable key shared by the online call + outbox fallback so a lost-response
    // retry can't create a duplicate invoice.
    const idemKey = crypto.randomUUID();
    try {
      if (!isOnline) {
        await addToOutbox('INVOICE', payload, idemKey);
        setIsNewInvoiceDrawerOpen(false);
        setNewInvoiceData({ patientName: '', items: [{ description: '', amount: 0, quantity: 1 }], centreDiscount: 0, referrerDiscount: 0, paymentMethod: 'CASH', referrerId: '' });
        notify({ type: 'info', title: 'Queued for Sync', message: 'You are offline. Invoice has been saved and will sync automatically when connection is restored.' });
        return;
      }

      await apiClient.post('/finance/invoices', payload, { headers: { 'Idempotency-Key': idemKey } });
      setIsNewInvoiceDrawerOpen(false);
      setSelectedPatient(null);
      setPatientSearchQuery('');
      setNewInvoiceData({ patientName: '', items: [{ description: '', amount: 0, quantity: 1 }], centreDiscount: 0, referrerDiscount: 0, paymentMethod: 'CASH', referrerId: '' });
      refreshAllFinancialData();
      notify({ type: 'success', title: 'Invoice Created', message: 'The invoice has been created and recorded successfully.' });
    } catch (err) {
      console.error('[FINANCE] Invoice creation failed', err);
      if (!err.response) {
         await addToOutbox('INVOICE', payload, idemKey);
         notify({ type: 'info', title: 'Queued for Sync', message: 'No connection detected. Invoice has been queued and will sync when back online.' });
         setIsNewInvoiceDrawerOpen(false);
      } else {
         const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to create invoice.';
         notify({ type: 'error', title: 'Invoice Failed', message: errorMsg });
      }
    }
  };

  // Save-as-draft from the settlement drawer. When the drawer passes its live
  // discount breakdown ({ centreDisc, referrerDisc, deduction }) we persist that
  // breakdown so reopening the invoice restores the partial edits; otherwise we
  // fall back to the invoice's current discount total.
  const handleSaveInvoice = async (draft = null) => {
    const hasBreakdown = draft && typeof draft === 'object' && 'centreDisc' in draft;
    const body = hasBreakdown
      ? {
          centreDiscount: Number(draft.centreDisc) || 0,
          referrerDiscount: Number(draft.referrerDisc) || 0,
          institutionalDeduction: Number(draft.deduction) || 0,
          additionalCharges: Number(draft.additionalCharges) || 0,
          additionalChargesReason: draft.additionalChargesReason || null,
          extraCharges: draft.additionalChargesReason ? JSON.parse(draft.additionalChargesReason) : [],
          discountAmount: (Number(draft.centreDisc) || 0) + (Number(draft.referrerDisc) || 0) + (Number(draft.deduction) || 0),
        }
      : { discountAmount: selectedInvoice.discountAmount };
    try {
      await apiClient.post(`/finance/invoices/${selectedInvoice.invoiceId}/discount`, body);
      refreshAllFinancialData();
      setIsInvoiceDrawerOpen(false);
      notify({ type: 'success', title: 'Draft Saved', message: 'Your changes were saved. Reopen the invoice to continue.' });
    } catch (err) {
      console.error('[FINANCE] Discount application failed', err);
      notify({ type: 'error', title: 'Update Failed', message: 'Could not update the invoice. Please try again.' });
    }
  };

  // Submits a sensitive post-payment change for admin sign-off. The change is
  // NOT applied here — it sits PENDING in Finance → Approvals until an admin
  // approves it. Shared by the payment-edit / cancel / change-referrer triggers.
  const handleRequestApproval = async ({ type, title, invoiceId, appointmentId, payload, reason }) => {
    try {
      await apiClient.post('/approvals', {
        type,
        title: title || '',
        invoiceId: invoiceId || null,
        appointmentId: appointmentId || null,
        payload: payload || '{}',
        reason,
      });
      window.dispatchEvent(new Event('1rad_approvals_changed'));   // update the nav badge immediately
      notify({ type: 'success', title: 'Sent for approval', message: 'An admin will review this in Admin Approval.' });
      setIsInvoiceDrawerOpen(false);
    } catch (err) {
      console.error('[APPROVALS] request failed', err);
      notify({ type: 'error', title: 'Could not send', message: err.response?.data?.error || err.response?.data?.message || 'Please try again.' });
      throw err;
    }
  };

  const handleApplyAdjustment = async (invoiceId, amount) => {
    try {
      await apiClient.post('/finance/adjust', {
        invoiceId, 
        extraDiscount: amount
      });
      refreshAllFinancialData();
      setIsInvoiceDrawerOpen(false);
      notify({ type: 'success', title: 'Adjustment Applied', message: `Adjustment of ₹${amount} has been applied to the invoice successfully.` });
    } catch (err) {
      console.error('[FINANCE] Adjustment failed', err);
      notify({ type: 'error', title: 'Adjustment Failed', message: err.response?.data?.message || 'Could not apply the adjustment. Please try again.' });
    }
  };


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
        notify({ type: 'warning', title: 'Pop-ups Blocked', message: 'Please allow pop-ups for this site to enable printing on mobile devices.' });
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
      
      // In Electron, we need a slight delay for styles to load in the iframe
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
    }
  };

  const handlePrintA4 = (invInput = null) => {
    const inv = invInput || selectedInvoice;
    if (!inv) return;

    // Modality colour palette — same one the worklist ledger,
    // OpsBoard queue cards, and InvoiceDrawer use. Keeping the
    // print bill visually in sync with the on-screen experience
    // so the patient's printed copy is recognisable as "from us".
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
      }[k] || { bg: '#f1f5f9', border: '#e2e8f0', text: '#475569' });
    };

    const items = inv.items || [];

    // Per-modality aggregate for the summary box. Only renders below
    // when the bill spans more than one modality — for a single-
    // service invoice the items table already says everything.
    const modAgg = new Map();
    for (const it of items) {
      const m = String(it.modality || it.Modality || 'OTHER').toUpperCase() || 'OTHER';
      const subtotal = (Number(it.amount) || 0) * (Number(it.quantity) || 0);
      const cur = modAgg.get(m) || { modality: m, subtotal: 0, count: 0 };
      cur.subtotal += subtotal;
      cur.count    += 1;
      modAgg.set(m, cur);
    }
    const modRows = [...modAgg.values()].sort((a, b) => b.subtotal - a.subtotal);

    const itemsHtml = items.map(it => {
      const mod  = String(it.modality || it.Modality || '').toUpperCase();
      const tint = modTint(mod);
      const sub  = (Number(it.amount) || 0) * (Number(it.quantity) || 0);
      return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 14px 0; text-align: center;">
            ${mod ? `<span style="display: inline-block; font-size: 9px; font-weight: 900; letter-spacing: 0.4px; color: ${tint.text}; background: ${tint.bg}; border: 1px solid ${tint.border}; padding: 2px 8px; border-radius: 6px; text-transform: uppercase;">${mod}</span>` : `<span style="color: #cbd5e1; font-size: 10px;">—</span>`}
          </td>
          <td style="padding: 14px 10px 14px 0; font-size: 11px; font-weight: 600; color: #1e293b;">${(it.description || '').toUpperCase()}</td>
          <td style="padding: 14px 0; text-align: center; font-size: 11px; font-weight: 500; color: #64748b;">${it.quantity}</td>
          <td style="padding: 14px 0; text-align: right; font-size: 11px; font-weight: 500; color: #64748b;">₹${(it.amount || 0).toLocaleString()}</td>
          <td style="padding: 14px 0; text-align: right; font-size: 11px; font-weight: 700; color: #0f52ba;">₹${sub.toLocaleString()}</td>
        </tr>
      `;
    }).join('');

    // Summary box renders only when 2+ modalities are present.
    // Stays on the same horizontal band as the totals so the bill
    // reads "what you got · what you owe" in a single glance.
    const modalitySummaryHtml = modRows.length > 1 ? `
      <div style="flex: 1; max-width: 360px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-right: 30px;">
        <div style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
          Services Breakdown
        </div>
        ${modRows.map(r => {
          const t = modTint(r.modality);
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 11px;">
              <span style="display: inline-flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 999px; background: ${t.text};"></span>
                <span style="font-weight: 800; color: #0f172a; letter-spacing: 0.2px;">${r.modality}</span>
                <span style="font-size: 9px; font-weight: 700; color: #94a3b8;">${r.count} ${r.count === 1 ? 'item' : 'items'}</span>
              </span>
              <span style="font-weight: 900; color: #0f172a; font-variant-numeric: tabular-nums;">₹${Math.round(r.subtotal).toLocaleString()}</span>
            </div>
          `;
        }).join('')}
      </div>
    ` : '';

    // Header meta now describes the visit honestly: a single
    // modality keeps the existing "Modality: CT" line; multi-
    // modality visits surface a count chip ("3 modalities") and
    // let the Services Breakdown box below carry the detail.
    const headerModalityHtml = modRows.length > 1
      ? `<span class="meta-label">Modalities:</span><span class="meta-value">${modRows.length} modalities (${modRows.map(r => r.modality).join(', ')})</span>`
      : `<span class="meta-label">Modality:</span><span class="meta-value">${(modRows[0]?.modality || inv.modality || 'N/A')}</span>`;

    ghostPrint(`
      <html>
        <head>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
          <style>
            @page { size: A4; margin: 0; }
            body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; color: #1e293b; background: #fff; }
            .container { padding: 50px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 4px solid #0f52ba; padding-bottom: 30px; margin-bottom: 40px; }
            .hospital-logo { width: 60px; height: 60px; background: #0f52ba; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 24px; margin-bottom: 15px; }
            .hospital-info h1 { font-size: 22px; font-weight: 900; color: #0f52ba; margin: 0; letter-spacing: -0.5px; }
            .hospital-info p { font-size: 11px; color: #64748b; margin: 4px 0; font-weight: 500; }
            .invoice-meta { text-align: right; }
            .invoice-title { font-size: 32px; font-weight: 900; color: #e2e8f0; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 2px; }
            .meta-grid { display: grid; grid-template-columns: auto auto; gap: 8px 20px; font-size: 11px; }
            .meta-label { font-weight: 800; color: #94a3b8; text-transform: uppercase; }
            .meta-value { font-weight: 700; color: #1e293b; }
            
            .billing-matrix { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
            .billing-box { background: #f8fafc; padding: 25px; border-radius: 16px; border: 1px solid #e2e8f0; }
            .box-title { font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
            .patient-name { font-size: 18px; font-weight: 900; color: #0f52ba; margin-bottom: 5px; }
            .patient-meta { font-size: 11px; color: #64748b; font-weight: 500; margin: 3px 0; }

            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            th { text-align: left; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; padding-bottom: 15px; border-bottom: 2px solid #f1f5f9; }
            
            .summary-section { display: flex; justify-content: flex-end; margin-bottom: 60px; }
            .summary-table { width: 300px; }
            .summary-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
            .summary-label { font-size: 11px; font-weight: 700; color: #64748b; }
            .summary-value { font-size: 12px; font-weight: 800; color: #1e293b; }
            .grand-total { border-top: 2px solid #0f52ba; margin-top: 10px; padding-top: 15px; color: #0f52ba; }
            .total-amount { font-size: 24px; font-weight: 900; }

            .footer { position: fixed; bottom: 50px; left: 50px; right: 50px; display: flex; justify-content: space-between; align-items: flex-end; }
            .qr-placeholder { width: 80px; height: 80px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #cbd5e1; text-align: center; padding: 5px; }
            .signature-box { text-align: right; }
            .signature-line { width: 200px; border-top: 1px solid #1e293b; margin-top: 60px; margin-bottom: 10px; }
            .signature-label { font-size: 11px; font-weight: 800; color: #1e293b; text-transform: uppercase; }
            
            .status-stamp { position: absolute; top: 150px; left: 50%; transform: translateX(-50%) rotate(-15deg); font-size: 80px; font-weight: 900; color: rgba(16, 185, 129, 0.1); border: 10px solid rgba(16, 185, 129, 0.1); padding: 10px 40px; border-radius: 20px; pointer-events: none; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="status-stamp">${(inv.status || 'PAID')}</div>
            
            <div class="header">
              <div class="hospital-info">
                <div class="hospital-logo">1R</div>
                <h1>${(activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTICS').toUpperCase()}</h1>
                <p>${activeCenter?.address || 'Strategic Clinical Node'}</p>
                <p>CONTACT: ${ownerDetails?.contact || activeCenter?.contactNo || '+91 XXXXXXXXXX'} | EMAIL: ${ownerDetails?.email || 'contact@1rad.health'}</p>
                <p style="font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-top: 2px;">REPRESENTATIVE: ${ownerDetails?.name || 'ADMINISTRATOR'}</p>
              </div>
              <div class="invoice-meta">
                <div class="invoice-title">Tax Invoice</div>
                <div class="meta-grid">
                  <span class="meta-label">Invoice ID:</span><span class="meta-value">${inv.displayId}</span>
                  <span class="meta-label">Date:</span><span class="meta-value">${new Date(inv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                  ${headerModalityHtml}
                </div>
              </div>
            </div>

            <div class="billing-matrix">
              <div class="billing-box">
                <div class="box-title">Bill To Patient</div>
                <div class="patient-name">${(inv.patientName || 'UNKNOWN PATIENT').toUpperCase()}</div>
                <p class="patient-meta">Patient ID: ${inv.patientIdentifier || inv.patientId || 'N/A'}</p>
                <p class="patient-meta">Ref. No (Referred By): ${inv.referrerName || inv.referenceNumber || 'N/A'}</p>
              </div>
              <div class="billing-box">
                <div class="box-title">Center Policy</div>
                <p class="patient-meta" style="font-weight: 600; color: #1e293b;">• Final diagnostic results follow settlement.</p>
                <p class="patient-meta">• Valid for clinical review for 30 days.</p>
                <p class="patient-meta">• Digital copy available via 1Rad Portal.</p>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 110px; text-align: center;">Modality</th>
                  <th>Service Description</th>
                  <th style="width: 60px; text-align: center;">Qty</th>
                  <th style="width: 110px; text-align: right;">Unit Price</th>
                  <th style="width: 120px; text-align: right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="summary-section" style="${modRows.length > 1 ? 'justify-content: space-between; align-items: flex-start;' : ''}">
              ${modalitySummaryHtml}
              <div class="summary-table">
                <div class="summary-row">
                  <span class="summary-label">Gross Aggregate</span>
                  <span class="summary-value">₹${(inv.grossAmount || 0).toLocaleString()}</span>
                </div>
                ${(inv.additionalCharges || 0) > 0 ? (
                  (Array.isArray(inv.extraCharges) && inv.extraCharges.length > 0)
                    ? inv.extraCharges.filter(c => Number(c.amount) > 0).map(c => `
                      <div class="summary-row" style="color: #0f52ba;">
                        <span class="summary-label">Additional Charge${c.reason ? ` (${c.reason})` : ''}</span>
                        <span class="summary-value">+ ₹${(Number(c.amount) || 0).toLocaleString()}</span>
                      </div>
                    `).join('')
                    : `
                      <div class="summary-row" style="color: #0f52ba;">
                        <span class="summary-label">Additional Charge${inv.additionalChargesReason ? ` (${inv.additionalChargesReason})` : ''}</span>
                        <span class="summary-value">+ ₹${(inv.additionalCharges || 0).toLocaleString()}</span>
                      </div>
                    `
                ) : ''}
                <div class="summary-row" style="color: #ef4444;">
                  <span class="summary-label">Institutional Discount</span>
                  <span class="summary-value">- ₹${(inv.discountAmount || 0).toLocaleString()}</span>
                </div>
                <div class="summary-row grand-total">
                  <span class="summary-label" style="color: #0f52ba;">NET PAYABLE</span>
                  <span class="summary-value total-amount">₹${(inv.totalAmount || 0).toLocaleString()}</span>
                </div>
                <div style="margin-top: 15px; font-size: 9px; font-weight: 800; color: #10b981; text-align: right; text-transform: uppercase;">
                  Transaction Status: ${(inv.status || 'PAID')}
                </div>
              </div>
            </div>

            <div class="footer">
              <div class="qr-placeholder">
                QR AUTHENTICATION<br/>SCAN TO VERIFY
              </div>
              <div class="signature-box">
                <div class="signature-line"></div>
                <div class="signature-label">Authorized Signatory</div>
                <div style="font-size: 9px; color: #94a3b8; margin-top: 4px;">1Rad Finance</div>
              </div>
            </div>
            <div style="text-align: center; font-size: 9px; color: #94a3b8; margin-top: 40px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">1Rad Powered by NexEagle</div>
          </div>
        </body>
      </html>
    `);
  };

  const handlePrintReceipt = (invInput = null) => {
    const inv = invInput || selectedInvoice;
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
                <span class="value">${inv.patientIdentifier || inv.patientId || 'N/A'}</span>
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
                <span class="label">Services Billed:</span>
                <span class="value" style="font-size: 11px; font-weight: 800; white-space: normal; line-height: 1.4; color: #334155;">
                  ${(inv.items || []).map(it => it.description || '').filter(Boolean).join(', ')}
                </span>
              </div>
              <div class="content-row">
                <span class="label">Payment Instrument:</span>
                <span class="value">${inv.paymentMethod || 'CASH'} / ID: ${inv.invoiceId.substring(0, 8).toUpperCase()}</span>
              </div>
              ${(Number(inv.discountAmount) || 0) > 0 ? `
              <div class="content-row">
                <span class="label">Gross Amount:</span>
                <span class="value">₹${(Number(inv.grossAmount) || ((Number(inv.totalAmount) || 0) + (Number(inv.discountAmount) || 0))).toLocaleString()}</span>
              </div>
              <div class="content-row">
                <span class="label">Total Discount Given:</span>
                <span class="value">- ₹${(Number(inv.discountAmount) || 0).toLocaleString()}</span>
              </div>` : ''}

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
            <div style="text-align: center; font-size: 9px; color: #94a3b8; margin-top: 30px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">1Rad Powered by NexEagle</div>
          </div>
        </body>
      </html>
    `);
  };

  return (
    <div className="billing-page" style={{ padding: isMobile ? '15px' : '40px', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Header Section */}
      <div className="board-header" style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'flex-start', 
        marginBottom: isMobile ? '25px' : '40px',
        gap: isMobile ? '20px' : '0'
      }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? '20px' : '24px',
            fontWeight: 700,
            color: '#0a1628',
            letterSpacing: '-0.5px',
            marginBottom: '8px',
            margin: 0
          }}>Finance</h1>
          <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
            {[
              { id: 'INVOICES',      label: 'Revenue' },
              { id: 'EXPENSES',      label: 'Expenses' },
              { id: 'REFERRAL_CUTS', label: 'Referrals' },
              { id: 'ANALYTICS',     label: 'Analytics' },
              { id: 'FINANCE',       label: 'Control' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setBillingViewMode(tab.id)}
                style={{
                  padding: '7px 16px', borderRadius: '8px', border: '1px solid #e2e8f0',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  background: billingViewMode === tab.id ? '#0a1628' : 'white',
                  color: billingViewMode === tab.id ? 'white' : '#6b7280',
                  transition: 'all 0.2s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {!isMobile && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
              {activeCenter?.name || 'Current facility'} · Finance & Billing
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: isMobile ? 'flex-start' : 'flex-end' }}>
          {billingViewMode === 'REFERRAL_CUTS' && (
            <h3 style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 800, color: '#1e293b', letterSpacing: '-0.3px', margin: 0 }}>Referral Settlements</h3>
          )}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px' }}>
             <div id="billing-header-actions-portal"></div>
             {localStorage.getItem('1rad_invoices') && (
               <button
                 onClick={handleSyncLegacyData}
                 disabled={isSyncing}
                 style={{
                   padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0',
                   background: '#f8fafc', color: '#1d4ed8', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                   width: isMobile ? '100%' : 'auto'
                 }}
               >
                 {isSyncing ? 'Syncing...' : 'Sync Local'}
               </button>
             )}

          </div>
        </div>
      </div>

      {/* Local-compute banner — surfaces when dashboard numbers come from
          cached invoices instead of /finance/stats. Visible when offline
          OR when the outbox has unsynced mutations the server can't yet
          reflect. Disappears as soon as the queue drains AND the next
          server fetch lands. */}
      {(!isOnline || pendingCount > 0) && (
        <div style={{
          margin: '0 20px 14px',
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderLeft: '4px solid #b45309',
          color: '#78350f',
          borderRadius: '10px',
          padding: '10px 14px',
          fontSize: '12px',
          fontWeight: 600,
          lineHeight: 1.5,
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{ fontSize: '14px' }}>📊</span>
          <div>
            <strong>Dashboard values computed locally</strong> — {!isOnline
              ? 'you are offline; numbers reflect what your device has cached.'
              : `${pendingCount} pending change${pendingCount === 1 ? '' : 's'} not yet on the server.`} They will switch back to the server's authoritative figures once the queue drains.
          </div>
        </div>
      )}

      {billingViewMode === 'EXPENSES' && (
        <ExpenseLedger
          isMobile={isMobile}
          outflowStats={outflowStats}
          /* ── Cursor-pagination props (Phase 5) ──────────────────────── */
          pagedExpenses={(filteredOutflow || []).slice(0, expensePageSize)}
          expenseTotalCount={(filteredOutflow || []).length}
          expenseHasMore={expensePageSize < (filteredOutflow || []).length}
          onLoadMoreExpenses={loadMoreExpenses}
          expenseLoadingMore={expenseLoadingMore}
          /* ─────────────────────────────────────────────────────────────── */
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
          filteredInvoices={filteredInvoices}
          advanceByPatient={advanceByPatient}
          approvalMap={approvalMap}
          approvalFilter={approvalFilter}
          setApprovalFilter={setApprovalFilter}
          liveStats={liveStats}
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
          pagedInvoices={(filteredInvoices || []).slice(0, invoicePageSize)}
          invoiceTotalCount={(filteredInvoices || []).length}
          invoiceHasMore={invoicePageSize < (filteredInvoices || []).length}
          onLoadMoreInvoices={loadMoreInvoices}
          invoiceLoadingMore={invoiceLoadingMore}
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
          onApplyAdjustment={handleApplyAdjustment}
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
      {paymentSuccess && (
        <div
          onClick={() => setPaymentSuccess(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(10, 22, 40, 0.55)',
            backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.25s ease'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '28px',
              width: isMobile ? 'calc(100% - 32px)' : '420px',
              overflow: 'hidden',
              boxShadow: '0 32px 80px rgba(0,0,0,0.22)',
              animation: 'slideUp 0.3s cubic-bezier(.16,1,.3,1)'
            }}
          >
            {/* Green header band */}
            <div style={{
              background: paymentSuccess.offline
                ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              padding: '36px 32px 28px',
              textAlign: 'center',
              position: 'relative'
            }}>
              {/* Big checkmark / offline icon */}
              <div style={{
                width: '72px', height: '72px',
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: '36px'
              }}>
                {paymentSuccess.offline ? '📶' : '✓'}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 950, color: 'rgba(255,255,255,0.75)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
                {paymentSuccess.offline ? 'QUEUED OFFLINE' : 'PAYMENT RECEIVED'}
              </div>
              <div style={{ fontSize: '38px', fontWeight: 950, color: 'white', letterSpacing: '-1px' }}>
                ₹{Number(paymentSuccess.amount).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginTop: '6px' }}>
                via {paymentSuccess.method}
              </div>
            </div>

            {/* Detail rows */}
            <div style={{ padding: '28px 32px 8px' }}>
              {[
                { label: 'PATIENT', value: (paymentSuccess.patientName || 'N/A').toUpperCase() },
                { label: 'INVOICE', value: paymentSuccess.invoiceId },
                { label: 'STATUS', value: paymentSuccess.offline ? 'Will sync when online' : 'Settled & Recorded' },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 0', borderBottom: '1px solid #f1f5f9'
                }}>
                  <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1.5px' }}>{label}</span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Action button */}
            <div style={{ padding: '20px 32px 28px' }}>
              <button
                onClick={() => setPaymentSuccess(null)}
                style={{
                  width: '100%', padding: '14px',
                  borderRadius: '14px', border: 'none',
                  background: paymentSuccess.offline
                    ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                    : 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white', fontSize: '11px', fontWeight: 950,
                  cursor: 'pointer', letterSpacing: '1px',
                  boxShadow: paymentSuccess.offline
                    ? '0 8px 24px rgba(245,158,11,0.25)'
                    : '0 8px 24px rgba(16,185,129,0.25)'
                }}
              >
                DONE
              </button>
            </div>
          </div>

          <style>{`
            @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes slideUp { from { opacity: 0; transform: translateY(32px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
          `}</style>
        </div>
      )}

      {/* ── Unified Billing Notice Modal ──────────────────────────────────── */}
      <BillingNoticeModal {...noticeProps} />
    </div>
  );
}
