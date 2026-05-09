import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useAuth from '../auth/useAuth';
import apiClient from '../api/apiClient';
import useOffline from '../hooks/useOffline';
import { nativeStorage } from '../hooks/useElectron';
import '../styles/BillingPage.css';

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
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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

    return () => window.removeEventListener('resize', handleResize);
  }, [fetchInvoices, fetchStats, fetchRegistry, fetchMatrix, fetchExpenses, fetchReferrers, fetchCommissions]);

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
    
    return safeInvoices.filter(inv => {
      if (!inv) return false;
      // Search Filter
      const matchesSearch = String(inv.patientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (inv.displayId && String(inv.displayId).toLowerCase().includes(searchTerm.toLowerCase()));
      
      if (!matchesSearch) return false;

      // Status Filter
      if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;

      // Time Filter Logic
      const invDate = inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-CA') : null;
      if (timeFilter === 'TODAY' && invDate !== today) return false;
      if (timeFilter === 'PAST' && invDate === today) return false;
      if (timeFilter === 'CUSTOM') {
          if (startDate && invDate < startDate) return false;
          if (endDate && invDate > endDate) return false;
      }
      
      // Modality Filter
      if (modalityFilter !== 'ALL' && inv.modality !== modalityFilter) return false;

      return true;
    });
  }, [invoices, searchTerm, timeFilter, statusFilter, modalityFilter, startDate, endDate]);
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

    return [...operationalExpenses, ...referralCuts].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [expenses, combinedReferralCuts]);

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
        return true;
    });
  }, [combinedReferralCuts, timeFilter, startDate, endDate]);

  const totalPages = Math.ceil(
    billingViewMode === 'INVOICES' ? filteredInvoices.length / itemsPerPage :
    billingViewMode === 'REFERRAL_CUTS' ? filteredReferralCuts.length / itemsPerPage :
    1
  );

  const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const paginatedReferralCuts = filteredReferralCuts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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

  const handleCollectPayment = async () => {
    const payload = { 
      invoiceId: selectedInvoice.invoiceId, 
      amount: (selectedInvoice.totalAmount - (selectedInvoice.paidAmount || 0)), 
      discountAmount: selectedInvoice.discountAmount,
      paymentMethod 
    };

    try {
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
    
    const payload = {
      patientId: selectedPatient.patientId,
      appointmentId: newInvoiceData.items.find(it => it.appointmentId)?.appointmentId || null,
      discountAmount: Number(newInvoiceData.discountAmount || 0),
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
              Thank you for choosing 1Rad Diagnostic Services.
            </div>
          </div>
        </body>
      </html>
    `);
  };

  // --- RENDERERS ---
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    
    // Calculate page range to show (e.g., max 5 pages)
    const delta = 2;
    const range = [];
    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
        range.push(i);
    }

    if (currentPage - delta > 2) range.unshift('...');
    if (currentPage + delta < totalPages - 1) range.push('...');

    range.unshift(1);
    if (totalPages > 1) range.push(totalPages);

    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '30px', padding: '20px', borderTop: '1px solid #f1f5f9' }}>
        <button 
          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          disabled={currentPage === 1}
          style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', fontSize: '10px', fontWeight: 950, cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1, transition: 'all 0.2s' }}
        >PREV</button>
        
        <div style={{ display: 'flex', gap: '5px' }}>
            {range.map((p, idx) => (
                <button
                    key={idx}
                    disabled={p === '...'}
                    onClick={() => p !== '...' && setCurrentPage(p)}
                    style={{
                        width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #e2e8f0',
                        background: currentPage === p ? '#0f52ba' : 'white',
                        color: currentPage === p ? 'white' : '#64748b',
                        fontSize: '11px', fontWeight: 950, cursor: p === '...' ? 'default' : 'pointer',
                        transition: 'all 0.2s',
                        borderColor: currentPage === p ? '#0f52ba' : '#e2e8f0'
                    }}
                >
                    {p}
                </button>
            ))}
        </div>

        <button 
          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          disabled={currentPage === totalPages}
          style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', fontSize: '10px', fontWeight: 950, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.5 : 1, transition: 'all 0.2s' }}
        >NEXT</button>
      </div>
    );
  };

  const renderInvoiceDrawer = () => {
    if (!selectedInvoice) return null;
    const isPaid = selectedInvoice.status === 'PAID';

    return (
      <div className="drawer-overlay" onClick={() => setIsInvoiceDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
        <div className="drawer-content" style={{ padding: 0, width: '600px', background: 'white' }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '35px', background: isPaid ? '#10b981' : 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                   <h2 style={{ fontSize: '11px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Financial Clearance</h2>
                   <div style={{ fontSize: '24px', fontWeight: 950, letterSpacing: '-1px' }}>{selectedInvoice.displayId}</div>
                </div>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                   <div style={{ padding: '8px 15px', background: 'rgba(255,255,255,0.2)', borderRadius: '10px', fontSize: '10px', fontWeight: 950 }}>
                      {selectedInvoice.status}
                   </div>
                   <button 
                     onClick={() => setIsInvoiceDrawerOpen(false)}
                     style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer', opacity: 0.7, padding: '5px' }}
                     onMouseOver={e => e.currentTarget.style.opacity = 1}
                     onMouseOut={e => e.currentTarget.style.opacity = 0.7}
                   >✕</button>
                </div>
             </div>
          </div>

          <div style={{ padding: '35px' }}>
             <div style={{ marginBottom: '30px' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>PATIENT_IDENTITY</span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#1a1a2e', marginTop: '4px' }}>{selectedInvoice.patientName.toUpperCase()}</div>
             </div>

             <div style={{ marginBottom: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                   <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>LINE_ITEMS_MANIFEST</span>
                   {!isPaid && <button onClick={handleAddItem} style={{ color: '#0f52ba', border: 'none', background: 'none', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>+ ADD CUSTOM ITEM</button>}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                   {selectedInvoice.items.map((item, idx) => (
                     <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                        <input 
                          disabled={isPaid}
                          type="text" value={item.description} 
                          onChange={e => handleUpdateItem(idx, 'description', e.target.value)}
                          placeholder="Description"
                          style={{ flex: 2, background: 'transparent', border: 'none', borderBottom: isPaid ? 'none' : '1px solid #ddd', fontSize: '12px', fontWeight: 700 }}
                        />
                        <input 
                          disabled={isPaid}
                          type="number" value={item.amount} 
                          onChange={e => handleUpdateItem(idx, 'amount', parseInt(e.target.value) || 0)}
                          style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: isPaid ? 'none' : '1px solid #ddd', fontSize: '12px', fontWeight: 950, textAlign: 'right' }}
                        />
                        {!isPaid && <button onClick={() => handleRemoveItem(idx)} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>}
                     </div>
                   ))}
                </div>
             </div>

             <div style={{ borderTop: '2px dashed #f1f5f9', paddingTop: '20px', marginBottom: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                   <span style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>GROSS_TOTAL</span>
                   <span style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b' }}>₹{(selectedInvoice.grossAmount || 0).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                   <span style={{ fontSize: '11px', fontWeight: 950, color: '#ef4444', letterSpacing: '1px' }}>DEDUCTION_REBATE</span>
                   {isPaid ? (
                     <span style={{ fontSize: '13px', fontWeight: 950, color: '#ef4444' }}>- ₹{(selectedInvoice.discountAmount || 0).toLocaleString()}</span>
                   ) : (
                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                           {[5, 10, 25, 50].map(pct => (
                             <button 
                               key={pct}
                               onClick={() => {
                                 const gross = selectedInvoice.grossAmount || 0;
                                 const disc = Math.round(gross * (pct / 100));
                                 setSelectedInvoice(recalculateInvoice({ ...selectedInvoice, discountAmount: disc }));
                               }}
                               style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecdd3', background: '#fff1f2', color: '#e11d48', fontSize: '8px', fontWeight: 950, cursor: 'pointer' }}
                             >{pct}%</button>
                           ))}
                        </div>
                        <input 
                          type="number" 
                          value={selectedInvoice.discountAmount} 
                          onChange={e => {
                            const disc = parseInt(e.target.value) || 0;
                            const gross = selectedInvoice.grossAmount || 0;
                            const net = gross - disc;
                            setSelectedInvoice({ 
                              ...selectedInvoice, 
                              discountAmount: disc,
                              totalAmount: net,
                              balanceAmount: net - (selectedInvoice.paidAmount || 0)
                            });
                          }}
                          style={{ width: '80px', padding: '6px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 950, textAlign: 'right', color: '#ef4444', outline: 'none' }}
                        />
                     </div>
                   )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px' }}>
                   <span style={{ fontSize: '14px', fontWeight: 950, color: '#1a1a2e' }}>NET_PAYABLE_QUANTUM</span>
                   <span style={{ fontSize: '24px', fontWeight: 950, color: '#0f52ba' }}>₹{selectedInvoice.totalAmount.toLocaleString()}</span>
                </div>
             </div>


             {!isPaid ? (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                     <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '10px', display: 'block' }}>PAYMENT_PROTOCOL</span>
                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                        {['CASH', 'UPI', 'CARD'].map(m => (
                          <button 
                            key={m} 
                            onClick={() => setPaymentMethod(m)}
                            style={{ 
                              padding: '12px', borderRadius: '12px', border: paymentMethod === m ? '2px solid #0f52ba' : '1px solid #e2e8f0',
                              background: paymentMethod === m ? '#f0f4ff' : 'white', color: paymentMethod === m ? '#0f52ba' : '#64748b',
                              fontSize: '10px', fontWeight: 950, cursor: 'pointer'
                            }}
                          >
                            {m}
                          </button>
                        ))}
                     </div>
                  </div>
                  <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                     <button onClick={handleSaveInvoice} style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #eee', fontWeight: 800, cursor: 'pointer' }}>SAVE CHANGES</button>
                     <button onClick={handleCollectPayment} style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', background: '#0f52ba', color: 'white', fontWeight: 950, cursor: 'pointer' }}>PROCESS PAYMENT & CLOSE</button>
                  </div>
               </div>
             ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bcf0da', padding: '20px', borderRadius: '16px', textAlign: 'center' }}>
                     <div style={{ fontSize: '24px', marginBottom: '10px' }}>✅</div>
                     <div style={{ fontSize: '12px', fontWeight: 950, color: '#166534' }}>TRANSACTION SETTLED</div>
                     <div style={{ fontSize: '10px', color: '#166534', opacity: 0.7, marginTop: '4px' }}>Processed on {new Date(selectedInvoice.createdAt).toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                     <button 
                       onClick={handlePrintA4}
                       style={{ padding: '16px', borderRadius: '16px', border: '1px solid #0f52ba', background: 'white', color: '#0f52ba', fontWeight: 950, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                     >
                       <span>📄</span> PRINT A4 INVOICE
                     </button>
                     <button 
                       onClick={handlePrintThermal}
                       style={{ padding: '16px', borderRadius: '16px', border: 'none', background: 'linear-gradient(135deg, #0f52ba, #061a40)', color: 'white', fontWeight: 950, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                     >
                       <span>📠</span> THERMAL RECEIPT
                     </button>
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>
    );
  };

  const renderExportDrawer = () => {
    return (
      <div className="drawer-overlay" onClick={() => setIsExportDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
        <div className="drawer-content" style={{ padding: 0, width: '500px', background: 'white' }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '35px', background: 'linear-gradient(135deg, #10b981 0%, #064e3b 100%)', color: 'white' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                   <h2 style={{ fontSize: '11px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Fiscal Intelligence</h2>
                   <div style={{ fontSize: '24px', fontWeight: 950, letterSpacing: '-1px' }}>FINANCIAL EXPORT CONSOLE</div>
                </div>
                <button 
                  onClick={() => setIsExportDrawerOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer', opacity: 0.7, padding: '5px' }}
                >✕</button>
             </div>
          </div>

          <div style={{ padding: '35px' }}>
             <div style={{ marginBottom: '35px' }}>
                <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', display: 'block', marginBottom: '15px' }}>EXPORT_SCOPE_SELECTION</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                   <button 
                     onClick={() => setExportMode('ALL')}
                     style={{ 
                       padding: '20px', borderRadius: '16px', border: exportMode === 'ALL' ? '2px solid #10b981' : '1px solid #e2e8f0',
                       background: exportMode === 'ALL' ? '#f0fdf4' : 'white', textAlign: 'center', cursor: 'pointer'
                     }}
                   >
                     <div style={{ fontSize: '24px', marginBottom: '8px' }}>📊</div>
                     <div style={{ fontSize: '11px', fontWeight: 950, color: exportMode === 'ALL' ? '#059669' : '#64748b' }}>FULL LEDGER</div>
                     <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '4px' }}>ALL RECOREDS (SLOW)</div>
                   </button>
                   <button 
                     onClick={() => setExportMode('RANGE')}
                     style={{ 
                       padding: '20px', borderRadius: '16px', border: exportMode === 'RANGE' ? '2px solid #10b981' : '1px solid #e2e8f0',
                       background: exportMode === 'RANGE' ? '#f0fdf4' : 'white', textAlign: 'center', cursor: 'pointer'
                     }}
                   >
                     <div style={{ fontSize: '24px', marginBottom: '8px' }}>📅</div>
                     <div style={{ fontSize: '11px', fontWeight: 950, color: exportMode === 'RANGE' ? '#059669' : '#64748b' }}>TEMPORAL RANGE</div>
                     <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '4px' }}>CUSTOM DATE WINDOW</div>
                   </button>
                </div>
             </div>

             {exportMode === 'RANGE' && (
               <div style={{ marginBottom: '40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', animation: 'fadeIn 0.3s' }}>
                  <div>
                     <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '10px' }}>START_DATE</label>
                     <input 
                       type="date" 
                       value={exportDates.start}
                       onChange={e => setExportDates({ ...exportDates, start: e.target.value })}
                       style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 800 }}
                     />
                  </div>
                  <div>
                     <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '10px' }}>END_DATE</label>
                     <input 
                       type="date" 
                       value={exportDates.end}
                       onChange={e => setExportDates({ ...exportDates, end: e.target.value })}
                       style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 800 }}
                     />
                  </div>
               </div>
             )}

             <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #f1f5f9', marginBottom: '40px' }}>
                <div style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1px', marginBottom: '10px' }}>REVENUE_EXTRACTION_DETAILS</div>
                <div style={{ display: 'flex', gap: '15px' }}>
                   <div style={{ fontSize: '20px' }}>🛰️</div>
                   <div>
                      <div style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>Format: Microsoft Excel (.xlsx)</div>
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>Includes full audit trail and line-item manifest.</div>
                   </div>
                </div>
             </div>

             <button 
               onClick={handleExportData}
               style={{ 
                 width: '100%', padding: '20px', borderRadius: '18px', border: 'none', 
                 background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                 color: 'white', fontWeight: 950, fontSize: '13px', cursor: 'pointer',
                 boxShadow: '0 10px 30px rgba(16, 185, 129, 0.3)'
               }}
             >
                INITIATE FISCAL EXPORT
             </button>
          </div>
        </div>
      </div>
    );
  };

  const renderExpenseDrawer = () => (
    <div className="drawer-overlay" onClick={() => setIsExpenseDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ padding: 0, width: '500px', background: 'white' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '35px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: 'white' }}>
           <h2 style={{ fontSize: '11px', fontWeight: 950, color: '#38bdf8', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Strategic Fiscal Ledger</h2>
           <div style={{ fontSize: '20px', fontWeight: 950, letterSpacing: '-1px' }}>INSTITUTIONAL_DEBIT_PROTOCOL</div>
        </div>

        <div style={{ padding: '35px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
           <form onSubmit={handleSaveExpense}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>TRANSACTION_DATE</label>
                      <input 
                         type="date" required 
                         value={editExpense.transactionDate} 
                         onChange={e => setEditExpense({...editExpense, transactionDate: e.target.value})}
                         style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }}
                      />
                   </div>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>APPROVAL_STATUS</label>
                      <select 
                         value={editExpense.status} 
                         onChange={e => setEditExpense({...editExpense, status: e.target.value})}
                         style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: '#f8fafc' }}
                      >
                         {['Draft', 'Pending', 'Approved', 'Paid'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                   </div>
                </div>

                <div className="form-group">
                   <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '2px', marginBottom: '10px' }}>PAYEE / REFERRER IDENTITY</label>
                   <input 
                      type="text" required 
                      list="vendor-suggestions"
                      value={editExpense.vendorName} 
                      placeholder="Select a doctor or type vendor name..."
                      onChange={e => setEditExpense({...editExpense, vendorName: e.target.value})}
                      style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '15px', fontWeight: 800, padding: '10px 0', outline: 'none' }}
                   />
                   <datalist id="vendor-suggestions">
                      {/* System Referrers */}
                      {referrers.map(r => <option key={`ref-${r.referrerId || r.id}`} value={r.name || r.fullName} />)}
                      {/* Historical Vendors */}
                      {[...new Set(expenses.map(e => e.vendorName))].filter(v => v).map(v => (
                         <option key={`hist-${v}`} value={v} />
                      ))}
                   </datalist>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>EXPENSE_CATEGORY</label>
                      <select 
                         value={editExpense.category} 
                         onChange={e => setEditExpense({...editExpense, category: e.target.value})}
                         style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: 'white' }}
                      >
                        {['Maintenance', 'Staff Salary', 'Utilities', 'Reagents', 'Marketing', 'Rent', 'Consumables', 'Other'].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                   </div>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>COST_CENTER</label>
                      <select 
                         value={editExpense.costCenter} 
                         onChange={e => setEditExpense({...editExpense, costCenter: e.target.value})}
                         style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: 'white' }}
                      >
                        {['Radiology', 'Laboratory', 'Pharmacy', 'OPD', 'Administration', 'Logistics'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                   </div>
                </div>

                <div className="form-group">
                   <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>DESCRIPTION_LOG</label>
                   <input 
                      type="text" required 
                      value={editExpense.description} 
                      placeholder="Detailed breakdown of the expenditure..."
                      onChange={e => setEditExpense({...editExpense, description: e.target.value})}
                      style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }}
                   />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>BASE_AMOUNT (₹)</label>
                      <input 
                         type="number" required 
                         value={editExpense.amount} 
                         onChange={e => setEditExpense({...editExpense, amount: parseFloat(e.target.value)})}
                         style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '18px', fontWeight: 950, padding: '10px 0', outline: 'none', color: '#1e293b' }}
                      />
                   </div>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>TAX_GST (₹)</label>
                      <input 
                         type="number" 
                         value={editExpense.taxAmount} 
                         onChange={e => setEditExpense({...editExpense, taxAmount: parseFloat(e.target.value)})}
                         style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '18px', fontWeight: 950, padding: '10px 0', outline: 'none', color: '#64748b' }}
                      />
                   </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>PAYMENT_MODE</label>
                      <select 
                         value={editExpense.paymentMode} 
                         onChange={e => setEditExpense({...editExpense, paymentMode: e.target.value})}
                         style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: 'white' }}
                      >
                         {['Cash', 'UPI', 'Bank Transfer', 'Cheque'].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                   </div>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>REFERENCE_NO</label>
                      <input 
                         type="text" 
                         value={editExpense.referenceNumber} 
                         placeholder="TXN / BILL ID"
                         onChange={e => setEditExpense({...editExpense, referenceNumber: e.target.value})}
                         style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '13px', fontWeight: 700, padding: '8px 0', outline: 'none' }}
                      />
                   </div>
                </div>
              </div>

              <div style={{ marginTop: '40px', display: 'flex', gap: '15px' }}>
                 <button type="button" onClick={() => setIsExpenseDrawerOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>CANCEL</button>
                 <button type="submit" disabled={savingExpense} style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', background: '#0f172a', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>
                   {savingExpense ? 'RECORDING...' : 'COMMIT TO LEDGER →'}
                 </button>
              </div>
           </form>
        </div>
      </div>
    </div>
  );

  const renderNewInvoiceDrawer = () => (
    <div className="drawer-overlay" onClick={() => setIsNewInvoiceDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ padding: 0, width: '550px', background: 'white' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '35px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                 <h2 style={{ fontSize: '11px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Manual Revenue Input</h2>
                 <div style={{ fontSize: '24px', fontWeight: 950, letterSpacing: '-1px' }}>GENERATE NEW INVOICE</div>
              </div>
              <button 
                onClick={() => setIsNewInvoiceDrawerOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer', opacity: 0.7, padding: '5px' }}
                onMouseOver={e => e.currentTarget.style.opacity = 1}
                onMouseOut={e => e.currentTarget.style.opacity = 0.7}
              >✕</button>
           </div>
        </div>

        <div style={{ padding: '35px' }}>
           <form onSubmit={handleCreateManualInvoice}>
              <div style={{ marginBottom: '30px', position: 'relative' }}>
                 <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>SEARCH_PATIENT_REGISTRY</label>
                 
                 {!selectedPatient ? (
                   <>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                      <input 
                          type="text"
                          value={patientSearchQuery}
                          placeholder="SEARCH BY NAME / UHID / CONTACT..."
                          onChange={e => setPatientSearchQuery(e.target.value)}
                          style={{ width: '100%', padding: '14px 14px 14px 40px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700 }}
                      />
                    </div>
                    {isSearchingPatients && <div style={{ fontSize: '10px', color: '#0f52ba', marginTop: '5px', fontWeight: 800 }}>SCANNING REGISTRY...</div>}
                    
                    {patientResults.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', zIndex: 10, marginTop: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                        {patientResults.map(p => (
                          <div 
                            key={p.patientId} 
                            onClick={() => { 
                              setSelectedPatient(p); 
                              setPatientResults([]); 
                              fetchPendingBillables(p.patientId);
                            }}
                            style={{ padding: '15px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }}
                            onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseOut={e => e.currentTarget.style.background = 'white'}
                          >
                             <div style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>{p.fullName.toUpperCase()}</div>
                             <div style={{ display: 'flex', gap: '15px', marginTop: '4px' }}>
                                <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748b' }}>UHID: {p.patientIdentifier}</span>
                                <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748b' }}>{p.gender} | {p.age}Y</span>
                             </div>
                          </div>
                        ))}
                      </div>
                    )}
                   </>
                 ) : (
                   <div style={{ background: '#f0f4ff', padding: '15px', borderRadius: '12px', border: '1px solid #dbeafe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', marginBottom: '2px' }}>SELECTED PATIENT</div>
                        <div style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b' }}>{selectedPatient.fullName.toUpperCase()}</div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b' }}>UHID: {selectedPatient.patientIdentifier}</div>
                      </div>
                      <button type="button" onClick={() => { setSelectedPatient(null); setPendingServices([]); }} style={{ border: 'none', background: 'none', color: '#0f52ba', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>CHANGE</button>
                   </div>
                 )}
              </div>

              <div style={{ marginBottom: '30px', opacity: selectedPatient ? 1 : 0.4, pointerEvents: selectedPatient ? 'auto' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                     <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>SERVICE_CATALOG_&_PENDING</span>
                  </div>

                  {/* Pending Services From Appointments */}
                  {pendingServices.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                       <p style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', marginBottom: '10px' }}>PENDING FROM APPOINTMENTS</p>
                       <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {pendingServices.map((s, idx) => (
                            <button 
                              key={idx}
                              type="button"
                              onClick={() => {
                                const newItems = [...newInvoiceData.items];
                                if (newItems.length === 1 && !newItems[0].description) {
                                  newItems[0] = { description: s.service, amount: s.amount || 0, quantity: 1, appointmentId: s.appointmentId };
                                } else {
                                  newItems.push({ description: s.service, amount: s.amount || 0, quantity: 1, appointmentId: s.appointmentId });
                                }
                                setNewInvoiceData({ ...newInvoiceData, items: newItems });
                                setPendingServices(prev => prev.filter((_, i) => i !== idx));
                              }}
                              style={{ 
                                padding: '8px 12px', border: '1px dashed #0f52ba', background: '#f0f4ff', color: '#0f52ba', 
                                borderRadius: '10px', fontSize: '10px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' 
                              }}
                            >
                              <span style={{ opacity: 0.7 }}>+</span> {s.service} (₹{s.amount || 'N/A'})
                            </button>
                          ))}
                       </div>
                    </div>
                  )}

                  {/* Global Service Registry */}
                  <div>
                    <p style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', marginBottom: '10px' }}>AVAILABLE SERVICES (REGISTRY)</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '120px', overflowY: 'auto', padding: '4px' }}>
                       {serviceRegistry.map((s) => (
                         <button 
                           key={s.id}
                           type="button"
                           onClick={() => {
                             const newItems = [...newInvoiceData.items];
                             if (newItems.length === 1 && !newItems[0].description) {
                               newItems[0] = { description: s.serviceName, amount: s.amount, quantity: 1 };
                             } else {
                               newItems.push({ description: s.serviceName, amount: s.amount, quantity: 1 });
                             }
                             setNewInvoiceData({ ...newInvoiceData, items: newItems });
                           }}
                           style={{ 
                             padding: '6px 10px', border: '1px solid #e2e8f0', background: 'white', color: '#1e293b', 
                             borderRadius: '8px', fontSize: '9px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' 
                           }}
                           onMouseOver={e => { e.currentTarget.style.borderColor = '#0f52ba'; e.currentTarget.style.background = '#f8fafc'; }}
                           onMouseOut={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white'; }}
                         >
                           {s.serviceName}
                         </button>
                       ))}
                    </div>
                  </div>

                  <div style={{ height: '30px' }}></div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                     <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CHARGE_MANIFEST</span>
                     <button type="button" onClick={() => setNewInvoiceData({ ...newInvoiceData, items: [...newInvoiceData.items, { description: '', amount: 0, quantity: 1 }] })} style={{ color: '#0f52ba', border: 'none', background: 'none', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>+ ADD LINE</button>
                  </div>
                 
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {newInvoiceData.items.map((item, idx) => (
                      <div key={idx} style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                           <div style={{ flex: 3, position: 'relative' }}>
                              <label style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '5px' }}>SERVICE_DEFINITION</label>
                              <input 
                                type="text" required placeholder="Select or type service..." value={item.description}
                                onChange={e => {
                                  const items = [...newInvoiceData.items];
                                  items[idx].description = e.target.value;
                                  setNewInvoiceData({ ...newInvoiceData, items });
                                }}
                                style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '11px', fontWeight: 700 }}
                              />
                              
                              {/* Service Dropdown (shows if text matches or on focus - simplified) */}
                              {item.description.length > 0 && serviceRegistry.some(s => s.serviceName.toLowerCase().includes(item.description.toLowerCase()) && s.serviceName !== item.description) && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', zIndex: 100, maxHeight: '150px', overflowY: 'auto' }}>
                                   {serviceRegistry.filter(s => s.serviceName.toLowerCase().includes(item.description.toLowerCase())).map(s => (
                                     <div 
                                       key={s.id}
                                       onClick={() => {
                                          const items = [...newInvoiceData.items];
                                          items[idx].description = s.serviceName;
                                          items[idx].amount = s.amount;
                                          setNewInvoiceData({ ...newInvoiceData, items });
                                       }}
                                       style={{ padding: '10px', fontSize: '10px', fontWeight: 800, cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
                                       onMouseOver={e => e.currentTarget.style.background = '#f0f4ff'}
                                       onMouseOut={e => e.currentTarget.style.background = 'white'}
                                     >
                                       {s.modality}: {s.serviceName} (₹{s.amount})
                                     </div>
                                   ))}
                                </div>
                              )}
                           </div>

                           <div style={{ flex: 1 }}>
                              <label style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '5px' }}>AMOUNT</label>
                              <input 
                                type="number" required placeholder="₹" value={item.amount}
                                onChange={e => {
                                  const items = [...newInvoiceData.items];
                                  items[idx].amount = parseInt(e.target.value) || 0;
                                  setNewInvoiceData({ ...newInvoiceData, items });
                                }}
                                style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, textAlign: 'right' }}
                              />
                           </div>

                           {newInvoiceData.items.length > 1 && (
                             <button type="button" onClick={() => setNewInvoiceData({ ...newInvoiceData, items: newInvoiceData.items.filter((_, i) => i !== idx) })} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', marginTop: '15px' }}>✕</button>
                           )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* FISCAL SUMMARY (DISCOUNT MODULE) */}
                  <div style={{ marginTop: '25px', padding: '20px', background: '#f1f5f9', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>GROSS_TOTAL</span>
                        <span style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>₹{newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0)}</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <span style={{ fontSize: '10px', fontWeight: 950, color: '#ef4444', letterSpacing: '1px' }}>DEDUCTION_DISCOUNT</span>
                           <span style={{ fontSize: '8px', background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: '4px', fontWeight: 900 }}>REBATE</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                           <div style={{ display: 'flex', gap: '4px' }}>
                              {[5, 10, 25, 50].map(pct => (
                                <button 
                                  key={pct}
                                  type="button"
                                  onClick={() => {
                                    const gross = newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
                                    setNewInvoiceData({ ...newInvoiceData, discountAmount: Math.round(gross * (pct / 100)) });
                                  }}
                                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecdd3', background: '#fff1f2', color: '#e11d48', fontSize: '8px', fontWeight: 950, cursor: 'pointer' }}
                                >{pct}%</button>
                              ))}
                           </div>
                           <input 
                              type="number" 
                              value={newInvoiceData.discountAmount} 
                              onChange={e => setNewInvoiceData({ ...newInvoiceData, discountAmount: parseInt(e.target.value) || 0 })}
                              style={{ width: '80px', padding: '6px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 950, textAlign: 'right', color: '#ef4444', outline: 'none' }}
                           />
                        </div>
                     </div>
                     <div style={{ borderTop: '2px dashed #cbd5e1', marginTop: '15px', paddingTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px' }}>NET_PAYABLE_AMOUNT</span>
                        <span style={{ fontSize: '18px', fontWeight: 950, color: '#0f52ba' }}>
                           ₹{Math.max(0, newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0) - (newInvoiceData.discountAmount || 0))}
                        </span>
                     </div>
                  </div>
               </div>

               <button type="submit" disabled={!selectedPatient} style={{ width: '100%', padding: '18px', borderRadius: '16px', border: 'none', background: selectedPatient ? '#0f52ba' : '#cbd5e1', color: 'white', fontWeight: 950, cursor: selectedPatient ? 'pointer' : 'not-allowed', marginTop: '20px' }}>
                  AUTHORIZE & DEPLOY INVOICE
               </button>
            </form>
         </div>
      </div>
    </div>
  );

  const renderPayoutDrawer = () => (
    <div className="drawer-overlay" onClick={() => setIsPayoutDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ padding: 0, width: '450px', background: 'white' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '35px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white' }}>
           <h2 style={{ fontSize: '11px', fontWeight: 950, color: '#38bdf8', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Fiscal Disbursement</h2>
           <div style={{ fontSize: '20px', fontWeight: 950, letterSpacing: '-1px' }}>{editPayout.commissionId ? 'REVISE REFERRAL RECORD' : 'RECORD REFERRAL PAYOUT'}</div>
           <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginTop: '10px', fontWeight: 600 }}>
             {editPayout.commissionId ? `Modifying existing commission ID: ${editPayout.commissionId}` : `Logging financial commission for clinical partner based on mission ID: ${editPayout.invoiceId}`}
           </p>
        </div>

        <div style={{ padding: '35px' }}>
           <form onSubmit={handleSavePayout}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                 <div className="form-group">
                    <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>PARTNER_IDENTITY</label>
                    <input 
                       type="text" disabled 
                       value={editPayout.referrerName?.toUpperCase()} 
                       style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '16px', fontWeight: 950, padding: '10px 0', background: 'transparent', color: '#1e293b' }}
                    />
                 </div>

                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="form-group">
                       <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>DISBURSEMENT_AMOUNT (₹)</label>
                       <input 
                          type="number" required 
                          value={editPayout.amount} 
                          onChange={e => setEditPayout({...editPayout, amount: e.target.value})}
                          style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '20px', fontWeight: 950, padding: '10px 0', outline: 'none', color: '#0f52ba' }}
                       />
                    </div>
                    <div className="form-group">
                       <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>CLINICAL_MODALITY</label>
                       <select 
                          value={editPayout.modality} 
                          onChange={e => setEditPayout({...editPayout, modality: e.target.value})}
                          style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: 'white' }}
                       >
                          {['MRI', 'CT', 'X-RAY', 'ULTRASOUND', 'DEXA', 'MAMMOGRAPHY', 'LAB'].map(m => <option key={m} value={m}>{m}</option>)}
                       </select>
                    </div>
                 </div>

                 <div className="form-group">
                    <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>TRANSACTION_REMARKS</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="form-group">
                       <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>PAYMENT_STATUS</label>
                       <div style={{ display: 'flex', background: '#f8fafc', padding: '5px', borderRadius: '12px', border: '1px solid #eee' }}>
                          {['UNPAID', 'PAID'].map(s => (
                            <button 
                              key={s} type="button"
                              onClick={() => setEditPayout({...editPayout, status: s})}
                              style={{ 
                                flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '10px', fontWeight: 950,
                                background: editPayout.status === s ? (s === 'PAID' ? '#10b981' : '#e11d48') : 'transparent',
                                color: editPayout.status === s ? 'white' : '#64748b',
                                cursor: 'pointer', transition: 'all 0.2s'
                              }}
                            >{s}</button>
                          ))}
                       </div>
                    </div>
                    <div className="form-group">
                       <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>TRANSACTION_REMARKS</label>
                       <input 
                          type="text" 
                          value={editPayout.remarks} 
                          placeholder="Incentive details..."
                          onChange={e => setEditPayout({...editPayout, remarks: e.target.value})}
                          style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '12px', fontWeight: 700, padding: '10px 0', outline: 'none' }}
                       />
                    </div>
                 </div>
                 </div>
              </div>

              <div style={{ marginTop: '40px', display: 'flex', gap: '15px' }}>
                 <button type="button" onClick={() => setIsPayoutDrawerOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>ABORT</button>
                 <button type="submit" disabled={isSavingPayout} style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>
                   {isSavingPayout ? 'COMMITTING...' : 'CONFIRM PAYOUT →'}
                 </button>
              </div>
           </form>
        </div>
      </div>
    </div>
  );

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
            <span style={{ cursor: 'pointer', opacity: billingViewMode === 'REFERRAL_CUTS' ? 1 : 0.4, color: '#e11d48' }} onClick={() => setBillingViewMode('REFERRAL_CUTS')}>REFERRAL HUB 💸</span>
            <span style={{ opacity: 0.2 }}>|</span>
            <span style={{ cursor: 'pointer', opacity: billingViewMode === 'ANALYTICS' ? 1 : 0.4, color: '#0f52ba' }} onClick={() => setBillingViewMode('ANALYTICS')}>ANALYTICS HUB 📊</span>
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
              <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
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
               ⚡ EXPORT FISCAL DATA
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
                 {isSyncing ? 'SYNCING...' : '🔄 SYNC LOCAL'}
               </button>
             )}
             <button 
               onClick={() => setIsNewInvoiceDrawerOpen(true)}
               style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', background: '#0f52ba', color: 'white', fontWeight: 800, fontSize: '11px', cursor: 'pointer', boxShadow: '0 8px 20px rgba(15, 82, 186, 0.2)' }}
             >
               + NEW MANUAL INVOICE
             </button>
          </div>
        </div>
      </div>

      {billingViewMode === 'EXPENSES' && (
        <div className="expenses-main" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px', animation: 'fadeIn 0.3s' }}>
           {/* KPI MATRIX */}
           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
             <div className="kpi-card" style={{ background: '#fff1f2', padding: '25px', borderRadius: '24px', border: '1px solid #fecdd3', boxShadow: '0 4px 20px rgba(225,29,72,0.05)' }}>
               <p style={{ fontSize: '11px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', marginBottom: '15px' }}>TOTAL EXPENDITURE</p>
               <div style={{ fontSize: '28px', fontWeight: 950, color: '#881337' }}>₹{outflowStats.totalOutflow.toLocaleString()}</div>
               <div style={{ marginTop: '10px', fontSize: '10px', color: '#e11d48', fontWeight: 800 }}>CUMULATIVE CASH OUTFLOW</div>
             </div>
             <div className="kpi-card" style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
               <p style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>OPERATIONAL COST</p>
               <div style={{ fontSize: '28px', fontWeight: 950, color: '#1e293b' }}>₹{outflowStats.operationalTotal.toLocaleString()}</div>
               <div style={{ marginTop: '10px', fontSize: '10px', color: '#64748b', fontWeight: 800 }}>UTILITIES & MAINTENANCE</div>
             </div>
             <div className="kpi-card" style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
               <p style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>STRATEGIC PAYOUTS</p>
               <div style={{ fontSize: '28px', fontWeight: 950, color: '#e11d48' }}>₹{outflowStats.referralTotal.toLocaleString()}</div>
               <div style={{ marginTop: '10px', fontSize: '10px', color: '#e11d48', fontWeight: 800 }}>{outflowStats.referralPercentage}% OF TOTAL SPEND</div>
             </div>
             <div className="kpi-card" style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
               <p style={{ fontSize: '11px', fontWeight: 950, color: '#64748b', letterSpacing: '1px', marginBottom: '15px' }}>TODAY'S CASH BURN</p>
               <div style={{ fontSize: '28px', fontWeight: 950, color: '#0f172a' }}>₹{outflowStats.todayOutflow.toLocaleString()}</div>
               <div style={{ marginTop: '10px', fontSize: '10px', color: '#64748b', fontWeight: 800 }}>REAL-TIME OUTFLOW</div>
             </div>
           </div>

           <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px' }}>
              <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>TEMPORAL_SCOPE:</span>
                  <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    {['TODAY', 'PAST', 'ALL', 'CUSTOM'].map(t => (
                      <button 
                        key={t}
                        onClick={() => setTimeFilter(t)}
                        style={{ 
                          padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                          background: timeFilter === t ? '#dc2626' : 'transparent',
                          color: timeFilter === t ? 'white' : '#64748b',
                          cursor: 'pointer', transition: 'all 0.2s'
                        }}
                      >{t}</button>
                    ))}
                  </div>
                </div>

                {timeFilter === 'CUSTOM' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', animation: 'fadeIn 0.2s' }}>
                    <input 
                      type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                      style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 700 }}
                    />
                    <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>TO</span>
                    <input 
                      type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                      style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 700 }}
                    />
                  </div>
                )}
              </div>

              <button 
                onClick={() => { 
                  setEditExpense({ 
                    description: '', category: 'Maintenance', amount: 0, taxAmount: 0,
                    transactionDate: TODAY, paymentMode: 'Cash', referenceNumber: '',
                    vendorName: '', status: 'Paid'
                  }); 
                  setIsExpenseDrawerOpen(true); 
                }}
                style={{ padding: '10px 20px', borderRadius: '12px', border: 'none', background: '#dc2626', color: 'white', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}
              >+ LOG OPERATIONAL EXPENSE</button>
            </div>
                 <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f8fafc' }}>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>DATE</th>
                        <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>DESCRIPTION</th>
                        <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>CATEGORY</th>
                        <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>AMOUNT</th>
                        <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOutflow.map(exp => (
                        <tr key={exp.id} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                          <td style={{ padding: '20px 30px', fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>{exp.date ? new Date(exp.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</td>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>{exp.description}</div>
                            <div style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8' }}>{(exp.name || 'N/A').toUpperCase()}</div>
                          </td>
                          <td style={{ padding: '20px 30px' }}>
                            <span style={{ 
                              fontSize: '10px', fontWeight: 950, color: 'white', 
                              background: exp.category === 'Referral' ? '#e11d48' : '#dc2626', 
                              padding: '5px 12px', borderRadius: '8px' 
                            }}>{(exp.category || 'General').toUpperCase()}</span>
                          </td>
                          <td style={{ padding: '20px 30px', textAlign: 'right', fontSize: '14px', fontWeight: 950, color: '#dc2626' }}>₹{(Number(exp.amount) || 0).toLocaleString()}</td>
                          <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                            {exp.type === 'OPERATIONAL' || exp.type === 'LEGACY' ? (
                              <button 
                                onClick={() => handleDeleteExpense(exp.id)}
                                style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', background: '#fee2e2', color: '#ef4444', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}
                              >DELETE</button>
                            ) : (
                              <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>LOCKED</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {globalOutflow.length === 0 && (
                        <tr><td colSpan="5" style={{ padding: '50px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>No expenditure records found.</td></tr>
                      )}
                    </tbody>
                 </table>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                 <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
                    <h3 style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b', letterSpacing: '1px', marginBottom: '20px' }}>CATEGORY_DISTRIBUTION_MATRIX</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                       {outflowStats.categoryBreakdown.map(cat => (
                          <div key={cat.category}>
                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 900, color: '#64748b' }}>{cat.category.toUpperCase()}</span>
                                <span style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>₹{cat.amount.toLocaleString()}</span>
                             </div>
                             <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                                <div style={{ width: `${cat.percentage}%`, height: '100%', background: cat.category === 'Referral' ? '#e11d48' : '#dc2626', borderRadius: '10px' }}></div>
                             </div>
                             <div style={{ textAlign: 'right', fontSize: '9px', fontWeight: 900, color: '#94a3b8', marginTop: '4px' }}>{cat.percentage}% OF TOTAL OUTFLOW</div>
                          </div>
                       ))}
                    </div>
                 </div>

                 <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: '24px', padding: '30px', color: 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                       <span style={{ fontSize: '24px' }}>📉</span>
                       <h3 style={{ fontSize: '14px', fontWeight: 950, letterSpacing: '1px' }}>OUTFLOW_INTELLIGENCE</h3>
                    </div>
                    <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6', marginBottom: '20px' }}>
                      Your strategic referral payouts account for <strong>{outflowStats.referralPercentage}%</strong> of the total center expenditure. 
                      Operational costs are currently <strong>₹{outflowStats.operationalTotal.toLocaleString()}</strong>.
                    </p>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' }}>
                       <div style={{ fontSize: '10px', fontWeight: 950, color: '#3b82f6', letterSpacing: '1px', marginBottom: '10px' }}>FISCAL_ADVISORY</div>
                       <div style={{ fontSize: '11px', color: '#f8fafc', fontStyle: 'italic' }}>"Maintaining referral cuts below 25% of total revenue is recommended for optimal clinical margin."</div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {billingViewMode === 'INVOICES' && (
        <div className="invoices-main" style={{ animation: 'fadeIn 0.3s' }}>
          {/* Filter Matrix Controls */}
          <div className="filter-matrix" style={{ display: 'flex', gap: '30px', marginBottom: '30px', background: '#f1f5f9', padding: '15px 25px', borderRadius: '18px', border: '1px solid #e2e8f0', alignItems: 'center' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>TEMPORAL_FILTER:</span>
                <div style={{ display: 'flex', background: 'white', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                   {['TODAY', 'PAST', 'ALL', 'CUSTOM'].map(t => (
                     <button 
                      key={t}
                      onClick={() => setTimeFilter(t)}
                      style={{ 
                        padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                        background: timeFilter === t ? 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)' : 'transparent',
                        color: timeFilter === t ? 'white' : '#64748b',
                        cursor: 'pointer', transition: 'all 0.2s'
                      }}
                     >{t}</button>
                   ))}
                </div>
                {timeFilter === 'CUSTOM' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.2s' }}>
                     <input 
                       type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                       style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}
                     />
                     <input 
                       type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                       style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}
                     />
                  </div>
                )}
             </div>

             <div style={{ width: '1px', height: '30px', background: '#cbd5e1' }}></div>

             <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>STATUS_PROTOCOL:</span>
                <div style={{ display: 'flex', background: 'white', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                   {['ALL', 'PAID', 'PENDING'].map(s => (
                     <button 
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      style={{ 
                        padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                        background: statusFilter === s ? '#0f52ba' : 'transparent',
                        color: statusFilter === s ? 'white' : '#64748b',
                        cursor: 'pointer', transition: 'all 0.2s'
                      }}
                     >{s}</button>
                   ))}
                </div>
             </div>

             <div style={{ width: '1px', height: '30px', background: '#cbd5e1' }}></div>

             <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>MODALITY_HUB:</span>
                <div style={{ display: 'flex', background: 'white', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                   {['ALL', 'MRI', 'CT', 'X-RAY', 'USG'].map(m => (
                     <button 
                      key={m}
                      onClick={() => setModalityFilter(m)}
                      style={{ 
                        padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                        background: modalityFilter === m ? '#0f52ba' : 'transparent',
                        color: modalityFilter === m ? 'white' : '#64748b',
                        cursor: 'pointer', transition: 'all 0.2s'
                      }}
                     >{m}</button>
                   ))}
                </div>
             </div>

             {/* Stats Summary Bubble */}
             <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>MATCHING_RECORDS:</span>
                <span style={{ background: '#0f52ba', color: 'white', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 950 }}>{filteredInvoices.length}</span>
             </div>
          </div>

          {/* KPI HUD */}
          <div className="kpi-grid" style={{ 
            display: 'grid', 
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)', 
            gap: '25px', 
            marginBottom: '40px' 
          }}>
            <div className="kpi-card" style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>TOTAL REVENUE</p>
              <div style={{ fontSize: '28px', fontWeight: 950, color: '#1a1a2e' }}>₹{liveStats.totalRevenue.toLocaleString()}</div>
              <div style={{ marginTop: '10px', fontSize: '10px', color: '#2ecc71', fontWeight: 800 }}>MATCHING CURRENT PROTOCOL</div>
            </div>
            <div className="kpi-card" style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>PENDING UNPAID</p>
              <div style={{ fontSize: '28px', fontWeight: 950, color: '#f39c12' }}>₹{liveStats.pendingRevenue.toLocaleString()}</div>
              <div style={{ marginTop: '10px', fontSize: '10px', color: '#f39c12', fontWeight: 800 }}>{liveStats.pendingCount} INVOICES OUTSTANDING</div>
            </div>
            <div className="kpi-card" style={{ background: '#f0fdf4', padding: '25px', borderRadius: '24px', border: '1px solid #dcfce7', boxShadow: '0 4px 20px rgba(22,101,52,0.05)' }}>
              <p style={{ fontSize: '11px', fontWeight: 950, color: '#166534', letterSpacing: '1px', marginBottom: '15px' }}>NET PROFIT (ESTIMATED)</p>
              <div style={{ fontSize: '28px', fontWeight: 950, color: '#14532d' }}>₹{liveStats.netProfit.toLocaleString()}</div>
              <div style={{ marginTop: '10px', fontSize: '10px', color: '#16a34a', fontWeight: 800 }}>BASED ON MISSIONS IN SCOPE</div>
            </div>
            <div className="kpi-card" style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>TOTAL DISCOUNTS</p>
              <div style={{ fontSize: '28px', fontWeight: 950, color: '#ef4444' }}>₹{liveStats.totalDiscount.toLocaleString()}</div>
              <div style={{ marginTop: '10px', fontSize: '10px', color: '#ef4444', fontWeight: 800 }}>AGGREGATED CONCESSIONS</div>
            </div>
            <div className="kpi-card" style={{ background: '#fff1f2', padding: '25px', borderRadius: '24px', border: '1px solid #fecdd3', boxShadow: '0 4px 20px rgba(225,29,72,0.05)' }}>
              <p style={{ fontSize: '11px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', marginBottom: '15px' }}>TOTAL REFERRAL CUTS</p>
              <div style={{ fontSize: '28px', fontWeight: 950, color: '#881337' }}>₹{liveStats.totalCommission.toLocaleString()}</div>
              <div style={{ marginTop: '10px', fontSize: '10px', color: '#e11d48', fontWeight: 800 }}>AGGREGATED STRATEGIC OUTFLOW</div>
            </div>
          </div>

          <div className="content-main" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
            <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
               <h3 style={{ fontSize: '14px', fontWeight: 950, marginBottom: '25px', letterSpacing: '1px' }}>GLOBAL TRANSACTION LEDGER</h3>
               <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                 <thead>
                   <tr style={{ textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                     <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>INVOICE_ID</th>
                     <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>PATIENT_ENTITY</th>
                     <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>TIMESTAMP</th>
                     <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#1e293b', letterSpacing: '1px', background: '#f8fafc' }}>GROSS_TOTAL</th>
                     <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#ef4444', letterSpacing: '1px', background: '#fff1f2' }}>DISCOUNT</th>
                     <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', background: '#f0f4ff' }}>NET_PAYABLE</th>
                     <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>REFERRAL_CUT</th>
                     <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#166534', letterSpacing: '1px', background: '#f0fdf4' }}>NET_INCOME</th>
                     <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>STATUS</th>
<th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', textAlign: 'right' }}>ACTIONS</th>
                   </tr>
                 </thead>
                 <tbody>
                   {paginatedInvoices.map(inv => (
                     <tr key={inv.invoiceId} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                       <td style={{ padding: '20px 10px', fontSize: '12px', fontWeight: 900, color: '#0f52ba', fontFamily: 'monospace' }}>{inv?.displayId || 'N/A'}</td>
                       <td style={{ padding: '20px 10px', fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>{(inv?.patientName || 'UNKNOWN').toUpperCase()}</td>
                       <td style={{ padding: '20px 10px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{inv?.createdAt ? new Date(inv.createdAt).toLocaleString() : 'N/A'}</td>
                       <td style={{ padding: '20px 10px', fontSize: '13px', fontWeight: 700, color: '#64748b', background: '#f8fafc' }}>₹{(inv.grossAmount || 0).toLocaleString()}</td>
                       <td style={{ padding: '20px 10px', fontSize: '13px', fontWeight: 950, color: '#ef4444', background: '#fff1f2' }}>{(inv?.discountAmount || 0) > 0 ? `-₹${(inv.discountAmount || 0).toLocaleString()}` : '—'}</td>
                       <td style={{ padding: '20px 10px', fontSize: '14px', fontWeight: 950, color: '#0f52ba', background: '#f0f4ff' }}>₹{(inv?.totalAmount || 0).toLocaleString()}</td>
                       <td style={{ padding: '20px 10px' }}>
                           {(Number(inv?.commissionAmount) || 0) > 0 ? (
                             <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '13px', fontWeight: 950, color: '#e11d48' }}>₹{(Number(inv?.commissionAmount) || 0).toLocaleString()}</span>
                                <span style={{ fontSize: '8px', fontWeight: 800, color: '#e11d48', opacity: 0.7 }}>LOGGED_PAYOUT</span>
                             </div>
                           ) : (
                             <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 700 }}>—</span>
                           )}
                       </td>
                       <td style={{ padding: '20px 10px', fontSize: '14px', fontWeight: 950, color: '#166534', background: '#f0fdf4' }}>₹{(Number(inv?.totalAmount || 0) - (Number(inv?.commissionAmount) || 0)).toLocaleString()}</td>
                       <td style={{ padding: '20px 10px' }}>
                          <span style={{ 
                            padding: '6px 12px', borderRadius: '8px', fontSize: '9px', fontWeight: 950,
                            background: inv?.status === 'PAID' ? '#ecfdf5' : '#fff7ed',
                            color: inv?.status === 'PAID' ? '#059669' : '#ea580c'
                          }}>
                            {inv?.status || 'PENDING'}
                          </span>
                       </td>
                       <td style={{ padding: '20px 10px', textAlign: 'right', display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button 
                            onClick={() => {
                               const cutAmount = Math.round((inv.totalAmount || 0) * 0.2);
                               // Multi-stage identity resolution
                               let refId = inv.referrerId;
                               if (!refId && inv.referrerName) {
                                  const match = referrers.find(r => r.name?.toLowerCase() === (inv.referrerName || '').toLowerCase());
                                  if (match) refId = match.referrerId || match.id;
                               }

                               setEditPayout({
                                 commissionId: '',
                                 referrerId: refId || '',
                                 referrerName: inv.referrerName || 'DIRECT',
                                 amount: cutAmount || 0,
                                 modality: inv.modality || 'MRI', 
                                 remarks: `Commission for Mission ${inv.displayId} (${inv.patientName})`,
                                 invoiceId: inv.displayId,
                                 status: 'UNPAID'
                               });
                               setIsPayoutDrawerOpen(true);
                            }}
                             disabled={recordedPayouts.has(inv.displayId)}
                             style={{ 
                               padding: '8px 12px', borderRadius: '10px', border: 'none', 
                               background: recordedPayouts.has(inv.displayId) ? '#f1f5f9' : '#fff1f2', 
                               color: recordedPayouts.has(inv.displayId) ? '#94a3b8' : '#e11d48', 
                               fontSize: '10px', fontWeight: 950, 
                               cursor: recordedPayouts.has(inv.displayId) ? 'default' : 'pointer', 
                               boxShadow: recordedPayouts.has(inv.displayId) ? 'none' : '0 2px 5px rgba(225,29,72,0.1)' 
                             }} >{recordedPayouts.has(inv.displayId) ? 'PAID ✅' : 'CUT 💸'}</button>
                           <button 
                             onClick={() => handlePrintA4(inv)}
                             title="Print A4 Invoice"
                             style={{ padding: '8px', borderRadius: '8px', border: '1px solid #0f52ba', background: 'white', color: '#0f52ba', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                           >📄</button>
                           <button 
                             onClick={() => handlePrintThermal(inv)}
                             title="Print Thermal Receipt"
                             style={{ padding: '8px', borderRadius: '8px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                           >📠</button>
                           <button 
                             onClick={() => handlePrintReceipt(inv)}
                             title="Print Payment Receipt"
                             style={{ padding: '8px', borderRadius: '8px', border: '1px solid #10b981', background: 'white', color: '#10b981', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                           >🧾</button>
                           <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 5px' }}></div>
                          <button 
                            onClick={() => { setSelectedInvoice(inv); setIsInvoiceDrawerOpen(true); }}
                            style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#0f52ba', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}
                          >PAYMENT</button>
                          <button 
                            onClick={() => handleDeleteInvoice(inv.invoiceId)}
                            style={{ padding: '8px 12px', borderRadius: '10px', border: 'none', background: '#fee2e2', color: '#ef4444', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}
                          >DEL</button>
                       </td>
                     </tr>
                   ))}
                   {filteredInvoices.length === 0 && (
                     <tr>
                       <td colSpan="9" style={{ padding: '80px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>NO TRANSACTIONS DETECTED IN ACTIVE LEDGER</td>
                     </tr>
                   )}
                 </tbody>
               </table>
               {renderPagination()}
            </div>
          </div>
        </div>
      )}

      {billingViewMode === 'REFERRAL_CUTS' && (
        <div className="referral-cuts-main" style={{ animation: 'fadeIn 0.3s' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
              <div>
                 <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#1e293b' }}>REFERRAL PAYOUT LEDGER</h3>
                 <p style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Tracking all commissions and cuts for clinical partners.</p>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                 <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    {['TODAY', 'PAST', 'ALL', 'CUSTOM'].map(t => (
                      <button 
                        key={t}
                        onClick={() => setTimeFilter(t)}
                        style={{ 
                          padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                          background: timeFilter === t ? '#e11d48' : 'transparent',
                          color: timeFilter === t ? 'white' : '#64748b',
                          cursor: 'pointer', transition: 'all 0.2s'
                        }}
                      >{t}</button>
                    ))}
                 </div>

                 {timeFilter === 'CUSTOM' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.2s' }}>
                     <input 
                       type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                       style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}
                     />
                     <input 
                       type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                       style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}
                     />
                  </div>
                 )}

                 <div style={{ background: '#fff1f2', padding: '15px 25px', borderRadius: '16px', border: '1px solid #fecdd3', textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', fontWeight: 950, color: '#e11d48', marginBottom: '5px' }}>TOTAL PAYOUTS</div>
                    <div style={{ fontSize: '24px', fontWeight: 950, color: '#881337' }}>
                      ₹{(filteredReferralCuts || []).reduce((sum, cut) => sum + (Number(cut?.amount) || 0), 0).toLocaleString()}
                    </div>
                 </div>
              </div>
           </div>

           <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                 <thead style={{ background: '#fff1f2' }}>
                    <tr>
                       <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>PAYOUT_DATE</th>
                       <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>PARTNER (REFERRER)</th>
                       <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>DESCRIPTION / MISSION</th>
                       <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>REF_ID</th>
                       <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>PAYOUT_AMOUNT</th>
                       <th style={{ padding: '20px 30px', textAlign: 'center', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>STATUS</th>
                       <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>ACTION</th>
                    </tr>
                 </thead>
                 <tbody>
                    {filteredReferralCuts.length === 0 ? (
                       <tr><td colSpan="6" style={{ padding: '100px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>NO REFERRAL PAYOUTS DETECTED</td></tr>
                    ) : (
                       paginatedReferralCuts.map(cut => (
                          <tr key={cut?.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                             <td style={{ padding: '20px 30px', fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{cut?.date ? new Date(cut.date).toLocaleDateString() : 'N/A'}</td>
                             <td style={{ padding: '20px 30px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 950, color: '#e11d48' }}>{(cut?.name || 'DIRECT').toUpperCase()}</div>
                             </td>
                             <td style={{ padding: '20px 30px', fontSize: '12px', fontWeight: 700, color: '#64748b' }}>{cut?.description}</td>
                             <td style={{ padding: '20px 30px' }}>
                                <div style={{ padding: '4px 8px', background: '#f1f5f9', borderRadius: '6px', fontSize: '10px', fontWeight: 950, color: '#1e293b', display: 'inline-block', fontFamily: 'monospace' }}>{cut?.reference || 'N/A'}</div>
                             </td>
                             <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                                <div style={{ fontSize: '16px', fontWeight: 950, color: '#e11d48' }}>₹{(Number(cut?.amount) || 0).toLocaleString()}</div>
                             </td>
                             <td style={{ padding: '20px 30px', textAlign: 'center' }}>
                                <button 
                                  onClick={() => cut?.type === 'STRATEGIC' && handleToggleCommissionStatus(cut?.id, cut?.status)}
                                  disabled={cut?.type === 'LEGACY'}
                                  style={{ 
                                    padding: '6px 12px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                                    background: cut?.status === 'PAID' ? '#dcfce7' : '#fee2e2',
                                    color: cut?.status === 'PAID' ? '#166534' : '#991b1b',
                                    cursor: cut?.type === 'STRATEGIC' ? 'pointer' : 'default',
                                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
                                  }}
                                >
                                  {cut?.status || 'UNPAID'}
                                </button>
                             </td>
                             <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                                 {cut.type === 'LEGACY' ? (
                                    <button 
                                       onClick={() => handleDeleteExpense(cut.id)}
                                       style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#fee2e2', color: '#ef4444', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}
                                    >DELETE</button>
                                 ) : (
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                       <button 
                                          onClick={() => {
                                             setEditPayout({
                                               commissionId: cut.id,
                                               referrerId: cut.referrerId,
                                               referrerName: cut.name,
                                               amount: cut.amount,
                                               modality: (cut.description || '').match(/\[(.*?)\]/)?.[1] || 'MRI',
                                               remarks: (cut.description || '').includes(' - ') ? cut.description.split(' - ')[1] : '',
                                               invoiceId: cut.reference,
                                               status: cut.status
                                             });
                                             setIsPayoutDrawerOpen(true);
                                          }}
                                          style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#f0f4ff', color: '#0f52ba', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}
                                       >EDIT</button>
                                       <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>LOCKED</span>
                                    </div>
                                 )}
                             </td>
                          </tr>
                       ))
                    )}
                 </tbody>
              </table>
              <div style={{ padding: '20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'center' }}>
                  {Array.from({ length: Math.ceil(filteredReferralCuts.length / itemsPerPage) }).map((_, i) => (
                      <button key={i} onClick={() => setCurrentPage(i + 1)} style={{ padding: '5px 10px', margin: '0 2px', background: currentPage === i + 1 ? '#e11d48' : '#f1f5f9', color: currentPage === i + 1 ? 'white' : '#64748b', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>{i + 1}</button>
                  ))}
              </div>
           </div>
        </div>
      )}

      {billingViewMode === 'ANALYTICS' && matrix && (
        <div className="analytics-main" style={{ animation: 'fadeIn 0.3s' }}>
          {/* ANALYTICS CONTROL BAR */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', background: 'white', padding: '20px 30px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b' }}>FINANCIAL_TREND_ANALYSIS</h3>
                    <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Visualize performance across different temporal windows</p>
                  </div>
                  
                  <div style={{ height: '30px', width: '1px', background: '#e2e8f0' }}></div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>GLOBAL_SCOPE:</span>
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        {['TODAY', 'PAST', 'ALL', 'CUSTOM'].map(t => (
                          <button 
                            key={t}
                            onClick={() => setTimeFilter(t)}
                            style={{ 
                              padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                              background: timeFilter === t ? '#0f52ba' : 'transparent',
                              color: timeFilter === t ? 'white' : '#64748b',
                              cursor: 'pointer', transition: 'all 0.2s'
                            }}
                          >{t}</button>
                        ))}
                    </div>
                    {timeFilter === 'CUSTOM' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.2s' }}>
                        <input 
                          type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                          style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}
                        />
                        <input 
                          type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                          style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}
                        />
                      </div>
                    )}
                  </div>
              </div>
          </div>

          {/* LIVE SCOPE SUMMARY (DYNAMIC) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
              <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                  <p style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>SCOPE_GROSS_REVENUE</p>
                  <div style={{ fontSize: '24px', fontWeight: 950, color: '#1a1a2e' }}>₹{(liveStats?.totalGross || 0).toLocaleString()}</div>
                  <div style={{ marginTop: '10px', fontSize: '9px', color: '#64748b', fontWeight: 800 }}>AGGREGATE INVOICED VOLUME</div>
              </div>
              <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                  <p style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>SCOPE_CASH_COLLECTED</p>
                  <div style={{ fontSize: '24px', fontWeight: 950, color: '#059669' }}>₹{(liveStats?.totalRevenue || 0).toLocaleString()}</div>
                  <div style={{ marginTop: '10px', fontSize: '9px', color: '#059669', fontWeight: 800 }}>REALIZED LIQUIDITY</div>
              </div>
              <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                  <p style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>SCOPE_TOTAL_EXPENSES</p>
                  <div style={{ fontSize: '24px', fontWeight: 950, color: '#dc2626' }}>₹{(outflowStats?.totalOutflow || 0).toLocaleString()}</div>
                  <div style={{ marginTop: '10px', fontSize: '9px', color: '#dc2626', fontWeight: 800 }}>OPERATIONAL & REFERRAL OUTFLOW</div>
              </div>
              <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '25px', borderRadius: '24px', color: 'white', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.2)' }}>
                  <p style={{ fontSize: '10px', fontWeight: 950, color: 'rgba(255,255,255,0.5)', letterSpacing: '1px', marginBottom: '15px' }}>NET_SCOPE_MARGIN</p>
                  <div style={{ fontSize: '24px', fontWeight: 950 }}>₹{((liveStats?.totalRevenue || 0) - (outflowStats?.totalOutflow || 0)).toLocaleString()}</div>
                  <div style={{ marginTop: '10px', fontSize: '9px', color: (liveStats.totalRevenue - outflowStats.totalOutflow) >= 0 ? '#4ade80' : '#f87171', fontWeight: 800 }}>
                      {((liveStats.totalRevenue - outflowStats.totalOutflow) / (liveStats.totalRevenue || 1) * 100).toFixed(1)}% NET MARGIN
                  </div>
              </div>
          </div>

          {/* MODALITY CONTRIBUTION SECTION */}
          <div style={{ background: 'white', borderRadius: '32px', border: '1px solid #e2e8f0', padding: '40px', boxShadow: '0 20px 50px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px' }}>
                  <div>
                      <h3 style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b', letterSpacing: '1px' }}>MODALITY_REVENUE_CONTRIBUTION</h3>
                      <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, marginTop: '4px' }}>Strategic breakdown of income by acquisition modality</p>
                  </div>
                  <div style={{ padding: '10px 20px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #f1f5f9', fontSize: '11px', fontWeight: 950, color: '#0f52ba' }}>
                      TOTAL_ACTIVE_CHANNELS: {matrix?.modalityBreakdown?.length || 0}
                  </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '2px solid #f1f5f9' }}>
                              <th style={{ padding: '20px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>MODALITY</th>
                              <th style={{ padding: '20px 10px', fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px' }}>PERIOD_YIELD (₹)</th>
                              <th style={{ padding: '20px 10px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px' }}>CONTRIBUTION</th>
                          </tr>
                      </thead>
                      <tbody>
                          {matrix?.modalityBreakdown?.filter(item => item).map((item, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #f8fafc', transition: 'all 0.2s' }}>
                                  <td style={{ padding: '25px 10px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                          <div style={{ width: '36px', height: '36px', borderRadius: '12px', background: '#f0f3fd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                                              {item.modality === 'MRI' ? '🧠' : item.modality === 'CT' ? '🧬' : item.modality === 'X-RAY' ? '🦴' : '📡'}
                                          </div>
                                          <span style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b' }}>{item.modality}</span>
                                      </div>
                                  </td>
                                  <td style={{ padding: '25px 10px', fontSize: '16px', fontWeight: 950, color: '#1e293b' }}>₹{(item.rangeRevenue || 0).toLocaleString()}</td>
                                  <td style={{ padding: '25px 10px', textAlign: 'right' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                          <span style={{ fontSize: '14px', fontWeight: 950, color: '#0f52ba' }}>{(item.contributionPercentage || 0)}%</span>
                                          <div style={{ width: '120px', height: '6px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                                              <div style={{ width: `${(item.contributionPercentage || 0)}%`, height: '100%', background: 'linear-gradient(90deg, #0f52ba, #60a5fa)', borderRadius: '10px' }}></div>
                                          </div>
                                      </div>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
        </div>
      )}

      {isInvoiceDrawerOpen && renderInvoiceDrawer()}
      {isNewInvoiceDrawerOpen && renderNewInvoiceDrawer()}
      {isExportDrawerOpen && renderExportDrawer()}
      {isExpenseDrawerOpen && renderExpenseDrawer()}
      {isPayoutDrawerOpen && renderPayoutDrawer()}
    </div>
  );
}
