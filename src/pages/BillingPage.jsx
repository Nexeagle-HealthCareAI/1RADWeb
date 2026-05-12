import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useAuth from '../auth/useAuth';
import apiClient from '../api/apiClient';
import useOffline from '../hooks/useOffline';
import { nativeStorage } from '../hooks/useElectron';
import '../styles/BillingPage.css';

// Modular Hub Components
import RevenueHub from '../components/Billing/RevenueHub';
import ExpenseLedger from '../components/Billing/ExpenseLedger';
import ReferralHub from '../components/Billing/ReferralHub';
import AnalyticsHub from '../components/Billing/AnalyticsHub';

// Shared Drawers
import { 
  InvoiceDrawer, 
  NewInvoiceDrawer, 
  ExportDrawer, 
  ExpenseDrawer, 
  PayoutDrawer 
} from '../components/Billing/Drawers';

export default function BillingPage() {
  const { activeCenter } = useAuth();
  const { isOnline, addToOutbox, performSync } = useOffline();
  
  const TODAY = new Date().toISOString().split('T')[0];

  // --- STATE ---
  const [billingViewMode, setBillingViewMode] = useState('INVOICES'); // 'INVOICES' or 'EXPENSES'
  const [expenses, setExpenses] = useState([]);
  const [referrers, setReferrers] = useState([]);
  const [expenseFilter, setExpenseFilter] = useState('ALL'); // 'ALL' or 'REFERRAL'
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
    discountAmount: 0,
    paymentMethod: 'CASH'
  });
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [searchTerm, setSearchTerm] = useState('');
  const [timeFilter, setTimeFilter] = useState('TODAY'); // 'TODAY', 'PAST', 'ALL'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL', 'PAID', 'PENDING'
  const [modalityFilter, setModalityFilter] = useState('ALL'); // 'ALL', 'MRI', 'CT', 'X-RAY', etc.
  const [isExportDrawerOpen, setIsExportDrawerOpen] = useState(false);
  const [exportMode, setExportMode] = useState('ALL'); // 'ALL', 'RANGE'
  const [exportDates, setExportDates] = useState({ start: '', end: '' });
  
  // Referral Payout State
  const [isPayoutDrawerOpen, setIsPayoutDrawerOpen] = useState(false);
  const [isSavingPayout, setIsSavingPayout] = useState(false);
  const [editPayout, setEditPayout] = useState({ commissionId: '', referrerId: '', referrerName: '', amount: 0, modality: 'MRI', remarks: '', invoiceId: '', status: 'UNPAID' });
  const [referralCommissions, setReferralCommissions] = useState([]);
  const [appointments, setAppointments] = useState([]);

  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'DESC' });

  const handleSort = (key) => {
    let direction = 'ASC';
    if (sortConfig.key === key && sortConfig.direction === 'ASC') {
      direction = 'DESC';
    }
    setSortConfig({ key, direction });
  };
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // --- SYNC & FETCH ---
  const [stats, setStats] = useState({ totalRevenue: 0, pendingCount: 0, realizationRate: 0, averageTicket: 0, pendingRevenue: 0 });
  const [matrix, setMatrix] = useState({ daily: [], weekly: [], monthly: [], yearly: [], modalityBreakdown: [] });
  const [isSyncing, setIsSyncing] = useState(false);


  // Responsive layout detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);


  const fetchInvoices = useCallback(async () => {
    try {
      const res = await apiClient.get('/finance/invoices', {
        params: { search: searchTerm, status: statusFilter }
      });
      setInvoices(res.data);
      await nativeStorage.set('1rad_cache_invoices', res.data);
    } catch (err) {
      console.error('[FINANCE] Invoice fetch failed, trying cache', err);
      const cached = await nativeStorage.get('1rad_cache_invoices');
      if (cached) setInvoices(cached);
    }
  }, [searchTerm, statusFilter]);

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

  const fetchRegistry = useCallback(async () => {
    try {
      const res = await apiClient.get('/finance/registry');
      setServiceRegistry(res.data);
      await nativeStorage.set('1rad_cache_registry', res.data);
    } catch (err) {
      console.error('[FINANCE] Registry fetch failed, trying cache', err);
      const cached = await nativeStorage.get('1rad_cache_registry');
      if (cached) setServiceRegistry(cached);
    }
  }, []);

  const fetchMatrix = useCallback(async () => {
    const today = new Date().toLocaleDateString('en-CA');
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

  const fetchReferrers = useCallback(async () => {
    try {
      const res = await apiClient.get('/referrers');
      setReferrers(res.data);
      await nativeStorage.set('1rad_cache_referrers', res.data);
    } catch (err) {
      console.error('[FINANCE] Referrers fetch failed, trying cache', err);
      const cached = await nativeStorage.get('1rad_cache_referrers');
      if (cached) setReferrers(cached);
    }
  }, []);

  const fetchCommissions = useCallback(async () => {
    try {
      const res = await apiClient.get('/referrers/commissions');
      setReferralCommissions(res.data);
      await nativeStorage.set('1rad_cache_commissions', res.data);
    } catch (err) {
      console.error('[FINANCE] Commissions fetch failed, trying cache', err);
      const cached = await nativeStorage.get('1rad_cache_commissions');
      if (cached) setReferralCommissions(cached);
    }
  }, []);

  const fetchAppointments = useCallback(async () => {
    try {
      const res = await apiClient.get('/appointments');
      setAppointments(res.data);
      await nativeStorage.set('1rad_cache_billing_appointments', res.data);
    } catch (err) {
      console.error('[FINANCE] Appointment fetch failed', err);
      const cached = await nativeStorage.get('1rad_cache_billing_appointments');
      if (cached) setAppointments(cached);
    }
  }, []);


  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);

    fetchInvoices();
    fetchStats();
    fetchRegistry();
    fetchMatrix();
    fetchExpenses();
    fetchReferrers();
    fetchCommissions();
    fetchAppointments();

    return () => window.removeEventListener('resize', handleResize);
  }, [fetchInvoices, fetchStats, fetchRegistry, fetchMatrix, fetchExpenses, fetchReferrers, fetchCommissions, fetchAppointments]);


  const handleSaveExpense = async (e) => {
    e.preventDefault();
    const payload = editExpense;

    if (!isOnline) {
      await addToOutbox('EXPENSE', payload);
      alert('OFFLINE_MODE: Operational expense queued for synchronization.');
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
      fetchExpenses(); // Refresh expense list
    } catch (err) {
      console.error('[FINANCE] Expense save failed', err);
      if (!err.response) {
        await addToOutbox('EXPENSE', payload);
        alert('NETWORK_ERROR: Record added to offline queue.');
        setIsExpenseDrawerOpen(false);
      } else {
        alert('PROTOCOL FAILURE: Failed to record operational expense.');
      }
    } finally {
      setSavingExpense(false);
    }
  };

  const handleSavePayout = async (e) => {
    e.preventDefault();
    if (!editPayout.referrerId) {
      alert("PROTOCOL ERROR: Referrer identity is missing. Please ensure a valid partner is selected.");
      return;
    }

    const payload = {
      referrerId: editPayout.referrerId,
      amount: parseFloat(editPayout.amount),
      modality: editPayout.modality,
      referenceNumber: editPayout.invoiceId,
      remarks: editPayout.remarks,
      status: editPayout.status || 'UNPAID'
    };

    if (!isOnline) {
      await addToOutbox('PAYOUT', payload);
      alert('OFFLINE_MODE: Referral payout queued for synchronization.');
      setIsPayoutDrawerOpen(false);
      return;
    }

    try {
      setIsSavingPayout(true);
      
      let response;
      if (editPayout.commissionId) {
        // Update Mode
        response = await apiClient.put(`/referrers/commissions/${editPayout.commissionId}`, {
          ...payload,
          commissionId: editPayout.commissionId
        });
      } else {
        // Create Mode
        response = await apiClient.post('/referrers/commissions', payload);
      }

      if (response.data) {
        setIsPayoutDrawerOpen(false);
        fetchInvoices();
        fetchStats();
        fetchCommissions();
        alert(editPayout.commissionId ? 'RECORD UPDATED: Referral metadata successfully synchronized.' : 'PAYMENT LOGGED: Referral commission successfully recorded in strategic ledger.');
      }
    } catch (err) {
      console.error('[PAYOUT] Transaction failure:', err);
      if (!err.response) {
        await addToOutbox('PAYOUT', payload);
        alert('NETWORK_ERROR: Payout added to offline queue.');
        setIsPayoutDrawerOpen(false);
      } else {
        alert('SYSTEM ERROR: Could not commit payout to global registry.');
      }
    } finally {
      setIsSavingPayout(false);
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Are you sure you want to delete this operational expense?')) return;
    
    if (!isOnline) {
      await addToOutbox('EXPENSE_DELETE', { id });
      alert('OFFLINE_MODE: Operational expense deletion queued.');
      setExpenses(prev => prev.filter(e => e.id !== id)); // Optimistic UI
      return;
    }

    try {
      await apiClient.delete(`/finance/expenses/${id}`);
      fetchExpenses();
    } catch (err) {
      console.error('[FINANCE] Failed to delete expense', err);
      if (!err.response) {
        await addToOutbox('EXPENSE_DELETE', { id });
        alert('NETWORK_ERROR: Deletion added to offline queue.');
        setExpenses(prev => prev.filter(e => e.id !== id)); // Optimistic UI
      } else {
        alert('PROTOCOL FAILURE: Could not delete expense.');
      }
    }
  };

  const handleToggleCommissionStatus = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'PAID' ? 'UNPAID' : 'PAID';
    try {
      await apiClient.patch(`/referrers/commissions/${id}/status`, `"${nextStatus}"`, {
        headers: { 'Content-Type': 'application/json' }
      });
      fetchCommissions();
    } catch (err) {
      console.error('[FINANCE] Status transition failed', err);
      alert('CRITICAL ERROR: Failed to update commission status.');
    }
  };

  const handleDeleteInvoice = async (id) => {
    if (!window.confirm('Are you sure you want to delete this invoice? This action is irreversible.')) return;
    
    if (!isOnline) {
      await addToOutbox('INVOICE_DELETE', { id });
      alert('OFFLINE_MODE: Invoice deletion queued.');
      setInvoices(prev => prev.filter(inv => inv.invoiceId !== id)); // Optimistic UI
      return;
    }

    try {
      await apiClient.delete(`/finance/invoices/${id}`);
      fetchInvoices();
      fetchStats();
    } catch (err) {
      console.error('[FINANCE] Failed to delete invoice', err);
      if (!err.response) {
        await addToOutbox('INVOICE_DELETE', { id });
        alert('NETWORK_ERROR: Deletion added to offline queue.');
        setInvoices(prev => prev.filter(inv => inv.invoiceId !== id)); // Optimistic UI
      } else {
        alert('PROTOCOL FAILURE: Could not delete invoice.');
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
    if (legacy.length === 0) return alert('No legacy data detected in browser.');
    
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
      fetchInvoices();
      fetchStats();
      alert('SYNCHRONIZATION COMPLETE: Legacy records merged with server ledger.');
    } catch (err) {
      console.error('[FINANCE] Sync failed', err);
      alert('SYNC FAILURE: Protocol interrupted. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportData = async () => {
    try {
      const { start, end } = exportDates;
      const finalStart = exportMode === 'RANGE' ? start : null;
      const finalEnd = exportMode === 'RANGE' ? end : null;

      const response = await apiClient.get('/finance/export', {
        params: { startDate: finalStart, endDate: finalEnd },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `1Rad_Financials_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setIsExportDrawerOpen(false);
    } catch (err) {
      console.error('[FINANCE] Export failed', err);
      alert('EXPORT FAILURE: Could not generate report.');
    }
  };

  const filteredInvoices = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    const safeInvoices = invoices || [];
    const safeApps = appointments || [];
    
    return safeInvoices.filter(inv => {
      if (!inv) return false;
      // Search Filter
      const matchesSearch = String(inv.patientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (inv.displayId && String(inv.displayId).toLowerCase().includes(searchTerm.toLowerCase()));
      
      if (!matchesSearch) return false;

      // Status Filter
      if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;

      // Time Filter Logic - Respect Appointment Schedule for categorization
      const linkedApp = safeApps.find(a => a.appointmentId === inv.appointmentId);
      const appDateStr = linkedApp ? (linkedApp.date || (linkedApp.dateTime ? linkedApp.dateTime.split('T')[0] : null)) : null;
      const invDateStr = inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-CA') : null;
      
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
  }, [invoices, appointments, searchTerm, timeFilter, statusFilter, modalityFilter, startDate, endDate, sortConfig]);

  const futureAppointments = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    const safeApps = appointments || [];
    
    return safeApps.filter(app => {
      const appDate = app.date || (app.dateTime ? app.dateTime.split('T')[0] : null);
      if (!appDate || appDate <= today) return false;
      
      // Modality Filter
      if (modalityFilter !== 'ALL' && app.modality !== modalityFilter) return false;
      
      // Search Filter
      const matchesSearch = String(app.patientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            String(app.displayId || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesSearch;
    }).sort((a, b) => {
        const valA = a.date || a.dateTime;
        const valB = b.date || b.dateTime;
        if (valA < valB) return sortConfig.direction === 'ASC' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ASC' ? 1 : -1;
        return 0;
    });
  }, [appointments, searchTerm, modalityFilter, sortConfig]);

  const liveStats = useMemo(() => {
    const safeInvoices = filteredInvoices || [];
    const paidInvoices = safeInvoices.filter(inv => inv?.status === 'PAID');
    const pendingInvoices = safeInvoices.filter(inv => inv?.status === 'PENDING');
    
    const totalRevenue = safeInvoices.reduce((sum, inv) => sum + (Number(inv?.grossAmount) || 0), 0);
    const pendingRevenue = pendingInvoices.reduce((sum, inv) => sum + (Number(inv?.totalAmount) || 0) - (Number(inv?.paidAmount) || 0), 0);
    const pendingCount = pendingInvoices.length;
    
    const totalBilled = safeInvoices.reduce((sum, inv) => sum + (Number(inv?.totalAmount) || 0), 0);
    const realizationRate = totalBilled > 0 ? Math.round((totalRevenue / totalBilled) * 100) : 0;
    const averageTicket = paidInvoices.length > 0 ? Math.round(totalRevenue / paidInvoices.length) : 0;

    const totalGross = totalRevenue;
    const totalDiscount = safeInvoices.reduce((sum, inv) => sum + (Number(inv?.discountAmount) || 0), 0);
    const totalCommission = safeInvoices.reduce((sum, inv) => sum + (Number(inv?.commissionAmount) || 0), 0);
    const netProfit = totalGross - totalDiscount - totalCommission;

    return { totalRevenue, pendingRevenue, pendingCount, realizationRate, averageTicket, totalGross, totalDiscount, totalCommission, netProfit };
  }, [filteredInvoices]);
  const combinedReferralCuts = useMemo(() => {
    const legacyCuts = expenses.filter(e => e && (e.category === 'Referral' || (e.description || '').toLowerCase().includes('referral'))).map(e => ({
        id: e.id,
        date: e.transactionDate,
        name: e.vendorName || 'DIRECT',
        description: e.description,
        reference: e.referenceNumber,
        amount: e.amount,
        type: 'LEGACY',
        status: e.status?.toUpperCase() === 'PAID' ? 'PAID' : 'PAID' // Legacy expenses are usually paid
    }));
    const strategicCuts = referralCommissions.filter(c => c).map(c => ({
        id: c.id,
        date: c.transactionDate,
        name: c.referrerName,
        description: `Commission [${c.modality}] ${c.remarks ? `- ${c.remarks}` : ''}`,
        reference: c.referenceNumber,
        amount: c.amount,
        type: 'STRATEGIC',
        status: (c.status || 'UNPAID').toUpperCase(),
        referrerId: c.referrerId,
        modality: c.modality || 'MRI'
    }));
    return [...legacyCuts, ...strategicCuts].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [expenses, referralCommissions]);

  const recordedPayouts = useMemo(() => {
    return new Set(combinedReferralCuts.map(c => c.reference).filter(Boolean));
  }, [combinedReferralCuts]);

  const todayReferralTotal = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    return combinedReferralCuts
      .filter(cut => {
        if (!cut.date) return false;
        try {
          return new Date(cut.date).toLocaleDateString('en-CA') === today;
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
        type: 'OPERATIONAL'
    }));
    
    const referralCuts = combinedReferralCuts.map(c => ({
        id: c.id,
        date: c.date,
        name: c.name,
        description: c.description,
        category: 'Referral',
        amount: c.amount,
        type: c.type
    }));

    return [...operationalExpenses, ...referralCuts].sort((a, b) => {
        if (!sortConfig.key) return new Date(b.date) - new Date(a.date);
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA < valB) return sortConfig.direction === 'ASC' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ASC' ? 1 : -1;
        return 0;
    });
  }, [expenses, combinedReferralCuts, sortConfig]);

  const filteredOutflow = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    
    return globalOutflow.filter(exp => {
        if (!exp) return false;
        // Category Filter
        if (expenseFilter === 'REFERRAL' && exp.category !== 'Referral') return false;

        // Time Filter
        const expDate = exp.date ? new Date(exp.date).toLocaleDateString('en-CA') : null;
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

        return true;
    });
  }, [globalOutflow, expenseFilter, timeFilter, startDate, endDate, modalityFilter]);

  const outflowStats = useMemo(() => {
    const safeOutflow = filteredOutflow || [];
    const totalOutflow = safeOutflow.reduce((sum, exp) => sum + (Number(exp?.amount) || 0), 0);
    const referralTotal = safeOutflow.filter(e => e?.category === 'Referral').reduce((sum, exp) => sum + (Number(exp?.amount) || 0), 0);
    const operationalTotal = safeOutflow.filter(e => e?.category !== 'Referral').reduce((sum, exp) => sum + (Number(exp?.amount) || 0), 0);
    
    const today = new Date().toLocaleDateString('en-CA');
    const todayOutflow = safeOutflow
      .filter(e => e?.date && new Date(e.date).toLocaleDateString('en-CA') === today)
      .reduce((sum, exp) => sum + (Number(exp?.amount) || 0), 0);

    const referralPercentage = totalOutflow > 0 ? Math.round((referralTotal / totalOutflow) * 100) : 0;

    const categories = Array.from(new Set(safeOutflow.map(e => e?.category || 'General')));
    const categoryBreakdown = categories.map(cat => {
        const amount = safeOutflow.filter(e => e?.category === cat).reduce((sum, e) => sum + (Number(e?.amount) || 0), 0);
        const percentage = totalOutflow > 0 ? Math.round((amount / totalOutflow) * 100) : 0;
        return { category: cat, amount, percentage };
    });

    return { totalOutflow, referralTotal, operationalTotal, todayOutflow, referralPercentage, categoryBreakdown };
  }, [filteredOutflow]);

  const filteredReferralCuts = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    return combinedReferralCuts.filter(cut => {
        const cutDate = cut.date ? new Date(cut.date).toLocaleDateString('en-CA') : null;
        if (timeFilter === 'TODAY' && cutDate !== today) return false;
        if (timeFilter === 'PAST' && cutDate === today) return false;
        if (timeFilter === 'CUSTOM') {
            if (startDate && cutDate < startDate) return false;
            if (endDate && cutDate > endDate) return false;
        }
        // Modality Filter alignment
        if (modalityFilter !== 'ALL') {
            // Strategic cuts have an explicit modality field
            if (cut.type === 'STRATEGIC' && cut.modality !== modalityFilter) return false;
            // For legacy, check description for modality tags [MRI], [CT], etc.
            if (cut.type !== 'STRATEGIC' && !(cut.description || '').includes(`[${modalityFilter}]`)) return false;
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
  }, [combinedReferralCuts, timeFilter, startDate, endDate, modalityFilter, sortConfig]);

  const totalPages = Math.ceil(
    billingViewMode === 'INVOICES' ? (timeFilter === 'FUTURE' ? (futureAppointments || []).length : (filteredInvoices || []).length) / itemsPerPage :
    billingViewMode === 'EXPENSES' ? (filteredOutflow || []).length / itemsPerPage :
    (filteredReferralCuts || []).length / itemsPerPage
  );


  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '30px', padding: '10px' }}>
        {Array.from({ length: totalPages }).map((_, i) => (
          <button
            key={i}
            onClick={() => {
              setCurrentPage(i + 1);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            style={{
              width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 950,
              background: currentPage === i + 1 ? '#0f52ba' : 'white',
              color: currentPage === i + 1 ? 'white' : '#64748b',
              cursor: 'pointer', transition: 'all 0.2s',
              boxShadow: currentPage === i + 1 ? '0 4px 12px rgba(15,82,186,0.2)' : 'none'
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>
    );
  };

  const paginatedInvoices = useMemo(() => (filteredInvoices || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredInvoices, currentPage, itemsPerPage]);
  const paginatedFutureAppointments = useMemo(() => (futureAppointments || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [futureAppointments, currentPage, itemsPerPage]);
  const paginatedReferralCuts = useMemo(() => (filteredReferralCuts || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredReferralCuts, currentPage, itemsPerPage]);

  const paginatedOutflow = useMemo(() => (filteredOutflow || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredOutflow, currentPage, itemsPerPage]);




  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, timeFilter, statusFilter, modalityFilter, startDate, endDate]);

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
    const net = gross - disc;
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

  const handleCollectPayment = async (centreDiscount = 0, referrerDiscount = 0, deduction = 0) => {
    try {
      const payload = {
        invoiceId: selectedInvoice.id,
        amount: selectedInvoice.totalAmount,
        centreDiscount,
        referrerDiscount,
        deduction,
        paymentMethod: paymentMethod
      };


      
      if (!isOnline) {
        await addToOutbox('PAYMENT', payload);
        alert('OFFLINE MODE: Payment cached locally. Will sync when online.');
        setIsInvoiceDrawerOpen(false);
        return;
      }

      await apiClient.post('/finance/payments', payload);
      setIsInvoiceDrawerOpen(false);
      fetchInvoices();
      fetchStats();
      alert(`PAYMENT SUCCESS: Received ₹${selectedInvoice.balanceAmount} via ${paymentMethod}`);
    } catch (err) {
      console.error('[FINANCE] Payment failed', err);
      // Optional: Add to outbox if it was a network error
      if (!err.response) {
         await addToOutbox('PAYMENT', payload);
         alert('NETWORK ERROR: Record saved to offline queue.');
         setIsInvoiceDrawerOpen(false);
      }
    }
  };

  const handleCreateManualInvoice = async (e) => {
    e.preventDefault();
    if (!selectedPatient || newInvoiceData.items.length === 0) {
      alert("PLEASE SELECT A REGISTERED PATIENT TO PROCEED");
      return;
    }
    
    const totalCommission = newInvoiceData.items.reduce((sum, it) => sum + ((it.referralCutValue || 0) * (it.quantity || 1)), 0);

    const payload = {
      patientId: selectedPatient.patientId,
      appointmentId: newInvoiceData.items.find(it => it.appointmentId)?.appointmentId || null,
      discountAmount: Number(newInvoiceData.discountAmount || 0),
      commissionAmount: totalCommission,
      items: newInvoiceData.items.map(it => ({
        description: it.description,
        amount: Number(it.amount),
        quantity: Number(it.quantity)
      }))
    };

    try {
      if (!isOnline) {
        await addToOutbox('INVOICE', payload);
        setIsNewInvoiceDrawerOpen(false);
        setNewInvoiceData({ patientName: '', items: [{ description: '', amount: 0, quantity: 1 }], discountAmount: 0, paymentMethod: 'CASH' });
        alert('OFFLINE MODE: Invoice cached locally. Will sync when online.');
        return;
      }

      await apiClient.post('/finance/invoices', payload);
      setIsNewInvoiceDrawerOpen(false);
      setSelectedPatient(null);
      setPatientSearchQuery('');
      setNewInvoiceData({ patientName: '', items: [{ description: '', amount: 0, quantity: 1 }], discountAmount: 0, paymentMethod: 'CASH' });
      fetchInvoices();
      fetchStats();
      alert('INVOICE GENERATED: Financial record successfully added to ledger.');
    } catch (err) {
      console.error('[FINANCE] Invoice creation failed', err);
      if (!err.response) {
         await addToOutbox('INVOICE', payload);
         alert('NETWORK ERROR: Invoice saved to offline queue.');
         setIsNewInvoiceDrawerOpen(false);
      } else {
         const errorMsg = err.response?.data?.error || err.response?.data?.message || 'SYSTEM FAILURE: Failed to deploy invoice metadata.';
         alert(errorMsg);
      }
    }
  };

  const handleSaveInvoice = async () => {
    try {
      await apiClient.post(`/finance/invoices/${selectedInvoice.invoiceId}/discount`, {
        discountAmount: selectedInvoice.discountAmount
      });
      fetchInvoices();
      fetchStats();
      setIsInvoiceDrawerOpen(false);
      alert('INVOICE UPDATED: Discount applied successfully.');
    } catch (err) {
      console.error('[FINANCE] Discount application failed', err);
      alert('PROTOCOL FAILURE: Could not update invoice discount.');
    }
  };

  const handleApplyAdjustment = async (invoiceId, amount) => {
    try {
      await apiClient.post('/finance/adjust', { 
        invoiceId, 
        extraDiscount: amount 
      });
      fetchInvoices();
      fetchStats();
      setIsInvoiceDrawerOpen(false);
      alert(`ADJUSTMENT SUCCESS: Applied ₹${amount} concession.`);
    } catch (err) {
      console.error('[FINANCE] Adjustment failed', err);
      alert('ADJUSTMENT FAILURE: ' + (err.response?.data?.message || 'Internal Error'));
    }
  };


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
    
    // In Electron, we need a slight delay for styles to load in the iframe
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  };

  const handlePrintA4 = (invInput = null) => {
    const inv = invInput || selectedInvoice;
    if (!inv) return;
    
    const itemsHtml = (inv.items || []).map(it => `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px 0;">${it.description}</td>
        <td style="padding: 12px 0; text-align: center;">${it.quantity}</td>
        <td style="padding: 12px 0; text-align: right;">₹${(it.amount || 0).toLocaleString()}</td>
        <td style="padding: 12px 0; text-align: right; font-weight: bold;">₹${((it.amount || 0) * (it.quantity || 0)).toLocaleString()}</td>
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
            @media print { .no-print { display: none; } }
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
             <div style="font-size: 18px; font-weight: 950;">${(inv.patientName || 'UNKNOWN PATIENT').toUpperCase()}</div>
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

  const handlePrintThermal = (invInput = null) => {
    const inv = invInput || selectedInvoice;
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
          <title>Thermal Receipt</title>
          <style>
            body { font-family: 'monospace'; width: 72mm; padding: 10px; margin: 0; }
            .center { text-align: center; }
            .divider { border-top: 1px dashed #000; margin: 10px 0; }
            .bold { font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="center">
            <div style="font-size: 16px; font-weight: bold;">${activeCenter?.hospitalName || '1RAD DIAGNOSTICS'}</div>
            <div style="font-size: 10px;">${activeCenter?.address || ''}</div>
            <div style="font-size: 10px;">Tel: ${activeCenter?.contactNo || ''}</div>
          </div>
          <div class="divider"></div>
          <div style="font-size: 12px;">
            <div>INV: ${inv.displayId || 'N/A'}</div>
            <div>DATE: ${new Date().toLocaleDateString()}</div>
            <div class="bold">PATIENT: ${(inv.patientName || 'N/A').toUpperCase()}</div>
          </div>
          <div class="divider"></div>
          ${itemsHtml}
          <div class="divider"></div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px;">
            <span>TOTAL</span>
            <span>₹${(inv.totalAmount || 0).toLocaleString()}</span>
          </div>
          <div class="center" style="margin-top: 20px; font-size: 10px;">
            THANK YOU FOR CHOOSING 1RAD
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
              <div style="font-size: 20px; font-weight: 950; color: #0f52ba;">${(activeCenter?.hospitalName || '1RAD DIAGNOSTICS').toUpperCase()}</div>
              <div style="font-size: 12px; color: #64748b;">PAYMENT ACKNOWLEDGEMENT</div>
            </div>

            <div class="row">
              <span class="label">Receipt No:</span>
              <span class="value">REC/${inv.displayId}</span>
            </div>
            <div class="row">
              <span class="label">Date:</span>
              <span class="value">${new Date().toLocaleDateString()}</span>
            </div>
            <div class="row">
              <span class="label">Patient Name:</span>
              <span class="value">${(inv.patientName || 'UNKNOWN').toUpperCase()}</span>
            </div>
            <div class="row">
              <span class="label">Invoice Ref:</span>
              <span class="value">${inv.displayId}</span>
            </div>
            <div class="row">
              <span class="label">Payment Mode:</span>
              <span class="value">${inv.paymentMethod || 'CASH'}</span>
            </div>

            <div class="amount-box">
              <div class="label">Amount Received</div>
              <div style="font-size: 32px; font-weight: 950; color: #0f52ba; margin-top: 5px;">₹${(inv.totalAmount || 0).toLocaleString()}</div>
              <div style="font-size: 10px; color: #64748b; font-weight: 700; margin-top: 5px;">FULLY PAID & SETTLED</div>
            </div>

            <div class="stamp">
              Authorized Signatory<br/>
              <span style="font-size: 10px;">(Computer Generated)</span>
            </div>

            <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px dashed #e2e8f0; padding-top: 15px;">
              THANK YOU FOR CHOOSING 1RAD STRATEGIC DIAGNOSTICS<br/>
              Receipt generated on: ${new Date().toLocaleString()}
            </div>
          </div>
        </body>
      </html>
    `);
  };

  return (
    <div className="billing-page" style={{ padding: '40px', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Header Section */}
      <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 950, color: '#1a1a2e', letterSpacing: '-1px', marginBottom: '8px', display: 'flex', gap: '15px', alignItems: 'center' }}>
            <span style={{ cursor: 'pointer', opacity: billingViewMode === 'INVOICES' ? 1 : 0.4 }} onClick={() => setBillingViewMode('INVOICES')}>REVENUE HUB</span>
            <span style={{ opacity: 0.2 }}>|</span>
            <span style={{ cursor: 'pointer', opacity: billingViewMode === 'EXPENSES' ? 1 : 0.4, color: '#dc2626' }} onClick={() => setBillingViewMode('EXPENSES')}>EXPENSE LEDGER</span>
            <span style={{ opacity: 0.2 }}>|</span>
            <span style={{ cursor: 'pointer', opacity: billingViewMode === 'REFERRAL_CUTS' ? 1 : 0.4, color: '#e11d48' }} onClick={() => setBillingViewMode('REFERRAL_CUTS')}>REFERRAL HUB</span>
            <span style={{ opacity: 0.2 }}>|</span>
            <span style={{ cursor: 'pointer', opacity: billingViewMode === 'ANALYTICS' ? 1 : 0.4, color: '#0f52ba' }} onClick={() => setBillingViewMode('ANALYTICS')}>ANALYTICS HUB</span>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ 
              background: 'var(--tactical-indigo)', color: 'white', padding: '4px 10px', 
              borderRadius: '6px', fontSize: '10px', fontWeight: 900, letterSpacing: '1px' 
            }}>
              {activeCenter?.name?.toUpperCase() || 'CORE HUB'}
            </span>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
              Fiscal Year 2026-27 | Global Financial Matrix
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
           <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                placeholder="SEARCH INVOICES / PATIENTS..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ padding: '12px 15px 12px 42px', borderRadius: '12px', border: '1px solid #e2e8f0', width: '280px', fontSize: '11px', fontWeight: 800 }}
              />
           </div>
          <div style={{ display: 'flex', gap: '15px' }}>
             <button 
               onClick={() => setIsExportDrawerOpen(true)}
               style={{ 
                 padding: '12px 24px', borderRadius: '12px', border: '1px solid #e2e8f0', 
                 background: '#10b981', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer',
                 boxShadow: '0 8px 20px rgba(16, 185, 129, 0.2)'
               }}
             >
               EXPORT FISCAL DATA
             </button>
             {localStorage.getItem('1rad_invoices') && (
               <button 
                 onClick={handleSyncLegacyData}
                 disabled={isSyncing}
                 style={{ 
                   padding: '12px 24px', borderRadius: '12px', border: '1px solid #e2e8f0', 
                   background: '#f8fafc', color: '#0f52ba', fontSize: '11px', fontWeight: 950, cursor: 'pointer',
                 }}
               >
                 {isSyncing ? 'SYNCING...' : 'SYNC LOCAL'}
               </button>
             )}
             <button 
               onClick={() => setIsNewInvoiceDrawerOpen(true)}
               style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', background: '#0f52ba', color: 'white', fontWeight: 800, fontSize: '11px', cursor: 'pointer', boxShadow: '0 8px 20px rgba(15, 82, 186, 0.2)' }}
             >
               NEW MANUAL INVOICE
             </button>
          </div>
        </div>
      </div>

      {billingViewMode === 'EXPENSES' && (
        <ExpenseLedger 
          outflowStats={outflowStats}
          filteredOutflow={filteredOutflow}
          paginatedOutflow={paginatedOutflow}
          globalOutflow={globalOutflow}
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          handleDeleteExpense={handleDeleteExpense}
          setEditExpense={setEditExpense}
          setIsExpenseDrawerOpen={setIsExpenseDrawerOpen}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          itemsPerPage={itemsPerPage}
          sortConfig={sortConfig}
          handleSort={handleSort}
          TODAY={TODAY}
        />
      )}

      {billingViewMode === 'INVOICES' && (
        <RevenueHub 
          filteredInvoices={filteredInvoices}
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
          paginatedInvoices={paginatedInvoices}
          renderPagination={renderPagination}
          handleOpenInvoice={handleOpenInvoice}
          handleDeleteInvoice={handleDeleteInvoice}
          handlePrintA4={handlePrintA4}
          handlePrintThermal={handlePrintThermal}
          handlePrintReceipt={handlePrintReceipt}
          isMobile={isMobile}
          recordedPayouts={recordedPayouts}
          setEditPayout={setEditPayout}
          setIsPayoutDrawerOpen={setIsPayoutDrawerOpen}
          referrers={referrers}
          setSelectedInvoice={setSelectedInvoice}
          setIsInvoiceDrawerOpen={setIsInvoiceDrawerOpen}
          sortConfig={sortConfig}
          handleSort={handleSort}
          futureAppointments={futureAppointments}
          paginatedFutureAppointments={paginatedFutureAppointments}
          serviceRegistry={serviceRegistry}
        />
      )}


      {billingViewMode === 'REFERRAL_CUTS' && (
        <ReferralHub 
          filteredReferralCuts={filteredReferralCuts}
          paginatedReferralCuts={paginatedReferralCuts}
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          handleToggleCommissionStatus={handleToggleCommissionStatus}
          handleDeleteExpense={handleDeleteExpense}
          setEditPayout={setEditPayout}
          setIsPayoutDrawerOpen={setIsPayoutDrawerOpen}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          itemsPerPage={itemsPerPage}
          sortConfig={sortConfig}
          handleSort={handleSort}
        />
      )}

      {billingViewMode === 'ANALYTICS' && matrix && (
        <AnalyticsHub 
          liveStats={liveStats}
          outflowStats={outflowStats}
          matrix={matrix}
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
        />
      )}

      {/* Shared Drawers */}
      {isInvoiceDrawerOpen && (
        <InvoiceDrawer 
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
          handlePrintA4={handlePrintA4}
          handlePrintThermal={handlePrintThermal}
          onApplyAdjustment={handleApplyAdjustment}
        />

      )}
      {isNewInvoiceDrawerOpen && (
        <NewInvoiceDrawer 
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
        />
      )}
      {isExportDrawerOpen && (
        <ExportDrawer 
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
          setIsPayoutDrawerOpen={setIsPayoutDrawerOpen}
          handleSavePayout={handleSavePayout}
          editPayout={editPayout}
          setEditPayout={setEditPayout}
          isSavingPayout={isSavingPayout}
        />
      )}
    </div>
  );
}
